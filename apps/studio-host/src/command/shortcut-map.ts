import {
  defaultShortcuts as upstreamDefaultShortcuts,
} from '@/upstream/shortcuts';
import type { ShortcutDef } from '@/upstream/shortcuts';
import { detectDesktopPlatform, hasPrimaryModifier } from '../core/platform';

export type { ShortcutDef };

const hopShortcuts: [ShortcutDef, string][] = [
  [{ key: 'n', ctrl: true, shift: true }, 'file:new-window'],
  [{ key: 'o', ctrl: true, alt: true }, 'file:open-recent'],
  [{ key: 's', ctrl: true, shift: true }, 'file:save-as'],
  // 한글(Windows) 파일 단축키. 물리 코드로 잡아 macOS Option 조합과 한글 IME에서도 동작한다.
  [{ key: 's', code: 'KeyS', alt: true }, 'file:save'],
  [{ key: 'o', code: 'KeyO', alt: true }, 'file:open'],
  [{ key: 'p', code: 'KeyP', alt: true }, 'file:print'],
  // 한글 원래 정렬·문자표 단축키. upstream은 브라우저 충돌 때문에 Alt 조합으로 옮겼지만 데스크톱 웹뷰에는 충돌이 없다.
  [{ key: 'c', code: 'KeyC', ctrl: true, shift: true }, 'format:align-center'],
  [{ key: 'r', code: 'KeyR', ctrl: true, shift: true }, 'format:align-right'],
  [{ key: 't', code: 'KeyT', ctrl: true, shift: true }, 'format:align-distribute'],
  [{ key: 'f10', ctrl: true }, 'insert:symbols'],
];

const hopShortcutKeys = new Set(hopShortcuts.map(([shortcut]) => shortcutKey(shortcut)));

export const defaultShortcuts: [ShortcutDef, string][] = [
  ...hopShortcuts,
  ...upstreamDefaultShortcuts
    .filter(([shortcut]) => !hopShortcutKeys.has(shortcutKey(shortcut)) && !isUnmodifiedCharacterShortcut(shortcut))
    .map(([shortcut, commandId]): [ShortcutDef, string] => [withPhysicalCodeForOption(shortcut), commandId]),
];

// macOS에서 Option+글자는 key가 특수문자(¬, † 등)로 바뀐다. upstream이 code를 주지 않은 Alt 단축키에
// 물리 코드를 보태 Windows 한글과 같은 키로 동작하게 한다.
function withPhysicalCodeForOption(shortcut: ShortcutDef): ShortcutDef {
  if (!shortcut.alt || shortcut.code || !/^[a-z]$/.test(shortcut.key)) return shortcut;
  return { ...shortcut, code: `Key${shortcut.key.toUpperCase()}` };
}

// rhwp 0.8.4의 일반 키 경로는 매칭된 단축키를 canExecute 결과와 무관하게 preventDefault 한다.
// 그래서 modifier 없는 'P'(개체 속성) 단축키가 본문 타이핑의 p/ㅔ를 삼킨다. upstream이 실행된
// 키만 삼키도록 바뀔 때까지 modifier 없는 단일 글자 단축키는 등록하지 않는다.
function isUnmodifiedCharacterShortcut(shortcut: ShortcutDef): boolean {
  return !shortcut.ctrl && !shortcut.alt && !shortcut.shift && shortcut.key.length === 1;
}

export function matchShortcut(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  shortcuts: [ShortcutDef, string][],
): string | null {
  const primaryModifier = hasPrimaryModifier(event);
  const anyPrimaryModifier = event.ctrlKey || event.metaKey;
  const platform = detectDesktopPlatform() === 'macos' ? 'mac' : 'other';
  const eventKey = event.key.toLowerCase();
  const eventCode = event.code.toLowerCase();

  for (const [def, commandId] of shortcuts) {
    if (def.platform && def.platform !== platform) continue;
    if (def.ctrl ? !primaryModifier : anyPrimaryModifier) continue;
    if ((def.shift ?? false) !== event.shiftKey) continue;
    if ((def.alt ?? false) !== event.altKey) continue;
    if (eventKey === def.key) return commandId;
    if (def.code && eventCode === def.code.toLowerCase()) return commandId;
  }

  return null;
}

function shortcutKey(shortcut: ShortcutDef): string {
  return [
    shortcut.key.toLowerCase(),
    shortcut.code?.toLowerCase() ?? '',
    shortcut.ctrl ? 'ctrl' : '',
    shortcut.shift ? 'shift' : '',
    shortcut.alt ? 'alt' : '',
    shortcut.platform ?? '',
  ].join(':');
}
