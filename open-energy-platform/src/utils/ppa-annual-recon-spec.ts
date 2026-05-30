// ─────────────────────────────────────────────────────────────────────────
// Wave 101 — Offtaker PPA Annual Reconciliation & True-Up (P6)
//
// The annual financial-close gate of a PPA. Pulls together a closed contract
// year by aggregating:
//   - 12 months of W87 PPA nominations + deviations + settlements
//   - W32 annual take-or-pay residual
//   - W39 CPI tariff indexation true-up
//   - W46 deemed-energy curtailment credits
//   - W54 payment-security release/redraw
//   - capacity payment annual roll
// into ONE closed-year ledger with auditor + counterparty sign-off, a
// restate-after-settlement door, and a regulator hard line on year re-opens.
//
// Distinct from the rest of the Offtaker book (11th Offtaker chain):
//   - [[project_wave22_ppa_contract_chain]]            contract execution (front-end)
//   - [[project_wave32_take_or_pay_chain]]             ANNUAL minimum offtake (W101 reads it)
//   - [[project_wave39_tariff_indexation_chain]]       annual CPI escalation (W101 reads it)
//   - [[project_wave46_curtailment_claim_chain]]       availability-side curtailment claim
//   - [[project_wave54_payment_security_chain]]        credit support backstop
//   - [[project_wave62_ppa_termination_chain]]         exit / early-termination
//   - [[project_wave78_ppa_change_in_law_chain]]       legal change-in-law relief
//   - [[project_wave87_ppa_nomination_chain]]          monthly nominations + deviations (W101 reads it)
//
// W87 is the monthly/daily heartbeat — W101 closes the YEAR. Bankers and CFOs
// need a single signed-off year-end ledger that is reviewable, auditable, and
// re-statable if a downstream variance is found. W101 is that ledger.
//
// Forward path (clean year):
//   year_opened → collect_data → data_collected → classify_variance →
//   variance_classified → compute_top_residual → top_residual_computed →
//   apply_cpi_capacity → cpi_capacity_applied → reconcile → reconciled →
//   sign_off → signed_off → invoice → invoiced → settle → settled (terminal)
//
// Dispute branch:
//   reconciled → raise_dispute → disputed → resolve_dispute → reconciled
//
// Restate branch (post-settlement re-open):
//   settled → restate_year → restated (terminal exception — opens a follow-up
//                                       year row keyed off this one)
//
// Cancel branch (pre-data abandonment):
//   year_opened | data_collected → cancel_year → cancelled (terminal)
//
// Tiers (4) RE-DERIVED on every transition from the LARGER of |variance pct|
// vs top_residual_zar bands:
//   minor    : |var| < 5%   AND top_residual < R10m
//   standard : |var| < 10%  AND top_residual < R50m
//   material : |var| < 20%  AND top_residual < R200m
//   major    : |var| >= 20% OR  top_residual >= R200m
//
// FLOOR-AT-MATERIAL on any of these flags (the four W101 "material-or-worse"
// triggers) — even a small numerical variance gets dragged up if one of these
// fires:
//   top_residual_zar          > R100m      (significant take-or-pay residual)
//   cpi_true_up_zar           > R50m       (significant CPI true-up)
//   offtake_shortfall_pct     > 20         (material shortfall)
//   contract_year_end_strict  = 1          (binding milestone year, e.g. y5/y10)
//
// SLA polarity INVERTED — the LARGER the variance, the MORE time the parties
// need to forensically reconcile, audit, and reach signoff. Mirrors the W32 /
// W39 / W78 inverted-SLA pattern. Terminals (settled, restated, cancelled)
// carry no deadline.
//
// FINANCIAL-CLOSE SIGNATURE (the W101 hard line) — IFRS 15 + NERSA s34
// disclosure obligations on annual energy revenue reconciliation; post-signoff
// restatements always cross the regulator (similar to a published financial-
// statement restatement):
//   restate_year   → regulator EVERY tier (W101 hard line — IFRS 15 + NERSA s34
//                                          sister of W77 declare_breach, W45
//                                          write_off, W93 impose_penalty)
//   raise_dispute  → regulator EVERY tier (PPA disputes go to NERSA s30, same as
//                                          W87 raise_dispute and W66 lodge_appeal)
//   sign_off       → material + major     (large signoff is disclosable)
//   sla_breached   → material + major
//   cancel_year    → regulator EVERY tier (annual-close cancellation always
//                                          reportable when delivery occurred)
//
// Write roles: {admin, offtaker}. Seller (IPP) contributes through counterparty
// confirm on signoff (party=counterparty), but the route gates every action to
// the offtaker write set. actor_party tags the audit-role attribution:
// settlement_analyst (daily ops) / counterparty (seller-side confirm) /
// finance_controller (CFO signoff) / auditor (external review) /
// regulator_observer (NERSA-side observation when crossed).
// ─────────────────────────────────────────────────────────────────────────

