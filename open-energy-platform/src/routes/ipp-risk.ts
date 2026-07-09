// Wave 133 - IPP Risk Register & Treatment Chain
// PMBOK 7 + ISO 31000 + IEC 31010 risk management with P6 state machine.
// INVERTED SLA polarity: catastrophic 2160h (most) → low_impact 168h.
// SIGNATURE: escalate_risk EVERY tier when safety AND (critical|catastrophic).

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isHardTerminal,
  slaHoursFor,
  slaDeadlineFor,
  slaHoursRemaining,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  eventTypeFor,
  statusTsCol,
  timeInStateHours,
  urgencyBand,
  deriveTierFromScore,
  type RiskStatus,
  type RiskAction,
  type RiskTier,
  type RiskCrossArgs,
} from '../utils/ipp-risk-spec';
import { badEnum } from '../utils/validation';

// Migration 356 CHECKs — reject before D1 500s.
const RISK_CATEGORIES = ['construction', 'technical', 'financial', 'regulatory', 'environmental', 'safety', 'geopolitical', 'commercial', 'force_majeure', 'legal'];
const RISK_TIERS = ['low_impact', 'medium_impact', 'high_impact', 'critical_impact', 'catastrophic'];

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

interface RiskRow {
  id: string;
  project_id: string;
  project_name: string | null;
  title: string;
  description: string | null;
  risk_category: string;
  risk_tier: RiskTier;
  chain_status: RiskStatus;
  probability_score: number | null;
  impact_score: number | null;
  risk_score: number | null;
  residual_probability_score: number | null;
  residual_impact_score: number | null;
  residual_risk_score: number | null;
  response_strategy: string | null;
  response_plan: string | null;
  contingency_reserve_zar: number | null;
  risk_trigger_description: string | null;
  treatment_outcome: string | null;
  lessons_learned: string | null;
  evidence_ref: string | null;
  risk_owner: string | null;
  assigned_to: string | null;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  is_safety: number;
  is_regulatory: number;
  is_nersa_notifiable: number;
  floor_board_notify: number;
  floor_ep4_action_required: number;
  floor_lender_notifiable: number;
  floor_nersa_notifiable: number;
  floor_insurance_applicable: number;
  issue_ref: string | null;
  stage_gate_ref: string | null;
  procurement_ref: string | null;
  hse_incident_ref: string | null;
  w118_block_ref: string | null;
  bridges_to_issue_live: number;
  bridges_to_sg_live: number;
  bridges_to_w118_live: number;
  is_reportable: number;
  regulator_relevant: number;
  regulator_ref: string | null;
  regulator_crossed_at: string | null;
  identified_at: string | null;
  assessed_at: string | null;
  quantified_at: string | null;
  response_planned_at: string | null;
  owner_assigned_at: string | null;
  monitoring_at: string | null;
  triggered_at: string | null;
  responding_at: string | null;
  outcome_recorded_at: string | null;
  closed_at: string | null;
  archived_at: string | null;
  escalated_at: string | null;
  deferred_at: string | null;
  cancelled_at: string | null;
  overdue_flagged_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function decorateLiveFields(row: RiskRow, now: Date) {
  const stateAt = (row as any)[statusTsCol(row.chain_status)] as string | null;
  return {
    ...row,
    time_in_state_hours_live: timeInStateHours(stateAt, now),
    sla_remaining_hours_live: slaHoursRemaining(row.sla_deadline_at, now),
    urgency_band_live: urgencyBand(row.risk_tier),
    is_safety_or_regulatory_live: !!(row.is_safety || row.is_regulatory),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET /api/ipp-risk ────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_risks ORDER BY risk_score DESC, created_at DESC'
  ).all<RiskRow>();

  const now = new Date();
  const data = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  const active = data.filter(r => !isHardTerminal(r.chain_status));
  const dashboard = {
    risks: {
      active_count:       active.length,
      triggered_count:    active.filter(r => r.chain_status === 'triggered' || r.chain_status === 'responding').length,
      critical_count:     active.filter(r => r.risk_tier === 'critical_impact' || r.risk_tier === 'catastrophic').length,
      sla_breached_count: data.filter(r => r.sla_breached).length,
      safety_open:        active.filter(r => r.is_safety).length,
      escalated_count:    active.filter(r => r.chain_status === 'escalated').length,
      total_count:        data.length,
      heat_map: {
        p5_i5: data.filter(r => r.probability_score === 5 && r.impact_score === 5).length,
        high_zone: data.filter(r => (r.risk_score ?? 0) >= 9).length,
      },
    },
  };

  return c.json({ data, dashboard });
});

