// ONA Integration + O&M routes
// All asset telemetry / forecast / fault / maintenance / work-order endpoints
// surfaced through the dedicated O&M cockpit section live under /api/ona.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { ask } from '../utils/ai';
import { getTenantId, isAdmin } from '../utils/tenant';
import * as asoba from '../utils/asoba';

const ona = new Hono<HonoEnv>();

ona.use('*', authMiddleware);

// ---------------- helpers ----------------

async function scopedSiteClause(_env: HonoEnv['Bindings'], user: { id: string; role: string }) {
  // Admin + regulator see everything; IPP developer only sees sites belonging
  // to projects they own; everyone else gets scoped read.
  if (user.role === 'admin' || user.role === 'regulator') {
    return { where: '1=1', params: [] as unknown[] };
  }
  return {
    where: `os.project_id IN (SELECT id FROM ipp_projects WHERE developer_id = ?)`,
    params: [user.id],
  };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

// ---------------- Sites overview ----------------

// GET /api/ona/sites — returns all sites the caller is entitled to, with
// rolled-up KPIs (capacity, availability, open faults, generation YTD).
ona.get('/sites', async (c) => {
  const user = getCurrentUser(c);
  const scope = await scopedSiteClause(c.env, user);
  const sites = await c.env.DB.prepare(`
    SELECT os.id, os.site_name, os.ona_site_id, os.latitude, os.longitude,
           os.capacity_mw, os.status, os.last_sync_at, os.created_at,
           os.project_id, p.project_name, p.technology, p.capacity_mw AS project_capacity_mw
    FROM ona_sites os
    LEFT JOIN ipp_projects p ON p.id = os.project_id
    WHERE ${scope.where}
    ORDER BY os.site_name ASC
  `).bind(...scope.params).all();

  const enriched = [];
  for (const s of sites.results || []) {
    const siteId = (s as Record<string, unknown>).id as string;
    const [openFaults, avail, ytd] = await Promise.all([
      safe(async () => {
        const r = await c.env.DB.prepare(
          `SELECT COUNT(*) AS c FROM ona_faults WHERE site_id = ? AND status IN ('open','investigating')`
        ).bind(siteId).first();
        return Number((r as { c?: number } | null)?.c || 0);
      }, 0),
      safe(async () => {
        const r = await c.env.DB.prepare(
          `SELECT AVG(availability_percentage) AS a FROM ona_forecasts WHERE site_id = ? AND forecast_type = 'day_ahead' AND forecast_date >= date('now','-30 day')`
        ).bind(siteId).first();
        return Number((r as { a?: number } | null)?.a || 0);
      }, 0),
      safe(async () => {
        const r = await c.env.DB.prepare(
          `SELECT SUM(actual_mwh) AS g FROM ona_nominations WHERE site_id = ? AND nomination_date >= date('now','start of year')`
        ).bind(siteId).first();
        return Number((r as { g?: number } | null)?.g || 0);
      }, 0),
    ]);
    enriched.push({ ...s, open_faults: openFaults, availability_30d: avail, generation_ytd_mwh: ytd });
  }
  return c.json({ success: true, data: enriched });
});

// GET /api/ona/summary — portfolio rollup for O&M hero tiles.
ona.get('/summary', async (c) => {
  const user = getCurrentUser(c);
  const scope = await scopedSiteClause(c.env, user);
  const [sites, openFaults, criticalFaults, scheduledMaint, genYtd] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS c, SUM(capacity_mw) AS mw FROM ona_sites os WHERE ${scope.where}`).bind(...scope.params).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS c FROM ona_faults f JOIN ona_sites os ON f.site_id = os.id WHERE f.status IN ('open','investigating') AND ${scope.where}`).bind(...scope.params).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS c FROM ona_faults f JOIN ona_sites os ON f.site_id = os.id WHERE f.severity = 'critical' AND f.status != 'resolved' AND ${scope.where}`).bind(...scope.params).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS c FROM ona_maintenance m JOIN ona_sites os ON m.site_id = os.id WHERE m.status = 'scheduled' AND ${scope.where}`).bind(...scope.params).first(),
    c.env.DB.prepare(`SELECT SUM(actual_mwh) AS g FROM ona_nominations n JOIN ona_sites os ON n.site_id = os.id WHERE n.nomination_date >= date('now','start of year') AND ${scope.where}`).bind(...scope.params).first(),
  ]);
  return c.json({
    success: true,
    data: {
      site_count: Number((sites as { c?: number } | null)?.c || 0),
      portfolio_mw: Number((sites as { mw?: number } | null)?.mw || 0),
      open_faults: Number((openFaults as { c?: number } | null)?.c || 0),
      critical_faults: Number((criticalFaults as { c?: number } | null)?.c || 0),
      scheduled_maintenance: Number((scheduledMaint as { c?: number } | null)?.c || 0),
      generation_ytd_mwh: Number((genYtd as { g?: number } | null)?.g || 0),
    },
  });
});

