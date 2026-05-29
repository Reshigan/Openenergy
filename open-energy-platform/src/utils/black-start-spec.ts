// ─────────────────────────────────────────────────────────────────────────
// Wave 84 — Grid Black-Start Capability Contracting & System-Restoration
// Drill chain (P6) — 10th Grid chain.
//
// The RESTORATION engine of the System Operator. When the grid suffers a
// total or partial blackout the SO must re-energise the dead bus from
// "cranking" generators (hydro, OCGT, diesel) that can start without an
// external power source and re-build the transmission network step by step
// until normal generators can be re-synchronised and load picked up. That
// capability is bought and tested under SA Grid Code Sections OC-1 (System
// Operating) / OC-12 (Restoration) + NTCSA Grid-Code Annex on Black-Start
// + NERSA System Defence & Restoration Plan + IEC 60870-5-101/104 Telecontrol
// + IEEE Std 1547 + NRS 048-2 (Power Quality). Each contracted Black-Start
// Capability (BSC) unit must demonstrate readiness annually under a witnessed
// restoration drill where it (1) starts on cranking power, (2) energises a
// dead bus, (3) holds frequency and voltage, (4) picks up auxiliary load,
// (5) backfeeds the SO's restoration path within the contracted window.
//
// This chain governs that lifecycle end-to-end: needs assessment → RFP →
// bid evaluation → contract award/execution → annual drill scheduling →
// drill execution → drill completion → recertification | drill failure →
// remediation → re-drill. Terminals: recertified, contract_terminated.
//
// DISTINCT from every other Grid chain by FUNCTION:
//   - [[project-wave8-grid-wheeling]]              — transmission charges (commercial).
//   - [[project-wave13-dispatch-nominations]]      — day-ahead/intra-day dispatch.
//   - [[project-wave18-planned-outage-chain]]      — planned maintenance outage approval.
//   - [[project-wave28-gca-chain]]                 — grid-connection agreement (one-off).
//   - [[project-wave34-load-curtailment-chain]]    — CSC-1 load-shedding ACTIVATION.
//   - [[project-wave50-reserve-activation-chain]]  — continuous-ancillary reserves (in-merit).
//   - [[project-wave58-grid-capacity-allocation-chain]] — connection-capacity queue.
//   - [[project-wave67-grid-code-compliance-chain]] — technical conformance monitoring.
//   - [[project-wave75-connection-energization-chain]] — first-time go-live commissioning.
//
// W84 is FOUNDATIONAL L5 — beats PJM Black Start Service / ERCOT Black Start /
// National Grid ESO Black Start / ENTSO-E System Defence & Restoration Plan
// (ER-LFCR) / MISO Black Start Resource — all of which run as
// solicit/award/annual-paper-test workflows with manual readiness tracking.
// Edge: LIVE restoration-readiness battery — total contracted MW, target MW,
// coverage ratio, geographic diversity index, fuel-type diversity, voltage-
// class coverage, days since last drill, rolling drill-pass-rate, restoration-
// path validity flag, criticality score — derived on every transition.
//
// Clean path:
//   needs_assessed → solicitation_issued → bid_evaluation
//                  → contract_awarded → contract_executed
//                  → drill_scheduled → drill_in_progress → drill_completed
//                  → recertified                                   (terminal OK)
//
// Failure / remediation branch:
//   drill_completed → drill_failed → remediation_required → drill_scheduled
//                                                       → (loop until pass)
//
// Terminal:
//   contract_terminated — irrecoverable failure / loss of capability /
//                         provider exit. From any non-terminal.
//
// Tiers (4) by contracted black_start_capacity_mw — drive SLA + reportability:
//   minor              < 50      (small DG / embedded BSC)
//   standard           < 250     (sub-transmission BSC unit)
//   material           < 500     (transmission-level BSC unit)
//   island_critical    >= 500    (whole-region restoration anchor)
//
// FLOOR: a SYSTEM-CRITICAL voltage_class ('transmission' or 'bulk') OR
// restoration_role = 'cranking_anchor' floors at 'material' regardless of
// raw MW. Anchor units restore the cranking path for everything downstream
// — losing one means losing the entire restoration sequence.
//
// SLA matrix is URGENT — the LARGER the BSC unit, the TIGHTER every window.
// A critical island-restoration anchor must recover within hours, not days
// (every minute of dead bus is national-scale economic loss). Same urgency
// family as W34/W50/W67/W75 + Trader counterparty-margin / OEM-Support
// security-remediation.
//
// Reportability — the W84 SIGNATURE is RELIABILITY-driven (restoration failure
// is a national grid risk that ALWAYS escalates):
//   fail_drill          crosses for EVERY tier — drill failure is ALWAYS a
//                       NERSA reliability event regardless of unit size.
//   terminate_contract  crosses for EVERY tier — loss of BSC capability is
//                       ALWAYS a reliability event (the SO carries less
//                       restoration capacity tomorrow than yesterday).
//   recertify           crosses for material + island_critical (positive
//                       reliability event — large units recertified is the
//                       success signal NERSA wants to see).
//   require_remediation crosses for material + island_critical (large-unit
//                       remediation campaigns are heightened risk).
//   sla_breached        crosses for material + island_critical (large-unit
//                       schedule slippage erodes restoration cover).
//
// Single SO desk write {admin, support, grid_operator} — the System Operator
// records the whole lifecycle (same single-party model as W34/W50/W58/W67).
// actor_party tags the function performing each step (system_operator /
// bsc_provider / drill_observer / restoration_planner) for audit
// attribution only, NOT access.
// ─────────────────────────────────────────────────────────────────────────

