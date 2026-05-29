// ═══════════════════════════════════════════════════════════════════════════
// Wave 84 — Grid Black-Start Capability Contracting & System-Restoration Drill
// chain (P6). 10th Grid chain.
//
// Mounted at /api/black-start/chain.
//
// The RESTORATION engine of the System Operator. SA Grid Code Sections OC-1
// (System Operating) / OC-12 (Restoration) + NTCSA Grid-Code Annex on
// Black-Start + NERSA System Defence & Restoration Plan + IEC 60870-5-101/104
// + IEEE Std 1547 + NRS 048-2. Each contracted Black-Start Capability (BSC)
// unit demonstrates readiness annually under a witnessed restoration drill —
// cranking start → dead-bus energisation → frequency/voltage hold → auxiliary
// load pickup → backfeed to SO restoration path within the contracted window.
//
// DISTINCTIVE move (beat best-in-class — PJM Black Start Service / ERCOT
// Black Start / National Grid ESO Black Start / ENTSO-E System Defence &
// Restoration Plan / MISO Black Start Resource — all of which run as
// solicit/award/annual-paper-test workflows with manual readiness tracking):
// LIVE restoration-readiness battery on every record — contracted-MW total,
// target MW, coverage ratio, geographic + fuel + voltage diversity indices,
// days since last drill, rolling drill-pass-rate, restoration-path validity
// flag, criticality score — all derived from the same inputs each transition
// so the numbers match across the lifecycle.
//
// Write model — SINGLE SO desk {admin, support, grid_operator}. READ all
// nine personas. actor_party (system_operator / bsc_provider / drill_observer
// / restoration_planner) records the functional owner per step, not the JWT
// role.
//
// Reportability (the W84 SIGNATURE is RELIABILITY-driven):
//   fail_drill          crosses for EVERY tier — restoration failure ALWAYS
//                       a NERSA reliability event (W84 hard line).
//   terminate_contract  crosses for EVERY tier — loss of BSC capability
//                       ALWAYS a reliability event.
//   recertify           crosses for material + island_critical.
//   require_remediation crosses for material + island_critical.
//   sla_breached        crosses for material + island_critical.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForCapacity,
  isSystemCritical,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  daysSinceLastDrill,
  daysUntilNextDrillDue,
  restorationCoverageRatio,
  geographicDiversityIndex,
  fuelDiversityIndex,
  voltageClassCoverage,
  drillPassRate,
  restorationPathValid,
  criticalityScore,
  predictedLifecycleDays,
  SLA_MINUTES,
  type BlackStartStatus,
  type BlackStartAction,
  type BlackStartTier,
  type VoltageClass,
  type RestorationRole,
  type CrankingSource,
} from '../utils/black-start-spec';

