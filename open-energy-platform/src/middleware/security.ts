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
  '/auth/password-reset',
  '/auth/forgot-password',
  '/auth/mfa/verify',
  '/auth/mfa/challenge',
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
  env: HonoEnv,
  key: string,
  windowSeconds: number,
  maxRequests: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const current = await env.KV.get(key, 'json') as { count: number; windowStart: number } | null;

  if (!current || current.windowStart + windowSeconds < now) {
    await env.KV.put(
      key,
      JSON.stringify({ count: 1, windowStart: now }),
      { expirationTtl: windowSeconds + 10 },
    );
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowSeconds, limit: maxRequests };
  }

  if (current.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: current.windowStart + windowSeconds, limit: maxRequests };
  }

  await env.KV.put(
    key,
    JSON.stringify({ count: current.count + 1, windowStart: current.windowStart }),
    { expirationTtl: windowSeconds + 10 },
  );
  return {
    allowed: true,
    remaining: maxRequests - current.count - 1,
    resetAt: current.windowStart + windowSeconds,
    limit: maxRequests,
  };
}

export async function checkRateLimit(env: HonoEnv, identifier: string): Promise<RateLimitResult> {
  return doRateLimit(env, `ratelimit:${identifier}`, RATE_LIMIT_WINDOW, MAX_REQUESTS_PER_WINDOW);
}

export async function checkSensitiveRateLimit(
  env: HonoEnv,
  identifier: string,
  routeFamily: string,
): Promise<RateLimitResult> {
  return doRateLimit(
    env,
    `ratelimit:sensitive:${routeFamily}:${identifier}`,
    SENSITIVE_WINDOW,
    MAX_SENSITIVE_REQUESTS,
  );
}

// Security headers middleware — applied to every API response.
// CSP is the strictest possible for an API surface (no inline scripts,
// no external assets), as the API never returns HTML. HSTS is set to
// one year with preload eligibility. Cross-domain flash/PDF policies are
// disabled to prevent rogue policy files being honoured.
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
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';",
  );
  c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  c.res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
}

// CORS middleware
export async function corsMiddleware(c: Context<HonoEnv>, next: Next) {
  const origin = c.req.header('Origin');
  
  // Allow specific origins in production
  const allowedOrigins = [
    'https://oe.vantax.co.za',
    'https://www.oe.vantax.co.za',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
  
  if (origin && allowedOrigins.includes(origin)) {
    c.res.headers.set('Access-Control-Allow-Origin', origin);
  }
  
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
  c.res.headers.set('Access-Control-Max-Age', '86400');
  c.res.headers.set('Access-Control-Allow-Credentials', 'true');
  
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  
  await next();
}

// Strict CORS for production API
export async function strictCors(c: Context<HonoEnv>, next: Next) {
  const origin = c.req.header('Origin');
  
  if (origin !== 'https://oe.vantax.co.za' && origin !== 'https://www.oe.vantax.co.za') {
    if (!origin?.startsWith('http://localhost')) {
      return c.json({ success: false, error: 'Origin not allowed' }, 403);
    }
  }
  
  c.res.headers.set('Access-Control-Allow-Origin', origin || '');
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  c.res.headers.set('Access-Control-Max-Age', '3600');
  
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  
  await next();
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