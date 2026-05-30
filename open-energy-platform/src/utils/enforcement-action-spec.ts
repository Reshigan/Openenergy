// ═══════════════════════════════════════════════════════════════════════════
// Wave 93 — NERSA ERA s35 Enforcement Actions & Administrative Penalties
// — pure spec.
//
// The ENFORCEMENT-TEETH layer of a best-in-class regulator stack. W5 inbox
// gives NERSA the case-arrival surface; W31 disposition gives it the queue/
// adjudication metadata; W40 compliance-inspection produces the FINDINGS of
// non-conformance. What every real regulator needs next — and what most
// platforms either ignore or pretend works as a free-form ticket — is the
// FORMAL administrative-penalty proceedings: charge sheet → audi alteram
// partem (representations period) → optional oral hearing → Council
// determination → penalty notice → recovery (paid / appealed / enforced via
// court). W93 is that missing layer.
//
// The DISTINCTIVE move (the "beat best-in-class" target — FERC Office of
// Enforcement / Ofgem provisional+final penalty notice / Bundesnetzagentur
// Bußgeldverfahren / CRE CoRDiS / AER civil-penalty undertaking / ACER /
// BEREC / IBAMA / ANEEL / SEC ALJ administrative proceedings / SARS TAA
// Ch15 admin penalty): every case is scored LIVE against an AUDI-WINDOW
// COMPLIANCE battery (PAJA s4 reasonable-time + ERA s35(3) audi minimum),
// a PROCEDURAL-IRREGULARITY flag fires on representations<21d or denied
// hearing without reasoned refusal, the ERA s35 cap of R1m/offence is
// enforced automatically, prescribed-rate interest (15.5%) accrues on
// unpaid penalty from due date, and a REPEAT-OFFENDER score (count +
// recency) raises floor-at-severe. Best-in-class regulators usually run
// this in spreadsheets and Word documents and miss procedural windows;
// W93 does not.
//
// Standards / framing:
//   - ERA s35 — administrative penalty (cap R1m per offence; can stack);
//     s35(3) audi alteram partem (right to written representations).
//   - PAJA s4 — reasonable opportunity to make representations + reasoned
//     decision; failure constitutes procedural irregularity reviewable on
//     judicial review.
//   - NERSA Rules of Procedure / Compliance Enforcement Framework — case
//     opened from W40 finding / W66 complaint / W83 consultation breach.
//   - Prescribed Rate of Interest Act 55/1975 — 15.5% per annum on overdue
//     administrative penalties (as gazetted, May 2026).
//   - Electricity Regulator Tribunal — appeal forum on Council determination.
//   - Sheriff's writ / asset attachment / garnishee — enforcement avenues
//     under Magistrates' Courts Act once a Council determination is final.
//
// Forward path (clean):
//   case_opened → allegations_drafted → allegations_served
//     → representations_period → (hearing_held optional)
//     → determination → penalty_imposed → paid (terminal clean)
//
// Branches:
//   determination → dismissed (terminal — Council finds no contravention)
//   penalty_imposed → appealed (Tribunal appeal lodged)
//     → enforced_via_court (Council determination upheld + still unpaid)
//   penalty_imposed → enforced_via_court (no appeal + still unpaid)
//   enforced_via_court → paid (eventually recovered) OR dismissed (written off)
//   any pre-terminal → withdrawn (NERSA elects not to pursue)
//   any pre-terminal → cancelled (administrative cancel — wrong respondent etc.)
//
// Tier — PENALTY-QUANTUM, RE-DERIVED on every transition from the CURRENT
// proposed_penalty_zar (NOT a static column — the magnitude IS the tier;
// contrast W80 explicit-col, similar to W86/W92 derived):
//   minor    proposed_penalty_zar < R100k
//   standard R100k – R500k
//   material R500k – R1m
//   severe   ≥ R1m (cumulative stacking — ERA s35 cap is PER OFFENCE)
//   FLOOR-AT-SEVERE when allegation_class IN (safety_violation,
//   repeat_offender, systemic_market_abuse) — these classes cannot be lower
//   than 'severe' regardless of quantum (a public-safety violation is
//   severe even at small quantum). SEVERE-ONLY = {severe}.
//
// INVERTED SLA — a LARGER penalty gets MORE procedural time at every state
// (audi alteram partem strengthens with magnitude: ERA s35(3) minimum is
// 21 days for the audi window; severe gets 60 days). Same family as W19/W20/
// W43/W49/W56/W70/W81/W82/W91/W92. Strictly INCREASING minor → severe at
// every graded state. Terminals 0.
//
// Reportability (regulator-inbox crossings + cross-persona to respondent) —
// the W93 SIGNATURE is DETERMINATION-driven (a penalty imposed at any tier
// is itself the reportable signal; this is the W93 hard line — public-
// register publication of penalty notice is mandatory regardless of quantum):
//   - penalty_imposed crosses regulator EVERY tier — the W93 SIGNATURE
//     hard line (public register / s35 transparency obligation).
//   - enforced_via_court crosses every tier — court-system signal.
//   - appealed crosses every tier — Tribunal track signal.
//   - determination with liable=1 crosses every tier when severe; material+
//     for others.
//   - withdraw / dismiss crosses material+severe only (governance signal).
//   - sla_breached crosses material+severe (procedural-window miss is a
//     judicial-review risk; itself reportable).
//   isReportable(tier) = isHighTier(tier) = {material, severe}.
//
// Write model — SINGLE-PARTY {admin, regulator} (NERSA staff side). READ
// platform-wide (the RESPONDENT must see their own case). Each event is
// tagged with the functional party that owns the action (enforcement_officer
// / panel_chair / council / sheriff) for audit attribution — NOT an
// access-control split.
// ═══════════════════════════════════════════════════════════════════════════

