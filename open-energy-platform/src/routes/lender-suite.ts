// ═══════════════════════════════════════════════════════════════════════════
// Lender / project-finance suite:
//   • Covenant definitions, tests, waivers
//   • Independent Engineer (IE) certifications → disbursement sign-off
//   • Cash-flow waterfall execution
//   • Reserve account management (DSRA, MRA, O&M)
//   • Stress scenarios against project financials
// Mounted at /api/lender.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { evaluateCovenant, runWaterfall, dscr, llcr } from '../utils/covenants';

const lender = new Hono<HonoEnv>();
lender.use('*', authMiddleware);

function isLenderOrAdmin(role: string): boolean {
  return role === 'lender' || role === 'admin';
}
function canWriteForProject(role: string): boolean {
  return role === 'lender' || role === 'admin' || role === 'ipp_developer';
}
function genId(p: string) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// ─── Covenants CRUD ────────────────────────────────────────────────────────
lender.post('/covenants', async (c) => {
  const user = getCurrentUser(c);
  if (!isLenderOrAdmin(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['covenant_code', 'covenant_name', 'covenant_type', 'operator', 'measurement_frequency']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('cov');
  await c.env.DB.prepare(
    `INSERT INTO covenants
       (id, project_id, lender_participant_id, covenant_code, covenant_name, covenant_type,
        operator, threshold, threshold_upper, measurement_frequency, first_test_date,
        waivable, material_adverse_effect, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).bind(
    id, b.project_id || null, b.lender_participant_id || user.id,
    b.covenant_code, b.covenant_name, b.covenant_type, b.operator,
    b.threshold == null ? null : Number(b.threshold),
    b.threshold_upper == null ? null : Number(b.threshold_upper),
    b.measurement_frequency, b.first_test_date || null,
    b.waivable ? 1 : 0, b.material_adverse_effect ? 1 : 0,
    b.notes || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM covenants WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

lender.get('/covenants', async (c) => {
  const projectId = c.req.query('project_id');
  const rs = projectId
    ? await c.env.DB.prepare(
        `SELECT * FROM covenants WHERE project_id = ? ORDER BY covenant_code LIMIT 500`,
      ).bind(projectId).all()
    : await c.env.DB.prepare(
        `SELECT * FROM covenants ORDER BY created_at DESC LIMIT 500`,
      ).all();
  return c.json({ success: true, data: rs.results || [] });
});

lender.post('/covenants/:id/test', async (c) => {
  const user = getCurrentUser(c);
  const covenantId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.test_period || !b.test_date) {
    return c.json({ success: false, error: 'test_period and test_date are required' }, 400);
  }
  const def = await c.env.DB.prepare(
    `SELECT operator, threshold, threshold_upper FROM covenants WHERE id = ?`,
  ).bind(covenantId).first<{ operator: string; threshold: number | null; threshold_upper: number | null }>();
  if (!def) return c.json({ success: false, error: 'Covenant not found' }, 404);

  const measured = b.measured_value == null ? null : Number(b.measured_value);
  const result = evaluateCovenant(
    { operator: def.operator as 'gte' | 'lte' | 'eq' | 'gt' | 'lt' | 'between',
      threshold: def.threshold, threshold_upper: def.threshold_upper },
    measured,
  );
  const id = genId('ct');
  await c.env.DB.prepare(
    `INSERT INTO covenant_tests
       (id, covenant_id, test_period, test_date, measured_value, measured_value_text,
        result, evidence_r2_key, narrative, tested_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, covenantId, b.test_period, b.test_date, measured,
    (b.measured_value_text as string) || null, result,
    b.evidence_r2_key || null, b.narrative || null, user.id,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM covenant_tests WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

lender.get('/covenants/:id/tests', async (c) => {
  const id = c.req.param('id');
  const rs = await c.env.DB.prepare(
    `SELECT * FROM covenant_tests WHERE covenant_id = ? ORDER BY test_date DESC LIMIT 100`,
  ).bind(id).all();
  return c.json({ success: true, data: rs.results || [] });
});

lender.post('/covenants/:id/waive', async (c) => {
  const user = getCurrentUser(c);
  const covenantId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.reason || !b.requested_until) {
    return c.json({ success: false, error: 'reason and requested_until are required' }, 400);
  }
  const id = genId('wv');
  await c.env.DB.prepare(
    `INSERT INTO covenant_waivers (id, covenant_id, requested_by, reason, requested_until, status)
     VALUES (?, ?, ?, ?, ?, 'requested')`,
  ).bind(id, covenantId, user.id, b.reason, b.requested_until).run();
  const row = await c.env.DB.prepare('SELECT * FROM covenant_waivers WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

lender.post('/waivers/:id/decide', async (c) => {
  const user = getCurrentUser(c);
  if (!isLenderOrAdmin(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = b.status === 'granted' || b.status === 'rejected' ? b.status : null;
  if (!status) return c.json({ success: false, error: 'status must be granted|rejected' }, 400);
  await c.env.DB.prepare(
    `UPDATE covenant_waivers
        SET status = ?, granted_by = ?, granted_at = datetime('now'), conditions = ?
      WHERE id = ?`,
  ).bind(status, user.id, (b.conditions as string) || null, id).run();
  const row = await c.env.DB.prepare('SELECT * FROM covenant_waivers WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row });
});

// ─── IE certifications ─────────────────────────────────────────────────────
lender.post('/ie-certifications', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['cert_number', 'project_id', 'cert_type', 'cert_issue_date']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('ie');
  await c.env.DB.prepare(
    `INSERT INTO ie_certifications
       (id, disbursement_id, project_id, ie_participant_id, cert_number, cert_type, period,
        physical_progress_pct, financial_progress_pct, recommended_drawdown_zar, certified_amount_zar,
        qualifications, site_visit_date, cert_issue_date, status, document_r2_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)`,
  ).bind(
    id, b.disbursement_id || null, b.project_id, b.ie_participant_id || user.id,
    b.cert_number, b.cert_type, b.period || null,
    b.physical_progress_pct == null ? null : Number(b.physical_progress_pct),
    b.financial_progress_pct == null ? null : Number(b.financial_progress_pct),
    b.recommended_drawdown_zar == null ? null : Number(b.recommended_drawdown_zar),
    b.certified_amount_zar == null ? null : Number(b.certified_amount_zar),
    b.qualifications || null, b.site_visit_date || null, b.cert_issue_date,
    b.document_r2_key || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM ie_certifications WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

lender.post('/ie-certifications/:id/decide', async (c) => {
  const user = getCurrentUser(c);
  if (!isLenderOrAdmin(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = ['certified', 'qualified', 'rejected'].includes(String(b.status)) ? b.status : null;
  if (!status) return c.json({ success: false, error: 'status must be certified|qualified|rejected' }, 400);
  await c.env.DB.prepare(`UPDATE ie_certifications SET status = ? WHERE id = ?`).bind(status, id).run();
  const row = await c.env.DB.prepare('SELECT * FROM ie_certifications WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row });
});

lender.get('/ie-certifications', async (c) => {
  const projectId = c.req.query('project_id');
  const rs = projectId
    ? await c.env.DB.prepare(
        `SELECT * FROM ie_certifications WHERE project_id = ? ORDER BY cert_issue_date DESC LIMIT 200`,
      ).bind(projectId).all()
    : await c.env.DB.prepare(
        `SELECT * FROM ie_certifications ORDER BY created_at DESC LIMIT 200`,
      ).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Waterfall ─────────────────────────────────────────────────────────────
lender.post('/waterfalls', async (c) => {
  const user = getCurrentUser(c);
  if (!isLenderOrAdmin(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['project_id', 'waterfall_name', 'effective_from']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('wf');
  await c.env.DB.prepare(
    `INSERT INTO waterfall_structures (id, project_id, waterfall_name, effective_from, effective_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, b.project_id, b.waterfall_name, b.effective_from, b.effective_to || null, user.id).run();

  if (Array.isArray(b.tranches)) {
    for (const t of b.tranches as Array<Record<string, unknown>>) {
      if (!t.priority || !t.tranche_name || !t.tranche_type) continue;
      await c.env.DB.prepare(
        `INSERT INTO waterfall_tranches (id, waterfall_id, priority, tranche_name, tranche_type, target_account_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        genId('wft'), id, Number(t.priority), t.tranche_name, t.tranche_type,
        t.target_account_id || null, t.notes || null,
      ).run();
    }
  }
  return c.json({ success: true, data: { id } }, 201);
});

lender.post('/waterfalls/:id/run', async (c) => {
  const user = getCurrentUser(c);
  if (!isLenderOrAdmin(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const waterfallId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['project_id', 'period', 'period_start', 'period_end', 'available_cash_zar']) {
    if (!b[k] && b[k] !== 0) return c.json({ success: false, error: `${k} is required` }, 400);
  }

  // Tranche requirements come from the caller (computed from the model). We
  // expect `tranche_requirements: [{ tranche_id, required_amount_zar }]`.
  const reqs = Array.isArray(b.tranche_requirements) ? b.tranche_requirements as Array<Record<string, unknown>> : [];
  const tranchesRs = await c.env.DB.prepare(
    `SELECT id, priority FROM waterfall_tranches WHERE waterfall_id = ? ORDER BY priority`,
  ).bind(waterfallId).all<{ id: string; priority: number }>();
  const reqMap: Record<string, number> = {};
  for (const r of reqs) {
    if (r.tranche_id && r.required_amount_zar != null) {
      reqMap[String(r.tranche_id)] = Number(r.required_amount_zar);
    }
  }
  const trancheInputs = (tranchesRs.results || []).map((t) => ({
    id: t.id,
    priority: t.priority,
    required_amount_zar: reqMap[t.id] ?? 0,
  }));

  const result = runWaterfall(Number(b.available_cash_zar), trancheInputs);
  const runId = genId('wfr');
  await c.env.DB.prepare(
    `INSERT INTO waterfall_runs
       (id, project_id, waterfall_id, period, period_start, period_end,
        available_cash_zar, total_allocated_zar, surplus_after_equity_zar,
        status, executed_at, executed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'executed', datetime('now'), ?)`,
  ).bind(
    runId, b.project_id, waterfallId, b.period, b.period_start, b.period_end,
    Number(b.available_cash_zar), result.total_allocated_zar, result.surplus_after_all_tranches_zar,
    user.id,
  ).run();

  for (const a of result.allocations) {
    await c.env.DB.prepare(
      `INSERT INTO waterfall_allocations (id, run_id, tranche_id, amount_allocated_zar, shortfall_zar)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(genId('wfa'), runId, a.tranche_id, a.allocated_zar, a.shortfall_zar).run();
  }

  return c.json({ success: true, data: { run_id: runId, ...result } });
});

// ─── Reserve accounts ──────────────────────────────────────────────────────
lender.post('/reserves', async (c) => {
  const user = getCurrentUser(c);
  if (!canWriteForProject(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['project_id', 'reserve_type', 'target_amount_zar']) {
    if (!b[k] && b[k] !== 0) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('rsv');
  await c.env.DB.prepare(
    `INSERT INTO reserve_accounts
       (id, project_id, reserve_type, target_amount_zar, target_basis, current_balance_zar, custodian, account_number)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, 0), ?, ?)`,
  ).bind(
    id, b.project_id, b.reserve_type, Number(b.target_amount_zar),
    b.target_basis || null,
    b.current_balance_zar == null ? null : Number(b.current_balance_zar),
    b.custodian || null, b.account_number || null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM reserve_accounts WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

lender.post('/reserves/:id/movement', async (c) => {
  const user = getCurrentUser(c);
  if (!canWriteForProject(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const reserveId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.movement_type || b.amount_zar == null) {
    return c.json({ success: false, error: 'movement_type and amount_zar are required' }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO reserve_movements (id, reserve_id, movement_type, amount_zar, waterfall_run_id, reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    genId('rmv'), reserveId, b.movement_type, Number(b.amount_zar),
    b.waterfall_run_id || null, b.reason || null, user.id,
  ).run();
  // Deposits (top_up/interest/transfer_in) add, draws/releases/transfer_out subtract.
  const mt = String(b.movement_type);
  const delta = ['top_up', 'interest', 'transfer_in'].includes(mt) ? Number(b.amount_zar) : -Number(b.amount_zar);
  await c.env.DB.prepare(
    `UPDATE reserve_accounts SET current_balance_zar = current_balance_zar + ? WHERE id = ?`,
  ).bind(delta, reserveId).run();
  const row = await c.env.DB.prepare('SELECT * FROM reserve_accounts WHERE id = ?').bind(reserveId).first();
  return c.json({ success: true, data: row });
});

lender.get('/reserves', async (c) => {
  const projectId = c.req.query('project_id');
  const rs = projectId
    ? await c.env.DB.prepare(`SELECT * FROM reserve_accounts WHERE project_id = ?`).bind(projectId).all()
    : await c.env.DB.prepare(`SELECT * FROM reserve_accounts LIMIT 500`).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Stress scenarios ──────────────────────────────────────────────────────
lender.get('/stress/scenarios', async (c) => {
  const rs = await c.env.DB.prepare(`SELECT * FROM stress_scenarios ORDER BY scenario_name`).all();
  return c.json({ success: true, data: rs.results || [] });
});

lender.post('/stress/scenarios', async (c) => {
  const user = getCurrentUser(c);
  if (!isLenderOrAdmin(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.scenario_name) return c.json({ success: false, error: 'scenario_name required' }, 400);
  const id = genId('ss');
  await c.env.DB.prepare(
    `INSERT INTO stress_scenarios (id, scenario_name, description, parameters_json, created_by)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(
    id, b.scenario_name, b.description || null,
    typeof b.parameters === 'object' ? JSON.stringify(b.parameters) : null,
    user.id,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM stress_scenarios WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

lender.post('/stress/run', async (c) => {
  const user = getCurrentUser(c);
  if (!isLenderOrAdmin(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['scenario_id', 'project_id']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  // Pull base financials. If caller didn't supply base_* we compute DSCR from
  // project_generation + project_financials (approximate).
  const proj = await c.env.DB.prepare(
    `SELECT f.equity_percentage, f.debt_amount, f.interest_rate, f.tenor_years,
            f.dsra_percentage, f.projected_irr, f.debt_service_coverage_ratio
       FROM project_financials f WHERE f.project_id = ?`,
  ).bind(b.project_id).first<{ debt_service_coverage_ratio: number | null; projected_irr: number | null; debt_amount: number | null; interest_rate: number | null }>();

  const scenario = await c.env.DB.prepare(
    `SELECT parameters_json FROM stress_scenarios WHERE id = ?`,
  ).bind(b.scenario_id).first<{ parameters_json: string | null }>();
  let params: Record<string, number> = {};
  try { params = scenario?.parameters_json ? JSON.parse(scenario.parameters_json) : {}; } catch { /* */ }

  const baseDscr = proj?.debt_service_coverage_ratio ?? 1.3;
  const baseIrr = proj?.projected_irr ?? 0.12;
  // Apply shocks: tariff ↓ = DSCR ↓ proportional; availability ↓ = DSCR ↓
  // Simple linear model suitable for a first-cut stress. A full Monte Carlo
  // lives outside this endpoint.
  const tariffDelta = Number(params.tariff_delta_pct || 0) / 100;
  const availDelta  = Number(params.availability_delta_pct || 0) / 100;
  const fxDelta     = Number(params.fx_delta_pct || 0) / 100;
  const revenueMultiplier = (1 + tariffDelta) * (1 + availDelta);
  const stressedDscr = baseDscr * revenueMultiplier;
  const stressedIrr = baseIrr + (tariffDelta + availDelta) * 0.8 - Math.abs(fxDelta) * 0.4;

  const id = genId('sr');
  await c.env.DB.prepare(
    `INSERT INTO stress_results
       (id, scenario_id, project_id, period, base_dscr, stressed_dscr, base_llcr, stressed_llcr,
        base_equity_irr, stressed_equity_irr, notes, run_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, b.scenario_id, b.project_id, (b.period as string) || null,
    baseDscr, stressedDscr, null, null,
    baseIrr, stressedIrr, (b.notes as string) || null, user.id,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM stress_results WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row });
});

lender.get('/stress/results/:project_id', async (c) => {
  const pid = c.req.param('project_id');
  const rs = await c.env.DB.prepare(
    `SELECT sr.*, s.scenario_name
       FROM stress_results sr JOIN stress_scenarios s ON s.id = sr.scenario_id
      WHERE sr.project_id = ? ORDER BY sr.run_at DESC LIMIT 100`,
  ).bind(pid).all();
  return c.json({ success: true, data: rs.results || [] });
});

// Expose the pure calculators for downstream modules.
export { dscr, llcr };

export default lender;
