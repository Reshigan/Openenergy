// insurance_claim — the structural payout gate, as a driven property.
//
// A claim must NEVER be settled (paid) before its quantum is agreed. This is
// enforced by the state graph, not a guard: settle_claim leaves ONLY
// quantum_agreed, and the ONLY paths into quantum_agreed are agree_quantum and
// resolve_dispute. So from quantum_proposed (a quantum offered but not yet
// accepted) settle_claim is an ILLEGAL_TRANSITION — the engine's step-4 state
// check refuses it before any guard runs.
//
// Failure mode this guards: someone adds quantum_proposed to settle_claim's
// `from`, or lets a payout fire on an unaccepted offer — the insurer pays a
// figure the claimant never agreed to.
//
// Also pins counterpartyDistinct at '@new': a claimant that names itself as the
// insurer is refused (self-dealing on the policy).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { insuranceClaim } from '../../src/v2/domain/chains/insurance_claim';
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

const CLAIMANT: Actor = { id: 'user-claimant', kind: 'user', participant_id: 'party-claimant' };
const INSURER: Actor = { id: 'user-insurer', kind: 'user', participant_id: 'party-insurer' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { insurance_claim: insuranceClaim }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'insurance_claim', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>, actor: Actor = CLAIMANT) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'insurance_claim', edge: 'open', actor, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  insurer_name: 'Santam',
  policy_number: 'POL-9001',
  cover_type: 'pd_bi',
  incident_type: 'lightning',
  incident_date: '2026-06-01',
  asset_description: 'Inverter station 4',
  claim_value_zar: 7_500_000,
  insurer_party: INSURER.participant_id,
};

describe('insurance_claim — a claim cannot settle before its quantum is agreed', () => {
  it('declares settles:false (records the claim, never custodies the payout)', () => {
    expect(insuranceClaim.settles).toBe(false);
  });

  it('happy path drives @new -> ... -> closed, and settle before agreement is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'begin_assessment', INSURER)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'assign_adjuster', INSURER, { loss_adjuster_name: 'Cunningham Lindsey' })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'propose_quantum', INSURER, { agreed_value_zar: 6_800_000, excess_zar: 200_000 })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('quantum_proposed');

    // the graph forbids paying here — a quantum is offered but NOT yet agreed.
    const early = await act(deps, 'txn-c', 'settle_claim', INSURER, { settled_value_zar: 6_800_000 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('quantum_proposed');

    // agree first, THEN settle succeeds and stamps settled_at_ic; then close.
    expect((await act(deps, 'txn-c', 'agree_quantum', CLAIMANT)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('quantum_agreed');
    const settled = await act(deps, 'txn-c', 'settle_claim', INSURER, { settled_value_zar: 6_800_000 });
    expect(settled.ok).toBe(true);
    expect((await act(deps, 'txn-c', 'close_claim', INSURER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('closed');
    expect(txn.fields.claim_value_tier).toBe('major');
    expect(typeof txn.fields.settled_at_ic).toBe('string');
    expect(typeof txn.fields.closed_at_ic).toBe('string');
  });

  it('a destructive exit without a reason_code is rejected (decline needs a structured reason)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-d', baseOpen);
    const bad = await act(deps, 'txn-d', 'decline_claim', INSURER);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('BAD_INPUT');
    const ok = await act(deps, 'txn-d', 'decline_claim', INSURER, {}, 'exclusion_applies');
    expect(ok.ok).toBe(true);
    expect((await deps.store.getTxn('txn-d'))!.txn.state).toBe('declined');
  });
});

describe('insurance_claim — counterpartyDistinct blocks self-insuring', () => {
  it('a claimant that names itself as insurer is refused SELF_DEALING at @new', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-self', { ...baseOpen, insurer_party: CLAIMANT.participant_id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF_DEALING');
  });
});
