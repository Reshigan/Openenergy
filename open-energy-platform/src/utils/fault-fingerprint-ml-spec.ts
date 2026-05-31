// ─────────────────────────────────────────────────────────────────────────
// Wave 129 - Fault-Fingerprint Multi-Class ML chain.
//
// PHASE D WAVE 3 OF 4. Multi-class fault classifier REPLACING the W71
// 12-mode physics rules (inverter_igbt_degradation / dc_arc_fault /
// transformer_thermal / battery_thermal_runaway / panel_hotspot /
// blade_pitch_imbalance / gearbox_bearing / yaw_misalignment /
// tracker_motor / combiner_box / generator_winding /
// converter_capacitor_aging). Sister of W127 (anomaly ML replaces the
// W71 6-method anomaly heuristic) and W128 (survival ML replaces the
// W71 OLS degradation slope). Joins the W127 'ml' audit namespace.
//
// Standards covered:
//   - ISO 42001 AI Management Systems
//   - NIST AI Risk Management Framework
//   - EU AI Act (high-risk Annex III + Art 14 human oversight + Art 21
//     post-market monitoring; add_novel_class is a product-class change)
//   - ISO 27001 information security
//   - SOC 2 Type II controls
//   - NERC CIP-013 OT supply-chain
//   - SOX ML governance (audit-evidence chain)
//
// Beats: AspenTech Mtell fault classification / GE APM diagnostic
// codes / Uptake Fusion fault library / Augury fault dictionary /
// C3.ai fault models / SparkCognition SparkPredict classifiers /
// Petuum / DataRPM diagnostic stacks. Maintains
// reconciliation_with_w71_physics_pct for monotonic-replacement proof
// (% where ML top-1 == W71 rule top-1; falls to 0 on
// failover_to_physics_baseline).
//
// 12-state forward path + 4 branch states (= 16 chain states):
//   model_proposed -> labeled_dataset_bound -> class_imbalance_resolved
//     -> features_engineered -> train_test_split ->
//     multiclass_model_trained -> confusion_matrix_validated ->
//     calibrated -> shadow_deployed -> live_ab_active ->
//     champion_promoted -> retrained -> archived (HARD)
//   any inference-active -> detect_class_drift -> class_drift_detected (SOFT)
//   any non-terminal -> rollback_model -> rolled_back (HARD)
//   any non-terminal -> recall_model -> recalled (HARD - safety)
//   live -> failover_to_physics_baseline -> failover_to_physics_baseline (SOFT)
//   {confusion_matrix_validated, calibrated, shadow_deployed,
//    live_ab_active, champion_promoted, retrained, class_drift_detected}
//     -> add_novel_class -> multiclass_model_trained (RE-ENTRY, bumps
//     class_count+1, regenerates class_label_set_hash; EU AI Act Art 14
//     product-class change)
//
// Tier RE-DERIVED on every transition from
//   tierForScope(assets_covered, jurisdiction_count, safety_critical)
// with FLOOR-AT-LARGE-FLEET on >=1 of 5 contextual flags;
// FLOOR-AT-FLEET-SYSTEMIC on >=3 flags:
//   - safety_critical_fault_class      (fault class with HSE impact)
//   - regulator_reportable_misclass    (misclass triggers NERSA report)
//   - nerc_cip_audit_in_scope          (NERC CIP-013 OT supply-chain)
//   - sox_ml_governance_required       (SOX ML governance evidence)
//   - iso_42001_required               (ISO 42001 AIMS scope)
//
// 5 tiers (INVERTED polarity - LARGER fleet scope = MORE training +
// review time. Anchors BETWEEN W127's 720h and W128's 1080h:
//   single_asset              : 36h
//   small_fleet               : 120h
//   large_fleet               : 300h
//   multi_jurisdiction_fleet  : 600h
//   fleet_systemic            : 900h
//
// SIGNATURE W129 regulator crossings (ISO 42001 + NIST AI RMF +
// EU AI Act + NERC CIP-013 + SOX):
//   rollback_model -> EVERY tier (W129 inherits W127-ML-ROLLBACK Phase-D
//     hard line - THIRD Phase-D rollback signature, same hard line.)
//   recall_model -> EVERY tier WHEN safety_critical_fault_class
//   detect_class_drift -> large_fleet + multi_jurisdiction_fleet +
//     fleet_systemic ONLY when regulator_reportable_misclass
//   failover_to_physics_baseline -> multi_jurisdiction_fleet +
//     fleet_systemic only (top tiers only - W71 takes back inference).
//   add_novel_class -> fleet_systemic only (W129-UNIQUE - EU AI Act
//     Art 14 product-class change; ML system claims a brand-new
//     fault mode the model card did not advertise).
//   sla_breached -> large_fleet + multi_jurisdiction_fleet +
//     fleet_systemic only.
//
// Write {admin, support} (2 writers - SAME AS W71 / W127 / W128). READ
// all 9 personas. NO public peer endpoint - INTERNAL ML governance.
//
// actor_party split (4-step authority ladder):
//   ml_engineer    : propose_model / bind_labeled_dataset /
//                    resolve_class_imbalance / engineer_features /
//                    split_train_test / train_multiclass
//   data_steward   : validate_confusion_matrix / calibrate /
//                    deploy_shadow / detect_class_drift /
//                    failover_to_physics_baseline
//   CTO            : activate_live_ab / promote_champion / retrain /
//                    rollback_model / add_novel_class
//   CEO            : archive / recall_model
//
// Event prefix: `fault_fingerprint_ml_evt_`. AUDIT_PREFIX_MAP entry:
// fault_fingerprint_ml: 'ml' (JOINS W127 'ml' namespace).
//
// Three crons:
//   - */15 * * * *        SLA sweep (shared)
//   - 30 3 * * *          daily class-drift scan (NEW - 03:30 UTC =
//                         05:30 SAST, 30 min after W128 concordance
//                         monitor so class-PSI sees fresh survival-
//                         monitor flagged events)
//   - 0 7 * * 1           weekly model-card expiry scan (shared)
//
// Five bridges (W71 NOT NULL + W118 MANDATORY):
//   W71 asset prognostics NOT NULL (the 12-mode physics this REPLACES -
//   needed for reconciliation_with_w71_physics_pct + failover
//   target.) + W15 warranty/RMA (fault-mode evidence in claim packs) +
//   W41 ITIL problem management (RCA emerging from class) + W63
//   warranty recovery (supplier-recovery driven by class) + W118
//   audit chain (MANDATORY - every model version + class-label-set
//   hashed into W118).
// ─────────────────────────────────────────────────────────────────────────

