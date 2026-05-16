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
import { logPiiAccess } from '../utils/popia-access';

const support = new Hono<HonoEnv>();

support.use('*', authMiddleware);
support.use('*', async (c, next) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'support') {
    return c.json({ success: false, error: 'Support access required' }, 403);
  }
  await next();
  return;
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
    data: { reset_url: url, expires_in_minutes: 60, email: p.email },
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

  // POPIA s.19 accountability — impersonation is the most invasive form of
  // PII access; always log with the provided justification.
  await logPiiAccess(c.env, {
    actor_id: actor.id,
    subject_id: target.id,
    access_type: 'impersonation',
    justification: reason,
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

// ---------- CASCADE DLQ (real table landed in migration 013) ----------
// GET /cascade-dlq        — list rows, filter by status, newest first
// POST /cascade-dlq/:id/retry   — re-run the failed stage
// POST /cascade-dlq/:id/resolve — mark resolved/abandoned (support
//                                 handled it out-of-band, no retry)
support.get('/cascade-dlq', async (c) => {
  const status = (c.req.query('status') || 'pending').toLowerCase();
  const validStatus = ['pending', 'resolved', 'abandoned', 'all'].includes(status) ? status : 'pending';

  const rawLimit = parseInt(c.req.query('limit') || '100', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);

  const stmt = validStatus === 'all'
    ? c.env.DB.prepare(
        `SELECT id, event, entity_type, entity_id, actor_id, stage,
                error_message, attempt_count, first_seen_at, last_attempt_at,
                status, resolved_at, resolved_by
           FROM cascade_dlq
          ORDER BY first_seen_at DESC
          LIMIT ?`,
      ).bind(limit)
    : c.env.DB.prepare(
        `SELECT id, event, entity_type, entity_id, actor_id, stage,
                error_message, attempt_count, first_seen_at, last_attempt_at,
                status, resolved_at, resolved_by
           FROM cascade_dlq
          WHERE status = ?
          ORDER BY first_seen_at DESC
          LIMIT ?`,
      ).bind(validStatus, limit);

  const rows = await stmt.all();
  return c.json({ success: true, data: rows.results || [] });
});

support.post('/cascade-dlq/:id/retry', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const { retryDlqItem } = await import('../utils/cascade');
  const result = await retryDlqItem(c.env as any, id, actor.id);
  await auditLog(c.env.DB, actor.id, 'support.cascade_retry', id, {
    ok: result.ok,
    error: result.error || null,
  });
  if (!result.ok) return c.json({ success: false, error: result.error || 'Retry failed' }, 400);
  return c.json({ success: true });
});

support.post('/cascade-dlq/:id/resolve', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: 'resolved' | 'abandoned'; note?: string }>()
    .catch(() => ({} as { status?: 'resolved' | 'abandoned'; note?: string }));
  const status = body.status === 'abandoned' ? 'abandoned' : 'resolved';
  const { resolveDlqItem } = await import('../utils/cascade');
  await resolveDlqItem(c.env as any, id, actor.id, status, body.note);
  await auditLog(c.env.DB, actor.id, 'support.cascade_resolve', id, {
    status,
    note: body.note || null,
  });
  return c.json({ success: true });
});

// ────────────────────────────────────────────────────────────────────────
// L4 endpoints — tickets, comments, escalations, cross-tenant access
// audit (migration 056). Full support workstation backend.
// ────────────────────────────────────────────────────────────────────────

support.post('/tickets', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.subject || !body.category) {
    return c.json({ success: false, error: 'subject, category required' }, 400);
  }
  const id = crypto.randomUUID();
  const ticketNumber = `OE-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
  await c.env.DB.prepare(
    `INSERT INTO support_tickets
       (id, ticket_number, reporter_id, tenant_id, subject, description, category, priority, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
  ).bind(
    id, ticketNumber, user.id, body.tenant_id || null,
    body.subject, body.description || null,
    body.category, body.priority || 'normal',
  ).run();
  return c.json({ success: true, data: { id, ticket_number: ticketNumber } });
});

