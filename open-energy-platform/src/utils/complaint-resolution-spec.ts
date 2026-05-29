// ─────────────────────────────────────────────────────────────────────────
// Wave 66 — Regulator Complaints & Dispute Resolution chain (P6)
//
// NERSA acting as the quasi-judicial dispute forum under the Electricity
// Regulation Act 4 of 2006 section 30 ("Disputes"), the National Energy
// Regulator Act 40 of 2004, and NERSA's Complaints and Compliance Procedures.
// An external party (an end-customer, a licensee, an IPP, an offtaker) lodges a
// complaint or a dispute against a licensee. NERSA registers it, screens it for
// admissibility / jurisdiction, FIRST refers it to the respondent licensee for
// internal resolution (the standard first-level step), and — if that fails —
// escalates to a formal investigation, attempts mediation / conciliation,
// convenes an adjudication hearing, issues a binding ruling, monitors the remedy
// to compliance, and closes it resolved. A complaint may instead be dismissed
// (no jurisdiction / no merit), appealed (judicial review of NERSA's decision),
// or withdrawn by the complainant.
//
// This is DISTINCT from the regulator's other chains by INTAKE SOURCE:
//   - [[project-wave31-disposition-chain]] triages matters CROSS-REFERRED into
//     the NERSA inbox from every other wave (internal compliance intake).
//   - [[project-wave40-compliance-inspection-chain]] is a PROACTIVE inspection
//     NERSA itself initiates against a licensee.
//   - W66 is REACTIVE: an EXTERNAL party brings a complaint/dispute and NERSA
//     adjudicates it as a forum. Disposition disposes of NERSA's own intake;
//     W66 resolves a third party's grievance.
//
// Forward path (happy):
//   complaint_lodged → admissibility_review → referred_to_licensee
//     → under_investigation → mediation → adjudication_hearing
//     → ruling_issued → remedy_monitoring → resolved
// First-level resolution (licensee fixes it without NERSA adjudicating):
//   referred_to_licensee → resolved (settle_at_licensee)
// Mediation short-circuit straight to a hearing (mediation fails / is skipped):
//   under_investigation → adjudication_hearing (convene_hearing)
// Dismissal (no jurisdiction / no merit):
//   admissibility_review | under_investigation | adjudication_hearing → dismissed
// Appeal (judicial review — W66 SIGNATURE, always reportable):
//   ruling_issued | remedy_monitoring → appealed
// Withdraw (complainant withdraws before adjudication concludes):
//   complaint_lodged | admissibility_review | referred_to_licensee
//     | under_investigation | mediation → withdrawn
//
// Tiers (by number of affected parties / customers — drive SLA + reportability):
//   minor       — < 10      (an individual billing / connection dispute)
//   moderate    — < 100     (a small cluster)
//   significant — < 1 000   (a feeder / suburb)
//   major       — < 10 000  (a municipality-scale grievance)
//   systemic    — ≥ 10 000  (a province / national class complaint)
//
// SLA matrix is URGENT — the LARGER the affected population, the TIGHTER every
// window. A systemic supply-quality complaint affecting tens of thousands of
// customers demands a rapid NERSA turnaround; an individual billing dispute can
// run the longer administrative windows. Same flavour as the URGENT
// compliance-inspection / load-curtailment SLAs; the OPPOSITE of the INVERTED
// licensing / renewal / tariff-determination / SSEG-registration SLAs.
//
// Reportability (a regulator-native chain that still surfaces its material
// determinations onto the NERSA Council oversight queue — same mechanism as
// W31/W33/W40/W43/W49/W57):
//   - lodge_appeal crosses for EVERY tier (a judicial review of a NERSA decision
//     is always a material regulatory event — the W66 signature, mirroring how
//     W49 refuse / W57 refer are universal)
//   - issue_ruling crosses for the major + systemic tiers (a binding ruling on a
//     large-population dispute is material; an individual ruling is routine)
//   - dismiss crosses for the systemic tier only (dismissing a national-scale
//     class complaint is sensitive)
//   - SLA breaches cross for the major + systemic tiers
//
// actor_party (complainant / respondent / adjudicator) is derived from the
// ACTION, not the JWT role — same audit-attribution model as W31/W40/W57. The
// write is SINGLE-PARTY regulator-owned ({admin, regulator}); NERSA records the
// complainant's withdrawal/appeal and the respondent's first-level settlement on
// their behalf. Adjudication is performed by NERSA, not a separate committee.
// ─────────────────────────────────────────────────────────────────────────

