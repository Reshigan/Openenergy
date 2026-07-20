// settlement_fail — the structural buy-in gate, as a driven property.
//
// A settlement fail must be INVESTIGATED before a buy-in can be instructed. The
// only edge into buy_in_instructed is instruct_buy_in, and it fires ONLY from
// investigating — begin_investigation is the sole way in. So instruct_buy_in
// straight off detected is a structural ILLEGAL_TRANSITION, not a guard: the
// state graph forbids buying-in on a raw, un-triaged fail. No guard can be
// dropped to defeat it.
//
// Also pins settles:false — buy_in_instructed is a RECORD-ONLY money-named state
// (a buy-in was *instructed*, not settled); this chain never moves money.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { settlementFail } from '../../src/v2/domain/chains/settlement_fail';
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

const CLEARING: Actor = { id: 'user-clearing', kind: 'user', participant_id: 'party-clearing' };
const COUNTERPARTY_ID = 'party-counterparty';

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { settlement_fail: settlementFail },
    guards: GUARDS,
  };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(
  deps: EngineDeps,
  txnId: string,
  edge: string,
  actor: Actor,
  input: Record<string, unknown> = {},
  reason_code?: string,
) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'settlement_fail', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'settlement_fail', edge: 'open', actor: CLEARING, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// counterparty_party supplied at open so the failing counterparty is a live party.
const baseOpen = {
  trade_ref: 'TRD-9001',
  instrument: 'ENERGY-FWD-2026Q3',
  shortfall_quantity: 500,
  value_zar: 1_250_000,
  counterparty_party: COUNTERPARTY_ID,
};

describe('settlement_fail — structural buy-in gate (investigate before buy-in)', () => {
  it('declares settles:false (RECORD ONLY, no settlement finality)', () => {
    expect(settlementFail.settles).toBe(false);
  });

  it('happy path: detected → investigating → buy_in_instructed → resolved (stamps resolved_at)', async () => {
    const deps = newDeps();
    const o = await open(deps, 'txn-fail', baseOpen);
    expect(o.ok).toBe(true);
    expect((await deps.store.getTxn('txn-fail'))!.txn.state).toBe('detected');

    const inv = await act(deps, 'txn-fail', 'begin_investigation', CLEARING);
    expect(inv.ok).toBe(true);

    const bi = await act(deps, 'txn-fail', 'instruct_buy_in', CLEARING, { buy_in_reference: 'BI-77' });
    expect(bi.ok).toBe(true);
    expect((await deps.store.getTxn('txn-fail'))!.txn.state).toBe('buy_in_instructed');

    const res = await act(deps, 'txn-fail', 'resolve', CLEARING, { resolution_method: 'buy-in filled' }, 'buy_in_executed');
    expect(res.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-fail'))!.txn;
    expect(txn.state).toBe('resolved');
    expect(typeof txn.fields.resolved_at).toBe('string'); // derive stamped the instant
    expect(typeof txn.fields.buy_in_instructed_at).toBe('string');
  });

  it('instruct_buy_in straight off detected is a structural ILLEGAL_TRANSITION (state unmoved)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-fail', baseOpen);

    // no begin_investigation — attempt the buy-in on a raw fail.
    const r = await act(deps, 'txn-fail', 'instruct_buy_in', CLEARING, { buy_in_reference: 'BI-77' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    expect((await deps.store.getTxn('txn-fail'))!.txn.state).toBe('detected');
  });
});