// ---------------- Live telemetry (latest nominations -> telemetry proxy) ----------------

ona.get('/telemetry/:siteId', async (c) => {
  const siteId = c.req.param('siteId');
  const rows = await c.env.DB.prepare(`
    SELECT nomination_date, nominated_mwh, forecast_mwh, actual_mwh, variance_mwh, status
    FROM ona_nominations WHERE site_id = ? ORDER BY nomination_date DESC LIMIT 48
  `).bind(siteId).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ---------------- Forecasts + AI ----------------

ona.get('/forecast/:siteId', async (c) => {
  const siteId = c.req.param('siteId');
  const forecasts = await c.env.DB.prepare(`
    SELECT * FROM ona_forecasts WHERE site_id = ? ORDER BY forecast_date DESC LIMIT 48
  `).bind(siteId).all();
  return c.json({ success: true, data: forecasts.results || [] });
});

// POST /api/ona/forecast/:siteId/explain — AI-driven generation forecast
// narrative that takes the last N days of actuals + nominations and produces
// a next-7-day outlook, P50/P90 spread and drivers (weather, curtailment, DR).
ona.post('/forecast/:siteId/explain', async (c) => {
  const user = getCurrentUser(c);
  const siteId = c.req.param('siteId');
  const site = await c.env.DB.prepare(
    `SELECT os.*, p.technology FROM ona_sites os LEFT JOIN ipp_projects p ON p.id = os.project_id WHERE os.id = ?`
  ).bind(siteId).first();
  if (!site) return c.json({ success: false, error: 'site_not_found' }, 404);

  const [recentForecasts, recentNominations] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM ona_forecasts WHERE site_id = ? ORDER BY forecast_date DESC LIMIT 14`
    ).bind(siteId).all(),
    c.env.DB.prepare(
      `SELECT * FROM ona_nominations WHERE site_id = ? ORDER BY nomination_date DESC LIMIT 14`
    ).bind(siteId).all(),
  ]);

  const result = await ask(c.env, {
    intent: 'ona.generation_forecast',
    role: user.role,
    prompt: `Produce a 7-day generation forecast narrative for this
${(site as Record<string, unknown>).technology || 'renewable'} asset.
Highlight P50 vs P90 expectation, key drivers (irradiance/wind/curtailment),
and a single-line recommendation for the dispatcher.`,
    context: { site, recentForecasts: recentForecasts.results, recentNominations: recentNominations.results },
    max_tokens: 700,
  });
  return c.json({ success: true, data: result });
});

// ---------------- Faults + AI triage ----------------

ona.get('/faults/:siteId', async (c) => {
  const siteId = c.req.param('siteId');
  const faults = await c.env.DB.prepare(
    `SELECT * FROM ona_faults WHERE site_id = ? ORDER BY start_time DESC LIMIT 100`
  ).bind(siteId).all();
  return c.json({ success: true, data: faults.results || [] });
});

ona.get('/faults', async (c) => {
  const user = getCurrentUser(c);
  const scope = await scopedSiteClause(c.env, user);
  const status = c.req.query('status') || 'open';
  const faults = await c.env.DB.prepare(`
    SELECT f.*, os.site_name, os.project_id
    FROM ona_faults f JOIN ona_sites os ON f.site_id = os.id
    WHERE f.status = ? AND ${scope.where}
    ORDER BY f.severity DESC, f.start_time DESC LIMIT 100
  `).bind(status, ...scope.params).all();
  return c.json({ success: true, data: faults.results || [] });
});

ona.post('/faults/:id/triage', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const fault = await c.env.DB.prepare(
    `SELECT f.*, os.site_name, p.technology, p.capacity_mw
     FROM ona_faults f JOIN ona_sites os ON f.site_id = os.id
     LEFT JOIN ipp_projects p ON p.id = os.project_id WHERE f.id = ?`
  ).bind(id).first();
  if (!fault) return c.json({ success: false, error: 'fault_not_found' }, 404);

  const result = await ask(c.env, {
    intent: 'ona.fault_diagnosis',
    role: user.role,
    prompt: `Diagnose this fault. Return structured markdown with sections
LIKELY_ROOT_CAUSE, SAFETY_IMPACT, RECOMMENDED_ACTION and ESTIMATED_MTTR.`,
    context: { fault },
    max_tokens: 600,
  });

  await c.env.DB.prepare(
    `UPDATE ona_faults SET resolution = ?, status = CASE WHEN status = 'open' THEN 'investigating' ELSE status END, updated_at = datetime('now') WHERE id = ?`,
  ).bind((result.text || '').slice(0, 4000), id).run();

  await fireCascade({
    event: 'ona.fault_triaged',
    actor_id: user.id,
    entity_type: 'ona_faults',
    entity_id: id,
    data: { severity: (fault as Record<string, unknown>).severity },
    env: c.env,
  });

  return c.json({ success: true, data: result });
});

ona.post('/faults/:id/resolve', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as { note?: string }));
  await c.env.DB.prepare(
    `UPDATE ona_faults SET status = 'resolved', end_time = datetime('now'), resolution = COALESCE(?, resolution), updated_at = datetime('now') WHERE id = ?`,
  ).bind(body.note || null, id).run();
  await fireCascade({
    event: 'ona.fault_resolved',
    actor_id: user.id,
    entity_type: 'ona_faults',
    entity_id: id,
    data: {},
    env: c.env,
  });
  return c.json({ success: true });
});

// ---------------- Maintenance / work orders ----------------

ona.get('/maintenance', async (c) => {
  const user = getCurrentUser(c);
  const scope = await scopedSiteClause(c.env, user);
  const rows = await c.env.DB.prepare(`
    SELECT m.*, os.site_name, os.project_id
    FROM ona_maintenance m JOIN ona_sites os ON m.site_id = os.id
    WHERE ${scope.where}
    ORDER BY m.start_time DESC LIMIT 200
  `).bind(...scope.params).all();
  return c.json({ success: true, data: rows.results || [] });
});

ona.post('/maintenance', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as {
    site_id?: string;
    maintenance_type?: string;
    start_time?: string;
    end_time?: string;
    description?: string;
    generation_impact_mwh?: number;
  }));
  if (!body.site_id || !body.maintenance_type || !body.start_time) {
    return c.json({ success: false, error: 'site_id, maintenance_type and start_time are required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO ona_maintenance (id, site_id, maintenance_type, start_time, end_time, generation_impact_mwh, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')
  `).bind(
    id, body.site_id, body.maintenance_type, body.start_time, body.end_time || null,
    body.generation_impact_mwh || null, body.description || null,
  ).run();
  await fireCascade({
    event: 'ona.maintenance_scheduled',
    actor_id: user.id,
    entity_type: 'ona_maintenance',
    entity_id: id,
    data: { site_id: body.site_id, maintenance_type: body.maintenance_type },
    env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

ona.post('/maintenance/:id/status', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as { status?: string }));
  const valid = ['scheduled', 'in_progress', 'completed', 'cancelled'];
  if (!body.status || !valid.includes(body.status)) {
    return c.json({ success: false, error: 'invalid_status' }, 400);
  }
  await c.env.DB.prepare(`UPDATE ona_maintenance SET status = ? WHERE id = ?`).bind(body.status, id).run();
  await fireCascade({
    event: 'ona.maintenance_updated',
    actor_id: user.id,
    entity_type: 'ona_maintenance',
    entity_id: id,
    data: { status: body.status },
    env: c.env,
  });
  return c.json({ success: true });
});

// ---------------- Performance analytics ----------------

ona.get('/analytics/:siteId', async (c) => {
  const siteId = c.req.param('siteId');
  const days = Number(c.req.query('days') || 30);
  const [noms, faults, maint] = await Promise.all([
    c.env.DB.prepare(
      `SELECT nomination_date, nominated_mwh, forecast_mwh, actual_mwh, variance_mwh
       FROM ona_nominations WHERE site_id = ? AND nomination_date >= date('now','-${days} day')
       ORDER BY nomination_date ASC`,
    ).bind(siteId).all(),
    c.env.DB.prepare(
      `SELECT severity, COUNT(*) AS c, SUM(generation_lost_mwh) AS lost_mwh, SUM(estimated_revenue_impact) AS rev_lost
       FROM ona_faults WHERE site_id = ? AND start_time >= date('now','-${days} day') GROUP BY severity`,
    ).bind(siteId).all(),
    c.env.DB.prepare(
      `SELECT maintenance_type, COUNT(*) AS c, SUM(duration_hours) AS hrs, SUM(generation_impact_mwh) AS mwh
       FROM ona_maintenance WHERE site_id = ? AND start_time >= date('now','-${days} day') GROUP BY maintenance_type`,
    ).bind(siteId).all(),
  ]);
  return c.json({
    success: true,
    data: {
      days,
      nominations: noms.results || [],
      faults_by_severity: faults.results || [],
      maintenance_by_type: maint.results || [],
    },
  });
});

// ---------------- AI insights (portfolio-wide) ----------------

ona.get('/insights', async (c) => {
  const user = getCurrentUser(c);
  const scope = await scopedSiteClause(c.env, user);
  const [sites, faults, maint, noms] = await Promise.all([
    c.env.DB.prepare(`
      SELECT os.id, os.site_name, os.capacity_mw, os.status, p.technology
      FROM ona_sites os LEFT JOIN ipp_projects p ON p.id = os.project_id
      WHERE ${scope.where} LIMIT 50
    `).bind(...scope.params).all(),
    c.env.DB.prepare(`
      SELECT f.severity, f.fault_code, f.generation_lost_mwh, f.estimated_revenue_impact, os.site_name
      FROM ona_faults f JOIN ona_sites os ON f.site_id = os.id
      WHERE f.status != 'resolved' AND ${scope.where}
      ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END
      LIMIT 30
    `).bind(...scope.params).all(),
    c.env.DB.prepare(`
      SELECT m.maintenance_type, m.status, m.start_time, os.site_name
      FROM ona_maintenance m JOIN ona_sites os ON m.site_id = os.id
      WHERE m.status IN ('scheduled','in_progress') AND ${scope.where}
      ORDER BY m.start_time ASC LIMIT 30
    `).bind(...scope.params).all(),
    c.env.DB.prepare(`
      SELECT AVG(n.variance_mwh) AS avg_var, COUNT(*) AS c
      FROM ona_nominations n JOIN ona_sites os ON n.site_id = os.id
      WHERE n.nomination_date >= date('now','-30 day') AND ${scope.where}
    `).bind(...scope.params).first(),
  ]);
  const ctx = {
    sites: sites.results || [],
    open_faults: faults.results || [],
    upcoming_maintenance: maint.results || [],
    nomination_variance_30d: noms,
  };
  const narrative = await ask(c.env, {
    intent: 'ona.fault_diagnosis',
    role: user.role,
    prompt: `Produce an O&M control-room brief. Sections: FLEET_STATUS,
TOP_RISKS (3), RECOMMENDED_INTERVENTIONS (3), GENERATION_OUTLOOK_NEXT_7D.
Keep it tight and actionable for an asset manager.`,
    context: ctx,
    max_tokens: 900,
  });
  return c.json({ success: true, data: { kpis: ctx, narrative } });
});

// ---------------- IPP Simulate-project + batch LOI outreach ----------------

ona.post('/simulate', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    project_name?: string;
    technology?: string;
    capacity_mw?: number;
    capex_zar?: number;
    site_description?: string;
    target_offtake_mwh_per_year?: number;
    horizon_years?: number;
  };
  if (!body.project_name || !body.technology || !body.capacity_mw) {
    return c.json({ success: false, error: 'project_name, technology, capacity_mw required' }, 400);
  }
  const result = await ask(c.env, {
    intent: 'ipp.project_simulation',
    role: user.role,
    prompt: `Simulate this proposed IPP in the South African grid. Return
structured markdown with sections ASSUMPTIONS, P50_GENERATION_GWH, LCOE_ZAR_KWH,
CARBON_YIELD_TCO2E, CASHFLOW_SNAPSHOT (Y1, Y5, Y${body.horizon_years ?? 20}),
KEY_RISKS and OFFTAKE_MATCHING_HINT.`,
    context: body,
    max_tokens: 900,
  });
  return c.json({ success: true, data: result });
});

