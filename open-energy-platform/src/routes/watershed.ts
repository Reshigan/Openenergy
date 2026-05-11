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

export default watershed;
