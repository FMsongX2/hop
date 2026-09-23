import { WasmBridge } from '@/upstream/core';
import type { DocumentInfo } from '@/upstream/core';
import { showHwpPasswordDialog } from '@/upstream/ui';
import { remove, stat } from '@tauri-apps/plugin-fs';
import { finiteFileSize, readFileInChunks, writeFileInChunks } from './chunked-fs';

type DocumentFormat = 'hwp' | 'hwpx';

const PASSWORD_REQUIRED_MESSAGE = '비밀번호가 필요한 암호 문서';
const PASSWORD_REJECTED_MESSAGE = '비밀번호가 일치하지 않거나 암호화 데이터가 손상되었습니다';
const PASSWORD_RETRY_MESSAGE = '암호가 일치하지 않거나 문서가 손상되었습니다. 다시 입력하세요.';

/** 암호 문서 열기 오류를 입력값이 섞이지 않은 일반 안내로 바꾼다. (#98) */
function passwordOpenFailure(error: unknown): Error {
  const message = String(error);
  if (message.includes('지원하지 않는 암호화 방식')) {
    return new Error('지원하지 않는 암호화 방식의 문서입니다. 지원되는 HWP3/HWP5 암호 문서만 열 수 있습니다.');
  }
  if (message.includes('DRM')) {
    return new Error('DRM으로 보호된 문서는 지원하지 않습니다.');
  }
  return new Error('암호화된 문서를 열 수 없습니다. 문서가 손상되었는지 확인하세요.');
}

interface NativeOpenResult {
  docId: string;
  fileName: string;
  sourcePath?: string | null;
  format: DocumentFormat;
  pageCount: number;
  revision: number;
  dirty: boolean;
  warnings: unknown[];
}

interface SourceFingerprint {
  len: number;
  modifiedMillis: number;
  contentHash: number;
}

interface ExternalModificationStatus {
  changed: boolean;
  sourcePath?: string | null;
  reason?: string | null;
}

export type DesktopUpdateState =
  | { status: 'idle' }
  | {
      status: 'available';
      version: string;
    }
  | {
      status: 'downloading';
      version: string;
      downloadedBytes: number;
      totalBytes?: number | null;
    }
  | {
      status: 'ready';
      version: string;
    }
  | {
      status: 'error';
      version: string;
      message: string;
    };

export interface DesktopSaveResult {
  docId: string;
  sourcePath?: string | null;
  format: DocumentFormat;
  revision: number;
  dirty: boolean;
  warnings: unknown[];
}

export interface RecentDocument {
  path: string;
  fileName: string;
}

export interface DesktopLoadPayload {
  docInfo: DocumentInfo;
  message: string;
}

export interface DesktopBridgeApi {
  openDocumentFromDialog(): Promise<DesktopLoadPayload | null>;
  openDocumentByPath(path: string): Promise<DesktopLoadPayload | null>;
  takePendingOpenPaths(): Promise<string[]>;
  createNewDocumentAsync(): Promise<DesktopLoadPayload | null>;
  createNewWindow(): Promise<string>;
  saveDocumentFromCommand(): Promise<DesktopSaveResult | null>;
  saveDocumentAsFromCommand(): Promise<DesktopSaveResult | null>;
  exportPdfFromCommand(): Promise<string | null>;
  printCurrentWebview(): Promise<void>;
  destroyCurrentWindow(): Promise<void>;
  cancelAppQuit(): Promise<void>;
  revealInFolder(): Promise<void>;
  listRecentDocuments(): Promise<RecentDocument[]>;
  clearRecentDocuments(): Promise<void>;
  renderDocumentPreview(path: string): Promise<string>;
  getUpdateState(): Promise<DesktopUpdateState>;
  startUpdateInstall(): Promise<void>;
  restartToApplyUpdate(): Promise<void>;
  hasUnsavedChanges(): boolean;
  markDocumentDirty(): void;
  confirmWindowClose(): Promise<boolean>;
}

export class TauriBridge extends WasmBridge implements DesktopBridgeApi {
  private docId: string | null = null;
  private sourcePath: string | null = null;
  private sourceFormat: DocumentFormat = 'hwp';
  private revision = 0;
  private dirty = false;

