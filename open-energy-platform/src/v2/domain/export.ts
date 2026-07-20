// L6 regulator export — a PURE READ over the L1 event log. exportPack computes
// no state and seals no roots; it quotes the events, the roots the nightly job
// already sealed, and enough procedure text that an external party can verify
// the hash chain WITHOUT our code. That last sentence is the P0 gate.
//
// Settlement honesty (R-S5): if ANY chain in the query has settles:false, the
// pack carries the RECORD-ONLY custody notice, un-suppressibly. It is not a
// config flag — it is stamped here from the chain decl and re-checked by the
// verifier.

import type { ChainDecl, EventRow, ExportQuery, MerkleRootRow, PartyRow, Store } from './types';
import { canonicalJson } from './canonical';
import { sha256Hex } from './hash';

/** R-S5-3 exact literal. The statute line is parametrised; everything else is
 *  fixed and MUST match the verifier's substring check. */
export function custodyNotice(statuteCitation: string): string {
  return [
    'NO SETTLEMENT FINALITY — RECORD ONLY',
    'This pack records instructions and their authorisation chain.',
    'It does not evidence the movement of funds.',
    'The operator holds no custody, operates no payment rails, and holds',
    `no licence under the ${statuteCitation}.`,
  ].join('\n');
}

const VERIFICATION_PROCEDURE = [
  'Re-implement canonical_json: object keys sorted by UTF-16 code unit, keys with',
  'undefined value omitted, no whitespace, strings/numbers per ECMA-404 JSON.stringify,',
  'non-finite numbers rejected.',
  'Per txn_id, events must have gapless seq 1..n. For seq 1, prev_hash = sha256_hex(chain_key);',
  'else prev_hash = hash of the same-txn event at seq-1.',
  'For every event, recompute hash = sha256_hex(canonical_json(event without keys "hash" and',
  '"global_seq")) and compare to the quoted hash.',
  'For each daily_root whose full [from_global_seq,to_global_seq] window is present in events,',
  'fold event hashes in global_seq order: sha256_hex(left+right) over lowercase hex, odd trailing',
  'leaf promoted unchanged, empty window = sha256_hex(""); compare to root.',
  'Recompute hash_of_pack = sha256_hex(canonical_json(pack with attestation.hash_of_pack removed)).',
  'If any chain has settles=false, custody_notice MUST be present and contain the line',
  '"NO SETTLEMENT FINALITY — RECORD ONLY".',
].join(' ');

export interface Pack {
  query: ExportQuery;
  chains: Array<{ key: string; settles: boolean }>;
  events: EventRow[];
  parties: PartyRow[];
  merkle: {
    daily_roots: MerkleRootRow[];
    anchor_urls: string[];
    verification_procedure: string;
  };
  settlement_disclaimer: {
    statute_citation: string;
    chains: Array<{ key: string; settles: boolean }>;
  };
  custody_notice?: string;
  integrity: 'self_attested';
  attestation: {
    generated_at: string;
    generated_by: string;
    hash_of_pack?: string;
  };
}

export interface ExportDeps {
  store: Store;
  chains: Record<string, ChainDecl>;
  /** RFC3339 UTC; caller stamps it — export stays pure over the clock ban. */
  generated_at: string;
  generated_by: string;
  /** default 'Financial Markets Act 19/2012' */
  statuteCitation?: string;
}

export async function exportPack(query: ExportQuery, deps: ExportDeps): Promise<Pack> {
  const statuteCitation = deps.statuteCitation ?? 'Financial Markets Act 19/2012';
  const events = await deps.store.eventsForExport(query);
  const txnIds = [...new Set(events.map((e) => e.txn_id))];
  const parties = await deps.store.partiesForTxns(txnIds);
  const roots = await deps.store.merkleRoots();

  const chains = query.chain_keys.map((key) => ({ key, settles: deps.chains[key].settles }));
  const anySettlesFalse = chains.some((c) => !c.settles);

  const pack: Pack = {
    query,
    chains,
    events,
    parties,
    merkle: {
      daily_roots: roots,
      anchor_urls: [], // ponytail: no external timestamp authority in P0 — integrity stays self_attested. Wire in P1.
      verification_procedure: VERIFICATION_PROCEDURE,
    },
    settlement_disclaimer: { statute_citation: statuteCitation, chains },
    // R-S5-3: un-suppressible, stamped from the chain decl not a config flag.
    ...(anySettlesFalse ? { custody_notice: custodyNotice(statuteCitation) } : {}),
    integrity: 'self_attested',
    attestation: { generated_at: deps.generated_at, generated_by: deps.generated_by },
  };

  // hash_of_pack over the whole pack with the field itself absent (undefined ⇒ omitted by canonicalJson).
  pack.attestation.hash_of_pack = await sha256Hex(canonicalJson(pack));
  return pack;
}
