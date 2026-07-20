// ppa_nomination — the grid-validation gate, as a driven property.
//
// A buyer can only accept a nomination the grid has validated. This is
// STRUCTURAL, not a guard: the only edge into `accepted` is `accept`, and
// `accept` is only valid from `validated` — which only the grid's `validate`
// edge reaches. So accepting a still-`submitted` nomination is an
// ILLEGAL_TRANSITION, full stop. Drop the state-machine wiring and a buyer could
// rubber-stamp a schedule the grid never checked against network constraints.
//
// Also pins settles:false (a nomination is a delivery schedule, never a payment).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ppaNomination } from '../../src/v2/domain/chains/ppa_nomination';
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

const SELLER: Actor = { id: 'user-seller', kind: 'user', participant_id: 'party-seller' };
const BUYER: Actor = { id: 'user-buyer', kind: 'user', participant_id: 'party-buyer' };
const GRID: Actor = { id: 'user-grid', kind: 'user', participant_id: 'party-grid' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { ppa_nomination: ppaNomination }, guards: GUARDS };
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
    { txn_id: txnId, chain_key: 'ppa_nomination', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'ppa_nomination', edge: 'open', actor: SELLER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// buyer & grid supplied as live parties from @new so they can fire later edges.
const baseOpen = {
  delivery_date: '2026-07-13',
  energy_mwh: 120,
  price_zar_mwh: 850,
  point_of_delivery: 'POD-Mpumalanga',
  buyer_party: BUYER.participant_id,
  grid_party: GRID.participant_id,
};

describe('ppa_nomination — grid validation structurally gates buyer acceptance', () => {
  it('declares settles:false (a delivery schedule, not a payment)', () => {
    expect(ppaNomination.settles).toBe(false);
  });

  it('happy path: seller submits → grid validates → buyer accepts (stamps accepted_at)', async () => {
    const deps = newDeps();
    expect((await open(deps, 'txn-1', baseOpen)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-1'))!.txn.state).toBe('submitted');

    expect((await act(deps, 'txn-1', 'validate', GRID)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-1'))!.txn.state).toBe('validated');

    const accepted = await act(deps, 'txn-1', 'accept', BUYER);
    expect(accepted.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-1'))!.txn;
    expect(txn.state).toBe('accepted');
    expect(typeof txn.fields.accepted_at).toBe('string'); // derive stamped the instant
  });

  it('accepting a still-submitted nomination is refused (ILLEGAL_TRANSITION, state unmoved)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-2', baseOpen);

    // buyer tries to accept before the grid has validated — no such edge from submitted.
    const r = await act(deps, 'txn-2', 'accept', BUYER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    expect((await deps.store.getTxn('txn-2'))!.txn.state).toBe('submitted');
  });
});
