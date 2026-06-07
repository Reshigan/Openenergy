// ═══════════════════════════════════════════════════════════════════════════
// Layer D — metrics rollup. Aggregates the append-only oe_platform_events sink
// into the pre-aggregated rollup tables (oe_metrics_daily per-day-per-chain,
// oe_chain_metrics cumulative snapshot) so dashboards read cheap rollups, never
// the raw event log, at national scale. Run nightly from the 5 0 * * * cron over
// 'yesterday'. Idempotent: re-running a date upserts on UNIQUE(metric_date,
// chain_key). Uses env.DB.batch() for the writes.
//
// open_count / terminal_count in oe_chain_metrics are derived from the event log
// (not the live chain tables) via computeOpenTerminal: for each entity under a
// chain_key its latest source_chain_status is bucketed open vs terminal. Entities
// whose latest status is null/empty (non-lifecycle keys like admin_revenue and
// the synthetic 'unattributed') count in neither bucket.
// ═══════════════════════════════════════════════════════════════════════════
import type { HonoEnv } from './types';
import { computeOpenTerminal } from './chain-state';

type DB = HonoEnv['Bindings']['DB'];

interface DailyAgg {
  chain_key: string;
  events_count: number;
  value_total_zar: number;
  sla_breaches: number;
  regulator_crossings: number;
}

export async function rollupMetrics(
  env: HonoEnv['Bindings'],
  date: string, // YYYY-MM-DD
): Promise<{ date: string; chains: number; events: number }> {
  const db: DB = env.DB;

  // 1. Daily per-chain aggregate for `date`.
  const agg = await db.prepare(
    `SELECT COALESCE(NULLIF(chain_key, ''), 'unattributed') AS chain_key,
            COUNT(*) AS events_count,
            COALESCE(SUM(entity_value), 0) AS value_total_zar,
            SUM(CASE WHEN event LIKE '%sla_breach%' THEN 1 ELSE 0 END) AS sla_breaches,
            SUM(CASE WHEN affected_roles LIKE '%regulator%' THEN 1 ELSE 0 END) AS regulator_crossings
       FROM oe_platform_events
      WHERE substr(occurred_at, 1, 10) = ?
      GROUP BY COALESCE(NULLIF(chain_key, ''), 'unattributed')`,
  ).bind(date).all<DailyAgg>();

  const rows = (agg.results || []) as DailyAgg[];
  if (rows.length === 0) return { date, chains: 0, events: 0 };

  // 2. Upsert oe_metrics_daily. Deterministic id keeps re-runs single-row.
  const dailyStmts = rows.map((r) =>
    db.prepare(
      `INSERT INTO oe_metrics_daily
         (id, metric_date, chain_key, events_count, value_total_zar, sla_breaches, regulator_crossings)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(metric_date, chain_key) DO UPDATE SET
         events_count = excluded.events_count,
         value_total_zar = excluded.value_total_zar,
         sla_breaches = excluded.sla_breaches,
         regulator_crossings = excluded.regulator_crossings`,
    ).bind(
      `md_${date}_${r.chain_key}`, date, r.chain_key,
      r.events_count, r.value_total_zar, r.sla_breaches, r.regulator_crossings,
    ),
  );
  await db.batch(dailyStmts);

  // 3. Refresh oe_chain_metrics for the chains touched today: cumulative value +
  //    breaches off oe_metrics_daily, last_event_at off the raw events.
  const chainKeys = rows.map((r) => r.chain_key);
  const now = new Date().toISOString();
  const snapStmts = [];
  for (const ck of chainKeys) {
    const cum = await db.prepare(
      `SELECT COALESCE(SUM(value_total_zar), 0) AS value_total_zar,
              COALESCE(SUM(sla_breaches), 0) AS breach_count
         FROM oe_metrics_daily WHERE chain_key = ?`,
    ).bind(ck).first<any>();
    const last = await db.prepare(
      `SELECT MAX(occurred_at) AS last_event_at FROM oe_platform_events
        WHERE COALESCE(NULLIF(chain_key, ''), 'unattributed') = ?`,
    ).bind(ck).first<any>();
    const ot = await computeOpenTerminal(db, ck);
    snapStmts.push(
      db.prepare(
        `INSERT INTO oe_chain_metrics
           (chain_key, open_count, terminal_count, breach_count, value_total_zar, last_event_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chain_key) DO UPDATE SET
           open_count = excluded.open_count,
           terminal_count = excluded.terminal_count,
           breach_count = excluded.breach_count,
           value_total_zar = excluded.value_total_zar,
           last_event_at = excluded.last_event_at,
           updated_at = excluded.updated_at`,
      ).bind(
        ck, ot.open_count, ot.terminal_count,
        Number(cum?.breach_count || 0), Number(cum?.value_total_zar || 0),
        last?.last_event_at ?? null, now,
      ),
    );
  }
  await db.batch(snapStmts);

  const events = rows.reduce((s, r) => s + r.events_count, 0);
  return { date, chains: rows.length, events };
}
