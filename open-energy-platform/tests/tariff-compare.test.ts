import { describe, it, expect } from 'vitest';
import { dayCost, rankTariffs, scope2 } from '../src/utils/tariff-compare';

function flatProfile(kwh: number): number[] {
  return Array(48).fill(kwh / 48);
}

describe('dayCost — flat tariff', () => {
  it('multiplies total kWh by rate', () => {
    const cost = dayCost({ half_hour_kwh: flatProfile(48) }, { type: 'flat', cents_per_kwh: 150 });
    expect(cost).toBeCloseTo(72, 2); // 48 kWh × 150c = 7200c = R72
  });
});

describe('dayCost — TOU tariff', () => {
  const tariff = {
    type: 'tou' as const,
    schedule: {
      off_peak: { cents_per_kwh: 75,  hours: [[22, 6]] as Array<[number, number]> },
      standard: { cents_per_kwh: 115, hours: [[6, 7], [10, 18], [20, 22]] as Array<[number, number]> },
      peak:     { cents_per_kwh: 320, hours: [[7, 10], [18, 20]] as Array<[number, number]> },
    },
  };

  it('charges peak rate during peak hours', () => {
    // 2 kWh consumed from 07:00 to 08:00 (two half-hours, both peak).
    const profile = Array(48).fill(0);
    profile[14] = 1; // 07:00-07:30
    profile[15] = 1; // 07:30-08:00
    const cost = dayCost({ half_hour_kwh: profile }, tariff);
    expect(cost).toBeCloseTo(6.4, 2); // 2 × 320c = 640c = R6.40
  });

  it('charges off-peak rate overnight', () => {
    // 2 kWh at 23:00-00:00 (two half-hours, both off-peak).
    const profile = Array(48).fill(0);
    profile[46] = 1;
    profile[47] = 1;
    const cost = dayCost({ half_hour_kwh: profile }, tariff);
    expect(cost).toBeCloseTo(1.5, 2); // 2 × 75c = 150c = R1.50
  });

  it('crosses midnight correctly for off-peak band [22,6]', () => {
    // 1 kWh at 02:00-02:30 should bill off-peak.
    const profile = Array(48).fill(0);
    profile[4] = 1;
    const cost = dayCost({ half_hour_kwh: profile }, tariff);
    expect(cost).toBeCloseTo(0.75, 2);
  });

  it('falls back to standard when an hour fits no bucket', () => {
    const spotty = {
      type: 'tou' as const,
      schedule: {
        standard: { cents_per_kwh: 100, hours: [[0, 0]] as Array<[number, number]> },  // empty range
      },
    };
    const profile = Array(48).fill(0);
    profile[10] = 1;
    const cost = dayCost({ half_hour_kwh: profile }, spotty);
    expect(cost).toBe(1.0);
  });

  it('rejects a profile of wrong length', () => {
    expect(() => dayCost({ half_hour_kwh: [1, 2, 3] }, { type: 'flat', cents_per_kwh: 100 })).toThrow();
  });
});

describe('rankTariffs', () => {
  it('ranks cheapest first and computes annualised savings', () => {
    const profile = { half_hour_kwh: flatProfile(24) };
    const ranked = rankTariffs(profile, [
      { id: 'A', name: 'A', tariff: { type: 'flat', cents_per_kwh: 200 } },
      { id: 'B', name: 'B', tariff: { type: 'flat', cents_per_kwh: 100 } },
      { id: 'C', name: 'C', tariff: { type: 'flat', cents_per_kwh: 150 } },
    ]);
    expect(ranked[0].id).toBe('B');
    expect(ranked[1].id).toBe('C');
    expect(ranked[2].id).toBe('A');
    expect(ranked[0].annualised_zar).toBeCloseTo(24 * 100 / 100 * 365, 2);
    expect(ranked[0].save_vs_worst_zar).toBeGreaterThan(0);
  });
});

describe('scope2', () => {
  it('computes location-based and market-based emissions', () => {
    const r = scope2({
      total_consumption_mwh: 1000,
      renewable_claimed_mwh: 300,
      grid_factor_tco2e_per_mwh: 0.93,
    });
    expect(r.location_based_tco2e).toBeCloseTo(930, 2);
    expect(r.market_based_tco2e).toBeCloseTo(651, 2); // 700 × 0.93
    expect(r.renewable_percentage).toBe(30);
  });

  it('clamps market-based to zero when RECs exceed consumption', () => {
    const r = scope2({
      total_consumption_mwh: 500,
      renewable_claimed_mwh: 600,
      grid_factor_tco2e_per_mwh: 0.93,
    });
    expect(r.market_based_tco2e).toBe(0);
    expect(r.renewable_percentage).toBe(100);
  });

  it('handles zero consumption gracefully', () => {
    const r = scope2({
      total_consumption_mwh: 0,
      renewable_claimed_mwh: 0,
      grid_factor_tco2e_per_mwh: 0.93,
    });
    expect(r.location_based_tco2e).toBe(0);
    expect(r.market_based_tco2e).toBe(0);
    expect(r.renewable_percentage).toBe(0);
  });
});
