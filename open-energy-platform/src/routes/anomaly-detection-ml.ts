// ═══════════════════════════════════════════════════════════════════════════
// Wave 127 - Anomaly-Detection ML Model lifecycle chain.
//
// PHASE D WAVE 1 OF 4 (Phase-D opener). Real ML models REPLACING the W71
// 6-method heuristic anomaly ensemble. LSTM autoencoder / transformer
// autoencoder / variational autoencoder governance.
//
// Standards: ISO 42001 AI Management Systems, NIST AI RMF, EU AI Act
// (high-risk Annex III energy infrastructure), ISO 27001, SOC 2 Type II,
// NERC CIP-013 OT supply-chain, SOX ML governance audit-evidence chain.
//
// 16 actions: propose_model / bind_dataset / engineer_features /
//   split_train_test / train_model / backtest / calibrate / deploy_shadow /
//   activate_live_ab / promote_champion / retrain / archive / detect_drift /
//   rollback_model / recall_model / activate_failover.
//
// SIGNATURE W127 regulator crossings:
//   rollback_model -> EVERY tier (W127 SIGNATURE W127-ML-ROLLBACK hard line;
//     FIRST Phase-D hard line)
//   recall_model -> EVERY tier WHEN safety_critical_inference
//   detect_drift -> large_fleet/multi_jurisdiction_fleet/fleet_systemic
//                   ONLY WHEN regulator_reportable_drift
//   activate_failover -> multi_jurisdiction_fleet + fleet_systemic
//   sla_breached -> large_fleet + multi_jurisdiction_fleet + fleet_systemic
//
// Write {admin, support} (2 writers - SAME AS W71 heuristic prognostics).
// READ all 9 personas. NO public peer endpoint - INTERNAL ML governance.
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
  bridgesToW12SiteCommissioning,
  bridgesToW126GovernmentFiling,
  bridgesToW74NersaLevy,
  bridgesToW118AuditChain,
  controlEffectivenessIndex,
  modelHealthBand,
  isKnownModelFamily,
  isKnownAssetClass,
  ANOMALY_DETECTION_MODEL_FAMILIES,
  ANOMALY_DETECTION_ASSET_CLASSES,
  type AdmlStatus,
  type AdmlAction,
  type AdmlTier,
  type AnomalyDetectionModelFamily,
  type AnomalyDetectionAssetClass,
} from '../utils/anomaly-detection-ml-spec';

