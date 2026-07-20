// Nightly-seal invariants — sealPendingEvents is the ONLY writer of merkle
// roots and runs on a cron. verify-tamper proves a doctored root is caught;
// nothing proves the seal job itself tiles the seq space correctly. Under a
// nightly schedule the two failure modes that silently corrupt the L5 chain
// are (a) a double-run double-seals (overlapping windows) and (b) two runs
// leave a gap. Both make the export's roots stop covering the event log while
// every individual root still recomputes — invisible to the verifier.
//
// This asserts the seal contract directly: empty window ⇒ null (the guard
// route-http POST /seal depends on), consecutive seals tile (lastSealed, max]
// with NO overlap and NO gap, and a re-run with nothing pending is a no-op.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { sealPendingEvents } from '../../src/v2/domain/merkle-seal';
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
const TXN = 'txn-ppa-seal';

function harness() {
  const store = new MemoryStore();
  const deps: EngineDeps = { store, clock: counterClock(), ids: counterIds(), chains: { ppa_contract: ppaContract }, guards: GUARDS };
  let idem = 0;
  const seqOf = async () => (await store.getTxn(TXN))!.txn.seq;
  const step = async (edge: string, input: Record<string, unknown> = {}) => {
    const expected_seq = edge === 'open' ? { [TXN]: -1 } : { [TXN]: await seqOf() };
    const r = await applyTransition(
      { txn_id: TXN, chain_key: 'ppa_contract', edge, actor: OFFTAKER, input: input as Command['input'], expected_seq, idempotency_key: `k-${++idem}` },
      deps,
    );
    if (!r.ok) throw new Error(`${edge}: ${r.code}`);
  };
  const open = () => step('open', { offtaker_name: 'Acme', capacity_mw: 50, contract_term_years: 20, supplier: 'party-ipp' });
  return { store, deps, step, open };
}

describe('sealPendingEvents — nightly merkle seal tiles the seq space', () => {
  it('returns null when there is nothing to seal (empty window)', async () => {
    const { store, deps } = harness();
    expect(await sealPendingEvents(store, deps.clock)).toBeNull();
    expect(await store.merkleRoots()).toEqual([]);
  });

  it('seals the full pending window [1, max] on first run', async () => {
    const { store, deps, open, step } = harness();
    await open();
    await step('begin_negotiation');
    await step('lock_terms');
    const max = await store.maxGlobalSeq();
    expect(max).toBe(3);

    const row = await sealPendingEvents(store, deps.clock);
    expect(row).not.toBeNull();
    expect(row!.from_global_seq).toBe(1);
    expect(row!.to_global_seq).toBe(max);
    expect(await store.merkleRoots()).toHaveLength(1);
    expect(await store.lastSealedGlobalSeq()).toBe(max);
  });

  it('is a no-op on a double-run: re-sealing with nothing pending returns null', async () => {
    const { store, deps, open, step } = harness();
    await open();
    await step('begin_negotiation');
    expect(await sealPendingEvents(store, deps.clock)).not.toBeNull();

    // cron fired twice (retry / overlap) — the second run must not append a
    // second, overlapping root.
    expect(await sealPendingEvents(store, deps.clock)).toBeNull();
    expect(await store.merkleRoots()).toHaveLength(1);
  });

  it('tiles consecutive windows with no overlap and no gap', async () => {
    const { store, deps, open, step } = harness();
    await open();
    const first = await sealPendingEvents(store, deps.clock); // seals [1,1]
    expect(first!.to_global_seq).toBe(1);

    // a later day: more events land, then the nightly job runs again.
    await step('begin_negotiation');
    await step('lock_terms');
    const max = await store.maxGlobalSeq();
    const second = await sealPendingEvents(store, deps.clock);
    expect(second).not.toBeNull();

    // the tiling invariant: window 2 starts exactly one past where window 1 ended.
    expect(second!.from_global_seq).toBe(first!.to_global_seq + 1); // no gap, no overlap
    expect(second!.to_global_seq).toBe(max);

    const roots = await store.merkleRoots();
    expect(roots).toHaveLength(2);
    // the two windows exactly cover [1, max] with no seq counted twice.
    expect(roots[0].from_global_seq).toBe(1);
    expect(roots[roots.length - 1].to_global_seq).toBe(max);
    for (let i = 1; i < roots.length; i++) {
      expect(roots[i].from_global_seq).toBe(roots[i - 1].to_global_seq + 1);
    }
  });
});
