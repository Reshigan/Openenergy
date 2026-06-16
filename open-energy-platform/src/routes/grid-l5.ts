// ════════════════════════════════════════════════════════════════════════
// grid-l5 — Grid operator L5 surface.
//
// Mounted at /api/grid-l5. State machines + business rules + step-up for
// every consequential operation.
//
//   /constraints          — grid constraint registry + activation
//   /dispatch/runs        — economic dispatch with constraint solver
//   /ancillary/contracts  — FCR / FRR / reserves / black start
//   /ancillary/dispatch   — activation events + performance scoring
//   /frequency/events     — frequency excursions + ROCOF
//   /wheeling             — bilateral wheeling agreements
//   /curtailment          — curtailment events + compensation
//   /blackstart           — black-start units + test scheduling
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';
import { fireCascade } from '../utils/cascade';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const adminOnly = (role: string) => ['admin', 'support', 'grid_operator'].includes(role);

// ─── Constraints ─────────────────────────────────────────────────────────
r.get('/constraints', async (c) => {
  const active = c.req.query('active');
  const sql = active === '1'
    ? `SELECT * FROM oe_grid_constraints WHERE active_to IS NULL OR active_to > datetime('now') ORDER BY zone`
    : `SELECT * FROM oe_grid_constraints ORDER BY active_from DESC LIMIT 200`;
  const rows = await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/constraints', requireStepUp('grid.constraint_change'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.zone || !b.constraint_type || b.limit_mw == null || !b.direction) {
    return c.json({ success: false, error: 'zone + constraint_type + limit_mw + direction required' }, 400);
  }
  const id = genId('gc');
  await c.env.DB.prepare(`
    INSERT INTO oe_grid_constraints
      (id, zone, constraint_type, limit_mw, direction, source, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    id, b.zone, b.constraint_type, Number(b.limit_mw), b.direction,
    b.source || null, b.notes || null, user.id,
  ).run();
  await fireCascade({
    event: 'grid.constraint_added',
    actor_id: user.id,
    entity_type: 'oe_grid_constraints',
    entity_id: id,
    data: { zone: b.zone, constraint_type: b.constraint_type, limit_mw: Number(b.limit_mw), direction: b.direction },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

r.post('/constraints/:id/deactivate', requireStepUp('grid.constraint_change'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE oe_grid_constraints SET active_to = datetime('now') WHERE id = ?`).bind(id).run();
  await fireCascade({
    event: 'grid.constraint_deactivated',
    actor_id: user.id,
    entity_type: 'oe_grid_constraints',
    entity_id: String(id),
    data: {},
    env: c.env,
  });
  return c.json({ success: true });
});

