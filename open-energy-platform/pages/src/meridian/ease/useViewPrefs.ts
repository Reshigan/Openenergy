// pages/src/meridian/ease/useViewPrefs.ts — the Ease customisation engine (client).
// One hook backs per-user pin / hide / reorder on any surface, persisted to
// /api/prefs/:scope (server-side, so it survives devices). The role default is the
// starting layout; these are the user's overrides. Used by Horizon (lanes + duty)
// and Atlas (tiles) — one concept, two surfaces.
import React from 'react';
import { api } from '../../lib/api';
import { type ViewPrefs, EMPTY_PREFS, applyViewPrefs } from './applyViewPrefs';

export type { ViewPrefs };
export { applyViewPrefs };
const EMPTY = EMPTY_PREFS;

function normalize(d: any): ViewPrefs {
  return {
    pins: Array.isArray(d?.pins) ? d.pins.map(String) : [],
    hidden: Array.isArray(d?.hidden) ? d.hidden.map(String) : [],
    order: Array.isArray(d?.order) ? d.order.map(String) : [],
  };
}

export function useViewPrefs(scopeKey: string) {
  const [prefs, setPrefs] = React.useState<ViewPrefs>(EMPTY);
  const [loaded, setLoaded] = React.useState(false);
  // Mirror current prefs in a ref so mutators read fresh state without re-binding
  // and we never run a side-effect inside a setState updater.
  const ref = React.useRef<ViewPrefs>(EMPTY);

  React.useEffect(() => {
    let live = true;
    setLoaded(false);
    api.get(`/prefs/${encodeURIComponent(scopeKey)}`)
      .then((r) => { if (live) { const p = normalize(r.data?.data); ref.current = p; setPrefs(p); } })
      .catch(() => { if (live) { ref.current = EMPTY; setPrefs(EMPTY); } })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [scopeKey]);

  const update = React.useCallback((fn: (p: ViewPrefs) => ViewPrefs) => {
    const next = fn(ref.current);
    ref.current = next;
    setPrefs(next);
    // Best-effort persist; UI already reflects the change optimistically.
    api.put(`/prefs/${encodeURIComponent(scopeKey)}`, next).catch(() => { /* keep optimistic */ });
  }, [scopeKey]);

  const togglePin = React.useCallback((key: string) => update((p) => ({
    ...p, pins: p.pins.includes(key) ? p.pins.filter((k) => k !== key) : [...p.pins, key],
  })), [update]);

  const toggleHidden = React.useCallback((key: string) => update((p) => ({
    ...p, hidden: p.hidden.includes(key) ? p.hidden.filter((k) => k !== key) : [...p.hidden, key],
  })), [update]);

  const setOrder = React.useCallback((order: string[]) => update((p) => ({ ...p, order })), [update]);
  const reset = React.useCallback(() => update(() => EMPTY), [update]);

  const isPinned = React.useCallback((key: string) => prefs.pins.includes(key), [prefs.pins]);
  const isHidden = React.useCallback((key: string) => prefs.hidden.includes(key), [prefs.hidden]);

  return { prefs, loaded, togglePin, toggleHidden, setOrder, reset, isPinned, isHidden };
}
