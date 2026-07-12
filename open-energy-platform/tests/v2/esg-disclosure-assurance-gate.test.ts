// esg_disclosure — the structural assurance gate + completeness guard, driven.
//
// An ESG disclosure must NEVER be published before external assurance and board
// sign-off. This is enforced by the state graph, not a guard: publish leaves
// ONLY board_review, and the ONLY path into board_review is assurance_complete
// (from under_assurance). So from under_assurance, publish is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds under_assurance (or data_collection) to
// publish's `from`, letting an unassured, un-approved disclosure go out to the
// JSE — a material-misstatement / greenwashing exposure.
//
// Also pins completenessEvidencePresent: submit_for_review without a
// completeness_ref is refused.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { esgDisclosure } from '../../src/v2/domain/chains/esg_disclosure';
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

const PREPARER: Actor = { id: 'user-preparer', kind: 'user', participant_id: 'party-preparer' };
const ASSURER: Actor = { id: 'user-assurer', kind: 'user', participant_id: 'party-assurer' };
const BOARD: Actor = { id: 'user-board', kind: 'user', participant_id: 'party-board' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { esg_disclosure: esgDisclosure }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'esg_disclosure', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'esg_disclosure', edge: 'open', actor: PREPARER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  entity_name: 'Vantax Renewables',
  reporting_period: 'FY2026',
  framework: 'JSE-SRL',
  scope1_tco2e: 12_000,
  scope2_tco2e: 40_000,
  assurer_party: ASSURER.participant_id,
  board_party: BOARD.participant_id,
};

describe('esg_disclosure — cannot publish before assurance + board sign-off', () => {
  it('declares settles:false (a regulatory statement, never a payment)', () => {
    expect(esgDisclosure.settles).toBe(false);
  });

  it('publish from under_assurance is ILLEGAL_TRANSITION; happy path publishes only after assurance', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);

    expect((await act(deps, 'txn-e', 'submit_for_review', PREPARER, { completeness_ref: 'COMPLETE-2026-01' })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'submit_for_assurance', PREPARER)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('under_assurance');

    // the graph forbids publishing here — assurance not yet complete, board never saw it.
    const early = await act(deps, 'txn-e', 'publish', BOARD);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('under_assurance');

    // complete assurance, then board publishes — and stamps published_at.
    expect((await act(deps, 'txn-e', 'assurance_complete', ASSURER, { assurance_opinion: 'reasonable', assurance_ref: 'ASR-9' })).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('board_review');
    const pub = await act(deps, 'txn-e', 'publish', BOARD);
    expect(pub.ok).toBe(true);

    const txn = (await store.getTxn('txn-e'))!.txn;
    expect(txn.state).toBe('published');
    expect(txn.fields.total_emissions_tco2e).toBe(52_000);
    expect(txn.fields.emissions_tier).toBe('high');
    expect(typeof txn.fields.assured_at).toBe('string');
    expect(typeof txn.fields.published_at).toBe('string');
  });
});

describe('esg_disclosure — completenessEvidencePresent gates submit_for_review', () => {
  it('submit_for_review without a completeness_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    const r = await act(deps, 'txn-c', 'submit_for_review', PREPARER, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('data_collection');
  });
});
