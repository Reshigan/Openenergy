// milestone_variance — the structural IE-certification gate, as a driven property.
//
// A variance report must NEVER reach a DFI without independent-engineer
// certification. This is enforced by the state graph, not a guard: submit_to_dfi
// leaves ONLY ie_certified, and the ONLY path into ie_certified is ie_certify.
// So from ie_review (submitted for certification but not yet certified)
// submit_to_dfi is an ILLEGAL_TRANSITION — the engine's state check refuses it
// before any guard runs.
//
// Failure mode this guards: someone adds ie_review (or draft) to submit_to_dfi's
// `from`, letting an uncertified variance report go straight to the lender.
//
// Also pins regulatorPresentIfCritical: a critical-priority delay escalation
// cannot fire without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { milestoneVariance } from '../../src/v2/domain/chains/milestone_variance';
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

const DEVELOPER: Actor = { id: 'user-dev', kind: 'user', participant_id: 'party-dev' };
const IE: Actor = { id: 'user-ie', kind: 'user', participant_id: 'party-ie' };
const DFI: Actor = { id: 'user-dfi', kind: 'user', participant_id: 'party-dfi' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { milestone_variance: milestoneVariance }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'milestone_variance', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'milestone_variance', edge: 'open', actor: DEVELOPER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// moderate-priority report — IE + DFI named, no regulator needed for happy path.
const baseOpen = {
  project_name: 'Karoo Solar 75MW',
  report_period: '2026-Q2',
  priority: 'moderate',
  overall_schedule_variance_days: -21,
  ie_party: IE.participant_id,
  dfi_party: DFI.participant_id,
};

describe('milestone_variance — cannot reach a DFI without IE certification', () => {
  it('declares settles:false (a governance control, never a payment)', () => {
    expect(milestoneVariance.settles).toBe(false);
  });

  it('happy path draft -> ie -> dfi -> accepted', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-h', baseOpen);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('draft');
    expect((await store.getTxn('txn-h'))!.txn.fields.variance_tier).toBe('moderate');

    expect((await act(deps, 'txn-h', 'submit_to_ie', DEVELOPER)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'ie_certify', IE, { ie_report_ref: 'IE-2026-0042' })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('ie_certified');
    expect((await act(deps, 'txn-h', 'submit_to_dfi', DEVELOPER, { dfi_submission_ref: 'DFI-SUB-9' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'accept', DFI)).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('dfi_accepted');
    expect(typeof txn.fields.ie_certified_at).toBe('string');
    expect(typeof txn.fields.dfi_submitted_at).toBe('string');
    expect(typeof txn.fields.dfi_accepted_at).toBe('string');
  });

  it('submit_to_dfi from ie_review is ILLEGAL_TRANSITION (not yet certified)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'submit_to_ie', DEVELOPER)).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('ie_review');

    // the graph forbids submitting here — the IE has NOT certified yet.
    const early = await act(deps, 'txn-g', 'submit_to_dfi', DEVELOPER, { dfi_submission_ref: 'DFI-SUB-9' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('ie_review');
  });
});

describe('milestone_variance — regulatorPresentIfCritical gates a critical delay', () => {
  it('critical-priority delay with NO regulator is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', { ...baseOpen, priority: 'critical' });
    const r = await act(deps, 'txn-c', 'report_critical_delay', DEVELOPER, { critical_delay_description: 'Grid connection slipped 6 months' }, 'grid_connection_delay');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('draft');
  });

  it('critical-priority delay WITH a regulator party escalates', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    const r = await act(deps, 'txn-c', 'report_critical_delay', DEVELOPER, { critical_delay_description: 'Grid connection slipped 6 months' }, 'grid_connection_delay');
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('critical_delay');
  });
});
