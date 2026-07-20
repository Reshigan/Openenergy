// ed_commitment — the due-process penalty gate, as a driven property.
//
// A REIPPPP ED commitment can NEVER be penalised unless it first passed through
// variance_flagged → cure_plan_required → cure_plan_submitted → approve_cure_plan
// (or an escalation of one of those). This is enforced by the state graph, not a
// guard: issue_penalty leaves ONLY cure_executing / escalated, and neither is
// reachable from `monitoring`. So issuing a penalty on a monitored-but-never-
// flagged project is an ILLEGAL_TRANSITION — the engine's state check refuses it
// before any guard runs.
//
// Failure mode this guards: someone adds `monitoring` (or `variance_flagged`) to
// issue_penalty's `from`, letting the authority penalise a project that was never
// given a cure opportunity — a due-process breach with real financial stakes.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { edCommitment } from '../../src/v2/domain/chains/ed_commitment';
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

const REPORTER: Actor = { id: 'user-reporter', kind: 'user', participant_id: 'party-reporter' };
const AUTHORITY: Actor = { id: 'user-authority', kind: 'user', participant_id: 'party-authority' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { ed_commitment: edCommitment }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'ed_commitment', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'ed_commitment', edge: 'open', actor: REPORTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_id: 'PRJ-77',
  project_name: 'Karoo Wind 1',
  bid_window: 'BW6',
  commitment_type: 'ownership',
  commitment_label: 'Black ownership %',
  baseline_value: 30,
  baseline_unit: 'percent',
  variance_threshold_pct: -5,
  reporting_period: '2026-Q2',
  authority_party: AUTHORITY.participant_id,
};

describe('ed_commitment — a penalty needs due process', () => {
  it('declares settles:false (a compliance control, never a payment)', () => {
    expect(edCommitment.settles).toBe(false);
  });

  it('drives the cure happy path to verified_compliant', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'begin_monitoring', AUTHORITY)).ok).toBe(true);
    // report a shortfall — 25% against a 30% baseline → -16.67% variance, breach.
    const rep = await act(deps, 'txn-e', 'report_progress', REPORTER, { current_value: 25 });
    expect(rep.ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.fields.variance_tier).toBe('breach');

    expect((await act(deps, 'txn-e', 'flag_variance', AUTHORITY, {}, 'below_threshold')).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'require_cure_plan', AUTHORITY)).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'submit_cure_plan', REPORTER, { cure_plan_summary: 'B-BBEE top-up transaction' })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'approve_cure_plan', AUTHORITY)).ok).toBe(true);
    const verified = await act(deps, 'txn-e', 'verify_compliant', AUTHORITY, { remediation_summary: 'ownership restored to 31%' });
    expect(verified.ok).toBe(true);

    const txn = (await store.getTxn('txn-e'))!.txn;
    expect(txn.state).toBe('verified_compliant');
    expect(typeof txn.fields.verified_compliant_at).toBe('string');
  });

  it('issue_penalty from monitoring is ILLEGAL_TRANSITION (no cure opportunity)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-p', baseOpen);
    expect((await act(deps, 'txn-p', 'begin_monitoring', AUTHORITY)).ok).toBe(true);
    expect((await store.getTxn('txn-p'))!.txn.state).toBe('monitoring');

    // the graph forbids penalising here — the project was never flagged/cured.
    const early = await act(deps, 'txn-p', 'issue_penalty', AUTHORITY, { penalty_amount_zar: 1_000_000 }, 'cure_failed');
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-p'))!.txn.state).toBe('monitoring');
  });

  it('rejects issue_penalty without a reason_code once in cure_executing', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    await act(deps, 'txn-r', 'begin_monitoring', AUTHORITY);
    await act(deps, 'txn-r', 'report_progress', REPORTER, { current_value: 20 });
    await act(deps, 'txn-r', 'flag_variance', AUTHORITY, {}, 'below_threshold');
    await act(deps, 'txn-r', 'require_cure_plan', AUTHORITY);
    await act(deps, 'txn-r', 'submit_cure_plan', REPORTER, { cure_plan_summary: 'plan' });
    await act(deps, 'txn-r', 'approve_cure_plan', AUTHORITY);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('cure_executing');

    // requiresReason edge with no reason_code must be refused.
    const noReason = await act(deps, 'txn-r', 'issue_penalty', AUTHORITY, { penalty_amount_zar: 500_000 });
    expect(noReason.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('cure_executing');
  });
});
