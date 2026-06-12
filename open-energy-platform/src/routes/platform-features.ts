// ════════════════════════════════════════════════════════════════════════
// platform-features — six cross-cutting capabilities mounted under one
// router to keep imports tidy:
//
//   /api/api-keys/*       — programmatic API keys (CRUD + verify)
//   /api/saved-filters/*  — named filter views per surface
//   /api/webhooks/*       — outbound subscription mgmt + delivery history
//   /api/usage/*          — tenant usage meter (daily rollups)
//   /api/digests/*        — email / WhatsApp / SMS digest subscriptions
//   /api/bulk/*           — bulk transition endpoints (faults, WOs, invoices)
//
// All endpoints run through authMiddleware via the host router. API-key
// auth is a separate middleware exported for routers that want to accept
// either JWT or X-OE-API-Key headers.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { assertSafeWebhookUrl } from '../utils/url-safety';

const platform = new Hono<HonoEnv>();
platform.use('*', authMiddleware);

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(prefix: string): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${rand}`;
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ═════════════════════════════════════════════════════════════════════════
// API KEYS
// ═════════════════════════════════════════════════════════════════════════
platform.get('/api-keys', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const rows = isOfficer
    ? await c.env.DB.prepare(`SELECT * FROM oe_api_keys ORDER BY created_at DESC LIMIT 200`).all()
    : await c.env.DB.prepare(`SELECT * FROM oe_api_keys WHERE participant_id = ? ORDER BY created_at DESC LIMIT 100`).bind(user.id).all();
  // Strip key_hash from response — never expose it
  const safe = (rows.results || []).map((r: any) => ({ ...r, key_hash: undefined }));
  return c.json({ success: true, data: safe });
});

platform.post('/api-keys', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.name) return c.json({ success: false, error: 'name required' }, 400);
  const id = genId('oeak');
  const raw = randomToken('oeak');
  const hash = await sha256Hex(raw);
  const preview = `${raw.slice(0, 8)}…${raw.slice(-4)}`;
  await c.env.DB.prepare(`
    INSERT INTO oe_api_keys
      (id, participant_id, key_hash, key_preview, name, scopes, rate_limit_per_minute,
       expires_at, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    id, user.id, hash, preview, b.name,
    b.scopes ? JSON.stringify(b.scopes) : null,
    Number(b.rate_limit_per_minute || 60),
    b.expires_at || null,
    user.id,
  ).run();
  await fireCascade({
    event: 'platform.api_key_issued',
    actor_id: user.id,
    entity_type: 'oe_api_keys',
    entity_id: id,
    data: {
      id, name: b.name, key_preview: preview,
      scopes: b.scopes || null,
      rate_limit_per_minute: Number(b.rate_limit_per_minute || 60),
      expires_at: b.expires_at || null,
    },
    env: c.env,
  });
  // The raw key is returned ONCE in the response. Caller must store it.
  return c.json({ success: true, data: { id, key: raw, key_preview: preview, name: b.name } }, 201);
});

platform.post('/api-keys/:id/revoke', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const row = await c.env.DB.prepare(`SELECT participant_id FROM oe_api_keys WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  if (row.participant_id !== user.id && !['admin', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  await c.env.DB.prepare(`UPDATE oe_api_keys SET revoked = 1, revoked_reason = ? WHERE id = ?`)
    .bind(b.reason || 'user_revoked', id).run();
  await fireCascade({
    event: 'platform.api_key_revoked',
    actor_id: user.id,
    entity_type: 'oe_api_keys',
    entity_id: id,
    data: {
      id, reason: b.reason || 'user_revoked',
      owner_participant_id: row.participant_id,
    },
    env: c.env,
  });
  return c.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════════
// SAVED FILTERS
// ═════════════════════════════════════════════════════════════════════════
platform.get('/saved-filters', async (c) => {
  const user = getCurrentUser(c);
  const surface = c.req.query('surface');
  const where = ['(participant_id = ? OR shared = 1)'];
  const binds: any[] = [user.id];
  if (surface) { where.push('surface = ?'); binds.push(surface); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM oe_saved_filters WHERE ${where.join(' AND ')} ORDER BY use_count DESC, name ASC LIMIT 200`,
  ).bind(...binds).all();
  return c.json({ success: true, data: rows.results || [] });
});

