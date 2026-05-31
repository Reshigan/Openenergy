// Wave 130 - NTT Comparison Battery chain spec battery.
//
// PHASE D WAVE 4 OF 4 - CLOSES PHASE D. AGGREGATOR over W127 (anomaly
// LSTM-AE) + W128 (RUL Cox PH) + W129 (fault-fingerprint multi-class)
// against an emulated NTT IoT/O&M baseline. Each row = one COMPARISON
// CYCLE (typically nightly). Joins the W127 'ml' audit namespace.
//
// Covers: 12-state forward + 4-branch machine, 16-action TRANSITIONS,
// INVERTED SLA polarity anchored at cycle_proposed (12/48/120/240/480h),
// TIGHTER than W127-W129 because cycles run NIGHTLY. Tier derivation,
// FLOOR-AT-LARGE-FLEET on >=1 of 5 flags, FLOOR-AT-FLEET-SYSTEMIC on >=3
// flags, effectiveTier with FLOOR lifting, heavy tier helpers,
// W130 SIGNATURE (recall_certification EVERY tier - sister of
// W127/W128/W129 rollback signatures); publish_audit EVERY tier WHEN
// regulator_reportable_diversion; certify_savings top-heavy ONLY WHEN
// ntt_contract_renegotiation_trigger; flag_significance_failure
// fleet_systemic only; sla_breached HEAVY only. Party + event routing
// (4-step: ml_analyst / data_steward / CTO / CEO), authority ladder,
// urgency band INVERTED (single_asset tightest;
// regulator_reportable_diversion / sox_ml_governance_required
// short-circuits to systemic), daysToNextCycle, daysToModelCardExpiry,
// 5-bridge architecture (W127 + W128 + W129 + W71 control + W118
// MANDATORY), control effectiveness 0-130 composite with comparison
// metrics (savings_vs_ntt_pct, paired_t_pvalue, wilcoxon_pvalue,
// brier_skill_score_vs_ntt, confidence_interval_width_zar,
// reconciliation_with_w71_savings_ledger_pct, false_positive_savings_zar,
// false_negative_savings_zar), battery health band composite, sustained
// trigger constants (NTT_CONTRACT_RENEG_CONSECUTIVE_CYCLES=4,
// MATERIAL_SAVINGS_FLOOR_ZAR=10M,
// REGULATOR_DIVERSION_DISAGREEMENT_FLOOR_PCT=5,
// NTT_SAVINGS_TARGET_PCT=30).

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
} from '../src/utils/ntt-comparison-battery-spec';

describe('W130 NTT comparison battery - state machine forward path', () => {
  it('walks cycle_proposed -> archived through all 12 forward states', () => {
    expect(nextStatus('cycle_proposed', 'sync_baselines')).toBe('baselines_synced');
    expect(nextStatus('baselines_synced', 'bind_telemetry_window')).toBe('telemetry_window_bound');
    expect(nextStatus('telemetry_window_bound', 'run_ntt_emulation')).toBe('ntt_emulation_run');
    expect(nextStatus('ntt_emulation_run', 'collect_champion_predictions')).toBe('champion_predictions_collected');
    expect(nextStatus('champion_predictions_collected', 'compute_counterfactuals')).toBe('counterfactuals_computed');
    expect(nextStatus('counterfactuals_computed', 'revenue_weight_score')).toBe('revenue_weighted_scored');
    expect(nextStatus('revenue_weighted_scored', 'test_significance')).toBe('significance_tested');
    expect(nextStatus('significance_tested', 'certify_savings')).toBe('savings_certified');
    expect(nextStatus('savings_certified', 'publish_audit')).toBe('audit_published');
    expect(nextStatus('audit_published', 'trigger_retraining')).toBe('retraining_triggered');
    expect(nextStatus('retraining_triggered', 'archive')).toBe('archived');
  });

  it('blocks forward skips', () => {
    expect(nextStatus('cycle_proposed', 'bind_telemetry_window')).toBeNull();
    expect(nextStatus('baselines_synced', 'run_ntt_emulation')).toBeNull();
    expect(nextStatus('telemetry_window_bound', 'collect_champion_predictions')).toBeNull();
    expect(nextStatus('ntt_emulation_run', 'compute_counterfactuals')).toBeNull();
    expect(nextStatus('champion_predictions_collected', 'revenue_weight_score')).toBeNull();
    expect(nextStatus('counterfactuals_computed', 'test_significance')).toBeNull();
    expect(nextStatus('revenue_weighted_scored', 'certify_savings')).toBeNull();
    expect(nextStatus('significance_tested', 'publish_audit')).toBeNull();
    expect(nextStatus('savings_certified', 'trigger_retraining')).toBeNull();
  });

  it('archive also allowed direct from audit_published (skip retraining)', () => {
    expect(nextStatus('audit_published', 'archive')).toBe('archived');
  });
});

