// W231: Lender Construction-Period Monthly IE Cost-to-Complete Report
// LMA project finance + SARB Directive 7/2018 + Equator Principles IV
// Route: /api/lender/construction-cost-report

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { logger } from '../utils/logger';
import {
  CCR_HARD_TERMINALS,
  CCR_VALID_TRANSITIONS,
  CCR_STATE_TRANSITIONS,
  CCR_LENDER_ONLY_ACTIONS,
  crossesCcrIntoRegulator,
  ccrSlaBreachCrossesIntoRegulator,
  deriveBudgetTier,
  slaDeadlineFor,
  cureDeadlineFor,
  type CcrStatus,
  type CcrAction,
  type BudgetTier,
} from '../utils/construction-cost-report-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = new Set(['admin', 'lender', 'ipp_developer']);
const ADMIN_LENDER_ROLES = new Set(['admin', 'lender']);

interface CcrRow {
  id: string;
  project_id: string;
  lender_id: string;
  ipp_id: string;
  report_month: string;
  budget_tier: BudgetTier;
  total_project_budget_zar: number | null;
  actual_spend_to_date_zar: number | null;
  cost_to_complete_estimate_zar: number | null;
  projected_final_cost_zar: number | null;
  contingency_budget_zar: number | null;
  contingency_spent_zar: number | null;
  physical_completion_percentage: number | null;
  scheduled_completion_date: string | null;
  revised_completion_date: string | null;
  ie_name: string | null;
  ie_certification_ref: string | null;
  ie_certified_at: string | null;
  overrun_zar: number | null;
  overrun_percentage: number | null;
  equity_injection_required_zar: number | null;
  standby_facility_amount_zar: number | null;
  chain_status: CcrStatus;
  sla_deadline: string | null;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

function decorate(row: CcrRow, now: string) {
  const overdue =
    !CCR_HARD_TERMINALS.has(row.chain_status) &&
    row.sla_deadline &&
    row.sla_deadline < now;
  return { ...row, overdue: !!overdue };
}

// GET /api/lender/construction-cost-report
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const { status, tier, month, breached, per_page = '50', offset = '0' } =
    c.req.query() as Record<string, string>;

  const now = new Date().toISOString();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (user.role === 'lender') {
    conditions.push('lender_id = ?');
    params.push(user.id);
  } else if (user.role === 'ipp_developer') {
    conditions.push('ipp_id = ?');
    params.push(user.id);
  }