  /** 한글처럼 저장 여부를 먼저 묻고 나서 파일 선택 대화상자를 연다. */
  async openDocumentFromDialog(): Promise<DesktopLoadPayload | null> {
    if (!(await this.confirmReadyForDocumentReplacement())) return null;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      filters: [{ name: 'HWP/HWPX 문서', extensions: ['hwp', 'hwpx'] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    return this.openDocumentByPath(selected, { skipUnsavedGuard: true });
  }

  async openDocumentByPath(
    path: string,
    options: { skipUnsavedGuard?: boolean } = {},
  ): Promise<DesktopLoadPayload | null> {
    if (!options.skipUnsavedGuard && !(await this.confirmReadyForDocumentReplacement())) return null;

    await this.invoke<void>('prepare_document_open', { path });
    const { bytes, sourceFingerprint } = await this.readFileForOpen(path);
    const result = await this.invoke<NativeOpenResult>('open_document_tracking', {
      path,
      sourceFingerprint,
    });
    const previousDocId = this.docId;
    try {
      const info = await this.loadDocumentForOpen(bytes, result.fileName);
      if (!info) {
        await this.closeNativeDocument(result.docId);
        return null;
      }
      this.applyNativeOpenResult(result, this.normalizedSourceFormat(super.getSourceFormat()));
      await this.noteFinderRecentDocument(path);
      await this.recordRecentDocument(path);
      await this.closeReplacedDocument(previousDocId, result.docId);
      return {
        docInfo: info,
        message: `${result.fileName} — ${info.pageCount}페이지`,
      };
    } catch (error) {
      await this.closeNativeDocument(result.docId);
      throw error;
    }
  }

  async takePendingOpenPaths(): Promise<string[]> {
    return this.invoke<string[]>('take_pending_open_paths');
  }

  async createNewDocumentAsync(): Promise<DesktopLoadPayload | null> {
    if (!(await this.confirmReadyForDocumentReplacement())) return null;

    const result = await this.invoke<NativeOpenResult>('create_document');
    const previousDocId = this.docId;
    try {
      const info = super.createNewDocument();
      this.applyNativeOpenResult(result);
      await this.closeReplacedDocument(previousDocId, result.docId);
      return {
        docInfo: info,
        message: `새 문서.hwp — ${info.pageCount}페이지`,
      };
    } catch (error) {
      await this.closeNativeDocument(result.docId);
      throw error;
    }
  }

  async createNewWindow(): Promise<string> {
    return this.invoke<string>('create_editor_window');
  }

  getSourceFormat(): string {
    return this.sourceFormat;
  }

  /** 원본 형식(HWP/HWPX) 그대로 같은 경로에 저장한다. 경로가 없으면 다른 이름으로 저장으로 넘긴다. */
  async saveDocumentFromCommand(): Promise<DesktopSaveResult | null> {
    const docId = this.ensureDocumentLoaded();
    if (!this.sourcePath) {
      return this.saveDocumentAsFromCommand();
    }
    return this.saveDocumentThroughStaging(docId, null, this.sourceFormat);
  }

  /** 저장 대화상자에서 고른 확장자(.hwp/.hwpx)가 저장 형식을 정한다. 확장자가 없으면 원본 형식을 따른다. */
  async saveDocumentAsFromCommand(): Promise<DesktopSaveResult | null> {
    const docId = this.ensureDocumentLoaded();
    const selected = await this.selectSavePath(this.suggestedDocumentName(), this.documentSaveFilters());
    if (!selected) return null;
    const targetPath = this.withDocumentExtension(selected);
    return this.saveDocumentThroughStaging(docId, targetPath, this.documentFormatOfPath(targetPath));
  }

  async exportPdfFromCommand(): Promise<string | null> {
    this.ensureDocumentLoaded();
    const targetPath = await this.selectSavePath(this.suggestedPdfName(), [{ name: 'PDF 문서', extensions: ['pdf'] }]);
    if (!targetPath) return null;
    const finalPath = this.withExtension(targetPath, 'pdf');
    const stagedPath = await this.invoke<string>('prepare_staged_hwp_pdf_export', {
      targetPath: finalPath,
    });
    try {
      await this.writeCurrentHwpToPath(stagedPath);
      return await this.invoke<string>('export_pdf_from_hwp_path', {
        stagedPath,
        targetPath: finalPath,
        pageRange: null,
        openAfter: true,
      });
    } finally {
      await remove(stagedPath).catch(() => undefined);
    }
  }

  async printCurrentWebview(): Promise<void> {
    await this.invoke<void>('print_webview');
  }

  async destroyCurrentWindow(): Promise<void> {
    await this.invoke<void>('destroy_current_window');
  }

  async cancelAppQuit(): Promise<void> {
    await this.invoke<void>('cancel_app_quit');
  }

  async revealInFolder(): Promise<void> {
    if (!this.sourcePath) return;
    await this.invoke<void>('reveal_in_folder', { path: this.sourcePath });
  }

  async listRecentDocuments(): Promise<RecentDocument[]> {
    return this.invoke<RecentDocument[]>('list_recent_documents');
  }

  async clearRecentDocuments(): Promise<void> {
    await this.invoke<void>('clear_recent_documents');
  }

  async renderDocumentPreview(path: string): Promise<string> {
    return this.invoke<string>('render_document_preview', { path });
  }

  async getUpdateState(): Promise<DesktopUpdateState> {
    return this.invoke<DesktopUpdateState>('get_update_state');
  }

  async startUpdateInstall(): Promise<void> {
    await this.invoke<void>('start_update_install');
  }

  async restartToApplyUpdate(): Promise<void> {
    await this.invoke<void>('restart_to_apply_update');
  }

  hasUnsavedChanges(): boolean {
    return Boolean(this.docId && this.dirty);
  }

  markDocumentDirty(): void {
    if (!this.docId || this.dirty) return;
    this.dirty = true;
    void this.invoke<void>('mark_document_dirty', { docId: this.docId }).catch((error: unknown) => {
      console.warn('[TauriBridge] native dirty state update failed:', error);
    });
    this.updateDocumentTitle();
  }

  async confirmWindowClose(): Promise<boolean> {
    const canClose = await this.confirmReadyForDocumentReplacement();
    if (canClose) await this.releaseCurrentNativeDocument();
    return canClose;
  }

  /** 일반 열기를 먼저 시도하고, 암호 문서면 upstream 암호 대화상자로 재시도한다. 취소하면 null. (#98) */
  private async loadDocumentForOpen(bytes: Uint8Array, fileName: string): Promise<DocumentInfo | null> {
    try {
      return super.loadDocument(bytes, fileName);
    } catch (error) {
      if (!String(error).includes(PASSWORD_REQUIRED_MESSAGE)) throw error;
      return this.loadPasswordProtectedDocument(bytes, fileName);
    }
  }

  /** 암호가 틀리면 재입력을 안내하고, 지원하지 않는 암호화·DRM은 일반 안내 오류로 던진다. */
  private async loadPasswordProtectedDocument(
    bytes: Uint8Array,
    fileName: string,
  ): Promise<DocumentInfo | null> {
    let retryMessage: string | undefined;
    while (true) {
      const password = await showHwpPasswordDialog(fileName, retryMessage);
      if (password === null) return null;
      try {
        return super.loadDocumentWithPassword(bytes, password, fileName);
      } catch (error) {
        if (String(error).includes(PASSWORD_REJECTED_MESSAGE)) {
          retryMessage = PASSWORD_RETRY_MESSAGE;
          continue;
        }
        throw passwordOpenFailure(error);
      }
    }
  }

  private async invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, args);
  }