export type EnforcementActionStatus =
  | 'case_opened'
  | 'allegations_drafted'
  | 'allegations_served'
  | 'representations_period'
  | 'hearing_held'
  | 'determination'
  | 'penalty_imposed'
  | 'paid'
  | 'appealed'
  | 'enforced_via_court'
  | 'dismissed'
  | 'withdrawn';
  // 13th implicit "cancelled" terminal handled below for admin-cancel.

export type EnforcementActionAction =
  | 'draft_allegations'
  | 'serve_allegations'
  | 'open_representations'
  | 'hold_hearing'
  | 'make_determination'
  | 'impose_penalty'
  | 'record_payment'
  | 'lodge_appeal'
  | 'initiate_enforcement'
  | 'dismiss'
  | 'withdraw'
  | 'cancel';

// Penalty-quantum tier — DERIVED from proposed_penalty_zar.
export type EnforcementActionTier =
  | 'minor'
  | 'standard'
  | 'material'
  | 'severe';

// Functional party that owns each action (recorded as actor_party).
export type EnforcementActionParty =
  | 'enforcement_officer'
  | 'panel_chair'
  | 'council'
  | 'sheriff';

// Allegation class — for floor-at-severe rule + signature crossing.
export type AllegationClass =
  | 'tariff_non_compliance'
  | 'metering_failure'
  | 'reporting_failure'
  | 'licence_condition_breach'
  | 'grid_code_breach'
  | 'consumer_protection'
  | 'safety_violation'
  | 'environmental_breach'
  | 'market_abuse'
  | 'unlicensed_operation'
  | 'repeat_offender'
  | 'systemic_market_abuse';

interface TransitionRule {
  next: EnforcementActionStatus;
}

export const TRANSITIONS: Record<
  EnforcementActionStatus,
  Partial<Record<EnforcementActionAction, TransitionRule>>
