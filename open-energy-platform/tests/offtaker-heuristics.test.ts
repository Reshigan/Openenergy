import { describe, it, expect } from 'vitest';
import { extractBillProfile, buildDeterministicMix } from '../src/utils/offtaker-heuristics';

describe('extractBillProfile — tariff + consumption parsing', () => {
  it('parses annual kWh stated directly', () => {
    const p = extractBillProfile('Annual consumption: 18,500,000 kWh');
    expect(p.annual_kwh).toBe(18_500_000);
  });

  it('parses consumption in GWh and converts to kWh', () => {
    const p = extractBillProfile('Total annual 18.5 GWh');
    expect(p.annual_kwh).toBeCloseTo(18_500_000);
  });

  it('parses consumption in MWh and converts to kWh', () => {
    const p = extractBillProfile('Consumption 2,500 MWh / year');
    expect(p.annual_kwh).toBe(2_500_000);
  });

  it('parses avg tariff from R-prefixed rate', () => {
    const p = extractBillProfile('Avg tariff R 2.10 /kWh');
    expect(p.avg_tariff_zar_per_kwh).toBe(2.1);
  });

  it('falls back to deterministic defaults when nothing parseable', () => {
    const p = extractBillProfile('no useful numbers here');
    expect(p.annual_kwh).toBe(1_200_000);
    expect(p.avg_tariff_zar_per_kwh).toBe(2.15);
  });

  it('honours explicit overrides over the parser', () => {
    const p = extractBillProfile('Annual 10 GWh @ R2/kWh', {
      annual_kwh: 7_000_000,
      avg_tariff: 1.95,
    });
    expect(p.annual_kwh).toBe(7_000_000);
    expect(p.avg_tariff_zar_per_kwh).toBe(1.95);
  });
});

describe('extractBillProfile — peak vs off-peak disambiguation (PR #23 regression)', () => {
  // Before PR #23, a bill with "off-peak 45%" first and then "peak 15%"
  // could match the leading 'peak' inside 'off-peak' and swap the two
  // values. The negative lookbehind fixes this.
  it('does not swap peak and off-peak when off-peak appears first', () => {
    const p = extractBillProfile(
      'TOU shape: off-peak 45%, standard 40%, peak 15%',
    );
    expect(p.peak_pct).toBeCloseTo(0.15);
    expect(p.standard_pct).toBeCloseTo(0.4);
    expect(p.offpeak_pct).toBeCloseTo(0.45);
  });

  it('accepts bare percentages >1 as percent (35 → 0.35)', () => {
    const p = extractBillProfile('peak 35%, standard 40%, off-peak 25%');
    expect(p.peak_pct).toBeCloseTo(0.35);
  });

  it('accepts already-fractional values unchanged', () => {
    const p = extractBillProfile('peak 0.4%');
    // 0.4 is already in (0,1] → treated as fraction directly.
    expect(p.peak_pct).toBeCloseTo(0.4);
  });
});

describe('extractBillProfile — TOU risk derivation', () => {
  it('explicit TOU risk in text wins', () => {
    expect(extractBillProfile('TOU risk high').tou_risk).toBe('high');
    expect(extractBillProfile('TOU: low').tou_risk).toBe('low');
  });

  it('derives high when peak >= 30%', () => {
    expect(extractBillProfile('peak 35%').tou_risk).toBe('high');
  });

  it('derives medium when peak in [20%, 30%)', () => {
    expect(extractBillProfile('peak 22%').tou_risk).toBe('medium');
  });

  it('derives low when peak < 20%', () => {
    expect(extractBillProfile('peak 15%').tou_risk).toBe('low');
  });
});

describe('buildDeterministicMix — savings calc (PR #23 regression)', () => {
  // PR #23 fixed a bug where a 2-project mix (share_pct sums to 75%) silently
  // treated the uncovered 25% as free electricity, overstating savings. The
  // fix adds the uncovered portion at the current tariff.
  const currentTariff = 2.15;

  it('accounts for uncovered portion when <4 projects are available', () => {
    const projects = [
      { id: 'p1', project_name: 'Solar A', status: 'operating', ppa_price: 1000 },
      { id: 'p2', project_name: 'Wind B', status: 'construction', ppa_price: 1100 },
    ];
    const result = buildDeterministicMix(projects, 10_000, currentTariff);

    // share_pcts = [45, 30] → uncovered = 25%.
    const totalShare = result.mix.reduce((a, m) => a + m.share_pct, 0);
    expect(totalShare).toBe(75);

    // Weighted price should include 25% at currentTariff*1000 (R/MWh).
    const currentPerMwh = currentTariff * 1000;
    const weighted = 0.45 * 1000 + 0.3 * 1100 + 0.25 * currentPerMwh;
    const expected = Math.max(0, Math.round(((currentPerMwh - weighted) / currentPerMwh) * 100));
    expect(result.savings_pct).toBe(expected);
  });

  it('full-coverage mix computes savings against blended PPA only', () => {
    const projects = [
      { id: 'p1', project_name: 'A', status: 'operating', ppa_price: 1000 },
      { id: 'p2', project_name: 'B', status: 'operating', ppa_price: 1100 },
      { id: 'p3', project_name: 'C', status: 'operating', ppa_price: 1200 },
      { id: 'p4', project_name: 'D', status: 'operating', ppa_price: 1300 },
    ];
    const result = buildDeterministicMix(projects, 10_000, currentTariff);
    const total = result.mix.reduce((a, m) => a + m.share_pct, 0);
    expect(total).toBe(100);
    expect(result.savings_pct).toBeGreaterThan(0);
  });

  it('clamps negative savings to 0 (never reports worse-than-current)', () => {
    // All PPAs above the current tariff → "savings" should floor at 0.
    const projects = [
      { id: 'p1', project_name: 'A', status: 'operating', ppa_price: 99_999 },
    ];
    const result = buildDeterministicMix(projects, 1_000, currentTariff);
    expect(result.savings_pct).toBe(0);
  });

  it('emits a warning when no projects are supplied', () => {
    const result = buildDeterministicMix([], 1_000, currentTariff);
    expect(result.warnings).toContain('No eligible projects found');
  });

  it('uses fallback PPA (R1850) when a project has no ppa_price', () => {
    const projects = [{ id: 'p1', project_name: 'A', status: 'operating' }];
    const result = buildDeterministicMix(projects, 1_000, currentTariff);
    expect(result.mix[0].blended_price).toBe(1850);
  });
});
