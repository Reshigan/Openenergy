// carbon_erpa — the forward-delivery ordering gate + serial-consistency, driven.
//
// A forward ERPA must NEVER confirm delivery before it is executed and a
// delivery scheduled. This is the state graph, not a guard: verify_delivery
// leaves ONLY delivery_scheduled, and the only path there is schedule_delivery
// from executed. So from negotiating, verify_delivery is ILLEGAL_TRANSITION —
// the engine's step-4 state check refuses it before any guard runs.
//
// Also pins serialRangeConsistent on verify_delivery: a delivered serial range
// whose size does not match the stated quantity is rejected (double-count
// vector). Failure mode guarded: someone widens verify_delivery's `from`, or
// drops the serial guard, and a forward confirms an unbacked / mis-stated tonnage.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { carbonErpa } from '../../src/v2/domain/chains/carbon_erpa';
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

const BUYER: Actor = { id: 'user-buyer', kind: 'user', participant_id: 'party-buyer' };
const SELLER_ID = 'party-seller';
const SELLER: Actor = { id: 'user-seller', kind: 'user', participant_id: SELLER_ID };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { carbon_erpa: carbonErpa }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_erpa', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_erpa', edge: 'open', actor: BUYER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_name: 'Kruger REDD+',
  registry: 'Verra',
  vintage_year: 2027,
  contracted_tco2e: 10,
  price_per_tco2e_zar: 150,
  article_6: true,
  seller_party: SELLER_ID,
};
const exec = { board_approval_ref: 'BRD-2027-11', legal_counterparty_ref: 'LEG-KRG-01' };

describe('carbon_erpa — delivery confirms only after execute + schedule', () => {
  it('declares settles:false (a delivery obligation, never a payment)', () => {
    expect(carbonErpa.settles).toBe(false);
  });

  it('drives open -> execute -> schedule -> verify to delivery_confirmed', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-e', baseOpen)).ok).toBe(true);

    // verify BEFORE executing is forbidden by the graph, not a guard.
    const early = await act(deps, 'txn-e', 'verify_delivery', BUYER, { serial_start: 1, serial_end: 10, quantity_tco2e: 10 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('negotiating');

    expect((await act(deps, 'txn-e', 'execute', SELLER, exec)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('executed');
    expect((await act(deps, 'txn-e', 'schedule_delivery', SELLER)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('delivery_scheduled');

    const done = await act(deps, 'txn-e', 'verify_delivery', BUYER, { serial_start: 1, serial_end: 10, quantity_tco2e: 10 });
    expect(done.ok).toBe(true);

    const txn = (await store.getTxn('txn-e'))!.txn;
    expect(txn.state).toBe('delivery_confirmed');
    expect(txn.fields.contract_value_zar).toBe(10 * 150);
    expect(txn.fields.delivered_tco2e).toBe(10);
    expect(txn.fields.shortfall_tco2e).toBe(0);
    expect(typeof txn.fields.delivery_confirmed_at).toBe('string');
  });
});

describe('carbon_erpa — serialRangeConsistent gates verify_delivery', () => {
  it('rejects a delivered range whose size does not match the stated quantity', async () => {
    const deps = newDeps();
    await open(deps, 'txn-s', baseOpen);
    expect((await act(deps, 'txn-s', 'execute', SELLER, exec)).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'schedule_delivery', SELLER)).ok).toBe(true);

    // serials 1..10 is 10 units, but quantity claims 9 — double-count vector.
    const bad = await act(deps, 'txn-s', 'verify_delivery', BUYER, { serial_start: 1, serial_end: 10, quantity_tco2e: 9 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('SERIAL_QUANTITY_MISMATCH');
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('delivery_scheduled');
  });
});
