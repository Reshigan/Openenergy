// Carbon Routes - Credits, Options, Fund NAV, AI (NAV calc, retirement optimiser, VCU pricing, insights)
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { ask } from '../utils/ai';
import { withLock, LockBusyError } from '../utils/locks';

const carbon = new Hono<HonoEnv>();
carbon.use('*', authMiddleware);

// GET /carbon/credits — list the caller's carbon holdings, shaped for the UI.
//
// The actual table is `carbon_holdings` (renamed in v2 from the legacy
// `carbon_credits`). We JOIN onto `carbon_projects` so the UI gets the
// project name + methodology + registry it expects, and alias columns onto
// the legacy field names so the existing front-end shape doesn't change.
carbon.get('/credits', async (c) => {
  const user = getCurrentUser(c);
  const credits = await c.env.DB.prepare(`
    SELECT h.id,
           h.participant_id    AS owner_id,
           h.project_id,
           p.project_name,
           p.project_number    AS registry,
           p.methodology,
           p.project_type,
           h.credit_type,
           h.vintage_year      AS vintage,
           h.quantity          AS quantity,
           h.quantity          AS amount_tonnes,
           h.quantity          AS available_quantity,
           h.cost_basis        AS price_per_credit,
           h.status,
           h.acquisition_date,
           h.created_at,
           NULL                AS serial_number,
           NULL                AS retirement_certificate_url
      FROM carbon_holdings h
      LEFT JOIN carbon_projects p ON p.id = h.project_id
     WHERE h.participant_id = ?
     ORDER BY h.created_at DESC
  `).bind(user.id).all();
  return c.json({ success: true, data: credits.results || [] });
});

// POST /carbon/credits - Create/list credit
// POST /carbon/credits — record a new carbon holding.
//
// v2 schema renamed `carbon_credits` → `carbon_holdings` and stripped a
// number of fields (registry/project_name/methodology now live on the
// linked `carbon_projects` row). This route still accepts the legacy
// payload but writes to the new table — `project_id` is required so the
// holding can join back to the project metadata.
carbon.post('/credits', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const project_id = (body.project_id as string) || (body.project_name as string);
  const quantity = (body.quantity as number) ?? (body.amount_tonnes as number);
  const credit_type = (body.credit_type as string) || 'VCU';
  const vintage_year = body.vintage_year as number | undefined;
  if (!project_id || quantity === undefined) {
    return c.json({ success: false, error: 'project_id (or project_name) and quantity (or amount_tonnes) are required' }, 400);
  }
  // Pre-validate the FK so an unknown project_id returns 404 instead of a raw
  // FOREIGN KEY constraint 500 (carbon_holdings.project_id → carbon_projects.id).
  const proj = await c.env.DB
    .prepare('SELECT id FROM carbon_projects WHERE id = ?')
    .bind(project_id)
    .first<{ id: string }>();
  if (!proj) {
    return c.json({ success: false, error: 'project_id does not reference a known carbon project' }, 404);
  }
  const id = 'cc_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  await c.env.DB.prepare(`
    INSERT INTO carbon_holdings (id, participant_id, project_id, credit_type, quantity, vintage_year, acquisition_date, cost_basis, status)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, 'available')
  `).bind(
    id, user.id, project_id, credit_type, Number(quantity),
    vintage_year ?? null,
    (body.price_cents as number | undefined) ? Number(body.price_cents) / 100 : (body.cost_basis as number | undefined) ?? null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

// PUT /carbon/credits/:id — edit a holding (owner only). Pricing + metadata
// are editable; available_quantity is NOT — it mutates only via retirement
// or trade settlement so the audit trail stays correct.
carbon.put('/credits/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB
    .prepare('SELECT participant_id AS owner_id FROM carbon_holdings WHERE id = ?')
    .bind(id).first() as { owner_id?: string } | null;
  if (!existing) return c.json({ success: false, error: 'Credit not found' }, 404);
  if (user.role !== 'admin' && existing.owner_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const editable = ['credit_type', 'vintage_year', 'cost_basis', 'status'] as const;
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  for (const k of editable) {
    if (k in body) {
      sets.push(`${k} = ?`);
      const v = body[k];
      binds.push(v == null ? null : (typeof v === 'number' ? v : String(v)));
    }
  }
  if (sets.length === 0) return c.json({ success: false, error: 'No editable fields supplied' }, 400);
  sets.push('updated_at = ?');
  binds.push(new Date().toISOString());
  binds.push(id);
  await c.env.DB.prepare(`UPDATE carbon_holdings SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  const out = await c.env.DB.prepare('SELECT * FROM carbon_holdings WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: out });
});

