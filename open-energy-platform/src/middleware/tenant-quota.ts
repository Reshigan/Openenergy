// ═══════════════════════════════════════════════════════════════════════════
// Tenant-scoped quota middleware — per-tenant token buckets stored in KV.
//
// Attach as:  app.use('/api/*', tenantQuotaMiddleware);
//
// Falls open when no rule is configured for the caller's tenant or route
// prefix. The tenant_rate_limits rows are cached in KV for 120 s so the
// D1 round-trip happens at most once per TTL window per tenant instead
// of on every single request.
// ═══════════════════════════════════════════════════════════════════════════

import { Context, Next } from 'hono';
import { HonoEnv } from '../utils/types';
import { tokenBucketCheck } from '../utils/data-tier';

interface RateLimitRule {
  route_prefix: string;
  window_seconds: number;
  max_requests: number;
  burst_capacity: number;
}

const RULES_CACHE_TTL_SECONDS = 120;
const RULES_CACHE_PREFIX = 'tenant_quota:rules:';
const NO_RULES = '__none__';

export async function tenantQuotaMiddleware(c: Context<HonoEnv>, next: Next): Promise<Response | void> {
  const auth = c.get('auth') as { user?: { tenant_id?: string } } | undefined;
  const tenantId = auth?.user?.tenant_id || 'anonymous';
  const path = c.req.path;

  const rules = await loadRules(c.env, tenantId);
  if (!rules || rules.length === 0) {
    await next();
    return;
  }

  // Find most specific matching rule. `*` is the wildcard; otherwise
  // longest prefix wins.
  const match = rules
    .filter((r) => r.route_prefix === '*' || path.startsWith(r.route_prefix))
    .sort((a, b) => (b.route_prefix === '*' ? 0 : b.route_prefix.length) - (a.route_prefix === '*' ? 0 : a.route_prefix.length))[0];

  if (!match) {
    await next();
    return;
  }

  const bucketKey = `tenant_quota:${tenantId}:${match.route_prefix}`;
  const raw = await c.env.KV.get(bucketKey, 'json') as { tokens: number; refill_at_ms: number } | null;
  const now = Date.now();
  const capacity = match.max_requests + (match.burst_capacity || 0);

  const check = tokenBucketCheck({
    stored_tokens: raw ? raw.tokens : capacity,
    last_refill_at_ms: raw ? raw.refill_at_ms : now,
    now_ms: now,
    window_seconds: match.window_seconds,
    max_requests: match.max_requests,
    burst_capacity: match.burst_capacity || 0,
    request_cost: 1,
  });

  await c.env.KV.put(bucketKey, JSON.stringify({
    tokens: check.new_tokens,
    refill_at_ms: check.new_refill_at_ms,
  }), { expirationTtl: match.window_seconds * 4 });

  if (!check.allowed) {
    // Best-effort event log — not awaited so the 429 response goes out fast.
    c.executionCtx?.waitUntil?.(
      (async () => {
        try {
          await c.env.DB.prepare(
            `INSERT INTO tenant_rate_limit_events
               (id, tenant_id, route_prefix, window_start, denied_count, allowed_count)
             VALUES (?, ?, ?, datetime('now'), 1, 0)`,
          ).bind(`trle_${Date.now().toString(36)}`, tenantId, match.route_prefix).run();
        } catch { /* swallow */ }
      })(),
    );
    return c.json(
      {
        success: false,
        error: 'Tenant quota exceeded',
        retry_after_seconds: check.retry_after_seconds,
      },
      429,
      { 'Retry-After': String(check.retry_after_seconds) },
    );
  }
  await next();
}

/**
 * KV-cached loader for a tenant's rate-limit rules. Tenants that have NO
 * rows configured still get cached as the sentinel `__none__` so repeated
 * hits don't all go to D1.
 */
async function loadRules(
  env: HonoEnv['Bindings'],
  tenantId: string,
): Promise<RateLimitRule[] | null> {
  const key = RULES_CACHE_PREFIX + tenantId;
  try {
    const cached = await env.KV.get(key);
    if (cached === NO_RULES) return [];
    if (cached) {
      try { return JSON.parse(cached) as RateLimitRule[]; } catch { /* fall through */ }
    }
  } catch { /* KV miss → D1. */ }

  try {
    const rs = await env.DB.prepare(
      `SELECT route_prefix, window_seconds, max_requests, burst_capacity
         FROM tenant_rate_limits WHERE tenant_id = ?`,
    ).bind(tenantId).all<RateLimitRule>();
    const rows = rs.results || [];
    const value = rows.length === 0 ? NO_RULES : JSON.stringify(rows);
    try {
      await env.KV.put(key, value, { expirationTtl: RULES_CACHE_TTL_SECONDS });
    } catch { /* soft */ }
    return rows;
  } catch {
    // DB failure → fall open. Rate limiting is not a security boundary;
    // it's capacity shaping, so we prefer availability.
    return null;
  }
}

/** Drop the cached rules for a tenant. Called from the admin UI when
 *  rate limits are updated so the change takes effect immediately. */
export async function invalidateTenantRules(
  env: HonoEnv['Bindings'],
  tenantId: string,
): Promise<void> {
  try { await env.KV.delete(RULES_CACHE_PREFIX + tenantId); } catch { /* soft */ }
}
