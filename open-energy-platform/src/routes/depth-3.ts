// ════════════════════════════════════════════════════════════════════════
// depth-3 — IPP construction drawdown + LD engine + Lender IFRS 9 +
// Carbon PDD workflow.
//
// Three routers exported (mounted at /api/ipp-deep, /api/lender-deep,
// /api/carbon-deep).
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';
import { fireCascade } from '../utils/cascade';

export const ipp    = new Hono<HonoEnv>(); ipp.use('*', authMiddleware);
export const lender = new Hono<HonoEnv>(); lender.use('*', authMiddleware);
export const carbon = new Hono<HonoEnv>(); carbon.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const adminOnly = (role: string) => ['admin', 'support', 'lender', 'ipp', 'carbon_fund'].includes(role);

// ════════════════════════════════════════════════════════════════════════
// IPP — Drawdowns + LD engine
// ════════════════════════════════════════════════════════════════════════
const STANDARD_CPS = [
  { cp_type: 'ie_certificate',           description: 'Independent Engineer construction progress certificate' },
  { cp_type: 'insurance_renewal',        description: 'Insurance policies current + premium paid' },
  { cp_type: 'environmental_compliance', description: 'All EA conditions in compliant status' },
  { cp_type: 'covenant_test',            description: 'No covenant breaches outstanding' },
  { cp_type: 'tax_clearance',            description: 'SARS tax clearance valid' },
  { cp_type: 'engineering_milestone',    description: 'Drawdown milestone certified achieved' },
];

ipp.get('/drawdowns', async (c) => {
  const projectId = c.req.query('project_id');
  const sql = projectId
    ? `SELECT * FROM oe_ipp_drawdowns WHERE project_id = ? ORDER BY drawdown_number DESC`
    : `SELECT * FROM oe_ipp_drawdowns ORDER BY requested_at DESC LIMIT 200`;
  const rows = projectId
    ? await c.env.DB.prepare(sql).bind(projectId).all()
    : await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rows.results || [] });
});

ipp.post('/drawdowns', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.project_id || !b.requested_amount_zar) return c.json({ success: false, error: 'project_id + requested_amount_zar required' }, 400);
  const seq = await c.env.DB.prepare(`SELECT COALESCE(MAX(drawdown_number),0) AS m FROM oe_ipp_drawdowns WHERE project_id = ?`).bind(b.project_id).first<any>();
  const num = Number(seq?.m || 0) + 1;
  const id = genId('dd');
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_drawdowns (id, project_id, drawdown_number, requested_amount_zar, required_by, status)
    VALUES (?,?,?,?,?,?)
  `).bind(id, b.project_id, num, Number(b.requested_amount_zar), b.required_by || null, 'cps_pending').run();
  // Auto-create standard CPs
  for (const cp of STANDARD_CPS) {
    await c.env.DB.prepare(`
      INSERT INTO oe_ipp_drawdown_cps (id, drawdown_id, cp_type, description, status)
      VALUES (?,?,?,?,?)
    `).bind(genId('cp'), id, cp.cp_type, cp.description, 'pending').run();
  }
  await fireCascade({
    event: 'ipp.drawdown_requested',
    actor_id: user.id,
    entity_type: 'ipp_drawdown',
    entity_id: id,
    data: {
      id, project_id: b.project_id, drawdown_number: num,
      requested_amount_zar: Number(b.requested_amount_zar),
      required_by: b.required_by || null,
      cps_count: STANDARD_CPS.length, requested_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, drawdown_number: num, cps_count: STANDARD_CPS.length } }, 201);
});

ipp.get('/drawdowns/:id', async (c) => {
  const id = c.req.param('id');
  const dd  = await c.env.DB.prepare(`SELECT * FROM oe_ipp_drawdowns WHERE id = ?`).bind(id).first<any>();
  if (!dd) return c.json({ success: false, error: 'not found' }, 404);
  const cps = await c.env.DB.prepare(`SELECT * FROM oe_ipp_drawdown_cps WHERE drawdown_id = ? ORDER BY cp_type ASC`).bind(id).all();
  return c.json({ success: true, data: { drawdown: dd, conditions_precedent: cps.results || [] } });
});

ipp.post('/drawdowns/:id/cps/:cp_id/satisfy', async (c) => {
  const user = getCurrentUser(c);
  const cpId = c.req.param('cp_id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_ipp_drawdown_cps SET status = 'satisfied', evidence_r2_key = ?, satisfied_at = datetime('now'), satisfied_by = ?
    WHERE id = ?
  `).bind(b.evidence_r2_key || null, user.id, cpId).run();
  return c.json({ success: true });
});

