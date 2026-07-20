// green_tariff — the approval gate, as a driven property.
//
// Two things are pinned here:
//  1. The structural order: an enrollment walks requested → verified → approved
//     → active through REAL transitions, and each step stamps its derive
//     timestamp. `approve` only leaves `verified`, `activate` only leaves
//     `approved` — the graph makes eligibility verification unskippable.
//  2. The seam: `approve` is guarded by complianceHaltClear. Under a platform
//     compliance halt, a verified enrollment CANNOT be approved — the edge is
//     refused (COMPLIANCE_HALT) and the state stays `verified`.
//
// Also pins settles:false (an enrollment registration is never a payment).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { greenTariff } from '../../src/v2/domain/chains/green_tariff';
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

const CUSTOMER: Actor = { id: 'user-customer', kind: 'user', participant_id: 'party-customer' };
const UTILITY: Actor = { id: 'user-utility', kind: 'user', participant_id: 'party-utility' };

function newDeps(store = new MemoryStore()): EngineDeps {
  return { store, clock: counterClock(), ids: counterIds(), chains: { green_tariff: greenTariff }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(
  deps: EngineDeps,
  txnId: string,
  edge: string,
  actor: Actor,
  input: Record<string, unknown> = {},
  reason_code?: string,
) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'green_tariff', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'green_tariff', edge: 'open', actor: CUSTOMER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// small (<100 MW) enrollment: regulatorPresentIfStrategic is a no-op, so no
// regulator party is needed on the happy path. utility supplied at @new so it
// can fire verify/approve/activate.
const baseOpen = {
  customer_name: 'Acme Foundry',
  tariff_product: '100% renewable',
  capacity_mw: 5,
  utility_party: UTILITY.participant_id,
};

describe('green_tariff — verify → approve → active, with the compliance-halt gate on approve', () => {
  it('declares settles:false (an enrollment registration is not a payment)', () => {
    expect(greenTariff.settles).toBe(false);
  });

  it('walks the happy path through real transitions and stamps each derive timestamp', async () => {
    const deps = newDeps();
    const r0 = await open(deps, 'txn-gt', baseOpen);
    expect(r0.ok).toBe(true);
    expect((await deps.store.getTxn('txn-gt'))!.txn.state).toBe('requested');

    const r1 = await act(deps, 'txn-gt', 'verify', UTILITY, { eligibility_evidence_ref: 'ELIG-001' });
    expect(r1.ok).toBe(true);
    expect((await deps.store.getTxn('txn-gt'))!.txn.state).toBe('verified');

    const r2 = await act(deps, 'txn-gt', 'approve', UTILITY);
    expect(r2.ok).toBe(true);
    expect((await deps.store.getTxn('txn-gt'))!.txn.state).toBe('approved');

    const r3 = await act(deps, 'txn-gt', 'activate', UTILITY);
    expect(r3.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-gt'))!.txn;
    expect(txn.state).toBe('active');
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.approved_at).toBe('string');
    expect(typeof txn.fields.activated_at).toBe('string'); // derive stamped the instant
  });

  it('under a compliance halt, approving a verified enrollment is refused (COMPLIANCE_HALT), state unmoved', async () => {
    const store = new MemoryStore();
    const deps = newDeps(store);
    await open(deps, 'txn-halt', baseOpen);
    await act(deps, 'txn-halt', 'verify', UTILITY, { eligibility_evidence_ref: 'ELIG-002' });
    expect((await store.getTxn('txn-halt'))!.txn.state).toBe('verified');

    store.setReference('compliance:halt', { directive: 'POPIA-2026-07' });

    const r = await act(deps, 'txn-halt', 'approve', UTILITY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('COMPLIANCE_HALT');

    // rejected transition commits a .rejected event but the state does not move.
    expect((await store.getTxn('txn-halt'))!.txn.state).toBe('verified');
  });
});
