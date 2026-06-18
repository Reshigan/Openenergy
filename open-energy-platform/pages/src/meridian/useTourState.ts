// ════════════════════════════════════════════════════════════════════════
// useTourState — per-device seen-state for the Meridian first-run guided tour.
//
// Reuses the SAME localStorage ledger as the wizard tour (useOnboarding):
// key `oe.onboarding.tour.completed`, holding a JSON array of completed
// step-key strings. To avoid colliding with the wizard's `platform.<role>.<step>`
// keys, every surface key is namespaced `meridian.surface.<surface>`, plus one
// sentinel `meridian.surface.__skip` written when the user skips the whole tour.
//
// This hook makes ZERO network calls. It reads and writes localStorage
// directly, merge-don't-clobber, and guards every access in try/catch (private
// mode throws) and `typeof window === 'undefined'` for SSR safety.
// ════════════════════════════════════════════════════════════════════════

import { useCallback, useState } from 'react';

const TOUR_LS_KEY = 'oe.onboarding.tour.completed';
const SKIP_KEY = 'meridian.surface.__skip';
// Session-wide kill switch used by recording/automation (same flag the wizard
// OnboardingTour honours). When set, no tour card paints.
const SKIP_AUTOMATION_KEY = 'oe.onboarding.skipped';

const surfaceKey = (surface: string) => `meridian.surface.${surface}`;

function readLedger(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage?.getItem(TOUR_LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((k) => typeof k === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function automationSkipped(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem(SKIP_AUTOMATION_KEY) === '1';
  } catch {
    return false;
  }
}

// Merge-don't-clobber: read the current array, add the keys, write back the
// union - so the wizard's `platform.*` keys in the same ledger are preserved.
function writeKeys(keys: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const next = new Set([...readLedger(), ...keys]);
    window.localStorage?.setItem(TOUR_LS_KEY, JSON.stringify([...next]));
  } catch {
    /* private mode */
  }
}

export function useTourState() {
  const [completed, setCompleted] = useState<Set<string>>(() => readLedger());

  const seen = useCallback((surface: string): boolean => {
    if (automationSkipped()) return true;
    return completed.has(SKIP_KEY) || completed.has(surfaceKey(surface));
  }, [completed]);

  const markSeen = useCallback((surface: string): void => {
    const key = surfaceKey(surface);
    writeKeys([key]);
    setCompleted((prev) => new Set([...prev, key]));
  }, []);

  const skipTour = useCallback((): void => {
    writeKeys([SKIP_KEY]);
    setCompleted((prev) => new Set([...prev, SKIP_KEY]));
  }, []);

  return { seen, markSeen, skipTour };
}