export type ComplaintStatus =
  | 'complaint_lodged'
  | 'admissibility_review'
  | 'referred_to_licensee'
  | 'under_investigation'
  | 'mediation'
  | 'adjudication_hearing'
  | 'ruling_issued'
  | 'remedy_monitoring'
  | 'resolved'
  | 'dismissed'
  | 'appealed'
  | 'withdrawn';

export type ComplaintAction =
  | 'screen_admissibility'
  | 'refer_to_licensee'
  | 'settle_at_licensee'
  | 'escalate_investigation'
  | 'initiate_mediation'
  | 'convene_hearing'
  | 'issue_ruling'
  | 'monitor_remedy'
  | 'confirm_compliance'
  | 'dismiss'
  | 'lodge_appeal'
  | 'withdraw';

export type ComplaintTier = 'minor' | 'moderate' | 'significant' | 'major' | 'systemic';

export type ComplaintParty = 'complainant' | 'respondent' | 'adjudicator';

export type ComplaintEvent =
  | 'regulator_complaint.admissibility_review'
  | 'regulator_complaint.referred'
  | 'regulator_complaint.escalated'
  | 'regulator_complaint.mediating'
  | 'regulator_complaint.hearing_convened'
  | 'regulator_complaint.ruling_issued'
  | 'regulator_complaint.remedy_monitoring'
  | 'regulator_complaint.resolved'
  | 'regulator_complaint.dismissed'
  | 'regulator_complaint.appealed'
  | 'regulator_complaint.withdrawn'
  | 'regulator_complaint.sla_breached';

const TERMINALS = new Set<ComplaintStatus>([
  'resolved', 'dismissed', 'appealed', 'withdrawn',
]);

