// ─────────────────────────────────────────────────────────────────────────
// Wave 103 — ESG Disclosure Lifecycle & Assurance Chain (P6)
//
// USER DIRECTIVE OVERRIDE 2026-05-30: the existing src/routes/esg-reports.ts
// is L2 — a template list + basic generate, no state machine, no SLA, no
// audit chain, no LIVE battery, no regulator crossings. W103 brings ESG
// reporting to L4-L5 across the whole platform.
//
// ESG reporting is the single biggest cross-cutting compliance + investor-
// confidence surface a SA energy platform must answer. A JSE-listed IPP
// or carbon fund has SIX standards to satisfy SIMULTANEOUSLY each annual
// cycle:
//   • ISSB IFRS S1 (general sustainability)
//   • ISSB IFRS S2 (climate)
//   • TCFD 4 pillars (governance/strategy/risk-mgmt/metrics-targets)
//   • GRI Universal Standards 1-3 + sector standards
//   • CDP Climate / Water / Forests questionnaire
//   • JSE SRL (JSE Sustainability and Climate Disclosure Guidance 2024)
//   • King IV Principles 1-3 + 15-17
//   • SBTi alignment
//   • Carbon Tax Act §6 (SA tax-claim layer)
//   • SAICA Code 8 (assurance over sustainability information)
//
// Get any one wrong and you face: JSE delisting risk, SARB ESG funding
// covenants, NERSA REIPPPP scoring penalties, off-taker fund-redemption
// triggers, lender ESG ratchet repricing. The disclosure cycle has a hard
// JSE filing window AND an annual assurance opinion gate from an audit
// firm whose qualified/adverse/disclaimer opinion ripples back into every
// downstream covenant.
//
// W103 is the disclosure lifecycle chain:
//   • Annual period open
//   • Data collected from operations (W79 revenue, W71 prognostics, W11 MRV,
//     W42 reversals, W94 capacity, W95+drawdown, W101 PPA recon)
//   • Reporting boundary verified (entity scope, joint-control, operational
//     vs financial control test)
//   • Metrics computed (15-cat Scope 3 ledger + 4-framework completeness)
//   • Draft compiled (TCFD/GRI/CDP/JSE-SRL/ISSB sections)
//   • Internal review (sustainability director sign-off)
//   • Assurance engaged (Big-4 audit firm scoping)
//   • Assurance in progress (limited or reasonable engagement)
//   • Assured (auditor issues opinion: unqualified / limited / qualified /
//     adverse / disclaimer)
//   • Published (integrated annual report goes public)
//   • Filed (JSE SENS + CIPC + DFFE + SARS submissions complete)
//   • Archived (terminal — 7-year retention)
//   • Disputed branch — auditor or board disputes a number on the draft
//   • Restated branch — published disclosure is materially mis-stated and
//     must be RE-FILED (universal regulator-crossing hard line)
//
// Distinct from prior chains:
//   - [[project_wave4_carbon_article6]]         ITMO ledger (one component of S3)
//   - [[project_wave11_carbon_mrv_chain]]        single-project MRV
//   - [[project_wave42_carbon_reversal_chain]]   buffer-pool reversal
//   - [[project_wave48_carbon_offset_claim_chain]] carbon tax §13 monetisation
//   - [[project_wave79_generation_revenue_assurance_chain]] revenue data feed
//   - [[project_wave101_ppa_annual_recon_chain]] PPA annual financial close
//   - existing src/routes/esg-reports.ts (L2 template generator — becomes
//     a CHILD of W103 chain; report generation snapshots the LIVE battery)
//
// Beats Workiva ESG / Sphera SpheraCloud / SAP Sustainability Control
// Tower / Microsoft Sustainability Manager / IBM Envizi / Salesforce Net
// Zero Cloud / Greenstone / EcoVadis / Persefoni / Watershed / Diligent
// ESG / Bloomberg ESG / Refinitiv Lipper ESG by surfacing as a 12-state P6
// chain with auto-tier from disclosure_scope x climate_exposure x assurance
// level + 4-framework completeness battery + 15-cat Scope 3 ledger + JSE
// filing-window cron + 4-step authority ladder + assurance-qualified
// regulator crossing + universal restate_disclosure hard line.
//
// Forward path (clean lifecycle):
//   period_open -> data_collected -> boundary_verified -> metrics_computed
//   -> draft_compiled -> internal_review -> assurance_engaged
//   -> assurance_in_progress -> assured -> published -> filed -> archived
//
// Dispute branch:
//   draft_compiled / internal_review / assured
//   -> raise_dispute -> disputed -> resolve_dispute -> internal_review
//
// Restated branch:
//   filed -> restate_disclosure -> restated (REOPENS to draft_compiled
//   via the route layer; restated is itself a transitive state that
//   immediately re-enters the chain at draft_compiled)
//
// Cancel branch:
//   any non-terminal -> cancel_year -> cancelled (terminal)
//
// Tiers (4) RE-DERIVED on every transition from disclosure_scope x
// climate_risk_exposure x assurance_level:
//   minor      : scope=entity_only AND exposure=low AND assurance=none
//   standard   : scope=entity+subsidiaries OR exposure=medium OR assurance=limited
//   material   : scope=group_consolidated OR exposure=high OR assurance=limited
//   strategic  : scope=group_consolidated AND (exposure=high OR
//                assurance=reasonable)
//
// FLOOR-AT-MATERIAL — any of these flags forces effective tier to at least
// material:
//   - jse_listed_strict          (JSE-listed entity — SRL applies)
//   - scope3_inclusive_15cat     (full 15-category Scope 3 inclusion)
//   - climate_scenario_required  (IFRS S2 / TCFD scenario analysis)
//   - material_topics_count_8plus (8+ material topics on the materiality
//                                 matrix per GRI Universal Standards)
//   - sbti_committed_strict      (SBTi commitment letter signed)
//
// SLA polarity INVERTED — larger scope = MORE time. Annual reporting
// cycles run on calendar quarters, not minutes. Strategic disclosures get
// the longest windows because the assurance engagement alone takes
// 90-120 days at a Big-4 firm. Terminals (archived, cancelled) carry
// no deadline.
//
// REGULATOR-CROSSING SIGNATURE (the W103 hard line) — JSE SRL §8.62 +
// Companies Act + SAICA Code 8 + Carbon Tax Act §6:
//   restate_disclosure    -> regulator EVERY tier (universal hard line —
//                            re-statement of public ESG disclosure is
//                            always JSE-reportable; sister of W42 reversal
//                            + W101 restate_year + W79 raise_dispute)
//   complete_assurance    -> regulator material+strategic when
//                            assurance_opinion IN ('qualified','adverse',
//                            'disclaimer') (auditor refusal to issue
//                            limited/reasonable opinion)
//   cancel_year           -> regulator EVERY tier when
//                            year_had_listed_disclosure=true (cancelling
//                            a year with already-published JSE disclosure)
//   sla_breached          -> strategic (filing-deadline miss only)
//
// Write roles: {admin, carbon_fund}. The sustainability director drives
// draft + review; the audit committee + board chair the authority ladder;
// the external auditor surfaces via complete_assurance party. JSE-listed
// entities cross-mount on the Esums + Regulator workstations as a read-
// only feed.
// ─────────────────────────────────────────────────────────────────────────

