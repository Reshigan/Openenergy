// ═══════════════════════════════════════════════════════════════════════════
// Wave 86 — Lender DSCR (Debt-Service-Coverage-Ratio) Monitoring & Cure (P6).
// 10th Lender chain.
//
// Mounted at /api/dscr-monitoring/chain.
//
// The COVERAGE-DEFENSE engine of the project-finance loan book. LMA covenant
// schedule + SARB IFRS 9 Stage 2/3 trigger framework + Basel III LCR/NSFR.
// Implements quarterly ratio testing (DSCR/LLCR/PLCR) on each test date with
// 12-state cure lifecycle — clean certification, watch, breach, lock-up,
// cure proposal/execution/validation, acceleration to W45, or waiver.
//
// DISTINCTIVE move (beats Mott MacDonald PFlex / Riverbed-PF / Modelware / FIS
// Sungard Reflect / Excel-based bank PF monitoring / KPMG-PwC SLL trackers —
// all of which run as standalone Excel/Access workbooks refreshed monthly
// with manual breach classification and no live cure-runway feedback): LIVE
// coverage-defense battery on every record — severity index, headroom-to-
// lockup months, cure runway days, equity-cure coverage ratio, DSRA coverage
// ratio (W77 hookup), forward DSCR, LLCR, PLCR, cross-default contagion flag,
// urgency band. Tier is RE-DERIVED on every transition from the current DSCR
// so a project that started at minor can deteriorate into severe across
// periods, and a project that breached at material can recover after cure.
//
// Write model — SINGLE lender desk {admin, lender}. READ all nine personas.
// actor_party (lender / borrower / independent_engineer) records the
// functional owner per step, not the JWT role.
//
// Reportability (the W86 SIGNATURE is COVERAGE-DEFENSE):
//   declare_acceleration  crosses for EVERY tier — IFRS 9 Stage 3 trigger
//                         (sister of W45 write_off, W77 declare_breach,
//                          W68 declare_default — categorical prudential event).
//   waive_breach          crosses for material + severe — forbearance.
//   enter_lock_up         crosses for material + severe — distribution lock-up notice.
//   sla_breached          crosses for material + severe.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForDscr,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  severityIndex,
  headroomToLockupMonths,
  cureRunwayDays,
  equityCureCoverageRatio,
  dsraCoverageRatio,
  crossDefaultRiskFlag,
  forwardDscr,
  llcr as llcrFn,
  plcr as plcrFn,
  urgencyBand,
  SLA_MINUTES,
  type DscrStatus,
  type DscrAction,
  type DscrTier,
} from '../utils/dscr-monitoring-spec';

const READ_ROLES = new Set([
  'admin', 'lender',
  'ipp_developer', 'support', 'trader', 'regulator', 'offtaker', 'grid_operator', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'lender']);

