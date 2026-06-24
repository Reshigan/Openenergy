// ═══════════════════════════════════════════════════════════════════════════
// W7 — National Dashboard. GET /api/national-dashboard
// Admin-only. Reads ONLY pre-aggregated rollup tables (oe_chain_metrics,
// oe_metrics_daily, oe_role_action_queue) — never raw chain tables.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

// Domain → chain_key prefix / pattern mapping
const DOMAIN_CHAINS: Record<string, string[]> = {
  trading: [
    'algo_certification', 'best_execution', 'counterparty_margin', 'market_abuse_case',
    'poslimit_case', 'trade_allocation', 'trade_report', 'tariff_determination',
    'pnl_attribution', 'benchmark_transition', 'pretrade_credit', 'settlement_fail',
    'ccp_assessment', 'cross_border_trade', 'fsca_conduct_report', 'fsca_compliance',
  ],
  carbon: [
    'carbon_budget', 'carbon_erpa', 'carbon_issuance', 'carbon_offset_claim',
    'carbon_registration', 'carbon_registry_transfer', 'carbon_retirement',
    'carbon_reversal', 'carbon_scope3_disclosure', 'carbon_tax_return',
    'crediting_period_renewal', 'methodology_amendment', 'mrv_submissions',
    'poa_cpa_inclusion', 'carbon_credit_rating', 'esg_disclosure', 'vcm_project',
    'carbon_mrv', 'sustainability_marketplace', 'sustainability_transaction',
    'certificate_track', 'rec_lifecycle', 'rec_device_registration', 'rec_issuance',
    'vcm_order_book',
  ],
  ipp: [
    'cod_chain', 'credit_insurance', 'curtailment_claim', 'dscr_report',
    'ed_commitment', 'export_curtailment', 'facility_amendment', 'gtia',
    'hse_incident', 'insurance_claim', 'kyc_verification', 'licence_application',
    'licence_renewal', 'milestone_variance_report', 'planned_outage', 'procurement_rfp',
    'stage_gate', 'ipp_issues', 'ipp_risk', 'ipp_stakeholder', 'ipp_lessons_learned',
    'ipp_ncr', 'ipp_method_statement', 'ipp_env_monitoring', 'ipp_mir',
    'ipp_subcontractor', 'ipp_progress_claim', 'ipp_tq', 'ipp_diary',
    'ipp_site_instruction', 'ipp_dlp_defect', 'ipp_variation_order', 'ipp_payment_cert',
    'ipp_final_completion', 'ipp_om_handover', 'ipp_land_register', 'ipp_env_closure',
    'ipp_commissioning_test', 'ipp_ie_cert', 'ipp_tpa', 'ipp_ppa_variation',
    'ipp_change_of_control', 'ipp_refinancing', 'ipp_fm', 'ipp_annual_report',
    'ipp_contractor_default', 'ipp_eco_report', 'ipp_lta_certificate',
    'ipp_land_amendment', 'ipp_community_trust', 'ipp_grid_compliance', 'ipp_ccc',
    'ipp_om_contract', 'ipp_bfs', 'ipp_ea_amendment', 'ipp_wul', 'ipp_hra',
    'ipp_ael', 'ipp_force_majeure', 'ipp_lc_report', 'ipp_milestone_cert',
    'ipp_esmr', 'ipp_ie_annual_review', 'ipp_insurance_renewal', 'ipp_perf_security',
    'ipp_cep_compliance', 'ipp_sed_compliance', 'ipp_bbbee_verification',
    'ipp_lender_reporting', 'ipp_licence_returns', 'ipp_reipppp_reports',
    'ipp_equity_transfer', 'ipp_quarterly_gen_report', 'ipp_annual_compliance',
    'ipp_annual_audit', 'ipp_emp_compliance', 'ipp_cp_tracker', 'ipp_licence_obligation',
    'ipp_schedule', 'ipp_evm', 'ipp_document_control', 'ipp_submittal', 'ipp_rfi',
    'ipp_change_order', 'gca_connection', 'connection_energization', 'project_risk',
    'project_change_order', 'submittal_rfi', 'dfr_chain', 'punch_list', 'itp_chain',
    'handover_dossier', 'ipp_bonds',
  ],
  lender: [
    'capital_adequacy_report', 'covenant_certificate', 'cp_clearance',
    'credit_facility_application', 'disbursement_case', 'drawdown', 'esap_monitoring',
    'loan_default', 'loan_transfer', 'reserve_account', 'security_perfection',
    'loan_restructure', 'sll_kpi', 'green_bond',
  ],
  offtaker: [
    'demand_response_event', 'green_tariff_disclosure', 'ppa_contract_chain',
    'ppa_payment_security', 'ppa_termination', 'rec_lifecycle', 'slb_kpi_ratchet',
    'tariff_indexation', 'wheeling_access', 'ppa_annual_recon', 'ppa_nomination',
    'ppa_change_in_law', 'curtailment_claim', 'unserved_energy',
  ],
  grid: [
    'availability_guarantee', 'black_start', 'connection_energization',
    'eop_activation', 'gca_connection', 'grid_capacity_allocation',
    'grid_code_compliance', 'load_curtailment', 'reserve_activation',
    'substation_asset', 'transmission_outage', 'imbalance_settlement',
    'dispatch_nomination', 'wheeling_charges', 'rez_capacity', 'protection_relay',
  ],
  regulator: [
    'compliance_inspection', 'disposition_case', 'enforcement_action',
    'market_conduct_exam', 'public_consultation', 'regulator_complaint',
    'regulator_levy', 'sseg_registration', 'licence_application', 'licence_renewal',
    'enforcement_action_s35', 'consultation_notice',
  ],
  support: [
    'change_request', 'csat_record', 'problem_record', 'security_remediation',
    'service_request', 'sla_performance_report', 'spare_parts_provisioning',
    'vendor_escalation', 'warranty_recovery', 'work_order', 'kyc_chain',
    'smart_meter_asset', 'station_participant_link', 'oem_fco', 'scada_connector',
    'mqtt_opcua_connector', 'strate_swift_connector', 'sap_oracle_erp_connector',
    'government_filing_connector',
  ],
  esums: [
    'asset_prognostic', 'benchmark_transition', 'bess_soh', 'permit_to_work',
    'pm_compliance', 'pr_chain', 'smart_meter_asset', 'soiling_audit',
    'esums_commissioning', 'anomaly_detection_ml', 'rul_prediction_ml',
    'fault_fingerprint_ml', 'ntt_comparison_battery', 'esap_compliance',
    'generation_revenue_assurance', 'service_contract', 'warranty_claim',
    'work_order', 'export_curtailment',
  ],
};

