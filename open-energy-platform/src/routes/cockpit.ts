// ═══════════════════════════════════════════════════════════════════════════
// Cockpit Route — Role-specific dashboard builder
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { HonoEnv } from '../utils/types';

const cockpit = new Hono<HonoEnv>();

// GET /cockpit — Build role-specific dashboard data
cockpit.get('/', authMiddleware, async (c) => {
  const auth = c.get('auth');
  if (!auth?.user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  const user = auth.user;
  
  try {
    // Get notifications count
    const notifResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM notifications 
      WHERE participant_id = ?
    `).bind(user.id).first();
    const unreadNotifications = notifResult?.count || 0;

    // Build role-specific dashboard data
    const dashboard: Record<string, unknown> = { 
      role: user.role, 
      unread_notifications: unreadNotifications,
      user_id: user.id,
      email: user.email
    };

    // Admin-specific stats
    if (user.role === 'admin' || user.role === 'ipp_developer') {
      const participantsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM participants').first();
      dashboard.participants_count = participantsCount?.count || 0;
    }

    if (user.role === 'admin') {
      const pendingKyc = await c.env.DB.prepare("SELECT COUNT(*) as count FROM participants WHERE kyc_status = 'pending'").first();
      dashboard.pending_kyc_count = pendingKyc?.count || 0;
      
      const activeContracts = await c.env.DB.prepare("SELECT COUNT(*) as count FROM contract_documents WHERE phase = 'active'").first();
      dashboard.active_contracts = activeContracts?.count || 0;
      
      const totalRevenue = await c.env.DB.prepare("SELECT COALESCE(SUM(total_amount), 0) as sum FROM invoices WHERE status = 'paid'").first();
      dashboard.total_revenue = totalRevenue?.sum || 0;
    }

    // IPP Developer specific
    if (user.role === 'ipp_developer') {
      const projectCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM ipp_projects WHERE developer_id = ?').bind(user.id).first();
      dashboard.projects_count = projectCount?.count || 0;
    }

    return c.json({ success: true, data: dashboard });
  } catch (error) {
    console.error('Cockpit error:', error);
    return c.json({ success: false, error: 'Failed to load dashboard', details: String(error) }, 500);
  }
});

// GET /cockpit/kpis — Get KPI metrics
cockpit.get('/kpis', authMiddleware, async (c) => {
  const auth = c.get('auth');
  if (!auth?.user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  const user = auth.user;
  
  try {
    const kpis: Record<string, unknown> = {};
    
    // Market stats
    const marketStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_trades,
        COALESCE(SUM(volume), 0) as total_volume
      FROM trade_matches 
      WHERE created_at >= datetime('now', '-7 days')
    `).first();
    
    kpis.market = marketStats;

    // Admin stats
    if (user.role === 'admin') {
      kpis.admin = await c.env.DB.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM participants) as total_users,
          (SELECT COUNT(*) FROM trade_matches) as total_trades,
          (SELECT COUNT(*) FROM contract_documents WHERE phase = 'active') as active_contracts,
          (SELECT COALESCE(SUM(total_cents), 0) FROM invoices WHERE status = 'paid') as total_revenue_cents
      `).first();
    }

    return c.json({ success: true, data: kpis });
  } catch (error) {
    console.error('KPIs error:', error);
    return c.json({ success: false, error: 'Failed to load KPIs', details: String(error) }, 500);
  }
});

// GET /cockpit/actions — Unified action queue for the signed-in user
cockpit.get('/actions', authMiddleware, async (c) => {
  const auth = c.get('auth');
  if (!auth?.user) return c.json({ success: false, error: 'Unauthorized' }, 401);
  const user = auth.user;
  const status = c.req.query('status') || 'pending';
  const limit = Number(c.req.query('limit') || 50);
  try {
    const rows = await c.env.DB.prepare(`
      SELECT id, type, priority, actor_id, entity_type, entity_id, title, description, status, due_date, created_at
      FROM action_queue
      WHERE assignee_id = ? AND status = ?
      ORDER BY CASE priority
        WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END ASC,
        created_at DESC
      LIMIT ?
    `).bind(user.id, status, limit).all();
    return c.json({ success: true, data: rows.results || [] });
  } catch (error) {
    console.error('Action queue error:', error);
    return c.json({ success: false, error: 'Failed to load actions', details: String(error) }, 500);
  }
});

// POST /cockpit/actions/:id/complete — Mark an action complete (used when the counterparty UI resolves it directly)
cockpit.post('/actions/:id/complete', authMiddleware, async (c) => {
  const auth = c.get('auth');
  if (!auth?.user) return c.json({ success: false, error: 'Unauthorized' }, 401);
  const id = c.req.param('id');
  try {
    const row = await c.env.DB.prepare('SELECT assignee_id, status FROM action_queue WHERE id = ?').bind(id).first();
    if (!row) return c.json({ success: false, error: 'Not found' }, 404);
    if (row.assignee_id !== auth.user.id && auth.user.role !== 'admin') {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }
    await c.env.DB.prepare(
      `UPDATE action_queue SET status = 'completed', completed_at = ?, completed_by = ?, updated_at = ? WHERE id = ?`
    ).bind(new Date().toISOString(), auth.user.id, new Date().toISOString(), id).run();
    return c.json({ success: true });
  } catch (error) {
    console.error('Action complete error:', error);
    return c.json({ success: false, error: 'Failed to complete action', details: String(error) }, 500);
  }
});

// GET /cockpit/stats — Role-aware KPI set consumed by the Fiori launchpad.
//
// COST NOTE: This endpoint is hit on every dashboard load (one of the most
// frequent reads on the platform). Two cost-efficiency moves:
//   1. Collapse 6 separate SELECT COUNT(*) queries into one compound SELECT
//      with scalar subqueries. D1 charges per query + per row read, so
//      halving the request count halves the request-overhead charge and
//      row-read charges stay identical.
//   2. Cache the response in KV keyed by (participant_id) for 30 seconds.
//      A dashboard that refreshes every few seconds pays 1 DB read + N−1
//      KV reads (KV read is ~10× cheaper than a D1 query).
//
// Cache is invalidated by `?fresh=1` (user-triggered refresh button).
cockpit.get('/stats', authMiddleware, async (c) => {
  const auth = c.get('auth');
  if (!auth?.user) return c.json({ success: false, error: 'Unauthorized' }, 401);
  const user = auth.user;
  const fresh = c.req.query('fresh') === '1';
  const cacheKey = `cockpit:stats:${user.id}`;

  try {
    if (!fresh) {
      const cached = await c.env.KV.get(cacheKey, 'json');
      if (cached) return c.json({ success: true, data: cached, cached: true });
    }

    // Single compound query — 6 scalar subqueries, each narrowly indexed.
    // Every WHERE clause hits an existing index (participants.id pk,
    // action_queue.assignee_id + status, contract_documents.creator_id +
    // counterparty_id, document_signatories.participant_id, invoices by
    // from/to participant). No table scans.
    const row = await c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM action_queue
          WHERE assignee_id = ? AND status = 'pending')                       AS pending_actions,
        (SELECT COUNT(*) FROM contract_documents
          WHERE creator_id = ? OR counterparty_id = ?)                        AS my_contracts,
        (SELECT COUNT(DISTINCT document_id) FROM document_signatories
          WHERE participant_id = ? AND signed = 0)                            AS contracts_awaiting_signature,
        (SELECT COUNT(*) FROM invoices
          WHERE to_participant_id = ? AND status = 'issued')                  AS invoices_to_pay,
        (SELECT COALESCE(SUM(total_amount), 0) FROM invoices
          WHERE to_participant_id = ? AND status = 'issued')                  AS invoices_to_pay_total,
        (SELECT COUNT(*) FROM invoices
          WHERE from_participant_id = ? AND status = 'issued')                AS invoices_outstanding,
        (SELECT COALESCE(SUM(total_amount), 0) FROM invoices
          WHERE from_participant_id = ? AND status = 'issued')                AS invoices_outstanding_total
    `).bind(
      user.id,
      user.id, user.id,
      user.id,
      user.id,
      user.id,
      user.id,
      user.id,
    ).first<{
      pending_actions: number;
      my_contracts: number;
      contracts_awaiting_signature: number;
      invoices_to_pay: number;
      invoices_to_pay_total: number;
      invoices_outstanding: number;
      invoices_outstanding_total: number;
    }>();

    const stats: Record<string, unknown> = {
      role: user.role,
      pending_actions: Number(row?.pending_actions || 0),
      my_contracts: Number(row?.my_contracts || 0),
      contracts_awaiting_signature: Number(row?.contracts_awaiting_signature || 0),
      invoices_to_pay: Number(row?.invoices_to_pay || 0),
      invoices_to_pay_total: Number(row?.invoices_to_pay_total || 0),
      invoices_outstanding: Number(row?.invoices_outstanding || 0),
      invoices_outstanding_total: Number(row?.invoices_outstanding_total || 0),
    };

    // Role-specific one-shot follow-ups. Each is a single indexed COUNT —
    // skip unless the current user is that role, so non-admins pay zero
    // extra queries.
    if (user.role === 'ipp_developer') {
      const projects = await c.env.DB.prepare(
        `SELECT COUNT(*) as c FROM ipp_projects WHERE developer_id = ?`,
      ).bind(user.id).first<{ c: number }>();
      stats.projects_count = Number(projects?.c || 0);
    }
    if (user.role === 'trader') {
      const openOrders = await c.env.DB.prepare(
        `SELECT COUNT(*) as c FROM trade_orders WHERE participant_id = ? AND status = 'open'`,
      ).bind(user.id).first<{ c: number }>();
      stats.open_orders = Number(openOrders?.c || 0);
    }
    if (user.role === 'admin') {
      const pendingKyc = await c.env.DB.prepare(
        `SELECT COUNT(*) as c FROM participants WHERE kyc_status = 'pending'`,
      ).first<{ c: number }>();
      stats.pending_kyc = Number(pendingKyc?.c || 0);
    }

    // Role-specific national-scale KPIs. Each block is idempotent: if the
    // backing table is absent on an older deploy, the SELECT will throw and
    // the try/catch one level up will surface a 500 — callers expect a 200
    // every time, so each query is wrapped individually.
    await safeAttach(stats, 'role_national', () => roleNationalStats(c.env, user));

    // Cache the result for 30 seconds. Deliberately short — headline
    // counters on the dashboard go stale but most users notice within
    // a minute and hit refresh, or let the cache expire.
    c.executionCtx?.waitUntil?.(
      c.env.KV.put(cacheKey, JSON.stringify(stats), { expirationTtl: 30 }),
    );

    return c.json({ success: true, data: stats });
  } catch (error) {
    console.error('Cockpit stats error:', error);
    return c.json({ success: false, error: 'Failed to load stats', details: String(error) }, 500);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// National-scale KPI helpers. Each role sees the counts that matter to their
// workbench. Queries are one-shot aggregate reads — no joins against the
// heavy fact tables — so they stay well inside the 50 ms Workers CPU budget.
// ───────────────────────────────────────────────────────────────────────────
async function safeAttach<T>(
  target: Record<string, unknown>,
  key: string,
  fn: () => Promise<T>,
): Promise<void> {
  try {
    target[key] = await fn();
  } catch (e) {
    // Older deploys may be missing some tables (019+). Surface the error as
    // a hint in telemetry, but don't break the whole cockpit payload.
    console.warn(`cockpit_${key}_unavailable`, (e as Error).message);
  }
}

async function roleNationalStats(
  env: HonoEnv['Bindings'],
  user: { id: string; role: string },
): Promise<Record<string, unknown>> {
  // Two-layer cache:
  //   - Role-scoped blocks (regulator, grid_operator, admin) → one cache
  //     entry per role, shared across every user in that role. Cuts the
  //     D1 read to 1 per role per 30 s no matter how many users poll.
  //   - Participant-scoped blocks (trader, lender, ipp_developer, offtaker,
  //     carbon_fund) → per-user cache, same 30 s TTL.
  //
  // The outer /stats endpoint also caches the full response per-user for
  // 30 s, so the role-level cache here only matters when a user with a
  // shared role polls more than once inside the outer TTL (rare). The
  // real win is when many admins / regulators all hit the dashboard at
  // once: previously O(users) identical D1 queries, now 1.
  switch (user.role) {
    case 'regulator':
      return cachedBlock(env, 'cockpit:role:regulator', 30, () => regulatorStats(env));
    case 'grid_operator':
      return cachedBlock(env, 'cockpit:role:grid_operator', 30, () => gridOperatorStats(env));
    case 'admin':
      return cachedBlock(env, 'cockpit:role:admin', 30, () => adminStats(env));
    case 'trader':
      return cachedBlock(env, `cockpit:user:trader:${user.id}`, 30, () => traderStats(env, user.id));
    case 'lender':
      return cachedBlock(env, `cockpit:user:lender:${user.id}`, 30, () => lenderStats(env, user.id));
    case 'ipp_developer':
      return cachedBlock(env, `cockpit:user:ipp:${user.id}`, 30, () => ippStats(env, user.id));
    case 'offtaker':
      return cachedBlock(env, `cockpit:user:offtaker:${user.id}`, 30, () => offtakerStats(env, user.id));
    case 'carbon_fund':
      return cachedBlock(env, `cockpit:user:carbon:${user.id}`, 30, () => carbonStats(env, user.id));
    default:
      return {};
  }
}

async function cachedBlock(
  env: HonoEnv['Bindings'],
  key: string,
  ttlSeconds: number,
  compute: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  try {
    const hit = await env.KV.get(key, 'json') as Record<string, unknown> | null;
    if (hit) return hit;
  } catch { /* KV miss → DB */ }
  const fresh = await compute();
  try { await env.KV.put(key, JSON.stringify(fresh), { expirationTtl: ttlSeconds }); } catch { /* soft */ }
  return fresh;
}

async function regulatorStats(env: HonoEnv['Bindings']): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM regulator_licences WHERE status IN ('active','varied')) AS active_licences,
      (SELECT COUNT(*) FROM regulator_licences WHERE status = 'active'
        AND expiry_date IS NOT NULL AND expiry_date <= date('now','+90 days')) AS licences_expiring,
      (SELECT COUNT(*) FROM regulator_tariff_submissions WHERE status IN ('submitted','public_hearing')) AS pending_tariff,
      (SELECT COUNT(*) FROM regulator_enforcement_cases WHERE status IN ('open','investigating','hearing')) AS open_cases,
      (SELECT COUNT(*) FROM regulator_surveillance_alerts WHERE status = 'open') AS open_alerts,
      (SELECT COUNT(*) FROM regulator_surveillance_alerts WHERE status = 'open' AND severity IN ('high','critical')) AS critical_alerts
  `).first<Record<string, number>>();
  return row || {};
}

async function gridOperatorStats(env: HonoEnv['Bindings']): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM dispatch_schedules WHERE trading_day = date('now')) AS schedules_today,
      (SELECT COUNT(*) FROM dispatch_instructions WHERE status = 'issued') AS instructions_pending_ack,
      (SELECT COUNT(*) FROM dispatch_instructions WHERE status = 'non_compliant') AS non_compliant,
      (SELECT COUNT(*) FROM curtailment_notices WHERE status = 'active') AS active_curtailments,
      (SELECT COUNT(*) FROM ancillary_service_tenders WHERE status = 'open') AS open_tenders,
      (SELECT COUNT(*) FROM grid_outages WHERE status IN ('open','investigating','in_progress','partial_restoration')) AS active_outages,
      (SELECT COUNT(*) FROM grid_connection_applications WHERE status NOT IN ('energised','rejected','withdrawn')) AS in_flight_connections
  `).first<Record<string, number>>();
  return row || {};
}

