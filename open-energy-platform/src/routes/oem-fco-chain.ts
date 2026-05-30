// ═══════════════════════════════════════════════════════════════════════════
// Wave 89 — OEM-Support Field Change Order / Engineering Change Notice
//           Campaign Management (P6). 10th OEM-Support chain.
//
// Mounted at /api/oem-fco/chain.
//
// OEM-pushed, fleet-wide retrofit campaigns: Tesla Megapack module
// replacements, Vestas gearbox upgrades, GE blade-bond inspection bulletins,
// Sungrow inverter capacitor service bulletins, SolarEdge optimizer recalls,
// SMA firmware-coupled hardware revisions. Distinct from W47 (customer-
// initiated RFC), W55 (firmware only), W15 (single-unit RMA), W63 (commercial
// warranty recovery).
//
// 12-state P6 lifecycle:
//   draft → under_review → approved → population_identified
//     → notification_sent → acknowledged → scheduling → in_progress
//     → completed (terminal)
//   in_progress ↔ suspended (suspend/resume loop)
//   draft / under_review → withdrawn (terminal)
//   approved / population_identified / notification_sent / acknowledged
//     / scheduling / in_progress / suspended → cancelled (terminal)
//
// DISTINCTIVE move (beats PTC Windchill ECM / Siemens Teamcenter Change
// Manager / Oracle Agile PLM / Arena PLM / Aras Innovator / Dassault Enovia /
// SAP PLM field-action / Tesla Megapack service campaigns / Vestas Online
// Service Bulletins / GE Vernova fleet upgrade campaigns — every PLM tool
// treats an ECN as a DOCUMENT): LIVE fleet-coverage + retrofit-economics
// battery on every record — completion %, mean time to retrofit, predicted
// full coverage days, total campaign CapEx, warranty coverage %, fleet
// energy at risk MW, urgency band, judicial-review-risk score. Tier
// RE-DERIVED on every transition from change_class so a draft optional FCO
// can escalate to mandatory_safety once field incidents surface, retightening
// every SLA and regulator crossing decision in the same write.
//
// Write model — SINGLE OEM-Support desk {admin, support}. READ all nine
// personas. actor_party (oem / operator / owner / regulator) tags the
// functional owner per step, not the JWT role.
//
// Reportability (FLEET-PROPAGATION SIGNATURE — the W89 hard line):
//   approve_campaign  → regulator EVERY tier when mandatory_safety
//                       (NRCS + SANS + NERSA Grid Code safety lodgement).
//   send_notification → regulator EVERY tier when affected_capacity_mw
//                       >= 50 MW (NERSA Grid Code grid-significant);
//                       mandatory tiers otherwise.
//   complete_campaign → regulator EVERY tier when mandatory_safety.
//   suspend_campaign  → regulator EVERY tier when mandatory_safety.
//   cancel_campaign   → regulator EVERY tier ALWAYS (post-approval
//                       cancellation hard line, irrespective of class).
//   withdraw_campaign → regulator EVERY tier when mandatory_safety.
//   sla_breached      → mandatory_safety + mandatory_performance only.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  slaDaysRemaining,
  slaMinutesFor,
  normaliseChangeClass,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  completionPct,
  meanTimeToRetrofitHours,
  predictedFullCoverageDays,
  totalCampaignCapexZar,
  warrantyCoveragePct,
  fleetEnergyAtRiskMw,
  urgencyBand,
  judicialReviewRisk,
  type FcoStatus,
  type FcoAction,
  type FcoChangeClass,
} from '../utils/oem-fco-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'ipp_developer', 'offtaker', 'trader', 'regulator', 'lender', 'grid_operator', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'support']);

