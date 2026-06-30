// ════════════════════════════════════════════════════════════════════════
// step-up gating on high-privilege admin/platform ops.
//
// Three endpoints mutate the security surface of the platform and MUST sit
// behind a fresh-MFA step-up gate:
//   PUT  /api/admin/users/:id            → admin.role_change
//   POST /api/platform/api-keys          → api_key.create
//   POST /api/platform/webhooks/subscriptions → webhook.create
//
// These op_types live in HIGH_RISK_OPS. A high-risk op must demand a RECENT
// fresh challenge — strictly tighter than the role's normal grace window —
// but it must still be SATISFIABLE (a literal 0-second window bricks the
// endpoint forever). These tests pin both halves: blocked without a fresh
// step-up session, allowed with one, and rejected once the session ages past
// the high-risk window even though it would still satisfy the normal grace.
// ════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { signToken } from '../src/middleware/auth';
import { recordStepUpAuth, HIGH_RISK_GRACE_SECONDS } from '../src/middleware/step-up';
import admin from '../src/routes/admin';
import platform from '../src/routes/platform-features';

let db: Database.Database;
let env: any;

function seedParticipant(id: string, role: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 'active', 'approved', 'default', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(id, `${id}@openenergy.co.za`, id, role);
}

async function tokenFor(id: string, role: string): Promise<string> {
  return signToken({ sub: id, role, email: `${id}@openenergy.co.za` } as any, 'test-secret');
}

// Worker runtime always supplies an ExecutionContext; Hono's `c.executionCtx`
// getter THROWS when one is absent (the optional-chain on it can't save you),
// so handlers that fire `waitUntil` 500 in the harness unless we stub it —
// mirror the production runtime, matching tests/subscription-billing-mount.
const EXEC_CTX = { waitUntil: () => {}, passThroughOnException: () => {} };

function req(
  app: { request: (path: string, init: RequestInit, env: unknown, ctx: unknown) => Promise<Response> },
  path: string,
  token: string,
  init: RequestInit = {},
) {
  return app.request(
    path,
    { ...init, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) } },
    env,
    EXEC_CTX,
  );
}

/** SQLite-flavoured 'YYYY-MM-DD HH:MM:SS' UTC stamp offset from now. */
function sqlTime(offsetSeconds: number): string {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  seedParticipant('par_admin', 'admin');
  seedParticipant('par_target', 'trader');
});
afterEach(() => { db.close(); });

describe('step-up — admin PUT /users/:id (admin.role_change)', () => {
  const body = JSON.stringify({ status: 'suspended' });

  it('blocks the mutation without a fresh step-up session', async () => {
    const res = await req(admin, '/users/par_target', await tokenFor('par_admin', 'admin'), { method: 'PUT', body });
    expect(res.status).toBe(401);
    const j = await res.json() as any;
    expect(j.error).toBe('step_up_required');
    expect(j.data.op_type).toBe('admin.role_change');
    // the participant was NOT mutated
    const row = db.prepare(`SELECT status FROM participants WHERE id='par_target'`).get() as any;
    expect(row.status).toBe('active');
  });

  it('allows the mutation with a fresh step-up session', async () => {
    await recordStepUpAuth(env, 'par_admin', 'admin.role_change', 'totp', 900);
    const res = await req(admin, '/users/par_target', await tokenFor('par_admin', 'admin'), { method: 'PUT', body });
    expect(res.status).toBe(200);
    const row = db.prepare(`SELECT status FROM participants WHERE id='par_target'`).get() as any;
    expect(row.status).toBe('suspended');
  });
});

describe('step-up — POST /api-keys (api_key.create)', () => {
  const body = JSON.stringify({ name: 'ci-key' });

  it('blocks key creation without a fresh step-up session', async () => {
    const res = await req(platform, '/api-keys', await tokenFor('par_admin', 'admin'), { method: 'POST', body });
    expect(res.status).toBe(401);
    expect((await res.json() as any).data.op_type).toBe('api_key.create');
    expect((db.prepare(`SELECT COUNT(*) n FROM oe_api_keys`).get() as any).n).toBe(0);
  });

  it('allows key creation with a fresh step-up session', async () => {
    await recordStepUpAuth(env, 'par_admin', 'api_key.create', 'totp', 900);
    const res = await req(platform, '/api-keys', await tokenFor('par_admin', 'admin'), { method: 'POST', body });
    expect(res.status).toBe(201);
    expect((await res.json() as any).success).toBe(true);
    expect((db.prepare(`SELECT COUNT(*) n FROM oe_api_keys`).get() as any).n).toBe(1);
  });
});

