// soiling_audit — the settle gate + strategic-regulator crossing, as driven
// properties.
//
// Structural: a soiling audit can NEVER settle a recovered gain that was not
// re-measured. `settle` leaves ONLY gain_validated, whose only inbound edge is
// validate_gain from post_clean_measured. So from cleaning_in_progress (cleaning
// done but not yet re-measured) settle is an ILLEGAL_TRANSITION — the engine's
// state check refuses it before any guard runs. Failure mode guarded: someone
// widens settle's `from`, letting a claimed gain settle with no post-clean
// reading behind it.
//
// Guard: authorising a clean on a ≥100 MW strategic generator needs a regulator
// party (regulatorPresentIfStrategic, keyed off capacity_mw).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { soilingAudit } from '../../src/v2/domain/chains/soiling_audit';
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
const SUPERVISOR: Actor = { id: 'user-sup', kind: 'user', participant_id: 'party-supervisor' };
const CONTRACTOR: Actor = { id: 'user-con', kind: 'user', participant_id: 'party-contractor' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { soiling_audit: soilingAudit }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'soiling_audit', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'soiling_audit', edge: 'open', actor: OWNER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// small (non-strategic) plant — supervisor + contractor named, no regulator needed.
const baseOpen = {
  facility_id: 'FAC-KAROO-1',
  facility_name: 'Karoo Solar 1',
  capacity_mw: 45,
  supervisor_party: SUPERVISOR.participant_id,
  contractor_party: CONTRACTOR.participant_id,
};

// drive @new -> ... -> economic_assessment_done (stops BEFORE authorize_cleaning
// so the guarded edge can be exercised explicitly per test).
async function toAssessed(deps: EngineDeps, txnId: string, openInput: Record<string, unknown>) {
  await open(deps, txnId, openInput);
  expect((await act(deps, txnId, 'schedule_inspection', SUPERVISOR)).ok).toBe(true);
  expect((await act(deps, txnId, 'record_inspection', SUPERVISOR, { evidence_photo_uploaded: true })).ok).toBe(true);
  expect((await act(deps, txnId, 'measure_soiling', SUPERVISOR, { soiling_ratio_pct: 9, baseline_ratio_pct: 1 })).ok).toBe(true);
  expect((await act(deps, txnId, 'assess_economics', SUPERVISOR, { cleaning_cost_zar: 50000, zar_loss_per_day: 8000, recovery_horizon_days: 30 })).ok).toBe(true);
}

describe('soiling_audit — a gain cannot settle before it is re-measured', () => {
  it('declares settles:false (an asset-integrity control, never a payment)', () => {
    expect(soilingAudit.settles).toBe(false);
  });

  it('happy path drives @new -> settled and settle from cleaning_in_progress is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await toAssessed(deps, 'txn-s', baseOpen);
    // small plant (45 MW) — regulatorPresentIfStrategic passes trivially.
    expect((await act(deps, 'txn-s', 'authorize_cleaning', OWNER)).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('cleaning_authorized');

    // measure_soiling tiered the loss (9% -> material) and set the authority.
    const measured = (await store.getTxn('txn-s'))!.txn;
    expect(measured.fields.current_tier).toBe('material');
    expect(measured.fields.authority_required).toBe('asset_director');

    expect((await act(deps, 'txn-s', 'start_cleaning', CONTRACTOR)).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('cleaning_in_progress');

    // the graph forbids settling here — cleaning is done but NOT re-measured.
    const early = await act(deps, 'txn-s', 'settle', OWNER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('cleaning_in_progress');

    // re-measure, validate, THEN settle succeeds — and stamps settled_at.
    expect((await act(deps, 'txn-s', 'record_post_clean', SUPERVISOR, { post_clean_pr_pct: 88 })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'validate_gain', OWNER, { recovered_zar: 210000 })).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('gain_validated');
    const settled = await act(deps, 'txn-s', 'settle', OWNER);
    expect(settled.ok).toBe(true);

    const txn = (await store.getTxn('txn-s'))!.txn;
    expect(txn.state).toBe('settled');
    expect(typeof txn.fields.settled_at_sa).toBe('string');
  });

  it('dispute without a reason_code is rejected', async () => {
    const deps = newDeps();
    await open(deps, 'txn-d', baseOpen);
    expect((await act(deps, 'txn-d', 'schedule_inspection', SUPERVISOR)).ok).toBe(true);
    expect((await act(deps, 'txn-d', 'record_inspection', SUPERVISOR, { evidence_photo_uploaded: true })).ok).toBe(true);
    expect((await act(deps, 'txn-d', 'measure_soiling', SUPERVISOR, { soiling_ratio_pct: 4 })).ok).toBe(true);

    const noReason = await act(deps, 'txn-d', 'dispute', OWNER);
    expect(noReason.ok).toBe(false);
    const withReason = await act(deps, 'txn-d', 'dispute', OWNER, {}, 'measurement_contested');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-d'))!.txn.state).toBe('disputed');
  });
});

describe('soiling_audit — regulatorPresentIfStrategic gates a strategic-plant cleaning', () => {
  it('≥100 MW plant with NO regulator is refused at authorize_cleaning', async () => {
    const deps = newDeps();
    await toAssessed(deps, 'txn-big', { ...baseOpen, capacity_mw: 150 });
    const r = await act(deps, 'txn-big', 'authorize_cleaning', OWNER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-big'))!.txn.state).toBe('economic_assessment_done');
  });

  it('≥100 MW plant WITH a regulator party clears authorize_cleaning', async () => {
    const deps = newDeps();
    await toAssessed(deps, 'txn-big2', { ...baseOpen, capacity_mw: 150, regulator_party: REGULATOR_ID });
    const r = await act(deps, 'txn-big2', 'authorize_cleaning', OWNER);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-big2'))!.txn.state).toBe('cleaning_authorized');
  });
});
