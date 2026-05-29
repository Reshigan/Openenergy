// ═══════════════════════════════════════════════════════════════════════════
// Wave 81 — IPP Project Change-Order / Variation Control & Earned-Value Management.
//
// Mounted at /api/ipp/change-order/chain.
//
// The PROJECT-CONTROLS core of a best-in-class projects system. W1 gave the IPP
// the schedule (CPM / Gantt / resource-leveling); W19 the procurement; W20 the
// construction-to-COD lifecycle. None of them manage the CHANGE. A site
// condition, a design change, a regulatory shift or a client request lands a
// variation against the approved baseline; project controls quantifies its
// cost / schedule / earned-value impact, draws it against the project
// contingency, gates approval on an authority tiered by magnitude, and only then
// RE-BASELINES the plan. W81 is that missing layer.
//
// DISTINCTIVE move (beat Primavera P6 EVM / Procore Change Management / MS
// Project baselines / Oracle Aconex): every change order is scored LIVE against
// the project earned-value battery (CV/SV/CPI/SPI/EAC/VAC/TCPI) and its
// contingency reserve, the approval authority is DERIVED from the variation
// magnitude, and a variation that pushes the project past its REIPPPP BID
// ENVELOPE crosses to the regulator (DMRE / IPP Office) as a viability signal.
//
// Tier is DERIVED from abs(cost_impact_zar) and RE-DERIVED on every transition
// (the magnitude IS the cost — contrast W80 where the coverage tier is explicit).
//
// Write model — SINGLE-PARTY {admin, ipp, ipp_developer, wind} (the project-owner
// side). READ all personas. actor_party tags the functional owner per step
// (project_manager / project_controls / sponsor).
//
// Reportability (the W81 SIGNATURE is RE-BASELINE-driven): incorporate crosses
// for HIGH tiers; approve crosses for critical only; reject crosses for critical
// only; sla_breached crosses HIGH.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierFromCostImpact,
  approvalAuthorityFor,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  isHighTier,
  partyForAction,
  costVarianceZar,
  scheduleVarianceZar,
  cpi,
  spi,
  estimateAtCompletionZar,
  varianceAtCompletionZar,
  toCompletePerformanceIndex,
  contingencyRemainingZar,
  isWithinContingency,
  revisedBaselineCostZar,
  cumulativeOverrunPct,
  breachesBidEnvelope,
  SLA_MINUTES,
  type ChangeOrderStatus,
  type ChangeOrderAction,
} from '../utils/project-change-order-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'ipp', 'ipp_developer', 'wind',
  'grid', 'grid_operator', 'regulator', 'lender', 'offtaker', 'trader', 'carbon_fund',
]);