// ─── Dispatch ────────────────────────────────────────────────────────────
r.get('/dispatch/runs', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT * FROM oe_dispatch_runs
    WHERE interval_start >= datetime('now', '-7 days')
    ORDER BY interval_start DESC LIMIT 200
  `).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/dispatch/runs', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.interval_start) return c.json({ success: false, error: 'interval_start required' }, 400);
  const id = genId('dr');
  const tradeDate = String(b.interval_start).slice(0, 10);
  await c.env.DB.prepare(`
    INSERT INTO oe_dispatch_runs (id, trade_date, interval_start, status, created_by)
    VALUES (?,?,?,?,?)
  `).bind(id, tradeDate, b.interval_start, 'queued', user.id).run();
  await fireCascade({
    event: 'grid.dispatch_run_created',
    actor_id: user.id,
    entity_type: 'oe_dispatch_runs',
    entity_id: id,
    data: { trade_date: tradeDate, interval_start: b.interval_start },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

r.post('/dispatch/runs/:id/optimize', requireStepUp('grid.dispatch_optimize'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const t0 = Date.now();
  // Constraint-aware merit-order solver:
  //   1. Pull all submitted offers for this run, sorted by price ASC
  //   2. Pull demand target + active grid constraints
  //   3. Clear offers in price order until demand met OR a constraint binds
  //   4. Set marginal price = last cleared offer
  //   5. Mark binding constraints + remaining offers
  const run = await c.env.DB.prepare(`SELECT * FROM oe_dispatch_runs WHERE id = ?`).bind(id).first<any>();
  if (!run) return c.json({ success: false, error: 'not found' }, 404);
  if (run.status === 'published') return c.json({ success: false, error: 'already published' }, 409);
  const offers = await c.env.DB.prepare(
    `SELECT * FROM oe_dispatch_offers WHERE run_id = ? ORDER BY offer_price_zar_mwh ASC`,
  ).bind(id).all<any>();
  const constraints = await c.env.DB.prepare(
    `SELECT * FROM oe_grid_constraints WHERE active_to IS NULL OR active_to > datetime('now')`,
  ).all<any>();
  const demandMw = Number(run.total_demand_mw || 5000);  // default if unset
  let cleared = 0;
  let marginal = 0;
  const binding: string[] = [];
  // Merit-order clearing stays sequential (cleared/marginal accumulate); collect
  // per-offer writes and flush them in a single batch after the solver completes.
  const offerStmts: D1PreparedStatement[] = [];
  for (const o of (offers.results || []) as any[]) {
    const needed = demandMw - cleared;
    if (needed <= 0) break;
    const award = Math.min(Number(o.offer_mw), needed);
    // Crude constraint check: if any constraint zone has aggregate dispatched >
    // limit, mark as binding and stop clearing offers in that zone
    let blocked = false;
    for (const con of (constraints.results || []) as any[]) {
      // Without zone-tag per offer this is illustrative — production wires
      // the zonal mapping per asset.
      if (cleared + award > Number(con.limit_mw)) {
        binding.push(con.id);
        blocked = true; break;
      }
    }
    if (blocked) {
      offerStmts.push(c.env.DB.prepare(`UPDATE oe_dispatch_offers SET status = 'curtailed' WHERE id = ?`).bind(o.id));
      continue;
    }
    offerStmts.push(c.env.DB.prepare(`
      UPDATE oe_dispatch_offers SET awarded_mw = ?, awarded_price_zar_mwh = ?, status = ? WHERE id = ?
    `).bind(award, o.offer_price_zar_mwh, award === Number(o.offer_mw) ? 'fully_cleared' : 'partially_cleared', o.id));
    cleared += award;
    marginal = Number(o.offer_price_zar_mwh);
  }
  offerStmts.push(c.env.DB.prepare(`
    UPDATE oe_dispatch_runs
    SET status = 'optimized', total_supply_mw = ?, marginal_price_zar = ?, active_constraints = ?, optimization_seconds = ?
    WHERE id = ?
  `).bind(cleared, marginal, JSON.stringify([...new Set(binding)]), (Date.now() - t0) / 1000, id));
  for (let i = 0; i < offerStmts.length; i += 100) await c.env.DB.batch(offerStmts.slice(i, i + 100));
  await fireCascade({
    event: 'grid.dispatch_run_optimized',
    actor_id: user.id,
    entity_type: 'oe_dispatch_runs',
    entity_id: String(id),
    data: {
      cleared_mw: cleared,
      marginal_price_zar: marginal,
      binding_constraints: [...new Set(binding)],
      optimization_seconds: (Date.now() - t0) / 1000,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { cleared_mw: cleared, marginal_price_zar: marginal, binding_constraints: binding.length } });
});

r.post('/dispatch/runs/:id/publish', requireStepUp('grid.dispatch_publish.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE oe_dispatch_runs SET status = 'published' WHERE id = ? AND status = 'optimized'`).bind(id).run();
  await fireCascade({
    event: 'grid.dispatch_run_published',
    actor_id: user.id,
    entity_type: 'oe_dispatch_runs',
    entity_id: String(id),
    data: {},
    env: c.env,
  });
  return c.json({ success: true });
});

r.post('/dispatch/runs/:id/offers', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.offer_mw || !b.offer_price_zar_mwh) return c.json({ success: false, error: 'offer_mw + offer_price_zar_mwh required' }, 400);
  const offerId = genId('do');
  await c.env.DB.prepare(`
    INSERT INTO oe_dispatch_offers (id, run_id, participant_id, asset_id, offer_mw, offer_price_zar_mwh)
    VALUES (?,?,?,?,?,?)
  `).bind(offerId, id, user.id, b.asset_id || null, Number(b.offer_mw), Number(b.offer_price_zar_mwh)).run();
  return c.json({ success: true, data: { id: offerId } }, 201);
});

r.get('/dispatch/runs/:id', async (c) => {
  const id = c.req.param('id');
  const run = await c.env.DB.prepare(`SELECT * FROM oe_dispatch_runs WHERE id = ?`).bind(id).first<any>();
  if (!run) return c.json({ success: false, error: 'not found' }, 404);
  const offers = await c.env.DB.prepare(`SELECT * FROM oe_dispatch_offers WHERE run_id = ? ORDER BY offer_price_zar_mwh ASC`).bind(id).all();
  return c.json({ success: true, data: { run, offers: offers.results || [] } });
});

