// Wave 99 — IPP Quality / Inspection & Test Plan (ITP). Mounted at
// /api/ipp/itp/chain.
//
// The forward-looking quality register a best-in-class IPP-PM stack drives at
// every construction stage. Beats Procore Quality + Aconex ITR + Bentley
// AssetWise + e-Builder ITR + Autodesk Construction Cloud Quality + Bluebeam
// Studio Quality. Every row is LIVE-scored on every fetch against an IPP
// quality battery (within-SLA, reinspection count, photo evidence, witness
// attended, first-time pass, root cause, ball-in-court).
//
// Write {admin, ipp, ipp_developer, wind}. Read all 9 personas.
//
// SIGNATURE (W99 — NERSA §C-5 + REIPPPP + OHSA s24 + IEC 61508):
//   submit                 -> regulator EVERY tier when safety_critical_test
//   approve                -> regulator EVERY tier when blocks_commercial_operation
//   record_result (failed) -> regulator EVERY tier when safety_critical_test
//                             OR blocks_commercial_operation
//   void                   -> regulator EVERY tier when blocks_commercial_operation
//                             OR safety_critical_test
//   sla_breached           -> regulator EVERY tier when safety_critical_test;
//                             high+critical when blocks_commercial_operation

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
  ippQualityIndex,
  predictedCloseDate,
  partyForAction,
  eventTypeFor as specEventTypeFor,
  inboxSeverityForTier,
  SLA_MINUTES,
  type ItpStatus,
  type ItpAction,
  type ItpTier,
  type ItpWorkflowClass,
  type ItpPriorityClass,
} from '../utils/itp-spec';

const READ_ROLES = new Set([
  'admin', 'ipp', 'ipp_developer', 'wind',
  'lender', 'regulator', 'offtaker',
  'grid_operator', 'carbon_fund', 'trader', 'support',
  'epc_contractor',
]);

const WRITE_ROLES = new Set(['admin', 'ipp', 'ipp_developer', 'wind']);

