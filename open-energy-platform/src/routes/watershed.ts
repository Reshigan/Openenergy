// ═══════════════════════════════════════════════════════════════════════════
// Watershed-parity feature set
//
// Mirrors the watershed.com product surface, scoped to a participant via
// JWT. All sub-domains share the same auth + tenant pattern and write to
// the tables introduced in migration 040_watershed_parity.sql.
//
//   /pcaf/*         Financed/facilitated emissions + portfolio targets
//   /removals/*     CDR catalog, offtake agreements, retirement chain
//   /cfe/*          24/7 carbon-free energy hourly matching
//   /pcf/*          Product carbon footprints (SKU level)
//   /assurance/*    Auditor engagements, findings, evidence pack
//   /maturity/*     Climate maturity score + benchmarks
//   /spend-hints/*  EEIO auto-tag suggestions
//   /anomalies/*    Detected anomalies on ESG transactions
//   /jurisdictions/* Multi-regulator disclosure registry
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const watershed = new Hono<HonoEnv>();
watershed.use('*', authMiddleware);

const rid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ─────────────────────────────────────────────────────────────────────────
// 1. PCAF Financed Emissions
// ─────────────────────────────────────────────────────────────────────────

watershed.get('/pcaf/asset-classes', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM pcaf_asset_classes ORDER BY display_order`).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.get('/pcaf/financed', async (c) => {
  const user = getCurrentUser(c);
  const year = c.req.query('year');
  const assetClass = c.req.query('asset_class');
  let sql = `SELECT * FROM pcaf_financed_emissions WHERE participant_id = ?`;
  const binds: any[] = [user.id];
  if (year) { sql += ` AND reporting_year = ?`; binds.push(Number(year)); }
  if (assetClass) { sql += ` AND asset_class = ?`; binds.push(assetClass); }
  sql += ` ORDER BY reporting_year DESC, financed_total_tco2e DESC`;
  const r = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/pcaf/financed', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const {
    reporting_year, asset_class, counterparty_name, counterparty_country, counterparty_sector_nace,
    counterparty_revenue_zar, counterparty_evic_zar, property_address, vehicle_make_model, project_id,
    outstanding_amount_zar, commitment_amount_zar, fx_rate, attribution_method,
    counterparty_scope1_tco2e, counterparty_scope2_tco2e, counterparty_scope3_tco2e,
    emissions_data_source, pcaf_data_quality_score, notes,
  } = body;

  if (!reporting_year || !asset_class || !counterparty_name || outstanding_amount_zar === undefined) {
    return c.json({ success: false, error: 'reporting_year, asset_class, counterparty_name and outstanding_amount_zar are required' }, 400);
  }

  // Attribution factor: outstanding / denominator. Defaults to EVIC for
  // listed equity / corporate bonds, falls back gracefully if missing.
  const method = attribution_method || 'evic';
  let denom = 0;
  if (method === 'evic') denom = counterparty_evic_zar || counterparty_revenue_zar || outstanding_amount_zar;
  else if (method === 'revenue') denom = counterparty_revenue_zar || outstanding_amount_zar;
  else if (method === 'property_value' || method === 'asset_value') denom = commitment_amount_zar || outstanding_amount_zar;
  else if (method === 'vehicle_value') denom = commitment_amount_zar || outstanding_amount_zar;
  else denom = outstanding_amount_zar;
  const attrib = denom > 0 ? outstanding_amount_zar / denom : 1;

  const s1 = (counterparty_scope1_tco2e || 0) * attrib;
  const s2 = (counterparty_scope2_tco2e || 0) * attrib;
  const s3 = (counterparty_scope3_tco2e || 0) * attrib;
  const total = s1 + s2 + s3;
  const intensity = outstanding_amount_zar > 0 ? total / outstanding_amount_zar : 0;

  const id = rid('pcafe');
  await c.env.DB.prepare(`
    INSERT INTO pcaf_financed_emissions (
      id, participant_id, reporting_year, asset_class,
      counterparty_name, counterparty_country, counterparty_sector_nace,
      counterparty_revenue_zar, counterparty_evic_zar, property_address, vehicle_make_model, project_id,
      outstanding_amount_zar, commitment_amount_zar, fx_rate, attribution_method,
      counterparty_scope1_tco2e, counterparty_scope2_tco2e, counterparty_scope3_tco2e,
      emissions_data_source, pcaf_data_quality_score,
      attribution_factor, financed_scope1_tco2e, financed_scope2_tco2e, financed_scope3_tco2e,
      financed_total_tco2e, emission_intensity, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, reporting_year, asset_class,
    counterparty_name, counterparty_country ?? null, counterparty_sector_nace ?? null,
    counterparty_revenue_zar ?? null, counterparty_evic_zar ?? null, property_address ?? null, vehicle_make_model ?? null, project_id ?? null,
    outstanding_amount_zar, commitment_amount_zar ?? null, fx_rate ?? 1.0, method,
    counterparty_scope1_tco2e ?? null, counterparty_scope2_tco2e ?? null, counterparty_scope3_tco2e ?? null,
    emissions_data_source ?? null, pcaf_data_quality_score ?? null,
    attrib, s1, s2, s3, total, intensity, notes ?? null,
  ).run();

  await fireCascade({
    event: 'pcaf.financed_emissions_recorded',
    actor_id: user.id, entity_type: 'pcaf_financed_emissions', entity_id: id,
    data: { reporting_year, asset_class, counterparty_name, financed_total_tco2e: total },
    env: c.env,
  });

  return c.json({ success: true, data: { id, attribution_factor: attrib, financed_total_tco2e: total, emission_intensity: intensity } }, 201);
});

