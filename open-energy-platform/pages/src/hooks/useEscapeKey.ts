import { useEffect } from 'react';

/**
 * Calls `onEscape` when the user presses the Escape key while the component
 * is mounted. Used by every modal in the app to close on Escape, as required
 * by WCAG 2.1 AA (2.1.2 — No Keyboard Trap).
 *
 * `enabled` defaults to true; pass `false` to disable the listener without
 * unmounting the component (e.g., nested modals where only the topmost one
 * should react).
 */
export function useEscapeKey(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onEscape, enabled]);
}
