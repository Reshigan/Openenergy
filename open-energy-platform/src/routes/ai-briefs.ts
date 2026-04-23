// ═══════════════════════════════════════════════════════════════════════════
// AI role-briefs — one endpoint per role that pulls the caller's current
// national-scale state into context, then asks the role-specific briefing
// copilot for a prioritised action list + narrative headline.
//
// Endpoint shape (POST /api/ai-briefs/:role):
//   Returns { success, data: { text, structured?, model, fallback } }
//
// Callers (usually the role's Workbench page) use `structured.actions` for
// the action tiles and `text` for the narrative headline.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { ask } from '../utils/ai';

const briefs = new Hono<HonoEnv>();
briefs.use('*', authMiddleware);

type RoleKey = 'regulator' | 'grid_operator' | 'trader' | 'lender' |
               'ipp_developer' | 'offtaker' | 'carbon_fund' | 'admin';

briefs.post('/:role', async (c) => {
  const user = getCurrentUser(c);
  const role = c.req.param('role') as RoleKey;

  // Role guard — the brief is from the caller's perspective. Admin may
  // request any role's brief for operational reasons (e.g. support).
  if (user.role !== 'admin' && user.role !== role) {
    return c.json({ success: false, error: 'Can only request your own role brief' }, 403);
  }

  try {
    const context = await contextFor(c.env, role, user.id);
    const intent = ('brief.' + role) as
      'brief.regulator' | 'brief.grid_operator' | 'brief.trader' | 'brief.lender' |
      'brief.ipp_developer' | 'brief.offtaker' | 'brief.carbon_fund' | 'brief.admin';
    const result = await ask(c.env, {
      intent,
      role: user.role,
      prompt: `Produce today's ${role.replace('_', ' ')} briefing. Use the context below verbatim for facts; do not invent data.`,
      context,
      max_tokens: 900,
    });
    return c.json({ success: true, data: result, context });
  } catch (err) {
    return c.json(
      { success: false, error: 'Brief generation failed', message: (err as Error).message },
      500,
    );
  }
});

async function contextFor(env: HonoEnv['Bindings'], role: RoleKey, userId: string): Promise<Record<string, unknown>> {
  switch (role) {
    case 'regulator':       return regulatorContext(env);
    case 'grid_operator':   return gridOperatorContext(env);
    case 'trader':          return traderContext(env, userId);
    case 'lender':          return lenderContext(env, userId);
    case 'ipp_developer':   return ippContext(env, userId);
    case 'offtaker':        return offtakerContext(env, userId);
    case 'carbon_fund':     return carbonContext(env, userId);
    case 'admin':           return adminContext(env);
  }
}

async function regulatorContext(env: HonoEnv['Bindings']) {
  const [alerts, cases, tariffs, expiring] = await Promise.all([
    env.DB.prepare(
      `SELECT id, rule_code, severity, participant_id, entity_type, entity_id, raised_at
         FROM regulator_surveillance_alerts WHERE status IN ('open','investigating')
        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
        LIMIT 30`,
    ).all(),
    env.DB.prepare(
      `SELECT id, case_number, respondent_name, severity, status, opened_at, penalty_amount_zar
         FROM regulator_enforcement_cases WHERE status NOT IN ('closed','withdrawn')
        ORDER BY opened_at DESC LIMIT 30`,
    ).all(),
    env.DB.prepare(
      `SELECT id, reference_number, submission_title, status, tariff_period_start, tariff_period_end
         FROM regulator_tariff_submissions WHERE status IN ('submitted','public_hearing')
        ORDER BY submitted_at DESC LIMIT 20`,
    ).all(),
    env.DB.prepare(
      `SELECT id, licence_number, licensee_name, licence_type, expiry_date
         FROM regulator_licences WHERE status = 'active'
           AND expiry_date IS NOT NULL AND expiry_date <= date('now','+90 days')
        ORDER BY expiry_date ASC LIMIT 30`,
    ).all(),
  ]);
  return {
    surveillance_alerts: alerts.results || [],
    enforcement_cases: cases.results || [],
    pending_tariff_submissions: tariffs.results || [],
    licences_expiring_90d: expiring.results || [],
  };
}