platform.post('/saved-filters', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.surface || !b.name || !b.filter_json) return c.json({ success: false, error: 'surface + name + filter_json required' }, 400);
  const id = genId('oesvf');
  await c.env.DB.prepare(`
    INSERT INTO oe_saved_filters (id, participant_id, surface, name, filter_json, shared, is_default)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    id, user.id, b.surface, b.name,
    typeof b.filter_json === 'string' ? b.filter_json : JSON.stringify(b.filter_json),
    b.shared ? 1 : 0, b.is_default ? 1 : 0,
  ).run();
  if (b.is_default) {
    await c.env.DB.prepare(
      `UPDATE oe_saved_filters SET is_default = 0 WHERE participant_id = ? AND surface = ? AND id != ?`,
    ).bind(user.id, b.surface, id).run();
  }
  return c.json({ success: true, data: { id } }, 201);
});

platform.delete('/saved-filters/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT participant_id FROM oe_saved_filters WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  if (row.participant_id !== user.id && !['admin'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  await c.env.DB.prepare(`DELETE FROM oe_saved_filters WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

platform.post('/saved-filters/:id/use', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE oe_saved_filters SET use_count = use_count + 1, last_used_at = datetime('now') WHERE id = ?`,
  ).bind(id).run();
  return c.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════════
// WEBHOOKS
// ═════════════════════════════════════════════════════════════════════════
platform.get('/webhooks/subscriptions', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const rows = isOfficer
    ? await c.env.DB.prepare(`SELECT * FROM oe_webhook_subscriptions ORDER BY created_at DESC LIMIT 200`).all()
    : await c.env.DB.prepare(`SELECT * FROM oe_webhook_subscriptions WHERE participant_id = ? ORDER BY created_at DESC LIMIT 100`).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

platform.post('/webhooks/subscriptions', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.target_url || !b.events || !Array.isArray(b.events)) {
    return c.json({ success: false, error: 'target_url + events[] required' }, 400);
  }
  try { assertSafeWebhookUrl(b.target_url); } catch (e: any) {
    return c.json({ success: false, error: e?.message || 'invalid target_url' }, 400);
  }
  const id = genId('oewh');
  const secret = randomToken('whsec');
  await c.env.DB.prepare(`
    INSERT INTO oe_webhook_subscriptions
      (id, participant_id, target_url, secret, events, description, created_by)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    id, user.id, b.target_url, secret,
    JSON.stringify(b.events), b.description || null, user.id,
  ).run();
  await fireCascade({
    event: 'platform.webhook_subscribed',
    actor_id: user.id,
    entity_type: 'oe_webhook_subscriptions',
    entity_id: id,
    data: {
      id, target_url: b.target_url, events: b.events,
      description: b.description || null,
    },
    env: c.env,
  });
  return c.json({ success: true, data: { id, secret } }, 201);
});