// ─── Ancillary services ─────────────────────────────────────────────────
r.get('/ancillary/contracts', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = adminOnly(user.role);
  const sql = isOfficer
    ? `SELECT * FROM oe_ancillary_contracts ORDER BY status, start_at DESC LIMIT 200`
    : `SELECT * FROM oe_ancillary_contracts WHERE participant_id = ? ORDER BY start_at DESC`;
  const rows = isOfficer
    ? await c.env.DB.prepare(sql).all()
    : await c.env.DB.prepare(sql).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/ancillary/contracts', requireStepUp('grid.ancillary_award.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['participant_id', 'service_type', 'capacity_mw', 'start_at', 'end_at'];
  for (const f of required) if (b[f] == null) return c.json({ success: false, error: `${f} required` }, 400);
  const id = genId('anc');
  await c.env.DB.prepare(`
    INSERT INTO oe_ancillary_contracts
      (id, participant_id, service_type, capacity_mw, availability_zar_per_mw_per_h,
       utilisation_zar_per_mwh, start_at, end_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    id, b.participant_id, b.service_type, Number(b.capacity_mw),
    b.availability_zar_per_mw_per_h != null ? Number(b.availability_zar_per_mw_per_h) : null,
    b.utilisation_zar_per_mwh != null ? Number(b.utilisation_zar_per_mwh) : null,
    b.start_at, b.end_at,
  ).run();
  await fireCascade({
    event: 'grid.ancillary_contract_awarded',
    actor_id: user.id,
    entity_type: 'oe_ancillary_contracts',
    entity_id: id,
    data: {
      participant_id: b.participant_id, service_type: b.service_type,
      capacity_mw: Number(b.capacity_mw),
      start_at: b.start_at, end_at: b.end_at,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

r.post('/ancillary/dispatch', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.contract_id || !b.event_type) return c.json({ success: false, error: 'contract_id + event_type required' }, 400);
  const c0 = await c.env.DB.prepare(`SELECT capacity_mw, utilisation_zar_per_mwh FROM oe_ancillary_contracts WHERE id = ?`).bind(b.contract_id).first<any>();
  if (!c0) return c.json({ success: false, error: 'contract not found' }, 404);
  const contracted = Number(c0.capacity_mw);
  const delivered = Number(b.delivered_mw || 0);
  const performance = contracted > 0 ? delivered / contracted : 0;
  const payment = delivered * Number(c0.utilisation_zar_per_mwh || 0);
  // Penalty if response_time_seconds > 30s for FCR (Grid Code Annex A)
  const penalty = (b.response_time_seconds || 0) > 30 ? payment * 0.25 : 0;
  const id = genId('ad');
  await c.env.DB.prepare(`
    INSERT INTO oe_ancillary_dispatch
      (id, contract_id, event_type, triggered_at, response_time_seconds,
       delivered_mw, contracted_mw, performance_pct, payment_zar, penalty_zar, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.contract_id, b.event_type, b.triggered_at || new Date().toISOString(),
    b.response_time_seconds ? Number(b.response_time_seconds) : null,
    delivered, contracted, performance, payment, penalty, b.notes || null,
  ).run();
  // Rolling performance score = avg over last 10 dispatches
  const recent = await c.env.DB.prepare(
    `SELECT AVG(performance_pct) AS p FROM (SELECT performance_pct FROM oe_ancillary_dispatch WHERE contract_id = ? ORDER BY triggered_at DESC LIMIT 10)`,
  ).bind(b.contract_id).first<any>();
  await c.env.DB.prepare(`UPDATE oe_ancillary_contracts SET performance_score = ? WHERE id = ?`).bind(Number(recent?.p || 0), b.contract_id).run();
  await fireCascade({
    event: 'grid.ancillary_dispatched',
    actor_id: user.id,
    entity_type: 'oe_ancillary_dispatch',
    entity_id: id,
    data: {
      contract_id: b.contract_id, event_type: b.event_type,
      delivered_mw: delivered, contracted_mw: contracted,
      performance_pct: performance, payment_zar: payment, penalty_zar: penalty,
      response_time_seconds: b.response_time_seconds || null,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, performance_pct: performance, payment_zar: payment, penalty_zar: penalty } });
});