// SINGLE-PARTY write — the project-owner side operates the chain. actor_party is
// functional attribution only (project_manager / project_controls / sponsor).
const WRITE_ROLES = new Set(['admin', 'ipp', 'ipp_developer', 'wind']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface CoRow {
  id: string;
  co_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string | null;
  project_name: string;
  participant_id: string | null;
  participant_name: string | null;
  contractor_name: string | null;
  change_type: string | null;
  title: string;
  description: string | null;
  variation_tier: string;
  cost_impact_zar: number;
  schedule_impact_days: number;
  baseline_cost_zar: number | null;
  baseline_duration_days: number | null;
  contingency_zar: number | null;
  contingency_drawn_zar: number;
  earned_value_zar: number | null;
  planned_value_zar: number | null;
  actual_cost_zar: number | null;
  budget_at_completion_zar: number | null;
  cumulative_approved_variation_zar: number;
  cumulative_approved_days: number;
  bid_envelope_cost_pct: number | null;
  bid_envelope_schedule_days: number | null;
  approval_authority: string | null;
  approved_by: string | null;
  raised_by_party: string | null;
  reason_code: string | null;
  rejection_reason: string | null;
  dispute_reason: string | null;
  submission_ref: string | null;
  screening_ref: string | null;
  assessment_ref: string | null;
  approval_ref: string | null;
  incorporation_ref: string | null;
  deferral_ref: string | null;
  dispute_ref: string | null;
  rejection_ref: string | null;
  regulator_ref: string | null;
  evidence_ref: string | null;
  submission_basis: string | null;
  screening_basis: string | null;
  assessment_basis: string | null;
  approval_basis: string | null;
  incorporation_basis: string | null;
  deferral_basis: string | null;
  dispute_basis: string | null;
  rejection_basis: string | null;
  notes: string | null;
  chain_status: ChangeOrderStatus;
  draft_at: string;
  submitted_at: string | null;
  screening_at: string | null;
  impact_assessment_at: string | null;
  pending_approval_at: string | null;
  approved_at: string | null;
  incorporated_at: string | null;
  deferred_at: string | null;
  disputed_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  cancelled_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CoEventRow {
  id: string;
  co_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ChangeOrderStatus, keyof CoRow | null> = {
  draft:             null,
  submitted:         'submitted_at',
  screening:         'screening_at',
  impact_assessment: 'impact_assessment_at',
  pending_approval:  'pending_approval_at',
  approved:          'approved_at',
  incorporated:      'incorporated_at',
  deferred:          'deferred_at',
  disputed:          'disputed_at',
  rejected:          'rejected_at',
  withdrawn:         'withdrawn_at',
  cancelled:         'cancelled_at',
};

function decorate(row: CoRow, now: Date) {
  // Tier is DERIVED from the cost impact (re-derived live).
  const tier = tierFromCostImpact(row.cost_impact_zar);
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const ev = row.earned_value_zar || 0;
  const pv = row.planned_value_zar || 0;
  const ac = row.actual_cost_zar || 0;
  const bac = row.budget_at_completion_zar || 0;

  return {
    ...row,
    variation_tier: tier,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    approval_authority_derived: approvalAuthorityFor(tier),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    // Live earned-value battery (the distinctive layer).
    cost_variance_zar: costVarianceZar(ev, ac),
    schedule_variance_zar: scheduleVarianceZar(ev, pv),
    cpi: cpi(ev, ac),
    spi: spi(ev, pv),
    estimate_at_completion_zar: estimateAtCompletionZar(bac, ev, ac),
    variance_at_completion_zar: varianceAtCompletionZar(bac, ev, ac),
    tcpi: toCompletePerformanceIndex(bac, ev, ac),
    // Contingency + re-baseline.
    contingency_remaining_zar: contingencyRemainingZar(row.contingency_zar || 0, row.contingency_drawn_zar || 0),
    within_contingency: isWithinContingency(row.cost_impact_zar, row.contingency_zar || 0, row.contingency_drawn_zar || 0),
    revised_baseline_cost_zar: revisedBaselineCostZar(
      row.baseline_cost_zar || 0, row.cumulative_approved_variation_zar || 0, row.cost_impact_zar,
    ),
    cumulative_overrun_pct: cumulativeOverrunPct(
      row.baseline_cost_zar || 0, row.cumulative_approved_variation_zar || 0, row.cost_impact_zar,
    ),
    breaches_bid_envelope: breachesBidEnvelope({
      baselineCostZar: row.baseline_cost_zar || 0,
      cumulativeApprovedZar: row.cumulative_approved_variation_zar || 0,
      costImpactZar: row.cost_impact_zar,
      bidEnvelopeCostPct: row.bid_envelope_cost_pct || 0,
      scheduleImpactDays: row.schedule_impact_days || 0,
      cumulativeApprovedDays: row.cumulative_approved_days || 0,
      bidEnvelopeScheduleDays: row.bid_envelope_schedule_days || 0,
    }),
  };
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const variation_tier = c.req.query('variation_tier');
  const status         = c.req.query('status');
  const change_type    = c.req.query('change_type');
  const project_id     = c.req.query('project_id');
  const participant_id = c.req.query('participant_id');
  const breached       = c.req.query('breached');
  const reportable     = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_project_change_orders WHERE 1=1';
  const binds: unknown[] = [];
  if (status)         { sql += ' AND chain_status = ?'; binds.push(status); }
  if (change_type)    { sql += ' AND change_type = ?'; binds.push(change_type); }
  if (project_id)     { sql += ' AND project_id = ?'; binds.push(project_id); }
  if (participant_id) { sql += ' AND participant_id = ?'; binds.push(participant_id); }

  sql += ' ORDER BY datetime(draft_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<CoRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (variation_tier)        items = items.filter((r) => r.variation_tier === variation_tier);
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.variation_tier] = (by_tier[i.variation_tier] || 0) + 1;
    if (i.change_type) by_type[i.change_type] = (by_type[i.change_type] || 0) + 1;
  }

  const open_count          = items.filter((i) => !i.is_terminal).length;
  const pending_approval     = items.filter((i) => i.chain_status === 'pending_approval').length;
  const in_assessment        = items.filter((i) => i.chain_status === 'impact_assessment').length;
  const disputed_count       = items.filter((i) => i.chain_status === 'disputed').length;
  const deferred_count       = items.filter((i) => i.chain_status === 'deferred').length;
  const incorporated_count   = items.filter((i) => i.chain_status === 'incorporated').length;
  const rejected_count       = items.filter((i) => i.chain_status === 'rejected').length;
  const breached_count       = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total     = items.filter((i) => i.is_reportable_flag).length;
  const bid_envelope_breaches = items.filter((i) => i.breaches_bid_envelope).length;
  const high_tier_count      = items.filter((i) => isHighTier(i.variation_tier)).length;
  const total_cost_impact_zar     = items.reduce((sum, i) => sum + (i.cost_impact_zar || 0), 0);
  const total_schedule_impact_days = items.reduce((sum, i) => sum + (i.schedule_impact_days || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_type,
      open_count,
      pending_approval,
      in_assessment,
      disputed_count,
      deferred_count,
      incorporated_count,
      rejected_count,
      breached: breached_count,
      reportable_total,
      bid_envelope_breaches,
      high_tier_count,
      total_cost_impact_zar,
      total_schedule_impact_days,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_project_change_orders WHERE id = ?').bind(id).first<CoRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_project_change_order_events WHERE co_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<CoEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface SubmitBody {
  submission_basis?: string;
  submission_ref?: string;
  change_type?: string;
  title?: string;
  description?: string;
  cost_impact_zar?: number;
  schedule_impact_days?: number;
  notes?: string;
}
interface ScreeningBody { screening_basis?: string; screening_ref?: string; notes?: string; }
interface AssessBody {
  assessment_basis?: string;
  assessment_ref?: string;
  cost_impact_zar?: number;
  schedule_impact_days?: number;
  earned_value_zar?: number;
  planned_value_zar?: number;
  actual_cost_zar?: number;
  budget_at_completion_zar?: number;
  notes?: string;
}
interface SubmitForApprovalBody { assessment_basis?: string; approval_ref?: string; notes?: string; }
interface ApproveBody { approval_basis?: string; approval_ref?: string; approved_by?: string; notes?: string; }
interface IncorporateBody {
  incorporation_basis?: string;
  incorporation_ref?: string;
  cumulative_approved_variation_zar?: number;
  cumulative_approved_days?: number;
  notes?: string;
}
interface DeferBody { deferral_basis?: string; deferral_ref?: string; reason_code?: string; notes?: string; }
interface DisputeBody { dispute_basis?: string; dispute_ref?: string; dispute_reason?: string; notes?: string; }
interface ResolveDisputeBody {
  dispute_basis?: string;
  cost_impact_zar?: number;
  schedule_impact_days?: number;
  notes?: string;
}
interface RejectBody { rejection_basis?: string; rejection_ref?: string; rejection_reason?: string; reason_code?: string; regulator_ref?: string; notes?: string; }
interface CloseBody { reason_code?: string; notes?: string; }

// event type = project_change_order.<target-status>
function eventTypeFor(to: ChangeOrderStatus): string {
  return `project_change_order.${to}`;
}

async function transition(
  c: Context<HonoEnv>,
  action: ChangeOrderAction,
  bodyHandler?: (row: CoRow, body: Record<string, unknown>) => Partial<CoRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_project_change_orders WHERE id = ?').bind(id).first<CoRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Tier is DERIVED from the cost impact, RE-DERIVED on every transition using
  // the effective cost (a fresh assessed cost in the body wins over the stored
  // value). The approval authority follows from the tier.
  const effectiveCost = typeof overrides.cost_impact_zar === 'number'
    ? overrides.cost_impact_zar
    : row.cost_impact_zar;
  const tier = tierFromCostImpact(effectiveCost);
  overrides.variation_tier = tier;
  overrides.approval_authority = approvalAuthorityFor(tier);

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier);
  // Reportability is a stable property of the tier (HIGH = reportable);
  // recompute each transition and force it on when the action crosses.
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
    `UPDATE oe_project_change_orders SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `pco_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_project_change_order_events (id, co_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(to),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  const eventName = eventTypeFor(to) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'project_change_order',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      variation_tier: tier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_project_change_orders WHERE id = ?').bind(id).first<CoRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/submit', async (c) => transition(c, 'submit', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.submission_basis === 'string')     out.submission_basis = b.submission_basis;
  if (typeof b.submission_ref === 'string')        out.submission_ref = b.submission_ref;
  if (typeof b.change_type === 'string')           out.change_type = b.change_type;
  if (typeof b.title === 'string')                 out.title = b.title;
  if (typeof b.description === 'string')           out.description = b.description;
  if (typeof b.cost_impact_zar === 'number')       out.cost_impact_zar = b.cost_impact_zar;
  if (typeof b.schedule_impact_days === 'number')  out.schedule_impact_days = b.schedule_impact_days;
  return out;
}));

app.post('/:id/begin-screening', async (c) => transition(c, 'begin_screening', (_row, body) => {
  const b = body as Partial<ScreeningBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.screening_basis === 'string') out.screening_basis = b.screening_basis;
  if (typeof b.screening_ref === 'string')   out.screening_ref = b.screening_ref;
  return out;
}));

