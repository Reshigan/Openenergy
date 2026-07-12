// benchmark_transition — the structural counterparty-response gate, driven.
//
// A JIBAR→ZARONIA amendment must NEVER be drafted before the counterparty has
// responded to notification. Enforced by the graph, not a guard: draft_amendment
// leaves ONLY `responded`, and the ONLY path into `responded` is the
// counterparty's record_response off `notified`. So from `classified` (or any
// pre-response state) draft_amendment is an ILLEGAL_TRANSITION — the engine's
// state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds `classified` (or `notified`) to
// draft_amendment's `from`, letting a dealer paper a bilateral benchmark change
// the other side never answered.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { benchmarkTransition } from '../../src/v2/domain/chains/benchmark_transition';
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

const DEALER: Actor = { id: 'user-dealer', kind: 'user', participant_id: 'party-dealer' };
const COUNTERPARTY: Actor = { id: 'user-cp', kind: 'user', participant_id: 'party-cp' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { benchmark_transition: benchmarkTransition }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'benchmark_transition', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'benchmark_transition', edge: 'open', actor: DEALER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  trade_ref: 'IRS-88213',
  instrument_type: 'irs',
  legacy_benchmark: 'jibar_3m',
  replacement_rate: 'compounded_zaronia_3m',
  counterparty_name: 'Nedbank Markets',
  counterparty_interbank: true,
  notional_zar: 750_000_000,
  cessation_date: '2027-06-30',
  counterparty_party: COUNTERPARTY.participant_id,
};

describe('benchmark_transition — an amendment cannot be drafted before the counterparty responds', () => {
  it('declares settles:false (a remediation record, never a payment)', () => {
    expect(benchmarkTransition.settles).toBe(false);
  });

  it('draft_amendment from classified is ILLEGAL_TRANSITION (no response yet)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-b', baseOpen);
    expect((await act(deps, 'txn-b', 'assess_impact', DEALER, { value_transfer_zar: 1_200_000 })).ok).toBe(true);
    expect((await act(deps, 'txn-b', 'classify', DEALER)).ok).toBe(true);
    expect((await store.getTxn('txn-b'))!.txn.state).toBe('classified');
    // material tier derived from R750m notional.
    expect((await store.getTxn('txn-b'))!.txn.fields.transition_tier).toBe('material');

    // the graph forbids drafting here — the counterparty has not responded.
    const early = await act(deps, 'txn-b', 'draft_amendment', DEALER, { amendment_ref: 'AMD-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-b'))!.txn.state).toBe('classified');
  });

  it('the full happy path drives @new → transitioned_clean', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-h', baseOpen);
    expect((await act(deps, 'txn-h', 'assess_impact', DEALER, { value_transfer_zar: 1_200_000 })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'classify', DEALER)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'notify_counterparty', DEALER)).ok).toBe(true);
    // only the counterparty can record the response.
    expect((await act(deps, 'txn-h', 'record_response', COUNTERPARTY, { fallback_class: 'isda_protocol' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'draft_amendment', DEALER, { amendment_ref: 'AMD-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'execute_amendment', DEALER)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'settle_vt', DEALER, { value_transfer_zar: 1_180_500 })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'confirm_clean', DEALER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('transitioned_clean');
    expect(typeof txn.fields.inventoried_at).toBe('string');
    expect(typeof txn.fields.executed_at).toBe('string');
    expect(typeof txn.fields.transitioned_at).toBe('string');
  });
});

describe('benchmark_transition — execute_amendment rejects self-dealing', () => {
  it('a transition whose counterparty IS the dealer fails counterpartyDistinct at execute', async () => {
    const deps = newDeps();
    // counterparty party == the dealer's own participant — self-dealing.
    await open(deps, 'txn-self', { ...baseOpen, counterparty_party: DEALER.participant_id });
    expect((await act(deps, 'txn-self', 'assess_impact', DEALER, { value_transfer_zar: 1 })).ok).toBe(true);
    expect((await act(deps, 'txn-self', 'classify', DEALER)).ok).toBe(true);
    expect((await act(deps, 'txn-self', 'notify_counterparty', DEALER)).ok).toBe(true);
    expect((await act(deps, 'txn-self', 'record_response', DEALER, { fallback_class: 'isda_protocol' })).ok).toBe(true);
    expect((await act(deps, 'txn-self', 'draft_amendment', DEALER, { amendment_ref: 'AMD-1' })).ok).toBe(true);

    const r = await act(deps, 'txn-self', 'execute_amendment', DEALER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF_DEALING');
    expect((await deps.store.getTxn('txn-self'))!.txn.state).toBe('amendment_drafted');
  });
});
