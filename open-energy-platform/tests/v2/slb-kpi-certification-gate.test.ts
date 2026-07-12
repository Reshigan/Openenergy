// slb_kpi — the certification integrity gate, as a driven property.
//
// An SLB coupon ratchet must NEVER be certified (and so never applied) on an
// unverified, self-reported KPI number. This is enforced by the state graph, not
// a guard: certify_kpi leaves ONLY kpi_verification, and the ONLY path into
// kpi_verification is submit_for_verification. So from kpi_measurement (actual
// recorded but NOT yet submitted to the verifier) certify_kpi is an
// ILLEGAL_TRANSITION — the engine's state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds kpi_measurement to certify_kpi's `from`,
// letting the issuer self-certify and trigger a coupon step-down with no
// independent assurance.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { slbKpi } from '../../src/v2/domain/chains/slb_kpi';
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

const ISSUER: Actor = { id: 'user-issuer', kind: 'user', participant_id: 'party-issuer' };
const VERIFIER: Actor = { id: 'user-verifier', kind: 'user', participant_id: 'party-verifier' };
const ARRANGER: Actor = { id: 'user-arranger', kind: 'user', participant_id: 'party-arranger' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { slb_kpi: slbKpi }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'slb_kpi', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'slb_kpi', edge: 'open', actor: ISSUER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// verifier + arranger named at open so they can act on later edges (rule 4).
const baseOpen = {
  slb_ref: 'ZAG000-SLB-2026',
  slb_tier: 'listed',
  kpi_period: '2026-Q2',
  kpi_name: 'Renewable energy percentage',
  kpi_unit: '%',
  kpi_target_value: 65,
  verifier_party: VERIFIER.participant_id,
  arranger_party: ARRANGER.participant_id,
};

describe('slb_kpi — a KPI cannot be certified before independent verification', () => {
  it('declares settles:false (a financing-term adjustment, never a payment)', () => {
    expect(slbKpi.settles).toBe(false);
  });

  it('certify_kpi from kpi_measurement is ILLEGAL_TRANSITION (not yet submitted to verifier)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-k', baseOpen);
    expect((await act(deps, 'txn-k', 'begin_measurement', ISSUER, { kpi_actual_value: 71, kpi_data_source: 'metering' })).ok).toBe(true);
    expect((await store.getTxn('txn-k'))!.txn.state).toBe('kpi_measurement');

    // the graph forbids self-certifying here — no verifier has seen the number.
    const early = await act(deps, 'txn-k', 'certify_kpi', VERIFIER, { kpi_met: true, completeness_ref: 'ASSUR-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-k'))!.txn.state).toBe('kpi_measurement');

    // submit first, THEN certify succeeds and stamps certified_at.
    expect((await act(deps, 'txn-k', 'submit_for_verification', ISSUER, { verifier_name: 'DNV' })).ok).toBe(true);
    expect((await store.getTxn('txn-k'))!.txn.state).toBe('kpi_verification');
    const certified = await act(deps, 'txn-k', 'certify_kpi', VERIFIER, { kpi_met: true, completeness_ref: 'ASSUR-1', verifier_report_ref: 'RPT-9' });
    expect(certified.ok).toBe(true);
    const txn = (await store.getTxn('txn-k'))!.txn;
    expect(txn.state).toBe('kpi_certified');
    expect(typeof txn.fields.certified_at).toBe('string');
  });

  it('happy path drives @new -> ratchet_applied and derives step_down for a beaten KPI', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-h', baseOpen);
    expect((await act(deps, 'txn-h', 'begin_measurement', ISSUER, { kpi_actual_value: 71 })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'submit_for_verification', ISSUER, { verifier_name: 'DNV' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'certify_kpi', VERIFIER, { kpi_met: true, completeness_ref: 'ASSUR-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'calculate_ratchet', ARRANGER, { ratchet_basis_points: 25 })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.fields.ratchet_direction).toBe('step_down');
    expect((await act(deps, 'txn-h', 'agree_ratchet', ARRANGER)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'apply_ratchet', ARRANGER)).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('ratchet_applied');
  });

  it('certify_kpi with no assurance ref is refused by completenessEvidencePresent', async () => {
    const deps = newDeps();
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'begin_measurement', ISSUER, { kpi_actual_value: 40 })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'submit_for_verification', ISSUER, { verifier_name: 'DNV' })).ok).toBe(true);
    const r = await act(deps, 'txn-e', 'certify_kpi', VERIFIER, { kpi_met: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-e'))!.txn.state).toBe('kpi_verification');
  });
});
