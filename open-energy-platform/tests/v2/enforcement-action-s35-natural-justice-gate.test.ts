// enforcement_action_s35 — the natural-justice gate, as a driven property.
//
// A determination under ERA 2006 s35 must NEVER be imposed straight off the
// notice: the respondent must first be afforded representations (audi alteram
// partem / PAJA s3). This is enforced by the state graph, not a guard:
// make_determination leaves ONLY under_review, and the ONLY paths into
// under_review are begin_review (after representations) and note_lapsed (period
// expired). So from notice_issued, make_determination is an ILLEGAL_TRANSITION
// — the engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds notice_issued to make_determination's
// `from`, letting NERSA penalise a licensee it never heard. Also pins that a
// destructive exit (withdraw) cannot fire without a structured reason_code.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { enforcementActionS35 } from '../../src/v2/domain/chains/enforcement_action_s35';
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
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { enforcement_action_s35: enforcementActionS35 },
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
    {
      txn_id: txnId,
      chain_key: 'enforcement_action_s35',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      reason_code,
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, actor: Actor, input: Record<string, unknown>) {
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'enforcement_action_s35',
      edge: 'open',
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: -1 },
      idempotency_key: key(),
    },
    deps,
  );
}

const baseOpen = {
  respondent_party: RESPONDENT.participant_id,
  respondent_name: 'Acme IPP (Pty) Ltd',
  licence_ref: 'GEN-2019-0042',
  contravention: 'Operated outside approved capacity',
  notice_ref: 'NERSA/ENF/2026/017',
};

describe('enforcement_action_s35 — a determination cannot be imposed off the notice', () => {
  it('declares settles:false (a regulatory control, never a payment)', () => {
    expect(enforcementActionS35.settles).toBe(false);
  });

  it('make_determination from notice_issued is ILLEGAL_TRANSITION; the review path succeeds', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-e', REGULATOR, baseOpen);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('notice_issued');

    // the graph forbids determining here — no representations, no review yet.
    const early = await act(deps, 'txn-e', 'make_determination', REGULATOR, { finding: 'contravened' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('notice_issued');

    // afford representations, review, THEN determine — happy path to closure.
    expect((await act(deps, 'txn-e', 'make_representations', RESPONDENT, { representations_ref: 'REP-1' })).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('representations_made');
    expect((await act(deps, 'txn-e', 'begin_review', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('under_review');

    const det = await act(deps, 'txn-e', 'make_determination', REGULATOR, { finding: 'contravened', penalty_amount_zar: 250000 });
    expect(det.ok).toBe(true);
    expect((await store.getTxn('txn-e'))!.txn.state).toBe('determination_made');

    expect((await act(deps, 'txn-e', 'require_remediation', REGULATOR, { remediation_deadline: '2026-09-01' })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'confirm_remediation', REGULATOR)).ok).toBe(true);

    const txn = (await store.getTxn('txn-e'))!.txn;
    expect(txn.state).toBe('action_closed');
    expect(typeof txn.fields.notice_served_at).toBe('string');
    expect(typeof txn.fields.determination_at).toBe('string');
    expect(typeof txn.fields.closed_at_action).toBe('string');
  });

  it('withdraw without a reason_code is rejected (destructive edge)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-w', REGULATOR, baseOpen);
    const bad = await act(deps, 'txn-w', 'withdraw', REGULATOR);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-w'))!.txn.state).toBe('notice_issued');
  });
});
