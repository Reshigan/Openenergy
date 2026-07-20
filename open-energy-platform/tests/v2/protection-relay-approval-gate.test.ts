// protection_relay — the structural approval gate, as a driven property.
//
// A protection setting must NEVER be pushed to a relay before an engineer
// approves it. This is enforced by the state graph, not a guard: apply_settings
// leaves ONLY change_approved, and the ONLY path into change_approved is
// approve_change. So from under_review (reviewed but NOT approved) apply_settings
// is an ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before
// any guard runs.
//
// Failure mode this guards: someone adds under_review to apply_settings' `from`,
// or reorders the states so a change can apply on an un-approved review — a
// mis-set relay then under-reaches on a real fault.
//
// Also pins regulatorPresentIfCritical: a critical-priority change cannot pass
// approve_change without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { protectionRelay } from '../../src/v2/domain/chains/protection_relay';
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
const ENGINEER: Actor = { id: 'user-engineer', kind: 'user', participant_id: 'party-engineer' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { protection_relay: protectionRelay }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'protection_relay', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'protection_relay', edge: 'open', actor: REQUESTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// routine change request — engineer named, no regulator needed.
const baseOpen = {
  relay_tag: 'F02-SEL751',
  substation: 'Substation B',
  proposed_setting: '51P pickup 640A, TD 0.30',
  change_reason: 'Coordinate with new upstream recloser',
  priority: 'routine',
  engineer_party: ENGINEER.participant_id,
};

describe('protection_relay — settings cannot apply before an engineer approves', () => {
  it('declares settles:false (a safety control, never a payment)', () => {
    expect(protectionRelay.settles).toBe(false);
  });

  it('apply_settings from under_review is ILLEGAL_TRANSITION (change not yet approved)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'begin_review', ENGINEER, { review_notes: 'Reviewing coordination study' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('under_review');

    // the graph forbids applying here — reviewed but NOT approved.
    const early = await act(deps, 'txn-c', 'apply_settings', ENGINEER, { applied_by_ref: 'WO-9911' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('under_review');

    // approve first, THEN the full happy path drives to change_closed.
    expect((await act(deps, 'txn-c', 'approve_change', ENGINEER)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('change_approved');
    expect((await act(deps, 'txn-c', 'apply_settings', ENGINEER, { applied_by_ref: 'WO-9911' })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'verify_settings', ENGINEER, { verification_ref: 'SI-4420' })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'close_change', ENGINEER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('change_closed');
    expect(typeof txn.fields.approved_at).toBe('string');
    expect(typeof txn.fields.applied_at).toBe('string');
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.closed_at_change).toBe('string');
  });
});

describe('protection_relay — regulatorPresentIfCritical gates approval', () => {
  it('critical-priority change with NO regulator is refused at approve_change', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical' });
    expect((await act(deps, 'txn-crit', 'begin_review', ENGINEER)).ok).toBe(true);

    const r = await act(deps, 'txn-crit', 'approve_change', ENGINEER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('under_review');
  });

  it('critical-priority change WITH a regulator party clears approval', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-crit', 'begin_review', ENGINEER)).ok).toBe(true);
    const r = await act(deps, 'txn-crit', 'approve_change', ENGINEER);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('change_approved');
  });
});
