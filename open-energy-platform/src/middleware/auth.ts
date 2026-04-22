// ═══════════════════════════════════════════════════════════════════════════
// JWT Authentication Middleware for Open Energy Platform
// ═══════════════════════════════════════════════════════════════════════════

import { Context, Next } from 'hono';
import { HonoEnv } from '../utils/types';
import { AppError, ErrorCode } from '../utils/types';
import type { JWTPayload } from '../utils/types';

const JWT_ALGORITHM = 'HS256';
const DEFAULT_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60;

export async function signToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  opts: { expiresInSeconds?: number } = {}
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + (opts.expiresInSeconds ?? DEFAULT_TOKEN_EXPIRY_SECONDS);

  const header = base64UrlEncodeStr(JSON.stringify({ alg: JWT_ALGORITHM, typ: 'JWT' }));
  const body = base64UrlEncodeStr(JSON.stringify({ ...payload, iat: now, exp: expires }));
  const sig = await signWithHMAC(`${header}.${body}`, secret);
  const signature = base64UrlEncodeBytes(new Uint8Array(sig));

  return `${header}.${body}.${signature}`;
}

export async function verifyToken(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;

    // Verify signature
    const sig = await signWithHMAC(`${header}.${body}`, secret);
    const expectedSig = base64UrlEncodeBytes(new Uint8Array(sig));
    if (signature !== expectedSig) return null;

    // Parse and check expiry
    const payload: JWTPayload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

function base64UrlEncodeStr(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function signWithHMAC(data: string, secret: string): Promise<ArrayBuffer> {
  const keyData = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', keyData, new TextEncoder().encode(data));
}

// Auth middleware - must be used after KV binding check
export async function authMiddleware(c: Context<HonoEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing or invalid Authorization header', 401);
  }
  
  const token = authHeader.substring(7);
  const secret = c.env.JWT_SECRET;
  
  if (!secret) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'JWT secret not configured', 500);
  }
  
  const payload = await verifyToken(token, secret);
  
  if (!payload) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid or expired token', 401);
  }
  
  // Look up tenant_id for isolation enforcement (single row, indexed PK).
  // Fail closed on DB error — silently defaulting to 'default' on a transient
  // failure would let a tenant-A user bypass cross-tenant checks for the
  // duration of the request.
  let tenantId: string;
  try {
    const row = await c.env.DB.prepare('SELECT tenant_id FROM participants WHERE id = ?')
      .bind(payload.sub)
      .first<{ tenant_id: string | null }>();
    if (!row) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Account no longer exists', 401);
    }
    tenantId = row.tenant_id ?? 'default';
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Unable to resolve tenant', 500);
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
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const secret = c.env.JWT_SECRET;
    
    if (secret) {
      const payload = await verifyToken(token, secret);
      if (payload) {
        // Mirror authMiddleware: resolve tenant_id so tenant helpers work under
        // optionalAuth too. If the DB lookup fails or the participant vanished,
        // treat the request as anonymous (consistent with this middleware's
        // non-failing contract).
        try {
          const row = await c.env.DB.prepare('SELECT tenant_id FROM participants WHERE id = ?')
            .bind(payload.sub)
            .first<{ tenant_id: string | null }>();
          if (row) {
            c.set('auth', {
              user: {
                id: payload.sub,
                email: payload.email,
                role: payload.role,
                name: payload.name,
                tenant_id: row.tenant_id ?? 'default',
              },
            });
          }
        } catch {
          // Swallow — optional auth must never block an anonymous request.
        }
      }
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
export function requireOwnerOrAdmin(getOwnerId: (env: HonoEnv, entityId: string) => Promise<string | null>) {
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

// Generate OTP code
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
  
  const secret = c.env.JWT_SECRET;
  return signToken({
    sub: auth.user.id,
    email: auth.user.email,
    role: auth.user.role,
    name: auth.user.name,
  }, secret);
}