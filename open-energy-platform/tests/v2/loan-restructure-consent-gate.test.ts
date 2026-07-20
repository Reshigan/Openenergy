// loan_restructure — the structural consent gate, as a driven property.
//
// A restructure must NEVER be signed on an un-consented term sheet. This is
// enforced by the state graph, not a guard: record_consent leaves ONLY
// `signing`, and record_consent can fire ONLY from `consent_solicitation`. So
// from term_sheet_signed (term sheet agreed, consent not yet solicited/recorded)
// record_consent is an ILLEGAL_TRANSITION — the engine's step-4 state check
// refuses it before any guard runs.
//
// Failure mode this guards: someone adds an earlier state to record_consent's
// `from`, or reorders states so `signing` is reachable without syndicate
// consent — the syndicate is then bound to an amendment it never voted on.
//
// Also pins creditApprovalPresent: committee_approve cannot pass without a
// named credit_approval_ref on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { loanRestructure } from '../../src/v2/domain/chains/loan_restructure';
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

const AGENT: Actor = { id: 'user-agent', kind: 'user', participant_id: 'party-agent' };
const BORROWER_ID = 'party-borrower';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { loan_restructure: loanRestructure }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'loan_restructure', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'loan_restructure', edge: 'open', actor: AGENT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  facility_name: 'Karoo Solar One senior facility',
  borrower_name: 'Karoo Solar One (RF) Pty Ltd',
  outstanding_debt_zar: 800_000_000,
  current_tier: 'material',
  trigger_reason_code: 'dscr_breach',
  borrower_party: BORROWER_ID,
};

// walk the happy path up to (but not through) the named edge.
async function drive(deps: EngineDeps, txnId: string) {
  await open(deps, txnId, baseOpen);
  expect((await act(deps, txnId, 'begin_assessment', AGENT)).ok).toBe(true);
  expect((await act(deps, txnId, 'draft_proposal', AGENT, { principal_reschedule_zar: 200_000_000, forbearance_period_months: 12 })).ok).toBe(true);
  expect((await act(deps, txnId, 'submit_to_committee', AGENT)).ok).toBe(true);
  expect((await act(deps, txnId, 'committee_approve', AGENT, { credit_approval_ref: 'CC-2026-0042' })).ok).toBe(true);
  expect((await act(deps, txnId, 'agree_terms', AGENT)).ok).toBe(true);
}

describe('loan_restructure — a restructure cannot sign without syndicate consent', () => {
  it('declares settles:false (a credit governance record, never a payment)', () => {
    expect(loanRestructure.settles).toBe(false);
  });

  it('happy path drives @new -> completed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await drive(deps, 'txn-h');
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('term_sheet_signed');
    expect((await act(deps, 'txn-h', 'draft_legal', AGENT, { legal_doc_ref: 'A&R-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'solicit_consent', AGENT, { consent_threshold_pct: 66.7, syndicate_size: 5 })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'record_consent', AGENT, { consent_majority_pct: 80, syndicate_consented: 4 })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('signing');
    expect((await act(deps, 'txn-h', 'execute_signing', AGENT, { cp_evidence_ref: 'CP-PACK-9' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'begin_monitoring', AGENT)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'complete', AGENT)).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('completed');
    expect(txn.fields.consent_majority_passed).toBe(true);
    expect(typeof txn.fields.effective_date_at).toBe('string');
    expect(typeof txn.fields.completed_at).toBe('string');
  });

  it('record_consent from term_sheet_signed is ILLEGAL_TRANSITION (consent not solicited)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await drive(deps, 'txn-g');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('term_sheet_signed');

    // the graph forbids recording consent here — consent has not been solicited.
    const early = await act(deps, 'txn-g', 'record_consent', AGENT, { consent_majority_pct: 90 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('term_sheet_signed');
  });
});

describe('loan_restructure — creditApprovalPresent gates committee approval', () => {
  it('committee_approve with NO credit_approval_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'begin_assessment', AGENT)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'draft_proposal', AGENT, { principal_reschedule_zar: 100_000_000 })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'submit_to_committee', AGENT)).ok).toBe(true);

    const r = await act(deps, 'txn-c', 'committee_approve', AGENT, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_CREDIT_APPROVAL');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('committee_review');
  });
});
