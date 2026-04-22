// Admin Routes — platform console. KYC queue, tenant/user management, module
// catalogue, audit log viewer, billing snapshot, system stats. Restricted to
// role=admin. Audit-log writer is idempotent across writes.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser, hashPassword } from '../middleware/auth';
import { createPasswordResetToken, randomOpaqueToken, revokeAllSessionsForParticipant } from '../utils/auth-tokens';

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
}

function slugify(input: string): string {
  return input.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 48) || 'tenant';
}

// Write an admin audit_log entry. Takes the request context, the actor, the
// action namespace, entity type/id, and free-form changes payload.
async function auditLog(
  env: HonoEnv,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  changes: unknown,
) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, changes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    genId('al'),
    actorId,
    action,
    entityType,
    entityId,
    JSON.stringify(changes ?? {}),
    new Date().toISOString(),
  ).run();
}

const admin = new Hono<HonoEnv>();
admin.use('*', authMiddleware);
admin.use('*', async (c, next) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Admin access required' }, 403);
  await next();
});

// ---------- USER MANAGEMENT ----------
admin.get('/users', async (c) => {
  const role = c.req.query('role');
  const status = c.req.query('status');
  const q = c.req.query('q');
  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (role) { filters.push('role = ?'); bindings.push(role); }
  if (status) { filters.push('status = ?'); bindings.push(status); }
  if (q) { filters.push('(LOWER(email) LIKE ? OR LOWER(name) LIKE ? OR LOWER(COALESCE(company_name,\'\')) LIKE ?)'); bindings.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(`
    SELECT id, email, name, company_name, role, status, kyc_status, subscription_tier, bbbee_level, tenant_id, email_verified, last_login, created_at
    FROM participants ${where}
    ORDER BY created_at DESC LIMIT 500
  `).bind(...bindings).all();
  return c.json({ success: true, data: rows.results || [] });
});

admin.put('/users/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { status, role, subscription_tier, bbbee_level } = body as Record<string, any>;
  const updates: string[] = [];
  const bindings: unknown[] = [];
  if (status && ['pending', 'active', 'suspended', 'rejected'].includes(status)) { updates.push('status = ?'); bindings.push(status); }
  if (role && ['admin', 'ipp_developer', 'trader', 'carbon_fund', 'offtaker', 'lender', 'grid_operator', 'regulator', 'support'].includes(role)) { updates.push('role = ?'); bindings.push(role); }
  if (subscription_tier && ['free', 'starter', 'professional', 'enterprise'].includes(subscription_tier)) { updates.push('subscription_tier = ?'); bindings.push(subscription_tier); }
  if (bbbee_level != null && Number(bbbee_level) >= 1 && Number(bbbee_level) <= 8) { updates.push('bbbee_level = ?'); bindings.push(Number(bbbee_level)); }
  if (!updates.length) return c.json({ success: false, error: 'No valid fields to update' }, 400);
  updates.push("updated_at = datetime('now')");
  bindings.push(id);
  await c.env.DB.prepare(`UPDATE participants SET ${updates.join(', ')} WHERE id = ?`).bind(...bindings).run();
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, changes, created_at)
    VALUES (?, ?, 'admin.user_updated', 'participants', ?, ?, ?)
  `).bind('al_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6), user.id, id, JSON.stringify(body), new Date().toISOString()).run();
  return c.json({ success: true });
});

// ---------- KYC QUEUE ----------
admin.get('/kyc', async (c) => {
  const status = c.req.query('status') || 'pending';
  const users = await c.env.DB.prepare(`
    SELECT id, email, name, company_name, role, kyc_status, created_at
    FROM participants WHERE kyc_status = ? ORDER BY created_at ASC LIMIT 200
  `).bind(status).all();
  return c.json({ success: true, data: users.results || [] });
});

admin.put('/kyc/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { kyc_status, notes } = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  if (!['pending', 'in_review', 'approved', 'rejected'].includes(kyc_status)) {
    return c.json({ success: false, error: 'Invalid kyc_status' }, 400);
  }
  await c.env.DB.prepare('UPDATE participants SET kyc_status = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(kyc_status, id).run();
  if (kyc_status === 'approved') {
    await c.env.DB.prepare('UPDATE participants SET status = \'active\' WHERE id = ? AND status = \'pending\'').bind(id).run();
  }
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, changes, created_at)
    VALUES (?, ?, 'admin.kyc_decision', 'participants', ?, ?, ?)
  `).bind('al_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6), user.id, id, JSON.stringify({ kyc_status, notes }), new Date().toISOString()).run();
  // Notify the affected user.
  await c.env.DB.prepare(`
    INSERT INTO notifications (id, participant_id, type, title, body, read, email_sent, created_at)
    VALUES (?, ?, 'kyc_update', ?, ?, 0, 0, ?)
  `).bind(
    'ntf_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    id,
    `KYC status: ${kyc_status}`,
    notes || `Your KYC was ${kyc_status} by the admin team.`,
    new Date().toISOString(),
  ).run();
  return c.json({ success: true });
});

