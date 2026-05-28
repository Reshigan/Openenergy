// ─────────────────────────────────────────────────────────────────────────
// Wave 45 — Lender Loan Default & Enforcement / Step-in chain (P6)
//
// LMA (Loan Market Association) facility-agreement event-of-default framework +
// SARB large-exposure / impairment reporting + the SA Insolvency Act / Companies
// Act business-rescue (step-in) regime. This is the ENFORCEMENT backbone of
// project finance: when a borrower defaults — a payment miss, a covenant breach
// crystallising into an event of default, an insolvency trigger — the lender
// works the position through reservation of rights, a formal default notice, a
// cure window, acceleration, standstill (forbearance), and ultimately security
// enforcement / step-in, restructure, or write-off.
//
// Sits DOWNSTREAM of the monitoring chains: [[project-wave38-covenant-certificate-chain]]
// (an accelerated covenant certificate is the classic feeder), the W6 dunning
// cycles (a cycle-3 expiry feeds a default flag), and the one-off
// [[project-wave21-drawdown-chain]] / [[project-wave30-disbursement-chain]]
// (a UoP diversion is an event of default). Where W38 ENDS at acceleration
// (event of default declared), W45 PICKS UP at the default and runs the position
// all the way to enforcement / write-off.
//
//   default_flagged → under_review → reservation_of_rights
//     → default_notice_issued → cure_period → cured            (borrower remedies)
//
// Enforcement branch:
//   default_notice_issued|cure_period|reservation_of_rights → accelerated
//     → standstill (forbearance) → enforcement_commenced
//                                → restructured                 (bilateral workout)
//     → enforcement_commenced → enforced_closed                 (security realised)
//                             → restructured                    (workout mid-enforcement)
//     → written_off                                             (loss crystallised)
//   default_flagged|under_review → cured                        (dismiss — false alarm)
//
// Tiers (facility seniority — drive SLA + reportability):
//   senior_secured  — strongest lender protection; closest workout monitoring
//   mezzanine       — mid
//   subordinated    — junior; loosest monitoring
//
// SLA matrix is URGENT — senior secured gets the TIGHTEST windows across the
// board (senior lenders work a default fastest). Reportability:
//   - write_off (loss crystallised) crosses for EVERY tier (SARB impairment /
//     realised credit loss is always notifiable — the universal hard line; the
//     analogue of W38's accelerate-crosses-all, moved to the realised-loss event)
//   - accelerate (event of default declared) + commence_enforcement (security
//     enforcement / step-in) cross for senior_secured + mezzanine only
//   - SLA breaches cross for senior_secured + mezzanine only
//
// actor_party (borrower / lender / security_agent) is derived from the ACTION,
// not the JWT role — same model as [[project-wave38-covenant-certificate-chain]].
// The borrower effects the cure; the lender drives review / notice / acceleration
// / standstill / restructure / write-off; the security agent (trustee) commences
// and closes enforcement. The borrower-write set is guarded server-side.
// ─────────────────────────────────────────────────────────────────────────

export type LoanDefaultStatus =
  | 'default_flagged'
  | 'under_review'
  | 'reservation_of_rights'
  | 'default_notice_issued'
  | 'cure_period'
  | 'accelerated'
  | 'standstill'
  | 'enforcement_commenced'
  | 'cured'
  | 'restructured'
  | 'enforced_closed'
  | 'written_off';

export type LoanDefaultAction =
  | 'begin_review'
  | 'reserve_rights'
  | 'issue_default_notice'
  | 'open_cure_period'
  | 'confirm_cure'
  | 'dismiss'
  | 'accelerate'
  | 'agree_standstill'
  | 'commence_enforcement'
  | 'agree_restructure'
  | 'close_enforcement'
  | 'write_off';

export type LoanDefaultTier = 'senior_secured' | 'mezzanine' | 'subordinated';

export type LoanDefaultEvent =
  | 'loan_default.under_review'
  | 'loan_default.reservation_of_rights'
  | 'loan_default.default_notice_issued'
  | 'loan_default.cure_period'
  | 'loan_default.cured'
  | 'loan_default.accelerated'
  | 'loan_default.standstill'
  | 'loan_default.enforcement_commenced'
  | 'loan_default.restructured'
  | 'loan_default.enforced_closed'
  | 'loan_default.written_off'
  | 'loan_default.sla_breached';

const TERMINALS = new Set<LoanDefaultStatus>([
  'cured', 'restructured', 'enforced_closed', 'written_off',
]);

