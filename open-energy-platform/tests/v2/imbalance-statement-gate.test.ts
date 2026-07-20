// imbalance — the structural statement gate, as a driven property.
//
// A balancing settlement must NEVER be confirmed before its statement is
// published. This is enforced by the state graph, not a guard: confirm_settlement
// leaves ONLY statement_published / dispute_resolved, and the ONLY path into
// statement_published is publish_statement (from calculated). So from 'calculated'
// (imbalance computed but statement not yet rendered) confirm_settlement is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds 'calculated' (or 'raised') to
// confirm_settlement's `from`, letting a settlement close on an unpublished
// statement the counterparty never saw or could dispute.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { imbalance } from '../../src/v2/domain/chains/imbalance';
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

const AGENT: Actor = { id: 'user-agent', kind: 'user', participant_id: 'party-agent' };
const CP: Actor = { id: 'user-cp', kind: 'user', participant_id: 'party-cp' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { imbalance }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'imbalance', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code: reason },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'imbalance', edge: 'open', actor: AGENT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  settlement_period: '2026-07 W1',
  metering_point: 'Eskom-TX-Beta',
  metered_mwh: 118,
  scheduled_mwh: 100,
  imbalance_price_zar_per_mwh: 950,
  counterparty_party: CP.participant_id,
};

describe('imbalance — a settlement cannot confirm before its statement is published', () => {
  it('declares settles:false (the statement is a record-only notice, never a payment)', () => {
    expect(imbalance.settles).toBe(false);
  });

  it('happy path: open -> calculate -> publish -> confirm reaches settlement_confirmed', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-i', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-i', 'calculate_imbalance', AGENT)).ok).toBe(true);

    const calc = (await store.getTxn('txn-i'))!.txn;
    expect(calc.state).toBe('calculated');
    expect(calc.fields.imbalance_mwh).toBe(18); // 118 - 100
    expect(calc.fields.imbalance_direction).toBe('long');
    expect(calc.fields.imbalance_tier).toBe('material'); // 18 MWh in [10,100)
    expect(calc.fields.imbalance_value_zar).toBe(18 * 950);

    expect((await act(deps, 'txn-i', 'publish_statement', AGENT)).ok).toBe(true);
    expect((await store.getTxn('txn-i'))!.txn.state).toBe('statement_published');

    const done = await act(deps, 'txn-i', 'confirm_settlement', AGENT);
    expect(done.ok).toBe(true);
    const txn = (await store.getTxn('txn-i'))!.txn;
    expect(txn.state).toBe('settlement_confirmed');
    expect(typeof txn.fields.confirmed_at).toBe('string');
  });

  it('confirm_settlement from calculated is ILLEGAL_TRANSITION (statement not yet published)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'calculate_imbalance', AGENT)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('calculated');

    // the graph forbids confirming here — the statement has not been published.
    const early = await act(deps, 'txn-e', 'confirm_settlement', AGENT);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('calculated');

    // publish first, THEN confirm succeeds.
    expect((await act(deps, 'txn-e', 'publish_statement', AGENT)).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'confirm_settlement', AGENT)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('settlement_confirmed');
  });
});

describe('imbalance — a dispute needs a structured reason code', () => {
  it('dispute without a reason_code is rejected (BAD_INPUT)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-d', baseOpen);
    await act(deps, 'txn-d', 'calculate_imbalance', AGENT);
    await act(deps, 'txn-d', 'publish_statement', AGENT);

    const noReason = await act(deps, 'txn-d', 'dispute', CP, { dispute_note: 'meter looks high' });
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-d'))!.txn.state).toBe('statement_published');

    const withReason = await act(deps, 'txn-d', 'dispute', CP, { dispute_note: 'meter looks high' }, 'metering_error');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-d'))!.txn.state).toBe('disputed');
  });
});
