// ─────────────────────────────────────────────────────────────────────────
// Wave 86 — Lender DSCR (Debt-Service-Coverage-Ratio) Monitoring & Cure (P6)
//
// Every project-finance facility carries a financial-ratio covenant test
// (DSCR / LLCR / PLCR) measured on each test date — typically quarterly. The
// agent bank assembles project cash flows + scheduled debt service, computes
// the ratios, certifies the period clean if the test passes, or routes the
// project through a structured CURE lifecycle if it does not. A persistent
// breach trips distribution lock-up and — at the floor — triggers acceleration.
//
// Distinct from the rest of the Lender book:
//   - [[project_wave6_lender_portal]]              generic covenant watchlist
//   - [[project_wave38_covenant_certificate_chain]] certificate SUBMISSION (the form)
//   - [[project_wave21_drawdown_chain]]            loan drawdowns out
//   - [[project_wave30_disbursement_chain]]        use-of-proceeds
//   - [[project_wave45_loan_default_chain]]        enforcement (receives W86 acceleration)
//   - [[project_wave53_credit_origination_chain]]  facility origination
//   - [[project_wave61_loan_transfer_chain]]       secondary transfer
//   - [[project_wave69_security_perfection_chain]] security perfection
//   - [[project_wave77_reserve_account_chain]]     DSRA/MRA buffer (cure source)
// W86 is the ratio-MEASUREMENT and CURE chain — the chain that decides whether a
// period passes, what tier the breach falls into, what cure is available, and
// whether the result is a clean certification, a lock-up, a waiver, or
// acceleration handing off to W45.
//
// Forward path (clean period):
//   period_open → data_collected → computed → certified_clean (terminal)
//
// Watch branch (early warning — ratio between pass and lockup floor):
//   computed → watch → certified_clean (recovery)
//                    → breach_recorded (deterioration)
//
// Breach + cure branch (ratio below lockup floor):
//   computed → breach_recorded
//   breach_recorded → enter_lock_up → lock_up
//   breach_recorded → propose_cure → cure_proposed → execute_cure → cure_in_progress
//     cure_in_progress → validate_cure → cure_validated → certified_clean (terminal)
//     cure_in_progress → fail_cure → accelerated (terminal)
//   cure_proposed → reject_cure → breach_recorded
//   lock_up → propose_cure → cure_proposed (cure path re-enters)
//   lock_up → declare_acceleration → accelerated (terminal — hand off to W45)
//
// Lender-forbearance branch:
//   breach_recorded → waive_breach → waived (terminal)
//
// Tiers (4) RE-DERIVED on every transition from current DSCR:
//   minor    : DSCR >= 1.30  (above headroom comfort)
//   standard : 1.20 <= DSCR < 1.30  (watch zone)
//   material : 1.00 <= DSCR < 1.20  (breach but solvent — cash exceeds debt service)
//   severe   : DSCR < 1.00          (under water — debt service > cash)
//
// SLA polarity URGENT — the LOWER the DSCR, the TIGHTER every cure window. Mirror
// of [[project_wave77_reserve_account_chain]] / [[project_wave85_settlement_fail_chain]]
// / [[project_wave34_load_curtailment_chain]] family. Terminals (certified_clean,
// accelerated, waived) and the healthy steady-state phase between periods carry
// no deadline.
//
// COVERAGE-DEFENSE SIGNATURE (the W86 hard line) — every loss-of-coverage event
// always reportable to the regulator (SARB IFRS 9 Stage 3 trigger):
//   declare_acceleration → regulator EVERY tier
//     (sister of W45 write_off, W77 declare_breach, W68 declare_default — the
//      acceleration of a project-finance loan is a categorical prudential event)
//   waive_breach        → material + severe (forbearance on a stressed loan)
//   enter_lock_up       → material + severe (distribution-lock-up is a notice event)
//   sla_breached        → material + severe
//
// Write roles: {admin, lender}. Borrower contributes through propose_cure and
// execute_cure (party=borrower) but the route gates every action to the lender
// write set — borrowers see the case state through the read-side aggregate.
// actor_party tags whether the step represents the lender (agent), the borrower
// (sponsor), or an independent engineer (validates the cure outcome).
// ─────────────────────────────────────────────────────────────────────────

export type DscrStatus =
  | 'period_open'
  | 'data_collected'
  | 'computed'
  | 'certified_clean'
  | 'watch'
  | 'breach_recorded'
  | 'cure_proposed'
  | 'cure_in_progress'
  | 'cure_validated'
  | 'lock_up'
  | 'accelerated'
  | 'waived';