  if (status) { conditions.push('chain_status = ?'); params.push(status); }
  if (tier) { conditions.push('budget_tier = ?'); params.push(tier); }
  if (month) { conditions.push('report_month = ?'); params.push(month); }
  if (breached === '1') { conditions.push('sla_breached = 1'); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Number(per_page) || 50, 200);
  const off = Number(offset) || 0;

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM oe_construction_cost_reports ${where} ORDER BY report_month DESC, created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, limit, off).all<CcrRow>();

  const rows = (results ?? []).map((r) => decorate(r, now));

  const statsRes = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN chain_status = 'budget_compliant' THEN 1 ELSE 0 END) AS compliant,
       SUM(CASE WHEN chain_status IN ('cost_overrun_risk','equity_injection_required','standby_drawdown') THEN 1 ELSE 0 END) AS at_risk,
       SUM(CASE WHEN chain_status = 'default_triggered' THEN 1 ELSE 0 END) AS defaulted,
       SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) AS sla_breached_count
     FROM oe_construction_cost_reports ${where}`
  ).bind(...params).first<{ total: number; compliant: number; at_risk: number; defaulted: number; sla_breached_count: number }>();

  return c.json({ data: { reports: rows, stats: statsRes ?? {} } });
});

// GET /api/lender/construction-cost-report/:id
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_construction_cost_reports WHERE id = ?'
  ).bind(c.req.param('id')).first<CcrRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  if (user.role === 'lender' && row.lender_id !== user.id)
    return c.json({ error: 'Forbidden' }, 403);
  if (user.role === 'ipp_developer' && row.ipp_id !== user.id)
    return c.json({ error: 'Forbidden' }, 403);

  return c.json({ data: decorate(row, new Date().toISOString()) });
});

// POST /api/lender/construction-cost-report (open a new monthly monitoring period)
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (!ADMIN_LENDER_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    project_id: string;
    lender_id?: string;
    ipp_id: string;
    report_month: string;
    total_project_budget_zar?: number;
    reason?: string;
  }>();

  if (!body.project_id || !body.ipp_id || !body.report_month)
    return c.json({ error: 'project_id, ipp_id, report_month required' }, 400);

  const budget = body.total_project_budget_zar ?? 0;
  const tier = deriveBudgetTier(budget);
  const id = `ccr_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const deadline = slaDeadlineFor(now, tier);

  // Duplicate check: same project + month
  const existing = await c.env.DB.prepare(
    'SELECT id FROM oe_construction_cost_reports WHERE project_id = ? AND report_month = ?'
  ).bind(body.project_id, body.report_month).first();
  if (existing) return c.json({ error: 'Monitoring period already open for this project/month' }, 409);

  await c.env.DB.prepare(`
    INSERT INTO oe_construction_cost_reports
      (id, project_id, lender_id, ipp_id, report_month, budget_tier,
       total_project_budget_zar, sla_deadline, actor_id, reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.project_id, body.lender_id ?? user.id, body.ipp_id,
    body.report_month, tier, budget || null, deadline,
    user.id, body.reason ?? null, now, now
  ).run();

  await fireCascade({
    event: 'ccr_evt_opened',
    actor_id: user.id,
    entity_type: 'construction_cost_report',
    entity_id: id,
    data: { tier, report_month: body.report_month },
    env: c.env,
  });

  logger.info('ccr_opened', { id, tier, report_month: body.report_month });
  return c.json({ data: { id } }, 201);
});

// POST /api/lender/construction-cost-report/:id/action
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_construction_cost_reports WHERE id = ?'
  ).bind(c.req.param('id')).first<CcrRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  if (user.role === 'lender' && row.lender_id !== user.id)
    return c.json({ error: 'Forbidden' }, 403);
  if (user.role === 'ipp_developer' && row.ipp_id !== user.id)
    return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    action: CcrAction;
    actual_spend_to_date_zar?: number;
    cost_to_complete_estimate_zar?: number;
    contingency_budget_zar?: number;
    contingency_spent_zar?: number;
    physical_completion_percentage?: number;
    revised_completion_date?: string;
    ie_name?: string;
    ie_certification_ref?: string;
    overrun_zar?: number;
    overrun_percentage?: number;
    equity_injection_required_zar?: number;
    standby_facility_amount_zar?: number;
    reason?: string;
  }>();

  const { action } = body;

  if (CCR_HARD_TERMINALS.has(row.chain_status))
    return c.json({ error: `Status ${row.chain_status} is terminal` }, 422);

  const valid = CCR_VALID_TRANSITIONS[row.chain_status] ?? [];
  if (!valid.includes(action))
    return c.json({ error: `Action ${action} not valid in status ${row.chain_status}` }, 422);

  // Enforce lender-only actions
  if (CCR_LENDER_ONLY_ACTIONS.has(action) && !ADMIN_LENDER_ROLES.has(user.role))
    return c.json({ error: `Action ${action} requires lender role` }, 403);

  const nextStatus = resolveNextStatus(action, row.chain_status as CcrStatus, CCR_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  const tier = row.budget_tier;

  // Compute projected final cost
  const projFinal =
    body.actual_spend_to_date_zar != null && body.cost_to_complete_estimate_zar != null
      ? body.actual_spend_to_date_zar + body.cost_to_complete_estimate_zar
      : row.projected_final_cost_zar;

  // Set SLA deadline on transitions that start a cure window
  let newDeadline = row.sla_deadline;
  if (nextStatus === 'equity_injection_required' || nextStatus === 'standby_drawdown') {
    newDeadline = cureDeadlineFor(now, tier);
  }

  const notifyRegulator = crossesCcrIntoRegulator(action, tier);

  await c.env.DB.prepare(`
    UPDATE oe_construction_cost_reports SET
      chain_status = ?,
      actual_spend_to_date_zar = COALESCE(?, actual_spend_to_date_zar),
      cost_to_complete_estimate_zar = COALESCE(?, cost_to_complete_estimate_zar),
      projected_final_cost_zar = COALESCE(?, projected_final_cost_zar),
      contingency_budget_zar = COALESCE(?, contingency_budget_zar),
      contingency_spent_zar = COALESCE(?, contingency_spent_zar),
      physical_completion_percentage = COALESCE(?, physical_completion_percentage),
      revised_completion_date = COALESCE(?, revised_completion_date),
      ie_name = COALESCE(?, ie_name),
      ie_certification_ref = COALESCE(?, ie_certification_ref),
      ie_certified_at = CASE WHEN ? = 'certify_report' THEN ? ELSE ie_certified_at END,
      overrun_zar = COALESCE(?, overrun_zar),
      overrun_percentage = COALESCE(?, overrun_percentage),
      equity_injection_required_zar = COALESCE(?, equity_injection_required_zar),
      standby_facility_amount_zar = COALESCE(?, standby_facility_amount_zar),
      sla_deadline = ?,
      sla_breached = CASE WHEN ? = 'sla_breach' THEN 1 ELSE sla_breached END,
      regulator_notified = CASE WHEN ? THEN 1 ELSE regulator_notified END,
      actor_id = ?,
      reason = COALESCE(?, reason),
      updated_at = ?
    WHERE id = ?
  `).bind(
    nextStatus,
    body.actual_spend_to_date_zar ?? null,
    body.cost_to_complete_estimate_zar ?? null,
    projFinal,
    body.contingency_budget_zar ?? null,
    body.contingency_spent_zar ?? null,
    body.physical_completion_percentage ?? null,
    body.revised_completion_date ?? null,
    body.ie_name ?? null,
    body.ie_certification_ref ?? null,
    action, action === 'certify_report' ? now : null,
    body.overrun_zar ?? null,
    body.overrun_percentage ?? null,
    body.equity_injection_required_zar ?? null,
    body.standby_facility_amount_zar ?? null,
    newDeadline,
    action,
    notifyRegulator ? 1 : 0,
    user.id,
    body.reason ?? null,
    now,
    row.id,
  ).run();

  const eventKey = `ccr_evt_${action}` as const;
  await fireCascade({
    event: eventKey,
    actor_id: user.id,
    entity_type: 'construction_cost_report',
    entity_id: row.id,
    data: { from: row.chain_status, to: nextStatus, tier, regulator_notified: notifyRegulator },
    env: c.env,
  });

  logger.info('ccr_action', { id: row.id, action, from: row.chain_status, to: nextStatus });
  return c.json({ data: { id: row.id, status: nextStatus } });
});

// SLA sweep — scans open states past deadline; cure states past cure window → trigger_default
export async function constructionCostReportSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();

  // Early states: sla_breach → cost_overrun_risk
  const earlyStates = [
    'monitoring_period_open', 'report_requested', 'report_submitted',
    'ie_review', 'ie_certified',
  ];
  const placeholders = earlyStates.map(() => '?').join(',');
  const { results: earlyOverdue } = await env.DB.prepare(
    `SELECT id, budget_tier FROM oe_construction_cost_reports
     WHERE chain_status IN (${placeholders}) AND sla_deadline < ? AND sla_breached = 0`
  ).bind(...earlyStates, now).all<{ id: string; budget_tier: BudgetTier }>();

  for (const row of earlyOverdue ?? []) {
    const notifyReg = ccrSlaBreachCrossesIntoRegulator(row.budget_tier);
    await env.DB.prepare(`
      UPDATE oe_construction_cost_reports SET
        chain_status = 'cost_overrun_risk', sla_breached = 1,
        regulator_notified = CASE WHEN ? THEN 1 ELSE regulator_notified END,
        updated_at = ?
      WHERE id = ?
    `).bind(notifyReg ? 1 : 0, now, row.id).run();

    await fireCascade({
      event: 'ccr_evt_sla_breach',
      actor_id: 'system',
      entity_type: 'construction_cost_report',
      entity_id: row.id,
      data: { tier: row.budget_tier, regulator_notified: notifyReg },
      env,
    });
  }

  // Cure states past cure deadline → trigger_default
  const cureStates = ['equity_injection_required', 'standby_drawdown'];
  const curePlaceholders = cureStates.map(() => '?').join(',');
  const { results: cureOverdue } = await env.DB.prepare(
    `SELECT id, budget_tier FROM oe_construction_cost_reports
     WHERE chain_status IN (${curePlaceholders}) AND sla_deadline < ?`
  ).bind(...cureStates, now).all<{ id: string; budget_tier: BudgetTier }>();

  for (const row of cureOverdue ?? []) {
    await env.DB.prepare(`
      UPDATE oe_construction_cost_reports SET
        chain_status = 'default_triggered', sla_breached = 1,
        regulator_notified = 1,
        updated_at = ?
      WHERE id = ?
    `).bind(now, row.id).run();

    await fireCascade({
      event: 'ccr_evt_trigger_default',
      actor_id: 'system',
      entity_type: 'construction_cost_report',
      entity_id: row.id,
      data: { tier: row.budget_tier, auto_triggered: true, regulator_notified: true },
      env,
    });
  }

  logger.info('ccr_sla_sweep', {
    early_breached: earlyOverdue?.length ?? 0,
    cure_defaulted: cureOverdue?.length ?? 0,
  });
}

export default app;
