// sustainability_transaction — the structural execution gate, as a driven property.
//
// A sustainability transaction must NEVER execute on an un-accepted proposal.
// This is enforced by the state graph, not a guard: `execute` leaves ONLY
// `accepted`, and the ONLY path into `accepted` is buyer acceptance of a quote.
// So from `proposed` (or `quoted`) `execute` is an ILLEGAL_TRANSITION — the
// engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds `proposed`/`quoted` to execute's `from`,
// letting a trade settle on terms the buyer never agreed to.
//
// Also pins executionEvidencePresent: execution without a board-approval +
// legal-counterparty ref is refused.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { sustainabilityTransaction } from '../../src/v2/domain/chains/sustainability_transaction';
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
const SELLER: Actor = { id: 'user-seller', kind: 'user', participant_id: 'party-seller' };
const OPERATOR: Actor = { id: 'user-op', kind: 'user', participant_id: 'party-op' };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { sustainability_transaction: sustainabilityTransaction },
    guards: GUARDS,
  };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'sustainability_transaction',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      reason_code,
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'sustainability_transaction',
      edge: 'open',
      actor: BUYER,
      input: input as Command['input'],
      expected_seq: { [txnId]: -1 },
      idempotency_key: key(),
    },
    deps,
  );
}

const baseOpen = {
  instrument: 'REC',
  registry: 'GreenX',
  quantity: 100,
  unit: 'MWh',
  currency: 'ZAR',
  seller_party: SELLER.participant_id,
  operator_party: OPERATOR.participant_id,
};

const EVIDENCE = { board_approval_ref: 'BRD-2026-04', legal_counterparty_ref: 'LGL-778' };

describe('sustainability_transaction — a trade cannot execute before it is accepted', () => {
  it('declares settles:false (a record-only custody notice, never a payment)', () => {
    expect(sustainabilityTransaction.settles).toBe(false);
  });

  it('happy path: open → quote → accept → execute → settlement_recorded', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'quote', SELLER, { unit_price: 50 })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'accept', BUYER)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'execute', SELLER, EVIDENCE)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'record_settlement', OPERATOR)).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('settlement_recorded');
    expect(txn.fields.notional).toBe(5000);
    expect(typeof txn.fields.executed_at).toBe('string');
    expect(typeof txn.fields.settled_at).toBe('string');
  });

  it('execute from proposed is ILLEGAL_TRANSITION (never accepted)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('proposed');

    // the graph forbids executing here — no accepted quote exists.
    const early = await act(deps, 'txn-e', 'execute', SELLER, EVIDENCE);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('proposed');
  });
});

describe('sustainability_transaction — executionEvidencePresent gates execution', () => {
  it('execute with NO board approval ref is refused at the accepted state', async () => {
    const deps = newDeps();
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'quote', SELLER, { unit_price: 50 })).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'accept', BUYER)).ok).toBe(true);

    const r = await act(deps, 'txn-g', 'execute', SELLER, { legal_counterparty_ref: 'LGL-778' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_BOARD_APPROVAL');
    expect((await deps.store.getTxn('txn-g'))!.txn.state).toBe('accepted');
  });
});
