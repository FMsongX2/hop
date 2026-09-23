import { describe, expect, it } from 'vitest';
import {
  applyToolbarLabels,
  areToolbarLabelsHidden,
  toggleToolbarLabels,
} from './toolbar-labels';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

function fakeDocument() {
  const root = { attributes: new Map<string, string>(), setAttribute(k: string, v: string) { this.attributes.set(k, v); } };
  const item = {
    classes: new Set<string>(),
    attributes: new Map<string, string>(),
    classList: { toggle(name: string, force: boolean) { force ? item.classes.add(name) : item.classes.delete(name); } },
    setAttribute(k: string, v: string) { item.attributes.set(k, v); },
  };
  return {
    doc: {
      documentElement: root,
      querySelectorAll: () => [item],
    } as unknown as Document,
    root,
    item,
  };
}

describe('toolbar labels', () => {
  it('shows labels by default and toggles the shared preference', () => {
    const storage = memoryStorage();
    const { doc, root, item } = fakeDocument();

    expect(areToolbarLabelsHidden(storage)).toBe(false);
    expect(toggleToolbarLabels(doc, storage)).toBe(true);
    expect(areToolbarLabelsHidden(storage)).toBe(true);
    expect(root.attributes.get('data-hop-toolbar-labels')).toBe('hidden');
    expect(item.classes.has('active')).toBe(false);
    expect(item.attributes.get('aria-checked')).toBe('false');

    expect(toggleToolbarLabels(doc, storage)).toBe(false);
    expect(root.attributes.get('data-hop-toolbar-labels')).toBe('visible');
    expect(item.classes.has('active')).toBe(true);
  });

  it('treats a throwing storage as labels visible', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const { doc, root } = fakeDocument();

    expect(areToolbarLabelsHidden(broken)).toBe(false);
    applyToolbarLabels(doc, areToolbarLabelsHidden(broken));
    expect(root.attributes.get('data-hop-toolbar-labels')).toBe('visible');
  });
});
