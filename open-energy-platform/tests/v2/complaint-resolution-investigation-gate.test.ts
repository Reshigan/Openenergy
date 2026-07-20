// complaint_resolution — the structural fairness gate, as a driven property.
//
// A complaint must NEVER be marked resolved without an investigation. This is
// enforced by the state graph, not a guard: accept_resolution leaves ONLY
// resolution_proposed, and the ONLY path into resolution_proposed is
// propose_resolution from under_investigation. So from acknowledged (no
// investigation yet) accept_resolution is an ILLEGAL_TRANSITION — the engine's
// step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds acknowledged/lodged to
// accept_resolution's `from`, or lets propose_resolution fire from acknowledged
// — a complaint then closes as "resolved" with no finding on record.
//
// Also pins the reject-resolution reason-code requirement: bouncing a proposal
// back for re-investigation without a reason_code is rejected.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { complaintResolution } from '../../src/v2/domain/chains/complaint_resolution';
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

const COMPLAINANT: Actor = { id: 'user-complainant', kind: 'user', participant_id: 'party-complainant' };
const HANDLER: Actor = { id: 'user-handler', kind: 'user', participant_id: 'party-handler' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { complaint_resolution: complaintResolution }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'complaint_resolution', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'complaint_resolution', edge: 'open', actor: COMPLAINANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  subject: 'Disputed reconnection fee',
  category: 'billing',
  description: 'Charged a reconnection fee after a metering error on the DSO side.',
  handler_party: HANDLER.participant_id,
  respondent_party: 'party-respondent',
};

describe('complaint_resolution — a complaint cannot resolve without an investigation', () => {
  it('declares settles:false (a regulatory record, never a payment)', () => {
    expect(complaintResolution.settles).toBe(false);
  });

  it('accept_resolution before an investigation is ILLEGAL_TRANSITION; the happy path resolves', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'acknowledge', HANDLER)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('acknowledged');

    // the graph forbids resolving here — no investigation, no proposed remedy.
    const early = await act(deps, 'txn-c', 'accept_resolution', COMPLAINANT);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('acknowledged');

    // investigate → propose → accept succeeds, and stamps resolved_at.
    expect((await act(deps, 'txn-c', 'open_investigation', HANDLER)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('under_investigation');
    expect((await act(deps, 'txn-c', 'propose_resolution', HANDLER, { finding: 'Metering error confirmed', remedy: 'Reverse the fee' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('resolution_proposed');
    const accepted = await act(deps, 'txn-c', 'accept_resolution', COMPLAINANT);
    expect(accepted.ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('resolved');
    expect(typeof txn.fields.investigation_opened_at).toBe('string');
    expect(typeof txn.fields.resolution_proposed_at).toBe('string');
    expect(typeof txn.fields.resolved_at).toBe('string');
  });
});

describe('complaint_resolution — rejecting a proposed remedy needs a reason code', () => {
  it('reject_resolution with no reason_code is refused (BAD_INPUT)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'acknowledge', HANDLER)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'open_investigation', HANDLER)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'propose_resolution', HANDLER, { finding: 'Partial fault', remedy: 'Partial credit' })).ok).toBe(true);

    const noReason = await act(deps, 'txn-r', 'reject_resolution', COMPLAINANT);
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('resolution_proposed');

    // with a valid reason it bounces back for re-investigation.
    const ok = await act(deps, 'txn-r', 'reject_resolution', COMPLAINANT, {}, 'remedy_inadequate');
    expect(ok.ok).toBe(true);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('under_investigation');
  });
});
