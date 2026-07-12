// methodology_amendment — the structural revalidation gate, as a driven property.
//
// A MAJOR (material) methodology deviation must NEVER self-approve: it can only
// reach amendment_approved via complete_revalidation, whose ONLY `from` is
// `revalidation`, itself reachable only through dna_notified → validator_assigned
// → begin_revalidation. So from major_deviation, complete_revalidation is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds major_deviation (or methodology_update)
// to complete_revalidation's `from`, letting a proponent approve a material
// amendment with no DNA notification and no independent revalidation — a direct
// over-crediting / integrity vector.
//
// Also pins completenessEvidencePresent: the validator sign-off at
// complete_revalidation is refused without a completeness-evidence ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { methodologyAmendment } from '../../src/v2/domain/chains/methodology_amendment';
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

const PROPONENT: Actor = { id: 'user-proponent', kind: 'user', participant_id: 'party-proponent' };
const VALIDATOR: Actor = { id: 'user-validator', kind: 'user', participant_id: 'party-validator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { methodology_amendment: methodologyAmendment },
    guards: GUARDS,
  };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'methodology_amendment', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'methodology_amendment', edge: 'open', actor: PROPONENT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// major-deviation request — validator + regulator (DNA) named at @new.
const baseOpen = {
  methodology_id: 'VM0038',
  methodology_version: 'v1.0',
  amendment_tier: 'major_change',
  deviation_description: 'Grid emission factor updated mid-crediting-period',
  validator_party: VALIDATOR.participant_id,
  regulator_party: REGULATOR_ID,
};

describe('methodology_amendment — a major amendment cannot approve without revalidation', () => {
  it('declares settles:false (an MRV/registry control, never a payment)', () => {
    expect(methodologyAmendment.settles).toBe(false);
  });

  it('drives the full major path to amendment_approved', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-m', baseOpen);
    expect((await act(deps, 'txn-m', 'assess_materiality', PROPONENT, { is_material: true, materiality_rationale: '>5% ER impact' })).ok).toBe(true);
    expect((await act(deps, 'txn-m', 'classify_major', PROPONENT)).ok).toBe(true);
    expect((await store.getTxn('txn-m'))!.txn.state).toBe('major_deviation');
    expect((await act(deps, 'txn-m', 'draft_update', PROPONENT, { amendment_description: 'Adopt 2026 grid EF', new_methodology_version: 'v1.1' })).ok).toBe(true);
    expect((await act(deps, 'txn-m', 'notify_dna', PROPONENT, { dna_name: 'DFFE', dna_notification_ref: 'DNA-2026-014' })).ok).toBe(true);
    expect((await act(deps, 'txn-m', 'assign_validator', PROPONENT, { validator_name: 'TÜV', validator_ref: 'VAL-77' })).ok).toBe(true);
    expect((await act(deps, 'txn-m', 'begin_revalidation', VALIDATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-m'))!.txn.state).toBe('revalidation');

    const approved = await act(deps, 'txn-m', 'complete_revalidation', VALIDATOR, { completeness_ref: 'FIND-2026-014', validator_findings: 'no material issues' });
    expect(approved.ok).toBe(true);
    const txn = (await store.getTxn('txn-m'))!.txn;
    expect(txn.state).toBe('amendment_approved');
    expect(typeof txn.fields.revalidation_started_at).toBe('string');
    expect(typeof txn.fields.approved_at).toBe('string');
  });

  it('complete_revalidation from major_deviation is ILLEGAL_TRANSITION (no revalidation yet)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-x', baseOpen);
    await act(deps, 'txn-x', 'assess_materiality', PROPONENT, { is_material: true, materiality_rationale: 'material' });
    await act(deps, 'txn-x', 'classify_major', PROPONENT);
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('major_deviation');

    // the graph forbids approving here — DNA/validator/revalidation not done.
    const early = await act(deps, 'txn-x', 'complete_revalidation', VALIDATOR, { completeness_ref: 'FIND-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('major_deviation');
  });
});

describe('methodology_amendment — completenessEvidencePresent gates the validator sign-off', () => {
  it('complete_revalidation with NO completeness_ref is refused', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    await act(deps, 'txn-c', 'assess_materiality', PROPONENT, { is_material: true, materiality_rationale: 'material' });
    await act(deps, 'txn-c', 'classify_major', PROPONENT);
    await act(deps, 'txn-c', 'draft_update', PROPONENT, { amendment_description: 'x' });
    await act(deps, 'txn-c', 'notify_dna', PROPONENT, { dna_name: 'DFFE', dna_notification_ref: 'DNA-1' });
    await act(deps, 'txn-c', 'assign_validator', PROPONENT, { validator_name: 'TÜV' });
    await act(deps, 'txn-c', 'begin_revalidation', VALIDATOR);

    // the guard rejects: no completeness-evidence ref on the sign-off.
    const r = await act(deps, 'txn-c', 'complete_revalidation', VALIDATOR, { validator_findings: 'ok' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('revalidation');
  });
});
