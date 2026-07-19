// Pure prefs-application helper (no api/axios import), backend-testable.
import { describe, it, expect } from 'vitest';
import { applyViewPrefs, EMPTY_PREFS } from '../pages/src/shared/ease/applyViewPrefs';

const items = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }];
const k = (x: { key: string }) => x.key;

describe('ease/applyViewPrefs', () => {
  it('keeps incoming order with empty prefs', () => {
    expect(applyViewPrefs(items, k, EMPTY_PREFS).map(k)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('floats pinned items first (preserving their relative incoming order)', () => {
    const p = { ...EMPTY_PREFS, pins: ['c', 'b'] };
    expect(applyViewPrefs(items, k, p).map(k)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('respects explicit order for non-pinned items', () => {
    const p = { ...EMPTY_PREFS, order: ['d', 'a'] };
    expect(applyViewPrefs(items, k, p).map(k)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('pins outrank explicit order', () => {
    const p = { pins: ['b'], hidden: [], order: ['d', 'a'] };
    expect(applyViewPrefs(items, k, p).map(k)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('drops hidden only when dropHidden is set', () => {
    const p = { ...EMPTY_PREFS, hidden: ['b'] };
    expect(applyViewPrefs(items, k, p).map(k)).toEqual(['a', 'b', 'c', 'd']);
    expect(applyViewPrefs(items, k, p, { dropHidden: true }).map(k)).toEqual(['a', 'c', 'd']);
  });
});
