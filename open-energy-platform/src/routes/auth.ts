// ═══════════════════════════════════════════════════════════════════════════
// Auth Routes — Register, Login (with brute-force lockout + MFA challenge),
// JWT issuance + refresh-rotation, Password Reset (D1-backed tokens),
// Email Verification (token, not OTP-in-DB), TOTP MFA enroll/verify/disable,
// Session list + revoke.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { HonoEnv } from '../utils/types';
import { RegisterSchema, LoginSchema, ForgotPasswordSchema, ResetPasswordSchema } from '../utils/validation';
import { authMiddleware, getCurrentUser, signToken, hashPassword, verifyPassword } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  accessTokenTtlSeconds,
  createSession,
  rotateSession,
  revokeSessionByRefresh,
  revokeAllSessionsForParticipant,
  createPasswordResetToken,
  consumePasswordResetToken,
  createEmailVerificationToken,
  consumeEmailVerificationToken,
  recordLoginAttempt,
  isLockedOut,
  randomId,
} from '../utils/auth-tokens';
import { randomBase32Secret, otpauthUri, totpVerify, generateBackupCodes } from '../utils/totp';
import { encryptField, decryptField } from '../utils/crypto-aead';
import { sha256Hex } from '../utils/auth-tokens';
import { sendEmail } from '../utils/email';

// Refresh-cookie TTL must match the DB refresh_expires_at (REFRESH_TTL_DAYS,
// 30 days). A shorter cookie silently logged users out on browser restart
// even though their refresh token was still valid server-side; a longer
// cookie than the DB column would leave a dead cookie pinned on the client.
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

// Backup-code at-rest format. Legacy rows stored a plaintext JSON array of
// codes: ["abcd-1234", ...]. New writes store {v:2, hashes:[...]} where each
// entry is sha256Hex(code) — one-way, so a DB dump cannot recover the codes.
// The read path matches against both shapes.
interface StoredBackupCodes { v: 2; hashes: string[] }
function isStoredHashes(v: unknown): v is StoredBackupCodes {
  return typeof v === 'object' && v !== null && (v as any).v === 2 && Array.isArray((v as any).hashes);
}

/** Hash every backup code; return the {v:2, hashes:[...]} envelope to persist. */
async function hashBackupCodesForStore(codes: string[]): Promise<string> {
  const hashes = await Promise.all(codes.map((c) => sha256Hex(c.toLowerCase())));
  return JSON.stringify({ v: 2, hashes } satisfies StoredBackupCodes);
}

/**
 * Find the index of a submitted backup code in the stored envelope (or legacy
 * plaintext array). Returns -1 if not found. Burns-on-success is the caller's
 * job. Normalises both the submitted code and the stored codes to lower case
 * before comparing.
 */
async function findBackupCodeIndex(storedJson: string | null, rawCode: string): Promise<number> {
  if (!storedJson) return -1;
  const parsed = JSON.parse(storedJson) as unknown;
  const norm = rawCode.toLowerCase();
  if (isStoredHashes(parsed)) {
    const hash = await sha256Hex(norm);
    return parsed.hashes.findIndex((h) => h === hash);
  }
  // Legacy plaintext array — codes were stored verbatim pre-hash.
  if (Array.isArray(parsed)) {
    return (parsed as string[]).findIndex((c) => String(c).toLowerCase() === norm);
  }
  return -1;
}

/** Build the stored envelope minus the code at idx (preserves v:2 shape). */
async function remainingBackupCodesForStore(storedJson: string | null, idx: number): Promise<string | null> {
  if (!storedJson) return null;
  const parsed = JSON.parse(storedJson) as unknown;
  if (isStoredHashes(parsed)) {
    const hashes = parsed.hashes.filter((_, i) => i !== idx);
    return JSON.stringify({ v: 2, hashes } satisfies StoredBackupCodes);
  }
  if (Array.isArray(parsed)) {
    // Legacy plaintext — re-write as v:2 hashes so a re-encrypt-on-write
    // migrates the row off plaintext on the next burn.
    const remaining = (parsed as string[]).filter((_, i) => i !== idx);
    return hashBackupCodesForStore(remaining);
  }
  return null;
}

