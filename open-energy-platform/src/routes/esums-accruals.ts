// ────────────────────────────────────────────────────────────────────────────
// /api/esums/accruals — GoldRush value-stream accrual ledger
//
// Three streams per station per hour:
//   carbon_tco2e  — tCO₂e avoided (kwh × SA grid intensity 950 gCO₂e/kWh)
//   revenue_zar   — fund revenue (kwh × tariff_rate_zar_per_kwh)
//   savings_zar   — customer savings (kwh × customer_tariff_rate_zar_per_kwh)
//
// Routes:
//   GET  /               — aggregate totals + period summary
//   GET  /time-series    — daily series for charts
//   POST /compute        — run hourly compute across all active stations
//   POST /backfill       — pull historical data from SolaX API per station
// ────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { getHistoricalData } from '../utils/inverter-adapters';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const SA_CARBON_INTENSITY_DEFAULT = 950; // gCO₂e/kWh — DEFF 2023 gazette
const CUSTOMER_TARIFF_DEFAULT = 2.50;    // ZAR/kWh — typical C&I Megaflex

// ─────────────────────────────────────────────────────────────────────────────
// Core: compute accruals for one station from telemetry snapshot
// Called by POST /compute and the hourly cron.
// ─────────────────────────────────────────────────────────────────────────────