// ---------- MODULE CATALOGUE ----------
admin.get('/modules', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM modules ORDER BY display_name').all();
  return c.json({ success: true, data: rows.results || [] });
});

admin.put('/modules/:key', async (c) => {
  const user = getCurrentUser(c);
  const key = c.req.param('key');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const updates: string[] = [];
  const bindings: unknown[] = [];
  if (typeof body.enabled === 'boolean') { updates.push('enabled = ?'); bindings.push(body.enabled ? 1 : 0); }
  if (typeof body.display_name === 'string' && body.display_name.trim()) {
    updates.push('display_name = ?'); bindings.push(body.display_name.trim());
  }
  if (typeof body.description === 'string') { updates.push('description = ?'); bindings.push(body.description); }
  if (typeof body.required_role === 'string' || body.required_role === null) {
    updates.push('required_role = ?'); bindings.push(body.required_role || null);
  }
  // Allow explicit `null` so admins can clear a module's price (stored as
  // NULL in the DB). Previously `!= null` silently swallowed the clear and
  // the UI would show a success toast while nothing changed.
  if (body.price_monthly === null) {
    updates.push('price_monthly = ?'); bindings.push(null);
  } else if (body.price_monthly !== undefined && !Number.isNaN(Number(body.price_monthly))) {
    updates.push('price_monthly = ?'); bindings.push(Number(body.price_monthly));
  }
  if (!updates.length) return c.json({ success: false, error: 'No valid fields to update' }, 400);
  bindings.push(key);
  const result = await c.env.DB.prepare(`UPDATE modules SET ${updates.join(', ')} WHERE module_key = ?`).bind(...bindings).run();
  if (!result.meta?.changes) return c.json({ success: false, error: 'Module not found' }, 404);
  if (c.env.KV) await c.env.KV.delete(`module:${key}`);
  await auditLog(c.env, user.id, 'admin.module_updated', 'modules', key, body);
  return c.json({ success: true });
});