/**
 * Resolve the plaintext TOTP secret from a stored row. New rows store an
 * encrypted `v1:` value (encryptField); legacy rows store the raw base32
 * secret. We try the encrypted path first; if a key is configured and the
 * value has a v1: prefix, decryptField returns the secret. If no key is
 * configured, decryptField throws — but a legacy plaintext secret (no v1:
 * prefix) only ever existed because the gate was closed when it was written,
 * so we fall back to the raw stored value. This keeps existing seeds usable
 * across the encrypt-on-write migration without a flag-day backfill.
 */
async function resolveTotpSecret(env: HonoEnv['Bindings'], stored: string): Promise<string> {
  if (stored.startsWith('v1:')) {
    // Encrypted form — only decryptable with a key. If decrypt fails (no key,
    // tampered, wrong key) the secret is unrecoverable; surface the error.
    return await decryptField(env, stored);
  }
  // Legacy plaintext base32 secret written before encryption existed.
  return stored;
}

const auth = new Hono<HonoEnv>();

const ISSUER = 'Open Energy Exchange';

// Cookies must NOT carry `Secure` over local http dev (wrangler :8787) — the
// browser drops Secure cookies on http, so oe_refresh never lands and the SPA's
// mount-time /auth/refresh 400s on every load (session restore broken). Prod
// terminates TLS at the edge, so c.req.url is https there and this is true.
function cookieSecure(c: { req: { url: string } }): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

function clientIp(c: any): string | null {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null;
}
function userAgent(c: any): string | null {
  return c.req.header('user-agent') || null;
}