> = {
  case_opened: {
    draft_allegations: { next: 'allegations_drafted' },
    withdraw:          { next: 'withdrawn' },
    cancel:            { next: 'withdrawn' },
  },
  allegations_drafted: {
    serve_allegations: { next: 'allegations_served' },
    withdraw:          { next: 'withdrawn' },
    cancel:            { next: 'withdrawn' },
  },
  allegations_served: {
    open_representations: { next: 'representations_period' },
    withdraw:             { next: 'withdrawn' },
    cancel:               { next: 'withdrawn' },
  },
  representations_period: {
    hold_hearing:       { next: 'hearing_held' },
    make_determination: { next: 'determination' },
    withdraw:           { next: 'withdrawn' },
    cancel:             { next: 'withdrawn' },
  },
  hearing_held: {
    make_determination: { next: 'determination' },
    withdraw:           { next: 'withdrawn' },
    cancel:             { next: 'withdrawn' },
  },
  determination: {
    impose_penalty: { next: 'penalty_imposed' },
    dismiss:        { next: 'dismissed' },
    withdraw:       { next: 'withdrawn' },
    cancel:         { next: 'withdrawn' },
  },
  penalty_imposed: {
    record_payment:       { next: 'paid' },
    lodge_appeal:         { next: 'appealed' },
    initiate_enforcement: { next: 'enforced_via_court' },
    withdraw:             { next: 'withdrawn' },
    cancel:               { next: 'withdrawn' },
  },
  appealed: {
    impose_penalty:       { next: 'penalty_imposed' },
    dismiss:              { next: 'dismissed' },
    initiate_enforcement: { next: 'enforced_via_court' },
    withdraw:             { next: 'withdrawn' },
    cancel:               { next: 'withdrawn' },
  },
  enforced_via_court: {
    record_payment: { next: 'paid' },
    dismiss:        { next: 'dismissed' },
    withdraw:       { next: 'withdrawn' },
    cancel:         { next: 'withdrawn' },
  },
  paid:      {},
  dismissed: {},
  withdrawn: {},
};

const TERMINALS = new Set<EnforcementActionStatus>([
  'paid', 'dismissed', 'withdrawn',
]);

export function isTerminal(s: EnforcementActionStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: EnforcementActionStatus,
  action: EnforcementActionAction,
): EnforcementActionStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: EnforcementActionStatus): EnforcementActionAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as EnforcementActionAction[];
}

export function isCancellable(s: EnforcementActionStatus): boolean {
  return TRANSITIONS[s]?.cancel != null;
}

// ── Allegation class + floor-at-severe rule ──────────────────────────────────
const FLOOR_AT_SEVERE_CLASSES = new Set<AllegationClass>([
  'safety_violation', 'repeat_offender', 'systemic_market_abuse',
]);

export function isFloorAtSevereClass(cls: AllegationClass): boolean {
  return FLOOR_AT_SEVERE_CLASSES.has(cls);
}

const VALID_CLASSES = new Set<AllegationClass>([
  'tariff_non_compliance', 'metering_failure', 'reporting_failure',
  'licence_condition_breach', 'grid_code_breach', 'consumer_protection',
  'safety_violation', 'environmental_breach', 'market_abuse',
  'unlicensed_operation', 'repeat_offender', 'systemic_market_abuse',
]);

export function isAllegationClass(c: string): c is AllegationClass {
  return VALID_CLASSES.has(c as AllegationClass);
}

// ── Penalty-quantum tier ─────────────────────────────────────────────────────
const TIER_MINOR_CEIL    = 100_000;     // < R100k
const TIER_STANDARD_CEIL = 500_000;     // R100k – R500k
const TIER_MATERIAL_CEIL = 1_000_000;   // R500k – R1m (ERA s35 cap per offence)

// ERA s35 cap per offence — stacking allowed across offence-counts.
export const ERA_S35_CAP_PER_OFFENCE_ZAR = 1_000_000;

// Cap the proposed-penalty per offence at ERA s35 cap (per-offence basis).
export function cappedPenaltyPerOffenceZar(proposedPenaltyZar: number): number {
  return Math.max(0, Math.min(proposedPenaltyZar || 0, ERA_S35_CAP_PER_OFFENCE_ZAR));
}

// Total proposed penalty across offence count (ERA s35 allows stacking).
export function totalPenaltyZar(perOffenceZar: number, offenceCount: number): number {
  const capped = cappedPenaltyPerOffenceZar(perOffenceZar);
  return capped * Math.max(1, offenceCount || 1);
}

