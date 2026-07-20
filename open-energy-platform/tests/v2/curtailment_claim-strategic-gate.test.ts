// curtailment_claim — the strategic regulator gate on the money edge, driven.
//
// A curtailment claim RECORDS a deemed-energy compensation instruction; it never
// moves money (settles:false). The grid validates then quantifies the claim, and
// only from `quantified` can the offtaker instruct compensation — a structural
// spine, so money can't be instructed before the curtailment event is validated
// and quantified.
//
// The seam: instructing compensation on a ≥100 MW plant crosses a regulatory
// line — regulatorPresentIfStrategic refuses the money edge until a regulator is
// a live party. Below 100 MW the guard is a no-op. Failure mode guarded: someone
// drops the guard and a strategic-plant compensation is instructed with no NERSA
// in the loop.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { curtailmentClaim } from '../../src/v2/domain/chains/curtailment_claim';
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

const GENERATOR: Actor = { id: 'user-gen', kind: 'user', participant_id: 'party-generator' };
const GRID: Actor = { id: 'user-grid', kind: 'user', participant_id: 'party-grid' };
const OFFTAKER: Actor = { id: 'user-offtaker', kind: 'user', participant_id: 'party-offtaker' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { curtailment_claim: curtailmentClaim },
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
    { txn_id: txnId, chain_key: 'curtailment_claim', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'curtailment_claim', edge: 'open', actor: GENERATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  plant_name: 'Loeriesfontein Wind',
  curtailment_event_ref: 'SO-2026-0417',
  curtailment_start: '2026-04-17T09:00:00.000Z',
  curtailment_end: '2026-04-17T13:00:00.000Z',
  claimed_mwh: 320,
  grid_party: GRID.participant_id,
  offtaker_party: OFFTAKER.participant_id,
};

const state = async (deps: EngineDeps, id: string): Promise<string> =>
  (await deps.store.getTxn(id))!.txn.state;

describe('curtailment_claim — regulatorPresentIfStrategic gates the money edge', () => {
  it('declares settles:false (records a compensation instruction, never a payment)', () => {
    expect(curtailmentClaim.settles).toBe(false);
  });

  it('happy path: raised → validated → quantified → compensated_instructed (regulator present)', async () => {
    const deps = newDeps();
    const r0 = await open(deps, 'txn-ok', { ...baseOpen, capacity_mw: 150, regulator_party: REGULATOR_ID });
    expect(r0.ok).toBe(true);
    expect(await state(deps, 'txn-ok')).toBe('raised');

    expect((await act(deps, 'txn-ok', 'validate', GRID)).ok).toBe(true);
    expect(await state(deps, 'txn-ok')).toBe('validated');

    expect((await act(deps, 'txn-ok', 'quantify', GRID, { validated_mwh: 300, tariff_zar_mwh: 950, compensation_zar: 285000 })).ok).toBe(true);
    expect(await state(deps, 'txn-ok')).toBe('quantified');

    const r = await act(deps, 'txn-ok', 'instruct_compensation', OFFTAKER);
    expect(r.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-ok'))!.txn;
    expect(txn.state).toBe('compensated_instructed');
    expect(typeof txn.fields.instructed_at).toBe('string'); // derive stamped the instant
  });

  it('seam: a ≥100 MW claim with NO regulator is refused at instruct_compensation (REGULATOR_REQUIRED)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-strat', { ...baseOpen, capacity_mw: 150 }); // no regulator_party
    await act(deps, 'txn-strat', 'validate', GRID);
    await act(deps, 'txn-strat', 'quantify', GRID, { validated_mwh: 300, compensation_zar: 285000 });
    expect(await state(deps, 'txn-strat')).toBe('quantified');

    const r = await act(deps, 'txn-strat', 'instruct_compensation', OFFTAKER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');

    // rejected transition committed as a .rejected event, but state is unmoved.
    expect(await state(deps, 'txn-strat')).toBe('quantified');
  });

  it('below 100 MW the gate is a no-op — compensation instructs with no regulator', async () => {
    const deps = newDeps();
    await open(deps, 'txn-small', { ...baseOpen, capacity_mw: 50 }); // no regulator_party
    await act(deps, 'txn-small', 'validate', GRID);
    await act(deps, 'txn-small', 'quantify', GRID, { validated_mwh: 40, compensation_zar: 38000 });

    const r = await act(deps, 'txn-small', 'instruct_compensation', OFFTAKER);
    expect(r.ok).toBe(true);
    expect(await state(deps, 'txn-small')).toBe('compensated_instructed');
  });
});
