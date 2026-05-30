// ─────────────────────────────────────────────────────────────────────────
// Wave 109 — Carbon Credit Quality Rating & Continuous Re-rating Chain.
//
// 11th Carbon chain. Sister of W37 (registration PDD) + W11 (MRV
// verification) + W42 (reversal / buffer pool) + W56 (crediting renewal).
// Beats Sylvera / BeZero Carbon Ratings / Pachama Verified Credits /
// Renoster Carbon Ratings / Calyx Global / Carbon Direct CDx / Patch
// Quality Layer / Cloverly Quality Tags / S&P Global carbon methodology /
// Moody's KYC Carbon. Each surfaces a rating as a single static letter;
// W109 turns it into a 12-state P6 chain with INVERTED SLA polarity,
// FLOOR-AT-PREMIUM tier overlay, 4-step authority ladder, 17-field LIVE
// battery (composite_score + 5 sub-scores + S&P-style 8-band + 3-bridge
// architecture to W37 / W11 / W42 + ICROA bonus), continuous monitoring
// with auto re-rating, and signature regulator crossings.
//
// Standards: CCP Core Carbon Principles + ICROA Code of Best Practice +
// Article 6.4 Methodologies + ISO 14064-3 (GHG validation/verification) +
// VCS/Verra integrity standards.
//
// Forward path (clean rating to monitoring):
//   rating_requested → desk_review → methodology_score → additionality_score
//     → permanence_score → leakage_score → cobenefit_score → composite_score
//     → published → monitoring → re_rating_triggered → re_rated (HARD-terminal)
//
// Branches:
//   monitoring → downgraded (terminal — composite dropped >=20% from prior;
//                            auto-alerts every buyer-holder; can re-enter
//                            at monitoring after issuer remediates via
//                            remediate action)
//   any pre-published state → withdrawn (terminal — issuer disputes +
//                                        rater withdraws rating)
//   any non-terminal state → escalated_to_integrity (terminal — fraud /
//                                                    manipulation finding;
//                                                    hands off to W42
//                                                    reversal/buffer chain)
//
// Tier RE-DERIVED on every transition from credit_vintage_year +
// scope_scale_tonnes with FLOOR-AT-PREMIUM on 5 flags:
//   - afolu_high_reversal_risk
//   - methodology_under_review
//   - external_credit_red_flag
//   - ccp_aligned_project
//   - article_6_authorised
//
// 4 tiers:
//   basic         : <50k tCO2e single-vintage voluntary
//   standard      : 50k-500k tCO2e OR multi-vintage
//   premium       : 500k-5m tCO2e OR 1 floor flag OR Article 6
//   institutional : >=5m tCO2e OR 2+ floor flags OR CCP-aligned OR
//                   institutional buyer
//
// INVERTED SLA polarity (institutional = LONGEST runway — premium ratings
// need deeper field-data verification) stored as HOURS. Anchor on
// rating_requested:
//   basic         × rating_requested =  30d =  720 hrs
//   standard      × rating_requested =  60d = 1440 hrs
//   premium       × rating_requested = 120d = 2880 hrs
//   institutional × rating_requested = 180d = 4320 hrs
// Re-rating windows tighter (monitoring data is already in-hand):
//   basic         × re_rating_triggered =  14d =  336 hrs
//   institutional × re_rating_triggered =  90d = 2160 hrs
//
// SIGNATURE regulator crossings (CCP + ICROA + Art 6.4 + ISO 14064-3 +
// VCS/Verra integrity):
//   downgrade              → regulator EVERY tier on composite_drop_pct
//                             >=20% OR rating_band drops to CCC/D
//                             (W109 SIGNATURE — material rating downgrade
//                             always reportable to all buyer-holders +
//                             voluntary registries; sister of W104 reject
//                             EVERY tier on regulator_relevant + W105
//                             raise_dispute EVERY tier on HV_brp + W106
//                             impose_sanction EVERY tier on
//                             licence_revocation + W107 reject_order
//                             EVERY tier on counterparty_below_B + W108
//                             escalate_to_default EVERY tier)
//   escalate_to_integrity  → regulator EVERY tier (fraud finding hands
//                             off to W42 reversal)
//   publish_rating         → regulator premium+institutional when
//                             Article 6 (authorization status disclosed)
//   withdraw               → regulator EVERY tier when issuer_disputed
//                             (withdrawing under dispute = integrity event)
//   sla_breached           → premium+institutional only
//
// Write {admin, carbon_fund}. READ all 9 personas. actor_party split:
//   rater writes:  start_desk_review, score_methodology, score_additionality,
//                  score_permanence, score_leakage, score_cobenefits,
//                  compute_composite, publish_rating, start_monitoring,
//                  trigger_rerating, rerate, downgrade, withdraw,
//                  escalate_to_integrity
//   issuer writes: remediate (re-entry from downgraded back to monitoring)
//   (request_rating is the create action; no buyer-write action since
//   buyer acknowledgement happens server-side on downgrade fan-out)
//
// Event prefix: `carbon_rating_evt_`. AUDIT_PREFIX_MAP: carbon_credit_rating
// → 'carbon'. Two crons:
//   - */15 * * * *  SLA sweep
//   - 5 0 * * *      monitoring-freshness scan (>=90d data stale triggers
//                    auto trigger_rerating)
// ─────────────────────────────────────────────────────────────────────────

