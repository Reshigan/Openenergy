import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers/d1-sqlite';

let db: Database.Database;
beforeEach(() => { db = createTestDb({ applyMigrations: true }); });
afterEach(() => { db.close(); });

describe('migration 481 — all-free fee schedule seed', () => {
  it('seeds at least 20 billable events; go-live rows enabled, the rest stay free', () => {
    const rows = db.prepare(`SELECT * FROM oe_fee_schedule`).all() as any[];
    expect(rows.length).toBeGreaterThanOrEqual(20);
    // ponytail: 521_fee_schedule_go_live flips a vetted 7-row set live for go-live;
    // every other row stays is_enabled=0 / rate=0 (the 481 all-free default).
    const GO_LIVE_EVENTS = new Set([
      // 521 fee_schedule_go_live
      'trade.matched', 'settlement.cycle_settled', 'contract.signed',
      'invoice.issued', 'invoice.paid', 'carbon.retired', 'grid.wheeling_charge_paid',
      // 522 marketplace take-rate
      'transaction_complete_settlement', 'marketplace.rfq_awarded', 'marketplace.auction_closed',
    ]);
    for (const r of rows) {
      if (GO_LIVE_EVENTS.has(r.trigger_event)) {
        expect(r.is_enabled).toBe(1);
        expect(r.rate).toBeGreaterThan(0);
      } else {
        expect(r.is_enabled).toBe(0);  // still free
        expect(r.rate).toBe(0);         // still R0
      }
    }
  });

  it('adds the split_config column and seeds at least one split row that parses', () => {
    const cols = (db.prepare(`PRAGMA table_info(oe_fee_schedule)`).all() as any[]).map(c => c.name);
    expect(cols).toContain('split_config');
    const splits = db.prepare(
      `SELECT * FROM oe_fee_schedule WHERE payer_resolution = 'split' AND split_config IS NOT NULL`,
    ).all() as any[];
    expect(splits.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(splits[0].split_config);
    expect(Array.isArray(parsed)).toBe(true);
    const total = parsed.reduce((s: number, p: any) => s + Number(p.share_pct), 0);
    expect(total).toBeCloseTo(1, 6); // shares are 0..1 fractions summing to 1
  });

  it('uses only canonical PlatformRole strings for payer_role', () => {
    const roles = new Set(['admin','ipp_developer','trader','lender','offtaker','carbon_fund','grid_operator','regulator','support']);
    const rows = db.prepare(`SELECT payer_role FROM oe_fee_schedule WHERE payer_role IS NOT NULL`).all() as any[];
    for (const r of rows) expect(roles.has(r.payer_role)).toBe(true);
  });

  it('is idempotent — applying the seed twice keeps one row per trigger_event', () => {
    const before = (db.prepare(`SELECT COUNT(*) n FROM oe_fee_schedule`).get() as any).n;
    db.exec(`INSERT OR IGNORE INTO oe_fee_schedule (id, trigger_event, fee_type, rate, is_enabled, payer_resolution)
             VALUES ('dup_test', 'trade.matched', 'bps', 0, 0, 'split')`);
    const after = (db.prepare(`SELECT COUNT(*) n FROM oe_fee_schedule`).get() as any).n;
    expect(after).toBe(before); // trade.matched already seeded → ignored
  });
});
