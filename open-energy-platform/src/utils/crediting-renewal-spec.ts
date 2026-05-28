// ─────────────────────────────────────────────────────────────────────────
// Wave 56 — Carbon Crediting-Period Renewal & Baseline Reassessment chain (P6)
//
// Verra VCS Standard v4 (crediting period renewal + baseline reassessment at
// renewal) + Gold Standard for the Global Goals (crediting period renewal) +
// Paris Agreement Article 6.4 Mechanism (renewal of the crediting period by the
// Supervisory Body, with a baseline review each renewal — Dec. 3/CMA.3) + CDM
// legacy (renewable 7-year crediting period, max 3 renewals, baseline validity
// re-confirmed at each renewal) + DFFE DNA (the SA designated national authority).
//
// A registered carbon project does NOT issue credits forever on its original
// baseline. Its crediting period expires (commonly 7-10 years) and must be
// RENEWED to keep issuing. Renewal is NOT a rubber stamp: the standard re-derives
// the baseline against current data (updated grid emission factors, regulatory
// surplus, common-practice penetration), re-tests additionality, checks whether
// the methodology version is still valid, and has an independent validation /
// verification body (VVB) validate the renewed baseline before the standard's
// review body decides. The renewed baseline is typically LOWER than the original
// (correcting for a decarbonising grid / diffusion of the technology), which
// reduces the project's future issuance.
//
// This is to [[project-wave37-carbon-registration-chain]] (initial registration)
// what [[project-wave33-licence-renewal-chain]] is to
// [[project-wave49-licence-application-chain]] — the PERIODIC re-validation that
// complements the one-time front-end entry. It is distinct from
// [[project-wave11-carbon-mrv-chain]]: MRV verifies the actual reductions of a
// single monitoring period ("did you reduce X this period?"); THIS chain
// re-validates the project's eligibility to KEEP issuing under a renewed baseline
// for a whole new crediting period ("are you still additional, and what baseline
// applies going forward?"). The renewed baseline feeds every later MRV cycle, the
// retirement in [[project-wave17-carbon-retirement-chain]] and the tax-offset
// monetisation in [[project-wave48-carbon-offset-claim-chain]].
//
//   renewal_due → application_submitted → completeness_check
//     → baseline_reassessment → additionality_retest → vvb_validation
//     → standard_review → renewed                       (new crediting period)
//
// Revision loop (registry sends the dossier back for more information):
//   completeness_check → revision_requested → (resubmit) → completeness_check
//
// Branches:
//   refused   — standard_review denies renewal: the project can no longer issue
//               under this registration. [from standard_review]
//   withdrawn — proponent withdraws before the standard decides.
//               [from renewal_due | application_submitted | completeness_check | revision_requested]
//   lapsed    — the application window expired without a submission: the crediting
//               period ends with no renewal (TIME-DRIVEN, like W22 PPA auto-expiry
//               and W10 bond countdown). [from renewal_due]
//
// Tiers (5) by ANNUAL ISSUANCE volume (tCO2e / yr) — drive SLA + reportability:
//   minor <10k / moderate <100k / material <500k / major <2m / mega >=2m
//
// SLA matrix is INVERTED — the LARGER the annual issuance, the LONGER every
// window. A high-volume project's renewal warrants deeper baseline scrutiny and a
// longer VVB validation, so the bigger the project the more review time is
// allowed (same flavour as [[project-wave48-carbon-offset-claim-chain]] and
// [[project-wave43-tariff-determination-chain]]).
//
// Reportability — the W56 SIGNATURE is the unusual "an APPROVAL is reportable":
//   renew  crosses for EVERY tier when the reassessed baseline is cut by ≥30%
//          (a MATERIAL baseline downgrade is an environmental-integrity event the
//          DNA / Art-6.4 Supervisory Body wants to see — over-crediting was being
//          corrected — even though the renewal itself was granted). This is the
//          distinctive crossing: the happy-path terminal can itself cross.
//   refuse crosses for the large tiers (major + mega) — a refused renewal of a
//          high-volume project strands material issuance and is notifiable; small
//          project refusals are routine standard administration.
//   sla_breached crosses for the large tiers (major + mega).
//
// Single carbon-fund desk write {admin, carbon_fund} — the desk records the whole
// renewal lifecycle (same single-party model as every other carbon chain: W37 /
// W11 / W17 / W42 / W48). actor_party tags the contractual function performing
// each step (proponent / registry / vvb) for audit attribution only, NOT access.
// ─────────────────────────────────────────────────────────────────────────

