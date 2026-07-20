// oem_fco — the structural verification gate, as a driven property.
//
// An OEM Field Change Order must NEVER close (units certified modified) unless
// the modification was applied and submitted for verification. This is enforced
// by the state graph, not a guard: close_fco leaves ONLY `verification`, and the
// ONLY path into `verification` is submit_verification (from in_progress). So
// from in_progress, close_fco is an ILLEGAL_TRANSITION.
//
// Failure mode this guards: someone adds in_progress to close_fco's `from`, or
// drops the verification state — an FCO then closes on unmodified plant, a
// paper-only compliance sign-off.
//
// Also pins regulatorPresentIfCritical: a critical (safety) FCO cannot pass
// acknowledge_fco without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { oemFco } from '../../src/v2/domain/chains/oem_fco';
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

const OEM: Actor = { id: 'user-oem', kind: 'user', participant_id: 'party-oem' };
const OPERATOR: Actor = { id: 'user-operator', kind: 'user', participant_id: 'party-operator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { oem_fco: oemFco }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'oem_fco', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'oem_fco', edge: 'open', actor: OEM, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// routine FCO — operator named, no regulator needed.
const baseOpen = {
  equipment_model: 'Sungrow SG250HX',
  fco_title: 'DC combiner fuse-holder retorque',
  change_description: 'Retorque all DC fuse-holders to 12 Nm',
  priority: 'routine',
  serial_start: 1000,
  serial_end: 1049,
  affected_units: 50,
  operator_party: OPERATOR.participant_id,
};

describe('oem_fco — an FCO cannot close before it is applied & verified', () => {
  it('declares settles:false (an engineering control, never a payment)', () => {
    expect(oemFco.settles).toBe(false);
  });

  it('happy path drives open -> ... -> closed and stamps timestamps', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-f', baseOpen);
    expect((await store.getTxn('txn-f'))!.txn.state).toBe('issued');

    expect((await act(deps, 'txn-f', 'acknowledge_fco', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-f', 'schedule_rollout', OPERATOR, { planned_start: '2026-08-01' })).ok).toBe(true);
    expect((await act(deps, 'txn-f', 'begin_rollout', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-f', 'submit_verification', OPERATOR, { units_modified: 50 })).ok).toBe(true);
    expect((await store.getTxn('txn-f'))!.txn.state).toBe('verification');
    expect((await act(deps, 'txn-f', 'close_fco', OEM)).ok).toBe(true);

    const txn = (await store.getTxn('txn-f'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.acknowledged_at).toBe('string');
    expect(typeof txn.fields.closed_at_fco).toBe('string');
    expect(txn.fields.remediation_tier).toBe('scheduled');
  });

  it('close_fco from in_progress is ILLEGAL_TRANSITION (verification skipped)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'acknowledge_fco', OPERATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'schedule_rollout', OPERATOR, { planned_start: '2026-08-01' })).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'begin_rollout', OPERATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('in_progress');

    const early = await act(deps, 'txn-g', 'close_fco', OEM);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('in_progress');
  });

  it('reject_fco without a reason_code is rejected', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    const r = await act(deps, 'txn-r', 'reject_fco', OPERATOR);
    expect(r.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('issued');
  });
});

describe('oem_fco — regulatorPresentIfCritical gates acknowledgement', () => {
  it('critical FCO with NO regulator is refused at acknowledge_fco', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', { ...baseOpen, priority: 'critical' });
    const r = await act(deps, 'txn-c', 'acknowledge_fco', OPERATOR);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('issued');
  });

  it('critical FCO WITH a regulator party clears acknowledgement', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    const r = await act(deps, 'txn-c', 'acknowledge_fco', OPERATOR);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('acknowledged');
    expect((await deps.store.getTxn('txn-c'))!.txn.fields.remediation_tier).toBe('immediate');
  });
});
