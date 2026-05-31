// Wave 129 - Fault-Fingerprint Multi-Class ML chain spec battery.
//
// PHASE D WAVE 3 OF 4. Multi-class fault classifier (XGBoost / RF /
// GradientBoosting / 1D-CNN / LightGBM / CatBoost / baseline_physics)
// REPLACING the W71 12-mode physics rules. Sister of W127 (anomaly ML)
// and W128 (survival ML). Joins the W127 'ml' audit namespace.
//
// Covers: 12-state forward + 4-branch machine, 18-action TRANSITIONS,
// INVERTED SLA polarity anchored at model_proposed (36/120/300/600/900h),
// BETWEEN W127 (720h ceiling) and W128 (1080h ceiling). Tier derivation,
// FLOOR-AT-LARGE-FLEET on >=1 of 5 flags, FLOOR-AT-FLEET-SYSTEMIC on >=3
// flags, effectiveTier with FLOOR lifting, heavy tier helpers,
// W129 SIGNATURE inheriting W127-ML-ROLLBACK Phase-D hard line
// (rollback_model EVERY tier - THIRD Phase-D rollback signature);
// recall_model EVERY tier WHEN safety_critical_fault_class;
// detect_class_drift HEAVY tiers ONLY WHEN regulator_reportable_misclass;
// failover_to_physics_baseline top-heavy only; W129-UNIQUE add_novel_class
// at fleet_systemic only (EU AI Act Art 14 product-class change);
// sla_breached HEAVY only. Party + event routing (4-step: ml_engineer /
// data_steward / CTO / CEO), authority ladder, urgency band INVERTED
// (single_asset tightest; safety_critical_fault_class /
// nerc_cip_audit_in_scope short-circuits to systemic), daysToRetrainDue,
// daysToModelCardExpiry, 5-bridge architecture (W71 NOT NULL + W15 +
// W41 + W63 + W118 MANDATORY), control effectiveness 0-130 composite
// with multi-class metrics (macro_f1, micro_f1, weighted_recall,
// top_3_accuracy, log_loss, roc_auc_macro, confusion_matrix_density,
// class_imbalance_ratio, calibration_brier, class_drift_psi,
// novel_class_detection_rate), model health band composite, model-family
// taxonomy (7 multi-class families), asset-class taxonomy (10-class
// universe), fault-mode taxonomy (12 inherited from W71), stratified
// split floor MIN_SAMPLES_PER_CLASS_FLOOR=30, add_novel_class RE-ENTRY.

import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  nextStatus,
  allowedActions,
  isTerminal,
  isHardTerminal,
  SLA_HOURS,
  slaWindowHours,
  slaDeadlineFor,
  slaHoursRemaining,
  tierForScope,
  countFloorFlags,
  floorAtLargeFleet,
  floorAtFleetSystemic,
  effectiveTier,
  isHeavyTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
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
  FAULT_FINGERPRINT_MODEL_FAMILIES,
  isKnownAssetClass,
  FAULT_FINGERPRINT_ASSET_CLASSES,
  isKnownFaultMode,
  FAULT_FINGERPRINT_FAULT_MODES,
  MIN_SAMPLES_PER_CLASS_FLOOR,
} from '../src/utils/fault-fingerprint-ml-spec';

describe('W129 fault-fingerprint ML - state machine forward path', () => {
  it('walks model_proposed -> archived through all 12 forward states', () => {
    expect(nextStatus('model_proposed', 'bind_labeled_dataset')).toBe('labeled_dataset_bound');
    expect(nextStatus('labeled_dataset_bound', 'resolve_class_imbalance')).toBe('class_imbalance_resolved');
    expect(nextStatus('class_imbalance_resolved', 'engineer_features')).toBe('features_engineered');
    expect(nextStatus('features_engineered', 'split_train_test')).toBe('train_test_split');
    expect(nextStatus('train_test_split', 'train_multiclass')).toBe('multiclass_model_trained');
    expect(nextStatus('multiclass_model_trained', 'validate_confusion_matrix')).toBe('confusion_matrix_validated');
    expect(nextStatus('confusion_matrix_validated', 'calibrate')).toBe('calibrated');
    expect(nextStatus('calibrated', 'deploy_shadow')).toBe('shadow_deployed');
    expect(nextStatus('shadow_deployed', 'activate_live_ab')).toBe('live_ab_active');
    expect(nextStatus('live_ab_active', 'promote_champion')).toBe('champion_promoted');
    expect(nextStatus('champion_promoted', 'retrain')).toBe('retrained');
    expect(nextStatus('retrained', 'archive')).toBe('archived');
  });

  it('blocks forward skips', () => {
    expect(nextStatus('model_proposed', 'resolve_class_imbalance')).toBeNull();
    expect(nextStatus('labeled_dataset_bound', 'engineer_features')).toBeNull();
    expect(nextStatus('class_imbalance_resolved', 'split_train_test')).toBeNull();
    expect(nextStatus('features_engineered', 'train_multiclass')).toBeNull();
    expect(nextStatus('train_test_split', 'validate_confusion_matrix')).toBeNull();
    expect(nextStatus('multiclass_model_trained', 'calibrate')).toBeNull();
    expect(nextStatus('confusion_matrix_validated', 'deploy_shadow')).toBeNull();
    expect(nextStatus('calibrated', 'activate_live_ab')).toBeNull();
    expect(nextStatus('shadow_deployed', 'promote_champion')).toBeNull();
    expect(nextStatus('live_ab_active', 'retrain')).toBeNull();
  });

  it('archive also allowed direct from champion_promoted (skip retrain)', () => {
    expect(nextStatus('champion_promoted', 'archive')).toBe('archived');
  });
});

