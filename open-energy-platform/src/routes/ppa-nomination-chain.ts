// ═══════════════════════════════════════════════════════════════════════════
// Wave 87 — Offtaker PPA Scheduled-Energy Nomination & Deviation Settlement (P6).
// 10th Offtaker chain.
//
// Mounted at /api/ppa-nomination/chain.
//
// The daily/monthly operational pulse of any PPA. Day-ahead nomination →
// confirmation → (optional intra-day revision) → gate closure → delivery →
// meter ingestion → reconciliation → SETTLEMENT at the deviation tariff.
// Dispute branch crosses into NERSA s30. Excused branch catches force-majeure
// / curtailment relief.
//
// DISTINCTIVE move (beats Mott MacDonald PPA Manager / KPMG PPA Operations /
// Power Advocate PPA Monitor / Open Energi VPP / Schneider EcoStruxure Energy /
// SAP IS-U / Oracle Utilities CC&B — all of which run as static Excel
// reconciliation workbooks or quarterly MIS dumps with manual deviation
// classification): LIVE nomination-integrity battery on every record —
// absolute MWh deviation, signed deviation, abs %, deviation value ZAR,
// predicted penalty ZAR (×1.0/1.2/1.5/2.0 band ladder), capacity-factor
// realized, forecast accuracy, weather-normalised residual, 3-period trend,
// SLA days remaining, urgency band. Tier RE-DERIVED on every transition from
// absolute deviation pct so a clean nomination can deteriorate into major as
// meter data lands, and a dispute resolution can bring a major period back to
// minor.
//
// Write model — SINGLE offtaker desk {admin, offtaker}. READ all nine personas.
// actor_party (offtaker / seller / system_operator / independent_meter)
// records the functional owner per step, not the JWT role.
//
// Reportability (the W87 SIGNATURE is NOMINATION-INTEGRITY):
//   raise_dispute     crosses for EVERY tier — PPA disputes always to NERSA
//                     s30 (sister of W66 complaints — hard line).
//   excuse_period     crosses for material + major — large excused volumes.
//   settle_deviation  crosses for material + major — large penalty disclosures.
//   sla_breached      crosses for material + major.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForDeviationPct,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  absoluteDeviationMwh,
  absoluteDeviationPct,
  signedDeviationMwh,
  deviationValueZar,
  predictedPenaltyZar,
  capacityFactorRealized,
  forecastAccuracyPct,
  weatherNormalizedDeviation,
  deviationTrend3Period,
  predictedResolutionDays,
  slaDaysRemaining,
  urgencyBand,
  SLA_MINUTES,
  type PnomStatus,
  type PnomAction,
  type PnomTier,
} from '../utils/ppa-nomination-spec';

const READ_ROLES = new Set([
  'admin', 'offtaker',
  'ipp_developer', 'support', 'trader', 'regulator', 'lender', 'grid_operator', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'offtaker']);

