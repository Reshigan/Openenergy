// ESG Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const esg = new Hono<HonoEnv>();
esg.use('*', authMiddleware);

// GET /esg/metrics - List ESG metrics
esg.get('/metrics', async (c) => {
  const metrics = await c.env.DB.prepare('SELECT * FROM esg_metrics ORDER BY category, metric_name').all();
  return c.json({ success: true, data: metrics.results || [] });
});

// GET /esg/data - Get user's ESG data
esg.get('/data', async (c) => {
  const user = getCurrentUser(c);
  const data = await c.env.DB.prepare(`
    SELECT ed.*, em.metric_name, em.category, em.unit 
    FROM esg_data ed 
    JOIN esg_metrics em ON ed.metric_id = em.id 
    WHERE ed.participant_id = ? 
    ORDER BY ed.reporting_period DESC
  `).bind(user.id).all();
  return c.json({ success: true, data: data.results || [] });
});

// POST /esg/data - Add ESG data (legacy endpoint; new code uses /esg/transactions)
esg.post('/data', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { metric_id, reporting_period, value, quality_evidence } = body as { metric_id?: string; reporting_period?: string; value?: number; quality_evidence?: string };
  if (!metric_id || !reporting_period || value === undefined) {
    return c.json({ success: false, error: 'metric_id, reporting_period and value are required' }, 400);
  }
  const id = 'esgd_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO esg_data (id, participant_id, metric_id, reporting_period, value, quality_evidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, metric_id, reporting_period, value, quality_evidence ?? null, new Date().toISOString()).run();
  return c.json({ success: true, data: { id } }, 201);
});

// GET /esg/score - Get ESG score
esg.get('/score', async (c) => {
  const user = getCurrentUser(c);
  const scores = await c.env.DB.prepare(`
    SELECT * FROM esg_data 
    WHERE participant_id = ? AND metric_id LIKE 'esg_met_%' 
    ORDER BY reporting_period DESC LIMIT 12
  `).bind(user.id).all();
  
  // Calculate aggregate score
  const totalEmissions = (scores.results || []).reduce((sum: number, s: any) => sum + (s.value || 0), 0);
  const score = Math.max(0, Math.min(100, 100 - (totalEmissions / 100)));
  
  return c.json({ success: true, data: { score: Math.round(score), totalEmissions, periods: scores.results?.length || 0 } });
});

// GET /esg/reports - List reports
esg.get('/reports', async (c) => {
  const user = getCurrentUser(c);
  const reports = await c.env.DB.prepare('SELECT * FROM esg_reports WHERE participant_id = ? ORDER BY created_at DESC').bind(user.id).all();
  return c.json({ success: true, data: reports.results || [] });
});

