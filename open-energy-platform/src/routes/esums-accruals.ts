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

// PPA tariff with one escalation step. On/after stepDate (interpreted at the
// SAST day boundary, UTC+2), revenue uses stepRate; before it, base. Absent
// step → flat base for the whole history. e.g. Goldrush R1.23 → R1.3038 @ 2026-04-01.
export function tariffForPeriod(periodMs: number, base: number, stepDate: string | null, stepRate: number | null): number {
  if (stepRate == null || !stepDate) return base;
  const stepMs = Date.parse(`${stepDate}T00:00:00+02:00`);
  if (Number.isNaN(stepMs)) return base;
  return periodMs >= stepMs ? stepRate : base;
}

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
  // Tariff step: on/after tariff_step_date (SAST), revenue uses tariff_step_rate.
  const stepRate = station.tariff_step_rate as number | null;
  const stepDate = station.tariff_step_date as string | null;
  const rateAt = (periodHourMs: number): number => tariffForPeriod(periodHourMs, tariffRate, stepDate, stepRate);
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
    const periodHour = pt.hourKey + ':00:00Z';
    const periodTariff = rateAt(Date.parse(periodHour));
    const revenueZar = kwhDelta * periodTariff;
    const savingsZar = kwhDelta * customerRate;
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
        periodTariff, customerRate, carbonIntensity, now, now);
  });

  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }
  const daysWritten = stmts.length;

  // ── Telemetry plane (om_devices / om_telemetry) ──────────────────────────
  // The financial plane above feeds dashboards/settlement. O&M + W71 predictive
  // ML read the telemetry plane instead, which the historical backfill must seed
  // from the SAME SolaX readings — no new API calls, no synthetic data.
  // Idempotent: deterministic ids upsert on re-run.
  const omSiteId = (station.site_id as string | null) || `site_bf_${stationId}`;
  const omDeviceId = `omdev_${stationId}`;
  const lastHour = hourPoints[hourPoints.length - 1].hourKey + ':00:00Z';
  await env.DB.batch([
    // om_sites: reuse the station's linked site, or create a deterministic one.
    env.DB.prepare(`INSERT INTO om_sites (id, name, participant_id, technology, status, created_at, updated_at)
        VALUES (?, ?, ?, 'solar', 'operational', ?, ?) ON CONFLICT(id) DO NOTHING`)
      .bind(omSiteId, (station.plant_name as string | null) ?? deviceSn, station.participant_id, now, now),
    // om_devices: one inverter per SolaX station.
    env.DB.prepare(`INSERT INTO om_devices (id, site_id, device_type, manufacturer, serial_number, rated_kw, status, last_seen_at, created_at)
        VALUES (?, ?, 'inverter', 'solax', ?, ?, 'online', ?, ?)
        ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at, rated_kw = excluded.rated_kw`)
      .bind(omDeviceId, omSiteId, deviceSn, (station.rated_power_kw as number | null) ?? null, lastHour, now),
  ]);
  // Hourly telemetry rows. ac_kw ≈ interval kWh over a 1-hour interval (avg power);
  // yield_kwh carries the cumulative meter reading. ponytail: deterministic PK id
  // (omt_bf_<station>_<hour>) gives idempotency without a (device,ts) unique index.
  const telStmts = hourPoints.map(pt => {
    const periodHour = pt.hourKey + ':00:00Z';
    return env.DB.prepare(`INSERT INTO om_telemetry (id, device_id, site_id, ts, ac_kw, yield_kwh, interval_kwh, quality)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'valid')
        ON CONFLICT(id) DO UPDATE SET ac_kw = excluded.ac_kw, yield_kwh = excluded.yield_kwh, interval_kwh = excluded.interval_kwh`)
      .bind(`omt_bf_${stationId}_${pt.hourKey}`, omDeviceId, omSiteId, periodHour, pt.kwhDelta, pt.totalYield, pt.kwhDelta);
  });
  for (let i = 0; i < telStmts.length; i += 100) {
    await env.DB.batch(telStmts.slice(i, i + 100));
  }

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

