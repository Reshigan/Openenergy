// Engine race gate — the two commit-race paths engine-concurrency.test.ts
// explicitly scoped OUT ("a single-threaded MemoryStore can't reach them
// deterministically"). Both are the highest-value untested production paths for
// the high-volume goal: what the append-only log does when two commands collide
// AT the commit, not before it.
//
//   Path A — idempotency_key catch-and-replay (engine.ts:389-395). Two commands
//   with the SAME idempotency_key both read pre-winner txn state and both build
//   an event for the same seq. The DB serialises: the winner commits, the
//   loser's atomic batch hits UNIQUE(idempotency_key) FIRST (memory.ts validates
//   idempotency_key BEFORE txn_seq). The engine must catch that, re-read the
//   winner via findEventByIdempotencyKey, and return the WINNER's event as
//   replayed — NOT its own freshly-built event, and NOT a second write. The
//   fast-path replay in engine-concurrency can't reach here: at the loser's
//   START the key is still uncommitted, so it sails past the top-of-function
//   dedup and only collides at commit.
//
//   Path B — CONTENTION after MAX_RETRIES (engine.ts:414). A non-idempotency
//   ConstraintViolation (event_pk / txn_seq / human_ref) that persists across
//   all 3 retries: the engine `continue`s each attempt, rebuilds from scratch,
//   and after exhausting retries returns reject('CONTENTION') with NOTHING
//   written. A doomed retry storm must fail closed, not corrupt the log.
//
// No new production code — this drives src/v2/domain/engine.ts as-is. The two
// test-only Store wrappers below delegate to a real MemoryStore and exist only
// to force the interleave / the sustained conflict a single caller can't.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ppaContract } from '../../src/v2/domain/chains/ppa_contract';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import {
  ConstraintViolation,
  type Clock,
  type Command,
  type CommitBatch,
  type ExportQuery,
  type IdSource,
  type Instant,
  type MerkleRootRow,
  type Store,
} from '../../src/v2/domain/types';

function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++ * 1000, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const OFFTAKER = { id: 'user-offtaker', kind: 'user' as const, participant_id: 'user-offtaker' };
const TXN = 'txn-ppa-race';
const OPEN_INPUT = { offtaker_name: 'Acme', capacity_mw: 50, contract_term_years: 20, supplier: 'party-ipp' };

// A Store that suspends exactly ONE commit (the first after arm()) on a gate the
// test releases, so a second command can slip in and win the seq. Every other
// method — and every non-gated commit — delegates straight to a real MemoryStore.
class GatedStore implements Store {
  private armed = false;
  private consumed = false;
  private releaseGate!: () => void;
  private gate = new Promise<void>((r) => (this.releaseGate = r));
  private signalReached!: () => void;
  reached = new Promise<void>((r) => (this.signalReached = r));
  constructor(private inner: MemoryStore) {}
  arm() {
    this.armed = true;
  }
  release() {
    this.releaseGate();
  }
  async commit(batch: CommitBatch): Promise<{ global_seq: number }> {
    if (this.armed && !this.consumed) {
      this.consumed = true;
      this.signalReached();
      await this.gate;
    }
    return this.inner.commit(batch);
  }
  getTxn(id: string) {
    return this.inner.getTxn(id);
  }
  findEventByIdempotencyKey(key: string) {
    return this.inner.findEventByIdempotencyKey(key);
  }
  reference(key: string, atEpochMs: number) {
    return this.inner.reference(key, atEpochMs);
  }
  maxGlobalSeq() {
    return this.inner.maxGlobalSeq();
  }
  lastSealedGlobalSeq() {
    return this.inner.lastSealedGlobalSeq();
  }
  eventsByGlobalSeq(from: number, to: number) {
    return this.inner.eventsByGlobalSeq(from, to);
  }
  appendMerkleRoot(row: MerkleRootRow) {
    return this.inner.appendMerkleRoot(row);
  }
  merkleRoots() {
    return this.inner.merkleRoots();
  }
  partiesForTxns(ids: string[]) {
    return this.inner.partiesForTxns(ids);
  }
  eventsForExport(q: ExportQuery) {
    return this.inner.eventsForExport(q);
  }
}

