import { describe, it, expect } from 'vitest';
import { insightLine, sparklinePoints } from './StreamInsight';

describe('insightLine', () => {
  it('leads with rand quantum when present', () => {
    expect(insightLine({ quantum_zar: 1_250_000, score: 40 })).toContain('R1.3m');
  });
  it('flags high attention score', () => {
    expect(insightLine({ score: 90 })).toMatch(/high attention|top of queue/i);
  });
  it('falls back to status when no score or quantum', () => {
    expect(insightLine({ status: 'under_verification' })).toContain('under verification');
  });
});

describe('sparklinePoints', () => {
  it('returns 8 points', () => {
    expect(sparklinePoints(50)).toHaveLength(8);
  });
  it('is deterministic for a given score', () => {
    expect(sparklinePoints(50)).toEqual(sparklinePoints(50));
  });
  it('scales with score', () => {
    const hi = sparklinePoints(90).reduce((a, b) => a + b, 0);
    const lo = sparklinePoints(10).reduce((a, b) => a + b, 0);
    expect(hi).toBeGreaterThan(lo);
  });
});