interface FcoRow {
  id: string;
  campaign_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  oem_id: string;
  oem_name: string;
  product_family: string;
  product_model: string;
  serial_range_start: string | null;
  serial_range_end: string | null;
  firmware_baseline: string | null;
  campaign_title: string;
  change_class: FcoChangeClass;
  technical_summary: string | null;
  regulatory_reference: string | null;
  ecrb_decision_ref: string | null;
  reason_code: string | null;
  affected_units: number;
  affected_capacity_mw: number;
  affected_owner_count: number;
  affected_site_count: number;
  acknowledged_units: number;
  scheduled_units: number;
  completed_units: number;
  warranty_covered_units: number;
  retrofit_cost_per_unit_zar: number;
  total_campaign_capex_zar: number;
  warranty_coverage_pct: number;
  fleet_energy_at_risk_mw: number;
  mean_time_to_retrofit_hours: number;
  predicted_full_coverage_days: number | null;
  judicial_review_risk: number;
  campaign_tier: FcoChangeClass;
  submitted_flag: number;
  approved_flag: number;
  population_flag: number;
  notification_flag: number;
  acknowledged_flag: number;
  scheduling_flag: number;
  in_progress_flag: number;
  completed_flag: number;
  suspended_flag: number;
  cancelled_flag: number;
  withdrawn_flag: number;
  last_action_ref: string | null;
  regulator_ref: string | null;
  campaign_summary: string | null;
  chain_status: FcoStatus;
  draft_at: string;
  under_review_at: string | null;
  approved_at: string | null;
  population_identified_at: string | null;
  notification_sent_at: string | null;
  acknowledged_at: string | null;
  scheduling_at: string | null;
  in_progress_at: string | null;
  completed_at: string | null;
  suspended_at: string | null;
  cancelled_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface FcoEventRow {
  id: string;
  campaign_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<FcoStatus, keyof FcoRow | null> = {
  draft:                 null,
  under_review:          'under_review_at',
  approved:              'approved_at',
  population_identified: 'population_identified_at',
  notification_sent:     'notification_sent_at',
  acknowledged:          'acknowledged_at',
  scheduling:            'scheduling_at',
  in_progress:           'in_progress_at',
  completed:             'completed_at',
  suspended:             'suspended_at',
  cancelled:             'cancelled_at',
  withdrawn:             'withdrawn_at',
};

function eventTypeFor(action: FcoAction): string {
  switch (action) {
    case 'submit_for_review':    return 'oem_fco.submitted';
    case 'approve_campaign':     return 'oem_fco.approved';
    case 'identify_population':  return 'oem_fco.population_identified';
    case 'send_notification':    return 'oem_fco.notification_sent';
    case 'acknowledge_receipt':  return 'oem_fco.acknowledged';
    case 'schedule_rollout':     return 'oem_fco.scheduling_opened';
    case 'start_implementation': return 'oem_fco.rollout_started';
    case 'complete_campaign':    return 'oem_fco.completed';
    case 'suspend_campaign':     return 'oem_fco.suspended';
    case 'resume_campaign':      return 'oem_fco.resumed';
    case 'cancel_campaign':      return 'oem_fco.cancelled';
    case 'withdraw_campaign':    return 'oem_fco.withdrawn';
  }
}

function rolloutStartMs(row: FcoRow): number | null {
  const iso = row.in_progress_at;
  return iso ? new Date(iso).getTime() : null;
}

function decorate(row: FcoRow, now: Date) {
  const cls = row.campaign_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const nowMs = now.getTime();
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - nowMs) / 60000)
    : null;

