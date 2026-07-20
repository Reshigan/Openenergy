// P0 GATE — happy path end to end: drive ppa_contract through the engine
// (L2 applyTransition), seal a merkle root (L5-ish nightly), export a regulator
// pack (L6), then verify that pack with the STANDALONE verifier that shares no
// runtime code with the engine. If this passes, an external party can verify the
// hash chain from an exported pack without our code — the binding P0 success gate.
//
// It also exercises the honest-log contract: a compliance-halt rejection is
// COMMITTED to the log (seq bumps) but returns {ok:false}, so the export carries
// a rejected event and the settles:false custody notice is un-suppressible.

import { describe, it, expect } from 'vitest';
import { applyTransition, type EngineDeps } from '../../src/v2/domain/engine';
import { MemoryStore } from '../../src/v2/store/memory';
import { ppaContract } from '../../src/v2/domain/chains/ppa_contract';
import { GUARDS } from '../../src/v2/domain/guards/registry';
import { sealPendingEvents } from '../../src/v2/domain/merkle-seal';
import { exportPack } from '../../src/v2/domain/export';
import { verifyPack } from '../../src/v2/verify/verifier';
import type { Clock, Command, IdSource, Instant } from '../../src/v2/domain/types';

// deterministic clock + ids so the hash chain is byte-reproducible.
function counterClock(): Clock {
  let n = 0;
  return { now: (): Instant => ({ epoch_ms: 1_700_000_000_000 + n++ * 1000, zone: 'UTC' }) };
}
function counterIds(): IdSource {
  let n = 0;
  return { uuid: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` };
}

const OFFTAKER = { id: 'user-offtaker', kind: 'user' as const, participant_id: 'party-offtaker' };
const TXN = 'txn-ppa-1';

describe('P0 gate — ppa_contract engine → export → standalone verify', () => {
  it('drives the happy path, commits a rejection, and the pack verifies', async () => {
    const store = new MemoryStore();
    const deps: EngineDeps = {
      store,
      clock: counterClock(),
      ids: counterIds(),
      chains: { ppa_contract: ppaContract },
      guards: GUARDS,
    };

    let idem = 0;
    const seqOf = async () => (await store.getTxn(TXN))!.txn.seq;
    const cmd = (over: Partial<Command>): Command => ({
      txn_id: TXN,
      chain_key: 'ppa_contract',
      edge: '',
      actor: OFFTAKER,
      input: {},
      expected_seq: {},
      idempotency_key: `k-${++idem}`,
      ...over,
    });

    // 1 — open (@new; capacity 50 MW = non-strategic, no regulator party needed)
    const opened = await applyTransition(
      cmd({
        edge: 'open',
        expected_seq: { [TXN]: -1 },
        input: {
          offtaker_name: 'Acme Offtaker',
          capacity_mw: 50,
          contract_term_years: 20,
          supplier: 'party-ipp',
        },
      }),
      deps,
    );
    expect(opened.ok).toBe(true);
    if (!opened.ok) throw new Error(opened.message);
    expect(opened.txn.state).toBe('draft');

    // 2 — compliance halt is ON: begin_negotiation is REJECTED but COMMITTED.
    store.setReference('compliance:halt', true);
    const blocked = await applyTransition(
      cmd({ edge: 'begin_negotiation', expected_seq: { [TXN]: await seqOf() } }),
      deps,
    );
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error('halt should have blocked');
    expect(blocked.code).toBe('COMPLIANCE_HALT');

    // 3 — clear halt, run the happy path to in_force. seq re-read each step
    // because the rejected event above bumped it.
    store.setReference('compliance:halt', false);

    const step = async (edge: string, input: Record<string, unknown> = {}) => {
      const r = await applyTransition(
        cmd({ edge, expected_seq: { [TXN]: await seqOf() }, input: input as Command['input'] }),
        deps,
      );
      expect(r.ok, `${edge} should succeed`).toBe(true);
      if (!r.ok) throw new Error(`${edge}: ${r.message}`);
      return r;
    };

    await step('begin_negotiation');
    await step('lock_terms');
    await step('legal_sign');
    await step('execute', {
      board_approval_ref: 'BRD-2026-0042',
      legal_counterparty_ref: 'LEG-2026-0042',
    });
    const forced = await step('commence');
    expect(forced.txn.state).toBe('in_force');
    expect(forced.txn.fields.expiry_date).toBeTruthy();

    // 4 — seal the pending window into a merkle root
    const root = await sealPendingEvents(store, deps.clock);
    expect(root).not.toBeNull();
    expect(await sealPendingEvents(store, deps.clock)).toBeNull(); // nothing left

    // 5 — L6 export (pure read over the log)
    const pack = await exportPack(
      { chain_keys: ['ppa_contract'] },
      { store, chains: deps.chains, generated_at: '2026-07-11T00:00:00.000Z', generated_by: 'test' },
    );

    // structural expectations before the standalone verify
    expect(pack.integrity).toBe('self_attested');
    expect(pack.custody_notice).toContain('NO SETTLEMENT FINALITY — RECORD ONLY');
    expect(pack.events.some((e) => e.type.endsWith('.rejected'))).toBe(true);
    expect(pack.events.filter((e) => e.txn_id === TXN).length).toBe(7); // open + rejected + 5 happy

    // 6 — THE GATE: standalone verifier, no engine code
    const result = await verifyPack(pack);
    const failed = result.checks.filter((c) => !c.ok);
    expect(failed, JSON.stringify(failed)).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