describe('step-up — POST /webhooks/subscriptions (webhook.create)', () => {
  const body = JSON.stringify({ target_url: 'https://example.com/hook', events: ['trade.matched'] });

  it('blocks subscription creation without a fresh step-up session', async () => {
    const res = await req(platform, '/webhooks/subscriptions', await tokenFor('par_admin', 'admin'), { method: 'POST', body });
    expect(res.status).toBe(401);
    expect((await res.json() as any).data.op_type).toBe('webhook.create');
    expect((db.prepare(`SELECT COUNT(*) n FROM oe_webhook_subscriptions`).get() as any).n).toBe(0);
  });

  it('allows subscription creation with a fresh step-up session', async () => {
    await recordStepUpAuth(env, 'par_admin', 'webhook.create', 'totp', 900);
    const res = await req(platform, '/webhooks/subscriptions', await tokenFor('par_admin', 'admin'), { method: 'POST', body });
    expect(res.status).toBe(201);
    expect((db.prepare(`SELECT COUNT(*) n FROM oe_webhook_subscriptions`).get() as any).n).toBe(1);
  });
});

describe('step-up — high-risk window is strict but satisfiable', () => {
  it('exposes a non-zero high-risk grace (a 0-second window would brick the endpoint)', () => {
    expect(HIGH_RISK_GRACE_SECONDS).toBeGreaterThan(0);
    expect(HIGH_RISK_GRACE_SECONDS).toBeLessThanOrEqual(300);
  });

  it('rejects a stale session that aged past the high-risk window even if it still satisfies the normal grace', async () => {
    // Session authenticated well beyond the high-risk window but still inside a
    // generous (900s) expiry — proves high-risk uses the tighter age ceiling,
    // not the role's normal grace.
    db.prepare(
      `INSERT INTO oe_step_up_sessions (id, participant_id, op_type, method, authenticated_at, expires_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(
      'stup_stale', 'par_admin', 'api_key.create', 'totp',
      sqlTime(-(HIGH_RISK_GRACE_SECONDS + 60)), sqlTime(600),
    );
    const res = await req(platform, '/api-keys', await tokenFor('par_admin', 'admin'), {
      method: 'POST', body: JSON.stringify({ name: 'stale-key' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json() as any).error).toBe('step_up_required');
  });
});

describe('step-up — no wildcard op_type bypass', () => {
  // The previous `op_type IN (?, '*')` clause let any caller who recorded a
  // '*' challenge satisfy EVERY gated op — a step-up bypass footgun. The gate
  // now requires an EXACT op_type match. A '*' session must NOT authorise a
  // real op, and a real-op session must NOT authorise a different real op.
  it('a "*" step-up session does NOT authorise a high-risk op (exact match required)', async () => {
    db.prepare(
      `INSERT INTO oe_step_up_sessions (id, participant_id, op_type, method, authenticated_at, expires_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(
      'stup_wild', 'par_admin', '*', 'totp',
      sqlTime(0), sqlTime(600),
    );
    const res = await req(platform, '/api-keys', await tokenFor('par_admin', 'admin'), {
      method: 'POST', body: JSON.stringify({ name: 'wild-key' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json() as any).error).toBe('step_up_required');
    expect((db.prepare(`SELECT COUNT(*) n FROM oe_api_keys`).get() as any).n).toBe(0);
  });

  it('a step-up session for one op_type does NOT authorise a different op_type', async () => {
    // A valid, fresh api_key.create session must not satisfy webhook.create.
    await recordStepUpAuth(env, 'par_admin', 'api_key.create', 'totp', 900);
    const res = await req(platform, '/webhooks/subscriptions', await tokenFor('par_admin', 'admin'), {
      method: 'POST',
      body: JSON.stringify({ target_url: 'https://example.com/hook', events: ['trade.matched'] }),
    });
    expect(res.status).toBe(401);
    expect((await res.json() as any).data.op_type).toBe('webhook.create');
    expect((db.prepare(`SELECT COUNT(*) n FROM oe_webhook_subscriptions`).get() as any).n).toBe(0);
  });
});
