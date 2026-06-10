// ═══════════════════════════════════════════════════════════════════════════
// Wave 96 — IPP Submittal Log & RFI Register. Mounted at
// /api/ipp/submittal-rfi/chain.
//
// Construction-document review pipeline beating Procore (submittal log + RFI
// register + ball-in-court tracking), Aconex (document control + transmittal),
// Newforma + Asite + Kahua + e-Builder (spec coverage + tier-derived SLA +
// regulator-inbox crossings). Every chain row is LIVE-scored on every fetch
// against an IPP-PM quality battery (response-SLA remaining, days-in-court,
// urgency band, bid-envelope drift %, grid-code clauses affected, supersede
// chain depth, predicted close date, ipp_pm_quality_index vs Procore baseline).
//
// Write {admin, ipp_developer, wind}. Read all 9 personas. actor_party
// functional (author, coordinator, reviewer, designer, owner,
// independent_engineer, contractor).
//
// Reportability — the W96 SIGNATURE is GRID-CODE / BID-ENVELOPE-driven:
//   approve                     → regulator EVERY tier when affects_grid_code
//                                                  OR affects_bid_envelope.
//   void                        → regulator EVERY tier when affects_grid_code
//                                                  OR affects_life_safety.
//   distribute_for_construction → regulator high+critical when grid_code.
//   return_for_revision         → regulator high+critical when grid_code.
//   sla_breached                → regulator high+critical when grid_code OR
//                                                              holds_construction.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  responseDeadlineFor,
  tierFromInputs,
  ballInCourtFor,
  isHighTier,
  isReportable,
  actionCrossesRegulator,
  authorityFor,
  urgencyBandFor,
  ippPmQualityIndex,
  predictedCloseDate,
  partyForAction,
  eventTypeFor as specEventTypeFor,
  inboxSeverityForTier,
  SLA_MINUTES,
  RESPONSE_MINUTES,
  type SubmittalRfiStatus,
  type SubmittalRfiAction,
  type SubmittalRfiTier,
  type SubmittalRfiWorkflowClass,
  type SubmittalRfiPriorityClass,
  type SubmittalRfiParty,
} from '../utils/submittal-rfi-spec';

const READ_ROLES = new Set([
  'admin', 'ipp', 'ipp_developer', 'wind',
  'lender', 'regulator', 'offtaker',
  'grid_operator', 'carbon_fund', 'trader', 'support',
]);

const WRITE_ROLES = new Set(['admin', 'ipp', 'ipp_developer', 'wind']);

interface SubmittalRow {
  id: string;
  submittal_rfi_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  designer_id: string | null;
  designer_name: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  owner_party_id: string | null;
  owner_party_name: string | null;
  workflow_class: SubmittalRfiWorkflowClass;
  priority_class: SubmittalRfiPriorityClass;
  document_type: string | null;
  spec_section: string | null;
  csi_division: string | null;
  csi_section_code: string | null;
  uniclass_code: string | null;
  sans_section: string | null;
  transmittal_number: string | null;
  sequence_number: number | null;
  current_tier: SubmittalRfiTier;
  authority_required: string | null;
  affects_grid_code: number;
  affects_life_safety: number;
  affects_bid_envelope: number;
  holds_construction: number;
  requires_designer_response: number;
  requires_ie_review: number;
  requires_owner_review: number;
  clarification_count: number;
  revision_count: number;
  rejection_count: number;
  response_count: number;
  bid_envelope_drift_pct: number | null;
  grid_code_clauses_affected: number;
  estimated_cost_impact_zar: number | null;
  estimated_schedule_impact_days: number | null;
  parent_submittal_id: string | null;
  superseded_by_id: string | null;
  parent_rfi_id: string | null;
  drawing_ref: string | null;
  attachments_json: string | null;
  spec_coverage_notes: string | null;
  regulator_ref: string | null;
  gca_ref: string | null;
  cod_ref: string | null;
  title: string | null;
  narrative: string | null;
  response_text: string | null;
  voided_reason: string | null;
  withdrawn_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  requester_party: string | null;
  approver_party: string | null;
  chain_status: SubmittalRfiStatus;
  drafted_at: string;
  submitted_at: string | null;
  distributed_at: string | null;
  under_review_at: string | null;
  clarification_requested_at: string | null;
  responded_at: string | null;
  approved_at: string | null;
  returned_for_revision_at: string | null;
  revised_at: string | null;
  distributed_for_construction_at: string | null;
  incorporated_at: string | null;
  closed_clean_at: string | null;
  voided_at: string | null;
  withdrawn_at: string | null;
  construction_hold_started_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  response_due_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  [k: string]: unknown;
}

