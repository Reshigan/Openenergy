// Wave 127 - Anomaly-Detection ML Model lifecycle spec battery.
//
// PHASE D opener. Real ML brain (LSTM autoencoder / transformer
// autoencoder / variational autoencoder) replacing W71 heuristic
// prognostics ensemble.
//
// Covers: 12-state forward + 4-branch machine, 16-action TRANSITIONS,
// INVERTED SLA polarity anchored at model_proposed
// (24/96/240/480/720h), tier derivation from
// (assets_covered, jurisdiction_count, safety_critical),
// FLOOR-AT-LARGE-FLEET on >=1 of 5 flags + FLOOR-AT-FLEET-SYSTEMIC on
// >=3 flags, effectiveTier with FLOOR lifting, heavy tier helpers,
// W127 SIGNATURE W127-ML-ROLLBACK crossings (rollback_model EVERY
// tier - FIRST Phase-D hard line; recall_model EVERY tier WHEN
// safety_critical_inference; detect_drift heavy tiers ONLY WHEN
// regulator_reportable_drift; activate_failover TOP-HEAVY only;
// sla_breached HEAVY only), party + event routing (4-step:
// ml_engineer / data_steward / CTO / CEO), authority ladder,
// urgency band INVERTED (single_asset tightest;
// safety_critical_inference / nerc_cip_audit_in_scope short-circuit
// to systemic), daysToRetrainDue, daysToModelCardExpiry, 5-bridge
// architecture (W71 + W12 + W118 + W126 + W74; W118 MANDATORY),
// control effectiveness 0-130 composite, model health band composite,
// model-family taxonomy (7-family universe), asset-class taxonomy
// (10-class universe).

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
  bridgesToW12SiteCommissioning,
  bridgesToW126GovernmentFiling,
  bridgesToW74NersaLevy,
  bridgesToW118AuditChain,
  controlEffectivenessIndex,
  modelHealthBand,
  isKnownModelFamily,
  ANOMALY_DETECTION_MODEL_FAMILIES,
  isKnownAssetClass,
  ANOMALY_DETECTION_ASSET_CLASSES,
} from '../src/utils/anomaly-detection-ml-spec';

describe('W127 anomaly-detection ML - state machine forward path', () => {
  it('walks model_proposed -> archived through all 12 forward states', () => {
    expect(nextStatus('model_proposed', 'bind_dataset')).toBe('dataset_bound');
    expect(nextStatus('dataset_bound', 'engineer_features')).toBe('features_engineered');
    expect(nextStatus('features_engineered', 'split_train_test')).toBe('train_test_split');
    expect(nextStatus('train_test_split', 'train_model')).toBe('model_trained');
    expect(nextStatus('model_trained', 'backtest')).toBe('backtest_validated');
    expect(nextStatus('backtest_validated', 'calibrate')).toBe('calibrated');
    expect(nextStatus('calibrated', 'deploy_shadow')).toBe('shadow_deployed');
    expect(nextStatus('shadow_deployed', 'activate_live_ab')).toBe('live_ab_active');
    expect(nextStatus('live_ab_active', 'promote_champion')).toBe('champion_promoted');
    expect(nextStatus('champion_promoted', 'retrain')).toBe('retrained');
    expect(nextStatus('retrained', 'archive')).toBe('archived');
  });

  it('blocks forward skips', () => {
    expect(nextStatus('model_proposed', 'engineer_features')).toBeNull();
    expect(nextStatus('dataset_bound', 'split_train_test')).toBeNull();
    expect(nextStatus('features_engineered', 'train_model')).toBeNull();
    expect(nextStatus('train_test_split', 'backtest')).toBeNull();
    expect(nextStatus('model_trained', 'calibrate')).toBeNull();
    expect(nextStatus('backtest_validated', 'deploy_shadow')).toBeNull();
    expect(nextStatus('calibrated', 'activate_live_ab')).toBeNull();
    expect(nextStatus('shadow_deployed', 'promote_champion')).toBeNull();
    expect(nextStatus('live_ab_active', 'retrain')).toBeNull();
    expect(nextStatus('champion_promoted', 'archive')).toBe('archived'); // direct allowed
  });

  it('archive also allowed direct from champion_promoted (skip retrain)', () => {
    expect(nextStatus('champion_promoted', 'archive')).toBe('archived');
  });
});

