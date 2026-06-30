// ════════════════════════════════════════════════════════════════════════
// audit-chain.ts — L5 tamper-evident audit primitive.
//
// Single function the route layer calls: `appendAudit(...)`. It does:
//   1. acquires the per-entity_type advisory lock (so concurrent inserts
//      can't fork the chain)
//   2. reads the current head from audit_chain_state
//   3. canonicalises the payload (sorted keys, no whitespace) so identical
//      payloads always hash identically across replays
//   4. computes content_hash = SHA256( prev_hash || canonical_envelope ) where
//      the envelope folds actor_id / entity_type / entity_id / event_type /
//      payload into the hashed material (preimage v2). Legacy rows (pre-fix)
//      used SHA256(prev_hash || payload_json) only — see preimage_version.
//   5. inserts the audit_events row + UPDATEs audit_chain_state in one
//      D1 batch
//
// Reads:
//   - getChainHead(entity_type) → { head_hash, head_sequence, … }
//   - verifyChain(entity_type, fromSeq?) → walks the chain, recomputes each
//     hash, returns first divergence (or null)
//
// Design notes:
//   - We use the existing locks.ts withLock helper rather than a SQL
//     transaction; D1 has no multi-statement transactions and batches are
//     atomic but won't serialise concurrent appenders.
//   - The lock key is `audit:<entity_type>` so each feature's chain is
//     independent — high-throughput entity_types like 'trading' don't
//     block low-throughput ones like 'admin'.
//   - SHA-256 via the platform crypto.subtle. Workers have it natively;
//     Node test runners do too (set up in vitest config).
// ════════════════════════════════════════════════════════════════════════

import type { HonoEnv } from './types';
import { withLock } from './locks';
import { fireCascade } from './cascade';

const ZERO_HASH = '0'.repeat(64);

// Preimage versions:
//   1 — legacy: content_hash = SHA256(prev_hash || canonical_json(payload))
//        actor_id / entity_type / entity_id / event_type NOT in hashed material.
//   2 — hardened: content_hash = SHA256(prev_hash || canonical_envelope) where
//        envelope = canonicalJson({actor_id, entity_type, entity_id,
//                                  event_type, payload}).
// verifyChain reads preimage_version per row and applies the matching formula,
// flagging v1 rows as legacy-unverified (actor integrity not provable) rather
// than failing the chain.
export const PREIMAGE_V1 = 1 as const;
export const PREIMAGE_V2 = 2 as const;

export type AuditAppendInput = {
  env: HonoEnv['Bindings'];
  entity_type: string;
  entity_id: string | null;
  event_type: string;
  actor_id: string;
  payload: Record<string, unknown>;
};

export type AuditAppendResult = {
  id: string;
  sequence_no: number;
  content_hash: string;
  prev_hash: string;
};

/**
 * Sort object keys recursively + drop undefined values so that JSON.stringify
 * produces a stable, byte-equivalent canonical form. This is the only way the
 * hash chain stays verifiable across deploys; if we used object-literal key
 * order we'd get different hashes on different V8 versions.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    const v = (value as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = sortKeys(v);
  }
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hardened (v2) preimage envelope: folds the identity fields into the hashed
 * material so an attacker with DB write access can't alter who-did-what
 * without breaking the chain. `payloadJson` is already canonical; we parse it
 * back into a subtree so canonicalJson can re-emit it verbatim (a no-op that
 * keeps the contract explicit and survives a future payload-canonical change).
 */
export function preimageEnvelopeV2(fields: {
  actor_id: string;
  entity_type: string;
  entity_id: string | null;
  event_type: string;
}, payloadJson: string): string {
  return canonicalJson({
    actor_id: fields.actor_id,
    entity_type: fields.entity_type,
    entity_id: fields.entity_id,
    event_type: fields.event_type,
    payload: JSON.parse(payloadJson),
  });
}

/**
 * v1 legacy preimage — kept for verifyChain so it can walk pre-fix rows
 * without false-positives. NOT used for new appends.
 */
function preimageV1(prevHash: string, payloadJson: string): string {
  return `${prevHash}|${payloadJson}`;
}

