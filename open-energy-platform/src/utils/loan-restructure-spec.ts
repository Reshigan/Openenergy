// ─────────────────────────────────────────────────────────────────────────
// Wave 108 — Lender Loan Restructure & Amendment-and-Extend (A&E) /
// Forbearance Chain.
//
// 11th Lender chain. Fills the STRUCTURED-FORBEARANCE gap between W38
// covenant certificate (point-in-time breach detection) + W86 DSCR
// monitoring (rolling coverage watch) and W45 default enforcement
// (acceleration / step-in). Without W108 every breach escalates straight
// to acceleration which kills bankability — restructure is the
// renegotiation runway every project-finance loan needs at least once
// in its life.
//
// Beats LMA "Amend & Extend" templates / Fitch RestructuringRating /
// S&P Recovery Ratings / Moody's Covenant Quality Index / Reorg Research
// RestructuringDB / Debtwire Restructuring / Crescendo Strategic Advisors
// / Houlihan Lokey Financial Restructuring / FTI Consulting Corporate
// Finance / AlixPartners Restructuring. Each surfaces restructure as
// a TRANSACTION (term-sheet + amendment doc); W108 turns it into a
// 12-state P6 chain with INVERTED SLA polarity, FLOOR-AT-MATERIAL tier
// overlay, 5-step authority ladder, 16-field LIVE battery with 3-bridge
// architecture (W38 covenant breach + W86 DSCR shortfall + W45 default
// escalation), IFRS 9 stage tracking, and signature regulator crossings.
//
// Standards: LMA "Amendment & Extension" template + Basel III IFRS 9
// Stage 2/3 trigger framework + SARB Banks Act §61 (forbearance
// disclosure to Prudential Authority) + Companies Act §155 (Compromise
// with creditors).
//
// Forward path (clean restructure to monitoring close):
//   trigger_event → preliminary_assessment → restructure_proposal_drafted
//     → lender_credit_committee_review → borrower_term_sheet_negotiation
//     → term_sheet_signed → legal_documentation_drafted
//     → consent_solicitation → signing → effective_date
//     → monitoring_period → completed (hard terminal)
//
// Branches:
//   credit_committee_review → restructure_proposal_drafted (revise_proposal)
//   credit_committee_review → rejected_by_committee (terminal — can
//                              re-enter at preliminary_assessment via
//                              trigger_restructure)
//   any pre-effective state → abandoned (terminal — borrower withdraws)
//   any state → escalated_to_default (terminal — feeds W45)
//
// Tier RE-DERIVED on every transition from facility_amount_zar with
// FLOOR-AT-MATERIAL on 5 flags:
//   - cross_border_syndicate
//   - sustainability_linked_loan
//   - public_bondholder_consent_required
//   - ifrs9_stage_3_at_trigger
//   - sarb_large_exposure_threshold
//
// 4 tiers:
//   minor    : <R50m / bilateral
//   standard : R50m-R500m
//   material : R500m-R5b OR 1 floor flag
//   systemic : >=R5b OR 2+ floor flags OR SARB large exposure OR
//              public bondholder consent
//
// INVERTED SLA polarity (systemic = LONGEST runway) — LMA consent
// solicitations + syndicate roadshows + SARB notifications take time;
// rushing breaches LMA syndicate fairness + SARB disclosure rules.
// SLA stored as HOURS (multi-week chain, not sub-second). Anchor on
// trigger_event:
//   minor    × trigger_event = 30d  =  720 hrs
//   standard × trigger_event = 60d  = 1440 hrs
//   material × trigger_event = 120d = 2880 hrs
//   systemic × trigger_event = 180d = 4320 hrs
//
// SIGNATURE regulator crossings (LMA "Amend & Extend" + Basel III IFRS 9
// + SARB Banks Act §61 + Companies Act §155):
//   submit_to_credit_committee → regulator EVERY tier on systemic OR
//                                ifrs9_stage_3_at_trigger=TRUE
//                                (Compromise trigger = SARB notification)
//   mark_effective             → regulator material+systemic (effective
//                                restructure of large facility = SARB
//                                large-exposure disclosure)
//   escalate_to_default        → regulator EVERY tier (W108 SIGNATURE —
//                                failed restructure feeding W45
//                                universally reportable; sister of
//                                W104 reject EVERY tier on
//                                regulator_relevant + W105 raise_dispute
//                                EVERY tier on HV_brp + W106
//                                impose_sanction EVERY tier on
//                                licence_revocation + W107 reject_order
//                                EVERY tier on credit_grade_below_B)
//   launch_consent_solicitation → regulator strategic only when
//                                  public_bondholder_consent_required
//   sla_breached               → material+systemic
//
// Write {admin, lender}. READ all 9 personas. actor_party split:
//   lender writes: start_preliminary_assessment, draft_proposal,
//     submit_to_credit_committee, approve_proposal, reject_proposal,
//     launch_consent_solicitation, draft_documentation, mark_effective,
//     monitor_compliance, complete_restructure, escalate_to_default
//   borrower writes: trigger_restructure, negotiate_term_sheet,
//     sign_term_sheet, sign_amendment, abandon, revise_proposal
//   syndicate-member writes: record_consent
// ─────────────────────────────────────────────────────────────────────────

