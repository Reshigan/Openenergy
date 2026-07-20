// market_conduct_exam — the findings-completeness gate, as a driven property.
//
// A conduct examination runs scheduled → fieldwork → findings_issued →
// remediation → closed. Issuing findings crosses a regulatory line: the
// examiner must certify the examination was complete first. issue_findings is
// guarded by completenessEvidencePresent — findings cannot leave `fieldwork`
// without a named completeness sign-off ref. completeness_ref is optional in
// input coercion, so it is the GUARD (not BAD_INPUT) that rejects its absence.
//
// Failure mode this pins: someone drops the guard from issue_findings and an
// examiner binds a trader with adverse findings without certifying the exam was
// even complete. Also pins settles:false (a conduct exam is supervisory, never
// a payment) and the structural sequence to a satisfactory close.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { marketConductExam } from '../../src/v2/domain/chains/market_conduct_exam';
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

const REGULATOR: Actor = { id: 'user-fsca', kind: 'user', participant_id: 'party-fsca' };
const ENTITY: Actor = { id: 'user-trader', kind: 'user', participant_id: 'party-trader' };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { market_conduct_exam: marketConductExam },
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
    { txn_id: txnId, chain_key: 'market_conduct_exam', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'market_conduct_exam', edge: 'open', actor: REGULATOR, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// entity_party MUST be supplied at open so the trader is a live party able to
// fire submit_remediation later.
const baseOpen = {
  examined_entity_name: 'Acme Power Trading (Pty) Ltd',
  entity_party: ENTITY.participant_id,
  exam_type: 'for_cause',
  exam_scope: 'intraday power order-entry conduct',
  notice_ref: 'NOTICE-2026-0442',
};

describe('market_conduct_exam — completenessEvidencePresent gates issue_findings', () => {
  it('declares settles:false (supervisory oversight, not a payment)', () => {
    expect(marketConductExam.settles).toBe(false);
  });

  it('drives the happy path scheduled→fieldwork→findings_issued→remediation→closed', async () => {
    const deps = newDeps();
    const store = deps.store;

    const opened = await open(deps, 'txn-exam', baseOpen);
    expect(opened.ok).toBe(true);
    expect((await store.getTxn('txn-exam'))!.txn.state).toBe('scheduled');

    expect((await act(deps, 'txn-exam', 'commence_fieldwork', REGULATOR)).ok).toBe(true);
    expect((await store.getTxn('txn-exam'))!.txn.state).toBe('fieldwork');

    const findings = await act(deps, 'txn-exam', 'issue_findings', REGULATOR, {
      completeness_ref: 'COMPLETE-2026-0442',
      findings_summary: 'Two instances of layering flagged',
      finding_count: 2,
    });
    expect(findings.ok).toBe(true);
    expect((await store.getTxn('txn-exam'))!.txn.state).toBe('findings_issued');

    // the entity (a live party) files its remediation plan
    const remediation = await act(deps, 'txn-exam', 'submit_remediation', ENTITY, { remediation_plan_ref: 'REMED-2026-0442' });
    expect(remediation.ok).toBe(true);
    expect((await store.getTxn('txn-exam'))!.txn.state).toBe('remediation');

    const closed = await act(deps, 'txn-exam', 'close', REGULATOR);
    expect(closed.ok).toBe(true);

    const txn = (await store.getTxn('txn-exam'))!.txn;
    expect(txn.state).toBe('closed');
    expect(typeof txn.fields.closed_at_exam).toBe('string'); // derive stamped the instant
  });

  it('issuing findings with NO completeness ref is refused (MISSING_COMPLETENESS_EVIDENCE), state unmoved', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-exam', baseOpen);
    await act(deps, 'txn-exam', 'commence_fieldwork', REGULATOR);

    const r = await act(deps, 'txn-exam', 'issue_findings', REGULATOR, { findings_summary: 'Suspected spoofing' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');

    // rejected transition committed as a .rejected event but state is unmoved.
    expect((await store.getTxn('txn-exam'))!.txn.state).toBe('fieldwork');
  });
});
