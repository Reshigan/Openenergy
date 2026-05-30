// Wave 97 — IPP Daily Field Report / Progress Diary. Mounted at
// /api/ipp/dfr/chain.
//
// The construction-day record for a best-in-class IPP-PM stack. Beats Procore
// Daily Log, Aconex Daily Site Diary, Buildertrend, Fieldwire, Raken, PlanGrid
// Daily Field Report, e-Builder daily logs. Every row is LIVE-scored on every
// fetch against an IPP-PM quality battery (within-SLA, correction count,
// rejection count, photo count, weather log, safety log, ball-in-court).
//
// Write {admin, ipp, ipp_developer, wind}. Read all 9 personas.
//
// SIGNATURE (W97 — OHSA + REIPPPP):
//   submit         -> regulator EVERY tier when triggers_hse_incident
//   approve        -> regulator EVERY tier when triggers_hse_incident
//                                              OR triggers_change_order
//                                                 with high+critical tier
//   void           -> regulator EVERY tier when triggers_hse_incident
//                                              OR triggers_change_order
//   distribute     -> regulator high+critical when triggers_change_order
//   sla_breached   -> regulator high+critical when triggers_hse_incident
//                                              OR triggers_change_order

import { Hono, Context } from 'hono';
import { getCurrentUser } from '../middleware/auth';
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
  type DfrStatus,
  type DfrAction,
  type DfrTier,
  type DfrWorkflowClass,
  type DfrPriorityClass,
} from '../utils/dfr-spec';

const READ_ROLES = new Set([
  'admin', 'ipp', 'ipp_developer', 'wind',
  'lender', 'regulator', 'offtaker',
  'grid_operator', 'carbon_fund', 'trader', 'support',
]);

const WRITE_ROLES = new Set(['admin', 'ipp', 'ipp_developer', 'wind']);

