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
import { cachedAll } from '../utils/reference-cache';
import { appendAudit, getChainHead, verifyChain } from '../utils/audit-chain';
import { badEnum } from '../utils/validation';
// popia-access imports retained for future use in per-subject reads.
// import { logPiiAccess, inferAccessType } from '../utils/popia-access';

const pa = new Hono<HonoEnv>();
pa.use('*', authMiddleware);

function requireAdmin(role: string): boolean {
  return role === 'admin';
}
// Read access to the admin audit chain (head / events / export packs) —
// oversight roles only, matching the GET /audit/events gate.
function auditReadRole(role: string): boolean {
  return role === 'admin' || role === 'support' || role === 'regulator';
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
  // Migration 011 made tenants.slug NOT NULL UNIQUE. If the caller didn't
  // supply a slug we derive it from the id so the insert doesn't error.
  const slug = (b.slug as string) || id;
  await c.env.DB.prepare(
    `INSERT INTO tenants
       (id, slug, display_name, name, legal_entity, registration_number, vat_number,
        primary_contact_email, primary_contact_phone, billing_email,
        country, tier, status, activated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`,
  ).bind(
    id, slug, b.name as string, b.name as string,
    b.legal_entity || null, b.registration_number || null, b.vat_number || null,
    b.primary_contact_email || null, b.primary_contact_phone || null, b.billing_email || null,
    b.country || 'ZA', b.tier || 'standard',
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first();
  await fireCascade({
    event: 'tenant.provisioned',
    actor_id: user.id,
    entity_type: 'tenants',
    entity_id: id,
    data: { tenant_id: id, name: b.name, tier: b.tier || 'standard', source: 'admin_console' },
    env: c.env,
  });
  return c.json({ success: true, data: row }, 201);
});

pa.post('/tenants/:id/suspend', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const id = c.req.param('id');
  const tenant = await c.env.DB.prepare(`SELECT status FROM tenants WHERE id = ?`).bind(id).first<{ status: string }>();
  if (!tenant) return c.json({ success: false, error: 'Tenant not found' }, 404);
  if (tenant.status !== 'active') {
    return c.json({ success: false, error: `cannot suspend tenant in status '${tenant.status}'`, reason_code: 'TENANT_INVALID_TRANSITION' }, 409);
  }
  await c.env.DB.prepare(
    `UPDATE tenants SET status = 'suspended', suspended_at = datetime('now') WHERE id = ?`,
  ).bind(id).run();
  await fireCascade({
    event: 'tenant.suspended',
    actor_id: user.id,
    entity_type: 'tenants',
    entity_id: id,
    data: { tenant_id: id },
    env: c.env,
  });
  return c.json({ success: true });
});

