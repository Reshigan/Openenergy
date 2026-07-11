// Seal → export → verify, END TO END, across REAL merkle windows. Two data-level
// facts no other v2 test reaches:
//
//   merkle-seal.test proves the nightly job TILES windows (no gap/overlap) at the
//   STORE level; verify-tamper proves the verifier CATCHES a doctored pack — but
//   over a SINGLE sealed window. Nothing drives verifyPack over a chain sealed by
//   ≥2 consecutive nightly runs, so the verifier's per-root recompute loop
//   (verifier.ts check 3) has never been exercised on more than one root. Case 1
//   seals the same txn twice (two daily_roots) and asserts BOTH roots recompute —
//   neither is skipped.
//
//   The honest PARTIAL-window skip. exportPack quotes ALL sealed roots
//   (store.merkleRoots()) but scopes events to the caller (eventsForExport by
//   participant_ids). So a party-scoped export legitimately carries a daily_root
//   whose [from,to] window spans OTHER parties' global_seqs that aren't in the
//   pack. The verifier must NOT recompute that root against a truncated window and
//   scream forgery — it must skip it honestly (detail 'skipped — partial export,
//   window not fully present') and still return ok:true. Case 2 builds exactly
//   that: two parties, one seal spanning both, scoped export to party A. This is
//   the difference between a verifier that's honest about what it can/can't check
//   and one that either false-fails every scoped export or — worse — silently
//   passes a root it never actually verified.
//
// The failure mode: someone "tightens" check 3 to fail on a missing window
// (breaks every POPIA-scoped regulator export), or drops the completeness guard
// so a partial window folds a short leaf set and mismatches (same break, louder).
// Case 1 also fails if a second seal run stops tiling and the roots stop covering
// the log.
//
// No new production code — engine + merkle-seal + export + verifier as-is.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { sealPendingEvents } from '../../src/v2/domain/merkle-seal';
import { exportPack } from '../../src/v2/domain/export';
import { verifyPack } from '../../src/v2/verify/verifier';
import { ppaContract } from '../../src/v2/domain/chains/ppa_contract';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import type { Clock, Command, IdSource, Instant } from '../../src/v2/domain/types';

