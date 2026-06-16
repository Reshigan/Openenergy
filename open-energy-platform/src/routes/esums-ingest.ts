// ════════════════════════════════════════════════════════════════════════
// Esums — Public ingestion endpoints (no user JWT).
//
// Mounted at /api/esums-ingest by src/index.ts. Devices, on-prem gateways
// and CSV uploads send a per-site ingest token in `Authorization: Bearer`.
// Tokens hash to om_ingest_keys.token_hash; rows land in om_telemetry and
// are bracketed by an om_connector_runs record so operators can audit
// every batch on the Live tab.
//
// Endpoints
//   POST /telemetry          JSON  — { readings: [{ device_id, ts, ... }] }
//   POST /telemetry/csv      text/csv body — header + rows (see CSV format)
//
// CSV format (header row required, columns may appear in any order):
//   device_id,ts,ac_kw,dc_kw,interval_kwh,voltage_v,current_a,frequency_hz,
//   temperature_c,irradiance_w_m2,flow_lps,pressure_bar,level_m,
//   treated_kl,raw_kl,pump_kw,status_code,quality
//
// All scope checks: a key issued for site_id=X may only write telemetry
// for devices that already belong to site X. Rows for other sites are
// counted as rejected and surfaced in error_sample.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { extractBearer, verifyIngestKey } from '../utils/esums-ingest-auth';

export const esumsIngest = new Hono<HonoEnv>();

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const TELEMETRY_COLS = [
  'ac_kw', 'dc_kw', 'yield_kwh', 'interval_kwh',
  'voltage_v', 'current_a', 'frequency_hz',
  'temperature_c', 'irradiance_w_m2',
  'flow_lps', 'pressure_bar', 'level_m',
  'treated_kl', 'raw_kl', 'pump_kw',
] as const;

interface RawReading {
  device_id?: string;
  ts?: string;
  status_code?: string;
  quality?: string;
  [k: string]: unknown;
}

interface IngestResult {
  written: number;
  rejected: number;
  first_ts: string | null;
  last_ts: string | null;
  first_error: string | null;
}

