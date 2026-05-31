// ─────────────────────────────────────────────────────────────────────────
// Wave 130 - NTT Comparison Battery chain.
//
// PHASE D WAVE 4 OF 4 - CLOSES PHASE D. AGGREGATOR over W127 (anomaly
// LSTM-AE) + W128 (RUL Cox PH survival) + W129 (fault-fingerprint
// multi-class) against an emulated NTT IoT/O&M baseline. Each row =
// one COMPARISON CYCLE (typically nightly). Produces continuously
// updated, revenue-weighted, statistically significance-gated,
// tamper-evident "savings-vs-NTT-30%" KPI that streams into the Esums
// dashboard hero.
//
// Beats: NTT IoT for Energy + NTT GreenOps + NTT "Predictive Maintenance"
// stack - and the underlying GE APM / IBM Maximo APM / OSIsoft PI AF /
// Aveva PI Insight benchmarks NTT typically resells. This row is the
// quantified proof point the directive [[project_esums_predictive_vs_ntt]]
// commits to producing.
//
// 12-state forward path + 4 branch states (= 16 chain states):
//   cycle_proposed -> baselines_synced -> telemetry_window_bound ->
//   ntt_emulation_run -> champion_predictions_collected ->
//   counterfactuals_computed -> revenue_weighted_scored ->
//   significance_tested -> savings_certified -> audit_published ->
//   retraining_triggered -> archived (HARD)
//   any non-terminal -> flag_significance_failure -> significance_failed (SOFT)
//   any non-terminal -> rollback_cycle -> rolled_back (HARD)
//   any non-terminal -> recall_certification -> recalled (HARD - W130 SIGNATURE)
//   live -> activate_failover -> failover_to_prior_cycle (SOFT)
//
// Tier RE-DERIVED on every transition from
//   tierForScope(assets_covered, jurisdiction_count, safety_critical)
// IDENTICAL to W127/W128/W129. FLOOR-AT-LARGE-FLEET on >=1 of 5
// contextual flags; FLOOR-AT-FLEET-SYSTEMIC on >=3 flags:
//   - material_savings_threshold_breached   (cycle total_savings > R10M)
//   - ntt_contract_renegotiation_trigger    (savings_vs_ntt_pct>=30 for
//                                            4 consecutive cycles)
//   - regulator_reportable_diversion        (champion contradicts NTT
//                                            certification on asset class
//                                            with >5% disagreement)
//   - sox_ml_governance_required
//   - iso_42001_required
//
// 5 tiers (INVERTED polarity - LARGER fleet scope = MORE review time;
// TIGHTER than W127-W129 because cycles run NIGHTLY and the next cycle
// must start before this one falls behind):
//   single_asset              : 12h
//   small_fleet               : 48h
//   large_fleet               : 120h
//   multi_jurisdiction_fleet  : 240h
//   fleet_systemic            : 480h
//
// SIGNATURE W130 regulator crossings (SOX ML governance + ISO 42001 +
// NIST AI RMF + NERSA narrative + SARS carbon tax claim integrity):
//   recall_certification -> EVERY tier (W130 SIGNATURE - sister of
//     W127/W128/W129 rollback signatures. Recall = paid out / reported
//     wrong savings numbers - SARS + NERSA + audit committee always.)
//   publish_audit -> EVERY tier WHEN regulator_reportable_diversion
//   certify_savings -> multi_jurisdiction_fleet + fleet_systemic WHEN
//     ntt_contract_renegotiation_trigger
//   flag_significance_failure -> fleet_systemic only
//   sla_breached -> large_fleet + multi_jurisdiction_fleet + fleet_systemic only
//
// Write {admin, support} (2 writers - SAME AS W71 / W127 / W128 / W129).
// READ all 9 personas. NO public peer endpoint - INTERNAL ML governance
// and Esums-team-only.
//
// actor_party split (4-step authority ladder - FRESH terminology
// distinct from W127's ml_engineer naming):
//   ml_analyst     : propose_cycle / sync_baselines / bind_telemetry_window /
//                    run_ntt_emulation / collect_champion_predictions /
//                    compute_counterfactuals
//   data_steward   : revenue_weight_score / test_significance /
//                    flag_significance_failure / activate_failover
//   CTO            : certify_savings / publish_audit / trigger_retraining /
//                    rollback_cycle
//   CEO            : archive / recall_certification
//
// Event prefix: `ntt_comparison_battery_evt_`. AUDIT_PREFIX_MAP entry:
// ntt_comparison_battery: 'ml' (JOINS the Phase-D 'ml' namespace with
// W127/W128/W129 - W118 spine partition assumes ONE prefix per family.)
//
// Four crons:
//   - */15 * * * *        SLA sweep (shared)
//   - 15 4 * * *          NEW nightly cycle runner (06:15 SAST) - walks
//                         active fleet scopes; emulation + collection
//                         in-line
//   - 0 7 * * 1           weekly model-card expiry scan (shared)
//   - 0 1 1 * *           NEW monthly ledger reconciliation (03:00
//                         SAST 1st-of-month) - validates
//                         cumulative_savings_zar vs W71 control;
//                         emits regulator-relevant event if drift > 5%
//
// Five bridges (W118 MANDATORY):
//   W127 anomaly detection ml ref (the LSTM-AE champion this cycle judged)
//   W128 RUL survival model ref (the Cox PH champion this cycle judged)
//   W129 fault fingerprint model ref (the multi-class champion this cycle judged)
//   W71 asset prognostics ref (CONTROL VARIABLE - heuristic ensemble
//     baseline) - mandatory for reconciliation_with_w71_savings_ledger.
//   W118 audit chain block ref (MANDATORY - savings ledger hashed
//     into W118 spine on every publish_audit; the tamper-evidence
//     hard requirement.)
// ─────────────────────────────────────────────────────────────────────────