// POST /auth/register — Create new participant account + email-verification token
auth.post('/register', async (c) => {
  const body = await c.req.json();
  const validation = RegisterSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ success: false, error: validation.error.errors[0].message }, 400);
  }
  const { email, password, name, company_name, role } = validation.data;

  const existing = await c.env.DB.prepare('SELECT id FROM participants WHERE email = ?').bind(email).first();
  if (existing) return c.json({ success: false, error: 'Email already registered' }, 409);

  const passwordHash = await hashPassword(password);
  const participantId = randomId('id_');
  await c.env.DB.prepare(`
    INSERT INTO participants (id, email, password_hash, name, company_name, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(participantId, email, passwordHash, name, company_name || null, role, new Date().toISOString()).run();

  // Token is generated and persisted in DB, then delivered via the email seam.
  // It is intentionally NOT returned in the response - see comment below.
  const verificationToken = await createEmailVerificationToken(c.env.DB, participantId);

  await fireCascade({
    event: 'auth.registered',
    actor_id: participantId,
    entity_type: 'participants',
    entity_id: participantId,
    data: { email, name, role },
    env: c.env,
  });

  // Deliver the verification link. In dev/test this is a no-op that still
  // records the outbox row; it never throws on a transport failure.
  await sendEmail(c.env, { to: email, template: 'verify', data: { token: verificationToken, name } });

  return c.json({
    success: true,
    data: {
      participant_id: participantId,
      message: 'Account created. A verification link has been dispatched to your email.',
      // In production the token is delivered via email only. If you need to expose it for dev/test, gate it on:
      // `...(c.env.ENVIRONMENT !== 'production' && { verification_token: verificationToken })`
    },
  });
});

// POST /auth/login — Authenticate, challenge for MFA if enrolled, issue access + refresh tokens
auth.post('/login', async (c) => {
  const body = await c.req.json();
  const validation = LoginSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ success: false, error: validation.error.errors[0].message }, 400);
  }
  const { email, password } = validation.data;
  const mfaCode: string | undefined = typeof body?.mfa_code === 'string' ? body.mfa_code : undefined;
  const ip = clientIp(c);

  const lockout = await isLockedOut(c.env.DB, email, ip);
  if (lockout.locked) {
    return c.json({
      success: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(lockout.retryAfterSeconds / 60)} minute(s).`,
      code: 'LOCKED_OUT',
      retry_after_seconds: lockout.retryAfterSeconds,
    }, 429);
  }

  const participant = await c.env.DB.prepare(`
    SELECT id, email, password_hash, name, role, status, email_verified, kyc_status
    FROM participants WHERE email = ?
  `).bind(email).first() as any;

  if (!participant) {
    await recordLoginAttempt(c.env.DB, email, ip, false, 'no_user');
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }
  if (participant.status !== 'active') {
    const reasons: Record<string, string> = {
      suspended: 'Account suspended. Contact support.',
      rejected:  'Account rejected.',
      locked:    'Account locked. Contact support.',
      pending:   'Email verification required before login.',
    };
    const msg = reasons[participant.status] ?? 'Account inactive. Contact support.';
    await recordLoginAttempt(c.env.DB, email, ip, false, participant.status);
    return c.json({ success: false, error: msg }, 403);
  }

  const isValid = await verifyPassword(password, participant.password_hash);
  if (!isValid) {
    await recordLoginAttempt(c.env.DB, email, ip, false, 'bad_password');
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }

  // MFA check — if enrolled and verified, require code
  const mfa = await c.env.DB.prepare(
    `SELECT secret_base32, verified_at FROM mfa_totp_secrets WHERE participant_id = ?`
  ).bind(participant.id).first() as any;
  if (mfa?.verified_at) {
    if (!mfaCode) {
      // Do NOT record this as a failed attempt — the password was valid.
      // Treating the MFA challenge as a failure would lock out MFA-enabled users
      // after 5 normal logins within the 15-minute window.
      return c.json({ success: false, error: 'MFA code required', code: 'MFA_REQUIRED' }, 401);
    }
    const ok = await totpVerify(await resolveTotpSecret(c.env, mfa.secret_base32), mfaCode);
    if (!ok) {
      await recordLoginAttempt(c.env.DB, email, ip, false, 'bad_mfa_code');
      return c.json({ success: false, error: 'Invalid MFA code', code: 'MFA_INVALID' }, 401);
    }
  }

  const accessJti = randomId('jti_');
  const token = await signToken(
    { sub: participant.id, email: participant.email, role: participant.role, name: participant.name, jti: accessJti },
    c.env,
    { expiresInSeconds: accessTokenTtlSeconds(c.env) }
  );
  const session = await createSession({
    db: c.env.DB,
    participantId: participant.id,
    accessJti,
    userAgent: userAgent(c),
    ip,
  });

  await c.env.DB.prepare('UPDATE participants SET last_login = ? WHERE id = ?')
    .bind(new Date().toISOString(), participant.id).run();
  await recordLoginAttempt(c.env.DB, email, ip, true, 'ok');

  await fireCascade({
    event: 'auth.login',
    actor_id: participant.id,
    entity_type: 'participants',
    entity_id: participant.id,
    data: { email, role: participant.role },
    env: c.env,
  });

  // httpOnly cookies — defense-in-depth: XSS cannot read these.
  // oe_access: scoped to /api so all API routes can use it as fallback.
  // oe_refresh: scoped to /api/auth/refresh only (rotation endpoint).
  const cookieOpts = { httpOnly: true, secure: cookieSecure(c), sameSite: 'Strict' as const, path: '/api' };
  setCookie(c, 'oe_access', token, { ...cookieOpts, maxAge: accessTokenTtlSeconds(c.env) });
  setCookie(c, 'oe_refresh', session.refreshToken, {
    ...cookieOpts, path: '/api/auth/refresh',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });

  return c.json({
    success: true,
    data: {
      token,
      expires_in: accessTokenTtlSeconds(c.env),
      refresh_token: session.refreshToken,
      refresh_expires_at: session.refreshExpiresAtIso,
      session_id: session.sessionId,
      participant: {
        id: participant.id,
        email: participant.email,
        name: participant.name,
        role: participant.role,
        email_verified: participant.email_verified,
        kyc_status: participant.kyc_status,
        mfa_enabled: !!mfa?.verified_at,
      },
    },
  });
});

