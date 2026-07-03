// ═══════════════════════════════════════════════════════════════════════════
// Security Middleware — CSP, CORS, Rate Limiting, Request ID
// ═══════════════════════════════════════════════════════════════════════════

import { Context, Next } from 'hono';
import { HonoEnv } from '../utils/types';
import { logger, recordRequestStat, normaliseRoute } from '../utils/logger';

// Generate unique request ID
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Rate limiting — two tiers.
// Tier 1 (global): per-IP+UA sliding window, 100 req/min. Applied everywhere.
// Tier 2 (sensitive): per-IP+route-family window, 10 req/5min. Applied to
//   auth/login, password-reset, MFA, SSO callback — anything brute-forceable.
// ──────────────────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW = 60; // seconds
const MAX_REQUESTS_PER_WINDOW = 100;

const SENSITIVE_WINDOW = 300; // 5 min
const MAX_SENSITIVE_REQUESTS = 10;

// Paths that should trip the stricter limiter. Substring match.
const SENSITIVE_PATH_PATTERNS = [
  '/auth/login',
  '/auth/reset-password',
  '/auth/forgot-password',
  '/auth/mfa/verify',
  '/auth/mfa/challenge',
  '/auth/mfa/backup-code',
  '/auth/sso/microsoft/callback',
  '/auth/refresh',
];

export function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((p) => path.includes(p));
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