export type CcrStatus =
  | 'rating_requested'
  | 'desk_review'
  | 'methodology_score'
  | 'additionality_score'
  | 'permanence_score'
  | 'leakage_score'
  | 'cobenefit_score'
  | 'composite_score'
  | 'published'
  | 'monitoring'
  | 're_rating_triggered'
  | 're_rated'
  | 'downgraded'
  | 'withdrawn'
  | 'escalated_to_integrity';

export type CcrAction =
  | 'request_rating'
  | 'start_desk_review'
  | 'score_methodology'
  | 'score_additionality'
  | 'score_permanence'
  | 'score_leakage'
  | 'score_cobenefits'
  | 'compute_composite'
  | 'publish_rating'
  | 'start_monitoring'
  | 'trigger_rerating'
  | 'rerate'
  | 'downgrade'
  | 'withdraw'
  | 'escalate_to_integrity'
  | 'remediate';

export type CcrTier = 'basic' | 'standard' | 'premium' | 'institutional';

export type CcrParty = 'rater' | 'issuer' | 'buyer';

export type CcrRatingBand =
  | 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';

export type CcrEvent =
  | 'carbon_rating_requested'
  | 'carbon_rating_desk_review_started'
  | 'carbon_rating_methodology_scored'
  | 'carbon_rating_additionality_scored'
  | 'carbon_rating_permanence_scored'
  | 'carbon_rating_leakage_scored'
  | 'carbon_rating_cobenefit_scored'
  | 'carbon_rating_composite_computed'
  | 'carbon_rating_published'
  | 'carbon_rating_monitoring_started'
  | 'carbon_rating_rerating_triggered'
  | 'carbon_rating_rerated'
  | 'carbon_rating_downgraded'
  | 'carbon_rating_withdrawn'
  | 'carbon_rating_escalated_integrity'
  | 'carbon_rating_remediated'
  | 'carbon_rating_sla_breached';

// Hard terminals — rerated / withdrawn / escalated_to_integrity reject
// every action. downgraded is "soft terminal" — issuer can re-enter via
// remediate.
const HARD_TERMINALS = new Set<CcrStatus>([
  're_rated',
  'withdrawn',
  'escalated_to_integrity',
]);

const UI_TERMINALS = new Set<CcrStatus>([
  're_rated',
  'downgraded',
  'withdrawn',
  'escalated_to_integrity',
]);

