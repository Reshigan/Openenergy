// ─────────────────────────────────────────────────────────────────────────
// Wave 105 — Grid Wholesale Imbalance Settlement & MTU Pricing Chain (P6)
//
// 10th Grid chain — the FINANCIAL settlement engine of the balancing
// mechanism. Sister of W13 dispatch nominations (the PRE side — nominated
// MWh per MTU) and W50 reserve activation (the SUPPLY side — instantaneous
// reserve products that re-balance the system). W105 is the post-fact
// per-MTU (market time unit / settlement period) settlement: actual vs
// nominated imbalance × imbalance price × penalty, posted to BRPs,
// dispute-window, settled.
//
// Beats PJM iMM Imbalance Settlement / ERCOT QSE Real-Time Settlement /
// CAISO Imbalance Settlement / NEM AEMO Settlement Statements / Nord Pool
// Imbalance Settlement / ENTSO-E Imbalance Settlement / National Grid ESO
// BSC Settlement / Hitachi Energy Lumada Market Operations / Open Access
// Technology / Powel Pulse — every one of these surfaces imbalance
// settlement as an after-the-fact CSV dump + dispute mailbox. W105 makes
// it a 12-state P6 chain with LIVE per-MTU re-pricing, dispute-window
// state machine, completeness index, urgency band, authority ladder, and
// signature regulator crossings.
//
// Standards: NERSA Grid Code §11 (Settlement) + ERA §35 + NTCSA
// Settlement Procedures + Eskom Distribution Tariffs Schedule.
//
// Forward path (clean settle):
//   period_open → meter_data_received → nominations_reconciled
//   → imbalance_computed → priced → invoice_issued → invoice_acknowledged
//   → dispute_window_open → payment_pending → settled (terminal)
//   → archived (terminal)
//
// Branches:
//   dispute_window_open → disputed → resolved_dispute → invoice_revised
//     → payment_pending (re-enters)
//   invoice_issued / payment_pending → aged_arrears (cron-driven, 30/60/90d)
//   any non-terminal → cancelled (terminal)
//
// 4 tiers RE-DERIVED on every transition from imbalance_quantum_zar +
// 5 floor flags. FLOOR-AT-MATERIAL on any of:
//   - imbalance_floor_flag_high_voltage_brp           (also FLOOR-AT-SYSTEMIC)
//   - imbalance_floor_flag_system_critical_period     (also FLOOR-AT-SYSTEMIC)
//   - imbalance_floor_flag_regulator_audit_period
//   - imbalance_floor_flag_market_suspension_active
//   - imbalance_floor_flag_repeated_breach_5plus
//
// SLA polarity URGENT — larger imbalance = TIGHTER windows. On period_open:
// systemic 12h / material 48h / standard 7d / minor 14d.
//
// SIGNATURE regulator crossings (NERSA Grid Code §11 + ERA §35 +
// NTCSA Settlement Procedures):
//   raise_dispute      → regulator EVERY tier when high_voltage_brp=TRUE
//                         (HV-imbalance disputes always reportable — W105 signature)
//   mark_settled       → regulator on material + systemic when penalty_zar > 0
//   aged_arrears       → regulator EVERY tier when arrears_days >= 60
//                         (default risk to settlement system)
//   cancel_period      → regulator EVERY tier when imbalance_mwh != 0
//                         (cancellation with non-zero position is reportable)
//   sla_breached       → regulator on material + systemic
//
// Write {admin, grid_operator}. READ all 9 personas. actor_party derived
// from action: SO writes (compute, price, issue, settled, archive); BRP
// writes (acknowledge, raise_dispute, record_payment).
// ─────────────────────────────────────────────────────────────────────────

export type ImbStatus =
  | 'period_open'
  | 'meter_data_received'
  | 'nominations_reconciled'
  | 'imbalance_computed'
  | 'priced'
  | 'invoice_issued'
  | 'invoice_acknowledged'
  | 'dispute_window_open'
  | 'payment_pending'
  | 'settled'
  | 'archived'
  | 'cancelled'
  | 'disputed'
  | 'resolved_dispute'
  | 'invoice_revised'
  | 'aged_arrears';

export type ImbAction =
  | 'receive_meter_data'
  | 'reconcile_nominations'
  | 'compute_imbalance'
  | 'price_imbalance'
  | 'issue_invoice'
  | 'acknowledge_invoice'
  | 'open_dispute_window'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'revise_invoice'
  | 'record_payment'
  | 'mark_settled'
  | 'archive_period'
  | 'cancel_period';

