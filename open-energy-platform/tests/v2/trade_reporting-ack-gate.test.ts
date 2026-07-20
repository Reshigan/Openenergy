// trade_reporting — the acknowledge structural gate, as a driven property.
//
// A trade report can only be ACKNOWLEDGED (or rejected) once it is `submitted`.
// The only edge into `submitted` is `submit`, so the TR/regulator can never
// acknowledge a report that was never filed. That ordering is enforced by the
// state graph, NOT by a guard — so we drive it: acknowledging straight from
// `reporting_pending` must be refused ILLEGAL_TRANSITION with the state unmoved.
//
// Also pins settles:false (a trade report is a regulatory notification, never a
// payment) and drives the happy path open → submit → acknowledge, asserting the
// derive-stamped acknowledged_at lands as a string.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { tradeReporting } from '../../src/v2/domain/chains/trade_reporting';
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
const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { trade_reporting: tradeReporting },
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
    { txn_id: txnId, chain_key: 'trade_reporting', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'trade_reporting', edge: 'open', actor: REPORTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// regulator_party attaches the TR at @new so it can later acknowledge.
const baseOpen = {
  trade_ref: 'UTI-2026-0001',
  reporter_name: 'Vantax Energy Trading',
  asset_class: 'power',
  action_type: 'new',
  notional_zar: 5_000_000,
  trade_repository: 'JSE-TR',
  regulator_party: REGULATOR_ID,
};

describe('trade_reporting — acknowledge is structurally gated on submit', () => {
  it('declares settles:false (regulatory notification, not a payment)', () => {
    expect(tradeReporting.settles).toBe(false);
  });

  it('happy path: open → submit → acknowledge lands acknowledged with a stamped instant', async () => {
    const deps = newDeps();
    const o = await open(deps, 'txn-ok', baseOpen);
    expect(o.ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('reporting_pending');

    const s = await act(deps, 'txn-ok', 'submit', REPORTER);
    expect(s.ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('submitted');

    const a = await act(deps, 'txn-ok', 'acknowledge', REGULATOR, { tr_ack_ref: 'ACK-88213' });
    expect(a.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-ok'))!.txn;
    expect(txn.state).toBe('acknowledged');
    expect(typeof txn.fields.acknowledged_at).toBe('string'); // derive stamped it
  });

  it('acknowledging a report that was never submitted is refused ILLEGAL_TRANSITION, state unmoved', async () => {
    const deps = newDeps();
    await open(deps, 'txn-early', baseOpen);

    // straight from reporting_pending — no submit — the regulator cannot ACK.
    const r = await act(deps, 'txn-early', 'acknowledge', REGULATOR, { tr_ack_ref: 'ACK-EARLY' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    expect((await deps.store.getTxn('txn-early'))!.txn.state).toBe('reporting_pending');
  });
});
