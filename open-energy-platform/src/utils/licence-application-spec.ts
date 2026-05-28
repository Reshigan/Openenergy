// ─────────────────────────────────────────────────────────────────────────
// Wave 49 — Regulator Initial Licence Application & Adjudication chain (P6)
//
// NERSA licensing under the Electricity Regulation Act 4 of 2006 §§8–11: the
// front-end grant of a NEW licence to operate a generation, transmission,
// distribution, trading or import/export facility. A new entrant files a
// licence application; NERSA logs it, checks completeness (§9 application
// requirements), may request additional information, accepts it for processing,
// runs the §10 public-participation process, performs the technical/financial
// evaluation, refers it to the Energy Regulator (Council) for decision, and
// either grants (then issues) the licence or refuses it — while the applicant
// may withdraw, or a non-responsive application may lapse.
//
// This is the ENTRY gate to the regulated market and the front-end of the
// licence lifecycle. It pairs with the regulator's existing chains:
//   - [[project-wave33-licence-renewal-chain]] renews / amends an EXISTING
//     licence (this grants the FIRST one — distinct: renewal presumes a holder)
//   - [[project-wave31-disposition-chain]] triages compliance-notice intake
//   - [[project-wave40-compliance-inspection-chain]] enforces licence conditions
//   - [[project-wave43-tariff-determination-chain]] sets WHAT a holder may charge
// Initial licensing decides WHO may enter; renewal decides WHO may continue;
// tariff decides WHAT they charge; inspection enforces HOW they operate.
//
//   application_received → completeness_review → accepted → public_participation
//     → technical_evaluation → council_decision → licence_granted → licence_issued
//
// Information-gap loop:
//   completeness_review → additional_info_requested → completeness_review
// Refusal:
//   council_decision → refused
// Early withdraw (applicant):
//   application_received|completeness_review|additional_info_requested
//     |accepted|public_participation → withdrawn
// Lapse (non-responsive to an info request):
//   additional_info_requested → lapsed
//
// Classes (licence significance — drive SLA windows + reportability):
//   major_licence    — transmission / national / large generation (≥100MW) /
//                      import-export; mandatory public hearings, MOST diligence,
//                      MOST time
//   standard_licence — distribution / trading / mid generation; written
//                      public-comment process; mid
//   minor_licence    — small-scale generation / SSEG-registration-style; light
//                      process, LEAST time
//
// SLA matrix is INVERTED — the bigger / higher-stakes the licence, the MORE time
// every window allows (a national transmission grant warrants extensive
// evaluation + hearings; a small-scale generation registration is quick). Same
// flavour as the INVERTED renewal/disposition/tariff-determination SLAs; the
// opposite of the URGENT compliance-inspection / load-curtailment SLAs.
//
// Reportability (a regulator-native chain that still surfaces its significant
// market-entry decisions onto the NERSA Council oversight queue / public licence
// register — same mechanism as W31/W33/W40/W43):
//   - refuse crosses for EVERY class (denying market entry is always a material
//     regulatory decision — universal, the W49 signature)
//   - grant crosses for the major class only (a major licence grant surfaces to
//     Council oversight + the Government Gazette; standard/minor grants are
//     administrative register entries)
//   - SLA breaches cross for material classes (major + standard) — the §10
//     statutory timeline is itself reportable
//
// actor_party (applicant / registry / evaluator / council) is derived from the
// ACTION, not the JWT role — same audit-attribution model as W33/W37/W43. The
// write split is two-party: the applicant files / supplies info / withdraws; the
// regulator drives everything else. isApplicantAction guards the applicant-write
// set server-side.
// ─────────────────────────────────────────────────────────────────────────

export type LicenceApplicationStatus =
  | 'application_received'
  | 'completeness_review'
  | 'additional_info_requested'
  | 'accepted'
  | 'public_participation'
  | 'technical_evaluation'
  | 'council_decision'
  | 'licence_granted'
  | 'licence_issued'
  | 'refused'
  | 'withdrawn'
  | 'lapsed';