interface PnomRow {
  id: string;
  nomination_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  ppa_id: string;
  ppa_reference: string;
  offtaker_id: string;
  offtaker_name: string;
  seller_id: string;
  seller_name: string;
  facility_id: string;
  facility_name: string;
  system_operator_id: string | null;
  system_operator_name: string | null;
  meter_operator_id: string | null;
  meter_operator_name: string | null;
  delivery_period_label: string;
  delivery_period_start: string;
  delivery_period_end: string;
  delivery_period_hours: number;
  installed_capacity_mw: number;
  da_nominated_mwh: number;
  id_revised_mwh: number | null;
  effective_nominated_mwh: number;
  metered_mwh: number | null;
  signed_deviation_mwh: number;
  absolute_deviation_mwh: number;
  absolute_deviation_pct: number;
  weather_attributable_pct: number;
  prior_pct_1: number | null;
  prior_pct_2: number | null;
  prior_pct_3: number | null;
  ppa_tariff_zar_per_mwh: number;
  deviation_tariff_zar_per_mwh: number;
  penalty_tariff_zar_per_mwh: number;
  contract_value_zar: number;
  deviation_value_zar: number;
  predicted_penalty_zar: number;
  settled_amount_zar: number | null;
  excuse_reason: string | null;
  excuse_evidence_ref: string | null;
  dispute_ground: string | null;
  dispute_resolution_ref: string | null;
  id_revision_count: number;
  deviation_tier: PnomTier;
  da_nominated_flag: number;
  da_confirmed_flag: number;
  id_revised_flag: number;
  delivery_in_progress_flag: number;
  delivery_complete_flag: number;
  meter_data_flag: number;
  reconciled_flag: number;
  dispute_flag: number;
  settled_flag: number;
  excused_flag: number;
  cancelled_flag: number;
  last_action_ref: string | null;
  regulator_ref: string | null;
  chain_basis: string | null;
  reason_code: string | null;
  nomination_summary: string | null;
  chain_status: PnomStatus;
  nomination_window_open_at: string;
  da_nominated_at: string | null;
  da_confirmed_at: string | null;
  id_revised_at: string | null;
  delivery_in_progress_at: string | null;
  delivery_complete_at: string | null;
  meter_data_received_at: string | null;
  reconciled_at: string | null;
  dispute_raised_at: string | null;
  deviation_settled_at: string | null;
  excused_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PnomEventRow {
  id: string;
  nomination_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<PnomStatus, keyof PnomRow | null> = {
  nomination_window_open: null,
  da_nominated:           'da_nominated_at',
  da_confirmed:           'da_confirmed_at',
  id_revised:             'id_revised_at',
  delivery_in_progress:   'delivery_in_progress_at',
  delivery_complete:      'delivery_complete_at',
  meter_data_received:    'meter_data_received_at',
  reconciled:             'reconciled_at',
  dispute_raised:         'dispute_raised_at',
  deviation_settled:      'deviation_settled_at',
  excused:                'excused_at',
  cancelled:              'cancelled_at',
};

function eventTypeFor(action: PnomAction): string {
  switch (action) {
    case 'submit_da_nomination': return 'ppa_nomination.da_nominated';
    case 'confirm_da':           return 'ppa_nomination.da_confirmed';
    case 'reject_da':            return 'ppa_nomination.da_rejected';
    case 'submit_id_revision':   return 'ppa_nomination.id_revised';
    case 'close_gate':           return 'ppa_nomination.delivery_in_progress';
    case 'complete_delivery':    return 'ppa_nomination.delivery_complete';
    case 'ingest_meter':         return 'ppa_nomination.meter_data_received';
    case 'reconcile':            return 'ppa_nomination.reconciled';
    case 'raise_dispute':        return 'ppa_nomination.dispute_raised';
    case 'resolve_dispute':      return 'ppa_nomination.reconciled';
    case 'settle_deviation':     return 'ppa_nomination.deviation_settled';
    case 'excuse_period':        return 'ppa_nomination.excused';
    case 'cancel_nomination':    return 'ppa_nomination.cancelled';
  }
}

function statusEnteredAt(row: PnomRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return new Date(row.nomination_window_open_at);
  const iso = row[col] as string | null;
  return iso ? new Date(iso) : null;
}

function decorate(row: PnomRow, now: Date) {
  const tier = row.deviation_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const absMwh = absoluteDeviationMwh(row.metered_mwh, row.effective_nominated_mwh);
  const absPct = absoluteDeviationPct(row.metered_mwh, row.effective_nominated_mwh);
  const signedMwh = signedDeviationMwh(row.metered_mwh, row.effective_nominated_mwh);
  const devValue = deviationValueZar(absMwh, row.deviation_tariff_zar_per_mwh);
  const penalty = predictedPenaltyZar(absPct, devValue);
  const cf = capacityFactorRealized(row.metered_mwh, row.installed_capacity_mw, row.delivery_period_hours);
  const accuracy = forecastAccuracyPct(absPct);
  const weatherNormalized = weatherNormalizedDeviation(absPct, row.weather_attributable_pct);
  const trend3 = deviationTrend3Period(row.prior_pct_1, row.prior_pct_2, row.prior_pct_3);
  const predictedDays = predictedResolutionDays(status, tier);
  const enteredAt = statusEnteredAt(row);
  const daysRemaining = slaDaysRemaining(status, tier, enteredAt, now);
  const urgency = urgencyBand(absPct, daysRemaining);

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    absolute_deviation_mwh_live: absMwh,
    absolute_deviation_pct_live: absPct,
    signed_deviation_mwh_live: signedMwh,
    deviation_value_zar_live: devValue,
    predicted_penalty_zar_live: penalty,
    capacity_factor_realized_live: cf,
    forecast_accuracy_pct_live: accuracy,
    weather_normalized_deviation_live: weatherNormalized,
    deviation_trend_3_period_live: trend3,
    predicted_resolution_days_live: predictedDays,
    sla_days_remaining_live: daysRemaining,
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

  const deviation_tier = c.req.query('deviation_tier');
  const status         = c.req.query('status');
  const ppa_id         = c.req.query('ppa_id');
  const offtaker_id    = c.req.query('offtaker_id');
  const seller_id      = c.req.query('seller_id');
  const facility_id    = c.req.query('facility_id');
  const breached       = c.req.query('breached');
  const reportable     = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_ppa_nominations WHERE 1=1';
  const binds: unknown[] = [];
  if (deviation_tier) { sql += ' AND deviation_tier = ?'; binds.push(deviation_tier); }
  if (status)         { sql += ' AND chain_status = ?';   binds.push(status); }
  if (ppa_id)         { sql += ' AND ppa_id = ?';         binds.push(ppa_id); }
  if (offtaker_id)    { sql += ' AND offtaker_id = ?';    binds.push(offtaker_id); }
  if (seller_id)      { sql += ' AND seller_id = ?';      binds.push(seller_id); }
  if (facility_id)    { sql += ' AND facility_id = ?';    binds.push(facility_id); }

  sql += ' ORDER BY datetime(nomination_window_open_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PnomRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_ppa: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.deviation_tier] = (by_tier[i.deviation_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_ppa[i.ppa_id] = (by_ppa[i.ppa_id] || 0) + 1;
  }

  const open_count            = items.filter((i) => !i.is_terminal).length;
  const settled_count         = items.filter((i) => i.chain_status === 'deviation_settled').length;
  const excused_count         = items.filter((i) => i.chain_status === 'excused').length;
  const cancelled_count       = items.filter((i) => i.chain_status === 'cancelled').length;
  const dispute_count         = items.filter((i) => i.chain_status === 'dispute_raised').length;
  const reconciled_count      = items.filter((i) => i.chain_status === 'reconciled').length;
  const in_delivery_count     = items.filter((i) => i.chain_status === 'delivery_in_progress').length;
  const breached_count        = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable_flag).length;
  const total_nominated_mwh   = items.reduce((s, i) => s + (i.effective_nominated_mwh || 0), 0);
  const total_metered_mwh     = items.reduce((s, i) => s + (i.metered_mwh || 0), 0);
  const total_deviation_mwh   = items.reduce((s, i) => s + (i.absolute_deviation_mwh_live || 0), 0);
  const total_settled_zar     = items.reduce((s, i) => s + (i.settled_amount_zar || 0), 0);
  const total_predicted_penalty_zar = items.reduce((s, i) => s + (i.predicted_penalty_zar_live || 0), 0);
  const critical_urgency_count = items.filter((i) => i.urgency_band_live === 'critical').length;
  const major_tier_count      = items.filter((i) => i.deviation_tier === 'major').length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_ppa,
      open_count,
      settled_count,
      excused_count,
      cancelled_count,
      dispute_count,
      reconciled_count,
      in_delivery_count,
      breached: breached_count,
      reportable_total,
      total_nominated_mwh,
      total_metered_mwh,
      total_deviation_mwh,
      total_settled_zar,
      total_predicted_penalty_zar,
      critical_urgency_count,
      major_tier_count,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_nominations WHERE id = ?').bind(id).first<PnomRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ppa_nomination_events WHERE nomination_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<PnomEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CommonBody { chain_basis?: string; last_action_ref?: string; reason_code?: string; regulator_ref?: string; notes?: string; nomination_summary?: string; }
interface SubmitDaBody extends CommonBody { da_nominated_mwh?: number; effective_nominated_mwh?: number; ppa_tariff_zar_per_mwh?: number; deviation_tariff_zar_per_mwh?: number; penalty_tariff_zar_per_mwh?: number; installed_capacity_mw?: number; weather_attributable_pct?: number; }
interface ConfirmDaBody extends CommonBody {}
interface RejectDaBody extends CommonBody {}
interface SubmitIdBody extends CommonBody { id_revised_mwh?: number; effective_nominated_mwh?: number; }
interface CloseGateBody extends CommonBody {}
interface CompleteDeliveryBody extends CommonBody {}
interface IngestMeterBody extends CommonBody { metered_mwh?: number; }
interface ReconcileBody extends CommonBody { metered_mwh?: number; weather_attributable_pct?: number; }
interface RaiseDisputeBody extends CommonBody { dispute_ground?: string; }
interface ResolveDisputeBody extends CommonBody { dispute_resolution_ref?: string; }
interface SettleDeviationBody extends CommonBody { settled_amount_zar?: number; }
interface ExcusePeriodBody extends CommonBody { excuse_reason?: string; excuse_evidence_ref?: string; }
interface CancelNominationBody extends CommonBody {}

async function transition(
  c: Context<HonoEnv>,
  action: PnomAction,
  bodyHandler?: (row: PnomRow, body: Record<string, unknown>) => Partial<PnomRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_nominations WHERE id = ?').bind(id).first<PnomRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive deviation analytics from the freshest scalars.
  const metered = (overrides.metered_mwh as number | undefined) ?? row.metered_mwh;
  const nominated = (overrides.effective_nominated_mwh as number | undefined) ?? row.effective_nominated_mwh;
  const devTariff = (overrides.deviation_tariff_zar_per_mwh as number | undefined) ?? row.deviation_tariff_zar_per_mwh;

  const absMwh = absoluteDeviationMwh(metered, nominated);
  const absPct = absoluteDeviationPct(metered, nominated);
  const signedMwh = signedDeviationMwh(metered, nominated);
  const devValue = deviationValueZar(absMwh, devTariff);
  const penalty = predictedPenaltyZar(absPct, devValue);

  overrides.absolute_deviation_mwh = absMwh;
  overrides.absolute_deviation_pct = absPct;
  overrides.signed_deviation_mwh = signedMwh;
  overrides.deviation_value_zar = devValue;
  overrides.predicted_penalty_zar = penalty;

  // Tier RE-DERIVED on every transition from the absolute deviation pct.
  const tier = tierForDeviationPct(absPct);
  overrides.deviation_tier = tier;

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier);
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

