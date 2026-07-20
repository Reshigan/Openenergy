// tcpi — the structural recovery gate, as a driven property.
//
// A recovery plan must NEVER be signed off before it is actually submitted. This
// is enforced by the state graph, not a guard: accept_recovery leaves ONLY
// recovery_submitted, and the ONLY path into recovery_submitted is submit_recovery.
// So from recovery_required (recovery flagged but no plan submitted) accept_recovery
// is an ILLEGAL_TRANSITION — the engine's step-4 state check refuses it.
//
// Failure mode this guards: someone adds recovery_required to accept_recovery's
// `from`, or reorders the graph so a sponsor can sign off a recovery with no plan
// on record — a project then proceeds on an unrecoverable baseline with no fix.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { tcpi } from '../../src/v2/domain/chains/tcpi';
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

const ORIGINATOR: Actor = { id: 'user-originator', kind: 'user', participant_id: 'party-originator' };
const REVIEWER: Actor = { id: 'user-reviewer', kind: 'user', participant_id: 'party-reviewer' };
const SPONSOR: Actor = { id: 'user-sponsor', kind: 'user', participant_id: 'party-sponsor' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { tcpi }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'tcpi', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code: reason },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'tcpi', edge: 'open', actor: ORIGINATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_name: 'Kuruman PV 75MW',
  change_order_ref: 'CO-14',
  priority: 'medium',
  contract_currency: 'ZAR',
  bac: 1_000_000,
  ev: 500_000,
  ac: 400_000, // TCPI = (1M - 500k)/(1M - 400k) = 0.833 → on_track
  reviewer_party: REVIEWER.participant_id,
  sponsor_party: SPONSOR.participant_id,
};

describe('tcpi — an on-track index accepts cleanly', () => {
  it('declares settles:false (an EVM control readout, never a payment)', () => {
    expect(tcpi.settles).toBe(false);
  });

  it('happy path: raise → review (computes TCPI) → accept_index → index_accepted', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-ok', baseOpen);
    expect((await act(deps, 'txn-ok', 'begin_review', REVIEWER)).ok).toBe(true);

    const reviewed = (await store.getTxn('txn-ok'))!.txn;
    expect(reviewed.state).toBe('under_review');
    expect(reviewed.fields.tcpi_tier).toBe('on_track');
    expect(reviewed.fields.tcpi_value).toBeCloseTo(0.8333, 3);

    expect((await act(deps, 'txn-ok', 'accept_index', REVIEWER)).ok).toBe(true);
    const done = (await store.getTxn('txn-ok'))!.txn;
    expect(done.state).toBe('index_accepted');
    expect(typeof done.fields.accepted_at).toBe('string');
  });
});

describe('tcpi — a recovery cannot be accepted before a plan is submitted', () => {
  it('accept_recovery from recovery_required is ILLEGAL_TRANSITION; legal only after submit_recovery', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'begin_review', REVIEWER)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'flag_recovery', REVIEWER, {}, 'index_over_cap')).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('recovery_required');

    // the graph forbids accepting here — no recovery plan has been submitted.
    const early = await act(deps, 'txn-r', 'accept_recovery', SPONSOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('recovery_required');

    // submit the plan first, THEN the sponsor can accept it.
    expect((await act(deps, 'txn-r', 'submit_recovery', ORIGINATOR, { recovery_plan_ref: 'RP-9' })).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('recovery_submitted');
    const accepted = await act(deps, 'txn-r', 'accept_recovery', SPONSOR);
    expect(accepted.ok).toBe(true);

    const txn = (await store.getTxn('txn-r'))!.txn;
    expect(txn.state).toBe('recovery_accepted');
    expect(typeof txn.fields.recovery_accepted_at).toBe('string');
  });

  it('flag_recovery without a reason_code is rejected (requiresReason)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-nr', baseOpen);
    expect((await act(deps, 'txn-nr', 'begin_review', REVIEWER)).ok).toBe(true);
    const r = await act(deps, 'txn-nr', 'flag_recovery', REVIEWER);
    expect(r.ok).toBe(false);
    expect((await deps.store.getTxn('txn-nr'))!.txn.state).toBe('under_review');
  });
});