const READ_ROLES = new Set([
  'admin', 'support', 'grid_operator',
  'ipp_developer', 'regulator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'support', 'grid_operator']);

interface BscRow {
  id: string;
  capability_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  system_operator_id: string;
  system_operator_name: string;
  bsc_provider_id: string | null;
  bsc_provider_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  province: string | null;
  restoration_zone: string | null;
  voltage_class: VoltageClass;
  restoration_role: RestorationRole;
  cranking_source: CrankingSource;
  black_start_capacity_mw: number;
  target_capacity_mw: number;
  cranking_time_target_minutes: number;
  backfeed_time_target_minutes: number;
  capability_tier: BlackStartTier;
  is_system_critical: number;
  contract_ref: string | null;
  contract_value_zar: number;
  contract_start_at: string | null;
  contract_end_at: string | null;
  drill_scheduled_at: string | null;
  drill_window_minutes: number;
  drill_commenced_at: string | null;
  drill_completed_at: string | null;
  last_drill_at: string | null;
  drills_passed_count: number;
  drills_total_count: number;
  consecutive_failures: number;
  zone_provinces_represented: number;
  zone_voltage_classes_covered: number;
  zone_fuel_hydro_count: number;
  zone_fuel_diesel_count: number;
  zone_fuel_battery_count: number;
  zone_fuel_compressed_air_count: number;
  cranking_source_confirmed_flag: number;
  dead_bus_energisation_flag: number;
  frequency_hold_flag: number;
  voltage_hold_flag: number;
  auxiliary_load_pickup_flag: number;
  backfeed_within_sla_flag: number;
  restoration_coverage_ratio: number;
  geographic_diversity_index: number;
  fuel_diversity_index: number;
  voltage_class_coverage: number;
  drill_pass_rate: number;
  restoration_path_valid_flag: number;
  criticality_score: number;
  predicted_lifecycle_days: number;
  solicitation_issued_flag: number;
  contract_awarded_flag: number;
  contract_executed_flag: number;
  drill_scheduled_flag: number;
  drill_completed_flag: number;
  recertified_flag: number;
  drill_failed_flag: number;
  remediation_required_flag: number;
  terminated_flag: number;
  last_action_ref: string | null;
  regulator_ref: string | null;
  chain_basis: string | null;
  reason_code: string | null;
  capability_summary: string | null;
  chain_status: BlackStartStatus;
  needs_assessed_at: string;
  solicitation_issued_at: string | null;
  bid_evaluation_at: string | null;
  contract_awarded_at: string | null;
  contract_executed_at: string | null;
  drill_scheduled_status_at: string | null;
  drill_in_progress_at: string | null;
  drill_completed_status_at: string | null;
  recertified_at: string | null;
  drill_failed_at: string | null;
  remediation_required_at: string | null;
  contract_terminated_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface BscEventRow {
  id: string;
  capability_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<BlackStartStatus, keyof BscRow | null> = {
  needs_assessed:       null,
  solicitation_issued:  'solicitation_issued_at',
  bid_evaluation:       'bid_evaluation_at',
  contract_awarded:     'contract_awarded_at',
  contract_executed:    'contract_executed_at',
  drill_scheduled:      'drill_scheduled_status_at',
  drill_in_progress:    'drill_in_progress_at',
  drill_completed:      'drill_completed_status_at',
  recertified:          'recertified_at',
  drill_failed:         'drill_failed_at',
  remediation_required: 'remediation_required_at',
  contract_terminated:  'contract_terminated_at',
};

function eventTypeFor(action: BlackStartAction): string {
  switch (action) {
    case 'issue_solicitation':   return 'black_start.solicitation_issued';
    case 'close_solicitation':   return 'black_start.bid_evaluation';
    case 'award_contract':       return 'black_start.contract_awarded';
    case 'execute_contract':     return 'black_start.contract_executed';
    case 'schedule_drill':       return 'black_start.drill_scheduled';
    case 'commence_drill':       return 'black_start.drill_in_progress';
    case 'complete_drill':       return 'black_start.drill_completed';
    case 'recertify':            return 'black_start.recertified';
    case 'fail_drill':           return 'black_start.drill_failed';
    case 'require_remediation':  return 'black_start.remediation_required';
    case 'complete_remediation': return 'black_start.drill_scheduled';
    case 'terminate_contract':   return 'black_start.contract_terminated';
  }
}

function decorate(row: BscRow, now: Date) {
  const tier = row.capability_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const lastDrillAt = row.last_drill_at ? new Date(row.last_drill_at) : null;
  const coverage = restorationCoverageRatio(row.black_start_capacity_mw, row.target_capacity_mw);
  const geoDiversity = geographicDiversityIndex(row.zone_provinces_represented);
  const fuelDiv = fuelDiversityIndex({
    hydro: row.zone_fuel_hydro_count,
    diesel_starter: row.zone_fuel_diesel_count,
    battery_inverter: row.zone_fuel_battery_count,
    compressed_air: row.zone_fuel_compressed_air_count,
  });
  const voltageCoverage = voltageClassCoverage(row.zone_voltage_classes_covered);
  const passRate = drillPassRate(row.drills_passed_count, row.drills_total_count);
  const pathValid = restorationPathValid(
    !!row.cranking_source_confirmed_flag,
    !!row.dead_bus_energisation_flag,
    !!row.frequency_hold_flag,
    !!row.voltage_hold_flag,
    !!row.auxiliary_load_pickup_flag,
    !!row.backfeed_within_sla_flag,
  );
  const sinceLastDrill = daysSinceLastDrill(lastDrillAt, now);
  const untilNextDrill = daysUntilNextDrillDue(lastDrillAt, now);
  const crit = criticalityScore({
    role: row.restoration_role,
    voltage: row.voltage_class,
    tier,
    daysUntilNextDrillDue: untilNextDrill,
    drillPassRate: passRate,
    restorationPathValid: pathValid,
  });
  const predicted = predictedLifecycleDays(tier);

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    is_system_critical_flag: !!row.is_system_critical,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    restoration_coverage_ratio_live: coverage,
    geographic_diversity_index_live: geoDiversity,
    fuel_diversity_index_live: fuelDiv,
    voltage_class_coverage_live: voltageCoverage,
    drill_pass_rate_live: passRate,
    restoration_path_valid_flag_live: pathValid,
    criticality_score_live: crit,
    days_since_last_drill_live: sinceLastDrill,
    days_until_next_drill_due_live: untilNextDrill,
    predicted_lifecycle_days_live: predicted,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const capability_tier   = c.req.query('capability_tier');
  const status            = c.req.query('status');
  const voltage_class     = c.req.query('voltage_class');
  const restoration_role  = c.req.query('restoration_role');
  const cranking_source   = c.req.query('cranking_source');
  const province          = c.req.query('province');
  const restoration_zone  = c.req.query('restoration_zone');
  const breached          = c.req.query('breached');
  const reportable        = c.req.query('reportable');
  const system_critical   = c.req.query('system_critical');

  let sql = 'SELECT * FROM oe_black_start_capabilities WHERE 1=1';
  const binds: unknown[] = [];
  if (capability_tier)   { sql += ' AND capability_tier = ?';   binds.push(capability_tier); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }
  if (voltage_class)     { sql += ' AND voltage_class = ?';     binds.push(voltage_class); }
  if (restoration_role)  { sql += ' AND restoration_role = ?';  binds.push(restoration_role); }
  if (cranking_source)   { sql += ' AND cranking_source = ?';   binds.push(cranking_source); }
  if (province)          { sql += ' AND province = ?';          binds.push(province); }
  if (restoration_zone)  { sql += ' AND restoration_zone = ?';  binds.push(restoration_zone); }

  sql += ' ORDER BY datetime(needs_assessed_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<BscRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')        items = items.filter((r) => r.sla_breached);
  if (reportable === 'true')      items = items.filter((r) => r.is_reportable_flag);
  if (system_critical === 'true') items = items.filter((r) => r.is_system_critical_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_voltage: Record<string, number> = {};
  const by_role: Record<string, number> = {};
  const by_cranking: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.capability_tier] = (by_tier[i.capability_tier] || 0) + 1;
    by_voltage[i.voltage_class] = (by_voltage[i.voltage_class] || 0) + 1;
    by_role[i.restoration_role] = (by_role[i.restoration_role] || 0) + 1;
    by_cranking[i.cranking_source] = (by_cranking[i.cranking_source] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const recertified_count = items.filter((i) => i.chain_status === 'recertified').length;
  const drill_failed_count= items.filter((i) => i.chain_status === 'drill_failed').length;
  const remediation_count = items.filter((i) => i.chain_status === 'remediation_required').length;
  const terminated_count  = items.filter((i) => i.chain_status === 'contract_terminated').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable_flag).length;
  const system_critical_count = items.filter((i) => i.is_system_critical_flag).length;
  const total_contracted_mw = items.reduce((s, i) => s + (i.black_start_capacity_mw || 0), 0);
  const total_target_mw    = items.reduce((s, i) => s + (i.target_capacity_mw || 0), 0);
  const total_drill_failures = items.reduce((s, i) => s + (i.consecutive_failures || 0), 0);
  const high_criticality_count = items.filter((i) => i.criticality_score_live >= 60).length;
  const path_invalid_count = items.filter((i) => !i.restoration_path_valid_flag_live && !i.is_terminal).length;
  const overdue_drill_count = items.filter((i) => i.days_until_next_drill_due_live !== null && i.days_until_next_drill_due_live < 0).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_voltage,
      by_role,
      by_cranking,
      open_count,
      recertified_count,
      drill_failed_count,
      remediation_count,
      terminated_count,
      breached: breached_count,
      reportable_total,
      system_critical_count,
      total_contracted_mw,
      total_target_mw,
      total_drill_failures,
      high_criticality_count,
      path_invalid_count,
      overdue_drill_count,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_black_start_capabilities WHERE id = ?').bind(id).first<BscRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_black_start_capabilities_events WHERE capability_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<BscEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CommonBody { chain_basis?: string; last_action_ref?: string; reason_code?: string; regulator_ref?: string; notes?: string; }
interface SolicitationBody extends CommonBody {}
interface CloseBody extends CommonBody {}
interface AwardBody extends CommonBody { bsc_provider_id?: string; bsc_provider_name?: string; contract_ref?: string; contract_value_zar?: number; }
interface ExecuteBody extends CommonBody { contract_start_at?: string; contract_end_at?: string; }
interface ScheduleBody extends CommonBody { drill_scheduled_at?: string; drill_window_minutes?: number; }
interface CommenceBody extends CommonBody { drill_commenced_at?: string; }
interface CompleteBody extends CommonBody {
  drill_completed_at?: string;
  cranking_source_confirmed_flag?: number;
  dead_bus_energisation_flag?: number;
  frequency_hold_flag?: number;
  voltage_hold_flag?: number;
  auxiliary_load_pickup_flag?: number;
  backfeed_within_sla_flag?: number;
}
interface RecertifyBody extends CommonBody {}
interface FailBody extends CommonBody {}
interface RemediationBody extends CommonBody {}
interface CompleteRemediationBody extends CommonBody {}
interface TerminateBody extends CommonBody {}

async function transition(
  c: Context<HonoEnv>,
  action: BlackStartAction,
  bodyHandler?: (row: BscRow, body: Record<string, unknown>) => Partial<BscRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_black_start_capabilities WHERE id = ?').bind(id).first<BscRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Tier RE-DERIVED on every transition from capacity + voltage + role (URGENT family).
  const voltage = (overrides.voltage_class as VoltageClass | undefined) ?? row.voltage_class;
  const role = (overrides.restoration_role as RestorationRole | undefined) ?? row.restoration_role;
  const mw = (overrides.black_start_capacity_mw as number | undefined) ?? row.black_start_capacity_mw;
  const tier = tierForCapacity(mw, voltage, role);
  const sysCrit = isSystemCritical(voltage, role);
  overrides.capability_tier = tier;
  overrides.is_system_critical = sysCrit ? 1 : 0;
  overrides.predicted_lifecycle_days = predictedLifecycleDays(tier);

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier);
  overrides.is_reportable = (isReportable(tier, sysCrit) || crosses) ? 1 : 0;

  // Gate flags + drill counters.
  if (to === 'solicitation_issued') overrides.solicitation_issued_flag = 1;
  if (to === 'contract_awarded')    overrides.contract_awarded_flag = 1;
  if (to === 'contract_executed')   overrides.contract_executed_flag = 1;
  if (to === 'drill_scheduled')     overrides.drill_scheduled_flag = 1;
  if (to === 'drill_completed') {
    overrides.drill_completed_flag = 1;
    overrides.drills_total_count = (row.drills_total_count || 0) + 1;
  }
  if (to === 'recertified') {
    overrides.recertified_flag = 1;
    overrides.drills_passed_count = (row.drills_passed_count || 0) + 1;
    overrides.last_drill_at = row.drill_completed_at || row.drill_commenced_at || nowIso;
    overrides.consecutive_failures = 0;
  }
  if (to === 'drill_failed') {
    overrides.drill_failed_flag = 1;
    overrides.consecutive_failures = (row.consecutive_failures || 0) + 1;
    overrides.escalation_level = (row.escalation_level || 0) + 1;
  }
  if (to === 'remediation_required') overrides.remediation_required_flag = 1;
  if (to === 'contract_terminated') {
    overrides.terminated_flag = 1;
    overrides.escalation_level = (row.escalation_level || 0) + 1;
  }

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
    `UPDATE oe_black_start_capabilities SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `bsc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_black_start_capabilities_events (id, capability_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'black_start',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      capability_tier: tier,
      is_system_critical: sysCrit ? 1 : 0,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_black_start_capabilities WHERE id = ?').bind(id).first<BscRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<BscRow>): Partial<BscRow> {
  if (typeof b.chain_basis === 'string')     out.chain_basis = b.chain_basis;
  if (typeof b.last_action_ref === 'string') out.last_action_ref = b.last_action_ref;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  return out;
}

app.post('/:id/issue-solicitation', async (c) => transition(c, 'issue_solicitation', (_row, body) =>
  applyCommon(body as Partial<SolicitationBody>, {}),
));

app.post('/:id/close-solicitation', async (c) => transition(c, 'close_solicitation', (_row, body) =>
  applyCommon(body as Partial<CloseBody>, {}),
));

app.post('/:id/award-contract', async (c) => transition(c, 'award_contract', (_row, body) => {
  const b = body as Partial<AwardBody>;
  const out: Partial<BscRow> = {};
  if (typeof b.bsc_provider_id === 'string')    out.bsc_provider_id = b.bsc_provider_id;
  if (typeof b.bsc_provider_name === 'string')  out.bsc_provider_name = b.bsc_provider_name;
  if (typeof b.contract_ref === 'string')       out.contract_ref = b.contract_ref;
  if (typeof b.contract_value_zar === 'number') out.contract_value_zar = b.contract_value_zar;
  return applyCommon(b, out);
}));

app.post('/:id/execute-contract', async (c) => transition(c, 'execute_contract', (_row, body) => {
  const b = body as Partial<ExecuteBody>;
  const out: Partial<BscRow> = {};
  if (typeof b.contract_start_at === 'string') out.contract_start_at = b.contract_start_at;
  if (typeof b.contract_end_at === 'string')   out.contract_end_at = b.contract_end_at;
  return applyCommon(b, out);
}));

app.post('/:id/schedule-drill', async (c) => transition(c, 'schedule_drill', (_row, body) => {
  const b = body as Partial<ScheduleBody>;
  const out: Partial<BscRow> = {};
  if (typeof b.drill_scheduled_at === 'string')   out.drill_scheduled_at = b.drill_scheduled_at;
  if (typeof b.drill_window_minutes === 'number') out.drill_window_minutes = b.drill_window_minutes;
  return applyCommon(b, out);
}));

app.post('/:id/commence-drill', async (c) => transition(c, 'commence_drill', (_row, body) => {
  const b = body as Partial<CommenceBody>;
  const out: Partial<BscRow> = {
    drill_commenced_at: typeof b.drill_commenced_at === 'string' ? b.drill_commenced_at : new Date().toISOString(),
  };
  return applyCommon(b, out);
}));

app.post('/:id/complete-drill', async (c) => transition(c, 'complete_drill', (_row, body) => {
  const b = body as Partial<CompleteBody>;
  const out: Partial<BscRow> = {
    drill_completed_at: typeof b.drill_completed_at === 'string' ? b.drill_completed_at : new Date().toISOString(),
  };
  if (typeof b.cranking_source_confirmed_flag === 'number') out.cranking_source_confirmed_flag = b.cranking_source_confirmed_flag;
  if (typeof b.dead_bus_energisation_flag === 'number')     out.dead_bus_energisation_flag = b.dead_bus_energisation_flag;
  if (typeof b.frequency_hold_flag === 'number')            out.frequency_hold_flag = b.frequency_hold_flag;
  if (typeof b.voltage_hold_flag === 'number')              out.voltage_hold_flag = b.voltage_hold_flag;
  if (typeof b.auxiliary_load_pickup_flag === 'number')     out.auxiliary_load_pickup_flag = b.auxiliary_load_pickup_flag;
  if (typeof b.backfeed_within_sla_flag === 'number')       out.backfeed_within_sla_flag = b.backfeed_within_sla_flag;
  return applyCommon(b, out);
}));

app.post('/:id/recertify', async (c) => transition(c, 'recertify', (_row, body) =>
  applyCommon(body as Partial<RecertifyBody>, {}),
));

app.post('/:id/fail-drill', async (c) => transition(c, 'fail_drill', (_row, body) =>
  applyCommon(body as Partial<FailBody>, {}),
));

app.post('/:id/require-remediation', async (c) => transition(c, 'require_remediation', (_row, body) =>
  applyCommon(body as Partial<RemediationBody>, {}),
));

app.post('/:id/complete-remediation', async (c) => transition(c, 'complete_remediation', (_row, body) =>
  applyCommon(body as Partial<CompleteRemediationBody>, {}),
));

app.post('/:id/terminate-contract', async (c) => transition(c, 'terminate_contract', (_row, body) =>
  applyCommon(body as Partial<TerminateBody>, {}),
));

export async function blackStartSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_black_start_capabilities
     WHERE chain_status NOT IN ('recertified','contract_terminated')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<BscRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_black_start_capabilities
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `bsc_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_black_start_capabilities_events (id, capability_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'black_start.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.capability_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.capability_tier)) {
      await fireCascade({
        event: 'black_start.sla_breached',
        actor_id: 'system',
        entity_type: 'black_start',
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
