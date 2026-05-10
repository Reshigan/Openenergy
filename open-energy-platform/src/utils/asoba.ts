// ════════════════════════════════════════════════════════════════════════
// ASOBA Cloud (Ona) — Worker-compatible HTTP client
//
// The official @asoba/ona-sdk package targets Node (uses require('https') /
// 'http' / 'url'), so we can't import it directly in a Cloudflare Worker.
// Instead this thin wrapper hits the same documented REST endpoints with
// fetch() and the `x-api-key` header.
//
// Endpoints covered (all GET, JSON):
//   /telemetry/inverter   — per-inverter time series
//   /telemetry/site       — site-aggregate, keyed by asset_id
//   /telemetry/data-period — earliest/latest record bounds for a site/asset
//   /ooda/terminal        — OODA fault alerts for one terminal device
//   /ooda/site            — OODA alerts grouped by terminal_device_id
//   /ooda/data-period     — earliest/latest alert bounds
//
// Documented constraints (from sdk/types/index.d.ts and Asoba docs):
//   - 60 requests/minute per API key
//   - max 1000 records/query
//   - max 31-day time range
//   - resolution: '5min' | 'daily' (telemetry), 'minute' | 'hourly' | 'daily' (OODA)
// ═══════════════════════════════════════════════════════════════════════

import type { HonoEnv } from './types';

export type Resolution5Min = '5min' | 'daily';
export type ResolutionOoda = 'minute' | 'hourly' | 'daily';

export interface TelemetryRecord {
  asset_id: string;
  site_id: string;
  timestamp: string;
  asset_ts?: string;
  power?: number;
  kWh?: number;
  kVArh?: number;
  kVA?: number;
  PF?: number;
  temperature?: number;
  inverter_state?: string;
  run_state?: string;
  error_code?: string | null;
  error_type?: string | null;
  cursor?: string;
  [key: string]: unknown;
}

export interface OodaAlert {
  terminal_device_id: string;
  site_id?: string;
  timestamp: string;
  severity?: 'low' | 'medium' | 'high' | 'critical' | string;
  alert_type?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DataPeriod {
  site_id: string;
  asset_id?: string;
  terminal_device_id?: string;
  first_record: string | null;
  last_record: string | null;
}

export interface AsobaError {
  status: number;
  message: string;
  body?: unknown;
}

const DEFAULT_TELEMETRY_BASE = 'https://af5jy5ob3e.execute-api.af-south-1.amazonaws.com/prod';
const DEFAULT_OODA_BASE      = 'https://3lpq00xevg.execute-api.af-south-1.amazonaws.com/prod';

interface BaseUrls {
  telemetry: string;
  ooda: string;
  apiKey: string;
}

function resolveUrls(env: HonoEnv['Bindings']): BaseUrls | null {
  const apiKey = env.ASOBA_API_KEY;
  if (!apiKey) return null;
  return {
    telemetry: env.ASOBA_TELEMETRY_BASE || DEFAULT_TELEMETRY_BASE,
    ooda: env.ASOBA_OODA_BASE || DEFAULT_OODA_BASE,
    apiKey,
  };
}

async function call<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'Accept': 'application/json',
    },
    // ASOBA gateways occasionally take 5–10s to respond on cold cache; give
    // the request 25s to complete before bailing.
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { body = await res.text().catch(() => null); }
    const err: AsobaError = { status: res.status, message: `ASOBA ${res.status}`, body };
    throw err;
  }
  return (await res.json()) as T;
}

/** Build a query string, omitting undefined/null values. */
function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

// ─── Telemetry ─────────────────────────────────────────────────────────

export interface InverterTelemetryParams {
  asset_id: string;
  site_id: string;
  start: string;       // ISO 8601
  end: string;         // ISO 8601
  resolution?: Resolution5Min;
  limit?: number;      // <=1000
  cursor?: string;
}

export async function inverterTelemetry(
  env: HonoEnv['Bindings'],
  params: InverterTelemetryParams,
): Promise<{ records: TelemetryRecord[] }> {
  const u = resolveUrls(env);
  if (!u) throw asobaUnconfigured();
  const url = `${u.telemetry}/telemetry/inverter${qs({
    asset_id: params.asset_id,
    site_id: params.site_id,
    start: params.start,
    end: params.end,
    resolution: params.resolution || '5min',
    limit: params.limit ?? 1000,
    cursor: params.cursor,
  })}`;
  return call<{ records: TelemetryRecord[] }>(url, u.apiKey);
}

export interface SiteTelemetryParams {
  site_id: string;
  start: string;
  end: string;
  resolution?: Resolution5Min;
  limit?: number;
}

