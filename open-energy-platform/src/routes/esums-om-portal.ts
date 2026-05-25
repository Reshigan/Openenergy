// ════════════════════════════════════════════════════════════════════════
// Esums — Stakeholder portals.
//
// Two routers exported:
//   portalAdmin  — auth-protected token mgmt (mount at /api/esums-portal)
//   portalPublic — opaque-token-authenticated view (mount at /api/esums-portal-view)
//
// Splitting them prevents Hono's sub-app middleware chain from blocking
// the public view endpoint with the auth middleware that protects the
// admin endpoints.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Admin token management (auth required) ─────────────────────────────
export const portalAdmin = new Hono<HonoEnv>();
portalAdmin.use('*', authMiddleware);

portalAdmin.post('/tokens', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.audience || !['lender', 'offtaker', 'insurer', 'contractor'].includes(b.audience)) {
    return c.json({ success: false, error: 'audience required (lender|offtaker|insurer|contractor)' }, 400);
  }
  const id = genId('omtok');
  const token = randomToken();
  const expiresAt = b.expires_at || new Date(Date.now() + 90 * 86_400_000).toISOString();
  await c.env.DB.prepare(`
    INSERT INTO om_portal_tokens
      (id, token, audience, recipient_email, participant_id, scope_site_ids, scope_project_ids, expires_at, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    id, token, b.audience, b.recipient_email || null, b.participant_id || null,
    b.scope_site_ids ? JSON.stringify(b.scope_site_ids) : null,
    b.scope_project_ids ? JSON.stringify(b.scope_project_ids) : null,
    expiresAt, user.id,
  ).run();
  return c.json({ success: true, data: { id, token, expires_at: expiresAt, url: `/portal/${b.audience}/${token}` } }, 201);
});

portalAdmin.get('/tokens', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const rows = isOfficer
    ? await c.env.DB.prepare(`SELECT * FROM om_portal_tokens ORDER BY created_at DESC LIMIT 200`).all()
    : await c.env.DB.prepare(`SELECT * FROM om_portal_tokens WHERE created_by = ? ORDER BY created_at DESC LIMIT 200`).bind(user.id).all();
  return c.json({ success: true, data: rows.results || [] });
});

portalAdmin.post('/tokens/:id/revoke', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE om_portal_tokens SET revoked = 1 WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

// ─── Public token-authenticated view (NO auth middleware) ───────────────
export const portalPublic = new Hono<HonoEnv>();

portalPublic.get('/:token', async (c) => {
  const token = c.req.param('token');
  const t = await c.env.DB.prepare(`SELECT * FROM om_portal_tokens WHERE token = ?`).bind(token).first<any>();
  if (!t) return c.json({ success: false, error: 'invalid token' }, 401);
  if (t.revoked) return c.json({ success: false, error: 'revoked' }, 403);
  if (new Date(t.expires_at).getTime() < Date.now()) return c.json({ success: false, error: 'expired' }, 403);

  await c.env.DB.prepare(`UPDATE om_portal_tokens SET last_used_at = datetime('now'), use_count = use_count + 1 WHERE token = ?`).bind(token).run();

  const siteIds = t.scope_site_ids ? JSON.parse(t.scope_site_ids) as string[] : null;
  const audience = t.audience;

  const sitesQuery = siteIds && siteIds.length
    ? `SELECT * FROM om_sites WHERE id IN (${siteIds.map(() => '?').join(',')})`
    : t.participant_id
      ? `SELECT * FROM om_sites WHERE participant_id = ? OR lender_id = ? OR om_contractor_id = ?`
      : `SELECT * FROM om_sites LIMIT 200`;
  const siteBinds = siteIds && siteIds.length ? siteIds : (t.participant_id ? [t.participant_id, t.participant_id, t.participant_id] : []);
  const sites = await c.env.DB.prepare(sitesQuery).bind(...siteBinds).all<any>();

  const siteIdsInScope = ((sites.results || []) as Array<{ id: string }>).map((s) => s.id);
  if (!siteIdsInScope.length) {
    return c.json({ success: true, data: { audience, sites: [], view: 'empty', generated_at: new Date().toISOString() } });
  }
  const placeholders = siteIdsInScope.map(() => '?').join(',');

  switch (audience) {
    case 'lender': {
      const perf = await c.env.DB.prepare(`
        SELECT site_id, COALESCE(SUM(interval_kwh),0) AS mtd_kwh
        FROM om_telemetry
        WHERE site_id IN (${placeholders}) AND ts >= date('now', 'start of month')
        GROUP BY site_id
      `).bind(...siteIdsInScope).all();
      const openFaults = await c.env.DB.prepare(`
        SELECT site_id, COUNT(*) AS cnt, COALESCE(SUM(hourly_loss_zar),0) AS bleed
        FROM om_faults WHERE site_id IN (${placeholders}) AND status IN ('open','acknowledged','in_progress')
        GROUP BY site_id
      `).bind(...siteIdsInScope).all();
      return c.json({
        success: true,
        data: {
          audience: 'lender',
          generated_at: new Date().toISOString(),
          sites: sites.results,
          performance: perf.results || [],
          open_faults: openFaults.results || [],
        },
      });
    }
    case 'offtaker': {
      const deliv = await c.env.DB.prepare(`
        SELECT site_id, COALESCE(SUM(interval_kwh),0) / 1000.0 AS mtd_mwh
        FROM om_telemetry
        WHERE site_id IN (${placeholders}) AND ts >= date('now', 'start of month')
        GROUP BY site_id
      `).bind(...siteIdsInScope).all();
      return c.json({
        success: true,
        data: {
          audience: 'offtaker',
          generated_at: new Date().toISOString(),
          sites: sites.results,
          delivery: deliv.results || [],
        },
      });
    }
    case 'insurer': {
      const claimable = await c.env.DB.prepare(`
        SELECT * FROM om_faults
        WHERE site_id IN (${placeholders})
          AND severity IN ('critical','major')
          AND detected_at >= date('now', '-90 days')
        ORDER BY detected_at DESC LIMIT 100
      `).bind(...siteIdsInScope).all();
      const maintenance = await c.env.DB.prepare(`
        SELECT site_id,
          SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue,
          COUNT(*) AS total
        FROM om_maintenance WHERE site_id IN (${placeholders})
        GROUP BY site_id
      `).bind(...siteIdsInScope).all();
      return c.json({
        success: true,
        data: {
          audience: 'insurer',
          generated_at: new Date().toISOString(),
          sites: sites.results,
          claimable_events: claimable.results || [],
          maintenance_compliance: maintenance.results || [],
        },
      });
    }
    case 'contractor': {
      const wos = await c.env.DB.prepare(`
        SELECT w.*, s.name AS site_name FROM om_work_orders w
        LEFT JOIN om_sites s ON s.id = w.site_id
        WHERE w.site_id IN (${placeholders})
        ORDER BY w.created_at DESC LIMIT 200
      `).bind(...siteIdsInScope).all();
      const slaStats = await c.env.DB.prepare(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) AS breached,
               SUM(CASE WHEN first_time_fix = 1 THEN 1 ELSE 0 END) AS first_time_fix
        FROM om_work_orders WHERE site_id IN (${placeholders})
          AND completed_at >= date('now', '-90 days')
      `).bind(...siteIdsInScope).first<any>();
      return c.json({
        success: true,
        data: {
          audience: 'contractor',
          generated_at: new Date().toISOString(),
          sites: sites.results,
          work_orders: wos.results || [],
          sla_stats: slaStats,
        },
      });
    }
    default:
      return c.json({ success: false, error: 'unknown audience' }, 400);
  }
});

// Default export kept for backward compatibility with src/index.ts imports.
// New mounts in src/index.ts will use the named exports above.
export default portalAdmin;
