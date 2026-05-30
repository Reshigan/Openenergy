// ─────────────────────────────────────────────────────────────────────────
// Wave 113 — IPP Cost Management & Earned Value Management (EVM) chain.
//
// SECOND Phase-A IPP wave (sibling of W112 WBS & Gantt). Distinct from
// W112 (schedule + EVM live KPIs) — W113 owns the COST BOOK: budget set
// → committed → incurred → measured → variance → reforecast → CR_logged
// → CR_approved → reforecast_published → reconciled → closed. W112
// "where is the project, when does each work package finish, what's the
// float, are we late?"  W113 "what is each ZAR doing, what was approved
// today, where is the cost overrun, how much contingency is left, what
// will it cost at completion?".
//
// Beats Procore Cost / Aconex Cost / Oracle Primavera Unifier / SAP
// S/4HANA EPC / Deltek Cobra / Coreworx / InEight Control / Oracle
// Aconex Cost Management / Hexagon EcoSys / ARES PRISM — each surfaces
// cost as a journal and an exported BAC/EAC PDF; W113 turns it into a
// 12-state P6 cost chain with INVERTED SLA polarity stored in HOURS,
// FLOOR-AT-LARGE on 5 contextual cost flags, 4-step authority ladder
// (cost_engineer → PM → finance_director → CFO), 22-field LIVE EVM
// battery, 4-bridge architecture (W112 schedule + W21 drawdown +
// W30 disbursement + W77 reserve-account), and the SIGNATURE
// MANAGEMENT-RESERVE-DRAW EVERY-tier hard line.
//
// Standards: PMBOK 7 + AACE International RP-67R-11 (EVM) + ANSI EIA-
// 748-D (32-criteria EVM System Description) + ISO 21500 + REIPPPP cost
// reporting + DMRE §34 + IFRS 15 / IAS 11 (long-term contract revenue +
// cost) + SARB large-exposure cost-overrun disclosure.
//
// Forward path (clean cost book):
//   budget_set → committed → incurred → measured → variance_detected
//     → reforecast_drafted → CR_logged → CR_approved
//     → reforecast_published → reconciled → closed (HARD-terminal)
//
// Branches:
//   any non-terminal -> cancelled           (HARD terminal — cost book
//                                            frozen; project killed)
//   CR_logged       -> reforecast_rejected  (TERMINAL-RESTART — CR
//                                            rejected, loops back to
//                                            reforecast_drafted with
//                                            reviewer feedback)
//   CR_approved     -> contingency_drawn    (TERMINAL-BRANCH — CR
//                                            funded from contingency
//                                            reserve; tracks contingency
//                                            consumption)
//
// Tier RE-DERIVED on every transition from total_budget_zar with
// FLOOR-AT-LARGE on 5 contextual flags:
//   - cpi_below_pct_85                 (Cost Performance Index < 0.85)
//   - contingency_consumed_pct_75      (contingency reserve >=75% drawn)
//   - management_reserve_drawn         (management reserve has been
//                                        tapped — sister of W112 floor)
//   - forex_variance_above_pct_10      (FX-component variance >=10%)
//   - multi_currency_book              (cost book spans 2+ currencies)
//
// 4 tiers:
//   small  : <R250m
//   medium : R250m - R1.5b
//   large  : R1.5b - R8b   OR 1 floor flag
//   mega   : >=R8b         OR 2+ floor flags
//
// INVERTED SLA polarity stored as HOURS. Anchor on variance_detected
// (the moment a variance is flagged, give the team time to reforecast
// + CR cycle):
//   small  × variance_detected = 72  hrs ( 3 days)
//   medium × variance_detected = 168 hrs ( 7 days)
//   large  × variance_detected = 336 hrs (14 days)
//   mega   × variance_detected = 480 hrs (20 days)
// INVERTED because larger budgets need more coordination time to
// produce a credible reforecast + drive it through Change Review
// Board sign-off.
//
// SIGNATURE Phase-A IPP regulator crossings (AACE RP-67R + ANSI EIA-
// 748-D + IFRS 15/IAS 11 + REIPPPP cost-overrun reporting + DMRE §34 +
// SARB large-exposure):
//   draw_management_reserve  -> EVERY tier when total_budget_zar >= 1
//                                (W113 SIGNATURE MANAGEMENT-RESERVE-
//                                DRAW hard line — drawing management
//                                reserve is a board-level cost-overrun
//                                event always reportable to lenders +
//                                IPPO + DMRE; sister of W112
//                                mark_late_finish EVERY tier)
//   publish_reforecast       -> large + mega when VAC < 0 OR CPI < 0.85
//                                (REIPPPP cost-overrun disclosure)
//   cancel                   -> EVERY tier (project cost cancellation
//                                = lender + IPPO write-back)
//   approve_CR               -> mega ONLY when CR_value >= 10% of
//                                total_budget_zar (SARB large-exposure)
//   sla_breached             -> large + mega
//
// Write {admin, ipp_developer}. READ all 9 personas. actor_party split:
//   cost_engineer    : set_budget, commit_cost, incur_cost,
//                       measure_progress, detect_variance,
//                       draft_reforecast, draw_contingency
//   PM               : log_CR, approve_CR, reject_reforecast,
//                       publish_reforecast, submit_to_PM_review
//   finance_director : reconcile, close_book
//   CFO              : cancel, draw_management_reserve
//
// Event prefix: `ipp_evm_evt_`. AUDIT_PREFIX_MAP: ipp_evm -> 'ipp'.
// Two crons:
//   - */15 * * * *  SLA sweep (existing pattern)
//   - 20 0 * * *    NEW nightly EVM recompute (refresh CPI/SPI/EAC/
//                    TCPI WITHOUT auto-transitioning — cost decisions
//                    never auto-moved by cron)
// ─────────────────────────────────────────────────────────────────────────