ona.post('/projects/:projectId/outreach', async (c) => {
  const user = getCurrentUser(c);
  const projectId = c.req.param('projectId');
  const body = (await c.req.json().catch(() => ({}))) as {
    offtaker_ids?: string[];
    mwh_per_year?: number;
    blended_price?: number;
    horizon_years?: number;
    notes?: string;
  };
  const project = await c.env.DB.prepare(
    `SELECT id, project_name, technology, capacity_mw, developer_id FROM ipp_projects WHERE id = ?`,
  ).bind(projectId).first();
  if (!project) return c.json({ success: false, error: 'project_not_found' }, 404);
  if ((project as Record<string, unknown>).developer_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }

  // Resolve targets. Tenant isolation: non-admins may only reach offtakers in
  // their own tenant (admins may address the full platform).
  let targets: Array<{ id: string; name: string; email: string }> = [];
  const admin = isAdmin(c);
  const callerTenant = getTenantId(c);
  if (body.offtaker_ids && body.offtaker_ids.length > 0) {
    const placeholders = body.offtaker_ids.map(() => '?').join(',');
    const sql = admin
      ? `SELECT id, name, email FROM participants WHERE role = 'offtaker' AND id IN (${placeholders})`
      : `SELECT id, name, email FROM participants WHERE role = 'offtaker' AND id IN (${placeholders}) AND COALESCE(NULLIF(tenant_id, ''), 'default') = ?`;
    const binds = admin ? body.offtaker_ids : [...body.offtaker_ids, callerTenant];
    const r = await c.env.DB.prepare(sql).bind(...binds).all();
    targets = (r.results || []) as typeof targets;
  } else {
    const r = admin
      ? await c.env.DB.prepare(`SELECT id, name, email FROM participants WHERE role = 'offtaker' LIMIT 25`).all()
      : await c.env.DB.prepare(
          `SELECT id, name, email FROM participants WHERE role = 'offtaker' AND COALESCE(NULLIF(tenant_id, ''), 'default') = ? LIMIT 25`
        ).bind(callerTenant).all();
    targets = (r.results || []) as typeof targets;
  }

  // Ensure loi_drafts table (same shape as /api/ai)
  await c.env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS loi_drafts (
      id TEXT PRIMARY KEY,
      from_participant_id TEXT NOT NULL,
      to_participant_id TEXT NOT NULL,
      project_id TEXT,
      mix_json TEXT,
      body_md TEXT,
      status TEXT DEFAULT 'drafted',
      horizon_years INTEGER,
      annual_mwh REAL,
      blended_price REAL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  const drafts = [];
  for (const t of targets) {
    const result = await ask(c.env, {
      intent: 'ipp.loi_outreach',
      role: user.role,
      prompt: `Draft a warm outbound LOI from ${user.name} (IPP) to
${t.name || 'the offtaker'} offering ${body.mwh_per_year ?? 0} MWh/year
from ${(project as Record<string, unknown>).project_name}. Include tariff,
tenor, COD and one credible sustainability hook.`,
      context: { project, target: t, item: { mwh_per_year: body.mwh_per_year, blended_price: body.blended_price } },
      max_tokens: 700,
    });
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO loi_drafts (id, from_participant_id, to_participant_id, project_id, mix_json, body_md, status, horizon_years, annual_mwh, blended_price)
      VALUES (?, ?, ?, ?, ?, ?, 'drafted', ?, ?, ?)
    `).bind(
      id, user.id, t.id, projectId,
      JSON.stringify({ mwh_per_year: body.mwh_per_year, blended_price: body.blended_price }),
      result.text, body.horizon_years ?? 15, body.mwh_per_year ?? 0, body.blended_price ?? 0,
    ).run();

    await fireCascade({
      event: 'contract.created',
      actor_id: user.id,
      entity_type: 'loi_drafts',
      entity_id: id,
      data: {
        contract_type: 'LOI',
        project_id: projectId,
        project_name: (project as Record<string, unknown>).project_name,
        counterparty_id: t.id,
        creator_id: user.id,
        annual_mwh: body.mwh_per_year,
        blended_price: body.blended_price,
        horizon_years: body.horizon_years ?? 15,
      },
      env: c.env,
    });

    // Best-effort insert into action_queue so the offtaker sees it on their cockpit
    await safe(async () => {
      await c.env.DB.prepare(`
        INSERT INTO action_queue (id, type, priority, actor_id, assignee_id, entity_type, entity_id, title, description, status)
        VALUES (?, 'loi_review', 'high', ?, ?, 'loi_drafts', ?, ?, ?, 'pending')
      `).bind(
        crypto.randomUUID(), user.id, t.id, id,
        `LOI from ${user.name}`,
        `${(project as Record<string, unknown>).project_name} — ${body.mwh_per_year ?? 0} MWh/yr at ${body.blended_price ?? 0} ZAR/MWh`,
      ).run();
    }, undefined);

    drafts.push({ loi_id: id, offtaker_id: t.id, offtaker_name: t.name, body_md: result.text, fallback: result.fallback });
  }
  return c.json({ success: true, data: { drafts } });
});

// ════════════════════════════════════════════════════════════════════════
// ASOBA Cloud (Ona) live proxy routes
//
// These pass through to the ASOBA Cloud REST API (telemetry + OODA alerts)
// using ASOBA_API_KEY held as a Worker secret. All routes are scoped to
// sites the caller can see in `ona_sites` so the API key is never exposed
// to the browser and arbitrary site_ids can't be queried.
// ════════════════════════════════════════════════════════════════════════

/**
 * Resolve the ASOBA `site_id` for one of our internal site rows. Returns the
 * row if the caller can see it; null if not found or not authorised.
 */
async function resolveAsobaSite(
  env: HonoEnv['Bindings'],
  user: { id: string; role: string },
  siteId: string,
): Promise<{ id: string; ona_site_id: string | null; site_name: string; project_id: string | null } | null> {
  const scope = await scopedSiteClause(env, user);
  const row = await env.DB.prepare(`
    SELECT os.id, os.ona_site_id, os.site_name, os.project_id
    FROM ona_sites os WHERE os.id = ? AND ${scope.where}
  `).bind(siteId, ...scope.params).first();
  return (row as { id: string; ona_site_id: string | null; site_name: string; project_id: string | null } | null) || null;
}

// GET /api/ona/asoba/status — quick "is the integration configured?" probe
ona.get('/asoba/status', (c) => {
  return c.json({
    success: true,
    data: {
      configured: asoba.isAsobaConfigured(c.env),
      telemetry_base: c.env.ASOBA_TELEMETRY_BASE || null,
      ooda_base: c.env.ASOBA_OODA_BASE || null,
    },
  });
});

// GET /api/ona/asoba/sites/:siteId/data-period — earliest/latest record window
// Combines telemetry + OODA bounds so the UI knows what timeframe to query.
ona.get('/asoba/sites/:siteId/data-period', async (c) => {
  const user = getCurrentUser(c);
  const site = await resolveAsobaSite(c.env, user, c.req.param('siteId'));
  if (!site || !site.ona_site_id) return c.json({ success: false, error: 'site_not_linked' }, 404);
  try {
    const [telemetry, ooda] = await Promise.all([
      asoba.telemetryDataPeriod(c.env, { site_id: site.ona_site_id }).catch(() => null),
      asoba.oodaDataPeriod(c.env, { site_id: site.ona_site_id }).catch(() => null),
    ]);
    return c.json({ success: true, data: { telemetry, ooda } });
  } catch (err) {
    const e = err as asoba.AsobaError;
    return c.json({ success: false, error: e.message || 'asoba_error', detail: e.body }, (e.status || 502) as any);
  }
});

// GET /api/ona/asoba/sites/:siteId/telemetry — site-aggregated telemetry.
// Query: start, end (ISO 8601), resolution=5min|daily, limit<=1000, aggregate=1
// When aggregate=1 the response also includes a flat power/kWh time series
// summed across inverters (handy for the headline chart).
ona.get('/asoba/sites/:siteId/telemetry', async (c) => {
  const user = getCurrentUser(c);
  const site = await resolveAsobaSite(c.env, user, c.req.param('siteId'));
  if (!site || !site.ona_site_id) return c.json({ success: false, error: 'site_not_linked' }, 404);

  const start = c.req.query('start');
  const end = c.req.query('end');
  if (!start || !end) return c.json({ success: false, error: 'start_and_end_required' }, 400);

  const resolution = (c.req.query('resolution') as asoba.Resolution5Min) || '5min';
  const limit = Math.min(Number(c.req.query('limit') || 1000), 1000);

  try {
    const data = await asoba.siteTelemetry(c.env, {
      site_id: site.ona_site_id,
      start, end, resolution, limit,
    });
    const aggregate = c.req.query('aggregate') === '1';
    return c.json({
      success: true,
      data: aggregate ? { ...data, aggregate: asoba.aggregateSitePower(data.records) } : data,
    });
  } catch (err) {
    const e = err as asoba.AsobaError;
    return c.json({ success: false, error: e.message || 'asoba_error', detail: e.body }, (e.status || 502) as any);
  }
});

// GET /api/ona/asoba/sites/:siteId/inverter/:assetId/telemetry — single-inverter detail.
ona.get('/asoba/sites/:siteId/inverter/:assetId/telemetry', async (c) => {
  const user = getCurrentUser(c);
  const site = await resolveAsobaSite(c.env, user, c.req.param('siteId'));
  if (!site || !site.ona_site_id) return c.json({ success: false, error: 'site_not_linked' }, 404);

  const assetId = c.req.param('assetId');
  const start = c.req.query('start');
  const end = c.req.query('end');
  if (!start || !end) return c.json({ success: false, error: 'start_and_end_required' }, 400);
  const resolution = (c.req.query('resolution') as asoba.Resolution5Min) || '5min';
  const limit = Math.min(Number(c.req.query('limit') || 1000), 1000);
  const cursor = c.req.query('cursor') || undefined;

  try {
    const data = await asoba.inverterTelemetry(c.env, {
      site_id: site.ona_site_id, asset_id: assetId,
      start, end, resolution, limit, cursor,
    });
    return c.json({ success: true, data });
  } catch (err) {
    const e = err as asoba.AsobaError;
    return c.json({ success: false, error: e.message || 'asoba_error', detail: e.body }, (e.status || 502) as any);
  }
});

// GET /api/ona/asoba/sites/:siteId/alerts — site-wide OODA fault feed.
ona.get('/asoba/sites/:siteId/alerts', async (c) => {
  const user = getCurrentUser(c);
  const site = await resolveAsobaSite(c.env, user, c.req.param('siteId'));
  if (!site || !site.ona_site_id) return c.json({ success: false, error: 'site_not_linked' }, 404);

  const start = c.req.query('start');
  const end = c.req.query('end');
  if (!start || !end) return c.json({ success: false, error: 'start_and_end_required' }, 400);
  const resolution = (c.req.query('resolution') as asoba.ResolutionOoda) || 'minute';
  const limit = Math.min(Number(c.req.query('limit') || 1000), 1000);

  try {
    const data = await asoba.siteAlerts(c.env, {
      site_id: site.ona_site_id, start, end, resolution, limit,
    });
    // Flatten for UI tables
    const flat = Object.entries(data.alerts || {}).flatMap(([deviceId, list]) =>
      (list as Array<Record<string, unknown>>).map((a) => ({ ...a, terminal_device_id: deviceId }))
    );
    return c.json({ success: true, data: { ...data, flat } });
  } catch (err) {
    const e = err as asoba.AsobaError;
    return c.json({ success: false, error: e.message || 'asoba_error', detail: e.body }, (e.status || 502) as any);
  }
});

// GET /api/ona/asoba/sites/:siteId/alerts/:terminalId — single-device drilldown.
ona.get('/asoba/sites/:siteId/alerts/:terminalId', async (c) => {
  const user = getCurrentUser(c);
  const site = await resolveAsobaSite(c.env, user, c.req.param('siteId'));
  if (!site || !site.ona_site_id) return c.json({ success: false, error: 'site_not_linked' }, 404);

  const terminalId = c.req.param('terminalId');
  const start = c.req.query('start');
  const end = c.req.query('end');
  if (!start || !end) return c.json({ success: false, error: 'start_and_end_required' }, 400);
  const resolution = (c.req.query('resolution') as asoba.ResolutionOoda) || 'minute';
  const limit = Math.min(Number(c.req.query('limit') || 1000), 1000);
  const cursor = c.req.query('cursor') || undefined;

  try {
    const data = await asoba.terminalAlerts(c.env, {
      site_id: site.ona_site_id, terminal_device_id: terminalId,
      start, end, resolution, limit, cursor,
    });
    return c.json({ success: true, data });
  } catch (err) {
    const e = err as asoba.AsobaError;
    return c.json({ success: false, error: e.message || 'asoba_error', detail: e.body }, (e.status || 502) as any);
  }
});

// POST /api/ona/asoba/sites/:siteId/sync — pull latest telemetry + OODA alerts
// from ASOBA into our local tables so role dashboards (lender NAV impact,
// trader generation outlook, regulator forensics) can read from D1 without
// each one fanning out to ASOBA. Idempotent — uses (site_id, timestamp) UPSERT.
ona.post('/asoba/sites/:siteId/sync', async (c) => {
  const user = getCurrentUser(c);
  const site = await resolveAsobaSite(c.env, user, c.req.param('siteId'));
  if (!site || !site.ona_site_id) return c.json({ success: false, error: 'site_not_linked' }, 404);

  // 24h window of 5-min telemetry + minute-grain alerts. Caller can override.
  const body = await c.req.json().catch(() => ({} as { hours?: number }));
  const hours = Math.min(Math.max(Number(body.hours || 24), 1), 24 * 31); // cap at API's 31-day limit
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3_600_000);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  let telemetryCount = 0;
  let alertCount = 0;

  try {
    const telemetry = await asoba.siteTelemetry(c.env, {
      site_id: site.ona_site_id, start: startIso, end: endIso,
      resolution: '5min', limit: 1000,
    });
    const flat = Object.entries(telemetry.records || {}).flatMap(([assetId, list]) =>
      (list as Array<Record<string, unknown>>).map((r) => ({
        asset_id: assetId,
        timestamp: r.timestamp as string,
        power: Number(r.power || 0),
        kwh: Number(r.kWh || 0),
        run_state: (r.run_state || r.inverter_state || null) as string | null,
        error_code: (r.error_code || null) as string | null,
      }))
    );
    if (flat.length > 0) {
      await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ona_asoba_telemetry (
        site_id TEXT NOT NULL, asset_id TEXT NOT NULL, timestamp TEXT NOT NULL,
        power REAL, kwh REAL, run_state TEXT, error_code TEXT,
        synced_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (site_id, asset_id, timestamp)
      )`).run();
      const stmt = c.env.DB.prepare(`
        INSERT OR REPLACE INTO ona_asoba_telemetry (site_id, asset_id, timestamp, power, kwh, run_state, error_code)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const batch = flat.map((r) => stmt.bind(site.id, r.asset_id, r.timestamp, r.power, r.kwh, r.run_state, r.error_code));
      // D1 batches max ~50 statements per transaction; chunk if needed.
      for (let i = 0; i < batch.length; i += 50) {
        await c.env.DB.batch(batch.slice(i, i + 50));
      }
      telemetryCount = flat.length;
    }

    const alerts = await asoba.siteAlerts(c.env, {
      site_id: site.ona_site_id, start: startIso, end: endIso,
      resolution: 'minute', limit: 1000,
    });
    const flatAlerts = Object.entries(alerts.alerts || {}).flatMap(([deviceId, list]) =>
      (list as Array<Record<string, unknown>>).map((a) => ({
        terminal_device_id: deviceId,
        timestamp: a.timestamp as string,
        severity: (a.severity || 'medium') as string,
        alert_type: (a.alert_type || a.fault_type || null) as string | null,
        description: (a.description || a.message || null) as string | null,
      }))
    );
    if (flatAlerts.length > 0) {
      await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ona_asoba_alerts (
        site_id TEXT NOT NULL, terminal_device_id TEXT NOT NULL, timestamp TEXT NOT NULL,
        severity TEXT, alert_type TEXT, description TEXT,
        synced_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (site_id, terminal_device_id, timestamp)
      )`).run();
      const stmt = c.env.DB.prepare(`
        INSERT OR REPLACE INTO ona_asoba_alerts (site_id, terminal_device_id, timestamp, severity, alert_type, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const batch = flatAlerts.map((a) => stmt.bind(site.id, a.terminal_device_id, a.timestamp, a.severity, a.alert_type, a.description));
      for (let i = 0; i < batch.length; i += 50) {
        await c.env.DB.batch(batch.slice(i, i + 50));
      }
      alertCount = flatAlerts.length;

      // Promote critical/high alerts into ona_faults so they hit the action
      // queue + cascade engine just like manually-logged faults.
      for (const a of flatAlerts.filter((x) => x.severity === 'critical' || x.severity === 'high')) {
        const exists = await c.env.DB.prepare(
          `SELECT id FROM ona_faults WHERE site_id = ? AND fault_code = ? AND start_time = ?`
        ).bind(site.id, `ASOBA_${a.alert_type || 'ALERT'}`, a.timestamp).first();
        if (exists) continue;
        const id = crypto.randomUUID();
        // Try with `source` column first; fall back if migration 033 isn't
        // applied yet so production keeps working without the new column.
        try {
          await c.env.DB.prepare(`
            INSERT INTO ona_faults (id, site_id, fault_code, fault_description, severity, start_time, status, source)
            VALUES (?, ?, ?, ?, ?, ?, 'open', 'asoba')
          `).bind(id, site.id, `ASOBA_${a.alert_type || 'ALERT'}`, a.description || 'ASOBA OODA alert', a.severity, a.timestamp).run();
        } catch {
          await c.env.DB.prepare(`
            INSERT INTO ona_faults (id, site_id, fault_code, fault_description, severity, start_time, status)
            VALUES (?, ?, ?, ?, ?, ?, 'open')
          `).bind(id, site.id, `ASOBA_${a.alert_type || 'ALERT'}`, a.description || 'ASOBA OODA alert', a.severity, a.timestamp).run().catch(() => {});
        }
        await fireCascade({
          event: 'ona.fault_detected',
          actor_id: user.id,
          entity_type: 'ona_faults',
          entity_id: id,
          data: { source: 'asoba', severity: a.severity, terminal_device_id: a.terminal_device_id },
          env: c.env,
        });
      }
    }

    await c.env.DB.prepare(`UPDATE ona_sites SET last_sync_at = datetime('now') WHERE id = ?`).bind(site.id).run();

    return c.json({ success: true, data: { telemetry_records: telemetryCount, alerts: alertCount, window: { start: startIso, end: endIso } } });
  } catch (err) {
    const e = err as asoba.AsobaError;
    return c.json({ success: false, error: e.message || 'asoba_error', detail: e.body }, (e.status || 502) as any);
  }
});

// ---------------- Legacy link endpoints (kept for back-compat) ----------------

ona.post('/link', async (c) => {
  const { ona_tenant_id, project_id } = await c.req.json().catch(() => ({} as { ona_tenant_id?: string; project_id?: string }));
  if (!ona_tenant_id || !project_id) return c.json({ success: false, error: 'ona_tenant_id and project_id required' }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO ona_sites (id, project_id, site_name, ona_site_id, status)
    VALUES (?, ?, ?, ?, 'active')
  `).bind(id, project_id, `Ona Site ${id.slice(0, 8)}`, ona_tenant_id).run();
  return c.json({ success: true, data: { id } }, 201);
});

ona.get('/:projectId/sites', async (c) => {
  const projectId = c.req.param('projectId');
  const rows = await c.env.DB.prepare(`SELECT * FROM ona_sites WHERE project_id = ?`).bind(projectId).all();
  return c.json({ success: true, data: rows.results || [] });
});

export default ona;