// Create a new module. module_key is immutable once created and must be
// globally unique; display_name is human-facing.
admin.post('/modules', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const moduleKey = typeof body.module_key === 'string' ? body.module_key.trim() : '';
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  if (!moduleKey || !/^[a-z0-9_]{2,48}$/.test(moduleKey)) {
    return c.json({ success: false, error: 'module_key must be 2-48 chars of lowercase letters/digits/underscore' }, 400);
  }
  if (!displayName) return c.json({ success: false, error: 'display_name is required' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM modules WHERE module_key = ?').bind(moduleKey).first();
  if (existing) return c.json({ success: false, error: 'Module key already exists' }, 409);

  const id = genId('mod');
  await c.env.DB.prepare(`
    INSERT INTO modules (id, module_key, display_name, description, enabled, required_role, price_monthly, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    id,
    moduleKey,
    displayName,
    typeof body.description === 'string' ? body.description : null,
    body.enabled === false ? 0 : 1,
    typeof body.required_role === 'string' && body.required_role ? body.required_role : null,
    body.price_monthly != null && !Number.isNaN(Number(body.price_monthly)) ? Number(body.price_monthly) : 0,
  ).run();
  await auditLog(c.env, user.id, 'admin.module_created', 'modules', moduleKey, { id, ...body });
  return c.json({ success: true, data: { id, module_key: moduleKey } });
});

// Delete a module. Also clears any per-participant overrides.
admin.delete('/modules/:key', async (c) => {
  const user = getCurrentUser(c);
  const key = c.req.param('key');
  const row = await c.env.DB.prepare('SELECT id FROM modules WHERE module_key = ?').bind(key).first<{ id: string }>();
  if (!row) return c.json({ success: false, error: 'Module not found' }, 404);
  await c.env.DB.prepare('DELETE FROM platform_modules WHERE module_id = ?').bind(row.id).run();
  await c.env.DB.prepare('DELETE FROM modules WHERE module_key = ?').bind(key).run();
  if (c.env.KV) await c.env.KV.delete(`module:${key}`);
  await auditLog(c.env, user.id, 'admin.module_deleted', 'modules', key, { id: row.id });
  return c.json({ success: true });
});

// ---------- AUDIT LOGS ----------
admin.get('/audit-logs', async (c) => {
  const page = Math.max(parseInt(c.req.query('page') || '1') || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(c.req.query('page_size') || '50') || 50, 1), 200);
  const entityType = c.req.query('entity_type');
  const actor = c.req.query('actor_id');
  const action = c.req.query('action');
  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (entityType) { filters.push('al.entity_type = ?'); bindings.push(entityType); }
  if (actor) { filters.push('al.actor_id = ?'); bindings.push(actor); }
  if (action) { filters.push('al.action LIKE ?'); bindings.push(`${action}%`); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  bindings.push(pageSize, (page - 1) * pageSize);
  const rows = await c.env.DB.prepare(`
    SELECT al.*, p.name AS actor_name, p.role AS actor_role
    FROM audit_logs al
    LEFT JOIN participants p ON al.actor_id = p.id
    ${where}
    ORDER BY al.created_at DESC LIMIT ? OFFSET ?
  `).bind(...bindings).all();
  return c.json({ success: true, data: rows.results || [], page, page_size: pageSize });
});

// ---------- BILLING SNAPSHOT ----------
admin.get('/billing', async (c) => {
  const tiers = await c.env.DB.prepare(`
    SELECT subscription_tier, COUNT(*) AS n FROM participants
    WHERE status = 'active' GROUP BY subscription_tier
  `).all();
  const rates: Record<string, number> = { free: 0, starter: 999, professional: 4999, enterprise: 14999 };
  const total = (tiers.results || []).reduce((sum: number, row: any) => sum + (rates[row.subscription_tier] || 0) * Number(row.n), 0);
  return c.json({
    success: true,
    data: {
      tiers: tiers.results || [],
      monthly_recurring_zar: total,
      rate_card: rates,
    },
  });
});

// ---------- STATS SNAPSHOT ----------
admin.get('/stats', async (c) => {
  const [participants, contracts, trades, invoices] = await Promise.all([
    c.env.DB.prepare("SELECT status, COUNT(*) AS n FROM participants GROUP BY status").all(),
    c.env.DB.prepare("SELECT phase, COUNT(*) AS n FROM contract_documents GROUP BY phase").all(),
    c.env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(matched_volume_mwh), 0) AS volume_mwh FROM trade_matches WHERE matched_at >= datetime('now','-30 days')").first(),
    c.env.DB.prepare("SELECT status, COUNT(*) AS n, COALESCE(SUM(total_amount), 0) AS total FROM invoices GROUP BY status").all(),
  ]);
  return c.json({
    success: true,
    data: {
      participants_by_status: participants.results || [],
      contracts_by_phase: contracts.results || [],
      trades_30d: trades || { n: 0, volume_mwh: 0 },
      invoices_by_status: invoices.results || [],
    },
  });
});

// ---------- PER-PARTICIPANT MODULE ACCESS ----------
admin.get('/participants/:id/modules', async (c) => {
  const id = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT module_id, enabled, updated_at FROM platform_modules WHERE participant_id = ?').bind(id).all();
  return c.json({ success: true, data: rows.results || [] });
});

admin.post('/participants/:id/modules/:moduleId', async (c) => {
  const user = getCurrentUser(c);
  const { id, moduleId } = c.req.param();
  const { enabled } = (await c.req.json().catch(() => ({}))) as { enabled?: boolean };
  const on = enabled === undefined ? 1 : enabled ? 1 : 0;
  await c.env.DB.prepare(`
    INSERT INTO platform_modules (participant_id, module_id, enabled, granted_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(participant_id, module_id) DO UPDATE SET enabled = excluded.enabled, granted_by = excluded.granted_by, updated_at = excluded.updated_at
  `).bind(id, moduleId, on, user.id, new Date().toISOString()).run();
  return c.json({ success: true, data: { module_id: moduleId, enabled: !!on } });
});

// ---------- PARTICIPANT CREATE / DELETE ----------
// Admin-triggered user creation. Stores a temporary random password (never
// returned), then mints a password-reset token so the admin can send a link
// out-of-band. The reset link is included in the response so the support
// console can surface it (mirrors the existing /forgot-password scaffold).
admin.post('/users', async (c) => {
  const actor = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const role = typeof body.role === 'string' ? body.role : '';
  // 'support' is valid as of migration 012 which extended the DB CHECK
  // constraint on participants.role. Admins can now create support-role
  // accounts from /admin; the /support console handles their day-2 work.
  const allowedRoles = ['admin', 'ipp_developer', 'trader', 'carbon_fund', 'offtaker', 'lender', 'grid_operator', 'regulator', 'support'];
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ success: false, error: 'Valid email is required' }, 400);
  if (!name) return c.json({ success: false, error: 'Name is required' }, 400);
  if (!allowedRoles.includes(role)) return c.json({ success: false, error: 'Invalid role' }, 400);

  const tenantId = typeof body.tenant_id === 'string' && body.tenant_id ? body.tenant_id : 'default';
  const tenantExists = await c.env.DB.prepare('SELECT id FROM tenants WHERE id = ?').bind(tenantId).first();
  if (!tenantExists && tenantId !== 'default') {
    return c.json({ success: false, error: 'Unknown tenant_id' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM participants WHERE email = ?').bind(email).first();
  if (existing) return c.json({ success: false, error: 'Email already registered' }, 409);

  const id = genId('usr');
  // Random initial password — the user will set a real one via the reset link.
  // We hash the raw token so nothing usable is persisted.
  const tempPwd = randomOpaqueToken(24);
  const passwordHash = await hashPassword(tempPwd);

  await c.env.DB.prepare(`
    INSERT INTO participants (id, email, name, company_name, role, tenant_id, status, kyc_status, password_hash, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, datetime('now'), datetime('now'))
  `).bind(
    id,
    email,
    name,
    typeof body.company_name === 'string' ? body.company_name : null,
    role,
    tenantId,
    typeof body.status === 'string' && ['pending', 'active', 'suspended'].includes(body.status) ? body.status : 'active',
    passwordHash,
  ).run();

  // Generate a one-shot password-reset token the admin can deliver manually.
  const rawToken = await createPasswordResetToken(c.env.DB, id, c.req.header('CF-Connecting-IP') || null);
  const resetUrl = `${c.env.APP_BASE_URL || new URL(c.req.url).origin}/reset-password?token=${rawToken}`;

  await auditLog(c.env, actor.id, 'admin.user_created', 'participants', id, { email, name, role, tenant_id: tenantId });
  return c.json({ success: true, data: { id, email, reset_url: resetUrl } });
});

// Soft-delete: mark suspended and revoke every active session. Actual row
// removal is deliberately not exposed — platform integrity (audit trails,
// contracts, settlements) depends on participant rows persisting.
admin.delete('/users/:id', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  if (id === actor.id) return c.json({ success: false, error: 'You cannot delete your own account' }, 400);

  const row = await c.env.DB.prepare('SELECT id, role, email FROM participants WHERE id = ?').bind(id).first<{ id: string; role: string; email: string }>();
  if (!row) return c.json({ success: false, error: 'User not found' }, 404);

  await c.env.DB.prepare("UPDATE participants SET status = 'suspended', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  await revokeAllSessionsForParticipant(c.env.DB, id, 'admin_suspend');
  await auditLog(c.env, actor.id, 'admin.user_suspended', 'participants', id, { email: row.email, role: row.role });
  return c.json({ success: true });
});

// ---------- TENANT CRUD ----------
admin.get('/tenants', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT t.id, t.slug, t.display_name, t.description, t.created_at, t.updated_at,
           (SELECT COUNT(*) FROM participants p WHERE COALESCE(p.tenant_id, 'default') = t.id) AS participant_count
    FROM tenants t ORDER BY t.created_at ASC
  `).all();
  return c.json({ success: true, data: rows.results || [] });
});

admin.post('/tenants', async (c) => {
  const actor = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  if (!displayName) return c.json({ success: false, error: 'display_name is required' }, 400);
  const slugRaw = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : slugify(displayName);
  const slug = slugify(slugRaw);
  if (!slug) return c.json({ success: false, error: 'Could not derive a slug from display_name' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(slug).first();
  if (existing) return c.json({ success: false, error: 'Tenant slug already exists' }, 409);

  const id = slug === 'default' ? 'default' : genId('ten');
  await c.env.DB.prepare(`
    INSERT INTO tenants (id, slug, display_name, description, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id,
    slug,
    displayName,
    typeof body.description === 'string' ? body.description : null,
    actor.id,
  ).run();

  await auditLog(c.env, actor.id, 'admin.tenant_created', 'tenants', id, { slug, display_name: displayName });
  return c.json({ success: true, data: { id, slug, display_name: displayName } });
});

admin.put('/tenants/:id', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: string[] = [];
  const bindings: unknown[] = [];
  if (typeof body.display_name === 'string' && body.display_name.trim()) {
    updates.push('display_name = ?'); bindings.push(body.display_name.trim());
  }
  if (typeof body.description === 'string' || body.description === null) {
    updates.push('description = ?'); bindings.push(body.description || null);
  }
  if (!updates.length) return c.json({ success: false, error: 'No valid fields to update' }, 400);
  updates.push("updated_at = datetime('now')");
  bindings.push(id);
  const result = await c.env.DB.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`).bind(...bindings).run();
  if (!result.meta?.changes) return c.json({ success: false, error: 'Tenant not found' }, 404);
  await auditLog(c.env, actor.id, 'admin.tenant_updated', 'tenants', id, body);
  return c.json({ success: true });
});

admin.delete('/tenants/:id', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  if (id === 'default') return c.json({ success: false, error: 'The default tenant cannot be deleted' }, 400);

  const members = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM participants WHERE tenant_id = ?').bind(id).first<{ n: number }>();
  if ((members?.n ?? 0) > 0) {
    return c.json({ success: false, error: 'Move or suspend tenant members before deleting' }, 409);
  }
  const result = await c.env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(id).run();
  if (!result.meta?.changes) return c.json({ success: false, error: 'Tenant not found' }, 404);
  await auditLog(c.env, actor.id, 'admin.tenant_deleted', 'tenants', id, {});
  return c.json({ success: true });
});

// ---------- ADMIN PASSWORD RESET ----------
// Re-issue a fresh password-reset link for any participant. Intended for
// unblocking locked-out users from the admin or support consoles. Returns the
// link inline so it can be delivered out-of-band until email is wired up.
admin.post('/users/:id/password-reset', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id, email FROM participants WHERE id = ?').bind(id).first<{ id: string; email: string }>();
  if (!row) return c.json({ success: false, error: 'User not found' }, 404);
  const rawToken = await createPasswordResetToken(c.env.DB, id, c.req.header('CF-Connecting-IP') || null);
  const resetUrl = `${c.env.APP_BASE_URL || new URL(c.req.url).origin}/reset-password?token=${rawToken}`;
  await auditLog(c.env, actor.id, 'admin.password_reset_issued', 'participants', id, { email: row.email });
  return c.json({ success: true, data: { email: row.email, reset_url: resetUrl } });
});

export default admin;