pa.post('/tenants/:id/reactivate', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const id = c.req.param('id');
  const tenant = await c.env.DB.prepare(`SELECT status FROM tenants WHERE id = ?`).bind(id).first<{ status: string }>();
  if (!tenant) return c.json({ success: false, error: 'Tenant not found' }, 404);
  if (tenant.status !== 'suspended') {
    return c.json({ success: false, error: `cannot reactivate tenant in status '${tenant.status}'`, reason_code: 'TENANT_INVALID_TRANSITION' }, 409);
  }
  await c.env.DB.prepare(
    `UPDATE tenants SET status = 'active', suspended_at = NULL WHERE id = ?`,
  ).bind(id).run();
  await fireCascade({
    event: 'tenant.reactivated',
    actor_id: user.id,
    entity_type: 'tenants',
    entity_id: id,
    data: { tenant_id: id },
    env: c.env,
  });
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
  // Provisioning rows contain applicant admin_email + admin_name of people
  // who are NOT yet participants — so they can't be logged via
  // popia_pii_access_log (the subject_id FK expects participants.id). The
  // underlying audit_logs table already captures the admin action via
  // cascade when a request is approved/rejected. Leaving an explicit TODO
  // here so a future migration can introduce a `provisioning_pii_log` that
  // keeps pre-signup PII access separate.
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
       (id, slug, display_name, name, legal_entity, registration_number, vat_number, primary_contact_email,
        country, tier, status, activated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`,
  ).bind(
    tenantId, tenantId, req.requested_name, req.requested_name, req.legal_entity, req.registration_number,
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
  const existing = await c.env.DB.prepare(
    `SELECT status FROM tenant_provisioning_requests WHERE id = ?`,
  ).bind(id).first<{ status: string }>();
  if (!existing) return c.json({ success: false, error: 'Request not found' }, 404);
  if (existing.status !== 'pending') return c.json({ success: false, error: `Already ${existing.status}` }, 400);
  await c.env.DB.prepare(
    `UPDATE tenant_provisioning_requests
        SET status = 'rejected', rejection_reason = ?, approved_by = ?, approved_at = datetime('now')
      WHERE id = ?`,
  ).bind(b.reason || null, user.id, id).run();

  // Audit the admin's rejection — symmetric with the approve path's
  // tenant.provisioned cascade. Without this, a rejected tenant application
  // left no audit trail (the `tenant` prefix routes to the same audit chain).
  await fireCascade({
    event: 'tenant.provisioning_rejected',
    actor_id: user.id,
    entity_type: 'tenant_provisioning_requests',
    entity_id: id,
    data: { provisioning_request_id: id, reason: b.reason || null },
    env: c.env,
  });

  return c.json({ success: true });
});

// ─── Subscriptions & billing ───────────────────────────────────────────────
pa.get('/plans', async (c) => {
  // Plans change rarely (pricing changes are a product decision, not a
  // runtime event). Cache in KV for 1 hour.
  const rows = await cachedAll(
    c.env as unknown as { DB: HonoEnv['Bindings']['DB']; KV: HonoEnv['Bindings']['KV'] },
    'tenant_plans',
    `SELECT id, plan_code, plan_name, tier, base_monthly_zar,
            included_seats, extra_seat_zar, included_participants,
            extra_participant_zar, sla_uptime_pct, support_tier
       FROM tenant_plans ORDER BY base_monthly_zar`,
    { ttlSeconds: 3600 },
  );
  return c.json({ success: true, data: rows });
});

pa.post('/subscriptions', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['tenant_id', 'plan_id', 'period_start', 'period_end', 'billing_frequency', 'amount_zar']) {
    if (b[k] == null) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const bfErr = badEnum('billing_frequency', b.billing_frequency, ['monthly','quarterly','annual']);
  if (bfErr) return c.json({ success: false, error: bfErr }, 400);
  const id = genId('sub');
  await c.env.DB.prepare(
    `INSERT INTO tenant_subscriptions
       (id, tenant_id, plan_id, period_start, period_end, billing_frequency, amount_zar, status, auto_renew)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).bind(
    id, b.tenant_id, b.plan_id, b.period_start, b.period_end,
    b.billing_frequency, Number(b.amount_zar), b.auto_renew === false ? 0 : 1,
  ).run();

  await fireCascade({
    event: 'tenant.subscription_created',
    actor_id: user.id,
    entity_type: 'tenant_subscriptions',
    entity_id: id,
    data: {
      subscription_id: id,
      tenant_id: b.tenant_id,
      plan_id: b.plan_id,
      period_start: b.period_start,
      period_end: b.period_end,
      billing_frequency: b.billing_frequency,
      amount_zar: Number(b.amount_zar),
    },
    env: c.env,
  });

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

  const invStmts: D1PreparedStatement[] = [];
  for (const s of subs.results || []) {
    if (s.amount_zar <= 0) continue;
    const vat = s.amount_zar * 0.15;
    const total = s.amount_zar + vat;
    const id = genId('tinv');
    const invNum = `OE-${new Date().getFullYear()}-${id.slice(-8).toUpperCase()}`;
    invStmts.push(c.env.DB.prepare(
      `INSERT INTO tenant_invoices
         (id, tenant_id, subscription_id, invoice_number, period_start, period_end,
          line_items_json, subtotal_zar, vat_rate, vat_zar, total_zar, status, issued_at, due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.15, ?, ?, 'issued', datetime('now'), date('now','+30 days'))`,
    ).bind(
      id, s.tenant_id, s.subscription_id, invNum, periodStart, periodEnd,
      JSON.stringify([{ description: 'Platform subscription', amount_zar: s.amount_zar }]),
      s.amount_zar, vat, total,
    ));
  }
  for (let i = 0; i < invStmts.length; i += 100) await c.env.DB.batch(invStmts.slice(i, i + 100));
  const issued = invStmts.length;

  if (issued > 0) {
    await fireCascade({
      event: 'tenant.invoice_issued',
      actor_id: user.id,
      entity_type: 'tenant_invoices',
      entity_id: `run-${periodStart}-${periodEnd}`,
      data: {
        invoices_issued: issued,
        period_start: periodStart,
        period_end: periodEnd,
      },
      env: c.env,
    });
  }

  return c.json({ success: true, data: { invoices_issued: issued } });
});

