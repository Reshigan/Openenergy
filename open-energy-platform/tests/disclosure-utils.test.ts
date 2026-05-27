// Unit tests for src/utils/disclosure.ts — CPMI-IOSCO compute + breach eval.

import { describe, it, expect } from 'vitest';
import { computeDisclosure, evaluateBreaches } from '../src/utils/disclosure';

const baseInputs = {
  initial_margin_total_zar: 100_000_000,
  variation_margin_total_zar: 5_000_000,
  margin_var99_lookback_zar: 90_000_000,
  qualifying_liquid_resources_zar: 200_000_000,
  largest_member_exposure_zar: 150_000_000,
  default_fund_balance_zar: 50_000_000,
  default_fund_required_zar: 40_000_000,
  ccp_capital_zar: 20_000_000,
  ccp_capital_sitg_pct: 0.25,
  settled_instruction_count: 9_995,
  failed_instruction_count: 5,
  active_member_count: 42,
};

describe('computeDisclosure', () => {
  it('passes through marginal/VM totals unchanged', () => {
    const snap = computeDisclosure(baseInputs, '2026-05-31');
    expect(snap.initial_margin_total_zar).toBe(100_000_000);
    expect(snap.variation_margin_total_zar).toBe(5_000_000);
    expect(snap.active_member_count).toBe(42);
  });

  it('computes margin_coverage_pct = IM / VaR99 × 100', () => {
    const snap = computeDisclosure(baseInputs, '2026-05-31');
    // 100M / 90M ≈ 111.11%
    expect(snap.margin_coverage_pct).toBeCloseTo(111.11, 1);
  });

  it('computes liquidity_coverage_ratio = QLR / largest exposure', () => {
    const snap = computeDisclosure(baseInputs, '2026-05-31');
    // 200M / 150M ≈ 1.333
    expect(snap.liquidity_coverage_ratio).toBeCloseTo(1.333, 3);
  });

  it('computes default_fund_coverage_ratio = balance / required', () => {
    const snap = computeDisclosure(baseInputs, '2026-05-31');
    // 50M / 40M = 1.25
    expect(snap.default_fund_coverage_ratio).toBeCloseTo(1.25, 2);
  });

  it('computes skin_in_game as capital × pct', () => {
    const snap = computeDisclosure(baseInputs, '2026-05-31');
    // 20M × 0.25 = 5M
    expect(snap.ccp_capital_skin_in_game_zar).toBe(5_000_000);
  });

  it('computes finality_pct = settled / (settled + failed) × 100', () => {
    const snap = computeDisclosure(baseInputs, '2026-05-31');
    // 9995 / 10000 = 99.95%
    expect(snap.settlement_finality_pct).toBeCloseTo(99.95, 2);
  });

  it('returns 0 ratio when denominator is 0 (no VaR data)', () => {
    const snap = computeDisclosure({ ...baseInputs, margin_var99_lookback_zar: 0 }, '2026-05-31');
    expect(snap.margin_coverage_pct).toBe(0);
  });

  it('returns 0 finality when no instructions settled or failed', () => {
    const snap = computeDisclosure(
      { ...baseInputs, settled_instruction_count: 0, failed_instruction_count: 0 },
      '2026-05-31',
    );
    expect(snap.settlement_finality_pct).toBe(0);
  });
});

describe('evaluateBreaches', () => {
  it('returns no breaches for the healthy baseline', () => {
    const snap = computeDisclosure(baseInputs, '2026-05-31');
    expect(evaluateBreaches(snap)).toEqual([]);
  });

  it('flags margin under-coverage when IM < VaR99', () => {
    const snap = computeDisclosure(
      { ...baseInputs, initial_margin_total_zar: 80_000_000 },  // 80/90 ≈ 88.8%
      '2026-05-31',
    );
    const breaches = evaluateBreaches(snap);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].metric).toBe('margin_coverage_pct');
    expect(breaches[0].why).toMatch(/Cover-1/);
  });

  it('flags default fund shortfall when balance < required', () => {
    const snap = computeDisclosure(
      { ...baseInputs, default_fund_balance_zar: 30_000_000 },  // 30/40 = 0.75
      '2026-05-31',
    );
    const breaches = evaluateBreaches(snap);
    const m = breaches.find((b) => b.metric === 'default_fund_coverage_ratio');
    expect(m).toBeDefined();
    expect(m!.value).toBeCloseTo(0.75, 2);
  });

  it('flags liquidity shortfall when QLR < largest member', () => {
    const snap = computeDisclosure(
      { ...baseInputs, qualifying_liquid_resources_zar: 100_000_000 },  // 100/150 = 0.667
      '2026-05-31',
    );
    const breaches = evaluateBreaches(snap);
    expect(breaches.some((b) => b.metric === 'liquidity_coverage_ratio')).toBe(true);
  });

  it('flags finality < 99.5%', () => {
    const snap = computeDisclosure(
      { ...baseInputs, settled_instruction_count: 990, failed_instruction_count: 10 },  // 99.0%
      '2026-05-31',
    );
    const breaches = evaluateBreaches(snap);
    expect(breaches.some((b) => b.metric === 'settlement_finality_pct')).toBe(true);
  });

  it('aggregates multiple breaches', () => {
    const snap = computeDisclosure(
      {
        ...baseInputs,
        initial_margin_total_zar: 50_000_000,             // breach
        default_fund_balance_zar: 10_000_000,             // breach
        qualifying_liquid_resources_zar: 50_000_000,      // breach
        settled_instruction_count: 99, failed_instruction_count: 1,  // 99% — breach
      },
      '2026-05-31',
    );
    const breaches = evaluateBreaches(snap);
    expect(breaches.length).toBe(4);
  });
});
