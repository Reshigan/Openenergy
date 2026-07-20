// submittal_rfi — the answered→closed document-control gate, as a driven property.
//
// An RFI must NEVER be closed without a recorded response. This is enforced by
// the state graph, not a guard: close_rfi leaves ONLY `answered`, and the ONLY
// path into `answered` is answer_rfi (by the reviewer). So from under_review,
// close_rfi is an ILLEGAL_TRANSITION — the engine's step-4 state check refuses it
// before any guard runs.
//
// Failure mode this guards: someone adds under_review (or submitted) to
// close_rfi's `from`, letting an RFI close with no documented answer — the exact
// coordination gap RFI logs exist to prevent.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { submittalRfi } from '../../src/v2/domain/chains/submittal_rfi';
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

const ORIGINATOR: Actor = { id: 'user-originator', kind: 'user', participant_id: 'party-originator' };
const REVIEWER: Actor = { id: 'user-reviewer', kind: 'user', participant_id: 'party-reviewer' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { submittal_rfi: submittalRfi }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'submittal_rfi', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'submittal_rfi', edge: 'open', actor: ORIGINATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  doc_type: 'rfi',
  subject: 'Rebar clash at grid C4',
  discipline: 'structural',
  question: 'Confirm cover to top steel where beam meets column.',
  reviewer_party: REVIEWER.participant_id,
};

describe('submittal_rfi — an RFI cannot close before it is answered', () => {
  it('declares settles:false (a coordination record, never a payment)', () => {
    expect(submittalRfi.settles).toBe(false);
  });

  it('happy path open → submitted → under_review → answered → closed', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-r', baseOpen)).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('submitted');
    expect((await act(deps, 'txn-r', 'begin_review', REVIEWER)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'answer_rfi', REVIEWER, { response_ref: 'RSP-001', disposition: 'approved_as_noted' })).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('answered');
    expect((await act(deps, 'txn-r', 'close_rfi', ORIGINATOR)).ok).toBe(true);

    const txn = (await store.getTxn('txn-r'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.answered_at).toBe('string');
    expect(typeof txn.fields.closed_at_rfi).toBe('string');
  });

  it('close_rfi from under_review is ILLEGAL_TRANSITION (no recorded answer yet)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'begin_review', REVIEWER)).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('under_review');

    const early = await act(deps, 'txn-r', 'close_rfi', ORIGINATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('under_review');
  });
});
