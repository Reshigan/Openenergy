// ═══════════════════════════════════════════════════════════════════════════
// Wave 101 — Offtaker PPA Annual Reconciliation & True-Up (P6).
// 11th Offtaker chain.
//
// Mounted at /api/offtaker/ppa-annual-recon/chain.
//
// The annual financial-close gate of a PPA. Aggregates 12 months of W87
// nominations + W32 take-or-pay annual residual + W39 CPI tariff indexation
// + W46 deemed-energy curtailment credits + W54 payment-security activity +
// capacity payment annual roll into ONE closed-year ledger with auditor +
// counterparty signoff, a restate-after-settlement door, and a regulator hard
// line on year re-opens.
//
// DISTINCTIVE move (beats EnPowered PPA Settlement / DNV Synergi PPA /
// Schneider PPA Manager / Open Energi Reconciliation / KPMG PPA Recon / Power
// Advocate Annual / Aurora Energy Research PPA Annual / Wood Mackenzie PPA
// Annual — all run as static year-end Excel binders signed off in quarterly
// MIS dumps): LIVE annual-close battery on every record — reconciliation
// completeness index 0-130 (baseline 100, +10 progressed past data_collected,
// +5 each compute/cpi/reconcile/signoff, -10 disputed, -5/restate -5 ball-not-
// in-court >14d), top_residual_zar, cpi_true_up_zar, capacity_payment_year_zar,
// deemed_energy_credit_zar, net_cash_position_zar, mwh_contracted_pct_delivered,
// days_to_signoff, urgency_band, predicted_year_close_date, authority_required
// (settlement_analyst→finance_controller→finance_director→cfo). Tier
// RE-DERIVED on every transition from MAX(|variance|% band, top_residual_zar
// band) with FLOOR-AT-MATERIAL on top_residual>R100m / cpi_true_up>R50m /
// offtake_shortfall>20% / contract_year_end_strict.
//
// Write model — SINGLE offtaker desk {admin, offtaker}. READ all nine personas.
// actor_party (settlement_analyst / counterparty / finance_controller /
// auditor / regulator_observer) records the functional owner per step.
//
// Reportability — W101 FINANCIAL-CLOSE SIGNATURE (IFRS 15 + NERSA s34):
//   restate_year   crosses EVERY tier — post-signoff restatement always to
//                  NERSA (sister of W77 declare_breach, W45 write_off).
//   raise_dispute  crosses EVERY tier — PPA disputes always to NERSA s30
//                  (sister of W87 raise_dispute, W66 lodge_appeal).
//   sign_off       crosses material + major — large signoff disclosable.
//   cancel_year    crosses EVERY tier when year had any delivery.
//   sla_breached   crosses material + major.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  effectiveTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  reconciliationCompletenessIndex,
  topResidualZar,
  cpiTrueUpZar,
  capacityPaymentYearZar,
  deemedEnergyCreditZar,
  netCashPositionZar,
  mwhContractedPctDelivered,
  slaDaysRemaining,
  daysToSignoff,
  urgencyBand,
  predictedYearCloseDate,
  authorityRequired,
  SLA_MINUTES,
  type ParStatus,
  type ParAction,
  type ParTier,
} from '../utils/ppa-annual-recon-spec';

const READ_ROLES = new Set([
  'admin', 'offtaker',
  'ipp_developer', 'support', 'trader', 'regulator', 'lender', 'grid_operator', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'offtaker']);

