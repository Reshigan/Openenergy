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

  // Registry path — registered chains classify via their spec's authoritative
  // isTerminal(), which overrides (and corrects) the context-blind heuristic.
  it('uses the per-chain registry over the heuristic when chainKey is supplied', () => {
    // drawdown terminal set is exactly {closed, rejected, cancelled} (no 'paid').
    // The heuristic includes 'paid' as a terminal token, so this proves the
    // registry is consulted AND is more accurate than the substring fallback.
    expect(isTerminalStatus('paid')).toBe(true);              // heuristic (wrong for drawdown)
    expect(isTerminalStatus('paid', 'drawdown')).toBe(false); // registry (correct)
    // a real drawdown terminal still resolves terminal via the registry.
    expect(isTerminalStatus('closed', 'drawdown')).toBe(true);
    expect(isTerminalStatus('funded', 'drawdown')).toBe(false); // live state — open
  });

  it('falls back to the heuristic for chains with no registry entry', () => {
    // 'ppa_contract' is not a registered emitting chain → heuristic decides.
    expect(isTerminalStatus('settled', 'ppa_contract')).toBe(true);
    expect(isTerminalStatus('under_review', 'ppa_contract')).toBe(false);
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

  it('uses the per-chain registry end-to-end for a registered chain', async () => {
    // drawdown's terminal set is {closed, rejected, cancelled}. 'paid' is NOT a
    // drawdown state, yet the heuristic would mis-bucket it terminal. With the
    // registry wired through, the latest='paid' entity is correctly counted OPEN.
    ev('d1', 'drawdown', 'A', 'requested', '2026-06-01T00:00:00Z');
    ev('d2', 'drawdown', 'A', 'paid',      '2026-06-02T00:00:00Z'); // heuristic→terminal, registry→open
    ev('d3', 'drawdown', 'B', 'closed',    '2026-06-01T00:00:00Z'); // truly terminal
    ev('d4', 'drawdown', 'C', 'funded',    '2026-06-01T00:00:00Z'); // live → open

    const r = await computeOpenTerminal(DB as any, 'drawdown');
    expect(r.open_count).toBe(2);     // A (paid, not a drawdown terminal), C (funded)
    expect(r.terminal_count).toBe(1); // B (closed)
  });
});
