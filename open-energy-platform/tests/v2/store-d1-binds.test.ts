// D1 caps a statement at 100 bound parameters. The prod bug this pins: a
// 20-chain export produced >100 txn ids, partiesForTxns built one IN (...)
// with a placeholder per id, and D1 500'd the whole /api/v2/export request.
// The shim here enforces the cap the way D1 does — any statement bound with
// more than 100 args throws — so an unchunked query fails loudly in vitest.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { D1Database } from '@cloudflare/workers-types';
import { D1Store } from '../../src/v2/store/d1';

const D1_MAX_BINDS = 100;

class ShimStmt {
  private args: unknown[] = [];
  constructor(
    private raw: Database.Database,
    private sql: string,
  ) {}
  bind(...args: unknown[]): this {
    if (args.length > D1_MAX_BINDS) {
      throw new Error(`D1_ERROR: too many SQL variables (${args.length} > ${D1_MAX_BINDS})`);
    }
    this.args = args;
    return this;
  }
  first<T = unknown>(): T | null {
    return (this.raw.prepare(this.sql).get(...this.args) as T) ?? null;
  }
  all<T = unknown>(): { results: T[] } {
    return { results: this.raw.prepare(this.sql).all(...this.args) as T[] };
  }
  run(): { meta: { changes: number; rows_written: number } } {
    const r = this.raw.prepare(this.sql).run(...this.args);
    return { meta: { changes: r.changes, rows_written: r.changes } };
  }
}

const DDL = readFileSync(new URL('../../migrations/526_v2_event_log.sql', import.meta.url), 'utf8');

function makeStore(): { store: D1Store; raw: Database.Database } {
  const raw = new Database(':memory:');
  raw.exec(DDL);
  const shim = {
    prepare: (sql: string) => new ShimStmt(raw, sql),
    batch: (stmts: ShimStmt[]) => raw.transaction((list: ShimStmt[]) => list.map((s) => s.run()))(stmts),
  };
  return { store: new D1Store(shim as unknown as D1Database), raw };
}

describe('D1Store bind-limit chunking', () => {
  it('partiesForTxns handles more txn ids than the D1 bind cap', async () => {
    const { store, raw } = makeStore();
    const insert = raw.prepare(
      `INSERT INTO v2_parties (txn_id, participant_id, role_on_txn, terms, from_event_id, until_event_id)
       VALUES (?, ?, 'borrower', '{}', ?, NULL)`,
    );
    const ids = Array.from({ length: 150 }, (_, i) => `txn-${i}`);
    for (const id of ids) insert.run(id, `party-${id}`, `ev-${id}`);

    const parties = await store.partiesForTxns(ids);
    expect(parties).toHaveLength(150);
    expect(new Set(parties.map((p) => p.txn_id)).size).toBe(150);
  });

  it('eventsForExport handles more chain keys than the cap and keeps global_seq order', async () => {
    const { store, raw } = makeStore();
    const insert = raw.prepare(
      `INSERT INTO v2_events (txn_id, seq, event_id, chain_key, type, from_state, to_state,
         actor_id, actor_kind, occurred_at, payload, payload_version, prev_hash, hash, global_seq)
       VALUES (?, 1, ?, ?, 'x.imported', NULL, 'open', 'sys', 'system:import',
         '2026-01-01T00:00:00.000Z', '{}', 1, 'p', 'h', ?)`,
    );
    // Events land on the FIRST and LAST key so both chunks contribute rows,
    // interleaved in global_seq so an unsorted concat would be out of order.
    const keys = Array.from({ length: 120 }, (_, i) => `chain_${i}`);
    insert.run('t-1', 'e-1', 'chain_0', 1);
    insert.run('t-2', 'e-2', 'chain_119', 2);
    insert.run('t-3', 'e-3', 'chain_0', 3);
    insert.run('t-4', 'e-4', 'chain_119', 4);

    const events = await store.eventsForExport({ chain_keys: keys, from: '2020-01-01', to: '2030-01-01' });
    expect(events.map((e) => e.global_seq)).toEqual([1, 2, 3, 4]);
  });
});
