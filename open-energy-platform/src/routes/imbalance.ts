// ═══════════════════════════════════════════════════════════════════════════
// BRP imbalance settlement routes. Mounted at /api/imbalance.
//
// Endpoints:
//   POST /prices           — System Operator posts period imbalance prices
//   GET  /prices           — list latest prices
//   POST /nominations      — BRP posts / updates period nominations
//   GET  /nominations      — list BRP nominations (filterable)
//   POST /runs             — execute a settlement run over a period window
//   GET  /runs             — list recent runs
//   GET  /runs/:id         — run detail + period-level records
//   GET  /periods          — query imbalance_settlements (filterable)
//   GET  /monthly/:brp/:period  — monthly invoice-ready summary
//   GET  /monthly          — list monthly totals (admin/regulator)
//
// Access:
//   grid_operator + admin  — prices, runs (write)
//   brp participant (trader/ipp_developer/offtaker) — own nominations + monthly
//   regulator              — read-only across all
//
// Engine is pure (src/utils/imbalance-engine.ts); this route layer handles
// persistence, access control, and run bookkeeping.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv, ParticipantRole } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import {
  computeRun,
  aggregateMonthly,
  PeriodNomination,
  PeriodPricing,
  ImbalanceRecord,
} from '../utils/imbalance-engine';

const imb = new Hono<HonoEnv>();
imb.use('*', authMiddleware);

function genId(p: string) {
  return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function canWritePrices(role: ParticipantRole): boolean {
  return role === 'admin' || role === 'grid_operator';
}
function canRunSettlement(role: ParticipantRole): boolean {
  return role === 'admin' || role === 'grid_operator';
}
function canReadAll(role: ParticipantRole): boolean {
  return role === 'admin' || role === 'grid_operator' || role === 'regulator';
}

// ─── Prices ────────────────────────────────────────────────────────────────

imb.post('/prices', async (c) => {
  const user = getCurrentUser(c);
  if (!canWritePrices(user.role)) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const prices = Array.isArray(b.prices) ? (b.prices as Record<string, unknown>[]) : [b];

  const stmts = [];
  for (const p of prices) {
    for (const k of ['period_start', 'period_end', 'long_price_zar_mwh', 'short_price_zar_mwh']) {
      if (p[k] === undefined || p[k] === null) {
        return c.json({ success: false, error: `${k} is required` }, 400);
      }
    }
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO imbalance_prices
           (period_start, period_end, long_price_zar_mwh, short_price_zar_mwh, tolerance_mwh, published_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(period_start) DO UPDATE SET
           period_end = excluded.period_end,
           long_price_zar_mwh = excluded.long_price_zar_mwh,
           short_price_zar_mwh = excluded.short_price_zar_mwh,
           tolerance_mwh = excluded.tolerance_mwh,
           published_by = excluded.published_by,
           published_at = datetime('now')`,
      ).bind(
        p.period_start,
        p.period_end,
        Number(p.long_price_zar_mwh),
        Number(p.short_price_zar_mwh),
        p.tolerance_mwh != null ? Number(p.tolerance_mwh) : 0.05,
        user.id,
      ),
    );
  }
  await c.env.DB.batch(stmts);
  return c.json({ success: true, data: { count: stmts.length } });
});

imb.get('/prices', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') || 200), 1000);
  const from = c.req.query('from');
  const to = c.req.query('to');
  const where: string[] = [];
  const binds: unknown[] = [];
  if (from) { where.push('period_start >= ?'); binds.push(from); }
  if (to) { where.push('period_start <= ?'); binds.push(to); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rs = await c.env.DB.prepare(
    `SELECT * FROM imbalance_prices ${whereClause} ORDER BY period_start DESC LIMIT ?`,
  ).bind(...binds, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Nominations ───────────────────────────────────────────────────────────

imb.post('/nominations', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const noms = Array.isArray(b.nominations) ? (b.nominations as Record<string, unknown>[]) : [b];

  const stmts = [];
  for (const n of noms) {
    for (const k of ['period_start', 'period_end', 'scheduled_mwh']) {
      if (n[k] === undefined || n[k] === null) {
        return c.json({ success: false, error: `${k} is required` }, 400);
      }
    }
    // BRPs can only write their own; admin / grid_operator can write any.
    const brpId = (n.brp_participant_id as string | undefined) || user.id;
    if (!canReadAll(user.role) && brpId !== user.id) {
      return c.json({ success: false, error: 'Cannot nominate for another BRP' }, 403);
    }
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO brp_period_nominations
           (brp_participant_id, period_start, period_end, scheduled_mwh, actual_mwh, source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(brp_participant_id, period_start) DO UPDATE SET
           period_end = excluded.period_end,
           scheduled_mwh = excluded.scheduled_mwh,
           actual_mwh = COALESCE(excluded.actual_mwh, brp_period_nominations.actual_mwh),
           source = excluded.source,
           updated_at = datetime('now')`,
      ).bind(
        brpId,
        n.period_start,
        n.period_end,
        Number(n.scheduled_mwh),
        n.actual_mwh != null ? Number(n.actual_mwh) : null,
        (n.source as string) || 'brp',
      ),
    );
  }
  await c.env.DB.batch(stmts);
  return c.json({ success: true, data: { count: stmts.length } });
});

