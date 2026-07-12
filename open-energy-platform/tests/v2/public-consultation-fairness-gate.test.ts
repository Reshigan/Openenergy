// public_consultation — the structural fairness gate, as a driven property.
//
// A regulatory outcome must NEVER be published while the public comment window
// is still open. This is enforced by the state graph, not a guard: publish_outcome
// leaves ONLY under_review, and under_review is reachable ONLY via comments_closed
// → begin_review. So from open_for_comment, publish_outcome is an ILLEGAL_TRANSITION
// — the engine's step-4 state check refuses it before any input is coerced.
//
// Failure mode this guards: someone adds open_for_comment (or comments_closed) to
// publish_outcome's `from`, or collapses the review states — a regulator then
// finalises a determination before the public has been heard (a PAJA / natural
// justice breach).
//
// Also pins the requiresReason contract on cancel_consultation: a live
// consultation cannot be cancelled without a structured reason code.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { publicConsultation } from '../../src/v2/domain/chains/public_consultation';
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

const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { public_consultation: publicConsultation }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'public_consultation', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'public_consultation', edge: 'open', actor: REGULATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  subject: '2027/28 wheeling tariff methodology',
  matter_type: 'tariff',
  reference_document: 'CONSULT-2027-11',
  comment_period_days: 30,
};

describe('public_consultation — an outcome cannot publish before comments close', () => {
  it('declares settles:false (a regulatory process, never a payment)', () => {
    expect(publicConsultation.settles).toBe(false);
  });

  it('publish_outcome from open_for_comment is ILLEGAL_TRANSITION, then the happy path reaches outcome_published', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'publish', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('open_for_comment');

    // record a couple of public comments — window stays open, tally rises.
    expect((await act(deps, 'txn-c', 'record_comment', REGULATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'record_comment', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('open_for_comment');
    expect((await store.getTxn('txn-c'))!.txn.fields.comments_received).toBe(2);

    // the graph forbids publishing an outcome here — the window is still open.
    const early = await act(deps, 'txn-c', 'publish_outcome', REGULATOR, { outcome_summary: 'approved' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('open_for_comment');

    // close → review → publish: the lawful path.
    expect((await act(deps, 'txn-c', 'close_comments', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('comments_closed');
    expect((await act(deps, 'txn-c', 'begin_review', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('under_review');

    const outcome = await act(deps, 'txn-c', 'publish_outcome', REGULATOR, { outcome_summary: 'Methodology approved with amendments', determination_ref: 'DET-2027-04' });
    expect(outcome.ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('outcome_published');
    expect(typeof txn.fields.comments_closed_at).toBe('string');
    expect(typeof txn.fields.outcome_published_at).toBe('string');
  });
});

describe('public_consultation — cancel requires a structured reason', () => {
  it('cancel_consultation with no reason_code is rejected BAD_INPUT', async () => {
    const deps = newDeps();
    await open(deps, 'txn-x', baseOpen);
    expect((await act(deps, 'txn-x', 'publish', REGULATOR)).ok).toBe(true);

    const bare = await act(deps, 'txn-x', 'cancel_consultation', REGULATOR);
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-x'))!.txn.state).toBe('open_for_comment');

    const withReason = await act(deps, 'txn-x', 'cancel_consultation', REGULATOR, {}, 'legal_challenge');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-x'))!.txn.state).toBe('cancelled');
  });
});