export async function computeStationAccruals(
  stationId: string,
  env: HonoEnv['Bindings'],
): Promise<{ kwh_delta: number; rows_written: number }> {
  // Station + credentials
  const station = await env.DB
    .prepare('SELECT ss.*, mc.tariff_rate_zar_per_kwh, mc.customer_tariff_rate_zar_per_kwh, mc.carbon_intensity_gco2_per_kwh FROM solax_stations ss LEFT JOIN manufacturer_credentials mc ON mc.participant_id = ss.participant_id AND mc.manufacturer = ss.manufacturer WHERE ss.id = ?')
    .bind(stationId)
    .first<Record<string, unknown>>();
  if (!station) return { kwh_delta: 0, rows_written: 0 };

  // Current telemetry snapshot
  const snap = await env.DB
    .prepare('SELECT total_kwh FROM station_telemetry_snapshot WHERE station_id = ?')
    .bind(stationId)
    .first<{ total_kwh: number | null }>();
  const currentTotalKwh = snap?.total_kwh ?? 0;
  if (currentTotalKwh <= 0) return { kwh_delta: 0, rows_written: 0 };

  // Last accrual
  const lastAccrual = await env.DB
    .prepare('SELECT cumulative_kwh, period_hour FROM site_accruals WHERE station_id = ? ORDER BY period_hour DESC LIMIT 1')
    .bind(stationId)
    .first<{ cumulative_kwh: number; period_hour: string }>();

  const prevKwh = lastAccrual?.cumulative_kwh ?? 0;
  const kwhDelta = Math.max(0, currentTotalKwh - prevKwh);
  if (kwhDelta < 0.001) return { kwh_delta: 0, rows_written: 0 };

  // Rate parameters (fall back to defaults)
  const tariffRate = (station.tariff_rate_zar_per_kwh as number | null) ?? 1.28;
  const customerRate = (station.customer_tariff_rate_zar_per_kwh as number | null) ?? CUSTOMER_TARIFF_DEFAULT;
  const carbonIntensity = (station.carbon_intensity_gco2_per_kwh as number | null) ?? SA_CARBON_INTENSITY_DEFAULT;

  const carbonTco2e = kwhDelta * (carbonIntensity / 1_000_000);
  const revenueZar = kwhDelta * tariffRate;
  const savingsZar = kwhDelta * customerRate;

  const now = new Date().toISOString();
  const periodHour = now.slice(0, 13) + ':00:00Z'; // truncate to hour
  const id = crypto.randomUUID();
  const isBackfill = lastAccrual ? 0 : 1; // first compute = backfill of all historical kWh

  await env.DB
    .prepare(`INSERT INTO site_accruals (id, station_id, site_id, participant_id, period_hour, kwh_delta, cumulative_kwh, carbon_tco2e, revenue_zar, savings_zar, tariff_rate_used, customer_tariff_rate_used, carbon_intensity_used, is_backfill, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(station_id, period_hour) DO UPDATE SET
        kwh_delta = excluded.kwh_delta, cumulative_kwh = excluded.cumulative_kwh,
        carbon_tco2e = excluded.carbon_tco2e, revenue_zar = excluded.revenue_zar,
        savings_zar = excluded.savings_zar, updated_at = excluded.updated_at`)
    .bind(id, stationId, station.site_id ?? null, station.participant_id,
      periodHour, kwhDelta, currentTotalKwh, carbonTco2e, revenueZar, savingsZar,
      tariffRate, customerRate, carbonIntensity, isBackfill, now, now)
    .run();

  return { kwh_delta: kwhDelta, rows_written: 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Backfill: pull per-day history from SolaX API
// Groups hourly data points by calendar day, takes max dailyYield = day total.
// ─────────────────────────────────────────────────────────────────────────────

export async function backfillStationHistory(
  stationId: string,
  env: HonoEnv['Bindings'],
  chunkStartMs?: number,  // start of this chunk (ms); defaults to 30 days ago
  chunkEndMs?: number,    // end of this chunk (ms); defaults to now-1h
): Promise<{ days_backfilled: number; hours_backfilled?: number; kwh_total: number; more_available?: boolean; next_from_ms?: number }> {
  const station = await env.DB
    .prepare(`SELECT ss.*, mc.tariff_rate_zar_per_kwh, mc.customer_tariff_rate_zar_per_kwh, mc.carbon_intensity_gco2_per_kwh,
        mc.client_id, mc.client_secret, mc.auth_type, mc.api_key, mc.token, mc.username, mc.password, mc.base_url, mc.site_id AS cred_site_id, mc.extra_config
      FROM solax_stations ss
      LEFT JOIN manufacturer_credentials mc ON mc.participant_id = ss.participant_id AND mc.manufacturer = ss.manufacturer
      WHERE ss.id = ?`)
    .bind(stationId)
    .first<Record<string, unknown>>();
  if (!station) return { days_backfilled: 0, kwh_total: 0 };

  if (station.manufacturer !== 'solax') return { days_backfilled: 0, kwh_total: 0 };

  const creds = {
    manufacturer: station.manufacturer as 'solax',
    auth_type: (station.auth_type as 'oauth2_client_creds') ?? 'oauth2_client_creds',
    client_id: (station.client_id as string | null) ?? null,
    client_secret: (station.client_secret as string | null) ?? null,
    api_key: null, token: null, username: null, password: null,
    base_url: (station.base_url as string | null) ?? null,
    site_id: (station.cred_site_id as string | null) ?? null,
    extra_config: (station.extra_config as string | null) ?? null,
  };

  if (!creds.client_id && env.SOLAX_CLIENT_ID) creds.client_id = env.SOLAX_CLIENT_ID;
  if (!creds.client_secret && env.SOLAX_CLIENT_SECRET) creds.client_secret = env.SOLAX_CLIENT_SECRET;

  if (!creds.client_id || !creds.client_secret) return { days_backfilled: 0, kwh_total: 0 };

  const tariffRate = (station.tariff_rate_zar_per_kwh as number | null) ?? 1.28;
  const customerRate = (station.customer_tariff_rate_zar_per_kwh as number | null) ?? CUSTOMER_TARIFF_DEFAULT;
  const carbonIntensity = (station.carbon_intensity_gco2_per_kwh as number | null) ?? SA_CARBON_INTENSITY_DEFAULT;
  const deviceSn = station.device_sn as string;

  // Hourly granularity — W71 predictive ML needs 1-hour resolution.
  //
  // SolaX enforces a 12-hour max per history request; we use 11-hour windows.
  // Serial requests only (no concurrency) — SolaX silently returns empty for
  // concurrent calls against the same token.
  //
  // Chunk size defaults to 30 days (~65 windows × ~600ms each ≈ 40s) so each
  // HTTP call completes within the CF Worker wall-clock budget.
  // Callers iterate through 12 months by passing next_from_ms from prior response.
  const HOUR_MS = 60 * 60 * 1000;
  const WINDOW_MS = 11 * HOUR_MS;

  const fullStartMs = Date.now() - 365 * 24 * HOUR_MS;
  const endMs = chunkEndMs ?? (Date.now() - HOUR_MS);
  const startMs = chunkStartMs ?? (endMs - 30 * 24 * HOUR_MS);
  const clampedStart = Math.max(startMs, fullStartMs);

  const windows: number[] = [];
  let w = clampedStart;
  while (w < endMs) {
    windows.push(w);
    w += WINDOW_MS;
  }

  if (windows.length === 0) {
    const more = clampedStart > fullStartMs;
    return { days_backfilled: 0, kwh_total: 0, more_available: more, next_from_ms: more ? clampedStart - 30 * 24 * HOUR_MS : undefined };
  }

  // Collect hourly totalYield readings. Serial to avoid SolaX rate-limit on
  // concurrent same-token requests.
  const hourTotals = new Map<string, number>(); // "2026-06-04T17" → max totalYield kWh that hour

  for (const winStart of windows) {
    const winEnd = Math.min(winStart + WINDOW_MS, endMs);
    try {
      const points = await getHistoricalData(creds, deviceSn, winStart, winEnd, 60);
      for (const p of points) {
        if (!p.ts || !p.total_kwh) continue;
        const hourKey = p.ts.slice(0, 13); // "2026-06-04T17"
        const prev = hourTotals.get(hourKey) ?? 0;
        if (p.total_kwh > prev) hourTotals.set(hourKey, p.total_kwh);
      }
    } catch { /* skip failed window */ }
  }

  if (hourTotals.size === 0) {
    const more = clampedStart > fullStartMs;
    return { days_backfilled: 0, kwh_total: 0, more_available: more, next_from_ms: more ? startMs - 30 * 24 * HOUR_MS : undefined };
  }

  // Sort hour keys chronologically, compute delta = totalYield[i] − totalYield[i−1].
  const sortedHours = [...hourTotals.keys()].sort();
  type HourPoint = { hourKey: string; kwhDelta: number; totalYield: number };
  const hourPoints: HourPoint[] = sortedHours.map((hk, i) => {
    const total = hourTotals.get(hk)!;
    const prevTotal = i > 0 ? (hourTotals.get(sortedHours[i - 1]) ?? total) : total;
    return { hourKey: hk, kwhDelta: Math.max(0, total - prevTotal), totalYield: total };
  });

  // Upsert one accrual row per hour. ON CONFLICT ensures idempotency.
  const uniqueDays = new Set<string>();
  let cumulative = 0;
  let daysWritten = 0;

  for (const pt of hourPoints) {
    const kwhDelta = pt.kwhDelta;
    cumulative += kwhDelta;
    const carbonTco2e = kwhDelta * (carbonIntensity / 1_000_000);
    const revenueZar = kwhDelta * tariffRate;
    const savingsZar = kwhDelta * customerRate;
    const periodHour = pt.hourKey + ':00:00Z'; // "2026-06-04T17:00:00Z"
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    uniqueDays.add(pt.hourKey.slice(0, 10));

    await env.DB
      .prepare(`INSERT INTO site_accruals (id, station_id, site_id, participant_id, period_hour, kwh_delta, cumulative_kwh, carbon_tco2e, revenue_zar, savings_zar, tariff_rate_used, customer_tariff_rate_used, carbon_intensity_used, is_backfill, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(station_id, period_hour) DO UPDATE SET
          kwh_delta = excluded.kwh_delta, cumulative_kwh = excluded.cumulative_kwh,
          carbon_tco2e = excluded.carbon_tco2e, revenue_zar = excluded.revenue_zar,
          savings_zar = excluded.savings_zar, updated_at = excluded.updated_at`)
      .bind(id, stationId, station.site_id ?? null, station.participant_id,
        periodHour, kwhDelta, cumulative, carbonTco2e, revenueZar, savingsZar,
        tariffRate, customerRate, carbonIntensity, now, now)
      .run();

    daysWritten++;
  }

  const more = clampedStart > fullStartMs;
  return {
    days_backfilled: uniqueDays.size,
    hours_backfilled: daysWritten,
    kwh_total: cumulative,
    more_available: more,
    next_from_ms: more ? startMs - 30 * 24 * HOUR_MS : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/esums/accruals?period=today|week|month|ytd&participant_id=...
app.get('/', async (c) => {
  const period = c.req.query('period') ?? 'month';
  const participantId = c.req.query('participant_id');
  const user = getCurrentUser(c);
  const resolvedParticipant = (participantId && ['admin', 'support'].includes(user.role))
    ? participantId
    : user.id;

  const now = new Date();
  let sinceDate: string;
  switch (period) {
    case 'today':   sinceDate = now.toISOString().slice(0, 10); break;
    case 'week':    sinceDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10); break;
    case 'ytd':     sinceDate = now.getFullYear() + '-01-01'; break;
    default:        sinceDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10); // month
  }

  const rows = await c.env.DB
    .prepare(`SELECT
        sa.station_id,
        ss.plant_name, ss.device_sn, ss.site_id,
        SUM(sa.kwh_delta)    AS total_kwh,
        SUM(sa.carbon_tco2e) AS total_carbon_tco2e,
        SUM(sa.revenue_zar)  AS total_revenue_zar,
        SUM(sa.savings_zar)  AS total_savings_zar,
        MAX(sa.period_hour)  AS last_accrual_at
      FROM site_accruals sa
      JOIN solax_stations ss ON ss.id = sa.station_id
      WHERE sa.participant_id = ?
        AND sa.period_hour >= ?
      GROUP BY sa.station_id
      ORDER BY total_revenue_zar DESC`)
    .bind(resolvedParticipant, sinceDate + 'T00:00:00Z')
    .all<Record<string, unknown>>();

  // Fleet totals
  const totals = (rows.results ?? []).reduce(
    (acc: { kwh: number; carbon_tco2e: number; revenue_zar: number; savings_zar: number }, r: Record<string, unknown>) => {
      acc.kwh += (r.total_kwh as number) ?? 0;
      acc.carbon_tco2e += (r.total_carbon_tco2e as number) ?? 0;
      acc.revenue_zar += (r.total_revenue_zar as number) ?? 0;
      acc.savings_zar += (r.total_savings_zar as number) ?? 0;
      return acc;
    },
    { kwh: 0, carbon_tco2e: 0, revenue_zar: 0, savings_zar: 0 },
  );

  return c.json({ period, since: sinceDate, totals, stations: rows.results ?? [] });
});

// GET /api/esums/accruals/time-series?station_id=...&granularity=daily&period=month
app.get('/time-series', async (c) => {
  const stationId = c.req.query('station_id');
  const granularity = c.req.query('granularity') ?? 'daily';
  const period = c.req.query('period') ?? 'month';
  const user = getCurrentUser(c);

  const now = new Date();
  let sinceDate: string;
  switch (period) {
    case 'week':  sinceDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10); break;
    case 'ytd':   sinceDate = now.getFullYear() + '-01-01'; break;
    default:      sinceDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }

  const dateExpr = granularity === 'hourly'
    ? "substr(period_hour, 1, 13)"
    : "substr(period_hour, 1, 10)";

  const baseWhere = stationId
    ? `sa.station_id = ? AND sa.participant_id = ? AND sa.period_hour >= ?`
    : `sa.participant_id = ? AND sa.period_hour >= ?`;
  const bindings = stationId
    ? [stationId, user.id, sinceDate + 'T00:00:00Z']
    : [user.id, sinceDate + 'T00:00:00Z'];

  const rows = await c.env.DB
    .prepare(`SELECT
        ${dateExpr} AS bucket,
        SUM(sa.kwh_delta)    AS kwh,
        SUM(sa.carbon_tco2e) AS carbon_tco2e,
        SUM(sa.revenue_zar)  AS revenue_zar,
        SUM(sa.savings_zar)  AS savings_zar
      FROM site_accruals sa
      WHERE ${baseWhere}
      GROUP BY ${dateExpr}
      ORDER BY bucket ASC`)
    .bind(...bindings)
    .all<Record<string, unknown>>();

  return c.json({ granularity, period, since: sinceDate, series: rows.results ?? [] });
});

// POST /api/esums/accruals/compute — run hourly compute for all active stations
app.post('/compute', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const env = c.env;
  const stations = await env.DB
    .prepare('SELECT id FROM solax_stations WHERE status = ? AND participant_id = ?')
    .bind('active', user.id)
    .all<{ id: string }>();

  const results = [];
  for (const st of stations.results ?? []) {
    try {
      const r = await computeStationAccruals(st.id, env);
      results.push({ station_id: st.id, ...r });
    } catch (e) {
      results.push({ station_id: st.id, error: String(e) });
    }
  }
  return c.json({ computed: results.length, results });
});

