import { describe, it, expect } from 'vitest';
import { adviseCovenant, type CovenantTest } from '../src/utils/covenant-advisor';

const test = (overrides: Partial<CovenantTest> = {}): CovenantTest => ({
  id: 't1',
  covenant_id: 'c1',
  covenant_code: 'DSCR_12M',
  covenant_type: 'financial',
  measured_value: 1.10,
  threshold: 1.20,
  result: 'breach',
  test_period: 'Q2-2026',
  test_date: '2026-04-30',
  ...overrides,
});

describe('covenant-advisor', () => {
  it('suggests cure_plan for a small financial shortfall (< 10%)', () => {
    // Measured 1.15 vs threshold 1.20 = ~4% gap.
    const a = adviseCovenant(test({ measured_value: 1.15, threshold: 1.20 }));
    expect(a.recommendation).toBe('cure_plan');
    expect(a.source).toBe('deterministic');
  });

  it('suggests waiver for a 10–25% financial shortfall', () => {
    const a = adviseCovenant(test({ measured_value: 1.00, threshold: 1.20 })); // ~16.7%
    expect(a.recommendation).toBe('waiver');
  });

  it('suggests workout for a 25–40% financial shortfall', () => {
    const a = adviseCovenant(test({ measured_value: 0.85, threshold: 1.20 })); // ~29%
    expect(a.recommendation).toBe('workout');
  });

  it('suggests acceleration for a >40% financial shortfall', () => {
    const a = adviseCovenant(test({ measured_value: 0.60, threshold: 1.20 })); // 50%
    expect(a.recommendation).toBe('acceleration');
  });

  it('flags no_action when the test is marked breach but the value meets threshold (data-quality)', () => {
    const a = adviseCovenant(test({ measured_value: 1.20, threshold: 1.20 }));
    expect(a.recommendation).toBe('no_action');
  });

  it('handles operational availability with cure_plan for material gaps', () => {
    const a = adviseCovenant(
      test({
        covenant_type: 'operational',
        covenant_code: 'AVAILABILITY_95',
        measured_value: 0.85,
        threshold: 0.95,
      }),
    );
    expect(a.recommendation).toBe('cure_plan');
  });

  it('handles operational availability with waiver for near-miss', () => {
    const a = adviseCovenant(
      test({
        covenant_type: 'operational',
        covenant_code: 'AVAILABILITY_95',
        measured_value: 0.93,
        threshold: 0.95,
      }),
    );
    expect(a.recommendation).toBe('waiver');
  });

  it('treats insurance / reporting / legal breaches as cure_plan with no acceleration', () => {
    for (const type of ['insurance', 'reporting', 'legal']) {
      const a = adviseCovenant(test({ covenant_type: type, covenant_code: 'INSURANCE' }));
      expect(a.recommendation).toBe('cure_plan');
      expect(a.recommendation).not.toBe('acceleration');
    }
  });

  it('falls back when no deterministic rule matches', () => {
    const a = adviseCovenant(test({ covenant_type: 'governance', result: 'breach' }));
    expect(a.source).toBe('fallback');
  });
});
