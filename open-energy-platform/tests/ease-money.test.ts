// Ease Kit money/ranking primitive. Pure (the Bucket import is type-only, erased),
// so it runs in the backend vitest project without pulling the SPA bundle.
import { describe, it, expect } from 'vitest';
import { fmtZar, zarCompact, zarMagnitudeClass, atRisk, byAtRisk, __demo } from '../pages/src/meridian/ease/money';

describe('ease/money', () => {
  it('formats ZAR in compact magnitude bands', () => {
    expect(fmtZar(950)).toBe('R 950');
    expect(fmtZar(2_500)).toBe('R 3k');
    expect(fmtZar(2_500_000)).toBe('R 2.5m');
    expect(fmtZar(2_500_000_000)).toBe('R 2.50bn');
    expect(fmtZar(null)).toBe('');
    expect(fmtZar(undefined)).toBe('');
  });

  it('zarCompact drops the R prefix', () => {
    expect(zarCompact(2_500_000)).toBe('2.5m');
    expect(zarCompact(null)).toBe('');
  });

  it('bands magnitude for type-scale emphasis', () => {
    expect(zarMagnitudeClass(500_000)).toBe('m1');
    expect(zarMagnitudeClass(5_000_000)).toBe('m2');
    expect(zarMagnitudeClass(500_000_000)).toBe('m3');
  });

  it('ranks urgency above raw ZAR (a breached small case beats a calm large one)', () => {
    expect(atRisk(1_000, 'breached')).toBeGreaterThan(atRisk(1_000_000, 'later'));
  });

  it('still ranks zero-ZAR items by urgency (compliance with no ZAR)', () => {
    expect(atRisk(null, 'breached')).toBeGreaterThan(atRisk(null, 'today'));
    expect(atRisk(0, 'today')).toBeGreaterThan(atRisk(0, 'week'));
  });

  it('byAtRisk sorts most-consequential first', () => {
    const rows = [
      { quantum_zar: 5_000_000, bucket: 'later' as const },
      { quantum_zar: 10_000, bucket: 'breached' as const },
      { quantum_zar: 1_000_000, bucket: 'today' as const },
    ];
    const sorted = [...rows].sort(byAtRisk);
    expect(sorted[0].bucket).toBe('breached');
    expect(sorted[2].bucket).toBe('later');
  });

  it('self-check passes', () => expect(__demo()).toBe(true));
});
