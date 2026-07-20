// carbon_registration — the structural validation gate, as a driven property.
//
// A carbon project must NEVER be registered before its third-party validation is
// complete. This is enforced by the state graph, not a guard: issue_registration
// leaves ONLY registration_approved, and the ONLY path into registration_approved
// is approve_registration from registry_review — which only complete_validation
// reaches. So from `validation` (accepted but not yet validated) issue_registration
// is an ILLEGAL_TRANSITION, refused by the engine's state check before any guard.
//
// Failure mode this guards: someone adds `validation` to issue_registration's
// `from`, or short-circuits the graph so a project registers on an unvalidated
// submission — a registry then mints a credit-bearing project no independent body
// ever checked, the double-counting / phantom-credit vector.
//
// Also pins completenessEvidencePresent: a project cannot pass accept_completeness
// into validation without a named completeness-evidence ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { carbonRegistration } from '../../src/v2/domain/chains/carbon_registration';
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
const REGISTRY: Actor = { id: 'user-registry', kind: 'user', participant_id: 'party-registry' };
const VALIDATOR: Actor = { id: 'user-validator', kind: 'user', participant_id: 'party-validator' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { carbon_registration: carbonRegistration }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_registration', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code: reason },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_registration', edge: 'open', actor: PROPONENT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_name: 'uMkhomazi afforestation',
  project_type: 'afforestation',
  methodology: 'AR-ACM0003',
  registry_name: 'SA National Carbon Registry',
  estimated_annual_tco2e: 12000,
  crediting_period_years: 10,
  validator_party: VALIDATOR.participant_id,
  registry_party: REGISTRY.participant_id,
};

describe('carbon_registration — a project cannot register before validation completes', () => {
  it('declares settles:false (a registry act, never a payment)', () => {
    expect(carbonRegistration.settles).toBe(false);
  });

  it('happy path drives @new -> registered, and issue_registration off validation is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;

    const opened = await open(deps, 'txn-c', baseOpen);
    expect(opened.ok).toBe(true);
    // derive computed lifetime credits purely from the two numeric fields.
    expect((await store.getTxn('txn-c'))!.txn.fields.total_estimated_tco2e).toBe(120000);

    expect((await act(deps, 'txn-c', 'begin_review', REGISTRY)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'accept_completeness', REGISTRY, { completeness_ref: 'PDD-2026-001' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('validation');

    // the graph forbids registering here — validation is not yet complete.
    const early = await act(deps, 'txn-c', 'issue_registration', REGISTRY);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('validation');

    // validate first, then the happy path completes.
    expect((await act(deps, 'txn-c', 'complete_validation', VALIDATOR, { validation_report_ref: 'VAL-RPT-77' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('registry_review');
    expect((await act(deps, 'txn-c', 'approve_registration', REGISTRY)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('registration_approved');

    const issued = await act(deps, 'txn-c', 'issue_registration', REGISTRY);
    expect(issued.ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('registered');
    expect(typeof txn.fields.validated_at).toBe('string');
    expect(typeof txn.fields.registered_at).toBe('string');
  });
});

describe('carbon_registration — completenessEvidencePresent gates the send-to-validation', () => {
  it('accept_completeness with NO completeness_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'begin_review', REGISTRY)).ok).toBe(true);

    const r = await act(deps, 'txn-e', 'accept_completeness', REGISTRY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-e'))!.txn.state).toBe('completeness_review');
  });
});
