// ─────────────────────────────────────────────────────────────────────────
// Wave 127 - Anomaly-Detection ML Model lifecycle chain.
//
// PHASE D WAVE 1 OF 4 (Phase-D opener). Real ML models REPLACING the
// W71 6-method heuristic anomaly ensemble. Where Phase C wired the
// external systems (W122 SCADA / W123 IIoT / W124 settlement /
// W125 ERP / W126 Government Filing), Phase D wires the actual ML
// BRAIN against those streams. W127 = anomaly-detection model
// governance chain (LSTM autoencoder / transformer autoencoder /
// variational autoencoder).
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
// Beats: AspenTech Mtell + GE APM + Uptake Fusion + Augury + C3.ai
// AI/ML + SparkCognition SparkPredict + Petuum + DataRPM stack.
//
// 12-state forward path + 4 branch states (= 16 chain states):
//   model_proposed -> dataset_bound -> features_engineered ->
//     train_test_split -> model_trained -> backtest_validated ->
//     calibrated -> shadow_deployed -> live_ab_active ->
//     champion_promoted -> retrained -> archived (HARD)
//   any non-terminal -> detect_drift -> drift_detected (SOFT)
//   any non-terminal -> rollback_model -> rolled_back (HARD)
//   any non-terminal -> recall_model -> recalled (HARD - safety)
//   live -> activate_failover -> failover_to_baseline (SOFT)
//
// Tier RE-DERIVED on every transition from
//   tierForScope(assets_covered, jurisdiction_count, safety_critical)
// with FLOOR-AT-LARGE-FLEET on >=1 of 5 contextual flags;
// FLOOR-AT-FLEET-SYSTEMIC on >=3 flags:
//   - safety_critical_inference         (safety-critical ML output)
//   - regulator_reportable_drift        (drift triggers regulator notice)
//   - nerc_cip_audit_in_scope           (NERC CIP-013 OT supply-chain)
//   - sox_ml_governance_required        (SOX ML governance evidence)
//   - iso_42001_ai_management_required  (ISO 42001 AIMS scope)
//
// 5 tiers (INVERTED polarity - LARGER fleet scope = MORE training +
// review time):
//   single_asset              : 24h   (single pilot asset)
//   small_fleet               : 96h   (8-20 assets, 1 site)
//   large_fleet               : 240h  (50+ assets, 1 jurisdiction)
//   multi_jurisdiction_fleet  : 480h  (cross-province + cross-statute)
//   fleet_systemic            : 720h  (national-level systemic fleet)
//
// SIGNATURE W127 regulator crossings (ISO 42001 + NIST AI RMF +
// EU AI Act + NERC CIP-013 + SOX):
//   rollback_model -> EVERY tier (W127 SIGNATURE W127-ML-ROLLBACK hard
//     line - model rollback = mandatory ISO 42001 incident + NIST AI
//     RMF MAP-MEASURE-MANAGE notice + SOC 2 control failure + audit-
//     evidence-chain reconciliation; FIRST Phase-D hard line.)
//   recall_model -> EVERY tier WHEN safety_critical_inference
//     (safety recall = NERC CIP-013 OT incident + ISO 42001 RCA +
//     EU AI Act Art 21 corrective action.)
//   detect_drift -> large_fleet + multi_jurisdiction_fleet +
//     fleet_systemic ONLY when regulator_reportable_drift.
//   activate_failover -> multi_jurisdiction_fleet + fleet_systemic.
//   sla_breached -> large_fleet + multi_jurisdiction_fleet +
//     fleet_systemic only.
//
// Write {admin, support} (2 writers - SAME AS W71 heuristic
// prognostics; this is the REAL ML replacement). READ all 9 personas.
// NO public peer endpoint - INTERNAL ML governance chain.
//
// actor_party split (4-step authority ladder):
//   ml_engineer    : propose_model / bind_dataset / engineer_features /
//                    split_train_test / train_model / backtest
//   data_steward   : calibrate / deploy_shadow / detect_drift /
//                    activate_failover
//   CTO            : activate_live_ab / promote_champion / retrain /
//                    rollback_model
//   CEO            : archive / recall_model
//
// Event prefix: `anomaly_detection_ml_evt_`. AUDIT_PREFIX_MAP entry:
// anomaly_detection_ml: 'ml' (NEW Phase-D 'ml' namespace - FIRST
// Phase-D family, distinct from W122/W123 'grid' and W124/W125
// 'settlement' and W126 'regulator' families).
//
// Three crons:
//   - */15 * * * *        SLA sweep (shared with all chains)
//   - 30 2 * * *          daily drift-scan (NEW - 02:30 UTC = 04:30
//                         SAST, 30 min after W126 government-filing
//                         deadline sweep so drift detection sees
//                         fresh ERP/filing state)
//   - 0 7 * * 1           weekly model-card expiry scan (shared
//                         with W122/W123/W124/W125/W126 trigger)
//
// Five bridges (W118 MANDATORY tamper-evidence):
//   W71 asset prognostics (the heuristic this REPLACES) + W12 site
//   commissioning (asset lifecycle context) + W118 audit chain
//   (MANDATORY - every model version hashed into W118 spine) + W126
//   government filing (when regulator_reportable_drift) + W74 NERSA
//   levy (when iso_42001 certification status).
// ─────────────────────────────────────────────────────────────────────────

