// ═══════════════════════════════════════════════════════════════════════════
// Wave 90 — Trader JIBAR Cessation Benchmark Transition & Fallback (P6).
//           10th Trader chain.
//
// Mounted at /api/benchmark-transition/chain.
//
// SARB MPG-mandated JIBAR -> ZARONIA cessation repapering, per
// IBOR-referencing contract. Plain IRS, basis swaps, FRAs, syndicated
// loans, FRNs, structured notes, cross-currency swaps all flow through
// this chain before formal cessation. Distinct from every other Trader
// chain (W9 MM / W29 poslimit / W36 best-ex / W44 trade-repo /
// W52 abuse / W60 algo-cert / W68 margin / W76 allocation /
// W85 settlement-fail) by FUNCTION: this is the BENCHMARK-REFORM
// REPAPERING engine — IBOR transition mechanics, ISDA Protocol
// adherence, value-transfer settlement, fallback-rate enforcement.
//
// 13-state P6 lifecycle:
//   inventoried -> impact_assessed -> classified -> notified ->
//   responded -> amendment_drafted -> amendment_executed -> vt_settled ->
//   transitioned_clean (terminal)
//   open(class/notified/responded/amendment_drafted/amendment_executed)
//     -> raise_dispute -> disputed -> resolve_dispute -> classified
//   open(impact/class/notified/responded/amendment_drafted)
//     -> place_on_hold -> on_hold -> resume -> classified
//   class/notified/responded/amendment_drafted/disputed/on_hold
//     -> terminate_legacy -> terminated_legacy (terminal)
//   inventoried / impact_assessed -> cancel -> cancelled (terminal)
//
// DISTINCTIVE move (beats Bloomberg AIBOR/IBOR Transition / ICE Benchmark
// fallback service / ISDA 2020 IBOR Fallbacks Protocol adherence tracker /
// LCH SwapAgent transition / CME LIBOR Conversion Service / Murex MX.3
// IBOR Transition / Calypso Benchmark Reform / SoFi Reference Rate
// Transition Manager / Excel-based transition trackers — every one of
// these is a batch processor with manual amendment drafting and no live
// cessation-aware urgency): LIVE transition-integrity battery on every
// record — PV01 ZAR, value-transfer ZAR, fallback basis spread bps,
// days_to_cessation countdown, compounded ZARONIA rate, urgency band
// (cessation-aware), counterparty response %, dispute concentration,
// hedge-effectiveness flag, predicted resolution days. Tier RE-DERIVED
// on every transition from absolute notional_zar with floor-at-material
// when interbank OR <30d-to-cessation — so a tier escalation on
// cessation approach retightens every SLA and crossing decision in the
// same write.
//
// Write model — SINGLE trader desk {admin, trader}. READ all nine
// personas. actor_party (transition_desk / counterparty_credit /
// docs_legal / risk_validation) tags the functional owner per step,
// not the JWT role.
//
// Reportability (TRANSITION-INTEGRITY SIGNATURE — the W90 hard line):
//   terminate_legacy    -> regulator EVERY tier ALWAYS (SARB MPG
//                          transition-failure reporting, sister of
//                          W85 write_off / W82 dispute / W84 fail_drill /
//                          W83 withdraw_notice / W89 cancel_campaign).
//   complete_transition -> regulator material + systemic only (SARB MPG
//                          completion ledger).
//   raise_dispute       -> regulator systemic only (ISDA Determinations
//                          Committee referral).
//   sla_breached        -> regulator material + systemic only.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  slaWindowMinutes,
  tierForNotional,
  isSystemicCarrier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  pv01Zar,
  valueTransferZar,
  fallbackBasisBps,
  daysToCessation,
  compoundedZaroniaRate,
  urgencyBand,
  predictedResolutionDays,
  hedgeEffectivenessFlag,
  type BenchmarkTransitionStatus,
  type BenchmarkTransitionAction,
  type BenchmarkTransitionTier,
  type LegacyBenchmark,
  type ReplacementRate,
  type InstrumentType,
  type FallbackClass,
} from '../utils/benchmark-transition-spec';

