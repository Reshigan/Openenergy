// The honest-log BOUNDARY — the line applyTransition draws between a rejection
// that is RECORDED and one that is REFUSED. This is the property the whole
// "append-only, tamper-evident, every decision on the chain" claim rests on,
// and no other v2 test isolates it:
//
//   A GUARD rejection is COMMITTED. The command was well-formed, authorized,
//   legal from the current state — the engine got as far as running the
//   business rule and the rule said no. That "no" is itself a fact the log must
//   carry: seq bumps (txn.seq+1), a `<chain>.<edge>.rejected` event lands with
//   to_state == from_state (the txn does NOT move), payload = {verdicts, input},
//   and THEN applyTransition returns {ok:false, code}. The refusal is on the
//   chain; the state machine did not advance. (engine.ts:267-269, 285, 295, 408.)
//
//   A PRE-COMMIT rejection is REFUSED — appends NOTHING. Unknown edge, seq
//   contention, wrong actor, illegal-from-state, malformed input: the engine
//   bails BEFORE building an event (engine.ts:171-249, every one a bare
//   `return reject(...)`). No seq bump, no event, no txn mutation. These are the
//   caller's mistakes, not the domain's decisions — recording them would let any
//   client flood the audit log with garbage it never had standing to write.
//
// The failure mode this guards: someone "simplifies" the committed-reject branch
// to a plain `return reject(...)` (losing the audit fact that a rule fired), or
// wires a guard failure through the pre-commit path (silently dropping it) — or
// the inverse, a pre-commit refusal that starts leaving turds in the log. Every
// data-level seal/export/verify test still passes; only this one fails.
//
// No new production code — drives src/v2/domain/engine.ts as-is.

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
// a participant who is NOT a party to the opened txn — has no live role on it.
const STRANGER = { id: 'user-stranger', kind: 'user' as const, participant_id: 'party-stranger' };
const TXN = 'txn-ppa-honest';
const OPEN_INPUT = { offtaker_name: 'Acme', capacity_mw: 50, contract_term_years: 20, supplier: 'party-ipp' };

// a fresh store with ONE ppa txn cleanly opened (seq 1, global 1). Returns the
// pieces every case needs plus a `bn` helper for the common begin_negotiation.
async function openClean() {
  const store = new MemoryStore();
  const deps: EngineDeps = { store, clock: counterClock(), ids: counterIds(), chains: { ppa_contract: ppaContract }, guards: GUARDS };
  let idem = 0;
  const opened = await applyTransition(
    { txn_id: TXN, chain_key: 'ppa_contract', edge: 'open', actor: OFFTAKER, input: OPEN_INPUT as Command['input'], expected_seq: { [TXN]: -1 }, idempotency_key: `k-${++idem}` },
    deps,
  );
  if (!opened.ok) throw new Error(`open: ${opened.code}`);
  expect(await store.maxGlobalSeq()).toBe(1);
  expect((await store.getTxn(TXN))!.txn.seq).toBe(1);
  const apply = (cmd: Partial<Command> & Pick<Command, 'edge'>) =>
    applyTransition(
      {
        txn_id: TXN,
        chain_key: 'ppa_contract',
        actor: OFFTAKER,
        input: {} as Command['input'],
        expected_seq: { [TXN]: 1 },
        idempotency_key: `k-${++idem}`,
        ...cmd,
      } as Command,
      deps,
    );
  return { store, deps, apply };
}

describe('honest log — a guard rejection is COMMITTED (recorded, ok:false, state unmoved)', () => {
  it('begin_negotiation under a compliance halt: rejection lands on the chain, txn does not advance', async () => {
    const { store, apply } = await openClean();

    // arm the guard the edge runs: complianceHaltClear reads reference('compliance:halt').
    await store.setReference('compliance:halt', true);

    const r = await apply({ edge: 'begin_negotiation' });

    // the API-visible verdict: refused, with the guard's structured code.
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('a halted transition must not succeed');
    expect(r.code).toBe('COMPLIANCE_HALT');

    // …but the refusal is a RECORDED fact: seq bumped, a .rejected event exists.
    expect(await store.maxGlobalSeq()).toBe(2);
    const [ev] = await store.eventsByGlobalSeq(1, 2); // from is exclusive: (1,2] ⇒ global_seq 2
    expect(ev.type).toBe('ppa_contract.begin_negotiation.rejected');
    expect(ev.seq).toBe(2); // txn.seq(1) + 1
    // the state machine did NOT move — to_state mirrors from_state.
    expect(ev.from_state).toBe('draft');
    expect(ev.to_state).toBe('draft');
    // the guard verdicts are on the event for the audit trail.
    expect((ev.payload as { verdicts: unknown[] }).verdicts.length).toBeGreaterThan(0);

    // and the txn itself is bumped-but-unmoved: seq 2, still draft.
    const txn = (await store.getTxn(TXN))!.txn;
    expect(txn.seq).toBe(2);
    expect(txn.state).toBe('draft');
  });
});