interface DfrRow {
  id: string;
  dfr_number: string;
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
  workflow_class: DfrWorkflowClass;
  priority_class: DfrPriorityClass;
  report_date: string;
  shift: string | null;
  site_location: string | null;
  weather_summary: string | null;
  temperature_low_c: number | null;
  temperature_high_c: number | null;
  precipitation_mm: number | null;
  wind_speed_mps: number | null;
  lost_time_hours: number | null;
  weather_delay_minutes: number | null;
  manpower_count: number;
  equipment_count: number;
  photo_count: number;
  entries_count: number;
  weather_log_present: number;
  safety_log_present: number;
  current_tier: DfrTier;
  authority_required: string | null;
  triggers_hse_incident: number;
  triggers_change_order: number;
  triggers_warranty_claim: number;
  contributes_to_evm: number;
  correction_count: number;
  rejection_count: number;
  evm_pv_zar: number | null;
  evm_ev_zar: number | null;
  evm_ac_zar: number | null;
  parent_dfr_id: string | null;
  hse_incident_ref: string | null;
  change_order_ref: string | null;
  warranty_claim_ref: string | null;
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
  chain_status: DfrStatus;
  drafted_at: string;
  entries_open_at: string | null;
  entries_closed_at: string | null;
  submitted_at: string | null;
  under_review_at: string | null;
  returned_for_correction_at: string | null;
  corrected_at: string | null;
  approved_at: string | null;
  distributed_at: string | null;
  archived_at: string | null;
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

interface DfrEventRow {
  id: string;
  dfr_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<DfrStatus, string | null> = {
  drafted:                 'drafted_at',
  entries_open:            'entries_open_at',
  entries_closed:          'entries_closed_at',
  submitted:               'submitted_at',
  under_review:            'under_review_at',
  returned_for_correction: 'returned_for_correction_at',
  corrected:               'corrected_at',
  approved:                'approved_at',
  distributed:             'distributed_at',
  archived:                'archived_at',
  voided:                  'voided_at',
  withdrawn:               'withdrawn_at',
};

function reasonCodeFor(action: DfrAction): string {
  switch (action) {
    case 'open':                  return 'ENTRIES_OPENED';
    case 'close_entries':         return 'ENTRIES_CLOSED';
    case 'submit':                return 'SUBMITTED';
    case 'start_review':          return 'REVIEW_STARTED';
    case 'return_for_correction': return 'RETURNED_FOR_CORRECTION';
    case 'correct':               return 'CORRECTED';
    case 'approve':               return 'APPROVED';
    case 'distribute':            return 'DISTRIBUTED';
    case 'archive':               return 'ARCHIVED';
    case 'void':                  return 'VOIDED';
    case 'withdraw':              return 'WITHDRAWN';
  }
}

function slaDeadlineFor(status: DfrStatus, tier: DfrTier, from: Date): Date | null {
  const minutes = slaMinutesFor(status, tier);
  if (minutes == null) return null;
  return new Date(from.getTime() + minutes * 60_000);
}

function decorate(row: DfrRow, now: Date) {
  const status = row.chain_status;
  const tier = row.current_tier;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const tierLive = tierFromInputs({
    priorityClass: row.priority_class,
    workflowClass: row.workflow_class,
    triggersHseIncident: !!row.triggers_hse_incident,
    triggersChangeOrder: !!row.triggers_change_order,
    triggersWarrantyClaim: !!row.triggers_warranty_claim,
    contributesToEvm: !!row.contributes_to_evm,
  });

  const ballInCourt = ballInCourtFor(status);
  const stateEnteredCol = TIMESTAMP_COLUMN[status];
  const stateEnteredIso = stateEnteredCol ? (row[stateEnteredCol] as string | null) : row.drafted_at;
  const stateEnteredAt = stateEnteredIso ? new Date(stateEnteredIso) : now;
  const daysInCourt = Math.floor((now.getTime() - stateEnteredAt.getTime()) / (24 * 60 * 60 * 1000));
  const daysOpen = Math.floor((now.getTime() - new Date(row.drafted_at).getTime()) / (24 * 60 * 60 * 1000));

  const predictedClose = predictedCloseDate(status, tierLive, stateEnteredAt);
  const urgency = urgencyBandFor(minutesUntilSla, isTerminal(status));

  const withinSla = (minutesUntilSla == null) || minutesUntilSla >= 0;
  const ballClear = ballInCourt != null;
  const qualityIndex = ippPmQualityIndex({
    withinSla,
    correctionCount: row.correction_count || 0,
    rejectionCount: row.rejection_count || 0,
    ballInCourtClear: ballClear,
    photoCount: row.photo_count || 0,
    weatherLogPresent: !!row.weather_log_present,
    safetyLogPresent: !!row.safety_log_present,
  });

  const floorApplied = !!(
    row.triggers_hse_incident || row.triggers_change_order ||
    row.triggers_warranty_claim || row.contributes_to_evm
  );

  // EVM metrics (PMI-EVM convention) — computed live for display.
  const pv = row.evm_pv_zar || 0;
  const ev = row.evm_ev_zar || 0;
  const ac = row.evm_ac_zar || 0;
  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac > 0 ? ev / ac : null;
  const spi = pv > 0 ? ev / pv : null;

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
    signature_class_flag: !!(row.triggers_hse_incident || row.triggers_change_order),
    authority_required_live: authorityFor(tier),
    tier_live: tierLive,
    ball_in_court_party_live: ballInCourt,
    days_in_court_live: daysInCourt,
    days_open_live: daysOpen,
    predicted_close_date_live: predictedClose ? predictedClose.toISOString() : null,
    ipp_pm_quality_index_live: qualityIndex,
    inbox_severity_live: inboxSeverityForTier(tier),
    reportable_per_spec: isReportable(tier),
    evm_cv_zar_live: cv,
    evm_sv_zar_live: sv,
    evm_cpi_live: cpi,
    evm_spi_live: spi,
  };
}

const app = new Hono<HonoEnv>();

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
  const report_date    = c.req.query('report_date');
  const breached       = c.req.query('breached');
  const reportable     = c.req.query('reportable');
  const signature_only = c.req.query('signature_only');
  const hse_only       = c.req.query('hse_only');

  let sql = 'SELECT * FROM oe_dfr WHERE 1=1';
  const binds: unknown[] = [];
  if (current_tier)   { sql += ' AND current_tier = ?';   binds.push(current_tier); }
  if (status)         { sql += ' AND chain_status = ?';   binds.push(status); }
  if (workflow_class) { sql += ' AND workflow_class = ?'; binds.push(workflow_class); }
  if (priority_class) { sql += ' AND priority_class = ?'; binds.push(priority_class); }
  if (project_id)     { sql += ' AND project_id = ?';     binds.push(project_id); }
  if (facility_id)    { sql += ' AND facility_id = ?';    binds.push(facility_id); }
  if (report_date)    { sql += ' AND report_date = ?';    binds.push(report_date); }
  if (hse_only === 'true') sql += ' AND triggers_hse_incident = 1';

  sql += ' ORDER BY datetime(drafted_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<DfrRow>();
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