export type LrsStatus =
  | 'trigger_event'
  | 'preliminary_assessment'
  | 'restructure_proposal_drafted'
  | 'lender_credit_committee_review'
  | 'borrower_term_sheet_negotiation'
  | 'term_sheet_signed'
  | 'legal_documentation_drafted'
  | 'consent_solicitation'
  | 'signing'
  | 'effective_date'
  | 'monitoring_period'
  | 'completed'
  | 'rejected_by_committee'
  | 'abandoned'
  | 'escalated_to_default';

export type LrsAction =
  | 'trigger_restructure'
  | 'start_preliminary_assessment'
  | 'draft_proposal'
  | 'submit_to_credit_committee'
  | 'approve_proposal'
  | 'reject_proposal'
  | 'revise_proposal'
  | 'negotiate_term_sheet'
  | 'sign_term_sheet'
  | 'draft_documentation'
  | 'launch_consent_solicitation'
  | 'record_consent'
  | 'sign_amendment'
  | 'mark_effective'
  | 'monitor_compliance'
  | 'complete_restructure'
  | 'abandon'
  | 'escalate_to_default';

export type LrsTier = 'minor' | 'standard' | 'material' | 'systemic';

export type LrsParty =
  | 'lender'
  | 'borrower'
  | 'syndicate_member';

export type LrsEvent =
  | 'loan_restructure_triggered'
  | 'loan_restructure_preliminary_assessment_started'
  | 'loan_restructure_proposal_drafted'
  | 'loan_restructure_submitted'
  | 'loan_restructure_approved'
  | 'loan_restructure_rejected'
  | 'loan_restructure_proposal_revised'
  | 'loan_restructure_term_sheet_negotiating'
  | 'loan_restructure_term_sheet_signed'
  | 'loan_restructure_documentation_drafted'
  | 'loan_restructure_consent_launched'
  | 'loan_restructure_consent_recorded'
  | 'loan_restructure_amendment_signed'
  | 'loan_restructure_effective'
  | 'loan_restructure_monitoring'
  | 'loan_restructure_completed'
  | 'loan_restructure_abandoned'
  | 'loan_restructure_escalated'
  | 'loan_restructure_sla_breached';

// Hard terminals reject every action. completed / rejected_by_committee
// / abandoned / escalated_to_default are all terminal — UI-treated as
// terminal on filters; rejected_by_committee can be RE-OPENED via a
// fresh trigger_restructure on the same facility (a new case), but
// from this row's perspective it cannot transition further.
const HARD_TERMINALS = new Set<LrsStatus>([
  'completed',
  'rejected_by_committee',
  'abandoned',
  'escalated_to_default',
]);

// UI terminals — flags rows that operator no longer actions.
const UI_TERMINALS = new Set<LrsStatus>([
  'completed',
  'rejected_by_committee',
  'abandoned',
  'escalated_to_default',
]);

