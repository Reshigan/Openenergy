// loan_default — the enforcement anti-shortcut, as a driven property.
//
// A lender must NEVER be able to seize security straight off a fresh default.
// `enforced` is reachable ONLY via complete_enforcement, which fires ONLY from
// enforcement_pending, which is reachable ONLY via elect_enforcement — an edge
// that demands a reason code AND a credit-committee approval ref. So from
// default_declared, complete_enforcement is an ILLEGAL_TRANSITION (the engine's
// step-4 state check refuses it before any guard runs).
//
// Failure mode this guards: someone adds default_declared to complete_enforcement's
// `from`, or drops the enforcement_pending hop — a lender then enforces security
// with no recorded election, no reason, and no credit approval.
//
// Also pins that `default_declared` is terminal:false (the floor R1 correction of
// the legacy isTerminal() bug) and that elect_enforcement needs the credit ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { loanDefault } from '../../src/v2/domain/chains/loan_default';
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

const LENDER: Actor = { id: 'user-lender', kind: 'user', participant_id: 'party-lender' };
const BORROWER_ID = 'party-borrower';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { loan_default: loanDefault }, guards: GUARDS };
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
    { txn_id: txnId, chain_key: 'loan_default', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'loan_default', edge: 'open', actor: LENDER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  facility_ref: 'FAC-2021-04',
  borrower_name: 'Karoo Wind SPV',
  default_type: 'payment',
  default_amount_zar: 4_200_000,
  cure_period_days: 20,
  borrower_party: BORROWER_ID,
};

describe('loan_default — enforcement requires a recorded election, no shortcut', () => {
  it('declares settles:false (a credit-status record, never a payment)', () => {
    expect(loanDefault.settles).toBe(false);
  });

  it('a fresh default is not terminal', () => {
    expect(loanDefault.states.default_declared.terminal).toBe(false);
  });

  it('complete_enforcement from default_declared is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-d', baseOpen);
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('default_declared');

    // no shortcut: you cannot enforce without electing enforcement first.
    const early = await act(deps, 'txn-d', 'complete_enforcement', LENDER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('default_declared');

    // elect first (reason + credit approval), THEN enforcement completes.
    const elected = await act(deps, 'txn-d', 'elect_enforcement', LENDER, { credit_approval_ref: 'CC-2021-118' }, 'uncured_beyond_bar');
    expect(elected.ok).toBe(true);
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('enforcement_pending');

    const done = await act(deps, 'txn-d', 'complete_enforcement', LENDER);
    expect(done.ok).toBe(true);
    const txn = (await store.getTxn('txn-d'))!.txn;
    expect(txn.state).toBe('enforced');
    expect(loanDefault.states.enforced.terminal).toBe(true);
    expect(typeof txn.fields.enforced_at).toBe('string');
  });
});

describe('loan_default — elect_enforcement needs a credit-committee approval ref', () => {
  it('electing enforcement with no credit_approval_ref is refused (MISSING_CREDIT_APPROVAL)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-e', baseOpen);
    const r = await act(deps, 'txn-e', 'elect_enforcement', LENDER, {}, 'cure_plan_rejected');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_CREDIT_APPROVAL');
    expect((await deps.store.getTxn('txn-e'))!.txn.state).toBe('default_declared');
  });
});