export type BlackStartStatus =
  | 'needs_assessed'
  | 'solicitation_issued'
  | 'bid_evaluation'
  | 'contract_awarded'
  | 'contract_executed'
  | 'drill_scheduled'
  | 'drill_in_progress'
  | 'drill_completed'
  | 'recertified'
  | 'drill_failed'
  | 'remediation_required'
  | 'contract_terminated';

export type BlackStartAction =
  | 'issue_solicitation'
  | 'close_solicitation'
  | 'award_contract'
  | 'execute_contract'
  | 'schedule_drill'
  | 'commence_drill'
  | 'complete_drill'
  | 'recertify'
  | 'fail_drill'
  | 'require_remediation'
  | 'complete_remediation'
  | 'terminate_contract';

export type BlackStartTier = 'minor' | 'standard' | 'material' | 'island_critical';

// Functional party performing each step (audit attribution only).
export type BlackStartParty =
  | 'system_operator'
  | 'bsc_provider'
  | 'drill_observer'
  | 'restoration_planner';

// Restoration role — anchor units crank the path; downstream units re-energise
// stepwise. Anchor failure cascades through the whole restoration sequence.
export type RestorationRole = 'cranking_anchor' | 'restoration_unit' | 'auxiliary_unit';

// Voltage class — drives the system-criticality floor.
export type VoltageClass = 'distribution' | 'sub_transmission' | 'transmission' | 'bulk';

// Cranking energy source — what wakes the BSC unit up without grid power.
export type CrankingSource =
  | 'hydro'                 // self-cranking via mechanical head
  | 'diesel_starter'        // small diesel generator on site
  | 'battery_inverter'      // station-battery + inverter
  | 'compressed_air';       // gas-turbine compressed-air start

export type BlackStartEvent =
  | 'black_start.solicitation_issued'
  | 'black_start.bid_evaluation'
  | 'black_start.contract_awarded'
  | 'black_start.contract_executed'
  | 'black_start.drill_scheduled'
  | 'black_start.drill_in_progress'
  | 'black_start.drill_completed'
  | 'black_start.recertified'
  | 'black_start.drill_failed'
  | 'black_start.remediation_required'
  | 'black_start.contract_terminated'
  | 'black_start.sla_breached';

const TERMINALS = new Set<BlackStartStatus>(['recertified', 'contract_terminated']);