// POST /auth/refresh — Rotate access + refresh tokens
// Accepts refresh_token in JSON body OR the oe_refresh httpOnly cookie.
auth.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const refresh_token = body?.refresh_token ?? getCookie(c, 'oe_refresh');
  if (!refresh_token) return c.json({ success: false, error: 'refresh_token required' }, 400);

  const newAccessJti = randomId('jti_');
  const rot = await rotateSession(c.env.DB, refresh_token, newAccessJti);
  if (!rot) return c.json({ success: false, error: 'Refresh token invalid or expired' }, 401);

  const p = await c.env.DB.prepare(
    `SELECT id, email, role, name FROM participants WHERE id = ?`
  ).bind(rot.participantId).first() as any;
  if (!p) return c.json({ success: false, error: 'Account no longer exists' }, 401);

  const token = await signToken(
    { sub: p.id, email: p.email, role: p.role, name: p.name, jti: newAccessJti },
    c.env,
    { expiresInSeconds: accessTokenTtlSeconds(c.env) }
  );

  const cookieOpts = { httpOnly: true, secure: cookieSecure(c), sameSite: 'Strict' as const, path: '/api' };
  setCookie(c, 'oe_access', token, { ...cookieOpts, maxAge: accessTokenTtlSeconds(c.env) });
  setCookie(c, 'oe_refresh', rot.newRefreshToken, {
    ...cookieOpts, path: '/api/auth/refresh',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });

  return c.json({
    success: true,
    data: {
      token,
      expires_in: accessTokenTtlSeconds(c.env),
      refresh_token: rot.newRefreshToken,
      refresh_expires_at: rot.refreshExpiresAtIso,
      session_id: rot.sessionId,
    },
  });
});

// POST /auth/verify-email — Consume verification token to mark email verified
auth.post('/verify-email', async (c) => {
  const { token } = await c.req.json().catch(() => ({} as any));
  if (!token) return c.json({ success: false, error: 'token required' }, 400);
  const participantId = await consumeEmailVerificationToken(c.env.DB, token);
  if (!participantId) return c.json({ success: false, error: 'Invalid or expired token' }, 400);
  await c.env.DB.prepare(
    `UPDATE participants SET email_verified = 1, status = CASE WHEN status = 'pending' THEN 'active' ELSE status END WHERE id = ?`
  ).bind(participantId).run();
  await fireCascade({
    event: 'auth.email_verified',
    actor_id: participantId,
    entity_type: 'participants',
    entity_id: participantId,
    data: {},
    env: c.env,
  });
  return c.json({ success: true, data: { message: 'Email verified successfully', email_verified: true } });
});

// POST /auth/resend-verification
auth.post('/resend-verification', async (c) => {
  const { email } = await c.req.json().catch(() => ({} as any));
  if (!email) return c.json({ success: false, error: 'email required' }, 400);
  const p = await c.env.DB.prepare('SELECT id, email_verified FROM participants WHERE email = ?').bind(email).first() as any;
  if (!p || p.email_verified) {
    // No enumeration
    return c.json({ success: true, data: { message: 'If the account exists and is unverified, a verification link has been sent' } });
  }
  // Security: never return the verification token in the API response.
  // It would otherwise allow any attacker to verify any unverified email
  // and flip the account to 'active'. Delivered via email provider once wired.
  await createEmailVerificationToken(c.env.DB, p.id);
  return c.json({ success: true, data: { message: 'If the account exists and is unverified, a verification link has been sent' } });
});

// POST /auth/forgot-password — Request password reset (D1-backed token, not KV)
auth.post('/forgot-password', async (c) => {
  const body = await c.req.json();
  const validation = ForgotPasswordSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ success: false, error: validation.error.errors[0].message }, 400);
  }
  const { email } = validation.data;
  const participant = await c.env.DB.prepare('SELECT id FROM participants WHERE email = ?').bind(email).first() as any;

  if (!participant) {
    // Same response regardless to prevent enumeration.
    return c.json({ success: true, data: { message: 'If email exists, reset instructions have been sent' } });
  }

  // Security: NEVER return the reset token in the API response. Doing so
  // would allow any unauthenticated attacker to reset any account's password
  // just by knowing the email. The token is stored server-side and delivered
  // via email once a mail provider is configured. Until then, admins can
  // issue reset links out-of-band via POST /auth/admin/reset-link.
  const resetToken = await createPasswordResetToken(c.env.DB, participant.id, clientIp(c));

  await fireCascade({
    event: 'auth.password_reset',
    actor_id: participant.id,
    entity_type: 'participants',
    entity_id: participant.id,
    data: { email, reason: 'forgot_password' },
    env: c.env,
  });

  await sendEmail(c.env, {
    to: email,
    template: 'reset',
    data: { link: `/reset-password?token=${resetToken}` },
  });

  return c.json({
    success: true,
    data: {
      message: 'If email exists, reset instructions have been sent',
    },
  });
});

