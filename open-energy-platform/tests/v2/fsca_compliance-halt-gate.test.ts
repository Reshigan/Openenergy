// fsca_compliance — the compliance-halt submission gate, as a driven property.
//
// A market participant drafts an FSCA compliance filing and submits it into the
// regulator's review queue; the regulator reviews and records compliant. The
// `submit` edge is guarded by complianceHaltClear — while a platform-wide
// compliance halt (a NERSA/POPIA directive) is in force, a filing CANNOT leave
// `drafted`. Opening the draft is fine (no guard on open); only the submission
// into the queue is frozen.
//
// Failure mode this guards: someone drops complianceHaltClear from `submit`, so
// filings flow into the FSCA review queue while the platform itself is frozen
// under a regulatory directive.
//
// Also pins the DELIBERATE stance: settles:false (a compliance filing is a
// regulatory record, never a payment) and the structural determination gate —
// `compliant` is reached only through under_review, driven end-to-end below.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { fscaCompliance } from '../../src/v2/domain/chains/fsca_compliance';
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

const ENTITY: Actor = { id: 'user-entity', kind: 'user', participant_id: 'party-entity' };
const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { fsca_compliance: fscaCompliance }, guards: GUARDS };
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
    { txn_id: txnId, chain_key: 'fsca_compliance', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'fsca_compliance', edge: 'open', actor: ENTITY, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  entity_name: 'Vantax Energy Trading',
  filing_type: 'quarterly_conduct_return',
  reporting_period: '2026-Q2',
  regulator_party: REGULATOR_ID,
};

describe('fsca_compliance — complianceHaltClear gates submit', () => {
  it('declares settles:false (regulatory record, not a payment)', () => {
    expect(fscaCompliance.settles).toBe(false);
  });

  it('drives draft → submit → review → compliant and stamps determined_at', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-happy', baseOpen);

    expect((await act(deps, 'txn-happy', 'submit', ENTITY)).ok).toBe(true);
    expect((await store.getTxn('txn-happy'))!.txn.state).toBe('submitted');

    expect((await act(deps, 'txn-happy', 'begin_review', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-happy'))!.txn.state).toBe('under_review');

    const r = await act(deps, 'txn-happy', 'record_compliant', REGULATOR);
    expect(r.ok).toBe(true);

    const txn = (await store.getTxn('txn-happy'))!.txn;
    expect(txn.state).toBe('compliant');
    expect(typeof txn.fields.determined_at).toBe('string'); // derive stamped the instant
  });

  it('a draft CANNOT be submitted while a platform compliance halt is in force (COMPLIANCE_HALT)', async () => {
    const deps = newDeps();
    const store = deps.store as MemoryStore;
    await open(deps, 'txn-halt', baseOpen);

    // NERSA/POPIA directive freezes the exchange after the draft exists.
    store.setReference('compliance:halt', true);

    const r = await act(deps, 'txn-halt', 'submit', ENTITY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('COMPLIANCE_HALT');

    // rejected transition is committed as a .rejected event but state is unmoved.
    expect((await store.getTxn('txn-halt'))!.txn.state).toBe('drafted');
  });
});
