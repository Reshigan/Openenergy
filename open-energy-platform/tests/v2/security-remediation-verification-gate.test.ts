// security_remediation — the structural verification gate, as a driven property.
//
// A CVE must NEVER be marked `resolved` on a patch that was never verified. This is
// enforced by the state graph, not a guard: `resolve` leaves ONLY `verification`, and
// the ONLY path into `verification` is `verify` from `rollout_in_progress`. So from
// `remediation_approved` (approved, but nothing rolled out or verified) `resolve` is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds remediation_approved (or verification's source)
// to resolve's `from`, letting a vulnerability be closed out on evidence never checked.
//
// Also pins regulatorPresentIfCritical: a critical-severity (reportable) advisory cannot
// pass approve_remediation without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { securityRemediation } from '../../src/v2/domain/chains/security_remediation';
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

const SUPPORT: Actor = { id: 'user-support', kind: 'user', participant_id: 'party-support' };
const OPERATOR: Actor = { id: 'user-operator', kind: 'user', participant_id: 'party-operator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { security_remediation: securityRemediation }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'security_remediation', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'security_remediation', edge: 'open', actor: SUPPORT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// medium-severity advisory — operator named, no regulator needed.
const baseOpen = {
  advisory_ref: 'ICSA-26-001',
  advisory_source: 'ics_cert',
  cve_id: 'CVE-2026-0001',
  oem_vendor: 'Sungrow',
  product_family: 'SG-inverter',
  ci_type: 'inverter',
  operator_party: OPERATOR.participant_id,
};

describe('security_remediation — a CVE cannot resolve without a verified rollout', () => {
  it('declares settles:false (a safety/compliance control, never a payment)', () => {
    expect(securityRemediation.settles).toBe(false);
  });

  it('drives the happy path to resolved and refuses resolve before verification', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'triage', SUPPORT, { cvss_score: 6.5, priority: 'medium' })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'assess_impact', SUPPORT, { affected_ci_count: 40, sites_affected: 3 })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'apply_mitigation', SUPPORT, { compensating_control: 'segment OT VLAN' })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'scope_fleet', SUPPORT, { patch_package_ref: 'PKG-9', fixed_version: '2.4.1' })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'approve_remediation', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'begin_rollout', OPERATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('rollout_in_progress');

    // rollout is in progress but NOT yet verified — the graph forbids resolving.
    // (resolve leaves ONLY verification.)
    const early = await act(deps, 'txn-r', 'resolve', SUPPORT);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('rollout_in_progress');

    // verify first, THEN resolve succeeds — and stamps the timestamps.
    expect((await act(deps, 'txn-r', 'verify', SUPPORT, { patched_ci_count: 40 })).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('verification');
    const resolved = await act(deps, 'txn-r', 'resolve', SUPPORT);
    expect(resolved.ok).toBe(true);

    const txn = (await store.getTxn('txn-r'))!.txn;
    expect(txn.state).toBe('resolved');
    expect(typeof txn.fields.verification_at).toBe('string');
    expect(typeof txn.fields.resolved_at).toBe('string');
  });

  it('resolve from remediation_approved (skipping rollout + verification) is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    await open(deps, 'txn-skip', baseOpen);
    await act(deps, 'txn-skip', 'triage', SUPPORT, { cvss_score: 5, priority: 'medium' });
    await act(deps, 'txn-skip', 'assess_impact', SUPPORT, { affected_ci_count: 1 });
    await act(deps, 'txn-skip', 'apply_mitigation', SUPPORT, { compensating_control: 'acl' });
    await act(deps, 'txn-skip', 'scope_fleet', SUPPORT, { patch_package_ref: 'PKG-1' });
    expect((await act(deps, 'txn-skip', 'approve_remediation', OPERATOR)).ok).toBe(true);

    const r = await act(deps, 'txn-skip', 'resolve', SUPPORT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');
    expect((await deps.store.getTxn('txn-skip'))!.txn.state).toBe('remediation_approved');
  });
});

describe('security_remediation — regulatorPresentIfCritical gates approval', () => {
  it('critical advisory with NO regulator is refused at approve_remediation', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', baseOpen);
    expect((await act(deps, 'txn-crit', 'triage', SUPPORT, { cvss_score: 9.8, priority: 'critical' })).ok).toBe(true);
    await act(deps, 'txn-crit', 'assess_impact', SUPPORT, { affected_ci_count: 200 });
    await act(deps, 'txn-crit', 'apply_mitigation', SUPPORT, { compensating_control: 'disable port' });
    await act(deps, 'txn-crit', 'scope_fleet', SUPPORT, { patch_package_ref: 'PKG-C' });

    const r = await act(deps, 'txn-crit', 'approve_remediation', OPERATOR);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('fleet_scoped');
  });

  it('critical advisory WITH a regulator party clears approval', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit2', { ...baseOpen, regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-crit2', 'triage', SUPPORT, { cvss_score: 9.8, priority: 'critical' })).ok).toBe(true);
    await act(deps, 'txn-crit2', 'assess_impact', SUPPORT, { affected_ci_count: 200 });
    await act(deps, 'txn-crit2', 'apply_mitigation', SUPPORT, { compensating_control: 'disable port' });
    await act(deps, 'txn-crit2', 'scope_fleet', SUPPORT, { patch_package_ref: 'PKG-C' });

    const r = await act(deps, 'txn-crit2', 'approve_remediation', OPERATOR);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit2'))!.txn.state).toBe('remediation_approved');
  });
});