  private async closeNativeDocument(docId: string): Promise<void> {
    try {
      await this.invoke<void>('close_document', { docId });
    } catch (error) {
      console.warn('[TauriBridge] native document cleanup failed:', error);
    }
  }

  private async recordRecentDocument(path: string): Promise<void> {
    await this.invoke<void>('record_recent_document', { path }).catch((error: unknown) => {
      console.warn('[TauriBridge] recent document update failed:', error);
    });
  }

  private async noteFinderRecentDocument(path: string): Promise<void> {
    await this.invoke<void>('note_finder_recent_document', { path }).catch((error: unknown) => {
      console.warn('[TauriBridge] Finder recent document update failed:', error);
    });
  }

  private async closeReplacedDocument(previousDocId: string | null, nextDocId: string): Promise<void> {
    if (previousDocId && previousDocId !== nextDocId) {
      await this.closeNativeDocument(previousDocId);
    }
  }

  private async releaseCurrentNativeDocument(): Promise<void> {
    if (this.docId) {
      await this.closeNativeDocument(this.docId);
    }
    this.docId = null;
    this.sourcePath = null;
    this.dirty = false;
    this.updateDocumentTitle();
  }

  private ensureDocumentLoaded(): string {
    if (!this.docId) throw new Error('문서가 로드되지 않았습니다');
    return this.docId;
  }

