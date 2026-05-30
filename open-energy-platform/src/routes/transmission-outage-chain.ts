// ═══════════════════════════════════════════════════════════════════════════
// Wave 110 — Grid Transmission Network Outage Coordination & N-1 Security
// Assessment Chain (P6). 11th Grid chain. Mounted at
// /api/grid/transmission-outage/chain.
//
// SO-initiated EHV / HV transmission line + substation outage windows with
// N-1 contingency security assessment + reliability-committee approval +
// real-time supervision + return-to-service verification. Distinct from
// W18 (asset-owner-driven planned outage on IPP generators).
//
// Beats Hitachi Energy Lumada / ABB Network Manager / Siemens Spectrum /
// GE PowerOn / OSI monarch / OATI WebTrans / Eskom NCC / PowerWorld /
// Schneider EcoStruxure ADMS. Each surfaces TX outage planning as a
// calendar + a CSV of affected feeders. W110 turns it into a 12-state P6
// chain with URGENT SLA polarity stored in HOURS, FLOOR-AT-HIGH tier
// overlay, 4-step authority ladder, 16-field LIVE battery, 3-bridge
// architecture to W18 / W34 / W50, and signature regulator crossings.
//
// Standards: NERSA Grid Code C-3 + NTCSA Outage Coordination Process +
// Eskom System Operator Standards + ENTSO-E SO Reg 2017/1485 equivalent.
//
// Write {admin, grid_operator}. READ all 9 personas. actor_party split:
//   outage_planner:        request_outage, start_security_assessment,
//                          withdraw
//   system_operator:       run_n1_contingency, open_outage_window,
//                          commence_outage, suspend_outage, resume_outage,
//                          emergency_cancel, complete_outage,
//                          verify_return_to_service
//   reliability_committee: submit_to_reliability_committee, approve_outage,
//                          reject_outage, extend_outage
//   archive_clerk:         close_post_outage_review, archive_outage
//
// SIGNATURE regulator crossings:
//   emergency_cancel  -> regulator EVERY tier (W110 SIGNATURE — forced
//                          cancellation of an approved TX outage is always
//                          a security event)
//   extend_outage     -> regulator high_275kv + critical_400kv_plus
//   approve_outage    -> regulator critical_400kv_plus only when
//                          national_grid_backbone
//   suspend_outage    -> regulator high_275kv + critical_400kv_plus
//   sla_breached      -> regulator high_275kv + critical_400kv_plus
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaDeadlineFor,
  slaWindowHours,
  tierForVoltage,
  effectiveTier,
  countFloorFlags,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  regulatorFilingWindowHours,
  bridgesToPlannedOutageChain,
  bridgesToCurtailmentChain,
  bridgesToReserveActivationChain,
  securityMarginPct,
  hoursToOutageWindow,
  hoursInOutage,
  hoursToPlannedCompletion,
  isExtensionImminent,
  isEmergencyCancelRisk,
  isReturnedToServiceClean,
  outageCompletenessIndex,
  type TxoStatus,
  type TxoAction,
  type TxoTier,
} from '../utils/transmission-outage-spec';

const READ_ROLES = new Set([
  'admin', 'grid_operator',
  'ipp_developer', 'offtaker', 'trader', 'regulator', 'lender', 'support', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'grid_operator']);

interface TxoRow {
  id: string;
  outage_number: string;

  // Asset + corridor
  asset_id: string;
  asset_label: string | null;
  transmission_voltage_kv: number;
  corridor_name: string | null;
  substation_a: string | null;
  substation_b: string | null;
  affected_circuits_count: number;

  // Cross-chain bridges
  planned_outage_ref: string | null;
  curtailment_ref: string | null;
  reserve_activation_ref: string | null;

  // Outage spec
  outage_type: string | null;
  outage_reason: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;

  // N-1 + supervision
  n1_pass_count: number;
  n1_fail_count: number;
  n1_summary: string | null;
  security_margin_pct: number;
  thermal_limit_mw: number | null;
  actual_load_mw: number | null;
  rts_test_passed: number;
  extension_requested: number;
  extension_hours_granted: number;
  suspension_count: number;

  // 5 floor flags
  peak_demand_period: number;
  single_circuit_radial: number;
  cross_border_interconnector: number;
  black_start_path: number;
  national_grid_backbone: number;

