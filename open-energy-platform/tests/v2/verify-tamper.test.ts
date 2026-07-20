// P0-gate falsifiability. Every other v2 test asserts verifyPack(...).ok === true.
// A verifier that ALWAYS returns ok is theatre — "an external party can verify
// our log" is only true if the verifier REJECTS a doctored pack. This builds one
// real, self-verifying pack (engine → seal → export, same flow as the parity
// test) and then mutates exactly the field each of the verifier's five checks
// reads, asserting that check flips to false and the pack no longer verifies.
//
// Scope note: these are single-field tampers, so hash-of-pack (a global digest)
// also trips on most of them — that is fine, each case asserts its TARGETED
// check went false, proving that check is load-bearing on its own. Building a
// self-consistent forgery (mutate content + recompute that event's hash + the
// pack hash, to prove the prev-hash chain + merkle anchor still catch it) is a
// deeper rung, not this one.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { D1Database } from '@cloudflare/workers-types';

import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { D1Store } from '../../src/v2/store/d1';
import { ppaContract } from '../../src/v2/domain/chains/ppa_contract';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import { sealPendingEvents } from '../../src/v2/domain/merkle-seal';
import { exportPack, type Pack } from '../../src/v2/domain/export';
import { verifyPack } from '../../src/v2/verify/verifier';
import type { Clock, Command, IdSource, Instant } from '../../src/v2/domain/types';

// ponytail: third inline copy of the better-sqlite3 D1 shim (parity + route-http
// have the other two). Extracting a shared test helper is new scaffolding the
// loop didn't ask for; consolidate if a fourth copy shows up.
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
  return {
    prepare: (sql: string) => new ShimStmt(raw, sql),
    batch: (stmts: ShimStmt[]) => raw.transaction((l: ShimStmt[]) => l.map((s) => s.run()))(stmts),
  } as unknown as D1Database;
}

function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++ * 1000, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const DDL = readFileSync(new URL('../../migrations/526_v2_event_log.sql', import.meta.url), 'utf8');
const OFFTAKER = { id: 'user-offtaker', kind: 'user' as const, participant_id: 'party-offtaker' };
const TXN = 'txn-ppa-tamper';

// Build one real, verifiable ppa pack: open + two steps, then seal (so a merkle
// root exists) and export. Deterministic clock/ids ⇒ reproducible hashes.
async function goodPack(): Promise<Pack> {
  const store = new D1Store(makeShim(DDL));
  const deps: EngineDeps = { store, clock: counterClock(), ids: counterIds(), chains: { ppa_contract: ppaContract }, guards: GUARDS };
  let idem = 0;
  const seqOf = async () => (await store.getTxn(TXN))!.txn.seq;
  const step = async (edge: string, expected_seq: Record<string, number>, input: Record<string, unknown> = {}) => {
    const r = await applyTransition(
      { txn_id: TXN, chain_key: 'ppa_contract', edge, actor: OFFTAKER, input: input as Command['input'], expected_seq, idempotency_key: `k-${++idem}` },
      deps,
    );
    if (!r.ok) throw new Error(`${edge}: ${r.code}`);
  };
  await step('open', { [TXN]: -1 }, { offtaker_name: 'Acme', capacity_mw: 50, contract_term_years: 20, supplier: 'party-ipp' });
  await step('begin_negotiation', { [TXN]: await seqOf() });
  await step('lock_terms', { [TXN]: await seqOf() });
  expect(await sealPendingEvents(store, deps.clock)).not.toBeNull();
  return exportPack({ chain_keys: ['ppa_contract'] }, { store, chains: deps.chains, generated_at: '2026-07-11T00:00:00.000Z', generated_by: 'test' });
}

const clone = (p: Pack): Pack => JSON.parse(JSON.stringify(p));
const failed = (r: Awaited<ReturnType<typeof verifyPack>>, prefix: string) =>
  r.checks.some((c) => c.name.startsWith(prefix) && !c.ok);

describe('verifyPack falsifiability — the P0 gate rejects doctored packs', () => {
  it('the honest pack verifies (baseline)', async () => {
    const r = await verifyPack(await goodPack());
    expect(r.checks.filter((c) => !c.ok), JSON.stringify(r.checks)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('rejects a forged event hash', async () => {
    const p = clone(await goodPack());
    p.events[p.events.length - 1].hash = 'deadbeef'.repeat(8);
    const r = await verifyPack(p);
    expect(failed(r, 'event-hash')).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('rejects a seq gap', async () => {
    const p = clone(await goodPack());
    p.events[p.events.length - 1].seq += 5;
    const r = await verifyPack(p);
    expect(failed(r, 'seq-gapless')).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('rejects a broken prev_hash chain link', async () => {
    const p = clone(await goodPack());
    p.events[p.events.length - 1].prev_hash = '0'.repeat(64);
    const r = await verifyPack(p);
    expect(failed(r, 'prev-hash-link')).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('rejects a tampered merkle root', async () => {
    const p = clone(await goodPack());
    expect(p.merkle.daily_roots.length).toBeGreaterThan(0);
    p.merkle.daily_roots[0].root = 'f'.repeat(64);
    const r = await verifyPack(p);
    expect(failed(r, 'merkle-root')).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('rejects any pack-level field edit via hash_of_pack', async () => {
    const p = clone(await goodPack());
    p.generated_by = 'someone-else';
    const r = await verifyPack(p);
    expect(failed(r, 'hash-of-pack')).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('rejects a stripped custody notice while a chain still settles=false', async () => {
    const p = clone(await goodPack());
    expect(p.custody_notice).toContain('NO SETTLEMENT FINALITY — RECORD ONLY');
    delete (p as { custody_notice?: string }).custody_notice;
    const r = await verifyPack(p);
    expect(failed(r, 'custody-notice-present')).toBe(true);
    expect(r.ok).toBe(false);
  });
});