// ─── Frequency events ───────────────────────────────────────────────────
r.get('/frequency/events', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT * FROM oe_frequency_events WHERE detected_at >= date('now','-30 days') ORDER BY detected_at DESC LIMIT 200
  `).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/frequency/events', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.detected_at || b.min_frequency_hz == null) return c.json({ success: false, error: 'detected_at + min_frequency_hz required' }, 400);
  // Classify based on deviation from 50 Hz
  const dev = Math.abs(50 - Number(b.min_frequency_hz)) * 1000;
  const severity = dev >= 500 ? 'critical' : dev >= 200 ? 'major' : dev >= 50 ? 'minor' : 'info';
  const id = genId('fe');
  await c.env.DB.prepare(`
    INSERT INTO oe_frequency_events
      (id, detected_at, duration_seconds, min_frequency_hz, max_deviation_mhz,
       recovery_seconds, rocof_hz_per_s, classification, severity, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.detected_at, b.duration_seconds || null, Number(b.min_frequency_hz), dev,
    b.recovery_seconds || null, b.rocof_hz_per_s || null,
    Number(b.min_frequency_hz) < 50 ? 'under_frequency' : 'over_frequency',
    severity, b.notes || null,
  ).run();
  await fireCascade({
    event: 'grid.frequency_event_recorded',
    actor_id: user.id,
    entity_type: 'oe_frequency_events',
    entity_id: id,
    data: {
      detected_at: b.detected_at,
      min_frequency_hz: Number(b.min_frequency_hz),
      max_deviation_mhz: dev,
      severity,
      classification: Number(b.min_frequency_hz) < 50 ? 'under_frequency' : 'over_frequency',
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, severity, max_deviation_mhz: dev } });
});

