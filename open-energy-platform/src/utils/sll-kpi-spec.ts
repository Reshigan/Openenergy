// ═══════════════════════════════════════════════════════════════════════════
// Wave 95 — Lender Sustainability-Linked Loan (SLL) KPI Compliance & Margin
// Ratchet
//
// What this is, and what it is NOT
// --------------------------------
// A Sustainability-Linked Loan (SLL) is the dominant green-finance instrument
// for SA project-finance debt. The borrower agrees to one or more KPIs (CO2
// intensity, energy-efficiency, safety-LTIFR, B-BBEE, mandatory-disclosure,
// taxonomy-alignment), measured annually, INDEPENDENTLY VERIFIED, and the
// margin RATCHETS:
//   - KPI met or beaten → margin steps DOWN  (typically -2.5 to -7.5 bps)
//   - KPI missed        → margin steps UP    (typically +2.5 to +15 bps)
//   - KPI cure-failed   → margin step-up + Event-of-Default risk + regulator
//                         notification (SARB CPS 2024, SA Green Finance
//                         Taxonomy 2025)
//
// SLL KPI compliance is DISTINCT from:
//   W38 lender covenant certificate  — financial KPI (DSCR/LLCR), pt-in-time
//   W77 reserve account              — cash-balance covenant
//   W86 DSCR monitoring              — rolling financial coverage
//   W45 loan default & enforcement   — what catches a cure_failed crossing
//   W6  covenant breach / watchlist  — financial covenant breach engine
//
// SLL KPIs are NON-FINANCIAL (ESG): they sit ABOVE financial covenants and
// drive a CONTRACTUAL margin step-up/step-down ratchet that no other lender
// surface captures. They require INDEPENDENT verification (Big-4 / ISO-14065
// accredited / industry specialist), beat Sustainalytics / ISS-ESG / MSCI
// ESG / S&P RobecoSAM CSA / Bloomberg ESG / Refinitiv ESG / LMA SLL Portal /
// ICMA SLBP / JSE Sustainability Index by live-wiring:
//   • 13-state P6 (annual cycle + breach/cure/restatement branches)
//   • KPI-variance tier RE-DERIVED on every transition
//   • FLOOR-AT-MATERIAL for climate / safety / mandatory-disclosure KPIs
//   • INVERTED SLA — more material KPI breaches = LONGER cure window
//     (per LMA SLL Principles: material ESG issues require structured
//     remediation, not a fire-drill 30-day cure)
//   • LIVE battery: effective_margin_bps_live, cumulative_ratchet_zar_live,
//     TCFD-completeness, SBTi pathway, SA Green Finance Taxonomy alignment,
//     verification provenance, urgency, predicted_amendment_date
//   • SIGNATURE SARB-CLIMATE-PRUDENTIAL hard line: breach_recorded +
//     cure_failed cross regulator EVERY tier; restatement material+severe;
//     SLA breach material+severe.
//
// Forward path (period opens → measurements taken → verified → ratchet → close):
//   kpi_period_open
//     → set_baseline           → baseline_set
//       → collect_measurement  → measurement_collected
//         → start_verification → independent_verification
//           → attest_kpi       → kpi_attested
//             → compute_ratchet → ratchet_computed
//               → amend_margin → margin_amended (terminal — period closes)
//
// Breach branch (from independent_verification when KPI missed):
//   independent_verification
//     → record_breach          → breach_recorded
//       → open_cure_period     → cure_period
//         → validate_cure      → kpi_attested (rejoins main path)
//         → fail_cure          → cure_failed (terminal — step-up + EOD risk)
//
// Restatement branch (post-attestation correction):
//   {kpi_attested, ratchet_computed, margin_amended}
//     → raise_restatement      → restatement
//       → re_verify            → independent_verification (rejoins)
//
// Terminals:
//   • margin_amended       — clean period close (margin written)
//   • cure_failed          — step-up applied, EOD risk crystallised
//   • cancelled            — admin / counterparty mutual cancel
//   • sustainability_event — external major event (refinance, prepay, M&A)
//
// Tier derivation (RE-DERIVED every transition from kpi_variance_pct AND
// materiality_class):
//   minor    < 5 pp     |  standard  5–15 pp
//   material 15–30 pp   |  severe    ≥30 pp
//   FLOOR-AT-MATERIAL for: climate_kpi, safety_kpi, mandatory_disclosure_kpi
//   (per LMA SLL Principles + SA Green Finance Taxonomy 2025)
//
// SLA polarity: INVERTED (severe → longest cure window). Per LMA SLL
// governance, ESG-material breaches need structural remediation: replanting
// targets, supply-chain redesign, training rollout — these cannot be cured
// in 30 days. Minor variance gets tightest window (informational / quick fix).
//
// Reportability hard-line:
//   • record_breach → breach_recorded  → regulator EVERY tier (SIGNATURE)
//   • fail_cure     → cure_failed       → regulator EVERY tier (SIGNATURE)
//   • raise_restatement → restatement   → regulator material+severe
//   • sla_breached                      → regulator material+severe
//   • amend_margin → margin_amended     → regulator severe only (mat. event)
//
// Write model: {admin, lender}. Read model: all 9 personas. Actor party is
// recorded functionally from the action: sustainability_officer (lender ESG
// team), verifier (independent verifier), credit_committee (lender governance),
// borrower (counterparty).
//
// ═══════════════════════════════════════════════════════════════════════════

