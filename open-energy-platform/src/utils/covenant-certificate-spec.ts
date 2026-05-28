// ─────────────────────────────────────────────────────────────────────────
// Wave 38 — Lender Covenant Compliance Certificate chain (P6)
//
// LMA (Loan Market Association) project-finance compliance-certificate
// framework + Equator Principles covenant monitoring + SARB large-exposure
// reporting. After financial close every facility imposes a periodic
// (quarterly / semi-annual) information covenant: the borrower must deliver a
// signed Compliance Certificate evidencing the financial covenants (DSCR,
// LLCR, gearing) for the test period. The facility agent reviews and either
// confirms compliance or declares a breach; a breach routes through the
// reservation-of-rights / waiver / cure / acceleration branches.
//
// This is the ONGOING monitoring backbone that sits downstream of the
// one-off [[project-wave21-drawdown-chain]] (drawdown) and
// [[project-wave30-disbursement-chain]] (disbursement UoP) lender chains, and
// wraps the static covenant evaluator in src/utils/covenants.ts in a formal
// certification lifecycle.
//
//   certificate_due → certificate_submitted → under_review → ratios_verified
//     → compliant
//
// Breach branch:
//   under_review|ratios_verified → breach_identified
//     → waiver_requested → waiver_granted        (lender waives, period closes)
//     → cure_period → cured                       (borrower remedies in window)
//     → accelerated                               (event of default declared)
//   certificate_due → breach_identified           (information-covenant breach:
//                                                   borrower failed to deliver)
//
// Tiers (facility seniority — drive SLA + reportability):
//   senior_secured  — strongest lender protection; closest monitoring
//   mezzanine       — mid
//   subordinated    — junior; loosest monitoring
//
// SLA matrix is URGENT — senior secured gets the TIGHTEST windows across the
// board (senior lenders monitor closest). Reportability: accelerate (event of
// default) crosses to the regulator for EVERY tier (declaring an EoD is always
// notifiable, SARB large-exposure); breach declarations + SLA breaches cross
// for senior_secured + mezzanine only (subordinated breaches sit between junior
// lenders, less systemic).
//
// actor_party (borrower / agent / lender) is derived from the ACTION, not the
// JWT role — same model as [[project-wave36-best-execution-chain]]. The
// borrower delivers certificates + requests waivers; the facility agent reviews
// / verifies / requires cure; the lenders (majority) grant waivers + accelerate.
// No dedicated agent/borrower login; lender/admin/support record every party's
// action (with the borrower-write set guarded server-side).
// ─────────────────────────────────────────────────────────────────────────

export type CovCertStatus =
  | 'certificate_due'
  | 'certificate_submitted'
  | 'under_review'
  | 'ratios_verified'
  | 'compliant'
  | 'breach_identified'
  | 'waiver_requested'
  | 'waiver_granted'
  | 'cure_period'
  | 'cured'
  | 'accelerated';

export type CovCertAction =
  | 'submit_certificate'
  | 'begin_review'
  | 'verify_ratios'
  | 'confirm_compliant'
  | 'flag_breach'
  | 'flag_non_submission'
  | 'request_waiver'
  | 'grant_waiver'
  | 'require_cure'
  | 'confirm_cured'
  | 'accelerate';

export type CovCertTier = 'senior_secured' | 'mezzanine' | 'subordinated';

export type CovCertEvent =
  | 'covenant_certificate.certificate_submitted'
  | 'covenant_certificate.under_review'
  | 'covenant_certificate.ratios_verified'
  | 'covenant_certificate.compliant'
  | 'covenant_certificate.breach_identified'
  | 'covenant_certificate.waiver_requested'
  | 'covenant_certificate.waiver_granted'
  | 'covenant_certificate.cure_period'
  | 'covenant_certificate.cured'
  | 'covenant_certificate.accelerated'
  | 'covenant_certificate.sla_breached';

const TERMINALS = new Set<CovCertStatus>(['compliant', 'waiver_granted', 'cured', 'accelerated']);

