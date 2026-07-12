// algo_cert — the structural certification gate, as a driven property.
//
// An algorithm may not be certified for live trading without a documented
// conformance-testing stage. The `certify` edge leaves ONLY `testing`, and the
// ONLY path into `testing` is `require_testing` from `under_review`. So the
// state graph itself forbids certifying straight out of review — no guard. The
// happy path proves certification IS reachable through testing; the seam proves
// the shortcut is refused with ILLEGAL_TRANSITION and the state is unmoved.
//
// Also pins settles:false (certification is a regulatory control, not a payment).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { algoCert } from '../../src/v2/domain/chains/algo_cert';
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
const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { algo_cert: algoCert }, guards: GUARDS };
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
    { txn_id: txnId, chain_key: 'algo_cert', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'algo_cert', edge: 'open', actor: APPLICANT, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// regulator supplied at @new so it is a live party for later review/certify edges.
const baseOpen = { algo_name: 'AlphaMM', strategy_class: 'market_making', regulator_party: REGULATOR.participant_id };

describe('algo_cert — certify is reachable only through conformance testing', () => {
  it('declares settles:false (regulatory control, not a payment)', () => {
    expect(algoCert.settles).toBe(false);
  });

  it('happy path: submitted → under_review → testing → certified (stamps certified_at)', async () => {
    const deps = newDeps();
    const store = deps.store;

    const o = await open(deps, 'txn-ok', baseOpen);
    expect(o.ok).toBe(true);
    expect((await store.getTxn('txn-ok'))!.txn.state).toBe('submitted');

    expect((await act(deps, 'txn-ok', 'begin_review', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-ok'))!.txn.state).toBe('under_review');

    expect((await act(deps, 'txn-ok', 'require_testing', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-ok'))!.txn.state).toBe('testing');

    const c = await act(deps, 'txn-ok', 'certify', REGULATOR, { conformance_report_ref: 'CONF-2026-001' });
    expect(c.ok).toBe(true);

    const txn = (await store.getTxn('txn-ok'))!.txn;
    expect(txn.state).toBe('certified');
    expect(typeof txn.fields.certified_at).toBe('string'); // derive stamped the instant
  });

  it('certifying straight from under_review (skipping testing) is refused (ILLEGAL_TRANSITION)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-skip', baseOpen);
    await act(deps, 'txn-skip', 'begin_review', REGULATOR);
    expect((await deps.store.getTxn('txn-skip'))!.txn.state).toBe('under_review');

    const r = await act(deps, 'txn-skip', 'certify', REGULATOR, { conformance_report_ref: 'CONF-2026-002' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    // structurally blocked before any state change.
    expect((await deps.store.getTxn('txn-skip'))!.txn.state).toBe('under_review');
  });
});
