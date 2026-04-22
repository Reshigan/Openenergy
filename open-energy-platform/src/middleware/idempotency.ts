// ═══════════════════════════════════════════════════════════════════════════
// Idempotency middleware — replays stored response for duplicate POSTs
// ═══════════════════════════════════════════════════════════════════════════
// Spec-aligned with Stripe's Idempotency-Key semantics.
//   - Only wraps POST/PUT/PATCH/DELETE.
//   - If the `Idempotency-Key` header is absent, the middleware is a no-op.
//   - If present, we look up the key scoped by (participant_id || tenant_id
//     || 'anon') + method + path. If a record exists and the request hash
//     matches, we replay the stored response. If the request hash differs
//     we 409 — the client re-used a key with different payload.
//   - On cache miss, we let the handler run, snapshot the response, then
//     store it with a 24h TTL.
// ═══════════════════════════════════════════════════════════════════════════
import type { Context, MiddlewareHandler, Next } from 'hono';
import type { HonoEnv } from '../utils/types';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TTL_HOURS = 24;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function scopeFor(c: Context<HonoEnv>): string {
  // Auth context is populated by optionalAuth/authMiddleware under the 'auth'
  // key, not 'user'. Previously this read c.get('user') which was always
  // undefined, so every scope fell through to 'anon' and an Idempotency-Key
  // could collide across unrelated authenticated callers. index.ts now runs
  // optionalAuth globally before this middleware so JWT-bearing requests
  // resolve to p:<participant_id>; anonymous requests (e.g. /auth/login,
  // public polls) still fall through to 'anon', which is correct.
  const auth = c.get('auth') as { user?: { id?: string; tenant_id?: string } } | undefined;
  const user = auth?.user;
  if (user?.id) return `p:${user.id}`;
  if (user?.tenant_id) return `t:${user.tenant_id}`;
  return 'anon';
}

export const idempotency: MiddlewareHandler<HonoEnv> = async (c: Context<HonoEnv>, next: Next) => {
  if (!WRITE_METHODS.has(c.req.method)) {
    await next();
    return;
  }

  const key = c.req.header('Idempotency-Key') || c.req.header('idempotency-key');
  if (!key) {
    await next();
    return;
  }

  // Basic sanity check — keys should be reasonable UUID-ish strings.
  if (key.length < 8 || key.length > 200) {
    return c.json({ success: false, error: 'Invalid Idempotency-Key' }, 400);
  }

  const scope = scopeFor(c);
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;

  // Snapshot the raw body so we can both hash it and still let the handler
  // parse it via c.req.json(). c.req.raw.clone() is cheap enough for normal
  // API payload sizes.
  const body = await c.req.raw.clone().text();
  const requestHash = await sha256Hex(`${method} ${path} ${body}`);

  const db = c.env.DB;

  // Clean up expired keys opportunistically (cheap) before reading.
  try {
    await db
      .prepare(`DELETE FROM idempotency_keys WHERE expires_at < datetime('now')`)
      .run();
  } catch {
    /* ignore cleanup errors */
  }

  const existing = await db
    .prepare(
      `SELECT request_hash, response_status, response_body, scope
         FROM idempotency_keys WHERE key = ?`,
    )
    .bind(key)
    .first<{
      request_hash: string;
      response_status: number;
      response_body: string;
      scope: string;
    }>();

  if (existing) {
    if (existing.scope !== scope) {
      return c.json({ success: false, error: 'Idempotency-Key in use by a different caller' }, 409);
    }
    if (existing.request_hash !== requestHash) {
      return c.json(
        { success: false, error: 'Idempotency-Key reused with different payload' },
        409,
      );
    }
    // Replay.
    return new Response(existing.response_body, {
      status: existing.response_status,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Replayed': 'true',
      },
    });
  }

  await next();

  // Snapshot response and store. Only persist JSON-ish successful writes —
  // 5xx should not be cached (the client usually SHOULD retry these).
  const status = c.res.status;
  if (status >= 500) return;

  let responseText: string;
  try {
    const clone = c.res.clone();
    responseText = await clone.text();
  } catch {
    return;
  }

  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600 * 1000).toISOString();

  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO idempotency_keys
           (key, scope, method, path, request_hash, response_status, response_body, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(key, scope, method, path, requestHash, status, responseText, expiresAt)
      .run();
  } catch (err) {
    console.error('idempotency: failed to persist key', err);
  }
  return undefined;
};
