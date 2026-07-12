// contract_execution — the structural e-signature gate, as a driven property.
//
// A contract must NEVER be fully executed without the counterparty's signature.
// This is enforced by the state graph, not a guard: execute leaves ONLY
// partially_signed, and the ONLY path into partially_signed is counterparty_sign.
// So from out_for_signature (sent but unsigned) execute is an ILLEGAL_TRANSITION —
// the engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds out_for_signature to execute's `from`,
// letting a contract execute on the originator's countersignature alone — the
// counterparty is bound to terms it never signed.
//
// Also pins: counterpartyDistinct at '@new' (an originator that names itself as
// counterparty is refused SELF_DEALING), the signature-payload requirement (you
// cannot sign with nothing → BAD_INPUT), and completenessEvidencePresent at
// execution (no signed-packet ref → MISSING_COMPLETENESS_EVIDENCE).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { contractExecution } from '../../src/v2/domain/chains/contract_execution';
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

const ORIGINATOR: Actor = { id: 'user-orig', kind: 'user', participant_id: 'party-orig' };
const COUNTERPARTY: Actor = { id: 'user-cp', kind: 'user', participant_id: 'party-cp' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { contract_execution: contractExecution }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'contract_execution', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>, actor: Actor = ORIGINATOR) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'contract_execution', edge: 'open', actor, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  contract_type: 'PPA',
  template_ref: 'TPL-PPA-2026',
  originator_name: 'Eskom',
  counterparty_name: 'Scatec',
  counterparty_party: COUNTERPARTY.participant_id,
  governing_law: 'RSA',
};

describe('contract_execution — a contract cannot fully execute before the counterparty signs', () => {
  it('declares settles:false (a framework record, never a payment)', () => {
    expect(contractExecution.settles).toBe(false);
  });

  it('happy path: open -> send -> counterparty_sign -> execute -> fully_executed', async () => {
    const deps = newDeps();
    const store = deps.store;
    expect((await open(deps, 'txn-h', baseOpen)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'send_for_signature', ORIGINATOR)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'counterparty_sign', COUNTERPARTY, { counterparty_signature_ref: 'SIG-CP-77' })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('partially_signed');
    expect((await act(deps, 'txn-h', 'execute', ORIGINATOR, { originator_signature_ref: 'SIG-OR-88', completeness_ref: 'PKT-9001' })).ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('fully_executed');
    expect(typeof txn.fields.counterparty_signed_at).toBe('string');
    expect(typeof txn.fields.executed_at).toBe('string');
  });

  it('execute from out_for_signature (counterparty never signed) is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'send_for_signature', ORIGINATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('out_for_signature');

    // the graph forbids executing here — no counterparty signature exists.
    const early = await act(deps, 'txn-e', 'execute', ORIGINATOR, { originator_signature_ref: 'SIG-OR-88', completeness_ref: 'PKT-9001' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('out_for_signature');
  });
});

describe('contract_execution — evidence + independence gates', () => {
  it('an originator that names itself as counterparty is refused SELF_DEALING at @new', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-self', { ...baseOpen, counterparty_party: ORIGINATOR.participant_id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF_DEALING');
  });

  it('signing with no signature ref is a BAD_INPUT (cannot sign with nothing)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-s', baseOpen);
    await act(deps, 'txn-s', 'send_for_signature', ORIGINATOR);
    const r = await act(deps, 'txn-s', 'counterparty_sign', COUNTERPARTY, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-s'))!.txn.state).toBe('out_for_signature');
  });

  it('executing with no signed-packet completeness ref is refused MISSING_COMPLETENESS_EVIDENCE', async () => {
    const deps = newDeps();
    await open(deps, 'txn-c', baseOpen);
    await act(deps, 'txn-c', 'send_for_signature', ORIGINATOR);
    await act(deps, 'txn-c', 'counterparty_sign', COUNTERPARTY, { counterparty_signature_ref: 'SIG-CP-77' });
    // originator signature present (required), completeness_ref absent → the guard speaks.
    const r = await act(deps, 'txn-c', 'execute', ORIGINATOR, { originator_signature_ref: 'SIG-OR-88' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('partially_signed');
  });
});
