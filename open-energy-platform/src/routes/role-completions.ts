// ═══════════════════════════════════════════════════════════════════════════
// Role-completion endpoints
//
// Closes the daily-workflow gaps in each role so the platform is the only
// tool the user needs. Grouped by role under /api/roles/<role>/<entity>.
//
//   IPP        epc-contractors, land-leases, insurance, community,
//              env-compliance, portfolio
//   Offtaker   ppa-market, demand-response, bill-validation
//   Lender     loans (origination), syndication, sll-kpis, workouts
//   Carbon     buffer-pool, due-diligence, permanence, client-attribution
//   Grid       connection-queue, frequency-response, voltage-zones,
//              network-development
//   Regulator  consultations, hearings, determinations, license-fees
//   Trader     day-ahead, intraday, pre-trade-checks, confirmations
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const roles = new Hono<HonoEnv>();
roles.use('*', authMiddleware);

const rid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Generic helper: GET list scoped to participant, ordered DESC by created_at.
async function listFor(c: any, table: string, scopeCol = 'participant_id', extraSql = ''): Promise<any[]> {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM ${table} WHERE ${scopeCol} = ? ${extraSql} ORDER BY created_at DESC LIMIT 500`
  ).bind(user.id).all();
  return r.results || [];
}

// ─── IPP ───────────────────────────────────────────────────────────────

roles.get('/ipp/epc-contractors', async (c) => c.json({ success: true, data: await listFor(c, 'epc_contractors') }));
roles.post('/ipp/epc-contractors', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.contractor_name) return c.json({ success: false, error: 'contractor_name required' }, 400);
  const id = rid('epc');
  await c.env.DB.prepare(`
    INSERT INTO epc_contractors (id, participant_id, contractor_name, registration_no, bbbee_level,
      technologies, countries_served, rating, primary_contact, primary_email, primary_phone,
      bonds_capacity_zar, insurance_capacity_zar, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.contractor_name, b.registration_no ?? null, b.bbbee_level ?? null,
    b.technologies ?? null, b.countries_served ?? null, b.rating ?? 'approved',
    b.primary_contact ?? null, b.primary_email ?? null, b.primary_phone ?? null,
    b.bonds_capacity_zar ?? null, b.insurance_capacity_zar ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/ipp/land-leases', async (c) => c.json({ success: true, data: await listFor(c, 'land_leases') }));
roles.post('/ipp/land-leases', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.property_description) return c.json({ success: false, error: 'property_description required' }, 400);
  const id = rid('lnd');
  await c.env.DB.prepare(`
    INSERT INTO land_leases (id, participant_id, project_id, property_description, erf_number, title_deed,
      landowner_name, landowner_contact, hectares, zoning, lease_start_date, lease_end_date,
      rental_zar_per_yr, escalation_pct, payment_frequency, status, consent_use_secured, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.property_description, b.erf_number ?? null, b.title_deed ?? null,
    b.landowner_name ?? null, b.landowner_contact ?? null, b.hectares ?? null, b.zoning ?? null,
    b.lease_start_date ?? null, b.lease_end_date ?? null, b.rental_zar_per_yr ?? null,
    b.escalation_pct ?? null, b.payment_frequency ?? 'annual', b.status ?? 'option',
    b.consent_use_secured ? 1 : 0, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/ipp/insurance', async (c) => c.json({ success: true, data: await listFor(c, 'insurance_policies_v2') }));
roles.post('/ipp/insurance', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.policy_type || !b.insurer_name || !b.sum_insured_zar || !b.effective_from || !b.effective_to) {
    return c.json({ success: false, error: 'policy_type, insurer_name, sum_insured_zar, effective_from, effective_to required' }, 400);
  }
  const id = rid('ins');
  await c.env.DB.prepare(`
    INSERT INTO insurance_policies_v2 (id, participant_id, project_id, policy_type, insurer_name, broker_name,
      policy_number, sum_insured_zar, premium_zar, deductible_zar, effective_from, effective_to,
      lender_endorsement, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.policy_type, b.insurer_name, b.broker_name ?? null,
    b.policy_number ?? null, b.sum_insured_zar, b.premium_zar ?? null, b.deductible_zar ?? null,
    b.effective_from, b.effective_to, b.lender_endorsement ? 1 : 0, b.status ?? 'active', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/ipp/community', async (c) => c.json({ success: true, data: await listFor(c, 'community_engagements_v2') }));
roles.post('/ipp/community', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.engagement_type || !b.engagement_date) return c.json({ success: false, error: 'engagement_type and engagement_date required' }, 400);
  const id = rid('cmm');
  await c.env.DB.prepare(`
    INSERT INTO community_engagements_v2 (id, participant_id, project_id, engagement_type, engagement_date,
      location, attendees, topic, outcome, grievance_severity, grievance_status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.engagement_type, b.engagement_date, b.location ?? null,
    b.attendees ?? null, b.topic ?? null, b.outcome ?? null,
    b.grievance_severity ?? null, b.grievance_status ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/ipp/env-compliance', async (c) => c.json({ success: true, data: await listFor(c, 'env_compliance_obligations') }));
roles.post('/ipp/env-compliance', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.obligation_type || !b.description) return c.json({ success: false, error: 'obligation_type and description required' }, 400);
  const id = rid('env');
  await c.env.DB.prepare(`
    INSERT INTO env_compliance_obligations (id, participant_id, project_id, obligation_type, source_doc,
      description, due_date, frequency, status, responsible_party, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.obligation_type, b.source_doc ?? null, b.description,
    b.due_date ?? null, b.frequency ?? null, b.status ?? 'open',
    b.responsible_party ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/ipp/portfolio', async (c) => {
  const user = getCurrentUser(c);
  // Project table name varies — ipp_projects (newer schema) used by
  // ipp-lifecycle and lender suites. Fall back to empty result if not present.
  const summary = await c.env.DB.prepare(`
    SELECT
      COUNT(DISTINCT p.id) AS project_count,
      COALESCE(SUM(p.capacity_mw), 0) AS total_capacity_mw,
      COALESCE(SUM(p.total_capex_zar), 0) AS total_capex_zar,
      SUM(CASE WHEN p.status = 'operating' THEN 1 ELSE 0 END) AS operating_count,
      SUM(CASE WHEN p.status = 'construction' THEN 1 ELSE 0 END) AS construction_count
    FROM ipp_projects p WHERE p.participant_id = ?
  `).bind(user.id).first().catch(() => ({ project_count: 0, total_capacity_mw: 0, total_capex_zar: 0, operating_count: 0, construction_count: 0 }));
  const [milestones, insurance, env, leases, community] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ipp_milestones m JOIN ipp_projects p ON p.id = m.project_id WHERE p.participant_id = ? AND m.status = 'completed'`).bind(user.id).first().catch(() => ({ n: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) AS n, SUM(sum_insured_zar) AS total FROM insurance_policies_v2 WHERE participant_id = ? AND status = 'active'`).bind(user.id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM env_compliance_obligations WHERE participant_id = ? AND status IN ('open','in_progress')`).bind(user.id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM land_leases WHERE participant_id = ? AND status IN ('signed','active')`).bind(user.id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM community_engagements_v2 WHERE participant_id = ? AND engagement_date >= date('now','-90 days')`).bind(user.id).first(),
  ]);
  return c.json({ success: true, data: {
    summary, milestones_completed: (milestones as any)?.n || 0, insurance, env_open: (env as any)?.n || 0,
    leases_active: (leases as any)?.n || 0, community_last90: (community as any)?.n || 0,
  }});
});

// ─── IPP full project lifecycle (migration 046) ────────────────────────

// Pre-development
roles.get('/ipp/sites', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_site_assessments') }));
roles.post('/ipp/sites', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.site_name) return c.json({ success: false, error: 'site_name required' }, 400);
  // Auto-suggest preliminary LCOE if enough inputs given. Utility-scale
  // PV typically yields ≈ GHI × performance_ratio × DC/AC ratio MWh per MW:
  //   Karoo GHI 2280 × 0.83 PR × 1.25 DC/AC ≈ 2365 MWh/MW/yr
  // So we use a factor of ~1.04 (= 0.83 × 1.25) for the rough conversion.
  let lcoe = b.preliminary_lcoe_zar_per_mwh;
  if (!lcoe && b.capex_estimate_zar_per_mw && b.ghi_kwh_per_m2_yr) {
    const annualMWhPerMW = b.ghi_kwh_per_m2_yr * 1.04;          // MWh per MW per yr
    const life = 25;
    const opexPerMWyr = b.capex_estimate_zar_per_mw * 0.02;     // assume 2% opex
    const totalCost = b.capex_estimate_zar_per_mw + opexPerMWyr * life;
    const totalMWh = annualMWhPerMW * life;
    lcoe = totalCost / totalMWh;                                 // ZAR per MWh
  }
  const id = rid('site');
  await c.env.DB.prepare(`
    INSERT INTO ipp_site_assessments (id, participant_id, site_name, lat, lng, province, technology,
      hectares, grid_distance_km, nearest_substation, substation_capacity_mw, ghi_kwh_per_m2_yr,
      dni_kwh_per_m2_yr, avg_wind_speed_ms, wind_class, capex_estimate_zar_per_mw,
      preliminary_lcoe_zar_per_mwh, go_decision, rating_score, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.site_name, b.lat ?? null, b.lng ?? null, b.province ?? null,
    b.technology ?? null, b.hectares ?? null, b.grid_distance_km ?? null,
    b.nearest_substation ?? null, b.substation_capacity_mw ?? null,
    b.ghi_kwh_per_m2_yr ?? null, b.dni_kwh_per_m2_yr ?? null,
    b.avg_wind_speed_ms ?? null, b.wind_class ?? null,
    b.capex_estimate_zar_per_mw ?? null, lcoe ?? null,
    b.go_decision ?? null, b.rating_score ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, preliminary_lcoe_zar_per_mwh: lcoe } }, 201);
});

roles.get('/ipp/resource-campaigns', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_resource_campaigns') }));
roles.post('/ipp/resource-campaigns', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.campaign_name || !b.campaign_type || !b.start_date) {
    return c.json({ success: false, error: 'campaign_name, campaign_type, start_date required' }, 400);
  }
  const id = rid('rsc');
  await c.env.DB.prepare(`
    INSERT INTO ipp_resource_campaigns (id, participant_id, site_assessment_id, campaign_name, campaign_type,
      start_date, end_date, installed_height_m, data_recovery_pct, raw_data_r2_key, status, vendor, cost_zar, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.site_assessment_id ?? null, b.campaign_name, b.campaign_type,
    b.start_date, b.end_date ?? null, b.installed_height_m ?? null,
    b.data_recovery_pct ?? null, b.raw_data_r2_key ?? null,
    b.status ?? 'planning', b.vendor ?? null, b.cost_zar ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/ipp/yield-estimates', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_yield_estimates') }));
roles.post('/ipp/yield-estimates', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.capacity_mw || !b.p50_gwh_yr) {
    return c.json({ success: false, error: 'capacity_mw and p50_gwh_yr required' }, 400);
  }
  // Auto-derive capacity factor + P75/P90 if not provided
  const cf = b.net_capacity_factor ?? (b.p50_gwh_yr * 1000 / (b.capacity_mw * 8760));
  const p75 = b.p75_gwh_yr ?? b.p50_gwh_yr * 0.93;
  const p90 = b.p90_gwh_yr ?? b.p50_gwh_yr * 0.88;
  const id = rid('yie');
  await c.env.DB.prepare(`
    INSERT INTO ipp_yield_estimates (id, participant_id, site_assessment_id, project_id, estimate_round,
      capacity_mw, p50_gwh_yr, p75_gwh_yr, p90_gwh_yr, net_capacity_factor, module_or_turbine,
      inverter_or_converter, module_count, turbine_count, pr_or_availability, losses_pct,
      long_term_correction_pct, software, software_version, report_r2_key, status, certified_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.site_assessment_id ?? null, b.project_id ?? null, b.estimate_round ?? 1,
    b.capacity_mw, b.p50_gwh_yr, p75, p90, cf, b.module_or_turbine ?? null,
    b.inverter_or_converter ?? null, b.module_count ?? null, b.turbine_count ?? null,
    b.pr_or_availability ?? null, b.losses_pct ?? null, b.long_term_correction_pct ?? null,
    b.software ?? null, b.software_version ?? null, b.report_r2_key ?? null,
    b.status ?? 'preliminary', b.certified_by ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, p75_gwh_yr: p75, p90_gwh_yr: p90, net_capacity_factor: cf } }, 201);
});