describe('W130 - branch states (significance_failure / rollback / recall / failover)', () => {
  it('flag_significance_failure only from revenue_weighted_scored or significance_tested', () => {
    expect(nextStatus('revenue_weighted_scored', 'flag_significance_failure')).toBe('significance_failed');
    expect(nextStatus('significance_tested', 'flag_significance_failure')).toBe('significance_failed');
  });

  it('flag_significance_failure NOT allowed from pre-scoring states', () => {
    expect(nextStatus('cycle_proposed', 'flag_significance_failure')).toBeNull();
    expect(nextStatus('baselines_synced', 'flag_significance_failure')).toBeNull();
    expect(nextStatus('ntt_emulation_run', 'flag_significance_failure')).toBeNull();
    expect(nextStatus('counterfactuals_computed', 'flag_significance_failure')).toBeNull();
  });

  it('test_significance can re-enter from significance_failed', () => {
    expect(nextStatus('significance_failed', 'test_significance')).toBe('significance_tested');
  });

  it('rollback_cycle from any non-terminal -> rolled_back', () => {
    expect(nextStatus('cycle_proposed', 'rollback_cycle')).toBe('rolled_back');
    expect(nextStatus('baselines_synced', 'rollback_cycle')).toBe('rolled_back');
    expect(nextStatus('ntt_emulation_run', 'rollback_cycle')).toBe('rolled_back');
    expect(nextStatus('counterfactuals_computed', 'rollback_cycle')).toBe('rolled_back');
    expect(nextStatus('savings_certified', 'rollback_cycle')).toBe('rolled_back');
    expect(nextStatus('audit_published', 'rollback_cycle')).toBe('rolled_back');
    expect(nextStatus('retraining_triggered', 'rollback_cycle')).toBe('rolled_back');
    expect(nextStatus('significance_failed', 'rollback_cycle')).toBe('rolled_back');
    expect(nextStatus('failover_to_prior_cycle', 'rollback_cycle')).toBe('rolled_back');
  });

  it('recall_certification from any non-terminal -> recalled', () => {
    expect(nextStatus('cycle_proposed', 'recall_certification')).toBe('recalled');
    expect(nextStatus('savings_certified', 'recall_certification')).toBe('recalled');
    expect(nextStatus('audit_published', 'recall_certification')).toBe('recalled');
    expect(nextStatus('retraining_triggered', 'recall_certification')).toBe('recalled');
    expect(nextStatus('failover_to_prior_cycle', 'recall_certification')).toBe('recalled');
  });

  it('activate_failover only from savings_certified / audit_published / retraining_triggered', () => {
    expect(nextStatus('savings_certified', 'activate_failover')).toBe('failover_to_prior_cycle');
    expect(nextStatus('audit_published', 'activate_failover')).toBe('failover_to_prior_cycle');
    expect(nextStatus('retraining_triggered', 'activate_failover')).toBe('failover_to_prior_cycle');
  });

  it('activate_failover NOT allowed from pre-certified states', () => {
    expect(nextStatus('cycle_proposed', 'activate_failover')).toBeNull();
    expect(nextStatus('baselines_synced', 'activate_failover')).toBeNull();
    expect(nextStatus('counterfactuals_computed', 'activate_failover')).toBeNull();
    expect(nextStatus('significance_tested', 'activate_failover')).toBeNull();
    expect(nextStatus('significance_failed', 'activate_failover')).toBeNull();
  });

  it('trigger_retraining can be entered from failover_to_prior_cycle', () => {
    expect(nextStatus('failover_to_prior_cycle', 'trigger_retraining')).toBe('retraining_triggered');
  });
});

