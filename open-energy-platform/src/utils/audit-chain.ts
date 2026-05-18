// ════════════════════════════════════════════════════════════════════════
// audit-chain.ts — L5 tamper-evident audit primitive.
//
// Single function the route layer calls: `appendAudit(...)`. It does:
//   1. acquires the per-entity_type advisory lock (so concurrent inserts
//      can't fork the chain)
//   2. reads the current head from audit_chain_state
//   3. canonicalises the payload (sorted keys, no whitespace) so identical
//      payloads always hash identically across replays
//   4. computes content_hash = SHA256( prev_hash || canonical_json )
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
    const contentHash = await sha256Hex(`${prevHash}|${payloadJson}`);
    const id = genId('aud');
    const now = new Date().toISOString();

    // D1 batch is atomic across statements — the INSERT + UPSERT either both
    // commit or both roll back. If the lock holder dies mid-statement the
    // chain remains internally consistent.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO audit_events
           (id, entity_type, entity_id, event_type, actor_id,
            payload_json, prev_hash, content_hash, sequence_no, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, entity_type, entity_id, event_type, actor_id,
             payloadJson, prevHash, contentHash, sequenceNo, now),
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
};

/**
 * Walk the chain in sequence_no order, recomputing each content_hash and
 * comparing to the stored one. Returns the first divergence (if any) so the
 * caller can pinpoint where tampering happened. Scans in batches of 500 so
 * a 1M-event chain doesn't blow the worker subrequest CPU budget on cold
 * verify.
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
      `SELECT id, sequence_no, payload_json, prev_hash, content_hash
         FROM audit_events
        WHERE entity_type = ? AND sequence_no >= ?
        ORDER BY sequence_no
        LIMIT ?`,
    ).bind(entity_type, cursor, PAGE).all<{
      id: string; sequence_no: number; payload_json: string;
      prev_hash: string; content_hash: string;
    }>();
    if (!rows.results || rows.results.length === 0) break;
    for (const r of rows.results) {
      const recomputed = await sha256Hex(`${prevHash}|${r.payload_json}`);
      if (recomputed !== r.content_hash || r.prev_hash !== prevHash) {
        expectedAt = { seq: r.sequence_no, expected: recomputed, stored: r.content_hash };
        return {
          entity_type, scanned: scanned + 1, ok: false,
          first_divergence_seq: r.sequence_no,
          expected_hash: recomputed, stored_hash: r.content_hash,
          head_hash: lastHash, head_sequence: lastSeq,
          duration_ms: Date.now() - t0,
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
  };
}