export type DscrAction =
  | 'collect_data'
  | 'compute_ratios'
  | 'certify_clean'
  | 'place_on_watch'
  | 'record_breach'
  | 'enter_lock_up'
  | 'propose_cure'
  | 'reject_cure'
  | 'execute_cure'
  | 'validate_cure'
  | 'fail_cure'
  | 'declare_acceleration'
  | 'waive_breach';

export type DscrTier = 'minor' | 'standard' | 'material' | 'severe';

export type DscrParty = 'lender' | 'borrower' | 'independent_engineer';

export type DscrEvent =
  | 'dscr_monitoring.data_collected'
  | 'dscr_monitoring.computed'
  | 'dscr_monitoring.certified_clean'
  | 'dscr_monitoring.watch'
  | 'dscr_monitoring.breach_recorded'
  | 'dscr_monitoring.cure_proposed'
  | 'dscr_monitoring.cure_in_progress'
  | 'dscr_monitoring.cure_validated'
  | 'dscr_monitoring.lock_up'
  | 'dscr_monitoring.accelerated'
  | 'dscr_monitoring.waived'
  | 'dscr_monitoring.sla_breached';

const TERMINALS = new Set<DscrStatus>(['certified_clean', 'accelerated', 'waived']);

export function isTerminal(s: DscrStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<DscrAction, { from: DscrStatus[]; to: DscrStatus }> = {
  collect_data:         { from: ['period_open'],                                                    to: 'data_collected' },
  compute_ratios:       { from: ['data_collected'],                                                 to: 'computed' },
  certify_clean:        { from: ['computed', 'watch', 'cure_validated'],                            to: 'certified_clean' },
  place_on_watch:       { from: ['computed'],                                                       to: 'watch' },
  record_breach:        { from: ['computed', 'watch'],                                              to: 'breach_recorded' },
  enter_lock_up:        { from: ['breach_recorded'],                                                to: 'lock_up' },
  propose_cure:         { from: ['breach_recorded', 'lock_up'],                                     to: 'cure_proposed' },
  reject_cure:          { from: ['cure_proposed'],                                                  to: 'breach_recorded' },
  execute_cure:         { from: ['cure_proposed'],                                                  to: 'cure_in_progress' },
  validate_cure:        { from: ['cure_in_progress'],                                               to: 'cure_validated' },
  fail_cure:            { from: ['cure_in_progress'],                                               to: 'accelerated' },
  declare_acceleration: { from: ['lock_up'],                                                        to: 'accelerated' },
  waive_breach:         { from: ['breach_recorded'],                                                to: 'waived' },
};

export function nextStatus(current: DscrStatus, action: DscrAction): DscrStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: DscrStatus): DscrAction[] {
  const acts: DscrAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [DscrAction, typeof TRANSITIONS[DscrAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LOWER the DSCR (i.e. the more stressed the loan), the
// TIGHTER every window. Strictly decreasing minor → severe per graded state.
// Terminals + the healthy steady state between periods carry no deadline.
export const SLA_MINUTES: Record<DscrStatus, Record<DscrTier, number>> = {
  period_open:      { minor: 21 * DAY, standard: 14 * DAY, material: 10 * DAY, severe: 7 * DAY },
  data_collected:   { minor: 7 * DAY,  standard: 5 * DAY,  material: 3 * DAY,  severe: 2 * DAY },
  computed:         { minor: 3 * DAY,  standard: 2 * DAY,  material: 1 * DAY,  severe: 12 * HOUR },
  certified_clean:  { minor: 0,        standard: 0,        material: 0,        severe: 0 },
  watch:            { minor: 14 * DAY, standard: 10 * DAY, material: 7 * DAY,  severe: 5 * DAY },
  breach_recorded:  { minor: 14 * DAY, standard: 10 * DAY, material: 7 * DAY,  severe: 3 * DAY },
  cure_proposed:    { minor: 21 * DAY, standard: 14 * DAY, material: 10 * DAY, severe: 7 * DAY },
  cure_in_progress: { minor: 60 * DAY, standard: 45 * DAY, material: 30 * DAY, severe: 14 * DAY },
  cure_validated:   { minor: 3 * DAY,  standard: 2 * DAY,  material: 1 * DAY,  severe: 12 * HOUR },
  lock_up:          { minor: 90 * DAY, standard: 60 * DAY, material: 45 * DAY, severe: 30 * DAY },
  accelerated:      { minor: 0,        standard: 0,        material: 0,        severe: 0 },
  waived:           { minor: 0,        standard: 0,        material: 0,        severe: 0 },
};

export function slaWindowMinutes(status: DscrStatus, tier: DscrTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: DscrStatus, tier: DscrTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Tier RE-DERIVED on every transition from the current measured DSCR. This is a
// load-bearing design: a project that started at minor can deteriorate into
// severe across periods, and a project that breached at material can recover
// back to minor after a successful cure. The matrix below — and every cascade /
// regulator / SLA decision — keys off whatever DSCR the row carries right now.
export function tierForDscr(dscr: number | null | undefined): DscrTier {
  if (dscr == null || !isFinite(dscr)) return 'severe';
  if (dscr >= 1.30) return 'minor';
  if (dscr >= 1.20) return 'standard';
  if (dscr >= 1.00) return 'material';
  return 'severe';
}

// The STRESSED tiers — where reportability for waivers, lock-up and SLA breaches
// attaches.
const STRESSED_TIERS = new Set<DscrTier>(['material', 'severe']);

export function isStressedTier(tier: DscrTier): boolean {
  return STRESSED_TIERS.has(tier);
}

// COVERAGE-DEFENSE signature — the W86 hard line.
//   declare_acceleration  → regulator EVERY tier (sister of W45 / W68 / W77)
//   waive_breach          → material + severe (forbearance disclosure)
//   enter_lock_up         → material + severe (distribution-lockup notice)
export function crossesIntoRegulator(action: DscrAction, tier: DscrTier): boolean {
  if (action === 'declare_acceleration') return true;
  if (action === 'waive_breach')         return STRESSED_TIERS.has(tier);
  if (action === 'enter_lock_up')        return STRESSED_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: DscrTier): boolean {
  return STRESSED_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true for the
// STRESSED tiers (material + severe).
export function isReportable(tier: DscrTier): boolean {
  return STRESSED_TIERS.has(tier);
}

// Party each action represents. The agent / lender drives the machinery; the
// borrower proposes and executes the cure; the independent engineer validates
// the post-cure ratio test. Audit attribution only — the route gates every
// action to the lender write set.
const ACTION_PARTY: Record<DscrAction, DscrParty> = {
  collect_data:         'lender',
  compute_ratios:       'lender',
  certify_clean:        'lender',
  place_on_watch:       'lender',
  record_breach:        'lender',
  enter_lock_up:        'lender',
  propose_cure:         'borrower',
  reject_cure:          'lender',
  execute_cure:         'borrower',
  validate_cure:        'independent_engineer',
  fail_cure:            'lender',
  declare_acceleration: 'lender',
  waive_breach:         'lender',
};

export function partyForAction(action: DscrAction): DscrParty {
  return ACTION_PARTY[action];
}

// ─── Live coverage-defense battery — beats Mott MacDonald PFlex / Riverbed-PF /
//     Modelware / FIS Sungard Reflect / Excel-based bank PF monitoring by
//     surfacing every ratio + cure metric LIVE on the row, not in a static
//     workbook refresh cycle. Each helper takes a single row + (where relevant)
//     a `now` clock and returns a number; the route's decorate() composes them.

// Severity index 0-100. Linear in distance below pass threshold 1.30; 0 at pass,
// 100 at DSCR 0.50 (catastrophic). Severity is decoupled from tier (which is a
// 4-bucket label) — gives the UI a smooth gradient on the listing.
export function severityIndex(dscr: number | null | undefined): number {
  if (dscr == null || !isFinite(dscr)) return 100;
  if (dscr >= 1.30) return 0;
  if (dscr <= 0.50) return 100;
  const range = 1.30 - 0.50;
  const distance = 1.30 - dscr;
  return Math.round((distance / range) * 100);
}

// Headroom in MONTHS to the lockup floor at the current trend. Inputs are the
// current backward DSCR and an annualised trend (negative = deteriorating). A
// project trending up has infinite headroom (returns null).
export function headroomToLockupMonths(
  current: number | null | undefined,
  annualTrend: number | null | undefined,
  lockupFloor = 1.00,
): number | null {
  if (current == null || !isFinite(current) || current < lockupFloor) return 0;
  if (annualTrend == null || !isFinite(annualTrend) || annualTrend >= 0) return null;
  const distance = current - lockupFloor;
  const monthsPerUnit = 12 / Math.abs(annualTrend);
  return Math.round(distance * monthsPerUnit * 10) / 10;
}

// Days remaining in the current cure window. Returns 0 when no deadline or
// expired (the SLA sweep will fire the breach independently).
export function cureRunwayDays(
  status: DscrStatus,
  tier: DscrTier,
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

// Whether the equity cure is sufficient to close the breach. Equity cure
// effectiveness in PF is typically capped — many LMA-style facilities require
// cure ≥ shortfall × cap multiple (typical 1.0×–1.25×). Returns the ratio of
// available equity to required cure (1.0 means just enough; <1.0 means short).
export function equityCureCoverageRatio(
  availableEquityZar: number | null | undefined,
  shortfallZar: number | null | undefined,
  capMultiple = 1.0,
): number {
  const available = Number(availableEquityZar ?? 0);
  const shortfall = Number(shortfallZar ?? 0);
  if (shortfall <= 0) return 1.0;
  const required = shortfall * capMultiple;
  if (required <= 0) return 1.0;
  return Math.round((available / required) * 100) / 100;
}

// DSRA hookup — whether the W77 DSRA buffer is sufficient to bring the period
// back to pass. dsraBalanceZar can be supplied from the W77 read-side; returns
// a coverage ratio of DSRA balance vs the period's shortfall.
export function dsraCoverageRatio(
  dsraBalanceZar: number | null | undefined,
  shortfallZar: number | null | undefined,
): number {
  const balance = Number(dsraBalanceZar ?? 0);
  const shortfall = Number(shortfallZar ?? 0);
  if (shortfall <= 0) return 1.0;
  return Math.round((balance / shortfall) * 100) / 100;
}

// Cross-default contagion flag — true when there is a sister facility on the
// same project that is itself in breach or accelerated. The route supplies the
// sister-loan DSCR from a join; a sister-DSCR below the lockup floor sets the
// flag, which lifts the regulator-crossing severity in the inbox materializer.
export function crossDefaultRiskFlag(sisterLoanDscr: number | null | undefined): boolean {
  if (sisterLoanDscr == null || !isFinite(sisterLoanDscr)) return false;
  return sisterLoanDscr < 1.00;
}

// Forward / projected DSCR over the next P12M from contracted PPA cash flows.
// The route supplies the projected cash flow and projected debt service; this
// helper just gates against divide-by-zero.
export function forwardDscr(
  projectedCashflowZar: number | null | undefined,
  projectedDebtServiceZar: number | null | undefined,
): number | null {
  const cf = Number(projectedCashflowZar ?? 0);
  const ds = Number(projectedDebtServiceZar ?? 0);
  if (ds <= 0) return null;
  return Math.round((cf / ds) * 1000) / 1000;
}

// LLCR — Loan Life Coverage Ratio (NPV of cash flows over the remaining loan
// life ÷ outstanding debt). PLCR — Project Life Coverage Ratio (NPV over the
// project life). The route supplies the NPVs; these helpers gate the divisors.
export function llcr(npvLoanLifeZar: number | null | undefined, outstandingDebtZar: number | null | undefined): number | null {
  const npv = Number(npvLoanLifeZar ?? 0);
  const debt = Number(outstandingDebtZar ?? 0);
  if (debt <= 0) return null;
  return Math.round((npv / debt) * 1000) / 1000;
}

export function plcr(npvProjectLifeZar: number | null | undefined, outstandingDebtZar: number | null | undefined): number | null {
  const npv = Number(npvProjectLifeZar ?? 0);
  const debt = Number(outstandingDebtZar ?? 0);
  if (debt <= 0) return null;
  return Math.round((npv / debt) * 1000) / 1000;
}

// Urgency band derived from severity + cure runway. Used to colour the listing.
//   critical  : severity >= 60 OR runway < 2d
//   high      : severity >= 30 OR runway < 7d
//   medium    : severity >= 10 OR runway < 21d
//   low       : everything else
export type DscrUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(severity: number, runwayDays: number): DscrUrgency {
  if (severity >= 60 || (runwayDays > 0 && runwayDays < 2)) return 'critical';
  if (severity >= 30 || (runwayDays > 0 && runwayDays < 7)) return 'high';
  if (severity >= 10 || (runwayDays > 0 && runwayDays < 21)) return 'medium';
  return 'low';
}
