// project_change_order — the structural assessment gate, as a driven property.
//
// A change order must NEVER be approved before its cost/schedule impact has been
// assessed. This is enforced by the state graph, not a guard: approve_change
// leaves ONLY pending_approval, whose ONLY inbound edge is submit_for_approval,
// whose ONLY inbound is assess_impact. So from `raised` (no impact yet)
// approve_change is an ILLEGAL_TRANSITION — the engine's step-4 state check
// refuses it before any guard runs.
//
// Failure mode this guards: someone adds `raised` to approve_change's `from`, or
// wires a shortcut so a change is committed to the baseline with no priced
// impact — extra cost approved on a project no one costed.
//
// Also pins creditApprovalPresent: approving a change without a named funding /
// credit approval ref is refused at approve_change.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { projectChangeOrder } from '../../src/v2/domain/chains/project_change_order';
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

const ORIGINATOR: Actor = { id: 'user-originator', kind: 'user', participant_id: 'party-originator' };
const APPROVER: Actor = { id: 'user-approver', kind: 'user', participant_id: 'party-approver' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { project_change_order: projectChangeOrder }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'project_change_order', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'project_change_order', edge: 'open', actor: ORIGINATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_ref: 'IPP-2031',
  project_name: 'Karoo Solar One',
  change_title: 'Additional geotech piling',
  change_description: 'Rock strata deeper than survey — extra piling to array block 4',
  change_category: 'site-condition',
  baseline_cost_zar: 1_000_000_000,
  cumulative_prior_cost_zar: 0,
  cap_pct: 10,
  approver_party: APPROVER.participant_id,
};

describe('project_change_order — a change cannot be approved before impact is assessed', () => {
  it('declares settles:false (a baseline revision, never a payment)', () => {
    expect(projectChangeOrder.settles).toBe(false);
  });

  it('approve_change from raised is ILLEGAL_TRANSITION; happy path assess → submit → approve reaches approved', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('raised');

    // the graph forbids approving here — no cost impact has been assessed.
    const early = await act(deps, 'txn-c', 'approve_change', APPROVER, { credit_approval_ref: 'CR-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('raised');

    // assess first — stamps the derived cap band, then submit and approve.
    expect((await act(deps, 'txn-c', 'assess_impact', ORIGINATOR, { cost_impact_zar: 50_000_000, schedule_impact_days: 14 })).ok).toBe(true);
    const assessed = (await store.getTxn('txn-c'))!.txn;
    expect(assessed.state).toBe('assessed');
    expect(assessed.fields.cumulative_overrun_pct).toBe(5);
    expect(assessed.fields.cap_band).toBe('within_cap');
    expect(assessed.fields.revised_baseline_cost_zar).toBe(1_050_000_000);

    expect((await act(deps, 'txn-c', 'submit_for_approval', ORIGINATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('pending_approval');

    const approved = await act(deps, 'txn-c', 'approve_change', APPROVER, { credit_approval_ref: 'CR-2031-14' });
    expect(approved.ok).toBe(true);
    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('approved');
    expect(typeof txn.fields.approved_at).toBe('string');
  });
});

describe('project_change_order — creditApprovalPresent gates approval', () => {
  it('approve_change with no credit_approval_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-nc', baseOpen);
    expect((await act(deps, 'txn-nc', 'assess_impact', ORIGINATOR, { cost_impact_zar: 200_000_000 })).ok).toBe(true);
    // over-cap band surfaced (20% > 10% cap), but the approval control is the guard.
    expect((await deps.store.getTxn('txn-nc'))!.txn.fields.cap_band).toBe('over_cap');
    expect((await act(deps, 'txn-nc', 'submit_for_approval', ORIGINATOR)).ok).toBe(true);

    const r = await act(deps, 'txn-nc', 'approve_change', APPROVER, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_CREDIT_APPROVAL');
    expect((await deps.store.getTxn('txn-nc'))!.txn.state).toBe('pending_approval');
  });
});
