// construction_cost_report — the certification gate, as a driven property.
//
// A cost report must NEVER be certified straight from draft: certify leaves ONLY
// under_review, and the ONLY path into under_review is submit. So certify from a
// fresh draft is an ILLEGAL_TRANSITION — the engine's step-4 state check refuses
// it before any guard runs. Failure mode this guards: someone adds 'draft' to
// certify's `from`, letting an unreviewed report become drawdown-grade.
//
// Also pins completenessEvidencePresent: a report under review cannot be
// certified without a named completeness-evidence ref (QS sign-off).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { constructionCostReport } from '../../src/v2/domain/chains/construction_cost_report';
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

const CONTRACTOR: Actor = { id: 'user-contractor', kind: 'user', participant_id: 'party-contractor' };
const REVIEWER: Actor = { id: 'user-reviewer', kind: 'user', participant_id: 'party-reviewer' };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { construction_cost_report: constructionCostReport },
    guards: GUARDS,
  };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'construction_cost_report',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      ...(reason ? { reason_code: reason } : {}),
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'construction_cost_report', edge: 'open', actor: CONTRACTOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_name: 'Karoo PV 75MW',
  report_period: '2026-06',
  reviewer_party: REVIEWER.participant_id,
};
const submitNumbers = { budget_at_completion: 1000, actual_cost_to_date: 500, earned_value: 450, planned_value: 480 };

describe('construction_cost_report — a report cannot certify before review', () => {
  it('declares settles:false (an assurance record, never a payment)', () => {
    expect(constructionCostReport.settles).toBe(false);
  });

  it('certify from draft is ILLEGAL_TRANSITION; submit-then-certify drives to certified', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('draft');

    // the graph forbids certifying a fresh draft — it was never reviewed.
    const early = await act(deps, 'txn-c', 'certify', REVIEWER, { completeness_ref: 'QS-SIGN-001' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('draft');

    // submit computes the EVM metrics purely and stamps submitted_at.
    expect((await act(deps, 'txn-c', 'submit', CONTRACTOR, submitNumbers)).ok).toBe(true);
    const reviewing = (await store.getTxn('txn-c'))!.txn;
    expect(reviewing.state).toBe('under_review');
    expect(reviewing.fields.cost_variance).toBe(-50); // EV 450 - AC 500
    expect(reviewing.fields.schedule_variance).toBe(-30); // EV 450 - PV 480
    expect(typeof reviewing.fields.submitted_at).toBe('string');

    // now certify succeeds and stamps certified_at.
    const certified = await act(deps, 'txn-c', 'certify', REVIEWER, { completeness_ref: 'QS-SIGN-001' });
    expect(certified.ok).toBe(true);
    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('certified');
    expect(typeof txn.fields.certified_at).toBe('string');
  });
});

describe('construction_cost_report — completenessEvidencePresent gates certification', () => {
  it('certify with NO completeness_ref is refused under review', async () => {
    const deps = newDeps();
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'submit', CONTRACTOR, submitNumbers)).ok).toBe(true);

    const r = await act(deps, 'txn-g', 'certify', REVIEWER, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-g'))!.txn.state).toBe('under_review');
  });
});
