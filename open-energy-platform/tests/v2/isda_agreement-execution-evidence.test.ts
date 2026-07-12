// isda_agreement — the execution-evidence gate, as a driven property.
//
// An ISDA master agreement is not "executed" on a click: the execute edge is
// guarded by executionEvidencePresent, so a negotiating agreement cannot cross
// into `executed` without a board approval ref AND a named legal counterparty
// ref. Drop the guard or omit the evidence and a framework contract that governs
// close-out netting goes live with no signed-off legal basis.
//
// Happy path drives open → submit → execute → amend (the Section 1 single-
// agreement self-loop) and asserts executed_at is derive-stamped.
//
// Also pins the DELIBERATE stance: settles:false (a master agreement nets and
// frames; confirmations settle elsewhere, never through this chain).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { isdaAgreement } from '../../src/v2/domain/chains/isda_agreement';
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

const PARTY_A: Actor = { id: 'user-trader', kind: 'user', participant_id: 'party-a' };
const PARTY_B_ID = 'party-b';

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { isda_agreement: isdaAgreement },
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
    { txn_id: txnId, chain_key: 'isda_agreement', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'isda_agreement', edge: 'open', actor: PARTY_A, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// party_b MUST be a live party (supplied at open) so it is a valid counterparty.
const baseOpen = {
  party_a_name: 'Vantax Trading',
  counterparty_name: 'Eskom Holdings',
  party_b_party: PARTY_B_ID,
  agreement_type: '2002',
  governing_law: 'RSA law',
  base_currency: 'ZAR',
};

describe('isda_agreement — executionEvidencePresent gates execute', () => {
  it('declares settles:false (netting/framework contract, never a payment)', () => {
    expect(isdaAgreement.settles).toBe(false);
  });

  it('happy path: open → submit → execute → amend, and executed_at is stamped', async () => {
    const deps = newDeps();
    expect((await open(deps, 'txn-ok', baseOpen)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('drafted');

    expect((await act(deps, 'txn-ok', 'submit_for_negotiation', PARTY_A)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-ok'))!.txn.state).toBe('negotiating');

    const exec = await act(deps, 'txn-ok', 'execute', PARTY_A, {
      board_approval_ref: 'BOARD-2026-0042',
      legal_counterparty_ref: 'LEGAL-CP-EskomHoldings',
    });
    expect(exec.ok).toBe(true);
    const executed = (await deps.store.getTxn('txn-ok'))!.txn;
    expect(executed.state).toBe('executed');
    expect(typeof executed.fields.executed_at).toBe('string');

    // Section 1 single-agreement self-loop.
    const amended = await act(deps, 'txn-ok', 'amend', PARTY_A, { amendment_ref: 'AMD-1' }, 'schedule_update');
    expect(amended.ok).toBe(true);
    const after = (await deps.store.getTxn('txn-ok'))!.txn;
    expect(after.state).toBe('executed');
    expect(after.fields.amend_count).toBe(1);
  });

  it('executing WITHOUT board/legal evidence is refused and state stays negotiating', async () => {
    const deps = newDeps();
    await open(deps, 'txn-noevidence', baseOpen);
    await act(deps, 'txn-noevidence', 'submit_for_negotiation', PARTY_A);

    // both refs present (clears the engine's required-field check) but the legal
    // ref is too short — only executionEvidencePresent rejects it.
    const r = await act(deps, 'txn-noevidence', 'execute', PARTY_A, {
      board_approval_ref: 'BOARD-2026-0042',
      legal_counterparty_ref: 'x',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_LEGAL_COUNTERPARTY');

    // rejected transition committed as .rejected event, but state is unmoved.
    expect((await deps.store.getTxn('txn-noevidence'))!.txn.state).toBe('negotiating');
  });
});
