// gca — the structural execution gate, as a driven property.
//
// A grid connection agreement must NEVER be executed before the applicant has
// accepted the operator's offer. This is enforced by the state graph, not a
// guard: `execute` leaves ONLY offer_accepted, and the ONLY path into
// offer_accepted is `accept_offer`. So from offer_issued (offer on the table
// but not yet accepted) `execute` is an ILLEGAL_TRANSITION — the engine's
// step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds offer_issued to execute's `from`, or
// reorders the states so an agreement can execute on an unaccepted offer — the
// operator then commits network capacity the applicant never agreed to.
//
// Also pins regulatorPresentIfStrategic: a ≥100 MW connection cannot pass the
// connection study without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { gca } from '../../src/v2/domain/chains/gca';
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

const APPLICANT: Actor = { id: 'user-applicant', kind: 'user', participant_id: 'party-applicant' };
const OPERATOR: Actor = { id: 'user-operator', kind: 'user', participant_id: 'party-operator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { gca }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'gca', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'gca', edge: 'open', actor: APPLICANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// embedded (sub-100 MW) connection request — operator named, no regulator needed.
const baseOpen = {
  connection_point: 'Ankerlig 132kV POC-4',
  connection_type: 'generation',
  voltage_kv: 132,
  capacity_mw: 20,
  operator_party: OPERATOR.participant_id,
};

describe('gca — an agreement cannot execute before the offer is accepted', () => {
  it('declares settles:false (a network commitment, never a payment)', () => {
    expect(gca.settles).toBe(false);
  });

  it('drives the happy path @new -> connected, and blocks execute before accept', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'begin_review', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'complete_study', OPERATOR, { study_ref: 'CS-2026-01', estimated_cost_zar: 4200000 })).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'issue_offer', OPERATOR, { offer_terms_ref: 'OFFER-9', offer_validity_days: 30 })).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('offer_issued');

    // the graph forbids executing here — the offer is issued but NOT accepted.
    const early = await act(deps, 'txn-g', 'execute', OPERATOR, { board_approval_ref: 'BRD-1', legal_counterparty_ref: 'LGL-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('offer_issued');

    // accept first, THEN execute succeeds — and stamps the timestamps.
    expect((await act(deps, 'txn-g', 'accept_offer', APPLICANT)).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('offer_accepted');
    const executed = await act(deps, 'txn-g', 'execute', OPERATOR, { board_approval_ref: 'BRD-1', legal_counterparty_ref: 'LGL-1' });
    expect(executed.ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('agreement_executed');

    const energized = await act(deps, 'txn-g', 'energize', OPERATOR);
    expect(energized.ok).toBe(true);
    const txn = (await store.getTxn('txn-g'))!.txn;
    expect(txn.state).toBe('connected');
    expect(typeof txn.fields.accepted_at).toBe('string');
    expect(typeof txn.fields.executed_at).toBe('string');
    expect(typeof txn.fields.energized_at).toBe('string');
  });
});

describe('gca — regulatorPresentIfStrategic gates the connection study', () => {
  it('a 250 MW connection with NO regulator is refused at complete_study', async () => {
    const deps = newDeps();
    await open(deps, 'txn-s', { ...baseOpen, capacity_mw: 250 });
    expect((await act(deps, 'txn-s', 'begin_review', OPERATOR)).ok).toBe(true);

    const r = await act(deps, 'txn-s', 'complete_study', OPERATOR, { study_ref: 'CS-BIG', estimated_cost_zar: 90000000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('under_review');
  });

  it('a 250 MW connection WITH a regulator party clears the study', async () => {
    const deps = newDeps();
    await open(deps, 'txn-s', { ...baseOpen, capacity_mw: 250, regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-s', 'begin_review', OPERATOR)).ok).toBe(true);
    const r = await act(deps, 'txn-s', 'complete_study', OPERATOR, { study_ref: 'CS-BIG', estimated_cost_zar: 90000000 });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('study_complete');
  });
});
