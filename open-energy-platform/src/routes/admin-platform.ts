// ═══════════════════════════════════════════════════════════════════════════
// Platform-admin suite — tenants, subscriptions, billing, feature flags,
// per-tenant SSO. Mounted at /api/admin-platform.
// All routes require admin role unless explicitly noted.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { evaluateFlag, coerceFlagValue, FlagDef, FlagOverride } from '../utils/feature-flags';
import { fireCascade } from '../utils/cascade';

const pa = new Hono<HonoEnv>();
pa.use('*', authMiddleware);

function requireAdmin(role: string): boolean {
  return role === 'admin';
}
function genId(p: string) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// ─── Tenants ───────────────────────────────────────────────────────────────
pa.get('/tenants', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT t.*,
            (SELECT COUNT(*) FROM participants p WHERE p.tenant_id = t.id) AS participant_count,
            (SELECT plan_id FROM tenant_subscriptions s
              WHERE s.tenant_id = t.id AND s.status = 'active'
              ORDER BY s.period_end DESC LIMIT 1) AS active_plan_id
       FROM tenants t ORDER BY t.created_at DESC LIMIT 500`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

pa.post('/tenants', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.name) return c.json({ success: false, error: 'name required' }, 400);
  const id = (b.id as string) || genId('t');
  await c.env.DB.prepare(
    `INSERT INTO tenants
       (id, name, legal_entity, registration_number, vat_number,
        primary_contact_email, primary_contact_phone, billing_email,
        country, tier, status, activated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`,
  ).bind(
    id, b.name, b.legal_entity || null, b.registration_number || null, b.vat_number || null,
    b.primary_contact_email || null, b.primary_contact_phone || null, b.billing_email || null,
    b.country || 'ZA', b.tier || 'standard',
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

pa.post('/tenants/:id/suspend', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE tenants SET status = 'suspended', suspended_at = datetime('now') WHERE id = ?`,
  ).bind(id).run();
  return c.json({ success: true });
});

pa.post('/tenants/:id/reactivate', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE tenants SET status = 'active', suspended_at = NULL WHERE id = ?`,
  ).bind(id).run();
  return c.json({ success: true });
});

// ─── Self-serve provisioning ───────────────────────────────────────────────
// Public-ish: anyone can submit a request (but admin approves).
pa.post('/provisioning-requests', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['requested_name', 'admin_email']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('prov');
  await c.env.DB.prepare(
    `INSERT INTO tenant_provisioning_requests
       (id, requested_name, requested_tier, admin_email, admin_name, legal_entity,
        registration_number, vat_number, country, expected_participants, primary_use_case, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
  ).bind(
    id, b.requested_name, b.requested_tier || 'trial', b.admin_email,
    b.admin_name || null, b.legal_entity || null, b.registration_number || null,
    b.vat_number || null, b.country || 'ZA',
    b.expected_participants == null ? null : Number(b.expected_participants),
    b.primary_use_case || null,
  ).run();
  return c.json({ success: true, data: { id, status: 'pending' } }, 201);
});

pa.get('/provisioning-requests', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const status = c.req.query('status') || 'pending';
  const rs = await c.env.DB.prepare(
    `SELECT * FROM tenant_provisioning_requests WHERE status = ? ORDER BY created_at DESC LIMIT 200`,
  ).bind(status).all();
  return c.json({ success: true, data: rs.results || [] });
});

pa.post('/provisioning-requests/:id/approve', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const id = c.req.param('id');
  const req = await c.env.DB.prepare(
    `SELECT * FROM tenant_provisioning_requests WHERE id = ?`,
  ).bind(id).first<{ requested_name: string; requested_tier: string; legal_entity: string | null; registration_number: string | null; vat_number: string | null; country: string | null; admin_email: string; status: string }>();
  if (!req) return c.json({ success: false, error: 'Request not found' }, 404);
  if (req.status !== 'pending') return c.json({ success: false, error: `Already ${req.status}` }, 400);

  const tenantId = genId('t');
  await c.env.DB.prepare(
    `INSERT INTO tenants
       (id, name, legal_entity, registration_number, vat_number, primary_contact_email,
        country, tier, status, activated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`,
  ).bind(
    tenantId, req.requested_name, req.legal_entity, req.registration_number,
    req.vat_number, req.admin_email, req.country, req.requested_tier,
  ).run();

  // Auto-create a trial subscription (30 days) for trial tier requests.
  if (req.requested_tier === 'trial') {
    await c.env.DB.prepare(
      `INSERT INTO tenant_subscriptions
         (id, tenant_id, plan_id, period_start, period_end, billing_frequency, amount_zar, status, auto_renew)
       VALUES (?, ?, 'tp_trial', date('now'), date('now','+30 days'), 'monthly', 0, 'trialing', 0)`,
    ).bind(genId('sub'), tenantId).run();
  }

  await c.env.DB.prepare(
    `UPDATE tenant_provisioning_requests
        SET status = 'approved', approved_tenant_id = ?, approved_by = ?, approved_at = datetime('now')
      WHERE id = ?`,
  ).bind(tenantId, user.id, id).run();

  await fireCascade({
    event: 'tenant.provisioned',
    actor_id: user.id,
    entity_type: 'tenants',
    entity_id: tenantId,
    data: { tenant_id: tenantId, tier: req.requested_tier },
    env: c.env,
  });

  return c.json({ success: true, data: { tenant_id: tenantId } });
});

