// ═══════════════════════════════════════════════════════════════════════════
// Wave 130 - NTT Comparison Battery chain.
//
// PHASE D WAVE 4 OF 4 - CLOSES PHASE D. AGGREGATOR over W127 (anomaly LSTM-AE)
// + W128 (RUL Cox PH survival) + W129 (fault-fingerprint multi-class) against
// an emulated NTT IoT/O&M baseline. Each row = ONE COMPARISON CYCLE (typically
// nightly). Produces continuously updated, revenue-weighted, statistically
// significance-gated, tamper-evident "savings-vs-NTT-30%" KPI streaming into
// the Esums dashboard hero.
//
// Beats: NTT IoT for Energy + NTT GreenOps + NTT "Predictive Maintenance"
// stack (and the GE APM / IBM Maximo APM / OSIsoft PI AF / Aveva PI Insight
// benchmarks NTT typically resells). Closes [[project_esums_predictive_vs_ntt]].
//
// 16 actions: propose_cycle / sync_baselines / bind_telemetry_window /
//   run_ntt_emulation / collect_champion_predictions / compute_counterfactuals /
//   revenue_weight_score / test_significance / certify_savings / publish_audit /
//   trigger_retraining / archive / flag_significance_failure / rollback_cycle /
//   recall_certification / activate_failover.
//
// SIGNATURE W130 regulator crossings:
//   recall_certification -> EVERY tier (W130 SIGNATURE - sister of W127/W128/W129
//     rollback hard line; recall = paid out / reported wrong savings numbers,
//     SARS + NERSA + audit committee always notified.)
//   publish_audit -> EVERY tier WHEN regulator_reportable_diversion
//   certify_savings -> multi_jurisdiction_fleet + fleet_systemic WHEN
//     ntt_contract_renegotiation_trigger
//   flag_significance_failure -> fleet_systemic only
//   sla_breached -> HEAVY tiers only
//
// Write {admin, support}. READ all 9 personas. NO public peer endpoint -
// INTERNAL ML governance / Esums-team-only.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaDeadlineFor,
  slaWindowHours,
  tierForScope,
  effectiveTier,
  countFloorFlags,
  floorAtLargeFleet,
  floorAtFleetSystemic,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  daysToNextCycle,
  daysToModelCardExpiry,
  bridgesToW127AnomalyDetection,
  bridgesToW128RulSurvival,
  bridgesToW129FaultFingerprint,
  bridgesToW71AssetPrognostics,
  bridgesToW118AuditChain,
  controlEffectivenessIndex,
  batteryHealthBand,
  NTT_CONTRACT_RENEG_CONSECUTIVE_CYCLES,
  MATERIAL_SAVINGS_FLOOR_ZAR,
  REGULATOR_DIVERSION_DISAGREEMENT_FLOOR_PCT,
  NTT_SAVINGS_TARGET_PCT,
  type NcbStatus,
  type NcbAction,
  type NcbTier,
} from '../utils/ntt-comparison-battery-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W130 = admin + support write (SAME as W71/W127/W128/W129).
const WRITE_ROLES = new Set(['admin', 'support']);

type ModelCardStatus = 'draft' | 'approved' | 'published' | 'expired';

// ─── Row + event interfaces ───────────────────────────────────────────────
interface NcbRow {
  id: string;
  cycle_number: string;
  cycle_kind: string;
  cycle_window_start: string | null;
  cycle_window_end: string | null;
  asset_class: string;
  assets_covered: number | null;
  jurisdiction_count: number | null;
  safety_critical: number;
  champion_anomaly_model_version: string | null;
  champion_rul_model_version: string | null;
  champion_fault_model_version: string | null;
  ntt_baseline_version: string | null;
  prior_cycle_ref: string | null;
  next_cycle_due_at: string | null;
  model_card_expiry_at: string | null;

  // 5 bridges
  w127_anomaly_detection_ref: string | null;
  w128_rul_survival_ref: string | null;
  w129_fault_fingerprint_ref: string | null;
  w71_asset_prognostics_ref: string | null;
  w118_block_ref: string | null;

  // 5 floor flags
  material_savings_threshold_breached: number;
  ntt_contract_renegotiation_trigger: number;
  regulator_reportable_diversion: number;
  sox_ml_governance_required: number;
  iso_42001_required: number;

  // Sustained trigger counters
  consecutive_cycles_above_target: number;
  consecutive_cycles_below_target: number;
  ntt_emulation_payload: string | null;
  champion_predictions_payload: string | null;
  counterfactuals_payload: string | null;

  // 13 comparison metric fields
  total_savings_zar: number | null;
  cumulative_savings_zar: number | null;
  false_positive_savings_zar: number | null;
  false_negative_savings_zar: number | null;
  savings_vs_ntt_pct: number | null;
  paired_t_pvalue: number | null;
  wilcoxon_pvalue: number | null;
  brier_skill_score_vs_ntt: number | null;
  confidence_interval_lower_zar: number | null;
  confidence_interval_upper_zar: number | null;
  confidence_interval_width_zar: number | null;
  reconciliation_with_w71_savings_ledger_pct: number | null;
  audit_hash_published: string | null;

  // Governance / performance components
  ntt_baseline_comparison_pct: number | null;
  inference_latency_p50_ms: number | null;
  inference_latency_p99_ms: number | null;
  model_card_status: ModelCardStatus | null;
  iso27001_controls_ok: number;
  soc2_type2_controls_ok: number;
  sox_ml_governance_ok: number;
  iso_42001_compliance_score: number | null;
  control_effectiveness_index: number | null;

  current_tier: NcbTier;
  authority_required: string | null;
  urgency_band: string | null;
  battery_health_band: string | null;

  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;

  chain_status: NcbStatus;
  cycle_proposed_at: string | null;
  baselines_synced_at: string | null;
  telemetry_window_bound_at: string | null;
  ntt_emulation_run_at: string | null;
  champion_predictions_collected_at: string | null;
  counterfactuals_computed_at: string | null;
  revenue_weighted_scored_at: string | null;
  significance_tested_at: string | null;
  savings_certified_at: string | null;
  audit_published_at: string | null;
  retraining_triggered_at: string | null;
  archived_at: string | null;
  significance_failed_at: string | null;
  rolled_back_at: string | null;
  recalled_at: string | null;
  failover_to_prior_cycle_at: string | null;
  regulator_crossed_at: string | null;

  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  last_sla_breach_at: string | null;
  escalation_level: number;
  days_to_next_cycle: number | null;
  days_to_model_card_expiry: number | null;

  tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface NcbEventRow {
  id: string;
  cycle_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_tier: string | null;
  to_tier: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<NcbStatus, keyof NcbRow | null> = {
  cycle_proposed:                 'cycle_proposed_at',
  baselines_synced:               'baselines_synced_at',
  telemetry_window_bound:         'telemetry_window_bound_at',
  ntt_emulation_run:              'ntt_emulation_run_at',
  champion_predictions_collected: 'champion_predictions_collected_at',
  counterfactuals_computed:       'counterfactuals_computed_at',
  revenue_weighted_scored:        'revenue_weighted_scored_at',
  significance_tested:            'significance_tested_at',
  savings_certified:              'savings_certified_at',
  audit_published:                'audit_published_at',
  retraining_triggered:           'retraining_triggered_at',
  archived:                       'archived_at',
  significance_failed:            'significance_failed_at',
  rolled_back:                    'rolled_back_at',
  recalled:                       'recalled_at',
  failover_to_prior_cycle:        'failover_to_prior_cycle_at',
};

function statusEnteredAt(row: NcbRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.cycle_proposed_at ? new Date(row.cycle_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.cycle_proposed_at ? new Date(row.cycle_proposed_at) : null);
}

function rowFloorFlags(row: NcbRow) {
  return {
    material_savings_threshold_breached: row.material_savings_threshold_breached,
    ntt_contract_renegotiation_trigger:  row.ntt_contract_renegotiation_trigger,
    regulator_reportable_diversion:      row.regulator_reportable_diversion,
    sox_ml_governance_required:          row.sox_ml_governance_required,
    iso_42001_required:                  row.iso_42001_required,
  };
}

function decorate(row: NcbRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const entered = statusEnteredAt(row);
  const slaHrs = slaHoursRemaining(status, tier, entered, now);
  const flags = rowFloorFlags(row);
  const urgency = urgencyBand(tier, slaHrs, flags);
  const authority = authorityRequired(tier);
  const nextDays = daysToNextCycle(row.next_cycle_due_at, now);
  const mcardDays = daysToModelCardExpiry(row.model_card_expiry_at, now);

  const floorFlags = countFloorFlags(flags);
  const floorLargeFleet = floorAtLargeFleet(flags);
  const floorSystemic = floorAtFleetSystemic(flags);

  const controlLive = controlEffectivenessIndex({
    savings_vs_ntt_pct:                          row.savings_vs_ntt_pct,
    cumulative_savings_zar:                      row.cumulative_savings_zar,
    paired_t_pvalue:                             row.paired_t_pvalue,
    wilcoxon_pvalue:                             row.wilcoxon_pvalue,
    brier_skill_score_vs_ntt:                    row.brier_skill_score_vs_ntt,
    confidence_interval_width_zar:               row.confidence_interval_width_zar,
    reconciliation_with_w71_savings_ledger_pct:  row.reconciliation_with_w71_savings_ledger_pct,
    false_positive_savings_zar:                  row.false_positive_savings_zar,
    false_negative_savings_zar:                  row.false_negative_savings_zar,
    iso_42001_compliance_score:                  row.iso_42001_compliance_score,
    model_card_status:                           row.model_card_status,
    iso27001_controls_ok:                        row.iso27001_controls_ok,
    soc2_type2_controls_ok:                      row.soc2_type2_controls_ok,
    sox_ml_governance_ok:                        row.sox_ml_governance_ok,
  });

  const slaBreachedLive = minutesUntilSla != null && minutesUntilSla < 0;

  const healthLive = batteryHealthBand(
    status,
    controlLive,
    !!row.sla_breached || slaBreachedLive,
    nextDays,
    mcardDays,
    flags,
    row.savings_vs_ntt_pct ?? 0,
    row.paired_t_pvalue ?? 1,
    row.model_card_status,
  );

  let nttEmuParsed: unknown = null;
  if (row.ntt_emulation_payload) {
    try { nttEmuParsed = JSON.parse(row.ntt_emulation_payload); } catch { /* keep null */ }
  }
  let championPredictionsParsed: unknown = null;
  if (row.champion_predictions_payload) {
    try { championPredictionsParsed = JSON.parse(row.champion_predictions_payload); } catch { /* keep null */ }
  }
  let counterfactualsParsed: unknown = null;
  if (row.counterfactuals_payload) {
    try { counterfactualsParsed = JSON.parse(row.counterfactuals_payload); } catch { /* keep null */ }
  }

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached_live: slaBreachedLive,
    sla_window_hours: slaWindowHours(status, tier),
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    sla_hours_remaining_live: slaHrs,
    urgency_band_live: urgency,
    authority_required_live: authority,
    days_to_next_cycle_live: nextDays,
    days_to_model_card_expiry_live: mcardDays,
    floor_flag_count_live: floorFlags,
    floor_at_large_fleet_live: floorLargeFleet,
    floor_at_fleet_systemic_live: floorSystemic,
    control_effectiveness_index_live: controlLive,
    battery_health_band_live: healthLive,
    // 13 LIVE comparison metric mirrors
    savings_vs_ntt_pct_live: row.savings_vs_ntt_pct,
    cumulative_savings_zar_live: row.cumulative_savings_zar,
    total_savings_zar_live: row.total_savings_zar,
    paired_t_pvalue_live: row.paired_t_pvalue,
    wilcoxon_pvalue_live: row.wilcoxon_pvalue,
    brier_skill_score_vs_ntt_live: row.brier_skill_score_vs_ntt,
    false_positive_savings_zar_live: row.false_positive_savings_zar,
    false_negative_savings_zar_live: row.false_negative_savings_zar,
    confidence_interval_lower_zar_live: row.confidence_interval_lower_zar,
    confidence_interval_upper_zar_live: row.confidence_interval_upper_zar,
    confidence_interval_width_zar_live: row.confidence_interval_width_zar,
    audit_hash_published_live: row.audit_hash_published,
    reconciliation_with_w71_savings_ledger_live: row.reconciliation_with_w71_savings_ledger_pct,
    ntt_emulation_parsed: nttEmuParsed,
    champion_predictions_parsed: championPredictionsParsed,
    counterfactuals_parsed: counterfactualsParsed,
    bridges_to_w127_anomaly_detection_live: bridgesToW127AnomalyDetection(row.w127_anomaly_detection_ref),
    bridges_to_w128_rul_survival_live: bridgesToW128RulSurvival(row.w128_rul_survival_ref),
    bridges_to_w129_fault_fingerprint_live: bridgesToW129FaultFingerprint(row.w129_fault_fingerprint_ref),
    bridges_to_w71_asset_prognostics_live: bridgesToW71AssetPrognostics(row.w71_asset_prognostics_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(row.w118_block_ref),
    ntt_savings_target_pct: NTT_SAVINGS_TARGET_PCT,
    ntt_contract_reneg_consecutive_cycles_required: NTT_CONTRACT_RENEG_CONSECUTIVE_CYCLES,
    material_savings_floor_zar: MATERIAL_SAVINGS_FLOOR_ZAR,
    regulator_diversion_disagreement_floor_pct: REGULATOR_DIVERSION_DISAGREEMENT_FLOOR_PCT,
  };
}

const app = new Hono<HonoEnv>();

// All routes require auth (no public peer endpoint - INTERNAL ML).
app.use('*', authMiddleware);

// ─── List ────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier        = c.req.query('tier');
  const status      = c.req.query('status');
  const cycle_kind  = c.req.query('cycle_kind');
  const asset_class = c.req.query('asset_class');
  const card        = c.req.query('model_card_status');
  const health      = c.req.query('health_band');
  const breached    = c.req.query('breached');
  const reportable  = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_ntt_comparison_battery WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)        { sql += ' AND current_tier = ?';       binds.push(tier); }
  if (status)      { sql += ' AND chain_status = ?';       binds.push(status); }
  if (cycle_kind)  { sql += ' AND cycle_kind = ?';         binds.push(cycle_kind); }
  if (asset_class) { sql += ' AND asset_class = ?';        binds.push(asset_class); }
  if (card)        { sql += ' AND model_card_status = ?';  binds.push(card); }
  if (health)      { sql += ' AND battery_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<NcbRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_cycle_kind: Record<string, number> = {};
  const by_asset_class: Record<string, number> = {};
  const by_card: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_cycle_kind[i.cycle_kind] = (by_cycle_kind[i.cycle_kind] || 0) + 1;
    by_asset_class[i.asset_class] = (by_asset_class[i.asset_class] || 0) + 1;
    if (i.model_card_status) by_card[i.model_card_status as string] = (by_card[i.model_card_status as string] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.battery_health_band_live] = (by_health[i.battery_health_band_live] || 0) + 1;
  }

