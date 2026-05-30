// ═══════════════════════════════════════════════════════════════════════════
// Wave 112 — IPP WBS & Gantt Schedule Management chain (P6). 7th IPP
// chain. First wave of Phase A IPP-parity push. Mounted at
// /api/ipp/wbs-schedule/chain.
//
// WBS baseline + Gantt + EVM (CPI/SPI/SPI_t) + variance + rebaseline +
// recovery engine that owns the "where is the project, when does each
// work package finish, what's the float, are we late?" question for
// every IPP project end-to-end.
//
// Distinct from W19 (procurement / RFP), W20 (construction COD), W23
// (insurance claim), W25 (HSE incident), W27 (REIPPPP ED commitment),
// W28 (Grid Connection Agreement).
//
// Beats Primavera P6 / MS Project / Procore Schedule / Aconex Schedule /
// Oracle Primavera Cloud / Trimble Quadri / Asta Powerproject / Deltek
// Acumen Fuse / SAP Project Management.
//
// Standards: PMBOK 7 + ISO 21500:2021 + AACE RP 27R-03 + AACE 29R-03 +
// REIPPPP IPP Office + NERSA Grid Code C-5 + DMRE Section 34.
//
// Write {admin, ipp_developer}. READ all 9 personas. actor_party split:
//   scheduler           : draft_wbs, set_baseline, update_progress,
//                          detect_variance
//   project_manager     : start_execution, assess_impact, propose_recovery,
//                          mark_recovered, mark_completed, mark_late_finish,
//                          suspend_schedule, resume_schedule
//   portfolio_director  : rebaseline_schedule, cancel_schedule
//   IPP_CEO             : approve_rebaseline, reject_rebaseline
//
// SIGNATURE regulator crossings:
//   mark_late_finish    -> regulator EVERY tier when project_capacity_mw
//                           >= 1 (W112 SIGNATURE late-finish hard line)
//   cancel_schedule     -> regulator EVERY tier when project_capacity_mw
//                           >= 1 (DMRE §34 procurement-determination
//                           withdrawal)
//   rebaseline_schedule -> regulator large + mega (REIPPPP §6)
//   suspend_schedule    -> regulator mega only when critical_path_breach
//                           (NERSA Grid Code C-5 disclosure)
//   sla_breached        -> regulator large + mega
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
  tierForCapacity,
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
  bridgesToProcurementChain,
  bridgesToCodChain,
  bridgesToInsuranceClaimChain,
  bridgesToHseIncidentChain,
  costPerformanceIndex,
  schedulePerformanceIndex,
  schedulePerformanceIndexT,
  scheduleVarianceZar,
  costVarianceZar,
  scheduleVariancePct,
  costVariancePct,
  criticalPathFloatDays,
  daysToPlannedFinish,
  daysSinceBaseline,
  isLateFinishRisk,
  isRebaselineImminent,
  scheduleHealthBand,
  scheduleCompletenessIndex,
  type IpsStatus,
  type IpsAction,
  type IpsTier,
} from '../utils/ipp-schedule-spec';

