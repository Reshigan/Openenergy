import { describe, it, expect } from 'vitest';
import {
  computePeriodImbalance,
  computeRun,
  aggregateMonthly,
  PeriodNomination,
  PeriodPricing,
  ImbalanceRecord,
} from '../src/utils/imbalance-engine';

const pricing: PeriodPricing = {
  period_start: '2026-03-01T00:00:00Z',
  period_end: '2026-03-01T00:30:00Z',
  long_price_zar_mwh: 800,
  short_price_zar_mwh: 2400,
  tolerance_mwh: 0.05,
};

function nom(scheduled: number, actual: number, brp = 'brp_a', t = '2026-03-01T00:00:00Z'): PeriodNomination {
  return {
    brp_participant_id: brp,
    period_start: t,
    period_end: t.replace(':00:00Z', ':30:00Z'),
    scheduled_mwh: scheduled,
    actual_mwh: actual,
  };
}

describe('computePeriodImbalance', () => {
  it('classifies as balanced inside the tolerance band', () => {
    const r = computePeriodImbalance(nom(10, 10.04), pricing);
    expect(r.direction).toBe('balanced');
    expect(r.imbalance_charge_zar).toBe(0);
    expect(r.price_applied_zar_mwh).toBe(0);
  });

  it('classifies short BRP and charges at short price (positive = owes)', () => {
    const r = computePeriodImbalance(nom(10, 9), pricing);
    expect(r.direction).toBe('short');
    expect(r.imbalance_mwh).toBe(-1);
    expect(r.price_applied_zar_mwh).toBe(2400);
    expect(r.imbalance_charge_zar).toBe(2400);
  });

  it('classifies long BRP and credits at long price (negative = receives)', () => {
    const r = computePeriodImbalance(nom(10, 11), pricing);
    expect(r.direction).toBe('long');
    expect(r.imbalance_mwh).toBe(1);
    expect(r.price_applied_zar_mwh).toBe(800);
    expect(r.imbalance_charge_zar).toBe(-800);
  });

  it('applies a haircut (positive charge) when long price is negative', () => {
    const negPricing = { ...pricing, long_price_zar_mwh: -200 };
    const r = computePeriodImbalance(nom(10, 12), negPricing);
    expect(r.direction).toBe('long');
    expect(r.imbalance_charge_zar).toBe(400); // 2 MWh * -(-200) = +400 (BRP pays)
  });

  it('defaults tolerance to 0.05 MWh when not provided', () => {
    const noTolerance = { ...pricing, tolerance_mwh: undefined };
    const r = computePeriodImbalance(nom(10, 10.04), noTolerance);
    expect(r.direction).toBe('balanced');
  });

  it('treats boundary-exact imbalance as balanced', () => {
    const r = computePeriodImbalance(nom(10, 10.05), pricing);
    expect(r.direction).toBe('balanced');
  });

  it('rounds imbalance and charge to the expected precision', () => {
    const r = computePeriodImbalance(nom(10, 10.1234567), pricing);
    expect(r.imbalance_mwh).toBe(0.1235);
    // 0.1235 × 800 = 98.80, stored as -98.80 (long BRP receives).
    expect(r.imbalance_charge_zar).toBe(-98.8);
  });
});

describe('computeRun', () => {
  it('skips periods with no price configured', () => {
    const noms = [
      nom(10, 11, 'brp_a', '2026-03-01T00:00:00Z'),
      nom(10, 9, 'brp_a', '2026-03-01T00:30:00Z'),
    ];
    const idx = new Map<string, PeriodPricing>();
    idx.set('2026-03-01T00:00:00Z', pricing);
    // second period absent — should be skipped, not thrown.
    const out = computeRun(noms, idx);
    expect(out).toHaveLength(1);
    expect(out[0].period_start).toBe('2026-03-01T00:00:00Z');
  });

  it('produces one record per matched nomination', () => {
    const noms = [
      nom(10, 11, 'brp_a', '2026-03-01T00:00:00Z'),
      nom(10, 9, 'brp_b', '2026-03-01T00:00:00Z'),
    ];
    const idx = new Map([['2026-03-01T00:00:00Z', pricing]]);
    const out = computeRun(noms, idx);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((r) => r.direction))).toEqual(new Set(['long', 'short']));
  });
});

describe('aggregateMonthly', () => {
  function rec(
    brp: string,
    direction: ImbalanceRecord['direction'],
    imbalance: number,
    charge: number,
  ): ImbalanceRecord {
    return {
      brp_participant_id: brp,
      period_start: '2026-03-01T00:00:00Z',
      period_end: '2026-03-01T00:30:00Z',
      scheduled_mwh: 10,
      actual_mwh: 10 + imbalance,
      imbalance_mwh: imbalance,
      direction,
      price_applied_zar_mwh: direction === 'short' ? 2400 : direction === 'long' ? 800 : 0,
      imbalance_charge_zar: charge,
    };
  }

  it('aggregates long/short charges and on-target percentage per BRP', () => {
    const records: ImbalanceRecord[] = [
      rec('brp_a', 'short', -1, 2400),
      rec('brp_a', 'long', 1, -800),
      rec('brp_a', 'balanced', 0, 0),
      rec('brp_b', 'short', -2, 4800),
    ];
    const totals = aggregateMonthly(records, '2026-03');
    const a = totals.find((t) => t.brp_participant_id === 'brp_a')!;
    const b = totals.find((t) => t.brp_participant_id === 'brp_b')!;

    expect(a.periods_count).toBe(3);
    expect(a.imbalance_mwh_short).toBe(-1);
    expect(a.imbalance_mwh_long).toBe(1);
    expect(a.short_charge_zar).toBe(2400);
    expect(a.long_charge_zar).toBe(-800);
    expect(a.net_charge_zar).toBe(1600);
    expect(a.on_target_period_pct).toBeCloseTo(33.33, 1);

    expect(b.periods_count).toBe(1);
    expect(b.net_charge_zar).toBe(4800);
    expect(b.on_target_period_pct).toBe(0);
  });

  it('sorts BRPs by net charge descending (largest payer first)', () => {
    const records: ImbalanceRecord[] = [
      rec('brp_small', 'short', -0.5, 1200),
      rec('brp_large', 'short', -5, 12000),
      rec('brp_credit', 'long', 2, -1600),
    ];
    const totals = aggregateMonthly(records, '2026-03');
    expect(totals.map((t) => t.brp_participant_id)).toEqual(['brp_large', 'brp_small', 'brp_credit']);
  });

  it('returns empty array when no records supplied', () => {
    expect(aggregateMonthly([], '2026-03')).toEqual([]);
  });

  it('assigns the passed-in period string to every total (the aggregator does not derive it)', () => {
    const records: ImbalanceRecord[] = [rec('brp_a', 'short', -1, 2400)];
    const totals = aggregateMonthly(records, '2026-04');
    expect(totals[0].period).toBe('2026-04');
  });
});