describe('W130 - hard terminals (archived / rolled_back / recalled)', () => {
  it('isHardTerminal recognises archived', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isTerminal('archived')).toBe(true);
  });

  it('isHardTerminal recognises rolled_back', () => {
    expect(isHardTerminal('rolled_back')).toBe(true);
  });

  it('isHardTerminal recognises recalled', () => {
    expect(isHardTerminal('recalled')).toBe(true);
  });

  it('hard terminals block all actions', () => {
    expect(nextStatus('archived', 'sync_baselines')).toBeNull();
    expect(nextStatus('rolled_back', 'test_significance')).toBeNull();
    expect(nextStatus('recalled', 'certify_savings')).toBeNull();
    expect(allowedActions('archived')).toEqual([]);
    expect(allowedActions('rolled_back')).toEqual([]);
    expect(allowedActions('recalled')).toEqual([]);
  });

  it('significance_failed and failover_to_prior_cycle are SOFT (not hard terminal)', () => {
    expect(isHardTerminal('significance_failed')).toBe(false);
    expect(isHardTerminal('failover_to_prior_cycle')).toBe(false);
    expect(allowedActions('significance_failed').length).toBeGreaterThan(0);
    expect(allowedActions('failover_to_prior_cycle').length).toBeGreaterThan(0);
  });
});

describe('W130 - SLA hours table (INVERTED polarity, NIGHTLY-tight)', () => {
  it('SLA anchors at cycle_proposed (12 / 48 / 120 / 240 / 480 hours)', () => {
    expect(SLA_HOURS.cycle_proposed.single_asset).toBe(12);
    expect(SLA_HOURS.cycle_proposed.small_fleet).toBe(48);
    expect(SLA_HOURS.cycle_proposed.large_fleet).toBe(120);
    expect(SLA_HOURS.cycle_proposed.multi_jurisdiction_fleet).toBe(240);
    expect(SLA_HOURS.cycle_proposed.fleet_systemic).toBe(480);
  });

  it('larger tier always gets MORE time (INVERTED polarity)', () => {
    for (const status of Object.keys(SLA_HOURS) as Array<keyof typeof SLA_HOURS>) {
      const row = SLA_HOURS[status];
      // Skip terminal rows (all zeros).
      if (row.single_asset === 0 && row.fleet_systemic === 0) continue;
      expect(row.small_fleet).toBeGreaterThanOrEqual(row.single_asset);
      expect(row.large_fleet).toBeGreaterThanOrEqual(row.small_fleet);
      expect(row.multi_jurisdiction_fleet).toBeGreaterThanOrEqual(row.large_fleet);
      expect(row.fleet_systemic).toBeGreaterThanOrEqual(row.multi_jurisdiction_fleet);
    }
  });

  it('all 3 terminal states are 0h across all tiers (no SLA)', () => {
    for (const tier of ['single_asset', 'small_fleet', 'large_fleet', 'multi_jurisdiction_fleet', 'fleet_systemic'] as const) {
      expect(SLA_HOURS.archived[tier]).toBe(0);
      expect(SLA_HOURS.rolled_back[tier]).toBe(0);
      expect(SLA_HOURS.recalled[tier]).toBe(0);
    }
  });

  it('slaWindowHours returns table value', () => {
    expect(slaWindowHours('cycle_proposed', 'fleet_systemic')).toBe(480);
    expect(slaWindowHours('audit_published', 'large_fleet')).toBe(168);
    expect(slaWindowHours('archived', 'fleet_systemic')).toBe(0);
  });

  it('slaDeadlineFor returns now+hours; 0 SLA returns null', () => {
    const base = new Date('2026-05-15T00:00:00Z');
    const dl = slaDeadlineFor('cycle_proposed', 'single_asset', base);
    expect(dl?.toISOString()).toBe('2026-05-15T12:00:00.000Z');
    expect(slaDeadlineFor('archived', 'fleet_systemic', base)).toBeNull();
  });

  it('TIGHTER than W127 (W127 cycle_proposed single_asset is 720h; W130 is 12h)', () => {
    // Sanity check: W130 single_asset cycle_proposed is 12h - much
    // tighter because cycles run NIGHTLY (12h must leave room for the
    // 06:15 SAST nightly runner to advance the chain).
    expect(SLA_HOURS.cycle_proposed.single_asset).toBeLessThan(720);
    expect(SLA_HOURS.cycle_proposed.fleet_systemic).toBeLessThan(900);
  });

  it('slaHoursRemaining returns positive when deadline ahead, negative past', () => {
    const enteredAt = new Date('2026-05-15T00:00:00Z');
    const nowAhead = new Date('2026-05-15T06:00:00Z');
    const nowPast = new Date('2026-05-15T18:00:00Z');
    expect(slaHoursRemaining('cycle_proposed', 'single_asset', enteredAt, nowAhead)).toBe(6);
    expect(slaHoursRemaining('cycle_proposed', 'single_asset', enteredAt, nowPast)).toBe(-6);
    expect(slaHoursRemaining('archived', 'fleet_systemic', enteredAt, nowAhead)).toBe(0);
    expect(slaHoursRemaining('cycle_proposed', 'single_asset', null, nowAhead)).toBe(0);
  });
});

