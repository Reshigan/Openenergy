// security_perfection — the structural registration gate, as a driven property.
//
// A security must NEVER be declared perfected before it is registered at the
// registry. Enforced by the state graph, not a guard: confirm_perfection leaves
// ONLY perfection_review, and the ONLY path into perfection_review is
// begin_perfection_review, which fires ONLY from `registered`. So from
// `registered` (registered but review not yet begun) confirm_perfection is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it.
//
// Failure mode this guards: someone adds `registered` to confirm_perfection's
// `from`, letting a security be marked perfected on a filing that was never
// reviewed — a lender then draws a facility against unperfected collateral.
//
// Also pins completenessEvidencePresent: a perfection sign-off without a named
// legal-opinion completeness_ref is refused.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { securityPerfection } from '../../src/v2/domain/chains/security_perfection';
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

const AGENT: Actor = { id: 'user-agent', kind: 'user', participant_id: 'party-agent' };
const GRANTOR_ID = 'party-grantor';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { security_perfection: securityPerfection }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'security_perfection', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'security_perfection', edge: 'open', actor: AGENT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  borrower_name: 'Karoo Solar (Pty) Ltd',
  security_type: 'mortgage_bond',
  registry: 'deeds_office',
  secured_value_zar: 42_000_000,
  grantor_party: GRANTOR_ID,
};

// drive open -> registered
async function toRegistered(deps: EngineDeps, txnId: string) {
  await open(deps, txnId, baseOpen);
  expect((await act(deps, txnId, 'prepare_documentation', AGENT)).ok).toBe(true);
  expect((await act(deps, txnId, 'execute_instrument', AGENT, { document_ref: 'DOC-1' })).ok).toBe(true);
  expect((await act(deps, txnId, 'lodge_for_registration', AGENT, { lodgement_ref: 'LDG-1' })).ok).toBe(true);
  expect((await act(deps, txnId, 'confirm_registration', AGENT, { registration_ref: 'REG-1' })).ok).toBe(true);
  expect((await deps.store.getTxn(txnId))!.txn.state).toBe('registered');
}

describe('security_perfection — a security cannot be perfected before registration + review', () => {
  it('declares settles:false (a collateral control, never a payment)', () => {
    expect(securityPerfection.settles).toBe(false);
  });

  it('confirm_perfection from registered is ILLEGAL_TRANSITION (review not begun)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await toRegistered(deps, 'txn-s');

    // the graph forbids perfecting here — registered but review not begun.
    const early = await act(deps, 'txn-s', 'confirm_perfection', AGENT, { completeness_ref: 'LO-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('registered');

    // begin review first, THEN perfect succeeds — and stamps perfected_at.
    expect((await act(deps, 'txn-s', 'begin_perfection_review', AGENT)).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('perfection_review');
    const perfected = await act(deps, 'txn-s', 'confirm_perfection', AGENT, { completeness_ref: 'LO-1' });
    expect(perfected.ok).toBe(true);

    const txn = (await store.getTxn('txn-s'))!.txn;
    expect(txn.state).toBe('perfected');
    expect(typeof txn.fields.perfected_at_sp).toBe('string');
    expect(typeof txn.fields.registered_at_sp).toBe('string');
    expect(txn.fields.severity_tier).toBe('material');
  });
});

describe('security_perfection — completenessEvidencePresent gates the perfection sign-off', () => {
  it('confirm_perfection with NO completeness_ref is refused', async () => {
    const deps = newDeps();
    await toRegistered(deps, 'txn-nc');
    expect((await act(deps, 'txn-nc', 'begin_perfection_review', AGENT)).ok).toBe(true);

    const r = await act(deps, 'txn-nc', 'confirm_perfection', AGENT, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-nc'))!.txn.state).toBe('perfection_review');
  });
});
