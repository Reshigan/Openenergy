// ipp_schedule — the structural re-baseline gate, as a driven property.
//
// A schedule can NEVER be re-baselined before it has been baselined. This is
// enforced by the state graph, not a guard: request_rebaseline leaves ONLY
// baseline_active, and the ONLY paths into baseline_active are approve_baseline
// / approve_rebaseline. So from schedule_drafted, request_rebaseline is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds schedule_drafted (or baseline_review)
// to request_rebaseline's `from`, letting a baseline change be booked against a
// schedule that was never approved.
//
// Also pins regulatorPresentIfCritical: a critical-tier re-baseline cannot pass
// approve_rebaseline without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ippSchedule } from '../../src/v2/domain/chains/ipp_schedule';
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

const IPP: Actor = { id: 'user-ipp', kind: 'user', participant_id: 'party-ipp' };
const REVIEWER: Actor = { id: 'user-reviewer', kind: 'user', participant_id: 'party-reviewer' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { ipp_schedule: ippSchedule }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'ipp_schedule', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'ipp_schedule', edge: 'open', actor: IPP, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// a normal-tier schedule — reviewer named, no regulator needed.
const baseOpen = {
  project_name: 'Karoo Solar 75MW',
  planned_finish: '2027-06-30',
  priority: 'normal',
  baseline_ref: 'BL-001',
  reviewer_party: REVIEWER.participant_id,
};

describe('ipp_schedule — a schedule cannot be re-baselined before it is baselined', () => {
  it('declares settles:false (a construction control, never a payment)', () => {
    expect(ippSchedule.settles).toBe(false);
  });

  it('request_rebaseline from schedule_drafted is ILLEGAL_TRANSITION; happy path drives to schedule_completed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-s', baseOpen);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('schedule_drafted');

    // the graph forbids re-baselining here — no baseline exists yet.
    const early = await act(deps, 'txn-s', 'request_rebaseline', IPP, { revised_planned_finish: '2027-09-30', slip_days: 92 }, 'weather_delay');
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('schedule_drafted');

    // happy path: submit -> approve -> re-baseline once -> complete.
    expect((await act(deps, 'txn-s', 'submit_for_review', IPP, { baseline_ref: 'BL-001' })).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('baseline_review');
    expect((await act(deps, 'txn-s', 'approve_baseline', REVIEWER)).ok).toBe(true);
    let txn = (await store.getTxn('txn-s'))!.txn;
    expect(txn.state).toBe('baseline_active');
    expect(txn.fields.baseline_version).toBe(1);
    expect(typeof txn.fields.baseline_set_at).toBe('string');

    expect((await act(deps, 'txn-s', 'request_rebaseline', IPP, { revised_planned_finish: '2027-08-15', slip_days: 46 }, 'grid_connection_delay')).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('rebaseline_review');
    expect((await act(deps, 'txn-s', 'approve_rebaseline', REVIEWER)).ok).toBe(true);
    txn = (await store.getTxn('txn-s'))!.txn;
    expect(txn.state).toBe('baseline_active');
    expect(txn.fields.baseline_version).toBe(2);
    expect(txn.fields.schedule_health_band).toBe('red');

    const done = await act(deps, 'txn-s', 'complete_schedule', IPP);
    expect(done.ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('schedule_completed');
  });
});

describe('ipp_schedule — regulatorPresentIfCritical gates a critical re-baseline', () => {
  async function toActiveBaseline(deps: EngineDeps, txnId: string, openInput: Record<string, unknown>) {
    await open(deps, txnId, openInput);
    await act(deps, txnId, 'submit_for_review', IPP, { baseline_ref: 'BL-001' });
    await act(deps, txnId, 'approve_baseline', REVIEWER);
    await act(deps, txnId, 'request_rebaseline', IPP, { revised_planned_finish: '2027-09-30', slip_days: 92 }, 'force_majeure');
  }

  it('critical-tier re-baseline with NO regulator is refused at approve_rebaseline', async () => {
    const deps = newDeps();
    await toActiveBaseline(deps, 'txn-c', { ...baseOpen, priority: 'critical' });
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('rebaseline_review');

    const r = await act(deps, 'txn-c', 'approve_rebaseline', REVIEWER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('rebaseline_review');
  });

  it('critical-tier re-baseline WITH a regulator party clears approve_rebaseline', async () => {
    const deps = newDeps();
    await toActiveBaseline(deps, 'txn-c', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    const r = await act(deps, 'txn-c', 'approve_rebaseline', REVIEWER);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('baseline_active');
  });
});