export type RenewalStatus =
  | 'renewal_due'
  | 'application_submitted'
  | 'completeness_check'
  | 'revision_requested'
  | 'baseline_reassessment'
  | 'additionality_retest'
  | 'vvb_validation'
  | 'standard_review'
  | 'renewed'
  | 'refused'
  | 'withdrawn'
  | 'lapsed';

export type RenewalAction =
  | 'submit_application'
  | 'check_completeness'
  | 'request_revision'
  | 'resubmit'
  | 'begin_baseline_reassessment'
  | 'complete_baseline'
  | 'complete_additionality'
  | 'validate'
  | 'renew'
  | 'refuse'
  | 'withdraw'
  | 'lapse';

export type RenewalTier = 'minor' | 'moderate' | 'material' | 'major' | 'mega';

export type RenewalParty = 'proponent' | 'registry' | 'vvb';

export type RenewalEvent =
  | 'crediting_renewal.application_submitted'
  | 'crediting_renewal.completeness_check'
  | 'crediting_renewal.revision_requested'
  | 'crediting_renewal.baseline_reassessment'
  | 'crediting_renewal.additionality_retest'
  | 'crediting_renewal.vvb_validation'
  | 'crediting_renewal.standard_review'
  | 'crediting_renewal.renewed'
  | 'crediting_renewal.refused'
  | 'crediting_renewal.withdrawn'
  | 'crediting_renewal.lapsed'
  | 'crediting_renewal.sla_breached';

const TERMINALS = new Set<RenewalStatus>(['renewed', 'refused', 'withdrawn', 'lapsed']);

const WITHDRAWABLE = new Set<RenewalStatus>([
  'renewal_due',
  'application_submitted',
  'completeness_check',
  'revision_requested',
]);

