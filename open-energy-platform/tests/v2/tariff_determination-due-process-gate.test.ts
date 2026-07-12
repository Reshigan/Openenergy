// tariff_determination — NERSA due-process gate, as a driven property.
//
// A tariff can be DETERMINED only after the full statutory path:
// filed → public_process → analysis → determined. Two invariants are pinned:
//  1. structural — `determine` is refused from `filed` (ILLEGAL_TRANSITION):
//     you cannot short-circuit public participation and analysis.
//  2. guard — `accept_for_process` is gated by completenessEvidencePresent:
//     NERSA cannot open a public process on an application it has not certified
//     complete (MISSING_COMPLETENESS_EVIDENCE), and the state stays `filed`.
//
// Also pins the DELIBERATE stance: settles:false (a determination fixes a price,
// it moves no money — no settlement finality on this chain).

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { tariffDetermination } from '../../src/v2/domain/chains/tariff_determination';
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

const APPLICANT: Actor = { id: 'user-applicant', kind: 'user', participant_id: 'party-applicant' };
const NERSA: Actor = { id: 'user-nersa', kind: 'user', participant_id: 'party-nersa' };

function newDeps(): EngineDeps {
  return {
    store: new MemoryStore(),
    clock: counterClock(),
    ids: counterIds(),
    chains: { tariff_determination: tariffDetermination },
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
    {
      txn_id: txnId,
      chain_key: 'tariff_determination',
      edge,
      actor,
      input: input as Command['input'],
      expected_seq: { [txnId]: seq },
      idempotency_key: key(),
      reason_code,
    },
    deps,
  );
}

function open(deps: EngineDeps, txnId: string, input: Record<string, unknown>) {
  return applyTransition(
    {
      txn_id: txnId,
      chain_key: 'tariff_determination',
      edge: 'open',
      actor: APPLICANT,
      input: input as Command['input'],
      expected_seq: { [txnId]: -1 },
      idempotency_key: key(),
    },
    deps,
  );
}

// NERSA is supplied as a live party at @new so it can fire the post-filing edges.
const baseOpen = {
  applicant_name: 'Karoo Solar IPP',
  tariff_category: 'generation',
  capacity_mw: 75,
  requested_tariff_zar_mwh: 850,
  regulator_party: NERSA.participant_id,
};

describe('tariff_determination — NERSA due-process gate', () => {
  it('declares settles:false (a determination fixes a price, not a payment)', () => {
    expect(tariffDetermination.settles).toBe(false);
  });

  it('drives the full statutory path to a determined tariff (stamps determined_at)', async () => {
    const deps = newDeps();
    expect((await open(deps, 'txn-full', baseOpen)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-full'))!.txn.state).toBe('filed');

    expect((await act(deps, 'txn-full', 'accept_for_process', NERSA, { completeness_ref: 'CMP-2026-001' })).ok).toBe(true);
    expect((await deps.store.getTxn('txn-full'))!.txn.state).toBe('public_process');

    expect((await act(deps, 'txn-full', 'conclude_consultation', NERSA)).ok).toBe(true);
    expect((await deps.store.getTxn('txn-full'))!.txn.state).toBe('analysis');

    const r = await act(deps, 'txn-full', 'determine', NERSA, {
      determined_tariff_zar_mwh: 820,
      determination_ref: 'NERSA-DET-2026-77',
    });
    expect(r.ok).toBe(true);

    const txn = (await deps.store.getTxn('txn-full'))!.txn;
    expect(txn.state).toBe('determined');
    expect(typeof txn.fields.determined_at).toBe('string'); // derive stamped the instant
  });

  it('structural: `determine` is refused straight from `filed` (ILLEGAL_TRANSITION)', async () => {
    const deps = newDeps();
    await open(deps, 'txn-jump', baseOpen);

    const r = await act(deps, 'txn-jump', 'determine', NERSA, {
      determined_tariff_zar_mwh: 820,
      determination_ref: 'NERSA-DET-2026-99',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ILLEGAL_TRANSITION');
    expect((await deps.store.getTxn('txn-jump'))!.txn.state).toBe('filed');
  });

  it('guard: accepting for public process WITHOUT a completeness cert is refused', async () => {
    const deps = newDeps();
    await open(deps, 'txn-gate', baseOpen);

    const r = await act(deps, 'txn-gate', 'accept_for_process', NERSA, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_COMPLETENESS_EVIDENCE');

    // rejected transition is committed as a .rejected event but state is unmoved.
    expect((await deps.store.getTxn('txn-gate'))!.txn.state).toBe('filed');
  });
});
