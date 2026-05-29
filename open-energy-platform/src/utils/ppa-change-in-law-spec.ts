// ─────────────────────────────────────────────────────────────────────────
// Wave 78 — Offtaker PPA Change-in-Law / Qualifying-Change cost pass-through
// & relief chain
//
// Every PPA allocates the risk of a CHANGE IN LAW between the parties. When a
// statute, tax or regulation changes after financial close — a new carbon-tax
// rate, a NERSA Grid Code amendment, an environmental-licensing condition, an
// import duty on panels — the cost (or saving) has to be assessed against the
// PPA's "Qualifying Change in Law" definition and, if it qualifies, passed
// through via a tariff adjustment, a lump-sum, or a term extension.
//
// This is DISTINCT from [[project-wave39-tariff-indexation-chain]] (W39 is the
// scheduled CPI/PPI repricing of an UNCHANGED tariff). A change-in-law claim is
// a discrete, evidence-driven, often-contested event with its own lifecycle —
// most PPA platforms handle it as a manual contract amendment. W78 gives it a
// full audited state machine with materiality gating, INVERTED quantum SLA, an
// arbitration branch and NERSA visibility on tariff-affecting determinations.
//
// 12-state P6 lifecycle:
//   event_logged → eligibility_review → impact_assessment → claim_submitted
//     → counterparty_review → negotiation → determination_pending
//     → relief_granted → implemented                       (negotiated path)
//   ineligible:    eligibility_review → rejected
//   dispute-out:   counterparty_review → rejected          (counterparty disputes)
//   no-relief:     determination_pending → rejected
//   arbitration:   {counterparty_review, negotiation} → in_arbitration
//                    → relief_granted (award_relief) | rejected (award_no_relief)
//   withdraw:      any pre-relief operative state → withdrawn
//
// Tiers (5) by the relief quantum (cost impact) in ZAR millions:
//   minor <5 / moderate <25 / material <100 / major <500 / critical >=500
//
// SLA matrix is INVERTED — a larger-quantum change needs a deeper eligibility
// test, a fuller impact model, longer negotiation and a longer arbitration. The
// quantum anchors the windows (like [[project-wave32-take-or-pay-chain]] and
// [[project-wave70-rec-lifecycle-chain]]). Terminals carry no deadline.
//
// Reportability (the W78 signature):
//   - issue_determination / award_relief cross the regulator for the material+
//     tiers when the change is GOVERNMENTAL in origin (tax / regulatory /
//     statutory / discriminatory) — granting tariff-affecting relief off a
//     change in law is a NERSA price-visibility event. A purely commercial
//     "other" change does not cross on determination.
//   - refer_to_arbitration crosses for EVERY tier — a contested change-in-law
//     claim heading to arbitration is always reportable (the hard line).
//   - SLA breaches cross for major + critical only.
//
// Single-party write {admin, offtaker}: the offtaker's contract-management desk
// operates the chain. actor_party (claimant / counterparty / arbitrator) records
// the contractual function per step for audit texture, not the JWT role.
// ─────────────────────────────────────────────────────────────────────────

export type ChangeInLawStatus =
  | 'event_logged'
  | 'eligibility_review'
  | 'impact_assessment'
  | 'claim_submitted'
  | 'counterparty_review'
  | 'negotiation'
  | 'determination_pending'
  | 'in_arbitration'
  | 'relief_granted'
  | 'implemented'
  | 'rejected'
  | 'withdrawn';

export type ChangeInLawAction =
  | 'open_eligibility_review'
  | 'confirm_eligible'
  | 'reject_ineligible'
  | 'submit_claim'
  | 'acknowledge_claim'
  | 'enter_negotiation'
  | 'dispute_claim'
  | 'refer_to_arbitration'
  | 'reach_agreement'
  | 'issue_determination'
  | 'determine_no_relief'
  | 'award_relief'
  | 'award_no_relief'
  | 'implement_relief'
  | 'withdraw_claim';

export type ChangeInLawTier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

// The origin of the change — drives whether a granted determination is a
// regulator-visible (governmental) event.
export type ChangeType =
  | 'tax_change'
  | 'regulatory_change'
  | 'statutory_change'
  | 'discriminatory_change'
  | 'other_change';

// The relief mechanism a determination produces.
export type ReliefMechanism =
  | 'tariff_adjustment'
  | 'lump_sum'
  | 'term_extension'
  | 'combination'
  | 'no_relief';