// A Store whose commit ALWAYS throws a non-idempotency ConstraintViolation, so
// the engine's retry loop can never land an event and must exhaust MAX_RETRIES.
class AlwaysConflictStore implements Store {
  constructor(private inner: MemoryStore) {}
  async commit(_batch: CommitBatch): Promise<{ global_seq: number }> {
    throw new ConstraintViolation('event_pk'); // not idempotency_key ⇒ engine `continue`s
  }
  getTxn(id: string) {
    return this.inner.getTxn(id);
  }
  findEventByIdempotencyKey(key: string) {
    return this.inner.findEventByIdempotencyKey(key);
  }
  reference(key: string, atEpochMs: number) {
    return this.inner.reference(key, atEpochMs);
  }
  maxGlobalSeq() {
    return this.inner.maxGlobalSeq();
  }
  lastSealedGlobalSeq() {
    return this.inner.lastSealedGlobalSeq();
  }
  eventsByGlobalSeq(from: number, to: number) {
    return this.inner.eventsByGlobalSeq(from, to);
  }
  appendMerkleRoot(row: MerkleRootRow) {
    return this.inner.appendMerkleRoot(row);
  }
  merkleRoots() {
    return this.inner.merkleRoots();
  }
  partiesForTxns(ids: string[]) {
    return this.inner.partiesForTxns(ids);
  }
  eventsForExport(q: ExportQuery) {
    return this.inner.eventsForExport(q);
  }
}

describe('engine commit races — idempotency catch-and-replay + CONTENTION', () => {
  it('Path A: a concurrent duplicate loses the commit race and REPLAYS the winner (no double-write)', async () => {
    const inner = new MemoryStore();
    const store = new GatedStore(inner);
    const deps: EngineDeps = { store, clock: counterClock(), ids: counterIds(), chains: { ppa_contract: ppaContract }, guards: GUARDS };
    const K = 'dup-race-key';

    // setup: open the txn cleanly (gate disarmed). seq → 1.
    const opened = await applyTransition(
      { txn_id: TXN, chain_key: 'ppa_contract', edge: 'open', actor: OFFTAKER, input: OPEN_INPUT as Command['input'], expected_seq: { [TXN]: -1 }, idempotency_key: 'k-open' },
      deps,
    );
    expect(opened.ok).toBe(true);
    const seqAfterOpen = (await store.getTxn(TXN))!.txn.seq; // 1
    expect(await store.maxGlobalSeq()).toBe(1);

    // arm: the NEXT commit suspends on the gate.
    store.arm();
    const bn = (): Promise<Awaited<ReturnType<typeof applyTransition>>> =>
      applyTransition(
        { txn_id: TXN, chain_key: 'ppa_contract', edge: 'begin_negotiation', actor: OFFTAKER, input: {} as Command['input'], expected_seq: { [TXN]: seqAfterOpen }, idempotency_key: K },
        deps,
      );

    // loser starts first: reads pre-winner state (seq 1, K uncommitted ⇒ misses
    // the top-of-function dedup), builds its event, then blocks at the gate.
    const loser = bn();
    await store.reached;

    // winner runs to completion — its commit is the 2nd (un-gated) call. It lands
    // seq 2 and registers K.
    const win = await bn();
    expect(win.ok).toBe(true);
    if (!win.ok) throw new Error(win.message);
    expect(win.replayed).toBeFalsy(); // the winner genuinely wrote
    expect(await store.maxGlobalSeq()).toBe(2);

    // release the loser: inner.commit now trips UNIQUE(idempotency_key) first.
    store.release();
    const lose = await loser;
    expect(lose.ok).toBe(true);
    if (!lose.ok) throw new Error(lose.message);
    expect(lose.replayed).toBe(true); // caught + re-read, not re-thrown
    expect(lose.event.event_id).toBe(win.event.event_id); // the WINNER's event…
    expect(lose.event.event_id).not.toBe('00000000-0000-0000-0000-000000000000'); // …not the loser's own build
    expect(await store.maxGlobalSeq()).toBe(2); // NO second write
    expect((await store.getTxn(TXN))!.txn.seq).toBe(2);
  });

  it('Path B: a commit that keeps conflicting exhausts MAX_RETRIES and returns CONTENTION, writing nothing', async () => {
    const inner = new MemoryStore();
    const store = new AlwaysConflictStore(inner);
    const deps: EngineDeps = { store, clock: counterClock(), ids: counterIds(), chains: { ppa_contract: ppaContract }, guards: GUARDS };

    const r = await applyTransition(
      { txn_id: TXN, chain_key: 'ppa_contract', edge: 'open', actor: OFFTAKER, input: OPEN_INPUT as Command['input'], expected_seq: { [TXN]: -1 }, idempotency_key: 'k-doomed' },
      deps,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('a perpetually-conflicting commit must not succeed');
    expect(r.code).toBe('CONTENTION');
    expect(await inner.maxGlobalSeq()).toBe(0); // the log stayed empty
    expect(await inner.getTxn(TXN)).toBeNull();
  });
});