// ─── GET /api/ipp-risk/:id ────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_risks WHERE id = ?'
  ).bind(c.req.param('id')).first<RiskRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const events = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_risk_events WHERE risk_id = ? ORDER BY created_at ASC'
  ).bind(row.id).all();

  return c.json({ data: { risk: decorateLiveFields(row, new Date()), events: events.results ?? [] } });
});

// ─── POST /api/ipp-risk ───────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    project_id?: string;
    project_name?: string;
    title?: string;
    description?: string;
    risk_category?: string;
    risk_tier?: RiskTier;
    probability_score?: number;
    impact_score?: number;
    response_strategy?: string;
    response_plan?: string;
    contingency_reserve_zar?: number;
    risk_owner?: string;
    is_safety?: number;
    is_regulatory?: number;
    is_nersa_notifiable?: number;
    floor_board_notify?: number;
    floor_ep4_action_required?: number;
    floor_lender_notifiable?: number;
    floor_nersa_notifiable?: number;
    floor_insurance_applicable?: number;
    stage_gate_ref?: string;
    issue_ref?: string;
    hse_incident_ref?: string;
    [k: string]: unknown;
  };

  if (!body.project_id || !body.title) {
    return c.json({ error: 'project_id and title required' }, 400);
  }

  const enumErr =
    badEnum('risk_category', body.risk_category, RISK_CATEGORIES) ??
    badEnum('risk_tier', body.risk_tier, RISK_TIERS);
  if (enumErr) return c.json({ error: enumErr }, 400);

  const probScore = body.probability_score ?? null;
  const impScore = body.impact_score ?? null;
  const riskScore = probScore && impScore ? probScore * impScore : null;
  const tier: RiskTier = body.risk_tier ?? (riskScore ? deriveTierFromScore(riskScore) : 'medium_impact');
  const isSafety = Number(body.is_safety ?? (body.risk_category === 'safety' ? 1 : 0));
  const isRegulatory = Number(body.is_regulatory ?? (body.risk_category === 'regulatory' ? 1 : 0));

  const now = new Date();
  const slaHrs = slaHoursFor(tier);
  const slaDeadline = slaDeadlineFor(tier, now);
  const id = `rsk-${Date.now().toString(36)}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_risks (
      id, project_id, project_name, title, description, risk_category, risk_tier,
      chain_status, probability_score, impact_score, risk_score,
      response_strategy, response_plan, contingency_reserve_zar,
      risk_owner, assigned_to,
      is_safety, is_regulatory, is_nersa_notifiable,
      floor_board_notify, floor_ep4_action_required,
      floor_lender_notifiable, floor_nersa_notifiable, floor_insurance_applicable,
      stage_gate_ref, issue_ref, hse_incident_ref,
      bridges_to_sg_live, bridges_to_issue_live,
      sla_target_hours, sla_deadline_at, sla_breached,
      is_reportable, regulator_relevant,
      identified_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      'identified', ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, 0,
      0, 0,
      ?, ?, ?, ?
    )
  `).bind(
    id, body.project_id, body.project_name ?? null, body.title, body.description ?? null,
    body.risk_category ?? 'technical', tier,
    probScore, impScore, riskScore,
    body.response_strategy ?? null, body.response_plan ?? null, body.contingency_reserve_zar ?? null,
    body.risk_owner ?? user.id, null,
    isSafety, isRegulatory, Number(body.is_nersa_notifiable ?? 0),
    Number(body.floor_board_notify ?? 0), Number(body.floor_ep4_action_required ?? 0),
    Number(body.floor_lender_notifiable ?? 0), Number(body.floor_nersa_notifiable ?? 0), Number(body.floor_insurance_applicable ?? 0),
    body.stage_gate_ref ?? null, body.issue_ref ?? null, body.hse_incident_ref ?? null,
    body.stage_gate_ref ? 1 : 0, body.issue_ref ? 1 : 0,
    slaHrs, slaDeadline.toISOString(),
    now.toISOString(), user.id, now.toISOString(), now.toISOString(),
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_risks WHERE id = ?'
  ).bind(id).first<RiskRow>();

  await fireCascade({
    event: 'ipp_risk.identified',
    actor_id: user.id,
    entity_type: 'ipp_risk',
    entity_id: id,
    data: { action: 'identify_risk', risk_tier: tier, risk_category: body.risk_category ?? 'technical', risk_score: riskScore },
    env: c.env,
  });

  return c.json({ data: decorateLiveFields(created!, new Date()) }, 201);
});

