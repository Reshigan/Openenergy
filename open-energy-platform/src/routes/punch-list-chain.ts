// Wave 98 — IPP Punch List / COD Snag Handover. Mounted at
// /api/ipp/punch-list/chain.
//
// The construction-completion deficiency lifecycle for a best-in-class IPP-PM
// stack. Beats Procore Punch List, BIM 360 Field, PlanGrid Punch List,
// Fieldwire snag, Autodesk Construction Cloud Punch List, Bluebeam Revu Snag,
// Aconex Defects. Every row is LIVE-scored on every fetch against an IPP-PM
// quality battery (within-SLA, rejection count, reinspection count, photo
// evidence, root cause, commissioning evidence, ball-in-court).
//
// Write {admin, ipp, ipp_developer, wind}. Read all 9 personas.
//
// SIGNATURE (W98 — NERSA §C-5 + REIPPPP COD):
//   close                -> regulator EVERY tier when
//                           blocks_commercial_operation
//                           OR life_safety_critical
//   accept               -> regulator high+critical when life_safety_critical
//   reject_reinspection  -> regulator high+critical when
//                           blocks_commercial_operation
//   void                 -> regulator EVERY tier when blocks_handover
//                                                  OR life_safety_critical
//   sla_breached         -> regulator high+critical when
//                           blocks_commercial_operation
//                           OR life_safety_critical

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaMinutesFor,
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
  type PunchStatus,
  type PunchAction,
  type PunchTier,
  type PunchWorkflowClass,
  type PunchPriorityClass,
} from '../utils/punch-list-spec';

const READ_ROLES = new Set([
  'admin', 'ipp', 'ipp_developer', 'wind',
  'lender', 'regulator', 'offtaker',
  'grid_operator', 'carbon_fund', 'trader', 'support',
]);

const WRITE_ROLES = new Set(['admin', 'ipp', 'ipp_developer', 'wind']);

interface PunchRow {
  id: string;
  punch_number: string;
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
  owner_party_id: string | null;
  owner_party_name: string | null;
  workflow_class: PunchWorkflowClass;
  priority_class: PunchPriorityClass;
  identified_location: string | null;
  identified_zone: string | null;
  identified_drawing_ref: string | null;
  identified_specification_ref: string | null;
  identified_at: string | null;
  blocks_commercial_operation: number;
  blocks_handover: number;
  life_safety_critical: number;
  warranty_critical: number;
  current_tier: PunchTier;
  authority_required: string | null;
  rejection_count: number;
  reinspection_count: number;
  photo_evidence_count: number;
  root_cause_documented: number;
  commissioning_evidence: number;
  remediation_cost_zar: number | null;
  recovered_from_contractor_zar: number | null;
  parent_punch_id: string | null;
  cod_blocker_ref: string | null;
  handover_blocker_ref: string | null;
  warranty_ref: string | null;
  regulator_ref: string | null;
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
  chain_status: PunchStatus;
  assessed_at: string | null;
  assigned_at: string | null;
  in_remediation_at: string | null;
  reinspect_requested_at: string | null;
  reinspected_at: string | null;
  accepted_at: string | null;
  closed_at: string | null;
  on_hold_at: string | null;
  voided_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  [k: string]: unknown;
}