export type SllKpiStatus =
  | 'kpi_period_open'
  | 'baseline_set'
  | 'measurement_collected'
  | 'independent_verification'
  | 'kpi_attested'
  | 'ratchet_computed'
  | 'margin_amended'
  | 'breach_recorded'
  | 'cure_period'
  | 'cure_failed'
  | 'restatement'
  | 'cancelled'
  | 'sustainability_event';

export type SllKpiAction =
  | 'set_baseline'
  | 'collect_measurement'
  | 'start_verification'
  | 'attest_kpi'
  | 'record_breach'
  | 'compute_ratchet'
  | 'amend_margin'
  | 'open_cure_period'
  | 'validate_cure'
  | 'fail_cure'
  | 'raise_restatement'
  | 're_verify'
  | 'trigger_sustainability_event'
  | 'cancel';

// KPI-variance × materiality tier — DERIVED every transition.
export type SllKpiTier =
  | 'minor'
  | 'standard'
  | 'material'
  | 'severe';

// Functional party that owns each action (recorded as actor_party).
export type SllKpiParty =
  | 'sustainability_officer'
  | 'verifier'
  | 'credit_committee'
  | 'borrower';

// Materiality class — drives the FLOOR-AT-MATERIAL rule.
export type SllKpiMaterialityClass =
  | 'general_kpi'
  | 'climate_kpi'
  | 'safety_kpi'
  | 'mandatory_disclosure_kpi'
  | 'governance_kpi'
  | 'supply_chain_kpi';

interface TransitionRule {
  next: SllKpiStatus;
}

export const TRANSITIONS: Record<
  SllKpiStatus,
  Partial<Record<SllKpiAction, TransitionRule>>
