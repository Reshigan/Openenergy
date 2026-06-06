import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers/d1-sqlite';

let db: Database.Database;
beforeEach(() => { db = createTestDb({ applyMigrations: true }); });
afterEach(() => { db.close(); });

describe('migration 481 — all-free fee schedule seed', () => {
  it('seeds at least 20 billable events, every one free at launch', () => {
    const rows = db.prepare(`SELECT * FROM oe_fee_schedule`).all() as any[];
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const r of rows) {
      expect(r.is_enabled).toBe(0);  // ALL FREE
      expect(r.rate).toBe(0);        // R0
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
