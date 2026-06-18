// ═══════════════════════════════════════════════════════════════════════════
// Task 2.3 - invitation email delivery via the sendEmail seam.
//
// POST /me/invitations as an ipp_developer inviting an offtaker must queue an
// 'invite' oe_email_outbox row whose payload link matches the share-token the
// response body still returns. A link-only invite (no email) queues nothing.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { signToken, authMiddleware } from '../src/middleware/auth';
import rbac from '../src/routes/rbac';

// Mount the real rbac sub-app under a parent that applies authMiddleware, the
// same shape production uses to gate /api/rbac/me*. This exercises the real
// handler with a real auth context (the per-module '/me*' use() in rbac.ts
// does not match the nested '/me/invitations' path under this Hono version, so
// the gate lives one level up in production wiring).
const app = new Hono();
app.use('*', authMiddleware);
app.route('/', rbac);

let db: Database.Database;
let env: Record<string, unknown>;

function seedParticipant(id: string, role: string) {
  db.prepare(`INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 'active', 'approved', 'default', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`).run(id, `${id}@openenergy.co.za`, id, role);
}

async function tokenFor(id: string, role: string) {
  return signToken({ sub: id, role, email: `${id}@openenergy.co.za` } as any, 'test-secret');
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await app.request(
    path,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    },
    env,
  );
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  seedParticipant('inviter1', 'ipp_developer');
});

afterEach(() => {
  db.close();
});

describe('POST /me/invitations email delivery', () => {
  it('queues exactly one invite outbox row whose link carries the response token', async () => {
    const token = await tokenFor('inviter1', 'ipp_developer');
    const res = await call(token, 'POST', '/me/invitations', { role: 'offtaker', email: 'partner@acme.co' });

    expect(res.status).toBe(201);

    const rows = db.prepare('SELECT * FROM oe_email_outbox').all() as any[];
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row).toBeTruthy();
    expect(row.template).toBe('invite');
    expect(row.to_addr).toBe('partner@acme.co');

    const responseToken = res.json?.data?.token;
    expect(responseToken).toBeTruthy();

    const payload = JSON.parse(String(row.payload));
    expect(payload.link).toBe(`/register?token=${responseToken}`);
  });

  it('writes zero outbox rows for a link-only invite (no email supplied)', async () => {
    const token = await tokenFor('inviter1', 'ipp_developer');
    const res = await call(token, 'POST', '/me/invitations', { role: 'offtaker' });

    expect(res.status).toBe(201);

    const rows = db.prepare('SELECT * FROM oe_email_outbox').all() as any[];
    expect(rows.length).toBe(0);
  });

  it('still returns the share-link contract (token + invite_url) in the body', async () => {
    const token = await tokenFor('inviter1', 'ipp_developer');
    const res = await call(token, 'POST', '/me/invitations', { role: 'offtaker', email: 'partner@acme.co' });

    expect(res.status).toBe(201);
    const data = res.json?.data;
    expect(data?.token).toBeTruthy();
    expect(data?.invite_url).toBeTruthy();
    expect(data.invite_url).toBe(`/register?token=${data.token}`);
  });
});
