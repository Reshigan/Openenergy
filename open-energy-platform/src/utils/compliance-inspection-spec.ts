// ─────────────────────────────────────────────────────────────────────────
// Wave 40 — Regulator Compliance Inspection & Enforcement chain (P6)
//
// NERSA ERA 2006 §10 (monitoring + compliance) + §34/§35 enforcement powers.
// This is the regulator's PROACTIVE, own-initiative enforcement arm: NERSA
// schedules a compliance inspection of a licensee (routine, complaint-driven,
// incident-driven, or thematic), conducts it, drafts and issues findings, may
// issue a compliance directive requiring remediation, verifies the remediation,
// and closes the matter — or escalates to a financial penalty / sanction with a
// statutory appeal route to the NERSA Tribunal.
//
// This is the ACTIVE ENFORCEMENT complement to the regulator's two existing
// chains: the reactive intake/triage of [[project-wave31-disposition-chain]]
// (incoming complaints + cross-wave escalations) and the periodic
// [[project-wave33-licence-renewal-chain]] (licence lifecycle). Disposition
// routes what comes IN; this chain is what the regulator initiates OUT.
//
//   inspection_scheduled → inspection_in_progress → findings_drafted
//     → findings_issued → directive_issued → remediation_underway
//     → remediation_verified → compliant_closed
//
// Clean-inspection short-circuit:
//   inspection_in_progress|findings_drafted → compliant_closed (no contraventions)
//
// Enforcement branch:
//   findings_issued|directive_issued|remediation_underway → penalty_imposed
//   penalty_imposed → enforcement_closed
//   penalty_imposed|directive_issued → appealed → enforcement_closed (Tribunal)
//   (early) inspection_scheduled|inspection_in_progress|findings_drafted → withdrawn
//
// Tiers (contravention severity — drive SLA windows + reportability):
//   critical — safety / security-of-supply contravention; fastest regulator action
//   serious  — material licence-condition breach; mid
//   minor    — administrative / reporting contravention; lightest
//
// SLA matrix is URGENT — the more severe the contravention, the TIGHTER every
// window (the regulator must move fastest on a critical safety/supply breach).
// Same flavour as [[project-wave34-load-curtailment-chain]] /
// [[project-wave38-covenant-certificate-chain]]; the opposite of the INVERTED
// disposition/licence-renewal SLAs.
//
// Reportability (escalates to the NERSA Council oversight queue / public
// enforcement register via the regulator inbox — regulator-native chains still
// surface their significant decisions, same as W31/W33):
//   - lodge_appeal crosses for EVERY tier (any appeal lands on the Tribunal
//     docket — universal)
//   - impose_penalty crosses for critical + serious (Council enforcement
//     oversight); minor administrative penalties handled at officer level
//   - SLA breaches cross for critical + serious
//
// actor_party (officer / respondent) is derived from the ACTION, not the JWT
// role — same model as W38/W39. The regulator officer drives the inspection +
// enforcement machinery; the respondent licensee begins remediation and lodges
// any appeal. Two-party split write guards the respondent-write set server-side.
// ─────────────────────────────────────────────────────────────────────────

export type ComplianceInspectionStatus =
  | 'inspection_scheduled'
  | 'inspection_in_progress'
  | 'findings_drafted'
  | 'findings_issued'
  | 'directive_issued'
  | 'remediation_underway'
  | 'remediation_verified'
  | 'penalty_imposed'
  | 'appealed'
  | 'compliant_closed'
  | 'enforcement_closed'
  | 'withdrawn';

export type ComplianceInspectionAction =
  | 'begin_inspection'
  | 'draft_findings'
  | 'close_no_findings'
  | 'issue_findings'
  | 'issue_directive'
  | 'begin_remediation'
  | 'verify_remediation'
  | 'close_compliant'
  | 'impose_penalty'
  | 'lodge_appeal'
  | 'resolve_appeal'
  | 'close_enforcement'
  | 'withdraw';

export type ComplianceInspectionTier = 'critical' | 'serious' | 'minor';

export type ComplianceInspectionEvent =
  | 'compliance_inspection.inspection_in_progress'
  | 'compliance_inspection.findings_drafted'
  | 'compliance_inspection.findings_issued'
  | 'compliance_inspection.directive_issued'
  | 'compliance_inspection.remediation_underway'
  | 'compliance_inspection.remediation_verified'
  | 'compliance_inspection.penalty_imposed'
  | 'compliance_inspection.appealed'
  | 'compliance_inspection.compliant_closed'
  | 'compliance_inspection.enforcement_closed'
  | 'compliance_inspection.withdrawn'
  | 'compliance_inspection.sla_breached';

const TERMINALS = new Set<ComplianceInspectionStatus>(['compliant_closed', 'enforcement_closed', 'withdrawn']);

