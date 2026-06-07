// SPA client for the Layer-D per-chain insights API (/api/insights).
// Reuses the shared axios instance in ./api.ts (baseURL '/api').
import { api } from './api';

export interface ChainSnapshot {
  open_count: number;
  terminal_count: number;
  breach_count: number;
  value_total_zar: number;
  last_event_at: string | null;
}

export interface ThroughputPoint {
  date: string;
  events: number;
  value_zar: number;
  sla_breaches: number;
  regulator_crossings: number;
}

export interface ChainTotals {
  events_30d: number;
  value_30d_zar: number;
  breaches_30d: number;
  crossings_30d: number;
}

export interface ChainInsights {
  chain_key: string;
  snapshot: ChainSnapshot;
  throughput: ThroughputPoint[];
  totals: ChainTotals;
  bottleneck: { status: string; open_entities: number } | null;
}

export interface InsightAiCard {
  key: string;
  title: string;
  why: string;
  confidence?: number;
  accept?: { label: string; href?: string };
}

/** Per-chain rollup stats for the InsightsPanel. */
export async function getChainInsights(chainKey: string): Promise<ChainInsights> {
  const res = await api.get<{ data: ChainInsights }>(`/insights/chain/${encodeURIComponent(chainKey)}`);
  if (!res.data.data) throw new Error('insights: missing data envelope');
  return res.data.data;
}

/** Deterministic AI insight cards for a chain. */
export async function getChainAiInsights(chainKey: string): Promise<InsightAiCard[]> {
  const res = await api.get<{ data: InsightAiCard[] }>(`/insights/chain/${encodeURIComponent(chainKey)}/ai`);
  return res.data.data ?? [];
}
