// levy_assessment — the structural settlement gate, as a driven property.
//
// A levy can NEVER be recorded settled before it has been served on the payer
// and accepted (or its objection resolved). Enforced by the state graph, not a
// guard: confirm_payment leaves ONLY payment_pending, and the ONLY paths into
// payment_pending are accept_assessment (from assessment_issued) and
// resolve_objection (from under_objection). So confirm_payment from
// assessment_issued (un-accepted) is an ILLEGAL_TRANSITION — the engine's step-4
// state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds assessment_issued (or draft_assessment)
// to confirm_payment's `from`, letting a levy settle without due process.
//
// Also pins the objection reason-code requirement: lodge_objection without a
// declared reason_code is refused (a paper trail the log must carry).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { levyAssessment } from '../../src/v2/domain/chains/levy_assessment';
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

const REGULATOR: Actor = { id: 'user-reg', kind: 'user', participant_id: 'party-regulator' };
const PAYER: Actor = { id: 'user-payer', kind: 'user', participant_id: 'party-payer' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { levy_assessment: levyAssessment }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'levy_assessment', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'levy_assessment', edge: 'open', actor: REGULATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  levy_payer_party: PAYER.participant_id,
  levy_type: 'carbon_tax',
  assessment_period: '2026-Q1',
  taxable_base: 1000,
  levy_rate: 0.144,
};

describe('levy_assessment — a levy cannot settle before it is issued and accepted', () => {
  it('declares settles:false (a regulatory determination, never a payment)', () => {
    expect(levyAssessment.settles).toBe(false);
  });

  it('confirm_payment from assessment_issued is ILLEGAL_TRANSITION (not yet accepted)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-l', baseOpen);
    const issued = await act(deps, 'txn-l', 'issue_assessment', REGULATOR);
    expect(issued.ok).toBe(true);
    expect((await store.getTxn('txn-l'))!.txn.state).toBe('assessment_issued');
    // derive computed the amount off base * rate.
    expect((await store.getTxn('txn-l'))!.txn.fields.assessment_amount).toBe(144);

    // the graph forbids settling here — the payer has not accepted.
    const early = await act(deps, 'txn-l', 'confirm_payment', REGULATOR, { payment_reference: 'PAY-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-l'))!.txn.state).toBe('assessment_issued');

    // accept first, THEN confirm succeeds — and stamps settled_at.
    expect((await act(deps, 'txn-l', 'accept_assessment', PAYER)).ok).toBe(true);
    expect((await store.getTxn('txn-l'))!.txn.state).toBe('payment_pending');
    const settled = await act(deps, 'txn-l', 'confirm_payment', REGULATOR, { payment_reference: 'PAY-1' });
    expect(settled.ok).toBe(true);

    const txn = (await store.getTxn('txn-l'))!.txn;
    expect(txn.state).toBe('levy_settled');
    expect(typeof txn.fields.issued_at).toBe('string');
    expect(typeof txn.fields.settled_at).toBe('string');
  });
});

describe('levy_assessment — lodging an objection requires a declared reason code', () => {
  it('lodge_objection without a reason_code is refused (BAD_INPUT)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-o', baseOpen);
    expect((await act(deps, 'txn-o', 'issue_assessment', REGULATOR)).ok).toBe(true);

    // no reason_code supplied → the engine rejects before state change.
    const bad = await act(deps, 'txn-o', 'lodge_objection', PAYER, { objection_grounds: 'base overstated' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-o'))!.txn.state).toBe('assessment_issued');

    // with a valid reason_code it proceeds.
    const good = await act(deps, 'txn-o', 'lodge_objection', PAYER, { objection_grounds: 'base overstated' }, 'incorrect_base');
    expect(good.ok).toBe(true);
    expect((await deps.store.getTxn('txn-o'))!.txn.state).toBe('under_objection');
  });
});