export async function siteTelemetry(
  env: HonoEnv['Bindings'],
  params: SiteTelemetryParams,
): Promise<{ records: { [asset_id: string]: TelemetryRecord[] } }> {
  const u = resolveUrls(env);
  if (!u) throw asobaUnconfigured();
  const url = `${u.telemetry}/telemetry/site${qs({
    site_id: params.site_id,
    start: params.start,
    end: params.end,
    resolution: params.resolution || '5min',
    limit: params.limit ?? 1000,
  })}`;
  return call<{ records: { [asset_id: string]: TelemetryRecord[] } }>(url, u.apiKey);
}

export async function telemetryDataPeriod(
  env: HonoEnv['Bindings'],
  params: { site_id: string; asset_id?: string },
): Promise<DataPeriod> {
  const u = resolveUrls(env);
  if (!u) throw asobaUnconfigured();
  const url = `${u.telemetry}/telemetry/data-period${qs({
    site_id: params.site_id,
    asset_id: params.asset_id,
  })}`;
  return call<DataPeriod>(url, u.apiKey);
}

// ─── OODA Alerts ───────────────────────────────────────────────────────

export interface TerminalAlertsParams {
  terminal_device_id: string;
  site_id: string;
  start: string;
  end: string;
  resolution?: ResolutionOoda;
  limit?: number;
  cursor?: string;
}

export async function terminalAlerts(
  env: HonoEnv['Bindings'],
  params: TerminalAlertsParams,
): Promise<{ alerts: OodaAlert[] }> {
  const u = resolveUrls(env);
  if (!u) throw asobaUnconfigured();
  const url = `${u.ooda}/ooda/terminal${qs({
    terminal_device_id: params.terminal_device_id,
    site_id: params.site_id,
    start: params.start,
    end: params.end,
    resolution: params.resolution || 'minute',
    limit: params.limit ?? 1000,
    cursor: params.cursor,
  })}`;
  return call<{ alerts: OodaAlert[] }>(url, u.apiKey);
}

export interface SiteAlertsParams {
  site_id: string;
  start: string;
  end: string;
  resolution?: ResolutionOoda;
  limit?: number;
}

export async function siteAlerts(
  env: HonoEnv['Bindings'],
  params: SiteAlertsParams,
): Promise<{ alerts: { [terminal_device_id: string]: OodaAlert[] } }> {
  const u = resolveUrls(env);
  if (!u) throw asobaUnconfigured();
  const url = `${u.ooda}/ooda/site${qs({
    site_id: params.site_id,
    start: params.start,
    end: params.end,
    resolution: params.resolution || 'minute',
    limit: params.limit ?? 1000,
  })}`;
  return call<{ alerts: { [terminal_device_id: string]: OodaAlert[] } }>(url, u.apiKey);
}

export async function oodaDataPeriod(
  env: HonoEnv['Bindings'],
  params: { site_id: string; terminal_device_id?: string },
): Promise<DataPeriod> {
  const u = resolveUrls(env);
  if (!u) throw asobaUnconfigured();
  const url = `${u.ooda}/ooda/data-period${qs({
    site_id: params.site_id,
    terminal_device_id: params.terminal_device_id,
  })}`;
  return call<DataPeriod>(url, u.apiKey);
}

// ─── Helpers ───────────────────────────────────────────────────────────

function asobaUnconfigured(): AsobaError {
  return {
    status: 503,
    message: 'asoba_not_configured',
    body: { hint: 'Set ASOBA_API_KEY via `wrangler secret put ASOBA_API_KEY`' },
  };
}

export function isAsobaConfigured(env: HonoEnv['Bindings']): boolean {
  return Boolean(env.ASOBA_API_KEY);
}

/**
 * Aggregate site telemetry into a single timeseries (sum of inverter power per
 * timestamp). Useful for site-level dashboards where individual inverter rows
 * are too granular.
 */
export function aggregateSitePower(
  records: { [asset_id: string]: TelemetryRecord[] },
): Array<{ timestamp: string; power_kw: number; kwh: number; assets: number }> {
  const buckets = new Map<string, { power_kw: number; kwh: number; assets: number }>();
  for (const list of Object.values(records)) {
    for (const r of list) {
      const ts = r.timestamp;
      const cur = buckets.get(ts) || { power_kw: 0, kwh: 0, assets: 0 };
      cur.power_kw += Number(r.power || 0);
      cur.kwh += Number(r.kWh || 0);
      cur.assets += 1;
      buckets.set(ts, cur);
    }
  }
  return Array.from(buckets.entries())
    .map(([timestamp, v]) => ({ timestamp, ...v }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
