// connection_budget_quote — the structural acceptance gate, as a driven property.
//
// A budget quote must NEVER be accepted before the utility has priced and issued
// it. This is enforced by the state graph, not a guard: accept_quote leaves ONLY
// quoted, and the ONLY path into quoted is issue_quote (from pricing). So from
// pricing (requested, not yet quoted) accept_quote is an ILLEGAL_TRANSITION — the
// engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds pricing to accept_quote's `from`, letting
// an applicant "accept" a quote that was never priced or issued.
//
// Also pins: counterpartyDistinct at '@new' (an applicant that names itself as the
// network utility is refused SELF_DEALING) and creditApprovalPresent at acceptance
// (no credit-approval ref for the connection charge → MISSING_CREDIT_APPROVAL).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { connectionBudgetQuote } from '../../src/v2/domain/chains/connection_budget_quote';
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

const APPLICANT: Actor = { id: 'user-app', kind: 'user', participant_id: 'party-app' };
const UTILITY: Actor = { id: 'user-util', kind: 'user', participant_id: 'party-util' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { connection_budget_quote: connectionBudgetQuote }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'connection_budget_quote', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>, actor: Actor = APPLICANT) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'connection_budget_quote', edge: 'open', actor, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  applicant_name: 'Greenfield Estates',
  utility_name: 'Eskom Distribution',
  utility_party: UTILITY.participant_id,
  connection_kva: 500,
  site_ref: 'ERF-1123',
};

describe('connection_budget_quote — a quote cannot be accepted before it is priced and issued', () => {
  it('declares settles:false (a cost-estimate record, never a payment)', () => {
    expect(connectionBudgetQuote.settles).toBe(false);
  });

  it('happy path: open -> begin_pricing -> issue_quote -> accept_quote -> accepted', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'begin_pricing', UTILITY)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'issue_quote', UTILITY, { quote_amount: 1_250_000 })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('quoted');
    expect((await act(deps, 'txn-h', 'accept_quote', APPLICANT, { credit_approval_ref: 'CR-APP-901' })).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('accepted');
    expect(typeof txn.fields.quoted_at).toBe('string');
    expect(typeof txn.fields.accepted_at).toBe('string');
  });

  it('accept_quote from pricing (never priced/issued) is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'begin_pricing', UTILITY)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('pricing');

    // the graph forbids accepting here — no quote has been issued.
    const early = await act(deps, 'txn-e', 'accept_quote', APPLICANT, { credit_approval_ref: 'CR-APP-901' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('pricing');
  });
});

describe('connection_budget_quote — evidence + independence gates', () => {
  it('an applicant that names itself as the network utility is refused SELF_DEALING at @new', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-self', { ...baseOpen, utility_party: APPLICANT.participant_id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF_DEALING');
  });

  it('accepting with no credit-approval ref is refused MISSING_CREDIT_APPROVAL', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    await act(deps, 'txn-c', 'begin_pricing', UTILITY);
    await act(deps, 'txn-c', 'issue_quote', UTILITY, { quote_amount: 1_250_000 });
    // quote issued, credit_approval_ref absent → the guard speaks.
    const r = await act(deps, 'txn-c', 'accept_quote', APPLICANT, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_CREDIT_APPROVAL');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('quoted');
  });
});
