// ─────────────────────────────────────────────────────────────────────────
// Wave 43 — Regulator Tariff / Revenue (MYPD Price-Control) Determination chain (P6)
//
// NERSA ERA 2006 §15–§16 (price/tariff determination) + the Multi-Year Price
// Determination (MYPD) methodology + Regulatory Clearing Account (RCA). This is
// the regulator's single most consequential economic function: setting the
// allowed revenue and tariffs a licensee may charge. A licensee files a revenue
// application; NERSA checks it for completeness, runs public consultation /
// hearings, performs the revenue analysis (RAB × WACC + opex + RCA true-up),
// prepares a draft determination, tables it for the Energy Regulator (Council)
// to deliberate, issues the determination, and the tariff is implemented — or
// the application is rejected, the applicant requests reconsideration, or a
// court sets the determination aside and remits it back to the regulator.
//
// This is the ECONOMIC-REGULATION complement to the regulator's existing chains:
// the reactive intake/triage of [[project-wave31-disposition-chain]], the
// periodic [[project-wave33-licence-renewal-chain]] (the licence itself), and
// the proactive [[project-wave40-compliance-inspection-chain]] (enforcement).
// Renewal decides WHO may operate; this decides WHAT they may charge. Distinct
// from [[project-wave39-tariff-indexation-chain]], which is the contractual
// CPI escalation of an already-agreed PPA tariff between private parties — this
// is the upstream regulatory price-control determination that sets the cap.
//
//   application_received → completeness_review → public_consultation
//     → revenue_analysis → draft_determination → council_deliberation
//     → determination_issued → implemented
//
// Reconsideration branch:
//   determination_issued → reconsideration_requested → implemented | remitted
// Judicial-review set-aside:
//   determination_issued|reconsideration_requested → remitted (court remits back)
// Regulator rejection:
//   completeness_review|revenue_analysis → rejected
// Early withdraw:
//   application_received|completeness_review|public_consultation → withdrawn
//
// Classes (determination scope — drive SLA windows + reportability):
//   multi_year    — full MYPD multi-year revenue determination; most material,
//                   most diligence, MOST time
//   annual_tariff — annual tariff / RCA true-up; mid
//   sseg_feedin   — small-scale embedded generation feed-in tariff; lightest
//
// SLA matrix is INVERTED — the bigger/higher-stakes the determination, the MORE
// time every window allows (a full MYPD warrants extensive analysis + hearings;
// an SSEG feed-in schedule is comparatively quick). Same flavour as the INVERTED
// disposition/licence-renewal/procurement SLAs; the opposite of the URGENT
// compliance-inspection/load-curtailment SLAs.
//
// Reportability (a regulator-native chain that still surfaces its significant
// price decisions onto the NERSA Council oversight queue / public tariff
// register — same mechanism as W31/W33/W40):
//   - remit crosses for EVERY class (a court set-aside is a judicial event that
//     always lands on the Council oversight docket — universal)
//   - issue_determination crosses for material classes (multi_year + annual);
//     SSEG feed-in schedules are administrative
//   - reject crosses for material classes
//   - SLA breaches cross for material classes
//
// actor_party (applicant / registry / analyst / council / court) is derived from
// the ACTION, not the JWT role — same audit-attribution model as W37/W38/W39.
// The write split is two-party: the applicant licensee files / requests
// reconsideration / withdraws; the regulator drives everything else. isApplicantAction
// guards the applicant-write set server-side.
// ─────────────────────────────────────────────────────────────────────────

export type TariffDeterminationStatus =
  | 'application_received'
  | 'completeness_review'
  | 'public_consultation'
  | 'revenue_analysis'
  | 'draft_determination'
  | 'council_deliberation'
  | 'determination_issued'
  | 'reconsideration_requested'
  | 'implemented'
  | 'remitted'
  | 'rejected'
  | 'withdrawn';

export type TariffDeterminationAction =
  | 'begin_review'
  | 'open_consultation'
  | 'begin_analysis'
  | 'prepare_draft'
  | 'table_for_council'
  | 'issue_determination'
  | 'request_reconsideration'
  | 'implement'
  | 'remit'
  | 'reject'
  | 'withdraw';

export type TariffDeterminationClass = 'multi_year' | 'annual_tariff' | 'sseg_feedin';

export type TariffDeterminationEvent =
  | 'tariff_determination.completeness_review'
  | 'tariff_determination.public_consultation'
  | 'tariff_determination.revenue_analysis'
  | 'tariff_determination.draft_determination'
  | 'tariff_determination.council_deliberation'
  | 'tariff_determination.determination_issued'
  | 'tariff_determination.reconsideration_requested'
  | 'tariff_determination.implemented'
  | 'tariff_determination.remitted'
  | 'tariff_determination.rejected'
  | 'tariff_determination.withdrawn'
  | 'tariff_determination.sla_breached';

const TERMINALS = new Set<TariffDeterminationStatus>(['implemented', 'remitted', 'rejected', 'withdrawn']);

