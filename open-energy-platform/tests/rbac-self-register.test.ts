// ═══════════════════════════════════════════════════════════════════════════
// Task 2.4 - self-service org / tenant bootstrap.
//
// A primary self-registering user for a new company should bootstrap a NEW
// tenant keyed off company_name / reg_number, becoming its first member.
// A second self-register with the same reg_number joins the SAME tenant rather
// than creating a duplicate. A company-less self-register falls back to the
// 'default' tenant (preserves today's behaviour). Invitee registrations
// continue to inherit the inviter's tenant (covered elsewhere).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { signToken, authMiddleware } from '../src/middleware/auth';
import rbac from '../src/routes/rbac';

// Mount the real rbac sub-app under a parent that applies authMiddleware only
// to the nested approve path. Under this Hono version the per-module
// rbac.use('/registrations*', authMiddleware) does not match the nested
// '/registrations/:id/approve' path (same caveat documented in
// rbac-invitations.test.ts), so getCurrentUser would 401 without this gate.
// Scoping the parent gate to the approve route keeps POST /registrations
// public, exactly as production wiring does.
const app = new Hono();
app.use('/registrations/:id/approve', authMiddleware);
app.route('/', rbac);

let db: Database.Database;
let env: Record<string, unknown>;

function seedParticipant(id: string, role: string) {
  db.prepare(`INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 'active', 'approved', 'default', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`).run(id, `${id}@openenergy.co.za`, id, role);
}

async function adminToken() {
  return signToken({ sub: 'admin-1', role: 'admin', email: 'admin@openenergy.co.za' } as any, 'test-secret');
}

async function call(token: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(
    path,
    {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    },
    env,
  );
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

// POST /registrations is public (no auth). We register, then look up the
// pending row's id directly so the admin can approve it.
async function selfRegister(payload: Record<string, unknown>): Promise<string> {
  const res = await call(null, 'POST', '/registrations', payload);
  expect(res.status).toBe(200);
  const row = db
    .prepare(`SELECT id FROM rbac_registrations WHERE email = ? AND status = 'pending'`)
    .get(payload.email as string) as { id: string } | undefined;
  expect(row?.id).toBeTruthy();
  return row!.id;
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  // The auth middleware resolves tenant_id from a participant row keyed by the
  // token sub and fails closed if absent, so the admin caller must exist.
  seedParticipant('admin-1', 'admin');
});

afterEach(() => {
  db.close();
});

describe('self-service org / tenant bootstrap on self-register', () => {
  it('bootstraps a NEW tenant keyed off reg_number for a primary self-register', async () => {
    const token = await adminToken();
    const regId = await selfRegister({
      email: 'helios-primary@helios.co.za',
      password: 'Demo@2024!',
      full_name: 'Helios Primary',
      company_name: 'Helios Energy',
      reg_number: '2021/123456/07',
      requested_role: 'trader',
    });

    const approve = await call(token, 'POST', `/registrations/${regId}/approve`);
    expect(approve.status).toBe(201);

    const pid = approve.json?.data?.participant_id as string;
    expect(pid).toBeTruthy();

    const expectedTenant = 't_2021-123456-07';
    const part = db.prepare('SELECT tenant_id FROM participants WHERE id = ?').get(pid) as { tenant_id: string };
    expect(part.tenant_id).not.toBe('default');
    expect(part.tenant_id).toBe(expectedTenant);

    const tenantRow = db.prepare('SELECT id, slug FROM tenants WHERE id = ?').get(expectedTenant) as { id: string; slug: string } | undefined;
    expect(tenantRow).toBeTruthy();
    expect(tenantRow!.slug).toBe('2021-123456-07');
  });

  it('a second self-register with the SAME reg_number joins the SAME tenant (no duplicate)', async () => {
    const token = await adminToken();

    const firstRegId = await selfRegister({
      email: 'helios-first@helios.co.za',
      password: 'Demo@2024!',
      full_name: 'Helios First',
      company_name: 'Helios Energy',
      reg_number: '2021/123456/07',
      requested_role: 'trader',
    });
    const firstApprove = await call(token, 'POST', `/registrations/${firstRegId}/approve`);
    expect(firstApprove.status).toBe(201);
    const firstPid = firstApprove.json?.data?.participant_id as string;

    const secondRegId = await selfRegister({
      email: 'helios-second@helios.co.za',
      password: 'Demo@2024!',
      full_name: 'Helios Second',
      company_name: 'Helios Energy (Pty) Ltd',
      reg_number: '2021/123456/07',
      requested_role: 'trader',
    });
    const secondApprove = await call(token, 'POST', `/registrations/${secondRegId}/approve`);
    expect(secondApprove.status).toBe(201);
    const secondPid = secondApprove.json?.data?.participant_id as string;

    const firstTenant = (db.prepare('SELECT tenant_id FROM participants WHERE id = ?').get(firstPid) as { tenant_id: string }).tenant_id;
    const secondTenant = (db.prepare('SELECT tenant_id FROM participants WHERE id = ?').get(secondPid) as { tenant_id: string }).tenant_id;

    expect(firstTenant).toBe(secondTenant);
    expect(firstTenant).toBe('t_2021-123456-07');

    const count = (db.prepare('SELECT COUNT(*) AS n FROM tenants WHERE id = ?').get(firstTenant) as { n: number }).n;
    expect(count).toBe(1);
  });

  it('falls back to the default tenant when there is no company_name and no reg_number', async () => {
    const token = await adminToken();
    const regId = await selfRegister({
      email: 'solo@nobody.co.za',
      password: 'Demo@2024!',
      full_name: 'Solo Trader',
      requested_role: 'trader',
    });

    const approve = await call(token, 'POST', `/registrations/${regId}/approve`);
    expect(approve.status).toBe(201);

    const pid = approve.json?.data?.participant_id as string;
    const part = db.prepare('SELECT tenant_id FROM participants WHERE id = ?').get(pid) as { tenant_id: string };
    expect(part.tenant_id).toBe('default');
  });
});
