// W227 sustainability marketplace + L5 RFQ/auction take-rate collection.
// Asserts the fee-engine records a non-zero oe_platform_revenue row on
// complete_settlement / rfq_awarded / auction_closed when the cascade carries
// commercial.entity_value and migration 522 seeds the matching fee_schedule.
// ponytail: take-rate bills on transaction_complete_settlement (the value-bearing
// transition in sustainability-transaction-chain.ts), not on a listing action.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { computeAndRecordFee } from '../src/utils/fee-engine';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

const MIG_522 = readFileSync(join(__dirname, '..', 'migrations', '522_marketplace_fee_schedule.sql'), 'utf8');

function revenueByEvent(event: string): any {
  return db.prepare(`SELECT * FROM oe_platform_revenue WHERE trigger_event = ? ORDER BY recorded_at LIMIT 1`).get(event);
}
function scheduleRow(event: string): any {
  return db.prepare(`SELECT * FROM oe_fee_schedule WHERE trigger_event = ?`).get(event);
}

describe('migration 522 — marketplace take-rate fee schedule seed', () => {
  const EVENTS = [
    'transaction_complete_settlement',
    'marketplace.rfq_awarded',
    'marketplace.auction_closed',
  ];

  it('seeds one enabled row per value-bearing marketplace event', () => {
    for (const e of EVENTS) {
      const r = scheduleRow(e);
      expect(r, `missing schedule row for ${e}`).toBeTruthy();
      expect(r.is_enabled).toBe(1);
      expect(r.rate).toBeGreaterThan(0);
    }
  });

  it('is idempotent — re-applying keeps one row per trigger_event', () => {
    const before = (db.prepare(`SELECT COUNT(*) n FROM oe_fee_schedule`).get() as any).n;
    expect(() => db.exec(MIG_522)).not.toThrow();
    const after = (db.prepare(`SELECT COUNT(*) n FROM oe_fee_schedule`).get() as any).n;
    expect(after).toBe(before);
  });
});

describe('marketplace take-rate collected into oe_platform_revenue', () => {
  it('sustainability transaction complete_settlement records 1.5% of total_zar', async () => {
    const totalZar = 1_000_000;
    await computeAndRecordFee({
      event: 'transaction_complete_settlement',
      entity_type: 'sustainability_transaction',
      entity_id: 'txn_1',
      env,
      commercial: { entity_value: totalZar, participant_id: 'par_seller' },
    } as any);
    const r = revenueByEvent('transaction_complete_settlement');
    expect(r).toBeTruthy();
    expect(r.entity_value).toBe(totalZar);
    expect(r.fee_zar).toBeCloseTo(15_000, 6); // 1,000,000 * 0.015
    expect(r.status).toBe('pending');
    expect(r.participant_id).toBe('par_seller');
  });

  it('L5 RFQ award records 25 bps of awarded value', async () => {
    const awardedValueZar = 4_000_000; // price 500 * volume 8000
    await computeAndRecordFee({
      event: 'marketplace.rfq_awarded',
      entity_type: 'oe_rfqs',
      entity_id: 'rfq_1',
      env,
      commercial: { entity_value: awardedValueZar, participant_id: 'par_buyer' },
    } as any);
    const r = revenueByEvent('marketplace.rfq_awarded');
    expect(r).toBeTruthy();
    expect(r.entity_value).toBe(awardedValueZar);
    expect(r.fee_zar).toBeCloseTo(10_000, 6); // 4,000,000 * 25/10000
    expect(r.status).toBe('pending');
  });

  it('L5 auction close records 25 bps of awarded value', async () => {
    const awardedValueZar = 2_500_000; // bid 2500 * volume 1000
    await computeAndRecordFee({
      event: 'marketplace.auction_closed',
      entity_type: 'oe_auctions',
      entity_id: 'auc_1',
      env,
      commercial: { entity_value: awardedValueZar, participant_id: 'par_initiator' },
    } as any);
    const r = revenueByEvent('marketplace.auction_closed');
    expect(r).toBeTruthy();
    expect(r.entity_value).toBe(awardedValueZar);
    expect(r.fee_zar).toBeCloseTo(6_250, 6); // 2,500,000 * 25/10000
    expect(r.status).toBe('pending');
  });

  it('a non-value-bearing marketplace event with no commercial stays silent', async () => {
    await computeAndRecordFee({
      event: 'marketplace_listing_created',
      entity_type: 'sustainability_listing',
      entity_id: 'lst_2',
      env,
    } as any);
    const count = db.prepare(`SELECT COUNT(*) n FROM oe_platform_revenue WHERE trigger_event = 'marketplace_listing_created'`).get() as { n: number };
    expect(count.n).toBe(0);
  });
});