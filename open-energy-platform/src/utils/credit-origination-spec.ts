// ─────────────────────────────────────────────────────────────────────────
// Wave 53 — Lender Credit Facility Origination & Credit Approval chain (P6)
//
// National Credit Act 34 of 2005 (responsible-lending / affordability) + Banks
// Act 94 of 1990 + the Basel III credit-risk framework + the SARB large-exposure
// framework (Reg 28 / D4 large-exposure returns) + an LMA-style facility
// agreement. This is the FRONT-END of the project-finance lifecycle: the
// credit-approval gate a borrower passes BEFORE any money is committed. A
// prospective borrower applies for a facility; the lender screens it (eligibility
// / KYC / NCA affordability), runs a full credit assessment (financial model,
// due diligence, security), refers it to the credit committee, which either
// approves, approves with conditions, refers it back for more work, or declines;
// once approved the lender issues the facility agreement, the borrower satisfies
// the conditions precedent, and the lender activates the facility — at which
// point it becomes available to draw.
//
// Sits UPSTREAM of every other Lender chain — it CREATES the facility the rest of
// the lifecycle then governs:
//   - [[project-wave21-drawdown-chain]] draws against the activated facility
//   - [[project-wave30-disbursement-chain]] reconciles use-of-proceeds
//   - [[project-wave38-covenant-certificate-chain]] monitors covenant compliance
//   - [[project-wave6-lender-portal]] dunning works arrears on the live facility
//   - [[project-wave45-loan-default-chain]] enforces on default
// Origination decides WHETHER to lend + ON WHAT TERMS; the rest govern the live
// facility. A `facility_available` terminal here is the precondition for a W21
// drawdown.
//
//   application_received → screening → credit_assessment → committee_review
//     → approved → agreement_issued → cp_satisfied → facility_available
//
// Conditional-approval loop:
//   committee_review → conditions_pending → approved   (borrower satisfies conditions)
// Referral loop (committee wants more analysis):
//   committee_review → referred_back → credit_assessment
// Decline (any pre-approval review state):
//   screening|credit_assessment|committee_review|referred_back|conditions_pending → declined
// Early withdraw (applicant, any non-terminal pre-activation state):
//   application_received|screening|credit_assessment|committee_review|referred_back
//     |conditions_pending|approved|agreement_issued|cp_satisfied → withdrawn
//
// Tiers (facility size — drive SLA windows + large-exposure reportability):
//   small     — < R50m         (SME / bridge; lightest process, LEAST time)
//   medium    — R50m – < R250m  (mid-market)
//   large     — R250m – < R1bn  (single project finance)
//   major     — R1bn – < R5bn   (large project / syndicate lead; large exposure)
//   systemic  — >= R5bn         (national-scale; MOST diligence, MOST time)
//
// SLA matrix is INVERTED — the bigger the facility, the MORE time every window
// allows (a R5bn syndicated project warrants extensive due diligence, modelling
// and committee scrutiny; a R30m bridge is quick). Same flavour as the INVERTED
// licence-application / renewal / tariff-determination SLAs; the opposite of the
// URGENT loan-default / curtailment SLAs.
//
// Reportability (a lender-native chain that surfaces its large-exposure decisions
// onto the SARB large-exposure / prudential oversight queue — same mechanism as
// W21 drawdown's senior-approval crossing and W45's write-off crossing):
//   - activate crosses for large-exposure tiers (major + systemic) — a large
//     exposure landing on the book is a notifiable prudential event (the W53
//     signature: the act of MAKING THE FACILITY LIVE is what is reportable, not
//     the approval decision)
//   - decline crosses for the systemic tier only (declining a national-scale
//     facility is itself a material market signal)
//   - SLA breaches cross for large-exposure tiers (major + systemic)
//
// actor_party (applicant / lender) is derived from the ACTION, not the JWT role —
// same audit-attribution model as W45 loan-default / W49 licence-application. The
// write split is two-party: the applicant supplies info to satisfy conditions /
// satisfy CPs / withdraw; the lender drives screening, assessment, committee,
// issuance, activation and decline. isApplicantAction guards the applicant-write
// set server-side.
// ─────────────────────────────────────────────────────────────────────────

export type CreditFacilityStatus =
  | 'application_received'
  | 'screening'
  | 'credit_assessment'
  | 'committee_review'
  | 'referred_back'
  | 'conditions_pending'
  | 'approved'
  | 'agreement_issued'
  | 'cp_satisfied'
  | 'facility_available'
  | 'declined'
  | 'withdrawn';