describe('honest log — a pre-commit rejection is REFUSED (appends nothing at all)', () => {
  // Each driver reaches a bare `return reject(...)` BEFORE step 7 builds an
  // event. The invariant is identical for all: ok:false with the expected code,
  // and the log + txn are byte-for-byte untouched (maxGlobalSeq 1, txn.seq 1).
  const cases: Array<{ name: string; code: string; run: (h: Awaited<ReturnType<typeof openClean>>) => Promise<unknown> }> = [
    // step 1 — edge doesn't exist on the chain.
    { name: 'UNKNOWN_EDGE (edge not on chain)', code: 'UNKNOWN_EDGE', run: (h) => h.apply({ edge: 'nonexistent' }) },
    // step 2 — concurrency token doesn't match the live seq.
    { name: 'STALE (expected_seq mismatch)', code: 'STALE', run: (h) => h.apply({ edge: 'begin_negotiation', expected_seq: { [TXN]: 999 } }) },
    // step 3 — actor holds no role in edge.by on a NON-@new edge (an @new open
    // would pass any user, so FORBIDDEN is only reachable here).
    { name: 'FORBIDDEN (stranger actor, no live role)', code: 'FORBIDDEN', run: (h) => h.apply({ edge: 'begin_negotiation', actor: STRANGER }) },
    // step 4 — edge legal, but not from the txn's current state (execute wants
    // legal_signed; the txn is draft). State check precedes input coercion.
    { name: 'ILLEGAL_TRANSITION (execute from draft)', code: 'ILLEGAL_TRANSITION', run: (h) => h.apply({ edge: 'execute', input: { board_approval_ref: 'BA-1', legal_counterparty_ref: 'LC-1' } as Command['input'] }) },
  ];

  for (const c of cases) {
    it(`${c.name}: ok:false ${c.code}, nothing appended`, async () => {
      const h = await openClean();
      const r = (await c.run(h)) as { ok: boolean; code?: string };
      expect(r.ok).toBe(false);
      expect(r.code).toBe(c.code);
      // the log stayed exactly where the clean open left it.
      expect(await h.store.maxGlobalSeq()).toBe(1);
      expect((await h.store.getTxn(TXN))!.txn.seq).toBe(1);
      expect((await h.store.getTxn(TXN))!.txn.state).toBe('draft');
    });
  }

  it('NOT_FOUND (non-@new edge on an unknown txn): nothing appended, no txn created', async () => {
    const { store, deps } = await openClean();
    const r = await applyTransition(
      { txn_id: 'txn-does-not-exist', chain_key: 'ppa_contract', edge: 'begin_negotiation', actor: OFFTAKER, input: {} as Command['input'], expected_seq: { 'txn-does-not-exist': 0 }, idempotency_key: 'k-nf' },
      deps,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('NOT_FOUND');
    expect(await store.maxGlobalSeq()).toBe(1); // only the setup open
    expect(await store.getTxn('txn-does-not-exist')).toBeNull();
  });

  it('BAD_INPUT (@new open, missing required field): coerce fails, no txn born', async () => {
    const { store, deps } = await openClean();
    const FRESH = 'txn-ppa-badinput';
    const r = await applyTransition(
      // fresh unused txn_id ⇒ past the CONFLICT check; capacity_mw omitted ⇒
      // coerceInput errors at step 5, before any event is built.
      { txn_id: FRESH, chain_key: 'ppa_contract', edge: 'open', actor: OFFTAKER, input: { offtaker_name: 'Acme', contract_term_years: 20, supplier: 'party-ipp' } as Command['input'], expected_seq: { [FRESH]: -1 }, idempotency_key: 'k-bad' },
      deps,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('BAD_INPUT');
    expect(await store.maxGlobalSeq()).toBe(1); // only the setup open
    expect(await store.getTxn(FRESH)).toBeNull(); // no half-born txn
  });
});
