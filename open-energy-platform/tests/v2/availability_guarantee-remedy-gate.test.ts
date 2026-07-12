// availability_guarantee — the remedy structural gate, as a driven property.
//
// A remedy can be instructed ONLY on a period that computed a shortfall.
// instruct_remedy is the sole edge into remedy_instructed and fires ONLY from
// shortfall_computed; assess_met goes straight to terminal met_closed. So a
// period the buyer assessed as MET can never have a remedy instructed against
// it — the state graph enforces settlement honesty, no guard involved.
//
// Failure mode this pins: someone adds a remedy edge out of met_closed (or off
// `measured` directly), and a met period gets billed liquidated damages.
//
// Also pins the DELIBERATE stance: settles:false — this chain RECORDS a remedy
// INSTRUCTION, it never moves money; the payment settles on a rail elsewhere.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { availabilityGuarantee } from '../../src/v2/domain/chains/availability_guarantee';
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

const PROVIDER: Actor = { id: 'user-provider', kind: 'user', participant_id: 'party-provider' };
const BUYER: Actor = { id: 'user-buyer', kind: 'user', participant_id: 'party-buyer' };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { availability_guarantee: availabilityGuarantee },
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
      chain_key: 'availability_guarantee',
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
      chain_key: 'availability_guarantee',
      edge: 'open',
      actor: PROVIDER,
      input: input as Command['input'],
      expected_seq: { [txnId]: -1 },
      idempotency_key: key(),
    },
    deps,
  );
}

// capacity < 100 MW so regulatorPresentIfStrategic is a no-op on instruct_remedy.
const baseOpen = {
  asset_name: 'Kathu Solar Field',
  capacity_mw: 75,
  guaranteed_availability_pct: 95,
  period_start: '2026-01-01T00:00:00.000Z',
  period_end: '2026-01-31T23:59:59.000Z',
  buyer_party: BUYER.participant_id,
};

const state = async (deps: EngineDeps, id: string) => (await deps.store.getTxn(id))!.txn.state;

describe('availability_guarantee — remedy fires only from a computed shortfall', () => {
  it('declares settles:false (records a remedy instruction, never moves money)', () => {
    expect(availabilityGuarantee.settles).toBe(false);
  });

  it('happy path: open → measure → assess_shortfall → instruct_remedy (RECORD ONLY)', async () => {
    const deps = newDeps();
    expect((await open(deps, 'txn-short', baseOpen)).ok).toBe(true);
    expect(await state(deps, 'txn-short')).toBe('period_open');

    expect((await act(deps, 'txn-short', 'measure', PROVIDER, { measured_availability_pct: 88 })).ok).toBe(true);
    expect(await state(deps, 'txn-short')).toBe('measured');

    expect((await act(deps, 'txn-short', 'assess_shortfall', BUYER)).ok).toBe(true);
    expect(await state(deps, 'txn-short')).toBe('shortfall_computed');

    const r = await act(
      deps,
      'txn-short',
      'instruct_remedy',
      PROVIDER,
      { remedy_ref: 'LD-2026-001', remedy_zar: 1_250_000 },
      'liquidated_damages',
    );
    expect(r.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-short'))!.txn;
    expect(txn.state).toBe('remedy_instructed');
    expect(typeof txn.fields.instructed_at).toBe('string'); // derive-stamped instant
    expect(txn.fields.shortfall_pct).toBe(7); // 95 - 88, computed at assess_shortfall
  });

  it('structural gate: a MET period can never have a remedy instructed (ILLEGAL_TRANSITION)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-met', baseOpen);
    await act(deps, 'txn-met', 'measure', PROVIDER, { measured_availability_pct: 97 });

    expect((await act(deps, 'txn-met', 'assess_met', BUYER)).ok).toBe(true);
    expect(await state(deps, 'txn-met')).toBe('met_closed');

    const r = await act(
      deps,
      'txn-met',
      'instruct_remedy',
      PROVIDER,
      { remedy_ref: 'LD-2026-002' },
      'liquidated_damages',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    // terminal met_closed is unmoved.
    expect(await state(deps, 'txn-met')).toBe('met_closed');
  });
});