const READ_ROLES = new Set([
  'admin', 'trader',
  'ipp_developer', 'offtaker', 'support', 'regulator', 'lender', 'grid_operator', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'trader']);

interface BxtRow {
  id: string;
  transition_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trade_ref: string;
  instrument_type: InstrumentType;
  legacy_benchmark: LegacyBenchmark;
  replacement_rate: ReplacementRate | null;
  fallback_class: FallbackClass | null;
  counterparty_id: string;
  counterparty_name: string;
  counterparty_interbank: number;
  counterparty_nav_zar: number;
  notional_zar: number;
  remaining_years: number;
  trade_start_at: string | null;
  trade_maturity_at: string | null;
  cessation_date: string;
  zaronia_overnight: number;
  isda_spread_bps: number;
  pv01_zar: number;
  value_transfer_zar: number;
  compounded_zaronia_rate: number;
  hedge_effective_flag: number;
  protocol_adherence_flag: number;
  counterparty_response_pct: number;
  dispute_concentration: number;
  predicted_resolution_days: number | null;
  days_to_cessation: number | null;
  transition_tier: BenchmarkTransitionTier;
  inventoried_flag: number;
  impact_assessed_flag: number;
  classified_flag: number;
  notified_flag: number;
  responded_flag: number;
  amendment_drafted_flag: number;
  amendment_executed_flag: number;
  vt_settled_flag: number;
  transitioned_clean_flag: number;
  disputed_flag: number;
  on_hold_flag: number;
  terminated_legacy_flag: number;
  cancelled_flag: number;
  last_action_ref: string | null;
  regulator_ref: string | null;
  transition_summary: string | null;
  chain_status: BenchmarkTransitionStatus;
  inventoried_at: string;
  impact_assessed_at: string | null;
  classified_at: string | null;
  notified_at: string | null;
  responded_at: string | null;
  amendment_drafted_at: string | null;
  amendment_executed_at: string | null;
  vt_settled_at: string | null;
  transitioned_clean_at: string | null;
  disputed_at: string | null;
  on_hold_at: string | null;
  terminated_legacy_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface BxtEventRow {
  id: string;
  transition_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<BenchmarkTransitionStatus, keyof BxtRow | null> = {
  inventoried:        null,
  impact_assessed:    'impact_assessed_at',
  classified:         'classified_at',
  notified:           'notified_at',
  responded:          'responded_at',
  amendment_drafted:  'amendment_drafted_at',
  amendment_executed: 'amendment_executed_at',
  vt_settled:         'vt_settled_at',
  transitioned_clean: 'transitioned_clean_at',
  disputed:           'disputed_at',
  on_hold:            'on_hold_at',
  terminated_legacy:  'terminated_legacy_at',
  cancelled:          'cancelled_at',
};

function eventTypeFor(action: BenchmarkTransitionAction): string {
  switch (action) {
    case 'assess_impact':       return 'benchmark_transition.impact_assessed';
    case 'classify_fallback':   return 'benchmark_transition.classified';
    case 'notify_counterparty': return 'benchmark_transition.notified';
    case 'record_response':     return 'benchmark_transition.responded';
    case 'draft_amendment':     return 'benchmark_transition.amendment_drafted';
    case 'execute_amendment':   return 'benchmark_transition.amendment_executed';
    case 'settle_vt':           return 'benchmark_transition.vt_settled';
    case 'complete_transition': return 'benchmark_transition.transitioned_clean';
    case 'raise_dispute':       return 'benchmark_transition.disputed';
    case 'resolve_dispute':     return 'benchmark_transition.dispute_resolved';
    case 'place_on_hold':       return 'benchmark_transition.on_hold';
    case 'resume':              return 'benchmark_transition.resumed';
    case 'terminate_legacy':    return 'benchmark_transition.terminated_legacy';
    case 'cancel':              return 'benchmark_transition.cancelled';
  }
}

function decorate(row: BxtRow, now: Date) {
  const tier = row.transition_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const nowMs = now.getTime();
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - nowMs) / 60000)
    : null;