export type IpeStatus =
  | 'budget_set'
  | 'committed'
  | 'incurred'
  | 'measured'
  | 'variance_detected'
  | 'reforecast_drafted'
  | 'CR_logged'
  | 'CR_approved'
  | 'reforecast_published'
  | 'reconciled'
  | 'closed'
  | 'cancelled'
  | 'reforecast_rejected'
  | 'contingency_drawn';

export type IpeAction =
  | 'set_budget'
  | 'commit_cost'
  | 'incur_cost'
  | 'measure_progress'
  | 'detect_variance'
  | 'draft_reforecast'
  | 'log_CR'
  | 'approve_CR'
  | 'reject_reforecast'
  | 'publish_reforecast'
  | 'reconcile'
  | 'close_book'
  | 'cancel'
  | 'draw_contingency'
  | 'draw_management_reserve'
  | 'submit_to_PM_review';

export type IpeTier =
  | 'small'
  | 'medium'
  | 'large'
  | 'mega';

export type IpeParty =
  | 'cost_engineer'
  | 'PM'
  | 'finance_director'
  | 'CFO';

export type IpeEvent =
  | 'ipp_evm_budget_set'
  | 'ipp_evm_cost_committed'
  | 'ipp_evm_cost_incurred'
  | 'ipp_evm_progress_measured'
  | 'ipp_evm_variance_detected'
  | 'ipp_evm_reforecast_drafted'
  | 'ipp_evm_cr_logged'
  | 'ipp_evm_cr_approved'
  | 'ipp_evm_reforecast_rejected'
  | 'ipp_evm_reforecast_published'
  | 'ipp_evm_reconciled'
  | 'ipp_evm_book_closed'
  | 'ipp_evm_cancelled'
  | 'ipp_evm_contingency_drawn'
  | 'ipp_evm_management_reserve_drawn'
  | 'ipp_evm_submitted_to_pm_review'
  | 'ipp_evm_sla_breached';

// closed + cancelled are HARD terminals — the chain officially closes
// there. reforecast_rejected loops back; contingency_drawn is a branch
// state that downstream reconciles from.
const HARD_TERMINALS = new Set<IpeStatus>([
  'closed',
  'cancelled',
]);

const UI_TERMINALS = new Set<IpeStatus>([
  'closed',
  'cancelled',
]);

