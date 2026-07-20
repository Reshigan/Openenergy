// enforcement_action — the structural due-process gate, as a driven property.
//
// An enforcement action must NEVER be resolved before a determination is formally
// made. This is enforced by the state graph, not a guard: confirm_remediation
// leaves ONLY remediation_pending, and the ONLY path into remediation_pending is
// require_remediation, which fires ONLY from determination_made. So from
// notice_issued (no determination yet) confirm_remediation is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any guard.
//
// Failure mode this guards: someone adds notice_issued to confirm_remediation's
// `from`, or lets require_remediation fire pre-determination — a respondent then
// gets closed out clean on a breach the regulator never actually determined.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { enforcementAction } from '../../src/v2/domain/chains/enforcement_action';
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

const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: 'party-regulator' };
const RESPONDENT: Actor = { id: 'user-respondent', kind: 'user', participant_id: 'party-respondent' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { enforcement_action: enforcementAction }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'enforcement_action', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code: reason },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'enforcement_action', edge: 'open', actor: REGULATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  respondent_name: 'Acme Generation (Pty) Ltd',
  breach_ref: 'BR-2026-014',
  breach_summary: 'Exceeded licensed export capacity for three settlement periods',
  statutory_provision: 'ERA 2006 s22 licence condition 4.2',
  severity: 'material',
  respondent_party: RESPONDENT.participant_id,
};

describe('enforcement_action — cannot resolve before a determination is made', () => {
  it('declares settles:false (a regulatory control, never a payment)', () => {
    expect(enforcementAction.settles).toBe(false);
  });

  it('drives the happy path notice -> representations -> determination -> remediation -> resolved', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', baseOpen);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('notice_issued');

    expect((await act(deps, 'txn-e', 'submit_representations', RESPONDENT, { representations_summary: 'Metering fault, corrected' })).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('under_representation');

    expect((await act(deps, 'txn-e', 'make_determination', REGULATOR, { determination: 'financial_penalty', penalty_amount: 750_000 })).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('determination_made');

    expect((await act(deps, 'txn-e', 'require_remediation', REGULATOR, { remediation_actions: 'Recalibrate meter; submit affidavit' })).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('remediation_pending');

    expect((await act(deps, 'txn-e', 'confirm_remediation', REGULATOR, { remediation_evidence_ref: 'EVID-9931' })).ok).toBe(true);

    const txn = (await store.getTxn('txn-e'))!.txn;
    expect(txn.state).toBe('resolved');
    expect(typeof txn.fields.notice_issued_at).toBe('string');
    expect(typeof txn.fields.determined_at).toBe('string');
    expect(typeof txn.fields.resolved_at).toBe('string');
    expect(txn.fields.penalty_tier).toBe('material');
  });

  it('confirm_remediation from notice_issued is ILLEGAL_TRANSITION (no determination yet)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-x', baseOpen);
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('notice_issued');

    const early = await act(deps, 'txn-x', 'confirm_remediation', REGULATOR, { remediation_evidence_ref: 'EVID-0001' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('notice_issued');
  });
});

describe('enforcement_action — destructive exits demand a structured reason', () => {
  it('withdraw with no reason_code is rejected', async () => {
    const deps = newDeps();
    await open(deps, 'txn-w', baseOpen);
    const bad = await act(deps, 'txn-w', 'withdraw', REGULATOR);
    expect(bad.ok).toBe(false);
    expect((await deps.store.getTxn('txn-w'))!.txn.state).toBe('notice_issued');

    const good = await act(deps, 'txn-w', 'withdraw', REGULATOR, {}, 'issued_in_error');
    expect(good.ok).toBe(true);
    expect((await deps.store.getTxn('txn-w'))!.txn.state).toBe('withdrawn');
  });
});
