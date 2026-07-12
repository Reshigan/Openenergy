// carbon_retirement — the unique-claim seam, as a driven property.
//
// Retiring a carbon credit permanently consumes a serial range in a registry.
// No serial may EVER be retired twice — that double-count is the failure that
// destroys a carbon market's integrity. The `retire` edge claims
// `${registry}:${serial_start}-${serial_end}`; the store inserts it under the
// v2_claims UNIQUE index, so a SECOND retirement of any identical range trips
// ConstraintViolation('unique_claim') atomically. The DB index IS the
// enforcement — not a read-then-write guard two concurrent commits could both
// pass. The engine RETHROWS unique_claim (a claimed key is permanent; retrying
// is pointless) rather than looping like it does for event_pk / txn_seq races.
//
// Failure mode this guards: someone drops `claim` from the retire edge, or the
// engine starts swallowing unique_claim into a retry loop — either way a serial
// range becomes double-retirable and the market can be inflated.
//
// Also pins serialRangeConsistent: a mis-stated quantity (the overstatement
// vector) is refused before any state change.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { carbonRetirement } from '../../src/v2/domain/chains/carbon_retirement';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import { ConstraintViolation } from '../../src/v2/domain/types';
import type { Clock, Command, IdSource, Instant } from '../../src/v2/domain/types';

function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++ * 1000, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const HOLDER = { id: 'user-holder', kind: 'user' as const, participant_id: 'party-holder' };
const REGISTRY = { id: 'user-registry', kind: 'user' as const, participant_id: 'party-registry' };

// two independent retirements of the SAME serial range in the SAME registry —
// same claim key, so the second retire must lose to the first.
const range = { registry: 'Verra', serial_start: 1000, serial_end: 1099, quantity_tco2e: 100 };
const openInput = {
  ...range,
  project_ref: 'VCS-1234',
  beneficiary: 'Karoo Solar SPV',
  registry_party: 'party-registry',
};

function newDeps(): EngineDeps {
  // ONE MemoryStore shared across both txns — the claims set (v2_claims) is
  // store-global, which is exactly what makes the second retire collide.
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { carbon_retirement: carbonRetirement }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

// drive one txn to `submitted`; overrides let a test perturb the input.
async function toSubmitted(deps: EngineDeps, txnId: string, input: Record<string, unknown> = openInput) {
  const store = deps.store;
  const open = await applyTransition(
    { txn_id: txnId, chain_key: 'carbon_retirement', edge: 'open', actor: HOLDER, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
  if (!open.ok) return open; // guard rejection surfaces here (e.g. serialRangeConsistent)
  const seq = (await store.getTxn(txnId))!.txn.seq;
  const submit = await applyTransition(
    { txn_id: txnId, chain_key: 'carbon_retirement', edge: 'submit', actor: HOLDER, input: {} as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
  return submit;
}

function retire(deps: EngineDeps, txnId: string, seq: number) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'carbon_retirement', edge: 'retire', actor: REGISTRY, input: {} as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key() },
    deps,
  );
}

describe('carbon_retirement — the unique-claim seam is real double-spend protection', () => {
  it('declares settles:false (a retirement is a registry act, not a payment)', () => {
    expect(carbonRetirement.settles).toBe(false);
  });

  it('first retire of a serial range succeeds and retires the txn', async () => {
    const deps = newDeps();
    const store = deps.store;
    const r = await toSubmitted(deps, 'txn-a');
    expect(r.ok).toBe(true);

    const seq = (await store.getTxn('txn-a'))!.txn.seq;
    const done = await retire(deps, 'txn-a', seq);
    expect(done.ok).toBe(true);

    const txn = (await store.getTxn('txn-a'))!.txn;
    expect(txn.state).toBe('retired');
    expect(txn.closed_at).not.toBeNull(); // terminal
    expect(typeof txn.fields.retired_at).toBe('string'); // derive stamped the instant
  });

  it('SECOND retire of the SAME range throws ConstraintViolation(unique_claim) — no double-count', async () => {
    const deps = newDeps();
    const store = deps.store;

    // txn A retires the range first
    await toSubmitted(deps, 'txn-a');
    const seqA = (await store.getTxn('txn-a'))!.txn.seq;
    const a = await retire(deps, 'txn-a', seqA);
    expect(a.ok).toBe(true);

    // txn B — same registry, same serials — reaches submitted fine (no claim yet)…
    await toSubmitted(deps, 'txn-b');
    const seqB = (await store.getTxn('txn-b'))!.txn.seq;

    // …but its retire trips the claim index. The engine rethrows, it does NOT
    // loop or swallow it.
    await expect(retire(deps, 'txn-b', seqB)).rejects.toBeInstanceOf(ConstraintViolation);

    // and txn B is left untouched — validate-before-mutate held.
    const txnB = (await store.getTxn('txn-b'))!.txn;
    expect(txnB.state).toBe('submitted');
    expect(txnB.closed_at).toBeNull();
  });

  it('a DIFFERENT range in the same registry retires cleanly (claim key is per-range)', async () => {
    const deps = newDeps();
    const store = deps.store;

    await toSubmitted(deps, 'txn-a');
    const seqA = (await store.getTxn('txn-a'))!.txn.seq;
    expect((await retire(deps, 'txn-a', seqA)).ok).toBe(true);

    const other = { ...openInput, serial_start: 2000, serial_end: 2049, quantity_tco2e: 50 };
    await toSubmitted(deps, 'txn-b', other);
    const seqB = (await store.getTxn('txn-b'))!.txn.seq;
    expect((await retire(deps, 'txn-b', seqB)).ok).toBe(true);
  });
});

describe('carbon_retirement — serialRangeConsistent refuses malformed ranges', () => {
  it('rejects a quantity that does not match the inclusive range size (overstatement vector)', async () => {
    const deps = newDeps();
    const bad = { ...openInput, quantity_tco2e: 101 }; // range is 100, quantity claims 101
    const r = await toSubmitted(deps, 'txn-bad', bad);
    expect(r.ok).toBe(false);
  });

  it('rejects an inverted range (serial_end < serial_start)', async () => {
    const deps = newDeps();
    const bad = { ...openInput, serial_start: 1099, serial_end: 1000 };
    const r = await toSubmitted(deps, 'txn-inv', bad);
    expect(r.ok).toBe(false);
  });
});