// Development
roles.get('/ipp/financial-models', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_financial_models') }));
roles.post('/ipp/financial-models', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.model_version || !b.capacity_mw || !b.capex_zar) {
    return c.json({ success: false, error: 'model_version, capacity_mw, capex_zar required' }, 400);
  }
  // Compute LCOE + IRR + NPV + payback if enough inputs supplied.
  let lcoe = null, irr = null, npv = null, payback = null;
  const life = b.operating_life_yrs ?? 25;
  const opex = b.opex_zar_yr ?? (b.capex_zar * 0.02);
  const yieldId = b.yield_estimate_id;
  let p50Gwh = b.p50_gwh_yr;
  if (yieldId && !p50Gwh) {
    const y = await c.env.DB.prepare(`SELECT p50_gwh_yr FROM ipp_yield_estimates WHERE id = ?`).bind(yieldId).first<any>();
    p50Gwh = y?.p50_gwh_yr || (b.capacity_mw * 8760 * 0.27 / 1000);
  } else if (!p50Gwh) {
    p50Gwh = b.capacity_mw * 8760 * 0.27 / 1000;
  }
  const annualMWh = p50Gwh * 1000;
  if (b.ppa_tariff_zar_mwh) {
    const annualRev = annualMWh * b.ppa_tariff_zar_mwh;
    const annualCash = annualRev - opex;
    // LCOE = (capex + sum(opex / (1+r)^t)) / sum(MWh / (1+r)^t). Use 10% real discount.
    const r = 0.10;
    let pvCost = b.capex_zar, pvMwh = 0;
    for (let t = 1; t <= life; t++) { pvCost += opex / Math.pow(1 + r, t); pvMwh += annualMWh / Math.pow(1 + r, t); }
    lcoe = pvCost / pvMwh;
    // Simple IRR approximation: average cash flow / capex × 100
    irr = annualCash > 0 ? (annualCash / b.capex_zar) * 100 : null;
    npv = -b.capex_zar + annualCash * (1 - Math.pow(1 + r, -life)) / r;
    payback = annualCash > 0 ? b.capex_zar / annualCash : null;
  }
  const id = rid('fm');
  await c.env.DB.prepare(`
    INSERT INTO ipp_financial_models (id, participant_id, project_id, model_version, yield_estimate_id,
      capacity_mw, capex_zar, opex_zar_yr, ppa_tariff_zar_mwh, tariff_escalation_pct, operating_life_yrs,
      debt_ratio_pct, debt_tenor_yrs, interest_rate_pct, tax_rate_pct, lcoe_zar_per_mwh, project_irr_pct,
      equity_irr_pct, npv_zar, payback_years, min_dscr, avg_dscr, scenario_set_json, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.model_version, yieldId ?? null,
    b.capacity_mw, b.capex_zar, opex, b.ppa_tariff_zar_mwh ?? null,
    b.tariff_escalation_pct ?? 0, life, b.debt_ratio_pct ?? 70,
    b.debt_tenor_yrs ?? null, b.interest_rate_pct ?? null, b.tax_rate_pct ?? 27,
    lcoe, irr, b.equity_irr_pct ?? null, npv, payback,
    b.min_dscr ?? null, b.avg_dscr ?? null,
    b.scenario_set_json ? JSON.stringify(b.scenario_set_json) : null,
    b.status ?? 'draft', b.notes ?? null).run();
  return c.json({ success: true, data: {
    id, lcoe_zar_per_mwh: lcoe, project_irr_pct: irr, npv_zar: npv, payback_years: payback,
  }}, 201);
});

roles.get('/ipp/tenders', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_tenders') }));
roles.post('/ipp/tenders', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.tender_name || !b.tender_type) return c.json({ success: false, error: 'tender_name and tender_type required' }, 400);
  const id = rid('tnd');
  await c.env.DB.prepare(`
    INSERT INTO ipp_tenders (id, participant_id, project_id, tender_name, tender_type, scope,
      issued_at, closing_at, expected_award_zar, evaluation_criteria, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.tender_name, b.tender_type, b.scope ?? null,
    b.issued_at ?? null, b.closing_at ?? null, b.expected_award_zar ?? null,
    b.evaluation_criteria ? JSON.stringify(b.evaluation_criteria) : null,
    b.status ?? 'drafting', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.post('/ipp/tenders/:id/bidders', async (c) => {
  const { id } = c.req.param();
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.bidder_name) return c.json({ success: false, error: 'bidder_name required' }, 400);
  // Compute weighted total: 50% commercial, 30% technical, 10% BBBEE, 10% experience.
  const tot = (b.commercial_score ?? 0) * 0.5 + (b.technical_score ?? 0) * 0.3 +
              (b.bbbee_score ?? 0) * 0.1 + (b.experience_score ?? 0) * 0.1;
  const bid = rid('bdr');
  await c.env.DB.prepare(`
    INSERT INTO ipp_tender_bidders (id, tender_id, bidder_name, contractor_id, bid_amount_zar,
      bid_tenor_years, bid_warranties_years, technical_score, commercial_score, bbbee_score,
      experience_score, total_score, rank, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(bid, id, b.bidder_name, b.contractor_id ?? null, b.bid_amount_zar ?? null,
    b.bid_tenor_years ?? null, b.bid_warranties_years ?? null,
    b.technical_score ?? null, b.commercial_score ?? null, b.bbbee_score ?? null,
    b.experience_score ?? null, tot, b.rank ?? null,
    b.status ?? 'submitted', b.notes ?? null).run();
  return c.json({ success: true, data: { id: bid, total_score: tot } }, 201);
});

roles.get('/ipp/tenders/:id/bidders', async (c) => {
  const { id } = c.req.param();
  const r = await c.env.DB.prepare(`SELECT * FROM ipp_tender_bidders WHERE tender_id = ? ORDER BY total_score DESC`).bind(id).all();
  return c.json({ success: true, data: r.results || [] });
});

roles.get('/ipp/permits', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_permits') }));
roles.post('/ipp/permits', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.permit_type) return c.json({ success: false, error: 'permit_type required' }, 400);
  const id = rid('per');
  await c.env.DB.prepare(`
    INSERT INTO ipp_permits (id, participant_id, project_id, permit_type, application_no, authority,
      applied_at, expected_decision_at, decided_at, outcome, conditions, valid_from, valid_to,
      document_r2_key, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.permit_type, b.application_no ?? null,
    b.authority ?? null, b.applied_at ?? null, b.expected_decision_at ?? null,
    b.decided_at ?? null, b.outcome ?? 'pending', b.conditions ?? null,
    b.valid_from ?? null, b.valid_to ?? null, b.document_r2_key ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/ipp/info-memorandums', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_info_memorandums') }));
roles.post('/ipp/info-memorandums', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.im_version || !b.im_title) return c.json({ success: false, error: 'im_version and im_title required' }, 400);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x => x.toString(16).padStart(2, '0')).join('');
  const id = rid('im');
  await c.env.DB.prepare(`
    INSERT INTO ipp_info_memorandums (id, participant_id, project_id, im_version, im_title,
      executive_summary, project_description, capacity_mw, capex_zar, funding_requested_zar,
      ppa_summary, yield_estimate_id, financial_model_id, prepared_by, shared_with_lenders,
      share_link_token, status, document_r2_key, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.im_version, b.im_title,
    b.executive_summary ?? null, b.project_description ?? null, b.capacity_mw ?? null,
    b.capex_zar ?? null, b.funding_requested_zar ?? null, b.ppa_summary ?? null,
    b.yield_estimate_id ?? null, b.financial_model_id ?? null, b.prepared_by ?? null,
    b.shared_with_lenders ? JSON.stringify(b.shared_with_lenders) : null,
    token, b.status ?? 'drafting', b.document_r2_key ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, share_link_token: token, share_url: `/portal/im/${token}` } }, 201);
});

roles.get('/ipp/drawdowns', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_drawdown_requests') }));
roles.post('/ipp/drawdowns', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.requested_amount_zar) return c.json({ success: false, error: 'requested_amount_zar required' }, 400);
  // Auto-number per loan: last drawdown_no + 1
  let ddNo = b.drawdown_no;
  if (!ddNo && b.loan_id) {
    const last = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(drawdown_no), 0) AS n FROM ipp_drawdown_requests WHERE loan_id = ?`
    ).bind(b.loan_id).first<any>();
    ddNo = (last?.n || 0) + 1;
  } else if (!ddNo) {
    ddNo = 1;
  }
  const id = rid('dd');
  await c.env.DB.prepare(`
    INSERT INTO ipp_drawdown_requests (id, participant_id, project_id, loan_id, drawdown_no,
      requested_amount_zar, purpose, supporting_invoices_r2_key, ie_cert_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.loan_id ?? null, ddNo,
    b.requested_amount_zar, b.purpose ?? null, b.supporting_invoices_r2_key ?? null,
    b.ie_cert_id ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, drawdown_no: ddNo } }, 201);
});

roles.patch('/ipp/drawdowns/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const b = await c.req.json().catch(() => ({} as any));
  const sets: string[] = []; const binds: any[] = [];
  for (const k of ['status','approved_amount_zar','approved_at','approved_by',
                   'disbursed_amount_zar','disbursed_at','rejection_reason','notes']) {
    if (b[k] !== undefined) { sets.push(`${k} = ?`); binds.push(b[k]); }
  }
  if (b.status === 'approved' && b.approved_at === undefined) { sets.push(`approved_at = datetime('now')`); }
  if (b.status === 'disbursed' && b.disbursed_at === undefined) { sets.push(`disbursed_at = datetime('now')`); }
  if (!sets.length) return c.json({ success: false, error: 'no fields to update' }, 400);
  binds.push(id, user.id);
  await c.env.DB.prepare(`UPDATE ipp_drawdown_requests SET ${sets.join(', ')} WHERE id = ? AND participant_id = ?`).bind(...binds).run();
  return c.json({ success: true });
});

// Construction → Operation
roles.get('/ipp/commissioning', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_commissioning_tests') }));
roles.post('/ipp/commissioning', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.test_phase || !b.test_name) return c.json({ success: false, error: 'test_phase and test_name required' }, 400);
  const id = rid('com');
  await c.env.DB.prepare(`
    INSERT INTO ipp_commissioning_tests (id, participant_id, project_id, test_phase, test_name,
      test_code, scheduled_at, executed_at, witnesses, pass_fail, measured_value, target_value,
      unit, evidence_r2_key, punch_list_items, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.test_phase, b.test_name, b.test_code ?? null,
    b.scheduled_at ?? null, b.executed_at ?? null, b.witnesses ?? null,
    b.pass_fail ?? null, b.measured_value ?? null, b.target_value ?? null, b.unit ?? null,
    b.evidence_r2_key ?? null,
    b.punch_list_items ? JSON.stringify(b.punch_list_items) : null,
    b.status ?? 'scheduled', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/ipp/nominations', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_nominations') }));
roles.post('/ipp/nominations', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.delivery_date || !b.nomination_type || !b.hourly_mwh) {
    return c.json({ success: false, error: 'delivery_date, nomination_type, hourly_mwh required' }, 400);
  }
  // Accept array or object indexed 0..23 of MWh
  const arr = Array.isArray(b.hourly_mwh) ? b.hourly_mwh : Array.from({ length: 24 }, (_, i) => b.hourly_mwh[i] ?? 0);
  if (arr.length !== 24) return c.json({ success: false, error: 'hourly_mwh must be 24 values' }, 400);
  const total = arr.reduce((s: number, v: number) => s + (v || 0), 0);
  const id = rid('nom');
  await c.env.DB.prepare(`
    INSERT INTO ipp_nominations (id, participant_id, project_id, delivery_date, nomination_type,
      hourly_mwh_json, total_mwh, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.delivery_date, b.nomination_type,
    JSON.stringify(arr), total, b.status ?? 'submitted', b.notes ?? null).run();
  return c.json({ success: true, data: { id, total_mwh: total } }, 201);
});

roles.get('/ipp/work-orders', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_work_orders') }));
roles.post('/ipp/work-orders', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.wo_type) return c.json({ success: false, error: 'wo_type required' }, 400);
  const total = (b.labour_cost_zar || 0) + (b.parts_cost_zar || 0) + (b.external_cost_zar || 0);
  const id = rid('wo');
  await c.env.DB.prepare(`
    INSERT INTO ipp_work_orders (id, participant_id, project_id, wo_number, wo_type, asset_id,
      asset_descr, failure_mode, priority, scheduled_start, scheduled_end, actual_start, actual_end,
      downtime_hours, energy_loss_mwh, labour_hours, labour_cost_zar, parts_cost_zar,
      external_cost_zar, total_cost_zar, technicians, status, root_cause, corrective_action, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.wo_number ?? null, b.wo_type, b.asset_id ?? null,
    b.asset_descr ?? null, b.failure_mode ?? null, b.priority ?? 'medium',
    b.scheduled_start ?? null, b.scheduled_end ?? null, b.actual_start ?? null, b.actual_end ?? null,
    b.downtime_hours ?? null, b.energy_loss_mwh ?? null,
    b.labour_hours ?? null, b.labour_cost_zar ?? null, b.parts_cost_zar ?? null,
    b.external_cost_zar ?? null, total, b.technicians ?? null, b.status ?? 'open',
    b.root_cause ?? null, b.corrective_action ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, total_cost_zar: total } }, 201);
});

