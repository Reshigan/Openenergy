// credit_origination — the structural credit-committee gate, as a driven property.
//
// A credit facility must NEVER be offered before the credit committee has approved
// it. This is enforced by the state graph, not a guard: offer_facility leaves ONLY
// credit_approved, and the ONLY path into credit_approved is
// credit_committee_approve. So from under_assessment (assessed but not yet approved)
// offer_facility is an ILLEGAL_TRANSITION — the engine's step-4 state check refuses
// it before any guard runs.
//
// Failure mode this guards: someone adds under_assessment (or submitted) to
// offer_facility's `from`, letting a facility be offered on an un-approved credit —
// origination without a committee decision.
//
// Also pins creditApprovalPresent: the committee approval must carry a named ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { creditOrigination } from '../../src/v2/domain/chains/credit_origination';
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

const APPLICANT: Actor = { id: 'user-applicant', kind: 'user', participant_id: 'party-applicant' };
const LENDER: Actor = { id: 'user-lender', kind: 'user', participant_id: 'party-lender' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { credit_origination: creditOrigination }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'credit_origination', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'credit_origination', edge: 'open', actor: APPLICANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  application_ref: 'APP-2026-0042',
  applicant_name: 'Karoo Solar SPV',
  facility_type: 'term_loan',
  facility_amount_zar: 850_000_000,
  tenor_months: 180,
  lender_party: LENDER.participant_id,
};

describe('credit_origination — a facility cannot be offered before committee approval', () => {
  it('declares settles:false (a credit decision, never a disbursement)', () => {
    expect(creditOrigination.settles).toBe(false);
  });

  it('happy path drives @new → originated (committee-approved, offered, accepted)', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('submitted');
    expect((await act(deps, 'txn-h', 'begin_assessment', LENDER, { dscr_estimate: 1.35 })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.fields.risk_grade).toBe('adequate');
    expect((await act(deps, 'txn-h', 'credit_committee_approve', LENDER, { credit_approval_ref: 'CC-2026-0042' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'offer_facility', LENDER, { margin_bps: 275 })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'accept_offer', APPLICANT)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'originate', LENDER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('originated');
    expect(typeof txn.fields.offered_at).toBe('string');
    expect(typeof txn.fields.originated_at).toBe('string');
  });

  it('offer_facility from under_assessment is ILLEGAL_TRANSITION (not yet committee-approved)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'begin_assessment', LENDER, { dscr_estimate: 1.6 })).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('under_assessment');

    // the graph forbids offering here — assessed but NOT committee-approved.
    const early = await act(deps, 'txn-g', 'offer_facility', LENDER, { margin_bps: 275 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('under_assessment');
  });
});

describe('credit_origination — creditApprovalPresent gates the committee approval', () => {
  it('credit_committee_approve with no approval ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'begin_assessment', LENDER, { dscr_estimate: 1.4 })).ok).toBe(true);

    const r = await act(deps, 'txn-r', 'credit_committee_approve', LENDER, {});
    expect(r.ok).toBe(false);
    // required-field check or the guard rejects — either way it never approves.
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('under_assessment');
  });
});
