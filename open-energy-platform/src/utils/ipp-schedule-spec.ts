// ─────────────────────────────────────────────────────────────────────────
// Wave 112 — IPP WBS & Gantt Schedule Management chain.
//
// 7th IPP chain (first of Phase A IPP-parity push — IPP had 6 chains vs
// 10-11 elsewhere; target 12 by W117). Distinct from W19 (procurement /
// RFP front-end), W20 (construction COD), W23 (insurance claim), W25
// (HSE incident), W27 (REIPPPP ED commitment), W28 (Grid Connection
// Agreement). W112 is the WBS baseline + Gantt schedule + EVM (CPI/SPI)
// + variance + rebaseline + recovery engine that owns the "where is the
// project, when does each work package finish, what's the float, are we
// late?" question for every IPP project end-to-end.
//
// Beats Primavera P6 / MS Project / Procore Schedule / Aconex Schedule /
// Oracle Primavera Cloud / Trimble Quadri / Asta Powerproject / Deltek
// Acumen Fuse / SAP Project Management — each surfaces schedule as a
// Gantt + an exported PDF; W112 turns it into a 12-state P6 chain with
// INVERTED SLA polarity (larger MW gets LONGER variance + rebaseline
// cure runway because mega-projects need more time to coordinate
// stakeholders), FLOOR-AT-LARGE tier overlay on 5 contextual flags,
// 4-step authority ladder, 20-field LIVE battery (CPI / SPI / SPI_t /
// schedule_variance_pct / cost_variance_pct / earned_value_zar /
// planned_value_zar / actual_cost_zar / critical_path_float_days /
// urgency / authority / regulator filing window / 4-bridge architecture
// to W19+W20+W23+W25 / late-finish-risk / rebaseline-imminent /
// schedule-health-band / completeness 0-130), and signature regulator
// crossings.
//
// Standards: PMBOK 7 + ISO 21500:2021 + AACE International RP 27R-03
// (schedule classification) + AACE 29R-03 (forensic schedule analysis)
// + REIPPPP IPP Office construction reporting + NERSA Grid Code C-5
// (commissioning schedule disclosure) + DMRE Section 34 (procurement
// determination compliance reporting).
//
// Forward path (clean schedule):
//   wbs_drafted -> baseline_set -> in_progress -> status_updated
//     -> variance_detected -> impact_assessed -> rebaselined -> recovered
//     -> completed (HARD-terminal)
//
// Branches:
//   any non-terminal -> suspended    (terminal-ish — schedule paused;
//                                      resume back to in_progress)
//   any non-terminal -> cancelled    (HARD terminal — project killed)
//   in_progress / status_updated / variance_detected / impact_assessed
//                    -> late_finish  (HARD terminal — schedule slipped
//                                      past the contractual final
//                                      milestone; W112 SIGNATURE
//                                      regulator crossing EVERY tier
//                                      when project_capacity_mw >= 1)
//
// Tier RE-DERIVED on every transition from project_capacity_mw with
// FLOOR-AT-LARGE on 5 contextual flags:
//   - critical_path_breach              (any task on critical path is
//                                         late or at risk)
//   - resource_constrained_over_pct_25  (resource over-allocation >=25%)
//   - weather_window_at_risk            (weather forecast misses
//                                         scheduled outdoor work window)
//   - community_disruption_threshold_breached (community-engagement
//                                              event will delay >=14d)
//   - EPC_subcontractor_milestone_at_risk (EPC sub is forecast to
//                                           miss a contractual milestone)
//
// 4 tiers:
//   small  : <10 MW
//   medium : 10-50 MW
//   large  : 50-200 MW OR 1 floor flag
//   mega   : >=200 MW OR 2+ floor flags OR critical_path_breach
//
// INVERTED SLA polarity stored as HOURS. Anchor on variance_detected
// (the moment a slip is logged, give the team time to assess+respond):
//   small  × variance_detected = 120 hrs (5 days)
//   medium × variance_detected = 240 hrs (10 days)
//   large  × variance_detected = 480 hrs (20 days)
//   mega   × variance_detected = 720 hrs (30 days)
// INVERTED because larger projects need more coordination time to
// produce a credible impact assessment + rebaseline proposal.
//
// SIGNATURE regulator crossings (REIPPPP + NERSA Grid Code C-5 + DMRE
// Section 34):
//   mark_late_finish    -> regulator EVERY tier when project_capacity_mw
//                           >= 1 (W112 SIGNATURE late-finish hard line —
//                           any utility-scale IPP slipping past
//                           contractual COD is reportable to IPPO + DMRE
//                           + NERSA; sister of W110 emergency_cancel
//                           EVERY tier + W109 downgrade composite_drop>=
//                           20% + W108 escalate_to_default EVERY tier +
//                           W77 declare_breach EVERY tier + W45 write_off
//                           EVERY tier + W111 restate_pnl EVERY tier on
//                           second-restatement)
//   rebaseline_schedule -> regulator large + mega (REIPPPP §6 baseline
//                           change reporting)
//   suspend_schedule    -> regulator mega only when
//                           critical_path_breach (NERSA C-5 disclosure)
//   cancel_schedule     -> regulator EVERY tier when project_capacity_mw
//                           >= 1 (DMRE §34 procurement-determination
//                           withdrawal)
//   sla_breached        -> regulator large + mega
//
// Write {admin, ipp_developer}. READ all 9 personas. actor_party split:
//   scheduler           : draft_wbs, set_baseline, update_progress,
//                          detect_variance
//   project_manager     : assess_impact, propose_recovery, mark_recovered,
//                          mark_completed, mark_late_finish, suspend,
//                          resume
//   portfolio_director  : rebaseline_schedule, cancel_schedule
//   IPP_CEO             : approve_rebaseline (recorded via signoff_at)
//
// Event prefix: `ipp_schedule_evt_`. AUDIT_PREFIX_MAP:
// ipp_schedule -> 'ipp'. Two crons:
//   - */15 * * * *  SLA sweep
//   - 15 0 * * *    nightly schedule-health recompute (CPI/SPI/float)
//                    — NEW cron pattern registered in wrangler.toml
// ─────────────────────────────────────────────────────────────────────────

