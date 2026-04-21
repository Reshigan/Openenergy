// Carbon Routes - Credits, Options, Fund NAV, AI (NAV calc, retirement optimiser, VCU pricing, insights)
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { ask } from '../utils/ai';

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

// ═══════════════════════════════════════════════════════════════════════════
// Carbon Fund AI — NAV calc, retirement optimiser, VCU pricing, insights
// ═══════════════════════════════════════════════════════════════════════════

async function ensureFundTables(env: HonoEnv['Bindings']) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS carbon_holdings (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      project_id TEXT,
      credit_type TEXT,
      quantity REAL DEFAULT 0,
      vintage_year INTEGER,
      acquisition_date TEXT,
      cost_basis REAL,
      status TEXT DEFAULT 'available',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS carbon_fund_nav (
      id TEXT PRIMARY KEY,
      fund_id TEXT NOT NULL,
      nav_date TEXT NOT NULL,
      total_units REAL,
      nav_per_unit REAL,
      assets_under_management REAL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

// GET /carbon/fund/summary — fund KPIs for the signed-in carbon fund
carbon.get('/fund/summary', async (c) => {
  await ensureFundTables(c.env);
  const user = getCurrentUser(c);
  const fundId = user.id;
  const holdings = await c.env.DB.prepare(`
    SELECT credit_type, vintage_year, SUM(quantity) AS qty, SUM(quantity * COALESCE(cost_basis,0)) AS cost
    FROM carbon_holdings WHERE participant_id = ? AND status = 'available'
    GROUP BY credit_type, vintage_year
  `).bind(fundId).all();
  const totalQty = (holdings.results || []).reduce((s, r) => s + Number((r as { qty?: number }).qty || 0), 0);
  const totalCost = (holdings.results || []).reduce((s, r) => s + Number((r as { cost?: number }).cost || 0), 0);
  const latestNav = await c.env.DB.prepare(`
    SELECT * FROM carbon_fund_nav WHERE fund_id = ? ORDER BY nav_date DESC LIMIT 1
  `).bind(fundId).first();
  const retired = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(quantity),0) AS retired_tco2e FROM carbon_retirements WHERE participant_id = ?
  `).bind(fundId).first();
  return c.json({
    success: true,
    data: {
      fund_id: fundId,
      total_credits: totalQty,
      total_cost_zar: totalCost,
      avg_cost_zar_per_tco2e: totalQty > 0 ? totalCost / totalQty : 0,
      retired_tco2e: Number((retired as { retired_tco2e?: number } | null)?.retired_tco2e || 0),
      latest_nav: latestNav || null,
      holdings_breakdown: holdings.results || [],
    },
  });
});

// POST /carbon/fund/nav/compute — AI NAV calculation with methodology/vintage breakdown
carbon.post('/fund/nav/compute', async (c) => {
  await ensureFundTables(c.env);
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as { spot_overrides?: Record<string, number>; fx_zar_per_usd?: number };
  const fundId = user.id;
  const holdings = await c.env.DB.prepare(`
    SELECT h.id, h.project_id, h.credit_type, h.vintage_year, h.quantity, h.cost_basis,
           cp.methodology, cp.project_type, cp.host_country
    FROM carbon_holdings h
    LEFT JOIN carbon_projects cp ON cp.id = h.project_id
    WHERE h.participant_id = ? AND h.status = 'available'
  `).bind(fundId).all();

  const result = await ask(c.env, {
    intent: 'carbon.nav_calc',
    role: user.role,
    prompt: `Compute Net Asset Value for this carbon fund. Use methodology-tier spot pricing (VCS-VM0042 premium, VCS-ACM0002 standard, Gold Standard premium, CDM-AMS discount) and apply vintage discount of 4%/year older than current. Return strict JSON: { nav_zar, aum_zar, nav_per_unit, methodology_breakdown:[{methodology, vintage, units, spot_zar, value_zar}], notes }.`,
    context: {
      holdings: holdings.results || [],
      spot_overrides: body.spot_overrides || {},
      fx: body.fx_zar_per_usd || 18.5,
    },
    max_tokens: 1100,
  });

  // Persist the NAV snapshot if structured data is valid
  const structured = result.structured as { nav_per_unit?: number; aum_zar?: number } | undefined;
  if (structured?.nav_per_unit && structured?.aum_zar) {
    const id = 'nf_' + Date.now().toString(36);
    const totalUnits = structured.aum_zar / structured.nav_per_unit;
    await c.env.DB.prepare(`
      INSERT INTO carbon_fund_nav (id, fund_id, nav_date, total_units, nav_per_unit, assets_under_management, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(id, fundId, new Date().toISOString().split('T')[0], totalUnits, structured.nav_per_unit, structured.aum_zar).run();
  }

  return c.json({ success: true, data: result });
});

// POST /carbon/fund/retire/optimise — AI retirement optimiser
carbon.post('/fund/retire/optimise', async (c) => {
  await ensureFundTables(c.env);
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    target_tco2e?: number;
    beneficiary?: string;
    methodology_preference?: string;
  };
  const fundId = user.id;
  const holdings = await c.env.DB.prepare(`
    SELECT h.id, h.project_id, h.credit_type, h.vintage_year, h.quantity, h.cost_basis,
           cp.methodology, cp.project_type
    FROM carbon_holdings h
    LEFT JOIN carbon_projects cp ON cp.id = h.project_id
    WHERE h.participant_id = ? AND h.status = 'available' AND h.quantity > 0
  `).bind(fundId).all();

  const result = await ask(c.env, {
    intent: 'carbon.retirement_optimiser',
    role: user.role,
    prompt: `Optimise carbon retirement to maximise uplift vs. book cost while meeting target ${body.target_tco2e || 10000} tCO2e for beneficiary "${body.beneficiary || 'fund investor'}". Preference: ${body.methodology_preference || 'highest uplift'}. Output JSON { retirements:[{holding_id, quantity, projected_price_zar, uplift_zar, rationale}], total_uplift_zar, total_retired_tco2e, narrative }.`,
    context: {
      holdings: holdings.results || [],
      target_tco2e: body.target_tco2e,
      beneficiary: body.beneficiary,
      methodology_preference: body.methodology_preference,
    },
    max_tokens: 1200,
  });
  return c.json({ success: true, data: result });
});

