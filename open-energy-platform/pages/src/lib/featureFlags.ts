// ════════════════════════════════════════════════════════════════════════
// featureFlags — client-side hook around /api/polish/feature-flags.
// One fetch per session; cached in memory; refresh on visibility-return.
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { api } from './api';

let cache: Record<string, boolean> | null = null;
let pending: Promise<Record<string, boolean>> | null = null;

async function load(): Promise<Record<string, boolean>> {
  if (cache) return cache;
  if (!pending) {
    pending = api.get('/polish/feature-flags').then((r) => {
      cache = r.data?.data?.flags || {};
      return cache;
    }).catch(() => ({} as Record<string, boolean>));
  }
  return pending;
}

export function useFeatureFlag(key: string, fallback = false): boolean {
  const [enabled, setEnabled] = useState<boolean>(cache?.[key] ?? fallback);
  useEffect(() => {
    let cancelled = false;
    load().then((f) => { if (!cancelled) setEnabled(!!f[key]); });
    return () => { cancelled = true; };
  }, [key]);
  return enabled;
}

export function refreshFlags() {
  cache = null;
  pending = null;
}
