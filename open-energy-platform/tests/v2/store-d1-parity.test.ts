// P0 gate parity — the SAME engine → seal → export → standalone-verify flow as
// tests/v2/engine-ppa.test.ts, but driven through D1Store instead of MemoryStore.
// There is no real D1 in vitest, so we back D1Store with a minimal in-process
// D1Database shim over better-sqlite3 (a devDependency). The shim implements
// ONLY the subset D1Store uses; db.batch runs all statements in one
// better-sqlite3 transaction (all-or-nothing), matching D1's atomic batch.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { D1Database } from '@cloudflare/workers-types';

import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { D1Store } from '../../src/v2/store/d1';
import { ppaContract } from '../../src/v2/domain/chains/ppa_contract';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import { sealPendingEvents } from '../../src/v2/domain/merkle-seal';
import { exportPack } from '../../src/v2/domain/export';
import { verifyPack } from '../../src/v2/verify/verifier';
import type { Clock, Command, IdSource, Instant } from '../../src/v2/domain/types';

// --- minimal better-sqlite3-backed D1Database shim ------------------------
// Prepared+bound statements defer execution; better-sqlite3 statements are
// re-prepared per call (cheap, cached internally). Only the D1 surface D1Store
// touches is implemented.
class ShimStmt {
  private args: unknown[] = [];
  constructor(private raw: Database.Database, private sql: string) {}
  bind(...args: unknown[]): this {
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

function makeShim(ddl: string): D1Database {
  const raw = new Database(':memory:');
  raw.exec(ddl);
  const shim = {
    prepare(sql: string) {
      return new ShimStmt(raw, sql);
    },
    batch(stmts: ShimStmt[]) {
      // One transaction: every statement lands or none does (D1 batch parity).
      const tx = raw.transaction((list: ShimStmt[]) => list.map((s) => s.run()));
      return tx(stmts);
    },
  };
  return shim as unknown as D1Database;
}

// deterministic clock + ids so the hash chain is byte-reproducible (same as
// engine-ppa.test.ts — reuse guarantees the hashes reproduce identically).
function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++ * 1000, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const OFFTAKER = { id: 'user-offtaker', kind: 'user' as const, participant_id: 'party-offtaker' };
const TXN = 'txn-ppa-1';
const DDL = readFileSync(new URL('../../migrations/526_v2_event_log.sql', import.meta.url), 'utf8');

describe('P0 gate parity — ppa_contract engine → export → verify through D1Store', () => {
  it('drives the happy path, commits a rejection, and the pack verifies', async () => {
    const store = new D1Store(makeShim(DDL));
    const deps: EngineDeps = {
      store,
      clock: counterClock(),
      ids: counterIds(),
      chains: { ppa_contract: ppaContract },
      guards: GUARDS,
    };

    let idem = 0;
    const seqOf = async () => (await store.getTxn(TXN))!.txn.seq;
    const cmd = (over: Partial<Command>): Command => ({
      txn_id: TXN,
      chain_key: 'ppa_contract',
      edge: '',
      actor: OFFTAKER,
      input: {},
      expected_seq: {},
      idempotency_key: `k-${++idem}`,
      ...over,
    });

    // 1 — open (@new; capacity 50 MW = non-strategic, no regulator party needed)
    const opened = await applyTransition(
      cmd({
        edge: 'open',
        expected_seq: { [TXN]: -1 },
        input: {
          offtaker_name: 'Acme Offtaker',
          capacity_mw: 50,
          contract_term_years: 20,
          supplier: 'party-ipp',
        },
      }),
      deps,
    );
    expect(opened.ok).toBe(true);
    if (!opened.ok) throw new Error(opened.message);
    expect(opened.txn.state).toBe('draft');

    // 2 — compliance halt is ON: begin_negotiation is REJECTED but COMMITTED.
    await store.setReference('compliance:halt', true);
    const blocked = await applyTransition(
      cmd({ edge: 'begin_negotiation', expected_seq: { [TXN]: await seqOf() } }),
      deps,
    );
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error('halt should have blocked');
    expect(blocked.code).toBe('COMPLIANCE_HALT');

    // 3 — clear halt, run the happy path to in_force
    await store.setReference('compliance:halt', false);

    const step = async (edge: string, input: Record<string, unknown> = {}) => {
      const r = await applyTransition(
        cmd({ edge, expected_seq: { [TXN]: await seqOf() }, input: input as Command['input'] }),
        deps,
      );
      expect(r.ok, `${edge} should succeed`).toBe(true);
      if (!r.ok) throw new Error(`${edge}: ${r.message}`);
      return r;
    };

    await step('begin_negotiation');
    await step('lock_terms');
    await step('legal_sign');
    await step('execute', {
      board_approval_ref: 'BRD-2026-0042',
      legal_counterparty_ref: 'LEG-2026-0042',
    });
    const forced = await step('commence');
    expect(forced.txn.state).toBe('in_force');
    expect(forced.txn.fields.expiry_date).toBeTruthy();

    // 4 — seal the pending window into a merkle root
    const root = await sealPendingEvents(store, deps.clock);
    expect(root).not.toBeNull();
    expect(await sealPendingEvents(store, deps.clock)).toBeNull(); // nothing left

    // 5 — L6 export (pure read over the log)
    const pack = await exportPack(
      { chain_keys: ['ppa_contract'] },
      { store, chains: deps.chains, generated_at: '2026-07-11T00:00:00.000Z', generated_by: 'test' },
    );

    expect(pack.integrity).toBe('self_attested');
    expect(pack.custody_notice).toContain('NO SETTLEMENT FINALITY — RECORD ONLY');
    expect(pack.events.some((e) => e.type.endsWith('.rejected'))).toBe(true);
    expect(pack.events.filter((e) => e.txn_id === TXN).length).toBe(7); // open + rejected + 5 happy

    // 6 — THE GATE: standalone verifier, no engine code
    const result = await verifyPack(pack);
    const failed = result.checks.filter((c) => !c.ok);
    expect(failed, JSON.stringify(failed)).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
