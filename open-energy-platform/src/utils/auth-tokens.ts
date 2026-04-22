// Helpers for session creation / rotation, password-reset tokens,
// email-verification tokens, and login-attempt lockout.

import type { HonoEnv } from './types';

const ACCESS_TTL_MINUTES = 60;            // 1h access token
const REFRESH_TTL_DAYS = 30;              // 30-day refresh
const RESET_TTL_MINUTES = 60;
const VERIFY_TTL_HOURS = 24;
const LOCKOUT_WINDOW_MINUTES = 15;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MINUTES = 15;

export const ACCESS_TOKEN_EXPIRY_SECONDS = ACCESS_TTL_MINUTES * 60;

export function randomId(prefix = ''): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
  return prefix + hex;
}

export function randomOpaqueToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- SESSIONS ----------

export interface CreateSessionArgs {
  db: D1Database;
  participantId: string;
  accessJti: string;
  userAgent?: string | null;
  ip?: string | null;
}

export interface SessionRecord {
  sessionId: string;
  refreshToken: string;
  refreshExpiresAtIso: string;
  accessExpiresAtIso: string;
}

export async function createSession(args: CreateSessionArgs): Promise<SessionRecord> {
  const sessionId = randomId('sess_');
  const refreshToken = randomOpaqueToken(32);
  const refreshHash = await sha256Hex(refreshToken);
  const now = new Date();
  const accessExpires = new Date(now.getTime() + ACCESS_TTL_MINUTES * 60_000);
  const refreshExpires = new Date(now.getTime() + REFRESH_TTL_DAYS * 86_400_000);

  await args.db
    .prepare(
      `INSERT INTO sessions (id, participant_id, access_jti, refresh_token_hash, issued_at, expires_at, refresh_expires_at, last_used_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      sessionId,
      args.participantId,
      args.accessJti,
      refreshHash,
      now.toISOString(),
      accessExpires.toISOString(),
      refreshExpires.toISOString(),
      now.toISOString(),
      args.userAgent || null,
      args.ip || null
    )
    .run();

  return {
    sessionId,
    refreshToken,
    refreshExpiresAtIso: refreshExpires.toISOString(),
    accessExpiresAtIso: accessExpires.toISOString(),
  };
}

export async function rotateSession(db: D1Database, refreshToken: string, newAccessJti: string): Promise<{ sessionId: string; participantId: string; newRefreshToken: string; refreshExpiresAtIso: string } | null> {
  const refreshHash = await sha256Hex(refreshToken);
  const row = await db
    .prepare(
      `SELECT id, participant_id, refresh_expires_at, revoked_at
       FROM sessions WHERE refresh_token_hash = ?`
    )
    .bind(refreshHash)
    .first<{ id: string; participant_id: string; refresh_expires_at: string; revoked_at: string | null }>();
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.refresh_expires_at) < new Date()) return null;

  const newRefresh = randomOpaqueToken(32);
  const newRefreshHash = await sha256Hex(newRefresh);
  const now = new Date();
  const accessExpires = new Date(now.getTime() + ACCESS_TTL_MINUTES * 60_000);
  const refreshExpires = new Date(now.getTime() + REFRESH_TTL_DAYS * 86_400_000);

  await db
    .prepare(
      `UPDATE sessions
         SET access_jti = ?, refresh_token_hash = ?, expires_at = ?, refresh_expires_at = ?, last_used_at = ?
         WHERE id = ?`
    )
    .bind(newAccessJti, newRefreshHash, accessExpires.toISOString(), refreshExpires.toISOString(), now.toISOString(), row.id)
    .run();

  return {
    sessionId: row.id,
    participantId: row.participant_id,
    newRefreshToken: newRefresh,
    refreshExpiresAtIso: refreshExpires.toISOString(),
  };
}

export async function revokeSessionByRefresh(db: D1Database, refreshToken: string, reason = 'user_logout'): Promise<boolean> {
  const refreshHash = await sha256Hex(refreshToken);
  const res = await db
    .prepare(`UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE refresh_token_hash = ? AND revoked_at IS NULL`)
    .bind(new Date().toISOString(), reason, refreshHash)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function revokeAllSessionsForParticipant(db: D1Database, participantId: string, reason = 'password_changed'): Promise<void> {
  await db
    .prepare(`UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE participant_id = ? AND revoked_at IS NULL`)
    .bind(new Date().toISOString(), reason, participantId)
    .run();
}

// ---------- PASSWORD RESET TOKENS ----------

export async function createPasswordResetToken(db: D1Database, participantId: string, requestedIp: string | null): Promise<string> {
  const raw = randomOpaqueToken(32);
  const hash = await sha256Hex(raw);
  const expires = new Date(Date.now() + RESET_TTL_MINUTES * 60_000).toISOString();
  await db
    .prepare(
      `INSERT INTO password_reset_tokens (id, participant_id, token_hash, expires_at, requested_ip)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(randomId('prt_'), participantId, hash, expires, requestedIp)
    .run();
  return raw;
}

export async function consumePasswordResetToken(db: D1Database, rawToken: string): Promise<string | null> {
  const hash = await sha256Hex(rawToken);
  const row = await db
    .prepare(
      `SELECT id, participant_id, expires_at, used_at
       FROM password_reset_tokens WHERE token_hash = ?`
    )
    .bind(hash)
    .first<{ id: string; participant_id: string; expires_at: string; used_at: string | null }>();
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at) < new Date()) return null;

  await db
    .prepare(`UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), row.id)
    .run();
  return row.participant_id;
}

// ---------- EMAIL VERIFICATION TOKENS ----------

export async function createEmailVerificationToken(db: D1Database, participantId: string): Promise<string> {
  const raw = randomOpaqueToken(32);
  const hash = await sha256Hex(raw);
  const expires = new Date(Date.now() + VERIFY_TTL_HOURS * 3_600_000).toISOString();
  await db
    .prepare(`INSERT INTO email_verification_tokens (id, participant_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(randomId('evt_'), participantId, hash, expires)
    .run();
  return raw;
}

export async function consumeEmailVerificationToken(db: D1Database, rawToken: string): Promise<string | null> {
  const hash = await sha256Hex(rawToken);
  const row = await db
    .prepare(`SELECT id, participant_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = ?`)
    .bind(hash)
    .first<{ id: string; participant_id: string; expires_at: string; used_at: string | null }>();
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at) < new Date()) return null;
  await db.prepare(`UPDATE email_verification_tokens SET used_at = ? WHERE id = ?`).bind(new Date().toISOString(), row.id).run();
  return row.participant_id;
}

