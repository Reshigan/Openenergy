import { describe, it, expect } from 'vitest';
import {
  evaluateOrder,
  suggestedSizeMwh,
  notionalFor,
  INITIAL_MARGIN_RATE,
  STALE_MARK_MAX_MINUTES,
  type ProposedOrder,
  type RiskSnapshot,
} from '../src/utils/pre-trade-guards';

const order = (overrides: Partial<ProposedOrder> = {}): ProposedOrder => ({
  side: 'buy',
  energy_type: 'solar',
  volume_mwh: 10,
  price_zar_mwh: 1_500,
  delivery_date: '2026-06-01',
  ...overrides,
});

const snap = (overrides: Partial<RiskSnapshot> = {}): RiskSnapshot => ({
  participant_status: 'active',
  credit_limit_zar: 10_000_000,
  open_exposure_zar: 0,
  free_collateral_zar: 5_000_000,
  current_position_mwh: 0,
  position_limit_mwh: 0,
  market_state: 'open',
  mark_price_zar_mwh: 1_500,
  mark_age_minutes: 5,
  price_band_pct: null,
  ...overrides,
});

describe('evaluateOrder · happy path', () => {
  it('accepts a well-shaped order and returns the reserved margin', () => {
    const result = evaluateOrder(order(), snap());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 10 MWh × 1500 ZAR/MWh × 10% = 1 500 ZAR
      expect(result.reserved_margin_zar).toBeCloseTo(1_500);
    }
  });

  it('uses the mark price when the order is a market order', () => {
    const n = notionalFor(order({ price_zar_mwh: null }), snap({ mark_price_zar_mwh: 2_000 }));
    expect(n).toBe(20_000);
  });
});

describe('evaluateOrder · structural reject codes', () => {
  it('rejects negative volumes with INVALID_VOLUME', () => {
    const r = evaluateOrder(order({ volume_mwh: -5 }), snap());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('INVALID_VOLUME');
  });

  it('rejects pending-KYC participants before checking anything else', () => {
    const r = evaluateOrder(order(), snap({ participant_status: 'pending_kyc' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('KYC_INCOMPLETE');
  });

  it('rejects suspended counterparties', () => {
    const r = evaluateOrder(order(), snap({ participant_status: 'suspended' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('COUNTERPARTY_SUSPENDED');
  });
});

describe('evaluateOrder · market state', () => {
  it('blocks placement when the market is closed', () => {
    const r = evaluateOrder(order(), snap({ market_state: 'closed' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('MARKET_CLOSED');
  });

  it('blocks when the instrument is halted', () => {
    const r = evaluateOrder(order(), snap({ market_state: 'halted_instrument' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('INSTRUMENT_HALTED');
  });
});

describe('evaluateOrder · mark freshness', () => {
  it(`rejects with STALE_MARK when mark is older than ${STALE_MARK_MAX_MINUTES} min`, () => {
    const r = evaluateOrder(order(), snap({ mark_age_minutes: 99 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('STALE_MARK');
  });

  it('rejects with STALE_MARK when there is no mark at all', () => {
    const r = evaluateOrder(order(), snap({ mark_price_zar_mwh: null, mark_age_minutes: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('STALE_MARK');
  });
});

describe('evaluateOrder · price band', () => {
  it('rejects orders priced outside the band', () => {
    const r = evaluateOrder(
      order({ price_zar_mwh: 5_000 }),
      snap({ mark_price_zar_mwh: 1_500, price_band_pct: 10 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('INVALID_PRICE_BAND');
  });

  it('accepts orders inside the band', () => {
    const r = evaluateOrder(
      order({ price_zar_mwh: 1_550 }),
      snap({ mark_price_zar_mwh: 1_500, price_band_pct: 10 }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('evaluateOrder · position limits', () => {
  it('rejects when buying would push net long past the limit', () => {
    const r = evaluateOrder(
      order({ side: 'buy', volume_mwh: 20 }),
      snap({ current_position_mwh: 90, position_limit_mwh: 100 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('POSITION_LIMIT_BREACH');
  });

  it('rejects when selling would push net short past the limit', () => {
    const r = evaluateOrder(
      order({ side: 'sell', volume_mwh: 20 }),
      snap({ current_position_mwh: -90, position_limit_mwh: 100 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('POSITION_LIMIT_BREACH');
  });

  it('accepts when there is room within the limit', () => {
    const r = evaluateOrder(
      order({ volume_mwh: 5 }),
      snap({ current_position_mwh: 90, position_limit_mwh: 100 }),
    );
    expect(r.ok).toBe(true);
  });

  it('treats position_limit_mwh = 0 as unlimited', () => {
    const r = evaluateOrder(
      order({ volume_mwh: 1_000_000 }),
      snap({ position_limit_mwh: 0, free_collateral_zar: 1e15, credit_limit_zar: 1e15 }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('evaluateOrder · credit headroom', () => {
  it('rejects when notional + open exposure exceeds credit limit', () => {
    const r = evaluateOrder(
      order({ volume_mwh: 100, price_zar_mwh: 1_500 }),  // notional 150 000
      snap({ credit_limit_zar: 200_000, open_exposure_zar: 150_000 }),  // headroom 50 000
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason_code).toBe('CREDIT_HEADROOM_EXCEEDED');
      expect(r.detail).toMatch(/over by R/);
    }
  });
});

describe('evaluateOrder · collateral', () => {
  it('rejects when initial margin exceeds free collateral', () => {
    // notional 100 MWh × R1500 = 150 000; IM @ 10% = 15 000
    const r = evaluateOrder(
      order({ volume_mwh: 100 }),
      snap({ free_collateral_zar: 5_000 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason_code).toBe('COLLATERAL_INSUFFICIENT');
      expect(r.detail).toMatch(/short by R/);
    }
  });

  it('reserves exactly INITIAL_MARGIN_RATE × notional on accepted orders', () => {
    const r = evaluateOrder(order({ volume_mwh: 50 }), snap());
    expect(r.ok).toBe(true);
    if (r.ok) {
      const expected = 50 * 1_500 * INITIAL_MARGIN_RATE;
      expect(r.reserved_margin_zar).toBeCloseTo(expected);
    }
  });
});

describe('suggestedSizeMwh', () => {
  it('returns null when there is no mark price', () => {
    expect(suggestedSizeMwh(snap({ mark_price_zar_mwh: null }), 'buy')).toBeNull();
  });

  it('caps suggestion at free collateral / margin rate / mark', () => {
    // collateral 5M / 10% = 50M of notional / 1500 = 33333.33 MWh
    const s = suggestedSizeMwh(snap({ credit_limit_zar: 1e9 }), 'buy');
    expect(s).not.toBeNull();
    expect(s!).toBeGreaterThan(33_000);
    expect(s!).toBeLessThan(34_000);
  });

  it('caps suggestion at credit headroom / mark when credit binds first', () => {
    // headroom 1500 / 1500 = 1 MWh
    const s = suggestedSizeMwh(snap({
      credit_limit_zar: 1_500,
      open_exposure_zar: 0,
      free_collateral_zar: 1e9,
    }), 'buy');
    expect(s).toBe(1);
  });

  it('caps at remaining position room when a position limit is set', () => {
    const s = suggestedSizeMwh(snap({
      current_position_mwh: 90,
      position_limit_mwh: 100,
      credit_limit_zar: 1e9,
      free_collateral_zar: 1e9,
    }), 'buy');
    expect(s).toBe(10);
  });
});
