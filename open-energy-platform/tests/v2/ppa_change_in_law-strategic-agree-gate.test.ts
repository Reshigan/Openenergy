// ppa_change_in_law — the strategic-agree regulator gate, as a driven property.
//
// A change-in-law claim on a strategic PPA (>=100 MW) cannot be AGREED
// bilaterally: the `agree` edge is guarded by regulatorPresentIfStrategic, so
// the counterparty cannot leave `assessing` for a >=100 MW claim until a
// regulator is a live party on the txn. A sub-strategic claim (<100 MW) agrees
// freely and runs the full happy path to `implemented`.
//
// Failure mode this pins: someone drops the guard from `agree`, or the guard
// stops reading the carried capacity_mw — a nationally-material relief gets
// bilaterally agreed with no regulator in the loop.
//
// Also pins the DELIBERATE settles:false (a claim records agreed relief; the
// tariff/settlement adjustment is booked on the PPA settlement chain).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ppaChangeInLaw } from '../../src/v2/domain/chains/ppa_change_in_law';
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

const CLAIMANT: Actor = { id: 'user-ipp', kind: 'user', participant_id: 'party-ipp' };
const COUNTERPARTY: Actor = { id: 'user-offtaker', kind: 'user', participant_id: 'party-offtaker' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { ppa_change_in_law: ppaChangeInLaw }, guards: GUARDS };
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
    { txn_id: txnId, chain_key: 'ppa_change_in_law', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'ppa_change_in_law', edge: 'open', actor: CLAIMANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// counterparty_party is supplied at open so the counterparty is a LIVE party and
// can fire begin_assessment / agree / implement.
const baseOpen = {
  ppa_ref: 'PPA-2019-042',
  law_reference: 'Carbon Tax Act rate increase',
  change_description: 'Carbon tax rate raised above signature-date baseline',
  relief_sought: 'tariff',
  counterparty_party: COUNTERPARTY.participant_id,
};

describe('ppa_change_in_law — regulatorPresentIfStrategic gates agree', () => {
  it('declares settles:false (records relief, does not move money)', () => {
    expect(ppaChangeInLaw.settles).toBe(false);
  });

  it('happy path: a sub-strategic claim runs notified→assessing→agreed→implemented and stamps implemented_at', async () => {
    const deps = newDeps();
    expect((await open(deps, 'txn-small', { ...baseOpen, capacity_mw: 75 })).ok).toBe(true);
    expect((await deps.store.getTxn('txn-small'))!.txn.state).toBe('notified');

    expect((await act(deps, 'txn-small', 'begin_assessment', COUNTERPARTY)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-small'))!.txn.state).toBe('assessing');

    expect((await act(deps, 'txn-small', 'agree', COUNTERPARTY, { agreed_relief_ref: 'REL-001' })).ok).toBe(true);
    expect((await deps.store.getTxn('txn-small'))!.txn.state).toBe('agreed');

    const r = await act(deps, 'txn-small', 'implement', COUNTERPARTY, { implementation_ref: 'IMP-001' });
    expect(r.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-small'))!.txn;
    expect(txn.state).toBe('implemented');
    expect(typeof txn.fields.implemented_at).toBe('string'); // derive stamped the instant
  });

  it('agreeing a strategic (>=100 MW) claim with NO regulator on the txn is refused (REGULATOR_REQUIRED), state unmoved', async () => {
    const deps = newDeps();
    await open(deps, 'txn-big', { ...baseOpen, capacity_mw: 150 });
    await act(deps, 'txn-big', 'begin_assessment', COUNTERPARTY);
    expect((await deps.store.getTxn('txn-big'))!.txn.state).toBe('assessing');

    const r = await act(deps, 'txn-big', 'agree', COUNTERPARTY, { agreed_relief_ref: 'REL-002' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');

    // rejected transition commits a .rejected event but the state is unmoved.
    expect((await deps.store.getTxn('txn-big'))!.txn.state).toBe('assessing');
  });

  it('a strategic claim WITH a regulator party clears the gate and agrees', async () => {
    const deps = newDeps();
    await open(deps, 'txn-big2', { ...baseOpen, capacity_mw: 150, regulator_party: REGULATOR_ID });
    await act(deps, 'txn-big2', 'begin_assessment', COUNTERPARTY);

    const r = await act(deps, 'txn-big2', 'agree', COUNTERPARTY, { agreed_relief_ref: 'REL-003' });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-big2'))!.txn.state).toBe('agreed');
  });
});