  // Gate flags + counters.
  if (to === 'da_nominated')         overrides.da_nominated_flag = 1;
  if (to === 'da_confirmed')         overrides.da_confirmed_flag = 1;
  if (to === 'id_revised') {
    overrides.id_revised_flag = 1;
    overrides.id_revision_count = (row.id_revision_count || 0) + 1;
  }
  if (to === 'delivery_in_progress') overrides.delivery_in_progress_flag = 1;
  if (to === 'delivery_complete')    overrides.delivery_complete_flag = 1;
  if (to === 'meter_data_received')  overrides.meter_data_flag = 1;
  if (to === 'reconciled')           overrides.reconciled_flag = 1;
  if (to === 'dispute_raised')       overrides.dispute_flag = 1;
  if (to === 'deviation_settled')    overrides.settled_flag = 1;
  if (to === 'excused')              overrides.excused_flag = 1;
  if (to === 'cancelled')            overrides.cancelled_flag = 1;
  if (action === 'reject_da')        overrides.escalation_level = (row.escalation_level || 0) + 1;

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
    `UPDATE oe_ppa_nominations SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `ppn_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ppa_nomination_events (id, nomination_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'ppa_nomination',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      deviation_tier: tier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ppa_nominations WHERE id = ?').bind(id).first<PnomRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<PnomRow>): Partial<PnomRow> {
  if (typeof b.chain_basis === 'string')       out.chain_basis = b.chain_basis;
  if (typeof b.last_action_ref === 'string')   out.last_action_ref = b.last_action_ref;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')     out.regulator_ref = b.regulator_ref;
  if (typeof b.nomination_summary === 'string') out.nomination_summary = b.nomination_summary;
  return out;
}

app.post('/:id/submit-da-nomination', async (c) => transition(c, 'submit_da_nomination', (_row, body) => {
  const b = body as Partial<SubmitDaBody>;
  const out: Partial<PnomRow> = {};
  if (typeof b.da_nominated_mwh === 'number')             out.da_nominated_mwh = b.da_nominated_mwh;
  if (typeof b.effective_nominated_mwh === 'number')      out.effective_nominated_mwh = b.effective_nominated_mwh;
  else if (typeof b.da_nominated_mwh === 'number')        out.effective_nominated_mwh = b.da_nominated_mwh;
  if (typeof b.ppa_tariff_zar_per_mwh === 'number')       out.ppa_tariff_zar_per_mwh = b.ppa_tariff_zar_per_mwh;
  if (typeof b.deviation_tariff_zar_per_mwh === 'number') out.deviation_tariff_zar_per_mwh = b.deviation_tariff_zar_per_mwh;
  if (typeof b.penalty_tariff_zar_per_mwh === 'number')   out.penalty_tariff_zar_per_mwh = b.penalty_tariff_zar_per_mwh;
  if (typeof b.installed_capacity_mw === 'number')        out.installed_capacity_mw = b.installed_capacity_mw;
  if (typeof b.weather_attributable_pct === 'number')     out.weather_attributable_pct = b.weather_attributable_pct;
  return applyCommon(b, out);
}));

app.post('/:id/confirm-da', async (c) => transition(c, 'confirm_da', (_row, body) =>
  applyCommon(body as Partial<ConfirmDaBody>, {}),
));

app.post('/:id/reject-da', async (c) => transition(c, 'reject_da', (_row, body) =>
  applyCommon(body as Partial<RejectDaBody>, {}),
));

app.post('/:id/submit-id-revision', async (c) => transition(c, 'submit_id_revision', (_row, body) => {
  const b = body as Partial<SubmitIdBody>;
  const out: Partial<PnomRow> = {};
  if (typeof b.id_revised_mwh === 'number')          out.id_revised_mwh = b.id_revised_mwh;
  if (typeof b.effective_nominated_mwh === 'number') out.effective_nominated_mwh = b.effective_nominated_mwh;
  else if (typeof b.id_revised_mwh === 'number')     out.effective_nominated_mwh = b.id_revised_mwh;
  return applyCommon(b, out);
}));

app.post('/:id/close-gate', async (c) => transition(c, 'close_gate', (_row, body) =>
  applyCommon(body as Partial<CloseGateBody>, {}),
));

app.post('/:id/complete-delivery', async (c) => transition(c, 'complete_delivery', (_row, body) =>
  applyCommon(body as Partial<CompleteDeliveryBody>, {}),
));

app.post('/:id/ingest-meter', async (c) => transition(c, 'ingest_meter', (_row, body) => {
  const b = body as Partial<IngestMeterBody>;
  const out: Partial<PnomRow> = {};
  if (typeof b.metered_mwh === 'number') out.metered_mwh = b.metered_mwh;
  return applyCommon(b, out);
}));

app.post('/:id/reconcile', async (c) => transition(c, 'reconcile', (_row, body) => {
  const b = body as Partial<ReconcileBody>;
  const out: Partial<PnomRow> = {};
  if (typeof b.metered_mwh === 'number')              out.metered_mwh = b.metered_mwh;
  if (typeof b.weather_attributable_pct === 'number') out.weather_attributable_pct = b.weather_attributable_pct;
  return applyCommon(b, out);
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (_row, body) => {
  const b = body as Partial<RaiseDisputeBody>;
  const out: Partial<PnomRow> = {};
  if (typeof b.dispute_ground === 'string') out.dispute_ground = b.dispute_ground;
  return applyCommon(b, out);
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) => {
  const b = body as Partial<ResolveDisputeBody>;
  const out: Partial<PnomRow> = {};
  if (typeof b.dispute_resolution_ref === 'string') out.dispute_resolution_ref = b.dispute_resolution_ref;
  return applyCommon(b, out);
}));

app.post('/:id/settle-deviation', async (c) => transition(c, 'settle_deviation', (_row, body) => {
  const b = body as Partial<SettleDeviationBody>;
  const out: Partial<PnomRow> = {};
  if (typeof b.settled_amount_zar === 'number') out.settled_amount_zar = b.settled_amount_zar;
  return applyCommon(b, out);
}));

app.post('/:id/excuse-period', async (c) => transition(c, 'excuse_period', (_row, body) => {
  const b = body as Partial<ExcusePeriodBody>;
  const out: Partial<PnomRow> = {};
  if (typeof b.excuse_reason === 'string')        out.excuse_reason = b.excuse_reason;
  if (typeof b.excuse_evidence_ref === 'string')  out.excuse_evidence_ref = b.excuse_evidence_ref;
  return applyCommon(b, out);
}));

app.post('/:id/cancel-nomination', async (c) => transition(c, 'cancel_nomination', (_row, body) =>
  applyCommon(body as Partial<CancelNominationBody>, {}),
));

export async function ppaNominationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ppa_nominations
     WHERE chain_status NOT IN ('deviation_settled','excused','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<PnomRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ppa_nominations
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ppn_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ppa_nomination_events (id, nomination_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'ppa_nomination.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system_operator',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.deviation_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.deviation_tier)) {
      await fireCascade({
        event: 'ppa_nomination.sla_breached',
        actor_id: 'system',
        entity_type: 'ppa_nomination',
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