// ─── Wheeling agreements ────────────────────────────────────────────────
r.get('/wheeling', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = adminOnly(user.role);
  const sql = isOfficer
    ? `SELECT * FROM oe_wheeling_agreements ORDER BY created_at DESC LIMIT 200`
    : `SELECT * FROM oe_wheeling_agreements WHERE generator_id = ? OR offtaker_id = ? ORDER BY created_at DESC`;
  const rows = isOfficer
    ? await c.env.DB.prepare(sql).all()
    : await c.env.DB.prepare(sql).bind(user.id, user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/wheeling', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['generator_id', 'offtaker_id', 'injection_point', 'withdrawal_point', 'contracted_mw', 'loss_factor_pct', 'wheeling_tariff_zar_per_mwh'];
  for (const f of required) if (b[f] == null) return c.json({ success: false, error: `${f} required` }, 400);
  const id = genId('wha');
  await c.env.DB.prepare(`
    INSERT INTO oe_wheeling_agreements
      (id, generator_id, offtaker_id, injection_point, withdrawal_point,
       contracted_mw, loss_factor_pct, wheeling_tariff_zar_per_mwh, notes)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.generator_id, b.offtaker_id, b.injection_point, b.withdrawal_point,
    Number(b.contracted_mw), Number(b.loss_factor_pct),
    Number(b.wheeling_tariff_zar_per_mwh), b.notes || null,
  ).run();
  await fireCascade({
    event: 'grid.wheeling_agreement_created',
    actor_id: user.id,
    entity_type: 'oe_wheeling_agreements',
    entity_id: id,
    data: {
      generator_id: b.generator_id, offtaker_id: b.offtaker_id,
      contracted_mw: Number(b.contracted_mw),
      loss_factor_pct: Number(b.loss_factor_pct),
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

r.post('/wheeling/:id/approve', requireStepUp('grid.wheeling_approve.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_wheeling_agreements
    SET status = 'active', approved_by = ?, approved_at = datetime('now'),
        effective_from = ?, effective_to = ?
    WHERE id = ?
  `).bind(user.id, b.effective_from || new Date().toISOString(), b.effective_to || null, id).run();
  await fireCascade({
    event: 'grid.wheeling_agreement_approved',
    actor_id: user.id,
    entity_type: 'oe_wheeling_agreements',
    entity_id: String(id),
    data: {
      effective_from: b.effective_from || new Date().toISOString(),
      effective_to: b.effective_to || null,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

// ─── Curtailment ────────────────────────────────────────────────────────
r.get('/curtailment', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = adminOnly(user.role);
  const days = Math.min(180, Math.max(1, Number(c.req.query('days') || 30)));
  const sql = isOfficer
    ? `SELECT * FROM oe_curtailment_events WHERE started_at >= date('now', ? || ' days') ORDER BY started_at DESC`
    : `SELECT * FROM oe_curtailment_events WHERE participant_id = ? AND started_at >= date('now', ? || ' days') ORDER BY started_at DESC`;
  const rows = isOfficer
    ? await c.env.DB.prepare(sql).bind(`-${days}`).all()
    : await c.env.DB.prepare(sql).bind(user.id, `-${days}`).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/curtailment', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.participant_id || !b.curtail_type || !b.started_at || b.pre_curtail_mw == null || b.curtail_mw == null) {
    return c.json({ success: false, error: 'participant_id + curtail_type + started_at + pre_curtail_mw + curtail_mw required' }, 400);
  }
  const id = genId('ce');
  await c.env.DB.prepare(`
    INSERT INTO oe_curtailment_events
      (id, participant_id, asset_id, curtail_type, started_at, pre_curtail_mw, curtail_mw, reason)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(id, b.participant_id, b.asset_id || null, b.curtail_type, b.started_at, Number(b.pre_curtail_mw), Number(b.curtail_mw), b.reason || null).run();
  await fireCascade({
    event: 'grid.curtailment_issued',
    actor_id: user.id,
    entity_type: 'oe_curtailment_events',
    entity_id: id,
    data: {
      participant_id: b.participant_id, asset_id: b.asset_id || null,
      curtail_type: b.curtail_type, started_at: b.started_at,
      pre_curtail_mw: Number(b.pre_curtail_mw), curtail_mw: Number(b.curtail_mw),
      reason: b.reason || null,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

r.post('/curtailment/:id/close', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const row = await c.env.DB.prepare(`SELECT * FROM oe_curtailment_events WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  const endedAt = b.ended_at || new Date().toISOString();
  const hours = (new Date(endedAt).getTime() - new Date(row.started_at).getTime()) / 3_600_000;
  const curtailedMwh = Number(row.curtail_mw) * hours;
  const lossZar = curtailedMwh * 1500;  // weighted-average tariff fallback
  const compensation = row.curtail_type === 'regulatory' ? lossZar : 0;
  await c.env.DB.prepare(`
    UPDATE oe_curtailment_events
    SET ended_at = ?, curtailed_mwh = ?, estimated_loss_zar = ?, compensation_zar = ?
    WHERE id = ?
  `).bind(endedAt, curtailedMwh, lossZar, compensation, id).run();
  await fireCascade({
    event: 'grid.curtailment_lifted',
    actor_id: user.id,
    entity_type: 'oe_curtailment_events',
    entity_id: String(id),
    data: {
      ended_at: endedAt, curtailed_mwh: curtailedMwh,
      estimated_loss_zar: lossZar, compensation_zar: compensation,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { curtailed_mwh: curtailedMwh, estimated_loss_zar: lossZar } });
});

// ─── Black start ────────────────────────────────────────────────────────
r.get('/blackstart', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_blackstart_units ORDER BY status, last_tested_at DESC LIMIT 100`).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/blackstart', requireStepUp('grid.blackstart_register.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.participant_id || b.capacity_mw == null || b.startup_minutes == null) {
    return c.json({ success: false, error: 'participant_id + capacity_mw + startup_minutes required' }, 400);
  }
  const id = genId('bs');
  await c.env.DB.prepare(`
    INSERT INTO oe_blackstart_units
      (id, participant_id, asset_id, capacity_mw, startup_minutes, payment_zar_per_month)
    VALUES (?,?,?,?,?,?)
  `).bind(id, b.participant_id, b.asset_id || null, Number(b.capacity_mw), Number(b.startup_minutes), b.payment_zar_per_month || null).run();
  await fireCascade({
    event: 'grid.blackstart_unit_registered',
    actor_id: user.id,
    entity_type: 'oe_blackstart_units',
    entity_id: id,
    data: {
      participant_id: b.participant_id, asset_id: b.asset_id || null,
      capacity_mw: Number(b.capacity_mw), startup_minutes: Number(b.startup_minutes),
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

r.post('/blackstart/:id/test', async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_blackstart_units SET last_tested_at = datetime('now'), test_result = ?
    WHERE id = ?
  `).bind(b.test_result || 'passed', id).run();
  await fireCascade({
    event: 'grid.blackstart_test_recorded',
    actor_id: user.id,
    entity_type: 'oe_blackstart_units',
    entity_id: String(id),
    data: { test_result: b.test_result || 'passed' },
    env: c.env,
  });
  return c.json({ success: true });
});

export default r;