  private async selectSavePath(
    defaultPath: string,
    filters: { name: string; extensions: string[] }[],
  ): Promise<string | null> {
    const { save } = await import('@tauri-apps/plugin-dialog');
    return save({ defaultPath, filters });
  }

  /** 원본 형식을 첫 필터로 두어 저장 대화상자가 같은 형식을 기본으로 고르게 한다. */
  private documentSaveFilters(): { name: string; extensions: string[] }[] {
    const hwp = { name: 'HWP 문서', extensions: ['hwp'] };
    const hwpx = { name: 'HWPX 문서', extensions: ['hwpx'] };
    return this.sourceFormat === 'hwpx' ? [hwpx, hwp] : [hwp, hwpx];
  }

  /** staging 파일에 형식에 맞는 바이트를 쓰고, 네이티브가 재파싱 검증 후 원자적으로 교체한다. */
  private async saveDocumentThroughStaging(
    docId: string,
    targetPath: string | null,
    format: DocumentFormat,
  ): Promise<DesktopSaveResult | null> {
    const finalPath = targetPath ?? this.sourcePath;
    if (!finalPath) throw new Error('새 문서는 저장 경로가 필요합니다');

    const allowExternalOverwrite = await this.confirmExternalOverwriteIfNeeded(docId, finalPath);
    if (allowExternalOverwrite === null) return null;

    const stagedPath = await this.invoke<string>('prepare_staged_hwp_save', { targetPath: finalPath });
    try {
      await this.writeCurrentDocumentToPath(stagedPath, format);
      const result = await this.invoke<DesktopSaveResult>('commit_staged_hwp_save', {
        docId,
        stagedPath,
        targetPath: finalPath,
        expectedRevision: this.revision,
        allowExternalOverwrite,
      });
      this.applyNativeSaveResult(result);
      await this.noteFinderRecentDocument(finalPath);
      return result;
    } finally {
      await remove(stagedPath).catch(() => undefined);
    }
  }

  private async confirmExternalOverwriteIfNeeded(
    docId: string,
    targetPath: string | null,
  ): Promise<boolean | null> {
    const effectivePath = targetPath ?? this.sourcePath;
    const status = await this.invoke<ExternalModificationStatus>('check_external_modification', {
      docId,
      targetPath: effectivePath,
    });
    if (!status.changed) return false;

    const { message } = await import('@tauri-apps/plugin-dialog');
    const overwriteLabel = '덮어쓰기';
    const cancelLabel = '저장 취소';
    const result = await message(
      [
        '원본 파일이 HOP 밖에서 변경되었습니다.',
        status.sourcePath ? `파일: ${status.sourcePath}` : '',
        status.reason ?? '',
        '',
        '그대로 저장하면 외부에서 변경된 내용이 사라질 수 있습니다.',
      ].filter(Boolean).join('\n'),
      {
        title: '외부 변경 감지',
        kind: 'warning',
        buttons: {
          yes: overwriteLabel,
          no: cancelLabel,
          cancel: '취소',
        },
      },
    );

    return result === overwriteLabel || result === 'Yes' ? true : null;
  }

  private async confirmReadyForDocumentReplacement(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) return true;

    const decision = await this.promptUnsavedChanges();
    if (decision === 'cancel') return false;
    if (decision === 'discard') return true;

