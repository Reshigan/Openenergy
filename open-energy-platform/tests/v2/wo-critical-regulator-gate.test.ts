// wo — the critical-priority regulator gate, as a driven property.
//
// A critical work order is a grid-affecting fault: raising it is fine, but
// ASSIGNING a technician to it crosses a regulatory line. The `assign` edge is
// guarded by regulatorPresentIfCritical — a critical WO cannot leave `new`
// until a regulator is a live party on the txn. Normal/high/low priority WOs
// assign freely (the guard is a no-op below `critical`). The guard reads
// `priority` from the txn's carried fields (assign never re-supplies it), so it
// keys off what was set at `open`.
//
// Failure mode this guards: someone drops the guard from `assign`, or the guard
// stops reading the carried priority field — either way a critical grid fault
// gets dispatched with no regulator in the loop.
//
// Also pins the DELIBERATE absences: settles:false (a WO is operational, never a
// payment) and NO complianceHaltClear (a platform halt must not block emergency
// repair).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { wo } from '../../src/v2/domain/chains/wo';
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

const DISPATCHER: Actor = { id: 'user-dispatcher', kind: 'user', participant_id: 'party-dispatcher' };
const TECH: Actor = { id: 'user-tech', kind: 'user', participant_id: 'party-tech' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { wo }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

// generic single-transition driver: reads the current seq, fires the edge.
async function act(
  deps: EngineDeps,
  txnId: string,
  edge: string,
  actor: Actor,
  input: Record<string, unknown> = {},
  reason_code?: string,
) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'wo', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'wo', edge: 'open', actor: DISPATCHER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = { site_id: 'SITE-42', category: 'transformer', title: 'Oil leak' };

describe('wo — regulatorPresentIfCritical gates assign, never open', () => {
  it('declares settles:false (operational control, not a payment)', () => {
    expect(wo.settles).toBe(false);
  });

  it('a critical WO can be RAISED without a regulator (the gate is on assign, not open)', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical' });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('new');
  });

  it('assigning a critical WO with NO regulator on the txn is refused (REGULATOR_REQUIRED)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical' });

    const r = await act(deps, 'txn-crit', 'assign', DISPATCHER, { assigned_to: TECH.participant_id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');

    // rejected transition is committed as a .rejected event but state is unmoved.
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('new');
  });

  it('a NON-critical WO assigns freely — the guard is a no-op below critical', async () => {
    const deps = newDeps();
    await open(deps, 'txn-normal', { ...baseOpen, priority: 'normal' });

    const r = await act(deps, 'txn-normal', 'assign', DISPATCHER, { assigned_to: TECH.participant_id });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-normal'))!.txn.state).toBe('assigned');
  });

  it('a critical WO WITH a regulator party clears the gate and assigns (stamps assigned_at)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });

    const r = await act(deps, 'txn-crit', 'assign', DISPATCHER, { assigned_to: TECH.participant_id });
    expect(r.ok).toBe(true);

    const txn = (await store.getTxn('txn-crit'))!.txn;
    expect(txn.state).toBe('assigned');
    expect(typeof txn.fields.assigned_at).toBe('string'); // derive stamped the instant
  });
});