export function isTerminal(s: CovCertStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<CovCertAction, { from: CovCertStatus[]; to: CovCertStatus }> = {
  submit_certificate:  { from: ['certificate_due'],                                  to: 'certificate_submitted' },
  begin_review:        { from: ['certificate_submitted'],                            to: 'under_review' },
  verify_ratios:       { from: ['under_review'],                                     to: 'ratios_verified' },
  confirm_compliant:   { from: ['ratios_verified'],                                  to: 'compliant' },
  flag_breach:         { from: ['under_review', 'ratios_verified'],                  to: 'breach_identified' },
  flag_non_submission: { from: ['certificate_due'],                                  to: 'breach_identified' },
  request_waiver:      { from: ['breach_identified'],                                to: 'waiver_requested' },
  grant_waiver:        { from: ['waiver_requested'],                                 to: 'waiver_granted' },
  require_cure:        { from: ['breach_identified', 'waiver_requested'],            to: 'cure_period' },
  confirm_cured:       { from: ['cure_period'],                                      to: 'cured' },
  accelerate:          { from: ['breach_identified', 'waiver_requested', 'cure_period'], to: 'accelerated' },
};

export function nextStatus(current: CovCertStatus, action: CovCertAction): CovCertStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: CovCertStatus): CovCertAction[] {
  const acts: CovCertAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [CovCertAction, typeof TRANSITIONS[CovCertAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — senior secured gets the TIGHTEST windows (closest monitoring).
export const SLA_MINUTES: Record<CovCertStatus, Record<CovCertTier, number>> = {
  certificate_due: {
    senior_secured: 30 * DAY,   // info-covenant delivery window
    mezzanine:      45 * DAY,
    subordinated:   60 * DAY,
  },
  certificate_submitted: {
    senior_secured: 2 * DAY,    // agent begins review
    mezzanine:      5 * DAY,
    subordinated:   10 * DAY,
  },
  under_review: {
    senior_secured: 5 * DAY,    // verify / flag
    mezzanine:      10 * DAY,
    subordinated:   15 * DAY,
  },
  ratios_verified: {
    senior_secured: 2 * DAY,    // confirm compliant or flag breach
    mezzanine:      3 * DAY,
    subordinated:   5 * DAY,
  },
  breach_identified: {
    senior_secured: 5 * DAY,    // act: waiver / cure / accelerate
    mezzanine:      10 * DAY,
    subordinated:   15 * DAY,
  },
  waiver_requested: {
    senior_secured: 10 * DAY,   // majority-lender waiver decision
    mezzanine:      15 * DAY,
    subordinated:   20 * DAY,
  },
  cure_period: {
    senior_secured: 30 * DAY,   // cure window
    mezzanine:      45 * DAY,
    subordinated:   60 * DAY,
  },
  compliant:       { senior_secured: 0, mezzanine: 0, subordinated: 0 },
  waiver_granted:  { senior_secured: 0, mezzanine: 0, subordinated: 0 },
  cured:           { senior_secured: 0, mezzanine: 0, subordinated: 0 },
  accelerated:     { senior_secured: 0, mezzanine: 0, subordinated: 0 },
};

export function slaDeadlineFor(status: CovCertStatus, tier: CovCertTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// SARB large-exposure / EP reportability applies to senior + mezzanine debt;
// subordinated breaches sit between junior lenders (less systemic).
const REPORTABLE_TIERS = new Set<CovCertTier>(['senior_secured', 'mezzanine']);

export function isReportableTier(tier: CovCertTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// A breach declaration is either a substantive financial-covenant breach or an
// information-covenant breach (failure to deliver the certificate).
export function isBreachDeclaration(action: CovCertAction): boolean {
  return action === 'flag_breach' || action === 'flag_non_submission';
}

// Reportability matrix:
//   - accelerate crosses for EVERY tier (declaring an event of default is
//     always notifiable — SARB large-exposure hard line)
//   - breach declarations cross for senior_secured + mezzanine only
export function crossesIntoRegulator(action: CovCertAction, tier: CovCertTier): boolean {
  if (action === 'accelerate') return true;
  if (isBreachDeclaration(action)) return REPORTABLE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: CovCertTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// Party that each action represents (contractual function), not the login role.
// The borrower delivers certificates + requests waivers; the facility agent
// reviews / verifies / requires cure; the lenders grant waivers + accelerate.
const ACTION_PARTY: Record<CovCertAction, 'borrower' | 'agent' | 'lender'> = {
  submit_certificate:  'borrower',
  request_waiver:      'borrower',
  begin_review:        'agent',
  verify_ratios:       'agent',
  confirm_compliant:   'agent',
  flag_breach:         'agent',
  flag_non_submission: 'agent',
  require_cure:        'agent',
  confirm_cured:       'agent',
  grant_waiver:        'lender',
  accelerate:          'lender',
};

export function partyForAction(action: CovCertAction): 'borrower' | 'agent' | 'lender' {
  return ACTION_PARTY[action];
}

// Borrower-side write set (guarded server-side via the borrower-write split).
const BORROWER_ACTIONS = new Set<CovCertAction>(['submit_certificate', 'request_waiver']);

export function isBorrowerAction(action: CovCertAction): boolean {
  return BORROWER_ACTIONS.has(action);
}