export function isTerminal(s: LrsStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: LrsStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// States from which escalate_to_default + abandon can fire.
const PRE_EFFECTIVE_STATES: LrsStatus[] = [
  'trigger_event',
  'preliminary_assessment',
  'restructure_proposal_drafted',
  'lender_credit_committee_review',
  'borrower_term_sheet_negotiation',
  'term_sheet_signed',
  'legal_documentation_drafted',
  'consent_solicitation',
  'signing',
];

// All non-terminal states (escalate_to_default fires from any active
// state — including effective_date + monitoring_period — because
// borrower can default during cure window).
const ALL_NON_TERMINAL: LrsStatus[] = [
  'trigger_event',
  'preliminary_assessment',
  'restructure_proposal_drafted',
  'lender_credit_committee_review',
  'borrower_term_sheet_negotiation',
  'term_sheet_signed',
  'legal_documentation_drafted',
  'consent_solicitation',
  'signing',
  'effective_date',
  'monitoring_period',
];

export const TRANSITIONS: Record<LrsAction, { from: LrsStatus[]; to: LrsStatus }> = {
  trigger_restructure:         { from: ['trigger_event'],                                  to: 'trigger_event' },
  start_preliminary_assessment:{ from: ['trigger_event'],                                  to: 'preliminary_assessment' },
  draft_proposal:              { from: ['preliminary_assessment'],                         to: 'restructure_proposal_drafted' },
  submit_to_credit_committee:  { from: ['restructure_proposal_drafted'],                   to: 'lender_credit_committee_review' },
  approve_proposal:            { from: ['lender_credit_committee_review'],                 to: 'borrower_term_sheet_negotiation' },
  reject_proposal:             { from: ['lender_credit_committee_review'],                 to: 'rejected_by_committee' },
  revise_proposal:             { from: ['lender_credit_committee_review'],                 to: 'restructure_proposal_drafted' },
  negotiate_term_sheet:        { from: ['borrower_term_sheet_negotiation'],                to: 'borrower_term_sheet_negotiation' },
  sign_term_sheet:             { from: ['borrower_term_sheet_negotiation'],                to: 'term_sheet_signed' },
  draft_documentation:         { from: ['term_sheet_signed'],                              to: 'legal_documentation_drafted' },
  launch_consent_solicitation: { from: ['legal_documentation_drafted'],                    to: 'consent_solicitation' },
  record_consent:              { from: ['consent_solicitation'],                           to: 'consent_solicitation' },
  sign_amendment:              { from: ['consent_solicitation'],                           to: 'signing' },
  mark_effective:              { from: ['signing'],                                        to: 'effective_date' },
  monitor_compliance:          { from: ['effective_date', 'monitoring_period'],            to: 'monitoring_period' },
  complete_restructure:        { from: ['monitoring_period'],                              to: 'completed' },
  abandon:                     { from: PRE_EFFECTIVE_STATES,                               to: 'abandoned' },
  escalate_to_default:         { from: ALL_NON_TERMINAL,                                   to: 'escalated_to_default' },
};

export function nextStatus(current: LrsStatus, action: LrsAction): LrsStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  // trigger_restructure is the create action — not a transition once entered.
  if (action === 'trigger_restructure' && current !== 'trigger_event') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: LrsStatus): LrsAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: LrsAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [LrsAction, typeof TRANSITIONS[LrsAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity — systemic gets LONGEST runway. Stored as HOURS.
// 0 means no SLA (terminal states).
const HOUR = 1;
const DAY = 24 * HOUR;

export const SLA_HOURS: Record<LrsStatus, Record<LrsTier, number>> = {
  trigger_event:                  { minor: 30 * DAY,  standard: 60 * DAY,  material: 120 * DAY, systemic: 180 * DAY },
  preliminary_assessment:         { minor: 10 * DAY,  standard: 20 * DAY,  material: 30 * DAY,  systemic: 45 * DAY },
  restructure_proposal_drafted:   { minor: 14 * DAY,  standard: 21 * DAY,  material: 30 * DAY,  systemic: 45 * DAY },
  lender_credit_committee_review: { minor: 7 * DAY,   standard: 14 * DAY,  material: 21 * DAY,  systemic: 30 * DAY },
  borrower_term_sheet_negotiation:{ minor: 14 * DAY,  standard: 21 * DAY,  material: 45 * DAY,  systemic: 60 * DAY },
  term_sheet_signed:              { minor: 7 * DAY,   standard: 14 * DAY,  material: 21 * DAY,  systemic: 30 * DAY },
  legal_documentation_drafted:    { minor: 14 * DAY,  standard: 21 * DAY,  material: 30 * DAY,  systemic: 45 * DAY },
  consent_solicitation:           { minor: 14 * DAY,  standard: 21 * DAY,  material: 30 * DAY,  systemic: 45 * DAY },
  signing:                        { minor: 7 * DAY,   standard: 14 * DAY,  material: 21 * DAY,  systemic: 30 * DAY },
  effective_date:                 { minor: 3 * DAY,   standard: 5 * DAY,   material: 7 * DAY,   systemic: 14 * DAY },
  monitoring_period:              { minor: 90 * DAY,  standard: 180 * DAY, material: 270 * DAY, systemic: 365 * DAY },
  completed:                      { minor: 0,         standard: 0,         material: 0,         systemic: 0 },
  rejected_by_committee:          { minor: 0,         standard: 0,         material: 0,         systemic: 0 },
  abandoned:                      { minor: 0,         standard: 0,         material: 0,         systemic: 0 },
  escalated_to_default:           { minor: 0,         standard: 0,         material: 0,         systemic: 0 },
};

export function slaWindowHours(status: LrsStatus, tier: LrsTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: LrsStatus, tier: LrsTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from facility_amount_zar.
//   minor    : <R50m
//   standard : R50m-R500m
//   material : R500m-R5b
//   systemic : >=R5b
export function tierForFacility(facilityZar: number | null | undefined): LrsTier {
  const v = Number(facilityZar ?? 0);
  if (!isFinite(v) || v < 0) return 'minor';
  if (v >= 5_000_000_000) return 'systemic';
  if (v >= 500_000_000)   return 'material';
  if (v >= 50_000_000)    return 'standard';
  return 'minor';
}

export interface LrsFloorFlags {
  cross_border_syndicate?: boolean | number | null;
  sustainability_linked_loan?: boolean | number | null;
  public_bondholder_consent_required?: boolean | number | null;
  ifrs9_stage_3_at_trigger?: boolean | number | null;
  sarb_large_exposure_threshold?: boolean | number | null;
}

export function countFloorFlags(args: LrsFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.cross_border_syndicate) +
    t(args.sustainability_linked_loan) +
    t(args.public_bondholder_consent_required) +
    t(args.ifrs9_stage_3_at_trigger) +
    t(args.sarb_large_exposure_threshold)
  );
}

// FLOOR-AT-MATERIAL on any one floor flag.
export function floorAtMaterial(args: LrsFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-SYSTEMIC on:
//   - 2+ floor flags
//   - public_bondholder_consent_required (LMA syndicate Compromise)
//   - sarb_large_exposure_threshold (SARB Banks Act §61 hard line)
export function floorAtSystemic(args: LrsFloorFlags): boolean {
  if (countFloorFlags(args) >= 2) return true;
  if (args.public_bondholder_consent_required) return true;
  if (args.sarb_large_exposure_threshold) return true;
  return false;
}

// Compose raw facility-tier + floor flags into effective tier.
export function effectiveTier(rawTier: LrsTier, flags: LrsFloorFlags): LrsTier {
  if (floorAtSystemic(flags)) return 'systemic';
  const count = countFloorFlags(flags);
  if (count === 1) {
    if (rawTier === 'minor' || rawTier === 'standard') return 'material';
    return rawTier;
  }
  return rawTier;
}

// Heavy tiers — where reportability + signature crossings attach.
const HEAVY_TIERS = new Set<LrsTier>(['material', 'systemic']);

export function isHeavyTier(tier: LrsTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: LrsTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// SIGNATURE regulator crossings.
export function crossesIntoRegulator(
  action: LrsAction,
  tier: LrsTier,
  args: {
    ifrs9_stage_3_at_trigger?: boolean | number | null;
    public_bondholder_consent_required?: boolean | number | null;
  },
): boolean {
  const ifrs9_3 = Boolean(args.ifrs9_stage_3_at_trigger);
  const pubBond = Boolean(args.public_bondholder_consent_required);

  // SIGNATURE: escalate_to_default crosses EVERY tier (failed restructure
  // feeding W45 — universally reportable, W108 hard line).
  if (action === 'escalate_to_default') return true;

  // submit_to_credit_committee crosses EVERY tier on systemic OR
  // ifrs9_stage_3_at_trigger (Compromise trigger).
  if (action === 'submit_to_credit_committee') {
    return tier === 'systemic' || ifrs9_3;
  }

  // mark_effective crosses material+systemic (SARB large-exposure
  // disclosure).
  if (action === 'mark_effective') {
    return HEAVY_TIERS.has(tier);
  }

  // launch_consent_solicitation crosses strategic only on public
  // bondholder consent.
  if (action === 'launch_consent_solicitation') {
    return pubBond;
  }

  return false;
}

// SLA-breach crosses regulator on material+systemic.
export function slaBreachCrossesIntoRegulator(tier: LrsTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// Party each action represents.
const ACTION_PARTY: Record<LrsAction, LrsParty> = {
  trigger_restructure:          'borrower',
  start_preliminary_assessment: 'lender',
  draft_proposal:               'lender',
  submit_to_credit_committee:   'lender',
  approve_proposal:             'lender',
  reject_proposal:              'lender',
  revise_proposal:              'borrower',
  negotiate_term_sheet:         'borrower',
  sign_term_sheet:              'borrower',
  draft_documentation:          'lender',
  launch_consent_solicitation:  'lender',
  record_consent:               'syndicate_member',
  sign_amendment:               'borrower',
  mark_effective:               'lender',
  monitor_compliance:           'lender',
  complete_restructure:         'lender',
  abandon:                      'borrower',
  escalate_to_default:          'lender',
};

export function partyForAction(action: LrsAction): LrsParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: LrsAction): LrsEvent | null {
  switch (action) {
    case 'trigger_restructure':          return 'loan_restructure_triggered';
    case 'start_preliminary_assessment': return 'loan_restructure_preliminary_assessment_started';
    case 'draft_proposal':               return 'loan_restructure_proposal_drafted';
    case 'submit_to_credit_committee':   return 'loan_restructure_submitted';
    case 'approve_proposal':             return 'loan_restructure_approved';
    case 'reject_proposal':              return 'loan_restructure_rejected';
    case 'revise_proposal':              return 'loan_restructure_proposal_revised';
    case 'negotiate_term_sheet':         return 'loan_restructure_term_sheet_negotiating';
    case 'sign_term_sheet':              return 'loan_restructure_term_sheet_signed';
    case 'draft_documentation':          return 'loan_restructure_documentation_drafted';
    case 'launch_consent_solicitation':  return 'loan_restructure_consent_launched';
    case 'record_consent':               return 'loan_restructure_consent_recorded';
    case 'sign_amendment':               return 'loan_restructure_amendment_signed';
    case 'mark_effective':               return 'loan_restructure_effective';
    case 'monitor_compliance':           return 'loan_restructure_monitoring';
    case 'complete_restructure':         return 'loan_restructure_completed';
    case 'abandon':                      return 'loan_restructure_abandoned';
    case 'escalate_to_default':          return 'loan_restructure_escalated';
  }
}

// ─── LIVE battery (16-field decoration) ─────────────────────────────────

// Restructure completeness index 0-130. Components:
//   preliminary_assessment   10
//   proposal_drafted         10
//   credit_committee_review  10
//   term_sheet_signed        15
//   documentation_drafted    10
//   consent_launched         10
//   consent_majority_passed  15 (consent_majority_pct >= threshold)
//   amendment_signed         15
//   effective                15
//   monitoring               10
//   first_cure_period_clean  10 (no cure event within first monitoring period)
// Capped at 130.
export function restructureCompletenessIndex(args: {
  preliminary_assessment?: boolean | number | null;
  proposal_drafted?: boolean | number | null;
  credit_committee_review?: boolean | number | null;
  term_sheet_signed?: boolean | number | null;
  documentation_drafted?: boolean | number | null;
  consent_launched?: boolean | number | null;
  consent_majority_passed?: boolean | number | null;
  amendment_signed?: boolean | number | null;
  effective?: boolean | number | null;
  monitoring?: boolean | number | null;
  first_cure_period_clean?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.preliminary_assessment)   * 10;
  score += t(args.proposal_drafted)         * 10;
  score += t(args.credit_committee_review)  * 10;
  score += t(args.term_sheet_signed)        * 15;
  score += t(args.documentation_drafted)    * 10;
  score += t(args.consent_launched)         * 10;
  score += t(args.consent_majority_passed)  * 15;
  score += t(args.amendment_signed)         * 15;
  score += t(args.effective)                * 15;
  score += t(args.monitoring)               * 10;
  score += t(args.first_cure_period_clean)  * 10;
  if (score > 130) score = 130;
  return score;
}

// Consent threshold pct per LMA amendment severity.
//   simple majority   : 50%
//   special majority  : 66.7%
//   super majority    : 75%
//   unanimity         : 100%
export type LrsConsentSeverity =
  | 'simple_majority'
  | 'special_majority'
  | 'super_majority'
  | 'unanimity';

export function consentThresholdPct(severity: LrsConsentSeverity): number {
  switch (severity) {
    case 'simple_majority':   return 50;
    case 'special_majority':  return 66.7;
    case 'super_majority':    return 75;
    case 'unanimity':         return 100;
  }
}

// Consent majority pct from consented count / syndicate size.
export function consentMajorityPct(
  consented: number | null | undefined,
  syndicateSize: number | null | undefined,
): number {
  const c = Number(consented ?? 0);
  const s = Number(syndicateSize ?? 0);
  if (s <= 0) return 0;
  return Math.round((c / s) * 10000) / 100;
}

// Days to consent deadline. Negative when past.
export function daysToConsentDeadline(
  consentDeadlineAt: string | Date | null | undefined,
  now: Date,
): number | null {
  if (!consentDeadlineAt) return null;
  const t = new Date(consentDeadlineAt);
  if (isNaN(t.getTime())) return null;
  const ms = t.getTime() - now.getTime();
  return Math.round(ms / (24 * 3600 * 1000));
}

// SLA hours remaining. Negative when past.
export function slaHoursRemaining(
  status: LrsStatus,
  tier: LrsTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

// Urgency band — critical / high / medium / low.
export type LrsUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(
  tier: LrsTier,
  slaHoursLeft: number,
): LrsUrgency {
  if (slaHoursLeft < 0) return 'critical';
  // Threshold derived from tier — systemic gets longer thresholds.
  if (tier === 'systemic') {
    if (slaHoursLeft < 7 * 24)   return 'critical';
    if (slaHoursLeft < 30 * 24)  return 'high';
    if (slaHoursLeft < 90 * 24)  return 'medium';
    return 'low';
  }
  if (tier === 'material') {
    if (slaHoursLeft < 3 * 24)   return 'critical';
    if (slaHoursLeft < 14 * 24)  return 'high';
    if (slaHoursLeft < 45 * 24)  return 'medium';
    return 'low';
  }
  if (tier === 'standard') {
    if (slaHoursLeft < 2 * 24)   return 'critical';
    if (slaHoursLeft < 7 * 24)   return 'high';
    if (slaHoursLeft < 21 * 24)  return 'medium';
    return 'low';
  }
  // minor
  if (slaHoursLeft < 1 * 24)   return 'critical';
  if (slaHoursLeft < 3 * 24)   return 'high';
  if (slaHoursLeft < 10 * 24)  return 'medium';
  return 'low';
}

// 5-step authority ladder driven by effective tier.
export type LrsAuthority =
  | 'relationship_manager'
  | 'credit_committee'
  | 'portfolio_director'
  | 'CRO'
  | 'board_credit_subcommittee';

export function authorityRequired(tier: LrsTier): LrsAuthority {
  switch (tier) {
    case 'minor':    return 'relationship_manager';
    case 'standard': return 'credit_committee';
    case 'material': return 'portfolio_director';
    case 'systemic': return 'CRO';
  }
}

// Board sub-committee authority requested when both systemic tier
// AND public bondholder consent or SARB large exposure are in play.
export function boardEscalationRequired(
  tier: LrsTier,
  args: { public_bondholder_consent_required?: boolean | number | null; sarb_large_exposure_threshold?: boolean | number | null },
): boolean {
  if (tier !== 'systemic') return false;
  return Boolean(args.public_bondholder_consent_required) || Boolean(args.sarb_large_exposure_threshold);
}

// Regulator filing window hours.
export function regulatorFilingWindowHours(tier: LrsTier): number {
  switch (tier) {
    case 'systemic': return 24;
    case 'material': return 72;
    case 'standard': return 168;
    case 'minor':    return 240;
  }
}

// Bridge flag: row links upstream to W38 covenant certificate chain
// (this restructure was triggered by a covenant breach).
export function bridgesToCovenantCertificateChain(
  covenantBreachRef: string | null | undefined,
): boolean {
  return !!covenantBreachRef;
}

// Bridge flag: row links upstream to W86 DSCR monitoring chain
// (this restructure was triggered by a DSCR shortfall).
export function bridgesToDscrMonitoringChain(
  dscrShortfallRef: string | null | undefined,
): boolean {
  return !!dscrShortfallRef;
}

// Bridge flag: row links downstream to W45 default chain (restructure
// escalated to default — feeds the enforcement chain).
export function bridgesToDefaultChain(
  status: LrsStatus,
  defaultChainRef: string | null | undefined,
): boolean {
  if (status === 'escalated_to_default') return true;
  return !!defaultChainRef;
}

// IFRS 9 stage tracking — Stage 1 (performing) / 2 (significant
// increase in credit risk) / 3 (credit-impaired). Stage 3 forces FLOOR
// at material per Basel III IFRS 9.
export type Ifrs9Stage = 1 | 2 | 3;

export function ifrs9StageAtTrigger(
  ifrs9_stage_3_at_trigger: boolean | number | null | undefined,
  was_on_watch_at_trigger: boolean | number | null | undefined,
): Ifrs9Stage {
  if (ifrs9_stage_3_at_trigger) return 3;
  if (was_on_watch_at_trigger) return 2;
  return 1;
}

// Proposed relief quantum ZAR — composite of forbearance period months
// × debt service per month + principal reschedule amount + maturity
// extension months × debt service.
export function proposedReliefZar(args: {
  forbearance_period_months?: number | null;
  principal_reschedule_zar?: number | null;
  maturity_extension_months?: number | null;
  debt_service_per_month_zar?: number | null;
}): number {
  const fp = Number(args.forbearance_period_months ?? 0);
  const pr = Number(args.principal_reschedule_zar ?? 0);
  const me = Number(args.maturity_extension_months ?? 0);
  const ds = Number(args.debt_service_per_month_zar ?? 0);
  if (!isFinite(fp) || !isFinite(pr) || !isFinite(me) || !isFinite(ds)) return 0;
  return fp * ds + pr + me * ds;
}

// Principal reschedule percentage of facility.
export function principalReschedulePct(
  principalReschedule: number | null | undefined,
  facilityZar: number | null | undefined,
): number {
  const p = Number(principalReschedule ?? 0);
  const f = Number(facilityZar ?? 0);
  if (f <= 0) return 0;
  return Math.round((p / f) * 10000) / 100;
}
