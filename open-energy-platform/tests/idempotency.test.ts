import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { idempotency } from '../src/middleware/idempotency';
import { MockD1 } from './helpers/d1-mock';

// Build a tiny Hono app mirroring the production wiring:
//   - optionalAuth-style middleware that sets c.get('auth') from a header
//   - idempotency globally after it
//   - a couple of handlers that return a timestamp so we can detect replay
function buildApp(db: MockD1) {
  const app = new Hono<any>();
  // Stub "optionalAuth" — populate auth if header present.
  app.use('*', async (c, next) => {
    c.env = { ...(c.env || {}), DB: db };
    const uid = c.req.header('x-test-user-id');
    if (uid) {
      c.set('auth', { user: { id: uid, tenant_id: 't_demo' } });
    }
    await next();
  });
  app.use('*', idempotency);

  app.post('/api/write', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json({ ok: true, received: body, t: Date.now(), r: Math.random() }, 200);
  });
  app.get('/api/read', (c) => c.json({ ok: true, method: 'GET' }, 200));

  return app;
}

describe('idempotency — no-op paths', () => {
  it('ignores GET (no Idempotency-Key check performed)', async () => {
    const db = new MockD1();
    const app = buildApp(db);
    const res = await app.fetch(new Request('http://x/api/read', {
      headers: { 'Idempotency-Key': 'abc-abc-abc-abc' },
    }));
    expect(res.status).toBe(200);
    // No key should have been persisted for a GET.
    expect(db.tables['idempotency_keys'] || []).toHaveLength(0);
  });

  it('is a no-op for POST without the header', async () => {
    const db = new MockD1();
    const app = buildApp(db);
    const res = await app.fetch(new Request('http://x/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    }));
    expect(res.status).toBe(200);
    expect(db.tables['idempotency_keys'] || []).toHaveLength(0);
  });

  it('rejects too-short keys with 400', async () => {
    const db = new MockD1();
    const app = buildApp(db);
    const res = await app.fetch(new Request('http://x/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'short' },
      body: JSON.stringify({ a: 1 }),
    }));
    expect(res.status).toBe(400);
  });
});

describe('idempotency — replay semantics', () => {
  let db: MockD1;
  beforeEach(() => { db = new MockD1(); });

  it('replays the prior response for the same key + payload', async () => {
    const app = buildApp(db);
    const key = 'idem-test-key-001-aaaa';
    const body = JSON.stringify({ a: 1 });

    const first = await app.fetch(new Request('http://x/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key, 'x-test-user-id': 'p_alice' },
      body,
    }));
    const firstJson = await first.json() as { t: number; r: number };

    const second = await app.fetch(new Request('http://x/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key, 'x-test-user-id': 'p_alice' },
      body,
    }));
    expect(second.headers.get('Idempotency-Replayed')).toBe('true');
    const secondJson = await second.json() as { t: number; r: number };
    // Exact replay — timestamps match because the handler didn't re-execute.
    expect(secondJson.t).toBe(firstJson.t);
    expect(secondJson.r).toBe(firstJson.r);
  });

  it('409s when the same key is reused with a different payload', async () => {
    const app = buildApp(db);
    const key = 'idem-test-key-002-bbbb';

    await app.fetch(new Request('http://x/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key, 'x-test-user-id': 'p_alice' },
      body: JSON.stringify({ a: 1 }),
    }));

    const second = await app.fetch(new Request('http://x/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key, 'x-test-user-id': 'p_alice' },
      body: JSON.stringify({ a: 999 }),
    }));
    expect(second.status).toBe(409);
  });
});

describe('idempotency — scope isolation (PR #51 regression)', () => {
  // Before the scopeFor fix, c.get('user') was always undefined so scope
  // was always "anon". Two different authenticated users using the same
  // Idempotency-Key would collide, with one replaying the other's response.
  it('does NOT cross-replay across different authenticated users', async () => {
    const db = new MockD1();
    const app = buildApp(db);
    const key = 'idem-test-key-003-cccc';

    const resAlice = await app.fetch(new Request('http://x/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key, 'x-test-user-id': 'p_alice' },
      body: JSON.stringify({ who: 'alice' }),
    }));
    expect(resAlice.status).toBe(200);

    // Bob hits with the same key. In the old (broken) code this would either
    // replay Alice's response or 409 "key in use by different caller" once
    // the scope-compare kicked in — but scope was never populated, so it
    // would replay. Post-fix we expect EITHER:
    //   - a fresh 200 (scope differs → different row), OR
    //   - a 409 explicitly telling Bob the key is used by a different caller.
    // The only unacceptable outcome is 200 with the Idempotency-Replayed
    // header set true (Bob received Alice's response).
    const resBob = await app.fetch(new Request('http://x/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key, 'x-test-user-id': 'p_bob' },
      body: JSON.stringify({ who: 'alice' }), // same hash so replay would look attractive
    }));
    const replayed = resBob.headers.get('Idempotency-Replayed') === 'true';
    expect(replayed).toBe(false);
  });

  it('replays within the SAME user across repeat calls', async () => {
    const db = new MockD1();
    const app = buildApp(db);
    const key = 'idem-test-key-004-dddd';
    const body = JSON.stringify({ who: 'alice' });
    const first = await app.fetch(new Request('http://x/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key, 'x-test-user-id': 'p_alice' },
      body,
    }));
    const firstText = await first.text();
    const second = await app.fetch(new Request('http://x/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key, 'x-test-user-id': 'p_alice' },
      body,
    }));
    expect(second.headers.get('Idempotency-Replayed')).toBe('true');
    const secondText = await second.text();
    expect(secondText).toBe(firstText);
  });
});
