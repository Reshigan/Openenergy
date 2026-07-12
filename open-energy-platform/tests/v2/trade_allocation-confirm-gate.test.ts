// trade_allocation — the confirm-requires-allocated gate, as a driven property.
//
// A block trade allocation can only be CONFIRMED once a quantity has actually
// been allocated: `confirm` leaves only `allocated`, and the only path into
// `allocated` is `allocate`. So confirming straight out of `proposed` is a
// structural ILLEGAL_TRANSITION — the state graph, not a guard, forbids it.
//
// The counterparty is a live party (pinned at @new via counterparty_party), so
// the reject below reaches step 4 (state check) rather than being stopped at
// step 3 (authorize) — proving it is the STATE, not the role, that refuses it.
//
// Also pins settles:false (an allocation records ownership; it never moves
// cash — settlement is a separate rail).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { tradeAllocation } from '../../src/v2/domain/chains/trade_allocation';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import type { Actor, Clock, Command, IdSource, Instant } from '../../src/v2/domain/types';

function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++ * 1000, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const EXEC: Actor = { id: 'user-exec', kind: 'user', participant_id: 'party-exec' };
const COUNTERPARTY: Actor = { id: 'user-cp', kind: 'user', participant_id: 'party-cp' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { trade_allocation: tradeAllocation }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(
  deps: EngineDeps,
  txnId: string,
  edge: string,
  actor: Actor,
  input: Record<string, unknown> = {},
  reason_code?: string,
) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'trade_allocation', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'trade_allocation', edge: 'open', actor: EXEC, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// counterparty_party pins party-cp as a live counterparty so it can confirm/reject.
const baseOpen = { block_ref: 'BLK-9001', energy_type: 'peak', total_quantity_mwh: 500, price_zar_mwh: 1450, counterparty_party: COUNTERPARTY.participant_id };

describe('trade_allocation — confirm requires allocated (structural gate)', () => {
  it('declares settles:false (records ownership, not a payment)', () => {
    expect(tradeAllocation.settles).toBe(false);
  });

  it('drives the happy path proposed → allocated → confirmed and stamps confirmed_at', async () => {
    const deps = newDeps();
    const o = await open(deps, 'txn-a', baseOpen);
    expect(o.ok).toBe(true);
    expect((await deps.store.getTxn('txn-a'))!.txn.state).toBe('proposed');

    const al = await act(deps, 'txn-a', 'allocate', EXEC, { allocated_quantity_mwh: 500 });
    expect(al.ok).toBe(true);
    expect((await deps.store.getTxn('txn-a'))!.txn.state).toBe('allocated');

    const cf = await act(deps, 'txn-a', 'confirm', COUNTERPARTY);
    expect(cf.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-a'))!.txn;
    expect(txn.state).toBe('confirmed');
    expect(typeof txn.fields.confirmed_at).toBe('string'); // derive stamped the instant
  });

  it('confirming straight from proposed is refused (ILLEGAL_TRANSITION, state unmoved)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-b', baseOpen);

    // counterparty IS authorized for confirm — so this fails the STATE check, not authz.
    const r = await act(deps, 'txn-b', 'confirm', COUNTERPARTY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    expect((await deps.store.getTxn('txn-b'))!.txn.state).toBe('proposed');
  });
});
