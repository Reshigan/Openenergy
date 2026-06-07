// Admins could SEE the cascade-DLQ backlog (monitoring.ts /cascade-dlq is a
// read-only count view the #1 admin AI card deep-links to) but had no way to
// ACT on it — the retryDlqItem/resolveDlqItem functions were wired only into
// the support routes. These cases lock in the two new admin-gated endpoints:
//   POST /api/admin/cascade-dlq/:id/retry
//   POST /api/admin/cascade-dlq/:id/resolve
// driving the real Hono admin sub-app end-to-end against an in-memory D1.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor } from './helpers/d1-sqlite';
import admin from '../src/routes/admin';

let db: Database.Database;
let env: any;

// Seed one pending DLQ row matching the real schema (migration 013). A
// 'notifications' stage replays cleanly (createNotifications tolerates a
// thin payload), so the retry endpoint can succeed end-to-end.
function seedDlqRow(id: string, stage = 'notifications') {
  db.prepare(
    `INSERT INTO cascade_dlq
       (id, event, entity_type, entity_id, actor_id, payload, stage,
        error_message, attempt_count, status)
     VALUES (?, 'contract.signed', 'contracts', 'ctr_1', 'par_admin', '{}', ?, 'boom', 3, 'pending')`,
  ).run(id, stage);
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => { db.close(); });

describe('admin cascade-DLQ — retry + resolve actionability', () => {
  it('rejects a non-admin (trader) POSTing to the resolve endpoint', async () => {
    seedDlqRow('dlq_a');
    const token = await testJwtFor(db, 'par_trader', { role: 'trader' });
    const res = await admin.request(
      '/cascade-dlq/dlq_a/resolve',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'abandoned' }),
      },
      env,
    );
    expect([401, 403]).toContain(res.status);
    // Row untouched — still pending.
    const row = db.prepare(`SELECT status FROM cascade_dlq WHERE id = 'dlq_a'`).get() as { status: string };
    expect(row.status).toBe('pending');
  });

  it('lets an admin resolve a DLQ row — marks it abandoned in the DB', async () => {
    seedDlqRow('dlq_b');
    const token = await testJwtFor(db, 'par_admin', { role: 'admin' });
    const res = await admin.request(
      '/cascade-dlq/dlq_b/resolve',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'abandoned', note: 'duplicate event' }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.status).toBe('abandoned');
    const row = db.prepare(
      `SELECT status, resolved_by, resolution_note FROM cascade_dlq WHERE id = 'dlq_b'`,
    ).get() as { status: string; resolved_by: string; resolution_note: string };
    expect(row.status).toBe('abandoned');
    expect(row.resolved_by).toBe('par_admin');
    expect(row.resolution_note).toBe('duplicate event');
  });

  it('lets an admin retry a DLQ row — endpoint reachable, returns 200 with ok', async () => {
    seedDlqRow('dlq_c');
    const token = await testJwtFor(db, 'par_admin', { role: 'admin' });
    const res = await admin.request(
      '/cascade-dlq/dlq_c/retry',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('ok');
  });
});
