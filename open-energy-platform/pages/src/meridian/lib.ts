// pages/src/meridian/lib.ts — Meridian data layer + formatters
import { api } from '../lib/api';

// Must match HorizonBucket in src/utils/chain-registry-meridian.ts (backend).
export type Bucket = 'breached' | 'h2' | 'today' | 'h48' | 'week' | 'later';
export const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'breached', label: 'BREACHED' }, { key: 'h2', label: '< 2H' },
  { key: 'today', label: 'TODAY' }, { key: 'h48', label: '48H' },
  { key: 'week', label: 'THIS WEEK' }, { key: 'later', label: 'LATER' },
];

export interface MerAction { action: string; label: string; path: string; cascadeHint: string; tone?: string }
export interface MerCase {
  chain: string; wave: number; id: string; ref: string; title: string;
  status: string; deadline_at: string | null; bucket: Bucket;
  quantum_zar: number | null; counterparty: string | null; score: number;
  actions: MerAction[];
}
export interface HorizonData {
  lanes: { key: string; cases: MerCase[] }[];
  duty: MerCase[];
  counts: { total: number; breached: number };
}

export async function fetchHorizon(role: string): Promise<HorizonData> {
  // api is an axios instance (baseURL '/api'): r.data is the {success, data} envelope.
  const r = await api.get(`/horizon/${role}`);
  if (!r.data?.success) throw new Error(r.data?.error || 'horizon fetch failed');
  return r.data.data;
}

export function fmtZar(v: number | null): string {
  if (v == null) return '';
  if (v >= 1e9) return `R ${(v / 1e9).toFixed(2)}bn`;
  if (v >= 1e6) return `R ${(v / 1e6).toFixed(1)}m`;
  if (v >= 1e3) return `R ${(v / 1e3).toFixed(0)}k`;
  return `R ${v.toFixed(0)}`;
}

export function zarMagnitudeClass(v: number | null): 'm1' | 'm2' | 'm3' {
  if (v == null || v < 1e6) return 'm1';
  if (v < 1e8) return 'm2';
  return 'm3';
}

export function fuseFraction(deadline: string | null, windowHrs = 72): number {
  if (!deadline) return 1;
  const hrs = (Date.parse(deadline) - Date.now()) / 3600_000;
  return Math.max(0, Math.min(1, hrs / windowHrs));
}
