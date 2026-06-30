// pages/src/meridian/ease/money.ts — Ease Kit money + ranking primitives.
// One ZAR formatter and one "what matters most" ranking key, so every surface
// formats and ranks identically (the money-first move the v2 Horizons proved).
// Pure, dependency-free (the Bucket type import is erased at compile time).
import type { Bucket } from '../lib';

// Canonical ZAR formatter — compact, R-prefixed, magnitude-aware. Mirrors the
// long-standing Horizon lib.ts fmtZar so promoting call-sites is behaviour-safe.
export function fmtZar(v: number | null | undefined): string {
  if (v == null) return '';
  if (v >= 1e9) return `R ${(v / 1e9).toFixed(2)}bn`;
  if (v >= 1e6) return `R ${(v / 1e6).toFixed(1)}m`;
  if (v >= 1e3) return `R ${(v / 1e3).toFixed(0)}k`;
  return `R ${v.toFixed(0)}`;
}

// Bare compact number (no R prefix) for tight columns / badges.
export function zarCompact(v: number | null | undefined): string {
  return fmtZar(v).replace(/^R\s*/, '');
}

// Visual magnitude band — drives type-scale/emphasis (m1 small … m3 large).
export function zarMagnitudeClass(v: number | null | undefined): 'm1' | 'm2' | 'm3' {
  if (v == null || v < 1e6) return 'm1';
  if (v < 1e8) return 'm2';
  return 'm3';
}

// Time-to-consequence rank per bucket — breached acts first (it costs the most
// while it waits, per the Horizon board's "overdue acts first" rule).
const BUCKET_WEIGHT: Record<Bucket, number> = {
  breached: 6, h2: 5, today: 4, h48: 3, week: 2, later: 1,
};

// The platform "what matters most" ranking key. URGENCY-PRIMARY: the time-band
// dominates (an overdue case always outranks a calmer one, however large), and
// ZAR-at-risk ranks WITHIN a band. Encoded as a single DESC-sortable number —
// bucket on the high digits, ZAR (capped) on the low. A zero-ZAR breached case
// still beats a zero-ZAR today case. Sort DESC (highest = act first).
const ZAR_CAP = 1e12;
export function atRisk(zar: number | null | undefined, bucket?: Bucket | null): number {
  const z = zar == null || zar < 0 ? 0 : Math.min(zar, ZAR_CAP - 1);
  const w = bucket ? BUCKET_WEIGHT[bucket] : 0;
  return w * ZAR_CAP + z;
}

// Convenience comparator for `arr.sort(byAtRisk)` over {quantum_zar?, bucket?}.
export function byAtRisk<T extends { quantum_zar?: number | null; bucket?: Bucket }>(a: T, b: T): number {
  return atRisk(b.quantum_zar, b.bucket) - atRisk(a.quantum_zar, a.bucket);
}

// ponytail: self-check — formatting bands + ranking ordering.
export function __demo(): boolean {
  return (
    fmtZar(2_500_000) === 'R 2.5m' &&
    fmtZar(null) === '' &&
    zarCompact(2_500_000) === '2.5m' &&
    atRisk(1000, 'breached') > atRisk(1_000_000, 'later') &&
    atRisk(null, 'breached') > atRisk(null, 'today')
  );
}
