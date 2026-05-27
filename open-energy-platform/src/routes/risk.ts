// ═══════════════════════════════════════════════════════════════════════════
// Risk Routes — Wave 2 daily VaR + scenario engine, CFTC + BIS PFMI shape.
//
// Mounted at /api/risk (flat — no basePath params, per [feedback-route-mount-collision]).
//
// Responsibilities:
//   • CRUD for risk_portfolios, risk_scenarios (user-owned + system).
//   • VaR endpoints: latest snapshot, history, manual recompute.
//   • Exposure: per-counterparty MTM breakdown for a portfolio.
//   • Scenario endpoints: list, results history, on-demand run.
//   • Factor endpoints: catalogue + daily history for charts.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  Position, FactorHistory, FactorShock,
  simulateHistoricalPnL, varAtConfidence, expectedShortfall, runScenario,
} from '../utils/var';

const risk = new Hono<HonoEnv>();
risk.use('*', authMiddleware);

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// Roles allowed to read risk surfaces.
const READ_ROLES = new Set(['admin', 'trader', 'regulator', 'support', 'risk', 'lender']);
const ADMIN_ROLES = new Set(['admin', 'support']);

function canRead(role: string): boolean { return READ_ROLES.has(role); }
function canWriteOwn(role: string): boolean {
  return ADMIN_ROLES.has(role) || role === 'trader' || role === 'risk';
}

// Map a trader_positions row to the var.ts Position shape.
// factor_id convention: `spot_<energy_type>` so the seeded factor catalogue
// joins on energy_type without an extra mapping table.
function rowToPosition(row: any): Position | null {
  const qty = Number(row.net_volume_mwh || 0);
  const mark = Number(row.last_mark_price || 0);
  if (qty === 0 || mark === 0) return null;
  return {
    id: row.id,
    factor_id: `spot_${row.energy_type}`,
    side: qty > 0 ? 'long' : 'short',
    quantity: Math.abs(qty),
    mark_price: mark,
  };
}

// Apply portfolio basis_filter_json against trader_positions.
async function fetchPositions(env: any, basisJson: string): Promise<Position[]> {
  let filter: any = {};
  try { filter = JSON.parse(basisJson || '{}'); } catch { filter = {}; }

  const where: string[] = [];
  const params: any[] = [];
  if (filter.trader_id) { where.push('participant_id = ?'); params.push(filter.trader_id); }
  if (filter.energy_type) { where.push('energy_type = ?'); params.push(filter.energy_type); }

  const sql = `
    SELECT id, participant_id, energy_type, delivery_date, net_volume_mwh, last_mark_price
    FROM trader_positions
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    LIMIT 1000
  `;
  const res = await env.DB.prepare(sql).bind(...params).all();
  const rows = (res.results || []) as any[];
  const out: Position[] = [];
  for (const r of rows) {
    const p = rowToPosition(r);
    if (p) out.push(p);
  }
  return out;
}

// Pull last `lookback` daily closes per factor in scope.
async function fetchFactorHistory(env: any, factorIds: string[], lookback = 250): Promise<FactorHistory> {
  if (!factorIds.length) return {};
  const placeholders = factorIds.map(() => '?').join(',');
  const sql = `
    SELECT factor_id, as_of_date, value FROM risk_factor_history
    WHERE factor_id IN (${placeholders})
    ORDER BY factor_id ASC, as_of_date ASC
  `;
  const res = await env.DB.prepare(sql).bind(...factorIds).all();
  const rows = (res.results || []) as any[];
  const out: FactorHistory = {};
  for (const r of rows) {
    (out[r.factor_id] ||= []).push({ as_of_date: r.as_of_date as string, value: Number(r.value) });
  }
  for (const fid of Object.keys(out)) {
    out[fid] = out[fid].slice(-lookback - 1);
  }
  return out;
}

// ── portfolios ────────────────────────────────────────────────────────────