// POST /auth/admin/reset-link — Admin-only: generate a one-time reset link for
// a target participant's email. Used until a mail provider is wired.
auth.post('/admin/reset-link', authMiddleware, async (c) => {
  const caller = getCurrentUser(c);
  if (caller.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const body = await c.req.json().catch(() => ({} as any));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return c.json({ success: false, error: 'email required' }, 400);
  const participant = await c.env.DB.prepare(
    'SELECT id FROM participants WHERE email = ?'
  ).bind(email).first() as any;
  if (!participant) return c.json({ success: false, error: 'no_participant' }, 404);
  const token = await createPasswordResetToken(c.env.DB, participant.id, clientIp(c));
  await fireCascade({
    event: 'auth.password_reset',
    actor_id: caller.id,
    entity_type: 'participants',
    entity_id: participant.id,
    data: { email, reason: 'admin_issued_reset_link' },
    env: c.env,
  });
  return c.json({ success: true, data: { reset_token: token } });
});

// POST /auth/reset-password — Consume reset token + set new password
auth.post('/reset-password', async (c) => {
  const body = await c.req.json();
  const validation = ResetPasswordSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ success: false, error: validation.error.errors[0].message }, 400);
  }
  const { token, new_password } = validation.data as any;
  const participantId = await consumePasswordResetToken(c.env.DB, token);
  if (!participantId) return c.json({ success: false, error: 'Invalid or expired reset token' }, 400);

  const newHash = await hashPassword(new_password);
  await c.env.DB.prepare('UPDATE participants SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(newHash, new Date().toISOString(), participantId).run();
  await revokeAllSessionsForParticipant(c.env.DB, participantId, 'password_reset');

  return c.json({ success: true, data: { message: 'Password reset successfully. Please log in with your new password.' } });
});

// ---------- MFA (TOTP) ----------
// POST /auth/mfa/setup — issues a base32 secret + otpauth:// URI; user must confirm with /verify
auth.post('/mfa/setup', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const existing = await c.env.DB.prepare(
    `SELECT verified_at FROM mfa_totp_secrets WHERE participant_id = ?`
  ).bind(user.id).first() as any;
  if (existing?.verified_at) {
    return c.json({ success: false, error: 'MFA already enabled. Disable first to re-enrol.' }, 409);
  }
  const secret = randomBase32Secret(20);
  // Encrypt the base32 secret at rest. When KYC_ENC_KEY is unset this is a
  // plaintext passthrough (dark-by-default) so dev/test enrolment still works;
  // when the key is set the stored value is `v1:<...>` ciphertext. The plain
  // secret is returned to the caller once, here, so the authenticator app can
  // enrol — it is never readable again from the DB.
  const storedSecret = await encryptField(c.env, secret);
  const now = new Date().toISOString();
  if (existing) {
    await c.env.DB.prepare(`UPDATE mfa_totp_secrets SET secret_base32 = ?, verified_at = NULL, backup_codes_json = NULL, updated_at = ? WHERE participant_id = ?`)
      .bind(storedSecret, now, user.id).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO mfa_totp_secrets (participant_id, secret_base32, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .bind(user.id, storedSecret, now, now).run();
  }
  const uri = otpauthUri({ issuer: ISSUER, account: user.email, secret });
  return c.json({ success: true, data: { secret, otpauth_uri: uri } });
});

// POST /auth/mfa/verify — confirms setup with a valid code, issues backup codes
auth.post('/mfa/verify', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const { code } = await c.req.json().catch(() => ({} as any));
  if (!code) return c.json({ success: false, error: 'code required' }, 400);
  const row = await c.env.DB.prepare(
    `SELECT secret_base32, verified_at FROM mfa_totp_secrets WHERE participant_id = ?`
  ).bind(user.id).first() as any;
  if (!row) return c.json({ success: false, error: 'Start MFA setup first' }, 400);
  const ok = await totpVerify(await resolveTotpSecret(c.env, row.secret_base32), code);
  if (!ok) return c.json({ success: false, error: 'Invalid code' }, 400);
  const backups = generateBackupCodes(10);
  // Store one-way hashes of the backup codes (never the plaintext codes). The
  // plaintext codes are returned to the user exactly once, here; subsequent
  // logins hash the submitted code and compare. A DB dump cannot recover
  // usable backup codes.
  const storedBackupJson = await hashBackupCodesForStore(backups);
  await c.env.DB.prepare(
    `UPDATE mfa_totp_secrets SET verified_at = ?, backup_codes_json = ?, updated_at = ? WHERE participant_id = ?`
  ).bind(new Date().toISOString(), storedBackupJson, new Date().toISOString(), user.id).run();
  return c.json({ success: true, data: { enabled: true, backup_codes: backups } });
});