// DELETE /carbon/credits/:id — only unretired credits with no retirement
// history may be hard-deleted; otherwise the credit is soft-archived so the
// retirement chain stays intact.
carbon.delete('/credits/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB
    .prepare('SELECT participant_id AS owner_id, status FROM carbon_holdings WHERE id = ?')
    .bind(id).first() as { owner_id?: string; status?: string } | null;
  if (!existing) return c.json({ success: false, error: 'Credit not found' }, 404);
  if (user.role !== 'admin' && existing.owner_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  if (existing.status === 'retired') {
    await c.env.DB.prepare(`UPDATE carbon_holdings SET status = 'archived' WHERE id = ?`).bind(id).run();
    return c.json({ success: true, data: { id, status: 'archived' } });
  }
  await c.env.DB.prepare('DELETE FROM carbon_holdings WHERE id = ?').bind(id).run();
  return c.json({ success: true, data: { id, deleted: true } });
});

// POST /carbon/credits/:id/retire — retire a holding, write the retirement
// row and fire the cascade. Body: { quantity, reason, beneficiary } (legacy
// `amount_tonnes`, `retirement_purpose`, `retirement_beneficiary` keys are
// also accepted so the older UI doesn't break).
carbon.post('/credits/:id/retire', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    quantity?: number; amount_tonnes?: number;
    reason?: string; retirement_purpose?: string;
    beneficiary?: string; retirement_beneficiary?: string;
  };
  const qty = Number(body.quantity ?? body.amount_tonnes ?? 0);
  const reason = body.reason ?? body.retirement_purpose ?? null;
  const beneficiary = body.beneficiary ?? body.retirement_beneficiary ?? null;
  if (!qty || qty <= 0) return c.json({ success: false, error: 'quantity_required' }, 400);

  // FIX bizlogic-1: wrap SELECT+check+UPDATE+INSERT in an advisory lock to
  // prevent TOCTOU double-retirement from concurrent requests on the same
  // holding. The holding is re-read INSIDE the lock so any race that slipped
  // past the outer early-return still sees the committed state.
  let retireResult: { retired: number; certificate_number: string; retirement_id: string };
  try {
    retireResult = await withLock(
      c.env,
      `carbon:retire:${id}`,
      user.id,
      async () => {
        // Re-read inside the lock — canonical TOCTOU prevention.
        const holding = await c.env.DB.prepare(
          `SELECT id, project_id, quantity, status FROM carbon_holdings WHERE id = ? AND participant_id = ?`,
        ).bind(id, user.id).first() as { id?: string; project_id?: string; quantity?: number; status?: string } | null;
        if (!holding) throw new LockBusyError('__not_found__');
        if ((holding.status || 'available') === 'retired') throw new LockBusyError('__already_retired__');
        if (qty > Number(holding.quantity || 0)) throw new LockBusyError('__insufficient_balance__');

        const newQty = Number(holding.quantity || 0) - qty;
        const retId = 'cr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const cert = `OE-${retId.slice(-8).toUpperCase()}`;

        // Atomic batch: UPDATE holding + INSERT retirement record together.
        await c.env.DB.batch([
          c.env.DB.prepare(
            `UPDATE carbon_holdings SET quantity = ?, status = ? WHERE id = ?`,
          ).bind(newQty, newQty <= 0 ? 'retired' : 'available', id),
          c.env.DB.prepare(`
            INSERT INTO carbon_retirements
              (id, participant_id, project_id, quantity, retirement_reason, certificate_number, beneficiary_name, retirement_date, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
          `).bind(retId, user.id, holding.project_id, qty, reason, cert, beneficiary, user.id),
        ]);

        return { retired: qty, certificate_number: cert, retirement_id: retId, project_id: holding.project_id };
      },
      { ttlSeconds: 10 },
    );
  } catch (err) {
    if (err instanceof LockBusyError) {
      switch (err.key) {
        case '__not_found__': return c.json({ success: false, error: 'credit_not_found' }, 404);
        case '__already_retired__': return c.json({ success: false, error: 'already_retired' }, 400);
        case '__insufficient_balance__': return c.json({ success: false, error: 'insufficient_balance' }, 400);
        default: return c.json({ success: false, error: 'Retirement in progress — retry in a moment' }, 409);
      }
    }
    throw err;
  }

  await fireCascade({
    event: 'carbon.retired', actor_id: user.id,
    entity_type: 'carbon_holdings', entity_id: id,
    data: { quantity: retireResult.retired, reason, certificate_number: retireResult.certificate_number },
    env: c.env,
  });
  return c.json({ success: true, data: retireResult });
});