// POST /esg/reports - Create report (legacy; new code uses /esg/disclosures)
esg.post('/reports', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { report_type, reporting_period } = body as { report_type?: string; reporting_period?: string };
  if (!report_type || !reporting_period) {
    return c.json({ success: false, error: 'report_type and reporting_period are required' }, 400);
  }
  const id = 'esgr_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO esg_reports (id, participant_id, report_type, reporting_period, status, created_at)
    VALUES (?, ?, ?, ?, 'draft', ?)
  `).bind(id, user.id, report_type, reporting_period, new Date().toISOString()).run();
  await fireCascade({ event: 'esg.report_published', actor_id: user.id, entity_type: 'esg_reports', entity_id: id, data: { report_type, reporting_period }, env: c.env });
  return c.json({ success: true, data: { id } }, 201);
});

// GET /esg/decarbonisation - Get decarbonisation actions
// Falls back to the v2 `esg_decarbonisation_pathways` table when the legacy
// `decarb_actions` table doesn't exist on this schema variant.
esg.get('/decarbonisation', async (c) => {
  const user = getCurrentUser(c);
  try {
    const actions = await c.env.DB.prepare('SELECT * FROM decarb_actions WHERE participant_id = ? ORDER BY created_at DESC').bind(user.id).all();
    return c.json({ success: true, data: actions.results || [] });
  } catch {
    const actions = await c.env.DB.prepare('SELECT * FROM esg_decarbonisation_pathways WHERE participant_id = ? ORDER BY created_at DESC').bind(user.id).all().catch(() => ({ results: [] as unknown[] }));
    return c.json({ success: true, data: actions.results || [] });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Watershed-grade ESG transaction ledger
//
// All endpoints below run against the v2 schema introduced in migration
// 038. The original GET /esg/metrics, /data, /score, /reports endpoints
// remain wired so existing UI code keeps working — these add the deep
// per-transaction surface alongside.
// ════════════════════════════════════════════════════════════════════════

function uid(p: string) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

/** Resolve the best emission factor for an activity + region at a date. */
async function pickFactor(
  env: HonoEnv['Bindings'],
  activity_code: string,
  region: string | null,
  on_date: string,
): Promise<{ id: string; factor: number } | null> {
  // Exact region first; fall back to global.
  const sql = `
    SELECT id, factor FROM esg_emission_factors
    WHERE activity_code = ?
      AND (region = ? OR region = 'GLB' OR region IS NULL)
      AND date(valid_from) <= date(?)
      AND (valid_to IS NULL OR date(valid_to) >= date(?))
    ORDER BY (region = ?) DESC, date(valid_from) DESC LIMIT 1`;
  const row = await env.DB.prepare(sql)
    .bind(activity_code, region || 'GLB', on_date, on_date, region || 'GLB')
    .first() as { id: string; factor: number } | null;
  return row;
}

// ─── Emission factors catalog ─────────────────────────────────────────────
esg.get('/factors', async (c) => {
  const scope = c.req.query('scope');
  const search = c.req.query('q');
  const region = c.req.query('region');
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (scope) { filters.push('scope = ?'); binds.push(Number(scope)); }
  if (region) { filters.push('(region = ? OR region = \'GLB\')'); binds.push(region); }
  if (search) {
    filters.push('(activity_code LIKE ? OR activity_name LIKE ?)');
    binds.push(`%${search}%`, `%${search}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(
    `SELECT * FROM esg_emission_factors ${where} ORDER BY scope, activity_code LIMIT 200`,
  ).bind(...binds).all();
  return c.json({ success: true, data: rows.results || [] });
});

// ─── Activity transactions ────────────────────────────────────────────────
//
// GET /esg/transactions?year=&scope=&category=&q=&from=&to=&participant=
esg.get('/transactions', async (c) => {
  const user = getCurrentUser(c);
  const year = c.req.query('year');
  const scope = c.req.query('scope');
  const category = c.req.query('category');
  const q = c.req.query('q');
  const from = c.req.query('from');
  const to = c.req.query('to');

  const filters: string[] = ['participant_id = ?'];
  const binds: unknown[] = [user.id];
  if (year)     { filters.push('strftime(\'%Y\', activity_date) = ?'); binds.push(year); }
  if (scope)    { filters.push('scope = ?'); binds.push(Number(scope)); }
  if (category) { filters.push('scope3_category = ?'); binds.push(Number(category)); }
  if (q)        { filters.push('(activity_code LIKE ? OR counterparty_name LIKE ? OR notes LIKE ?)'); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (from)     { filters.push('date(activity_date) >= date(?)'); binds.push(from); }
  if (to)       { filters.push('date(activity_date) <= date(?)'); binds.push(to); }

  const rs = await c.env.DB.prepare(
    `SELECT * FROM esg_activity_transactions WHERE ${filters.join(' AND ')}
     ORDER BY activity_date DESC, created_at DESC LIMIT 500`,
  ).bind(...binds).all();
  return c.json({ success: true, data: rs.results || [] });
});

esg.post('/transactions', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as Partial<{
    activity_code: string; scope: number; scope3_category: number | null;
    region: string; facility_id: string; delivery_point_id: string;
    activity_date: string; period_start: string; period_end: string;
    quantity: number; unit: string;
    counterparty_id: string; counterparty_name: string; invoice_id: string;
    factor_id: string; factor_value: number;
    rec_certificate_id: string; scope2_method: 'location' | 'market' | 'both';
    data_source: string; data_quality: string; uncertainty_pct: number;
    evidence_r2_key: string; notes: string; tags: string[];
  }>;

  if (!body.activity_code || !body.scope || body.quantity === undefined || !body.unit || !body.activity_date) {
    return c.json({ success: false, error: 'activity_code, scope, quantity, unit, activity_date required' }, 400);
  }
  if (body.scope === 3 && !body.scope3_category) {
    return c.json({ success: false, error: 'scope3_category required when scope=3' }, 400);
  }

  // Resolve the factor (caller can override, otherwise we look it up)
  let factorId = body.factor_id || null;
  let factorValue = body.factor_value;
  if (!factorId || factorValue === undefined) {
    const f = await pickFactor(c.env, body.activity_code, body.region || null, body.activity_date);
    if (f) { factorId = f.id; factorValue = f.factor; }
  }
  // Compute emissions
  const emissionsKg = factorValue !== undefined ? body.quantity * factorValue : null;

  const id = uid('esgtx');
  await c.env.DB.prepare(`
    INSERT INTO esg_activity_transactions (
      id, participant_id, activity_code, scope, scope3_category,
      region, facility_id, delivery_point_id,
      activity_date, period_start, period_end, quantity, unit,
      counterparty_id, counterparty_name, invoice_id,
      factor_id, factor_value, emissions_kg_co2e,
      rec_certificate_id, scope2_method,
      data_source, data_quality, uncertainty_pct, evidence_r2_key,
      notes, tags, status, created_by
    ) VALUES (?, ?, ?, ?, ?,  ?, ?, ?,  ?, ?, ?, ?, ?,  ?, ?, ?,  ?, ?, ?,
              ?, ?,  ?, ?, ?, ?,  ?, ?, 'final', ?)
  `).bind(
    id, user.id, body.activity_code, body.scope, body.scope3_category ?? null,
    body.region || null, body.facility_id || null, body.delivery_point_id || null,
    body.activity_date, body.period_start || null, body.period_end || null, body.quantity, body.unit,
    body.counterparty_id || null, body.counterparty_name || null, body.invoice_id || null,
    factorId, factorValue ?? null, emissionsKg,
    body.rec_certificate_id || null, body.scope2_method || 'location',
    body.data_source || null, body.data_quality || 'measured', body.uncertainty_pct ?? null, body.evidence_r2_key || null,
    body.notes || null, body.tags ? JSON.stringify(body.tags) : null, user.id,
  ).run();

  await fireCascade({
    event: 'esg.transaction_recorded',
    actor_id: user.id, entity_type: 'esg_activity_transactions', entity_id: id,
    data: { scope: body.scope, scope3_category: body.scope3_category, emissions_kg: emissionsKg },
    env: c.env,
  });
  return c.json({ success: true, data: { id, emissions_kg_co2e: emissionsKg } }, 201);
});

