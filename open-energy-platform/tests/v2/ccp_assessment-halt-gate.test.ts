// ccp_assessment — the compliance-halt admission gate, as a driven property.
//
// Admitting a clearing counterparty is a credit-risk event. The `approve` edge
// is guarded by complianceHaltClear: while a platform-wide compliance halt
// (FSCA / NERSA directive) is in force, no new counterparty may be admitted —
// but de-risking (decline/suspend/terminate) stays open. This drives the happy
// path (initiate → assess → approve) and then pins the gate: with a halt set,
// approve is refused (COMPLIANCE_HALT) and the txn stays in `assessing`.
//
// Also pins the DELIBERATE stance: settles:false — a CCP assessment records a
// risk-admission decision and informational credit parameters; it never moves
// money or posts margin.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ccpAssessment } from '../../src/v2/domain/chains/ccp_assessment';
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

const RISK: Actor = { id: 'user-risk', kind: 'user', participant_id: 'party-risk' };
const COUNTERPARTY_ID = 'party-counterparty';
const REGULATOR_ID = 'party-regulator';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { ccp_assessment: ccpAssessment }, guards: GUARDS };
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
    { txn_id: txnId, chain_key: 'ccp_assessment', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'ccp_assessment', edge: 'open', actor: RISK, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  counterparty_name: 'Acme Clearing (Pty) Ltd',
  counterparty_party: COUNTERPARTY_ID,
  regulator_party: REGULATOR_ID,
  exposure_tier: 'tier2',
};

describe('ccp_assessment — complianceHaltClear gates approve, structural diligence gate', () => {
  it('declares settles:false (risk-admission decision, not a payment)', () => {
    expect(ccpAssessment.settles).toBe(false);
  });

  it('happy path: initiate → assess → approve, stamping approved_at', async () => {
    const deps = newDeps();
    const r0 = await open(deps, 'txn-ok', baseOpen);
    expect(r0.ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('initiated');

    const r1 = await act(deps, 'txn-ok', 'begin_assessment', RISK, { assessment_scope_ref: 'SCOPE-1' });
    expect(r1.ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('assessing');

    const r2 = await act(deps, 'txn-ok', 'approve', RISK, {
      exposure_tier: 'tier2',
      risk_rating: 'BBB',
      credit_limit_zar: 50_000_000,
      review_frequency_months: 12,
    });
    expect(r2.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-ok'))!.txn;
    expect(txn.state).toBe('approved');
    expect(typeof txn.fields.approved_at).toBe('string'); // derive stamped the instant
  });

  it('approving under a compliance halt is refused (COMPLIANCE_HALT), state unmoved', async () => {
    const deps = newDeps();
    await open(deps, 'txn-halt', baseOpen);
    await act(deps, 'txn-halt', 'begin_assessment', RISK, { assessment_scope_ref: 'SCOPE-2' });
    expect((await deps.store.getTxn('txn-halt'))!.txn.state).toBe('assessing');

    (deps.store as MemoryStore).setReference('compliance:halt', { directive: 'FSCA-2026-07' });

    const r = await act(deps, 'txn-halt', 'approve', RISK, { exposure_tier: 'tier2', review_frequency_months: 12 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('COMPLIANCE_HALT');

    // rejected transition is committed as a .rejected event but state is unmoved.
    expect((await deps.store.getTxn('txn-halt'))!.txn.state).toBe('assessing');
  });
});
