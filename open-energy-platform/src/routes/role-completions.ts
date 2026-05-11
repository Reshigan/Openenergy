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

export default roles;