ipp.post('/drawdowns/:id/cps/:cp_id/waive', requireStepUp('ipp.cp_waive.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const cpId = c.req.param('cp_id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.reason) return c.json({ success: false, error: 'reason required' }, 400);
  await c.env.DB.prepare(`
    UPDATE oe_ipp_drawdown_cps SET status = 'waived', waived_by = ?, waiver_reason = ?
    WHERE id = ?
  `).bind(user.id, b.reason, cpId).run();
  await fireCascade({
    event: 'ipp.drawdown_cp_waived',
    actor_id: user.id,
    entity_type: 'ipp_drawdown_cp',
    entity_id: String(cpId),
    data: {
      cp_id: cpId, drawdown_id: c.req.param('id'),
      reason: b.reason, waived_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

ipp.post('/drawdowns/:id/approve', requireStepUp('ipp.drawdown_approve.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  // Verify all CPs are satisfied/waived
  const outstanding = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM oe_ipp_drawdown_cps WHERE drawdown_id = ? AND status NOT IN ('satisfied','waived')`).bind(id).first<any>();
  if (Number(outstanding?.c || 0) > 0) {
    return c.json({ success: false, error: 'cps_outstanding', data: { count: outstanding.c } }, 409);
  }
  const dd = await c.env.DB.prepare(`SELECT requested_amount_zar FROM oe_ipp_drawdowns WHERE id = ?`).bind(id).first<any>();
  if (!dd) return c.json({ success: false, error: 'not found' }, 404);
  const approvedAmount = Number(b.approved_amount_zar || dd.requested_amount_zar);
  await c.env.DB.prepare(`
    UPDATE oe_ipp_drawdowns SET status = 'approved', approved_amount_zar = ?, approved_by = ?, approved_at = datetime('now')
    WHERE id = ?
  `).bind(approvedAmount, user.id, id).run();
  await fireCascade({
    event: 'ipp.drawdown_approved',
    actor_id: user.id,
    entity_type: 'ipp_drawdown',
    entity_id: String(id),
    data: {
      id, approved_amount_zar: approvedAmount,
      requested_amount_zar: Number(dd.requested_amount_zar),
      approved_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { approved_amount_zar: approvedAmount } });
});

ipp.post('/drawdowns/:id/disburse', requireStepUp('settlement.transfer.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!adminOnly(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`
    UPDATE oe_ipp_drawdowns SET status = 'disbursed', disbursed_amount_zar = approved_amount_zar, disbursed_at = datetime('now')
    WHERE id = ? AND status = 'approved'
  `).bind(id).run();
  const disbursed = await c.env.DB.prepare(
    `SELECT disbursed_amount_zar, project_id FROM oe_ipp_drawdowns WHERE id = ?`
  ).bind(id).first<any>();
  await fireCascade({
    event: 'ipp.drawdown_disbursed',
    actor_id: user.id,
    entity_type: 'ipp_drawdown',
    entity_id: String(id),
    data: {
      id,
      project_id: disbursed?.project_id,
      disbursed_amount_zar: Number(disbursed?.disbursed_amount_zar || 0),
      disbursed_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

// ─── LD engine ──────────────────────────────────────────────────────────
ipp.get('/lds', async (c) => {
  const projectId = c.req.query('project_id');
  const sql = projectId
    ? `SELECT * FROM oe_ipp_ld_events WHERE project_id = ? ORDER BY reference_date DESC`
    : `SELECT * FROM oe_ipp_ld_events ORDER BY reference_date DESC LIMIT 200`;
  const rows = projectId
    ? await c.env.DB.prepare(sql).bind(projectId).all()
    : await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rows.results || [] });
});

ipp.post('/lds', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['project_id', 'event_type', 'reference_date', 'daily_rate_zar', 'cap_pct', 'contract_price_zar'];
  for (const f of required) if (!b[f]) return c.json({ success: false, error: `${f} required` }, 400);
  const id = genId('ld');
  const curePeriodDays = Number(b.cure_period_days || 14);
  const cureDeadline = new Date(new Date(b.reference_date).getTime() + curePeriodDays * 86_400_000).toISOString();
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_ld_events
      (id, project_id, epc_contract_id, event_type, reference_date,
       daily_rate_zar, cap_pct, contract_price_zar, cure_period_days, cure_deadline)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.project_id, b.epc_contract_id || null, b.event_type, b.reference_date,
    Number(b.daily_rate_zar), Number(b.cap_pct), Number(b.contract_price_zar),
    curePeriodDays, cureDeadline,
  ).run();
  await fireCascade({
    event: 'ipp.ld_event_raised',
    actor_id: user.id,
    entity_type: 'ipp_ld_event',
    entity_id: id,
    data: {
      id, project_id: b.project_id, event_type: b.event_type,
      reference_date: b.reference_date,
      daily_rate_zar: Number(b.daily_rate_zar),
      cap_pct: Number(b.cap_pct),
      contract_price_zar: Number(b.contract_price_zar),
      cure_deadline: cureDeadline,
      raised_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, cure_deadline: cureDeadline } }, 201);
});

ipp.post('/lds/:id/cure', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`UPDATE oe_ipp_ld_events SET status = 'cured', cured_at = datetime('now'), actual_date = ? WHERE id = ?`).bind(b.actual_date || new Date().toISOString(), id).run();
  await fireCascade({
    event: 'ipp.ld_event_cured',
    actor_id: user.id,
    entity_type: 'ipp_ld_event',
    entity_id: String(id),
    data: { id, actual_date: b.actual_date || new Date().toISOString(), cured_by: user.id },
    env: c.env,
  });
  return c.json({ success: true });
});

ipp.post('/lds/:id/accrue', async (c) => {
  // Compute current accrual based on days since reference_date
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT * FROM oe_ipp_ld_events WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  if (row.status !== 'accruing') return c.json({ success: true, data: { accrued_amount_zar: row.accrued_amount_zar } });
  // Honour cure period: no accrual before cure_deadline
  if (new Date(row.cure_deadline).getTime() > Date.now()) {
    return c.json({ success: true, data: { accrued_amount_zar: 0, message: 'within cure period' } });
  }
  const delayDays = Math.max(0, Math.floor((Date.now() - new Date(row.cure_deadline).getTime()) / 86_400_000));
  const raw = delayDays * Number(row.daily_rate_zar);
  const cap = Number(row.contract_price_zar) * (Number(row.cap_pct) / 100);
  const capped = Math.min(raw, cap);
  const status = capped >= cap ? 'capped' : 'accruing';
  await c.env.DB.prepare(`UPDATE oe_ipp_ld_events SET delay_days = ?, accrued_amount_zar = ?, status = ? WHERE id = ?`).bind(delayDays, capped, status, id).run();
  return c.json({ success: true, data: { delay_days: delayDays, accrued_amount_zar: capped, cap_zar: cap, status } });
});

// ════════════════════════════════════════════════════════════════════════
// LENDER — IFRS 9 + watchlist + intercreditor
// ════════════════════════════════════════════════════════════════════════
lender.get('/ecl', async (c) => {
  const facility = c.req.query('facility_id');
  const sql = facility
    ? `SELECT * FROM oe_lender_ecl_staging WHERE facility_id = ? ORDER BY computed_at DESC LIMIT 50`
    : `SELECT * FROM oe_lender_ecl_staging ORDER BY computed_at DESC LIMIT 200`;
  const rows = facility
    ? await c.env.DB.prepare(sql).bind(facility).all()
    : await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rows.results || [] });
});

lender.post('/ecl/compute', requireStepUp('lender.ecl_compute'), async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'lender'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  const required = ['facility_id', 'participant_id', 'exposure_zar', 'stage'];
  for (const f of required) if (!b[f] && b[f] !== 0) return c.json({ success: false, error: `${f} required` }, 400);
  // Standard IFRS 9 ECL = EAD × PD × LGD
  const stage = Number(b.stage);
  const ead = Number(b.ead_zar || b.exposure_zar);
  let pd = 0; let pd12 = 0; let pdLife = 0;
  if (stage === 1) { pd12 = Number(b.pd_12m || 0.01); pd = pd12; }
  else if (stage === 2) { pdLife = Number(b.pd_lifetime || 0.10); pd = pdLife; }
  else { pdLife = Number(b.pd_lifetime || 1.0); pd = pdLife; }
  const lgd = Number(b.lgd_pct || 0.45);
  const ecl = ead * pd * lgd;
  const id = genId('ecl');
  await c.env.DB.prepare(`
    INSERT INTO oe_lender_ecl_staging
      (id, facility_id, participant_id, stage, stage_changed_at, stage_change_reason,
       exposure_zar, pd_12m, pd_lifetime, lgd_pct, ead_zar, ecl_amount_zar,
       next_assessment_at, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.facility_id, b.participant_id, stage, b.stage_changed_at || new Date().toISOString(),
    b.stage_change_reason || null,
    Number(b.exposure_zar),
    pd12 || null, pdLife || null, lgd, ead, ecl,
    new Date(Date.now() + 90 * 86_400_000).toISOString(),
    b.notes || null,
  ).run();
  await fireCascade({
    event: 'lender.ecl_computed',
    actor_id: user.id,
    entity_type: 'lender_ecl',
    entity_id: id,
    data: {
      id, facility_id: b.facility_id, participant_id: b.participant_id,
      stage, ead_zar: ead, pd, lgd_pct: lgd, ecl_amount_zar: ecl,
      computed_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, stage, ecl_amount_zar: ecl } });
});

lender.get('/watchlist', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT * FROM oe_lender_watchlist WHERE cleared_at IS NULL
    ORDER BY watchlist_tier DESC, added_at DESC LIMIT 200
  `).all();
  return c.json({ success: true, data: rows.results || [] });
});

lender.post('/watchlist', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'lender'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.facility_id || !b.participant_id || !b.trigger_signal) {
    return c.json({ success: false, error: 'facility_id + participant_id + trigger_signal required' }, 400);
  }
  const id = genId('wl');
  await c.env.DB.prepare(`
    INSERT INTO oe_lender_watchlist
      (id, facility_id, participant_id, watchlist_tier, trigger_signal, trigger_value, action_plan, added_by, next_review_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.facility_id, b.participant_id,
    Number(b.watchlist_tier || 1), b.trigger_signal,
    b.trigger_value ? Number(b.trigger_value) : null,
    b.action_plan || null, user.id,
    new Date(Date.now() + 30 * 86_400_000).toISOString(),
  ).run();
  await fireCascade({
    event: 'lender.watchlist_added',
    actor_id: user.id,
    entity_type: 'lender_watchlist',
    entity_id: id,
    data: {
      id, facility_id: b.facility_id, participant_id: b.participant_id,
      tier: Number(b.watchlist_tier || 1),
      trigger_signal: b.trigger_signal,
      added_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

lender.post('/watchlist/:id/clear', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'lender'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE oe_lender_watchlist SET cleared_at = datetime('now') WHERE id = ?`).bind(id).run();
  await fireCascade({
    event: 'lender.watchlist_cleared',
    actor_id: user.id,
    entity_type: 'lender_watchlist',
    entity_id: String(id),
    data: { id, cleared_by: user.id },
    env: c.env,
  });
  return c.json({ success: true });
});

lender.get('/intercreditor/:project_id', async (c) => {
  const pid = c.req.param('project_id');
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_lender_intercreditor WHERE project_id = ?`).bind(pid).all();
  return c.json({ success: true, data: rows.results || [] });
});

lender.post('/intercreditor', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'lender'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.project_id || !b.agent_lender_id || !b.total_facility_zar || b.senior_pct == null) {
    return c.json({ success: false, error: 'project_id + agent_lender_id + total_facility_zar + senior_pct required' }, 400);
  }
  const id = genId('ica');
  await c.env.DB.prepare(`
    INSERT INTO oe_lender_intercreditor
      (id, project_id, agent_lender_id, total_facility_zar, senior_pct,
       mezzanine_pct, subordinated_pct, cash_sweep_rule, voting_thresholds_json, signed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.project_id, b.agent_lender_id, Number(b.total_facility_zar),
    Number(b.senior_pct),
    b.mezzanine_pct != null ? Number(b.mezzanine_pct) : null,
    b.subordinated_pct != null ? Number(b.subordinated_pct) : null,
    b.cash_sweep_rule ? JSON.stringify(b.cash_sweep_rule) : null,
    b.voting_thresholds ? JSON.stringify(b.voting_thresholds) : null,
    b.signed_at || null,
  ).run();
  await fireCascade({
    event: 'lender.intercreditor_agreed',
    actor_id: user.id,
    entity_type: 'lender_intercreditor',
    entity_id: id,
    data: {
      id, project_id: b.project_id, agent_lender_id: b.agent_lender_id,
      total_facility_zar: Number(b.total_facility_zar),
      senior_pct: Number(b.senior_pct),
      mezzanine_pct: b.mezzanine_pct != null ? Number(b.mezzanine_pct) : null,
      subordinated_pct: b.subordinated_pct != null ? Number(b.subordinated_pct) : null,
      signed_at: b.signed_at || null,
      agreed_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

// ════════════════════════════════════════════════════════════════════════
// CARBON — PDD + monitoring + verification
// ════════════════════════════════════════════════════════════════════════
carbon.get('/pdd', async (c) => {
  const pid = c.req.query('project_id');
  const sql = pid ? `SELECT * FROM oe_carbon_pdd WHERE project_id = ?` : `SELECT * FROM oe_carbon_pdd ORDER BY created_at DESC LIMIT 100`;
  const rows = pid
    ? await c.env.DB.prepare(sql).bind(pid).all()
    : await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rows.results || [] });
});

carbon.post('/pdd', async (c) => {
  void getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.project_id || !b.methodology || !b.registry) return c.json({ success: false, error: 'project_id + methodology + registry required' }, 400);
  const id = genId('pdd');
  await c.env.DB.prepare(`
    INSERT INTO oe_carbon_pdd
      (id, project_id, methodology, registry, pdd_version, pdd_status,
       crediting_period_years, estimated_annual_tco2e, doe_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    id, b.project_id, b.methodology, b.registry,
    b.pdd_version || '1.0', 'draft',
    b.crediting_period_years || null,
    b.estimated_annual_tco2e || null,
    b.doe_id || null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

carbon.post('/pdd/:id/submit', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE oe_carbon_pdd SET pdd_status = 'submitted', updated_at = datetime('now') WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

carbon.post('/pdd/:id/register', requireStepUp('carbon.pdd_register.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'carbon_fund'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.registry_id) return c.json({ success: false, error: 'registry_id required' }, 400);
  await c.env.DB.prepare(`
    UPDATE oe_carbon_pdd SET pdd_status = 'registered', registry_id = ?, registered_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).bind(b.registry_id, id).run();
  await fireCascade({
    event: 'carbon.pdd_registered',
    actor_id: user.id,
    entity_type: 'carbon_pdd',
    entity_id: String(id),
    data: { id, registry_id: b.registry_id, registered_by: user.id },
    env: c.env,
  });
  return c.json({ success: true });
});

carbon.get('/monitoring', async (c) => {
  const pdd = c.req.query('pdd_id');
  const sql = pdd ? `SELECT * FROM oe_carbon_monitoring WHERE pdd_id = ?` : `SELECT * FROM oe_carbon_monitoring ORDER BY period_start DESC LIMIT 100`;
  const rows = pdd
    ? await c.env.DB.prepare(sql).bind(pdd).all()
    : await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rows.results || [] });
});

carbon.post('/monitoring', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.pdd_id || !b.period_start || !b.period_end) return c.json({ success: false, error: 'pdd_id + period_start + period_end required' }, 400);
  const id = genId('mon');
  await c.env.DB.prepare(`
    INSERT INTO oe_carbon_monitoring
      (id, pdd_id, period_start, period_end, measured_tco2e, ex_ante_tco2e,
       data_quality_pct, monitoring_report_r2_key)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    id, b.pdd_id, b.period_start, b.period_end,
    b.measured_tco2e || null, b.ex_ante_tco2e || null,
    b.data_quality_pct || null, b.monitoring_report_r2_key || null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

carbon.post('/monitoring/:id/issue', requireStepUp('carbon.issuance.high'), async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support', 'carbon_fund'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE oe_carbon_monitoring SET status = 'issued', issued_at = datetime('now'), issued_serial_range = ?
    WHERE id = ?
  `).bind(b.issued_serial_range || null, id).run();
  const mon = await c.env.DB.prepare(
    `SELECT pdd_id, period_start, period_end, measured_tco2e FROM oe_carbon_monitoring WHERE id = ?`
  ).bind(id).first<any>();
  await fireCascade({
    event: 'carbon.credits_issued',
    actor_id: user.id,
    entity_type: 'carbon_monitoring',
    entity_id: String(id),
    data: {
      id,
      pdd_id: mon?.pdd_id,
      period_start: mon?.period_start,
      period_end: mon?.period_end,
      measured_tco2e: mon?.measured_tco2e ? Number(mon.measured_tco2e) : null,
      issued_serial_range: b.issued_serial_range || null,
      issued_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

carbon.get('/verifications', async (c) => {
  const monId = c.req.query('monitoring_id');
  const sql = monId ? `SELECT * FROM oe_carbon_verifications WHERE monitoring_id = ?` : `SELECT * FROM oe_carbon_verifications ORDER BY created_at DESC LIMIT 100`;
  const rows = monId
    ? await c.env.DB.prepare(sql).bind(monId).all()
    : await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rows.results || [] });
});

carbon.post('/verifications', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.monitoring_id || !b.doe_id || !b.verification_type) {
    return c.json({ success: false, error: 'monitoring_id + doe_id + verification_type required' }, 400);
  }
  const id = genId('ver');
  await c.env.DB.prepare(`
    INSERT INTO oe_carbon_verifications (id, monitoring_id, doe_id, verification_type, fee_zar)
    VALUES (?,?,?,?,?)
  `).bind(id, b.monitoring_id, b.doe_id, b.verification_type, b.fee_zar || null).run();
  return c.json({ success: true, data: { id } }, 201);
});

carbon.post('/verifications/:id/transition', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const to = String(b.to || '');
  if (!['site_visit_done', 'draft_opinion', 'final_opinion', 'issued'].includes(to)) {
    return c.json({ success: false, error: 'invalid transition' }, 400);
  }
  const tsField =
    to === 'site_visit_done' ? 'site_visit_at' :
    to === 'draft_opinion'   ? 'draft_opinion_at' :
    to === 'final_opinion'   ? 'final_opinion_at' : null;
  const sets = ['status = ?'];
  const binds: any[] = [to];
  if (tsField) sets.push(`${tsField} = datetime('now')`);
  if (b.opinion_r2_key) { sets.push('opinion_r2_key = ?'); binds.push(b.opinion_r2_key); }
  binds.push(id);
  await c.env.DB.prepare(`UPDATE oe_carbon_verifications SET ${sets.join(',')} WHERE id = ?`).bind(...binds).run();
  await fireCascade({
    event: 'carbon.verification_transitioned',
    actor_id: user.id,
    entity_type: 'carbon_verification',
    entity_id: String(id),
    data: {
      id, to_status: to,
      opinion_r2_key: b.opinion_r2_key || null,
      transitioned_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

export default ipp;