describe('W130 - tierForScope derivation', () => {
  it('single_asset: assets <= 1, no juris escalation', () => {
    expect(tierForScope({ assets_covered: 0, jurisdiction_count: 0 })).toBe('single_asset');
    expect(tierForScope({ assets_covered: 1, jurisdiction_count: 1 })).toBe('single_asset');
  });

  it('small_fleet: 2-20 assets, juris <= 1', () => {
    expect(tierForScope({ assets_covered: 2, jurisdiction_count: 1 })).toBe('small_fleet');
    expect(tierForScope({ assets_covered: 20, jurisdiction_count: 1 })).toBe('small_fleet');
  });

  it('large_fleet: 21+ assets, juris <= 1', () => {
    expect(tierForScope({ assets_covered: 21, jurisdiction_count: 1 })).toBe('large_fleet');
    expect(tierForScope({ assets_covered: 200, jurisdiction_count: 1 })).toBe('large_fleet');
  });

  it('multi_jurisdiction_fleet: juris == 2', () => {
    expect(tierForScope({ assets_covered: 50, jurisdiction_count: 2 })).toBe('multi_jurisdiction_fleet');
    expect(tierForScope({ assets_covered: 1, jurisdiction_count: 2 })).toBe('multi_jurisdiction_fleet');
  });

  it('fleet_systemic: juris >= 3 OR safety_critical+juris>=3', () => {
    expect(tierForScope({ assets_covered: 100, jurisdiction_count: 3 })).toBe('fleet_systemic');
    expect(tierForScope({ assets_covered: 100, jurisdiction_count: 5 })).toBe('fleet_systemic');
    expect(tierForScope({ assets_covered: 100, jurisdiction_count: 4, safety_critical: true })).toBe('fleet_systemic');
  });
});

describe('W130 - floor flags (5 contextual)', () => {
  it('countFloorFlags counts truthy of 5', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ material_savings_threshold_breached: true })).toBe(1);
    expect(countFloorFlags({
      material_savings_threshold_breached: true,
      ntt_contract_renegotiation_trigger: true,
    })).toBe(2);
    expect(countFloorFlags({
      material_savings_threshold_breached: true,
      ntt_contract_renegotiation_trigger: true,
      regulator_reportable_diversion: true,
      sox_ml_governance_required: true,
      iso_42001_required: true,
    })).toBe(5);
  });

  it('floorAtLargeFleet true on >=1 flag', () => {
    expect(floorAtLargeFleet({})).toBe(false);
    expect(floorAtLargeFleet({ material_savings_threshold_breached: true })).toBe(true);
    expect(floorAtLargeFleet({ iso_42001_required: true })).toBe(true);
  });

  it('floorAtFleetSystemic true on >=3 flags', () => {
    expect(floorAtFleetSystemic({})).toBe(false);
    expect(floorAtFleetSystemic({
      material_savings_threshold_breached: true,
      ntt_contract_renegotiation_trigger: true,
    })).toBe(false);
    expect(floorAtFleetSystemic({
      material_savings_threshold_breached: true,
      ntt_contract_renegotiation_trigger: true,
      sox_ml_governance_required: true,
    })).toBe(true);
    expect(floorAtFleetSystemic({
      material_savings_threshold_breached: true,
      ntt_contract_renegotiation_trigger: true,
      regulator_reportable_diversion: true,
      sox_ml_governance_required: true,
      iso_42001_required: true,
    })).toBe(true);
  });
});

