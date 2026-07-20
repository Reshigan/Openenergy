// subscription_billing — the structural dunning gate, as a driven property.
//
// An invoice must NEVER be written off before it has gone overdue. This is
// enforced by the state graph, not a guard: write_off leaves ONLY `overdue`, and
// the ONLY path into `overdue` is mark_overdue from `issued`. So from `issued`
// (an issued but not-yet-overdue invoice) write_off is an ILLEGAL_TRANSITION —
// the engine's state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds `issued` to write_off's `from`, so a
// fresh invoice is written off with no dunning trail — a revenue leak that
// bypasses collections.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { subscriptionBilling } from '../../src/v2/domain/chains/subscription_billing';
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

const OPERATOR: Actor = { id: 'user-operator', kind: 'user', participant_id: 'party-operator' };
const SUBSCRIBER_ID = 'party-subscriber';

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { subscription_billing: subscriptionBilling },
    guards: GUARDS,
  };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'subscription_billing',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      ...(reason_code ? { reason_code } : {}),
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'subscription_billing', edge: 'open', actor: OPERATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  subscriber_party: SUBSCRIBER_ID,
  plan_name: 'Exchange Pro',
  billing_period: '2026-07',
  amount_zar: 1000,
};

describe('subscription_billing — happy path bills, issues and settles a subscription', () => {
  it('declares settles:false (a billing record, never a payment rail)', () => {
    expect(subscriptionBilling.settles).toBe(false);
  });

  it('open -> issue -> record_payment drives to paid and stamps totals + paid_at', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-a', baseOpen)).ok).toBe(true);

    const drafted = (await store.getTxn('txn-a'))!.txn;
    expect(drafted.state).toBe('draft');
    // VAT + gross derived deterministically at open (15%).
    expect(drafted.fields.vat_zar).toBe(150);
    expect(drafted.fields.total_zar).toBe(1150);

    expect((await act(deps, 'txn-a', 'issue_invoice', OPERATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-a'))!.txn.state).toBe('issued');

    expect((await act(deps, 'txn-a', 'record_payment', OPERATOR, { payment_ref: 'EFT-9931' })).ok).toBe(true);
    const paid = (await store.getTxn('txn-a'))!.txn;
    expect(paid.state).toBe('paid');
    expect(typeof paid.fields.paid_at).toBe('string');
  });
});

describe('subscription_billing — an invoice cannot be written off before it is overdue', () => {
  it('write_off from issued is ILLEGAL_TRANSITION (dunning has not run)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-b', baseOpen);
    expect((await act(deps, 'txn-b', 'issue_invoice', OPERATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-b'))!.txn.state).toBe('issued');

    // the graph forbids writing off here — the invoice is issued, not overdue.
    const early = await act(deps, 'txn-b', 'write_off', OPERATOR, {}, 'uncollectable');
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-b'))!.txn.state).toBe('issued');

    // dun first, THEN write_off succeeds and stamps written_off_at.
    expect((await act(deps, 'txn-b', 'mark_overdue', OPERATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-b'))!.txn.state).toBe('overdue');
    const off = await act(deps, 'txn-b', 'write_off', OPERATOR, {}, 'uncollectable');
    expect(off.ok).toBe(true);
    const done = (await store.getTxn('txn-b'))!.txn;
    expect(done.state).toBe('written_off');
    expect(typeof done.fields.written_off_at).toBe('string');
  });

  it('write_off without a reason_code is rejected (destructive edge requires one)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'issue_invoice', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'mark_overdue', OPERATOR)).ok).toBe(true);

    const noReason = await act(deps, 'txn-c', 'write_off', OPERATOR); // no reason_code
    expect(noReason.ok).toBe(false);
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('overdue');
  });
});