// POST /carbon/fund/retire/execute — Execute retirements from the optimiser plan
carbon.post('/fund/retire/execute', async (c) => {
  await ensureFundTables(c.env);
  const user = getCurrentUser(c);
  const body = await c.req.json() as {
    retirements: Array<{ holding_id: string; quantity: number }>;
    beneficiary?: string;
    reason?: string;
  };
  if (!Array.isArray(body.retirements) || body.retirements.length === 0) {
    return c.json({ success: false, error: 'retirements[] required' }, 400);
  }
  const results: Array<{ holding_id: string; retired: number; retirement_id: string }> = [];
  for (const r of body.retirements) {
    const holding = await c.env.DB.prepare(`SELECT * FROM carbon_holdings WHERE id = ? AND participant_id = ?`).bind(r.holding_id, user.id).first();
    if (!holding) continue;
    const newQty = Math.max(0, Number(holding.quantity || 0) - Number(r.quantity || 0));
    await c.env.DB.prepare(`
      UPDATE carbon_holdings SET quantity = ?, status = ? WHERE id = ?
    `).bind(newQty, newQty <= 0 ? 'retired' : 'available', r.holding_id).run();
    const retId = 'cr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await c.env.DB.prepare(`
      INSERT INTO carbon_retirements (id, participant_id, project_id, quantity, retirement_reason, beneficiary_name, retirement_date, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
    `).bind(retId, user.id, holding.project_id, r.quantity, body.reason || 'Fund retirement', body.beneficiary || null, user.id).run();
    await fireCascade({
      event: 'carbon.retired',
      actor_id: user.id,
      entity_type: 'carbon_retirements',
      entity_id: retId,
      data: { quantity: r.quantity, beneficiary: body.beneficiary, project_id: holding.project_id },
      env: c.env,
    });
    results.push({ holding_id: r.holding_id, retired: r.quantity, retirement_id: retId });
  }
  return c.json({ success: true, data: { retirements: results } });
});

// POST /carbon/vcu/price — AI VCU price curve for a project / methodology / vintage
carbon.post('/vcu/price', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();
  const result = await ask(c.env, {
    intent: 'carbon.nav_calc',
    role: user.role,
    prompt: `Price a VCU tranche given methodology "${body.methodology || 'VCS-ACM0002'}", vintage ${body.vintage || 2023}, project type "${body.project_type || 'solar_pv'}", host country "${body.host_country || 'ZA'}", volume ${body.volume_tco2 || 25000}. Output strict JSON { bid_zar_per_tco2e, offer_zar_per_tco2e, mid_zar_per_tco2e, scenario_uplift_pct_12m, rationale }.`,
    context: body,
    max_tokens: 500,
  });
  return c.json({ success: true, data: result });
});

// GET /carbon/fund/insights — AI portfolio narrative
carbon.get('/fund/insights', async (c) => {
  await ensureFundTables(c.env);
  const user = getCurrentUser(c);
  const fundId = user.id;
  const summary = await c.env.DB.prepare(`
    SELECT COUNT(*) AS holdings_count, COALESCE(SUM(quantity),0) AS total_qty, COALESCE(SUM(quantity * COALESCE(cost_basis,0)),0) AS total_cost
    FROM carbon_holdings WHERE participant_id = ? AND status='available'
  `).bind(fundId).first();
  const retired = await c.env.DB.prepare(`
    SELECT COUNT(*) AS retirements, COALESCE(SUM(quantity),0) AS retired_qty
    FROM carbon_retirements WHERE participant_id = ?
  `).bind(fundId).first();

  const result = await ask(c.env, {
    intent: 'carbon.nav_calc',
    role: user.role,
    prompt: `Write a concise (≤12 lines) carbon fund control-room brief. Sections: PORTFOLIO_STATUS, TOP_RISKS (3), RECOMMENDED_ACTIONS (3), OUTLOOK_12M. Reference aggregates.`,
    context: { summary, retired, fund_id: fundId },
    max_tokens: 600,
  });
  return c.json({ success: true, data: result });
});

export default carbon;
