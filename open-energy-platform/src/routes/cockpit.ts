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

// GET /cockpit/stats — Role-aware KPI set consumed by the Fiori launchpad hero + tiles
cockpit.get('/stats', authMiddleware, async (c) => {
  const auth = c.get('auth');
  if (!auth?.user) return c.json({ success: false, error: 'Unauthorized' }, 401);
  const user = auth.user;
  try {
    const stats: Record<string, unknown> = { role: user.role };

    const myActions = await c.env.DB.prepare(
      `SELECT COUNT(*) as c FROM action_queue WHERE assignee_id = ? AND status = 'pending'`
    ).bind(user.id).first();
    stats.pending_actions = Number(myActions?.c || 0);

    const myContracts = await c.env.DB.prepare(
      `SELECT COUNT(*) as c FROM contract_documents WHERE (creator_id = ? OR counterparty_id = ?)`
    ).bind(user.id, user.id).first();
    stats.my_contracts = Number(myContracts?.c || 0);

    const mySignContracts = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT document_id) as c FROM document_signatories WHERE participant_id = ? AND signed = 0`
    ).bind(user.id).first();
    stats.contracts_awaiting_signature = Number(mySignContracts?.c || 0);

    const myInvoicesOut = await c.env.DB.prepare(
      `SELECT COUNT(*) as c, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE to_participant_id = ? AND status = 'issued'`
    ).bind(user.id).first();
    stats.invoices_to_pay = Number(myInvoicesOut?.c || 0);
    stats.invoices_to_pay_total = Number(myInvoicesOut?.total || 0);

    const myInvoicesIn = await c.env.DB.prepare(
      `SELECT COUNT(*) as c, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE from_participant_id = ? AND status = 'issued'`
    ).bind(user.id).first();
    stats.invoices_outstanding = Number(myInvoicesIn?.c || 0);
    stats.invoices_outstanding_total = Number(myInvoicesIn?.total || 0);

    if (user.role === 'ipp_developer') {
      const projects = await c.env.DB.prepare(
        `SELECT COUNT(*) as c FROM ipp_projects WHERE developer_id = ?`
      ).bind(user.id).first();
      stats.projects_count = Number(projects?.c || 0);
    }
    if (user.role === 'trader') {
      const openOrders = await c.env.DB.prepare(
        `SELECT COUNT(*) as c FROM trade_orders WHERE participant_id = ? AND status = 'open'`
      ).bind(user.id).first();
      stats.open_orders = Number(openOrders?.c || 0);
    }
    if (user.role === 'admin') {
      const pendingKyc = await c.env.DB.prepare(
        `SELECT COUNT(*) as c FROM participants WHERE kyc_status = 'pending'`
      ).first();
      stats.pending_kyc = Number(pendingKyc?.c || 0);
    }

    return c.json({ success: true, data: stats });
  } catch (error) {
    console.error('Cockpit stats error:', error);
    return c.json({ success: false, error: 'Failed to load stats', details: String(error) }, 500);
  }
});

export default cockpit;