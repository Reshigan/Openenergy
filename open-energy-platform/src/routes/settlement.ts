// Settlement Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const settlement = new Hono<HonoEnv>();
settlement.use('*', authMiddleware);

// GET /settlement/invoices
settlement.get('/invoices', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  
  let query = `
    SELECT i.*, fp.name as from_name, tp.name as to_name
    FROM invoices i
    JOIN participants fp ON i.from_participant_id = fp.id
    JOIN participants tp ON i.to_participant_id = tp.id
    WHERE (i.from_participant_id = ? OR i.to_participant_id = ?)
  `;
  const bindings: any[] = [user.id, user.id];
  
  if (status) {
    query += ' AND i.status = ?';
    bindings.push(status);
  }
  
  query += ' ORDER BY i.created_at DESC LIMIT 50';
  
  const result = await c.env.DB.prepare(query).bind(...bindings).all();
  return c.json({ success: true, data: result.results || [] });
});

export default settlement;
