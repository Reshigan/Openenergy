// handover_dossier — the completeness sign-off gate, as a driven property.
//
// A handover dossier must NEVER reach operations without a documented
// completeness sign-off. The graph enforces the ordering: transfer_to_operations
// leaves ONLY accepted, and the ONLY path into accepted is accept_dossier —
// which is guarded by completenessEvidencePresent (a named completeness_ref).
//
// Failure mode this guards: someone drops the guard off accept_dossier, or lets
// transfer_to_operations fire from under_review — a facility then goes live on a
// dossier that was never signed off as complete.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { handoverDossier } from '../../src/v2/domain/chains/handover_dossier';
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

const CONTRACTOR: Actor = { id: 'user-contractor', kind: 'user', participant_id: 'party-contractor' };
const OWNER: Actor = { id: 'user-owner', kind: 'user', participant_id: 'party-owner' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { handover_dossier: handoverDossier }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'handover_dossier', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'handover_dossier', edge: 'open', actor: CONTRACTOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_name: 'Karoo Solar 100MW',
  facility_name: 'Karoo PV1',
  dossier_scope: 'full',
  owner_party: OWNER.participant_id,
};

const submitInput = { document_count: 120, completeness_pct: 100, as_built_ref: 'AB-001' };

describe('handover_dossier — a dossier cannot reach operations without a completeness sign-off', () => {
  it('declares settles:false (a document-handover control, never a payment)', () => {
    expect(handoverDossier.settles).toBe(false);
  });

  it('happy path: draft -> submit -> review -> accept -> handed_over', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-hd', baseOpen);
    expect((await act(deps, 'txn-hd', 'submit_dossier', CONTRACTOR, submitInput)).ok).toBe(true);
    expect((await act(deps, 'txn-hd', 'begin_review', OWNER)).ok).toBe(true);
    expect((await act(deps, 'txn-hd', 'accept_dossier', OWNER, { completeness_ref: 'CMP-77' })).ok).toBe(true);
    expect((await store.getTxn('txn-hd'))!.txn.state).toBe('accepted');
    expect((await act(deps, 'txn-hd', 'transfer_to_operations', OWNER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-hd'))!.txn;
    expect(txn.state).toBe('handed_over');
    expect(typeof txn.fields.accepted_at).toBe('string');
    expect(typeof txn.fields.handed_over_at).toBe('string');
  });

  it('accept_dossier WITHOUT a completeness_ref is refused by completenessEvidencePresent', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-hd', baseOpen);
    expect((await act(deps, 'txn-hd', 'submit_dossier', CONTRACTOR, submitInput)).ok).toBe(true);
    expect((await act(deps, 'txn-hd', 'begin_review', OWNER)).ok).toBe(true);

    const r = await act(deps, 'txn-hd', 'accept_dossier', OWNER, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    // dossier stays under review — never crossed into accepted.
    expect((await store.getTxn('txn-hd'))!.txn.state).toBe('under_review');

    // and transfer cannot be reached from under_review (no accepted state).
    const early = await act(deps, 'txn-hd', 'transfer_to_operations', OWNER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
  });
});
