// fsca_conduct_report — the structural finding gate, as a driven property.
//
// A finding (substantiated / unfounded) can be reached ONLY from
// under_investigation, and under_investigation only from acknowledged. So the
// FSCA cannot stamp a finding without first acknowledging AND opening an
// investigation — due process is enforced by the state graph, not a guard.
//
// Happy path: file → acknowledge → open_investigation → substantiate → close.
// Seam: substantiating straight from `acknowledged` (skipping the investigation)
// is an ILLEGAL_TRANSITION and leaves the report unmoved.
//
// Also pins the DELIBERATE stance: settles:false (a conduct report is a
// supervisory record, never a payment).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { fscaConductReport } from '../../src/v2/domain/chains/fsca_conduct_report';
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

const REPORTER: Actor = { id: 'user-reporter', kind: 'user', participant_id: 'party-reporter' };
const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { fsca_conduct_report: fscaConductReport },
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
    { txn_id: txnId, chain_key: 'fsca_conduct_report', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'fsca_conduct_report', edge: 'open', actor: REPORTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// regulator supplied as a party at @new so it can act on every later edge.
const baseOpen = {
  subject_name: 'Acme Securities (Pty) Ltd',
  conduct_category: 'market_abuse',
  description: 'Suspected pre-hedging ahead of a block order.',
  regulator_party: REGULATOR.participant_id,
};

describe('fsca_conduct_report — structural finding gate', () => {
  it('declares settles:false (supervisory record, not a payment)', () => {
    expect(fscaConductReport.settles).toBe(false);
  });

  it('drives file → acknowledge → open_investigation → substantiate → close', async () => {
    const deps = newDeps();
    const store = deps.store;

    expect((await open(deps, 'txn-a', baseOpen)).ok).toBe(true);
    expect((await store.getTxn('txn-a'))!.txn.state).toBe('filed');

    expect((await act(deps, 'txn-a', 'acknowledge', REGULATOR, { reference_no: 'FSCA-2026-001' })).ok).toBe(true);
    expect((await store.getTxn('txn-a'))!.txn.state).toBe('acknowledged');

    expect((await act(deps, 'txn-a', 'open_investigation', REGULATOR, { case_officer_ref: 'CO-77' })).ok).toBe(true);
    expect((await store.getTxn('txn-a'))!.txn.state).toBe('under_investigation');

    const s = await act(deps, 'txn-a', 'substantiate', REGULATOR, { finding_summary: 'Pattern confirmed on tape.' }, 'insider_trading');
    expect(s.ok).toBe(true);
    expect((await store.getTxn('txn-a'))!.txn.state).toBe('substantiated');

    expect((await act(deps, 'txn-a', 'close', REGULATOR)).ok).toBe(true);
    const txn = (await store.getTxn('txn-a'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.finding_at).toBe('string'); // derive stamped the finding instant
    expect(typeof txn.fields.closed_at_report).toBe('string');
  });

  it('substantiating straight from acknowledged is refused (ILLEGAL_TRANSITION), report unmoved', async () => {
    const deps = newDeps();
    const store = deps.store;

    await open(deps, 'txn-b', baseOpen);
    await act(deps, 'txn-b', 'acknowledge', REGULATOR, { reference_no: 'FSCA-2026-002' });
    expect((await store.getTxn('txn-b'))!.txn.state).toBe('acknowledged');

    // skip open_investigation — the finding gate is structural, not a guard.
    const r = await act(deps, 'txn-b', 'substantiate', REGULATOR, { finding_summary: 'Rushed finding.' }, 'market_abuse');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    expect((await store.getTxn('txn-b'))!.txn.state).toBe('acknowledged');
  });
});