// PUT — restate a prior transaction (creates a new row, marks the old one
// `restated`, keeps the audit trail).
esg.put('/transactions/:id', async (c) => {
  const user = getCurrentUser(c);
  const oldId = c.req.param('id');
  const old = await c.env.DB.prepare(
    `SELECT * FROM esg_activity_transactions WHERE id = ? AND participant_id = ?`,
  ).bind(oldId, user.id).first() as Record<string, unknown> | null;
  if (!old) return c.json({ success: false, error: 'not_found' }, 404);

  const patch = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const merged = { ...old, ...patch, id: undefined, restated_from_id: oldId };
  // Re-compute emissions if quantity or factor changed
  const q = Number(merged.quantity);
  const f = Number(merged.factor_value);
  if (!Number.isNaN(q) && !Number.isNaN(f)) merged.emissions_kg_co2e = q * f;

  const newId = uid('esgtx');
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE esg_activity_transactions SET status = 'restated' WHERE id = ?`).bind(oldId),
    c.env.DB.prepare(`
      INSERT INTO esg_activity_transactions (
        id, participant_id, activity_code, scope, scope3_category,
        region, facility_id, delivery_point_id,
        activity_date, period_start, period_end, quantity, unit,
        counterparty_id, counterparty_name, invoice_id,
        factor_id, factor_value, emissions_kg_co2e,
        rec_certificate_id, scope2_method,
        data_source, data_quality, uncertainty_pct, evidence_r2_key,
        notes, tags, status, restated_from_id, created_by
      ) VALUES (?, ?, ?, ?, ?,  ?, ?, ?,  ?, ?, ?, ?, ?,  ?, ?, ?,  ?, ?, ?,
                ?, ?,  ?, ?, ?, ?,  ?, ?, 'final', ?, ?)
    `).bind(
      newId, user.id, merged.activity_code, merged.scope, merged.scope3_category ?? null,
      merged.region ?? null, merged.facility_id ?? null, merged.delivery_point_id ?? null,
      merged.activity_date, merged.period_start ?? null, merged.period_end ?? null, q, merged.unit,
      merged.counterparty_id ?? null, merged.counterparty_name ?? null, merged.invoice_id ?? null,
      merged.factor_id ?? null, f, merged.emissions_kg_co2e,
      merged.rec_certificate_id ?? null, merged.scope2_method ?? 'location',
      merged.data_source ?? null, merged.data_quality ?? 'measured', merged.uncertainty_pct ?? null, merged.evidence_r2_key ?? null,
      merged.notes ?? null, merged.tags ?? null, oldId, user.id,
    ),
  ]);
  await fireCascade({
    event: 'esg.transaction_restated',
    actor_id: user.id, entity_type: 'esg_activity_transactions', entity_id: newId,
    data: { restated_from_id: oldId }, env: c.env,
  });
  return c.json({ success: true, data: { id: newId, restated_from_id: oldId } }, 201);
});

// ─── Annual rollup ─────────────────────────────────────────────────────
esg.get('/rollup/:year', async (c) => {
  const user = getCurrentUser(c);
  const year = Number(c.req.param('year'));
  let row = await c.env.DB.prepare(
    `SELECT * FROM esg_annual_rollup WHERE participant_id = ? AND reporting_year = ?`,
  ).bind(user.id, year).first();
  if (!row) {
    // Lazy-compute on first hit so the UI always has a number.
    await computeRollup(c.env, user.id, year);
    row = await c.env.DB.prepare(
      `SELECT * FROM esg_annual_rollup WHERE participant_id = ? AND reporting_year = ?`,
    ).bind(user.id, year).first();
  }
  return c.json({ success: true, data: row });
});

esg.post('/rollup/compute', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as { year?: number };
  const year = body.year || new Date().getFullYear();
  await computeRollup(c.env, user.id, year);
  const row = await c.env.DB.prepare(
    `SELECT * FROM esg_annual_rollup WHERE participant_id = ? AND reporting_year = ?`,
  ).bind(user.id, year).first();
  return c.json({ success: true, data: row });
});

async function computeRollup(env: HonoEnv['Bindings'], participantId: string, year: number) {
  const rows = await env.DB.prepare(`
    SELECT scope, scope3_category, scope2_method, emissions_kg_co2e, quantity, unit, activity_code,
           rec_certificate_id, data_quality
      FROM esg_activity_transactions
     WHERE participant_id = ? AND strftime('%Y', activity_date) = ?
       AND status = 'final'
  `).bind(participantId, String(year)).all();
  const list = (rows.results || []) as Array<Record<string, unknown>>;

  let s1 = 0, s2loc = 0, s2mkt = 0, s3 = 0;
  const s3cat: Record<number, number> = {};
  let energyMwh = 0, renewMwh = 0, qualityScore = 0, n = 0;

  for (const r of list) {
    const e = Number(r.emissions_kg_co2e || 0) / 1000; // kg → tCO2e
    const scope = Number(r.scope);
    if (scope === 1) s1 += e;
    if (scope === 2) {
      s2loc += e;
      // Market-based: zero if a fully-matched REC certificate exists.
      if (r.rec_certificate_id) {
        s2mkt += 0;
      } else {
        s2mkt += e;
      }
    }
    if (scope === 3) {
      s3 += e;
      const c3 = Number(r.scope3_category || 0);
      s3cat[c3] = (s3cat[c3] || 0) + e;
    }
    // Energy tally (for renewable %)
    if (String(r.unit) === 'kWh') {
      const mwh = Number(r.quantity || 0) / 1000;
      energyMwh += mwh;
      if (String(r.activity_code).includes('renewable') || r.rec_certificate_id) {
        renewMwh += mwh;
      }
    }
    const q = String(r.data_quality || 'measured');
    qualityScore += q === 'measured' ? 100 : q === 'calculated' ? 80 : q === 'estimated' ? 50 : 30;
    n++;
  }

  const totalLoc = s1 + s2loc + s3;
  const totalMkt = s1 + s2mkt + s3;
  const renewPct = energyMwh > 0 ? (renewMwh / energyMwh) * 100 : 0;
  const dqScore = n > 0 ? qualityScore / n : 0;

  await env.DB.prepare(`
    INSERT INTO esg_annual_rollup
      (participant_id, reporting_year,
       scope1_tco2e, scope2_location_tco2e, scope2_market_tco2e, scope3_tco2e, scope3_by_category,
       total_tco2e_location, total_tco2e_market,
       energy_consumption_mwh, renewable_mwh, renewable_pct,
       data_quality_score, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(participant_id, reporting_year, tenant_id) DO UPDATE SET
      scope1_tco2e = excluded.scope1_tco2e,
      scope2_location_tco2e = excluded.scope2_location_tco2e,
      scope2_market_tco2e = excluded.scope2_market_tco2e,
      scope3_tco2e = excluded.scope3_tco2e,
      scope3_by_category = excluded.scope3_by_category,
      total_tco2e_location = excluded.total_tco2e_location,
      total_tco2e_market = excluded.total_tco2e_market,
      energy_consumption_mwh = excluded.energy_consumption_mwh,
      renewable_mwh = excluded.renewable_mwh,
      renewable_pct = excluded.renewable_pct,
      data_quality_score = excluded.data_quality_score,
      computed_at = excluded.computed_at
  `).bind(
    participantId, year,
    s1, s2loc, s2mkt, s3, JSON.stringify(s3cat),
    totalLoc, totalMkt,
    energyMwh, renewMwh, renewPct,
    dqScore,
  ).run();
}

// ─── Targets ────────────────────────────────────────────────────────────
esg.get('/targets', async (c) => {
  const user = getCurrentUser(c);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM esg_targets WHERE participant_id = ? ORDER BY target_year ASC`,
  ).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
});
esg.post('/targets', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.target_type || !b.base_year || !b.target_year || b.base_value === undefined || b.target_value === undefined) {
    return c.json({ success: false, error: 'target_type, base_year, target_year, base_value, target_value required' }, 400);
  }
  const id = uid('esgt');
  const pct = Number(b.base_value) > 0 ? ((Number(b.base_value) - Number(b.target_value)) / Number(b.base_value)) * 100 : null;
  await c.env.DB.prepare(`
    INSERT INTO esg_targets (id, participant_id, target_type, framework, scopes_covered,
                              base_year, base_value, base_intensity_unit, target_year, target_value,
                              target_pct, validated_by, status, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'committed'), ?)
  `).bind(
    id, user.id, b.target_type, b.framework ?? null, JSON.stringify(b.scopes_covered ?? []),
    b.base_year, b.base_value, b.base_intensity_unit ?? null, b.target_year, b.target_value,
    pct, b.validated_by ?? null, b.status ?? null, b.description ?? null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

// ─── Initiatives ────────────────────────────────────────────────────────
esg.get('/initiatives', async (c) => {
  const user = getCurrentUser(c);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM esg_initiatives WHERE participant_id = ? ORDER BY status, start_date DESC`,
  ).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
});
esg.post('/initiatives', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.name) return c.json({ success: false, error: 'name required' }, 400);
  const id = uid('esgini');
  // MACC = capex / (lifetime * annual_abatement)
  const macc = (b.capex_zar && b.abatement_tco2e_yr && b.lifetime_years)
    ? Number(b.capex_zar) / (Number(b.abatement_tco2e_yr) * Number(b.lifetime_years))
    : null;
  await c.env.DB.prepare(`
    INSERT INTO esg_initiatives (id, participant_id, name, category, scopes_targeted,
                                  abatement_tco2e_yr, capex_zar, opex_zar_yr, lifetime_years,
                                  marginal_abatement_cost_zar_tco2e, start_date, end_date, status, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'planned'), ?)
  `).bind(
    id, user.id, b.name, b.category ?? null, JSON.stringify(b.scopes_targeted ?? []),
    b.abatement_tco2e_yr ?? null, b.capex_zar ?? null, b.opex_zar_yr ?? null, b.lifetime_years ?? null,
    macc, b.start_date ?? null, b.end_date ?? null, b.status ?? null, b.description ?? null,
  ).run();
  return c.json({ success: true, data: { id, marginal_abatement_cost_zar_tco2e: macc } }, 201);
});

// ─── Supplier engagement ────────────────────────────────────────────────
esg.get('/suppliers', async (c) => {
  const user = getCurrentUser(c);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM esg_supplier_engagements WHERE participant_id = ? ORDER BY invited_at DESC`,
  ).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
});
esg.post('/suppliers/invite', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.supplier_name || !b.scope3_category) {
    return c.json({ success: false, error: 'supplier_name + scope3_category required' }, 400);
  }
  const id = uid('esgsup');
  await c.env.DB.prepare(`
    INSERT INTO esg_supplier_engagements (id, participant_id, supplier_id, supplier_name,
                                           scope3_category, survey_type, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'invited', ?)
  `).bind(
    id, user.id, b.supplier_id ?? null, b.supplier_name, b.scope3_category,
    b.survey_type ?? 'custom', b.notes ?? null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});
