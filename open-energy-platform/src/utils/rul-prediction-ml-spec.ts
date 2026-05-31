// ─────────────────────────────────────────────────────────────────────────
// Wave 128 - RUL Prediction ML Model lifecycle chain.
//
// PHASE D WAVE 2 OF 4. Survival/Cox PH ML models REPLACING the W71
// OLS-style degradation slope. Sister of W127 (which replaces the W71
// 6-method anomaly heuristic with real anomaly-detection ML).
//
// Where W127 wires ANOMALY-detection ML, W128 wires SURVIVAL / RUL
// (remaining-useful-life) prediction - the OTHER half of W71. Cox PH
// proportional-hazards / accelerated-failure-time / DeepSurv / Random-
// Survival-Forest / XGBoost-Survival models against the same SCADA /
// IIoT / settlement / ERP / filing streams Phase C wired.
//
// Standards covered:
//   - ISO 42001 AI Management Systems
//   - NIST AI Risk Management Framework
//   - EU AI Act (high-risk Annex III energy infrastructure)
//   - ISO 27001 information security
//   - SOC 2 Type II controls
//   - NERC CIP-013 OT supply-chain
//   - SOX ML governance (audit-evidence chain)
//
// Beats: AspenTech Mtell RUL / GE APM survival / Uptake Fusion
// prognostics / Augury RUL / C3.ai reliability / SparkCognition
// SparkPredict RUL / Petuum / DataRPM survival stacks. Maintains
// reconciliation with the W71 OLS baseline for monotonic-replacement
// proof (KM-lift-vs-OLS).
//
// 12-state forward path + 4 branch states (= 16 chain states):
//   model_proposed -> survival_dataset_bound -> features_engineered ->
//     train_test_split -> model_trained -> backtest_validated ->
//     calibrated -> shadow_deployed -> live_ab_active ->
//     champion_promoted -> retrained -> archived (HARD)
//   any non-terminal -> detect_drift -> drift_detected (SOFT)
//   any non-terminal -> rollback_model -> rolled_back (HARD)
//   any non-terminal -> recall_model -> recalled (HARD - safety)
//   live -> activate_failover_to_ols -> failover_to_ols (SOFT)
//
// Tier RE-DERIVED on every transition from
//   tierForScope(assets_covered, jurisdiction_count, safety_critical)
// with FLOOR-AT-LARGE-FLEET on >=1 of 5 contextual flags;
// FLOOR-AT-FLEET-SYSTEMIC on >=3 flags:
//   - safety_critical_rul                  (safety-critical RUL output)
//   - regulator_reportable_rul_quantile    (RUL p10/p50/p90 reported to reg)
//   - nerc_cip_audit_in_scope              (NERC CIP-013 OT supply-chain)
//   - sox_ml_governance_required           (SOX ML governance evidence)
//   - iso_42001_ai_management_required     (ISO 42001 AIMS scope)
//
// 5 tiers (INVERTED polarity - LARGER fleet scope = MORE training +
// review time. LONGER shadow window than W127 because survival models
// need to observe censored-event maturation before promoting):
//   single_asset              : 24h
//   small_fleet               : 96h
//   large_fleet               : 240h
//   multi_jurisdiction_fleet  : 480h
//   fleet_systemic            : 720h
//
// SIGNATURE W128 regulator crossings (ISO 42001 + NIST AI RMF +
// EU AI Act + NERC CIP-013 + SOX):
//   rollback_model -> EVERY tier (W128 SIGNATURE W128-RUL-ROLLBACK
//     hard line - second Phase-D hard line.)
//   recall_model -> EVERY tier WHEN safety_critical_rul
//   detect_drift -> large_fleet + multi_jurisdiction_fleet +
//     fleet_systemic ONLY when regulator_reportable_rul_quantile OR
//     (PH-assumption-violated AND fleet_systemic).
//   activate_failover_to_ols -> multi_jurisdiction_fleet +
//     fleet_systemic only (top tiers only).
//   sla_breached -> large_fleet + multi_jurisdiction_fleet +
//     fleet_systemic only.
//   promote_champion -> fleet_systemic WHEN iso_42001_ai_management
//     _required (W128-UNIQUE - replacing OLS at national systemic
//     scale is itself a regulator-reportable governance event;
//     W127 does NOT have a promote_champion crossing).
//
// Write {admin, support} (2 writers - SAME AS W71 / W127). READ all 9
// personas. NO public peer endpoint - INTERNAL ML governance chain.
//
// actor_party split (4-step authority ladder):
//   ml_engineer    : propose_model / bind_survival_dataset /
//                    engineer_features / split_train_test /
//                    train_model / backtest
//   data_steward   : calibrate / deploy_shadow / detect_drift /
//                    activate_failover_to_ols
//   CTO            : activate_live_ab / promote_champion / retrain /
//                    rollback_model
//   CEO            : archive / recall_model
//
// Event prefix: `rul_prediction_ml_evt_`. AUDIT_PREFIX_MAP entry:
// rul_prediction_ml: 'ml' (JOINS W127 'ml' namespace - same Phase-D
// ML governance family).
//
// Three crons:
//   - */15 * * * *        SLA sweep (shared with all chains)
//   - 0 3 * * *           daily concordance-monitor (NEW - 03:00 UTC =
//                         05:00 SAST, 30 min after W127 drift scan so
//                         survival models see fresh anomaly-flagged
//                         events for censoring decisions)
//   - 0 7 * * 1           weekly model-card expiry scan (shared
//                         with W122/W123/W124/W125/W126/W127 trigger)
//
// Five bridges (W71 NOT NULL + W118 MANDATORY):
//   W71 asset prognostics NOT NULL (the OLS baseline this REPLACES -
//   needed for KM-lift + reconciliation. Strict NOT NULL constraint
//   because every survival model MUST be reconcilable against the
//   prior OLS trend.) + W21 lender drawdown (when survival prediction
//   affects debt service forecast) + W77 reserve account (when RUL
//   shortens maintenance reserve burndown) + W63 warranty recovery
//   (when RUL truncation triggers supplier-recovery claim) + W118
//   audit chain (MANDATORY - every model version hashed into W118).
// ─────────────────────────────────────────────────────────────────────────

