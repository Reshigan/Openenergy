// ─────────────────────────────────────────────────────────────────────────
// Wave 91 — ICVCM CCP-eligibility Assessment & Label Lifecycle (Carbon).
//
// The QUALITY-LABEL "rating" layer of the carbon-credit market — entirely
// orthogonal to issuance (W82) / retirement (W17) / MRV (W11). After a
// project is registered (W37), the ICVCM (Integrity Council for the
// Voluntary Carbon Market) and aligned bodies run an independent integrity
// assessment that awards the CCP-eligible (Core Carbon Principles) label —
// the market's "investment-grade" mark that unlocks premium pricing AND
// CORSIA Phase-2 eligibility (mandatory for airline emissions retirements
// from 2027). This chain governs that assessment workflow end-to-end:
// requested → screening → eligibility check → assessment → VVB review →
// decision → label-granted / label-denied. Separate from issuance — a
// project can issue without ever obtaining the label, but the label is
// what differentiates a premium $25/tCO2e credit from a $4/tCO2e generic
// credit in the 2026 voluntary market.
//
// Family alignment — this is the carbon family's QUALITY layer:
//   [[project-wave37-carbon-registration-chain]] registers the project,
//   [[project-wave11-carbon-mrv-chain]] verifies a monitoring period,
//   [[project-wave82-carbon-issuance-chain]] MINTS the credits,
//   [[project-wave17-retirement-chain]] retires them,
//   [[project-wave73-poa-cpa-inclusion-chain]] manages programmatic inclusion,
//   THIS chain RATES THE INTEGRITY of the credits independently of issuance,
//   determining which credits qualify for CORSIA / SBTi / Article 6 / premium
//   buyer claims.
//
// Clean path:
//   requested → screening → eligibility_check → assessment_in_progress
//             → vvb_review → ccp_decision_pending
//             → ccp_label_granted                                  (terminal OK)
//
// Branches / terminals:
//   on_hold            — paused for integrity flag (governance change at
//                        registry, sanctions hit, methodology suspension).
//                        Resumes to screening.
//   returned           — gap found in the eligibility check requiring
//                        proponent remediation (missing safeguards docs,
//                        outdated PDD, no co-benefits evidence). Resubmit
//                        re-enters screening.
//   disputed           — proponent appeals an adverse VVB review or a
//                        ccp_decision_pending direction. Goes back to
//                        vvb_review for a re-evaluation.
//   ccp_label_denied   — decision: integrity criteria failed; label not
//                        granted. Terminal. Public market signal.
//   withdrawn          — proponent withdraws (often pre-assessment when
//                        anticipating denial). Terminal.
//
// Tiers (4) by ASSESSED ANNUAL VOLUME (tCO2e/yr) — drive SLA + reportability:
//   minor <100k / moderate <500k / major <2M / mega >=2M
// FLOOR: any HIGH-INTEGRITY-RISK sector (REDD+ / jurisdictional / avoidance
// methodologies / older Verra v2 methodologies) floors at 'major' regardless
// of volume — those credit categories ALWAYS warrant a deeper integrity
// assessment under ICVCM Assessment Framework v1.0.
//
// SLA matrix is INVERTED — the LARGER the volume (deeper rating diligence
// warranted), the LONGER every window. Same family as the rest of the carbon
// chains (W56/W65/W73/W82). Terminals carry no deadline.
//
// Reportability — the W91 SIGNATURE is INTEGRITY-MARK driven. The single
// hard market line of a quality-label assessment is the LABEL DECISION
// itself: a denial is a public market-rejection signal, a dispute on an
// adverse review is a notifiable appeal:
//   deny_ccp_label    crosses for EVERY tier — the distinctive W91 hard
//                     line. A market-rejection signal published in the
//                     ICVCM register is ALWAYS notifiable (SARB carbon-
//                     desk + DFFE DNA + ICVCM oversight). Sister of W45
//                     write_off / W77 declare_breach / W68 declare_default
//                     / W82 raise_dispute / W90 terminate_legacy.
//   grant_ccp_label   crosses for EVERY tier when CONDITIONAL (a risk-
//                     flagged grant under ICVCM AF v1.0 §5) — conditional
//                     CCP-eligibility is reportable so buyers know the
//                     conditions. Unconditional grants cross for major+mega.
//   raise_dispute     (appeal) crosses for major+mega only — the appeal
//                     concentration threshold.
//   sla_breached      crosses for major+mega only.
//
// Single carbon-fund desk write {admin, carbon_fund} — the desk (acting as
// the assessment coordinating entity) records the whole label lifecycle
// (same single-party model as every carbon chain). actor_party tags the
// function performing each step (proponent / icvcm / vvb / quality_assessor)
// for audit attribution only, NOT access.
// ─────────────────────────────────────────────────────────────────────────