watershed.get('/pcaf/coverage', async (c) => {
  const user = getCurrentUser(c);
  const year = Number(c.req.query('year')) || new Date().getFullYear();
  const r = await c.env.DB.prepare(`
    SELECT
      ac.code, ac.name, ac.category,
      COUNT(fe.id) AS rows_recorded,
      COALESCE(SUM(fe.outstanding_amount_zar), 0) AS total_exposure_zar,
      COALESCE(SUM(fe.financed_total_tco2e), 0)   AS financed_total_tco2e,
      AVG(fe.pcaf_data_quality_score)              AS avg_data_quality
    FROM pcaf_asset_classes ac
    LEFT JOIN pcaf_financed_emissions fe
      ON fe.asset_class = ac.code AND fe.participant_id = ? AND fe.reporting_year = ?
    GROUP BY ac.code
    ORDER BY ac.display_order
  `).bind(user.id, year).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.get('/pcaf/targets', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM pcaf_targets WHERE participant_id = ? ORDER BY created_at DESC`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/pcaf/targets', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { framework, scope, sector, asset_class, base_year, base_intensity, target_year, target_intensity, pathway_alignment, notes } = body;
  if (!framework || !scope || !base_year || !target_year) {
    return c.json({ success: false, error: 'framework, scope, base_year, target_year required' }, 400);
  }
  const id = rid('pcaft');
  await c.env.DB.prepare(`
    INSERT INTO pcaf_targets (id, participant_id, framework, scope, sector, asset_class, base_year, base_intensity, target_year, target_intensity, pathway_alignment, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, framework, scope, sector ?? null, asset_class ?? null, base_year, base_intensity ?? null, target_year, target_intensity ?? null, pathway_alignment ?? null, notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

watershed.get('/pcaf/facilitated', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM pcaf_facilitated_emissions WHERE participant_id = ? ORDER BY reporting_year DESC, facilitated_tco2e DESC`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/pcaf/facilitated', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const {
    reporting_year, transaction_type, issuer_name, facilitation_zar, issuer_sector, issuer_evic_zar,
    issuer_scope1_tco2e, issuer_scope2_tco2e, issuer_scope3_tco2e, weighting_factor, notes,
  } = body;
  if (!reporting_year || !transaction_type || !issuer_name || facilitation_zar === undefined) {
    return c.json({ success: false, error: 'reporting_year, transaction_type, issuer_name, facilitation_zar required' }, 400);
  }
  const wf = weighting_factor ?? 0.33;
  const denom = issuer_evic_zar || facilitation_zar;
  const attrib = denom > 0 ? facilitation_zar / denom : 1;
  const totalIssuer = (issuer_scope1_tco2e || 0) + (issuer_scope2_tco2e || 0) + (issuer_scope3_tco2e || 0);
  const facilitated = totalIssuer * attrib * wf;
  const id = rid('pfe');
  await c.env.DB.prepare(`
    INSERT INTO pcaf_facilitated_emissions
      (id, participant_id, reporting_year, transaction_type, issuer_name, facilitation_zar, issuer_sector,
       issuer_evic_zar, issuer_scope1_tco2e, issuer_scope2_tco2e, issuer_scope3_tco2e, weighting_factor,
       facilitated_tco2e, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, reporting_year, transaction_type, issuer_name, facilitation_zar, issuer_sector ?? null,
    issuer_evic_zar ?? null, issuer_scope1_tco2e ?? null, issuer_scope2_tco2e ?? null, issuer_scope3_tco2e ?? null, wf,
    facilitated, notes ?? null,
  ).run();
  return c.json({ success: true, data: { id, facilitated_tco2e: facilitated } }, 201);
});

watershed.get('/pcaf/temperature', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM portfolio_temperature_alignment WHERE participant_id = ? ORDER BY reporting_year DESC`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/pcaf/temperature', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { reporting_year, sector, methodology, temperature_c, pathway, notes } = body;
  if (!reporting_year || temperature_c === undefined) {
    return c.json({ success: false, error: 'reporting_year and temperature_c required' }, 400);
  }
  const id = rid('temp');
  await c.env.DB.prepare(`
    INSERT INTO portfolio_temperature_alignment (id, participant_id, reporting_year, sector, methodology, temperature_c, pathway, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, reporting_year, sector ?? null, methodology ?? null, temperature_c, pathway ?? null, notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Removals marketplace
// ─────────────────────────────────────────────────────────────────────────

watershed.get('/removals/projects', async (c) => {
  const status = c.req.query('status');
  const category = c.req.query('category');
  let sql = `SELECT * FROM cdr_projects WHERE 1=1`;
  const binds: any[] = [];
  if (status) { sql += ` AND status = ?`; binds.push(status); }
  if (category) { sql += ` AND category = ?`; binds.push(category); }
  sql += ` ORDER BY created_at DESC LIMIT 200`;
  const r = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/removals/projects', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const {
    project_name, technology, category, permanence_years, registry, registry_id, host_country,
    description, expected_tco2e_yr, total_tco2e_committed, price_zar_per_tco2e, vintage_first_year,
    third_party_audit, cobenefits, risk_rating,
  } = body;
  if (!project_name || !technology || !category) {
    return c.json({ success: false, error: 'project_name, technology, category required' }, 400);
  }
  const id = rid('cdr');
  await c.env.DB.prepare(`
    INSERT INTO cdr_projects (id, developer_id, project_name, technology, category, permanence_years,
      registry, registry_id, host_country, description, expected_tco2e_yr, total_tco2e_committed,
      price_zar_per_tco2e, vintage_first_year, third_party_audit, cobenefits, risk_rating)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, project_name, technology, category, permanence_years ?? null,
    registry ?? null, registry_id ?? null, host_country ?? null, description ?? null,
    expected_tco2e_yr ?? null, total_tco2e_committed ?? null, price_zar_per_tco2e ?? null,
    vintage_first_year ?? null, third_party_audit ?? null,
    cobenefits ? JSON.stringify(cobenefits) : null, risk_rating ?? null,
  ).run();
  return c.json({ success: true, data: { id } }, 201);
});

watershed.get('/removals/projects/:id', async (c) => {
  const { id } = c.req.param();
  const r = await c.env.DB.prepare(`SELECT * FROM cdr_projects WHERE id = ?`).bind(id).first();
  if (!r) return c.json({ success: false, error: 'not found' }, 404);
  return c.json({ success: true, data: r });
});

watershed.get('/removals/offtakes', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(`
    SELECT o.*, p.project_name, p.technology, p.category, p.registry
    FROM cdr_offtakes o
    LEFT JOIN cdr_projects p ON p.id = o.project_id
    WHERE o.buyer_id = ?
    ORDER BY o.created_at DESC
  `).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/removals/offtakes', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { project_id, total_tco2e, price_zar_per_tco2e, start_vintage_year, end_vintage_year, payment_schedule, delivery_schedule } = body;
  if (!project_id || !total_tco2e || !price_zar_per_tco2e || !start_vintage_year) {
    return c.json({ success: false, error: 'project_id, total_tco2e, price_zar_per_tco2e, start_vintage_year required' }, 400);
  }
  const id = rid('offt');
  const totalZar = total_tco2e * price_zar_per_tco2e;
  await c.env.DB.prepare(`
    INSERT INTO cdr_offtakes (id, buyer_id, project_id, total_tco2e, price_zar_per_tco2e, total_zar,
      start_vintage_year, end_vintage_year, payment_schedule, delivery_schedule, signed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, project_id, total_tco2e, price_zar_per_tco2e, totalZar,
    start_vintage_year, end_vintage_year ?? null,
    payment_schedule ? JSON.stringify(payment_schedule) : null,
    delivery_schedule ? JSON.stringify(delivery_schedule) : null,
    new Date().toISOString(),
  ).run();
  await c.env.DB.prepare(`UPDATE cdr_projects SET status = 'contracted' WHERE id = ? AND status = 'listed'`).bind(project_id).run();
  await fireCascade({
    event: 'cdr.offtake_signed', actor_id: user.id, entity_type: 'cdr_offtakes', entity_id: id,
    data: { project_id, total_tco2e, total_zar: totalZar }, env: c.env,
  });
  return c.json({ success: true, data: { id, total_zar: totalZar } }, 201);
});

watershed.post('/removals/offtakes/:id/retire', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({} as any));
  const { tco2e_retired, vintage_year, reporting_year, serial_number, beneficiary, reason } = body;
  if (!tco2e_retired || !reporting_year) {
    return c.json({ success: false, error: 'tco2e_retired and reporting_year required' }, 400);
  }
  const offtake = await c.env.DB.prepare(`SELECT * FROM cdr_offtakes WHERE id = ? AND buyer_id = ?`).bind(id, user.id).first<any>();
  if (!offtake) return c.json({ success: false, error: 'offtake not found' }, 404);
  const remaining = (offtake.total_tco2e || 0) - (offtake.retired_tco2e || 0);
  if (tco2e_retired > remaining) return c.json({ success: false, error: `Only ${remaining} tCO2e available to retire` }, 400);
  const retId = rid('cdrret');
  await c.env.DB.prepare(`
    INSERT INTO cdr_retirements (id, offtake_id, participant_id, tco2e_retired, vintage_year, reporting_year, serial_number, beneficiary, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(retId, id, user.id, tco2e_retired, vintage_year ?? null, reporting_year, serial_number ?? null, beneficiary ?? null, reason ?? null).run();
  const newRetired = (offtake.retired_tco2e || 0) + tco2e_retired;
  const newStatus = newRetired >= (offtake.total_tco2e || 0) ? 'complete' : 'active';
  await c.env.DB.prepare(`UPDATE cdr_offtakes SET retired_tco2e = ?, status = ? WHERE id = ?`).bind(newRetired, newStatus, id).run();
  return c.json({ success: true, data: { retirement_id: retId, retired_total: newRetired, status: newStatus } }, 201);
});

watershed.get('/removals/portfolio', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(`
    SELECT
      COUNT(DISTINCT o.id)                                     AS offtake_count,
      COALESCE(SUM(o.total_tco2e), 0)                          AS total_committed_tco2e,
      COALESCE(SUM(o.retired_tco2e), 0)                        AS total_retired_tco2e,
      COALESCE(SUM(o.total_zar), 0)                            AS total_zar,
      COUNT(DISTINCT p.category)                                AS category_count,
      COUNT(DISTINCT p.technology)                              AS technology_count
    FROM cdr_offtakes o
    LEFT JOIN cdr_projects p ON p.id = o.project_id
    WHERE o.buyer_id = ?
  `).bind(user.id).first();
  const byTech = await c.env.DB.prepare(`
    SELECT p.technology, p.category,
           COALESCE(SUM(o.total_tco2e), 0)   AS committed_tco2e,
           COALESCE(SUM(o.retired_tco2e), 0) AS retired_tco2e
    FROM cdr_offtakes o
    JOIN cdr_projects p ON p.id = o.project_id
    WHERE o.buyer_id = ?
    GROUP BY p.technology, p.category
  `).bind(user.id).all();
  return c.json({ success: true, data: { summary: r, by_technology: byTech.results || [] } });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. 24/7 Carbon-Free Energy hourly matching
// ─────────────────────────────────────────────────────────────────────────

watershed.post('/cfe/load', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const rows: any[] = Array.isArray(body.rows) ? body.rows : (body.hour_utc ? [body] : []);
  if (!rows.length) return c.json({ success: false, error: 'rows[] or single row required' }, 400);
  const stmts = rows.map((row: any) => c.env.DB.prepare(
    `INSERT INTO cfe_hourly_load (id, participant_id, site_id, hour_utc, load_kwh, grid_zone) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(rid('ld'), user.id, row.site_id ?? null, row.hour_utc, row.load_kwh, row.grid_zone ?? null));
  await c.env.DB.batch(stmts);
  return c.json({ success: true, data: { inserted: rows.length } }, 201);
});

watershed.post('/cfe/generation', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const rows: any[] = Array.isArray(body.rows) ? body.rows : (body.hour_utc ? [body] : []);
  if (!rows.length) return c.json({ success: false, error: 'rows[] or single row required' }, 400);
  const stmts = rows.map((row: any) => c.env.DB.prepare(
    `INSERT INTO cfe_hourly_generation (id, participant_id, source_type, source_ref, technology, hour_utc, generation_kwh, grid_zone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(rid('gn'), user.id, row.source_type, row.source_ref ?? null, row.technology ?? null, row.hour_utc, row.generation_kwh, row.grid_zone ?? null));
  await c.env.DB.batch(stmts);
  return c.json({ success: true, data: { inserted: rows.length } }, 201);
});

watershed.post('/cfe/score', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { period_start, period_end, grid_intensity_kg_kwh } = body;
  if (!period_start || !period_end) return c.json({ success: false, error: 'period_start and period_end required' }, 400);

  const load = await c.env.DB.prepare(`
    SELECT hour_utc, SUM(load_kwh) AS load_kwh FROM cfe_hourly_load
    WHERE participant_id = ? AND hour_utc >= ? AND hour_utc <= ?
    GROUP BY hour_utc
  `).bind(user.id, period_start, period_end).all<any>();

  const gen = await c.env.DB.prepare(`
    SELECT hour_utc, SUM(generation_kwh) AS gen_kwh FROM cfe_hourly_generation
    WHERE participant_id = ? AND hour_utc >= ? AND hour_utc <= ?
    GROUP BY hour_utc
  `).bind(user.id, period_start, period_end).all<any>();

  const loadMap = new Map<string, number>();
  (load.results || []).forEach((r: any) => loadMap.set(r.hour_utc, r.load_kwh || 0));
  const genMap = new Map<string, number>();
  (gen.results || []).forEach((r: any) => genMap.set(r.hour_utc, r.gen_kwh || 0));

  let totalLoad = 0, totalCarbonFree = 0, fullMatchHours = 0, zeroMatchHours = 0;
  for (const [hour, l] of loadMap) {
    const g = genMap.get(hour) || 0;
    const matched = Math.min(l, g);
    totalLoad += l;
    totalCarbonFree += matched;
    if (g >= l && l > 0) fullMatchHours++;
    if (g === 0) zeroMatchHours++;
  }
  const matchPct = totalLoad > 0 ? (totalCarbonFree / totalLoad) * 100 : 0;
  const gridIntensity = grid_intensity_kg_kwh ?? 0.92; // ZA average per Eskom 2024
  const avoided = (totalCarbonFree * gridIntensity) / 1000; // tCO2e

  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO cfe_match_summary
      (participant_id, reporting_period_start, reporting_period_end, total_load_kwh, total_carbon_free_kwh,
       cfe_match_pct, hours_with_full_match, hours_with_zero_match, avg_grid_intensity_kg_kwh, emissions_avoided_tco2e)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(user.id, period_start, period_end, totalLoad, totalCarbonFree, matchPct, fullMatchHours, zeroMatchHours, gridIntensity, avoided).run();

  return c.json({
    success: true,
    data: {
      total_load_kwh: totalLoad,
      total_carbon_free_kwh: totalCarbonFree,
      cfe_match_pct: matchPct,
      hours_with_full_match: fullMatchHours,
      hours_with_zero_match: zeroMatchHours,
      emissions_avoided_tco2e: avoided,
    },
  });
});

watershed.get('/cfe/summary', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM cfe_match_summary WHERE participant_id = ? ORDER BY reporting_period_end DESC LIMIT 24`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Product Carbon Footprints
// ─────────────────────────────────────────────────────────────────────────

watershed.get('/pcf', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM product_carbon_footprints WHERE participant_id = ? ORDER BY reporting_year DESC, product_name`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/pcf', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const {
    product_code, product_name, functional_unit, reporting_year, methodology,
    upstream_tco2e_per_unit, manufacturing_tco2e_per_unit, distribution_tco2e_per_unit,
    use_phase_tco2e_per_unit, end_of_life_tco2e_per_unit, units_sold, data_quality_score, assurance_status, notes,
  } = body;
  if (!product_code || !product_name || !functional_unit || !reporting_year) {
    return c.json({ success: false, error: 'product_code, product_name, functional_unit, reporting_year required' }, 400);
  }
  const total = (upstream_tco2e_per_unit || 0) + (manufacturing_tco2e_per_unit || 0)
              + (distribution_tco2e_per_unit || 0) + (use_phase_tco2e_per_unit || 0)
              + (end_of_life_tco2e_per_unit || 0);
  const lifecycle = units_sold ? total * units_sold : null;
  const id = rid('pcf');
  await c.env.DB.prepare(`
    INSERT INTO product_carbon_footprints
      (id, participant_id, product_code, product_name, functional_unit, reporting_year, methodology,
       upstream_tco2e_per_unit, manufacturing_tco2e_per_unit, distribution_tco2e_per_unit,
       use_phase_tco2e_per_unit, end_of_life_tco2e_per_unit, total_tco2e_per_unit, units_sold,
       total_lifecycle_tco2e, data_quality_score, assurance_status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, product_code, product_name, functional_unit, reporting_year, methodology ?? null,
    upstream_tco2e_per_unit ?? 0, manufacturing_tco2e_per_unit ?? 0, distribution_tco2e_per_unit ?? 0,
    use_phase_tco2e_per_unit ?? 0, end_of_life_tco2e_per_unit ?? 0, total, units_sold ?? null,
    lifecycle, data_quality_score ?? null, assurance_status ?? null, notes ?? null,
  ).run();
  return c.json({ success: true, data: { id, total_tco2e_per_unit: total, total_lifecycle_tco2e: lifecycle } }, 201);
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Assurance workflow
// ─────────────────────────────────────────────────────────────────────────

watershed.get('/assurance/engagements', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM assurance_engagements WHERE participant_id = ? ORDER BY reporting_year DESC, created_at DESC`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/assurance/engagements', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { reporting_year, scope, auditor_name, auditor_email, assurance_standard, assurance_level, notes } = body;
  if (!reporting_year || !scope || !assurance_standard || !assurance_level) {
    return c.json({ success: false, error: 'reporting_year, scope, assurance_standard, assurance_level required' }, 400);
  }
  const id = rid('aseng');
  await c.env.DB.prepare(`
    INSERT INTO assurance_engagements (id, participant_id, reporting_year, scope, auditor_name, auditor_email,
      assurance_standard, assurance_level, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, reporting_year, scope, auditor_name ?? null, auditor_email ?? null, assurance_standard, assurance_level, notes ?? null).run();
  await fireCascade({ event: 'assurance.engagement_opened', actor_id: user.id, entity_type: 'assurance_engagements', entity_id: id, data: { reporting_year, scope }, env: c.env });
  return c.json({ success: true, data: { id } }, 201);
});

watershed.patch('/assurance/engagements/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({} as any));
  const sets: string[] = []; const binds: any[] = [];
  for (const k of ['engagement_status', 'opinion', 'opinion_letter_r2_key', 'opinion_date', 'scope_emissions_assured', 'notes']) {
    if (body[k] !== undefined) { sets.push(`${k} = ?`); binds.push(body[k]); }
  }
  if (!sets.length) return c.json({ success: false, error: 'no fields to update' }, 400);
  sets.push(`updated_at = datetime('now')`);
  binds.push(id, user.id);
  await c.env.DB.prepare(`UPDATE assurance_engagements SET ${sets.join(', ')} WHERE id = ? AND participant_id = ?`).bind(...binds).run();
  return c.json({ success: true });
});

watershed.get('/assurance/engagements/:id/findings', async (c) => {
  const { id } = c.req.param();
  const r = await c.env.DB.prepare(`SELECT * FROM assurance_findings WHERE engagement_id = ? ORDER BY created_at DESC`).bind(id).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/assurance/engagements/:id/findings', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({} as any));
  const { finding_ref, severity, category, title, description, affected_table, affected_id, due_date } = body;
  if (!title) return c.json({ success: false, error: 'title required' }, 400);
  const fid = rid('find');
  await c.env.DB.prepare(`
    INSERT INTO assurance_findings (id, engagement_id, finding_ref, severity, category, title, description,
      affected_table, affected_id, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(fid, id, finding_ref ?? null, severity ?? 'observation', category ?? null, title, description ?? null, affected_table ?? null, affected_id ?? null, due_date ?? null).run();
  return c.json({ success: true, data: { id: fid } }, 201);
});

watershed.patch('/assurance/findings/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({} as any));
  const sets: string[] = []; const binds: any[] = [];
  for (const k of ['management_response', 'status', 'due_date']) {
    if (body[k] !== undefined) { sets.push(`${k} = ?`); binds.push(body[k]); }
  }
  if (body.status && (body.status === 'remediated' || body.status === 'accepted' || body.status === 'rejected')) {
    sets.push(`resolved_at = datetime('now')`);
    sets.push(`resolved_by = ?`); binds.push(user.id);
  }
  if (!sets.length) return c.json({ success: false, error: 'no fields to update' }, 400);
  binds.push(id);
  await c.env.DB.prepare(`UPDATE assurance_findings SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return c.json({ success: true });
});

watershed.post('/assurance/engagements/:id/evidence', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({} as any));
  const { artefact_type, description, source_table, source_id, r2_key, hash_sha256 } = body;
  if (!artefact_type || !r2_key) return c.json({ success: false, error: 'artefact_type and r2_key required' }, 400);
  const eid = rid('asev');
  await c.env.DB.prepare(`
    INSERT INTO assurance_evidence (id, engagement_id, artefact_type, description, source_table, source_id, r2_key, uploaded_by, hash_sha256)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(eid, id, artefact_type, description ?? null, source_table ?? null, source_id ?? null, r2_key, user.id, hash_sha256 ?? null).run();
  return c.json({ success: true, data: { id: eid } }, 201);
});

watershed.get('/assurance/engagements/:id/evidence', async (c) => {
  const { id } = c.req.param();
  const r = await c.env.DB.prepare(`SELECT * FROM assurance_evidence WHERE engagement_id = ? ORDER BY uploaded_at DESC`).bind(id).all();
  return c.json({ success: true, data: r.results || [] });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. Climate maturity + industry benchmarks
// ─────────────────────────────────────────────────────────────────────────

watershed.get('/maturity', async (c) => {
  const user = getCurrentUser(c);
  // Tie-break same-year assessments by assessed_at so the latest run is first.
  const r = await c.env.DB.prepare(
    `SELECT * FROM climate_maturity_assessments WHERE participant_id = ? ORDER BY reporting_year DESC, assessed_at DESC`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/maturity/score', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const year = body.reporting_year || new Date().getFullYear();

  // Compute pillar scores from the platform's existing ESG/disclosure state.
  // Each pillar is graded 0..100 based on observable data, not self-reported.

  // Measurement: do they have transactions across all 3 scopes for the year?
  // esg_activity_transactions stores emissions in kg, not tonnes — column is
  // emissions_kg_co2e (we divide by 1000 wherever we surface tCO₂e totals).
  const txByScope = await c.env.DB.prepare(`
    SELECT scope, COUNT(*) AS n FROM esg_activity_transactions
    WHERE participant_id = ? AND substr(activity_date, 1, 4) = ?
    GROUP BY scope
  `).bind(user.id, String(year)).all<any>();
  const scopesSeen = new Set((txByScope.results || []).map((r: any) => r.scope));
  let measurement = (scopesSeen.has(1) ? 30 : 0) + (scopesSeen.has(2) ? 30 : 0) + (scopesSeen.has(3) ? 40 : 0);

  // Governance: do they have any disclosures filed?
  const discCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM esg_disclosures WHERE participant_id = ?`
  ).bind(user.id).first<any>();
  const governance = Math.min(100, (discCount?.n || 0) * 25);

  // Targets: how many SBTi/NZBA/internal targets logged?
  const tgtCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM esg_targets WHERE participant_id = ?`
  ).bind(user.id).first<any>();
  const target = Math.min(100, (tgtCount?.n || 0) * 30);

  // Action: how many completed initiatives?
  const initCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM esg_initiatives WHERE participant_id = ? AND status = 'completed'`
  ).bind(user.id).first<any>();
  const action = Math.min(100, (initCount?.n || 0) * 20);

  // Disclosure: number of distinct jurisdictions filed
  const jurCount = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT jurisdiction) AS n FROM disclosure_submissions WHERE participant_id = ? AND status IN ('submitted','accepted')`
  ).bind(user.id).first<any>();
  const disclosure = Math.min(100, (jurCount?.n || 0) * 20);

  const overall = (measurement * 0.25) + (governance * 0.15) + (target * 0.20) + (action * 0.25) + (disclosure * 0.15);
  const band = overall >= 80 ? 'leader' : overall >= 60 ? 'advanced' : overall >= 40 ? 'intermediate' : overall >= 20 ? 'beginner' : 'starter';

  const id = rid('mat');
  await c.env.DB.prepare(`
    INSERT INTO climate_maturity_assessments
      (id, participant_id, reporting_year, measurement_score, governance_score, target_score, action_score, disclosure_score, overall_score, band)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, year, measurement, governance, target, action, disclosure, overall, band).run();

  return c.json({
    success: true,
    data: { id, reporting_year: year, measurement_score: measurement, governance_score: governance, target_score: target, action_score: action, disclosure_score: disclosure, overall_score: overall, band },
  });
});

watershed.get('/benchmarks', async (c) => {
  const sector = c.req.query('sector_nace');
  const region = c.req.query('region');
  const year = c.req.query('year');
  let sql = `SELECT * FROM industry_benchmarks WHERE 1=1`;
  const binds: any[] = [];
  if (sector) { sql += ` AND sector_nace = ?`; binds.push(sector); }
  if (region) { sql += ` AND region = ?`; binds.push(region); }
  if (year) { sql += ` AND reporting_year = ?`; binds.push(Number(year)); }
  sql += ` ORDER BY sector_nace, region, metric`;
  const r = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: r.results || [] });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. Spend categorisation hints (EEIO auto-tag)
// ─────────────────────────────────────────────────────────────────────────

watershed.get('/spend-hints', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM spend_category_hints ORDER BY suggested_scope, pattern`).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/spend-hints/classify', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const description: string = String(body.description || '').toLowerCase();
  if (!description) return c.json({ success: false, error: 'description required' }, 400);
  const hints = await c.env.DB.prepare(`SELECT * FROM spend_category_hints`).all<any>();
  const matches: any[] = [];
  for (const h of (hints.results || [])) {
    let hit = false;
    if (h.pattern_type === 'exact') hit = description === String(h.pattern).toLowerCase();
    else if (h.pattern_type === 'regex') {
      try { hit = new RegExp(h.pattern, 'i').test(description); } catch { /* invalid regex */ }
    } else {
      hit = description.includes(String(h.pattern).toLowerCase());
    }
    if (hit) matches.push({
      suggested_activity_code: h.suggested_activity_code,
      suggested_scope: h.suggested_scope,
      suggested_scope3_category: h.suggested_scope3_category,
      confidence: h.confidence,
    });
  }
  matches.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  return c.json({ success: true, data: { matches, top: matches[0] || null } });
});

// ─────────────────────────────────────────────────────────────────────────
// 8. Anomaly detection
// ─────────────────────────────────────────────────────────────────────────

watershed.get('/anomalies', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status') || 'open';
  const r = await c.env.DB.prepare(
    `SELECT * FROM esg_anomaly_flags WHERE participant_id = ? AND status = ? ORDER BY detected_at DESC LIMIT 200`
  ).bind(user.id, status).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/anomalies/scan', async (c) => {
  const user = getCurrentUser(c);
  const flagged: any[] = [];

  // esg_activity_transactions stores emissions in kg (column emissions_kg_co2e)
  // and quantity (not activity_value).

  // Rule 1: month-over-month spike >300% (likely duplicate posting or unit error).
  const spikes = await c.env.DB.prepare(`
    WITH monthly AS (
      SELECT id, scope, activity_code, substr(activity_date, 1, 7) AS ym, emissions_kg_co2e
      FROM esg_activity_transactions
      WHERE participant_id = ?
    )
    SELECT m.id, m.scope, m.activity_code, m.ym, m.emissions_kg_co2e AS emissions,
           (SELECT AVG(m2.emissions_kg_co2e) FROM monthly m2 WHERE m2.activity_code = m.activity_code AND m2.ym < m.ym) AS prior_avg
    FROM monthly m
  `).bind(user.id).all<any>();
  for (const row of (spikes.results || [])) {
    if (row.prior_avg && row.emissions > row.prior_avg * 4) {
      const id = rid('anf');
      await c.env.DB.prepare(`
        INSERT OR IGNORE INTO esg_anomaly_flags (id, transaction_id, participant_id, rule, severity, detail, expected_value, observed_value)
        VALUES (?, ?, ?, 'spike_30d', 'high', ?, ?, ?)
      `).bind(id, row.id, user.id, `Spike vs ${row.ym} prior-month avg`, row.prior_avg, row.emissions).run();
      flagged.push({ id, txid: row.id, rule: 'spike_30d' });
    }
  }

  // Rule 2: impossible_value (negative emissions).
  const negs = await c.env.DB.prepare(`
    SELECT id, emissions_kg_co2e FROM esg_activity_transactions
    WHERE participant_id = ? AND emissions_kg_co2e < 0
  `).bind(user.id).all<any>();
  for (const row of (negs.results || [])) {
    const id = rid('anf');
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO esg_anomaly_flags (id, transaction_id, participant_id, rule, severity, detail, observed_value)
      VALUES (?, ?, ?, 'impossible_value', 'critical', 'Negative emissions value', ?)
    `).bind(id, row.id, user.id, row.emissions_kg_co2e).run();
    flagged.push({ id, txid: row.id, rule: 'impossible_value' });
  }

  // Rule 3: duplicate detection — same activity_code + activity_date + quantity within 0.01.
  const dupes = await c.env.DB.prepare(`
    SELECT a.id AS a_id, b.id AS b_id, a.emissions_kg_co2e AS emissions
    FROM esg_activity_transactions a
    JOIN esg_activity_transactions b
      ON a.participant_id = b.participant_id
     AND a.activity_code = b.activity_code
     AND a.activity_date = b.activity_date
     AND abs(a.quantity - b.quantity) < 0.01
     AND a.id < b.id
    WHERE a.participant_id = ?
    LIMIT 100
  `).bind(user.id).all<any>();
  for (const row of (dupes.results || [])) {
    const id = rid('anf');
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO esg_anomaly_flags (id, transaction_id, participant_id, rule, severity, detail, observed_value)
      VALUES (?, ?, ?, 'duplicate', 'medium', ?, ?)
    `).bind(id, row.b_id, user.id, `Possible duplicate of ${row.a_id}`, row.emissions).run();
    flagged.push({ id, txid: row.b_id, rule: 'duplicate' });
  }

  return c.json({ success: true, data: { flagged_count: flagged.length, flagged } });
});

watershed.patch('/anomalies/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({} as any));
  const status = body.status;
  if (!status || !['open', 'dismissed', 'resolved'].includes(status)) {
    return c.json({ success: false, error: 'status must be open|dismissed|resolved' }, 400);
  }
  await c.env.DB.prepare(`
    UPDATE esg_anomaly_flags
    SET status = ?, resolved_at = CASE WHEN ? IN ('dismissed','resolved') THEN datetime('now') ELSE resolved_at END, resolved_by = ?
    WHERE id = ? AND participant_id = ?
  `).bind(status, status, user.id, id, user.id).run();
  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────
// 9. Multi-jurisdiction disclosure registry
// ─────────────────────────────────────────────────────────────────────────

watershed.get('/jurisdictions', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM disclosure_jurisdictions ORDER BY mandatory DESC, effective_year DESC`).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.get('/jurisdictions/submissions', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(`
    SELECT s.*, j.name AS jurisdiction_name, j.region
    FROM disclosure_submissions s
    JOIN disclosure_jurisdictions j ON j.code = s.jurisdiction
    WHERE s.participant_id = ?
    ORDER BY s.reporting_year DESC, s.created_at DESC
  `).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/jurisdictions/submissions', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { jurisdiction, reporting_year, source_disclosure_id, notes } = body;
  if (!jurisdiction || !reporting_year) return c.json({ success: false, error: 'jurisdiction and reporting_year required' }, 400);
  const id = rid('sub');
  await c.env.DB.prepare(`
    INSERT INTO disclosure_submissions (id, participant_id, jurisdiction, reporting_year, source_disclosure_id, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, jurisdiction, reporting_year, source_disclosure_id ?? null, notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

watershed.post('/jurisdictions/submissions/:id/submit', async (c) => {
  const { id } = c.req.param();
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE disclosure_submissions
    SET status = 'submitted', submitted_at = datetime('now'), external_reference = ?, filing_pack_r2_key = ?
    WHERE id = ? AND participant_id = ?
  `).bind(body.external_reference ?? null, body.filing_pack_r2_key ?? null, id, user.id).run();
  await fireCascade({
    event: 'disclosure.jurisdiction_filed', actor_id: user.id, entity_type: 'disclosure_submissions', entity_id: id,
    data: { external_reference: body.external_reference }, env: c.env,
  });
  return c.json({ success: true });
});