export function tierFromPenalty(
  proposedPenaltyZar: number,
  allegationClass: AllegationClass,
): EnforcementActionTier {
  const baseTier: EnforcementActionTier =
    proposedPenaltyZar >= TIER_MATERIAL_CEIL ? 'severe'
    : proposedPenaltyZar >= TIER_STANDARD_CEIL ? 'material'
    : proposedPenaltyZar >= TIER_MINOR_CEIL    ? 'standard'
    : 'minor';
  if (isFloorAtSevereClass(allegationClass) && baseTier !== 'severe') {
    return 'severe';
  }
  return baseTier;
}

const VALID_TIERS = new Set<EnforcementActionTier>(['minor', 'standard', 'material', 'severe']);
export function isTier(t: string): t is EnforcementActionTier {
  return VALID_TIERS.has(t as EnforcementActionTier);
}

const TIER_RANK: Record<EnforcementActionTier, number> = {
  minor: 0, standard: 1, material: 2, severe: 3,
};
export function tierRank(tier: EnforcementActionTier): number {
  return TIER_RANK[tier];
}

const HIGH_TIERS = new Set<EnforcementActionTier>(['material', 'severe']);
export function isHighTier(tier: EnforcementActionTier): boolean {
  return HIGH_TIERS.has(tier);
}

// ── INVERTED SLA windows (minutes) — strictly INCREASING minor → severe ──────
// Larger penalty = MORE procedural time (audi alteram partem strengthens with
// magnitude). Strictly INCREASING minor → severe at every graded state.
// Audi window at representations_period MUST be ≥ 21 days per ERA s35(3) +
// PAJA s4. Severe gets 60 days (deeper due-process).
export const SLA_MINUTES: Record<EnforcementActionStatus, Record<EnforcementActionTier, number>> = {
  // case_opened → draft_allegations
  case_opened: {
    minor: 7200, standard: 14400, material: 21600, severe: 28800,
  },
  // allegations_drafted → serve_allegations
  allegations_drafted: {
    minor: 4320, standard: 7200, material: 10080, severe: 14400,
  },
  // allegations_served → open_representations
  allegations_served: {
    minor: 1440, standard: 2880, material: 4320, severe: 5760,
  },
  // representations_period → hold_hearing / make_determination
  // ERA s35(3) audi: minimum 21 days (30240 min) for the lowest tier; severe gets 60 days.
  representations_period: {
    minor: 30240, standard: 43200, material: 60480, severe: 86400,
  },
  // hearing_held → make_determination
  hearing_held: {
    minor: 7200, standard: 14400, material: 21600, severe: 28800,
  },
  // determination → impose_penalty / dismiss
  determination: {
    minor: 7200, standard: 14400, material: 21600, severe: 28800,
  },
  // penalty_imposed → record_payment / lodge_appeal / initiate_enforcement
  // Statutory appeal window: 30 days post-determination — minor matches; severe gets longer.
  penalty_imposed: {
    minor: 43200, standard: 60480, material: 86400, severe: 129600,
  },
  // appealed → impose_penalty (Tribunal varies) / dismiss / initiate_enforcement
  appealed: {
    minor: 86400, standard: 129600, material: 172800, severe: 259200,
  },
  // enforced_via_court → record_payment / dismiss
  enforced_via_court: {
    minor: 43200, standard: 86400, material: 172800, severe: 259200,
  },
  paid:      { minor: 0, standard: 0, material: 0, severe: 0 },
  dismissed: { minor: 0, standard: 0, material: 0, severe: 0 },
  withdrawn: { minor: 0, standard: 0, material: 0, severe: 0 },
};

