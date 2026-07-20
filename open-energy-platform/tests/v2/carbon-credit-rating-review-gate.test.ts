// carbon_credit_rating — the structural committee-review gate, as a driven property.
//
// A rating must NEVER be published without independent committee review. This is
// enforced by the state graph, not a guard: publish_rating leaves ONLY
// committee_review, and the ONLY path into committee_review is submit_for_review
// from under_assessment. So publishing straight out of under_assessment is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds under_assessment to publish_rating's
// `from`, letting the rater self-publish an unreviewed grade.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { carbonCreditRating } from '../../src/v2/domain/chains/carbon_credit_rating';
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

const RATER: Actor = { id: 'user-rater', kind: 'user', participant_id: 'party-rater' };
const REVIEWER: Actor = { id: 'user-reviewer', kind: 'user', participant_id: 'party-reviewer' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { carbon_credit_rating: carbonCreditRating }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_credit_rating', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_credit_rating', edge: 'open', actor: RATER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  credit_ref: 'VCS-1234 Lesotho Solar',
  methodology: 'VM0007',
  registry: 'Verra',
  reviewer_party: REVIEWER.participant_id,
};
const scores = { additionality_score: 8, permanence_score: 8, leakage_control_score: 8, cobenefits_score: 8 };

describe('carbon_credit_rating — a rating cannot publish without committee review', () => {
  it('declares settles:false (an analytical opinion, never a payment)', () => {
    expect(carbonCreditRating.settles).toBe(false);
  });

  it('drives request -> assess -> review -> published and derives the composite grade', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'begin_assessment', RATER, scores)).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.fields.rating_grade).toBe('AA'); // mean 8 -> AA
    expect((await act(deps, 'txn-r', 'submit_for_review', RATER)).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('committee_review');

    const pub = await act(deps, 'txn-r', 'publish_rating', REVIEWER);
    expect(pub.ok).toBe(true);
    const txn = (await store.getTxn('txn-r'))!.txn;
    expect(txn.state).toBe('published');
    expect(typeof txn.fields.published_at).toBe('string');
  });

  it('publish_rating from under_assessment is ILLEGAL_TRANSITION (no committee review yet)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-x', baseOpen);
    expect((await act(deps, 'txn-x', 'begin_assessment', RATER, scores)).ok).toBe(true);
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('under_assessment');

    const early = await act(deps, 'txn-x', 'publish_rating', REVIEWER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('under_assessment');
  });

  it('decline_rating without a reason_code is rejected (destructive edge needs a reason)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-d', baseOpen);
    const noReason = await act(deps, 'txn-d', 'decline_rating', RATER);
    expect(noReason.ok).toBe(false);
    const withReason = await act(deps, 'txn-d', 'decline_rating', RATER, {}, 'out_of_scope');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-d'))!.txn.state).toBe('rating_declined');
  });
});
