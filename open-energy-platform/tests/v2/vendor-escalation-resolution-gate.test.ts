// vendor_escalation — the structural resolution gate, as a driven property.
//
// A vendor escalation must NEVER be closed before the raiser has verified the
// fix. This is enforced by the state graph, not a guard: close_escalation
// leaves ONLY remediation_verified, and the ONLY path into remediation_verified
// is verify_remediation. So from remediation_in_progress (vendor still working)
// close_escalation is an ILLEGAL_TRANSITION — the engine's step-4 state check
// refuses it before any guard runs.
//
// Failure mode this guards: someone adds remediation_in_progress (or an earlier
// state) to close_escalation's `from`, letting an escalation close on an
// unverified fix — the vendor's SLA breach is signed off without proof.
//
// Also pins regulatorPresentIfCritical: a critical-priority termination cannot
// pass `terminate` without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { vendorEscalation } from '../../src/v2/domain/chains/vendor_escalation';
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

const RAISER: Actor = { id: 'user-raiser', kind: 'user', participant_id: 'party-raiser' };
const VENDOR: Actor = { id: 'user-vendor', kind: 'user', participant_id: 'party-vendor' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { vendor_escalation: vendorEscalation }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'vendor_escalation', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'vendor_escalation', edge: 'open', actor: RAISER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// normal-priority escalation against a distinct vendor — no regulator needed.
const baseOpen = {
  vendor_party: VENDOR.participant_id,
  service_contract_ref: 'SC-2231',
  issue_summary: 'Repeated inverter response SLA breach',
  issue_category: 'response_time',
  severity: 3,
  priority: 'normal',
  escalation_level: 1,
};

describe('vendor_escalation — an escalation cannot close before remediation is verified', () => {
  it('declares settles:false (a governance control, never a payment)', () => {
    expect(vendorEscalation.settles).toBe(false);
  });

  it('close_escalation from remediation_in_progress is ILLEGAL_TRANSITION; verify then close succeeds', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'acknowledge', VENDOR, { target_resolution_hours: 24 })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'submit_remediation_plan', VENDOR, { remediation_plan_ref: 'RP-9', root_cause: 'firmware regression' })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'begin_remediation', VENDOR)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('remediation_in_progress');

    // the graph forbids closing here — the raiser has not verified the fix.
    const early = await act(deps, 'txn-e', 'close_escalation', RAISER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('remediation_in_progress');

    // verify first, THEN close succeeds — and stamps resolved_at + closed_at_esc.
    expect((await act(deps, 'txn-e', 'verify_remediation', RAISER)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('remediation_verified');
    const closed = await act(deps, 'txn-e', 'close_escalation', RAISER);
    expect(closed.ok).toBe(true);

    const txn = (await store.getTxn('txn-e'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.resolved_at).toBe('string');
    expect(typeof txn.fields.closed_at_esc).toBe('string');
  });
});

describe('vendor_escalation — regulatorPresentIfCritical gates a critical termination', () => {
  it('critical termination with NO regulator is refused at terminate', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical' });
    expect((await act(deps, 'txn-crit', 'acknowledge', VENDOR)).ok).toBe(true);

    const r = await act(deps, 'txn-crit', 'terminate', RAISER, {}, 'persistent_breach');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('acknowledged');
  });

  it('critical termination WITH a regulator party proceeds', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-crit', 'acknowledge', VENDOR)).ok).toBe(true);
    const r = await act(deps, 'txn-crit', 'terminate', RAISER, {}, 'persistent_breach');
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('terminated');
  });
});