  // Tier + authority
  current_tier: TxoTier;
  authority_required: string | null;
  urgency_band: string | null;
  outage_completeness_index: number;

  // Narrative
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  withdraw_reason: string | null;
  emergency_cancel_reason: string | null;
  suspend_reason: string | null;

  current_ball_in_court_party: string | null;
  last_responder_party: string | null;

  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  // 11 lifecycle + 5 branch timestamps
  chain_status: TxoStatus;
  outage_requested_at: string | null;
  security_assessment_at: string | null;
  n1_contingency_run_at: string | null;
  reliability_committee_review_at: string | null;
  outage_approved_at: string | null;
  outage_window_open_at: string | null;
  outage_in_progress_at: string | null;
  outage_completed_at: string | null;
  return_to_service_at: string | null;
  post_outage_review_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  suspended_at: string | null;
  emergency_cancelled_at: string | null;
  extended_at: string | null;

  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;

  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;

  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface TxoEventRow {
  id: string;
  outage_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<TxoStatus, keyof TxoRow | null> = {
  outage_requested:             'outage_requested_at',
  security_assessment:          'security_assessment_at',
  n1_contingency_run:           'n1_contingency_run_at',
  reliability_committee_review: 'reliability_committee_review_at',
  outage_approved:              'outage_approved_at',
  outage_window_open:           'outage_window_open_at',
  outage_in_progress:           'outage_in_progress_at',
  outage_completed:             'outage_completed_at',
  return_to_service:            'return_to_service_at',
  post_outage_review:           'post_outage_review_at',
  archived:                     'archived_at',
  rejected:                     'rejected_at',
  withdrawn:                    'withdrawn_at',
  suspended:                    'suspended_at',
  emergency_cancelled:          'emergency_cancelled_at',
  extended:                     'extended_at',
};

function statusEnteredAt(row: TxoRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.outage_requested_at ? new Date(row.outage_requested_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.outage_requested_at ? new Date(row.outage_requested_at) : null);
}

function decorate(row: TxoRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const entered = statusEnteredAt(row);
  const slaHrs = slaHoursRemaining(status, tier, entered, now);
  const urgency = urgencyBand(tier, slaHrs);
  const authority = authorityRequired(tier);
  const regFilingHours = regulatorFilingWindowHours(tier);

  const margin = row.security_margin_pct
    ? row.security_margin_pct
    : securityMarginPct(row.actual_load_mw, row.thermal_limit_mw);

  const hoursToWindow = hoursToOutageWindow(row.scheduled_start_at, now);
  const hoursElapsed = hoursInOutage(row.outage_in_progress_at, now);
  const hoursToCompletion = hoursToPlannedCompletion(row.scheduled_end_at, now);
  const extImminent = isExtensionImminent(hoursToCompletion, row.extension_requested);
  const ecRisk = isEmergencyCancelRisk(status, margin);
  const rtsClean = isReturnedToServiceClean(status, row.rts_test_passed);
  const floorFlags = countFloorFlags({
    peak_demand_period:          row.peak_demand_period,
    single_circuit_radial:       row.single_circuit_radial,
    cross_border_interconnector: row.cross_border_interconnector,
    black_start_path:            row.black_start_path,
    national_grid_backbone:      row.national_grid_backbone,
  });

  const completeness = outageCompletenessIndex({
    security_assessment:         !!row.security_assessment_at,
    n1_contingency:              !!row.n1_contingency_run_at,
    committee_approved:          !!row.outage_approved_at,
    window_opened:               !!row.outage_window_open_at,
    commenced:                   !!row.outage_in_progress_at,
    completed:                   !!row.outage_completed_at,
    rts_verified:                !!row.return_to_service_at,
    post_review:                 !!row.post_outage_review_at,
    archived:                    !!row.archived_at,
    clean_first_pass_bonus:      row.n1_fail_count === 0 && !!row.outage_approved_at,
    no_suspension_bonus:         row.suspension_count === 0 && status !== 'suspended',
    no_extension_bonus:          row.extension_hours_granted === 0 && status !== 'extended',
    no_emergency_cancel_bonus:   status !== 'emergency_cancelled',
  });

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached_live: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_hours: slaWindowHours(status, tier),
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    sla_hours_remaining_live: slaHrs,
    urgency_band_live: urgency,
    authority_required_live: authority,
    regulator_filing_window_hours_live: regFilingHours,
    security_margin_pct_live: margin,
    hours_to_outage_window_live: hoursToWindow,
    hours_in_outage_live: hoursElapsed,
    hours_to_planned_completion_live: hoursToCompletion,
    extension_imminent_live: extImminent,
    emergency_cancel_risk_live: ecRisk,
    returned_to_service_clean_live: rtsClean,
    floor_flag_count_live: floorFlags,
    outage_completeness_index_live: completeness,
    bridges_to_planned_outage_chain_live: bridgesToPlannedOutageChain(row.planned_outage_ref),
    bridges_to_curtailment_chain_live: bridgesToCurtailmentChain(row.curtailment_ref),
    bridges_to_reserve_activation_chain_live: bridgesToReserveActivationChain(row.reserve_activation_ref),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── List ────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier       = c.req.query('tier');
  const status     = c.req.query('status');
  const asset      = c.req.query('asset_id');
  const corridor   = c.req.query('corridor_name');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_transmission_outage WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)     { sql += ' AND current_tier = ?';   binds.push(tier); }
  if (status)   { sql += ' AND chain_status = ?';   binds.push(status); }
  if (asset)    { sql += ' AND asset_id = ?';       binds.push(asset); }
  if (corridor) { sql += ' AND corridor_name = ?';  binds.push(corridor); }
  sql += ' ORDER BY datetime(scheduled_start_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<TxoRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_corridor: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    if (i.corridor_name) by_corridor[i.corridor_name] = (by_corridor[i.corridor_name] || 0) + 1;
  }

