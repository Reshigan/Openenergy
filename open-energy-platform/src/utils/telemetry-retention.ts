// ════════════════════════════════════════════════════════════════════════
// telemetry-retention — daily rollup + raw purge.
//
// Runs nightly. For yesterday:
//   1. Upsert one om_telemetry_daily row per (device, day) summarising the
//      energy + water metrics from om_telemetry.
//   2. Upsert the matching om_telemetry_weekly row aggregated per site.
//   3. Delete om_telemetry rows older than the policy's raw_keep_days.
//
// All analytics (PR trend, CUF, opportunity detectors, lender packs) read
// from the rollups when raw is gone, so the customer experience is the
// same while D1 storage stays bounded.
// ════════════════════════════════════════════════════════════════════════

import { HonoEnv } from './types';

export async function runTelemetryRollupAndPurge(env: HonoEnv['Bindings']): Promise<{
  daily_rows: number;
  weekly_rows: number;
  raw_purged: number;
}> {
  const policy = await env.DB.prepare(
    `SELECT raw_keep_days FROM om_retention_policy WHERE k = 'default'`,
  ).first<{ raw_keep_days: number }>().catch(() => null);
  const rawKeepDays = Math.max(1, Number(policy?.raw_keep_days || 14));

  // 1. Daily rollup — yesterday only. Use date(ts) so daylight savings
  //    aliasing doesn't matter; we group on UTC day which is what we ingest.
  const dailyRes = await env.DB.prepare(`
    INSERT INTO om_telemetry_daily
      (device_id, site_id, day, kwh, ac_kw_avg, ac_kw_peak,
       flow_kl, pressure_bar_avg, level_m_end_of_day,
       treated_kl, raw_kl, pump_kwh, readings_n)
    SELECT
      device_id, site_id, date(ts) AS day,
      SUM(COALESCE(interval_kwh, 0)) AS kwh,
      AVG(ac_kw) AS ac_kw_avg,
      MAX(ac_kw) AS ac_kw_peak,
      SUM(COALESCE(flow_lps, 0)) * 0.015      AS flow_kl,    -- 15 min × 60 s / 1000
      AVG(pressure_bar) AS pressure_bar_avg,
      (SELECT level_m FROM om_telemetry t2
        WHERE t2.device_id = om_telemetry.device_id
          AND date(t2.ts) = date(om_telemetry.ts)
        ORDER BY t2.ts DESC LIMIT 1) AS level_m_end_of_day,
      SUM(COALESCE(treated_kl, 0)) AS treated_kl,
      SUM(COALESCE(raw_kl, 0))     AS raw_kl,
      SUM(COALESCE(pump_kw,  0) * 0.25) AS pump_kwh,         -- 15 min interval
      COUNT(*) AS readings_n
    FROM om_telemetry
    WHERE date(ts) = date('now', '-1 day')
    GROUP BY device_id, site_id, date(ts)
    ON CONFLICT(device_id, day) DO UPDATE SET
      kwh = excluded.kwh,
      ac_kw_avg = excluded.ac_kw_avg,
      ac_kw_peak = excluded.ac_kw_peak,
      flow_kl = excluded.flow_kl,
      pressure_bar_avg = excluded.pressure_bar_avg,
      level_m_end_of_day = excluded.level_m_end_of_day,
      treated_kl = excluded.treated_kl,
      raw_kl = excluded.raw_kl,
      pump_kwh = excluded.pump_kwh,
      readings_n = excluded.readings_n,
      rolled_at = datetime('now')
  `).run().catch(() => ({ meta: { changes: 0 } as any }));

  // 2. Weekly rollup — read FROM the daily we just wrote (so it's a single
  //    derived chain). ISO week format follows strftime('%Y-%W').
  const weeklyRes = await env.DB.prepare(`
    INSERT INTO om_telemetry_weekly
      (site_id, iso_week, kwh, flow_kl, treated_kl, raw_kl, pump_kwh, capacity_factor)
    SELECT
      d.site_id,
      strftime('%Y-%W', d.day) AS iso_week,
      SUM(d.kwh), SUM(d.flow_kl), SUM(d.treated_kl), SUM(d.raw_kl), SUM(d.pump_kwh),
      CASE WHEN s.capacity_mw > 0
           THEN SUM(d.kwh) / (s.capacity_mw * 1000 * 24 * 7)
           ELSE NULL END
    FROM om_telemetry_daily d
    JOIN om_sites s ON s.id = d.site_id
    WHERE d.day >= date('now', '-14 days')
    GROUP BY d.site_id, strftime('%Y-%W', d.day)
    ON CONFLICT(site_id, iso_week) DO UPDATE SET
      kwh = excluded.kwh,
      flow_kl = excluded.flow_kl,
      treated_kl = excluded.treated_kl,
      raw_kl = excluded.raw_kl,
      pump_kwh = excluded.pump_kwh,
      capacity_factor = excluded.capacity_factor,
      rolled_at = datetime('now')
  `).run().catch(() => ({ meta: { changes: 0 } as any }));

  // 3. Purge raw rows past the retention horizon.
  const purgeRes = await env.DB.prepare(
    `DELETE FROM om_telemetry WHERE date(ts) < date('now', ? || ' days')`,
  ).bind(`-${rawKeepDays}`).run().catch(() => ({ meta: { changes: 0 } as any }));

  return {
    daily_rows: Number(dailyRes.meta?.changes || 0),
    weekly_rows: Number(weeklyRes.meta?.changes || 0),
    raw_purged: Number(purgeRes.meta?.changes || 0),
  };
}
