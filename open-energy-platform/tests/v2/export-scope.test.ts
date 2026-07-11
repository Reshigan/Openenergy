// Export participant-scoping — the POPIA / tenant-isolation gate.
//
// route-http.test.ts #5 asserts `pack.events.every(e => e.txn_id === id)`, but
// that store holds ONE txn — the assertion passes whether or not eventsForExport
// actually filters by participant. A regression that ignored q.participant_ids
// entirely (returning the whole log to every caller) would sail through it.
//
// The load-bearing invariant is a NEGATIVE: party A's scoped export must NOT
// contain party B's events, when A is not a party to B's txn at all. That only
// bites with ≥2 txns whose party sets are disjoint. This builds two ppa_contract
// txns opened by different actors (distinct participant_ids + distinct suppliers)
// and proves: (a) A-scoped export ⊆ txnA, zero txnB events; (b) B-scoped ⊆ txnB;
// (c) unscoped (operator / no participant_ids) returns BOTH. No new production
// code — exercises memory.ts eventsForExport + export.ts as-is.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { exportPack } from '../../src/v2/domain/export';
import { ppaContract } from '../../src/v2/domain/chains/ppa_contract';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import type { Clock, Command, IdSource, Instant } from '../../src/v2/domain/types';

// NB: ms-granular steps (not the *1000 the single-txn harnesses use). human_ref
// = last-4 of (actor.id + occurred_at); actor.id sits at the FRONT so only the
// occurred_at tail (…ms+"Z") drives the suffix. Whole-second ticks give every
// txn the same ".000Z" tail ⇒ identical human_ref ⇒ ConstraintViolation ⇒
// CONTENTION on the 2nd open. Distinct ms per tick keeps the two refs distinct.
function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const A = { id: 'user-a', kind: 'user' as const, participant_id: 'party-a' };
const B = { id: 'user-b', kind: 'user' as const, participant_id: 'party-b' };
const TXN_A = 'txn-ppa-a';
const TXN_B = 'txn-ppa-b';

function harness() {
  const store = new MemoryStore();
  const deps: EngineDeps = { store, clock: counterClock(), ids: counterIds(), chains: { ppa_contract: ppaContract }, guards: GUARDS };
  let idem = 0;
  // open a fresh ppa txn as `actor` with a supplier disjoint from the other txn.
  const open = async (txn: string, actor: typeof A, supplier: string) => {
    const r = await applyTransition(
      {
        txn_id: txn,
        chain_key: 'ppa_contract',
        edge: 'open',
        actor,
        input: { offtaker_name: actor.id, capacity_mw: 50, contract_term_years: 20, supplier } as Command['input'],
        expected_seq: { [txn]: -1 },
        idempotency_key: `k-${++idem}`,
      },
      deps,
    );
    if (!r.ok) throw new Error(`${txn} open: ${r.code}`);
  };
  const exp = (participant_ids?: string[]) =>
    exportPack(
      { chain_keys: ['ppa_contract'], ...(participant_ids ? { participant_ids } : {}) },
      { store, chains: deps.chains, generated_at: '2026-07-11T00:00:00.000Z', generated_by: 'test' },
    );
  return { store, open, exp };
}

describe('exportPack participant-scoping — cross-party isolation (POPIA)', () => {
  it('scopes an export to the caller: party A sees only txn A, none of party B', async () => {
    const { open, exp } = harness();
    await open(TXN_A, A, 'party-supplier-a');
    await open(TXN_B, B, 'party-supplier-b');

    const packA = await exp(['party-a']);
    expect(packA.events.length).toBeGreaterThan(0);
    expect(packA.events.every((e) => e.txn_id === TXN_A)).toBe(true);
    expect(packA.events.some((e) => e.txn_id === TXN_B)).toBe(false); // the leak that matters
  });

  it('scopes symmetrically: party B sees only txn B', async () => {
    const { open, exp } = harness();
    await open(TXN_A, A, 'party-supplier-a');
    await open(TXN_B, B, 'party-supplier-b');

    const packB = await exp(['party-b']);
    expect(packB.events.length).toBeGreaterThan(0);
    expect(packB.events.every((e) => e.txn_id === TXN_B)).toBe(true);
  });

  it('an unscoped query (operator / regulator) returns both txns', async () => {
    const { open, exp } = harness();
    await open(TXN_A, A, 'party-supplier-a');
    await open(TXN_B, B, 'party-supplier-b');

    const all = await exp();
    const ids = new Set(all.events.map((e) => e.txn_id));
    expect(ids.has(TXN_A)).toBe(true);
    expect(ids.has(TXN_B)).toBe(true);
  });
});
