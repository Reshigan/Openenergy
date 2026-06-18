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

// A Horizon lane whose cases all belong to one chain can deep-link straight to
// that chain's Ledger (the lane label becomes a <Link>). Mixed lanes return null
// and stay a collapse toggle. Empty lanes are not single-chain.
export function singleChainOf(cases: { chain: string }[]): string | null {
  const set = new Set(cases.map((c) => c.chain));
  return set.size === 1 ? [...set][0] : null;
}

// Classify a failed axios load so surfaces can show an honest message.
// axios puts the HTTP status on .response.status; a request that never got a
// response (network/CORS/offline) has .request but no .response.
export type LoadErrorKind = 'forbidden' | 'notfound' | 'network' | 'unknown';
export function classifyLoadError(e: unknown): LoadErrorKind {
  const status = (e as { response?: { status?: number } })?.response?.status;
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notfound';
  if (status === undefined && (e as { request?: unknown })?.request) return 'network';
  return 'unknown';
}

export async function fetchHorizon(role: string): Promise<HorizonData> {
  // api is an axios instance (baseURL '/api'): r.data is the {success, data} envelope.
  const r = await api.get(`/horizon/${role}`);
  if (!r.data?.success) throw new Error(r.data?.error || 'horizon fetch failed');
  return r.data.data;
}

export interface LedgerActionField {
  key: string; label: string;
  type: 'number' | 'string' | 'date' | 'enum' | 'boolean' | 'evidence' | 'lookup';
  required?: boolean; unit?: string; options?: string[]; placeholder?: string; defaultFrom?: string;
  // For type:'lookup' — path under /api returning {success,data:[{id,label}]} to populate a picker.
  source?: string;
}
// Option shape returned by a lookup source endpoint.
export interface LookupOption { id: string; label: string }
export async function fetchLookup(source: string): Promise<LookupOption[]> {
  // source is a full '/api/...' path in the registry; strip '/api' to fit the axios baseURL.
  const r = await api.get(source.replace('/api', ''));
  if (!r.data?.success) throw new Error(r.data?.error || 'lookup fetch failed');
  return (r.data.data ?? []) as LookupOption[];
}
export interface LedgerRow {
  id: string; ref: string; title: string; status: string;
  deadline_at: string | null; bucket: string; quantum_zar: number | null;
  counterparty: string | null; score: number;
  actions: (MerAction & { fields?: LedgerActionField[] })[];
}
export interface LedgerData {
  chain: { key: string; wave: number; title: string };
  filters: { key: string; label: string; statuses: string[] }[];
  initiation: { label: string; path: string; fields: LedgerActionField[] } | null;
  kpis: { key: string; label: string; value: number }[];
  rows: LedgerRow[];
}

export async function fetchLedger(chainKey: string, status?: string): Promise<LedgerData> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const r = await api.get(`/ledger/${chainKey}${q}`);
  if (!r.data?.success) throw new Error(r.data?.error || 'ledger fetch failed');
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

// ── Deal engine ──────────────────────────────
// NB: deal endpoints return RAW bodies (no {success,data} envelope) — read r.data.<field> directly.
export type DealKind = 'marketplace' | 'auction' | 'syndication' | 'negotiation' | 'obligation' | 'submission';
export interface DealFieldSpec { key: string; label: string; type: 'number' | 'string' | 'date' | 'enum' | 'boolean'; required?: boolean; unit?: string; options?: string[] }
export interface DealRequestSummary {
  id: string; deal_type: string; status: string; need: Record<string, unknown>;
  target_amount_zar: number | null; bid_window_close: string | null; clearing_rule: string | null;
  selected_offer_id: string | null; dispatched_chain_key: string | null; dispatched_case_id: string | null;
  created_at: string; offer_count: number;
}
export interface DealOfferSummary {
  id: string; deal_type: string; title: string; status: string; request_id: string | null;
  bid_amount_zar: number | null; committed_amount_zar: number | null; term_sheet: Record<string, unknown>;
  expiry: string | null; created_at: string;
}
export interface MyDeals { requests: DealRequestSummary[]; offers: DealOfferSummary[] }
export interface DealTypeInfo {
  deal_type: string; kind: DealKind; initiator: 'provider' | 'demand'; event_prefix: string;
  can_offer: boolean; can_request: boolean; term_sheet_schema: DealFieldSpec[]; need_schema: DealFieldSpec[];
  provider_roles: string[]; demand_roles: string[];
}
export interface ScoredOption {
  option_id: string; title: string; primary_metric: number | null; est_value_zar: number | null;
  sweetener_value_zar: number; secondary: Record<string, unknown>; price_basis: string; rationale: string;
}

export async function fetchMyDeals(): Promise<MyDeals> {
  const r = await api.get('/deals/mine');
  return { requests: r.data?.requests ?? [], offers: r.data?.offers ?? [] };
}
export async function fetchDealTypes(): Promise<DealTypeInfo[]> {
  const r = await api.get('/deals/types');
  return r.data?.types ?? [];
}
export async function fetchDealOptions(dealType: string, requestId: string): Promise<ScoredOption[]> {
  const r = await api.get(`/deals/${dealType}/options`, { params: { request_id: requestId } });
  return r.data?.options ?? [];
}
export async function publishDealRequest(dealType: string, need: Record<string, unknown>, meta: Record<string, unknown> = {}): Promise<string> {
  const r = await api.post(`/deals/${dealType}/request`, { need, ...meta });
  return r.data?.request_id;
}
export async function publishDealOffer(dealType: string, termSheet: Record<string, unknown>, meta: Record<string, unknown> = {}): Promise<string> {
  const r = await api.post(`/deals/${dealType}/offer`, { term_sheet: termSheet, ...meta });
  return r.data?.offer_id;
}
export async function acceptDealOffer(dealType: string, body: Record<string, unknown>): Promise<any> {
  const r = await api.post(`/deals/${dealType}/accept`, body);
  return r.data;
}
export async function declineDealOffer(dealType: string, offerId: string): Promise<void> {
  await api.post(`/deals/${dealType}/decline`, { offer_id: offerId });
}

// 'energy_supply' -> 'Energy Supply'
export function dealLabel(t: string): string {
  return t.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// De-snake a raw registry/URL key for display. titleCase=false keeps it lowercase
// (used as a secondary tag — title-casing would mangle acronyms like ipp/cod/mrv/ppa);
// titleCase=true is for headings where word keys (master_data → Master Data) read better.
export function humanizeKey(key: string, titleCase = false): string {
  const spaced = key.replace(/_/g, ' ').trim();
  return titleCase ? spaced.replace(/\b\w/g, c => c.toUpperCase()) : spaced;
}

// pipeline stage of a request, for DealProcessRail
export type DealStage = 'offer' | 'match' | 'evaluate' | 'accept' | 'track';
export function dealStage(r: DealRequestSummary): DealStage {
  if (r.dispatched_chain_key) return 'track';
  if (r.selected_offer_id) return 'accept';
  if (r.offer_count > 0) return 'evaluate';
  return 'match';
}
