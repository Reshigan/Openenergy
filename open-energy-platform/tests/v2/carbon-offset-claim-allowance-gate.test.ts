// carbon_offset_claim — the structural allowance gate, as a driven property.
//
// A carbon-tax offset can NEVER reach a taxpayer's return before SARS has
// actually granted the allowance. Enforced by the state graph, not a guard:
// apply_to_return leaves ONLY allowance_granted, and the only path into
// allowance_granted is grant_allowance from sars_review. So from
// credits_earmarked (before SARS has even seen it) apply_to_return is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it.
//
// Failure mode this guards: someone adds an earlier state to apply_to_return's
// `from`, letting a taxpayer self-apply an offset SARS never granted.
//
// Also pins cpEvidencePresent: credits cannot be earmarked without a named
// retirement-evidence ref (guards against a claim over phantom credits).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { carbonOffsetClaim } from '../../src/v2/domain/chains/carbon_offset_claim';
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

const TAXPAYER: Actor = { id: 'user-taxpayer', kind: 'user', participant_id: 'party-taxpayer' };
const SARS: Actor = { id: 'user-sars', kind: 'user', participant_id: 'party-sars' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { carbon_offset_claim: carbonOffsetClaim }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_offset_claim', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_offset_claim', edge: 'open', actor: TAXPAYER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  tax_year: 2025,
  industry_group: 'general',
  gross_tax_liability_zar: 10_000_000,
  taxpayer_name: 'Acme Smelters',
  sars_party: SARS.participant_id,
};

const earmark = { credits_claimed_tco2e: 5000, ct_rate_zar_per_tco2e: 190, cp_evidence_ref: 'COAS-RET-2025-0417' };

describe('carbon_offset_claim — an offset cannot reach the return before SARS grants it', () => {
  it('declares settles:false (a fiscal record, never a payment rail)', () => {
    expect(carbonOffsetClaim.settles).toBe(false);
  });

  it('apply_to_return before grant_allowance is ILLEGAL_TRANSITION, and the happy path reconciles', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-c', baseOpen);
    expect((await act(deps, 'txn-c', 'screen_eligibility', TAXPAYER)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'earmark_credits', TAXPAYER, earmark)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('credits_earmarked');

    // the graph forbids applying to the return here — SARS has not granted anything.
    const early = await act(deps, 'txn-c', 'apply_to_return', TAXPAYER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('credits_earmarked');

    // drive the happy path through SARS to reconciled.
    expect((await act(deps, 'txn-c', 'submit_claim', TAXPAYER, { sars_reference: 'EF-2025-99' })).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'begin_review', SARS)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'grant_allowance', SARS)).ok).toBe(true);
    expect((await store.getTxn('txn-c'))!.txn.state).toBe('allowance_granted');
    expect((await act(deps, 'txn-c', 'apply_to_return', TAXPAYER)).ok).toBe(true);
    expect((await act(deps, 'txn-c', 'reconcile', SARS)).ok).toBe(true);

    const txn = (await store.getTxn('txn-c'))!.txn;
    expect(txn.state).toBe('reconciled');
    // derive stamped the lifecycle + capped the offset (5000 * 190 = 950k < 10% of 10M = 1M).
    expect(txn.fields.offset_value_zar).toBe(950_000);
    expect(txn.fields.net_tax_liability_zar).toBe(9_050_000);
    expect(typeof txn.fields.allowance_granted_at).toBe('string');
    expect(typeof txn.fields.reconciled_at_coc).toBe('string');
  });
});

describe('carbon_offset_claim — cpEvidencePresent gates the earmark', () => {
  it('earmark with NO retirement evidence ref is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-noev', baseOpen);
    expect((await act(deps, 'txn-noev', 'screen_eligibility', TAXPAYER)).ok).toBe(true);

    const r = await act(deps, 'txn-noev', 'earmark_credits', TAXPAYER, { credits_claimed_tco2e: 5000, ct_rate_zar_per_tco2e: 190 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_CP_EVIDENCE');
    expect((await deps.store.getTxn('txn-noev'))!.txn.state).toBe('eligibility_screening');
  });
});