export type CcpAssessmentStatus =
  | 'requested'
  | 'screening'
  | 'eligibility_check'
  | 'assessment_in_progress'
  | 'vvb_review'
  | 'ccp_decision_pending'
  | 'ccp_label_granted'
  | 'on_hold'
  | 'returned'
  | 'disputed'
  | 'ccp_label_denied'
  | 'withdrawn';

export type CcpAssessmentAction =
  | 'begin_screening'
  | 'begin_eligibility_check'
  | 'begin_assessment'
  | 'complete_vvb_review'
  | 'submit_for_decision'
  | 'grant_ccp_label'
  | 'deny_ccp_label'
  | 'place_on_hold'
  | 'resume'
  | 'return_for_remediation'
  | 'resubmit'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'withdraw';

export type CcpAssessmentTier = 'minor' | 'moderate' | 'major' | 'mega';

export type CcpAssessmentParty = 'proponent' | 'icvcm' | 'vvb' | 'quality_assessor';

export type CcpSector =
  | 'redd_plus'              // forest carbon — high integrity risk
  | 'jurisdictional'         // jurisdictional REDD+/landscape — high integrity risk
  | 'avoidance'              // avoidance methodologies (older Verra v2) — high risk
  | 'arr'                    // afforestation/reforestation/revegetation
  | 'improved_forest_mgmt'   // IFM
  | 'cookstove'              // efficient cookstoves
  | 'renewable_energy'       // grid renewable energy
  | 'methane'                // methane capture/avoidance
  | 'industrial_gas'         // HFC/N2O destruction
  | 'engineered_removal'     // DAC, BECCS, biochar
  | 'soil_carbon'            // agricultural soil carbon
  | 'blue_carbon';           // mangroves, seagrass

export type CcpLabelClass = 'ccp_eligible' | 'ccp_conditional' | 'ccp_not_eligible';

export type CcpAssessmentEvent =
  | 'ccp_assessment.screening'
  | 'ccp_assessment.eligibility_check'
  | 'ccp_assessment.assessment_in_progress'
  | 'ccp_assessment.vvb_review'
  | 'ccp_assessment.ccp_decision_pending'
  | 'ccp_assessment.ccp_label_granted'
  | 'ccp_assessment.on_hold'
  | 'ccp_assessment.returned'
  | 'ccp_assessment.disputed'
  | 'ccp_assessment.ccp_label_denied'
  | 'ccp_assessment.withdrawn'
  | 'ccp_assessment.sla_breached';

const TERMINALS = new Set<CcpAssessmentStatus>([
  'ccp_label_granted',
  'ccp_label_denied',
  'withdrawn',
]);

const PRE_DECISION_WITHDRAWABLE = new Set<CcpAssessmentStatus>([
  'requested',
  'screening',
  'eligibility_check',
  'assessment_in_progress',
  'vvb_review',
  'ccp_decision_pending',
  'on_hold',
  'returned',
  'disputed',
]);

export function isTerminal(s: CcpAssessmentStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: CcpAssessmentStatus): boolean {
  return PRE_DECISION_WITHDRAWABLE.has(s);
}

export const TRANSITIONS: Record<CcpAssessmentAction, { from: CcpAssessmentStatus[]; to: CcpAssessmentStatus }> = {
  begin_screening:         { from: ['requested'],                                                                                          to: 'screening' },
  begin_eligibility_check: { from: ['screening'],                                                                                          to: 'eligibility_check' },
  begin_assessment:        { from: ['eligibility_check'],                                                                                  to: 'assessment_in_progress' },
  complete_vvb_review:     { from: ['assessment_in_progress'],                                                                             to: 'vvb_review' },
  submit_for_decision:     { from: ['vvb_review'],                                                                                         to: 'ccp_decision_pending' },
  grant_ccp_label:         { from: ['ccp_decision_pending'],                                                                               to: 'ccp_label_granted' },
  deny_ccp_label:          { from: ['ccp_decision_pending'],                                                                               to: 'ccp_label_denied' },
  place_on_hold:           { from: ['screening', 'eligibility_check', 'assessment_in_progress', 'vvb_review', 'ccp_decision_pending'],     to: 'on_hold' },
  resume:                  { from: ['on_hold'],                                                                                            to: 'screening' },
  return_for_remediation:  { from: ['eligibility_check', 'assessment_in_progress'],                                                        to: 'returned' },
  resubmit:                { from: ['returned'],                                                                                           to: 'screening' },
  raise_dispute:           { from: ['vvb_review', 'ccp_decision_pending'],                                                                 to: 'disputed' },
  resolve_dispute:         { from: ['disputed'],                                                                                           to: 'vvb_review' },
  withdraw:                { from: ['requested', 'screening', 'eligibility_check', 'assessment_in_progress', 'vvb_review', 'ccp_decision_pending', 'on_hold', 'returned', 'disputed'], to: 'withdrawn' },
};

