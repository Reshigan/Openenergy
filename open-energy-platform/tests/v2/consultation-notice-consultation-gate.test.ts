// consultation_notice — the structural due-process gate, as a driven property.
//
// A regulator's decision must NEVER be published while the comment period is
// still open. This is enforced by the state graph, not a guard: publish_outcome
// leaves ONLY under_review, and the ONLY path into under_review is
// close_comments (from comment_open). So from comment_open, publish_outcome is
// an ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds comment_open to publish_outcome's
// `from`, or collapses the review state — a decision then lands before the
// public has been heard, which PAJA / ERA 2006 consultation forbids.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { consultationNotice } from '../../src/v2/domain/chains/consultation_notice';
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
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { consultation_notice: consultationNotice }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'consultation_notice', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'consultation_notice', edge: 'open', actor: REGULATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  notice_title: 'Retail tariff structure review 2027',
  instrument_type: 'tariff_determination',
  subject_matter: 'Proposed inclining block tariff for residential customers',
};

describe('consultation_notice — a decision cannot publish before comments close', () => {
  it('declares settles:false (a regulatory instrument, never a payment)', () => {
    expect(consultationNotice.settles).toBe(false);
  });

  it('drives draft -> comment_open -> under_review -> decision_published', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('draft');

    expect((await act(deps, 'txn-c', 'publish_notice', REGULATOR, { comment_period_days: 30 })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('comment_open');

    expect((await act(deps, 'txn-c', 'close_comments', REGULATOR, { submissions_count: 42 })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('under_review');

    const decided = await act(deps, 'txn-c', 'publish_outcome', REGULATOR, { decision_summary: 'Tariff adopted with amendments' });
    expect(decided.ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('decision_published');
    expect(typeof txn.fields.comments_closed_at).toBe('string');
    expect(typeof txn.fields.decided_at).toBe('string');
  });

  it('publish_outcome from comment_open is ILLEGAL_TRANSITION (comments still open)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-early', baseOpen);
    expect((await act(deps, 'txn-early', 'publish_notice', REGULATOR, { comment_period_days: 30 })).ok).toBe(true);
    expect((await store.getTxn('txn-early'))!.txn.state).toBe('comment_open');

    // the graph forbids publishing a decision here — the window is still open.
    const early = await act(deps, 'txn-early', 'publish_outcome', REGULATOR, { decision_summary: 'jumping the gun' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-early'))!.txn.state).toBe('comment_open');
  });
});

describe('consultation_notice — destructive exit needs a reason code', () => {
  it('cancel_consultation without a reason_code is rejected', async () => {
    const deps = newDeps();
    await open(deps, 'txn-x', baseOpen);
    expect((await act(deps, 'txn-x', 'publish_notice', REGULATOR, { comment_period_days: 30 })).ok).toBe(true);

    const bad = await act(deps, 'txn-x', 'cancel_consultation', REGULATOR);
    expect(bad.ok).toBe(false);
    expect((await deps.store.getTxn('txn-x'))!.txn.state).toBe('comment_open');

    const good = await act(deps, 'txn-x', 'cancel_consultation', REGULATOR, {}, 'legal_challenge');
    expect(good.ok).toBe(true);
    expect((await deps.store.getTxn('txn-x'))!.txn.state).toBe('cancelled');
  });
});
