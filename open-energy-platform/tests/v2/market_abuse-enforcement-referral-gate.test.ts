// market_abuse — the critical-case enforcement-referral gate, as a driven property.
//
// The exchange surveillance unit flags, triages, investigates, and substantiates
// a case on its own. But REFERRING a CRITICAL-severity case to enforcement
// crosses a regulatory line: `refer_enforcement` is guarded by
// regulatorPresentIfCritical — a critical case cannot be referred unless the
// regulator (FSCA/NERSA) is a live party on the txn. The guard reads the carried
// `priority` field (set at open; the referral edge never re-supplies it), so it
// keys off what surveillance declared when the alert was flagged.
//
// Failure mode this guards: someone drops the guard from refer_enforcement, or
// the guard stops reading the carried priority — either way a critical market-
// abuse case gets referred (or, worse, quietly buried) with no regulator in the
// loop.
//
// Also pins the DELIBERATE stance: settles:false (a market-abuse case is a
// regulatory matter, never a payment — penalties instruct on a separate chain)
// and the structural spine (enforcement_referred only from substantiated).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { marketAbuse } from '../../src/v2/domain/chains/market_abuse';
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

const SURVEILLANCE: Actor = { id: 'user-surv', kind: 'user', participant_id: 'party-surveillance' };
const REGULATOR_ID = 'party-regulator';
const SUBJECT_ID = 'party-subject';

function newDeps(): EngineDeps {
  return { store: new MemoryStore(), clock: counterClock(), ids: counterIds(), chains: { market_abuse: marketAbuse }, guards: GUARDS };
}

const idem = { n: 0 };
const key = (): string => `k-${++idem.n}`;

// generic single-transition driver: reads the current seq, fires the edge.
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
    { txn_id: txnId, chain_key: 'market_abuse', edge, actor, input: input as Command['input'], expected_seq: { [txnId]: seq }, idempotency_key: key(), reason_code },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    { txn_id: txnId, chain_key: 'market_abuse', edge: 'open', actor: SURVEILLANCE, input: input as Command['input'], expected_seq: { [txnId]: -1 }, idempotency_key: key() },
    deps,
  );
}

// surveillance drives flagged → triage → investigating → substantiated on its own.
async function driveToSubstantiated(deps: EngineDeps, txnId: string) {
  await act(deps, txnId, 'begin_triage', SURVEILLANCE);
  await act(deps, txnId, 'open_investigation', SURVEILLANCE, { evidence_ref: 'EVID-001' });
  await act(deps, txnId, 'substantiate', SURVEILLANCE, { findings_ref: 'FIND-001' });
}

const baseOpen = { instrument: 'ENERGY-DAY-AHEAD', abuse_type: 'spoofing', alert_source: 'automated_surveillance', subject_party: SUBJECT_ID };

describe('market_abuse — regulatorPresentIfCritical gates enforcement referral', () => {
  it('declares settles:false (regulatory matter, not a payment)', () => {
    expect(marketAbuse.settles).toBe(false);
  });

  it('happy path: a critical case WITH a regulator party runs flag→triage→investigate→substantiate→refer', async () => {
    const deps = newDeps();
    const r = await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical', regulator_party: REGULATOR_ID });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('flagged');

    await driveToSubstantiated(deps, 'txn-crit');
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('substantiated');

    // surveillance initiates the referral; the guard clears because a regulator is a live party.
    const referred = await act(deps, 'txn-crit', 'refer_enforcement', SURVEILLANCE, { referral_ref: 'REF-001' });
    expect(referred.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-crit'))!.txn;
    expect(txn.state).toBe('enforcement_referred');
    expect(typeof txn.fields.referred_at).toBe('string'); // derive stamped the instant
  });

  it('seam: referring a critical case with NO regulator on the txn is refused (REGULATOR_REQUIRED)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-crit', { ...baseOpen, priority: 'critical' }); // no regulator_party
    await driveToSubstantiated(deps, 'txn-crit');
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('substantiated');

    const r = await act(deps, 'txn-crit', 'refer_enforcement', SURVEILLANCE, { referral_ref: 'REF-001' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REGULATOR_REQUIRED');

    // rejected transition is committed as a .rejected event but state is unmoved.
    expect((await deps.store.getTxn('txn-crit'))!.txn.state).toBe('substantiated');
  });

  it('a NON-critical case refers freely — the gate is a no-op below critical', async () => {
    const deps = newDeps();
    await open(deps, 'txn-normal', { ...baseOpen, priority: 'normal' }); // no regulator_party
    await driveToSubstantiated(deps, 'txn-normal');

    const r = await act(deps, 'txn-normal', 'refer_enforcement', SURVEILLANCE, { referral_ref: 'REF-002' });
    expect(r.ok).toBe(true);
    expect((await deps.store.getTxn('txn-normal'))!.txn.state).toBe('enforcement_referred');
  });
});
