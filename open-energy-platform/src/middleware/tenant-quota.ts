// ═══════════════════════════════════════════════════════════════════════════
// Tenant-scoped quota middleware — per-tenant token buckets stored in KV.
//
// Attach as:  app.use('/api/*', tenantQuotaMiddleware);
//
// Uses tenant_rate_limits table + KV state for the running bucket. Falls
// open if no row is configured for the caller's tenant or route prefix.
// ═══════════════════════════════════════════════════════════════════════════

import { Context, Next } from 'hono';
import { HonoEnv } from '../utils/types';
import { tokenBucketCheck } from '../utils/data-tier';

export async function tenantQuotaMiddleware(c: Context<HonoEnv>, next: Next): Promise<Response | void> {
  const auth = c.get('auth') as { user?: { tenant_id?: string } } | undefined;
  const tenantId = auth?.user?.tenant_id || 'anonymous';
  const path = c.req.path;

  // Find most specific matching rule.
  const rules = await c.env.DB.prepare(
    `SELECT route_prefix, window_seconds, max_requests, burst_capacity
       FROM tenant_rate_limits WHERE tenant_id = ?`,
  ).bind(tenantId).all<{ route_prefix: string; window_seconds: number; max_requests: number; burst_capacity: number }>();

  const match = (rules.results || [])
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
    // Best-effort event log.
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