export function isTerminal(s: LoanDefaultStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<LoanDefaultAction, { from: LoanDefaultStatus[]; to: LoanDefaultStatus }> = {
  begin_review:         { from: ['default_flagged'],                                              to: 'under_review' },
  reserve_rights:       { from: ['under_review'],                                                 to: 'reservation_of_rights' },
  issue_default_notice: { from: ['under_review', 'reservation_of_rights'],                        to: 'default_notice_issued' },
  open_cure_period:     { from: ['default_notice_issued'],                                        to: 'cure_period' },
  confirm_cure:         { from: ['cure_period'],                                                  to: 'cured' },
  dismiss:              { from: ['default_flagged', 'under_review'],                              to: 'cured' },
  accelerate:           { from: ['default_notice_issued', 'cure_period', 'reservation_of_rights'], to: 'accelerated' },
  agree_standstill:     { from: ['accelerated', 'default_notice_issued'],                         to: 'standstill' },
  commence_enforcement: { from: ['accelerated', 'standstill'],                                    to: 'enforcement_commenced' },
  agree_restructure:    { from: ['standstill', 'enforcement_commenced'],                          to: 'restructured' },
  close_enforcement:    { from: ['enforcement_commenced'],                                        to: 'enforced_closed' },
  write_off:            { from: ['accelerated', 'enforcement_commenced'],                         to: 'written_off' },
};

export function nextStatus(current: LoanDefaultStatus, action: LoanDefaultAction): LoanDefaultStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: LoanDefaultStatus): LoanDefaultAction[] {
  const acts: LoanDefaultAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [LoanDefaultAction, typeof TRANSITIONS[LoanDefaultAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — senior secured gets the TIGHTEST windows (worked fastest).
export const SLA_MINUTES: Record<LoanDefaultStatus, Record<LoanDefaultTier, number>> = {
  default_flagged: {
    senior_secured: 2 * DAY,    // triage / begin review
    mezzanine:      5 * DAY,
    subordinated:   10 * DAY,
  },
  under_review: {
    senior_secured: 5 * DAY,    // assess + reserve rights / issue notice / dismiss
    mezzanine:      10 * DAY,
    subordinated:   15 * DAY,
  },
  reservation_of_rights: {
    senior_secured: 10 * DAY,   // decide: notice or accelerate
    mezzanine:      15 * DAY,
    subordinated:   20 * DAY,
  },
  default_notice_issued: {
    senior_secured: 5 * DAY,    // borrower responds / lender opens cure or accelerates
    mezzanine:      10 * DAY,
    subordinated:   15 * DAY,
  },
  cure_period: {
    senior_secured: 30 * DAY,   // contractual cure window
    mezzanine:      45 * DAY,
    subordinated:   60 * DAY,
  },
  accelerated: {
    senior_secured: 10 * DAY,   // commence enforcement / agree standstill / write off
    mezzanine:      20 * DAY,
    subordinated:   30 * DAY,
  },
  standstill: {
    senior_secured: 30 * DAY,   // forbearance window before next step
    mezzanine:      45 * DAY,
    subordinated:   60 * DAY,
  },
  enforcement_commenced: {
    senior_secured: 90 * DAY,   // security realisation / step-in window
    mezzanine:      120 * DAY,
    subordinated:   180 * DAY,
  },
  cured:           { senior_secured: 0, mezzanine: 0, subordinated: 0 },
  restructured:    { senior_secured: 0, mezzanine: 0, subordinated: 0 },
  enforced_closed: { senior_secured: 0, mezzanine: 0, subordinated: 0 },
  written_off:     { senior_secured: 0, mezzanine: 0, subordinated: 0 },
};

export function slaDeadlineFor(status: LoanDefaultStatus, tier: LoanDefaultTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// SARB large-exposure / impairment reportability applies to senior + mezzanine
// debt; subordinated workouts sit between junior lenders (less systemic).
const REPORTABLE_TIERS = new Set<LoanDefaultTier>(['senior_secured', 'mezzanine']);

export function isReportableTier(tier: LoanDefaultTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// The escalation actions that touch the regulator: declaring an event of default
// (accelerate), enforcing security / stepping in (commence_enforcement), and
// crystallising the loss (write_off).
export function isEnforcementAction(action: LoanDefaultAction): boolean {
  return action === 'accelerate' || action === 'commence_enforcement' || action === 'write_off';
}

// Reportability matrix:
//   - write_off (loss crystallised → SARB impairment) crosses for EVERY tier —
//     the universal hard line (realised credit loss is always notifiable)
//   - accelerate (EoD declared) + commence_enforcement (security enforcement /
//     step-in) cross for senior_secured + mezzanine only
export function crossesIntoRegulator(action: LoanDefaultAction, tier: LoanDefaultTier): boolean {
  if (action === 'write_off') return true;
  if (action === 'accelerate' || action === 'commence_enforcement') return REPORTABLE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: LoanDefaultTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// Party that each action represents (contractual function), not the login role.
// The borrower effects the cure; the lender drives the workout; the security
// agent (trustee) commences and closes enforcement.
const ACTION_PARTY: Record<LoanDefaultAction, 'borrower' | 'lender' | 'security_agent'> = {
  confirm_cure:         'borrower',
  begin_review:         'lender',
  reserve_rights:       'lender',
  issue_default_notice: 'lender',
  open_cure_period:     'lender',
  dismiss:              'lender',
  accelerate:           'lender',
  agree_standstill:     'lender',
  agree_restructure:    'lender',
  write_off:            'lender',
  commence_enforcement: 'security_agent',
  close_enforcement:    'security_agent',
};

export function partyForAction(action: LoanDefaultAction): 'borrower' | 'lender' | 'security_agent' {
  return ACTION_PARTY[action];
}

// Borrower-side write set (guarded server-side via the borrower-write split).
// The borrower can only effect a cure during the cure window.
const BORROWER_ACTIONS = new Set<LoanDefaultAction>(['confirm_cure']);

export function isBorrowerAction(action: LoanDefaultAction): boolean {
  return BORROWER_ACTIONS.has(action);
}