risk.get('/portfolios', async (c) => {
  const user = getCurrentUser(c);
  if (!canRead(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const res = await c.env.DB.prepare(`
    SELECT * FROM risk_portfolios
    WHERE is_system = 1 OR owner_id = ?
    ORDER BY is_system DESC, name ASC
  `).bind(user.id).all();
  return c.json({ success: true, data: res.results || [] });
});

risk.post('/portfolios', async (c) => {
  const user = getCurrentUser(c);
  if (!canWriteOwn(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const body = await c.req.json<any>();
  if (!body.name) return c.json({ success: false, error: 'name required' }, 400);
  const id = newId();
  const t = now();
  await c.env.DB.prepare(`
    INSERT INTO risk_portfolios (id, name, owner_id, basis_filter_json, is_system, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).bind(id, body.name, user.id, JSON.stringify(body.basis_filter || {}), t, t).run();
  await fireCascade({
    event: 'risk.portfolio.created', actor_id: user.id,
    entity_type: 'risk_portfolio', entity_id: id, data: { name: body.name }, env: c.env,
  });
  return c.json({ success: true, data: { id } });
});

risk.put('/portfolios/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(`SELECT * FROM risk_portfolios WHERE id = ?`).bind(id).first<any>();
  if (!existing) return c.json({ success: false, error: 'not found' }, 404);
  if (existing.is_system) return c.json({ success: false, error: 'system portfolio is read-only' }, 403);
  if (existing.owner_id !== user.id && !ADMIN_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const body = await c.req.json<any>();
  await c.env.DB.prepare(`
    UPDATE risk_portfolios SET
      name = COALESCE(?, name),
      basis_filter_json = COALESCE(?, basis_filter_json),
      updated_at = ?
    WHERE id = ?
  `).bind(
    body.name ?? null,
    body.basis_filter ? JSON.stringify(body.basis_filter) : null,
    now(), id,
  ).run();
  await fireCascade({
    event: 'risk.portfolio.updated', actor_id: user.id,
    entity_type: 'risk_portfolio', entity_id: id, data: { fields: Object.keys(body) }, env: c.env,
  });
  return c.json({ success: true });
});

risk.delete('/portfolios/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(`SELECT * FROM risk_portfolios WHERE id = ?`).bind(id).first<any>();
  if (!existing) return c.json({ success: false, error: 'not found' }, 404);
  if (existing.is_system) return c.json({ success: false, error: 'system portfolio is read-only' }, 403);
  if (existing.owner_id !== user.id && !ADMIN_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  await c.env.DB.prepare(`DELETE FROM risk_portfolios WHERE id = ?`).bind(id).run();
  await fireCascade({
    event: 'risk.portfolio.deleted', actor_id: user.id,
    entity_type: 'risk_portfolio', entity_id: id, data: {}, env: c.env,
  });
  return c.json({ success: true });
});

// ── VaR ───────────────────────────────────────────────────────────────────

risk.get('/portfolios/:id/var', async (c) => {
  const user = getCurrentUser(c);
  if (!canRead(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const asOf = c.req.query('as_of');
  const confidence = Number(c.req.query('confidence') || 0.95);
  const horizon = Number(c.req.query('horizon_days') || 1);

  let sql = `
    SELECT * FROM risk_var_results
    WHERE portfolio_id = ? AND confidence = ? AND horizon_days = ?
  `;
  const params: any[] = [id, confidence, horizon];
  if (asOf) { sql += ' AND as_of_date = ?'; params.push(asOf); }
  sql += ' ORDER BY as_of_date DESC LIMIT 1';

  const row = await c.env.DB.prepare(sql).bind(...params).first<any>();
  return c.json({ success: true, data: row || null });
});

risk.get('/portfolios/:id/var/history', async (c) => {
  const user = getCurrentUser(c);
  if (!canRead(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const days = Math.min(Number(c.req.query('days') || 30), 365);
  const confidence = Number(c.req.query('confidence') || 0.95);
  const res = await c.env.DB.prepare(`
    SELECT as_of_date, var_amount_zar, es_amount_zar
    FROM risk_var_results
    WHERE portfolio_id = ? AND confidence = ?
    ORDER BY as_of_date DESC LIMIT ?
  `).bind(id, confidence, days).all();
  // Return ascending for chart consumption.
  const rows = (res.results || []).slice().reverse();
  return c.json({ success: true, data: rows });
});

risk.post('/portfolios/:id/var/recompute', async (c) => {
  const user = getCurrentUser(c);
  if (!canWriteOwn(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const portfolio = await c.env.DB.prepare(`SELECT * FROM risk_portfolios WHERE id = ?`).bind(id).first<any>();
  if (!portfolio) return c.json({ success: false, error: 'not found' }, 404);

  const positions = await fetchPositions(c.env, portfolio.basis_filter_json);
  const factorIds = Array.from(new Set(positions.map(p => p.factor_id)));
  const history = await fetchFactorHistory(c.env, factorIds, 250);
  const pnls = simulateHistoricalPnL(positions, history, 250);
  const asOf = now().slice(0, 10);

  const results: Array<{ confidence: number; var_amount: number; es_amount: number }> = [];
  for (const conf of [0.95, 0.99]) {
    const v = varAtConfidence(pnls, conf);
    const es = expectedShortfall(pnls, conf);
    results.push({ confidence: conf, var_amount: v, es_amount: es });
    const rid = newId();
    await c.env.DB.prepare(`
      INSERT INTO risk_var_results (
        id, portfolio_id, as_of_date, methodology, confidence, horizon_days,
        var_amount_zar, es_amount_zar, components_json, created_at
      ) VALUES (?, ?, ?, 'historical_simulation', ?, 1, ?, ?, ?, ?)
    `).bind(rid, id, asOf, conf, v, es, JSON.stringify({ factors: factorIds }), now()).run();
  }

  await fireCascade({
    event: 'risk.var.recomputed', actor_id: user.id,
    entity_type: 'risk_portfolio', entity_id: id,
    data: { as_of: asOf, positions: positions.length, factors: factorIds.length },
    env: c.env,
  });

  return c.json({ success: true, data: { as_of_date: asOf, results, positions: positions.length } });
});

risk.get('/portfolios/:id/exposure', async (c) => {
  const user = getCurrentUser(c);
  if (!canRead(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const portfolio = await c.env.DB.prepare(`SELECT * FROM risk_portfolios WHERE id = ?`).bind(id).first<any>();
  if (!portfolio) return c.json({ success: false, error: 'not found' }, 404);
  const positions = await fetchPositions(c.env, portfolio.basis_filter_json);
  // Group by energy_type as the de-facto counterparty proxy until trader_positions
  // grows a counterparty_id column (planned for Wave 3 clearing).
  const byBucket: Record<string, { mtm_zar: number; positions: number }> = {};
  for (const p of positions) {
    const k = p.factor_id;
    byBucket[k] ||= { mtm_zar: 0, positions: 0 };
    const sign = p.side === 'long' ? 1 : -1;
    byBucket[k].mtm_zar += sign * p.quantity * p.mark_price;
    byBucket[k].positions += 1;
  }
  const data = Object.entries(byBucket).map(([factor_id, v]) => ({ factor_id, ...v }));
  return c.json({ success: true, data });
});

// ── scenarios ─────────────────────────────────────────────────────────────

risk.get('/scenarios', async (c) => {
  const user = getCurrentUser(c);
  if (!canRead(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const res = await c.env.DB.prepare(`
    SELECT * FROM risk_scenarios
    WHERE is_system = 1 OR owner_id = ?
    ORDER BY is_system DESC, name ASC
  `).bind(user.id).all();
  return c.json({ success: true, data: res.results || [] });
});

risk.post('/scenarios', async (c) => {
  const user = getCurrentUser(c);
  if (!canWriteOwn(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const body = await c.req.json<any>();
  if (!body.name || !Array.isArray(body.factor_shocks)) {
    return c.json({ success: false, error: 'name + factor_shocks[] required' }, 400);
  }
  const id = newId();
  const t = now();
  await c.env.DB.prepare(`
    INSERT INTO risk_scenarios (id, name, description, is_system, factor_shocks_json, owner_id, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?, ?, ?)
  `).bind(
    id, body.name, body.description ?? null,
    JSON.stringify(body.factor_shocks), user.id, t, t,
  ).run();
  await fireCascade({
    event: 'risk.scenario.created', actor_id: user.id,
    entity_type: 'risk_scenario', entity_id: id, data: { name: body.name }, env: c.env,
  });
  return c.json({ success: true, data: { id } });
});

risk.put('/scenarios/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(`SELECT * FROM risk_scenarios WHERE id = ?`).bind(id).first<any>();
  if (!existing) return c.json({ success: false, error: 'not found' }, 404);
  if (existing.is_system) return c.json({ success: false, error: 'system scenario is read-only' }, 403);
  if (existing.owner_id !== user.id && !ADMIN_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const body = await c.req.json<any>();
  await c.env.DB.prepare(`
    UPDATE risk_scenarios SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      factor_shocks_json = COALESCE(?, factor_shocks_json),
      updated_at = ?
    WHERE id = ?
  `).bind(
    body.name ?? null,
    body.description ?? null,
    body.factor_shocks ? JSON.stringify(body.factor_shocks) : null,
    now(), id,
  ).run();
  await fireCascade({
    event: 'risk.scenario.updated', actor_id: user.id,
    entity_type: 'risk_scenario', entity_id: id, data: { fields: Object.keys(body) }, env: c.env,
  });
  return c.json({ success: true });
});

risk.delete('/scenarios/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(`SELECT * FROM risk_scenarios WHERE id = ?`).bind(id).first<any>();
  if (!existing) return c.json({ success: false, error: 'not found' }, 404);
  if (existing.is_system) return c.json({ success: false, error: 'system scenario is read-only' }, 403);
  if (existing.owner_id !== user.id && !ADMIN_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  await c.env.DB.prepare(`DELETE FROM risk_scenarios WHERE id = ?`).bind(id).run();
  await fireCascade({
    event: 'risk.scenario.deleted', actor_id: user.id,
    entity_type: 'risk_scenario', entity_id: id, data: {}, env: c.env,
  });
  return c.json({ success: true });
});

risk.get('/scenarios/:id/results', async (c) => {
  const user = getCurrentUser(c);
  if (!canRead(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const portfolioId = c.req.query('portfolio_id');
  let sql = `
    SELECT * FROM risk_scenario_results
    WHERE scenario_id = ?
  `;
  const params: any[] = [id];
  if (portfolioId) { sql += ' AND portfolio_id = ?'; params.push(portfolioId); }
  sql += ' ORDER BY as_of_date DESC LIMIT 90';
  const res = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: res.results || [] });
});

risk.post('/scenarios/:id/run', async (c) => {
  const user = getCurrentUser(c);
  if (!canWriteOwn(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const portfolioId = c.req.query('portfolio_id');
  if (!portfolioId) return c.json({ success: false, error: 'portfolio_id required' }, 400);

  const scenario = await c.env.DB.prepare(`SELECT * FROM risk_scenarios WHERE id = ?`).bind(id).first<any>();
  const portfolio = await c.env.DB.prepare(`SELECT * FROM risk_portfolios WHERE id = ?`).bind(portfolioId).first<any>();
  if (!scenario || !portfolio) return c.json({ success: false, error: 'not found' }, 404);

  let shocks: FactorShock[] = [];
  try { shocks = JSON.parse(scenario.factor_shocks_json || '[]'); } catch {}
  const positions = await fetchPositions(c.env, portfolio.basis_filter_json);
  const result = runScenario(positions, shocks);

  const rid = newId();
  const asOf = now().slice(0, 10);
  await c.env.DB.prepare(`
    INSERT INTO risk_scenario_results (
      id, scenario_id, portfolio_id, as_of_date, pnl_impact_zar, breakdown_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(rid, id, portfolioId, asOf, result.pnl, JSON.stringify(result.breakdown), now()).run();

  await fireCascade({
    event: 'risk.scenario.run', actor_id: user.id,
    entity_type: 'risk_scenario', entity_id: id,
    data: { portfolio_id: portfolioId, pnl: result.pnl }, env: c.env,
  });

  return c.json({ success: true, data: { id: rid, as_of_date: asOf, ...result } });
});

// ── factors ───────────────────────────────────────────────────────────────

risk.get('/factors', async (c) => {
  const user = getCurrentUser(c);
  if (!canRead(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const res = await c.env.DB.prepare(`SELECT * FROM risk_factors ORDER BY factor_type ASC, name ASC`).all();
  return c.json({ success: true, data: res.results || [] });
});

risk.get('/factors/:id/history', async (c) => {
  const user = getCurrentUser(c);
  if (!canRead(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const days = Math.min(Number(c.req.query('days') || 90), 730);
  const res = await c.env.DB.prepare(`
    SELECT as_of_date, value FROM risk_factor_history
    WHERE factor_id = ? ORDER BY as_of_date DESC LIMIT ?
  `).bind(id, days).all();
  const rows = (res.results || []).slice().reverse();
  return c.json({ success: true, data: rows });
});

export default risk;
