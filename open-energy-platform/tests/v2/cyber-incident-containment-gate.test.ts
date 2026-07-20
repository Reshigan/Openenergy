// cyber_incident — the structural containment gate, as a driven property.
//
// A security incident must NEVER be closed before it has been contained,
// eradicated and recovered. This is enforced by the state graph, not a guard:
// close_incident leaves ONLY `recovered`, and the only path into `recovered`
// runs triaged→contained→eradicated→recovered. So from `triaged`,
// close_incident is an ILLEGAL_TRANSITION — the engine's step-4 state check
// refuses it before any guard runs.
//
// Failure mode this guards: someone adds `triaged` to close_incident's `from`,
// or collapses the response states — an incident then gets "closed" while the
// attacker still has a foothold, with no root-cause or recovery on the log.
//
// Also pins regulatorPresentIfCritical: a critical-priority incident cannot be
// triaged without a regulator on the txn (POPIA §22 / NERSA directive).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { cyberIncident } from '../../src/v2/domain/chains/cyber_incident';
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
const RESPONDER: Actor = { id: 'user-responder', kind: 'user', participant_id: 'party-responder' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { cyber_incident: cyberIncident }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'cyber_incident', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'cyber_incident', edge: 'open', actor: REPORTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// a routine (non-critical) incident report — responder named, no regulator needed.
const baseOpen = {
  incident_title: 'Suspicious auth spike',
  incident_description: 'Repeated failed logins from foreign ASN',
  detection_source: 'SIEM',
  affected_systems: 'trading-api',
  incident_category: 'intrusion',
  responder_party: RESPONDER.participant_id,
};

describe('cyber_incident — an incident cannot close before it is contained + recovered', () => {
  it('declares settles:false (a security control, never a payment)', () => {
    expect(cyberIncident.settles).toBe(false);
  });

  it('drives report → triage → contain → eradicate → recover → close to closed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'triage', RESPONDER, { priority: 'high', severity_score: 6 })).ok).toBe(true);

    // the graph forbids closing here — nothing has been contained yet.
    const early = await act(deps, 'txn-c', 'close_incident', RESPONDER, {});
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('triaged');

    expect((await act(deps, 'txn-c', 'contain', RESPONDER, { containment_actions: 'isolated host' })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'eradicate', RESPONDER, { root_cause: 'stolen creds', eradication_actions: 'revoked tokens' })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'recover', RESPONDER, { recovery_actions: 'restored service', service_restored: true })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('recovered');

    const closed = await act(deps, 'txn-c', 'close_incident', RESPONDER, { post_incident_review_ref: 'PIR-1' });
    expect(closed.ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.contained_at).toBe('string');
    expect(typeof txn.fields.closed_at_incident).toBe('string');
  });
});

describe('cyber_incident — regulatorPresentIfCritical gates triage', () => {
  it('critical incident with NO regulator is refused at triage', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', baseOpen);
    const r = await act(deps, 'txn-crit', 'triage', RESPONDER, { priority: 'critical', severity_score: 9 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('reported');
  });

  it('critical incident WITH a regulator party clears triage', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, regulator_party: REGULATOR_ID });
    const r = await act(deps, 'txn-crit', 'triage', RESPONDER, { priority: 'critical', severity_score: 9 });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('triaged');
  });
});
