// ═══════════════════════════════════════════════════════════════════════════
// Funder (Lender) AI routes
// -----------------------------------------------------------------------------
// Surfaces everything a Lender / Infrastructure debt investor needs:
//   • Facility book        — GET /api/funder/facilities
//   • Cashflow forecast    — POST /api/funder/facilities/:id/cashflow        (AI)
//   • Sensitivity sweep    — POST /api/funder/facilities/:id/sensitivity    (AI)
//   • Covenant watchlist   — GET  /api/funder/covenants
//   • Covenant triage      — POST /api/funder/covenants/:id/check            (AI)
//   • Disbursement queue   — GET  /api/funder/disbursements
//   • Approve disbursement — POST /api/funder/disbursements/:id/approve
//   • Portfolio brief      — GET  /api/funder/insights                       (AI)
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { ask } from '../utils/ai';
import { fireCascade } from '../utils/cascade';

const funder = new Hono<HonoEnv>();
funder.use('*', authMiddleware);

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function ensureTables(env: HonoEnv['Bindings']) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS loan_facilities (
      id TEXT PRIMARY KEY,
      facility_name TEXT NOT NULL,
      project_id TEXT,
      lender_participant_id TEXT NOT NULL,
      borrower_participant_id TEXT,
      facility_type TEXT,
      committed_amount REAL,
      drawn_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'ZAR',
      interest_rate_pct REAL,
      tenor_months INTEGER,
      dscr_covenant REAL DEFAULT 1.20,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS loan_covenants (
      id TEXT PRIMARY KEY,
      facility_id TEXT NOT NULL,
      covenant_type TEXT NOT NULL,
      threshold REAL,
      last_value REAL,
      last_checked_at TEXT,
      status TEXT DEFAULT 'clean',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS disbursement_requests (
      id TEXT PRIMARY KEY,
      facility_id TEXT NOT NULL,
      project_id TEXT,
      milestone_id TEXT,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'ZAR',
      status TEXT DEFAULT 'pending',
      approved_by TEXT,
      approved_at TEXT,
      requested_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

// ──────────────────────────────────────────────────────────────────────────
// Scoping — lenders see their own facilities. Admin/regulator see all.
// ──────────────────────────────────────────────────────────────────────────
function scopeLenderWhere(user: { id: string; role?: string }, alias = 'lf') {
  if (user.role === 'admin' || user.role === 'regulator') {
    return { where: '1=1', params: [] as (string | number)[] };
  }
  return { where: `${alias}.lender_participant_id = ?`, params: [user.id] };
}

// ──────────────────────────────────────────────────────────────────────────
// GET /facilities — portfolio overview with outstanding + risk tagging
// ──────────────────────────────────────────────────────────────────────────
funder.get('/facilities', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const scope = scopeLenderWhere(user);
  const rs = await c.env.DB.prepare(`
    SELECT lf.*, p.project_name, p.technology, p.capacity_mw, p.status AS project_status,
           (SELECT COUNT(*) FROM loan_covenants lc WHERE lc.facility_id = lf.id AND lc.status != 'clean') AS breached_covenants,
           (SELECT COUNT(*) FROM disbursement_requests dr WHERE dr.facility_id = lf.id AND dr.status = 'pending') AS pending_disbursements
    FROM loan_facilities lf
    LEFT JOIN ipp_projects p ON p.id = lf.project_id
    WHERE ${scope.where}
    ORDER BY lf.created_at DESC
  `).bind(...scope.params).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /summary — book-level KPIs
// ──────────────────────────────────────────────────────────────────────────
funder.get('/summary', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const scope = scopeLenderWhere(user);
  const row = await c.env.DB.prepare(`
    SELECT COUNT(*) AS facility_count,
           COALESCE(SUM(committed_amount),0) AS committed_zar,
           COALESCE(SUM(drawn_amount),0) AS drawn_zar,
           COALESCE(SUM(CASE WHEN status='active' THEN 1 ELSE 0 END),0) AS active_facilities
    FROM loan_facilities lf
    WHERE ${scope.where}
  `).bind(...scope.params).first();
  const covenants = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(CASE WHEN lc.status = 'breached' THEN 1 ELSE 0 END),0) AS breached,
           COALESCE(SUM(CASE WHEN lc.status = 'watch' THEN 1 ELSE 0 END),0) AS watching
    FROM loan_covenants lc
    JOIN loan_facilities lf ON lf.id = lc.facility_id
    WHERE ${scope.where}
  `).bind(...scope.params).first();
  const disbursements = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(CASE WHEN dr.status = 'pending' THEN 1 ELSE 0 END),0) AS pending,
           COALESCE(SUM(CASE WHEN dr.status = 'pending' THEN dr.amount ELSE 0 END),0) AS pending_zar
    FROM disbursement_requests dr
    JOIN loan_facilities lf ON lf.id = dr.facility_id
    WHERE ${scope.where}
  `).bind(...scope.params).first();
  return c.json({ success: true, data: { ...row, ...covenants, ...disbursements } });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /facilities/:id/cashflow — AI-generated 60-month cashflow forecast
// ──────────────────────────────────────────────────────────────────────────
funder.post('/facilities/:id/cashflow', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { assumptions?: Record<string, unknown> };
  const facility = await c.env.DB.prepare(`
    SELECT lf.*, p.project_name, p.technology, p.capacity_mw
    FROM loan_facilities lf
    LEFT JOIN ipp_projects p ON p.id = lf.project_id
    WHERE lf.id = ?
  `).bind(id).first();
  if (!facility) return c.json({ success: false, error: 'Facility not found' }, 404);

  const result = await ask(c.env, {
    intent: 'lender.cashflow_forecast',
    role: user.role,
    prompt: `Build a 60-month cashflow forecast for facility "${facility.facility_name}". Return strict JSON with months[{m, revenue, opex, debt_service, dscr}], break_even_month, irr_pct, risk_flags[].`,
    context: { facility, assumptions: body.assumptions || {} },
    max_tokens: 1400,
  });
  return c.json({ success: true, data: result });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /facilities/:id/sensitivity — AI-generated sensitivity matrix
// ──────────────────────────────────────────────────────────────────────────
funder.post('/facilities/:id/sensitivity', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    variables?: string[];
    deltas?: number[];
  };
  const facility = await c.env.DB.prepare(`SELECT * FROM loan_facilities WHERE id = ?`).bind(id).first();
  if (!facility) return c.json({ success: false, error: 'Facility not found' }, 404);

  const vars = body.variables && body.variables.length > 0 ? body.variables : ['tariff', 'capex', 'availability', 'rates'];
  const deltas = body.deltas && body.deltas.length > 0 ? body.deltas : [-15, -5, 5, 15];

  const result = await ask(c.env, {
    intent: 'lender.cashflow_forecast',
    role: user.role,
    prompt: `Produce a sensitivity matrix for facility "${facility.facility_name}". For each variable in ${vars.join(',')} and each delta in ${deltas.join(',')}, estimate resulting DSCR, IRR, refinance probability. Output JSON { matrix:[{ variable, delta, dscr, irr_pct, refinance_risk }], narrative }.`,
    context: { facility, variables: vars, deltas },
    max_tokens: 1400,
  });
  return c.json({ success: true, data: result });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /covenants — watchlist
// ──────────────────────────────────────────────────────────────────────────
funder.get('/covenants', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const scope = scopeLenderWhere(user);
  const rs = await c.env.DB.prepare(`
    SELECT lc.*, lf.facility_name, lf.project_id, lf.lender_participant_id
    FROM loan_covenants lc
    JOIN loan_facilities lf ON lf.id = lc.facility_id
    WHERE ${scope.where}
    ORDER BY CASE lc.status WHEN 'breached' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END,
             lc.last_checked_at DESC
  `).bind(...scope.params).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /covenants/:id/check — AI covenant triage; flips status if needed
// ──────────────────────────────────────────────────────────────────────────
funder.post('/covenants/:id/check', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const covenant = await c.env.DB.prepare(`
    SELECT lc.*, lf.facility_name, lf.committed_amount, lf.drawn_amount, lf.dscr_covenant,
           p.project_name, p.technology
    FROM loan_covenants lc
    JOIN loan_facilities lf ON lf.id = lc.facility_id
    LEFT JOIN ipp_projects p ON p.id = lf.project_id
    WHERE lc.id = ?
  `).bind(id).first();
  if (!covenant) return c.json({ success: false, error: 'Covenant not found' }, 404);

  const result = await ask(c.env, {
    intent: 'lender.covenant_check',
    role: user.role,
    prompt: `Triage this covenant. Output JSON: { breach_risk:'low'|'medium'|'high', recommended_status:'clean'|'watch'|'breached', recommended_actions:[...], narrative }.`,
    context: { covenant },
    max_tokens: 700,
  });
  const newStatus = (result.structured?.recommended_status as string) || covenant.status;
  if (newStatus && newStatus !== covenant.status) {
    await c.env.DB.prepare(`UPDATE loan_covenants SET status = ?, last_checked_at = datetime('now') WHERE id = ?`).bind(newStatus, id).run();
    await fireCascade({
      event: 'lender.covenant_updated',
      actor_id: user.id,
      entity_type: 'loan_covenants',
      entity_id: id,
      data: { status: newStatus, facility_id: covenant.facility_id },
      env: c.env,
    });
  }
  return c.json({ success: true, data: { ...result, new_status: newStatus } });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /disbursements — pending disbursement queue
// ──────────────────────────────────────────────────────────────────────────
funder.get('/disbursements', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const status = c.req.query('status') || 'pending';
  const scope = scopeLenderWhere(user);
  const rs = await c.env.DB.prepare(`
    SELECT dr.*, lf.facility_name, lf.committed_amount, lf.drawn_amount,
           p.project_name, p.capacity_mw, p.status AS project_status
    FROM disbursement_requests dr
    JOIN loan_facilities lf ON lf.id = dr.facility_id
    LEFT JOIN ipp_projects p ON p.id = dr.project_id
    WHERE ${scope.where} AND dr.status = ?
    ORDER BY dr.created_at DESC
  `).bind(...scope.params, status).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /disbursements/:id/approve — approve pending disbursement
// ──────────────────────────────────────────────────────────────────────────
funder.post('/disbursements/:id/approve', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const dr = await c.env.DB.prepare(`SELECT * FROM disbursement_requests WHERE id = ?`).bind(id).first();
  if (!dr) return c.json({ success: false, error: 'Disbursement not found' }, 404);
  if (dr.status !== 'pending') return c.json({ success: false, error: `Cannot approve when status is ${dr.status}` }, 400);

  await c.env.DB.prepare(`
    UPDATE disbursement_requests SET status='approved', approved_by=?, approved_at=datetime('now') WHERE id=?
  `).bind(user.id, id).run();
  await c.env.DB.prepare(`
    UPDATE loan_facilities SET drawn_amount = COALESCE(drawn_amount,0) + ? WHERE id = ?
  `).bind(Number(dr.amount || 0), dr.facility_id).run();

  await fireCascade({
    event: 'disbursement.approved',
    actor_id: user.id,
    entity_type: 'disbursement_requests',
    entity_id: id,
    data: { amount: dr.amount, facility_id: dr.facility_id, project_id: dr.project_id },
    env: c.env,
  });
  return c.json({ success: true, data: { id, status: 'approved' } });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /disbursements — create a disbursement request (borrower side)
// ──────────────────────────────────────────────────────────────────────────
funder.post('/disbursements', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const body = await c.req.json();
  const id = uid('disb');
  await c.env.DB.prepare(`
    INSERT INTO disbursement_requests (id, facility_id, project_id, milestone_id, amount, currency, requested_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
  `).bind(id, body.facility_id, body.project_id || null, body.milestone_id || null, body.amount, body.currency || 'ZAR', user.id).run();

  await fireCascade({
    event: 'disbursement.requested',
    actor_id: user.id,
    entity_type: 'disbursement_requests',
    entity_id: id,
    data: { amount: body.amount, facility_id: body.facility_id, project_id: body.project_id },
    env: c.env,
  });
  return c.json({ success: true, data: { id, status: 'pending' } }, 201);
});

// ──────────────────────────────────────────────────────────────────────────
// GET /insights — portfolio-level AI narrative
// ──────────────────────────────────────────────────────────────────────────
funder.get('/insights', async (c) => {
  await ensureTables(c.env);
  const user = getCurrentUser(c);
  const scope = scopeLenderWhere(user);
  const summary = await c.env.DB.prepare(`
    SELECT COUNT(*) AS facilities,
           COALESCE(SUM(committed_amount),0) AS committed,
           COALESCE(SUM(drawn_amount),0) AS drawn
    FROM loan_facilities lf WHERE ${scope.where}
  `).bind(...scope.params).first();
  const covenants = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(CASE WHEN lc.status='breached' THEN 1 ELSE 0 END),0) AS breached,
           COALESCE(SUM(CASE WHEN lc.status='watch' THEN 1 ELSE 0 END),0) AS watch
    FROM loan_covenants lc JOIN loan_facilities lf ON lf.id=lc.facility_id
    WHERE ${scope.where}
  `).bind(...scope.params).first();

  const result = await ask(c.env, {
    intent: 'lender.cashflow_forecast',
    role: user.role,
    prompt: `Write a concise (≤12 lines) portfolio brief for a Lender. Sections: PORTFOLIO_STATUS, TOP_RISKS (3), RECOMMENDED_ACTIONS (3), OUTLOOK_12M. Reference the supplied aggregates.`,
    context: { summary, covenants },
    max_tokens: 600,
  });
  return c.json({ success: true, data: result });
});

export default funder;
