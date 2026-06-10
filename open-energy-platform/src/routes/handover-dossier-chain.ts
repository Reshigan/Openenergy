// Wave 100 — IPP Mechanical / Electrical Handover Dossier + Turnover-to-
// Operations. Mounted at /api/ipp/handover-dossier/chain.
//
// The construction-to-O&M turnover package a best-in-class IPP-PM stack ships
// at practical completion. Beats Procore Handover + Aconex Handover + BIM 360
// Handover + Bentley ProjectWise/AssetWise + e-Builder Closeout + ServiceNow
// Handover + SAP S/4HANA Asset Handover + IBM Maximo Asset Handover. Every
// row is LIVE-scored on every fetch against a 0-130 completeness battery.
//
// Write {admin, ipp, ipp_developer, wind, support}. Read all 9 personas.
//
// SIGNATURE (W100 — REIPPPP O&M handover + NERSA §C-5 + OHSA s24):
//   approve                -> regulator EVERY tier when blocks_warranty_start
//   transfer_to_operations -> regulator EVERY tier when blocks_warranty_start
//                             OR blocks_om_handover
//   void                   -> regulator EVERY tier when incomplete_as_built
//                             OR untransferred_spares
//   sla_breached           -> regulator EVERY tier when blocks_warranty_start;
//                             high+critical when blocks_om_handover

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
  handoverCompletenessIndex,
  predictedCloseDate,
  partyForAction,
  eventTypeFor as specEventTypeFor,
  inboxSeverityForTier,
  SLA_MINUTES,
  type HandoverStatus,
  type HandoverAction,
  type HandoverTier,
  type HandoverWorkflowClass,
  type HandoverPriorityClass,
} from '../utils/handover-dossier-spec';

const READ_ROLES = new Set([
  'admin', 'ipp', 'ipp_developer', 'wind', 'support',
  'lender', 'regulator', 'offtaker',
  'grid_operator', 'carbon_fund', 'trader',
]);

const WRITE_ROLES = new Set([
  'admin', 'ipp', 'ipp_developer', 'wind', 'support',
]);