  const startedMs = rolloutStartMs(row);
  const completionLive = completionPct(row.completed_units, row.affected_units);
  const mttrLive = meanTimeToRetrofitHours(startedMs, row.completed_units);
  const fullCoverageLive = predictedFullCoverageDays(row.completed_units, row.affected_units, startedMs);
  const totalCapexLive = totalCampaignCapexZar(row.retrofit_cost_per_unit_zar, row.affected_units);
  const warrantyCoverageLive = warrantyCoveragePct(row.warranty_covered_units, row.affected_units);
  const fleetEnergyLive = fleetEnergyAtRiskMw(row.affected_capacity_mw, row.completed_units, row.affected_units);
  const ackPctLive = row.affected_units > 0
    ? Math.round((row.acknowledged_units / row.affected_units) * 10000) / 100
    : 0;
  const inSuspension = status === 'suspended';
  const judicialRiskLive = judicialReviewRisk(cls, ackPctLive, inSuspension);
  const deadlineMs = slaIso ? new Date(slaIso).getTime() : null;
  const daysRemainingLive = slaDaysRemaining(deadlineMs, nowMs);
  const urgencyLive = urgencyBand(daysRemainingLive, cls);

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: slaMinutesFor(status, cls) ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(cls),
    completion_pct_live: completionLive,
    mean_time_to_retrofit_hours_live: mttrLive,
    predicted_full_coverage_days_live: fullCoverageLive,
    total_campaign_capex_zar_live: totalCapexLive,
    warranty_coverage_pct_live: warrantyCoverageLive,
    fleet_energy_at_risk_mw_live: fleetEnergyLive,
    acknowledgement_pct_live: ackPctLive,
    judicial_review_risk_live: judicialRiskLive,
    sla_days_remaining_live: daysRemainingLive,
    urgency_band_live: urgencyLive,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier         = c.req.query('tier');
  const change_class = c.req.query('change_class');
  const status       = c.req.query('status');
  const oem_id       = c.req.query('oem_id');
  const family       = c.req.query('product_family');
  const model        = c.req.query('product_model');
  const breached     = c.req.query('breached');
  const reportable   = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_oem_field_change_orders WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)         { sql += ' AND campaign_tier = ?'; binds.push(tier); }
  if (change_class) { sql += ' AND change_class = ?';  binds.push(change_class); }
  if (status)       { sql += ' AND chain_status = ?';  binds.push(status); }
  if (oem_id)       { sql += ' AND oem_id = ?';        binds.push(oem_id); }
  if (family)       { sql += ' AND product_family = ?'; binds.push(family); }
  if (model)        { sql += ' AND product_model = ?';  binds.push(model); }

  sql += ' ORDER BY datetime(draft_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<FcoRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  const by_oem: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status]       = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.campaign_tier]        = (by_tier[i.campaign_tier] || 0) + 1;
    by_class[i.change_class]        = (by_class[i.change_class] || 0) + 1;
    by_oem[i.oem_id]                = (by_oem[i.oem_id] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
  }

  const open_count                = items.filter((i) => !i.is_terminal).length;
  const draft_count               = items.filter((i) => i.chain_status === 'draft').length;
  const under_review_count        = items.filter((i) => i.chain_status === 'under_review').length;
  const approved_count            = items.filter((i) => i.chain_status === 'approved').length;
  const population_count          = items.filter((i) => i.chain_status === 'population_identified').length;
  const notification_count        = items.filter((i) => i.chain_status === 'notification_sent').length;
  const acknowledged_count        = items.filter((i) => i.chain_status === 'acknowledged').length;
  const scheduling_count          = items.filter((i) => i.chain_status === 'scheduling').length;
  const in_progress_count         = items.filter((i) => i.chain_status === 'in_progress').length;
  const completed_count           = items.filter((i) => i.chain_status === 'completed').length;
  const suspended_count           = items.filter((i) => i.chain_status === 'suspended').length;
  const cancelled_count           = items.filter((i) => i.chain_status === 'cancelled').length;
  const withdrawn_count           = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count            = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total          = items.filter((i) => i.is_reportable_flag).length;
  const mandatory_safety_count    = items.filter((i) => i.campaign_tier === 'mandatory_safety').length;
  const mandatory_performance_count = items.filter((i) => i.campaign_tier === 'mandatory_performance').length;
  const ge_50mw_count             = items.filter((i) => (i.affected_capacity_mw || 0) >= 50).length;
  const total_affected_units      = items.reduce((s, i) => s + (i.affected_units || 0), 0);
  const total_completed_units     = items.reduce((s, i) => s + (i.completed_units || 0), 0);
  const total_affected_capacity_mw = items.reduce((s, i) => s + (i.affected_capacity_mw || 0), 0);
  const total_campaign_capex_zar  = items.reduce((s, i) => s + (i.total_campaign_capex_zar_live || 0), 0);
  const total_fleet_energy_at_risk_mw = items.reduce((s, i) => s + (i.fleet_energy_at_risk_mw_live || 0), 0);
  const completion_weighted_pct = total_affected_units > 0
    ? Math.round((total_completed_units / total_affected_units) * 10000) / 100
    : 0;
  const urgent_count              = items.filter((i) => i.urgency_band_live === 'urgent' || i.urgency_band_live === 'over_due').length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_class,
      by_oem,
      by_urgency,
      open_count,
      draft_count,
      under_review_count,
      approved_count,
      population_count,
      notification_count,
      acknowledged_count,
      scheduling_count,
      in_progress_count,
      completed_count,
      suspended_count,
      cancelled_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      mandatory_safety_count,
      mandatory_performance_count,
      ge_50mw_count,
      total_affected_units,
      total_completed_units,
      total_affected_capacity_mw,
      total_campaign_capex_zar,
      total_fleet_energy_at_risk_mw,
      completion_weighted_pct,
      urgent_count,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_oem_field_change_orders WHERE id = ?').bind(id).first<FcoRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_oem_field_change_order_events WHERE campaign_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<FcoEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CommonBody {
  change_class?: FcoChangeClass;
  last_action_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  ecrb_decision_ref?: string;
  regulatory_reference?: string;
  technical_summary?: string;
  campaign_summary?: string;
  notes?: string;
}
interface SubmitForReviewBody extends CommonBody { campaign_title?: string; firmware_baseline?: string; }
interface ApproveBody extends CommonBody {}
interface IdentifyPopulationBody extends CommonBody {
  affected_units?: number;
  affected_capacity_mw?: number;
  affected_owner_count?: number;
  affected_site_count?: number;
  serial_range_start?: string;
  serial_range_end?: string;
  retrofit_cost_per_unit_zar?: number;
  warranty_covered_units?: number;
}
interface SendNotificationBody extends CommonBody {}
interface AcknowledgeBody extends CommonBody { acknowledged_units?: number; }
interface ScheduleRolloutBody extends CommonBody { scheduled_units?: number; }
interface StartImplementationBody extends CommonBody {}
interface CompleteCampaignBody extends CommonBody { completed_units?: number; }
interface SuspendCampaignBody extends CommonBody {}
interface ResumeCampaignBody extends CommonBody {}
interface CancelCampaignBody extends CommonBody {}
interface WithdrawCampaignBody extends CommonBody {}