  const active_count        = items.filter((i) => !i.is_terminal).length;
  const proposed_count      = items.filter((i) => i.chain_status === 'cycle_proposed').length;
  const synced_count        = items.filter((i) => i.chain_status === 'baselines_synced').length;
  const bound_count         = items.filter((i) => i.chain_status === 'telemetry_window_bound').length;
  const emulated_count      = items.filter((i) => i.chain_status === 'ntt_emulation_run').length;
  const collected_count     = items.filter((i) => i.chain_status === 'champion_predictions_collected').length;
  const counterfact_count   = items.filter((i) => i.chain_status === 'counterfactuals_computed').length;
  const scored_count        = items.filter((i) => i.chain_status === 'revenue_weighted_scored').length;
  const tested_count        = items.filter((i) => i.chain_status === 'significance_tested').length;
  const certified_count     = items.filter((i) => i.chain_status === 'savings_certified').length;
  const audited_count       = items.filter((i) => i.chain_status === 'audit_published').length;
  const retrain_count       = items.filter((i) => i.chain_status === 'retraining_triggered').length;
  const archived_count      = items.filter((i) => i.chain_status === 'archived').length;
  const sig_failed_count    = items.filter((i) => i.chain_status === 'significance_failed').length;
  const rolled_back_count   = items.filter((i) => i.chain_status === 'rolled_back').length;
  const recalled_count      = items.filter((i) => i.chain_status === 'recalled').length;
  const failover_count      = items.filter((i) => i.chain_status === 'failover_to_prior_cycle').length;
  const breached_count      = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const floor_flag_total    = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w127_bridged        = items.filter((i) => i.bridges_to_w127_anomaly_detection_live).length;
  const w128_bridged        = items.filter((i) => i.bridges_to_w128_rul_survival_live).length;
  const w129_bridged        = items.filter((i) => i.bridges_to_w129_fault_fingerprint_live).length;
  const w71_bridged         = items.filter((i) => i.bridges_to_w71_asset_prognostics_live).length;
  const w118_bridged        = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const control_avg         = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.control_effectiveness_index_live || 0), 0) / items.length)
    : 0;
  const total_savings_sum_zar    = items.reduce((s, i) => s + (i.total_savings_zar_live || 0), 0);
  const cumulative_savings_max_zar = items.reduce((s, i) => Math.max(s, i.cumulative_savings_zar_live || 0), 0);
  const savings_pct_avg     = items.length > 0
    ? Math.round((items.reduce((s, i) => s + (i.savings_vs_ntt_pct_live || 0), 0) / items.length) * 100) / 100
    : 0;
  const mcard_within_30d    = items.filter((i) => (i.days_to_model_card_expiry_live ?? 9999) < 30).length;
  const above_target_count  = items.filter((i) => (i.savings_vs_ntt_pct_live ?? 0) >= NTT_SAVINGS_TARGET_PCT).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_cycle_kind,
      by_asset_class,
      by_model_card_status: by_card,
      by_urgency,
      by_health,
      active_count,
      proposed_count,
      synced_count,
      bound_count,
      emulated_count,
      collected_count,
      counterfactuals_count: counterfact_count,
      scored_count,
      tested_count,
      certified_count,
      audited_count,
      retrain_count,
      archived_count,
      significance_failed_count: sig_failed_count,
      rolled_back_count,
      recalled_count,
      failover_count,
      breached: breached_count,
      reportable_total,
      floor_flag_total,
      w127_bridged_count: w127_bridged,
      w128_bridged_count: w128_bridged,
      w129_bridged_count: w129_bridged,
      w71_bridged_count: w71_bridged,
      w118_bridged_count: w118_bridged,
      control_effectiveness_avg: control_avg,
      total_savings_sum_zar,
      cumulative_savings_max_zar,
      savings_vs_ntt_pct_avg: savings_pct_avg,
      ntt_savings_target_pct: NTT_SAVINGS_TARGET_PCT,
      above_target_count,
      model_card_expiring_30d: mcard_within_30d,
      material_savings_floor_zar: MATERIAL_SAVINGS_FLOOR_ZAR,
      regulator_diversion_disagreement_floor_pct: REGULATOR_DIVERSION_DISAGREEMENT_FLOOR_PCT,
      ntt_contract_reneg_consecutive_cycles_required: NTT_CONTRACT_RENEG_CONSECUTIVE_CYCLES,
    },
  });
});

// ─── Aggregate ───────────────────────────────────────────────────────────
app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, battery_health_band, cycle_kind, asset_class,
            model_card_status, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_ntt_comparison_battery
     GROUP BY chain_status, current_tier, battery_health_band, cycle_kind, asset_class,
              model_card_status, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; battery_health_band: string | null;
    cycle_kind: string | null; asset_class: string | null; model_card_status: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_cycle_kind: Record<string, number> = {};
  const by_asset_class: Record<string, number> = {};
  const by_card: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.battery_health_band) by_health[r.battery_health_band] = (by_health[r.battery_health_band] || 0) + r.n;
    if (r.cycle_kind) by_cycle_kind[r.cycle_kind] = (by_cycle_kind[r.cycle_kind] || 0) + r.n;
    if (r.asset_class) by_asset_class[r.asset_class] = (by_asset_class[r.asset_class] || 0) + r.n;
    if (r.model_card_status) by_card[r.model_card_status] = (by_card[r.model_card_status] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({
    success: true,
    data: {
      total, by_status, by_tier, by_health, by_cycle_kind, by_asset_class,
      by_model_card_status: by_card,
      by_regulator_relevant, by_sla_breached,
      ntt_savings_target_pct: NTT_SAVINGS_TARGET_PCT,
      material_savings_floor_zar: MATERIAL_SAVINGS_FLOOR_ZAR,
    },
  });
});

