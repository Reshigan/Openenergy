// ════════════════════════════════════════════════════════════════════════
// uxState - thin client hooks over /api/ux-state for per-user UI state.
// Saved filters, onboarding step completion, and inline-help dismissals.
// ════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export type SavedFilter = {
  id: string;
  surface: string;
  name: string;
  filter_json: string;
  shared: number;
  created_at: string;
  updated_at: string;
  owner_id?: string;
};

export function useSavedFilters(surface: string) {
  const [own, setOwn] = useState<SavedFilter[]>([]);
  const [shared, setShared] = useState<SavedFilter[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get('/ux-state/filters', { params: { surface } });
      const j = r.data;
      if (j.success) {
        setOwn(j.data.own || []);
        setShared(j.data.shared || []);
      }
    } finally { setBusy(false); }
  }, [surface]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (name: string, filter: unknown, opts?: { shared?: boolean }) => {
    await api.post('/ux-state/filters', { surface, name, filter_json: filter, shared: opts?.shared });
    await load();
  }, [surface, load]);

  const remove = useCallback(async (id: string) => {
    await api.delete(`/ux-state/filters/${encodeURIComponent(id)}`);
    await load();
  }, [load]);

  return { own, shared, save, remove, reload: load, busy };
}

// Wizard track (/api/onboarding/*, backed by participants.onboarding_* +
// oe_onboarding_provisioning_log) is the single source of truth for "did the
// user finish onboarding". The first-run tour's per-step dismissal is ephemeral
// per-device UI state, so it lives in localStorage - this hook makes ZERO calls
// to the legacy /ux-state/onboarding store.
const TOUR_LS_KEY = 'oe.onboarding.tour.completed';

function readTourCompleted(): Set<string> {
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

export function useOnboarding() {
  const [completed, setCompleted] = useState<Set<string>>(() => readTourCompleted());
  const [wizardCompleted, setWizardCompleted] = useState<boolean | null>(null);

  // Completion signal comes from the wizard track. data.completed is unwrapped
  // from the /api/onboarding/state envelope.
  const load = useCallback(async () => {
    setCompleted(readTourCompleted());
    const r = await api.get('/onboarding/state').catch(() => null);
    if (!r) return null; // tolerate failure - leave wizardCompleted as-is.
    const body = r.data?.data ?? r.data;
    if (body && typeof body.completed === 'boolean') return body.completed as boolean;
    return null;
  }, []);
  useEffect(() => {
    let alive = true;
    void load().then((c) => { if (alive && c !== null) setWizardCompleted(c); });
    return () => { alive = false; };
  }, [load]);

  // Per-step dismissal is persisted to localStorage only (no network).
  const complete = useCallback(async (stepKey: string) => {
    setCompleted((prev) => {
      const next = new Set([...prev, stepKey]);
      if (typeof window !== 'undefined') {
        try { window.localStorage?.setItem(TOUR_LS_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
      }
      return next;
    });
  }, []);

  const isComplete = useCallback((stepKey: string) => completed.has(stepKey), [completed]);
  return { completed, complete, isComplete, reload: load, wizardCompleted };
}

export function useHelpDismissal(key: string) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void api.get('/ux-state/help-dismissals').then((r) => {
      if (!alive) return;
      const set = new Set<string>(r.data?.data?.dismissed || []);
      setDismissed(set.has(key));
    }).catch(() => alive && setDismissed(false));
    return () => { alive = false; };
  }, [key]);
  const dismiss = useCallback(async () => {
    setDismissed(true);
    await api.post(`/ux-state/help-dismissals/${encodeURIComponent(key)}`).catch(() => null);
  }, [key]);
  const restore = useCallback(async () => {
    setDismissed(false);
    await api.delete(`/ux-state/help-dismissals/${encodeURIComponent(key)}`).catch(() => null);
  }, [key]);
  return { dismissed, dismiss, restore };
}
