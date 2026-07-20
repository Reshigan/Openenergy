// support_ticket — the structural closure gate, as a driven property.
//
// A ticket must NEVER be closed before a resolution is offered. This is
// enforced by the state graph, not a guard: close_ticket leaves ONLY
// `resolved`, and the ONLY path into `resolved` is `resolve`. So from
// `in_progress` (work underway, no resolution yet) close_ticket is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds in_progress to close_ticket's `from`,
// or reorders states so a ticket can close mid-fix — the reporter never gets to
// confirm or reopen, and unresolved work is silently marked done.
//
// Also pins regulatorPresentIfCritical: a critical (P1) ticket cannot be
// escalated without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { supportTicket } from '../../src/v2/domain/chains/support_ticket';
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

const REPORTER: Actor = { id: 'user-reporter', kind: 'user', participant_id: 'party-reporter' };
const AGENT: Actor = { id: 'user-agent', kind: 'user', participant_id: 'party-agent' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { support_ticket: supportTicket }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'support_ticket', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'support_ticket', edge: 'open', actor: REPORTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  subject: 'Cannot log in to trading desk',
  description: 'MFA loop on the horizon page',
  category: 'access',
  priority: 'normal',
  agent_party: AGENT.participant_id,
};

describe('support_ticket — a ticket cannot close before it is resolved', () => {
  it('declares settles:false (a service record, never a payment)', () => {
    expect(supportTicket.settles).toBe(false);
  });

  it('close_ticket from in_progress is ILLEGAL_TRANSITION; resolve first, then close', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-t', baseOpen);
    expect((await act(deps, 'txn-t', 'triage', AGENT, { priority: 'normal' })).ok).toBe(true);
    expect((await act(deps, 'txn-t', 'start_work', AGENT)).ok).toBe(true);
    expect((await store.getTxn('txn-t'))!.txn.state).toBe('in_progress');

    // the graph forbids closing here — no resolution has been offered.
    const early = await act(deps, 'txn-t', 'close_ticket', REPORTER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-t'))!.txn.state).toBe('in_progress');

    // resolve first, THEN close succeeds — and stamps resolved_at / closed_at.
    expect((await act(deps, 'txn-t', 'resolve', AGENT, { resolution_summary: 'Reset MFA enrolment' })).ok).toBe(true);
    expect((await store.getTxn('txn-t'))!.txn.state).toBe('resolved');
    const closed = await act(deps, 'txn-t', 'close_ticket', REPORTER);
    expect(closed.ok).toBe(true);

    const txn = (await store.getTxn('txn-t'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.resolved_at).toBe('string');
    expect(typeof txn.fields.closed_at_ticket).toBe('string');
  });

  it('reopen without a reason_code is rejected (destructive-ish edge needs a reason)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'triage', AGENT, { priority: 'normal' })).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'start_work', AGENT)).ok).toBe(true);
    expect((await act(deps, 'txn-r', 'resolve', AGENT, { resolution_summary: 'Reset MFA' })).ok).toBe(true);

    const noReason = await act(deps, 'txn-r', 'reopen', REPORTER);
    expect(noReason.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('resolved');

    const withReason = await act(deps, 'txn-r', 'reopen', REPORTER, {}, 'not_fixed');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('in_progress');
  });
});

describe('support_ticket — regulatorPresentIfCritical gates P1 escalation', () => {
  it('critical ticket with NO regulator is refused at escalate_p1', async () => {
    const deps = newDeps();
    await open(deps, 'txn-p1', { ...baseOpen, priority: 'critical' });
    expect((await act(deps, 'txn-p1', 'triage', AGENT, { priority: 'critical' })).ok).toBe(true);
    expect((await act(deps, 'txn-p1', 'start_work', AGENT)).ok).toBe(true);

    const r = await act(deps, 'txn-p1', 'escalate_p1', AGENT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-p1'))!.txn.state).toBe('in_progress');
  });

  it('critical ticket WITH a regulator party clears escalate_p1', async () => {
    const deps = newDeps();
    await open(deps, 'txn-p1', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-p1', 'triage', AGENT, { priority: 'critical' })).ok).toBe(true);
    expect((await act(deps, 'txn-p1', 'start_work', AGENT)).ok).toBe(true);
    const r = await act(deps, 'txn-p1', 'escalate_p1', AGENT);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-p1'))!.txn.state).toBe('escalated');
  });
});
