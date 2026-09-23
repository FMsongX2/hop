// F10으로 메뉴 표시줄을 키보드로 조작함(한글의 메뉴 활성화). 열기·전환은 upstream MenuBar의 mousedown 경로를
// 그대로 재사용하고, 항목 강조와 Enter 실행만 HOP이 담당함.

export type MenuKeyAction =
  | { kind: 'ignore' }
  | { kind: 'open-first' }
  | { kind: 'open'; menu: string }
  | { kind: 'switch'; delta: -1 | 1 }
  | { kind: 'move'; delta: -1 | 1 }
  | { kind: 'activate' };

/** 한글 메뉴 니모닉(Alt+글자). Alt+V는 rhwp가 투명 선 조합키로 쓰므로 뺀다. */
const MENU_MNEMONICS: Record<string, string> = {
  KeyF: 'file',
  KeyE: 'edit',
  KeyD: 'insert',
  KeyJ: 'format',
  KeyW: 'page',
};

/** 키와 메뉴 열림 상태로 할 일을 정한다. 순수 함수라 테스트로 고정한다. */
export function resolveMenuKey(
  key: string,
  menuOpen: boolean,
  modifiers: { alt?: boolean; ctrlOrMeta?: boolean; shift?: boolean; code?: string } = {},
): MenuKeyAction {
  if (modifiers.alt && !modifiers.ctrlOrMeta && !modifiers.shift) {
    const menu = MENU_MNEMONICS[modifiers.code ?? ''];
    return menu ? { kind: 'open', menu } : { kind: 'ignore' };
  }
  if (key === 'F10') return menuOpen ? { kind: 'ignore' } : { kind: 'open-first' };
  if (!menuOpen) return { kind: 'ignore' };
  if (key === 'ArrowLeft') return { kind: 'switch', delta: -1 };
  if (key === 'ArrowRight') return { kind: 'switch', delta: 1 };
  if (key === 'ArrowUp') return { kind: 'move', delta: -1 };
  if (key === 'ArrowDown') return { kind: 'move', delta: 1 };
  if (key === 'Enter') return { kind: 'activate' };
  return { kind: 'ignore' };
}

/** 순환 인덱스. 항목이 없으면 -1. */
export function stepIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return (current + delta + count) % count;
}

const ACTIVE_CLASS = 'kb-active';
const SUB_OPEN_CLASS = 'kb-open';

export function installMenuKeyboard(menuBar: HTMLElement, doc: Document = document): void {
  const titles = () => Array.from(menuBar.querySelectorAll<HTMLElement>('.menu-item > .menu-title'));
  const openMenu = () => menuBar.querySelector<HTMLElement>('.menu-item.open');
  const items = () => Array.from(
    openMenu()?.querySelectorAll<HTMLElement>('.md-item[data-cmd]:not(.disabled)') ?? [],
  );
  let active = -1;

  const clearActive = () => {
    menuBar.querySelectorAll(`.${ACTIVE_CLASS}`).forEach((el) => el.classList.remove(ACTIVE_CLASS));
    menuBar.querySelectorAll(`.${SUB_OPEN_CLASS}`).forEach((el) => el.classList.remove(SUB_OPEN_CLASS));
    active = -1;
  };
  const press = (title: HTMLElement) => {
    clearActive();
    title.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  };
  const highlight = (index: number) => {
    const list = items();
    menuBar.querySelectorAll(`.${ACTIVE_CLASS}`).forEach((el) => el.classList.remove(ACTIVE_CLASS));
    menuBar.querySelectorAll(`.${SUB_OPEN_CLASS}`).forEach((el) => el.classList.remove(SUB_OPEN_CLASS));
    active = index;
    const item = list[index];
    if (!item) return;
    item.classList.add(ACTIVE_CLASS);
    item.closest('.md-sub')?.classList.add(SUB_OPEN_CLASS);
    item.scrollIntoView?.({ block: 'nearest' });
  };

  doc.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT)$/.test(target.tagName)) return;
    if (doc.querySelector('.modal-overlay')) return;
    const action = resolveMenuKey(event.key, openMenu() !== null, {
      alt: event.altKey,
      ctrlOrMeta: event.ctrlKey || event.metaKey,
      shift: event.shiftKey,
      code: event.code,
    });
    if (action.kind === 'ignore') return;
    event.preventDefault();
    event.stopPropagation();
    const all = titles();
    if (action.kind === 'open-first') {
      if (all[0]) press(all[0]);
      return;
    }
    if (action.kind === 'open') {
      const title = all.find((candidate) => candidate.parentElement?.dataset.menu === action.menu);
      if (title && title.parentElement !== openMenu()) press(title);
      return;
    }
    if (action.kind === 'switch') {
      const current = all.findIndex((title) => title.parentElement === openMenu());
      const next = all[stepIndex(current, action.delta, all.length)];
      if (next) press(next);
      return;
    }
    if (action.kind === 'move') {
      highlight(stepIndex(active, action.delta, items().length));
      return;
    }
    items()[active]?.click();
    clearActive();
  }, true);

  doc.addEventListener('mousedown', clearActive, true);
}