// ---------- LOGIN ATTEMPT LOCKOUT ----------

export async function recordLoginAttempt(db: D1Database, email: string, ip: string | null, succeeded: boolean, reason?: string): Promise<void> {
  await db
    .prepare(`INSERT INTO login_attempts (id, email, ip, succeeded, reason) VALUES (?, ?, ?, ?, ?)`)
    .bind(randomId('la_'), email.toLowerCase(), ip, succeeded ? 1 : 0, reason || null)
    .run();
}

export async function isLockedOut(db: D1Database, email: string): Promise<{ locked: boolean; retryAfterSeconds: number; attempts: number }> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000).toISOString();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n, MAX(attempted_at) AS last_failed
       FROM login_attempts
       WHERE email = ? AND succeeded = 0 AND attempted_at >= ?`
    )
    .bind(email.toLowerCase(), since)
    .first<{ n: number; last_failed: string | null }>();
  const n = Number(row?.n || 0);
  if (n < LOCKOUT_THRESHOLD) return { locked: false, retryAfterSeconds: 0, attempts: n };
  const lastFailed = row?.last_failed ? new Date(row.last_failed).getTime() : Date.now();
  const unlockAt = lastFailed + LOCKOUT_DURATION_MINUTES * 60_000;
  const remainingMs = unlockAt - Date.now();
  if (remainingMs <= 0) return { locked: false, retryAfterSeconds: 0, attempts: n };
  return { locked: true, retryAfterSeconds: Math.ceil(remainingMs / 1000), attempts: n };
}

// Retained for tests / callers wanting to introspect config.
export const authConfig = {
  accessTtlMinutes: ACCESS_TTL_MINUTES,
  refreshTtlDays: REFRESH_TTL_DAYS,
  resetTtlMinutes: RESET_TTL_MINUTES,
  verifyTtlHours: VERIFY_TTL_HOURS,
  lockoutThreshold: LOCKOUT_THRESHOLD,
  lockoutWindowMinutes: LOCKOUT_WINDOW_MINUTES,
  lockoutDurationMinutes: LOCKOUT_DURATION_MINUTES,
};

// Narrow unused-import stub for HonoEnv; keeping export surface tidy.
export type _Unused = HonoEnv;