export function isTerminal(s: TariffDeterminationStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<TariffDeterminationAction, { from: TariffDeterminationStatus[]; to: TariffDeterminationStatus }> = {
  begin_review:            { from: ['application_received'],                                      to: 'completeness_review' },
  open_consultation:       { from: ['completeness_review'],                                      to: 'public_consultation' },
  begin_analysis:          { from: ['public_consultation'],                                      to: 'revenue_analysis' },
  prepare_draft:           { from: ['revenue_analysis'],                                         to: 'draft_determination' },
  table_for_council:       { from: ['draft_determination'],                                      to: 'council_deliberation' },
  issue_determination:     { from: ['council_deliberation'],                                     to: 'determination_issued' },
  request_reconsideration: { from: ['determination_issued'],                                     to: 'reconsideration_requested' },
  implement:               { from: ['determination_issued', 'reconsideration_requested'],        to: 'implemented' },
  remit:                   { from: ['determination_issued', 'reconsideration_requested'],        to: 'remitted' },
  reject:                  { from: ['completeness_review', 'revenue_analysis'],                  to: 'rejected' },
  withdraw:                { from: ['application_received', 'completeness_review', 'public_consultation'], to: 'withdrawn' },
};

export function nextStatus(current: TariffDeterminationStatus, action: TariffDeterminationAction): TariffDeterminationStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: TariffDeterminationStatus): TariffDeterminationAction[] {
  const acts: TariffDeterminationAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [TariffDeterminationAction, typeof TRANSITIONS[TariffDeterminationAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED matrix — the bigger/higher-stakes the determination, the MORE time
// every window allows (a full MYPD warrants extensive analysis + hearings).
export const SLA_MINUTES: Record<TariffDeterminationStatus, Record<TariffDeterminationClass, number>> = {
  application_received: {
    multi_year:    10 * DAY,   // begin the completeness review
    annual_tariff:  5 * DAY,
    sseg_feedin:    3 * DAY,
  },
  completeness_review: {
    multi_year:    30 * DAY,   // open consultation / reject incomplete
    annual_tariff: 15 * DAY,
    sseg_feedin:    7 * DAY,
  },
  public_consultation: {
    multi_year:    60 * DAY,   // public hearings window
    annual_tariff: 30 * DAY,
    sseg_feedin:   14 * DAY,
  },
  revenue_analysis: {
    multi_year:    90 * DAY,   // RAB × WACC + opex + RCA true-up analysis
    annual_tariff: 45 * DAY,
    sseg_feedin:   21 * DAY,
  },
  draft_determination: {
    multi_year:    30 * DAY,   // table the draft for council
    annual_tariff: 15 * DAY,
    sseg_feedin:    7 * DAY,
  },
  council_deliberation: {
    multi_year:    30 * DAY,   // Energy Regulator deliberation + decision
    annual_tariff: 21 * DAY,
    sseg_feedin:   14 * DAY,
  },
  determination_issued: {
    multi_year:    30 * DAY,   // implement / reconsideration window
    annual_tariff: 21 * DAY,
    sseg_feedin:   14 * DAY,
  },
  reconsideration_requested: {
    multi_year:    45 * DAY,   // reconsideration determination
    annual_tariff: 30 * DAY,
    sseg_feedin:   21 * DAY,
  },
  implemented: { multi_year: 0, annual_tariff: 0, sseg_feedin: 0 },
  remitted:    { multi_year: 0, annual_tariff: 0, sseg_feedin: 0 },
  rejected:    { multi_year: 0, annual_tariff: 0, sseg_feedin: 0 },
  withdrawn:   { multi_year: 0, annual_tariff: 0, sseg_feedin: 0 },
};

export function slaDeadlineFor(status: TariffDeterminationStatus, klass: TariffDeterminationClass, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[klass];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Council-oversight reportability applies to material determinations
// (multi_year + annual_tariff); SSEG feed-in schedules are administrative.
const REPORTABLE_CLASSES = new Set<TariffDeterminationClass>(['multi_year', 'annual_tariff']);

export function isReportableClass(klass: TariffDeterminationClass): boolean {
  return REPORTABLE_CLASSES.has(klass);
}

// A court set-aside is the judicial escalation that always surfaces.
export function isJudicialRemit(action: TariffDeterminationAction): boolean {
  return action === 'remit';
}

// Reportability matrix:
//   - remit crosses for EVERY class (court set-aside — universal)
//   - issue_determination crosses for material classes (Council oversight / public register)
//   - reject crosses for material classes
export function crossesIntoRegulator(action: TariffDeterminationAction, klass: TariffDeterminationClass): boolean {
  if (isJudicialRemit(action)) return true;
  if (action === 'issue_determination' || action === 'reject') return REPORTABLE_CLASSES.has(klass);
  return false;
}

export function slaBreachCrossesIntoRegulator(klass: TariffDeterminationClass): boolean {
  return REPORTABLE_CLASSES.has(klass);
}

// Party that each action represents (regulatory function), not the login role.
// The applicant licensee files / requests reconsideration / withdraws; NERSA's
// registry handles completeness + consultation logistics + gazetting; tariff
// analysts run the revenue analysis + draft; the Energy Regulator (council)
// deliberates + issues / rejects; a court remits a set-aside back.
const ACTION_PARTY: Record<TariffDeterminationAction, 'applicant' | 'registry' | 'analyst' | 'council' | 'court'> = {
  begin_review:            'registry',
  open_consultation:       'registry',
  begin_analysis:          'analyst',
  prepare_draft:           'analyst',
  table_for_council:       'analyst',
  issue_determination:     'council',
  reject:                  'council',
  implement:               'registry',
  request_reconsideration: 'applicant',
  withdraw:                'applicant',
  remit:                   'court',
};

export function partyForAction(action: TariffDeterminationAction): 'applicant' | 'registry' | 'analyst' | 'council' | 'court' {
  return ACTION_PARTY[action];
}

// Applicant-side write set (guarded server-side via the applicant-write split).
const APPLICANT_ACTIONS = new Set<TariffDeterminationAction>(['request_reconsideration', 'withdraw']);

export function isApplicantAction(action: TariffDeterminationAction): boolean {
  return APPLICANT_ACTIONS.has(action);
}