// POST /api/esums/accruals/backfill — pull SolaX history for all/one station
//
// Body params:
//   station_id?      — limit to one station
//   participant_id?  — admin override to target another user's stations
//   chunk_end_ms?    — end of the 30-day window to process (default: now-1h)
//   chunk_start_ms?  — start of the 30-day window (default: chunk_end_ms - 30d)
//
// Returns more_available + next_from_ms when there is older data to fetch.
// Iterate by calling again with chunk_end_ms = next_from_ms + 30d,
// chunk_start_ms = next_from_ms.
app.post('/backfill', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    station_id?: string;
    participant_id?: string;
    chunk_end_ms?: number;
    chunk_start_ms?: number;
  }>().catch(() => ({ station_id: undefined, participant_id: undefined, chunk_end_ms: undefined, chunk_start_ms: undefined }));

  const env = c.env;
  const stationId = body.station_id;
  const targetParticipant = (body.participant_id && ['admin', 'support'].includes(user.role))
    ? body.participant_id
    : user.id;

  const stationFilter = stationId
    ? 'WHERE id = ? AND participant_id = ? AND status = ?'
    : 'WHERE participant_id = ? AND status = ?';
  const stationBinds: unknown[] = stationId
    ? [stationId, targetParticipant, 'active']
    : [targetParticipant, 'active'];

  const stations = await env.DB
    .prepare(`SELECT id FROM solax_stations ${stationFilter}`)
    .bind(...stationBinds)
    .all<{ id: string }>();

  // Run stations serially within each chunk to avoid SolaX rate-limiting.
  const results: unknown[] = [];
  for (const st of (stations.results ?? [])) {
    try {
      const r = await backfillStationHistory(st.id, env, body.chunk_start_ms, body.chunk_end_ms);
      results.push({ station_id: st.id, ...r });
    } catch (e) {
      results.push({ station_id: st.id, error: String(e) });
    }
  }
  return c.json({ stations_processed: results.length, results });
});

export default app;