app.post('/:id/assess-impact', async (c) => transition(c, 'assess_impact', (_row, body) => {
  const b = body as Partial<AssessBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.assessment_basis === 'string')          out.assessment_basis = b.assessment_basis;
  if (typeof b.assessment_ref === 'string')            out.assessment_ref = b.assessment_ref;
  if (typeof b.cost_impact_zar === 'number')           out.cost_impact_zar = b.cost_impact_zar;
  if (typeof b.schedule_impact_days === 'number')      out.schedule_impact_days = b.schedule_impact_days;
  if (typeof b.earned_value_zar === 'number')          out.earned_value_zar = b.earned_value_zar;
  if (typeof b.planned_value_zar === 'number')         out.planned_value_zar = b.planned_value_zar;
  if (typeof b.actual_cost_zar === 'number')           out.actual_cost_zar = b.actual_cost_zar;
  if (typeof b.budget_at_completion_zar === 'number')  out.budget_at_completion_zar = b.budget_at_completion_zar;
  return out;
}));

app.post('/:id/submit-for-approval', async (c) => transition(c, 'submit_for_approval', (_row, body) => {
  const b = body as Partial<SubmitForApprovalBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.assessment_basis === 'string') out.assessment_basis = b.assessment_basis;
  if (typeof b.approval_ref === 'string')     out.approval_ref = b.approval_ref;
  return out;
}));