export type AdmlStatus =
  | 'model_proposed'
  | 'dataset_bound'
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
  | 'failover_to_baseline';

export type AdmlAction =
  | 'propose_model'
  | 'bind_dataset'
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
  | 'activate_failover';

export type AdmlTier =
  | 'single_asset'
  | 'small_fleet'
  | 'large_fleet'
  | 'multi_jurisdiction_fleet'
  | 'fleet_systemic';

export type AdmlParty =
  | 'ml_engineer'
  | 'data_steward'
  | 'CTO'
  | 'CEO';

export type AdmlEvent =
  | 'anomaly_detection_ml_proposed'
  | 'anomaly_detection_ml_dataset_bound'
  | 'anomaly_detection_ml_features_engineered'
  | 'anomaly_detection_ml_train_test_split'
  | 'anomaly_detection_ml_trained'
  | 'anomaly_detection_ml_backtest_validated'
  | 'anomaly_detection_ml_calibrated'
  | 'anomaly_detection_ml_shadow_deployed'
  | 'anomaly_detection_ml_live_ab_active'
  | 'anomaly_detection_ml_champion_promoted'
  | 'anomaly_detection_ml_retrained'
  | 'anomaly_detection_ml_archived'
  | 'anomaly_detection_ml_drift_detected'
  | 'anomaly_detection_ml_rolled_back'
  | 'anomaly_detection_ml_recalled'
  | 'anomaly_detection_ml_failover_activated'
  | 'anomaly_detection_ml_sla_breached';

// HARD terminals: archived (clean close), rolled_back (champion bad),
// recalled (safety pull). drift_detected and failover_to_baseline are
// SOFT pauses that can recover.
const HARD_TERMINALS = new Set<AdmlStatus>([
  'archived',
  'rolled_back',
  'recalled',
]);

export function isTerminal(s: AdmlStatus): boolean {
  return HARD_TERMINALS.has(s);
}

