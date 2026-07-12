// warranty_recovery — the structural approval gate, as a driven property.
//
// A warranty recovery must NEVER be settled before the vendor has accepted the
// claim. This is enforced by the state graph, not a guard: settle_recovery
// leaves ONLY recovery_approved, and the ONLY path into recovery_approved is
// approve_recovery. So from under_assessment (claim seen but not yet accepted)
// settle_recovery is an ILLEGAL_TRANSITION — the engine's step-4 state check
// refuses it before any guard runs.
//
// Failure mode this guards: someone adds under_assessment to settle_recovery's
// `from`, or reorders states so a recovery can settle on an unaccepted claim —
// a vendor then pays out (credit note) for a failure it never validated.
//
// Also pins counterpartyDistinct on approve_recovery: a vendor cannot approve a
// recovery to itself (claimant == vendor).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { warrantyRecovery } from '../../src/v2/domain/chains/warranty_recovery';
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
const VENDOR: Actor = { id: 'user-vendor', kind: 'user', participant_id: 'party-vendor' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { warranty_recovery: warrantyRecovery }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'warranty_recovery', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'warranty_recovery', edge: 'open', actor: CLAIMANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// claimant files against a distinct vendor.
const baseOpen = {
  asset_name: 'WTG-14 gearbox',
  failed_component: 'planetary gearbox',
  warranty_ref: 'OEM-WTY-2024-014',
  failure_description: 'HSS bearing spall at 3,200 rpm',
  claim_amount_zar: 850_000,
  vendor_party: VENDOR.participant_id,
};

describe('warranty_recovery — a recovery cannot settle before the vendor accepts it', () => {
  it('declares settles:false (a claim record, never a payment)', () => {
    expect(warrantyRecovery.settles).toBe(false);
  });

  it('settle_recovery from under_assessment is ILLEGAL_TRANSITION (claim not yet approved)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-w', baseOpen);
    expect((await act(deps, 'txn-w', 'begin_assessment', VENDOR)).ok).toBe(true);
    expect((await store.getTxn('txn-w'))!.txn.state).toBe('under_assessment');

    // the graph forbids settling here — the claim is under assessment, not approved.
    const early = await act(deps, 'txn-w', 'settle_recovery', VENDOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-w'))!.txn.state).toBe('under_assessment');

    // approve first, THEN settle succeeds — and stamps the timestamps.
    expect((await act(deps, 'txn-w', 'approve_recovery', VENDOR, { approved_amount_zar: 800_000 })).ok).toBe(true);
    expect((await store.getTxn('txn-w'))!.txn.state).toBe('recovery_approved');
    const settled = await act(deps, 'txn-w', 'settle_recovery', VENDOR);
    expect(settled.ok).toBe(true);

    const txn = (await store.getTxn('txn-w'))!.txn;
    expect(txn.state).toBe('recovered');
    expect(txn.fields.recovery_tier).toBe('material');
    expect(typeof txn.fields.approved_at).toBe('string');
    expect(typeof txn.fields.recovered_at).toBe('string');
  });

  it('deny_recovery without a reason_code is rejected (destructive exit needs a reason)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    const bad = await act(deps, 'txn-r', 'deny_recovery', VENDOR);
    expect(bad.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('recovery_filed');

    const good = await act(deps, 'txn-r', 'deny_recovery', VENDOR, {}, 'out_of_warranty');
    expect(good.ok).toBe(true);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('recovery_denied');
  });
});

describe('warranty_recovery — counterpartyDistinct blocks self-approval', () => {
  it('approving a recovery where the vendor IS the claimant is refused SELF_DEALING', async () => {
    const deps = newDeps();
    // claimant names itself as the vendor — it then holds both roles on the txn.
    await open(deps, 'txn-self', { ...baseOpen, vendor_party: CLAIMANT.participant_id });
    expect((await act(deps, 'txn-self', 'begin_assessment', CLAIMANT)).ok).toBe(true);

    const r = await act(deps, 'txn-self', 'approve_recovery', CLAIMANT, { approved_amount_zar: 800_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF_DEALING');
    expect((await deps.store.getTxn('txn-self'))!.txn.state).toBe('under_assessment');
  });
});
