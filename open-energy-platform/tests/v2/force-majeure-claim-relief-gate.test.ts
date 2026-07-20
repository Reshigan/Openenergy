// force_majeure_claim — the structural relief gate, as a driven property.
//
// Relief must NEVER be granted on a bare notice. This is enforced by the state
// graph, not a guard: grant_relief leaves ONLY assessed, and the ONLY path into
// assessed is complete_assessment. So from under_assessment (assessment started
// but not completed) grant_relief is an ILLEGAL_TRANSITION — the engine's step-4
// state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds under_assessment to grant_relief's
// `from`, letting relief be granted before the assessment is on record.
//
// Also pins: counterpartyDistinct at '@new' (an affected party naming itself as
// counterparty is refused SELF_DEALING), and completenessEvidencePresent at
// grant_relief (no evidence-packet ref → MISSING_COMPLETENESS_EVIDENCE).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { forceMajeureClaim } from '../../src/v2/domain/chains/force_majeure_claim';
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

const AFFECTED: Actor = { id: 'user-aff', kind: 'user', participant_id: 'party-aff' };
const COUNTERPARTY: Actor = { id: 'user-cp', kind: 'user', participant_id: 'party-cp' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { force_majeure_claim: forceMajeureClaim }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'force_majeure_claim', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>, actor: Actor = AFFECTED) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'force_majeure_claim', edge: 'open', actor, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  contract_ref: 'PPA-2026-014',
  affected_party_name: 'Scatec',
  counterparty_name: 'Eskom',
  counterparty_party: COUNTERPARTY.participant_id,
  event_description: 'Regional flooding disabled the collector substation',
};

describe('force_majeure_claim — relief cannot be granted before assessment is complete', () => {
  it('declares settles:false (a notice/relief record, never a payment)', () => {
    expect(forceMajeureClaim.settles).toBe(false);
  });

  it('happy path: open -> begin_assessment -> complete_assessment -> grant_relief -> relief_granted', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'begin_assessment', COUNTERPARTY)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'complete_assessment', COUNTERPARTY)).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('assessed');
    expect((await act(deps, 'txn-h', 'grant_relief', COUNTERPARTY, { completeness_ref: 'PKT-FM-9001' })).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('relief_granted');
    expect(typeof txn.fields.relief_granted_at).toBe('string');
  });

  it('grant_relief from under_assessment (assessment not complete) is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'begin_assessment', COUNTERPARTY)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('under_assessment');

    // the graph forbids granting here — no completed assessment exists.
    const early = await act(deps, 'txn-e', 'grant_relief', COUNTERPARTY, { completeness_ref: 'PKT-FM-9001' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('under_assessment');
  });
});

describe('force_majeure_claim — evidence + independence gates', () => {
  it('an affected party that names itself as counterparty is refused SELF_DEALING at @new', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-self', { ...baseOpen, counterparty_party: AFFECTED.participant_id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF_DEALING');
  });

  it('granting relief with no evidence-packet ref is refused MISSING_COMPLETENESS_EVIDENCE', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    await act(deps, 'txn-c', 'begin_assessment', COUNTERPARTY);
    await act(deps, 'txn-c', 'complete_assessment', COUNTERPARTY);
    // state ok, role ok, no required inputs missing → the guard speaks.
    const r = await act(deps, 'txn-c', 'grant_relief', COUNTERPARTY, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('assessed');
  });
});
