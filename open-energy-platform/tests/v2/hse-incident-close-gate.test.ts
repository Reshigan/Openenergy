// hse_incident — the structural corrective-action close gate, as a driven property.
//
// An incident must NEVER be closed while its corrective actions are merely
// assigned but not verified. This is enforced by the state graph, not a guard:
// close_incident leaves ONLY corrective_actions_verified, and the ONLY path into
// that state is verify_actions. So from corrective_actions_assigned (actions
// assigned but not yet verified) close_incident is an ILLEGAL_TRANSITION — the
// engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds corrective_actions_assigned to
// close_incident's `from`, or reorders states so an incident can close on
// unverified mitigations — a hazard is then signed off as fixed when it isn't.
//
// Also pins regulatorPresentIfCritical: a critical (s24 reportable) incident
// cannot pass classify without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { hseIncident } from '../../src/v2/domain/chains/hse_incident';
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
const INVESTIGATOR: Actor = { id: 'user-investigator', kind: 'user', participant_id: 'party-investigator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { hse_incident: hseIncident }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'hse_incident', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'hse_incident', edge: 'open', actor: REPORTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// low-severity near-miss — investigator named, no regulator needed.
const baseOpen = {
  site_name: 'Wind Farm 2 — WTG-14',
  incident_type: 'near_miss',
  description: 'Dropped tool from nacelle, exclusion zone was clear',
  investigator_party: INVESTIGATOR.participant_id,
};

describe('hse_incident — an incident cannot close before corrective actions are verified', () => {
  it('declares settles:false (a safety control, never a payment)', () => {
    expect(hseIncident.settles).toBe(false);
  });

  it('happy path reported -> ... -> closed, and close_incident from assigned is ILLEGAL', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-i', baseOpen);
    expect((await act(deps, 'txn-i', 'classify', INVESTIGATOR, { priority: 'medium', severity_score: 3 })).ok).toBe(true);
    expect((await act(deps, 'txn-i', 'open_investigation', INVESTIGATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-i', 'record_root_cause', INVESTIGATOR, { root_cause: 'tool lanyard not clipped' })).ok).toBe(true);
    expect((await act(deps, 'txn-i', 'assign_actions', INVESTIGATOR, { corrective_action_ref: 'CAPA-4412' })).ok).toBe(true);
    expect((await store.getTxn('txn-i'))!.txn.state).toBe('corrective_actions_assigned');

    // the graph forbids closing here — corrective actions are assigned but NOT verified.
    const early = await act(deps, 'txn-i', 'close_incident', INVESTIGATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-i'))!.txn.state).toBe('corrective_actions_assigned');

    // verify first, THEN close succeeds — and both timestamps land.
    expect((await act(deps, 'txn-i', 'verify_actions', INVESTIGATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-i'))!.txn.state).toBe('corrective_actions_verified');
    expect((await act(deps, 'txn-i', 'close_incident', INVESTIGATOR)).ok).toBe(true);

    const txn = (await store.getTxn('txn-i'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.closed_at_hse).toBe('string');
  });
});

describe('hse_incident — regulatorPresentIfCritical gates classification', () => {
  it('critical incident with NO regulator is refused at classify', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    const r = await act(deps, 'txn-c', 'classify', INVESTIGATOR, { priority: 'critical', severity_score: 9, reportable: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('reported');
  });

  it('critical incident WITH a regulator party clears classification', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', { ...baseOpen, regulator_party: REGULATOR_ID });
    const r = await act(deps, 'txn-c', 'classify', INVESTIGATOR, { priority: 'critical', severity_score: 9, reportable: true });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('triaged');
  });
});
