// problem_management — the "no closure without a root cause" gate, driven.
//
// A problem must NEVER be resolved before its root cause is identified, and
// never closed before it is resolved. This is enforced by the state graph, not
// a guard: `resolve` leaves ONLY the post-RCA states (root_cause_identified /
// known_error), and the ONLY path into root_cause_identified is
// identify_root_cause. So from under_investigation `resolve` is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds under_investigation to resolve's
// `from`, letting a problem be marked fixed with no diagnosed cause — the
// recurring incident then re-fires, unexplained.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { problemManagement } from '../../src/v2/domain/chains/problem_management';
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
const MANAGER: Actor = { id: 'user-manager', kind: 'user', participant_id: 'party-manager' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { problem_management: problemManagement }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'problem_management', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'problem_management', edge: 'open', actor: REQUESTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  summary: 'Settlement job intermittently stalls',
  affected_service: 'PPA settlement runner',
  description: 'Nightly run hangs ~1 in 5 nights',
  impact_score: 6,
  manager_party: MANAGER.participant_id,
};

describe('problem_management — a problem cannot be resolved before RCA, nor closed before resolution', () => {
  it('declares settles:false (a quality control, never a payment)', () => {
    expect(problemManagement.settles).toBe(false);
  });

  it('resolve from under_investigation is ILLEGAL_TRANSITION; RCA then resolve then close drives to closed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-pm', baseOpen);
    expect((await act(deps, 'txn-pm', 'begin_investigation', MANAGER)).ok).toBe(true);
    expect((await store.getTxn('txn-pm'))!.txn.state).toBe('under_investigation');

    // the graph forbids resolving here — no root cause is identified yet.
    const early = await act(deps, 'txn-pm', 'resolve', MANAGER, { permanent_fix: 'raise pool timeout' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-pm'))!.txn.state).toBe('under_investigation');

    // identify root cause first, THEN resolve succeeds and stamps timestamps.
    expect((await act(deps, 'txn-pm', 'identify_root_cause', MANAGER, { root_cause: 'connection pool exhaustion' })).ok).toBe(true);
    expect((await store.getTxn('txn-pm'))!.txn.state).toBe('root_cause_identified');
    expect((await act(deps, 'txn-pm', 'resolve', MANAGER, { permanent_fix: 'raise pool size + timeout' })).ok).toBe(true);
    expect((await store.getTxn('txn-pm'))!.txn.state).toBe('resolved');

    const closed = await act(deps, 'txn-pm', 'close_problem', MANAGER);
    expect(closed.ok).toBe(true);
    const txn = (await store.getTxn('txn-pm'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.rca_at).toBe('string');
    expect(typeof txn.fields.resolved_at).toBe('string');
    expect(typeof txn.fields.closed_at_pm).toBe('string');
  });
});

describe('problem_management — destructive exits demand a reason code', () => {
  it('reject without a reason_code is refused; with one it terminates', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);

    const noReason = await act(deps, 'txn-r', 'reject', MANAGER);
    expect(noReason.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('problem_logged');

    const withReason = await act(deps, 'txn-r', 'reject', MANAGER, {}, 'duplicate');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('rejected');
  });
});