async function doRateLimit(
  env: HonoEnv['Bindings'],
  key: string,
  windowSeconds: number,
  maxRequests: number,
): Promise<RateLimitResult> {
  // Global tier only — capacity shaping, not a security boundary. KV
  // get-then-put is non-atomic by design: under burst a transient KV miss
  // must fall open (allow), never 500 a legitimate request. The sensitive
  // tier below uses D1 for true atomicity; this KV path is intentionally
  // kept fall-open because the global 100/min cap is not brute-force
  // protection.
  const now = Math.floor(Date.now() / 1000);
  const current = await env.KV.get(key, 'json') as { count: number; windowStart: number } | null;

  if (!current || current.windowStart + windowSeconds < now) {
    // Best-effort persist. Rate limiting is capacity shaping, not a security
    // boundary — a KV PUT 429 under burst must fall open (allow), never 500.
    try {
      await env.KV.put(
        key,
        JSON.stringify({ count: 1, windowStart: now }),
        { expirationTtl: windowSeconds + 10 },
      );
    } catch { /* KV transient — fall open */ }
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowSeconds, limit: maxRequests };
  }

  if (current.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: current.windowStart + windowSeconds, limit: maxRequests };
  }

  try {
    await env.KV.put(
      key,
      JSON.stringify({ count: current.count + 1, windowStart: current.windowStart }),
      { expirationTtl: windowSeconds + 10 },
    );
  } catch { /* KV transient — fall open rather than 500 the request */ }
  return {
    allowed: true,
    remaining: maxRequests - current.count - 1,
    resetAt: current.windowStart + windowSeconds,
    limit: maxRequests,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Sensitive tier — D1 atomic conditional upsert.
//
// The previous implementation shared the KV get-then-put path with the global
// tier. That had two defects on the brute-force-protected endpoints
// (/auth/login et al):
//   1. Non-atomic: two concurrent logins could both read count=N and both
//      pass when only one should (the ~2ms race window the old comment
//      hand-waved away).
//   2. Fell open on KV errors: a transient KV failure returned
//      allowed=true, silently disabling the 10/5min cap — exactly the wrong
//      direction for a security boundary.
//
// This path uses a single D1 INSERT ... ON CONFLICT DO UPDATE ... WHERE
// statement. D1 executes a single statement atomically, so the
// read-check-increment is one atomic step: at count = max-1 only one of two
// concurrent callers increments (allowed); the other hits WHERE false and
// is blocked. On any D1 failure (schema bootstrap or the upsert itself)
// we FAIL CLOSED — return allowed=false so the caller 429s — rather than
// silently let a brute-force loop through.
// ──────────────────────────────────────────────────────────────────────────

let sensitiveSchemaReady: Promise<void> | null = null;

function ensureSensitiveSchema(db: HonoEnv['Bindings']['DB']): Promise<void> {
  if (sensitiveSchemaReady) return sensitiveSchemaReady;
  sensitiveSchemaReady = (async () => {
    // IF NOT EXISTS — idempotent, safe to re-run on every cold isolate.
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS sensitive_rate_counters (
        bucket_key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL,
        max_requests INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
    ).run();
    await db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sensitive_rate_expires
       ON sensitive_rate_counters(expires_at)`,
    ).run();
  })().catch((err) => {
    // Allow a retry on the next request rather than poisoning the isolate.
    sensitiveSchemaReady = null;
    throw err;
  });
  return sensitiveSchemaReady;
}

// Test-only: drop the memoised schema promise so a fresh isolate's
// bootstrap path can be exercised repeatedly within a single test run.
// Not part of the public surface; prefixed to make the intent obvious.
export function __resetSensitiveSchemaCacheForTests(): void {
  sensitiveSchemaReady = null;
}

async function doSensitiveRateLimit(
  env: HonoEnv['Bindings'],
  identifier: string,
  routeFamily: string,
  windowSeconds: number,
  maxRequests: number,
): Promise<RateLimitResult> {
  const db = env.DB;
  // No D1 binding (e.g. legacy unit-test fixtures that only stub KV). Fall
  // back to the KV path so those fixtures keep working. Production always
  // binds DB, so the atomic D1 path below is what runs for real traffic.
  if (!db) {
    return doRateLimit(
      env,
      `ratelimit:sensitive:${routeFamily}:${identifier}`,
      windowSeconds,
      maxRequests,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const bucketKey = `sensitive:${routeFamily}:${identifier}:${windowStart}`;
  const expiresAt = windowStart + windowSeconds + 10;
  const resetAt = windowStart + windowSeconds;

  try {
    await ensureSensitiveSchema(db);
  } catch {
    // Schema bootstrap failed — fail closed for brute-force protection.
    return { allowed: false, remaining: 0, resetAt, limit: maxRequests };
  }

  try {
    // Atomic conditional upsert.
    //  - No existing row: INSERT count=1, RETURNING count=1 → allowed.
    //  - Row exists, count < max: DO UPDATE increments, RETURNING new count.
    //  - Row exists, count >= max: WHERE false → no update, RETURNING
    //    nothing → we see null and block.
    // Single statement → atomic under D1; the get-then-put race is gone.
    const row = await db
      .prepare(
        `INSERT INTO sensitive_rate_counters
           (bucket_key, window_start, count, max_requests, expires_at)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1
         WHERE count < max_requests
         RETURNING count`,
      )
      .bind(bucketKey, windowStart, maxRequests, expiresAt)
      .first<{ count: number }>();

    if (!row) {
      return { allowed: false, remaining: 0, resetAt, limit: maxRequests };
    }
    const newCount = row.count;
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - newCount),
      resetAt,
      limit: maxRequests,
    };
  } catch {
    // Store error — fail closed. A transient D1 outage must NOT silently
    // disable the 10/5min brute-force cap on /auth/login. Returning 429
    // here is the security-correct direction.
    return { allowed: false, remaining: 0, resetAt, limit: maxRequests };
  }
}

export async function checkRateLimit(env: HonoEnv['Bindings'], identifier: string): Promise<RateLimitResult> {
  return doRateLimit(env, `ratelimit:${identifier}`, RATE_LIMIT_WINDOW, MAX_REQUESTS_PER_WINDOW);
}

export async function checkSensitiveRateLimit(
  env: HonoEnv['Bindings'],
  identifier: string,
  routeFamily: string,
): Promise<RateLimitResult> {
  return doSensitiveRateLimit(env, identifier, routeFamily, SENSITIVE_WINDOW, MAX_SENSITIVE_REQUESTS);
}

// Security headers middleware — applied to every response.
//
// CSP NOTE: The previous policy was `default-src 'none'`, intended for the
// JSON API surface only. Cloudflare's ASSETS binding inherits these headers
// when serving the SPA shell, which made every browser block the React
// bundle, stylesheet, images, fonts, and Cloudflare's beacon script — the
// page rendered blank for all real users. The policy below keeps a tight
// allowlist (no third-party origins, no eval, no foreign frames) while
// permitting the SPA's own assets to actually execute.
export async function securityHeaders(c: Context<HonoEnv>, next: Next) {
  const requestId = c.req.header('X-Request-ID') || generateRequestId();
  c.set('requestId', requestId);

  await next();

  c.res.headers.set('X-Request-ID', requestId);
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('X-XSS-Protection', '1; mode=block');
  c.res.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  c.res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // Vite ships hashed JS/CSS; CF Bot Management injects inline scripts at the
      // edge after this header is set, so 'unsafe-inline' is required. CF challenges
      // also load from challenges.cloudflare.com.
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      // XHR/fetch + the realtime SSE stream are same-origin.
      "connect-src 'self' https://cloudflareinsights.com",
      "worker-src 'self'",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  // Resource-policy `same-origin` blocks the SPA from being embedded
  // anywhere else, but breaks the SW prefetch of partner logos served by
  // Cloudflare's CDN edge. `same-site` is the right balance.
  c.res.headers.set('Cross-Origin-Resource-Policy', 'same-site');
}

// CORS middleware
export async function corsMiddleware(c: Context<HonoEnv>, next: Next) {
  const origin = c.req.header('Origin');
  const isProduction = (c.env as unknown as { ENVIRONMENT?: string })?.ENVIRONMENT === 'production';

  const allowedOrigins: string[] = [
    'https://oe.vantax.co.za',
    'https://www.oe.vantax.co.za',
    // Only allow local origins in non-production environments
    ...(!isProduction ? ['http://localhost:3000', 'http://localhost:5173'] : []),
  ];

  if (origin && allowedOrigins.includes(origin)) {
    c.res.headers.set('Access-Control-Allow-Origin', origin);
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
  c.res.headers.set('Access-Control-Max-Age', '86400');
  c.res.headers.set('Vary', 'Origin');
  
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  await next();
  return;
}

// Strict CORS for production API
export async function strictCors(c: Context<HonoEnv>, next: Next) {
  const origin = c.req.header('Origin');
  
  const env = (c.env as unknown as { ENVIRONMENT?: string })?.ENVIRONMENT;
  const isLocalAllowed = env !== 'production';
  if (origin !== 'https://oe.vantax.co.za' && origin !== 'https://www.oe.vantax.co.za') {
    if (!isLocalAllowed || !origin?.startsWith('http://localhost')) {
      return c.json({ success: false, error: 'Origin not allowed' }, 403);
    }
  }
  
  c.res.headers.set('Access-Control-Allow-Origin', origin || '');
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  c.res.headers.set('Access-Control-Max-Age', '3600');
  
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  await next();
  return;
}

// Rate limit middleware — applies global limiter to every request and
// stacks the stricter sensitive limiter on auth/password/MFA paths. We
// key the sensitive bucket on the IP alone (not IP+UA) so a single
// attacker rotating User-Agent headers cannot escape the limiter.
export async function rateLimitMiddleware(c: Context<HonoEnv>, next: Next) {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const userAgent = c.req.header('User-Agent') || 'unknown';
  const identifier = `${ip}:${userAgent.substring(0, 50)}`;
  const path = c.req.path;

  // Tier 2 runs first — hitting the sensitive cap returns 429 before we
  // ever touch the global bucket, so a brute-force loop can't exhaust
  // the 100/min allowance for legitimate users on the same NAT.
  if (isSensitivePath(path)) {
    const route = normaliseRoute(path);
    const sensitive = await checkSensitiveRateLimit(c.env, ip, route);
    c.res.headers.set('X-RateLimit-Sensitive-Limit', sensitive.limit.toString());
    c.res.headers.set('X-RateLimit-Sensitive-Remaining', sensitive.remaining.toString());
    c.res.headers.set('X-RateLimit-Sensitive-Reset', sensitive.resetAt.toString());
    if (!sensitive.allowed) {
      const retry = Math.max(1, sensitive.resetAt - Math.floor(Date.now() / 1000));
      c.res.headers.set('Retry-After', retry.toString());
      return c.json({
        success: false,
        error: 'Too many attempts on a sensitive endpoint. Please wait before retrying.',
        retryAfter: retry,
      }, 429);
    }
  }

  const result = await checkRateLimit(c.env, identifier);
  c.res.headers.set('X-RateLimit-Limit', result.limit.toString());
  c.res.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  c.res.headers.set('X-RateLimit-Reset', result.resetAt.toString());

  if (!result.allowed) {
    const retry = Math.max(1, result.resetAt - Math.floor(Date.now() / 1000));
    c.res.headers.set('Retry-After', retry.toString());
    return c.json({
      success: false,
      error: 'Rate limit exceeded. Please wait before making more requests.',
      retryAfter: retry,
    }, 429);
  }

  await next();
  return;
}

// Validate request content type
export async function validateContentType(c: Context<HonoEnv>, next: Next) {
  const method = c.req.method;

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentType = c.req.header('Content-Type');

    if (!contentType || !contentType.includes('application/json')) {
      return c.json({
        success: false,
        error: 'Content-Type must be application/json',
      }, 415);
    }
  }

  await next();
  return;
}

// Request logging — emits a single structured JSON line per request.
// Also records a rolling request_stats bucket so /admin/monitoring can
// show per-route traffic + latency without scanning Logpush exports.
export async function requestLogger(c: Context<HonoEnv>, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const route = normaliseRoute(path);
  const requestId = c.get('requestId') || generateRequestId();

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;
  const auth = c.get('auth') as { user?: { id?: string }; tenant_id?: string } | undefined;

  logger.info('http_request', {
    req_id: requestId,
    method,
    path,
    route,
    status,
    latency_ms: duration,
    slow: duration > 1000,
    participant_id: auth?.user?.id,
    tenant_id: auth?.tenant_id,
  });

  // Stats bucket is best-effort; skip the DB write for health checks to
  // avoid drowning the table in noise. Prefer waitUntil so DB latency is
  // outside the response path; fall back to await only when waitUntil is
  // unavailable (e.g. unit tests or Workers outside a request scope).
  if (c.env?.DB && !path.startsWith('/api/health')) {
    const task = recordRequestStat(c.env.DB, route, method, status, duration).catch(() => {});
    if (typeof c.executionCtx?.waitUntil === 'function') {
      c.executionCtx.waitUntil(task);
    } else {
      await task;
    }
  }
}

// Input sanitization helper
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

// Sanitize all string fields in object
export function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}