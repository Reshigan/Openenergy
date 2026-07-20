// audit — the structural assurance closure gate, as a driven property.
//
// An audit must NEVER be closed while its findings are unremediated. This is
// enforced by the state graph, not a guard: close_audit leaves ONLY `verified`,
// and the ONLY path into `verified` is verify_remediation (from `remediation`,
// which only accept_response reaches). So from findings_issued close_audit is
// an ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds findings_issued (or remediation) to
// close_audit's `from`, letting an auditor sign off an engagement whose findings
// were never remediated or verified.
//
// Also pins completenessEvidencePresent: closing needs a named completeness ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { audit } from '../../src/v2/domain/chains/audit';
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

const AUDITOR: Actor = { id: 'user-auditor', kind: 'user', participant_id: 'party-auditor' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { audit }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'audit', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'audit', edge: 'open', actor: AUDITOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// routine (non-critical) engagement — no regulator needed at issue_findings.
const baseOpen = {
  audit_scope: 'NERSA licence-condition compliance FY26',
  standard: 'ISO 19011',
  priority: 'routine',
};

describe('audit — an audit cannot close while findings are unremediated', () => {
  it('declares settles:false (an assurance control, never a payment)', () => {
    expect(audit.settles).toBe(false);
  });

  it('close_audit from findings_issued is ILLEGAL_TRANSITION (remediation not yet verified)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-a', baseOpen);
    expect((await act(deps, 'txn-a', 'start_fieldwork', AUDITOR)).ok).toBe(true);
    expect((await act(deps, 'txn-a', 'issue_findings', AUDITOR, { finding_count: 2, severity: 'medium' })).ok).toBe(true);
    expect((await store.getTxn('txn-a'))!.txn.state).toBe('findings_issued');

    // the graph forbids closing here — findings are open, remediation unverified.
    const early = await act(deps, 'txn-a', 'close_audit', AUDITOR, { completeness_ref: 'CMP-2026-001' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-a'))!.txn.state).toBe('findings_issued');

    // remediate + verify first, THEN close succeeds — and stamps closed_at.
    expect((await act(deps, 'txn-a', 'accept_response', AUDITOR, { management_response: 'accepted', remediation_plan: 'patch + retrain' })).ok).toBe(true);
    expect((await act(deps, 'txn-a', 'verify_remediation', AUDITOR)).ok).toBe(true);
    expect((await store.getTxn('txn-a'))!.txn.state).toBe('verified');

    const closed = await act(deps, 'txn-a', 'close_audit', AUDITOR, { completeness_ref: 'CMP-2026-001' });
    expect(closed.ok).toBe(true);

    const txn = (await store.getTxn('txn-a'))!.txn;
    expect(txn.state).toBe('audit_closed');
    expect(typeof txn.fields.findings_issued_at).toBe('string');
    expect(typeof txn.fields.closed_at_audit).toBe('string');
  });
});

describe('audit — completenessEvidencePresent gates closure', () => {
  it('close_audit with NO completeness_ref is refused at the verified state', async () => {
    const deps = newDeps();
    await open(deps, 'txn-b', baseOpen);
    expect((await act(deps, 'txn-b', 'start_fieldwork', AUDITOR)).ok).toBe(true);
    expect((await act(deps, 'txn-b', 'issue_findings', AUDITOR, { finding_count: 1, severity: 'low' })).ok).toBe(true);
    expect((await act(deps, 'txn-b', 'accept_response', AUDITOR, { management_response: 'accepted', remediation_plan: 'fix' })).ok).toBe(true);
    expect((await act(deps, 'txn-b', 'verify_remediation', AUDITOR)).ok).toBe(true);

    const r = await act(deps, 'txn-b', 'close_audit', AUDITOR);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-b'))!.txn.state).toBe('verified');
  });
});
