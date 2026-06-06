// Migration 480 — the additive bridge table that maps the surveillance/cert
// "party" id-namespace (firm_party_id / subject_party_id) to the trading
// participant_id. Proves the table + indexes exist after migrations apply and
// that a link row round-trips.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';

let db: Database.Database;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); });
afterEach(() => { db.close(); });

describe('migration 480 — oe_trading_party_link', () => {
  it('creates the table with the expected columns', () => {
    const cols = db.prepare(`PRAGMA table_info(oe_trading_party_link)`).all() as Array<{ name: string }>;
    const names = cols.map(c => c.name).sort();
    expect(names).toEqual(['created_at', 'id', 'link_type', 'participant_id', 'party_id'].sort());
  });

  it('round-trips a link row', () => {
    db.prepare(
      `INSERT INTO oe_trading_party_link (id, participant_id, party_id, link_type, created_at)
       VALUES ('tpl_1', 'par_trader', 'firm_vantage', 'trading_party', '2026-06-06T00:00:00Z')`,
    ).run();
    const row = db.prepare(
      `SELECT participant_id, party_id, link_type FROM oe_trading_party_link WHERE party_id = 'firm_vantage'`,
    ).get() as { participant_id: string; party_id: string; link_type: string };
    expect(row.participant_id).toBe('par_trader');
    expect(row.link_type).toBe('trading_party');
  });

  it('indexes both lookup directions', () => {
    const idx = (db.prepare(`PRAGMA index_list(oe_trading_party_link)`).all() as Array<{ name: string }>).map(i => i.name);
    expect(idx).toContain('idx_trading_party_link_participant');
    expect(idx).toContain('idx_trading_party_link_party');
  });
});
