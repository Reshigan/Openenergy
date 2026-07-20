// export_curtailment — the structural measurement gate, as a driven property.
//
// Curtailed energy must NEVER be booked while the curtailment window is still
// active. This is enforced by the state graph, not a guard: verify_curtailment
// leaves ONLY `restored`, and the ONLY path into `restored` is `restore` out of
// an active `curtailing` window. So from `curtailing` (window still open)
// verify_curtailment is an ILLEGAL_TRANSITION — the engine's step-4 state check
// refuses it before any guard runs.
//
// Failure mode this guards: someone adds `curtailing` to verify_curtailment's
// `from`, letting a generator's export be booked as "curtailed" while it is
// still actively curtailing — inflating deemed-energy compensation.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { exportCurtailment } from '../../src/v2/domain/chains/export_curtailment';
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
const GENERATOR: Actor = { id: 'user-generator', kind: 'user', participant_id: 'party-generator' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { export_curtailment: exportCurtailment }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'export_curtailment', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'export_curtailment', edge: 'open', actor: OPERATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  network_element: 'Perseus-Merensky 400kV line',
  curtailment_reason: 'thermal',
  pre_curtailment_mw: 140,
  curtailment_mw: 40,
  generator_party: GENERATOR.participant_id,
};

describe('export_curtailment — curtailed energy cannot be booked before the window closes', () => {
  it('declares settles:false (a measurement notice, never a payment)', () => {
    expect(exportCurtailment.settles).toBe(false);
  });

  it('verify_curtailment from `curtailing` is ILLEGAL_TRANSITION; happy path books it only after restore', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'acknowledge', GENERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'begin_curtailment', GENERATOR, { achieved_mw: 40 })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('curtailing');

    // the graph forbids booking here — the curtailment window is still active.
    const early = await act(deps, 'txn-c', 'verify_curtailment', OPERATOR, { curtailed_mwh: 80 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('curtailing');

    // restore first, THEN verify succeeds — and stamps the timestamps.
    expect((await act(deps, 'txn-c', 'restore', OPERATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('restored');
    expect((await act(deps, 'txn-c', 'verify_curtailment', OPERATOR, { curtailed_mwh: 80 })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'close', OPERATOR)).ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('closed');
    expect(txn.fields.curtailed_mwh).toBe(80);
    expect(typeof txn.fields.restore_at).toBe('string');
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.closed_at_ec).toBe('string');
  });

  it('cancel_directive without a reason_code is rejected (destructive exit needs a reason)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    const noReason = await act(deps, 'txn-r', 'cancel_directive', OPERATOR);
    expect(noReason.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('directive_issued');

    const withReason = await act(deps, 'txn-r', 'cancel_directive', OPERATOR, {}, 'constraint_cleared');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('cancelled');
  });
});