  const cessation = row.cessation_date ? new Date(row.cessation_date) : null;
  const daysCessLive = cessation ? daysToCessation(cessation, now) : null;
  const pv01Live = pv01Zar(row.notional_zar, row.remaining_years, row.instrument_type);
  const vtLive = valueTransferZar(row.notional_zar, row.remaining_years, row.legacy_benchmark);
  const fbBpsLive = fallbackBasisBps(row.legacy_benchmark);
  const compZaroniaLive = compoundedZaroniaRate(row.zaronia_overnight || 0, row.legacy_benchmark);
  const hedgeOkLive = hedgeEffectivenessFlag(row.legacy_benchmark);
  const predictedResolveLive = predictedResolutionDays(status, tier);
  const urgencyLive = urgencyBand(daysCessLive ?? 9999, tier);
  const interbank = row.counterparty_interbank === 1;
  const systemicCarrierLive = isSystemicCarrier(interbank, daysCessLive ?? 9999);

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: slaWindowMinutes(status, tier),
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    days_to_cessation_live: daysCessLive,
    pv01_zar_live: pv01Live,
    value_transfer_zar_live: vtLive,
    fallback_basis_bps_live: fbBpsLive,
    compounded_zaronia_rate_live: compZaroniaLive,
    hedge_effective_flag_live: hedgeOkLive,
    predicted_resolution_days_live: predictedResolveLive,
    urgency_band_live: urgencyLive,
    systemic_carrier_live: systemicCarrierLive,
    interbank_flag_live: interbank,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier             = c.req.query('tier');
  const instrument_type  = c.req.query('instrument_type');
  const legacy_benchmark = c.req.query('legacy_benchmark');
  const status           = c.req.query('status');
  const counterparty_id  = c.req.query('counterparty_id');
  const fallback_class   = c.req.query('fallback_class');
  const breached         = c.req.query('breached');
  const reportable       = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_benchmark_transitions WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)             { sql += ' AND transition_tier = ?'; binds.push(tier); }
  if (instrument_type)  { sql += ' AND instrument_type = ?'; binds.push(instrument_type); }
  if (legacy_benchmark) { sql += ' AND legacy_benchmark = ?'; binds.push(legacy_benchmark); }
  if (status)           { sql += ' AND chain_status = ?'; binds.push(status); }
  if (counterparty_id)  { sql += ' AND counterparty_id = ?'; binds.push(counterparty_id); }
  if (fallback_class)   { sql += ' AND fallback_class = ?'; binds.push(fallback_class); }
  sql += ' ORDER BY datetime(inventoried_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<BxtRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_instrument: Record<string, number> = {};
  const by_legacy: Record<string, number> = {};
  const by_fallback: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status]            = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.transition_tier]           = (by_tier[i.transition_tier] || 0) + 1;
    by_instrument[i.instrument_type]     = (by_instrument[i.instrument_type] || 0) + 1;
    by_legacy[i.legacy_benchmark]        = (by_legacy[i.legacy_benchmark] || 0) + 1;
    const fb = i.fallback_class || 'unclassified';
    by_fallback[fb]                      = (by_fallback[fb] || 0) + 1;
    by_urgency[i.urgency_band_live]      = (by_urgency[i.urgency_band_live] || 0) + 1;
  }

  const open_count               = items.filter((i) => !i.is_terminal).length;
  const inventoried_count        = items.filter((i) => i.chain_status === 'inventoried').length;
  const impact_assessed_count    = items.filter((i) => i.chain_status === 'impact_assessed').length;
  const classified_count         = items.filter((i) => i.chain_status === 'classified').length;
  const notified_count           = items.filter((i) => i.chain_status === 'notified').length;
  const responded_count          = items.filter((i) => i.chain_status === 'responded').length;
  const amendment_drafted_count  = items.filter((i) => i.chain_status === 'amendment_drafted').length;
  const amendment_executed_count = items.filter((i) => i.chain_status === 'amendment_executed').length;
  const vt_settled_count         = items.filter((i) => i.chain_status === 'vt_settled').length;
  const transitioned_clean_count = items.filter((i) => i.chain_status === 'transitioned_clean').length;
  const disputed_count           = items.filter((i) => i.chain_status === 'disputed').length;
  const on_hold_count            = items.filter((i) => i.chain_status === 'on_hold').length;
  const terminated_legacy_count  = items.filter((i) => i.chain_status === 'terminated_legacy').length;
  const cancelled_count          = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_count           = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total         = items.filter((i) => i.is_reportable_flag).length;
  const systemic_count           = items.filter((i) => i.transition_tier === 'systemic').length;
  const material_count           = items.filter((i) => i.transition_tier === 'material').length;
  const interbank_count          = items.filter((i) => i.counterparty_interbank === 1).length;
  const critical_urgency_count   = items.filter((i) => i.urgency_band_live === 'critical').length;
  const total_notional_zar       = items.reduce((s, i) => s + (i.notional_zar || 0), 0);
  const total_open_notional_zar  = items.filter((i) => !i.is_terminal).reduce((s, i) => s + (i.notional_zar || 0), 0);
  const total_pv01_zar           = items.reduce((s, i) => s + (i.pv01_zar_live || 0), 0);
  const total_value_transfer_zar = items.reduce((s, i) => s + (i.value_transfer_zar_live || 0), 0);
  const protocol_adoption_pct    = items.length > 0
    ? Math.round((items.filter((i) => i.fallback_class === 'isda_protocol').length / items.length) * 10000) / 100
    : 0;
  const transitioned_clean_pct   = items.length > 0
    ? Math.round((transitioned_clean_count / items.length) * 10000) / 100
    : 0;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_instrument,
      by_legacy,
      by_fallback,
      by_urgency,
      open_count,
      inventoried_count,
      impact_assessed_count,
      classified_count,
      notified_count,
      responded_count,
      amendment_drafted_count,
      amendment_executed_count,
      vt_settled_count,
      transitioned_clean_count,
      disputed_count,
      on_hold_count,
      terminated_legacy_count,
      cancelled_count,
      breached: breached_count,
      reportable_total,
      systemic_count,
      material_count,
      interbank_count,
      critical_urgency_count,
      total_notional_zar,
      total_open_notional_zar,
      total_pv01_zar,
      total_value_transfer_zar,
      protocol_adoption_pct,
      transitioned_clean_pct,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_benchmark_transitions WHERE id = ?').bind(id).first<BxtRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_benchmark_transition_events WHERE transition_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<BxtEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CommonBody {
  last_action_ref?: string;
  regulator_ref?: string;
  transition_summary?: string;
  notes?: string;
}
interface AssessImpactBody extends CommonBody {
  pv01_zar?: number;
  value_transfer_zar?: number;
  hedge_effective_flag?: 0 | 1;
}
interface ClassifyFallbackBody extends CommonBody {
  replacement_rate?: ReplacementRate;
  fallback_class?: FallbackClass;
  protocol_adherence_flag?: 0 | 1;
}
interface NotifyCounterpartyBody extends CommonBody {}
interface RecordResponseBody extends CommonBody {
  counterparty_response_pct?: number;
}
interface DraftAmendmentBody extends CommonBody {}
interface ExecuteAmendmentBody extends CommonBody {}
interface SettleVtBody extends CommonBody {
  value_transfer_zar?: number;
}
interface CompleteTransitionBody extends CommonBody {}
interface RaiseDisputeBody extends CommonBody {
  dispute_concentration?: number;
  predicted_resolution_days?: number;
}
interface ResolveDisputeBody extends CommonBody {}
interface PlaceOnHoldBody extends CommonBody {}
interface ResumeBody extends CommonBody {}
interface TerminateLegacyBody extends CommonBody {}
interface CancelBody extends CommonBody {}

