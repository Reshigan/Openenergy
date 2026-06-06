// Layer-C role-actions HTTP surface. Verifies the routes are mounted and that
// reads/writes are scoped: a caller sees role-wide + own-participant rows for
// their role only, and can only mutate rows in that scope (else 404).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Hono } from 'hono';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { signToken } from '../src/middleware/auth';
import roleActions from '../src/routes/role-actions';

let db: Database.Database;
let env: any;

type RouteEntry = { method: string; path: string };
function has(app: Hono<any>, method: string, path: string): boolean {
  const rs = (app as unknown as { routes: RouteEntry[] }).routes;
  return rs.some(r => r.method.toUpperCase() === method.toUpperCase() && r.path === path);
}

async function traderToken(): Promise<string> {
  return signToken({ sub: 'par_trader', role: 'trader', email: 't@openenergy.co.za' } as any, 'test-secret');
}

function seedParticipant(id: string, role: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 'active', 'approved', 'default', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(id, `${id}@openenergy.co.za`, id, role);
}

function seedQueueRow(id: string, targetRole: string, targetParticipant: string | null, status = 'pending') {
  db.prepare(
    `INSERT INTO oe_role_action_queue
       (id, target_role, target_participant_id, source_event, source_entity_type, source_entity_id,
        title, body_json, priority, status, created_at, updated_at)
     VALUES (?, ?, ?, 'algo_certification.suspended', 'algo_certification', 'cert_1',
             'Algo trading suspended', '{}', 'urgent', ?, '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(id, targetRole, targetParticipant, status);
}

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); seedParticipant('par_trader', 'trader'); });
afterEach(() => { db.close(); });

describe('role-actions API — mount', () => {
  it('mounts list / count / lifecycle routes', () => {
    expect(has(roleActions, 'GET', '/')).toBe(true);
    expect(has(roleActions, 'GET', '/count')).toBe(true);
    expect(has(roleActions, 'POST', '/:id/acknowledge')).toBe(true);
    expect(has(roleActions, 'POST', '/:id/action')).toBe(true);
    expect(has(roleActions, 'POST', '/:id/dismiss')).toBe(true);
  });
});

describe('role-actions API — scoped reads', () => {
  it('returns role-wide and own-participant rows, hides other-participant and other-role rows', async () => {
    seedQueueRow('raq_wide', 'trader', null);
    seedQueueRow('raq_mine', 'trader', 'par_trader');
    seedQueueRow('raq_other', 'trader', 'par_other');
    seedQueueRow('raq_role', 'regulator', null);
    const token = await traderToken();
    const res = await roleActions.request('/', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ id: string }> };
    const ids = body.items.map(i => i.id).sort();
    expect(ids).toEqual(['raq_mine', 'raq_wide']);
  });
});

describe('role-actions API — scoped writes', () => {
  it('acknowledges an in-scope row', async () => {
    seedQueueRow('raq_mine', 'trader', 'par_trader');
    const token = await traderToken();
    const res = await roleActions.request('/raq_mine/acknowledge', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const row = db.prepare(`SELECT status FROM oe_role_action_queue WHERE id = 'raq_mine'`).get() as { status: string };
    expect(row.status).toBe('acknowledged');
  });

  it('404s when mutating an out-of-scope row', async () => {
    seedQueueRow('raq_other', 'trader', 'par_other');
    const token = await traderToken();
    const res = await roleActions.request('/raq_other/dismiss', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(404);
    const row = db.prepare(`SELECT status FROM oe_role_action_queue WHERE id = 'raq_other'`).get() as { status: string };
    expect(row.status).toBe('pending');
  });
});
