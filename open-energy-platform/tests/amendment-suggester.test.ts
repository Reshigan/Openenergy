import { describe, it, expect } from 'vitest';
import { suggestAmendment, type OrderSnapshot, type MarketSnapshot } from '../src/utils/amendment-suggester';

const order = (overrides: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  id: 'o1',
  participant_id: 'p1',
  side: 'buy',
  energy_type: 'electricity',
  volume_mwh: 10,
  price_zar_mwh: 1500,
  status: 'open',
  posted_at: '2026-05-15T08:00:00Z',
  filled_volume_mwh: 0,
  ...overrides,
});

const market = (overrides: Partial<MarketSnapshot> = {}): MarketSnapshot => ({
  best_bid: 1500,
  best_ask: 1502,
  bid_liquidity_mwh: 100,
  ask_liquidity_mwh: 100,
  tick_zar: 0.5,
  ...overrides,
});

describe('amendment-suggester', () => {
  it('returns null when neither stale-price nor too-thin rules fire', () => {
    const s = suggestAmendment(order(), market(), new Date('2026-05-15T09:00:00Z'));
    expect(s).toBeNull();
  });

  it('suggests re-price when touch has drifted > 2% and order has rested > 2h', () => {
    // Bid at 1600 vs order at 1500 = 6.7% drift; rested 3h → stale fires.
    const s = suggestAmendment(
      order({ price_zar_mwh: 1500 }),
      market({ best_bid: 1600 }),
      new Date('2026-05-15T11:00:00Z'),
    );
    expect(s).not.toBeNull();
    expect(s?.kind).toBe('re_price');
    expect((s?.suggested_state as any).price_zar_mwh).toBeGreaterThan(1500);
  });

  it('does not fire stale-price when order has been resting < 2h', () => {
    const s = suggestAmendment(
      order({ price_zar_mwh: 1500 }),
      market({ best_bid: 1600 }),
      new Date('2026-05-15T08:30:00Z'),
    );
    expect(s).toBeNull();
  });

  it('suggests split when order is > 50% of opposite-side resting liquidity', () => {
    // 60 MWh buy vs 80 MWh resting asks = 75% → split fires.
    const s = suggestAmendment(
      order({ volume_mwh: 60 }),
      market({ ask_liquidity_mwh: 80 }),
      new Date('2026-05-15T09:00:00Z'),
    );
    expect(s).not.toBeNull();
    expect(s?.kind).toBe('split');
    expect((s?.suggested_state as any).child_volume_mwh).toBeGreaterThan(0);
  });

  it('prefers higher-confidence suggestion when multiple rules fire', () => {
    // Both stale-price (drift big + rested) and too-thin (volume vs liquidity) fire.
    const s = suggestAmendment(
      order({ price_zar_mwh: 1500, volume_mwh: 60 }),
      market({ best_bid: 1600, ask_liquidity_mwh: 80 }),
      new Date('2026-05-15T11:00:00Z'),
    );
    expect(s).not.toBeNull();
    // stale-price has confidence 0.8 vs too-thin 0.7 — stale wins.
    expect(s?.kind).toBe('re_price');
  });
});
