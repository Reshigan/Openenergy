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

const MIG_507 = readFileSync(join(__dirname, '..', 'migrations', '507_deal_engine_fees.sql'), 'utf8');

function ctx(event: string, entity_value?: number, participant_id?: string) {
  return {
    event, entity_type: 'deal', entity_id: 'd1', env,
    commercial: { entity_value, participant_id, billing_period: '2026-06' },
  } as any;
}

function revenue(): any {
  return db.prepare(`SELECT * FROM oe_platform_revenue ORDER BY recorded_at LIMIT 1`).get();
}

const DEAL_EVENTS = ['deal.accepted', 'deal.cleared', 'deal.subscribed', 'objective.subscribed'];

describe('migration 507 — deal-engine fee seed', () => {
  it('seeds one all-free row per value-bearing deal event', () => {
    const rows = db.prepare(
      `SELECT * FROM oe_fee_schedule WHERE trigger_event IN (${DEAL_EVENTS.map(() => '?').join(',')})`,
    ).all(...DEAL_EVENTS) as any[];
    expect(rows.length).toBe(DEAL_EVENTS.length);
    for (const r of rows) {
      expect(r.is_enabled).toBe(0); // ALL FREE at launch
      expect(r.rate).toBe(0);       // R0
    }
  });

  it('uses only canonical PlatformRole strings for payer_role', () => {
    const roles = new Set(['admin','ipp_developer','trader','lender','offtaker','carbon_fund','grid_operator','regulator','support']);
    const rows = db.prepare(
      `SELECT payer_role FROM oe_fee_schedule WHERE trigger_event IN (${DEAL_EVENTS.map(() => '?').join(',')})`,
    ).all(...DEAL_EVENTS) as any[];
    for (const r of rows) expect(roles.has(r.payer_role)).toBe(true);
  });

  it('is idempotent — re-applying the seed keeps one row per trigger_event', () => {
    const before = (db.prepare(`SELECT COUNT(*) n FROM oe_fee_schedule`).get() as any).n;
    expect(() => db.exec(MIG_507)).not.toThrow();
    const after = (db.prepare(`SELECT COUNT(*) n FROM oe_fee_schedule`).get() as any).n;
    expect(after).toBe(before); // trigger_event UNIQUE → INSERT OR IGNORE
  });
});

describe('deal-engine events flow through the fee engine all-free', () => {
  for (const event of DEAL_EVENTS) {
    it(`${event} records an R0 waived revenue row preserving value + payer`, async () => {
      await computeAndRecordFee(ctx(event, 12_345_678, 'par_initiator'));
      const r = revenue();
      expect(r.fee_zar).toBe(0);
      expect(r.status).toBe('waived');
      expect(r.entity_value).toBe(12_345_678);
      expect(r.participant_id).toBe('par_initiator');
      expect(r.billing_period).toBe('2026-06');
    });
  }
});
