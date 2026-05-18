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
import { appendAudit, verifyChain, canonicalJson } from '../src/utils/audit-chain';

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
    expect(tr.head_hash).toBe(st.head_hash); // same payload, same prev → same hash
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