export type IpsStatus =
  | 'wbs_drafted'
  | 'baseline_set'
  | 'in_progress'
  | 'status_updated'
  | 'variance_detected'
  | 'impact_assessed'
  | 'rebaselined'
  | 'recovered'
  | 'completed'
  | 'suspended'
  | 'cancelled'
  | 'late_finish';

export type IpsAction =
  | 'draft_wbs'
  | 'set_baseline'
  | 'start_execution'
  | 'update_progress'
  | 'detect_variance'
  | 'assess_impact'
  | 'rebaseline_schedule'
  | 'propose_recovery'
  | 'mark_recovered'
  | 'mark_completed'
  | 'mark_late_finish'
  | 'suspend_schedule'
  | 'resume_schedule'
  | 'cancel_schedule'
  | 'approve_rebaseline'
  | 'reject_rebaseline';

export type IpsTier =
  | 'small'
  | 'medium'
  | 'large'
  | 'mega';

export type IpsParty =
  | 'scheduler'
  | 'project_manager'
  | 'portfolio_director'
  | 'IPP_CEO';

export type IpsEvent =
  | 'ipp_schedule_wbs_drafted'
  | 'ipp_schedule_baseline_set'
  | 'ipp_schedule_execution_started'
  | 'ipp_schedule_progress_updated'
  | 'ipp_schedule_variance_detected'
  | 'ipp_schedule_impact_assessed'
  | 'ipp_schedule_rebaselined'
  | 'ipp_schedule_recovery_proposed'
  | 'ipp_schedule_recovered'
  | 'ipp_schedule_completed'
  | 'ipp_schedule_late_finish_marked'
  | 'ipp_schedule_suspended'
  | 'ipp_schedule_resumed'
  | 'ipp_schedule_cancelled'
  | 'ipp_schedule_rebaseline_approved'
  | 'ipp_schedule_rebaseline_rejected'
  | 'ipp_schedule_sla_breached';

// completed + cancelled + late_finish are HARD terminals — the chain
// officially closes there.
const HARD_TERMINALS = new Set<IpsStatus>([
  'completed',
  'cancelled',
  'late_finish',
]);

const UI_TERMINALS = new Set<IpsStatus>([
  'completed',
  'cancelled',
  'late_finish',
]);