describe('W130 - effectiveTier FLOOR lifting', () => {
  it('no flags: rawTier unchanged', () => {
    expect(effectiveTier('single_asset', {})).toBe('single_asset');
    expect(effectiveTier('small_fleet', {})).toBe('small_fleet');
    expect(effectiveTier('large_fleet', {})).toBe('large_fleet');
  });

  it('>=1 flag lifts single_asset/small_fleet to large_fleet', () => {
    expect(effectiveTier('single_asset', { material_savings_threshold_breached: true })).toBe('large_fleet');
    expect(effectiveTier('small_fleet', { ntt_contract_renegotiation_trigger: true })).toBe('large_fleet');
  });

  it('>=1 flag does NOT downgrade large_fleet+', () => {
    expect(effectiveTier('large_fleet', { material_savings_threshold_breached: true })).toBe('large_fleet');
    expect(effectiveTier('multi_jurisdiction_fleet', { ntt_contract_renegotiation_trigger: true })).toBe('multi_jurisdiction_fleet');
    expect(effectiveTier('fleet_systemic', { iso_42001_required: true })).toBe('fleet_systemic');
  });

  it('>=3 flags always lifts to fleet_systemic', () => {
    expect(effectiveTier('single_asset', {
      material_savings_threshold_breached: true,
      ntt_contract_renegotiation_trigger: true,
      sox_ml_governance_required: true,
    })).toBe('fleet_systemic');
    expect(effectiveTier('large_fleet', {
      material_savings_threshold_breached: true,
      regulator_reportable_diversion: true,
      iso_42001_required: true,
    })).toBe('fleet_systemic');
  });
});

describe('W130 - heavy / reportable tier helpers', () => {
  it('isHeavyTier picks large_fleet+', () => {
    expect(isHeavyTier('single_asset')).toBe(false);
    expect(isHeavyTier('small_fleet')).toBe(false);
    expect(isHeavyTier('large_fleet')).toBe(true);
    expect(isHeavyTier('multi_jurisdiction_fleet')).toBe(true);
    expect(isHeavyTier('fleet_systemic')).toBe(true);
  });

  it('isReportable equals isHeavyTier', () => {
    expect(isReportable('single_asset')).toBe(false);
    expect(isReportable('large_fleet')).toBe(true);
    expect(isReportable('fleet_systemic')).toBe(true);
  });
});

