// rec_issuance — the structural mint gate, as a driven property.
//
// A REC must NEVER be minted before the metered production is confirmed. This
// is enforced by the state graph, not a guard: `issue` leaves ONLY
// `metering_confirmed`, and the ONLY path into `metering_confirmed` is
// `confirm_metering`. So from `under_review` (metering not yet confirmed)
// `issue` is an ILLEGAL_TRANSITION — the engine's step-4 state check refuses it
// before any guard runs.
//
// Failure mode this guards: someone adds `under_review` (or `requested`) to
// `issue`'s `from`, or reorders the states so certificates can mint on
// unconfirmed metering — inflating the REC market with phantom generation.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { recIssuance } from '../../src/v2/domain/chains/rec_issuance';
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
const REGISTRAR: Actor = { id: 'user-registrar', kind: 'user', participant_id: 'party-registrar' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { rec_issuance: recIssuance }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'rec_issuance', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'rec_issuance', edge: 'open', actor: HOLDER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// a wind device claiming 500 RECs (500 MWh) for one quarter, serials 1..500.
const baseOpen = {
  registry: 'I-REC',
  device_ref: 'ZA-WIND-0042',
  production_period: '2026-Q1',
  fuel_type: 'wind',
  metering_evidence_ref: 'MTR-2026Q1-0042',
  mwh_generated: 500,
  serial_start: 1,
  serial_end: 500,
  quantity_certs: 500,
  registrar_party: REGISTRAR.participant_id,
};

describe('rec_issuance — RECs cannot mint before metering is confirmed', () => {
  it('declares settles:false (a registry act, never a payment)', () => {
    expect(recIssuance.settles).toBe(false);
  });

  it('happy path drives open -> issued and stamps issued_at + serial_range', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-r', baseOpen);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('requested');
    expect((await act(deps, 'txn-r', 'begin_review', REGISTRAR)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'confirm_metering', REGISTRAR)).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('metering_confirmed');

    const issued = await act(deps, 'txn-r', 'issue', REGISTRAR);
    expect(issued.ok).toBe(true);
    const txn = (await store.getTxn('txn-r'))!.txn;
    expect(txn.state).toBe('issued');
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.issued_at).toBe('string');
    expect(txn.fields.serial_range).toBe('1-500');
  });

  it('issue from under_review is ILLEGAL_TRANSITION (metering not yet confirmed)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-early', baseOpen);
    expect((await act(deps, 'txn-early', 'begin_review', REGISTRAR)).ok).toBe(true);
    expect((await store.getTxn('txn-early'))!.txn.state).toBe('under_review');

    // the graph forbids minting here — metering is under review, not confirmed.
    const early = await act(deps, 'txn-early', 'issue', REGISTRAR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-early'))!.txn.state).toBe('under_review');
  });
});
