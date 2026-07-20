// itp — the structural closure gate, as a driven property.
//
// An Inspection & Test Plan must NEVER be closed before its inspections are
// signed off complete. This is enforced by the state graph, not a guard:
// close_itp leaves ONLY inspection_complete, and the ONLY path into
// inspection_complete is complete_inspections. So from inspection_in_progress
// (inspecting, not yet signed off) close_itp is an ILLEGAL_TRANSITION — the
// engine's state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds inspection_in_progress to close_itp's
// `from`, or reorders states so an ITP can close on an unsigned inspection — a
// work package is then accepted as inspected when it never was.
//
// Also pins completenessEvidencePresent: the completion sign-off cannot pass
// without a named completeness-evidence ref (the QA record set).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { itp } from '../../src/v2/domain/chains/itp';
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
const ENGINEER: Actor = { id: 'user-engineer', kind: 'user', participant_id: 'party-engineer' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { itp }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'itp', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'itp', edge: 'open', actor: CONTRACTOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  asset_name: 'Inverter station INV-04',
  work_package: 'MV switchgear install',
  discipline: 'electrical',
  inspection_class: 'hold_point',
  engineer_party: ENGINEER.participant_id,
};

describe('itp — an ITP cannot close before its inspections are signed off', () => {
  it('declares settles:false (a quality control, never a payment)', () => {
    expect(itp.settles).toBe(false);
  });

  it('close_itp from inspection_in_progress is ILLEGAL_TRANSITION, then the happy path closes it', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-itp', baseOpen);
    expect((await act(deps, 'txn-itp', 'submit_for_review', CONTRACTOR, { hold_point_count: 3 })).ok).toBe(true);
    expect((await act(deps, 'txn-itp', 'approve_itp', ENGINEER)).ok).toBe(true);
    expect((await act(deps, 'txn-itp', 'begin_inspections', ENGINEER)).ok).toBe(true);
    expect((await store.getTxn('txn-itp'))!.txn.state).toBe('inspection_in_progress');

    // the graph forbids closing here — inspections are not yet signed off.
    const early = await act(deps, 'txn-itp', 'close_itp', ENGINEER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-itp'))!.txn.state).toBe('inspection_in_progress');

    // sign off complete first, THEN close succeeds — and stamps the timestamps.
    expect((await act(deps, 'txn-itp', 'complete_inspections', ENGINEER, { completeness_ref: 'QA-DOSSIER-04', signed_point_count: 3 })).ok).toBe(true);
    expect((await store.getTxn('txn-itp'))!.txn.state).toBe('inspection_complete');
    const closed = await act(deps, 'txn-itp', 'close_itp', ENGINEER);
    expect(closed.ok).toBe(true);

    const txn = (await store.getTxn('txn-itp'))!.txn;
    expect(txn.state).toBe('itp_closed');
    expect(typeof txn.fields.completed_at).toBe('string');
    expect(typeof txn.fields.closed_at_itp).toBe('string');
  });
});

describe('itp — completenessEvidencePresent gates the completion sign-off', () => {
  it('complete_inspections with NO completeness_ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-ev', baseOpen);
    expect((await act(deps, 'txn-ev', 'submit_for_review', CONTRACTOR, { hold_point_count: 1 })).ok).toBe(true);
    expect((await act(deps, 'txn-ev', 'approve_itp', ENGINEER)).ok).toBe(true);
    expect((await act(deps, 'txn-ev', 'begin_inspections', ENGINEER)).ok).toBe(true);

    const r = await act(deps, 'txn-ev', 'complete_inspections', ENGINEER, { signed_point_count: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-ev'))!.txn.state).toBe('inspection_in_progress');
  });
});