export type RpmStatus =
  | 'model_proposed'
  | 'survival_dataset_bound'
  | 'features_engineered'
  | 'train_test_split'
  | 'model_trained'
  | 'backtest_validated'
  | 'calibrated'
  | 'shadow_deployed'
  | 'live_ab_active'
  | 'champion_promoted'
  | 'retrained'
  | 'archived'
  | 'drift_detected'
  | 'rolled_back'
  | 'recalled'
  | 'failover_to_ols';

export type RpmAction =
  | 'propose_model'
  | 'bind_survival_dataset'
  | 'engineer_features'
  | 'split_train_test'
  | 'train_model'
  | 'backtest'
  | 'calibrate'
  | 'deploy_shadow'
  | 'activate_live_ab'
  | 'promote_champion'
  | 'retrain'
  | 'archive'
  | 'detect_drift'
  | 'rollback_model'
  | 'recall_model'
  | 'activate_failover_to_ols';

export type RpmTier =
  | 'single_asset'
  | 'small_fleet'
  | 'large_fleet'
  | 'multi_jurisdiction_fleet'
  | 'fleet_systemic';

export type RpmParty =
  | 'ml_engineer'
  | 'data_steward'
  | 'CTO'
  | 'CEO';

export type RpmEvent =
  | 'rul_prediction_ml_proposed'
  | 'rul_prediction_ml_survival_dataset_bound'
  | 'rul_prediction_ml_features_engineered'
  | 'rul_prediction_ml_train_test_split'
  | 'rul_prediction_ml_trained'
  | 'rul_prediction_ml_backtest_validated'
  | 'rul_prediction_ml_calibrated'
  | 'rul_prediction_ml_shadow_deployed'
  | 'rul_prediction_ml_live_ab_active'
  | 'rul_prediction_ml_champion_promoted'
  | 'rul_prediction_ml_retrained'
  | 'rul_prediction_ml_archived'
  | 'rul_prediction_ml_drift_detected'
  | 'rul_prediction_ml_rolled_back'
  | 'rul_prediction_ml_recalled'
  | 'rul_prediction_ml_failover_to_ols_activated'
  | 'rul_prediction_ml_sla_breached';