export function isTerminal(s: IpsStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: IpsStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// All non-terminal states (suspend / cancel can fire from any
// non-terminal because pause + kill can happen at any point).
const ALL_NON_TERMINAL: IpsStatus[] = [
  'wbs_drafted',
  'baseline_set',
  'in_progress',
  'status_updated',
  'variance_detected',
  'impact_assessed',
  'rebaselined',
  'recovered',
  'suspended',
];

// States from which a late-finish can be marked — anything mid-execution
// (i.e. after baseline_set, before recovery/completion).
const EXECUTION_STATES: IpsStatus[] = [
  'in_progress',
  'status_updated',
  'variance_detected',
  'impact_assessed',
];

export const TRANSITIONS: Record<IpsAction, { from: IpsStatus[]; to: IpsStatus }> = {
  draft_wbs:           { from: ['wbs_drafted'],                                                      to: 'wbs_drafted' },
  set_baseline:        { from: ['wbs_drafted'],                                                      to: 'baseline_set' },
  start_execution:     { from: ['baseline_set'],                                                     to: 'in_progress' },
  update_progress:     { from: ['in_progress', 'status_updated', 'recovered'],                       to: 'status_updated' },
  detect_variance:     { from: ['status_updated', 'in_progress'],                                    to: 'variance_detected' },
  assess_impact:       { from: ['variance_detected'],                                                to: 'impact_assessed' },
  rebaseline_schedule: { from: ['impact_assessed'],                                                  to: 'rebaselined' },
  propose_recovery:    { from: ['impact_assessed'],                                                  to: 'impact_assessed' },
  mark_recovered:      { from: ['impact_assessed', 'rebaselined'],                                   to: 'recovered' },
  mark_completed:      { from: ['recovered', 'in_progress', 'status_updated'],                       to: 'completed' },
  mark_late_finish:    { from: EXECUTION_STATES,                                                     to: 'late_finish' },
  suspend_schedule:    { from: ['in_progress', 'status_updated', 'variance_detected', 'impact_assessed', 'rebaselined', 'recovered'], to: 'suspended' },
  resume_schedule:     { from: ['suspended'],                                                        to: 'in_progress' },
  cancel_schedule:     { from: ALL_NON_TERMINAL,                                                     to: 'cancelled' },
  approve_rebaseline:  { from: ['rebaselined'],                                                      to: 'rebaselined' },
  reject_rebaseline:   { from: ['rebaselined'],                                                      to: 'impact_assessed' },
};

export function nextStatus(current: IpsStatus, action: IpsAction): IpsStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'draft_wbs' && current !== 'wbs_drafted') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: IpsStatus): IpsAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: IpsAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [IpsAction, typeof TRANSITIONS[IpsAction]][]) {
    if (a === 'draft_wbs') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger MW
// projects get LONGER cure runway because mega-projects need more
// coordination time to produce credible impact assessments and
// rebaseline proposals.
const HOUR = 1;
const DAY = 24 * HOUR;

export const SLA_HOURS: Record<IpsStatus, Record<IpsTier, number>> = {
  wbs_drafted:        { small: 2 * DAY,  medium: 5 * DAY,  large: 10 * DAY, mega: 20 * DAY },
  baseline_set:       { small: 1 * DAY,  medium: 3 * DAY,  large: 7 * DAY,  mega: 14 * DAY },
  in_progress:        { small: 30 * DAY, medium: 60 * DAY, large: 90 * DAY, mega: 180 * DAY },
  status_updated:     { small: 5 * DAY,  medium: 10 * DAY, large: 20 * DAY, mega: 30 * DAY },
  variance_detected:  { small: 5 * DAY,  medium: 10 * DAY, large: 20 * DAY, mega: 30 * DAY },
  impact_assessed:    { small: 3 * DAY,  medium: 7 * DAY,  large: 14 * DAY, mega: 21 * DAY },
  rebaselined:        { small: 2 * DAY,  medium: 5 * DAY,  large: 10 * DAY, mega: 14 * DAY },
  recovered:          { small: 5 * DAY,  medium: 10 * DAY, large: 20 * DAY, mega: 30 * DAY },
  suspended:          { small: 7 * DAY,  medium: 14 * DAY, large: 30 * DAY, mega: 60 * DAY },
  completed:          { small: 0, medium: 0, large: 0, mega: 0 },
  cancelled:          { small: 0, medium: 0, large: 0, mega: 0 },
  late_finish:        { small: 0, medium: 0, large: 0, mega: 0 },
};

export function slaWindowHours(status: IpsStatus, tier: IpsTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: IpsStatus, tier: IpsTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from project_capacity_mw.
//   <10 MW       : small
//   10 - 50 MW   : medium
//   50 - 200 MW  : large
//   >=200 MW     : mega
export function tierForCapacity(capacityMw: number | null | undefined): IpsTier {
  const c = Number(capacityMw ?? 0);
  if (!isFinite(c) || c < 0) return 'small';
  if (c >= 200) return 'mega';
  if (c >= 50) return 'large';
  if (c >= 10) return 'medium';
  return 'small';
}

export interface IpsFloorFlags {
  critical_path_breach?: boolean | number | null;
  resource_constrained_over_pct_25?: boolean | number | null;
  weather_window_at_risk?: boolean | number | null;
  community_disruption_threshold_breached?: boolean | number | null;
  EPC_subcontractor_milestone_at_risk?: boolean | number | null;
}

export function countFloorFlags(args: IpsFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.critical_path_breach) +
    t(args.resource_constrained_over_pct_25) +
    t(args.weather_window_at_risk) +
    t(args.community_disruption_threshold_breached) +
    t(args.EPC_subcontractor_milestone_at_risk)
  );
}

