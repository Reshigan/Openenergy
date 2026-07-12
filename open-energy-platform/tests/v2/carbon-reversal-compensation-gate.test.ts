// carbon_reversal — the structural compensation gate, as a driven property.
//
// Buffer serials must NEVER be cancelled to make good a reversal before that
// reversal has been quantified and authorised. This is enforced by the state
// graph, not a guard: cancel_buffer leaves ONLY compensation_pending, and the
// ONLY path into compensation_pending is authorise_compensation from
// under_assessment. So from reported (or under_assessment) cancel_buffer is an
// ILLEGAL_TRANSITION — the engine's step-4 state check refuses it before any
// guard runs.
//
// Failure mode this guards: someone adds reported/under_assessment to
// cancel_buffer's `from`, letting an unmeasured reversal cancel arbitrary buffer
// serials — an over- or under-compensation that silently corrupts the pool.
//
// Also pins serialRangeConsistent: authorise_compensation refuses a buffer
// quantity that does not equal the inclusive serial-range size.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { carbonReversal } from '../../src/v2/domain/chains/carbon_reversal';
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

const HOLDER: Actor = { id: 'user-holder', kind: 'user', participant_id: 'party-holder' };
const REGISTRY: Actor = { id: 'user-registry', kind: 'user', participant_id: 'party-registry' };

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { carbon_reversal: carbonReversal }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_reversal', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code: reason },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_reversal', edge: 'open', actor: HOLDER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  project_ref: 'VCS-1042',
  retirement_ref: 'RET-2025-0009',
  reversal_type: 'fire',
  reversed_tco2e: 500,
  buffer_registry: 'VERRA-BUFFER',
  registry_party: REGISTRY.participant_id,
};

describe('carbon_reversal — buffer serials cannot be cancelled before compensation is authorised', () => {
  it('declares settles:false (a registry make-good, never a payment)', () => {
    expect(carbonReversal.settles).toBe(false);
  });

  it('cancel_buffer before authorisation is ILLEGAL_TRANSITION; the full path drives to compensated', async () => {
    const deps = newDeps();
    const store = deps.store;
    await open(deps, 'txn-r', baseOpen);

    // cancel_buffer straight from reported — the graph forbids it.
    const earlyReported = await act(deps, 'txn-r', 'cancel_buffer', REGISTRY, { serial_start: 1, serial_end: 500, quantity_tco2e: 500 });
    expect(earlyReported.ok).toBe(false);
    if (!earlyReported.ok) expect(earlyReported.code).toBe('ILLEGAL_TRANSITION');

    expect((await act(deps, 'txn-r', 'begin_assessment', REGISTRY)).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('under_assessment');

    // still illegal from under_assessment — not yet authorised.
    const earlyAssess = await act(deps, 'txn-r', 'cancel_buffer', REGISTRY, { serial_start: 1, serial_end: 500, quantity_tco2e: 500 });
    expect(earlyAssess.ok).toBe(false);
    if (!earlyAssess.ok) expect(earlyAssess.code).toBe('ILLEGAL_TRANSITION');

    // authorise first, THEN cancel_buffer succeeds and stamps compensated_at.
    expect((await act(deps, 'txn-r', 'authorise_compensation', REGISTRY, { serial_start: 1, serial_end: 500, quantity_tco2e: 500 })).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('compensation_pending');

    const done = await act(deps, 'txn-r', 'cancel_buffer', REGISTRY);
    expect(done.ok).toBe(true);

    const txn = (await store.getTxn('txn-r'))!.txn;
    expect(txn.state).toBe('compensated');
    expect(typeof txn.fields.compensated_at).toBe('string');
    expect(txn.fields.reversal_severity).toBe('minor');
  });
});

describe('carbon_reversal — serialRangeConsistent pins the buffer quantity', () => {
  it('authorise_compensation with a quantity that does not equal the range size is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-bad', baseOpen);
    expect((await act(deps, 'txn-bad', 'begin_assessment', REGISTRY)).ok).toBe(true);

    // range 1..500 is 500 serials, but quantity says 400 — mismatch.
    const r = await act(deps, 'txn-bad', 'authorise_compensation', REGISTRY, { serial_start: 1, serial_end: 500, quantity_tco2e: 400 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SERIAL_QUANTITY_MISMATCH');
    expect((await deps.store.getTxn('txn-bad'))!.txn.state).toBe('under_assessment');
  });
});