export type ChangeInLawParty = 'claimant' | 'counterparty' | 'arbitrator';

export type ChangeInLawEvent =
  | 'ppa_change_in_law.eligibility_review'
  | 'ppa_change_in_law.impact_assessment'
  | 'ppa_change_in_law.claim_submitted'
  | 'ppa_change_in_law.counterparty_review'
  | 'ppa_change_in_law.negotiation'
  | 'ppa_change_in_law.determination_pending'
  | 'ppa_change_in_law.in_arbitration'
  | 'ppa_change_in_law.relief_granted'
  | 'ppa_change_in_law.implemented'
  | 'ppa_change_in_law.rejected'
  | 'ppa_change_in_law.withdrawn'
  | 'ppa_change_in_law.sla_breached';

const TERMINALS = new Set<ChangeInLawStatus>(['implemented', 'rejected', 'withdrawn']);

export function isTerminal(s: ChangeInLawStatus): boolean {
  return TERMINALS.has(s);
}

// withdraw is available from every pre-relief operative state. Once relief is
// GRANTED the claim proceeds to implementation; once IN ARBITRATION the
// arbitrator decides — neither can be unilaterally pulled.
const WITHDRAW_FROM = new Set<ChangeInLawStatus>([
  'event_logged', 'eligibility_review', 'impact_assessment', 'claim_submitted',
  'counterparty_review', 'negotiation', 'determination_pending',
]);

export function isCancellable(s: ChangeInLawStatus): boolean {
  return WITHDRAW_FROM.has(s);
}

export const TRANSITIONS: Record<ChangeInLawAction, { from: ChangeInLawStatus[]; to: ChangeInLawStatus }> = {
  open_eligibility_review: { from: ['event_logged'],                          to: 'eligibility_review' },
  confirm_eligible:        { from: ['eligibility_review'],                    to: 'impact_assessment' },
  reject_ineligible:       { from: ['eligibility_review'],                    to: 'rejected' },
  submit_claim:            { from: ['impact_assessment'],                     to: 'claim_submitted' },
  acknowledge_claim:       { from: ['claim_submitted'],                       to: 'counterparty_review' },
  enter_negotiation:       { from: ['counterparty_review'],                   to: 'negotiation' },
  dispute_claim:           { from: ['counterparty_review'],                   to: 'rejected' },
  refer_to_arbitration:    { from: ['counterparty_review', 'negotiation'],    to: 'in_arbitration' },
  reach_agreement:         { from: ['negotiation'],                           to: 'determination_pending' },
  issue_determination:     { from: ['determination_pending'],                 to: 'relief_granted' },
  determine_no_relief:     { from: ['determination_pending'],                 to: 'rejected' },
  award_relief:            { from: ['in_arbitration'],                        to: 'relief_granted' },
  award_no_relief:         { from: ['in_arbitration'],                        to: 'rejected' },
  implement_relief:        { from: ['relief_granted'],                        to: 'implemented' },
  withdraw_claim:          { from: [...WITHDRAW_FROM],                        to: 'withdrawn' },
};

