// payment_security — the structural enforcement gate, as a driven property.
//
// A payment security must NEVER be drawn before it is actually issued AND
// accepted into force. This is enforced by the state graph, not a guard:
// call_security is the ONLY edge into call_pending and it can fire ONLY from
// in_force; the only path into in_force is accept_security (← instrument_issued
// ← issue_instrument). So from security_requested, call_security is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds security_requested to call_security's
// `from`, letting a beneficiary draw on an instrument the provider never issued.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { paymentSecurity } from '../../src/v2/domain/chains/payment_security';
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

const LODGER: Actor = { id: 'user-lodger', kind: 'user', participant_id: 'party-lodger' };
const PROVIDER: Actor = { id: 'user-provider', kind: 'user', participant_id: 'party-provider' };
const BENEFICIARY: Actor = { id: 'user-beneficiary', kind: 'user', participant_id: 'party-beneficiary' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { payment_security: paymentSecurity }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'payment_security', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'payment_security', edge: 'open', actor: LODGER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// a lodged bank-guarantee backstop — provider + beneficiary named, distinct.
const baseOpen = {
  ppa_ref: 'PPA-2026-0042',
  instrument_type: 'bank_guarantee',
  backstop_amount_zar: 50_000_000,
  issuing_bank: 'Nedbank',
  validity_days: 365,
  provider_party: PROVIDER.participant_id,
  beneficiary_party: BENEFICIARY.participant_id,
};

describe('payment_security — a security cannot be drawn before it is in force', () => {
  it('declares settles:false (a credit-support instrument, never a settlement leg)', () => {
    expect(paymentSecurity.settles).toBe(false);
  });

  it('call_security from security_requested is ILLEGAL_TRANSITION; the issue→accept→release happy path drives to released', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-s', baseOpen);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('security_requested');

    // the graph forbids drawing here — nothing has been issued or accepted.
    const early = await act(deps, 'txn-s', 'call_security', BENEFICIARY, { called_amount_zar: 10_000_000 }, 'payment_default');
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('security_requested');

    // happy path: issue → accept → release, terminal, stamping timestamps.
    expect((await act(deps, 'txn-s', 'issue_instrument', PROVIDER, { instrument_number: 'BG-778' })).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('instrument_issued');
    expect((await act(deps, 'txn-s', 'accept_security', BENEFICIARY)).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('in_force');
    expect((await act(deps, 'txn-s', 'release_security', BENEFICIARY)).ok).toBe(true);

    const txn = (await store.getTxn('txn-s'))!.txn;
    expect(txn.state).toBe('released');
    expect(typeof txn.fields.issued_at).toBe('string');
    expect(typeof txn.fields.in_force_at).toBe('string');
    expect(typeof txn.fields.released_at).toBe('string');
  });

  it('call_security once in force is refused without a reason_code, accepted with one', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'issue_instrument', PROVIDER, { instrument_number: 'BG-9' })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'accept_security', BENEFICIARY)).ok).toBe(true);

    // requiresReason edge: a draw with no reason_code is rejected.
    const noReason = await act(deps, 'txn-c', 'call_security', BENEFICIARY, { called_amount_zar: 5_000_000 });
    expect(noReason.ok).toBe(false);
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('in_force');

    // with a valid reason_code the draw is admitted.
    const called = await act(deps, 'txn-c', 'call_security', BENEFICIARY, { called_amount_zar: 5_000_000 }, 'payment_default');
    expect(called.ok).toBe(true);
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('call_pending');
  });
});