export type EsgStatus =
  | 'period_open'
  | 'data_collected'
  | 'boundary_verified'
  | 'metrics_computed'
  | 'draft_compiled'
  | 'internal_review'
  | 'assurance_engaged'
  | 'assurance_in_progress'
  | 'assured'
  | 'published'
  | 'filed'
  | 'archived'
  | 'disputed'
  | 'cancelled';

export type EsgAction =
  | 'collect_data'
  | 'verify_boundary'
  | 'compute_metrics'
  | 'compile_draft'
  | 'submit_for_review'
  | 'engage_assurance'
  | 'start_assurance'
  | 'complete_assurance'
  | 'publish_disclosure'
  | 'file_regulator'
  | 'archive_year'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'restate_disclosure'
  | 'cancel_year';

export type EsgTier = 'minor' | 'standard' | 'material' | 'strategic';

export type EsgParty =
  | 'esg_analyst'
  | 'sustainability_director'
  | 'audit_committee_chair'
  | 'board_chair'
  | 'external_auditor'
  | 'regulator_observer';

export type EsgEvent =
  | 'esg_disclosure.data_collected'
  | 'esg_disclosure.boundary_verified'
  | 'esg_disclosure.metrics_computed'
  | 'esg_disclosure.draft_compiled'
  | 'esg_disclosure.review_submitted'
  | 'esg_disclosure.assurance_engaged'
  | 'esg_disclosure.assurance_started'
  | 'esg_disclosure.assurance_completed'
  | 'esg_disclosure.published'
  | 'esg_disclosure.filed'
  | 'esg_disclosure.archived'
  | 'esg_disclosure.dispute_raised'
  | 'esg_disclosure.dispute_resolved'
  | 'esg_disclosure.restated'
  | 'esg_disclosure.cancelled'
  | 'esg_disclosure.sla_breached';

