// Standalone pack verifier. THE P0 GATE: it re-implements canonical JSON,
// sha256, and the merkle fold from scratch and imports NOTHING from ../domain
// except erased compile-time types. If this file could reach into the engine's
// hash helpers, "an external party can verify without our code" would be a lie.
// Treat every import of a domain runtime value here as a P0 regression.

import type { Pack } from '../domain/export'; // type-only; erased at build

// ---------------------------------------------------------------------------
// re-implemented crypto (must be byte-identical to domain/, independently)

function canonicalJson(v: unknown): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'boolean':
      return v ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(v)) throw new Error('non-finite');
      return JSON.stringify(v);
    case 'string':
      return JSON.stringify(v);
    case 'object': {
      if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
      const rec = v as Record<string, unknown>;
      const keys = Object.keys(rec)
        .filter((k) => rec[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(',')}}`;
    }
    default:
      throw new Error(`cannot canonicalize ${typeof v}`);
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function merkleRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return sha256Hex('');
  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? await sha256Hex(level[i] + level[i + 1]) : level[i]);
    }
    level = next;
  }
  return level[0];
}

async function eventHash(ev: Record<string, unknown>): Promise<string> {
  const rest = { ...ev };
  delete rest.hash;
  delete rest.global_seq;
  return sha256Hex(canonicalJson(rest));
}

// ---------------------------------------------------------------------------

export interface VerifyResult {
  ok: boolean;
  checks: { name: string; ok: boolean; detail?: string }[];
}

export async function verifyPack(pack: Pack): Promise<VerifyResult> {
  const checks: VerifyResult['checks'] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // 1 — per-txn seq gapless 1..n and prev_hash linkage
  const byTxn = new Map<string, typeof pack.events>();
  for (const e of pack.events) {
    const arr = byTxn.get(e.txn_id) ?? [];
    arr.push(e);
    byTxn.set(e.txn_id, arr);
  }
  for (const [txnId, evs] of byTxn) {
    evs.sort((a, b) => a.seq - b.seq);
    let seqOk = true;
    let linkOk = true;
    for (let i = 0; i < evs.length; i++) {
      if (evs[i].seq !== i + 1) seqOk = false;
      const expectedPrev = i === 0 ? await sha256Hex(evs[i].chain_key) : evs[i - 1].hash;
      if (evs[i].prev_hash !== expectedPrev) linkOk = false;
    }
    add(`seq-gapless:${txnId}`, seqOk);
    add(`prev-hash-link:${txnId}`, linkOk);
  }

  // 2 — every event hash recomputes
  let allHashOk = true;
  for (const e of pack.events) {
    const recomputed = await eventHash(e as unknown as Record<string, unknown>);
    if (recomputed !== e.hash) {
      allHashOk = false;
      add(`event-hash:${e.txn_id}#${e.seq}`, false, `expected ${e.hash} got ${recomputed}`);
    }
  }
  if (allHashOk) add('event-hash:all', true);

  // 3 — each daily_root whose full window is present recomputes; partial windows skipped honestly
  const bySeq = new Map<number, string>();
  for (const e of pack.events) if (e.global_seq != null) bySeq.set(e.global_seq, e.hash);
  for (const r of pack.merkle.daily_roots) {
    const window: string[] = [];
    let complete = true;
    for (let g = r.from_global_seq; g <= r.to_global_seq; g++) {
      const h = bySeq.get(g);
      if (h === undefined) {
        complete = false;
        break;
      }
      window.push(h);
    }
    if (!complete) {
      add(`merkle-root:${r.from_global_seq}-${r.to_global_seq}`, true, 'skipped — partial export, window not fully present');
      continue;
    }
    const recomputed = await merkleRoot(window);
    add(`merkle-root:${r.from_global_seq}-${r.to_global_seq}`, recomputed === r.root, recomputed === r.root ? undefined : `expected ${r.root} got ${recomputed}`);
  }

  // 4 — hash_of_pack recomputes
  const quoted = pack.attestation.hash_of_pack;
  const stripped = { ...pack, attestation: { ...pack.attestation, hash_of_pack: undefined } };
  const recomputedPack = await sha256Hex(canonicalJson(stripped));
  add('hash-of-pack', quoted === recomputedPack, quoted === recomputedPack ? undefined : `expected ${quoted} got ${recomputedPack}`);

  // 5 — R-S5-3 settlement honesty: any settles=false ⇒ custody notice present with the fixed line
  const anyRecordOnly = pack.settlement_disclaimer.chains.some((c) => !c.settles);
  if (anyRecordOnly) {
    const notice = pack.custody_notice ?? '';
    add('custody-notice-present', notice.includes('NO SETTLEMENT FINALITY — RECORD ONLY'));
  } else {
    add('custody-notice-not-required', true);
  }

  return { ok: checks.every((c) => c.ok), checks };
}
