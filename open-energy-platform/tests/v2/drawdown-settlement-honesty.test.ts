// drawdown — the settlement-honesty stamp, as a driven property.
//
// This chain is the exemplar for R-S5-1: the platform has no custody and no
// payment rails, so a facility drawdown may be INSTRUCTED but the system must
// never claim money moved. Three facts carry that, and this test pins all
// three so a later "helpful" edit can't quietly undo the honesty:
//
//   1. settles === false — build/export always carries the record-only notice.
//   2. `disbursed` is DECLARED (so the view/export can name the honest terminal
//      "funds disbursed") but STRUCTURALLY UNREACHABLE — no transition targets
//      it. The reachable rest-state is `disbursement_instructed`.
//   3. the reachable happy path stops at disbursement_instructed (non-terminal,
//      txn stays open) — we recorded an instruction to an external rail, nothing
//      more; and a lender reject-with-reason COMMITS as an audit fact.
//
// Failure mode this guards: someone wires an edge `to: 'disbursed'` (the system
// now asserts settled money it never observed), flips settles to true, or drops
// the reason requirement on reject. No new production code — drives the engine
// + drawdown decl as-is.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { drawdown } from '../../src/v2/domain/chains/drawdown';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import type { Clock, Command, IdSource, Instant } from '../../src/v2/domain/types';

function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++ * 1000, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const BORROWER = { id: 'user-borrower', kind: 'user' as const, participant_id: 'party-borrower' };
const LENDER = { id: 'user-lender', kind: 'user' as const, participant_id: 'party-lender' };
const TXN = 'txn-drw';
const OPEN_INPUT = {
  facility_ref: 'FAC-2026-001',
  borrower_name: 'Karoo Solar SPV',
  drawdown_amount_zar: 45_000_000,
  tranche_no: 1,
  lender_party: 'party-lender',
};

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { drawdown }, guards: GUARDS };
}

async function open(deps: EngineDeps, idem: { n: number }) {
  const r = await applyTransition(
    { txn_id: TXN, chain_key: 'drawdown', edge: 'open', actor: BORROWER, input: OPEN_INPUT as Command['input'], expected_seq: { [TXN]: -1 }, idempotency_key: `k-${++idem.n}` },
    deps,
  );
  if (!r.ok) throw new Error(`open: ${r.code}`);
}

describe('drawdown — settlement-honesty stamp is structural, not cosmetic', () => {
  it('declares settles:false', () => {
    expect(drawdown.settles).toBe(false);
  });

  it('declares `disbursed` as a terminal state but NO transition can reach it', () => {
    expect(drawdown.states.disbursed).toBeDefined();
    expect(drawdown.states.disbursed.terminal).toBe(true);
    const targeted = new Set(drawdown.transitions.map((t) => t.to));
    expect(targeted.has('disbursed')).toBe(false); // structurally unreachable
    // the reachable rest-state is the honest one: an instruction, not a settlement.
    expect(targeted.has('disbursement_instructed')).toBe(true);
    expect(drawdown.states.disbursement_instructed.terminal).toBe(false);
  });
});

describe('drawdown — reachable lifecycle', () => {
  it('happy path open→submit→approve→instruct stops at disbursement_instructed (open, instructed_at set)', async () => {
    const deps = newDeps();
    const store = deps.store;
    const idem = { n: 0 };
    await open(deps, idem);

    const step = async (edge: string, actor: typeof BORROWER, input: Record<string, unknown> = {}) => {
      const seq = (await store.getTxn(TXN))!.txn.seq;
      const r = await applyTransition(
        { txn_id: TXN, chain_key: 'drawdown', edge, actor, input: input as Command['input'], expected_seq: { [TXN]: seq }, idempotency_key: `k-${++idem.n}` },
        deps,
      );
      if (!r.ok) throw new Error(`${edge}: ${r.code}`);
    };

    await step('submit', BORROWER);
    await step('approve', LENDER, { credit_approval_ref: 'CA-77' });
    await step('instruct_disbursement', LENDER);

    const txn = (await store.getTxn(TXN))!.txn;
    expect(txn.state).toBe('disbursement_instructed');
    expect(txn.closed_at).toBeNull(); // non-terminal rest-state — txn stays open
    expect(typeof txn.fields.instructed_at).toBe('string'); // derive wrote the instant
  });

  it('lender reject-with-reason from submitted COMMITS as an audit fact and closes the txn', async () => {
    const deps = newDeps();
    const store = deps.store;
    const idem = { n: 0 };
    await open(deps, idem);

    const submitSeq = (await store.getTxn(TXN))!.txn.seq;
    await applyTransition(
      { txn_id: TXN, chain_key: 'drawdown', edge: 'submit', actor: BORROWER, input: {} as Command['input'], expected_seq: { [TXN]: submitSeq }, idempotency_key: `k-${++idem.n}` },
      deps,
    );

    const rejSeq = (await store.getTxn(TXN))!.txn.seq;
    const r = await applyTransition(
      { txn_id: TXN, chain_key: 'drawdown', edge: 'reject', actor: LENDER, input: {} as Command['input'], expected_seq: { [TXN]: rejSeq }, idempotency_key: `k-${++idem.n}`, reason_code: 'credit_declined' },
      deps,
    );
    expect(r.ok).toBe(true);

    const txn = (await store.getTxn(TXN))!.txn;
    expect(txn.state).toBe('rejected');
    expect(txn.closed_at).not.toBeNull(); // terminal
  });

  it('reject WITHOUT a reason_code is refused (reason is mandatory on this edge)', async () => {
    const deps = newDeps();
    const store = deps.store;
    const idem = { n: 0 };
    await open(deps, idem);
    const submitSeq = (await store.getTxn(TXN))!.txn.seq;
    await applyTransition(
      { txn_id: TXN, chain_key: 'drawdown', edge: 'submit', actor: BORROWER, input: {} as Command['input'], expected_seq: { [TXN]: submitSeq }, idempotency_key: `k-${++idem.n}` },
      deps,
    );
    const rejSeq = (await store.getTxn(TXN))!.txn.seq;
    const r = await applyTransition(
      { txn_id: TXN, chain_key: 'drawdown', edge: 'reject', actor: LENDER, input: {} as Command['input'], expected_seq: { [TXN]: rejSeq }, idempotency_key: `k-${++idem.n}` },
      deps,
    );
    expect(r.ok).toBe(false);
  });
});
