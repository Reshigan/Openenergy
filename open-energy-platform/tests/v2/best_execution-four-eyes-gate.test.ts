// best_execution — the four-eyes attestation gate, as a driven property.
//
// A best-execution attestation is authored + submitted by the trader, but the
// only edge into `attested` is `attest`, which fires ONLY from `under_review`
// (a compliance-held state). So the record cannot be attested straight out of
// `submitted` — compliance MUST take it into review first. This is a STRUCTURAL
// separation-of-duties gate: the state graph, not a guard, enforces four eyes.
//
// Failure mode this pins: someone adds an `attest` edge from `submitted` (or
// widens `attest.from`), letting a submitted-but-unreviewed record be attested
// with no independent review step.
//
// Also pins settles:false (an attestation is a conduct control, never a payment).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { bestExecution } from '../../src/v2/domain/chains/best_execution';
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

const TRADER: Actor = { id: 'user-trader', kind: 'user', participant_id: 'party-trader' };
const COMPLIANCE: Actor = { id: 'user-compliance', kind: 'user', participant_id: 'party-compliance' };
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { best_execution: bestExecution }, guards: GUARDS };
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
    { txn_id: txnId, chain_key: 'best_execution', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'best_execution', edge: 'open', actor: TRADER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// compliance + regulator supplied at @new so they hold live roles downstream.
const baseOpen = {
  desk: 'ZAR-Power-Desk',
  period: '2026-Q2',
  order_count: 4210,
  venue_summary: 'JSE-SRL primary, OTC bilateral secondary',
  compliance_party: COMPLIANCE.participant_id,
  regulator_party: REGULATOR_ID,
};

describe('best_execution — four-eyes gate: attest only from under_review', () => {
  it('declares settles:false (conduct control, not a payment)', () => {
    expect(bestExecution.settles).toBe(false);
  });

  it('drives the happy path drafted → submitted → under_review → attested', async () => {
    const deps = newDeps();
    expect((await open(deps, 'txn-ok', baseOpen)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('drafted');

    expect((await act(deps, 'txn-ok', 'submit', TRADER)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('submitted');

    expect((await act(deps, 'txn-ok', 'begin_review', COMPLIANCE)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('under_review');

    expect((await act(deps, 'txn-ok', 'attest', COMPLIANCE)).ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-ok'))!.txn;
    expect(txn.state).toBe('attested');
    expect(typeof txn.fields.attested_at).toBe('string'); // derive stamped the instant
  });

  it('attesting straight from `submitted` is structurally illegal (no review step)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-skip', baseOpen);
    await act(deps, 'txn-skip', 'submit', TRADER);
    expect((await deps.store.getTxn('txn-skip'))!.txn.state).toBe('submitted');

    const r = await act(deps, 'txn-skip', 'attest', COMPLIANCE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    // state unmoved — the record stays submitted, unattested.
    expect((await deps.store.getTxn('txn-skip'))!.txn.state).toBe('submitted');
  });

  it('a flagged record loops through remediation and can then be attested', async () => {
    const deps = newDeps();
    await open(deps, 'txn-flag', baseOpen);
    await act(deps, 'txn-flag', 'submit', TRADER);
    await act(deps, 'txn-flag', 'begin_review', COMPLIANCE);

    expect((await act(deps, 'txn-flag', 'flag', COMPLIANCE, { flag_finding_ref: 'FIND-77' }, 'venue_selection')).ok).toBe(true);
    expect((await deps.store.getTxn('txn-flag'))!.txn.state).toBe('flagged');

    await act(deps, 'txn-flag', 'begin_remediation', TRADER);
    await act(deps, 'txn-flag', 'resubmit', TRADER, { remediation_ref: 'REM-77' });
    expect((await deps.store.getTxn('txn-flag'))!.txn.state).toBe('submitted');

    await act(deps, 'txn-flag', 'begin_review', COMPLIANCE);
    expect((await act(deps, 'txn-flag', 'attest', COMPLIANCE)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-flag'))!.txn.state).toBe('attested');
  });
});
