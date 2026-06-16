// ═══════════════════════════════════════════════════════════════════════════
// Wave 85 — Trader Settlement Fails Management & CSDR-style Buy-In/Sell-Out
// (Cash-Penalty Settlement-Discipline) chain (P6). 10th Trader chain.
//
// Mounted at /api/settlement-fail/chain.
//
// The DELIVERY-INTEGRITY engine of the trading book. SA Financial Markets
// Act 19/2012 + JSE SRL Schedule SC + STRATE Settlement Rules + FSCA
// Conduct Standard 1/2020 + FMA Chapter X. Implements the CSDR-equivalent
// rate schedule (1bp/day equity, 0.5bp/day bond/etf, 0.05bp/day cash) and
// buy-in process modelled on CSDR Article 7 adapted for SA market practice.
//
// DISTINCTIVE move (beats Euroclear CSDR Penalty Mechanism / Clearstream
// T2S Penalty Engine / DTCC Settlement Fail Tracking / JSE-STRATE T+3
// fails monitor / Euronext CSDR Settlement Discipline / Citi-Velocity
// post-trade fails portal — all of which run as overnight batch penalty
// calculators with manual buy-in initiation and no live counterparty-risk
// feedback): LIVE delivery-integrity battery on every record — accrued-
// penalty ZAR (daily-meter), fail age days, buy-in window remaining days,
// recovery rate, penalty-to-NAV ratio, counterparty concentration, repeat-
// fail score, substitute-inventory flag, cross-default risk flag, urgency
// band, predicted resolution days — derived from the same inputs each
// transition so numbers match across the lifecycle and feed W68 counterparty-
// margin.
//
// Write model — SINGLE trader desk {admin, support, trader}. READ all nine
// personas. actor_party (trader_desk / buy_in_agent / settlement_ops /
// counterparty_credit) records the functional owner per step, not the JWT
// role.
//
// Reportability (the W85 SIGNATURE is DELIVERY-INTEGRITY-driven):
//   write_off          crosses for EVERY tier — uncollectable loss is ALWAYS
//                      a FMA/FSCA reportable event (W85 hard line).
//   close_cash         crosses for material + systemic — basis-risk
//                      settlement event.
//   initiate_buy_in    crosses for material + systemic — formal market
//                      intervention via buy-in agent triggers JSE-STRATE
//                      notice flow.
//   sla_breached       crosses for material + systemic.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForFailValue,
  isSystemicCarrier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  failAgeDays,
  accruedPenaltyZar,
  buyInWindowRemainingDays,
  penaltyToNavRatio,
  counterpartyConcentration,
  repeatFailScore,
  crossDefaultRiskFlag,
  urgencyBand,
  predictedResolutionDays,
  substituteInventoryAvailable,
  SLA_MINUTES,
  type SettlementFailStatus,
  type SettlementFailAction,
  type SettlementFailTier,
  type InstrumentClass,
  type FailReasonCode,
} from '../utils/settlement-fail-spec';

const READ_ROLES = new Set([
  'admin', 'support', 'trader',
  'ipp_developer', 'regulator', 'offtaker', 'lender', 'grid_operator', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'support', 'trader']);

