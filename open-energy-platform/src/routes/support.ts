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
import { appendAudit, getChainHead, verifyChain } from '../utils/audit-chain';
import { fireCascade } from '../utils/cascade';
import { badEnum } from '../utils/validation';

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
    c.env,
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

  await appendAudit({
    env: c.env, entity_type: 'support', entity_id: target.id,
    event_type: 'impersonation.started', actor_id: actor.id,
    payload: {
      target_id: target.id, target_email: target.email,
      target_role: target.role, reason, jti,
      ttl_seconds: IMPERSONATION_TTL_SECONDS,
    },
  }).catch((e) => console.warn('audit_impersonation_failed', (e as Error).message));

  await fireCascade({
    event: 'support.impersonation_started',
    actor_id: actor.id,
    entity_type: 'participants',
    entity_id: target.id,
    data: {
      target_id: target.id, target_email: target.email,
      target_role: target.role, reason, jti,
      ttl_seconds: IMPERSONATION_TTL_SECONDS,
    },
    env: c.env,
    skipAudit: true,
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
  const enumErr = badEnum('category', body.category, ['access', 'billing', 'feature_question', 'bug', 'data_issue', 'compliance', 'other']);
  if (enumErr) return c.json({ success: false, error: enumErr }, 400);
  const prioErr = badEnum('priority', body.priority, ['low', 'normal', 'high', 'urgent']);
  if (prioErr) return c.json({ success: false, error: prioErr }, 400);
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
  await fireCascade({
    event: 'support.ticket_opened',
    actor_id: user.id,
    entity_type: 'support_tickets',
    entity_id: id,
    data: {
      id, ticket_number: ticketNumber, reporter_id: user.id,
      tenant_id: body.tenant_id || null,
      subject: body.subject, category: body.category,
      priority: body.priority || 'normal',
    },
    env: c.env,
  });
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
  const res = await c.env.DB.prepare(
    `UPDATE support_tickets
       SET status = ?, resolution = COALESCE(?, resolution),
           resolved_at = CASE WHEN ? IN ('resolved','closed') THEN ? ELSE resolved_at END,
           resolved_by = CASE WHEN ? IN ('resolved','closed') THEN ? ELSE resolved_by END,
           assignee_id = COALESCE(?, assignee_id),
           updated_at = ?
     WHERE id = ?`,
  ).bind(to, body.resolution || null, to, now, to, user.id, body.assignee_id || null, now, id).run();
  if (Number(res.meta?.changes ?? 0) === 0) {
    return c.json({ success: false, error: 'Ticket not found' }, 404);
  }
  await fireCascade({
    event: 'support.ticket_transitioned',
    actor_id: user.id,
    entity_type: 'support_tickets',
    entity_id: id,
    data: {
      id, to_status: to,
      resolution: body.resolution || null,
      assignee_id: body.assignee_id || null,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

support.post('/tickets/:id/comments', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.body) return c.json({ success: false, error: 'body required' }, 400);
  const visErr = badEnum('visibility', body.visibility, ['public', 'internal']);
  if (visErr) return c.json({ success: false, error: visErr }, 400);
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
  await fireCascade({
    event: 'support.escalation_filed',
    actor_id: user.id,
    entity_type: 'support_escalations',
    entity_id: eid,
    data: {
      id: eid, ticket_id: id, escalated_to: body.escalated_to,
      reason: body.reason,
    },
    env: c.env,
  });
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

  await appendAudit({
    env: c.env, entity_type: 'support', entity_id: id,
    event_type: 'cross_tenant.accessed', actor_id: user.id,
    payload: {
      access_id: id, tenant_accessed: body.tenant_accessed,
      resource_type: body.resource_type, resource_id: body.resource_id || null,
      justification: body.justification, ticket_id: body.ticket_id || null,
    },
  }).catch((e) => console.warn('audit_cross_tenant_failed', (e as Error).message));

  await fireCascade({
    event: 'support.cross_tenant_access',
    actor_id: user.id,
    entity_type: 'support_cross_tenant_access',
    entity_id: id,
    data: {
      access_id: id, tenant_accessed: body.tenant_accessed,
      resource_type: body.resource_type, resource_id: body.resource_id || null,
      justification: body.justification, ticket_id: body.ticket_id || null,
    },
    env: c.env,
    skipAudit: true,
  });

  return c.json({ success: true, data: { id } });
});

support.get('/cross-tenant-access', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM support_cross_tenant_access ORDER BY accessed_at DESC LIMIT 200`,
  ).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

// ════════════════════════════════════════════════════════════════════════
// L5 — Support: cross-tenant access audit + PAIA access-request export.
// ════════════════════════════════════════════════════════════════════════

// Support audit + export packs are officer-only (admin/support/regulator);
// support is itself an oversight role. Matches the officer-gated
// POST /audit/export and the actor_id scoping in GET /audit/events.
const supportAuditOfficer = (role: string): boolean =>
  role === 'admin' || role === 'support' || role === 'regulator';

support.get('/audit/head', async (c) => {
  const user = getCurrentUser(c);
  if (!supportAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const head = await getChainHead(c.env, 'support');
  return c.json({ success: true, data: head });
});

support.get('/audit/events', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'support') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const limit = Math.min(200, Number(c.req.query('limit') || 50));
  const rs = await c.env.DB.prepare(
    `SELECT id, entity_id, event_type, actor_id, sequence_no, content_hash, prev_hash, created_at, payload_json
       FROM audit_events WHERE entity_type = 'support'
      ORDER BY sequence_no DESC LIMIT ?`,
  ).bind(limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

support.post('/audit/verify', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const fromSeq = Number(c.req.query('from_seq') || 1) || 1;
  const result = await verifyChain(c.env, 'support', fromSeq);
  return c.json({ success: result.ok, data: result });
});

// POST /support/audit/export — POPIA s.18 PAIA access-request register.
// Every cross-tenant access + impersonation event in the window. Suitable
// for Information Regulator s.32 (Information Officer accountability) report.
support.post('/audit/export', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Admin only' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = body.from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = body.to || new Date().toISOString().slice(0, 10);

  const rows = await c.env.DB.prepare(
    `SELECT id, agent_id, tenant_accessed, resource_type, resource_id,
            justification, ticket_id, accessed_at
       FROM support_cross_tenant_access
      WHERE substr(accessed_at, 1, 10) BETWEEN ? AND ?
      ORDER BY accessed_at ASC`,
  ).bind(from, to).all<any>().catch(() => ({ results: [] } as any));
  const data = (rows.results || []) as Array<Record<string, any>>;

  const header = ['access_id','agent_id','tenant_accessed','resource_type',
                  'resource_id','justification','ticket_id','accessed_at'].join(',');
  const csvLines = [header];
  for (const r of data) {
    csvLines.push([
      r.id, r.agent_id, r.tenant_accessed, r.resource_type,
      r.resource_id || '', csvEscape(r.justification || ''),
      r.ticket_id || '', r.accessed_at,
    ].join(','));
  }
  const csv = csvLines.join('\n') + '\n';
  const csvBytes = new TextEncoder().encode(csv);
  const csvSha = await sha256OfBytes(csvBytes);

  const head = await getChainHead(c.env, 'support');
  const exportId = 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-exports/support/${exportId}/cross-tenant-access.csv`;
  const manifestKey = `audit-exports/support/${exportId}/manifest.json`;
  const manifest = {
    export_id: exportId, entity_type: 'support', from, to,
    generated_at: new Date().toISOString(), generated_by: user.id, row_count: data.length,
    csv: { r2_key: csvKey, sha256: csvSha, bytes: csvBytes.byteLength },
    chain: {
      head_hash: head?.head_hash || null,
      head_sequence: head?.head_sequence || 0,
      last_verified_at: head?.last_verified_at || null,
    },
    format: { profile: 'POPIA s.18 PAIA access-request register v1', encoding: 'utf-8' },
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

  try {
    await c.env.R2.put(csvKey, csvBytes, { httpMetadata: { contentType: 'text/csv' } });
    await c.env.R2.put(manifestKey, manifestBytes, { httpMetadata: { contentType: 'application/json' } });
  } catch (e) {
    return c.json({ success: false, error: 'R2 write failed', data: { detail: (e as Error).message } }, 502);
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_exports
       (id, entity_type, from_ts, to_ts, row_count,
        csv_r2_key, manifest_r2_key, chain_head_hash, generated_by, generated_at)
     VALUES (?, 'support', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(exportId, from, to, data.length, csvKey, manifestKey,
         head?.head_hash || '', user.id).run();

  await appendAudit({
    env: c.env, entity_type: 'support', entity_id: exportId,
    event_type: 'audit.export_generated', actor_id: user.id,
    payload: { export_id: exportId, from, to, row_count: data.length, csv_sha256: csvSha },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { export_id: exportId, row_count: data.length, csv_r2_key: csvKey, manifest_r2_key: manifestKey, manifest },
  }, 201);
});

support.get('/audit/exports', async (c) => {
  const user = getCurrentUser(c);
  if (!supportAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT id, from_ts, to_ts, row_count, csv_r2_key, manifest_r2_key,
            chain_head_hash, generated_by, generated_at
       FROM audit_exports WHERE entity_type = 'support'
      ORDER BY generated_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

support.get('/audit/exports/:id/manifest', async (c) => {
  const user = getCurrentUser(c);
  if (!supportAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT manifest_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'support'`,
  ).bind(id).first<{ manifest_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.manifest_r2_key);
  if (!obj) return c.json({ success: false, error: 'Manifest object missing in R2' }, 404);
  const text = await obj.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* */ }
  return c.json({ success: true, data: parsed ?? { raw: text } });
});

support.get('/audit/exports/:id/csv', async (c) => {
  const user = getCurrentUser(c);
  if (!supportAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT csv_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'support'`,
  ).bind(id).first<{ csv_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.csv_r2_key);
  if (!obj) return c.json({ success: false, error: 'CSV object missing in R2' }, 404);
  return new Response(await obj.arrayBuffer(), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${id}.csv"`,
    },
  });
});

// POST /support/audit/recon — reconcile against an external ticketing
// system (Zendesk/JIRA) cross-tenant access log. CSV columns:
//   external_ref, agent_email, tenant_accessed, accessed_at
// Match against support_cross_tenant_access by ticket_id.
support.post('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'support') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { source?: string; csv?: string };
  const source = (body.source || 'zendesk').toLowerCase();
  if (typeof body.csv !== 'string' || body.csv.length < 10) {
    return c.json({ success: false, error: 'csv body required' }, 400);
  }
  const lines = body.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return c.json({ success: false, error: 'csv must have header + ≥1 row' }, 400);
  const headers = lines[0].split(',').map((h) => h.trim());
  const need = ['external_ref','agent_email','tenant_accessed','accessed_at'];
  for (const k of need) {
    if (!headers.includes(k)) return c.json({ success: false, error: `csv missing column: ${k}` }, 400);
  }
  const idxOf = (k: string) => headers.indexOf(k);
  type TheirRow = { external_ref: string; agent_email: string; tenant_accessed: string; accessed_at: string };
  const theirs: TheirRow[] = [];
  for (const ln of lines.slice(1)) {
    const cols = ln.split(',');
    theirs.push({
      external_ref: (cols[idxOf('external_ref')] || '').trim(),
      agent_email: (cols[idxOf('agent_email')] || '').trim(),
      tenant_accessed: (cols[idxOf('tenant_accessed')] || '').trim(),
      accessed_at: (cols[idxOf('accessed_at')] || '').trim(),
    });
  }

  const runId = 'recon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-recon/support/${runId}/${source}.csv`;
  await c.env.R2.put(csvKey, new TextEncoder().encode(body.csv), {
    httpMetadata: { contentType: 'text/csv' },
  }).catch(() => null);

  const ours = await c.env.DB.prepare(
    `SELECT s.id, s.ticket_id, s.tenant_accessed, s.accessed_at, p.email AS agent_email
       FROM support_cross_tenant_access s
       LEFT JOIN participants p ON p.id = s.agent_id
      WHERE s.ticket_id IS NOT NULL`,
  ).all<{ id: string; ticket_id: string; tenant_accessed: string; accessed_at: string; agent_email: string | null }>();
  const ourByTicket = new Map<string, any>();
  for (const r of (ours.results || []) as any[]) ourByTicket.set(r.ticket_id, r);

  const matched = new Set<string>();
  type Break = { type: string; external_ref: string | null; our: unknown; their: unknown; field: string | null };
  const breaks: Break[] = [];
  for (const t of theirs) {
    const o = ourByTicket.get(t.external_ref);
    if (!o) {
      breaks.push({ type: 'missing_in_ours', external_ref: t.external_ref || null, our: null, their: t, field: null });
      continue;
    }
    matched.add(t.external_ref);
    if ((o.tenant_accessed || '').toLowerCase() !== (t.tenant_accessed || '').toLowerCase()) {
      breaks.push({ type: 'field_mismatch', external_ref: t.external_ref, our: o, their: t, field: 'tenant_accessed' });
    }
  }
  for (const [tref, o] of ourByTicket.entries()) {
    if (!matched.has(tref) && !theirs.some((t) => t.external_ref === tref)) {
      breaks.push({ type: 'missing_in_theirs', external_ref: tref, our: o, their: null, field: null });
    }
  }

  const matchedCount = theirs.length - breaks.filter((b) => b.type !== 'field_mismatch').length;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO audit_recon_runs
       (id, entity_type, source, uploaded_csv_r2_key, row_count,
        matched_count, break_count, status, started_at, finished_at, started_by)
     VALUES (?, 'support', ?, ?, ?, ?, ?, 'complete', ?, ?, ?)`,
  ).bind(runId, source, csvKey, theirs.length, matchedCount,
         breaks.length, now, now, user.id).run();

  if (breaks.length > 0) {
    const inserts = breaks.map((b) => c.env.DB.prepare(
      `INSERT INTO audit_recon_breaks
         (id, run_id, break_type, external_ref, our_value, their_value, field, resolution)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    ).bind(
      'brk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      runId, b.type, b.external_ref,
      b.our != null ? JSON.stringify(b.our) : null,
      b.their != null ? JSON.stringify(b.their) : null,
      b.field,
    ));
    await c.env.DB.batch(inserts);
  }

  await appendAudit({
    env: c.env, entity_type: 'support', entity_id: runId,
    event_type: 'audit.recon_run', actor_id: user.id,
    payload: { run_id: runId, source, row_count: theirs.length, break_count: breaks.length },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { run_id: runId, source, row_count: theirs.length, matched_count: matchedCount, break_count: breaks.length },
  }, 201);
});

support.get('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  if (!supportAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT id, source, row_count, matched_count, break_count, status,
            started_at, finished_at
       FROM audit_recon_runs WHERE entity_type = 'support'
      ORDER BY started_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
async function sha256OfBytes(b: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', b);
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export default support;
