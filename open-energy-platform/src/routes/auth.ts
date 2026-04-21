// ═══════════════════════════════════════════════════════════════════════════
// Auth Routes — Register, Login, OTP, JWT, Password Reset
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { RegisterSchema, LoginSchema, VerifyOTPSchema, ForgotPasswordSchema, ResetPasswordSchema } from '../utils/validation';
import { authMiddleware, getCurrentUser, signToken, generateOTP, hashPassword, verifyPassword } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const auth = new Hono<HonoEnv>();

// POST /auth/register — Create new participant account
auth.post('/register', async (c) => {
  const body = await c.req.json();
  
  const validation = RegisterSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ success: false, error: validation.error.errors[0].message }, 400);
  }
  
  const { email, password, name, company_name, role } = validation.data;
  
  // Check if email already exists
  const existing = await c.env.DB.prepare('SELECT id FROM participants WHERE email = ?').bind(email).first();
  if (existing) {
    return c.json({ success: false, error: 'Email already registered' }, 409);
  }
  
  // Hash password
  const passwordHash = await hashPassword(password);
  
  // Generate OTP
  const otpCode = generateOTP();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
  
  // Create participant
  const participantId = 'id_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  
  await c.env.DB.prepare(`
    INSERT INTO participants (id, email, password_hash, name, company_name, role, status, otp_code, otp_expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).bind(participantId, email, passwordHash, name, company_name || null, role, otpCode, otpExpires, new Date().toISOString()).run();
  
  // Fire cascade event
  await fireCascade({
    event: 'auth.registered',
    actor_id: participantId,
    entity_type: 'participants',
    entity_id: participantId,
    data: { email, name, role },
    env: c.env,
  });
  
  // In production, send email with OTP
  // await sendEmail(email, 'Verify your Open Energy account', `Your OTP is: ${otpCode}`);
  
  return c.json({
    success: true,
    data: {
      participant_id: participantId,
      message: 'Account created. Please verify your email with the OTP code.',
      // In development, return OTP for testing
      ...(process.env.NODE_ENV === 'development' ? { otp_code: otpCode } : {}),
    },
  });
});

// POST /auth/login — Authenticate and receive JWT
auth.post('/login', async (c) => {
  const body = await c.req.json();
  
  const validation = LoginSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ success: false, error: validation.error.errors[0].message }, 400);
  }
  
  const { email, password } = validation.data;
  
  // Find participant
  const participant = await c.env.DB.prepare(`
    SELECT id, email, password_hash, name, role, status, email_verified, kyc_status
    FROM participants WHERE email = ?
  `).bind(email).first();
  
  if (!participant) {
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }
  
  // Check account status
  if (participant.status === 'suspended') {
    return c.json({ success: false, error: 'Account suspended. Contact support.' }, 403);
  }
  
  if (participant.status === 'rejected') {
    return c.json({ success: false, error: 'Account rejected.' }, 403);
  }
  
  // Verify password
  const isValid = await verifyPassword(password, participant.password_hash);
  if (!isValid) {
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }
  
  // Generate JWT
  const token = await signToken({
    sub: participant.id,
    email: participant.email,
    role: participant.role,
    name: participant.name,
  }, c.env.JWT_SECRET);
  
  // Update last login
  await c.env.DB.prepare('UPDATE participants SET last_login = ? WHERE id = ?')
    .bind(new Date().toISOString(), participant.id).run();
  
  // Fire cascade
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
      participant: {
        id: participant.id,
        email: participant.email,
        name: participant.name,
        role: participant.role,
        email_verified: participant.email_verified,
        kyc_status: participant.kyc_status,
      },
    },
  });
});

// POST /auth/verify-otp — Verify OTP and activate account
auth.post('/verify-otp', async (c) => {
  const body = await c.req.json();
  
  const validation = VerifyOTPSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ success: false, error: validation.error.errors[0].message }, 400);
  }
  
  const { email, otp_code } = validation.data;
  
  const participant = await c.env.DB.prepare(`
    SELECT id, email, otp_code, otp_expires_at, email_verified
    FROM participants WHERE email = ?
  `).bind(email).first();
  
  if (!participant) {
    return c.json({ success: false, error: 'Participant not found' }, 404);
  }
  
  if (participant.email_verified) {
    return c.json({ success: false, error: 'Email already verified' }, 400);
  }
  
  if (participant.otp_code !== otp_code) {
    return c.json({ success: false, error: 'Invalid OTP code' }, 400);
  }
  
  if (new Date(participant.otp_expires_at) < new Date()) {
    return c.json({ success: false, error: 'OTP expired. Request a new one.' }, 400);
  }
  
  // Verify email
  await c.env.DB.prepare(`
    UPDATE participants 
    SET email_verified = 1, otp_code = NULL, otp_expires_at = NULL, status = 'active', updated_at = ?
    WHERE id = ?
  `).bind(new Date().toISOString(), participant.id).run();
  
  // Fire cascade
  await fireCascade({
    event: 'auth.otp_verified',
    actor_id: participant.id,
    entity_type: 'participants',
    entity_id: participant.id,
    data: { email },
    env: c.env,
  });
  
  return c.json({
    success: true,
    data: {
      message: 'Email verified successfully',
      email_verified: true,
    },
  });
});

// POST /auth/resend-otp — Resend OTP code
auth.post('/resend-otp', async (c) => {
  const body = await c.req.json();
  
  const { email } = body;
  if (!email) {
    return c.json({ success: false, error: 'Email required' }, 400);
  }
  
  const participant = await c.env.DB.prepare('SELECT id, email_verified FROM participants WHERE email = ?').bind(email).first();
  
  if (!participant) {
    // Don't reveal if email exists
    return c.json({ success: true, data: { message: 'If email exists, OTP has been sent' } });
  }
  
  if (participant.email_verified) {
    return c.json({ success: false, error: 'Email already verified' }, 400);
  }
  
  // Generate new OTP
  const otpCode = generateOTP();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  
  await c.env.DB.prepare(`
    UPDATE participants SET otp_code = ?, otp_expires_at = ? WHERE id = ?
  `).bind(otpCode, otpExpires, participant.id).run();
  
  // Fire cascade
  await fireCascade({
    event: 'auth.otp_sent',
    actor_id: participant.id,
    entity_type: 'participants',
    entity_id: participant.id,
    data: { email, reason: 'resend' },
    env: c.env,
  });
  
  // In production, send email
  // await sendEmail(email, 'Your new OTP', `Your OTP is: ${otpCode}`);
  
  return c.json({
    success: true,
    data: {
      message: 'If email exists, OTP has been sent',
      ...(process.env.NODE_ENV === 'development' ? { otp_code: otpCode } : {}),
    },
  });
});

// POST /auth/forgot-password — Request password reset
auth.post('/forgot-password', async (c) => {
  const body = await c.req.json();
  
  const validation = ForgotPasswordSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ success: false, error: validation.error.errors[0].message }, 400);
  }
  
  const { email } = validation.data;
  
  const participant = await c.env.DB.prepare('SELECT id FROM participants WHERE email = ?').bind(email).first();
  
  // Always return success to prevent email enumeration
  if (!participant) {
    return c.json({ success: true, data: { message: 'If email exists, reset instructions have been sent' } });
  }
  
  // Generate reset token (simplified - in production use crypto random)
  const resetToken = Date.now().toString(36) + Math.random().toString(36).substring(2);
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  
  // Store in KV for simplicity (in production, use D1 table)
  await c.env.KV.put(`reset:${participant.id}`, JSON.stringify({ token: resetToken, expires: resetExpires }), { expirationTtl: 3600 });
  
  // Fire cascade
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
      // In development, return token
      ...(process.env.NODE_ENV === 'development' ? { reset_token: resetToken } : {}),
    },
  });
});

// GET /auth/me — Get current user profile
auth.get('/me', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  
  const participant = await c.env.DB.prepare(`
    SELECT id, email, name, company_name, role, status, kyc_status, bbbee_level, 
           subscription_tier, email_verified, last_login, onboarding_completed, created_at
    FROM participants WHERE id = ?
  `).bind(user.id).first();
  
  if (!participant) {
    return c.json({ success: false, error: 'Participant not found' }, 404);
  }
  
  // Get enabled modules
  const modules = await c.env.DB.prepare(`
    SELECT m.module_key, m.display_name 
    FROM modules m 
    WHERE m.enabled = 1 AND (m.required_role IS NULL OR m.required_role = ?)
  `).bind(user.role).all();
  
  return c.json({
    success: true,
    data: {
      ...participant,
      enabled_modules: modules.results?.map((m: any) => m.module_key) || [],
    },
  });
});

// PUT /auth/profile — Update current user profile
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

// POST /auth/change-password — Change password
auth.post('/change-password', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();
  
  const { current_password, new_password } = body;
  
  if (!current_password || !new_password) {
    return c.json({ success: false, error: 'Current and new password required' }, 400);
  }
  
  if (new_password.length < 8) {
    return c.json({ success: false, error: 'New password must be at least 8 characters' }, 400);
  }
  
  // Get current hash
  const participant = await c.env.DB.prepare('SELECT password_hash FROM participants WHERE id = ?').bind(user.id).first();
  
  if (!participant) {
    return c.json({ success: false, error: 'Participant not found' }, 404);
  }
  
  // Verify current password
  const isValid = await verifyPassword(current_password, participant.password_hash);
  if (!isValid) {
    return c.json({ success: false, error: 'Current password incorrect' }, 401);
  }
  
  // Hash and save new password
  const newHash = await hashPassword(new_password);
  await c.env.DB.prepare('UPDATE participants SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(newHash, new Date().toISOString(), user.id).run();
  
  return c.json({ success: true, data: { message: 'Password changed successfully' } });
});

// POST /auth/logout — Logout (client-side token discard)
auth.post('/logout', authMiddleware, async (c) => {
  const user = getCurrentUser(c);
  
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