export function nextStatus(current: ChangeInLawStatus, action: ChangeInLawAction): ChangeInLawStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: ChangeInLawStatus): ChangeInLawAction[] {
  const acts: ChangeInLawAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [ChangeInLawAction, typeof TRANSITIONS[ChangeInLawAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED matrix — a bigger-quantum change in law needs a deeper eligibility
// test, fuller impact model, longer negotiation and a longer arbitration.
// Windows strictly increase minor→critical for each graded state. Terminals 0.
export const SLA_MINUTES: Record<ChangeInLawStatus, Record<ChangeInLawTier, number>> = {
  event_logged: {
    minor: 2 * DAY, moderate: 3 * DAY, material: 5 * DAY, major: 7 * DAY, critical: 10 * DAY,
  },
  eligibility_review: {
    minor: 3 * DAY, moderate: 5 * DAY, material: 7 * DAY, major: 10 * DAY, critical: 14 * DAY,
  },
  impact_assessment: {
    minor: 5 * DAY, moderate: 7 * DAY, material: 10 * DAY, major: 15 * DAY, critical: 21 * DAY,
  },
  claim_submitted: {
    minor: 2 * DAY, moderate: 3 * DAY, material: 3 * DAY, major: 5 * DAY, critical: 5 * DAY,
  },
  counterparty_review: {
    minor: 5 * DAY, moderate: 7 * DAY, material: 10 * DAY, major: 14 * DAY, critical: 21 * DAY,
  },
  negotiation: {
    minor: 7 * DAY, moderate: 10 * DAY, material: 15 * DAY, major: 21 * DAY, critical: 30 * DAY,
  },
  determination_pending: {
    minor: 5 * DAY, moderate: 7 * DAY, material: 10 * DAY, major: 14 * DAY, critical: 21 * DAY,
  },
  in_arbitration: {
    minor: 30 * DAY, moderate: 45 * DAY, material: 60 * DAY, major: 90 * DAY, critical: 120 * DAY,
  },
  relief_granted: {
    minor: 7 * DAY, moderate: 10 * DAY, material: 14 * DAY, major: 21 * DAY, critical: 30 * DAY,
  },
  implemented: { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  rejected:    { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  withdrawn:   { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
};

export function slaWindowMinutes(status: ChangeInLawStatus, tier: ChangeInLawTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: ChangeInLawStatus, tier: ChangeInLawTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// 5 tiers by the relief quantum (cost impact of the change) in ZAR millions.
export function tierForQuantumZarM(amountZarM: number): ChangeInLawTier {
  if (amountZarM < 5) return 'minor';
  if (amountZarM < 25) return 'moderate';
  if (amountZarM < 100) return 'material';
  if (amountZarM < 500) return 'major';
  return 'critical';
}

const LARGE_TIERS = new Set<ChangeInLawTier>(['major', 'critical']);
const MATERIAL_PLUS = new Set<ChangeInLawTier>(['material', 'major', 'critical']);

export function isLargeTier(tier: ChangeInLawTier): boolean {
  return LARGE_TIERS.has(tier);
}

// A change is GOVERNMENTAL in origin (regulator-visible) unless it is a purely
// commercial "other" change.
const GOVERNMENTAL_CHANGES = new Set<ChangeType>([
  'tax_change', 'regulatory_change', 'statutory_change', 'discriminatory_change',
]);

export function isGovernmentalChange(changeType: ChangeType): boolean {
  return GOVERNMENTAL_CHANGES.has(changeType);
}

// Reportability matrix (the W78 signature):
//   - issue_determination / award_relief cross for the material+ tiers when the
//     change is governmental (tax / regulatory / statutory / discriminatory).
//   - refer_to_arbitration crosses for EVERY tier (contested → always reportable).
export function crossesIntoRegulator(
  action: ChangeInLawAction,
  tier: ChangeInLawTier,
  changeType: ChangeType,
): boolean {
  if (action === 'refer_to_arbitration') return true;
  if (action === 'issue_determination' || action === 'award_relief') {
    return isGovernmentalChange(changeType) && MATERIAL_PLUS.has(tier);
  }
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: ChangeInLawTier): boolean {
  return LARGE_TIERS.has(tier);
}

// A case NERSA tracks: a governmental change of material+ quantum.
export function isReportable(tier: ChangeInLawTier, changeType: ChangeType): boolean {
  return isGovernmentalChange(changeType) && MATERIAL_PLUS.has(tier);
}

// Party each action represents (contractual function), not the login role. The
// CLAIMANT (the affected party, often the generator) raises and prosecutes the
// claim; the COUNTERPARTY (the offtaker desk) reviews, negotiates and determines;
// an ARBITRATOR awards on a referred dispute.
const ACTION_PARTY: Record<ChangeInLawAction, ChangeInLawParty> = {
  open_eligibility_review: 'counterparty',
  confirm_eligible:        'counterparty',
  reject_ineligible:       'counterparty',
  submit_claim:            'claimant',
  acknowledge_claim:       'counterparty',
  enter_negotiation:       'counterparty',
  dispute_claim:           'counterparty',
  refer_to_arbitration:    'claimant',
  reach_agreement:         'claimant',
  issue_determination:     'counterparty',
  determine_no_relief:     'counterparty',
  award_relief:            'arbitrator',
  award_no_relief:         'arbitrator',
  implement_relief:        'counterparty',
  withdraw_claim:          'claimant',
};

export function partyForAction(action: ChangeInLawAction): ChangeInLawParty {
  return ACTION_PARTY[action];
}
