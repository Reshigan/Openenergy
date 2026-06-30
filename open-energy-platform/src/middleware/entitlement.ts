// ═══════════════════════════════════════════════════════════════════════════
// Subscription-tier entitlement middleware.
//
// participants.subscription_tier is seeded (migration 518 sets every demo
// persona to enterprise) but historically NO route checked it — tiers were
// invoicing labels that unlocked nothing. This middleware closes that gap
// for the highest-value paid surfaces (ML model governance, government
// filing connector).
//
// `requireTier(...allowedTiers)` resolves the caller's subscription_tier from
// D1 (KV-cached, same pattern as auth's tenant cache) and 403s if the tier
// is not in the allowed set. It ONLY enforces on mutating methods
// (POST/PUT/PATCH/DELETE) — read-only views (GET/HEAD) stay open so starter
// tier can still see the surfaces; the paid capability being gated is
// authoring/deploying, not viewing.
//
// Admins bypass the tier check (same escape hatch as requireRole) so a
// misconfigured seed never locks out the platform owner.
// ═══════════════════════════════════════════════════════════════════════════

import { Context, Next } from 'hono';
import { HonoEnv } from '../utils/types';

const TIER_CACHE_TTL_SECONDS = 120;
const TIER_CACHE_PREFIX = 'auth:tier:';
const TIER_CACHE_MISSING = '__missing__';

/**
 * Resolve the caller's subscription_tier from D1, KV-cached per participant
 * for the same 120s window the tenant cache uses. Returns null when the
 * caller is unauthenticated or the participant row can't be resolved.
 *
 * DB/KV failures fall open (return null) — the tier gate is a commercial
 * entitlement, not a security boundary; we prefer availability over a
 * hard 503 when the lookup transiently fails. Callers that resolve to null
 * are rejected by requireTier unless they're admin.
 */
export async function getCallerTier(c: Context<HonoEnv>): Promise<string | null> {
  const auth = c.get('auth') as { user?: { id?: string; role?: string } } | undefined;
  const pid = auth?.user?.id;
  if (!pid) return null;

  const key = TIER_CACHE_PREFIX + pid;
  try {
    const cached = await c.env.KV.get(key);
    if (cached === TIER_CACHE_MISSING) return null;
    if (cached) return cached;
  } catch { /* KV failure → fall through to D1. */ }

  let tier: string | null = null;
  try {
    const row = await c.env.DB
      .prepare('SELECT subscription_tier FROM participants WHERE id = ?')
      .bind(pid)
      .first<{ subscription_tier: string | null }>();
    tier = row?.subscription_tier ?? null;
  } catch { /* DB transient → fall open. */ }

  try {
    await c.env.KV.put(
      key,
      tier ?? TIER_CACHE_MISSING,
      { expirationTtl: TIER_CACHE_TTL_SECONDS },
    );
  } catch { /* soft */ }
  return tier;
}

/**
 * Drop the cached tier for a participant. Call from any admin/support
 * mutation that changes subscription_tier so the change takes effect
 * immediately instead of waiting out the 120s TTL.
 */
export async function invalidateTierCache(
  env: HonoEnv['Bindings'],
  participantId: string,
): Promise<void> {
  try { await env.KV.delete(TIER_CACHE_PREFIX + participantId); } catch { /* soft */ }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Middleware factory: 403s mutating requests when the caller's tier is not
 * in the allowed set. GET/HEAD pass through (read-only views stay open).
 * Admins bypass. Unauthenticated callers fall to the route's own auth
 * guard (this middleware runs after authMiddleware).
 */
export function requireTier(...allowedTiers: string[]) {
  const allowed = new Set(allowedTiers);
  return async (c: Context<HonoEnv>, next: Next): Promise<Response | void> => {
    const method = c.req.method.toUpperCase();
    if (!MUTATING.has(method)) {
      await next();
      return;
    }
    const auth = c.get('auth') as { user?: { role?: string } } | undefined;
    if (auth?.user?.role === 'admin') {
      await next();
      return;
    }
    const tier = await getCallerTier(c);
    if (tier === null || !allowed.has(tier)) {
      return c.json(
        {
          success: false,
          error: 'Entitlement required',
          required_tiers: allowedTiers,
          your_tier: tier,
        },
        403,
      );
    }
    await next();
  };
}