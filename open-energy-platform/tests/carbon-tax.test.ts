import { describe, it, expect } from 'vitest';
import { applyOffsetAllowance, offsetAllowancePct, rangeOverlaps } from '../src/utils/carbon-tax';

describe('offsetAllowancePct', () => {
  it('returns 5% for the general industry group', () => {
    expect(offsetAllowancePct('general')).toBe(5);
  });
  it('returns 10% for annex-2 industries (mining / petroleum)', () => {
    expect(offsetAllowancePct('annex_2')).toBe(10);
  });
});

describe('applyOffsetAllowance', () => {
  it('caps the offset at 5% of gross liability for general industry', () => {
    // Gross 1,000,000 → 5% cap = 50,000. Credits 500 tCO2e × R190 = 95,000 → capped to 50k.
    const r = applyOffsetAllowance({
      gross_tax_liability_zar: 1_000_000,
      industry_group: 'general',
      credits_tco2e: 500,
      tax_rate_zar_per_tco2e: 190,
    });
    expect(r.offset_limit_zar).toBe(50_000);
    expect(r.offset_applied_zar).toBe(50_000);
    expect(r.net).toBe(950_000);
    expect(r.credits_used_tco2e).toBeCloseTo(50_000 / 190, 2);
    expect(r.credits_unused_tco2e).toBeGreaterThan(0);
  });

  it('uses all credits when under the cap', () => {
    // 100 tCO2e × R190 = 19,000; cap 50k → applied 19k.
    const r = applyOffsetAllowance({
      gross_tax_liability_zar: 1_000_000,
      industry_group: 'general',
      credits_tco2e: 100,
      tax_rate_zar_per_tco2e: 190,
    });
    expect(r.offset_applied_zar).toBe(19_000);
    expect(r.net).toBe(981_000);
    expect(r.credits_used_tco2e).toBeCloseTo(100, 6);
    expect(r.credits_unused_tco2e).toBeCloseTo(0, 6);
  });

  it('uses the 10% cap for annex-2 industries', () => {
    const r = applyOffsetAllowance({
      gross_tax_liability_zar: 1_000_000,
      industry_group: 'annex_2',
      credits_tco2e: 1000,
      tax_rate_zar_per_tco2e: 190,
    });
    expect(r.offset_limit_pct).toBe(10);
    expect(r.offset_limit_zar).toBe(100_000);
    expect(r.offset_applied_zar).toBe(100_000);
  });

  it('returns net >= 0 even with more credits than liability', () => {
    const r = applyOffsetAllowance({
      gross_tax_liability_zar: 10_000,
      industry_group: 'general',
      credits_tco2e: 10_000,
      tax_rate_zar_per_tco2e: 190,
    });
    expect(r.net).toBeGreaterThanOrEqual(0);
    // Cap is 5% of 10k = 500. Applied 500. Net 9,500.
    expect(r.net).toBe(9500);
  });

  it('treats negative credits as zero', () => {
    const r = applyOffsetAllowance({
      gross_tax_liability_zar: 1_000_000,
      industry_group: 'general',
      credits_tco2e: -50,
      tax_rate_zar_per_tco2e: 190,
    });
    expect(r.offset_applied_zar).toBe(0);
    expect(r.credits_used_tco2e).toBe(0);
  });
});

describe('rangeOverlaps', () => {
  it('detects overlapping ranges', () => {
    expect(rangeOverlaps({ start: 1, end: 10 }, { start: 5, end: 15 })).toBe(true);
    expect(rangeOverlaps({ start: 5, end: 5 }, { start: 5, end: 5 })).toBe(true);
  });
  it('treats touching-but-not-overlapping ranges as overlap', () => {
    // [1,5] and [5,10] share serial 5 — that's an overlap and must be rejected.
    expect(rangeOverlaps({ start: 1, end: 5 }, { start: 5, end: 10 })).toBe(true);
  });
  it('returns false for clearly disjoint ranges', () => {
    expect(rangeOverlaps({ start: 1, end: 10 }, { start: 11, end: 20 })).toBe(false);
    expect(rangeOverlaps({ start: 100, end: 200 }, { start: 1, end: 50 })).toBe(false);
  });
});