pa.post('/provisioning-requests/:id/reject', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  await c.env.DB.prepare(
    `UPDATE tenant_provisioning_requests
        SET status = 'rejected', rejection_reason = ?, approved_by = ?, approved_at = datetime('now')
      WHERE id = ?`,
  ).bind(b.reason || null, user.id, id).run();
  return c.json({ success: true });
});

// ─── Subscriptions & billing ───────────────────────────────────────────────
pa.get('/plans', async (c) => {
  const rs = await c.env.DB.prepare(`SELECT * FROM tenant_plans ORDER BY base_monthly_zar`).all();
  return c.json({ success: true, data: rs.results || [] });
});

pa.post('/subscriptions', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['tenant_id', 'plan_id', 'period_start', 'period_end', 'billing_frequency', 'amount_zar']) {
    if (b[k] == null) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('sub');
  await c.env.DB.prepare(
    `INSERT INTO tenant_subscriptions
       (id, tenant_id, plan_id, period_start, period_end, billing_frequency, amount_zar, status, auto_renew)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).bind(
    id, b.tenant_id, b.plan_id, b.period_start, b.period_end,
    b.billing_frequency, Number(b.amount_zar), b.auto_renew === false ? 0 : 1,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

pa.post('/invoices/run', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const periodStart = (b.period_start as string) || new Date().toISOString().slice(0, 7) + '-01';
  const periodEnd = (b.period_end as string) || new Date().toISOString().slice(0, 10);

  const subs = await c.env.DB.prepare(
    `SELECT s.id AS subscription_id, s.tenant_id, s.amount_zar, t.name AS tenant_name, t.vat_number
       FROM tenant_subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
      WHERE s.status IN ('active','trialing')
        AND s.period_start <= ? AND s.period_end >= ?`,
  ).bind(periodEnd, periodStart).all<{
    subscription_id: string; tenant_id: string; amount_zar: number;
    tenant_name: string; vat_number: string | null;
  }>();

  let issued = 0;
  for (const s of subs.results || []) {
    if (s.amount_zar <= 0) continue;
    const vat = s.amount_zar * 0.15;
    const total = s.amount_zar + vat;
    const id = genId('tinv');
    const invNum = `OE-${new Date().getFullYear()}-${id.slice(-8).toUpperCase()}`;
    await c.env.DB.prepare(
      `INSERT INTO tenant_invoices
         (id, tenant_id, subscription_id, invoice_number, period_start, period_end,
          line_items_json, subtotal_zar, vat_rate, vat_zar, total_zar, status, issued_at, due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.15, ?, ?, 'issued', datetime('now'), date('now','+30 days'))`,
    ).bind(
      id, s.tenant_id, s.subscription_id, invNum, periodStart, periodEnd,
      JSON.stringify([{ description: 'Platform subscription', amount_zar: s.amount_zar }]),
      s.amount_zar, vat, total,
    ).run();
    issued++;
  }
  return c.json({ success: true, data: { invoices_issued: issued } });
});

pa.get('/invoices', async (c) => {
  const tenantId = c.req.query('tenant_id');
  const rs = tenantId
    ? await c.env.DB.prepare(
        `SELECT * FROM tenant_invoices WHERE tenant_id = ? ORDER BY issued_at DESC LIMIT 100`,
      ).bind(tenantId).all()
    : await c.env.DB.prepare(
        `SELECT * FROM tenant_invoices ORDER BY issued_at DESC LIMIT 100`,
      ).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Feature flags ─────────────────────────────────────────────────────────
pa.get('/flags', async (c) => {
  const rs = await c.env.DB.prepare(`SELECT * FROM feature_flags ORDER BY flag_key`).all();
  return c.json({ success: true, data: rs.results || [] });
});

pa.post('/flags', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.flag_key) return c.json({ success: false, error: 'flag_key required' }, 400);
  const id = genId('ff');
  await c.env.DB.prepare(
    `INSERT INTO feature_flags
       (id, flag_key, description, default_value, rollout_strategy, rollout_config_json, enabled, created_by)
     VALUES (?, ?, ?, ?, COALESCE(?, 'off'), ?, COALESCE(?, 1), ?)`,
  ).bind(
    id, b.flag_key, b.description || null,
    (b.default_value as string) || 'false',
    b.rollout_strategy || null,
    typeof b.rollout_config === 'object' ? JSON.stringify(b.rollout_config) : null,
    b.enabled === false ? 0 : null, user.id,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

pa.put('/flags/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const sets: string[] = ['updated_at = datetime(\'now\')'];
  const binds: unknown[] = [];
  for (const k of ['description', 'default_value', 'rollout_strategy'] as const) {
    if (k in b) { sets.push(`${k} = ?`); binds.push(b[k] == null ? null : String(b[k])); }
  }
  if ('rollout_config' in b) {
    sets.push('rollout_config_json = ?');
    binds.push(typeof b.rollout_config === 'object' ? JSON.stringify(b.rollout_config) : null);
  }
  if ('enabled' in b) {
    sets.push('enabled = ?');
    binds.push(b.enabled ? 1 : 0);
  }
  binds.push(id);
  await c.env.DB.prepare(`UPDATE feature_flags SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return c.json({ success: true });
});