interface SubmittalEventRow {
  id: string;
  submittal_rfi_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<SubmittalRfiStatus, string | null> = {
  drafted:                     'drafted_at',
  submitted:                   'submitted_at',
  distributed:                 'distributed_at',
  under_review:                'under_review_at',
  clarification_requested:     'clarification_requested_at',
  responded:                   'responded_at',
  approved:                    'approved_at',
  returned_for_revision:       'returned_for_revision_at',
  revised:                     'revised_at',
  distributed_for_construction:'distributed_for_construction_at',
  incorporated:                'incorporated_at',
  closed_clean:                'closed_clean_at',
  voided:                      'voided_at',
  withdrawn:                   'withdrawn_at',
};

function reasonCodeFor(action: SubmittalRfiAction): string {
  switch (action) {
    case 'submit':                      return 'SUBMITTED';
    case 'distribute':                  return 'DISTRIBUTED';
    case 'start_review':                return 'REVIEW_STARTED';
    case 'request_clarification':       return 'CLARIFICATION_REQUESTED';
    case 'provide_clarification':       return 'CLARIFICATION_PROVIDED';
    case 'respond':                     return 'RESPONSE_DRAFTED';
    case 'approve':                     return 'APPROVED';
    case 'return_for_revision':         return 'RETURNED_FOR_REVISION';
    case 'resubmit':                    return 'RESUBMITTED';
    case 'distribute_for_construction': return 'ISSUED_FOR_CONSTRUCTION';
    case 'incorporate':                 return 'INCORPORATED';
    case 'close':                       return 'CLOSED_CLEAN';
    case 'void':                        return 'VOIDED';
    case 'withdraw':                    return 'WITHDRAWN';
  }
}

function decorate(row: SubmittalRow, now: Date) {
  const status = row.chain_status;
  const tier = row.current_tier;
  const slaIso = row.sla_deadline_at;
  const respIso = row.response_due_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  const minutesUntilResponse = respIso
    ? Math.floor((new Date(respIso).getTime() - now.getTime()) / 60000)
    : null;

  const tierLive = tierFromInputs({
    priorityClass: row.priority_class,
    workflowClass: row.workflow_class,
    affectsGridCode: !!row.affects_grid_code,
    affectsLifeSafety: !!row.affects_life_safety,
    affectsBidEnvelope: !!row.affects_bid_envelope,
    holdsConstruction: !!row.holds_construction,
  });

  const ballInCourt = ballInCourtFor(status);
  const stateEnteredCol = TIMESTAMP_COLUMN[status];
  const stateEnteredIso = stateEnteredCol ? (row[stateEnteredCol] as string | null) : row.drafted_at;
  const stateEnteredAt = stateEnteredIso ? new Date(stateEnteredIso) : now;
  const daysInCourt = Math.floor((now.getTime() - stateEnteredAt.getTime()) / (24 * 60 * 60 * 1000));
  const daysOpen = Math.floor((now.getTime() - new Date(row.drafted_at).getTime()) / (24 * 60 * 60 * 1000));

  const predictedClose = predictedCloseDate(status, tierLive, stateEnteredAt);
  const urgency = urgencyBandFor(minutesUntilSla, isTerminal(status));

  const responseWithinSla = (minutesUntilResponse == null) || minutesUntilResponse >= 0;
  const closeWithinSla = (minutesUntilSla == null) || minutesUntilSla >= 0;
  const ballClear = ballInCourt != null;
  const qualityIndex = ippPmQualityIndex({
    responseWithinSla,
    closeWithinSla,
    revisionCount: row.revision_count || 0,
    ballInCourtClear: ballClear,
    bidEnvelopeDriftPct: row.bid_envelope_drift_pct || 0,
  });

  const floorApplied = !!(
    row.affects_grid_code || row.affects_life_safety ||
    row.affects_bid_envelope || row.holds_construction
  );

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    minutes_until_response_sla: minutesUntilResponse,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0 && !isTerminal(status),
    response_sla_breached: minutesUntilResponse != null && minutesUntilResponse < 0 && !isTerminal(status),
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    response_window_minutes: RESPONSE_MINUTES[tier] ?? 0,
    urgency_band: urgency,
    is_reportable_flag: !!row.is_reportable,
    high_tier_flag: isHighTier(tier),
    floor_at_high_flag: floorApplied,
    signature_class_flag: floorApplied,
    authority_required_live: authorityFor(tier),
    tier_live: tierLive,
    ball_in_court_party_live: ballInCourt,
    days_in_court_live: daysInCourt,
    days_open_live: daysOpen,
    predicted_close_date_live: predictedClose ? predictedClose.toISOString() : null,
    ipp_pm_quality_index_live: qualityIndex,
    inbox_severity_live: inboxSeverityForTier(tier),
    reportable_per_spec: isReportable(tier),
    supersede_chain_depth_live: row.revision_count || 0,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current_tier   = c.req.query('current_tier');
  const status         = c.req.query('status');
  const workflow_class = c.req.query('workflow_class');
  const priority_class = c.req.query('priority_class');
  const project_id     = c.req.query('project_id');
  const facility_id    = c.req.query('facility_id');
  const csi_section    = c.req.query('csi_section_code');
  const breached       = c.req.query('breached');
  const reportable     = c.req.query('reportable');
  const signature_only = c.req.query('signature_only');
  const grid_code_only = c.req.query('grid_code_only');

  let sql = 'SELECT * FROM oe_submittal_rfi WHERE 1=1';
  const binds: unknown[] = [];
  if (current_tier)   { sql += ' AND current_tier = ?';     binds.push(current_tier); }
  if (status)         { sql += ' AND chain_status = ?';     binds.push(status); }
  if (workflow_class) { sql += ' AND workflow_class = ?';   binds.push(workflow_class); }
  if (priority_class) { sql += ' AND priority_class = ?';   binds.push(priority_class); }
  if (project_id)     { sql += ' AND project_id = ?';       binds.push(project_id); }
  if (facility_id)    { sql += ' AND facility_id = ?';      binds.push(facility_id); }
  if (csi_section)    { sql += ' AND csi_section_code = ?'; binds.push(csi_section); }
  if (grid_code_only === 'true') sql += ' AND affects_grid_code = 1';

  sql += ' ORDER BY datetime(drafted_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<SubmittalRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')       items = items.filter((r) => r.sla_breached);
  if (reportable === 'true')     items = items.filter((r) => r.is_reportable_flag);
  if (signature_only === 'true') items = items.filter((r) => r.signature_class_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_workflow: Record<string, number> = {};
  const by_priority: Record<string, number> = {};
  const by_project: Record<string, number> = {};
  const by_facility: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_ball_in_court: Record<string, number> = {};
  const by_csi_division: Record<string, number> = {};
  for (const r of items) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + 1;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + 1;
    by_workflow[r.workflow_class] = (by_workflow[r.workflow_class] || 0) + 1;
    by_priority[r.priority_class] = (by_priority[r.priority_class] || 0) + 1;
    by_project[r.project_id] = (by_project[r.project_id] || 0) + 1;
    if (r.facility_id) by_facility[r.facility_id] = (by_facility[r.facility_id] || 0) + 1;
    by_urgency[r.urgency_band] = (by_urgency[r.urgency_band] || 0) + 1;
    if (r.ball_in_court_party_live) {
      const k = r.ball_in_court_party_live;
      by_ball_in_court[k] = (by_ball_in_court[k] || 0) + 1;
    }
    if (r.csi_division) by_csi_division[r.csi_division] = (by_csi_division[r.csi_division] || 0) + 1;
  }

