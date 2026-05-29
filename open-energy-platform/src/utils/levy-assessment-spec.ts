// ─────────────────────────────────────────────────────────────────────────
// Wave 74 — Regulator NERSA Levy Assessment & Collection chain (P6)
//
// NERSA recovering its own running costs from the industries it regulates. The
// Energy Regulator imposes an annual levy on licensees under section 5B of the
// National Energy Regulator Act 40 of 2004 (and fees under the Electricity
// Regulation Act 4 of 2006 section 10), assessed on a declared base — turnover,
// throughput volume, or a fixed schedule — across NERSA's three regulated
// industries (electricity, piped-gas, petroleum-pipelines). NERSA computes the
// assessment, QA-reviews it, issues a levy notice (invoice), entertains an
// objection from the licensee, confirms the amount payable, receives payment,
// ages the debt if it falls past due, issues a final demand, escalates an
// uncollected debt into enforcement (where non-payment becomes a licence
// good-standing matter), and either settles it on payment or — as a last
// resort and with Council approval — writes it off. An assessment issued in
// error may be withdrawn before payment.
//
// This is DISTINCT from every other regulator chain by SUBJECT:
//   - [[project-wave43-tariff-determination-chain]] sets what a licensee may
//     CHARGE ITS CUSTOMERS (a downstream price control).
//   - W74 sets what the licensee OWES THE REGULATOR (an upstream cost recovery).
//   It is the financial counterpart to the licensing chains (W33/W49/W57): a
//   licence grants the right to operate; the levy funds the regulator that
//   grants it. Non-payment is therefore a licence good-standing matter, which is
//   why enforcement escalation is the W74 signature crossing.
//
// Forward path (happy):
//   levy_assessed → assessment_review → invoiced → payment_pending
//     → (partially_paid …) → settled
// Objection branch (licensee disputes the assessment):
//   invoiced → objection_review → payment_pending (resolve_objection)
// Arrears / dunning branch (payment past due):
//   payment_pending | partially_paid → in_arrears → final_demand
//     → enforcement → settled | written_off
// Withdraw (assessment raised in error, before payment):
//   levy_assessed | assessment_review | invoiced | objection_review → withdrawn
//
// Tiers (by assessed levy amount in ZAR — drive SLA + reportability):
//   micro  — < R100k     (a small embedded generator / trader)
//   small  — < R1m
//   medium — < R10m
//   large  — < R50m
//   major  — ≥ R50m      (a national utility / large pipeline operator)
//
// SLA matrix is URGENT — the LARGER the assessed levy, the TIGHTER every window.
// A multi-million-rand levy on a national utility is a material slice of NERSA's
// funding and demands rapid collection action; a micro levy on a small embedded
// generator runs the longer administrative windows. Same flavour as the URGENT
// complaint / compliance-inspection / load-curtailment SLAs; the OPPOSITE of the
// INVERTED licensing / renewal / tariff-determination / SSEG SLAs.
//
// Reportability (a regulator-native chain that still surfaces its material
// collection events onto the NERSA Council oversight queue — same mechanism as
// W31/W33/W40/W43/W49/W57/W66):
//   - escalate_enforcement crosses for EVERY tier (an uncollected levy escalated
//     into enforcement puts the licensee's good standing at risk — the W74
//     signature, mirroring W66 lodge_appeal / W49 refuse / W57 refer)
//   - write_off crosses for EVERY tier (a fiscal write-off of public-body revenue
//     is always a material event requiring Council visibility)
//   - issue_final_demand crosses for the large + major tiers
//   - SLA breaches cross for the large + major tiers
//
// actor_party (regulator / licensee) is derived from the ACTION, not the JWT
// role — same audit-attribution model as W31/W40/W57/W66. The write is
// SINGLE-PARTY regulator-owned ({admin, regulator}); NERSA records the licensee's
// objection and payments on their behalf.
// ─────────────────────────────────────────────────────────────────────────

export type LevyStatus =
  | 'levy_assessed'
  | 'assessment_review'
  | 'invoiced'
  | 'objection_review'
  | 'payment_pending'
  | 'partially_paid'
  | 'in_arrears'
  | 'final_demand'
  | 'enforcement'
  | 'settled'
  | 'written_off'
  | 'withdrawn';

export type LevyAction =
  | 'review_assessment'
  | 'issue_invoice'
  | 'record_objection'
  | 'resolve_objection'
  | 'confirm_payable'
  | 'record_partial_payment'
  | 'flag_arrears'
  | 'issue_final_demand'
  | 'escalate_enforcement'
  | 'record_settlement'
  | 'write_off'
  | 'withdraw_assessment';

export type LevyTier = 'micro' | 'small' | 'medium' | 'large' | 'major';