// single-txn cases → whole-second ticks are safe (one @new open ⇒ one human_ref).
function counterClockSec(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++ * 1000, zone: 'UTC' }) };
}
// two-txn case → ms-granular ticks: two @new opens on a whole-second clock share
// the ".000Z" tail ⇒ identical human_ref ⇒ ConstraintViolation ⇒ CONTENTION on
// the 2nd open (see export-scope.test header). Distinct ms keeps the refs apart.
function counterClockMs(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const OFFTAKER = { id: 'user-offtaker', kind: 'user' as const, participant_id: 'party-offtaker' };
const A = { id: 'user-a', kind: 'user' as const, participant_id: 'party-a' };
const B = { id: 'user-b', kind: 'user' as const, participant_id: 'party-b' };

const isMerkle = (name: string) => name.startsWith('merkle-root:');
const SKIP_DETAIL = 'skipped — partial export, window not fully present';

describe('seal → export → verify end-to-end across real merkle windows', () => {
  it('Case 1 — a chain sealed by TWO nightly runs verifies, both roots recompute (neither skipped)', async () => {
    const store = new MemoryStore();
    const deps: EngineDeps = { store, clock: counterClockSec(), ids: counterIds(), chains: { ppa_contract: ppaContract }, guards: GUARDS };
    const TXN = 'txn-ppa-multiwindow';
    let idem = 0;
    const seqOf = async () => (await store.getTxn(TXN))!.txn.seq;
    const step = async (edge: string, expected_seq: number, input: Record<string, unknown> = {}) => {
      const r = await applyTransition(
        { txn_id: TXN, chain_key: 'ppa_contract', edge, actor: OFFTAKER, input: input as Command['input'], expected_seq: { [TXN]: expected_seq }, idempotency_key: `k-${++idem}` },
        deps,
      );
      if (!r.ok) throw new Error(`${edge}: ${r.code}`);
    };

    // window 1: just the open (global_seq 1). seal it.
    await step('open', -1, { offtaker_name: 'Acme', capacity_mw: 50, contract_term_years: 20, supplier: 'party-ipp' });
    const w1 = await sealPendingEvents(store, deps.clock);
    expect(w1).not.toBeNull();
    expect(w1!.from_global_seq).toBe(1);
    expect(w1!.to_global_seq).toBe(1);

    // window 2: two more transitions (global_seq 2,3). seal again — must tile on.
    await step('begin_negotiation', await seqOf());
    await step('lock_terms', await seqOf());
    const w2 = await sealPendingEvents(store, deps.clock);
    expect(w2).not.toBeNull();
    expect(w2!.from_global_seq).toBe(w1!.to_global_seq + 1); // no gap, no overlap
    expect(w2!.to_global_seq).toBe(3);

    // unscoped export ⇒ every event present ⇒ both windows fully present.
    const pack = await exportPack(
      { chain_keys: ['ppa_contract'] },
      { store, chains: deps.chains, generated_at: '2026-07-11T00:00:00.000Z', generated_by: 'test' },
    );
    expect(pack.merkle.daily_roots.length).toBe(2);

    const r = await verifyPack(pack);
    expect(r.checks.filter((c) => !c.ok), JSON.stringify(r.checks)).toEqual([]);
    expect(r.ok).toBe(true);

    // the point of case 1: BOTH merkle checks actually RECOMPUTED — none skipped.
    const merkleChecks = r.checks.filter((c) => isMerkle(c.name));
    expect(merkleChecks.length).toBe(2);
    expect(merkleChecks.every((c) => c.ok)).toBe(true);
    expect(merkleChecks.some((c) => c.detail === SKIP_DETAIL)).toBe(false);
  });

  it('Case 2 — a POPIA-scoped export whose root window spans other parties verifies via an HONEST skip', async () => {
    const store = new MemoryStore();
    const deps: EngineDeps = { store, clock: counterClockMs(), ids: counterIds(), chains: { ppa_contract: ppaContract }, guards: GUARDS };
    let idem = 0;
    const open = async (txn: string, actor: typeof A, supplier: string) => {
      const r = await applyTransition(
        { txn_id: txn, chain_key: 'ppa_contract', edge: 'open', actor, input: { offtaker_name: actor.id, capacity_mw: 50, contract_term_years: 20, supplier } as Command['input'], expected_seq: { [txn]: -1 }, idempotency_key: `k-${++idem}` },
        deps,
      );
      if (!r.ok) throw new Error(`${txn} open: ${r.code}`);
    };

    // party A's txn (global 1) and party B's txn (global 2) in the SAME log.
    await open('txn-a', A, 'party-supplier-a');
    await open('txn-b', B, 'party-supplier-b');

    // ONE nightly seal spanning BOTH parties' events: window [1,2].
    const w = await sealPendingEvents(store, deps.clock);
    expect(w).not.toBeNull();
    expect(w!.from_global_seq).toBe(1);
    expect(w!.to_global_seq).toBe(2);

    // party A's scoped regulator export: A's event only, but the pack still quotes
    // the [1,2] root (exportPack returns ALL sealed roots).
    const packA = await exportPack(
      { chain_keys: ['ppa_contract'], participant_ids: ['party-a'] },
      { store, chains: deps.chains, generated_at: '2026-07-11T00:00:00.000Z', generated_by: 'test' },
    );
    expect(packA.events.every((e) => e.txn_id === 'txn-a')).toBe(true); // POPIA isolation holds
    expect(packA.events.some((e) => e.txn_id === 'txn-b')).toBe(false);
    expect(packA.merkle.daily_roots.length).toBe(1);
    expect(packA.merkle.daily_roots[0].to_global_seq).toBe(2); // window reaches into B's global_seq

    const r = await verifyPack(packA);

    // the honest outcome: the pack VERIFIES — the verifier did not false-fail the
    // scoped export — and it did so by SKIPPING the un-checkable root, not by
    // pretending it recomputed it.
    const merkleChecks = r.checks.filter((c) => isMerkle(c.name));
    expect(merkleChecks.length).toBe(1);
    expect(merkleChecks[0].ok).toBe(true);
    expect(merkleChecks[0].detail).toBe(SKIP_DETAIL);
    expect(r.checks.filter((c) => !c.ok), JSON.stringify(r.checks)).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
