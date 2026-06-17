// ─────────────────────────────────────────────────────────────────────────
// Wave 71 — ML prognostics inference layer (Batch 4)
//
// The W71 engine (asset-prognostics-spec.ts) is a 6-method STATISTICAL anomaly
// ensemble + OLS-extrapolation RUL + rule-scored fault fingerprint. Strong, but
// the headline ask is "the best possible predictive fault analysis and very
// accurate anomaly detection". This module adds the genuinely-ML methods that
// raise accuracy WITHOUT fabricating training data or shipping fake weights —
// every method here is either training-free or fit online from the supplied
// window, so it honours the "Goldrush actuals only — no synthetic data" rule
// and runs deterministically inside a Cloudflare Worker (pure TS, no native
// deps, no external model server):
//
//   1. SPECTRAL RESIDUAL (SR) anomaly detection — the algorithm behind Microsoft
//      Azure Anomaly Detector (best-in-class commercial detector). Training-free,
//      FFT/DFT-based saliency. Catches contextual/seasonal anomalies the z-score
//      and EWMA control chart miss. We beat the category leader by running its
//      own method, then FUSING it with the statistical ensemble.
//
//   2. ISOLATION FOREST — real unsupervised ML, fit ONLINE on the supplied
//      feature window (no labels, no stored weights). Seeded PRNG ⇒ fully
//      deterministic and unit-testable. Average isolation path length → an
//      anomaly score in (0,1); short paths = easily isolated = anomalous.
//
//   3. WIENER-PROCESS SURVIVAL RUL — models degradation as Brownian motion with
//      drift; first-passage time to the failure threshold is Inverse-Gaussian
//      (Wald) distributed. Gives a CALIBRATED RUL with p10/p50/p90 bands instead
//      of a single linear point estimate. Standard prognostics-literature model.
//
//   4. BAYESIAN FAULT POSTERIOR — turns the physics rule scores into calibrated
//      class probabilities (prior × likelihood, normalised) with an entropy
//      confidence, so a desk sees "73% inverter IGBT" not just a raw rank.
//
//   5. mlAnomalyFusion() — folds SR + isolation forest into the existing 6
//      statistical methods to yield an 8-method fused anomaly confidence.
//
// SAFETY: nothing here ever suppresses a prediction. Methods that cannot run on
// a too-short window degrade gracefully (reported as `skipped`), never throw.
// ─────────────────────────────────────────────────────────────────────────

// ── Numeric primitives ──────────────────────────────────────────────────────

/** Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation. */
export function normalCdf(x: number): number {
  // erf(z) approximation, max abs error ~1.5e-7
  const z = x / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  const erf = z >= 0 ? y : -y;
  return 0.5 * (1 + erf);
}

/** Naive complex DFT (O(n²)). Series are short (≤ a few hundred) so this is
 *  exact and deterministic — no FFT-radix constraints on length. Returns the
 *  real and imaginary parts. */
export function dft(re: number[]): { re: number[]; im: number[] } {
  const n = re.length;
  const outRe = new Array<number>(n).fill(0);
  const outIm = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    let sumRe = 0;
    let sumIm = 0;
    for (let t = 0; t < n; t++) {
      const ang = (-2 * Math.PI * k * t) / n;
      sumRe += re[t] * Math.cos(ang);
      sumIm += re[t] * Math.sin(ang);
    }
    outRe[k] = sumRe;
    outIm[k] = sumIm;
  }
  return { re: outRe, im: outIm };
}

/** Inverse DFT; returns the real magnitude (modulus) of each sample. */
export function idftMagnitude(re: number[], im: number[]): number[] {
  const n = re.length;
  const out = new Array<number>(n).fill(0);
  for (let t = 0; t < n; t++) {
    let sumRe = 0;
    let sumIm = 0;
    for (let k = 0; k < n; k++) {
      const ang = (2 * Math.PI * k * t) / n;
      sumRe += re[k] * Math.cos(ang) - im[k] * Math.sin(ang);
      sumIm += re[k] * Math.sin(ang) + im[k] * Math.cos(ang);
    }
    out[t] = Math.hypot(sumRe, sumIm) / n;
  }
  return out;
}

