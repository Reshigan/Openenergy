// W2 — pre-trade guard enforces a regulatory trading block. Covers the pure
// guard arm, dual-key resolution in loadRiskSnapshot (direct id + bridge), and
// the deterministic explainer fallback.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { evaluateOrder, REJECTION_CODES, type RiskSnapshot } from '../src/utils/pre-trade-guards';
import { explainRejection } from '../src/utils/rejection-explainer';

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

describe('evaluateOrder — ALGO_TRADING_BLOCKED', () => {
  it('exposes the reason code', () => {
    expect(REJECTION_CODES).toContain('ALGO_TRADING_BLOCKED');
  });

  it('rejects when trading_block_active is true', () => {
    const r = evaluateOrder(
      { side: 'buy', volume_mwh: 10, price_zar_mwh: 1000, energy_type: 'power', order_type: 'limit' } as any,
      baseSnapshot({ trading_block_active: true }),
    );
    expect(r.ok).toBe(false);
    expect(r.reason_code).toBe('ALGO_TRADING_BLOCKED');
  });

  it('takes precedence over market-state checks', () => {
    const r = evaluateOrder(
      { side: 'buy', volume_mwh: 10, price_zar_mwh: 1000, energy_type: 'power', order_type: 'limit' } as any,
      baseSnapshot({ trading_block_active: true, market_state: 'closed' }),
    );
    expect(r.reason_code).toBe('ALGO_TRADING_BLOCKED');
  });

  it('allows the order when no block is active', () => {
    const r = evaluateOrder(
      { side: 'buy', volume_mwh: 10, price_zar_mwh: 1000, energy_type: 'power', order_type: 'limit' } as any,
      baseSnapshot({ trading_block_active: false }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('loadRiskSnapshot — dual-key block resolution', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
  afterEach(() => { db.close(); });

  function seedTrader() {
    db.prepare(
      `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
       VALUES ('par_trader', 't@openenergy.co.za', 'x', 'T', 'trader', 'active', 'approved', 'default', '2026-06-06', '2026-06-06')`,
    ).run();
  }
  function block(party: string, reason: string) {
    db.prepare(
      `INSERT INTO oe_algo_trading_blocks (id, participant_id, block_reason, source_event, is_active, created_at)
       VALUES (?, ?, ?, 'test', 1, '2026-06-06')`,
    ).run(`atb_${party}`, party, reason);
  }

  // loadRiskSnapshot is module-internal; exercise it through the exported helper.
  async function snapshotFor(participantId: string): Promise<RiskSnapshot> {
    const mod = await import('../src/routes/trading');
    return (mod as any).__loadRiskSnapshotForTest(env, participantId, 'power', null);
  }

  it('resolves a block via the party-link bridge', async () => {
    seedTrader();
    block('firm_vantage', 'algo_kill_switch');
    db.prepare(`INSERT INTO oe_trading_party_link (id, participant_id, party_id, created_at) VALUES ('tpl_1','par_trader','firm_vantage','2026-06-06')`).run();
    const snap = await snapshotFor('par_trader');
    expect(snap.trading_block_active).toBe(true);
  });

  it('resolves a block keyed directly on the participant id', async () => {
    seedTrader();
    block('par_trader', 'market_abuse_stor');
    const snap = await snapshotFor('par_trader');
    expect(snap.trading_block_active).toBe(true);
  });

  it('is false when no block exists', async () => {
    seedTrader();
    const snap = await snapshotFor('par_trader');
    expect(snap.trading_block_active).toBe(false);
  });

  it('does not block on a lifted (is_active = 0) row', async () => {
    seedTrader();
    // A block that compliance has already lifted must not re-block the trader.
    db.prepare(
      `INSERT INTO oe_algo_trading_blocks (id, participant_id, block_reason, source_event, is_active, lifted_at, lifted_by, created_at)
       VALUES ('atb_lifted', 'par_trader', 'algo_kill_switch', 'test', 0, '2026-06-06', 'system:cascade', '2026-06-06')`,
    ).run();
    const snap = await snapshotFor('par_trader');
    expect(snap.trading_block_active).toBe(false);
  });
});

describe('rejection-explainer — ALGO_TRADING_BLOCKED fallback', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
  afterEach(() => { db.close(); });

  it('returns a non-empty explanation + contact-compliance remediation (no AI binding)', async () => {
    const out = await explainRejection(
      { DB: env.DB, KV: env.KV } as any,
      {
        reason_code: 'ALGO_TRADING_BLOCKED', detail: 'regulatory hold', participant_id: 'par_trader',
        side: 'buy', energy_type: 'power', volume_mwh: 10, price_zar_mwh: 1000, notional_zar: 10_000, snapshot: {},
      },
      'rej_1',
    );
    expect(out.human_explanation.length).toBeGreaterThan(0);
    expect(out.suggested_remediations.some(r => r.action === 'contact_support')).toBe(true);
  });
});
