// connection_energization — the structural energization safety gate, as a
// driven property.
//
// A grid connection must NEVER be energized before witness testing has passed.
// This is enforced by the state graph, not a guard: `energize` leaves ONLY
// cleared_to_energize, and the ONLY path into cleared_to_energize is
// clear_for_energization out of witness_testing. So from witness_testing (tests
// underway but not yet cleared) `energize` is an ILLEGAL_TRANSITION — the
// engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds witness_testing (or worse,
// energization_requested) to energize's `from`, or reorders states so a
// connection can go live on unwitnessed protection — live plant is then
// connected to the grid without compliance sign-off.
//
// Also pins regulatorPresentIfStrategic: a ≥100 MW connection cannot pass
// clear_for_energization without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { connectionEnergization } from '../../src/v2/domain/chains/connection_energization';
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
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { connection_energization: connectionEnergization },
    guards: GUARDS,
  };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'connection_energization', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'connection_energization', edge: 'open', actor: APPLICANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// small (sub-strategic) connection request — operator named, no regulator needed.
const baseOpen = {
  connection_point: 'Substation B — 33kV bay 4',
  gca_ref: 'GCA-2026-0442',
  capacity_mw: 50,
  voltage_kv: 33,
  operator_party: OPERATOR.participant_id,
};

describe('connection_energization — a connection cannot energize before witness testing passes', () => {
  it('declares settles:false (a grid control, never a payment)', () => {
    expect(connectionEnergization.settles).toBe(false);
  });

  it('drives the happy path @new → energized and refuses an early energize', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'begin_inspection', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'record_inspection', OPERATOR, { inspection_ref: 'INSP-1' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('witness_testing');

    // the graph forbids energizing here — witness testing not yet cleared.
    const early = await act(deps, 'txn-c', 'energize', OPERATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('witness_testing');

    // clear first, THEN energize succeeds — stamping cleared_at + energized_at.
    expect((await act(deps, 'txn-c', 'clear_for_energization', OPERATOR, { witness_test_ref: 'WT-1' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('cleared_to_energize');
    const live = await act(deps, 'txn-c', 'energize', OPERATOR);
    expect(live.ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('energized');
    expect(txn.fields.connection_tier).toBe('large');
    expect(typeof txn.fields.cleared_at).toBe('string');
    expect(typeof txn.fields.energized_at).toBe('string');
  });
});

describe('connection_energization — regulatorPresentIfStrategic gates clearance', () => {
  it('a strategic (≥100 MW) connection with NO regulator is refused at clear_for_energization', async () => {
    const deps = newDeps();
    await open(deps, 'txn-s', { ...baseOpen, capacity_mw: 250 });
    expect((await act(deps, 'txn-s', 'begin_inspection', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'record_inspection', OPERATOR, { inspection_ref: 'INSP-2' })).ok).toBe(true);

    const r = await act(deps, 'txn-s', 'clear_for_energization', OPERATOR, { witness_test_ref: 'WT-2' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('witness_testing');
  });

  it('a strategic connection WITH a regulator party clears for energization', async () => {
    const deps = newDeps();
    await open(deps, 'txn-s', { ...baseOpen, capacity_mw: 250, regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-s', 'begin_inspection', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'record_inspection', OPERATOR, { inspection_ref: 'INSP-3' })).ok).toBe(true);
    const r = await act(deps, 'txn-s', 'clear_for_energization', OPERATOR, { witness_test_ref: 'WT-3' });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('cleared_to_energize');
  });
});
