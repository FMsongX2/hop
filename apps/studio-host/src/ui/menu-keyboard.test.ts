import { describe, expect, it } from 'vitest';
import { resolveMenuKey, stepIndex } from './menu-keyboard';

describe('menu keyboard', () => {
  it('opens the first menu with F10 and navigates only while open', () => {
    expect(resolveMenuKey('F10', false)).toEqual({ kind: 'open-first' });
    expect(resolveMenuKey('ArrowDown', false)).toEqual({ kind: 'ignore' });
    expect(resolveMenuKey('ArrowDown', true)).toEqual({ kind: 'move', delta: 1 });
    expect(resolveMenuKey('ArrowRight', true)).toEqual({ kind: 'switch', delta: 1 });
    expect(resolveMenuKey('Enter', true)).toEqual({ kind: 'activate' });
    expect(resolveMenuKey('a', true)).toEqual({ kind: 'ignore' });
  });

  it('opens menus by Hangul mnemonics with Alt and a physical key', () => {
    expect(resolveMenuKey('\u0192', false, { alt: true, code: 'KeyF' })).toEqual({ kind: 'open', menu: 'file' });
    expect(resolveMenuKey('e', true, { alt: true, code: 'KeyE' })).toEqual({ kind: 'open', menu: 'edit' });
    expect(resolveMenuKey('v', false, { alt: true, code: 'KeyV' })).toEqual({ kind: 'ignore' });
    expect(resolveMenuKey('f', false, { alt: true, shift: true, code: 'KeyF' })).toEqual({ kind: 'ignore' });
    expect(resolveMenuKey('f', false, { alt: true, ctrlOrMeta: true, code: 'KeyF' })).toEqual({ kind: 'ignore' });
  });

  it('wraps the highlighted index around the item list', () => {
    expect(stepIndex(-1, 1, 3)).toBe(0);
    expect(stepIndex(-1, -1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(-1);
  });
});
