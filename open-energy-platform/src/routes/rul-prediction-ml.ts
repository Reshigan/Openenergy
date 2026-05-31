// ═══════════════════════════════════════════════════════════════════════════
// Wave 128 - RUL Prediction ML Model lifecycle chain.
//
// PHASE D WAVE 2 OF 4. Survival/Cox PH ML models REPLACING the W71 OLS-style
// degradation slope. Sister of W127 (which replaces the W71 anomaly heuristic).
// Cox PH / AFT / DeepSurv / Random Survival Forest / XGBoost-Surv governance.
//
// Standards: ISO 42001 AI Management Systems, NIST AI RMF, EU AI Act
// (high-risk Annex III energy infrastructure), ISO 27001, SOC 2 Type II,
// NERC CIP-013 OT supply-chain, SOX ML governance audit-evidence chain.
//
// 16 actions: propose_model / bind_survival_dataset / engineer_features /
//   split_train_test / train_model / backtest / calibrate / deploy_shadow /
//   activate_live_ab / promote_champion / retrain / archive / detect_drift /
//   rollback_model / recall_model / activate_failover_to_ols.
//
// SIGNATURE W128 regulator crossings:
//   rollback_model -> EVERY tier (W128 SIGNATURE W128-RUL-ROLLBACK hard line;
//     SECOND Phase-D hard line)
//   recall_model -> EVERY tier WHEN safety_critical_rul
//   detect_drift -> HEAVY tiers WHEN regulator_reportable_rul_quantile OR
//                   (PH-violated AND fleet_systemic)
//   activate_failover_to_ols -> multi_jurisdiction + fleet_systemic
//   promote_champion -> fleet_systemic WHEN iso_42001 (W128-UNIQUE)
//   sla_breached -> HEAVY tiers only
//
// Write {admin, support}. READ all 9 personas. NO public peer endpoint -
// INTERNAL ML governance.
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
  daysToRetrainDue,
  daysToModelCardExpiry,
  bridgesToW71AssetPrognostics,
  bridgesToW21LenderDrawdown,
  bridgesToW77ReserveAccount,
  bridgesToW63WarrantyRecovery,
  bridgesToW118AuditChain,
  controlEffectivenessIndex,
  modelHealthBand,
  isKnownModelFamily,
  isKnownAssetClass,
  RUL_PREDICTION_MODEL_FAMILIES,
  RUL_PREDICTION_ASSET_CLASSES,
  type RpmStatus,
  type RpmAction,
  type RpmTier,
  type RulPredictionModelFamily,
  type RulPredictionAssetClass,
} from '../utils/rul-prediction-ml-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W128 = admin + support write (SAME as W71/W127).
const WRITE_ROLES = new Set(['admin', 'support']);

type ModelCardStatus = 'draft' | 'approved' | 'published' | 'expired';

// ─── Row + event interfaces ───────────────────────────────────────────────
interface RpmRow {
  id: string;
  model_number: string;
  model_family: RulPredictionModelFamily | string;
  model_version: string | null;
  training_dataset_hash: string | null;
  feature_count: number | null;
  asset_class: RulPredictionAssetClass | string;
  assets_covered: number | null;
  jurisdiction_count: number | null;
  safety_critical: number;
  training_examples_count: number | null;
  validation_examples_count: number | null;
  hyperparameter_set_hash: string | null;
  champion_model_id: string | null;
  challenger_model_id: string | null;
  retrain_due_at: string | null;
  model_card_expiry_at: string | null;

  // 5 bridges - W71 NOT NULL by DB constraint.
  w71_asset_prognostics_ref: string;
  w21_lender_drawdown_ref: string | null;
  w77_reserve_account_ref: string | null;
  w63_warranty_recovery_ref: string | null;
  w118_block_ref: string | null;

  // 5 floor flags (RUL-specific).
  safety_critical_rul: number;
  regulator_reportable_rul_quantile: number;
  nerc_cip_audit_in_scope: number;
  sox_ml_governance_required: number;
  iso_42001_ai_management_required: number;

  // Survival-specific 12 LIVE fields.
  concordance_index: number | null;
  time_dependent_auc: number | null;
  brier_score: number | null;
  partial_likelihood: number | null;
  ph_assumption_pvalue: number | null;
  ph_violated_count: number | null;
  kaplan_meier_lift_vs_ols: number | null;
  rul_p10_days: number | null;
  rul_p50_days: number | null;
  rul_p90_days: number | null;
  rul_p50_mae_days: number | null;
  censoring_rate: number | null;

  // Governance (10).
  reconciliation_with_w71_ols_pct: number | null;
  ntt_baseline_comparison_pct: number | null;
  model_card_status: ModelCardStatus | null;
  iso27001_controls_ok: number;
  soc2_type2_controls_ok: number;
  iso_42001_compliance_score: number | null;
  inference_latency_p50_ms: number | null;
  inference_latency_p99_ms: number | null;
  inference_throughput_per_sec: number | null;
  control_effectiveness_index: number | null;

  current_tier: RpmTier;
  authority_required: string | null;
  urgency_band: string | null;
  model_health_band: string | null;

  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;

  chain_status: RpmStatus;
  model_proposed_at: string | null;
  survival_dataset_bound_at: string | null;
  features_engineered_at: string | null;
  train_test_split_at: string | null;
  model_trained_at: string | null;
  backtest_validated_at: string | null;
  calibrated_at: string | null;
  shadow_deployed_at: string | null;
  live_ab_active_at: string | null;
  champion_promoted_at: string | null;
  retrained_at: string | null;
  archived_at: string | null;
  drift_detected_at: string | null;
  rolled_back_at: string | null;
  recalled_at: string | null;
  failover_to_ols_at: string | null;
  regulator_crossed_at: string | null;

  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  last_sla_breach_at: string | null;
  escalation_level: number;
  days_to_retrain_due: number | null;
  days_to_model_card_expiry: number | null;

  tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RpmEventRow {
  id: string;
  model_id: string;
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

const TIMESTAMP_COLUMN: Record<RpmStatus, keyof RpmRow | null> = {
  model_proposed:            'model_proposed_at',
  survival_dataset_bound:    'survival_dataset_bound_at',
  features_engineered:       'features_engineered_at',
  train_test_split:          'train_test_split_at',
  model_trained:             'model_trained_at',
  backtest_validated:        'backtest_validated_at',
  calibrated:                'calibrated_at',
  shadow_deployed:           'shadow_deployed_at',
  live_ab_active:            'live_ab_active_at',
  champion_promoted:         'champion_promoted_at',
  retrained:                 'retrained_at',
  archived:                  'archived_at',
  drift_detected:            'drift_detected_at',
  rolled_back:               'rolled_back_at',
  recalled:                  'recalled_at',
  failover_to_ols:           'failover_to_ols_at',
};

function statusEnteredAt(row: RpmRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.model_proposed_at ? new Date(row.model_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.model_proposed_at ? new Date(row.model_proposed_at) : null);
}

function rowFloorFlags(row: RpmRow) {
  return {
    safety_critical_rul:                row.safety_critical_rul,
    regulator_reportable_rul_quantile:  row.regulator_reportable_rul_quantile,
    nerc_cip_audit_in_scope:            row.nerc_cip_audit_in_scope,
    sox_ml_governance_required:         row.sox_ml_governance_required,
    iso_42001_ai_management_required:   row.iso_42001_ai_management_required,
  };
}

function decorate(row: RpmRow, now: Date) {
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
  const retrainDays = daysToRetrainDue(row.retrain_due_at, now);
  const mcardDays = daysToModelCardExpiry(row.model_card_expiry_at, now);

  const floorFlags = countFloorFlags(flags);
  const floorLargeFleet = floorAtLargeFleet(flags);
  const floorSystemic = floorAtFleetSystemic(flags);

  const controlLive = controlEffectivenessIndex({
    concordance_index:                row.concordance_index,
    time_dependent_auc:               row.time_dependent_auc,
    brier_score:                      row.brier_score,
    partial_likelihood:               row.partial_likelihood,
    ph_assumption_pvalue:             row.ph_assumption_pvalue,
    kaplan_meier_lift_vs_ols:         row.kaplan_meier_lift_vs_ols,
    rul_p50_mae_days:                 row.rul_p50_mae_days,
    censoring_rate:                   row.censoring_rate,
    reconciliation_with_w71_ols_pct:  row.reconciliation_with_w71_ols_pct,
    ntt_baseline_comparison_pct:      row.ntt_baseline_comparison_pct,
    iso_42001_compliance_score:       row.iso_42001_compliance_score,
    model_card_status:                row.model_card_status,
    iso27001_controls_ok:             row.iso27001_controls_ok,
    soc2_type2_controls_ok:           row.soc2_type2_controls_ok,
  });

  const slaBreachedLive = minutesUntilSla != null && minutesUntilSla < 0;

  const healthLive = modelHealthBand(
    status,
    controlLive,
    !!row.sla_breached || slaBreachedLive,
    retrainDays,
    mcardDays,
    flags,
    row.concordance_index ?? 0,
    row.ph_assumption_pvalue ?? 0,
    row.model_card_status,
  );

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
    days_to_retrain_due_live: retrainDays,
    days_to_model_card_expiry_live: mcardDays,
    floor_flag_count_live: floorFlags,
    floor_at_large_fleet_live: floorLargeFleet,
    floor_at_fleet_systemic_live: floorSystemic,
    control_effectiveness_index_live: controlLive,
    model_health_band_live: healthLive,
    concordance_index_live: row.concordance_index,
    time_dependent_auc_live: row.time_dependent_auc,
    brier_score_live: row.brier_score,
    partial_likelihood_live: row.partial_likelihood,
    ph_assumption_pvalue_live: row.ph_assumption_pvalue,
    ph_violated_count_live: row.ph_violated_count,
    kaplan_meier_lift_vs_ols_live: row.kaplan_meier_lift_vs_ols,
    rul_p10_days_live: row.rul_p10_days,
    rul_p50_days_live: row.rul_p50_days,
    rul_p90_days_live: row.rul_p90_days,
    censoring_rate_live: row.censoring_rate,
    model_family_live: row.model_family,
    reconciliation_with_w71_ols_live: row.reconciliation_with_w71_ols_pct,
    ntt_baseline_comparison_pct_live: row.ntt_baseline_comparison_pct,
    bridges_to_w71_asset_prognostics_live: bridgesToW71AssetPrognostics(row.w71_asset_prognostics_ref),
    bridges_to_w21_lender_drawdown_live: bridgesToW21LenderDrawdown(row.w21_lender_drawdown_ref),
    bridges_to_w77_reserve_account_live: bridgesToW77ReserveAccount(row.w77_reserve_account_ref),
    bridges_to_w63_warranty_recovery_live: bridgesToW63WarrantyRecovery(row.w63_warranty_recovery_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(row.w118_block_ref),
  };
}

const app = new Hono<HonoEnv>();

// All routes require auth (no public peer endpoint - this is INTERNAL ML).
app.use('*', authMiddleware);

// ─── List ────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier         = c.req.query('tier');
  const status       = c.req.query('status');
  const model_family = c.req.query('model_family');
  const asset_class  = c.req.query('asset_class');
  const card         = c.req.query('model_card_status');
  const health       = c.req.query('health_band');
  const breached     = c.req.query('breached');
  const reportable   = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_rul_prediction_ml WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)         { sql += ' AND current_tier = ?';      binds.push(tier); }
  if (status)       { sql += ' AND chain_status = ?';      binds.push(status); }
  if (model_family) { sql += ' AND model_family = ?';      binds.push(model_family); }
  if (asset_class)  { sql += ' AND asset_class = ?';       binds.push(asset_class); }
  if (card)         { sql += ' AND model_card_status = ?'; binds.push(card); }
  if (health)       { sql += ' AND model_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<RpmRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_model_family: Record<string, number> = {};
  const by_asset_class: Record<string, number> = {};
  const by_card: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_model_family[i.model_family as string] = (by_model_family[i.model_family as string] || 0) + 1;
    by_asset_class[i.asset_class as string] = (by_asset_class[i.asset_class as string] || 0) + 1;
    if (i.model_card_status) by_card[i.model_card_status as string] = (by_card[i.model_card_status as string] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.model_health_band_live] = (by_health[i.model_health_band_live] || 0) + 1;
  }