interface DscrRow {
  id: string;
  monitoring_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_id: string;
  facility_name: string;
  project_id: string;
  project_name: string;
  borrower_id: string;
  borrower_name: string;
  lender_agent_id: string;
  lender_agent_name: string;
  test_period_label: string;
  test_period_start: string;
  test_period_end: string;
  test_date: string;
  pass_threshold: number;
  lockup_threshold: number;
  default_floor: number;
  equity_cure_cap_multiple: number;
  current_dscr: number | null;
  forward_dscr_p12m: number | null;
  backward_dscr_12m: number | null;
  llcr_value: number | null;
  plcr_value: number | null;
  cfads_period_zar: number;
  debt_service_period_zar: number;
  shortfall_zar: number;
  outstanding_debt_zar: number;
  npv_loan_life_zar: number;
  npv_project_life_zar: number;
  equity_cure_available_zar: number;
  dsra_balance_zar: number;
  proposed_cure_amount_zar: number;
  executed_cure_amount_zar: number;
  sister_loan_id: string | null;
  sister_loan_dscr: number | null;
  dscr_tier: DscrTier;
  is_systemic_carrier: number;
  annual_trend: number;
  watch_flag: number;
  breach_flag: number;
  lock_up_flag: number;
  cure_proposed_flag: number;
  cure_executing_flag: number;
  cure_validated_flag: number;
  accelerated_flag: number;
  waived_flag: number;
  last_action_ref: string | null;
  regulator_ref: string | null;
  chain_basis: string | null;
  reason_code: string | null;
  monitoring_summary: string | null;
  chain_status: DscrStatus;
  period_open_at: string;
  data_collected_at: string | null;
  computed_at: string | null;
  certified_clean_at: string | null;
  watch_at: string | null;
  breach_recorded_at: string | null;
  cure_proposed_at: string | null;
  cure_in_progress_at: string | null;
  cure_validated_at: string | null;
  lock_up_at: string | null;
  accelerated_at: string | null;
  waived_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface DscrEventRow {
  id: string;
  monitoring_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<DscrStatus, keyof DscrRow | null> = {
  period_open:      null,
  data_collected:   'data_collected_at',
  computed:         'computed_at',
  certified_clean:  'certified_clean_at',
  watch:            'watch_at',
  breach_recorded:  'breach_recorded_at',
  cure_proposed:    'cure_proposed_at',
  cure_in_progress: 'cure_in_progress_at',
  cure_validated:   'cure_validated_at',
  lock_up:          'lock_up_at',
  accelerated:      'accelerated_at',
  waived:           'waived_at',
};

function eventTypeFor(action: DscrAction): string {
  switch (action) {
    case 'collect_data':         return 'dscr_monitoring.data_collected';
    case 'compute_ratios':       return 'dscr_monitoring.computed';
    case 'certify_clean':        return 'dscr_monitoring.certified_clean';
    case 'place_on_watch':       return 'dscr_monitoring.watch';
    case 'record_breach':        return 'dscr_monitoring.breach_recorded';
    case 'enter_lock_up':        return 'dscr_monitoring.lock_up';
    case 'propose_cure':         return 'dscr_monitoring.cure_proposed';
    case 'reject_cure':          return 'dscr_monitoring.breach_recorded';
    case 'execute_cure':         return 'dscr_monitoring.cure_in_progress';
    case 'validate_cure':        return 'dscr_monitoring.cure_validated';
    case 'fail_cure':            return 'dscr_monitoring.accelerated';
    case 'declare_acceleration': return 'dscr_monitoring.accelerated';
    case 'waive_breach':         return 'dscr_monitoring.waived';
  }
}

function statusEnteredAt(row: DscrRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return new Date(row.period_open_at);
  const iso = row[col] as string | null;
  return iso ? new Date(iso) : null;
}

function decorate(row: DscrRow, now: Date) {
  const tier = row.dscr_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const severity = severityIndex(row.current_dscr);
  const headroomMonths = headroomToLockupMonths(row.backward_dscr_12m ?? row.current_dscr, row.annual_trend, row.lockup_threshold);
  const enteredAt = statusEnteredAt(row);
  const runwayDays = cureRunwayDays(status, tier, enteredAt, now);
  const equityCureCoverage = equityCureCoverageRatio(row.equity_cure_available_zar, row.shortfall_zar, row.equity_cure_cap_multiple);
  const dsraCoverage = dsraCoverageRatio(row.dsra_balance_zar, row.shortfall_zar);
  const crossDefault = crossDefaultRiskFlag(row.sister_loan_dscr);
  const fwd = forwardDscr(row.cfads_period_zar, row.debt_service_period_zar);
  const llcrLive = llcrFn(row.npv_loan_life_zar, row.outstanding_debt_zar);
  const plcrLive = plcrFn(row.npv_project_life_zar, row.outstanding_debt_zar);
  const urgency = urgencyBand(severity, runwayDays);

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    is_systemic_carrier_flag: !!row.is_systemic_carrier,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    severity_index_live: severity,
    headroom_to_lockup_months_live: headroomMonths,
    cure_runway_days_live: runwayDays,
    equity_cure_coverage_ratio_live: equityCureCoverage,
    dsra_coverage_ratio_live: dsraCoverage,
    cross_default_risk_flag_live: crossDefault,
    forward_dscr_live: fwd,
    llcr_live: llcrLive,
    plcr_live: plcrLive,
    urgency_band_live: urgency,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const dscr_tier         = c.req.query('dscr_tier');
  const status            = c.req.query('status');
  const facility_id       = c.req.query('facility_id');
  const project_id        = c.req.query('project_id');
  const borrower_id       = c.req.query('borrower_id');
  const breached          = c.req.query('breached');
  const reportable        = c.req.query('reportable');
  const systemic_carrier  = c.req.query('systemic_carrier');

  let sql = 'SELECT * FROM oe_dscr_monitoring WHERE 1=1';
  const binds: unknown[] = [];
  if (dscr_tier)   { sql += ' AND dscr_tier = ?';     binds.push(dscr_tier); }
  if (status)      { sql += ' AND chain_status = ?';  binds.push(status); }
  if (facility_id) { sql += ' AND facility_id = ?';   binds.push(facility_id); }
  if (project_id)  { sql += ' AND project_id = ?';    binds.push(project_id); }
  if (borrower_id) { sql += ' AND borrower_id = ?';   binds.push(borrower_id); }

  sql += ' ORDER BY datetime(period_open_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<DscrRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')         items = items.filter((r) => r.sla_breached);
  if (reportable === 'true')       items = items.filter((r) => r.is_reportable_flag);
  if (systemic_carrier === 'true') items = items.filter((r) => r.is_systemic_carrier_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_borrower: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.dscr_tier] = (by_tier[i.dscr_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_borrower[i.borrower_id] = (by_borrower[i.borrower_id] || 0) + 1;
  }

  const open_count            = items.filter((i) => !i.is_terminal).length;
  const certified_clean_count = items.filter((i) => i.chain_status === 'certified_clean').length;
  const accelerated_count     = items.filter((i) => i.chain_status === 'accelerated').length;
  const waived_count          = items.filter((i) => i.chain_status === 'waived').length;
  const breach_count          = items.filter((i) => i.chain_status === 'breach_recorded').length;
  const cure_active_count     = items.filter((i) => i.chain_status === 'cure_proposed' || i.chain_status === 'cure_in_progress' || i.chain_status === 'cure_validated').length;
  const lock_up_count         = items.filter((i) => i.chain_status === 'lock_up').length;
  const watch_count           = items.filter((i) => i.chain_status === 'watch').length;
  const breached_count        = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable_flag).length;
  const total_outstanding_zar = items.reduce((s, i) => s + (i.outstanding_debt_zar || 0), 0);
  const total_shortfall_zar   = items.reduce((s, i) => s + (i.shortfall_zar || 0), 0);
  const critical_urgency_count = items.filter((i) => i.urgency_band_live === 'critical').length;
  const cross_default_count   = items.filter((i) => i.cross_default_risk_flag_live).length;
  const severe_tier_count     = items.filter((i) => i.dscr_tier === 'severe').length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_borrower,
      open_count,
      certified_clean_count,
      accelerated_count,
      waived_count,
      breach_count,
      cure_active_count,
      lock_up_count,
      watch_count,
      breached: breached_count,
      reportable_total,
      total_outstanding_zar,
      total_shortfall_zar,
      critical_urgency_count,
      cross_default_count,
      severe_tier_count,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_dscr_monitoring WHERE id = ?').bind(id).first<DscrRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_dscr_monitoring_events WHERE monitoring_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<DscrEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CommonBody { chain_basis?: string; last_action_ref?: string; reason_code?: string; regulator_ref?: string; notes?: string; monitoring_summary?: string; }
interface CollectDataBody extends CommonBody { cfads_period_zar?: number; debt_service_period_zar?: number; shortfall_zar?: number; outstanding_debt_zar?: number; }
interface ComputeRatiosBody extends CommonBody {
  current_dscr?: number;
  forward_dscr_p12m?: number;
  backward_dscr_12m?: number;
  llcr_value?: number;
  plcr_value?: number;
  npv_loan_life_zar?: number;
  npv_project_life_zar?: number;
  annual_trend?: number;
  sister_loan_id?: string;
  sister_loan_dscr?: number;
}
interface CertifyCleanBody extends CommonBody {}
interface PlaceOnWatchBody extends CommonBody {}
interface RecordBreachBody extends CommonBody {}
interface EnterLockUpBody extends CommonBody {}
interface ProposeCureBody extends CommonBody { proposed_cure_amount_zar?: number; equity_cure_available_zar?: number; dsra_balance_zar?: number; }
interface RejectCureBody extends CommonBody {}
interface ExecuteCureBody extends CommonBody { executed_cure_amount_zar?: number; }
interface ValidateCureBody extends CommonBody { current_dscr?: number; }
interface FailCureBody extends CommonBody {}
interface DeclareAccelerationBody extends CommonBody {}
interface WaiveBreachBody extends CommonBody {}

async function transition(
  c: Context<HonoEnv>,
  action: DscrAction,
  bodyHandler?: (row: DscrRow, body: Record<string, unknown>) => Partial<DscrRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_dscr_monitoring WHERE id = ?').bind(id).first<DscrRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Tier RE-DERIVED on every transition from the current measured DSCR.
  const dscr = (overrides.current_dscr as number | undefined) ?? row.current_dscr;
  const tier = tierForDscr(dscr);
  overrides.dscr_tier = tier;

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier);
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

  // Gate flags.
  if (to === 'watch')            overrides.watch_flag = 1;
  if (to === 'breach_recorded')  overrides.breach_flag = 1;
  if (to === 'lock_up')          overrides.lock_up_flag = 1;
  if (to === 'cure_proposed')    overrides.cure_proposed_flag = 1;
  if (to === 'cure_in_progress') overrides.cure_executing_flag = 1;
  if (to === 'cure_validated')   overrides.cure_validated_flag = 1;
  if (to === 'accelerated') {
    overrides.accelerated_flag = 1;
    overrides.escalation_level = (row.escalation_level || 0) + 1;
  }
  if (to === 'waived') overrides.waived_flag = 1;

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
    `UPDATE oe_dscr_monitoring SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `dscr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_dscr_monitoring_events (id, monitoring_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'dscr_monitoring',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      dscr_tier: tier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_dscr_monitoring WHERE id = ?').bind(id).first<DscrRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<DscrRow>): Partial<DscrRow> {
  if (typeof b.chain_basis === 'string')        out.chain_basis = b.chain_basis;
  if (typeof b.last_action_ref === 'string')    out.last_action_ref = b.last_action_ref;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')      out.regulator_ref = b.regulator_ref;
  if (typeof b.monitoring_summary === 'string') out.monitoring_summary = b.monitoring_summary;
  return out;
}

app.post('/:id/collect-data', async (c) => transition(c, 'collect_data', (_row, body) => {
  const b = body as Partial<CollectDataBody>;
  const out: Partial<DscrRow> = {};
  if (typeof b.cfads_period_zar === 'number')        out.cfads_period_zar = b.cfads_period_zar;
  if (typeof b.debt_service_period_zar === 'number') out.debt_service_period_zar = b.debt_service_period_zar;
  if (typeof b.shortfall_zar === 'number')           out.shortfall_zar = b.shortfall_zar;
  if (typeof b.outstanding_debt_zar === 'number')    out.outstanding_debt_zar = b.outstanding_debt_zar;
  return applyCommon(b, out);
}));

app.post('/:id/compute-ratios', async (c) => transition(c, 'compute_ratios', (_row, body) => {
  const b = body as Partial<ComputeRatiosBody>;
  const out: Partial<DscrRow> = {};
  if (typeof b.current_dscr === 'number')         out.current_dscr = b.current_dscr;
  if (typeof b.forward_dscr_p12m === 'number')    out.forward_dscr_p12m = b.forward_dscr_p12m;
  if (typeof b.backward_dscr_12m === 'number')    out.backward_dscr_12m = b.backward_dscr_12m;
  if (typeof b.llcr_value === 'number')           out.llcr_value = b.llcr_value;
  if (typeof b.plcr_value === 'number')           out.plcr_value = b.plcr_value;
  if (typeof b.npv_loan_life_zar === 'number')    out.npv_loan_life_zar = b.npv_loan_life_zar;
  if (typeof b.npv_project_life_zar === 'number') out.npv_project_life_zar = b.npv_project_life_zar;
  if (typeof b.annual_trend === 'number')         out.annual_trend = b.annual_trend;
  if (typeof b.sister_loan_id === 'string')       out.sister_loan_id = b.sister_loan_id;
  if (typeof b.sister_loan_dscr === 'number')     out.sister_loan_dscr = b.sister_loan_dscr;
  return applyCommon(b, out);
}));

app.post('/:id/certify-clean', async (c) => transition(c, 'certify_clean', (_row, body) =>
  applyCommon(body as Partial<CertifyCleanBody>, {}),
));

app.post('/:id/place-on-watch', async (c) => transition(c, 'place_on_watch', (_row, body) =>
  applyCommon(body as Partial<PlaceOnWatchBody>, {}),
));

app.post('/:id/record-breach', async (c) => transition(c, 'record_breach', (_row, body) =>
  applyCommon(body as Partial<RecordBreachBody>, {}),
));

app.post('/:id/enter-lock-up', async (c) => transition(c, 'enter_lock_up', (_row, body) =>
  applyCommon(body as Partial<EnterLockUpBody>, {}),
));

app.post('/:id/propose-cure', async (c) => transition(c, 'propose_cure', (_row, body) => {
  const b = body as Partial<ProposeCureBody>;
  const out: Partial<DscrRow> = {};
  if (typeof b.proposed_cure_amount_zar === 'number')  out.proposed_cure_amount_zar = b.proposed_cure_amount_zar;
  if (typeof b.equity_cure_available_zar === 'number') out.equity_cure_available_zar = b.equity_cure_available_zar;
  if (typeof b.dsra_balance_zar === 'number')          out.dsra_balance_zar = b.dsra_balance_zar;
  return applyCommon(b, out);
}));

app.post('/:id/reject-cure', async (c) => transition(c, 'reject_cure', (_row, body) =>
  applyCommon(body as Partial<RejectCureBody>, {}),
));

app.post('/:id/execute-cure', async (c) => transition(c, 'execute_cure', (_row, body) => {
  const b = body as Partial<ExecuteCureBody>;
  const out: Partial<DscrRow> = {};
  if (typeof b.executed_cure_amount_zar === 'number') out.executed_cure_amount_zar = b.executed_cure_amount_zar;
  return applyCommon(b, out);
}));

app.post('/:id/validate-cure', async (c) => transition(c, 'validate_cure', (_row, body) => {
  const b = body as Partial<ValidateCureBody>;
  const out: Partial<DscrRow> = {};
  if (typeof b.current_dscr === 'number') out.current_dscr = b.current_dscr;
  return applyCommon(b, out);
}));

app.post('/:id/fail-cure', async (c) => transition(c, 'fail_cure', (_row, body) =>
  applyCommon(body as Partial<FailCureBody>, {}),
));

app.post('/:id/declare-acceleration', async (c) => transition(c, 'declare_acceleration', (_row, body) =>
  applyCommon(body as Partial<DeclareAccelerationBody>, {}),
));

app.post('/:id/waive-breach', async (c) => transition(c, 'waive_breach', (_row, body) =>
  applyCommon(body as Partial<WaiveBreachBody>, {}),
));

export async function dscrMonitoringSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_dscr_monitoring
     WHERE chain_status NOT IN ('certified_clean','accelerated','waived')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<DscrRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_dscr_monitoring
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `dscr_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_dscr_monitoring_events (id, monitoring_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'dscr_monitoring.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.dscr_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.dscr_tier)) {
      await fireCascade({
        event: 'dscr_monitoring.sla_breached',
        actor_id: 'system',
        entity_type: 'dscr_monitoring',
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
