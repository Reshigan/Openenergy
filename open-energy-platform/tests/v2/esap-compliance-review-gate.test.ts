// esap_compliance — the review-before-compliant structural gate, as a driven
// property.
//
// An ESAP monitoring period must NEVER be closed compliant without a submitted,
// reviewed report. This is enforced by the state graph, not a guard:
// close_compliant leaves ONLY findings_review or remediation_submitted, and the
// only way into findings_review is submit_report → begin_review. So from
// monitoring_period_open, close_compliant is an ILLEGAL_TRANSITION — the
// engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds monitoring_period_open to
// close_compliant's `from`, letting a monitor rubber-stamp a financed project's
// E&S compliance without ever tabling or reviewing a report.
//
// Also pins completenessEvidencePresent: a report cannot be submitted without a
// completeness-evidence ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { esapCompliance } from '../../src/v2/domain/chains/esap_compliance';
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

const MONITOR: Actor = { id: 'user-monitor', kind: 'user', participant_id: 'party-monitor' };
const DEVELOPER: Actor = { id: 'user-developer', kind: 'user', participant_id: 'party-developer' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { esap_compliance: esapCompliance }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'esap_compliance', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'esap_compliance', edge: 'open', actor: MONITOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_id: 'Karusa Wind',
  reporting_period: 'Annual 2025',
  commitment_tier: 'significant',
  developer_party: DEVELOPER.participant_id,
};

describe('esap_compliance — a period cannot close compliant without a reviewed report', () => {
  it('declares settles:false (a monitoring control, never a payment)', () => {
    expect(esapCompliance.settles).toBe(false);
  });

  it('close_compliant from monitoring_period_open is ILLEGAL_TRANSITION (no report reviewed)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('monitoring_period_open');

    // the graph forbids closing compliant here — nothing has been submitted.
    const early = await act(deps, 'txn-e', 'close_compliant', MONITOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('monitoring_period_open');

    // submit → review → THEN close succeeds and stamps timestamps.
    expect((await act(deps, 'txn-e', 'submit_report', DEVELOPER, { report_ref: 'ESR-2025', completeness_ref: 'CMP-88' })).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('report_submitted');
    expect((await act(deps, 'txn-e', 'begin_review', MONITOR, { finding_count_minor: 0, finding_count_major: 0 })).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('findings_review');

    const closed = await act(deps, 'txn-e', 'close_compliant', MONITOR);
    expect(closed.ok).toBe(true);

    const txn = (await store.getTxn('txn-e'))!.txn;
    expect(txn.state).toBe('compliant');
    expect(txn.fields.finding_severity).toBe('clean');
    expect(typeof txn.fields.submitted_at).toBe('string');
    expect(typeof txn.fields.closed_at_esap).toBe('string');
  });
});

describe('esap_compliance — completenessEvidencePresent gates report submission', () => {
  it('submit_report with NO completeness_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    const r = await act(deps, 'txn-c', 'submit_report', DEVELOPER, { report_ref: 'ESR-2025' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('monitoring_period_open');
  });
});