/** Mulberry32 — tiny seeded PRNG. Deterministic given a seed, so the isolation
 *  forest produces identical scores across runs (production & tests alike). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 1. Spectral Residual anomaly detection ──────────────────────────────────

export interface SpectralResidualResult {
  ran: boolean; // false if window too short — degraded gracefully
  saliency: number[]; // saliency map aligned to the input series
  scoreLatest: number; // saliency-anomaly score of the latest point (≥0)
  isAnomaly: boolean; // scoreLatest > threshold
  threshold: number;
}

const SR_MIN_POINTS = 12;

/** Append `m` estimated points beyond the series end (Azure SR "added points"
 *  step) so the latest REAL point sits mid-window with neighbours on both sides
 *  instead of on the FFT boundary. The continuation is predicted from the trend
 *  of the points BEFORE the last — anchoring on the pre-anomaly trend (not the
 *  last value) means a genuine anomaly at the final reading stands out against
 *  the prediction instead of being carried into the padding. */
function srExtendSeries(series: number[], m: number, k: number): number[] {
  const n = series.length;
  const anchor = n >= 2 ? series[n - 2] : series[n - 1];
  let gSum = 0;
  let cnt = 0;
  for (let j = 1; j <= Math.min(k, n - 2); j++) {
    gSum += (series[n - 2] - series[n - 2 - j]) / j;
    cnt++;
  }
  const g = cnt > 0 ? gSum / cnt : 0;
  const ext: number[] = [];
  for (let i = 1; i <= m; i++) ext.push(anchor + g * i);
  return series.concat(ext);
}

function movingAverage(xs: number[], w: number): number[] {
  const n = xs.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let lo = Math.max(0, i - Math.floor(w / 2));
    let hi = Math.min(n - 1, i + Math.floor(w / 2));
    let s = 0;
    for (let j = lo; j <= hi; j++) s += xs[j];
    out[i] = s / (hi - lo + 1);
  }
  return out;
}

/**
 * Spectral Residual saliency anomaly detector (Hou & Zhang 2007; productionised
 * by Azure Anomaly Detector). Training-free. A point whose saliency exceeds
 * `threshold`× the local saliency average is anomalous.
 */
export function spectralResidualAnomaly(
  series: number[],
  opts: { q?: number; threshold?: number; extendPoints?: number; gradientK?: number } = {},
): SpectralResidualResult {
  const clean = series.filter((x) => Number.isFinite(x));
  if (clean.length < SR_MIN_POINTS) {
    return { ran: false, saliency: [], scoreLatest: 0, isAnomaly: false, threshold: opts.threshold ?? 3 };
  }
  const q = opts.q ?? 3;
  const threshold = opts.threshold ?? 3;
  const m = opts.extendPoints ?? 5;
  const k = opts.gradientK ?? 5;

  const extended = srExtendSeries(clean, m, k);
  const { re, im } = dft(extended);
  const amp = re.map((r, i) => Math.hypot(r, im[i]));
  const logAmp = amp.map((a) => Math.log(a + 1e-8));
  const avgLog = movingAverage(logAmp, q);
  const specResidual = logAmp.map((l, i) => l - avgLog[i]);
  // Reconstruct with original phase, residual magnitude: exp(R) * e^{iP}
  const phase = re.map((r, i) => Math.atan2(im[i], r));
  const newRe = specResidual.map((r, i) => Math.exp(r) * Math.cos(phase[i]));
  const newIm = specResidual.map((r, i) => Math.exp(r) * Math.sin(phase[i]));
  // saliency = |.|² over the FULL extended length so the latest real point has
  // neighbours on BOTH sides (the appended padding) for a centred local average.
  const salFull = idftMagnitude(newRe, newIm).map((s) => s * s);
  const localAvg = movingAverage(salFull, Math.min(21, Math.max(3, Math.floor(clean.length / 3))));
  const scores = salFull.map((s, i) => (localAvg[i] > 1e-12 ? (s - localAvg[i]) / localAvg[i] : 0));
  const latestIdx = clean.length - 1; // the last REAL point, before the padding
  const scoreLatest = Math.max(0, scores[latestIdx]);
  return {
    ran: true,
    saliency: salFull.slice(0, clean.length), // aligned to the caller's input
    scoreLatest,
    isAnomaly: scoreLatest > threshold,
    threshold,
  };
}