export type ImbTier = 'minor' | 'standard' | 'material' | 'systemic';

export type ImbParty =
  | 'system_operator'
  | 'brp'
  | 'settlement_admin'
  | 'reviewer'
  | 'archiver';

export type ImbEvent =
  | 'imbalance_settlement.period_opened'
  | 'imbalance_settlement.meter_data_received'
  | 'imbalance_settlement.nominations_reconciled'
  | 'imbalance_settlement.imbalance_computed'
  | 'imbalance_settlement.priced'
  | 'imbalance_settlement.invoice_issued'
  | 'imbalance_settlement.invoice_acknowledged'
  | 'imbalance_settlement.dispute_window_opened'
  | 'imbalance_settlement.dispute_raised'
  | 'imbalance_settlement.dispute_resolved'
  | 'imbalance_settlement.invoice_revised'
  | 'imbalance_settlement.payment_recorded'
  | 'imbalance_settlement.settled'
  | 'imbalance_settlement.archived'
  | 'imbalance_settlement.cancelled'
  | 'imbalance_settlement.aged_arrears'
  | 'imbalance_settlement.sla_breached';

// Hard terminals reject every action. settled is a SOFT terminal — it
// reads as terminal-ish on filters but still accepts archive_period to
// reach the hard terminal archived. cancelled is hard. archived is hard.
const HARD_TERMINALS = new Set<ImbStatus>([
  'archived',
  'cancelled',
]);

// UI terminals — flags that the row has reached an outcome the operator
// no longer needs to action. settled is included here so filters like
// "active" exclude settled rows even though they still accept archive.
const UI_TERMINALS = new Set<ImbStatus>([
  'settled',
  'archived',
  'cancelled',
]);

