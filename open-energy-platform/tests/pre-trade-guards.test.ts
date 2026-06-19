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

// ─── Phase 2 (migration 050) — order-type, TIF, and modifier checks ──

describe('evaluateOrder · stop / stop-limit', () => {
  it('rejects a stop order without a trigger price', () => {
    const r = evaluateOrder(order({ order_type: 'stop' }), snap());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('STOP_TRIGGER_REQUIRED');
  });

  it('rejects a stop_limit order with stop_trigger_price = 0', () => {
    const r = evaluateOrder(order({ order_type: 'stop_limit', stop_trigger_price: 0 }), snap());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('STOP_TRIGGER_REQUIRED');
  });

  it('accepts a stop with a positive trigger price', () => {
    const r = evaluateOrder(order({ order_type: 'stop', stop_trigger_price: 1_400 }), snap());
    expect(r.ok).toBe(true);
  });
});

describe('evaluateOrder · GTD expiry', () => {
  it('rejects GTD without expires_at', () => {
    const r = evaluateOrder(order({ time_in_force: 'gtd' }), snap());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('EXPIRY_REQUIRED');
  });

  it('rejects expires_at in the past', () => {
    const r = evaluateOrder(
      order({ time_in_force: 'gtd', expires_at: '2020-01-01T00:00:00Z' }),
      snap({ now_iso: '2026-05-15T00:00:00Z' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('EXPIRY_IN_PAST');
  });

  it('accepts a future expires_at', () => {
    const r = evaluateOrder(
      order({ time_in_force: 'gtd', expires_at: '2099-01-01T00:00:00Z' }),
      snap({ now_iso: '2026-05-15T00:00:00Z' }),
    );
    expect(r.ok).toBe(true);
  });

  it('ignores expires_at on IOC orders', () => {
    const r = evaluateOrder(
      order({ order_type: 'ioc', expires_at: '2020-01-01T00:00:00Z' }),
      snap({ now_iso: '2026-05-15T00:00:00Z', ask_liquidity_mwh: 100 }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('evaluateOrder · post_only', () => {
  it('rejects post_only on a market order outright', () => {
    const r = evaluateOrder(order({ post_only: true, order_type: 'market', price_zar_mwh: null }), snap());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('POST_ONLY_WOULD_CROSS');
  });

  it('rejects post_only buy that crosses the best ask', () => {
    const r = evaluateOrder(
      order({ post_only: true, side: 'buy', price_zar_mwh: 1_500 }),
      snap({ best_ask_zar_mwh: 1_490, best_bid_zar_mwh: 1_480 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('POST_ONLY_WOULD_CROSS');
  });

  it('rejects post_only sell that crosses the best bid', () => {
    const r = evaluateOrder(
      order({ post_only: true, side: 'sell', price_zar_mwh: 1_480 }),
      snap({ best_ask_zar_mwh: 1_500, best_bid_zar_mwh: 1_490 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('POST_ONLY_WOULD_CROSS');
  });

  it('accepts post_only that rests passively below the ask', () => {
    const r = evaluateOrder(
      order({ post_only: true, side: 'buy', price_zar_mwh: 1_480 }),
      snap({ best_ask_zar_mwh: 1_500, best_bid_zar_mwh: 1_470 }),
    );
    expect(r.ok).toBe(true);
  });

  it('accepts post_only when the opposite side is empty', () => {
    const r = evaluateOrder(
      order({ post_only: true, side: 'buy', price_zar_mwh: 1_500 }),
      snap({ best_ask_zar_mwh: null }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('evaluateOrder · reduce_only', () => {
  it('rejects reduce_only when the trader is flat', () => {
    const r = evaluateOrder(order({ reduce_only: true }), snap({ current_position_mwh: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('REDUCE_ONLY_INCREASES_POSITION');
  });

  it('rejects reduce_only buy on a long position (would grow it)', () => {
    const r = evaluateOrder(order({ reduce_only: true, side: 'buy' }), snap({ current_position_mwh: 50 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('REDUCE_ONLY_INCREASES_POSITION');
  });

  it('rejects reduce_only sell larger than the long position (would flip)', () => {
    const r = evaluateOrder(
      order({ reduce_only: true, side: 'sell', volume_mwh: 60 }),
      snap({ current_position_mwh: 50 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('REDUCE_ONLY_INCREASES_POSITION');
  });

  it('accepts reduce_only sell that exactly covers a long position', () => {
    const r = evaluateOrder(
      order({ reduce_only: true, side: 'sell', volume_mwh: 50 }),
      snap({ current_position_mwh: 50 }),
    );
    expect(r.ok).toBe(true);
  });

  it('accepts reduce_only buy on a short position', () => {
    const r = evaluateOrder(
      order({ reduce_only: true, side: 'buy', volume_mwh: 30 }),
      snap({ current_position_mwh: -50 }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('evaluateOrder · FOK', () => {
  it('rejects FOK when opposite-side liquidity is insufficient', () => {
    const r = evaluateOrder(
      order({ order_type: 'fok', side: 'buy', volume_mwh: 100 }),
      snap({ ask_liquidity_mwh: 40 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('FOK_INSUFFICIENT_LIQUIDITY');
  });

  it('accepts FOK when opposite-side liquidity covers volume', () => {
    const r = evaluateOrder(
      order({ order_type: 'fok', side: 'buy', volume_mwh: 100 }),
      snap({ ask_liquidity_mwh: 250 }),
    );
    expect(r.ok).toBe(true);
  });

  it('does NOT pre-reject IOC for thin liquidity (matcher handles partial)', () => {
    const r = evaluateOrder(
      order({ order_type: 'ioc', side: 'buy', volume_mwh: 100 }),
      snap({ ask_liquidity_mwh: 1 }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('evaluateOrder · display size', () => {
  it('rejects display_size_mwh = 0', () => {
    const r = evaluateOrder(order({ display_size_mwh: 0, volume_mwh: 50 }), snap());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('INVALID_DISPLAY_SIZE');
  });

  it('rejects display_size_mwh > volume_mwh', () => {
    const r = evaluateOrder(order({ display_size_mwh: 80, volume_mwh: 50 }), snap());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('INVALID_DISPLAY_SIZE');
  });

  it('accepts a sensible iceberg slice', () => {
    const r = evaluateOrder(order({ display_size_mwh: 5, volume_mwh: 50 }), snap());
    expect(r.ok).toBe(true);
  });
});

describe('evaluateOrder · market-access guard', () => {
  it('rejects a read_only participant with MARKET_ACCESS_REQUIRED', () => {
    const r = evaluateOrder(order(), snap({ participant_market_access: 'read_only' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('MARKET_ACCESS_REQUIRED');
  });

  it('rejects an unverified participant with MARKET_ACCESS_REQUIRED', () => {
    const r = evaluateOrder(order(), snap({ participant_market_access: 'unverified' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('MARKET_ACCESS_REQUIRED');
  });

  it('a full_trading participant passes the market-access guard', () => {
    const r = evaluateOrder(order(), snap({ participant_market_access: 'full_trading' }));
    expect(r.ok).toBe(true);
  });

  it('rejects a certificate_only participant with MARKET_ACCESS_REQUIRED (authoritative backstop)', () => {
    // The cert-only route fence (W226) is unmounted and cannot read its field, so
    // the order engine is the authoritative backstop: a certificate-track account
    // has no spot-market access and must be blocked here, not only at a route.
    const r = evaluateOrder(order(), snap({ participant_market_access: 'certificate_only' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('MARKET_ACCESS_REQUIRED');
  });

  it('an undefined market-access flag passes (back-compat)', () => {
    const r = evaluateOrder(order(), snap());
    expect(r.ok).toBe(true);
  });

  it('the market-access guard does not short-circuit earlier guards', () => {
    // Volume sanity runs before the access gate, so a negative volume still
    // wins even when access has been revoked.
    const r = evaluateOrder(order({ volume_mwh: -5 }), snap({ participant_market_access: 'read_only' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('INVALID_VOLUME');
  });

  it('the guard runs before market-state checks', () => {
    // The access gate sits before the market-state checks, so a read_only
    // participant on a closed book still gets MARKET_ACCESS_REQUIRED.
    const r = evaluateOrder(order(), snap({ participant_market_access: 'read_only', market_state: 'closed' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe('MARKET_ACCESS_REQUIRED');
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