async function traderStats(env: HonoEnv['Bindings'], participantId: string): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM trader_positions WHERE participant_id = ?) AS positions,
      (SELECT COALESCE(SUM(net_volume_mwh), 0) FROM trader_positions WHERE participant_id = ?) AS net_exposure_mwh,
      (SELECT COALESCE(SUM(unrealised_pnl_zar), 0) FROM trader_positions WHERE participant_id = ?) AS unrealised_pnl_zar,
      (SELECT COUNT(*) FROM margin_calls WHERE participant_id = ? AND status IN ('issued','acknowledged')) AS open_margin_calls,
      (SELECT COALESCE(SUM(shortfall_zar), 0) FROM margin_calls WHERE participant_id = ? AND status IN ('issued','acknowledged')) AS margin_shortfall_zar,
      (SELECT COALESCE(SUM(balance_zar), 0) FROM collateral_accounts WHERE participant_id = ? AND status = 'active') AS collateral_balance_zar
  `).bind(participantId, participantId, participantId, participantId, participantId, participantId).first<Record<string, number>>();
  return row || {};
}

async function lenderStats(env: HonoEnv['Bindings'], participantId: string): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM covenants WHERE lender_participant_id = ? AND status = 'active') AS active_covenants,
      (SELECT COUNT(*) FROM covenant_tests ct
        JOIN covenants c ON c.id = ct.covenant_id
        WHERE c.lender_participant_id = ? AND ct.result = 'breach'
          AND ct.test_date >= date('now', '-30 days')) AS covenant_breaches_30d,
      (SELECT COUNT(*) FROM covenant_tests ct
        JOIN covenants c ON c.id = ct.covenant_id
        WHERE c.lender_participant_id = ? AND ct.result = 'warn'
          AND ct.test_date >= date('now', '-30 days')) AS covenant_warns_30d,
      (SELECT COUNT(*) FROM ie_certifications WHERE status IN ('submitted','under_review')) AS ie_certs_pending_review,
      (SELECT COUNT(*) FROM covenant_waivers WHERE status = 'requested') AS waivers_pending
  `).bind(participantId, participantId, participantId).first<Record<string, number>>();
  return row || {};
}