export function isTerminal(s: IpeStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: IpeStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// All non-terminal states.
const ALL_NON_TERMINAL: IpeStatus[] = [
  'budget_set',
  'committed',
  'incurred',
  'measured',
  'variance_detected',
  'reforecast_drafted',
  'CR_logged',
  'CR_approved',
  'reforecast_published',
  'reconciled',
  'reforecast_rejected',
  'contingency_drawn',
];

// States from which management reserve can be drawn (CFO escalation).
const MR_DRAW_STATES: IpeStatus[] = [
  'variance_detected',
  'reforecast_drafted',
  'CR_logged',
  'CR_approved',
  'reforecast_published',
];

export const TRANSITIONS: Record<IpeAction, { from: IpeStatus[]; to: IpeStatus }> = {
  set_budget:              { from: ['budget_set'],                                                    to: 'budget_set' },
  commit_cost:             { from: ['budget_set', 'committed'],                                       to: 'committed' },
  incur_cost:              { from: ['committed', 'incurred'],                                         to: 'incurred' },
  measure_progress:        { from: ['incurred', 'measured', 'reforecast_published', 'contingency_drawn'], to: 'measured' },
  detect_variance:         { from: ['measured', 'incurred'],                                          to: 'variance_detected' },
  draft_reforecast:        { from: ['variance_detected', 'reforecast_rejected'],                      to: 'reforecast_drafted' },
  log_CR:                  { from: ['reforecast_drafted'],                                            to: 'CR_logged' },
  approve_CR:              { from: ['CR_logged'],                                                     to: 'CR_approved' },
  reject_reforecast:       { from: ['CR_logged'],                                                     to: 'reforecast_rejected' },
  publish_reforecast:      { from: ['CR_approved'],                                                   to: 'reforecast_published' },
  reconcile:               { from: ['reforecast_published', 'measured', 'contingency_drawn'],         to: 'reconciled' },
  close_book:              { from: ['reconciled'],                                                    to: 'closed' },
  cancel:                  { from: ALL_NON_TERMINAL,                                                  to: 'cancelled' },
  draw_contingency:        { from: ['CR_approved'],                                                   to: 'contingency_drawn' },
  draw_management_reserve: { from: MR_DRAW_STATES,                                                    to: 'variance_detected' },
  submit_to_PM_review:     { from: ['reforecast_drafted'],                                            to: 'reforecast_drafted' },
};

export function nextStatus(current: IpeStatus, action: IpeAction): IpeStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'set_budget' && current !== 'budget_set') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: IpeStatus): IpeAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: IpeAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [IpeAction, typeof TRANSITIONS[IpeAction]][]) {
    if (a === 'set_budget') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger budgets
// get LONGER cure runway because mega-projects need more coordination
// time to produce a credible reforecast + drive it through CRB.
const HOUR = 1;
const DAY = 24 * HOUR;

export const SLA_HOURS: Record<IpeStatus, Record<IpeTier, number>> = {
  budget_set:           { small: 2 * DAY,  medium: 5 * DAY,  large: 10 * DAY, mega: 20 * DAY },
  committed:            { small: 5 * DAY,  medium: 10 * DAY, large: 20 * DAY, mega: 30 * DAY },
  incurred:             { small: 5 * DAY,  medium: 10 * DAY, large: 20 * DAY, mega: 30 * DAY },
  measured:             { small: 3 * DAY,  medium: 7 * DAY,  large: 14 * DAY, mega: 21 * DAY },
  variance_detected:    { small: 3 * DAY,  medium: 7 * DAY,  large: 14 * DAY, mega: 20 * DAY },
  reforecast_drafted:   { small: 2 * DAY,  medium: 5 * DAY,  large: 10 * DAY, mega: 14 * DAY },
  CR_logged:            { small: 3 * DAY,  medium: 7 * DAY,  large: 14 * DAY, mega: 21 * DAY },
  CR_approved:          { small: 2 * DAY,  medium: 5 * DAY,  large: 10 * DAY, mega: 14 * DAY },
  reforecast_published: { small: 2 * DAY,  medium: 5 * DAY,  large: 10 * DAY, mega: 14 * DAY },
  reconciled:           { small: 1 * DAY,  medium: 3 * DAY,  large: 7 * DAY,  mega: 10 * DAY },
  reforecast_rejected:  { small: 2 * DAY,  medium: 5 * DAY,  large: 10 * DAY, mega: 14 * DAY },
  contingency_drawn:    { small: 3 * DAY,  medium: 7 * DAY,  large: 14 * DAY, mega: 21 * DAY },
  closed:               { small: 0, medium: 0, large: 0, mega: 0 },
  cancelled:            { small: 0, medium: 0, large: 0, mega: 0 },
};

export function slaWindowHours(status: IpeStatus, tier: IpeTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: IpeStatus, tier: IpeTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from total_budget_zar.
//   <R250m              : small
//   R250m - R1.5b       : medium
//   R1.5b - R8b         : large
//   >=R8b               : mega
export function tierForBudget(budgetZar: number | null | undefined): IpeTier {
  const b = Number(budgetZar ?? 0);
  if (!isFinite(b) || b < 0) return 'small';
  if (b >= 8000000000) return 'mega';
  if (b >= 1500000000) return 'large';
  if (b >= 250000000) return 'medium';
  return 'small';
}

export interface IpeFloorFlags {
  cpi_below_pct_85?: boolean | number | null;
  contingency_consumed_pct_75?: boolean | number | null;
  management_reserve_drawn?: boolean | number | null;
  forex_variance_above_pct_10?: boolean | number | null;
  multi_currency_book?: boolean | number | null;
}

export function countFloorFlags(args: IpeFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.cpi_below_pct_85) +
    t(args.contingency_consumed_pct_75) +
    t(args.management_reserve_drawn) +
    t(args.forex_variance_above_pct_10) +
    t(args.multi_currency_book)
  );
}