describe('W127 - branch states (drift / rollback / recall / failover)', () => {
  it('detect_drift only from inference-active states', () => {
    expect(nextStatus('shadow_deployed', 'detect_drift')).toBe('drift_detected');
    expect(nextStatus('live_ab_active', 'detect_drift')).toBe('drift_detected');
    expect(nextStatus('champion_promoted', 'detect_drift')).toBe('drift_detected');
    expect(nextStatus('retrained', 'detect_drift')).toBe('drift_detected');
    expect(nextStatus('failover_to_baseline', 'detect_drift')).toBe('drift_detected');
  });

  it('detect_drift NOT allowed from pre-inference states', () => {
    expect(nextStatus('model_proposed', 'detect_drift')).toBeNull();
    expect(nextStatus('dataset_bound', 'detect_drift')).toBeNull();
    expect(nextStatus('features_engineered', 'detect_drift')).toBeNull();
    expect(nextStatus('train_test_split', 'detect_drift')).toBeNull();
    expect(nextStatus('model_trained', 'detect_drift')).toBeNull();
    expect(nextStatus('backtest_validated', 'detect_drift')).toBeNull();
    expect(nextStatus('calibrated', 'detect_drift')).toBeNull();
  });

  it('rollback_model from any non-terminal -> rolled_back', () => {
    expect(nextStatus('model_proposed', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('dataset_bound', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('shadow_deployed', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('live_ab_active', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('champion_promoted', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('retrained', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('drift_detected', 'rollback_model')).toBe('rolled_back');
    expect(nextStatus('failover_to_baseline', 'rollback_model')).toBe('rolled_back');
  });

  it('recall_model from any non-terminal -> recalled', () => {
    expect(nextStatus('model_proposed', 'recall_model')).toBe('recalled');
    expect(nextStatus('shadow_deployed', 'recall_model')).toBe('recalled');
    expect(nextStatus('live_ab_active', 'recall_model')).toBe('recalled');
    expect(nextStatus('champion_promoted', 'recall_model')).toBe('recalled');
    expect(nextStatus('drift_detected', 'recall_model')).toBe('recalled');
  });

  it('activate_failover only from live or champion or retrained', () => {
    expect(nextStatus('live_ab_active', 'activate_failover')).toBe('failover_to_baseline');
    expect(nextStatus('champion_promoted', 'activate_failover')).toBe('failover_to_baseline');
    expect(nextStatus('retrained', 'activate_failover')).toBe('failover_to_baseline');
  });

  it('activate_failover NOT allowed from pre-live states', () => {
    expect(nextStatus('model_proposed', 'activate_failover')).toBeNull();
    expect(nextStatus('dataset_bound', 'activate_failover')).toBeNull();
    expect(nextStatus('shadow_deployed', 'activate_failover')).toBeNull();
    expect(nextStatus('calibrated', 'activate_failover')).toBeNull();
    expect(nextStatus('drift_detected', 'activate_failover')).toBeNull();
  });

  it('activate_live_ab can re-enter from drift_detected or failover_to_baseline', () => {
    expect(nextStatus('drift_detected', 'activate_live_ab')).toBe('live_ab_active');
    expect(nextStatus('failover_to_baseline', 'activate_live_ab')).toBe('live_ab_active');
  });

  it('retrain can be entered from drift_detected', () => {
    expect(nextStatus('drift_detected', 'retrain')).toBe('retrained');
  });
});

describe('W127 - hard terminals (archived / rolled_back / recalled)', () => {
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

  it('drift_detected is NOT terminal (soft)', () => {
    expect(isHardTerminal('drift_detected')).toBe(false);
    expect(isTerminal('drift_detected')).toBe(false);
  });

  it('failover_to_baseline is NOT terminal (soft)', () => {
    expect(isHardTerminal('failover_to_baseline')).toBe(false);
    expect(isTerminal('failover_to_baseline')).toBe(false);
  });

  it('no action is allowed from a hard terminal', () => {
    expect(nextStatus('archived', 'bind_dataset')).toBeNull();
    expect(nextStatus('rolled_back', 'activate_live_ab')).toBeNull();
    expect(nextStatus('recalled', 'retrain')).toBeNull();
    expect(allowedActions('archived')).toEqual([]);
    expect(allowedActions('rolled_back')).toEqual([]);
    expect(allowedActions('recalled')).toEqual([]);
  });
});

describe('W127 - allowedActions per state', () => {
  it('model_proposed offers bind_dataset + rollback + recall', () => {
    const acts = new Set(allowedActions('model_proposed'));
    expect(acts.has('bind_dataset')).toBe(true);
    expect(acts.has('rollback_model')).toBe(true);
    expect(acts.has('recall_model')).toBe(true);
    expect(acts.has('engineer_features')).toBe(false);
  });

  it('live_ab_active offers promote/detect_drift/failover/rollback/recall', () => {
    const acts = new Set(allowedActions('live_ab_active'));
    expect(acts.has('promote_champion')).toBe(true);
    expect(acts.has('detect_drift')).toBe(true);
    expect(acts.has('activate_failover')).toBe(true);
    expect(acts.has('rollback_model')).toBe(true);
    expect(acts.has('recall_model')).toBe(true);
  });

  it('champion_promoted offers retrain + archive', () => {
    const acts = new Set(allowedActions('champion_promoted'));
    expect(acts.has('retrain')).toBe(true);
    expect(acts.has('archive')).toBe(true);
  });

  it('drift_detected offers retrain + activate_live_ab + rollback + recall', () => {
    const acts = new Set(allowedActions('drift_detected'));
    expect(acts.has('retrain')).toBe(true);
    expect(acts.has('activate_live_ab')).toBe(true);
    expect(acts.has('rollback_model')).toBe(true);
    expect(acts.has('recall_model')).toBe(true);
  });

  it('propose_model is never offered as an action option', () => {
    for (const s of [
      'model_proposed',
      'dataset_bound',
      'live_ab_active',
      'drift_detected',
    ] as const) {
      expect(allowedActions(s)).not.toContain('propose_model');
    }
  });
});

describe('W127 - TRANSITIONS 16-action coverage', () => {
  it('every AdmlAction has a TRANSITIONS entry', () => {
    const actions = [
      'propose_model',
      'bind_dataset',
      'engineer_features',
      'split_train_test',
      'train_model',
      'backtest',
      'calibrate',
      'deploy_shadow',
      'activate_live_ab',
      'promote_champion',
      'retrain',
      'archive',
      'detect_drift',
      'rollback_model',
      'recall_model',
      'activate_failover',
    ] as const;
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
      expect(typeof TRANSITIONS[a].to).toBe('string');
      expect(Array.isArray(TRANSITIONS[a].from)).toBe(true);
    }
  });

  it('exactly 16 transitions', () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(16);
  });
});

describe('W127 - INVERTED SLA matrix at model_proposed anchor', () => {
  it('single_asset = 24h', () => {
    expect(slaWindowHours('model_proposed', 'single_asset')).toBe(24);
  });
  it('small_fleet = 96h', () => {
    expect(slaWindowHours('model_proposed', 'small_fleet')).toBe(96);
  });
  it('large_fleet = 240h', () => {
    expect(slaWindowHours('model_proposed', 'large_fleet')).toBe(240);
  });
  it('multi_jurisdiction_fleet = 480h', () => {
    expect(slaWindowHours('model_proposed', 'multi_jurisdiction_fleet')).toBe(480);
  });
  it('fleet_systemic = 720h', () => {
    expect(slaWindowHours('model_proposed', 'fleet_systemic')).toBe(720);
  });

  it('INVERTED polarity holds at model_proposed (single < small < large < multi < systemic)', () => {
    expect(slaWindowHours('model_proposed', 'single_asset')).toBeLessThan(slaWindowHours('model_proposed', 'small_fleet'));
    expect(slaWindowHours('model_proposed', 'small_fleet')).toBeLessThan(slaWindowHours('model_proposed', 'large_fleet'));
    expect(slaWindowHours('model_proposed', 'large_fleet')).toBeLessThan(slaWindowHours('model_proposed', 'multi_jurisdiction_fleet'));
    expect(slaWindowHours('model_proposed', 'multi_jurisdiction_fleet')).toBeLessThan(slaWindowHours('model_proposed', 'fleet_systemic'));
  });

  it('hard terminals have zero SLA', () => {
    for (const t of ['single_asset', 'small_fleet', 'large_fleet', 'multi_jurisdiction_fleet', 'fleet_systemic'] as const) {
      expect(slaWindowHours('archived', t)).toBe(0);
      expect(slaWindowHours('rolled_back', t)).toBe(0);
      expect(slaWindowHours('recalled', t)).toBe(0);
    }
  });

  it('SLA_HOURS covers all 16 chain_status values', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(16);
  });

  it('slaDeadlineFor adds the window in milliseconds', () => {
    const start = new Date('2026-05-30T00:00:00Z');
    const dl = slaDeadlineFor('model_proposed', 'small_fleet', start);
    expect(dl).not.toBeNull();
    expect(dl!.getTime() - start.getTime()).toBe(96 * 3600 * 1000);
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
    // model_proposed/small_fleet=96h - 12h elapsed = 84h
    expect(slaHoursRemaining('model_proposed', 'small_fleet', entered, now)).toBe(84);
  });

  it('slaHoursRemaining returns 0 if no entered timestamp', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(slaHoursRemaining('model_proposed', 'small_fleet', null, now)).toBe(0);
  });
});

describe('W127 - tier derivation from (assets, jurisdictions, safety_critical)', () => {
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

describe('W127 - FLOOR flag thresholds (>=1 large_fleet, >=3 fleet_systemic)', () => {
  it('countFloorFlags counts truthy flags', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ safety_critical_inference: true })).toBe(1);
    expect(countFloorFlags({
      safety_critical_inference: true,
      regulator_reportable_drift: true,
    })).toBe(2);
    expect(countFloorFlags({
      safety_critical_inference: true,
      regulator_reportable_drift: true,
      nerc_cip_audit_in_scope: true,
      sox_ml_governance_required: true,
      iso_42001_ai_management_required: true,
    })).toBe(5);
  });

  it('handles numeric 1/0 the same as boolean', () => {
    expect(countFloorFlags({ safety_critical_inference: 1, sox_ml_governance_required: 1 })).toBe(2);
    expect(countFloorFlags({ safety_critical_inference: 0 })).toBe(0);
  });

  it('floorAtLargeFleet triggers at >=1 flag', () => {
    expect(floorAtLargeFleet({})).toBe(false);
    expect(floorAtLargeFleet({ safety_critical_inference: true })).toBe(true);
    expect(floorAtLargeFleet({ regulator_reportable_drift: true })).toBe(true);
  });

  it('floorAtFleetSystemic triggers only at >=3 flags', () => {
    expect(floorAtFleetSystemic({ safety_critical_inference: true })).toBe(false);
    expect(floorAtFleetSystemic({
      safety_critical_inference: true,
      regulator_reportable_drift: true,
    })).toBe(false);
    expect(floorAtFleetSystemic({
      safety_critical_inference: true,
      regulator_reportable_drift: true,
      nerc_cip_audit_in_scope: true,
    })).toBe(true);
  });
});

