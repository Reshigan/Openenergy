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

export default cockpit;