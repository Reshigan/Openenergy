// load_curtailment — the structural acknowledge gate, as a driven property.
//
// Load must NEVER be recorded as shed against a directive the consumer never
// acknowledged. Enforced by the state graph, not a guard: activate_curtailment
// leaves ONLY acknowledged, so from directive_issued it is an ILLEGAL_TRANSITION
// the engine's step-4 state check refuses before any guard runs.
//
// Failure mode this guards: someone adds directive_issued to activate_curtailment's
// `from`, letting an operator claim MW were shed on a directive that was never
// acknowledged — a phantom load-shedding record.
//
// Also pins regulatorPresentIfCritical: a critical-stage (stage ≥ 6) curtailment
// cannot activate without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { loadCurtailment } from '../../src/v2/domain/chains/load_curtailment';
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
const CONSUMER: Actor = { id: 'user-consumer', kind: 'user', participant_id: 'party-consumer' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { load_curtailment: loadCurtailment }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'load_curtailment', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'load_curtailment', edge: 'open', actor: OPERATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// normal-priority (stage 4) directive — consumer named, no regulator needed.
const baseOpen = {
  consumer_party: CONSUMER.participant_id,
  consumer_name: 'Ferro Smelter 2',
  network_zone: 'Highveld',
  shedding_stage: 4,
  mw_to_shed: 50,
  restoration_window_minutes: 30,
};

describe('load_curtailment — load cannot be shed before the directive is acknowledged', () => {
  it('declares settles:false (a grid control, never a payment)', () => {
    expect(loadCurtailment.settles).toBe(false);
  });

  it('activate_curtailment from directive_issued is ILLEGAL_TRANSITION; happy path closes out', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-lc', baseOpen);
    expect((await store.getTxn('txn-lc'))!.txn.state).toBe('directive_issued');

    // the graph forbids activating here — the consumer has not acknowledged.
    const early = await act(deps, 'txn-lc', 'activate_curtailment', CONSUMER, { mw_shed_actual: 50 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-lc'))!.txn.state).toBe('directive_issued');

    // acknowledge first, THEN the full happy path drives to a terminal close.
    expect((await act(deps, 'txn-lc', 'acknowledge', CONSUMER)).ok).toBe(true);
    expect((await store.getTxn('txn-lc'))!.txn.state).toBe('acknowledged');
    expect((await act(deps, 'txn-lc', 'activate_curtailment', CONSUMER, { mw_shed_actual: 50 })).ok).toBe(true);
    expect((await store.getTxn('txn-lc'))!.txn.state).toBe('curtailment_active');
    expect((await act(deps, 'txn-lc', 'begin_restoration', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-lc', 'complete_curtailment', OPERATOR, { mw_shed_actual: 50 })).ok).toBe(true);

    const txn = (await store.getTxn('txn-lc'))!.txn;
    expect(txn.state).toBe('curtailment_complete');
    expect(typeof txn.fields.activated_at).toBe('string');
    expect(typeof txn.fields.closed_at_lc).toBe('string');
  });

  it('cancel_directive without a reason_code is rejected', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    const r = await act(deps, 'txn-r', 'cancel_directive', OPERATOR); // no reason_code
    expect(r.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('directive_issued');
  });
});

describe('load_curtailment — regulatorPresentIfCritical gates critical-stage activation', () => {
  it('critical-stage (stage 7) curtailment with NO regulator is refused at activation', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, shedding_stage: 7 });
    expect((await act(deps, 'txn-crit', 'acknowledge', CONSUMER)).ok).toBe(true);

    const r = await act(deps, 'txn-crit', 'activate_curtailment', CONSUMER, { mw_shed_actual: 80 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('acknowledged');
  });

  it('critical-stage curtailment WITH a regulator party activates', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, shedding_stage: 7, regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-crit', 'acknowledge', CONSUMER)).ok).toBe(true);
    const r = await act(deps, 'txn-crit', 'activate_curtailment', CONSUMER, { mw_shed_actual: 80 });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('curtailment_active');
  });
});