app.post('/:id/approve', async (c) => transition(c, 'approve', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.approval_basis === 'string') out.approval_basis = b.approval_basis;
  if (typeof b.approval_ref === 'string')   out.approval_ref = b.approval_ref;
  if (typeof b.approved_by === 'string')    out.approved_by = b.approved_by;
  return out;
}));

app.post('/:id/incorporate', async (c) => transition(c, 'incorporate', (row, body) => {
  const b = body as Partial<IncorporateBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.incorporation_basis === 'string') out.incorporation_basis = b.incorporation_basis;
  if (typeof b.incorporation_ref === 'string')   out.incorporation_ref = b.incorporation_ref;
  // Roll this variation into the cumulative approved position at re-baseline.
  out.cumulative_approved_variation_zar = typeof b.cumulative_approved_variation_zar === 'number'
    ? b.cumulative_approved_variation_zar
    : (row.cumulative_approved_variation_zar || 0) + (row.cost_impact_zar || 0);
  out.cumulative_approved_days = typeof b.cumulative_approved_days === 'number'
    ? b.cumulative_approved_days
    : (row.cumulative_approved_days || 0) + (row.schedule_impact_days || 0);
  return out;
}));

app.post('/:id/defer', async (c) => transition(c, 'defer', (_row, body) => {
  const b = body as Partial<DeferBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.deferral_basis === 'string') out.deferral_basis = b.deferral_basis;
  if (typeof b.deferral_ref === 'string')   out.deferral_ref = b.deferral_ref;
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resubmit', async (c) => transition(c, 'resubmit', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.submission_basis === 'string')    out.submission_basis = b.submission_basis;
  if (typeof b.submission_ref === 'string')       out.submission_ref = b.submission_ref;
  if (typeof b.cost_impact_zar === 'number')      out.cost_impact_zar = b.cost_impact_zar;
  if (typeof b.schedule_impact_days === 'number') out.schedule_impact_days = b.schedule_impact_days;
  return out;
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<CoRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof b.dispute_basis === 'string')  out.dispute_basis = b.dispute_basis;
  if (typeof b.dispute_ref === 'string')    out.dispute_ref = b.dispute_ref;
  if (typeof b.dispute_reason === 'string') out.dispute_reason = b.dispute_reason;
  return out;
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) => {
  const b = body as Partial<ResolveDisputeBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.dispute_basis === 'string')        out.dispute_basis = b.dispute_basis;
  if (typeof b.cost_impact_zar === 'number')      out.cost_impact_zar = b.cost_impact_zar;
  if (typeof b.schedule_impact_days === 'number') out.schedule_impact_days = b.schedule_impact_days;
  return out;
}));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.rejection_basis === 'string')  out.rejection_basis = b.rejection_basis;
  if (typeof b.rejection_ref === 'string')    out.rejection_ref = b.rejection_ref;
  if (typeof b.rejection_reason === 'string') out.rejection_reason = b.rejection_reason;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')    out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/cancel', async (c) => transition(c, 'cancel', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<CoRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function projectChangeOrderSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_project_change_orders
     WHERE chain_status NOT IN ('incorporated','rejected','withdrawn','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<CoRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    const tier = tierFromCostImpact(row.cost_impact_zar);
    await env.DB.prepare(
      `UPDATE oe_project_change_orders
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `pco_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_project_change_order_events (id, co_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'project_change_order.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past variation-control SLA (tier ${tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at, variation_tier: tier }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(tier)) {
      await fireCascade({
        event: 'project_change_order.sla_breached',
        actor_id: 'system',
        entity_type: 'project_change_order',
        entity_id: row.id,
        data: {
          ...row,
          variation_tier: tier,
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
