// licence_renewal — the council-decision gate, as a driven property.
//
// A licence renewal must NEVER be granted before council has the file. This is
// enforced by the state graph, not a guard: grant_renewal leaves ONLY
// renewal_decision, and the ONLY path into renewal_decision is refer_to_council.
// So from evaluation (accepted, but not yet referred) grant_renewal is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds evaluation to grant_renewal's `from`, or
// reorders the states so a renewal can be granted while it is still under
// evaluation — a licence continues without the council decision the Act requires.
//
// Also pins completenessEvidencePresent: accept_review cannot pass without a
// named completeness_ref (proof the term-compliance record was examined).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { licenceRenewal } from '../../src/v2/domain/chains/licence_renewal';
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

const HOLDER: Actor = { id: 'user-holder', kind: 'user', participant_id: 'party-holder' };
const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { licence_renewal: licenceRenewal }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'licence_renewal', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'licence_renewal', edge: 'open', actor: HOLDER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  holder_name: 'Karoo Wind (Pty) Ltd',
  existing_licence_ref: 'NERSA-GEN-0442',
  facility_ref: 'Karoo WF-1',
  licence_class: 'standard',
  activity: 'generation',
  capacity_mw: 45,
  regulator_party: REGULATOR.participant_id,
};

describe('licence_renewal — a renewal cannot be granted before council decides', () => {
  it('declares settles:false (a regulatory act, never a payment)', () => {
    expect(licenceRenewal.settles).toBe(false);
  });

  it('happy path drives open -> renewal_issued, stamping granted_at + issued_at', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-r', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'begin_review', REGULATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'accept_review', REGULATOR, { completeness_ref: 'COMP-2026-77' })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'refer_to_council', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('renewal_decision');
    expect((await act(deps, 'txn-r', 'grant_renewal', REGULATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'issue_renewal', REGULATOR)).ok).toBe(true);

    const txn = (await store.getTxn('txn-r'))!.txn;
    expect(txn.state).toBe('renewal_issued');
    expect(typeof txn.fields.granted_at).toBe('string');
    expect(typeof txn.fields.issued_at).toBe('string');
  });

  it('grant_renewal from evaluation is ILLEGAL_TRANSITION (council has not decided)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'begin_review', REGULATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'accept_review', REGULATOR, { completeness_ref: 'COMP-2026-88' })).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('evaluation');

    // the graph forbids granting here — the file has not been referred to council.
    const early = await act(deps, 'txn-e', 'grant_renewal', REGULATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('evaluation');
  });
});

describe('licence_renewal — completenessEvidencePresent gates the compliance sign-off', () => {
  it('accept_review with NO completeness_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'begin_review', REGULATOR)).ok).toBe(true);

    const r = await act(deps, 'txn-c', 'accept_review', REGULATOR); // no completeness_ref
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('compliance_review');
  });
});