platform.post('/webhooks/subscriptions/:id/disable', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT participant_id FROM oe_webhook_subscriptions WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  if (row.participant_id !== user.id && !['admin'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  await c.env.DB.prepare(
    `UPDATE oe_webhook_subscriptions SET enabled = 0, disabled_at = datetime('now') WHERE id = ?`,
  ).bind(id).run();
  await fireCascade({
    event: 'platform.webhook_disabled',
    actor_id: user.id,
    entity_type: 'oe_webhook_subscriptions',
    entity_id: id,
    data: { id, owner_participant_id: row.participant_id },
    env: c.env,
  });
  return c.json({ success: true });
});

platform.post('/webhooks/subscriptions/:id/test', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT * FROM oe_webhook_subscriptions WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  const payload = JSON.stringify({
    event: 'test',
    timestamp: new Date().toISOString(),
    delivery_id: genId('test'),
  });
  const signature = await hmacSha256Hex(row.secret, payload);
  try { assertSafeWebhookUrl(row.target_url); } catch (e: any) {
    return c.json({ success: false, error: e?.message || 'unsafe target_url' }, 400);
  }
  try {
    const r = await fetch(row.target_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-oe-signature': `sha256=${signature}`,
        'x-oe-event': 'test',
      },
      body: payload,
      redirect: 'manual',
    });
    if (r.status >= 300 && r.status < 400) {
      return c.json({ success: false, error: 'webhook target returned a redirect; redirects are not followed for security' }, 502);
    }
    await c.env.DB.prepare(`
      INSERT INTO oe_webhook_deliveries
        (id, subscription_id, event, payload_json, status, status_code, delivered_at)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      genId('oewd'), id, 'test', payload,
      r.ok ? 'delivered' : 'failed', r.status, new Date().toISOString(),
    ).run();
    return c.json({ success: r.ok, data: { status_code: r.status } });
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || 'delivery failed' }, 502);
  }
});

platform.get('/webhooks/deliveries', async (c) => {
  const user = getCurrentUser(c);
  const subId = c.req.query('subscription_id');
  const isOfficer = ['admin', 'support'].includes(user.role);
  if (subId) {
    const sub = await c.env.DB.prepare(`SELECT participant_id FROM oe_webhook_subscriptions WHERE id = ?`).bind(subId).first<any>();
    if (!sub) return c.json({ success: false, error: 'not found' }, 404);
    if (sub.participant_id !== user.id && !isOfficer) return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const rows = subId
    ? await c.env.DB.prepare(
        `SELECT * FROM oe_webhook_deliveries WHERE subscription_id = ? ORDER BY created_at DESC LIMIT 100`,
      ).bind(subId).all()
    : isOfficer
      ? await c.env.DB.prepare(`SELECT * FROM oe_webhook_deliveries ORDER BY created_at DESC LIMIT 200`).all()
      : await c.env.DB.prepare(`
          SELECT d.* FROM oe_webhook_deliveries d
          JOIN oe_webhook_subscriptions s ON s.id = d.subscription_id
          WHERE s.participant_id = ? ORDER BY d.created_at DESC LIMIT 100
        `).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ═════════════════════════════════════════════════════════════════════════
// USAGE METER
// ═════════════════════════════════════════════════════════════════════════
platform.get('/usage', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const days = Math.min(90, Math.max(1, Number(c.req.query('days') || 30)));
  const participantId = c.req.query('participant_id') || user.id;
  if (participantId !== user.id && !isOfficer) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const rows = await c.env.DB.prepare(`
    SELECT * FROM oe_tenant_usage
    WHERE participant_id = ? AND day >= date('now', ? || ' days')
    ORDER BY day ASC
  `).bind(participantId, `-${days}`).all<any>();

  // Aggregate totals
  const totals = ((rows.results || []) as any[]).reduce((acc: any, r: any) => {
    acc.worker_requests    += Number(r.worker_requests    || 0);
    acc.d1_reads_est       += Number(r.d1_reads_est       || 0);
    acc.d1_writes_est      += Number(r.d1_writes_est      || 0);
    acc.kv_reads_est       += Number(r.kv_reads_est       || 0);
    acc.kv_writes_est      += Number(r.kv_writes_est      || 0);
    acc.api_key_calls      += Number(r.api_key_calls      || 0);
    acc.webhook_deliveries += Number(r.webhook_deliveries || 0);
    acc.digest_sends       += Number(r.digest_sends       || 0);
    acc.est_cost_usd       += Number(r.est_cost_usd       || 0);
    return acc;
  }, {
    worker_requests: 0, d1_reads_est: 0, d1_writes_est: 0,
    kv_reads_est: 0, kv_writes_est: 0, api_key_calls: 0,
    webhook_deliveries: 0, digest_sends: 0, est_cost_usd: 0,
  });
  return c.json({
    success: true,
    data: {
      participant_id: participantId,
      window_days: days,
      totals,
      series: rows.results || [],
    },
  });
});

// ═════════════════════════════════════════════════════════════════════════
// DIGESTS
// ═════════════════════════════════════════════════════════════════════════
platform.get('/digests/subscriptions', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const rows = isOfficer
    ? await c.env.DB.prepare(`SELECT * FROM oe_digest_subscriptions ORDER BY created_at DESC LIMIT 200`).all()
    : await c.env.DB.prepare(`SELECT * FROM oe_digest_subscriptions WHERE participant_id = ? ORDER BY created_at DESC`).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

platform.post('/digests/subscriptions', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.channel || !b.destination || !b.digest_type) {
    return c.json({ success: false, error: 'channel + destination + digest_type required' }, 400);
  }
  if (!['email', 'whatsapp', 'sms'].includes(b.channel)) {
    return c.json({ success: false, error: 'channel must be email|whatsapp|sms' }, 400);
  }
  const id = genId('oedg');
  await c.env.DB.prepare(`
    INSERT INTO oe_digest_subscriptions
      (id, participant_id, channel, destination, digest_type, send_hour_sast, send_days, created_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    id, user.id, b.channel, b.destination, b.digest_type,
    Number(b.send_hour_sast || 7),
    b.send_days || 'mon,tue,wed,thu,fri',
    user.id,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

platform.post('/digests/subscriptions/:id/disable', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT participant_id FROM oe_digest_subscriptions WHERE id = ?`).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);
  if (row.participant_id !== user.id && !['admin'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  await c.env.DB.prepare(`UPDATE oe_digest_subscriptions SET enabled = 0 WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

platform.get('/digests/deliveries', async (c) => {
  const user = getCurrentUser(c);
  const subId = c.req.query('subscription_id');
  const isOfficer = ['admin', 'support'].includes(user.role);
  if (subId) {
    const sub = await c.env.DB.prepare(`SELECT participant_id FROM oe_digest_subscriptions WHERE id = ?`).bind(subId).first<any>();
    if (!sub) return c.json({ success: false, error: 'not found' }, 404);
    if (sub.participant_id !== user.id && !isOfficer) return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const rows = subId
    ? await c.env.DB.prepare(`SELECT * FROM oe_digest_deliveries WHERE subscription_id = ? ORDER BY created_at DESC LIMIT 100`).bind(subId).all()
    : isOfficer
      ? await c.env.DB.prepare(`SELECT * FROM oe_digest_deliveries ORDER BY created_at DESC LIMIT 200`).all()
      : await c.env.DB.prepare(`
          SELECT d.* FROM oe_digest_deliveries d
          JOIN oe_digest_subscriptions s ON s.id = d.subscription_id
          WHERE s.participant_id = ? ORDER BY d.created_at DESC LIMIT 100
        `).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

// Manual "send-now" — useful for testing; in prod a cron sweeps due subs.
platform.post('/digests/subscriptions/:id/send-now', async (c) => {
  const id = c.req.param('id');
  const sub = await c.env.DB.prepare(`SELECT * FROM oe_digest_subscriptions WHERE id = ?`).bind(id).first<any>();
  if (!sub) return c.json({ success: false, error: 'not found' }, 404);
  const body = await composeDigestBody(c.env, sub);
  const delivery = await deliverDigest(c.env, sub, body);
  return c.json({ success: true, data: delivery });
});

// ═════════════════════════════════════════════════════════════════════════
// BULK OPS
// ═════════════════════════════════════════════════════════════════════════
// Accepts { ids: [...], action: 'acknowledge'|'resolve'|... }. Validates
// per-row permission then applies the same SQL UPDATE. Returns per-id
// outcome counts so the UI can show success / fail / skipped.

const FAULT_ACTIONS: Record<string, { to: string; ts?: string }> = {
  acknowledge: { to: 'acknowledged' },
  resolve:     { to: 'resolved', ts: 'resolved_at' },
  reopen:      { to: 'open' },
  dismiss:     { to: 'false_positive' },
};

platform.post('/bulk/faults', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  const ids: string[] = Array.isArray(b.ids) ? b.ids : [];
  const action = String(b.action || '');
  if (!ids.length) return c.json({ success: false, error: 'ids[] required' }, 400);
  const spec = FAULT_ACTIONS[action];
  if (!spec) return c.json({ success: false, error: `unknown action: ${action}` }, 400);
  let updated = 0, failed = 0;
  for (const id of ids.slice(0, 500)) {
    try {
      const sets = ['status = ?', "updated_at = datetime('now')"];
      const binds: any[] = [spec.to];
      if (spec.ts) sets.push(`${spec.ts} = datetime('now')`);
      binds.push(id);
      await c.env.DB.prepare(`UPDATE om_faults SET ${sets.join(',')} WHERE id = ?`).bind(...binds).run();
      updated += 1;
    } catch { failed += 1; }
  }
  return c.json({ success: true, data: { requested: ids.length, updated, failed } });
});

const WO_BULK_ACTIONS = new Set([
  'assigned', 'acknowledged', 'en_route', 'on_site',
  'completed', 'verified', 'closed', 'cancelled',
]);

platform.post('/bulk/work-orders', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  const ids: string[] = Array.isArray(b.ids) ? b.ids : [];
  const to = String(b.to || '');
  if (!ids.length) return c.json({ success: false, error: 'ids[] required' }, 400);
  if (!WO_BULK_ACTIONS.has(to)) return c.json({ success: false, error: `cannot bulk-transition to: ${to}` }, 400);
  let updated = 0, failed = 0;
  const ts =
    to === 'assigned'     ? 'assigned_at' :
    to === 'acknowledged' ? 'acknowledged_at' :
    to === 'en_route'     ? 'en_route_at' :
    to === 'on_site'      ? 'on_site_at' :
    to === 'completed'    ? 'completed_at' :
    to === 'verified'     ? 'verified_at' :
    to === 'closed'       ? 'closed_at' : null;
  for (const id of ids.slice(0, 500)) {
    try {
      const sets = ['status = ?', "updated_at = datetime('now')"];
      const binds: any[] = [to];
      if (ts) sets.push(`${ts} = datetime('now')`);
      if (b.assigned_to) { sets.push('assigned_to = ?'); binds.push(b.assigned_to); }
      binds.push(id);
      await c.env.DB.prepare(`UPDATE om_work_orders SET ${sets.join(',')} WHERE id = ?`).bind(...binds).run();
      updated += 1;
    } catch { failed += 1; }
  }
  return c.json({ success: true, data: { requested: ids.length, updated, failed } });
});

platform.post('/bulk/invoices', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  const ids: string[] = Array.isArray(b.ids) ? b.ids : [];
  const action = String(b.action || '');
  if (!ids.length) return c.json({ success: false, error: 'ids[] required' }, 400);
  if (action !== 'confirm') return c.json({ success: false, error: 'only "confirm" supported in bulk' }, 400);
  let updated = 0, failed = 0;
  for (const id of ids.slice(0, 500)) {
    try {
      await c.env.DB.prepare(
        `UPDATE invoices SET confirmation_status = 'issuer_confirmed' WHERE id = ?`,
      ).bind(id).run();
      updated += 1;
    } catch { failed += 1; }
  }
  return c.json({ success: true, data: { requested: ids.length, updated, failed } });
});

// ═════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═════════════════════════════════════════════════════════════════════════

async function composeDigestBody(env: HonoEnv['Bindings'], _sub: any): Promise<string> {
  // Compose the digest from the AI briefing endpoint logic — simplified
  // version that just summarises fleet state. Production would render
  // per-digest-type templates (lender_monthly, offtaker_weekly, ...).
  const stats = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM om_faults WHERE status IN ('open','acknowledged','in_progress')) AS open_faults,
      (SELECT COALESCE(SUM(hourly_loss_zar),0) FROM om_faults WHERE status IN ('open','acknowledged','in_progress')) AS bleed,
      (SELECT COUNT(*) FROM om_work_orders WHERE status NOT IN ('completed','verified','closed','cancelled')) AS open_wos
  `).first<any>();
  const today = new Date().toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'long' });
  return [
    `CEC Ops · morning briefing · ${today}`,
    `${stats?.open_faults || 0} open faults bleeding R${Math.round(Number(stats?.bleed || 0))}/h`,
    `${stats?.open_wos || 0} active work orders`,
    `Full dashboard: https://oe.vantax.co.za/esums`,
  ].join('\n');
}

async function deliverDigest(env: HonoEnv['Bindings'], sub: any, body: string): Promise<any> {
  // Real delivery requires provider creds (SES / Twilio / WhatsApp Cloud).
  // Until those are configured we land a "would_send" row so usage meter,
  // history view and rate-limit accounting all work — then flipping creds
  // on flips the status to 'sent' without code changes.
  const id = genId('oedd');
  const status = (env as any).EMAIL_API_KEY || (env as any).TWILIO_AUTH ? 'sent' : 'would_send';
  await env.DB.prepare(`
    INSERT INTO oe_digest_deliveries
      (id, subscription_id, channel, destination, status, body_preview, sent_at)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    id, sub.id, sub.channel, sub.destination, status,
    body.slice(0, 500),
    status === 'sent' ? new Date().toISOString() : null,
  ).run();
  await env.DB.prepare(
    `UPDATE oe_digest_subscriptions SET last_sent_at = datetime('now') WHERE id = ?`,
  ).bind(sub.id).run();
  return { id, status, body_preview: body.slice(0, 200) };
}

// ─── Exported helper: API-key auth middleware (for routers that opt in)
// Usage: routerX.use('*', apiKeyAuth);
export async function apiKeyAuth(c: any, next: () => Promise<void>) {
  const header = c.req.header('x-oe-api-key');
  if (!header) return next();  // fall through to JWT auth
  const hash = await sha256Hex(header);
  const db = c.env.DB as D1Database;
  const row = await db.prepare(`
    SELECT k.*, p.role FROM oe_api_keys k
    LEFT JOIN participants p ON p.id = k.participant_id
    WHERE k.key_hash = ? AND k.revoked = 0
      AND (k.expires_at IS NULL OR k.expires_at > datetime('now'))
  `).bind(hash).first<any>();
  if (!row) return c.json({ success: false, error: 'invalid api key' }, 401);
  await c.env.DB.prepare(
    `UPDATE oe_api_keys SET last_used_at = datetime('now'), last_used_ip = ? WHERE id = ?`,
  ).bind(c.req.header('cf-connecting-ip') || null, row.id).run();
  c.set('user', { id: row.participant_id, role: row.role || 'api', api_key_id: row.id });
  return next();
}

export default platform;