const READ_ROLES = new Set([
  'admin',
  'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);

// W127 = admin + support write (2 writers - SAME AS W71 heuristic prognostics).
const WRITE_ROLES = new Set(['admin', 'support']);

type ModelCardStatus = 'draft' | 'approved' | 'published' | 'expired';

// ─── Row + event interfaces ───────────────────────────────────────────────
interface AdmlRow {
  id: string;
  model_number: string;
  model_family: AnomalyDetectionModelFamily | string;
  model_version: string | null;
  training_dataset_hash: string | null;
  feature_count: number | null;
  asset_class: AnomalyDetectionAssetClass | string;
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

  w71_asset_prognostics_ref: string | null;
  w12_site_commissioning_ref: string | null;
  w126_government_filing_ref: string | null;
  w74_nersa_levy_ref: string | null;
  w118_block_ref: string | null;

  safety_critical_inference: number;
  regulator_reportable_drift: number;
  nerc_cip_audit_in_scope: number;
  sox_ml_governance_required: number;
  iso_42001_ai_management_required: number;

  autoencoder_reconstruction_error_p99: number | null;
  precision_at_k: number | null;
  recall_at_k: number | null;
  false_positive_rate: number | null;
  drift_psi: number | null;
  drift_ks: number | null;
  champion_vs_challenger_lift: number | null;
  inference_latency_p50_ms: number | null;
  inference_latency_p99_ms: number | null;
  inference_throughput_per_sec: number | null;
  ntt_baseline_comparison_pct: number | null;
  reconciliation_with_w71_heuristic_pct: number | null;
  model_card_status: ModelCardStatus | null;
  iso27001_controls_ok: number;
  soc2_type2_controls_ok: number;
  iso_42001_compliance_score: number | null;
  control_effectiveness_index: number | null;

  current_tier: AdmlTier;
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

  chain_status: AdmlStatus;
  model_proposed_at: string | null;
  dataset_bound_at: string | null;
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
  failover_to_baseline_at: string | null;
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

interface AdmlEventRow {
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

const TIMESTAMP_COLUMN: Record<AdmlStatus, keyof AdmlRow | null> = {
  model_proposed:           'model_proposed_at',
  dataset_bound:            'dataset_bound_at',
  features_engineered:      'features_engineered_at',
  train_test_split:         'train_test_split_at',
  model_trained:            'model_trained_at',
  backtest_validated:       'backtest_validated_at',
  calibrated:               'calibrated_at',
  shadow_deployed:          'shadow_deployed_at',
  live_ab_active:           'live_ab_active_at',
  champion_promoted:        'champion_promoted_at',
  retrained:                'retrained_at',
  archived:                 'archived_at',
  drift_detected:           'drift_detected_at',
  rolled_back:              'rolled_back_at',
  recalled:                 'recalled_at',
  failover_to_baseline:     'failover_to_baseline_at',
};

function statusEnteredAt(row: AdmlRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.model_proposed_at ? new Date(row.model_proposed_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.model_proposed_at ? new Date(row.model_proposed_at) : null);
}

function rowFloorFlags(row: AdmlRow) {
  return {
    safety_critical_inference:        row.safety_critical_inference,
    regulator_reportable_drift:       row.regulator_reportable_drift,
    nerc_cip_audit_in_scope:          row.nerc_cip_audit_in_scope,
    sox_ml_governance_required:       row.sox_ml_governance_required,
    iso_42001_ai_management_required: row.iso_42001_ai_management_required,
  };
}

function decorate(row: AdmlRow, now: Date) {
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
    precision_at_k:                          row.precision_at_k,
    recall_at_k:                             row.recall_at_k,
    false_positive_rate:                     row.false_positive_rate,
    drift_psi:                               row.drift_psi,
    drift_ks:                                row.drift_ks,
    champion_vs_challenger_lift:             row.champion_vs_challenger_lift,
    inference_latency_p50_ms:                row.inference_latency_p50_ms,
    inference_latency_p99_ms:                row.inference_latency_p99_ms,
    inference_throughput_per_sec:            row.inference_throughput_per_sec,
    reconciliation_with_w71_heuristic_pct:   row.reconciliation_with_w71_heuristic_pct,
    ntt_baseline_comparison_pct:             row.ntt_baseline_comparison_pct,
    iso_42001_compliance_score:              row.iso_42001_compliance_score,
    model_card_status:                       row.model_card_status,
    iso27001_controls_ok:                    row.iso27001_controls_ok,
    soc2_type2_controls_ok:                  row.soc2_type2_controls_ok,
  });

  const slaBreachedLive = minutesUntilSla != null && minutesUntilSla < 0;

  const healthLive = modelHealthBand(
    status,
    controlLive,
    !!row.sla_breached || slaBreachedLive,
    retrainDays,
    mcardDays,
    flags,
    row.drift_psi ?? 0,
    row.false_positive_rate ?? 0,
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
    bridges_to_w71_asset_prognostics_live: bridgesToW71AssetPrognostics(row.w71_asset_prognostics_ref),
    bridges_to_w12_site_commissioning_live: bridgesToW12SiteCommissioning(row.w12_site_commissioning_ref),
    bridges_to_w126_government_filing_live: bridgesToW126GovernmentFiling(row.w126_government_filing_ref),
    bridges_to_w74_nersa_levy_live: bridgesToW74NersaLevy(row.w74_nersa_levy_ref),
    bridges_to_w118_audit_chain_live: bridgesToW118AuditChain(row.w118_block_ref),
  };
}

const app = new Hono<HonoEnv>();

// All routes require auth (no public peer endpoint - this is INTERNAL
// ML governance, not a wire-protocol connector).
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

  let sql = 'SELECT * FROM oe_anomaly_detection_ml WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)         { sql += ' AND current_tier = ?';      binds.push(tier); }
  if (status)       { sql += ' AND chain_status = ?';      binds.push(status); }
  if (model_family) { sql += ' AND model_family = ?';      binds.push(model_family); }
  if (asset_class)  { sql += ' AND asset_class = ?';       binds.push(asset_class); }
  if (card)         { sql += ' AND model_card_status = ?'; binds.push(card); }
  if (health)       { sql += ' AND model_health_band = ?'; binds.push(health); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<AdmlRow>();
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
  const dataset_bound_count = items.filter((i) => i.chain_status === 'dataset_bound').length;
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
  const failover_count      = items.filter((i) => i.chain_status === 'failover_to_baseline').length;
  const breached_count      = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const floor_flag_total    = items.reduce((s, i) => s + (i.floor_flag_count_live || 0), 0);
  const w118_bridged        = items.filter((i) => i.bridges_to_w118_audit_chain_live).length;
  const w71_bridged         = items.filter((i) => i.bridges_to_w71_asset_prognostics_live).length;
  const w12_bridged         = items.filter((i) => i.bridges_to_w12_site_commissioning_live).length;
  const w126_bridged        = items.filter((i) => i.bridges_to_w126_government_filing_live).length;
  const w74_bridged         = items.filter((i) => i.bridges_to_w74_nersa_levy_live).length;
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
      dataset_bound_count,
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
      w12_bridged_count: w12_bridged,
      w126_bridged_count: w126_bridged,
      w74_bridged_count: w74_bridged,
      w118_bridged_count: w118_bridged,
      control_effectiveness_avg: control_avg,
      retrain_within_60d,
      retrain_within_14d,
      model_card_expiring_30d: mcard_within_30d,
      model_families: ANOMALY_DETECTION_MODEL_FAMILIES,
      asset_classes: ANOMALY_DETECTION_ASSET_CLASSES,
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
     FROM oe_anomaly_detection_ml
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
      model_families: ANOMALY_DETECTION_MODEL_FAMILIES,
      asset_classes: ANOMALY_DETECTION_ASSET_CLASSES,
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
  const row = await c.env.DB.prepare('SELECT * FROM oe_anomaly_detection_ml WHERE id = ?').bind(id).first<AdmlRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_anomaly_detection_ml_events WHERE model_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<AdmlEventRow>();

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
  model_family?: AnomalyDetectionModelFamily;
  model_version?: string;
  asset_class?: AnomalyDetectionAssetClass;
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

  w71_asset_prognostics_ref?: string;
  w12_site_commissioning_ref?: string;
  w126_government_filing_ref?: string;
  w74_nersa_levy_ref?: string;
  w118_block_ref?: string;

  safety_critical_inference?: boolean | number;
  regulator_reportable_drift?: boolean | number;
  nerc_cip_audit_in_scope?: boolean | number;
  sox_ml_governance_required?: boolean | number;
  iso_42001_ai_management_required?: boolean | number;

  autoencoder_reconstruction_error_p99?: number;
  precision_at_k?: number;
  recall_at_k?: number;
  false_positive_rate?: number;
  drift_psi?: number;
  drift_ks?: number;
  champion_vs_challenger_lift?: number;
  inference_latency_p50_ms?: number;
  inference_latency_p99_ms?: number;
  inference_throughput_per_sec?: number;
  ntt_baseline_comparison_pct?: number;
  reconciliation_with_w71_heuristic_pct?: number;
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

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<AdmlRow>): Partial<AdmlRow> {
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
  const id = `adml-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const modelFamily = isKnownModelFamily(body.model_family)
    ? body.model_family
    : 'lstm_autoencoder';
  const assetClass = isKnownAssetClass(body.asset_class)
    ? body.asset_class
    : 'generic';

  const flags = {
    safety_critical_inference:        toFlag(body.safety_critical_inference) ?? 0,
    regulator_reportable_drift:       toFlag(body.regulator_reportable_drift) ?? 0,
    nerc_cip_audit_in_scope:          toFlag(body.nerc_cip_audit_in_scope) ?? 0,
    sox_ml_governance_required:       toFlag(body.sox_ml_governance_required) ?? 0,
    iso_42001_ai_management_required: toFlag(body.iso_42001_ai_management_required) ?? 0,
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

  // Model number = ADML-YYYY-NNNN sequential.
  const seqRs = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_anomaly_detection_ml`,
  ).first<{ n: number | null }>();
  const seq = (seqRs?.n ?? 0) + 1;
  const modelNum = `ADML-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;

  const controlInit = controlEffectivenessIndex({
    precision_at_k:                          body.precision_at_k ?? null,
    recall_at_k:                             body.recall_at_k ?? null,
    false_positive_rate:                     body.false_positive_rate ?? null,
    drift_psi:                               body.drift_psi ?? null,
    drift_ks:                                body.drift_ks ?? null,
    champion_vs_challenger_lift:             body.champion_vs_challenger_lift ?? null,
    inference_latency_p50_ms:                body.inference_latency_p50_ms ?? null,
    inference_latency_p99_ms:                body.inference_latency_p99_ms ?? null,
    inference_throughput_per_sec:            body.inference_throughput_per_sec ?? null,
    reconciliation_with_w71_heuristic_pct:   body.reconciliation_with_w71_heuristic_pct ?? null,
    ntt_baseline_comparison_pct:             body.ntt_baseline_comparison_pct ?? null,
    iso_42001_compliance_score:              body.iso_42001_compliance_score ?? null,
    model_card_status:                       body.model_card_status ?? null,
    iso27001_controls_ok:                    toFlag(body.iso27001_controls_ok),
    soc2_type2_controls_ok:                  toFlag(body.soc2_type2_controls_ok),
  });

  const healthInit = modelHealthBand(
    'model_proposed',
    controlInit,
    false,
    retrainDays,
    mcardDays,
    flags,
    body.drift_psi ?? 0,
    body.false_positive_rate ?? 0,
    body.model_card_status ?? null,
  );

  await c.env.DB.prepare(
    `INSERT INTO oe_anomaly_detection_ml (
      id, model_number, model_family, model_version, training_dataset_hash,
      feature_count, asset_class, assets_covered, jurisdiction_count, safety_critical,
      training_examples_count, validation_examples_count, hyperparameter_set_hash,
      champion_model_id, challenger_model_id, retrain_due_at, model_card_expiry_at,
      w71_asset_prognostics_ref, w12_site_commissioning_ref, w126_government_filing_ref,
      w74_nersa_levy_ref, w118_block_ref,
      safety_critical_inference, regulator_reportable_drift, nerc_cip_audit_in_scope,
      sox_ml_governance_required, iso_42001_ai_management_required,
      autoencoder_reconstruction_error_p99, precision_at_k, recall_at_k,
      false_positive_rate, drift_psi, drift_ks, champion_vs_challenger_lift,
      inference_latency_p50_ms, inference_latency_p99_ms, inference_throughput_per_sec,
      ntt_baseline_comparison_pct, reconciliation_with_w71_heuristic_pct,
      model_card_status, iso27001_controls_ok, soc2_type2_controls_ok,
      iso_42001_compliance_score, control_effectiveness_index,
      current_tier, authority_required, urgency_band, model_health_band,
      title, is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, model_proposed_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      days_to_retrain_due, days_to_model_card_expiry,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, modelNum, modelFamily, body.model_version ?? null, body.training_dataset_hash ?? null,
    body.feature_count ?? null, assetClass, body.assets_covered ?? null,
    body.jurisdiction_count ?? null, toFlag(body.safety_critical) ?? 0,
    body.training_examples_count ?? null, body.validation_examples_count ?? null,
    body.hyperparameter_set_hash ?? null, body.champion_model_id ?? null,
    body.challenger_model_id ?? null, body.retrain_due_at ?? null,
    body.model_card_expiry_at ?? null,
    body.w71_asset_prognostics_ref ?? null, body.w12_site_commissioning_ref ?? null,
    body.w126_government_filing_ref ?? null, body.w74_nersa_levy_ref ?? null,
    body.w118_block_ref ?? null,
    flags.safety_critical_inference, flags.regulator_reportable_drift,
    flags.nerc_cip_audit_in_scope, flags.sox_ml_governance_required,
    flags.iso_42001_ai_management_required,
    body.autoencoder_reconstruction_error_p99 ?? null, body.precision_at_k ?? null,
    body.recall_at_k ?? null, body.false_positive_rate ?? null,
    body.drift_psi ?? null, body.drift_ks ?? null,
    body.champion_vs_challenger_lift ?? null,
    body.inference_latency_p50_ms ?? null, body.inference_latency_p99_ms ?? null,
    body.inference_throughput_per_sec ?? null,
    body.ntt_baseline_comparison_pct ?? null,
    body.reconciliation_with_w71_heuristic_pct ?? null,
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

  const evtId = `anomaly_detection_ml_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_anomaly_detection_ml_events (id, model_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'anomaly_detection_ml_proposed',
    null, 'model_proposed', null, tier,
    user.id, partyForAction('propose_model'),
    null, JSON.stringify({ tier, model_family: modelFamily, asset_class: assetClass, model_number: modelNum, title: body.title }), nowIso,
  ).run();

  await fireCascade({
    event: 'anomaly_detection_ml_proposed',
    actor_id: user.id,
    entity_type: 'anomaly_detection_ml',
    entity_id: id,
    data: { tier, model_family: modelFamily, asset_class: assetClass, model_number: modelNum, chain_status: 'model_proposed' },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_anomaly_detection_ml WHERE id = ?').bind(id).first<AdmlRow>();
  return c.json({ success: true, data: { model: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: AdmlAction,
  bodyHandler?: (row: AdmlRow, body: Record<string, unknown>) => Partial<AdmlRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_anomaly_detection_ml WHERE id = ?').bind(id).first<AdmlRow>();
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
    safety_critical_inference:
      (overrides.safety_critical_inference as number | undefined)
        ?? row.safety_critical_inference,
    regulator_reportable_drift:
      (overrides.regulator_reportable_drift as number | undefined)
        ?? row.regulator_reportable_drift,
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

  // Re-derive control effectiveness + days_to_retrain_due + days_to_model_card_expiry.
  const retrainAt = (overrides.retrain_due_at as string | undefined) ?? row.retrain_due_at;
  const retrainDays = daysToRetrainDue(retrainAt, now);
  overrides.days_to_retrain_due = retrainDays;
  const mcardAt = (overrides.model_card_expiry_at as string | undefined) ?? row.model_card_expiry_at;
  const mcardDays = daysToModelCardExpiry(mcardAt, now);
  overrides.days_to_model_card_expiry = mcardDays;

  const cardEff =
    (overrides.model_card_status as ModelCardStatus | undefined) ?? row.model_card_status;

  const controlScore = controlEffectivenessIndex({
    precision_at_k:
      (overrides.precision_at_k as number | undefined) ?? row.precision_at_k,
    recall_at_k:
      (overrides.recall_at_k as number | undefined) ?? row.recall_at_k,
    false_positive_rate:
      (overrides.false_positive_rate as number | undefined) ?? row.false_positive_rate,
    drift_psi:
      (overrides.drift_psi as number | undefined) ?? row.drift_psi,
    drift_ks:
      (overrides.drift_ks as number | undefined) ?? row.drift_ks,
    champion_vs_challenger_lift:
      (overrides.champion_vs_challenger_lift as number | undefined) ?? row.champion_vs_challenger_lift,
    inference_latency_p50_ms:
      (overrides.inference_latency_p50_ms as number | undefined) ?? row.inference_latency_p50_ms,
    inference_latency_p99_ms:
      (overrides.inference_latency_p99_ms as number | undefined) ?? row.inference_latency_p99_ms,
    inference_throughput_per_sec:
      (overrides.inference_throughput_per_sec as number | undefined) ?? row.inference_throughput_per_sec,
    reconciliation_with_w71_heuristic_pct:
      (overrides.reconciliation_with_w71_heuristic_pct as number | undefined) ?? row.reconciliation_with_w71_heuristic_pct,
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

  // Health band composite.
  const driftEff = (overrides.drift_psi as number | undefined) ?? row.drift_psi ?? 0;
  const fprEff = (overrides.false_positive_rate as number | undefined) ?? row.false_positive_rate ?? 0;
  overrides.model_health_band = modelHealthBand(
    to,
    controlScore,
    !!row.sla_breached,
    retrainDays,
    mcardDays,
    floorFlags,
    driftEff,
    fprEff,
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
    `UPDATE oe_anomaly_detection_ml SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `anomaly_detection_ml_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_anomaly_detection_ml_events (id, model_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, eventName ?? `anomaly_detection_ml_${action}`,
    row.chain_status, to, row.current_tier, tier,
    user.id, partyForAction(action), notes,
    JSON.stringify({ ...overrides, action }), nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'anomaly_detection_ml',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_anomaly_detection_ml WHERE id = ?').bind(id).first<AdmlRow>();
  return c.json({ success: true, data: { model: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; propose handled by POST /) ─────────
app.post('/:id/bind-dataset', async (c) => transition(c, 'bind_dataset', (_row, body) => {
  const b = body as Partial<CommonBody & {
    training_dataset_hash?: string;
    training_examples_count?: number;
  }>;
  const out: Partial<AdmlRow> = {};
  if (typeof b.training_dataset_hash === 'string') out.training_dataset_hash = b.training_dataset_hash;
  if (typeof b.training_examples_count === 'number') out.training_examples_count = b.training_examples_count;
  return applyCommon(b, out);
}));

app.post('/:id/engineer-features', async (c) => transition(c, 'engineer_features', (_row, body) => {
  const b = body as Partial<CommonBody & {
    feature_count?: number;
    hyperparameter_set_hash?: string;
  }>;
  const out: Partial<AdmlRow> = {};
  if (typeof b.feature_count === 'number') out.feature_count = b.feature_count;
  if (typeof b.hyperparameter_set_hash === 'string') out.hyperparameter_set_hash = b.hyperparameter_set_hash;
  return applyCommon(b, out);
}));

app.post('/:id/split-train-test', async (c) => transition(c, 'split_train_test', (_row, body) => {
  const b = body as Partial<CommonBody & {
    training_examples_count?: number;
    validation_examples_count?: number;
  }>;
  const out: Partial<AdmlRow> = {};
  if (typeof b.training_examples_count === 'number') out.training_examples_count = b.training_examples_count;
  if (typeof b.validation_examples_count === 'number') out.validation_examples_count = b.validation_examples_count;
  return applyCommon(b, out);
}));

app.post('/:id/train-model', async (c) => transition(c, 'train_model', (_row, body) => {
  const b = body as Partial<CommonBody & {
    autoencoder_reconstruction_error_p99?: number;
    iso27001_controls_ok?: boolean | number;
    soc2_type2_controls_ok?: boolean | number;
  }>;
  const out: Partial<AdmlRow> = {};
  if (typeof b.autoencoder_reconstruction_error_p99 === 'number') {
    out.autoencoder_reconstruction_error_p99 = b.autoencoder_reconstruction_error_p99;
  }
  const f1 = toFlag(b.iso27001_controls_ok); if (f1 !== undefined) out.iso27001_controls_ok = f1;
  const f2 = toFlag(b.soc2_type2_controls_ok); if (f2 !== undefined) out.soc2_type2_controls_ok = f2;
  return applyCommon(b, out);
}));

app.post('/:id/backtest', async (c) => transition(c, 'backtest', (_row, body) => {
  const b = body as Partial<CommonBody & {
    precision_at_k?: number;
    recall_at_k?: number;
    false_positive_rate?: number;
    reconciliation_with_w71_heuristic_pct?: number;
    ntt_baseline_comparison_pct?: number;
  }>;
  const out: Partial<AdmlRow> = {};
  if (typeof b.precision_at_k === 'number') out.precision_at_k = b.precision_at_k;
  if (typeof b.recall_at_k === 'number') out.recall_at_k = b.recall_at_k;
  if (typeof b.false_positive_rate === 'number') out.false_positive_rate = b.false_positive_rate;
  if (typeof b.reconciliation_with_w71_heuristic_pct === 'number') {
    out.reconciliation_with_w71_heuristic_pct = b.reconciliation_with_w71_heuristic_pct;
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
  }>;
  const out: Partial<AdmlRow> = {};
  if (b.model_card_status) out.model_card_status = b.model_card_status;
  if (typeof b.iso_42001_compliance_score === 'number') out.iso_42001_compliance_score = b.iso_42001_compliance_score;
  return applyCommon(b, out);
}));

app.post('/:id/deploy-shadow', async (c) => transition(c, 'deploy_shadow', (_row, body) => {
  const b = body as Partial<CommonBody & {
    inference_latency_p50_ms?: number;
    inference_latency_p99_ms?: number;
    inference_throughput_per_sec?: number;
  }>;
  const out: Partial<AdmlRow> = {};
  if (typeof b.inference_latency_p50_ms === 'number') out.inference_latency_p50_ms = b.inference_latency_p50_ms;
  if (typeof b.inference_latency_p99_ms === 'number') out.inference_latency_p99_ms = b.inference_latency_p99_ms;
  if (typeof b.inference_throughput_per_sec === 'number') out.inference_throughput_per_sec = b.inference_throughput_per_sec;
  return applyCommon(b, out);
}));

app.post('/:id/activate-live-ab', async (c) => transition(c, 'activate_live_ab', (_row, body) => {
  const b = body as Partial<CommonBody & {
    champion_vs_challenger_lift?: number;
    challenger_model_id?: string;
  }>;
  const out: Partial<AdmlRow> = {};
  if (typeof b.champion_vs_challenger_lift === 'number') out.champion_vs_challenger_lift = b.champion_vs_challenger_lift;
  if (typeof b.challenger_model_id === 'string') out.challenger_model_id = b.challenger_model_id;
  return applyCommon(b, out);
}));

app.post('/:id/promote-champion', async (c) => transition(c, 'promote_champion', (_row, body) => {
  const b = body as Partial<CommonBody & {
    champion_model_id?: string;
    model_card_status?: ModelCardStatus;
    w71_asset_prognostics_ref?: string;
    w12_site_commissioning_ref?: string;
    w118_block_ref?: string;
  }>;
  const out: Partial<AdmlRow> = {};
  if (typeof b.champion_model_id === 'string') out.champion_model_id = b.champion_model_id;
  if (b.model_card_status) out.model_card_status = b.model_card_status;
  if (typeof b.w71_asset_prognostics_ref === 'string') out.w71_asset_prognostics_ref = b.w71_asset_prognostics_ref;
  if (typeof b.w12_site_commissioning_ref === 'string') out.w12_site_commissioning_ref = b.w12_site_commissioning_ref;
  if (typeof b.w118_block_ref === 'string') out.w118_block_ref = b.w118_block_ref;
  return applyCommon(b, out);
}));

app.post('/:id/retrain', async (c) => transition(c, 'retrain', (_row, body) => {
  const b = body as Partial<CommonBody & {
    training_dataset_hash?: string;
    retrain_due_at?: string;
    drift_psi?: number;
    drift_ks?: number;
  }>;
  const out: Partial<AdmlRow> = {};
  if (typeof b.training_dataset_hash === 'string') out.training_dataset_hash = b.training_dataset_hash;
  if (typeof b.retrain_due_at === 'string') out.retrain_due_at = b.retrain_due_at;
  if (typeof b.drift_psi === 'number') out.drift_psi = b.drift_psi;
  if (typeof b.drift_ks === 'number') out.drift_ks = b.drift_ks;
  return applyCommon(b, out);
}));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

app.post('/:id/detect-drift', async (c) => transition(c, 'detect_drift', (_row, body) => {
  const b = body as Partial<CommonBody & {
    drift_psi?: number;
    drift_ks?: number;
    regulator_reportable_drift?: boolean | number;
  }>;
  const out: Partial<AdmlRow> = {};
  if (typeof b.drift_psi === 'number') out.drift_psi = b.drift_psi;
  if (typeof b.drift_ks === 'number') out.drift_ks = b.drift_ks;
  const f = toFlag(b.regulator_reportable_drift); if (f !== undefined) out.regulator_reportable_drift = f;
  return applyCommon(b, out);
}));

app.post('/:id/rollback-model', async (c) => transition(c, 'rollback_model', (_row, body) => {
  const b = body as Partial<CommonBody & {
    champion_model_id?: string;
  }>;
  const out: Partial<AdmlRow> = {};
  if (typeof b.champion_model_id === 'string') out.champion_model_id = b.champion_model_id;
  return applyCommon(b, out);
}));

app.post('/:id/recall-model', async (c) => transition(c, 'recall_model', (_row, body) => {
  const b = body as Partial<CommonBody & {
    safety_critical_inference?: boolean | number;
  }>;
  const out: Partial<AdmlRow> = {};
  const f = toFlag(b.safety_critical_inference); if (f !== undefined) out.safety_critical_inference = f;
  return applyCommon(b, out);
}));

app.post('/:id/activate-failover', async (c) => transition(c, 'activate_failover', (_row, body) =>
  applyCommon(body as Partial<CommonBody>, {})
));

// ─── Cron: SLA sweep (every 15 min) ───────────────────────────────────────
//
// Walks every non-terminal model past sla_deadline_at, flips
// sla_breached = 1, bumps escalation_level. Breach crosses regulator
// on large_fleet + multi_jurisdiction_fleet + fleet_systemic tiers.
export async function anomalyDetectionMlSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_anomaly_detection_ml
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<AdmlRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_anomaly_detection_ml
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `anomaly_detection_ml_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_anomaly_detection_ml_events (id, model_id, event_type, from_status, to_status, from_tier, to_tier, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId, row.id, 'anomaly_detection_ml_sla_breached',
      row.chain_status, row.chain_status, row.current_tier, row.current_tier,
      'system', 'ml_engineer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }), nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier as AdmlTier)) {
      await fireCascade({
        event: 'anomaly_detection_ml_sla_breached',
        actor_id: 'system',
        entity_type: 'anomaly_detection_ml',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }
    breached++;
  }
  return { scanned: rows.length, breached };
}

// ─── Cron: daily drift-scan (30 2 * * *) ──────────────────────────────────
//
// 02:30 UTC = 04:30 SAST, 30 min after W126 government-filing deadline
// sweep so drift detection sees fresh ERP/filing state. Refreshes LIVE-
// derived persisted fields for every active model
// (control_effectiveness_index, model_health_band, days_to_retrain_due,
// days_to_model_card_expiry) and flags models whose drift_psi exceeded
// 0.15 (regulator-reportable threshold) as regulator_relevant so CTO
// and data stewards see overnight drift on their morning briefing.
export async function anomalyDetectionMlDriftScan(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged_drifting: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_anomaly_detection_ml
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')`,
  ).all<AdmlRow>();

  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const control = controlEffectivenessIndex({
      precision_at_k:                          row.precision_at_k,
      recall_at_k:                             row.recall_at_k,
      false_positive_rate:                     row.false_positive_rate,
      drift_psi:                               row.drift_psi,
      drift_ks:                                row.drift_ks,
      champion_vs_challenger_lift:             row.champion_vs_challenger_lift,
      inference_latency_p50_ms:                row.inference_latency_p50_ms,
      inference_latency_p99_ms:                row.inference_latency_p99_ms,
      inference_throughput_per_sec:            row.inference_throughput_per_sec,
      reconciliation_with_w71_heuristic_pct:   row.reconciliation_with_w71_heuristic_pct,
      ntt_baseline_comparison_pct:             row.ntt_baseline_comparison_pct,
      iso_42001_compliance_score:              row.iso_42001_compliance_score,
      model_card_status:                       row.model_card_status,
      iso27001_controls_ok:                    row.iso27001_controls_ok,
      soc2_type2_controls_ok:                  row.soc2_type2_controls_ok,
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
      row.drift_psi ?? 0,
      row.false_positive_rate ?? 0,
      row.model_card_status,
    );

    const driftFlag = (row.drift_psi ?? 0) >= 0.15;
    const regulatorRelevantBump = driftFlag ? 1 : row.regulator_relevant;
    const isReportableBump = driftFlag ? 1 : row.is_reportable;
    if (driftFlag) flagged++;

    await env.DB.prepare(
      `UPDATE oe_anomaly_detection_ml
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
  return { scanned: rows.length, flagged_drifting: flagged };
}

// ─── Cron: weekly model-card expiry scan (0 7 * * 1) ─────────────────────
//
// Monday 09:00 SAST (07:00 UTC). Flags any model whose model card
// expires within 14 days as regulator_relevant so it surfaces in the
// regulator inbox. ISO 42001 + EU AI Act require pre-renewal model-card
// re-attestation.
export async function anomalyDetectionMlModelCardExpirySweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; flagged: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_anomaly_detection_ml
     WHERE chain_status NOT IN ('archived','rolled_back','recalled')
       AND model_card_expiry_at IS NOT NULL`,
  ).all<AdmlRow>();
  const rows = rs.results || [];
  let flagged = 0;
  for (const row of rows) {
    const mcardDays = daysToModelCardExpiry(row.model_card_expiry_at, now);
    if (mcardDays < 14) {
      await env.DB.prepare(
        `UPDATE oe_anomaly_detection_ml
         SET regulator_relevant = 1, is_reportable = 1,
             days_to_model_card_expiry = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(mcardDays, nowIso, row.id).run();
      flagged++;
    } else {
      await env.DB.prepare(
        `UPDATE oe_anomaly_detection_ml
         SET days_to_model_card_expiry = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(mcardDays, nowIso, row.id).run();
    }
  }
  return { scanned: rows.length, flagged };
}

export default app;