export type ParStatus =
  | 'year_opened'
  | 'data_collected'
  | 'variance_classified'
  | 'top_residual_computed'
  | 'cpi_capacity_applied'
  | 'reconciled'
  | 'disputed'
  | 'signed_off'
  | 'invoiced'
  | 'settled'
  | 'restated'
  | 'cancelled';

export type ParAction =
  | 'collect_data'
  | 'classify_variance'
  | 'compute_top_residual'
  | 'apply_cpi_capacity'
  | 'reconcile'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'sign_off'
  | 'invoice'
  | 'settle'
  | 'restate_year'
  | 'cancel_year';

export type ParTier = 'minor' | 'standard' | 'material' | 'major';

export type ParParty =
  | 'settlement_analyst'
  | 'counterparty'
  | 'finance_controller'
  | 'auditor'
  | 'regulator_observer';

export type ParEvent =
  | 'ppa_annual_recon.data_collected'
  | 'ppa_annual_recon.variance_classified'
  | 'ppa_annual_recon.top_residual_computed'
  | 'ppa_annual_recon.cpi_capacity_applied'
  | 'ppa_annual_recon.reconciled'
  | 'ppa_annual_recon.disputed'
  | 'ppa_annual_recon.dispute_resolved'
  | 'ppa_annual_recon.signed_off'
  | 'ppa_annual_recon.invoiced'
  | 'ppa_annual_recon.settled'
  | 'ppa_annual_recon.restated'
  | 'ppa_annual_recon.cancelled'
  | 'ppa_annual_recon.sla_breached';

// HARD terminals — `settled` is a "rest state" not a hard terminal because the
// restate_year escape door re-opens it. Only `restated` and `cancelled` reject
// every further action.
const TERMINALS = new Set<ParStatus>(['restated', 'cancelled']);

