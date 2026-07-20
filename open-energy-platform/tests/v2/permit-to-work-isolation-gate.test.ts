// permit_to_work — the structural isolation safety gate, as a driven property.
//
// A permit to work must NEVER be issued before isolation is physically verified.
// This is enforced by the state graph, not a guard: issue_permit leaves ONLY
// isolation_confirmed, and the ONLY path into isolation_confirmed is
// verify_isolation. So from isolation_pending (isolation approved but not yet
// verified) issue_permit is an ILLEGAL_TRANSITION — the engine's step-4 state
// check refuses it before any guard runs.
//
// Failure mode this guards: someone adds isolation_pending to issue_permit's
// `from`, or reorders the states so a permit can issue on an unverified
// isolation — a person then works on live plant that was never locked out.
//
// Also pins regulatorPresentIfHighHazard: live-work / confined-space permits
// cannot pass approve_isolation_plan without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { permitToWork } from '../../src/v2/domain/chains/permit_to_work';
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

const HOLDER: Actor = { id: 'user-holder', kind: 'user', participant_id: 'party-holder' };
const AUTHORITY: Actor = { id: 'user-authority', kind: 'user', participant_id: 'party-authority' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { permit_to_work: permitToWork }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'permit_to_work', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'permit_to_work', edge: 'open', actor: HOLDER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// general (low-hazard) permit request — authority named, no regulator needed.
const baseOpen = {
  asset_name: 'TX-3 33kV bay',
  work_location: 'Substation B',
  work_description: 'Replace CT',
  work_class: 'general',
  authority_party: AUTHORITY.participant_id,
};

describe('permit_to_work — a permit cannot issue before isolation is verified', () => {
  it('declares settles:false (a safety control, never a payment)', () => {
    expect(permitToWork.settles).toBe(false);
  });

  it('issue_permit from isolation_pending is ILLEGAL_TRANSITION (isolation not yet verified)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-p', baseOpen);
    expect((await act(deps, 'txn-p', 'begin_assessment', AUTHORITY, { hazard_score: 3 })).ok).toBe(true);
    expect((await act(deps, 'txn-p', 'approve_isolation_plan', AUTHORITY, { isolation_points: 'LOTO x3' })).ok).toBe(true);
    expect((await store.getTxn('txn-p'))!.txn.state).toBe('isolation_pending');

    // the graph forbids issuing here — isolation is approved but NOT verified.
    const early = await act(deps, 'txn-p', 'issue_permit', AUTHORITY, { permit_validity_hours: 8 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-p'))!.txn.state).toBe('isolation_pending');

    // verify first, THEN issue succeeds — and stamps issued_at.
    expect((await act(deps, 'txn-p', 'verify_isolation', AUTHORITY)).ok).toBe(true);
    expect((await store.getTxn('txn-p'))!.txn.state).toBe('isolation_confirmed');
    const issued = await act(deps, 'txn-p', 'issue_permit', AUTHORITY, { permit_validity_hours: 8 });
    expect(issued.ok).toBe(true);

    const txn = (await store.getTxn('txn-p'))!.txn;
    expect(txn.state).toBe('permit_issued');
    expect(typeof txn.fields.isolation_verified_at).toBe('string');
    expect(typeof txn.fields.issued_at).toBe('string');
  });
});

describe('permit_to_work — regulatorPresentIfHighHazard gates the isolation plan', () => {
  it('live-work permit with NO regulator is refused at approve_isolation_plan', async () => {
    const deps = newDeps();
    await open(deps, 'txn-live', { ...baseOpen, work_class: 'electrical', live_work: true });
    expect((await act(deps, 'txn-live', 'begin_assessment', AUTHORITY, { hazard_score: 9 })).ok).toBe(true);

    const r = await act(deps, 'txn-live', 'approve_isolation_plan', AUTHORITY, { isolation_points: 'earth switch' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-live'))!.txn.state).toBe('hazard_assessment');
  });

  it('live-work permit WITH a regulator party clears the isolation plan', async () => {
    const deps = newDeps();
    await open(deps, 'txn-live', { ...baseOpen, work_class: 'electrical', live_work: true, regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-live', 'begin_assessment', AUTHORITY, { hazard_score: 9 })).ok).toBe(true);
    const r = await act(deps, 'txn-live', 'approve_isolation_plan', AUTHORITY, { isolation_points: 'earth switch' });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-live'))!.txn.state).toBe('isolation_pending');
  });
});