function preimageV2(prevHash: string, envelope: string): string {
  return `${prevHash}|${envelope}`;
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Append a single event to a feature's audit chain. Idempotent only at the
 * row level (uniqueness on (entity_type, sequence_no)); callers that need
 * end-to-end idempotency should de-dup at their own boundary.
 */
export async function appendAudit(input: AuditAppendInput): Promise<AuditAppendResult> {
  const { env, entity_type, entity_id, event_type, actor_id, payload } = input;
  const payloadJson = canonicalJson(payload);

  return await withLock(env, `audit:${entity_type}`, actor_id, async () => {
    const head = await env.DB.prepare(
      `SELECT head_hash, head_sequence FROM audit_chain_state WHERE entity_type = ?`,
    ).bind(entity_type).first<{ head_hash: string; head_sequence: number }>();

    const prevHash = head?.head_hash ?? ZERO_HASH;
    const sequenceNo = (head?.head_sequence ?? 0) + 1;
    const envelope = preimageEnvelopeV2({ actor_id, entity_type, entity_id, event_type }, payloadJson);
    const contentHash = await sha256Hex(preimageV2(prevHash, envelope));
    const id = genId('aud');
    const now = new Date().toISOString();

    // D1 batch is atomic across statements — the INSERT + UPSERT either both
    // commit or both roll back. If the lock holder dies mid-statement the
    // chain remains internally consistent.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO audit_events
           (id, entity_type, entity_id, event_type, actor_id,
            payload_json, prev_hash, content_hash, sequence_no, created_at,
            preimage_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, entity_type, entity_id, event_type, actor_id,
             payloadJson, prevHash, contentHash, sequenceNo, now,
             PREIMAGE_V2),
      env.DB.prepare(
        `INSERT INTO audit_chain_state
           (entity_type, head_hash, head_sequence, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(entity_type) DO UPDATE SET
           head_hash = excluded.head_hash,
           head_sequence = excluded.head_sequence,
           updated_at = excluded.updated_at`,
      ).bind(entity_type, contentHash, sequenceNo, now),
    ]);

    // Cascade fires AFTER the append so subscribers see a committed event.
    // Best-effort — a cascade failure must not invalidate the audit row.
    // Uses the typed 'audit.event_appended' event; the specific entity_type
    // and event_type live in `data` so subscribers can filter.
    try {
      await fireCascade({
        event: 'audit.event_appended',
        actor_id, entity_type, entity_id: entity_id || id,
        data: { event_type, sequence_no: sequenceNo, content_hash: contentHash },
        env,
      });
    } catch (e) {
      console.warn('audit_cascade_failed', (e as Error).message);
    }

    return { id, sequence_no: sequenceNo, content_hash: contentHash, prev_hash: prevHash };
  }, { ttlSeconds: 5 });
}

export type ChainHead = {
  entity_type: string;
  head_hash: string;
  head_sequence: number;
  updated_at: string;
  last_verified_at: string | null;
  last_verified_seq: number | null;
};

export async function getChainHead(
  env: HonoEnv['Bindings'], entity_type: string,
): Promise<ChainHead | null> {
  return await env.DB.prepare(
    `SELECT entity_type, head_hash, head_sequence, updated_at,
            last_verified_at, last_verified_seq
       FROM audit_chain_state WHERE entity_type = ?`,
  ).bind(entity_type).first<ChainHead>();
}

export type VerifyResult = {
  entity_type: string;
  scanned: number;
  ok: boolean;
  first_divergence_seq: number | null;
  expected_hash: string | null;
  stored_hash: string | null;
  head_hash: string | null;
  head_sequence: number;
  duration_ms: number;
  // Hardened-preimage accounting: v1 rows are legacy-unverified (actor /
  // entity fields not bound into the hash). ok=true with legacy_unverified
  // > 0 means the chain links are intact but the identity fields of those
  // rows cannot be cryptographically attested — a regulator export must
  // surface that caveat.
  legacy_unverified_count: number;
  first_legacy_seq: number | null;
};

/**
 * Walk the chain in sequence_no order, recomputing each content_hash and
 * comparing to the stored one. Returns the first divergence (if any) so the
 * caller can pinpoint where tampering happened. Scans in batches of 500 so
 * a 1M-event chain doesn't blow the worker subrequest CPU budget on cold
 * verify.
 *
 * Backward-compat: rows written before the preimage-v2 fix carry
 * preimage_version=1 and use the legacy formula SHA256(prev||payload). Such
 * rows are flagged as legacy-unverified (their actor/entity fields are not
 * provable) but do NOT fail the chain — the links still hold. A row only
 * fails verification if its stored hash matches neither v1 nor v2 recomputation.
 */