  const active_count       = items.filter((i) => !i.is_terminal).length;
  const in_progress_count  = items.filter((i) => i.chain_status === 'outage_in_progress' || i.chain_status === 'extended').length;
  const suspended_count    = items.filter((i) => i.chain_status === 'suspended').length;
  const emergency_count    = items.filter((i) => i.chain_status === 'emergency_cancelled').length;
  const critical_tier_count = items.filter((i) => i.current_tier === 'critical_400kv_plus').length;
  const breached_count     = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total   = items.filter((i) => i.is_reportable_flag).length;
  const planned_bridged    = items.filter((i) => i.bridges_to_planned_outage_chain_live).length;
  const curtailment_bridged = items.filter((i) => i.bridges_to_curtailment_chain_live).length;
  const reserve_bridged    = items.filter((i) => i.bridges_to_reserve_activation_chain_live).length;
  const total_circuits_offline = items
    .filter((i) => i.chain_status === 'outage_in_progress' || i.chain_status === 'extended')
    .reduce((s, i) => s + (i.affected_circuits_count || 0), 0);
  const completedDurations: number[] = [];
  for (const i of items) {
    if (i.return_to_service_at && i.outage_requested_at) {
      const ms = new Date(i.return_to_service_at).getTime() - new Date(i.outage_requested_at).getTime();
      if (ms > 0) completedDurations.push(ms / (3600 * 1000));
    }
  }
  const avg_lifecycle_hours = completedDurations.length
    ? Math.round((completedDurations.reduce((s, h) => s + h, 0) / completedDurations.length) * 10) / 10
    : 0;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_corridor,
      active_count,
      in_progress_count,
      suspended_count,
      emergency_count,
      critical_tier_count,
      breached: breached_count,
      reportable_total,
      planned_bridged_count: planned_bridged,
      curtailment_bridged_count: curtailment_bridged,
      reserve_bridged_count: reserve_bridged,
      total_circuits_offline,
      avg_lifecycle_hours,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, regulator_relevant, sla_breached, corridor_name, COUNT(*) as n
     FROM oe_transmission_outage GROUP BY chain_status, current_tier, regulator_relevant, sla_breached, corridor_name`,
  ).all<{
    chain_status: string; current_tier: string;
    regulator_relevant: number; sla_breached: number;
    corridor_name: string | null; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  const by_corridor: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
    if (r.corridor_name) by_corridor[r.corridor_name] = (by_corridor[r.corridor_name] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_regulator_relevant, by_sla_breached, by_corridor } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_transmission_outage WHERE id = ?').bind(id).first<TxoRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_transmission_outage_events WHERE outage_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<TxoEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Body interfaces ──────────────────────────────────────────────────────
interface CommonBody {
  notes?: string;
  reason_code?: string;
  regulator_ref?: string;
  title?: string;
  narrative?: string;
}

interface CreateBody extends CommonBody {
  asset_id?: string;
  asset_label?: string;
  transmission_voltage_kv?: number;
  corridor_name?: string;
  substation_a?: string;
  substation_b?: string;
  affected_circuits_count?: number;
  outage_type?: string;
  outage_reason?: string;
  scheduled_start_at?: string;
  scheduled_end_at?: string;
  thermal_limit_mw?: number;
  actual_load_mw?: number;
  planned_outage_ref?: string;
  curtailment_ref?: string;
  reserve_activation_ref?: string;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  peak_demand_period?: boolean | number;
  single_circuit_radial?: boolean | number;
  cross_border_interconnector?: boolean | number;
  black_start_path?: boolean | number;
  national_grid_backbone?: boolean | number;
  tenant_id?: string;
}

interface SecurityAssessBody extends CommonBody {
  security_margin_pct?: number;
  actual_load_mw?: number;
  thermal_limit_mw?: number;
}
interface N1Body extends CommonBody {
  n1_pass_count?: number;
  n1_fail_count?: number;
  n1_summary?: string;
}
interface SubmitCommitteeBody extends CommonBody {}
interface ApproveBody extends CommonBody {}
interface RejectBody extends CommonBody { reject_reason?: string; }
interface OpenWindowBody extends CommonBody {
  scheduled_start_at?: string;
  scheduled_end_at?: string;
}
interface CommenceBody extends CommonBody {
  actual_start_at?: string;
}
interface SuspendBody extends CommonBody {
  suspend_reason?: string;
}
interface ResumeBody extends CommonBody {}
interface EmergencyCancelBody extends CommonBody {
  emergency_cancel_reason?: string;
}
interface ExtendBody extends CommonBody {
  extension_hours_granted?: number;
  scheduled_end_at?: string;
}
interface CompleteBody extends CommonBody {
  actual_end_at?: string;
}
interface VerifyRtsBody extends CommonBody {
  rts_test_passed?: boolean | number;
}
interface ClosePostReviewBody extends CommonBody {}
interface ArchiveBody extends CommonBody {}
interface WithdrawBody extends CommonBody {
  withdraw_reason?: string;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<TxoRow>): Partial<TxoRow> {
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.title === 'string')         out.title = b.title;
  if (typeof b.narrative === 'string')     out.narrative = b.narrative;
  return out;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

// ─── Create endpoint ─────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `txo-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `TXO-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const voltageKv = Number(body.transmission_voltage_kv ?? 0);
  const flags = {
    peak_demand_period:          toFlag(body.peak_demand_period) ?? 0,
    single_circuit_radial:       toFlag(body.single_circuit_radial) ?? 0,
    cross_border_interconnector: toFlag(body.cross_border_interconnector) ?? 0,
    black_start_path:            toFlag(body.black_start_path) ?? 0,
    national_grid_backbone:      toFlag(body.national_grid_backbone) ?? 0,
  };
  const rawTier = tierForVoltage(voltageKv);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('outage_requested', tier, now);
  const slaHrs = slaWindowHours('outage_requested', tier);

  await c.env.DB.prepare(
    `INSERT INTO oe_transmission_outage (
      id, outage_number,
      asset_id, asset_label, transmission_voltage_kv,
      corridor_name, substation_a, substation_b, affected_circuits_count,
      planned_outage_ref, curtailment_ref, reserve_activation_ref,
      outage_type, outage_reason,
      scheduled_start_at, scheduled_end_at,
      n1_pass_count, n1_fail_count, n1_summary,
      security_margin_pct, thermal_limit_mw, actual_load_mw,
      rts_test_passed, extension_requested, extension_hours_granted, suspension_count,
      peak_demand_period, single_circuit_radial, cross_border_interconnector,
      black_start_path, national_grid_backbone,
      current_tier, authority_required, urgency_band, outage_completeness_index,
      title, narrative,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, outage_requested_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.asset_id ?? 'asset-unknown', body.asset_label ?? null, voltageKv,
    body.corridor_name ?? null, body.substation_a ?? null, body.substation_b ?? null,
    Number(body.affected_circuits_count ?? 0),
    body.planned_outage_ref ?? null, body.curtailment_ref ?? null, body.reserve_activation_ref ?? null,
    body.outage_type ?? null, body.outage_reason ?? null,
    body.scheduled_start_at ?? null, body.scheduled_end_at ?? null,
    0, 0, null,
    100, body.thermal_limit_mw ?? null, body.actual_load_mw ?? null,
    0, 0, 0, 0,
    flags.peak_demand_period, flags.single_circuit_radial, flags.cross_border_interconnector,
    flags.black_start_path, flags.national_grid_backbone,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs), 0,
    body.title ?? null, body.narrative ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'outage_requested', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  // Emit the create event so the cascade fans out.
  const evtId = `transmission_outage_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_transmission_outage_events (id, outage_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'transmission_outage_requested',
    null, 'outage_requested', user.id, partyForAction('request_outage'),
    null, JSON.stringify({ tier, voltage_kv: voltageKv }), nowIso,
  ).run();

  await fireCascade({
    event: 'transmission_outage_requested',
    actor_id: user.id,
    entity_type: 'transmission_outage',
    entity_id: id,
    data: {
      tier, voltage_kv: voltageKv, asset_id: body.asset_id,
      chain_status: 'outage_requested',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_transmission_outage WHERE id = ?').bind(id).first<TxoRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: TxoAction,
  bodyHandler?: (row: TxoRow, body: Record<string, unknown>) => Partial<TxoRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_transmission_outage WHERE id = ?').bind(id).first<TxoRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from current voltage + 5 floor flags. Floor flags can be
  // bumped on any transition (e.g., peak demand window can come into effect
  // between request and commencement).
  const voltageKv = (overrides.transmission_voltage_kv as number | undefined) ?? row.transmission_voltage_kv;
  const rawTier = tierForVoltage(voltageKv);
  const floorFlags = {
    peak_demand_period:
      (overrides.peak_demand_period as number | undefined) ?? row.peak_demand_period,
    single_circuit_radial:
      (overrides.single_circuit_radial as number | undefined) ?? row.single_circuit_radial,
    cross_border_interconnector:
      (overrides.cross_border_interconnector as number | undefined) ?? row.cross_border_interconnector,
    black_start_path:
      (overrides.black_start_path as number | undefined) ?? row.black_start_path,
    national_grid_backbone:
      (overrides.national_grid_backbone as number | undefined) ?? row.national_grid_backbone,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);
  overrides.sla_target_hours = slaHrs;

  // Action-specific bookkeeping.
  if (action === 'suspend_outage') {
    overrides.suspension_count = (row.suspension_count || 0) + 1;
  }
  if (action === 'extend_outage') {
    overrides.extension_requested = 1;
  }
  if (action === 'verify_return_to_service') {
    if (overrides.rts_test_passed === undefined) {
      overrides.rts_test_passed = 1;
    }
  }
  if (action === 'commence_outage' && !overrides.actual_start_at && !row.actual_start_at) {
    overrides.actual_start_at = nowIso;
  }
  if (action === 'complete_outage' && !overrides.actual_end_at && !row.actual_end_at) {
    overrides.actual_end_at = nowIso;
  }

  // Re-compute security margin if load/limit changed.
  const actualLoad = (overrides.actual_load_mw as number | undefined) ?? row.actual_load_mw;
  const thermalLimit = (overrides.thermal_limit_mw as number | undefined) ?? row.thermal_limit_mw;
  if (actualLoad != null && thermalLimit != null && thermalLimit > 0) {
    overrides.security_margin_pct = securityMarginPct(actualLoad, thermalLimit);
  }

  // SIGNATURE crossings (W110 emergency_cancel EVERY tier, plus extend /
  // approve / suspend rules).
  const crosses = crossesIntoRegulator(action, tier, {
    national_grid_backbone: floorFlags.national_grid_backbone,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  overrides.urgency_band = urgencyBand(tier, slaHrs);

  // Recompute completeness on each transition (best-effort projection of
  // what timestamps WILL be set after this update lands).
  const willSetTs = (col: keyof TxoRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };
  overrides.outage_completeness_index = outageCompletenessIndex({
    security_assessment:         willSetTs('security_assessment_at'),
    n1_contingency:              willSetTs('n1_contingency_run_at'),
    committee_approved:          willSetTs('outage_approved_at'),
    window_opened:               willSetTs('outage_window_open_at'),
    commenced:                   willSetTs('outage_in_progress_at'),
    completed:                   willSetTs('outage_completed_at'),
    rts_verified:                willSetTs('return_to_service_at'),
    post_review:                 willSetTs('post_outage_review_at'),
    archived:                    willSetTs('archived_at'),
    clean_first_pass_bonus:      row.n1_fail_count === 0 && (willSetTs('outage_approved_at')),
    no_suspension_bonus:         row.suspension_count === 0 && action !== 'suspend_outage',
    no_extension_bonus:          row.extension_hours_granted === 0 && action !== 'extend_outage',
    no_emergency_cancel_bonus:   action !== 'emergency_cancel',
  });

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
    `UPDATE oe_transmission_outage SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `transmission_outage_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_transmission_outage_events (id, outage_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventName,
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'transmission_outage',
      entity_id: id,
      data: {
        ...row,
        ...overrides,
        current_tier: tier,
        chain_status: to,
        from_status: row.chain_status,
        action,
        crosses_into_regulator: crosses,
      },
      env: c.env,
    });
  }

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_transmission_outage WHERE id = ?').bind(id).first<TxoRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (16 transitions) ────────────────────────────────────
app.post('/:id/start-security-assessment', async (c) => transition(c, 'start_security_assessment', (_row, body) => {
  const b = body as Partial<SecurityAssessBody>;
  const out: Partial<TxoRow> = {};
  if (typeof b.security_margin_pct === 'number') out.security_margin_pct = b.security_margin_pct;
  if (typeof b.actual_load_mw === 'number')      out.actual_load_mw = b.actual_load_mw;
  if (typeof b.thermal_limit_mw === 'number')    out.thermal_limit_mw = b.thermal_limit_mw;
  return applyCommon(b, out);
}));

app.post('/:id/run-n1-contingency', async (c) => transition(c, 'run_n1_contingency', (_row, body) => {
  const b = body as Partial<N1Body>;
  const out: Partial<TxoRow> = {};
  if (typeof b.n1_pass_count === 'number') out.n1_pass_count = b.n1_pass_count;
  if (typeof b.n1_fail_count === 'number') out.n1_fail_count = b.n1_fail_count;
  if (typeof b.n1_summary === 'string')    out.n1_summary = b.n1_summary;
  return applyCommon(b, out);
}));

app.post('/:id/submit-to-reliability-committee', async (c) => transition(c, 'submit_to_reliability_committee', (_row, body) =>
  applyCommon(body as Partial<SubmitCommitteeBody>, {}),
));

app.post('/:id/approve-outage', async (c) => transition(c, 'approve_outage', (_row, body) =>
  applyCommon(body as Partial<ApproveBody>, {}),
));

app.post('/:id/reject-outage', async (c) => transition(c, 'reject_outage', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<TxoRow> = {};
  if (typeof b.reject_reason === 'string') out.reject_reason = b.reject_reason;
  return applyCommon(b, out);
}));

app.post('/:id/open-outage-window', async (c) => transition(c, 'open_outage_window', (_row, body) => {
  const b = body as Partial<OpenWindowBody>;
  const out: Partial<TxoRow> = {};
  if (typeof b.scheduled_start_at === 'string') out.scheduled_start_at = b.scheduled_start_at;
  if (typeof b.scheduled_end_at === 'string')   out.scheduled_end_at = b.scheduled_end_at;
  return applyCommon(b, out);
}));

app.post('/:id/commence-outage', async (c) => transition(c, 'commence_outage', (_row, body) => {
  const b = body as Partial<CommenceBody>;
  const out: Partial<TxoRow> = {};
  if (typeof b.actual_start_at === 'string') out.actual_start_at = b.actual_start_at;
  return applyCommon(b, out);
}));

app.post('/:id/suspend-outage', async (c) => transition(c, 'suspend_outage', (_row, body) => {
  const b = body as Partial<SuspendBody>;
  const out: Partial<TxoRow> = {};
  if (typeof b.suspend_reason === 'string') out.suspend_reason = b.suspend_reason;
  return applyCommon(b, out);
}));

app.post('/:id/resume-outage', async (c) => transition(c, 'resume_outage', (_row, body) =>
  applyCommon(body as Partial<ResumeBody>, {}),
));

app.post('/:id/emergency-cancel', async (c) => transition(c, 'emergency_cancel', (_row, body) => {
  const b = body as Partial<EmergencyCancelBody>;
  const out: Partial<TxoRow> = {};
  if (typeof b.emergency_cancel_reason === 'string') out.emergency_cancel_reason = b.emergency_cancel_reason;
  return applyCommon(b, out);
}));

app.post('/:id/extend-outage', async (c) => transition(c, 'extend_outage', (row, body) => {
  const b = body as Partial<ExtendBody>;
  const out: Partial<TxoRow> = {};
  if (typeof b.extension_hours_granted === 'number') {
    out.extension_hours_granted = (row.extension_hours_granted || 0) + b.extension_hours_granted;
  }
  if (typeof b.scheduled_end_at === 'string') out.scheduled_end_at = b.scheduled_end_at;
  return applyCommon(b, out);
}));

app.post('/:id/complete-outage', async (c) => transition(c, 'complete_outage', (_row, body) => {
  const b = body as Partial<CompleteBody>;
  const out: Partial<TxoRow> = {};
  if (typeof b.actual_end_at === 'string') out.actual_end_at = b.actual_end_at;
  return applyCommon(b, out);
}));

app.post('/:id/verify-return-to-service', async (c) => transition(c, 'verify_return_to_service', (_row, body) => {
  const b = body as Partial<VerifyRtsBody>;
  const out: Partial<TxoRow> = {};
  const flag = toFlag(b.rts_test_passed);
  if (flag !== undefined) out.rts_test_passed = flag;
  return applyCommon(b, out);
}));

app.post('/:id/close-post-outage-review', async (c) => transition(c, 'close_post_outage_review', (_row, body) =>
  applyCommon(body as Partial<ClosePostReviewBody>, {}),
));

app.post('/:id/archive-outage', async (c) => transition(c, 'archive_outage', (_row, body) =>
  applyCommon(body as Partial<ArchiveBody>, {}),
));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<TxoRow> = {};
  if (typeof b.withdraw_reason === 'string') out.withdraw_reason = b.withdraw_reason;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// Walks every active outage whose sla_deadline_at has elapsed, flips
// sla_breached=1, bumps escalation_level, fires
// transmission_outage_sla_breached event. SLA breach crosses regulator on
// high_275kv + critical_400kv_plus (the heavy tiers — NERSA Grid Code C-3
// disclosure rule).
export async function transmissionOutageSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_transmission_outage
     WHERE chain_status NOT IN ('archived','rejected','withdrawn','emergency_cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<TxoRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_transmission_outage
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `transmission_outage_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_transmission_outage_events (id, outage_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'transmission_outage_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system_operator',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'transmission_outage_sla_breached',
        actor_id: 'system',
        entity_type: 'transmission_outage',
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

// ─── Cron: Outage-window monitor (nightly 05:00) ──────────────────────────
//
// Walks active outages whose scheduled_end_at has passed without
// complete_outage being called, logs an overdue event, and flags
// extension_requested when within the overrun window. Does not
// auto-transition — completion confirmation must come from the SO. This
// keeps the LIVE battery's extension_imminent_live flag honest the night
// after the planned end.
export async function transmissionOutageWindowMonitor(env: HonoEnv['Bindings']): Promise<{ scanned: number; overdue: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_transmission_outage
     WHERE chain_status IN ('outage_in_progress','extended')
       AND scheduled_end_at IS NOT NULL
       AND datetime(scheduled_end_at) < datetime(?)`,
  ).bind(nowIso).all<TxoRow>();

  const rows = rs.results || [];
  let overdue = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_transmission_outage
       SET extension_requested = 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, row.id).run();

    const evtId = `transmission_outage_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_transmission_outage_events (id, outage_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'transmission_outage_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system_operator',
      `Auto-window-overrun: scheduled_end_at ${row.scheduled_end_at} passed without completion (tier ${row.current_tier})`,
      JSON.stringify({ scheduled_end_at: row.scheduled_end_at, status: row.chain_status }),
      nowIso,
    ).run();

    overdue++;
  }
  return { scanned: rows.length, overdue };
}

export default app;