async function gridOperatorContext(env: HonoEnv['Bindings']) {
  const [schedules, instructions, curtailments, tenders, outages] = await Promise.all([
    env.DB.prepare(
      `SELECT id, schedule_type, trading_day, status, total_scheduled_mwh
         FROM dispatch_schedules WHERE trading_day = date('now') OR trading_day = date('now','+1 day')
        ORDER BY trading_day, gate_closure_at LIMIT 10`,
    ).all(),
    env.DB.prepare(
      `SELECT id, instruction_number, participant_id, instruction_type, status, target_mw, effective_from, penalty_amount_zar
         FROM dispatch_instructions
        WHERE status IN ('issued','non_compliant')
           OR issued_at >= datetime('now','-12 hours')
        ORDER BY issued_at DESC LIMIT 30`,
    ).all(),
    env.DB.prepare(
      `SELECT id, notice_number, affected_zone, curtailment_mw, severity, effective_from, status
         FROM curtailment_notices WHERE status = 'active'
        ORDER BY effective_from DESC LIMIT 20`,
    ).all(),
    env.DB.prepare(
      `SELECT t.id, t.tender_number, t.capacity_required_mw, t.ceiling_price_zar_mw_h, p.service_type, t.gate_closure_at
         FROM ancillary_service_tenders t
         JOIN ancillary_service_products p ON p.id = t.product_id
        WHERE t.status = 'open' ORDER BY t.gate_closure_at LIMIT 20`,
    ).all(),
    env.DB.prepare(
      `SELECT id, outage_number, outage_type, severity, affected_zone, affected_load_mw, affected_customers, status
         FROM grid_outages WHERE status IN ('open','investigating','in_progress','partial_restoration')
        ORDER BY reported_at DESC LIMIT 30`,
    ).all(),
  ]);
  return {
    todays_schedules: schedules.results || [],
    instructions_attention: instructions.results || [],
    active_curtailments: curtailments.results || [],
    open_tenders: tenders.results || [],
    active_outages: outages.results || [],
  };
}

async function traderContext(env: HonoEnv['Bindings'], userId: string) {
  const [positions, margins, marks, headroom] = await Promise.all([
    env.DB.prepare(
      `SELECT energy_type, delivery_date, net_volume_mwh, avg_entry_price, unrealised_pnl_zar, last_mark_price
         FROM trader_positions WHERE participant_id = ?`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT id, exposure_zar, initial_margin_zar, posted_collateral_zar, shortfall_zar, due_by
         FROM margin_calls WHERE participant_id = ? AND status IN ('issued','acknowledged')
        ORDER BY as_of DESC LIMIT 10`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT energy_type, delivery_date, mark_date, mark_price_zar_mwh, source
         FROM mark_prices WHERE mark_date >= date('now','-7 days')
        ORDER BY mark_date DESC LIMIT 20`,
    ).all(),
    env.DB.prepare(
      `SELECT cl.limit_zar, cl.basis,
              COALESCE((SELECT SUM(remaining_volume_mwh * COALESCE(price, 0))
                          FROM trade_orders
                         WHERE participant_id = ? AND status IN ('open','partially_filled')), 0) AS open_exposure_zar
         FROM credit_limits cl
        WHERE cl.participant_id = ?
          AND (cl.effective_to IS NULL OR cl.effective_to >= datetime('now'))
          AND cl.effective_from <= datetime('now')
        ORDER BY cl.effective_from DESC LIMIT 1`,
    ).bind(userId, userId).first(),
  ]);
  return {
    positions: positions.results || [],
    open_margin_calls: margins.results || [],
    recent_marks: marks.results || [],
    credit: headroom || null,
  };
}