describe('W130 - regulator crossings SIGNATURE (recall_certification EVERY tier)', () => {
  it('recall_certification crosses EVERY tier (W130 SIGNATURE)', () => {
    expect(crossesIntoRegulator('recall_certification', 'single_asset', {})).toBe(true);
    expect(crossesIntoRegulator('recall_certification', 'small_fleet', {})).toBe(true);
    expect(crossesIntoRegulator('recall_certification', 'large_fleet', {})).toBe(true);
    expect(crossesIntoRegulator('recall_certification', 'multi_jurisdiction_fleet', {})).toBe(true);
    expect(crossesIntoRegulator('recall_certification', 'fleet_systemic', {})).toBe(true);
  });

  it('publish_audit crosses EVERY tier WHEN regulator_reportable_diversion', () => {
    const flags = { regulator_reportable_diversion: true };
    expect(crossesIntoRegulator('publish_audit', 'single_asset', { flags })).toBe(true);
    expect(crossesIntoRegulator('publish_audit', 'small_fleet', { flags })).toBe(true);
    expect(crossesIntoRegulator('publish_audit', 'large_fleet', { flags })).toBe(true);
    expect(crossesIntoRegulator('publish_audit', 'fleet_systemic', { flags })).toBe(true);
  });

  it('publish_audit does NOT cross when no regulator_reportable_diversion', () => {
    expect(crossesIntoRegulator('publish_audit', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('publish_audit', 'large_fleet', {})).toBe(false);
  });

  it('certify_savings crosses top-heavy ONLY WHEN ntt_contract_renegotiation_trigger', () => {
    const flags = { ntt_contract_renegotiation_trigger: true };
    expect(crossesIntoRegulator('certify_savings', 'single_asset', { flags })).toBe(false);
    expect(crossesIntoRegulator('certify_savings', 'small_fleet', { flags })).toBe(false);
    expect(crossesIntoRegulator('certify_savings', 'large_fleet', { flags })).toBe(false);
    expect(crossesIntoRegulator('certify_savings', 'multi_jurisdiction_fleet', { flags })).toBe(true);
    expect(crossesIntoRegulator('certify_savings', 'fleet_systemic', { flags })).toBe(true);
  });

  it('certify_savings does NOT cross without ntt_contract_renegotiation_trigger', () => {
    expect(crossesIntoRegulator('certify_savings', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('certify_savings', 'multi_jurisdiction_fleet', {})).toBe(false);
  });

  it('flag_significance_failure crosses fleet_systemic only', () => {
    expect(crossesIntoRegulator('flag_significance_failure', 'fleet_systemic', {})).toBe(true);
    expect(crossesIntoRegulator('flag_significance_failure', 'multi_jurisdiction_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('flag_significance_failure', 'large_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('flag_significance_failure', 'small_fleet', {})).toBe(false);
    expect(crossesIntoRegulator('flag_significance_failure', 'single_asset', {})).toBe(false);
  });

  it('forward-path actions never cross unless covered by SIGNATURE rules', () => {
    expect(crossesIntoRegulator('sync_baselines', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('run_ntt_emulation', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('compute_counterfactuals', 'fleet_systemic', {})).toBe(false);
    expect(crossesIntoRegulator('revenue_weight_score', 'fleet_systemic', {})).toBe(false);
  });

  it('sla_breach crossing limited to heavy tiers', () => {
    expect(slaBreachCrossesIntoRegulator('single_asset')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('small_fleet')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('large_fleet')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('multi_jurisdiction_fleet')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('fleet_systemic')).toBe(true);
  });
});

describe('W130 - party + event name routing', () => {
  it('4-step authority ladder: ml_analyst -> data_steward -> CTO -> CEO', () => {
    expect(partyForAction('propose_cycle')).toBe('ml_analyst');
    expect(partyForAction('sync_baselines')).toBe('ml_analyst');
    expect(partyForAction('bind_telemetry_window')).toBe('ml_analyst');
    expect(partyForAction('run_ntt_emulation')).toBe('ml_analyst');
    expect(partyForAction('collect_champion_predictions')).toBe('ml_analyst');
    expect(partyForAction('compute_counterfactuals')).toBe('ml_analyst');

    expect(partyForAction('revenue_weight_score')).toBe('data_steward');
    expect(partyForAction('test_significance')).toBe('data_steward');
    expect(partyForAction('flag_significance_failure')).toBe('data_steward');
    expect(partyForAction('activate_failover')).toBe('data_steward');

    expect(partyForAction('certify_savings')).toBe('CTO');
    expect(partyForAction('publish_audit')).toBe('CTO');
    expect(partyForAction('trigger_retraining')).toBe('CTO');
    expect(partyForAction('rollback_cycle')).toBe('CTO');

    expect(partyForAction('archive')).toBe('CEO');
    expect(partyForAction('recall_certification')).toBe('CEO');
  });

  it('event names all carry ntt_comparison_battery_ prefix', () => {
    expect(eventTypeFor('propose_cycle')).toBe('ntt_comparison_battery_cycle_proposed');
    expect(eventTypeFor('sync_baselines')).toBe('ntt_comparison_battery_baselines_synced');
    expect(eventTypeFor('certify_savings')).toBe('ntt_comparison_battery_savings_certified');
    expect(eventTypeFor('publish_audit')).toBe('ntt_comparison_battery_audit_published');
    expect(eventTypeFor('recall_certification')).toBe('ntt_comparison_battery_recalled');
    expect(eventTypeFor('rollback_cycle')).toBe('ntt_comparison_battery_rolled_back');
    expect(eventTypeFor('flag_significance_failure')).toBe('ntt_comparison_battery_significance_failed');
    expect(eventTypeFor('activate_failover')).toBe('ntt_comparison_battery_failover_to_prior_cycle');
  });

  it('authorityRequired follows tier ladder', () => {
    expect(authorityRequired('single_asset')).toBe('ml_analyst');
    expect(authorityRequired('small_fleet')).toBe('ml_analyst');
    expect(authorityRequired('large_fleet')).toBe('data_steward');
    expect(authorityRequired('multi_jurisdiction_fleet')).toBe('CTO');
    expect(authorityRequired('fleet_systemic')).toBe('CEO');
  });
});

describe('W130 - urgencyBand (INVERTED + reportable short-circuit)', () => {
  it('safety/regulator flag short-circuits to systemic regardless of slaHoursLeft', () => {
    expect(urgencyBand('single_asset', 100, { regulator_reportable_diversion: true })).toBe('systemic');
    expect(urgencyBand('fleet_systemic', 5, { sox_ml_governance_required: true })).toBe('systemic');
  });

  it('past-deadline (slaHoursLeft<0) returns critical (no short-circuit)', () => {
    expect(urgencyBand('single_asset', -1, {})).toBe('critical');
    expect(urgencyBand('fleet_systemic', -10, {})).toBe('critical');
  });

  it('fleet_systemic bands: <12 critical / <48 high / <120 medium / else low', () => {
    expect(urgencyBand('fleet_systemic', 6, {})).toBe('critical');
    expect(urgencyBand('fleet_systemic', 30, {})).toBe('high');
    expect(urgencyBand('fleet_systemic', 100, {})).toBe('medium');
    expect(urgencyBand('fleet_systemic', 400, {})).toBe('low');
  });

  it('single_asset bands tightest', () => {
    expect(urgencyBand('single_asset', 1, {})).toBe('critical');
    expect(urgencyBand('single_asset', 4, {})).toBe('high');
    expect(urgencyBand('single_asset', 8, {})).toBe('medium');
    expect(urgencyBand('single_asset', 20, {})).toBe('low');
  });
});

describe('W130 - days helpers', () => {
  it('daysToNextCycle handles null', () => {
    expect(daysToNextCycle(null, new Date('2026-05-15T00:00:00Z'))).toBe(9999);
    expect(daysToNextCycle(undefined, new Date('2026-05-15T00:00:00Z'))).toBe(9999);
  });

  it('daysToNextCycle returns positive whole days', () => {
    expect(daysToNextCycle('2026-05-16T00:00:00Z', new Date('2026-05-15T00:00:00Z'))).toBe(1);
    expect(daysToNextCycle('2026-05-22T00:00:00Z', new Date('2026-05-15T00:00:00Z'))).toBe(7);
  });

  it('daysToModelCardExpiry clamps at 0 for past dates', () => {
    expect(daysToModelCardExpiry('2026-05-01T00:00:00Z', new Date('2026-05-15T00:00:00Z'))).toBe(0);
  });
});

describe('W130 - 5-bridge architecture', () => {
  it('bridgesToW127AnomalyDetection truthy when ref set', () => {
    expect(bridgesToW127AnomalyDetection('adm-001')).toBe(true);
    expect(bridgesToW127AnomalyDetection(null)).toBe(false);
    expect(bridgesToW127AnomalyDetection(undefined)).toBe(false);
    expect(bridgesToW127AnomalyDetection('')).toBe(false);
  });

  it('bridgesToW128RulSurvival truthy when ref set', () => {
    expect(bridgesToW128RulSurvival('rsm-001')).toBe(true);
    expect(bridgesToW128RulSurvival(null)).toBe(false);
  });

  it('bridgesToW129FaultFingerprint truthy when ref set', () => {
    expect(bridgesToW129FaultFingerprint('ffm-001')).toBe(true);
    expect(bridgesToW129FaultFingerprint(null)).toBe(false);
  });

  it('bridgesToW71AssetPrognostics truthy when ref set (control variable)', () => {
    expect(bridgesToW71AssetPrognostics('aprog-001')).toBe(true);
    expect(bridgesToW71AssetPrognostics(null)).toBe(false);
  });

  it('bridgesToW118AuditChain truthy when block_ref set (MANDATORY)', () => {
    expect(bridgesToW118AuditChain('block-001')).toBe(true);
    expect(bridgesToW118AuditChain(null)).toBe(false);
  });
});

describe('W130 - controlEffectivenessIndex 0-130', () => {
  it('all zeros + no governance returns ~0', () => {
    const score = controlEffectivenessIndex({
      savings_vs_ntt_pct: -50,
      cumulative_savings_zar: 0,
      paired_t_pvalue: 0.5,
      wilcoxon_pvalue: 0.5,
      brier_skill_score_vs_ntt: -1,
      confidence_interval_width_zar: 20_000_000,
      reconciliation_with_w71_savings_ledger_pct: 0,
      false_positive_savings_zar: 5_000_000,
      false_negative_savings_zar: 5_000_000,
      iso_42001_compliance_score: 0,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(20);
  });

  it('high-quality cycle returns high score', () => {
    const score = controlEffectivenessIndex({
      savings_vs_ntt_pct: 35,
      cumulative_savings_zar: 100_000_000,
      paired_t_pvalue: 0.001,
      wilcoxon_pvalue: 0.002,
      brier_skill_score_vs_ntt: 0.8,
      confidence_interval_width_zar: 1_000_000,
      reconciliation_with_w71_savings_ledger_pct: 95,
      false_positive_savings_zar: 100_000,
      false_negative_savings_zar: 100_000,
      iso_42001_compliance_score: 120,
      model_card_status: 'published',
      iso27001_controls_ok: true,
      soc2_type2_controls_ok: true,
      sox_ml_governance_ok: true,
    });
    expect(score).toBeGreaterThanOrEqual(90);
    expect(score).toBeLessThanOrEqual(130);
  });

  it('clamps at 130', () => {
    const score = controlEffectivenessIndex({
      savings_vs_ntt_pct: 1000,
      cumulative_savings_zar: 1_000_000_000_000,
      paired_t_pvalue: 0,
      wilcoxon_pvalue: 0,
      brier_skill_score_vs_ntt: 1,
      confidence_interval_width_zar: 0,
      reconciliation_with_w71_savings_ledger_pct: 100,
      false_positive_savings_zar: 0,
      false_negative_savings_zar: 0,
      iso_42001_compliance_score: 130,
      model_card_status: 'published',
      iso27001_controls_ok: true,
      soc2_type2_controls_ok: true,
      sox_ml_governance_ok: true,
    });
    expect(score).toBeLessThanOrEqual(130);
  });
});

describe('W130 - batteryHealthBand composite', () => {
  it('recalled returns critical', () => {
    expect(batteryHealthBand('recalled', 100, false, 7, 90, {}, 30, 0.001, 'published')).toBe('critical');
  });

  it('rolled_back returns critical', () => {
    expect(batteryHealthBand('rolled_back', 100, false, 7, 90, {}, 30, 0.001, 'published')).toBe('critical');
  });

  it('archived returns green', () => {
    expect(batteryHealthBand('archived', 100, false, 7, 90, {}, 30, 0.001, 'published')).toBe('green');
  });

  it('SLA breach returns red', () => {
    expect(batteryHealthBand('savings_certified', 100, true, 7, 90, {}, 30, 0.001, 'published')).toBe('red');
  });

  it('failover_to_prior_cycle returns amber', () => {
    expect(batteryHealthBand('failover_to_prior_cycle', 100, false, 7, 90, {}, 30, 0.001, 'published')).toBe('amber');
  });

  it('significance_failed returns amber', () => {
    expect(batteryHealthBand('significance_failed', 100, false, 7, 90, {}, 30, 0.001, 'published')).toBe('amber');
  });

  it('healthy cycle returns green', () => {
    expect(batteryHealthBand('audit_published', 110, false, 1, 90, {}, 35, 0.001, 'published')).toBe('green');
  });

  it('low p-value still red if savings negative', () => {
    expect(batteryHealthBand('savings_certified', 100, false, 1, 90, {}, -5, 0.001, 'published')).toBe('red');
  });
});

describe('W130 - sustained-trigger + threshold constants', () => {
  it('NTT_CONTRACT_RENEG_CONSECUTIVE_CYCLES = 4', () => {
    expect(NTT_CONTRACT_RENEG_CONSECUTIVE_CYCLES).toBe(4);
  });

  it('MATERIAL_SAVINGS_FLOOR_ZAR = R10M', () => {
    expect(MATERIAL_SAVINGS_FLOOR_ZAR).toBe(10_000_000);
  });

  it('REGULATOR_DIVERSION_DISAGREEMENT_FLOOR_PCT = 5', () => {
    expect(REGULATOR_DIVERSION_DISAGREEMENT_FLOOR_PCT).toBe(5);
  });

  it('NTT_SAVINGS_TARGET_PCT = 30 (the project_esums_predictive_vs_ntt directive)', () => {
    expect(NTT_SAVINGS_TARGET_PCT).toBe(30);
  });
});

describe('W130 - TRANSITIONS table sanity', () => {
  it('has exactly 16 actions registered', () => {
    expect(Object.keys(TRANSITIONS).length).toBe(16);
  });

  it('all 16 actions have eventTypeFor mapping', () => {
    for (const a of Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>) {
      expect(eventTypeFor(a)).not.toBeNull();
    }
  });

  it('all 16 actions have partyForAction mapping', () => {
    for (const a of Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>) {
      expect(partyForAction(a)).toBeDefined();
    }
  });
});