function assignDomain(chainKey: string): string {
  const lower = chainKey.toLowerCase().replace(/-/g, '_');
  for (const [domain, keys] of Object.entries(DOMAIN_CHAINS)) {
    if (keys.some((k) => lower.includes(k.replace(/-/g, '_')))) return domain;
  }
  return 'other';
}

r.get('/', async (c) => {
  const user = getCurrentUser(c);
  // Read-only national rollup: admin owns it, but the regulator is the natural
  // oversight consumer of a market-wide picture (ERA s.10 monitoring). Both are
  // oversight roles that read zero as "all-clear" and never write here; no other
  // role sees cross-tenant aggregates.
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Admin or regulator only' }, 403);
  }

  const db = c.env.DB;
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString().slice(0, 10);

  const safeQuery = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  // KPI queries
  const [
    chainMetricsRows,
    events24hRow,
    breachRows30d,
    value30dRow,
    openActionsRow,
    regulatorCrossings30dRow,
    dailyRows14d,
    roleQueueRows,
  ] = await Promise.all([
    safeQuery(() => db.prepare(
      `SELECT chain_key, open_count, terminal_count, breach_count, events_30d, value_30d_zar
         FROM oe_chain_metrics
        ORDER BY events_30d DESC`,
    ).all<{
      chain_key: string; open_count: number; terminal_count: number;
      breach_count: number; events_30d: number; value_30d_zar: number;
    }>(), { results: [] } as any),

    safeQuery(() => db.prepare(
      `SELECT COALESCE(SUM(events_count), 0) AS total
         FROM oe_metrics_daily
        WHERE metric_date = ?`,
    ).bind(today).first<{ total: number }>(), null),

    safeQuery(() => db.prepare(
      `SELECT COALESCE(SUM(sla_breaches), 0) AS breaches,
              COALESCE(SUM(events_count), 0) AS events
         FROM oe_metrics_daily
        WHERE metric_date >= ?`,
    ).bind(thirtyDaysAgo).first<{ breaches: number; events: number }>(), null),

    safeQuery(() => db.prepare(
      `SELECT COALESCE(SUM(value_total_zar), 0) AS total
         FROM oe_metrics_daily
        WHERE metric_date >= ?`,
    ).bind(thirtyDaysAgo).first<{ total: number }>(), null),

    safeQuery(() => db.prepare(
      `SELECT COUNT(*) AS total
         FROM oe_role_action_queue
        WHERE status = 'pending'`,
    ).first<{ total: number }>(), null),

    safeQuery(() => db.prepare(
      `SELECT COALESCE(SUM(regulator_crossings), 0) AS total
         FROM oe_metrics_daily
        WHERE metric_date >= ?`,
    ).bind(thirtyDaysAgo).first<{ total: number }>(), null),

    safeQuery(() => db.prepare(
      `SELECT metric_date, COALESCE(SUM(events_count), 0) AS events,
              COALESCE(SUM(value_total_zar), 0) AS value_zar
         FROM oe_metrics_daily
        WHERE metric_date >= ?
        GROUP BY metric_date
        ORDER BY metric_date ASC`,
    ).bind(fourteenDaysAgo).all<{ metric_date: string; events: number; value_zar: number }>(), { results: [] } as any),

    safeQuery(() => db.prepare(
      `SELECT target_role AS role, COUNT(*) AS pending
         FROM oe_role_action_queue
        WHERE status = 'pending'
        GROUP BY target_role
        ORDER BY pending DESC`,
    ).all<{ role: string; pending: number }>(), { results: [] } as any),
  ]);

  const chainRows = (chainMetricsRows.results || []) as Array<{
    chain_key: string; open_count: number; terminal_count: number;
    breach_count: number; events_30d: number; value_30d_zar: number;
  }>;

  // Active chains: those with open_count > 0
  const activeChains = chainRows.filter((r) => Number(r.open_count) > 0).length;
  const events24h = Number(events24hRow?.total ?? 0);
  const breaches30d = Number(breachRows30d?.breaches ?? 0);
  const totalEvents30d = Number(breachRows30d?.events ?? 0);
  const slaBreachRatePct = totalEvents30d > 0
    ? Math.round((breaches30d / totalEvents30d) * 10000) / 100
    : 0;
  const value30dZar = Number(value30dRow?.total ?? 0);
  const openActions = Number(openActionsRow?.total ?? 0);
  const regulatorCrossings30d = Number(regulatorCrossings30dRow?.total ?? 0);

  // Domain rollups
  const domainMap: Record<string, {
    chains_active: number; events_30d: number; breach_count: number;
    events_total: number; value_30d_zar: number;
  }> = {};
  for (const domain of Object.keys(DOMAIN_CHAINS)) {
    domainMap[domain] = { chains_active: 0, events_30d: 0, breach_count: 0, events_total: 0, value_30d_zar: 0 };
  }

  for (const row of chainRows) {
    const domain = assignDomain(row.chain_key);
    if (!domainMap[domain]) domainMap[domain] = { chains_active: 0, events_30d: 0, breach_count: 0, events_total: 0, value_30d_zar: 0 };
    if (Number(row.open_count) > 0) domainMap[domain].chains_active += 1;
    domainMap[domain].events_30d += Number(row.events_30d ?? 0);
    domainMap[domain].breach_count += Number(row.breach_count ?? 0);
    domainMap[domain].events_total += Number(row.events_30d ?? 0);
    domainMap[domain].value_30d_zar += Number(row.value_30d_zar ?? 0);
  }

  const domain_rollups = Object.entries(domainMap)
    .filter(([d]) => d !== 'other')
    .map(([domain, agg]) => ({
      domain,
      chains_active: agg.chains_active,
      events_30d: agg.events_30d,
      breach_rate_pct: agg.events_total > 0
        ? Math.round((agg.breach_count / agg.events_total) * 10000) / 100
        : 0,
      value_30d_zar: Math.round(agg.value_30d_zar),
    }));

  // Top 20 chain health
  const chain_health = chainRows.slice(0, 20).map((row) => {
    const events = Number(row.events_30d ?? 0);
    const breaches = Number(row.breach_count ?? 0);
    return {
      chain_key: row.chain_key,
      open_count: Number(row.open_count ?? 0),
      breach_count: breaches,
      events_30d: events,
      value_30d_zar: Math.round(Number(row.value_30d_zar ?? 0)),
      sla_adherence_pct: events > 0
        ? Math.round(((events - breaches) / events) * 10000) / 100
        : 100,
    };
  });

  // Role queue depth
  const role_queue_depth = (roleQueueRows.results || []) as Array<{ role: string; pending: number }>;

  // Event trend (14 days)
  const event_trend = ((dailyRows14d.results || []) as Array<{ metric_date: string; events: number; value_zar: number }>).map((r) => ({
    date: r.metric_date,
    events: Number(r.events ?? 0),
    value_zar: Math.round(Number(r.value_zar ?? 0)),
  }));

  return c.json({
    data: {
      kpis: {
        active_chains: activeChains,
        events_24h: events24h,
        sla_breach_rate_pct: slaBreachRatePct,
        value_30d_zar: Math.round(value30dZar),
        open_actions: openActions,
        regulator_crossings_30d: regulatorCrossings30d,
      },
      domain_rollups,
      chain_health,
      role_queue_depth,
      event_trend,
    },
  });
});

export default r;
