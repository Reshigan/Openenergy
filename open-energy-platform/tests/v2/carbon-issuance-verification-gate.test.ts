// carbon_issuance — the structural MRV-verification gate, as a driven property.
//
// Carbon credits must NEVER be minted before the MRV verification is confirmed.
// This is enforced by the state graph, not a guard: `issue` leaves ONLY
// `verified`, and the ONLY path into `verified` is `confirm_verification`. So
// from `under_review` (in review but not yet verified) `issue` is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds `under_review` (or `requested`) to
// issue's `from`, or reorders states so credits can mint on an unverified
// monitoring report — inflating the registry with unverified tonnes.
//
// Also pins serialRangeConsistent: an over-stated quantity (the inflation
// vector) is refused at open before any state exists.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { carbonIssuance } from '../../src/v2/domain/chains/carbon_issuance';
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

const HOLDER: Actor = { id: 'user-holder', kind: 'user', participant_id: 'party-holder' };
const REGISTRY: Actor = { id: 'user-registry', kind: 'user', participant_id: 'party-registry' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { carbon_issuance: carbonIssuance }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_issuance', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_issuance', edge: 'open', actor: HOLDER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// a well-formed issuance request: 100 serials (1000..1099 inclusive) = 100 tCO2e.
const baseOpen = {
  registry: 'Verra',
  project_ref: 'VCS-5678',
  methodology: 'VM0007',
  vintage_year: 2025,
  mrv_report_ref: 'MRV-2025-01',
  serial_start: 1000,
  serial_end: 1099,
  quantity_tco2e: 100,
  registry_party: REGISTRY.participant_id,
};

describe('carbon_issuance — credits cannot mint before MRV verification is confirmed', () => {
  it('declares settles:false (an issuance is a registry act, not a payment)', () => {
    expect(carbonIssuance.settles).toBe(false);
  });

  it('issue from under_review is ILLEGAL_TRANSITION; verified path mints and stamps serials', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-i', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-i', 'begin_review', REGISTRY)).ok).toBe(true);
    expect((await store.getTxn('txn-i'))!.txn.state).toBe('under_review');

    // the graph forbids minting here — MRV reviewed but NOT yet confirmed.
    const early = await act(deps, 'txn-i', 'issue', REGISTRY);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-i'))!.txn.state).toBe('under_review');

    // confirm verification first, THEN issue succeeds along the happy path.
    expect((await act(deps, 'txn-i', 'confirm_verification', REGISTRY)).ok).toBe(true);
    expect((await store.getTxn('txn-i'))!.txn.state).toBe('verified');
    const issued = await act(deps, 'txn-i', 'issue', REGISTRY);
    expect(issued.ok).toBe(true);

    const txn = (await store.getTxn('txn-i'))!.txn;
    expect(txn.state).toBe('issued');
    expect(txn.closed_at).not.toBeNull(); // terminal
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.issued_at).toBe('string');
    expect(txn.fields.serial_range).toBe('1000-1099');
  });
});

describe('carbon_issuance — serialRangeConsistent refuses an over-stated quantity', () => {
  it('rejects a quantity that does not match the inclusive range size (inflation vector)', async () => {
    const deps = newDeps();
    const bad = { ...baseOpen, quantity_tco2e: 101 }; // range is 100, quantity claims 101
    const r = await open(deps, 'txn-bad', bad);
    expect(r.ok).toBe(false);
  });
});
