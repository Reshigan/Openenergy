// Grid Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const grid = new Hono<HonoEnv>();
grid.use('*', authMiddleware);

// GET /grid/connections
grid.get('/connections', async (c) => {
  const user = getCurrentUser(c);
  const conns = await c.env.DB.prepare(`
    SELECT gc.*, ip.project_name 
    FROM grid_connections gc 
    LEFT JOIN ipp_projects ip ON gc.project_id = ip.id 
    WHERE gc.project_id IN (SELECT id FROM ipp_projects WHERE developer_id = ?)
    OR EXISTS (SELECT 1 FROM participants WHERE id = ? AND role = 'grid_operator')
    ORDER BY gc.created_at DESC
  `).bind(user.id, user.id).all();
  return c.json({ success: true, data: conns.results || [] });
});

// GET /grid/wheeling
grid.get('/wheeling', async (c) => {
  const user = getCurrentUser(c);
  const agreements = await c.env.DB.prepare(`
    SELECT * FROM grid_wheeling_agreements 
    WHERE generator_id = ? OR offtaker_id = ? 
    ORDER BY created_at DESC
  `).bind(user.id, user.id).all();
  return c.json({ success: true, data: agreements.results || [] });
});

// GET /grid/imbalance
grid.get('/imbalance', async (c) => {
  const user = getCurrentUser(c);
  const imb = await c.env.DB.prepare(`
    SELECT gi.*, ip.project_name 
    FROM grid_imbalance gi 
    LEFT JOIN ipp_projects ip ON gi.project_id = ip.id 
    WHERE gi.project_id IN (SELECT id FROM ipp_projects WHERE developer_id = ?)
    ORDER BY gi.period DESC LIMIT 100
  `).bind(user.id).all();
  return c.json({ success: true, data: imb.results || [] });
});

// GET /grid/metering
grid.get('/metering', async (c) => {
  const user = getCurrentUser(c);
  const readings = await c.env.DB.prepare(`
    SELECT mr.*, ip.project_name 
    FROM metering_readings mr 
    LEFT JOIN ipp_projects ip ON mr.project_id = ip.id 
    WHERE mr.project_id IN (SELECT id FROM ipp_projects WHERE developer_id = ?)
    ORDER BY mr.reading_date DESC LIMIT 100
  `).bind(user.id).all();
  return c.json({ success: true, data: readings.results || [] });
});

export default grid;
