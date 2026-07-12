// loan_transfer — the structural registration gate, as a driven property.
//
// A loan transfer must NEVER be registered before its transfer certificate is
// executed. This is enforced by the state graph, not a guard: register_transfer
// leaves ONLY transfer_executed, and the ONLY path into transfer_executed is
// execute_transfer (from cp_satisfied). So from cp_satisfied (CPs cleared but
// certificate not yet executed) register_transfer is an ILLEGAL_TRANSITION —
// the engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds cp_satisfied to register_transfer's
// `from`, or reorders states so a transfer registers on an unexecuted
// certificate — the lender-of-record flips with no signed instrument.
//
// Also pins executionEvidencePresent: execute_transfer without a board approval
// ref is rejected.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { loanTransfer } from '../../src/v2/domain/chains/loan_transfer';
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

const TRANSFEROR: Actor = { id: 'user-transferor', kind: 'user', participant_id: 'party-transferor' };
const TRANSFEREE: Actor = { id: 'user-transferee', kind: 'user', participant_id: 'party-transferee' };
const AGENT: Actor = { id: 'user-agent', kind: 'user', participant_id: 'party-agent' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { loan_transfer: loanTransfer }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'loan_transfer',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      ...(reason ? { reason_code: reason } : {}),
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'loan_transfer', edge: 'open', actor: TRANSFEROR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  facility_ref: 'FAC-REIPPPP-BW3-042',
  transfer_type: 'assignment',
  principal_amount: 250_000_000,
  transfer_price: 250_000_000,
  currency: 'ZAR',
  transferee_party: TRANSFEREE.participant_id,
  agent_party: AGENT.participant_id,
};

describe('loan_transfer — a transfer cannot register before the certificate is executed', () => {
  it('declares settles:false (a title/register event, never a payment)', () => {
    expect(loanTransfer.settles).toBe(false);
  });

  it('register_transfer from cp_satisfied is ILLEGAL_TRANSITION; execute-then-register succeeds', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-t', baseOpen);
    expect((await act(deps, 'txn-t', 'grant_consent', AGENT)).ok).toBe(true);
    expect(
      (await act(deps, 'txn-t', 'satisfy_cp', TRANSFEREE, { credit_approval_ref: 'CR-9001', cp_evidence_ref: 'CP-9001' })).ok,
    ).toBe(true);
    expect((await store.getTxn('txn-t'))!.txn.state).toBe('cp_satisfied');

    // the graph forbids registering here — the certificate is NOT yet executed.
    const early = await act(deps, 'txn-t', 'register_transfer', AGENT, { settlement_date: '2026-08-01' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-t'))!.txn.state).toBe('cp_satisfied');

    // execute first, THEN register succeeds — and stamps executed_at + registered_at.
    expect(
      (await act(deps, 'txn-t', 'execute_transfer', TRANSFEROR, { board_approval_ref: 'BRD-77', legal_counterparty_ref: 'LGL-77' })).ok,
    ).toBe(true);
    expect((await store.getTxn('txn-t'))!.txn.state).toBe('transfer_executed');

    const registered = await act(deps, 'txn-t', 'register_transfer', AGENT, { settlement_date: '2026-08-01' });
    expect(registered.ok).toBe(true);

    const txn = (await store.getTxn('txn-t'))!.txn;
    expect(txn.state).toBe('transfer_registered');
    expect(typeof txn.fields.executed_at).toBe('string');
    expect(typeof txn.fields.registered_at).toBe('string');
  });
});

describe('loan_transfer — executionEvidencePresent gates the certificate', () => {
  it('execute_transfer with no board approval ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-x', baseOpen);
    expect((await act(deps, 'txn-x', 'grant_consent', AGENT)).ok).toBe(true);
    expect(
      (await act(deps, 'txn-x', 'satisfy_cp', TRANSFEREE, { credit_approval_ref: 'CR-1', cp_evidence_ref: 'CP-1' })).ok,
    ).toBe(true);

    const r = await act(deps, 'txn-x', 'execute_transfer', TRANSFEROR, { legal_counterparty_ref: 'LGL-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_BOARD_APPROVAL');
    expect((await deps.store.getTxn('txn-x'))!.txn.state).toBe('cp_satisfied');
  });
});