export type FfmlStatus =
  | 'model_proposed'
  | 'labeled_dataset_bound'
  | 'class_imbalance_resolved'
  | 'features_engineered'
  | 'train_test_split'
  | 'multiclass_model_trained'
  | 'confusion_matrix_validated'
  | 'calibrated'
  | 'shadow_deployed'
  | 'live_ab_active'
  | 'champion_promoted'
  | 'retrained'
  | 'archived'
  | 'class_drift_detected'
  | 'rolled_back'
  | 'recalled'
  | 'failover_to_physics_baseline';

export type FfmlAction =
  | 'propose_model'
  | 'bind_labeled_dataset'
  | 'resolve_class_imbalance'
  | 'engineer_features'
  | 'split_train_test'
  | 'train_multiclass'
  | 'validate_confusion_matrix'
  | 'calibrate'
  | 'deploy_shadow'
  | 'activate_live_ab'
  | 'promote_champion'
  | 'retrain'
  | 'archive'
  | 'detect_class_drift'
  | 'rollback_model'
  | 'recall_model'
  | 'failover_to_physics_baseline'
  | 'add_novel_class';

export type FfmlTier =
  | 'single_asset'
  | 'small_fleet'
  | 'large_fleet'
  | 'multi_jurisdiction_fleet'
  | 'fleet_systemic';

export type FfmlParty =
  | 'ml_engineer'
  | 'data_steward'
  | 'CTO'
  | 'CEO';