export type NcbStatus =
  | 'cycle_proposed'
  | 'baselines_synced'
  | 'telemetry_window_bound'
  | 'ntt_emulation_run'
  | 'champion_predictions_collected'
  | 'counterfactuals_computed'
  | 'revenue_weighted_scored'
  | 'significance_tested'
  | 'savings_certified'
  | 'audit_published'
  | 'retraining_triggered'
  | 'archived'
  | 'significance_failed'
  | 'rolled_back'
  | 'recalled'
  | 'failover_to_prior_cycle';

export type NcbAction =
  | 'propose_cycle'
  | 'sync_baselines'
  | 'bind_telemetry_window'
  | 'run_ntt_emulation'
  | 'collect_champion_predictions'
  | 'compute_counterfactuals'
  | 'revenue_weight_score'
  | 'test_significance'
  | 'certify_savings'
  | 'publish_audit'
  | 'trigger_retraining'
  | 'archive'
  | 'flag_significance_failure'
  | 'rollback_cycle'
  | 'recall_certification'
  | 'activate_failover';

export type NcbTier =
  | 'single_asset'
  | 'small_fleet'
  | 'large_fleet'
  | 'multi_jurisdiction_fleet'
  | 'fleet_systemic';

export type NcbParty =
  | 'ml_analyst'
  | 'data_steward'
  | 'CTO'
  | 'CEO';

export type NcbEvent =
  | 'ntt_comparison_battery_cycle_proposed'
  | 'ntt_comparison_battery_baselines_synced'
  | 'ntt_comparison_battery_telemetry_window_bound'
  | 'ntt_comparison_battery_ntt_emulation_run'
  | 'ntt_comparison_battery_champion_predictions_collected'
  | 'ntt_comparison_battery_counterfactuals_computed'
  | 'ntt_comparison_battery_revenue_weighted_scored'
  | 'ntt_comparison_battery_significance_tested'
  | 'ntt_comparison_battery_savings_certified'
  | 'ntt_comparison_battery_audit_published'
  | 'ntt_comparison_battery_retraining_triggered'
  | 'ntt_comparison_battery_archived'
  | 'ntt_comparison_battery_significance_failed'
  | 'ntt_comparison_battery_rolled_back'
  | 'ntt_comparison_battery_recalled'
  | 'ntt_comparison_battery_failover_to_prior_cycle'
  | 'ntt_comparison_battery_sla_breached';

const HARD_TERMINALS = new Set<NcbStatus>([
  'archived',
  'rolled_back',
  'recalled',
]);

export function isTerminal(s: NcbStatus): boolean {
  return HARD_TERMINALS.has(s);
}