  const open_count             = items.filter((i) => !i.is_terminal).length;
  const closed_clean_count     = items.filter((i) => i.chain_status === 'closed_clean').length;
  const voided_count           = items.filter((i) => i.chain_status === 'voided').length;
  const withdrawn_count        = items.filter((i) => i.chain_status === 'withdrawn').length;
  const distributed_for_construction_count = items.filter((i) => i.chain_status === 'distributed_for_construction').length;
  const incorporated_count     = items.filter((i) => i.chain_status === 'incorporated').length;
  const returned_for_revision_count = items.filter((i) => i.chain_status === 'returned_for_revision').length;
  const breached_count         = items.filter((i) => i.sla_breached).length;
  const response_breached_count = items.filter((i) => i.response_sla_breached).length;
  const reportable_total       = items.filter((i) => i.is_reportable_flag).length;
  const signature_count        = items.filter((i) => i.signature_class_flag).length;
  const grid_code_count        = items.filter((i) => i.affects_grid_code).length;
  const bid_envelope_count     = items.filter((i) => i.affects_bid_envelope).length;
  const life_safety_count      = items.filter((i) => i.affects_life_safety).length;
  const construction_hold_count = items.filter((i) => i.holds_construction).length;

  const avg_quality_index = items.length > 0
    ? items.reduce((s, i) => s + (i.ipp_pm_quality_index_live || 0), 0) / items.length
    : 0;
  const avg_days_in_court = items.length > 0
    ? items.reduce((s, i) => s + (i.days_in_court_live || 0), 0) / items.length
    : 0;
  const total_estimated_cost_impact_zar = items.reduce((s, i) => s + (i.estimated_cost_impact_zar || 0), 0);
  const total_estimated_schedule_impact_days = items.reduce((s, i) => s + (i.estimated_schedule_impact_days || 0), 0);
  const max_bid_envelope_drift_pct = items.reduce((m, i) => Math.max(m, Math.abs(i.bid_envelope_drift_pct || 0)), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_workflow,
      by_priority,
      by_project,
      by_facility,
      by_urgency,
      by_ball_in_court,
      by_csi_division,
      open_count,
      closed_clean_count,
      voided_count,
      withdrawn_count,
      distributed_for_construction_count,
      incorporated_count,
      returned_for_revision_count,
      breached: breached_count,
      response_breached_count,
      reportable_total,
      signature_count,
      grid_code_count,
      bid_envelope_count,
      life_safety_count,
      construction_hold_count,
      avg_quality_index,
      avg_days_in_court,
      total_estimated_cost_impact_zar,
      total_estimated_schedule_impact_days,
      max_bid_envelope_drift_pct,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_submittal_rfi WHERE id = ?').bind(id).first<SubmittalRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_submittal_rfi_events WHERE submittal_rfi_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<SubmittalEventRow>();

  return c.json({
    success: true,
    data: {
      submittal_rfi: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

async function transition(
  c: Context<HonoEnv>,
  action: SubmittalRfiAction,
  bodyHandler?: (row: SubmittalRow, body: Record<string, unknown>) => Partial<SubmittalRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_submittal_rfi WHERE id = ?').bind(id).first<SubmittalRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier RE-DERIVED on every transition with floor-at-high for grid_code /
  // life_safety / bid_envelope / construction_hold flags.
  const priorityClass = (overrides.priority_class as SubmittalRfiPriorityClass | undefined) ?? row.priority_class;
  const workflowClass = (overrides.workflow_class as SubmittalRfiWorkflowClass | undefined) ?? row.workflow_class;
  const affectsGridCode = !!((overrides.affects_grid_code as number | undefined) ?? row.affects_grid_code);
  const affectsLifeSafety = !!((overrides.affects_life_safety as number | undefined) ?? row.affects_life_safety);
  const affectsBidEnvelope = !!((overrides.affects_bid_envelope as number | undefined) ?? row.affects_bid_envelope);
  const holdsConstruction = !!((overrides.holds_construction as number | undefined) ?? row.holds_construction);
  const tier = tierFromInputs({
    priorityClass, workflowClass,
    affectsGridCode, affectsLifeSafety, affectsBidEnvelope, holdsConstruction,
  });
  overrides.current_tier = tier;
  overrides.authority_required = authorityFor(tier);

  // Reportability RE-COMPUTED on every transition with W96 signature crossings.
  const crosses = actionCrossesRegulator({
    action, tier,
    affectsGridCode, affectsLifeSafety, affectsBidEnvelope, holdsConstruction,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

  // Ball-in-court updated to destination state's owner.
  const newBallInCourt = ballInCourtFor(to);
  overrides.current_ball_in_court_party = newBallInCourt;

  // Counter bumps based on action.
  if (action === 'request_clarification') {
    overrides.clarification_count = (row.clarification_count || 0) + 1;
  }
  if (action === 'return_for_revision') {
    overrides.rejection_count = (row.rejection_count || 0) + 1;
  }
  if (action === 'resubmit') {
    overrides.revision_count = (row.revision_count || 0) + 1;
  }
  if (action === 'respond' || action === 'approve' || action === 'provide_clarification') {
    overrides.response_count = (row.response_count || 0) + 1;
  }

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const responseIso = !isTerminal(to) ? responseDeadlineFor(tier, now).toISOString() : null;

  const setClauses: string[] = [
    'chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?', 'response_due_at = ?',
  ];
  const setBinds: unknown[] = [to, nowIso, slaIso, responseIso];
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
    `UPDATE oe_submittal_rfi SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `srfi_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  const reasonCode = (overrides.reason_code as string | undefined) ?? reasonCodeFor(action);
  await c.env.DB.prepare(
    'INSERT INTO oe_submittal_rfi_events (id, submittal_rfi_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'submittal_rfi',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      current_tier: tier,
      workflow_class: workflowClass,
      priority_class: priorityClass,
      chain_status: to,
      from_status: row.chain_status,
      action,
      reason_code: reasonCode,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_submittal_rfi WHERE id = ?').bind(id).first<SubmittalRow>();
  return c.json({ success: true, data: { submittal_rfi: refreshed ? decorate(refreshed, now) : null } });
}

interface BasicBody { reason_code?: string; notes?: string }

interface SubmitBody extends BasicBody {
  title?: string;
  narrative?: string;
  drawing_ref?: string;
  attachments_json?: string;
  spec_section?: string;
  csi_division?: string;
  csi_section_code?: string;
  uniclass_code?: string;
  sans_section?: string;
  transmittal_number?: string;
  estimated_cost_impact_zar?: number;
  estimated_schedule_impact_days?: number;
  bid_envelope_drift_pct?: number;
  grid_code_clauses_affected?: number;
  affects_grid_code?: number;
  affects_life_safety?: number;
  affects_bid_envelope?: number;
  holds_construction?: number;
}

interface DistributeBody extends BasicBody {
  reviewer_party_id?: string;
}

interface ReviewBody extends BasicBody {
  response_text?: string;
}

interface ApproveBody extends BasicBody {
  approver_party?: SubmittalRfiParty;
}

interface ReturnBody extends BasicBody {
  reason_for_return?: string;
}

interface VoidBody extends BasicBody {
  voided_reason?: string;
}

interface WithdrawBody extends BasicBody {
  withdrawn_reason?: string;
}

interface IncorporateBody extends BasicBody {
  ie_witness_id?: string;
}

app.post('/:id/submit', async (c) => transition(c, 'submit', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.title === 'string') out.title = b.title;
  if (typeof b.narrative === 'string') out.narrative = b.narrative;
  if (typeof b.drawing_ref === 'string') out.drawing_ref = b.drawing_ref;
  if (typeof b.attachments_json === 'string') out.attachments_json = b.attachments_json;
  if (typeof b.spec_section === 'string') out.spec_section = b.spec_section;
  if (typeof b.csi_division === 'string') out.csi_division = b.csi_division;
  if (typeof b.csi_section_code === 'string') out.csi_section_code = b.csi_section_code;
  if (typeof b.uniclass_code === 'string') out.uniclass_code = b.uniclass_code;
  if (typeof b.sans_section === 'string') out.sans_section = b.sans_section;
  if (typeof b.transmittal_number === 'string') out.transmittal_number = b.transmittal_number;
  if (typeof b.estimated_cost_impact_zar === 'number') out.estimated_cost_impact_zar = b.estimated_cost_impact_zar;
  if (typeof b.estimated_schedule_impact_days === 'number') out.estimated_schedule_impact_days = b.estimated_schedule_impact_days;
  if (typeof b.bid_envelope_drift_pct === 'number') out.bid_envelope_drift_pct = b.bid_envelope_drift_pct;
  if (typeof b.grid_code_clauses_affected === 'number') out.grid_code_clauses_affected = b.grid_code_clauses_affected;
  if (typeof b.affects_grid_code === 'number') out.affects_grid_code = b.affects_grid_code;
  if (typeof b.affects_life_safety === 'number') out.affects_life_safety = b.affects_life_safety;
  if (typeof b.affects_bid_envelope === 'number') out.affects_bid_envelope = b.affects_bid_envelope;
  if (typeof b.holds_construction === 'number') out.holds_construction = b.holds_construction;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/distribute', async (c) => transition(c, 'distribute', (_row, body) => {
  const b = body as Partial<DistributeBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.reviewer_party_id === 'string') out.last_responder_party = b.reviewer_party_id;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/start-review', async (c) => transition(c, 'start_review', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/request-clarification', async (c) => transition(c, 'request_clarification', (_row, body) => {
  const b = body as Partial<ReviewBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.response_text === 'string') out.response_text = b.response_text;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/provide-clarification', async (c) => transition(c, 'provide_clarification', (_row, body) => {
  const b = body as Partial<ReviewBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.response_text === 'string') out.response_text = b.response_text;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/respond', async (c) => transition(c, 'respond', (_row, body) => {
  const b = body as Partial<ReviewBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.response_text === 'string') out.response_text = b.response_text;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/approve', async (c) => transition(c, 'approve', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.approver_party === 'string') out.approver_party = b.approver_party;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/return-for-revision', async (c) => transition(c, 'return_for_revision', (_row, body) => {
  const b = body as Partial<ReturnBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.reason_for_return === 'string') out.response_text = b.reason_for_return;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resubmit', async (c) => transition(c, 'resubmit', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.title === 'string') out.title = b.title;
  if (typeof b.narrative === 'string') out.narrative = b.narrative;
  if (typeof b.drawing_ref === 'string') out.drawing_ref = b.drawing_ref;
  if (typeof b.attachments_json === 'string') out.attachments_json = b.attachments_json;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/distribute-for-construction', async (c) => transition(c, 'distribute_for_construction', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/incorporate', async (c) => transition(c, 'incorporate', (_row, body) => {
  const b = body as Partial<IncorporateBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.ie_witness_id === 'string') out.last_responder_party = b.ie_witness_id;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/void', async (c) => transition(c, 'void', (_row, body) => {
  const b = body as Partial<VoidBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.voided_reason === 'string') out.voided_reason = b.voided_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<SubmittalRow> = {};
  if (typeof b.withdrawn_reason === 'string') out.withdrawn_reason = b.withdrawn_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function submittalRfiSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_submittal_rfi
     WHERE chain_status NOT IN ('closed_clean','voided','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<SubmittalRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_submittal_rfi
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `srfi_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_submittal_rfi_events (id, submittal_rfi_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'submittal_rfi.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    // SLA breach crosses regulator on high+critical when grid_code OR construction_hold.
    if (
      isHighTier(row.current_tier) &&
      (row.affects_grid_code || row.holds_construction)
    ) {
      await fireCascade({
        event: 'submittal_rfi.sla_breached',
        actor_id: 'system',
        entity_type: 'submittal_rfi',
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
