// ppa_annual_recon — the structural settlement gate, as a driven property.
//
// A PPA annual reconciliation records money movement it does NOT perform:
// settled_instructed is a terminal RECORD, not a settlement finality
// (settles:false). The gate is structural, not a guard — the only path to
// settled_instructed is instruct_settlement FROM agreed, and the only path to
// agreed is the buyer's `agree` FROM computed. So a settlement instruction can
// never be recorded on a figure the buyer hasn't agreed, and a figure can't be
// agreed before it's computed.
//
// This drives the happy path seller→buyer end to end, then pins the gate by
// attempting `agree` straight from `initiated` (before compute) — the engine
// must refuse it as an ILLEGAL_TRANSITION with the txn state unmoved.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ppaAnnualRecon } from '../../src/v2/domain/chains/ppa_annual_recon';
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

const SELLER: Actor = { id: 'user-ipp', kind: 'user', participant_id: 'party-ipp' };
const BUYER: Actor = { id: 'user-offtaker', kind: 'user', participant_id: 'party-offtaker' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { ppa_annual_recon: ppaAnnualRecon }, guards: GUARDS };
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
    { txn_id: txnId, chain_key: 'ppa_annual_recon', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'ppa_annual_recon', edge: 'open', actor: SELLER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// buyer_party supplied at open so the offtaker is a LIVE party able to fire `agree`.
const baseOpen = { reconciliation_year: 2025, buyer_name: 'Eskom', buyer_party: BUYER.participant_id, contracted_mwh: 12000 };

describe('ppa_annual_recon — structural settlement gate (record only)', () => {
  it('declares settles:false (records a settlement instruction, never a finality)', () => {
    expect(ppaAnnualRecon.settles).toBe(false);
  });

  it('drives the happy path seller→buyer to settled_instructed and stamps instructed_at', async () => {
    const deps = newDeps();
    const store = deps.store;

    expect((await open(deps, 'txn-recon', baseOpen)).ok).toBe(true);
    expect((await store.getTxn('txn-recon'))!.txn.state).toBe('initiated');

    expect((await act(deps, 'txn-recon', 'begin_gathering', SELLER)).ok).toBe(true);
    expect((await act(deps, 'txn-recon', 'compute', SELLER, { metered_mwh: 11500, reconciled_amount_zar: -250000 })).ok).toBe(true);

    // variance derived at compute: 11500 - 12000 = -500
    const afterCompute = (await store.getTxn('txn-recon'))!.txn;
    expect(afterCompute.state).toBe('computed');
    expect(afterCompute.fields.variance_mwh).toBe(-500);

    // only the BUYER can agree (structural + role gate)
    expect((await act(deps, 'txn-recon', 'agree', BUYER)).ok).toBe(true);
    expect((await act(deps, 'txn-recon', 'instruct_settlement', SELLER)).ok).toBe(true);

    const final = (await store.getTxn('txn-recon'))!.txn;
    expect(final.state).toBe('settled_instructed');
    expect(typeof final.fields.instructed_at).toBe('string'); // derive stamped the instant
  });

  it('agreeing straight from initiated is refused as ILLEGAL_TRANSITION, state unmoved', async () => {
    const deps = newDeps();
    await open(deps, 'txn-jump', baseOpen);

    const r = await act(deps, 'txn-jump', 'agree', BUYER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    expect((await deps.store.getTxn('txn-jump'))!.txn.state).toBe('initiated');
  });
});