export function isTerminal(s: CcrStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: CcrStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const PRE_PUBLISHED: CcrStatus[] = [
  'rating_requested', 'desk_review', 'methodology_score',
  'additionality_score', 'permanence_score', 'leakage_score',
  'cobenefit_score', 'composite_score',
];

// All non-terminal states (escalate_to_integrity can fire from any non-
// terminal — fraud may be discovered at any point).
const ALL_NON_TERMINAL: CcrStatus[] = [
  'rating_requested', 'desk_review', 'methodology_score',
  'additionality_score', 'permanence_score', 'leakage_score',
  'cobenefit_score', 'composite_score', 'published', 'monitoring',
  're_rating_triggered',
];

export const TRANSITIONS: Record<CcrAction, { from: CcrStatus[]; to: CcrStatus }> = {
  request_rating:        { from: ['rating_requested'],          to: 'rating_requested' },
  start_desk_review:     { from: ['rating_requested'],          to: 'desk_review' },
  score_methodology:     { from: ['desk_review'],               to: 'methodology_score' },
  score_additionality:   { from: ['methodology_score'],         to: 'additionality_score' },
  score_permanence:      { from: ['additionality_score'],       to: 'permanence_score' },
  score_leakage:         { from: ['permanence_score'],          to: 'leakage_score' },
  score_cobenefits:      { from: ['leakage_score'],             to: 'cobenefit_score' },
  compute_composite:     { from: ['cobenefit_score'],           to: 'composite_score' },
  publish_rating:        { from: ['composite_score'],           to: 'published' },
  start_monitoring:      { from: ['published'],                 to: 'monitoring' },
  trigger_rerating:      { from: ['monitoring'],                to: 're_rating_triggered' },
  rerate:                { from: ['re_rating_triggered'],       to: 're_rated' },
  downgrade:             { from: ['monitoring', 're_rating_triggered'], to: 'downgraded' },
  withdraw:              { from: PRE_PUBLISHED,                 to: 'withdrawn' },
  escalate_to_integrity: { from: ALL_NON_TERMINAL,              to: 'escalated_to_integrity' },
  remediate:             { from: ['downgraded'],                to: 'monitoring' },
};

export function nextStatus(current: CcrStatus, action: CcrAction): CcrStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  // request_rating is the create action.
  if (action === 'request_rating' && current !== 'rating_requested') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: CcrStatus): CcrAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: CcrAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [CcrAction, typeof TRANSITIONS[CcrAction]][]) {
    if (a === 'request_rating') continue; // not a transition
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA (terminals).
const HOUR = 1;
const DAY = 24 * HOUR;

export const SLA_HOURS: Record<CcrStatus, Record<CcrTier, number>> = {
  rating_requested:       { basic:  30 * DAY, standard:  60 * DAY, premium: 120 * DAY, institutional: 180 * DAY },
  desk_review:            { basic:   7 * DAY, standard:  14 * DAY, premium:  21 * DAY, institutional:  30 * DAY },
  methodology_score:      { basic:   5 * DAY, standard:  10 * DAY, premium:  15 * DAY, institutional:  21 * DAY },
  additionality_score:    { basic:   5 * DAY, standard:  10 * DAY, premium:  15 * DAY, institutional:  21 * DAY },
  permanence_score:       { basic:   5 * DAY, standard:  10 * DAY, premium:  15 * DAY, institutional:  21 * DAY },
  leakage_score:          { basic:   5 * DAY, standard:  10 * DAY, premium:  15 * DAY, institutional:  21 * DAY },
  cobenefit_score:        { basic:   5 * DAY, standard:  10 * DAY, premium:  15 * DAY, institutional:  21 * DAY },
  composite_score:        { basic:   3 * DAY, standard:   5 * DAY, premium:   7 * DAY, institutional:  10 * DAY },
  published:              { basic:   3 * DAY, standard:   5 * DAY, premium:   7 * DAY, institutional:  10 * DAY },
  monitoring:             { basic:  90 * DAY, standard: 180 * DAY, premium: 270 * DAY, institutional: 365 * DAY },
  re_rating_triggered:    { basic:  14 * DAY, standard:  30 * DAY, premium:  60 * DAY, institutional:  90 * DAY },
  re_rated:               { basic: 0, standard: 0, premium: 0, institutional: 0 },
  downgraded:             { basic: 0, standard: 0, premium: 0, institutional: 0 },
  withdrawn:              { basic: 0, standard: 0, premium: 0, institutional: 0 },
  escalated_to_integrity: { basic: 0, standard: 0, premium: 0, institutional: 0 },
};

export function slaWindowHours(status: CcrStatus, tier: CcrTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: CcrStatus, tier: CcrTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from vintage_year + scope_scale_tonnes.
//   basic         : <50k tCO2e single-vintage
//   standard      : 50k-500k tCO2e OR multi-vintage
//   premium       : 500k-5m tCO2e OR 1 floor flag OR Article 6
//   institutional : >=5m tCO2e OR 2+ floor flags OR CCP-aligned OR
//                   institutional buyer
export function tierForScale(
  scaleTonnes: number | null | undefined,
  multiVintage: boolean | number | null | undefined,
): CcrTier {
  const v = Number(scaleTonnes ?? 0);
  const mv = Boolean(multiVintage);
  if (!isFinite(v) || v < 0) return 'basic';
  if (v >= 5_000_000) return 'institutional';
  if (v >= 500_000)   return 'premium';
  if (v >= 50_000 || mv) return 'standard';
  return 'basic';
}

export interface CcrFloorFlags {
  afolu_high_reversal_risk?: boolean | number | null;
  methodology_under_review?: boolean | number | null;
  external_credit_red_flag?: boolean | number | null;
  ccp_aligned_project?: boolean | number | null;
  article_6_authorised?: boolean | number | null;
}

export function countFloorFlags(args: CcrFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.afolu_high_reversal_risk) +
    t(args.methodology_under_review) +
    t(args.external_credit_red_flag) +
    t(args.ccp_aligned_project) +
    t(args.article_6_authorised)
  );
}

