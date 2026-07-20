// warranty_claim — the structural liability gate, as a driven property.
//
// A vendor must NEVER begin remediation on a claim it has not accepted. This is
// enforced by the state graph, not a guard: start_remediation leaves ONLY
// claim_accepted, and the ONLY path into claim_accepted is accept_claim. So
// from under_assessment (assessed but not accepted) start_remediation is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it.
//
// Failure mode this guards: someone adds under_assessment to start_remediation's
// `from`, or lets close_claim fire before remediation_complete — a vendor bills
// remediation on a claim it never owned, or a claim closes on a fix that never
// happened.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { warrantyClaim } from '../../src/v2/domain/chains/warranty_claim';
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
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { warranty_claim: warrantyClaim }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'warranty_claim', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'warranty_claim', edge: 'open', actor: CLAIMANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  asset_name: 'Inverter INV-07',
  component_name: 'IGBT power module',
  defect_description: 'Repeated overtemp trips at rated load',
  claimed_amount: 250_000,
  vendor_party: VENDOR.participant_id,
};

describe('warranty_claim — remediation cannot start before the claim is accepted', () => {
  it('declares settles:false (an operational recovery, never a payment)', () => {
    expect(warrantyClaim.settles).toBe(false);
  });

  it('start_remediation from under_assessment is ILLEGAL_TRANSITION; the full happy path closes', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-w', baseOpen);
    expect((await act(deps, 'txn-w', 'begin_assessment', VENDOR)).ok).toBe(true);
    expect((await store.getTxn('txn-w'))!.txn.state).toBe('under_assessment');
    // begin_assessment derived the severity tier off the claimed amount.
    expect((await store.getTxn('txn-w'))!.txn.fields.severity_tier).toBe('significant');

    // the graph forbids remediating here — the claim is assessed but NOT accepted.
    const early = await act(deps, 'txn-w', 'start_remediation', VENDOR, { remediation_plan: 'swap module' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-w'))!.txn.state).toBe('under_assessment');

    // accept first, THEN remediate → complete → close (happy path).
    expect((await act(deps, 'txn-w', 'accept_claim', VENDOR, { remedy_type: 'replace' })).ok).toBe(true);
    expect((await store.getTxn('txn-w'))!.txn.state).toBe('claim_accepted');
    expect((await act(deps, 'txn-w', 'start_remediation', VENDOR, { remediation_plan: 'swap module' })).ok).toBe(true);
    expect((await act(deps, 'txn-w', 'complete_remediation', VENDOR)).ok).toBe(true);
    expect((await store.getTxn('txn-w'))!.txn.state).toBe('remediation_complete');
    expect((await act(deps, 'txn-w', 'close_claim', CLAIMANT)).ok).toBe(true);

    const txn = (await store.getTxn('txn-w'))!.txn;
    expect(txn.state).toBe('claim_closed');
    expect(typeof txn.fields.accepted_at).toBe('string');
    expect(typeof txn.fields.remediation_completed_at).toBe('string');
    expect(typeof txn.fields.closed_at_wc).toBe('string');
  });
});

describe('warranty_claim — a rejection needs a structured reason code', () => {
  it('reject_claim without a reason_code is refused (BAD_INPUT)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    const bad = await act(deps, 'txn-r', 'reject_claim', VENDOR); // no reason_code
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('claim_submitted');

    const ok = await act(deps, 'txn-r', 'reject_claim', VENDOR, {}, 'out_of_warranty');
    expect(ok.ok).toBe(true);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('claim_rejected');
  });
});
