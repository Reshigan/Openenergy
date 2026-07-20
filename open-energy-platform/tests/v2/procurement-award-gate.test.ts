// procurement — the award-before-PO structural gate, as a driven property.
//
// A purchase order must NEVER be cut without a competed award behind it. This
// is enforced by the state graph, not a guard: issue_po leaves ONLY `awarded`,
// and the ONLY path into `awarded` is the award edge from `bids_evaluating`. So
// from `bids_evaluating` (bids in, not yet awarded) issue_po is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds bids_evaluating to issue_po's `from`,
// or reorders states so a PO can issue on an un-awarded package — spend then
// commits with no award record behind it (a PFMA/SCM finding).
//
// Also pins counterpartyDistinct: a buyer cannot award a package to itself.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { procurement } from '../../src/v2/domain/chains/procurement';
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

const BUYER: Actor = { id: 'user-buyer', kind: 'user', participant_id: 'party-buyer' };
const SUPPLIER_ID = 'party-supplier';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { procurement }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'procurement', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code: reason },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'procurement', edge: 'open', actor: BUYER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  package_title: '132kV transformer supply',
  discipline: 'electrical',
  scope_description: 'Supply & deliver one 40MVA transformer',
  estimated_value: 1000,
  supplier_party: SUPPLIER_ID,
};

describe('procurement — a PO cannot issue without a competed award', () => {
  it('declares settles:false (a construction control artefact, never a payment)', () => {
    expect(procurement.settles).toBe(false);
  });

  it('issue_po from bids_evaluating is ILLEGAL_TRANSITION; happy path reaches closed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-a', baseOpen);
    expect((await act(deps, 'txn-a', 'issue_rfq', BUYER, { rfq_ref: 'RFQ-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-a', 'begin_evaluation', BUYER, { bid_count: 3 })).ok).toBe(true);
    expect((await store.getTxn('txn-a'))!.txn.state).toBe('bids_evaluating');

    // the graph forbids cutting a PO here — no award yet.
    const early = await act(deps, 'txn-a', 'issue_po', BUYER, { po_number: 'PO-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-a'))!.txn.state).toBe('bids_evaluating');

    // award first, THEN the PO issues — award stamps awarded_at + variance.
    const awarded = await act(deps, 'txn-a', 'award', BUYER, { award_value: 1100 });
    expect(awarded.ok).toBe(true);
    expect((await store.getTxn('txn-a'))!.txn.state).toBe('awarded');

    expect((await act(deps, 'txn-a', 'issue_po', BUYER, { po_number: 'PO-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-a', 'confirm_delivery', BUYER)).ok).toBe(true);
    expect((await act(deps, 'txn-a', 'close_package', BUYER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-a'))!.txn;
    expect(txn.state).toBe('closed');
    expect(txn.fields.award_variance_pct).toBe(10);
    expect(typeof txn.fields.awarded_at).toBe('string');
    expect(typeof txn.fields.po_issued_at).toBe('string');
    expect(typeof txn.fields.closed_at_proc).toBe('string');
  });
});

describe('procurement — counterpartyDistinct blocks self-award', () => {
  it('award where the supplier IS the buyer is refused SELF_DEALING', async () => {
    const deps = newDeps();
    // buyer awards a package to itself — supplier party == buyer participant.
    await open(deps, 'txn-self', { ...baseOpen, supplier_party: BUYER.participant_id });
    expect((await act(deps, 'txn-self', 'issue_rfq', BUYER, { rfq_ref: 'RFQ-2' })).ok).toBe(true);
    expect((await act(deps, 'txn-self', 'begin_evaluation', BUYER, { bid_count: 1 })).ok).toBe(true);

    const r = await act(deps, 'txn-self', 'award', BUYER, { award_value: 900 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF_DEALING');
    expect((await deps.store.getTxn('txn-self'))!.txn.state).toBe('bids_evaluating');
  });
});