export type FfmlEvent =
  | 'fault_fingerprint_ml_proposed'
  | 'fault_fingerprint_ml_labeled_dataset_bound'
  | 'fault_fingerprint_ml_class_imbalance_resolved'
  | 'fault_fingerprint_ml_features_engineered'
  | 'fault_fingerprint_ml_train_test_split'
  | 'fault_fingerprint_ml_multiclass_model_trained'
  | 'fault_fingerprint_ml_confusion_matrix_validated'
  | 'fault_fingerprint_ml_calibrated'
  | 'fault_fingerprint_ml_shadow_deployed'
  | 'fault_fingerprint_ml_live_ab_active'
  | 'fault_fingerprint_ml_champion_promoted'
  | 'fault_fingerprint_ml_retrained'
  | 'fault_fingerprint_ml_archived'
  | 'fault_fingerprint_ml_class_drift_detected'
  | 'fault_fingerprint_ml_rolled_back'
  | 'fault_fingerprint_ml_recalled'
  | 'fault_fingerprint_ml_failover_to_physics_baseline'
  | 'fault_fingerprint_ml_novel_class_added'
  | 'fault_fingerprint_ml_sla_breached';

const HARD_TERMINALS = new Set<FfmlStatus>([
  'archived',
  'rolled_back',
  'recalled',
]);

export function isTerminal(s: FfmlStatus): boolean {
  return HARD_TERMINALS.has(s);
}