async function ippStats(env: HonoEnv['Bindings'], participantId: string): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM epc_contracts ec
        JOIN ipp_projects p ON p.id = ec.project_id
        WHERE p.developer_id = ? AND ec.status NOT IN ('closed','terminated')) AS active_epc,
      (SELECT COUNT(*) FROM epc_variations ev
        JOIN epc_contracts ec ON ec.id = ev.epc_contract_id
        JOIN ipp_projects p ON p.id = ec.project_id
        WHERE p.developer_id = ? AND ev.status = 'proposed') AS pending_epc_variations,
      (SELECT COUNT(*) FROM insurance_policies ip
        JOIN ipp_projects p ON p.id = ip.project_id
        WHERE p.developer_id = ? AND ip.status = 'active'
          AND ip.period_end <= date('now','+90 days')) AS insurance_expiring_90d,
      (SELECT COUNT(*) FROM environmental_compliance ec
        JOIN environmental_authorisations ea ON ea.id = ec.authorisation_id
        JOIN ipp_projects p ON p.id = ea.project_id
        WHERE p.developer_id = ? AND ec.compliance_status = 'non_compliant') AS ea_non_compliant,
      (SELECT COUNT(*) FROM community_engagements ce
        JOIN ipp_projects p ON p.id = ce.project_id
        WHERE p.developer_id = ? AND ce.follow_up_date IS NOT NULL
          AND ce.follow_up_date <= date('now','+14 days')) AS community_follow_ups_14d
  `).bind(participantId, participantId, participantId, participantId, participantId).first<Record<string, number>>();
  return row || {};
}

async function offtakerStats(env: HonoEnv['Bindings'], participantId: string): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM offtaker_site_groups WHERE participant_id = ?) AS site_groups,
      (SELECT COUNT(*) FROM offtaker_delivery_points WHERE participant_id = ?) AS delivery_points,
      (SELECT COUNT(*) FROM rec_certificates WHERE owner_participant_id = ? AND status IN ('issued','transferred')) AS active_recs,
      (SELECT COALESCE(SUM(mwh_represented), 0) FROM rec_certificates WHERE owner_participant_id = ? AND status IN ('issued','transferred')) AS active_rec_mwh,
      (SELECT COUNT(*) FROM rec_retirements WHERE retiring_participant_id = ?) AS retirements_count,
      (SELECT COUNT(*) FROM scope2_disclosures WHERE participant_id = ? AND status = 'published') AS published_scope2
  `).bind(participantId, participantId, participantId, participantId, participantId, participantId).first<Record<string, number>>();
  return row || {};
}

