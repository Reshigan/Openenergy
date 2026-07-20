// transmission_outage — the structural N-1 security gate, as a driven property.
//
// An outage must NEVER be approved on plant whose N-1 contingency was never run.
// This is enforced by the state graph, not a guard: approve_outage leaves ONLY
// reliability_committee_review, and the ONLY path into that state runs through
// run_n1_contingency → convene_committee. So from outage_requested (or
// security_assessment) approve_outage is an ILLEGAL_TRANSITION — the engine's
// step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds an early state to approve_outage's
// `from`, or lets convene_committee fire before N-1 — the operator could then
// green-light a switching that leaves the grid non-secure.
//
// Also pins regulatorPresentIfCritical: a 400kV+ (critical-tier) outage cannot
// pass approve_outage without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { transmissionOutage } from '../../src/v2/domain/chains/transmission_outage';
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

const PLANNER: Actor = { id: 'user-planner', kind: 'user', participant_id: 'party-planner' };
const OPERATOR: Actor = { id: 'user-operator', kind: 'user', participant_id: 'party-operator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { transmission_outage: transmissionOutage }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'transmission_outage', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'transmission_outage', edge: 'open', actor: PLANNER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// medium-tier (132kV) outage — operator named, no regulator needed.
const baseOpen = {
  asset_id: 'LINE-132-AB',
  asset_label: 'Alpha–Bravo 132kV line 1',
  transmission_voltage_kv: 132,
  corridor_name: 'Alpha–Bravo corridor',
  outage_type: 'planned',
  operator_party: OPERATOR.participant_id,
};

describe('transmission_outage — an outage cannot be approved before N-1 contingency is run', () => {
  it('declares settles:false (a reliability control, never a payment)', () => {
    expect(transmissionOutage.settles).toBe(false);
  });

  it('approve_outage before N-1 is ILLEGAL_TRANSITION; the full path drives to archived', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-o', baseOpen);
    expect((await act(deps, 'txn-o', 'run_security_assessment', OPERATOR, { security_margin_pct: 22 })).ok).toBe(true);
    expect((await store.getTxn('txn-o'))!.txn.state).toBe('security_assessment');

    // the graph forbids approving here — N-1 contingency has NOT been run.
    const early = await act(deps, 'txn-o', 'approve_outage', OPERATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-o'))!.txn.state).toBe('security_assessment');

    // run N-1, convene, THEN approve succeeds — and stamps approved_at.
    expect((await act(deps, 'txn-o', 'run_n1_contingency', OPERATOR, { n1_pass_count: 8, n1_fail_count: 0 })).ok).toBe(true);
    expect((await act(deps, 'txn-o', 'convene_committee', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-o', 'approve_outage', OPERATOR)).ok).toBe(true);

    let txn = (await store.getTxn('txn-o'))!.txn;
    expect(txn.state).toBe('outage_approved');
    expect(txn.fields.tier).toBe('medium_132kv');
    expect(typeof txn.fields.security_assessment_at).toBe('string');
    expect(typeof txn.fields.approved_at).toBe('string');

    // rest of the happy path through to a terminal state.
    expect((await act(deps, 'txn-o', 'open_window', PLANNER)).ok).toBe(true);
    expect((await act(deps, 'txn-o', 'begin_outage', PLANNER)).ok).toBe(true);
    expect((await act(deps, 'txn-o', 'complete_outage', PLANNER)).ok).toBe(true);
    expect((await act(deps, 'txn-o', 'return_to_service', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-o', 'post_review', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-o', 'archive', OPERATOR)).ok).toBe(true);

    txn = (await store.getTxn('txn-o'))!.txn;
    expect(txn.state).toBe('archived');
    expect(typeof txn.fields.archived_at).toBe('string');
  });
});

describe('transmission_outage — regulatorPresentIfCritical gates the approval', () => {
  async function walkToReview(deps: EngineDeps, txnId: string, openInput: Record<string, unknown>) {
    await open(deps, txnId, openInput);
    expect((await act(deps, txnId, 'run_security_assessment', OPERATOR, { security_margin_pct: 9 })).ok).toBe(true);
    expect((await act(deps, txnId, 'run_n1_contingency', OPERATOR, { n1_pass_count: 6, n1_fail_count: 1 })).ok).toBe(true);
    expect((await act(deps, txnId, 'convene_committee', OPERATOR)).ok).toBe(true);
  }

  // critical tier = 400kV+ — priority derived to 'critical' at assessment.
  const criticalOpen = { ...baseOpen, asset_id: 'LINE-400-XY', transmission_voltage_kv: 400 };

  it('critical-tier outage with NO regulator is refused at approve_outage', async () => {
    const deps = newDeps();
    await walkToReview(deps, 'txn-crit', criticalOpen);
    expect((await deps.store.getTxn('txn-crit'))!.txn.fields.priority).toBe('critical');

    const r = await act(deps, 'txn-crit', 'approve_outage', OPERATOR);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('reliability_committee_review');
  });

  it('critical-tier outage WITH a regulator party clears approval', async () => {
    const deps = newDeps();
    await walkToReview(deps, 'txn-crit', { ...criticalOpen, regulator_party: REGULATOR_ID });
    const r = await act(deps, 'txn-crit', 'approve_outage', OPERATOR);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('outage_approved');
  });
});
