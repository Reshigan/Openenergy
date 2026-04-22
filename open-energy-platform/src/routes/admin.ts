// Admin Routes — platform console. KYC queue, tenant/user management, module
// catalogue, audit log viewer, billing snapshot, system stats. Restricted to
// role=admin. Audit-log writer is idempotent across writes.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

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
  if (role && ['admin', 'ipp_developer', 'trader', 'carbon_fund', 'offtaker', 'lender', 'grid_operator', 'regulator'].includes(role)) { updates.push('role = ?'); bindings.push(role); }
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
  const { enabled } = (await c.req.json().catch(() => ({}))) as { enabled?: boolean };
  await c.env.DB.prepare('UPDATE modules SET enabled = ? WHERE module_key = ?').bind(enabled ? 1 : 0, key).run();
  if (c.env.KV) await c.env.KV.delete(`module:${key}`);
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, changes, created_at)
    VALUES (?, ?, 'admin.module_toggle', 'modules', ?, ?, ?)
  `).bind('al_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6), user.id, key, JSON.stringify({ enabled: !!enabled }), new Date().toISOString()).run();
  return c.json({ success: true });
});

// ---------- AUDIT LOGS ----------
admin.get('/audit-logs', async (c) => {
  const page = Math.max(parseInt(c.req.query('page') || '1'), 1);
  const pageSize = Math.min(parseInt(c.req.query('page_size') || '50'), 200);
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

export default admin;