export function isHardTerminal(s: AdmlStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: AdmlStatus[] = [
  'model_proposed',
  'dataset_bound',
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
  'failover_to_baseline',
];

// detect_drift can be entered from any active state where inference is
// already happening (shadow / live / champion / retrained / failover).
const DRIFT_FROM: AdmlStatus[] = [
  'shadow_deployed',
  'live_ab_active',
  'champion_promoted',
  'retrained',
  'failover_to_baseline',
];

// activate_failover only applies to live or champion (post live).
const FAILOVER_FROM: AdmlStatus[] = [
  'live_ab_active',
  'champion_promoted',
  'retrained',
];

export const TRANSITIONS: Record<AdmlAction, { from: AdmlStatus[]; to: AdmlStatus }> = {
  propose_model:        { from: ['model_proposed'],                                                                                  to: 'model_proposed' },
  bind_dataset:         { from: ['model_proposed', 'dataset_bound'],                                                                 to: 'dataset_bound' },
  engineer_features:    { from: ['dataset_bound', 'features_engineered'],                                                            to: 'features_engineered' },
  split_train_test:     { from: ['features_engineered', 'train_test_split'],                                                         to: 'train_test_split' },
  train_model:          { from: ['train_test_split', 'model_trained'],                                                               to: 'model_trained' },
  backtest:             { from: ['model_trained', 'backtest_validated'],                                                             to: 'backtest_validated' },
  calibrate:            { from: ['backtest_validated', 'calibrated'],                                                                to: 'calibrated' },
  deploy_shadow:        { from: ['calibrated', 'shadow_deployed'],                                                                   to: 'shadow_deployed' },
  activate_live_ab:     { from: ['shadow_deployed', 'live_ab_active', 'drift_detected', 'failover_to_baseline'],                     to: 'live_ab_active' },
  promote_champion:     { from: ['live_ab_active', 'champion_promoted'],                                                             to: 'champion_promoted' },
  retrain:              { from: ['champion_promoted', 'retrained', 'drift_detected'],                                                to: 'retrained' },
  archive:              { from: ['champion_promoted', 'retrained'],                                                                  to: 'archived' },
  detect_drift:         { from: DRIFT_FROM,                                                                                          to: 'drift_detected' },
  rollback_model:       { from: ALL_NON_TERMINAL,                                                                                    to: 'rolled_back' },
  recall_model:         { from: ALL_NON_TERMINAL,                                                                                    to: 'recalled' },
  activate_failover:    { from: FAILOVER_FROM,                                                                                       to: 'failover_to_baseline' },
};

export function nextStatus(current: AdmlStatus, action: AdmlAction): AdmlStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_model' && current !== 'model_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: AdmlStatus): AdmlAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: AdmlAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [AdmlAction, typeof TRANSITIONS[AdmlAction]][]) {
    if (a === 'propose_model') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger fleet
// scope = LONGER training + review runway. Fleet-systemic national
// statutory ML deployments get the most prep (cross-jurisdiction model
// validation + board sign-off + counsel review + audit-evidence chain).
export const SLA_HOURS: Record<AdmlStatus, Record<AdmlTier, number>> = {
  // ANCHOR: model_proposed - the proposal window.
  model_proposed:           { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  dataset_bound:            { single_asset: 24,  small_fleet: 72,  large_fleet: 192, multi_jurisdiction_fleet: 360, fleet_systemic: 480 },
  features_engineered:      { single_asset: 24,  small_fleet: 96,  large_fleet: 192, multi_jurisdiction_fleet: 360, fleet_systemic: 480 },
  train_test_split:         { single_asset: 12,  small_fleet: 48,  large_fleet: 96,  multi_jurisdiction_fleet: 168, fleet_systemic: 240 },
  model_trained:            { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 360, fleet_systemic: 480 },
  backtest_validated:       { single_asset: 12,  small_fleet: 48,  large_fleet: 72,  multi_jurisdiction_fleet: 144, fleet_systemic: 192 },
  calibrated:               { single_asset: 24,  small_fleet: 72,  large_fleet: 240, multi_jurisdiction_fleet: 360, fleet_systemic: 480 },
  shadow_deployed:          { single_asset: 48,  small_fleet: 168, large_fleet: 360, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  live_ab_active:           { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  champion_promoted:        { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  retrained:                { single_asset: 24,  small_fleet: 96,  large_fleet: 240, multi_jurisdiction_fleet: 480, fleet_systemic: 720 },
  drift_detected:           { single_asset: 24,  small_fleet: 48,  large_fleet: 96,  multi_jurisdiction_fleet: 168, fleet_systemic: 240 },
  failover_to_baseline:     { single_asset: 24,  small_fleet: 72,  large_fleet: 144, multi_jurisdiction_fleet: 240, fleet_systemic: 360 },
  archived:                 { single_asset: 0,   small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
  rolled_back:              { single_asset: 0,   small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
  recalled:                 { single_asset: 0,   small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
};

export function slaWindowHours(status: AdmlStatus, tier: AdmlTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: AdmlStatus, tier: AdmlTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from (assets_covered, jurisdiction_count, safety_critical).
// Highest of the three thresholds wins.
//   <=1 asset -> single_asset
//   2-20 assets / <=1 juris -> small_fleet
//   21+ assets / <=1 juris -> large_fleet
//   2+ jurisdictions -> multi_jurisdiction_fleet
//   3+ jurisdictions OR safety_critical_national -> fleet_systemic
export function tierForScope(args: {
  assets_covered?: number | null;
  jurisdiction_count?: number | null;
  safety_critical?: boolean | number | null;
}): AdmlTier {
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

export interface AdmlFloorFlags {
  safety_critical_inference?: boolean | number | null;
  regulator_reportable_drift?: boolean | number | null;
  nerc_cip_audit_in_scope?: boolean | number | null;
  sox_ml_governance_required?: boolean | number | null;
  iso_42001_ai_management_required?: boolean | number | null;
}

export function countFloorFlags(args: AdmlFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.safety_critical_inference) +
    t(args.regulator_reportable_drift) +
    t(args.nerc_cip_audit_in_scope) +
    t(args.sox_ml_governance_required) +
    t(args.iso_42001_ai_management_required)
  );
}

// FLOOR-AT-LARGE-FLEET on >=1 flag.
export function floorAtLargeFleet(args: AdmlFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-FLEET-SYSTEMIC on >=3 flags.
export function floorAtFleetSystemic(args: AdmlFloorFlags): boolean {
  return countFloorFlags(args) >= 3;
}

// Tier ordering for promotion logic - higher index = longer SLA window
// + heavier scrutiny.
const TIER_RANK: Record<AdmlTier, number> = {
  single_asset: 0,
  small_fleet: 1,
  large_fleet: 2,
  multi_jurisdiction_fleet: 3,
  fleet_systemic: 4,
};

export function effectiveTier(
  rawTier: AdmlTier,
  flags: AdmlFloorFlags,
): AdmlTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 3) return 'fleet_systemic';
  if (flagCount >= 1) {
    // Lift to at least large_fleet.
    if (TIER_RANK[rawTier] >= TIER_RANK['large_fleet']) return rawTier;
    return 'large_fleet';
  }
  return rawTier;
}

// Heavy tiers - large_fleet + multi_jurisdiction_fleet + fleet_systemic.
// sla_breached + detect_drift (gated) + activate_failover (gated) +
// sla_breached crossings attach here.
const HEAVY_TIERS = new Set<AdmlTier>(['large_fleet', 'multi_jurisdiction_fleet', 'fleet_systemic']);
const TOP_HEAVY_TIERS = new Set<AdmlTier>(['multi_jurisdiction_fleet', 'fleet_systemic']);

export function isHeavyTier(tier: AdmlTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: AdmlTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W127 SIGNATURE: rollback_model crosses regulator EVERY tier - the
// W127-ML-ROLLBACK hard line. Model rollback is always reportable.
// ISO 42001 incident + NIST AI RMF MAP-MEASURE-MANAGE notice +
// SOC 2 control failure + audit-evidence-chain reconciliation
// mandatory. FIRST Phase-D hard line.
//
// Additional:
//   recall_model -> EVERY tier WHEN safety_critical_inference
//   detect_drift -> large_fleet/multi_jurisdiction_fleet/fleet_systemic
//                   ONLY WHEN regulator_reportable_drift
//   activate_failover -> multi_jurisdiction_fleet + fleet_systemic only
//   sla_breached -> large_fleet + multi_jurisdiction_fleet +
//                   fleet_systemic only
export function crossesIntoRegulator(
  action: AdmlAction,
  tier: AdmlTier,
  args: {
    flags?: AdmlFloorFlags;
  },
): boolean {
  const flags = args.flags ?? {};

  // W127 SIGNATURE W127-ML-ROLLBACK: rollback_model EVERY tier.
  if (action === 'rollback_model') {
    return true;
  }

  // recall_model -> EVERY tier WHEN safety_critical_inference.
  if (action === 'recall_model') {
    return !!flags.safety_critical_inference;
  }

  // detect_drift -> HEAVY tiers ONLY when regulator_reportable_drift.
  if (action === 'detect_drift') {
    return HEAVY_TIERS.has(tier) && !!flags.regulator_reportable_drift;
  }

  // activate_failover -> multi_jurisdiction_fleet + fleet_systemic only.
  if (action === 'activate_failover') {
    return TOP_HEAVY_TIERS.has(tier);
  }

  // archive / propose_model / etc. never cross on their own.

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: AdmlTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<AdmlAction, AdmlParty> = {
  propose_model:        'ml_engineer',
  bind_dataset:         'ml_engineer',
  engineer_features:    'ml_engineer',
  split_train_test:     'ml_engineer',
  train_model:          'ml_engineer',
  backtest:             'ml_engineer',
  calibrate:            'data_steward',
  deploy_shadow:        'data_steward',
  activate_live_ab:     'CTO',
  promote_champion:     'CTO',
  retrain:              'CTO',
  archive:              'CEO',
  detect_drift:         'data_steward',
  rollback_model:       'CTO',
  recall_model:         'CEO',
  activate_failover:    'data_steward',
};

export function partyForAction(action: AdmlAction): AdmlParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: AdmlAction): AdmlEvent | null {
  switch (action) {
    case 'propose_model':        return 'anomaly_detection_ml_proposed';
    case 'bind_dataset':         return 'anomaly_detection_ml_dataset_bound';
    case 'engineer_features':    return 'anomaly_detection_ml_features_engineered';
    case 'split_train_test':     return 'anomaly_detection_ml_train_test_split';
    case 'train_model':          return 'anomaly_detection_ml_trained';
    case 'backtest':             return 'anomaly_detection_ml_backtest_validated';
    case 'calibrate':            return 'anomaly_detection_ml_calibrated';
    case 'deploy_shadow':        return 'anomaly_detection_ml_shadow_deployed';
    case 'activate_live_ab':     return 'anomaly_detection_ml_live_ab_active';
    case 'promote_champion':     return 'anomaly_detection_ml_champion_promoted';
    case 'retrain':              return 'anomaly_detection_ml_retrained';
    case 'archive':              return 'anomaly_detection_ml_archived';
    case 'detect_drift':         return 'anomaly_detection_ml_drift_detected';
    case 'rollback_model':       return 'anomaly_detection_ml_rolled_back';
    case 'recall_model':         return 'anomaly_detection_ml_recalled';
    case 'activate_failover':    return 'anomaly_detection_ml_failover_activated';
  }
}

// ─── LIVE battery (~28 fields decorated at fetch) ───────────────────────

export function slaHoursRemaining(
  status: AdmlStatus,
  tier: AdmlTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type AdmlUrgency = 'critical' | 'high' | 'medium' | 'low' | 'systemic';

// INVERTED polarity: fleet_systemic has LOOSEST urgency thresholds.
// single_asset has TIGHTEST. Safety-critical or NERC-CIP-013 flag
// immediately bumps urgency to 'systemic' (safety/OT sensitivity).
export function urgencyBand(
  tier: AdmlTier,
  slaHoursLeft: number,
  flags?: AdmlFloorFlags,
): AdmlUrgency {
  if (flags && (flags.safety_critical_inference || flags.nerc_cip_audit_in_scope)) {
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
export type AdmlAuthority =
  | 'ml_engineer'
  | 'data_steward'
  | 'CTO'
  | 'CEO';

export function authorityRequired(tier: AdmlTier): AdmlAuthority {
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

// ─── 5-bridge architecture (W71 + W12 + W118 + W126 + W74) ──────────────
//
// W118 is MANDATORY (tamper-evidence audit hash). Other bridges
// activate when the model observes a related event in another chain
// (W71 asset prognostics - the heuristic this REPLACES / W12 site
// commissioning / W126 government filing when regulator_reportable
// drift / W74 NERSA levy when iso_42001 certification).
export function bridgesToW71AssetPrognostics(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW12SiteCommissioning(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW126GovernmentFiling(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW74NersaLevy(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW118AuditChain(blockRef: string | null | undefined): boolean {
  return !!blockRef;
}

// ─── Control effectiveness index 0-130 ──────────────────────────────────
//
// Scores the LIVE ML model health. Three-component composite:
// performance (precision/recall/FPR/latency) + drift (PSI/KS) +
// reconciliation-with-W71 + binary governance signals (ISO 42001 +
// SOC 2 + ISO 27001 + model_card_status).
export function controlEffectivenessIndex(args: {
  precision_at_k?: number | null;
  recall_at_k?: number | null;
  false_positive_rate?: number | null;
  drift_psi?: number | null;
  drift_ks?: number | null;
  champion_vs_challenger_lift?: number | null;
  inference_latency_p50_ms?: number | null;
  inference_latency_p99_ms?: number | null;
  inference_throughput_per_sec?: number | null;
  reconciliation_with_w71_heuristic_pct?: number | null;
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
  // Precision @ K (0-1 normalised to 12 pts).
  const prec = n(args.precision_at_k, 0, 1);
  score += Math.round(prec * 12);
  // Recall @ K (0-1 normalised to 12 pts).
  const rec = n(args.recall_at_k, 0, 1);
  score += Math.round(rec * 12);
  // False positive rate (lower is better, 0% ideal, 10%+ is 0).
  const fpr = n(args.false_positive_rate, 0, 0.1);
  score += Math.round((1 - fpr / 0.1) * 8);
  // Drift PSI (lower is better, 0 ideal, 0.5+ is 0).
  const psi = n(args.drift_psi, 0, 0.5);
  score += Math.round((1 - psi / 0.5) * 8);
  // Drift KS (lower is better, 0 ideal, 0.5+ is 0).
  const ks = n(args.drift_ks, 0, 0.5);
  score += Math.round((1 - ks / 0.5) * 6);
  // Champion-vs-challenger lift (1.0 baseline, >1.0 better).
  const lift = n(args.champion_vs_challenger_lift, 0.5, 2.0);
  score += Math.round(((lift - 0.5) / 1.5) * 8);
  // Inference latency p50 (lower is better, 0ms ideal, 100ms is 0).
  const p50 = n(args.inference_latency_p50_ms, 0, 100);
  score += Math.round((1 - p50 / 100) * 6);
  // Inference latency p99 (lower is better, 0ms ideal, 300ms is 0).
  const p99 = n(args.inference_latency_p99_ms, 0, 300);
  score += Math.round((1 - p99 / 300) * 6);
  // Throughput (higher is better, 0 ideal min, 1000/s is full pts).
  const tps = n(args.inference_throughput_per_sec, 0, 1000);
  score += Math.round((tps / 1000) * 5);
  // Reconciliation with W71 heuristic (0-100% normalised to 10 pts).
  const recw71 = n(args.reconciliation_with_w71_heuristic_pct, 0, 100);
  score += Math.round((recw71 / 100) * 10);
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
export type AdmlHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function modelHealthBand(
  status: AdmlStatus,
  controlScore: number,
  slaBreached: boolean,
  retrainDueDays: number,
  modelCardExpiryDays: number,
  flags: AdmlFloorFlags,
  driftPsi: number,
  falsePositiveRate: number,
  modelCardStatus: 'draft' | 'approved' | 'published' | 'expired' | null | undefined,
): AdmlHealthBand {
  if (status === 'recalled') return 'critical';
  if (status === 'rolled_back') return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (modelCardStatus === 'expired') return 'red';
  if (driftPsi >= 0.25) return 'red';
  if (falsePositiveRate > 0.05) return 'red';
  if (retrainDueDays < 14) return 'red';
  if (modelCardExpiryDays < 14) return 'red';
  if (status === 'failover_to_baseline') return 'amber';
  if (status === 'drift_detected') return 'amber';
  if (countFloorFlags(flags) >= 3 && controlScore < 90) return 'amber';
  if (controlScore < 60) return 'red';
  if (retrainDueDays < 60) return 'amber';
  if (modelCardExpiryDays < 60) return 'amber';
  if (driftPsi >= 0.10) return 'amber';
  if (controlScore < 90) return 'amber';
  if (falsePositiveRate > 0.03) return 'amber';
  return 'green';
}

// Known model family universe.
export const ANOMALY_DETECTION_MODEL_FAMILIES = [
  'lstm_autoencoder',
  'transformer_autoencoder',
  'variational_autoencoder',
  'isolation_forest_ensemble',
  'one_class_svm',
  'prophet_residual',
  'baseline_heuristic',
] as const;

export type AnomalyDetectionModelFamily = typeof ANOMALY_DETECTION_MODEL_FAMILIES[number];

export function isKnownModelFamily(s: string | null | undefined): s is AnomalyDetectionModelFamily {
  if (!s) return false;
  return (ANOMALY_DETECTION_MODEL_FAMILIES as readonly string[]).includes(s);
}

// Known asset-class universe.
export const ANOMALY_DETECTION_ASSET_CLASSES = [
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

export type AnomalyDetectionAssetClass = typeof ANOMALY_DETECTION_ASSET_CLASSES[number];

export function isKnownAssetClass(s: string | null | undefined): s is AnomalyDetectionAssetClass {
  if (!s) return false;
  return (ANOMALY_DETECTION_ASSET_CLASSES as readonly string[]).includes(s);
}