// GET /carbon/options — caller's open + recently-closed options.
//
// Schema uses `seller_id` (writer) + `option_type` + `strike_price` +
// `expiry_date`. The UI reads `type`, `strike`, `expiry`, `delta`, `gamma`,
// so we alias columns and return delta/gamma as null until the pricer wires
// them in (the UI already shows '—' for missing greeks).
carbon.get('/options', async (c) => {
  const user = getCurrentUser(c);
  const options = await c.env.DB.prepare(
    `SELECT id,
            seller_id,
            project_id,
            option_type     AS type,
            strike_price    AS strike,
            volume_tco2     AS volume,
            expiry_date     AS expiry,
            premium_per_tco2 AS premium,
            status,
            NULL            AS delta,
            NULL            AS gamma,
            created_at
       FROM carbon_options
      WHERE seller_id = ?
      ORDER BY expiry_date ASC`,
  ).bind(user.id).all();
  return c.json({ success: true, data: options.results || [] });
});

// GET /carbon/fund/nav - Get fund NAV
carbon.get('/fund/nav', async (c) => {
  const nav = await c.env.DB.prepare('SELECT * FROM carbon_fund_nav ORDER BY nav_date DESC LIMIT 30').all();
  return c.json({ success: true, data: nav.results || [] });
});

// POST /carbon/fund/nav - Update NAV
carbon.post('/fund/nav', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { fund_id, nav_date, nav_per_unit, total_units, assets_under_management } = body as {
    fund_id?: string; nav_date?: string; nav_per_unit?: number; total_units?: number; assets_under_management?: number;
  };
  if (!fund_id || !nav_date || nav_per_unit === undefined) {
    return c.json({ success: false, error: 'fund_id, nav_date and nav_per_unit are required' }, 400);
  }
  // NAV is a financial mark set by the fund manager. Restrict to admin (any
  // fund) or a carbon_fund publishing its own fund's NAV (fund_id keyed to the
  // participant, as in /fund/insights). Prevents any authed user writing marks.
  if (user.role !== 'admin' && !(user.role === 'carbon_fund' && fund_id === user.id)) {
    return c.json({ success: false, error: 'Not authorised to publish NAV for this fund' }, 403);
  }
  const id = 'nf_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO carbon_fund_nav (id, fund_id, nav_date, total_units, nav_per_unit, assets_under_management, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, fund_id, nav_date, total_units ?? null, nav_per_unit, assets_under_management ?? null, new Date().toISOString()).run();
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
