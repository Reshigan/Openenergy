// ═══════════════════════════════════════════════════════════════════════════
// Support Console Routes — narrower-scope console for day-2 support staff.
// ═══════════════════════════════════════════════════════════════════════════
// Role: 'support' (added in migration 012). Admins have all of these powers
// too (admin is a strict superset), so every handler allows role in
// {'admin','support'}. Distinct from admin: no module CRUD, no KYC decisions,
// no tenant creation, no role/subscription edits. Narrow to: find a user,
// inspect their audit log, issue a one-off reset link, unlock brute-force,
// list/revoke sessions, time-boxed impersonation (fully audited).
//
// All writes append to audit_logs with action 'support.*' so admins can see
// everything support staff did.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser, signToken } from '../middleware/auth';
import { createPasswordResetToken } from '../utils/auth-tokens';

const support = new Hono<HonoEnv>();

support.use('*', authMiddleware);
support.use('*', async (c, next) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'support') {
    return c.json({ success: false, error: 'Support access required' }, 403);
  }
  await next();
});

// Impersonation JWTs are short-lived and carry an explicit marker so
// downstream middleware + audit log can identify them. 30 min cap is hard.
const IMPERSONATION_TTL_SECONDS = 30 * 60;

function randomId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

async function auditLog(
  db: D1Database,
  actorId: string,
  action: string,
  entityId: string,
  changes: Record<string, unknown>
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, changes, created_at)
       VALUES (?, ?, ?, 'participants', ?, ?, datetime('now'))`
    )
    .bind(randomId('al_'), actorId, action, entityId, JSON.stringify(changes))
    .run();
}

// ---------- PARTICIPANT SEARCH ----------
support.get('/participants', async (c) => {
  const q = (c.req.query('q') || '').toLowerCase().trim();
  const role = c.req.query('role');
  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (q) {
    filters.push('(LOWER(email) LIKE ? OR LOWER(name) LIKE ? OR LOWER(COALESCE(company_name,\'\')) LIKE ?)');
    bindings.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (role) {
    filters.push('role = ?');
    bindings.push(role);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(
    `SELECT id, email, name, company_name, role, status, kyc_status, tenant_id,
            email_verified, last_login, created_at
       FROM participants ${where}
      ORDER BY COALESCE(last_login, created_at) DESC
      LIMIT 100`
  ).bind(...bindings).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ---------- PARTICIPANT DETAIL ----------
support.get('/participants/:id', async (c) => {
  const id = c.req.param('id');
  const p = await c.env.DB.prepare(
    `SELECT id, email, name, company_name, role, status, kyc_status,
            subscription_tier, tenant_id, email_verified, last_login,
            created_at, updated_at
       FROM participants WHERE id = ?`
  ).bind(id).first();
  if (!p) return c.json({ success: false, error: 'Participant not found' }, 404);
  return c.json({ success: true, data: p });
});

// ---------- PER-PARTICIPANT AUDIT LOG ----------
support.get('/participants/:id/audit', async (c) => {
  const id = c.req.param('id');
  const rawLimit = Number(c.req.query('limit') || 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 500) : 100;
  const rows = await c.env.DB.prepare(
    `SELECT id, actor_id, action, entity_type, entity_id, changes, ip_address, created_at
       FROM audit_logs
      WHERE actor_id = ? OR entity_id = ?
      ORDER BY created_at DESC
      LIMIT ?`
  ).bind(id, id, limit).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ---------- ONE-OFF PASSWORD-RESET LINK ----------
// Issues a fresh token and returns the full /reset-password URL so support can
// hand it to the user out-of-band (email, phone, chat). Same primitive as
// the public /auth/forgot-password endpoint — no email delivery yet.
support.post('/participants/:id/reset-link', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const p = await c.env.DB.prepare(
    `SELECT id, email FROM participants WHERE id = ?`
  ).bind(id).first<{ id: string; email: string }>();
  if (!p) return c.json({ success: false, error: 'Participant not found' }, 404);

  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null;
  const token = await createPasswordResetToken(c.env.DB, p.id, ip);
  const origin = c.env.APP_BASE_URL || new URL(c.req.url).origin;
  const url = `${origin}/reset-password?token=${encodeURIComponent(token)}`;

  await auditLog(c.env.DB, actor.id, 'support.reset_link_issued', p.id, { email: p.email });

  return c.json({
    success: true,
    data: { reset_url: url, expires_in_minutes: 30, email: p.email },
  });
});

// ---------- CLEAR BRUTE-FORCE LOCKOUT ----------
// Wipes recent failed login_attempts rows for a given email so the user can
// log in again without waiting out the 15-minute block. Only clears the
// failure window; successful logins are left alone for forensic purposes.
support.post('/participants/:id/unlock', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const p = await c.env.DB.prepare(
    `SELECT id, email FROM participants WHERE id = ?`
  ).bind(id).first<{ id: string; email: string }>();
  if (!p) return c.json({ success: false, error: 'Participant not found' }, 404);

  const res = await c.env.DB.prepare(
    `DELETE FROM login_attempts
       WHERE email = ? AND succeeded = 0
         AND attempted_at > datetime('now', '-1 hour')`
  ).bind(p.email).run();

  const cleared = Number(res.meta?.changes ?? 0);
  await auditLog(c.env.DB, actor.id, 'support.lockout_cleared', p.id, { email: p.email, cleared });

  return c.json({ success: true, data: { cleared_attempts: cleared } });
});

// ---------- SESSION LIST + REVOKE ----------
support.get('/participants/:id/sessions', async (c) => {
  const id = c.req.param('id');
  const rows = await c.env.DB.prepare(
    `SELECT id, issued_at, expires_at, last_used_at, user_agent, ip,
            revoked_at, revoked_reason
       FROM sessions
      WHERE participant_id = ?
      ORDER BY issued_at DESC
      LIMIT 100`
  ).bind(id).all();
  return c.json({ success: true, data: rows.results || [] });
});

support.post('/participants/:id/sessions/:sid/revoke', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const sid = c.req.param('sid');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = typeof body.reason === 'string' && body.reason.trim()
    ? body.reason.trim().slice(0, 120)
    : 'support_revoked';

  const res = await c.env.DB.prepare(
    `UPDATE sessions
        SET revoked_at = datetime('now'), revoked_reason = ?
      WHERE id = ? AND participant_id = ? AND revoked_at IS NULL`
  ).bind(reason, sid, id).run();

  const changed = Number(res.meta?.changes ?? 0);
  if (changed === 0) {
    return c.json({ success: false, error: 'Session not found or already revoked' }, 404);
  }
  await auditLog(c.env.DB, actor.id, 'support.session_revoked', id, { session_id: sid, reason });

  return c.json({ success: true });
});

// ---------- TIME-BOXED IMPERSONATION ----------
// Issues a 30-minute JWT that authenticates as the target user. Cannot be
// used to impersonate another admin or another support user (would let
// support staff escalate each other). Every call is audit-logged with the
// actor, target, session jti, and the `reason` the impersonator provided.
support.post('/participants/:id/impersonate', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = typeof body.reason === 'string' && body.reason.trim()
    ? body.reason.trim().slice(0, 200)
    : '';
  if (!reason) return c.json({ success: false, error: 'reason is required' }, 400);

  const target = await c.env.DB.prepare(
    `SELECT id, email, role, name FROM participants WHERE id = ?`
  ).bind(id).first<{ id: string; email: string; role: string; name: string }>();
  if (!target) return c.json({ success: false, error: 'Target not found' }, 404);
  if (target.role === 'admin' || target.role === 'support') {
    return c.json({ success: false, error: 'Cannot impersonate admin/support accounts' }, 403);
  }

  const jti = randomId('jti_impersonation_');
  const token = await signToken(
    {
      sub: target.id,
      email: target.email,
      role: target.role as any,
      name: target.name,
      jti,
    },
    c.env.JWT_SECRET,
    { expiresInSeconds: IMPERSONATION_TTL_SECONDS }
  );

  await auditLog(c.env.DB, actor.id, 'support.impersonation_started', target.id, {
    target_email: target.email,
    target_role: target.role,
    reason,
    jti,
    ttl_seconds: IMPERSONATION_TTL_SECONDS,
  });

  return c.json({
    success: true,
    data: {
      access_token: token,
      expires_in: IMPERSONATION_TTL_SECONDS,
      impersonating: {
        id: target.id,
        email: target.email,
        role: target.role,
        name: target.name,
      },
      impersonator: { id: actor.id, email: actor.email, role: actor.role },
    },
  });
});

// ---------- DLQ LIST (audit_logs filtered on cascade failures) ----------
// Placeholder until PR-Prod-3 introduces the proper cascade_dlq table. For
// now we surface any audit_logs rows tagged as cascade errors so support has
// at least _some_ visibility.
support.get('/cascade-dlq', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, actor_id, action, entity_type, entity_id, changes, created_at
       FROM audit_logs
      WHERE action LIKE 'cascade.%' OR action LIKE '%.failed'
      ORDER BY created_at DESC
      LIMIT 100`
  ).all();
  return c.json({ success: true, data: rows.results || [] });
});

export default support;
