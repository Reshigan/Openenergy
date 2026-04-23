import { describe, it, expect } from 'vitest';
import {
  canOpenTrade,
  initialMarginFor,
  markToMarket,
  nettingReduce,
  utilisationPercentage,
  variationMarginShortfall,
} from '../src/utils/trader-risk';

describe('markToMarket', () => {
  it('profits a long when mark exceeds entry', () => {
    const pos = { participant_id: 'p1', energy_type: 'solar', delivery_date: null, net_volume_mwh: 10, avg_entry_price: 100 };
    expect(markToMarket(pos, 110)).toBe(100); // 10 * (110 - 100)
  });

  it('profits a short when mark falls below entry', () => {
    const pos = { participant_id: 'p1', energy_type: 'solar', delivery_date: null, net_volume_mwh: -10, avg_entry_price: 100 };
    expect(markToMarket(pos, 90)).toBe(100); // -10 * (90 - 100) = 100
  });

  it('returns 0 for a flat position', () => {
    const pos = { participant_id: 'p1', energy_type: 'solar', delivery_date: null, net_volume_mwh: 0, avg_entry_price: 100 };
    expect(markToMarket(pos, 110)).toBe(0);
  });

  it('returns 0 when avg_entry_price is null', () => {
    const pos = { participant_id: 'p1', energy_type: 'solar', delivery_date: null, net_volume_mwh: 10, avg_entry_price: null };
    expect(markToMarket(pos, 110)).toBe(0);
  });
});

describe('initialMarginFor', () => {
  it('applies 10% default rate', () => {
    expect(initialMarginFor(100_000)).toBe(10_000);
  });
  it('caps at 25% for high volatility', () => {
    expect(initialMarginFor(100_000, 100)).toBe(25_000);
  });
  it('floors at 5% for very low volatility', () => {
    expect(initialMarginFor(100_000, 1)).toBe(5_000);
  });
  it('returns absolute value for negative exposure', () => {
    expect(initialMarginFor(-50_000)).toBe(5_000);
  });
});

describe('variationMarginShortfall', () => {
  it('is zero when PnL is positive', () => {
    expect(variationMarginShortfall(10_000, 5_000, 5_000)).toBe(0);
  });
  it('is zero when posted collateral covers the loss + IM', () => {
    expect(variationMarginShortfall(-10_000, 20_000, 10_000)).toBe(0);
  });
  it('is the unfunded delta when collateral is short', () => {
    // loss 10k + IM 10k = 20k required; posted 15k → shortfall 5k
    expect(variationMarginShortfall(-10_000, 15_000, 10_000)).toBe(5_000);
  });
});

describe('utilisationPercentage', () => {
  it('reports 50% when half the limit is used', () => {
    expect(utilisationPercentage(500_000, 1_000_000)).toBe(50);
  });
  it('returns 0 for a flat zero-limit zero-exposure participant', () => {
    expect(utilisationPercentage(0, 0)).toBe(0);
  });
  it('caps the reported percentage for a zero-limit participant with exposure', () => {
    expect(utilisationPercentage(100, 0)).toBe(1000);
  });
  it('caps at 1000% even when exposure far exceeds limit', () => {
    expect(utilisationPercentage(1_000_000_000, 1)).toBe(1000);
  });
});

describe('canOpenTrade', () => {
  it('allows when the incoming fits inside headroom', () => {
    const r = canOpenTrade(100_000, 200_000, 1_000_000);
    expect(r.allowed).toBe(true);
    expect(r.headroom_zar).toBe(700_000);
  });
  it('refuses when the incoming exceeds the headroom', () => {
    const r = canOpenTrade(900_000, 200_000, 1_000_000);
    expect(r.allowed).toBe(false);
    expect(r.headroom_zar).toBe(0);
  });
});

describe('nettingReduce', () => {
  it('nets a simple A→B→A circular pair to near-zero', () => {
    const r = nettingReduce([
      { from: 'A', to: 'B', amount_zar: 100 },
      { from: 'B', to: 'A', amount_zar: 100 },
    ]);
    expect(r.total_gross).toBe(200);
    expect(r.total_net).toBe(0);
    expect(r.netting_ratio).toBe(0);
    expect(r.nets.A).toBe(0);
    expect(r.nets.B).toBe(0);
  });

  it('preserves net amounts — receivers positive, payers negative, sum zero', () => {
    const r = nettingReduce([
      { from: 'A', to: 'B', amount_zar: 100 },
      { from: 'A', to: 'C', amount_zar: 50 },
      { from: 'B', to: 'C', amount_zar: 25 },
    ]);
    expect(r.nets.A).toBe(-150);
    expect(r.nets.B).toBe(75);
    expect(r.nets.C).toBe(75);
    const sum = Object.values(r.nets).reduce((s, v) => s + v, 0);
    expect(sum).toBe(0);
  });

  it('ignores zero or negative obligations', () => {
    const r = nettingReduce([
      { from: 'A', to: 'B', amount_zar: 0 },
      { from: 'A', to: 'B', amount_zar: -10 },
      { from: 'A', to: 'B', amount_zar: 100 },
    ]);
    expect(r.total_gross).toBe(100);
    expect(r.nets.A).toBe(-100);
    expect(r.nets.B).toBe(100);
  });
});