export function isTerminal(s: ParStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<ParAction, { from: ParStatus[]; to: ParStatus }> = {
  collect_data:         { from: ['year_opened'],                                   to: 'data_collected' },
  classify_variance:    { from: ['data_collected'],                                to: 'variance_classified' },
  compute_top_residual: { from: ['variance_classified'],                           to: 'top_residual_computed' },
  apply_cpi_capacity:   { from: ['top_residual_computed'],                         to: 'cpi_capacity_applied' },
  reconcile:            { from: ['cpi_capacity_applied', 'disputed'],              to: 'reconciled' },
  raise_dispute:        { from: ['reconciled'],                                    to: 'disputed' },
  resolve_dispute:      { from: ['disputed'],                                      to: 'reconciled' },
  sign_off:             { from: ['reconciled'],                                    to: 'signed_off' },
  invoice:              { from: ['signed_off'],                                    to: 'invoiced' },
  settle:               { from: ['invoiced'],                                      to: 'settled' },
  restate_year:         { from: ['settled'],                                       to: 'restated' },
  cancel_year:          { from: ['year_opened', 'data_collected'],                 to: 'cancelled' },
};

export function nextStatus(current: ParStatus, action: ParAction): ParStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: ParStatus): ParAction[] {
  const acts: ParAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [ParAction, typeof TRANSITIONS[ParAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED SLA — the LARGER the variance + residual, the LONGER each phase.
// Annual close requires deeper forensic reconciliation, audit walkthroughs,
// and counterparty/auditor signoff. Mirrors W32 / W39 / W78 INVERTED pattern.
// Terminals carry no deadline.
export const SLA_MINUTES: Record<ParStatus, Record<ParTier, number>> = {
  year_opened:           { minor: 30 * DAY,  standard: 45 * DAY,  material: 60 * DAY,  major: 90 * DAY },
  data_collected:        { minor: 14 * DAY,  standard: 21 * DAY,  material: 30 * DAY,  major: 45 * DAY },
  variance_classified:   { minor: 7 * DAY,   standard: 14 * DAY,  material: 21 * DAY,  major: 30 * DAY },
  top_residual_computed: { minor: 7 * DAY,   standard: 14 * DAY,  material: 21 * DAY,  major: 30 * DAY },
  cpi_capacity_applied:  { minor: 7 * DAY,   standard: 14 * DAY,  material: 21 * DAY,  major: 30 * DAY },
  reconciled:            { minor: 14 * DAY,  standard: 21 * DAY,  material: 30 * DAY,  major: 45 * DAY },
  disputed:              { minor: 30 * DAY,  standard: 45 * DAY,  material: 60 * DAY,  major: 90 * DAY },
  signed_off:            { minor: 7 * DAY,   standard: 10 * DAY,  material: 14 * DAY,  major: 21 * DAY },
  invoiced:              { minor: 30 * DAY,  standard: 45 * DAY,  material: 60 * DAY,  major: 90 * DAY },
  settled:               { minor: 0,         standard: 0,         material: 0,         major: 0 },
  restated:              { minor: 0,         standard: 0,         material: 0,         major: 0 },
  cancelled:             { minor: 0,         standard: 0,         material: 0,         major: 0 },
};

export function slaWindowMinutes(status: ParStatus, tier: ParTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: ParStatus, tier: ParTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Tier RE-DERIVED on every transition. KEY DESIGN: tier dragged up to the
// HIGHER of variance-pct band and top-residual-ZAR band. A 3% variance year
// with R250m residual is still major; a 30% variance year with R1m residual is
// still major. Plus FLOOR-AT-MATERIAL on coverage flags below.
export function tierForVarianceAndResidual(
  variancePct: number | null | undefined,
  topResidualZar: number | null | undefined,
): ParTier {
  const v = Math.abs(Number(variancePct ?? 0));
  const r = Math.abs(Number(topResidualZar ?? 0));
  const fromVar: ParTier =
    v >= 20 ? 'major' :
    v >= 10 ? 'material' :
    v >= 5  ? 'standard' :
              'minor';
  const fromRes: ParTier =
    r >= 200_000_000 ? 'major' :
    r >= 50_000_000  ? 'material' :
    r >= 10_000_000  ? 'standard' :
                       'minor';
  const rank: Record<ParTier, number> = { minor: 0, standard: 1, material: 2, major: 3 };
  return rank[fromVar] >= rank[fromRes] ? fromVar : fromRes;
}

// FLOOR-AT-MATERIAL — any of these four flags drags the tier up to AT LEAST
// material. A small numerical variance is still material if the residual is
// significant, the CPI true-up is significant, the shortfall is over 20%, or
// the year is a binding milestone year.
export function floorAtMaterial(
  baseTier: ParTier,
  flags: {
    topResidualOverR100m?: boolean | number | null;
    cpiTrueUpOverR50m?: boolean | number | null;
    offtakeShortfallOver20Pct?: boolean | number | null;
    contractYearEndStrict?: boolean | number | null;
  },
): ParTier {
  const trip =
    !!flags.topResidualOverR100m ||
    !!flags.cpiTrueUpOverR50m ||
    !!flags.offtakeShortfallOver20Pct ||
    !!flags.contractYearEndStrict;
  if (!trip) return baseTier;
  const rank: Record<ParTier, number> = { minor: 0, standard: 1, material: 2, major: 3 };
  return rank[baseTier] >= rank.material ? baseTier : 'material';
}

export function effectiveTier(
  variancePct: number | null | undefined,
  topResidualZar: number | null | undefined,
  flags: {
    topResidualOverR100m?: boolean | number | null;
    cpiTrueUpOverR50m?: boolean | number | null;
    offtakeShortfallOver20Pct?: boolean | number | null;
    contractYearEndStrict?: boolean | number | null;
  },
): ParTier {
  return floorAtMaterial(tierForVarianceAndResidual(variancePct, topResidualZar), flags);
}

// The HEAVY tiers — where reportability and regulator crossings attach.
const HEAVY_TIERS = new Set<ParTier>(['material', 'major']);

export function isHeavyTier(tier: ParTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// FINANCIAL-CLOSE signature — the W101 hard line.
//   restate_year   → regulator EVERY tier (IFRS 15 + NERSA s34 hard line)
//   raise_dispute  → regulator EVERY tier (PPA disputes go to NERSA s30)
//   sign_off       → material + major (large signoff disclosable)
//   cancel_year    → regulator EVERY tier when year had any delivery
export function crossesIntoRegulator(
  action: ParAction,
  tier: ParTier,
  ctx: { yearHadDelivery?: boolean | number | null } = {},
): boolean {
  if (action === 'restate_year') return true;
  if (action === 'raise_dispute') return true;
  if (action === 'sign_off') return HEAVY_TIERS.has(tier);
  if (action === 'cancel_year') return !!ctx.yearHadDelivery;
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: ParTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// Whether a year is reportable irrespective of action — true for material and
// major (consistent with the rest of the offtaker book).
export function isReportable(tier: ParTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// Party each action represents. settlement_analyst drives the data collection,
// classification, and computation steps. finance_controller signs off and
// approves invoice. counterparty (seller) is referenced on disputes and
// settlement. auditor is referenced on signoff confirmation. The route gates
// every action to the offtaker write set; this is audit-attribution only.
const ACTION_PARTY: Record<ParAction, ParParty> = {
  collect_data:         'settlement_analyst',
  classify_variance:    'settlement_analyst',
  compute_top_residual: 'settlement_analyst',
  apply_cpi_capacity:   'settlement_analyst',
  reconcile:            'settlement_analyst',
  raise_dispute:        'counterparty',
  resolve_dispute:      'settlement_analyst',
  sign_off:             'finance_controller',
  invoice:              'finance_controller',
  settle:               'finance_controller',
  restate_year:         'auditor',
  cancel_year:          'finance_controller',
};

export function partyForAction(action: ParAction): ParParty {
  return ACTION_PARTY[action];
}

// ─── LIVE financial-close battery — beats EnPowered PPA Settlement / DNV
//     Synergi PPA / Schneider PPA Manager / Open Energi Reconciliation / KPMG
//     PPA Recon / Power Advocate Annual / Aurora Energy Research PPA Annual /
//     Wood Mackenzie PPA Annual by surfacing every annual-close metric LIVE on
//     the row, not in a static year-end Excel binder. Each helper takes
//     scalars + (where relevant) a `now` clock and returns a number; the
//     route's decorate() composes them onto every fetch.

// Reconciliation completeness index — 0-130, baseline 100.
// Bonuses:
//   +10 data_collected AND variance_classified done
//   +5  top_residual_computed done
//   +5  cpi_capacity_applied done
//   +5  reconciled
//   +5  signed_off
// Penalties:
//   -10 if disputed (currently in dispute)
//   -5  per restated year referenced (max -15)
//   -5  if ball-not-in-court for > 14 days
export function reconciliationCompletenessIndex(args: {
  status: ParStatus;
  disputeCount?: number | null;
  restateCount?: number | null;
  daysInCourt?: number | null;
}): number {
  const { status, disputeCount, restateCount, daysInCourt } = args;
  let idx = 100;
  const progressed = new Set<ParStatus>([
    'data_collected', 'variance_classified', 'top_residual_computed',
    'cpi_capacity_applied', 'reconciled', 'disputed', 'signed_off',
    'invoiced', 'settled',
  ]);
  if (progressed.has(status) && status !== 'year_opened') idx += 10;
  const computeDone = new Set<ParStatus>([
    'top_residual_computed', 'cpi_capacity_applied', 'reconciled',
    'disputed', 'signed_off', 'invoiced', 'settled',
  ]);
  if (computeDone.has(status)) idx += 5;
  const cpiDone = new Set<ParStatus>([
    'cpi_capacity_applied', 'reconciled', 'disputed', 'signed_off',
    'invoiced', 'settled',
  ]);
  if (cpiDone.has(status)) idx += 5;
  if (status === 'reconciled' || status === 'signed_off' || status === 'invoiced' || status === 'settled') idx += 5;
  if (status === 'signed_off' || status === 'invoiced' || status === 'settled') idx += 5;
  if (status === 'disputed' || (disputeCount ?? 0) > 0) idx -= 10;
  const rc = Math.min(restateCount ?? 0, 3) * 5;
  idx -= rc;
  if ((daysInCourt ?? 0) > 14) idx -= 5;
  return Math.max(0, Math.min(130, idx));
}

// Take-or-pay residual ZAR — the W32 input rolled into year close.
// Computes: max(0, minOfftakeMwh - deliveredMwh) * deviationTariff.
export function topResidualZar(
  minOfftakeMwh: number | null | undefined,
  deliveredMwh: number | null | undefined,
  deviationTariffZarPerMwh: number | null | undefined,
): number {
  const m = Number(minOfftakeMwh ?? 0);
  const d = Number(deliveredMwh ?? 0);
  const t = Number(deviationTariffZarPerMwh ?? 0);
  const shortfall = m - d;
  if (shortfall <= 0 || t <= 0) return 0;
  return Math.round(shortfall * t);
}

// CPI true-up ZAR — the W39 input rolled into year close. Difference between
// what would have been invoiced at the indexed tariff vs what was actually
// invoiced at the base tariff over the year.
export function cpiTrueUpZar(
  deliveredMwh: number | null | undefined,
  baseTariffZarPerMwh: number | null | undefined,
  indexedTariffZarPerMwh: number | null | undefined,
): number {
  const d = Number(deliveredMwh ?? 0);
  const b = Number(baseTariffZarPerMwh ?? 0);
  const i = Number(indexedTariffZarPerMwh ?? 0);
  if (d <= 0) return 0;
  return Math.round(d * (i - b));
}

// Capacity payment annual ZAR — installed capacity (MW) × capacity tariff
// (ZAR/MW/yr) × availability factor (decimal). Mirrors typical PPA capacity
// payment structure.
export function capacityPaymentYearZar(
  installedCapacityMw: number | null | undefined,
  capacityTariffZarPerMwYear: number | null | undefined,
  availabilityFactorDecimal: number | null | undefined,
): number {
  const c = Number(installedCapacityMw ?? 0);
  const t = Number(capacityTariffZarPerMwYear ?? 0);
  const a = Number(availabilityFactorDecimal ?? 1);
  return Math.round(c * t * a);
}

// Deemed-energy credit ZAR — the W46 input rolled into year close. Sum of
// curtailment-compensation MWh × deemed tariff. Credits the seller for energy
// they would have generated but were curtailed off the grid.
export function deemedEnergyCreditZar(
  curtailedMwh: number | null | undefined,
  deemedTariffZarPerMwh: number | null | undefined,
): number {
  const c = Number(curtailedMwh ?? 0);
  const t = Number(deemedTariffZarPerMwh ?? 0);
  if (c <= 0 || t <= 0) return 0;
  return Math.round(c * t);
}

// Net cash position ZAR — net cash flow from offtaker to seller for the year.
// Sums energy revenue + capacity payment + deemed energy + CPI true-up + take-
// or-pay residual. Positive = offtaker owes seller; negative = seller owes
// offtaker (rare, but happens with overpayment from prior invoices).
export function netCashPositionZar(args: {
  energyRevenueZar?: number | null;
  capacityPaymentZar?: number | null;
  deemedEnergyCreditZar?: number | null;
  cpiTrueUpZar?: number | null;
  topResidualZar?: number | null;
  priorYearOverpaymentZar?: number | null;
}): number {
  const sum =
    Number(args.energyRevenueZar ?? 0) +
    Number(args.capacityPaymentZar ?? 0) +
    Number(args.deemedEnergyCreditZar ?? 0) +
    Number(args.cpiTrueUpZar ?? 0) +
    Number(args.topResidualZar ?? 0) -
    Number(args.priorYearOverpaymentZar ?? 0);
  return Math.round(sum);
}

// Contracted vs delivered as percentage. Returns delivered_mwh ÷ contracted_mwh × 100.
export function mwhContractedPctDelivered(
  contractedMwh: number | null | undefined,
  deliveredMwh: number | null | undefined,
): number {
  const c = Number(contractedMwh ?? 0);
  if (c === 0) return 0;
  const d = Number(deliveredMwh ?? 0);
  return Math.round((d / c) * 1000) / 10;
}

// Days remaining in the current SLA window.
export function slaDaysRemaining(
  status: ParStatus,
  tier: ParTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs <= 0) return 0;
  return Math.round(remainingMs / (1000 * 60 * 60 * 24) * 10) / 10;
}

// Days from year-open until predicted signoff. Sums the SLA windows for every
// state between the current state and signed_off.
export function daysToSignoff(status: ParStatus, tier: ParTier): number {
  if (TERMINALS.has(status)) return 0;
  if (status === 'signed_off' || status === 'invoiced') return 0;
  const order: ParStatus[] = [
    'year_opened', 'data_collected', 'variance_classified',
    'top_residual_computed', 'cpi_capacity_applied', 'reconciled',
  ];
  const idx = order.indexOf(status);
  if (idx < 0) {
    if (status === 'disputed') return Math.round((SLA_MINUTES.disputed[tier] / (60 * 24)) * 10) / 10;
    return 0;
  }
  let totalMin = 0;
  for (let i = idx; i < order.length; i++) {
    totalMin += SLA_MINUTES[order[i]][tier];
  }
  return Math.round((totalMin / (60 * 24)) * 10) / 10;
}

// Urgency band — mirrors W87 / W86 critical / high / medium / low.
//   critical : major tier OR |variance| >= 20% OR days_remaining < 3
//   high     : material tier OR |variance| >= 10% OR days_remaining < 7
//   medium   : standard tier OR |variance| >= 5%  OR days_remaining < 14
//   low      : everything else
export type ParUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(
  tier: ParTier,
  variancePct: number | null | undefined,
  daysRemaining: number,
): ParUrgency {
  const v = Math.abs(Number(variancePct ?? 0));
  if (tier === 'major' || v >= 20 || (daysRemaining > 0 && daysRemaining < 3)) return 'critical';
  if (tier === 'material' || v >= 10 || (daysRemaining > 0 && daysRemaining < 7)) return 'high';
  if (tier === 'standard' || v >= 5 || (daysRemaining > 0 && daysRemaining < 14)) return 'medium';
  return 'low';
}

// Predicted year-close date — current date + days_to_signoff + invoiced SLA +
// 14-day cash settlement window.
export function predictedYearCloseDate(
  status: ParStatus,
  tier: ParTier,
  now: Date,
): Date | null {
  if (TERMINALS.has(status) || status === 'settled') return null;
  const signoff = daysToSignoff(status, tier);
  const invoicedDays = SLA_MINUTES.invoiced[tier] / (60 * 24);
  const settleBuffer = 14;
  const totalDays = signoff + invoicedDays + settleBuffer;
  const dt = new Date(now.getTime());
  dt.setUTCDate(dt.getUTCDate() + Math.ceil(totalDays));
  return dt;
}

// Authority required ladder — by tier:
//   minor    → settlement_analyst
//   standard → finance_controller
//   material → finance_director
//   major    → CFO
export type ParAuthority = 'settlement_analyst' | 'finance_controller' | 'finance_director' | 'cfo';

export function authorityRequired(tier: ParTier): ParAuthority {
  if (tier === 'major') return 'cfo';
  if (tier === 'material') return 'finance_director';
  if (tier === 'standard') return 'finance_controller';
  return 'settlement_analyst';
}

export function eventTypeFor(action: ParAction): ParEvent | null {
  const next = TRANSITIONS[action]?.to;
  if (!next) return null;
  if (action === 'resolve_dispute') return 'ppa_annual_recon.dispute_resolved';
  const map: Record<ParStatus, ParEvent | null> = {
    year_opened: null,
    data_collected: 'ppa_annual_recon.data_collected',
    variance_classified: 'ppa_annual_recon.variance_classified',
    top_residual_computed: 'ppa_annual_recon.top_residual_computed',
    cpi_capacity_applied: 'ppa_annual_recon.cpi_capacity_applied',
    reconciled: 'ppa_annual_recon.reconciled',
    disputed: 'ppa_annual_recon.disputed',
    signed_off: 'ppa_annual_recon.signed_off',
    invoiced: 'ppa_annual_recon.invoiced',
    settled: 'ppa_annual_recon.settled',
    restated: 'ppa_annual_recon.restated',
    cancelled: 'ppa_annual_recon.cancelled',
  };
  return map[next];
}