export async function verifyChain(
  env: HonoEnv['Bindings'], entity_type: string, fromSeq = 1,
): Promise<VerifyResult> {
  const t0 = Date.now();
  let scanned = 0;
  let prevHash = ZERO_HASH;
  let expectedAt: { seq: number; expected: string; stored: string } | null = null;
  let lastSeq = 0;
  let lastHash = ZERO_HASH;
  let legacyCount = 0;
  let firstLegacySeq: number | null = null;

  if (fromSeq > 1) {
    const seed = await env.DB.prepare(
      `SELECT content_hash FROM audit_events
        WHERE entity_type = ? AND sequence_no = ?`,
    ).bind(entity_type, fromSeq - 1).first<{ content_hash: string }>();
    if (seed) prevHash = seed.content_hash;
  }

  const PAGE = 500;
  let cursor = fromSeq;
  // Bound scan at 50k events per verify call so a malicious export can't
  // wedge the worker; the caller paginates if needed.
  const MAX = 50_000;
  while (scanned < MAX) {
    const rows = await env.DB.prepare(
      `SELECT id, sequence_no, entity_type, entity_id, event_type, actor_id,
              payload_json, prev_hash, content_hash, preimage_version
         FROM audit_events
        WHERE entity_type = ? AND sequence_no >= ?
        ORDER BY sequence_no
        LIMIT ?`,
    ).bind(entity_type, cursor, PAGE).all<{
      id: string; sequence_no: number; entity_type: string;
      entity_id: string | null; event_type: string; actor_id: string;
      payload_json: string; prev_hash: string; content_hash: string;
      preimage_version: number;
    }>();
    if (!rows.results || rows.results.length === 0) break;
    for (const r of rows.results) {
      // Link break: prev_hash must reference the previous row's content_hash.
      if (r.prev_hash !== prevHash) {
        expectedAt = { seq: r.sequence_no, expected: prevHash, stored: r.prev_hash };
        return {
          entity_type, scanned: scanned + 1, ok: false,
          first_divergence_seq: r.sequence_no,
          expected_hash: prevHash, stored_hash: r.prev_hash,
          head_hash: lastHash, head_sequence: lastSeq,
          duration_ms: Date.now() - t0,
          legacy_unverified_count: legacyCount, first_legacy_seq: firstLegacySeq,
        };
      }

      let recomputed: string;
      if (r.preimage_version === PREIMAGE_V2) {
        const envelope = preimageEnvelopeV2(
          { actor_id: r.actor_id, entity_type: r.entity_type,
            entity_id: r.entity_id, event_type: r.event_type },
          r.payload_json,
        );
        recomputed = await sha256Hex(preimageV2(prevHash, envelope));
      } else {
        // Legacy v1 row: actor/entity not in preimage. Flag, don't fail.
        recomputed = await sha256Hex(preimageV1(prevHash, r.payload_json));
        if (recomputed === r.content_hash) {
          legacyCount++;
          if (firstLegacySeq === null) firstLegacySeq = r.sequence_no;
        }
      }

      if (recomputed !== r.content_hash) {
        expectedAt = { seq: r.sequence_no, expected: recomputed, stored: r.content_hash };
        return {
          entity_type, scanned: scanned + 1, ok: false,
          first_divergence_seq: r.sequence_no,
          expected_hash: recomputed, stored_hash: r.content_hash,
          head_hash: lastHash, head_sequence: lastSeq,
          duration_ms: Date.now() - t0,
          legacy_unverified_count: legacyCount, first_legacy_seq: firstLegacySeq,
        };
      }
      prevHash = r.content_hash;
      lastSeq = r.sequence_no;
      lastHash = r.content_hash;
      scanned++;
    }
    cursor = rows.results[rows.results.length - 1].sequence_no + 1;
    if (rows.results.length < PAGE) break;
  }

  // Persist the latest clean verification timestamp so the dashboard can
  // show "audit chain verified <X> seconds ago, length <N>".
  if (scanned > 0) {
    await env.DB.prepare(
      `UPDATE audit_chain_state
          SET last_verified_at = datetime('now'),
              last_verified_seq = ?
        WHERE entity_type = ?`,
    ).bind(lastSeq, entity_type).run();
  }

  return {
    entity_type, scanned, ok: expectedAt === null,
    first_divergence_seq: null, expected_hash: null, stored_hash: null,
    head_hash: lastHash, head_sequence: lastSeq,
    duration_ms: Date.now() - t0,
    legacy_unverified_count: legacyCount, first_legacy_seq: firstLegacySeq,
  };
}

// ════════════════════════════════════════════════════════════════════════
// External anchoring — publish the current chain heads to an R2 object-lock
// bucket so a DB-only attacker can't rewrite history without also breaking
// the externally-published anchor. Idempotent per (anchor_date, anchor_hour):
// the audit_chain_anchors ledger records what was published; a re-run within
// the same hour with the same head snapshot is a no-op.
//
// The cron dispatcher calls this hourly. The R2 binding is env.AUDIT_ANCHOR
// if provisioned (object-lock bucket dedicated to anchors), otherwise it
// falls back to env.VAULT, otherwise the default env.R2 binding.
// ════════════════════════════════════════════════════════════════════════

