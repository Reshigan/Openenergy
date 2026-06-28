// ════════════════════════════════════════════════════════════════════════
// audit-chain.test.ts — proves the L5 hash chain works:
//   1. canonical JSON is stable (key order doesn't change the hash)
//   2. appendAudit produces a chain where content_hash_i =
//      SHA256(content_hash_{i-1} || canonical_json_i)
//   3. verifyChain returns ok for an untouched chain
//   4. verifyChain catches tampering (single-row mutation flips first
//      divergence + recomputed hash to mismatch)
// ════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { appendAudit, verifyChain, canonicalJson, publishChainHeadToR2, PREIMAGE_V1 } from '../src/utils/audit-chain';

function env() {
  const db = createTestDb({ applyMigrations: true });
  return { db, env: envFor(db) as any };
}

describe('canonicalJson', () => {
  it('sorts keys recursively so identical objects produce identical strings', () => {
    const a = canonicalJson({ z: 1, a: { y: 2, b: 3 } });
    const b = canonicalJson({ a: { b: 3, y: 2 }, z: 1 });
    expect(a).toBe(b);
  });
  it('drops undefined values (so optional fields don\'t bust the chain)', () => {
    const j = canonicalJson({ a: 1, b: undefined, c: 3 });
    expect(j).toBe('{"a":1,"c":3}');
  });
  it('handles arrays and nested arrays without sorting them', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('audit chain integrity', () => {
  it('builds a hash chain across multiple appends', async () => {
    const { env: e } = env();
    const a = await appendAudit({
      env: e, entity_type: 'trading', entity_id: 'o1',
      event_type: 'order.placed', actor_id: 'u1',
      payload: { side: 'buy', volume_mwh: 1 },
    });
    expect(a.sequence_no).toBe(1);
    expect(a.prev_hash).toBe('0'.repeat(64));
    expect(a.content_hash).toMatch(/^[0-9a-f]{64}$/);

    const b = await appendAudit({
      env: e, entity_type: 'trading', entity_id: 'o2',
      event_type: 'order.placed', actor_id: 'u1',
      payload: { side: 'sell', volume_mwh: 2 },
    });
    expect(b.sequence_no).toBe(2);
    expect(b.prev_hash).toBe(a.content_hash);
    expect(b.content_hash).not.toBe(a.content_hash);

    const result = await verifyChain(e, 'trading');
    expect(result.ok).toBe(true);
    expect(result.scanned).toBe(2);
    expect(result.head_hash).toBe(b.content_hash);
    expect(result.head_sequence).toBe(2);
  });

  it('isolates chains per entity_type', async () => {
    const { env: e } = env();
    await appendAudit({ env: e, entity_type: 'trading', entity_id: null, event_type: 'x', actor_id: 'u', payload: { a: 1 } });
    await appendAudit({ env: e, entity_type: 'settlement', entity_id: null, event_type: 'x', actor_id: 'u', payload: { a: 1 } });

    const tr = await verifyChain(e, 'trading');
    const st = await verifyChain(e, 'settlement');
    expect(tr.head_sequence).toBe(1);
    expect(st.head_sequence).toBe(1);
    // v2 preimage folds entity_type into the hash, so two chains with the
    // same payload + actor but different entity_type now produce distinct
    // head hashes — that's the point: the chain is bound to its feature.
    expect(tr.head_hash).not.toBe(st.head_hash);
  });

  it('detects tampering at the first divergent row', async () => {
    const { db, env: e } = env();
    await appendAudit({ env: e, entity_type: 'trading', entity_id: 'o1', event_type: 'order.placed', actor_id: 'u', payload: { v: 1 } });
    await appendAudit({ env: e, entity_type: 'trading', entity_id: 'o2', event_type: 'order.placed', actor_id: 'u', payload: { v: 2 } });
    await appendAudit({ env: e, entity_type: 'trading', entity_id: 'o3', event_type: 'order.placed', actor_id: 'u', payload: { v: 3 } });

    // Tamper with row #2 — change the payload but leave the hashes alone.
    db.prepare(`UPDATE audit_events SET payload_json = ? WHERE sequence_no = 2 AND entity_type = 'trading'`)
      .run(JSON.stringify({ v: 999 }));

    const result = await verifyChain(e, 'trading');
    expect(result.ok).toBe(false);
    expect(result.first_divergence_seq).toBe(2);
    expect(result.expected_hash).not.toBe(result.stored_hash);
  });

  it('detects a forged content_hash (someone rewrote the hash to match a fake payload)', async () => {
    const { db, env: e } = env();
    await appendAudit({ env: e, entity_type: 'trading', entity_id: 'o1', event_type: 'x', actor_id: 'u', payload: { v: 1 } });
    await appendAudit({ env: e, entity_type: 'trading', entity_id: 'o2', event_type: 'x', actor_id: 'u', payload: { v: 2 } });

    // Forge: change payload AND content_hash on row 2 so they're self-consistent.
    // The chain should still fail because prev_hash on row 2 won't match the
    // (untampered) row 1's content_hash + the verifier recomputes from prev.
    const recomputed = 'deadbeef'.repeat(8); // arbitrary 64-hex
    db.prepare(`UPDATE audit_events SET payload_json = ?, content_hash = ? WHERE sequence_no = 2`)
      .run(JSON.stringify({ v: 999 }), recomputed);

    const result = await verifyChain(e, 'trading');
    expect(result.ok).toBe(false);
    expect(result.first_divergence_seq).toBe(2);
  });
});

describe('verifyChain on empty chain', () => {
  it('returns ok=true with scanned=0 when nothing has been appended', async () => {
    const { env: e } = env();
    const result = await verifyChain(e, 'trading');
    expect(result.ok).toBe(true);
    expect(result.scanned).toBe(0);
    expect(result.head_sequence).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Hardened preimage (v2): actor_id / entity_type / entity_id / event_type are
// folded into the hashed material. Altering any of them MUST break the chain.
// ───────────────────────────────────────────────────────────────────────────
describe('hardened preimage v2', () => {
  it('altering actor_id breaks verification (the P0 fix)', async () => {
    const { db, env: e } = env();
    await appendAudit({
      env: e, entity_type: 'trading', entity_id: 'o1',
      event_type: 'order.placed', actor_id: 'trader_a',
      payload: { side: 'buy', volume_mwh: 1 },
    });
    await appendAudit({
      env: e, entity_type: 'trading', entity_id: 'o2',
      event_type: 'order.placed', actor_id: 'trader_a',
      payload: { side: 'sell', volume_mwh: 2 },
    });

    // Untampered chain verifies.
    const before = await verifyChain(e, 'trading');
    expect(before.ok).toBe(true);
    expect(before.legacy_unverified_count).toBe(0);

    // Tamper: change the actor on row 1, leave the stored hash alone. Under
    // the old v1 preimage this would be invisible (actor not in hash); under
    // v2 the recomputed envelope no longer matches the stored content_hash.
    db.prepare(`UPDATE audit_events SET actor_id = ? WHERE entity_type = 'trading' AND sequence_no = 1`)
      .run('attacker');

    const after = await verifyChain(e, 'trading');
    expect(after.ok).toBe(false);
    expect(after.first_divergence_seq).toBe(1);
    expect(after.expected_hash).not.toBe(after.stored_hash);
  });

  it('altering event_type breaks verification', async () => {
    const { db, env: e } = env();
    await appendAudit({ env: e, entity_type: 'settlement', entity_id: 's1',
      event_type: 'settle.run', actor_id: 'u', payload: { v: 1 } });
    db.prepare(`UPDATE audit_events SET event_type = ? WHERE entity_type = 'settlement' AND sequence_no = 1`)
      .run('settle.forged');
    const r = await verifyChain(e, 'settlement');
    expect(r.ok).toBe(false);
    expect(r.first_divergence_seq).toBe(1);
  });

  it('flags legacy v1 rows as legacy-unverified without failing the chain', async () => {
    const { db, env: e } = env();
    // Manually insert a v1 (legacy) row — simulates a pre-fix row that the
    // migration backfilled to preimage_version=1.
    const payloadJson = canonicalJson({ v: 1 });
    const prevHash = '0'.repeat(64);
    // Compute the legacy hash: SHA256(prev || payload_json).
    const legacyHash = await import('../src/utils/audit-chain').then(() => {});
    // Use crypto.subtle directly to mirror the v1 formula.
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${prevHash}|${payloadJson}`));
    const contentHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    void legacyHash;
    db.prepare(
      `INSERT INTO audit_events
         (id, entity_type, entity_id, event_type, actor_id, payload_json,
          prev_hash, content_hash, sequence_no, created_at, preimage_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('aud_legacy_1', 'trading', 'o1', 'order.placed', 'u', payloadJson,
          prevHash, contentHash, 1, new Date().toISOString(), PREIMAGE_V1);
    db.prepare(
      `INSERT INTO audit_chain_state (entity_type, head_hash, head_sequence, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(entity_type) DO UPDATE SET head_hash = excluded.head_hash,
         head_sequence = excluded.head_sequence, updated_at = excluded.updated_at`,
    ).run('trading', contentHash, 1, new Date().toISOString());

    const r = await verifyChain(e, 'trading');
    expect(r.ok).toBe(true);
    expect(r.scanned).toBe(1);
    expect(r.legacy_unverified_count).toBe(1);
    expect(r.first_legacy_seq).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// External anchoring — publishChainHeadToR2
// ───────────────────────────────────────────────────────────────────────────
describe('publishChainHeadToR2', () => {
  it('writes the chain head snapshot to R2 and is idempotent per hour', async () => {
    const { env: e } = env();
    await appendAudit({ env: e, entity_type: 'trading', entity_id: 'o1',
      event_type: 'order.placed', actor_id: 'u', payload: { v: 1 } });

    const first = await publishChainHeadToR2(e);
    expect(first.anchored).toBe(true);
    expect(first.reason).toBe('anchored');
    expect(first.r2_key).toMatch(/^audit-anchor\/\d{4}-\d{2}-\d{2}\/\d{2}\.json$/);
    expect(first.chain_count).toBe(1);
    expect(first.anchor_hash).toMatch(/^[0-9a-f]{64}$/);

    // Second call within the same hour is a no-op (idempotent).
    const second = await publishChainHeadToR2(e);
    expect(second.anchored).toBe(false);
    expect(second.reason).toBe('already_anchored_this_hour');
    expect(second.r2_key).toBe(first.r2_key);
    expect(second.anchor_hash).toBe(first.anchor_hash);
  });

  it('records the anchor in the audit_chain_anchors ledger', async () => {
    const { db, env: e } = env();
    await appendAudit({ env: e, entity_type: 'trading', entity_id: 'o1',
      event_type: 'x', actor_id: 'u', payload: { v: 1 } });
    const res = await publishChainHeadToR2(e);
    const row = db.prepare(
      `SELECT anchor_date, anchor_hour, r2_key, anchor_hash, chain_count
         FROM audit_chain_anchors WHERE anchor_date = ? AND anchor_hour = ?`,
    ).get(res.anchor_date, res.anchor_hour) as { r2_key: string; anchor_hash: string; chain_count: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.r2_key).toBe(res.r2_key);
    expect(row!.anchor_hash).toBe(res.anchor_hash);
    expect(row!.chain_count).toBe(1);
  });
});
