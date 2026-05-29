// ─────────────────────────────────────────────────────────────────────────
// Wave 73 — Carbon PoA / Programme-of-Activities Sub-Project (CPA) Inclusion &
// Conformance chain (P6)
//
// A Programme of Activities (PoA) is a carbon-crediting UMBRELLA: the programme
// is registered ONCE (CDM PoA / Gold Standard GS4GG programme / Verra grouped
// project), then individual Component Project Activities (CPAs / VPAs / project
// instances) are ADDED to it over its lifetime through an inclusion workflow.
// Each CPA is screened against the programme's approved eligibility criteria and
// baseline methodology, gated on host-country Letter of Approval (LoA / DNA), and
// — once included — monitored and verified for ongoing conformance, with DELISTING
// (exclusion) if it stops conforming. This is the ONE-TO-MANY operational layer of
// the carbon portfolio that the standalone-project chains do not cover:
//   [[project-wave37-carbon-registration-chain]] registers a SINGLE project,
//   [[project-wave11-carbon-mrv-chain]] verifies a monitoring period,
//   [[project-wave56-crediting-renewal-chain]] re-validates a crediting period,
//   [[project-wave65-carbon-erpa-chain]] sells reductions forward,
//   THIS chain governs how component activities are screened into and kept
//   conformant within a registered programme.
//
//   cpa_proposed → eligibility_screening → methodology_check → loa_pending
//     → inclusion_review → included → monitoring → verified           (clean path)
//
// Monitoring loop (each crediting/monitoring period):
//   verified → (continue_monitoring) → monitoring → (verify_period) → verified …
//
// Branches / terminals:
//   rejected   — failed eligibility / methodology / inclusion review. [from
//                eligibility_screening | methodology_check | inclusion_review]
//   excluded   — DELISTED from the programme for non-conformance after inclusion.
//                [from included | monitoring | verified]  (the W73 SIGNATURE event)
//   withdrawn  — proponent pulls the CPA before it is included. [from cpa_proposed
//                | eligibility_screening | methodology_check | loa_pending |
//                inclusion_review]
//   completed  — CPA reached end of crediting under the programme. [from
//                monitoring | verified]
//
// Tiers (5) by ESTIMATED ANNUAL EMISSION REDUCTIONS (tCO2e/yr) of the CPA — drive
// SLA + reportability:
//   micro <1k / small <10k / medium <100k / large <500k / mega >=500k
// FLOOR: an Article 6 international-transfer CPA (transfer_type === 'article6')
// needs a corresponding adjustment to the host-country NDC, so it floors at
// 'large' (the heightened double-counting / integrity scrutiny band) regardless of
// its raw annual volume.
//
// SLA matrix is INVERTED — the LARGER the CPA, the LONGER every window (a high-
// volume activity warrants deeper due diligence); a micro CPA gets the SHORTEST,
// fast-track inclusion window — which is the entire point of a PoA: streamlined
// inclusion of small-scale activities. Same flavour as the rest of the carbon
// family ([[project-wave65-carbon-erpa-chain]] / [[project-wave56-crediting-renewal-chain]]).
// Terminals carry no deadline.
//
// Reportability — the W73 SIGNATURE is DELISTING-driven. Excluding an already-
// included (and possibly issuing) CPA from the programme is always a market-
// integrity / double-counting event the DFFE DNA must see:
//   exclude_cpa     crosses for EVERY tier — the distinctive "a delisting is
//                   itself reportable" crossing.
//   approve_inclusion crosses for EVERY tier when the CPA requires a corresponding
//                   adjustment (Article 6); else only for the large tiers (large +
//                   mega) — including a large/Article-6 activity expands the
//                   programme's accredited scope and is notifiable.
//   reject_cpa      crosses for the large tiers (large + mega).
//   sla_breached    crosses for the large tiers (large + mega).
//
// Single carbon-fund desk write {admin, carbon_fund} — the desk (acting as the
// PoA Coordinating / Managing Entity) records the whole inclusion lifecycle (same
// single-party model as every carbon chain: W37 / W11 / W17 / W42 / W48 / W56 /
// W65). actor_party tags the function performing each step (proponent /
// coordinating_entity / dna / vvb) for audit attribution only, NOT access.
// ─────────────────────────────────────────────────────────────────────────

