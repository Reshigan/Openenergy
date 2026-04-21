// Intelligence Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const intelligence = new Hono<HonoEnv>();
intelligence.use('*', authMiddleware);

// GET /intelligence
intelligence.get('/', async (c) => {
  const user = getCurrentUser(c);
  const items = await c.env.DB.prepare(`
    SELECT * FROM intelligence_items 
    WHERE participant_id = ? OR participant_id IS NULL
    ORDER BY created_at DESC LIMIT 50
  `).bind(user.id).all();
  return c.json({ success: true, data: items.results || [] });
});

// POST /intelligence/scan
intelligence.post('/scan', async (c) => {
  const participants = await c.env.DB.prepare("SELECT id FROM participants WHERE status = 'active'").all();
  
  for (const p of participants.results || []) {
    // Check CP deadlines
    const cpItems = await c.env.DB.prepare(`
      SELECT pm.*, ip.project_name FROM project_milestones pm
      JOIN ipp_projects ip ON pm.project_id = ip.id
      WHERE ip.developer_id = ? AND pm.status = 'pending'
      AND pm.target_date BETWEEN date('now') AND date('now', '+7 days')
    `).bind(p.id).all();
    
    for (const item of cpItems.results || []) {
      const id = 'ii_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      await c.env.DB.prepare(`
        INSERT INTO intelligence_items (id, participant_id, type, severity, title, description, entity_type, entity_id, action_required, created_at)
        VALUES (?, ?, 'operational', 'warning', ?, ?, 'project_milestones', ?, ?, ?)
      `).bind(id, p.id, `CP Deadline: ${item.milestone_name}`, `Project "${item.project_name}" due ${item.target_date}`, item.id, 'Review milestone', new Date().toISOString()).run();
    }
  }
  return c.json({ success: true });
});

export default intelligence;