// FLOOR-AT-LARGE on any one of the 5 contextual flags.
export function floorAtLarge(args: IpeFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-MEGA on 2+ floor flags.
export function floorAtMega(args: IpeFloorFlags): boolean {
  return countFloorFlags(args) >= 2;
}

export function effectiveTier(
  rawTier: IpeTier,
  flags: IpeFloorFlags,
): IpeTier {
  if (floorAtMega(flags)) return 'mega';
  if (floorAtLarge(flags)) {
    if (rawTier === 'small' || rawTier === 'medium') return 'large';
    return rawTier;
  }
  return rawTier;
}

// Heavy tiers — large + mega. Where reportability + signature
// crossings attach when not on universal hard lines.
const HEAVY_TIERS = new Set<IpeTier>(['large', 'mega']);

export function isHeavyTier(tier: IpeTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: IpeTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
export function crossesIntoRegulator(
  action: IpeAction,
  tier: IpeTier,
  args: {
    total_budget_zar?: number | null;
    cpi?: number | null;
    vac_zar?: number | null;
    cr_value_zar?: number | null;
  },
): boolean {
  const budget = Number(args.total_budget_zar ?? 0);
  const cpi = Number(args.cpi ?? 0);
  const vac = Number(args.vac_zar ?? 0);
  const crValue = Number(args.cr_value_zar ?? 0);

  // W113 SIGNATURE: draw_management_reserve crosses EVERY tier when
  // total_budget_zar >= 1 (any real project drawing MR is a board-level
  // cost-overrun event always reportable to lenders + IPPO + DMRE).
  if (action === 'draw_management_reserve') {
    return budget >= 1;
  }

  // cancel crosses EVERY tier (project cost cancellation = lender +
  // IPPO write-back).
  if (action === 'cancel') {
    return true;
  }

  // publish_reforecast crosses large+mega when VAC < 0 OR CPI < 0.85
  // (REIPPPP cost-overrun disclosure).
  if (action === 'publish_reforecast') {
    if (!HEAVY_TIERS.has(tier)) return false;
    return vac < 0 || (cpi > 0 && cpi < 0.85);
  }

  // approve_CR crosses mega only when CR_value >= 10% of total_budget
  // (SARB large-exposure).
  if (action === 'approve_CR') {
    if (tier !== 'mega') return false;
    if (budget <= 0) return false;
    return crValue / budget >= 0.1;
  }

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: IpeTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<IpeAction, IpeParty> = {
  set_budget:              'cost_engineer',
  commit_cost:             'cost_engineer',
  incur_cost:              'cost_engineer',
  measure_progress:        'cost_engineer',
  detect_variance:         'cost_engineer',
  draft_reforecast:        'cost_engineer',
  draw_contingency:        'cost_engineer',
  log_CR:                  'PM',
  approve_CR:              'PM',
  reject_reforecast:       'PM',
  publish_reforecast:      'PM',
  submit_to_PM_review:     'PM',
  reconcile:               'finance_director',
  close_book:              'finance_director',
  cancel:                  'CFO',
  draw_management_reserve: 'CFO',
};

export function partyForAction(action: IpeAction): IpeParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: IpeAction): IpeEvent | null {
  switch (action) {
    case 'set_budget':              return 'ipp_evm_budget_set';
    case 'commit_cost':             return 'ipp_evm_cost_committed';
    case 'incur_cost':              return 'ipp_evm_cost_incurred';
    case 'measure_progress':        return 'ipp_evm_progress_measured';
    case 'detect_variance':         return 'ipp_evm_variance_detected';
    case 'draft_reforecast':        return 'ipp_evm_reforecast_drafted';
    case 'log_CR':                  return 'ipp_evm_cr_logged';
    case 'approve_CR':              return 'ipp_evm_cr_approved';
    case 'reject_reforecast':       return 'ipp_evm_reforecast_rejected';
    case 'publish_reforecast':      return 'ipp_evm_reforecast_published';
    case 'reconcile':               return 'ipp_evm_reconciled';
    case 'close_book':              return 'ipp_evm_book_closed';
    case 'cancel':                  return 'ipp_evm_cancelled';
    case 'draw_contingency':        return 'ipp_evm_contingency_drawn';
    case 'draw_management_reserve': return 'ipp_evm_management_reserve_drawn';
    case 'submit_to_PM_review':     return 'ipp_evm_submitted_to_pm_review';
  }
}

// ─── LIVE battery (22-field decoration) ─────────────────────────────────

export function slaHoursRemaining(
  status: IpeStatus,
  tier: IpeTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type IpeUrgency = 'critical' | 'high' | 'medium' | 'low';

// INVERTED polarity: mega tier has the LOOSEST urgency thresholds (more
// runway). Small tier has TIGHTEST urgency.
export function urgencyBand(
  tier: IpeTier,
  slaHoursLeft: number,
): IpeUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'small') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  if (tier === 'medium') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 120) return 'medium';
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
  if (slaHoursLeft < 336)   return 'medium';
  return 'low';
}