> = {
  kpi_period_open: {
    set_baseline:                { next: 'baseline_set' },
    trigger_sustainability_event:{ next: 'sustainability_event' },
    cancel:                      { next: 'cancelled' },
  },
  baseline_set: {
    collect_measurement:         { next: 'measurement_collected' },
    trigger_sustainability_event:{ next: 'sustainability_event' },
    cancel:                      { next: 'cancelled' },
  },
  measurement_collected: {
    start_verification:          { next: 'independent_verification' },
    trigger_sustainability_event:{ next: 'sustainability_event' },
    cancel:                      { next: 'cancelled' },
  },
  independent_verification: {
    attest_kpi:                  { next: 'kpi_attested' },
    record_breach:               { next: 'breach_recorded' },
    trigger_sustainability_event:{ next: 'sustainability_event' },
    cancel:                      { next: 'cancelled' },
  },
  kpi_attested: {
    compute_ratchet:             { next: 'ratchet_computed' },
    raise_restatement:           { next: 'restatement' },
    trigger_sustainability_event:{ next: 'sustainability_event' },
    cancel:                      { next: 'cancelled' },
  },
  ratchet_computed: {
    amend_margin:                { next: 'margin_amended' },
    raise_restatement:           { next: 'restatement' },
    trigger_sustainability_event:{ next: 'sustainability_event' },
    cancel:                      { next: 'cancelled' },
  },
  margin_amended: {
    raise_restatement:           { next: 'restatement' },
    // Closed period — re-opening requires restatement, not a new transition.
  },
  breach_recorded: {
    open_cure_period:            { next: 'cure_period' },
    trigger_sustainability_event:{ next: 'sustainability_event' },
    cancel:                      { next: 'cancelled' },
  },
  cure_period: {
    validate_cure:               { next: 'kpi_attested' },
    fail_cure:                   { next: 'cure_failed' },
    trigger_sustainability_event:{ next: 'sustainability_event' },
    cancel:                      { next: 'cancelled' },
  },
  restatement: {
    re_verify:                   { next: 'independent_verification' },
    trigger_sustainability_event:{ next: 'sustainability_event' },
    cancel:                      { next: 'cancelled' },
  },
  cure_failed:         {},
  cancelled:           {},
  sustainability_event:{},
};

const TERMINALS = new Set<SllKpiStatus>([
  'margin_amended', 'cure_failed', 'cancelled', 'sustainability_event',
]);

export function isTerminal(s: SllKpiStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: SllKpiStatus,
  action: SllKpiAction,
): SllKpiStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: SllKpiStatus): SllKpiAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as SllKpiAction[];
}

export function isCancellable(s: SllKpiStatus): boolean {
  return TRANSITIONS[s]?.cancel != null;
}

// ── Materiality class + floor-at-material rule ──────────────────────────────
const FLOOR_AT_MATERIAL_CLASSES = new Set<SllKpiMaterialityClass>([
  'climate_kpi', 'safety_kpi', 'mandatory_disclosure_kpi',
]);

export function isFloorAtMaterialClass(cls: SllKpiMaterialityClass): boolean {
  return FLOOR_AT_MATERIAL_CLASSES.has(cls);
}

const VALID_MATERIALITY = new Set<SllKpiMaterialityClass>([
  'general_kpi', 'climate_kpi', 'safety_kpi', 'mandatory_disclosure_kpi',
  'governance_kpi', 'supply_chain_kpi',
]);

export function isMaterialityClass(c: string): c is SllKpiMaterialityClass {
  return VALID_MATERIALITY.has(c as SllKpiMaterialityClass);
}

// ── KPI-variance tier ────────────────────────────────────────────────────────
// Variance is signed % points vs target. Negative = beat target (still
// included by absolute value — beating a target by 30pp triggers a severe
// step-DOWN, which is material to lender pricing).
const TIER_MINOR_CEIL    = 5;   // <  5 pp
const TIER_STANDARD_CEIL = 15;  // 5  – 15 pp
const TIER_MATERIAL_CEIL = 30;  // 15 – 30 pp  (severe ≥30 pp)

export function tierFromVariance(
  kpiVariancePct: number,
  materiality: SllKpiMaterialityClass,
): SllKpiTier {
  const abs = Math.abs(kpiVariancePct || 0);
  const baseTier: SllKpiTier =
    abs >= TIER_MATERIAL_CEIL ? 'severe'
    : abs >= TIER_STANDARD_CEIL ? 'material'
    : abs >= TIER_MINOR_CEIL    ? 'standard'
    : 'minor';
  if (isFloorAtMaterialClass(materiality)) {
    const rank = TIER_RANK[baseTier];
    if (rank < TIER_RANK.material) return 'material';
  }
  return baseTier;
}

