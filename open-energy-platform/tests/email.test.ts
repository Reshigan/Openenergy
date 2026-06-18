import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { sendEmail } from '../src/utils/email';
import type { HonoBindings } from '../src/utils/types';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

function outboxRow(id: string): any {
  return db.prepare(`SELECT * FROM oe_email_outbox WHERE id = ?`).get(id);
}

describe('sendEmail - dev no-op (gate closed)', () => {
  it('records a sent outbox row without sending when EMAIL_FROM is unset', async () => {
    // envFor() supplies no EMAIL_FROM and no ENVIRONMENT, so the gate is closed.
    const res = await sendEmail(env as unknown as HonoBindings, {
      to: 'a@b.co',
      template: 'verify',
      data: { token: 't-12345' },
    });
    expect(res.status).toBe('sent');
    expect(typeof res.id).toBe('string');
    expect(res.id.length).toBeGreaterThan(0);

    const row = outboxRow(res.id);
    expect(row).toBeTruthy();
    expect(row.status).toBe('sent');
    expect(row.to_addr).toBe('a@b.co');
    expect(row.template).toBe('verify');
    expect(row.error).toBeNull();
    expect(String(row.payload)).toContain('t-12345');
  });

  it('stays a no-op when ENVIRONMENT is production but EMAIL_FROM is unset', async () => {
    const e = { ...env, ENVIRONMENT: 'production' };
    const res = await sendEmail(e as unknown as HonoBindings, {
      to: 'c@d.co',
      template: 'reset',
      data: { link: 'https://x/reset?t=abc' },
    });
    expect(res.status).toBe('sent');
    expect(outboxRow(res.id).status).toBe('sent');
  });
});

describe('sendEmail - live gate open', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  function liveEnv() {
    return { ...env, ENVIRONMENT: 'production', EMAIL_FROM: 'no-reply@openenergy.co.za' };
  }

  it('records failed (with error) and does NOT throw when transport throws', async () => {
    globalThis.fetch = (async () => { throw new Error('boom-transport'); }) as typeof fetch;
    const res = await sendEmail(liveEnv() as unknown as HonoBindings, {
      to: 'e@f.co',
      template: 'invite',
      data: { org: 'Acme' },
    });
    expect(res.status).toBe('failed');
    const row = outboxRow(res.id);
    expect(row.status).toBe('failed');
    expect(row.error).toBeTruthy();
    expect(String(row.error)).toContain('boom-transport');
  });

  it('records sent when the live transport resolves ok', async () => {
    globalThis.fetch = (async () => ({ ok: true, status: 202 }) as unknown as Response) as typeof fetch;
    const res = await sendEmail(liveEnv() as unknown as HonoBindings, {
      to: 'g@h.co',
      template: 'kyc_decision',
      data: { decision: 'approved' },
    });
    expect(res.status).toBe('sent');
    const row = outboxRow(res.id);
    expect(row.status).toBe('sent');
    expect(row.error).toBeNull();
  });

  it('records failed when MailChannels returns a non-2xx response', async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 500 }) as unknown as Response) as typeof fetch;
    const res = await sendEmail(liveEnv() as unknown as HonoBindings, {
      to: 'i@j.co',
      template: 'verify',
      data: { token: 't-err' },
    });
    expect(res.status).toBe('failed');
    const row = outboxRow(res.id);
    expect(row.status).toBe('failed');
    expect(row.error).toBeTruthy();
    expect(typeof row.error).toBe('string');
    expect(String(row.error)).toContain('500');
  });
});

describe('sendEmail - unknown template', () => {
  it('records failed for an unknown template without throwing', async () => {
    // Use the gate-closed env so we prove the guard fires before the gate.
    const res = await sendEmail(env as unknown as HonoBindings, {
      to: 'x@y.co',
      template: 'bogus' as any,
      data: {},
    });
    expect(res.status).toBe('failed');
    const row = outboxRow(res.id);
    expect(row).toBeTruthy();
    expect(row.status).toBe('failed');
    expect(row.error).toBeTruthy();
    expect(String(row.error)).toContain('bogus');
  });
});