export type CreditFacilityAction =
  | 'screen'
  | 'assess'
  | 'refer_committee'
  | 'refer_back'
  | 'approve'
  | 'approve_with_conditions'
  | 'satisfy_conditions'
  | 'issue_agreement'
  | 'satisfy_cp'
  | 'activate'
  | 'decline'
  | 'withdraw';

export type CreditFacilityTier = 'small' | 'medium' | 'large' | 'major' | 'systemic';

export type CreditFacilityEvent =
  | 'credit_origination.screening'
  | 'credit_origination.credit_assessment'
  | 'credit_origination.committee_review'
  | 'credit_origination.referred_back'
  | 'credit_origination.conditions_pending'
  | 'credit_origination.approved'
  | 'credit_origination.agreement_issued'
  | 'credit_origination.cp_satisfied'
  | 'credit_origination.facility_available'
  | 'credit_origination.declined'
  | 'credit_origination.withdrawn'
  | 'credit_origination.sla_breached';

const TERMINALS = new Set<CreditFacilityStatus>(['facility_available', 'declined', 'withdrawn']);

export function isTerminal(s: CreditFacilityStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<CreditFacilityAction, { from: CreditFacilityStatus[]; to: CreditFacilityStatus }> = {
  screen:                  { from: ['application_received'],                                            to: 'screening' },
  assess:                  { from: ['screening', 'referred_back'],                                      to: 'credit_assessment' },
  refer_committee:         { from: ['credit_assessment'],                                               to: 'committee_review' },
  refer_back:              { from: ['committee_review'],                                                to: 'referred_back' },
  approve:                 { from: ['committee_review'],                                                to: 'approved' },
  approve_with_conditions: { from: ['committee_review'],                                                to: 'conditions_pending' },
  satisfy_conditions:      { from: ['conditions_pending'],                                              to: 'approved' },
  issue_agreement:         { from: ['approved'],                                                        to: 'agreement_issued' },
  satisfy_cp:              { from: ['agreement_issued'],                                                to: 'cp_satisfied' },
  activate:                { from: ['cp_satisfied'],                                                    to: 'facility_available' },
  decline:                 { from: ['screening', 'credit_assessment', 'committee_review', 'referred_back', 'conditions_pending'], to: 'declined' },
  withdraw:                { from: ['application_received', 'screening', 'credit_assessment', 'committee_review', 'referred_back', 'conditions_pending', 'approved', 'agreement_issued', 'cp_satisfied'], to: 'withdrawn' },
};

export function nextStatus(current: CreditFacilityStatus, action: CreditFacilityAction): CreditFacilityStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: CreditFacilityStatus): CreditFacilityAction[] {
  const acts: CreditFacilityAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [CreditFacilityAction, typeof TRANSITIONS[CreditFacilityAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const WITHDRAWABLE = new Set<CreditFacilityStatus>([
  'application_received', 'screening', 'credit_assessment', 'committee_review', 'referred_back',
  'conditions_pending', 'approved', 'agreement_issued', 'cp_satisfied',
]);

export function isWithdrawable(s: CreditFacilityStatus): boolean {
  return WITHDRAWABLE.has(s);
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED matrix — the bigger the facility, the MORE time every window allows
// (a R5bn syndicated project warrants extensive due diligence + modelling +
// committee scrutiny; a R30m bridge is quick). Strictly increasing across tiers.
export const SLA_MINUTES: Record<CreditFacilityStatus, Record<CreditFacilityTier, number>> = {
  application_received: {
    small:     2 * DAY,   // acknowledge + begin screening
    medium:    3 * DAY,
    large:     5 * DAY,
    major:     7 * DAY,
    systemic: 10 * DAY,
  },
  screening: {
    small:     5 * DAY,   // eligibility / KYC / NCA affordability screen
    medium:    7 * DAY,
    large:    10 * DAY,
    major:    14 * DAY,
    systemic: 21 * DAY,
  },
  credit_assessment: {
    small:    10 * DAY,   // full credit analysis / financial model / DD / security
    medium:   15 * DAY,
    large:    21 * DAY,
    major:    30 * DAY,
    systemic: 45 * DAY,
  },
  committee_review: {
    small:     5 * DAY,   // credit committee decision
    medium:    7 * DAY,
    large:    10 * DAY,
    major:    14 * DAY,
    systemic: 21 * DAY,
  },
  referred_back: {
    small:     7 * DAY,   // re-analysis window after committee referral
    medium:   10 * DAY,
    large:    14 * DAY,
    major:    21 * DAY,
    systemic: 30 * DAY,
  },
  conditions_pending: {
    small:    14 * DAY,   // borrower satisfies conditions of approval
    medium:   21 * DAY,
    large:    30 * DAY,
    major:    45 * DAY,
    systemic: 60 * DAY,
  },
  approved: {
    small:     5 * DAY,   // issue the facility agreement
    medium:    7 * DAY,
    large:    10 * DAY,
    major:    14 * DAY,
    systemic: 21 * DAY,
  },
  agreement_issued: {
    small:    21 * DAY,   // borrower satisfies conditions precedent (CPs)
    medium:   30 * DAY,
    large:    45 * DAY,
    major:    60 * DAY,
    systemic: 90 * DAY,
  },
  cp_satisfied: {
    small:     3 * DAY,   // lender activates / makes the facility available
    medium:    5 * DAY,
    large:     7 * DAY,
    major:    10 * DAY,
    systemic: 14 * DAY,
  },
  facility_available: { small: 0, medium: 0, large: 0, major: 0, systemic: 0 },
  declined:           { small: 0, medium: 0, large: 0, major: 0, systemic: 0 },
  withdrawn:          { small: 0, medium: 0, large: 0, major: 0, systemic: 0 },
};

export function slaDeadlineFor(status: CreditFacilityStatus, tier: CreditFacilityTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

export function slaWindowMinutes(status: CreditFacilityStatus, tier: CreditFacilityTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

// Facility-size tier from the facility limit in millions of ZAR.
//   small < R50m ; medium < R250m ; large < R1bn ; major < R5bn ; systemic >= R5bn
export function tierForFacilityZarM(zarM: number): CreditFacilityTier {
  if (zarM < 50) return 'small';
  if (zarM < 250) return 'medium';
  if (zarM < 1000) return 'large';
  if (zarM < 5000) return 'major';
  return 'systemic';
}

// SARB large-exposure / prudential reportability applies to the large-exposure
// tiers (major + systemic); smaller facilities are administrative book entries.
const LARGE_EXPOSURE_TIERS = new Set<CreditFacilityTier>(['major', 'systemic']);

export function isLargeExposureTier(tier: CreditFacilityTier): boolean {
  return LARGE_EXPOSURE_TIERS.has(tier);
}

// Reportability matrix:
//   - activate crosses for large-exposure tiers (major + systemic) — making the
//     facility live puts a large exposure on the book (the W53 signature)
//   - decline crosses for systemic only (declining a national-scale facility is a
//     material market signal)
export function crossesIntoRegulator(action: CreditFacilityAction, tier: CreditFacilityTier): boolean {
  if (action === 'activate') return LARGE_EXPOSURE_TIERS.has(tier);
  if (action === 'decline') return tier === 'systemic';
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: CreditFacilityTier): boolean {
  return LARGE_EXPOSURE_TIERS.has(tier);
}

// Party that each action represents (origination function), not the login role.
// The applicant satisfies conditions / CPs and may withdraw; the lender drives
// screening, assessment, committee, issuance, activation and decline.
const ACTION_PARTY: Record<CreditFacilityAction, 'applicant' | 'lender'> = {
  satisfy_conditions:      'applicant',
  satisfy_cp:              'applicant',
  withdraw:                'applicant',
  screen:                  'lender',
  assess:                  'lender',
  refer_committee:         'lender',
  refer_back:              'lender',
  approve:                 'lender',
  approve_with_conditions: 'lender',
  issue_agreement:         'lender',
  activate:                'lender',
  decline:                 'lender',
};

export function partyForAction(action: CreditFacilityAction): 'applicant' | 'lender' {
  return ACTION_PARTY[action];
}

// Applicant-side write set (guarded server-side via the applicant-write split).
const APPLICANT_ACTIONS = new Set<CreditFacilityAction>(['satisfy_conditions', 'satisfy_cp', 'withdraw']);

export function isApplicantAction(action: CreditFacilityAction): boolean {
  return APPLICANT_ACTIONS.has(action);
}
