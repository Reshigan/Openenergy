import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { computeAndRecordFee } from '../src/utils/fee-engine';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

function ctx(event: string, entity_value?: number, participant_id?: string) {
  return {
    event, entity_type: 'demo', entity_id: 'e1', env,
    commercial: { entity_value, participant_id, billing_period: '2026-06' },
  } as any;
}

function seedFee(row: Record<string, unknown>) {
  const cols = Object.keys(row);
  db.prepare(
    `INSERT INTO oe_fee_schedule (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
  ).run(...cols.map(c => row[c]));
}

function revenue(): any {
  return db.prepare(`SELECT * FROM oe_platform_revenue ORDER BY recorded_at LIMIT 1`).get();
}

describe('fee-engine — all-free default', () => {
  it('records R0 waived when no schedule row exists', async () => {
    await computeAndRecordFee(ctx('demo.x', 1_000_000));
    const r = revenue();
    expect(r.fee_zar).toBe(0);
    expect(r.status).toBe('waived');
  });

  it('records R0 waived when schedule row is disabled (is_enabled=0)', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'bps', rate: 15, is_enabled: 0, payer_resolution: 'initiator' });
    await computeAndRecordFee(ctx('demo.x', 1_000_000));
    const r = revenue();
    expect(r.fee_zar).toBe(0);
    expect(r.status).toBe('waived');
  });
});

describe('fee-engine — enabled fees', () => {
  it('computes bps fee = value * rate/10000 when enabled, status pending', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'bps', rate: 15, is_enabled: 1, payer_resolution: 'initiator' });
    await computeAndRecordFee(ctx('demo.x', 1_000_000, 'par_1'));
    const r = revenue();
    expect(r.fee_zar).toBeCloseTo(1500, 6); // 1,000,000 * 15/10000
    expect(r.status).toBe('pending');
    expect(r.participant_id).toBe('par_1');
    expect(r.billing_period).toBe('2026-06');
  });

  it('applies a flat_zar fee', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'flat_zar', rate: 5000, is_enabled: 1, payer_resolution: 'initiator' });
    await computeAndRecordFee(ctx('demo.x', 9_999));
    expect(revenue().fee_zar).toBe(5000);
  });

  it('clamps a bps fee to max_fee_zar', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'bps', rate: 100, is_enabled: 1, max_fee_zar: 2000, payer_resolution: 'initiator' });
    await computeAndRecordFee(ctx('demo.x', 1_000_000)); // raw = 10,000 → clamp 2,000
    expect(revenue().fee_zar).toBe(2000);
  });

  it('does nothing (no row) when there is no commercial context', async () => {
    await computeAndRecordFee({ event: 'demo.x', entity_type: 'demo', entity_id: 'e1', env } as any);
    const count = db.prepare(`SELECT COUNT(*) n FROM oe_platform_revenue`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('applies a pct fee (rate is a 0..1 fraction)', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'pct', rate: 0.05, is_enabled: 1, payer_resolution: 'initiator' });
    await computeAndRecordFee(ctx('demo.x', 1_000_000));
    expect(revenue().fee_zar).toBe(50_000); // 1,000,000 * 0.05
  });
});

function ctxData(event: string, data: Record<string, unknown>) {
  // No commercial context — value must be derived from ctx.data (chains spread
  // their row into data; we never edit the chains to pass commercial).
  return { event, entity_type: 'demo', entity_id: 'e1', env, data } as any;
}
function splits(revenueId: string): any[] {
  return db.prepare(`SELECT * FROM oe_revenue_splits WHERE revenue_id = ? ORDER BY id`).all(revenueId) as any[];
}

describe('fee-engine — value derivation from ctx.data (no commercial)', () => {
  it('records for a seeded event with no commercial, deriving value_zar from data', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'bps', rate: 20, is_enabled: 1, payer_resolution: 'initiator', payer_role: 'trader' });
    await computeAndRecordFee(ctxData('demo.x', { value_zar: 2_000_000 }));
    const r = revenue();
    expect(r.entity_value).toBe(2_000_000);
    expect(r.fee_zar).toBeCloseTo(4000, 6); // 2,000,000 * 20/10000
    expect(r.status).toBe('pending');
    expect(r.payer_role).toBe('trader');
  });

  it('stays silent when there is neither commercial nor a schedule row', async () => {
    await computeAndRecordFee(ctxData('demo.unseeded', { value_zar: 999 }));
    const count = db.prepare(`SELECT COUNT(*) n FROM oe_platform_revenue`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('records R0 waived for a seeded-but-disabled event with no commercial', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'bps', rate: 20, is_enabled: 0, payer_resolution: 'initiator' });
    await computeAndRecordFee(ctxData('demo.x', { amount_zar: 5000 }));
    const r = revenue();
    expect(r.fee_zar).toBe(0);
    expect(r.status).toBe('waived');
    expect(r.entity_value).toBe(5000); // value still recorded for leakage reporting
  });
});

describe('fee-engine — payer_resolution', () => {
  it('platform resolution records payer_role = admin regardless of configured payer_role', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'flat_zar', rate: 1000, is_enabled: 1, payer_resolution: 'platform', payer_role: 'lender' });
    await computeAndRecordFee(ctx('demo.x', 100, 'par_1'));
    expect(revenue().payer_role).toBe('admin');
  });

  it('beneficiary resolution records the configured payer_role', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'flat_zar', rate: 1000, is_enabled: 1, payer_resolution: 'beneficiary', payer_role: 'offtaker' });
    await computeAndRecordFee(ctx('demo.x', 100, 'par_1'));
    expect(revenue().payer_role).toBe('offtaker');
  });
});

describe('fee-engine — revenue splits', () => {
  it('writes oe_revenue_splits rows for a split fee, amounts summing to the fee', async () => {
    seedFee({
      id: 'f1', trigger_event: 'demo.x', fee_type: 'flat_zar', rate: 1000, is_enabled: 1,
      payer_resolution: 'split',
      split_config: JSON.stringify([
        { party_role: 'trader', share_pct: 0.6 },
        { party_role: 'carbon_fund', share_pct: 0.4 },
      ]),
    });
    await computeAndRecordFee(ctx('demo.x', 100, 'par_1'));
    const rev = revenue();
    expect(rev.fee_zar).toBe(1000);
    const sp = splits(rev.id);
    expect(sp.length).toBe(2);
    expect(sp.map((s: any) => s.party_role).sort()).toEqual(['carbon_fund', 'trader']);
    expect(sp.reduce((t: number, s: any) => t + s.amount_zar, 0)).toBeCloseTo(1000, 6);
    expect(sp.find((s: any) => s.party_role === 'trader').amount_zar).toBeCloseTo(600, 6);
  });

  it('writes no splits when the fee is R0 (disabled/waived)', async () => {
    seedFee({
      id: 'f1', trigger_event: 'demo.x', fee_type: 'flat_zar', rate: 1000, is_enabled: 0,
      payer_resolution: 'split',
      split_config: JSON.stringify([{ party_role: 'trader', share_pct: 1 }]),
    });
    await computeAndRecordFee(ctx('demo.x', 100, 'par_1'));
    const count = db.prepare(`SELECT COUNT(*) n FROM oe_revenue_splits`).get() as { n: number };
    expect(count.n).toBe(0);
  });
});