interface SfRow {
  id: string;
  fail_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trader_desk_id: string;
  trader_desk_name: string;
  counterparty_id: string;
  counterparty_name: string;
  buy_in_agent_id: string | null;
  buy_in_agent_name: string | null;
  trade_ref: string | null;
  allocation_ref: string | null;
  isin: string | null;
  instrument_name: string | null;
  instrument_class: InstrumentClass;
  systemic_instrument_flag: number;
  instructed_settlement_date: string;
  fail_recorded_at_t: string | null;
  fail_quantity: number;
  fail_unit: string | null;
  fail_price_zar: number;
  fail_value_zar: number;
  fail_reason_code: FailReasonCode | null;
  fail_tier: SettlementFailTier;
  is_systemic_carrier: number;
  extension_granted_until: string | null;
  buy_in_agent_appointed_at: string | null;
  buy_in_executed_at: string | null;
  buy_in_settled_at: string | null;
  buy_in_price_zar: number;
  buy_in_value_zar: number;
  cash_compensation_value_zar: number;
  fail_age_days: number;
  accrued_penalty_zar: number;
  buy_in_window_remaining_days: number;
  recovery_rate_pct: number;
  penalty_to_nav_ratio_pct: number;
  counterparty_concentration_pct: number;
  repeat_fail_score: number;
  substitute_inventory_flag: number;
  cross_default_risk_flag: number;
  urgency_band: 'green' | 'amber' | 'red' | 'critical';
  predicted_resolution_days: number;
  counterparty_nav_zar: number;
  counterparty_open_fails_zar: number;
  counterparty_open_fail_count: number;
  counterparty_prior_fails_90d: number;
  alternative_inventory_qty: number;
  penalty_started_flag: number;
  buy_in_initiated_flag: number;
  buy_in_settled_flag: number;
  cash_compensation_flag: number;
  dispute_raised_flag: number;
  force_majeure_flag: number;
  written_off_flag: number;
  closed_resolved_flag: number;
  last_action_ref: string | null;
  regulator_ref: string | null;
  chain_basis: string | null;
  reason_code: string | null;
  fail_summary: string | null;
  chain_status: SettlementFailStatus;
  instruction_pending_at: string;
  fail_recorded_at: string | null;
  extension_granted_at: string | null;
  penalty_accruing_at: string | null;
  buy_in_initiated_at: string | null;
  buy_in_executing_at: string | null;
  buy_in_settled_status_at: string | null;
  cash_compensation_at: string | null;
  closed_resolved_at: string | null;
  dispute_raised_at: string | null;
  force_majeure_suspended_at: string | null;
  written_off_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface SfEventRow {
  id: string;
  fail_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<SettlementFailStatus, keyof SfRow | null> = {
  instruction_pending:     null,
  fail_recorded:           'fail_recorded_at',
  extension_granted:       'extension_granted_at',
  penalty_accruing:        'penalty_accruing_at',
  buy_in_initiated:        'buy_in_initiated_at',
  buy_in_executing:        'buy_in_executing_at',
  buy_in_settled:          'buy_in_settled_status_at',
  cash_compensation:       'cash_compensation_at',
  closed_resolved:         'closed_resolved_at',
  dispute_raised:          'dispute_raised_at',
  force_majeure_suspended: 'force_majeure_suspended_at',
  written_off:             'written_off_at',
};

function eventTypeFor(action: SettlementFailAction): string {
  switch (action) {
    case 'record_fail':              return 'settlement_fail.fail_recorded';
    case 'grant_extension':          return 'settlement_fail.extension_granted';
    case 'begin_penalty':            return 'settlement_fail.penalty_accruing';
    case 'initiate_buy_in':          return 'settlement_fail.buy_in_initiated';
    case 'execute_buy_in':           return 'settlement_fail.buy_in_executing';
    case 'settle_buy_in':            return 'settlement_fail.buy_in_settled';
    case 'switch_cash_compensation': return 'settlement_fail.cash_compensation';
    case 'close_resolved':           return 'settlement_fail.closed_resolved';
    case 'close_cash':               return 'settlement_fail.closed_resolved';
    case 'raise_dispute':            return 'settlement_fail.dispute_raised';
    case 'resolve_dispute':          return 'settlement_fail.penalty_accruing';
    case 'suspend_force_majeure':    return 'settlement_fail.force_majeure_suspended';
    case 'resume':                   return 'settlement_fail.penalty_accruing';
    case 'write_off':                return 'settlement_fail.written_off';
  }
}

function decorate(row: SfRow, now: Date) {
  const tier = row.fail_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const isd = new Date(row.instructed_settlement_date);
  const ageDays = failAgeDays(isd, now);
  const accrued = accruedPenaltyZar(row.fail_value_zar, row.instrument_class, ageDays);
  const buyInWindow = buyInWindowRemainingDays(ageDays, row.instrument_class);
  const concentration = counterpartyConcentration(row.fail_value_zar, row.counterparty_open_fails_zar);
  const penaltyNav = penaltyToNavRatio(accrued, row.counterparty_nav_zar);
  const repeatScore = repeatFailScore(row.counterparty_prior_fails_90d);
  const crossDefault = crossDefaultRiskFlag(row.counterparty_open_fail_count);
  const subInventory = substituteInventoryAvailable(row.alternative_inventory_qty, row.fail_quantity);
  const urgency = urgencyBand(ageDays, tier);
  const predicted = predictedResolutionDays(status, tier);

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    is_systemic_carrier_flag: !!row.is_systemic_carrier,
    systemic_instrument_flag_bool: !!row.systemic_instrument_flag,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    fail_age_days_live: ageDays,
    accrued_penalty_zar_live: Math.round(accrued * 100) / 100,
    buy_in_window_remaining_days_live: buyInWindow,
    counterparty_concentration_pct_live: Math.round(concentration * 10000) / 100,
    penalty_to_nav_ratio_pct_live: Math.round(penaltyNav * 10000) / 100,
    repeat_fail_score_live: repeatScore,
    cross_default_risk_flag_live: crossDefault,
    substitute_inventory_flag_live: subInventory,
    urgency_band_live: urgency,
    predicted_resolution_days_live: predicted,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const fail_tier        = c.req.query('fail_tier');
  const status           = c.req.query('status');
  const instrument_class = c.req.query('instrument_class');
  const counterparty_id  = c.req.query('counterparty_id');
  const fail_reason_code = c.req.query('fail_reason_code');
  const breached         = c.req.query('breached');
  const reportable       = c.req.query('reportable');
  const systemic_carrier = c.req.query('systemic_carrier');

  let sql = 'SELECT * FROM oe_settlement_fails WHERE 1=1';
  const binds: unknown[] = [];
  if (fail_tier)        { sql += ' AND fail_tier = ?';         binds.push(fail_tier); }
  if (status)           { sql += ' AND chain_status = ?';      binds.push(status); }
  if (instrument_class) { sql += ' AND instrument_class = ?';  binds.push(instrument_class); }
  if (counterparty_id)  { sql += ' AND counterparty_id = ?';   binds.push(counterparty_id); }
  if (fail_reason_code) { sql += ' AND fail_reason_code = ?';  binds.push(fail_reason_code); }

  sql += ' ORDER BY datetime(instruction_pending_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<SfRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')         items = items.filter((r) => r.sla_breached);
  if (reportable === 'true')       items = items.filter((r) => r.is_reportable_flag);
  if (systemic_carrier === 'true') items = items.filter((r) => r.is_systemic_carrier_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_instrument: Record<string, number> = {};
  const by_reason: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.fail_tier] = (by_tier[i.fail_tier] || 0) + 1;
    by_instrument[i.instrument_class] = (by_instrument[i.instrument_class] || 0) + 1;
    if (i.fail_reason_code) by_reason[i.fail_reason_code] = (by_reason[i.fail_reason_code] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
  }

  const open_count                = items.filter((i) => !i.is_terminal).length;
  const closed_resolved_count     = items.filter((i) => i.chain_status === 'closed_resolved').length;
  const written_off_count         = items.filter((i) => i.chain_status === 'written_off').length;
  const dispute_count             = items.filter((i) => i.chain_status === 'dispute_raised').length;
  const buy_in_initiated_count    = items.filter((i) => i.chain_status === 'buy_in_initiated' || i.chain_status === 'buy_in_executing').length;
  const cash_compensation_count   = items.filter((i) => i.chain_status === 'cash_compensation').length;
  const breached_count            = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total          = items.filter((i) => i.is_reportable_flag).length;
  const total_fail_value_zar      = items.reduce((s, i) => s + (i.fail_value_zar || 0), 0);
  const total_accrued_penalty_zar = items.reduce((s, i) => s + (i.accrued_penalty_zar_live || 0), 0);
  const critical_urgency_count    = items.filter((i) => i.urgency_band_live === 'critical').length;
  const cross_default_count       = items.filter((i) => i.cross_default_risk_flag_live).length;
  const repeat_fail_high_count    = items.filter((i) => i.repeat_fail_score_live >= 50).length;
  const buy_in_window_overdue_count = items.filter((i) => i.buy_in_window_remaining_days_live < 0 && !i.is_terminal).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_instrument,
      by_reason,
      by_urgency,
      open_count,
      closed_resolved_count,
      written_off_count,
      dispute_count,
      buy_in_initiated_count,
      cash_compensation_count,
      breached: breached_count,
      reportable_total,
      total_fail_value_zar,
      total_accrued_penalty_zar: Math.round(total_accrued_penalty_zar * 100) / 100,
      critical_urgency_count,
      cross_default_count,
      repeat_fail_high_count,
      buy_in_window_overdue_count,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_settlement_fails WHERE id = ?').bind(id).first<SfRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_settlement_fails_events WHERE fail_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<SfEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CommonBody { chain_basis?: string; last_action_ref?: string; reason_code?: string; regulator_ref?: string; notes?: string; }
interface RecordFailBody extends CommonBody { fail_reason_code?: FailReasonCode; fail_recorded_at_t?: string; }
interface GrantExtensionBody extends CommonBody { extension_granted_until?: string; }
interface BeginPenaltyBody extends CommonBody {}
interface InitiateBuyInBody extends CommonBody { buy_in_agent_id?: string; buy_in_agent_name?: string; buy_in_agent_appointed_at?: string; }
interface ExecuteBuyInBody extends CommonBody { buy_in_executed_at?: string; buy_in_price_zar?: number; buy_in_value_zar?: number; }
interface SettleBuyInBody extends CommonBody { buy_in_settled_at?: string; }
interface SwitchCashBody extends CommonBody { cash_compensation_value_zar?: number; }
interface CloseResolvedBody extends CommonBody {}
interface CloseCashBody extends CommonBody {}
interface RaiseDisputeBody extends CommonBody {}
interface ResolveDisputeBody extends CommonBody {}
interface SuspendFmBody extends CommonBody {}
interface ResumeBody extends CommonBody {}
interface WriteOffBody extends CommonBody {}

async function transition(
  c: Context<HonoEnv>,
  action: SettlementFailAction,
  bodyHandler?: (row: SfRow, body: Record<string, unknown>) => Partial<SfRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_settlement_fails WHERE id = ?').bind(id).first<SfRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Tier RE-DERIVED on every transition from fail_value_zar + systemic carrier.
  const failValue = (overrides.fail_value_zar as number | undefined) ?? row.fail_value_zar;
  const systemicInstrument = ((overrides.systemic_instrument_flag as number | undefined) ?? row.systemic_instrument_flag) === 1;
  const now = new Date();
  const isd = new Date(row.instructed_settlement_date);
  const ageDays = failAgeDays(isd, now);
  const sysCarrier = isSystemicCarrier(systemicInstrument, ageDays);
  const tier = tierForFailValue(failValue, systemicInstrument, ageDays);
  overrides.fail_tier = tier;
  overrides.is_systemic_carrier = sysCarrier ? 1 : 0;
  overrides.fail_age_days = ageDays;
  overrides.accrued_penalty_zar = Math.round(accruedPenaltyZar(failValue, row.instrument_class, ageDays) * 100) / 100;
  overrides.buy_in_window_remaining_days = buyInWindowRemainingDays(ageDays, row.instrument_class);
  overrides.counterparty_concentration_pct = Math.round(counterpartyConcentration(failValue, row.counterparty_open_fails_zar) * 10000) / 100;
  overrides.penalty_to_nav_ratio_pct = Math.round(penaltyToNavRatio(overrides.accrued_penalty_zar as number, row.counterparty_nav_zar) * 10000) / 100;
  overrides.repeat_fail_score = repeatFailScore(row.counterparty_prior_fails_90d);
  overrides.cross_default_risk_flag = crossDefaultRiskFlag(row.counterparty_open_fail_count) ? 1 : 0;
  overrides.substitute_inventory_flag = substituteInventoryAvailable(row.alternative_inventory_qty, row.fail_quantity) ? 1 : 0;
  overrides.urgency_band = urgencyBand(ageDays, tier);
  overrides.predicted_resolution_days = predictedResolutionDays(to, tier);

  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier);
  overrides.is_reportable = (isReportable(tier, sysCarrier) || crosses) ? 1 : 0;

  // Gate flags.
  if (to === 'fail_recorded' && !row.fail_recorded_at_t) overrides.fail_recorded_at_t = nowIso;
  if (to === 'penalty_accruing') overrides.penalty_started_flag = 1;
  if (to === 'buy_in_initiated') overrides.buy_in_initiated_flag = 1;
  if (to === 'buy_in_settled')   overrides.buy_in_settled_flag = 1;
  if (to === 'cash_compensation') overrides.cash_compensation_flag = 1;
  if (to === 'dispute_raised')   overrides.dispute_raised_flag = 1;
  if (to === 'force_majeure_suspended') overrides.force_majeure_flag = 1;
  if (to === 'written_off') {
    overrides.written_off_flag = 1;
    overrides.escalation_level = (row.escalation_level || 0) + 1;
  }
  if (to === 'closed_resolved') overrides.closed_resolved_flag = 1;

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
    `UPDATE oe_settlement_fails SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `sf_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_settlement_fails_events (id, fail_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'settlement_fail',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      fail_tier: tier,
      is_systemic_carrier: sysCarrier ? 1 : 0,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_settlement_fails WHERE id = ?').bind(id).first<SfRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<SfRow>): Partial<SfRow> {
  if (typeof b.chain_basis === 'string')     out.chain_basis = b.chain_basis;
  if (typeof b.last_action_ref === 'string') out.last_action_ref = b.last_action_ref;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  return out;
}

app.post('/:id/record-fail', async (c) => transition(c, 'record_fail', (_row, body) => {
  const b = body as Partial<RecordFailBody>;
  const out: Partial<SfRow> = {};
  if (typeof b.fail_reason_code === 'string')   out.fail_reason_code = b.fail_reason_code;
  if (typeof b.fail_recorded_at_t === 'string') out.fail_recorded_at_t = b.fail_recorded_at_t;
  return applyCommon(b, out);
}));

app.post('/:id/grant-extension', async (c) => transition(c, 'grant_extension', (_row, body) => {
  const b = body as Partial<GrantExtensionBody>;
  const out: Partial<SfRow> = {};
  if (typeof b.extension_granted_until === 'string') out.extension_granted_until = b.extension_granted_until;
  return applyCommon(b, out);
}));

app.post('/:id/begin-penalty', async (c) => transition(c, 'begin_penalty', (_row, body) =>
  applyCommon(body as Partial<BeginPenaltyBody>, {}),
));

app.post('/:id/initiate-buy-in', async (c) => transition(c, 'initiate_buy_in', (_row, body) => {
  const b = body as Partial<InitiateBuyInBody>;
  const out: Partial<SfRow> = {};
  if (typeof b.buy_in_agent_id === 'string')          out.buy_in_agent_id = b.buy_in_agent_id;
  if (typeof b.buy_in_agent_name === 'string')        out.buy_in_agent_name = b.buy_in_agent_name;
  if (typeof b.buy_in_agent_appointed_at === 'string') out.buy_in_agent_appointed_at = b.buy_in_agent_appointed_at;
  return applyCommon(b, out);
}));

app.post('/:id/execute-buy-in', async (c) => transition(c, 'execute_buy_in', (_row, body) => {
  const b = body as Partial<ExecuteBuyInBody>;
  const out: Partial<SfRow> = {
    buy_in_executed_at: typeof b.buy_in_executed_at === 'string' ? b.buy_in_executed_at : new Date().toISOString(),
  };
  if (typeof b.buy_in_price_zar === 'number') out.buy_in_price_zar = b.buy_in_price_zar;
  if (typeof b.buy_in_value_zar === 'number') out.buy_in_value_zar = b.buy_in_value_zar;
  return applyCommon(b, out);
}));

app.post('/:id/settle-buy-in', async (c) => transition(c, 'settle_buy_in', (_row, body) => {
  const b = body as Partial<SettleBuyInBody>;
  const out: Partial<SfRow> = {
    buy_in_settled_at: typeof b.buy_in_settled_at === 'string' ? b.buy_in_settled_at : new Date().toISOString(),
  };
  return applyCommon(b, out);
}));

app.post('/:id/switch-cash-compensation', async (c) => transition(c, 'switch_cash_compensation', (_row, body) => {
  const b = body as Partial<SwitchCashBody>;
  const out: Partial<SfRow> = {};
  if (typeof b.cash_compensation_value_zar === 'number') out.cash_compensation_value_zar = b.cash_compensation_value_zar;
  return applyCommon(b, out);
}));

app.post('/:id/close-resolved', async (c) => transition(c, 'close_resolved', (_row, body) =>
  applyCommon(body as Partial<CloseResolvedBody>, {}),
));

app.post('/:id/close-cash', async (c) => transition(c, 'close_cash', (_row, body) =>
  applyCommon(body as Partial<CloseCashBody>, {}),
));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (_row, body) =>
  applyCommon(body as Partial<RaiseDisputeBody>, {}),
));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) =>
  applyCommon(body as Partial<ResolveDisputeBody>, {}),
));