export function isHardTerminal(s: NcbStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: NcbStatus[] = [
  'cycle_proposed',
  'baselines_synced',
  'telemetry_window_bound',
  'ntt_emulation_run',
  'champion_predictions_collected',
  'counterfactuals_computed',
  'revenue_weighted_scored',
  'significance_tested',
  'savings_certified',
  'audit_published',
  'retraining_triggered',
  'significance_failed',
  'failover_to_prior_cycle',
];

// activate_failover only from live serving states (already certified
// or audit-published) - if the certified cycle is later found wanting
// the operator drops back to the PRIOR cycle while a fix is staged.
const FAILOVER_FROM: NcbStatus[] = [
  'savings_certified',
  'audit_published',
  'retraining_triggered',
];

export const TRANSITIONS: Record<NcbAction, { from: NcbStatus[]; to: NcbStatus }> = {
  propose_cycle:                  { from: ['cycle_proposed'],                                                                                  to: 'cycle_proposed' },
  sync_baselines:                 { from: ['cycle_proposed', 'baselines_synced'],                                                              to: 'baselines_synced' },
  bind_telemetry_window:          { from: ['baselines_synced', 'telemetry_window_bound'],                                                      to: 'telemetry_window_bound' },
  run_ntt_emulation:              { from: ['telemetry_window_bound', 'ntt_emulation_run'],                                                     to: 'ntt_emulation_run' },
  collect_champion_predictions:   { from: ['ntt_emulation_run', 'champion_predictions_collected'],                                             to: 'champion_predictions_collected' },
  compute_counterfactuals:        { from: ['champion_predictions_collected', 'counterfactuals_computed'],                                      to: 'counterfactuals_computed' },
  revenue_weight_score:           { from: ['counterfactuals_computed', 'revenue_weighted_scored'],                                             to: 'revenue_weighted_scored' },
  test_significance:              { from: ['revenue_weighted_scored', 'significance_tested', 'significance_failed'],                            to: 'significance_tested' },
  certify_savings:                { from: ['significance_tested', 'savings_certified'],                                                        to: 'savings_certified' },
  publish_audit:                  { from: ['savings_certified', 'audit_published'],                                                            to: 'audit_published' },
  trigger_retraining:             { from: ['audit_published', 'retraining_triggered', 'failover_to_prior_cycle'],                              to: 'retraining_triggered' },
  archive:                        { from: ['audit_published', 'retraining_triggered'],                                                         to: 'archived' },
  flag_significance_failure:      { from: ['revenue_weighted_scored', 'significance_tested'],                                                  to: 'significance_failed' },
  rollback_cycle:                 { from: ALL_NON_TERMINAL,                                                                                    to: 'rolled_back' },
  recall_certification:           { from: ALL_NON_TERMINAL,                                                                                    to: 'recalled' },
  activate_failover:              { from: FAILOVER_FROM,                                                                                       to: 'failover_to_prior_cycle' },
};

export function nextStatus(current: NcbStatus, action: NcbAction): NcbStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_cycle' && current !== 'cycle_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: NcbStatus): NcbAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: NcbAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [NcbAction, typeof TRANSITIONS[NcbAction]][]) {
    if (a === 'propose_cycle') continue;
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA.
// Anchors TIGHTER than W127-W129 because cycles run NIGHTLY:
//   single_asset 12 / small_fleet 48 / large_fleet 120 /
//   multi_jurisdiction_fleet 240 / fleet_systemic 480.
export const SLA_HOURS: Record<NcbStatus, Record<NcbTier, number>> = {
  cycle_proposed:                 { single_asset: 12, small_fleet: 48,  large_fleet: 120, multi_jurisdiction_fleet: 240, fleet_systemic: 480 },
  baselines_synced:               { single_asset: 6,  small_fleet: 24,  large_fleet: 72,  multi_jurisdiction_fleet: 120, fleet_systemic: 240 },
  telemetry_window_bound:         { single_asset: 6,  small_fleet: 24,  large_fleet: 60,  multi_jurisdiction_fleet: 120, fleet_systemic: 192 },
  ntt_emulation_run:              { single_asset: 8,  small_fleet: 24,  large_fleet: 72,  multi_jurisdiction_fleet: 144, fleet_systemic: 240 },
  champion_predictions_collected: { single_asset: 4,  small_fleet: 12,  large_fleet: 48,  multi_jurisdiction_fleet: 96,  fleet_systemic: 168 },
  counterfactuals_computed:       { single_asset: 6,  small_fleet: 24,  large_fleet: 72,  multi_jurisdiction_fleet: 120, fleet_systemic: 192 },
  revenue_weighted_scored:        { single_asset: 6,  small_fleet: 24,  large_fleet: 60,  multi_jurisdiction_fleet: 120, fleet_systemic: 192 },
  significance_tested:            { single_asset: 4,  small_fleet: 12,  large_fleet: 48,  multi_jurisdiction_fleet: 96,  fleet_systemic: 144 },
  savings_certified:              { single_asset: 12, small_fleet: 48,  large_fleet: 120, multi_jurisdiction_fleet: 240, fleet_systemic: 360 },
  audit_published:                { single_asset: 24, small_fleet: 72,  large_fleet: 168, multi_jurisdiction_fleet: 336, fleet_systemic: 480 },
  retraining_triggered:           { single_asset: 12, small_fleet: 48,  large_fleet: 120, multi_jurisdiction_fleet: 240, fleet_systemic: 360 },
  significance_failed:            { single_asset: 12, small_fleet: 24,  large_fleet: 48,  multi_jurisdiction_fleet: 96,  fleet_systemic: 144 },
  failover_to_prior_cycle:        { single_asset: 8,  small_fleet: 24,  large_fleet: 72,  multi_jurisdiction_fleet: 144, fleet_systemic: 240 },
  archived:                       { single_asset: 0,  small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
  rolled_back:                    { single_asset: 0,  small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
  recalled:                       { single_asset: 0,  small_fleet: 0,   large_fleet: 0,   multi_jurisdiction_fleet: 0,   fleet_systemic: 0 },
};

export function slaWindowHours(status: NcbStatus, tier: NcbTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: NcbStatus, tier: NcbTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from (assets_covered, jurisdiction_count, safety_critical).
// IDENTICAL topology to W127/W128/W129.
export function tierForScope(args: {
  assets_covered?: number | null;
  jurisdiction_count?: number | null;
  safety_critical?: boolean | number | null;
}): NcbTier {
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

export interface NcbFloorFlags {
  material_savings_threshold_breached?: boolean | number | null;
  ntt_contract_renegotiation_trigger?: boolean | number | null;
  regulator_reportable_diversion?: boolean | number | null;
  sox_ml_governance_required?: boolean | number | null;
  iso_42001_required?: boolean | number | null;
}

export function countFloorFlags(args: NcbFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.material_savings_threshold_breached) +
    t(args.ntt_contract_renegotiation_trigger) +
    t(args.regulator_reportable_diversion) +
    t(args.sox_ml_governance_required) +
    t(args.iso_42001_required)
  );
}

// FLOOR-AT-LARGE-FLEET on >=1 flag.
export function floorAtLargeFleet(args: NcbFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-FLEET-SYSTEMIC on >=3 flags.
export function floorAtFleetSystemic(args: NcbFloorFlags): boolean {
  return countFloorFlags(args) >= 3;
}

const TIER_RANK: Record<NcbTier, number> = {
  single_asset: 0,
  small_fleet: 1,
  large_fleet: 2,
  multi_jurisdiction_fleet: 3,
  fleet_systemic: 4,
};

export function effectiveTier(
  rawTier: NcbTier,
  flags: NcbFloorFlags,
): NcbTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 3) return 'fleet_systemic';
  if (flagCount >= 1) {
    if (TIER_RANK[rawTier] >= TIER_RANK['large_fleet']) return rawTier;
    return 'large_fleet';
  }
  return rawTier;
}

const HEAVY_TIERS = new Set<NcbTier>(['large_fleet', 'multi_jurisdiction_fleet', 'fleet_systemic']);
const TOP_HEAVY_TIERS = new Set<NcbTier>(['multi_jurisdiction_fleet', 'fleet_systemic']);

export function isHeavyTier(tier: NcbTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: NcbTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W130 SIGNATURE: recall_certification crosses regulator EVERY tier -
// sister of W127/W128/W129 rollback signatures. A recall means we paid
// out / reported wrong savings numbers - SARS carbon tax + NERSA
// narrative + audit-committee always notified.
//
// Additional:
//   publish_audit -> EVERY tier WHEN regulator_reportable_diversion
//     (champion contradicts existing NTT certification on asset class).
//   certify_savings -> TOP-HEAVY tiers WHEN ntt_contract_renegotiation_trigger
//     (4 consecutive cycles >=30% savings is the trigger to renegotiate
//     the NTT base contract; multi-juris+ requires regulator notice).
//   flag_significance_failure -> fleet_systemic only (NIST AI RMF
//     post-market measurement gap on systemic scope).
//   sla_breached -> HEAVY tiers only.
export function crossesIntoRegulator(
  action: NcbAction,
  tier: NcbTier,
  args: {
    flags?: NcbFloorFlags;
  },
): boolean {
  const flags = args.flags ?? {};

  // W130 SIGNATURE - recall_certification ALWAYS crosses (every tier).
  if (action === 'recall_certification') {
    return true;
  }

  if (action === 'publish_audit') {
    return !!flags.regulator_reportable_diversion;
  }

  if (action === 'certify_savings') {
    if (!TOP_HEAVY_TIERS.has(tier)) return false;
    return !!flags.ntt_contract_renegotiation_trigger;
  }

  if (action === 'flag_significance_failure') {
    return tier === 'fleet_systemic';
  }

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: NcbTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<NcbAction, NcbParty> = {
  propose_cycle:                  'ml_analyst',
  sync_baselines:                 'ml_analyst',
  bind_telemetry_window:          'ml_analyst',
  run_ntt_emulation:              'ml_analyst',
  collect_champion_predictions:   'ml_analyst',
  compute_counterfactuals:        'ml_analyst',
  revenue_weight_score:           'data_steward',
  test_significance:              'data_steward',
  flag_significance_failure:      'data_steward',
  activate_failover:              'data_steward',
  certify_savings:                'CTO',
  publish_audit:                  'CTO',
  trigger_retraining:             'CTO',
  rollback_cycle:                 'CTO',
  archive:                        'CEO',
  recall_certification:           'CEO',
};

export function partyForAction(action: NcbAction): NcbParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: NcbAction): NcbEvent | null {
  switch (action) {
    case 'propose_cycle':                  return 'ntt_comparison_battery_cycle_proposed';
    case 'sync_baselines':                 return 'ntt_comparison_battery_baselines_synced';
    case 'bind_telemetry_window':          return 'ntt_comparison_battery_telemetry_window_bound';
    case 'run_ntt_emulation':              return 'ntt_comparison_battery_ntt_emulation_run';
    case 'collect_champion_predictions':   return 'ntt_comparison_battery_champion_predictions_collected';
    case 'compute_counterfactuals':        return 'ntt_comparison_battery_counterfactuals_computed';
    case 'revenue_weight_score':           return 'ntt_comparison_battery_revenue_weighted_scored';
    case 'test_significance':              return 'ntt_comparison_battery_significance_tested';
    case 'certify_savings':                return 'ntt_comparison_battery_savings_certified';
    case 'publish_audit':                  return 'ntt_comparison_battery_audit_published';
    case 'trigger_retraining':             return 'ntt_comparison_battery_retraining_triggered';
    case 'archive':                        return 'ntt_comparison_battery_archived';
    case 'flag_significance_failure':      return 'ntt_comparison_battery_significance_failed';
    case 'rollback_cycle':                 return 'ntt_comparison_battery_rolled_back';
    case 'recall_certification':           return 'ntt_comparison_battery_recalled';
    case 'activate_failover':              return 'ntt_comparison_battery_failover_to_prior_cycle';
  }
}

// ─── LIVE battery helpers ───────────────────────────────────────────────

export function slaHoursRemaining(
  status: NcbStatus,
  tier: NcbTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type NcbUrgency = 'critical' | 'high' | 'medium' | 'low' | 'systemic';

export function urgencyBand(
  tier: NcbTier,
  slaHoursLeft: number,
  flags?: NcbFloorFlags,
): NcbUrgency {
  if (flags && (flags.regulator_reportable_diversion || flags.sox_ml_governance_required)) {
    return 'systemic';
  }
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'fleet_systemic') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 48)  return 'high';
    if (slaHoursLeft < 120) return 'medium';
    return 'low';
  }
  if (tier === 'multi_jurisdiction_fleet') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 36)  return 'high';
    if (slaHoursLeft < 96)  return 'medium';
    return 'low';
  }
  if (tier === 'large_fleet') {
    if (slaHoursLeft < 6)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 60)  return 'medium';
    return 'low';
  }
  if (tier === 'small_fleet') {
    if (slaHoursLeft < 4)   return 'critical';
    if (slaHoursLeft < 12)  return 'high';
    if (slaHoursLeft < 24)  return 'medium';
    return 'low';
  }
  if (slaHoursLeft < 2)     return 'critical';
  if (slaHoursLeft < 6)     return 'high';
  if (slaHoursLeft < 12)    return 'medium';
  return 'low';
}