// FLOOR-AT-LARGE on any one of the 5 contextual flags.
export function floorAtLarge(args: IpsFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-MEGA on:
//   - 2+ floor flags
//   - critical_path_breach (always mega — critical-path slip elevates
//                            any project to mega regardless of MW)
export function floorAtMega(args: IpsFloorFlags): boolean {
  if (countFloorFlags(args) >= 2) return true;
  if (args.critical_path_breach) return true;
  return false;
}

export function effectiveTier(
  rawTier: IpsTier,
  flags: IpsFloorFlags,
): IpsTier {
  if (floorAtMega(flags)) return 'mega';
  if (floorAtLarge(flags)) {
    if (rawTier === 'small' || rawTier === 'medium') return 'large';
    return rawTier;
  }
  return rawTier;
}

// Heavy tiers — large + mega. Where reportability + signature
// crossings attach when not on universal hard lines.
const HEAVY_TIERS = new Set<IpsTier>(['large', 'mega']);

export function isHeavyTier(tier: IpsTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: IpsTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
export function crossesIntoRegulator(
  action: IpsAction,
  tier: IpsTier,
  args: {
    project_capacity_mw?: number | null;
    critical_path_breach?: boolean | number | null;
  },
): boolean {
  const capacityMw = Number(args.project_capacity_mw ?? 0);
  const cpBreach = Boolean(args.critical_path_breach);

  // W112 SIGNATURE: mark_late_finish crosses EVERY tier when
  // project_capacity_mw >= 1 (utility-scale threshold). Any utility-
  // scale IPP slipping past contractual COD is reportable to IPPO +
  // DMRE + NERSA.
  if (action === 'mark_late_finish') {
    return capacityMw >= 1;
  }

  // cancel_schedule crosses EVERY tier when project_capacity_mw >= 1
  // (DMRE §34 procurement-determination withdrawal).
  if (action === 'cancel_schedule') {
    return capacityMw >= 1;
  }

  // rebaseline_schedule crosses large + mega (REIPPPP §6 baseline
  // change reporting).
  if (action === 'rebaseline_schedule') {
    return HEAVY_TIERS.has(tier);
  }

  // suspend_schedule crosses mega only when critical_path_breach
  // (NERSA Grid Code C-5 disclosure).
  if (action === 'suspend_schedule') {
    if (tier !== 'mega') return false;
    return cpBreach;
  }

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: IpsTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<IpsAction, IpsParty> = {
  draft_wbs:           'scheduler',
  set_baseline:        'scheduler',
  start_execution:     'project_manager',
  update_progress:     'scheduler',
  detect_variance:     'scheduler',
  assess_impact:       'project_manager',
  rebaseline_schedule: 'portfolio_director',
  propose_recovery:    'project_manager',
  mark_recovered:      'project_manager',
  mark_completed:      'project_manager',
  mark_late_finish:    'project_manager',
  suspend_schedule:    'project_manager',
  resume_schedule:     'project_manager',
  cancel_schedule:     'portfolio_director',
  approve_rebaseline:  'IPP_CEO',
  reject_rebaseline:   'IPP_CEO',
};

export function partyForAction(action: IpsAction): IpsParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: IpsAction): IpsEvent | null {
  switch (action) {
    case 'draft_wbs':           return 'ipp_schedule_wbs_drafted';
    case 'set_baseline':        return 'ipp_schedule_baseline_set';
    case 'start_execution':     return 'ipp_schedule_execution_started';
    case 'update_progress':     return 'ipp_schedule_progress_updated';
    case 'detect_variance':     return 'ipp_schedule_variance_detected';
    case 'assess_impact':       return 'ipp_schedule_impact_assessed';
    case 'rebaseline_schedule': return 'ipp_schedule_rebaselined';
    case 'propose_recovery':    return 'ipp_schedule_recovery_proposed';
    case 'mark_recovered':      return 'ipp_schedule_recovered';
    case 'mark_completed':      return 'ipp_schedule_completed';
    case 'mark_late_finish':    return 'ipp_schedule_late_finish_marked';
    case 'suspend_schedule':    return 'ipp_schedule_suspended';
    case 'resume_schedule':     return 'ipp_schedule_resumed';
    case 'cancel_schedule':     return 'ipp_schedule_cancelled';
    case 'approve_rebaseline':  return 'ipp_schedule_rebaseline_approved';
    case 'reject_rebaseline':   return 'ipp_schedule_rebaseline_rejected';
  }
}

// ─── LIVE battery (20-field decoration) ─────────────────────────────────

export function slaHoursRemaining(
  status: IpsStatus,
  tier: IpsTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type IpsUrgency = 'critical' | 'high' | 'medium' | 'low';

// INVERTED polarity: mega tier has the LOOSEST urgency thresholds (more
// runway) because mega-projects need more coordination time. Small tier
// has TIGHTEST urgency.
export function urgencyBand(
  tier: IpsTier,
  slaHoursLeft: number,
): IpsUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'small') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 72)  return 'medium';
    return 'low';
  }
  if (tier === 'medium') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  if (tier === 'large') {
    if (slaHoursLeft < 48)  return 'critical';
    if (slaHoursLeft < 120) return 'high';
    if (slaHoursLeft < 240) return 'medium';
    return 'low';
  }
  // mega
  if (slaHoursLeft < 72)    return 'critical';
  if (slaHoursLeft < 168)   return 'high';
  if (slaHoursLeft < 360)   return 'medium';
  return 'low';
}

