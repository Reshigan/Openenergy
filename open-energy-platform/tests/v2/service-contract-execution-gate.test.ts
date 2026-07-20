// service_contract — the structural execution gate, as a driven property.
//
// A service contract must NEVER go `active` before it is executed. This is
// enforced by the state graph plus a guard: `execute` leaves ONLY
// execution_pending (reached solely by accept_terms), and `execute` is guarded
// by executionEvidencePresent (board approval + named legal counterparty). So a
// contract cannot start delivering service on unsigned, un-approved terms.
//
// Failure mode this guards: someone adds under_review to execute's `from`, or
// drops the executionEvidencePresent guard — a provider then bills O&M service
// against a contract that was never actually executed.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { serviceContract } from '../../src/v2/domain/chains/service_contract';
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

const CUSTOMER: Actor = { id: 'user-customer', kind: 'user', participant_id: 'party-customer' };
const PROVIDER: Actor = { id: 'user-provider', kind: 'user', participant_id: 'party-provider' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { service_contract: serviceContract }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'service_contract', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'service_contract', edge: 'open', actor: CUSTOMER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  asset_name: 'Kudusberg WTG-07',
  service_type: 'O&M',
  scope_description: 'Full-service maintenance, 5MW turbine',
  term_months: 60,
  provider_party: PROVIDER.participant_id,
};

const execEvidence = { board_approval_ref: 'BRD-2026-114', legal_counterparty_ref: 'LEG-SC-88' };

describe('service_contract — a contract cannot go active before it is executed', () => {
  it('declares settles:false (a commercial commitment record, never a payment)', () => {
    expect(serviceContract.settles).toBe(false);
  });

  it('drives the happy path @new -> ... -> expired (terminal)', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-sc', baseOpen)).ok).toBe(true);
    expect((await store.getTxn('txn-sc'))!.txn.state).toBe('draft');

    expect((await act(deps, 'txn-sc', 'propose_terms', PROVIDER, { annual_value: 4_200_000, sla_uptime_pct: 97, response_time_hours: 8 })).ok).toBe(true);
    expect((await store.getTxn('txn-sc'))!.txn.state).toBe('under_review');

    expect((await act(deps, 'txn-sc', 'accept_terms', CUSTOMER)).ok).toBe(true);
    expect((await store.getTxn('txn-sc'))!.txn.state).toBe('execution_pending');

    const executed = await act(deps, 'txn-sc', 'execute', CUSTOMER, execEvidence);
    expect(executed.ok).toBe(true);
    const afterExec = (await store.getTxn('txn-sc'))!.txn;
    expect(afterExec.state).toBe('active');
    expect(typeof afterExec.fields.proposed_at).toBe('string');
    expect(typeof afterExec.fields.executed_at).toBe('string');

    expect((await act(deps, 'txn-sc', 'expire', PROVIDER)).ok).toBe(true);
    const final = (await store.getTxn('txn-sc'))!.txn;
    expect(final.state).toBe('expired');
    expect(typeof final.fields.ended_at).toBe('string');
  });

  it('execute from under_review (skipping accept) is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    await open(deps, 'txn-skip', baseOpen);
    expect((await act(deps, 'txn-skip', 'propose_terms', PROVIDER, { annual_value: 1_000_000, sla_uptime_pct: 95, response_time_hours: 12 })).ok).toBe(true);

    const early = await act(deps, 'txn-skip', 'execute', CUSTOMER, execEvidence);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await deps.store.getTxn('txn-skip'))!.txn.state).toBe('under_review');
  });

  it('execute WITHOUT execution evidence is refused by executionEvidencePresent', async () => {
    const deps = newDeps();
    await open(deps, 'txn-noev', baseOpen);
    expect((await act(deps, 'txn-noev', 'propose_terms', PROVIDER, { annual_value: 1_000_000, sla_uptime_pct: 95, response_time_hours: 12 })).ok).toBe(true);
    expect((await act(deps, 'txn-noev', 'accept_terms', CUSTOMER)).ok).toBe(true);

    const r = await act(deps, 'txn-noev', 'execute', CUSTOMER, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_BOARD_APPROVAL');
    expect((await deps.store.getTxn('txn-noev'))!.txn.state).toBe('execution_pending');
  });
});