esg.post('/suppliers/:id/response', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  await c.env.DB.prepare(`
    UPDATE esg_supplier_engagements
       SET status = 'complete',
           response_emissions_kg = ?,
           response_period_start = ?,
           response_period_end = ?,
           data_quality = ?,
           evidence_r2_key = ?,
           responded_at = datetime('now')
     WHERE id = ? AND participant_id = ?
  `).bind(b.response_emissions_kg ?? null, b.response_period_start ?? null, b.response_period_end ?? null,
          b.data_quality ?? 'supplier_declared', b.evidence_r2_key ?? null, id, user.id).run();
  return c.json({ success: true });
});

// ─── REC certificates ──────────────────────────────────────────────────
esg.get('/recs', async (c) => {
  const user = getCurrentUser(c);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM esg_rec_certificates WHERE participant_id = ? ORDER BY vintage_year DESC, vintage_month DESC`,
  ).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
});
esg.post('/recs', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.serial_number || !b.registry || !b.vintage_year || !b.mwh_certified) {
    return c.json({ success: false, error: 'serial_number, registry, vintage_year, mwh_certified required' }, 400);
  }
  const id = uid('rec');
  await c.env.DB.prepare(`
    INSERT INTO esg_rec_certificates (id, participant_id, serial_number, registry, source_project_id,
                                       technology, vintage_year, vintage_month, mwh_certified, mwh_remaining,
                                       issue_date, expiry_date, status, acquisition_cost_zar, acquisition_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).bind(
    id, user.id, b.serial_number, b.registry, b.source_project_id ?? null,
    b.technology ?? null, b.vintage_year, b.vintage_month ?? null, b.mwh_certified, b.mwh_certified,
    b.issue_date ?? null, b.expiry_date ?? null, b.acquisition_cost_zar ?? null, b.acquisition_date ?? null, b.notes ?? null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});
esg.post('/recs/:id/retire', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const mwh = Number(b.mwh_retired || 0);
  if (mwh <= 0) return c.json({ success: false, error: 'mwh_retired required' }, 400);
  const cert = await c.env.DB.prepare(
    `SELECT mwh_remaining FROM esg_rec_certificates WHERE id = ? AND participant_id = ?`,
  ).bind(id, user.id).first() as { mwh_remaining: number } | null;
  if (!cert) return c.json({ success: false, error: 'not_found' }, 404);
  if (mwh > cert.mwh_remaining) return c.json({ success: false, error: 'insufficient_balance' }, 400);
  const remaining = cert.mwh_remaining - mwh;
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE esg_rec_certificates SET mwh_remaining = ?, status = ? WHERE id = ?`)
      .bind(remaining, remaining <= 0 ? 'retired' : 'partially_retired', id),
    c.env.DB.prepare(`
      INSERT INTO esg_rec_retirements (id, certificate_id, participant_id, mwh_retired,
                                        reporting_year, scope2_method, beneficiary, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(uid('recret'), id, user.id, mwh, b.reporting_year ?? new Date().getFullYear(),
            b.scope2_method ?? 'market', b.beneficiary ?? null, b.reason ?? null),
  ]);
  return c.json({ success: true });
});

