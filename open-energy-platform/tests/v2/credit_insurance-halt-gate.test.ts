// credit_insurance — the compliance-halt inception gate, as a driven property.
//
// Requesting, underwriting and binding cover is fine, but INCEPTING it (turning
// bound cover into live indemnity) is a new platform commitment: the `incept`
// edge is guarded by complianceHaltClear. Under a POPIA/NERSA platform halt a
// bound policy cannot go live. Everything up to `bound` proceeds regardless.
//
// Also pins the DELIBERATE stance: settles:false — this chain records an
// indemnity commitment and records a lodged claim, it never moves money; the
// claim terminal is `claim_instructed`, an instruction with no finality.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { creditInsurance } from '../../src/v2/domain/chains/credit_insurance';
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

const INSURED: Actor = { id: 'user-insured', kind: 'user', participant_id: 'party-insured' };
const INSURER: Actor = { id: 'user-insurer', kind: 'user', participant_id: 'party-insurer' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { credit_insurance: creditInsurance }, guards: GUARDS };
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
    { txn_id: txnId, chain_key: 'credit_insurance', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'credit_insurance', edge: 'open', actor: INSURED, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// insurer supplied as a live party at open so it can fire begin_underwriting/bind.
const baseOpen = {
  insured_name: 'Vantax Trading',
  obligor_name: 'Eskom SOC',
  cover_amount_zar: 5_000_000,
  cover_term_months: 12,
  insurer_party: INSURER.participant_id,
};

// drives open → begin_underwriting → bind, leaving the txn in `bound`.
async function driveToBound(deps: EngineDeps, txnId: string) {
  await open(deps, txnId, baseOpen);
  await act(deps, txnId, 'begin_underwriting', INSURER);
  await act(deps, txnId, 'bind', INSURER, { premium_zar: 75_000, policy_number: 'POL-9001' });
}

describe('credit_insurance — complianceHaltClear gates inception, not underwriting', () => {
  it('declares settles:false (records an indemnity commitment, moves no money)', () => {
    expect(creditInsurance.settles).toBe(false);
  });

  it('happy path: request → underwrite → bind → incept lands in active and stamps inception_at', async () => {
    const deps = newDeps();
    await driveToBound(deps, 'txn-happy');
    expect((await deps.store.getTxn('txn-happy'))!.txn.state).toBe('bound');

    const r = await act(deps, 'txn-happy', 'incept', INSURED);
    expect(r.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-happy'))!.txn;
    expect(txn.state).toBe('active');
    expect(typeof txn.fields.inception_at).toBe('string'); // derive stamped the instant
    expect(typeof txn.fields.expiry_date).toBe('string'); // 12 months on from inception
  });

  it('inception under a platform compliance halt is refused (COMPLIANCE_HALT); state stays bound', async () => {
    const deps = newDeps();
    (deps.store as MemoryStore).setReference('compliance:halt', { directive: 'NERSA-2026-07' });
    await driveToBound(deps, 'txn-halt');

    const r = await act(deps, 'txn-halt', 'incept', INSURED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('COMPLIANCE_HALT');

    // rejected transition is a committed .rejected event but the state is unmoved.
    expect((await deps.store.getTxn('txn-halt'))!.txn.state).toBe('bound');
  });
});
