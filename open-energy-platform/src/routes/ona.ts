// ONA Integration Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const ona = new Hono<HonoEnv>();

ona.use('*', authMiddleware);

// Link participant to Ona tenant
ona.post('/link', async (c) => {
  const user = getCurrentUser(c);
  const { ona_tenant_id, site_ids } = await c.req.json();
  
  const id = 'id_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  
  await c.env.DB.prepare(`
    INSERT INTO ona_sites (id, project_id, ona_asset_id, site_name, status, created_at)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).bind(id, site_ids?.[0] || null, ona_tenant_id, `Ona Site ${id.slice(0,8)}`, new Date().toISOString()).run();
  
  return c.json({ success: true, data: { id } }, 201);
});

// Get Ona sites for project
ona.get('/sites/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  const sites = await c.env.DB.prepare(`
    SELECT * FROM ona_sites WHERE project_id = ?
  `).bind(projectId).all();
  
  return c.json({ success: true, data: sites.results || [] });
});

// Sync forecasts
ona.post('/sync/forecast', async (c) => {
  const { project_id, forecast_data } = await c.req.json();
  
  await c.env.DB.prepare(`
    INSERT INTO ona_forecasts (id, project_id, forecast_date, predicted_mwh, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    'id_' + Date.now().toString(36),
    project_id,
    forecast_data?.date || new Date().toISOString().split('T')[0],
    forecast_data?.mwh || 0,
    new Date().toISOString()
  ).run();
  
  return c.json({ success: true });
});

// Get forecasts
ona.get('/:projectId/forecast', async (c) => {
  const projectId = c.req.param('projectId');
  const forecasts = await c.env.DB.prepare(`
    SELECT * FROM ona_forecasts WHERE project_id = ? ORDER BY forecast_date DESC LIMIT 48
  `).bind(projectId).all();
  
  return c.json({ success: true, data: forecasts.results || [] });
});

// Get faults
ona.get('/:projectId/faults', async (c) => {
  const projectId = c.req.param('projectId');
  const faults = await c.env.DB.prepare(`
    SELECT * FROM ona_faults WHERE project_id = ? ORDER BY created_at DESC
  `).bind(projectId).all();
  
  return c.json({ success: true, data: faults.results || [] });
});

// Get maintenance
ona.get('/:projectId/maintenance', async (c) => {
  const projectId = c.req.param('projectId');
  const maint = await c.env.DB.prepare(`
    SELECT * FROM ona_maintenance WHERE project_id = ? ORDER BY created_at DESC
  `).bind(projectId).all();
  
  return c.json({ success: true, data: maint.results || [] });
});

export default ona;
