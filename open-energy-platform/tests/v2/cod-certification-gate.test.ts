// cod — the structural certification gate, as a driven property.
//
// A COD must NEVER be certified before a reliability run has actually completed.
// This is enforced by the state graph, not a guard: certify_cod leaves ONLY
// reliability_complete, and the ONLY path into reliability_complete is
// complete_reliability_run. So from commissioning_review (or reliability_run,
// mid-run) certify_cod is an ILLEGAL_TRANSITION — the engine's step-4 state
// check refuses it before any guard runs.
//
// Failure mode this guards: someone adds commissioning_review to certify_cod's
// `from`, or reorders the states so a COD can certify on an unfinished
// reliability run — and drawdown + PPA activation then fire off an unproven
// facility.
//
// Also pins completenessEvidencePresent: certify_cod cannot pass without a
// commissioning completeness evidence ref on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { cod } from '../../src/v2/domain/chains/cod';
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

const PRODUCER: Actor = { id: 'user-producer', kind: 'user', participant_id: 'party-producer' };
const CERTIFIER: Actor = { id: 'user-certifier', kind: 'user', participant_id: 'party-certifier' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { cod }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'cod', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'cod', edge: 'open', actor: PRODUCER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_name: 'Karoshoek Solar One',
  ppa_ref: 'PPA-2026-114',
  facility_capacity_mw: 100,
  technology: 'solar',
  certifier_party: CERTIFIER.participant_id,
};

describe('cod — a COD cannot certify before the reliability run completes', () => {
  it('declares settles:false (a milestone, never a payment)', () => {
    expect(cod.settles).toBe(false);
  });

  it('certify_cod before reliability_complete is ILLEGAL_TRANSITION; the happy path certifies with completeness evidence', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'begin_commissioning_review', CERTIFIER)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('commissioning_review');

    // the graph forbids certifying here — no reliability run has completed.
    const early = await act(deps, 'txn-c', 'certify_cod', CERTIFIER, { completeness_ref: 'CMP-777' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('commissioning_review');

    // run the reliability run to completion, THEN certify.
    expect((await act(deps, 'txn-c', 'start_reliability_run', CERTIFIER, { reliability_run_days: 14 })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'complete_reliability_run', CERTIFIER)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('reliability_complete');

    const certified = await act(deps, 'txn-c', 'certify_cod', CERTIFIER, { completeness_ref: 'CMP-777' });
    expect(certified.ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('cod_certified');
    expect(typeof txn.fields.run_completed_at).toBe('string');
    expect(typeof txn.fields.certified_at).toBe('string');
    expect(typeof txn.fields.effective_cod).toBe('string');
  });
});

describe('cod — completenessEvidencePresent gates certification', () => {
  it('certify_cod with NO completeness_ref is refused with MISSING_COMPLETENESS_EVIDENCE', async () => {
    const deps = newDeps();
    await open(deps, 'txn-nc', baseOpen);
    expect((await act(deps, 'txn-nc', 'begin_commissioning_review', CERTIFIER)).ok).toBe(true);
    expect((await act(deps, 'txn-nc', 'start_reliability_run', CERTIFIER, { reliability_run_days: 7 })).ok).toBe(true);
    expect((await act(deps, 'txn-nc', 'complete_reliability_run', CERTIFIER)).ok).toBe(true);

    const r = await act(deps, 'txn-nc', 'certify_cod', CERTIFIER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-nc'))!.txn.state).toBe('reliability_complete');
  });
});
