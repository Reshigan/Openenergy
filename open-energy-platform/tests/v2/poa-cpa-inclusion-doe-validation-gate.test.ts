// poa_cpa_inclusion — the structural DOE-validation gate, as a driven property.
//
// A CPA must NEVER be included into a PoA before it passes DOE validation.
// This is enforced by the state graph, not a guard: confirm_inclusion leaves
// ONLY doe_validation, and the ONLY path into doe_validation is
// accept_eligibility. So from eligibility_screening (eligible but not yet
// DOE-validated) confirm_inclusion is an ILLEGAL_TRANSITION — the engine's
// step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds eligibility_screening to
// confirm_inclusion's `from`, letting a CPA be included with no DOE validation —
// carbon credits then flow from a project that was never validated.
//
// Also pins completenessEvidencePresent: confirm_inclusion cannot fire without a
// named validation-completeness ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { poaCpaInclusion } from '../../src/v2/domain/chains/poa_cpa_inclusion';
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

const COORDINATOR: Actor = { id: 'user-coordinator', kind: 'user', participant_id: 'party-coordinator' };
const VALIDATOR: Actor = { id: 'user-validator', kind: 'user', participant_id: 'party-validator' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { poa_cpa_inclusion: poaCpaInclusion }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'poa_cpa_inclusion', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code: reason },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'poa_cpa_inclusion', edge: 'open', actor: COORDINATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  cpa_name: 'Msunduzi rooftop solar cluster',
  poa_ref: 'PoA-ZA-0042',
  technology_type: 'solar_pv',
  methodology_ref: 'AMS-I.D',
  validator_party: VALIDATOR.participant_id,
};

describe('poa_cpa_inclusion — a CPA cannot be included before DOE validation', () => {
  it('declares settles:false (a registry/eligibility control, never a payment)', () => {
    expect(poaCpaInclusion.settles).toBe(false);
  });

  it('confirm_inclusion from eligibility_screening is ILLEGAL_TRANSITION; the happy path reaches included', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'begin_screening', VALIDATOR, { eligibility_criteria_ref: 'EC-2026-1' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('eligibility_screening');

    // the graph forbids inclusion here — eligible but NOT DOE-validated.
    const early = await act(deps, 'txn-c', 'confirm_inclusion', VALIDATOR, { completeness_ref: 'VAL-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('eligibility_screening');

    // refer to DOE first, THEN include — and stamp included_at.
    expect((await act(deps, 'txn-c', 'accept_eligibility', VALIDATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('doe_validation');
    const included = await act(deps, 'txn-c', 'confirm_inclusion', VALIDATOR, { completeness_ref: 'VAL-1' });
    expect(included.ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('included');
    expect(typeof txn.fields.eligibility_confirmed_at).toBe('string');
    expect(typeof txn.fields.included_at).toBe('string');
  });
});

describe('poa_cpa_inclusion — completenessEvidencePresent gates the inclusion', () => {
  it('confirm_inclusion with NO completeness ref is refused at doe_validation', async () => {
    const deps = newDeps();
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'begin_screening', VALIDATOR, { eligibility_criteria_ref: 'EC-2026-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'accept_eligibility', VALIDATOR)).ok).toBe(true);

    const r = await act(deps, 'txn-e', 'confirm_inclusion', VALIDATOR, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-e'))!.txn.state).toBe('doe_validation');
  });
});