describe('W129 - branch states (drift / rollback / recall / failover_to_physics_baseline)', () => {
  it('detect_class_drift only from inference-active states', () => {
    expect(nextStatus('shadow_deployed', 'detect_class_drift')).toBe('class_drift_detected');
    expect(nextStatus('live_ab_active', 'detect_class_drift')).toBe('class_drift_detected');
    expect(nextStatus('champion_promoted', 'detect_class_drift')).toBe('class_drift_detected');
    expect(nextStatus('retrained', 'detect_class_drift')).toBe('class_drift_detected');
    expect(nextStatus('failover_to_physics_baseline', 'detect_class_drift')).toBe('class_drift_detected');
  });

  it('detect_class_drift NOT allowed from pre-inference states', () => {
    expect(nextStatus('model_proposed', 'detect_class_drift')).toBeNull();
    expect(nextStatus('labeled_dataset_bound', 'detect_class_drift')).toBeNull();
    expect(nextStatus('class_imbalance_resolved', 'detect_class_drift')).toBeNull();
    expect(nextStatus('features_engineered', 'detect_class_drift')).toBeNull();
    expect(nextStatus('train_test_split', 'detect_class_drift')).toBeNull();
    expect(nextStatus('multiclass_model_trained', 'detect_class_drift')).toBeNull();
    expect(nextStatus('confusion_matrix_validated', 'detect_class_drift')).toBeNull();
    expect(nextStatus('calibrated', 'detect_class_drift')).toBeNull();
  });

  it('rollback_model from any non-terminal -> rolled_back', () => {
    expect(nextStatus('model_proposed', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('labeled_dataset_bound', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('shadow_deployed', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('live_ab_active', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('champion_promoted', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('retrained', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('class_drift_detected', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('failover_to_physics_baseline', 'rollback_model')).toBe('rolled_back');
  });

  it('recall_model from any non-terminal -> recalled', () => {
    expect(nextStatus('model_proposed', 'recall_model')).toBe('recalled');
    expect(nextStatus('shadow_deployed', 'recall_model')).toBe('recalled');
    expect(nextStatus('live_ab_active', 'recall_model')).toBe('recalled');
    expect(nextStatus('champion_promoted', 'recall_model')).toBe('recalled');
    expect(nextStatus('class_drift_detected', 'recall_model')).toBe('recalled');
  });

  it('failover_to_physics_baseline only from live or champion or retrained', () => {
    expect(nextStatus('live_ab_active', 'failover_to_physics_baseline')).toBe('failover_to_physics_baseline');
    expect(nextStatus('champion_promoted', 'failover_to_physics_baseline')).toBe('failover_to_physics_baseline');
    expect(nextStatus('retrained', 'failover_to_physics_baseline')).toBe('failover_to_physics_baseline');
  });

  it('failover_to_physics_baseline NOT allowed from pre-live states', () => {
    expect(nextStatus('model_proposed', 'failover_to_physics_baseline')).toBeNull();
    expect(nextStatus('labeled_dataset_bound', 'failover_to_physics_baseline')).toBeNull();
    expect(nextStatus('shadow_deployed', 'failover_to_physics_baseline')).toBeNull();
    expect(nextStatus('calibrated', 'failover_to_physics_baseline')).toBeNull();
    expect(nextStatus('class_drift_detected', 'failover_to_physics_baseline')).toBeNull();
  });

  it('activate_live_ab can re-enter from class_drift_detected or failover_to_physics_baseline', () => {
    expect(nextStatus('class_drift_detected', 'activate_live_ab')).toBe('live_ab_active');
    expect(nextStatus('failover_to_physics_baseline', 'activate_live_ab')).toBe('live_ab_active');
  });

  it('retrain can be entered from class_drift_detected', () => {
    expect(nextStatus('class_drift_detected', 'retrain')).toBe('retrained');
  });
});

describe('W129 - add_novel_class RE-ENTRY behavior (EU AI Act Art 14)', () => {
  it('add_novel_class returns to multiclass_model_trained (RE-ENTRY)', () => {
    expect(nextStatus('confusion_matrix_validated', 'add_novel_class')).toBe('multiclass_model_trained');
    expect(nextStatus('calibrated', 'add_novel_class')).toBe('multiclass_model_trained');
    expect(nextStatus('shadow_deployed', 'add_novel_class')).toBe('multiclass_model_trained');
    expect(nextStatus('live_ab_active', 'add_novel_class')).toBe('multiclass_model_trained');
    expect(nextStatus('champion_promoted', 'add_novel_class')).toBe('multiclass_model_trained');
    expect(nextStatus('retrained', 'add_novel_class')).toBe('multiclass_model_trained');
    expect(nextStatus('class_drift_detected', 'add_novel_class')).toBe('multiclass_model_trained');
  });

  it('add_novel_class NOT allowed from pre-validation states', () => {
    expect(nextStatus('model_proposed', 'add_novel_class')).toBeNull();
    expect(nextStatus('labeled_dataset_bound', 'add_novel_class')).toBeNull();
    expect(nextStatus('class_imbalance_resolved', 'add_novel_class')).toBeNull();
    expect(nextStatus('features_engineered', 'add_novel_class')).toBeNull();
    expect(nextStatus('train_test_split', 'add_novel_class')).toBeNull();
    expect(nextStatus('multiclass_model_trained', 'add_novel_class')).toBeNull();
  });

  it('add_novel_class NOT allowed from failover_to_physics_baseline (W71 owns)', () => {
    expect(nextStatus('failover_to_physics_baseline', 'add_novel_class')).toBeNull();
  });
});

describe('W129 - hard terminals (archived / rolled_back / recalled)', () => {
  it('isHardTerminal recognises archived', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isTerminal('archived')).toBe(true);
  });

  it('isHardTerminal recognises rolled_back', () => {
    expect(isHardTerminal('rolled_back')).toBe(true);
    expect(isTerminal('rolled_back')).toBe(true);
  });

  it('isHardTerminal recognises recalled', () => {
    expect(isHardTerminal('recalled')).toBe(true);
    expect(isTerminal('recalled')).toBe(true);
  });

  it('class_drift_detected is NOT terminal (soft)', () => {
    expect(isHardTerminal('class_drift_detected')).toBe(false);
    expect(isTerminal('class_drift_detected')).toBe(false);
  });

  it('failover_to_physics_baseline is NOT terminal (soft)', () => {
    expect(isHardTerminal('failover_to_physics_baseline')).toBe(false);
    expect(isTerminal('failover_to_physics_baseline')).toBe(false);
  });

  it('no action is allowed from a hard terminal', () => {
    expect(nextStatus('archived', 'bind_labeled_dataset')).toBeNull();
    expect(nextStatus('rolled_back', 'activate_live_ab')).toBeNull();
    expect(nextStatus('recalled', 'retrain')).toBeNull();
    expect(allowedActions('archived')).toEqual([]);
    expect(allowedActions('rolled_back')).toEqual([]);
    expect(allowedActions('recalled')).toEqual([]);
  });
});

describe('W129 - allowedActions per state', () => {
  it('model_proposed offers bind_labeled_dataset + rollback + recall', () => {
    const acts = new Set(allowedActions('model_proposed'));
    expect(acts.has('bind_labeled_dataset')).toBe(true);
    expect(acts.has('rollback_model')).toBe(true);
    expect(acts.has('recall_model')).toBe(true);
    expect(acts.has('engineer_features')).toBe(false);
  });

  it('live_ab_active offers promote/detect_class_drift/failover/rollback/recall/add_novel_class', () => {
    const acts = new Set(allowedActions('live_ab_active'));
    expect(acts.has('promote_champion')).toBe(true);
    expect(acts.has('detect_class_drift')).toBe(true);
    expect(acts.has('failover_to_physics_baseline')).toBe(true);
    expect(acts.has('rollback_model')).toBe(true);
    expect(acts.has('recall_model')).toBe(true);
    expect(acts.has('add_novel_class')).toBe(true);
  });

  it('champion_promoted offers retrain + archive + add_novel_class', () => {
    const acts = new Set(allowedActions('champion_promoted'));
    expect(acts.has('retrain')).toBe(true);
    expect(acts.has('archive')).toBe(true);
    expect(acts.has('add_novel_class')).toBe(true);
  });

  it('class_drift_detected offers retrain + activate_live_ab + rollback + recall + add_novel_class', () => {
    const acts = new Set(allowedActions('class_drift_detected'));
    expect(acts.has('retrain')).toBe(true);
    expect(acts.has('activate_live_ab')).toBe(true);
    expect(acts.has('rollback_model')).toBe(true);
    expect(acts.has('recall_model')).toBe(true);
    expect(acts.has('add_novel_class')).toBe(true);
  });

  it('propose_model is never offered as an action option', () => {
    for (const s of [
      'model_proposed',
      'labeled_dataset_bound',
      'live_ab_active',
      'class_drift_detected',
    ] as const) {
      expect(allowedActions(s)).not.toContain('propose_model');
    }
  });
});

describe('W129 - TRANSITIONS 18-action coverage', () => {
  it('every FfmlAction has a TRANSITIONS entry', () => {
    const actions = [
      'propose_model',
      'bind_labeled_dataset',
      'resolve_class_imbalance',
      'engineer_features',
      'split_train_test',
      'train_multiclass',
      'validate_confusion_matrix',
      'calibrate',
      'deploy_shadow',
      'activate_live_ab',
      'promote_champion',
      'retrain',
      'archive',
      'detect_class_drift',
      'rollback_model',
      'recall_model',
      'failover_to_physics_baseline',
      'add_novel_class',
    ] as const;
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
      expect(typeof TRANSITIONS[a].to).toBe('string');
      expect(Array.isArray(TRANSITIONS[a].from)).toBe(true);
    }
  });

  it('exactly 18 transitions', () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(18);
  });
});

describe('W129 - INVERTED SLA matrix at model_proposed anchor', () => {
  it('single_asset = 36h', () => {
    expect(slaWindowHours('model_proposed', 'single_asset')).toBe(36);
  });
  it('small_fleet = 120h', () => {
    expect(slaWindowHours('model_proposed', 'small_fleet')).toBe(120);
  });
  it('large_fleet = 300h', () => {
    expect(slaWindowHours('model_proposed', 'large_fleet')).toBe(300);
  });
  it('multi_jurisdiction_fleet = 600h', () => {
    expect(slaWindowHours('model_proposed', 'multi_jurisdiction_fleet')).toBe(600);
  });
  it('fleet_systemic = 900h', () => {
    expect(slaWindowHours('model_proposed', 'fleet_systemic')).toBe(900);
  });

  it('INVERTED polarity holds at model_proposed (single < small < large < multi < systemic)', () => {
    expect(slaWindowHours('model_proposed', 'single_asset')).toBeLessThan(slaWindowHours('model_proposed', 'small_fleet'));
    expect(slaWindowHours('model_proposed', 'small_fleet')).toBeLessThan(slaWindowHours('model_proposed', 'large_fleet'));
    expect(slaWindowHours('model_proposed', 'large_fleet')).toBeLessThan(slaWindowHours('model_proposed', 'multi_jurisdiction_fleet'));
    expect(slaWindowHours('model_proposed', 'multi_jurisdiction_fleet')).toBeLessThan(slaWindowHours('model_proposed', 'fleet_systemic'));
  });

  it('W129 anchor BETWEEN W127 (720h ceiling) and W128 (1080h ceiling)', () => {
    expect(slaWindowHours('model_proposed', 'fleet_systemic')).toBeGreaterThan(720);
    expect(slaWindowHours('model_proposed', 'fleet_systemic')).toBeLessThan(1080);
  });

  it('shadow_deployed LONG (60-960h) for multi-class confusion-matrix stabilisation', () => {
    expect(slaWindowHours('shadow_deployed', 'single_asset')).toBe(60);
    expect(slaWindowHours('shadow_deployed', 'small_fleet')).toBe(192);
    expect(slaWindowHours('shadow_deployed', 'large_fleet')).toBe(420);
    expect(slaWindowHours('shadow_deployed', 'multi_jurisdiction_fleet')).toBe(600);
    expect(slaWindowHours('shadow_deployed', 'fleet_systemic')).toBe(960);
  });

  it('hard terminals have zero SLA', () => {
    for (const t of ['single_asset', 'small_fleet', 'large_fleet', 'multi_jurisdiction_fleet', 'fleet_systemic'] as const) {
      expect(slaWindowHours('archived', t)).toBe(0);
      expect(slaWindowHours('rolled_back', t)).toBe(0);
      expect(slaWindowHours('recalled', t)).toBe(0);
    }
  });

  it('SLA_HOURS covers all 17 chain_status values', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(17);
  });

  it('slaDeadlineFor adds the window in milliseconds', () => {
    const start = new Date('2026-05-30T00:00:00Z');
    const dl = slaDeadlineFor('model_proposed', 'small_fleet', start);
    expect(dl).not.toBeNull();
    expect(dl!.getTime() - start.getTime()).toBe(120 * 3600 * 1000);
  });

  it('slaDeadlineFor returns null for hard terminals', () => {
    const start = new Date('2026-05-30T00:00:00Z');
    expect(slaDeadlineFor('archived', 'fleet_systemic', start)).toBeNull();
    expect(slaDeadlineFor('rolled_back', 'single_asset', start)).toBeNull();
    expect(slaDeadlineFor('recalled', 'small_fleet', start)).toBeNull();
  });

  it('slaHoursRemaining = window minus elapsed', () => {
    const entered = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-30T12:00:00Z');
    // model_proposed/small_fleet=120h - 12h elapsed = 108h
    expect(slaHoursRemaining('model_proposed', 'small_fleet', entered, now)).toBe(108);
  });

  it('slaHoursRemaining returns 0 if no entered timestamp', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(slaHoursRemaining('model_proposed', 'small_fleet', null, now)).toBe(0);
  });
});

describe('W129 - tier derivation from (assets, jurisdictions, safety_critical)', () => {
  it('zero or one asset -> single_asset', () => {
    expect(tierForScope({})).toBe('single_asset');
    expect(tierForScope({ assets_covered: 1, jurisdiction_count: 1 })).toBe('single_asset');
  });

  it('2-20 assets, 1 jurisdiction -> small_fleet', () => {
    expect(tierForScope({ assets_covered: 5, jurisdiction_count: 1 })).toBe('small_fleet');
    expect(tierForScope({ assets_covered: 20, jurisdiction_count: 1 })).toBe('small_fleet');
  });

  it('21+ assets, 1 jurisdiction -> large_fleet', () => {
    expect(tierForScope({ assets_covered: 50, jurisdiction_count: 1 })).toBe('large_fleet');
    expect(tierForScope({ assets_covered: 250, jurisdiction_count: 1 })).toBe('large_fleet');
  });

  it('2 jurisdictions -> multi_jurisdiction_fleet (regardless of assets)', () => {
    expect(tierForScope({ assets_covered: 5, jurisdiction_count: 2 })).toBe('multi_jurisdiction_fleet');
    expect(tierForScope({ assets_covered: 500, jurisdiction_count: 2 })).toBe('multi_jurisdiction_fleet');
  });

  it('3+ jurisdictions -> fleet_systemic', () => {
    expect(tierForScope({ assets_covered: 1, jurisdiction_count: 3 })).toBe('fleet_systemic');
    expect(tierForScope({ assets_covered: 1000, jurisdiction_count: 9 })).toBe('fleet_systemic');
  });

  it('safety_critical with 3+ jurisdictions -> fleet_systemic', () => {
    expect(tierForScope({ assets_covered: 100, jurisdiction_count: 3, safety_critical: true })).toBe('fleet_systemic');
  });

  it('null inputs treated as zero', () => {
    expect(tierForScope({ assets_covered: null, jurisdiction_count: null })).toBe('single_asset');
  });
});

describe('W129 - FLOOR flag thresholds (>=1 large_fleet, >=3 fleet_systemic)', () => {
  it('countFloorFlags counts truthy flags', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ safety_critical_fault_class: true })).toBe(1);
    expect(countFloorFlags({
      safety_critical_fault_class: true,
      regulator_reportable_misclass: true,
    })).toBe(2);
    expect(countFloorFlags({
      safety_critical_fault_class: true,
      regulator_reportable_misclass: true,
      nerc_cip_audit_in_scope: true,
      sox_ml_governance_required: true,
      iso_42001_required: true,
    })).toBe(5);
  });

  it('handles numeric 1/0 the same as boolean', () => {
    expect(countFloorFlags({ safety_critical_fault_class: 1, sox_ml_governance_required: 1 })).toBe(2);
    expect(countFloorFlags({ safety_critical_fault_class: 0 })).toBe(0);
  });

  it('floorAtLargeFleet triggers at >=1 flag', () => {
    expect(floorAtLargeFleet({})).toBe(false);
    expect(floorAtLargeFleet({ safety_critical_fault_class: true })).toBe(true);
    expect(floorAtLargeFleet({ regulator_reportable_misclass: true })).toBe(true);
  });

  it('floorAtFleetSystemic triggers only at >=3 flags', () => {
    expect(floorAtFleetSystemic({ safety_critical_fault_class: true })).toBe(false);
    expect(floorAtFleetSystemic({
      safety_critical_fault_class: true,
      regulator_reportable_misclass: true,
    })).toBe(false);
    expect(floorAtFleetSystemic({
      safety_critical_fault_class: true,
      regulator_reportable_misclass: true,
      nerc_cip_audit_in_scope: true,
    })).toBe(true);
  });
});

