// project_risk — the structural methodology gate, as a driven property.
//
// A project risk must NEVER be quantified (SRA / EMV computed) before it has
// been qualitatively assessed. This is enforced by the state graph, not a
// guard: quantify_risk leaves ONLY `assessed`, and the ONLY path into
// `assessed` is assess_risk. So from `identified` quantify_risk is an
// ILLEGAL_TRANSITION — the engine's state check refuses it before any input
// coercion or guard runs.
//
// Failure mode this guards: someone adds `identified` to quantify_risk's `from`
// (or reorders the states), letting a risk carry a false EMV envelope built on
// P×I bands that were never established — a mis-priced contingency drawdown.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { projectRisk } from '../../src/v2/domain/chains/project_risk';
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

const OWNER: Actor = { id: 'user-owner', kind: 'user', participant_id: 'party-owner' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { project_risk: projectRisk }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'project_risk',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      ...(reason ? { reason_code: reason } : {}),
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'project_risk', edge: 'open', actor: OWNER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_id: 'PRJ-77',
  project_name: 'Kuruman Solar Phase 2',
  risk_class: 'cost_overrun',
  risk_title: 'MV cable price escalation',
  risk_tier: 'high',
};

describe('project_risk — a risk cannot be quantified before it is assessed', () => {
  it('declares settles:false (a governance control, never a payment)', () => {
    expect(projectRisk.settles).toBe(false);
  });

  it('drives the happy path identified → … → closed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-r', baseOpen);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('identified');

    expect((await act(deps, 'txn-r', 'assess_risk', OWNER, { probability_pct: 70, worst_case_cost_impact_zar: 12_000_000 })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'quantify_risk', OWNER, { cost_most_likely_zar: 8_000_000 })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'plan_response', OWNER, { response_strategy: 'mitigate', response_action: 'lock forward FX + framework price' })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'activate_response', OWNER)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'begin_monitoring', OWNER, { response_effectiveness_pct: 60 })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'close_risk', OWNER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-r'))!.txn;
    expect(txn.state).toBe('closed');
    // derive stamped the computed envelope + timestamps deterministically
    expect(txn.fields.risk_score).toBe(4 * 4); // probBand(70)=4, impactBand(12M)=4
    expect(txn.fields.emv_zar).toBe(0.7 * 8_000_000);
    expect(typeof txn.fields.quantified_at).toBe('string');
    expect(typeof txn.fields.closed_at_risk).toBe('string');
  });

  it('quantify_risk from identified is ILLEGAL_TRANSITION (not yet assessed)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-early', baseOpen);
    expect((await store.getTxn('txn-early'))!.txn.state).toBe('identified');

    const early = await act(deps, 'txn-early', 'quantify_risk', OWNER, { cost_most_likely_zar: 8_000_000 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    // state untouched — the graph refused before any field write
    const txn = (await store.getTxn('txn-early'))!.txn;
    expect(txn.state).toBe('identified');
    expect(txn.fields.emv_zar).toBeUndefined();
  });

  it('withdraw without a reason_code is rejected (requiresReason edge)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-w', baseOpen);
    const noReason = await act(deps, 'txn-w', 'withdraw', OWNER);
    expect(noReason.ok).toBe(false);
    const withReason = await act(deps, 'txn-w', 'withdraw', OWNER, {}, 'duplicate');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-w'))!.txn.state).toBe('withdrawn');
  });
});