roles.get('/ipp/spares', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_spares_inventory') }));
roles.post('/ipp/spares', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.description) return c.json({ success: false, error: 'description required' }, 400);
  // Auto-status based on on_hand vs reorder_point
  let status = b.status;
  if (!status && b.on_hand_qty !== undefined && b.reorder_point !== undefined) {
    if (b.on_hand_qty <= 0) status = 'out_of_stock';
    else if (b.on_hand_qty <= b.reorder_point) status = 'low_stock';
    else status = 'in_stock';
  }
  const id = rid('spr');
  await c.env.DB.prepare(`
    INSERT INTO ipp_spares_inventory (id, participant_id, project_id, part_number, description,
      manufacturer, category, location, unit_of_measure, on_hand_qty, reorder_point, reorder_qty,
      unit_cost_zar, last_received_at, last_issued_at, shelf_life_months, warranty_until, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.part_number ?? null, b.description,
    b.manufacturer ?? null, b.category ?? null, b.location ?? null, b.unit_of_measure ?? null,
    b.on_hand_qty ?? 0, b.reorder_point ?? null, b.reorder_qty ?? null,
    b.unit_cost_zar ?? null, b.last_received_at ?? null, b.last_issued_at ?? null,
    b.shelf_life_months ?? null, b.warranty_until ?? null,
    status ?? 'in_stock', b.notes ?? null).run();
  return c.json({ success: true, data: { id, status } }, 201);
});

roles.get('/ipp/decommissioning', async (c) => c.json({ success: true, data: await listFor(c, 'ipp_decommissioning_plans') }));
roles.post('/ipp/decommissioning', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.plan_version || !b.strategy) return c.json({ success: false, error: 'plan_version and strategy required' }, 400);
  const id = rid('dec');
  await c.env.DB.prepare(`
    INSERT INTO ipp_decommissioning_plans (id, participant_id, project_id, plan_version, strategy,
      expected_eol_date, estimated_decom_cost_zar, decom_provision_zar, module_residual_zar,
      steel_residual_zar, inverter_residual_zar, bess_residual_zar, recycling_partner,
      rehab_obligations, status, approved_by, approved_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.plan_version, b.strategy,
    b.expected_eol_date ?? null, b.estimated_decom_cost_zar ?? null,
    b.decom_provision_zar ?? null, b.module_residual_zar ?? null,
    b.steel_residual_zar ?? null, b.inverter_residual_zar ?? null, b.bess_residual_zar ?? null,
    b.recycling_partner ?? null, b.rehab_obligations ?? null, b.status ?? 'planning',
    b.approved_by ?? null, b.approved_at ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

// ─── Offtaker ──────────────────────────────────────────────────────────

roles.get('/offtaker/ppa-market', async (c) => {
  const status = c.req.query('status') || 'listed';
  const r = await c.env.DB.prepare(`SELECT * FROM ppa_marketplace_listings WHERE status = ? ORDER BY created_at DESC LIMIT 200`).bind(status).all();
  return c.json({ success: true, data: r.results || [] });
});

roles.post('/offtaker/ppa-market', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.listing_type || !b.technology || !b.capacity_mw || !b.ppa_term_years) {
    return c.json({ success: false, error: 'listing_type, technology, capacity_mw, ppa_term_years required' }, 400);
  }
  const id = rid('ppal');
  await c.env.DB.prepare(`
    INSERT INTO ppa_marketplace_listings (id, seller_id, listing_type, technology, capacity_mw,
      expected_p50_gwh_yr, ppa_term_years, price_zar_per_mwh, price_floor_zar, price_ceiling_zar,
      delivery_point, delivery_grid_zone, start_date, green_attributes, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.listing_type, b.technology, b.capacity_mw, b.expected_p50_gwh_yr ?? null,
    b.ppa_term_years, b.price_zar_per_mwh ?? null, b.price_floor_zar ?? null, b.price_ceiling_zar ?? null,
    b.delivery_point ?? null, b.delivery_grid_zone ?? null, b.start_date ?? null,
    b.green_attributes ?? null, b.description ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.post('/offtaker/ppa-market/:id/offer', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.offered_price_zar_per_mwh || !b.offered_volume_gwh_yr) {
    return c.json({ success: false, error: 'offered_price_zar_per_mwh and offered_volume_gwh_yr required' }, 400);
  }
  const oid = rid('ppao');
  await c.env.DB.prepare(`
    INSERT INTO ppa_marketplace_offers (id, listing_id, bidder_id, offered_price_zar_per_mwh,
      offered_volume_gwh_yr, offered_term_years, conditions, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(oid, id, user.id, b.offered_price_zar_per_mwh, b.offered_volume_gwh_yr,
    b.offered_term_years ?? null, b.conditions ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id: oid } }, 201);
});

roles.get('/offtaker/demand-response/programs', async (c) => c.json({ success: true, data: await listFor(c, 'demand_response_programs') }));
roles.post('/offtaker/demand-response/programs', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.program_name || !b.program_type || !b.baseline_load_mw || !b.reducible_load_mw) {
    return c.json({ success: false, error: 'program_name, program_type, baseline_load_mw, reducible_load_mw required' }, 400);
  }
  const id = rid('drp');
  await c.env.DB.prepare(`
    INSERT INTO demand_response_programs (id, participant_id, program_name, program_type, baseline_load_mw,
      reducible_load_mw, notice_period_minutes, recovery_period_minutes, compensation_zar_per_mwh,
      max_events_per_month, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.program_name, b.program_type, b.baseline_load_mw, b.reducible_load_mw,
    b.notice_period_minutes ?? null, b.recovery_period_minutes ?? null,
    b.compensation_zar_per_mwh ?? null, b.max_events_per_month ?? null,
    b.status ?? 'enrolled', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/offtaker/demand-response/events', async (c) => c.json({ success: true, data: await listFor(c, 'demand_response_events') }));
roles.post('/offtaker/demand-response/events', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.program_id || !b.event_start || !b.event_end) {
    return c.json({ success: false, error: 'program_id, event_start, event_end required' }, 400);
  }
  const id = rid('dre');
  const pct = b.delivered_load_mw && b.called_load_mw ? (b.delivered_load_mw / b.called_load_mw) * 100 : null;
  await c.env.DB.prepare(`
    INSERT INTO demand_response_events (id, program_id, participant_id, event_start, event_end,
      called_load_mw, delivered_load_mw, compensation_zar, performance_pct, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.program_id, user.id, b.event_start, b.event_end,
    b.called_load_mw ?? null, b.delivered_load_mw ?? null,
    b.compensation_zar ?? null, pct, b.status ?? 'scheduled', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/offtaker/bill-validations', async (c) => c.json({ success: true, data: await listFor(c, 'utility_bill_validations') }));
roles.post('/offtaker/bill-validations', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.supplier || !b.reading_month) return c.json({ success: false, error: 'supplier and reading_month required' }, 400);
  const id = rid('bv');
  const var_k = (b.metered_kwh || 0) - (b.billed_kwh || 0);
  const var_z = (b.expected_amount_zar || 0) - (b.billed_amount_zar || 0);
  await c.env.DB.prepare(`
    INSERT INTO utility_bill_validations (id, participant_id, supplier, account_number, reading_month,
      billed_kwh, billed_amount_zar, metered_kwh, expected_amount_zar, variance_kwh, variance_zar,
      status, dispute_reference, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.supplier, b.account_number ?? null, b.reading_month,
    b.billed_kwh ?? null, b.billed_amount_zar ?? null, b.metered_kwh ?? null,
    b.expected_amount_zar ?? null, var_k, var_z, b.status ?? 'pending',
    b.dispute_reference ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, variance_kwh: var_k, variance_zar: var_z } }, 201);
});

// ─── Lender ────────────────────────────────────────────────────────────

roles.get('/lender/loans', async (c) => c.json({ success: true, data: await listFor(c, 'loan_originations') }));
roles.post('/lender/loans', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.borrower_name || !b.facility_type || !b.proposed_amount_zar) {
    return c.json({ success: false, error: 'borrower_name, facility_type, proposed_amount_zar required' }, 400);
  }
  const id = rid('loan');
  await c.env.DB.prepare(`
    INSERT INTO loan_originations (id, participant_id, borrower_id, borrower_name, project_id,
      facility_type, proposed_amount_zar, proposed_tenor_years, proposed_margin_bps, reference_rate,
      stage, expected_close_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.borrower_id ?? null, b.borrower_name, b.project_id ?? null,
    b.facility_type, b.proposed_amount_zar, b.proposed_tenor_years ?? null,
    b.proposed_margin_bps ?? null, b.reference_rate ?? null, b.stage ?? 'pipeline',
    b.expected_close_date ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.patch('/lender/loans/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const b = await c.req.json().catch(() => ({} as any));
  const sets: string[] = []; const binds: any[] = [];
  for (const k of ['stage','credit_committee_date','credit_committee_outcome','conditions_precedent',
                   'expected_close_date','actual_close_date','notes']) {
    if (b[k] !== undefined) { sets.push(`${k} = ?`); binds.push(b[k]); }
  }
  if (!sets.length) return c.json({ success: false, error: 'no fields to update' }, 400);
  binds.push(id, user.id);
  await c.env.DB.prepare(`UPDATE loan_originations SET ${sets.join(', ')} WHERE id = ? AND participant_id = ?`).bind(...binds).run();
  return c.json({ success: true });
});

roles.get('/lender/syndication', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(`
    SELECT s.*, l.borrower_name, l.facility_type, l.proposed_amount_zar
    FROM syndication_participants s JOIN loan_originations l ON l.id = s.loan_id
    WHERE l.participant_id = ? ORDER BY s.created_at DESC LIMIT 200
  `).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});

roles.post('/lender/syndication', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.loan_id || !b.participant_name || !b.commitment_zar) {
    return c.json({ success: false, error: 'loan_id, participant_name, commitment_zar required' }, 400);
  }
  const id = rid('syn');
  await c.env.DB.prepare(`
    INSERT INTO syndication_participants (id, loan_id, participant_lender_id, participant_name,
      commitment_zar, participation_pct, role, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.loan_id, b.participant_lender_id ?? null, b.participant_name, b.commitment_zar,
    b.participation_pct ?? null, b.role ?? 'participant', b.status ?? 'invited', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/lender/sll-kpis', async (c) => c.json({ success: true, data: await listFor(c, 'sll_kpis') }));
roles.post('/lender/sll-kpis', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.kpi_name || !b.kpi_type || b.target_value === undefined) {
    return c.json({ success: false, error: 'kpi_name, kpi_type, target_value required' }, 400);
  }
  const id = rid('sllk');
  // Auto-judge status: directional comparison depending on the KPI type.
  // KPIs where LOWER is better: emissions_intensity, water_intensity,
  // safety_ltifr, bbbee_level (level 1 is best).
  // KPIs where HIGHER is better: renewable_pct, jobs_created, sbti_target.
  let status = b.status || 'pending';
  if (b.current_value !== undefined && b.current_value !== null) {
    const lowerIsBetter = ['emissions_intensity','water_intensity','safety_ltifr','bbbee_level'].includes(b.kpi_type);
    const met = lowerIsBetter ? (b.current_value <= b.target_value) : (b.current_value >= b.target_value);
    status = met ? 'met' : 'missed';
  }
  await c.env.DB.prepare(`
    INSERT INTO sll_kpis (id, loan_id, participant_id, kpi_name, kpi_type, baseline_value, target_value,
      observation_period, margin_step_up_bps, margin_step_down_bps, current_value, status,
      reporting_year, assured_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.loan_id ?? null, user.id, b.kpi_name, b.kpi_type, b.baseline_value ?? null, b.target_value,
    b.observation_period ?? 'annual', b.margin_step_up_bps ?? 0, b.margin_step_down_bps ?? 0,
    b.current_value ?? null, status, b.reporting_year ?? null, b.assured_by ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, status } }, 201);
});

