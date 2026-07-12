// carbon_mrv — the structural publish gate, as a driven property.
//
// An MRV report must NEVER be published without passing verification. This is
// enforced by the state graph, not a guard: publish_report leaves ONLY
// `verified`, and the ONLY path into `verified` is `verify`. So from
// `under_verification` (picked up but not yet verified) publish_report is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds under_verification (or submitted) to
// publish_report's `from`, letting an unverified report reach the registry and
// prompt issuance/retirement on reductions no independent party ever checked.
//
// Also pins counterpartyDistinct on `verify`: a developer cannot verify its own
// reductions (self-verification), and completenessEvidencePresent: the sign-off
// needs a completeness-evidence ref.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { carbonMrv } from '../../src/v2/domain/chains/carbon_mrv';
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

const DEVELOPER: Actor = { id: 'user-dev', kind: 'user', participant_id: 'party-developer' };
const VERIFIER: Actor = { id: 'user-ver', kind: 'user', participant_id: 'party-verifier' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { carbon_mrv: carbonMrv }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_mrv', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_mrv', edge: 'open', actor: DEVELOPER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_id: 'PRJ-77',
  project_name: 'Kouga wind repower',
  methodology: 'ACM0002',
  period_start: '2026-01-01',
  period_end: '2026-06-30',
  reduction_tco2e: 12000,
  verifier_party: VERIFIER.participant_id,
};

describe('carbon_mrv — a report cannot publish before it is verified', () => {
  it('declares settles:false (an assurance record, never a payment)', () => {
    expect(carbonMrv.settles).toBe(false);
  });

  it('drives open -> submit -> verify -> publish and lands published', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-m', baseOpen);
    expect((await act(deps, 'txn-m', 'submit', DEVELOPER, { reduction_tco2e: 12000 })).ok).toBe(true);
    expect((await act(deps, 'txn-m', 'begin_verification', VERIFIER, { verifier_org: 'TUV Rheinland' })).ok).toBe(true);
    expect((await store.getTxn('txn-m'))!.txn.state).toBe('under_verification');

    // publish is forbidden here — verification not yet signed off.
    const early = await act(deps, 'txn-m', 'publish_report', VERIFIER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-m'))!.txn.state).toBe('under_verification');

    // verify first, THEN publish — and it stamps verified_at / published_at.
    expect((await act(deps, 'txn-m', 'verify', VERIFIER, { completeness_ref: 'VER-2026-77', reduction_tco2e: 11800 })).ok).toBe(true);
    expect((await store.getTxn('txn-m'))!.txn.state).toBe('verified');
    expect((await act(deps, 'txn-m', 'publish_report', VERIFIER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-m'))!.txn;
    expect(txn.state).toBe('published');
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.published_at).toBe('string');
  });
});

describe('carbon_mrv — independence & evidence gate the verify edge', () => {
  it('verify with no completeness_ref is refused (MISSING_COMPLETENESS_EVIDENCE)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-e', baseOpen);
    expect((await act(deps, 'txn-e', 'submit', DEVELOPER, { reduction_tco2e: 12000 })).ok).toBe(true);
    expect((await act(deps, 'txn-e', 'begin_verification', VERIFIER, { verifier_org: 'TUV' })).ok).toBe(true);

    const r = await act(deps, 'txn-e', 'verify', VERIFIER, { reduction_tco2e: 11800 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');
    expect((await deps.store.getTxn('txn-e'))!.txn.state).toBe('under_verification');
  });

  it('reject_report without a reason_code is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-r', baseOpen);
    expect((await act(deps, 'txn-r', 'submit', DEVELOPER, { reduction_tco2e: 12000 })).ok).toBe(true);

    const noReason = await act(deps, 'txn-r', 'reject_report', VERIFIER);
    expect(noReason.ok).toBe(false);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('submitted');

    const withReason = await act(deps, 'txn-r', 'reject_report', VERIFIER, {}, 'double_counting');
    expect(withReason.ok).toBe(true);
    expect((await deps.store.getTxn('txn-r'))!.txn.state).toBe('rejected');
  });
});