pa.get('/invoices', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
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
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const rs = await c.env.DB.prepare(`SELECT * FROM feature_flags ORDER BY flag_key`).all();
  return c.json({ success: true, data: rs.results || [] });
});

pa.post('/flags', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.flag_key) return c.json({ success: false, error: 'flag_key required' }, 400);
  const rsErr = badEnum('rollout_strategy', b.rollout_strategy, ['off','all','percentage','by_tier','by_tenant','by_role']);
  if (rsErr) return c.json({ success: false, error: rsErr }, 400);
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
  // Audit feature-flag creation — prod config changes belong on the audit chain.
  await fireCascade({
    event: 'flag.changed',
    actor_id: user.id,
    entity_type: 'feature_flag',
    entity_id: id,
    data: { id, flag_key: b.flag_key, action: 'created', enabled: b.enabled === false ? 0 : 1, created_by: user.id },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

pa.put('/flags/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const rsErr = badEnum('rollout_strategy', b.rollout_strategy, ['off','all','percentage','by_tier','by_tenant','by_role']);
  if (rsErr) return c.json({ success: false, error: rsErr }, 400);
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
  // Bust the cache — we need the flag key to delete the right entry.
  const fkRow = await c.env.DB.prepare(
    `SELECT flag_key FROM feature_flags WHERE id = ?`,
  ).bind(id).first<{ flag_key: string }>();
  if (fkRow?.flag_key) {
    c.executionCtx?.waitUntil?.(invalidateFlagCache(c.env, fkRow.flag_key));
  }
  // Audit the flag change (which fields changed are in the payload).
  await fireCascade({
    event: 'flag.changed',
    actor_id: user.id,
    entity_type: 'feature_flag',
    entity_id: id,
    data: { id, flag_key: fkRow?.flag_key ?? null, action: 'updated', changed: Object.keys(b), updated_by: user.id },
    env: c.env,
  });
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
  // Bust the flag cache so the override applies on the next evaluation.
  const fkRow = await c.env.DB.prepare(
    `SELECT flag_key FROM feature_flags WHERE id = ?`,
  ).bind(flagId).first<{ flag_key: string }>();
  if (fkRow?.flag_key) {
    c.executionCtx?.waitUntil?.(invalidateFlagCache(c.env, fkRow.flag_key));
  }
  // Audit the per-tenant/participant flag override.
  await fireCascade({
    event: 'flag.override_set',
    actor_id: user.id,
    entity_type: 'feature_flag_override',
    entity_id: id,
    data: { id, flag_id: flagId, flag_key: fkRow?.flag_key ?? null, tenant_id: b.tenant_id || null, participant_id: b.participant_id || null, value: String(b.value), set_by: user.id },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

// COST: SPA clients sometimes evaluate a single flag on every page load.
// 3 D1 queries per call is excessive when the flag + its overrides + the
// tenant's tier change rarely. We cache the flag definition + overrides
// in KV (60 s TTL) and compute the per-user result in-memory. Admin flag
// mutations bust the cache via invalidateFlagCache() below.
//
// Worst case reduction:
//   Before: 3 D1 queries per evaluation.
//   After:  0 D1 + 2 KV gets on cache hit  (~20× cheaper).
const FLAG_CACHE_TTL_SECONDS = 60;
const FLAG_CACHE_PREFIX = 'flag:def:';

async function loadFlagDef(env: HonoEnv['Bindings'], flagKey: string): Promise<{
  flag: (FlagDef & { id: string }) | null;
  overrides: FlagOverride[];
}> {
  const key = FLAG_CACHE_PREFIX + flagKey;
  try {
    const cached = await env.KV.get(key, 'json') as
      | { flag: (FlagDef & { id: string }) | null; overrides: FlagOverride[] }
      | null;
    if (cached) return cached;
  } catch { /* fall through to D1 */ }

  const flag = await env.DB.prepare(
    `SELECT id, flag_key, description, default_value, rollout_strategy, rollout_config_json, enabled
       FROM feature_flags WHERE flag_key = ?`,
  ).bind(flagKey).first<FlagDef & { id: string }>();

  let overrides: FlagOverride[] = [];
  if (flag) {
    const rs = await env.DB.prepare(
      `SELECT tenant_id, participant_id, value, expires_at FROM feature_flag_overrides WHERE flag_id = ?`,
    ).bind(flag.id).all<FlagOverride>();
    overrides = rs.results || [];
  }

  const value = { flag, overrides };
  try {
    await env.KV.put(key, JSON.stringify(value), { expirationTtl: FLAG_CACHE_TTL_SECONDS });
  } catch { /* soft */ }
  return value;
}

const TIER_CACHE_PREFIX = 'tenant:tier:';
async function loadTenantTier(env: HonoEnv['Bindings'], tenantId: string): Promise<string> {
  const key = TIER_CACHE_PREFIX + tenantId;
  try {
    const cached = await env.KV.get(key);
    if (cached) return cached;
  } catch { /* */ }
  const row = await env.DB.prepare(
    `SELECT tier FROM tenants WHERE id = ?`,
  ).bind(tenantId).first<{ tier: string | null }>();
  const tier = row?.tier || 'standard';
  try { await env.KV.put(key, tier, { expirationTtl: 300 }); } catch { /* */ }
  return tier;
}

async function invalidateFlagCache(env: HonoEnv['Bindings'], flagKey: string): Promise<void> {
  try { await env.KV.delete(FLAG_CACHE_PREFIX + flagKey); } catch { /* */ }
}

pa.get('/flags/evaluate/:flag_key', async (c) => {
  const user = getCurrentUser(c);
  const flagKey = c.req.param('flag_key');
  const { flag, overrides } = await loadFlagDef(c.env, flagKey);
  if (!flag) return c.json({ success: false, error: 'Flag not found' }, 404);
  const tier = await loadTenantTier(c.env, user.tenant_id || 'default');

  const result = evaluateFlag(
    {
      flag_key: flag.flag_key, default_value: flag.default_value,
      rollout_strategy: flag.rollout_strategy, rollout_config_json: flag.rollout_config_json,
      enabled: !!flag.enabled,
    },
    overrides,
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
  const ptErr = badEnum('provider_type', b.provider_type, ['entra_id','okta','google_workspace','keycloak','auth0','saml','generic_oidc']);
  if (ptErr) return c.json({ success: false, error: ptErr }, 400);
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
  // Audit SSO provider configuration — an auth provider that JIT-provisions
  // users into a role is high-sensitivity and belongs on the audit chain.
  // (client_secret_kv_key is a KV pointer, not the secret; not logged here.)
  await fireCascade({
    event: 'tenant.sso_configured',
    actor_id: user.id,
    entity_type: 'tenant_sso_providers',
    entity_id: id,
    data: {
      id, tenant_id: tenantId, provider_type: b.provider_type,
      jit_role: b.jit_role || 'offtaker', enabled: b.enabled === false ? 0 : 1,
      configured_by: user.id,
    },
    env: c.env,
  });
  return c.json({ success: true, data: row }, 201);
});

pa.get('/tenants/:id/sso', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
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
  const rows = rs.results || [];
  // Batch all per-tenant snapshot writes into a single D1 round-trip rather
  // than one INSERT per tenant (was an N+1 over every tenant).
  if (rows.length > 0) {
    const insert = c.env.DB.prepare(
      `INSERT OR REPLACE INTO tenant_usage_snapshots
         (id, tenant_id, snapshot_date, participant_count, active_participant_count, seat_count, api_calls_count, storage_bytes)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
    );
    await c.env.DB.batch(
      rows.map((r) => insert.bind(
        genId('tus'), r.tenant_id, today,
        r.participant_count, r.active_count, r.active_count,
      )),
    );
  }
  return c.json({ success: true, data: { snapshots: rows.length } });
});

// ────────────────────────────────────────────────────────────────────────
// L4 endpoints — tenant lifecycle events, billing runs, flag overrides
// (migration 056). Layer audit + state on top of existing tenants /
// subscriptions / feature_flag tables.
// ────────────────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = ['created','suspended','activated','terminated','upgraded','downgraded','transferred','archived'];
const VALID_RUN_TYPES = ['monthly','quarterly','annual','adhoc','correction'];

pa.post('/tenant-events', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.tenant_id || !body.event_type) {
    return c.json({ success: false, error: 'tenant_id, event_type required' }, 400);
  }
  if (!VALID_EVENT_TYPES.includes(String(body.event_type))) {
    return c.json({ success: false, error: 'invalid event_type' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO admin_tenant_lifecycle_events
       (id, tenant_id, event_type, actor_id, reason, payload_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, body.tenant_id, body.event_type, user.id, body.reason || null, body.payload_json || null).run();

  await appendAudit({
    env: c.env, entity_type: 'admin', entity_id: body.tenant_id,
    event_type: `tenant.${body.event_type}`, actor_id: user.id,
    payload: {
      tenant_event_id: id, tenant_id: body.tenant_id,
      event_type: body.event_type, reason: body.reason || null,
    },
  }).catch((e) => console.warn('audit_tenant_event_failed', (e as Error).message));

  return c.json({ success: true, data: { id } });
});

pa.get('/tenant-events', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const tenantId = c.req.query('tenant_id');
  const where: string[] = [];
  const binds: unknown[] = [];
  if (tenantId) { where.push('tenant_id = ?'); binds.push(tenantId); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM admin_tenant_lifecycle_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY occurred_at DESC LIMIT 200`,
  ).bind(...binds).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

pa.post('/billing-runs', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.run_type || !body.period_start || !body.period_end) {
    return c.json({ success: false, error: 'run_type, period_start, period_end required' }, 400);
  }
  if (!VALID_RUN_TYPES.includes(String(body.run_type))) {
    return c.json({ success: false, error: 'invalid run_type' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO admin_billing_runs
       (id, run_type, period_start, period_end, status, initiated_by)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
  ).bind(id, body.run_type, body.period_start, body.period_end, user.id).run();
  return c.json({ success: true, data: { id } });
});

pa.get('/billing-runs', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const rows = await c.env.DB.prepare(
    `SELECT * FROM admin_billing_runs ORDER BY created_at DESC LIMIT 100`,
  ).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

pa.post('/flag-overrides', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.flag_key || !body.scope_type || body.new_value === undefined) {
    return c.json({ success: false, error: 'flag_key, scope_type, new_value required' }, 400);
  }
  const stErr = badEnum('scope_type', body.scope_type, ['global','tenant','user']);
  if (stErr) return c.json({ success: false, error: stErr }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO admin_feature_flag_overrides
       (id, flag_key, scope_type, scope_id, previous_value, new_value, actor_id, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, body.flag_key, body.scope_type, body.scope_id || null,
    body.previous_value || null, String(body.new_value), user.id, body.reason || null,
  ).run();

  await appendAudit({
    env: c.env, entity_type: 'admin', entity_id: id,
    event_type: 'flag.overridden', actor_id: user.id,
    payload: {
      flag_override_id: id, flag_key: body.flag_key,
      scope_type: body.scope_type, scope_id: body.scope_id || null,
      previous_value: body.previous_value || null,
      new_value: String(body.new_value),
      reason: body.reason || null,
    },
  }).catch((e) => console.warn('audit_flag_override_failed', (e as Error).message));

  return c.json({ success: true, data: { id } });
});

pa.get('/flag-overrides', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const flag = c.req.query('flag_key');
  const where: string[] = [];
  const binds: unknown[] = [];
  if (flag) { where.push('flag_key = ?'); binds.push(flag); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM admin_feature_flag_overrides ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY occurred_at DESC LIMIT 200`,
  ).bind(...binds).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

// ════════════════════════════════════════════════════════════════════════
// L5 — Admin: POPIA breach + tenant lifecycle audit, POPIA s.22 export,
// payment-processor / billing recon.
// ════════════════════════════════════════════════════════════════════════

pa.get('/audit/head', async (c) => {
  const user = getCurrentUser(c);
  if (!auditReadRole(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const head = await getChainHead(c.env, 'admin');
  return c.json({ success: true, data: head });
});

pa.get('/audit/events', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'support' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const limit = Math.min(200, Number(c.req.query('limit') || 50));
  const rs = await c.env.DB.prepare(
    `SELECT id, entity_id, event_type, actor_id, sequence_no, content_hash, prev_hash, created_at, payload_json
       FROM audit_events WHERE entity_type = 'admin'
      ORDER BY sequence_no DESC LIMIT ?`,
  ).bind(limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

pa.post('/audit/verify', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const fromSeq = Number(c.req.query('from_seq') || 1) || 1;
  const result = await verifyChain(c.env, 'admin', fromSeq);
  return c.json({ success: result.ok, data: result });
});

// POST /admin-platform/audit/export — POPIA s.22 breach register +
// s.11(3)/s.24 tenant lifecycle event register. Information Regulator
// SA quarterly submission format.
pa.post('/audit/export', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Admin only' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = body.from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = body.to || new Date().toISOString().slice(0, 10);

  const events = await c.env.DB.prepare(
    `SELECT id, tenant_id, event_type, actor_id, reason, occurred_at
       FROM admin_tenant_lifecycle_events
      WHERE substr(occurred_at, 1, 10) BETWEEN ? AND ?
      ORDER BY occurred_at ASC`,
  ).bind(from, to).all<any>().catch(() => ({ results: [] } as any));

  // POPIA s.22 breach register from popia_breaches if it exists.
  const breaches = await c.env.DB.prepare(
    `SELECT id, breach_date, detected_at, notified_information_regulator_at,
            description, severity, status
       FROM popia_breaches
      WHERE substr(detected_at, 1, 10) BETWEEN ? AND ?
      ORDER BY detected_at ASC`,
  ).bind(from, to).all<any>().catch(() => ({ results: [] } as any));

  const evRows = (events.results || []) as Array<Record<string, any>>;
  const brRows = (breaches.results || []) as Array<Record<string, any>>;

  const header = ['record_type','record_id','tenant_or_subject','occurred_at','event_or_severity','reason_or_description','status_or_actor'].join(',');
  const csvLines = [header];
  for (const r of evRows) {
    csvLines.push([
      'tenant_lifecycle', r.id, r.tenant_id, r.occurred_at,
      r.event_type, csvEscape(r.reason || ''), r.actor_id,
    ].join(','));
  }
  for (const r of brRows) {
    csvLines.push([
      'popia_breach', r.id, '', r.detected_at,
      r.severity, csvEscape(r.description || ''), r.status,
    ].join(','));
  }
  const csv = csvLines.join('\n') + '\n';
  const csvBytes = new TextEncoder().encode(csv);
  const csvSha = await sha256OfBytes(csvBytes);

  const head = await getChainHead(c.env, 'admin');
  const exportId = 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-exports/admin/${exportId}/popia-and-tenant-events.csv`;
  const manifestKey = `audit-exports/admin/${exportId}/manifest.json`;
  const manifest = {
    export_id: exportId, entity_type: 'admin', from, to,
    generated_at: new Date().toISOString(), generated_by: user.id,
    row_count: csvLines.length - 1,
    tenant_event_count: evRows.length, breach_count: brRows.length,
    csv: { r2_key: csvKey, sha256: csvSha, bytes: csvBytes.byteLength },
    chain: {
      head_hash: head?.head_hash || null,
      head_sequence: head?.head_sequence || 0,
      last_verified_at: head?.last_verified_at || null,
    },
    format: { profile: 'Information Regulator SA POPIA s.22 breach + s.11 lifecycle register v1', encoding: 'utf-8' },
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
     VALUES (?, 'admin', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(exportId, from, to, csvLines.length - 1, csvKey, manifestKey,
         head?.head_hash || '', user.id).run();

  await appendAudit({
    env: c.env, entity_type: 'admin', entity_id: exportId,
    event_type: 'audit.export_generated', actor_id: user.id,
    payload: { export_id: exportId, from, to, row_count: csvLines.length - 1, csv_sha256: csvSha },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { export_id: exportId, row_count: csvLines.length - 1, csv_r2_key: csvKey, manifest_r2_key: manifestKey, manifest },
  }, 201);
});

pa.get('/audit/exports', async (c) => {
  const user = getCurrentUser(c);
  if (!auditReadRole(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT id, from_ts, to_ts, row_count, csv_r2_key, manifest_r2_key,
            chain_head_hash, generated_by, generated_at
       FROM audit_exports WHERE entity_type = 'admin'
      ORDER BY generated_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

pa.get('/audit/exports/:id/manifest', async (c) => {
  const user = getCurrentUser(c);
  if (!auditReadRole(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT manifest_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'admin'`,
  ).bind(id).first<{ manifest_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.manifest_r2_key);
  if (!obj) return c.json({ success: false, error: 'Manifest object missing in R2' }, 404);
  const text = await obj.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* */ }
  return c.json({ success: true, data: parsed ?? { raw: text } });
});

pa.get('/audit/exports/:id/csv', async (c) => {
  const user = getCurrentUser(c);
  if (!auditReadRole(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT csv_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'admin'`,
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

// POST /admin-platform/audit/recon — payment-processor / billing reconciliation.
// CSV columns: billing_run_id, tenant_id, amount_zar, period_end
// Match against admin_billing_runs joined with billed amounts.
pa.post('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Admin only' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { source?: string; csv?: string };
  const source = (body.source || 'billing_processor').toLowerCase();
  if (typeof body.csv !== 'string' || body.csv.length < 10) {
    return c.json({ success: false, error: 'csv body required' }, 400);
  }
  const lines = body.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return c.json({ success: false, error: 'csv must have header + ≥1 row' }, 400);
  const headers = lines[0].split(',').map((h) => h.trim());
  const need = ['billing_run_id','tenant_id','amount_zar','period_end'];
  for (const k of need) {
    if (!headers.includes(k)) return c.json({ success: false, error: `csv missing column: ${k}` }, 400);
  }
  const idxOf = (k: string) => headers.indexOf(k);
  type TheirRow = { billing_run_id: string; tenant_id: string; amount_zar: number; period_end: string };
  const theirs: TheirRow[] = [];
  for (const ln of lines.slice(1)) {
    const cols = ln.split(',');
    theirs.push({
      billing_run_id: (cols[idxOf('billing_run_id')] || '').trim(),
      tenant_id: (cols[idxOf('tenant_id')] || '').trim(),
      amount_zar: Number(cols[idxOf('amount_zar')] || 0),
      period_end: (cols[idxOf('period_end')] || '').trim(),
    });
  }

  const runId = 'recon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-recon/admin/${runId}/processor.csv`;
  await c.env.R2.put(csvKey, new TextEncoder().encode(body.csv), {
    httpMetadata: { contentType: 'text/csv' },
  }).catch(() => null);

  const ours = await c.env.DB.prepare(
    `SELECT id, run_type, period_start, period_end, total_zar, status
       FROM admin_billing_runs`,
  ).all<{ id: string; run_type: string; period_start: string; period_end: string; total_zar: number; status: string }>().catch(() => ({ results: [] } as any));
  const ourById = new Map<string, any>();
  for (const r of (ours.results || []) as any[]) ourById.set(r.id, r);

  const matched = new Set<string>();
  type Break = { type: string; billing_run_id: string | null; our: unknown; their: unknown; field: string | null };
  const breaks: Break[] = [];
  for (const t of theirs) {
    const o = ourById.get(t.billing_run_id);
    if (!o) {
      breaks.push({ type: 'missing_in_ours', billing_run_id: t.billing_run_id || null, our: null, their: t, field: null });
      continue;
    }
    matched.add(t.billing_run_id);
    if (Math.abs(Number(o.total_zar || 0) - Number(t.amount_zar)) > 0.01) {
      breaks.push({ type: 'field_mismatch', billing_run_id: t.billing_run_id, our: o, their: t, field: 'amount_zar' });
    }
  }
  for (const [bid, o] of ourById.entries()) {
    if (!matched.has(bid) && !theirs.some((t) => t.billing_run_id === bid)) {
      breaks.push({ type: 'missing_in_theirs', billing_run_id: bid, our: o, their: null, field: null });
    }
  }

  const matchedCount = theirs.length - breaks.filter((b) => b.type !== 'field_mismatch').length;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO audit_recon_runs
       (id, entity_type, source, uploaded_csv_r2_key, row_count,
        matched_count, break_count, status, started_at, finished_at, started_by)
     VALUES (?, 'admin', ?, ?, ?, ?, ?, 'complete', ?, ?, ?)`,
  ).bind(runId, source, csvKey, theirs.length, matchedCount,
         breaks.length, now, now, user.id).run();

  if (breaks.length > 0) {
    const inserts = breaks.map((b) => c.env.DB.prepare(
      `INSERT INTO audit_recon_breaks
         (id, run_id, break_type, external_ref, our_value, their_value, field, resolution)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    ).bind(
      'brk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      runId, b.type, b.billing_run_id,
      b.our != null ? JSON.stringify(b.our) : null,
      b.their != null ? JSON.stringify(b.their) : null,
      b.field,
    ));
    await c.env.DB.batch(inserts);
  }

  await appendAudit({
    env: c.env, entity_type: 'admin', entity_id: runId,
    event_type: 'audit.recon_run', actor_id: user.id,
    payload: { run_id: runId, source, row_count: theirs.length, break_count: breaks.length },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { run_id: runId, source, row_count: theirs.length, matched_count: matchedCount, break_count: breaks.length },
  }, 201);
});

pa.get('/audit/recon', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, source, row_count, matched_count, break_count, status,
            started_at, finished_at
       FROM audit_recon_runs WHERE entity_type = 'admin'
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

export default pa;
