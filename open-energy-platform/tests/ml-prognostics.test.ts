import { describe, expect, it } from 'vitest';
import {
  normalCdf,
  dft,
  idftMagnitude,
  mulberry32,
  spectralResidualAnomaly,
  isolationForest,
  featurizeSeries,
  survivalRul,
  inverseGaussianCdf,
  inverseGaussianQuantile,
  faultPosterior,
  mlAnomalyFusion,
} from '../src/utils/ml-prognostics';

// Deterministic helpers — no Math.random()/Date in the engine itself.
function flatSeries(n: number, level = 100): number[] {
  return new Array(n).fill(level);
}

describe('numeric primitives', () => {
  it('normalCdf is anchored: Φ(0)=0.5, symmetric, monotone', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    expect(normalCdf(-2) + normalCdf(2)).toBeCloseTo(1, 5);
  });

  it('DFT→IDFT round-trips a known signal back to its magnitudes', () => {
    const x = [1, 2, 3, 4, 3, 2, 1, 0];
    const { re, im } = dft(x);
    const back = idftMagnitude(re, im);
    for (let i = 0; i < x.length; i++) expect(back[i]).toBeCloseTo(Math.abs(x[i]), 5);
  });

  it('DFT of a constant puts all energy in the DC bin', () => {
    const { re, im } = dft([5, 5, 5, 5]);
    expect(re[0]).toBeCloseTo(20, 6); // 4×5
    for (let k = 1; k < 4; k++) {
      expect(re[k]).toBeCloseTo(0, 6);
      expect(im[k]).toBeCloseTo(0, 6);
    }
  });

  it('mulberry32 is deterministic for a fixed seed and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('spectral residual anomaly', () => {
  it('degrades gracefully (ran=false) on a too-short window — never throws', () => {
    const r = spectralResidualAnomaly([1, 2, 3]);
    expect(r.ran).toBe(false);
    expect(r.isAnomaly).toBe(false);
  });

  it('flags an injected spike at the latest point above a flat baseline', () => {
    const series = flatSeries(40, 100);
    series[series.length - 1] = 250; // sharp anomaly at the end
    const r = spectralResidualAnomaly(series, { threshold: 3 });
    expect(r.ran).toBe(true);
    expect(r.scoreLatest).toBeGreaterThan(0);
    expect(r.isAnomaly).toBe(true);
  });

  it('does NOT flag a clean flat series', () => {
    const r = spectralResidualAnomaly(flatSeries(40, 100), { threshold: 3 });
    expect(r.ran).toBe(true);
    expect(r.isAnomaly).toBe(false);
  });

  it('is deterministic — identical input ⇒ identical score', () => {
    const s = flatSeries(30, 80);
    s[20] = 200;
    expect(spectralResidualAnomaly(s).scoreLatest).toBe(spectralResidualAnomaly(s).scoreLatest);
  });
});

describe('isolation forest', () => {
  it('degrades gracefully on too few rows', () => {
    const r = isolationForest([[1], [2], [3]]);
    expect(r.ran).toBe(false);
  });

  it('scores a clear outlier higher than the inliers', () => {
    const rows: number[][] = [];
    for (let i = 0; i < 60; i++) rows.push([100 + (i % 3)]); // tight cluster ~100
    rows.push([1000]); // gross outlier as the latest row
    const r = isolationForest(rows, { seed: 7 });
    expect(r.ran).toBe(true);
    const inlierMax = Math.max(...r.scores.slice(0, 60));
    expect(r.scoreLatest).toBeGreaterThan(inlierMax);
    expect(r.isAnomaly).toBe(true);
  });

  it('is deterministic given a seed', () => {
    const rows = Array.from({ length: 40 }, (_, i) => [i, i % 5]);
    expect(isolationForest(rows, { seed: 1 }).scoreLatest).toBe(
      isolationForest(rows, { seed: 1 }).scoreLatest,
    );
  });

  it('featurizeSeries produces [level, roc, dev] rows aligned to input', () => {
    const f = featurizeSeries([10, 12, 8]);
    expect(f).toHaveLength(3);
    expect(f[0][1]).toBe(0); // first roc = 0
    expect(f[1][1]).toBe(2); // 12-10
    expect(f[2][1]).toBe(-4); // 8-12
  });
});

