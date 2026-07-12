// compliance_inspection — the structural closure gate, as a driven property.
//
// An inspection must NEVER be closed compliant while findings sit unanswered.
// This is enforced by the state graph, not a guard: close_compliant leaves ONLY
// response_received, and the ONLY path into response_received is licensee_respond
// (from findings_issued). So from findings_issued, close_compliant is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds findings_issued to close_compliant's
// `from`, so a regulator can rubber-stamp an inspection the licensee never
// answered.
//
// Also pins completenessEvidencePresent: findings cannot issue without a named
// completeness-evidence ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { complianceInspection } from '../../src/v2/domain/chains/compliance_inspection';
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

const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };
const LICENSEE: Actor = { id: 'user-licensee', kind: 'user', participant_id: 'party-licensee' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { compliance_inspection: complianceInspection }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'compliance_inspection', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'compliance_inspection', edge: 'open', actor: REGULATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  facility_name: 'Kusile Unit 3',
  inspection_type: 'routine',
  scope: 'Emissions & isolation compliance',
  licensee_party: LICENSEE.participant_id,
};

describe('compliance_inspection — cannot close compliant while findings are unanswered', () => {
  it('declares settles:false (a supervisory control, never a payment)', () => {
    expect(complianceInspection.settles).toBe(false);
  });

  it('close_compliant from findings_issued is ILLEGAL_TRANSITION; happy path closes only after a response', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'serve_notice', REGULATOR, { notice_ref: 'NT-9001' })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'conduct_inspection', REGULATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'issue_findings', REGULATOR, { finding_count: 2, completeness_ref: 'PACK-77' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('findings_issued');

    // the graph forbids closing here — the licensee has not yet responded.
    const early = await act(deps, 'txn-c', 'close_compliant', REGULATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('findings_issued');

    // respond first, THEN close succeeds — and stamps closed_at_comp + severity_tier.
    expect((await act(deps, 'txn-c', 'licensee_respond', LICENSEE, { remediation_ref: 'RP-5' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('response_received');
    expect((await act(deps, 'txn-c', 'close_compliant', REGULATOR)).ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('closed_compliant');
    expect(txn.fields.severity_tier).toBe('minor');
    expect(typeof txn.fields.findings_issued_at).toBe('string');
    expect(typeof txn.fields.closed_at_comp).toBe('string');
  });
});

describe('compliance_inspection — completenessEvidencePresent gates findings', () => {
  it('issue_findings with no completeness_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-f', baseOpen);
    expect((await act(deps, 'txn-f', 'serve_notice', REGULATOR, { notice_ref: 'NT-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-f', 'conduct_inspection', REGULATOR)).ok).toBe(true);

    const r = await act(deps, 'txn-f', 'issue_findings', REGULATOR, { finding_count: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-f'))!.txn.state).toBe('inspection_conducted');
  });
});
