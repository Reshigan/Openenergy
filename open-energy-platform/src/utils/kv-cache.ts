// ════════════════════════════════════════════════════════════════════════
// kv-cache — thin read-through cache around the KV binding.
//
// Purpose: cut D1 row-reads on expensive aggregate endpoints (fleet
// KPIs, briefings, opportunity scans, search, schedule). KV reads are
// cheaper and faster than D1 row reads:
//
//   • D1 row reads: $0.001 / 1,000 rows
//   • KV reads:     $0.50  / 1,000,000 reads (500× cheaper at scale)
//
// Pattern:
//
//   const data = await cached(c.env, 'om:fleet-kpis:' + user.id, 60, async () => {
//     // expensive D1 queries here
//     return result;
//   });
//
// • TTL is in seconds (matches Cloudflare KV semantics)
// • A bypass query param (?nocache=1) refreshes the cache on demand
// • Cache key is namespaced; rotate prefix when shape changes to invalidate
// • Returns "miss" + write on first hit; subsequent hits read from KV only
//
// Stampede protection is deliberately omitted — the workload is read-heavy,
// short TTLs (60-300s) bound the worst case, and Workers' execution model
// already serialises identical concurrent requests in many cases.
// ════════════════════════════════════════════════════════════════════════

const CACHE_PREFIX = 'oec:v1:';
const STATS_ENABLED = false; // flip to true to log hit/miss to console for tuning

type WithKV = { KV?: KVNamespace };

export async function cached<T>(
  env: WithKV,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
  opts?: { bypass?: boolean },
): Promise<T> {
  const k = CACHE_PREFIX + key;
  if (env.KV && !opts?.bypass) {
    try {
      const hit = await env.KV.get(k, 'json') as T | null;
      if (hit !== null && hit !== undefined) {
        if (STATS_ENABLED) console.log(`[kv-cache] HIT  ${k}`);
        return hit;
      }
    } catch {
      // KV transient error — fall through to compute
    }
  }
  if (STATS_ENABLED) console.log(`[kv-cache] MISS ${k}`);
  const value = await compute();
  if (env.KV) {
    try {
      await env.KV.put(k, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSeconds) });
    } catch {
      // KV transient error — return the computed value anyway
    }
  }
  return value;
}

/** Force-invalidate a cache key (e.g. after a mutation). */
export async function invalidate(env: WithKV, key: string): Promise<void> {
  if (!env.KV) return;
  try { await env.KV.delete(CACHE_PREFIX + key); } catch { /* swallow */ }
}

/** Force-invalidate all keys with a given prefix (uses KV list — keep
 *  prefixes narrow). */
export async function invalidatePrefix(env: WithKV, prefix: string): Promise<void> {
  if (!env.KV) return;
  try {
    const list = await env.KV.list({ prefix: CACHE_PREFIX + prefix });
    await Promise.all(list.keys.map((k) => env.KV!.delete(k.name)));
  } catch { /* swallow */ }
}

/** Convenience for endpoints that want ?nocache=1 to bust their cache. */
export function shouldBypass(req: Request): boolean {
  try {
    const url = new URL(req.url);
    return url.searchParams.get('nocache') === '1';
  } catch { return false; }
}
