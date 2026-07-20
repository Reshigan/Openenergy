// pages/src/shared/ease/applyViewPrefs.ts — pure prefs-application helper.
// Split out from useViewPrefs.ts (which imports the axios api client) so this
// stays dependency-free and testable in the backend vitest project.

export interface ViewPrefs { pins: string[]; hidden: string[]; order: string[] }
export const EMPTY_PREFS: ViewPrefs = { pins: [], hidden: [], order: [] };

// Apply prefs to a keyed list — pinned first, then explicit order, optionally
// dropping hidden. Stable for unspecified items (keeps incoming order).
export function applyViewPrefs<T>(
  items: T[],
  keyOf: (t: T) => string,
  prefs: ViewPrefs,
  opts?: { dropHidden?: boolean },
): T[] {
  const orderIdx = (k: string) => {
    const i = prefs.order.indexOf(k);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const kept = opts?.dropHidden
    ? items.filter((it) => !prefs.hidden.includes(keyOf(it)))
    : items.slice();
  return kept
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const ka = keyOf(a.it), kb = keyOf(b.it);
      const pa = prefs.pins.includes(ka) ? 0 : 1, pb = prefs.pins.includes(kb) ? 0 : 1;
      if (pa !== pb) return pa - pb;               // pinned first
      const oa = orderIdx(ka), ob = orderIdx(kb);
      if (oa !== ob) return oa - ob;               // then explicit order
      return a.i - b.i;                            // else stable (incoming order)
    })
    .map((x) => x.it);
}