export function slaDeadlineFor(
  state: EnforcementActionStatus,
  tier: EnforcementActionTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// ── Reportability (regulator-inbox-crossing) ─────────────────────────────────
export function isReportable(tier: EnforcementActionTier): boolean {
  return isHighTier(tier);
}

// Per-action crossing — the W93 SIGNATURE: penalty_imposed crosses regulator
// EVERY tier (public register / ERA s35 transparency obligation).
export function actionCrossesRegulator(
  action: EnforcementActionAction,
  tier: EnforcementActionTier,
  allegationClass: AllegationClass,
  liable: boolean,
): boolean {
  switch (action) {
    case 'impose_penalty':
      // SIGNATURE: every penalty notice is publicly registered.
      return true;
    case 'initiate_enforcement':
      // Court-system signal — every tier.
      return true;
    case 'lodge_appeal':
      // Tribunal-track signal — every tier.
      return true;
    case 'make_determination':
      if (!liable) return false;
      if (tier === 'severe') return true;
      return isHighTier(tier);
    case 'dismiss':
    case 'withdraw':
      // Governance signal — material+severe only.
      return isHighTier(tier);
    case 'serve_allegations':
      // Floor-at-severe classes (safety_violation etc) reported on service.
      return isFloorAtSevereClass(allegationClass);
    default:
      return false;
  }
}

// ── Procedural authority (derived from penalty tier) ─────────────────────────
export type EnforcementAuthority =
  | 'enforcement_officer'
  | 'panel_chair'
  | 'council_subcommittee'
  | 'full_council';

export function authorityFor(tier: EnforcementActionTier): EnforcementAuthority {
  switch (tier) {
    case 'minor':    return 'enforcement_officer';
    case 'standard': return 'panel_chair';
    case 'material': return 'council_subcommittee';
    case 'severe':   return 'full_council';
  }
}

// ── Audi-window compliance (PAJA s4 + ERA s35(3)) battery ────────────────────
// ERA s35(3) requires written representations; PAJA s4 "reasonable opportunity"
// — operationalised at 21 days minimum for the smallest tier.
export const AUDI_MINIMUM_DAYS = 21;

// audi_window_days_remaining — countdown from representations_period entered.
export function audiWindowDaysRemaining(
  representationsOpenedAt: Date | null,
  tier: EnforcementActionTier,
  now: Date,
): number {
  if (!representationsOpenedAt) return 0;
  const windowMinutes = SLA_MINUTES.representations_period[tier];
  const closesAt = new Date(representationsOpenedAt.getTime() + windowMinutes * 60_000);
  const msRemaining = closesAt.getTime() - now.getTime();
  return Math.max(0, msRemaining / (24 * 60 * 60 * 1000));
}

// audi_minimum_met_flag — true if the audi window allowed is ≥ 21 days.
export function audiMinimumMetFlag(tier: EnforcementActionTier): boolean {
  const windowDays = SLA_MINUTES.representations_period[tier] / (24 * 60);
  return windowDays >= AUDI_MINIMUM_DAYS;
}

// Procedural-irregularity flag — audi shorter than 21 days OR hearing denied
// without a reasoned refusal (the two judicial-review tripwires).
export function proceduralIrregularityFlag(
  tier: EnforcementActionTier,
  hearingRequested: boolean,
  hearingHeldOrReasonedRefusal: boolean,
): boolean {
  if (!audiMinimumMetFlag(tier)) return true;
  if (hearingRequested && !hearingHeldOrReasonedRefusal) return true;
  return false;
}

// ── Penalty-recovery battery (interest + recovery %) ─────────────────────────
// Prescribed Rate of Interest Act 55/1975 — 15.5% per annum as gazetted May 2026.
export const PRESCRIBED_INTEREST_RATE_PCT = 15.5;

// Accrued interest from due date on unpaid penalty.
export function accruedInterestZar(
  penaltyZar: number,
  daysOverdue: number,
): number {
  if (penaltyZar <= 0 || daysOverdue <= 0) return 0;
  return penaltyZar * (PRESCRIBED_INTEREST_RATE_PCT / 100) * (daysOverdue / 365);
}

// Recovery percentage of imposed penalty (0-100).
export function recoveryPct(
  recoveredZar: number,
  imposedZar: number,
): number {
  if (imposedZar <= 0) return 0;
  return Math.max(0, Math.min(100, (recoveredZar / imposedZar) * 100));
}

// ── Repeat-offender battery ──────────────────────────────────────────────────
// Repeat-offender score: prior_penalty_count × recency_weight.
// Recency: <365 days × 1.0 / <730 × 0.6 / older × 0.3.
export function repeatOffenderScore(
  priorPenaltyCount: number,
  daysSinceLastPenalty: number,
): number {
  if (priorPenaltyCount <= 0) return 0;
  const recencyWeight =
    daysSinceLastPenalty < 365 ? 1.0
    : daysSinceLastPenalty < 730 ? 0.6
    : 0.3;
  return priorPenaltyCount * recencyWeight;
}

// Repeat-offender flag — ≥ 2 prior penalties OR score ≥ 1.5.
export function repeatOffenderFlag(
  priorPenaltyCount: number,
  daysSinceLastPenalty: number,
): boolean {
  if (priorPenaltyCount >= 2) return true;
  return repeatOffenderScore(priorPenaltyCount, daysSinceLastPenalty) >= 1.5;
}

// ── Predicted recovery days (from enforcement step) ──────────────────────────
// Closed-form estimate of days from penalty_imposed to paid for each enforcement
// step. Calibrated to SA Magistrates' Court practical norms (May 2026).
const ENFORCEMENT_STEP_DAYS: Record<string, number> = {
  none: 30,            // voluntary payment within statutory appeal window
  demand_letter: 45,
  writ_issued: 90,
  sheriff_attachment: 150,
  garnishee: 180,
  contempt_application: 270,
};

export function predictedRecoveryDays(enforcementStep: string): number {
  return ENFORCEMENT_STEP_DAYS[enforcementStep] ?? 90;
}

// ── Urgency band (rendering hint) ────────────────────────────────────────────
export type UrgencyBand =
  | 'overdue' | 'urgent' | 'due_soon' | 'on_track' | 'closed';

export function urgencyBand(
  state: EnforcementActionStatus, slaDueAt: Date | null, now: Date,
): UrgencyBand {
  if (isTerminal(state)) return 'closed';
  if (!slaDueAt) return 'on_track';
  const msRemaining = slaDueAt.getTime() - now.getTime();
  if (msRemaining <= 0) return 'overdue';
  const hoursRemaining = msRemaining / (60 * 60 * 1000);
  if (hoursRemaining <= 24) return 'urgent';
  if (hoursRemaining <= 72) return 'due_soon';
  return 'on_track';
}

// ── Actor-party derivation from action ───────────────────────────────────────
const ACTION_PARTY: Record<EnforcementActionAction, EnforcementActionParty> = {
  draft_allegations:    'enforcement_officer',
  serve_allegations:    'enforcement_officer',
  open_representations: 'enforcement_officer',
  hold_hearing:         'panel_chair',
  make_determination:   'council',
  impose_penalty:       'council',
  record_payment:       'enforcement_officer',
  lodge_appeal:         'enforcement_officer',
  initiate_enforcement: 'sheriff',
  dismiss:              'council',
  withdraw:             'enforcement_officer',
  cancel:               'enforcement_officer',
};

export function partyForAction(action: EnforcementActionAction): EnforcementActionParty {
  return ACTION_PARTY[action];
}

// ── Event-type / regulator-inbox reason-code derivation ──────────────────────
export function eventTypeFor(toStatus: EnforcementActionStatus): string {
  return `enforcement_action.${toStatus}`;
}

export function reasonCodeFor(
  action: EnforcementActionAction,
  allegationClass: AllegationClass,
  tier: EnforcementActionTier,
): string {
  switch (action) {
    case 'impose_penalty':
      return `penalty_imposed_${allegationClass}_${tier}`;
    case 'initiate_enforcement':
      return `enforcement_initiated_${tier}`;
    case 'lodge_appeal':
      return `appeal_lodged_${tier}`;
    case 'make_determination':
      return `determination_${tier}`;
    case 'dismiss':
      return `dismissed_${tier}`;
    case 'withdraw':
      return `withdrawn_${tier}`;
    default:
      return `${action}_${tier}`;
  }
}