app.post('/:id/suspend-force-majeure', async (c) => transition(c, 'suspend_force_majeure', (_row, body) =>
  applyCommon(body as Partial<SuspendFmBody>, {}),
));

app.post('/:id/resume', async (c) => transition(c, 'resume', (_row, body) =>
  applyCommon(body as Partial<ResumeBody>, {}),
));

app.post('/:id/write-off', async (c) => transition(c, 'write_off', (_row, body) =>
  applyCommon(body as Partial<WriteOffBody>, {}),
));

export async function settlementFailSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_settlement_fails
     WHERE chain_status NOT IN ('closed_resolved','written_off')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<SfRow>();

  const rows = rs.results || [];
  // Per-row UPDATE + event INSERT committed in one atomic batch; fireCascade is a
  // multi-stage fan-out (not a D1 statement) so it runs afterwards, off the batch.
  const stmts: D1PreparedStatement[] = [];
  const toCascade: SfRow[] = [];
  for (const row of rows) {
    stmts.push(env.DB.prepare(
      `UPDATE oe_settlement_fails
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id));

    const evtId = `sf_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    stmts.push(env.DB.prepare(
      'INSERT INTO oe_settlement_fails_events (id, fail_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'settlement_fail.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.fail_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ));

    if (slaBreachCrossesIntoRegulator(row.fail_tier)) toCascade.push(row);
  }

  if (stmts.length) await env.DB.batch(stmts);

  for (const row of toCascade) {
    await fireCascade({
      event: 'settlement_fail.sla_breached',
      actor_id: 'system',
      entity_type: 'settlement_fail',
      entity_id: row.id,
      data: {
        ...row,
        crosses_into_regulator: true,
      },
      env,
    });
  }

  return { scanned: rows.length, breached: rows.length };
}

export default app;