// POST /auth/mfa/backup-code — full login using a one-time backup code when TOTP device unavailable.
// Accepts the same credentials as /login but substitutes the 8-hex backup code for the TOTP code.
// The used code is burned on success; the remaining codes stay valid.
auth.post('/mfa/backup-code', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const validation = LoginSchema.safeParse(body);
  if (!validation.success) return c.json({ success: false, error: validation.error.errors[0].message }, 400);

  const { email, password } = validation.data;
  const rawCode: string | undefined = typeof body?.backup_code === 'string' ? body.backup_code.trim().toLowerCase().replace(/[^0-9a-f-]/g, '') : undefined;
  if (!rawCode) return c.json({ success: false, error: 'backup_code required' }, 400);

  const ip = clientIp(c);
  const lockout = await isLockedOut(c.env.DB, email, ip);
  if (lockout.locked) {
    return c.json({
      success: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(lockout.retryAfterSeconds / 60)} minute(s).`,
      code: 'LOCKED_OUT',
      retry_after_seconds: lockout.retryAfterSeconds,
    }, 429);
  }

  const participant = await c.env.DB.prepare(
    `SELECT id, email, password_hash, name, role, status FROM participants WHERE email = ?`
  ).bind(email).first() as any;

  if (!participant) {
    await recordLoginAttempt(c.env.DB, email, ip, false, 'no_user');
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }
  if (participant.status !== 'active') {
    await recordLoginAttempt(c.env.DB, email, ip, false, participant.status);
    return c.json({ success: false, error: 'Account inactive. Contact support.' }, 403);
  }
  if (!(await verifyPassword(password, participant.password_hash))) {
    await recordLoginAttempt(c.env.DB, email, ip, false, 'bad_password');
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }

  const mfa = await c.env.DB.prepare(
    `SELECT verified_at, backup_codes_json FROM mfa_totp_secrets WHERE participant_id = ?`
  ).bind(participant.id).first() as any;

  if (!mfa?.verified_at) {
    return c.json({ success: false, error: 'MFA not enrolled — use regular login' }, 400);
  }

  // Match the submitted backup code against the stored envelope. New rows
  // store {v:2, hashes:[...]}; legacy rows stored a plaintext JSON array —
  // findBackupCodeIndex handles both so existing enrolments keep working.
  const idx = await findBackupCodeIndex(mfa.backup_codes_json, rawCode);
  if (idx === -1) {
    await recordLoginAttempt(c.env.DB, email, ip, false, 'bad_backup_code');
    return c.json({ success: false, error: 'Invalid backup code', code: 'BACKUP_INVALID' }, 401);
  }

  // Burn the used code before issuing tokens — prevents replay if token
  // issuance fails mid-flight. remainingBackupCodesForStore re-writes legacy
  // plaintext arrays as v:2 hashes on the burn, migrating the row off
  // plaintext the first time a legacy code is consumed.
  const remainingJson = await remainingBackupCodesForStore(mfa.backup_codes_json, idx);
  await c.env.DB.prepare(
    `UPDATE mfa_totp_secrets SET backup_codes_json = ?, updated_at = ? WHERE participant_id = ?`
  ).bind(remainingJson, new Date().toISOString(), participant.id).run();
  const remainingCount = (() => {
    const p = JSON.parse(remainingJson || '[]') as unknown;
    if (isStoredHashes(p)) return p.hashes.length;
    if (Array.isArray(p)) return p.length;
    return 0;
  })();

  const accessJti = randomId('jti_');
  const token = await signToken(
    { sub: participant.id, email: participant.email, role: participant.role, name: participant.name, jti: accessJti },
    c.env,
    { expiresInSeconds: accessTokenTtlSeconds(c.env) }
  );
  const session = await createSession({
    db: c.env.DB,
    participantId: participant.id,
    accessJti,
    userAgent: (c.req.header('user-agent') || null) as string | null,
    ip,
  });

  await c.env.DB.prepare('UPDATE participants SET last_login = ? WHERE id = ?')
    .bind(new Date().toISOString(), participant.id).run();
  await recordLoginAttempt(c.env.DB, email, ip, true, 'backup_code');

  const cookieOpts = { httpOnly: true, secure: cookieSecure(c), sameSite: 'Strict' as const, path: '/api' };
  setCookie(c, 'oe_access', token, { ...cookieOpts, maxAge: accessTokenTtlSeconds(c.env) });
  setCookie(c, 'oe_refresh', session.refreshToken, { ...cookieOpts, path: '/api/auth/refresh', maxAge: REFRESH_COOKIE_MAX_AGE });

  return c.json({
    success: true,
    data: {
      token,
      expires_in: accessTokenTtlSeconds(c.env),
      refresh_token: session.refreshToken,
      session_id: session.sessionId,
      backup_codes_remaining: remainingCount,
      participant: {
        id: participant.id, email: participant.email, name: participant.name,
        role: participant.role, mfa_enabled: true,
      },
    },
  });
});

// POST /auth/mfa/disable — requires current password
auth.post('/mfa/disable', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const { current_password } = await c.req.json().catch(() => ({} as any));
  if (!current_password) return c.json({ success: false, error: 'current_password required' }, 400);
  const p = await c.env.DB.prepare('SELECT password_hash FROM participants WHERE id = ?').bind(user.id).first() as any;
  if (!p || !(await verifyPassword(current_password, p.password_hash))) {
    return c.json({ success: false, error: 'Current password incorrect' }, 401);
  }
  await c.env.DB.prepare(`DELETE FROM mfa_totp_secrets WHERE participant_id = ?`).bind(user.id).run();
  return c.json({ success: true, data: { disabled: true } });
});

// ---------- SESSIONS ----------
// GET /auth/sessions — list own active sessions
auth.get('/sessions', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const rows = await c.env.DB.prepare(
    `SELECT id, issued_at, expires_at, last_used_at, user_agent, ip, revoked_at, revoked_reason
     FROM sessions WHERE participant_id = ? ORDER BY issued_at DESC LIMIT 50`
  ).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

// POST /auth/sessions/:id/revoke — revoke a specific session (own only)
auth.post('/sessions/:id/revoke', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT participant_id, revoked_at FROM sessions WHERE id = ?`).bind(id).first() as any;
  if (!row) return c.json({ success: false, error: 'Session not found' }, 404);
  if (row.participant_id !== user.id) return c.json({ success: false, error: 'Cannot revoke another user\'s session' }, 403);
  if (row.revoked_at) return c.json({ success: true, data: { message: 'Already revoked' } });
  await c.env.DB.prepare(`UPDATE sessions SET revoked_at = ?, revoked_reason = 'user_revoked' WHERE id = ?`)
    .bind(new Date().toISOString(), id).run();
  return c.json({ success: true, data: { revoked: true } });
});