// 4-step authority ladder driven by effective tier.
export type IpsAuthority =
  | 'scheduler'
  | 'project_manager'
  | 'portfolio_director'
  | 'IPP_CEO';

export function authorityRequired(tier: IpsTier): IpsAuthority {
  switch (tier) {
    case 'small':  return 'scheduler';
    case 'medium': return 'project_manager';
    case 'large':  return 'portfolio_director';
    case 'mega':   return 'IPP_CEO';
  }
}

// Regulator filing window hours — how fast a regulator-crossing event
// must be filed. INVERTED — mega tier gets the most filing time
// because the disclosure narrative is more complex.
export function regulatorFilingWindowHours(tier: IpsTier): number {
  switch (tier) {
    case 'small':  return 24;
    case 'medium': return 48;
    case 'large':  return 72;
    case 'mega':   return 168;
  }
}

// ─── 4-bridge architecture ──────────────────────────────────────────────
// W19 procurement-chain (RFP feeds preferred-bidder + EPC contract dates
// into the schedule baseline) / W20 cod-chain (each baseline final-
// milestone date drives the COD chain's contractual_cod_date) / W23
// insurance-claim (claims pause/extend specific tasks via change-
// orders) / W25 hse-incident (incidents trigger stop-work orders that
// hit the critical path).
export function bridgesToProcurementChain(
  procurementRef: string | null | undefined,
): boolean {
  return !!procurementRef;
}

export function bridgesToCodChain(
  codRef: string | null | undefined,
): boolean {
  return !!codRef;
}

