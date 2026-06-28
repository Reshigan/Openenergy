// Entitlement middleware — subscription-tier gating.
//
// Asserts: starter 403s on a mutating request to a gated surface,
// enterprise 200s, GET passes open regardless of tier, admin bypasses,
// and getCallerTier resolves the seeded tier from D1.

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { requireTier, getCallerTier } from '../../src/middleware/entitlement';

// Minimal stub env: a D1 that answers the single SELECT the middleware
// emits, plus a KV that behaves like an in-memory store.
function makeEnv(tier: string | null) {
  const kv = new Map<string, string>();
  const DB = {
    prepare(sql: string) {
      return {
        bind(pid: string) {
          return {
            first: async () =>
              tier === null ? null : { subscription_tier: tier },
          };
        },
      };
    },
  };
  const KV = {
    async get(key: string) { return kv.get(key) ?? null; },
    async put(key: string, val: string) { kv.set(key, val); },
    async delete(key: string) { kv.delete(key); },
  };
  return { DB, KV };
}

function buildApp(tier: string | null, role = 'support') {
  const app = new Hono<any>();
  app.use('*', async (c, next) => {
    c.env = makeEnv(tier);
    c.set('auth', { user: { id: 'p_demo', role, tenant_id: 't_demo' } });
    await next();
  });
  app.use('*', requireTier('professional', 'enterprise'));
  app.get('/api/ml', (c) => c.json({ ok: true }, 200));
  app.post('/api/ml', (c) => c.json({ ok: true }, 200));
  return app;
}

describe('requireTier — mutating surface gating', () => {
  it('403s starter on POST to a gated surface', async () => {
    const app = buildApp('starter');
    const res = await app.fetch(new Request('http://x/api/ml', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string; your_tier: string };
    expect(body.error).toBe('Entitlement required');
    expect(body.your_tier).toBe('starter');
  });

  it('200s enterprise on POST to a gated surface', async () => {
    const app = buildApp('enterprise');
    const res = await app.fetch(new Request('http://x/api/ml', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(200);
  });

  it('200s professional on POST to a professional|enterprise surface', async () => {
    const app = buildApp('professional');
    const res = await app.fetch(new Request('http://x/api/ml', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(200);
  });

  it('lets any tier GET (read-only views stay open)', async () => {
    const app = buildApp('starter');
    const res = await app.fetch(new Request('http://x/api/ml', { method: 'GET' }));
    expect(res.status).toBe(200);
  });

  it('lets free tier GET (read-only views stay open)', async () => {
    const app = buildApp('free');
    const res = await app.fetch(new Request('http://x/api/ml', { method: 'GET' }));
    expect(res.status).toBe(200);
  });

  it('admin bypasses the tier check on POST', async () => {
    const app = buildApp('starter', 'admin');
    const res = await app.fetch(new Request('http://x/api/ml', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(200);
  });

  it('403s when tier resolves to null (unresolved participant)', async () => {
    const app = buildApp(null);
    const res = await app.fetch(new Request('http://x/api/ml', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(403);
  });
});

describe('getCallerTier', () => {
  it('resolves the seeded subscription_tier from D1', async () => {
    const app = new Hono<any>();
    let captured: string | null = '__none__';
    app.use('*', async (c, next) => {
      c.env = makeEnv('enterprise');
      c.set('auth', { user: { id: 'p_demo', role: 'support', tenant_id: 't_demo' } });
      captured = await getCallerTier(c);
      await next();
    });
    app.get('/t', (c) => c.json({ ok: true }, 200));
    await app.fetch(new Request('http://x/t', { method: 'GET' }));
    expect(captured).toBe('enterprise');
  });

  it('returns null when no auth context is set', async () => {
    const app = new Hono<any>();
    let captured: string | null = '__none__';
    app.use('*', async (c, next) => {
      c.env = makeEnv('enterprise');
      captured = await getCallerTier(c);
      await next();
    });
    app.get('/t', (c) => c.json({ ok: true }, 200));
    await app.fetch(new Request('http://x/t', { method: 'GET' }));
    expect(captured).toBe(null);
  });
});