export function isTerminal(s: BlackStartStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<BlackStartAction, { from: BlackStartStatus[]; to: BlackStartStatus }> = {
  issue_solicitation:    { from: ['needs_assessed'],                                                                                                                                                  to: 'solicitation_issued' },
  close_solicitation:    { from: ['solicitation_issued'],                                                                                                                                             to: 'bid_evaluation' },
  award_contract:        { from: ['bid_evaluation'],                                                                                                                                                  to: 'contract_awarded' },
  execute_contract:      { from: ['contract_awarded'],                                                                                                                                                to: 'contract_executed' },
  schedule_drill:        { from: ['contract_executed', 'remediation_required'],                                                                                                                       to: 'drill_scheduled' },
  commence_drill:        { from: ['drill_scheduled'],                                                                                                                                                 to: 'drill_in_progress' },
  complete_drill:        { from: ['drill_in_progress'],                                                                                                                                               to: 'drill_completed' },
  recertify:             { from: ['drill_completed'],                                                                                                                                                 to: 'recertified' },
  fail_drill:            { from: ['drill_completed'],                                                                                                                                                 to: 'drill_failed' },
  require_remediation:   { from: ['drill_failed'],                                                                                                                                                    to: 'remediation_required' },
  complete_remediation:  { from: ['remediation_required'],                                                                                                                                            to: 'drill_scheduled' },
  terminate_contract:    { from: ['needs_assessed', 'solicitation_issued', 'bid_evaluation', 'contract_awarded', 'contract_executed', 'drill_scheduled', 'drill_in_progress', 'drill_completed', 'drill_failed', 'remediation_required'], to: 'contract_terminated' },
};

export function nextStatus(current: BlackStartStatus, action: BlackStartAction): BlackStartStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: BlackStartStatus): BlackStartAction[] {
  const acts: BlackStartAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [BlackStartAction, typeof TRANSITIONS[BlackStartAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LARGER the BSC unit, the TIGHTER every window. A
// critical island-restoration anchor's annual drill cycle is far tighter
// than a small embedded unit because the system cannot afford to lose its
// restoration cover for any extended period.
export const SLA_MINUTES: Record<BlackStartStatus, Record<BlackStartTier, number>> = {
  needs_assessed:       { minor: 30 * DAY,  standard: 21 * DAY, material: 14 * DAY, island_critical: 7 * DAY },
  solicitation_issued:  { minor: 60 * DAY,  standard: 45 * DAY, material: 30 * DAY, island_critical: 21 * DAY },
  bid_evaluation:       { minor: 30 * DAY,  standard: 21 * DAY, material: 14 * DAY, island_critical: 10 * DAY },
  contract_awarded:     { minor: 14 * DAY,  standard: 10 * DAY, material: 7 * DAY,  island_critical: 5 * DAY },
  contract_executed:    { minor: 90 * DAY,  standard: 60 * DAY, material: 45 * DAY, island_critical: 30 * DAY },
  drill_scheduled:      { minor: 14 * DAY,  standard: 10 * DAY, material: 7 * DAY,  island_critical: 5 * DAY },
  drill_in_progress:    { minor: 4 * HOUR,  standard: 3 * HOUR, material: 2 * HOUR, island_critical: 1 * HOUR },
  drill_completed:      { minor: 5 * DAY,   standard: 3 * DAY,  material: 2 * DAY,  island_critical: 1 * DAY },
  drill_failed:         { minor: 7 * DAY,   standard: 5 * DAY,  material: 3 * DAY,  island_critical: 1 * DAY },
  remediation_required: { minor: 120 * DAY, standard: 90 * DAY, material: 60 * DAY, island_critical: 30 * DAY },
  recertified:          { minor: 0, standard: 0, material: 0, island_critical: 0 },
  contract_terminated:  { minor: 0, standard: 0, material: 0, island_critical: 0 },
};

export function slaWindowMinutes(status: BlackStartStatus, tier: BlackStartTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: BlackStartStatus, tier: BlackStartTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

const TIER_RANK: Record<BlackStartTier, number> = { minor: 0, standard: 1, material: 2, island_critical: 3 };
const LARGE_TIERS = new Set<BlackStartTier>(['material', 'island_critical']);

export function isLargeTier(tier: BlackStartTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Base tier by contracted black-start capacity (MW).
export function baseTierForCapacity(mw: number): BlackStartTier {
  if (mw < 50) return 'minor';
  if (mw < 250) return 'standard';
  if (mw < 500) return 'material';
  return 'island_critical';
}

// A system-critical voltage class OR a cranking-anchor restoration role
// floors the effective tier at 'material' regardless of raw MW. Anchor
// units crank the entire restoration path — losing one cascades.
export function isSystemCritical(voltage: VoltageClass, role: RestorationRole): boolean {
  if (voltage === 'transmission' || voltage === 'bulk') return true;
  if (role === 'cranking_anchor') return true;
  return false;
}

export function tierForCapacity(
  mw: number,
  voltage: VoltageClass,
  role: RestorationRole,
): BlackStartTier {
  const base = baseTierForCapacity(mw);
  if (isSystemCritical(voltage, role) && TIER_RANK[base] < TIER_RANK['material']) {
    return 'material';
  }
  return base;
}

// Reportability matrix (the W84 SIGNATURE is RELIABILITY-driven):
//   - fail_drill crosses for EVERY tier — restoration failure is ALWAYS a
//     NERSA reliability event regardless of unit size.
//   - terminate_contract crosses for EVERY tier — loss of BSC capability
//     is ALWAYS a reliability event.
//   - recertify crosses for material + island_critical (positive event).
//   - require_remediation crosses for material + island_critical.
export function crossesIntoRegulator(action: BlackStartAction, tier: BlackStartTier): boolean {
  if (action === 'fail_drill') return true;
  if (action === 'terminate_contract') return true;
  if (action === 'recertify') return LARGE_TIERS.has(tier);
  if (action === 'require_remediation') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: BlackStartTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportable irrespective of action — true when system-critical OR large tier.
export function isReportable(tier: BlackStartTier, systemCritical: boolean): boolean {
  return systemCritical || LARGE_TIERS.has(tier);
}

// Functional party each action represents. Audit attribution only.
const ACTION_PARTY: Record<BlackStartAction, BlackStartParty> = {
  issue_solicitation:    'system_operator',
  close_solicitation:    'system_operator',
  award_contract:        'system_operator',
  execute_contract:      'system_operator',
  schedule_drill:        'restoration_planner',
  commence_drill:        'bsc_provider',
  complete_drill:        'bsc_provider',
  recertify:             'drill_observer',
  fail_drill:            'drill_observer',
  require_remediation:   'restoration_planner',
  complete_remediation:  'bsc_provider',
  terminate_contract:    'system_operator',
};

export function partyForAction(action: BlackStartAction): BlackStartParty {
  return ACTION_PARTY[action];
}

// ── "Beat best-in-class" decision helpers ─────────────────────────────────
// PJM Black Start Service / ERCOT Black Start / National Grid ESO Black
// Start / ENTSO-E System Defence & Restoration / MISO Black Start Resource
// — all run as solicit/award/annual-paper-test workflows with manual
// readiness tracking. The platform's edge is a LIVE restoration-readiness
// battery exposed on every record: contracted-MW total, target MW, coverage
// ratio, geographic + fuel + voltage diversity indices, days since last
// drill, rolling drill-pass-rate, restoration-path validity flag, criticality
// score — all derived from the same inputs each transition so numbers match
// across the lifecycle.

// Days since the last completed drill (positive = past, 0 = today).
export function daysSinceLastDrill(lastDrillAt: Date | null, now: Date): number | null {
  if (!lastDrillAt) return null;
  const ms = now.getTime() - lastDrillAt.getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

// Days until next annual drill is due (positive = due in N days, 0 = today,
// negative = overdue by |N| days). Anchored at the last drill + 365d.
export function daysUntilNextDrillDue(lastDrillAt: Date | null, now: Date): number | null {
  if (!lastDrillAt) return null;
  const dueAt = new Date(lastDrillAt.getTime() + 365 * 24 * 60 * 60 * 1000);
  const ms = dueAt.getTime() - now.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

// Coverage ratio — contracted black-start MW vs SO target MW (0..n).
// 1.0 = exactly at target; below 1 = under-cover; above 1 = surplus cover.
export function restorationCoverageRatio(contractedMw: number, targetMw: number): number {
  if (targetMw <= 0) return 0;
  return Math.max(0, contractedMw / targetMw);
}

// Geographic diversity index (0..1). Inputs are the count of distinct
// provinces represented (out of 9 SA provinces) by all contracted BSC
// units serving the same restoration zone.
export function geographicDiversityIndex(provincesRepresented: number): number {
  return Math.max(0, Math.min(9, provincesRepresented)) / 9;
}

// Fuel-type diversity index (0..1, 1.0 = perfectly diverse across all
// cranking sources). Computed across the 4 cranking-source buckets:
// hydro / diesel_starter / battery_inverter / compressed_air. 1 - L1
// dispersion from uniform.
export function fuelDiversityIndex(buckets: Record<string, number>): number {
  const keys = ['hydro', 'diesel_starter', 'battery_inverter', 'compressed_air'];
  const counts = keys.map((k) => Math.max(0, buckets[k] || 0));
  const total = counts.reduce((s, n) => s + n, 0);
  if (total <= 0) return 0;
  const uniform = total / keys.length;
  const deviation = counts.reduce((s, n) => s + Math.abs(n - uniform), 0);
  const maxDeviation = 2 * (total - uniform);
  if (maxDeviation <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - deviation / maxDeviation));
}

// Voltage-class coverage index (0..1). Fraction of the 4 voltage classes
// (distribution / sub_transmission / transmission / bulk) that have at
// least one BSC unit serving them.
export function voltageClassCoverage(classesCovered: number): number {
  return Math.max(0, Math.min(4, classesCovered)) / 4;
}

// Rolling drill pass rate over the last N drills (0..1).
export function drillPassRate(drillsPassed: number, drillsTotal: number): number {
  if (drillsTotal <= 0) return 0;
  return Math.max(0, Math.min(1, drillsPassed / drillsTotal));
}

// Restoration-path validity flag — does the unit have a documented,
// witnessed, end-to-end restoration sequence ALL of:
//   - cranking source confirmed
//   - dead-bus energisation step witnessed
//   - frequency hold (50 Hz +/- 0.5 Hz) confirmed
//   - voltage hold (within +/- 5%) confirmed
//   - auxiliary load pickup confirmed
//   - backfeed to SO restoration path within contracted minutes
export function restorationPathValid(
  crankingSourceConfirmed: boolean,
  deadBusEnergisationWitnessed: boolean,
  frequencyHoldOk: boolean,
  voltageHoldOk: boolean,
  auxiliaryLoadPickupOk: boolean,
  backfeedWithinSlaOk: boolean,
): boolean {
  return (
    crankingSourceConfirmed &&
    deadBusEnergisationWitnessed &&
    frequencyHoldOk &&
    voltageHoldOk &&
    auxiliaryLoadPickupOk &&
    backfeedWithinSlaOk
  );
}

// Criticality score (0..100, higher = more critical). Composite:
//   +30 if restoration_role == 'cranking_anchor'
//   +20 if voltage_class in ('transmission', 'bulk')
//   +20 if tier == 'island_critical'
//   +10 if days_overdue > 0 (annual drill overdue)
//   +10 if drill_pass_rate < 0.5
//   +10 if !restoration_path_valid
export function criticalityScore(input: {
  role: RestorationRole;
  voltage: VoltageClass;
  tier: BlackStartTier;
  daysUntilNextDrillDue: number | null;
  drillPassRate: number;
  restorationPathValid: boolean;
}): number {
  let s = 0;
  if (input.role === 'cranking_anchor') s += 30;
  if (input.voltage === 'transmission' || input.voltage === 'bulk') s += 20;
  if (input.tier === 'island_critical') s += 20;
  if (input.daysUntilNextDrillDue !== null && input.daysUntilNextDrillDue < 0) s += 10;
  if (input.drillPassRate < 0.5) s += 10;
  if (!input.restorationPathValid) s += 10;
  return Math.max(0, Math.min(100, s));
}

// Predicted lifecycle days — from issue_solicitation through to recertified
// for the current contract cycle. Used for capacity planning.
const LIFECYCLE_STATES: BlackStartStatus[] = [
  'needs_assessed',
  'solicitation_issued',
  'bid_evaluation',
  'contract_awarded',
  'contract_executed',
  'drill_scheduled',
  'drill_in_progress',
  'drill_completed',
];

export function predictedLifecycleDays(tier: BlackStartTier): number {
  const totalMinutes = LIFECYCLE_STATES.reduce((sum, s) => sum + SLA_MINUTES[s][tier], 0);
  return Math.round(totalMinutes / (60 * 24));
}
