// ipp_evm — the structural reforecast-publication gate, as a driven property.
//
// A reforecast must NEVER be published on a cost book that never detected a
// variance. This is enforced by the state graph, not a guard: publish_reforecast
// leaves ONLY reforecast_drafted, and reforecast_drafted is reachable ONLY from
// variance_detected (or a prior rejection) via draft_reforecast. So from
// `measured` — a clean measurement with no variance flagged — publish_reforecast
// is an ILLEGAL_TRANSITION, refused by the engine's state check before any guard.
//
// Failure mode this guards: someone adds `measured` to publish_reforecast's
// `from`, or lets draft_reforecast fire off `measured` — a book then publishes a
// reforecast that skipped variance detection and finance approval entirely.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ippEvm } from '../../src/v2/domain/chains/ipp_evm';
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

const ENGINEER: Actor = { id: 'user-eng', kind: 'user', participant_id: 'party-eng' };
const FINANCE: Actor = { id: 'user-fin', kind: 'user', participant_id: 'party-fin' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { ipp_evm: ippEvm }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'ipp_evm', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'ipp_evm', edge: 'open', actor: ENGINEER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// small (sub-strategic) project — no regulator needed to publish a reforecast.
const baseOpen = {
  project_id: 'PRJ-77',
  project_name: 'Karoshoek Solar',
  capacity_mw: 75,
  budget_at_completion_zar: 1_000_000,
  approver_party: FINANCE.participant_id,
};

describe('ipp_evm — a reforecast cannot publish without a detected variance', () => {
  it('declares settles:false (a project-controls record, never a payment)', () => {
    expect(ippEvm.settles).toBe(false);
  });

  it('drives the full variance→reforecast→close happy path', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'commit_costs', ENGINEER, { committed_cost_zar: 800_000 })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'incur_costs', ENGINEER, { actual_cost_zar: 600_000 })).ok).toBe(true);
    // EV 500k on AC 600k → CPI 0.833 (critical), a real variance.
    expect((await act(deps, 'txn-e', 'measure', ENGINEER, { planned_value_zar: 550_000, earned_value_zar: 500_000, actual_cost_zar: 600_000 })).ok).toBe(true);

    const measured = (await store.getTxn('txn-e'))!.txn;
    expect(measured.state).toBe('measured');
    expect(measured.fields.cpi).toBeCloseTo(500_000 / 600_000, 6);
    expect(measured.fields.evm_health_band).toBe('critical');
    expect(typeof measured.fields.measured_at).toBe('string');

    expect((await act(deps, 'txn-e', 'flag_variance', ENGINEER, { variance_reason: 'EPC labour overrun' }, 'cost_overrun')).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'draft_reforecast', ENGINEER, { reforecast_reason: 'reset EAC on revised labour rates' })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'publish_reforecast', FINANCE)).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'reconcile_reforecast', ENGINEER)).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'close_book', FINANCE)).ok).toBe(true);

    expect((await store.getTxn('txn-e'))!.txn.state).toBe('closed');
  });

  it('publish_reforecast from `measured` is ILLEGAL_TRANSITION (no variance detected)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-x', baseOpen);
    await act(deps, 'txn-x', 'commit_costs', ENGINEER, { committed_cost_zar: 800_000 });
    await act(deps, 'txn-x', 'incur_costs', ENGINEER, { actual_cost_zar: 600_000 });
    await act(deps, 'txn-x', 'measure', ENGINEER, { planned_value_zar: 550_000, earned_value_zar: 500_000, actual_cost_zar: 600_000 });
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('measured');

    // the graph forbids publishing here — no variance was ever flagged.
    const early = await act(deps, 'txn-x', 'publish_reforecast', FINANCE);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('measured');
  });

  it('flag_variance without a reason_code is rejected', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    await act(deps, 'txn-r', 'commit_costs', ENGINEER, { committed_cost_zar: 800_000 });
    await act(deps, 'txn-r', 'incur_costs', ENGINEER, { actual_cost_zar: 600_000 });
    await act(deps, 'txn-r', 'measure', ENGINEER, { planned_value_zar: 550_000, earned_value_zar: 500_000, actual_cost_zar: 600_000 });

    const r = await act(deps, 'txn-r', 'flag_variance', ENGINEER, { variance_reason: 'overrun' }); // no reason_code
    expect(r.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('measured');
  });
});

describe('ipp_evm — regulatorPresentIfStrategic gates reforecast publication', () => {
  const strategicOpen = { ...baseOpen, capacity_mw: 150 };

  async function driveToDraft(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
    await open(deps, txnId, input);
    await act(deps, txnId, 'commit_costs', ENGINEER, { committed_cost_zar: 800_000 });
    await act(deps, txnId, 'incur_costs', ENGINEER, { actual_cost_zar: 600_000 });
    await act(deps, txnId, 'measure', ENGINEER, { planned_value_zar: 550_000, earned_value_zar: 500_000, actual_cost_zar: 600_000 });
    await act(deps, txnId, 'flag_variance', ENGINEER, { variance_reason: 'overrun' }, 'cost_overrun');
    await act(deps, txnId, 'draft_reforecast', ENGINEER, { reforecast_reason: 'reset EAC' });
  }

  it('a 150 MW project with NO regulator is refused at publish_reforecast', async () => {
    const deps = newDeps();
    await driveToDraft(deps, 'txn-s', strategicOpen);
    const r = await act(deps, 'txn-s', 'publish_reforecast', FINANCE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('reforecast_drafted');
  });

  it('a 150 MW project WITH a regulator party publishes', async () => {
    const deps = newDeps();
    await driveToDraft(deps, 'txn-s2', { ...strategicOpen, regulator_party: REGULATOR_ID });
    const r = await act(deps, 'txn-s2', 'publish_reforecast', FINANCE);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-s2'))!.txn.state).toBe('reforecast_published');
  });
});
