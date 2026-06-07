import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { rollupMetrics } from '../src/utils/metrics-rollup';

let db: Database.Database;
let env: any;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

function ev(id: string, chainKey: string, entityId: string, status: string | null, at: string) {
  db.prepare(
    `INSERT INTO oe_platform_events
       (id, event, chain_key, entity_type, entity_id, source_chain_status, entity_value, occurred_at)
     VALUES (?, 'x.transition', ?, 'demo', ?, ?, 100, ?)`,
  ).run(id, chainKey, entityId, status, at);
}

describe('rollupMetrics — open/terminal snapshot', () => {
  it('writes real open_count and terminal_count to oe_chain_metrics', async () => {
    ev('e1', 'ppa_contract', 'A', 'submitted',    '2026-06-06T01:00:00Z');
    ev('e2', 'ppa_contract', 'A', 'settled',      '2026-06-06T02:00:00Z'); // A terminal
    ev('e3', 'ppa_contract', 'B', 'under_review', '2026-06-06T01:00:00Z'); // B open

    await rollupMetrics(env, '2026-06-06');

    const row = db.prepare(
      `SELECT open_count, terminal_count FROM oe_chain_metrics WHERE chain_key = 'ppa_contract'`,
    ).get() as { open_count: number; terminal_count: number };
    expect(row.open_count).toBe(1);
    expect(row.terminal_count).toBe(1);
  });

  it('does not surface a phantom open count for non-lifecycle keys (admin_revenue, null status)', async () => {
    ev('r1', 'admin_revenue', 'fee-1', null, '2026-06-06T01:00:00Z');
    ev('r2', 'admin_revenue', 'fee-2', null, '2026-06-06T02:00:00Z');
    await rollupMetrics(env, '2026-06-06');
    const row = db.prepare(
      `SELECT open_count, terminal_count FROM oe_chain_metrics WHERE chain_key = 'admin_revenue'`,
    ).get() as { open_count: number; terminal_count: number };
    expect(row.open_count).toBe(0);
    expect(row.terminal_count).toBe(0);
  });
});
