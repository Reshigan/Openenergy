// interconnector_schedule — the structural firm-flow gate, as a driven property.
//
// A schedule must NEVER be dispatched onto the interconnector before the
// operator has confirmed it firm. This is enforced by the state graph, not a
// guard: dispatch_schedule leaves ONLY `confirmed`, and the only path into
// `confirmed` is confirm_schedule from `capacity_review`. So from `nominated`
// (a raw nomination, capacity not yet reviewed) dispatch_schedule is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds `nominated` (or `capacity_review`) to
// dispatch_schedule's `from`, letting an unallocated cross-border flow hit the
// line before capacity was confirmed firm.
//
// Also pins that reject_schedule without a reason_code is refused.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { interconnectorSchedule } from '../../src/v2/domain/chains/interconnector_schedule';
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

const SCHEDULER: Actor = { id: 'user-sched', kind: 'user', participant_id: 'party-scheduler' };
const OPERATOR: Actor = { id: 'user-op', kind: 'user', participant_id: 'party-operator' };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { interconnector_schedule: interconnectorSchedule },
    guards: GUARDS,
  };
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
    {
      txn_id: txnId,
      chain_key: 'interconnector_schedule',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      reason_code,
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'interconnector_schedule',
      edge: 'open',
      actor: SCHEDULER,
      input: input as Command['input'],
      expected_seq: { [txnId]: -1 },
      idempotency_key: key(),
    },
    deps,
  );
}

const baseOpen = {
  interconnector: 'Cahora Bassa HVDC',
  direction: 'import',
  delivery_date: '2026-08-01',
  delivery_hour_start: 8,
  delivery_hour_end: 12,
  schedule_mw: 500,
  counterparty_party: 'party-counterparty',
  operator_party: OPERATOR.participant_id,
};

describe('interconnector_schedule — cannot dispatch before firm confirmation', () => {
  it('declares settles:false (a grid instruction, never a payment)', () => {
    expect(interconnectorSchedule.settles).toBe(false);
  });

  it('dispatch_schedule from nominated is ILLEGAL_TRANSITION, then the happy path completes', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-s', baseOpen);
    // scheduled_mwh derived at open: 500 MW * (12-8)h = 2000
    expect((await store.getTxn('txn-s'))!.txn.fields.scheduled_mwh).toBe(2000);

    // the graph forbids dispatching here — capacity not reviewed / confirmed.
    const early = await act(deps, 'txn-s', 'dispatch_schedule', OPERATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('nominated');

    // review → confirm → dispatch → complete: the firm path.
    expect((await act(deps, 'txn-s', 'begin_review', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'confirm_schedule', OPERATOR, { allocated_capacity_mw: 500 })).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('confirmed');
    expect((await act(deps, 'txn-s', 'dispatch_schedule', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'complete_schedule', OPERATOR, { delivered_mwh: 1980 })).ok).toBe(true);

    const txn = (await store.getTxn('txn-s'))!.txn;
    expect(txn.state).toBe('completed');
    expect(typeof txn.fields.confirmed_at).toBe('string');
    expect(typeof txn.fields.dispatched_at).toBe('string');
    expect(typeof txn.fields.completed_at).toBe('string');
  });
});

describe('interconnector_schedule — a rejection needs a structured reason', () => {
  it('reject_schedule without a reason_code is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    const bad = await act(deps, 'txn-r', 'reject_schedule', OPERATOR);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('nominated');

    const good = await act(deps, 'txn-r', 'reject_schedule', OPERATOR, {}, 'capacity_unavailable');
    expect(good.ok).toBe(true);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('rejected');
  });
});
