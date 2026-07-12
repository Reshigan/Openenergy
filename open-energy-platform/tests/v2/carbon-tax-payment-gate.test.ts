// carbon_tax — the structural payment gate, as a driven property.
//
// Payment can NEVER be recorded against a return SARS has not assessed. This is
// enforced by the state graph, not a guard: record_payment leaves ONLY
// 'assessed', and the ONLY path into 'assessed' is the assess edge. So from
// 'submitted' (filed, not yet assessed) record_payment is an ILLEGAL_TRANSITION
// — the engine's state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds 'submitted' to record_payment's `from`,
// letting a taxpayer self-declare a paid amount against a liability SARS never
// computed — a revenue-leak vector.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { carbonTax } from '../../src/v2/domain/chains/carbon_tax';
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

const TAXPAYER: Actor = { id: 'user-taxpayer', kind: 'user', participant_id: 'party-taxpayer' };
const REGULATOR: Actor = { id: 'user-sars', kind: 'user', participant_id: 'party-regulator' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { carbon_tax: carbonTax }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_tax', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_tax', edge: 'open', actor: TAXPAYER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  taxpayer_name: 'Acme Smelters',
  tax_period: '2026',
  emissions_tco2e: 1000,
  allowance_pct: 60,
  regulator_party: REGULATOR.participant_id,
};

describe('carbon_tax — payment cannot be recorded before assessment', () => {
  it('declares settles:false (a statutory record, never a settlement)', () => {
    expect(carbonTax.settles).toBe(false);
  });

  it('drives open -> submit -> assess -> pay -> finalize to a terminal state', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);

    // net liability = 1000 × 236 × (1 - 0.60) = 94400
    expect((await store.getTxn('txn-c'))!.txn.fields.net_liability_zar).toBe(94400);

    expect((await act(deps, 'txn-c', 'submit_return', TAXPAYER)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('submitted');

    expect((await act(deps, 'txn-c', 'assess', REGULATOR, { assessed_liability_zar: 94400 })).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('assessed');

    expect((await act(deps, 'txn-c', 'record_payment', TAXPAYER, { paid_amount_zar: 94400 })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'finalize', REGULATOR)).ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('finalized');
    expect(typeof txn.fields.paid_at).toBe('string');
    expect(typeof txn.fields.finalized_at).toBe('string');
  });

  it('record_payment from submitted is ILLEGAL_TRANSITION (not yet assessed)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-early', baseOpen);
    expect((await act(deps, 'txn-early', 'submit_return', TAXPAYER)).ok).toBe(true);

    const early = await act(deps, 'txn-early', 'record_payment', TAXPAYER, { paid_amount_zar: 94400 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-early'))!.txn.state).toBe('submitted');
  });

  it('reject_return without a reason_code is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'submit_return', TAXPAYER)).ok).toBe(true);
    const r = await act(deps, 'txn-r', 'reject_return', REGULATOR);
    expect(r.ok).toBe(false);
  });
});