interface ItpRow {
  id: string;
  itp_number: string;
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
  workflow_class: ItpWorkflowClass;
  priority_class: ItpPriorityClass;
  construction_stage: string | null;
  hold_point_ref: string | null;
  drawing_ref: string | null;
  specification_ref: string | null;
  acceptance_criteria: string | null;
  identified_at: string | null;
  blocks_handover_milestone: number;
  blocks_commercial_operation: number;
  safety_critical_test: number;
  regulator_hold_point: number;
  current_tier: ItpTier;
  authority_required: string | null;
  reinspection_count: number;
  photo_evidence_count: number;
  witness_attended: number;
  first_time_pass: number;
  root_cause_documented: number;
  inspection_cost_zar: number | null;
  rework_cost_zar: number | null;
  parent_itp_id: string | null;
  cod_blocker_ref: string | null;
  handover_blocker_ref: string | null;
  regulator_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  rejected_reason: string | null;
  voided_reason: string | null;
  withdrawn_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  requester_party: string | null;
  approver_party: string | null;
  witness_party: string | null;
  chain_status: ItpStatus;
  submitted_at: string | null;
  under_review_at: string | null;
  approved_at: string | null;
  released_to_site_at: string | null;
  inspection_scheduled_at: string | null;
  in_inspection_at: string | null;
  witness_attended_at: string | null;
  result_recorded_at: string | null;
  passed_at: string | null;
  failed_at: string | null;
  corrective_action_at: string | null;
  released_for_use_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  voided_at: string | null;
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

interface ItpEventRow {
  id: string;
  itp_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ItpStatus, string | null> = {
  itp_drafted:          null,
  submitted:            'submitted_at',
  under_review:         'under_review_at',
  approved:             'approved_at',
  released_to_site:     'released_to_site_at',
  inspection_scheduled: 'inspection_scheduled_at',
  in_inspection:        'in_inspection_at',
  witness_attended:     'witness_attended_at',
  result_recorded:      'result_recorded_at',
  passed:               'passed_at',
  failed:               'failed_at',
  corrective_action:    'corrective_action_at',
  released_for_use:     'released_for_use_at',
  archived:             'archived_at',
  rejected:             'rejected_at',
  withdrawn:            'withdrawn_at',
  voided:               'voided_at',
};

function reasonCodeFor(action: ItpAction): string {
  switch (action) {
    case 'submit':                  return 'SUBMITTED';
    case 'open_review':             return 'REVIEW_OPEN';
    case 'approve':                 return 'APPROVED';
    case 'release':                 return 'RELEASED_TO_SITE';
    case 'schedule_inspection':     return 'INSPECTION_SCHEDULED';
    case 'begin_inspection':        return 'INSPECTION_BEGUN';
    case 'attend_witness':          return 'WITNESS_ATTENDED';
    case 'record_result':           return 'RESULT_RECORDED';
    case 'pass':                    return 'PASSED';
    case 'fail':                    return 'FAILED';
    case 'raise_corrective_action': return 'CORRECTIVE_ACTION_RAISED';
    case 're_inspect':              return 'RE_INSPECTION';
    case 'release_for_use':         return 'RELEASED_FOR_USE';
    case 'archive':                 return 'ARCHIVED';
    case 'reject':                  return 'REJECTED';
    case 'withdraw':                return 'WITHDRAWN';
    case 'void':                    return 'VOIDED';
  }
}

function slaDeadlineFor(status: ItpStatus, tier: ItpTier, from: Date): Date | null {
  const minutes = slaMinutesFor(status, tier);
  if (minutes == null) return null;
  return new Date(from.getTime() + minutes * 60_000);
}

function decorate(row: ItpRow, now: Date) {
  const status = row.chain_status;
  const tier = row.current_tier;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const tierLive = tierFromInputs({
    priorityClass: row.priority_class,
    workflowClass: row.workflow_class,
    blocksHandoverMilestone: !!row.blocks_handover_milestone,
    blocksCommercialOperation: !!row.blocks_commercial_operation,
    safetyCriticalTest: !!row.safety_critical_test,
    regulatorHoldPoint: !!row.regulator_hold_point,
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
  const qualityIndex = ippQualityIndex({
    withinSla,
    reinspectionCount: row.reinspection_count || 0,
    ballInCourtClear: ballClear,
    photoEvidenceCount: row.photo_evidence_count || 0,
    witnessAttended: !!row.witness_attended,
    firstTimePass: !!row.first_time_pass,
    rootCauseDocumented: !!row.root_cause_documented,
  });

  const floorApplied = !!(
    row.blocks_handover_milestone || row.blocks_commercial_operation
    || row.safety_critical_test || row.regulator_hold_point
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
      row.blocks_commercial_operation || row.safety_critical_test
    ),
    authority_required_live: authorityFor(tier),
    tier_live: tierLive,
    ball_in_court_party_live: ballInCourt,
    days_in_court_live: daysInCourt,
    days_open_live: daysOpen,
    predicted_close_date_live: predictedClose ? predictedClose.toISOString() : null,
    ipp_quality_index_live: qualityIndex,
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
  const hold_only      = c.req.query('hold_only');

  let sql = 'SELECT * FROM oe_itp_inspection WHERE 1=1';
  const binds: unknown[] = [];
  if (current_tier)   { sql += ' AND current_tier = ?';   binds.push(current_tier); }
  if (status)         { sql += ' AND chain_status = ?';   binds.push(status); }
  if (workflow_class) { sql += ' AND workflow_class = ?'; binds.push(workflow_class); }
  if (priority_class) { sql += ' AND priority_class = ?'; binds.push(priority_class); }
  if (project_id)     { sql += ' AND project_id = ?';     binds.push(project_id); }
  if (facility_id)    { sql += ' AND facility_id = ?';    binds.push(facility_id); }
  if (cod_only === 'true')    sql += ' AND blocks_commercial_operation = 1';
  if (safety_only === 'true') sql += ' AND safety_critical_test = 1';
  if (hold_only === 'true')   sql += ' AND regulator_hold_point = 1';

  sql += ' ORDER BY datetime(COALESCE(identified_at, created_at)) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ItpRow>();
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
  const archived_count   = items.filter((i) => i.chain_status === 'archived').length;
  const rejected_count   = items.filter((i) => i.chain_status === 'rejected').length;
  const withdrawn_count  = items.filter((i) => i.chain_status === 'withdrawn').length;
  const voided_count     = items.filter((i) => i.chain_status === 'voided').length;
  const breached_count   = items.filter((i) => i.sla_breached).length;
  const reportable_total = items.filter((i) => i.is_reportable_flag).length;
  const signature_count  = items.filter((i) => i.signature_class_flag).length;
  const cod_count        = items.filter((i) => i.blocks_commercial_operation).length;
  const handover_count   = items.filter((i) => i.blocks_handover_milestone).length;
  const safety_count     = items.filter((i) => i.safety_critical_test).length;
  const hold_count       = items.filter((i) => i.regulator_hold_point).length;
  const witness_count    = items.filter((i) => i.witness_attended).length;
  const first_time_pass_count = items.filter((i) => i.first_time_pass).length;

  const avg_quality_index = items.length > 0
    ? items.reduce((s, i) => s + (i.ipp_quality_index_live || 0), 0) / items.length
    : 0;
  const avg_days_in_court = items.length > 0
    ? items.reduce((s, i) => s + (i.days_in_court_live || 0), 0) / items.length
    : 0;
  const total_inspection_cost_zar = items.reduce((s, i) => s + (i.inspection_cost_zar || 0), 0);
  const total_rework_cost_zar = items.reduce((s, i) => s + (i.rework_cost_zar || 0), 0);
  const witness_attendance_rate = items.length > 0
    ? witness_count / items.length
    : 0;
  const first_time_pass_rate = items.length > 0
    ? first_time_pass_count / items.length
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
      archived_count,
      rejected_count,
      withdrawn_count,
      voided_count,
      breached: breached_count,
      reportable_total,
      signature_count,
      cod_count,
      handover_count,
      safety_count,
      hold_count,
      witness_count,
      first_time_pass_count,
      avg_quality_index,
      avg_days_in_court,
      total_inspection_cost_zar,
      total_rework_cost_zar,
      witness_attendance_rate,
      first_time_pass_rate,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_itp_inspection WHERE id = ?').bind(id).first<ItpRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_itp_inspection_events WHERE itp_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ItpEventRow>();

  return c.json({
    success: true,
    data: {
      itp: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

async function transition(
  c: Context<HonoEnv>,
  action: ItpAction,
  bodyHandler?: (row: ItpRow, body: Record<string, unknown>) => Partial<ItpRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_itp_inspection WHERE id = ?').bind(id).first<ItpRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  const priorityClass = (overrides.priority_class as ItpPriorityClass | undefined) ?? row.priority_class;
  const workflowClass = (overrides.workflow_class as ItpWorkflowClass | undefined) ?? row.workflow_class;
  const blocksHandoverMilestone = !!((overrides.blocks_handover_milestone as number | undefined) ?? row.blocks_handover_milestone);
  const blocksCommercialOperation = !!((overrides.blocks_commercial_operation as number | undefined) ?? row.blocks_commercial_operation);
  const safetyCriticalTest = !!((overrides.safety_critical_test as number | undefined) ?? row.safety_critical_test);
  const regulatorHoldPoint = !!((overrides.regulator_hold_point as number | undefined) ?? row.regulator_hold_point);
  const tier = tierFromInputs({
    priorityClass, workflowClass,
    blocksHandoverMilestone, blocksCommercialOperation,
    safetyCriticalTest, regulatorHoldPoint,
  });
  overrides.current_tier = tier;
  overrides.authority_required = authorityFor(tier);

  // result_recorded(fail) crosses regulator on the SAME action as record_result
  // (fail) — we re-derive the flag using whichever action carries the failure.
  const resultFailed = action === 'fail'
    || (action === 'record_result' && (overrides.result_text as string | undefined)?.toLowerCase().includes('fail'));
  const crosses = actionCrossesRegulator({
    action, tier,
    blocksHandoverMilestone, blocksCommercialOperation,
    safetyCriticalTest, regulatorHoldPoint,
    resultFailed: !!resultFailed,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

  const newBallInCourt = ballInCourtFor(to);
  overrides.current_ball_in_court_party = newBallInCourt;

  if (action === 're_inspect') {
    overrides.reinspection_count = (row.reinspection_count || 0) + 1;
  }
  if (action === 'attend_witness') {
    overrides.witness_attended = 1;
  }
  if (action === 'pass' && (row.reinspection_count || 0) === 0) {
    overrides.first_time_pass = 1;
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
    `UPDATE oe_itp_inspection SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `itp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  const reasonCode = (overrides.reason_code as string | undefined) ?? reasonCodeFor(action);
  await c.env.DB.prepare(
    'INSERT INTO oe_itp_inspection_events (id, itp_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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

  const eventName = `itp.${to}` as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'itp',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_itp_inspection WHERE id = ?').bind(id).first<ItpRow>();
  return c.json({ success: true, data: { itp: refreshed ? decorate(refreshed, now) : null } });
}

interface BasicBody { reason_code?: string; notes?: string }

interface SubmitBody extends BasicBody {
  title?: string;
  narrative?: string;
  construction_stage?: string;
  hold_point_ref?: string;
  drawing_ref?: string;
  specification_ref?: string;
  acceptance_criteria?: string;
  blocks_handover_milestone?: number;
  blocks_commercial_operation?: number;
  safety_critical_test?: number;
  regulator_hold_point?: number;
  cod_blocker_ref?: string;
  handover_blocker_ref?: string;
}

interface ApproveBody extends BasicBody {
  inspection_cost_zar?: number;
}

interface ScheduleBody extends BasicBody {
  witness_party?: string;
}

interface RecordBody extends BasicBody {
  result_text?: string;
  photo_evidence_count?: number;
  root_cause_documented?: number;
}

interface FailBody extends BasicBody {
  result_text?: string;
  rework_cost_zar?: number;
}

interface RejectBody extends BasicBody { rejected_reason?: string }
interface VoidBody extends BasicBody { voided_reason?: string }
interface WithdrawBody extends BasicBody { withdrawn_reason?: string }

app.post('/:id/submit', async (c) => transition(c, 'submit', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.title === 'string') out.title = b.title;
  if (typeof b.narrative === 'string') out.narrative = b.narrative;
  if (typeof b.construction_stage === 'string') out.construction_stage = b.construction_stage;
  if (typeof b.hold_point_ref === 'string') out.hold_point_ref = b.hold_point_ref;
  if (typeof b.drawing_ref === 'string') out.drawing_ref = b.drawing_ref;
  if (typeof b.specification_ref === 'string') out.specification_ref = b.specification_ref;
  if (typeof b.acceptance_criteria === 'string') out.acceptance_criteria = b.acceptance_criteria;
  if (typeof b.blocks_handover_milestone === 'number') out.blocks_handover_milestone = b.blocks_handover_milestone;
  if (typeof b.blocks_commercial_operation === 'number') out.blocks_commercial_operation = b.blocks_commercial_operation;
  if (typeof b.safety_critical_test === 'number') out.safety_critical_test = b.safety_critical_test;
  if (typeof b.regulator_hold_point === 'number') out.regulator_hold_point = b.regulator_hold_point;
  if (typeof b.cod_blocker_ref === 'string') out.cod_blocker_ref = b.cod_blocker_ref;
  if (typeof b.handover_blocker_ref === 'string') out.handover_blocker_ref = b.handover_blocker_ref;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/open-review', async (c) => transition(c, 'open_review', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/approve', async (c) => transition(c, 'approve', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.inspection_cost_zar === 'number') out.inspection_cost_zar = b.inspection_cost_zar;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/release', async (c) => transition(c, 'release', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/schedule-inspection', async (c) => transition(c, 'schedule_inspection', (_row, body) => {
  const b = body as Partial<ScheduleBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.witness_party === 'string') out.witness_party = b.witness_party;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/begin-inspection', async (c) => transition(c, 'begin_inspection', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/attend-witness', async (c) => transition(c, 'attend_witness', (_row, body) => {
  const b = body as Partial<ScheduleBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.witness_party === 'string') out.witness_party = b.witness_party;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/record-result', async (c) => transition(c, 'record_result', (_row, body) => {
  const b = body as Partial<RecordBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.result_text === 'string') out.result_text = b.result_text;
  if (typeof b.photo_evidence_count === 'number') out.photo_evidence_count = b.photo_evidence_count;
  if (typeof b.root_cause_documented === 'number') out.root_cause_documented = b.root_cause_documented;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/pass', async (c) => transition(c, 'pass', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/fail', async (c) => transition(c, 'fail', (_row, body) => {
  const b = body as Partial<FailBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.result_text === 'string') out.result_text = b.result_text;
  if (typeof b.rework_cost_zar === 'number') out.rework_cost_zar = b.rework_cost_zar;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/raise-corrective-action', async (c) => transition(c, 'raise_corrective_action', (_row, body) => {
  const b = body as Partial<FailBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.result_text === 'string') out.result_text = b.result_text;
  if (typeof b.rework_cost_zar === 'number') out.rework_cost_zar = b.rework_cost_zar;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/re-inspect', async (c) => transition(c, 're_inspect', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/release-for-use', async (c) => transition(c, 'release_for_use', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.rejected_reason === 'string') out.rejected_reason = b.rejected_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.withdrawn_reason === 'string') out.withdrawn_reason = b.withdrawn_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/void', async (c) => transition(c, 'void', (_row, body) => {
  const b = body as Partial<VoidBody>;
  const out: Partial<ItpRow> = {};
  if (typeof b.voided_reason === 'string') out.voided_reason = b.voided_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function itpSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_itp_inspection
     WHERE chain_status NOT IN ('archived','rejected','withdrawn','voided')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ItpRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_itp_inspection
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `itp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_itp_inspection_events (id, itp_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'itp.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    // SLA breach crosses regulator EVERY tier on safety_critical_test;
    // high+critical when blocks_commercial_operation.
    const safetyAlways = !!row.safety_critical_test;
    const codHighTier = !!row.blocks_commercial_operation && isHighTier(row.current_tier);
    if (safetyAlways || codHighTier) {
      await fireCascade({
        event: 'itp.sla_breached',
        actor_id: 'system',
        entity_type: 'itp',
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
