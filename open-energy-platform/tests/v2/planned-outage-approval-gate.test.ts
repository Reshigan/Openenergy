// planned_outage — the structural approval gate, as a driven property.
//
// An asset must NEVER be taken out of service before the system operator has
// approved the outage window. This is enforced by the state graph, not a guard:
// start_outage leaves ONLY window_approved, and the ONLY path into
// window_approved is approve_window. So from under_review (reviewing, not yet
// approved) start_outage is an ILLEGAL_TRANSITION — the engine's step-4 state
// check refuses it before any guard runs.
//
// Failure mode this guards: someone adds under_review (or outage_requested) to
// start_outage's `from`, letting a requester pull a network element out of
// service the SO never cleared — a grid-security event.
//
// Also pins regulatorPresentIfStrategic: a >=100 MW outage cannot pass
// approve_window without a regulator (NERSA) party on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { plannedOutage } from '../../src/v2/domain/chains/planned_outage';
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

const REQUESTER: Actor = { id: 'user-requester', kind: 'user', participant_id: 'party-requester' };
const OPERATOR: Actor = { id: 'user-operator', kind: 'user', participant_id: 'party-operator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { planned_outage: plannedOutage }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'planned_outage', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'planned_outage', edge: 'open', actor: REQUESTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// routine (sub-100 MW) transmission outage — operator named, no regulator needed.
const baseOpen = {
  asset_name: 'Line 4 132kV',
  outage_type: 'transmission',
  outage_reason: 'Conductor replacement',
  capacity_mw: 40,
  operator_party: OPERATOR.participant_id,
};

describe('planned_outage — an asset cannot go out of service before the SO approves', () => {
  it('declares settles:false (a grid control, never a payment)', () => {
    expect(plannedOutage.settles).toBe(false);
  });

  it('start_outage from under_review is ILLEGAL_TRANSITION, then the happy path returns to service', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-o', baseOpen);
    expect((await act(deps, 'txn-o', 'begin_review', OPERATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-o'))!.txn.state).toBe('under_review');

    // the graph forbids taking the asset out here — the window is not approved.
    const early = await act(deps, 'txn-o', 'start_outage', REQUESTER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-o'))!.txn.state).toBe('under_review');

    // approve first, THEN the full happy path runs to a return to service.
    expect((await act(deps, 'txn-o', 'approve_window', OPERATOR, { security_impact: 'N-1 secure' })).ok).toBe(true);
    expect((await store.getTxn('txn-o'))!.txn.state).toBe('window_approved');
    expect((await act(deps, 'txn-o', 'start_outage', REQUESTER)).ok).toBe(true);
    expect((await act(deps, 'txn-o', 'begin_restoration', REQUESTER)).ok).toBe(true);
    expect((await act(deps, 'txn-o', 'return_to_service', OPERATOR)).ok).toBe(true);

    const txn = (await store.getTxn('txn-o'))!.txn;
    expect(txn.state).toBe('returned_to_service');
    expect(typeof txn.fields.approved_at).toBe('string');
    expect(typeof txn.fields.started_at).toBe('string');
    expect(typeof txn.fields.returned_at).toBe('string');
  });
});

describe('planned_outage — regulatorPresentIfStrategic gates the window approval', () => {
  it('a >=100 MW outage with NO regulator is refused at approve_window', async () => {
    const deps = newDeps();
    await open(deps, 'txn-big', { ...baseOpen, capacity_mw: 600 });
    expect((await act(deps, 'txn-big', 'begin_review', OPERATOR)).ok).toBe(true);

    const r = await act(deps, 'txn-big', 'approve_window', OPERATOR, { security_impact: 'bulk network event' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-big'))!.txn.state).toBe('under_review');
  });

  it('a >=100 MW outage WITH a regulator party clears approve_window', async () => {
    const deps = newDeps();
    await open(deps, 'txn-big', { ...baseOpen, capacity_mw: 600, regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-big', 'begin_review', OPERATOR)).ok).toBe(true);
    const r = await act(deps, 'txn-big', 'approve_window', OPERATOR, { security_impact: 'bulk network event' });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-big'))!.txn.state).toBe('window_approved');
  });
});
