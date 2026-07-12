// change_enablement — the structural governance gate, as a driven property.
//
// A change must NEVER be implemented before it is CAB-approved AND a window is
// booked. This is enforced by the state graph, not a guard: begin_implementation
// leaves ONLY `scheduled`, and the ONLY path into `scheduled` is `schedule` from
// `approved`. So from `approved` (approved but not yet scheduled),
// begin_implementation is an ILLEGAL_TRANSITION — the engine's step-4 state check
// refuses it before any guard runs.
//
// Failure mode this guards: someone adds `approved` to begin_implementation's
// `from`, or lets a change implement on an unscheduled window — an ungoverned
// production change to trading/settlement systems.
//
// Also pins regulatorPresentIfCritical: a critical-priority change cannot pass
// `approve` without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { changeEnablement } from '../../src/v2/domain/chains/change_enablement';
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

const REQUESTER: Actor = { id: 'user-req', kind: 'user', participant_id: 'party-req' };
const MANAGER: Actor = { id: 'user-mgr', kind: 'user', participant_id: 'party-mgr' };
const IMPLEMENTER: Actor = { id: 'user-impl', kind: 'user', participant_id: 'party-impl' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { change_enablement: changeEnablement }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'change_enablement', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'change_enablement', edge: 'open', actor: REQUESTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// a normal (low-risk) change — manager + implementer named, no regulator needed.
const baseOpen = {
  change_title: 'Rotate matching-engine TLS certs',
  change_type: 'normal',
  priority: 'medium',
  systems_affected: 'OrderBook DO',
  change_manager_party: MANAGER.participant_id,
  implementer_party: IMPLEMENTER.participant_id,
};

describe('change_enablement — a change cannot implement before it is scheduled', () => {
  it('declares settles:false (a governance control, never a payment)', () => {
    expect(changeEnablement.settles).toBe(false);
  });

  it('begin_implementation from approved is ILLEGAL_TRANSITION (no window booked)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'assess', MANAGER, { risk_score: 3 })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'approve', MANAGER, { cab_ref: 'CAB-2026-014' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('approved');

    // the graph forbids implementing here — approved but NOT scheduled.
    const early = await act(deps, 'txn-c', 'begin_implementation', IMPLEMENTER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('approved');

    // schedule first, THEN implement → complete → close drives to terminal.
    expect((await act(deps, 'txn-c', 'schedule', MANAGER, { planned_start: '2026-07-20T22:00:00Z', planned_end: '2026-07-20T23:00:00Z' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('scheduled');
    expect((await act(deps, 'txn-c', 'begin_implementation', IMPLEMENTER)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'complete_implementation', IMPLEMENTER)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'close_change', MANAGER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.scheduled_at).toBe('string');
    expect(typeof txn.fields.impl_started_at).toBe('string');
    expect(typeof txn.fields.closed_at_chg).toBe('string');
  });
});

describe('change_enablement — regulatorPresentIfCritical gates CAB approval', () => {
  it('critical change with NO regulator is refused at approve', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical' });
    expect((await act(deps, 'txn-crit', 'assess', MANAGER, { risk_score: 9 })).ok).toBe(true);

    const r = await act(deps, 'txn-crit', 'approve', MANAGER, { cab_ref: 'CAB-2026-015' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('assessing');
  });

  it('critical change WITH a regulator party clears approval', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-crit', 'assess', MANAGER, { risk_score: 9 })).ok).toBe(true);
    const r = await act(deps, 'txn-crit', 'approve', MANAGER, { cab_ref: 'CAB-2026-015' });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('approved');
  });
});