const READ_ROLES = new Set([
  'admin', 'ipp_developer',
  'trader', 'offtaker', 'grid_operator', 'regulator', 'lender', 'support', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

interface IpsRow {
  id: string;
  schedule_number: string;

  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;

  procurement_ref: string | null;
  cod_ref: string | null;
  insurance_claim_ref: string | null;
  hse_incident_ref: string | null;

  baseline_label: string | null;
  baseline_set_at: string | null;
  baseline_total_tasks: number;
  baseline_total_duration_days: number;
  baseline_planned_start: string | null;
  baseline_planned_finish: string | null;
  current_planned_finish: string | null;
  contractual_final_milestone_date: string | null;

  percent_complete: number;
  tasks_completed: number;
  tasks_in_progress: number;
  tasks_not_started: number;
  last_progress_update_at: string | null;

  planned_value_zar: number;
  earned_value_zar: number;
  actual_cost_zar: number;
  budget_at_completion_zar: number;
  cpi: number;
  spi: number;
  spi_t: number;
  schedule_variance_zar: number;
  cost_variance_zar: number;
  schedule_variance_pct: number;
  cost_variance_pct: number;

  critical_path_total_float_days: number;
  critical_tasks_count: number;
  longest_path_duration_days: number;

  variance_count: number;
  rebaseline_count: number;
  last_variance_at: string | null;
  last_rebaseline_at: string | null;
  variance_reason: string | null;
  rebaseline_reason: string | null;
  recovery_plan_summary: string | null;

  critical_path_breach: number;
  resource_constrained_over_pct_25: number;
  weather_window_at_risk: number;
  community_disruption_threshold_breached: number;
  EPC_subcontractor_milestone_at_risk: number;

  current_tier: IpsTier;
  authority_required: string | null;
  urgency_band: string | null;
  schedule_health_band: string | null;
  schedule_completeness_index: number;

  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  suspend_reason: string | null;
  cancel_reason: string | null;
  late_finish_reason: string | null;

  current_ball_in_court_party: string | null;
  last_responder_party: string | null;

  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  chain_status: IpsStatus;
  wbs_drafted_at: string | null;
  in_progress_at: string | null;
  status_updated_at: string | null;
  variance_detected_at: string | null;
  impact_assessed_at: string | null;
  rebaselined_at: string | null;
  recovered_at: string | null;
  completed_at: string | null;
  suspended_at: string | null;
  cancelled_at: string | null;
  late_finish_at: string | null;
  signoff_at: string | null;

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

interface IpsEventRow {
  id: string;
  schedule_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<IpsStatus, keyof IpsRow | null> = {
  wbs_drafted:       'wbs_drafted_at',
  baseline_set:      'baseline_set_at',
  in_progress:       'in_progress_at',
  status_updated:    'status_updated_at',
  variance_detected: 'variance_detected_at',
  impact_assessed:   'impact_assessed_at',
  rebaselined:       'rebaselined_at',
  recovered:         'recovered_at',
  completed:         'completed_at',
  suspended:         'suspended_at',
  cancelled:         'cancelled_at',
  late_finish:       'late_finish_at',
};

function statusEnteredAt(row: IpsRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.wbs_drafted_at ? new Date(row.wbs_drafted_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.wbs_drafted_at ? new Date(row.wbs_drafted_at) : null);
}

function decorate(row: IpsRow, now: Date) {
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

  // EVM live recomputation.
  const cpiLive = row.cpi ? row.cpi : costPerformanceIndex(row.earned_value_zar, row.actual_cost_zar);
  const spiLive = row.spi ? row.spi : schedulePerformanceIndex(row.earned_value_zar, row.planned_value_zar);
  const svZarLive = scheduleVarianceZar(row.earned_value_zar, row.planned_value_zar);
  const cvZarLive = costVarianceZar(row.earned_value_zar, row.actual_cost_zar);
  const svPctLive = scheduleVariancePct(row.earned_value_zar, row.planned_value_zar);
  const cvPctLive = costVariancePct(row.earned_value_zar, row.actual_cost_zar);

  const cpFloatLive = criticalPathFloatDays(row.critical_path_total_float_days);
  const daysToFinishLive = daysToPlannedFinish(row.current_planned_finish || row.baseline_planned_finish, now);
  const daysSinceBaselineLive = daysSinceBaseline(row.baseline_set_at, now);

  const floorFlags = countFloorFlags({
    critical_path_breach:                    row.critical_path_breach,
    resource_constrained_over_pct_25:        row.resource_constrained_over_pct_25,
    weather_window_at_risk:                  row.weather_window_at_risk,
    community_disruption_threshold_breached: row.community_disruption_threshold_breached,
    EPC_subcontractor_milestone_at_risk:     row.EPC_subcontractor_milestone_at_risk,
  });

  const healthBand = row.schedule_health_band
    ? row.schedule_health_band
    : scheduleHealthBand(spiLive, cpiLive, cpFloatLive);

  const completeness = scheduleCompletenessIndex({
    wbs_drafted:                  !!row.wbs_drafted_at,
    baseline_set:                 !!row.baseline_set_at,
    in_progress:                  !!row.in_progress_at,
    status_updated:               !!row.status_updated_at,
    variance_detected:            !!row.variance_detected_at,
    impact_assessed:              !!row.impact_assessed_at,
    rebaselined:                  !!row.rebaselined_at,
    recovered:                    !!row.recovered_at,
    completed:                    !!row.completed_at,
    clean_no_variance_bonus:      (row.variance_count || 0) === 0,
    clean_no_rebaseline_bonus:    (row.rebaseline_count || 0) === 0,
    clean_no_suspend_bonus:       !row.suspended_at,
    on_time_finish_bonus:         status === 'completed' && daysToFinishLive !== null && daysToFinishLive >= 0,
    cpi_above_1_bonus:            cpiLive > 1,
    spi_above_1_bonus:            spiLive > 1,
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
    cpi_live: cpiLive,
    spi_live: spiLive,
    schedule_variance_zar_live: svZarLive,
    cost_variance_zar_live: cvZarLive,
    schedule_variance_pct_live: svPctLive,
    cost_variance_pct_live: cvPctLive,
    critical_path_float_days_live: cpFloatLive,
    days_to_planned_finish_live: daysToFinishLive,
    days_since_baseline_live: daysSinceBaselineLive,
    late_finish_risk_live: isLateFinishRisk(status, daysToFinishLive, spiLive),
    rebaseline_imminent_live: isRebaselineImminent(status, spiLive, cpiLive),
    schedule_health_band_live: healthBand,
    floor_flag_count_live: floorFlags,
    schedule_completeness_index_live: completeness,
    bridges_to_procurement_chain_live: bridgesToProcurementChain(row.procurement_ref),
    bridges_to_cod_chain_live: bridgesToCodChain(row.cod_ref),
    bridges_to_insurance_claim_chain_live: bridgesToInsuranceClaimChain(row.insurance_claim_ref),
    bridges_to_hse_incident_chain_live: bridgesToHseIncidentChain(row.hse_incident_ref),
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
  const project    = c.req.query('project_id');
  const health     = c.req.query('schedule_health_band');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_ipp_schedule WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)    { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)  { sql += ' AND chain_status = ?'; binds.push(status); }
  if (project) { sql += ' AND project_id = ?';   binds.push(project); }
  if (health)  { sql += ' AND schedule_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(updated_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<IpsRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_project: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.schedule_health_band_live] = (by_health[i.schedule_health_band_live] || 0) + 1;
    by_project[i.project_id] = (by_project[i.project_id] || 0) + 1;
  }

  const active_count            = items.filter((i) => !i.is_terminal).length;
  const variance_count          = items.filter((i) => i.chain_status === 'variance_detected').length;
  const impact_assessed_count   = items.filter((i) => i.chain_status === 'impact_assessed').length;
  const rebaselined_count       = items.filter((i) => i.chain_status === 'rebaselined').length;
  const suspended_count         = items.filter((i) => i.chain_status === 'suspended').length;
  const late_finish_count       = items.filter((i) => i.chain_status === 'late_finish').length;
  const cancelled_count         = items.filter((i) => i.chain_status === 'cancelled').length;
  const completed_count         = items.filter((i) => i.chain_status === 'completed').length;
  const mega_count              = items.filter((i) => i.current_tier === 'mega').length;
  const breached_count          = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total        = items.filter((i) => i.is_reportable_flag).length;
  const late_finish_risk_count  = items.filter((i) => i.late_finish_risk_live).length;
  const rebaseline_imminent_count = items.filter((i) => i.rebaseline_imminent_live).length;
  const procurement_bridged     = items.filter((i) => i.bridges_to_procurement_chain_live).length;
  const cod_bridged             = items.filter((i) => i.bridges_to_cod_chain_live).length;
  const insurance_bridged       = items.filter((i) => i.bridges_to_insurance_claim_chain_live).length;
  const hse_bridged             = items.filter((i) => i.bridges_to_hse_incident_chain_live).length;
  const planned_value_zar_sum   = items.reduce((s, i) => s + (i.planned_value_zar || 0), 0);
  const earned_value_zar_sum    = items.reduce((s, i) => s + (i.earned_value_zar || 0), 0);
  const actual_cost_zar_sum     = items.reduce((s, i) => s + (i.actual_cost_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_health,
      by_project,
      active_count,
      variance_count,
      impact_assessed_count,
      rebaselined_count,
      suspended_count,
      late_finish_count,
      cancelled_count,
      completed_count,
      mega_count,
      breached: breached_count,
      reportable_total,
      late_finish_risk_count,
      rebaseline_imminent_count,
      procurement_bridged_count: procurement_bridged,
      cod_bridged_count: cod_bridged,
      insurance_bridged_count: insurance_bridged,
      hse_bridged_count: hse_bridged,
      planned_value_zar_sum,
      earned_value_zar_sum,
      actual_cost_zar_sum,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, schedule_health_band, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_ipp_schedule GROUP BY chain_status, current_tier, schedule_health_band, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; schedule_health_band: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.schedule_health_band) by_health[r.schedule_health_band] = (by_health[r.schedule_health_band] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_health, by_regulator_relevant, by_sla_breached } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_schedule WHERE id = ?').bind(id).first<IpsRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_schedule_events WHERE schedule_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<IpsEventRow>();

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
  project_id?: string;
  project_name?: string;
  project_capacity_mw?: number;
  project_type?: string;
  procurement_ref?: string;
  cod_ref?: string;
  insurance_claim_ref?: string;
  hse_incident_ref?: string;
  baseline_label?: string;
  baseline_total_tasks?: number;
  baseline_total_duration_days?: number;
  baseline_planned_start?: string;
  baseline_planned_finish?: string;
  current_planned_finish?: string;
  contractual_final_milestone_date?: string;
  budget_at_completion_zar?: number;
  critical_path_breach?: boolean | number;
  resource_constrained_over_pct_25?: boolean | number;
  weather_window_at_risk?: boolean | number;
  community_disruption_threshold_breached?: boolean | number;
  EPC_subcontractor_milestone_at_risk?: boolean | number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface SetBaselineBody extends CommonBody {
  baseline_label?: string;
  baseline_total_tasks?: number;
  baseline_total_duration_days?: number;
  baseline_planned_start?: string;
  baseline_planned_finish?: string;
  budget_at_completion_zar?: number;
  planned_value_zar?: number;
}

interface StartExecutionBody extends CommonBody {}

interface UpdateProgressBody extends CommonBody {
  percent_complete?: number;
  tasks_completed?: number;
  tasks_in_progress?: number;
  tasks_not_started?: number;
  earned_value_zar?: number;
  planned_value_zar?: number;
  actual_cost_zar?: number;
  critical_path_total_float_days?: number;
  critical_tasks_count?: number;
  longest_path_duration_days?: number;
}

interface DetectVarianceBody extends CommonBody {
  variance_reason?: string;
  earned_value_zar?: number;
  planned_value_zar?: number;
  actual_cost_zar?: number;
  critical_path_total_float_days?: number;
  critical_path_breach?: boolean | number;
  resource_constrained_over_pct_25?: boolean | number;
  weather_window_at_risk?: boolean | number;
  community_disruption_threshold_breached?: boolean | number;
  EPC_subcontractor_milestone_at_risk?: boolean | number;
}

interface AssessImpactBody extends CommonBody {
  current_planned_finish?: string;
  longest_path_duration_days?: number;
  spi_t?: number;
  earned_schedule_days?: number;
  actual_time_days?: number;
}

interface RebaselineBody extends CommonBody {
  baseline_label?: string;
  baseline_planned_finish?: string;
  current_planned_finish?: string;
  rebaseline_reason?: string;
  budget_at_completion_zar?: number;
}

interface ProposeRecoveryBody extends CommonBody {
  recovery_plan_summary?: string;
}

interface MarkRecoveredBody extends CommonBody {}
interface MarkCompletedBody extends CommonBody {
  current_planned_finish?: string;
}
interface MarkLateFinishBody extends CommonBody {
  late_finish_reason?: string;
  current_planned_finish?: string;
}
interface SuspendBody extends CommonBody {
  suspend_reason?: string;
}
interface ResumeBody extends CommonBody {}
interface CancelBody extends CommonBody {
  cancel_reason?: string;
}
interface ApproveRebaselineBody extends CommonBody {}
interface RejectRebaselineBody extends CommonBody {}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<IpsRow>): Partial<IpsRow> {
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
  const id = `ips-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `IPS-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const capacityMw = Number(body.project_capacity_mw ?? 0);
  const flags = {
    critical_path_breach:                    toFlag(body.critical_path_breach) ?? 0,
    resource_constrained_over_pct_25:        toFlag(body.resource_constrained_over_pct_25) ?? 0,
    weather_window_at_risk:                  toFlag(body.weather_window_at_risk) ?? 0,
    community_disruption_threshold_breached: toFlag(body.community_disruption_threshold_breached) ?? 0,
    EPC_subcontractor_milestone_at_risk:     toFlag(body.EPC_subcontractor_milestone_at_risk) ?? 0,
  };
  const rawTier = tierForCapacity(capacityMw);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('wbs_drafted', tier, now);
  const slaHrs = slaWindowHours('wbs_drafted', tier);

  await c.env.DB.prepare(
    `INSERT INTO oe_ipp_schedule (
      id, schedule_number,
      project_id, project_name, project_capacity_mw, project_type,
      procurement_ref, cod_ref, insurance_claim_ref, hse_incident_ref,
      baseline_label, baseline_total_tasks, baseline_total_duration_days,
      baseline_planned_start, baseline_planned_finish, current_planned_finish,
      contractual_final_milestone_date,
      budget_at_completion_zar,
      critical_path_breach, resource_constrained_over_pct_25,
      weather_window_at_risk, community_disruption_threshold_breached,
      EPC_subcontractor_milestone_at_risk,
      current_tier, authority_required, urgency_band, schedule_completeness_index,
      title, narrative,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, wbs_drafted_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.project_id ?? 'project-unknown', body.project_name ?? null, capacityMw, body.project_type ?? null,
    body.procurement_ref ?? null, body.cod_ref ?? null,
    body.insurance_claim_ref ?? null, body.hse_incident_ref ?? null,
    body.baseline_label ?? null,
    Number(body.baseline_total_tasks ?? 0),
    Number(body.baseline_total_duration_days ?? 0),
    body.baseline_planned_start ?? null,
    body.baseline_planned_finish ?? null,
    body.current_planned_finish ?? null,
    body.contractual_final_milestone_date ?? null,
    Number(body.budget_at_completion_zar ?? 0),
    flags.critical_path_breach, flags.resource_constrained_over_pct_25,
    flags.weather_window_at_risk, flags.community_disruption_threshold_breached,
    flags.EPC_subcontractor_milestone_at_risk,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs), 10,
    body.title ?? null, body.narrative ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'wbs_drafted', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `ipp_schedule_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_schedule_events (id, schedule_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'ipp_schedule_wbs_drafted',
    null, 'wbs_drafted', user.id, partyForAction('draft_wbs'),
    null, JSON.stringify({ tier, project_capacity_mw: capacityMw, project_id: body.project_id }), nowIso,
  ).run();

  await fireCascade({
    event: 'ipp_schedule_wbs_drafted',
    actor_id: user.id,
    entity_type: 'ipp_schedule',
    entity_id: id,
    data: {
      tier, project_capacity_mw: capacityMw, project_id: body.project_id,
      chain_status: 'wbs_drafted',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_schedule WHERE id = ?').bind(id).first<IpsRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: IpsAction,
  bodyHandler?: (row: IpsRow, body: Record<string, unknown>) => Partial<IpsRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_schedule WHERE id = ?').bind(id).first<IpsRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from current project_capacity_mw + 5 floor flags.
  const capacityMw = (overrides.project_capacity_mw as number | undefined) ?? row.project_capacity_mw;
  const rawTier = tierForCapacity(capacityMw);
  const floorFlags = {
    critical_path_breach:
      (overrides.critical_path_breach as number | undefined) ?? row.critical_path_breach,
    resource_constrained_over_pct_25:
      (overrides.resource_constrained_over_pct_25 as number | undefined) ?? row.resource_constrained_over_pct_25,
    weather_window_at_risk:
      (overrides.weather_window_at_risk as number | undefined) ?? row.weather_window_at_risk,
    community_disruption_threshold_breached:
      (overrides.community_disruption_threshold_breached as number | undefined) ?? row.community_disruption_threshold_breached,
    EPC_subcontractor_milestone_at_risk:
      (overrides.EPC_subcontractor_milestone_at_risk as number | undefined) ?? row.EPC_subcontractor_milestone_at_risk,
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

  // Action-specific bookkeeping
  if (action === 'detect_variance') {
    overrides.variance_count = (row.variance_count || 0) + 1;
    overrides.last_variance_at = nowIso;
  }
  if (action === 'rebaseline_schedule') {
    overrides.rebaseline_count = (row.rebaseline_count || 0) + 1;
    overrides.last_rebaseline_at = nowIso;
  }
  if (action === 'update_progress') {
    overrides.last_progress_update_at = nowIso;
  }
  if (action === 'approve_rebaseline') {
    overrides.signoff_at = nowIso;
  }

  // Re-compute EVM whenever EV/PV/AC changed.
  const ev = (overrides.earned_value_zar as number | undefined) ?? row.earned_value_zar;
  const pv = (overrides.planned_value_zar as number | undefined) ?? row.planned_value_zar;
  const ac = (overrides.actual_cost_zar as number | undefined) ?? row.actual_cost_zar;
  overrides.cpi = costPerformanceIndex(ev, ac);
  overrides.spi = schedulePerformanceIndex(ev, pv);
  overrides.schedule_variance_zar = scheduleVarianceZar(ev, pv);
  overrides.cost_variance_zar = costVarianceZar(ev, ac);
  overrides.schedule_variance_pct = scheduleVariancePct(ev, pv);
  overrides.cost_variance_pct = costVariancePct(ev, ac);

  // SPI_t derived from earned-schedule + actual-time if provided.
  if (typeof body.earned_schedule_days === 'number' && typeof body.actual_time_days === 'number') {
    overrides.spi_t = schedulePerformanceIndexT(
      body.earned_schedule_days as number,
      body.actual_time_days as number,
    );
  }

  // Critical-path float live-update.
  const cpFloat = (overrides.critical_path_total_float_days as number | undefined) ?? row.critical_path_total_float_days;
  overrides.critical_path_total_float_days = cpFloat;

  // Re-derive schedule_health_band from fresh CPI/SPI/float.
  overrides.schedule_health_band = scheduleHealthBand(
    (overrides.spi as number),
    (overrides.cpi as number),
    criticalPathFloatDays(cpFloat),
  );

  // SIGNATURE crossings.
  const crosses = crossesIntoRegulator(action, tier, {
    project_capacity_mw: capacityMw,
    critical_path_breach: floorFlags.critical_path_breach,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  overrides.urgency_band = urgencyBand(tier, slaHrs);

  // Recompute completeness on each transition.
  const willSetTs = (col: keyof IpsRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };
  const daysToFinishLive = daysToPlannedFinish(
    (overrides.current_planned_finish as string | undefined) ?? row.current_planned_finish ?? row.baseline_planned_finish,
    now,
  );
  overrides.schedule_completeness_index = scheduleCompletenessIndex({
    wbs_drafted:                  willSetTs('wbs_drafted_at'),
    baseline_set:                 willSetTs('baseline_set_at'),
    in_progress:                  willSetTs('in_progress_at'),
    status_updated:               willSetTs('status_updated_at'),
    variance_detected:            willSetTs('variance_detected_at'),
    impact_assessed:              willSetTs('impact_assessed_at'),
    rebaselined:                  willSetTs('rebaselined_at'),
    recovered:                    willSetTs('recovered_at'),
    completed:                    willSetTs('completed_at'),
    clean_no_variance_bonus:      ((overrides.variance_count as number | undefined) ?? row.variance_count) === 0,
    clean_no_rebaseline_bonus:    ((overrides.rebaseline_count as number | undefined) ?? row.rebaseline_count) === 0,
    clean_no_suspend_bonus:       !willSetTs('suspended_at'),
    on_time_finish_bonus:         to === 'completed' && daysToFinishLive !== null && daysToFinishLive >= 0,
    cpi_above_1_bonus:            (overrides.cpi as number) > 1,
    spi_above_1_bonus:            (overrides.spi as number) > 1,
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
    `UPDATE oe_ipp_schedule SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `ipp_schedule_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_schedule_events (id, schedule_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      entity_type: 'ipp_schedule',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_schedule WHERE id = ?').bind(id).first<IpsRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; draft_wbs handled by POST /) ──────
app.post('/:id/set-baseline', async (c) => transition(c, 'set_baseline', (_row, body) => {
  const b = body as Partial<SetBaselineBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.baseline_label === 'string')                out.baseline_label = b.baseline_label;
  if (typeof b.baseline_total_tasks === 'number')          out.baseline_total_tasks = b.baseline_total_tasks;
  if (typeof b.baseline_total_duration_days === 'number')  out.baseline_total_duration_days = b.baseline_total_duration_days;
  if (typeof b.baseline_planned_start === 'string')        out.baseline_planned_start = b.baseline_planned_start;
  if (typeof b.baseline_planned_finish === 'string')       out.baseline_planned_finish = b.baseline_planned_finish;
  if (typeof b.budget_at_completion_zar === 'number')      out.budget_at_completion_zar = b.budget_at_completion_zar;
  if (typeof b.planned_value_zar === 'number')             out.planned_value_zar = b.planned_value_zar;
  return applyCommon(b, out);
}));

app.post('/:id/start-execution', async (c) => transition(c, 'start_execution', (_row, body) =>
  applyCommon(body as Partial<StartExecutionBody>, {}),
));

app.post('/:id/update-progress', async (c) => transition(c, 'update_progress', (_row, body) => {
  const b = body as Partial<UpdateProgressBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.percent_complete === 'number')                out.percent_complete = b.percent_complete;
  if (typeof b.tasks_completed === 'number')                 out.tasks_completed = b.tasks_completed;
  if (typeof b.tasks_in_progress === 'number')               out.tasks_in_progress = b.tasks_in_progress;
  if (typeof b.tasks_not_started === 'number')               out.tasks_not_started = b.tasks_not_started;
  if (typeof b.earned_value_zar === 'number')                out.earned_value_zar = b.earned_value_zar;
  if (typeof b.planned_value_zar === 'number')               out.planned_value_zar = b.planned_value_zar;
  if (typeof b.actual_cost_zar === 'number')                 out.actual_cost_zar = b.actual_cost_zar;
  if (typeof b.critical_path_total_float_days === 'number')  out.critical_path_total_float_days = b.critical_path_total_float_days;
  if (typeof b.critical_tasks_count === 'number')            out.critical_tasks_count = b.critical_tasks_count;
  if (typeof b.longest_path_duration_days === 'number')      out.longest_path_duration_days = b.longest_path_duration_days;
  return applyCommon(b, out);
}));

app.post('/:id/detect-variance', async (c) => transition(c, 'detect_variance', (_row, body) => {
  const b = body as Partial<DetectVarianceBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.variance_reason === 'string')                 out.variance_reason = b.variance_reason;
  if (typeof b.earned_value_zar === 'number')                out.earned_value_zar = b.earned_value_zar;
  if (typeof b.planned_value_zar === 'number')               out.planned_value_zar = b.planned_value_zar;
  if (typeof b.actual_cost_zar === 'number')                 out.actual_cost_zar = b.actual_cost_zar;
  if (typeof b.critical_path_total_float_days === 'number')  out.critical_path_total_float_days = b.critical_path_total_float_days;
  const cpb = toFlag(b.critical_path_breach);
  if (cpb !== undefined) out.critical_path_breach = cpb;
  const rcb = toFlag(b.resource_constrained_over_pct_25);
  if (rcb !== undefined) out.resource_constrained_over_pct_25 = rcb;
  const wwb = toFlag(b.weather_window_at_risk);
  if (wwb !== undefined) out.weather_window_at_risk = wwb;
  const cdb = toFlag(b.community_disruption_threshold_breached);
  if (cdb !== undefined) out.community_disruption_threshold_breached = cdb;
  const epc = toFlag(b.EPC_subcontractor_milestone_at_risk);
  if (epc !== undefined) out.EPC_subcontractor_milestone_at_risk = epc;
  return applyCommon(b, out);
}));

app.post('/:id/assess-impact', async (c) => transition(c, 'assess_impact', (_row, body) => {
  const b = body as Partial<AssessImpactBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.current_planned_finish === 'string')          out.current_planned_finish = b.current_planned_finish;
  if (typeof b.longest_path_duration_days === 'number')      out.longest_path_duration_days = b.longest_path_duration_days;
  if (typeof b.spi_t === 'number')                           out.spi_t = b.spi_t;
  return applyCommon(b, out);
}));

app.post('/:id/rebaseline-schedule', async (c) => transition(c, 'rebaseline_schedule', (_row, body) => {
  const b = body as Partial<RebaselineBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.baseline_label === 'string')          out.baseline_label = b.baseline_label;
  if (typeof b.baseline_planned_finish === 'string') out.baseline_planned_finish = b.baseline_planned_finish;
  if (typeof b.current_planned_finish === 'string')  out.current_planned_finish = b.current_planned_finish;
  if (typeof b.rebaseline_reason === 'string')       out.rebaseline_reason = b.rebaseline_reason;
  if (typeof b.budget_at_completion_zar === 'number') out.budget_at_completion_zar = b.budget_at_completion_zar;
  return applyCommon(b, out);
}));

app.post('/:id/propose-recovery', async (c) => transition(c, 'propose_recovery', (_row, body) => {
  const b = body as Partial<ProposeRecoveryBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.recovery_plan_summary === 'string') out.recovery_plan_summary = b.recovery_plan_summary;
  return applyCommon(b, out);
}));

app.post('/:id/mark-recovered', async (c) => transition(c, 'mark_recovered', (_row, body) =>
  applyCommon(body as Partial<MarkRecoveredBody>, {}),
));

app.post('/:id/mark-completed', async (c) => transition(c, 'mark_completed', (_row, body) => {
  const b = body as Partial<MarkCompletedBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.current_planned_finish === 'string') out.current_planned_finish = b.current_planned_finish;
  return applyCommon(b, out);
}));

app.post('/:id/mark-late-finish', async (c) => transition(c, 'mark_late_finish', (_row, body) => {
  const b = body as Partial<MarkLateFinishBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.late_finish_reason === 'string')     out.late_finish_reason = b.late_finish_reason;
  if (typeof b.current_planned_finish === 'string') out.current_planned_finish = b.current_planned_finish;
  return applyCommon(b, out);
}));

app.post('/:id/suspend-schedule', async (c) => transition(c, 'suspend_schedule', (_row, body) => {
  const b = body as Partial<SuspendBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.suspend_reason === 'string') out.suspend_reason = b.suspend_reason;
  return applyCommon(b, out);
}));

app.post('/:id/resume-schedule', async (c) => transition(c, 'resume_schedule', (_row, body) =>
  applyCommon(body as Partial<ResumeBody>, {}),
));

app.post('/:id/cancel-schedule', async (c) => transition(c, 'cancel_schedule', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<IpsRow> = {};
  if (typeof b.cancel_reason === 'string') out.cancel_reason = b.cancel_reason;
  return applyCommon(b, out);
}));

app.post('/:id/approve-rebaseline', async (c) => transition(c, 'approve_rebaseline', (_row, body) =>
  applyCommon(body as Partial<ApproveRebaselineBody>, {}),
));

app.post('/:id/reject-rebaseline', async (c) => transition(c, 'reject_rebaseline', (_row, body) =>
  applyCommon(body as Partial<RejectRebaselineBody>, {}),
));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// Walks every active schedule row whose sla_deadline_at has elapsed, flips
// sla_breached=1, bumps escalation_level, fires ipp_schedule_sla_breached
// event. SLA breach crosses regulator on large + mega.
export async function ippScheduleSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_schedule
     WHERE chain_status NOT IN ('completed', 'cancelled', 'late_finish')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<IpsRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ipp_schedule
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ipp_schedule_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ipp_schedule_events (id, schedule_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'ipp_schedule_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'scheduler',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'ipp_schedule_sla_breached',
        actor_id: 'system',
        entity_type: 'ipp_schedule',
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

// ─── Cron: nightly schedule-health recompute (00:15 UTC) ──────────────────
//
// Walks every active schedule row, recomputes CPI/SPI/SV/CV + health band
// from the latest EV/PV/AC + critical_path_total_float_days, without a
// state transition. Keeps the LIVE battery accurate even on days nobody
// touched the row.
export async function ippScheduleHealthRecompute(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const nowIso = new Date().toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_schedule
     WHERE chain_status NOT IN ('completed', 'cancelled', 'late_finish')`,
  ).all<IpsRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const cpi = costPerformanceIndex(row.earned_value_zar, row.actual_cost_zar);
    const spi = schedulePerformanceIndex(row.earned_value_zar, row.planned_value_zar);
    const sv = scheduleVarianceZar(row.earned_value_zar, row.planned_value_zar);
    const cv = costVarianceZar(row.earned_value_zar, row.actual_cost_zar);
    const svp = scheduleVariancePct(row.earned_value_zar, row.planned_value_zar);
    const cvp = costVariancePct(row.earned_value_zar, row.actual_cost_zar);
    const cpFloat = criticalPathFloatDays(row.critical_path_total_float_days);
    const health = scheduleHealthBand(spi, cpi, cpFloat);

    await env.DB.prepare(
      `UPDATE oe_ipp_schedule
       SET cpi = ?, spi = ?,
           schedule_variance_zar = ?, cost_variance_zar = ?,
           schedule_variance_pct = ?, cost_variance_pct = ?,
           schedule_health_band = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(cpi, spi, sv, cv, svp, cvp, health, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

export default app;
