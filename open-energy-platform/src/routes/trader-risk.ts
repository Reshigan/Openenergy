// ═══════════════════════════════════════════════════════════════════════════
// Trader risk routes — positions, MTM, credit limits, collateral, margin,
// clearing/netting runs. Mounted at /api/trader-risk.
// Statutory ref: Financial Markets Act 19 of 2012.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { canOpenTrade, initialMarginFor, markToMarket, nettingReduce, utilisationPercentage } from '../utils/trader-risk';

const risk = new Hono<HonoEnv>();
risk.use('*', authMiddleware);

function isRiskOfficer(role: string): boolean {
  return role === 'admin' || role === 'regulator' || role === 'support';
}
function genId(p: string) {
  return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Positions ─────────────────────────────────────────────────────────────
// Recompute positions from fills on demand — gives exact view without drift
// risk from incremental updates. For national scale, caller should call the
// cron-driven /snapshot endpoint instead of recomputing on every read.
risk.get('/positions', async (c) => {
  const user = getCurrentUser(c);
  const target = c.req.query('participant_id');
  const pid = target && isRiskOfficer(user.role) ? target : user.id;
  const rs = await c.env.DB.prepare(
    `SELECT * FROM trader_positions WHERE participant_id = ? ORDER BY energy_type, delivery_date`,
  ).bind(pid).all();
  return c.json({ success: true, data: rs.results || [] });
});

risk.post('/positions/rebuild', async (c) => {
  const user = getCurrentUser(c);
  const target = (await c.req.json().catch(() => ({}))) as { participant_id?: string };
  const pid = target.participant_id && isRiskOfficer(user.role) ? target.participant_id : user.id;

  // Sum fills grouped by (energy_type, delivery_date) for this participant.
  const rs = await c.env.DB.prepare(
    `SELECT o.energy_type, o.delivery_date,
            SUM(CASE WHEN f.side = 'buy' THEN f.volume_mwh ELSE -f.volume_mwh END) AS net_vol,
            SUM(CASE WHEN f.side = 'buy' THEN f.volume_mwh * f.price ELSE 0 END) AS gross_buy,
            SUM(CASE WHEN f.side = 'buy' THEN f.volume_mwh ELSE 0 END) AS buy_vol
       FROM trade_fills f
       JOIN trade_orders o ON o.id = f.order_id
      WHERE o.participant_id = ?
      GROUP BY o.energy_type, o.delivery_date`,
  ).bind(pid).all<{ energy_type: string; delivery_date: string | null; net_vol: number; gross_buy: number; buy_vol: number }>();

  let updated = 0;
  for (const r of rs.results || []) {
    const avg = r.buy_vol > 0 ? r.gross_buy / r.buy_vol : null;
    const id = genId('pos');
    await c.env.DB.prepare(
      `INSERT INTO trader_positions (id, participant_id, energy_type, delivery_date, net_volume_mwh, avg_entry_price, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(participant_id, energy_type, delivery_date) DO UPDATE SET
         net_volume_mwh = excluded.net_volume_mwh,
         avg_entry_price = excluded.avg_entry_price,
         updated_at = datetime('now')`,
    ).bind(id, pid, r.energy_type, r.delivery_date, r.net_vol, avg).run();
    updated++;
  }
  return c.json({ success: true, data: { participant_id: pid, positions_updated: updated } });
});

// ─── Mark prices ───────────────────────────────────────────────────────────
risk.post('/mark-prices', async (c) => {
  const user = getCurrentUser(c);
  if (!isRiskOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['energy_type', 'mark_date', 'mark_price_zar_mwh']) {
    if (!b[k] && b[k] !== 0) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO mark_prices (id, energy_type, delivery_date, mark_date, mark_price_zar_mwh, source)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, 'operator_post'))`,
  ).bind(
    genId('mp'), b.energy_type, b.delivery_date || null, b.mark_date,
    Number(b.mark_price_zar_mwh), b.source || null,
  ).run();
  return c.json({ success: true });
});

risk.post('/mark-prices/vwap-run', async (c) => {
  const user = getCurrentUser(c);
  if (!isRiskOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const markDate = (b.mark_date as string) || new Date().toISOString().slice(0, 10);

  // Compute VWAP from trade_fills for the given day per (energy_type, delivery_date).
  const rs = await c.env.DB.prepare(
    `SELECT o.energy_type, o.delivery_date,
            SUM(f.volume_mwh * f.price) AS gross,
            SUM(f.volume_mwh) AS vol
       FROM trade_fills f
       JOIN trade_orders o ON o.id = f.order_id
      WHERE f.executed_at LIKE ? || '%'
      GROUP BY o.energy_type, o.delivery_date`,
  ).bind(markDate).all<{ energy_type: string; delivery_date: string | null; gross: number; vol: number }>();

  let inserted = 0;
  for (const r of rs.results || []) {
    if (!r.vol) continue;
    const vwap = r.gross / r.vol;
    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO mark_prices (id, energy_type, delivery_date, mark_date, mark_price_zar_mwh, source)
       VALUES (?, ?, ?, ?, ?, 'vwap')`,
    ).bind(genId('mp'), r.energy_type, r.delivery_date, markDate, vwap).run();
    inserted++;
  }
  return c.json({ success: true, data: { mark_date: markDate, marks_written: inserted } });
});

