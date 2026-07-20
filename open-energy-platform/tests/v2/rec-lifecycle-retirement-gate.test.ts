// rec_lifecycle — the anti-double-counting retirement gate, as a driven property.
//
// A REC's environmental attribute may be claimed (retired) AT MOST ONCE. This is
// enforced by the state graph, not a guard: `retire` is the only edge into
// `retired`, and `retired` is terminal with NO outbound edges. So a second
// `retire` on an already-retired certificate is an ILLEGAL_TRANSITION — the
// engine's step-4 state check refuses it before any guard runs.
//
// Failure mode this guards: someone adds an outbound edge from `retired`, or
// flips `retired.terminal` to false — a green claim could then be counted twice.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { recLifecycle } from '../../src/v2/domain/chains/rec_lifecycle';
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

const REGISTRY: Actor = { id: 'user-registry', kind: 'user', participant_id: 'party-registry' };
const HOLDER_ID = 'party-holder';
const TRANSFEREE_ID = 'party-transferee';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { rec_lifecycle: recLifecycle }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

async function act(deps: EngineDeps, txnId: string, edge: string, actor: Actor, input: Record<string, unknown> = {}, reason_code?: string) {
  const seq = (await deps.store.getTxn(txnId))!.txn.seq;
  return applyTransition(
    { txn_id: txnId, chain_key: 'rec_lifecycle', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'rec_lifecycle', edge: 'open', actor: REGISTRY, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  certificate_no: 'ZA-IREC-000123',
  production_device: 'De Aar Solar PV',
  energy_source: 'solar',
  vintage_month: '2026-05',
  mwh_volume: 1000,
  serial_start: 1,
  serial_end: 1000,
  holder_party: HOLDER_ID,
  transferee_party: TRANSFEREE_ID,
};

describe('rec_lifecycle — a certificate can be retired at most once', () => {
  it('declares settles:false (an environmental-attribute record, never a payment)', () => {
    expect(recLifecycle.settles).toBe(false);
  });

  it('drives open -> transfer -> retire to the terminal retired state, then refuses a second retire', async () => {
    const deps = newDeps();
    const store = deps.store;

    const opened = await open(deps, 'txn-r', baseOpen);
    expect(opened.ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('active');

    expect((await act(deps, 'txn-r', 'transfer', REGISTRY)).ok).toBe(true);
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('transferred');

    const retired = await act(deps, 'txn-r', 'retire', REGISTRY, { beneficiary: 'Acme (Pty) Ltd' }, 'compliance_surrender');
    expect(retired.ok).toBe(true);

    const txn = (await store.getTxn('txn-r'))!.txn;
    expect(txn.state).toBe('retired');
    expect(typeof txn.fields.registered_at).toBe('string');
    expect(typeof txn.fields.transferred_at).toBe('string');
    expect(typeof txn.fields.retired_at).toBe('string');
    expect(txn.fields.transfer_count).toBe(1);
    expect(txn.closed_at).not.toBeNull();

    // the graph forbids a second retirement — retired is terminal, no edges out.
    const again = await act(deps, 'txn-r', 'retire', REGISTRY, { beneficiary: 'Acme (Pty) Ltd' }, 'voluntary_claim');
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('ILLEGAL_TRANSITION');
    expect((await store.getTxn('txn-r'))!.txn.state).toBe('retired');
  });
});

describe('rec_lifecycle — retirement demands a structured claim reason', () => {
  it('retire without a reason_code is rejected (BAD_INPUT)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-nr', baseOpen);
    const r = await act(deps, 'txn-nr', 'retire', REGISTRY, { beneficiary: 'Acme (Pty) Ltd' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BAD_INPUT');
    expect((await deps.store.getTxn('txn-nr'))!.txn.state).toBe('active');
  });
});