export type LevyParty = 'regulator' | 'licensee';

export type LevyBasis = 'turnover_based' | 'volume_based' | 'fixed';

export type LevySector = 'electricity' | 'piped_gas' | 'petroleum_pipeline';

export type LevyEvent =
  | 'regulator_levy.assessment_review'
  | 'regulator_levy.invoiced'
  | 'regulator_levy.objection_review'
  | 'regulator_levy.payment_pending'
  | 'regulator_levy.partially_paid'
  | 'regulator_levy.in_arrears'
  | 'regulator_levy.final_demand'
  | 'regulator_levy.enforcement'
  | 'regulator_levy.settled'
  | 'regulator_levy.written_off'
  | 'regulator_levy.withdrawn'
  | 'regulator_levy.sla_breached';

const TERMINALS = new Set<LevyStatus>(['settled', 'written_off', 'withdrawn']);

export function isTerminal(s: LevyStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<LevyAction, { from: LevyStatus[]; to: LevyStatus }> = {
  review_assessment:      { from: ['levy_assessed'],                                                          to: 'assessment_review' },
  issue_invoice:          { from: ['assessment_review'],                                                      to: 'invoiced' },
  record_objection:       { from: ['invoiced'],                                                               to: 'objection_review' },
  resolve_objection:      { from: ['objection_review'],                                                       to: 'payment_pending' },
  confirm_payable:        { from: ['invoiced'],                                                               to: 'payment_pending' },
  record_partial_payment: { from: ['payment_pending', 'partially_paid', 'in_arrears', 'final_demand'],        to: 'partially_paid' },
  flag_arrears:           { from: ['payment_pending', 'partially_paid'],                                      to: 'in_arrears' },
  issue_final_demand:     { from: ['in_arrears'],                                                             to: 'final_demand' },
  escalate_enforcement:   { from: ['final_demand'],                                                           to: 'enforcement' },
  record_settlement:      { from: ['payment_pending', 'partially_paid', 'in_arrears', 'final_demand', 'enforcement'], to: 'settled' },
  write_off:              { from: ['enforcement'],                                                            to: 'written_off' },
  withdraw_assessment:    { from: ['levy_assessed', 'assessment_review', 'invoiced', 'objection_review'],     to: 'withdrawn' },
};

export function nextStatus(current: LevyStatus, action: LevyAction): LevyStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: LevyStatus): LevyAction[] {
  const acts: LevyAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [LevyAction, typeof TRANSITIONS[LevyAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const WITHDRAWABLE = new Set<LevyStatus>([
  'levy_assessed', 'assessment_review', 'invoiced', 'objection_review',
]);

export function isWithdrawable(s: LevyStatus): boolean {
  return WITHDRAWABLE.has(s);
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LARGER the assessed levy, the TIGHTER every window. A
// multi-million-rand levy on a national utility demands rapid collection;
// a micro levy runs the longer administrative windows.
export const SLA_MINUTES: Record<LevyStatus, Record<LevyTier, number>> = {
  levy_assessed: {
    micro:  10 * DAY,   // QA-review the assessment
    small:   7 * DAY,
    medium:  5 * DAY,
    large:   3 * DAY,
    major:   2 * DAY,
  },
  assessment_review: {
    micro:   7 * DAY,   // issue the levy notice / invoice
    small:   5 * DAY,
    medium:  4 * DAY,
    large:   3 * DAY,
    major:   2 * DAY,
  },
  invoiced: {
    micro:  60 * DAY,   // payment terms (objection or pay)
    small:  45 * DAY,
    medium: 30 * DAY,
    large:  21 * DAY,
    major:  14 * DAY,
  },
  objection_review: {
    micro:  30 * DAY,   // adjudicate the objection
    small:  21 * DAY,
    medium: 14 * DAY,
    large:  10 * DAY,
    major:   7 * DAY,
  },
  payment_pending: {
    micro:  30 * DAY,   // settle within terms
    small:  21 * DAY,
    medium: 14 * DAY,
    large:  10 * DAY,
    major:   7 * DAY,
  },
  partially_paid: {
    micro:  30 * DAY,   // clear the residual balance
    small:  21 * DAY,
    medium: 14 * DAY,
    large:  10 * DAY,
    major:   7 * DAY,
  },
  in_arrears: {
    micro:  21 * DAY,   // issue the final demand
    small:  14 * DAY,
    medium: 10 * DAY,
    large:   7 * DAY,
    major:   5 * DAY,
  },
  final_demand: {
    micro:  14 * DAY,   // escalate to enforcement
    small:  10 * DAY,
    medium:  7 * DAY,
    large:   5 * DAY,
    major:   3 * DAY,
  },
  enforcement: {
    micro:  30 * DAY,   // conclude enforcement (settle or write off)
    small:  21 * DAY,
    medium: 14 * DAY,
    large:  10 * DAY,
    major:   7 * DAY,
  },
  settled:     { micro: 0, small: 0, medium: 0, large: 0, major: 0 },
  written_off: { micro: 0, small: 0, medium: 0, large: 0, major: 0 },
  withdrawn:   { micro: 0, small: 0, medium: 0, large: 0, major: 0 },
};

export function slaDeadlineFor(status: LevyStatus, tier: LevyTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

export function slaWindowMinutes(status: LevyStatus, tier: LevyTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

// Assessed-amount tier. <R100k micro / <R1m small / <R10m medium / <R50m large /
// ≥R50m major.
export function tierForLevyAmount(zar: number): LevyTier {
  if (zar < 100000) return 'micro';
  if (zar < 1000000) return 'small';
  if (zar < 10000000) return 'medium';
  if (zar < 50000000) return 'large';
  return 'major';
}

// Auto-assessment from the declared base — the beat-the-manual-process core.
// turnover_based: rate is a fraction of declared annual turnover (ZAR).
// volume_based:   rate is ZAR per declared throughput unit (MWh / GJ / m³).
// fixed:          rate is the flat scheduled amount (base ignored).
export function assessedLevyAmount(basis: LevyBasis, declaredBase: number, rate: number): number {
  if (basis === 'fixed') return Math.max(0, Math.round(rate));
  if (basis === 'turnover_based') return Math.max(0, Math.round(declaredBase * rate));
  return Math.max(0, Math.round(declaredBase * rate)); // volume_based
}

// Outstanding balance after payments-to-date.
export function outstandingBalance(assessed: number, paidToDate: number): number {
  return Math.max(0, Math.round(assessed - paidToDate));
}

// Arrears aging bucket from days past the due date — drives the dunning view.
export type ArrearsBucket = 'current' | 'b30' | 'b60' | 'b90' | 'b120plus';
export function arrearsBucket(daysOverdue: number): ArrearsBucket {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'b30';
  if (daysOverdue <= 60) return 'b60';
  if (daysOverdue <= 90) return 'b90';
  return 'b120plus';
}

// Material tiers for Council-oversight reportability.
const LARGE_TIERS = new Set<LevyTier>(['large', 'major']);

export function isLargeTier(tier: LevyTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportability matrix:
//   - escalate_enforcement crosses for EVERY tier (licence good-standing at risk
//     — the W74 signature)
//   - write_off crosses for EVERY tier (fiscal write-off of public revenue)
//   - issue_final_demand crosses for the large + major tiers
export function crossesIntoRegulator(action: LevyAction, tier: LevyTier): boolean {
  if (action === 'escalate_enforcement') return true;
  if (action === 'write_off') return true;
  if (action === 'issue_final_demand') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: LevyTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Party that each action represents (procedural role), not the login role. The
// licensee objects and pays; NERSA (regulator) assesses, reviews, invoices,
// resolves objections, ages the debt, demands, enforces, writes off, withdraws.
const ACTION_PARTY: Record<LevyAction, LevyParty> = {
  review_assessment:      'regulator',
  issue_invoice:          'regulator',
  record_objection:       'licensee',
  resolve_objection:      'regulator',
  confirm_payable:        'regulator',
  record_partial_payment: 'licensee',
  flag_arrears:           'regulator',
  issue_final_demand:     'regulator',
  escalate_enforcement:   'regulator',
  record_settlement:      'licensee',
  write_off:              'regulator',
  withdraw_assessment:    'regulator',
};

export function partyForAction(action: LevyAction): LevyParty {
  return ACTION_PARTY[action];
}

// Maps an action to the cascade event it fires.
export const EVENT_FOR_ACTION: Record<LevyAction, LevyEvent> = {
  review_assessment:      'regulator_levy.assessment_review',
  issue_invoice:          'regulator_levy.invoiced',
  record_objection:       'regulator_levy.objection_review',
  resolve_objection:      'regulator_levy.payment_pending',
  confirm_payable:        'regulator_levy.payment_pending',
  record_partial_payment: 'regulator_levy.partially_paid',
  flag_arrears:           'regulator_levy.in_arrears',
  issue_final_demand:     'regulator_levy.final_demand',
  escalate_enforcement:   'regulator_levy.enforcement',
  record_settlement:      'regulator_levy.settled',
  write_off:              'regulator_levy.written_off',
  withdraw_assessment:    'regulator_levy.withdrawn',
};

export function eventForAction(action: LevyAction): LevyEvent {
  return EVENT_FOR_ACTION[action];
}
