// pm_compliance — the safety-critical skip crossing, as a driven property (W59).
//
// A safety-critical PM (priority='critical') can NEVER be skipped without a
// regulator on the txn. This is enforced by regulatorPresentIfCritical on the
// skip_pm edge, which reads the txn's carried `priority` field. A routine PM
// skips without one.
//
// Failure mode this guards: someone drops regulatorPresentIfCritical from
// skip_pm, or lets a critical maintenance task be abandoned unilaterally — a
// safety-critical inspection then vanishes with no regulatory sign-off.
//
// Also pins the happy path work_assigned → in_progress → completed and the
// structural completion gate (complete_pm only from in_progress).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { pmCompliance } from '../../src/v2/domain/chains/pm_compliance';
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

const PLANNER: Actor = { id: 'user-planner', kind: 'user', participant_id: 'party-planner' };
const ASSIGNEE: Actor = { id: 'user-assignee', kind: 'user', participant_id: 'party-assignee' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { pm_compliance: pmCompliance }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'pm_compliance',
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
    { txn_id: txnId, chain_key: 'pm_compliance', edge: 'open', actor: PLANNER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// routine PM — planner assigns, assignee named, no regulator needed.
const baseOpen = {
  asset_name: 'INV-12 string inverter',
  site_name: 'Kathu PV1',
  pm_task: 'Quarterly thermal scan',
  rcm_tier: 'tier_2',
  priority: 'routine',
  assignee_party: ASSIGNEE.participant_id,
};

describe('pm_compliance — happy path and completion gate', () => {
  it('declares settles:false (an operational control, never a payment)', () => {
    expect(pmCompliance.settles).toBe(false);
  });

  it('drives @new → in_progress → completed and stamps completion + baseline reset', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-pm', baseOpen);
    expect((await store.getTxn('txn-pm'))!.txn.state).toBe('work_assigned');

    // completion gate: complete_pm cannot fire before the PM is started.
    const early = await act(deps, 'txn-pm', 'complete_pm', ASSIGNEE, { completion_evidence_ref: 'ev-1' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-pm'))!.txn.state).toBe('work_assigned');

    expect((await act(deps, 'txn-pm', 'start_pm', ASSIGNEE, { work_order_ref: 'WO-9' })).ok).toBe(true);
    expect((await store.getTxn('txn-pm'))!.txn.state).toBe('in_progress');

    const done = await act(deps, 'txn-pm', 'complete_pm', ASSIGNEE, { completion_evidence_ref: 'ev-1' });
    expect(done.ok).toBe(true);

    const txn = (await store.getTxn('txn-pm'))!.txn;
    expect(txn.state).toBe('completed');
    expect(typeof txn.fields.completed_at).toBe('string');
    expect(txn.fields.availability_baseline_reset).toBe(true);
  });
});

describe('pm_compliance — regulatorPresentIfCritical gates skip_pm', () => {
  it('a safety-critical PM with NO regulator cannot be skipped', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical' });

    const r = await act(deps, 'txn-crit', 'skip_pm', PLANNER, {}, 'risk_accepted');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('work_assigned');
  });

  it('a safety-critical PM WITH a regulator party can be skipped', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });

    const r = await act(deps, 'txn-crit', 'skip_pm', PLANNER, {}, 'risk_accepted');
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('skipped');
  });
});