// GET /auth/me
auth.get('/me', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const participant = await c.env.DB.prepare(`
    SELECT id, email, name, company_name, role, status, kyc_status, bbbee_level,
           subscription_tier, email_verified, last_login, onboarding_completed, created_at
    FROM participants WHERE id = ?
  `).bind(user.id).first();
  if (!participant) return c.json({ success: false, error: 'Participant not found' }, 404);
  const mfa = await c.env.DB.prepare(`SELECT verified_at FROM mfa_totp_secrets WHERE participant_id = ?`)
    .bind(user.id).first() as any;
  const modules = await c.env.DB.prepare(`
    SELECT m.module_key, m.display_name FROM modules m
    WHERE m.enabled = 1 AND (m.required_role IS NULL OR m.required_role = ?)
  `).bind(user.role).all();
  return c.json({
    success: true,
    data: {
      ...participant,
      mfa_enabled: !!mfa?.verified_at,
      enabled_modules: modules.results?.map((m: any) => m.module_key) || [],
    },
  });
});

// PUT /auth/profile
auth.put('/profile', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();
  const { name, company_name } = body;
  await c.env.DB.prepare(`
    UPDATE participants SET name = COALESCE(?, name), company_name = COALESCE(?, company_name), updated_at = ?
    WHERE id = ?
  `).bind(name, company_name, new Date().toISOString(), user.id).run();
  return c.json({ success: true, data: { message: 'Profile updated' } });
});

