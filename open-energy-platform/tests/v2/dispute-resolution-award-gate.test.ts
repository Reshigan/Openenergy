// dispute_resolution — the structural award gate, as a driven property.
//
// A dispute must NEVER be "awarded" without first passing through arbitration.
// This is enforced by the state graph, not a guard: render_award leaves ONLY
// in_arbitration, and `awarded` has no other predecessor. So from in_mediation
// (referred but not yet arbitrated) render_award is an ILLEGAL_TRANSITION — the
// engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds in_mediation to render_award's `from`,
// letting a matter be awarded straight out of mediation with no arbitral seat.
//
// Also pins: counterpartyDistinct at '@new' (a claimant that names itself as
// respondent is refused SELF_DEALING) and completenessEvidencePresent at
// render_award (no award-record ref → MISSING_COMPLETENESS_EVIDENCE).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { disputeResolution } from '../../src/v2/domain/chains/dispute_resolution';
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

const CLAIMANT: Actor = { id: 'user-claim', kind: 'user', participant_id: 'party-claim' };
const RESPONDENT: Actor = { id: 'user-resp', kind: 'user', participant_id: 'party-resp' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { dispute_resolution: disputeResolution }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'dispute_resolution', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>, actor: Actor = CLAIMANT) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'dispute_resolution', edge: 'open', actor, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  claimant_name: 'Scatec',
  respondent_name: 'Eskom',
  respondent_party: RESPONDENT.participant_id,
  dispute_type: 'settlement',
  governing_law: 'RSA',
};

describe('dispute_resolution — a dispute cannot be awarded without arbitration', () => {
  it('declares settles:false (a framework/notice record, never a payment)', () => {
    expect(disputeResolution.settles).toBe(false);
  });

  it('happy path: open -> refer_to_mediation -> escalate_to_arbitration -> render_award -> awarded', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'refer_to_mediation', CLAIMANT)).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('in_mediation');
    expect((await act(deps, 'txn-h', 'escalate_to_arbitration', CLAIMANT, {}, 'mediation_failed')).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('in_arbitration');
    expect((await act(deps, 'txn-h', 'render_award', CLAIMANT, { completeness_ref: 'AWD-9001' })).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('awarded');
    expect(typeof txn.fields.awarded_at).toBe('string');
  });

  it('render_award from in_mediation (never arbitrated) is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'refer_to_mediation', CLAIMANT)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('in_mediation');

    // the graph forbids awarding here — the matter never reached arbitration.
    const early = await act(deps, 'txn-e', 'render_award', CLAIMANT, { completeness_ref: 'AWD-9001' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('in_mediation');
  });
});

describe('dispute_resolution — evidence + independence gates', () => {
  it('a claimant that names itself as respondent is refused SELF_DEALING at @new', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-self', { ...baseOpen, respondent_party: CLAIMANT.participant_id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF_DEALING');
  });

  it('rendering an award with no completeness ref is refused MISSING_COMPLETENESS_EVIDENCE', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    await act(deps, 'txn-c', 'refer_to_mediation', CLAIMANT);
    await act(deps, 'txn-c', 'escalate_to_arbitration', CLAIMANT, {}, 'mediation_failed');
    // in_arbitration, completeness_ref absent → the guard speaks (not a BAD_INPUT).
    const r = await act(deps, 'txn-c', 'render_award', CLAIMANT, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('in_arbitration');
  });
});
