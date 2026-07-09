// ═══════════════════════════════════════════════════════════════════════════
// Wave 129 - Fault-Fingerprint Multi-Class ML chain.
//
// PHASE D WAVE 3 OF 4. Multi-class fault classifier REPLACING the W71 12-mode
// physics-rule fault fingerprinting. Sister of W127 (anomaly ML) and W128
// (survival/RUL ML). XGBoost / RandomForest / GradientBoosting / 1D-CNN /
// LightGBM / CatBoost / baseline_physics governance.
//
// Standards: ISO 42001, NIST AI RMF, EU AI Act Art 14/21, ISO 27001, SOC 2
// Type II, NERC CIP-013 OT, SOX ML governance audit-evidence chain.
//
// 18 actions: propose_model / bind_labeled_dataset / resolve_class_imbalance /
//   engineer_features / split_train_test / train_multiclass /
//   validate_confusion_matrix / calibrate / deploy_shadow / activate_live_ab /
//   promote_champion / retrain / archive / detect_class_drift /
//   rollback_model / recall_model / failover_to_physics_baseline /
//   add_novel_class.
//
// SIGNATURE W129 regulator crossings:
//   rollback_model -> EVERY tier (W129 inherits W127-ML-ROLLBACK; THIRD
//     Phase-D rollback hard line.)
//   recall_model -> EVERY tier WHEN safety_critical_fault_class
//   detect_class_drift -> HEAVY tiers WHEN regulator_reportable_misclass
//   failover_to_physics_baseline -> multi_jurisdiction + fleet_systemic
//   add_novel_class -> fleet_systemic only (W129-UNIQUE: EU AI Act Art 14
//     product-class change)
//   sla_breached -> HEAVY tiers only
//
// Write {admin, support}. READ all 9 personas. NO public peer endpoint -
// INTERNAL ML governance.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { badEnum } from '../utils/validation';
import { requireTier } from '../middleware/entitlement';
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
  bridgesToW15WarrantyClaim,
  bridgesToW41ProblemManagement,
  bridgesToW63WarrantyRecovery,
  bridgesToW118AuditChain,
  controlEffectivenessIndex,
  modelHealthBand,
  isKnownModelFamily,
  isKnownAssetClass,
  isKnownFaultMode,
  FAULT_FINGERPRINT_MODEL_FAMILIES,
  FAULT_FINGERPRINT_ASSET_CLASSES,
  FAULT_FINGERPRINT_FAULT_MODES,
  MIN_SAMPLES_PER_CLASS_FLOOR,
  type FfmlStatus,
  type FfmlAction,
  type FfmlTier,
  type FaultFingerprintModelFamily,
  type FaultFingerprintAssetClass,
} from '../utils/fault-fingerprint-ml-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W129 = admin + support write (SAME as W71/W127/W128).
const WRITE_ROLES = new Set(['admin', 'support']);

type ModelCardStatus = 'draft' | 'approved' | 'published' | 'expired';

// ─── Row + event interfaces ───────────────────────────────────────────────
interface FfmlRow {
  id: string;
  model_number: string;
  model_family: FaultFingerprintModelFamily | string;
  model_version: string | null;
  training_dataset_hash: string | null;
  feature_count: number | null;
  asset_class: FaultFingerprintAssetClass | string;
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
  w15_warranty_claim_ref: string | null;
  w41_problem_management_ref: string | null;
  w63_warranty_recovery_ref: string | null;
  w118_block_ref: string | null;

  // 5 floor flags (FFML-specific).
  safety_critical_fault_class: number;
  regulator_reportable_misclass: number;
  nerc_cip_audit_in_scope: number;
  sox_ml_governance_required: number;
  iso_42001_required: number;

  // Multi-class specifics.
  class_count: number | null;
  class_label_set_hash: string | null;
  class_distribution_payload: string | null;
  confusion_matrix: string | null;
  min_samples_per_class: number | null;

  // Multi-class 11 LIVE metric fields.
  macro_f1: number | null;
  micro_f1: number | null;
  weighted_recall: number | null;
  top_3_accuracy: number | null;
  log_loss: number | null;
  roc_auc_macro: number | null;
  confusion_matrix_density: number | null;
  class_imbalance_ratio: number | null;
  calibration_brier: number | null;
  class_drift_psi: number | null;
  novel_class_detection_rate: number | null;

  // Governance.
  reconciliation_with_w71_physics_pct: number | null;
  ntt_baseline_comparison_pct: number | null;
  inference_latency_p50_ms: number | null;
  inference_latency_p99_ms: number | null;
  model_card_status: ModelCardStatus | null;
  iso27001_controls_ok: number;
  soc2_type2_controls_ok: number;
  iso_42001_compliance_score: number | null;
  control_effectiveness_index: number | null;

  current_tier: FfmlTier;
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

