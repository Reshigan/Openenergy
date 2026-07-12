// scope3_disclosure — the structural assurance gate, as a driven property.
//
// A Scope 3 disclosure must NEVER be filed on figures an assurer hasn't signed.
// This is enforced by the state graph, not a guard: file_disclosure leaves ONLY
// assurance_complete, and the ONLY path into assurance_complete is
// complete_assurance (from assurance_submitted). So from assurance_submitted
// (assurer engaged but not yet signed) file_disclosure is an ILLEGAL_TRANSITION
// — the engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds assurance_submitted (or an earlier
// state) to file_disclosure's `from`, letting a reporter file unassured
// value-chain emissions to CDP / JSE / the ISSB registry.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { scope3Disclosure } from '../../src/v2/domain/chains/scope3_disclosure';
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
const ASSURER: Actor = { id: 'user-assurer', kind: 'user', participant_id: 'party-assurer' };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { scope3_disclosure: scope3Disclosure },
    guards: GUARDS,
  };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'scope3_disclosure',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      ...(reason_code ? { reason_code } : {}),
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'scope3_disclosure', edge: 'open', actor: REPORTER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  entity_name: 'Vantax Fund',
  reporting_year: 2026,
  s3_tier: 'standard',
  reporting_framework: 'ghg_protocol',
  assurer_party: ASSURER.participant_id,
};

// drive open → ... → assurance_submitted (shared prefix).
async function toAssuranceSubmitted(deps: EngineDeps, txnId: string) {
  await open(deps, txnId, baseOpen);
  expect((await act(deps, txnId, 'set_boundaries', REPORTER, { category_count: 6 })).ok).toBe(true);
  expect((await act(deps, txnId, 'open_data_collection', REPORTER)).ok).toBe(true);
  expect((await act(deps, txnId, 'close_data_collection', REPORTER, { primary_data_coverage_pct: 70 })).ok).toBe(true);
  expect((await act(deps, txnId, 'calculate_emissions', REPORTER, { scope3_total_tco2e: 128000 })).ok).toBe(true);
  expect((await act(deps, txnId, 'review_calculations', REPORTER)).ok).toBe(true);
  expect((await act(deps, txnId, 'submit_for_assurance', REPORTER, { assurance_provider: 'Assured Co', assurance_standard: 'ISAE 3000' })).ok).toBe(true);
}

describe('scope3_disclosure — a disclosure cannot be filed before assurance completes', () => {
  it('declares settles:false (a reporting/assurance control, never a payment)', () => {
    expect(scope3Disclosure.settles).toBe(false);
  });

  it('drives the happy path @new → disclosure_filed and stamps derived timestamps', async () => {
    const deps = newDeps();
    const store = deps.store;
    await toAssuranceSubmitted(deps, 'txn-h');
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('assurance_submitted');

    expect((await act(deps, 'txn-h', 'complete_assurance', ASSURER, { assurance_type: 'reasonable' })).ok).toBe(true);
    expect((await store.getTxn('txn-h'))!.txn.state).toBe('assurance_complete');

    const filed = await act(deps, 'txn-h', 'file_disclosure', REPORTER, {
      filing_platform: 'CDP',
      filing_ref: 'CDP-2026-991',
      completeness_ref: 'COMPLETE-2026-01',
    });
    expect(filed.ok).toBe(true);

    const txn = (await store.getTxn('txn-h'))!.txn;
    expect(txn.state).toBe('disclosure_filed');
    expect(typeof txn.fields.assurance_completed_at).toBe('string');
    expect(typeof txn.fields.filing_submitted_at).toBe('string');
    expect(txn.fields.data_quality_tier).toBe('primary_led');
  });

  it('file_disclosure from assurance_submitted is ILLEGAL_TRANSITION (not yet assured)', async () => {
    const deps = newDeps();
    const store = deps.store;
    await toAssuranceSubmitted(deps, 'txn-x');
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('assurance_submitted');

    const early = await act(deps, 'txn-x', 'file_disclosure', REPORTER, {
      filing_platform: 'CDP',
      completeness_ref: 'COMPLETE-2026-01',
    });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-x'))!.txn.state).toBe('assurance_submitted');
  });

  it('file_disclosure without a completeness ref is refused by completenessEvidencePresent', async () => {
    const deps = newDeps();
    await toAssuranceSubmitted(deps, 'txn-c');
    expect((await act(deps, 'txn-c', 'complete_assurance', ASSURER, { assurance_type: 'limited' })).ok).toBe(true);

    const r = await act(deps, 'txn-c', 'file_disclosure', REPORTER, { filing_platform: 'JSE' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-c'))!.txn.state).toBe('assurance_complete');
  });
});
