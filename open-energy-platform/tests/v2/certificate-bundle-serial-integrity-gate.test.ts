// certificate_bundle — the serial-integrity gate, as a driven property.
//
// A bundle carries a registry serial range and a stated quantity. It must NEVER
// enter verification with a quantity that disagrees with the inclusive range
// size (end - start + 1) — that mismatch is a double-count vector. The
// serialRangeConsistent guard on submit_for_verification refuses it.
//
// Failure mode this guards: someone drops serialRangeConsistent from the submit
// edge, or the quantity/serial fields drift apart, and an over-stated bundle is
// verified and transferred — inflating the registry.
//
// Also pins the happy path (draft → submit → verify → offer → transfer → close)
// and settles:false (a custody record, not a payment).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { certificateBundle } from '../../src/v2/domain/chains/certificate_bundle';
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

const ISSUER: Actor = { id: 'user-issuer', kind: 'user', participant_id: 'party-issuer' };
const VERIFIER: Actor = { id: 'user-verifier', kind: 'user', participant_id: 'party-verifier' };
const BUYER_ID = 'party-buyer';

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { certificate_bundle: certificateBundle },
    guards: GUARDS,
  };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'certificate_bundle', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'certificate_bundle', edge: 'open', actor: ISSUER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// serial range 1000..1099 inclusive = 100 units; verifier + buyer named at open.
const baseOpen = {
  certificate_type: 'rec',
  registry: 'JSE-SRL',
  serial_start: 1000,
  serial_end: 1099,
  quantity_tco2e: 100,
  verifier_party: VERIFIER.participant_id,
  buyer_party: BUYER_ID,
};

describe('certificate_bundle — happy path', () => {
  it('declares settles:false (a custody record, never a payment)', () => {
    expect(certificateBundle.settles).toBe(false);
  });

  it('drafts → submits → verifies → offers → transfers → closes', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-b', baseOpen);
    expect((await store.getTxn('txn-b'))!.txn.state).toBe('drafted');

    expect((await act(deps, 'txn-b', 'submit_for_verification', ISSUER)).ok).toBe(true);
    expect((await act(deps, 'txn-b', 'verify', VERIFIER, { verification_ref: 'VER-2026-77' })).ok).toBe(true);
    expect((await act(deps, 'txn-b', 'offer', ISSUER)).ok).toBe(true);
    expect((await act(deps, 'txn-b', 'transfer', ISSUER)).ok).toBe(true);
    expect((await act(deps, 'txn-b', 'close_bundle', ISSUER)).ok).toBe(true);

    const txn = (await store.getTxn('txn-b'))!.txn;
    expect(txn.state).toBe('bundle_closed');
    expect(txn.fields.unit_count).toBe(100);
    expect(typeof txn.fields.verified_at).toBe('string');
    expect(typeof txn.fields.transferred_at).toBe('string');
    expect(typeof txn.fields.closed_at_bundle).toBe('string');
  });
});

describe('certificate_bundle — serialRangeConsistent gates verification', () => {
  it('a bundle whose quantity disagrees with its serial range is refused at submit', async () => {
    const deps = newDeps();
    // range 1000..1099 = 100 units, but quantity claims 99 — over/under-count.
    await open(deps, 'txn-bad', { ...baseOpen, quantity_tco2e: 99 });
    expect((await deps.store.getTxn('txn-bad'))!.txn.state).toBe('drafted');

    const r = await act(deps, 'txn-bad', 'submit_for_verification', ISSUER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SERIAL_QUANTITY_MISMATCH');
    // still drafted — the mismatch never reached a verifier.
    expect((await deps.store.getTxn('txn-bad'))!.txn.state).toBe('drafted');
  });

  it('transfer before verification is an ILLEGAL_TRANSITION (graph gate)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-early', baseOpen);
    expect((await act(deps, 'txn-early', 'submit_for_verification', ISSUER)).ok).toBe(true);
    // in `submitted`, transfer has no edge — the state graph refuses it.
    const early = await act(deps, 'txn-early', 'transfer', ISSUER);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe('ILLEGAL_TRANSITION');
  });
});