describe('W129 - effectiveTier with FLOOR lifting', () => {
  it('zero flags -> raw tier preserved', () => {
    expect(effectiveTier('single_asset', {})).toBe('single_asset');
    expect(effectiveTier('small_fleet', {})).toBe('small_fleet');
    expect(effectiveTier('large_fleet', {})).toBe('large_fleet');
  });

  it('1 flag lifts to large_fleet if below', () => {
    expect(effectiveTier('single_asset', { safety_critical_fault_class: true })).toBe('large_fleet');
    expect(effectiveTier('small_fleet', { regulator_reportable_misclass: true })).toBe('large_fleet');
  });

  it('1 flag preserves tier if already at large_fleet or higher', () => {
    expect(effectiveTier('large_fleet', { safety_critical_fault_class: true })).toBe('large_fleet');
    expect(effectiveTier('multi_jurisdiction_fleet', { sox_ml_governance_required: true })).toBe('multi_jurisdiction_fleet');
    expect(effectiveTier('fleet_systemic', { iso_42001_required: true })).toBe('fleet_systemic');
  });

  it('3+ flags lift all the way to fleet_systemic', () => {
    expect(effectiveTier('single_asset', {
      safety_critical_fault_class: true,
      regulator_reportable_misclass: true,
      nerc_cip_audit_in_scope: true,
    })).toBe('fleet_systemic');
    expect(effectiveTier('small_fleet', {
      safety_critical_fault_class: true,
      regulator_reportable_misclass: true,
      sox_ml_governance_required: true,
      iso_42001_required: true,
    })).toBe('fleet_systemic');
  });
});

