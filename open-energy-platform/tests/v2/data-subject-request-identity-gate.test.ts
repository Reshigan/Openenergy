// data_subject_request — the structural POPIA §26 identity gate, as a driven
// property.
//
// Personal data must NEVER be mapped or disclosed before the requester's
// identity is verified. This is enforced by the state graph, not a guard:
// map_data leaves ONLY identity_verified, and the ONLY path into
// identity_verified is verify_identity. So from acknowledged (identity NOT yet
// verified) map_data is an ILLEGAL_TRANSITION — the engine's step-4 state check
// refuses it before any field/reason handling runs.
//
// Failure mode this guards: someone adds acknowledged to map_data's `from`, or
// reorders the states so data can be mapped on an unverified identity — the
// officer then discloses one subject's data to an impostor.
//
// Also pins that refuse (a destructive outcome exit) demands a reason_code.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { dataSubjectRequest } from '../../src/v2/domain/chains/data_subject_request';
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

const OFFICER: Actor = { id: 'user-officer', kind: 'user', participant_id: 'party-officer' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { data_subject_request: dataSubjectRequest }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'data_subject_request', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'data_subject_request', edge: 'open', actor: OFFICER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  requester_name: 'Thandi Nkosi',
  requester_email: 'thandi@example.co.za',
  relationship: 'data_subject',
  request_type: 'access',
};

describe('data_subject_request — data cannot be mapped before identity is verified', () => {
  it('declares settles:false (a compliance obligation, never a payment)', () => {
    expect(dataSubjectRequest.settles).toBe(false);
  });

  it('map_data from acknowledged is ILLEGAL_TRANSITION (identity not yet verified)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-d', baseOpen);
    expect((await act(deps, 'txn-d', 'acknowledge', OFFICER)).ok).toBe(true);
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('acknowledged');

    // the graph forbids mapping data here — identity is acknowledged but NOT verified.
    const early = await act(deps, 'txn-d', 'map_data', OFFICER, { systems_involved: '["d1"]' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('acknowledged');

    // verify identity first, THEN the disclosure spine runs to fulfilled.
    expect((await act(deps, 'txn-d', 'verify_identity', OFFICER, { identity_evidence_ref: 'ID-8801015800083' })).ok).toBe(true);
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('identity_verified');
    expect((await act(deps, 'txn-d', 'map_data', OFFICER, { systems_involved: '["d1"]' })).ok).toBe(true);
    expect((await act(deps, 'txn-d', 'assess_legal', OFFICER)).ok).toBe(true);
    expect((await act(deps, 'txn-d', 'draft_response', OFFICER, { response_ref: 'RSP-001' })).ok).toBe(true);
    expect((await act(deps, 'txn-d', 'fulfil', OFFICER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-d'))!.txn;
    expect(txn.state).toBe('fulfilled');
    expect(typeof txn.fields.identity_verified_at).toBe('string');
    expect(typeof txn.fields.fulfilled_at).toBe('string');
    expect(txn.fields.sla_days).toBe(30); // derived from request_type 'access'
  });
});

describe('data_subject_request — a refusal must carry a ground', () => {
  it('refuse without a reason_code is rejected', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'acknowledge', OFFICER)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'verify_identity', OFFICER, { identity_evidence_ref: 'ID-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'map_data', OFFICER, { systems_involved: '["kv"]' })).ok).toBe(true);

    const noReason = await act(deps, 'txn-r', 'refuse', OFFICER);
    expect(noReason.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('data_mapped');

    const withReason = await act(deps, 'txn-r', 'refuse', OFFICER, {}, 'paia_s11_exemption');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('refused');
  });
});
