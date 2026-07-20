// esap_monitoring — the structural independent-review assurance gate, driven.
//
// A lender's E&S monitoring cycle must NEVER be closed satisfactory without an
// independent third-party review having been commissioned. This is enforced by
// the state graph, not a guard: close_satisfactory leaves ONLY
// third_party_review / partial_close, and the ONLY path into third_party_review
// is commission_review. So from an earlier state close_satisfactory is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Also pins completenessEvidencePresent: even at third_party_review, a
// satisfactory close without a named completeness_ref is refused.
//
// Failure mode this guards: someone adds an early state to close_satisfactory's
// `from`, letting a lender sign off a project as E&S-satisfactory with no
// independent assurance — a greenwashing / covenant-breach vector.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { esapMonitoring } from '../../src/v2/domain/chains/esap_monitoring';
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

const LENDER: Actor = { id: 'user-lender', kind: 'user', participant_id: 'party-lender' };
const BORROWER_ID = 'party-borrower';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { esap_monitoring: esapMonitoring }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'esap_monitoring', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'esap_monitoring', edge: 'open', actor: LENDER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  esap_tier: 'category_b',
  project_ref: 'W20-PRJ-441',
  site_name: 'Kruisvallei Solar',
  borrower_party: BORROWER_ID,
};

describe('esap_monitoring — a cycle cannot close satisfactory without an independent review', () => {
  it('declares settles:false (a compliance control, never a payment)', () => {
    expect(esapMonitoring.settles).toBe(false);
  });

  it('drives the full happy path to closed_satisfactory', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-h', baseOpen);
    expect((await act(deps, 'txn-h', 'schedule_site_visit', LENDER, { visit_scheduled_date: '2026-08-01' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'complete_site_visit', LENDER, { finding_count_major: 1, finding_count_minor: 2 })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'identify_action', LENDER, { findings_summary: 'PS2 grievance log gaps' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'submit_cap', LENDER, { cap_reference: 'CAP-01' })).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'start_remediation', LENDER)).ok).toBe(true);
    expect((await act(deps, 'txn-h', 'commission_review', LENDER, { tpa_firm: 'ERM' })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('third_party_review');

    const closed = await act(deps, 'txn-h', 'close_satisfactory', LENDER, { completeness_ref: 'TPA-SIGNOFF-9', tpa_outcome: 'satisfactory' });
    expect(closed.ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('closed_satisfactory');
    expect(txn.fields.severity_tier).toBe('material'); // 1 major finding
    expect(typeof txn.fields.visit_completed_at).toBe('string');
    expect(typeof txn.fields.closed_at_esap).toBe('string');
  });

  it('close_satisfactory before a review is ILLEGAL_TRANSITION', async () => {
    const deps = newDeps();
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'schedule_site_visit', LENDER, { visit_scheduled_date: '2026-08-01' })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'complete_site_visit', LENDER, { finding_count_major: 0, finding_count_minor: 0 })).ok).toBe(true);
    expect((await deps.store.getTxn('txn-e'))!.txn.state).toBe('site_visit_completed');

    // no independent review commissioned yet — the graph forbids sign-off here.
    const early = await act(deps, 'txn-e', 'close_satisfactory', LENDER, { completeness_ref: 'TPA-SIGNOFF-9' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await deps.store.getTxn('txn-e'))!.txn.state).toBe('site_visit_completed');
  });
});

describe('esap_monitoring — completenessEvidencePresent gates the satisfactory close', () => {
  it('close_satisfactory with NO completeness_ref is refused at third_party_review', async () => {
    const deps = newDeps();
    await open(deps, 'txn-g', baseOpen);
    expect((await act(deps, 'txn-g', 'schedule_site_visit', LENDER, { visit_scheduled_date: '2026-08-01' })).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'complete_site_visit', LENDER, { finding_count_major: 0, finding_count_minor: 0 })).ok).toBe(true);
    expect((await act(deps, 'txn-g', 'commission_review', LENDER, { tpa_firm: 'ERM' })).ok).toBe(true);
    expect((await deps.store.getTxn('txn-g'))!.txn.state).toBe('third_party_review');

    // the guard — not a coercion — is what refuses a sign-off with no evidence.
    const r = await act(deps, 'txn-g', 'close_satisfactory', LENDER, { tpa_outcome: 'satisfactory' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-g'))!.txn.state).toBe('third_party_review');
  });
});
