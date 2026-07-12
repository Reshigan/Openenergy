// sseg_registration — the structural grid-safety gate, as a driven property.
//
// A Small-Scale Embedded Generator must NEVER be registered (grid-connected /
// energised) before it is physically inspected. This is enforced by the state
// graph, not a guard: `commission` leaves ONLY `commissioning`, and the ONLY
// path into `commissioning` is `submit_coc` from `approved`. So from `approved`
// (approved-to-install but not yet commissioned) `commission` is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds `approved` to commission's `from`, or
// collapses commissioning, letting a generator register on an uninspected
// installation — live plant back-feeds the network without a CoC or meter.
//
// Also pins completenessEvidencePresent: an application cannot pass
// complete_review into technical review without a named completeness ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ssegRegistration } from '../../src/v2/domain/chains/sseg_registration';
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

const APPLICANT: Actor = { id: 'user-applicant', kind: 'user', participant_id: 'party-applicant' };
const DISTRIBUTOR: Actor = { id: 'user-distributor', kind: 'user', participant_id: 'party-distributor' };
const INSPECTOR: Actor = { id: 'user-inspector', kind: 'user', participant_id: 'party-inspector' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { sseg_registration: ssegRegistration }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'sseg_registration', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'sseg_registration', edge: 'open', actor: APPLICANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// rooftop-PV SSEG application — distributor + inspector named at open.
const baseOpen = {
  premises_address: '12 Marine Dr, Cape Town',
  generator_type: 'solar_pv',
  installed_capacity_kva: 8,
  installed_capacity_kw: 8,
  distributor_party: DISTRIBUTOR.participant_id,
  inspector_party: INSPECTOR.participant_id,
};

describe('sseg_registration — a generator cannot register before it is commissioned', () => {
  it('declares settles:false (a connection authorisation, never a payment)', () => {
    expect(ssegRegistration.settles).toBe(false);
  });

  it('drives the happy path @new -> registered and blocks commission-before-inspection', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-s', baseOpen);
    expect((await act(deps, 'txn-s', 'begin_review', DISTRIBUTOR)).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'complete_review', DISTRIBUTOR, { completeness_ref: 'DOC-4417' })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'approve_install', DISTRIBUTOR, { nrs_compliant: true })).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('approved');

    // the graph forbids registering here — approved to install, NOT inspected.
    const early = await act(deps, 'txn-s', 'commission', INSPECTOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('approved');

    // submit CoC first, THEN commission succeeds — and stamps registered_at.
    expect((await act(deps, 'txn-s', 'submit_coc', APPLICANT, { coc_reference: 'COC-991', meter_type: 'bidirectional' })).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('commissioning');
    const done = await act(deps, 'txn-s', 'commission', INSPECTOR);
    expect(done.ok).toBe(true);

    const txn = (await store.getTxn('txn-s'))!.txn;
    expect(txn.state).toBe('registered');
    expect(typeof txn.fields.commissioned_at).toBe('string');
    expect(typeof txn.fields.registered_at).toBe('string');
  });
});

describe('sseg_registration — completenessEvidencePresent gates the completeness sign-off', () => {
  it('complete_review with NO completeness ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'begin_review', DISTRIBUTOR)).ok).toBe(true);

    const r = await act(deps, 'txn-c', 'complete_review', DISTRIBUTOR, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('under_review');
  });
});