imb.get('/nominations', async (c) => {
  const user = getCurrentUser(c);
  const brp = c.req.query('brp_participant_id');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const limit = Math.min(Number(c.req.query('limit') || 500), 5000);

  const where: string[] = [];
  const binds: unknown[] = [];
  // Non-privileged users always get scoped to their own id.
  if (!canReadAll(user.role)) {
    where.push('brp_participant_id = ?');
    binds.push(user.id);
  } else if (brp) {
    where.push('brp_participant_id = ?');
    binds.push(brp);
  }
  if (from) { where.push('period_start >= ?'); binds.push(from); }
  if (to) { where.push('period_start <= ?'); binds.push(to); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rs = await c.env.DB.prepare(
    `SELECT * FROM brp_period_nominations ${whereClause} ORDER BY period_start DESC LIMIT ?`,
  ).bind(...binds, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Settlement runs ───────────────────────────────────────────────────────

imb.post('/runs', async (c) => {
  const user = getCurrentUser(c);
  if (!canRunSettlement(user.role)) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.period_from || !b.period_to) {
    return c.json({ success: false, error: 'period_from and period_to are required' }, 400);
  }
  const runId = genId('imb');
  const periodFrom = b.period_from as string;
  const periodTo = b.period_to as string;

  await c.env.DB.prepare(
    `INSERT INTO imbalance_settlement_runs (id, period_from, period_to, run_by, status)
     VALUES (?, ?, ?, ?, 'running')`,
  ).bind(runId, periodFrom, periodTo, user.id).run();

  try {
    const result = await executeSettlementRun(c.env, runId, periodFrom, periodTo);
    await c.env.DB.prepare(
      `UPDATE imbalance_settlement_runs
       SET status = 'succeeded', periods_settled = ?, brps_settled = ?,
           net_charge_zar_total = ?, finished_at = datetime('now')
       WHERE id = ?`,
    ).bind(result.periodsSettled, result.brpsSettled, result.netChargeTotal, runId).run();
    return c.json({ success: true, data: { run_id: runId, ...result } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await c.env.DB.prepare(
      `UPDATE imbalance_settlement_runs
       SET status = 'failed', error_message = ?, finished_at = datetime('now')
       WHERE id = ?`,
    ).bind(msg, runId).run();
    return c.json({ success: false, error: msg, run_id: runId }, 500);
  }
});

imb.get('/runs', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') || 100), 500);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM imbalance_settlement_runs ORDER BY started_at DESC LIMIT ?`,
  ).bind(limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

imb.get('/runs/:id', async (c) => {
  const id = c.req.param('id');
  const run = await c.env.DB.prepare(
    `SELECT * FROM imbalance_settlement_runs WHERE id = ?`,
  ).bind(id).first();
  if (!run) return c.json({ success: false, error: 'Run not found' }, 404);
  const records = await c.env.DB.prepare(
    `SELECT * FROM imbalance_settlements WHERE run_id = ? ORDER BY period_start, brp_participant_id LIMIT 5000`,
  ).bind(id).all();
  return c.json({ success: true, data: { run, records: records.results || [] } });
});

// ─── Period records + monthly summaries ────────────────────────────────────

imb.get('/periods', async (c) => {
  const user = getCurrentUser(c);
  const brp = c.req.query('brp_participant_id');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const direction = c.req.query('direction');
  const limit = Math.min(Number(c.req.query('limit') || 500), 5000);

  const where: string[] = [];
  const binds: unknown[] = [];
  if (!canReadAll(user.role)) {
    where.push('brp_participant_id = ?');
    binds.push(user.id);
  } else if (brp) {
    where.push('brp_participant_id = ?');
    binds.push(brp);
  }
  if (from) { where.push('period_start >= ?'); binds.push(from); }
  if (to) { where.push('period_start <= ?'); binds.push(to); }
  if (direction) { where.push('direction = ?'); binds.push(direction); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rs = await c.env.DB.prepare(
    `SELECT * FROM imbalance_settlements ${whereClause} ORDER BY period_start DESC LIMIT ?`,
  ).bind(...binds, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

imb.get('/monthly/:brp/:period', async (c) => {
  const user = getCurrentUser(c);
  const brp = c.req.param('brp');
  const period = c.req.param('period');        // YYYY-MM
  if (!canReadAll(user.role) && brp !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const row = await c.env.DB.prepare(
    `SELECT * FROM imbalance_monthly_totals WHERE brp_participant_id = ? AND period = ?`,
  ).bind(brp, period).first();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  return c.json({ success: true, data: row });
});

imb.get('/monthly', async (c) => {
  const user = getCurrentUser(c);
  const period = c.req.query('period');
  const limit = Math.min(Number(c.req.query('limit') || 500), 5000);
  const where: string[] = [];
  const binds: unknown[] = [];
  if (!canReadAll(user.role)) {
    where.push('brp_participant_id = ?');
    binds.push(user.id);
  }
  if (period) { where.push('period = ?'); binds.push(period); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rs = await c.env.DB.prepare(
    `SELECT * FROM imbalance_monthly_totals ${whereClause} ORDER BY period DESC, net_charge_zar DESC LIMIT ?`,
  ).bind(...binds, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Core: execute a settlement run ────────────────────────────────────────
//
// Load matching (nomination × pricing) pairs from D1, run the pure engine,
// then persist settlement rows + monthly aggregates in a single batch.
// The monthly aggregation is derived from the entire month's settlements
// (not just this run) so out-of-order or backfill runs land cleanly.

export interface RunSummary {
  periodsSettled: number;
  brpsSettled: number;
  netChargeTotal: number;
}

export async function executeSettlementRun(
  env: HonoEnv,
  runId: string,
  periodFrom: string,
  periodTo: string,
): Promise<RunSummary> {
  // 1. Pull nominations for the window (actual_mwh must be present).
  const nomsRs = await env.DB.prepare(
    `SELECT brp_participant_id, period_start, period_end, scheduled_mwh, actual_mwh
     FROM brp_period_nominations
     WHERE period_start >= ? AND period_start < ? AND actual_mwh IS NOT NULL`,
  ).bind(periodFrom, periodTo).all();
  const nominations: PeriodNomination[] = (nomsRs.results as Record<string, unknown>[] || []).map((r) => ({
    brp_participant_id: String(r.brp_participant_id),
    period_start: String(r.period_start),
    period_end: String(r.period_end),
    scheduled_mwh: Number(r.scheduled_mwh),
    actual_mwh: Number(r.actual_mwh),
  }));

  // 2. Pull prices for the same window and build the period index.
  const pricesRs = await env.DB.prepare(
    `SELECT period_start, period_end, long_price_zar_mwh, short_price_zar_mwh, tolerance_mwh
     FROM imbalance_prices
     WHERE period_start >= ? AND period_start < ?`,
  ).bind(periodFrom, periodTo).all();
  const priceIndex = new Map<string, PeriodPricing>();
  for (const r of (pricesRs.results as Record<string, unknown>[] || [])) {
    priceIndex.set(String(r.period_start), {
      period_start: String(r.period_start),
      period_end: String(r.period_end),
      long_price_zar_mwh: Number(r.long_price_zar_mwh),
      short_price_zar_mwh: Number(r.short_price_zar_mwh),
      tolerance_mwh: r.tolerance_mwh != null ? Number(r.tolerance_mwh) : undefined,
    });
  }

  // 3. Run the pure engine.
  const records = computeRun(nominations, priceIndex);
  if (records.length === 0) {
    return { periodsSettled: 0, brpsSettled: 0, netChargeTotal: 0 };
  }

  // 4. Persist settlements with UPSERT (idempotent re-runs overwrite).
  const stmts = records.map((r) =>
    env.DB.prepare(
      `INSERT INTO imbalance_settlements
         (id, run_id, brp_participant_id, period_start, period_end, scheduled_mwh, actual_mwh,
          imbalance_mwh, direction, price_applied_zar_mwh, imbalance_charge_zar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(brp_participant_id, period_start) DO UPDATE SET
         run_id = excluded.run_id,
         period_end = excluded.period_end,
         scheduled_mwh = excluded.scheduled_mwh,
         actual_mwh = excluded.actual_mwh,
         imbalance_mwh = excluded.imbalance_mwh,
         direction = excluded.direction,
         price_applied_zar_mwh = excluded.price_applied_zar_mwh,
         imbalance_charge_zar = excluded.imbalance_charge_zar`,
    ).bind(
      genId('ims'),
      runId,
      r.brp_participant_id,
      r.period_start,
      r.period_end,
      r.scheduled_mwh,
      r.actual_mwh,
      r.imbalance_mwh,
      r.direction,
      r.price_applied_zar_mwh,
      r.imbalance_charge_zar,
    ),
  );
  // D1 caps batch size — chunk at 100 to stay well under the limit.
  for (let i = 0; i < stmts.length; i += 100) {
    await env.DB.batch(stmts.slice(i, i + 100));
  }

  // 5. Rebuild monthly aggregates for every (brp, month) touched by this run.
  //    Pull the full month's settlements so partial re-runs produce correct
  //    running totals. `period` is YYYY-MM derived from period_start.
  const touched = new Set<string>();
  for (const r of records) {
    const month = r.period_start.slice(0, 7);
    touched.add(`${r.brp_participant_id}|${month}`);
  }
  for (const key of touched) {
    const [brp, month] = key.split('|');
    const monthStart = `${month}-01`;
    // Compute next-month start as a YYYY-MM-01 string; avoids timezone drift.
    const [yy, mm] = month.split('-').map(Number);
    const nextYy = mm === 12 ? yy + 1 : yy;
    const nextMm = mm === 12 ? 1 : mm + 1;
    const monthEnd = `${nextYy}-${String(nextMm).padStart(2, '0')}-01`;

    const monthRs = await env.DB.prepare(
      `SELECT brp_participant_id, period_start, period_end, scheduled_mwh, actual_mwh,
              imbalance_mwh, direction, price_applied_zar_mwh, imbalance_charge_zar
       FROM imbalance_settlements
       WHERE brp_participant_id = ?
         AND period_start >= ? AND period_start < ?`,
    ).bind(brp, monthStart, monthEnd).all();
    const monthRecords = (monthRs.results as Record<string, unknown>[] || []).map((r): ImbalanceRecord => ({
      brp_participant_id: String(r.brp_participant_id),
      period_start: String(r.period_start),
      period_end: String(r.period_end),
      scheduled_mwh: Number(r.scheduled_mwh),
      actual_mwh: Number(r.actual_mwh),
      imbalance_mwh: Number(r.imbalance_mwh),
      direction: r.direction as ImbalanceRecord['direction'],
      price_applied_zar_mwh: Number(r.price_applied_zar_mwh),
      imbalance_charge_zar: Number(r.imbalance_charge_zar),
    }));
    const totals = aggregateMonthly(monthRecords, month);
    if (totals.length === 0) continue;
    const t = totals[0];
    await env.DB.prepare(
      `INSERT INTO imbalance_monthly_totals
         (brp_participant_id, period, periods_count, scheduled_mwh_total, actual_mwh_total,
          imbalance_mwh_long, imbalance_mwh_short, net_charge_zar, long_charge_zar, short_charge_zar,
          on_target_period_pct, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(brp_participant_id, period) DO UPDATE SET
         periods_count = excluded.periods_count,
         scheduled_mwh_total = excluded.scheduled_mwh_total,
         actual_mwh_total = excluded.actual_mwh_total,
         imbalance_mwh_long = excluded.imbalance_mwh_long,
         imbalance_mwh_short = excluded.imbalance_mwh_short,
         net_charge_zar = excluded.net_charge_zar,
         long_charge_zar = excluded.long_charge_zar,
         short_charge_zar = excluded.short_charge_zar,
         on_target_period_pct = excluded.on_target_period_pct,
         computed_at = datetime('now')`,
    ).bind(
      t.brp_participant_id,
      t.period,
      t.periods_count,
      t.scheduled_mwh_total,
      t.actual_mwh_total,
      t.imbalance_mwh_long,
      t.imbalance_mwh_short,
      t.net_charge_zar,
      t.long_charge_zar,
      t.short_charge_zar,
      t.on_target_period_pct,
    ).run();
  }

  const brps = new Set(records.map((r) => r.brp_participant_id));
  const netChargeTotal = records.reduce((s, r) => s + r.imbalance_charge_zar, 0);
  return {
    periodsSettled: records.length,
    brpsSettled: brps.size,
    netChargeTotal: Math.round(netChargeTotal * 100) / 100,
  };
}

export default imb;
