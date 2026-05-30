// ═══════════════════════════════════════════════════════════════════════════
// Wave 92 — IPP Project Risk Register & Quantitative SRA (Monte-Carlo).
//
// Mounted at /api/ipp/project-risk/chain.
//
// The PROJECT-RISK-MANAGEMENT core of a best-in-class projects system. W1 gave
// the schedule baseline (CPM/Gantt); W19/W20 procurement + construction-to-COD;
// W81 change-control + EVM. W92 is the missing quantitative-risk layer.
//
// DISTINCTIVE move (beat Acumen Fuse Risk / Primavera Risk Analysis (PRA) /
// Safran Risk / @Risk / Crystal Ball / Deltek Acumen Risk / Riskonnect /
// Predict! / Synergi Life / Active Risk Manager): every record is LIVE-scored
// against a P50/P80 triangular Monte-Carlo battery, residual EMV after planned
// response, contingency drawdown vs project_reserve, and REIPPPP bid-envelope
// breach %. Best-in-class platforms treat risk registers as static spreadsheets
// disconnected from EVM and from the REIPPPP bid envelope; W92 does not.
//
// Write model — SINGLE-PARTY {admin, ipp, ipp_developer, wind} (same persona
// set as W20 COD / W81 change-order). READ all nine personas. actor_party
// (project_manager / risk_owner / project_controls / sponsor) records the
// functional owner per step, NOT an access-control split.
//
// Reportability — the W92 SIGNATURE is REALIZATION-driven:
//   realize_risk + risk_class IN (force_majeure, regulatory_change) crosses
//                regulator EVERY tier — the W92 SIGNATURE hard line.
//   realize_risk other classes — high+critical.
//   escalate     — high+critical (PMO / sponsor / regulator).
//   accept_risk  — critical only (accepting critical = governance event).
//   close_risk   — critical + realized only (post-event close-out).
//   sla_breached — high+critical only.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierFromEmv,
  emvZar,
  residualEmvZar,
  p50CostZar,
  p80CostZar,
  p50ScheduleDays,
  p80ScheduleDays,
  bidEnvelopeRiskPct,
  contingencyDrawdownRatio,
  isHighTier,
  isReportable,
  isFloorAtHighClass,
  actionCrossesRegulator,
  authorityFor,
  partyForAction,
  eventTypeFor as specEventTypeFor,
  reasonCodeFor,
  urgencyBand,
  SLA_MINUTES,
  type ProjectRiskStatus,
  type ProjectRiskAction,
  type ProjectRiskTier,
  type ProjectRiskClass,
} from '../utils/project-risk-spec';

const READ_ROLES = new Set([
  'admin', 'ipp', 'ipp_developer', 'wind',
  'regulator',
  'carbon_fund', 'grid_operator', 'offtaker', 'lender', 'trader', 'support',
]);

const WRITE_ROLES = new Set(['admin', 'ipp', 'ipp_developer', 'wind']);

