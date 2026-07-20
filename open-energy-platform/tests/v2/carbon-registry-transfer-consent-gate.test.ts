// carbon_registry_transfer — the structural transferee-consent gate, as a driven property.
//
// Serials must NEVER be moved into another account without that account holder
// accepting. This is enforced by the state graph, not a guard: execute_transfer
// leaves ONLY `accepted`, and the ONLY path into `accepted` is the transferee's
// accept edge. So from `proposed` (offered but not yet accepted) execute_transfer
// is an ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds `proposed` to execute_transfer's `from`,
// or lets the registry settle without the transferee's accept — serials then land
// in an account that never consented to receive them (a forced double-count vector).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { carbonRegistryTransfer } from '../../src/v2/domain/chains/carbon_registry_transfer';
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

const TRANSFEROR: Actor = { id: 'user-transferor', kind: 'user', participant_id: 'party-transferor' };
const TRANSFEREE: Actor = { id: 'user-transferee', kind: 'user', participant_id: 'party-transferee' };
const REGISTRY: Actor = { id: 'user-registry', kind: 'user', participant_id: 'party-registry' };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { carbon_registry_transfer: carbonRegistryTransfer },
    guards: GUARDS,
  };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'carbon_registry_transfer',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      reason_code,
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_registry_transfer', edge: 'open', actor: TRANSFEROR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// serial 1001..1100 inclusive = 100 credits; quantity must equal that range size.
const baseOpen = {
  registry: 'VCS',
  project_ref: 'VCS-1234',
  serial_start: 1001,
  serial_end: 1100,
  quantity_tco2e: 100,
  transferor_account: 'ACC-A',
  transferee_account: 'ACC-B',
  transferee_party: TRANSFEREE.participant_id,
  registry_party: REGISTRY.participant_id,
};

describe('carbon_registry_transfer — serials cannot settle before the transferee accepts', () => {
  it('declares settles:false (a registry custody instruction, never a payment)', () => {
    expect(carbonRegistryTransfer.settles).toBe(false);
  });

  it('drives the happy path open → propose → accept → execute to transferred', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'propose', TRANSFEROR)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'accept', TRANSFEREE)).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('accepted');
    expect((await act(deps, 'txn-h', 'execute_transfer', REGISTRY)).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('transferred');
    expect(typeof txn.fields.accepted_at).toBe('string');
    expect(typeof txn.fields.transferred_at).toBe('string');
  });

  it('execute_transfer from proposed is ILLEGAL_TRANSITION (transferee has not accepted)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-x', baseOpen);
    expect((await act(deps, 'txn-x', 'propose', TRANSFEROR)).ok).toBe(true);
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('proposed');

    const early = await act(deps, 'txn-x', 'execute_transfer', REGISTRY);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('proposed');
  });
});

describe('carbon_registry_transfer — serialRangeConsistent guards the open edge', () => {
  it('a mis-stated quantity vs serial range is refused (serialRangeConsistent)', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-bad', { ...baseOpen, quantity_tco2e: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SERIAL_QUANTITY_MISMATCH');
  });
});
