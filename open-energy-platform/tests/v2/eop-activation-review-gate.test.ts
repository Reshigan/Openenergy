// eop_activation — the structural review gate + NERSA severity guard, driven.
//
// An EOP's Post-Event Review can NEVER open while the grid is still in the
// emergency. This is enforced by the state graph, not a guard: initiate_review
// leaves ONLY normal_restored, and the ONLY path into normal_restored is
// restore_normal (from restoration). So from eop_active, initiate_review is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone widens initiate_review's `from` to include
// eop_active/restoration, letting an incident "close" via a review while the
// network is still shedding load — the reliability record then lies.
//
// Also pins regulatorPresentIfCritical: a severe tier (n2_double / black_start)
// derives priority:'critical' at open and cannot activate without a regulator.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { eopActivation } from '../../src/v2/domain/chains/eop_activation';
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

const OPERATOR: Actor = { id: 'user-operator', kind: 'user', participant_id: 'party-operator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { eop_activation: eopActivation }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'eop_activation', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'eop_activation', edge: 'open', actor: OPERATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// low-tier contingency — no regulator required to activate.
const baseOpen = {
  eop_tier: 'n1_minor',
  contingency_type: 'line_trip',
  contingency_description: 'Alpha-Beta 400kV line 1 tripped on distance protection',
  affected_region: 'Highveld',
};

describe('eop_activation — a review cannot open before the grid is restored', () => {
  it('declares settles:false (a reliability control, never a payment)', () => {
    expect(eopActivation.settles).toBe(false);
  });

  it('drives the full happy path open -> ... -> eop_closed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'activate', OPERATOR, { load_shedding_stage: 2 })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'begin_restoration', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'restore_normal', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'initiate_review', OPERATOR)).ok).toBe(true);
    const closed = await act(deps, 'txn-e', 'complete_review', OPERATOR, { root_cause: 'aged CT insulation failure' });
    expect(closed.ok).toBe(true);

    const txn = (await store.getTxn('txn-e'))!.txn;
    expect(txn.state).toBe('eop_closed');
    expect(typeof txn.fields.eop_activated_at).toBe('string');
    expect(typeof txn.fields.per_completed_at).toBe('string');
  });

  it('initiate_review from eop_active is ILLEGAL_TRANSITION (grid not yet restored)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-x', baseOpen);
    expect((await act(deps, 'txn-x', 'activate', OPERATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('eop_active');

    // the graph forbids opening the PER here — the grid is still in emergency.
    const early = await act(deps, 'txn-x', 'initiate_review', OPERATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('eop_active');
  });
});

describe('eop_activation — regulatorPresentIfCritical gates a severe activation', () => {
  it('black_start EOP with NO regulator is refused at activate', async () => {
    const deps = newDeps();
    await open(deps, 'txn-bs', { ...baseOpen, eop_tier: 'black_start' });
    const r = await act(deps, 'txn-bs', 'activate', OPERATOR);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-bs'))!.txn.state).toBe('contingency_detected');
  });

  it('black_start EOP WITH a regulator party activates', async () => {
    const deps = newDeps();
    await open(deps, 'txn-bs', { ...baseOpen, eop_tier: 'black_start', regulator_party: REGULATOR_ID });
    const r = await act(deps, 'txn-bs', 'activate', OPERATOR);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-bs'))!.txn.state).toBe('eop_active');
  });
});
