// ONA Integration + O&M routes
// All asset telemetry / forecast / fault / maintenance / work-order endpoints
// surfaced through the dedicated O&M cockpit section live under /api/ona.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { ask } from '../utils/ai';
import { getTenantId, isAdmin } from '../utils/tenant';

const ona = new Hono<HonoEnv>();

ona.use('*', authMiddleware);

// ---------------- helpers ----------------

async function scopedSiteClause(env: HonoEnv['Bindings'], user: { id: string; role: string }) {
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
