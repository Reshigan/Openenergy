// ═══════════════════════════════════════════════════════════════════════════
// KV-backed cache for reference tables.
//
// Reference tables (products, registries, plans, modules, rules, scenarios)
// change ≤ once/month in practice but are read on every page load for the
// dashboards they power. Caching them in KV cuts D1 read cost to effectively
// zero for these reads.
//
// Usage:
//   const rows = await cachedAll(env, 'ancillary_products',
//     `SELECT id, product_code, product_name, service_type
//        FROM ancillary_service_products WHERE enabled = 1
//        ORDER BY service_type`,
//     { ttlSeconds: 3600 });
//
// TTL choices (default 3600 s):
//   • Tenant tier / modules → 300 s (user state changes mid-day)
//   • Products / registries / plans / rules / scenarios → 3600 s
//
// Cache busting:
//   await invalidateReference(env, 'ancillary_products')
// Call from the POST/PUT endpoints that mutate the underlying table.
// ═══════════════════════════════════════════════════════════════════════════

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface RefCacheEnv {
  DB: D1Database;
  KV: KVNamespace;
}

const PREFIX = 'ref:';

/**
 * Return `results: []` from a D1 query, caching the array in KV. The cached
 * value is the raw row array — no wrapping — so the payload size stays tight.
 */
export async function cachedAll<T = Record<string, unknown>>(
  env: RefCacheEnv,
  cacheKey: string,
  sql: string,
  opts: { ttlSeconds?: number; bindings?: unknown[] } = {},
): Promise<T[]> {
  const key = PREFIX + cacheKey;
  try {
    const hit = await env.KV.get(key, 'json') as T[] | null;
    if (hit) return hit;
  } catch { /* KV miss → D1 */ }

  const stmt = opts.bindings?.length
    ? env.DB.prepare(sql).bind(...opts.bindings)
    : env.DB.prepare(sql);
  const rs = await stmt.all<T>();
  const rows = rs.results || [];

  try {
    await env.KV.put(key, JSON.stringify(rows), {
      expirationTtl: opts.ttlSeconds ?? 3600,
    });
  } catch { /* soft */ }
  return rows;
}

/**
 * Cached lookup of a single row by a predicate. Use for "is this id valid?"
 * or "what's this product's spec" checks that run on every request.
 */
export async function cachedFirst<T = Record<string, unknown>>(
  env: RefCacheEnv,
  cacheKey: string,
  sql: string,
  bindings: unknown[],
  opts: { ttlSeconds?: number } = {},
): Promise<T | null> {
  const key = PREFIX + cacheKey;
  try {
    const hit = await env.KV.get(key, 'json');
    if (hit !== null && hit !== undefined) return hit as T;
  } catch { /* */ }
  const row = await env.DB.prepare(sql).bind(...bindings).first<T>();
  try {
    if (row) await env.KV.put(key, JSON.stringify(row), { expirationTtl: opts.ttlSeconds ?? 3600 });
  } catch { /* */ }
  return row || null;
}

/** Bust a single cached reference entry. */
export async function invalidateReference(env: RefCacheEnv, cacheKey: string): Promise<void> {
  try { await env.KV.delete(PREFIX + cacheKey); } catch { /* */ }
}

/** Bust many keys at once (e.g. after a migration applies a batch of flag changes). */
export async function invalidateReferences(env: RefCacheEnv, keys: string[]): Promise<void> {
  await Promise.all(keys.map((k) => invalidateReference(env, k)));
}