// Effective variance: prefer measured if set, fall back to forecast/target gap.
export function effectiveVariancePct(
  measuredVariancePct: number | null | undefined,
  forecastVariancePct: number | null | undefined,
): number {
  if (typeof measuredVariancePct === 'number' && isFinite(measuredVariancePct)) {
    return measuredVariancePct;
  }
  if (typeof forecastVariancePct === 'number' && isFinite(forecastVariancePct)) {
    return forecastVariancePct;
  }
  return 0;
}

const VALID_TIERS = new Set<SllKpiTier>(['minor', 'standard', 'material', 'severe']);
export function isTier(t: string): t is SllKpiTier {
  return VALID_TIERS.has(t as SllKpiTier);
}

const TIER_RANK: Record<SllKpiTier, number> = {
  minor: 0, standard: 1, material: 2, severe: 3,
};
export function tierRank(tier: SllKpiTier): number {
  return TIER_RANK[tier];
}

const HIGH_TIERS = new Set<SllKpiTier>(['material', 'severe']);
export function isHighTier(tier: SllKpiTier): boolean {
  return HIGH_TIERS.has(tier);
}

// ── INVERTED SLA windows (minutes) — strictly INCREASING minor → severe ────
// Larger material KPI breach = MORE remediation time (per LMA SLL governance).
// Cure windows reflect that material climate / safety / disclosure breaches
// require structural change (training, capex, supply-chain redesign), not
// a 30-day patch.
export const SLA_MINUTES: Record<SllKpiStatus, Record<SllKpiTier, number>> = {
  // kpi_period_open → set_baseline (annual cycle starts; baseline must be
  // fixed within 60–180d of period opening)
  kpi_period_open: {
    minor: 86400, standard: 129600, material: 172800, severe: 259200,
  },
  // baseline_set → collect_measurement (measurement-period proper)
  baseline_set: {
    minor: 259200, standard: 388800, material: 525600, severe: 784800,
  },
  // measurement_collected → start_verification (verifier engaged within 30–90d)
  measurement_collected: {
    minor: 43200, standard: 64800, material: 86400, severe: 129600,
  },
  // independent_verification → attest_kpi / record_breach (verifier turnaround)
  independent_verification: {
    minor: 30240, standard: 43200, material: 64800, severe: 86400,
  },
  // kpi_attested → compute_ratchet (mechanical step within 5d minor → 21d severe)
  kpi_attested: {
    minor: 7200,  standard: 10080, material: 20160, severe: 30240,
  },
  // ratchet_computed → amend_margin (credit-committee turnaround)
  ratchet_computed: {
    minor: 7200,  standard: 10080, material: 20160, severe: 43200,
  },
  // margin_amended → terminal
  margin_amended: { minor: 0, standard: 0, material: 0, severe: 0 },
  // breach_recorded → open_cure_period (governance ack — SARB CPS 2024 5–14d)
  breach_recorded: {
    minor: 4320,  standard: 7200,  material: 14400, severe: 20160,
  },
  // cure_period → validate_cure / fail_cure (INVERTED — severe = 180d)
  cure_period: {
    minor: 30240, standard: 64800, material: 129600, severe: 259200,
  },
  // restatement → re_verify (verifier re-engagement)
  restatement: {
    minor: 20160, standard: 30240, material: 43200, severe: 64800,
  },
  cure_failed:          { minor: 0, standard: 0, material: 0, severe: 0 },
  cancelled:            { minor: 0, standard: 0, material: 0, severe: 0 },
  sustainability_event: { minor: 0, standard: 0, material: 0, severe: 0 },
};