pa.post('/flags/:id/overrides', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const flagId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.value) return c.json({ success: false, error: 'value required' }, 400);
  if (!b.tenant_id && !b.participant_id) {
    return c.json({ success: false, error: 'tenant_id or participant_id required' }, 400);
  }
  const id = genId('ffo');
  await c.env.DB.prepare(
    `INSERT INTO feature_flag_overrides (id, flag_id, tenant_id, participant_id, value, reason, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, flagId, b.tenant_id || null, b.participant_id || null,
    String(b.value), b.reason || null, b.expires_at || null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

pa.get('/flags/evaluate/:flag_key', async (c) => {
  const user = getCurrentUser(c);
  const flagKey = c.req.param('flag_key');
  const flag = await c.env.DB.prepare(
    `SELECT * FROM feature_flags WHERE flag_key = ?`,
  ).bind(flagKey).first<FlagDef & { id: string }>();
  if (!flag) return c.json({ success: false, error: 'Flag not found' }, 404);
  const overridesRs = await c.env.DB.prepare(
    `SELECT tenant_id, participant_id, value, expires_at FROM feature_flag_overrides WHERE flag_id = ?`,
  ).bind(flag.id).all<FlagOverride>();
  const tier = (await c.env.DB.prepare(
    `SELECT tier FROM tenants WHERE id = ?`,
  ).bind(user.tenant_id || 'default').first<{ tier: string }>())?.tier || 'standard';

  const result = evaluateFlag(
    {
      flag_key: flag.flag_key, default_value: flag.default_value,
      rollout_strategy: flag.rollout_strategy, rollout_config_json: flag.rollout_config_json,
      enabled: !!flag.enabled,
    },
    overridesRs.results || [],
    {
      tenant_id: user.tenant_id || 'default',
      participant_id: user.id,
      tier,
      role: user.role,
    },
  );
  return c.json({
    success: true,
    data: {
      flag_key: flagKey,
      value: coerceFlagValue(result.value),
      raw_value: result.value,
      matched_override: result.matched_override,
      strategy: result.strategy,
    },
  });
});

// ─── Per-tenant SSO ────────────────────────────────────────────────────────
pa.post('/tenants/:id/sso', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const tenantId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['provider_type', 'client_id']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('tsso');
  await c.env.DB.prepare(
    `INSERT INTO tenant_sso_providers
       (id, tenant_id, provider_type, display_name, client_id, tenant_identifier,
        issuer_url, auth_endpoint, token_endpoint, jwks_url, client_secret_kv_key,
        redirect_uri, allowed_email_domains, jit_role, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'offtaker'), COALESCE(?, 1))`,
  ).bind(
    id, tenantId, b.provider_type, b.display_name || null,
    b.client_id, b.tenant_identifier || null,
    b.issuer_url || null, b.auth_endpoint || null, b.token_endpoint || null,
    b.jwks_url || null, b.client_secret_kv_key || null,
    b.redirect_uri || null, b.allowed_email_domains || null,
    b.jit_role || null, b.enabled === false ? 0 : null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM tenant_sso_providers WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

pa.get('/tenants/:id/sso', async (c) => {
  const tenantId = c.req.param('id');
  const rs = await c.env.DB.prepare(
    `SELECT id, tenant_id, provider_type, display_name, client_id, tenant_identifier,
            issuer_url, auth_endpoint, redirect_uri, allowed_email_domains, jit_role, enabled
       FROM tenant_sso_providers WHERE tenant_id = ?`,
  ).bind(tenantId).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Usage snapshot (run by daily cron) ────────────────────────────────────
pa.post('/usage/snapshot', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const today = new Date().toISOString().slice(0, 10);
  const rs = await c.env.DB.prepare(
    `SELECT t.id AS tenant_id,
            COUNT(p.id) AS participant_count,
            SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) AS active_count
       FROM tenants t
       LEFT JOIN participants p ON p.tenant_id = t.id
      GROUP BY t.id`,
  ).all<{ tenant_id: string; participant_count: number; active_count: number }>();
  let snapshots = 0;
  for (const r of rs.results || []) {
    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO tenant_usage_snapshots
         (id, tenant_id, snapshot_date, participant_count, active_participant_count, seat_count, api_calls_count, storage_bytes)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
    ).bind(
      genId('tus'), r.tenant_id, today,
      r.participant_count, r.active_count, r.active_count,
    ).run();
    snapshots++;
  }
  return c.json({ success: true, data: { snapshots } });
});

export default pa;