interface PunchEventRow {
  id: string;
  punch_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<PunchStatus, string | null> = {
  identified:          null,
  assessed:            'assessed_at',
  assigned:            'assigned_at',
  in_remediation:      'in_remediation_at',
  reinspect_requested: 'reinspect_requested_at',
  reinspected:         'reinspected_at',
  accepted:            'accepted_at',
  closed:              'closed_at',
  on_hold:             'on_hold_at',
  voided:              'voided_at',
  withdrawn:           'withdrawn_at',
};

function reasonCodeFor(action: PunchAction): string {
  switch (action) {
    case 'assess':                return 'ASSESSED';
    case 'assign':                return 'ASSIGNED';
    case 'begin_remediation':     return 'REMEDIATION_BEGUN';
    case 'request_reinspection':  return 'REINSPECTION_REQUESTED';
    case 'reinspect':             return 'REINSPECTED';
    case 'accept':                return 'ACCEPTED';
    case 'reject_reinspection':   return 'REINSPECTION_REJECTED';
    case 'close':                 return 'CLOSED';
    case 'park':                  return 'PARKED';
    case 'resume':                return 'RESUMED';
    case 'void':                  return 'VOIDED';
    case 'withdraw':              return 'WITHDRAWN';
  }
}

function slaDeadlineFor(status: PunchStatus, tier: PunchTier, from: Date): Date | null {
  const minutes = slaMinutesFor(status, tier);
  if (minutes == null) return null;
  return new Date(from.getTime() + minutes * 60_000);
}

function decorate(row: PunchRow, now: Date) {
  const status = row.chain_status;
  const tier = row.current_tier;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const tierLive = tierFromInputs({
    priorityClass: row.priority_class,
    workflowClass: row.workflow_class,
    blocksCommercialOperation: !!row.blocks_commercial_operation,
    blocksHandover: !!row.blocks_handover,
    lifeSafetyCritical: !!row.life_safety_critical,
    warrantyCritical: !!row.warranty_critical,
  });

  const ballInCourt = ballInCourtFor(status);
  const stateEnteredCol = TIMESTAMP_COLUMN[status];
  const stateEnteredIso = stateEnteredCol
    ? (row[stateEnteredCol] as string | null)
    : (row.identified_at || row.created_at);
  const stateEnteredAt = stateEnteredIso ? new Date(stateEnteredIso) : now;
  const daysInCourt = Math.floor((now.getTime() - stateEnteredAt.getTime()) / (24 * 60 * 60 * 1000));
  const openIso = row.identified_at || row.created_at;
  const daysOpen = Math.floor((now.getTime() - new Date(openIso).getTime()) / (24 * 60 * 60 * 1000));

  const predictedClose = predictedCloseDate(status, tierLive, stateEnteredAt);
  const urgency = urgencyBandFor(minutesUntilSla, isTerminal(status));

  const withinSla = (minutesUntilSla == null) || minutesUntilSla >= 0;
  const ballClear = ballInCourt != null;
  const qualityIndex = ippPmQualityIndex({
    withinSla,
    rejectionCount: row.rejection_count || 0,
    reinspectionCount: row.reinspection_count || 0,
    ballInCourtClear: ballClear,
    photoEvidenceCount: row.photo_evidence_count || 0,
    rootCauseDocumented: !!row.root_cause_documented,
    commissioningEvidence: !!row.commissioning_evidence,
  });

  const floorApplied = !!(
    row.blocks_commercial_operation || row.blocks_handover ||
    row.life_safety_critical || row.warranty_critical
  );

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0 && !isTerminal(status),
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    urgency_band: urgency,
    is_reportable_flag: !!row.is_reportable,
    high_tier_flag: isHighTier(tier),
    floor_at_high_flag: floorApplied,
    signature_class_flag: !!(
      row.blocks_commercial_operation || row.blocks_handover ||
      row.life_safety_critical
    ),
    authority_required_live: authorityFor(tier),
    tier_live: tierLive,
    ball_in_court_party_live: ballInCourt,
    days_in_court_live: daysInCourt,
    days_open_live: daysOpen,
    predicted_close_date_live: predictedClose ? predictedClose.toISOString() : null,
    ipp_pm_quality_index_live: qualityIndex,
    inbox_severity_live: inboxSeverityForTier(tier),
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

  const current_tier   = c.req.query('current_tier');
  const status         = c.req.query('status');
  const workflow_class = c.req.query('workflow_class');
  const priority_class = c.req.query('priority_class');
  const project_id     = c.req.query('project_id');
  const facility_id    = c.req.query('facility_id');
  const breached       = c.req.query('breached');
  const reportable     = c.req.query('reportable');
  const signature_only = c.req.query('signature_only');
  const cod_only       = c.req.query('cod_only');
  const safety_only    = c.req.query('safety_only');

  let sql = 'SELECT * FROM oe_punch_list WHERE 1=1';
  const binds: unknown[] = [];
  if (current_tier)   { sql += ' AND current_tier = ?';   binds.push(current_tier); }
  if (status)         { sql += ' AND chain_status = ?';   binds.push(status); }
  if (workflow_class) { sql += ' AND workflow_class = ?'; binds.push(workflow_class); }
  if (priority_class) { sql += ' AND priority_class = ?'; binds.push(priority_class); }
  if (project_id)     { sql += ' AND project_id = ?';     binds.push(project_id); }
  if (facility_id)    { sql += ' AND facility_id = ?';    binds.push(facility_id); }
  if (cod_only === 'true')    sql += ' AND blocks_commercial_operation = 1';
  if (safety_only === 'true') sql += ' AND life_safety_critical = 1';

  sql += ' ORDER BY datetime(COALESCE(identified_at, created_at)) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PunchRow>();
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
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const closed_count     = items.filter((i) => i.chain_status === 'closed').length;
  const voided_count     = items.filter((i) => i.chain_status === 'voided').length;
  const withdrawn_count  = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count   = items.filter((i) => i.sla_breached).length;
  const reportable_total = items.filter((i) => i.is_reportable_flag).length;
  const signature_count  = items.filter((i) => i.signature_class_flag).length;
  const cod_count        = items.filter((i) => i.blocks_commercial_operation).length;
  const handover_count   = items.filter((i) => i.blocks_handover).length;
  const safety_count     = items.filter((i) => i.life_safety_critical).length;
  const warranty_count   = items.filter((i) => i.warranty_critical).length;

  const avg_quality_index = items.length > 0
    ? items.reduce((s, i) => s + (i.ipp_pm_quality_index_live || 0), 0) / items.length
    : 0;
  const avg_days_in_court = items.length > 0
    ? items.reduce((s, i) => s + (i.days_in_court_live || 0), 0) / items.length
    : 0;
  const total_remediation_cost_zar = items.reduce((s, i) => s + (i.remediation_cost_zar || 0), 0);
  const total_recovered_zar = items.reduce((s, i) => s + (i.recovered_from_contractor_zar || 0), 0);
  const avg_rejection_count = items.length > 0
    ? items.reduce((s, i) => s + (i.rejection_count || 0), 0) / items.length
    : 0;

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
      open_count,
      closed_count,
      voided_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      signature_count,
      cod_count,
      handover_count,
      safety_count,
      warranty_count,
      avg_quality_index,
      avg_days_in_court,
      avg_rejection_count,
      total_remediation_cost_zar,
      total_recovered_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_punch_list WHERE id = ?').bind(id).first<PunchRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_punch_list_events WHERE punch_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<PunchEventRow>();

  return c.json({
    success: true,
    data: {
      punch_list: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

async function transition(
  c: Context<HonoEnv>,
  action: PunchAction,
  bodyHandler?: (row: PunchRow, body: Record<string, unknown>) => Partial<PunchRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_punch_list WHERE id = ?').bind(id).first<PunchRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  const priorityClass = (overrides.priority_class as PunchPriorityClass | undefined) ?? row.priority_class;
  const workflowClass = (overrides.workflow_class as PunchWorkflowClass | undefined) ?? row.workflow_class;
  const blocksCommercialOperation = !!((overrides.blocks_commercial_operation as number | undefined) ?? row.blocks_commercial_operation);
  const blocksHandover = !!((overrides.blocks_handover as number | undefined) ?? row.blocks_handover);
  const lifeSafetyCritical = !!((overrides.life_safety_critical as number | undefined) ?? row.life_safety_critical);
  const warrantyCritical = !!((overrides.warranty_critical as number | undefined) ?? row.warranty_critical);
  const tier = tierFromInputs({
    priorityClass, workflowClass,
    blocksCommercialOperation, blocksHandover,
    lifeSafetyCritical, warrantyCritical,
  });
  overrides.current_tier = tier;
  overrides.authority_required = authorityFor(tier);

  const crosses = actionCrossesRegulator({
    action, tier,
    blocksCommercialOperation, blocksHandover,
    lifeSafetyCritical, warrantyCritical,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

  const newBallInCourt = ballInCourtFor(to);
  overrides.current_ball_in_court_party = newBallInCourt;

  if (action === 'reject_reinspection') {
    overrides.rejection_count = (row.rejection_count || 0) + 1;
  }
  if (action === 'reinspect') {
    overrides.reinspection_count = (row.reinspection_count || 0) + 1;
  }

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const setClauses: string[] = [
    'chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?',
  ];
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
    `UPDATE oe_punch_list SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `punch_list_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  const reasonCode = (overrides.reason_code as string | undefined) ?? reasonCodeFor(action);
  await c.env.DB.prepare(
    'INSERT INTO oe_punch_list_events (id, punch_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    specEventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action, reason_code: reasonCode }),
    nowIso,
  ).run();

  const eventName = `punch_list.${to}` as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'punch_list',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_punch_list WHERE id = ?').bind(id).first<PunchRow>();
  return c.json({ success: true, data: { punch_list: refreshed ? decorate(refreshed, now) : null } });
}

interface BasicBody { reason_code?: string; notes?: string }

interface AssessBody extends BasicBody {
  title?: string;
  narrative?: string;
  identified_location?: string;
  identified_zone?: string;
  identified_drawing_ref?: string;
  identified_specification_ref?: string;
  blocks_commercial_operation?: number;
  blocks_handover?: number;
  life_safety_critical?: number;
  warranty_critical?: number;
  cod_blocker_ref?: string;
  handover_blocker_ref?: string;
}

interface AssignBody extends BasicBody {
  contractor_id?: string;
  contractor_name?: string;
  remediation_cost_zar?: number;
}

interface RemediationBody extends BasicBody {
  response_text?: string;
  photo_evidence_count?: number;
  root_cause_documented?: number;
}

interface ReinspectBody extends BasicBody {
  response_text?: string;
  commissioning_evidence?: number;
  photo_evidence_count?: number;
}

interface AcceptBody extends BasicBody { response_text?: string }

interface VoidBody extends BasicBody { voided_reason?: string }
interface WithdrawBody extends BasicBody { withdrawn_reason?: string }

app.post('/:id/assess', async (c) => transition(c, 'assess', (_row, body) => {
  const b = body as Partial<AssessBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.title === 'string') out.title = b.title;
  if (typeof b.narrative === 'string') out.narrative = b.narrative;
  if (typeof b.identified_location === 'string') out.identified_location = b.identified_location;
  if (typeof b.identified_zone === 'string') out.identified_zone = b.identified_zone;
  if (typeof b.identified_drawing_ref === 'string') out.identified_drawing_ref = b.identified_drawing_ref;
  if (typeof b.identified_specification_ref === 'string') out.identified_specification_ref = b.identified_specification_ref;
  if (typeof b.blocks_commercial_operation === 'number') out.blocks_commercial_operation = b.blocks_commercial_operation;
  if (typeof b.blocks_handover === 'number') out.blocks_handover = b.blocks_handover;
  if (typeof b.life_safety_critical === 'number') out.life_safety_critical = b.life_safety_critical;
  if (typeof b.warranty_critical === 'number') out.warranty_critical = b.warranty_critical;
  if (typeof b.cod_blocker_ref === 'string') out.cod_blocker_ref = b.cod_blocker_ref;
  if (typeof b.handover_blocker_ref === 'string') out.handover_blocker_ref = b.handover_blocker_ref;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/assign', async (c) => transition(c, 'assign', (_row, body) => {
  const b = body as Partial<AssignBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.contractor_id === 'string') out.contractor_id = b.contractor_id;
  if (typeof b.contractor_name === 'string') out.contractor_name = b.contractor_name;
  if (typeof b.remediation_cost_zar === 'number') out.remediation_cost_zar = b.remediation_cost_zar;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/begin-remediation', async (c) => transition(c, 'begin_remediation', (_row, body) => {
  const b = body as Partial<RemediationBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.response_text === 'string') out.response_text = b.response_text;
  if (typeof b.photo_evidence_count === 'number') out.photo_evidence_count = b.photo_evidence_count;
  if (typeof b.root_cause_documented === 'number') out.root_cause_documented = b.root_cause_documented;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/request-reinspection', async (c) => transition(c, 'request_reinspection', (_row, body) => {
  const b = body as Partial<RemediationBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.response_text === 'string') out.response_text = b.response_text;
  if (typeof b.photo_evidence_count === 'number') out.photo_evidence_count = b.photo_evidence_count;
  if (typeof b.root_cause_documented === 'number') out.root_cause_documented = b.root_cause_documented;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/reinspect', async (c) => transition(c, 'reinspect', (_row, body) => {
  const b = body as Partial<ReinspectBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.response_text === 'string') out.response_text = b.response_text;
  if (typeof b.commissioning_evidence === 'number') out.commissioning_evidence = b.commissioning_evidence;
  if (typeof b.photo_evidence_count === 'number') out.photo_evidence_count = b.photo_evidence_count;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/accept', async (c) => transition(c, 'accept', (_row, body) => {
  const b = body as Partial<AcceptBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.response_text === 'string') out.response_text = b.response_text;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/reject-reinspection', async (c) => transition(c, 'reject_reinspection', (_row, body) => {
  const b = body as Partial<AcceptBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.response_text === 'string') out.response_text = b.response_text;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/park', async (c) => transition(c, 'park', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resume', async (c) => transition(c, 'resume', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/void', async (c) => transition(c, 'void', (_row, body) => {
  const b = body as Partial<VoidBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.voided_reason === 'string') out.voided_reason = b.voided_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<PunchRow> = {};
  if (typeof b.withdrawn_reason === 'string') out.withdrawn_reason = b.withdrawn_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function punchListSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_punch_list
     WHERE chain_status NOT IN ('closed','voided','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<PunchRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_punch_list
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `punch_list_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_punch_list_events (id, punch_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'punch_list.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    // SLA breach crosses regulator on high+critical when COD blocker or life safety.
    if (
      isHighTier(row.current_tier) &&
      (row.blocks_commercial_operation || row.life_safety_critical)
    ) {
      await fireCascade({
        event: 'punch_list.sla_breached',
        actor_id: 'system',
        entity_type: 'punch_list',
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
