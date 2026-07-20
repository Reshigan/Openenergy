// grid_code_compliance — the structural remediation gate, as a driven property.
//
// A grid-code non-conformance can NEVER be resolved without the responsible
// party actually submitting remediation. This is enforced by the state graph,
// not a guard: verify_remediation leaves ONLY remediation_submitted, and the
// ONLY path into remediation_submitted is submit_remediation from
// remediation_required. So from under_assessment (no directive yet, no
// remediation) verify_remediation is an ILLEGAL_TRANSITION — the engine's
// step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds under_assessment (or nc_raised) to
// verify_remediation's `from`, letting a case close with no remediation on
// file — a live grid-code breach marked "resolved" that was never fixed.
//
// Also pins regulatorPresentIfCritical: a critical-severity NC cannot pass
// issue_directive without a regulator (NERSA) on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { gridCodeCompliance } from '../../src/v2/domain/chains/grid_code_compliance';
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

const OPERATOR: Actor = { id: 'user-operator', kind: 'user', participant_id: 'party-operator' };
const RESPONSIBLE: Actor = { id: 'user-responsible', kind: 'user', participant_id: 'party-responsible' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { grid_code_compliance: gridCodeCompliance }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'grid_code_compliance', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'grid_code_compliance', edge: 'open', actor: OPERATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// marginal (non-critical) NC — responsible party named, no regulator needed.
const baseOpen = {
  facility_name: 'East Wind A2',
  node_id: 'node-3',
  parameter: 'Voltage (pu)',
  measured_value: 0.92,
  limit_value: 0.95,
  code_reference: 'NRS 097 s4.2.1',
  responsible_party: RESPONSIBLE.participant_id,
};

describe('grid_code_compliance — a case cannot resolve without remediation', () => {
  it('declares settles:false (a compliance control, never a payment)', () => {
    expect(gridCodeCompliance.settles).toBe(false);
  });

  it('happy path drives @new -> resolved and verify before remediation is ILLEGAL', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-g', baseOpen);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('nc_raised');

    expect((await act(deps, 'txn-g', 'begin_investigation', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'begin_assessment', OPERATOR, { assessment_ref: 'ASSESS-1' })).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('under_assessment');

    // the graph forbids resolving here — no directive, no remediation submitted.
    const early = await act(deps, 'txn-g', 'verify_remediation', OPERATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('under_assessment');

    // directive (non-critical ⇒ no regulator needed) → remediation → verify.
    expect((await act(deps, 'txn-g', 'issue_directive', OPERATOR, { directive_ref: 'DIR-1' })).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('remediation_required');
    expect((await act(deps, 'txn-g', 'submit_remediation', RESPONSIBLE, { remediation_ref: 'REM-1' })).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('remediation_submitted');

    const resolved = await act(deps, 'txn-g', 'verify_remediation', OPERATOR);
    expect(resolved.ok).toBe(true);

    const txn = (await store.getTxn('txn-g'))!.txn;
    expect(txn.state).toBe('resolved');
    expect(typeof txn.fields.raised_at).toBe('string');
    expect(typeof txn.fields.resolved_at).toBe('string');
    // derive computed the deviation off measured/limit: |0.92-0.95|/0.95 ≈ 3.2%
    expect(txn.fields.deviation_pct).toBeCloseTo(3.2, 1);
    expect(txn.fields.severity_tier).toBe('marginal');
  });
});

describe('grid_code_compliance — regulatorPresentIfCritical gates the directive', () => {
  it('critical NC with NO regulator is refused at issue_directive', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', { ...baseOpen, priority: 'critical' });
    expect((await act(deps, 'txn-c', 'begin_investigation', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'begin_assessment', OPERATOR, { assessment_ref: 'ASSESS-2' })).ok).toBe(true);

    const r = await act(deps, 'txn-c', 'issue_directive', OPERATOR, { directive_ref: 'DIR-2' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('under_assessment');
  });

  it('critical NC WITH a regulator party clears the directive', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-c', 'begin_investigation', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'begin_assessment', OPERATOR, { assessment_ref: 'ASSESS-3' })).ok).toBe(true);
    const r = await act(deps, 'txn-c', 'issue_directive', OPERATOR, { directive_ref: 'DIR-3' });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('remediation_required');
  });
});
