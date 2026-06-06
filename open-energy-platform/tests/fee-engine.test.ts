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