export function nextStatus(current: CcpAssessmentStatus, action: CcpAssessmentAction): CcpAssessmentStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: CcpAssessmentStatus): CcpAssessmentAction[] {
  const acts: CcpAssessmentAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [CcpAssessmentAction, typeof TRANSITIONS[CcpAssessmentAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const DAY = 24 * 60 * MIN;

// INVERTED matrix — the LARGER the assessed volume (deeper rating diligence
// warranted), the LONGER every window. Strictly increasing minor → mega per
// graded state. Terminals carry no deadline.
export const SLA_MINUTES: Record<CcpAssessmentStatus, Record<CcpAssessmentTier, number>> = {
  requested:               { minor: 3 * DAY,  moderate: 5 * DAY,  major: 7 * DAY,  mega: 10 * DAY },
  screening:               { minor: 5 * DAY,  moderate: 7 * DAY,  major: 10 * DAY, mega: 14 * DAY },
  eligibility_check:       { minor: 7 * DAY,  moderate: 10 * DAY, major: 14 * DAY, mega: 21 * DAY },
  assessment_in_progress:  { minor: 14 * DAY, moderate: 21 * DAY, major: 30 * DAY, mega: 45 * DAY },
  vvb_review:              { minor: 10 * DAY, moderate: 14 * DAY, major: 21 * DAY, mega: 30 * DAY },
  ccp_decision_pending:    { minor: 7 * DAY,  moderate: 10 * DAY, major: 14 * DAY, mega: 21 * DAY },
  on_hold:                 { minor: 14 * DAY, moderate: 21 * DAY, major: 30 * DAY, mega: 45 * DAY },
  returned:                { minor: 21 * DAY, moderate: 30 * DAY, major: 45 * DAY, mega: 60 * DAY },
  disputed:                { minor: 14 * DAY, moderate: 21 * DAY, major: 30 * DAY, mega: 45 * DAY },
  ccp_label_granted:       { minor: 0, moderate: 0, major: 0, mega: 0 },
  ccp_label_denied:        { minor: 0, moderate: 0, major: 0, mega: 0 },
  withdrawn:               { minor: 0, moderate: 0, major: 0, mega: 0 },
};

export function slaWindowMinutes(status: CcpAssessmentStatus, tier: CcpAssessmentTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: CcpAssessmentStatus, tier: CcpAssessmentTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// High-integrity-risk sectors per ICVCM Assessment Framework v1.0 — these
// floor at 'major' tier regardless of volume because the integrity scrutiny
// band is always heightened.
const HIGH_INTEGRITY_RISK_SECTORS = new Set<CcpSector>([
  'redd_plus',
  'jurisdictional',
  'avoidance',
]);

export function isHighIntegrityRisk(sector: CcpSector): boolean {
  return HIGH_INTEGRITY_RISK_SECTORS.has(sector);
}

const TIER_RANK: Record<CcpAssessmentTier, number> = { minor: 0, moderate: 1, major: 2, mega: 3 };
const LARGE_TIERS = new Set<CcpAssessmentTier>(['major', 'mega']);

export function isLargeTier(tier: CcpAssessmentTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Base tier by assessed annual volume (tCO2e/yr).
export function baseTierForVolume(annualTco2e: number): CcpAssessmentTier {
  if (annualTco2e < 100000) return 'minor';
  if (annualTco2e < 500000) return 'moderate';
  if (annualTco2e < 2000000) return 'major';
  return 'mega';
}

// Effective tier — base tier raised to 'major' floor when the sector is
// high-integrity-risk.
export function tierForAssessment(annualTco2e: number, sector: CcpSector): CcpAssessmentTier {
  const base = baseTierForVolume(annualTco2e);
  if (isHighIntegrityRisk(sector) && TIER_RANK[base] < TIER_RANK['major']) {
    return 'major';
  }
  return base;
}

// Reportability matrix (the W91 SIGNATURE is INTEGRITY-MARK driven):
//   - deny_ccp_label crosses for EVERY tier — the public market-rejection
//     signal is ALWAYS notifiable. (W91 SIGNATURE; sister to W82 raise_dispute,
//     W90 terminate_legacy, W77 declare_breach, W68 declare_default, W45 write_off.)
//   - grant_ccp_label crosses for EVERY tier when CONDITIONAL (a risk-flagged
//     grant under ICVCM AF v1.0 §5); else for major+mega only.
//   - raise_dispute (appeal) crosses for major+mega only (concentration).
export function crossesIntoRegulator(action: CcpAssessmentAction, tier: CcpAssessmentTier, conditional = false): boolean {
  if (action === 'deny_ccp_label') return true;
  if (action === 'grant_ccp_label') return conditional || LARGE_TIERS.has(tier);
  if (action === 'raise_dispute') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: CcpAssessmentTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true
// when the sector is high-integrity-risk OR volume is large.
export function isReportable(tier: CcpAssessmentTier, sector: CcpSector): boolean {
  return isHighIntegrityRisk(sector) || LARGE_TIERS.has(tier);
}

// Party each action represents (functional role around the assessment).
// PROPONENT lodges / resubmits / withdraws / appeals; ICVCM does the decision
// and label grant/denial; VVB does the verification body review; QUALITY_ASSESSOR
// runs the detailed 10-criterion scoring. Audit attribution only.
const ACTION_PARTY: Record<CcpAssessmentAction, CcpAssessmentParty> = {
  begin_screening:         'icvcm',
  begin_eligibility_check: 'icvcm',
  begin_assessment:        'quality_assessor',
  complete_vvb_review:     'vvb',
  submit_for_decision:     'icvcm',
  grant_ccp_label:         'icvcm',
  deny_ccp_label:          'icvcm',
  place_on_hold:           'icvcm',
  resume:                  'icvcm',
  return_for_remediation:  'icvcm',
  resubmit:                'proponent',
  raise_dispute:           'proponent',
  resolve_dispute:         'icvcm',
  withdraw:                'proponent',
};

export function partyForAction(action: CcpAssessmentAction): CcpAssessmentParty {
  return ACTION_PARTY[action];
}

// ── "Beat best-in-class" decision helpers ─────────────────────────────────
// Sylvera, BeZero Carbon, Calyx Global, Renoster, Pachama all publish credit
// ratings but use opaque proprietary methodologies and lag the market. The
// ICVCM Assessment Framework v1.0 (2024) is the open-standard challenger,
// awarded by accredited Validation & Verification Bodies. The platform's
// edge is LIVE calculated CCP criteria scoring exposed on every record:
// 10-criterion aggregate, weakest-criterion identification, CORSIA Phase-2
// eligibility derivation, market premium-pricing uplift, and equivalent
// grade mapping to the major rating agencies — all derived from the same
// inputs each transition.

// The 10 ICVCM Core Carbon Principles (CCP) criteria. Each scored 0-100.
export type CcpCriterion =
  | 'effective_governance'
  | 'tracking_system'
  | 'transparency'
  | 'robust_quantification'
  | 'no_double_counting'
  | 'permanence'
  | 'additionality'
  | 'sustainable_development'
  | 'transition_to_net_zero'
  | 'safeguards';

export const CCP_CRITERIA: CcpCriterion[] = [
  'effective_governance',
  'tracking_system',
  'transparency',
  'robust_quantification',
  'no_double_counting',
  'permanence',
  'additionality',
  'sustainable_development',
  'transition_to_net_zero',
  'safeguards',
];

export interface CcpScoreCard {
  effective_governance: number;
  tracking_system: number;
  transparency: number;
  robust_quantification: number;
  no_double_counting: number;
  permanence: number;
  additionality: number;
  sustainable_development: number;
  transition_to_net_zero: number;
  safeguards: number;
}

// CCP threshold — each criterion must clear 70/100. Aggregate must clear
// 80/100 for full eligibility, 70/100 for conditional.
export const CRITERION_PASS_THRESHOLD = 70;
export const ELIGIBLE_AGGREGATE_THRESHOLD = 80;
export const CONDITIONAL_AGGREGATE_THRESHOLD = 70;
// Below this, any single criterion triggers a market-integrity flag
// (auto-deny path).
export const INTEGRITY_FLOOR = 50;

function clamp(x: number, lo: number, hi: number): number {
  if (!isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

export function ccpAggregateScore(scores: Partial<CcpScoreCard>): number {
  let sum = 0;
  let n = 0;
  for (const c of CCP_CRITERIA) {
    const v = scores[c];
    if (typeof v === 'number' && isFinite(v)) {
      sum += clamp(v, 0, 100);
      n++;
    }
  }
  if (n === 0) return 0;
  return Math.round((sum / n) * 10) / 10;
}

// Returns the WEAKEST criterion (name + score) — the one that determines
// whether the label can be granted at all. If all are at 100 returns
// effective_governance with 100; if nothing scored returns null.
export function weakestCriterion(scores: Partial<CcpScoreCard>): { criterion: CcpCriterion; score: number } | null {
  let weakest: { criterion: CcpCriterion; score: number } | null = null;
  for (const c of CCP_CRITERIA) {
    const v = scores[c];
    if (typeof v === 'number' && isFinite(v)) {
      const s = clamp(v, 0, 100);
      if (!weakest || s < weakest.score) weakest = { criterion: c, score: s };
    }
  }
  return weakest;
}

// Count criteria below the pass threshold — the "gap count" (zero = full
// pass; >=1 = label cannot be granted without remediation).
export function gapCount(scores: Partial<CcpScoreCard>): number {
  let gaps = 0;
  for (const c of CCP_CRITERIA) {
    const v = scores[c];
    if (typeof v === 'number' && isFinite(v) && clamp(v, 0, 100) < CRITERION_PASS_THRESHOLD) gaps++;
  }
  return gaps;
}

// Whether the project crosses the market-integrity floor — true when ANY
// criterion scores below INTEGRITY_FLOOR (auto-deny path).
export function crossesIntegrityFloor(scores: Partial<CcpScoreCard>): boolean {
  for (const c of CCP_CRITERIA) {
    const v = scores[c];
    if (typeof v === 'number' && isFinite(v) && clamp(v, 0, 100) < INTEGRITY_FLOOR) return true;
  }
  return false;
}

// Derive the label class from the scorecard. Eligible requires ALL criteria
// pass AND aggregate >=80; conditional requires ALL criteria pass AND
// aggregate >=70; otherwise not eligible.
export function labelClassForScores(scores: Partial<CcpScoreCard>): CcpLabelClass {
  const gaps = gapCount(scores);
  if (gaps > 0) return 'ccp_not_eligible';
  const agg = ccpAggregateScore(scores);
  if (agg >= ELIGIBLE_AGGREGATE_THRESHOLD) return 'ccp_eligible';
  if (agg >= CONDITIONAL_AGGREGATE_THRESHOLD) return 'ccp_conditional';
  return 'ccp_not_eligible';
}

// CORSIA Phase 2 (2027-35 mandatory) eligibility — only ccp_eligible labels
// qualify. Conditional labels are NOT CORSIA Phase 2 eligible.
export function corsiaPhase2Eligible(labelClass: CcpLabelClass): boolean {
  return labelClass === 'ccp_eligible';
}

// Equivalent letter-grade in the Sylvera/BeZero/Calyx style — useful for
// market-side rating comparison.
export function sylveraGradeEquivalent(aggregate: number): 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'C' | 'D' | 'F' {
  const a = clamp(aggregate, 0, 100);
  if (a >= 90) return 'AAA';
  if (a >= 85) return 'AA';
  if (a >= 80) return 'A';
  if (a >= 75) return 'BBB';
  if (a >= 70) return 'BB';
  if (a >= 65) return 'B';
  if (a >= 55) return 'C';
  if (a >= 45) return 'D';
  return 'F';
}

// Premium pricing uplift versus a generic non-rated credit. CCP-eligible
// commands ~+30% (the post-2024 CORSIA / SBTi premium), conditional ~+15%,
// not-eligible 0.
export function premiumPricingUpliftPct(labelClass: CcpLabelClass): number {
  if (labelClass === 'ccp_eligible') return 30;
  if (labelClass === 'ccp_conditional') return 15;
  return 0;
}

// Predicted full-assessment turnaround (days) — sum of forward path SLA
// windows for the tier from requested through to ccp_decision_pending.
// Lets the desk quote a realistic label decision date up front (beats the
// 6-12 month opaque process at Sylvera/BeZero).
export function predictedAssessmentDays(tier: CcpAssessmentTier): number {
  const forward: CcpAssessmentStatus[] = [
    'requested',
    'screening',
    'eligibility_check',
    'assessment_in_progress',
    'vvb_review',
    'ccp_decision_pending',
  ];
  const minutes = forward.reduce((sum, s) => sum + (SLA_MINUTES[s]?.[tier] ?? 0), 0);
  return Math.round(minutes / DAY);
}
