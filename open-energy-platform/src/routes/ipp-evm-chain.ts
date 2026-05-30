// ═══════════════════════════════════════════════════════════════════════════
// Wave 113 — IPP Cost Management & Earned Value Management (EVM) chain.
// 8th IPP chain. SECOND Phase-A IPP wave (sibling of W112). Mounted at
// /api/ipp-evm.
//
// Cost-book engine that owns "what is each ZAR doing, what was approved
// today, where is the overrun, how much contingency is left, what will it
// cost at completion?" for every IPP project end-to-end.
//
// Distinct from W19/W20/W23/W25/W27/W28 and the cost-side sibling of W112.
// Beats Procore Cost / Aconex Cost / Oracle Primavera Unifier / SAP
// S/4HANA EPC / Deltek Cobra / Coreworx / InEight Control / Hexagon EcoSys
// / ARES PRISM.
//
// Standards: PMBOK 7 + AACE RP-67R-11 + ANSI EIA-748-D + ISO 21500 + IFRS
// 15 / IAS 11 + REIPPPP cost reporting + DMRE §34 + SARB large-exposure.
//
// Write {admin, ipp_developer}. READ all 9 personas. actor_party split:
//   cost_engineer    : set_budget, commit_cost, incur_cost,
//                       measure_progress, detect_variance,
//                       draft_reforecast, draw_contingency
//   PM               : log_CR, approve_CR, reject_reforecast,
//                       publish_reforecast, submit_to_PM_review
//   finance_director : reconcile, close_book
//   CFO              : cancel, draw_management_reserve
//
// SIGNATURE regulator crossings:
//   draw_management_reserve -> EVERY tier when total_budget_zar >= 1
//                                (W113 SIGNATURE; board-level cost-overrun
//                                 event always reportable to lenders +
//                                 IPPO + DMRE)
//   cancel                  -> EVERY tier (project cost cancellation =
//                                lender + IPPO write-back)
//   publish_reforecast      -> large + mega when VAC<0 OR CPI<0.85
//                                (REIPPPP cost-overrun disclosure)
//   approve_CR              -> mega only when CR_value >= 10% budget
//                                (SARB large-exposure)
//   sla_breached            -> regulator large + mega
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
  tierForBudget,
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
  bridgesToScheduleChain,
  bridgesToDrawdownChain,
  bridgesToDisbursementChain,
  bridgesToReserveAccountChain,
  costPerformanceIndex,
  schedulePerformanceIndex,
  costVarianceZar,
  scheduleVarianceZar,
  estimateAtCompletionZar,
  estimateToCompleteZar,
  varianceAtCompletionZar,
  toCompletePerformanceIndex,
  contingencyRemainingPct,
  managementReserveRemainingPct,
  evmCompletenessIndex,
  type IpeStatus,
  type IpeAction,
  type IpeTier,
} from '../utils/ipp-evm-spec';