// GET /api/esums/accruals/rows — per-hour rows in standard { success, data } format for UI table
app.get('/rows', async (c) => {
  const user = getCurrentUser(c);
  const participantId = c.req.query('participant_id');
  const stationId = c.req.query('station_id');
  const period = c.req.query('period') ?? 'month';
  const limit = Math.min(parseInt(c.req.query('limit') ?? '200'), 500);

  const resolvedParticipant = (participantId && ['admin', 'support'].includes(user.role))
    ? participantId
    : user.id;

  const now = new Date();
  let sinceDate: string;
  switch (period) {
    case 'today': sinceDate = now.toISOString().slice(0, 10); break;
    case 'week':  sinceDate = new Date(now.getTime() - 7   * 86400000).toISOString().slice(0, 10); break;
    case '3m':    sinceDate = new Date(now.getTime() - 90  * 86400000).toISOString().slice(0, 10); break;
    case '6m':    sinceDate = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10); break;
    case 'ytd':   sinceDate = now.getFullYear() + '-01-01'; break;
    case '1y':    sinceDate = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10); break;
    case 'all':   sinceDate = '2000-01-01'; break;
    default:      sinceDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }

  let where = `(sa.participant_id = ? OR ss.lender_participant_id = ? OR ss.carbon_participant_id = ?) AND sa.period_hour >= ?`;
  const binds: (string | number)[] = [resolvedParticipant, resolvedParticipant, resolvedParticipant, sinceDate + 'T00:00:00Z'];
  if (stationId) { where += ` AND sa.station_id = ?`; binds.push(stationId); }

  const rows = await c.env.DB
    .prepare(`
      SELECT sa.id, sa.station_id, ss.plant_name AS station_name,
        sa.period_hour, sa.kwh_delta, sa.cumulative_kwh,
        sa.carbon_tco2e, sa.revenue_zar, sa.savings_zar,
        sa.tariff_rate_used, sa.is_backfill
      FROM site_accruals sa
      JOIN solax_stations ss ON ss.id = sa.station_id
      WHERE ${where}
      ORDER BY sa.period_hour DESC
      LIMIT ?
    `)
    .bind(...binds, limit)
    .all<Record<string, unknown>>();

  return c.json({ success: true, data: rows.results ?? [] });
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

// ── Resumable job-driven historic import ──────────────────────────────────
// A full portfolio backfill walks back up to 2 years, one ~7-day chunk per
// station per tick, and can run for hours. solax_backfill_jobs persists per
// station progress so the frontend can drive it across many short requests
// and show a live status panel. start -> creates one job per active station;
// tick -> advances each job one chunk; status -> per-station + aggregate %.

const TWO_YEARS_MS = 730 * 24 * 60 * 60 * 1000;
const CHUNK_MS = 7 * 24 * 60 * 60 * 1000;

// POST /backfill/start — (re)queue one job per active SolaX station.
app.post('/backfill/start', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{ participant_id?: string }>().catch(() => ({} as { participant_id?: string }));
  const env = c.env;
  const participant = (body.participant_id && ['admin', 'support'].includes(user.role))
    ? body.participant_id : user.id;

  const nowMs = Date.now();
  const runEnd = nowMs - 60 * 60 * 1000;       // newest instant: now - 1h
  const windowStart = nowMs - TWO_YEARS_MS;    // oldest instant: now - 2y
  const now = new Date().toISOString();

  const stations = await env.DB
    .prepare(`SELECT id, device_sn, plant_name FROM solax_stations WHERE participant_id = ? AND status = ? AND manufacturer = ?`)
    .bind(participant, 'active', 'solax')
    .all<{ id: string; device_sn: string | null; plant_name: string | null }>();

  const rows = stations.results ?? [];
  for (const st of rows) {
    await env.DB.prepare(
      `INSERT INTO solax_backfill_jobs
         (id, participant_id, station_id, device_sn, plant_name, status, window_start_ms, run_end_ms, cursor_end_ms, hours_written, kwh_total, last_error, started_at, finished_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, 0, 0, NULL, NULL, NULL, ?, ?)
       ON CONFLICT(participant_id, station_id) DO UPDATE SET
         status='queued', window_start_ms=excluded.window_start_ms, run_end_ms=excluded.run_end_ms,
         cursor_end_ms=excluded.cursor_end_ms, hours_written=0, kwh_total=0, empty_streak=0,
         last_error=NULL, started_at=NULL, finished_at=NULL, updated_at=excluded.updated_at`
    ).bind(crypto.randomUUID(), participant, st.id, st.device_sn ?? null, st.plant_name ?? null,
      windowStart, runEnd, runEnd, now, now).run();
  }
  return c.json({ queued: rows.length, run_end_ms: runEnd, window_start_ms: windowStart });
});