export type LicenceApplicationAction =
  | 'begin_review'
  | 'request_info'
  | 'submit_info'
  | 'accept_application'
  | 'open_participation'
  | 'begin_evaluation'
  | 'refer_to_council'
  | 'grant_licence'
  | 'issue_licence'
  | 'refuse_licence'
  | 'withdraw'
  | 'lapse';

export type LicenceApplicationClass = 'major_licence' | 'standard_licence' | 'minor_licence';

export type LicenceApplicationEvent =
  | 'licence_application.completeness_review'
  | 'licence_application.additional_info_requested'
  | 'licence_application.accepted'
  | 'licence_application.public_participation'
  | 'licence_application.technical_evaluation'
  | 'licence_application.council_decision'
  | 'licence_application.licence_granted'
  | 'licence_application.licence_issued'
  | 'licence_application.refused'
  | 'licence_application.withdrawn'
  | 'licence_application.lapsed'
  | 'licence_application.sla_breached';

const TERMINALS = new Set<LicenceApplicationStatus>(['licence_issued', 'refused', 'withdrawn', 'lapsed']);

export function isTerminal(s: LicenceApplicationStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<LicenceApplicationAction, { from: LicenceApplicationStatus[]; to: LicenceApplicationStatus }> = {
  begin_review:       { from: ['application_received'],                                          to: 'completeness_review' },
  request_info:       { from: ['completeness_review'],                                           to: 'additional_info_requested' },
  submit_info:        { from: ['additional_info_requested'],                                     to: 'completeness_review' },
  accept_application: { from: ['completeness_review'],                                           to: 'accepted' },
  open_participation: { from: ['accepted'],                                                      to: 'public_participation' },
  begin_evaluation:   { from: ['public_participation'],                                          to: 'technical_evaluation' },
  refer_to_council:   { from: ['technical_evaluation'],                                          to: 'council_decision' },
  grant_licence:      { from: ['council_decision'],                                              to: 'licence_granted' },
  issue_licence:      { from: ['licence_granted'],                                               to: 'licence_issued' },
  refuse_licence:     { from: ['council_decision'],                                              to: 'refused' },
  withdraw:           { from: ['application_received', 'completeness_review', 'additional_info_requested', 'accepted', 'public_participation'], to: 'withdrawn' },
  lapse:              { from: ['additional_info_requested'],                                     to: 'lapsed' },
};

export function nextStatus(current: LicenceApplicationStatus, action: LicenceApplicationAction): LicenceApplicationStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: LicenceApplicationStatus): LicenceApplicationAction[] {
  const acts: LicenceApplicationAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [LicenceApplicationAction, typeof TRANSITIONS[LicenceApplicationAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const WITHDRAWABLE = new Set<LicenceApplicationStatus>([
  'application_received', 'completeness_review', 'additional_info_requested', 'accepted', 'public_participation',
]);

export function isWithdrawable(s: LicenceApplicationStatus): boolean {
  return WITHDRAWABLE.has(s);
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED matrix — the bigger / higher-stakes the licence, the MORE time every
// window allows (a national transmission grant warrants extensive evaluation +
// public hearings; a small-scale generation registration is quick).
export const SLA_MINUTES: Record<LicenceApplicationStatus, Record<LicenceApplicationClass, number>> = {
  application_received: {
    major_licence:    10 * DAY,   // begin the completeness review
    standard_licence:  5 * DAY,
    minor_licence:     3 * DAY,
  },
  completeness_review: {
    major_licence:    30 * DAY,   // accept / request info / proceed
    standard_licence: 20 * DAY,
    minor_licence:    10 * DAY,
  },
  additional_info_requested: {
    major_licence:    60 * DAY,   // applicant response window (else lapse)
    standard_licence: 45 * DAY,
    minor_licence:    30 * DAY,
  },
  accepted: {
    major_licence:    14 * DAY,   // open the public process
    standard_licence: 10 * DAY,
    minor_licence:     5 * DAY,
  },
  public_participation: {
    major_licence:    60 * DAY,   // public hearings / comment window
    standard_licence: 30 * DAY,
    minor_licence:    14 * DAY,
  },
  technical_evaluation: {
    major_licence:    90 * DAY,   // technical + financial + grid-impact evaluation
    standard_licence: 60 * DAY,
    minor_licence:    30 * DAY,
  },
  council_decision: {
    major_licence:    30 * DAY,   // Energy Regulator (Council) decision
    standard_licence: 21 * DAY,
    minor_licence:    14 * DAY,
  },
  licence_granted: {
    major_licence:    14 * DAY,   // issue the licence document + register entry
    standard_licence: 10 * DAY,
    minor_licence:     7 * DAY,
  },
  licence_issued: { major_licence: 0, standard_licence: 0, minor_licence: 0 },
  refused:        { major_licence: 0, standard_licence: 0, minor_licence: 0 },
  withdrawn:      { major_licence: 0, standard_licence: 0, minor_licence: 0 },
  lapsed:         { major_licence: 0, standard_licence: 0, minor_licence: 0 },
};

export function slaDeadlineFor(status: LicenceApplicationStatus, klass: LicenceApplicationClass, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[klass];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

export function slaWindowMinutes(status: LicenceApplicationStatus, klass: LicenceApplicationClass): number {
  return SLA_MINUTES[status]?.[klass] ?? 0;
}

// Council-oversight reportability applies to material licence classes
// (major + standard); minor (small-scale) grants are administrative.
const MATERIAL_CLASSES = new Set<LicenceApplicationClass>(['major_licence', 'standard_licence']);

export function isMaterialClass(klass: LicenceApplicationClass): boolean {
  return MATERIAL_CLASSES.has(klass);
}

// ERA §10 mandatory public-participation process applies to material licences;
// small-scale (minor) applications follow a light written-notice path.
export function mandatoryPublicParticipation(klass: LicenceApplicationClass): boolean {
  return MATERIAL_CLASSES.has(klass);
}

// Reportability matrix:
//   - refuse crosses for EVERY class (denying market entry — universal, W49 signature)
//   - grant crosses for the major class only (Council oversight + Gazette)
export function crossesIntoRegulator(action: LicenceApplicationAction, klass: LicenceApplicationClass): boolean {
  if (action === 'refuse_licence') return true;
  if (action === 'grant_licence') return klass === 'major_licence';
  return false;
}

export function slaBreachCrossesIntoRegulator(klass: LicenceApplicationClass): boolean {
  return MATERIAL_CLASSES.has(klass);
}

// Party that each action represents (regulatory function), not the login role.
// The applicant files / supplies additional information / withdraws; NERSA's
// registry handles completeness + public-process logistics + issuance + lapse;
// evaluators run the technical/financial evaluation; the Energy Regulator
// (council) decides grant / refusal.
const ACTION_PARTY: Record<LicenceApplicationAction, 'applicant' | 'registry' | 'evaluator' | 'council'> = {
  begin_review:       'registry',
  request_info:       'registry',
  submit_info:        'applicant',
  accept_application: 'registry',
  open_participation: 'registry',
  begin_evaluation:   'evaluator',
  refer_to_council:   'evaluator',
  grant_licence:      'council',
  issue_licence:      'registry',
  refuse_licence:     'council',
  withdraw:           'applicant',
  lapse:              'registry',
};

export function partyForAction(action: LicenceApplicationAction): 'applicant' | 'registry' | 'evaluator' | 'council' {
  return ACTION_PARTY[action];
}

// Applicant-side write set (guarded server-side via the applicant-write split).
const APPLICANT_ACTIONS = new Set<LicenceApplicationAction>(['submit_info', 'withdraw']);

export function isApplicantAction(action: LicenceApplicationAction): boolean {
  return APPLICANT_ACTIONS.has(action);
}