// ─── Disclosures ────────────────────────────────────────────────────────
esg.get('/disclosures', async (c) => {
  const user = getCurrentUser(c);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM esg_disclosures WHERE participant_id = ? ORDER BY reporting_year DESC, framework`,
  ).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
});
esg.post('/disclosures', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.framework || !b.reporting_year) {
    return c.json({ success: false, error: 'framework + reporting_year required' }, 400);
  }
  await computeRollup(c.env, user.id, Number(b.reporting_year));
  const roll = await c.env.DB.prepare(
    `SELECT * FROM esg_annual_rollup WHERE participant_id = ? AND reporting_year = ?`,
  ).bind(user.id, Number(b.reporting_year)).first() as Record<string, unknown> | null;
  const id = uid('esgd');
  await c.env.DB.prepare(`
    INSERT INTO esg_disclosures (id, participant_id, framework, reporting_year, period_start, period_end,
                                  scope1_tco2e, scope2_location_tco2e, scope2_market_tco2e, scope3_tco2e,
                                  intensity_value, intensity_unit, renewable_pct,
                                  assurance_level, assurance_provider, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
  `).bind(
    id, user.id, b.framework, b.reporting_year, b.period_start || `${b.reporting_year}-01-01`, b.period_end || `${b.reporting_year}-12-31`,
    roll?.scope1_tco2e ?? null, roll?.scope2_location_tco2e ?? null, roll?.scope2_market_tco2e ?? null, roll?.scope3_tco2e ?? null,
    roll?.intensity_kgco2e_zar ?? null, 'kgCO2e/ZAR', roll?.renewable_pct ?? null,
    b.assurance_level ?? 'none', b.assurance_provider ?? null, b.notes ?? null,
  ).run();
  await fireCascade({
    event: 'esg.disclosure_created',
    actor_id: user.id, entity_type: 'esg_disclosures', entity_id: id,
    data: { framework: b.framework, reporting_year: b.reporting_year }, env: c.env,
  });
  return c.json({ success: true, data: { id } }, 201);
});

// POST /disclosures/:id/submit — flag as submitted to the regulator/exchange
esg.post('/disclosures/:id/submit', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as { submitted_to?: string; external_reference?: string };
  await c.env.DB.prepare(`
    UPDATE esg_disclosures SET status = 'submitted', submitted_at = datetime('now'),
                                submitted_to = ?, external_reference = ?, updated_at = datetime('now')
     WHERE id = ? AND participant_id = ?
  `).bind(b.submitted_to ?? null, b.external_reference ?? null, id, user.id).run();
  await fireCascade({
    event: 'esg.disclosure_submitted',
    actor_id: user.id, entity_type: 'esg_disclosures', entity_id: id,
    data: { external_reference: b.external_reference, submitted_to: b.submitted_to }, env: c.env,
  });
  return c.json({ success: true });
});

// GET /disclosures/:id/export?framework=CDP|TCFD|CSRD|ISSB_S2|JSE_SRL|SEC_CLIMATE|GHG_PROTOCOL
//
// Returns a framework-shaped JSON payload that downstream automation can
// transform into the regulator's exact format (PDF, XBRL, etc).
esg.get('/disclosures/:id/export', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const fmt = (c.req.query('framework') || '').toUpperCase();
  const d = await c.env.DB.prepare(
    `SELECT * FROM esg_disclosures WHERE id = ? AND participant_id = ?`,
  ).bind(id, user.id).first() as Record<string, unknown> | null;
  if (!d) return c.json({ success: false, error: 'not_found' }, 404);

  const participant = await c.env.DB.prepare(
    `SELECT id, name, company_name, role, status, kyc_status, bbbee_level FROM participants WHERE id = ?`,
  ).bind(user.id).first();
  const targets = await c.env.DB.prepare(
    `SELECT * FROM esg_targets WHERE participant_id = ? ORDER BY target_year`,
  ).bind(user.id).all();
  const initiatives = await c.env.DB.prepare(
    `SELECT * FROM esg_initiatives WHERE participant_id = ? AND status IN ('approved','in_progress','delivered')`,
  ).bind(user.id).all();
  const risks = await c.env.DB.prepare(
    `SELECT * FROM esg_risks WHERE participant_id = ?`,
  ).bind(user.id).all();
  const materiality = await c.env.DB.prepare(
    `SELECT * FROM esg_materiality_topics WHERE participant_id = ?`,
  ).bind(user.id).all();

  const base = {
    framework: fmt,
    organisation: participant,
    reporting_year: d.reporting_year,
    period: { start: d.period_start, end: d.period_end },
    ghg_emissions: {
      scope1_tco2e: d.scope1_tco2e,
      scope2_location_tco2e: d.scope2_location_tco2e,
      scope2_market_tco2e: d.scope2_market_tco2e,
      scope3_tco2e: d.scope3_tco2e,
      total_location_tco2e: Number(d.scope1_tco2e || 0) + Number(d.scope2_location_tco2e || 0) + Number(d.scope3_tco2e || 0),
      total_market_tco2e: Number(d.scope1_tco2e || 0) + Number(d.scope2_market_tco2e || 0) + Number(d.scope3_tco2e || 0),
      intensity_value: d.intensity_value,
      intensity_unit: d.intensity_unit,
      renewable_pct: d.renewable_pct,
    },
    targets: targets.results || [],
    initiatives: initiatives.results || [],
    risks: risks.results || [],
    materiality: materiality.results || [],
    assurance: { level: d.assurance_level, provider: d.assurance_provider },
  };

  // Framework-specific projections — shape varies by what the regulator
  // wants in the first section.
  let payload: Record<string, unknown> = base;
  if (fmt === 'CDP') {
    payload = {
      ...base,
      cdp_module: 'CC',
      questions: {
        'C6.1': base.ghg_emissions.scope1_tco2e,
        'C6.3': base.ghg_emissions.scope2_location_tco2e,
        'C6.3a': base.ghg_emissions.scope2_market_tco2e,
        'C6.5': base.ghg_emissions.scope3_tco2e,
        'C4.1': base.targets,
      },
    };
  } else if (fmt === 'TCFD') {
    payload = {
      ...base,
      tcfd_pillars: {
        governance: { description: 'Board-level climate oversight via ESG Committee', citations: [] },
        strategy: { risks_opportunities: risks.results, scenarios: ['NGFS Orderly','NGFS Disorderly','IEA NZE'] },
        risk_management: { processes: 'Annual climate risk assessment integrated into enterprise risk register' },
        metrics_targets: { emissions: base.ghg_emissions, targets: base.targets },
      },
    };
  } else if (fmt === 'CSRD' || fmt === 'ESRS') {
    payload = {
      ...base,
      esrs: {
        general_disclosures: 'ESRS 2',
        e1_climate: {
          policies: base.targets,
          actions: base.initiatives,
          metrics: base.ghg_emissions,
        },
        double_materiality: base.materiality,
      },
    };
  } else if (fmt === 'ISSB_S2' || fmt === 'IFRS_S2') {
    payload = {
      ...base,
      issb_s2: {
        para_29: { ghg_emissions: base.ghg_emissions },
        para_33: { climate_resilience: base.risks },
        para_36: { targets: base.targets },
      },
    };
  } else if (fmt === 'JSE_SRL') {
    payload = {
      ...base,
      jse_srl: {
        principle_1: base.ghg_emissions,
        principle_2: base.targets,
        principle_4: base.materiality,
        bbbee_level: (participant as { bbbee_level?: number } | null)?.bbbee_level,
      },
    };
  } else if (fmt === 'SEC_CLIMATE') {
    payload = {
      ...base,
      sec_rule_s_k_1500: {
        scope1: base.ghg_emissions.scope1_tco2e,
        scope2_market: base.ghg_emissions.scope2_market_tco2e,
        material_climate_risks: risks.results,
      },
    };
  } else if (fmt === 'GHG_PROTOCOL') {
    payload = {
      ...base,
      ghg_protocol: {
        organisational_boundary: 'Operational control',
        consolidation_approach: 'Operational control',
        emissions: base.ghg_emissions,
      },
    };
  }
  return c.json({ success: true, data: payload });
});

// ─── Materiality + risks ────────────────────────────────────────────────
esg.get('/materiality', async (c) => {
  const user = getCurrentUser(c);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM esg_materiality_topics WHERE participant_id = ? ORDER BY (impact_materiality + financial_materiality) DESC`,
  ).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
});
esg.post('/materiality', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.topic_code || !b.topic_name) return c.json({ success: false, error: 'topic_code + topic_name required' }, 400);
  const id = uid('esgm');
  await c.env.DB.prepare(`
    INSERT INTO esg_materiality_topics (id, participant_id, topic_code, topic_name, esrs_alignment,
                                         impact_materiality, financial_materiality, assessed_at, assessed_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
  `).bind(id, user.id, b.topic_code, b.topic_name, b.esrs_alignment ?? null,
          b.impact_materiality ?? null, b.financial_materiality ?? null, user.id, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

esg.get('/risks', async (c) => {
  const user = getCurrentUser(c);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM esg_risks WHERE participant_id = ? ORDER BY (likelihood * impact_zar) DESC`,
  ).bind(user.id).all();
  return c.json({ success: true, data: rs.results || [] });
});
esg.post('/risks', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.risk_type || !b.title) return c.json({ success: false, error: 'risk_type + title required' }, 400);
  const id = uid('esgr');
  await c.env.DB.prepare(`
    INSERT INTO esg_risks (id, participant_id, risk_type, title, description, time_horizon,
                            likelihood, impact_zar, scenario, mitigation, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'identified')
  `).bind(id, user.id, b.risk_type, b.title, b.description ?? null, b.time_horizon ?? 'medium',
          b.likelihood ?? null, b.impact_zar ?? null, b.scenario ?? null, b.mitigation ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

export default esg;