// GET /auth/preferences — participant_preferences row (notifications, locale, …)
auth.get('/preferences', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  let row = await c.env.DB
    .prepare('SELECT * FROM participant_preferences WHERE participant_id = ?')
    .bind(user.id)
    .first() as any;
  if (!row) {
    // Seed defaults on first read so PUT can use a straight UPDATE path.
    await c.env.DB
      .prepare(`INSERT INTO participant_preferences (participant_id, updated_at) VALUES (?, ?)`) 
      .bind(user.id, new Date().toISOString())
      .run();
    row = await c.env.DB
      .prepare('SELECT * FROM participant_preferences WHERE participant_id = ?')
      .bind(user.id)
      .first();
  }
  return c.json({ success: true, data: row });
});

// PUT /auth/preferences — partial update of a participant_preferences row.
auth.put('/preferences', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();
  // Whitelist the editable columns to prevent writing arbitrary keys.
  const allowed = [
    'notify_email_contracts',
    'notify_email_settlement',
    'notify_email_covenants',
    'notify_email_lois',
    'notify_in_app',
    'locale',
    'currency',
    'timezone',
    'date_format',
    'dashboard_layout',
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return c.json({ success: false, error: 'No valid preference keys supplied' }, 400);
  }
  const has = await c.env.DB
    .prepare('SELECT 1 FROM participant_preferences WHERE participant_id = ?')
    .bind(user.id)
    .first();
  const cols = Object.keys(patch);
  const placeholders = cols.map((c) => `${c} = ?`).join(', ');
  const values = cols.map((c) => patch[c]);
  if (!has) {
    const colList = ['participant_id', ...cols, 'updated_at'].join(', ');
    const vals = ['?', ...cols.map(() => '?'), '?'].join(', ');
    await c.env.DB
      .prepare(`INSERT INTO participant_preferences (${colList}) VALUES (${vals})`)
      .bind(user.id, ...(values as (string | number)[]), new Date().toISOString())
      .run();
  } else {
    await c.env.DB
      .prepare(`UPDATE participant_preferences SET ${placeholders}, updated_at = ? WHERE participant_id = ?`)
      .bind(...(values as (string | number)[]), new Date().toISOString(), user.id)
      .run();
  }
  const row = await c.env.DB
    .prepare('SELECT * FROM participant_preferences WHERE participant_id = ?')
    .bind(user.id)
    .first();
  return c.json({ success: true, data: row });
});

// POST /auth/change-password — requires current password; revokes all sessions
auth.post('/change-password', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();
  const { current_password, new_password } = body;
  if (!current_password || !new_password) return c.json({ success: false, error: 'Current and new password required' }, 400);
  if (new_password.length < 8) return c.json({ success: false, error: 'New password must be at least 8 characters' }, 400);
  if (new_password.length > 128) return c.json({ success: false, error: 'Password must be at most 128 characters' }, 400);
  const p = await c.env.DB.prepare('SELECT password_hash FROM participants WHERE id = ?').bind(user.id).first() as any;
  if (!p) return c.json({ success: false, error: 'Participant not found' }, 404);
  if (!(await verifyPassword(current_password, p.password_hash))) {
    return c.json({ success: false, error: 'Current password incorrect' }, 401);
  }
  const newHash = await hashPassword(new_password);
  await c.env.DB.prepare('UPDATE participants SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(newHash, new Date().toISOString(), user.id).run();
  await revokeAllSessionsForParticipant(c.env.DB, user.id, 'password_changed');
  return c.json({ success: true, data: { message: 'Password changed successfully. Please log in again on all devices.' } });
});

// POST /auth/logout — revoke refresh (if provided) and log
auth.post('/logout', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const rt = body?.refresh_token ?? getCookie(c, 'oe_refresh');
  if (rt) {
    await revokeSessionByRefresh(c.env.DB, rt, 'user_logout');
  }
  // Clear both auth cookies
  deleteCookie(c, 'oe_access', { path: '/api' });
  deleteCookie(c, 'oe_refresh', { path: '/api/auth/refresh' });
  await fireCascade({
    event: 'auth.logout',
    actor_id: user.id,
    entity_type: 'participants',
    entity_id: user.id,
    data: { email: user.email },
    env: c.env,
  });
  return c.json({ success: true, data: { message: 'Logged out' } });
});

export default auth;
