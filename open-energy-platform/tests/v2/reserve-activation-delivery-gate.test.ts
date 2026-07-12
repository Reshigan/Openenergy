// reserve_activation — the structural delivery→settlement gate, as a driven property.
//
// A reserve settlement must NEVER be instructed before delivery is metered and
// verified. This is enforced by the state graph, not a guard: instruct_settlement
// leaves ONLY delivery_verified, whose only inbound edge is verify_delivery, whose
// only inbound edge is report_delivery from `dispatched`. So from `delivered`
// (reported but not yet verified) instruct_settlement is an ILLEGAL_TRANSITION —
// the engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds `delivered` (or earlier) to
// instruct_settlement's `from`, letting a utilisation payment rest on reserve
// energy that was never verified against the instructed volume.
//
// Also pins regulatorPresentIfCritical: a critical (system-emergency) activation
// cannot open without a regulator (NERSA) on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { reserveActivation } from '../../src/v2/domain/chains/reserve_activation';
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

const GRID: Actor = { id: 'user-grid', kind: 'user', participant_id: 'party-grid' };
const PROVIDER: Actor = { id: 'user-provider', kind: 'user', participant_id: 'party-provider' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { reserve_activation: reserveActivation }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'reserve_activation', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'reserve_activation', edge: 'open', actor: GRID, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// routine (normal-priority) reserve call — provider named, no regulator needed.
const baseOpen = {
  reserve_product: 'ten_minute',
  event_date: '2026-07-12',
  instructed_mw: 50,
  provider_party: PROVIDER.participant_id,
};

describe('reserve_activation — settlement cannot be instructed before delivery is verified', () => {
  it('declares settles:false (records a settlement instruction, moves no money)', () => {
    expect(reserveActivation.settles).toBe(false);
  });

  it('drives the happy path instruct → … → settlement_instructed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-ra', baseOpen);
    expect((await act(deps, 'txn-ra', 'acknowledge', PROVIDER)).ok).toBe(true);
    expect((await act(deps, 'txn-ra', 'dispatch', PROVIDER, { activation_start: '2026-07-12T10:00:00Z' })).ok).toBe(true);
    expect((await act(deps, 'txn-ra', 'report_delivery', PROVIDER, { delivered_mw: 48, delivered_mwh: 8 })).ok).toBe(true);
    expect((await act(deps, 'txn-ra', 'verify_delivery', GRID)).ok).toBe(true);
    const settled = await act(deps, 'txn-ra', 'instruct_settlement', GRID, { settlement_amount_zar: 120_000 });
    expect(settled.ok).toBe(true);

    const txn = (await store.getTxn('txn-ra'))!.txn;
    expect(txn.state).toBe('settlement_instructed');
    expect(txn.fields.performance_pct).toBe(96);
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.settled_at).toBe('string');
  });

  it('instruct_settlement from `delivered` is ILLEGAL_TRANSITION (delivery not yet verified)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-ra', baseOpen);
    expect((await act(deps, 'txn-ra', 'acknowledge', PROVIDER)).ok).toBe(true);
    expect((await act(deps, 'txn-ra', 'dispatch', PROVIDER)).ok).toBe(true);
    expect((await act(deps, 'txn-ra', 'report_delivery', PROVIDER, { delivered_mw: 48 })).ok).toBe(true);
    expect((await store.getTxn('txn-ra'))!.txn.state).toBe('delivered');

    // the graph forbids settling here — delivery reported but NOT verified.
    const early = await act(deps, 'txn-ra', 'instruct_settlement', GRID, { settlement_amount_zar: 120_000 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-ra'))!.txn.state).toBe('delivered');
  });
});

describe('reserve_activation — regulatorPresentIfCritical gates a critical activation', () => {
  it('critical activation with NO regulator is refused at open', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
  });

  it('critical activation WITH a regulator party opens cleanly', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('instructed');
  });
});
