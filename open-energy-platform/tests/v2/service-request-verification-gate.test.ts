// service_request — the structural verification gate, as a driven property.
//
// A service request must NEVER be closed before the user has verified the fix.
// This is enforced by the state graph, not a guard: close_request leaves ONLY
// `verified`, and the ONLY path into `verified` is `verify` from `fulfilled`. So
// from `fulfilled` (fix delivered but not yet confirmed) close_request is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it.
//
// Failure mode this guards: someone adds `fulfilled` to close_request's `from`,
// or reorders states so a request can close on an unverified fix — the desk then
// books a resolution the user never accepted.
//
// Also pins regulatorPresentIfCritical: a critical request cannot pass
// start_fulfilment without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { serviceRequest } from '../../src/v2/domain/chains/service_request';
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

const REQUESTER: Actor = { id: 'user-requester', kind: 'user', participant_id: 'party-requester' };
const AGENT: Actor = { id: 'user-agent', kind: 'user', participant_id: 'party-agent' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { service_request: serviceRequest }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'service_request', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'service_request', edge: 'open', actor: REQUESTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// standard-priority request, no approval — agent named, no regulator needed.
const baseOpen = {
  catalog_item: 'VPN access',
  request_title: 'New site VPN',
  priority: 'standard',
  agent_party: AGENT.participant_id,
};

describe('service_request — a request cannot close before the user verifies the fix', () => {
  it('declares settles:false (a support control, never a payment)', () => {
    expect(serviceRequest.settles).toBe(false);
  });

  it('drives the happy path submit -> ... -> closed, and blocks an early close', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-s', baseOpen);
    expect((await act(deps, 'txn-s', 'check_entitlement', AGENT, { entitlement_status: 'entitled' })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'assign', AGENT, { assignee_team: 'desk-1' })).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'start_fulfilment', AGENT)).ok).toBe(true);
    expect((await act(deps, 'txn-s', 'mark_fulfilled', AGENT, { resolution_text: 'granted' })).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('fulfilled');

    // the graph forbids closing here — the fix is delivered but NOT verified.
    const early = await act(deps, 'txn-s', 'close_request', AGENT);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('fulfilled');

    // verify first, THEN close succeeds — and stamps the timestamps.
    expect((await act(deps, 'txn-s', 'verify', REQUESTER, { csat: 5 })).ok).toBe(true);
    expect((await store.getTxn('txn-s'))!.txn.state).toBe('verified');
    const closed = await act(deps, 'txn-s', 'close_request', AGENT);
    expect(closed.ok).toBe(true);

    const txn = (await store.getTxn('txn-s'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.closed_at_sr).toBe('string');
  });
});

describe('service_request — regulatorPresentIfCritical gates fulfilment', () => {
  it('critical request with NO regulator is refused at start_fulfilment', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', { ...baseOpen, priority: 'critical' });
    expect((await act(deps, 'txn-c', 'check_entitlement', AGENT, { entitlement_status: 'entitled' })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'assign', AGENT, { assignee_team: 'desk-1' })).ok).toBe(true);

    const r = await act(deps, 'txn-c', 'start_fulfilment', AGENT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('assigned');
  });

  it('critical request WITH a regulator party clears fulfilment', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-c', 'check_entitlement', AGENT, { entitlement_status: 'entitled' })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'assign', AGENT, { assignee_team: 'desk-1' })).ok).toBe(true);
    const r = await act(deps, 'txn-c', 'start_fulfilment', AGENT);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('fulfilment_in_progress');
  });
});