support.get('/tickets', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const priority = c.req.query('priority');
  const where: string[] = [];
  const binds: unknown[] = [];
  // Support agents see all tickets; users see their own.
  if (user.role !== 'support' && user.role !== 'admin') {
    where.push('reporter_id = ?');
    binds.push(user.id);
  }
  if (status) { where.push('status = ?'); binds.push(status); }
  if (priority) { where.push('priority = ?'); binds.push(priority); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM support_tickets ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE priority
        WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END,
        created_at DESC LIMIT 200`,
  ).bind(...binds).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

support.get('/tickets/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const ticket = await c.env.DB.prepare(`SELECT * FROM support_tickets WHERE id = ?`).bind(id).first<any>();
  if (!ticket) return c.json({ success: false, error: 'Ticket not found' }, 404);
  if (ticket.reporter_id !== user.id && user.role !== 'support' && user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const visClause = (user.role === 'support' || user.role === 'admin') ? '' : "AND visibility = 'public'";
  const comments = await c.env.DB.prepare(
    `SELECT * FROM support_ticket_comments WHERE ticket_id = ? ${visClause} ORDER BY created_at`,
  ).bind(id).all().catch(() => ({ results: [] } as any));
  const escalations = await c.env.DB.prepare(
    `SELECT * FROM support_escalations WHERE ticket_id = ? ORDER BY escalated_at DESC`,
  ).bind(id).all().catch(() => ({ results: [] } as any));
  return c.json({
    success: true,
    data: { ticket, comments: comments.results || [], escalations: escalations.results || [] },
  });
});

support.post('/tickets/:id/transition', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as any;
  const to = String(body.to || '').trim();
  if (!['in_progress', 'waiting_on_customer', 'resolved', 'closed'].includes(to)) {
    return c.json({ success: false, error: 'invalid transition' }, 400);
  }
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE support_tickets
       SET status = ?, resolution = COALESCE(?, resolution),
           resolved_at = CASE WHEN ? IN ('resolved','closed') THEN ? ELSE resolved_at END,
           resolved_by = CASE WHEN ? IN ('resolved','closed') THEN ? ELSE resolved_by END,
           assignee_id = COALESCE(?, assignee_id),
           updated_at = ?
     WHERE id = ?`,
  ).bind(to, body.resolution || null, to, now, to, user.id, body.assignee_id || null, now, id).run();
  return c.json({ success: true });
});

support.post('/tickets/:id/comments', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.body) return c.json({ success: false, error: 'body required' }, 400);
  const cid = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO support_ticket_comments (id, ticket_id, author_id, body, visibility)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(cid, id, user.id, body.body, body.visibility || 'public').run();
  return c.json({ success: true, data: { id: cid } });
});

support.get('/tickets/:id/comments', async (c) => {
  const id = c.req.param('id');
  const user = getCurrentUser(c);
  const visClause = (user.role === 'support' || user.role === 'admin') ? '' : "AND visibility = 'public'";
  const rows = await c.env.DB.prepare(
    `SELECT * FROM support_ticket_comments WHERE ticket_id = ? ${visClause}
      ORDER BY created_at`,
  ).bind(id).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

support.post('/tickets/:id/escalate', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.escalated_to || !body.reason) {
    return c.json({ success: false, error: 'escalated_to, reason required' }, 400);
  }
  const eid = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO support_escalations (id, ticket_id, escalated_by, escalated_to, reason)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(eid, id, user.id, body.escalated_to, body.reason).run();
  return c.json({ success: true, data: { id: eid } });
});

support.get('/escalations', async (c) => {
  const status = c.req.query('status');
  const where: string[] = [];
  const binds: unknown[] = [];
  if (status) { where.push('status = ?'); binds.push(status); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM support_escalations ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY escalated_at DESC LIMIT 200`,
  ).bind(...binds).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

support.post('/cross-tenant-access', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.tenant_accessed || !body.resource_type || !body.justification) {
    return c.json({ success: false, error: 'tenant_accessed, resource_type, justification required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO support_cross_tenant_access
       (id, agent_id, tenant_accessed, resource_type, resource_id, justification, ticket_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, user.id, body.tenant_accessed, body.resource_type,
    body.resource_id || null, body.justification, body.ticket_id || null,
  ).run();
  return c.json({ success: true, data: { id } });
});

support.get('/cross-tenant-access', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM support_cross_tenant_access ORDER BY accessed_at DESC LIMIT 200`,
  ).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

export default support;
