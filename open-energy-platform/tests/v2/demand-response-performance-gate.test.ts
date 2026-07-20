// demand_response — the structural performance gate, as a driven property.
//
// A DR incentive must NEVER be instructed before the offtaker's load was
// actually shed and metered. This is enforced by the state graph, not a guard:
// instruct_compensation leaves ONLY performance_verified, whose only inbound
// edge is verify_performance, whose only inbound edge is shed_load. So from
// `activated` (dispatch issued, nothing shed yet) verify_performance is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds `activated` to verify_performance's
// `from`, or wires instruct_compensation off an earlier state — an incentive
// then pays out on curtailment that was never delivered.
//
// Also pins regulatorPresentIfCritical: a critical grid-emergency DR call
// cannot be opened without a regulator (NERSA) on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { demandResponse } from '../../src/v2/domain/chains/demand_response';
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

const GRID: Actor = { id: 'user-grid', kind: 'user', participant_id: 'party-grid' };
const OFFTAKER: Actor = { id: 'user-offtaker', kind: 'user', participant_id: 'party-offtaker' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { demand_response: demandResponse }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'demand_response', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code: reason },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'demand_response', edge: 'open', actor: GRID, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// normal peak-clip call — offtaker named, no regulator needed.
const baseOpen = {
  dr_programme: 'real_time',
  event_date: '2026-07-12',
  requested_mw: 20,
  offtaker_name: 'Smelter A',
  offtaker_party: OFFTAKER.participant_id,
};

describe('demand_response — compensation cannot instruct before load is shed & verified', () => {
  it('declares settles:false (records a compensation instruction, moves no money)', () => {
    expect(demandResponse.settles).toBe(false);
  });

  it('verify_performance from activated is ILLEGAL_TRANSITION; happy path drives to compensated_instructed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-dr', baseOpen);
    expect((await act(deps, 'txn-dr', 'acknowledge', OFFTAKER)).ok).toBe(true);
    expect((await act(deps, 'txn-dr', 'activate', GRID, { activation_start: '2026-07-12T16:00:00Z' })).ok).toBe(true);
    expect((await store.getTxn('txn-dr'))!.txn.state).toBe('activated');

    // the graph forbids verifying here — nothing has been shed or metered yet.
    const early = await act(deps, 'txn-dr', 'verify_performance', GRID);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-dr'))!.txn.state).toBe('activated');

    // shed first, THEN verify + instruct — driving to the terminal money state.
    expect((await act(deps, 'txn-dr', 'shed_load', OFFTAKER, { actual_mw_shed: 18, metering_ref: 'M-1' })).ok).toBe(true);
    expect((await store.getTxn('txn-dr'))!.txn.state).toBe('load_shed');
    expect((await act(deps, 'txn-dr', 'verify_performance', GRID)).ok).toBe(true);
    expect((await act(deps, 'txn-dr', 'instruct_compensation', GRID, { incentive_amount_zar: 90000 })).ok).toBe(true);

    const txn = (await store.getTxn('txn-dr'))!.txn;
    expect(txn.state).toBe('compensated_instructed');
    expect(txn.fields.performance_pct).toBe(90); // 18/20 * 100
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.instructed_at).toBe('string');
  });

  it('record_non_performance without a reason_code is rejected', async () => {
    const deps = newDeps();
    await open(deps, 'txn-np', baseOpen);
    await act(deps, 'txn-np', 'acknowledge', OFFTAKER);
    await act(deps, 'txn-np', 'activate', GRID);
    const r = await act(deps, 'txn-np', 'record_non_performance', GRID); // no reason
    expect(r.ok).toBe(false);
    expect((await deps.store.getTxn('txn-np'))!.txn.state).toBe('activated');
  });
});

describe('demand_response — regulatorPresentIfCritical gates a critical call', () => {
  it('critical call with NO regulator is refused at open', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
  });

  it('critical call WITH a regulator party opens cleanly', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('called');
  });
});
