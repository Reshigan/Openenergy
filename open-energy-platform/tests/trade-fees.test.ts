import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { computeTradeFees, isLayerBTradeMatchedLive, type FillShape } from '../src/utils/trade-fees';
import { createTestDb, envFor } from './helpers/d1-sqlite';

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

// ═══════════════════════════════════════════════════════════════════════════
// P1 dedup — one source of truth. When the operator-configurable Layer B
// 'trade.matched' row in oe_fee_schedule is live (migration 520 flips it to
// 5 bps), the v1 hardcoded trade-fees path MUST NOT also bill, otherwise the
// participant is charged twice (trade_fees + oe_platform_revenue).
// ═══════════════════════════════════════════════════════════════════════════
describe('trade-fees — Layer B dedup (no double-billing)', () => {
  it('suppresses every v1 hardcoded row when the Layer B trade.matched row is live', () => {
    // Without the guard, a bilateral 10 MWh @ R1500 fill emits 6 rows
    // (brokerage + exchange + regulatory, both sides). With the guard: zero.
    const fees = computeTradeFees(fill(), { layerBTradeMatchedEnabled: true });
    expect(fees).toHaveLength(0);
  });

  it('falls back to the v1 hardcoded path when the flag is explicitly false', () => {
    const a = computeTradeFees(fill(), { layerBTradeMatchedEnabled: false });
    const b = computeTradeFees(fill());
    expect(a.map((f) => f.id)).not.toEqual(b.map((f) => f.id)); // ids are random
    expect(a.map((f) => f.fee_type).sort()).toEqual(b.map((f) => f.fee_type).sort());
    expect(a.length).toBe(b.length);
  });

  it('default (no opts) keeps the v1 path for backward compatibility', () => {
    const fees = computeTradeFees(fill());
    expect(fees.length).toBeGreaterThan(0);
  });
});

describe('isLayerBTradeMatchedLive — oe_fee_schedule lookup', () => {
  let db: Database.Database;
  let d1: Record<string, unknown>;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); d1 = envFor(db).DB; });
  afterEach(() => { db.close(); });

  it('returns true after migration 520 flips trade.matched to is_enabled=1', async () => {
    const live = await isLayerBTradeMatchedLive(d1 as any);
    expect(live).toBe(true);
  });

  it('returns false when the row is disabled', async () => {
    db.prepare(`UPDATE oe_fee_schedule SET is_enabled = 0 WHERE trigger_event = ?`).run('trade.matched');
    const live = await isLayerBTradeMatchedLive(d1 as any);
    expect(live).toBe(false);
  });

  it('returns false when the row is absent', async () => {
    db.prepare(`DELETE FROM oe_fee_schedule WHERE trigger_event = ?`).run('trade.matched');
    const live = await isLayerBTradeMatchedLive(d1 as any);
    expect(live).toBe(false);
  });
});
