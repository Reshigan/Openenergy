// carbon_budget — the structural compliance gate, as a driven property.
//
// A carbon budget must NEVER be verified before the emitter has declared actual
// emissions. This is enforced by the state graph, not a guard: `verify` leaves
// ONLY reconciliation_submitted, and the ONLY path into reconciliation_submitted
// is submit_reconciliation. So from monitoring (period running, nothing declared)
// verify is an ILLEGAL_TRANSITION — the engine's step-4 state check refuses it.
//
// Failure mode this guards: someone adds monitoring to verify's `from`, or lets a
// breach verdict be verified against no reported emissions — a regulator would
// then sign off compliance on a budget that was never actually reconciled.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { carbonBudget } from '../../src/v2/domain/chains/carbon_budget';
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

const EMITTER: Actor = { id: 'user-emitter', kind: 'user', participant_id: 'party-emitter' };
const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { carbon_budget: carbonBudget }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_budget', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_budget', edge: 'open', actor: EMITTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  installation_name: 'Secunda CTL',
  sector: 'petrochemical',
  commitment_period: '2026-2028',
  regulator_party: REGULATOR.participant_id,
};

describe('carbon_budget — a budget cannot be verified before emissions are declared', () => {
  it('declares settles:false (a compliance control, never a payment)', () => {
    expect(carbonBudget.settles).toBe(false);
  });

  it('happy path allocate → monitor → reconcile → verify → close, with a derived breach verdict', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'allocate_budget', REGULATOR, { allocated_tco2e: 100 })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'commence_period', EMITTER)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('monitoring');

    // the graph forbids verifying here — nothing has been reconciled yet.
    const early = await act(deps, 'txn-c', 'verify', REGULATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('monitoring');

    // reconcile first (actual over allocation), THEN verify — deriving the breach.
    expect((await act(deps, 'txn-c', 'submit_reconciliation', EMITTER, { actual_emissions_tco2e: 130 })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'verify', REGULATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'close_budget', REGULATOR)).ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('closed');
    expect(txn.fields.compliance_status).toBe('exceeded');
    expect(txn.fields.excess_tco2e).toBe(30);
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.closed_at_cb).toBe('string');
  });

  it('revoke_budget without a reason_code is rejected (destructive exit needs a reason)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'allocate_budget', REGULATOR, { allocated_tco2e: 100 })).ok).toBe(true);

    const noReason = await act(deps, 'txn-r', 'revoke_budget', REGULATOR);
    expect(noReason.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('allocated');

    const withReason = await act(deps, 'txn-r', 'revoke_budget', REGULATOR, {}, 'reporting_default');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('revoked');
  });
});