  chain_status: FfmlStatus;
  model_proposed_at: string | null;
  labeled_dataset_bound_at: string | null;
  class_imbalance_resolved_at: string | null;
  features_engineered_at: string | null;
  train_test_split_at: string | null;
  multiclass_model_trained_at: string | null;
  confusion_matrix_validated_at: string | null;
  calibrated_at: string | null;
  shadow_deployed_at: string | null;
  live_ab_active_at: string | null;
  champion_promoted_at: string | null;
  retrained_at: string | null;
  archived_at: string | null;
  class_drift_detected_at: string | null;
  rolled_back_at: string | null;
  recalled_at: string | null;
  failover_to_physics_baseline_at: string | null;
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

interface FfmlEventRow {
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

const TIMESTAMP_COLUMN: Record<FfmlStatus, keyof FfmlRow | null> = {
  model_proposed:                'model_proposed_at',
  labeled_dataset_bound:         'labeled_dataset_bound_at',
  class_imbalance_resolved:      'class_imbalance_resolved_at',
  features_engineered:           'features_engineered_at',
  train_test_split:              'train_test_split_at',
  multiclass_model_trained:      'multiclass_model_trained_at',
  confusion_matrix_validated:    'confusion_matrix_validated_at',
  calibrated:                    'calibrated_at',
  shadow_deployed:               'shadow_deployed_at',
  live_ab_active:                'live_ab_active_at',
  champion_promoted:             'champion_promoted_at',
  retrained:                     'retrained_at',
  archived:                      'archived_at',
  class_drift_detected:          'class_drift_detected_at',
  rolled_back:                   'rolled_back_at',
  recalled:                      'recalled_at',
  failover_to_physics_baseline:  'failover_to_physics_baseline_at',
};

function statusEnteredAt(row: FfmlRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.model_proposed_at ? new Date(row.model_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.model_proposed_at ? new Date(row.model_proposed_at) : null);
}

function rowFloorFlags(row: FfmlRow) {
  return {
    safety_critical_fault_class:    row.safety_critical_fault_class,
    regulator_reportable_misclass:  row.regulator_reportable_misclass,
    nerc_cip_audit_in_scope:        row.nerc_cip_audit_in_scope,
    sox_ml_governance_required:     row.sox_ml_governance_required,
    iso_42001_required:             row.iso_42001_required,
  };
}

function decorate(row: FfmlRow, now: Date) {
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
    macro_f1:                            row.macro_f1,
    micro_f1:                            row.micro_f1,
    weighted_recall:                     row.weighted_recall,
    top_3_accuracy:                      row.top_3_accuracy,
    log_loss:                            row.log_loss,
    roc_auc_macro:                       row.roc_auc_macro,
    confusion_matrix_density:            row.confusion_matrix_density,
    class_imbalance_ratio:               row.class_imbalance_ratio,
    calibration_brier:                   row.calibration_brier,
    class_drift_psi:                     row.class_drift_psi,
    novel_class_detection_rate:          row.novel_class_detection_rate,
    reconciliation_with_w71_physics_pct: row.reconciliation_with_w71_physics_pct,
    ntt_baseline_comparison_pct:         row.ntt_baseline_comparison_pct,
    iso_42001_compliance_score:          row.iso_42001_compliance_score,
    model_card_status:                   row.model_card_status,
    iso27001_controls_ok:                row.iso27001_controls_ok,
    soc2_type2_controls_ok:              row.soc2_type2_controls_ok,
  });

  const slaBreachedLive = minutesUntilSla != null && minutesUntilSla < 0;

  const healthLive = modelHealthBand(
    status,
    controlLive,
    !!row.sla_breached || slaBreachedLive,
    retrainDays,
    mcardDays,
    flags,
    row.macro_f1 ?? 0,
    row.class_drift_psi ?? 0,
    row.model_card_status,
  );

  let confusionMatrixParsed: unknown = null;
  if (row.confusion_matrix) {
    try { confusionMatrixParsed = JSON.parse(row.confusion_matrix); } catch { /* keep null */ }
  }
  let classDistributionParsed: unknown = null;
  if (row.class_distribution_payload) {
    try { classDistributionParsed = JSON.parse(row.class_distribution_payload); } catch { /* keep null */ }
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
    days_to_retrain_due_live: retrainDays,
    days_to_model_card_expiry_live: mcardDays,
    floor_flag_count_live: floorFlags,
    floor_at_large_fleet_live: floorLargeFleet,
    floor_at_fleet_systemic_live: floorSystemic,
    control_effectiveness_index_live: controlLive,
    model_health_band_live: healthLive,
    macro_f1_live: row.macro_f1,
    micro_f1_live: row.micro_f1,
    weighted_recall_live: row.weighted_recall,
    top_3_accuracy_live: row.top_3_accuracy,
    log_loss_live: row.log_loss,
    roc_auc_macro_live: row.roc_auc_macro,
    confusion_matrix_density_live: row.confusion_matrix_density,
    class_imbalance_ratio_live: row.class_imbalance_ratio,
    calibration_brier_live: row.calibration_brier,
    class_drift_psi_live: row.class_drift_psi,
    novel_class_detection_rate_live: row.novel_class_detection_rate,
    model_family_live: row.model_family,
    class_count_live: row.class_count,
    min_samples_per_class_floor: MIN_SAMPLES_PER_CLASS_FLOOR,
    min_samples_per_class_ok_live:
      row.min_samples_per_class != null
        ? row.min_samples_per_class >= MIN_SAMPLES_PER_CLASS_FLOOR
        : null,
    confusion_matrix_parsed: confusionMatrixParsed,
    class_distribution_parsed: classDistributionParsed,
    reconciliation_with_w71_physics_live: row.reconciliation_with_w71_physics_pct,
    ntt_baseline_comparison_pct_live: row.ntt_baseline_comparison_pct,
    bridges_to_w71_asset_prognostics_live: bridgesToW71AssetPrognostics(row.w71_asset_prognostics_ref),
    bridges_to_w15_warranty_claim_live: bridgesToW15WarrantyClaim(row.w15_warranty_claim_ref),
    bridges_to_w41_problem_management_live: bridgesToW41ProblemManagement(row.w41_problem_management_ref),
    bridges_to_w63_warranty_recovery_live: bridgesToW63WarrantyRecovery(row.w63_warranty_recovery_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(row.w118_block_ref),
  };
}

const app = new Hono<HonoEnv>();

// All routes require auth (no public peer endpoint - this is INTERNAL ML).
app.use('*', authMiddleware);
// ML model governance is a paid surface: authoring/deploying models
// requires professional|enterprise. Reads (GET) stay open.
app.use('*', requireTier('professional', 'enterprise'));

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