describe('W127 - effectiveTier with FLOOR lifting', () => {
  it('zero flags -> raw tier preserved', () => {
    expect(effectiveTier('single_asset', {})).toBe('single_asset');
    expect(effectiveTier('small_fleet', {})).toBe('small_fleet');
    expect(effectiveTier('large_fleet', {})).toBe('large_fleet');
  });

  it('1 flag lifts to large_fleet if below', () => {
    expect(effectiveTier('single_asset', { safety_critical_inference: true })).toBe('large_fleet');
    expect(effectiveTier('small_fleet', { regulator_reportable_drift: true })).toBe('large_fleet');
  });

  it('1 flag preserves tier if already at large_fleet or higher', () => {
    expect(effectiveTier('large_fleet', { safety_critical_inference: true })).toBe('large_fleet');
    expect(effectiveTier('multi_jurisdiction_fleet', { sox_ml_governance_required: true })).toBe('multi_jurisdiction_fleet');
    expect(effectiveTier('fleet_systemic', { iso_42001_ai_management_required: true })).toBe('fleet_systemic');
  });

  it('3+ flags lift all the way to fleet_systemic', () => {
    expect(effectiveTier('single_asset', {
      safety_critical_inference: true,
      regulator_reportable_drift: true,
      nerc_cip_audit_in_scope: true,
    })).toBe('fleet_systemic');
    expect(effectiveTier('small_fleet', {
      safety_critical_inference: true,
      regulator_reportable_drift: true,
      sox_ml_governance_required: true,
      iso_42001_ai_management_required: true,
    })).toBe('fleet_systemic');
  });
});

