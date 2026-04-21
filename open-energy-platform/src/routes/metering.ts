// Metering Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const metering = new Hono<HonoEnv>();
metering.use('*', authMiddleware);

// GET /metering/readings
metering.get('/readings', async (c) => {
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

// POST /metering/readings
metering.post('/readings', async (c) => {
  const { project_id, reading_date, reading_value, reading_type } = await c.req.json();
  const id = 'mr_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO metering_readings (id, project_id, reading_date, reading_value, reading_type, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).bind(id, project_id, reading_date, reading_value, reading_type, new Date().toISOString()).run();
  return c.json({ success: true, data: { id } }, 201);
});

// GET /metering/validate
metering.get('/validate', async (c) => {
  const user = getCurrentUser(c);
  const readings = await c.env.DB.prepare(`
    SELECT * FROM metering_readings WHERE status = 'pending' AND project_id IN (SELECT id FROM ipp_projects WHERE developer_id = ?)
  `).bind(user.id).all();
  return c.json({ success: true, data: readings.results || [] });
});

export default metering;
