// cbt_sed — the structural review gate, as a driven property.
//
// A CBT/SED annual report must NEVER be approved without first being submitted
// to the DMRE. This is enforced by the state graph, not a guard: `approve`
// leaves ONLY under_review, and the ONLY path into under_review is via
// `submitted` (begin_review / resume_review). So from data_collection an
// `approve` is an ILLEGAL_TRANSITION — the engine's state check refuses it
// even for a regulator actor that holds the role.
//
// Failure mode this guards: someone adds an early state to `approve`'s `from`,
// or wires a shortcut into under_review that skips `submitted` — the DMRE then
// "approves" a report that was never actually filed.
//
// Second block pins completenessEvidencePresent: a submission with a stub
// completeness ref cannot pass submit_report.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { cbtSed } from '../../src/v2/domain/chains/cbt_sed';
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

const IPP: Actor = { id: 'user-ipp', kind: 'user', participant_id: 'party-ipp' };
const REGULATOR: Actor = { id: 'user-dmre', kind: 'user', participant_id: 'party-regulator' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { cbt_sed: cbtSed }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'cbt_sed', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'cbt_sed', edge: 'open', actor: IPP, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_name: 'Karoo Sun PV',
  reipppp_bid_window: 'BW4',
  reporting_year: 2024,
  cbt_disbursement_tier: 'medium',
  regulator_party: REGULATOR.participant_id,
};

describe('cbt_sed — a report cannot be approved before it is submitted', () => {
  it('declares settles:false (a compliance control, never a payment)', () => {
    expect(cbtSed.settles).toBe(false);
  });

  it('approve from data_collection is ILLEGAL_TRANSITION, then the full path approves', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'begin_collection', IPP)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('data_collection');

    // the graph forbids approving here — nothing has been submitted to the DMRE.
    const early = await act(deps, 'txn-c', 'approve', REGULATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('data_collection');

    // walk the happy path: draft -> submit -> review -> approve.
    expect((await act(deps, 'txn-c', 'draft_report', IPP, { local_content_percentage: 55, sed_spend_zar: 1_200_000 })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'submit_report', IPP, { completeness_ref: 'SIGN-OFF-2024', report_ref: 'DMRE-2024-001' })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('submitted');
    expect((await act(deps, 'txn-c', 'begin_review', REGULATOR)).ok).toBe(true);

    const approved = await act(deps, 'txn-c', 'approve', REGULATOR);
    expect(approved.ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('approved');
    expect(txn.fields.local_content_status).toBe('met');
    expect(typeof txn.fields.submitted_at).toBe('string');
    expect(typeof txn.fields.approved_at).toBe('string');
  });
});

describe('cbt_sed — completenessEvidencePresent gates the DMRE submission', () => {
  it('submit_report with a stub completeness ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'begin_collection', IPP)).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'draft_report', IPP, { local_content_percentage: 30 })).ok).toBe(true);

    const r = await act(deps, 'txn-g', 'submit_report', IPP, { completeness_ref: 'ab', report_ref: 'DMRE-2024-002' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-g'))!.txn.state).toBe('report_drafted');
  });
});