async function carbonStats(env: HonoEnv['Bindings'], participantId: string): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM credit_vintages) AS vintages,
      (SELECT COALESCE(SUM(credits_issued - credits_retired), 0) FROM credit_vintages) AS credits_active,
      (SELECT COUNT(*) FROM mrv_submissions WHERE submitted_by = ? AND status IN ('submitted','validation')) AS mrv_pending,
      (SELECT COUNT(*) FROM mrv_verifications mv
        JOIN mrv_submissions ms ON ms.id = mv.submission_id
        WHERE ms.submitted_by = ? AND mv.opinion IN ('positive','qualified')
          AND mv.verification_date >= date('now','-90 days')) AS verified_90d,
      (SELECT COUNT(*) FROM carbon_tax_offset_claims WHERE taxpayer_participant_id = ? AND status = 'submitted') AS tax_claims_submitted
  `).bind(participantId, participantId, participantId).first<Record<string, number>>();
  return row || {};
}

async function adminStats(env: HonoEnv['Bindings']): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM tenants WHERE status = 'active') AS active_tenants,
      (SELECT COUNT(*) FROM tenants WHERE status = 'suspended') AS suspended_tenants,
      (SELECT COUNT(*) FROM tenant_provisioning_requests WHERE status = 'pending') AS provisioning_pending,
      (SELECT COUNT(*) FROM tenant_subscriptions WHERE status = 'active') AS active_subscriptions,
      (SELECT COUNT(*) FROM tenant_invoices WHERE status IN ('issued','overdue')) AS outstanding_platform_invoices,
      (SELECT COALESCE(SUM(total_zar), 0) FROM tenant_invoices WHERE status IN ('issued','overdue')) AS outstanding_platform_zar,
      (SELECT COUNT(*) FROM feature_flags WHERE enabled = 1) AS active_feature_flags,
      (SELECT COUNT(*) FROM settlement_runs WHERE status = 'failed' AND started_at >= date('now','-7 days')) AS failed_settlement_runs_7d
  `).first<Record<string, number>>();
  return row || {};
}

export default cockpit;