roles.get('/lender/workouts', async (c) => c.json({ success: true, data: await listFor(c, 'loan_workouts') }));
roles.post('/lender/workouts', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.loan_id || !b.workout_type) return c.json({ success: false, error: 'loan_id and workout_type required' }, 400);
  const id = rid('wo');
  await c.env.DB.prepare(`
    INSERT INTO loan_workouts (id, loan_id, participant_id, workout_type, trigger_event,
      exposure_at_default_zar, expected_recovery_zar, loss_given_default_pct, status, legal_counsel, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.loan_id, user.id, b.workout_type, b.trigger_event ?? null,
    b.exposure_at_default_zar ?? null, b.expected_recovery_zar ?? null,
    b.loss_given_default_pct ?? null, b.status ?? 'open', b.legal_counsel ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

// ─── Carbon Fund ───────────────────────────────────────────────────────

roles.get('/carbon/buffer-pool', async (c) => c.json({ success: true, data: await listFor(c, 'cdr_buffer_pool') }));
roles.post('/carbon/buffer-pool', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.project_id || !b.total_contributed_tco2e || b.buffer_pct === undefined) {
    return c.json({ success: false, error: 'project_id, total_contributed_tco2e, buffer_pct required' }, 400);
  }
  const id = rid('buf');
  await c.env.DB.prepare(`
    INSERT INTO cdr_buffer_pool (id, participant_id, project_id, total_contributed_tco2e,
      reserved_tco2e, buffer_pct, release_schedule, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id, b.total_contributed_tco2e,
    b.reserved_tco2e ?? b.total_contributed_tco2e, b.buffer_pct,
    b.release_schedule ? JSON.stringify(b.release_schedule) : null,
    b.reason ?? null, b.status ?? 'active').run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/carbon/due-diligence', async (c) => c.json({ success: true, data: await listFor(c, 'cdr_due_diligence') }));
roles.post('/carbon/due-diligence', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.project_id || !b.dd_step) return c.json({ success: false, error: 'project_id and dd_step required' }, 400);
  const id = rid('dd');
  await c.env.DB.prepare(`
    INSERT INTO cdr_due_diligence (id, participant_id, project_id, dd_step, reviewer, outcome,
      conditions, rating_score, completed_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id, b.dd_step, b.reviewer ?? null, b.outcome ?? null,
    b.conditions ?? null, b.rating_score ?? null, b.completed_at ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/carbon/permanence', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM permanence_monitoring ORDER BY observation_date DESC LIMIT 500`).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/carbon/permanence', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.project_id || !b.observation_date || !b.reporting_year || b.stored_tco2e === undefined) {
    return c.json({ success: false, error: 'project_id, observation_date, reporting_year, stored_tco2e required' }, 400);
  }
  const id = rid('perm');
  await c.env.DB.prepare(`
    INSERT INTO permanence_monitoring (id, project_id, observation_date, reporting_year, stored_tco2e,
      reversal_tco2e, reversal_cause, monitoring_method, attestation, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.project_id, b.observation_date, b.reporting_year, b.stored_tco2e,
    b.reversal_tco2e ?? 0, b.reversal_cause ?? null,
    b.monitoring_method ?? null, b.attestation ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/carbon/client-attribution', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM cdr_client_attribution WHERE fund_participant_id = ? ORDER BY created_at DESC LIMIT 500`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/carbon/client-attribution', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.client_name || !b.retirement_id || !b.attributed_tco2e || !b.reporting_year) {
    return c.json({ success: false, error: 'client_name, retirement_id, attributed_tco2e, reporting_year required' }, 400);
  }
  const id = rid('cca');
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x => x.toString(16).padStart(2, '0')).join('');
  await c.env.DB.prepare(`
    INSERT INTO cdr_client_attribution (id, fund_participant_id, client_participant_id, client_name,
      retirement_id, attributed_tco2e, reporting_year, proof_of_offset_url, share_token, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.client_participant_id ?? null, b.client_name, b.retirement_id,
    b.attributed_tco2e, b.reporting_year, b.proof_of_offset_url ?? `/portal/offset/${token}`,
    token, b.notes ?? null).run();
  return c.json({ success: true, data: { id, share_token: token } }, 201);
});

// ─── Grid Operator ─────────────────────────────────────────────────────

roles.get('/grid/connection-queue', async (c) => c.json({ success: true, data: await listFor(c, 'connection_queue') }));
roles.post('/grid/connection-queue', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.applicant_name || !b.capacity_mw || !b.request_date) {
    return c.json({ success: false, error: 'applicant_name, capacity_mw, request_date required' }, 400);
  }
  const id = rid('cq');
  // Auto-assign queue position
  const last = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(queue_position), 0) AS last_pos FROM connection_queue WHERE participant_id = ?`
  ).bind(user.id).first<any>();
  const pos = (last?.last_pos || 0) + 1;
  await c.env.DB.prepare(`
    INSERT INTO connection_queue (id, participant_id, applicant_name, applicant_participant_id,
      application_no, project_name, capacity_mw, technology, request_voltage_kv, connection_point,
      grid_zone, queue_position, request_date, budget_quote_zar, status, expected_energised, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.applicant_name, b.applicant_participant_id ?? null, b.application_no ?? null,
    b.project_name ?? null, b.capacity_mw, b.technology ?? null, b.request_voltage_kv ?? null,
    b.connection_point ?? null, b.grid_zone ?? null, pos, b.request_date,
    b.budget_quote_zar ?? null, b.status ?? 'submitted',
    b.expected_energised ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, queue_position: pos } }, 201);
});

roles.get('/grid/frequency-response/markets', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM frequency_response_markets ORDER BY product_window_start DESC LIMIT 100`).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/grid/frequency-response/markets', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.market_type || !b.product_window_start || !b.product_window_end || !b.required_mw) {
    return c.json({ success: false, error: 'market_type, product_window_start, product_window_end, required_mw required' }, 400);
  }
  const id = rid('frm');
  await c.env.DB.prepare(`
    INSERT INTO frequency_response_markets (id, market_type, product_window_start, product_window_end,
      required_mw, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.market_type, b.product_window_start, b.product_window_end, b.required_mw,
    b.status ?? 'open', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.post('/grid/frequency-response/markets/:id/offer', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.offered_mw || !b.offered_price_zar_per_mw_per_h) {
    return c.json({ success: false, error: 'offered_mw and offered_price_zar_per_mw_per_h required' }, 400);
  }
  const oid = rid('fro');
  await c.env.DB.prepare(`
    INSERT INTO frequency_response_offers (id, market_id, bidder_id, offered_mw, offered_price_zar_per_mw_per_h)
    VALUES (?, ?, ?, ?, ?)
  `).bind(oid, id, user.id, b.offered_mw, b.offered_price_zar_per_mw_per_h).run();
  return c.json({ success: true, data: { id: oid } }, 201);
});

roles.get('/grid/voltage-zones', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM voltage_management_zones ORDER BY zone_name`).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/grid/voltage-zones', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.zone_name || !b.voltage_level_kv) return c.json({ success: false, error: 'zone_name and voltage_level_kv required' }, 400);
  const id = rid('vz');
  await c.env.DB.prepare(`
    INSERT INTO voltage_management_zones (id, zone_name, voltage_level_kv, target_voltage_pu,
      band_low_pu, band_high_pu, current_voltage_pu, reactive_capability_mvar, status, last_observed_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.zone_name, b.voltage_level_kv, b.target_voltage_pu ?? 1.0,
    b.band_low_pu ?? 0.95, b.band_high_pu ?? 1.05,
    b.current_voltage_pu ?? null, b.reactive_capability_mvar ?? null,
    b.status ?? 'normal', b.last_observed_at ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/grid/network-development', async (c) => c.json({ success: true, data: await listFor(c, 'network_development_items') }));
roles.post('/grid/network-development', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.item_name) return c.json({ success: false, error: 'item_name required' }, 400);
  const id = rid('ndp');
  await c.env.DB.prepare(`
    INSERT INTO network_development_items (id, participant_id, item_name, item_type, voltage_kv,
      estimated_capex_zar, expected_inservice, driver, priority, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.item_name, b.item_type ?? null, b.voltage_kv ?? null,
    b.estimated_capex_zar ?? null, b.expected_inservice ?? null, b.driver ?? null,
    b.priority ?? 'medium', b.status ?? 'planned', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

// ─── Regulator ─────────────────────────────────────────────────────────

roles.get('/regulator/consultations', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM public_consultations ORDER BY opened_at DESC LIMIT 100`).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/regulator/consultations', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.consultation_ref || !b.title || !b.opened_at) {
    return c.json({ success: false, error: 'consultation_ref, title, opened_at required' }, 400);
  }
  const id = rid('pc');
  await c.env.DB.prepare(`
    INSERT INTO public_consultations (id, consultation_ref, title, scope, reference_doc_r2_key,
      opened_at, closed_at, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.consultation_ref, b.title, b.scope ?? null, b.reference_doc_r2_key ?? null,
    b.opened_at, b.closed_at ?? null, b.status ?? 'open', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.post('/regulator/consultations/:id/comments', async (c) => {
  const { id } = c.req.param();
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.commenter_name) return c.json({ success: false, error: 'commenter_name required' }, 400);
  const cid = rid('pcm');
  await c.env.DB.prepare(`
    INSERT INTO public_comments (id, consultation_id, commenter_name, commenter_org, commenter_email,
      is_anonymous, comment_text, attachment_r2_key, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(cid, id, b.commenter_name, b.commenter_org ?? null, b.commenter_email ?? null,
    b.is_anonymous ? 1 : 0, b.comment_text ?? null, b.attachment_r2_key ?? null,
    b.category ?? null).run();
  await c.env.DB.prepare(`UPDATE public_consultations SET written_comments_count = written_comments_count + 1 WHERE id = ?`).bind(id).run();
  return c.json({ success: true, data: { id: cid } }, 201);
});

roles.get('/regulator/hearings', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM public_hearings ORDER BY hearing_date DESC LIMIT 100`).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/regulator/hearings', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.hearing_date) return c.json({ success: false, error: 'hearing_date required' }, 400);
  const id = rid('ph');
  await c.env.DB.prepare(`
    INSERT INTO public_hearings (id, consultation_id, hearing_date, venue, panel_chair, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.consultation_id ?? null, b.hearing_date, b.venue ?? null,
    b.panel_chair ?? null, b.status ?? 'scheduled', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/regulator/determinations', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM determinations_register ORDER BY decision_date DESC LIMIT 100`).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/regulator/determinations', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.determination_ref || !b.title) return c.json({ success: false, error: 'determination_ref and title required' }, 400);
  const id = rid('det');
  await c.env.DB.prepare(`
    INSERT INTO determinations_register (id, consultation_id, determination_ref, title, category,
      affected_parties, decision_date, effective_from, expires_at, document_r2_key, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.consultation_id ?? null, b.determination_ref, b.title, b.category ?? null,
    b.affected_parties ?? null, b.decision_date ?? null, b.effective_from ?? null,
    b.expires_at ?? null, b.document_r2_key ?? null, b.status ?? 'draft', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/regulator/license-fees', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM license_fees_register ORDER BY fee_year DESC, licensee_name`).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/regulator/license-fees', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.licensee_name || !b.license_category || !b.fee_year || !b.fee_zar) {
    return c.json({ success: false, error: 'licensee_name, license_category, fee_year, fee_zar required' }, 400);
  }
  const id = rid('lf');
  await c.env.DB.prepare(`
    INSERT INTO license_fees_register (id, licensee_id, licensee_name, license_category, capacity_mw,
      fee_year, fee_zar, paid_at, status, invoice_ref, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.licensee_id ?? null, b.licensee_name, b.license_category, b.capacity_mw ?? null,
    b.fee_year, b.fee_zar, b.paid_at ?? null, b.status ?? 'invoiced',
    b.invoice_ref ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

// ─── Trader ────────────────────────────────────────────────────────────

roles.get('/trader/day-ahead', async (c) => c.json({ success: true, data: await listFor(c, 'day_ahead_blocks') }));
roles.post('/trader/day-ahead', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.delivery_date || !b.block_type || !b.side || !b.volume_mwh || !b.price_zar_per_mwh) {
    return c.json({ success: false, error: 'delivery_date, block_type, side, volume_mwh, price_zar_per_mwh required' }, 400);
  }
  const id = rid('da');
  await c.env.DB.prepare(`
    INSERT INTO day_ahead_blocks (id, participant_id, delivery_date, block_type, side, volume_mwh,
      price_zar_per_mwh, energy_type, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.delivery_date, b.block_type, b.side, b.volume_mwh, b.price_zar_per_mwh,
    b.energy_type ?? null, b.status ?? 'submitted', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/trader/intraday', async (c) => c.json({ success: true, data: await listFor(c, 'intraday_orders') }));
roles.post('/trader/intraday', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.delivery_hour || !b.side || !b.volume_mwh || !b.limit_price_zar) {
    return c.json({ success: false, error: 'delivery_hour, side, volume_mwh, limit_price_zar required' }, 400);
  }
  const id = rid('id');
  await c.env.DB.prepare(`
    INSERT INTO intraday_orders (id, participant_id, delivery_hour, side, volume_mwh, limit_price_zar,
      energy_type, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.delivery_hour, b.side, b.volume_mwh, b.limit_price_zar,
    b.energy_type ?? null, b.status ?? 'open').run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.post('/trader/pre-trade-check', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.intent_type || !b.intent_payload) return c.json({ success: false, error: 'intent_type and intent_payload required' }, 400);

  // Lookup credit limit + currently used
  const limit = (await c.env.DB.prepare(
    `SELECT COALESCE(SUM(credit_limit_zar), 0) AS lim FROM credit_limits WHERE participant_id = ? AND status = 'active'`
  ).bind(user.id).first<any>()?.catch(() => ({ lim: 0 })))?.lim || 0;
  const exposure = (await c.env.DB.prepare(
    `SELECT COALESCE(SUM(remaining_volume_mwh * price), 0) AS exp FROM trade_orders WHERE participant_id = ? AND status IN ('open','partially_filled')`
  ).bind(user.id).first<any>()?.catch(() => ({ exp: 0 })))?.exp || 0;

  const order = typeof b.intent_payload === 'string' ? JSON.parse(b.intent_payload) : b.intent_payload;
  const addCredit = (order.volume_mwh || 0) * (order.price || order.price_zar_per_mwh || 0);
  const postUse = exposure + addCredit;

  const checks: string[] = [];
  if (limit > 0 && postUse > limit) checks.push(`would_breach_credit_limit: ${postUse} > ${limit}`);
  if ((order.volume_mwh || 0) <= 0) checks.push('zero_or_negative_volume');
  if ((order.price || order.price_zar_per_mwh || 0) <= 0) checks.push('zero_or_negative_price');
  const outcome = checks.length === 0 ? 'allow' : (checks.length === 1 && checks[0].startsWith('would_breach')) ? 'warn' : 'block';

  const id = rid('ptc');
  await c.env.DB.prepare(`
    INSERT INTO pre_trade_checks (id, participant_id, intent_type, intent_payload, outcome, failed_checks,
      credit_used_pre, credit_used_post, credit_limit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.intent_type, JSON.stringify(order), outcome,
    checks.length ? JSON.stringify(checks) : null, exposure, postUse, limit).run();
  return c.json({ success: true, data: { id, outcome, failed_checks: checks, credit_used_pre: exposure, credit_used_post: postUse, credit_limit: limit } });
});

roles.get('/trader/confirmations', async (c) => c.json({ success: true, data: await listFor(c, 'trade_confirmations') }));
roles.post('/trader/confirmations', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.trade_id) return c.json({ success: false, error: 'trade_id required' }, 400);
  const id = rid('tc');
  await c.env.DB.prepare(`
    INSERT INTO trade_confirmations (id, trade_id, participant_id, counterparty_id, affirmation_status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, b.trade_id, user.id, b.counterparty_id ?? null, b.affirmation_status ?? 'pending', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.patch('/trader/confirmations/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const b = await c.req.json().catch(() => ({} as any));
  const sets: string[] = []; const binds: any[] = [];
  for (const k of ['affirmation_status','affirmed_at','dispute_reason','novation_to','notes']) {
    if (b[k] !== undefined) { sets.push(`${k} = ?`); binds.push(b[k]); }
  }
  if (b.affirmation_status === 'affirmed' && b.affirmed_at === undefined) {
    sets.push(`affirmed_at = datetime('now')`);
  }
  if (!sets.length) return c.json({ success: false, error: 'no fields to update' }, 400);
  binds.push(id, user.id);
  await c.env.DB.prepare(`UPDATE trade_confirmations SET ${sets.join(', ')} WHERE id = ? AND participant_id = ?`).bind(...binds).run();
  return c.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════
// Migration 047 — full lifecycle micro-tools for the six other roles
// Mirrors the IPP depth (migration 046): each role gets 7-8 endpoints
// covering daily / weekly / quarterly workflows previously off-platform.
// ════════════════════════════════════════════════════════════════════════

// Generic tenant-wide list (no participant filter) for shared registers.
async function listAll(c: any, table: string, orderBy = 'created_at DESC'): Promise<any[]> {
  const r = await c.env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy} LIMIT 500`).all();
  return r.results || [];
}

// ─── Offtaker full lifecycle (047) ─────────────────────────────────────

roles.get('/offtaker/ppa-portfolio', async (c) => c.json({ success: true, data: await listFor(c, 'off_ppa_portfolio') }));
roles.post('/offtaker/ppa-portfolio', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.counterparty_name) return c.json({ success: false, error: 'counterparty_name required' }, 400);
  const id = rid('ppap');
  await c.env.DB.prepare(`
    INSERT INTO off_ppa_portfolio (id, participant_id, contract_ref, counterparty_name, technology,
      capacity_mw, ppa_term_years, ppa_start_date, ppa_end_date, price_zar_per_mwh, indexation,
      expected_p50_gwh_yr, green_attributes, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.contract_ref ?? null, b.counterparty_name, b.technology ?? null,
    b.capacity_mw ?? null, b.ppa_term_years ?? null, b.ppa_start_date ?? null, b.ppa_end_date ?? null,
    b.price_zar_per_mwh ?? null, b.indexation ?? null, b.expected_p50_gwh_yr ?? null,
    b.green_attributes ?? null, b.status ?? 'signed', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/offtaker/redlines', async (c) => c.json({ success: true, data: await listFor(c, 'off_contract_redlines') }));
roles.post('/offtaker/redlines', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.version_no) return c.json({ success: false, error: 'version_no required' }, 400);
  const id = rid('rdl');
  await c.env.DB.prepare(`
    INSERT INTO off_contract_redlines (id, participant_id, contract_id, version_no, prepared_by,
      changes_summary, document_r2_key, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.contract_id ?? null, b.version_no, b.prepared_by ?? null,
    b.changes_summary ?? null, b.document_r2_key ?? null, b.status ?? 'draft').run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/offtaker/tou-optimisations', async (c) => c.json({ success: true, data: await listFor(c, 'off_tou_optimisations') }));
roles.post('/offtaker/tou-optimisations', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.analysis_month) return c.json({ success: false, error: 'analysis_month required' }, 400);
  // Auto-estimate annual savings if both tariffs and a baseline are known.
  // Assumes a typical commercial site at ~720 MWh/yr (≈2 MWh/day).
  let savings = b.annual_savings_zar;
  if (!savings && b.current_zar_per_kwh && b.suggested_zar_per_kwh) {
    const annualKwh = 720 * 1000;
    savings = (b.current_zar_per_kwh - b.suggested_zar_per_kwh) * annualKwh;
  }
  const id = rid('tou');
  await c.env.DB.prepare(`
    INSERT INTO off_tou_optimisations (id, participant_id, analysis_month, current_tariff_bucket,
      current_zar_per_kwh, suggested_bucket, suggested_zar_per_kwh, annual_savings_zar,
      load_shift_required_pct, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.analysis_month, b.current_tariff_bucket ?? null,
    b.current_zar_per_kwh ?? null, b.suggested_bucket ?? null, b.suggested_zar_per_kwh ?? null,
    savings ?? null, b.load_shift_required_pct ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, annual_savings_zar: savings } }, 201);
});

roles.get('/offtaker/btm-designs', async (c) => c.json({ success: true, data: await listFor(c, 'off_btm_designs') }));
roles.post('/offtaker/btm-designs', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.site_name || !b.proposed_kwp) return c.json({ success: false, error: 'site_name and proposed_kwp required' }, 400);
  // Auto-derive yield, payback, scope-2 reduction if inputs available.
  // ZA typical PV: ~1,700 kWh / kWp / yr (Joburg/Cape) and grid factor 0.95 kg/kWh.
  const yieldYr = b.expected_yield_kwh_yr ?? (b.proposed_kwp * 1700);
  let payback = b.estimated_payback_years;
  if (!payback && b.capex_zar && b.self_consumption_pct) {
    const savedKwh = yieldYr * (b.self_consumption_pct / 100);
    const annualSaving = savedKwh * 2.5;             // assume tariff ZAR 2.50/kWh
    payback = annualSaving > 0 ? b.capex_zar / annualSaving : null;
  }
  const scope2 = b.scope2_reduction_tco2e_yr ?? (yieldYr * 0.00095);
  const id = rid('btm');
  await c.env.DB.prepare(`
    INSERT INTO off_btm_designs (id, participant_id, site_name, rooftop_area_m2, proposed_kwp,
      inverter_kw, bess_kwh, expected_yield_kwh_yr, capex_zar, estimated_payback_years,
      self_consumption_pct, scope2_reduction_tco2e_yr, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.site_name, b.rooftop_area_m2 ?? null, b.proposed_kwp,
    b.inverter_kw ?? null, b.bess_kwh ?? 0, yieldYr, b.capex_zar ?? null,
    payback ?? null, b.self_consumption_pct ?? null, scope2,
    b.status ?? 'design', b.notes ?? null).run();
  return c.json({ success: true, data: { id, expected_yield_kwh_yr: yieldYr, estimated_payback_years: payback, scope2_reduction_tco2e_yr: scope2 } }, 201);
});

roles.get('/offtaker/scope2', async (c) => c.json({ success: true, data: await listFor(c, 'off_scope2_reports') }));
roles.post('/offtaker/scope2', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.reporting_year || !b.total_consumption_mwh) {
    return c.json({ success: false, error: 'reporting_year and total_consumption_mwh required' }, 400);
  }
  // Auto-compute Scope-2 tCO2e if grid factors provided
  const locTco2e = b.location_factor_kg_kwh
    ? b.total_consumption_mwh * 1000 * b.location_factor_kg_kwh / 1000     // kg → t
    : b.location_tco2e ?? null;
  const mktTco2e = b.market_factor_kg_kwh
    ? b.total_consumption_mwh * 1000 * b.market_factor_kg_kwh / 1000
    : b.market_tco2e ?? null;
  const renewablePct = b.renewable_pct ?? (
    b.total_consumption_mwh > 0
      ? ((b.recs_retired_mwh || 0) + (b.ppa_attributed_mwh || 0)) / b.total_consumption_mwh * 100
      : null
  );
  const id = rid('s2');
  await c.env.DB.prepare(`
    INSERT INTO off_scope2_reports (id, participant_id, reporting_year, total_consumption_mwh,
      location_factor_kg_kwh, market_factor_kg_kwh, location_tco2e, market_tco2e,
      recs_retired_mwh, ppa_attributed_mwh, renewable_pct, cfe_match_pct, status, assured_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.reporting_year, b.total_consumption_mwh,
    b.location_factor_kg_kwh ?? null, b.market_factor_kg_kwh ?? null,
    locTco2e, mktTco2e, b.recs_retired_mwh ?? 0, b.ppa_attributed_mwh ?? 0,
    renewablePct, b.cfe_match_pct ?? null, b.status ?? 'draft',
    b.assured_by ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, location_tco2e: locTco2e, market_tco2e: mktTco2e, renewable_pct: renewablePct } }, 201);
});

roles.get('/offtaker/cfe-commitments', async (c) => c.json({ success: true, data: await listFor(c, 'off_cfe_commitments') }));
roles.post('/offtaker/cfe-commitments', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.framework || !b.target_year || b.target_pct === undefined) {
    return c.json({ success: false, error: 'framework, target_year, target_pct required' }, 400);
  }
  const id = rid('cfe');
  await c.env.DB.prepare(`
    INSERT INTO off_cfe_commitments (id, participant_id, framework, target_year, target_pct,
      pledge_date, status, current_pct, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.framework, b.target_year, b.target_pct,
    b.pledge_date ?? null, b.status ?? 'active', b.current_pct ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/offtaker/energy-budgets', async (c) => c.json({ success: true, data: await listFor(c, 'off_energy_budgets') }));
roles.post('/offtaker/energy-budgets', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.budget_year || !b.category || b.budget_zar === undefined) {
    return c.json({ success: false, error: 'budget_year, category, budget_zar required' }, 400);
  }
  const spent = b.spent_zar ?? 0;
  const varZ = b.budget_zar - spent;
  const varPct = b.budget_zar > 0 ? (varZ / b.budget_zar) * 100 : null;
  let status = b.status ?? 'open';
  if (spent > b.budget_zar) status = 'overspent';
  else if (spent > 0) status = 'tracking';
  const id = rid('bud');
  await c.env.DB.prepare(`
    INSERT INTO off_energy_budgets (id, participant_id, budget_year, category, budget_zar,
      spent_zar, variance_zar, variance_pct, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.budget_year, b.category, b.budget_zar, spent, varZ, varPct,
    status, b.notes ?? null).run();
  return c.json({ success: true, data: { id, variance_zar: varZ, variance_pct: varPct, status } }, 201);
});

// ─── Lender full lifecycle (047) ───────────────────────────────────────

roles.get('/lender/pipeline', async (c) => c.json({ success: true, data: await listFor(c, 'lender_deal_pipeline') }));
roles.post('/lender/pipeline', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.deal_name) return c.json({ success: false, error: 'deal_name required' }, 400);
  const id = rid('pipe');
  await c.env.DB.prepare(`
    INSERT INTO lender_deal_pipeline (id, participant_id, deal_name, sponsor_name, sector, jurisdiction,
      ticket_size_zar, expected_close, probability_pct, source, owner_user_id, stage,
      next_action, next_action_due, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.deal_name, b.sponsor_name ?? null, b.sector ?? null, b.jurisdiction ?? null,
    b.ticket_size_zar ?? null, b.expected_close ?? null, b.probability_pct ?? null,
    b.source ?? null, b.owner_user_id ?? null, b.stage ?? 'sourcing',
    b.next_action ?? null, b.next_action_due ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/lender/sponsor-dd', async (c) => c.json({ success: true, data: await listFor(c, 'lender_sponsor_dd') }));
roles.post('/lender/sponsor-dd', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.sponsor_name) return c.json({ success: false, error: 'sponsor_name required' }, 400);
  const id = rid('dd');
  await c.env.DB.prepare(`
    INSERT INTO lender_sponsor_dd (id, participant_id, pipeline_id, sponsor_name, registration_no,
      jurisdiction, ultimate_beneficial_owner, group_structure_r2_key, kyc_outcome,
      sanctions_check_outcome, pep_check_outcome, litigation_check_outcome, track_record_score,
      bbbee_level, financial_strength_score, overall_outcome, reviewed_by, reviewed_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.pipeline_id ?? null, b.sponsor_name, b.registration_no ?? null,
    b.jurisdiction ?? null, b.ultimate_beneficial_owner ?? null, b.group_structure_r2_key ?? null,
    b.kyc_outcome ?? null, b.sanctions_check_outcome ?? null, b.pep_check_outcome ?? null,
    b.litigation_check_outcome ?? null, b.track_record_score ?? null, b.bbbee_level ?? null,
    b.financial_strength_score ?? null, b.overall_outcome ?? null, b.reviewed_by ?? null,
    b.reviewed_at ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/lender/credit-risk', async (c) => c.json({ success: true, data: await listFor(c, 'lender_credit_risk') }));
roles.post('/lender/credit-risk', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.as_of_date) return c.json({ success: false, error: 'as_of_date required' }, 400);
  // EL = PD × LGD × EAD;  RWA = EAD × risk_weight
  const el = (b.pd_1yr_pct && b.lgd_pct && b.ead_zar)
    ? (b.pd_1yr_pct / 100) * (b.lgd_pct / 100) * b.ead_zar
    : b.expected_loss_zar ?? null;
  const rwa = (b.ead_zar && b.risk_weight_pct)
    ? b.ead_zar * (b.risk_weight_pct / 100)
    : b.rwa_zar ?? null;
  const id = rid('cr');
  await c.env.DB.prepare(`
    INSERT INTO lender_credit_risk (id, participant_id, loan_id, as_of_date, pd_1yr_pct, pd_lifetime_pct,
      lgd_pct, ead_zar, ccf_pct, risk_weight_pct, rwa_zar, expected_loss_zar, rating_internal,
      rating_external, watchlist, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.loan_id ?? null, b.as_of_date, b.pd_1yr_pct ?? null, b.pd_lifetime_pct ?? null,
    b.lgd_pct ?? null, b.ead_zar ?? null, b.ccf_pct ?? null, b.risk_weight_pct ?? null,
    rwa, el, b.rating_internal ?? null, b.rating_external ?? null,
    b.watchlist ? 1 : 0, b.notes ?? null).run();
  return c.json({ success: true, data: { id, expected_loss_zar: el, rwa_zar: rwa } }, 201);
});

roles.get('/lender/ecl', async (c) => c.json({ success: true, data: await listFor(c, 'lender_ecl_provisions') }));
roles.post('/lender/ecl', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.reporting_period) return c.json({ success: false, error: 'reporting_period required' }, 400);
  const total = (b.stage1_ecl_zar || 0) + (b.stage2_ecl_zar || 0) + (b.stage3_ecl_zar || 0);
  const net = total - (b.recovery_zar || 0);
  const id = rid('ecl');
  await c.env.DB.prepare(`
    INSERT INTO lender_ecl_provisions (id, participant_id, loan_id, reporting_period, ifrs9_stage,
      stage1_ecl_zar, stage2_ecl_zar, stage3_ecl_zar, total_provision_zar, recovery_zar,
      net_provision_zar, stage_change_reason, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.loan_id ?? null, b.reporting_period, b.ifrs9_stage ?? 1,
    b.stage1_ecl_zar ?? 0, b.stage2_ecl_zar ?? 0, b.stage3_ecl_zar ?? 0,
    total, b.recovery_zar ?? 0, net, b.stage_change_reason ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, total_provision_zar: total, net_provision_zar: net } }, 201);
});

roles.get('/lender/limits', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM lender_limit_framework WHERE participant_id = ? ORDER BY (utilisation_pct IS NULL), utilisation_pct DESC LIMIT 500`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/lender/limits', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.limit_type) return c.json({ success: false, error: 'limit_type required' }, 400);
  const util = b.limit_zar && b.current_zar !== undefined
    ? (b.current_zar / b.limit_zar) * 100
    : b.utilisation_pct ?? null;
  let status = b.status ?? 'within';
  if (util !== null && util !== undefined) {
    if (util > 100) status = 'breach';
    else if (util > 90) status = 'warning';
    else status = 'within';
  }
  const id = rid('lim');
  await c.env.DB.prepare(`
    INSERT INTO lender_limit_framework (id, participant_id, limit_type, limit_dimension, limit_zar,
      limit_pct, current_zar, current_pct, utilisation_pct, status, as_of_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.limit_type, b.limit_dimension ?? null, b.limit_zar ?? null,
    b.limit_pct ?? null, b.current_zar ?? 0, b.current_pct ?? null, util, status,
    b.as_of_date ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, utilisation_pct: util, status } }, 201);
});

roles.get('/lender/pricing', async (c) => c.json({ success: true, data: await listFor(c, 'lender_pricing_models') }));
roles.post('/lender/pricing', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.pricing_method) return c.json({ success: false, error: 'pricing_method required' }, 400);
  // Expected RAROC ≈ (margin - cost_of_credit - cost_of_ops) / cost_of_capital  (rough)
  let raroc = b.expected_raroc_pct;
  if (!raroc && b.proposed_margin_bps && b.cost_of_capital_pct) {
    const marginPct = b.proposed_margin_bps / 100;
    const net = marginPct - (b.cost_of_credit_pct || 0) - (b.cost_of_ops_pct || 0);
    raroc = b.cost_of_capital_pct > 0 ? (net / b.cost_of_capital_pct) * 100 : null;
  }
  const id = rid('px');
  await c.env.DB.prepare(`
    INSERT INTO lender_pricing_models (id, participant_id, loan_id, pricing_method, cost_of_funds_pct,
      cost_of_credit_pct, cost_of_capital_pct, cost_of_ops_pct, pricing_floor_bps, proposed_margin_bps,
      expected_raroc_pct, hurdle_raroc_pct, approved, approved_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.loan_id ?? null, b.pricing_method, b.cost_of_funds_pct ?? null,
    b.cost_of_credit_pct ?? null, b.cost_of_capital_pct ?? null, b.cost_of_ops_pct ?? null,
    b.pricing_floor_bps ?? null, b.proposed_margin_bps ?? null, raroc, b.hurdle_raroc_pct ?? null,
    b.approved ? 1 : 0, b.approved_by ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, expected_raroc_pct: raroc } }, 201);
});

roles.get('/lender/repayments', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM lender_repayment_schedules WHERE participant_id = ? ORDER BY due_date ASC LIMIT 500`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/lender/repayments', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.loan_id || !b.installment_no || !b.due_date) {
    return c.json({ success: false, error: 'loan_id, installment_no, due_date required' }, 400);
  }
  const total = (b.principal_zar || 0) + (b.interest_zar || 0) + (b.fees_zar || 0);
  const id = rid('rep');
  await c.env.DB.prepare(`
    INSERT INTO lender_repayment_schedules (id, loan_id, participant_id, installment_no, due_date,
      principal_zar, interest_zar, fees_zar, total_zar, balance_after_zar, status, paid_at,
      paid_amount_zar, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.loan_id, user.id, b.installment_no, b.due_date,
    b.principal_zar ?? null, b.interest_zar ?? null, b.fees_zar ?? null, total,
    b.balance_after_zar ?? null, b.status ?? 'scheduled', b.paid_at ?? null,
    b.paid_amount_zar ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, total_zar: total } }, 201);
});

// ─── Carbon Fund full lifecycle (047) ──────────────────────────────────

roles.get('/carbon/lps', async (c) => c.json({ success: true, data: await listFor(c, 'carbon_fund_lps') }));
roles.post('/carbon/lps', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.lp_name || !b.commitment_zar) return c.json({ success: false, error: 'lp_name and commitment_zar required' }, 400);
  const remaining = b.commitment_zar - (b.drawn_zar || 0);
  const id = rid('lp');
  await c.env.DB.prepare(`
    INSERT INTO carbon_fund_lps (id, participant_id, lp_name, lp_jurisdiction, commitment_zar,
      drawn_zar, distributed_zar, remaining_commitment_zar, share_class, side_letter, status,
      joined_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.lp_name, b.lp_jurisdiction ?? null, b.commitment_zar,
    b.drawn_zar ?? 0, b.distributed_zar ?? 0, remaining,
    b.share_class ?? null, b.side_letter ? 1 : 0, b.status ?? 'active',
    b.joined_at ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, remaining_commitment_zar: remaining } }, 201);
});

roles.get('/carbon/capital-calls', async (c) => c.json({ success: true, data: await listFor(c, 'carbon_fund_capital_calls') }));
roles.post('/carbon/capital-calls', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.call_date || !b.total_called_zar) return c.json({ success: false, error: 'call_date and total_called_zar required' }, 400);
  // Auto-number capital call per fund
  let callNo = b.call_no;
  if (!callNo) {
    const last = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(call_no), 0) AS n FROM carbon_fund_capital_calls WHERE participant_id = ?`
    ).bind(user.id).first<any>();
    callNo = (last?.n || 0) + 1;
  }
  const id = rid('cc');
  await c.env.DB.prepare(`
    INSERT INTO carbon_fund_capital_calls (id, participant_id, call_no, call_date, due_date,
      total_called_zar, purpose, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, callNo, b.call_date, b.due_date ?? null, b.total_called_zar,
    b.purpose ?? null, b.status ?? 'issued', b.notes ?? null).run();
  return c.json({ success: true, data: { id, call_no: callNo } }, 201);
});

roles.get('/carbon/nav', async (c) => c.json({ success: true, data: await listFor(c, 'carbon_fund_nav_history') }));
roles.post('/carbon/nav', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.as_of_date || b.gross_asset_value_zar === undefined) {
    return c.json({ success: false, error: 'as_of_date and gross_asset_value_zar required' }, 400);
  }
  const cash = b.cash_zar ?? 0;
  const liab = b.liabilities_zar ?? 0;
  const nav = b.net_asset_value_zar ?? (b.gross_asset_value_zar + cash - liab);
  const navPerUnit = b.nav_per_unit_zar ?? (b.units_outstanding ? nav / b.units_outstanding : null);
  const id = rid('nav');
  await c.env.DB.prepare(`
    INSERT INTO carbon_fund_nav_history (id, participant_id, as_of_date, gross_asset_value_zar,
      cash_zar, liabilities_zar, net_asset_value_zar, nav_per_unit_zar, units_outstanding,
      ytd_return_pct, itd_irr_pct, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.as_of_date, b.gross_asset_value_zar, cash, liab, nav, navPerUnit,
    b.units_outstanding ?? null, b.ytd_return_pct ?? null, b.itd_irr_pct ?? null,
    b.notes ?? null).run();
  return c.json({ success: true, data: { id, net_asset_value_zar: nav, nav_per_unit_zar: navPerUnit } }, 201);
});