async function transition(
  c: Context<HonoEnv>,
  action: BenchmarkTransitionAction,
  bodyHandler?: (row: BxtRow, body: Record<string, unknown>) => Partial<BxtRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_benchmark_transitions WHERE id = ?').bind(id).first<BxtRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Tier RE-DERIVED on every transition. Recompute from notional + interbank
  // + days-to-cessation so a tier escalation on cessation approach retightens
  // the SLA and crossing decisions in this same write.
  const now = new Date();
  const nowIso = now.toISOString();
  const cessation = row.cessation_date ? new Date(row.cessation_date) : null;
  const daysCess = cessation ? daysToCessation(cessation, now) : 9999;
  const interbank = row.counterparty_interbank === 1;
  const tier = tierForNotional(row.notional_zar, interbank, daysCess);
  overrides.transition_tier = tier;
  overrides.days_to_cessation = daysCess;

  // Live battery scalars re-derived every write.
  const remainingYears = row.remaining_years || 0;
  overrides.pv01_zar = pv01Zar(row.notional_zar, remainingYears, row.instrument_type);
  overrides.value_transfer_zar = (typeof overrides.value_transfer_zar === 'number')
    ? overrides.value_transfer_zar
    : valueTransferZar(row.notional_zar, remainingYears, row.legacy_benchmark);
  overrides.isda_spread_bps = fallbackBasisBps(row.legacy_benchmark);
  overrides.compounded_zaronia_rate = compoundedZaroniaRate(row.zaronia_overnight || 0, row.legacy_benchmark);
  overrides.hedge_effective_flag = hedgeEffectivenessFlag(row.legacy_benchmark) ? 1 : 0;
  overrides.predicted_resolution_days = predictedResolutionDays(to, tier);

  // Fallback class implies protocol_adherence_flag.
  const fbClass = (overrides.fallback_class as FallbackClass | undefined) ?? row.fallback_class;
  if (fbClass) {
    overrides.protocol_adherence_flag = fbClass === 'isda_protocol' ? 1 : 0;
  }

  const slaDate = slaDeadlineFor(to, tier, now);
  const slaIso = slaDate ? slaDate.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier);
  const carrierFlag = isSystemicCarrier(interbank, daysCess);
  overrides.is_reportable = (isReportable(tier, carrierFlag) || crosses) ? 1 : 0;

  // Gate flags — set the inbound state flag on entry.
  if (to === 'impact_assessed')    overrides.impact_assessed_flag = 1;
  if (to === 'classified')         overrides.classified_flag = 1;
  if (to === 'notified')           overrides.notified_flag = 1;
  if (to === 'responded')          overrides.responded_flag = 1;
  if (to === 'amendment_drafted')  overrides.amendment_drafted_flag = 1;
  if (to === 'amendment_executed') overrides.amendment_executed_flag = 1;
  if (to === 'vt_settled')         overrides.vt_settled_flag = 1;
  if (to === 'transitioned_clean') overrides.transitioned_clean_flag = 1;
  if (to === 'disputed')           overrides.disputed_flag = 1;
  if (to === 'on_hold')            overrides.on_hold_flag = 1;
  if (to === 'terminated_legacy')  overrides.terminated_legacy_flag = 1;
  if (to === 'cancelled')          overrides.cancelled_flag = 1;
  if (action === 'raise_dispute')    overrides.escalation_level = (row.escalation_level || 0) + 1;
  if (action === 'terminate_legacy') overrides.escalation_level = (row.escalation_level || 0) + 1;

  const tsCol = TIMESTAMP_COLUMN[to];
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
    `UPDATE oe_benchmark_transitions SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `bxt_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_benchmark_transition_events (id, transition_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'benchmark_transition',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      transition_tier: tier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_benchmark_transitions WHERE id = ?').bind(id).first<BxtRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<BxtRow>): Partial<BxtRow> {
  if (typeof b.last_action_ref === 'string')    out.last_action_ref = b.last_action_ref;
  if (typeof b.regulator_ref === 'string')      out.regulator_ref = b.regulator_ref;
  if (typeof b.transition_summary === 'string') out.transition_summary = b.transition_summary;
  return out;
}

