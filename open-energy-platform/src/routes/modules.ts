// ═══════════════════════════════════════════════════════════════════════════
// Modules — Per-participant module enablement.
// Catalogue lives in `modules` (001_core). Per-participant overrides live in
// `platform_modules` (008_platform_admin). Admin writes; all authenticated
// users can read their own access set.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const modules = new Hono<HonoEnv>();
modules.use('*', authMiddleware);

// Fallback seed — used only when the `modules` catalogue table is empty.
const FALLBACK_MODULES = [
  { module_key: 'spot_trading', display_name: 'Spot Trading', description: 'Real-time energy trading', enabled: 1 },
  { module_key: 'carbon_credits', display_name: 'Carbon Credits', description: 'Buy, sell and retire carbon credits', enabled: 1 },
  { module_key: 'project_dev', display_name: 'Project Development', description: 'IPP project management', enabled: 1 },
  { module_key: 'ppa_management', display_name: 'PPA Management', description: 'PPA lifecycle', enabled: 1 },
  { module_key: 'esg_tracking', display_name: 'ESG Tracking', description: 'Environmental & sustainability tracking', enabled: 1 },
  { module_key: 'grid_wheeling', display_name: 'Grid Wheeling', description: 'Wheeling agreements', enabled: 1 },
  { module_key: 'procurement', display_name: 'Procurement Hub', description: 'RFP and bid management', enabled: 1 },
  { module_key: 'deal_room', display_name: 'Deal Room', description: 'Contract negotiation & signing', enabled: 1 },
];

modules.get('/', async (c) => {
  const rows = await c.env.DB.prepare('SELECT module_key, display_name, description, enabled, required_role, price_monthly FROM modules ORDER BY display_name').all();
  const catalogue = (rows.results && rows.results.length) ? rows.results : FALLBACK_MODULES;
  return c.json({ success: true, data: catalogue });
});

// GET /modules/my — effective access set for caller. A module is enabled if
// the catalogue has it on AND (no per-participant override OR the override
// is enabled) AND (the module has no required_role OR the caller matches it).
modules.get('/my', async (c) => {
  const user = getCurrentUser(c);
  const [catalogueResult, overridesResult] = await Promise.all([
    c.env.DB.prepare('SELECT module_key, required_role, enabled FROM modules').all(),
    c.env.DB.prepare('SELECT module_id, enabled FROM platform_modules WHERE participant_id = ?').bind(user.id).all(),
  ]);
  const catalogue = catalogueResult.results || [];
  const overrides = new Map<string, number>();
  for (const row of (overridesResult.results || [])) {
    const r = row as { module_id: string; enabled: number };
    overrides.set(r.module_id, r.enabled);
  }
  const enabled: string[] = [];
  for (const row of catalogue) {
    const r = row as { module_key: string; required_role?: string; enabled: number };
    if (!r.enabled) continue;
    if (r.required_role && r.required_role !== user.role && user.role !== 'admin') continue;
    if (overrides.has(r.module_key) && overrides.get(r.module_key) === 0) continue;
    enabled.push(r.module_key);
  }
  return c.json({
    success: true,
    data: {
      participant_id: user.id,
      role: user.role,
      enabled_modules: enabled,
      catalogue: catalogue.length ? catalogue : FALLBACK_MODULES,
    },
  });
});

function requireAdmin(c: any) {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Admin access required' }, 403);
  return null;
}

modules.post('/:moduleId/enable', async (c) => {
  const deny = requireAdmin(c);
  if (deny) return deny;
  const user = getCurrentUser(c);
  const { moduleId } = c.req.param();
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { participant_id } = body as { participant_id?: string };
  if (!participant_id) return c.json({ success: false, error: 'Participant ID required' }, 400);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO platform_modules (participant_id, module_id, enabled, granted_by, updated_at)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(participant_id, module_id) DO UPDATE SET enabled = 1, granted_by = excluded.granted_by, updated_at = excluded.updated_at
  `).bind(participant_id, moduleId, user.id, now).run();
  return c.json({ success: true, data: { module_id: moduleId, enabled: true } });
});

modules.post('/:moduleId/disable', async (c) => {
  const deny = requireAdmin(c);
  if (deny) return deny;
  const user = getCurrentUser(c);
  const { moduleId } = c.req.param();
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { participant_id } = body as { participant_id?: string };
  if (!participant_id) return c.json({ success: false, error: 'Participant ID required' }, 400);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO platform_modules (participant_id, module_id, enabled, granted_by, updated_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(participant_id, module_id) DO UPDATE SET enabled = 0, granted_by = excluded.granted_by, updated_at = excluded.updated_at
  `).bind(participant_id, moduleId, user.id, now).run();
  return c.json({ success: true, data: { module_id: moduleId, enabled: false } });
});

export default modules;
