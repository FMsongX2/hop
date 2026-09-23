// 도구 상자 라벨 표시 여부를 HOP 창 간 공유되는 localStorage에 보관하고 문서 루트 속성으로 적용함.
// CSS(styles/desktop-toolbar.css)와 보기 메뉴 체크 상태가 이 속성을 읽음. (#97)

const STORAGE_KEY = 'hop.toolbarLabelsHidden';
const ROOT_ATTRIBUTE = 'data-hop-toolbar-labels';
export const TOGGLE_TOOLBAR_LABELS_COMMAND = 'view:toggle-toolbar-labels';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** 저장된 설정을 읽는다. 저장소가 없거나 막혀 있으면 라벨을 보이는 것으로 본다. */
export function areToolbarLabelsHidden(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 설정을 저장한다. 저장 실패는 무시한다. */
export function setToolbarLabelsHidden(hidden: boolean, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, hidden ? '1' : '0');
  } catch {
    // 저장소를 쓸 수 없으면 현재 창에서만 적용된다.
  }
}

/** 루트 속성과 메뉴 항목의 체크 상태를 설정에 맞춘다. */
export function applyToolbarLabels(doc: Document, hidden: boolean): void {
  doc.documentElement.setAttribute(ROOT_ATTRIBUTE, hidden ? 'hidden' : 'visible');
  for (const item of doc.querySelectorAll<HTMLElement>(`[data-cmd="${TOGGLE_TOOLBAR_LABELS_COMMAND}"]`)) {
    item.classList.toggle('active', !hidden);
    item.setAttribute('aria-checked', String(!hidden));
  }
}

/** 설정을 뒤집어 저장하고 적용한다. 새 숨김 상태를 돌려준다. */
export function toggleToolbarLabels(doc: Document, storage: StorageLike | null = defaultStorage()): boolean {
  const hidden = !areToolbarLabelsHidden(storage);
  setToolbarLabelsHidden(hidden, storage);
  applyToolbarLabels(doc, hidden);
  return hidden;
}

/** 시작 시 설정을 적용하고, 다른 창에서 바꾼 설정도 storage 이벤트로 따라간다. */
export function installToolbarLabelsSync(win: Window, doc: Document): void {
  applyToolbarLabels(doc, areToolbarLabelsHidden());
  win.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) applyToolbarLabels(doc, areToolbarLabelsHidden());
  });
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
