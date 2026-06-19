// Fix A/B regression: the KYC market-access tier must actually reach the order
// engine. The onboarding programme shipped a MARKET_ACCESS_REQUIRED guard, but
// loadRiskSnapshot never SELECTed participants.participant_market_access, so the
// field was always undefined and the guard was dead on the real order path.
// These tests pin BOTH halves:
//   1. the pure guard (evaluateOrder) rejects read_only / unverified /
//      certificate_only and passes full_trading / null;
//   2. the production path (loadRiskSnapshot via __loadRiskSnapshotForTest)
//      populates the field from the row, so the guard fires for real.
// The market-access tier is seeded WITH kyc_status='approved' so the upstream
// KYC_INCOMPLETE gate does not mask the market-access check.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { evaluateOrder, type RiskSnapshot } from '../src/utils/pre-trade-guards';

function baseSnapshot(over: Partial<RiskSnapshot> = {}): RiskSnapshot {
  return {
    participant_status: 'active',
    credit_limit_zar: 1_000_000, open_exposure_zar: 0, free_collateral_zar: 1_000_000,
    current_position_mwh: 0, position_limit_mwh: 0,
    market_state: 'open', mark_price_zar_mwh: 1000, mark_age_minutes: 1,
    price_band_pct: 25, margin_gate_status: 'clear',
    ...over,
  };
}

const order = { side: 'buy', volume_mwh: 10, price_zar_mwh: 1000, energy_type: 'power', order_type: 'limit' } as any;

describe('evaluateOrder - MARKET_ACCESS_REQUIRED (pure guard)', () => {
  for (const tier of ['read_only', 'unverified', 'certificate_only'] as const) {
    it(`rejects participant_market_access='${tier}'`, () => {
      const r = evaluateOrder(order, baseSnapshot({ participant_market_access: tier }));
      expect(r.ok).toBe(false);
      expect(r.reason_code).toBe('MARKET_ACCESS_REQUIRED');
    });
  }

  it("passes 'full_trading'", () => {
    expect(evaluateOrder(order, baseSnapshot({ participant_market_access: 'full_trading' })).ok).toBe(true);
  });

  it('passes null (no tier set)', () => {
    expect(evaluateOrder(order, baseSnapshot({ participant_market_access: null })).ok).toBe(true);
  });

  it('passes undefined (caller predates the flag)', () => {
    expect(evaluateOrder(order, baseSnapshot({})).ok).toBe(true);
  });
});

describe('loadRiskSnapshot - participant_market_access is populated (production path)', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
  afterEach(() => { db.close(); });

  function seedTrader(id: string, marketAccess: string | null) {
    db.prepare(
      `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, participant_market_access, tenant_id, created_at, updated_at)
       VALUES (?, ?, 'x', 'T', 'trader', 'active', 'approved', ?, 'default', '2026-06-06', '2026-06-06')`,
    ).run(id, `${id}@openenergy.co.za`, marketAccess);
  }

  async function snapshotFor(participantId: string): Promise<RiskSnapshot> {
    const mod = await import('../src/routes/trading');
    return (mod as any).__loadRiskSnapshotForTest(env, participantId, 'power', null);
  }

  it("reads 'read_only' from the row and the engine then rejects", async () => {
    seedTrader('par_ro', 'read_only');
    const snap = await snapshotFor('par_ro');
    expect(snap.participant_market_access).toBe('read_only');
    const r = evaluateOrder(order, snap);
    expect(r.ok).toBe(false);
    expect(r.reason_code).toBe('MARKET_ACCESS_REQUIRED');
  });

  it("reads 'certificate_only' and the engine rejects", async () => {
    seedTrader('par_cert', 'certificate_only');
    const snap = await snapshotFor('par_cert');
    expect(snap.participant_market_access).toBe('certificate_only');
    expect(evaluateOrder(order, snap).reason_code).toBe('MARKET_ACCESS_REQUIRED');
  });

  it("reads 'full_trading' and the access gate does NOT fire", async () => {
    seedTrader('par_full', 'full_trading');
    const snap = await snapshotFor('par_full');
    expect(snap.participant_market_access).toBe('full_trading');
    // This unseeded trader has no credit/collateral, so the order is rejected
    // downstream on headroom - but NOT on market access, which is the gate
    // under test here. (The pure-guard suite above proves full_trading passes
    // the access check outright.)
    const r = evaluateOrder(order, snap);
    if (!r.ok) expect(r.reason_code).not.toBe('MARKET_ACCESS_REQUIRED');
  });

  it("reads null (column default cleared) and the access gate does NOT fire", async () => {
    seedTrader('par_null', null);
    const snap = await snapshotFor('par_null');
    expect(snap.participant_market_access).toBeNull();
    const r = evaluateOrder(order, snap);
    if (!r.ok) expect(r.reason_code).not.toBe('MARKET_ACCESS_REQUIRED');
  });
});
