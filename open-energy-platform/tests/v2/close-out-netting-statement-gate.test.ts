// close_out_netting — the structural netting gate, as a driven property.
//
// A netted amount must NEVER be recorded without a served calculation statement.
// This is enforced by the state graph, not a guard: record_netting leaves ONLY
// statement_served, and the ONLY path into statement_served is serve_statement.
// So from amount_calculated (calculated but not served) record_netting is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before guards.
//
// Failure mode this guards: someone adds amount_calculated to record_netting's
// `from`, letting a netting be recorded on a calculation the defaulting party was
// never served — the s6(e) statement-service requirement is bypassed.
//
// Also pins: counterpartyDistinct at '@new' (a determining party naming itself as
// the defaulter is refused SELF_DEALING) and executionEvidencePresent at
// serve_statement (no board-approval ref → MISSING_BOARD_APPROVAL).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { closeOutNetting } from '../../src/v2/domain/chains/close_out_netting';
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

const DETERMINING: Actor = { id: 'user-det', kind: 'user', participant_id: 'party-det' };
const DEFAULTING: Actor = { id: 'user-def', kind: 'user', participant_id: 'party-def' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { close_out_netting: closeOutNetting }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'close_out_netting', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>, actor: Actor = DETERMINING) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'close_out_netting', edge: 'open', actor, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  determining_party_name: 'Standard Bank',
  defaulting_party_name: 'Renewco',
  defaulting_party: DEFAULTING.participant_id,
  event_of_default: 'failure_to_pay',
};

const evid = { board_approval_ref: 'BRD-2026-14', legal_counterparty_ref: 'LGL-RENEWCO-3' };

describe('close_out_netting — a netting cannot be recorded before the statement is served', () => {
  it('declares settles:false (a framework/notice record, never a payment)', () => {
    expect(closeOutNetting.settles).toBe(false);
  });

  it('happy path: open -> designate_etd -> calculate -> serve_statement -> record_netting -> netted', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'designate_etd', DETERMINING)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'calculate', DETERMINING, { close_out_amount: 4_200_000 })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'serve_statement', DETERMINING, evid)).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('statement_served');
    expect((await act(deps, 'txn-h', 'record_netting', DETERMINING)).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('netted');
    expect(typeof txn.fields.etd_at).toBe('string');
    expect(typeof txn.fields.served_at).toBe('string');
  });

  it('record_netting from amount_calculated (statement never served) is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    await act(deps, 'txn-e', 'designate_etd', DETERMINING);
    expect((await act(deps, 'txn-e', 'calculate', DETERMINING, { close_out_amount: 4_200_000 })).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('amount_calculated');

    // the graph forbids netting here — no statement has been served.
    const early = await act(deps, 'txn-e', 'record_netting', DETERMINING);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('amount_calculated');
  });
});

describe('close_out_netting — evidence + independence gates', () => {
  it('a determining party naming itself as the defaulter is refused SELF_DEALING at @new', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-self', { ...baseOpen, defaulting_party: DETERMINING.participant_id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF_DEALING');
  });

  it('serving with no board-approval ref is refused MISSING_BOARD_APPROVAL', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    await act(deps, 'txn-c', 'designate_etd', DETERMINING);
    await act(deps, 'txn-c', 'calculate', DETERMINING, { close_out_amount: 4_200_000 });
    // legal_counterparty_ref present, board_approval_ref absent → the guard speaks.
    const r = await act(deps, 'txn-c', 'serve_statement', DETERMINING, { legal_counterparty_ref: 'LGL-RENEWCO-3' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_BOARD_APPROVAL');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('amount_calculated');
  });
});
