// green_bond — the structural disclosure gate, as a driven property.
//
// A green-bond impact report must NEVER be published before the JSE approves
// it. This is enforced by the state graph, not a guard: publish leaves ONLY
// `approved`, and the ONLY path into `approved` is approve_report from JSE
// review. So from under_review (submitted, in review, but not yet approved)
// publish is an ILLEGAL_TRANSITION — the engine's step-4 state check refuses it
// before any guard runs.
//
// Failure mode this guards: someone adds under_review to publish's `from`, or
// reorders states so a report can publish on an un-approved filing — investors
// then read impact numbers the exchange never cleared.
//
// Also pins completenessEvidencePresent: the reviewer's certification cannot
// reach board sign-off without a completeness_ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { greenBond } from '../../src/v2/domain/chains/green_bond';
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

const ISSUER: Actor = { id: 'user-issuer', kind: 'user', participant_id: 'party-issuer' };
const REVIEWER: Actor = { id: 'user-reviewer', kind: 'user', participant_id: 'party-reviewer' };
const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { green_bond: greenBond }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'green_bond',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      ...(reason ? { reason_code: reason } : {}),
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'green_bond', edge: 'open', actor: ISSUER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  bond_isin: 'ZAG000012345',
  bond_class: 'project',
  report_year: 2025,
  issuance_size_zar: 1_500_000_000,
  reviewer_party: REVIEWER.participant_id,
  regulator_party: REGULATOR.participant_id,
};

describe('green_bond — a report cannot publish before the JSE approves it', () => {
  it('declares settles:false (a disclosure filing, never a payment)', () => {
    expect(greenBond.settles).toBe(false);
  });

  it('publish from under_review is ILLEGAL_TRANSITION; happy path reaches published', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'begin_gathering', ISSUER)).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'calculate_impact', ISSUER, { kwh_generated: 1000, carbon_avoided_tco2e: 1 })).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'commission_review', ISSUER, { external_reviewer: 'DNV', review_type: 'verification' })).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'certify_review', REVIEWER, { completeness_ref: 'SPO-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'approve_board', ISSUER, { board_resolution_ref: 'BR-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'begin_jse_review', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('under_review');

    // the graph forbids publishing here — the JSE has not approved yet.
    const early = await act(deps, 'txn-g', 'publish', ISSUER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('under_review');

    // approve first, THEN publish succeeds — and stamps published_at.
    expect((await act(deps, 'txn-g', 'approve_report', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('approved');
    const published = await act(deps, 'txn-g', 'publish', ISSUER);
    expect(published.ok).toBe(true);

    const txn = (await store.getTxn('txn-g'))!.txn;
    expect(txn.state).toBe('published');
    expect(typeof txn.fields.jse_approved_at).toBe('string');
    expect(typeof txn.fields.published_at).toBe('string');
  });
});

describe('green_bond — completenessEvidencePresent gates the reviewer certification', () => {
  it('certify_review with NO completeness_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'begin_gathering', ISSUER)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'calculate_impact', ISSUER, { kwh_generated: 1000 })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'commission_review', ISSUER, { external_reviewer: 'DNV', review_type: 'verification' })).ok).toBe(true);

    const r = await act(deps, 'txn-c', 'certify_review', REVIEWER, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('external_review');
  });

  it('reject_report from under_review without a reason_code is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r2', baseOpen);
    expect((await act(deps, 'txn-r2', 'begin_gathering', ISSUER)).ok).toBe(true);
    expect((await act(deps, 'txn-r2', 'calculate_impact', ISSUER, { kwh_generated: 1 })).ok).toBe(true);
    expect((await act(deps, 'txn-r2', 'commission_review', ISSUER, { external_reviewer: 'DNV', review_type: 'verification' })).ok).toBe(true);
    expect((await act(deps, 'txn-r2', 'certify_review', REVIEWER, { completeness_ref: 'SPO-9' })).ok).toBe(true);
    expect((await act(deps, 'txn-r2', 'approve_board', ISSUER, { board_resolution_ref: 'BR-9' })).ok).toBe(true);
    expect((await act(deps, 'txn-r2', 'begin_jse_review', REGULATOR)).ok).toBe(true);

    const r = await act(deps, 'txn-r2', 'reject_report', REGULATOR); // no reason_code
    expect(r.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r2'))!.txn.state).toBe('under_review');
  });
});
