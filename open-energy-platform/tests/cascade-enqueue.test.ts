import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers/d1-sqlite';
import { enqueueAction, enqueueActions, genId, daysFromNow } from '../src/cascade-rules/_enqueue';

let db: Database.Database;
beforeEach(() => { db = createTestDb({ applyMigrations: true }); });
afterEach(() => { db.close(); });

describe('_enqueue helpers', () => {
  it('genId returns the legacy id_ format', () => {
    const id = genId();
    expect(id).toMatch(/^id_[a-z0-9]+$/);
  });

  it('daysFromNow returns a YYYY-MM-DD string', () => {
    expect(daysFromNow(7)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('enqueueAction inserts one pending action_queue row', async () => {
    await enqueueAction(db as any, {
      type: 'demo', priority: 'high', actor_id: 'a1', assignee_id: 'u1',
      entity_type: 'invoices', entity_id: 'inv1', title: 'Pay', description: 'desc',
      due_date: '2026-07-01',
    });
    const row = db.prepare(`SELECT type, priority, assignee_id, status FROM action_queue WHERE entity_id = 'inv1'`).get() as any;
    expect(row).toMatchObject({ type: 'demo', priority: 'high', assignee_id: 'u1', status: 'pending' });
  });

  it('enqueueActions batch-inserts many rows', async () => {
    await enqueueActions(db as any, [
      { type: 't', priority: 'normal', assignee_id: 'u1', entity_type: 'e', entity_id: 'x1', title: 'a' },
      { type: 't', priority: 'normal', assignee_id: 'u2', entity_type: 'e', entity_id: 'x1', title: 'b' },
    ]);
    const n = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE entity_id = 'x1'`).get() as { n: number };
    expect(n.n).toBe(2);
  });

  it('enqueueActions on empty array is a no-op', async () => {
    await enqueueActions(db as any, []);
    const n = db.prepare(`SELECT COUNT(*) n FROM action_queue`).get() as { n: number };
    expect(n.n).toBe(0);
  });
});
