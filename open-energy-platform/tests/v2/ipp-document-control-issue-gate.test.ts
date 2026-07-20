// ipp_document_control — the structural issue-for-construction gate, driven.
//
// A project document must NEVER be issued for construction before its IDC
// review completes. This is enforced by the state graph, not a guard:
// issue_for_construction leaves ONLY `approved`, and the ONLY path into
// `approved` is complete_review from `under_review`. So from `under_review`
// (routed but not yet signed off) issue_for_construction is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds `under_review` (or `document_submitted`)
// to issue_for_construction's `from`, so an unreviewed drawing goes to site.
//
// Also pins completenessEvidencePresent: complete_review cannot sign off an
// approval without the IDC completeness checklist ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ippDocumentControl } from '../../src/v2/domain/chains/ipp_document_control';
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

const ORIGINATOR: Actor = { id: 'user-orig', kind: 'user', participant_id: 'party-orig' };
const CONTROLLER: Actor = { id: 'user-ctrl', kind: 'user', participant_id: 'party-ctrl' };
const REVIEWER: Actor = { id: 'user-rev', kind: 'user', participant_id: 'party-rev' };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { ipp_document_control: ippDocumentControl },
    guards: GUARDS,
  };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'ipp_document_control', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'ipp_document_control', edge: 'open', actor: ORIGINATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  document_number: 'E-DWG-4021',
  doc_title: '33kV single line diagram',
  discipline: 'electrical',
  revision_code: 'A',
  controller_party: CONTROLLER.participant_id,
  reviewer_party: REVIEWER.participant_id,
};

describe('ipp_document_control — a document cannot issue for construction before IDC review completes', () => {
  it('declares settles:false (an assurance record, never a payment)', () => {
    expect(ippDocumentControl.settles).toBe(false);
  });

  it('issue_for_construction from under_review is ILLEGAL_TRANSITION; review-then-issue reaches terminal', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-d', baseOpen);
    expect((await act(deps, 'txn-d', 'start_review', CONTROLLER)).ok).toBe(true);
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('under_review');

    // the graph forbids issuing here — the IDC review is not yet signed off.
    const early = await act(deps, 'txn-d', 'issue_for_construction', CONTROLLER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('under_review');

    // complete review (with completeness ref), THEN issue — happy path to terminal.
    expect((await act(deps, 'txn-d', 'complete_review', REVIEWER, { completeness_ref: 'IDC-CHK-77' })).ok).toBe(true);
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('approved');
    const issued = await act(deps, 'txn-d', 'issue_for_construction', CONTROLLER);
    expect(issued.ok).toBe(true);

    const txn = (await store.getTxn('txn-d'))!.txn;
    expect(txn.state).toBe('issued_for_construction');
    expect(typeof txn.fields.reviewed_at).toBe('string');
    expect(typeof txn.fields.issued_at).toBe('string');
  });
});

describe('ipp_document_control — completenessEvidencePresent gates approval sign-off', () => {
  it('complete_review with NO completeness ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-n', baseOpen);
    expect((await act(deps, 'txn-n', 'start_review', CONTROLLER)).ok).toBe(true);

    const r = await act(deps, 'txn-n', 'complete_review', REVIEWER); // no completeness_ref
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-n'))!.txn.state).toBe('under_review');
  });
});
