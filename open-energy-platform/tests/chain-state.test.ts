import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { isTerminalStatus, computeOpenTerminal } from '../src/utils/chain-state';

let db: Database.Database;
// envFor(db).DB is the D1 façade (prepare→bind→all→{results}) that production
// code receives; createTestDb returns the raw better-sqlite3 handle, which the
// inline `ev()` INSERT helper uses directly. computeOpenTerminal must get the
// façade, exactly as rollupMetrics does in metrics-rollup.test.ts.
let DB: ReturnType<typeof envFor>['DB'];

beforeEach(() => { db = createTestDb({ applyMigrations: true }); DB = envFor(db).DB; });
afterEach(() => { db.close(); });

function ev(id: string, chainKey: string, entityId: string, status: string, at: string) {
  db.prepare(
    `INSERT INTO oe_platform_events
       (id, event, chain_key, entity_type, entity_id, source_chain_status, occurred_at)
     VALUES (?, 'x.transition', ?, 'demo', ?, ?, ?)`,
  ).run(id, chainKey, entityId, status, at);
}

describe('isTerminalStatus', () => {
  it('treats settled/closed/rejected/withdrawn/cancelled/expired/retired as terminal', () => {
    for (const s of ['settled', 'closed', 'rejected', 'withdrawn', 'cancelled', 'expired', 'retired', 'written_off']) {
      expect(isTerminalStatus(s)).toBe(true);
    }
  });
  it('treats in-flight statuses as non-terminal', () => {
    for (const s of ['under_review', 'submitted', 'active', 'in_progress', 'pending']) {
      expect(isTerminalStatus(s)).toBe(false);
    }
  });
  it('is null-safe (unknown/empty status is open, not terminal)', () => {
    expect(isTerminalStatus(null)).toBe(false);
    expect(isTerminalStatus('')).toBe(false);
  });
});

describe('computeOpenTerminal', () => {
  it('buckets each entity by its latest status for the chain', async () => {
    // entity A: submitted -> settled (terminal)
    ev('e1', 'ppa_contract', 'A', 'submitted', '2026-06-01T00:00:00Z');
    ev('e2', 'ppa_contract', 'A', 'settled',   '2026-06-02T00:00:00Z');
    // entity B: under_review (open)
    ev('e3', 'ppa_contract', 'B', 'under_review', '2026-06-01T00:00:00Z');
    // entity C: rejected (terminal)
    ev('e4', 'ppa_contract', 'C', 'rejected', '2026-06-01T00:00:00Z');
    // different chain — must be ignored
    ev('e5', 'drawdown', 'D', 'active', '2026-06-01T00:00:00Z');

    const r = await computeOpenTerminal(DB as any, 'ppa_contract');
    expect(r.open_count).toBe(1);     // B
    expect(r.terminal_count).toBe(2); // A, C
  });

  it('returns zeros for an unknown chain', async () => {
    const r = await computeOpenTerminal(DB as any, 'nope');
    expect(r).toEqual({ open_count: 0, terminal_count: 0 });
  });
});