describe('survival RUL (Wiener / inverse-Gaussian)', () => {
  it('inverseGaussianCdf is monotone non-decreasing and bounded in [0,1]', () => {
    const mu = 50;
    const lambda = 400;
    let prev = -1;
    for (const t of [1, 10, 25, 50, 100, 200]) {
      const c = inverseGaussianCdf(t, mu, lambda);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1.0001);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it('inverseGaussianQuantile inverts the CDF', () => {
    const mu = 60;
    const lambda = 500;
    const q = inverseGaussianQuantile(0.5, mu, lambda);
    expect(inverseGaussianCdf(q, mu, lambda)).toBeCloseTo(0.5, 2);
  });

  it('orders the bands p10 < p50 < p90 and centres p50 near gap/drift', () => {
    // Degrade ~0.5/day from 100 with small alternating jitter (so σ>0 ⇒ a real
    // band). Latest ≈ 89.9, floor 80 ⇒ gap ≈ 10, drift ≈ 0.5 ⇒ p50 ≈ 20 days.
    const series = Array.from({ length: 20 }, (_, i) => 100 - 0.5 * i + (i % 2 === 0 ? 0.6 : -0.6));
    const r = survivalRul(series, 80, 'down');
    expect(r.ran).toBe(true);
    expect(r.rulP10).toBeLessThan(r.rulP50);
    expect(r.rulP50).toBeLessThan(r.rulP90);
    expect(r.rulP50).toBeGreaterThan(5);
    expect(r.rulP50).toBeLessThan(60);
    expect(r.driftPerDay).toBeCloseTo(0.5, 1);
  });

  it('returns degenerate when the metric is flat (no drift toward threshold)', () => {
    const r = survivalRul(flatSeries(20, 100), 80, 'down');
    expect(r.method).toBe('degenerate');
    expect(r.rulP50).toBe(3650); // capped — effectively never
  });

  it('handles upward degradation (temperature rising to a ceiling)', () => {
    const series = Array.from({ length: 20 }, (_, i) => 40 + 0.5 * i); // rising
    const r = survivalRul(series, 70, 'up');
    expect(r.ran).toBe(true);
    expect(r.rulP50).toBeGreaterThan(0);
  });
});

describe('Bayesian fault posterior', () => {
  it('returns calibrated probabilities that sum to 1', () => {
    const ranking = [
      { mode: 'inverter_igbt', confidence: 0.8, safety: false },
      { mode: 'pid_degradation', confidence: 0.3, safety: false },
      { mode: 'arc_fault', confidence: 0.1, safety: true },
    ];
    const r = faultPosterior(ranking);
    const sum = r.posterior.reduce((a, b) => a + b.probability, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(r.top?.mode).toBe('inverter_igbt'); // highest likelihood wins under uniform prior
  });

  it('a peaked ranking yields higher confidence than a flat one', () => {
    const peaked = faultPosterior([
      { mode: 'a', confidence: 0.95 },
      { mode: 'b', confidence: 0.02 },
      { mode: 'c', confidence: 0.02 },
    ]);
    const flat = faultPosterior([
      { mode: 'a', confidence: 0.34 },
      { mode: 'b', confidence: 0.33 },
      { mode: 'c', confidence: 0.33 },
    ]);
    expect(peaked.confidence).toBeGreaterThan(flat.confidence);
  });

  it('priors shift the posterior', () => {
    const ranking = [
      { mode: 'a', confidence: 0.5 },
      { mode: 'b', confidence: 0.5 },
    ];
    const r = faultPosterior(ranking, { a: 3, b: 1 });
    const a = r.posterior.find((p) => p.mode === 'a')!;
    const b = r.posterior.find((p) => p.mode === 'b')!;
    expect(a.probability).toBeGreaterThan(b.probability);
  });

  it('empty ranking is safe', () => {
    const r = faultPosterior([]);
    expect(r.top).toBeNull();
    expect(r.posterior).toHaveLength(0);
  });
});

describe('8-method anomaly fusion', () => {
  it('fuses SR + isolation forest with the statistical ensemble', () => {
    const series = flatSeries(40, 100);
    series[series.length - 1] = 300;
    const r = mlAnomalyFusion(series, { score: 0.9, confidence: 1 });
    expect(r.methodsRun).toContain('statistical_ensemble');
    expect(r.methodsRun).toContain('spectral_residual');
    expect(r.methodsRun).toContain('isolation_forest');
    expect(r.fusedScore).toBeGreaterThan(0);
    expect(r.fusedConfidence).toBeGreaterThan(0);
  });

  it('degrades to the statistical result alone on a short window', () => {
    const r = mlAnomalyFusion([1, 2, 3], { score: 0.4, confidence: 0.5 });
    expect(r.methodsRun).toEqual(['statistical_ensemble']);
    expect(r.spectralResidual.ran).toBe(false);
    expect(r.isolationForest.ran).toBe(false);
    expect(r.fusedScore).toBeCloseTo(0.4, 6);
    expect(r.fusedConfidence).toBeCloseTo(0.5, 6);
  });

  it('a clean series produces low fused confidence (no method votes anomaly)', () => {
    const r = mlAnomalyFusion(flatSeries(40, 100), { score: 0.05, confidence: 0 });
    expect(r.fusedConfidence).toBeCloseTo(0, 6);
  });
});