async function lenderContext(env: HonoEnv['Bindings'], userId: string) {
  const [covs, tests, ie, insurance] = await Promise.all([
    env.DB.prepare(
      `SELECT id, project_id, covenant_code, covenant_name, operator, threshold, material_adverse_effect
         FROM covenants WHERE lender_participant_id = ? AND status = 'active' LIMIT 50`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT ct.id, ct.covenant_id, ct.test_period, ct.test_date, ct.measured_value, ct.result, c.covenant_code
         FROM covenant_tests ct
         JOIN covenants c ON c.id = ct.covenant_id
        WHERE c.lender_participant_id = ? AND ct.test_date >= date('now','-30 days')
          AND ct.result IN ('warn','breach')
        ORDER BY ct.test_date DESC LIMIT 30`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT id, project_id, cert_number, cert_type, physical_progress_pct, certified_amount_zar, status, cert_issue_date
         FROM ie_certifications
        WHERE status IN ('submitted','under_review')
        ORDER BY cert_issue_date DESC LIMIT 20`,
    ).all(),
    env.DB.prepare(
      `SELECT ip.id, ip.policy_number, ip.policy_type, ip.insurer, ip.period_end, p.developer_id AS project_developer_id
         FROM insurance_policies ip
         JOIN ipp_projects p ON p.id = ip.project_id
        WHERE ip.status = 'active' AND ip.period_end <= date('now','+90 days')
        ORDER BY ip.period_end ASC LIMIT 30`,
    ).all(),
  ]);
  return {
    covenants: covs.results || [],
    recent_tests_warn_or_breach: tests.results || [],
    ie_pending_review: ie.results || [],
    insurance_expiring_90d: insurance.results || [],
  };
}

async function ippContext(env: HonoEnv['Bindings'], userId: string) {
  const [epc, variations, ea, insurance, community] = await Promise.all([
    env.DB.prepare(
      `SELECT ec.id, ec.contractor_name, ec.lump_sum_zar, ec.status, ec.target_completion_date
         FROM epc_contracts ec
         JOIN ipp_projects p ON p.id = ec.project_id
        WHERE p.developer_id = ? AND ec.status NOT IN ('closed','terminated') LIMIT 20`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT ev.id, ev.variation_number, ev.value_zar, ev.time_impact_days, ev.status, ec.id AS epc_contract_id
         FROM epc_variations ev
         JOIN epc_contracts ec ON ec.id = ev.epc_contract_id
         JOIN ipp_projects p ON p.id = ec.project_id
        WHERE p.developer_id = ? AND ev.status = 'proposed' LIMIT 20`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT ec.id, ec.authorisation_id, ec.condition_reference, ec.compliance_status, ec.due_date
         FROM environmental_compliance ec
         JOIN environmental_authorisations ea ON ea.id = ec.authorisation_id
         JOIN ipp_projects p ON p.id = ea.project_id
        WHERE p.developer_id = ?
          AND (ec.compliance_status = 'non_compliant'
               OR (ec.due_date IS NOT NULL AND ec.due_date <= date('now','+30 days')))
        LIMIT 30`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT ip.id, ip.policy_number, ip.policy_type, ip.insurer, ip.period_end
         FROM insurance_policies ip
         JOIN ipp_projects p ON p.id = ip.project_id
        WHERE p.developer_id = ? AND ip.status = 'active' AND ip.period_end <= date('now','+90 days')
        ORDER BY ip.period_end ASC LIMIT 20`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT ce.id, ce.engagement_type, ce.engagement_date, ce.follow_up_date, ce.topic
         FROM community_engagements ce
         JOIN ipp_projects p ON p.id = ce.project_id
        WHERE p.developer_id = ?
          AND ce.follow_up_date IS NOT NULL
          AND ce.follow_up_date <= date('now','+14 days')
        ORDER BY ce.follow_up_date ASC LIMIT 20`,
    ).bind(userId).all(),
  ]);
  return {
    active_epc: epc.results || [],
    pending_variations: variations.results || [],
    ea_compliance_attention: ea.results || [],
    insurance_expiring: insurance.results || [],
    community_follow_ups: community.results || [],
  };
}

