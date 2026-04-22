import { describe, it, expect } from 'vitest';
import { retryDlqItem, resolveDlqItem } from '../src/utils/cascade';
import { MockD1 } from './helpers/d1-mock';

// Seed a DLQ row directly (bypasses the regex-matched INSERT paths so we
// don't need to reproduce the runStage flow — these tests are about the
// retry/resolve surface the /support console calls).
function seedDlq(db: MockD1, overrides: Partial<Record<string, any>> = {}) {
  const base = {
    id: 'dlq_1',
    event: 'contract.signed',
    entity_type: 'contract',
    entity_id: 'ct_1',
    actor_id: null,
    payload: JSON.stringify({ foo: 'bar' }),
    stage: 'audit',
    error_message: 'simulated failure',
    error_stack: null,
    attempt_count: 3,
    status: 'pending',
    resolved_at: null,
    resolved_by: null,
    resolution_note: null,
    last_attempt_at: null,
    ...overrides,
  };
  db.tables['cascade_dlq'] = [...(db.tables['cascade_dlq'] || []), base];
  return base;
}

describe('retryDlqItem', () => {
  it('returns error when the row does not exist', async () => {
    const db = new MockD1();
    const res = await retryDlqItem({ DB: db } as any, 'dlq_missing', 'op_alice');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });

  it('refuses to retry a row that is already resolved', async () => {
    const db = new MockD1();
    seedDlq(db, { status: 'resolved' });
    const res = await retryDlqItem({ DB: db } as any, 'dlq_1', 'op_alice');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/resolved/);
  });

  it('replays the audit stage and marks the row resolved on success', async () => {
    const db = new MockD1();
    seedDlq(db, { stage: 'audit' });
    const res = await retryDlqItem({ DB: db } as any, 'dlq_1', 'op_alice');
    expect(res.ok).toBe(true);
    // New audit_logs row should have been written by createAuditLog.
    expect(db.tables['audit_logs']).toHaveLength(1);
    // DLQ row flipped to resolved + operator recorded.
    expect(db.tables['cascade_dlq'][0].status).toBe('resolved');
    expect(db.tables['cascade_dlq'][0].resolved_by).toBe('op_alice');
    // attempt_count bumped.
    expect(Number(db.tables['cascade_dlq'][0].attempt_count)).toBe(4);
  });

  it('parses malformed payload as empty object and still retries', async () => {
    const db = new MockD1();
    seedDlq(db, { stage: 'audit', payload: '{not-valid-json' });
    const res = await retryDlqItem({ DB: db } as any, 'dlq_1', 'op_alice');
    expect(res.ok).toBe(true);
    // The audit row's `changes` should serialise the empty-object fallback.
    expect(JSON.parse(String(db.tables['audit_logs'][0].changes))).toEqual({});
  });
});

describe('resolveDlqItem', () => {
  it('marks a pending row as resolved', async () => {
    const db = new MockD1();
    seedDlq(db);
    await resolveDlqItem({ DB: db } as any, 'dlq_1', 'op_alice', 'resolved', 'handled manually');
    const row = db.tables['cascade_dlq'][0];
    expect(row.status).toBe('resolved');
    expect(row.resolved_by).toBe('op_alice');
    expect(row.resolution_note).toBe('handled manually');
  });

  it('marks a pending row as abandoned', async () => {
    const db = new MockD1();
    seedDlq(db);
    await resolveDlqItem({ DB: db } as any, 'dlq_1', 'op_alice', 'abandoned');
    expect(db.tables['cascade_dlq'][0].status).toBe('abandoned');
  });

  it('is a no-op on a row that is not pending (no state machine rewind)', async () => {
    const db = new MockD1();
    seedDlq(db, { status: 'resolved', resolved_by: 'op_bob' });
    await resolveDlqItem({ DB: db } as any, 'dlq_1', 'op_alice', 'abandoned');
    // Still resolved/bob — alice's attempt was ignored by the WHERE status='pending' guard.
    expect(db.tables['cascade_dlq'][0].status).toBe('resolved');
    expect(db.tables['cascade_dlq'][0].resolved_by).toBe('op_bob');
  });
});
