// capital_adequacy — the completeness-attestation gate, as a driven property.
//
// A capital adequacy return cannot be FILED without a named completeness ref:
// the submit (and resubmit) edge is guarded by completenessEvidencePresent, so
// an entity that clicks submit with no attestation is refused
// (MISSING_COMPLETENESS_EVIDENCE) and the return stays in draft. With the ref,
// the return files, the regulator reviews and accepts it.
//
// Also pins the deliberate stance: settles:false — a capital return records
// solvency figures, it never moves money.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { capitalAdequacyReturn } from '../../src/v2/domain/chains/capital_adequacy';
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

const ENTITY: Actor = { id: 'user-entity', kind: 'user', participant_id: 'party-entity' };
const REGULATOR_ID = 'party-regulator';
const REGULATOR: Actor = { id: 'user-regulator', kind: 'user', participant_id: REGULATOR_ID };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { capital_adequacy: capitalAdequacyReturn },
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
    { txn_id: txnId, chain_key: 'capital_adequacy', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'capital_adequacy', edge: 'open', actor: ENTITY, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  entity_name: 'Aurora Trading (Pty) Ltd',
  reporting_period: '2026-Q2',
  tier1_capital_zar: 120_000_000,
  required_capital_zar: 80_000_000,
  regulator_party: REGULATOR_ID,
};

describe('capital_adequacy — completenessEvidencePresent gates submission', () => {
  it('declares settles:false (regulatory attestation, not a payment)', () => {
    expect(capitalAdequacyReturn.settles).toBe(false);
  });

  it('happy path: open -> submit -> begin_review -> accept, stamping accepted_at', async () => {
    const deps = newDeps();
    expect((await open(deps, 'txn-ok', baseOpen)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('draft');

    expect((await act(deps, 'txn-ok', 'submit', ENTITY, { completeness_ref: 'ATT-2026Q2-001' })).ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('submitted');

    expect((await act(deps, 'txn-ok', 'begin_review', REGULATOR)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('under_review');

    const accepted = await act(deps, 'txn-ok', 'accept', REGULATOR);
    expect(accepted.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-ok'))!.txn;
    expect(txn.state).toBe('accepted');
    expect(typeof txn.fields.accepted_at).toBe('string'); // derive stamped the instant
    expect(txn.fields.capital_ratio).toBe(1.5); // derived at submit: 120M / 80M
  });

  it('submitting with NO completeness ref is refused (MISSING_COMPLETENESS_EVIDENCE), state unmoved', async () => {
    const deps = newDeps();
    await open(deps, 'txn-bare', baseOpen);

    const r = await act(deps, 'txn-bare', 'submit', ENTITY, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');

    // rejected transition is committed as a .rejected event but state is unmoved.
    expect((await deps.store.getTxn('txn-bare'))!.txn.state).toBe('draft');
  });
});
