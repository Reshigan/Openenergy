// wheeling_access — the structural grant gate, as a driven property.
//
// Wheeling access must NEVER be granted before a capacity study has produced
// commercial terms the applicant has accepted. This is enforced by the state
// graph, not a guard: grant_access leaves ONLY terms_accepted, and the ONLY path
// into terms_accepted is accept_terms. So from terms_offered (terms on the table
// but not yet accepted) grant_access is an ILLEGAL_TRANSITION — the engine's
// step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds terms_offered (or capacity_study) to
// grant_access's `from`, letting the operator grant network access on terms the
// applicant never accepted.
//
// Also pins regulatorPresentIfStrategic: a ≥100 MW wheel cannot be granted
// without a regulator on the txn.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { wheelingAccess } from '../../src/v2/domain/chains/wheeling_access';
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

const APPLICANT: Actor = { id: 'user-applicant', kind: 'user', participant_id: 'party-applicant' };
const OPERATOR: Actor = { id: 'user-operator', kind: 'user', participant_id: 'party-operator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { wheeling_access: wheelingAccess }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'wheeling_access', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'wheeling_access', edge: 'open', actor: APPLICANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// non-strategic (<100 MW) wheel — operator named, no regulator needed.
const baseOpen = {
  injection_point: 'Sere WEF 132kV',
  offtake_point: 'Atlantis MV yard',
  capacity_mw: 20,
  wheeled_energy_mwh: 1000,
  operator_party: OPERATOR.participant_id,
};

describe('wheeling_access — access cannot be granted before terms are accepted', () => {
  it('declares settles:false (a network-access right, never a payment)', () => {
    expect(wheelingAccess.settles).toBe(false);
  });

  it('grant_access from terms_offered is ILLEGAL_TRANSITION (terms not yet accepted)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-w', baseOpen);
    expect((await act(deps, 'txn-w', 'begin_study', OPERATOR, { study_ref: 'CS-9' })).ok).toBe(true);
    expect((await act(deps, 'txn-w', 'offer_terms', OPERATOR, { wheeling_tariff_ckwh: 18, loss_factor_pct: 4 })).ok).toBe(true);
    expect((await store.getTxn('txn-w'))!.txn.state).toBe('terms_offered');

    // the graph forbids granting here — terms are offered but NOT accepted.
    const early = await act(deps, 'txn-w', 'grant_access', OPERATOR);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-w'))!.txn.state).toBe('terms_offered');

    // accept first, THEN grant succeeds — and stamps granted_at + delivered energy.
    expect((await act(deps, 'txn-w', 'accept_terms', APPLICANT)).ok).toBe(true);
    expect((await store.getTxn('txn-w'))!.txn.state).toBe('terms_accepted');
    const granted = await act(deps, 'txn-w', 'grant_access', OPERATOR);
    expect(granted.ok).toBe(true);

    const txn = (await store.getTxn('txn-w'))!.txn;
    expect(txn.state).toBe('access_granted');
    expect(typeof txn.fields.granted_at).toBe('string');
    // 1000 MWh at a 4% loss factor = 960 MWh delivered.
    expect(txn.fields.delivered_energy_mwh).toBe(960);
  });
});

describe('wheeling_access — regulatorPresentIfStrategic gates the grant', () => {
  it('a 150 MW wheel with NO regulator is refused at grant_access', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-big', { ...baseOpen, capacity_mw: 150 });
    expect((await act(deps, 'txn-big', 'begin_study', OPERATOR, { study_ref: 'CS-10' })).ok).toBe(true);
    expect((await act(deps, 'txn-big', 'offer_terms', OPERATOR, { wheeling_tariff_ckwh: 22, loss_factor_pct: 5 })).ok).toBe(true);
    expect((await act(deps, 'txn-big', 'accept_terms', APPLICANT)).ok).toBe(true);

    const r = await act(deps, 'txn-big', 'grant_access', OPERATOR);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');
    expect((await store.getTxn('txn-big'))!.txn.state).toBe('terms_accepted');
  });

  it('a 150 MW wheel WITH a regulator party clears the grant', async () => {
    const deps = newDeps();
    await open(deps, 'txn-big2', { ...baseOpen, capacity_mw: 150, regulator_party: REGULATOR_ID });
    expect((await act(deps, 'txn-big2', 'begin_study', OPERATOR, { study_ref: 'CS-11' })).ok).toBe(true);
    expect((await act(deps, 'txn-big2', 'offer_terms', OPERATOR, { wheeling_tariff_ckwh: 22, loss_factor_pct: 5 })).ok).toBe(true);
    expect((await act(deps, 'txn-big2', 'accept_terms', APPLICANT)).ok).toBe(true);
    const r = await act(deps, 'txn-big2', 'grant_access', OPERATOR);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-big2'))!.txn.state).toBe('access_granted');
  });
});
