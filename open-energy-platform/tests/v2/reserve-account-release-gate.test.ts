// reserve_account — an account in shortfall cannot be released, as a driven property.
//
// A debt-service reserve account must NEVER be released back to the borrower
// while it carries an uncured shortfall. This is enforced by the state graph,
// not a guard: release_account leaves ONLY `funded`, and the only path out of
// `shortfall` back to `funded` is cure_shortfall. So from `shortfall`,
// release_account is an ILLEGAL_TRANSITION — the engine's step-4 state check
// refuses it before anything else.
//
// Failure mode this guards: someone adds `shortfall` to release_account's
// `from`, or reorders states so a reserve can be released without curing — the
// lender then loses its security while the reserve sits short.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { reserveAccount } from '../../src/v2/domain/chains/reserve_account';
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
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { reserve_account: reserveAccount }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'reserve_account', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'reserve_account', edge: 'open', actor: BORROWER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  facility_ref: 'FAC-2026-014',
  currency: 'ZAR',
  target_balance: 5_000_000,
  lender_party: LENDER.participant_id,
};

describe('reserve_account — happy path funds and releases', () => {
  it('declares settles:false (a credit control, never a payment)', () => {
    expect(reserveAccount.settles).toBe(false);
  });

  it('open -> approve -> fund -> release reaches `released`', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-r', baseOpen);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('establishment_requested');
    expect((await act(deps, 'txn-r', 'approve_establishment', LENDER)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'fund_account', BORROWER, { funded_balance: 5_000_000 })).ok).toBe(true);

    const funded = (await store.getTxn('txn-r'))!.txn;
    expect(funded.state).toBe('funded');
    expect(funded.fields.shortfall_amount).toBe(0);
    expect(typeof funded.fields.funded_at).toBe('string');

    expect((await act(deps, 'txn-r', 'release_account', LENDER)).ok).toBe(true);
    const released = (await store.getTxn('txn-r'))!.txn;
    expect(released.state).toBe('released');
    expect(typeof released.fields.released_at).toBe('string');
  });
});

describe('reserve_account — a shortfall account cannot be released', () => {
  it('release_account from `shortfall` is ILLEGAL_TRANSITION; cure first, then release', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-s', baseOpen);
    expect((await act(deps, 'txn-s', 'approve_establishment', LENDER)).ok).toBe(true);
    // fund short of target, then flag the shortfall.
    expect((await act(deps, 'txn-s', 'fund_account', BORROWER, { funded_balance: 3_000_000 })).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.fields.shortfall_amount).toBe(2_000_000);
    expect((await act(deps, 'txn-s', 'flag_shortfall', LENDER, {}, 'drawdown')).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('shortfall');

    // the graph forbids releasing here — the reserve is still short.
    const early = await act(deps, 'txn-s', 'release_account', LENDER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('shortfall');

    // flag_shortfall without a reason_code is rejected (destructive/exit discipline).
    const noReason = await act(deps, 'txn-s', 'cure_shortfall', BORROWER, { funded_balance: 5_000_000 });
    expect(noReason.ok).toBe(true); // cure needs no reason; sanity that the top-up path works
    const cured = (await store.getTxn('txn-s'))!.txn;
    expect(cured.state).toBe('funded');
    expect(cured.fields.shortfall_amount).toBe(0);
    expect(cured.fields.cure_count).toBe(1);

    // now release succeeds.
    expect((await act(deps, 'txn-s', 'release_account', LENDER)).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('released');
  });

  it('flag_shortfall without a reason_code is rejected', async () => {
    const deps = newDeps();
    await open(deps, 'txn-n', baseOpen);
    expect((await act(deps, 'txn-n', 'approve_establishment', LENDER)).ok).toBe(true);
    expect((await act(deps, 'txn-n', 'fund_account', BORROWER, { funded_balance: 3_000_000 })).ok).toBe(true);
    const r = await act(deps, 'txn-n', 'flag_shortfall', LENDER); // no reason_code
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-n'))!.txn.state).toBe('funded');
  });
});
