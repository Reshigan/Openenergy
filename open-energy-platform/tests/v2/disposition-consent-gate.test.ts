// disposition — the structural consent gate, as a driven property.
//
// A secured-asset disposition must NEVER complete before the lender grants
// consent. This is enforced by the state graph, not a guard: complete_disposition
// leaves ONLY consent_granted, and the ONLY edge into consent_granted is
// grant_consent. So from under_review (reviewed but not yet consented)
// complete_disposition is an ILLEGAL_TRANSITION — the engine's state check
// refuses it before any guard runs.
//
// Failure mode this guards: someone adds under_review to complete_disposition's
// `from`, or reorders states so a borrower can dispose secured collateral the
// lender never released.
//
// Also pins creditApprovalPresent: grant_consent without a credit_approval_ref
// is refused.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { disposition } from '../../src/v2/domain/chains/disposition';
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

const BORROWER: Actor = { id: 'user-borrower', kind: 'user', participant_id: 'party-borrower' };
const LENDER: Actor = { id: 'user-lender', kind: 'user', participant_id: 'party-lender' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { disposition }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'disposition', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'disposition', edge: 'open', actor: BORROWER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  asset_description: 'Turbine T-14 gearbox spares',
  asset_class: 'plant',
  book_value: 400_000,
  sale_consideration: 520_000,
  use_of_proceeds: 'prepay',
  lender_party: LENDER.participant_id,
};

describe('disposition — cannot complete before the lender grants consent', () => {
  it('declares settles:false (a consent record, never a payment)', () => {
    expect(disposition.settles).toBe(false);
  });

  it('complete_disposition from under_review is ILLEGAL_TRANSITION; the full happy path reaches completed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-d', baseOpen);
    expect((await act(deps, 'txn-d', 'begin_review', LENDER)).ok).toBe(true);
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('under_review');

    // the graph forbids completing here — consent has NOT been granted.
    const early = await act(deps, 'txn-d', 'complete_disposition', BORROWER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('under_review');

    // grant consent first, THEN complete succeeds — and stamps the timestamps.
    const granted = await act(deps, 'txn-d', 'grant_consent', LENDER, { credit_approval_ref: 'CC-2026-118' });
    expect(granted.ok).toBe(true);
    expect((await store.getTxn('txn-d'))!.txn.state).toBe('consent_granted');

    const done = await act(deps, 'txn-d', 'complete_disposition', BORROWER);
    expect(done.ok).toBe(true);

    const txn = (await store.getTxn('txn-d'))!.txn;
    expect(txn.state).toBe('completed');
    expect(txn.fields.disposal_result).toBe('gain');
    expect(typeof txn.fields.consent_granted_at).toBe('string');
    expect(typeof txn.fields.completed_at_disp).toBe('string');
  });
});

describe('disposition — creditApprovalPresent gates the consent', () => {
  it('grant_consent with NO credit_approval_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'begin_review', LENDER)).ok).toBe(true);

    const r = await act(deps, 'txn-g', 'grant_consent', LENDER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_CREDIT_APPROVAL');
    expect((await deps.store.getTxn('txn-g'))!.txn.state).toBe('under_review');
  });
});