export type CpaStatus =
  | 'cpa_proposed'
  | 'eligibility_screening'
  | 'methodology_check'
  | 'loa_pending'
  | 'inclusion_review'
  | 'included'
  | 'monitoring'
  | 'verified'
  | 'rejected'
  | 'excluded'
  | 'withdrawn'
  | 'completed';

export type CpaAction =
  | 'screen_eligibility'
  | 'check_methodology'
  | 'request_loa'
  | 'submit_inclusion'
  | 'approve_inclusion'
  | 'begin_monitoring'
  | 'verify_period'
  | 'continue_monitoring'
  | 'reject_cpa'
  | 'exclude_cpa'
  | 'withdraw_cpa'
  | 'complete_cpa';

export type CpaTier = 'micro' | 'small' | 'medium' | 'large' | 'mega';

export type CpaParty = 'proponent' | 'coordinating_entity' | 'dna' | 'vvb';

export type CpaTransferType = 'article6' | 'voluntary' | 'compliance';

export type CpaEvent =
  | 'carbon_poa.eligibility_screening'
  | 'carbon_poa.methodology_check'
  | 'carbon_poa.loa_pending'
  | 'carbon_poa.inclusion_review'
  | 'carbon_poa.included'
  | 'carbon_poa.monitoring'
  | 'carbon_poa.verified'
  | 'carbon_poa.rejected'
  | 'carbon_poa.excluded'
  | 'carbon_poa.withdrawn'
  | 'carbon_poa.completed'
  | 'carbon_poa.sla_breached';

const TERMINALS = new Set<CpaStatus>(['rejected', 'excluded', 'withdrawn', 'completed']);

const WITHDRAWABLE = new Set<CpaStatus>([
  'cpa_proposed',
  'eligibility_screening',
  'methodology_check',
  'loa_pending',
  'inclusion_review',
]);