async function ingestReadings(
  env: HonoEnv['Bindings'],
  siteId: string,
  readings: RawReading[],
): Promise<IngestResult> {
  // Pre-load every device for this site once so we don't N+1 the DB.
  const devs = await env.DB.prepare(
    'SELECT id FROM om_devices WHERE site_id = ?',
  ).bind(siteId).all<{ id: string }>();
  const allowed = new Set((devs.results || []).map((d) => d.id));

  let written = 0;
  let rejected = 0;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let firstError: string | null = null;

  for (const r of readings) {
    if (!r.device_id || !r.ts) {
      rejected += 1;
      if (!firstError) firstError = 'row missing device_id or ts';
      continue;
    }
    if (!allowed.has(r.device_id)) {
      rejected += 1;
      if (!firstError) firstError = `device_id ${r.device_id} not in site scope`;
      continue;
    }
    const id = genId('omt');
    try {
      await env.DB.prepare(`
        INSERT INTO om_telemetry
          (id, device_id, site_id, ts, ac_kw, dc_kw, yield_kwh, interval_kwh,
           voltage_v, current_a, frequency_hz, temperature_c, irradiance_w_m2,
           flow_lps, pressure_bar, level_m, treated_kl, raw_kl, pump_kw,
           status_code, quality)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        id, r.device_id, siteId, r.ts,
        num(r.ac_kw), num(r.dc_kw), num(r.yield_kwh), num(r.interval_kwh),
        num(r.voltage_v), num(r.current_a), num(r.frequency_hz),
        num(r.temperature_c), num(r.irradiance_w_m2),
        num(r.flow_lps), num(r.pressure_bar), num(r.level_m),
        num(r.treated_kl), num(r.raw_kl), num(r.pump_kw),
        r.status_code || null, r.quality || 'valid',
      ).run();
      written += 1;
      if (!firstTs || r.ts < firstTs) firstTs = r.ts;
      if (!lastTs || r.ts > lastTs) lastTs = r.ts;
    } catch (e) {
      rejected += 1;
      if (!firstError) firstError = e instanceof Error ? e.message : 'insert failed';
    }
  }

  if (written > 0) {
    // Keep last_seen_at fresh for all devices that pushed in this batch.
    const seen = new Map<string, string>();
    for (const r of readings) {
      if (r.device_id && r.ts && allowed.has(r.device_id)) {
        const cur = seen.get(r.device_id);
        if (!cur || r.ts > cur) seen.set(r.device_id, r.ts);
      }
    }
    // last_seen_at refresh is best-effort — never fail ingest on it.
    const seenStmts: D1PreparedStatement[] = [];
    for (const [deviceId, ts] of seen) {
      seenStmts.push(env.DB.prepare(
        'UPDATE om_devices SET last_seen_at = ? WHERE id = ?',
      ).bind(ts, deviceId));
    }
    try {
      for (let i = 0; i < seenStmts.length; i += 100) await env.DB.batch(seenStmts.slice(i, i + 100));
    } catch { /* non-critical */ }
  }

  return { written, rejected, first_ts: firstTs, last_ts: lastTs, first_error: firstError };
}

async function logConnectorRun(
  env: HonoEnv['Bindings'],
  siteId: string,
  source: string,
  ingestKeyId: string | null,
  result: IngestResult,
  rowsReceived: number,
  metadata: Record<string, unknown>,
): Promise<string> {
  const id = genId('omcr');
  const status = rowsReceived === 0
    ? 'failed'
    : result.rejected === 0
      ? 'ok'
      : result.written === 0
        ? 'failed'
        : 'partial';
  await env.DB.prepare(`
    INSERT INTO om_connector_runs
      (id, site_id, source, ingest_key_id, started_at, finished_at, status,
       rows_received, rows_written, rows_rejected, first_ts, last_ts,
       error_sample, metadata)
    VALUES (?,?,?,?,datetime('now'),datetime('now'),?,?,?,?,?,?,?,?)
  `).bind(
    id, siteId, source, ingestKeyId, status,
    rowsReceived, result.written, result.rejected,
    result.first_ts, result.last_ts,
    result.first_error, JSON.stringify(metadata),
  ).run().catch(() => {});
  return id;
}

// ─── POST /telemetry ─────────────────────────────────────────────────────
esumsIngest.post('/telemetry', async (c) => {
  const token = extractBearer(c.req.header('Authorization'));
  if (!token) return c.json({ success: false, error: 'ingest token required' }, 401);
  const key = await verifyIngestKey(c.env, token);
  if (!key) return c.json({ success: false, error: 'invalid or revoked ingest token' }, 401);

  const body = await c.req.json().catch(() => ({} as any));
  const readings: RawReading[] = Array.isArray(body?.readings) ? body.readings : [body];
  const result = await ingestReadings(c.env, key.site_id, readings);
  const runId = await logConnectorRun(c.env, key.site_id, 'api_push', key.id, result, readings.length, {
    user_agent: c.req.header('User-Agent') || null,
  });

  return c.json({
    success: result.written > 0 || readings.length === 0,
    data: {
      run_id: runId,
      written: result.written,
      rejected: result.rejected,
      first_error: result.first_error,
    },
  });
});

// ─── POST /telemetry/csv ─────────────────────────────────────────────────
esumsIngest.post('/telemetry/csv', async (c) => {
  const token = extractBearer(c.req.header('Authorization'));
  if (!token) return c.json({ success: false, error: 'ingest token required' }, 401);
  const key = await verifyIngestKey(c.env, token);
  if (!key) return c.json({ success: false, error: 'invalid or revoked ingest token' }, 401);

  const text = await c.req.text();
  if (!text || text.length < 10) return c.json({ success: false, error: 'csv body required' }, 400);

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return c.json({ success: false, error: 'csv must have header + ≥1 row' }, 400);
  const headers = lines[0].split(',').map((h) => h.trim());
  if (!headers.includes('device_id') || !headers.includes('ts')) {
    return c.json({ success: false, error: 'csv must contain device_id and ts columns' }, 400);
  }
  const idx = (k: string) => headers.indexOf(k);

  const readings: RawReading[] = [];
  for (const ln of lines.slice(1)) {
    const cols = ln.split(',');
    const r: RawReading = {
      device_id: (cols[idx('device_id')] || '').trim(),
      ts: (cols[idx('ts')] || '').trim(),
    };
    for (const col of TELEMETRY_COLS) {
      const i = idx(col);
      if (i >= 0) r[col] = (cols[i] || '').trim();
    }
    const si = idx('status_code'); if (si >= 0) r.status_code = (cols[si] || '').trim() || undefined;
    const qi = idx('quality');     if (qi >= 0) r.quality     = (cols[qi] || '').trim() || undefined;
    readings.push(r);
  }

  const result = await ingestReadings(c.env, key.site_id, readings);
  const runId = await logConnectorRun(c.env, key.site_id, 'csv_upload', key.id, result, readings.length, {
    bytes: text.length,
    rows: readings.length,
    user_agent: c.req.header('User-Agent') || null,
  });

  return c.json({
    success: result.written > 0,
    data: {
      run_id: runId,
      rows: readings.length,
      written: result.written,
      rejected: result.rejected,
      first_error: result.first_error,
    },
  });
});

export default esumsIngest;
