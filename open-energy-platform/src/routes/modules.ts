// ═══════════════════════════════════════════════════════════════════════════
// Modules — Module Admin (Enable/Disable Features Per Participant)
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, requireRole } from '../middleware/auth';

const modules = new Hono<HonoEnv>();

const AVAILABLE_MODULES = [
  { id: 'spot_trading', name: 'Spot Trading', description: 'Real-time energy trading' },
  { id: 'carbon_credits', name: 'Carbon Credits', description: 'Buy, sell and retire carbon credits' },
  { id: 'project_dev', name: 'Project Development', description: 'IPP project management' },
  { id: 'ppa_management', name: 'PPA Management', description: 'Power Purchase Agreement lifecycle' },
  { id: 'esg_tracking', name: 'ESG Tracking', description: 'Environmental and sustainability tracking' },
  { id: 'grid_wheeling', name: 'Grid Wheeling', description: 'Energy wheeling through the grid' },
  { id: 'procurement', name: 'Procurement Hub', description: 'RFP and bid management' },
  { id: 'deal_room', name: 'Deal Room', description: 'Contract negotiation and signing' },
];

modules.get('/', authMiddleware(), async (c) => {
  return c.json({ success: true, data: AVAILABLE_MODULES });
});

modules.get('/my', authMiddleware(), async (c) => {
  const participant = c.get('participant');
  const enabled = await c.env.DB.prepare(`
    SELECT module_id FROM platform_modules WHERE participant_id = ? AND enabled = 1
  `).bind(participant.id).all();
  
  return c.json({ 
    success: true, 
    data: {
      participant_id: participant.id,
      role: participant.role,
      enabled_modules: enabled.results?.map((r: any) => r.module_id) || [],
      all_modules: AVAILABLE_MODULES
    }
  });
});

modules.post('/:moduleId/enable', requireRole('admin'), async (c) => {
  const { moduleId } = c.req.param();
  const { participant_id } = await c.req.json();
  
  if (!participant_id) {
    return c.json({ success: false, error: 'Participant ID required' }, 400);
  }
  
  await c.env.DB.prepare(`
    INSERT INTO platform_modules (participant_id, module_id, enabled, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(participant_id, module_id) DO UPDATE SET enabled = 1, updated_at = ?
  `).bind(participant_id, moduleId, new Date().toISOString(), new Date().toISOString()).run();
  
  return c.json({ success: true, data: { module_id: moduleId, enabled: true } });
});

modules.post('/:moduleId/disable', requireRole('admin'), async (c) => {
  const { moduleId } = c.req.param();
  const { participant_id } = await c.req.json();
  
  await c.env.DB.prepare(`
    UPDATE platform_modules SET enabled = 0, updated_at = ? WHERE participant_id = ? AND module_id = ?
  `).bind(new Date().toISOString(), participant_id, moduleId).run();
  
  return c.json({ success: true, data: { module_id: moduleId, enabled: false } });
});

export default modules;
