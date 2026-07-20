// punch_list — the structural acceptance gate, as a driven property.
//
// A construction defect must NEVER close on the contractor's word alone. Closure
// is enforced by the state graph, not a guard: close_punch leaves ONLY `accepted`,
// and the ONLY path into `accepted` is accept_remediation (owner-only, from
// `reinspected`). So from reinspect_requested (contractor claims fixed) close_punch
// is an ILLEGAL_TRANSITION — the engine's state check refuses it before any guard.
//
// Failure mode this guards: someone adds reinspect_requested (or in_remediation)
// to close_punch's `from`, letting a contractor self-close an uninspected defect —
// plant gets handed over with a live, unverified snag.
//
// Also pins regulatorPresentIfCritical: a critical (life-safety) defect cannot be
// assigned into remediation without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { punchList } from '../../src/v2/domain/chains/punch_list';
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

const OWNER: Actor = { id: 'user-owner', kind: 'user', participant_id: 'party-owner' };
const CONTRACTOR: Actor = { id: 'user-contractor', kind: 'user', participant_id: 'party-contractor' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { punch_list: punchList }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'punch_list', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'punch_list', edge: 'open', actor: OWNER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// standard-priority defect against a named contractor — no regulator needed.
const baseOpen = {
  project_name: 'Solar Farm C',
  location: 'Inverter station 4',
  defect_description: 'DC combiner torque out of spec',
  workflow_class: 'punch_functional_performance',
  priority: 'standard',
  contractor_party: CONTRACTOR.participant_id,
};

describe('punch_list — a defect cannot close without owner acceptance', () => {
  it('declares settles:false (a quality control, never a payment)', () => {
    expect(punchList.settles).toBe(false);
  });

  it('close_punch from reinspect_requested is ILLEGAL_TRANSITION; happy path reaches closed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'assess', OWNER, { remediation_cost_zar: 1200 })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'assign_remediation', OWNER)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'start_remediation', CONTRACTOR)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'request_reinspection', CONTRACTOR, { photo_evidence_count: 3 })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('reinspect_requested');

    // the graph forbids closing here — the contractor claimed done, but the owner
    // has NOT reinspected or accepted.
    const early = await act(deps, 'txn-c', 'close_punch', OWNER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('reinspect_requested');

    // reinspect → accept → THEN close succeeds and stamps closed_at_punch.
    expect((await act(deps, 'txn-c', 'perform_reinspection', OWNER)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'accept_remediation', OWNER)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('accepted');
    expect((await act(deps, 'txn-c', 'close_punch', OWNER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.accepted_at).toBe('string');
    expect(typeof txn.fields.closed_at_punch).toBe('string');
  });
});

describe('punch_list — regulatorPresentIfCritical gates assignment', () => {
  it('critical defect with NO regulator is refused at assign_remediation', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical', life_safety_critical: true });
    expect((await act(deps, 'txn-crit', 'assess', OWNER, {})).ok).toBe(true);

    const r = await act(deps, 'txn-crit', 'assign_remediation', OWNER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('assessed');
  });

  it('critical defect WITH a regulator party clears assignment', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical', life_safety_critical: true, regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-crit', 'assess', OWNER, {})).ok).toBe(true);
    const r = await act(deps, 'txn-crit', 'assign_remediation', OWNER);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('assigned');
  });
});
