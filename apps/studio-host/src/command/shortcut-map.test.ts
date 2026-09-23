import { afterEach, describe, expect, it } from 'vitest';
import { defaultShortcuts, matchShortcut } from './shortcut-map';
import { resetDesktopPlatformOverride } from '../core/platform';

describe('shortcut-map', () => {
  afterEach(() => {
    delete (globalThis as { navigator?: Navigator }).navigator;
    resetDesktopPlatformOverride();
  });

  it('matches Meta shortcuts on macOS', () => {
    installNavigator({ platform: 'MacIntel', userAgent: 'Mac OS X' });

    expect(matchShortcut(keyEvent({ key: 's', metaKey: true }), defaultShortcuts)).toBe('file:save');
    expect(matchShortcut(keyEvent({ key: 'n', metaKey: true, shiftKey: true }), defaultShortcuts))
      .toBe('file:new-window');
    expect(matchShortcut(keyEvent({ key: 'o', metaKey: true, altKey: true }), defaultShortcuts))
      .toBe('file:open-recent');
  });

  it('keeps Ctrl+E mapped to upstream delete instead of PDF export', () => {
    installNavigator({ platform: 'Win32', userAgent: 'Windows NT 10.0' });

    expect(matchShortcut(keyEvent({ key: 'e', ctrlKey: true }), defaultShortcuts)).toBe('edit:delete');
  });

  it('does not treat Meta as Ctrl on Windows', () => {
    installNavigator({ platform: 'Win32', userAgent: 'Windows NT 10.0' });

    expect(matchShortcut(keyEvent({ key: 's', metaKey: true }), defaultShortcuts)).toBeNull();
    expect(matchShortcut(keyEvent({ key: 's', ctrlKey: true }), defaultShortcuts)).toBe('file:save');
  });

  it('preserves upstream physical-key shortcuts when Option changes the key value', () => {
    installNavigator({ platform: 'MacIntel', userAgent: 'Mac OS X' });

    expect(matchShortcut(
      keyEvent({ key: '©', code: 'KeyG', altKey: true }),
      defaultShortcuts,
    )).toBe('edit:goto');
  });

  it('lets unmodified letters reach the document instead of the object properties shortcut', () => {
    installNavigator({ platform: 'MacIntel', userAgent: 'Mac OS X' });

    expect(matchShortcut(keyEvent({ key: 'p', code: 'KeyP' }), defaultShortcuts)).toBeNull();
    expect(matchShortcut(keyEvent({ key: 'ㅔ', code: 'KeyP' }), defaultShortcuts)).toBeNull();
    expect(matchShortcut(keyEvent({ key: 'p', metaKey: true }), defaultShortcuts)).toBe('file:print');
    expect(matchShortcut(keyEvent({ key: 'f6' }), defaultShortcuts)).toBe('format:style-dialog');
  });

  it('maps Hangul file shortcuts and macOS Option letters by physical key', () => {
    installNavigator({ platform: 'MacIntel', userAgent: 'Mac OS X' });

    expect(matchShortcut(keyEvent({ key: 'ß', code: 'KeyS', altKey: true }), defaultShortcuts)).toBe('file:save');
    expect(matchShortcut(keyEvent({ key: 'ø', code: 'KeyO', altKey: true }), defaultShortcuts)).toBe('file:open');
    expect(matchShortcut(keyEvent({ key: 'π', code: 'KeyP', altKey: true }), defaultShortcuts)).toBe('file:print');
    expect(matchShortcut(keyEvent({ key: '¬', code: 'KeyL', altKey: true }), defaultShortcuts)).toBe('format:char-shape');
    expect(matchShortcut(keyEvent({ key: '†', code: 'KeyT', altKey: true }), defaultShortcuts)).toBe('format:para-shape');
  });

  it('restores Hangul alignment and symbol shortcuts on the desktop', () => {
    installNavigator({ platform: 'Win32', userAgent: 'Windows NT 10.0' });

    expect(matchShortcut(keyEvent({ key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true }), defaultShortcuts)).toBe('format:align-center');
    expect(matchShortcut(keyEvent({ key: 'R', code: 'KeyR', ctrlKey: true, shiftKey: true }), defaultShortcuts)).toBe('format:align-right');
    expect(matchShortcut(keyEvent({ key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true }), defaultShortcuts)).toBe('format:align-distribute');
    expect(matchShortcut(keyEvent({ key: 'F10', ctrlKey: true }), defaultShortcuts)).toBe('insert:symbols');
    expect(matchShortcut(keyEvent({ key: 'F10', altKey: true }), defaultShortcuts)).toBe('insert:symbols');
  });

  it('does not run unmodified shortcuts while a non-primary system modifier is held', () => {
    installNavigator({ platform: 'Win32', userAgent: 'Windows NT 10.0' });

    expect(matchShortcut(
      keyEvent({ key: 'p', code: 'KeyP', metaKey: true }),
      defaultShortcuts,
    )).toBeNull();
  });
});

function installNavigator(value: Pick<Navigator, 'platform' | 'userAgent'>): void {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
  });
}

function keyEvent(
  overrides: Partial<Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>>,
): KeyboardEvent {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  } as KeyboardEvent;
}