export function slaDeadlineFor(
  state: SllKpiStatus,
  tier: SllKpiTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// ── Reportability (regulator-inbox-crossing) ─────────────────────────────────
export function isReportable(tier: SllKpiTier): boolean {
  return isHighTier(tier);
}

// Per-action crossing — the W95 SIGNATURE: record_breach + fail_cure cross
// regulator EVERY tier (SARB Climate Prudential Standards 2024 + SA Green
// Finance Taxonomy 2025 mandatory-disclosure obligation). restatement +
// margin step-up on severe also cross.
export function actionCrossesRegulator(
  action: SllKpiAction,
  tier: SllKpiTier,
  materiality: SllKpiMaterialityClass,
): boolean {
  switch (action) {
    case 'record_breach':
      // SIGNATURE: every SLL KPI breach is reportable (SARB CPS 2024).
      return true;
    case 'fail_cure':
      // SIGNATURE: cure-failure = mandatory disclosure (SA Green Taxonomy 2025).
      return true;
    case 'raise_restatement':
      // Restatement of prior attestation — material+severe only (SARB CPS 2024).
      return isHighTier(tier);
    case 'amend_margin':
      // Margin change → only severe ratchet is a material event.
      return tier === 'severe';
    case 'attest_kpi':
      // Climate / disclosure / safety attestation always public (SBTi pathway,
      // TCFD), severe variance regardless of class also crosses.
      return isFloorAtMaterialClass(materiality) || tier === 'severe';
    case 'trigger_sustainability_event':
      // M&A / refinance / prepay closes file — high-tier crossings only.
      return isHighTier(tier);
    default:
      return false;
  }
}

// ── Procedural authority (derived from variance tier) ────────────────────────
export type SllKpiAuthority =
  | 'esg_analyst'
  | 'sustainability_officer'
  | 'credit_committee'
  | 'board_sustainability_committee';

export function authorityFor(tier: SllKpiTier): SllKpiAuthority {
  switch (tier) {
    case 'minor':    return 'esg_analyst';
    case 'standard': return 'sustainability_officer';
    case 'material': return 'credit_committee';
    case 'severe':   return 'board_sustainability_committee';
  }
}

// ── Margin-ratchet computation ───────────────────────────────────────────────
// Step amounts (bps) per LMA SLL Principles + SA bank-loan-market SLL norms.
// Step-DOWN (beat target): negative variance → negative ratchet.
// Step-UP (miss target):   positive variance → positive ratchet.
//
// Step amounts by tier:
//   minor    ±  2.5 bps
//   standard ±  5.0 bps
//   material ± 10.0 bps
//   severe   ± 15.0 bps  (with cure-failed penalty = additional +5 bps)
export const RATCHET_STEP_BPS: Record<SllKpiTier, number> = {
  minor:    2.5,
  standard: 5.0,
  material: 10.0,
  severe:   15.0,
};

export const CURE_FAILED_PENALTY_BPS = 5.0;

// Sign convention: positive variance = miss (margin steps UP, more expensive).
//                  negative variance = beat (margin steps DOWN, cheaper).
export function ratchetBpsFor(
  varianceSignedPct: number,
  tier: SllKpiTier,
  cureFailed: boolean,
): number {
  const direction = varianceSignedPct >= 0 ? +1 : -1;
  let bps = direction * RATCHET_STEP_BPS[tier];
  if (cureFailed) {
    // Penalty stacks on top of the step-up.
    bps += CURE_FAILED_PENALTY_BPS;
  }
  return bps;
}

// Cumulative effective margin = base + sum of all ratchet steps applied.
export function effectiveMarginBps(
  baseMarginBps: number,
  cumulativeRatchetBps: number,
): number {
  return (baseMarginBps || 0) + (cumulativeRatchetBps || 0);
}

// Cumulative ratchet ZAR over a loan life — convert bps × outstanding × tenor.
export function cumulativeRatchetZar(
  cumulativeRatchetBps: number,
  outstandingZar: number,
  remainingDaysOfTenor: number,
): number {
  if (!isFinite(cumulativeRatchetBps) || !isFinite(outstandingZar)) return 0;
  if (!isFinite(remainingDaysOfTenor) || remainingDaysOfTenor <= 0) return 0;
  const annualised = (cumulativeRatchetBps / 10000) * outstandingZar;
  return annualised * (remainingDaysOfTenor / 365);
}

// ── ESG completeness battery ────────────────────────────────────────────────
// TCFD 4 pillars: governance / strategy / risk_management / metrics_targets.
export type TcfdPillar =
  | 'governance' | 'strategy' | 'risk_management' | 'metrics_targets';

export function tcfdCompletenessPct(
  pillarsCovered: number,
  pillarsTotal: number = 4,
): number {
  if (!pillarsTotal || pillarsTotal <= 0) return 0;
  return Math.max(0, Math.min(100, (pillarsCovered / pillarsTotal) * 100));
}

// Attestation-doc completeness: each required field present.
export function attestationCompletenessPct(
  fieldsPresent: number,
  fieldsRequired: number,
): number {
  if (!fieldsRequired || fieldsRequired <= 0) return 0;
  return Math.max(0, Math.min(100, (fieldsPresent / fieldsRequired) * 100));
}

// SBTi alignment pathway.
export type SbtiPathway =
  | '1_5C' | 'well_below_2C' | '2C' | 'not_aligned';

export function sbtiPathwayFromGwp(emissionsReductionTrajectoryPctPerYear: number): SbtiPathway {
  if (!isFinite(emissionsReductionTrajectoryPctPerYear)) return 'not_aligned';
  // SBTi cross-sector targets: 4.2%/yr → 1.5°C; 2.5%/yr → well-below-2°C;
  // 1.23%/yr → 2°C.
  if (emissionsReductionTrajectoryPctPerYear >= 4.2)  return '1_5C';
  if (emissionsReductionTrajectoryPctPerYear >= 2.5)  return 'well_below_2C';
  if (emissionsReductionTrajectoryPctPerYear >= 1.23) return '2C';
  return 'not_aligned';
}

// SA Green Finance Taxonomy 2025 alignment %.
export function taxonomyAlignmentPct(
  taxonomyEligibleZar: number,
  totalFinancingZar: number,
): number {
  if (!totalFinancingZar || totalFinancingZar <= 0) return 0;
  return Math.max(0, Math.min(100, ((taxonomyEligibleZar || 0) / totalFinancingZar) * 100));
}

// Verifier provenance band — drives crossing severity.
export type VerificationProvenanceBand =
  | 'big4'
  | 'iso14065_accredited'
  | 'industry_specialist'
  | 'inadequate';

const BIG4 = new Set(['kpmg', 'pwc', 'ey', 'deloitte']);
const ISO14065 = new Set([
  'tuv_sud', 'sgs', 'dnv', 'bureau_veritas', 'lr', 'lloyds_register',
  'aenor', 'rina',
]);

export function verificationProvenanceBand(
  verifierSlug: string | null | undefined,
): VerificationProvenanceBand {
  const v = (verifierSlug || '').toLowerCase().trim();
  if (!v) return 'inadequate';
  if (BIG4.has(v)) return 'big4';
  if (ISO14065.has(v)) return 'iso14065_accredited';
  return 'industry_specialist';
}

// Days-to-KPI-due — countdown from now to the period's KPI measurement deadline.
export function daysToKpiDue(
  kpiDueAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!kpiDueAt) return null;
  const due = typeof kpiDueAt === 'string' ? new Date(kpiDueAt) : kpiDueAt;
  if (isNaN(due.getTime())) return null;
  const msRemaining = due.getTime() - now.getTime();
  return Math.round(msRemaining / (24 * 60 * 60 * 1000));
}

