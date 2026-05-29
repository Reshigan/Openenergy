// ─────────────────────────────────────────────────────────────────────────
// Wave 71 — Esums Predictive Asset Health & Prognostics (P6)
//
// The NTT-beating predictive O&M brain. NTT Data's IoT stack and NTT's O&M
// stack monitor assets and react; they ingest SCADA, draw a digital twin and
// run generic ML anomaly detection. Best-in-class for a renewable operator is
// not monitor-and-react — it is PREDICT, QUANTIFY and PREVENT, with every
// prediction explainable, revenue-ranked and auditable.
//
// This module is two things in one:
//
//  (A) A PREDICTIVE ENGINE — pure, deterministic, unit-tested functions that
//      turn raw telemetry into prognostics:
//        - a physics expected-power model (irradiance + temperature derate)
//          and a loss-attribution waterfall (soiling / shading / clipping /
//          degradation / downtime)
//        - a 6-method anomaly ENSEMBLE (EWMA control chart, z-score, IQR/Tukey,
//          rate-of-change, persistence, fleet-percentile) → a single
//          confidence — vs the typical single-model approach
//        - degradation regression → Remaining-Useful-Life (RUL) with a
//          confidence band
//        - explainable FAILURE-MODE fingerprinting (symptom vector → ranked
//          probable faults + evidence), with a safety flag
//        - revenue-at-risk (ZAR, tariff-denominated) and an O&M SAVINGS ledger
//          measured against the reactive baseline AND against the NTT/industry
//          benchmark percentage
//
//  (B) A PROGNOSTIC LIFECYCLE — a 12-state P6 chain that takes a prediction
//      from auto-detection through triage, diagnosis, planning, work-order
//      hand-off (feeds [[project_wave16_wo_dispatch_chain]]), monitoring and
//      resolution — and closes the loop by recording confirmed failures so the
//      engine's confidence can be tuned (false-positive feedback).
//
// Forward (happy) path:
//   predicted → triaged → diagnosed → action_planned → wo_raised
//     → monitoring → resolved
//
// Branches:
//   {predicted, triaged} → dismissed                  (false positive)
//   predicted            → auto_suppressed             (low confidence / duplicate)
//   {triaged, diagnosed, action_planned, monitoring} → escalated → wo_raised
//   monitoring           → diagnosed                   (recurrence — loop back)
//   any active state     → confirmed_failure           (predicted failure occurred)
//   {predicted, triaged, diagnosed} → expired          (RUL elapsed, stale)
//
// Tiers (5) by REVENUE-AT-RISK (ZAR) with a SAFETY floor — a safety-implicated
// fault mode (DC arc, thermal runaway, transformer thermal) floors the tier at
// 'major' regardless of rand exposure:
//   minor <5k / moderate <25k / material <100k / major <500k / critical >=500k
//
// SLA is URGENT — the higher the revenue-at-risk / the more safety-critical,
// the TIGHTER the triage and diagnosis window (catch the big bleeders fast).
//
// Reportability — the W71 SIGNATURE is SAFETY-driven. A predicted failure that
// MATERIALISES on a safety-implicated asset is an OHSA / NRCS event and is
// always notifiable:
//   record_failure crosses for EVERY tier when the fault mode is safety-
//        implicated (cf. W64 issue_permit live-electrical, W25 HSE incident);
//        otherwise it crosses for the high tiers (major + critical).
//   escalate_prognostic crosses for the high tiers when safety-implicated.
//   sla_breached crosses for the high tiers (major + critical).
//
// Single-party write: the Esums O&M team ({admin, support}) drives the chain;
// the engine / cron emits predictions and auto-suppressions as the platform.
// ─────────────────────────────────────────────────────────────────────────

// ===========================================================================
// PART A — PREDICTIVE ENGINE
// ===========================================================================

const G_STC = 1000; // W/m² standard-test-condition irradiance
const T_STC = 25; // °C standard-test-condition cell temperature
// Silicon power temperature coefficient (~ -0.40 %/°C). Negative — hotter cells
// produce less power. Used by the physics expected-power model.
const TEMP_COEFF_PER_C = -0.0040;

export interface ExpectedPowerInput {
  irradianceWm2: number;
  cellTempC: number;
  ratedKw: number;
  tempCoeffPerC?: number; // override for non-silicon
}