export function isTerminal(s: RenewalStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: RenewalStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export const TRANSITIONS: Record<RenewalAction, { from: RenewalStatus[]; to: RenewalStatus }> = {
  submit_application:          { from: ['renewal_due'],            to: 'application_submitted' },
  check_completeness:          { from: ['application_submitted'],  to: 'completeness_check' },
  request_revision:            { from: ['completeness_check'],     to: 'revision_requested' },
  resubmit:                    { from: ['revision_requested'],     to: 'completeness_check' },
  begin_baseline_reassessment: { from: ['completeness_check'],     to: 'baseline_reassessment' },
  complete_baseline:           { from: ['baseline_reassessment'],  to: 'additionality_retest' },
  complete_additionality:      { from: ['additionality_retest'],   to: 'vvb_validation' },
  validate:                    { from: ['vvb_validation'],         to: 'standard_review' },
  renew:                       { from: ['standard_review'],        to: 'renewed' },
  refuse:                      { from: ['standard_review'],        to: 'refused' },
  withdraw:                    { from: ['renewal_due', 'application_submitted', 'completeness_check', 'revision_requested'], to: 'withdrawn' },
  lapse:                       { from: ['renewal_due'],            to: 'lapsed' },
};

export function nextStatus(current: RenewalStatus, action: RenewalAction): RenewalStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: RenewalStatus): RenewalAction[] {
  const acts: RenewalAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [RenewalAction, typeof TRANSITIONS[RenewalAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const DAY = 24 * 60 * MIN;

// INVERTED matrix — the LARGER the annual issuance, the LONGER every window.
// Strictly increasing minor → mega per graded state. Terminals carry no deadline.
export const SLA_MINUTES: Record<RenewalStatus, Record<RenewalTier, number>> = {
  renewal_due: {
    minor: 30 * DAY, moderate: 45 * DAY, material: 60 * DAY, major: 90 * DAY, mega: 120 * DAY,
  },
  application_submitted: {
    minor: 7 * DAY, moderate: 10 * DAY, material: 14 * DAY, major: 21 * DAY, mega: 30 * DAY,
  },
  completeness_check: {
    minor: 5 * DAY, moderate: 7 * DAY, material: 10 * DAY, major: 14 * DAY, mega: 21 * DAY,
  },
  revision_requested: {
    minor: 7 * DAY, moderate: 10 * DAY, material: 14 * DAY, major: 21 * DAY, mega: 30 * DAY,
  },
  baseline_reassessment: {
    minor: 14 * DAY, moderate: 21 * DAY, material: 30 * DAY, major: 45 * DAY, mega: 60 * DAY,
  },
  additionality_retest: {
    minor: 10 * DAY, moderate: 14 * DAY, material: 21 * DAY, major: 30 * DAY, mega: 45 * DAY,
  },
  vvb_validation: {
    minor: 14 * DAY, moderate: 21 * DAY, material: 30 * DAY, major: 45 * DAY, mega: 60 * DAY,
  },
  standard_review: {
    minor: 14 * DAY, moderate: 21 * DAY, material: 30 * DAY, major: 45 * DAY, mega: 60 * DAY,
  },
  renewed:   { minor: 0, moderate: 0, material: 0, major: 0, mega: 0 },
  refused:   { minor: 0, moderate: 0, material: 0, major: 0, mega: 0 },
  withdrawn: { minor: 0, moderate: 0, material: 0, major: 0, mega: 0 },
  lapsed:    { minor: 0, moderate: 0, material: 0, major: 0, mega: 0 },
};

export function slaWindowMinutes(status: RenewalStatus, tier: RenewalTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: RenewalStatus, tier: RenewalTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// 5 tiers by annual issuance volume in tCO2e / yr.
export function tierForAnnualIssuance(tco2ePerYear: number): RenewalTier {
  if (tco2ePerYear < 10000) return 'minor';
  if (tco2ePerYear < 100000) return 'moderate';
  if (tco2ePerYear < 500000) return 'material';
  if (tco2ePerYear < 2000000) return 'major';
  return 'mega';
}

// Percentage by which the reassessed baseline was cut relative to the original
// baseline (clamped at 0 — a renewed baseline is never credited UP for crossing
// purposes). reduction% = (original - revised) / original * 100.
export function baselineReductionPct(originalBaselineTco2e: number, revisedBaselineTco2e: number): number {
  if (!(originalBaselineTco2e > 0)) return 0;
  const pct = ((originalBaselineTco2e - revisedBaselineTco2e) / originalBaselineTco2e) * 100;
  return pct > 0 ? pct : 0;
}

// A baseline downgrade at/above this threshold is an environmental-integrity
// event reportable to the DNA / Art-6.4 Supervisory Body even when renewal is
// granted (over-crediting was being corrected).
export const MATERIAL_DOWNGRADE_PCT = 30;

// The large-exposure tiers — reportability for refusals and SLA breaches attaches
// here (smaller projects sit below the standard's notification threshold).
const LARGE_TIERS = new Set<RenewalTier>(['major', 'mega']);

export function isLargeTier(tier: RenewalTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportability matrix (the W56 signature):
//   - renew crosses for EVERY tier when baselineReductionPct ≥ 30 (a material
//     baseline downgrade — the distinctive "an approval is reportable" crossing).
//   - refuse crosses for the large tiers (major + mega) only.
export function crossesIntoRegulator(action: RenewalAction, tier: RenewalTier, baselineReductionPct = 0): boolean {
  if (action === 'renew')  return baselineReductionPct >= MATERIAL_DOWNGRADE_PCT;
  if (action === 'refuse') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: RenewalTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Party each action represents (contractual function), not the login role. The
// PROPONENT (project developer) submits / resubmits / withdraws; the standard's
// REGISTRY runs completeness, baseline reassessment, additionality re-test, the
// renewal decision and the auto-lapse; an independent VVB validates the renewed
// baseline. Audit attribution only — same single-party model as W48 / W42.
const ACTION_PARTY: Record<RenewalAction, RenewalParty> = {
  submit_application:          'proponent',
  check_completeness:          'registry',
  request_revision:            'registry',
  resubmit:                    'proponent',
  begin_baseline_reassessment: 'registry',
  complete_baseline:           'registry',
  complete_additionality:      'registry',
  validate:                    'vvb',
  renew:                       'registry',
  refuse:                      'registry',
  withdraw:                    'proponent',
  lapse:                       'registry',
};

export function partyForAction(action: RenewalAction): RenewalParty {
  return ACTION_PARTY[action];
}