  const open_count      = items.filter((i) => !i.is_terminal).length;
  const archived_count  = items.filter((i) => i.chain_status === 'archived').length;
  const voided_count    = items.filter((i) => i.chain_status === 'voided').length;
  const withdrawn_count = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count  = items.filter((i) => i.sla_breached).length;
  const reportable_total = items.filter((i) => i.is_reportable_flag).length;
  const signature_count = items.filter((i) => i.signature_class_flag).length;
  const hse_count       = items.filter((i) => i.triggers_hse_incident).length;
  const change_order_count = items.filter((i) => i.triggers_change_order).length;
  const warranty_count  = items.filter((i) => i.triggers_warranty_claim).length;

  const avg_quality_index = items.length > 0
    ? items.reduce((s, i) => s + (i.ipp_pm_quality_index_live || 0), 0) / items.length
    : 0;
  const avg_days_in_court = items.length > 0
    ? items.reduce((s, i) => s + (i.days_in_court_live || 0), 0) / items.length
    : 0;
  const total_manpower = items.reduce((s, i) => s + (i.manpower_count || 0), 0);
  const total_lost_time_hours = items.reduce((s, i) => s + (i.lost_time_hours || 0), 0);
  const total_weather_delay_minutes = items.reduce((s, i) => s + (i.weather_delay_minutes || 0), 0);

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
      voided_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      signature_count,
      hse_count,
      change_order_count,
      warranty_count,
      avg_quality_index,
      avg_days_in_court,
      total_manpower,
      total_lost_time_hours,
      total_weather_delay_minutes,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_dfr WHERE id = ?').bind(id).first<DfrRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_dfr_events WHERE dfr_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<DfrEventRow>();

