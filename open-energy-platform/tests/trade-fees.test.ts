import { describe, it, expect } from 'vitest';
import { computeTradeFees, type FillShape } from '../src/utils/trade-fees';

const fill = (overrides: Partial<FillShape> = {}): FillShape => ({
  match_id: 'match_1',
  buy_order_id: 'bo_1',
  sell_order_id: 'so_1',
  buy_participant_id: 'buyer',
  sell_participant_id: 'seller',
  matched_volume_mwh: 10,
  matched_price_zar: 1500,
  market_type: 'bilateral',
  ...overrides,
});

describe('trade-fees engine', () => {
  it('emits brokerage + exchange + regulatory for a bilateral 10 MWh @ R1500 fill', () => {
    const fees = computeTradeFees(fill());
    const kinds = new Set(fees.map((f) => f.fee_type));
    expect(kinds.has('brokerage')).toBe(true);
    expect(kinds.has('exchange')).toBe(true);
    expect(kinds.has('regulatory')).toBe(true);
    expect(kinds.has('clearing')).toBe(false); // bilateral does not clear
  });

  it('adds clearing fees for exchange-traded fills', () => {
    const fees = computeTradeFees(fill({ market_type: 'exchange' }));
    expect(fees.some((f) => f.fee_type === 'clearing')).toBe(true);
  });

  it('writes one row per side for each rule', () => {
    const fees = computeTradeFees(fill());
    const buyers = fees.filter((f) => f.participant_id === 'buyer');
    const sellers = fees.filter((f) => f.participant_id === 'seller');
    expect(buyers.length).toBe(sellers.length);
    // Three rules fired (brokerage / exchange / regulatory)
    expect(buyers.length).toBe(3);
  });

  it('brokerage equals 0.10 ZAR/MWh × volume', () => {
    const fees = computeTradeFees(fill({ matched_volume_mwh: 25 }));
    const brokerage = fees.find((f) => f.fee_type === 'brokerage' && f.participant_id === 'buyer');
    expect(brokerage?.amount_zar).toBe(2.5);
  });

  it('exchange fee equals 5 bps of notional', () => {
    const fees = computeTradeFees(fill({ matched_volume_mwh: 20, matched_price_zar: 2000 })); // notional 40 000
    const exchange = fees.find((f) => f.fee_type === 'exchange' && f.participant_id === 'buyer');
    expect(exchange?.amount_zar).toBe(20); // 0.0005 × 40 000
  });

  it('drops below-cent rows so tiny ticks do not spam the ledger', () => {
    // 0.001 MWh × R1.00 = 0.0001 ZAR notional → all rules round to zero
    const fees = computeTradeFees(fill({ matched_volume_mwh: 0.001, matched_price_zar: 1 }));
    expect(fees).toHaveLength(0);
  });

  it('rule version is stable so re-runs are idempotent at the unique constraint', () => {
    const a = computeTradeFees(fill());
    const b = computeTradeFees(fill());
    expect(a.map((f) => f.calc_rule_version)).toEqual(b.map((f) => f.calc_rule_version));
  });
});
