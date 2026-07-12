// grid_capacity_allocation — the structural commitment gate, as a driven property.
//
// Capacity must NEVER be activated before the applicant has accepted the offer.
// This is enforced by the state graph, not a guard: activate_allocation leaves
// ONLY allocation_accepted, and the ONLY path into allocation_accepted is
// accept_allocation. So from allocation_offered (offered but not yet accepted)
// activate_allocation is an ILLEGAL_TRANSITION — the engine's step-4 state check
// refuses it before any guard runs.
//
// Failure mode this guards: someone adds allocation_offered to
// activate_allocation's `from`, letting the operator commit firm capacity on an
// offer the applicant never accepted.
//
// Also pins regulatorPresentIfStrategic: a ≥100 MW request cannot pass
// offer_allocation without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { gridCapacityAllocation } from '../../src/v2/domain/chains/grid_capacity_allocation';
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

const APPLICANT: Actor = { id: 'user-applicant', kind: 'user', participant_id: 'party-applicant' };
const OPERATOR: Actor = { id: 'user-operator', kind: 'user', participant_id: 'party-operator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { grid_capacity_allocation: gridCapacityAllocation }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'grid_capacity_allocation', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'grid_capacity_allocation', edge: 'open', actor: APPLICANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// standard (sub-strategic) request — grid operator named, no regulator needed.
const baseOpen = {
  connection_point: 'Klipheuwel 132kV',
  voltage_kv: 132,
  capacity_mw: 45,
  energy_type: 'wind',
  grid_operator_party: OPERATOR.participant_id,
};

describe('grid_capacity_allocation — capacity cannot activate before the offer is accepted', () => {
  it('declares settles:false (a grid-access control, never a payment)', () => {
    expect(gridCapacityAllocation.settles).toBe(false);
  });

  it('activate_allocation from allocation_offered is ILLEGAL_TRANSITION (offer not yet accepted)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'begin_study', OPERATOR, { study_ref: 'STUDY-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'offer_allocation', OPERATOR, { offered_mw: 40, offer_validity_days: 14 })).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('allocation_offered');

    // the graph forbids activating here — offered but NOT yet accepted.
    const early = await act(deps, 'txn-g', 'activate_allocation', OPERATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('allocation_offered');

    // accept first, THEN activate succeeds — driving to the terminal state.
    expect((await act(deps, 'txn-g', 'accept_allocation', APPLICANT)).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('allocation_accepted');
    const activated = await act(deps, 'txn-g', 'activate_allocation', OPERATOR);
    expect(activated.ok).toBe(true);

    const txn = (await store.getTxn('txn-g'))!.txn;
    expect(txn.state).toBe('allocation_active');
    expect(typeof txn.fields.accepted_at).toBe('string');
    expect(typeof txn.fields.activated_at).toBe('string');
  });

  it('a destructive exit without a reason_code is rejected (decline_offer)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'begin_study', OPERATOR, { study_ref: 'STUDY-2' })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'offer_allocation', OPERATOR, { offered_mw: 40 })).ok).toBe(true);

    const noReason = await act(deps, 'txn-r', 'decline_offer', APPLICANT);
    expect(noReason.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('allocation_offered');
  });
});

describe('grid_capacity_allocation — regulatorPresentIfStrategic gates the offer', () => {
  it('a ≥100 MW request with NO regulator is refused at offer_allocation', async () => {
    const deps = newDeps();
    await open(deps, 'txn-s', { ...baseOpen, capacity_mw: 150 });
    expect((await act(deps, 'txn-s', 'begin_study', OPERATOR, { study_ref: 'STUDY-3' })).ok).toBe(true);

    const r = await act(deps, 'txn-s', 'offer_allocation', OPERATOR, { offered_mw: 150 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('study_in_progress');
  });

  it('a ≥100 MW request WITH a regulator party clears the offer', async () => {
    const deps = newDeps();
    await open(deps, 'txn-s', { ...baseOpen, capacity_mw: 150, regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-s', 'begin_study', OPERATOR, { study_ref: 'STUDY-4' })).ok).toBe(true);
    const r = await act(deps, 'txn-s', 'offer_allocation', OPERATOR, { offered_mw: 150 });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('allocation_offered');
  });
});