describe('W129 - heavy tier helpers', () => {
  it('isHeavyTier covers large/multi/systemic', () => {
    expect(isHeavyTier('single_asset')).toBe(false);
    expect(isHeavyTier('small_fleet')).toBe(false);
    expect(isHeavyTier('large_fleet')).toBe(true);
    expect(isHeavyTier('multi_jurisdiction_fleet')).toBe(true);
    expect(isHeavyTier('fleet_systemic')).toBe(true);
  });

  it('isReportable mirrors heavy tier (large+)', () => {
    expect(isReportable('single_asset')).toBe(false);
    expect(isReportable('small_fleet')).toBe(false);
    expect(isReportable('large_fleet')).toBe(true);
    expect(isReportable('multi_jurisdiction_fleet')).toBe(true);
    expect(isReportable('fleet_systemic')).toBe(true);
  });
});

describe('W129 - SIGNATURE regulator crossings (inherits W127-ML-ROLLBACK)', () => {
  it('rollback_model crosses regulator at EVERY tier (signature, THIRD Phase-D rollback)', () => {
    for (const t of ['single_asset', 'small_fleet', 'large_fleet', 'multi_jurisdiction_fleet', 'fleet_systemic'] as const) {
      expect(crossesIntoRegulator('rollback_model', t, {})).toBe(true);
    }
  });

  it('rollback_model crosses regardless of any floor flag', () => {
    expect(crossesIntoRegulator('rollback_model', 'single_asset', { flags: {} })).toBe(true);
    expect(crossesIntoRegulator('rollback_model', 'fleet_systemic', {
      flags: { safety_critical_fault_class: true },
    })).toBe(true);
  });

  it('recall_model crosses regulator at EVERY tier WHEN safety_critical_fault_class', () => {
    for (const t of ['single_asset', 'small_fleet', 'large_fleet', 'multi_jurisdiction_fleet', 'fleet_systemic'] as const) {
      expect(crossesIntoRegulator('recall_model', t, { flags: { safety_critical_fault_class: true } })).toBe(true);
    }
  });

  it('recall_model does NOT cross without safety_critical_fault_class', () => {
    expect(crossesIntoRegulator('recall_model', 'fleet_systemic', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('recall_model', 'single_asset', {
      flags: { regulator_reportable_misclass: true, sox_ml_governance_required: true },
    })).toBe(false);
  });

  it('detect_class_drift crosses regulator only on heavy tiers WHEN regulator_reportable_misclass', () => {
    expect(crossesIntoRegulator('detect_class_drift', 'large_fleet', {
      flags: { regulator_reportable_misclass: true },
    })).toBe(true);
    expect(crossesIntoRegulator('detect_class_drift', 'multi_jurisdiction_fleet', {
      flags: { regulator_reportable_misclass: true },
    })).toBe(true);
    expect(crossesIntoRegulator('detect_class_drift', 'fleet_systemic', {
      flags: { regulator_reportable_misclass: true },
    })).toBe(true);
  });

  it('detect_class_drift does NOT cross on light tiers even with flag', () => {
    expect(crossesIntoRegulator('detect_class_drift', 'single_asset', {
      flags: { regulator_reportable_misclass: true },
    })).toBe(false);
    expect(crossesIntoRegulator('detect_class_drift', 'small_fleet', {
      flags: { regulator_reportable_misclass: true },
    })).toBe(false);
  });

  it('detect_class_drift on heavy tier without flag does NOT cross', () => {
    expect(crossesIntoRegulator('detect_class_drift', 'fleet_systemic', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('detect_class_drift', 'large_fleet', {
      flags: { safety_critical_fault_class: true, nerc_cip_audit_in_scope: true },
    })).toBe(false);
  });

  it('failover_to_physics_baseline crosses regulator only on TOP heavy tiers', () => {
    expect(crossesIntoRegulator('failover_to_physics_baseline', 'multi_jurisdiction_fleet', {})).toBe(true);
    expect(crossesIntoRegulator('failover_to_physics_baseline', 'fleet_systemic', {})).toBe(true);
    expect(crossesIntoRegulator('failover_to_physics_baseline', 'large_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('failover_to_physics_baseline', 'small_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('failover_to_physics_baseline', 'single_asset', {})).toBe(false);
  });

  it('W129-UNIQUE: add_novel_class crosses regulator at fleet_systemic only (EU AI Act Art 14)', () => {
    expect(crossesIntoRegulator('add_novel_class', 'fleet_systemic', {})).toBe(true);
  });

  it('W129-UNIQUE: add_novel_class does NOT cross below fleet_systemic', () => {
    expect(crossesIntoRegulator('add_novel_class', 'multi_jurisdiction_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('add_novel_class', 'large_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('add_novel_class', 'small_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('add_novel_class', 'single_asset', {})).toBe(false);
  });

  it('W129-UNIQUE: add_novel_class crosses at fleet_systemic regardless of flags', () => {
    expect(crossesIntoRegulator('add_novel_class', 'fleet_systemic', {
      flags: {},
    })).toBe(true);
    expect(crossesIntoRegulator('add_novel_class', 'fleet_systemic', {
      flags: { safety_critical_fault_class: true, iso_42001_required: true },
    })).toBe(true);
  });

  it('mundane actions never cross', () => {
    expect(crossesIntoRegulator('bind_labeled_dataset', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('resolve_class_imbalance', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('engineer_features', 'multi_jurisdiction_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('split_train_test', 'large_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('train_multiclass', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('validate_confusion_matrix', 'large_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('calibrate', 'multi_jurisdiction_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('deploy_shadow', 'large_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('activate_live_ab', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('promote_champion', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('retrain', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('archive', 'fleet_systemic', {})).toBe(false);
  });
});

describe('W129 - SLA breach crossings (heavy only)', () => {
  it('sla_breached crosses regulator on heavy tiers', () => {
    expect(slaBreachCrossesIntoRegulator('large_fleet')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('multi_jurisdiction_fleet')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('fleet_systemic')).toBe(true);
  });

  it('sla_breached does NOT cross on light tiers', () => {
    expect(slaBreachCrossesIntoRegulator('single_asset')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('small_fleet')).toBe(false);
  });
});

describe('W129 - party + event routing (4-step authority)', () => {
  it('ml_engineer owns proposal + dataset + imbalance + features + split + train', () => {
    expect(partyForAction('propose_model')).toBe('ml_engineer');
    expect(partyForAction('bind_labeled_dataset')).toBe('ml_engineer');
    expect(partyForAction('resolve_class_imbalance')).toBe('ml_engineer');
    expect(partyForAction('engineer_features')).toBe('ml_engineer');
    expect(partyForAction('split_train_test')).toBe('ml_engineer');
    expect(partyForAction('train_multiclass')).toBe('ml_engineer');
  });

  it('data_steward owns validate_confusion_matrix + calibrate + deploy_shadow + detect_class_drift + failover', () => {
    expect(partyForAction('validate_confusion_matrix')).toBe('data_steward');
    expect(partyForAction('calibrate')).toBe('data_steward');
    expect(partyForAction('deploy_shadow')).toBe('data_steward');
    expect(partyForAction('detect_class_drift')).toBe('data_steward');
    expect(partyForAction('failover_to_physics_baseline')).toBe('data_steward');
  });

  it('CTO owns activate_live_ab + promote_champion + retrain + rollback_model + add_novel_class', () => {
    expect(partyForAction('activate_live_ab')).toBe('CTO');
    expect(partyForAction('promote_champion')).toBe('CTO');
    expect(partyForAction('retrain')).toBe('CTO');
    expect(partyForAction('rollback_model')).toBe('CTO');
    expect(partyForAction('add_novel_class')).toBe('CTO');
  });

  it('CEO owns archive + recall_model', () => {
    expect(partyForAction('archive')).toBe('CEO');
    expect(partyForAction('recall_model')).toBe('CEO');
  });

  it('eventTypeFor maps all 18 actions to events', () => {
    expect(eventTypeFor('propose_model')).toBe('fault_fingerprint_ml_proposed');
    expect(eventTypeFor('bind_labeled_dataset')).toBe('fault_fingerprint_ml_labeled_dataset_bound');
    expect(eventTypeFor('resolve_class_imbalance')).toBe('fault_fingerprint_ml_class_imbalance_resolved');
    expect(eventTypeFor('engineer_features')).toBe('fault_fingerprint_ml_features_engineered');
    expect(eventTypeFor('split_train_test')).toBe('fault_fingerprint_ml_train_test_split');
    expect(eventTypeFor('train_multiclass')).toBe('fault_fingerprint_ml_multiclass_model_trained');
    expect(eventTypeFor('validate_confusion_matrix')).toBe('fault_fingerprint_ml_confusion_matrix_validated');
    expect(eventTypeFor('calibrate')).toBe('fault_fingerprint_ml_calibrated');
    expect(eventTypeFor('deploy_shadow')).toBe('fault_fingerprint_ml_shadow_deployed');
    expect(eventTypeFor('activate_live_ab')).toBe('fault_fingerprint_ml_live_ab_active');
    expect(eventTypeFor('promote_champion')).toBe('fault_fingerprint_ml_champion_promoted');
    expect(eventTypeFor('retrain')).toBe('fault_fingerprint_ml_retrained');
    expect(eventTypeFor('archive')).toBe('fault_fingerprint_ml_archived');
    expect(eventTypeFor('detect_class_drift')).toBe('fault_fingerprint_ml_class_drift_detected');
    expect(eventTypeFor('rollback_model')).toBe('fault_fingerprint_ml_rolled_back');
    expect(eventTypeFor('recall_model')).toBe('fault_fingerprint_ml_recalled');
    expect(eventTypeFor('failover_to_physics_baseline')).toBe('fault_fingerprint_ml_failover_to_physics_baseline');
    expect(eventTypeFor('add_novel_class')).toBe('fault_fingerprint_ml_novel_class_added');
  });
});

describe('W129 - urgency band INVERTED polarity', () => {
  it('safety_critical_fault_class short-circuits to systemic regardless of tier', () => {
    expect(urgencyBand('single_asset', 100, { safety_critical_fault_class: true })).toBe('systemic');
    expect(urgencyBand('fleet_systemic', 1000, { safety_critical_fault_class: true })).toBe('systemic');
  });

  it('nerc_cip_audit_in_scope short-circuits to systemic', () => {
    expect(urgencyBand('single_asset', 100, { nerc_cip_audit_in_scope: true })).toBe('systemic');
    expect(urgencyBand('large_fleet', 1000, { nerc_cip_audit_in_scope: true })).toBe('systemic');
  });

  it('negative hours always critical', () => {
    expect(urgencyBand('fleet_systemic', -1)).toBe('critical');
    expect(urgencyBand('single_asset', -1)).toBe('critical');
  });

  it('single_asset has TIGHTEST thresholds (critical <4h)', () => {
    expect(urgencyBand('single_asset', 3)).toBe('critical');
    expect(urgencyBand('single_asset', 10)).toBe('high');
    expect(urgencyBand('single_asset', 20)).toBe('medium');
    expect(urgencyBand('single_asset', 50)).toBe('low');
  });

  it('small_fleet wider thresholds', () => {
    expect(urgencyBand('small_fleet', 5)).toBe('critical');
    expect(urgencyBand('small_fleet', 20)).toBe('high');
    expect(urgencyBand('small_fleet', 40)).toBe('medium');
    expect(urgencyBand('small_fleet', 100)).toBe('low');
  });

  it('large_fleet wider still', () => {
    expect(urgencyBand('large_fleet', 10)).toBe('critical');
    expect(urgencyBand('large_fleet', 30)).toBe('high');
    expect(urgencyBand('large_fleet', 90)).toBe('medium');
    expect(urgencyBand('large_fleet', 200)).toBe('low');
  });

  it('multi_jurisdiction_fleet wider still', () => {
    expect(urgencyBand('multi_jurisdiction_fleet', 12)).toBe('critical');
    expect(urgencyBand('multi_jurisdiction_fleet', 60)).toBe('high');
    expect(urgencyBand('multi_jurisdiction_fleet', 150)).toBe('medium');
    expect(urgencyBand('multi_jurisdiction_fleet', 300)).toBe('low');
  });

  it('fleet_systemic has LOOSEST thresholds (INVERTED tail)', () => {
    expect(urgencyBand('fleet_systemic', 20)).toBe('critical');
    expect(urgencyBand('fleet_systemic', 80)).toBe('high');
    expect(urgencyBand('fleet_systemic', 200)).toBe('medium');
    expect(urgencyBand('fleet_systemic', 500)).toBe('low');
  });
});

describe('W129 - authority ladder by tier', () => {
  it('single_asset -> ml_engineer', () => {
    expect(authorityRequired('single_asset')).toBe('ml_engineer');
  });
  it('small_fleet -> ml_engineer', () => {
    expect(authorityRequired('small_fleet')).toBe('ml_engineer');
  });
  it('large_fleet -> data_steward', () => {
    expect(authorityRequired('large_fleet')).toBe('data_steward');
  });
  it('multi_jurisdiction_fleet -> CTO', () => {
    expect(authorityRequired('multi_jurisdiction_fleet')).toBe('CTO');
  });
  it('fleet_systemic -> CEO', () => {
    expect(authorityRequired('fleet_systemic')).toBe('CEO');
  });
});

describe('W129 - days helpers (retrain + model-card)', () => {
  it('daysToRetrainDue returns 0 for past dates', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(daysToRetrainDue('2026-05-01T00:00:00Z', now)).toBe(0);
  });

  it('daysToRetrainDue returns positive days for future', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(daysToRetrainDue('2026-06-29T00:00:00Z', now)).toBe(30);
  });

  it('daysToRetrainDue returns 9999 for null', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(daysToRetrainDue(null, now)).toBe(9999);
    expect(daysToRetrainDue(undefined, now)).toBe(9999);
  });

  it('daysToModelCardExpiry returns 0 for past dates', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(daysToModelCardExpiry('2026-05-01T00:00:00Z', now)).toBe(0);
  });

  it('daysToModelCardExpiry returns positive days for future', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(daysToModelCardExpiry('2026-08-28T00:00:00Z', now)).toBe(90);
  });

  it('daysToModelCardExpiry returns 9999 for null', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(daysToModelCardExpiry(null, now)).toBe(9999);
  });
});

describe('W129 - 5-bridge architecture (W71 NOT NULL + W15 + W41 + W63 + W118 MANDATORY)', () => {
  it('bridgesToW71AssetPrognostics true when ref present (NOT NULL bridge - 12-mode physics)', () => {
    expect(bridgesToW71AssetPrognostics('aprog-001')).toBe(true);
    expect(bridgesToW71AssetPrognostics(null)).toBe(false);
    expect(bridgesToW71AssetPrognostics('')).toBe(false);
  });

  it('bridgesToW15WarrantyClaim true when ref present (fault-mode evidence)', () => {
    expect(bridgesToW15WarrantyClaim('claim-001')).toBe(true);
    expect(bridgesToW15WarrantyClaim(null)).toBe(false);
  });

  it('bridgesToW41ProblemManagement true when ref present (RCA from class)', () => {
    expect(bridgesToW41ProblemManagement('prob-001')).toBe(true);
    expect(bridgesToW41ProblemManagement(null)).toBe(false);
  });

  it('bridgesToW63WarrantyRecovery true when ref present (supplier-recovery from class)', () => {
    expect(bridgesToW63WarrantyRecovery('wrec-001')).toBe(true);
    expect(bridgesToW63WarrantyRecovery(null)).toBe(false);
  });

  it('bridgesToW118AuditChain true when block ref present (MANDATORY - tamper-evidence)', () => {
    expect(bridgesToW118AuditChain('block-001')).toBe(true);
    expect(bridgesToW118AuditChain(null)).toBe(false);
  });
});

describe('W129 - controlEffectivenessIndex 0-130 composite (multi-class metrics)', () => {
  it('empty / zeroed args yields a valid score', () => {
    const s = controlEffectivenessIndex({});
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(130);
  });

  it('clamps to 130 ceiling under max signals', () => {
    const s = controlEffectivenessIndex({
      macro_f1: 1.0,
      micro_f1: 1.0,
      weighted_recall: 1.0,
      top_3_accuracy: 1.0,
      log_loss: 0,
      roc_auc_macro: 1.0,
      confusion_matrix_density: 1.0,
      class_imbalance_ratio: 1,
      calibration_brier: 0,
      class_drift_psi: 0,
      novel_class_detection_rate: 1.0,
      reconciliation_with_w71_physics_pct: 100,
      ntt_baseline_comparison_pct: 50,
      iso_42001_compliance_score: 130,
      model_card_status: 'published',
      iso27001_controls_ok: true,
      soc2_type2_controls_ok: true,
    });
    expect(s).toBeLessThanOrEqual(130);
    expect(s).toBeGreaterThan(110);
  });

  it('high macro_f1 lifts score', () => {
    const lo = controlEffectivenessIndex({ macro_f1: 0.3 });
    const hi = controlEffectivenessIndex({ macro_f1: 1.0 });
    expect(hi).toBeGreaterThan(lo);
  });

  it('high micro_f1 lifts score', () => {
    const lo = controlEffectivenessIndex({ micro_f1: 0.3 });
    const hi = controlEffectivenessIndex({ micro_f1: 1.0 });
    expect(hi).toBeGreaterThan(lo);
  });

  it('high top_3_accuracy lifts score', () => {
    const lo = controlEffectivenessIndex({ top_3_accuracy: 0.3 });
    const hi = controlEffectivenessIndex({ top_3_accuracy: 1.0 });
    expect(hi).toBeGreaterThan(lo);
  });

  it('low log_loss lifts score (lower better)', () => {
    const lo_loss = controlEffectivenessIndex({ log_loss: 0.1 });
    const hi_loss = controlEffectivenessIndex({ log_loss: 1.8 });
    expect(lo_loss).toBeGreaterThan(hi_loss);
  });

  it('high roc_auc_macro lifts score', () => {
    const lo = controlEffectivenessIndex({ roc_auc_macro: 0.6 });
    const hi = controlEffectivenessIndex({ roc_auc_macro: 0.99 });
    expect(hi).toBeGreaterThan(lo);
  });

  it('high confusion_matrix_density (diagonal) lifts score', () => {
    const lo = controlEffectivenessIndex({ confusion_matrix_density: 0.3 });
    const hi = controlEffectivenessIndex({ confusion_matrix_density: 0.95 });
    expect(hi).toBeGreaterThan(lo);
  });

  it('low class_imbalance_ratio lifts score (1=balanced)', () => {
    const balanced = controlEffectivenessIndex({ class_imbalance_ratio: 1 });
    const imbal = controlEffectivenessIndex({ class_imbalance_ratio: 80 });
    expect(balanced).toBeGreaterThan(imbal);
  });

  it('low calibration_brier lifts score', () => {
    const lo_brier = controlEffectivenessIndex({ calibration_brier: 0.02 });
    const hi_brier = controlEffectivenessIndex({ calibration_brier: 0.6 });
    expect(lo_brier).toBeGreaterThan(hi_brier);
  });

  it('low class_drift_psi lifts score (< 0.25 ideal)', () => {
    const lo_psi = controlEffectivenessIndex({ class_drift_psi: 0 });
    const hi_psi = controlEffectivenessIndex({ class_drift_psi: 0.5 });
    expect(lo_psi).toBeGreaterThan(hi_psi);
  });

  it('high reconciliation_with_w71_physics_pct lifts score', () => {
    const lo = controlEffectivenessIndex({ reconciliation_with_w71_physics_pct: 50 });
    const hi = controlEffectivenessIndex({ reconciliation_with_w71_physics_pct: 99 });
    expect(hi).toBeGreaterThan(lo);
  });

  it('model_card published > approved > draft', () => {
    const pub = controlEffectivenessIndex({ model_card_status: 'published' });
    const appr = controlEffectivenessIndex({ model_card_status: 'approved' });
    const draft = controlEffectivenessIndex({ model_card_status: 'draft' });
    expect(pub).toBeGreaterThan(appr);
    expect(appr).toBeGreaterThan(draft);
  });

  it('ISO 27001 + SOC2 binary signals add to score', () => {
    const without = controlEffectivenessIndex({ macro_f1: 0.7 });
    const withBoth = controlEffectivenessIndex({
      macro_f1: 0.7,
      iso27001_controls_ok: true,
      soc2_type2_controls_ok: true,
    });
    expect(withBoth).toBeGreaterThan(without);
  });

  it('never returns negative score', () => {
    const s = controlEffectivenessIndex({
      macro_f1: 0,
      micro_f1: 0,
      weighted_recall: 0,
      top_3_accuracy: 0,
      log_loss: 2,
      roc_auc_macro: 0.5,
      confusion_matrix_density: 0,
      class_imbalance_ratio: 100,
      calibration_brier: 1,
      class_drift_psi: 1,
    });
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

describe('W129 - modelHealthBand composite (with macro_f1 + class_drift_psi)', () => {
  it('recalled -> critical regardless of other signals', () => {
    expect(modelHealthBand('recalled', 130, false, 365, 365, {}, 0.95, 0.0, 'published')).toBe('critical');
  });

  it('rolled_back -> critical regardless of other signals', () => {
    expect(modelHealthBand('rolled_back', 130, false, 365, 365, {}, 0.95, 0.0, 'published')).toBe('critical');
  });

  it('archived -> green (clean close)', () => {
    expect(modelHealthBand('archived', 0, true, 0, 0, {}, 0.3, 0.9, 'expired')).toBe('green');
  });

  it('SLA breach -> red', () => {
    expect(modelHealthBand('live_ab_active', 120, true, 365, 365, {}, 0.9, 0.05, 'published')).toBe('red');
  });

  it('macro_f1 < 0.5 -> red', () => {
    expect(modelHealthBand('live_ab_active', 120, false, 365, 365, {}, 0.4, 0.05, 'published')).toBe('red');
  });

  it('class_drift_psi >= 0.25 -> red (heavy class drift)', () => {
    expect(modelHealthBand('live_ab_active', 120, false, 365, 365, {}, 0.9, 0.3, 'published')).toBe('red');
  });

  it('expired model card -> red', () => {
    expect(modelHealthBand('live_ab_active', 120, false, 365, 365, {}, 0.9, 0.05, 'expired')).toBe('red');
  });

  it('retrain due < 14 days -> red', () => {
    expect(modelHealthBand('live_ab_active', 120, false, 7, 365, {}, 0.9, 0.05, 'published')).toBe('red');
  });

  it('class_drift_detected -> amber when other signals clean', () => {
    expect(modelHealthBand('class_drift_detected', 100, false, 365, 365, {}, 0.9, 0.05, 'published')).toBe('amber');
  });

  it('failover_to_physics_baseline -> amber when other signals clean', () => {
    expect(modelHealthBand('failover_to_physics_baseline', 100, false, 365, 365, {}, 0.9, 0.05, 'published')).toBe('amber');
  });

  it('green when all signals clean', () => {
    expect(modelHealthBand('live_ab_active', 110, false, 365, 365, {}, 0.85, 0.05, 'published')).toBe('green');
  });

  it('macro_f1 in 0.5..0.7 -> amber', () => {
    expect(modelHealthBand('live_ab_active', 100, false, 365, 365, {}, 0.6, 0.05, 'published')).toBe('amber');
  });

  it('class_drift_psi in 0.10..0.25 -> amber', () => {
    expect(modelHealthBand('live_ab_active', 100, false, 365, 365, {}, 0.85, 0.15, 'published')).toBe('amber');
  });
});

describe('W129 - taxonomy guards (7 model families, 10 asset classes, 12 fault modes)', () => {
  it('FAULT_FINGERPRINT_MODEL_FAMILIES has 7 entries', () => {
    expect(FAULT_FINGERPRINT_MODEL_FAMILIES).toHaveLength(7);
  });

  it('isKnownModelFamily accepts canonical multi-class families', () => {
    expect(isKnownModelFamily('xgboost')).toBe(true);
    expect(isKnownModelFamily('random_forest')).toBe(true);
    expect(isKnownModelFamily('gradient_boosting')).toBe(true);
    expect(isKnownModelFamily('cnn_1d')).toBe(true);
    expect(isKnownModelFamily('lightgbm')).toBe(true);
    expect(isKnownModelFamily('catboost')).toBe(true);
    expect(isKnownModelFamily('baseline_physics')).toBe(true);
  });

  it('isKnownModelFamily rejects unknown / null', () => {
    expect(isKnownModelFamily('cox_ph')).toBe(false);
    expect(isKnownModelFamily('lstm_autoencoder')).toBe(false);
    expect(isKnownModelFamily(null)).toBe(false);
    expect(isKnownModelFamily('')).toBe(false);
    expect(isKnownModelFamily(undefined)).toBe(false);
  });

  it('FAULT_FINGERPRINT_ASSET_CLASSES has 10 entries', () => {
    expect(FAULT_FINGERPRINT_ASSET_CLASSES).toHaveLength(10);
  });

  it('isKnownAssetClass accepts canonical classes', () => {
    expect(isKnownAssetClass('wind_turbine')).toBe(true);
    expect(isKnownAssetClass('pv_inverter')).toBe(true);
    expect(isKnownAssetClass('battery_storage')).toBe(true);
    expect(isKnownAssetClass('transformer')).toBe(true);
    expect(isKnownAssetClass('transmission_line')).toBe(true);
    expect(isKnownAssetClass('substation')).toBe(true);
    expect(isKnownAssetClass('hydrogen_electrolyser')).toBe(true);
    expect(isKnownAssetClass('grid_scada')).toBe(true);
    expect(isKnownAssetClass('smart_meter')).toBe(true);
    expect(isKnownAssetClass('generic')).toBe(true);
  });

  it('isKnownAssetClass rejects unknown / null', () => {
    expect(isKnownAssetClass('flux_capacitor')).toBe(false);
    expect(isKnownAssetClass(null)).toBe(false);
    expect(isKnownAssetClass('')).toBe(false);
  });

  it('FAULT_FINGERPRINT_FAULT_MODES has 12 entries (inherited from W71)', () => {
    expect(FAULT_FINGERPRINT_FAULT_MODES).toHaveLength(12);
  });

  it('isKnownFaultMode accepts canonical W71 12-mode set', () => {
    expect(isKnownFaultMode('inverter_igbt_degradation')).toBe(true);
    expect(isKnownFaultMode('dc_arc_fault')).toBe(true);
    expect(isKnownFaultMode('transformer_thermal')).toBe(true);
    expect(isKnownFaultMode('battery_thermal_runaway')).toBe(true);
    expect(isKnownFaultMode('panel_hotspot')).toBe(true);
    expect(isKnownFaultMode('blade_pitch_imbalance')).toBe(true);
    expect(isKnownFaultMode('gearbox_bearing')).toBe(true);
    expect(isKnownFaultMode('yaw_misalignment')).toBe(true);
    expect(isKnownFaultMode('tracker_motor')).toBe(true);
    expect(isKnownFaultMode('combiner_box')).toBe(true);
    expect(isKnownFaultMode('generator_winding')).toBe(true);
    expect(isKnownFaultMode('converter_capacitor_aging')).toBe(true);
  });

  it('isKnownFaultMode rejects unknown / null', () => {
    expect(isKnownFaultMode('unknown_fault')).toBe(false);
    expect(isKnownFaultMode(null)).toBe(false);
    expect(isKnownFaultMode('')).toBe(false);
  });
});

describe('W129 - stratified split floor (MIN_SAMPLES_PER_CLASS_FLOOR)', () => {
  it('MIN_SAMPLES_PER_CLASS_FLOOR is 30 (NIST AI RMF MEASURE)', () => {
    expect(MIN_SAMPLES_PER_CLASS_FLOOR).toBe(30);
  });
});
