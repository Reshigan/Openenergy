// black_start — the structural certification gate, as a driven property.
//
// A black-start capability must NEVER be certified into the restoration plan
// before its live test is witnessed. This is enforced by the state graph, not a
// guard: certify leaves ONLY test_witnessed, and the ONLY path into test_witnessed
// is witness_test. So from test_scheduled (test booked but not yet witnessed)
// certify is an ILLEGAL_TRANSITION — the engine's step-4 state check refuses it
// before any guard runs.
//
// Failure mode this guards: someone adds test_scheduled (or under_assessment) to
// certify's `from`, so an untested unit gets listed as a restoration anchor — the
// operator later calls it during a blackout and it fails to crank.
//
// Also pins regulatorPresentIfStrategic: a >=100 MW anchor unit cannot be certified
// without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { blackStart } from '../../src/v2/domain/chains/black_start';
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

const PROVIDER: Actor = { id: 'user-provider', kind: 'user', participant_id: 'party-provider' };
const OPERATOR: Actor = { id: 'user-operator', kind: 'user', participant_id: 'party-operator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { black_start: blackStart }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'black_start', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'black_start', edge: 'open', actor: PROVIDER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// local (small) black-start unit — no regulator required for certification.
const baseOpen = {
  unit_name: 'GT-2 open-cycle gas turbine',
  station_name: 'Ankerlig',
  capacity_mw: 40,
  cranking_source: 'diesel',
  restoration_role: 'support',
  operator_party: OPERATOR.participant_id,
};

describe('black_start — a capability cannot be certified before its test is witnessed', () => {
  it('declares settles:false (a grid control, never a payment)', () => {
    expect(blackStart.settles).toBe(false);
  });

  it('certify from test_scheduled is ILLEGAL_TRANSITION; the full happy path reaches restoration_complete', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-bs', baseOpen);
    expect((await act(deps, 'txn-bs', 'begin_assessment', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-bs', 'schedule_test', OPERATOR, { test_window: '2026-08-01T02:00Z/04:00Z' })).ok).toBe(true);
    expect((await store.getTxn('txn-bs'))!.txn.state).toBe('test_scheduled');

    // the graph forbids certifying here — the test is booked but NOT witnessed.
    const early = await act(deps, 'txn-bs', 'certify', OPERATOR, { certificate_ref: 'CERT-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-bs'))!.txn.state).toBe('test_scheduled');

    // witness first, THEN certify succeeds — and stamps tested_at + certified_at.
    expect((await act(deps, 'txn-bs', 'witness_test', OPERATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-bs'))!.txn.state).toBe('test_witnessed');
    expect((await act(deps, 'txn-bs', 'certify', OPERATOR, { certificate_ref: 'CERT-1' })).ok).toBe(true);

    // drive the restoration through to the terminal state.
    expect((await act(deps, 'txn-bs', 'activate', OPERATOR, { incident_ref: 'INC-2026-08' })).ok).toBe(true);
    expect((await act(deps, 'txn-bs', 'confirm_restoration', PROVIDER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-bs'))!.txn;
    expect(txn.state).toBe('restoration_complete');
    expect(typeof txn.fields.tested_at).toBe('string');
    expect(typeof txn.fields.certified_at).toBe('string');
    expect(typeof txn.fields.restored_at).toBe('string');
  });
});

describe('black_start — regulatorPresentIfStrategic gates certification of anchor units', () => {
  const anchorOpen = { ...baseOpen, capacity_mw: 250, restoration_role: 'anchor' };

  async function driveToWitnessed(deps: EngineDeps, txnId: string, extra: Record<string, unknown>) {
    await open(deps, txnId, { ...anchorOpen, ...extra });
    await act(deps, txnId, 'begin_assessment', OPERATOR);
    await act(deps, txnId, 'schedule_test', OPERATOR, { test_window: 'w' });
    await act(deps, txnId, 'witness_test', OPERATOR);
  }

  it('a 250 MW anchor with NO regulator is refused at certify', async () => {
    const deps = newDeps();
    await driveToWitnessed(deps, 'txn-anchor', {});
    const r = await act(deps, 'txn-anchor', 'certify', OPERATOR, { certificate_ref: 'CERT-A' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-anchor'))!.txn.state).toBe('test_witnessed');
  });

  it('a 250 MW anchor WITH a regulator party clears certification', async () => {
    const deps = newDeps();
    await driveToWitnessed(deps, 'txn-anchor', { regulator_party: REGULATOR_ID });
    const r = await act(deps, 'txn-anchor', 'certify', OPERATOR, { certificate_ref: 'CERT-A' });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-anchor'))!.txn.state).toBe('certified');
  });
});