interface ParRow {
  id: string;
  recon_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  ppa_id: string;
  ppa_name: string | null;
  buyer_party_id: string | null;
  buyer_party_name: string | null;
  seller_party_id: string | null;
  seller_party_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  contract_year: number;
  contract_year_label: string | null;
  contract_year_end_strict: number;
  year_period_start: string | null;
  year_period_end: string | null;
  contracted_mwh: number | null;
  delivered_mwh: number | null;
  metered_mwh: number | null;
  curtailed_mwh: number | null;
  variance_mwh: number | null;
  variance_pct: number | null;
  base_tariff_zar_per_mwh: number | null;
  indexed_tariff_zar_per_mwh: number | null;
  deviation_tariff_zar_per_mwh: number | null;
  deemed_tariff_zar_per_mwh: number | null;
  capacity_tariff_zar_per_mw_year: number | null;
  installed_capacity_mw: number | null;
  availability_factor_decimal: number | null;
  energy_revenue_zar: number | null;
  capacity_payment_zar: number | null;
  deemed_energy_credit_zar: number | null;
  cpi_true_up_zar: number | null;
  top_residual_zar: number | null;
  prior_year_overpayment_zar: number | null;
  net_cash_position_zar: number | null;
  min_offtake_mwh: number | null;
  offtake_shortfall_pct: number | null;
  top_residual_over_r100m: number;
  cpi_true_up_over_r50m: number;
  offtake_shortfall_over_20_pct: number;
  current_tier: ParTier;
  authority_required: string | null;
  dispute_count: number;
  restate_count: number;
  year_had_delivery: number;
  parent_recon_id: string | null;
  prior_year_recon_id: string | null;
  regulator_ref: string | null;
  invoice_ref: string | null;
  payment_ref: string | null;
  ppa_contract_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  disputed_reason: string | null;
  restated_reason: string | null;
  cancelled_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  analyst_party: string | null;
  counterparty_party: string | null;
  auditor_party: string | null;
  chain_status: ParStatus;
  year_opened_at: string | null;
  data_collected_at: string | null;
  variance_classified_at: string | null;
  top_residual_computed_at: string | null;
  cpi_capacity_applied_at: string | null;
  reconciled_at: string | null;
  disputed_at: string | null;
  signed_off_at: string | null;
  invoiced_at: string | null;
  settled_at: string | null;
  restated_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ParEventRow {
  id: string;
  recon_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ParStatus, keyof ParRow | null> = {
  year_opened:           'year_opened_at',
  data_collected:        'data_collected_at',
  variance_classified:   'variance_classified_at',
  top_residual_computed: 'top_residual_computed_at',
  cpi_capacity_applied:  'cpi_capacity_applied_at',
  reconciled:            'reconciled_at',
  disputed:              'disputed_at',
  signed_off:            'signed_off_at',
  invoiced:              'invoiced_at',
  settled:               'settled_at',
  restated:              'restated_at',
  cancelled:             'cancelled_at',
};

function statusEnteredAt(row: ParRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.year_opened_at ? new Date(row.year_opened_at) : null;
  const iso = row[col] as string | null;
  return iso ? new Date(iso) : (row.year_opened_at ? new Date(row.year_opened_at) : null);
}

function daysInCourt(row: ParRow, now: Date): number {
  const entered = statusEnteredAt(row);
  if (!entered) return 0;
  const ms = now.getTime() - entered.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function decorate(row: ParRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const topRes = topResidualZar(row.min_offtake_mwh, row.delivered_mwh, row.deviation_tariff_zar_per_mwh);
  const cpiTu = cpiTrueUpZar(row.delivered_mwh, row.base_tariff_zar_per_mwh, row.indexed_tariff_zar_per_mwh);
  const capPay = capacityPaymentYearZar(row.installed_capacity_mw, row.capacity_tariff_zar_per_mw_year, row.availability_factor_decimal);
  const deemed = deemedEnergyCreditZar(row.curtailed_mwh, row.deemed_tariff_zar_per_mwh);
  const netCash = netCashPositionZar({
    energyRevenueZar: row.energy_revenue_zar,
    capacityPaymentZar: row.capacity_payment_zar ?? capPay,
    deemedEnergyCreditZar: row.deemed_energy_credit_zar ?? deemed,
    cpiTrueUpZar: row.cpi_true_up_zar ?? cpiTu,
    topResidualZar: row.top_residual_zar ?? topRes,
    priorYearOverpaymentZar: row.prior_year_overpayment_zar,
  });
  const mwhPct = mwhContractedPctDelivered(row.contracted_mwh, row.delivered_mwh);
  const dic = daysInCourt(row, now);
  const completeness = reconciliationCompletenessIndex({
    status,
    disputeCount: row.dispute_count,
    restateCount: row.restate_count,
    daysInCourt: dic,
  });
  const enteredAt = statusEnteredAt(row);
  const remaining = slaDaysRemaining(status, tier, enteredAt, now);
  const toSignoff = daysToSignoff(status, tier);
  const urgency = urgencyBand(tier, row.variance_pct, remaining);
  const predictedClose = predictedYearCloseDate(status, tier, now);
  const authority = authorityRequired(tier);
  const floorAtMaterialFlag =
    !!row.top_residual_over_r100m ||
    !!row.cpi_true_up_over_r50m ||
    !!row.offtake_shortfall_over_20_pct ||
    !!row.contract_year_end_strict;

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    floor_at_material_flag: floorAtMaterialFlag,
    reconciliation_completeness_index_live: completeness,
    top_residual_zar_live: topRes,
    cpi_true_up_zar_live: cpiTu,
    capacity_payment_year_zar_live: capPay,
    deemed_energy_credit_zar_live: deemed,
    net_cash_position_zar_live: netCash,
    mwh_contracted_pct_delivered_live: mwhPct,
    days_to_signoff_live: toSignoff,
    sla_days_remaining_live: remaining,
    urgency_band_live: urgency,
    predicted_year_close_date_live: predictedClose ? predictedClose.toISOString() : null,
    authority_required_live: authority,
    days_in_court_live: dic,
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
  const status       = c.req.query('status');
  const ppa_id       = c.req.query('ppa_id');
  const buyer_id     = c.req.query('buyer_id');
  const seller_id    = c.req.query('seller_id');
  const facility_id  = c.req.query('facility_id');
  const contractYear = c.req.query('contract_year');
  const breached     = c.req.query('breached');
  const reportable   = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_ppa_annual_recon WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)         { sql += ' AND current_tier = ?';     binds.push(tier); }
  if (status)       { sql += ' AND chain_status = ?';     binds.push(status); }
  if (ppa_id)       { sql += ' AND ppa_id = ?';           binds.push(ppa_id); }
  if (buyer_id)     { sql += ' AND buyer_party_id = ?';   binds.push(buyer_id); }
  if (seller_id)    { sql += ' AND seller_party_id = ?';  binds.push(seller_id); }
  if (facility_id)  { sql += ' AND facility_id = ?';      binds.push(facility_id); }
  if (contractYear) { sql += ' AND contract_year = ?';    binds.push(Number(contractYear)); }

  sql += ' ORDER BY contract_year DESC, datetime(year_opened_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ParRow>();
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
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_ppa[i.ppa_id] = (by_ppa[i.ppa_id] || 0) + 1;
  }

  const open_count            = items.filter((i) => !i.is_terminal && i.chain_status !== 'settled').length;
  const settled_count         = items.filter((i) => i.chain_status === 'settled').length;
  const signed_off_count      = items.filter((i) => i.chain_status === 'signed_off').length;
  const invoiced_count        = items.filter((i) => i.chain_status === 'invoiced').length;
  const reconciled_count      = items.filter((i) => i.chain_status === 'reconciled').length;
  const disputed_count        = items.filter((i) => i.chain_status === 'disputed').length;
  const restated_count        = items.filter((i) => i.chain_status === 'restated').length;
  const cancelled_count       = items.filter((i) => i.chain_status === 'cancelled').length;
  const signoff_pending_count = items.filter((i) => i.chain_status === 'reconciled' || i.chain_status === 'disputed').length;
  const breached_count        = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total      = items.filter((i) => i.is_reportable_flag).length;
  const total_top_residual_zar      = items.reduce((s, i) => s + (i.top_residual_zar_live || 0), 0);
  const total_cpi_true_up_zar       = items.reduce((s, i) => s + (i.cpi_true_up_zar_live || 0), 0);
  const total_deemed_energy_zar     = items.reduce((s, i) => s + (i.deemed_energy_credit_zar_live || 0), 0);
  const total_capacity_payment_zar  = items.reduce((s, i) => s + (i.capacity_payment_year_zar_live || 0), 0);
  const total_net_cash_position_zar = items.reduce((s, i) => s + (i.net_cash_position_zar_live || 0), 0);
  const avg_net_cash_position_zar   = items.length ? Math.round(total_net_cash_position_zar / items.length) : 0;
  const avg_completeness_index      = items.length
    ? Math.round((items.reduce((s, i) => s + (i.reconciliation_completeness_index_live || 0), 0) / items.length) * 10) / 10
    : 0;
  const critical_urgency_count = items.filter((i) => i.urgency_band_live === 'critical').length;
  const major_tier_count       = items.filter((i) => i.current_tier === 'major').length;
  const floor_at_material_count = items.filter((i) => i.floor_at_material_flag).length;

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
      signed_off_count,
      invoiced_count,
      reconciled_count,
      disputed_count,
      restated_count,
      cancelled_count,
      signoff_pending_count,
      breached: breached_count,
      reportable_total,
      total_top_residual_zar,
      total_cpi_true_up_zar,
      total_deemed_energy_zar,
      total_capacity_payment_zar,
      total_net_cash_position_zar,
      avg_net_cash_position_zar,
      avg_completeness_index,
      critical_urgency_count,
      major_tier_count,
      floor_at_material_count,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_annual_recon WHERE id = ?').bind(id).first<ParRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ppa_annual_recon_events WHERE recon_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ParEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CommonBody {
  notes?: string;
  reason_code?: string;
  regulator_ref?: string;
  invoice_ref?: string;
  payment_ref?: string;
  title?: string;
  narrative?: string;
  result_text?: string;
}
interface CollectDataBody extends CommonBody {
  contracted_mwh?: number;
  delivered_mwh?: number;
  metered_mwh?: number;
  curtailed_mwh?: number;
  min_offtake_mwh?: number;
  installed_capacity_mw?: number;
  availability_factor_decimal?: number;
  base_tariff_zar_per_mwh?: number;
  indexed_tariff_zar_per_mwh?: number;
  deviation_tariff_zar_per_mwh?: number;
  deemed_tariff_zar_per_mwh?: number;
  capacity_tariff_zar_per_mw_year?: number;
}
interface ClassifyVarianceBody extends CommonBody {
  variance_mwh?: number;
  variance_pct?: number;
  offtake_shortfall_pct?: number;
}
interface ComputeTopResidualBody extends CommonBody {
  top_residual_zar?: number;
  prior_year_overpayment_zar?: number;
}
interface ApplyCpiCapacityBody extends CommonBody {
  cpi_true_up_zar?: number;
  capacity_payment_zar?: number;
  deemed_energy_credit_zar?: number;
  energy_revenue_zar?: number;
}
interface ReconcileBody extends CommonBody {
  net_cash_position_zar?: number;
}
interface RaiseDisputeBody extends CommonBody {
  disputed_reason?: string;
}
interface ResolveDisputeBody extends CommonBody {}
interface SignOffBody extends CommonBody {
  auditor_party?: string;
  counterparty_party?: string;
}
interface InvoiceBody extends CommonBody {
  invoice_ref?: string;
}
interface SettleBody extends CommonBody {
  payment_ref?: string;
}
interface RestateYearBody extends CommonBody {
  restated_reason?: string;
}
interface CancelYearBody extends CommonBody {
  cancelled_reason?: string;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<ParRow>): Partial<ParRow> {
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.invoice_ref === 'string')   out.invoice_ref = b.invoice_ref;
  if (typeof b.payment_ref === 'string')   out.payment_ref = b.payment_ref;
  if (typeof b.title === 'string')         out.title = b.title;
  if (typeof b.narrative === 'string')     out.narrative = b.narrative;
  if (typeof b.result_text === 'string')   out.result_text = b.result_text;
  return out;
}

