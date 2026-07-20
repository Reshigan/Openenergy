// ppa_termination — the notice→cure→withdraw path and the strategic regulator
// gate, as driven properties.
//
// Happy path: a terminating party serves notice, opens a cure period, the
// counterparty remedies the breach (cured), and the terminating party accepts
// the cure and withdraws the notice. Three roles fire real edges; the terminal
// state is `withdrawn` and withdrawn_at is derive-stamped.
//
// Seam: effect_termination is guarded by regulatorPresentIfStrategic. A ≥100 MW
// PPA cannot be terminated with no regulator on the txn — the guard rejects
// REGULATOR_REQUIRED and the state stays at cure_period. This pins that a
// strategic termination cannot bite without the regulator in the loop.
//
// Also pins the DELIBERATE stance: settles:false — a termination records a
// change to a bilateral commitment, it moves no money (any break fee is a
// downstream settlement chain's concern).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ppaTermination } from '../../src/v2/domain/chains/ppa_termination';
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

const TERMINATING: Actor = { id: 'user-terminating', kind: 'user', participant_id: 'party-terminating' };
const COUNTERPARTY: Actor = { id: 'user-counterparty', kind: 'user', participant_id: 'party-counterparty' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { ppa_termination: ppaTermination }, guards: GUARDS };
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
    { txn_id: txnId, chain_key: 'ppa_termination', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>, reason_code = 'material_breach') {
  return applyTransition(
    { txn_id: txnId, chain_key: 'ppa_termination', edge: 'open', actor: TERMINATING, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key(), reason_code },
    deps,
  );
}

// counterparty is a party at open so it can fire remedy_breach later.
const baseOpen = { ppa_ref: 'PPA-0007', offtaker_name: 'Aurora Offtake', cure_period_days: 30, counterparty_party: COUNTERPARTY.participant_id };

describe('ppa_termination — notice/cure/withdraw path + strategic regulator gate', () => {
  it('declares settles:false (records a commitment change, moves no money)', () => {
    expect(ppaTermination.settles).toBe(false);
  });

  it('happy path: notice → cure period → remedied → cure accepted → withdrawn (stamps withdrawn_at)', async () => {
    const deps = newDeps();
    const store = deps.store;

    const o = await open(deps, 'txn-cure', { ...baseOpen, capacity_mw: 40 });
    expect(o.ok).toBe(true);
    expect((await store.getTxn('txn-cure'))!.txn.state).toBe('notified');

    const c = await act(deps, 'txn-cure', 'commence_cure', TERMINATING, { cure_period_days: 30 });
    expect(c.ok).toBe(true);
    expect((await store.getTxn('txn-cure'))!.txn.state).toBe('cure_period');

    // counterparty remedies the breach.
    const r = await act(deps, 'txn-cure', 'remedy_breach', COUNTERPARTY, { remedy_evidence_ref: 'CURE-EV-1' });
    expect(r.ok).toBe(true);
    expect((await store.getTxn('txn-cure'))!.txn.state).toBe('cured');

    // terminating accepts the cure and withdraws.
    const w = await act(deps, 'txn-cure', 'accept_cure', TERMINATING);
    expect(w.ok).toBe(true);

    const txn = (await store.getTxn('txn-cure'))!.txn;
    expect(txn.state).toBe('withdrawn');
    expect(typeof txn.fields.withdrawn_at).toBe('string'); // derive stamped the instant
  });

  it('strategic (≥100 MW) termination with NO regulator is refused (REGULATOR_REQUIRED), state unmoved', async () => {
    const deps = newDeps();
    const store = deps.store;

    // no regulator_party supplied at open → no live regulator on the txn.
    await open(deps, 'txn-strat', { ...baseOpen, capacity_mw: 150 });
    await act(deps, 'txn-strat', 'commence_cure', TERMINATING, { cure_period_days: 30 });
    expect((await store.getTxn('txn-strat'))!.txn.state).toBe('cure_period');

    const r = await act(deps, 'txn-strat', 'effect_termination', TERMINATING);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');

    // rejected transition is committed as a .rejected event but state is unmoved.
    expect((await store.getTxn('txn-strat'))!.txn.state).toBe('cure_period');
  });

  it('strategic termination WITH a regulator party clears the gate (stamps terminated_at)', async () => {
    const deps = newDeps();
    const store = deps.store;

    await open(deps, 'txn-strat-ok', { ...baseOpen, capacity_mw: 150, regulator_party: REGULATOR_ID });
    await act(deps, 'txn-strat-ok', 'commence_cure', TERMINATING, { cure_period_days: 30 });

    const r = await act(deps, 'txn-strat-ok', 'effect_termination', TERMINATING);
    expect(r.ok).toBe(true);

    const txn = (await store.getTxn('txn-strat-ok'))!.txn;
    expect(txn.state).toBe('terminated');
    expect(typeof txn.fields.terminated_at).toBe('string');
  });
});