  let sql = 'SELECT * FROM oe_fault_fingerprint_ml WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)         { sql += ' AND current_tier = ?';      binds.push(tier); }
  if (status)       { sql += ' AND chain_status = ?';      binds.push(status); }
  if (model_family) { sql += ' AND model_family = ?';      binds.push(model_family); }
  if (asset_class)  { sql += ' AND asset_class = ?';       binds.push(asset_class); }
  if (card)         { sql += ' AND model_card_status = ?'; binds.push(card); }
  if (health)       { sql += ' AND model_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<FfmlRow>();
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

  const active_count           = items.filter((i) => !i.is_terminal).length;
  const proposed_count         = items.filter((i) => i.chain_status === 'model_proposed').length;
  const labeled_bound_count    = items.filter((i) => i.chain_status === 'labeled_dataset_bound').length;
  const imbalance_count        = items.filter((i) => i.chain_status === 'class_imbalance_resolved').length;
  const features_count         = items.filter((i) => i.chain_status === 'features_engineered').length;
  const split_count            = items.filter((i) => i.chain_status === 'train_test_split').length;
  const trained_count          = items.filter((i) => i.chain_status === 'multiclass_model_trained').length;
  const cm_validated_count     = items.filter((i) => i.chain_status === 'confusion_matrix_validated').length;
  const calibrated_count       = items.filter((i) => i.chain_status === 'calibrated').length;
  const shadow_count           = items.filter((i) => i.chain_status === 'shadow_deployed').length;
  const live_ab_count          = items.filter((i) => i.chain_status === 'live_ab_active').length;
  const champion_count         = items.filter((i) => i.chain_status === 'champion_promoted').length;
  const retrained_count        = items.filter((i) => i.chain_status === 'retrained').length;
  const archived_count         = items.filter((i) => i.chain_status === 'archived').length;
  const class_drift_count      = items.filter((i) => i.chain_status === 'class_drift_detected').length;
  const rolled_back_count      = items.filter((i) => i.chain_status === 'rolled_back').length;
  const recalled_count         = items.filter((i) => i.chain_status === 'recalled').length;
  const failover_count         = items.filter((i) => i.chain_status === 'failover_to_physics_baseline').length;
  const breached_count         = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total       = items.filter((i) => i.is_reportable_flag).length;
  const floor_flag_total       = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w118_bridged           = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const w71_bridged            = items.filter((i) => i.bridges_to_w71_asset_prognostics_live).length;
  const w15_bridged            = items.filter((i) => i.bridges_to_w15_warranty_claim_live).length;
  const w41_bridged            = items.filter((i) => i.bridges_to_w41_problem_management_live).length;
  const w63_bridged            = items.filter((i) => i.bridges_to_w63_warranty_recovery_live).length;
  const control_avg            = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.control_effectiveness_index_live || 0), 0) / items.length)
    : 0;
  const retrain_within_60d     = items.filter((i) => (i.days_to_retrain_due_live ?? 9999) < 60).length;
  const retrain_within_14d     = items.filter((i) => (i.days_to_retrain_due_live ?? 9999) < 14).length;
  const mcard_within_30d       = items.filter((i) => (i.days_to_model_card_expiry_live ?? 9999) < 30).length;
  const min_samples_floor_fail = items.filter((i) => i.min_samples_per_class_ok_live === false).length;

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
      labeled_bound_count,
      imbalance_resolved_count: imbalance_count,
      features_count,
      split_count,
      trained_count,
      confusion_matrix_validated_count: cm_validated_count,
      calibrated_count,
      shadow_count,
      live_ab_count,
      champion_count,
      retrained_count,
      archived_count,
      class_drift_count,
      rolled_back_count,
      recalled_count,
      failover_count,
      breached: breached_count,
      reportable_total,
      floor_flag_total,
      w71_bridged_count: w71_bridged,
      w15_bridged_count: w15_bridged,
      w41_bridged_count: w41_bridged,
      w63_bridged_count: w63_bridged,
      w118_bridged_count: w118_bridged,
      control_effectiveness_avg: control_avg,
      retrain_within_60d,
      retrain_within_14d,
      model_card_expiring_30d: mcard_within_30d,
      min_samples_per_class_floor: MIN_SAMPLES_PER_CLASS_FLOOR,
      min_samples_floor_fail_count: min_samples_floor_fail,
      model_families: FAULT_FINGERPRINT_MODEL_FAMILIES,
      asset_classes: FAULT_FINGERPRINT_ASSET_CLASSES,
      fault_modes: FAULT_FINGERPRINT_FAULT_MODES,
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
     FROM oe_fault_fingerprint_ml
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
      model_families: FAULT_FINGERPRINT_MODEL_FAMILIES,
      asset_classes: FAULT_FINGERPRINT_ASSET_CLASSES,
      fault_modes: FAULT_FINGERPRINT_FAULT_MODES,
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_fault_fingerprint_ml WHERE id = ?').bind(id).first<FfmlRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_fault_fingerprint_ml_events WHERE model_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<FfmlEventRow>();

  return c.json({
    success: true,
    data: {
      model: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Confusion matrix endpoint ────────────────────────────────────────────
app.get('/:id/confusion-matrix', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare(
    'SELECT id, model_number, class_count, class_label_set_hash, confusion_matrix, confusion_matrix_density, class_distribution_payload FROM oe_fault_fingerprint_ml WHERE id = ?',
  ).bind(id).first<{
    id: string;
    model_number: string;
    class_count: number | null;
    class_label_set_hash: string | null;
    confusion_matrix: string | null;
    confusion_matrix_density: number | null;
    class_distribution_payload: string | null;
  }>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  let cm: unknown = null;
  if (row.confusion_matrix) {
    try { cm = JSON.parse(row.confusion_matrix); } catch { cm = null; }
  }
  let dist: unknown = null;
  if (row.class_distribution_payload) {
    try { dist = JSON.parse(row.class_distribution_payload); } catch { dist = null; }
  }
  return c.json({
    success: true,
    data: {
      id: row.id,
      model_number: row.model_number,
      class_count: row.class_count,
      class_label_set_hash: row.class_label_set_hash,
      confusion_matrix: cm,
      confusion_matrix_density: row.confusion_matrix_density,
      class_distribution: dist,
      fault_modes: FAULT_FINGERPRINT_FAULT_MODES,
    },
  });
});

// ─── Calibration plot endpoint ────────────────────────────────────────────
app.get('/:id/calibration', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare(
    'SELECT id, model_number, calibration_brier, log_loss, roc_auc_macro, top_3_accuracy, macro_f1, micro_f1, weighted_recall FROM oe_fault_fingerprint_ml WHERE id = ?',
  ).bind(id).first<{
    id: string;
    model_number: string;
    calibration_brier: number | null;
    log_loss: number | null;
    roc_auc_macro: number | null;
    top_3_accuracy: number | null;
    macro_f1: number | null;
    micro_f1: number | null;
    weighted_recall: number | null;
  }>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  return c.json({
    success: true,
    data: {
      id: row.id,
      model_number: row.model_number,
      calibration_brier: row.calibration_brier,
      log_loss: row.log_loss,
      roc_auc_macro: row.roc_auc_macro,
      top_3_accuracy: row.top_3_accuracy,
      macro_f1: row.macro_f1,
      micro_f1: row.micro_f1,
      weighted_recall: row.weighted_recall,
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
  model_family?: FaultFingerprintModelFamily;
  model_version?: string;
  asset_class?: FaultFingerprintAssetClass;
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
  w15_warranty_claim_ref?: string;
  w41_problem_management_ref?: string;
  w63_warranty_recovery_ref?: string;
  w118_block_ref?: string;

  safety_critical_fault_class?: boolean | number;
  regulator_reportable_misclass?: boolean | number;
  nerc_cip_audit_in_scope?: boolean | number;
  sox_ml_governance_required?: boolean | number;
  iso_42001_required?: boolean | number;

  // Multi-class metrics.
  class_count?: number;
  class_label_set_hash?: string;
  class_distribution_payload?: string | Record<string, unknown>;
  confusion_matrix?: string | unknown[];
  min_samples_per_class?: number;
  macro_f1?: number;
  micro_f1?: number;
  weighted_recall?: number;
  top_3_accuracy?: number;
  log_loss?: number;
  roc_auc_macro?: number;
  confusion_matrix_density?: number;
  class_imbalance_ratio?: number;
  calibration_brier?: number;
  class_drift_psi?: number;
  novel_class_detection_rate?: number;

  reconciliation_with_w71_physics_pct?: number;
  ntt_baseline_comparison_pct?: number;
  inference_latency_p50_ms?: number;
  inference_latency_p99_ms?: number;
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

function toJsonText(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return undefined; }
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<FfmlRow>): Partial<FfmlRow> {
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
  const cardErr = badEnum('model_card_status', body.model_card_status, ['draft', 'approved', 'published', 'expired']);
  if (cardErr) return c.json({ success: false, error: cardErr }, 400);

  // W71 bridge MANDATORY (NOT NULL on DB) - reject early with friendly error.
  if (!body.w71_asset_prognostics_ref || typeof body.w71_asset_prognostics_ref !== 'string') {
    return c.json({
      success: false,
      error: 'w71_asset_prognostics_ref is REQUIRED (12-mode physics baseline reconciliation mandatory for Fault-Fingerprint ML).',
    }, 422);
  }

  const id = `ffml-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const modelFamily = isKnownModelFamily(body.model_family)
    ? body.model_family
    : 'xgboost';
  const assetClass = isKnownAssetClass(body.asset_class)
    ? body.asset_class
    : 'generic';

  const flags = {
    safety_critical_fault_class:    toFlag(body.safety_critical_fault_class) ?? 0,
    regulator_reportable_misclass:  toFlag(body.regulator_reportable_misclass) ?? 0,
    nerc_cip_audit_in_scope:        toFlag(body.nerc_cip_audit_in_scope) ?? 0,
    sox_ml_governance_required:     toFlag(body.sox_ml_governance_required) ?? 0,
    iso_42001_required:             toFlag(body.iso_42001_required) ?? 0,
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

  // Model number = FFM-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_fault_fingerprint_ml`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const modelNum = `FFM-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  const controlInit = controlEffectivenessIndex({
    macro_f1:                            body.macro_f1 ?? null,
    micro_f1:                            body.micro_f1 ?? null,
    weighted_recall:                     body.weighted_recall ?? null,
    top_3_accuracy:                      body.top_3_accuracy ?? null,
    log_loss:                            body.log_loss ?? null,
    roc_auc_macro:                       body.roc_auc_macro ?? null,
    confusion_matrix_density:            body.confusion_matrix_density ?? null,
    class_imbalance_ratio:               body.class_imbalance_ratio ?? null,
    calibration_brier:                   body.calibration_brier ?? null,
    class_drift_psi:                     body.class_drift_psi ?? null,
    novel_class_detection_rate:          body.novel_class_detection_rate ?? null,
    reconciliation_with_w71_physics_pct: body.reconciliation_with_w71_physics_pct ?? null,
    ntt_baseline_comparison_pct:         body.ntt_baseline_comparison_pct ?? null,
    iso_42001_compliance_score:          body.iso_42001_compliance_score ?? null,
    model_card_status:                   body.model_card_status ?? null,
    iso27001_controls_ok:                toFlag(body.iso27001_controls_ok),
    soc2_type2_controls_ok:              toFlag(body.soc2_type2_controls_ok),
  });

  const healthInit = modelHealthBand(
    'model_proposed',
    controlInit,
    false,
    retrainDays,
    mcardDays,
    flags,
    body.macro_f1 ?? 0,
    body.class_drift_psi ?? 0,
    body.model_card_status ?? null,
  );

  const cmText = toJsonText(body.confusion_matrix);
  const cdText = toJsonText(body.class_distribution_payload);

  await c.env.DB.prepare(
    `INSERT INTO oe_fault_fingerprint_ml (
      id, model_number, model_family, model_version, training_dataset_hash,
      feature_count, asset_class, assets_covered, jurisdiction_count, safety_critical,
      training_examples_count, validation_examples_count, hyperparameter_set_hash,
      champion_model_id, challenger_model_id, retrain_due_at, model_card_expiry_at,
      w71_asset_prognostics_ref, w15_warranty_claim_ref, w41_problem_management_ref,
      w63_warranty_recovery_ref, w118_block_ref,
      safety_critical_fault_class, regulator_reportable_misclass, nerc_cip_audit_in_scope,
      sox_ml_governance_required, iso_42001_required,
      class_count, class_label_set_hash, class_distribution_payload, confusion_matrix,
      min_samples_per_class,
      macro_f1, micro_f1, weighted_recall, top_3_accuracy, log_loss, roc_auc_macro,
      confusion_matrix_density, class_imbalance_ratio, calibration_brier,
      class_drift_psi, novel_class_detection_rate,
      reconciliation_with_w71_physics_pct, ntt_baseline_comparison_pct,
      inference_latency_p50_ms, inference_latency_p99_ms,
      model_card_status, iso27001_controls_ok, soc2_type2_controls_ok,
      iso_42001_compliance_score, control_effectiveness_index,
      current_tier, authority_required, urgency_band, model_health_band,
      title, is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, model_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      days_to_retrain_due, days_to_model_card_expiry,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, modelNum, modelFamily, body.model_version ?? null, body.training_dataset_hash ?? null,
    body.feature_count ?? null, assetClass, body.assets_covered ?? null,
    body.jurisdiction_count ?? null, toFlag(body.safety_critical) ?? 0,
    body.training_examples_count ?? null, body.validation_examples_count ?? null,
    body.hyperparameter_set_hash ?? null, body.champion_model_id ?? null,
    body.challenger_model_id ?? null, body.retrain_due_at ?? null,
    body.model_card_expiry_at ?? null,
    body.w71_asset_prognostics_ref, body.w15_warranty_claim_ref ?? null,
    body.w41_problem_management_ref ?? null, body.w63_warranty_recovery_ref ?? null,
    body.w118_block_ref ?? null,
    flags.safety_critical_fault_class, flags.regulator_reportable_misclass,
    flags.nerc_cip_audit_in_scope, flags.sox_ml_governance_required,
    flags.iso_42001_required,
    body.class_count ?? null, body.class_label_set_hash ?? null,
    cdText ?? null, cmText ?? null,
    body.min_samples_per_class ?? null,
    body.macro_f1 ?? null, body.micro_f1 ?? null, body.weighted_recall ?? null,
    body.top_3_accuracy ?? null, body.log_loss ?? null, body.roc_auc_macro ?? null,
    body.confusion_matrix_density ?? null, body.class_imbalance_ratio ?? null,
    body.calibration_brier ?? null, body.class_drift_psi ?? null,
    body.novel_class_detection_rate ?? null,
    body.reconciliation_with_w71_physics_pct ?? null,
    body.ntt_baseline_comparison_pct ?? null,
    body.inference_latency_p50_ms ?? null, body.inference_latency_p99_ms ?? null,
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

  const evtId = `fault_fingerprint_ml_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_fault_fingerprint_ml_events (id, model_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'fault_fingerprint_ml_proposed',
    null, 'model_proposed', null, tier,
    user.id, partyForAction('propose_model'),
    null, JSON.stringify({ tier, model_family: modelFamily, asset_class: assetClass, model_number: modelNum, title: body.title }), nowIso,
  ).run();

  await fireCascade({
    event: 'fault_fingerprint_ml_proposed',
    actor_id: user.id,
    entity_type: 'fault_fingerprint_ml',
    entity_id: id,
    data: { tier, model_family: modelFamily, asset_class: assetClass, model_number: modelNum, chain_status: 'model_proposed' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_fault_fingerprint_ml WHERE id = ?').bind(id).first<FfmlRow>();
  return c.json({ success: true, data: { model: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: FfmlAction,
  bodyHandler?: (row: FfmlRow, body: Record<string, unknown>) => Partial<FfmlRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const cardErr = badEnum('model_card_status', body.model_card_status, ['draft', 'approved', 'published', 'expired']);
  if (cardErr) return c.json({ success: false, error: cardErr }, 400);
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_fault_fingerprint_ml WHERE id = ?').bind(id).first<FfmlRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} via ${action}`,
    }, 422);
  }

  // STRATIFIED-SPLIT FLOOR: split_train_test must satisfy min_samples >= 30.
  if (action === 'split_train_test') {
    const bm = typeof body.min_samples_per_class === 'number'
      ? (body.min_samples_per_class as number)
      : (row.min_samples_per_class ?? 0);
    if (bm < MIN_SAMPLES_PER_CLASS_FLOOR) {
      return c.json({
        success: false,
        error: `Stratified-split floor: min_samples_per_class must be >= ${MIN_SAMPLES_PER_CLASS_FLOOR} (got ${bm}). Re-balance the dataset and re-attempt.`,
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
    safety_critical_fault_class:
      (overrides.safety_critical_fault_class as number | undefined)
        ?? row.safety_critical_fault_class,
    regulator_reportable_misclass:
      (overrides.regulator_reportable_misclass as number | undefined)
        ?? row.regulator_reportable_misclass,
    nerc_cip_audit_in_scope:
      (overrides.nerc_cip_audit_in_scope as number | undefined)
        ?? row.nerc_cip_audit_in_scope,
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

  const retrainAt = (overrides.retrain_due_at as string | undefined) ?? row.retrain_due_at;
  const retrainDays = daysToRetrainDue(retrainAt, now);
  overrides.days_to_retrain_due = retrainDays;
  const mcardAt = (overrides.model_card_expiry_at as string | undefined) ?? row.model_card_expiry_at;
  const mcardDays = daysToModelCardExpiry(mcardAt, now);
  overrides.days_to_model_card_expiry = mcardDays;

  const cardEff =
    (overrides.model_card_status as ModelCardStatus | undefined) ?? row.model_card_status;

  const controlScore = controlEffectivenessIndex({
    macro_f1:
      (overrides.macro_f1 as number | undefined) ?? row.macro_f1,
    micro_f1:
      (overrides.micro_f1 as number | undefined) ?? row.micro_f1,
    weighted_recall:
      (overrides.weighted_recall as number | undefined) ?? row.weighted_recall,
    top_3_accuracy:
      (overrides.top_3_accuracy as number | undefined) ?? row.top_3_accuracy,
    log_loss:
      (overrides.log_loss as number | undefined) ?? row.log_loss,
    roc_auc_macro:
      (overrides.roc_auc_macro as number | undefined) ?? row.roc_auc_macro,
    confusion_matrix_density:
      (overrides.confusion_matrix_density as number | undefined) ?? row.confusion_matrix_density,
    class_imbalance_ratio:
      (overrides.class_imbalance_ratio as number | undefined) ?? row.class_imbalance_ratio,
    calibration_brier:
      (overrides.calibration_brier as number | undefined) ?? row.calibration_brier,
    class_drift_psi:
      (overrides.class_drift_psi as number | undefined) ?? row.class_drift_psi,
    novel_class_detection_rate:
      (overrides.novel_class_detection_rate as number | undefined) ?? row.novel_class_detection_rate,
    reconciliation_with_w71_physics_pct:
      (overrides.reconciliation_with_w71_physics_pct as number | undefined) ?? row.reconciliation_with_w71_physics_pct,
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

  // Health band composite (uses macro_f1 + class_drift_psi).
  const mf1Eff = (overrides.macro_f1 as number | undefined) ?? row.macro_f1 ?? 0;
  const psiEff = (overrides.class_drift_psi as number | undefined) ?? row.class_drift_psi ?? 0;
  overrides.model_health_band = modelHealthBand(
    to,
    controlScore,
    !!row.sla_breached,
    retrainDays,
    mcardDays,
    floorFlags,
    mf1Eff,
    psiEff,
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
    `UPDATE oe_fault_fingerprint_ml SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `fault_fingerprint_ml_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_fault_fingerprint_ml_events (id, model_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `fault_fingerprint_ml_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'fault_fingerprint_ml',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_fault_fingerprint_ml WHERE id = ?').bind(id).first<FfmlRow>();
  return c.json({ success: true, data: { model: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (17 transitions; propose handled by POST /) ─────────
app.post('/:id/bind-labeled-dataset', async (c) => transition(c, 'bind_labeled_dataset', (_row, body) => {
  const b = body as Partial<CommonBody & {
    training_dataset_hash?: string;
    training_examples_count?: number;
    class_count?: number;
    class_label_set_hash?: string;
    class_distribution_payload?: string | Record<string, unknown>;
    class_imbalance_ratio?: number;
  }>;
  const out: Partial<FfmlRow> = {};
  if (typeof b.training_dataset_hash === 'string') out.training_dataset_hash = b.training_dataset_hash;
  if (typeof b.training_examples_count === 'number') out.training_examples_count = b.training_examples_count;
  if (typeof b.class_count === 'number') out.class_count = b.class_count;
  if (typeof b.class_label_set_hash === 'string') out.class_label_set_hash = b.class_label_set_hash;
  const cdText = toJsonText(b.class_distribution_payload);
  if (cdText !== undefined) out.class_distribution_payload = cdText;
  if (typeof b.class_imbalance_ratio === 'number') out.class_imbalance_ratio = b.class_imbalance_ratio;
  return applyCommon(b, out);
}));

app.post('/:id/resolve-class-imbalance', async (c) => transition(c, 'resolve_class_imbalance', (_row, body) => {
  const b = body as Partial<CommonBody & {
    class_imbalance_ratio?: number;
    min_samples_per_class?: number;
  }>;
  const out: Partial<FfmlRow> = {};
  if (typeof b.class_imbalance_ratio === 'number') out.class_imbalance_ratio = b.class_imbalance_ratio;
  if (typeof b.min_samples_per_class === 'number') out.min_samples_per_class = b.min_samples_per_class;
  return applyCommon(b, out);
}));

app.post('/:id/engineer-features', async (c) => transition(c, 'engineer_features', (_row, body) => {
  const b = body as Partial<CommonBody & {
    feature_count?: number;
    hyperparameter_set_hash?: string;
  }>;
  const out: Partial<FfmlRow> = {};
  if (typeof b.feature_count === 'number') out.feature_count = b.feature_count;
  if (typeof b.hyperparameter_set_hash === 'string') out.hyperparameter_set_hash = b.hyperparameter_set_hash;
  return applyCommon(b, out);
}));

app.post('/:id/split-train-test', async (c) => transition(c, 'split_train_test', (_row, body) => {
  const b = body as Partial<CommonBody & {
    training_examples_count?: number;
    validation_examples_count?: number;
    min_samples_per_class?: number;
  }>;
  const out: Partial<FfmlRow> = {};
  if (typeof b.training_examples_count === 'number') out.training_examples_count = b.training_examples_count;
  if (typeof b.validation_examples_count === 'number') out.validation_examples_count = b.validation_examples_count;
  if (typeof b.min_samples_per_class === 'number') out.min_samples_per_class = b.min_samples_per_class;
  return applyCommon(b, out);
}));

app.post('/:id/train-multiclass', async (c) => transition(c, 'train_multiclass', (_row, body) => {
  const b = body as Partial<CommonBody & {
    macro_f1?: number;
    micro_f1?: number;
    weighted_recall?: number;
    top_3_accuracy?: number;
    log_loss?: number;
    iso27001_controls_ok?: boolean | number;
    soc2_type2_controls_ok?: boolean | number;
  }>;
  const out: Partial<FfmlRow> = {};
  if (typeof b.macro_f1 === 'number') out.macro_f1 = b.macro_f1;
  if (typeof b.micro_f1 === 'number') out.micro_f1 = b.micro_f1;
  if (typeof b.weighted_recall === 'number') out.weighted_recall = b.weighted_recall;
  if (typeof b.top_3_accuracy === 'number') out.top_3_accuracy = b.top_3_accuracy;
  if (typeof b.log_loss === 'number') out.log_loss = b.log_loss;
  const f1 = toFlag(b.iso27001_controls_ok); if (f1 !== undefined) out.iso27001_controls_ok = f1;
  const f2 = toFlag(b.soc2_type2_controls_ok); if (f2 !== undefined) out.soc2_type2_controls_ok = f2;
  return applyCommon(b, out);
}));

app.post('/:id/validate-confusion-matrix', async (c) => transition(c, 'validate_confusion_matrix', (_row, body) => {
  const b = body as Partial<CommonBody & {
    confusion_matrix?: string | unknown[];
    confusion_matrix_density?: number;
    roc_auc_macro?: number;
    reconciliation_with_w71_physics_pct?: number;
    ntt_baseline_comparison_pct?: number;
  }>;
  const out: Partial<FfmlRow> = {};
  const cmText = toJsonText(b.confusion_matrix);
  if (cmText !== undefined) out.confusion_matrix = cmText;
  if (typeof b.confusion_matrix_density === 'number') out.confusion_matrix_density = b.confusion_matrix_density;
  if (typeof b.roc_auc_macro === 'number') out.roc_auc_macro = b.roc_auc_macro;
  if (typeof b.reconciliation_with_w71_physics_pct === 'number') {
    out.reconciliation_with_w71_physics_pct = b.reconciliation_with_w71_physics_pct;
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
    calibration_brier?: number;
  }>;
  const out: Partial<FfmlRow> = {};
  if (b.model_card_status) out.model_card_status = b.model_card_status;
  if (typeof b.iso_42001_compliance_score === 'number') out.iso_42001_compliance_score = b.iso_42001_compliance_score;
  if (typeof b.calibration_brier === 'number') out.calibration_brier = b.calibration_brier;
  return applyCommon(b, out);
}));

app.post('/:id/deploy-shadow', async (c) => transition(c, 'deploy_shadow', (_row, body) => {
  const b = body as Partial<CommonBody & {
    inference_latency_p50_ms?: number;
    inference_latency_p99_ms?: number;
  }>;
  const out: Partial<FfmlRow> = {};
  if (typeof b.inference_latency_p50_ms === 'number') out.inference_latency_p50_ms = b.inference_latency_p50_ms;
  if (typeof b.inference_latency_p99_ms === 'number') out.inference_latency_p99_ms = b.inference_latency_p99_ms;
  return applyCommon(b, out);
}));

app.post('/:id/activate-live-ab', async (c) => transition(c, 'activate_live_ab', (_row, body) => {
  const b = body as Partial<CommonBody & {
    challenger_model_id?: string;
    novel_class_detection_rate?: number;
  }>;
  const out: Partial<FfmlRow> = {};
  if (typeof b.challenger_model_id === 'string') out.challenger_model_id = b.challenger_model_id;
  if (typeof b.novel_class_detection_rate === 'number') out.novel_class_detection_rate = b.novel_class_detection_rate;
  return applyCommon(b, out);
}));

app.post('/:id/promote-champion', async (c) => transition(c, 'promote_champion', (_row, body) => {
  const b = body as Partial<CommonBody & {
    champion_model_id?: string;
    model_card_status?: ModelCardStatus;
    w71_asset_prognostics_ref?: string;
    w118_block_ref?: string;
  }>;
  const out: Partial<FfmlRow> = {};
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
    macro_f1?: number;
    class_drift_psi?: number;
  }>;
  const out: Partial<FfmlRow> = {};
  if (typeof b.training_dataset_hash === 'string') out.training_dataset_hash = b.training_dataset_hash;
  if (typeof b.retrain_due_at === 'string') out.retrain_due_at = b.retrain_due_at;
  if (typeof b.macro_f1 === 'number') out.macro_f1 = b.macro_f1;
  if (typeof b.class_drift_psi === 'number') out.class_drift_psi = b.class_drift_psi;
  return applyCommon(b, out);
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/detect-class-drift', async (c) => transition(c, 'detect_class_drift', (_row, body) => {
  const b = body as Partial<CommonBody & {
    class_drift_psi?: number;
    macro_f1?: number;
    regulator_reportable_misclass?: boolean | number;
  }>;
  const out: Partial<FfmlRow> = {};
  if (typeof b.class_drift_psi === 'number') out.class_drift_psi = b.class_drift_psi;
  if (typeof b.macro_f1 === 'number') out.macro_f1 = b.macro_f1;
  const f = toFlag(b.regulator_reportable_misclass); if (f !== undefined) out.regulator_reportable_misclass = f;
  return applyCommon(b, out);
}));

app.post('/:id/rollback-model', async (c) => transition(c, 'rollback_model', (_row, body) => {
  const b = body as Partial<CommonBody & {
    champion_model_id?: string;
  }>;
  const out: Partial<FfmlRow> = {};
  if (typeof b.champion_model_id === 'string') out.champion_model_id = b.champion_model_id;
  return applyCommon(b, out);
}));

app.post('/:id/recall-model', async (c) => transition(c, 'recall_model', (_row, body) => {
  const b = body as Partial<CommonBody & {
    safety_critical_fault_class?: boolean | number;
  }>;
  const out: Partial<FfmlRow> = {};
  const f = toFlag(b.safety_critical_fault_class); if (f !== undefined) out.safety_critical_fault_class = f;
  return applyCommon(b, out);
}));

app.post('/:id/failover-to-physics-baseline', async (c) => transition(c, 'failover_to_physics_baseline', (_row, body) => {
  const b = body as Partial<CommonBody & {
    reconciliation_with_w71_physics_pct?: number;
  }>;
  const out: Partial<FfmlRow> = {};
  // Failover RESETS reconciliation back to 0 (W71 is now serving).
  if (typeof b.reconciliation_with_w71_physics_pct === 'number') {
    out.reconciliation_with_w71_physics_pct = b.reconciliation_with_w71_physics_pct;
  } else {
    out.reconciliation_with_w71_physics_pct = 0;
  }
  return applyCommon(b, out);
}));

app.post('/:id/add-novel-class', async (c) => transition(c, 'add_novel_class', (_row, body) => {
  const b = body as Partial<CommonBody & {
    class_count?: number;
    class_label_set_hash?: string;
    novel_class_label?: string;
    class_distribution_payload?: string | Record<string, unknown>;
  }>;
  const out: Partial<FfmlRow> = {};
  // Bumping class_count (model declares a new fault mode).
  if (typeof b.class_count === 'number') out.class_count = b.class_count;
  if (typeof b.class_label_set_hash === 'string') out.class_label_set_hash = b.class_label_set_hash;
  const cdText = toJsonText(b.class_distribution_payload);
  if (cdText !== undefined) out.class_distribution_payload = cdText;
  // Validate novel class label against the known 12 modes (informational only -
  // a truly novel class is intentionally NOT in the W71 list; we just record it).
  if (typeof b.novel_class_label === 'string' && !isKnownFaultMode(b.novel_class_label)) {
    // Novel-by-definition. No-op.
  }
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
export async function faultFingerprintMlSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_fault_fingerprint_ml
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<FfmlRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_fault_fingerprint_ml
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `fault_fingerprint_ml_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_fault_fingerprint_ml_events (id, model_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'fault_fingerprint_ml_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'ml_engineer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as FfmlTier)) {
      await fireCascade({
        event: 'fault_fingerprint_ml_sla_breached',
        actor_id: 'system',
        entity_type: 'fault_fingerprint_ml',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }
    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: daily class-drift scan (30 3 * * *) ───────────────────────────
//
// 03:30 UTC = 05:30 SAST, 30 min after W128 concordance monitor so the
// class-PSI scan sees fresh survival-monitor flagged events. Refreshes
// LIVE-derived persisted fields and flags models with macro_f1 < 0.65
// OR class_drift_psi >= 0.25 as regulator_relevant for morning briefing.
export async function faultFingerprintMlClassDriftScan(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged_class_drift: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_fault_fingerprint_ml
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')`,
  ).all<FfmlRow>();

  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const control = controlEffectivenessIndex({
      macro_f1:                            row.macro_f1,
      micro_f1:                            row.micro_f1,
      weighted_recall:                     row.weighted_recall,
      top_3_accuracy:                      row.top_3_accuracy,
      log_loss:                            row.log_loss,
      roc_auc_macro:                       row.roc_auc_macro,
      confusion_matrix_density:            row.confusion_matrix_density,
      class_imbalance_ratio:               row.class_imbalance_ratio,
      calibration_brier:                   row.calibration_brier,
      class_drift_psi:                     row.class_drift_psi,
      novel_class_detection_rate:          row.novel_class_detection_rate,
      reconciliation_with_w71_physics_pct: row.reconciliation_with_w71_physics_pct,
      ntt_baseline_comparison_pct:         row.ntt_baseline_comparison_pct,
      iso_42001_compliance_score:          row.iso_42001_compliance_score,
      model_card_status:                   row.model_card_status,
      iso27001_controls_ok:                row.iso27001_controls_ok,
      soc2_type2_controls_ok:              row.soc2_type2_controls_ok,
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
      row.macro_f1 ?? 0,
      row.class_drift_psi ?? 0,
      row.model_card_status,
    );

    const lowMacroF1 = (row.macro_f1 ?? 1) < 0.65;
    const classDriftHigh = (row.class_drift_psi ?? 0) >= 0.25;
    const classFlag = lowMacroF1 || classDriftHigh;
    const regulatorRelevantBump = classFlag ? 1 : row.regulator_relevant;
    const isReportableBump = classFlag ? 1 : row.is_reportable;
    if (classFlag) flagged++;

    await env.DB.prepare(
      `UPDATE oe_fault_fingerprint_ml
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
  return { scanned: rows.length, flagged_class_drift: flagged };
}

// ─── Cron: weekly model-card expiry scan (0 7 * * 1) ─────────────────────
export async function faultFingerprintMlModelCardExpirySweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_fault_fingerprint_ml
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')
       AND model_card_expiry_at IS NOT NULL`,
  ).all<FfmlRow>();
  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const mcardDays = daysToModelCardExpiry(row.model_card_expiry_at, now);
    if (mcardDays < 14) {
      await env.DB.prepare(
        `UPDATE oe_fault_fingerprint_ml
         SET regulator_relevant = 1, is_reportable = 1,
             days_to_model_card_expiry = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(mcardDays, nowIso, row.id).run();
      flagged++;
    } else {
      await env.DB.prepare(
        `UPDATE oe_fault_fingerprint_ml
         SET days_to_model_card_expiry = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(mcardDays, nowIso, row.id).run();
    }
  }
  return { scanned: rows.length, flagged };
}

export default app;