risk.get('/mark-prices', async (c) => {
  const et = c.req.query('energy_type');
  const day = c.req.query('mark_date');
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (et) { filters.push('energy_type = ?'); binds.push(et); }
  if (day) { filters.push('mark_date = ?'); binds.push(day); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rs = await c.env.DB.prepare(
    `SELECT * FROM mark_prices ${where} ORDER BY mark_date DESC LIMIT 500`,
  ).bind(...binds).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Credit limits ─────────────────────────────────────────────────────────
risk.post('/credit-limits', async (c) => {
  const user = getCurrentUser(c);
  if (!isRiskOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['participant_id', 'limit_zar', 'effective_from']) {
    if (!b[k] && b[k] !== 0) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('clim');
  await c.env.DB.prepare(
    `INSERT INTO credit_limits
       (id, participant_id, limit_zar, effective_from, effective_to,
        approved_by, basis, counterparty_specific_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, b.participant_id, Number(b.limit_zar), b.effective_from, b.effective_to || null,
    user.id, b.basis || 'unsecured', b.counterparty_specific_id || null, b.notes || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM credit_limits WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

risk.get('/credit-limits/:participant_id', async (c) => {
  const user = getCurrentUser(c);
  const pid = c.req.param('participant_id');
  if (pid !== user.id && !isRiskOfficer(user.role)) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT * FROM credit_limits WHERE participant_id = ? ORDER BY effective_from DESC LIMIT 50`,
  ).bind(pid).all();
  return c.json({ success: true, data: rs.results || [] });
});

risk.get('/credit-check', async (c) => {
  const user = getCurrentUser(c);
  const incoming = Number(c.req.query('notional_zar') || 0);
  const pid = c.req.query('participant_id') && isRiskOfficer(user.role)
    ? c.req.query('participant_id')!
    : user.id;

  const [limitRow, openExposure] = await Promise.all([
    c.env.DB.prepare(
      `SELECT limit_zar FROM credit_limits
        WHERE participant_id = ?
          AND (effective_to IS NULL OR effective_to >= datetime('now'))
          AND effective_from <= datetime('now')
        ORDER BY effective_from DESC LIMIT 1`,
    ).bind(pid).first<{ limit_zar: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(o.remaining_volume_mwh * COALESCE(o.price, 0)), 0) AS open_exp
         FROM trade_orders o
        WHERE o.participant_id = ? AND o.status IN ('open','partially_filled')`,
    ).bind(pid).first<{ open_exp: number }>(),
  ]);

  const limit = limitRow?.limit_zar || 0;
  const open = openExposure?.open_exp || 0;
  const result = canOpenTrade(incoming, open, limit);
  return c.json({
    success: true,
    data: {
      participant_id: pid,
      limit_zar: limit,
      open_exposure_zar: open,
      incoming_notional_zar: incoming,
      allowed: result.allowed,
      headroom_zar: result.headroom_zar,
      utilisation_pct: Number(utilisationPercentage(open, limit).toFixed(2)),
    },
  });
});

// ─── Collateral ────────────────────────────────────────────────────────────
risk.post('/collateral/accounts', async (c) => {
  const user = getCurrentUser(c);
  if (!isRiskOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['participant_id', 'account_number', 'account_type']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('coll');
  await c.env.DB.prepare(
    `INSERT INTO collateral_accounts (id, participant_id, account_number, account_type, currency, balance_zar, custodian)
     VALUES (?, ?, ?, ?, COALESCE(?, 'ZAR'), COALESCE(?, 0), ?)`,
  ).bind(
    id, b.participant_id, b.account_number, b.account_type,
    b.currency || null, b.balance_zar == null ? null : Number(b.balance_zar),
    b.custodian || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM collateral_accounts WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

risk.post('/collateral/accounts/:id/movement', async (c) => {
  const user = getCurrentUser(c);
  if (!isRiskOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const accountId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.movement_type || b.amount_zar == null) {
    return c.json({ success: false, error: 'movement_type and amount_zar are required' }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO collateral_movements (id, account_id, movement_type, amount_zar, related_entity_type, related_entity_id, description, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    genId('cm'), accountId, b.movement_type, Number(b.amount_zar),
    b.related_entity_type || null, b.related_entity_id || null,
    b.description || null, user.id,
  ).run();
  await c.env.DB.prepare(
    `UPDATE collateral_accounts SET balance_zar = balance_zar + ? WHERE id = ?`,
  ).bind(Number(b.amount_zar), accountId).run();
  const row = await c.env.DB.prepare('SELECT * FROM collateral_accounts WHERE id = ?').bind(accountId).first();
  return c.json({ success: true, data: row });
});

risk.get('/collateral/accounts', async (c) => {
  const user = getCurrentUser(c);
  const pid = isRiskOfficer(user.role) ? c.req.query('participant_id') || user.id : user.id;
  const rs = await c.env.DB.prepare(
    `SELECT * FROM collateral_accounts WHERE participant_id = ?`,
  ).bind(pid).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Margin calls ──────────────────────────────────────────────────────────
risk.post('/margin-calls/run', async (c) => {
  const user = getCurrentUser(c);
  if (!isRiskOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const dueBy = (b.due_by as string) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Compute per-participant exposure using open orders × latest mark.
  const rs = await c.env.DB.prepare(
    `SELECT p.id AS pid,
            COALESCE(SUM(o.remaining_volume_mwh * COALESCE(m.mark_price_zar_mwh, o.price, 0)), 0) AS exposure
       FROM participants p
       LEFT JOIN trade_orders o
         ON o.participant_id = p.id
        AND o.status IN ('open','partially_filled')
       LEFT JOIN mark_prices m
         ON m.energy_type = o.energy_type
        AND (m.delivery_date = o.delivery_date OR (m.delivery_date IS NULL AND o.delivery_date IS NULL))
      GROUP BY p.id`,
  ).all<{ pid: string; exposure: number }>();

  let issued = 0;
  for (const row of rs.results || []) {
    if (row.exposure <= 0) continue;
    const im = initialMarginFor(row.exposure);
    const posted = (await c.env.DB.prepare(
      `SELECT COALESCE(SUM(balance_zar), 0) AS bal FROM collateral_accounts WHERE participant_id = ? AND status = 'active'`,
    ).bind(row.pid).first<{ bal: number }>())?.bal || 0;
    const shortfall = Math.max(0, im - posted);
    if (shortfall <= 0) continue;

    await c.env.DB.prepare(
      `INSERT INTO margin_calls (id, participant_id, as_of, exposure_zar, initial_margin_zar, variation_margin_zar, posted_collateral_zar, shortfall_zar, due_by, status)
       VALUES (?, ?, datetime('now'), ?, ?, 0, ?, ?, ?, 'issued')`,
    ).bind(genId('mc'), row.pid, row.exposure, im, posted, shortfall, dueBy).run();
    issued++;
  }
  return c.json({ success: true, data: { margin_calls_issued: issued } });
});

risk.get('/margin-calls', async (c) => {
  const user = getCurrentUser(c);
  const pid = isRiskOfficer(user.role) ? c.req.query('participant_id') || user.id : user.id;
  const rs = await c.env.DB.prepare(
    `SELECT * FROM margin_calls WHERE participant_id = ? ORDER BY as_of DESC LIMIT 100`,
  ).bind(pid).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Clearing runs (multi-lateral netting) ─────────────────────────────────
risk.post('/clearing/run', async (c) => {
  const user = getCurrentUser(c);
  if (!isRiskOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const tradingDay = (b.trading_day as string) || new Date().toISOString().slice(0, 10);

  const runId = genId('cr');
  await c.env.DB.prepare(
    `INSERT INTO clearing_runs (id, trading_day, status, created_by) VALUES (?, ?, 'running', ?)`,
  ).bind(runId, tradingDay, user.id).run();

  // Pull invoices whose trade executed on the trading day as bilateral obligations.
  const rs = await c.env.DB.prepare(
    `SELECT from_participant_id AS from_p, to_participant_id AS to_p, total_amount AS amt
       FROM invoices
      WHERE status IN ('issued','viewed','partial','overdue','disputed')
        AND period_start <= ? AND period_end >= ?`,
  ).bind(tradingDay, tradingDay).all<{ from_p: string; to_p: string; amt: number }>();

  const obligations = (rs.results || []).map((r) => ({ from: r.from_p, to: r.to_p, amount_zar: r.amt }));
  const netted = nettingReduce(obligations);

  for (const [pid, net] of Object.entries(netted.nets)) {
    await c.env.DB.prepare(
      `INSERT INTO clearing_obligations (id, clearing_run_id, participant_id, counterparty_id, net_amount_zar)
       VALUES (?, ?, ?, NULL, ?)`,
    ).bind(genId('co'), runId, pid, net).run();
  }
  await c.env.DB.prepare(
    `UPDATE clearing_runs
        SET status = 'complete', run_completed_at = datetime('now'),
            total_gross_zar = ?, total_net_zar = ?, netting_ratio = ?
      WHERE id = ?`,
  ).bind(netted.total_gross, netted.total_net, netted.netting_ratio, runId).run();

  return c.json({
    success: true,
    data: {
      clearing_run_id: runId,
      trading_day: tradingDay,
      total_gross_zar: netted.total_gross,
      total_net_zar: netted.total_net,
      netting_ratio: Number(netted.netting_ratio.toFixed(4)),
      obligations_count: Object.keys(netted.nets).length,
    },
  });
});

risk.get('/clearing/runs', async (c) => {
  const user = getCurrentUser(c);
  if (!isRiskOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM clearing_runs ORDER BY trading_day DESC LIMIT 100`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

risk.get('/clearing/runs/:id/obligations', async (c) => {
  const user = getCurrentUser(c);
  const runId = c.req.param('id');
  const mineOnly = !isRiskOfficer(user.role);
  const rs = mineOnly
    ? await c.env.DB.prepare(
        `SELECT * FROM clearing_obligations WHERE clearing_run_id = ? AND participant_id = ?`,
      ).bind(runId, user.id).all()
    : await c.env.DB.prepare(
        `SELECT * FROM clearing_obligations WHERE clearing_run_id = ? ORDER BY ABS(net_amount_zar) DESC`,
      ).bind(runId).all();
  return c.json({ success: true, data: rs.results || [] });
});

// Export MTM helper for external callers (e.g. reports).
export { markToMarket };

export default risk;