// Physics expected AC power for a PV asset under the reporting conditions.
// P = ratedKw * (G/G_stc) * (1 + γ·(Tcell − 25)), clamped to [0, ratedKw].
export function expectedAcKw(input: ExpectedPowerInput): number {
  const { irradianceWm2, cellTempC, ratedKw } = input;
  const gamma = input.tempCoeffPerC ?? TEMP_COEFF_PER_C;
  if (!(irradianceWm2 > 0) || !(ratedKw > 0)) return 0;
  const tempFactor = 1 + gamma * (cellTempC - T_STC);
  const raw = ratedKw * (irradianceWm2 / G_STC) * tempFactor;
  if (raw < 0) return 0;
  return raw > ratedKw ? ratedKw : raw;
}

// Performance Ratio (IEC 61724): actual yield over the theoretical STC yield for
// the plane-of-array insolation. PR ∈ (0, 1]; a healthy plant is ~0.78–0.85.
export function performanceRatio(
  actualKwh: number,
  poaInsolationKwhM2: number,
  ratedKw: number,
): number {
  const ref = ratedKw * (poaInsolationKwhM2 / (G_STC / 1000));
  if (!(ref > 0)) return 0;
  const pr = actualKwh / ref;
  return pr < 0 ? 0 : pr;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function zScore(value: number, m: number, sd: number): number {
  if (!(sd > 0)) return 0;
  return (value - m) / sd;
}

// EWMA control chart — detects small persistent shifts that a single-sample
// threshold misses. Returns the smoothed value, control limits, and whether the
// latest point breaches them. lambda 0.2–0.3, L≈3 (≈3σ) per Montgomery SPC.
export interface EwmaResult {
  ewma: number;
  ucl: number;
  lcl: number;
  inControl: boolean;
  score: number; // |ewma − μ| / (control half-width); ≥1 == out of control
}

// baselineN: number of LEADING (in-control) points used to calibrate the
// control limits — SPC Phase I. Monitoring then runs over the whole series
// (Phase II). Calibrating on an in-control baseline is what lets the chart
// catch a shift in the recent tail; using the whole series as its own baseline
// would let the shift inflate the limits and mask itself. Omit to treat the
// entire window as the reference distribution.
export function ewmaAnomaly(series: number[], lambda = 0.3, L = 3, baselineN?: number): EwmaResult {
  if (series.length === 0) {
    return { ewma: 0, ucl: 0, lcl: 0, inControl: true, score: 0 };
  }
  const n = series.length;
  const bN = baselineN && baselineN >= 2 && baselineN <= n ? baselineN : n;
  const baseline = bN === n ? series : series.slice(0, bN);
  const mu = mean(baseline);
  const sigma = stddev(baseline);
  let z = mu;
  for (let i = 0; i < series.length; i++) {
    z = lambda * series[i] + (1 - lambda) * z;
  }
  // Asymptotic EWMA variance factor: λ/(2−λ)·(1−(1−λ)^{2n}).
  const varFactor = (lambda / (2 - lambda)) * (1 - Math.pow(1 - lambda, 2 * n));
  const halfWidth = L * sigma * Math.sqrt(varFactor);
  const ucl = mu + halfWidth;
  const lcl = mu - halfWidth;
  const inControl = z <= ucl && z >= lcl;
  const score = halfWidth > 0 ? Math.abs(z - mu) / halfWidth : 0;
  return { ewma: z, ucl, lcl, inControl, score };
}

// Tukey IQR outlier test on the latest value against the historical fence.
export function iqrOutlier(history: number[], value: number, k = 1.5): boolean {
  if (history.length < 4) return false;
  const sorted = [...history].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  return value < q1 - k * iqr || value > q3 + k * iqr;
}

// Fraction of the recent window in a fault/degraded state — a persistent signal
// is far more actionable than a transient blip.
export function persistenceRatio(flags: boolean[]): number {
  if (flags.length === 0) return 0;
  return flags.filter(Boolean).length / flags.length;
}

// Percentile rank of a device's metric within its fleet of peers (0–1). Catches
// a unit that is fine on its own thresholds but a clear laggard vs siblings.
export function fleetPercentile(value: number, peers: number[]): number {
  if (peers.length === 0) return 0.5;
  const below = peers.filter((p) => p < value).length;
  return below / peers.length;
}

export type AnomalyMethod =
  | 'ewma_control_chart'
  | 'z_score'
  | 'iqr_tukey'
  | 'rate_of_change'
  | 'persistence'
  | 'fleet_percentile';

export interface AnomalyEnsembleInput {
  series: number[]; // recent metric series (e.g. PR, normalised yield)
  latest: number; // latest observation
  faultFlags?: boolean[]; // per-interval degraded flags for persistence
  peerLatest?: number[]; // peer devices' latest values for fleet comparison
  // direction the metric moves on degradation: 'down' (PR, yield) or 'up' (temp)
  degradeDirection?: 'down' | 'up';
}

export interface AnomalyEnsembleResult {
  methodsTriggered: AnomalyMethod[];
  score: number; // 0–1 ensemble severity
  confidence: number; // 0–1 — agreement across methods
}

// Combine all six detectors into one confidence. Agreement across independent
// methods is the signal: a point flagged by EWMA + z-score + fleet-percentile
// is real; a lone IQR blip is noise.
export function detectAnomalyEnsemble(input: AnomalyEnsembleInput): AnomalyEnsembleResult {
  const { series, latest } = input;
  const dir = input.degradeDirection ?? 'down';
  const triggered: AnomalyMethod[] = [];
  const m = mean(series);
  const sd = stddev(series);

  // Calibrate the control chart on the leading ~60% (the in-control reference)
  // so a shift in the recent tail actually breaches the limits.
  const baseN = Math.max(3, Math.floor(series.length * 0.6));
  const ewma = ewmaAnomaly(series, 0.3, 3, baseN);
  const ewmaBad = dir === 'down' ? ewma.ewma < ewma.lcl : ewma.ewma > ewma.ucl;
  if (!ewma.inControl && ewmaBad) triggered.push('ewma_control_chart');

  const z = zScore(latest, m, sd);
  if ((dir === 'down' && z <= -2) || (dir === 'up' && z >= 2)) triggered.push('z_score');

  if (iqrOutlier(series, latest)) triggered.push('iqr_tukey');

  if (series.length >= 2) {
    const roc = latest - series[series.length - 1];
    const refSd = sd > 0 ? sd : Math.abs(m) || 1;
    if ((dir === 'down' && roc <= -refSd) || (dir === 'up' && roc >= refSd)) {
      triggered.push('rate_of_change');
    }
  }

  if (input.faultFlags && persistenceRatio(input.faultFlags) >= 0.5) {
    triggered.push('persistence');
  }

  if (input.peerLatest && input.peerLatest.length > 0) {
    const pct = fleetPercentile(latest, input.peerLatest);
    if ((dir === 'down' && pct <= 0.15) || (dir === 'up' && pct >= 0.85)) {
      triggered.push('fleet_percentile');
    }
  }

  const possible = 4 + (input.faultFlags ? 1 : 0) + (input.peerLatest ? 1 : 0);
  const confidence = possible > 0 ? triggered.length / possible : 0;
  // Severity blends the strongest statistical signal with the breadth of agreement.
  const zSeverity = Math.min(1, Math.abs(z) / 4);
  const score = Math.min(1, 0.5 * zSeverity + 0.5 * confidence);
  return { methodsTriggered: triggered, score, confidence };
}

export interface DegradationTrend {
  slopePerDay: number; // change in metric per day
  rSquared: number; // goodness of fit 0–1
  direction: 'improving' | 'stable' | 'degrading';
}

// Ordinary least squares on (dayIndex, value). The slope is the degradation
// rate; R² tells us how much to trust it.
export function degradationTrend(
  series: number[],
  degradeDirection: 'down' | 'up' = 'down',
): DegradationTrend {
  const n = series.length;
  if (n < 2) return { slopePerDay: 0, rSquared: 0, direction: 'stable' };
  const xs = series.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(series);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (series[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
    syy += (series[i] - my) * (series[i] - my);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const rSquared = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  let direction: DegradationTrend['direction'] = 'stable';
  const threshold = (Math.abs(my) || 1) * 0.002; // 0.2% of level per day
  if (Math.abs(slope) >= threshold) {
    const degrading = degradeDirection === 'down' ? slope < 0 : slope > 0;
    direction = degrading ? 'degrading' : 'improving';
  }
  return { slopePerDay: slope, rSquared, direction };
}

export interface RulResult {
  rulDays: number; // days until the metric hits the failure threshold
  confidence: number; // 0–1 (driven by fit quality)
  basis: 'trend' | 'stable' | 'already_failed';
}

const RUL_CAP_DAYS = 3650; // cap "healthy" RUL at 10 years to keep numbers sane

// Remaining-Useful-Life: project the degradation trend to the failure threshold.
export function remainingUsefulLife(
  currentValue: number,
  slopePerDay: number,
  failureThreshold: number,
  rSquared = 0.5,
  degradeDirection: 'down' | 'up' = 'down',
): RulResult {
  const failed =
    degradeDirection === 'down' ? currentValue <= failureThreshold : currentValue >= failureThreshold;
  if (failed) return { rulDays: 0, confidence: Math.max(0.5, rSquared), basis: 'already_failed' };

  const movingToFailure = degradeDirection === 'down' ? slopePerDay < 0 : slopePerDay > 0;
  if (!movingToFailure || slopePerDay === 0) {
    return { rulDays: RUL_CAP_DAYS, confidence: rSquared, basis: 'stable' };
  }
  const gap = failureThreshold - currentValue; // negative when down-degrading
  const days = gap / slopePerDay; // both signs align → positive
  const rulDays = Math.max(0, Math.min(RUL_CAP_DAYS, Math.round(days)));
  return { rulDays, confidence: rSquared, basis: 'trend' };
}

// ── Failure-mode fingerprinting ───────────────────────────────────────────
export type FaultMode =
  | 'inverter_igbt_degradation'
  | 'inverter_cooling_fan'
  | 'inverter_comms_loss'
  | 'string_pid_degradation'
  | 'panel_soiling'
  | 'panel_hotspot'
  | 'dc_arc_fault'
  | 'tracker_motor_fault'
  | 'transformer_thermal'
  | 'battery_cell_imbalance'
  | 'battery_thermal_runaway'
  | 'grid_excursion';

// Safety-implicated modes — fire / arc / thermal-runaway risk. These floor the
// tier at 'major' and drive the OHSA / NRCS regulator crossing.
const SAFETY_FAULT_MODES = new Set<FaultMode>([
  'dc_arc_fault',
  'transformer_thermal',
  'battery_thermal_runaway',
  'panel_hotspot',
]);

export function isSafetyFaultMode(mode: FaultMode): boolean {
  return SAFETY_FAULT_MODES.has(mode);
}

export interface SymptomVector {
  efficiencyDriftPct?: number; // sustained output below expected (%)
  faultCodeCount?: number; // OEM fault codes in window
  tempExcursionC?: number; // °C above expected operating temp
  currentImbalancePct?: number; // string/phase current imbalance (%)
  soilingLossPct?: number; // modelled soiling loss (%)
  commsGapRatio?: number; // fraction of intervals with comms gaps
  dcArcFlag?: boolean; // arc-fault detector tripped
  cellImbalancePct?: number; // BESS cell voltage imbalance (%)
  trackerStallFlag?: boolean; // tracker not following sun
  fleetPercentile?: number; // device's fleet rank (0–1, low == laggard)
}

export interface FaultModeRanking {
  mode: FaultMode;
  confidence: number; // 0–1
  evidence: string[];
  safety: boolean;
}

// Rule-scored symptom → fault-mode ranking. Each mode accumulates evidence-
// weighted score from the symptoms that implicate it; the result is sorted and
// every entry carries the human-readable evidence that justifies it (the
// "explainable" part NTT's black-box ML lacks).
export function classifyFailureMode(s: SymptomVector): FaultModeRanking[] {
  const acc: Record<string, { score: number; evidence: string[] }> = {};
  const add = (mode: FaultMode, score: number, ev: string) => {
    if (!acc[mode]) acc[mode] = { score: 0, evidence: [] };
    acc[mode].score += score;
    acc[mode].evidence.push(ev);
  };

  if (s.dcArcFlag) add('dc_arc_fault', 0.95, 'DC arc-fault detector tripped');
  if ((s.tempExcursionC ?? 0) >= 15) {
    add('transformer_thermal', 0.5, `temperature ${s.tempExcursionC}°C above expected`);
    add('inverter_cooling_fan', 0.4, `over-temperature ${s.tempExcursionC}°C`);
  }
  if ((s.cellImbalancePct ?? 0) >= 5) add('battery_thermal_runaway', 0.6, `cell imbalance ${s.cellImbalancePct}%`);
  else if ((s.cellImbalancePct ?? 0) >= 2) add('battery_cell_imbalance', 0.7, `cell imbalance ${s.cellImbalancePct}%`);
  if ((s.soilingLossPct ?? 0) >= 3) add('panel_soiling', 0.8, `soiling loss ${s.soilingLossPct}%`);
  if ((s.currentImbalancePct ?? 0) >= 10) {
    add('string_pid_degradation', 0.6, `string current imbalance ${s.currentImbalancePct}%`);
    add('panel_hotspot', 0.45, `current imbalance ${s.currentImbalancePct}% suggests hotspot`);
  }
  if ((s.commsGapRatio ?? 0) >= 0.3) add('inverter_comms_loss', 0.7, `comms gaps in ${Math.round((s.commsGapRatio ?? 0) * 100)}% of intervals`);
  if ((s.faultCodeCount ?? 0) >= 3) add('inverter_igbt_degradation', 0.55, `${s.faultCodeCount} OEM fault codes in window`);
  if ((s.efficiencyDriftPct ?? 0) >= 5) add('inverter_igbt_degradation', 0.45, `efficiency drift ${s.efficiencyDriftPct}%`);
  if (s.trackerStallFlag) add('tracker_motor_fault', 0.8, 'tracker not tracking sun position');
  if ((s.fleetPercentile ?? 1) <= 0.15) add('string_pid_degradation', 0.35, `bottom ${Math.round((s.fleetPercentile ?? 0) * 100)}th fleet percentile`);

  const ranked: FaultModeRanking[] = Object.entries(acc).map(([mode, v]) => ({
    mode: mode as FaultMode,
    confidence: Math.min(1, v.score),
    evidence: v.evidence,
    safety: isSafetyFaultMode(mode as FaultMode),
  }));
  ranked.sort((a, b) => b.confidence - a.confidence);
  return ranked;
}

// ── Revenue-at-risk & O&M savings ledger ────────────────────────────────────

// Expected lost generation per day from a degraded asset → ZAR at the PPA tariff.
export function revenueAtRiskZar(
  lostKwhPerDay: number,
  tariffZarPerMwh: number,
  rulDays: number,
): number {
  if (lostKwhPerDay <= 0 || tariffZarPerMwh <= 0) return 0;
  const horizonDays = Math.max(1, Math.min(rulDays, 365));
  const lostMwh = (lostKwhPerDay * horizonDays) / 1000;
  return Math.round(lostMwh * tariffZarPerMwh);
}

export interface SavingsLedger {
  reactiveCostZar: number; // cost if run to failure (lost gen + emergency repair + collateral)
  predictiveCostZar: number; // cost of planned intervention now
  savingsZar: number; // reactive − predictive
  savingsPct: number; // savings / reactive
  benchmarkSavingsZar: number; // what the NTT/industry benchmark % would have saved
  incrementalVsBenchmarkZar: number; // how much MORE we save than the benchmark
  leadTimeDays: number; // RUL — how early we caught it
}

// Industry / NTT predictive-maintenance benchmark: ~30% cost avoidance vs pure
// reactive. We compute our actual savings and the incremental advantage over
// that benchmark — the number that proves "better than NTT".
const NTT_BENCHMARK_SAVINGS_PCT = 0.3;

export function savingsLedger(args: {
  revenueAtRiskZar: number; // lost generation if unaddressed
  emergencyRepairZar: number; // unplanned/after-hours repair + collateral damage
  plannedRepairZar: number; // cost of the planned intervention
  rulDays: number;
  benchmarkPct?: number;
}): SavingsLedger {
  const benchmarkPct = args.benchmarkPct ?? NTT_BENCHMARK_SAVINGS_PCT;
  const reactiveCostZar = Math.round(args.revenueAtRiskZar + args.emergencyRepairZar);
  const predictiveCostZar = Math.round(args.plannedRepairZar);
  const savingsZar = Math.max(0, reactiveCostZar - predictiveCostZar);
  const savingsPct = reactiveCostZar > 0 ? savingsZar / reactiveCostZar : 0;
  const benchmarkSavingsZar = Math.round(reactiveCostZar * benchmarkPct);
  const incrementalVsBenchmarkZar = Math.max(0, savingsZar - benchmarkSavingsZar);
  return {
    reactiveCostZar,
    predictiveCostZar,
    savingsZar,
    savingsPct,
    benchmarkSavingsZar,
    incrementalVsBenchmarkZar,
    leadTimeDays: Math.max(0, args.rulDays),
  };
}

// Composite 0–100 health score from the four pillars. 100 == nominal.
export function healthScore(args: {
  performanceRatio?: number; // 0–1; nominal ~0.82
  anomalyScore?: number; // 0–1 ensemble severity
  faultModeConfidence?: number; // 0–1 top fault confidence
  rulDays?: number; // remaining useful life
}): number {
  const prPillar = args.performanceRatio != null ? Math.min(1, args.performanceRatio / 0.82) : 1;
  const anomalyPillar = 1 - Math.min(1, args.anomalyScore ?? 0);
  const faultPillar = 1 - Math.min(1, args.faultModeConfidence ?? 0);
  const rulPillar = args.rulDays != null ? Math.min(1, args.rulDays / 180) : 1;
  const composite = 0.3 * prPillar + 0.3 * anomalyPillar + 0.25 * faultPillar + 0.15 * rulPillar;
  return Math.round(Math.max(0, Math.min(1, composite)) * 100);
}

// ===========================================================================
// PART B — PROGNOSTIC LIFECYCLE STATE MACHINE
// ===========================================================================

export type PrognosticStatus =
  | 'predicted'
  | 'triaged'
  | 'diagnosed'
  | 'action_planned'
  | 'wo_raised'
  | 'monitoring'
  | 'resolved'
  | 'dismissed'
  | 'escalated'
  | 'auto_suppressed'
  | 'expired'
  | 'confirmed_failure';

export type PrognosticAction =
  | 'triage_prediction'
  | 'dismiss_prediction'
  | 'auto_suppress'
  | 'diagnose_root_cause'
  | 'plan_action'
  | 'raise_work_order'
  | 'begin_monitoring'
  | 'confirm_resolved'
  | 'escalate_prognostic'
  | 'record_failure'
  | 'expire_prognostic'
  | 'reopen_recurrence';

export type PrognosticTier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

export type PrognosticEvent =
  | 'asset_prognostic.triaged'
  | 'asset_prognostic.dismissed'
  | 'asset_prognostic.auto_suppressed'
  | 'asset_prognostic.diagnosed'
  | 'asset_prognostic.action_planned'
  | 'asset_prognostic.wo_raised'
  | 'asset_prognostic.monitoring'
  | 'asset_prognostic.resolved'
  | 'asset_prognostic.escalated'
  | 'asset_prognostic.confirmed_failure'
  | 'asset_prognostic.expired'
  | 'asset_prognostic.sla_breached';

const TERMINALS = new Set<PrognosticStatus>([
  'resolved',
  'dismissed',
  'auto_suppressed',
  'expired',
  'confirmed_failure',
]);

const DISMISSABLE = new Set<PrognosticStatus>(['predicted', 'triaged']);

export function isTerminal(s: PrognosticStatus): boolean {
  return TERMINALS.has(s);
}

export function isDismissable(s: PrognosticStatus): boolean {
  return DISMISSABLE.has(s);
}

const ALL_ACTIVE: PrognosticStatus[] = [
  'predicted',
  'triaged',
  'diagnosed',
  'action_planned',
  'wo_raised',
  'monitoring',
  'escalated',
];

export const TRANSITIONS: Record<PrognosticAction, { from: PrognosticStatus[]; to: PrognosticStatus }> = {
  triage_prediction:   { from: ['predicted'],                                                  to: 'triaged' },
  dismiss_prediction:  { from: ['predicted', 'triaged'],                                       to: 'dismissed' },
  auto_suppress:       { from: ['predicted'],                                                  to: 'auto_suppressed' },
  diagnose_root_cause: { from: ['triaged', 'monitoring'],                                      to: 'diagnosed' },
  plan_action:         { from: ['diagnosed'],                                                  to: 'action_planned' },
  raise_work_order:    { from: ['action_planned', 'escalated'],                                to: 'wo_raised' },
  begin_monitoring:    { from: ['wo_raised'],                                                  to: 'monitoring' },
  confirm_resolved:    { from: ['monitoring'],                                                 to: 'resolved' },
  escalate_prognostic: { from: ['triaged', 'diagnosed', 'action_planned', 'monitoring'],       to: 'escalated' },
  record_failure:      { from: ALL_ACTIVE,                                                     to: 'confirmed_failure' },
  expire_prognostic:   { from: ['predicted', 'triaged', 'diagnosed'],                          to: 'expired' },
  reopen_recurrence:   { from: ['monitoring'],                                                 to: 'diagnosed' },
};

export function nextStatus(current: PrognosticStatus, action: PrognosticAction): PrognosticStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: PrognosticStatus): PrognosticAction[] {
  const acts: PrognosticAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [PrognosticAction, typeof TRANSITIONS[PrognosticAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the higher the revenue-at-risk / the more safety-critical, the
// TIGHTER the window. Strictly decreasing minor → critical per graded state.
// Terminals carry no deadline.
export const SLA_MINUTES: Record<PrognosticStatus, Record<PrognosticTier, number>> = {
  predicted: {
    minor: 3 * DAY, moderate: 2 * DAY, material: 1 * DAY, major: 8 * HOUR, critical: 2 * HOUR,
  },
  triaged: {
    minor: 5 * DAY, moderate: 3 * DAY, material: 2 * DAY, major: 1 * DAY, critical: 6 * HOUR,
  },
  diagnosed: {
    minor: 7 * DAY, moderate: 5 * DAY, material: 3 * DAY, major: 2 * DAY, critical: 12 * HOUR,
  },
  action_planned: {
    minor: 10 * DAY, moderate: 7 * DAY, material: 4 * DAY, major: 2 * DAY, critical: 1 * DAY,
  },
  wo_raised: {
    minor: 14 * DAY, moderate: 10 * DAY, material: 7 * DAY, major: 3 * DAY, critical: 1 * DAY,
  },
  monitoring: {
    minor: 21 * DAY, moderate: 14 * DAY, material: 10 * DAY, major: 7 * DAY, critical: 3 * DAY,
  },
  escalated: {
    minor: 2 * DAY, moderate: 1 * DAY, material: 12 * HOUR, major: 6 * HOUR, critical: 2 * HOUR,
  },
  resolved:          { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  dismissed:         { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  auto_suppressed:   { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  expired:           { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  confirmed_failure: { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
};

export function slaWindowMinutes(status: PrognosticStatus, tier: PrognosticTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: PrognosticStatus, tier: PrognosticTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

const TIER_RANK: Record<PrognosticTier, number> = {
  minor: 0, moderate: 1, material: 2, major: 3, critical: 4,
};
const RANK_TIER: PrognosticTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];

// Base tier from revenue-at-risk (ZAR).
export function tierForRevenue(zar: number): PrognosticTier {
  if (zar < 5000) return 'minor';
  if (zar < 25000) return 'moderate';
  if (zar < 100000) return 'material';
  if (zar < 500000) return 'major';
  return 'critical';
}

// A safety-implicated fault mode floors the tier at 'major' regardless of ZAR.
export function safetyFloor(safetyImplicated: boolean): PrognosticTier {
  return safetyImplicated ? 'major' : 'minor';
}

export function prognosticTier(zar: number, safetyImplicated: boolean): PrognosticTier {
  const base = tierForRevenue(zar);
  const floor = safetyFloor(safetyImplicated);
  const rank = Math.max(TIER_RANK[base], TIER_RANK[floor]);
  return RANK_TIER[rank];
}

const HIGH_TIERS = new Set<PrognosticTier>(['major', 'critical']);

export function isHighTier(tier: PrognosticTier): boolean {
  return HIGH_TIERS.has(tier);
}

// Reportability — the W71 SIGNATURE is SAFETY-driven:
//   - record_failure crosses for EVERY tier when the fault mode is safety-
//     implicated (a materialised safety failure is always an OHSA/NRCS event);
//     otherwise it crosses for the high tiers.
//   - escalate_prognostic crosses for the high tiers when safety-implicated.
export function crossesIntoRegulator(
  action: PrognosticAction,
  tier: PrognosticTier,
  safetyImplicated: boolean,
): boolean {
  if (action === 'record_failure') return safetyImplicated || HIGH_TIERS.has(tier);
  if (action === 'escalate_prognostic') return safetyImplicated && HIGH_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: PrognosticTier): boolean {
  return HIGH_TIERS.has(tier);
}

// A case is reportable irrespective of action when it is safety-implicated or a
// high tier.
export function isReportable(tier: PrognosticTier, safetyImplicated: boolean): boolean {
  return safetyImplicated || HIGH_TIERS.has(tier);
}
