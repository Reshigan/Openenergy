// covenant_certificate — the verification gate, as a driven property.
//
// A compliance certificate can NEVER be affirmed compliant on the borrower's
// self-stated numbers. affirm_compliant leaves ONLY ratios_verified, and the
// ONLY path into ratios_verified is verify_ratios (from under_review). So from
// certificate_submitted, affirm_compliant is an ILLEGAL_TRANSITION — the
// engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds certificate_submitted to
// affirm_compliant's `from`, or reroutes so a certificate can go compliant
// without the lender independently verifying the ratios — the whole covenant
// control collapses to "trust the borrower's spreadsheet".

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { covenantCertificate } from '../../src/v2/domain/chains/covenant_certificate';
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

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { covenant_certificate: covenantCertificate }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'covenant_certificate', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code: reason },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'covenant_certificate', edge: 'open', actor: BORROWER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// borrower registers the obligation and names a distinct lender of record.
const baseOpen = {
  facility_name: 'Karoo Solar SPV senior facility',
  facility_tier: 'senior_secured',
  test_period: '2026-Q1',
  lender_party: LENDER.participant_id,
};

// all ratios comfortably inside their thresholds → compliant path.
const compliantRatios = { dscr_actual: 1.45, dscr_threshold: 1.2, llcr_actual: 1.6, llcr_threshold: 1.3, gearing_actual: 0.7, gearing_threshold: 0.8 };

describe('covenant_certificate — compliance cannot be affirmed before ratios are verified', () => {
  it('declares settles:false (a governance record, never a payment)', () => {
    expect(covenantCertificate.settles).toBe(false);
  });

  it('affirm_compliant from certificate_submitted is ILLEGAL_TRANSITION (ratios not yet verified)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'submit_certificate', BORROWER, compliantRatios)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('certificate_submitted');

    // the graph forbids affirming here — a human never independently verified.
    const early = await act(deps, 'txn-c', 'affirm_compliant', LENDER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('certificate_submitted');

    // review → verify → THEN affirm succeeds and reaches the compliant terminal.
    expect((await act(deps, 'txn-c', 'begin_review', LENDER)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'verify_ratios', LENDER)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('ratios_verified');
    const affirmed = await act(deps, 'txn-c', 'affirm_compliant', LENDER);
    expect(affirmed.ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('compliant');
    expect(txn.fields.any_breach).toBe(false);
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.compliant_at).toBe('string');
  });

  it('flag_breach without a reason_code is rejected (BAD_INPUT)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-b', baseOpen);
    // breaching ratios: DSCR below threshold.
    await act(deps, 'txn-b', 'submit_certificate', BORROWER, { ...compliantRatios, dscr_actual: 1.05 });
    await act(deps, 'txn-b', 'begin_review', LENDER);
    await act(deps, 'txn-b', 'verify_ratios', LENDER);
    expect((await deps.store.getTxn('txn-b'))!.txn.fields.breached_covenants).toBe('DSCR');

    const noReason = await act(deps, 'txn-b', 'flag_breach', LENDER);
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.code).toBe('BAD_INPUT');

    const withReason = await act(deps, 'txn-b', 'flag_breach', LENDER, {}, 'dscr_shortfall');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-b'))!.txn.state).toBe('breach_identified');
  });
});
