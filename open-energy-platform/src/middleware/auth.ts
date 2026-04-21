// ═══════════════════════════════════════════════════════════════════════════
// JWT Authentication Middleware for Open Energy Platform
// ═══════════════════════════════════════════════════════════════════════════

import { Context, Next } from 'hono';
import { HonoEnv } from '../utils/types';
import { AppError, ErrorCode } from '../utils/types';
import type { JWTPayload } from '../utils/types';

const JWT_ALGORITHM = 'HS256';
const TOKEN_EXPIRY_HOURS = 24;

export async function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + (TOKEN_EXPIRY_HOURS * 60 * 60);
  
  const header = base64UrlEncode(JSON.stringify({ alg: JWT_ALGORITHM, typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: now, exp: expires }));
  const signature = base64UrlEncode(await signWithHMAC(`${header}.${body}`, secret));
  
  return `${header}.${body}.${signature}`;
}

export async function verifyToken(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, body, signature] = parts;
    
    // Verify signature
    const expectedSig = base64UrlEncode(await signWithHMAC(`${header}.${body}`, secret));
    if (signature !== expectedSig) return null;
    
    // Parse and check expiry
    const payload: JWTPayload = JSON.parse(atob(body));
    const now = Math.floor(Date.now() / 1000);
    
    if (payload.exp < now) return null;
    
    return payload;
  } catch {
    return null;
  }
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
  
  // Set auth context
  c.set('auth', {
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name,
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
        c.set('auth', {
          user: {
            id: payload.sub,
            email: payload.email,
            role: payload.role,
            name: payload.name,
          },
        });
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

// Hash password using bcrypt
export async function hashPassword(password: string): Promise<string> {
  // Using bcryptjs for compatibility with Cloudflare Workers
  // In production, use Web Crypto API for better performance
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 12);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hash);
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