roles.get('/carbon/pipeline', async (c) => c.json({ success: true, data: await listFor(c, 'carbon_fund_pipeline') }));
roles.post('/carbon/pipeline', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.project_lead) return c.json({ success: false, error: 'project_lead required' }, 400);
  const id = rid('pipe');
  await c.env.DB.prepare(`
    INSERT INTO carbon_fund_pipeline (id, participant_id, project_lead, technology, expected_tco2e_yr,
      ticket_size_zar, developer_name, stage, source, owner_user_id, next_action, next_action_due, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_lead, b.technology ?? null, b.expected_tco2e_yr ?? null,
    b.ticket_size_zar ?? null, b.developer_name ?? null, b.stage ?? 'sourced',
    b.source ?? null, b.owner_user_id ?? null, b.next_action ?? null,
    b.next_action_due ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/carbon/term-sheets', async (c) => c.json({ success: true, data: await listFor(c, 'carbon_fund_term_sheets') }));
roles.post('/carbon/term-sheets', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.version) return c.json({ success: false, error: 'version required' }, 400);
  const id = rid('ts');
  await c.env.DB.prepare(`
    INSERT INTO carbon_fund_term_sheets (id, participant_id, pipeline_id, developer_name, version,
      total_tco2e, price_zar_per_tco2e, prepayment_zar, conditions_precedent, document_r2_key,
      status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.pipeline_id ?? null, b.developer_name ?? null, b.version,
    b.total_tco2e ?? null, b.price_zar_per_tco2e ?? null, b.prepayment_zar ?? null,
    b.conditions_precedent ?? null, b.document_r2_key ?? null,
    b.status ?? 'drafting', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/carbon/cobenefits', async (c) => c.json({ success: true, data: await listFor(c, 'carbon_fund_cobenefits') }));
roles.post('/carbon/cobenefits', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.sdg_target) return c.json({ success: false, error: 'sdg_target required' }, 400);
  const id = rid('sdg');
  await c.env.DB.prepare(`
    INSERT INTO carbon_fund_cobenefits (id, participant_id, project_id, sdg_target, metric_name,
      baseline_value, current_value, target_value, unit, reporting_period, verified_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.project_id ?? null, b.sdg_target, b.metric_name ?? null,
    b.baseline_value ?? null, b.current_value ?? null, b.target_value ?? null,
    b.unit ?? null, b.reporting_period ?? null, b.verified_by ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/carbon/fees', async (c) => c.json({ success: true, data: await listFor(c, 'carbon_fund_fees') }));
roles.post('/carbon/fees', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.fee_type || !b.reporting_period) {
    return c.json({ success: false, error: 'fee_type and reporting_period required' }, 400);
  }
  // Auto-compute fee = base × rate when both provided.
  const fee = b.fee_zar ?? (b.base_zar && b.rate_pct ? b.base_zar * b.rate_pct / 100 : null);
  if (fee === null || fee === undefined) return c.json({ success: false, error: 'fee_zar (or base_zar + rate_pct) required' }, 400);
  const id = rid('fee');
  await c.env.DB.prepare(`
    INSERT INTO carbon_fund_fees (id, participant_id, fee_type, reporting_period, basis, base_zar,
      rate_pct, fee_zar, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.fee_type, b.reporting_period, b.basis ?? null,
    b.base_zar ?? null, b.rate_pct ?? null, fee, b.status ?? 'accrued', b.notes ?? null).run();
  return c.json({ success: true, data: { id, fee_zar: fee } }, 201);
});

// ─── Grid Operator full lifecycle (047) ────────────────────────────────

roles.get('/grid/scada', async (c) => c.json({ success: true, data: await listAll(c, 'grid_scada_snapshots', 'observed_at DESC') }));
roles.post('/grid/scada', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.substation_code || !b.observed_at) {
    return c.json({ success: false, error: 'substation_code and observed_at required' }, 400);
  }
  const id = rid('scd');
  await c.env.DB.prepare(`
    INSERT INTO grid_scada_snapshots (id, substation_code, observed_at, voltage_kv, voltage_pu,
      active_mw, reactive_mvar, frequency_hz, loading_pct, health_status, scada_source, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.substation_code, b.observed_at, b.voltage_kv ?? null, b.voltage_pu ?? null,
    b.active_mw ?? null, b.reactive_mvar ?? null, b.frequency_hz ?? null,
    b.loading_pct ?? null, b.health_status ?? null, b.scada_source ?? null,
    b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/grid/dispatch', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM grid_dispatch_schedules WHERE participant_id = ? ORDER BY schedule_date DESC LIMIT 500`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/grid/dispatch', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.schedule_date || !b.schedule_type || !b.hourly_mwh) {
    return c.json({ success: false, error: 'schedule_date, schedule_type, hourly_mwh required' }, 400);
  }
  const arr = Array.isArray(b.hourly_mwh) ? b.hourly_mwh : Array.from({ length: 24 }, (_, i) => b.hourly_mwh[i] ?? 0);
  if (arr.length !== 24) return c.json({ success: false, error: 'hourly_mwh must be 24 values' }, 400);
  const total = arr.reduce((s: number, v: number) => s + (v || 0), 0);
  const id = rid('disp');
  await c.env.DB.prepare(`
    INSERT INTO grid_dispatch_schedules (id, participant_id, schedule_date, schedule_type, published_at,
      generator_id, generator_name, hourly_mwh_json, total_mwh, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.schedule_date, b.schedule_type, b.published_at ?? null,
    b.generator_id ?? null, b.generator_name ?? null,
    JSON.stringify(arr), total, b.status ?? 'draft', b.notes ?? null).run();
  return c.json({ success: true, data: { id, total_mwh: total } }, 201);
});

roles.get('/grid/intraday-balancing', async (c) => c.json({ success: true, data: await listFor(c, 'grid_intraday_balancing') }));
roles.post('/grid/intraday-balancing', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.trading_hour) return c.json({ success: false, error: 'trading_hour required' }, 400);
  const imb = b.imbalance_mw ?? ((b.generation_forecast_mw || 0) - (b.load_forecast_mw || 0));
  let dir = b.action_direction;
  if (!dir && b.balancing_action_mw !== undefined) {
    dir = b.balancing_action_mw > 0 ? 'up' : b.balancing_action_mw < 0 ? 'down' : 'none';
  }
  const id = rid('idb');
  await c.env.DB.prepare(`
    INSERT INTO grid_intraday_balancing (id, participant_id, trading_hour, generation_forecast_mw,
      load_forecast_mw, imbalance_mw, balancing_action_mw, action_direction, balancing_cost_zar, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.trading_hour, b.generation_forecast_mw ?? null, b.load_forecast_mw ?? null,
    imb, b.balancing_action_mw ?? null, dir ?? null, b.balancing_cost_zar ?? null,
    b.notes ?? null).run();
  return c.json({ success: true, data: { id, imbalance_mw: imb, action_direction: dir } }, 201);
});