// HARD terminals: archived (clean close), rolled_back (champion bad),
// recalled (safety pull). drift_detected and failover_to_ols are
// SOFT pauses that can recover.
const HARD_TERMINALS = new Set<RpmStatus>([
  'archived',
  'rolled_back',
  'recalled',
]);

export function isTerminal(s: RpmStatus): boolean {
  return HARD_TERMINALS.has(s);
}

export function isHardTerminal(s: RpmStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: RpmStatus[] = [
  'model_proposed',
  'survival_dataset_bound',
  'features_engineered',
  'train_test_split',
  'model_trained',
  'backtest_validated',
  'calibrated',
  'shadow_deployed',
  'live_ab_active',
  'champion_promoted',
  'retrained',
  'drift_detected',
  'failover_to_ols',
];

// detect_drift can be entered from any active state where inference is
// already happening (shadow / live / champion / retrained / failover).
const DRIFT_FROM: RpmStatus[] = [
  'shadow_deployed',
  'live_ab_active',
  'champion_promoted',
  'retrained',
  'failover_to_ols',
];

// activate_failover_to_ols only applies to live or champion (post live).
const FAILOVER_FROM: RpmStatus[] = [
  'live_ab_active',
  'champion_promoted',
  'retrained',
];

export const TRANSITIONS: Record<RpmAction, { from: RpmStatus[]; to: RpmStatus }> = {
  propose_model:               { from: ['model_proposed'],                                                                                  to: 'model_proposed' },
  bind_survival_dataset:       { from: ['model_proposed', 'survival_dataset_bound'],                                                        to: 'survival_dataset_bound' },
  engineer_features:           { from: ['survival_dataset_bound', 'features_engineered'],                                                   to: 'features_engineered' },
  split_train_test:            { from: ['features_engineered', 'train_test_split'],                                                         to: 'train_test_split' },
  train_model:                 { from: ['train_test_split', 'model_trained'],                                                               to: 'model_trained' },
  backtest:                    { from: ['model_trained', 'backtest_validated'],                                                             to: 'backtest_validated' },
  calibrate:                   { from: ['backtest_validated', 'calibrated'],                                                                to: 'calibrated' },
  deploy_shadow:               { from: ['calibrated', 'shadow_deployed'],                                                                   to: 'shadow_deployed' },
  activate_live_ab:            { from: ['shadow_deployed', 'live_ab_active', 'drift_detected', 'failover_to_ols'],                          to: 'live_ab_active' },
  promote_champion:            { from: ['live_ab_active', 'champion_promoted'],                                                             to: 'champion_promoted' },
  retrain:                     { from: ['champion_promoted', 'retrained', 'drift_detected'],                                                to: 'retrained' },
  archive:                     { from: ['champion_promoted', 'retrained'],                                                                  to: 'archived' },
  detect_drift:                { from: DRIFT_FROM,                                                                                          to: 'drift_detected' },
  rollback_model:              { from: ALL_NON_TERMINAL,                                                                                    to: 'rolled_back' },
  recall_model:                { from: ALL_NON_TERMINAL,                                                                                    to: 'recalled' },
  activate_failover_to_ols:    { from: FAILOVER_FROM,                                                                                       to: 'failover_to_ols' },
};

export function nextStatus(current: RpmStatus, action: RpmAction): RpmStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_model' && current !== 'model_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: RpmStatus): RpmAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: RpmAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [RpmAction, typeof TRANSITIONS[RpmAction]][]) {
    if (a === 'propose_model') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger fleet
// scope = LONGER training + review runway. LONGER survival_dataset_bound
// (48-720h) and LONGER shadow_deployed (72-1080h) than W127 because
// survival models need censored-event maturation before promotion.
export const SLA_HOURS: Record<RpmStatus, Record<RpmTier, number>> = {
  // ANCHOR: model_proposed - the proposal window.
  model_proposed:            { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  // LONGER than W127 dataset_bound (survival censoring takes time).
  survival_dataset_bound:    { single_asset: 48,  small_fleet: 168, large_fleet: 360, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  features_engineered:       { single_asset: 24,  small_fleet: 96,  large_fleet: 192, multi_jurisdiction_fleet: 360, fleet_systemic: 480 },
  train_test_split:          { single_asset: 12,  small_fleet: 48,  large_fleet: 96,  multi_jurisdiction_fleet: 168, fleet_systemic: 240 },
  model_trained:             { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 360, fleet_systemic: 480 },
  backtest_validated:        { single_asset: 12,  small_fleet: 48,  large_fleet: 72,  multi_jurisdiction_fleet: 144, fleet_systemic: 192 },
  calibrated:                { single_asset: 24,  small_fleet: 72,  large_fleet: 240, multi_jurisdiction_fleet: 360, fleet_systemic: 480 },
  // LONGER than W127 shadow (survival needs event-maturation observation).
  shadow_deployed:           { single_asset: 72,  small_fleet: 240, large_fleet: 480, multi_jurisdiction_fleet: 720, fleet_systemic: 1080 },
  live_ab_active:            { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  champion_promoted:         { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  retrained:                 { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  drift_detected:            { single_asset: 24,  small_fleet: 48,  large_fleet: 96,  multi_jurisdiction_fleet: 168, fleet_systemic: 240 },
  failover_to_ols:           { single_asset: 24,  small_fleet: 72,  large_fleet: 144, multi_jurisdiction_fleet: 240, fleet_systemic: 360 },
  archived:                  { single_asset: 0,   small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
  rolled_back:               { single_asset: 0,   small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
  recalled:                  { single_asset: 0,   small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
};

export function slaWindowHours(status: RpmStatus, tier: RpmTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: RpmStatus, tier: RpmTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from (assets_covered, jurisdiction_count, safety_critical).
//   <=1 asset -> single_asset
//   2-20 assets / <=1 juris -> small_fleet
//   21+ assets / <=1 juris -> large_fleet
//   2+ jurisdictions -> multi_jurisdiction_fleet
//   3+ jurisdictions OR safety_critical_national -> fleet_systemic
export function tierForScope(args: {
  assets_covered?: number | null;
  jurisdiction_count?: number | null;
  safety_critical?: boolean | number | null;
}): RpmTier {
  const assets = Number(args.assets_covered || 0);
  const juris = Number(args.jurisdiction_count || 0);
  const safety = !!args.safety_critical;
  if (safety && juris >= 3)        return 'fleet_systemic';
  if (juris >= 3)                  return 'fleet_systemic';
  if (juris >= 2)                  return 'multi_jurisdiction_fleet';
  if (assets >= 21)                return 'large_fleet';
  if (assets >= 2)                 return 'small_fleet';
  return 'single_asset';
}

export interface RpmFloorFlags {
  safety_critical_rul?: boolean | number | null;
  regulator_reportable_rul_quantile?: boolean | number | null;
  nerc_cip_audit_in_scope?: boolean | number | null;
  sox_ml_governance_required?: boolean | number | null;
  iso_42001_ai_management_required?: boolean | number | null;
}

export function countFloorFlags(args: RpmFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.safety_critical_rul) +
    t(args.regulator_reportable_rul_quantile) +
    t(args.nerc_cip_audit_in_scope) +
    t(args.sox_ml_governance_required) +
    t(args.iso_42001_ai_management_required)
  );
}

// FLOOR-AT-LARGE-FLEET on >=1 flag.
export function floorAtLargeFleet(args: RpmFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-FLEET-SYSTEMIC on >=3 flags.
export function floorAtFleetSystemic(args: RpmFloorFlags): boolean {
  return countFloorFlags(args) >= 3;
}

// Tier ordering for promotion logic - higher index = longer SLA window
// + heavier scrutiny.
const TIER_RANK: Record<RpmTier, number> = {
  single_asset: 0,
  small_fleet: 1,
  large_fleet: 2,
  multi_jurisdiction_fleet: 3,
  fleet_systemic: 4,
};

export function effectiveTier(
  rawTier: RpmTier,
  flags: RpmFloorFlags,
): RpmTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 3) return 'fleet_systemic';
  if (flagCount >= 1) {
    if (TIER_RANK[rawTier] >= TIER_RANK['large_fleet']) return rawTier;
    return 'large_fleet';
  }
  return rawTier;
}

// Heavy tiers - large_fleet + multi_jurisdiction_fleet + fleet_systemic.
const HEAVY_TIERS = new Set<RpmTier>(['large_fleet', 'multi_jurisdiction_fleet', 'fleet_systemic']);
const TOP_HEAVY_TIERS = new Set<RpmTier>(['multi_jurisdiction_fleet', 'fleet_systemic']);

export function isHeavyTier(tier: RpmTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: RpmTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W128 SIGNATURE: rollback_model crosses regulator EVERY tier - the
// W128-RUL-ROLLBACK hard line. SECOND Phase-D hard line (W127 was first).
// Model rollback is always reportable. ISO 42001 incident + NIST AI
// RMF MAP-MEASURE-MANAGE notice + SOC 2 control failure + audit-
// evidence-chain reconciliation mandatory.
//
// Additional:
//   recall_model -> EVERY tier WHEN safety_critical_rul
//   detect_drift -> HEAVY tiers ONLY WHEN
//                   regulator_reportable_rul_quantile OR
//                   (PH-assumption-violated AND fleet_systemic)
//   activate_failover_to_ols -> multi_jurisdiction + fleet_systemic only
//   promote_champion -> fleet_systemic WHEN iso_42001 (W128-UNIQUE -
//                       replacing OLS at systemic scale is itself a
//                       governance event under ISO 42001)
//   sla_breached -> HEAVY tiers only
export function crossesIntoRegulator(
  action: RpmAction,
  tier: RpmTier,
  args: {
    flags?: RpmFloorFlags;
    ph_assumption_violated?: boolean | number | null;
  },
): boolean {
  const flags = args.flags ?? {};
  const phViolated = !!args.ph_assumption_violated;

  // W128 SIGNATURE W128-RUL-ROLLBACK: rollback_model EVERY tier.
  if (action === 'rollback_model') {
    return true;
  }

  // recall_model -> EVERY tier WHEN safety_critical_rul.
  if (action === 'recall_model') {
    return !!flags.safety_critical_rul;
  }

  // detect_drift -> HEAVY tiers WHEN regulator_reportable_rul_quantile
  // OR (PH-violated AND fleet_systemic).
  if (action === 'detect_drift') {
    if (!HEAVY_TIERS.has(tier)) return false;
    if (flags.regulator_reportable_rul_quantile) return true;
    if (phViolated && tier === 'fleet_systemic') return true;
    return false;
  }

  // activate_failover_to_ols -> multi_jurisdiction + fleet_systemic only.
  if (action === 'activate_failover_to_ols') {
    return TOP_HEAVY_TIERS.has(tier);
  }

  // W128-UNIQUE: promote_champion -> fleet_systemic WHEN iso_42001.
  if (action === 'promote_champion') {
    return tier === 'fleet_systemic' && !!flags.iso_42001_ai_management_required;
  }

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: RpmTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<RpmAction, RpmParty> = {
  propose_model:               'ml_engineer',
  bind_survival_dataset:       'ml_engineer',
  engineer_features:           'ml_engineer',
  split_train_test:            'ml_engineer',
  train_model:                 'ml_engineer',
  backtest:                    'ml_engineer',
  calibrate:                   'data_steward',
  deploy_shadow:               'data_steward',
  activate_live_ab:            'CTO',
  promote_champion:            'CTO',
  retrain:                     'CTO',
  archive:                     'CEO',
  detect_drift:                'data_steward',
  rollback_model:              'CTO',
  recall_model:                'CEO',
  activate_failover_to_ols:    'data_steward',
};

export function partyForAction(action: RpmAction): RpmParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: RpmAction): RpmEvent | null {
  switch (action) {
    case 'propose_model':               return 'rul_prediction_ml_proposed';
    case 'bind_survival_dataset':       return 'rul_prediction_ml_survival_dataset_bound';
    case 'engineer_features':           return 'rul_prediction_ml_features_engineered';
    case 'split_train_test':            return 'rul_prediction_ml_train_test_split';
    case 'train_model':                 return 'rul_prediction_ml_trained';
    case 'backtest':                    return 'rul_prediction_ml_backtest_validated';
    case 'calibrate':                   return 'rul_prediction_ml_calibrated';
    case 'deploy_shadow':               return 'rul_prediction_ml_shadow_deployed';
    case 'activate_live_ab':            return 'rul_prediction_ml_live_ab_active';
    case 'promote_champion':            return 'rul_prediction_ml_champion_promoted';
    case 'retrain':                     return 'rul_prediction_ml_retrained';
    case 'archive':                     return 'rul_prediction_ml_archived';
    case 'detect_drift':                return 'rul_prediction_ml_drift_detected';
    case 'rollback_model':              return 'rul_prediction_ml_rolled_back';
    case 'recall_model':                return 'rul_prediction_ml_recalled';
    case 'activate_failover_to_ols':    return 'rul_prediction_ml_failover_to_ols_activated';
  }
}

// ─── LIVE battery (~28 fields decorated at fetch) ───────────────────────

export function slaHoursRemaining(
  status: RpmStatus,
  tier: RpmTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type RpmUrgency = 'critical' | 'high' | 'medium' | 'low' | 'systemic';

// INVERTED polarity: fleet_systemic has LOOSEST urgency thresholds.
// safety_critical_rul or NERC-CIP-013 flag immediately bumps urgency
// to 'systemic' (safety/OT sensitivity).
export function urgencyBand(
  tier: RpmTier,
  slaHoursLeft: number,
  flags?: RpmFloorFlags,
): RpmUrgency {
  if (flags && (flags.safety_critical_rul || flags.nerc_cip_audit_in_scope)) {
    return 'systemic';
  }
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'fleet_systemic') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 96)  return 'high';
    if (slaHoursLeft < 240) return 'medium';
    return 'low';
  }
  if (tier === 'multi_jurisdiction_fleet') {
    if (slaHoursLeft < 18)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  if (tier === 'large_fleet') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 48)  return 'high';
    if (slaHoursLeft < 96)  return 'medium';
    return 'low';
  }
  if (tier === 'small_fleet') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  // single_asset - TIGHTEST INVERTED-polarity thresholds.
  if (slaHoursLeft < 4)     return 'critical';
  if (slaHoursLeft < 12)    return 'high';
  if (slaHoursLeft < 24)    return 'medium';
  return 'low';
}

// 4-step authority ladder.
export type RpmAuthority =
  | 'ml_engineer'
  | 'data_steward'
  | 'CTO'
  | 'CEO';

export function authorityRequired(tier: RpmTier): RpmAuthority {
  if (tier === 'fleet_systemic')              return 'CEO';
  if (tier === 'multi_jurisdiction_fleet')    return 'CTO';
  if (tier === 'large_fleet')                 return 'data_steward';
  if (tier === 'small_fleet')                 return 'ml_engineer';
  return 'ml_engineer';
}

// Days until retrain due (90-day rolling).
export function daysToRetrainDue(retrainDueAt: string | null | undefined, now: Date): number {
  if (!retrainDueAt) return 9999;
  const expiry = new Date(retrainDueAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

// Days until model-card expiry (annual ISO 42001 rolling).
export function daysToModelCardExpiry(modelCardExpiryAt: string | null | undefined, now: Date): number {
  if (!modelCardExpiryAt) return 9999;
  const expiry = new Date(modelCardExpiryAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

// ─── 5-bridge architecture (W71 NOT NULL + W21 + W77 + W63 + W118) ──────
//
// W71 NOT NULL (OLS baseline being replaced - reconciliation mandatory).
// W118 MANDATORY (tamper-evidence audit hash). Other bridges activate
// when RUL output affects downstream financial chains:
// W21 lender drawdown / W77 reserve account (RUL shortens maintenance
// reserve burndown) / W63 warranty recovery (RUL truncation triggers
// supplier-recovery claim).
export function bridgesToW71AssetPrognostics(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW21LenderDrawdown(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW77ReserveAccount(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW63WarrantyRecovery(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW118AuditChain(blockRef: string | null | undefined): boolean {
  return !!blockRef;
}

// ─── Control effectiveness index 0-130 ──────────────────────────────────
//
// Scores the LIVE survival model health. Three-component composite:
// survival performance (concordance / td-AUC / Brier / partial
// likelihood / PH-test p-value) + drift + reconciliation-with-W71-OLS
// + binary governance signals (ISO 42001 + SOC 2 + ISO 27001 +
// model_card_status).
export function controlEffectivenessIndex(args: {
  concordance_index?: number | null;
  time_dependent_auc?: number | null;
  brier_score?: number | null;
  partial_likelihood?: number | null;
  ph_assumption_pvalue?: number | null;
  kaplan_meier_lift_vs_ols?: number | null;
  rul_p50_mae_days?: number | null;
  censoring_rate?: number | null;
  reconciliation_with_w71_ols_pct?: number | null;
  ntt_baseline_comparison_pct?: number | null;
  iso_42001_compliance_score?: number | null;
  model_card_status?: 'draft' | 'approved' | 'published' | 'expired' | null;
  iso27001_controls_ok?: boolean | number | null;
  soc2_type2_controls_ok?: boolean | number | null;
}): number {
  const n = (v: number | null | undefined, min: number, max: number): number => {
    const x = Number(v || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(min, Math.min(max, x));
  };
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  // Harrell concordance index (0.5 baseline, 1.0 perfect, 14 pts).
  const c = n(args.concordance_index, 0.5, 1.0);
  score += Math.round(((c - 0.5) / 0.5) * 14);
  // Time-dependent AUC (0.5 baseline, 1.0 perfect, 12 pts).
  const tdauc = n(args.time_dependent_auc, 0.5, 1.0);
  score += Math.round(((tdauc - 0.5) / 0.5) * 12);
  // Brier score (lower better, 0 ideal, 0.25 worst, 10 pts).
  const brier = n(args.brier_score, 0, 0.25);
  score += Math.round((1 - brier / 0.25) * 10);
  // Partial likelihood (higher better, -inf..0, normalised, 6 pts).
  const pl = n(args.partial_likelihood, -1000, 0);
  score += Math.round(((pl + 1000) / 1000) * 6);
  // PH assumption p-value (>0.05 = PH OK; <0.05 = violated, 6 pts).
  const php = n(args.ph_assumption_pvalue, 0, 1);
  score += php >= 0.05 ? 6 : 0;
  // KM lift vs OLS (-50 to +50% normalised to 10 pts).
  const kmlift = n(args.kaplan_meier_lift_vs_ols, -50, 50);
  score += Math.round(((kmlift + 50) / 100) * 10);
  // RUL p50 MAE in days (lower better, 0 ideal, 90d worst, 8 pts).
  const mae = n(args.rul_p50_mae_days, 0, 90);
  score += Math.round((1 - mae / 90) * 8);
  // Censoring rate (target ~0.3, penalise extremes, 5 pts).
  const cens = n(args.censoring_rate, 0, 1);
  const censPenalty = Math.abs(cens - 0.3);
  score += Math.round((1 - censPenalty / 0.7) * 5);
  // Reconciliation with W71 OLS (0-100% normalised to 12 pts).
  const recw71 = n(args.reconciliation_with_w71_ols_pct, 0, 100);
  score += Math.round((recw71 / 100) * 12);
  // NTT baseline comparison (-50 to +50% normalised to 8 pts).
  const ntt = n(args.ntt_baseline_comparison_pct, -50, 50);
  score += Math.round(((ntt + 50) / 100) * 8);
  // ISO 42001 compliance score (0-130 normalised to 8 pts).
  const iso = n(args.iso_42001_compliance_score, 0, 130);
  score += Math.round((iso / 130) * 8);
  // Model card status.
  if (args.model_card_status === 'published') score += 10;
  else if (args.model_card_status === 'approved') score += 6;
  else if (args.model_card_status === 'draft') score += 2;
  // Binary governance signals.
  score += t(args.iso27001_controls_ok)     * 5;
  score += t(args.soc2_type2_controls_ok)   * 5;
  if (score > 130) score = 130;
  if (score < 0) score = 0;
  return score;
}

// ─── Model health band - composite ──────────────────────────────────────
export type RpmHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function modelHealthBand(
  status: RpmStatus,
  controlScore: number,
  slaBreached: boolean,
  retrainDueDays: number,
  modelCardExpiryDays: number,
  flags: RpmFloorFlags,
  concordanceIndex: number,
  phPValue: number,
  modelCardStatus: 'draft' | 'approved' | 'published' | 'expired' | null | undefined,
): RpmHealthBand {
  if (status === 'recalled') return 'critical';
  if (status === 'rolled_back') return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (modelCardStatus === 'expired') return 'red';
  if (concordanceIndex < 0.6) return 'red';
  if (phPValue < 0.01) return 'red';
  if (retrainDueDays < 14) return 'red';
  if (modelCardExpiryDays < 14) return 'red';
  if (status === 'failover_to_ols') return 'amber';
  if (status === 'drift_detected') return 'amber';
  if (countFloorFlags(flags) >= 3 && controlScore < 90) return 'amber';
  if (controlScore < 60) return 'red';
  if (retrainDueDays < 60) return 'amber';
  if (modelCardExpiryDays < 60) return 'amber';
  if (concordanceIndex < 0.7) return 'amber';
  if (phPValue < 0.05) return 'amber';
  if (controlScore < 90) return 'amber';
  return 'green';
}

// Known survival model family universe.
export const RUL_PREDICTION_MODEL_FAMILIES = [
  'cox_ph',
  'aft',
  'deepsurv',
  'rsf',
  'xgb_surv',
  'baseline_ols',
] as const;

export type RulPredictionModelFamily = typeof RUL_PREDICTION_MODEL_FAMILIES[number];

export function isKnownModelFamily(s: string | null | undefined): s is RulPredictionModelFamily {
  if (!s) return false;
  return (RUL_PREDICTION_MODEL_FAMILIES as readonly string[]).includes(s);
}

// Known asset-class universe.
export const RUL_PREDICTION_ASSET_CLASSES = [
  'wind_turbine',
  'pv_inverter',
  'battery_storage',
  'transformer',
  'transmission_line',
  'substation',
  'hydrogen_electrolyser',
  'grid_scada',
  'smart_meter',
  'generic',
] as const;

export type RulPredictionAssetClass = typeof RUL_PREDICTION_ASSET_CLASSES[number];

export function isKnownAssetClass(s: string | null | undefined): s is RulPredictionAssetClass {
  if (!s) return false;
  return (RUL_PREDICTION_ASSET_CLASSES as readonly string[]).includes(s);
}