// Predicted-amendment-date — rolls forward from current state's SLA path.
export function predictedAmendmentDate(
  currentState: SllKpiStatus,
  tier: SllKpiTier,
  stateEnteredAt: Date,
): Date | null {
  if (isTerminal(currentState)) return null;
  // Sum SLA minutes from current state through to margin_amended terminal,
  // following the CLEAN path (no breach branch).
  const FORWARD_PATH: SllKpiStatus[] = [
    'kpi_period_open',
    'baseline_set',
    'measurement_collected',
    'independent_verification',
    'kpi_attested',
    'ratchet_computed',
  ];
  let idx = FORWARD_PATH.indexOf(currentState);
  // States off the clean path: project them onto the closest forward point.
  if (idx < 0) {
    if (currentState === 'breach_recorded' || currentState === 'cure_period') {
      idx = FORWARD_PATH.indexOf('independent_verification');
    } else if (currentState === 'restatement') {
      idx = FORWARD_PATH.indexOf('independent_verification');
    } else {
      return null;
    }
  }
  let total = 0;
  for (let i = idx; i < FORWARD_PATH.length; i++) {
    total += SLA_MINUTES[FORWARD_PATH[i]][tier] || 0;
  }
  return new Date(stateEnteredAt.getTime() + total * 60_000);
}

