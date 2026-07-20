// security_margin — the structural outage-reliability gate, as a driven property.
//
// A transmission element must NEVER be taken out of service before its security
// margin is assessed and the outage approved. This is enforced by the state
// graph, not a guard: commence_outage leaves ONLY outage_approved, and the ONLY
// path into outage_approved is approve_outage from margin_assessed. So from
// margin_assessed (assessed but not yet approved) commence_outage is an
// ILLEGAL_TRANSITION — the engine's state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds margin_assessed (or outage_requested) to
// commence_outage's `from`, letting an element de-energise on an unapproved
// outage — a network event with no margin sign-off.
//
// Also pins regulatorPresentIfCritical: a critical-priority outage cannot pass
// approve_outage without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { securityMargin } from '../../src/v2/domain/chains/security_margin';
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
const GRID: Actor = { id: 'user-grid', kind: 'user', participant_id: 'party-grid' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { security_margin: securityMargin }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'security_margin', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'security_margin', edge: 'open', actor: REQUESTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// normal-priority outage — grid operator named, no regulator needed.
const baseOpen = {
  element_name: 'Alpha-Beta 400kV line 1',
  outage_type: 'planned',
  priority: 'normal',
  reason_description: 'Insulator replacement',
  firm_capacity_mw: 1000,
  outage_capacity_mw: 200,
  forecast_peak_mw: 700,
  grid_party: GRID.participant_id,
};

describe('security_margin — an element cannot go out before the outage is approved', () => {
  it('declares settles:false (a network-security control, never a payment)', () => {
    expect(securityMargin.settles).toBe(false);
  });

  it('drives the happy path @new -> outage_closed', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-h', baseOpen);
    expect((await act(deps, 'txn-h', 'assess_margin', GRID)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'approve_outage', GRID)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'commence_outage', GRID)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'restore_element', GRID)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'close_outage', GRID)).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('outage_closed');
    // margin computed: (1000-200-700)/700*100 = 14.3% -> tight
    expect(txn.fields.security_margin_pct).toBe(14.3);
    expect(txn.fields.margin_tier).toBe('tight');
    expect(typeof txn.fields.assessed_at).toBe('string');
    expect(typeof txn.fields.closed_at_outage).toBe('string');
  });

  it('commence_outage from margin_assessed is ILLEGAL_TRANSITION (outage not yet approved)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'assess_margin', GRID)).ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('margin_assessed');

    // the graph forbids taking the element out here — outage assessed but NOT approved.
    const early = await act(deps, 'txn-g', 'commence_outage', GRID);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('margin_assessed');

    // approve first, THEN commence succeeds.
    expect((await act(deps, 'txn-g', 'approve_outage', GRID)).ok).toBe(true);
    const out = await act(deps, 'txn-g', 'commence_outage', GRID);
    expect(out.ok).toBe(true);
    expect((await store.getTxn('txn-g'))!.txn.state).toBe('element_out');
  });

  it('reject_outage without a reason_code is rejected', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    const r = await act(deps, 'txn-r', 'reject_outage', GRID);
    expect(r.ok).toBe(false);
  });
});

describe('security_margin — regulatorPresentIfCritical gates approval', () => {
  it('critical-priority outage with NO regulator is refused at approve_outage', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', { ...baseOpen, priority: 'critical' });
    expect((await act(deps, 'txn-c', 'assess_margin', GRID)).ok).toBe(true);

    const r = await act(deps, 'txn-c', 'approve_outage', GRID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('margin_assessed');
  });

  it('critical-priority outage WITH a regulator party clears approval', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-c', 'assess_margin', GRID)).ok).toBe(true);
    const r = await act(deps, 'txn-c', 'approve_outage', GRID);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('outage_approved');
  });
});