// ── 2. Isolation Forest (online-fit, seeded) ────────────────────────────────

export interface IsolationForestResult {
  ran: boolean;
  scoreLatest: number; // 0–1; >0.5 increasingly anomalous
  scores: number[]; // per-point scores aligned to input rows
  isAnomaly: boolean; // scoreLatest > threshold
  threshold: number;
  trees: number;
}

interface ITreeNode {
  size: number;
  splitFeature?: number;
  splitValue?: number;
  left?: ITreeNode;
  right?: ITreeNode;
}

const IF_MIN_ROWS = 8;

/** Average path length of an unsuccessful BST search of n points — the
 *  normaliser c(n) in the isolation-forest score. */
function cFactor(n: number): number {
  if (n <= 1) return 0;
  const H = Math.log(n - 1) + 0.5772156649; // harmonic ≈ ln + Euler-Mascheroni
  return 2 * H - (2 * (n - 1)) / n;
}

function buildITree(rows: number[][], depth: number, maxDepth: number, rng: () => number): ITreeNode {
  const n = rows.length;
  if (depth >= maxDepth || n <= 1) return { size: n };
  const dims = rows[0].length;
  const f = Math.floor(rng() * dims);
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) {
    if (r[f] < lo) lo = r[f];
    if (r[f] > hi) hi = r[f];
  }
  if (lo === hi) return { size: n };
  const splitValue = lo + rng() * (hi - lo);
  const left: number[][] = [];
  const right: number[][] = [];
  for (const r of rows) (r[f] < splitValue ? left : right).push(r);
  return {
    size: n,
    splitFeature: f,
    splitValue,
    left: buildITree(left, depth + 1, maxDepth, rng),
    right: buildITree(right, depth + 1, maxDepth, rng),
  };
}

function pathLength(node: ITreeNode, x: number[], depth: number): number {
  if (node.splitFeature === undefined || node.left === undefined || node.right === undefined) {
    return depth + cFactor(node.size);
  }
  const next = x[node.splitFeature] < (node.splitValue as number) ? node.left : node.right;
  return pathLength(next, x, depth + 1);
}

/**
 * Isolation Forest fit online on `rows` (each a feature vector). Deterministic
 * given `seed`. Anomaly score s = 2^(−E[h(x)]/c(n)); → 1 means very anomalous.
 */