// 4-step authority ladder: cost_engineer → PM → finance_director → CFO.
export type IpeAuthority =
  | 'cost_engineer'
  | 'PM'
  | 'finance_director'
  | 'CFO';

export function authorityRequired(tier: IpeTier): IpeAuthority {
  switch (tier) {
    case 'small':  return 'cost_engineer';
    case 'medium': return 'PM';
    case 'large':  return 'finance_director';
    case 'mega':   return 'CFO';
  }
}

// Regulator filing window hours — how fast a regulator-crossing event
// must be filed. INVERTED — mega tier gets the most filing time.
export function regulatorFilingWindowHours(tier: IpeTier): number {
  switch (tier) {
    case 'small':  return 24;
    case 'medium': return 48;
    case 'large':  return 72;
    case 'mega':   return 168;
  }
}

// ─── 4-bridge architecture ──────────────────────────────────────────────
// W112 schedule (PV from W112 baseline feeds W113 cost book), W21
// drawdown (debt drawdown gates cost commitment), W30 disbursement
// (use-of-proceeds tagged against W113 incurred lines), W77 reserve-
// account (DSRA/MRA funding cycle tied to W113 close_book + reforecast).
export function bridgesToScheduleChain(
  scheduleRef: string | null | undefined,
): boolean {
  return !!scheduleRef;
}

export function bridgesToDrawdownChain(
  drawdownRef: string | null | undefined,
): boolean {
  return !!drawdownRef;
}

export function bridgesToDisbursementChain(
  disbursementRef: string | null | undefined,
): boolean {
  return !!disbursementRef;
}

export function bridgesToReserveAccountChain(
  reserveAccountRef: string | null | undefined,
): boolean {
  return !!reserveAccountRef;
}

// ─── EVM (Earned Value Management) helpers ──────────────────────────────
//
// CPI  = EV / AC                  (Cost Performance Index)
// SPI  = EV / PV                  (Schedule Performance Index)
// CV   = EV - AC                  (Cost Variance ZAR)
// SV   = EV - PV                  (Schedule Variance ZAR)
// BAC  = total_budget_zar         (Budget At Completion)
// EAC  = BAC / CPI                (Estimate At Completion — most common)
// ETC  = EAC - AC                 (Estimate To Complete)
// VAC  = BAC - EAC                (Variance At Completion)
// TCPI = (BAC - EV) / (BAC - AC)  (To-Complete Performance Index)

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

