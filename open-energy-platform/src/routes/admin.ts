// Admin Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const admin = new Hono<HonoEnv>();
admin.use('*', authMiddleware);

// GET /admin/kyc - KYC queue
admin.get('/kyc', async (c) => {
  const users = await c.env.DB.prepare("SELECT * FROM participants WHERE kyc_status = 'pending' ORDER BY created_at ASC").all();
  return c.json({ success: true, data: users.results || [] });
});

// PUT /admin/kyc/:id - Update KYC status
admin.put('/kyc/:id', async (c) => {
  const id = c.req.param('id');
  const { kyc_status } = await c.req.json();
  await c.env.DB.prepare('UPDATE participants SET kyc_status = ? WHERE id = ?').bind(kyc_status, id).run();
  return c.json({ success: true });
});

// GET /admin/modules
admin.get('/modules', async (c) => {
  const modules = await c.env.DB.prepare('SELECT * FROM modules ORDER BY display_name').all();
  return c.json({ success: true, data: modules.results || [] });
});

// PUT /admin/modules/:key
admin.put('/modules/:key', async (c) => {
  const key = c.req.param('key');
  const { enabled } = await c.req.json();
  await c.env.DB.prepare('UPDATE modules SET enabled = ? WHERE module_key = ?').bind(enabled ? 1 : 0, key).run();
  await c.env.KV.delete(`module:${key}`);
  return c.json({ success: true });
});

// GET /admin/audit-logs
admin.get('/audit-logs', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const logs = await c.env.DB.prepare('SELECT al.*, p.name as actor_name FROM audit_logs al LEFT JOIN participants p ON al.actor_id = p.id ORDER BY al.created_at DESC LIMIT 50 OFFSET ?').bind((page - 1) * 50).all();
  return c.json({ success: true, data: logs.results || [] });
});

export default admin;