export type AnchorResult = {
  anchored: boolean;
  reason: string;
  anchor_date: string;
  anchor_hour: string;
  r2_key: string | null;
  chain_count: number;
  anchor_hash: string | null;
};

type R2Like = {
  put: (key: string, value: string | ArrayBuffer | ArrayBufferView) => Promise<unknown>;
};

function resolveAnchorBucket(env: HonoEnv['Bindings']): R2Like | null {
  const e = env as unknown as Record<string, unknown>;
  const bucket = (e.AUDIT_ANCHOR as R2Like | undefined) ?? (e.VAULT as R2Like | undefined) ?? (e.R2 as R2Like | undefined);
  return bucket ?? null;
}

/**
 * Snapshot every chain head and write the snapshot to the R2 anchor bucket.
 * Idempotent per (anchor_date, anchor_hour): if a row already exists in
 * audit_chain_anchors for this hour, the function returns {anchored:false}
 * without re-writing R2. This makes safe-hour re-runs (cron jitter, manual
 * re-invocation) a no-op.
 *
 * Cron wiring: call `publishChainHeadToR2(env)` from the hourly cron slot.
 */
export async function publishChainHeadToR2(env: HonoEnv['Bindings']): Promise<AnchorResult> {
  const now = new Date();
  const anchorDate = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const anchorHour = now.toISOString().slice(11, 13); // HH (UTC)

  // Idempotency: if we already anchored this hour, skip. The ledger row's
  // anchor_hash captures the snapshot — if it matches the current heads the
  // caller can treat the hour as covered even across a re-invocation.
  const prior = await env.DB.prepare(
    `SELECT r2_key, anchor_hash FROM audit_chain_anchors
       WHERE anchor_date = ? AND anchor_hour = ?`,
  ).bind(anchorDate, anchorHour).first<{ r2_key: string; anchor_hash: string }>();
  if (prior) {
    return {
      anchored: false, reason: 'already_anchored_this_hour',
      anchor_date: anchorDate, anchor_hour: anchorHour,
      r2_key: prior.r2_key, chain_count: 0, anchor_hash: prior.anchor_hash,
    };
  }

  const bucket = resolveAnchorBucket(env);
  if (!bucket) {
    return {
      anchored: false, reason: 'no_r2_bucket_bound',
      anchor_date: anchorDate, anchor_hour: anchorHour,
      r2_key: null, chain_count: 0, anchor_hash: null,
    };
  }

  const heads = await env.DB.prepare(
    `SELECT entity_type, head_hash, head_sequence, updated_at
       FROM audit_chain_state
      ORDER BY entity_type`,
  ).all<{ entity_type: string; head_hash: string; head_sequence: number; updated_at: string }>();

  const chains = heads.results ?? [];
  // head_count = sum of head_sequence across chains = total rows snapshotted.
  const headCount = chains.reduce((n, c) => n + (c.head_sequence || 0), 0);

  const snapshot = {
    anchor_date: anchorDate,
    anchor_hour: anchorHour,
    published_at: now.toISOString(),
    chain_count: chains.length,
    head_count: headCount,
    chains: chains.map((c) => ({
      entity_type: c.entity_type,
      head_hash: c.head_hash,
      head_sequence: c.head_sequence,
      updated_at: c.updated_at,
    })),
  };
  const snapshotJson = canonicalJson(snapshot);
  const anchorHash = await sha256Hex(snapshotJson);
  const r2Key = `audit-anchor/${anchorDate}/${anchorHour}.json`;

  await bucket.put(r2Key, snapshotJson);

  // Record the anchor so a re-run this hour is idempotent. INSERT-or-fail on
  // the composite PK — a concurrent cron race lands one row, the other throws
  // and we treat the winner as the anchor of record.
  try {
    await env.DB.prepare(
      `INSERT INTO audit_chain_anchors
         (anchor_date, anchor_hour, r2_key, chain_count, head_count, anchor_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(anchorDate, anchorHour, r2Key, chains.length, headCount, anchorHash).run();
  } catch (e) {
    // Race: another worker anchored this hour first. The R2 object we just
    // wrote is identical (deterministic content), so this is safe.
    const msg = (e as Error).message || '';
    if (!/UNIQUE/i.test(msg)) throw e;
    return {
      anchored: false, reason: 'race_lost_anchor_this_hour',
      anchor_date: anchorDate, anchor_hour: anchorHour,
      r2_key: r2Key, chain_count: chains.length, anchor_hash: anchorHash,
    };
  }

  return {
    anchored: true, reason: 'anchored',
    anchor_date: anchorDate, anchor_hour: anchorHour,
    r2_key: r2Key, chain_count: chains.length, anchor_hash: anchorHash,
  };
}