// ─── POST /api/ipp-risk/:id/:action ──────────────────────────────────────
app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    probability_score?: number;
    impact_score?: number;
    residual_probability_score?: number;
    residual_impact_score?: number;
    response_strategy?: string;
    response_plan?: string;
    contingency_reserve_zar?: number;
    risk_trigger_description?: string;
    treatment_outcome?: string;
    lessons_learned?: string;
    evidence_ref?: string;
    assigned_to?: string;
    risk_owner?: string;
    reason_code?: string;
    w118_block_ref?: string;
    issue_ref?: string;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_risks WHERE id = ?'
  ).bind(id).first<RiskRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `Risk is in terminal state: ${row.chain_status}` }, 409);
  }

  const riskAction = action as RiskAction;
  const toStatus = nextStatus(row.chain_status, riskAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();

  // Recompute risk score if scores provided
  let riskScore = row.risk_score;
  if (body.probability_score && body.impact_score) {
    riskScore = body.probability_score * body.impact_score;
  }
  let residualScore = row.residual_risk_score;
  if (body.residual_probability_score && body.residual_impact_score) {
    residualScore = body.residual_probability_score * body.residual_impact_score;
  }

  const crossArgs: RiskCrossArgs = {
    risk_tier: row.risk_tier,
    risk_category: row.risk_category,
    is_safety: row.is_safety,
    is_regulatory: row.is_regulatory,
    is_nersa_notifiable: row.is_nersa_notifiable ?? row.floor_nersa_notifiable,
  };

  const regulatorCrossed = crossesIntoRegulator(riskAction, crossArgs);
  const isRep = isReportable(riskAction, crossArgs);

  const updates: string[] = ['chain_status = ?', 'updated_at = ?'];
  const vals: unknown[] = [toStatus, now.toISOString()];

  if (toStatus !== row.chain_status) {
    updates.push(`${statusTsCol(toStatus)} = ?`);
    vals.push(now.toISOString());
  }

  if (riskScore !== row.risk_score && riskScore !== null) {
    updates.push('risk_score = ?');
    vals.push(riskScore);
    if (body.probability_score) { updates.push('probability_score = ?'); vals.push(body.probability_score); }
    if (body.impact_score) { updates.push('impact_score = ?'); vals.push(body.impact_score); }
  }
  if (residualScore !== null && residualScore !== row.residual_risk_score) {
    updates.push('residual_risk_score = ?');
    vals.push(residualScore);
    if (body.residual_probability_score) { updates.push('residual_probability_score = ?'); vals.push(body.residual_probability_score); }
    if (body.residual_impact_score) { updates.push('residual_impact_score = ?'); vals.push(body.residual_impact_score); }
  }

  if (regulatorCrossed || isRep) {
    updates.push('is_reportable = 1', 'regulator_relevant = 1', 'regulator_crossed_at = ?');
    vals.push(now.toISOString());
    if (!row.regulator_ref) {
      const ref = `W133-RSK-${row.risk_category.toUpperCase()}-${now.getFullYear()}-${id.replace('rsk-', '').toUpperCase()}`;
      updates.push('regulator_ref = ?');
      vals.push(ref);
    }
  }

  if (body.response_strategy) { updates.push('response_strategy = ?'); vals.push(body.response_strategy); }
  if (body.response_plan)     { updates.push('response_plan = ?');     vals.push(body.response_plan); }
  if (body.risk_trigger_description) { updates.push('risk_trigger_description = ?'); vals.push(body.risk_trigger_description); }
  if (body.treatment_outcome) { updates.push('treatment_outcome = ?'); vals.push(body.treatment_outcome); }
  if (body.lessons_learned)   { updates.push('lessons_learned = ?');   vals.push(body.lessons_learned); }
  if (body.evidence_ref)      { updates.push('evidence_ref = ?');      vals.push(body.evidence_ref); }
  if (body.assigned_to)       { updates.push('assigned_to = ?');       vals.push(body.assigned_to); }
  if (body.risk_owner)        { updates.push('risk_owner = ?');        vals.push(body.risk_owner); }
  if (body.w118_block_ref) {
    updates.push('w118_block_ref = ?', 'bridges_to_w118_live = 1');
    vals.push(body.w118_block_ref);
  }
  if (body.issue_ref) {
    updates.push('issue_ref = ?', 'bridges_to_issue_live = 1');
    vals.push(body.issue_ref);
  }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ipp_risks SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...vals).run();

  const eventId = `revt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventTypeFor(riskAction);
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_risk_events
      (id, risk_id, event_type, actor_id, from_status, to_status, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, id, eventType, user.id,
    row.chain_status, toStatus,
    JSON.stringify({ action: riskAction, risk_tier: row.risk_tier, risk_category: row.risk_category, regulator_crossed: regulatorCrossed, ...(body.reason_code ? { reason_code: body.reason_code } : {}) }),
    now.toISOString(),
  ).run();

  await fireCascade({
    event: eventType,
    actor_id: user.id,
    entity_type: 'ipp_risk',
    entity_id: id,
    data: {
      action: riskAction,
      from_status: row.chain_status,
      to_status: toStatus,
      risk_tier: row.risk_tier,
      risk_category: row.risk_category,
      regulator_crossed: regulatorCrossed,
      ...(body.reason_code ? { reason_code: body.reason_code } : {}),
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_risks WHERE id = ?'
  ).bind(id).first<RiskRow>();

  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron: SLA sweep (runs in */15 shared slot) ───────────────────────────
export async function ippRiskSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date();
  const openRows = await env.DB.prepare(`
    SELECT * FROM oe_ipp_risks
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND chain_status NOT IN ('archived','cancelled','closed')
  `).all<RiskRow>();

  let swept = 0;
  let crossed = 0;

  for (const row of (openRows.results ?? [])) {
    if (!row.sla_deadline_at) continue;
    if (new Date(row.sla_deadline_at) <= now) {
      swept++;
      const crossArgs: RiskCrossArgs = {
        risk_tier: row.risk_tier,
        risk_category: row.risk_category,
        is_safety: row.is_safety,
        is_regulatory: row.is_regulatory,
      };
      const reg = slaBreachCrossesIntoRegulator(row.risk_tier, crossArgs);
      if (reg) crossed++;

      await env.DB.prepare(`
        UPDATE oe_ipp_risks
        SET sla_breached = 1,
            last_sla_breach_at = ?,
            escalation_level = escalation_level + 1,
            ${reg ? 'regulator_relevant = 1,' : ''}
            updated_at = ?
        WHERE id = ?
      `).bind(now.toISOString(), now.toISOString(), row.id).run();

      await fireCascade({
        event: 'ipp_risk.sla_breached',
        actor_id: 'cron',
        entity_type: 'ipp_risk',
        entity_id: row.id,
        data: { risk_tier: row.risk_tier, risk_category: row.risk_category, regulator_crossed: reg },
        env,
      });
    }
  }
  return { swept, crossed };
}