    try {
      const result = await this.saveCurrentDocumentForSafety();
      return result !== null;
    } catch (error) {
      await this.showError('저장 실패', `문서를 저장하지 못했습니다.\n${error}`);
      return false;
    }
  }

  private async saveCurrentDocumentForSafety(): Promise<DesktopSaveResult | null> {
    return this.saveDocumentFromCommand();
  }

  private async promptUnsavedChanges(): Promise<'save' | 'discard' | 'cancel'> {
    const { message } = await import('@tauri-apps/plugin-dialog');
    const saveLabel = '저장';
    const discardLabel = '저장 안 함';
    const result = await message(
      `${this.fileName || '현재 문서'}의 변경 내용을 저장할까요?`,
      {
        title: '저장 확인',
        kind: 'warning',
        buttons: {
          yes: saveLabel,
          no: discardLabel,
          cancel: '취소',
        },
      },
    );

    if (result === saveLabel || result === 'Yes') return 'save';
    if (result === discardLabel || result === 'No') return 'discard';
    return 'cancel';
  }

  private async showError(title: string, text: string): Promise<void> {
    const { message } = await import('@tauri-apps/plugin-dialog');
    await message(text, {
      title,
      kind: 'error',
      buttons: { ok: '확인' },
    });
  }

  /** PDF 내보내기 staging은 항상 HWP 바이트를 쓴다. */
  private async writeCurrentHwpToPath(path: string): Promise<void> {
    await this.writeCurrentDocumentToPath(path, 'hwp');
  }

  private async writeCurrentDocumentToPath(path: string, format: DocumentFormat): Promise<void> {
    await writeFileInChunks(path, format === 'hwpx' ? super.exportHwpx() : super.exportHwp());
  }

  private withExtension(path: string, extension: string): string {
    const escaped = extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\.${escaped}$`, 'i').test(path) ? path : `${path}.${extension}`;
  }

  /** .hwp/.hwpx 확장자는 그대로 두고, 없으면 원본 형식 확장자를 붙인다. */
  private withDocumentExtension(path: string): string {
    return /\.(hwp|hwpx)$/i.test(path) ? path : `${path}.${this.sourceFormat}`;
  }

  private documentFormatOfPath(path: string): DocumentFormat {
    return /\.hwpx$/i.test(path) ? 'hwpx' : 'hwp';
  }

  private async readFileForOpen(path: string): Promise<{
    bytes: Uint8Array;
    sourceFingerprint?: SourceFingerprint;
  }> {
    const before = await stat(path);
    const { bytes, contentHash } = await readFileInChunks(path, finiteFileSize(before.size));
    const after = await stat(path);
    const beforeFingerprint = this.statFingerprint(before);
    const afterFingerprint = this.statFingerprint(after);
    if (
      beforeFingerprint &&
      afterFingerprint &&
      (beforeFingerprint.len !== afterFingerprint.len ||
        beforeFingerprint.modifiedMillis !== afterFingerprint.modifiedMillis)
    ) {
      throw new Error('파일을 읽는 중 변경되었습니다. 다시 시도하세요.');
    }
    return {
      bytes,
      sourceFingerprint: afterFingerprint
        ? {
            ...afterFingerprint,
            contentHash,
          }
        : undefined,
    };
  }

  private statFingerprint(
    info: Partial<{
      size: number;
      mtime: Date | null;
    }>,
  ): Pick<SourceFingerprint, 'len' | 'modifiedMillis'> | undefined {
    const size = finiteFileSize(info.size);
    const modifiedMillis = info.mtime instanceof Date ? info.mtime.getTime() : undefined;
    if (size === undefined || modifiedMillis === undefined || !Number.isFinite(modifiedMillis)) {
      return undefined;
    }
    return { len: size, modifiedMillis };
  }

  private normalizedSourceFormat(value: string): DocumentFormat {
    return value === 'hwpx' ? 'hwpx' : 'hwp';
  }

  private applyNativeOpenResult(result: NativeOpenResult, sourceFormat = result.format): void {
    this.docId = result.docId;
    this.sourcePath = result.sourcePath ?? null;
    this.sourceFormat = sourceFormat;
    this.revision = result.revision;
    this.dirty = result.dirty;
    this.fileName = result.fileName;
    this.updateDocumentTitle();
  }

  private applyNativeSaveResult(result: DesktopSaveResult): void {
    this.docId = result.docId;
    this.sourcePath = result.sourcePath ?? null;
    this.sourceFormat = result.format;
    this.revision = result.revision;
    this.dirty = result.dirty;
    if (this.sourcePath) {
      this.fileName = this.sourcePath.split(/[\\/]/).pop() || this.fileName;
    }
    this.updateDocumentTitle();
  }

  private suggestedDocumentName(): string {
    const name = this.fileName.replace(/\.(hwp|hwpx)$/i, '') || 'document';
    return `${name}.${this.sourceFormat}`;
  }

  private suggestedPdfName(): string {
    const name = this.fileName.replace(/\.(hwp|hwpx)$/i, '') || 'document';
    return `${name}.pdf`;
  }

  private updateDocumentTitle(): void {
    const name = this.docId ? this.fileName || '문서' : 'HOP';
    document.title = `${this.dirty ? '• ' : ''}${name} - HOP`;
  }
}
