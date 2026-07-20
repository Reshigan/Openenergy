// facility_amendment — the structural consent gate, as a driven property.
//
// A facility amendment must NEVER become effective before lender consent has
// been obtained and the deed executed. This is enforced by the state graph, not
// a guard: make_effective leaves ONLY execution_signed, and the ONLY path into
// execution_signed is sign_execution from documentation_prepared, which is
// reachable ONLY from consent_obtained. So from consent_obtained (consent gained
// but not yet documented/executed) make_effective is an ILLEGAL_TRANSITION.
//
// Failure mode this guards: someone adds consent_obtained (or an earlier state)
// to make_effective's `from`, letting an amendment go live without an executed
// deed. Also pins executionEvidencePresent: sign_execution without a board
// approval ref is refused.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { facilityAmendment } from '../../src/v2/domain/chains/facility_amendment';
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

const BORROWER: Actor = { id: 'user-borrower', kind: 'user', participant_id: 'party-borrower' };
const AGENT: Actor = { id: 'user-agent', kind: 'user', participant_id: 'party-agent' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { facility_amendment: facilityAmendment }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'facility_amendment', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'facility_amendment', edge: 'open', actor: BORROWER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  facility_id: 'FAC-2031',
  amendment_class: 'majority_consent',
  description: 'Extend availability period by 6 months',
  agent_party: AGENT.participant_id,
};

const EVIDENCE = { board_approval_ref: 'BRD-9912', legal_counterparty_ref: 'LGL-4471' };

// drive amendment_requested -> consent_obtained via the majority path.
async function toConsent(deps: EngineDeps, txnId: string) {
  await open(deps, txnId, baseOpen);
  expect((await act(deps, txnId, 'assess_eligibility', AGENT, { majority_threshold_pct: 66.7 })).ok).toBe(true);
  expect((await act(deps, txnId, 'circulate_to_lenders', AGENT)).ok).toBe(true);
  expect((await act(deps, txnId, 'record_majority', AGENT)).ok).toBe(true);
  expect((await act(deps, txnId, 'obtain_consent', AGENT)).ok).toBe(true);
  expect((await deps.store.getTxn(txnId))!.txn.state).toBe('consent_obtained');
}

describe('facility_amendment — happy path to effective', () => {
  it('declares settles:false (records a term change, not a payment)', () => {
    expect(facilityAmendment.settles).toBe(false);
  });

  it('drives @new -> effective and stamps consent/effective timestamps', async () => {
    const deps = newDeps();
    await toConsent(deps, 'txn-a');
    expect((await act(deps, 'txn-a', 'prepare_documentation', AGENT)).ok).toBe(true);
    expect((await act(deps, 'txn-a', 'sign_execution', AGENT, EVIDENCE)).ok).toBe(true);
    expect((await act(deps, 'txn-a', 'make_effective', AGENT)).ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-a'))!.txn;
    expect(txn.state).toBe('effective');
    expect(txn.fields.consent_mode).toBe('majority');
    expect(typeof txn.fields.consent_obtained_at).toBe('string');
    expect(typeof txn.fields.effective_at).toBe('string');
  });
});

describe('facility_amendment — cannot go effective without an executed deed', () => {
  it('make_effective from consent_obtained is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    await toConsent(deps, 'txn-b');

    const early = await act(deps, 'txn-b', 'make_effective', AGENT);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await deps.store.getTxn('txn-b'))!.txn.state).toBe('consent_obtained');
  });

  it('sign_execution without board approval is refused (executionEvidencePresent)', async () => {
    const deps = newDeps();
    await toConsent(deps, 'txn-c');
    expect((await act(deps, 'txn-c', 'prepare_documentation', AGENT)).ok).toBe(true);

    const r = await act(deps, 'txn-c', 'sign_execution', AGENT, { legal_counterparty_ref: 'LGL-4471' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_BOARD_APPROVAL');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('documentation_prepared');
  });
});