describe('W127 - heavy tier helpers', () => {
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

describe('W127 - SIGNATURE W127-ML-ROLLBACK regulator crossings', () => {
  it('rollback_model crosses regulator at EVERY tier (signature)', () => {
    for (const t of ['single_asset', 'small_fleet', 'large_fleet', 'multi_jurisdiction_fleet', 'fleet_systemic'] as const) {
      expect(crossesIntoRegulator('rollback_model', t, {})).toBe(true);
    }
  });

  it('rollback_model crosses regardless of any floor flag', () => {
    expect(crossesIntoRegulator('rollback_model', 'single_asset', { flags: {} })).toBe(true);
    expect(crossesIntoRegulator('rollback_model', 'fleet_systemic', {
      flags: { safety_critical_inference: true },
    })).toBe(true);
  });

  it('recall_model crosses regulator at EVERY tier WHEN safety_critical_inference', () => {
    for (const t of ['single_asset', 'small_fleet', 'large_fleet', 'multi_jurisdiction_fleet', 'fleet_systemic'] as const) {
      expect(crossesIntoRegulator('recall_model', t, { flags: { safety_critical_inference: true } })).toBe(true);
    }
  });

  it('recall_model does NOT cross without safety_critical_inference', () => {
    expect(crossesIntoRegulator('recall_model', 'fleet_systemic', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('recall_model', 'single_asset', {
      flags: { regulator_reportable_drift: true, sox_ml_governance_required: true },
    })).toBe(false);
  });

  it('detect_drift crosses regulator only on heavy tiers WHEN regulator_reportable_drift', () => {
    expect(crossesIntoRegulator('detect_drift', 'large_fleet', {
      flags: { regulator_reportable_drift: true },
    })).toBe(true);
    expect(crossesIntoRegulator('detect_drift', 'multi_jurisdiction_fleet', {
      flags: { regulator_reportable_drift: true },
    })).toBe(true);
    expect(crossesIntoRegulator('detect_drift', 'fleet_systemic', {
      flags: { regulator_reportable_drift: true },
    })).toBe(true);
  });

  it('detect_drift does NOT cross on light tiers even with flag', () => {
    expect(crossesIntoRegulator('detect_drift', 'single_asset', {
      flags: { regulator_reportable_drift: true },
    })).toBe(false);
    expect(crossesIntoRegulator('detect_drift', 'small_fleet', {
      flags: { regulator_reportable_drift: true },
    })).toBe(false);
  });

  it('detect_drift on heavy tier without regulator_reportable_drift does NOT cross', () => {
    expect(crossesIntoRegulator('detect_drift', 'fleet_systemic', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('detect_drift', 'large_fleet', {
      flags: { safety_critical_inference: true, nerc_cip_audit_in_scope: true },
    })).toBe(false);
  });

  it('activate_failover crosses regulator only on TOP heavy tiers', () => {
    expect(crossesIntoRegulator('activate_failover', 'multi_jurisdiction_fleet', {})).toBe(true);
    expect(crossesIntoRegulator('activate_failover', 'fleet_systemic', {})).toBe(true);
    expect(crossesIntoRegulator('activate_failover', 'large_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'small_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('activate_failover', 'single_asset', {})).toBe(false);
  });

  it('mundane actions never cross', () => {
    expect(crossesIntoRegulator('bind_dataset', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('engineer_features', 'multi_jurisdiction_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('split_train_test', 'large_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('train_model', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('backtest', 'large_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('calibrate', 'multi_jurisdiction_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('deploy_shadow', 'large_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('activate_live_ab', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('promote_champion', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('retrain', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('archive', 'fleet_systemic', {})).toBe(false);
  });
});

describe('W127 - SLA breach crossings (heavy only)', () => {
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

describe('W127 - party + event routing (4-step authority)', () => {
  it('ml_engineer owns proposal + dataset + features + split + train + backtest', () => {
    expect(partyForAction('propose_model')).toBe('ml_engineer');
    expect(partyForAction('bind_dataset')).toBe('ml_engineer');
    expect(partyForAction('engineer_features')).toBe('ml_engineer');
    expect(partyForAction('split_train_test')).toBe('ml_engineer');
    expect(partyForAction('train_model')).toBe('ml_engineer');
    expect(partyForAction('backtest')).toBe('ml_engineer');
  });

  it('data_steward owns calibrate + deploy_shadow + detect_drift + activate_failover', () => {
    expect(partyForAction('calibrate')).toBe('data_steward');
    expect(partyForAction('deploy_shadow')).toBe('data_steward');
    expect(partyForAction('detect_drift')).toBe('data_steward');
    expect(partyForAction('activate_failover')).toBe('data_steward');
  });

  it('CTO owns activate_live_ab + promote_champion + retrain + rollback_model', () => {
    expect(partyForAction('activate_live_ab')).toBe('CTO');
    expect(partyForAction('promote_champion')).toBe('CTO');
    expect(partyForAction('retrain')).toBe('CTO');
    expect(partyForAction('rollback_model')).toBe('CTO');
  });

  it('CEO owns archive + recall_model', () => {
    expect(partyForAction('archive')).toBe('CEO');
    expect(partyForAction('recall_model')).toBe('CEO');
  });

  it('eventTypeFor maps all 16 actions to events', () => {
    expect(eventTypeFor('propose_model')).toBe('anomaly_detection_ml_proposed');
    expect(eventTypeFor('bind_dataset')).toBe('anomaly_detection_ml_dataset_bound');
    expect(eventTypeFor('engineer_features')).toBe('anomaly_detection_ml_features_engineered');
    expect(eventTypeFor('split_train_test')).toBe('anomaly_detection_ml_train_test_split');
    expect(eventTypeFor('train_model')).toBe('anomaly_detection_ml_trained');
    expect(eventTypeFor('backtest')).toBe('anomaly_detection_ml_backtest_validated');
    expect(eventTypeFor('calibrate')).toBe('anomaly_detection_ml_calibrated');
    expect(eventTypeFor('deploy_shadow')).toBe('anomaly_detection_ml_shadow_deployed');
    expect(eventTypeFor('activate_live_ab')).toBe('anomaly_detection_ml_live_ab_active');
    expect(eventTypeFor('promote_champion')).toBe('anomaly_detection_ml_champion_promoted');
    expect(eventTypeFor('retrain')).toBe('anomaly_detection_ml_retrained');
    expect(eventTypeFor('archive')).toBe('anomaly_detection_ml_archived');
    expect(eventTypeFor('detect_drift')).toBe('anomaly_detection_ml_drift_detected');
    expect(eventTypeFor('rollback_model')).toBe('anomaly_detection_ml_rolled_back');
    expect(eventTypeFor('recall_model')).toBe('anomaly_detection_ml_recalled');
    expect(eventTypeFor('activate_failover')).toBe('anomaly_detection_ml_failover_activated');
  });
});

describe('W127 - urgency band INVERTED polarity', () => {
  it('safety_critical_inference short-circuits to systemic regardless of tier', () => {
    expect(urgencyBand('single_asset', 100, { safety_critical_inference: true })).toBe('systemic');
    expect(urgencyBand('fleet_systemic', 1000, { safety_critical_inference: true })).toBe('systemic');
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

describe('W127 - authority ladder by tier', () => {
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

describe('W127 - days helpers (retrain + model-card)', () => {
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

describe('W127 - 5-bridge architecture', () => {
  it('bridgesToW71AssetPrognostics true when ref present', () => {
    expect(bridgesToW71AssetPrognostics('aprog-001')).toBe(true);
    expect(bridgesToW71AssetPrognostics(null)).toBe(false);
    expect(bridgesToW71AssetPrognostics('')).toBe(false);
  });

  it('bridgesToW12SiteCommissioning true when ref present', () => {
    expect(bridgesToW12SiteCommissioning('com-001')).toBe(true);
    expect(bridgesToW12SiteCommissioning(null)).toBe(false);
  });

  it('bridgesToW126GovernmentFiling true when ref present', () => {
    expect(bridgesToW126GovernmentFiling('gfc-001')).toBe(true);
    expect(bridgesToW126GovernmentFiling(null)).toBe(false);
  });

  it('bridgesToW74NersaLevy true when ref present', () => {
    expect(bridgesToW74NersaLevy('levy-001')).toBe(true);
    expect(bridgesToW74NersaLevy(null)).toBe(false);
  });

  it('bridgesToW118AuditChain true when block ref present (MANDATORY)', () => {
    expect(bridgesToW118AuditChain('block-001')).toBe(true);
    expect(bridgesToW118AuditChain(null)).toBe(false);
  });
});

describe('W127 - controlEffectivenessIndex 0-130 composite', () => {
  it('empty / zeroed args yields a low but valid score', () => {
    const s = controlEffectivenessIndex({});
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(130);
  });

  it('clamps to 130 ceiling under max signals', () => {
    const s = controlEffectivenessIndex({
      precision_at_k: 1,
      recall_at_k: 1,
      false_positive_rate: 0,
      drift_psi: 0,
      drift_ks: 0,
      champion_vs_challenger_lift: 2.0,
      inference_latency_p50_ms: 0,
      inference_latency_p99_ms: 0,
      inference_throughput_per_sec: 1000,
      reconciliation_with_w71_heuristic_pct: 100,
      ntt_baseline_comparison_pct: 50,
      iso_42001_compliance_score: 130,
      model_card_status: 'published',
      iso27001_controls_ok: true,
      soc2_type2_controls_ok: true,
    });
    expect(s).toBeLessThanOrEqual(130);
    expect(s).toBeGreaterThan(110);
  });

  it('precision + recall lift score', () => {
    const lo = controlEffectivenessIndex({ precision_at_k: 0, recall_at_k: 0 });
    const hi = controlEffectivenessIndex({ precision_at_k: 1, recall_at_k: 1 });
    expect(hi).toBeGreaterThan(lo);
  });

  it('high drift_psi reduces score', () => {
    const lo_drift = controlEffectivenessIndex({ drift_psi: 0 });
    const hi_drift = controlEffectivenessIndex({ drift_psi: 0.5 });
    expect(lo_drift).toBeGreaterThan(hi_drift);
  });

  it('high false positive rate reduces score', () => {
    const low_fpr = controlEffectivenessIndex({ false_positive_rate: 0 });
    const hi_fpr = controlEffectivenessIndex({ false_positive_rate: 0.1 });
    expect(low_fpr).toBeGreaterThan(hi_fpr);
  });

  it('model_card published > approved > draft', () => {
    const pub = controlEffectivenessIndex({ model_card_status: 'published' });
    const appr = controlEffectivenessIndex({ model_card_status: 'approved' });
    const draft = controlEffectivenessIndex({ model_card_status: 'draft' });
    expect(pub).toBeGreaterThan(appr);
    expect(appr).toBeGreaterThan(draft);
  });

  it('ISO 27001 + SOC2 binary signals add to score', () => {
    const without = controlEffectivenessIndex({ precision_at_k: 0.5 });
    const withBoth = controlEffectivenessIndex({
      precision_at_k: 0.5,
      iso27001_controls_ok: true,
      soc2_type2_controls_ok: true,
    });
    expect(withBoth).toBeGreaterThan(without);
  });

  it('never returns negative score', () => {
    const s = controlEffectivenessIndex({
      precision_at_k: 0,
      recall_at_k: 0,
      false_positive_rate: 1,
      drift_psi: 1,
      drift_ks: 1,
    });
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

describe('W127 - modelHealthBand composite', () => {
  it('recalled -> critical regardless of other signals', () => {
    expect(modelHealthBand('recalled', 130, false, 365, 365, {}, 0, 0, 'published')).toBe('critical');
  });

  it('rolled_back -> critical regardless of other signals', () => {
    expect(modelHealthBand('rolled_back', 130, false, 365, 365, {}, 0, 0, 'published')).toBe('critical');
  });

  it('archived -> green (clean close)', () => {
    expect(modelHealthBand('archived', 0, true, 0, 0, {}, 0.5, 0.5, 'expired')).toBe('green');
  });

  it('SLA breach -> red', () => {
    expect(modelHealthBand('live_ab_active', 120, true, 365, 365, {}, 0, 0, 'published')).toBe('red');
  });

  it('drift_psi >= 0.25 -> red', () => {
    expect(modelHealthBand('live_ab_active', 120, false, 365, 365, {}, 0.30, 0, 'published')).toBe('red');
  });

  it('false_positive_rate > 0.05 -> red', () => {
    expect(modelHealthBand('live_ab_active', 120, false, 365, 365, {}, 0, 0.10, 'published')).toBe('red');
  });

  it('expired model card -> red', () => {
    expect(modelHealthBand('live_ab_active', 120, false, 365, 365, {}, 0, 0, 'expired')).toBe('red');
  });

  it('retrain due < 14 days -> red', () => {
    expect(modelHealthBand('live_ab_active', 120, false, 7, 365, {}, 0, 0, 'published')).toBe('red');
  });

  it('drift_detected -> amber when other signals clean', () => {
    expect(modelHealthBand('drift_detected', 100, false, 365, 365, {}, 0, 0, 'published')).toBe('amber');
  });

  it('failover_to_baseline -> amber when other signals clean', () => {
    expect(modelHealthBand('failover_to_baseline', 100, false, 365, 365, {}, 0, 0, 'published')).toBe('amber');
  });

  it('green when all signals clean', () => {
    expect(modelHealthBand('live_ab_active', 110, false, 365, 365, {}, 0.02, 0.01, 'published')).toBe('green');
  });

  it('drift_psi in 0.10..0.25 -> amber', () => {
    expect(modelHealthBand('live_ab_active', 100, false, 365, 365, {}, 0.15, 0, 'published')).toBe('amber');
  });
});

describe('W127 - taxonomy guards (7 families, 10 asset classes)', () => {
  it('ANOMALY_DETECTION_MODEL_FAMILIES has 7 entries', () => {
    expect(ANOMALY_DETECTION_MODEL_FAMILIES).toHaveLength(7);
  });

  it('isKnownModelFamily accepts canonical families', () => {
    expect(isKnownModelFamily('lstm_autoencoder')).toBe(true);
    expect(isKnownModelFamily('transformer_autoencoder')).toBe(true);
    expect(isKnownModelFamily('variational_autoencoder')).toBe(true);
    expect(isKnownModelFamily('isolation_forest_ensemble')).toBe(true);
    expect(isKnownModelFamily('one_class_svm')).toBe(true);
    expect(isKnownModelFamily('prophet_residual')).toBe(true);
    expect(isKnownModelFamily('baseline_heuristic')).toBe(true);
  });

  it('isKnownModelFamily rejects unknown / null', () => {
    expect(isKnownModelFamily('gpt5_autoencoder')).toBe(false);
    expect(isKnownModelFamily(null)).toBe(false);
    expect(isKnownModelFamily('')).toBe(false);
    expect(isKnownModelFamily(undefined)).toBe(false);
  });

  it('ANOMALY_DETECTION_ASSET_CLASSES has 10 entries', () => {
    expect(ANOMALY_DETECTION_ASSET_CLASSES).toHaveLength(10);
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
});
