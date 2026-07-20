// data_breach_notification — the structural notification spine + the critical-
// severity regulator gate, as driven properties.
//
// A POPIA s22 breach must never be closed before both the Information Regulator
// AND the affected data subjects have been notified. This is enforced by the
// state graph, not a guard: close_breach leaves ONLY subjects_notified, and the
// ONLY path into subjects_notified is notify_subjects (from regulator_notified).
// So from regulator_notified, close_breach is an ILLEGAL_TRANSITION — the
// engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds regulator_notified to close_breach's
// `from`, letting a breach close on the Regulator notification alone — the
// affected data subjects are never told, in breach of s22(2).
//
// Also pins: regulatorPresentIfCritical at assess (a critical breach with no
// regulator party is refused REGULATOR_REQUIRED) and completenessEvidencePresent
// at closure (no completeness ref → MISSING_COMPLETENESS_EVIDENCE).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { dataBreachNotification } from '../../src/v2/domain/chains/data_breach_notification';
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

const CONTROLLER: Actor = { id: 'user-ctrl', kind: 'user', participant_id: 'party-ctrl' };
const REGULATOR: Actor = { id: 'user-reg', kind: 'user', participant_id: 'party-reg' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { data_breach_notification: dataBreachNotification }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'data_breach_notification', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>, actor: Actor = CONTROLLER) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'data_breach_notification', edge: 'open', actor, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  breach_summary: 'Unauthorised export of customer PII from billing DB',
  breach_ref: 'BR-2026-014',
  affected_subject_count: 4200,
};

describe('data_breach_notification — a breach cannot close before both notifications', () => {
  it('declares settles:false (a statutory notice record, never a payment)', () => {
    expect(dataBreachNotification.settles).toBe(false);
  });

  it('happy path: open -> assess -> notify_regulator -> notify_subjects -> close_breach -> closed', async () => {
    const deps = newDeps();
    const store = deps.store;
    // regulator party attached at @new so a critical assessment is allowed.
    expect((await open(deps, 'txn-h', { ...baseOpen, regulator_party: REGULATOR.participant_id })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'assess', CONTROLLER, { priority: 'critical' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'notify_regulator', CONTROLLER)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'notify_subjects', CONTROLLER)).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('subjects_notified');
    expect((await act(deps, 'txn-h', 'close_breach', CONTROLLER, { completeness_ref: 'PKT-CLOSE-77' })).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.regulator_notified_at).toBe('string');
    expect(typeof txn.fields.subjects_notified_at).toBe('string');
    expect(typeof txn.fields.closed_at_breach).toBe('string');
  });

  it('close_breach from regulator_notified (subjects never notified) is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'assess', CONTROLLER, { priority: 'elevated' })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'notify_regulator', CONTROLLER)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('regulator_notified');

    // the graph forbids closing here — the data subjects have not been notified.
    const early = await act(deps, 'txn-e', 'close_breach', CONTROLLER, { completeness_ref: 'PKT-CLOSE-77' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('regulator_notified');
  });
});

describe('data_breach_notification — regulator + completeness gates', () => {
  it('a critical-severity assessment with no regulator party is refused REGULATOR_REQUIRED', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    const r = await act(deps, 'txn-r', 'assess', CONTROLLER, { priority: 'critical' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('detected');
  });

  it('closing with no completeness ref is refused MISSING_COMPLETENESS_EVIDENCE', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    await act(deps, 'txn-c', 'assess', CONTROLLER, { priority: 'elevated' });
    await act(deps, 'txn-c', 'notify_regulator', CONTROLLER);
    await act(deps, 'txn-c', 'notify_subjects', CONTROLLER);
    // completeness_ref absent → the guard speaks (not a generic BAD_INPUT).
    const r = await act(deps, 'txn-c', 'close_breach', CONTROLLER, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('subjects_notified');
  });
});