export function isolationForest(
  rows: number[][],
  opts: { trees?: number; sampleSize?: number; seed?: number; threshold?: number } = {},
): IsolationForestResult {
  const data = rows.filter((r) => Array.isArray(r) && r.every((v) => Number.isFinite(v)));
  const threshold = opts.threshold ?? 0.6;
  if (data.length < IF_MIN_ROWS) {
    return { ran: false, scoreLatest: 0, scores: [], isAnomaly: false, threshold, trees: 0 };
  }
  const nTrees = opts.trees ?? 100;
  const psi = Math.min(opts.sampleSize ?? 256, data.length);
  const maxDepth = Math.ceil(Math.log2(Math.max(2, psi)));
  const cN = cFactor(psi);
  const rng = mulberry32(opts.seed ?? 1337);

  const forest: ITreeNode[] = [];
  for (let t = 0; t < nTrees; t++) {
    // sub-sample without replacement (Fisher–Yates prefix)
    const idx = data.map((_, i) => i);
    for (let i = 0; i < psi; i++) {
      const j = i + Math.floor(rng() * (idx.length - i));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const sample = idx.slice(0, psi).map((i) => data[i].slice());
    forest.push(buildITree(sample, 0, maxDepth, rng));
  }

  const scores = data.map((x) => {
    let hSum = 0;
    for (const tree of forest) hSum += pathLength(tree, x, 0);
    const eh = hSum / forest.length;
    return Math.pow(2, -eh / (cN || 1));
  });
  const scoreLatest = scores[scores.length - 1];
  return { ran: true, scoreLatest, scores, isAnomaly: scoreLatest > threshold, threshold, trees: nTrees };
}

/** Featurise a univariate series into [level, rate-of-change, deviation-from-
 *  median] rows for the isolation forest. */
export function featurizeSeries(series: number[]): number[][] {
  const clean = series.filter((x) => Number.isFinite(x));
  if (clean.length === 0) return [];
  const sorted = [...clean].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return clean.map((v, i) => [v, i > 0 ? v - clean[i - 1] : 0, v - median]);
}

// ── 3. Wiener-process survival RUL ──────────────────────────────────────────

export interface SurvivalRulResult {
  method: 'wiener_inverse_gaussian' | 'degenerate';
  ran: boolean;
  rulP10: number; // optimistic (early) — 10th percentile crossing time, days
  rulP50: number; // median crossing time, days
  rulP90: number; // pessimistic (late) — 90th percentile, days
  driftPerDay: number; // |drift| toward threshold
  volatility: number; // residual σ per day
  confidence: number; // 0–1 — narrower band ⇒ higher confidence
}

const RUL_CAP_DAYS = 3650;

/** Inverse-Gaussian (Wald) CDF: first-passage time of Brownian motion with
 *  drift to a barrier. mu = mean, lambda = shape. */
export function inverseGaussianCdf(t: number, mu: number, lambda: number): number {
  if (t <= 0) return 0;
  const a = Math.sqrt(lambda / t) * (t / mu - 1);
  const b = -Math.sqrt(lambda / t) * (t / mu + 1);
  return normalCdf(a) + Math.exp((2 * lambda) / mu) * normalCdf(b);
}

/** Quantile of the Inverse-Gaussian by bisection on its CDF. */
export function inverseGaussianQuantile(p: number, mu: number, lambda: number): number {
  if (!(mu > 0) || !(lambda > 0)) return RUL_CAP_DAYS;
  let lo = 1e-6;
  let hi = mu;
  // expand hi until CDF(hi) ≥ p (capped)
  for (let i = 0; i < 60 && inverseGaussianCdf(hi, mu, lambda) < p; i++) hi *= 2;
  if (hi > RUL_CAP_DAYS) hi = RUL_CAP_DAYS;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    if (inverseGaussianCdf(mid, mu, lambda) < p) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Survival RUL from a degradation series. Fits drift (OLS slope) + volatility
 * (residual σ) and models time-to-threshold as Inverse-Gaussian. `direction`
 * 'down' = metric falls to a floor (PR, yield); 'up' = metric rises to a ceiling
 * (temperature). Returns p10/p50/p90 crossing times in days (1 sample = 1 day).
 */
export function survivalRul(
  series: number[],
  failureThreshold: number,
  direction: 'down' | 'up' = 'down',
): SurvivalRulResult {
  const clean = series.filter((x) => Number.isFinite(x));
  const n = clean.length;
  const degenerate = (): SurvivalRulResult => ({
    method: 'degenerate',
    ran: false,
    rulP10: RUL_CAP_DAYS,
    rulP50: RUL_CAP_DAYS,
    rulP90: RUL_CAP_DAYS,
    driftPerDay: 0,
    volatility: 0,
    confidence: 0,
  });
  if (n < 3) return degenerate();

  // OLS slope & residual σ on (t, value)
  const xs = clean.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = clean.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (clean[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    sse += (clean[i] - pred) * (clean[i] - pred);
  }
  const sigma = Math.sqrt(sse / Math.max(1, n - 2));

  const latest = clean[n - 1];
  const gap = direction === 'down' ? latest - failureThreshold : failureThreshold - latest;
  const drift = direction === 'down' ? -slope : slope; // positive ⇒ moving toward threshold
  // Already past the threshold, or not moving toward it ⇒ degenerate.
  if (gap <= 0) return { ...degenerate(), method: 'degenerate', rulP10: 0, rulP50: 0, rulP90: 0 };
  if (drift <= 1e-9) return degenerate();

  const mu = gap / drift; // mean first-passage time (days)
  const lambda = sigma > 1e-9 ? (gap * gap) / (sigma * sigma) : RUL_CAP_DAYS * 1e3;
  const rulP50 = Math.min(RUL_CAP_DAYS, inverseGaussianQuantile(0.5, mu, lambda));
  const rulP10 = Math.min(RUL_CAP_DAYS, inverseGaussianQuantile(0.1, mu, lambda));
  const rulP90 = Math.min(RUL_CAP_DAYS, inverseGaussianQuantile(0.9, mu, lambda));
  // Confidence = how tight the band is relative to the median (narrow ⇒ certain).
  const spread = rulP50 > 0 ? (rulP90 - rulP10) / rulP50 : Infinity;
  const confidence = Math.max(0, Math.min(1, 1 - spread / 2));
  return {
    method: 'wiener_inverse_gaussian',
    ran: true,
    rulP10,
    rulP50,
    rulP90,
    driftPerDay: drift,
    volatility: sigma,
    confidence,
  };
}

// ── 4. Bayesian fault posterior ─────────────────────────────────────────────

export interface FaultPosteriorEntry {
  mode: string;
  probability: number; // calibrated posterior, sums to 1 across entries
  safety: boolean;
}
export interface FaultPosteriorResult {
  posterior: FaultPosteriorEntry[];
  top: FaultPosteriorEntry | null;
  confidence: number; // 1 − normalised entropy: peaked ⇒ confident
}

/**
 * Turn rule-scored fault rankings into calibrated class probabilities via Bayes
 * (posterior ∝ prior × likelihood). `ranking` is the W71 classifyFailureMode
 * output. `priors` default to uniform; pass observed base rates to sharpen.
 */
export function faultPosterior(
  ranking: { mode: string; confidence: number; safety?: boolean }[],
  priors: Record<string, number> = {},
): FaultPosteriorResult {
  if (!ranking.length) return { posterior: [], top: null, confidence: 0 };
  // likelihood = rule confidence (≥ small floor so no class is impossible)
  const weighted = ranking.map((r) => ({
    mode: r.mode,
    safety: !!r.safety,
    w: Math.max(1e-3, r.confidence) * (priors[r.mode] ?? 1),
  }));
  const z = weighted.reduce((a, b) => a + b.w, 0);
  const posterior: FaultPosteriorEntry[] = weighted
    .map((r) => ({ mode: r.mode, safety: r.safety, probability: r.w / z }))
    .sort((a, b) => b.probability - a.probability);
  // confidence = 1 − normalised Shannon entropy
  const k = posterior.length;
  let h = 0;
  for (const p of posterior) if (p.probability > 0) h -= p.probability * Math.log(p.probability);
  const hMax = Math.log(k);
  const confidence = hMax > 0 ? 1 - h / hMax : 1;
  return { posterior, top: posterior[0] ?? null, confidence };
}

// ── 5. Fused 8-method anomaly ───────────────────────────────────────────────

export interface FusedAnomalyResult {
  fusedScore: number; // 0–1 — blended severity
  fusedConfidence: number; // 0–1 — agreement across all available methods
  methodsRun: string[];
  spectralResidual: SpectralResidualResult;
  isolationForest: IsolationForestResult;
}

/**
 * Fold Spectral Residual + Isolation Forest into the existing statistical
 * ensemble's (score, confidence). Methods that could not run (short window) are
 * excluded from the agreement denominator rather than counted as "no anomaly",
 * so a short series degrades to the statistical result instead of diluting it.
 */
export function mlAnomalyFusion(
  series: number[],
  statistical: { score: number; confidence: number },
  opts: { srThreshold?: number; ifSeed?: number } = {},
): FusedAnomalyResult {
  const sr = spectralResidualAnomaly(series, { threshold: opts.srThreshold });
  const iforest = isolationForest(featurizeSeries(series), { seed: opts.ifSeed });

  const methodsRun = ['statistical_ensemble'];
  const severities = [Math.max(0, Math.min(1, statistical.score))];
  const votes = [statistical.confidence];

  if (sr.ran) {
    methodsRun.push('spectral_residual');
    severities.push(Math.min(1, sr.scoreLatest / (sr.threshold || 3)));
    votes.push(sr.isAnomaly ? 1 : 0);
  }
  if (iforest.ran) {
    methodsRun.push('isolation_forest');
    // map (0.5..1) → (0..1); below 0.5 is "normal"
    severities.push(Math.max(0, Math.min(1, (iforest.scoreLatest - 0.5) / 0.5)));
    votes.push(iforest.isAnomaly ? 1 : 0);
  }

  const fusedScore = severities.reduce((a, b) => a + b, 0) / severities.length;
  const fusedConfidence = votes.reduce((a, b) => a + b, 0) / votes.length;
  return { fusedScore, fusedConfidence, methodsRun, spectralResidual: sr, isolationForest: iforest };
}