export function isTerminal(s: CpaStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: CpaStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export const TRANSITIONS: Record<CpaAction, { from: CpaStatus[]; to: CpaStatus }> = {
  screen_eligibility:  { from: ['cpa_proposed'],                                              to: 'eligibility_screening' },
  check_methodology:   { from: ['eligibility_screening'],                                     to: 'methodology_check' },
  request_loa:         { from: ['methodology_check'],                                         to: 'loa_pending' },
  submit_inclusion:    { from: ['loa_pending'],                                               to: 'inclusion_review' },
  approve_inclusion:   { from: ['inclusion_review'],                                          to: 'included' },
  begin_monitoring:    { from: ['included'],                                                  to: 'monitoring' },
  verify_period:       { from: ['monitoring'],                                                to: 'verified' },
  continue_monitoring: { from: ['verified'],                                                  to: 'monitoring' },
  reject_cpa:          { from: ['eligibility_screening', 'methodology_check', 'inclusion_review'], to: 'rejected' },
  exclude_cpa:         { from: ['included', 'monitoring', 'verified'],                        to: 'excluded' },
  withdraw_cpa:        { from: ['cpa_proposed', 'eligibility_screening', 'methodology_check', 'loa_pending', 'inclusion_review'], to: 'withdrawn' },
  complete_cpa:        { from: ['monitoring', 'verified'],                                    to: 'completed' },
};

export function nextStatus(current: CpaStatus, action: CpaAction): CpaStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: CpaStatus): CpaAction[] {
  const acts: CpaAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [CpaAction, typeof TRANSITIONS[CpaAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const DAY = 24 * 60 * MIN;

// INVERTED matrix — the LARGER the CPA, the LONGER every window. Strictly
// increasing micro → mega per graded state. Terminals carry no deadline.
export const SLA_MINUTES: Record<CpaStatus, Record<CpaTier, number>> = {
  cpa_proposed: {
    micro: 5 * DAY, small: 7 * DAY, medium: 10 * DAY, large: 14 * DAY, mega: 21 * DAY,
  },
  eligibility_screening: {
    micro: 5 * DAY, small: 7 * DAY, medium: 10 * DAY, large: 14 * DAY, mega: 21 * DAY,
  },
  methodology_check: {
    micro: 7 * DAY, small: 10 * DAY, medium: 14 * DAY, large: 21 * DAY, mega: 30 * DAY,
  },
  loa_pending: {
    micro: 21 * DAY, small: 30 * DAY, medium: 45 * DAY, large: 60 * DAY, mega: 90 * DAY,
  },
  inclusion_review: {
    micro: 10 * DAY, small: 14 * DAY, medium: 21 * DAY, large: 30 * DAY, mega: 45 * DAY,
  },
  included: {
    micro: 14 * DAY, small: 21 * DAY, medium: 30 * DAY, large: 45 * DAY, mega: 60 * DAY,
  },
  monitoring: {
    micro: 90 * DAY, small: 120 * DAY, medium: 180 * DAY, large: 270 * DAY, mega: 365 * DAY,
  },
  verified: {
    micro: 14 * DAY, small: 21 * DAY, medium: 30 * DAY, large: 45 * DAY, mega: 60 * DAY,
  },
  rejected:  { micro: 0, small: 0, medium: 0, large: 0, mega: 0 },
  excluded:  { micro: 0, small: 0, medium: 0, large: 0, mega: 0 },
  withdrawn: { micro: 0, small: 0, medium: 0, large: 0, mega: 0 },
  completed: { micro: 0, small: 0, medium: 0, large: 0, mega: 0 },
};

export function slaWindowMinutes(status: CpaStatus, tier: CpaTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: CpaStatus, tier: CpaTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// An Article 6.2/6.4 international transfer requires a CORRESPONDING ADJUSTMENT to
// the host-country NDC accounting — the double-counting safeguard. Voluntary and
// compliance-domestic activities do not.
export function requiresCorrespondingAdjustment(transferType: CpaTransferType): boolean {
  return transferType === 'article6';
}

const TIER_RANK: Record<CpaTier, number> = { micro: 0, small: 1, medium: 2, large: 3, mega: 4 };
const LARGE_TIERS = new Set<CpaTier>(['large', 'mega']);

export function isLargeTier(tier: CpaTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Base tier by estimated annual emission reductions (tCO2e/yr).
export function baseTierForAnnualEr(tco2e: number): CpaTier {
  if (tco2e < 1000) return 'micro';
  if (tco2e < 10000) return 'small';
  if (tco2e < 100000) return 'medium';
  if (tco2e < 500000) return 'large';
  return 'mega';
}

// Effective tier — base tier raised to the Article-6 floor ('large') when the CPA
// requires a corresponding adjustment.
export function tierForAnnualEr(tco2e: number, transferType: CpaTransferType): CpaTier {
  const base = baseTierForAnnualEr(tco2e);
  if (requiresCorrespondingAdjustment(transferType) && TIER_RANK[base] < TIER_RANK['large']) {
    return 'large';
  }
  return base;
}

// Reportability matrix (the W73 signature):
//   - exclude_cpa crosses for EVERY tier — delisting an included CPA is always a
//     market-integrity event.
//   - approve_inclusion crosses for EVERY tier when the CPA requires a
//     corresponding adjustment (Article 6); else only for the large tiers.
//   - reject_cpa crosses for the large tiers only.
export function crossesIntoRegulator(action: CpaAction, tier: CpaTier, requiresCA = false): boolean {
  if (action === 'exclude_cpa') return true;
  if (action === 'approve_inclusion') return requiresCA || LARGE_TIERS.has(tier);
  if (action === 'reject_cpa') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: CpaTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true when the
// CPA requires a corresponding adjustment OR its volume is large.
export function isReportable(tier: CpaTier, requiresCA: boolean): boolean {
  return requiresCA || LARGE_TIERS.has(tier);
}

// Party each action represents (functional role within the programme), not the
// login role. The PROPONENT (component-activity developer) proposes / submits /
// begins monitoring / withdraws; the COORDINATING_ENTITY (PoA manager — the carbon
// desk) screens / checks methodology / approves / continues / rejects / excludes /
// completes; the DNA (host-country authority) issues the LoA; the VVB
// (validation/verification body) verifies each period. Audit attribution only.
const ACTION_PARTY: Record<CpaAction, CpaParty> = {
  screen_eligibility:  'coordinating_entity',
  check_methodology:   'coordinating_entity',
  request_loa:         'dna',
  submit_inclusion:    'proponent',
  approve_inclusion:   'coordinating_entity',
  begin_monitoring:    'proponent',
  verify_period:       'vvb',
  continue_monitoring: 'coordinating_entity',
  reject_cpa:          'coordinating_entity',
  exclude_cpa:         'coordinating_entity',
  withdraw_cpa:        'proponent',
  complete_cpa:        'coordinating_entity',
};

export function partyForAction(action: CpaAction): CpaParty {
  return ACTION_PARTY[action];
}

// ── "Beat best-in-class" decision helpers ─────────────────────────────────────
// CDM/GS/Verra PoA inclusion is slow, manual and paper-heavy (CPA inclusion can
// take months). These pure helpers power the platform's automated screening,
// double-counting checks and aggregated forecasting that beat that baseline.

// Composite eligibility score (0–100) — the higher the score, the cleaner the
// inclusion. Weights: methodology applicability, additionality strength,
// monitoring readiness, host-country LoA confidence. Inputs are 0–1.
export function eligibilityScore(p: {
  methodologyApplicability: number;
  additionalityStrength: number;
  monitoringReadiness: number;
  loaConfidence: number;
}): number {
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const score =
    clamp01(p.methodologyApplicability) * 35 +
    clamp01(p.additionalityStrength) * 30 +
    clamp01(p.monitoringReadiness) * 20 +
    clamp01(p.loaConfidence) * 15;
  return Math.round(score);
}

// Predicted inclusion turnaround (days) — the sum of the forward-path SLA windows
// for the tier, from proposal through to first verification. Lets the desk quote a
// realistic inclusion date up front (beats the open-ended manual process).
export function predictedInclusionDays(tier: CpaTier): number {
  const forward: CpaStatus[] = [
    'cpa_proposed',
    'eligibility_screening',
    'methodology_check',
    'loa_pending',
    'inclusion_review',
  ];
  const minutes = forward.reduce((sum, s) => sum + (SLA_MINUTES[s]?.[tier] ?? 0), 0);
  return Math.round(minutes / DAY);
}

// Remaining headroom (tCO2e/yr) under the programme's accredited annual cap once
// this CPA's estimated ER is added to the already-included total. Negative => the
// CPA would breach the programme cap and cannot be included without re-accreditation.
export function programmeHeadroomTco2e(programmeCapEr: number, includedEr: number, cpaEr: number): number {
  return programmeCapEr - (includedEr + cpaEr);
}

// Whether including this CPA would exceed the programme's accredited annual cap.
export function exceedsProgrammeCap(programmeCapEr: number, includedEr: number, cpaEr: number): boolean {
  return programmeHeadroomTco2e(programmeCapEr, includedEr, cpaEr) < 0;
}

// Double-counting / geographic-overlap check — true when the CPA's geographic key
// (e.g. erf/parcel/grid-node id) already appears in an included CPA in the same
// programme. A real-time guard the manual standards bodies lack.
export function overlapsIncludedCpa(geoKey: string, includedGeoKeys: string[]): boolean {
  if (!geoKey) return false;
  return includedGeoKeys.includes(geoKey);
}
