// disbursement — the structural credit gate, as a driven property.
//
// Facility funds must NEVER be released before a named credit approval lands.
// This is enforced by the state graph, not a pay-time check: pay_funds leaves
// ONLY `authorised`, and the ONLY path into `authorised` is `authorise` — which
// is guarded by creditApprovalPresent. So from `verified` (CPs satisfied but not
// yet authorised) pay_funds is an ILLEGAL_TRANSITION, and authorise itself is
// refused with MISSING_CREDIT_APPROVAL when no credit_approval_ref is supplied.
//
// Failure mode this guards: someone adds `verified` to pay_funds's `from`, or
// drops creditApprovalPresent from authorise — funds then move on an unapproved
// facility drawdown.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { disbursement } from '../../src/v2/domain/chains/disbursement';
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

const BORROWER: Actor = { id: 'user-borrower', kind: 'user', participant_id: 'party-borrower' };
const LENDER: Actor = { id: 'user-lender', kind: 'user', participant_id: 'party-lender' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { disbursement }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'disbursement', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code: reason },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'disbursement', edge: 'open', actor: BORROWER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  facility_ref: 'FAC-2031',
  drawdown_ref: 'DD-7',
  amount: 25_000_000,
  currency: 'ZAR',
  purpose: 'EPC milestone 3',
  lender_party: LENDER.participant_id,
};

describe('disbursement — funds cannot be paid before credit authorisation', () => {
  it('declares settles:false (an operational control event, not the payment rail)', () => {
    expect(disbursement.settles).toBe(false);
  });

  it('pay_funds from verified is ILLEGAL_TRANSITION; authorise then pay succeeds', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-d', baseOpen);
    expect((await act(deps, 'txn-d', 'verify', LENDER, { cp_evidence_ref: 'CP-PACK-19' })).ok).toBe(true);
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('verified');

    // the graph forbids paying here — CPs are satisfied but no credit approval.
    const early = await act(deps, 'txn-d', 'pay_funds', LENDER, { payment_reference: 'PMT-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('verified');

    // authorise (with credit approval), THEN pay, THEN borrower confirms.
    expect((await act(deps, 'txn-d', 'authorise', LENDER, { credit_approval_ref: 'CRD-88' })).ok).toBe(true);
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('authorised');
    expect((await act(deps, 'txn-d', 'pay_funds', LENDER, { payment_reference: 'PMT-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-d', 'confirm_receipt', BORROWER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-d'))!.txn;
    expect(txn.state).toBe('confirmed');
    expect(typeof txn.fields.authorised_at).toBe('string');
    expect(typeof txn.fields.paid_at).toBe('string');
    expect(typeof txn.fields.confirmed_at).toBe('string');
  });

  it('authorise with no credit_approval_ref is refused (MISSING_CREDIT_APPROVAL)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-n', baseOpen);
    expect((await act(deps, 'txn-n', 'verify', LENDER, { cp_evidence_ref: 'CP-PACK-19' })).ok).toBe(true);

    const r = await act(deps, 'txn-n', 'authorise', LENDER, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_CREDIT_APPROVAL');
    expect((await deps.store.getTxn('txn-n'))!.txn.state).toBe('verified');
  });
});
