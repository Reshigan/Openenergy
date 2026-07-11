// Settlement-honesty gate (R-S5) — the CONDITIONAL half.
//
// tests/v2/store-d1-parity.test.ts already proves the custody notice is present
// for a settles:false chain (ppa_contract). Nothing exercises the OMIT branch,
// because ppa_contract is the only chain that exists. A regression that
// hard-codes the notice (drops the ternary) would pass every other test.
//
// This proves both branches over a synthetic settles:true chain: an all-
// settles:true export must OMIT the notice (and still self-verify), while a
// mixed query with one settles:false chain must carry it. exportPack only
// reads chain.settles, so a minimal cast stands in for a full ChainDecl.

import { describe, it, expect } from 'vitest';
import { exportPack } from '../../src/v2/domain/export';
import { verifyPack } from '../../src/v2/verify/verifier';
import { ppaContract } from '../../src/v2/domain/chains/ppa_contract';
import type { ChainDecl, Store } from '../../src/v2/domain/types';

// export touches only these three reads; empty results are a valid empty log.
const emptyStore = {
  eventsForExport: async () => [],
  partiesForTxns: async () => [],
  merkleRoots: async () => [],
} as unknown as Store;

// exportPack reads exactly chain.settles; a settled sibling chain need not be
// a real domain chain to exercise the omit branch.
const spotTrade = { key: 'spot_trade', settles: true } as unknown as ChainDecl;
const CHAINS = { ppa_contract: ppaContract, spot_trade: spotTrade };

const at = '2026-07-11T00:00:00.000Z';

describe('exportPack custody notice — the conditional (R-S5)', () => {
  it('omits the notice when every chain settles, and the pack still verifies', async () => {
    const pack = await exportPack(
      { chain_keys: ['spot_trade'] },
      { store: emptyStore, chains: CHAINS, generated_at: at, generated_by: 'test' },
    );
    expect(pack.custody_notice).toBeUndefined();

    const result = await verifyPack(pack);
    expect(result.checks.filter((c) => !c.ok), 'settled-only pack must verify').toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('stamps the notice when any chain in the query does not settle', async () => {
    const pack = await exportPack(
      { chain_keys: ['spot_trade', 'ppa_contract'] },
      { store: emptyStore, chains: CHAINS, generated_at: at, generated_by: 'test' },
    );
    expect(pack.custody_notice).toContain('NO SETTLEMENT FINALITY — RECORD ONLY');
  });
});
