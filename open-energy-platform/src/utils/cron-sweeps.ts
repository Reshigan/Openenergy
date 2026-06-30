// ═══════════════════════════════════════════════════════════════════════════
// Cron-only sweep functions — VWAP mark publish, margin-call cycle, watershed
// anomaly scan, climate maturity refresh, OrderBook depth snapshots.
// Extracted/wired for the 33-pattern cron contract (src/index.ts runCron).
// Each is idempotent and safe to re-run; all identifier bindings use ? placeholders.
// ═══════════════════════════════════════════════════════════════════════════
import { HonoEnv } from './types';
import { fireCascade } from './cascade';
import { logger } from './logger';

function rid(p: string): string {
  return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Minimal fallbacks for crons without a dedicated sweep yet ──────────────
// Per the cron contract: missing exports get a minimal local fallback that
// logs a warning and returns, never failing boot. These two workflows (PFMI
// disclosure + trading-risk MTD digest) are currently manual-filing driven;
// the cron case is wired so the slot is a real call, not a silent no-op.
export async function runPfmiDisclosureSweep(
  env: HonoEnv['Bindings'],
): Promise<{ disclosures: number }> {
  logger.warn('cron_pfmi_disclosure_sweep_not_implemented', { env: (env as { ENVIRONMENT?: string }).ENVIRONMENT });
  return { disclosures: 0 };
}

export async function runTradingRiskMtdDigest(
  env: HonoEnv['Bindings'],
): Promise<{ digest: number }> {
  logger.warn('cron_trading_risk_mtd_digest_not_implemented', { env: (env as { ENVIRONMENT?: string }).ENVIRONMENT });
  return { digest: 0 };
}

// ─── VWAP mark publish ──────────────────────────────────────────────────────
// Mirrors the manual POST /api/trader-risk/mark-prices/vwap-run handler but
// runs across ALL (energy_type, delivery_date) shards for the given day.
// Without this the mark-price plane goes stale ~30 min after the last manual
// run, and pre-trade guards referencing mark_prices halt trading.
export async function publishVwapMarks(
  env: HonoEnv['Bindings'],
  markDate?: string,
): Promise<{ mark_date: string; marks_written: number }> {
  const day = markDate ?? new Date().toISOString().slice(0, 10);
  const rs = await env.DB.prepare(
    `SELECT o.energy_type, o.delivery_date,
            SUM(f.volume_mwh * f.price) AS gross,
            SUM(f.volume_mwh) AS vol
       FROM trade_fills f
       JOIN trade_orders o ON o.id = f.order_id
      WHERE f.executed_at LIKE ? || '%'
      GROUP BY o.energy_type, o.delivery_date`,
  ).bind(day).all<{ energy_type: string; delivery_date: string | null; gross: number; vol: number }>();

  let inserted = 0;
  for (const r of (rs.results || []) as { energy_type: string; delivery_date: string | null; gross: number; vol: number }[]) {
    if (!r.vol) continue;
    const vwap = r.gross / r.vol;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO mark_prices (id, energy_type, delivery_date, mark_date, mark_price_zar_mwh, source)
       VALUES (?, ?, ?, ?, ?, 'vwap')`,
    ).bind(rid('mp'), r.energy_type, r.delivery_date, day, vwap).run();
    inserted++;
  }
  return { mark_date: day, marks_written: inserted };
}

// ─── Margin-call cycle ─────────────────────────────────────────────────────
// Enumerates open oe_margin_calls past their deadline and escalates them.
// Issues no new calls here (those come from the mark-to-market plane); this
// sweep is the dunning/escalation tail that turns overdue → escalated and
// fires a cascade so downstream collections/credit teams see the flag.
export async function runMarginCallCycle(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; escalated: number }> {
  const overdue = await env.DB.prepare(
    `SELECT id, participant_id, required_amount_zar, posted_amount_zar, deadline_at
       FROM oe_margin_calls
      WHERE status IN ('open', 'partial')
        AND deadline_at < datetime('now')`,
  ).all<{ id: string; participant_id: string; required_amount_zar: number; posted_amount_zar: number; deadline_at: string }>();

  let escalated = 0;
  for (const mc of (overdue.results || []) as { id: string; participant_id: string; required_amount_zar: number; posted_amount_zar: number; deadline_at: string }[]) {
    const shortfall = mc.required_amount_zar - mc.posted_amount_zar;
    await env.DB.prepare(
      `UPDATE oe_margin_calls SET status = 'escalated' WHERE id = ? AND status IN ('open', 'partial')`,
    ).bind(mc.id).run();
    await fireCascade({
      event: 'trader.margin_call_escalated',
      actor_id: 'system',
      entity_type: 'oe_margin_calls',
      entity_id: mc.id,
      data: {
        participant_id: mc.participant_id,
        required_amount_zar: mc.required_amount_zar,
        posted_amount_zar: mc.posted_amount_zar,
        shortfall_zar: shortfall,
        deadline_at: mc.deadline_at,
      },
      env,
    }).catch(() => { /* cascade failure is non-fatal to the sweep */ });
    escalated++;
  }
  return { scanned: (overdue.results || []).length, escalated };
}

// ─── Watershed anomaly scan ─────────────────────────────────────────────────
// Cross-participant version of the per-org POST /watershed/anomalies/scan
// rules that don't need a single-participant bind: impossible (negative)
// emissions and duplicate activity postings. Flags every org in one pass.
export async function runWatershedAnomalyScan(
  env: HonoEnv['Bindings'],
): Promise<{ impossible: number; duplicates: number }> {
  // Rule: negative emissions (impossible_value, critical).
  const negs = await env.DB.prepare(
    `SELECT id, participant_id, emissions_kg_co2e FROM esg_activity_transactions
      WHERE emissions_kg_co2e < 0`,
  ).all<{ id: string; participant_id: string; emissions_kg_co2e: number }>();

  let impossible = 0;
  for (const row of (negs.results || []) as { id: string; participant_id: string; emissions_kg_co2e: number }[]) {
    const id = rid('anf');
    await env.DB.prepare(
      `INSERT OR IGNORE INTO esg_anomaly_flags (id, transaction_id, participant_id, rule, severity, detail, observed_value)
       VALUES (?, ?, ?, 'impossible_value', 'critical', 'Negative emissions value', ?)`,
    ).bind(id, row.id, row.participant_id, row.emissions_kg_co2e).run();
    impossible++;
  }

  // Rule: duplicate detection — same participant + activity_code + activity_date
  // + quantity within 0.01. Cap the scan to avoid unbounded join cost.
  const dupes = await env.DB.prepare(
    `SELECT a.id AS a_id, a.participant_id AS pid, a.emissions_kg_co2e AS emissions
       FROM esg_activity_transactions a
       JOIN esg_activity_transactions b
         ON a.participant_id = b.participant_id
        AND a.activity_code = b.activity_code
        AND a.activity_date = b.activity_date
        AND abs(a.quantity - b.quantity) < 0.01
        AND a.id < b.id
      LIMIT 200`,
  ).all<{ a_id: string; pid: string; emissions: number }>();

  let duplicates = 0;
  for (const row of (dupes.results || []) as { a_id: string; pid: string; emissions: number }[]) {
    const id = rid('anf');
    await env.DB.prepare(
      `INSERT OR IGNORE INTO esg_anomaly_flags (id, transaction_id, participant_id, rule, severity, detail, observed_value)
       VALUES (?, ?, ?, 'duplicate_posting', 'high', 'Duplicate activity posting detected', ?)`,
    ).bind(id, row.a_id, row.pid, row.emissions).run();
    duplicates++;
  }

  return { impossible, duplicates };
}

// ─── Climate maturity refresh ──────────────────────────────────────────────
// Recomputes the maturity band from overall_score for the latest assessment
// of each participant. Catches assessments written directly (bypassing the
// POST /maturity/score handler) whose band never got set, or score edits that
// left the band stale.
export async function runMaturityRefresh(
  env: HonoEnv['Bindings'],
): Promise<{ refreshed: number }> {
  const latest = await env.DB.prepare(
    `SELECT id, overall_score FROM climate_maturity_assessments m
       WHERE assessed_at = (SELECT MAX(assessed_at) FROM climate_maturity_assessments
                              WHERE participant_id = m.participant_id)
         AND overall_score IS NOT NULL`,
  ).all<{ id: string; overall_score: number }>();

  let refreshed = 0;
  for (const row of (latest.results || []) as { id: string; overall_score: number }[]) {
    const band = row.overall_score >= 80 ? 'leader'
      : row.overall_score >= 60 ? 'advanced'
      : row.overall_score >= 40 ? 'intermediate'
      : row.overall_score >= 20 ? 'beginner'
      : 'starter';
    await env.DB.prepare(
      `UPDATE climate_maturity_assessments SET band = ? WHERE id = ? AND (band IS NULL OR band != ?)`,
    ).bind(band, row.id, band).run();
    refreshed++;
  }
  return { refreshed };
}

// ─── OrderBook depth snapshots ─────────────────────────────────────────────
// Enumerate every active shard_key (distinct energy_type|delivery_day from
// trade_orders) and POST /snapshot to each OrderBook DO so depth is persisted
// to D1 for the surveillance plane. Guards each DO call so one slow/failing
// shard can't sink the sweep. No-op when the ORDER_BOOK binding is absent
// (local dev without DO emulation).
export async function snapshotAllOrderBooks(
  env: HonoEnv['Bindings'],
): Promise<{ shards: number; snapshotted: number }> {
  const doBinding = (env as unknown as { ORDER_BOOK?: DurableObjectNamespace }).ORDER_BOOK;
  if (!doBinding) return { shards: 0, snapshotted: 0 };

  const rs = await env.DB.prepare(
    `SELECT DISTINCT shard_key FROM trade_orders WHERE shard_key IS NOT NULL`,
  ).all<{ shard_key: string }>();
  const shards = (rs.results || []) as { shard_key: string }[];

  let snapshotted = 0;
  for (const s of shards) {
    try {
      const id = doBinding.idFromName(s.shard_key);
      const stub = doBinding.get(id);
      const resp = await stub.fetch('https://order-book/snapshot', { method: 'POST' });
      if (resp.ok) snapshotted++;
    } catch { /* per-shard non-fatal */ }
  }
  return { shards: shards.length, snapshotted };
}