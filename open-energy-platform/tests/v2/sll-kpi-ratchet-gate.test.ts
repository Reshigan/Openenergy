// sll_kpi — the structural ratchet-integrity gate, as a driven property.
//
// A margin ratchet must NEVER be computed on a KPI that was not independently
// verified and attested. This is enforced by the state graph, not a guard:
// compute_ratchet leaves ONLY kpi_attested, whose only inbound edge is attest
// from independent_verification, whose only inbound edge is verify. So from
// measurement_collected (measured but not yet verified) compute_ratchet is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds measurement_collected to
// compute_ratchet's `from`, or reorders states so a ratchet can be computed on
// an unverified KPI — a borrower then gets a margin discount on a number no
// external verifier ever saw.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { sllKpi } from '../../src/v2/domain/chains/sll_kpi';
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

const BORROWER: Actor = { id: 'user-borrower', kind: 'user', participant_id: 'party-borrower' };
const LENDER: Actor = { id: 'user-lender', kind: 'user', participant_id: 'party-lender' };
const VERIFIER: Actor = { id: 'user-verifier', kind: 'user', participant_id: 'party-verifier' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { sll_kpi: sllKpi }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'sll_kpi', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'sll_kpi', edge: 'open', actor: BORROWER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  facility_name: 'Redstone SLL facility',
  kpi_code: 'GHG-1',
  kpi_name: 'Scope 1+2 reduction',
  kpi_unit: 'pct',
  kpi_period_label: 'FY2026',
  base_margin_bps: 250,
  ratchet_step_bps: 5,
  max_ratchet_bps: 25,
  lender_party: LENDER.participant_id,
  verifier_party: VERIFIER.participant_id,
};

describe('sll_kpi — a ratchet cannot be computed before independent verification', () => {
  it('declares settles:false (a covenant control, never a payment leg)', () => {
    expect(sllKpi.settles).toBe(false);
  });

  it('drives the happy path @new -> margin_amended and forbids an early ratchet', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-s', baseOpen);
    expect((await act(deps, 'txn-s', 'set_baseline', BORROWER, { kpi_baseline_value: 100, kpi_target_value: 120 })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'collect_measurement', BORROWER, { kpi_measured_value: 130 })).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('measurement_collected');

    // the graph forbids computing a ratchet here — measured but NOT yet verified.
    const early = await act(deps, 'txn-s', 'compute_ratchet', LENDER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('measurement_collected');

    // verify → attest → compute → amend now runs clean.
    expect((await act(deps, 'txn-s', 'verify', VERIFIER, { verification_ref: 'DNV-2026-441' })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'attest', LENDER, { completeness_ref: 'TCFD-4of4' })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'compute_ratchet', LENDER)).ok).toBe(true);
    const amended = await act(deps, 'txn-s', 'amend_margin', LENDER);
    expect(amended.ok).toBe(true);

    const txn = (await store.getTxn('txn-s'))!.txn;
    expect(txn.state).toBe('margin_amended');
    // target met (measured 130 >= 120) ⇒ discount ratchet, effective margin below base.
    expect(txn.fields.ratchet_bps).toBe(-5);
    expect(txn.fields.effective_margin_bps).toBe(245);
    expect(typeof txn.fields.margin_amended_at).toBe('string');
  });

  it('attest without a completeness_ref is rejected by completenessEvidencePresent', async () => {
    const deps = newDeps();
    await open(deps, 'txn-a', baseOpen);
    await act(deps, 'txn-a', 'set_baseline', BORROWER, { kpi_baseline_value: 100, kpi_target_value: 120 });
    await act(deps, 'txn-a', 'collect_measurement', BORROWER, { kpi_measured_value: 130 });
    await act(deps, 'txn-a', 'verify', VERIFIER, { verification_ref: 'DNV-2026-441' });

    const r = await act(deps, 'txn-a', 'attest', LENDER, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-a'))!.txn.state).toBe('independent_verification');
  });
});