export function isTerminal(s: ImbStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: ImbStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// Cancellable from every non-terminal state.
const CANCELLABLE_FROM: ImbStatus[] = [
  'period_open',
  'meter_data_received',
  'nominations_reconciled',
  'imbalance_computed',
  'priced',
  'invoice_issued',
  'invoice_acknowledged',
  'dispute_window_open',
  'payment_pending',
  'disputed',
  'resolved_dispute',
  'invoice_revised',
  'aged_arrears',
];

export const TRANSITIONS: Record<ImbAction, { from: ImbStatus[]; to: ImbStatus }> = {
  receive_meter_data:     { from: ['period_open'],                                  to: 'meter_data_received' },
  reconcile_nominations:  { from: ['meter_data_received'],                          to: 'nominations_reconciled' },
  compute_imbalance:      { from: ['nominations_reconciled'],                       to: 'imbalance_computed' },
  price_imbalance:        { from: ['imbalance_computed'],                           to: 'priced' },
  issue_invoice:          { from: ['priced', 'invoice_revised'],                    to: 'invoice_issued' },
  acknowledge_invoice:    { from: ['invoice_issued'],                               to: 'invoice_acknowledged' },
  open_dispute_window:    { from: ['invoice_acknowledged'],                         to: 'dispute_window_open' },
  raise_dispute:          { from: ['dispute_window_open'],                          to: 'disputed' },
  resolve_dispute:        { from: ['disputed'],                                     to: 'resolved_dispute' },
  revise_invoice:         { from: ['resolved_dispute'],                             to: 'invoice_revised' },
  record_payment:         { from: ['dispute_window_open', 'payment_pending', 'aged_arrears', 'invoice_issued', 'invoice_acknowledged', 'invoice_revised'], to: 'payment_pending' },
  mark_settled:           { from: ['payment_pending'],                              to: 'settled' },
  archive_period:         { from: ['settled'],                                      to: 'archived' },
  cancel_period:          { from: CANCELLABLE_FROM,                                 to: 'cancelled' },
};

export function nextStatus(current: ImbStatus, action: ImbAction): ImbStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: ImbStatus): ImbAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: ImbAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [ImbAction, typeof TRANSITIONS[ImbAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT SLA polarity. Systemic 12h on period_open → 14d for minor.
// Strictly decreasing minor → standard → material → systemic per state.
export const SLA_MINUTES: Record<ImbStatus, Record<ImbTier, number>> = {
  period_open:            { minor: 14 * DAY, standard: 7 * DAY,  material: 48 * HOUR, systemic: 12 * HOUR },
  meter_data_received:    { minor: 10 * DAY, standard: 5 * DAY,  material: 36 * HOUR, systemic: 10 * HOUR },
  nominations_reconciled: { minor: 10 * DAY, standard: 5 * DAY,  material: 36 * HOUR, systemic: 10 * HOUR },
  imbalance_computed:     { minor: 7 * DAY,  standard: 3 * DAY,  material: 24 * HOUR, systemic: 8 * HOUR },
  priced:                 { minor: 7 * DAY,  standard: 3 * DAY,  material: 24 * HOUR, systemic: 8 * HOUR },
  invoice_issued:         { minor: 21 * DAY, standard: 14 * DAY, material: 7 * DAY,   systemic: 3 * DAY },
  invoice_acknowledged:   { minor: 21 * DAY, standard: 14 * DAY, material: 7 * DAY,   systemic: 3 * DAY },
  dispute_window_open:    { minor: 14 * DAY, standard: 7 * DAY,  material: 3 * DAY,   systemic: 24 * HOUR },
  disputed:               { minor: 21 * DAY, standard: 14 * DAY, material: 7 * DAY,   systemic: 3 * DAY },
  resolved_dispute:       { minor: 7 * DAY,  standard: 3 * DAY,  material: 24 * HOUR, systemic: 8 * HOUR },
  invoice_revised:        { minor: 7 * DAY,  standard: 3 * DAY,  material: 24 * HOUR, systemic: 8 * HOUR },
  payment_pending:        { minor: 30 * DAY, standard: 21 * DAY, material: 14 * DAY,  systemic: 7 * DAY },
  aged_arrears:           { minor: 7 * DAY,  standard: 5 * DAY,  material: 3 * DAY,   systemic: 24 * HOUR },
  settled:                { minor: 0,        standard: 0,        material: 0,         systemic: 0 },
  archived:               { minor: 0,        standard: 0,        material: 0,         systemic: 0 },
  cancelled:              { minor: 0,        standard: 0,        material: 0,         systemic: 0 },
};

export function slaWindowMinutes(status: ImbStatus, tier: ImbTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: ImbStatus, tier: ImbTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Tier RE-DERIVED from imbalance_quantum_zar.
//   minor    : quantum < 100,000
//   standard : 100,000 - 1,000,000
//   material : 1,000,000 - 10,000,000
//   systemic : >= 10,000,000
export function tierForQuantum(quantumZar: number | null | undefined): ImbTier {
  const v = Number(quantumZar ?? 0);
  if (!isFinite(v) || v < 0) return 'minor';
  if (v >= 10000000) return 'systemic';
  if (v >= 1000000)  return 'material';
  if (v >= 100000)   return 'standard';
  return 'minor';
}

export interface ImbFloorFlags {
  imbalance_floor_flag_high_voltage_brp?: boolean | number | null;
  imbalance_floor_flag_system_critical_period?: boolean | number | null;
  imbalance_floor_flag_regulator_audit_period?: boolean | number | null;
  imbalance_floor_flag_market_suspension_active?: boolean | number | null;
  imbalance_floor_flag_repeated_breach_5plus?: boolean | number | null;
}

export function countFloorFlags(args: ImbFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.imbalance_floor_flag_high_voltage_brp) +
    t(args.imbalance_floor_flag_system_critical_period) +
    t(args.imbalance_floor_flag_regulator_audit_period) +
    t(args.imbalance_floor_flag_market_suspension_active) +
    t(args.imbalance_floor_flag_repeated_breach_5plus)
  );
}

// FLOOR-AT-MATERIAL on any one floor flag.
export function floorAtMaterial(args: ImbFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-SYSTEMIC on HV BRP or system_critical_period (each on its
// own forces systemic — they are systemic-level signals).
export function floorAtSystemic(args: ImbFloorFlags): boolean {
  return Boolean(
    args.imbalance_floor_flag_high_voltage_brp ||
    args.imbalance_floor_flag_system_critical_period,
  );
}

// Compose raw quantum-tier + floor flags into the effective tier.
export function effectiveTier(rawTier: ImbTier, flags: ImbFloorFlags): ImbTier {
  if (floorAtSystemic(flags)) return 'systemic';
  const count = countFloorFlags(flags);
  // 2+ floor flags → systemic.
  if (count >= 2) return 'systemic';
  // 1 floor flag → floor at material.
  if (count === 1) {
    if (rawTier === 'minor' || rawTier === 'standard') return 'material';
    return rawTier;
  }
  return rawTier;
}

// Heavy tiers — where reportability and signature crossings attach.
const HEAVY_TIERS = new Set<ImbTier>(['material', 'systemic']);

export function isHeavyTier(tier: ImbTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// SIGNATURE regulator crossings:
//   raise_dispute   → EVERY tier when high_voltage_brp=TRUE (HV signature)
//   mark_settled    → material + systemic when penalty_zar > 0
//   aged_arrears    → EVERY tier when arrears_days >= 60
//   cancel_period   → EVERY tier when imbalance_mwh != 0
export function crossesIntoRegulator(
  action: ImbAction | 'aged_arrears',
  tier: ImbTier,
  args: {
    imbalance_floor_flag_high_voltage_brp?: boolean | number | null;
    penalty_zar?: number | null;
    arrears_days?: number | null;
    imbalance_mwh?: number | null;
  },
): boolean {
  const hv = Boolean(args.imbalance_floor_flag_high_voltage_brp);
  if (action === 'raise_dispute') return hv;
  if (action === 'mark_settled') {
    return HEAVY_TIERS.has(tier) && Number(args.penalty_zar ?? 0) > 0;
  }
  if (action === 'aged_arrears') {
    return Number(args.arrears_days ?? 0) >= 60;
  }
  if (action === 'cancel_period') {
    return Math.abs(Number(args.imbalance_mwh ?? 0)) > 0;
  }
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: ImbTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: ImbTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// Party each action represents.
const ACTION_PARTY: Record<ImbAction, ImbParty> = {
  receive_meter_data:    'system_operator',
  reconcile_nominations: 'system_operator',
  compute_imbalance:     'system_operator',
  price_imbalance:       'system_operator',
  issue_invoice:         'settlement_admin',
  acknowledge_invoice:   'brp',
  open_dispute_window:   'settlement_admin',
  raise_dispute:         'brp',
  resolve_dispute:       'reviewer',
  revise_invoice:        'settlement_admin',
  record_payment:        'brp',
  mark_settled:          'settlement_admin',
  archive_period:        'archiver',
  cancel_period:         'system_operator',
};

export function partyForAction(action: ImbAction): ImbParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: ImbAction): ImbEvent | null {
  switch (action) {
    case 'receive_meter_data':    return 'imbalance_settlement.meter_data_received';
    case 'reconcile_nominations': return 'imbalance_settlement.nominations_reconciled';
    case 'compute_imbalance':     return 'imbalance_settlement.imbalance_computed';
    case 'price_imbalance':       return 'imbalance_settlement.priced';
    case 'issue_invoice':         return 'imbalance_settlement.invoice_issued';
    case 'acknowledge_invoice':   return 'imbalance_settlement.invoice_acknowledged';
    case 'open_dispute_window':   return 'imbalance_settlement.dispute_window_opened';
    case 'raise_dispute':         return 'imbalance_settlement.dispute_raised';
    case 'resolve_dispute':       return 'imbalance_settlement.dispute_resolved';
    case 'revise_invoice':        return 'imbalance_settlement.invoice_revised';
    case 'record_payment':        return 'imbalance_settlement.payment_recorded';
    case 'mark_settled':          return 'imbalance_settlement.settled';
    case 'archive_period':        return 'imbalance_settlement.archived';
    case 'cancel_period':         return 'imbalance_settlement.cancelled';
  }
}

// ─── Imbalance direction derived from signed MWh.
export type ImbDirection = 'long' | 'short' | 'balanced';

export function imbalanceDirection(imbalanceMwh: number | null | undefined): ImbDirection {
  const v = Number(imbalanceMwh ?? 0);
  if (!isFinite(v)) return 'balanced';
  if (v > 0.001) return 'long';
  if (v < -0.001) return 'short';
  return 'balanced';
}

// Imbalance price applied = long_price when long, short_price when short.
export function imbalancePriceApplied(
  direction: ImbDirection,
  longPrice: number | null | undefined,
  shortPrice: number | null | undefined,
): number {
  if (direction === 'long')  return Number(longPrice ?? 0);
  if (direction === 'short') return Number(shortPrice ?? 0);
  return 0;
}

export function imbalanceChargeZar(
  imbalanceMwh: number | null | undefined,
  priceApplied: number | null | undefined,
): number {
  return Math.abs(Number(imbalanceMwh ?? 0)) * Number(priceApplied ?? 0);
}

export function penaltyZar(
  chargeZar: number | null | undefined,
  penaltyMultiplier: number | null | undefined,
): number {
  const mult = Number(penaltyMultiplier ?? 1);
  if (mult <= 1) return 0;
  return Number(chargeZar ?? 0) * (mult - 1);
}

export function totalOwedZar(
  chargeZar: number | null | undefined,
  penaltyZarValue: number | null | undefined,
): number {
  return Number(chargeZar ?? 0) + Number(penaltyZarValue ?? 0);
}

// ─── LIVE battery (decorates every fetch).
//
// Settlement completeness 0-130. Components:
//   meter_data_received        15
//   nominations_reconciled     10
//   imbalance_computed         15
//   priced                     15
//   invoice_issued             10
//   invoice_acknowledged       10
//   dispute_resolved_or_skip   10
//   payment_received           20
//   archived                    5
//   first_cycle_settle_bonus   20
//   no_aged_arrears_bonus      10
// Capped at 130.
export function settlementCompletenessIndex(args: {
  meter_data_received?: boolean | number | null;
  nominations_reconciled?: boolean | number | null;
  imbalance_computed?: boolean | number | null;
  priced?: boolean | number | null;
  invoice_issued?: boolean | number | null;
  invoice_acknowledged?: boolean | number | null;
  dispute_resolved_or_skip?: boolean | number | null;
  payment_received?: boolean | number | null;
  archived?: boolean | number | null;
  first_cycle_settle_bonus?: boolean | number | null;
  no_aged_arrears_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.meter_data_received)        * 15;
  score += t(args.nominations_reconciled)     * 10;
  score += t(args.imbalance_computed)         * 15;
  score += t(args.priced)                     * 15;
  score += t(args.invoice_issued)             * 10;
  score += t(args.invoice_acknowledged)       * 10;
  score += t(args.dispute_resolved_or_skip)   * 10;
  score += t(args.payment_received)           * 20;
  score += t(args.archived)                   *  5;
  score += t(args.first_cycle_settle_bonus)   * 20;
  score += t(args.no_aged_arrears_bonus)      * 10;
  if (score > 130) score = 130;
  return score;
}

// SLA days remaining. Negative if breached.
export function slaDaysRemaining(
  status: ImbStatus,
  tier: ImbTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round((remainingMs / (1000 * 60 * 60 * 24)) * 10) / 10;
}

// Urgency band — composes effective tier + SLA days remaining into a
// single signal. critical / high / medium / low.
export type ImbUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(
  tier: ImbTier,
  slaDaysLeft: number,
): ImbUrgency {
  if (slaDaysLeft < 0) return 'critical';
  if (tier === 'systemic' || slaDaysLeft < 0.25) return 'critical';
  if (tier === 'material' || slaDaysLeft < 1) return 'high';
  if (tier === 'standard' || slaDaysLeft < 3) return 'medium';
  return 'low';
}

export function breachImminentFlag(slaDaysLeft: number): boolean {
  return slaDaysLeft >= 0 && slaDaysLeft < 0.5;
}

// Days until dispute window closes. Null when no window or terminal.
export function daysToDisputeWindowClose(
  disputeWindowCloseAt: string | Date | null | undefined,
  now: Date,
): number | null {
  if (!disputeWindowCloseAt) return null;
  const t = new Date(disputeWindowCloseAt);
  if (isNaN(t.getTime())) return null;
  const days = (t.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round(days * 10) / 10;
}

// 4-step authority ladder driven by effective tier.
export type ImbAuthority =
  | 'BRP_back_office'
  | 'BRP_finance_manager'
  | 'BRP_treasurer'
  | 'MO_settlement_admin';

export function authorityRequired(tier: ImbTier): ImbAuthority {
  switch (tier) {
    case 'minor':    return 'BRP_back_office';
    case 'standard': return 'BRP_finance_manager';
    case 'material': return 'BRP_treasurer';
    case 'systemic': return 'MO_settlement_admin';
  }
}

// Regulator filing window hours.
export function regulatorFilingWindowHours(tier: ImbTier): number {
  switch (tier) {
    case 'systemic': return 12;
    case 'material': return 24;
    case 'standard': return 72;
    case 'minor':    return 168;
  }
}

// Bridge flag: row links upstream to a W13 dispatch nomination.
export function bridgesToDispatchChain(dispatchNominationRef: string | null | undefined): boolean {
  return !!dispatchNominationRef;
}

// Bridge flag: row links upstream to a W50 reserve activation.
export function bridgesToReserveActivationChain(reserveActivationRef: string | null | undefined): boolean {
  return !!reserveActivationRef;
}

// Aged-arrears bucket from arrears_days. 0/30/60/90/120.
export function agedArrearsBucket(arrearsDays: number | null | undefined): string {
  const d = Number(arrearsDays ?? 0);
  if (d <= 0) return 'current';
  if (d < 30) return '0_30';
  if (d < 60) return '30_60';
  if (d < 90) return '60_90';
  if (d < 120) return '90_120';
  return '120_plus';
}
