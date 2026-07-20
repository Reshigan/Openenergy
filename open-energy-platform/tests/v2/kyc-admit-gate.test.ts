// kyc — the FICA admit gate, as a driven property.
//
// A participant must NEVER be admitted before an external vendor verdict is on
// the log. This is enforced by the state graph, not a guard: admit_participant
// leaves ONLY decision_pending, and the ONLY path into decision_pending runs
// through risk_rated → verdict_received → receive_verdict. So from any earlier
// state admit_participant is an ILLEGAL_TRANSITION — the engine's step-4 state
// check refuses it before any guard runs.
//
// Failure mode this guards: someone adds an earlier state to admit_participant's
// `from`, or short-circuits the screening path — a participant is then admitted
// without CDD, a FICA breach.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { kyc } from '../../src/v2/domain/chains/kyc';
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

const COMPLIANCE: Actor = { id: 'user-compliance', kind: 'user', participant_id: 'party-compliance' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { kyc }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'kyc', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'kyc', edge: 'open', actor: COMPLIANCE, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  subject_party: 'party-subject',
  subject_legal_name: 'Acme Trading (Pty) Ltd',
  entity_type: 'juristic',
};

describe('kyc — a participant cannot be admitted before a vendor verdict', () => {
  it('declares settles:false (a compliance control, never a payment)', () => {
    expect(kyc.settles).toBe(false);
  });

  it('happy path opens → screens → verdict → rated → BO → admitted', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-k', baseOpen);
    expect((await act(deps, 'txn-k', 'request_screening', COMPLIANCE, { vendor_name: 'RefinitivWC' })).ok).toBe(true);
    expect((await act(deps, 'txn-k', 'receive_verdict', COMPLIANCE, { vendor_verdict: 'clear', report_hash: 'sha256:abc' })).ok).toBe(true);
    expect((await act(deps, 'txn-k', 'assign_risk_rating', COMPLIANCE, { risk_rating: 'low' })).ok).toBe(true);
    expect((await act(deps, 'txn-k', 'determine_bo', COMPLIANCE, { beneficial_owners: 'J Smith 60%', bo_verified: true })).ok).toBe(true);
    expect((await act(deps, 'txn-k', 'admit_participant', COMPLIANCE)).ok).toBe(true);

    const txn = (await store.getTxn('txn-k'))!.txn;
    expect(txn.state).toBe('admitted');
    expect(txn.fields.risk_tier).toBe('low');
    expect(txn.fields.edd_required).toBe(false);
    expect(typeof txn.fields.verdict_received_at).toBe('string');
    expect(typeof txn.fields.decided_at).toBe('string');
  });

  it('admit_participant from screening_pending is ILLEGAL_TRANSITION (no verdict yet)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-k', baseOpen);
    expect((await act(deps, 'txn-k', 'request_screening', COMPLIANCE, { vendor_name: 'RefinitivWC' })).ok).toBe(true);
    expect((await store.getTxn('txn-k'))!.txn.state).toBe('screening_pending');

    const early = await act(deps, 'txn-k', 'admit_participant', COMPLIANCE);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-k'))!.txn.state).toBe('screening_pending');
  });
});

describe('kyc — a decline must carry a reason code', () => {
  it('decline_kyc without a reason_code is rejected', async () => {
    const deps = newDeps();
    await open(deps, 'txn-k', baseOpen);
    await act(deps, 'txn-k', 'request_screening', COMPLIANCE, { vendor_name: 'RefinitivWC' });
    await act(deps, 'txn-k', 'receive_verdict', COMPLIANCE, { vendor_verdict: 'hit', report_hash: 'sha256:xyz' });
    expect((await deps.store.getTxn('txn-k'))!.txn.state).toBe('verdict_received');

    const noReason = await act(deps, 'txn-k', 'decline_kyc', COMPLIANCE);
    expect(noReason.ok).toBe(false);

    const withReason = await act(deps, 'txn-k', 'decline_kyc', COMPLIANCE, {}, 'sanctions_hit');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-k'))!.txn.state).toBe('declined');
  });
});