// ── Urgency band ─────────────────────────────────────────────────────────────
export type UrgencyBand = 'overdue' | 'urgent' | 'due_soon' | 'on_track' | 'closed';

export function urgencyBand(
  state: SllKpiStatus,
  slaDeadlineAt: Date | null,
  now: Date,
): UrgencyBand {
  if (isTerminal(state)) return 'closed';
  if (!slaDeadlineAt) return 'on_track';
  const msRemaining = slaDeadlineAt.getTime() - now.getTime();
  if (msRemaining <= 0) return 'overdue';
  const hoursRemaining = msRemaining / (60 * 60 * 1000);
  if (hoursRemaining <= 24) return 'urgent';
  if (hoursRemaining <= 96) return 'due_soon';
  return 'on_track';
}

// ── Inbox severity (for regulator-inbox crossing) ────────────────────────────
export type InboxSeverity = 'low' | 'medium' | 'high' | 'critical';

export function inboxSeverityForTier(tier: SllKpiTier): InboxSeverity {
  switch (tier) {
    case 'severe':   return 'critical';
    case 'material': return 'high';
    case 'standard': return 'medium';
    case 'minor':    return 'low';
  }
}

// ── Actor-party for action (functional, NOT access-control) ──────────────────
const ACTION_PARTY: Record<SllKpiAction, SllKpiParty> = {
  set_baseline:                'sustainability_officer',
  collect_measurement:         'borrower',
  start_verification:          'sustainability_officer',
  attest_kpi:                  'verifier',
  record_breach:               'verifier',
  compute_ratchet:             'sustainability_officer',
  amend_margin:                'credit_committee',
  open_cure_period:            'credit_committee',
  validate_cure:               'verifier',
  fail_cure:                   'credit_committee',
  raise_restatement:           'verifier',
  re_verify:                   'verifier',
  trigger_sustainability_event:'credit_committee',
  cancel:                      'credit_committee',
};

export function partyForAction(action: SllKpiAction): SllKpiParty {
  return ACTION_PARTY[action];
}

// ── Event type for cascade ───────────────────────────────────────────────────
const EVENT_TYPE: Record<SllKpiStatus, string> = {
  kpi_period_open:          'sll_kpi.kpi_period_open',
  baseline_set:             'sll_kpi.baseline_set',
  measurement_collected:    'sll_kpi.measurement_collected',
  independent_verification: 'sll_kpi.independent_verification',
  kpi_attested:             'sll_kpi.kpi_attested',
  ratchet_computed:         'sll_kpi.ratchet_computed',
  margin_amended:           'sll_kpi.margin_amended',
  breach_recorded:          'sll_kpi.breach_recorded',
  cure_period:              'sll_kpi.cure_period',
  cure_failed:              'sll_kpi.cure_failed',
  restatement:              'sll_kpi.restatement',
  cancelled:                'sll_kpi.cancelled',
  sustainability_event:     'sll_kpi.sustainability_event',
};

export function eventTypeFor(status: SllKpiStatus): string {
  return EVENT_TYPE[status];
}