app.post('/:id/assess-impact', async (c) => transition(c, 'assess_impact', (_row, body) => {
  const b = body as Partial<AssessImpactBody>;
  const out: Partial<BxtRow> = {};
  if (typeof b.pv01_zar === 'number')           out.pv01_zar = b.pv01_zar;
  if (typeof b.value_transfer_zar === 'number') out.value_transfer_zar = b.value_transfer_zar;
  if (b.hedge_effective_flag === 0 || b.hedge_effective_flag === 1) out.hedge_effective_flag = b.hedge_effective_flag;
  return applyCommon(b, out);
}));

app.post('/:id/classify-fallback', async (c) => transition(c, 'classify_fallback', (_row, body) => {
  const b = body as Partial<ClassifyFallbackBody>;
  const out: Partial<BxtRow> = {};
  if (typeof b.replacement_rate === 'string') out.replacement_rate = b.replacement_rate;
  if (typeof b.fallback_class === 'string')   out.fallback_class = b.fallback_class;
  if (b.protocol_adherence_flag === 0 || b.protocol_adherence_flag === 1) out.protocol_adherence_flag = b.protocol_adherence_flag;
  return applyCommon(b, out);
}));

app.post('/:id/notify-counterparty', async (c) => transition(c, 'notify_counterparty', (_row, body) =>
  applyCommon(body as Partial<NotifyCounterpartyBody>, {}),
));