async function transition(
  c: Context<HonoEnv>,
  action: ParAction,
  bodyHandler?: (row: ParRow, body: Record<string, unknown>) => Partial<ParRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_annual_recon WHERE id = ?').bind(id).first<ParRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from freshest variance + residual scalars, plus four
  // FLOOR-AT-MATERIAL flags.
  const variancePct       = (overrides.variance_pct as number | undefined)        ?? row.variance_pct;
  const topResidualScalar = (overrides.top_residual_zar as number | undefined)    ?? row.top_residual_zar;
  const cpiTuScalar       = (overrides.cpi_true_up_zar as number | undefined)     ?? row.cpi_true_up_zar;
  const offtakeShortPct   = (overrides.offtake_shortfall_pct as number | undefined) ?? row.offtake_shortfall_pct;
  const yendStrict        = (overrides.contract_year_end_strict as number | undefined) ?? row.contract_year_end_strict;

  const topResidualOverR100m       = (topResidualScalar ?? 0) > 100_000_000;
  const cpiTrueUpOverR50m          = (cpiTuScalar ?? 0) > 50_000_000;
  const offtakeShortfallOver20Pct  = (offtakeShortPct ?? 0) > 20;
  const contractYearEndStrictFlag  = !!yendStrict;

  overrides.top_residual_over_r100m       = topResidualOverR100m ? 1 : 0;
  overrides.cpi_true_up_over_r50m         = cpiTrueUpOverR50m ? 1 : 0;
  overrides.offtake_shortfall_over_20_pct = offtakeShortfallOver20Pct ? 1 : 0;

  const tier = effectiveTier(variancePct, topResidualScalar, {
    topResidualOverR100m,
    cpiTrueUpOverR50m,
    offtakeShortfallOver20Pct,
    contractYearEndStrict: contractYearEndStrictFlag,
  });
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const yearHadDelivery = !!row.year_had_delivery || ((row.delivered_mwh ?? 0) > 0) || ((overrides.delivered_mwh as number | undefined) ?? 0) > 0;
  if (yearHadDelivery) overrides.year_had_delivery = 1;

  const crosses = crossesIntoRegulator(action, tier, { yearHadDelivery });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  // Counters
  if (action === 'raise_dispute') overrides.dispute_count = (row.dispute_count || 0) + 1;
  if (action === 'restate_year')  overrides.restate_count = (row.restate_count || 0) + 1;

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
    `UPDATE oe_ppa_annual_recon SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `par_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ppa_annual_recon_events (id, recon_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      entity_type: 'ppa_annual_recon',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ppa_annual_recon WHERE id = ?').bind(id).first<ParRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/collect-data', async (c) => transition(c, 'collect_data', (_row, body) => {
  const b = body as Partial<CollectDataBody>;
  const out: Partial<ParRow> = {};
  if (typeof b.contracted_mwh === 'number')                  out.contracted_mwh = b.contracted_mwh;
  if (typeof b.delivered_mwh === 'number')                   out.delivered_mwh = b.delivered_mwh;
  if (typeof b.metered_mwh === 'number')                     out.metered_mwh = b.metered_mwh;
  if (typeof b.curtailed_mwh === 'number')                   out.curtailed_mwh = b.curtailed_mwh;
  if (typeof b.min_offtake_mwh === 'number')                 out.min_offtake_mwh = b.min_offtake_mwh;
  if (typeof b.installed_capacity_mw === 'number')           out.installed_capacity_mw = b.installed_capacity_mw;
  if (typeof b.availability_factor_decimal === 'number')     out.availability_factor_decimal = b.availability_factor_decimal;
  if (typeof b.base_tariff_zar_per_mwh === 'number')         out.base_tariff_zar_per_mwh = b.base_tariff_zar_per_mwh;
  if (typeof b.indexed_tariff_zar_per_mwh === 'number')      out.indexed_tariff_zar_per_mwh = b.indexed_tariff_zar_per_mwh;
  if (typeof b.deviation_tariff_zar_per_mwh === 'number')    out.deviation_tariff_zar_per_mwh = b.deviation_tariff_zar_per_mwh;
  if (typeof b.deemed_tariff_zar_per_mwh === 'number')       out.deemed_tariff_zar_per_mwh = b.deemed_tariff_zar_per_mwh;
  if (typeof b.capacity_tariff_zar_per_mw_year === 'number') out.capacity_tariff_zar_per_mw_year = b.capacity_tariff_zar_per_mw_year;
  return applyCommon(b, out);
}));

app.post('/:id/classify-variance', async (c) => transition(c, 'classify_variance', (_row, body) => {
  const b = body as Partial<ClassifyVarianceBody>;
  const out: Partial<ParRow> = {};
  if (typeof b.variance_mwh === 'number')          out.variance_mwh = b.variance_mwh;
  if (typeof b.variance_pct === 'number')          out.variance_pct = b.variance_pct;
  if (typeof b.offtake_shortfall_pct === 'number') out.offtake_shortfall_pct = b.offtake_shortfall_pct;
  return applyCommon(b, out);
}));

app.post('/:id/compute-top-residual', async (c) => transition(c, 'compute_top_residual', (_row, body) => {
  const b = body as Partial<ComputeTopResidualBody>;
  const out: Partial<ParRow> = {};
  if (typeof b.top_residual_zar === 'number')           out.top_residual_zar = b.top_residual_zar;
  if (typeof b.prior_year_overpayment_zar === 'number') out.prior_year_overpayment_zar = b.prior_year_overpayment_zar;
  return applyCommon(b, out);
}));

app.post('/:id/apply-cpi-capacity', async (c) => transition(c, 'apply_cpi_capacity', (_row, body) => {
  const b = body as Partial<ApplyCpiCapacityBody>;
  const out: Partial<ParRow> = {};
  if (typeof b.cpi_true_up_zar === 'number')          out.cpi_true_up_zar = b.cpi_true_up_zar;
  if (typeof b.capacity_payment_zar === 'number')     out.capacity_payment_zar = b.capacity_payment_zar;
  if (typeof b.deemed_energy_credit_zar === 'number') out.deemed_energy_credit_zar = b.deemed_energy_credit_zar;
  if (typeof b.energy_revenue_zar === 'number')       out.energy_revenue_zar = b.energy_revenue_zar;
  return applyCommon(b, out);
}));

app.post('/:id/reconcile', async (c) => transition(c, 'reconcile', (_row, body) => {
  const b = body as Partial<ReconcileBody>;
  const out: Partial<ParRow> = {};
  if (typeof b.net_cash_position_zar === 'number') out.net_cash_position_zar = b.net_cash_position_zar;
  return applyCommon(b, out);
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (_row, body) => {
  const b = body as Partial<RaiseDisputeBody>;
  const out: Partial<ParRow> = {};
  if (typeof b.disputed_reason === 'string') out.disputed_reason = b.disputed_reason;
  return applyCommon(b, out);
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) =>
  applyCommon(body as Partial<ResolveDisputeBody>, {}),
));

app.post('/:id/sign-off', async (c) => transition(c, 'sign_off', (_row, body) => {
  const b = body as Partial<SignOffBody>;
  const out: Partial<ParRow> = {};
  if (typeof b.auditor_party === 'string')      out.auditor_party = b.auditor_party;
  if (typeof b.counterparty_party === 'string') out.counterparty_party = b.counterparty_party;
  return applyCommon(b, out);
}));

app.post('/:id/invoice', async (c) => transition(c, 'invoice', (_row, body) => {
  const b = body as Partial<InvoiceBody>;
  const out: Partial<ParRow> = {};
  if (typeof b.invoice_ref === 'string') out.invoice_ref = b.invoice_ref;
  return applyCommon(b, out);
}));

app.post('/:id/settle', async (c) => transition(c, 'settle', (_row, body) => {
  const b = body as Partial<SettleBody>;
  const out: Partial<ParRow> = {};
  if (typeof b.payment_ref === 'string') out.payment_ref = b.payment_ref;
  return applyCommon(b, out);
}));

app.post('/:id/restate-year', async (c) => transition(c, 'restate_year', (_row, body) => {
  const b = body as Partial<RestateYearBody>;
  const out: Partial<ParRow> = {};
  if (typeof b.restated_reason === 'string') out.restated_reason = b.restated_reason;
  return applyCommon(b, out);
}));

app.post('/:id/cancel-year', async (c) => transition(c, 'cancel_year', (_row, body) => {
  const b = body as Partial<CancelYearBody>;
  const out: Partial<ParRow> = {};
  if (typeof b.cancelled_reason === 'string') out.cancelled_reason = b.cancelled_reason;
  return applyCommon(b, out);
}));

export async function ppaAnnualReconSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ppa_annual_recon
     WHERE chain_status NOT IN ('settled','restated','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ParRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ppa_annual_recon
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `par_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ppa_annual_recon_events (id, recon_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'ppa_annual_recon.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'regulator_observer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'ppa_annual_recon.sla_breached',
        actor_id: 'system',
        entity_type: 'ppa_annual_recon',
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
