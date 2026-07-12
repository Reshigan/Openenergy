// cross_border_trade — the customs gate, as a driven property.
//
// A cross-border trade cannot flow until the regulator clears it through customs
// review. The gate is STRUCTURAL, not a guard: the only edge into `scheduled`
// leaves `approved`, and the only edge into `approved` is `approve` fired by the
// regulator out of `customs_review`. So the grid operator physically cannot
// schedule a trade that is still `proposed` — the state graph rejects it as an
// ILLEGAL_TRANSITION long before any interchange is booked.
//
// Failure mode this pins: someone adds a shortcut edge proposed→scheduled, or
// re-points `schedule` to accept `proposed`, letting an unreviewed export reach
// the grid with no NERSA customs clearance in the loop.
//
// Also pins the DELIBERATE stance: settles:false — this chain records the energy
// commitment and its schedule/delivery, never a payment.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { crossBorderTrade } from '../../src/v2/domain/chains/cross_border_trade';
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

const EXPORTER: Actor = { id: 'user-exporter', kind: 'user', participant_id: 'party-exporter' };
const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };
const GRID: Actor = { id: 'user-grid', kind: 'user', participant_id: 'party-grid' };
const IMPORTER_ID = 'party-importer';

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { cross_border_trade: crossBorderTrade },
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
    {
      txn_id: txnId,
      chain_key: 'cross_border_trade',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      reason_code,
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'cross_border_trade',
      edge: 'open',
      actor: EXPORTER,
      input: input as Command['input'],
      expected_seq: { [txnId]: -1 },
      idempotency_key: key(),
    },
    deps,
  );
}

// every actor the test fires as (importer/regulator/grid) is supplied as a live
// party at open; the exporter is the opener (actorBecomes).
const baseOpen = {
  exporter_name: 'Eskom',
  importer_country: 'Zimbabwe (ZESA)',
  interconnector: 'Matimba–Insukamini 400kV',
  energy_mwh: 300,
  delivery_day: '2026-08-01',
  importer_party: IMPORTER_ID,
  regulator_party: REGULATOR.participant_id,
  grid_party: GRID.participant_id,
};

describe('cross_border_trade — structural customs gate', () => {
  it('declares settles:false (records the trade, never a payment)', () => {
    expect(crossBorderTrade.settles).toBe(false);
  });

  it('drives the happy path proposed→customs_review→approved→scheduled→delivered', async () => {
    const deps = newDeps();
    const store = deps.store;

    expect((await open(deps, 'txn-hp', baseOpen)).ok).toBe(true);
    expect((await store.getTxn('txn-hp'))!.txn.state).toBe('proposed');

    expect((await act(deps, 'txn-hp', 'submit_to_customs', EXPORTER, { customs_ref: 'CUST-99' })).ok).toBe(true);
    expect((await store.getTxn('txn-hp'))!.txn.state).toBe('customs_review');

    expect((await act(deps, 'txn-hp', 'approve', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-hp'))!.txn.state).toBe('approved');

    expect((await act(deps, 'txn-hp', 'schedule', GRID)).ok).toBe(true);
    expect((await store.getTxn('txn-hp'))!.txn.state).toBe('scheduled');

    const r = await act(deps, 'txn-hp', 'deliver', GRID);
    expect(r.ok).toBe(true);

    const txn = (await store.getTxn('txn-hp'))!.txn;
    expect(txn.state).toBe('delivered');
    expect(typeof txn.fields.delivered_at).toBe('string'); // derive stamped the instant
  });

  it('the grid CANNOT schedule a still-proposed trade (structural ILLEGAL_TRANSITION)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-jump', baseOpen);

    // grid is a live, authorized party for `schedule` — but there is no edge into
    // `scheduled` from `proposed`, so the state graph rejects the jump.
    const r = await act(deps, 'txn-jump', 'schedule', GRID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    // state unmoved — no customs clearance was bypassed.
    expect((await deps.store.getTxn('txn-jump'))!.txn.state).toBe('proposed');
  });
});