export type NcbAuthority =
  | 'ml_analyst'
  | 'data_steward'
  | 'CTO'
  | 'CEO';

export function authorityRequired(tier: NcbTier): NcbAuthority {
  if (tier === 'fleet_systemic')              return 'CEO';
  if (tier === 'multi_jurisdiction_fleet')    return 'CTO';
  if (tier === 'large_fleet')                 return 'data_steward';
  if (tier === 'small_fleet')                 return 'ml_analyst';
  return 'ml_analyst';
}

export function daysToNextCycle(nextCycleAt: string | null | undefined, now: Date): number {
  if (!nextCycleAt) return 9999;
  const expiry = new Date(nextCycleAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

export function daysToModelCardExpiry(modelCardExpiryAt: string | null | undefined, now: Date): number {
  if (!modelCardExpiryAt) return 9999;
  const expiry = new Date(modelCardExpiryAt).getTime();
  const nowMs = now.getTime();
  return Math.max(0, Math.ceil((expiry - nowMs) / (24 * 3600 * 1000)));
}

// ─── 5-bridge architecture (W118 MANDATORY; W127+W128+W129+W71 OPTIONAL) ──
//
// AGGREGATOR stitches the three Phase-D ML champions plus the W71
// heuristic control variable. W118 MANDATORY tamper-evidence hash on
// every publish_audit.
export function bridgesToW127AnomalyDetection(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW128RulSurvival(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW129FaultFingerprint(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW71AssetPrognostics(ref: string | null | undefined): boolean {
  return !!ref;
}
export function bridgesToW118AuditChain(blockRef: string | null | undefined): boolean {
  return !!blockRef;
}

// ─── Control effectiveness index 0-130 ──────────────────────────────────
//
// W130-flavoured composite. Combines savings_vs_ntt_pct (TARGET 30),
// significance test pvalues, brier skill score, confidence interval
// width (narrower = better), reconciliation_with_w71_savings_ledger_pct,
// false-positive savings drag, governance signals.
export function controlEffectivenessIndex(args: {
  savings_vs_ntt_pct?: number | null;
  cumulative_savings_zar?: number | null;
  paired_t_pvalue?: number | null;
  wilcoxon_pvalue?: number | null;
  brier_skill_score_vs_ntt?: number | null;
  confidence_interval_width_zar?: number | null;
  reconciliation_with_w71_savings_ledger_pct?: number | null;
  false_positive_savings_zar?: number | null;
  false_negative_savings_zar?: number | null;
  iso_42001_compliance_score?: number | null;
  model_card_status?: 'draft' | 'approved' | 'published' | 'expired' | null;
  iso27001_controls_ok?: boolean | number | null;
  soc2_type2_controls_ok?: boolean | number | null;
  sox_ml_governance_ok?: boolean | number | null;
}): number {
  const n = (v: number | null | undefined, min: number, max: number): number => {
    const x = Number(v || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(min, Math.min(max, x));
  };
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  // savings_vs_ntt_pct (TARGET 30, range -50..+100, 20 pts).
  const svp = n(args.savings_vs_ntt_pct, -50, 100);
  // Linear normalised so 30 == 12 pts, 100 == 20 pts, 0 == 4 pts.
  score += Math.round(Math.max(0, Math.min(20, (svp + 50) / 150 * 20)));
  // cumulative_savings_zar (>= R100M = full 12 pts, log-scaled).
  const cum = Math.max(0, Number(args.cumulative_savings_zar || 0));
  const cumPts = cum <= 0 ? 0 : Math.min(12, Math.log10(cum + 1) - 5);
  score += Math.round(Math.max(0, cumPts));
  // paired_t_pvalue (lower=better, 0=ideal, 0.5=worst, 10 pts).
  const ptp = n(args.paired_t_pvalue, 0, 0.5);
  score += Math.round((1 - ptp / 0.5) * 10);
  // wilcoxon_pvalue (lower=better, 0=ideal, 0.5=worst, 8 pts).
  const wp = n(args.wilcoxon_pvalue, 0, 0.5);
  score += Math.round((1 - wp / 0.5) * 8);
  // brier_skill_score_vs_ntt (1=perfect, 0=no skill, negative=worse, 10 pts).
  const bss = n(args.brier_skill_score_vs_ntt, -1, 1);
  score += Math.round(Math.max(0, ((bss + 1) / 2) * 10));
  // confidence_interval_width_zar (narrower=better; treat 0 ideal, R20M worst, 8 pts).
  const ciw = n(args.confidence_interval_width_zar, 0, 20_000_000);
  score += Math.round((1 - ciw / 20_000_000) * 8);
  // reconciliation_with_w71_savings_ledger (0-100%, 14 pts).
  const recw71 = n(args.reconciliation_with_w71_savings_ledger_pct, 0, 100);
  score += Math.round((recw71 / 100) * 14);
  // false_positive_savings_zar (lower=better; treat 0 ideal, R5M worst, 6 pts).
  const fps = n(args.false_positive_savings_zar, 0, 5_000_000);
  score += Math.round((1 - fps / 5_000_000) * 6);
  // false_negative_savings_zar (lower=better; treat 0 ideal, R5M worst, 6 pts).
  const fns = n(args.false_negative_savings_zar, 0, 5_000_000);
  score += Math.round((1 - fns / 5_000_000) * 6);
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
  score += t(args.sox_ml_governance_ok)     * 5;
  if (score > 130) score = 130;
  if (score < 0) score = 0;
  return score;
}

// ─── Battery health band - composite ────────────────────────────────────
export type NcbHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function batteryHealthBand(
  status: NcbStatus,
  controlScore: number,
  slaBreached: boolean,
  nextCycleDays: number,
  modelCardExpiryDays: number,
  flags: NcbFloorFlags,
  savingsVsNttPct: number,
  pairedTPvalue: number,
  modelCardStatus: 'draft' | 'approved' | 'published' | 'expired' | null | undefined,
): NcbHealthBand {
  if (status === 'recalled') return 'critical';
  if (status === 'rolled_back') return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (modelCardStatus === 'expired') return 'red';
  if (pairedTPvalue >= 0.10) return 'red';
  if (savingsVsNttPct < 0) return 'red';
  if (nextCycleDays > 7) return 'red';
  if (modelCardExpiryDays < 14) return 'red';
  if (status === 'failover_to_prior_cycle') return 'amber';
  if (status === 'significance_failed') return 'amber';
  if (countFloorFlags(flags) >= 3 && controlScore < 90) return 'amber';
  if (controlScore < 60) return 'red';
  if (savingsVsNttPct < 15) return 'amber';
  if (modelCardExpiryDays < 60) return 'amber';
  if (pairedTPvalue >= 0.05) return 'amber';
  if (controlScore < 90) return 'amber';
  return 'green';
}

// ─── 4 sustained-trigger constant ───────────────────────────────────────
// ntt_contract_renegotiation_trigger fires when savings_vs_ntt_pct>=30
// is sustained over this many CONSECUTIVE cycles.
export const NTT_CONTRACT_RENEG_CONSECUTIVE_CYCLES = 4;

// ─── Material savings threshold (ZAR) ───────────────────────────────────
// material_savings_threshold_breached fires when this cycle's
// total_savings_zar exceeds this floor.
export const MATERIAL_SAVINGS_FLOOR_ZAR = 10_000_000;

// ─── Regulator-reportable diversion threshold (%) ───────────────────────
// regulator_reportable_diversion fires when champion vs NTT
// certification disagreement exceeds this fraction on a shared asset
// class.
export const REGULATOR_DIVERSION_DISAGREEMENT_FLOOR_PCT = 5;

// ─── NTT savings TARGET (the [[project_esums_predictive_vs_ntt]] mark) ──
export const NTT_SAVINGS_TARGET_PCT = 30;
