// environmental_authorisation — the structural decision gate, as a driven property.
//
// A NEMA environmental authorisation must NEVER be issued on an application the
// competent authority never took under review. This is enforced by the state
// graph, not a guard: issue_authorisation leaves ONLY under_review, and the ONLY
// path into under_review is commence_review. So from submitted (received but not
// yet under review) issue_authorisation is an ILLEGAL_TRANSITION — the engine's
// step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds submitted to issue_authorisation's
// `from`, letting an authorisation issue the moment the EIA lands, before the
// authority reviews it.
//
// Also pins: the EIA-report payload requirement (you cannot submit with nothing →
// BAD_INPUT) and completenessEvidencePresent at issuance (no completeness ref →
// MISSING_COMPLETENESS_EVIDENCE). No counterpartyDistinct here — developer and
// regulator are different role classes, not counterparties, so no SELF_DEALING.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { environmentalAuthorisation } from '../../src/v2/domain/chains/environmental_authorisation';
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

const DEVELOPER: Actor = { id: 'user-dev', kind: 'user', participant_id: 'party-dev' };
const REGULATOR: Actor = { id: 'user-reg', kind: 'user', participant_id: 'party-reg' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { environmental_authorisation: environmentalAuthorisation }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'environmental_authorisation', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>, actor: Actor = DEVELOPER) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'environmental_authorisation', edge: 'open', actor, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_name: 'Kuruman Solar 1',
  developer_name: 'Scatec',
  regulator_party: REGULATOR.participant_id,
  listed_activity: 'Listing Notice 1 Activity 1',
  capacity_mw: 75,
};

describe('environmental_authorisation — an authorisation cannot issue before the authority reviews', () => {
  it('declares settles:false (a regulatory notice record, never a payment)', () => {
    expect(environmentalAuthorisation.settles).toBe(false);
  });

  it('happy path: open -> submit_eia -> commence_review -> issue_authorisation -> authorised', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'submit_eia', DEVELOPER, { eia_report_ref: 'EIA-2026-001' })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('submitted');
    expect((await act(deps, 'txn-h', 'commence_review', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('under_review');
    expect((await act(deps, 'txn-h', 'issue_authorisation', REGULATOR, { completeness_ref: 'EIR-PKT-9001' })).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('authorised');
    expect(typeof txn.fields.review_commenced_at).toBe('string');
    expect(typeof txn.fields.authorised_at).toBe('string');
  });

  it('issue_authorisation from submitted (authority never reviewed) is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'submit_eia', DEVELOPER, { eia_report_ref: 'EIA-2026-001' })).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('submitted');

    // the graph forbids issuing here — no review has commenced.
    const early = await act(deps, 'txn-e', 'issue_authorisation', REGULATOR, { completeness_ref: 'EIR-PKT-9001' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('submitted');
  });
});

describe('environmental_authorisation — evidence gates', () => {
  it('submitting with no EIA report ref is a BAD_INPUT (cannot submit with nothing)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-s', baseOpen);
    const r = await act(deps, 'txn-s', 'submit_eia', DEVELOPER, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('scoping');
  });

  it('issuing with no decision completeness ref is refused MISSING_COMPLETENESS_EVIDENCE', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    await act(deps, 'txn-c', 'submit_eia', DEVELOPER, { eia_report_ref: 'EIA-2026-001' });
    await act(deps, 'txn-c', 'commence_review', REGULATOR);
    // completeness_ref absent → the guard speaks (Pattern A).
    const r = await act(deps, 'txn-c', 'issue_authorisation', REGULATOR, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('under_review');
  });
});
