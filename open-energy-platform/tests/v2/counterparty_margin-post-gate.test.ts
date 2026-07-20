// counterparty_margin — the "no post before a call" structural gate, as a
// driven property.
//
// post_margin (the ONLY edge into the money-side terminal margin_posted_instructed)
// has a single `from`: margin_called. So collateral can never be posted straight
// off `computed` — a call must be issued first. This is enforced by the state
// graph, not a guard: firing post_margin from `computed` is an ILLEGAL_TRANSITION.
//
// Also pins the settlement-honesty stance (settles:false, RECORD ONLY) and drives
// the real happy path computed → margin_called → margin_posted_instructed.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { counterpartyMargin } from '../../src/v2/domain/chains/counterparty_margin';
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

const CLEARING: Actor = { id: 'user-clearing', kind: 'user', participant_id: 'party-clearing' };
const COUNTERPARTY_ID = 'party-counterparty';
const COUNTERPARTY: Actor = { id: 'user-cp', kind: 'user', participant_id: COUNTERPARTY_ID };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { counterparty_margin: counterpartyMargin },
    guards: GUARDS,
  };
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
    { txn_id: txnId, chain_key: 'counterparty_margin', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'counterparty_margin', edge: 'open', actor: CLEARING, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// counterparty_party makes the counterparty a live party so it can post/dispute.
const baseOpen = {
  counterparty_name: 'Acme Trading',
  counterparty_party: COUNTERPARTY_ID,
  cycle_ref: 'MC-2026-07',
  exposure_zar: 5_000_000,
  margin_requirement_zar: 750_000,
};

describe('counterparty_margin — no collateral post before a call is issued', () => {
  it('declares settles:false (records margin instruction, moves no money)', () => {
    expect(counterpartyMargin.settles).toBe(false);
  });

  it('happy path: compute → issue call → post collateral (stamps posted_at)', async () => {
    const deps = newDeps();
    const store = deps.store;

    const r0 = await open(deps, 'txn-mc', baseOpen);
    expect(r0.ok).toBe(true);
    expect((await store.getTxn('txn-mc'))!.txn.state).toBe('computed');

    const r1 = await act(deps, 'txn-mc', 'issue_call', CLEARING, { call_amount_zar: 750_000, collateral_type: 'cash' });
    expect(r1.ok).toBe(true);
    expect((await store.getTxn('txn-mc'))!.txn.state).toBe('margin_called');

    const r2 = await act(deps, 'txn-mc', 'post_margin', COUNTERPARTY, { collateral_ref: 'COLL-88', collateral_type: 'cash' });
    expect(r2.ok).toBe(true);

    const txn = (await store.getTxn('txn-mc'))!.txn;
    expect(txn.state).toBe('margin_posted_instructed');
    expect(typeof txn.fields.posted_at).toBe('string'); // derive stamped the instant
  });

  it('posting straight off computed (no call issued) is an ILLEGAL_TRANSITION, state unmoved', async () => {
    const deps = newDeps();
    await open(deps, 'txn-mc', baseOpen);

    // counterparty is a live party & on post_margin.by, so this clears authz and
    // is rejected purely by the state graph (from must be margin_called).
    const r = await act(deps, 'txn-mc', 'post_margin', COUNTERPARTY, { collateral_ref: 'COLL-88' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    expect((await deps.store.getTxn('txn-mc'))!.txn.state).toBe('computed');
  });
});