  return c.json({
    success: true,
    data: {
      dfr: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

async function transition(
  c: Context<HonoEnv>,
  action: DfrAction,
  bodyHandler?: (row: DfrRow, body: Record<string, unknown>) => Partial<DfrRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_dfr WHERE id = ?').bind(id).first<DfrRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  const priorityClass = (overrides.priority_class as DfrPriorityClass | undefined) ?? row.priority_class;
  const workflowClass = (overrides.workflow_class as DfrWorkflowClass | undefined) ?? row.workflow_class;
  const triggersHseIncident = !!((overrides.triggers_hse_incident as number | undefined) ?? row.triggers_hse_incident);
  const triggersChangeOrder = !!((overrides.triggers_change_order as number | undefined) ?? row.triggers_change_order);
  const triggersWarrantyClaim = !!((overrides.triggers_warranty_claim as number | undefined) ?? row.triggers_warranty_claim);
  const contributesToEvm = !!((overrides.contributes_to_evm as number | undefined) ?? row.contributes_to_evm);
  const tier = tierFromInputs({
    priorityClass, workflowClass,
    triggersHseIncident, triggersChangeOrder,
    triggersWarrantyClaim, contributesToEvm,
  });
  overrides.current_tier = tier;
  overrides.authority_required = authorityFor(tier);

  const crosses = actionCrossesRegulator({
    action, tier,
    triggersHseIncident, triggersChangeOrder,
    triggersWarrantyClaim, contributesToEvm,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

  const newBallInCourt = ballInCourtFor(to);
  overrides.current_ball_in_court_party = newBallInCourt;

  if (action === 'return_for_correction') {
    overrides.rejection_count = (row.rejection_count || 0) + 1;
  }
  if (action === 'correct') {
    overrides.correction_count = (row.correction_count || 0) + 1;
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
    `UPDATE oe_dfr SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `dfr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  const reasonCode = (overrides.reason_code as string | undefined) ?? reasonCodeFor(action);
  await c.env.DB.prepare(
    'INSERT INTO oe_dfr_events (id, dfr_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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

  const eventName = `dfr.${to}` as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'dfr',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_dfr WHERE id = ?').bind(id).first<DfrRow>();
  return c.json({ success: true, data: { dfr: refreshed ? decorate(refreshed, now) : null } });
}

interface BasicBody { reason_code?: string; notes?: string }

interface OpenBody extends BasicBody {
  manpower_count?: number;
  equipment_count?: number;
  photo_count?: number;
  weather_summary?: string;
  weather_log_present?: number;
  safety_log_present?: number;
  temperature_low_c?: number;
  temperature_high_c?: number;
  wind_speed_mps?: number;
  precipitation_mm?: number;
}

interface SubmitBody extends BasicBody {
  title?: string;
  narrative?: string;
  evm_pv_zar?: number;
  evm_ev_zar?: number;
  evm_ac_zar?: number;
  triggers_hse_incident?: number;
  triggers_change_order?: number;
  triggers_warranty_claim?: number;
  contributes_to_evm?: number;
  hse_incident_ref?: string;
  change_order_ref?: string;
  warranty_claim_ref?: string;
}

interface ReviewBody extends BasicBody { response_text?: string }

interface CorrectBody extends BasicBody {
  narrative?: string;
  response_text?: string;
}

interface VoidBody extends BasicBody { voided_reason?: string }
interface WithdrawBody extends BasicBody { withdrawn_reason?: string }

app.post('/:id/open', async (c) => transition(c, 'open', (_row, body) => {
  const b = body as Partial<OpenBody>;
  const out: Partial<DfrRow> = {};
  if (typeof b.manpower_count === 'number') out.manpower_count = b.manpower_count;
  if (typeof b.equipment_count === 'number') out.equipment_count = b.equipment_count;
  if (typeof b.photo_count === 'number') out.photo_count = b.photo_count;
  if (typeof b.weather_summary === 'string') out.weather_summary = b.weather_summary;
  if (typeof b.weather_log_present === 'number') out.weather_log_present = b.weather_log_present;
  if (typeof b.safety_log_present === 'number') out.safety_log_present = b.safety_log_present;
  if (typeof b.temperature_low_c === 'number') out.temperature_low_c = b.temperature_low_c;
  if (typeof b.temperature_high_c === 'number') out.temperature_high_c = b.temperature_high_c;
  if (typeof b.wind_speed_mps === 'number') out.wind_speed_mps = b.wind_speed_mps;
  if (typeof b.precipitation_mm === 'number') out.precipitation_mm = b.precipitation_mm;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/close-entries', async (c) => transition(c, 'close_entries', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<DfrRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/submit', async (c) => transition(c, 'submit', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<DfrRow> = {};
  if (typeof b.title === 'string') out.title = b.title;
  if (typeof b.narrative === 'string') out.narrative = b.narrative;
  if (typeof b.evm_pv_zar === 'number') out.evm_pv_zar = b.evm_pv_zar;
  if (typeof b.evm_ev_zar === 'number') out.evm_ev_zar = b.evm_ev_zar;
  if (typeof b.evm_ac_zar === 'number') out.evm_ac_zar = b.evm_ac_zar;
  if (typeof b.triggers_hse_incident === 'number') out.triggers_hse_incident = b.triggers_hse_incident;
  if (typeof b.triggers_change_order === 'number') out.triggers_change_order = b.triggers_change_order;
  if (typeof b.triggers_warranty_claim === 'number') out.triggers_warranty_claim = b.triggers_warranty_claim;
  if (typeof b.contributes_to_evm === 'number') out.contributes_to_evm = b.contributes_to_evm;
  if (typeof b.hse_incident_ref === 'string') out.hse_incident_ref = b.hse_incident_ref;
  if (typeof b.change_order_ref === 'string') out.change_order_ref = b.change_order_ref;
  if (typeof b.warranty_claim_ref === 'string') out.warranty_claim_ref = b.warranty_claim_ref;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/start-review', async (c) => transition(c, 'start_review', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<DfrRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/return-for-correction', async (c) => transition(c, 'return_for_correction', (_row, body) => {
  const b = body as Partial<ReviewBody>;
  const out: Partial<DfrRow> = {};
  if (typeof b.response_text === 'string') out.response_text = b.response_text;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/correct', async (c) => transition(c, 'correct', (_row, body) => {
  const b = body as Partial<CorrectBody>;
  const out: Partial<DfrRow> = {};
  if (typeof b.narrative === 'string') out.narrative = b.narrative;
  if (typeof b.response_text === 'string') out.response_text = b.response_text;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/approve', async (c) => transition(c, 'approve', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<DfrRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/distribute', async (c) => transition(c, 'distribute', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<DfrRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) => {
  const b = body as Partial<BasicBody>;
  const out: Partial<DfrRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/void', async (c) => transition(c, 'void', (_row, body) => {
  const b = body as Partial<VoidBody>;
  const out: Partial<DfrRow> = {};
  if (typeof b.voided_reason === 'string') out.voided_reason = b.voided_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<DfrRow> = {};
  if (typeof b.withdrawn_reason === 'string') out.withdrawn_reason = b.withdrawn_reason;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

export async function dfrSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_dfr
     WHERE chain_status NOT IN ('archived','voided','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<DfrRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_dfr
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `dfr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_dfr_events (id, dfr_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'dfr.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    // SLA breach crosses regulator on high+critical when HSE or change-order.
    if (
      isHighTier(row.current_tier) &&
      (row.triggers_hse_incident || row.triggers_change_order)
    ) {
      await fireCascade({
        event: 'dfr.sla_breached',
        actor_id: 'system',
        entity_type: 'dfr',
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
