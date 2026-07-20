// take_or_pay — the invoice money-gate, as a driven property.
//
// A take-or-pay invoice is a money instruction: it may only be raised AFTER the
// period's offtake was measured and a shortfall was computed. That order is not
// a guard (the registry has no arithmetic-comparison guard) — it is STRUCTURAL:
// invoiced_instructed is reachable only from shortfall_computed, which is
// reachable only from volume_measured. So jumping straight from period_open to
// `invoice` is an ILLEGAL_TRANSITION — the audit chain (measure → compute →
// invoice) cannot be short-circuited.
//
// Failure mode this guards: someone re-points the `invoice` edge's `from` to
// include period_open (or volume_measured), letting a take-or-pay charge be
// instructed for a period whose shortfall was never actually computed.
//
// Also pins the DELIBERATE stance: settles:false (a reconciliation records an
// obligation, it never moves money — invoiced_instructed is an instruction).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { takeOrPay } from '../../src/v2/domain/chains/take_or_pay';
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

const SELLER: Actor = { id: 'user-seller', kind: 'user', participant_id: 'party-ipp' };
const BUYER_ID = 'party-offtaker';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { take_or_pay: takeOrPay }, guards: GUARDS };
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
    { txn_id: txnId, chain_key: 'take_or_pay', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'take_or_pay', edge: 'open', actor: SELLER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

const baseOpen = {
  period_label: '2026-Q2',
  buyer_name: 'Aurora Offtake (Pty) Ltd',
  buyer_party: BUYER_ID,
  contracted_mwh: 10_000,
  take_or_pay_rate_zar_mwh: 950,
};

describe('take_or_pay — structural invoice money-gate', () => {
  it('declares settles:false (records an obligation, never moves money)', () => {
    expect(takeOrPay.settles).toBe(false);
  });

  it('drives the happy path measure → compute → invoice and stamps invoiced_at', async () => {
    const deps = newDeps();
    const r = await open(deps, 'topy-1', baseOpen);
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('topy-1'))!.txn.state).toBe('period_open');

    // actual offtake below the contracted minimum → a shortfall period.
    expect((await act(deps, 'topy-1', 'measure_volume', SELLER, { actual_mwh: 6_500 })).ok).toBe(true);
    expect((await deps.store.getTxn('topy-1'))!.txn.state).toBe('volume_measured');

    expect((await act(deps, 'topy-1', 'compute_shortfall', SELLER)).ok).toBe(true);
    const computed = (await deps.store.getTxn('topy-1'))!.txn;
    expect(computed.state).toBe('shortfall_computed');
    expect(computed.fields.shortfall_mwh).toBe(3_500); // 10000 − 6500

    expect((await act(deps, 'topy-1', 'invoice', SELLER)).ok).toBe(true);
    const invoiced = (await deps.store.getTxn('topy-1'))!.txn;
    expect(invoiced.state).toBe('invoiced_instructed');
    expect(invoiced.fields.shortfall_charge_zar).toBe(3_500 * 950);
    expect(typeof invoiced.fields.invoiced_at).toBe('string'); // derive stamped the instant
  });

  it('invoicing straight from period_open is refused (ILLEGAL_TRANSITION), state unmoved', async () => {
    const deps = newDeps();
    await open(deps, 'topy-2', baseOpen);

    const r = await act(deps, 'topy-2', 'invoice', SELLER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');

    // the audit order was not short-circuited — the period is still open.
    expect((await deps.store.getTxn('topy-2'))!.txn.state).toBe('period_open');
  });
});
