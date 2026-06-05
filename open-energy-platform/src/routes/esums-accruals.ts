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
import { getHistoricalData, getRealtimeReading } from '../utils/inverter-adapters';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';

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

  // Fetch realtime reading and refresh the snapshot if it's stale (>70 min) or absent.
  // This avoids needing manufacturer_credentials in D1 — falls back to env vars like
  // the backfill does, so the hourly cron works out-of-the-box.
  const snapRow = await env.DB
    .prepare('SELECT total_kwh, daily_kwh, updated_at FROM station_telemetry_snapshot WHERE station_id = ?')
    .bind(stationId)
    .first<{ total_kwh: number | null; daily_kwh: number | null; updated_at: string | null }>();

  const staleThresholdMs = 70 * 60 * 1000;
  const snapAge = snapRow?.updated_at
    ? Date.now() - new Date(snapRow.updated_at).getTime()
    : Infinity;

  if (snapAge > staleThresholdMs && station.manufacturer === 'solax') {
    try {
      const clientId = (station.client_id as string | null) ?? (env as unknown as Record<string, string>).SOLAX_CLIENT_ID ?? null;
      const clientSecret = (station.client_secret as string | null) ?? (env as unknown as Record<string, string>).SOLAX_CLIENT_SECRET ?? null;
      if (clientId && clientSecret) {
        const creds = {
          manufacturer: 'solax' as const,
          auth_type: 'oauth2_client_creds' as const,
          client_id: clientId, client_secret: clientSecret,
          api_key: null, token: null, username: null, password: null,
          base_url: (station.base_url as string | null) ?? null,
          site_id: null, extra_config: null,
        };
        const reading = await getRealtimeReading(creds, station.device_sn as string);
        const now = new Date().toISOString();
        await env.DB
          .prepare(`INSERT INTO station_telemetry_snapshot
              (station_id, ts, ac_kw, dc_kw, daily_kwh, total_kwh,
               battery_soc, temperature_c, online, raw_json, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(station_id) DO UPDATE SET
              ts=excluded.ts, ac_kw=excluded.ac_kw, dc_kw=excluded.dc_kw,
              daily_kwh=excluded.daily_kwh, total_kwh=excluded.total_kwh,
              battery_soc=excluded.battery_soc, temperature_c=excluded.temperature_c,
              online=excluded.online, raw_json=excluded.raw_json, updated_at=excluded.updated_at`)
          .bind(stationId, now,
            reading.ac_kw ?? 0, reading.dc_kw ?? 0,
            reading.daily_kwh ?? 0, reading.total_kwh ?? 0,
            reading.battery_soc ?? null, reading.temperature_c ?? null,
            reading.online ? 1 : 0,
            JSON.stringify(reading), now)
          .run();
      }
    } catch { /* non-fatal — fall through to snapshot read below */ }
  }

  const snap = snapRow ?? await env.DB
    .prepare('SELECT daily_kwh FROM station_telemetry_snapshot WHERE station_id = ?')
    .bind(stationId)
    .first<{ daily_kwh: number | null }>();

  // Use daily_kwh (resets at midnight) — avoids comparing lifetime totals against
  // chunk-local cumulative values written by backfill, which would produce huge spurious deltas.
  const currentDailyKwh = (snap as { daily_kwh: number | null } | null)?.daily_kwh ?? 0;
  if (currentDailyKwh <= 0) return { kwh_delta: 0, rows_written: 0 };

  // Today's prior accruals since UTC midnight — correctly accounts for both backfill and live-poll rows.
  const todayMidnight = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  const priorRow = await env.DB
    .prepare('SELECT SUM(kwh_delta) AS today_kwh FROM site_accruals WHERE station_id = ? AND period_hour >= ?')
    .bind(stationId, todayMidnight)
    .first<{ today_kwh: number | null }>();
  const todayPriorKwh = priorRow?.today_kwh ?? 0;

  const kwhDelta = Math.max(0, currentDailyKwh - todayPriorKwh);
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

  await env.DB
    .prepare(`INSERT INTO site_accruals (id, station_id, site_id, participant_id, period_hour, kwh_delta, cumulative_kwh, carbon_tco2e, revenue_zar, savings_zar, tariff_rate_used, customer_tariff_rate_used, carbon_intensity_used, is_backfill, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(station_id, period_hour) DO UPDATE SET
        kwh_delta = excluded.kwh_delta, cumulative_kwh = excluded.cumulative_kwh,
        carbon_tco2e = excluded.carbon_tco2e, revenue_zar = excluded.revenue_zar,
        savings_zar = excluded.savings_zar, updated_at = excluded.updated_at`)
    .bind(id, stationId, station.site_id ?? null, station.participant_id,
      periodHour, kwhDelta, currentDailyKwh, carbonTco2e, revenueZar, savingsZar,
      tariffRate, customerRate, carbonIntensity, 0, now, now)
    .run();

  // ── Integration bridges: fan out to downstream modules if participant links set ──

  const carbonParticipantId = station.carbon_participant_id as string | null;
  const offtakerParticipantId = station.offtaker_participant_id as string | null;
  const lenderParticipantId = station.lender_participant_id as string | null;

  // Carbon credit bridge — upsert a monthly esums_carbon_credits record
  if (carbonParticipantId && carbonTco2e > 0) {
    const periodStart = periodHour.slice(0, 7) + '-01'; // first day of current month
    const monthEnd = new Date(new Date(periodHour).getFullYear(), new Date(periodHour).getMonth() + 1, 0)
      .toISOString().slice(0, 10);
    const creditId = `ecc_${stationId}_${periodStart}`;
    await env.DB
      .prepare(`INSERT INTO esums_carbon_credits
          (id, station_id, participant_id, period_start, period_end,
           kwh_generated, carbon_tco2e, carbon_intensity_gco2_per_kwh,
           tariff_rate_zar_per_kwh, revenue_zar, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'provisional',?,?)
        ON CONFLICT(id) DO UPDATE SET
          kwh_generated = kwh_generated + excluded.kwh_generated,
          carbon_tco2e  = carbon_tco2e  + excluded.carbon_tco2e,
          revenue_zar   = revenue_zar   + excluded.revenue_zar,
          updated_at = excluded.updated_at`)
      .bind(creditId, stationId, carbonParticipantId, periodStart, monthEnd,
        kwhDelta, carbonTco2e, carbonIntensity, tariffRate, revenueZar, now, now)
      .run().catch(() => { /* non-fatal — table may not exist yet */ });
  }

  // Settlement invoice bridge — upsert a monthly esums_settlement_invoices record
  if (offtakerParticipantId && revenueZar > 0) {
    const periodStart = periodHour.slice(0, 7) + '-01';
    const monthEnd = new Date(new Date(periodHour).getFullYear(), new Date(periodHour).getMonth() + 1, 0)
      .toISOString().slice(0, 10);
    const invoiceId = `esi_${stationId}_${periodStart}`;
    const vatRate = 15;
    const grossRevenue = revenueZar;
    const vatAmount = Math.round(grossRevenue * (vatRate / 100) * 100) / 100;
    const total = Math.round((grossRevenue + vatAmount) * 100) / 100;
    await env.DB
      .prepare(`INSERT INTO esums_settlement_invoices
          (id, station_id, from_participant_id, to_participant_id,
           period_start, period_end, kwh_delivered,
           tariff_rate_zar_per_kwh, gross_revenue_zar, vat_rate_pct,
           vat_amount_zar, total_zar, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?)
        ON CONFLICT(id) DO UPDATE SET
          kwh_delivered      = kwh_delivered      + excluded.kwh_delivered,
          gross_revenue_zar  = gross_revenue_zar  + excluded.gross_revenue_zar,
          vat_amount_zar     = vat_amount_zar     + excluded.vat_amount_zar,
          total_zar          = total_zar          + excluded.total_zar,
          updated_at = excluded.updated_at`)
      .bind(invoiceId, stationId, station.participant_id as string, offtakerParticipantId,
        periodStart, monthEnd, kwhDelta, tariffRate, grossRevenue, vatRate, vatAmount, total, now, now)
      .run().catch(() => { /* non-fatal */ });
  }

  // Cascade event — fans out to action queues, audit, notifications, webhooks
  await fireCascade({
    event: 'esums_accrual_computed' as EventType,
    actor_id: 'system',
    entity_type: 'esums_station',
    entity_id: stationId,
    data: {
      period_hour: periodHour,
      kwh_delta: kwhDelta,
      carbon_tco2e: carbonTco2e,
      revenue_zar: revenueZar,
      savings_zar: savingsZar,
      lender_participant_id: lenderParticipantId,
      carbon_participant_id: carbonParticipantId,
      offtaker_participant_id: offtakerParticipantId,
    },
    env,
  }).catch(() => { /* non-fatal */ });

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
  // Chunk size defaults to 7 days (~15 windows × ~1.4s each ≈ 21s) so each
  // HTTP call completes within the CF Worker wall-clock budget.
  // Callers iterate through 12 months by passing next_from_ms from prior response.
  const HOUR_MS = 60 * 60 * 1000;
  const WINDOW_MS = 11 * HOUR_MS;

  const fullStartMs = Date.now() - 730 * 24 * HOUR_MS; // 2-year window; covers pre-2026 commissioning
  const endMs = chunkEndMs ?? (Date.now() - HOUR_MS);
  const startMs = chunkStartMs ?? (endMs - 7 * 24 * HOUR_MS);
  const clampedStart = Math.max(startMs, fullStartMs);

  const windows: number[] = [];
  let w = clampedStart;
  while (w < endMs) {
    windows.push(w);
    w += WINDOW_MS;
  }

  if (windows.length === 0) {
    const more = clampedStart > fullStartMs;
    return { days_backfilled: 0, kwh_total: 0, more_available: more, next_from_ms: more ? clampedStart - 7 * 24 * HOUR_MS : undefined };
  }

  // Collect hourly totalYield readings.
  // CONCURRENCY=2 — SolaX silently returns empty when the same token has too
  // many simultaneous requests (tested: 20 concurrent = 0 data, 1 serial = OK).
  // 2 parallel is the empirically-safe balance of speed vs rate-limit avoidance.
  const CONCURRENCY = 2;
  const hourTotals = new Map<string, number>(); // "2026-06-04T17" → max totalYield kWh that hour

  for (let i = 0; i < windows.length; i += CONCURRENCY) {
    const batch = windows.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (winStart) => {
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
    }));
  }

  if (hourTotals.size === 0) {
    const more = clampedStart > fullStartMs;
    return { days_backfilled: 0, kwh_total: 0, more_available: more, next_from_ms: more ? startMs - 7 * 24 * HOUR_MS : undefined };
  }

  // Sort hour keys chronologically, compute delta = totalYield[i] − totalYield[i−1].
  const sortedHours = [...hourTotals.keys()].sort();
  type HourPoint = { hourKey: string; kwhDelta: number; totalYield: number };
  const hourPoints: HourPoint[] = sortedHours.map((hk, i) => {
    const total = hourTotals.get(hk)!;
    const prevTotal = i > 0 ? (hourTotals.get(sortedHours[i - 1]) ?? total) : total;
    return { hourKey: hk, kwhDelta: Math.max(0, total - prevTotal), totalYield: total };
  });

  // Build cumulative sums first, then batch-upsert in a single D1 round-trip.
  // Individual .run() per row was hitting the DO-eviction budget for 168+ rows.
  const uniqueDays = new Set<string>();
  let cumulative = 0;
  const now = new Date().toISOString();

  const stmts = hourPoints.map(pt => {
    const kwhDelta = pt.kwhDelta;
    cumulative += kwhDelta;
    const carbonTco2e = kwhDelta * (carbonIntensity / 1_000_000);
    const revenueZar = kwhDelta * tariffRate;
    const savingsZar = kwhDelta * customerRate;
    const periodHour = pt.hourKey + ':00:00Z';
    uniqueDays.add(pt.hourKey.slice(0, 10));
    return env.DB
      .prepare(`INSERT INTO site_accruals (id, station_id, site_id, participant_id, period_hour, kwh_delta, cumulative_kwh, carbon_tco2e, revenue_zar, savings_zar, tariff_rate_used, customer_tariff_rate_used, carbon_intensity_used, is_backfill, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(station_id, period_hour) DO UPDATE SET
          kwh_delta = excluded.kwh_delta, cumulative_kwh = excluded.cumulative_kwh,
          carbon_tco2e = excluded.carbon_tco2e, revenue_zar = excluded.revenue_zar,
          savings_zar = excluded.savings_zar, updated_at = excluded.updated_at`)
      .bind(crypto.randomUUID(), stationId, station.site_id ?? null, station.participant_id,
        periodHour, kwhDelta, cumulative, carbonTco2e, revenueZar, savingsZar,
        tariffRate, customerRate, carbonIntensity, now, now);
  });

  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }
  const daysWritten = stmts.length;

  const more = clampedStart > fullStartMs;
  return {
    days_backfilled: uniqueDays.size,
    hours_backfilled: daysWritten,
    kwh_total: cumulative,
    more_available: more,
    next_from_ms: more ? startMs - 7 * 24 * HOUR_MS : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/esums/accruals?period=today|week|month|ytd|1y|all&participant_id=...
// Visible to: IPP operator (owner), lender (financier), carbon fund, admin/support override.
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
    case 'week':    sinceDate = new Date(now.getTime() - 7   * 86400000).toISOString().slice(0, 10); break;
    case '1m':      sinceDate = new Date(now.getTime() - 30  * 86400000).toISOString().slice(0, 10); break;
    case '3m':      sinceDate = new Date(now.getTime() - 90  * 86400000).toISOString().slice(0, 10); break;
    case '6m':      sinceDate = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10); break;
    case 'ytd':     sinceDate = now.getFullYear() + '-01-01'; break;
    case '1y':      sinceDate = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10); break;
    case 'all':     sinceDate = '2000-01-01'; break;
    default:        sinceDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }

  // Match stations where the resolved participant is the operator, lender, or carbon fund
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
      WHERE (sa.participant_id = ? OR ss.lender_participant_id = ? OR ss.carbon_participant_id = ?)
        AND sa.period_hour >= ?
      GROUP BY sa.station_id
      ORDER BY total_revenue_zar DESC`)
    .bind(resolvedParticipant, resolvedParticipant, resolvedParticipant, sinceDate + 'T00:00:00Z')
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

// GET /api/esums/accruals/time-series?station_id=...&granularity=daily&period=month&participant_id=...
app.get('/time-series', async (c) => {
  const stationId = c.req.query('station_id');
  const granularity = c.req.query('granularity') ?? 'daily';
  const period = c.req.query('period') ?? 'month';
  const participantOverride = c.req.query('participant_id');
  const user = getCurrentUser(c);

  const effectiveParticipant = (participantOverride && ['admin', 'support'].includes(user.role))
    ? participantOverride
    : user.id;

  const now = new Date();
  let sinceDate: string;
  switch (period) {
    case 'today': sinceDate = now.toISOString().slice(0, 10); break;
    case 'week':  sinceDate = new Date(now.getTime() - 7   * 86400000).toISOString().slice(0, 10); break;
    case '1m':    sinceDate = new Date(now.getTime() - 30  * 86400000).toISOString().slice(0, 10); break;
    case '3m':    sinceDate = new Date(now.getTime() - 90  * 86400000).toISOString().slice(0, 10); break;
    case '6m':    sinceDate = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10); break;
    case 'ytd':   sinceDate = now.getFullYear() + '-01-01'; break;
    case '1y':    sinceDate = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10); break;
    case 'all':   sinceDate = '2000-01-01'; break;
    default:      sinceDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }

  const dateExpr = granularity === 'hourly'
    ? "substr(period_hour, 1, 13)"
    : "substr(period_hour, 1, 10)";

  // Allow operator, lender, and carbon fund to see time-series for their stations
  const baseWhere = stationId
    ? `sa.station_id = ? AND (sa.participant_id = ? OR ss.lender_participant_id = ? OR ss.carbon_participant_id = ?) AND sa.period_hour >= ?`
    : `(sa.participant_id = ? OR ss.lender_participant_id = ? OR ss.carbon_participant_id = ?) AND sa.period_hour >= ?`;
  const bindings = stationId
    ? [stationId, effectiveParticipant, effectiveParticipant, effectiveParticipant, sinceDate + 'T00:00:00Z']
    : [effectiveParticipant, effectiveParticipant, effectiveParticipant, sinceDate + 'T00:00:00Z'];

  const rows = await c.env.DB
    .prepare(`SELECT
        ${dateExpr} AS bucket,
        SUM(sa.kwh_delta)    AS kwh,
        SUM(sa.carbon_tco2e) AS carbon_tco2e,
        SUM(sa.revenue_zar)  AS revenue_zar,
        SUM(sa.savings_zar)  AS savings_zar
      FROM site_accruals sa
      JOIN solax_stations ss ON ss.id = sa.station_id
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
// Iterate by calling again with chunk_end_ms = next_from_ms + 7d,
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

