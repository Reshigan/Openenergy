// ═══════════════════════════════════════════════════════════════════════════
// Regulator routes
// -----------------------------------------------------------------------------
// AI-assisted compliance workspace for NERSA / DMRE / JSE-SRL filings.
//   • GET  /api/regulator/filings           — filings registered in system
//   • POST /api/regulator/filing/:type/generate  — AI compliance narrative
//   • GET  /api/regulator/market-summary    — market concentration + GMV
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { ask } from '../utils/ai';

const regulator = new Hono<HonoEnv>();
regulator.use('*', authMiddleware);

async function ensureTable(env: HonoEnv['Bindings']) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS regulator_filings (
      id TEXT PRIMARY KEY,
      filing_type TEXT NOT NULL,
      reporting_period TEXT NOT NULL,
      filed_by TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      narrative TEXT,
      evidence_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

// ──────────────────────────────────────────────────────────────────────────
// GET /filings — list filings (regulator/admin see all, others only their own)
// ──────────────────────────────────────────────────────────────────────────
regulator.get('/filings', async (c) => {
  await ensureTable(c.env);
  const user = getCurrentUser(c);
  const sql = user.role === 'regulator' || user.role === 'admin'
    ? `SELECT * FROM regulator_filings ORDER BY created_at DESC LIMIT 100`
    : `SELECT * FROM regulator_filings WHERE filed_by = ? ORDER BY created_at DESC LIMIT 100`;
  const rs = user.role === 'regulator' || user.role === 'admin'
    ? await c.env.DB.prepare(sql).all()
    : await c.env.DB.prepare(sql).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /filing/:type/generate — AI-drafted compliance narrative
// Body: { reporting_period, scope?, extra_context? }
// :type ∈ nersa_annual | popia_pia | jse_srl | carbon_tax | ipp_quarterly
// ──────────────────────────────────────────────────────────────────────────
regulator.post('/filing/:type/generate', async (c) => {
  await ensureTable(c.env);
  const user = getCurrentUser(c);
  const filingType = c.req.param('type');
  const body = (await c.req.json().catch(() => ({}))) as {
    reporting_period?: string;
    scope?: Record<string, unknown>;
    extra_context?: string;
  };

  const period = body.reporting_period || new Date().toISOString().slice(0, 7);

  // Pull high-level metrics for the narrative so the AI grounds itself.
  const metrics = await c.env.DB.prepare(`
    SELECT (SELECT COUNT(*) FROM ipp_projects) AS projects,
           (SELECT COUNT(*) FROM ipp_projects WHERE status='commercial_operations') AS projects_cod,
           (SELECT COALESCE(SUM(capacity_mw),0) FROM ipp_projects) AS total_mw,
           (SELECT COUNT(*) FROM contract_documents WHERE phase='active') AS active_contracts,
           (SELECT COUNT(*) FROM carbon_retirements) AS retirements,
           (SELECT COUNT(*) FROM esg_reports WHERE status='published') AS esg_reports,
           (SELECT COUNT(*) FROM grid_constraints WHERE status='active') AS active_constraints
  `).first();

  const result = await ask(c.env, {
    intent: 'regulator.compliance_narrative',
    role: user.role,
    prompt:
      `Draft a ${filingType.toUpperCase()} compliance narrative for reporting period ${period}.
Cite the governing SA framework (ECA 2006, NERSA rules, POPIA 4 of 2013, Companies Act 71/2008,
Carbon Tax Act 15/2019, JSE-SRL, King IV where applicable). Use plain markdown, sections
numbered. Stay factual — ground every claim in the metrics given.`,
    context: {
      filing_type: filingType,
      reporting_period: period,
      scope: body.scope,
      extra_context: body.extra_context,
      metrics,
    },
    max_tokens: 1200,
  });

  const id = 'rf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await c.env.DB.prepare(
    `INSERT INTO regulator_filings (id, filing_type, reporting_period, filed_by, status, narrative, evidence_json)
     VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
  ).bind(id, filingType, period, user.id, result.text, JSON.stringify(metrics || {})).run();

  return c.json({ success: true, data: { id, ...result, metrics } });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /market-summary — concentration, GMV, activity (regulator overview)
// ──────────────────────────────────────────────────────────────────────────
regulator.get('/market-summary', async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT (SELECT COUNT(*) FROM participants WHERE status='active') AS active_participants,
           (SELECT COUNT(*) FROM ipp_projects) AS projects,
           (SELECT COALESCE(SUM(capacity_mw),0) FROM ipp_projects) AS total_mw,
           (SELECT COUNT(*) FROM trade_orders WHERE status='open') AS open_orders,
           (SELECT COUNT(*) FROM invoices WHERE status='paid' AND strftime('%Y', issue_date)=strftime('%Y','now')) AS paid_ytd,
           (SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='paid') AS gmv_paid_zar,
           (SELECT COUNT(*) FROM grid_constraints WHERE status='active') AS active_grid_constraints
  `).first();

  const byTech = await c.env.DB.prepare(`
    SELECT technology, COUNT(*) AS n, COALESCE(SUM(capacity_mw),0) AS mw
    FROM ipp_projects GROUP BY technology
  `).all();

  return c.json({ success: true, data: { summary: row, by_technology: byTech.results || [] } });
});

export default regulator;