export function isTerminal(s: ComplaintStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<ComplaintAction, { from: ComplaintStatus[]; to: ComplaintStatus }> = {
  screen_admissibility:   { from: ['complaint_lodged'],                                            to: 'admissibility_review' },
  refer_to_licensee:      { from: ['admissibility_review'],                                        to: 'referred_to_licensee' },
  settle_at_licensee:     { from: ['referred_to_licensee'],                                        to: 'resolved' },
  escalate_investigation: { from: ['referred_to_licensee'],                                        to: 'under_investigation' },
  initiate_mediation:     { from: ['under_investigation'],                                         to: 'mediation' },
  convene_hearing:        { from: ['mediation', 'under_investigation'],                            to: 'adjudication_hearing' },
  issue_ruling:           { from: ['adjudication_hearing'],                                        to: 'ruling_issued' },
  monitor_remedy:         { from: ['ruling_issued'],                                               to: 'remedy_monitoring' },
  confirm_compliance:     { from: ['remedy_monitoring'],                                           to: 'resolved' },
  dismiss:                { from: ['admissibility_review', 'under_investigation', 'adjudication_hearing'], to: 'dismissed' },
  lodge_appeal:           { from: ['ruling_issued', 'remedy_monitoring'],                          to: 'appealed' },
  withdraw:               { from: ['complaint_lodged', 'admissibility_review', 'referred_to_licensee', 'under_investigation', 'mediation'], to: 'withdrawn' },
};

export function nextStatus(current: ComplaintStatus, action: ComplaintAction): ComplaintStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: ComplaintStatus): ComplaintAction[] {
  const acts: ComplaintAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [ComplaintAction, typeof TRANSITIONS[ComplaintAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const WITHDRAWABLE = new Set<ComplaintStatus>([
  'complaint_lodged', 'admissibility_review', 'referred_to_licensee',
  'under_investigation', 'mediation',
]);

export function isWithdrawable(s: ComplaintStatus): boolean {
  return WITHDRAWABLE.has(s);
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LARGER the affected population, the TIGHTER every window.
// A systemic class complaint demands a rapid NERSA turnaround; an individual
// dispute runs the longer administrative windows.
export const SLA_MINUTES: Record<ComplaintStatus, Record<ComplaintTier, number>> = {
  complaint_lodged: {
    minor:    5 * DAY,    // screen admissibility
    moderate: 4 * DAY,
    significant: 3 * DAY,
    major:    2 * DAY,
    systemic: 1 * DAY,
  },
  admissibility_review: {
    minor:    7 * DAY,    // refer to licensee / dismiss
    moderate: 5 * DAY,
    significant: 4 * DAY,
    major:    3 * DAY,
    systemic: 2 * DAY,
  },
  referred_to_licensee: {
    minor:   30 * DAY,    // licensee first-level resolution window
    moderate: 21 * DAY,
    significant: 14 * DAY,
    major:   10 * DAY,
    systemic: 7 * DAY,
  },
  under_investigation: {
    minor:   30 * DAY,    // NERSA investigation
    moderate: 21 * DAY,
    significant: 14 * DAY,
    major:   10 * DAY,
    systemic: 7 * DAY,
  },
  mediation: {
    minor:   21 * DAY,    // mediation / conciliation
    moderate: 14 * DAY,
    significant: 10 * DAY,
    major:    7 * DAY,
    systemic: 5 * DAY,
  },
  adjudication_hearing: {
    minor:   30 * DAY,    // convene + hear + decide
    moderate: 21 * DAY,
    significant: 14 * DAY,
    major:   10 * DAY,
    systemic: 7 * DAY,
  },
  ruling_issued: {
    minor:   14 * DAY,    // move ruling into remedy monitoring
    moderate: 10 * DAY,
    significant: 7 * DAY,
    major:    5 * DAY,
    systemic: 3 * DAY,
  },
  remedy_monitoring: {
    minor:   30 * DAY,    // confirm the remedy was implemented
    moderate: 21 * DAY,
    significant: 14 * DAY,
    major:   10 * DAY,
    systemic: 7 * DAY,
  },
  resolved:  { minor: 0, moderate: 0, significant: 0, major: 0, systemic: 0 },
  dismissed: { minor: 0, moderate: 0, significant: 0, major: 0, systemic: 0 },
  appealed:  { minor: 0, moderate: 0, significant: 0, major: 0, systemic: 0 },
  withdrawn: { minor: 0, moderate: 0, significant: 0, major: 0, systemic: 0 },
};

export function slaDeadlineFor(status: ComplaintStatus, tier: ComplaintTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

export function slaWindowMinutes(status: ComplaintStatus, tier: ComplaintTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

// Affected-population tier. <10 minor / <100 moderate / <1000 significant /
// <10000 major / ≥10000 systemic.
export function tierForAffectedParties(count: number): ComplaintTier {
  if (count < 10) return 'minor';
  if (count < 100) return 'moderate';
  if (count < 1000) return 'significant';
  if (count < 10000) return 'major';
  return 'systemic';
}

// Material tiers for Council-oversight reportability.
const LARGE_TIERS = new Set<ComplaintTier>(['major', 'systemic']);

export function isLargeTier(tier: ComplaintTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportability matrix:
//   - lodge_appeal crosses for EVERY tier (judicial review of a NERSA decision —
//     universal, the W66 signature)
//   - issue_ruling crosses for the major + systemic tiers
//   - dismiss crosses for the systemic tier only
export function crossesIntoRegulator(action: ComplaintAction, tier: ComplaintTier): boolean {
  if (action === 'lodge_appeal') return true;
  if (action === 'issue_ruling') return LARGE_TIERS.has(tier);
  if (action === 'dismiss') return tier === 'systemic';
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: ComplaintTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Party that each action represents (procedural role), not the login role. The
// complainant withdraws / appeals; the respondent licensee settles the matter at
// first level; NERSA (adjudicator) drives screening, investigation, mediation,
// the hearing, the ruling, remedy monitoring, and dismissal.
const ACTION_PARTY: Record<ComplaintAction, ComplaintParty> = {
  screen_admissibility:   'adjudicator',
  refer_to_licensee:      'adjudicator',
  settle_at_licensee:     'respondent',
  escalate_investigation: 'adjudicator',
  initiate_mediation:     'adjudicator',
  convene_hearing:        'adjudicator',
  issue_ruling:           'adjudicator',
  monitor_remedy:         'adjudicator',
  confirm_compliance:     'adjudicator',
  dismiss:                'adjudicator',
  lodge_appeal:           'complainant',
  withdraw:               'complainant',
};

export function partyForAction(action: ComplaintAction): ComplaintParty {
  return ACTION_PARTY[action];
}
