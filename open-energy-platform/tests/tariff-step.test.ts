import { describe, it, expect } from 'vitest';
import { tariffForPeriod } from '../src/routes/esums-accruals';

// Goldrush PPA: R1.23/kWh stepping to R1.3038 from 2026-04-01 (SAST).
const BASE = 1.23;
const STEP = 1.3038;
const ms = (iso: string) => Date.parse(iso);

describe('tariffForPeriod', () => {
  it('returns base before the step date', () => {
    // 2026-04-01 00:00 SAST == 2026-03-31 22:00 UTC; the hour just before is base.
    expect(tariffForPeriod(ms('2026-03-31T21:00:00Z'), BASE, '2026-04-01', STEP)).toBe(BASE);
  });
  it('returns step rate from the SAST day boundary onward (inclusive)', () => {
    expect(tariffForPeriod(ms('2026-03-31T22:00:00Z'), BASE, '2026-04-01', STEP)).toBe(STEP);
    expect(tariffForPeriod(ms('2026-04-15T09:00:00Z'), BASE, '2026-04-01', STEP)).toBe(STEP);
  });
  it('is flat base when no step is configured', () => {
    expect(tariffForPeriod(ms('2030-01-01T00:00:00Z'), BASE, null, null)).toBe(BASE);
    expect(tariffForPeriod(ms('2030-01-01T00:00:00Z'), BASE, '2026-04-01', null)).toBe(BASE);
  });
  it('ignores an unparseable step date', () => {
    expect(tariffForPeriod(ms('2030-01-01T00:00:00Z'), BASE, 'not-a-date', STEP)).toBe(BASE);
  });
});
