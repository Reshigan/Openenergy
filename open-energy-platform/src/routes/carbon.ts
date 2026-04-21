// Carbon Routes - Credits, Options, Fund NAV
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const carbon = new Hono<HonoEnv>();
carbon.use('*', authMiddleware);

// GET /carbon/credits - List user's credits
carbon.get('/credits', async (c) => {
  const user = getCurrentUser(c);
  const credits = await c.env.DB.prepare(`
    SELECT * FROM carbon_credits WHERE owner_id = ? ORDER BY created_at DESC
  `).bind(user.id).all();
  return c.json({ success: true, data: credits.results || [] });
});

// POST /carbon/credits - Create/list credit
carbon.post('/credits', async (c) => {
  const user = getCurrentUser(c);
  const { registry, project_name, methodology, vintage_year, amount_tonnes, price_cents } = await c.req.json();
  
  const id = 'cc_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  
  await c.env.DB.prepare(`
    INSERT INTO carbon_credits (id, owner_id, registry, project_name, methodology, vintage_year, amount_tonnes, available_quantity, price_cents, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).bind(id, user.id, registry, project_name, methodology, vintage_year, amount_tonnes, amount_tonnes, price_cents, new Date().toISOString(), new Date().toISOString()).run();
  
  return c.json({ success: true, data: { id } }, 201);
});

// POST /carbon/retire - Retire credits
carbon.post('/credits/:id/retire', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { amount_tonnes, retirement_purpose, retirement_beneficiary } = await c.req.json();
  
  const credit = await c.env.DB.prepare('SELECT * FROM carbon_credits WHERE id = ? AND owner_id = ?').bind(id, user.id).first();
  if (!credit) return c.json({ success: false, error: 'Credit not found' }, 404);
  
  const newQty = (credit.available_quantity || 0) - amount_tonnes;
  await c.env.DB.prepare('UPDATE carbon_credits SET available_quantity = ?, status = ? WHERE id = ?').bind(newQty, newQty <= 0 ? 'retired' : 'active', id).run();
  
  await c.env.DB.prepare(`
    INSERT INTO carbon_retirements (id, credit_id, participant_id, amount_tonnes, retirement_purpose, retirement_beneficiary, retirement_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind('cr_' + Date.now().toString(36), id, user.id, amount_tonnes, retirement_purpose, retirement_beneficiary, new Date().toISOString(), new Date().toISOString()).run();
  
  await fireCascade({ event: 'carbon.retired', actor_id: user.id, entity_type: 'carbon_credits', entity_id: id, data: { amount_tonnes, retirement_purpose }, env: c.env });
  
  return c.json({ success: true, data: { retired: amount_tonnes } });
});

// GET /carbon/options - List options
carbon.get('/options', async (c) => {
  const user = getCurrentUser(c);
  const options = await c.env.DB.prepare('SELECT * FROM carbon_options WHERE writer_id = ? OR holder_id = ? ORDER BY expiry ASC').bind(user.id, user.id).all();
  return c.json({ success: true, data: options.results || [] });
});

// GET /carbon/fund/nav - Get fund NAV
carbon.get('/fund/nav', async (c) => {
  const nav = await c.env.DB.prepare('SELECT * FROM carbon_fund_nav ORDER BY nav_date DESC LIMIT 30').all();
  return c.json({ success: true, data: nav.results || [] });
});

// POST /carbon/fund/nav - Update NAV
carbon.post('/fund/nav', async (c) => {
  const { fund_id, nav_date, nav_per_unit, total_units, assets_under_management } = await c.req.json();
  
  const id = 'nf_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO carbon_fund_nav (id, fund_id, nav_date, total_units, nav_per_unit, assets_under_management, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, fund_id, nav_date, total_units, nav_per_unit, assets_under_management, new Date().toISOString()).run();
  
  return c.json({ success: true, data: { id } }, 201);
});

export default carbon;
