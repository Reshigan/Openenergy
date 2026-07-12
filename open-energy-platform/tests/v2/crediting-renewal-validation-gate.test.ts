// crediting_renewal — the structural validation gate, as a driven property.
//
// A crediting-period renewal must NEVER be approved before the VVB has
// re-validated the project. This is enforced by the state graph, not a guard:
// approve_renewal leaves ONLY `validated`, and the ONLY path into `validated`
// is `validate`. So from `under_reassessment` approve_renewal is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Also pins completenessEvidencePresent: the validate sign-off cannot pass
// without a named completeness-evidence ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { creditingRenewal } from '../../src/v2/domain/chains/crediting_renewal';
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
const REGISTRY: Actor = { id: 'user-registry', kind: 'user', participant_id: 'party-registry' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { crediting_renewal: creditingRenewal }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'crediting_renewal', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'crediting_renewal', edge: 'open', actor: PROPONENT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_name: 'Kuruman solar cookstoves',
  project_ref: 'VCS-1234',
  registry_name: 'Verra',
  renewal_cycle: 2,
  validator_party: VALIDATOR.participant_id,
  registry_party: REGISTRY.participant_id,
};

describe('crediting_renewal — a renewal cannot approve before validation', () => {
  it('declares settles:false (a registry control, never a payment)', () => {
    expect(creditingRenewal.settles).toBe(false);
  });

  it('happy path drives @new -> renewed, and blocks approve before validate', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'begin_reassessment', VALIDATOR, { assessment_score: 85 })).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('under_reassessment');

    // the graph forbids approving here — reassessment is not yet validated.
    const early = await act(deps, 'txn-r', 'approve_renewal', REGISTRY, { crediting_period_years: 7 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('under_reassessment');

    // validate first, THEN approve succeeds — and stamps timestamps.
    expect((await act(deps, 'txn-r', 'validate', VALIDATOR, { completeness_ref: 'DOC-9001', additionality_reassessed: true })).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('validated');
    expect((await act(deps, 'txn-r', 'approve_renewal', REGISTRY, { crediting_period_years: 7 })).ok).toBe(true);

    const txn = (await store.getTxn('txn-r'))!.txn;
    expect(txn.state).toBe('renewed');
    expect(typeof txn.fields.validated_at).toBe('string');
    expect(typeof txn.fields.renewed_at).toBe('string');
  });
});

describe('crediting_renewal — completenessEvidencePresent gates validation', () => {
  it('validate with NO completeness_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-v', baseOpen);
    expect((await act(deps, 'txn-v', 'begin_reassessment', VALIDATOR, { assessment_score: 60 })).ok).toBe(true);

    const r = await act(deps, 'txn-v', 'validate', VALIDATOR, { additionality_reassessed: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-v'))!.txn.state).toBe('under_reassessment');
  });
});
