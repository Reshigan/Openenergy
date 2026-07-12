// virtual_ppa_settlement — the compute-before-instruct spine + the compliance
// gate on the money instruction, as a driven property.
//
// A VPPA CfD settlement can only reach settled_instructed via
// period_open → strike_computed → difference_computed → instruct_settlement.
// The derive on compute_difference stamps difference_zar/direction and the
// timestamp; instruct_settlement stamps settled_at. The money instruction
// (instruct_settlement) is guarded by complianceHaltClear — under a
// platform-wide halt the instruction is refused and the txn stays put.
//
// Also pins the DELIBERATE stance: settles:false — this chain RECORDS the CfD
// difference and INSTRUCTS a payment; it never moves money or holds custody.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { virtualPpaSettlement } from '../../src/v2/domain/chains/virtual_ppa_settlement';
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
const OFFTAKER: Actor = { id: 'user-off', kind: 'user', participant_id: 'party-offtaker' };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { virtual_ppa_settlement: virtualPpaSettlement },
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
    { txn_id: txnId, chain_key: 'virtual_ppa_settlement', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'virtual_ppa_settlement', edge: 'open', actor: GENERATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// offtaker MUST be supplied at open so it is a live party for later edges.
const baseOpen = {
  contract_ref: 'VPPA-2026-001',
  period_start: '2026-06-01',
  period_end: '2026-06-30',
  offtaker_party: OFFTAKER.participant_id,
};

async function state(deps: EngineDeps, id: string): Promise<string> {
  return (await deps.store.getTxn(id))!.txn.state;
}

describe('virtual_ppa_settlement — compute-before-instruct spine + halt gate', () => {
  it('declares settles:false (records a CfD difference + instructs; never moves money)', () => {
    expect(virtualPpaSettlement.settles).toBe(false);
  });

  it('drives the happy path to settled_instructed and stamps the derived fields', async () => {
    const deps = newDeps();
    const r0 = await open(deps, 'txn-1', baseOpen);
    expect(r0.ok).toBe(true);
    expect(await state(deps, 'txn-1')).toBe('period_open');

    const r1 = await act(deps, 'txn-1', 'compute_strike', GENERATOR, { strike_zar_mwh: 850 });
    expect(r1.ok).toBe(true);
    expect(await state(deps, 'txn-1')).toBe('strike_computed');

    const r2 = await act(deps, 'txn-1', 'compute_difference', OFFTAKER, { reference_zar_mwh: 700, volume_mwh: 1000 });
    expect(r2.ok).toBe(true);
    expect(await state(deps, 'txn-1')).toBe('difference_computed');

    const midFields = (await deps.store.getTxn('txn-1'))!.txn.fields;
    // (850 − 700) × 1000 = 150000, market below strike ⇒ generator receives.
    expect(midFields.difference_zar).toBe(150000);
    expect(midFields.settlement_direction).toBe('generator_receives');
    expect(typeof midFields.difference_computed_at).toBe('string');

    const r3 = await act(deps, 'txn-1', 'instruct_settlement', OFFTAKER);
    expect(r3.ok).toBe(true);
    expect(await state(deps, 'txn-1')).toBe('settled_instructed');
    expect(typeof (await deps.store.getTxn('txn-1'))!.txn.fields.settled_at).toBe('string');
  });

  it('refuses the money instruction under a compliance halt — state unmoved (COMPLIANCE_HALT)', async () => {
    const deps = newDeps();
    const store = deps.store as MemoryStore;
    await open(deps, 'txn-2', baseOpen);
    await act(deps, 'txn-2', 'compute_strike', GENERATOR, { strike_zar_mwh: 900 });
    await act(deps, 'txn-2', 'compute_difference', OFFTAKER, { reference_zar_mwh: 1100, volume_mwh: 500 });
    expect(await state(deps, 'txn-2')).toBe('difference_computed');

    store.setReference('compliance:halt', { directive: 'NERSA-2026-07' });

    const r = await act(deps, 'txn-2', 'instruct_settlement', OFFTAKER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('COMPLIANCE_HALT');

    // rejected instruction is recorded but the txn stays at difference_computed.
    expect(await state(deps, 'txn-2')).toBe('difference_computed');
  });
});