async function transition(
  c: Context<HonoEnv>,
  action: FcoAction,
  bodyHandler?: (row: FcoRow, body: Record<string, unknown>) => Partial<FcoRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_oem_field_change_orders WHERE id = ?').bind(id).first<FcoRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Class RE-DERIVED on every transition (caller may upgrade an optional FCO
  // to mandatory_safety mid-flight).
  const incomingClass = overrides.change_class ?? row.change_class;
  const cls = normaliseChangeClass(incomingClass, row.change_class);
  overrides.change_class = cls;
  overrides.campaign_tier = cls;

  const affectedCapacity = (overrides.affected_capacity_mw as number | undefined) ?? row.affected_capacity_mw ?? 0;
  const affectedUnits   = (overrides.affected_units as number | undefined) ?? row.affected_units ?? 0;
  const completedUnits  = (overrides.completed_units as number | undefined) ?? row.completed_units ?? 0;
  const warrantyCovered = (overrides.warranty_covered_units as number | undefined) ?? row.warranty_covered_units ?? 0;
  const retrofitCost    = (overrides.retrofit_cost_per_unit_zar as number | undefined) ?? row.retrofit_cost_per_unit_zar ?? 0;
  const ackUnits        = (overrides.acknowledged_units as number | undefined) ?? row.acknowledged_units ?? 0;

  // Re-derive the live economics scalars that live on the row.
  overrides.total_campaign_capex_zar = totalCampaignCapexZar(retrofitCost, affectedUnits);
  overrides.warranty_coverage_pct    = warrantyCoveragePct(warrantyCovered, affectedUnits);
  overrides.fleet_energy_at_risk_mw  = fleetEnergyAtRiskMw(affectedCapacity, completedUnits, affectedUnits);

  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const tsCol = TIMESTAMP_COLUMN[to];
  const slaMs = slaDeadlineFor(to, cls, nowMs);
  const slaIso = slaMs !== null ? new Date(slaMs).toISOString() : null;

  // Predicted-coverage / MTTR: when entering or already in implementation, use
  // the start timestamp; otherwise null/zero are fine — decorate() recomputes
  // a fresh live snapshot on every read.
  const startedMs = to === 'in_progress'
    ? nowMs
    : row.in_progress_at ? new Date(row.in_progress_at).getTime() : null;
  overrides.mean_time_to_retrofit_hours = meanTimeToRetrofitHours(startedMs, completedUnits);
  overrides.predicted_full_coverage_days = predictedFullCoverageDays(completedUnits, affectedUnits, startedMs);

  const ackPctNow = affectedUnits > 0 ? (ackUnits / affectedUnits) * 100 : 0;
  overrides.judicial_review_risk = judicialReviewRisk(cls, ackPctNow, to === 'suspended');

  const crosses = crossesIntoRegulator(action, cls, affectedCapacity);
  overrides.is_reportable = (isReportable(action, cls, affectedCapacity) || crosses) ? 1 : 0;

  // Gate flags — set the inbound state flag on entry.
  if (to === 'under_review')          overrides.submitted_flag = 1;
  if (to === 'approved')              overrides.approved_flag = 1;
  if (to === 'population_identified') overrides.population_flag = 1;
  if (to === 'notification_sent')     overrides.notification_flag = 1;
  if (to === 'acknowledged')          overrides.acknowledged_flag = 1;
  if (to === 'scheduling')            overrides.scheduling_flag = 1;
  if (to === 'in_progress')           overrides.in_progress_flag = 1;
  if (to === 'completed')             overrides.completed_flag = 1;
  if (to === 'suspended')             overrides.suspended_flag = 1;
  if (to === 'cancelled')             overrides.cancelled_flag = 1;
  if (to === 'withdrawn')             overrides.withdrawn_flag = 1;
  if (action === 'suspend_campaign')  overrides.escalation_level = (row.escalation_level || 0) + 1;
  if (action === 'cancel_campaign')   overrides.escalation_level = (row.escalation_level || 0) + 1;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol && to !== row.chain_status) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_oem_field_change_orders SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `fco_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_oem_field_change_order_events (id, campaign_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'oem_fco',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      campaign_tier: cls,
      change_class: cls,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_oem_field_change_orders WHERE id = ?').bind(id).first<FcoRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<FcoRow>): Partial<FcoRow> {
  if (b.change_class)                              out.change_class = normaliseChangeClass(b.change_class, b.change_class);
  if (typeof b.last_action_ref === 'string')       out.last_action_ref = b.last_action_ref;
  if (typeof b.reason_code === 'string')           out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')         out.regulator_ref = b.regulator_ref;
  if (typeof b.ecrb_decision_ref === 'string')     out.ecrb_decision_ref = b.ecrb_decision_ref;
  if (typeof b.regulatory_reference === 'string')  out.regulatory_reference = b.regulatory_reference;
  if (typeof b.technical_summary === 'string')     out.technical_summary = b.technical_summary;
  if (typeof b.campaign_summary === 'string')      out.campaign_summary = b.campaign_summary;
  return out;
}

app.post('/:id/submit-for-review', async (c) => transition(c, 'submit_for_review', (_row, body) => {
  const b = body as Partial<SubmitForReviewBody>;
  const out: Partial<FcoRow> = {};
  if (typeof b.campaign_title === 'string')    out.campaign_title = b.campaign_title;
  if (typeof b.firmware_baseline === 'string') out.firmware_baseline = b.firmware_baseline;
  return applyCommon(b, out);
}));

app.post('/:id/approve-campaign', async (c) => transition(c, 'approve_campaign', (_row, body) =>
  applyCommon(body as Partial<ApproveBody>, {}),
));

app.post('/:id/identify-population', async (c) => transition(c, 'identify_population', (_row, body) => {
  const b = body as Partial<IdentifyPopulationBody>;
  const out: Partial<FcoRow> = {};
  if (typeof b.affected_units === 'number')             out.affected_units = b.affected_units;
  if (typeof b.affected_capacity_mw === 'number')       out.affected_capacity_mw = b.affected_capacity_mw;
  if (typeof b.affected_owner_count === 'number')       out.affected_owner_count = b.affected_owner_count;
  if (typeof b.affected_site_count === 'number')        out.affected_site_count = b.affected_site_count;
  if (typeof b.serial_range_start === 'string')         out.serial_range_start = b.serial_range_start;
  if (typeof b.serial_range_end === 'string')           out.serial_range_end = b.serial_range_end;
  if (typeof b.retrofit_cost_per_unit_zar === 'number') out.retrofit_cost_per_unit_zar = b.retrofit_cost_per_unit_zar;
  if (typeof b.warranty_covered_units === 'number')     out.warranty_covered_units = b.warranty_covered_units;
  return applyCommon(b, out);
}));

app.post('/:id/send-notification', async (c) => transition(c, 'send_notification', (_row, body) =>
  applyCommon(body as Partial<SendNotificationBody>, {}),
));

app.post('/:id/acknowledge-receipt', async (c) => transition(c, 'acknowledge_receipt', (_row, body) => {
  const b = body as Partial<AcknowledgeBody>;
  const out: Partial<FcoRow> = {};
  if (typeof b.acknowledged_units === 'number') out.acknowledged_units = b.acknowledged_units;
  return applyCommon(b, out);
}));

app.post('/:id/schedule-rollout', async (c) => transition(c, 'schedule_rollout', (_row, body) => {
  const b = body as Partial<ScheduleRolloutBody>;
  const out: Partial<FcoRow> = {};
  if (typeof b.scheduled_units === 'number') out.scheduled_units = b.scheduled_units;
  return applyCommon(b, out);
}));

app.post('/:id/start-implementation', async (c) => transition(c, 'start_implementation', (_row, body) =>
  applyCommon(body as Partial<StartImplementationBody>, {}),
));

app.post('/:id/complete-campaign', async (c) => transition(c, 'complete_campaign', (_row, body) => {
  const b = body as Partial<CompleteCampaignBody>;
  const out: Partial<FcoRow> = {};
  if (typeof b.completed_units === 'number') out.completed_units = b.completed_units;
  return applyCommon(b, out);
}));

app.post('/:id/suspend-campaign', async (c) => transition(c, 'suspend_campaign', (_row, body) =>
  applyCommon(body as Partial<SuspendCampaignBody>, {}),
));

app.post('/:id/resume-campaign', async (c) => transition(c, 'resume_campaign', (_row, body) =>
  applyCommon(body as Partial<ResumeCampaignBody>, {}),
));

app.post('/:id/cancel-campaign', async (c) => transition(c, 'cancel_campaign', (_row, body) =>
  applyCommon(body as Partial<CancelCampaignBody>, {}),
));

app.post('/:id/withdraw-campaign', async (c) => transition(c, 'withdraw_campaign', (_row, body) =>
  applyCommon(body as Partial<WithdrawCampaignBody>, {}),
));

export async function oemFcoSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_oem_field_change_orders
     WHERE chain_status NOT IN ('completed','cancelled','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<FcoRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_oem_field_change_orders
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `fco_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_oem_field_change_order_events (id, campaign_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'oem_fco.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'oem',
      `Auto-breach: ${row.chain_status} past SLA (class ${row.campaign_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.campaign_tier)) {
      await fireCascade({
        event: 'oem_fco.sla_breached',
        actor_id: 'system',
        entity_type: 'oem_fco',
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
