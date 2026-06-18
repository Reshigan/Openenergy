// ═══════════════════════════════════════════════════════════════════════════
// Task 2.3 - password-reset email delivery via the sendEmail seam.
//
// POST /auth/forgot-password for a real account queues a 'reset' outbox row
// carrying the reset link, AND creates the password_reset_tokens row, while
// the JSON response body NEVER leaks the token (anti-takeover). A non-existent
// email mints nothing and returns the same generic message.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import auth from '../src/routes/auth';

let db: Database.Database;
let env: Record<string, unknown>;

function seedParticipant(id: string, role: string) {
  db.prepare(`INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 'active', 'approved', 'default', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`).run(id, `${id}@openenergy.co.za`, id, role);
}

async function call(method: string, path: string, body?: unknown) {
  const res = await auth.request(
    path,
    {
      method,
      headers: { 'Content-Type': 'application/json' },
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
  seedParticipant('resetuser', 'offtaker');
});

afterEach(() => {
  db.close();
});

describe('POST /auth/forgot-password email delivery', () => {
  it('queues a reset outbox row + a reset token for a real account', async () => {
    const email = 'resetuser@openenergy.co.za';
    const res = await call('POST', '/forgot-password', { email });

    expect(res.status).toBe(200);

    const rows = db.prepare('SELECT * FROM oe_email_outbox').all() as any[];
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row).toBeTruthy();
    expect(row.template).toBe('reset');
    expect(row.to_addr).toBe(email);

    const payload = JSON.parse(String(row.payload));
    expect(typeof payload.link).toBe('string');
    expect(payload.link.startsWith('/reset-password?token=')).toBe(true);

    const tokens = db.prepare('SELECT * FROM password_reset_tokens WHERE participant_id = ?').all('resetuser') as any[];
    expect(tokens.length).toBe(1);
  });

  it('never leaks the reset token in the response body', async () => {
    const email = 'resetuser@openenergy.co.za';
    const res = await call('POST', '/forgot-password', { email });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.json)).not.toContain('reset-password?token=');

    const data = res.json?.data;
    expect(data?.message).toBeTruthy();
    expect(data?.token).toBeUndefined();
    expect(data?.reset_token).toBeUndefined();
  });

  it('mints nothing for a non-existent email but returns the same generic message', async () => {
    const res = await call('POST', '/forgot-password', { email: 'nobody@openenergy.co.za' });

    expect(res.status).toBe(200);
    expect(res.json?.data?.message).toBeTruthy();

    const rows = db.prepare('SELECT * FROM oe_email_outbox').all() as any[];
    expect(rows.length).toBe(0);

    const tokens = db.prepare('SELECT * FROM password_reset_tokens').all() as any[];
    expect(tokens.length).toBe(0);
  });
});
