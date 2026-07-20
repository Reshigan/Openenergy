// Engine authority gate — the ADVERSARIAL half of engine-ppa.test.ts.
//
// engine-ppa proves the happy path plus ONE committed rejection (a guard halt).
// It never touches the paths that actually protect an append-only log under
// volume: idempotent redelivery (a retried command must NOT double-write), the
// optimistic-concurrency token (STALE), and the pre-commit reject family
// (FORBIDDEN / ILLEGAL_TRANSITION / BAD_INPUT / CONFLICT).
//
// The load-bearing invariant proven here is the honest-log BOUNDARY: a guard
// rejection is committed (seq bumps — ppa test covers that), but a pre-commit
// reject appends NOTHING. Every case below asserts the global log length is
// unchanged, so a regression that starts writing rejected events for authz /
// staleness — corrupting the seq/hash chain — fails loudly.
//
// No new production code: this exercises src/v2/domain/engine.ts as-is.
// The ConstraintViolation-catch idempotency path (engine.ts ~388) and
// CONTENTION (~414) need a store that races commits mid-flight; a single-
// threaded MemoryStore can't reach them deterministically, so they are out of
// scope here — the fast-path replay below IS the idempotency guarantee that
// real retry storms hit.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ppaContract } from '../../src/v2/domain/chains/ppa_contract';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import type { Clock, Command, IdSource, Instant } from '../../src/v2/domain/types';

function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++ * 1000, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const OFFTAKER = { id: 'user-offtaker', kind: 'user' as const, participant_id: 'user-offtaker' };
const STRANGER = { id: 'user-stranger', kind: 'user' as const, participant_id: 'user-stranger' };
const TXN = 'txn-ppa-adv';
const OPEN_INPUT = { offtaker_name: 'Acme', capacity_mw: 50, contract_term_years: 20, supplier: 'party-ipp' };

// Fresh engine + store per test; each returns { store, deps } and a cmd() builder
// that mirrors engine-ppa's. idempotency_key defaults are unique per call.
function harness() {
  const store = new MemoryStore();
  const deps: EngineDeps = { store, clock: counterClock(), ids: counterIds(), chains: { ppa_contract: ppaContract }, guards: GUARDS };
  let idem = 0;
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
  const seqOf = async () => (await store.getTxn(TXN))!.txn.seq;
  const logLen = () => store.maxGlobalSeq();
  const open = (over: Partial<Command> = {}) =>
    applyTransition(cmd({ edge: 'open', expected_seq: { [TXN]: -1 }, input: OPEN_INPUT, ...over }), deps);
  return { store, deps, cmd, seqOf, logLen, open };
}

describe('engine authority — idempotency, optimistic concurrency, pre-commit rejects', () => {
  it('replays an idempotent redelivery: same key ⇒ same event, no second write', async () => {
    const { deps, cmd, seqOf, logLen } = harness();
    const first = await applyTransition(
      cmd({ edge: 'open', expected_seq: { [TXN]: -1 }, input: OPEN_INPUT, idempotency_key: 'dup-key' }),
      deps,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.message);
    const lenAfterOpen = await logLen();
    const seqAfterOpen = await seqOf();

    // redeliver the exact same command — the network retried, the client did not
    // know the first landed.
    const replay = await applyTransition(
      cmd({ edge: 'open', expected_seq: { [TXN]: -1 }, input: OPEN_INPUT, idempotency_key: 'dup-key' }),
      deps,
    );
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(replay.message);
    expect(replay.replayed).toBe(true);
    expect(replay.event.event_id).toBe(first.event.event_id); // same event, not a new one
    expect(await logLen()).toBe(lenAfterOpen); // NO double-write
    expect(await seqOf()).toBe(seqAfterOpen);
  });

  it('rejects a stale expected_seq (STALE) without appending an event', async () => {
    const { deps, cmd, seqOf, logLen, open } = harness();
    expect((await open()).ok).toBe(true);
    const before = await logLen();
    const cur = await seqOf();

    const stale = await applyTransition(cmd({ edge: 'begin_negotiation', expected_seq: { [TXN]: cur - 1 } }), deps);
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error('stale token should have been rejected');
    expect(stale.code).toBe('STALE');
    expect(await logLen()).toBe(before); // pre-commit reject writes nothing
    expect(await seqOf()).toBe(cur);
  });

  it('rejects an actor without a live role (FORBIDDEN) without appending an event', async () => {
    const { deps, cmd, seqOf, logLen, open } = harness();
    expect((await open()).ok).toBe(true);
    const before = await logLen();

    const forbidden = await applyTransition(
      cmd({ edge: 'begin_negotiation', actor: STRANGER, expected_seq: { [TXN]: await seqOf() } }),
      deps,
    );
    expect(forbidden.ok).toBe(false);
    if (forbidden.ok) throw new Error('stranger should be forbidden');
    expect(forbidden.code).toBe('FORBIDDEN');
    expect(await logLen()).toBe(before);
  });

  it('rejects an out-of-state edge (ILLEGAL_TRANSITION) without appending an event', async () => {
    const { deps, cmd, seqOf, logLen, open } = harness();
    expect((await open()).ok).toBe(true);
    const before = await logLen();

    // lock_terms is only valid mid-negotiation; from draft it is illegal.
    const illegal = await applyTransition(cmd({ edge: 'lock_terms', expected_seq: { [TXN]: await seqOf() } }), deps);
    expect(illegal.ok).toBe(false);
    if (illegal.ok) throw new Error('lock_terms from draft should be illegal');
    expect(illegal.code).toBe('ILLEGAL_TRANSITION');
    expect(await logLen()).toBe(before);
  });

  it('rejects missing required input (BAD_INPUT) without creating a txn', async () => {
    const { deps, logLen, open, store } = harness();
    const bad = await open({ input: { offtaker_name: 'Acme' } }); // capacity_mw / term / supplier missing
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error('missing required fields should be BAD_INPUT');
    expect(bad.code).toBe('BAD_INPUT');
    expect(await logLen()).toBe(0);
    expect(await store.getTxn(TXN)).toBeNull(); // no half-open txn left behind
  });

  it('rejects re-opening an existing txn id (CONFLICT) without a second write', async () => {
    const { deps, cmd, logLen, open } = harness();
    expect((await open()).ok).toBe(true);
    const before = await logLen();

    const clash = await applyTransition(
      cmd({ edge: 'open', expected_seq: { [TXN]: -1 }, input: OPEN_INPUT }),
      deps,
    );
    expect(clash.ok).toBe(false);
    if (clash.ok) throw new Error('re-open of an existing txn id should conflict');
    expect(clash.code).toBe('CONFLICT');
    expect(await logLen()).toBe(before);
  });
});