// FLOOR-AT-PREMIUM on any one floor flag OR Article 6.
export function floorAtPremium(args: CcrFloorFlags): boolean {
  if (args.article_6_authorised) return true;
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-INSTITUTIONAL on:
//   - 2+ floor flags
//   - ccp_aligned_project (CCP-aligned = institutional rating audience)
//   - institutional_buyer (passed separately)
export function floorAtInstitutional(
  args: CcrFloorFlags,
  institutionalBuyer: boolean | number | null | undefined,
): boolean {
  if (countFloorFlags(args) >= 2) return true;
  if (args.ccp_aligned_project) return true;
  if (institutionalBuyer) return true;
  return false;
}

export function effectiveTier(
  rawTier: CcrTier,
  flags: CcrFloorFlags,
  institutionalBuyer?: boolean | number | null,
): CcrTier {
  if (floorAtInstitutional(flags, institutionalBuyer)) return 'institutional';
  if (floorAtPremium(flags)) {
    if (rawTier === 'basic' || rawTier === 'standard') return 'premium';
    return rawTier;
  }
  return rawTier;
}

// Heavy tiers — premium + institutional. Where reportability + signature
// crossings attach when not on universal hard lines.
const HEAVY_TIERS = new Set<CcrTier>(['premium', 'institutional']);

export function isHeavyTier(tier: CcrTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: CcrTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Composite scoring + S&P-style 8-band ───────────────────────────────

// Composite score (0-100) is a weighted average of the 5 sub-scores plus
// an ICROA-aligned +5 bonus (capped at 100).
//   methodology   : 25%
//   additionality : 25%
//   permanence    : 20%
//   leakage       : 15%
//   cobenefits    : 15%
export function computeCompositeScore(args: {
  methodology_score?: number | null;
  additionality_score?: number | null;
  permanence_score?: number | null;
  leakage_score?: number | null;
  cobenefit_score?: number | null;
  icroa_aligned?: boolean | number | null;
}): number {
  const m = clamp01_100(args.methodology_score);
  const a = clamp01_100(args.additionality_score);
  const p = clamp01_100(args.permanence_score);
  const l = clamp01_100(args.leakage_score);
  const c = clamp01_100(args.cobenefit_score);
  const base = (m * 25 + a * 25 + p * 20 + l * 15 + c * 15) / 100;
  const bonus = args.icroa_aligned ? 5 : 0;
  const total = base + bonus;
  if (total < 0) return 0;
  if (total > 100) return 100;
  return Math.round(total * 100) / 100;
}

function clamp01_100(n: number | null | undefined): number {
  const v = Number(n ?? 0);
  if (!isFinite(v) || v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

// S&P-style 8-band derived from composite score.
//   95+  AAA   strongest credits
//   90+  AA
//   80+  A
//   70+  BBB   investment grade floor (CCP threshold)
//   60+  BB    speculative
//   50+  B
//   40+  CCC   highly speculative / impaired
//   <40  D     default / disqualified
export function deriveRatingBand(composite: number | null | undefined): CcrRatingBand {
  const v = Number(composite ?? 0);
  if (!isFinite(v)) return 'D';
  if (v >= 95) return 'AAA';
  if (v >= 90) return 'AA';
  if (v >= 80) return 'A';
  if (v >= 70) return 'BBB';
  if (v >= 60) return 'BB';
  if (v >= 50) return 'B';
  if (v >= 40) return 'CCC';
  return 'D';
}

// Investment-grade floor — BBB and above are "investment grade". CCP
// alignment requires BBB+.
const INVESTMENT_GRADE = new Set<CcrRatingBand>(['AAA', 'AA', 'A', 'BBB']);
export function isInvestmentGrade(band: CcrRatingBand): boolean {
  return INVESTMENT_GRADE.has(band);
}

// Distressed band — CCC + D are distressed; downgrade INTO this band
// triggers the W109 SIGNATURE crossing regardless of tier.
const DISTRESSED = new Set<CcrRatingBand>(['CCC', 'D']);
export function isDistressedBand(band: CcrRatingBand): boolean {
  return DISTRESSED.has(band);
}

// Composite drop pct between prior + current (positive number = drop).
export function compositeDropPct(
  prior: number | null | undefined,
  current: number | null | undefined,
): number {
  const p = Number(prior ?? 0);
  const c = Number(current ?? 0);
  if (p <= 0) return 0;
  const drop = (p - c) / p * 100;
  if (!isFinite(drop)) return 0;
  return Math.round(drop * 100) / 100;
}

// Downgrade-imminent flag — composite dropped 10-19% but not yet a
// material downgrade. Buyers see a yellow "watch" before red.
export function downgradeImminent(dropPct: number): boolean {
  return dropPct >= 10 && dropPct < 20;
}

// Material downgrade — drop >=20% OR landed in distressed band. Triggers
// the W109 signature crossing regardless of tier.
export function isMaterialDowngrade(
  dropPct: number,
  band: CcrRatingBand,
): boolean {
  if (dropPct >= 20) return true;
  if (isDistressedBand(band)) return true;
  return false;
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
export function crossesIntoRegulator(
  action: CcrAction,
  tier: CcrTier,
  args: {
    composite_drop_pct?: number | null;
    rating_band?: CcrRatingBand | null;
    article_6_authorised?: boolean | number | null;
    issuer_disputed?: boolean | number | null;
  },
): boolean {
  const drop = Number(args.composite_drop_pct ?? 0);
  const band = (args.rating_band ?? 'D') as CcrRatingBand;
  const art6 = Boolean(args.article_6_authorised);
  const disp = Boolean(args.issuer_disputed);

  // SIGNATURE: downgrade crosses EVERY tier on material drop OR landed
  // in distressed band (CCC/D).
  if (action === 'downgrade') {
    if (isMaterialDowngrade(drop, band)) return true;
    return false;
  }

  // escalate_to_integrity crosses EVERY tier (fraud finding hands off to
  // W42).
  if (action === 'escalate_to_integrity') return true;

  // publish_rating crosses premium+institutional when Article 6.
  if (action === 'publish_rating') {
    if (art6 && HEAVY_TIERS.has(tier)) return true;
    return false;
  }

  // withdraw crosses EVERY tier when issuer_disputed=TRUE.
  if (action === 'withdraw') {
    return disp;
  }

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: CcrTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────

const ACTION_PARTY: Record<CcrAction, CcrParty> = {
  request_rating:        'issuer',
  start_desk_review:     'rater',
  score_methodology:     'rater',
  score_additionality:   'rater',
  score_permanence:      'rater',
  score_leakage:         'rater',
  score_cobenefits:      'rater',
  compute_composite:     'rater',
  publish_rating:        'rater',
  start_monitoring:      'rater',
  trigger_rerating:      'rater',
  rerate:                'rater',
  downgrade:             'rater',
  withdraw:              'rater',
  escalate_to_integrity: 'rater',
  remediate:             'issuer',
};

export function partyForAction(action: CcrAction): CcrParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: CcrAction): CcrEvent | null {
  switch (action) {
    case 'request_rating':        return 'carbon_rating_requested';
    case 'start_desk_review':     return 'carbon_rating_desk_review_started';
    case 'score_methodology':     return 'carbon_rating_methodology_scored';
    case 'score_additionality':   return 'carbon_rating_additionality_scored';
    case 'score_permanence':      return 'carbon_rating_permanence_scored';
    case 'score_leakage':         return 'carbon_rating_leakage_scored';
    case 'score_cobenefits':      return 'carbon_rating_cobenefit_scored';
    case 'compute_composite':     return 'carbon_rating_composite_computed';
    case 'publish_rating':        return 'carbon_rating_published';
    case 'start_monitoring':      return 'carbon_rating_monitoring_started';
    case 'trigger_rerating':      return 'carbon_rating_rerating_triggered';
    case 'rerate':                return 'carbon_rating_rerated';
    case 'downgrade':              return 'carbon_rating_downgraded';
    case 'withdraw':              return 'carbon_rating_withdrawn';
    case 'escalate_to_integrity': return 'carbon_rating_escalated_integrity';
    case 'remediate':             return 'carbon_rating_remediated';
  }
}

// ─── LIVE battery (17-field decoration) ─────────────────────────────────

export function slaHoursRemaining(
  status: CcrStatus,
  tier: CcrTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type CcrUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(
  tier: CcrTier,
  slaHoursLeft: number,
): CcrUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'institutional') {
    if (slaHoursLeft < 7 * 24)   return 'critical';
    if (slaHoursLeft < 30 * 24)  return 'high';
    if (slaHoursLeft < 90 * 24)  return 'medium';
    return 'low';
  }
  if (tier === 'premium') {
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
  // basic
  if (slaHoursLeft < 1 * 24)   return 'critical';
  if (slaHoursLeft < 3 * 24)   return 'high';
  if (slaHoursLeft < 10 * 24)  return 'medium';
  return 'low';
}

// 4-step authority ladder driven by effective tier.
export type CcrAuthority =
  | 'junior_analyst'
  | 'senior_analyst'
  | 'ratings_committee_chair'
  | 'board_rating_committee';

export function authorityRequired(tier: CcrTier): CcrAuthority {
  switch (tier) {
    case 'basic':         return 'junior_analyst';
    case 'standard':      return 'senior_analyst';
    case 'premium':       return 'ratings_committee_chair';
    case 'institutional': return 'board_rating_committee';
  }
}

// Regulator filing window hours.
export function regulatorFilingWindowHours(tier: CcrTier): number {
  switch (tier) {
    case 'institutional': return 24;
    case 'premium':       return 72;
    case 'standard':      return 168;
    case 'basic':         return 240;
  }
}

// Vintage age years from credit_vintage_year + now.
export function vintageAgeYears(
  vintageYear: number | null | undefined,
  now: Date,
): number {
  const vy = Number(vintageYear ?? 0);
  if (!isFinite(vy) || vy <= 0) return 0;
  const cy = now.getUTCFullYear();
  return cy - vy;
}

// Monitoring freshness days — how stale is the latest monitoring data?
export function monitoringFreshnessDays(
  lastDataAt: string | Date | null | undefined,
  now: Date,
): number | null {
  if (!lastDataAt) return null;
  const t = new Date(lastDataAt);
  if (isNaN(t.getTime())) return null;
  const ms = now.getTime() - t.getTime();
  return Math.round(ms / (24 * 3600 * 1000));
}

// Re-rating trigger threshold — if monitoring data freshness >= this many
// days, the daily cron auto-fires trigger_rerating.
export const MONITORING_STALE_DAYS = 90;

export function monitoringDataStale(
  lastDataAt: string | Date | null | undefined,
  now: Date,
): boolean {
  const d = monitoringFreshnessDays(lastDataAt, now);
  if (d === null) return false;
  return d >= MONITORING_STALE_DAYS;
}

// ─── 3-bridge architecture ──────────────────────────────────────────────
// W37 registration / W11 MRV / W42 reversal (buffer pool drawdown on
// downgrade)

export function bridgesToRegistrationChain(
  registrationRef: string | null | undefined,
): boolean {
  return !!registrationRef;
}

export function bridgesToMrvChain(
  mrvRef: string | null | undefined,
): boolean {
  return !!mrvRef;
}

export function bridgesToReversalChain(
  status: CcrStatus,
  reversalChainRef: string | null | undefined,
): boolean {
  if (status === 'downgraded' || status === 'escalated_to_integrity') return true;
  return !!reversalChainRef;
}

// Re-rating trigger count in last 30 days — quick "how unstable is this
// project" gauge.
export function reratingTriggerCount30d(events: Array<{ event_type: string; created_at: string | Date }>, now: Date): number {
  const cutoff = now.getTime() - 30 * 24 * 3600 * 1000;
  let n = 0;
  for (const e of events) {
    if (e.event_type !== 'carbon_rating_rerating_triggered') continue;
    const t = new Date(e.created_at).getTime();
    if (t >= cutoff) n++;
  }
  return n;
}

// Quality completeness index 0-100 — how many of the 5 sub-scores are in
// + composite_score derived + published. Used by the LIVE battery.
export function ratingCompletenessIndex(args: {
  methodology?: boolean | number | null;
  additionality?: boolean | number | null;
  permanence?: boolean | number | null;
  leakage?: boolean | number | null;
  cobenefit?: boolean | number | null;
  composite?: boolean | number | null;
  published?: boolean | number | null;
  monitoring?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.methodology)   * 15;
  score += t(args.additionality) * 15;
  score += t(args.permanence)    * 10;
  score += t(args.leakage)       * 10;
  score += t(args.cobenefit)     * 10;
  score += t(args.composite)     * 15;
  score += t(args.published)     * 15;
  score += t(args.monitoring)    * 10;
  if (score > 100) score = 100;
  return score;
}
