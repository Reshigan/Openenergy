// spare_parts_provisioning — the structural inventory-issue gate, as a driven
// property.
//
// A spare part must NEVER be issued to a job before it is physically received and
// stocked. This is enforced by the state graph, not a guard: issue_part leaves
// ONLY `reserved`, `reserved` is reachable ONLY from `stocked`, and `stocked` ONLY
// from `received`. So from `po_issued` (ordered but nothing in hand) issue_part is
// an ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds `po_issued` (or `reserved` off `stocked`
// is short-circuited) to issue_part's `from`, letting phantom stock be issued to a
// work order that never physically arrived.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { sparePartsProvisioning } from '../../src/v2/domain/chains/spare_parts_provisioning';
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

const PLANNER: Actor = { id: 'user-planner', kind: 'user', participant_id: 'party-planner' };
const APPROVER: Actor = { id: 'user-approver', kind: 'user', participant_id: 'party-approver' };
const SUPPLIER_ID = 'party-supplier';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { spare_parts_provisioning: sparePartsProvisioning }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'spare_parts_provisioning', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'spare_parts_provisioning', edge: 'open', actor: PLANNER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// vital spare demand — approver + supplier named at open (parties attach here only).
const baseOpen = {
  part_number: 'ABB-3AXD50',
  asset_name: 'Main transformer TX-3',
  criticality: 'vital',
  qty_required: 2,
  stockout_impact_zar: 1_500_000,
  approver_party: APPROVER.participant_id,
  supplier_party: SUPPLIER_ID,
};

describe('spare_parts_provisioning — a part cannot issue before it is received and stocked', () => {
  it('declares settles:false (an inventory control, never a payment)', () => {
    expect(sparePartsProvisioning.settles).toBe(false);
  });

  it('drives the happy path demand → issued and refuses an early issue_part', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-s', baseOpen);
    expect((await store.getTxn('txn-s'))!.txn.fields.provisioning_tier).toBe('catastrophic');

    expect((await act(deps, 'txn-s', 'raise_requisition', PLANNER, { requisition_ref: 'REQ-1', qty_ordered: 2 })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'approve_requisition', APPROVER, { approval_ref: 'APR-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'issue_po', PLANNER, { po_ref: 'PO-1' })).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('po_issued');

    // the graph forbids issuing here — the part has been ordered, not received.
    const early = await act(deps, 'txn-s', 'issue_part', PLANNER, { issue_ref: 'ISS-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('po_issued');

    // physically move it through the chain, THEN issue succeeds.
    const supplier: Actor = { id: 'user-supplier', kind: 'user', participant_id: SUPPLIER_ID };
    expect((await act(deps, 'txn-s', 'ship', supplier, { shipment_ref: 'SHP-1', qty_ordered: 2 })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'receive', PLANNER, { receipt_ref: 'RCP-1', qty_received: 2 })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'stock', PLANNER, { warehouse: 'WH-A' })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'reserve', PLANNER, { reservation_ref: 'RSV-1', reserved_for_wo: 'WO-9' })).ok).toBe(true);
    const issued = await act(deps, 'txn-s', 'issue_part', PLANNER, { issue_ref: 'ISS-1' });
    expect(issued.ok).toBe(true);

    const txn = (await store.getTxn('txn-s'))!.txn;
    expect(txn.state).toBe('issued');
    expect(typeof txn.fields.issued_at).toBe('string');
    expect(typeof txn.fields.received_at).toBe('string');
  });

  it('rejects a destructive exit with no reason_code (cancel needs a reason)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    const r = await act(deps, 'txn-c', 'cancel', PLANNER); // no reason_code supplied
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('demand_identified');
  });
});
