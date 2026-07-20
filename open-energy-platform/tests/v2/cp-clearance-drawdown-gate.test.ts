// cp_clearance — the structural drawdown gate, as a driven property.
//
// Drawdown can NEVER be authorised before the lender has cleared the CPs. This
// is enforced by the state graph, not a guard: authorize_drawdown leaves ONLY
// cps_satisfied, and the ONLY path into cps_satisfied is clear_cps (from
// under_lender_review). So from under_lender_review authorize_drawdown is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds under_lender_review to
// authorize_drawdown's `from`, letting a facility draw down on CPs the lender
// never signed off. Also pins cpEvidencePresent: submit_evidence without a
// named cp_evidence_ref is refused.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { cpClearance } from '../../src/v2/domain/chains/cp_clearance';
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

const LENDER: Actor = { id: 'user-lender', kind: 'user', participant_id: 'party-lender' };
const BORROWER: Actor = { id: 'user-borrower', kind: 'user', participant_id: 'party-borrower' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { cp_clearance: cpClearance }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'cp_clearance', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'cp_clearance', edge: 'open', actor: LENDER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// lender opens the register; borrower named so it can act on later edges.
const baseOpen = {
  facility_ref: 'FAC-2024-07',
  borrower_name: 'Karoo Solar SPV',
  cp_tier: 'major',
  cp_count_total: 12,
  closing_deadline: '2026-12-31T00:00:00.000Z',
  borrower_party: BORROWER.participant_id,
};

describe('cp_clearance — drawdown cannot be authorised before CPs are cleared', () => {
  it('declares settles:false (a drawdown pre-condition control, never a payment)', () => {
    expect(cpClearance.settles).toBe(false);
  });

  it('drives open -> ... -> drawdown_authorized and blocks an early drawdown', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-cp', baseOpen);
    expect((await act(deps, 'txn-cp', 'submit_register', LENDER)).ok).toBe(true);
    expect((await act(deps, 'txn-cp', 'agree_register', BORROWER)).ok).toBe(true);
    expect((await act(deps, 'txn-cp', 'commence_satisfaction', BORROWER)).ok).toBe(true);
    expect((await act(deps, 'txn-cp', 'submit_evidence', BORROWER, { cp_evidence_ref: 'EV-778', cp_count_satisfied: 12 })).ok).toBe(true);
    expect((await act(deps, 'txn-cp', 'begin_review', LENDER)).ok).toBe(true);
    expect((await store.getTxn('txn-cp'))!.txn.state).toBe('under_lender_review');

    // the graph forbids drawdown here — CPs are under review, not yet cleared.
    const early = await act(deps, 'txn-cp', 'authorize_drawdown', LENDER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-cp'))!.txn.state).toBe('under_lender_review');

    // clear first, THEN authorise — and stamp drawdown_authorized_at.
    expect((await act(deps, 'txn-cp', 'clear_cps', LENDER, { cp_count_satisfied: 12 })).ok).toBe(true);
    expect((await store.getTxn('txn-cp'))!.txn.state).toBe('cps_satisfied');
    const done = await act(deps, 'txn-cp', 'authorize_drawdown', LENDER);
    expect(done.ok).toBe(true);

    const txn = (await store.getTxn('txn-cp'))!.txn;
    expect(txn.state).toBe('drawdown_authorized');
    expect(typeof txn.fields.cps_cleared_at).toBe('string');
    expect(typeof txn.fields.drawdown_authorized_at).toBe('string');
  });
});

describe('cp_clearance — cpEvidencePresent gates evidence submission', () => {
  it('submit_evidence with no cp_evidence_ref is refused MISSING_CP_EVIDENCE', async () => {
    const deps = newDeps();
    await open(deps, 'txn-noev', baseOpen);
    expect((await act(deps, 'txn-noev', 'submit_register', LENDER)).ok).toBe(true);
    expect((await act(deps, 'txn-noev', 'agree_register', BORROWER)).ok).toBe(true);
    expect((await act(deps, 'txn-noev', 'commence_satisfaction', BORROWER)).ok).toBe(true);

    const r = await act(deps, 'txn-noev', 'submit_evidence', BORROWER, { cp_count_satisfied: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_CP_EVIDENCE');
    expect((await deps.store.getTxn('txn-noev'))!.txn.state).toBe('satisfying_cps');
  });
});
