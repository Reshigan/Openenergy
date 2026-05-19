// ════════════════════════════════════════════════════════════════════════
// useVisiblePolling — interval that pauses while the tab is hidden.
//
// Cuts Worker request volume + D1 reads on the cheapest possible axis:
// stop firing background fetches that nobody is looking at. When the
// tab returns to view we trigger one immediate fetch (so the user sees
// fresh data on focus) and resume the interval.
//
// Usage:
//
//   useVisiblePolling(60_000, async () => {
//     const r = await api.get('/foo');
//     setData(r.data);
//   });
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';

export function useVisiblePolling(
  intervalMs: number,
  fn: () => void | Promise<void>,
  options?: { immediate?: boolean },
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try { await fnRef.current(); } catch { /* swallow */ }
    };
    const start = () => {
      if (id !== null) return;
      id = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (id !== null) { clearInterval(id); id = null; }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void tick();         // refresh immediately on regain focus
        start();
      } else {
        stop();
      }
    };

    if (options?.immediate !== false) void tick();
    if (document.visibilityState === 'visible') start();

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);
}