const READ_ROLES = new Set([
  'admin', 'ipp_developer',
  'trader', 'offtaker', 'grid_operator', 'regulator', 'lender', 'support', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

interface IpeRow {
  id: string;
  evm_number: string;

  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  cost_book_period: string | null;

  schedule_ref: string | null;
  drawdown_ref: string | null;
  disbursement_ref: string | null;
  reserve_account_ref: string | null;

  total_budget_zar: number;
  contingency_initial_zar: number;
  contingency_drawn_zar: number;
  contingency_remaining_pct: number;
  management_reserve_initial_zar: number;
  management_reserve_drawn_zar: number;
  management_reserve_remaining_pct: number;
  currency_code: string;
  forex_component_pct: number;

  committed_cost_zar: number;
  incurred_cost_zar: number;
  invoiced_cost_zar: number;
  paid_cost_zar: number;
  last_cost_update_at: string | null;

  planned_value_zar: number;
  earned_value_zar: number;
  actual_cost_zar: number;
  budget_at_completion_zar: number;
  estimate_at_completion_zar: number;
  estimate_to_complete_zar: number;
  variance_at_completion_zar: number;
  cpi: number;
  spi: number;
  tcpi: number;
  cost_variance_zar: number;
  schedule_variance_zar: number;

  variance_count: number;
  reforecast_count: number;
  cr_count: number;
  cr_value_zar: number;
  last_variance_at: string | null;
  last_reforecast_at: string | null;
  last_cr_at: string | null;
  variance_reason: string | null;
  reforecast_reason: string | null;
  reforecast_rejection_reason: string | null;
  cr_summary: string | null;

  cpi_below_pct_85: number;
  contingency_consumed_pct_75: number;
  management_reserve_drawn: number;
  forex_variance_above_pct_10: number;
  multi_currency_book: number;

  current_tier: IpeTier;
  authority_required: string | null;
  urgency_band: string | null;
  evm_health_band: string | null;
  evm_completeness_index: number;

  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  cancel_reason: string | null;

  current_ball_in_court_party: string | null;
  last_responder_party: string | null;

  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  chain_status: IpeStatus;
  budget_set_at: string | null;
  committed_at: string | null;
  incurred_at: string | null;
  measured_at: string | null;
  variance_detected_at: string | null;
  reforecast_drafted_at: string | null;
  cr_logged_at: string | null;
  cr_approved_at: string | null;
  reforecast_published_at: string | null;
  reconciled_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  reforecast_rejected_at: string | null;
  contingency_drawn_at: string | null;
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

interface IpeEventRow {
  id: string;
  evm_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<IpeStatus, keyof IpeRow | null> = {
  budget_set:           'budget_set_at',
  committed:            'committed_at',
  incurred:             'incurred_at',
  measured:             'measured_at',
  variance_detected:    'variance_detected_at',
  reforecast_drafted:   'reforecast_drafted_at',
  CR_logged:            'cr_logged_at',
  CR_approved:          'cr_approved_at',
  reforecast_published: 'reforecast_published_at',
  reconciled:           'reconciled_at',
  closed:               'closed_at',
  cancelled:            'cancelled_at',
  reforecast_rejected:  'reforecast_rejected_at',
  contingency_drawn:    'contingency_drawn_at',
};

function statusEnteredAt(row: IpeRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.budget_set_at ? new Date(row.budget_set_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.budget_set_at ? new Date(row.budget_set_at) : null);
}

// EVM health band — green/amber/red/critical from CPI + VAC% vs BAC.
function evmHealthBand(cpi: number, vacPctOfBac: number): 'green' | 'amber' | 'red' | 'critical' {
  if (cpi < 0.70 || vacPctOfBac < -0.20) return 'critical';
  if (cpi < 0.85 || vacPctOfBac < -0.10) return 'red';
  if (cpi < 0.95 || vacPctOfBac < -0.03) return 'amber';
  return 'green';
}

function decorate(row: IpeRow, now: Date) {
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
  const bacLive = row.budget_at_completion_zar || row.total_budget_zar;
  const eacLive = estimateAtCompletionZar(bacLive, cpiLive);
  const etcLive = estimateToCompleteZar(eacLive, row.actual_cost_zar);
  const vacLive = varianceAtCompletionZar(bacLive, eacLive);
  const tcpiLive = toCompletePerformanceIndex(bacLive, row.earned_value_zar, row.actual_cost_zar);
  const vacPctLive = bacLive > 0 ? vacLive / bacLive : 0;
  const contRemPctLive = contingencyRemainingPct(row.contingency_initial_zar, row.contingency_drawn_zar);
  const mrRemPctLive = managementReserveRemainingPct(row.management_reserve_initial_zar, row.management_reserve_drawn_zar);

  const floorFlags = countFloorFlags({
    cpi_below_pct_85:            row.cpi_below_pct_85,
    contingency_consumed_pct_75: row.contingency_consumed_pct_75,
    management_reserve_drawn:    row.management_reserve_drawn,
    forex_variance_above_pct_10: row.forex_variance_above_pct_10,
    multi_currency_book:         row.multi_currency_book,
  });

  const healthBand = row.evm_health_band
    ? row.evm_health_band
    : evmHealthBand(cpiLive, vacPctLive);

  const completeness = evmCompletenessIndex({
    budget_set:           !!row.budget_set_at,
    committed:            !!row.committed_at,
    incurred:             !!row.incurred_at,
    measured:             !!row.measured_at,
    variance_detected:    !!row.variance_detected_at,
    reforecast_drafted:   !!row.reforecast_drafted_at,
    CR_logged:            !!row.cr_logged_at,
    CR_approved:          !!row.cr_approved_at,
    reforecast_published: !!row.reforecast_published_at,
    reconciled:           !!row.reconciled_at,
    first_close_bonus:    status === 'closed' && (row.variance_count || 0) <= 1,
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
    cost_variance_zar_live: cvZarLive,
    schedule_variance_zar_live: svZarLive,
    estimate_at_completion_zar_live: eacLive,
    estimate_to_complete_zar_live: etcLive,
    variance_at_completion_zar_live: vacLive,
    tcpi_live: tcpiLive,
    vac_pct_of_bac_live: vacPctLive,
    contingency_remaining_pct_live: contRemPctLive,
    management_reserve_remaining_pct_live: mrRemPctLive,
    evm_health_band_live: healthBand,
    floor_flag_count_live: floorFlags,
    evm_completeness_index_live: completeness,
    bridges_to_schedule_chain_live: bridgesToScheduleChain(row.schedule_ref),
    bridges_to_drawdown_chain_live: bridgesToDrawdownChain(row.drawdown_ref),
    bridges_to_disbursement_chain_live: bridgesToDisbursementChain(row.disbursement_ref),
    bridges_to_reserve_account_chain_live: bridgesToReserveAccountChain(row.reserve_account_ref),
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
  const health     = c.req.query('evm_health_band');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_ipp_evm WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)    { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)  { sql += ' AND chain_status = ?'; binds.push(status); }
  if (project) { sql += ' AND project_id = ?';   binds.push(project); }
  if (health)  { sql += ' AND evm_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(updated_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<IpeRow>();
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
    by_health[i.evm_health_band_live] = (by_health[i.evm_health_band_live] || 0) + 1;
    by_project[i.project_id] = (by_project[i.project_id] || 0) + 1;
  }

  const active_count            = items.filter((i) => !i.is_terminal).length;
  const variance_count          = items.filter((i) => i.chain_status === 'variance_detected').length;
  const reforecast_drafted_count = items.filter((i) => i.chain_status === 'reforecast_drafted').length;
  const cr_logged_count         = items.filter((i) => i.chain_status === 'CR_logged').length;
  const cr_approved_count       = items.filter((i) => i.chain_status === 'CR_approved').length;
  const published_count         = items.filter((i) => i.chain_status === 'reforecast_published').length;
  const contingency_drawn_count = items.filter((i) => i.chain_status === 'contingency_drawn').length;
  const rejected_count          = items.filter((i) => i.chain_status === 'reforecast_rejected').length;
  const closed_count            = items.filter((i) => i.chain_status === 'closed').length;
  const cancelled_count         = items.filter((i) => i.chain_status === 'cancelled').length;
  const mega_count              = items.filter((i) => i.current_tier === 'mega').length;
  const breached_count          = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total        = items.filter((i) => i.is_reportable_flag).length;
  const mr_drawn_count          = items.filter((i) => i.management_reserve_drawn).length;
  const cpi_below_count         = items.filter((i) => i.cpi_below_pct_85).length;
  const schedule_bridged        = items.filter((i) => i.bridges_to_schedule_chain_live).length;
  const drawdown_bridged        = items.filter((i) => i.bridges_to_drawdown_chain_live).length;
  const disbursement_bridged    = items.filter((i) => i.bridges_to_disbursement_chain_live).length;
  const reserve_account_bridged = items.filter((i) => i.bridges_to_reserve_account_chain_live).length;
  const total_budget_zar_sum    = items.reduce((s, i) => s + (i.total_budget_zar || 0), 0);
  const earned_value_zar_sum    = items.reduce((s, i) => s + (i.earned_value_zar || 0), 0);
  const actual_cost_zar_sum     = items.reduce((s, i) => s + (i.actual_cost_zar || 0), 0);
  const contingency_drawn_zar_sum = items.reduce((s, i) => s + (i.contingency_drawn_zar || 0), 0);
  const mr_drawn_zar_sum        = items.reduce((s, i) => s + (i.management_reserve_drawn_zar || 0), 0);

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
      reforecast_drafted_count,
      cr_logged_count,
      cr_approved_count,
      published_count,
      contingency_drawn_count,
      rejected_count,
      closed_count,
      cancelled_count,
      mega_count,
      breached: breached_count,
      reportable_total,
      mr_drawn_count,
      cpi_below_count,
      schedule_bridged_count: schedule_bridged,
      drawdown_bridged_count: drawdown_bridged,
      disbursement_bridged_count: disbursement_bridged,
      reserve_account_bridged_count: reserve_account_bridged,
      total_budget_zar_sum,
      earned_value_zar_sum,
      actual_cost_zar_sum,
      contingency_drawn_zar_sum,
      mr_drawn_zar_sum,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, evm_health_band, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_ipp_evm GROUP BY chain_status, current_tier, evm_health_band, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; evm_health_band: string | null;
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
    if (r.evm_health_band) by_health[r.evm_health_band] = (by_health[r.evm_health_band] || 0) + r.n;
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_evm WHERE id = ?').bind(id).first<IpeRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_evm_events WHERE evm_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<IpeEventRow>();

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
  cost_book_period?: string;
  schedule_ref?: string;
  drawdown_ref?: string;
  disbursement_ref?: string;
  reserve_account_ref?: string;
  total_budget_zar?: number;
  contingency_initial_zar?: number;
  management_reserve_initial_zar?: number;
  budget_at_completion_zar?: number;
  currency_code?: string;
  forex_component_pct?: number;
  cpi_below_pct_85?: boolean | number;
  contingency_consumed_pct_75?: boolean | number;
  management_reserve_drawn?: boolean | number;
  forex_variance_above_pct_10?: boolean | number;
  multi_currency_book?: boolean | number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface CommitCostBody extends CommonBody {
  committed_cost_zar?: number;
  planned_value_zar?: number;
}

interface IncurCostBody extends CommonBody {
  incurred_cost_zar?: number;
  invoiced_cost_zar?: number;
  paid_cost_zar?: number;
  actual_cost_zar?: number;
}

interface MeasureProgressBody extends CommonBody {
  earned_value_zar?: number;
  planned_value_zar?: number;
  actual_cost_zar?: number;
}

interface DetectVarianceBody extends CommonBody {
  variance_reason?: string;
  earned_value_zar?: number;
  planned_value_zar?: number;
  actual_cost_zar?: number;
  cpi_below_pct_85?: boolean | number;
  contingency_consumed_pct_75?: boolean | number;
  management_reserve_drawn?: boolean | number;
  forex_variance_above_pct_10?: boolean | number;
  multi_currency_book?: boolean | number;
}

interface DraftReforecastBody extends CommonBody {
  reforecast_reason?: string;
  estimate_at_completion_zar?: number;
}

interface LogCrBody extends CommonBody {
  cr_summary?: string;
  cr_value_zar?: number;
}

interface ApproveCrBody extends CommonBody {
  cr_value_zar?: number;
}

interface RejectReforecastBody extends CommonBody {
  reforecast_rejection_reason?: string;
}

interface PublishReforecastBody extends CommonBody {
  estimate_at_completion_zar?: number;
}

interface ReconcileBody extends CommonBody {}
interface CloseBookBody extends CommonBody {}
interface CancelBody extends CommonBody {
  cancel_reason?: string;
}

interface DrawContingencyBody extends CommonBody {
  contingency_drawn_zar?: number;
}

interface DrawManagementReserveBody extends CommonBody {
  management_reserve_drawn_zar?: number;
}

interface SubmitToPmReviewBody extends CommonBody {}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<IpeRow>): Partial<IpeRow> {
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

// ─── Create endpoint (set_budget) ────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `ipe-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `IPE-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const totalBudget = Number(body.total_budget_zar ?? 0);
  const flags = {
    cpi_below_pct_85:            toFlag(body.cpi_below_pct_85) ?? 0,
    contingency_consumed_pct_75: toFlag(body.contingency_consumed_pct_75) ?? 0,
    management_reserve_drawn:    toFlag(body.management_reserve_drawn) ?? 0,
    forex_variance_above_pct_10: toFlag(body.forex_variance_above_pct_10) ?? 0,
    multi_currency_book:         toFlag(body.multi_currency_book) ?? 0,
  };
  const rawTier = tierForBudget(totalBudget);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('budget_set', tier, now);
  const slaHrs = slaWindowHours('budget_set', tier);
  const contingencyInit = Number(body.contingency_initial_zar ?? 0);
  const mrInit = Number(body.management_reserve_initial_zar ?? 0);
  const bac = Number(body.budget_at_completion_zar ?? totalBudget);

  await c.env.DB.prepare(
    `INSERT INTO oe_ipp_evm (
      id, evm_number,
      project_id, project_name, project_capacity_mw, project_type, cost_book_period,
      schedule_ref, drawdown_ref, disbursement_ref, reserve_account_ref,
      total_budget_zar,
      contingency_initial_zar, contingency_drawn_zar, contingency_remaining_pct,
      management_reserve_initial_zar, management_reserve_drawn_zar, management_reserve_remaining_pct,
      currency_code, forex_component_pct,
      budget_at_completion_zar,
      cpi_below_pct_85, contingency_consumed_pct_75, management_reserve_drawn,
      forex_variance_above_pct_10, multi_currency_book,
      current_tier, authority_required, urgency_band, evm_completeness_index,
      title, narrative,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, budget_set_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.project_id ?? 'project-unknown', body.project_name ?? null,
    Number(body.project_capacity_mw ?? 0), body.project_type ?? null,
    body.cost_book_period ?? null,
    body.schedule_ref ?? null, body.drawdown_ref ?? null,
    body.disbursement_ref ?? null, body.reserve_account_ref ?? null,
    totalBudget,
    contingencyInit, 0, 100,
    mrInit, 0, 100,
    body.currency_code ?? 'ZAR', Number(body.forex_component_pct ?? 0),
    bac,
    flags.cpi_below_pct_85, flags.contingency_consumed_pct_75, flags.management_reserve_drawn,
    flags.forex_variance_above_pct_10, flags.multi_currency_book,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs), 15,
    body.title ?? null, body.narrative ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'budget_set', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `ipp_evm_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_evm_events (id, evm_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'ipp_evm_budget_set',
    null, 'budget_set', user.id, partyForAction('set_budget'),
    null, JSON.stringify({ tier, total_budget_zar: totalBudget, project_id: body.project_id }), nowIso,
  ).run();

  await fireCascade({
    event: 'ipp_evm_budget_set',
    actor_id: user.id,
    entity_type: 'ipp_evm',
    entity_id: id,
    data: {
      tier, total_budget_zar: totalBudget, project_id: body.project_id,
      chain_status: 'budget_set',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_evm WHERE id = ?').bind(id).first<IpeRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: IpeAction,
  bodyHandler?: (row: IpeRow, body: Record<string, unknown>) => Partial<IpeRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_evm WHERE id = ?').bind(id).first<IpeRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from current total_budget_zar + 5 floor flags.
  const totalBudget = (overrides.total_budget_zar as number | undefined) ?? row.total_budget_zar;
  const rawTier = tierForBudget(totalBudget);
  const floorFlags = {
    cpi_below_pct_85:
      (overrides.cpi_below_pct_85 as number | undefined) ?? row.cpi_below_pct_85,
    contingency_consumed_pct_75:
      (overrides.contingency_consumed_pct_75 as number | undefined) ?? row.contingency_consumed_pct_75,
    management_reserve_drawn:
      (overrides.management_reserve_drawn as number | undefined) ?? row.management_reserve_drawn,
    forex_variance_above_pct_10:
      (overrides.forex_variance_above_pct_10 as number | undefined) ?? row.forex_variance_above_pct_10,
    multi_currency_book:
      (overrides.multi_currency_book as number | undefined) ?? row.multi_currency_book,
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
  if (action === 'draft_reforecast' || action === 'publish_reforecast') {
    overrides.reforecast_count = (row.reforecast_count || 0) + 1;
    overrides.last_reforecast_at = nowIso;
  }
  if (action === 'log_CR') {
    overrides.cr_count = (row.cr_count || 0) + 1;
    overrides.last_cr_at = nowIso;
  }
  if (action === 'measure_progress' || action === 'incur_cost' || action === 'commit_cost') {
    overrides.last_cost_update_at = nowIso;
  }
  if (action === 'close_book') {
    overrides.signoff_at = nowIso;
  }
  if (action === 'draw_contingency') {
    // contingency_consumed_pct_75 flag re-derived from drawn ratio.
    const newDrawn = (overrides.contingency_drawn_zar as number | undefined) ?? row.contingency_drawn_zar;
    const init = row.contingency_initial_zar || 0;
    const consumedPct = init > 0 ? newDrawn / init : 0;
    overrides.contingency_consumed_pct_75 = consumedPct >= 0.75 ? 1 : 0;
    overrides.contingency_remaining_pct = contingencyRemainingPct(init, newDrawn);
  }
  if (action === 'draw_management_reserve') {
    overrides.management_reserve_drawn = 1;
    const newMrDrawn = (overrides.management_reserve_drawn_zar as number | undefined) ?? row.management_reserve_drawn_zar;
    overrides.management_reserve_remaining_pct = managementReserveRemainingPct(
      row.management_reserve_initial_zar, newMrDrawn,
    );
  }

  // Re-compute EVM whenever EV/PV/AC changed (or after MR draw / contingency).
  const ev = (overrides.earned_value_zar as number | undefined) ?? row.earned_value_zar;
  const pv = (overrides.planned_value_zar as number | undefined) ?? row.planned_value_zar;
  const ac = (overrides.actual_cost_zar as number | undefined) ?? row.actual_cost_zar;
  const bac = (overrides.budget_at_completion_zar as number | undefined) ?? row.budget_at_completion_zar ?? totalBudget;
  const cpi = costPerformanceIndex(ev, ac);
  const spi = schedulePerformanceIndex(ev, pv);
  const eac = (overrides.estimate_at_completion_zar as number | undefined) ?? estimateAtCompletionZar(bac, cpi);
  const etc = estimateToCompleteZar(eac, ac);
  const vac = varianceAtCompletionZar(bac, eac);
  const tcpi = toCompletePerformanceIndex(bac, ev, ac);
  const crValue = (overrides.cr_value_zar as number | undefined) ?? row.cr_value_zar;
  overrides.cpi = cpi;
  overrides.spi = spi;
  overrides.estimate_at_completion_zar = eac;
  overrides.estimate_to_complete_zar = etc;
  overrides.variance_at_completion_zar = vac;
  overrides.tcpi = tcpi;
  overrides.cost_variance_zar = costVarianceZar(ev, ac);
  overrides.schedule_variance_zar = scheduleVarianceZar(ev, pv);

  // CPI floor flag re-derived from fresh CPI.
  if (cpi > 0 && cpi < 0.85) overrides.cpi_below_pct_85 = 1;

  // Re-derive evm_health_band from fresh CPI + VAC%/BAC.
  const vacPct = bac > 0 ? vac / bac : 0;
  overrides.evm_health_band = evmHealthBand(cpi, vacPct);

  // SIGNATURE crossings.
  const crosses = crossesIntoRegulator(action, tier, {
    total_budget_zar: totalBudget,
    cpi,
    vac_zar: vac,
    cr_value_zar: crValue,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  overrides.urgency_band = urgencyBand(tier, slaHrs);

  // Recompute completeness on each transition.
  const willSetTs = (col: keyof IpeRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };
  overrides.evm_completeness_index = evmCompletenessIndex({
    budget_set:           willSetTs('budget_set_at'),
    committed:            willSetTs('committed_at'),
    incurred:             willSetTs('incurred_at'),
    measured:             willSetTs('measured_at'),
    variance_detected:    willSetTs('variance_detected_at'),
    reforecast_drafted:   willSetTs('reforecast_drafted_at'),
    CR_logged:            willSetTs('cr_logged_at'),
    CR_approved:          willSetTs('cr_approved_at'),
    reforecast_published: willSetTs('reforecast_published_at'),
    reconciled:           willSetTs('reconciled_at'),
    first_close_bonus:    to === 'closed' && (((overrides.variance_count as number | undefined) ?? row.variance_count) || 0) <= 1,
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
    `UPDATE oe_ipp_evm SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `ipp_evm_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_evm_events (id, evm_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      entity_type: 'ipp_evm',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_evm WHERE id = ?').bind(id).first<IpeRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; set_budget handled by POST /) ─────
app.post('/:id/commit-cost', async (c) => transition(c, 'commit_cost', (_row, body) => {
  const b = body as Partial<CommitCostBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.committed_cost_zar === 'number') out.committed_cost_zar = b.committed_cost_zar;
  if (typeof b.planned_value_zar === 'number')  out.planned_value_zar = b.planned_value_zar;
  return applyCommon(b, out);
}));

app.post('/:id/incur-cost', async (c) => transition(c, 'incur_cost', (_row, body) => {
  const b = body as Partial<IncurCostBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.incurred_cost_zar === 'number') out.incurred_cost_zar = b.incurred_cost_zar;
  if (typeof b.invoiced_cost_zar === 'number') out.invoiced_cost_zar = b.invoiced_cost_zar;
  if (typeof b.paid_cost_zar === 'number')     out.paid_cost_zar = b.paid_cost_zar;
  if (typeof b.actual_cost_zar === 'number')   out.actual_cost_zar = b.actual_cost_zar;
  return applyCommon(b, out);
}));

app.post('/:id/measure-progress', async (c) => transition(c, 'measure_progress', (_row, body) => {
  const b = body as Partial<MeasureProgressBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.earned_value_zar === 'number')  out.earned_value_zar = b.earned_value_zar;
  if (typeof b.planned_value_zar === 'number') out.planned_value_zar = b.planned_value_zar;
  if (typeof b.actual_cost_zar === 'number')   out.actual_cost_zar = b.actual_cost_zar;
  return applyCommon(b, out);
}));

app.post('/:id/detect-variance', async (c) => transition(c, 'detect_variance', (_row, body) => {
  const b = body as Partial<DetectVarianceBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.variance_reason === 'string')     out.variance_reason = b.variance_reason;
  if (typeof b.earned_value_zar === 'number')    out.earned_value_zar = b.earned_value_zar;
  if (typeof b.planned_value_zar === 'number')   out.planned_value_zar = b.planned_value_zar;
  if (typeof b.actual_cost_zar === 'number')     out.actual_cost_zar = b.actual_cost_zar;
  const f1 = toFlag(b.cpi_below_pct_85);             if (f1 !== undefined) out.cpi_below_pct_85 = f1;
  const f2 = toFlag(b.contingency_consumed_pct_75);  if (f2 !== undefined) out.contingency_consumed_pct_75 = f2;
  const f3 = toFlag(b.management_reserve_drawn);     if (f3 !== undefined) out.management_reserve_drawn = f3;
  const f4 = toFlag(b.forex_variance_above_pct_10);  if (f4 !== undefined) out.forex_variance_above_pct_10 = f4;
  const f5 = toFlag(b.multi_currency_book);          if (f5 !== undefined) out.multi_currency_book = f5;
  return applyCommon(b, out);
}));

app.post('/:id/draft-reforecast', async (c) => transition(c, 'draft_reforecast', (_row, body) => {
  const b = body as Partial<DraftReforecastBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.reforecast_reason === 'string')          out.reforecast_reason = b.reforecast_reason;
  if (typeof b.estimate_at_completion_zar === 'number') out.estimate_at_completion_zar = b.estimate_at_completion_zar;
  return applyCommon(b, out);
}));

app.post('/:id/log-cr', async (c) => transition(c, 'log_CR', (_row, body) => {
  const b = body as Partial<LogCrBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.cr_summary === 'string')    out.cr_summary = b.cr_summary;
  if (typeof b.cr_value_zar === 'number')  out.cr_value_zar = b.cr_value_zar;
  return applyCommon(b, out);
}));

app.post('/:id/approve-cr', async (c) => transition(c, 'approve_CR', (_row, body) => {
  const b = body as Partial<ApproveCrBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.cr_value_zar === 'number') out.cr_value_zar = b.cr_value_zar;
  return applyCommon(b, out);
}));

app.post('/:id/reject-reforecast', async (c) => transition(c, 'reject_reforecast', (_row, body) => {
  const b = body as Partial<RejectReforecastBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.reforecast_rejection_reason === 'string') out.reforecast_rejection_reason = b.reforecast_rejection_reason;
  return applyCommon(b, out);
}));

app.post('/:id/publish-reforecast', async (c) => transition(c, 'publish_reforecast', (_row, body) => {
  const b = body as Partial<PublishReforecastBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.estimate_at_completion_zar === 'number') out.estimate_at_completion_zar = b.estimate_at_completion_zar;
  return applyCommon(b, out);
}));

app.post('/:id/reconcile', async (c) => transition(c, 'reconcile', (_row, body) =>
  applyCommon(body as Partial<ReconcileBody>, {}),
));

app.post('/:id/close-book', async (c) => transition(c, 'close_book', (_row, body) =>
  applyCommon(body as Partial<CloseBookBody>, {}),
));

app.post('/:id/cancel', async (c) => transition(c, 'cancel', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.cancel_reason === 'string') out.cancel_reason = b.cancel_reason;
  return applyCommon(b, out);
}));

app.post('/:id/draw-contingency', async (c) => transition(c, 'draw_contingency', (_row, body) => {
  const b = body as Partial<DrawContingencyBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.contingency_drawn_zar === 'number') out.contingency_drawn_zar = b.contingency_drawn_zar;
  return applyCommon(b, out);
}));

app.post('/:id/draw-management-reserve', async (c) => transition(c, 'draw_management_reserve', (_row, body) => {
  const b = body as Partial<DrawManagementReserveBody>;
  const out: Partial<IpeRow> = {};
  if (typeof b.management_reserve_drawn_zar === 'number') out.management_reserve_drawn_zar = b.management_reserve_drawn_zar;
  return applyCommon(b, out);
}));

app.post('/:id/submit-to-pm-review', async (c) => transition(c, 'submit_to_PM_review', (_row, body) =>
  applyCommon(body as Partial<SubmitToPmReviewBody>, {}),
));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// Walks every active EVM row whose sla_deadline_at has elapsed, flips
// sla_breached=1, bumps escalation_level, fires ipp_evm_sla_breached
// event. SLA breach crosses regulator on large + mega.
export async function ippEvmSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_evm
     WHERE chain_status NOT IN ('closed', 'cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<IpeRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ipp_evm
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ipp_evm_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ipp_evm_events (id, evm_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'ipp_evm_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'cost_engineer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'ipp_evm_sla_breached',
        actor_id: 'system',
        entity_type: 'ipp_evm',
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

// ─── Cron: nightly EVM recompute (00:20 UTC) ──────────────────────────────
//
// Walks every active EVM row, recomputes CPI/SPI/EAC/ETC/VAC/TCPI +
// contingency/MR remaining % + health band from the latest EV/PV/AC +
// drawn amounts, WITHOUT auto-transitioning. Cost decisions are never
// moved by cron — only the LIVE battery is refreshed.
export async function ippEvmHealthRecompute(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const nowIso = new Date().toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_evm
     WHERE chain_status NOT IN ('closed', 'cancelled')`,
  ).all<IpeRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const cpi = costPerformanceIndex(row.earned_value_zar, row.actual_cost_zar);
    const spi = schedulePerformanceIndex(row.earned_value_zar, row.planned_value_zar);
    const cv = costVarianceZar(row.earned_value_zar, row.actual_cost_zar);
    const sv = scheduleVarianceZar(row.earned_value_zar, row.planned_value_zar);
    const bac = row.budget_at_completion_zar || row.total_budget_zar;
    const eac = estimateAtCompletionZar(bac, cpi);
    const etc = estimateToCompleteZar(eac, row.actual_cost_zar);
    const vac = varianceAtCompletionZar(bac, eac);
    const tcpi = toCompletePerformanceIndex(bac, row.earned_value_zar, row.actual_cost_zar);
    const contRem = contingencyRemainingPct(row.contingency_initial_zar, row.contingency_drawn_zar);
    const mrRem = managementReserveRemainingPct(row.management_reserve_initial_zar, row.management_reserve_drawn_zar);
    const vacPct = bac > 0 ? vac / bac : 0;
    const health = evmHealthBand(cpi, vacPct);

    await env.DB.prepare(
      `UPDATE oe_ipp_evm
       SET cpi = ?, spi = ?,
           cost_variance_zar = ?, schedule_variance_zar = ?,
           estimate_at_completion_zar = ?, estimate_to_complete_zar = ?,
           variance_at_completion_zar = ?, tcpi = ?,
           contingency_remaining_pct = ?, management_reserve_remaining_pct = ?,
           evm_health_band = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(cpi, spi, cv, sv, eac, etc, vac, tcpi, contRem, mrRem, health, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

export default app;