export function bridgesToInsuranceClaimChain(
  insuranceClaimRef: string | null | undefined,
): boolean {
  return !!insuranceClaimRef;
}

export function bridgesToHseIncidentChain(
  hseIncidentRef: string | null | undefined,
): boolean {
  return !!hseIncidentRef;
}

// ─── EVM (Earned Value Management) helpers ──────────────────────────────
//
// CPI = EV / AC      (Cost Performance Index; >1 = under budget)
// SPI = EV / PV      (Schedule Performance Index; >1 = ahead of plan)
// SPI_t (earned-schedule SPI) = ES / AT  where ES = earned-schedule
//   (time at which the planned-value curve equals current EV) and AT =
//   actual time. SPI_t corrects late-project SPI drift.
// SV   = EV - PV     (Schedule Variance in ZAR)
// CV   = EV - AC     (Cost Variance in ZAR)
// SV%  = SV / PV * 100
// CV%  = CV / EV * 100

export function costPerformanceIndex(
  earnedValueZar: number | null | undefined,
  actualCostZar: number | null | undefined,
): number {
  const ev = Number(earnedValueZar ?? 0);
  const ac = Number(actualCostZar ?? 0);
  if (!isFinite(ev) || !isFinite(ac) || ac <= 0) return 0;
  const cpi = ev / ac;
  if (!isFinite(cpi)) return 0;
  return Math.round(cpi * 10000) / 10000;
}

export function schedulePerformanceIndex(
  earnedValueZar: number | null | undefined,
  plannedValueZar: number | null | undefined,
): number {
  const ev = Number(earnedValueZar ?? 0);
  const pv = Number(plannedValueZar ?? 0);
  if (!isFinite(ev) || !isFinite(pv) || pv <= 0) return 0;
  const spi = ev / pv;
  if (!isFinite(spi)) return 0;
  return Math.round(spi * 10000) / 10000;
}

export function schedulePerformanceIndexT(
  earnedScheduleDays: number | null | undefined,
  actualTimeDays: number | null | undefined,
): number {
  const es = Number(earnedScheduleDays ?? 0);
  const at = Number(actualTimeDays ?? 0);
  if (!isFinite(es) || !isFinite(at) || at <= 0) return 0;
  const spit = es / at;
  if (!isFinite(spit)) return 0;
  return Math.round(spit * 10000) / 10000;
}

export function scheduleVarianceZar(
  earnedValueZar: number | null | undefined,
  plannedValueZar: number | null | undefined,
): number {
  const ev = Number(earnedValueZar ?? 0);
  const pv = Number(plannedValueZar ?? 0);
  if (!isFinite(ev) || !isFinite(pv)) return 0;
  return Math.round((ev - pv) * 100) / 100;
}

export function costVarianceZar(
  earnedValueZar: number | null | undefined,
  actualCostZar: number | null | undefined,
): number {
  const ev = Number(earnedValueZar ?? 0);
  const ac = Number(actualCostZar ?? 0);
  if (!isFinite(ev) || !isFinite(ac)) return 0;
  return Math.round((ev - ac) * 100) / 100;
}

export function scheduleVariancePct(
  earnedValueZar: number | null | undefined,
  plannedValueZar: number | null | undefined,
): number {
  const ev = Number(earnedValueZar ?? 0);
  const pv = Number(plannedValueZar ?? 0);
  if (!isFinite(ev) || !isFinite(pv) || pv <= 0) return 0;
  const pct = ((ev - pv) / pv) * 100;
  if (!isFinite(pct)) return 0;
  return Math.round(pct * 100) / 100;
}

export function costVariancePct(
  earnedValueZar: number | null | undefined,
  actualCostZar: number | null | undefined,
): number {
  const ev = Number(earnedValueZar ?? 0);
  const ac = Number(actualCostZar ?? 0);
  if (!isFinite(ev) || !isFinite(ac) || ev <= 0) return 0;
  const pct = ((ev - ac) / ev) * 100;
  if (!isFinite(pct)) return 0;
  return Math.round(pct * 100) / 100;
}