// POST /backfill/tick — advance up to max_jobs jobs by one chunk each.
// Frontend loops this until aggregate done. Bounded so each request stays short.
app.post('/backfill/tick', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{ participant_id?: string; max_jobs?: number }>().catch(() => ({} as { participant_id?: string; max_jobs?: number }));
  const env = c.env;
  const participant = (body.participant_id && ['admin', 'support'].includes(user.role))
    ? body.participant_id : user.id;
  const maxJobs = Math.max(1, Math.min(10, body.max_jobs ?? 4));

  // Least-done first (highest cursor_end_ms) so progress spreads evenly.
  const jobs = await env.DB
    .prepare(`SELECT * FROM solax_backfill_jobs WHERE participant_id = ? AND status IN ('queued','running') ORDER BY cursor_end_ms DESC LIMIT ?`)
    .bind(participant, maxJobs)
    .all<Record<string, unknown>>();

  const ticked: unknown[] = [];
  for (const job of (jobs.results ?? [])) {
    const stationId = job.station_id as string;
    const windowStart = job.window_start_ms as number;
    const cursorEnd = job.cursor_end_ms as number;
    const chunkStart = Math.max(windowStart, cursorEnd - CHUNK_MS);
    const now = new Date().toISOString();
    const hoursSoFar = (job.hours_written as number) ?? 0;
    const prevStreak = (job.empty_streak as number) ?? 0;
    try {
      const r = await backfillStationHistory(stationId, env, chunkStart, cursorEnd);
      const gotHours = r.hours_backfilled ?? 0;
      // Stop walking back once we pass commissioning: SolaX has no data before a
      // plant existed, so a run of empty chunks AFTER real data means end-of-history.
      // ponytail: 3-week threshold tolerates a real outage; a longer gap stops early
      //   and loses only older low-value history — raise EMPTY_STOP if that bites.
      const EMPTY_STOP = 3;
      const newStreak = gotHours > 0 ? 0 : (hoursSoFar > 0 ? prevStreak + 1 : 0);
      const reachedFloor = chunkStart <= windowStart || r.more_available === false || newStreak >= EMPTY_STOP;
      const newCursor = reachedFloor ? windowStart : chunkStart;
      await env.DB.prepare(
        `UPDATE solax_backfill_jobs SET
           status = ?, cursor_end_ms = ?, hours_written = hours_written + ?, kwh_total = kwh_total + ?,
           empty_streak = ?, last_error = NULL, started_at = COALESCE(started_at, ?), finished_at = ?, updated_at = ?
         WHERE id = ?`
      ).bind(
        reachedFloor ? 'done' : 'running', newCursor, gotHours, r.kwh_total ?? 0,
        newStreak, now, reachedFloor ? now : null, now, job.id as string
      ).run();
      ticked.push({ station_id: stationId, hours: gotHours, kwh: r.kwh_total ?? 0, done: reachedFloor });
    } catch (e) {
      await env.DB.prepare(
        `UPDATE solax_backfill_jobs SET status='failed', last_error=?, updated_at=? WHERE id = ?`
      ).bind(String(e).slice(0, 500), now, job.id as string).run();
      ticked.push({ station_id: stationId, error: String(e) });
    }
  }

  const remaining = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM solax_backfill_jobs WHERE participant_id = ? AND status IN ('queued','running')`)
    .bind(participant)
    .first<{ n: number }>();
  return c.json({ ticked, remaining: remaining?.n ?? 0 });
});

// GET /backfill/status — per-station rows + aggregate progress for the panel.
app.get('/backfill/status', async (c) => {
  const user = getCurrentUser(c);
  const env = c.env;
  const qp = c.req.query('participant_id');
  const participant = (qp && ['admin', 'support'].includes(user.role)) ? qp : user.id;

  const jobs = await env.DB
    .prepare(`SELECT station_id, plant_name, device_sn, status, window_start_ms, run_end_ms, cursor_end_ms, hours_written, kwh_total, last_error, started_at, finished_at, updated_at FROM solax_backfill_jobs WHERE participant_id = ? ORDER BY plant_name`)
    .bind(participant)
    .all<Record<string, unknown>>();

  const rows: Record<string, unknown>[] = (jobs.results ?? []).map(j => {
    const span = (j.run_end_ms as number) - (j.window_start_ms as number);
    const done = (j.run_end_ms as number) - (j.cursor_end_ms as number);
    const pct = span > 0 ? Math.max(0, Math.min(100, Math.round((done / span) * 100))) : 0;
    return { ...j, pct: j.status === 'done' ? 100 : pct };
  });
  const overall = rows.length ? Math.round(rows.reduce((s, r) => s + (r.pct as number), 0) / rows.length) : 0;
  const active = rows.some(r => r.status === 'queued' || r.status === 'running');
  return c.json({
    overall_pct: overall, active, stations: rows.length,
    hours_total: rows.reduce((s, r) => s + ((r.hours_written as number) ?? 0), 0),
    kwh_total: rows.reduce((s, r) => s + ((r.kwh_total as number) ?? 0), 0),
    jobs: rows,
  });
});

// POST /backfill/finalize — after the import drains, run everything downstream.
// Backfill only writes the raw site_accruals ledger; the derived surfaces every
// role reads (offtaker/IPP settlement invoices, carbon credits, carbon-fund
// holdings) are materialized views that need a rebuild pass. This sweeps the
// station owner through materializeFinancials (idempotent, full-history) so all
// retrospective months/years appear at once, then fires the cross-role cascade.
app.post('/backfill/finalize', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{ participant_id?: string }>().catch(() => ({} as { participant_id?: string }));
  const env = c.env;
  const participant = (body.participant_id && ['admin', 'support'].includes(user.role))
    ? body.participant_id : user.id;

  // Every backfill job for this participant shares the owner; one materialize
  // pass rebuilds all their stations' invoices/credits/holdings across history.
  const result = await materializeFinancials(participant, env);

  // ONE completion notification per stakeholder, not one per period/invoice/credit.
  // The backfill + materialize passes are silent (no cascade per row); the only
  // signal a role gets about a retrospective rebuild is this single "now live"
  // notice. Deterministic id (notif_live_<owner>_<recipient>) + INSERT OR REPLACE
  // => re-running finalize refreshes the one notice instead of spamming.
  const liveTitle = 'Live: historic data loaded';
  const liveBody = `Historic data load complete. Your portfolio is now live with ${result.invoices} settlement invoice(s), ${result.credits} carbon credit period(s) and ${result.holdings} fund holding(s) rebuilt across full history.`;
  const liveData = JSON.stringify({ retrospective: true, ...result });
  await env.DB.prepare(`
    INSERT OR REPLACE INTO notifications (id, participant_id, type, title, body, data, created_at)
    SELECT 'notif_live_' || ? || '_' || r.pid, r.pid, 'esums_live', ?, ?, ?, datetime('now')
    FROM (
      SELECT ? AS pid
      UNION SELECT offtaker_participant_id FROM solax_stations WHERE participant_id = ? AND offtaker_participant_id IS NOT NULL AND offtaker_participant_id != ''
      UNION SELECT carbon_participant_id   FROM solax_stations WHERE participant_id = ? AND carbon_participant_id   IS NOT NULL AND carbon_participant_id   != ''
      UNION SELECT lender_participant_id   FROM solax_stations WHERE participant_id = ? AND lender_participant_id   IS NOT NULL AND lender_participant_id   != ''
    ) r
    WHERE r.pid IS NOT NULL AND r.pid != ''
  `).bind(participant, liveTitle, liveBody, liveData, participant, participant, participant, participant)
    .run().catch(() => { /* non-fatal: FK/table absence must not fail the rebuild */ });

  // Audit-only cascade (no notification rule matches this event; per-row pushes
  // would storm, so the rebuild stays silent and the notice above is the signal).
  await fireCascade({
    event: 'esums_financials_materialized' as EventType,
    actor_id: user.id,
    entity_type: 'esums_station',
    entity_id: participant,
    data: { participant_id: participant, retrospective: true, suppress_notifications: true, ...result },
    env,
  }).catch(() => {});

  return c.json({ success: true, participant_id: participant, notified: true, ...result });
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

  // Onboarding edge case: carbon_holdings.project_id REFERENCES carbon_projects(id).
  // On a fresh takeon the project metadata row does not exist yet, so the holdings
  // INSERT below FK-explodes. Provision it idempotently here from the carbon fund
  // that actually owns the accruals, so finalize is self-sufficient for every role
  // instead of needing a manual D1 seed.
  // ponytail: one fleet project per onboarded carbon fund; matches the constant
  // project_id used by the holdings insert. INSERT OR IGNORE = safe on re-run.
  await env.DB.prepare(`
    INSERT OR IGNORE INTO carbon_projects (
      id, project_name, project_number, project_type, methodology,
      host_country, developer_id, status, registration_date
    )
    SELECT
      'cp_goldrush_fleet',
      'Goldrush C&I Solar Fleet',
      'OE-CP-GOLDRUSH',
      'solar_pv',
      'grid-connected renewable (AMS-I.D)',
      'South Africa',
      MIN(ss.carbon_participant_id),
      'active',
      date('now')
    FROM site_accruals sa
    JOIN solax_stations ss ON ss.id = sa.station_id
    WHERE sa.participant_id = ?
      AND ss.carbon_participant_id IS NOT NULL AND ss.carbon_participant_id != ''
      AND sa.carbon_tco2e > 0 ${stationClause}
    HAVING COUNT(*) > 0
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

// PATCH /:id — lifecycle: verify | retire
creditApp.patch('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json<{ action: string; notes?: string; registry_ref?: string }>();
  const { action, notes, registry_ref } = body;

  const VALID_ACTIONS = ['verify', 'retire'] as const;
  type CreditAction = typeof VALID_ACTIONS[number];
  if (!VALID_ACTIONS.includes(action as CreditAction)) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  const isAdmin = ['admin', 'support'].includes(user.role);
  const isCarbonFund = user.role === 'carbon_fund';
  if (!isAdmin && !isCarbonFund) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const row = await c.env.DB
    .prepare(`SELECT * FROM esums_carbon_credits WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const current = row.status as string;
  const TRANSITIONS: Record<string, string[]> = { verify: ['provisional'], retire: ['verified'] };
  const NEXT: Record<string, string> = { verify: 'verified', retire: 'retired' };

  if (!TRANSITIONS[action].includes(current)) {
    return c.json({ success: false, error: `Cannot ${action} credit in status '${current}'` }, 422);
  }

  const now = new Date().toISOString();
  const extraFields: string[] = [];
  const extraBinds: (string | null)[] = [];
  if (registry_ref) { extraFields.push('registry_ref = ?'); extraBinds.push(registry_ref); }
  if (notes) { extraFields.push('notes = ?'); extraBinds.push(notes); }
  if (action === 'retire') { extraFields.push('retired_at = ?'); extraBinds.push(now); }

  const setClause = ['status = ?', 'updated_at = ?', ...extraFields].join(', ');
  await c.env.DB
    .prepare(`UPDATE esums_carbon_credits SET ${setClause} WHERE id = ?`)
    .bind(NEXT[action], now, ...extraBinds, id)
    .run();

  await fireCascade({
    event: `esums_credit_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'esums_carbon_credit',
    entity_id: id,
    data: {
      action,
      from_status: current,
      to_status: NEXT[action],
      station_id: row.station_id,
      period_start: row.period_start,
      carbon_tco2e: row.carbon_tco2e,
      registry_ref: registry_ref ?? null,
      notes: notes ?? null,
    },
    env: c.env,
  }).catch(() => {});

  return c.json({ success: true, data: { id, status: NEXT[action] } });
});

export const esumsCreditRoutes = creditApp;