async function offtakerContext(env: HonoEnv['Bindings'], userId: string) {
  const [groups, dp, recs, retirements] = await Promise.all([
    env.DB.prepare(
      `SELECT id, group_name, group_type, cost_centre, billing_entity
         FROM offtaker_site_groups WHERE participant_id = ? LIMIT 20`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT id, name, location, meter_id, annual_kwh, tariff_category
         FROM offtaker_delivery_points WHERE participant_id = ? AND status = 'active'
         LIMIT 30`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT id, certificate_serial, mwh_represented, technology, status, issuance_date
         FROM rec_certificates WHERE owner_participant_id = ? AND status IN ('issued','transferred')
        ORDER BY issuance_date DESC LIMIT 20`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT id, retirement_purpose, consumption_mwh, retired_at
         FROM rec_retirements WHERE retiring_participant_id = ?
        ORDER BY retired_at DESC LIMIT 20`,
    ).bind(userId).all(),
  ]);
  return {
    site_groups: groups.results || [],
    delivery_points: dp.results || [],
    active_rec_certificates: recs.results || [],
    recent_retirements: retirements.results || [],
  };
}

async function carbonContext(env: HonoEnv['Bindings'], userId: string) {
  const [vintages, mrv, verified, tax] = await Promise.all([
    env.DB.prepare(
      `SELECT v.id, v.vintage_year, v.credits_issued, v.credits_retired, v.sa_carbon_tax_eligible, r.registry_code
         FROM credit_vintages v
         JOIN carbon_registries r ON r.id = v.registry_id
        ORDER BY v.vintage_year DESC LIMIT 30`,
    ).all(),
    env.DB.prepare(
      `SELECT id, project_id, reporting_period_start, reporting_period_end, claimed_reductions_tco2e, status
         FROM mrv_submissions WHERE submitted_by = ? AND status IN ('submitted','validation','draft')
        ORDER BY reporting_period_end DESC LIMIT 20`,
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT mv.id, mv.submission_id, mv.opinion, mv.verified_reductions_tco2e, mv.verification_date
         FROM mrv_verifications mv
         JOIN mrv_submissions ms ON ms.id = mv.submission_id
        WHERE (ms.submitted_by = ? OR ? = 'admin')
          AND mv.verification_date >= date('now','-90 days')
        ORDER BY mv.verification_date DESC LIMIT 20`,
    ).bind(userId, 'whatever').all(),
    env.DB.prepare(
      `SELECT id, tax_year, gross_tax_liability_zar, offset_limit_zar, offset_applied_zar, net_tax_liability_zar, status
         FROM carbon_tax_offset_claims WHERE taxpayer_participant_id = ?
        ORDER BY tax_year DESC LIMIT 10`,
    ).bind(userId).all(),
  ]);
  return {
    active_vintages: vintages.results || [],
    pending_mrv: mrv.results || [],
    verified_90d: verified.results || [],
    tax_claims: tax.results || [],
  };
}

async function adminContext(env: HonoEnv['Bindings']) {
  const [tenants, provisioning, invoices, settlement, flags] = await Promise.all([
    env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM tenants GROUP BY status`,
    ).all(),
    env.DB.prepare(
      `SELECT id, requested_name, requested_tier, admin_email, country, expected_participants, created_at
         FROM tenant_provisioning_requests WHERE status = 'pending'
        ORDER BY created_at DESC LIMIT 20`,
    ).all(),
    env.DB.prepare(
      `SELECT status, COUNT(*) AS n, COALESCE(SUM(total_zar), 0) AS total_zar
         FROM tenant_invoices WHERE status IN ('issued','overdue','disputed') GROUP BY status`,
    ).all(),
    env.DB.prepare(
      `SELECT id, run_type, period_start, period_end, status, error_message, started_at
         FROM settlement_runs WHERE status = 'failed' AND started_at >= date('now','-7 days')
        ORDER BY started_at DESC LIMIT 20`,
    ).all(),
    env.DB.prepare(
      `SELECT flag_key, rollout_strategy, rollout_config_json, enabled
         FROM feature_flags WHERE enabled = 1
           AND rollout_strategy IN ('percentage','by_tier','by_tenant','by_role')
         LIMIT 20`,
    ).all(),
  ]);
  return {
    tenant_counts_by_status: tenants.results || [],
    pending_provisioning: provisioning.results || [],
    platform_invoices_outstanding: invoices.results || [],
    failed_settlement_runs_7d: settlement.results || [],
    active_rollouts: flags.results || [],
  };
}

export default briefs;
