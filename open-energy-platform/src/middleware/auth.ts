// ═══════════════════════════════════════════════════════════════════════════
// JWT Authentication Middleware for Open Energy Platform
// Supports ES256 (asymmetric, preferred) and HS256 (fallback).
// Set JWT_PRIVATE_KEY_JWK + JWT_PUBLIC_KEY_JWK as Worker secrets to enable ES256.
// Generate key pair: node scripts/generate-jwt-keys.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { HonoEnv, HonoBindings } from '../utils/types';
import { AppError, ErrorCode } from '../utils/types';
import type { JWTPayload } from '../utils/types';

const DEFAULT_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60;

// ── ES256 helpers ─────────────────────────────────────────────────────────────

async function importEcPrivateKey(jwkStr: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkStr);
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function importEcPublicKey(jwkStr: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkStr);
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function base64UrlEncodeStr(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── HS256 internals ───────────────────────────────────────────────────────────

async function signWithHMAC(data: string, secret: string): Promise<ArrayBuffer> {
  const keyData = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return crypto.subtle.sign('HMAC', keyData, new TextEncoder().encode(data));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sign a JWT payload.
 * - Pass `HonoBindings` (i.e. `c.env`) to auto-select ES256 when
 *   JWT_PRIVATE_KEY_JWK is set, HS256 otherwise.
 * - Pass a plain string secret to force HS256 (used in tests).
 */
export async function signToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secretOrEnv: string | HonoBindings,
  opts: { expiresInSeconds?: number } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + (opts.expiresInSeconds ?? DEFAULT_TOKEN_EXPIRY_SECONDS);
  const claims = { ...payload, iat: now, exp: expires };

  if (typeof secretOrEnv === 'object' && secretOrEnv.JWT_PRIVATE_KEY_JWK) {
    // ES256 path
    const header = base64UrlEncodeStr(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
    const body   = base64UrlEncodeStr(JSON.stringify(claims));
    const key    = await importEcPrivateKey(secretOrEnv.JWT_PRIVATE_KEY_JWK);
    const sigBuf = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(`${header}.${body}`),
    );
    return `${header}.${body}.${base64UrlEncodeBytes(new Uint8Array(sigBuf))}`;
  }

  // HS256 path (string secret or env without private key)
  const secret = typeof secretOrEnv === 'string' ? secretOrEnv : secretOrEnv.JWT_SECRET;
  const header = base64UrlEncodeStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = base64UrlEncodeStr(JSON.stringify(claims));
  const sig    = await signWithHMAC(`${header}.${body}`, secret);
  return `${header}.${body}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
}

/**
 * Verify a JWT and return the payload, or null if invalid/expired.
 * Accepts `HonoBindings` (c.env) to support both ES256 and HS256 automatically,
 * or a plain string secret for HS256 only (test usage).
 */
export async function verifyToken(
  token: string,
  secretOrEnv: string | HonoBindings,
): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, bodyB64, sigB64] = parts;

    const hdr = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
    const alg: string = hdr.alg ?? 'HS256';

    if (alg === 'ES256') {
      const pubKeyJwk = typeof secretOrEnv === 'object' ? secretOrEnv.JWT_PUBLIC_KEY_JWK : null;
      if (!pubKeyJwk) return null;
      const key = await importEcPublicKey(pubKeyJwk);
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        base64UrlDecode(sigB64),
        new TextEncoder().encode(`${headerB64}.${bodyB64}`),
      );
      if (!valid) return null;
    } else {
      // HS256 — constant-time comparison to prevent timing oracle
      const secret = typeof secretOrEnv === 'string' ? secretOrEnv : secretOrEnv.JWT_SECRET;
      const expected = base64UrlEncodeBytes(new Uint8Array(await signWithHMAC(`${headerB64}.${bodyB64}`, secret)));
      const enc = new TextEncoder();
      const a = enc.encode(sigB64);
      const b = enc.encode(expected);
      if (a.length !== b.length) return null;
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      if (diff !== 0) return null;
    }

    const payload: JWTPayload = JSON.parse(atob(bodyB64.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Tenant-id cache
//
// The (participant_id → tenant_id) mapping is hit on every authenticated
// request. We cache it in KV with a short TTL so the D1 round-trip
// happens at most once per TTL window per participant instead of once
// per request.
//
// TTL of 120 s is chosen so that:
//   • at 1 rps per participant, we save ~240 D1 reads per cache fill.
//   • a tenant move takes effect within 2 minutes OR the admin UI
//     invalidates explicitly (see invalidateTenantCache()).
//
// Cache key: `auth:tenant:<participant_id>`.
// Value shape: '<tenant_id>' (string) OR '__missing__' for hard-delete of
// a participant (so repeated hits don't all go to D1).
// ───────────────────────────────────────────────────────────────────────────
const TENANT_CACHE_TTL_SECONDS = 120;
const TENANT_CACHE_PREFIX = 'auth:tenant:';
const TENANT_CACHE_MISSING = '__missing__';

async function resolveTenantIdCached(
  env: HonoEnv['Bindings'],
  participantId: string,
): Promise<string | null> {
  const key = TENANT_CACHE_PREFIX + participantId;
  try {
    const cached = await env.KV.get(key);
    if (cached === TENANT_CACHE_MISSING) return null;
    if (cached) return cached;
  } catch {
    /* KV failure → fall through to D1. */
  }
  let tenantId: string | null;
  try {
    const row = await env.DB
      .prepare('SELECT tenant_id FROM participants WHERE id = ?')
      .bind(participantId)
      .first<{ tenant_id: string | null }>();
    if (!row) tenantId = null;
    else tenantId = row.tenant_id || 'default';
  } catch (e) {
    // DB failure here is not a 401 — it's a 500. We throw so authMiddleware
    // can surface it to the error handler.
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Unable to resolve tenant', 500);
  }
  // Populate cache best-effort; don't block on it.
  try {
    await env.KV.put(
      key,
      tenantId ?? TENANT_CACHE_MISSING,
      { expirationTtl: TENANT_CACHE_TTL_SECONDS },
    );
  } catch { /* soft */ }
  return tenantId;
}

/**
 * Drop the cached tenant mapping for a participant. Call from any
 * admin/support mutation that changes tenant_id or suspends/removes the
 * participant. Fire-and-forget — cache populates naturally on the next
 * hit.
 */
export async function invalidateTenantCache(
  env: HonoEnv['Bindings'],
  participantId: string,
): Promise<void> {
  try { await env.KV.delete(TENANT_CACHE_PREFIX + participantId); } catch { /* soft */ }
}

// Auth middleware - must be used after KV binding check
export async function authMiddleware(c: Context<HonoEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  // Accept Bearer header OR the oe_access httpOnly cookie set on login
  const token = (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null)
    ?? getCookie(c, 'oe_access')
    ?? null;

  if (!token) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing or invalid Authorization header', 401);
  }

  const payload = await verifyToken(token, c.env);
  
  if (!payload) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid or expired token', 401);
  }
  
  // Look up tenant_id for isolation enforcement.
  //
  // COST: the authMiddleware fires on every authenticated request, so a
  // single D1 SELECT here was previously the top-single source of D1
  // queries on the platform. We cache the (participant_id → tenant_id)
  // mapping in KV with a 120 s TTL. Tenant moves a participant ≤ once
  // per lifecycle event, so 120 s staleness is acceptable and we tombstone
  // by calling `invalidateTenantCache()` when a participant is moved
  // (admin UIs already call that helper on the update paths).
  //
  // Fail-closed contract is preserved: if the KV miss AND the DB lookup
  // both fail (or the participant no longer exists) we raise 401 — we
  // never silently use 'default'.
  const tenantId = await resolveTenantIdCached(c.env, payload.sub);
  if (tenantId === null) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Account no longer exists', 401);
  }

  // Set auth context
  c.set('auth', {
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name,
      tenant_id: tenantId,
    },
  });

  await next();
}

// Optional auth - doesn't fail if no token, just sets context
export async function optionalAuth(c: Context<HonoEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  const rawToken = (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null)
    ?? getCookie(c, 'oe_access')
    ?? null;

  if (rawToken) {
    try {
      const payload = await verifyToken(rawToken, c.env);
      if (payload) {
        const tenantId = await resolveTenantIdCached(c.env, payload.sub);
        if (tenantId !== null) {
          c.set('auth', {
            user: {
              id: payload.sub,
              email: payload.email,
              role: payload.role,
              name: payload.name,
              tenant_id: tenantId,
            },
          });
        }
      }
    } catch {
      /* soft — leave anonymous */
    }
  }
  
  await next();
}

// Require specific role(s)
export function requireRole(...allowedRoles: string[]) {
  return async (c: Context<HonoEnv>, next: Next) => {
    const auth = c.get('auth');
    
    if (!auth?.user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
    }
    
    if (!allowedRoles.includes(auth.user.role) && auth.user.role !== 'admin') {
      throw new AppError(ErrorCode.FORBIDDEN, `Requires one of: ${allowedRoles.join(', ')}`, 403);
    }
    
    await next();
  };
}

// Check if user owns resource or is admin
export function requireOwnerOrAdmin(getOwnerId: (env: HonoEnv['Bindings'], entityId: string) => Promise<string | null>) {
  return async (c: Context<HonoEnv>, next: Next) => {
    const auth = c.get('auth');
    
    if (!auth?.user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
    }
    
    const entityId = c.req.param('id');
    
    if (!entityId) {
      await next();
      return;
    }
    
    const ownerId = await getOwnerId(c.env, entityId);
    
    if (ownerId && ownerId !== auth.user.id && auth.user.role !== 'admin') {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have access to this resource', 403);
    }
    
    await next();
  };
}

// Get current user from context
export function getCurrentUser(c: Context<HonoEnv>) {
  const auth = c.get('auth');
  if (!auth?.user) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
  }
  return auth.user;
}

// Generate OTP code — crypto.getRandomValues() replaces Math.random() (V8 xorshift128+ is predictable)
export function generateOTP(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (100000 + (buf[0] % 900000)).toString();
}

// Password hashing — PBKDF2 over Web Crypto (Workers-native, no node_compat needed).
// Stored format: `pbkdf2$sha256$<iterations>$<saltB64>$<hashB64>`.
// Legacy bcrypt hashes ($2a$...) are still accepted for backward compat.
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, keyLen: number): Promise<Uint8Array> {
  const keyMat = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMat,
    keyLen * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${b64encode(salt)}$${b64encode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    if (parts.length !== 5 || parts[1] !== 'sha256') return false;
    const iterations = parseInt(parts[2], 10);
    const salt = b64decode(parts[3]);
    const expected = b64decode(parts[4]);
    const actual = await pbkdf2(password, salt, iterations, expected.length);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  }
  // Legacy bcrypt fallback (only used if seed wasn't re-applied)
  if (stored.startsWith('$2')) {
    try {
      const bcrypt = await import('bcryptjs');
      return await bcrypt.compare(password, stored);
    } catch {
      return false;
    }
  }
  return false;
}

// Refresh token
export async function refreshToken(c: Context<HonoEnv>) {
  const auth = c.get('auth');
  
  if (!auth?.user) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
  }
  
  return signToken({
    sub: auth.user.id,
    email: auth.user.email,
    role: auth.user.role,
    name: auth.user.name,
  }, c.env);
}