app.post('/:id/record-response', async (c) => transition(c, 'record_response', (_row, body) => {
  const b = body as Partial<RecordResponseBody>;
  const out: Partial<BxtRow> = {};
  if (typeof b.counterparty_response_pct === 'number') out.counterparty_response_pct = b.counterparty_response_pct;
  return applyCommon(b, out);
}));

app.post('/:id/draft-amendment', async (c) => transition(c, 'draft_amendment', (_row, body) =>
  applyCommon(body as Partial<DraftAmendmentBody>, {}),
));

app.post('/:id/execute-amendment', async (c) => transition(c, 'execute_amendment', (_row, body) =>
  applyCommon(body as Partial<ExecuteAmendmentBody>, {}),
));

app.post('/:id/settle-vt', async (c) => transition(c, 'settle_vt', (_row, body) => {
  const b = body as Partial<SettleVtBody>;
  const out: Partial<BxtRow> = {};
  if (typeof b.value_transfer_zar === 'number') out.value_transfer_zar = b.value_transfer_zar;
  return applyCommon(b, out);
}));

app.post('/:id/complete-transition', async (c) => transition(c, 'complete_transition', (_row, body) =>
  applyCommon(body as Partial<CompleteTransitionBody>, {}),
));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (_row, body) => {
  const b = body as Partial<RaiseDisputeBody>;
  const out: Partial<BxtRow> = {};
  if (typeof b.dispute_concentration === 'number')     out.dispute_concentration = b.dispute_concentration;
  if (typeof b.predicted_resolution_days === 'number') out.predicted_resolution_days = b.predicted_resolution_days;
  return applyCommon(b, out);
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) =>
  applyCommon(body as Partial<ResolveDisputeBody>, {}),
));

app.post('/:id/place-on-hold', async (c) => transition(c, 'place_on_hold', (_row, body) =>
  applyCommon(body as Partial<PlaceOnHoldBody>, {}),
));

app.post('/:id/resume', async (c) => transition(c, 'resume', (_row, body) =>
  applyCommon(body as Partial<ResumeBody>, {}),
));

app.post('/:id/terminate-legacy', async (c) => transition(c, 'terminate_legacy', (_row, body) =>
  applyCommon(body as Partial<TerminateLegacyBody>, {}),
));

app.post('/:id/cancel', async (c) => transition(c, 'cancel', (_row, body) =>
  applyCommon(body as Partial<CancelBody>, {}),
));

export async function benchmarkTransitionSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_benchmark_transitions
     WHERE chain_status NOT IN ('transitioned_clean','terminated_legacy','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<BxtRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_benchmark_transitions
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `bxt_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_benchmark_transition_events (id, transition_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'benchmark_transition.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'transition_desk',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.transition_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.transition_tier)) {
      await fireCascade({
        event: 'benchmark_transition.sla_breached',
        actor_id: 'system',
        entity_type: 'benchmark_transition',
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
