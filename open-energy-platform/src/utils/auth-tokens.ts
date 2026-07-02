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

// Per-environment access-token TTL override. The demo env (oe) sets
// ACCESS_TOKEN_TTL_SECONDS in wrangler.toml [vars] because its nightly browser
// suite runs ~4h against demo personas and 1h tokens expire mid-run (the #1
// cause of late-suite login-page failures). The live env (cec) does NOT set
// the var and keeps the 1h default. Clamped so a bad var can't mint
// eternal tokens.
export function accessTokenTtlSeconds(env: { ACCESS_TOKEN_TTL_SECONDS?: string }): number {
  const raw = Number(env?.ACCESS_TOKEN_TTL_SECONDS);
  if (!Number.isFinite(raw)) return ACCESS_TOKEN_EXPIRY_SECONDS;
  return Math.min(24 * 3600, Math.max(ACCESS_TOKEN_EXPIRY_SECONDS, Math.floor(raw)));
}

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

  // Atomic rotation: the UPDATE only matches a row whose refresh hash is the
  // one we looked up AND which has not been revoked/rotated in the meantime.
  // Under a concurrent refresh race, exactly one caller gets changes>0; the
  // other gets changes===0 — that second caller is either a legit user whose
  // token was just rotated by their other tab, or an attacker replaying a
  // stolen refresh token. Either way, treat it as a replay signal and
  // revoke the whole session family for that participant (we don't track a
  // per-token family_id, so participant-wide revocation is the practical
  // containment — it forces a full re-login, which is the right move when a
  // refresh token is being used twice).
  const res = await db
    .prepare(
      `UPDATE sessions
         SET access_jti = ?, refresh_token_hash = ?, expires_at = ?, refresh_expires_at = ?, last_used_at = ?
         WHERE refresh_token_hash = ? AND revoked_at IS NULL`
    )
    .bind(newAccessJti, newRefreshHash, accessExpires.toISOString(), refreshExpires.toISOString(), now.toISOString(), refreshHash)
    .run();
  if ((res.meta?.changes ?? 0) === 0) {
    // Someone else rotated or revoked this token between our SELECT and UPDATE.
    // Contain the compromise: revoke every active session for this participant.
    await revokeAllSessionsForParticipant(db, row.participant_id, 'replay_detected');
    return null;
  }

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

/**
 * Composite lockout: a login is blocked when EITHER the email dimension OR the
 * IP dimension has >= LOCKOUT_THRESHOLD failures in the window. Keying only on
 * email let an attacker force-lock any account (DoS) by submitting bad
 * passwords for it; keying only on IP let a credential-stuffer rotate IPs to
 * evade the threshold. The composite keys both: an attacker driving lockout
 * on a victim email trips the email dimension (intended — protect the victim),
 * while a distributed credential-stuffing attack against many accounts from
 * one IP trips the IP dimension. ip may be null (then the IP dimension is
 * skipped — a missing IP cannot be used to evade, only to relax the IP bucket).
 */
export async function isLockedOut(db: D1Database, email: string, ip?: string | null): Promise<{ locked: boolean; retryAfterSeconds: number; attempts: number }> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000).toISOString();
  const emailRow = await db
    .prepare(
      `SELECT COUNT(*) AS n, MAX(attempted_at) AS last_failed
       FROM login_attempts
       WHERE email = ? AND succeeded = 0 AND attempted_at >= ?`
    )
    .bind(email.toLowerCase(), since)
    .first<{ n: number; last_failed: string | null }>();
  const emailN = Number(emailRow?.n || 0);
  let ipN = 0;
  let ipLast: string | null = null;
  if (ip) {
    const ipRow = await db
      .prepare(
        `SELECT COUNT(*) AS n, MAX(attempted_at) AS last_failed
         FROM login_attempts
         WHERE ip = ? AND succeeded = 0 AND attempted_at >= ?`
      )
      .bind(ip, since)
      .first<{ n: number; last_failed: string | null }>();
    ipN = Number(ipRow?.n || 0);
    ipLast = ipRow?.last_failed ?? null;
  }
  // Lock if either dimension crosses the threshold.
  const lockedByEmail = emailN >= LOCKOUT_THRESHOLD;
  const lockedByIp = ipN >= LOCKOUT_THRESHOLD;
  if (!lockedByEmail && !lockedByIp) {
    return { locked: false, retryAfterSeconds: 0, attempts: Math.max(emailN, ipN) };
  }
  // Use whichever dimension tripped to compute the unlock instant. If both
  // tripped, the most recent failure governs (longest remaining lock).
  const emailLast = emailRow?.last_failed ?? null;
  const candidates = [emailLast, ipLast]
    .filter((t): t is string => t != null)
    .map((t) => new Date(t).getTime());
  const lastFailed = candidates.length ? Math.max(...candidates) : Date.now();
  const unlockAt = lastFailed + LOCKOUT_DURATION_MINUTES * 60_000;
  const remainingMs = unlockAt - Date.now();
  if (remainingMs <= 0) return { locked: false, retryAfterSeconds: 0, attempts: Math.max(emailN, ipN) };
  return { locked: true, retryAfterSeconds: Math.ceil(remainingMs / 1000), attempts: Math.max(emailN, ipN) };
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
