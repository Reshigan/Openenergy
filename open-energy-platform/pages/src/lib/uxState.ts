// ════════════════════════════════════════════════════════════════════════
// uxState — thin client hooks over /api/ux-state for per-user UI state.
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

export function useOnboarding() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    const r = await api.get('/ux-state/onboarding').catch(() => null);
    const j = r?.data;
    if (j?.success) setCompleted(new Set(j.data.completed));
  }, []);
  useEffect(() => { void load(); }, [load]);
  const complete = useCallback(async (stepKey: string) => {
    setCompleted((prev) => new Set([...prev, stepKey]));
    await api.post(`/ux-state/onboarding/${encodeURIComponent(stepKey)}/complete`).catch(() => null);
  }, []);
  const isComplete = useCallback((stepKey: string) => completed.has(stepKey), [completed]);
  return { completed, complete, isComplete, reload: load };
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