  const active_count        = items.filter((i) => !i.is_terminal).length;
  const proposed_count      = items.filter((i) => i.chain_status === 'model_proposed').length;
  const survival_bound_count = items.filter((i) => i.chain_status === 'survival_dataset_bound').length;
  const features_count      = items.filter((i) => i.chain_status === 'features_engineered').length;
  const split_count         = items.filter((i) => i.chain_status === 'train_test_split').length;
  const trained_count       = items.filter((i) => i.chain_status === 'model_trained').length;
  const backtest_count      = items.filter((i) => i.chain_status === 'backtest_validated').length;
  const calibrated_count    = items.filter((i) => i.chain_status === 'calibrated').length;
  const shadow_count        = items.filter((i) => i.chain_status === 'shadow_deployed').length;
  const live_ab_count       = items.filter((i) => i.chain_status === 'live_ab_active').length;
  const champion_count      = items.filter((i) => i.chain_status === 'champion_promoted').length;
  const retrained_count     = items.filter((i) => i.chain_status === 'retrained').length;
  const archived_count      = items.filter((i) => i.chain_status === 'archived').length;
  const drift_count         = items.filter((i) => i.chain_status === 'drift_detected').length;
  const rolled_back_count   = items.filter((i) => i.chain_status === 'rolled_back').length;
  const recalled_count      = items.filter((i) => i.chain_status === 'recalled').length;
  const failover_count      = items.filter((i) => i.chain_status === 'failover_to_ols').length;
  const breached_count      = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const floor_flag_total    = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w118_bridged        = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const w71_bridged         = items.filter((i) => i.bridges_to_w71_asset_prognostics_live).length;
  const w21_bridged         = items.filter((i) => i.bridges_to_w21_lender_drawdown_live).length;
  const w77_bridged         = items.filter((i) => i.bridges_to_w77_reserve_account_live).length;
  const w63_bridged         = items.filter((i) => i.bridges_to_w63_warranty_recovery_live).length;
  const control_avg         = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.control_effectiveness_index_live || 0), 0) / items.length)
    : 0;
  const retrain_within_60d  = items.filter((i) => (i.days_to_retrain_due_live ?? 9999) < 60).length;
  const retrain_within_14d  = items.filter((i) => (i.days_to_retrain_due_live ?? 9999) < 14).length;
  const mcard_within_30d    = items.filter((i) => (i.days_to_model_card_expiry_live ?? 9999) < 30).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_model_family,
      by_asset_class,
      by_model_card_status: by_card,
      by_urgency,
      by_health,
      active_count,
      proposed_count,
      survival_dataset_bound_count: survival_bound_count,
      features_count,
      split_count,
      trained_count,
      backtest_count,
      calibrated_count,
      shadow_count,
      live_ab_count,
      champion_count,
      retrained_count,
      archived_count,
      drift_count,
      rolled_back_count,
      recalled_count,
      failover_count,
      breached: breached_count,
      reportable_total,
      floor_flag_total,
      w71_bridged_count: w71_bridged,
      w21_bridged_count: w21_bridged,
      w77_bridged_count: w77_bridged,
      w63_bridged_count: w63_bridged,
      w118_bridged_count: w118_bridged,
      control_effectiveness_avg: control_avg,
      retrain_within_60d,
      retrain_within_14d,
      model_card_expiring_30d: mcard_within_30d,
      model_families: RUL_PREDICTION_MODEL_FAMILIES,
      asset_classes: RUL_PREDICTION_ASSET_CLASSES,
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
    `SELECT chain_status, current_tier, model_health_band, model_family, asset_class,
            model_card_status, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_rul_prediction_ml
     GROUP BY chain_status, current_tier, model_health_band, model_family, asset_class,
              model_card_status, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; model_health_band: string | null;
    model_family: string | null; asset_class: string | null; model_card_status: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_model_family: Record<string, number> = {};
  const by_asset_class: Record<string, number> = {};
  const by_card: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.model_health_band) by_health[r.model_health_band] = (by_health[r.model_health_band] || 0) + r.n;
    if (r.model_family) by_model_family[r.model_family] = (by_model_family[r.model_family] || 0) + r.n;
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
      total, by_status, by_tier, by_health, by_model_family, by_asset_class,
      by_model_card_status: by_card,
      by_regulator_relevant, by_sla_breached,
      model_families: RUL_PREDICTION_MODEL_FAMILIES,
      asset_classes: RUL_PREDICTION_ASSET_CLASSES,
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_rul_prediction_ml WHERE id = ?').bind(id).first<RpmRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_rul_prediction_ml_events WHERE model_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<RpmEventRow>();

  return c.json({
    success: true,
    data: {
      model: decorate(row, new Date()),
      events: ev.results || [],
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
  model_family?: RulPredictionModelFamily;
  model_version?: string;
  asset_class?: RulPredictionAssetClass;
  feature_count?: number;
  assets_covered?: number;
  jurisdiction_count?: number;
  safety_critical?: boolean | number;
  training_dataset_hash?: string;
  training_examples_count?: number;
  validation_examples_count?: number;
  hyperparameter_set_hash?: string;
  champion_model_id?: string;
  challenger_model_id?: string;
  retrain_due_at?: string;
  model_card_expiry_at?: string;

  // W71 MANDATORY (NOT NULL on DB).
  w71_asset_prognostics_ref: string;
  w21_lender_drawdown_ref?: string;
  w77_reserve_account_ref?: string;
  w63_warranty_recovery_ref?: string;
  w118_block_ref?: string;

  safety_critical_rul?: boolean | number;
  regulator_reportable_rul_quantile?: boolean | number;
  nerc_cip_audit_in_scope?: boolean | number;
  sox_ml_governance_required?: boolean | number;
  iso_42001_ai_management_required?: boolean | number;

  // Survival metrics.
  concordance_index?: number;
  time_dependent_auc?: number;
  brier_score?: number;
  partial_likelihood?: number;
  ph_assumption_pvalue?: number;
  ph_violated_count?: number;
  kaplan_meier_lift_vs_ols?: number;
  rul_p10_days?: number;
  rul_p50_days?: number;
  rul_p90_days?: number;
  rul_p50_mae_days?: number;
  censoring_rate?: number;

  reconciliation_with_w71_ols_pct?: number;
  ntt_baseline_comparison_pct?: number;
  inference_latency_p50_ms?: number;
  inference_latency_p99_ms?: number;
  inference_throughput_per_sec?: number;
  model_card_status?: ModelCardStatus;
  iso27001_controls_ok?: boolean | number;
  soc2_type2_controls_ok?: boolean | number;
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

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<RpmRow>): Partial<RpmRow> {
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')       out.regulator_ref = b.regulator_ref;
  if (typeof b.regulator_inbox_ref === 'string') out.regulator_inbox_ref = b.regulator_inbox_ref;
  if (typeof b.title === 'string')               out.title = b.title;
  return out;
}

// ─── Create endpoint (propose_model) ──────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;

  // W71 bridge MANDATORY (NOT NULL on DB) - reject early with friendly error.
  if (!body.w71_asset_prognostics_ref || typeof body.w71_asset_prognostics_ref !== 'string') {
    return c.json({
      success: false,
      error: 'w71_asset_prognostics_ref is REQUIRED (OLS baseline reconciliation mandatory for RUL Prediction ML).',
    }, 422);
  }

  const id = `rpm-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const modelFamily = isKnownModelFamily(body.model_family)
    ? body.model_family
    : 'cox_ph';
  const assetClass = isKnownAssetClass(body.asset_class)
    ? body.asset_class
    : 'generic';

  const flags = {
    safety_critical_rul:                toFlag(body.safety_critical_rul) ?? 0,
    regulator_reportable_rul_quantile:  toFlag(body.regulator_reportable_rul_quantile) ?? 0,
    nerc_cip_audit_in_scope:            toFlag(body.nerc_cip_audit_in_scope) ?? 0,
    sox_ml_governance_required:         toFlag(body.sox_ml_governance_required) ?? 0,
    iso_42001_ai_management_required:   toFlag(body.iso_42001_ai_management_required) ?? 0,
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
  const sla = slaDeadlineFor('model_proposed', tier, now);
  const slaHrs = slaWindowHours('model_proposed', tier);
  const retrainDays = daysToRetrainDue(body.retrain_due_at ?? null, now);
  const mcardDays = daysToModelCardExpiry(body.model_card_expiry_at ?? null, now);

  // Model number = RPM-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_rul_prediction_ml`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const modelNum = `RPM-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  const controlInit = controlEffectivenessIndex({
    concordance_index:                body.concordance_index ?? null,
    time_dependent_auc:               body.time_dependent_auc ?? null,
    brier_score:                      body.brier_score ?? null,
    partial_likelihood:               body.partial_likelihood ?? null,
    ph_assumption_pvalue:             body.ph_assumption_pvalue ?? null,
    kaplan_meier_lift_vs_ols:         body.kaplan_meier_lift_vs_ols ?? null,
    rul_p50_mae_days:                 body.rul_p50_mae_days ?? null,
    censoring_rate:                   body.censoring_rate ?? null,
    reconciliation_with_w71_ols_pct:  body.reconciliation_with_w71_ols_pct ?? null,
    ntt_baseline_comparison_pct:      body.ntt_baseline_comparison_pct ?? null,
    iso_42001_compliance_score:       body.iso_42001_compliance_score ?? null,
    model_card_status:                body.model_card_status ?? null,
    iso27001_controls_ok:             toFlag(body.iso27001_controls_ok),
    soc2_type2_controls_ok:           toFlag(body.soc2_type2_controls_ok),
  });

  const healthInit = modelHealthBand(
    'model_proposed',
    controlInit,
    false,
    retrainDays,
    mcardDays,
    flags,
    body.concordance_index ?? 0,
    body.ph_assumption_pvalue ?? 0,
    body.model_card_status ?? null,
  );

  await c.env.DB.prepare(
    `INSERT INTO oe_rul_prediction_ml (
      id, model_number, model_family, model_version, training_dataset_hash,
      feature_count, asset_class, assets_covered, jurisdiction_count, safety_critical,
      training_examples_count, validation_examples_count, hyperparameter_set_hash,
      champion_model_id, challenger_model_id, retrain_due_at, model_card_expiry_at,
      w71_asset_prognostics_ref, w21_lender_drawdown_ref, w77_reserve_account_ref,
      w63_warranty_recovery_ref, w118_block_ref,
      safety_critical_rul, regulator_reportable_rul_quantile, nerc_cip_audit_in_scope,
      sox_ml_governance_required, iso_42001_ai_management_required,
      concordance_index, time_dependent_auc, brier_score, partial_likelihood,
      ph_assumption_pvalue, ph_violated_count, kaplan_meier_lift_vs_ols,
      rul_p10_days, rul_p50_days, rul_p90_days, rul_p50_mae_days, censoring_rate,
      reconciliation_with_w71_ols_pct, ntt_baseline_comparison_pct,
      inference_latency_p50_ms, inference_latency_p99_ms, inference_throughput_per_sec,
      model_card_status, iso27001_controls_ok, soc2_type2_controls_ok,
      iso_42001_compliance_score, control_effectiveness_index,
      current_tier, authority_required, urgency_band, model_health_band,
      title, is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, model_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      days_to_retrain_due, days_to_model_card_expiry,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, modelNum, modelFamily, body.model_version ?? null, body.training_dataset_hash ?? null,
    body.feature_count ?? null, assetClass, body.assets_covered ?? null,
    body.jurisdiction_count ?? null, toFlag(body.safety_critical) ?? 0,
    body.training_examples_count ?? null, body.validation_examples_count ?? null,
    body.hyperparameter_set_hash ?? null, body.champion_model_id ?? null,
    body.challenger_model_id ?? null, body.retrain_due_at ?? null,
    body.model_card_expiry_at ?? null,
    body.w71_asset_prognostics_ref, body.w21_lender_drawdown_ref ?? null,
    body.w77_reserve_account_ref ?? null, body.w63_warranty_recovery_ref ?? null,
    body.w118_block_ref ?? null,
    flags.safety_critical_rul, flags.regulator_reportable_rul_quantile,
    flags.nerc_cip_audit_in_scope, flags.sox_ml_governance_required,
    flags.iso_42001_ai_management_required,
    body.concordance_index ?? null, body.time_dependent_auc ?? null,
    body.brier_score ?? null, body.partial_likelihood ?? null,
    body.ph_assumption_pvalue ?? null, body.ph_violated_count ?? null,
    body.kaplan_meier_lift_vs_ols ?? null,
    body.rul_p10_days ?? null, body.rul_p50_days ?? null, body.rul_p90_days ?? null,
    body.rul_p50_mae_days ?? null, body.censoring_rate ?? null,
    body.reconciliation_with_w71_ols_pct ?? null,
    body.ntt_baseline_comparison_pct ?? null,
    body.inference_latency_p50_ms ?? null, body.inference_latency_p99_ms ?? null,
    body.inference_throughput_per_sec ?? null,
    body.model_card_status ?? null,
    toFlag(body.iso27001_controls_ok) ?? 0,
    toFlag(body.soc2_type2_controls_ok) ?? 0,
    body.iso_42001_compliance_score ?? null, controlInit,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs, flags), healthInit,
    body.title ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'model_proposed', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    retrainDays, mcardDays,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `rul_prediction_ml_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_rul_prediction_ml_events (id, model_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'rul_prediction_ml_proposed',
    null, 'model_proposed', null, tier,
    user.id, partyForAction('propose_model'),
    null, JSON.stringify({ tier, model_family: modelFamily, asset_class: assetClass, model_number: modelNum, title: body.title }), nowIso,
  ).run();

  await fireCascade({
    event: 'rul_prediction_ml_proposed',
    actor_id: user.id,
    entity_type: 'rul_prediction_ml',
    entity_id: id,
    data: { tier, model_family: modelFamily, asset_class: assetClass, model_number: modelNum, chain_status: 'model_proposed' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_rul_prediction_ml WHERE id = ?').bind(id).first<RpmRow>();
  return c.json({ success: true, data: { model: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: RpmAction,
  bodyHandler?: (row: RpmRow, body: Record<string, unknown>) => Partial<RpmRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_rul_prediction_ml WHERE id = ?').bind(id).first<RpmRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} via ${action}`,
    }, 422);
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
    safety_critical_rul:
      (overrides.safety_critical_rul as number | undefined)
        ?? row.safety_critical_rul,
    regulator_reportable_rul_quantile:
      (overrides.regulator_reportable_rul_quantile as number | undefined)
        ?? row.regulator_reportable_rul_quantile,
    nerc_cip_audit_in_scope:
      (overrides.nerc_cip_audit_in_scope as number | undefined)
        ?? row.nerc_cip_audit_in_scope,
    sox_ml_governance_required:
      (overrides.sox_ml_governance_required as number | undefined)
        ?? row.sox_ml_governance_required,
    iso_42001_ai_management_required:
      (overrides.iso_42001_ai_management_required as number | undefined)
        ?? row.iso_42001_ai_management_required,
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

  const retrainAt = (overrides.retrain_due_at as string | undefined) ?? row.retrain_due_at;
  const retrainDays = daysToRetrainDue(retrainAt, now);
  overrides.days_to_retrain_due = retrainDays;
  const mcardAt = (overrides.model_card_expiry_at as string | undefined) ?? row.model_card_expiry_at;
  const mcardDays = daysToModelCardExpiry(mcardAt, now);
  overrides.days_to_model_card_expiry = mcardDays;

  const cardEff =
    (overrides.model_card_status as ModelCardStatus | undefined) ?? row.model_card_status;

  const controlScore = controlEffectivenessIndex({
    concordance_index:
      (overrides.concordance_index as number | undefined) ?? row.concordance_index,
    time_dependent_auc:
      (overrides.time_dependent_auc as number | undefined) ?? row.time_dependent_auc,
    brier_score:
      (overrides.brier_score as number | undefined) ?? row.brier_score,
    partial_likelihood:
      (overrides.partial_likelihood as number | undefined) ?? row.partial_likelihood,
    ph_assumption_pvalue:
      (overrides.ph_assumption_pvalue as number | undefined) ?? row.ph_assumption_pvalue,
    kaplan_meier_lift_vs_ols:
      (overrides.kaplan_meier_lift_vs_ols as number | undefined) ?? row.kaplan_meier_lift_vs_ols,
    rul_p50_mae_days:
      (overrides.rul_p50_mae_days as number | undefined) ?? row.rul_p50_mae_days,
    censoring_rate:
      (overrides.censoring_rate as number | undefined) ?? row.censoring_rate,
    reconciliation_with_w71_ols_pct:
      (overrides.reconciliation_with_w71_ols_pct as number | undefined) ?? row.reconciliation_with_w71_ols_pct,
    ntt_baseline_comparison_pct:
      (overrides.ntt_baseline_comparison_pct as number | undefined) ?? row.ntt_baseline_comparison_pct,
    iso_42001_compliance_score:
      (overrides.iso_42001_compliance_score as number | undefined) ?? row.iso_42001_compliance_score,
    model_card_status: cardEff,
    iso27001_controls_ok:
      (overrides.iso27001_controls_ok as number | undefined) ?? row.iso27001_controls_ok,
    soc2_type2_controls_ok:
      (overrides.soc2_type2_controls_ok as number | undefined) ?? row.soc2_type2_controls_ok,
  });
  overrides.control_effectiveness_index = controlScore;

  // Health band composite (uses concordance + PH p-value instead of drift_psi + FPR).
  const cIdxEff = (overrides.concordance_index as number | undefined) ?? row.concordance_index ?? 0;
  const phpEff = (overrides.ph_assumption_pvalue as number | undefined) ?? row.ph_assumption_pvalue ?? 0;
  overrides.model_health_band = modelHealthBand(
    to,
    controlScore,
    !!row.sla_breached,
    retrainDays,
    mcardDays,
    floorFlags,
    cIdxEff,
    phpEff,
    cardEff,
  );

  // SIGNATURE crossings (W128-unique: promote_champion + ph_violated logic).
  const phViolated = (
    (overrides.ph_violated_count as number | undefined) ?? row.ph_violated_count ?? 0
  ) > 0 || (
    ((overrides.ph_assumption_pvalue as number | undefined) ?? row.ph_assumption_pvalue ?? 1) < 0.05
  );
  const crosses = crossesIntoRegulator(action, tier, {
    flags: floorFlags,
    ph_assumption_violated: phViolated,
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
    `UPDATE oe_rul_prediction_ml SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `rul_prediction_ml_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_rul_prediction_ml_events (id, model_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `rul_prediction_ml_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'rul_prediction_ml',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_rul_prediction_ml WHERE id = ?').bind(id).first<RpmRow>();
  return c.json({ success: true, data: { model: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; propose handled by POST /) ─────────
app.post('/:id/bind-survival-dataset', async (c) => transition(c, 'bind_survival_dataset', (_row, body) => {
  const b = body as Partial<CommonBody & {
    training_dataset_hash?: string;
    training_examples_count?: number;
    censoring_rate?: number;
  }>;
  const out: Partial<RpmRow> = {};
  if (typeof b.training_dataset_hash === 'string') out.training_dataset_hash = b.training_dataset_hash;
  if (typeof b.training_examples_count === 'number') out.training_examples_count = b.training_examples_count;
  if (typeof b.censoring_rate === 'number') out.censoring_rate = b.censoring_rate;
  return applyCommon(b, out);
}));

app.post('/:id/engineer-features', async (c) => transition(c, 'engineer_features', (_row, body) => {
  const b = body as Partial<CommonBody & {
    feature_count?: number;
    hyperparameter_set_hash?: string;
  }>;
  const out: Partial<RpmRow> = {};
  if (typeof b.feature_count === 'number') out.feature_count = b.feature_count;
  if (typeof b.hyperparameter_set_hash === 'string') out.hyperparameter_set_hash = b.hyperparameter_set_hash;
  return applyCommon(b, out);
}));

app.post('/:id/split-train-test', async (c) => transition(c, 'split_train_test', (_row, body) => {
  const b = body as Partial<CommonBody & {
    training_examples_count?: number;
    validation_examples_count?: number;
  }>;
  const out: Partial<RpmRow> = {};
  if (typeof b.training_examples_count === 'number') out.training_examples_count = b.training_examples_count;
  if (typeof b.validation_examples_count === 'number') out.validation_examples_count = b.validation_examples_count;
  return applyCommon(b, out);
}));

app.post('/:id/train-model', async (c) => transition(c, 'train_model', (_row, body) => {
  const b = body as Partial<CommonBody & {
    partial_likelihood?: number;
    iso27001_controls_ok?: boolean | number;
    soc2_type2_controls_ok?: boolean | number;
  }>;
  const out: Partial<RpmRow> = {};
  if (typeof b.partial_likelihood === 'number') {
    out.partial_likelihood = b.partial_likelihood;
  }
  const f1 = toFlag(b.iso27001_controls_ok); if (f1 !== undefined) out.iso27001_controls_ok = f1;
  const f2 = toFlag(b.soc2_type2_controls_ok); if (f2 !== undefined) out.soc2_type2_controls_ok = f2;
  return applyCommon(b, out);
}));

app.post('/:id/backtest', async (c) => transition(c, 'backtest', (_row, body) => {
  const b = body as Partial<CommonBody & {
    concordance_index?: number;
    time_dependent_auc?: number;
    brier_score?: number;
    ph_assumption_pvalue?: number;
    ph_violated_count?: number;
    kaplan_meier_lift_vs_ols?: number;
    rul_p50_mae_days?: number;
    reconciliation_with_w71_ols_pct?: number;
    ntt_baseline_comparison_pct?: number;
  }>;
  const out: Partial<RpmRow> = {};
  if (typeof b.concordance_index === 'number') out.concordance_index = b.concordance_index;
  if (typeof b.time_dependent_auc === 'number') out.time_dependent_auc = b.time_dependent_auc;
  if (typeof b.brier_score === 'number') out.brier_score = b.brier_score;
  if (typeof b.ph_assumption_pvalue === 'number') out.ph_assumption_pvalue = b.ph_assumption_pvalue;
  if (typeof b.ph_violated_count === 'number') out.ph_violated_count = b.ph_violated_count;
  if (typeof b.kaplan_meier_lift_vs_ols === 'number') out.kaplan_meier_lift_vs_ols = b.kaplan_meier_lift_vs_ols;
  if (typeof b.rul_p50_mae_days === 'number') out.rul_p50_mae_days = b.rul_p50_mae_days;
  if (typeof b.reconciliation_with_w71_ols_pct === 'number') {
    out.reconciliation_with_w71_ols_pct = b.reconciliation_with_w71_ols_pct;
  }
  if (typeof b.ntt_baseline_comparison_pct === 'number') {
    out.ntt_baseline_comparison_pct = b.ntt_baseline_comparison_pct;
  }
  return applyCommon(b, out);
}));

app.post('/:id/calibrate', async (c) => transition(c, 'calibrate', (_row, body) => {
  const b = body as Partial<CommonBody & {
    model_card_status?: ModelCardStatus;
    iso_42001_compliance_score?: number;
    rul_p10_days?: number;
    rul_p50_days?: number;
    rul_p90_days?: number;
  }>;
  const out: Partial<RpmRow> = {};
  if (b.model_card_status) out.model_card_status = b.model_card_status;
  if (typeof b.iso_42001_compliance_score === 'number') out.iso_42001_compliance_score = b.iso_42001_compliance_score;
  if (typeof b.rul_p10_days === 'number') out.rul_p10_days = b.rul_p10_days;
  if (typeof b.rul_p50_days === 'number') out.rul_p50_days = b.rul_p50_days;
  if (typeof b.rul_p90_days === 'number') out.rul_p90_days = b.rul_p90_days;
  return applyCommon(b, out);
}));

app.post('/:id/deploy-shadow', async (c) => transition(c, 'deploy_shadow', (_row, body) => {
  const b = body as Partial<CommonBody & {
    inference_latency_p50_ms?: number;
    inference_latency_p99_ms?: number;
    inference_throughput_per_sec?: number;
  }>;
  const out: Partial<RpmRow> = {};
  if (typeof b.inference_latency_p50_ms === 'number') out.inference_latency_p50_ms = b.inference_latency_p50_ms;
  if (typeof b.inference_latency_p99_ms === 'number') out.inference_latency_p99_ms = b.inference_latency_p99_ms;
  if (typeof b.inference_throughput_per_sec === 'number') out.inference_throughput_per_sec = b.inference_throughput_per_sec;
  return applyCommon(b, out);
}));

app.post('/:id/activate-live-ab', async (c) => transition(c, 'activate_live_ab', (_row, body) => {
  const b = body as Partial<CommonBody & {
    kaplan_meier_lift_vs_ols?: number;
    challenger_model_id?: string;
  }>;
  const out: Partial<RpmRow> = {};
  if (typeof b.kaplan_meier_lift_vs_ols === 'number') out.kaplan_meier_lift_vs_ols = b.kaplan_meier_lift_vs_ols;
  if (typeof b.challenger_model_id === 'string') out.challenger_model_id = b.challenger_model_id;
  return applyCommon(b, out);
}));

app.post('/:id/promote-champion', async (c) => transition(c, 'promote_champion', (_row, body) => {
  const b = body as Partial<CommonBody & {
    champion_model_id?: string;
    model_card_status?: ModelCardStatus;
    w71_asset_prognostics_ref?: string;
    w118_block_ref?: string;
  }>;
  const out: Partial<RpmRow> = {};
  if (typeof b.champion_model_id === 'string') out.champion_model_id = b.champion_model_id;
  if (b.model_card_status) out.model_card_status = b.model_card_status;
  if (typeof b.w71_asset_prognostics_ref === 'string') out.w71_asset_prognostics_ref = b.w71_asset_prognostics_ref;
  if (typeof b.w118_block_ref === 'string') out.w118_block_ref = b.w118_block_ref;
  return applyCommon(b, out);
}));

app.post('/:id/retrain', async (c) => transition(c, 'retrain', (_row, body) => {
  const b = body as Partial<CommonBody & {
    training_dataset_hash?: string;
    retrain_due_at?: string;
    concordance_index?: number;
    ph_assumption_pvalue?: number;
  }>;
  const out: Partial<RpmRow> = {};
  if (typeof b.training_dataset_hash === 'string') out.training_dataset_hash = b.training_dataset_hash;
  if (typeof b.retrain_due_at === 'string') out.retrain_due_at = b.retrain_due_at;
  if (typeof b.concordance_index === 'number') out.concordance_index = b.concordance_index;
  if (typeof b.ph_assumption_pvalue === 'number') out.ph_assumption_pvalue = b.ph_assumption_pvalue;
  return applyCommon(b, out);
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/detect-drift', async (c) => transition(c, 'detect_drift', (_row, body) => {
  const b = body as Partial<CommonBody & {
    concordance_index?: number;
    ph_assumption_pvalue?: number;
    ph_violated_count?: number;
    regulator_reportable_rul_quantile?: boolean | number;
  }>;
  const out: Partial<RpmRow> = {};
  if (typeof b.concordance_index === 'number') out.concordance_index = b.concordance_index;
  if (typeof b.ph_assumption_pvalue === 'number') out.ph_assumption_pvalue = b.ph_assumption_pvalue;
  if (typeof b.ph_violated_count === 'number') out.ph_violated_count = b.ph_violated_count;
  const f = toFlag(b.regulator_reportable_rul_quantile); if (f !== undefined) out.regulator_reportable_rul_quantile = f;
  return applyCommon(b, out);
}));

app.post('/:id/rollback-model', async (c) => transition(c, 'rollback_model', (_row, body) => {
  const b = body as Partial<CommonBody & {
    champion_model_id?: string;
  }>;
  const out: Partial<RpmRow> = {};
  if (typeof b.champion_model_id === 'string') out.champion_model_id = b.champion_model_id;
  return applyCommon(b, out);
}));

app.post('/:id/recall-model', async (c) => transition(c, 'recall_model', (_row, body) => {
  const b = body as Partial<CommonBody & {
    safety_critical_rul?: boolean | number;
  }>;
  const out: Partial<RpmRow> = {};
  const f = toFlag(b.safety_critical_rul); if (f !== undefined) out.safety_critical_rul = f;
  return applyCommon(b, out);
}));

app.post('/:id/activate-failover-to-ols', async (c) => transition(c, 'activate_failover_to_ols', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
export async function rulPredictionMlSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_rul_prediction_ml
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<RpmRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_rul_prediction_ml
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `rul_prediction_ml_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_rul_prediction_ml_events (id, model_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'rul_prediction_ml_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'ml_engineer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as RpmTier)) {
      await fireCascade({
        event: 'rul_prediction_ml_sla_breached',
        actor_id: 'system',
        entity_type: 'rul_prediction_ml',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }
    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: daily concordance-monitor (0 3 * * *) ──────────────────────────
//
// 03:00 UTC = 05:00 SAST, 30 min after W127 drift scan so survival models
// see fresh anomaly-flagged events for censoring decisions. Refreshes
// LIVE-derived persisted fields and flags models with concordance < 0.7
// OR PH p-value < 0.05 as regulator_relevant for morning briefing.
export async function rulPredictionMlConcordanceMonitor(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged_low_concordance: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_rul_prediction_ml
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')`,
  ).all<RpmRow>();

  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const control = controlEffectivenessIndex({
      concordance_index:                row.concordance_index,
      time_dependent_auc:               row.time_dependent_auc,
      brier_score:                      row.brier_score,
      partial_likelihood:               row.partial_likelihood,
      ph_assumption_pvalue:             row.ph_assumption_pvalue,
      kaplan_meier_lift_vs_ols:         row.kaplan_meier_lift_vs_ols,
      rul_p50_mae_days:                 row.rul_p50_mae_days,
      censoring_rate:                   row.censoring_rate,
      reconciliation_with_w71_ols_pct:  row.reconciliation_with_w71_ols_pct,
      ntt_baseline_comparison_pct:      row.ntt_baseline_comparison_pct,
      iso_42001_compliance_score:       row.iso_42001_compliance_score,
      model_card_status:                row.model_card_status,
      iso27001_controls_ok:             row.iso27001_controls_ok,
      soc2_type2_controls_ok:           row.soc2_type2_controls_ok,
    });

    const retrainDays = daysToRetrainDue(row.retrain_due_at, now);
    const mcardDays = daysToModelCardExpiry(row.model_card_expiry_at, now);
    const flags = rowFloorFlags(row);

    const health = modelHealthBand(
      row.chain_status,
      control,
      !!row.sla_breached,
      retrainDays,
      mcardDays,
      flags,
      row.concordance_index ?? 0,
      row.ph_assumption_pvalue ?? 0,
      row.model_card_status,
    );

    const lowConcordance = (row.concordance_index ?? 1) < 0.7;
    const phViolated = (row.ph_assumption_pvalue ?? 1) < 0.05;
    const survivalFlag = lowConcordance || phViolated;
    const regulatorRelevantBump = survivalFlag ? 1 : row.regulator_relevant;
    const isReportableBump = survivalFlag ? 1 : row.is_reportable;
    if (survivalFlag) flagged++;

    await env.DB.prepare(
      `UPDATE oe_rul_prediction_ml
       SET control_effectiveness_index = ?,
           model_health_band = ?,
           days_to_retrain_due = ?,
           days_to_model_card_expiry = ?,
           regulator_relevant = ?,
           is_reportable = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(control, health, retrainDays, mcardDays, regulatorRelevantBump, isReportableBump, nowIso, row.id).run();
  }
  return { scanned: rows.length, flagged_low_concordance: flagged };
}

// ─── Cron: weekly model-card expiry scan (0 7 * * 1) ─────────────────────
export async function rulPredictionMlModelCardExpirySweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_rul_prediction_ml
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')
       AND model_card_expiry_at IS NOT NULL`,
  ).all<RpmRow>();
  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const mcardDays = daysToModelCardExpiry(row.model_card_expiry_at, now);
    if (mcardDays < 14) {
      await env.DB.prepare(
        `UPDATE oe_rul_prediction_ml
         SET regulator_relevant = 1, is_reportable = 1,
             days_to_model_card_expiry = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(mcardDays, nowIso, row.id).run();
      flagged++;
    } else {
      await env.DB.prepare(
        `UPDATE oe_rul_prediction_ml
         SET days_to_model_card_expiry = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(mcardDays, nowIso, row.id).run();
    }
  }
  return { scanned: rows.length, flagged };
}

export default app;
