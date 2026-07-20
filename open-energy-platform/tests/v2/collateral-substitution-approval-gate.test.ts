// collateral_substitution — the structural booking gate, as a driven property.
//
// A collateral substitution must NEVER be booked without the secured party's
// approval. This is enforced by the state graph, not a guard: book_substitution
// leaves ONLY approved, and the ONLY path into approved is approve_substitution.
// So from under_review (reviewed but not yet approved) book_substitution is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before guards.
//
// Failure mode this guards: someone adds under_review to book_substitution's
// `from`, letting a substitution book while the secured party is still reviewing.
//
// Also pins: counterpartyDistinct at '@new' (a pledgor that names itself as the
// secured party is refused SELF_DEALING) and cpEvidencePresent at approval (no
// CP-evidence ref → MISSING_CP_EVIDENCE).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { collateralSubstitution } from '../../src/v2/domain/chains/collateral_substitution';
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

const PLEDGOR: Actor = { id: 'user-pledgor', kind: 'user', participant_id: 'party-pledgor' };
const SECURED: Actor = { id: 'user-secured', kind: 'user', participant_id: 'party-secured' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { collateral_substitution: collateralSubstitution }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'collateral_substitution', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>, actor: Actor = PLEDGOR) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'collateral_substitution', edge: 'open', actor, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  pledgor_name: 'Scatec',
  secured_party_name: 'Eskom',
  secured_party_party: SECURED.participant_id,
  existing_collateral_ref: 'ZAR-CASH-001',
  proposed_collateral_ref: 'RSA-GOVT-BOND-R2032',
  csa_ref: 'CSA-2016-VM-77',
};

describe('collateral_substitution — a substitution cannot be booked before the secured party approves', () => {
  it('declares settles:false (a framework record, never a payment)', () => {
    expect(collateralSubstitution.settles).toBe(false);
  });

  it('happy path: open -> start_review -> approve_substitution -> book_substitution -> substituted', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'start_review', SECURED)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'approve_substitution', SECURED, { cp_evidence_ref: 'CP-EVD-9001' })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('approved');
    expect((await act(deps, 'txn-h', 'book_substitution', SECURED)).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('substituted');
    expect(typeof txn.fields.approved_at).toBe('string');
    expect(typeof txn.fields.booked_at).toBe('string');
  });

  it('book_substitution from under_review (not yet approved) is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'start_review', SECURED)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('under_review');

    // the graph forbids booking here — no approval exists yet.
    const early = await act(deps, 'txn-e', 'book_substitution', SECURED);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('under_review');
  });
});

describe('collateral_substitution — evidence + independence gates', () => {
  it('a pledgor that names itself as the secured party is refused SELF_DEALING at @new', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-self', { ...baseOpen, secured_party_party: PLEDGOR.participant_id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF_DEALING');
  });

  it('approving with no CP-evidence ref is refused MISSING_CP_EVIDENCE', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    await act(deps, 'txn-c', 'start_review', SECURED);
    // cp_evidence_ref absent → the guard speaks (Pattern A, not BAD_INPUT).
    const r = await act(deps, 'txn-c', 'approve_substitution', SECURED, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_CP_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('under_review');
  });
});
