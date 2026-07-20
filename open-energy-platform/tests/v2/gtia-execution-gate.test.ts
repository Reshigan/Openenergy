// gtia — the structural execution gate, as a driven property.
//
// A GTIA must NEVER execute before BOTH protection settings AND the SCADA
// interface are agreed. This is enforced by the state graph, not a guard:
// execute leaves ONLY scada_agreed, and the ONLY path into scada_agreed is
// agree_scada, which itself only fires from protection_agreed. So from
// protection_agreed (protection done, SCADA not yet) execute is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds protection_agreed (or so_under_review)
// to execute's `from`, letting a grid connection go live on an unagreed SCADA
// interface or unagreed protection settings.
//
// Also pins regulatorPresentIfStrategic: a ≥100 MW (bulk) connection cannot
// execute without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { gtia } from '../../src/v2/domain/chains/gtia';
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

const IPP: Actor = { id: 'user-ipp', kind: 'user', participant_id: 'party-ipp' };
const SO: Actor = { id: 'user-so', kind: 'user', participant_id: 'party-so' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { gtia }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'gtia', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'gtia', edge: 'open', actor: IPP, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// small (non-strategic) connection — SO named, no regulator needed.
const baseOpen = {
  project_ref: 'IPP-2026-017',
  capacity_mw: 45,
  connection_voltage_kv: 132,
  connection_type: 'transmission',
  so_party: SO.participant_id,
};

// drive @new -> scada_agreed (both technical interfaces agreed).
async function driveToScadaAgreed(deps: EngineDeps, txnId: string, openInput: Record<string, unknown>) {
  await open(deps, txnId, openInput);
  expect((await act(deps, txnId, 'begin_review', SO)).ok).toBe(true);
  expect((await act(deps, txnId, 'agree_protection', SO, { protection_settings_ref: 'PROT-99' })).ok).toBe(true);
  expect((await act(deps, txnId, 'agree_scada', SO, { scada_point_list_ref: 'PTS-42' })).ok).toBe(true);
}

describe('gtia — a GTIA cannot execute before protection AND scada are agreed', () => {
  it('declares settles:false (a network control, never a payment)', () => {
    expect(gtia.settles).toBe(false);
  });

  it('execute from protection_agreed is ILLEGAL_TRANSITION (scada not yet agreed)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'begin_review', SO)).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'agree_protection', SO, { protection_settings_ref: 'PROT-99' })).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('protection_agreed');

    // the graph forbids executing here — SCADA interface is NOT yet agreed.
    const early = await act(deps, 'txn-g', 'execute', SO);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('protection_agreed');

    // agree SCADA first, THEN execute succeeds — and stamps executed_at.
    expect((await act(deps, 'txn-g', 'agree_scada', SO, { scada_point_list_ref: 'PTS-42' })).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('scada_agreed');
    const done = await act(deps, 'txn-g', 'execute', SO);
    expect(done.ok).toBe(true);

    const txn = (await store.getTxn('txn-g'))!.txn;
    expect(txn.state).toBe('gtia_executed');
    expect(typeof txn.fields.protection_agreed_at).toBe('string');
    expect(typeof txn.fields.scada_agreed_at).toBe('string');
    expect(typeof txn.fields.executed_at).toBe('string');
  });
});

describe('gtia — regulatorPresentIfStrategic gates execution of bulk connections', () => {
  it('a >=100 MW GTIA with NO regulator is refused at execute', async () => {
    const deps = newDeps();
    await driveToScadaAgreed(deps, 'txn-big', { ...baseOpen, capacity_mw: 150 });

    const r = await act(deps, 'txn-big', 'execute', SO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-big'))!.txn.state).toBe('scada_agreed');
  });

  it('a >=100 MW GTIA WITH a regulator party executes', async () => {
    const deps = newDeps();
    await driveToScadaAgreed(deps, 'txn-big', { ...baseOpen, capacity_mw: 150, regulator_party: REGULATOR_ID });

    const r = await act(deps, 'txn-big', 'execute', SO);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-big'))!.txn.state).toBe('gtia_executed');
  });
});