// Critical path float — days of slack on the longest dependency chain.
// 0 = fully critical (any slip = late finish). Negative = already over.
export function criticalPathFloatDays(
  longestPathTotalFloatDays: number | null | undefined,
): number {
  const f = Number(longestPathTotalFloatDays ?? 0);
  if (!isFinite(f)) return 0;
  return Math.round(f);
}

// Days-to-planned-finish (positive = on time, negative = overrun).
export function daysToPlannedFinish(
  plannedFinish: string | Date | null | undefined,
  now: Date,
): number | null {
  if (!plannedFinish) return null;
  const t = new Date(plannedFinish);
  if (isNaN(t.getTime())) return null;
  return Math.round((t.getTime() - now.getTime()) / (24 * 3600 * 1000));
}

// Days-since-baseline (elapsed since baseline_set).
export function daysSinceBaseline(
  baselineAt: string | Date | null | undefined,
  now: Date,
): number {
  if (!baselineAt) return 0;
  const t = new Date(baselineAt);
  if (isNaN(t.getTime())) return 0;
  const ms = now.getTime() - t.getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / (24 * 3600 * 1000));
}

// Is late-finish imminent? Within 7 days of planned finish AND SPI<0.9.
export function isLateFinishRisk(
  status: IpsStatus,
  daysToFinish: number | null,
  spi: number,
): boolean {
  if (HARD_TERMINALS.has(status)) return false;
  if (daysToFinish === null) return false;
  if (daysToFinish > 7) return false;
  return spi > 0 && spi < 0.9;
}

// Is rebaseline imminent? In impact_assessed AND SPI<0.8 AND CPI<0.85.
export function isRebaselineImminent(
  status: IpsStatus,
  spi: number,
  cpi: number,
): boolean {
  if (status !== 'impact_assessed') return false;
  if (spi <= 0) return false;
  if (cpi <= 0) return false;
  return spi < 0.8 && cpi < 0.85;
}

// Schedule health band — driven by SPI + CPI + critical-path float.
export type IpsHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function scheduleHealthBand(
  spi: number,
  cpi: number,
  criticalPathFloat: number,
): IpsHealthBand {
  if (criticalPathFloat < 0) return 'critical';
  if (spi > 0 && spi < 0.7) return 'critical';
  if (cpi > 0 && cpi < 0.7) return 'critical';
  if (criticalPathFloat <= 2) return 'red';
  if (spi > 0 && spi < 0.85) return 'red';
  if (cpi > 0 && cpi < 0.85) return 'red';
  if (criticalPathFloat <= 7) return 'amber';
  if (spi > 0 && spi < 0.95) return 'amber';
  if (cpi > 0 && cpi < 0.95) return 'amber';
  return 'green';
}

// Schedule completeness index 0-130 — how many key milestones are
// stamped + bonus credits for a clean run.
export function scheduleCompletenessIndex(args: {
  wbs_drafted?: boolean | number | null;
  baseline_set?: boolean | number | null;
  in_progress?: boolean | number | null;
  status_updated?: boolean | number | null;
  variance_detected?: boolean | number | null;
  impact_assessed?: boolean | number | null;
  rebaselined?: boolean | number | null;
  recovered?: boolean | number | null;
  completed?: boolean | number | null;
  clean_no_variance_bonus?: boolean | number | null;
  clean_no_rebaseline_bonus?: boolean | number | null;
  clean_no_suspend_bonus?: boolean | number | null;
  on_time_finish_bonus?: boolean | number | null;
  cpi_above_1_bonus?: boolean | number | null;
  spi_above_1_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.wbs_drafted)             * 10;
  score += t(args.baseline_set)            * 15;
  score += t(args.in_progress)             * 10;
  score += t(args.status_updated)          * 5;
  score += t(args.variance_detected)       * 5;
  score += t(args.impact_assessed)         * 5;
  score += t(args.rebaselined)             * 5;
  score += t(args.recovered)               * 10;
  score += t(args.completed)               * 15;
  score += t(args.clean_no_variance_bonus) * 10;
  score += t(args.clean_no_rebaseline_bonus) * 10;
  score += t(args.clean_no_suspend_bonus)  * 5;
  score += t(args.on_time_finish_bonus)    * 10;
  score += t(args.cpi_above_1_bonus)       * 7;
  score += t(args.spi_above_1_bonus)       * 8;
  if (score > 130) score = 130;
  return score;
}
