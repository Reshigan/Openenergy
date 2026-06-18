import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import authRouter from '../src/routes/auth';

let db: Database.Database;
let env: any;

const EMAIL = 'newcomer@example.com';
const PASSWORD = 'Demo@2024!';
const NAME = 'New Comer';

function register(body: unknown) {
  return authRouter.request(
    '/register',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
}

function verifyEmail(token: string) {
  return authRouter.request(
    '/verify-email',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    },
    env,
  );
}

function outboxVerifyRow(): any {
  return db.prepare("SELECT * FROM oe_email_outbox WHERE template = 'verify'").get();
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
});
afterEach(() => { db.close(); });

describe('auth/register email-verification delivery', () => {
  it('register delivers a verify email carrying the token to oe_email_outbox', async () => {
    const res = await register({ email: EMAIL, password: PASSWORD, name: NAME, role: 'trader' });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);

    const row = outboxVerifyRow();
    expect(row).toBeTruthy();
    expect(row.to_addr).toBe(EMAIL);
    const token = JSON.parse(String(row.payload)).token;
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('does not return the verification token in the register response body', async () => {
    const res = await register({ email: EMAIL, password: PASSWORD, name: NAME, role: 'trader' });
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    const token = JSON.parse(String(outboxVerifyRow().payload)).token;
    expect(JSON.stringify(body)).not.toContain(token);
  });

  it('consuming the delivered token verifies the email and activates the account', async () => {
    const res = await register({ email: EMAIL, password: PASSWORD, name: NAME, role: 'trader' });
    expect(res.status).toBe(200);

    const token = JSON.parse(String(outboxVerifyRow().payload)).token;
    const verifyRes = await verifyEmail(token);
    expect(verifyRes.status).toBe(200);

    const p = db.prepare('SELECT email_verified, status FROM participants WHERE email = ?').get(EMAIL) as any;
    expect(p.email_verified).toBe(1);
    expect(p.status).toBe('active');
  });
});