const TERMINALS = new Set<EsgStatus>(['archived', 'cancelled']);

export function isTerminal(s: EsgStatus): boolean {
  return TERMINALS.has(s);
}

const CANCELLABLE_FROM: EsgStatus[] = [
  'period_open',
  'data_collected',
  'boundary_verified',
  'metrics_computed',
  'draft_compiled',
  'internal_review',
  'assurance_engaged',
  'assurance_in_progress',
  'assured',
  'published',
  'filed',
  'disputed',
];

const DISPUTABLE_FROM: EsgStatus[] = [
  'draft_compiled',
  'internal_review',
  'assured',
];

// Restate is special: it fires from 'filed' (a published+filed disclosure is
// found to be materially mis-stated) and reopens the row at draft_compiled.
// The route layer applies the reopen after recording the restate event.
export const TRANSITIONS: Record<EsgAction, { from: EsgStatus[]; to: EsgStatus }> = {
  collect_data:        { from: ['period_open'],                              to: 'data_collected' },
  verify_boundary:     { from: ['data_collected'],                           to: 'boundary_verified' },
  compute_metrics:     { from: ['boundary_verified'],                        to: 'metrics_computed' },
  compile_draft:       { from: ['metrics_computed', 'disputed'],             to: 'draft_compiled' },
  submit_for_review:   { from: ['draft_compiled'],                           to: 'internal_review' },
  engage_assurance:    { from: ['internal_review'],                          to: 'assurance_engaged' },
  start_assurance:     { from: ['assurance_engaged'],                        to: 'assurance_in_progress' },
  complete_assurance:  { from: ['assurance_in_progress'],                    to: 'assured' },
  publish_disclosure:  { from: ['assured'],                                  to: 'published' },
  file_regulator:      { from: ['published'],                                to: 'filed' },
  archive_year:        { from: ['filed'],                                    to: 'archived' },
  raise_dispute:       { from: DISPUTABLE_FROM,                              to: 'disputed' },
  resolve_dispute:     { from: ['disputed'],                                 to: 'internal_review' },
  restate_disclosure:  { from: ['filed'],                                    to: 'draft_compiled' },
  cancel_year:         { from: CANCELLABLE_FROM,                             to: 'cancelled' },
};