// GET /api/esums/accruals/solax-probe?sn=X3F100J6779008&start_ms=...&end_ms=...
// Returns raw Solax API response for diagnosis — admin only
app.get('/solax-probe', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const env = c.env;
  const { sn, start_ms, end_ms, btype, interval_min, base } = c.req.query();
  if (!sn || !start_ms || !end_ms) return c.json({ error: 'sn, start_ms, end_ms required' }, 400);

  const clientId = env.SOLAX_CLIENT_ID as string | undefined;
  const clientSecret = env.SOLAX_CLIENT_SECRET as string | undefined;
  if (!clientId || !clientSecret) return c.json({ error: 'SOLAX credentials not configured' }, 503);

  // Get token
  const baseUrl = base === 'global' ? 'https://openapi.solaxcloud.com' : 'https://openapi-eu.solaxcloud.com';
  const tokenRes = await fetch(`${baseUrl}/openapi/auth/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  });
  const tokenJson = await tokenRes.json<{ code: number; result?: { access_token: string } }>();
  if (!tokenJson.result?.access_token) return c.json({ error: 'Token failed', tokenJson }, 502);

  const token = tokenJson.result.access_token;
  const params = new URLSearchParams({
    snList: sn,
    deviceType: '1',
    startTime: start_ms,
    endTime: end_ms,
    timeInterval: interval_min ?? '60',
    businessType: btype ?? '4',
  });

  const dataRes = await fetch(`${baseUrl}/openapi/v2/device/history_data?${params}`, {
    headers: { Authorization: `bearer ${token}`, Accept: '*/*' },
  });
  const raw = await dataRes.json();
  return c.json({ base: baseUrl, sn, start_ms, end_ms, btype: btype ?? '4', raw });
});

export default app;

// ─────────────────────────────────────────────────────────────────────────────
// Materialize: rebuild invoices + credits + holdings from site_accruals ledger
//
// Principle: site_accruals is the immutable ledger. Financial aggregations are
// materialized views always derivable from it. This function is idempotent.
// ─────────────────────────────────────────────────────────────────────────────

export async function materializeFinancials(
  participantId: string,
  env: HonoEnv['Bindings'],
  stationId?: string,
): Promise<{ invoices: number; credits: number; holdings: number }> {
  const stationClause = stationId ? 'AND sa.station_id = ?' : '';

  const invoiceResult = await env.DB.prepare(`
    INSERT OR REPLACE INTO esums_settlement_invoices (
      id, station_id, from_participant_id, to_participant_id,
      period_start, period_end, kwh_delivered,
      tariff_rate_zar_per_kwh, gross_revenue_zar, vat_rate_pct,
      vat_amount_zar, total_zar, status, invoice_number,
      issued_at, created_at, updated_at
    )
    SELECT
      'esi_' || sa.station_id || '_' || strftime('%Y-%m-01', sa.period_hour),
      sa.station_id,
      sa.participant_id,
      ss.offtaker_participant_id,
      strftime('%Y-%m-01', sa.period_hour),
      date(strftime('%Y-%m-01', sa.period_hour), '+1 month', '-1 day'),
      ROUND(SUM(sa.kwh_delta), 3),
      MAX(sa.tariff_rate_used),
      ROUND(SUM(sa.revenue_zar), 2),
      15,
      ROUND(SUM(sa.revenue_zar) * 0.15, 2),
      ROUND(SUM(sa.revenue_zar) * 1.15, 2),
      CASE WHEN strftime('%Y-%m', sa.period_hour) < strftime('%Y-%m', 'now') THEN 'issued' ELSE 'draft' END,
      CASE WHEN strftime('%Y-%m', sa.period_hour) < strftime('%Y-%m', 'now')
           THEN 'INV-NXT-' || strftime('%Y%m', sa.period_hour) || '-' || upper(substr(sa.station_id, -6, 4))
           ELSE NULL END,
      CASE WHEN strftime('%Y-%m', sa.period_hour) < strftime('%Y-%m', 'now')
           THEN date(strftime('%Y-%m-01', sa.period_hour), '+1 month') ELSE NULL END,
      datetime('now'), datetime('now')
    FROM site_accruals sa
    JOIN solax_stations ss ON ss.id = sa.station_id
    WHERE sa.participant_id = ?
      AND ss.offtaker_participant_id IS NOT NULL AND ss.offtaker_participant_id != ''
      AND sa.kwh_delta > 0 ${stationClause}
    GROUP BY sa.station_id, strftime('%Y-%m', sa.period_hour)
    HAVING SUM(sa.kwh_delta) > 0
  `).bind(...(stationId ? [participantId, stationId] : [participantId])).run();

  const creditResult = await env.DB.prepare(`
    INSERT OR REPLACE INTO esums_carbon_credits (
      id, station_id, participant_id, period_start, period_end,
      kwh_generated, carbon_tco2e, carbon_intensity_gco2_per_kwh,
      tariff_rate_zar_per_kwh, revenue_zar, status, created_at, updated_at
    )
    SELECT
      'ecc_' || sa.station_id || '_' || strftime('%Y-%m-01', sa.period_hour),
      sa.station_id,
      ss.carbon_participant_id,
      strftime('%Y-%m-01', sa.period_hour),
      date(strftime('%Y-%m-01', sa.period_hour), '+1 month', '-1 day'),
      ROUND(SUM(sa.kwh_delta), 3),
      ROUND(SUM(sa.carbon_tco2e), 6),
      MAX(sa.carbon_intensity_used),
      MAX(sa.tariff_rate_used),
      ROUND(SUM(sa.revenue_zar), 2),
      CASE WHEN strftime('%Y-%m', sa.period_hour) < strftime('%Y-%m', 'now') THEN 'verified' ELSE 'provisional' END,
      datetime('now'), datetime('now')
    FROM site_accruals sa
    JOIN solax_stations ss ON ss.id = sa.station_id
    WHERE sa.participant_id = ?
      AND ss.carbon_participant_id IS NOT NULL AND ss.carbon_participant_id != ''
      AND sa.carbon_tco2e > 0 ${stationClause}
    GROUP BY sa.station_id, strftime('%Y-%m', sa.period_hour)
    HAVING SUM(sa.carbon_tco2e) > 0
  `).bind(...(stationId ? [participantId, stationId] : [participantId])).run();

  const holdingResult = await env.DB.prepare(`
    INSERT OR REPLACE INTO carbon_holdings (
      id, participant_id, project_id, credit_type, quantity,
      vintage_year, acquisition_date, cost_basis, status
    )
    SELECT
      'ch_' || ss.carbon_participant_id || '_goldrush_' || strftime('%Y', sa.period_hour),
      ss.carbon_participant_id,
      'cp_goldrush_fleet',
      'VER',
      ROUND(SUM(sa.carbon_tco2e), 6),
      CAST(strftime('%Y', sa.period_hour) AS INTEGER),
      date(strftime('%Y', sa.period_hour) || '-12-31'),
      0.0,
      'available'
    FROM site_accruals sa
    JOIN solax_stations ss ON ss.id = sa.station_id
    WHERE sa.participant_id = ?
      AND ss.carbon_participant_id IS NOT NULL AND ss.carbon_participant_id != ''
      AND sa.carbon_tco2e > 0 ${stationClause}
    GROUP BY ss.carbon_participant_id, strftime('%Y', sa.period_hour)
    HAVING SUM(sa.carbon_tco2e) > 0
  `).bind(...(stationId ? [participantId, stationId] : [participantId])).run();

  return {
    invoices: invoiceResult.meta.changes,
    credits: creditResult.meta.changes,
    holdings: holdingResult.meta.changes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// /api/esums/settlement-invoices — invoice list + lifecycle
// ─────────────────────────────────────────────────────────────────────────────

const invoiceApp = new Hono<HonoEnv>();
invoiceApp.use('*', authMiddleware);

// POST /materialize — rebuild all invoices + credits + holdings from ledger
invoiceApp.post('/materialize', async (c) => {
  const user = getCurrentUser(c);
  const participantId = c.req.query('participant_id');
  const stationId = c.req.query('station_id') ?? undefined;

  const resolvedParticipant = (participantId && ['admin', 'support'].includes(user.role))
    ? participantId
    : user.id;

  const result = await materializeFinancials(resolvedParticipant, c.env, stationId);

  await fireCascade({
    event: 'esums_financials_materialized' as EventType,
    actor_id: user.id,
    entity_type: 'esums_station',
    entity_id: stationId ?? resolvedParticipant,
    data: { participant_id: resolvedParticipant, station_id: stationId ?? null, ...result },
    env: c.env,
  }).catch(() => {});

  return c.json({ success: true, data: result });
});

// GET / — list invoices visible to caller
invoiceApp.get('/', async (c) => {
  const user = getCurrentUser(c);
  const participantId = c.req.query('participant_id');
  const status = c.req.query('status');
  const period = c.req.query('period'); // e.g. '2026-04'
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200);

  const resolvedParticipant = (participantId && ['admin', 'support'].includes(user.role))
    ? participantId
    : user.id;

  let where = `(esi.from_participant_id = ? OR esi.to_participant_id = ?)`;
  const binds: (string | number)[] = [resolvedParticipant, resolvedParticipant];

  if (status) { where += ` AND esi.status = ?`; binds.push(status); }
  if (period) { where += ` AND strftime('%Y-%m', esi.period_start) = ?`; binds.push(period); }

  const rows = await c.env.DB
    .prepare(`
      SELECT esi.*,
        ss.plant_name AS station_name,
        fp.company_name AS from_name,
        tp.company_name AS to_name
      FROM esums_settlement_invoices esi
      JOIN solax_stations ss ON ss.id = esi.station_id
      LEFT JOIN participants fp ON fp.id = esi.from_participant_id
      LEFT JOIN participants tp ON tp.id = esi.to_participant_id
      WHERE ${where}
      ORDER BY esi.period_start DESC, esi.station_id
      LIMIT ?
    `)
    .bind(...binds, limit)
    .all();

  return c.json({ success: true, data: rows.results });
});

// GET /:id — single invoice
invoiceApp.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const row = await c.env.DB
    .prepare(`
      SELECT esi.*, ss.plant_name AS station_name,
        fp.company_name AS from_name, tp.company_name AS to_name
      FROM esums_settlement_invoices esi
      JOIN solax_stations ss ON ss.id = esi.station_id
      LEFT JOIN participants fp ON fp.id = esi.from_participant_id
      LEFT JOIN participants tp ON tp.id = esi.to_participant_id
      WHERE esi.id = ?
    `)
    .bind(id)
    .first<Record<string, unknown>>();

  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const allowed = ['admin', 'support'].includes(user.role)
    || row.from_participant_id === user.id
    || row.to_participant_id === user.id;
  if (!allowed) return c.json({ success: false, error: 'Forbidden' }, 403);

  return c.json({ success: true, data: row });
});

// PATCH /:id — lifecycle transitions
// Actions: issue | acknowledge | dispute | pay | void
invoiceApp.patch('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json<{ action: string; notes?: string; payment_ref?: string }>();
  const { action, notes, payment_ref } = body;

  const VALID_ACTIONS = ['issue', 'acknowledge', 'dispute', 'pay', 'void'] as const;
  type InvoiceAction = typeof VALID_ACTIONS[number];
  if (!VALID_ACTIONS.includes(action as InvoiceAction)) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  const row = await c.env.DB
    .prepare(`SELECT * FROM esums_settlement_invoices WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const current = row.status as string;
  const fromId = row.from_participant_id as string;
  const toId = row.to_participant_id as string;
  const isAdmin = ['admin', 'support'].includes(user.role);

  // Guard: who can do what
  const guards: Record<string, { allowedStatuses: string[]; allowedRoles: string[] }> = {
    issue:       { allowedStatuses: ['draft'],                  allowedRoles: ['admin', 'support', fromId] },
    acknowledge: { allowedStatuses: ['issued'],                 allowedRoles: ['admin', 'support', toId] },
    dispute:     { allowedStatuses: ['issued', 'acknowledged'], allowedRoles: ['admin', 'support', toId] },
    pay:         { allowedStatuses: ['issued', 'acknowledged'], allowedRoles: ['admin', 'support'] },
    void:        { allowedStatuses: ['draft', 'issued'],        allowedRoles: ['admin', 'support', fromId] },
  };

  const guard = guards[action];
  if (!guard.allowedStatuses.includes(current)) {
    return c.json({ success: false, error: `Cannot ${action} invoice in status '${current}'` }, 422);
  }
  if (!isAdmin && !guard.allowedRoles.includes(user.id)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const nextStatus: Record<string, string> = {
    issue: 'issued', acknowledge: 'issued', dispute: 'disputed', pay: 'paid', void: 'voided',
  };
  const now = new Date().toISOString();

  // Build update fields
  const extraFields: string[] = [];
  const extraBinds: (string | null)[] = [];
  if (action === 'issue') {
    extraFields.push('issued_at = ?', 'invoice_number = COALESCE(invoice_number, ?)');
    const monthStr = (row.period_start as string).slice(0, 7).replace('-', '');
    const inv = `INV-NXT-${monthStr}-${(row.station_id as string).slice(-4).toUpperCase()}`;
    extraBinds.push(now, inv);
  }
  if (action === 'pay') {
    extraFields.push('paid_at = ?', 'notes = COALESCE(?, notes)');
    extraBinds.push(now, payment_ref ?? null);
  }
  if (notes && action !== 'pay') {
    extraFields.push('notes = ?');
    extraBinds.push(notes);
  }

  const setClause = [`status = ?`, `updated_at = ?`, ...extraFields].join(', ');
  await c.env.DB
    .prepare(`UPDATE esums_settlement_invoices SET ${setClause} WHERE id = ?`)
    .bind(nextStatus[action], now, ...extraBinds, id)
    .run();

  await fireCascade({
    event: `esums_invoice_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'esums_invoice',
    entity_id: id,
    data: {
      action,
      from_status: current,
      to_status: nextStatus[action],
      station_id: row.station_id,
      from_participant_id: fromId,
      to_participant_id: toId,
      period_start: row.period_start,
      total_zar: row.total_zar,
      notes: notes ?? null,
    },
    env: c.env,
  }).catch(() => {});

  return c.json({ success: true, data: { id, status: nextStatus[action] } });
});

export const esumsInvoiceRoutes = invoiceApp;

// ─────────────────────────────────────────────────────────────────────────────
// /api/esums/carbon-credits — carbon credit list
// ─────────────────────────────────────────────────────────────────────────────

const creditApp = new Hono<HonoEnv>();
creditApp.use('*', authMiddleware);

// GET / — list credits visible to caller
creditApp.get('/', async (c) => {
  const user = getCurrentUser(c);
  const participantId = c.req.query('participant_id');
  const status = c.req.query('status');
  const stationId = c.req.query('station_id');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100'), 500);

  const resolvedParticipant = (participantId && ['admin', 'support'].includes(user.role))
    ? participantId
    : user.id;

  // Visible to: the credit participant (carbon fund), the station owner (IPP), admin
  let where = `(ecc.participant_id = ? OR ss.participant_id = ?)`;
  const binds: (string | number)[] = [resolvedParticipant, resolvedParticipant];

  if (status) { where += ` AND ecc.status = ?`; binds.push(status); }
  if (stationId) { where += ` AND ecc.station_id = ?`; binds.push(stationId); }

  const rows = await c.env.DB
    .prepare(`
      SELECT ecc.*, ss.plant_name AS station_name
      FROM esums_carbon_credits ecc
      JOIN solax_stations ss ON ss.id = ecc.station_id
      WHERE ${where}
      ORDER BY ecc.period_start DESC, ecc.station_id
      LIMIT ?
    `)
    .bind(...binds, limit)
    .all();

  const summary = await c.env.DB
    .prepare(`
      SELECT
        SUM(ecc.kwh_generated)  AS total_kwh,
        SUM(ecc.carbon_tco2e)   AS total_tco2e,
        COUNT(*)                AS total_periods,
        SUM(CASE WHEN ecc.status = 'verified' THEN ecc.carbon_tco2e ELSE 0 END) AS verified_tco2e,
        SUM(CASE WHEN ecc.status = 'provisional' THEN ecc.carbon_tco2e ELSE 0 END) AS provisional_tco2e
      FROM esums_carbon_credits ecc
      JOIN solax_stations ss ON ss.id = ecc.station_id
      WHERE ${where}
    `)
    .bind(...binds)
    .first<Record<string, unknown>>();

  return c.json({ success: true, data: rows.results, summary });
});

export const esumsCreditRoutes = creditApp;