watershed.patch('/jurisdictions/submissions/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({} as any));
  const sets: string[] = []; const binds: any[] = [];
  for (const k of ['status', 'submitted_at', 'acknowledged_at', 'external_reference', 'filing_pack_r2_key', 'notes']) {
    if (body[k] !== undefined) { sets.push(`${k} = ?`); binds.push(body[k]); }
  }
  if (!sets.length) return c.json({ success: false, error: 'no fields to update' }, 400);
  binds.push(id, user.id);
  await c.env.DB.prepare(`UPDATE disclosure_submissions SET ${sets.join(', ')} WHERE id = ? AND participant_id = ?`).bind(...binds).run();
  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────
// 10. Watershed-style headline overview
// ─────────────────────────────────────────────────────────────────────────

watershed.get('/overview', async (c) => {
  const user = getCurrentUser(c);
  const year = Number(c.req.query('year')) || new Date().getFullYear();

  const [emissions, financed, removals, cfe, maturity, openAnomalies, openFindings, jurs] = await Promise.all([
    c.env.DB.prepare(`
      SELECT scope, COALESCE(SUM(emissions_kg_co2e),0) / 1000.0 AS total
      FROM esg_activity_transactions
      WHERE participant_id = ? AND substr(activity_date,1,4) = ?
      GROUP BY scope
    `).bind(user.id, String(year)).all(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(financed_total_tco2e),0) AS total, COUNT(*) AS n FROM pcaf_financed_emissions WHERE participant_id = ? AND reporting_year = ?`).bind(user.id, year).first(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(o.retired_tco2e),0) AS retired, COALESCE(SUM(o.total_tco2e),0) AS committed FROM cdr_offtakes o WHERE o.buyer_id = ?`).bind(user.id).first(),
    c.env.DB.prepare(`SELECT cfe_match_pct, emissions_avoided_tco2e FROM cfe_match_summary WHERE participant_id = ? ORDER BY reporting_period_end DESC LIMIT 1`).bind(user.id).first(),
    c.env.DB.prepare(`SELECT overall_score, band FROM climate_maturity_assessments WHERE participant_id = ? ORDER BY reporting_year DESC, assessed_at DESC LIMIT 1`).bind(user.id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM esg_anomaly_flags WHERE participant_id = ? AND status = 'open'`).bind(user.id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM assurance_findings WHERE engagement_id IN (SELECT id FROM assurance_engagements WHERE participant_id = ?) AND status IN ('open','in_remediation')`).bind(user.id).first(),
    c.env.DB.prepare(`SELECT COUNT(DISTINCT jurisdiction) AS n FROM disclosure_submissions WHERE participant_id = ? AND status IN ('submitted','accepted') AND reporting_year = ?`).bind(user.id, year).first(),
  ]);

  return c.json({
    success: true,
    data: {
      reporting_year: year,
      emissions: emissions.results || [],
      financed_emissions: financed,
      removals: removals,
      cfe: cfe || { cfe_match_pct: 0, emissions_avoided_tco2e: 0 },
      maturity: maturity || { overall_score: 0, band: 'starter' },
      open_anomalies: (openAnomalies as any)?.n || 0,
      open_findings: (openFindings as any)?.n || 0,
      jurisdictions_filed: (jurs as any)?.n || 0,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Advanced features (migration 042)
//
//   11. PCAF Part C — Insurance-associated emissions
//   12. NGFS scenario analysis
//   13. Counterparty data-collection portal
//   14. AI carbon-accountant classifier
//   15. Marginal abatement cost (MACC) curve data
//   16. Sectoral pathway library
//   17. Hash-chain immutable audit trail
//   18. Hourly REC marketplace
// ═══════════════════════════════════════════════════════════════════════════

// ─── 11. PCAF Part C — Insurance-associated emissions ──────────────────

watershed.get('/pcaf/insurance', async (c) => {
  const user = getCurrentUser(c);
  const year = c.req.query('year');
  let sql = `SELECT * FROM pcaf_insurance_emissions WHERE participant_id = ?`;
  const binds: any[] = [user.id];
  if (year) { sql += ` AND reporting_year = ?`; binds.push(Number(year)); }
  sql += ` ORDER BY reporting_year DESC, insurance_associated_tco2e DESC`;
  const r = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/pcaf/insurance', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const {
    reporting_year, line_of_business, insured_name, insured_country, insured_sector_nace,
    policy_reference, premium_zar, attribution_method, insured_revenue_zar,
    insured_scope1_tco2e, insured_scope2_tco2e, insured_scope3_tco2e,
    emissions_data_source, pcaf_data_quality_score, notes,
  } = body;
  if (!reporting_year || !line_of_business || !insured_name || premium_zar === undefined) {
    return c.json({ success: false, error: 'reporting_year, line_of_business, insured_name, premium_zar required' }, 400);
  }
  // PCAF Part C: attribution = premium / customer_revenue (or revenue-minus-claims).
  const method = attribution_method || 'premium_to_revenue';
  const denom = insured_revenue_zar || premium_zar;
  const attrib = denom > 0 ? premium_zar / denom : 1;
  const totalIssuer = (insured_scope1_tco2e || 0) + (insured_scope2_tco2e || 0) + (insured_scope3_tco2e || 0);
  const associated = totalIssuer * attrib;

  const id = rid('pcafi');
  await c.env.DB.prepare(`
    INSERT INTO pcaf_insurance_emissions (id, participant_id, reporting_year, line_of_business,
      insured_name, insured_country, insured_sector_nace, policy_reference, premium_zar,
      attribution_method, insured_revenue_zar, insured_scope1_tco2e, insured_scope2_tco2e,
      insured_scope3_tco2e, emissions_data_source, pcaf_data_quality_score, attribution_factor,
      insurance_associated_tco2e, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, reporting_year, line_of_business, insured_name, insured_country ?? null,
    insured_sector_nace ?? null, policy_reference ?? null, premium_zar, method,
    insured_revenue_zar ?? null, insured_scope1_tco2e ?? null, insured_scope2_tco2e ?? null,
    insured_scope3_tco2e ?? null, emissions_data_source ?? null, pcaf_data_quality_score ?? null,
    attrib, associated, notes ?? null,
  ).run();
  return c.json({ success: true, data: { id, attribution_factor: attrib, insurance_associated_tco2e: associated } }, 201);
});

// ─── 12. NGFS scenario analysis ────────────────────────────────────────

watershed.get('/scenarios', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM climate_scenarios ORDER BY family, temperature_2100_c`).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.get('/scenarios/runs', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT sr.*, cs.name AS scenario_name, cs.family
     FROM scenario_runs sr
     JOIN climate_scenarios cs ON cs.code = sr.scenario_code
     WHERE sr.participant_id = ?
     ORDER BY sr.computed_at DESC LIMIT 50`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/scenarios/run', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { scenario_code, horizon_years } = body;
  if (!scenario_code) return c.json({ success: false, error: 'scenario_code required' }, 400);

  const scenario = await c.env.DB.prepare(`SELECT * FROM climate_scenarios WHERE code = ?`).bind(scenario_code).first<any>();
  if (!scenario) return c.json({ success: false, error: 'scenario not found' }, 404);

  const horizon = horizon_years || 10;
  const baseYear = new Date().getFullYear();
  const targetYear = baseYear + horizon;

  // Pull current PCAF portfolio totals by sector
  const portfolio = await c.env.DB.prepare(`
    SELECT counterparty_sector_nace AS sector,
           COALESCE(SUM(outstanding_amount_zar), 0) AS exposure_zar,
           COALESCE(SUM(financed_total_tco2e), 0) AS emissions_tco2e
    FROM pcaf_financed_emissions
    WHERE participant_id = ? AND reporting_year = ?
    GROUP BY counterparty_sector_nace
  `).bind(user.id, baseYear).all<any>();

  let baseEmissions = 0, targetEmissions = 0, atRisk = 0, financialVar = 0;
  const sectorImpacts: any[] = [];
  let worstSector: string | null = null, worstVar = 0;

  // Scenario-driven impact factors (qualitative coarse-grain). Watershed
  // would use more sophisticated bottom-up sectoral pathways; this is a
  // reasonable approximation built on the seeded pathway library.
  const transitionMultiplier: Record<string, number> = {
    very_high: 0.40, high: 0.25, medium: 0.12, low: 0.04,
  };
  const tmult = transitionMultiplier[scenario.transition_risk] || 0.10;
  const carbonPrice2030 = scenario.carbon_price_2030_usd || 50;

  for (const row of (portfolio.results || [])) {
    baseEmissions += row.emissions_tco2e;
    // Apply NZE-style trajectory: linear decline toward 2050 net-zero (~80% reduction by 2050).
    const yearsToHorizon = horizon;
    const reductionPct = Math.min(0.80, yearsToHorizon * 0.025);  // 2.5%/yr typical NZE decline
    const projected = row.emissions_tco2e * (1 - reductionPct);
    targetEmissions += projected;

    // Emissions-at-risk: difference if transition is disorderly.
    const sectorRisk = row.emissions_tco2e * tmult;
    atRisk += sectorRisk;

    // Financial VaR: exposure × carbon price × emissions ratio.
    const sectorVar = row.exposure_zar * tmult * (carbonPrice2030 / 100) / 1000;
    financialVar += sectorVar;
    if (sectorVar > worstVar) { worstVar = sectorVar; worstSector = row.sector; }

    sectorImpacts.push({
      sector: row.sector || 'unclassified',
      exposure_zar: row.exposure_zar,
      base_emissions_tco2e: row.emissions_tco2e,
      target_emissions_tco2e: projected,
      emissions_at_risk_tco2e: sectorRisk,
      financial_var_zar: sectorVar,
    });
  }

  const id = rid('scen');
  await c.env.DB.prepare(`
    INSERT INTO scenario_runs (id, participant_id, scenario_code, horizon_years, base_year,
      portfolio_emissions_base_tco2e, portfolio_emissions_target_tco2e, emissions_at_risk_tco2e,
      financial_value_at_risk_zar, worst_sector_nace, worst_sector_var_zar, sector_impacts_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete')
  `).bind(
    id, user.id, scenario_code, horizon, baseYear,
    baseEmissions, targetEmissions, atRisk, financialVar,
    worstSector, worstVar, JSON.stringify(sectorImpacts),
  ).run();

  return c.json({
    success: true,
    data: {
      id, scenario_code, horizon_years: horizon, base_year: baseYear, target_year: targetYear,
      portfolio_emissions_base_tco2e: baseEmissions,
      portfolio_emissions_target_tco2e: targetEmissions,
      emissions_at_risk_tco2e: atRisk,
      financial_value_at_risk_zar: financialVar,
      worst_sector_nace: worstSector,
      worst_sector_var_zar: worstVar,
      sector_impacts: sectorImpacts,
    },
  }, 201);
});

// ─── 13. Counterparty data-collection portal ───────────────────────────

watershed.get('/counterparties/requests', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(`
    SELECT r.*, s.scope1_tco2e AS submitted_scope1, s.scope2_tco2e AS submitted_scope2,
           s.scope3_tco2e AS submitted_scope3, s.submitted_at
    FROM counterparty_data_requests r
    LEFT JOIN counterparty_submissions s ON s.request_id = r.id
    WHERE r.requestor_id = ?
    ORDER BY r.created_at DESC
  `).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/counterparties/requests', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { counterparty_name, counterparty_email, reporting_year, scope_requested, asset_class, exposure_zar, notes } = body;
  if (!counterparty_name || !reporting_year || !scope_requested) {
    return c.json({ success: false, error: 'counterparty_name, reporting_year, scope_requested required' }, 400);
  }
  const id = rid('cpreq');
  // Random URL-safe token; client builds share link with this.
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await c.env.DB.prepare(`
    INSERT INTO counterparty_data_requests (id, requestor_id, counterparty_name, counterparty_email,
      share_token, reporting_year, scope_requested, asset_class, exposure_zar, sent_at, expires_at, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)
  `).bind(id, user.id, counterparty_name, counterparty_email ?? null, token, reporting_year,
    scope_requested, asset_class ?? null, exposure_zar ?? null,
    new Date().toISOString(), expiresAt, notes ?? null).run();
  await fireCascade({
    event: 'pcaf.counterparty_data_request_sent' as any,
    actor_id: user.id, entity_type: 'counterparty_data_requests', entity_id: id,
    data: { counterparty_name, share_token: token }, env: c.env,
  }).catch(() => {});
  return c.json({ success: true, data: { id, share_token: token, share_url: `/portal/counterparty/${token}`, expires_at: expiresAt } }, 201);
});

// PUBLIC endpoint — uses share_token, not JWT. Exported separately and
// mounted at /api/portal/* in src/index.ts so the blanket authMiddleware
// inside `watershed` doesn't shadow it.
export const cpPortal = new Hono<HonoEnv>();

cpPortal.get('/counterparty/:token', async (c) => {
  const { token } = c.req.param();
  const r = await c.env.DB.prepare(`
    SELECT id, counterparty_name, reporting_year, scope_requested, asset_class,
           status, expires_at FROM counterparty_data_requests WHERE share_token = ?
  `).bind(token).first<any>();
  if (!r) return c.json({ success: false, error: 'invalid or expired token' }, 404);
  if (r.expires_at && new Date(r.expires_at) < new Date()) {
    return c.json({ success: false, error: 'token expired' }, 410);
  }
  // Mark as viewed if first view
  if (r.status === 'sent') {
    await c.env.DB.prepare(`UPDATE counterparty_data_requests SET status = 'viewed' WHERE id = ?`).bind(r.id).run();
  }
  return c.json({ success: true, data: r });
});

cpPortal.post('/counterparty/:token/submit', async (c) => {
  const { token } = c.req.param();
  const body = await c.req.json().catch(() => ({} as any));
  const req = await c.env.DB.prepare(`SELECT id, status, expires_at FROM counterparty_data_requests WHERE share_token = ?`).bind(token).first<any>();
  if (!req) return c.json({ success: false, error: 'invalid token' }, 404);
  if (req.expires_at && new Date(req.expires_at) < new Date()) {
    return c.json({ success: false, error: 'token expired' }, 410);
  }
  const subId = rid('cpsub');
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null;
  const ua = c.req.header('user-agent') || null;
  await c.env.DB.prepare(`
    INSERT INTO counterparty_submissions (id, request_id, submitter_email, submitter_role,
      revenue_zar, evic_zar, scope1_tco2e, scope2_tco2e, scope3_tco2e, reporting_standard,
      assurance_provider, assurance_level, attestation, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(subId, req.id, body.submitter_email ?? null, body.submitter_role ?? null,
    body.revenue_zar ?? null, body.evic_zar ?? null,
    body.scope1_tco2e ?? null, body.scope2_tco2e ?? null, body.scope3_tco2e ?? null,
    body.reporting_standard ?? null, body.assurance_provider ?? null,
    body.assurance_level ?? null, body.attestation ?? null, ip, ua).run();
  await c.env.DB.prepare(`UPDATE counterparty_data_requests SET status = 'submitted' WHERE id = ?`).bind(req.id).run();
  return c.json({ success: true, data: { submission_id: subId } }, 201);
});

// ─── 14. AI carbon-accountant classifier ───────────────────────────────

watershed.post('/ai/classify', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { description, amount, unit } = body;
  if (!description) return c.json({ success: false, error: 'description required' }, 400);

  // esg_emission_factors stores the rate in `factor` (per unit_in → kgCO2e)
  // and the input unit in `unit_in`.
  const factors = await c.env.DB.prepare(
    `SELECT activity_code, factor, unit_in, source, scope, scope3_category FROM esg_emission_factors LIMIT 200`
  ).all<any>();
  const factorList = (factors.results || []).map(f =>
    `${f.activity_code} (scope ${f.scope}${f.scope3_category ? ', cat ' + f.scope3_category : ''}, ${f.unit_in})`).slice(0, 80).join('\n');

  // Compose prompt
  const prompt = `You are a GHG carbon accountant. Given the spend description below, choose the best activity_code from the allowed list. Reply ONLY with a JSON object: {"activity_code": "...", "scope": 1|2|3, "scope3_category": int|null, "confidence": 0-1, "reasoning": "one sentence", "alternatives": ["code2","code3"]}.

DESCRIPTION: ${description}
AMOUNT: ${amount ?? 'unknown'} ${unit ?? ''}

ALLOWED ACTIVITY CODES:
${factorList}`;

  let aiOut: any = null, modelId = '@cf/meta/llama-3.1-8b-instruct';
  try {
    const ai: any = c.env.AI;
    const resp: any = await ai.run(modelId, { messages: [
      { role: 'system', content: 'You are a precise GHG accounting assistant. Reply only with valid JSON.' },
      { role: 'user', content: prompt },
    ] });
    const txt = String(resp?.response || resp?.result || resp || '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) aiOut = JSON.parse(m[0]);
  } catch (e: any) {
    // AI binding may be unavailable — fall back to regex spend-hints.
    aiOut = null;
  }

  if (!aiOut) {
    // Regex fallback using spend_category_hints.
    const hints = await c.env.DB.prepare(`SELECT * FROM spend_category_hints`).all<any>();
    const d = description.toLowerCase();
    let best: any = null;
    for (const h of (hints.results || [])) {
      let hit = false;
      try {
        if (h.pattern_type === 'exact') hit = d === String(h.pattern).toLowerCase();
        else if (h.pattern_type === 'regex') hit = new RegExp(h.pattern, 'i').test(d);
        else hit = d.includes(String(h.pattern).toLowerCase());
      } catch { /* invalid regex */ }
      if (hit && (!best || h.confidence > best.confidence)) {
        best = { activity_code: h.suggested_activity_code, scope: h.suggested_scope, scope3_category: h.suggested_scope3_category, confidence: h.confidence };
      }
    }
    aiOut = best
      ? { ...best, reasoning: 'Matched regex spend-hint (AI fallback).', alternatives: [] }
      : { activity_code: 'spend.services.zar', scope: 3, scope3_category: 1, confidence: 0.3, reasoning: 'No strong match — defaulted to generic purchased services.', alternatives: [] };
    modelId = 'regex-fallback';
  }

  const id = rid('aicls');
  await c.env.DB.prepare(`
    INSERT INTO ai_classification_logs (id, participant_id, input_text, input_amount, input_unit,
      model_id, suggested_activity_code, suggested_scope, suggested_scope3_category,
      confidence, reasoning, alternatives_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, description, amount ?? null, unit ?? null, modelId,
    aiOut.activity_code ?? null, aiOut.scope ?? null, aiOut.scope3_category ?? null,
    aiOut.confidence ?? null, aiOut.reasoning ?? null,
    JSON.stringify(aiOut.alternatives || [])).run();

  return c.json({ success: true, data: { id, model_id: modelId, ...aiOut } });
});

watershed.patch('/ai/classify/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE ai_classification_logs
    SET user_accepted = ?, user_override_code = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).bind(body.accepted ? 1 : 0, body.override_code ?? null, id).run();
  return c.json({ success: true });
});

watershed.get('/ai/classify', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM ai_classification_logs WHERE participant_id = ? ORDER BY created_at DESC LIMIT 100`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

// ─── 15. Marginal abatement cost curve ─────────────────────────────────

watershed.get('/macc', async (c) => {
  const user = getCurrentUser(c);
  // Reads from existing esg_initiatives + esg_decarbonisation tables and
  // returns a chart-ready MACC: sorted ascending by cost per tCO2e.
  const r = await c.env.DB.prepare(`
    SELECT id, name, category,
           abatement_tco2e_yr, capex_zar, opex_zar_yr, lifetime_years,
           marginal_abatement_cost_zar_tco2e, status
    FROM esg_initiatives
    WHERE participant_id = ? AND abatement_tco2e_yr IS NOT NULL
    ORDER BY marginal_abatement_cost_zar_tco2e ASC, abatement_tco2e_yr DESC
  `).bind(user.id).all<any>();

  // Compute cumulative abatement so the chart can render width = abatement.
  let cum = 0;
  const enriched = (r.results || []).map((row: any) => {
    const cost = row.marginal_abatement_cost_zar_tco2e ?? (row.capex_zar && row.abatement_tco2e_yr && row.lifetime_years
      ? (row.capex_zar / (row.lifetime_years * row.abatement_tco2e_yr)) + (row.opex_zar_yr / row.abatement_tco2e_yr)
      : null);
    cum += row.abatement_tco2e_yr || 0;
    return { ...row, computed_macc_zar_per_tco2e: cost, cumulative_abatement_tco2e: cum };
  });
  return c.json({ success: true, data: enriched });
});

// ─── 16. Sectoral pathway library ──────────────────────────────────────

watershed.get('/pathways', async (c) => {
  const pathway = c.req.query('pathway');
  const sector = c.req.query('sector');
  let sql = `SELECT * FROM sectoral_pathways WHERE 1=1`;
  const binds: any[] = [];
  if (pathway) { sql += ` AND pathway_code = ?`; binds.push(pathway); }
  if (sector) { sql += ` AND sector = ?`; binds.push(sector); }
  sql += ` ORDER BY pathway_code, sector, year`;
  const r = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: r.results || [] });
});

// ─── 17. Hash-chain immutable audit trail ──────────────────────────────

// Compute SHA-256 hex of a string using Web Crypto (Workers runtime).
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

watershed.post('/audit-chain/append', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { entity_table, entity_id, operation, payload } = body;
  if (!entity_table || !entity_id || !operation) {
    return c.json({ success: false, error: 'entity_table, entity_id, operation required' }, 400);
  }
  const last = await c.env.DB.prepare(
    `SELECT sequence_no, this_hash FROM audit_chain WHERE tenant_id = 'default' ORDER BY sequence_no DESC LIMIT 1`
  ).first<any>();
  const seq = (last?.sequence_no || 0) + 1;
  const prev = last?.this_hash || 'genesis';
  const payloadJson = JSON.stringify(payload || {});
  const hash = await sha256Hex(`${prev}|${entity_table}|${entity_id}|${operation}|${payloadJson}`);
  const id = rid('ach');
  await c.env.DB.prepare(`
    INSERT INTO audit_chain (id, participant_id, sequence_no, entity_table, entity_id, operation,
      actor_id, payload_json, prev_hash, this_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, seq, entity_table, entity_id, operation, user.id, payloadJson, prev, hash).run();
  return c.json({ success: true, data: { id, sequence_no: seq, this_hash: hash } }, 201);
});

watershed.get('/audit-chain', async (c) => {
  const limit = Math.min(500, Number(c.req.query('limit')) || 100);
  const r = await c.env.DB.prepare(
    `SELECT * FROM audit_chain WHERE tenant_id = 'default' ORDER BY sequence_no DESC LIMIT ?`
  ).bind(limit).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.get('/audit-chain/verify', async (c) => {
  // Walk the chain from genesis, recomputing each hash. Reports the first
  // break (or "valid" if the chain is intact).
  const r = await c.env.DB.prepare(
    `SELECT * FROM audit_chain WHERE tenant_id = 'default' ORDER BY sequence_no ASC`
  ).all<any>();
  let prev = 'genesis';
  for (const row of (r.results || [])) {
    const expected = await sha256Hex(`${prev}|${row.entity_table}|${row.entity_id}|${row.operation}|${row.payload_json}`);
    if (expected !== row.this_hash) {
      return c.json({ success: true, data: { valid: false, broken_at_sequence: row.sequence_no, entity: `${row.entity_table}/${row.entity_id}` } });
    }
    prev = row.this_hash;
  }
  return c.json({ success: true, data: { valid: true, chain_length: r.results?.length || 0 } });
});

// ─── 18. Hourly REC marketplace ────────────────────────────────────────

watershed.get('/rec-market/listings', async (c) => {
  const gridZone = c.req.query('grid_zone');
  const status = c.req.query('status') || 'listed,partial';
  const sql = `SELECT l.*, p.name AS seller_name FROM rec_hourly_listings l
               LEFT JOIN participants p ON p.id = l.seller_id
               WHERE l.status IN (${status.split(',').map(() => '?').join(',')})
               ${gridZone ? 'AND l.grid_zone = ?' : ''}
               ORDER BY l.hour_utc DESC, l.price_zar_per_kwh ASC LIMIT 200`;
  const binds = status.split(',');
  if (gridZone) binds.push(gridZone);
  const r = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: r.results || [] });
});

watershed.post('/rec-market/listings', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { technology, grid_zone, hour_utc, available_kwh, price_zar_per_kwh, certificate_ref } = body;
  if (!technology || !grid_zone || !hour_utc || !available_kwh || !price_zar_per_kwh) {
    return c.json({ success: false, error: 'technology, grid_zone, hour_utc, available_kwh, price_zar_per_kwh required' }, 400);
  }
  const id = rid('recl');
  await c.env.DB.prepare(`
    INSERT INTO rec_hourly_listings (id, seller_id, technology, grid_zone, hour_utc,
      available_kwh, remaining_kwh, price_zar_per_kwh, certificate_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, technology, grid_zone, hour_utc, available_kwh, available_kwh, price_zar_per_kwh, certificate_ref ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

watershed.post('/rec-market/buy', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { listing_id, kwh, retire, retirement_purpose } = body;
  if (!listing_id || !kwh) return c.json({ success: false, error: 'listing_id and kwh required' }, 400);

  const listing = await c.env.DB.prepare(`SELECT * FROM rec_hourly_listings WHERE id = ?`).bind(listing_id).first<any>();
  if (!listing) return c.json({ success: false, error: 'listing not found' }, 404);
  if (listing.status === 'sold_out' || listing.status === 'withdrawn') {
    return c.json({ success: false, error: `listing is ${listing.status}` }, 400);
  }
  if (kwh > (listing.remaining_kwh || 0)) {
    return c.json({ success: false, error: `only ${listing.remaining_kwh} kWh remaining` }, 400);
  }

  const total = kwh * listing.price_zar_per_kwh;
  const tradeId = rid('rect');
  await c.env.DB.prepare(`
    INSERT INTO rec_hourly_trades (id, listing_id, buyer_id, kwh, price_zar_per_kwh, total_zar,
      hour_utc, retired_at, retirement_purpose)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(tradeId, listing_id, user.id, kwh, listing.price_zar_per_kwh, total, listing.hour_utc,
    retire ? new Date().toISOString() : null, retire ? (retirement_purpose || '24/7 CFE matching') : null).run();

  const newRemaining = (listing.remaining_kwh || 0) - kwh;
  const newStatus = newRemaining <= 0 ? 'sold_out' : 'partial';
  await c.env.DB.prepare(`UPDATE rec_hourly_listings SET remaining_kwh = ?, status = ? WHERE id = ?`).bind(newRemaining, newStatus, listing_id).run();

  return c.json({ success: true, data: { trade_id: tradeId, kwh, total_zar: total, retired: !!retire } }, 201);
});

watershed.get('/rec-market/trades', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(`
    SELECT t.*, l.technology, l.grid_zone, l.certificate_ref
    FROM rec_hourly_trades t JOIN rec_hourly_listings l ON l.id = t.listing_id
    WHERE t.buyer_id = ? ORDER BY t.created_at DESC LIMIT 200
  `).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

export default watershed;