export function isTerminal(s: ComplianceInspectionStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<ComplianceInspectionAction, { from: ComplianceInspectionStatus[]; to: ComplianceInspectionStatus }> = {
  begin_inspection:   { from: ['inspection_scheduled'],                                          to: 'inspection_in_progress' },
  draft_findings:     { from: ['inspection_in_progress'],                                        to: 'findings_drafted' },
  close_no_findings:  { from: ['inspection_in_progress', 'findings_drafted'],                    to: 'compliant_closed' },
  issue_findings:     { from: ['findings_drafted'],                                              to: 'findings_issued' },
  issue_directive:    { from: ['findings_issued'],                                               to: 'directive_issued' },
  begin_remediation:  { from: ['directive_issued'],                                              to: 'remediation_underway' },
  verify_remediation: { from: ['remediation_underway'],                                          to: 'remediation_verified' },
  close_compliant:    { from: ['remediation_verified'],                                          to: 'compliant_closed' },
  impose_penalty:     { from: ['findings_issued', 'directive_issued', 'remediation_underway'],   to: 'penalty_imposed' },
  lodge_appeal:       { from: ['penalty_imposed', 'directive_issued'],                           to: 'appealed' },
  resolve_appeal:     { from: ['appealed'],                                                      to: 'enforcement_closed' },
  close_enforcement:  { from: ['penalty_imposed'],                                               to: 'enforcement_closed' },
  withdraw:           { from: ['inspection_scheduled', 'inspection_in_progress', 'findings_drafted'], to: 'withdrawn' },
};

export function nextStatus(current: ComplianceInspectionStatus, action: ComplianceInspectionAction): ComplianceInspectionStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: ComplianceInspectionStatus): ComplianceInspectionAction[] {
  const acts: ComplianceInspectionAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [ComplianceInspectionAction, typeof TRANSITIONS[ComplianceInspectionAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — critical contravention = TIGHTEST window at every stage.
export const SLA_MINUTES: Record<ComplianceInspectionStatus, Record<ComplianceInspectionTier, number>> = {
  inspection_scheduled: {
    critical: 2 * DAY,    // begin the inspection
    serious:  5 * DAY,
    minor:   10 * DAY,
  },
  inspection_in_progress: {
    critical: 5 * DAY,    // draft findings
    serious: 10 * DAY,
    minor:   20 * DAY,
  },
  findings_drafted: {
    critical: 3 * DAY,    // issue findings to the licensee
    serious:  5 * DAY,
    minor:   10 * DAY,
  },
  findings_issued: {
    critical: 5 * DAY,    // issue directive / decide enforcement
    serious: 10 * DAY,
    minor:   20 * DAY,
  },
  directive_issued: {
    critical: 5 * DAY,    // respondent must begin remediation
    serious: 15 * DAY,
    minor:   30 * DAY,
  },
  remediation_underway: {
    critical: 30 * DAY,   // remediation window (still tightest for critical)
    serious:  60 * DAY,
    minor:    90 * DAY,
  },
  remediation_verified: {
    critical: 5 * DAY,    // close out the matter
    serious: 10 * DAY,
    minor:   15 * DAY,
  },
  penalty_imposed: {
    critical: 14 * DAY,   // statutory appeal window / close enforcement
    serious:  21 * DAY,
    minor:    30 * DAY,
  },
  appealed: {
    critical: 60 * DAY,   // Tribunal determination (critical prioritised)
    serious:  90 * DAY,
    minor:   120 * DAY,
  },
  compliant_closed:   { critical: 0, serious: 0, minor: 0 },
  enforcement_closed: { critical: 0, serious: 0, minor: 0 },
  withdrawn:          { critical: 0, serious: 0, minor: 0 },
};

export function slaDeadlineFor(status: ComplianceInspectionStatus, tier: ComplianceInspectionTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Council-oversight reportability applies to critical + serious contraventions;
// minor administrative matters are handled at officer level.
const REPORTABLE_TIERS = new Set<ComplianceInspectionTier>(['critical', 'serious']);

export function isReportableTier(tier: ComplianceInspectionTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// A penalty/sanction is the formal enforcement escalation.
export function isPenaltyDecision(action: ComplianceInspectionAction): boolean {
  return action === 'impose_penalty';
}

// Reportability matrix:
//   - lodge_appeal crosses for EVERY tier (Tribunal docket — universal)
//   - impose_penalty crosses for critical + serious (Council enforcement oversight)
export function crossesIntoRegulator(action: ComplianceInspectionAction, tier: ComplianceInspectionTier): boolean {
  if (action === 'lodge_appeal') return true;
  if (isPenaltyDecision(action)) return REPORTABLE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: ComplianceInspectionTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// Party that each action represents (regulatory function), not the login role.
// The regulator officer drives the inspection + enforcement machinery; the
// respondent licensee begins remediation and lodges any appeal.
const ACTION_PARTY: Record<ComplianceInspectionAction, 'officer' | 'respondent'> = {
  begin_inspection:   'officer',
  draft_findings:     'officer',
  close_no_findings:  'officer',
  issue_findings:     'officer',
  issue_directive:    'officer',
  verify_remediation: 'officer',
  close_compliant:    'officer',
  impose_penalty:     'officer',
  resolve_appeal:     'officer',
  close_enforcement:  'officer',
  withdraw:           'officer',
  begin_remediation:  'respondent',
  lodge_appeal:       'respondent',
};

export function partyForAction(action: ComplianceInspectionAction): 'officer' | 'respondent' {
  return ACTION_PARTY[action];
}

// Respondent-side write set (guarded server-side via the respondent-write split).
const RESPONDENT_ACTIONS = new Set<ComplianceInspectionAction>(['begin_remediation', 'lodge_appeal']);

export function isRespondentAction(action: ComplianceInspectionAction): boolean {
  return RESPONDENT_ACTIONS.has(action);
}