export function costVarianceZar(
  earnedValueZar: number | null | undefined,
  actualCostZar: number | null | undefined,
): number {
  const ev = Number(earnedValueZar ?? 0);
  const ac = Number(actualCostZar ?? 0);
  if (!isFinite(ev) || !isFinite(ac)) return 0;
  return Math.round((ev - ac) * 100) / 100;
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

export function estimateAtCompletionZar(
  budgetAtCompletionZar: number | null | undefined,
  cpi: number | null | undefined,
): number {
  const bac = Number(budgetAtCompletionZar ?? 0);
  const c = Number(cpi ?? 0);
  if (!isFinite(bac) || !isFinite(c) || c <= 0) return 0;
  const eac = bac / c;
  if (!isFinite(eac)) return 0;
  return Math.round(eac * 100) / 100;
}

export function estimateToCompleteZar(
  eacZar: number | null | undefined,
  actualCostZar: number | null | undefined,
): number {
  const eac = Number(eacZar ?? 0);
  const ac = Number(actualCostZar ?? 0);
  if (!isFinite(eac) || !isFinite(ac)) return 0;
  return Math.round((eac - ac) * 100) / 100;
}

export function varianceAtCompletionZar(
  budgetAtCompletionZar: number | null | undefined,
  eacZar: number | null | undefined,
): number {
  const bac = Number(budgetAtCompletionZar ?? 0);
  const eac = Number(eacZar ?? 0);
  if (!isFinite(bac) || !isFinite(eac)) return 0;
  return Math.round((bac - eac) * 100) / 100;
}

export function toCompletePerformanceIndex(
  budgetAtCompletionZar: number | null | undefined,
  earnedValueZar: number | null | undefined,
  actualCostZar: number | null | undefined,
): number {
  const bac = Number(budgetAtCompletionZar ?? 0);
  const ev = Number(earnedValueZar ?? 0);
  const ac = Number(actualCostZar ?? 0);
  if (!isFinite(bac) || !isFinite(ev) || !isFinite(ac)) return 0;
  const num = bac - ev;
  const den = bac - ac;
  if (den <= 0) return 0;
  const tcpi = num / den;
  if (!isFinite(tcpi)) return 0;
  return Math.round(tcpi * 10000) / 10000;
}

export function contingencyRemainingPct(
  contingencyInitialZar: number | null | undefined,
  contingencyDrawnZar: number | null | undefined,
): number {
  const init = Number(contingencyInitialZar ?? 0);
  const drawn = Number(contingencyDrawnZar ?? 0);
  if (!isFinite(init) || init <= 0) return 0;
  const remaining = init - drawn;
  if (remaining < 0) return 0;
  const pct = (remaining / init) * 100;
  return Math.round(pct * 100) / 100;
}

export function managementReserveRemainingPct(
  mrInitialZar: number | null | undefined,
  mrDrawnZar: number | null | undefined,
): number {
  const init = Number(mrInitialZar ?? 0);
  const drawn = Number(mrDrawnZar ?? 0);
  if (!isFinite(init) || init <= 0) return 0;
  const remaining = init - drawn;
  if (remaining < 0) return 0;
  const pct = (remaining / init) * 100;
  return Math.round(pct * 100) / 100;
}

// EVM completeness index 0-130 — how many cost-book milestones are
// stamped + bonus credits for a clean run.
export function evmCompletenessIndex(args: {
  budget_set?: boolean | number | null;
  committed?: boolean | number | null;
  incurred?: boolean | number | null;
  measured?: boolean | number | null;
  variance_detected?: boolean | number | null;
  reforecast_drafted?: boolean | number | null;
  CR_logged?: boolean | number | null;
  CR_approved?: boolean | number | null;
  reforecast_published?: boolean | number | null;
  reconciled?: boolean | number | null;
  first_close_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.budget_set)           * 15;
  score += t(args.committed)            * 10;
  score += t(args.incurred)             * 10;
  score += t(args.measured)             * 10;
  score += t(args.variance_detected)    * 10;
  score += t(args.reforecast_drafted)   * 10;
  score += t(args.CR_logged)            * 10;
  score += t(args.CR_approved)          * 10;
  score += t(args.reforecast_published) * 10;
  score += t(args.reconciled)           * 15;
  score += t(args.first_close_bonus)    * 20;
  if (score > 130) score = 130;
  return score;
}