export function isHardTerminal(s: FfmlStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: FfmlStatus[] = [
  'model_proposed',
  'labeled_dataset_bound',
  'class_imbalance_resolved',
  'features_engineered',
  'train_test_split',
  'multiclass_model_trained',
  'confusion_matrix_validated',
  'calibrated',
  'shadow_deployed',
  'live_ab_active',
  'champion_promoted',
  'retrained',
  'class_drift_detected',
  'failover_to_physics_baseline',
];

// detect_class_drift can fire from any inference-active state.
const DRIFT_FROM: FfmlStatus[] = [
  'shadow_deployed',
  'live_ab_active',
  'champion_promoted',
  'retrained',
  'failover_to_physics_baseline',
];

// failover_to_physics_baseline only from live / champion / retrained
// (an actively serving model is rolled back to W71 12-mode physics).
const FAILOVER_FROM: FfmlStatus[] = [
  'live_ab_active',
  'champion_promoted',
  'retrained',
];

// add_novel_class is a RE-ENTRY action: validated through systemic
// inference states it loops back to multiclass_model_trained (the
// model is RE-TRAINED on the expanded class set, bumping class_count
// and regenerating class_label_set_hash). EU AI Act Art 14 declares
// this a product-class change.
const NOVEL_CLASS_FROM: FfmlStatus[] = [
  'confusion_matrix_validated',
  'calibrated',
  'shadow_deployed',
  'live_ab_active',
  'champion_promoted',
  'retrained',
  'class_drift_detected',
];

export const TRANSITIONS: Record<FfmlAction, { from: FfmlStatus[]; to: FfmlStatus }> = {
  propose_model:                  { from: ['model_proposed'],                                                                                                                  to: 'model_proposed' },
  bind_labeled_dataset:           { from: ['model_proposed', 'labeled_dataset_bound'],                                                                                         to: 'labeled_dataset_bound' },
  resolve_class_imbalance:        { from: ['labeled_dataset_bound', 'class_imbalance_resolved'],                                                                               to: 'class_imbalance_resolved' },
  engineer_features:              { from: ['class_imbalance_resolved', 'features_engineered'],                                                                                 to: 'features_engineered' },
  split_train_test:               { from: ['features_engineered', 'train_test_split'],                                                                                         to: 'train_test_split' },
  train_multiclass:               { from: ['train_test_split', 'multiclass_model_trained'],                                                                                    to: 'multiclass_model_trained' },
  validate_confusion_matrix:      { from: ['multiclass_model_trained', 'confusion_matrix_validated'],                                                                          to: 'confusion_matrix_validated' },
  calibrate:                      { from: ['confusion_matrix_validated', 'calibrated'],                                                                                        to: 'calibrated' },
  deploy_shadow:                  { from: ['calibrated', 'shadow_deployed'],                                                                                                   to: 'shadow_deployed' },
  activate_live_ab:               { from: ['shadow_deployed', 'live_ab_active', 'class_drift_detected', 'failover_to_physics_baseline'],                                       to: 'live_ab_active' },
  promote_champion:               { from: ['live_ab_active', 'champion_promoted'],                                                                                             to: 'champion_promoted' },
  retrain:                        { from: ['champion_promoted', 'retrained', 'class_drift_detected'],                                                                          to: 'retrained' },
  archive:                        { from: ['champion_promoted', 'retrained'],                                                                                                  to: 'archived' },
  detect_class_drift:             { from: DRIFT_FROM,                                                                                                                          to: 'class_drift_detected' },
  rollback_model:                 { from: ALL_NON_TERMINAL,                                                                                                                    to: 'rolled_back' },
  recall_model:                   { from: ALL_NON_TERMINAL,                                                                                                                    to: 'recalled' },
  failover_to_physics_baseline:   { from: FAILOVER_FROM,                                                                                                                       to: 'failover_to_physics_baseline' },
  add_novel_class:                { from: NOVEL_CLASS_FROM,                                                                                                                    to: 'multiclass_model_trained' },
};

export function nextStatus(current: FfmlStatus, action: FfmlAction): FfmlStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_model' && current !== 'model_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: FfmlStatus): FfmlAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: FfmlAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [FfmlAction, typeof TRANSITIONS[FfmlAction]][]) {
    if (a === 'propose_model') continue;
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA.
// Anchors BETWEEN W127's 720h and W128's 1080h:
//   single_asset 36 / small_fleet 120 / large_fleet 300 /
//   multi_jurisdiction_fleet 600 / fleet_systemic 900.
export const SLA_HOURS: Record<FfmlStatus, Record<FfmlTier, number>> = {
  model_proposed:                  { single_asset: 36,  small_fleet: 120, large_fleet: 300, multi_jurisdiction_fleet: 600, fleet_systemic: 900 },
  labeled_dataset_bound:           { single_asset: 48,  small_fleet: 168, large_fleet: 360, multi_jurisdiction_fleet: 600, fleet_systemic: 900 },
  class_imbalance_resolved:        { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 420, fleet_systemic: 600 },
  features_engineered:             { single_asset: 24,  small_fleet: 96,  large_fleet: 192, multi_jurisdiction_fleet: 360, fleet_systemic: 480 },
  train_test_split:                { single_asset: 12,  small_fleet: 48,  large_fleet: 96,  multi_jurisdiction_fleet: 168, fleet_systemic: 240 },
  multiclass_model_trained:        { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 360, fleet_systemic: 480 },
  confusion_matrix_validated:      { single_asset: 12,  small_fleet: 48,  large_fleet: 96,  multi_jurisdiction_fleet: 168, fleet_systemic: 240 },
  calibrated:                      { single_asset: 24,  small_fleet: 72,  large_fleet: 240, multi_jurisdiction_fleet: 360, fleet_systemic: 480 },
  shadow_deployed:                 { single_asset: 60,  small_fleet: 192, large_fleet: 420, multi_jurisdiction_fleet: 600, fleet_systemic: 960 },
  live_ab_active:                  { single_asset: 24,  small_fleet: 96,  large_fleet: 300, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  champion_promoted:               { single_asset: 24,  small_fleet: 96,  large_fleet: 300, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  retrained:                       { single_asset: 24,  small_fleet: 96,  large_fleet: 300, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  class_drift_detected:            { single_asset: 24,  small_fleet: 48,  large_fleet: 96,  multi_jurisdiction_fleet: 168, fleet_systemic: 240 },
  failover_to_physics_baseline:    { single_asset: 24,  small_fleet: 72,  large_fleet: 144, multi_jurisdiction_fleet: 240, fleet_systemic: 360 },
  archived:                        { single_asset: 0,   small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
  rolled_back:                     { single_asset: 0,   small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
  recalled:                        { single_asset: 0,   small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
};

export function slaWindowHours(status: FfmlStatus, tier: FfmlTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: FfmlStatus, tier: FfmlTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from (assets_covered, jurisdiction_count, safety_critical).
export function tierForScope(args: {
  assets_covered?: number | null;
  jurisdiction_count?: number | null;
  safety_critical?: boolean | number | null;
}): FfmlTier {
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

export interface FfmlFloorFlags {
  safety_critical_fault_class?: boolean | number | null;
  regulator_reportable_misclass?: boolean | number | null;
  nerc_cip_audit_in_scope?: boolean | number | null;
  sox_ml_governance_required?: boolean | number | null;
  iso_42001_required?: boolean | number | null;
}

export function countFloorFlags(args: FfmlFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.safety_critical_fault_class) +
    t(args.regulator_reportable_misclass) +
    t(args.nerc_cip_audit_in_scope) +
    t(args.sox_ml_governance_required) +
    t(args.iso_42001_required)
  );
}

// FLOOR-AT-LARGE-FLEET on >=1 flag.
export function floorAtLargeFleet(args: FfmlFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-FLEET-SYSTEMIC on >=3 flags.
export function floorAtFleetSystemic(args: FfmlFloorFlags): boolean {
  return countFloorFlags(args) >= 3;
}

const TIER_RANK: Record<FfmlTier, number> = {
  single_asset: 0,
  small_fleet: 1,
  large_fleet: 2,
  multi_jurisdiction_fleet: 3,
  fleet_systemic: 4,
};

export function effectiveTier(
  rawTier: FfmlTier,
  flags: FfmlFloorFlags,
): FfmlTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 3) return 'fleet_systemic';
  if (flagCount >= 1) {
    if (TIER_RANK[rawTier] >= TIER_RANK['large_fleet']) return rawTier;
    return 'large_fleet';
  }
  return rawTier;
}

const HEAVY_TIERS = new Set<FfmlTier>(['large_fleet', 'multi_jurisdiction_fleet', 'fleet_systemic']);
const TOP_HEAVY_TIERS = new Set<FfmlTier>(['multi_jurisdiction_fleet', 'fleet_systemic']);

export function isHeavyTier(tier: FfmlTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: FfmlTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W129 SIGNATURE: rollback_model crosses regulator EVERY tier - inherits
// W127-ML-ROLLBACK Phase-D hard line. THIRD Phase-D rollback signature
// joining the same hard line opened by W127.
//
// Additional:
//   recall_model -> EVERY tier WHEN safety_critical_fault_class
//   detect_class_drift -> HEAVY tiers ONLY WHEN regulator_reportable_misclass
//   failover_to_physics_baseline -> multi_jurisdiction + fleet_systemic only
//   add_novel_class -> fleet_systemic only (W129-UNIQUE - product-class
//     change under EU AI Act Art 14)
//   sla_breached -> HEAVY tiers only
export function crossesIntoRegulator(
  action: FfmlAction,
  tier: FfmlTier,
  args: {
    flags?: FfmlFloorFlags;
  },
): boolean {
  const flags = args.flags ?? {};

  // W129 SIGNATURE inheriting W127-ML-ROLLBACK hard line.
  if (action === 'rollback_model') {
    return true;
  }

  // recall_model -> EVERY tier WHEN safety_critical_fault_class.
  if (action === 'recall_model') {
    return !!flags.safety_critical_fault_class;
  }

  // detect_class_drift -> HEAVY tiers WHEN regulator_reportable_misclass.
  if (action === 'detect_class_drift') {
    if (!HEAVY_TIERS.has(tier)) return false;
    return !!flags.regulator_reportable_misclass;
  }

  // failover_to_physics_baseline -> top-heavy only.
  if (action === 'failover_to_physics_baseline') {
    return TOP_HEAVY_TIERS.has(tier);
  }

  // W129-UNIQUE: add_novel_class -> fleet_systemic only (EU AI Act Art 14
  // product-class change).
  if (action === 'add_novel_class') {
    return tier === 'fleet_systemic';
  }

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: FfmlTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<FfmlAction, FfmlParty> = {
  propose_model:                  'ml_engineer',
  bind_labeled_dataset:           'ml_engineer',
  resolve_class_imbalance:        'ml_engineer',
  engineer_features:              'ml_engineer',
  split_train_test:               'ml_engineer',
  train_multiclass:               'ml_engineer',
  validate_confusion_matrix:      'data_steward',
  calibrate:                      'data_steward',
  deploy_shadow:                  'data_steward',
  activate_live_ab:               'CTO',
  promote_champion:               'CTO',
  retrain:                        'CTO',
  archive:                        'CEO',
  detect_class_drift:             'data_steward',
  rollback_model:                 'CTO',
  recall_model:                   'CEO',
  failover_to_physics_baseline:   'data_steward',
  add_novel_class:                'CTO',
};

export function partyForAction(action: FfmlAction): FfmlParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: FfmlAction): FfmlEvent | null {
  switch (action) {
    case 'propose_model':                  return 'fault_fingerprint_ml_proposed';
    case 'bind_labeled_dataset':           return 'fault_fingerprint_ml_labeled_dataset_bound';
    case 'resolve_class_imbalance':        return 'fault_fingerprint_ml_class_imbalance_resolved';
    case 'engineer_features':              return 'fault_fingerprint_ml_features_engineered';
    case 'split_train_test':               return 'fault_fingerprint_ml_train_test_split';
    case 'train_multiclass':               return 'fault_fingerprint_ml_multiclass_model_trained';
    case 'validate_confusion_matrix':      return 'fault_fingerprint_ml_confusion_matrix_validated';
    case 'calibrate':                      return 'fault_fingerprint_ml_calibrated';
    case 'deploy_shadow':                  return 'fault_fingerprint_ml_shadow_deployed';
    case 'activate_live_ab':               return 'fault_fingerprint_ml_live_ab_active';
    case 'promote_champion':               return 'fault_fingerprint_ml_champion_promoted';
    case 'retrain':                        return 'fault_fingerprint_ml_retrained';
    case 'archive':                        return 'fault_fingerprint_ml_archived';
    case 'detect_class_drift':             return 'fault_fingerprint_ml_class_drift_detected';
    case 'rollback_model':                 return 'fault_fingerprint_ml_rolled_back';
    case 'recall_model':                   return 'fault_fingerprint_ml_recalled';
    case 'failover_to_physics_baseline':   return 'fault_fingerprint_ml_failover_to_physics_baseline';
    case 'add_novel_class':                return 'fault_fingerprint_ml_novel_class_added';
  }
}

// ─── LIVE battery helpers ───────────────────────────────────────────────

export function slaHoursRemaining(
  status: FfmlStatus,
  tier: FfmlTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type FfmlUrgency = 'critical' | 'high' | 'medium' | 'low' | 'systemic';

export function urgencyBand(
  tier: FfmlTier,
  slaHoursLeft: number,
  flags?: FfmlFloorFlags,
): FfmlUrgency {
  if (flags && (flags.safety_critical_fault_class || flags.nerc_cip_audit_in_scope)) {
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
  if (slaHoursLeft < 4)     return 'critical';
  if (slaHoursLeft < 12)    return 'high';
  if (slaHoursLeft < 24)    return 'medium';
  return 'low';
}

export type FfmlAuthority =
  | 'ml_engineer'
  | 'data_steward'
  | 'CTO'
  | 'CEO';

export function authorityRequired(tier: FfmlTier): FfmlAuthority {
  if (tier === 'fleet_systemic')              return 'CEO';
  if (tier === 'multi_jurisdiction_fleet')    return 'CTO';
  if (tier === 'large_fleet')                 return 'data_steward';
  if (tier === 'small_fleet')                 return 'ml_engineer';
  return 'ml_engineer';
}

export function daysToRetrainDue(retrainDueAt: string | null | undefined, now: Date): number {
  if (!retrainDueAt) return 9999;
  const expiry = new Date(retrainDueAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

export function daysToModelCardExpiry(modelCardExpiryAt: string | null | undefined, now: Date): number {
  if (!modelCardExpiryAt) return 9999;
  const expiry = new Date(modelCardExpiryAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

// ─── 5-bridge architecture (W71 NOT NULL + W15 + W41 + W63 + W118) ──────
//
// W71 NOT NULL (12-mode physics being replaced - reconciliation
// mandatory). W118 MANDATORY (tamper-evidence audit hash). Other
// bridges activate when fault class drives downstream:
// W15 warranty/RMA (fault-mode evidence) / W41 ITIL problem mgmt
// (RCA from class) / W63 warranty recovery (supplier-recovery driven
// by class).
export function bridgesToW71AssetPrognostics(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW15WarrantyClaim(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW41ProblemManagement(ref: string | null | undefined): boolean {
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
// Multi-class composite. Combines macro_f1, micro_f1, top_3_accuracy,
// log_loss, roc_auc_macro, confusion_matrix_density,
// class_imbalance_ratio, calibration_brier, class_drift_psi,
// reconciliation_with_w71_physics_pct, ntt_baseline_comparison_pct,
// binary governance signals.
export function controlEffectivenessIndex(args: {
  macro_f1?: number | null;
  micro_f1?: number | null;
  weighted_recall?: number | null;
  top_3_accuracy?: number | null;
  log_loss?: number | null;
  roc_auc_macro?: number | null;
  confusion_matrix_density?: number | null;
  class_imbalance_ratio?: number | null;
  calibration_brier?: number | null;
  class_drift_psi?: number | null;
  novel_class_detection_rate?: number | null;
  reconciliation_with_w71_physics_pct?: number | null;
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
  // macro_f1 (0..1, 14 pts).
  const mf1 = n(args.macro_f1, 0, 1);
  score += Math.round(mf1 * 14);
  // micro_f1 (0..1, 10 pts).
  const microf1 = n(args.micro_f1, 0, 1);
  score += Math.round(microf1 * 10);
  // weighted_recall (0..1, 8 pts).
  const wr = n(args.weighted_recall, 0, 1);
  score += Math.round(wr * 8);
  // top_3_accuracy (0..1, 8 pts).
  const top3 = n(args.top_3_accuracy, 0, 1);
  score += Math.round(top3 * 8);
  // log_loss (lower better, 0 ideal, 2.0 worst, 8 pts).
  const ll = n(args.log_loss, 0, 2);
  score += Math.round((1 - ll / 2) * 8);
  // roc_auc_macro (0.5 baseline, 1.0 perfect, 10 pts).
  const rocm = n(args.roc_auc_macro, 0.5, 1);
  score += Math.round(((rocm - 0.5) / 0.5) * 10);
  // confusion_matrix_density (diagonal density 0..1, 8 pts).
  const cmd = n(args.confusion_matrix_density, 0, 1);
  score += Math.round(cmd * 8);
  // class_imbalance_ratio (smaller=better, 1 ideal, 100 worst, 5 pts).
  const cir = n(args.class_imbalance_ratio, 1, 100);
  score += Math.round((1 - (cir - 1) / 99) * 5);
  // calibration_brier (multi-class Brier, lower better, 5 pts).
  const cbr = n(args.calibration_brier, 0, 1);
  score += Math.round((1 - cbr) * 5);
  // class_drift_psi (0=fine, 0.25+=drift, 5 pts).
  const psi = n(args.class_drift_psi, 0, 1);
  score += Math.round((1 - Math.min(psi, 0.25) / 0.25) * 5);
  // novel_class_detection_rate (rate at which model flags samples it
  // can't classify, 0..1, 4 pts).
  const ncdr = n(args.novel_class_detection_rate, 0, 1);
  score += Math.round(ncdr * 4);
  // reconciliation with W71 physics (0-100%, 12 pts).
  const recw71 = n(args.reconciliation_with_w71_physics_pct, 0, 100);
  score += Math.round((recw71 / 100) * 12);
  // NTT baseline comparison (-50..+50%, 8 pts).
  const ntt = n(args.ntt_baseline_comparison_pct, -50, 50);
  score += Math.round(((ntt + 50) / 100) * 8);
  // ISO 42001 compliance score (0-130, 5 pts).
  const iso = n(args.iso_42001_compliance_score, 0, 130);
  score += Math.round((iso / 130) * 5);
  // Model card status.
  if (args.model_card_status === 'published') score += 8;
  else if (args.model_card_status === 'approved') score += 4;
  else if (args.model_card_status === 'draft') score += 1;
  // Binary governance signals.
  score += t(args.iso27001_controls_ok)     * 4;
  score += t(args.soc2_type2_controls_ok)   * 4;
  if (score > 130) score = 130;
  if (score < 0) score = 0;
  return score;
}

// ─── Model health band - composite ──────────────────────────────────────
export type FfmlHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function modelHealthBand(
  status: FfmlStatus,
  controlScore: number,
  slaBreached: boolean,
  retrainDueDays: number,
  modelCardExpiryDays: number,
  flags: FfmlFloorFlags,
  macroF1: number,
  classDriftPsi: number,
  modelCardStatus: 'draft' | 'approved' | 'published' | 'expired' | null | undefined,
): FfmlHealthBand {
  if (status === 'recalled') return 'critical';
  if (status === 'rolled_back') return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (modelCardStatus === 'expired') return 'red';
  if (macroF1 < 0.5) return 'red';
  if (classDriftPsi >= 0.25) return 'red';
  if (retrainDueDays < 14) return 'red';
  if (modelCardExpiryDays < 14) return 'red';
  if (status === 'failover_to_physics_baseline') return 'amber';
  if (status === 'class_drift_detected') return 'amber';
  if (countFloorFlags(flags) >= 3 && controlScore < 90) return 'amber';
  if (controlScore < 60) return 'red';
  if (retrainDueDays < 60) return 'amber';
  if (modelCardExpiryDays < 60) return 'amber';
  if (macroF1 < 0.7) return 'amber';
  if (classDriftPsi >= 0.10) return 'amber';
  if (controlScore < 90) return 'amber';
  return 'green';
}

// ─── 7 model families ────────────────────────────────────────────────────
// xgboost / random_forest / gradient_boosting / cnn_1d / lightgbm /
// catboost / baseline_physics (W71 12-mode rules as the fallback class).
export const FAULT_FINGERPRINT_MODEL_FAMILIES = [
  'xgboost',
  'random_forest',
  'gradient_boosting',
  'cnn_1d',
  'lightgbm',
  'catboost',
  'baseline_physics',
] as const;

export type FaultFingerprintModelFamily = typeof FAULT_FINGERPRINT_MODEL_FAMILIES[number];

export function isKnownModelFamily(s: string | null | undefined): s is FaultFingerprintModelFamily {
  if (!s) return false;
  return (FAULT_FINGERPRINT_MODEL_FAMILIES as readonly string[]).includes(s);
}

// ─── Known asset-class universe ─────────────────────────────────────────
export const FAULT_FINGERPRINT_ASSET_CLASSES = [
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

export type FaultFingerprintAssetClass = typeof FAULT_FINGERPRINT_ASSET_CLASSES[number];

export function isKnownAssetClass(s: string | null | undefined): s is FaultFingerprintAssetClass {
  if (!s) return false;
  return (FAULT_FINGERPRINT_ASSET_CLASSES as readonly string[]).includes(s);
}

// ─── 12 fault modes inherited from W71 ───────────────────────────────────
export const FAULT_FINGERPRINT_FAULT_MODES = [
  'inverter_igbt_degradation',
  'dc_arc_fault',
  'transformer_thermal',
  'battery_thermal_runaway',
  'panel_hotspot',
  'blade_pitch_imbalance',
  'gearbox_bearing',
  'yaw_misalignment',
  'tracker_motor',
  'combiner_box',
  'generator_winding',
  'converter_capacitor_aging',
] as const;

export type FaultFingerprintFaultMode = typeof FAULT_FINGERPRINT_FAULT_MODES[number];

export function isKnownFaultMode(s: string | null | undefined): s is FaultFingerprintFaultMode {
  if (!s) return false;
  return (FAULT_FINGERPRINT_FAULT_MODES as readonly string[]).includes(s);
}

// Minimum samples per class for stratified split (NIST AI RMF
// MEASURE recommendation; below this floor the split MUST reject).
export const MIN_SAMPLES_PER_CLASS_FLOOR = 30;