// ─── Esums dashboard hook ────────────────────────────────────────────────
//
// Returns the LATEST non-rolled-back / non-recalled cycle for the hero KPI
// stream. The Esums LaunchBoard reads this to render the live "savings vs
// NTT-30%" headline. ALWAYS returns success even if no cycle exists (so
// the dashboard renders a clean empty state).
app.get('/dashboard/hero', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_ntt_comparison_battery
     WHERE chain_status NOT IN ('rolled_back','recalled')
     ORDER BY datetime(created_at) DESC LIMIT 1`,
  ).first<NcbRow>();
  if (!row) {
    return c.json({
      success: true,
      data: {
        latest_cycle: null,
        ntt_savings_target_pct: NTT_SAVINGS_TARGET_PCT,
        material_savings_floor_zar: MATERIAL_SAVINGS_FLOOR_ZAR,
      },
    });
  }
  return c.json({
    success: true,
    data: {
      latest_cycle: decorate(row, new Date()),
      ntt_savings_target_pct: NTT_SAVINGS_TARGET_PCT,
      material_savings_floor_zar: MATERIAL_SAVINGS_FLOOR_ZAR,
      ntt_contract_reneg_consecutive_cycles_required: NTT_CONTRACT_RENEG_CONSECUTIVE_CYCLES,
    },
  });
});

// ─── Get one ─────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ntt_comparison_battery WHERE id = ?').bind(id).first<NcbRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ntt_comparison_battery_events WHERE cycle_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<NcbEventRow>();

  return c.json({
    success: true,
    data: {
      cycle: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Significance test detail endpoint ───────────────────────────────────
app.get('/:id/significance', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare(
    `SELECT id, cycle_number, paired_t_pvalue, wilcoxon_pvalue, brier_skill_score_vs_ntt,
            confidence_interval_lower_zar, confidence_interval_upper_zar,
            confidence_interval_width_zar, total_savings_zar, cumulative_savings_zar,
            savings_vs_ntt_pct, reconciliation_with_w71_savings_ledger_pct
     FROM oe_ntt_comparison_battery WHERE id = ?`,
  ).bind(id).first<{
    id: string;
    cycle_number: string;
    paired_t_pvalue: number | null;
    wilcoxon_pvalue: number | null;
    brier_skill_score_vs_ntt: number | null;
    confidence_interval_lower_zar: number | null;
    confidence_interval_upper_zar: number | null;
    confidence_interval_width_zar: number | null;
    total_savings_zar: number | null;
    cumulative_savings_zar: number | null;
    savings_vs_ntt_pct: number | null;
    reconciliation_with_w71_savings_ledger_pct: number | null;
  }>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  return c.json({
    success: true,
    data: {
      id: row.id,
      cycle_number: row.cycle_number,
      paired_t_pvalue: row.paired_t_pvalue,
      wilcoxon_pvalue: row.wilcoxon_pvalue,
      brier_skill_score_vs_ntt: row.brier_skill_score_vs_ntt,
      confidence_interval_lower_zar: row.confidence_interval_lower_zar,
      confidence_interval_upper_zar: row.confidence_interval_upper_zar,
      confidence_interval_width_zar: row.confidence_interval_width_zar,
      total_savings_zar: row.total_savings_zar,
      cumulative_savings_zar: row.cumulative_savings_zar,
      savings_vs_ntt_pct: row.savings_vs_ntt_pct,
      reconciliation_with_w71_savings_ledger_pct: row.reconciliation_with_w71_savings_ledger_pct,
      ntt_savings_target_pct: NTT_SAVINGS_TARGET_PCT,
    },
  });
});

// ─── Body interfaces ──────────────────────────────────────────────────────
interface CommonBody {
  notes?: string;
  reason_code?: string;
  regulator_ref?: string;
  regulator_inbox_ref?: string;
  title?: string;
}

interface CreateBody extends CommonBody {
  cycle_kind?: string;
  cycle_window_start?: string;
  cycle_window_end?: string;
  asset_class?: string;
  assets_covered?: number;
  jurisdiction_count?: number;
  safety_critical?: boolean | number;
  champion_anomaly_model_version?: string;
  champion_rul_model_version?: string;
  champion_fault_model_version?: string;
  ntt_baseline_version?: string;
  prior_cycle_ref?: string;
  next_cycle_due_at?: string;
  model_card_expiry_at?: string;

  // 5 bridges - W118 MANDATORY (NOT NULL on DB).
  w127_anomaly_detection_ref?: string;
  w128_rul_survival_ref?: string;
  w129_fault_fingerprint_ref?: string;
  w71_asset_prognostics_ref?: string;
  w118_block_ref?: string;

  material_savings_threshold_breached?: boolean | number;
  ntt_contract_renegotiation_trigger?: boolean | number;
  regulator_reportable_diversion?: boolean | number;
  sox_ml_governance_required?: boolean | number;
  iso_42001_required?: boolean | number;

  consecutive_cycles_above_target?: number;
  consecutive_cycles_below_target?: number;
  ntt_emulation_payload?: string | Record<string, unknown>;
  champion_predictions_payload?: string | Record<string, unknown>;
  counterfactuals_payload?: string | Record<string, unknown>;

  total_savings_zar?: number;
  cumulative_savings_zar?: number;
  false_positive_savings_zar?: number;
  false_negative_savings_zar?: number;
  savings_vs_ntt_pct?: number;
  paired_t_pvalue?: number;
  wilcoxon_pvalue?: number;
  brier_skill_score_vs_ntt?: number;
  confidence_interval_lower_zar?: number;
  confidence_interval_upper_zar?: number;
  confidence_interval_width_zar?: number;
  reconciliation_with_w71_savings_ledger_pct?: number;
  audit_hash_published?: string;

  ntt_baseline_comparison_pct?: number;
  inference_latency_p50_ms?: number;
  inference_latency_p99_ms?: number;
  model_card_status?: ModelCardStatus;
  iso27001_controls_ok?: boolean | number;
  soc2_type2_controls_ok?: boolean | number;
  sox_ml_governance_ok?: boolean | number;
  iso_42001_compliance_score?: number;

  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

function toJsonText(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return undefined; }
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<NcbRow>): Partial<NcbRow> {
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')       out.regulator_ref = b.regulator_ref;
  if (typeof b.regulator_inbox_ref === 'string') out.regulator_inbox_ref = b.regulator_inbox_ref;
  if (typeof b.title === 'string')               out.title = b.title;
  return out;
}

// ─── Create endpoint (propose_cycle) ──────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;

  const id = `ncb-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const cycleKind = body.cycle_kind ?? 'nightly';
  const assetClass = body.asset_class ?? 'generic';

  const flags = {
    material_savings_threshold_breached: toFlag(body.material_savings_threshold_breached) ?? 0,
    ntt_contract_renegotiation_trigger:  toFlag(body.ntt_contract_renegotiation_trigger) ?? 0,
    regulator_reportable_diversion:      toFlag(body.regulator_reportable_diversion) ?? 0,
    sox_ml_governance_required:          toFlag(body.sox_ml_governance_required) ?? 0,
    iso_42001_required:                  toFlag(body.iso_42001_required) ?? 0,
  };
  const rawTier = tierForScope({
    assets_covered: body.assets_covered,
    jurisdiction_count: body.jurisdiction_count,
    safety_critical: body.safety_critical,
  });
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('cycle_proposed', tier, now);
  const slaHrs = slaWindowHours('cycle_proposed', tier);
  const nextDays = daysToNextCycle(body.next_cycle_due_at ?? null, now);
  const mcardDays = daysToModelCardExpiry(body.model_card_expiry_at ?? null, now);

  // Cycle number = NCB-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_ntt_comparison_battery`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const cycleNum = `NCB-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  const controlInit = controlEffectivenessIndex({
    savings_vs_ntt_pct:                          body.savings_vs_ntt_pct ?? null,
    cumulative_savings_zar:                      body.cumulative_savings_zar ?? null,
    paired_t_pvalue:                             body.paired_t_pvalue ?? null,
    wilcoxon_pvalue:                             body.wilcoxon_pvalue ?? null,
    brier_skill_score_vs_ntt:                    body.brier_skill_score_vs_ntt ?? null,
    confidence_interval_width_zar:               body.confidence_interval_width_zar ?? null,
    reconciliation_with_w71_savings_ledger_pct:  body.reconciliation_with_w71_savings_ledger_pct ?? null,
    false_positive_savings_zar:                  body.false_positive_savings_zar ?? null,
    false_negative_savings_zar:                  body.false_negative_savings_zar ?? null,
    iso_42001_compliance_score:                  body.iso_42001_compliance_score ?? null,
    model_card_status:                           body.model_card_status ?? null,
    iso27001_controls_ok:                        toFlag(body.iso27001_controls_ok),
    soc2_type2_controls_ok:                      toFlag(body.soc2_type2_controls_ok),
    sox_ml_governance_ok:                        toFlag(body.sox_ml_governance_ok),
  });

  const healthInit = batteryHealthBand(
    'cycle_proposed',
    controlInit,
    false,
    nextDays,
    mcardDays,
    flags,
    body.savings_vs_ntt_pct ?? 0,
    body.paired_t_pvalue ?? 1,
    body.model_card_status ?? null,
  );

  const nttEmuText = toJsonText(body.ntt_emulation_payload);
  const cpText = toJsonText(body.champion_predictions_payload);
  const cfText = toJsonText(body.counterfactuals_payload);

  await c.env.DB.prepare(
    `INSERT INTO oe_ntt_comparison_battery (
      id, cycle_number, cycle_kind, cycle_window_start, cycle_window_end,
      asset_class, assets_covered, jurisdiction_count, safety_critical,
      champion_anomaly_model_version, champion_rul_model_version, champion_fault_model_version,
      ntt_baseline_version, prior_cycle_ref, next_cycle_due_at, model_card_expiry_at,
      w127_anomaly_detection_ref, w128_rul_survival_ref, w129_fault_fingerprint_ref,
      w71_asset_prognostics_ref, w118_block_ref,
      material_savings_threshold_breached, ntt_contract_renegotiation_trigger,
      regulator_reportable_diversion, sox_ml_governance_required, iso_42001_required,
      consecutive_cycles_above_target, consecutive_cycles_below_target,
      ntt_emulation_payload, champion_predictions_payload, counterfactuals_payload,
      total_savings_zar, cumulative_savings_zar, false_positive_savings_zar,
      false_negative_savings_zar, savings_vs_ntt_pct, paired_t_pvalue, wilcoxon_pvalue,
      brier_skill_score_vs_ntt, confidence_interval_lower_zar, confidence_interval_upper_zar,
      confidence_interval_width_zar, reconciliation_with_w71_savings_ledger_pct,
      audit_hash_published,
      ntt_baseline_comparison_pct, inference_latency_p50_ms, inference_latency_p99_ms,
      model_card_status, iso27001_controls_ok, soc2_type2_controls_ok, sox_ml_governance_ok,
      iso_42001_compliance_score, control_effectiveness_index,
      current_tier, authority_required, urgency_band, battery_health_band,
      title, reason_code, is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, cycle_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      days_to_next_cycle, days_to_model_card_expiry,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, cycleNum, cycleKind, body.cycle_window_start ?? null, body.cycle_window_end ?? null,
    assetClass, body.assets_covered ?? null, body.jurisdiction_count ?? null,
    toFlag(body.safety_critical) ?? 0,
    body.champion_anomaly_model_version ?? null,
    body.champion_rul_model_version ?? null,
    body.champion_fault_model_version ?? null,
    body.ntt_baseline_version ?? null,
    body.prior_cycle_ref ?? null,
    body.next_cycle_due_at ?? null,
    body.model_card_expiry_at ?? null,
    body.w127_anomaly_detection_ref ?? null,
    body.w128_rul_survival_ref ?? null,
    body.w129_fault_fingerprint_ref ?? null,
    body.w71_asset_prognostics_ref ?? null,
    body.w118_block_ref ?? null,
    flags.material_savings_threshold_breached,
    flags.ntt_contract_renegotiation_trigger,
    flags.regulator_reportable_diversion,
    flags.sox_ml_governance_required,
    flags.iso_42001_required,
    body.consecutive_cycles_above_target ?? 0,
    body.consecutive_cycles_below_target ?? 0,
    nttEmuText ?? null, cpText ?? null, cfText ?? null,
    body.total_savings_zar ?? null,
    body.cumulative_savings_zar ?? null,
    body.false_positive_savings_zar ?? null,
    body.false_negative_savings_zar ?? null,
    body.savings_vs_ntt_pct ?? null,
    body.paired_t_pvalue ?? null,
    body.wilcoxon_pvalue ?? null,
    body.brier_skill_score_vs_ntt ?? null,
    body.confidence_interval_lower_zar ?? null,
    body.confidence_interval_upper_zar ?? null,
    body.confidence_interval_width_zar ?? null,
    body.reconciliation_with_w71_savings_ledger_pct ?? null,
    body.audit_hash_published ?? null,
    body.ntt_baseline_comparison_pct ?? null,
    body.inference_latency_p50_ms ?? null,
    body.inference_latency_p99_ms ?? null,
    body.model_card_status ?? null,
    toFlag(body.iso27001_controls_ok) ?? 0,
    toFlag(body.soc2_type2_controls_ok) ?? 0,
    toFlag(body.sox_ml_governance_ok) ?? 0,
    body.iso_42001_compliance_score ?? null, controlInit,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs, flags), healthInit,
    body.title ?? null, body.reason_code ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'cycle_proposed', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    nextDays, mcardDays,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `ntt_comparison_battery_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ntt_comparison_battery_events (id, cycle_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'ntt_comparison_battery_cycle_proposed',
    null, 'cycle_proposed', null, tier,
    user.id, partyForAction('propose_cycle'),
    null, JSON.stringify({ tier, cycle_kind: cycleKind, asset_class: assetClass, cycle_number: cycleNum, title: body.title }), nowIso,
  ).run();

  await fireCascade({
    event: 'ntt_comparison_battery_cycle_proposed',
    actor_id: user.id,
    entity_type: 'ntt_comparison_battery',
    entity_id: id,
    data: { tier, cycle_kind: cycleKind, asset_class: assetClass, cycle_number: cycleNum, chain_status: 'cycle_proposed' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ntt_comparison_battery WHERE id = ?').bind(id).first<NcbRow>();
  return c.json({ success: true, data: { cycle: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: NcbAction,
  bodyHandler?: (row: NcbRow, body: Record<string, unknown>) => Partial<NcbRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ntt_comparison_battery WHERE id = ?').bind(id).first<NcbRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} via ${action}`,
    }, 422);
  }

  // W118 MANDATORY at publish_audit (tamper-evidence is hard requirement).
  if (action === 'publish_audit') {
    const incoming = (body.w118_block_ref as string | undefined) ?? row.w118_block_ref;
    if (!incoming || typeof incoming !== 'string') {
      return c.json({
        success: false,
        error: 'w118_block_ref is REQUIRED to publish_audit (tamper-evidence hash spine binding is mandatory).',
      }, 422);
    }
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from (assets_covered, jurisdiction_count, safety_critical) + 5 floor flags.
  const assetsCovered =
    (overrides.assets_covered as number | undefined) ?? row.assets_covered;
  const jurisCount =
    (overrides.jurisdiction_count as number | undefined) ?? row.jurisdiction_count;
  const safetyCritical =
    (overrides.safety_critical as number | undefined) ?? row.safety_critical;
  const rawTier = tierForScope({
    assets_covered: assetsCovered,
    jurisdiction_count: jurisCount,
    safety_critical: safetyCritical,
  });
  const floorFlags = {
    material_savings_threshold_breached:
      (overrides.material_savings_threshold_breached as number | undefined)
        ?? row.material_savings_threshold_breached,
    ntt_contract_renegotiation_trigger:
      (overrides.ntt_contract_renegotiation_trigger as number | undefined)
        ?? row.ntt_contract_renegotiation_trigger,
    regulator_reportable_diversion:
      (overrides.regulator_reportable_diversion as number | undefined)
        ?? row.regulator_reportable_diversion,
    sox_ml_governance_required:
      (overrides.sox_ml_governance_required as number | undefined)
        ?? row.sox_ml_governance_required,
    iso_42001_required:
      (overrides.iso_42001_required as number | undefined)
        ?? row.iso_42001_required,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);
  overrides.sla_target_hours = slaHrs;
  overrides.urgency_band = urgencyBand(tier, slaHrs, floorFlags);

  const nextAt = (overrides.next_cycle_due_at as string | undefined) ?? row.next_cycle_due_at;
  const nextDays = daysToNextCycle(nextAt, now);
  overrides.days_to_next_cycle = nextDays;
  const mcardAt = (overrides.model_card_expiry_at as string | undefined) ?? row.model_card_expiry_at;
  const mcardDays = daysToModelCardExpiry(mcardAt, now);
  overrides.days_to_model_card_expiry = mcardDays;

  const cardEff =
    (overrides.model_card_status as ModelCardStatus | undefined) ?? row.model_card_status;

  const controlScore = controlEffectivenessIndex({
    savings_vs_ntt_pct:
      (overrides.savings_vs_ntt_pct as number | undefined) ?? row.savings_vs_ntt_pct,
    cumulative_savings_zar:
      (overrides.cumulative_savings_zar as number | undefined) ?? row.cumulative_savings_zar,
    paired_t_pvalue:
      (overrides.paired_t_pvalue as number | undefined) ?? row.paired_t_pvalue,
    wilcoxon_pvalue:
      (overrides.wilcoxon_pvalue as number | undefined) ?? row.wilcoxon_pvalue,
    brier_skill_score_vs_ntt:
      (overrides.brier_skill_score_vs_ntt as number | undefined) ?? row.brier_skill_score_vs_ntt,
    confidence_interval_width_zar:
      (overrides.confidence_interval_width_zar as number | undefined) ?? row.confidence_interval_width_zar,
    reconciliation_with_w71_savings_ledger_pct:
      (overrides.reconciliation_with_w71_savings_ledger_pct as number | undefined) ?? row.reconciliation_with_w71_savings_ledger_pct,
    false_positive_savings_zar:
      (overrides.false_positive_savings_zar as number | undefined) ?? row.false_positive_savings_zar,
    false_negative_savings_zar:
      (overrides.false_negative_savings_zar as number | undefined) ?? row.false_negative_savings_zar,
    iso_42001_compliance_score:
      (overrides.iso_42001_compliance_score as number | undefined) ?? row.iso_42001_compliance_score,
    model_card_status: cardEff,
    iso27001_controls_ok:
      (overrides.iso27001_controls_ok as number | undefined) ?? row.iso27001_controls_ok,
    soc2_type2_controls_ok:
      (overrides.soc2_type2_controls_ok as number | undefined) ?? row.soc2_type2_controls_ok,
    sox_ml_governance_ok:
      (overrides.sox_ml_governance_ok as number | undefined) ?? row.sox_ml_governance_ok,
  });
  overrides.control_effectiveness_index = controlScore;

  // Battery health band composite.
  const svpEff = (overrides.savings_vs_ntt_pct as number | undefined) ?? row.savings_vs_ntt_pct ?? 0;
  const ptpEff = (overrides.paired_t_pvalue as number | undefined) ?? row.paired_t_pvalue ?? 1;
  overrides.battery_health_band = batteryHealthBand(
    to,
    controlScore,
    !!row.sla_breached,
    nextDays,
    mcardDays,
    floorFlags,
    svpEff,
    ptpEff,
    cardEff,
  );

  // SIGNATURE crossings.
  const crosses = crossesIntoRegulator(action, tier, {
    flags: floorFlags,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol && to !== row.chain_status) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_ntt_comparison_battery SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `ntt_comparison_battery_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ntt_comparison_battery_events (id, cycle_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `ntt_comparison_battery_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'ntt_comparison_battery',
      entity_id: id,
      data: {
        ...row,
        ...overrides,
        current_tier: tier,
        chain_status: to,
        from_status: row.chain_status,
        action,
        crosses_into_regulator: crosses,
      },
      env: c.env,
    });
  }

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ntt_comparison_battery WHERE id = ?').bind(id).first<NcbRow>();
  return c.json({ success: true, data: { cycle: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; propose handled by POST /) ─────────
app.post('/:id/sync-baselines', async (c) => transition(c, 'sync_baselines', (_row, body) => {
  const b = body as Partial<CommonBody & {
    ntt_baseline_version?: string;
    champion_anomaly_model_version?: string;
    champion_rul_model_version?: string;
    champion_fault_model_version?: string;
  }>;
  const out: Partial<NcbRow> = {};
  if (typeof b.ntt_baseline_version === 'string') out.ntt_baseline_version = b.ntt_baseline_version;
  if (typeof b.champion_anomaly_model_version === 'string') out.champion_anomaly_model_version = b.champion_anomaly_model_version;
  if (typeof b.champion_rul_model_version === 'string') out.champion_rul_model_version = b.champion_rul_model_version;
  if (typeof b.champion_fault_model_version === 'string') out.champion_fault_model_version = b.champion_fault_model_version;
  return applyCommon(b, out);
}));

app.post('/:id/bind-telemetry-window', async (c) => transition(c, 'bind_telemetry_window', (_row, body) => {
  const b = body as Partial<CommonBody & {
    cycle_window_start?: string;
    cycle_window_end?: string;
    assets_covered?: number;
    jurisdiction_count?: number;
  }>;
  const out: Partial<NcbRow> = {};
  if (typeof b.cycle_window_start === 'string') out.cycle_window_start = b.cycle_window_start;
  if (typeof b.cycle_window_end === 'string') out.cycle_window_end = b.cycle_window_end;
  if (typeof b.assets_covered === 'number') out.assets_covered = b.assets_covered;
  if (typeof b.jurisdiction_count === 'number') out.jurisdiction_count = b.jurisdiction_count;
  return applyCommon(b, out);
}));

app.post('/:id/run-ntt-emulation', async (c) => transition(c, 'run_ntt_emulation', (_row, body) => {
  const b = body as Partial<CommonBody & {
    ntt_emulation_payload?: string | Record<string, unknown>;
    ntt_baseline_comparison_pct?: number;
  }>;
  const out: Partial<NcbRow> = {};
  const t = toJsonText(b.ntt_emulation_payload);
  if (t !== undefined) out.ntt_emulation_payload = t;
  if (typeof b.ntt_baseline_comparison_pct === 'number') out.ntt_baseline_comparison_pct = b.ntt_baseline_comparison_pct;
  return applyCommon(b, out);
}));

app.post('/:id/collect-champion-predictions', async (c) => transition(c, 'collect_champion_predictions', (_row, body) => {
  const b = body as Partial<CommonBody & {
    champion_predictions_payload?: string | Record<string, unknown>;
    inference_latency_p50_ms?: number;
    inference_latency_p99_ms?: number;
    w127_anomaly_detection_ref?: string;
    w128_rul_survival_ref?: string;
    w129_fault_fingerprint_ref?: string;
  }>;
  const out: Partial<NcbRow> = {};
  const t = toJsonText(b.champion_predictions_payload);
  if (t !== undefined) out.champion_predictions_payload = t;
  if (typeof b.inference_latency_p50_ms === 'number') out.inference_latency_p50_ms = b.inference_latency_p50_ms;
  if (typeof b.inference_latency_p99_ms === 'number') out.inference_latency_p99_ms = b.inference_latency_p99_ms;
  if (typeof b.w127_anomaly_detection_ref === 'string') out.w127_anomaly_detection_ref = b.w127_anomaly_detection_ref;
  if (typeof b.w128_rul_survival_ref === 'string') out.w128_rul_survival_ref = b.w128_rul_survival_ref;
  if (typeof b.w129_fault_fingerprint_ref === 'string') out.w129_fault_fingerprint_ref = b.w129_fault_fingerprint_ref;
  return applyCommon(b, out);
}));

app.post('/:id/compute-counterfactuals', async (c) => transition(c, 'compute_counterfactuals', (_row, body) => {
  const b = body as Partial<CommonBody & {
    counterfactuals_payload?: string | Record<string, unknown>;
    false_positive_savings_zar?: number;
    false_negative_savings_zar?: number;
    w71_asset_prognostics_ref?: string;
  }>;
  const out: Partial<NcbRow> = {};
  const t = toJsonText(b.counterfactuals_payload);
  if (t !== undefined) out.counterfactuals_payload = t;
  if (typeof b.false_positive_savings_zar === 'number') out.false_positive_savings_zar = b.false_positive_savings_zar;
  if (typeof b.false_negative_savings_zar === 'number') out.false_negative_savings_zar = b.false_negative_savings_zar;
  if (typeof b.w71_asset_prognostics_ref === 'string') out.w71_asset_prognostics_ref = b.w71_asset_prognostics_ref;
  return applyCommon(b, out);
}));

app.post('/:id/revenue-weight-score', async (c) => transition(c, 'revenue_weight_score', (row, body) => {
  const b = body as Partial<CommonBody & {
    total_savings_zar?: number;
    cumulative_savings_zar?: number;
    savings_vs_ntt_pct?: number;
    reconciliation_with_w71_savings_ledger_pct?: number;
  }>;
  const out: Partial<NcbRow> = {};
  if (typeof b.total_savings_zar === 'number') out.total_savings_zar = b.total_savings_zar;
  if (typeof b.cumulative_savings_zar === 'number') out.cumulative_savings_zar = b.cumulative_savings_zar;
  if (typeof b.savings_vs_ntt_pct === 'number') out.savings_vs_ntt_pct = b.savings_vs_ntt_pct;
  if (typeof b.reconciliation_with_w71_savings_ledger_pct === 'number') {
    out.reconciliation_with_w71_savings_ledger_pct = b.reconciliation_with_w71_savings_ledger_pct;
  }

  // Material savings floor auto-raise.
  const ts = b.total_savings_zar ?? row.total_savings_zar ?? 0;
  if (ts >= MATERIAL_SAVINGS_FLOOR_ZAR) {
    out.material_savings_threshold_breached = 1;
  }

  // Sustained-trigger counter update.
  const svp = b.savings_vs_ntt_pct ?? row.savings_vs_ntt_pct ?? 0;
  if (svp >= NTT_SAVINGS_TARGET_PCT) {
    const above = (row.consecutive_cycles_above_target || 0) + 1;
    out.consecutive_cycles_above_target = above;
    out.consecutive_cycles_below_target = 0;
    if (above >= NTT_CONTRACT_RENEG_CONSECUTIVE_CYCLES) {
      out.ntt_contract_renegotiation_trigger = 1;
    }
  } else {
    out.consecutive_cycles_above_target = 0;
    out.consecutive_cycles_below_target = (row.consecutive_cycles_below_target || 0) + 1;
  }
  return applyCommon(b, out);
}));

app.post('/:id/test-significance', async (c) => transition(c, 'test_significance', (_row, body) => {
  const b = body as Partial<CommonBody & {
    paired_t_pvalue?: number;
    wilcoxon_pvalue?: number;
    brier_skill_score_vs_ntt?: number;
    confidence_interval_lower_zar?: number;
    confidence_interval_upper_zar?: number;
    confidence_interval_width_zar?: number;
  }>;
  const out: Partial<NcbRow> = {};
  if (typeof b.paired_t_pvalue === 'number') out.paired_t_pvalue = b.paired_t_pvalue;
  if (typeof b.wilcoxon_pvalue === 'number') out.wilcoxon_pvalue = b.wilcoxon_pvalue;
  if (typeof b.brier_skill_score_vs_ntt === 'number') out.brier_skill_score_vs_ntt = b.brier_skill_score_vs_ntt;
  if (typeof b.confidence_interval_lower_zar === 'number') out.confidence_interval_lower_zar = b.confidence_interval_lower_zar;
  if (typeof b.confidence_interval_upper_zar === 'number') out.confidence_interval_upper_zar = b.confidence_interval_upper_zar;
  if (typeof b.confidence_interval_width_zar === 'number') {
    out.confidence_interval_width_zar = b.confidence_interval_width_zar;
  } else if (typeof b.confidence_interval_lower_zar === 'number' && typeof b.confidence_interval_upper_zar === 'number') {
    out.confidence_interval_width_zar = b.confidence_interval_upper_zar - b.confidence_interval_lower_zar;
  }
  return applyCommon(b, out);
}));

app.post('/:id/certify-savings', async (c) => transition(c, 'certify_savings', (_row, body) => {
  const b = body as Partial<CommonBody & {
    model_card_status?: ModelCardStatus;
    sox_ml_governance_ok?: boolean | number;
  }>;
  const out: Partial<NcbRow> = {};
  if (b.model_card_status) out.model_card_status = b.model_card_status;
  const f = toFlag(b.sox_ml_governance_ok); if (f !== undefined) out.sox_ml_governance_ok = f;
  return applyCommon(b, out);
}));

app.post('/:id/publish-audit', async (c) => transition(c, 'publish_audit', (_row, body) => {
  const b = body as Partial<CommonBody & {
    audit_hash_published?: string;
    w118_block_ref?: string;
  }>;
  const out: Partial<NcbRow> = {};
  if (typeof b.audit_hash_published === 'string') out.audit_hash_published = b.audit_hash_published;
  if (typeof b.w118_block_ref === 'string') out.w118_block_ref = b.w118_block_ref;
  return applyCommon(b, out);
}));

app.post('/:id/trigger-retraining', async (c) => transition(c, 'trigger_retraining', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/flag-significance-failure', async (c) => transition(c, 'flag_significance_failure', (_row, body) => {
  const b = body as Partial<CommonBody & {
    paired_t_pvalue?: number;
  }>;
  const out: Partial<NcbRow> = {};
  if (typeof b.paired_t_pvalue === 'number') out.paired_t_pvalue = b.paired_t_pvalue;
  return applyCommon(b, out);
}));

app.post('/:id/rollback-cycle', async (c) => transition(c, 'rollback_cycle', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/recall-certification', async (c) => transition(c, 'recall_certification', (_row, body) => {
  const b = body as Partial<CommonBody & {
    regulator_reportable_diversion?: boolean | number;
  }>;
  const out: Partial<NcbRow> = {};
  const f = toFlag(b.regulator_reportable_diversion); if (f !== undefined) out.regulator_reportable_diversion = f;
  return applyCommon(b, out);
}));

app.post('/:id/activate-failover', async (c) => transition(c, 'activate_failover', (_row, body) => {
  const b = body as Partial<CommonBody & {
    prior_cycle_ref?: string;
  }>;
  const out: Partial<NcbRow> = {};
  if (typeof b.prior_cycle_ref === 'string') out.prior_cycle_ref = b.prior_cycle_ref;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
export async function nttComparisonBatterySlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ntt_comparison_battery
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<NcbRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ntt_comparison_battery
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ntt_comparison_battery_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ntt_comparison_battery_events (id, cycle_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'ntt_comparison_battery_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'ml_analyst',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as NcbTier)) {
      await fireCascade({
        event: 'ntt_comparison_battery_sla_breached',
        actor_id: 'system',
        entity_type: 'ntt_comparison_battery',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }
    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: NEW nightly cycle runner (15 4 * * *) ─────────────────────────
//
// 04:15 UTC = 06:15 SAST. Walks active fleet scopes whose
// next_cycle_due_at is past, refreshes LIVE-derived persisted fields
// (control effectiveness, battery health, days-to-next-cycle,
// days-to-model-card-expiry) and flags cycles where savings_vs_ntt_pct
// has gone NEGATIVE or paired-t-test p-value >= 0.10 as
// regulator_relevant for the morning Esums briefing. NOT a state-machine
// transition - this is the WATCHDOG that keeps the battery LIVE between
// data-steward sessions.
export async function nttComparisonBatteryNightlyCycleRunner(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged_drift: number; near_due_count: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ntt_comparison_battery
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')`,
  ).all<NcbRow>();

  const rows = rs.results || [];
  let flagged = 0;
  let nearDue = 0;
  for (const row of rows) {
    const control = controlEffectivenessIndex({
      savings_vs_ntt_pct:                          row.savings_vs_ntt_pct,
      cumulative_savings_zar:                      row.cumulative_savings_zar,
      paired_t_pvalue:                             row.paired_t_pvalue,
      wilcoxon_pvalue:                             row.wilcoxon_pvalue,
      brier_skill_score_vs_ntt:                    row.brier_skill_score_vs_ntt,
      confidence_interval_width_zar:               row.confidence_interval_width_zar,
      reconciliation_with_w71_savings_ledger_pct:  row.reconciliation_with_w71_savings_ledger_pct,
      false_positive_savings_zar:                  row.false_positive_savings_zar,
      false_negative_savings_zar:                  row.false_negative_savings_zar,
      iso_42001_compliance_score:                  row.iso_42001_compliance_score,
      model_card_status:                           row.model_card_status,
      iso27001_controls_ok:                        row.iso27001_controls_ok,
      soc2_type2_controls_ok:                      row.soc2_type2_controls_ok,
      sox_ml_governance_ok:                        row.sox_ml_governance_ok,
    });

    const nextDays = daysToNextCycle(row.next_cycle_due_at, now);
    const mcardDays = daysToModelCardExpiry(row.model_card_expiry_at, now);
    const flags = rowFloorFlags(row);

    const health = batteryHealthBand(
      row.chain_status,
      control,
      !!row.sla_breached,
      nextDays,
      mcardDays,
      flags,
      row.savings_vs_ntt_pct ?? 0,
      row.paired_t_pvalue ?? 1,
      row.model_card_status,
    );

    const savingsNegative = (row.savings_vs_ntt_pct ?? 0) < 0;
    const pValueHigh = (row.paired_t_pvalue ?? 0) >= 0.10;
    const driftFlag = savingsNegative || pValueHigh;
    const regulatorRelevantBump = driftFlag ? 1 : row.regulator_relevant;
    const isReportableBump = driftFlag ? 1 : row.is_reportable;
    if (driftFlag) flagged++;
    if (nextDays <= 1) nearDue++;

    await env.DB.prepare(
      `UPDATE oe_ntt_comparison_battery
       SET control_effectiveness_index = ?,
           battery_health_band = ?,
           days_to_next_cycle = ?,
           days_to_model_card_expiry = ?,
           regulator_relevant = ?,
           is_reportable = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(control, health, nextDays, mcardDays, regulatorRelevantBump, isReportableBump, nowIso, row.id).run();
  }
  return { scanned: rows.length, flagged_drift: flagged, near_due_count: nearDue };
}

// ─── Cron: weekly model-card expiry scan (0 7 * * 1) ─────────────────────
export async function nttComparisonBatteryModelCardExpirySweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ntt_comparison_battery
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')
       AND model_card_expiry_at IS NOT NULL`,
  ).all<NcbRow>();
  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const mcardDays = daysToModelCardExpiry(row.model_card_expiry_at, now);
    if (mcardDays < 14) {
      await env.DB.prepare(
        `UPDATE oe_ntt_comparison_battery
         SET regulator_relevant = 1, is_reportable = 1,
             days_to_model_card_expiry = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(mcardDays, nowIso, row.id).run();
      flagged++;
    } else {
      await env.DB.prepare(
        `UPDATE oe_ntt_comparison_battery
         SET days_to_model_card_expiry = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(mcardDays, nowIso, row.id).run();
    }
  }
  return { scanned: rows.length, flagged };
}

// ─── Cron: NEW monthly ledger reconciliation (0 1 1 * *) ─────────────────
//
// 01:00 UTC = 03:00 SAST 1st-of-month. Validates cumulative_savings_zar
// vs W71 control (reconciliation_with_w71_savings_ledger_pct). Emits a
// regulator-relevant event if drift > 5% (the SARS carbon-tax-claim
// integrity floor) - SARS + audit committee + DFFE on hard drift.
export async function nttComparisonBatteryMonthlyLedgerReconciliation(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged: number; drift_total_zar: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ntt_comparison_battery
     WHERE chain_status IN ('savings_certified','audit_published','retraining_triggered')`,
  ).all<NcbRow>();
  const rows = rs.results || [];
  let flagged = 0;
  let driftTotal = 0;
  for (const row of rows) {
    // Reconciliation pct < 95% means W71-vs-battery drift exceeds 5%.
    const recw71 = row.reconciliation_with_w71_savings_ledger_pct ?? 100;
    const drift = 100 - recw71;
    const cumSavings = row.cumulative_savings_zar ?? 0;
    const driftZar = cumSavings * (drift / 100);
    driftTotal += driftZar;

    const driftHigh = drift > REGULATOR_DIVERSION_DISAGREEMENT_FLOOR_PCT;
    if (driftHigh) {
      await env.DB.prepare(
        `UPDATE oe_ntt_comparison_battery
         SET regulator_relevant = 1, is_reportable = 1,
             regulator_reportable_diversion = 1,
             regulator_reason_text = ?,
             updated_at = ?
         WHERE id = ?`,
      ).bind(
        `Monthly W71 ledger reconciliation drift ${drift.toFixed(2)}% > floor ${REGULATOR_DIVERSION_DISAGREEMENT_FLOOR_PCT}% (drift ZAR ${driftZar.toFixed(0)}).`,
        nowIso,
        row.id,
      ).run();

      const evtId = `ntt_comparison_battery_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      await env.DB.prepare(
        'INSERT INTO oe_ntt_comparison_battery_events (id, cycle_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        evtId, row.id, 'ntt_comparison_battery_audit_published',
        row.chain_status, row.chain_status, row.current_tier, row.current_tier,
        'system', 'data_steward',
        `Monthly ledger reconciliation drift ${drift.toFixed(2)}% exceeds floor ${REGULATOR_DIVERSION_DISAGREEMENT_FLOOR_PCT}%.`,
        JSON.stringify({ drift_pct: drift, drift_zar: driftZar, reconciliation_pct: recw71 }),
        nowIso,
      ).run();

      await fireCascade({
        event: 'ntt_comparison_battery_audit_published',
        actor_id: 'system',
        entity_type: 'ntt_comparison_battery',
        entity_id: row.id,
        data: {
          ...row,
          drift_pct: drift,
          drift_zar: driftZar,
          regulator_diversion_disagreement_floor_pct: REGULATOR_DIVERSION_DISAGREEMENT_FLOOR_PCT,
          crosses_into_regulator: true,
        },
        env,
      });
      flagged++;
    }
  }
  return { scanned: rows.length, flagged, drift_total_zar: driftTotal };
}

export default app;