interface HandoverRow {
  id: string;
  dossier_number: string;
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
  independent_engineer_party_id: string | null;
  independent_engineer_party_name: string | null;
  workflow_class: HandoverWorkflowClass;
  priority_class: HandoverPriorityClass;
  dossier_scope: string | null;
  drawing_register_ref: string | null;
  spec_register_ref: string | null;
  acceptance_criteria: string | null;
  compiled_at: string | null;
  blocks_warranty_start: number;
  blocks_om_handover: number;
  incomplete_as_built: number;
  untransferred_spares: number;
  current_tier: HandoverTier;
  authority_required: string | null;
  revision_count: number;
  punch_count_open: number;
  as_built_completeness_pct: number;
  spare_parts_completeness_pct: number;
  training_completion_pct: number;
  witnessed_acceptance_clear: number;
  warranty_activated: number;
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  warranty_admin_party_id: string | null;
  warranty_admin_party_name: string | null;
  dossier_cost_zar: number | null;
  handover_cost_zar: number | null;
  parent_dossier_id: string | null;
  om_handover_blocker_ref: string | null;
  warranty_blocker_ref: string | null;
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
  chain_status: HandoverStatus;
  submitted_at: string | null;
  under_review_at: string | null;
  revision_required_at: string | null;
  approved_at: string | null;
  witnessed_acceptance_scheduled_at: string | null;
  witnessed_acceptance_at: string | null;
  punch_remediated_at: string | null;
  training_transferred_at: string | null;
  warranty_activated_at: string | null;
  operations_owned_at: string | null;
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

interface HandoverEventRow {
  id: string;
  dossier_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<HandoverStatus, string | null> = {
  dossier_compiled:               null,
  submitted:                      'submitted_at',
  under_review:                   'under_review_at',
  revision_required:              'revision_required_at',
  approved:                       'approved_at',
  witnessed_acceptance_scheduled: 'witnessed_acceptance_scheduled_at',
  witnessed_acceptance:           'witnessed_acceptance_at',
  punch_remediated:               'punch_remediated_at',
  training_transferred:           'training_transferred_at',
  warranty_activated:             'warranty_activated_at',
  operations_owned:               'operations_owned_at',
  archived:                       'archived_at',
  rejected:                       'rejected_at',
  withdrawn:                      'withdrawn_at',
  voided:                         'voided_at',
};

function reasonCodeFor(action: HandoverAction): string {
  switch (action) {
    case 'submit':                        return 'SUBMITTED';
    case 'open_review':                   return 'REVIEW_OPEN';
    case 'require_revision':              return 'REVISION_REQUIRED';
    case 'revise_and_resubmit':           return 'REVISION_SUBMITTED';
    case 'approve':                       return 'APPROVED';
    case 'schedule_witnessed_acceptance': return 'WITNESSED_ACCEPTANCE_SCHEDULED';
    case 'complete_witnessed_acceptance': return 'WITNESSED_ACCEPTANCE_COMPLETED';
    case 'remediate_punch':               return 'PUNCH_REMEDIATED';
    case 'transfer_training':             return 'TRAINING_TRANSFERRED';
    case 'activate_warranty':             return 'WARRANTY_ACTIVATED';
    case 'transfer_to_operations':        return 'OPERATIONS_OWNED';
    case 'archive':                       return 'ARCHIVED';
    case 'reject':                        return 'REJECTED';
    case 'withdraw':                      return 'WITHDRAWN';
    case 'void':                          return 'VOIDED';
  }
}

function slaDeadlineFor(status: HandoverStatus, tier: HandoverTier, from: Date): Date | null {
  const minutes = slaMinutesFor(status, tier);
  if (minutes == null) return null;
  return new Date(from.getTime() + minutes * 60_000);
}

function decorate(row: HandoverRow, now: Date) {
  const status = row.chain_status;
  const tier = row.current_tier;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const tierLive = tierFromInputs({
    priorityClass: row.priority_class,
    workflowClass: row.workflow_class,
    blocksWarrantyStart: !!row.blocks_warranty_start,
    blocksOmHandover: !!row.blocks_om_handover,
    incompleteAsBuilt: !!row.incomplete_as_built,
    untransferredSpares: !!row.untransferred_spares,
  });

  const ballInCourt = ballInCourtFor(status);
  const stateEnteredCol = TIMESTAMP_COLUMN[status];
  const stateEnteredIso = stateEnteredCol
    ? (row[stateEnteredCol] as string | null)
    : (row.compiled_at || row.created_at);
  const stateEnteredAt = stateEnteredIso ? new Date(stateEnteredIso) : now;
  const daysInCourt = Math.floor((now.getTime() - stateEnteredAt.getTime()) / (24 * 60 * 60 * 1000));
  const openIso = row.compiled_at || row.created_at;
  const daysOpen = Math.floor((now.getTime() - new Date(openIso).getTime()) / (24 * 60 * 60 * 1000));

  const predictedClose = predictedCloseDate(status, tierLive, stateEnteredAt);
  const urgency = urgencyBandFor(minutesUntilSla, isTerminal(status));

  const withinSla = (minutesUntilSla == null) || minutesUntilSla >= 0;
  const ballClear = ballInCourt != null;
  const completenessIndex = handoverCompletenessIndex({
    withinSla,
    revisionCount: row.revision_count || 0,
    ballInCourtClear: ballClear,
    asBuiltCompletenessPct: row.as_built_completeness_pct || 0,
    sparePartsCompletenessPct: row.spare_parts_completeness_pct || 0,
    trainingCompletionPct: row.training_completion_pct || 0,
    witnessedAcceptanceClear: !!row.witnessed_acceptance_clear,
    warrantyActivated: !!row.warranty_activated,
  });

  const floorApplied = !!(
    row.blocks_warranty_start || row.blocks_om_handover
    || row.incomplete_as_built || row.untransferred_spares
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
      row.blocks_warranty_start || row.blocks_om_handover
    ),
    authority_required_live: authorityFor(tier),
    tier_live: tierLive,
    ball_in_court_party_live: ballInCourt,
    days_in_court_live: daysInCourt,
    days_open_live: daysOpen,
    predicted_close_date_live: predictedClose ? predictedClose.toISOString() : null,
    handover_completeness_index_live: completenessIndex,
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
  const warranty_only  = c.req.query('warranty_only');
  const om_only        = c.req.query('om_only');
  const asbuilt_only   = c.req.query('asbuilt_only');
  const spares_only    = c.req.query('spares_only');

  let sql = 'SELECT * FROM oe_handover_dossier WHERE 1=1';
  const binds: unknown[] = [];
  if (current_tier)   { sql += ' AND current_tier = ?';   binds.push(current_tier); }
  if (status)         { sql += ' AND chain_status = ?';   binds.push(status); }
  if (workflow_class) { sql += ' AND workflow_class = ?'; binds.push(workflow_class); }
  if (priority_class) { sql += ' AND priority_class = ?'; binds.push(priority_class); }
  if (project_id)     { sql += ' AND project_id = ?';     binds.push(project_id); }
  if (facility_id)    { sql += ' AND facility_id = ?';    binds.push(facility_id); }
  if (warranty_only === 'true') sql += ' AND blocks_warranty_start = 1';
  if (om_only === 'true')       sql += ' AND blocks_om_handover = 1';
  if (asbuilt_only === 'true')  sql += ' AND incomplete_as_built = 1';
  if (spares_only === 'true')   sql += ' AND untransferred_spares = 1';

  sql += ' ORDER BY datetime(COALESCE(compiled_at, created_at)) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<HandoverRow>();
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
  const warranty_count   = items.filter((i) => i.blocks_warranty_start).length;
  const om_count         = items.filter((i) => i.blocks_om_handover).length;
  const asbuilt_count    = items.filter((i) => i.incomplete_as_built).length;
  const spares_count     = items.filter((i) => i.untransferred_spares).length;
  const witness_clear_count    = items.filter((i) => i.witnessed_acceptance_clear).length;
  const warranty_active_count  = items.filter((i) => i.warranty_activated).length;

  const avg_completeness_index = items.length > 0
    ? items.reduce((s, i) => s + (i.handover_completeness_index_live || 0), 0) / items.length
    : 0;
  const avg_days_in_court = items.length > 0
    ? items.reduce((s, i) => s + (i.days_in_court_live || 0), 0) / items.length
    : 0;
  const avg_as_built_pct = items.length > 0
    ? items.reduce((s, i) => s + (i.as_built_completeness_pct || 0), 0) / items.length
    : 0;
  const avg_spares_pct = items.length > 0
    ? items.reduce((s, i) => s + (i.spare_parts_completeness_pct || 0), 0) / items.length
    : 0;
  const avg_training_pct = items.length > 0
    ? items.reduce((s, i) => s + (i.training_completion_pct || 0), 0) / items.length
    : 0;
  const total_dossier_cost_zar  = items.reduce((s, i) => s + (i.dossier_cost_zar  || 0), 0);
  const total_handover_cost_zar = items.reduce((s, i) => s + (i.handover_cost_zar || 0), 0);

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
      warranty_count,
      om_count,
      asbuilt_count,
      spares_count,
      witness_clear_count,
      warranty_active_count,
      avg_completeness_index,
      avg_days_in_court,
      avg_as_built_pct,
      avg_spares_pct,
      avg_training_pct,
      total_dossier_cost_zar,
      total_handover_cost_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_handover_dossier WHERE id = ?').bind(id).first<HandoverRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_handover_dossier_events WHERE dossier_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<HandoverEventRow>();

  return c.json({
    success: true,
    data: {
      dossier: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

async function transition(
  c: Context<HonoEnv>,
  action: HandoverAction,
  bodyHandler?: (row: HandoverRow, body: Record<string, unknown>) => Partial<HandoverRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_handover_dossier WHERE id = ?').bind(id).first<HandoverRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  const priorityClass = (overrides.priority_class as HandoverPriorityClass | undefined) ?? row.priority_class;
  const workflowClass = (overrides.workflow_class as HandoverWorkflowClass | undefined) ?? row.workflow_class;
  const blocksWarrantyStart = !!((overrides.blocks_warranty_start as number | undefined) ?? row.blocks_warranty_start);
  const blocksOmHandover    = !!((overrides.blocks_om_handover    as number | undefined) ?? row.blocks_om_handover);
  const incompleteAsBuilt   = !!((overrides.incomplete_as_built   as number | undefined) ?? row.incomplete_as_built);
  const untransferredSpares = !!((overrides.untransferred_spares  as number | undefined) ?? row.untransferred_spares);
  const tier = tierFromInputs({
    priorityClass, workflowClass,
    blocksWarrantyStart, blocksOmHandover,
    incompleteAsBuilt, untransferredSpares,
  });
  overrides.current_tier = tier;
  overrides.authority_required = authorityFor(tier);

  const crosses = actionCrossesRegulator({
    action, tier,
    blocksWarrantyStart, blocksOmHandover,
    incompleteAsBuilt, untransferredSpares,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

  const newBallInCourt = ballInCourtFor(to);
  overrides.current_ball_in_court_party = newBallInCourt;

  if (action === 'require_revision' || action === 'revise_and_resubmit') {
    overrides.revision_count = (row.revision_count || 0) + 1;
  }
  if (action === 'complete_witnessed_acceptance') {
    // Witness clear when no punch list items were raised against the witness.
    const wc = (body.witnessed_acceptance_clear as number | undefined);
    if (typeof wc === 'number') overrides.witnessed_acceptance_clear = wc;
  }
  if (action === 'activate_warranty') {
    overrides.warranty_activated = 1;
    const ws = (body.warranty_start_date as string | undefined);
    const we = (body.warranty_end_date   as string | undefined);
    if (typeof ws === 'string') overrides.warranty_start_date = ws;
    if (typeof we === 'string') overrides.warranty_end_date = we;
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
    `UPDATE oe_handover_dossier SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `handover_dossier_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  const reasonCode = (overrides.reason_code as string | undefined) ?? reasonCodeFor(action);
  await c.env.DB.prepare(
    'INSERT INTO oe_handover_dossier_events (id, dossier_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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

  const eventName = `handover_dossier.${to}` as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'handover_dossier',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_handover_dossier WHERE id = ?').bind(id).first<HandoverRow>();
  return c.json({ success: true, data: { dossier: refreshed ? decorate(refreshed, now) : null } });
}

interface BasicBody { reason_code?: string; notes?: string }

interface SubmitBody extends BasicBody {
  title?: string;
  narrative?: string;
  dossier_scope?: string;
  drawing_register_ref?: string;
  spec_register_ref?: string;
  acceptance_criteria?: string;
  blocks_warranty_start?: number;
  blocks_om_handover?: number;
  incomplete_as_built?: number;
  untransferred_spares?: number;
  as_built_completeness_pct?: number;
  spare_parts_completeness_pct?: number;
  training_completion_pct?: number;
  om_handover_blocker_ref?: string;
  warranty_blocker_ref?: string;
}

interface ApproveBody extends BasicBody {
  dossier_cost_zar?: number;
}

interface ScheduleBody extends BasicBody {
  witness_party?: string;
}

interface WitnessBody extends BasicBody {
  witnessed_acceptance_clear?: number;
  punch_count_open?: number;
}

interface RemediateBody extends BasicBody {
  punch_count_open?: number;
  handover_cost_zar?: number;
}

interface TrainingBody extends BasicBody {
  training_completion_pct?: number;
}

interface WarrantyBody extends BasicBody {
  warranty_start_date?: string;
  warranty_end_date?: string;
  warranty_admin_party_id?: string;
  warranty_admin_party_name?: string;
}

interface RejectBody  extends BasicBody { rejected_reason?:  string }
interface VoidBody    extends BasicBody { voided_reason?:    string }
interface WithdrawBody extends BasicBody { withdrawn_reason?: string }

app.post('/:id/submit', async (c) => transition(c, 'submit', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.title === 'string') out.title = b.title;
  if (typeof b.narrative === 'string') out.narrative = b.narrative;
  if (typeof b.dossier_scope === 'string') out.dossier_scope = b.dossier_scope;
  if (typeof b.drawing_register_ref === 'string') out.drawing_register_ref = b.drawing_register_ref;
  if (typeof b.spec_register_ref === 'string') out.spec_register_ref = b.spec_register_ref;
  if (typeof b.acceptance_criteria === 'string') out.acceptance_criteria = b.acceptance_criteria;
  if (typeof b.blocks_warranty_start === 'number') out.blocks_warranty_start = b.blocks_warranty_start;
  if (typeof b.blocks_om_handover === 'number')    out.blocks_om_handover    = b.blocks_om_handover;
  if (typeof b.incomplete_as_built === 'number')   out.incomplete_as_built   = b.incomplete_as_built;
  if (typeof b.untransferred_spares === 'number')  out.untransferred_spares  = b.untransferred_spares;
  if (typeof b.as_built_completeness_pct === 'number') out.as_built_completeness_pct = b.as_built_completeness_pct;
  if (typeof b.spare_parts_completeness_pct === 'number') out.spare_parts_completeness_pct = b.spare_parts_completeness_pct;
  if (typeof b.training_completion_pct === 'number') out.training_completion_pct = b.training_completion_pct;
  if (typeof b.om_handover_blocker_ref === 'string') out.om_handover_blocker_ref = b.om_handover_blocker_ref;
  if (typeof b.warranty_blocker_ref === 'string') out.warranty_blocker_ref = b.warranty_blocker_ref;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/open-review', async (c) => transition(c, 'open_review', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/require-revision', async (c) => transition(c, 'require_revision', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/revise-and-resubmit', async (c) => transition(c, 'revise_and_resubmit', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.as_built_completeness_pct === 'number') out.as_built_completeness_pct = b.as_built_completeness_pct;
  if (typeof b.spare_parts_completeness_pct === 'number') out.spare_parts_completeness_pct = b.spare_parts_completeness_pct;
  if (typeof b.training_completion_pct === 'number') out.training_completion_pct = b.training_completion_pct;
  if (typeof b.incomplete_as_built === 'number') out.incomplete_as_built = b.incomplete_as_built;
  if (typeof b.untransferred_spares === 'number') out.untransferred_spares = b.untransferred_spares;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/approve', async (c) => transition(c, 'approve', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.dossier_cost_zar === 'number') out.dossier_cost_zar = b.dossier_cost_zar;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/schedule-witnessed-acceptance', async (c) => transition(c, 'schedule_witnessed_acceptance', (_row, body) => {
  const b = body as Partial<ScheduleBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.witness_party === 'string') out.witness_party = b.witness_party;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/complete-witnessed-acceptance', async (c) => transition(c, 'complete_witnessed_acceptance', (_row, body) => {
  const b = body as Partial<WitnessBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.witnessed_acceptance_clear === 'number') out.witnessed_acceptance_clear = b.witnessed_acceptance_clear;
  if (typeof b.punch_count_open === 'number') out.punch_count_open = b.punch_count_open;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/remediate-punch', async (c) => transition(c, 'remediate_punch', (_row, body) => {
  const b = body as Partial<RemediateBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.punch_count_open === 'number') out.punch_count_open = b.punch_count_open;
  if (typeof b.handover_cost_zar === 'number') out.handover_cost_zar = b.handover_cost_zar;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/transfer-training', async (c) => transition(c, 'transfer_training', (_row, body) => {
  const b = body as Partial<TrainingBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.training_completion_pct === 'number') out.training_completion_pct = b.training_completion_pct;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/activate-warranty', async (c) => transition(c, 'activate_warranty', (_row, body) => {
  const b = body as Partial<WarrantyBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.warranty_admin_party_id === 'string') out.warranty_admin_party_id = b.warranty_admin_party_id;
  if (typeof b.warranty_admin_party_name === 'string') out.warranty_admin_party_name = b.warranty_admin_party_name;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/transfer-to-operations', async (c) => transition(c, 'transfer_to_operations', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.rejected_reason === 'string') out.rejected_reason = b.rejected_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.withdrawn_reason === 'string') out.withdrawn_reason = b.withdrawn_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/void', async (c) => transition(c, 'void', (_row, body) => {
  const b = body as Partial<VoidBody>;
  const out: Partial<HandoverRow> = {};
  if (typeof b.voided_reason === 'string') out.voided_reason = b.voided_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function handoverDossierSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_handover_dossier
     WHERE chain_status NOT IN ('archived','rejected','withdrawn','voided')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<HandoverRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_handover_dossier
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `handover_dossier_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_handover_dossier_events (id, dossier_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'handover_dossier.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    // SLA breach crosses regulator EVERY tier on blocks_warranty_start;
    // high+critical when blocks_om_handover.
    const warrantyAlways = !!row.blocks_warranty_start;
    const omHighTier = !!row.blocks_om_handover && isHighTier(row.current_tier);
    if (warrantyAlways || omHighTier) {
      await fireCascade({
        event: 'handover_dossier.sla_breached',
        actor_id: 'system',
        entity_type: 'handover_dossier',
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