interface ProjectRiskRow {
  id: string;
  risk_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string | null;
  reipppp_bid_window: string | null;
  facility_id: string | null;
  facility_name: string | null;
  risk_owner_party_id: string | null;
  risk_owner_party_name: string | null;
  raised_by_party_id: string | null;
  raised_by_party_name: string | null;
  risk_class: ProjectRiskClass;
  risk_category: string | null;
  risk_title: string | null;
  risk_description: string | null;
  risk_tier: ProjectRiskTier;
  authority_required: string | null;
  probability_pct: number;
  probability_band: number | null;
  worst_case_cost_impact_zar: number;
  worst_case_schedule_impact_days: number;
  impact_band: number | null;
  cost_optimistic_zar: number | null;
  cost_most_likely_zar: number | null;
  cost_pessimistic_zar: number | null;
  schedule_optimistic_days: number | null;
  schedule_most_likely_days: number | null;
  schedule_pessimistic_days: number | null;
  emv_zar: number | null;
  residual_emv_zar: number | null;
  integrity_floor_applied_flag: number;
  response_strategy: string | null;
  response_action: string | null;
  response_effectiveness_pct: number | null;
  response_owner: string | null;
  response_due_at: string | null;
  response_complete_flag: number;
  contingency_drawn_zar: number;
  total_contingency_zar: number;
  bid_envelope_zar: number;
  realized_flag: number;
  realized_cost_zar: number | null;
  realized_schedule_days: number | null;
  realized_basis: string | null;
  assessed_flag: number;
  quantified_flag: number;
  response_planned_flag: number;
  monitoring_flag: number;
  assess_ref: string | null;
  quantify_ref: string | null;
  response_plan_ref: string | null;
  response_active_ref: string | null;
  monitor_ref: string | null;
  realize_ref: string | null;
  close_ref: string | null;
  accept_ref: string | null;
  escalate_ref: string | null;
  reanalyze_ref: string | null;
  withdraw_ref: string | null;
  regulator_ref: string | null;
  assess_basis: string | null;
  quantify_basis: string | null;
  response_plan_basis: string | null;
  response_active_basis: string | null;
  close_basis: string | null;
  escalate_basis: string | null;
  reason_code: string | null;
  response_summary: string | null;
  chain_status: ProjectRiskStatus;
  identified_at: string;
  assessed_at: string | null;
  quantified_at: string | null;
  response_planned_at: string | null;
  response_active_at: string | null;
  monitoring_at: string | null;
  realized_at: string | null;
  closed_at: string | null;
  accepted_at: string | null;
  escalated_at: string | null;
  withdrawn_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ProjectRiskEventRow {
  id: string;
  risk_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ProjectRiskStatus, keyof ProjectRiskRow | null> = {
  identified:       null,
  assessed:         'assessed_at',
  quantified:       'quantified_at',
  response_planned: 'response_planned_at',
  response_active:  'response_active_at',
  monitoring:       'monitoring_at',
  realized:         'realized_at',
  closed:           'closed_at',
  accepted:         'accepted_at',
  escalated:        'escalated_at',
  withdrawn:        'withdrawn_at',
  cancelled:        'cancelled_at',
};

function decorate(row: ProjectRiskRow, now: Date) {
  const tier = row.risk_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  // Live SRA battery — derived from the same inputs every fetch (the W92
  // distinctive layer that beats Acumen Fuse / PRA / Safran / @Risk).
  const emvLive = emvZar(row.probability_pct, row.worst_case_cost_impact_zar);
  const tierLive = tierFromEmv(emvLive, row.risk_class);
  const p50Live = (row.cost_optimistic_zar != null && row.cost_most_likely_zar != null && row.cost_pessimistic_zar != null)
    ? p50CostZar(row.cost_optimistic_zar, row.cost_most_likely_zar, row.cost_pessimistic_zar, row.probability_pct)
    : null;
  const p80Live = (row.cost_optimistic_zar != null && row.cost_most_likely_zar != null && row.cost_pessimistic_zar != null)
    ? p80CostZar(row.cost_optimistic_zar, row.cost_most_likely_zar, row.cost_pessimistic_zar, row.probability_pct)
    : null;
  const p50SchedLive = (row.schedule_optimistic_days != null && row.schedule_most_likely_days != null && row.schedule_pessimistic_days != null)
    ? p50ScheduleDays(row.schedule_optimistic_days, row.schedule_most_likely_days, row.schedule_pessimistic_days, row.probability_pct)
    : null;
  const p80SchedLive = (row.schedule_optimistic_days != null && row.schedule_most_likely_days != null && row.schedule_pessimistic_days != null)
    ? p80ScheduleDays(row.schedule_optimistic_days, row.schedule_most_likely_days, row.schedule_pessimistic_days, row.probability_pct)
    : null;
  const residualLive = row.response_effectiveness_pct != null
    ? residualEmvZar(emvLive, row.response_effectiveness_pct)
    : emvLive;
  const envelopeLive = bidEnvelopeRiskPct(row.worst_case_cost_impact_zar, row.bid_envelope_zar);
  const drawdownLive = contingencyDrawdownRatio(row.contingency_drawn_zar, row.total_contingency_zar);
  const sigClass = row.risk_class === 'force_majeure' || row.risk_class === 'regulatory_change';
  const floorApplied = isFloorAtHighClass(row.risk_class);
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0 && !isTerminal(status),
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    urgency_band: urgencyBand(status, slaIso ? new Date(slaIso) : null, now),
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: isHighTier(tier),
    high_tier_flag: isHighTier(tier),
    floor_at_high_class_flag: floorApplied,
    signature_class_flag: sigClass,
    authority_required_live: authorityFor(tier),
    emv_zar_live: emvLive,
    tier_live: tierLive,
    p50_cost_zar_live: p50Live,
    p80_cost_zar_live: p80Live,
    p50_schedule_days_live: p50SchedLive,
    p80_schedule_days_live: p80SchedLive,
    residual_emv_zar_live: residualLive,
    bid_envelope_risk_pct_live: envelopeLive,
    bid_envelope_breach_flag: envelopeLive >= 100,
    contingency_drawdown_ratio_live: drawdownLive,
    contingency_exceeded_flag: drawdownLive > 1,
    reportable_per_spec: isReportable(tier),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const risk_tier   = c.req.query('risk_tier');
  const status      = c.req.query('status');
  const risk_class  = c.req.query('risk_class');
  const project_id  = c.req.query('project_id');
  const facility_id = c.req.query('facility_id');
  const breached    = c.req.query('breached');
  const reportable  = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_project_risks WHERE 1=1';
  const binds: unknown[] = [];
  if (risk_tier)   { sql += ' AND risk_tier = ?';   binds.push(risk_tier); }
  if (status)      { sql += ' AND chain_status = ?'; binds.push(status); }
  if (risk_class)  { sql += ' AND risk_class = ?';   binds.push(risk_class); }
  if (project_id)  { sql += ' AND project_id = ?';   binds.push(project_id); }
  if (facility_id) { sql += ' AND facility_id = ?';  binds.push(facility_id); }

  sql += ' ORDER BY datetime(identified_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ProjectRiskRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  const by_project: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  for (const r of items) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + 1;
    by_tier[r.risk_tier] = (by_tier[r.risk_tier] || 0) + 1;
    by_class[r.risk_class] = (by_class[r.risk_class] || 0) + 1;
    by_project[r.project_id] = (by_project[r.project_id] || 0) + 1;
    by_urgency[r.urgency_band] = (by_urgency[r.urgency_band] || 0) + 1;
  }

  const open_count          = items.filter((i) => !i.is_terminal).length;
  const realized_count      = items.filter((i) => i.realized_flag === 1).length;
  const escalated_count     = items.filter((i) => i.chain_status === 'escalated').length;
  const accepted_count      = items.filter((i) => i.chain_status === 'accepted').length;
  const closed_count        = items.filter((i) => i.chain_status === 'closed').length;
  const withdrawn_count     = items.filter((i) => i.chain_status === 'withdrawn').length;
  const cancelled_count     = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_count      = items.filter((i) => i.sla_breached).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const signature_count     = items.filter((i) => i.signature_class_flag).length;
  const floor_applied_count = items.filter((i) => i.floor_at_high_class_flag).length;
  const envelope_breach_count   = items.filter((i) => i.bid_envelope_breach_flag).length;
  const contingency_exceeded_count = items.filter((i) => i.contingency_exceeded_flag).length;
  const total_emv_zar       = items.reduce((s, i) => s + (i.emv_zar_live || 0), 0);
  const total_residual_emv_zar = items.reduce((s, i) => s + (i.residual_emv_zar_live || 0), 0);
  const total_worst_case_zar = items.reduce((s, i) => s + (i.worst_case_cost_impact_zar || 0), 0);
  const total_realized_cost_zar = items.reduce((s, i) => s + (i.realized_cost_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_class,
      by_project,
      by_urgency,
      open_count,
      realized_count,
      escalated_count,
      accepted_count,
      closed_count,
      withdrawn_count,
      cancelled_count,
      breached: breached_count,
      reportable_total,
      signature_count,
      floor_applied_count,
      envelope_breach_count,
      contingency_exceeded_count,
      total_emv_zar,
      total_residual_emv_zar,
      total_worst_case_zar,
      total_realized_cost_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_project_risks WHERE id = ?').bind(id).first<ProjectRiskRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_project_risks_events WHERE risk_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ProjectRiskEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface AssessBody {
  assess_basis?: string;
  assess_ref?: string;
  probability_pct?: number;
  probability_band?: number;
  worst_case_cost_impact_zar?: number;
  worst_case_schedule_impact_days?: number;
  impact_band?: number;
  notes?: string;
}
interface QuantifyBody {
  quantify_basis?: string;
  quantify_ref?: string;
  cost_optimistic_zar?: number;
  cost_most_likely_zar?: number;
  cost_pessimistic_zar?: number;
  schedule_optimistic_days?: number;
  schedule_most_likely_days?: number;
  schedule_pessimistic_days?: number;
  notes?: string;
}
interface PlanResponseBody {
  response_plan_basis?: string;
  response_plan_ref?: string;
  response_strategy?: string;
  response_action?: string;
  response_effectiveness_pct?: number;
  response_owner?: string;
  response_due_at?: string;
  total_contingency_zar?: number;
  bid_envelope_zar?: number;
  notes?: string;
}
interface ExecuteResponseBody {
  response_active_basis?: string;
  response_active_ref?: string;
  contingency_drawn_zar?: number;
  notes?: string;
}
interface MonitoringBody { monitor_ref?: string; notes?: string; }
interface RealizeBody {
  realize_ref?: string;
  realized_cost_zar?: number;
  realized_schedule_days?: number;
  realized_basis?: string;
  contingency_drawn_zar?: number;
  regulator_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface CloseBody {
  close_basis?: string;
  close_ref?: string;
  reason_code?: string;
  response_summary?: string;
  notes?: string;
}
interface AcceptBody {
  accept_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}
interface EscalateBody {
  escalate_basis?: string;
  escalate_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}
interface ReanalyzeBody {
  reanalyze_ref?: string;
  cost_optimistic_zar?: number;
  cost_most_likely_zar?: number;
  cost_pessimistic_zar?: number;
  schedule_optimistic_days?: number;
  schedule_most_likely_days?: number;
  schedule_pessimistic_days?: number;
  probability_pct?: number;
  worst_case_cost_impact_zar?: number;
  notes?: string;
}
interface WithdrawBody { withdraw_ref?: string; reason_code?: string; notes?: string; }

async function transition(
  c: Context<HonoEnv>,
  action: ProjectRiskAction,
  bodyHandler?: (row: ProjectRiskRow, body: Record<string, unknown>) => Partial<ProjectRiskRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_project_risks WHERE id = ?').bind(id).first<ProjectRiskRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier is RE-DERIVED on every transition from EMV = probability_pct × |worst|
  // with floor-at-high override for force_majeure / regulatory_change /
  // strategic classes (same family as W56/W65/W73/W82/W91 INVERTED-SLA + tier-
  // re-derive, plus the W92-specific class-floor).
  const probability = (overrides.probability_pct as number | undefined) ?? row.probability_pct;
  const worstCase = (overrides.worst_case_cost_impact_zar as number | undefined) ?? row.worst_case_cost_impact_zar;
  const riskClass = (overrides.risk_class as ProjectRiskClass | undefined) ?? row.risk_class;
  const emv = emvZar(probability, worstCase);
  const tier = tierFromEmv(emv, riskClass);
  overrides.risk_tier = tier;
  overrides.emv_zar = emv;
  overrides.integrity_floor_applied_flag = isFloorAtHighClass(riskClass) && emv < 5_000_000 ? 1 : 0;
  overrides.authority_required = authorityFor(tier);

  // Residual EMV — uses the (possibly-overridden) effectiveness.
  const effectiveness = (overrides.response_effectiveness_pct as number | undefined) ?? row.response_effectiveness_pct;
  if (effectiveness != null) {
    overrides.residual_emv_zar = residualEmvZar(emv, effectiveness);
  }

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const realizedForReporting = action === 'realize_risk' || row.realized_flag === 1
    || (action === 'close_risk' && row.realized_flag === 1);
  const crosses = actionCrossesRegulator(action, tier, riskClass, realizedForReporting);
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_project_risks SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `prr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  const reasonCode = (overrides.reason_code as string | undefined) ?? reasonCodeFor(action, riskClass, tier);
  await c.env.DB.prepare(
    'INSERT INTO oe_project_risks_events (id, risk_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    specEventTypeFor(to),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action, reason_code: reasonCode }),
    nowIso,
  ).run();

  const eventName = specEventTypeFor(to) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'project_risk',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      risk_tier: tier,
      risk_class: riskClass,
      chain_status: to,
      from_status: row.chain_status,
      action,
      reason_code: reasonCode,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_project_risks WHERE id = ?').bind(id).first<ProjectRiskRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/assess', async (c) => transition(c, 'assess', (_row, body) => {
  const b = body as Partial<AssessBody>;
  const out: Partial<ProjectRiskRow> = { assessed_flag: 1 };
  if (typeof b.assess_basis === 'string') out.assess_basis = b.assess_basis;
  if (typeof b.assess_ref === 'string')   out.assess_ref = b.assess_ref;
  if (typeof b.probability_pct === 'number') out.probability_pct = b.probability_pct;
  if (typeof b.probability_band === 'number') out.probability_band = b.probability_band;
  if (typeof b.worst_case_cost_impact_zar === 'number') out.worst_case_cost_impact_zar = b.worst_case_cost_impact_zar;
  if (typeof b.worst_case_schedule_impact_days === 'number') out.worst_case_schedule_impact_days = b.worst_case_schedule_impact_days;
  if (typeof b.impact_band === 'number') out.impact_band = b.impact_band;
  return out;
}));

app.post('/:id/quantify', async (c) => transition(c, 'quantify', (_row, body) => {
  const b = body as Partial<QuantifyBody>;
  const out: Partial<ProjectRiskRow> = { quantified_flag: 1 };
  if (typeof b.quantify_basis === 'string') out.quantify_basis = b.quantify_basis;
  if (typeof b.quantify_ref === 'string')   out.quantify_ref = b.quantify_ref;
  if (typeof b.cost_optimistic_zar === 'number') out.cost_optimistic_zar = b.cost_optimistic_zar;
  if (typeof b.cost_most_likely_zar === 'number') out.cost_most_likely_zar = b.cost_most_likely_zar;
  if (typeof b.cost_pessimistic_zar === 'number') out.cost_pessimistic_zar = b.cost_pessimistic_zar;
  if (typeof b.schedule_optimistic_days === 'number') out.schedule_optimistic_days = b.schedule_optimistic_days;
  if (typeof b.schedule_most_likely_days === 'number') out.schedule_most_likely_days = b.schedule_most_likely_days;
  if (typeof b.schedule_pessimistic_days === 'number') out.schedule_pessimistic_days = b.schedule_pessimistic_days;
  return out;
}));

app.post('/:id/plan-response', async (c) => transition(c, 'plan_response', (_row, body) => {
  const b = body as Partial<PlanResponseBody>;
  const out: Partial<ProjectRiskRow> = { response_planned_flag: 1 };
  if (typeof b.response_plan_basis === 'string') out.response_plan_basis = b.response_plan_basis;
  if (typeof b.response_plan_ref === 'string')   out.response_plan_ref = b.response_plan_ref;
  if (typeof b.response_strategy === 'string')   out.response_strategy = b.response_strategy;
  if (typeof b.response_action === 'string')     out.response_action = b.response_action;
  if (typeof b.response_effectiveness_pct === 'number') out.response_effectiveness_pct = b.response_effectiveness_pct;
  if (typeof b.response_owner === 'string') out.response_owner = b.response_owner;
  if (typeof b.response_due_at === 'string') out.response_due_at = b.response_due_at;
  if (typeof b.total_contingency_zar === 'number') out.total_contingency_zar = b.total_contingency_zar;
  if (typeof b.bid_envelope_zar === 'number') out.bid_envelope_zar = b.bid_envelope_zar;
  return out;
}));

app.post('/:id/execute-response', async (c) => transition(c, 'execute_response', (_row, body) => {
  const b = body as Partial<ExecuteResponseBody>;
  const out: Partial<ProjectRiskRow> = {};
  if (typeof b.response_active_basis === 'string') out.response_active_basis = b.response_active_basis;
  if (typeof b.response_active_ref === 'string')   out.response_active_ref = b.response_active_ref;
  if (typeof b.contingency_drawn_zar === 'number') out.contingency_drawn_zar = b.contingency_drawn_zar;
  return out;
}));

app.post('/:id/begin-monitoring', async (c) => transition(c, 'begin_monitoring', (_row, body) => {
  const b = body as Partial<MonitoringBody>;
  const out: Partial<ProjectRiskRow> = { monitoring_flag: 1 };
  if (typeof b.monitor_ref === 'string') out.monitor_ref = b.monitor_ref;
  return out;
}));

app.post('/:id/realize-risk', async (c) => transition(c, 'realize_risk', (_row, body) => {
  const b = body as Partial<RealizeBody>;
  const out: Partial<ProjectRiskRow> = { realized_flag: 1 };
  if (typeof b.realize_ref === 'string') out.realize_ref = b.realize_ref;
  if (typeof b.realized_cost_zar === 'number') out.realized_cost_zar = b.realized_cost_zar;
  if (typeof b.realized_schedule_days === 'number') out.realized_schedule_days = b.realized_schedule_days;
  if (typeof b.realized_basis === 'string') out.realized_basis = b.realized_basis;
  if (typeof b.contingency_drawn_zar === 'number') out.contingency_drawn_zar = b.contingency_drawn_zar;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/close-risk', async (c) => transition(c, 'close_risk', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<ProjectRiskRow> = { response_complete_flag: 1 };
  if (typeof b.close_basis === 'string') out.close_basis = b.close_basis;
  if (typeof b.close_ref === 'string')   out.close_ref = b.close_ref;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.response_summary === 'string') out.response_summary = b.response_summary;
  return out;
}));

app.post('/:id/accept-risk', async (c) => transition(c, 'accept_risk', (_row, body) => {
  const b = body as Partial<AcceptBody>;
  const out: Partial<ProjectRiskRow> = {};
  if (typeof b.accept_ref === 'string') out.accept_ref = b.accept_ref;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/escalate', async (c) => transition(c, 'escalate', (row, body) => {
  const b = body as Partial<EscalateBody>;
  const out: Partial<ProjectRiskRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof b.escalate_basis === 'string') out.escalate_basis = b.escalate_basis;
  if (typeof b.escalate_ref === 'string')   out.escalate_ref = b.escalate_ref;
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')  out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/reanalyze', async (c) => transition(c, 'reanalyze', (_row, body) => {
  const b = body as Partial<ReanalyzeBody>;
  const out: Partial<ProjectRiskRow> = {};
  if (typeof b.reanalyze_ref === 'string') out.reanalyze_ref = b.reanalyze_ref;
  if (typeof b.cost_optimistic_zar === 'number') out.cost_optimistic_zar = b.cost_optimistic_zar;
  if (typeof b.cost_most_likely_zar === 'number') out.cost_most_likely_zar = b.cost_most_likely_zar;
  if (typeof b.cost_pessimistic_zar === 'number') out.cost_pessimistic_zar = b.cost_pessimistic_zar;
  if (typeof b.schedule_optimistic_days === 'number') out.schedule_optimistic_days = b.schedule_optimistic_days;
  if (typeof b.schedule_most_likely_days === 'number') out.schedule_most_likely_days = b.schedule_most_likely_days;
  if (typeof b.schedule_pessimistic_days === 'number') out.schedule_pessimistic_days = b.schedule_pessimistic_days;
  if (typeof b.probability_pct === 'number') out.probability_pct = b.probability_pct;
  if (typeof b.worst_case_cost_impact_zar === 'number') out.worst_case_cost_impact_zar = b.worst_case_cost_impact_zar;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<ProjectRiskRow> = {};
  if (typeof b.withdraw_ref === 'string') out.withdraw_ref = b.withdraw_ref;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/cancel', async (c) => transition(c, 'cancel', (_row, body) => {
  const b = body as Partial<{ reason_code?: string }>;
  const out: Partial<ProjectRiskRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function projectRiskSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_project_risks
     WHERE chain_status NOT IN ('closed','accepted','withdrawn','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ProjectRiskRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_project_risks
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `prr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_project_risks_events (id, risk_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'project_risk.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.risk_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (isHighTier(row.risk_tier)) {
      await fireCascade({
        event: 'project_risk.sla_breached',
        actor_id: 'system',
        entity_type: 'project_risk',
        entity_id: row.id,
        data: {
          ...row,
          crosses_into_regulator: true,
        },
        env,
      });
    }

    breached++;
  }
  return { scanned: rows.length, breached };
}

export default app;
