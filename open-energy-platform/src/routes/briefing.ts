// Briefing Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const briefing = new Hono<HonoEnv>();
briefing.use('*', authMiddleware);

// GET /briefing
briefing.get('/', async (c) => {
  const user = getCurrentUser(c);
  
  // Get market prices (mock for now)
  const markets = { solar: 185, wind: 162, peak: 285, offpeak: 142 };
  
  // Get action items
  const actions = await c.env.DB.prepare(`
    SELECT * FROM action_queue WHERE participant_id = ? AND status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT 10
  `).bind(user.id).all();
  
  // Get intelligence items
  const intel = await c.env.DB.prepare(`
    SELECT * FROM intelligence_items WHERE participant_id = ? ORDER BY severity DESC, created_at DESC LIMIT 5
  `).bind(user.id).all();
  
  return c.json({ success: true, data: { markets, action_items: actions.results || [], intelligence: intel.results || [], date: new Date().toISOString() } });
});

// POST /briefing/send - Send morning briefing email
briefing.post('/send', async (c) => {
  const user = getCurrentUser(c);
  // TODO: Integrate with Resend for email
  return c.json({ success: true, message: 'Briefing queued for delivery' });
});

export default briefing;
