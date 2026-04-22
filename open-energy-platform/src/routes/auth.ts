// ═══════════════════════════════════════════════════════════════════════════
// Auth Routes — Register, Login (with brute-force lockout + MFA challenge),
// JWT issuance + refresh-rotation, Password Reset (D1-backed tokens),
// Email Verification (token, not OTP-in-DB), TOTP MFA enroll/verify/disable,
// Session list + revoke.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { RegisterSchema, LoginSchema, ForgotPasswordSchema, ResetPasswordSchema } from '../utils/validation';
import { authMiddleware, getCurrentUser, signToken, hashPassword, verifyPassword } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  ACCESS_TOKEN_EXPIRY_SECONDS,
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

const auth = new Hono<HonoEnv>();

const ISSUER = 'Open Energy Exchange';

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

  const verificationToken = await createEmailVerificationToken(c.env.DB, participantId);

  await fireCascade({
    event: 'auth.registered',
    actor_id: participantId,
    entity_type: 'participants',
    entity_id: participantId,
    data: { email, name, role },
    env: c.env,
  });

  return c.json({
    success: true,
    data: {
      participant_id: participantId,
      message: 'Account created. A verification link has been dispatched to your email.',
      // Until a mail provider is configured, surface the token for developer/admin use.
      verification_token: verificationToken,
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

  const lockout = await isLockedOut(c.env.DB, email);
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
  if (participant.status === 'suspended') {
    await recordLoginAttempt(c.env.DB, email, ip, false, 'suspended');
    return c.json({ success: false, error: 'Account suspended. Contact support.' }, 403);
  }
  if (participant.status === 'rejected') {
    await recordLoginAttempt(c.env.DB, email, ip, false, 'rejected');
    return c.json({ success: false, error: 'Account rejected.' }, 403);
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
    const ok = await totpVerify(mfa.secret_base32, mfaCode);
    if (!ok) {
      await recordLoginAttempt(c.env.DB, email, ip, false, 'bad_mfa_code');
      return c.json({ success: false, error: 'Invalid MFA code', code: 'MFA_INVALID' }, 401);
    }
  }

  const accessJti = randomId('jti_');
  const token = await signToken(
    { sub: participant.id, email: participant.email, role: participant.role, name: participant.name, jti: accessJti },
    c.env.JWT_SECRET,
    { expiresInSeconds: ACCESS_TOKEN_EXPIRY_SECONDS }
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

  return c.json({
    success: true,
    data: {
      token,
      expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
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
auth.post('/refresh', async (c) => {
  const { refresh_token } = await c.req.json().catch(() => ({} as any));
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
    c.env.JWT_SECRET,
    { expiresInSeconds: ACCESS_TOKEN_EXPIRY_SECONDS }
  );
  return c.json({
    success: true,
    data: {
      token,
      expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
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
  await createPasswordResetToken(c.env.DB, participant.id, clientIp(c));

  await fireCascade({
    event: 'auth.password_reset',
    actor_id: participant.id,
    entity_type: 'participants',
    entity_id: participant.id,
    data: { email, reason: 'forgot_password' },
    env: c.env,
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
  const now = new Date().toISOString();
  if (existing) {
    await c.env.DB.prepare(`UPDATE mfa_totp_secrets SET secret_base32 = ?, verified_at = NULL, backup_codes_json = NULL, updated_at = ? WHERE participant_id = ?`)
      .bind(secret, now, user.id).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO mfa_totp_secrets (participant_id, secret_base32, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .bind(user.id, secret, now, now).run();
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
  const ok = await totpVerify(row.secret_base32, code);
  if (!ok) return c.json({ success: false, error: 'Invalid code' }, 400);
  const backups = generateBackupCodes(10);
  await c.env.DB.prepare(
    `UPDATE mfa_totp_secrets SET verified_at = ?, backup_codes_json = ?, updated_at = ? WHERE participant_id = ?`
  ).bind(new Date().toISOString(), JSON.stringify(backups), new Date().toISOString(), user.id).run();
  return c.json({ success: true, data: { enabled: true, backup_codes: backups } });
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

// POST /auth/change-password — requires current password; revokes all sessions
auth.post('/change-password', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();
  const { current_password, new_password } = body;
  if (!current_password || !new_password) return c.json({ success: false, error: 'Current and new password required' }, 400);
  if (new_password.length < 8) return c.json({ success: false, error: 'New password must be at least 8 characters' }, 400);
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
  if (body?.refresh_token) {
    await revokeSessionByRefresh(c.env.DB, body.refresh_token, 'user_logout');
  }
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