export function nextStatus(current: EsgStatus, action: EsgAction): EsgStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: EsgStatus): EsgAction[] {
  const acts: EsgAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [EsgAction, typeof TRANSITIONS[EsgAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED matrix — larger scope (strategic) gets LONGER windows.
// Annual reporting cycles + assurance engagement timelines mean the
// strategic tier needs 9 months of runway end-to-end (Q1 data → Q3 file).
// Sister of W101 PPA annual recon + W43 MYPD + W37/W56 carbon registration.
// Terminals (archived, cancelled) carry no deadline.
export const SLA_MINUTES: Record<EsgStatus, Record<EsgTier, number>> = {
  period_open:            { minor: 30 * DAY,  standard: 60 * DAY,  material: 90 * DAY,  strategic: 120 * DAY },
  data_collected:         { minor: 21 * DAY,  standard: 30 * DAY,  material: 45 * DAY,  strategic: 60 * DAY },
  boundary_verified:      { minor: 14 * DAY,  standard: 21 * DAY,  material: 30 * DAY,  strategic: 45 * DAY },
  metrics_computed:       { minor: 14 * DAY,  standard: 21 * DAY,  material: 30 * DAY,  strategic: 45 * DAY },
  draft_compiled:         { minor: 14 * DAY,  standard: 21 * DAY,  material: 30 * DAY,  strategic: 45 * DAY },
  internal_review:        { minor: 7 * DAY,   standard: 14 * DAY,  material: 21 * DAY,  strategic: 30 * DAY },
  assurance_engaged:      { minor: 14 * DAY,  standard: 21 * DAY,  material: 30 * DAY,  strategic: 45 * DAY },
  assurance_in_progress:  { minor: 30 * DAY,  standard: 45 * DAY,  material: 75 * DAY,  strategic: 120 * DAY },
  assured:                { minor: 7 * DAY,   standard: 14 * DAY,  material: 21 * DAY,  strategic: 30 * DAY },
  published:              { minor: 14 * DAY,  standard: 21 * DAY,  material: 30 * DAY,  strategic: 45 * DAY },
  filed:                  { minor: 30 * DAY,  standard: 60 * DAY,  material: 90 * DAY,  strategic: 120 * DAY },
  disputed:               { minor: 14 * DAY,  standard: 21 * DAY,  material: 30 * DAY,  strategic: 45 * DAY },
  archived:               { minor: 0,         standard: 0,         material: 0,         strategic: 0 },
  cancelled:              { minor: 0,         standard: 0,         material: 0,         strategic: 0 },
};

export function slaWindowMinutes(status: EsgStatus, tier: EsgTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: EsgStatus, tier: EsgTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Tier RE-DERIVED from disclosure_scope x climate_risk_exposure x
// assurance_level. The composite drives every regulator + SLA + authority
// decision.
export type DisclosureScope = 'entity_only' | 'entity_plus_subsidiaries' | 'group_consolidated';
export type ClimateExposure = 'low' | 'medium' | 'high';
export type AssuranceLevel = 'none' | 'limited' | 'reasonable';

const SCOPE_RANK: Record<DisclosureScope, number> = {
  entity_only: 1,
  entity_plus_subsidiaries: 2,
  group_consolidated: 3,
};
const EXPOSURE_RANK: Record<ClimateExposure, number> = { low: 1, medium: 2, high: 3 };
const ASSURANCE_RANK: Record<AssuranceLevel, number> = { none: 1, limited: 2, reasonable: 3 };

export function tierForDisclosure(
  scope: DisclosureScope | string | null | undefined,
  exposure: ClimateExposure | string | null | undefined,
  assurance: AssuranceLevel | string | null | undefined,
): EsgTier {
  const s = (SCOPE_RANK[scope as DisclosureScope] ?? 1);
  const e = (EXPOSURE_RANK[exposure as ClimateExposure] ?? 1);
  const a = (ASSURANCE_RANK[assurance as AssuranceLevel] ?? 1);
  // strategic = scope=3 AND (exposure=3 OR assurance=3)
  if (s >= 3 && (e >= 3 || a >= 3)) return 'strategic';
  // material = scope>=2 OR exposure>=3 OR assurance>=2 (but not strategic)
  if (s >= 2 || e >= 3 || a >= 2) return 'material';
  // standard = exposure>=2 (but none of the above)
  if (e >= 2) return 'standard';
  return 'minor';
}

// FLOOR-AT-MATERIAL — any of these flags forces effective tier up to at
// least material, regardless of raw scope/exposure/assurance. Captures
// JSE listing strictness + Scope 3 inclusion + IFRS S2 scenario analysis
// + GRI materiality matrix size + SBTi binding commitment.
export function floorAtMaterial(args: {
  jse_listed_strict?: boolean | number | null;
  scope3_inclusive_15cat?: boolean | number | null;
  climate_scenario_required?: boolean | number | null;
  material_topics_count_8plus?: boolean | number | null;
  sbti_committed_strict?: boolean | number | null;
}): boolean {
  const truthy = (v: boolean | number | null | undefined): boolean => Boolean(v);
  return (
    truthy(args.jse_listed_strict) ||
    truthy(args.scope3_inclusive_15cat) ||
    truthy(args.climate_scenario_required) ||
    truthy(args.material_topics_count_8plus) ||
    truthy(args.sbti_committed_strict)
  );
}

export function effectiveTier(rawTier: EsgTier, floor: boolean): EsgTier {
  if (!floor) return rawTier;
  if (rawTier === 'minor' || rawTier === 'standard') return 'material';
  return rawTier;
}

const HEAVY_TIERS = new Set<EsgTier>(['material', 'strategic']);

export function isHeavyTier(tier: EsgTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// W103 hard line — JSE SRL §8.62 + Companies Act + SAICA Code 8 +
// Carbon Tax Act §6:
//   restate_disclosure    -> regulator EVERY tier (universal hard line)
//   complete_assurance    -> regulator material+strategic when opinion is
//                            qualified/adverse/disclaimer
//   cancel_year           -> regulator EVERY tier when
//                            year_had_listed_disclosure=true
//   sla_breached          -> regulator strategic only (filing-deadline miss)
export type AssuranceOpinion = 'unqualified' | 'limited' | 'qualified' | 'adverse' | 'disclaimer';
const QUALIFIED_OPINIONS = new Set<AssuranceOpinion>(['qualified', 'adverse', 'disclaimer']);

export function crossesIntoRegulator(
  action: EsgAction,
  tier: EsgTier,
  assuranceOpinion: AssuranceOpinion | string | null | undefined,
  yearHadListedDisclosure: boolean | number | null | undefined,
): boolean {
  // Universal regulator hard line — every restate, every tier.
  if (action === 'restate_disclosure') return true;
  if (action === 'complete_assurance') {
    if (!HEAVY_TIERS.has(tier)) return false;
    return QUALIFIED_OPINIONS.has(assuranceOpinion as AssuranceOpinion);
  }
  if (action === 'cancel_year') {
    return Boolean(yearHadListedDisclosure);
  }
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: EsgTier): boolean {
  return tier === 'strategic';
}

export function isReportable(tier: EsgTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// Party each action represents. ESG analyst owns data + boundary + compute;
// sustainability director compiles + submits draft; audit committee chairs
// engagement; external auditor executes assurance; board chairs publish +
// restate; regulator only appears on the restate + qualified-opinion
// crossings.
const ACTION_PARTY: Record<EsgAction, EsgParty> = {
  collect_data:       'esg_analyst',
  verify_boundary:    'esg_analyst',
  compute_metrics:    'esg_analyst',
  compile_draft:      'sustainability_director',
  submit_for_review:  'sustainability_director',
  engage_assurance:   'audit_committee_chair',
  start_assurance:    'external_auditor',
  complete_assurance: 'external_auditor',
  publish_disclosure: 'board_chair',
  file_regulator:     'sustainability_director',
  archive_year:       'sustainability_director',
  raise_dispute:      'audit_committee_chair',
  resolve_dispute:    'sustainability_director',
  restate_disclosure: 'board_chair',
  cancel_year:        'board_chair',
};

export function partyForAction(action: EsgAction): EsgParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: EsgAction): EsgEvent | null {
  switch (action) {
    case 'collect_data':       return 'esg_disclosure.data_collected';
    case 'verify_boundary':    return 'esg_disclosure.boundary_verified';
    case 'compute_metrics':    return 'esg_disclosure.metrics_computed';
    case 'compile_draft':      return 'esg_disclosure.draft_compiled';
    case 'submit_for_review':  return 'esg_disclosure.review_submitted';
    case 'engage_assurance':   return 'esg_disclosure.assurance_engaged';
    case 'start_assurance':    return 'esg_disclosure.assurance_started';
    case 'complete_assurance': return 'esg_disclosure.assurance_completed';
    case 'publish_disclosure': return 'esg_disclosure.published';
    case 'file_regulator':     return 'esg_disclosure.filed';
    case 'archive_year':       return 'esg_disclosure.archived';
    case 'raise_dispute':      return 'esg_disclosure.dispute_raised';
    case 'resolve_dispute':    return 'esg_disclosure.dispute_resolved';
    case 'restate_disclosure': return 'esg_disclosure.restated';
    case 'cancel_year':        return 'esg_disclosure.cancelled';
  }
}

// ─── Live ESG disclosure battery — beats Workiva ESG / Sphera SpheraCloud /
//     SAP Sustainability Control Tower / Microsoft Sustainability Manager /
//     IBM Envizi / Salesforce Net Zero Cloud / Greenstone / EcoVadis /
//     Persefoni / Watershed / Diligent ESG / Bloomberg ESG by surfacing
//     every metric LIVE on the row, including 4-framework completeness
//     (TCFD/GRI/CDP/JSE-SRL/ISSB-S1-S2/King-IV), full 15-category Scope 3
//     ledger, assurance confidence, regulator filing window, and a 130-
//     point composite disclosure index.

// Total Scope 3 across all 15 GHG Protocol categories.
export function scope3Total15CatTco2e(scope3ByCat: Record<string, number | null | undefined> | null | undefined): number {
  if (!scope3ByCat) return 0;
  let total = 0;
  for (const v of Object.values(scope3ByCat)) {
    const n = Number(v ?? 0);
    if (isFinite(n) && n > 0) total += n;
  }
  return Math.round(total * 100) / 100;
}

// Total emissions = Scope 1 + Scope 2 market-based + Scope 3 total. We use
// market-based for headline (per GHG Protocol Scope 2 Guidance) but expose
// location-based separately in the row.
export function totalEmissionsTco2e(
  scope1: number | null | undefined,
  scope2Market: number | null | undefined,
  scope3Total: number,
): number {
  const s1 = Number(scope1 ?? 0);
  const s2 = Number(scope2Market ?? 0);
  if (!isFinite(s1) || !isFinite(s2) || !isFinite(scope3Total)) return 0;
  return Math.round((s1 + s2 + scope3Total) * 100) / 100;
}

// Reduction % vs baseline year (SBTi method — physical-intensity preferred
// when available; falls back to absolute reduction).
export function reductionPctVsBaseline(
  currentTotal: number,
  baselineTotal: number | null | undefined,
): number {
  const base = Number(baselineTotal ?? 0);
  if (base <= 0) return 0;
  const pct = ((base - currentTotal) / base) * 100;
  return Math.round(pct * 10) / 10;
}

// SBTi alignment score 0-100 — how close to 1.5°C-aligned trajectory.
// Composes: target_set + target_validated + interim_progress_on_track +
// absolute_reduction_above_42pct + scope3_target_set.
export function sbtiAlignmentScore(args: {
  target_set?: boolean | number | null;
  target_validated?: boolean | number | null;
  interim_progress_on_track?: boolean | number | null;
  reduction_above_42pct?: boolean | number | null;
  scope3_target_set?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.target_set) * 20;
  score += t(args.target_validated) * 20;
  score += t(args.interim_progress_on_track) * 20;
  score += t(args.reduction_above_42pct) * 20;
  score += t(args.scope3_target_set) * 20;
  return Math.min(100, score);
}

// TCFD 4-pillar completeness — % of TCFD recommended disclosures covered.
// Pillars: governance / strategy / risk_management / metrics_targets. Each
// pillar carries equal weight (25%).
export function tcfdCompletenessPct(args: {
  governance?: boolean | number | null;
  strategy?: boolean | number | null;
  risk_management?: boolean | number | null;
  metrics_targets?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 25 : 0);
  return t(args.governance) + t(args.strategy) + t(args.risk_management) + t(args.metrics_targets);
}

// GRI Universal Standards completeness — % of material topics covered.
export function griCompletenessPct(
  topicsCovered: number | null | undefined,
  topicsMaterial: number | null | undefined,
): number {
  const covered = Number(topicsCovered ?? 0);
  const total = Number(topicsMaterial ?? 0);
  if (total <= 0) return 0;
  return Math.round((covered / total) * 100 * 10) / 10;
}

// CDP score band — A/A-/B/B-/C/C-/D/D-/F based on score 0-100.
export function cdpScoreBand(score: number | null | undefined): string {
  const s = Number(score ?? 0);
  if (s >= 90) return 'A';
  if (s >= 80) return 'A-';
  if (s >= 70) return 'B';
  if (s >= 60) return 'B-';
  if (s >= 50) return 'C';
  if (s >= 40) return 'C-';
  if (s >= 30) return 'D';
  if (s >= 20) return 'D-';
  return 'F';
}

// JSE SRL completeness — % of JSE Sustainability and Climate Disclosure
// Guidance 2024 recommended disclosures covered.
export function jseSrlCompletenessPct(
  jseRecCovered: number | null | undefined,
  jseRecTotal: number | null | undefined,
): number {
  const covered = Number(jseRecCovered ?? 0);
  const total = Number(jseRecTotal ?? 0);
  if (total <= 0) return 0;
  return Math.round((covered / total) * 100 * 10) / 10;
}

// King IV completeness — % of King IV principles 1-17 with documented
// application or "apply and explain" rationale.
export function kingIvCompletenessPct(
  principlesApplied: number | null | undefined,
  principlesTotal: number | null | undefined,
): number {
  const applied = Number(principlesApplied ?? 0);
  const total = Number(principlesTotal ?? 17);
  if (total <= 0) return 0;
  return Math.round((applied / total) * 100 * 10) / 10;
}

// ISSB IFRS S1 + S2 completeness — combined completeness of general
// sustainability (S1) + climate-related disclosure (S2) requirements.
export function issbS1S2CompletenessPct(
  s1Covered: number | null | undefined,
  s1Total: number | null | undefined,
  s2Covered: number | null | undefined,
  s2Total: number | null | undefined,
): number {
  const c1 = Number(s1Covered ?? 0);
  const t1 = Number(s1Total ?? 0);
  const c2 = Number(s2Covered ?? 0);
  const t2 = Number(s2Total ?? 0);
  const totalT = t1 + t2;
  if (totalT <= 0) return 0;
  return Math.round(((c1 + c2) / totalT) * 100 * 10) / 10;
}

// Assurance confidence — derived from level + opinion. Used to colour the
// dashboard ribbon and downstream covenant decisions.
export type AssuranceConfidence = 'high' | 'medium' | 'low' | 'none';

export function assuranceConfidence(
  level: AssuranceLevel | string | null | undefined,
  opinion: AssuranceOpinion | string | null | undefined,
): AssuranceConfidence {
  const l = (level ?? 'none') as AssuranceLevel;
  const o = (opinion ?? null) as AssuranceOpinion | null;
  if (l === 'reasonable' && o === 'unqualified') return 'high';
  if (l === 'reasonable' && o === 'limited') return 'medium';
  if (l === 'limited' && o === 'unqualified') return 'medium';
  if (l === 'limited' && o === 'limited') return 'medium';
  if (l === 'reasonable' && (o === 'qualified' || o === 'adverse' || o === 'disclaimer')) return 'low';
  if (l === 'limited' && (o === 'qualified' || o === 'adverse' || o === 'disclaimer')) return 'low';
  if (l === 'none') return 'none';
  return 'low';
}

// Composite ESG disclosure index 0-130 — composes completeness across all
// frameworks + assurance + SBTi into a single headline number that drives
// the dashboard ribbon. Component scoring (each contributes up to weight):
//   tcfd_complete            20
//   gri_complete             15
//   cdp_complete             10
//   jse_srl_complete         15
//   issb_s1_s2_complete      20
//   king_iv_complete         10
//   sbti_complete            10
//   assurance_high           15
//   restated_recently_clean  15 (bonus when last restatement is >2y old or
//                               no restatement at all)
// Capped at 130. Floor 0.
export function esgDisclosureIndex(args: {
  tcfd_pct?: number | null;
  gri_pct?: number | null;
  cdp_band?: string | null;
  jse_srl_pct?: number | null;
  issb_pct?: number | null;
  king_iv_pct?: number | null;
  sbti_score?: number | null;
  assurance_confidence?: AssuranceConfidence | null;
  restated_recently?: boolean | number | null;
}): number {
  const pctW = (pct: number | null | undefined, w: number): number => {
    const p = Number(pct ?? 0);
    if (!isFinite(p) || p <= 0) return 0;
    return Math.round(Math.min(100, p) / 100 * w * 10) / 10;
  };
  let score = 0;
  score += pctW(args.tcfd_pct, 20);
  score += pctW(args.gri_pct, 15);
  // CDP band -> approximate completeness
  const cdpPct =
    args.cdp_band === 'A' ? 100 :
    args.cdp_band === 'A-' ? 90 :
    args.cdp_band === 'B' ? 80 :
    args.cdp_band === 'B-' ? 70 :
    args.cdp_band === 'C' ? 60 :
    args.cdp_band === 'C-' ? 50 :
    args.cdp_band === 'D' ? 40 :
    args.cdp_band === 'D-' ? 30 : 0;
  score += pctW(cdpPct, 10);
  score += pctW(args.jse_srl_pct, 15);
  score += pctW(args.issb_pct, 20);
  score += pctW(args.king_iv_pct, 10);
  score += pctW(args.sbti_score, 10);
  if (args.assurance_confidence === 'high') score += 15;
  else if (args.assurance_confidence === 'medium') score += 10;
  else if (args.assurance_confidence === 'low') score += 5;
  if (args.restated_recently === false || args.restated_recently === 0 || args.restated_recently == null) score += 15;
  return Math.max(0, Math.min(130, Math.round(score)));
}

// Days remaining in current state's SLA window.
export function slaDaysRemaining(
  status: EsgStatus,
  tier: EsgTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs <= 0) return 0;
  return Math.round(remainingMs / (1000 * 60 * 60 * 24) * 10) / 10;
}

// Regulator filing window — days remaining to JSE SRL filing deadline.
// JSE annual sustainability disclosures must be filed within 6 months of
// the financial year end (default 30 June for SA financials ending 31 Dec).
export function regulatorFilingWindowDays(
  financialYearEnd: Date | null,
  now: Date,
): number {
  if (!financialYearEnd) return 0;
  const deadline = new Date(financialYearEnd.getTime());
  deadline.setUTCMonth(deadline.getUTCMonth() + 6);
  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs <= 0) return 0;
  return Math.round(remainingMs / (1000 * 60 * 60 * 24));
}

// Urgency band — composes tier + filing window + SLA window.
export type EsgUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(
  tier: EsgTier,
  filingWindowDays: number,
  slaDaysLeft: number,
): EsgUrgency {
  if (filingWindowDays > 0 && filingWindowDays < 14) return 'critical';
  if (slaDaysLeft > 0 && slaDaysLeft < 3) return 'critical';
  if (tier === 'strategic' || (filingWindowDays > 0 && filingWindowDays < 30)) return 'high';
  if (tier === 'material' || (slaDaysLeft > 0 && slaDaysLeft < 14)) return 'high';
  if (tier === 'standard' || (filingWindowDays > 0 && filingWindowDays < 90)) return 'medium';
  return 'low';
}

// Authority ladder driven by effective tier — who has to sign off on
// publication + filing + restatement.
export type EsgAuthority =
  | 'esg_analyst'
  | 'sustainability_director'
  | 'audit_committee_chair'
  | 'board_chair';

export function authorityRequired(tier: EsgTier): EsgAuthority {
  switch (tier) {
    case 'minor':     return 'esg_analyst';
    case 'standard':  return 'sustainability_director';
    case 'material':  return 'audit_committee_chair';
    case 'strategic': return 'board_chair';
  }
}
