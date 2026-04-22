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

// Rate limiter using KV
const RATE_LIMIT_WINDOW = 60; // seconds
const MAX_REQUESTS_PER_WINDOW = 100;

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function checkRateLimit(env: HonoEnv, identifier: string): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}`;
  const now = Math.floor(Date.now() / 1000);
  
  // Get current count
  const current = await env.KV.get(key, 'json') as { count: number; windowStart: number } | null;
  
  if (!current || current.windowStart + RATE_LIMIT_WINDOW < now) {
    // New window
    await env.KV.put(key, JSON.stringify({ count: 1, windowStart: now }), { expirationTtl: RATE_LIMIT_WINDOW + 10 });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetAt: now + RATE_LIMIT_WINDOW };
  }
  
  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, resetAt: current.windowStart + RATE_LIMIT_WINDOW };
  }
  
  // Increment count
  await env.KV.put(key, JSON.stringify({ count: current.count + 1, windowStart: current.windowStart }), { expirationTtl: RATE_LIMIT_WINDOW + 10 });
  
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - current.count - 1, resetAt: current.windowStart + RATE_LIMIT_WINDOW };
}

// Security headers middleware
export async function securityHeaders(c: Context<HonoEnv>, next: Next) {
  // Add request ID
  const requestId = c.req.header('X-Request-ID') || generateRequestId();
  c.set('requestId', requestId);
  
  await next();
  
  // Add security headers to response
  c.res.headers.set('X-Request-ID', requestId);
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('X-XSS-Protection', '1; mode=block');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // CSP for API (stricter)
  c.res.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
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

// Rate limit middleware
export async function rateLimitMiddleware(c: Context<HonoEnv>, next: Next) {
  // Use IP + User-Agent as identifier
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const userAgent = c.req.header('User-Agent') || 'unknown';
  const identifier = `${ip}:${userAgent.substring(0, 50)}`;
  
  const result = await checkRateLimit(c.env, identifier);
  
  c.res.headers.set('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW.toString());
  c.res.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  c.res.headers.set('X-RateLimit-Reset', result.resetAt.toString());
  
  if (!result.allowed) {
    return c.json({
      success: false,
      error: 'Rate limit exceeded. Please wait before making more requests.',
      retryAfter: result.resetAt - Math.floor(Date.now() / 1000),
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
  // avoid drowning the table in noise.
  if (c.env?.DB && !path.startsWith('/api/health')) {
    c.executionCtx?.waitUntil?.(
      recordRequestStat(c.env.DB, route, method, status, duration).catch(() => {}),
    ) ?? (await recordRequestStat(c.env.DB, route, method, status, duration).catch(() => {}));
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