roles.get('/grid/reactive', async (c) => c.json({ success: true, data: await listFor(c, 'grid_reactive_dispatch') }));
roles.post('/grid/reactive', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.observed_at) return c.json({ success: false, error: 'observed_at required' }, 400);
  const id = rid('rxd');
  await c.env.DB.prepare(`
    INSERT INTO grid_reactive_dispatch (id, participant_id, observed_at, zone_id,
      reactive_dispatched_mvar, resource_type, voltage_set_point_pu, achieved_voltage_pu,
      cost_zar, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.observed_at, b.zone_id ?? null,
    b.reactive_dispatched_mvar ?? null, b.resource_type ?? null,
    b.voltage_set_point_pu ?? null, b.achieved_voltage_pu ?? null,
    b.cost_zar ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/grid/contingency', async (c) => {
  const user = getCurrentUser(c);
  const r = await c.env.DB.prepare(
    `SELECT * FROM grid_contingency_runs WHERE participant_id = ? ORDER BY computed_at DESC LIMIT 500`
  ).bind(user.id).all();
  return c.json({ success: true, data: r.results || [] });
});
roles.post('/grid/contingency', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.run_date || !b.run_type) return c.json({ success: false, error: 'run_date and run_type required' }, 400);
  const id = rid('cont');
  await c.env.DB.prepare(`
    INSERT INTO grid_contingency_runs (id, participant_id, run_date, run_type, contingency_set,
      pre_contingency_loading_pct, post_contingency_loading_pct, pre_contingency_voltage_pu,
      post_contingency_voltage_pu, outcome, remedy_actions, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.run_date, b.run_type,
    b.contingency_set ? JSON.stringify(b.contingency_set) : null,
    b.pre_contingency_loading_pct ?? null, b.post_contingency_loading_pct ?? null,
    b.pre_contingency_voltage_pu ?? null, b.post_contingency_voltage_pu ?? null,
    b.outcome ?? null,
    b.remedy_actions ? JSON.stringify(b.remedy_actions) : null,
    b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/grid/outages', async (c) => c.json({ success: true, data: await listFor(c, 'grid_outage_coordination') }));
roles.post('/grid/outages', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.asset_descr || !b.outage_type) {
    return c.json({ success: false, error: 'asset_descr and outage_type required' }, 400);
  }
  const id = rid('out');
  await c.env.DB.prepare(`
    INSERT INTO grid_outage_coordination (id, participant_id, outage_ref, asset_descr, outage_type,
      scheduled_start, scheduled_end, actual_start, actual_end, capacity_out_mw, reason,
      coordinated_with, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.outage_ref ?? null, b.asset_descr, b.outage_type,
    b.scheduled_start ?? null, b.scheduled_end ?? null, b.actual_start ?? null,
    b.actual_end ?? null, b.capacity_out_mw ?? null, b.reason ?? null,
    b.coordinated_with ?? null, b.status ?? 'requested', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/grid/aggregated-forecasts', async (c) => c.json({ success: true, data: await listAll(c, 'grid_aggregated_forecasts', 'forecast_for_date DESC') }));
roles.post('/grid/aggregated-forecasts', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.forecast_for_date || !b.technology || !b.hourly_mw) {
    return c.json({ success: false, error: 'forecast_for_date, technology, hourly_mw required' }, 400);
  }
  const arr = Array.isArray(b.hourly_mw) ? b.hourly_mw : Array.from({ length: 24 }, (_, i) => b.hourly_mw[i] ?? 0);
  if (arr.length !== 24) return c.json({ success: false, error: 'hourly_mw must be 24 values' }, 400);
  const total = arr.reduce((s: number, v: number) => s + (v || 0), 0);
  const id = rid('aggf');
  await c.env.DB.prepare(`
    INSERT INTO grid_aggregated_forecasts (id, forecast_for_date, technology, grid_zone, hourly_mw_json,
      total_mwh, source, confidence_pct, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.forecast_for_date, b.technology, b.grid_zone ?? null,
    JSON.stringify(arr), total, b.source ?? null, b.confidence_pct ?? null,
    b.notes ?? null).run();
  return c.json({ success: true, data: { id, total_mwh: total } }, 201);
});

// ─── Regulator full lifecycle (047) ────────────────────────────────────
// Regulator tables are tenant-scoped registers, not per-user.

roles.get('/regulator/licence-applications', async (c) => c.json({ success: true, data: await listAll(c, 'reg_licence_applications', 'filed_at DESC') }));
roles.post('/regulator/licence-applications', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.application_ref || !b.applicant_name || !b.licence_category || !b.filed_at) {
    return c.json({ success: false, error: 'application_ref, applicant_name, licence_category, filed_at required' }, 400);
  }
  const id = rid('lapp');
  await c.env.DB.prepare(`
    INSERT INTO reg_licence_applications (id, application_ref, applicant_id, applicant_name,
      licence_category, capacity_mw, technology, jurisdiction, filed_at, completeness_check_outcome,
      technical_evaluator, financial_evaluator, public_consultation_id, panel_decision_at,
      outcome, conditions, determination_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.application_ref, b.applicant_id ?? null, b.applicant_name,
    b.licence_category, b.capacity_mw ?? null, b.technology ?? null, b.jurisdiction ?? null,
    b.filed_at, b.completeness_check_outcome ?? null,
    b.technical_evaluator ?? null, b.financial_evaluator ?? null,
    b.public_consultation_id ?? null, b.panel_decision_at ?? null,
    b.outcome ?? 'pending', b.conditions ?? null, b.determination_id ?? null,
    b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/regulator/tariff-applications', async (c) => c.json({ success: true, data: await listAll(c, 'reg_tariff_applications') }));
roles.post('/regulator/tariff-applications', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.application_ref || !b.applicant_name || !b.tariff_year || b.requested_increase_pct === undefined) {
    return c.json({ success: false, error: 'application_ref, applicant_name, tariff_year, requested_increase_pct required' }, 400);
  }
  const id = rid('tapp');
  await c.env.DB.prepare(`
    INSERT INTO reg_tariff_applications (id, application_ref, applicant_id, applicant_name,
      tariff_year, requested_increase_pct, approved_increase_pct, multi_year_path, hearing_id,
      determination_id, status, decision_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.application_ref, b.applicant_id ?? null, b.applicant_name,
    b.tariff_year, b.requested_increase_pct, b.approved_increase_pct ?? null,
    b.multi_year_path ?? null, b.hearing_id ?? null, b.determination_id ?? null,
    b.status ?? 'filed', b.decision_date ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/regulator/inspections', async (c) => c.json({ success: true, data: await listAll(c, 'reg_inspections') }));
roles.post('/regulator/inspections', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.licensee_name || !b.inspection_type) {
    return c.json({ success: false, error: 'licensee_name and inspection_type required' }, 400);
  }
  const id = rid('insp');
  await c.env.DB.prepare(`
    INSERT INTO reg_inspections (id, licensee_id, licensee_name, inspection_type, inspector_name,
      scheduled_at, conducted_at, scope, findings, outcome, follow_up_due, status,
      report_r2_key, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.licensee_id ?? null, b.licensee_name, b.inspection_type,
    b.inspector_name ?? null, b.scheduled_at ?? null, b.conducted_at ?? null,
    b.scope ?? null,
    b.findings ? JSON.stringify(b.findings) : null,
    b.outcome ?? null, b.follow_up_due ?? null, b.status ?? 'scheduled',
    b.report_r2_key ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/regulator/compliance', async (c) => c.json({ success: true, data: await listAll(c, 'reg_compliance_monitoring') }));
roles.post('/regulator/compliance', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.licensee_name || !b.monitoring_period) {
    return c.json({ success: false, error: 'licensee_name and monitoring_period required' }, 400);
  }
  // Auto-rate risk from score + findings.
  let risk = b.risk_rating;
  if (!risk && b.compliance_score !== undefined) {
    if (b.compliance_score < 50) risk = 'very_high';
    else if (b.compliance_score < 70) risk = 'high';
    else if (b.compliance_score < 85) risk = 'medium';
    else risk = 'low';
  }
  const id = rid('cmp');
  await c.env.DB.prepare(`
    INSERT INTO reg_compliance_monitoring (id, licensee_id, licensee_name, monitoring_period,
      obligation_summary, compliance_score, open_findings_count, enforcement_actions_count,
      risk_rating, last_reviewed_at, next_review_due, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.licensee_id ?? null, b.licensee_name, b.monitoring_period,
    b.obligation_summary ?? null, b.compliance_score ?? null,
    b.open_findings_count ?? 0, b.enforcement_actions_count ?? 0,
    risk ?? null, b.last_reviewed_at ?? null, b.next_review_due ?? null,
    b.notes ?? null).run();
  return c.json({ success: true, data: { id, risk_rating: risk } }, 201);
});

roles.get('/regulator/public-register', async (c) => c.json({ success: true, data: await listAll(c, 'reg_public_register', 'legal_name ASC') }));
roles.post('/regulator/public-register', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.entry_type || !b.legal_name) return c.json({ success: false, error: 'entry_type and legal_name required' }, 400);
  const id = rid('pr');
  await c.env.DB.prepare(`
    INSERT INTO reg_public_register (id, entry_type, legal_name, trading_name, registration_no,
      jurisdiction, licence_no, capacity_mw, technology, status, effective_from, effective_to,
      public_address, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.entry_type, b.legal_name, b.trading_name ?? null, b.registration_no ?? null,
    b.jurisdiction ?? null, b.licence_no ?? null, b.capacity_mw ?? null,
    b.technology ?? null, b.status ?? 'active', b.effective_from ?? null,
    b.effective_to ?? null, b.public_address ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/regulator/complaints', async (c) => c.json({ success: true, data: await listAll(c, 'reg_complaints', 'received_at DESC') }));
roles.post('/regulator/complaints', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.complaint_ref || !b.complainant_name || !b.against_licensee || !b.received_at) {
    return c.json({ success: false, error: 'complaint_ref, complainant_name, against_licensee, received_at required' }, 400);
  }
  const id = rid('cmp');
  await c.env.DB.prepare(`
    INSERT INTO reg_complaints (id, complaint_ref, complainant_name, complainant_contact,
      against_licensee, category, description, received_at, acknowledged_at, assigned_to,
      resolution_due, resolved_at, outcome, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, b.complaint_ref, b.complainant_name, b.complainant_contact ?? null,
    b.against_licensee, b.category ?? null, b.description ?? null, b.received_at,
    b.acknowledged_at ?? null, b.assigned_to ?? null, b.resolution_due ?? null,
    b.resolved_at ?? null, b.outcome ?? null, b.status ?? 'open', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/regulator/annual-reports', async (c) => c.json({ success: true, data: await listAll(c, 'reg_annual_reports', 'reporting_year DESC') }));
roles.post('/regulator/annual-reports', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.reporting_year) return c.json({ success: false, error: 'reporting_year required' }, 400);
  // Auto-tally counts from registers if not provided.
  const year = b.reporting_year;
  const yearLike = `${year}%`;
  const tally = async (sql: string, ...binds: any[]) =>
    Number(((await c.env.DB.prepare(sql).bind(...binds).first<any>()) || {}).n || 0);
  const licGranted = b.licences_granted ?? await tally(
    `SELECT COUNT(*) AS n FROM reg_licence_applications WHERE outcome IN ('granted','granted_with_conditions') AND filed_at LIKE ?`, yearLike);
  const licRefused = b.licences_refused ?? await tally(
    `SELECT COUNT(*) AS n FROM reg_licence_applications WHERE outcome = 'refused' AND filed_at LIKE ?`, yearLike);
  const dets = b.determinations_issued ?? await tally(
    `SELECT COUNT(*) AS n FROM determinations_register WHERE decision_date LIKE ?`, yearLike);
  const compReceived = b.complaints_received ?? await tally(
    `SELECT COUNT(*) AS n FROM reg_complaints WHERE received_at LIKE ?`, yearLike);
  const compResolved = b.complaints_resolved ?? await tally(
    `SELECT COUNT(*) AS n FROM reg_complaints WHERE status = 'resolved' AND received_at LIKE ?`, yearLike);
  const insp = b.inspections_conducted ?? await tally(
    `SELECT COUNT(*) AS n FROM reg_inspections WHERE conducted_at LIKE ?`, yearLike);
  const id = rid('arep');
  await c.env.DB.prepare(`
    INSERT INTO reg_annual_reports (id, reporting_year, total_licensees, licences_granted,
      licences_refused, determinations_issued, consultations_completed, complaints_received,
      complaints_resolved, inspections_conducted, enforcement_actions, document_r2_key,
      status, published_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, year, b.total_licensees ?? null, licGranted, licRefused,
    dets, b.consultations_completed ?? 0, compReceived, compResolved,
    insp, b.enforcement_actions ?? 0, b.document_r2_key ?? null,
    b.status ?? 'draft', b.published_at ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, licences_granted: licGranted, licences_refused: licRefused, determinations_issued: dets, complaints_received: compReceived, complaints_resolved: compResolved, inspections_conducted: insp } }, 201);
});

// ─── Trader full lifecycle (047) ───────────────────────────────────────

roles.get('/trader/risk-limits', async (c) => c.json({ success: true, data: await listFor(c, 'trader_risk_limits') }));
roles.post('/trader/risk-limits', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.limit_type) return c.json({ success: false, error: 'limit_type required' }, 400);
  const util = b.limit_zar && b.current_zar !== undefined
    ? (b.current_zar / b.limit_zar) * 100
    : (b.limit_units && b.current_units !== undefined
        ? (b.current_units / b.limit_units) * 100
        : b.utilisation_pct ?? null);
  const breachedAt = (util !== null && util !== undefined && util > 100)
    ? (b.breached_at ?? new Date().toISOString())
    : b.breached_at ?? null;
  const id = rid('rl');
  await c.env.DB.prepare(`
    INSERT INTO trader_risk_limits (id, participant_id, limit_type, dimension, limit_zar, limit_units,
      current_zar, current_units, utilisation_pct, breached_at, approved_by, expires_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.limit_type, b.dimension ?? null,
    b.limit_zar ?? null, b.limit_units ?? null,
    b.current_zar ?? 0, b.current_units ?? 0, util,
    breachedAt, b.approved_by ?? null, b.expires_at ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, utilisation_pct: util, breached_at: breachedAt } }, 201);
});

roles.get('/trader/var', async (c) => c.json({ success: true, data: await listFor(c, 'trader_var_calculations') }));
roles.post('/trader/var', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.as_of_date || !b.method || !b.horizon_days || !b.confidence_pct || b.var_zar === undefined) {
    return c.json({ success: false, error: 'as_of_date, method, horizon_days, confidence_pct, var_zar required' }, 400);
  }
  // Expected Shortfall ≈ VaR × 1.3 (rule of thumb for 95% confidence under
  // moderately heavy-tailed distributions). Caller can override.
  const es = b.expected_shortfall_zar ?? b.var_zar * 1.3;
  const id = rid('var');
  await c.env.DB.prepare(`
    INSERT INTO trader_var_calculations (id, participant_id, as_of_date, method, horizon_days,
      confidence_pct, var_zar, expected_shortfall_zar, portfolio_value_zar, stress_var_zar,
      stress_scenario, observation_window_days, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.as_of_date, b.method, b.horizon_days, b.confidence_pct,
    b.var_zar, es, b.portfolio_value_zar ?? null, b.stress_var_zar ?? null,
    b.stress_scenario ?? null, b.observation_window_days ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, expected_shortfall_zar: es } }, 201);
});

roles.get('/trader/hedging', async (c) => c.json({ success: true, data: await listFor(c, 'trader_hedging_strategies') }));
roles.post('/trader/hedging', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.strategy_name || !b.strategy_type) {
    return c.json({ success: false, error: 'strategy_name and strategy_type required' }, 400);
  }
  const id = rid('hed');
  await c.env.DB.prepare(`
    INSERT INTO trader_hedging_strategies (id, participant_id, strategy_name, strategy_type,
      underlying_exposure_mwh, hedge_ratio_pct, cost_zar, expected_savings_zar, effectiveness_pct,
      start_date, end_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.strategy_name, b.strategy_type,
    b.underlying_exposure_mwh ?? null, b.hedge_ratio_pct ?? null,
    b.cost_zar ?? null, b.expected_savings_zar ?? null, b.effectiveness_pct ?? null,
    b.start_date ?? null, b.end_date ?? null, b.status ?? 'proposed', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/trader/options', async (c) => c.json({ success: true, data: await listFor(c, 'trader_options_positions') }));
roles.post('/trader/options', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.contract_type || !b.underlying || !b.side) {
    return c.json({ success: false, error: 'contract_type, underlying, side required' }, 400);
  }
  // Intrinsic-value MTM if strike/underlying/volume given. For calls:
  // long = max(0, S - K) × V × sign;  short = -max(0, S - K) × V.
  let mtm = b.mtm_zar;
  if (mtm === undefined && b.strike_zar_per_mwh && b.underlying_price_zar && b.volume_mwh) {
    const isCall = b.contract_type.includes('call');
    const intrinsic = isCall
      ? Math.max(0, b.underlying_price_zar - b.strike_zar_per_mwh)
      : Math.max(0, b.strike_zar_per_mwh - b.underlying_price_zar);
    mtm = intrinsic * b.volume_mwh * (b.side === 'long' ? 1 : -1);
  }
  const id = rid('opt');
  await c.env.DB.prepare(`
    INSERT INTO trader_options_positions (id, participant_id, contract_type, underlying, side,
      strike_zar_per_mwh, expiry_date, volume_mwh, premium_zar, underlying_price_zar,
      implied_vol_pct, delta, gamma, vega, theta, mtm_zar, status, counterparty, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.contract_type, b.underlying, b.side,
    b.strike_zar_per_mwh ?? null, b.expiry_date ?? null, b.volume_mwh ?? null,
    b.premium_zar ?? null, b.underlying_price_zar ?? null,
    b.implied_vol_pct ?? null, b.delta ?? null, b.gamma ?? null,
    b.vega ?? null, b.theta ?? null, mtm ?? null,
    b.status ?? 'open', b.counterparty ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id, mtm_zar: mtm } }, 201);
});

roles.get('/trader/t2-settlements', async (c) => c.json({ success: true, data: await listFor(c, 'trader_t2_settlements') }));
roles.post('/trader/t2-settlements', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.settlement_date) return c.json({ success: false, error: 'settlement_date required' }, 400);
  const id = rid('t2');
  await c.env.DB.prepare(`
    INSERT INTO trader_t2_settlements (id, participant_id, trade_id, settlement_date, counterparty,
      notional_zar, delivery_volume_mwh, cash_leg_zar, physical_leg_mwh, dvp_status, fail_reason,
      settled_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.trade_id ?? null, b.settlement_date, b.counterparty ?? null,
    b.notional_zar ?? null, b.delivery_volume_mwh ?? null,
    b.cash_leg_zar ?? null, b.physical_leg_mwh ?? null,
    b.dvp_status ?? 'pending', b.fail_reason ?? null,
    b.settled_at ?? null, b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/trader/csa', async (c) => c.json({ success: true, data: await listFor(c, 'trader_csa_terms') }));
roles.post('/trader/csa', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.counterparty_name) return c.json({ success: false, error: 'counterparty_name required' }, 400);
  const id = rid('csa');
  await c.env.DB.prepare(`
    INSERT INTO trader_csa_terms (id, participant_id, counterparty_id, counterparty_name, csa_version,
      threshold_zar, independent_amount_zar, minimum_transfer_zar, eligible_collateral, haircut_pct,
      rounding_zar, base_currency, governing_law, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.counterparty_id ?? null, b.counterparty_name, b.csa_version ?? null,
    b.threshold_zar ?? null, b.independent_amount_zar ?? null, b.minimum_transfer_zar ?? null,
    b.eligible_collateral ? JSON.stringify(b.eligible_collateral) : null,
    b.haircut_pct ?? null, b.rounding_zar ?? null, b.base_currency ?? 'ZAR',
    b.governing_law ?? null, b.status ?? 'active', b.notes ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

roles.get('/trader/pnl', async (c) => c.json({ success: true, data: await listFor(c, 'trader_pnl_attribution') }));
roles.post('/trader/pnl', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.as_of_date) return c.json({ success: false, error: 'as_of_date required' }, 400);
  const total = b.total_pnl_zar ?? (
    (b.realised_pnl_zar || 0) + (b.unrealised_pnl_zar || 0) +
    (b.carry_zar || 0) + (b.fees_zar || 0) + (b.fx_pnl_zar || 0)
  );
  const id = rid('pnl');
  await c.env.DB.prepare(`
    INSERT INTO trader_pnl_attribution (id, participant_id, as_of_date, book, realised_pnl_zar,
      unrealised_pnl_zar, delta_pnl_zar, gamma_pnl_zar, vega_pnl_zar, theta_pnl_zar,
      carry_zar, fees_zar, fx_pnl_zar, total_pnl_zar, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, b.as_of_date, b.book ?? null,
    b.realised_pnl_zar ?? 0, b.unrealised_pnl_zar ?? 0,
    b.delta_pnl_zar ?? 0, b.gamma_pnl_zar ?? 0, b.vega_pnl_zar ?? 0, b.theta_pnl_zar ?? 0,
    b.carry_zar ?? 0, b.fees_zar ?? 0, b.fx_pnl_zar ?? 0, total, b.notes ?? null).run();
  return c.json({ success: true, data: { id, total_pnl_zar: total } }, 201);
});

export default roles;
