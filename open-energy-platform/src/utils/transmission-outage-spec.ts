// ─────────────────────────────────────────────────────────────────────────
// Wave 110 — Transmission Network Outage Coordination & N-1 Security
// Assessment chain.
//
// 11th Grid chain. Distinct from W18 (asset-owner-driven planned outage
// on IPP generators). W110 is the SO-initiated EHV / HV transmission
// line + substation outage coordination engine that runs N-1 contingency
// security assessment, gets reliability-committee approval, supervises
// the outage in real-time, and verifies return-to-service. Sister of
// W13 dispatch nominations (the PRE side), W34 load curtailment (the
// system-stress sibling), W50 reserve activation (the SUPPLY side), and
// W105 imbalance settlement (the post-fact financial side).
//
// Beats Hitachi Energy Lumada / ABB Network Manager / Siemens Spectrum
// / GE PowerOn / OSI monarch / OATI WebTrans / Eskom NCC / PowerWorld
// / Schneider EcoStruxure ADMS — each surfaces TX outage planning as a
// calendar + a CSV of affected feeders; W110 turns it into a 12-state
// P6 chain with URGENT SLA polarity (higher voltage = TIGHTER assessment
// window), FLOOR-AT-HIGH tier overlay on 5 contextual flags, 4-step
// authority ladder, 16-field LIVE battery (N-1 pass / fail / security
// margin / hours-to-window / hours-in-outage / hours-to-completion /
// urgency / authority / regulator filing window / 3-bridge architecture
// to W18+W34+W50 / completeness 0-130 / extension-imminent / emergency-
// cancel-risk / RTS-clean), and signature regulator crossings.
//
// Standards: NERSA Grid Code C-3 + NTCSA Outage Coordination Process +
// Eskom System Operator Standards + ENTSO-E SO Reg 2017/1485 equivalent.
//
// Forward path (clean outage):
//   outage_requested → security_assessment → n1_contingency_run
//     → reliability_committee_review → outage_approved → outage_window_open
//     → outage_in_progress → outage_completed → return_to_service
//     → post_outage_review → archived (HARD-terminal)
//
// Branches:
//   any non-terminal → rejected             (terminal — committee reject)
//   any non-terminal → withdrawn            (terminal — requester pulls)
//   outage_in_progress → suspended          (real-time security
//                                            deterioration → resume back
//                                            to in_progress OR
//                                            emergency_cancelled)
//   any non-terminal → emergency_cancelled  (terminal — forced cancel
//                                            due to system event; W110
//                                            SIGNATURE crossing)
//   outage_in_progress → extended → outage_in_progress (loop — committee
//                                                       grants extension)
//
// Tier RE-DERIVED on every transition from transmission_voltage_kv with
// FLOOR-AT-HIGH on 5 contextual flags:
//   - peak_demand_period
//   - single_circuit_radial
//   - cross_border_interconnector
//   - black_start_path
//   - national_grid_backbone
//
// 4 tiers:
//   low_sub132kv      : <132 kV
//   medium_132kv      : 132 kV
//   high_275kv        : 275 kV OR 1 floor flag
//   critical_400kv_plus: >=400 kV OR 2+ floor flags OR national-grid-
//                        backbone OR black-start-path
//
// URGENT SLA polarity stored as HOURS (multi-day windows). Anchor on
// outage_requested:
//   low_sub132kv        × outage_requested = 14d = 336 hrs
//   medium_132kv        × outage_requested =  7d = 168 hrs
//   high_275kv          × outage_requested =  3d =  72 hrs
//   critical_400kv_plus × outage_requested =  1d =  24 hrs
//
// SIGNATURE regulator crossings (NERSA Grid Code C-3 + SO standards):
//   emergency_cancel    → regulator EVERY tier (W110 SIGNATURE
//                          forced-cancel hard line — forced cancellation
//                          of an APPROVED TX outage is always a security
//                          event reportable to NERSA; sister of W104
//                          reject EVERY tier on regulator_relevant +
//                          W105 raise_dispute EVERY tier on HV_brp +
//                          W106 impose_sanction EVERY tier on
//                          licence_revocation + W107 reject_order EVERY
//                          tier on counterparty_below_B + W108
//                          escalate_to_default EVERY tier + W109
//                          downgrade EVERY tier on composite_drop>=20%)
//   extend_outage       → regulator high_275kv + critical_400kv_plus
//   approve_outage      → regulator critical_400kv_plus only when
//                          national_grid_backbone (security disclosure)
//   suspend_outage      → regulator high_275kv + critical_400kv_plus
//   sla_breached        → high_275kv + critical_400kv_plus
//
// Write {admin, grid_operator}. READ all 9 personas. actor_party split:
//   outage_planner       : request_outage, start_security_assessment,
//                          withdraw
//   system_operator      : run_n1_contingency, open_outage_window,
//                          commence_outage, suspend_outage, resume_outage,
//                          emergency_cancel, complete_outage,
//                          verify_return_to_service
//   reliability_committee: submit_to_reliability_committee,
//                          approve_outage, reject_outage, extend_outage
//   archive_clerk        : close_post_outage_review, archive_outage
//
// Event prefix: `transmission_outage_evt_`. AUDIT_PREFIX_MAP:
// transmission_outage → 'grid'. Two crons:
//   - */15 * * * *  SLA sweep
//   - 5 0 * * *     outage-window-monitor (refreshes hours-counters
//                    WITHOUT auto-transitioning)
// ─────────────────────────────────────────────────────────────────────────

export type TxoStatus =
  | 'outage_requested'
  | 'security_assessment'
  | 'n1_contingency_run'
  | 'reliability_committee_review'
  | 'outage_approved'
  | 'outage_window_open'
  | 'outage_in_progress'
  | 'outage_completed'
  | 'return_to_service'
  | 'post_outage_review'
  | 'archived'
  | 'rejected'
  | 'withdrawn'
  | 'suspended'
  | 'emergency_cancelled'
  | 'extended';

export type TxoAction =
  | 'request_outage'
  | 'start_security_assessment'
  | 'run_n1_contingency'
  | 'submit_to_reliability_committee'
  | 'approve_outage'
  | 'reject_outage'
  | 'open_outage_window'
  | 'commence_outage'
  | 'suspend_outage'
  | 'resume_outage'
  | 'emergency_cancel'
  | 'extend_outage'
  | 'complete_outage'
  | 'verify_return_to_service'
  | 'close_post_outage_review'
  | 'archive_outage'
  | 'withdraw';

export type TxoTier =
  | 'low_sub132kv'
  | 'medium_132kv'
  | 'high_275kv'
  | 'critical_400kv_plus';

export type TxoParty =
  | 'outage_planner'
  | 'system_operator'
  | 'reliability_committee'
  | 'archive_clerk';

export type TxoEvent =
  | 'transmission_outage_requested'
  | 'transmission_outage_security_assessment_started'
  | 'transmission_outage_n1_contingency_ran'
  | 'transmission_outage_submitted_to_committee'
  | 'transmission_outage_approved'
  | 'transmission_outage_rejected'
  | 'transmission_outage_window_opened'
  | 'transmission_outage_commenced'
  | 'transmission_outage_suspended'
  | 'transmission_outage_resumed'
  | 'transmission_outage_emergency_cancelled'
  | 'transmission_outage_extended'
  | 'transmission_outage_completed'
  | 'transmission_outage_return_to_service_verified'
  | 'transmission_outage_post_outage_review_closed'
  | 'transmission_outage_archived'
  | 'transmission_outage_withdrawn'
  | 'transmission_outage_sla_breached';

// archived is the only HARD terminal — the chain officially closes there.
// rejected / withdrawn / emergency_cancelled are also terminal but kept
// as UI-terminal too (no further transitions accepted).
const HARD_TERMINALS = new Set<TxoStatus>([
  'archived',
  'rejected',
  'withdrawn',
  'emergency_cancelled',
]);

const UI_TERMINALS = new Set<TxoStatus>([
  'archived',
  'rejected',
  'withdrawn',
  'emergency_cancelled',
]);

export function isTerminal(s: TxoStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: TxoStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// All non-terminal states (withdraw / emergency_cancel can fire from
// any non-terminal because requester pull / forced-cancel can happen at
// any point).
const ALL_NON_TERMINAL: TxoStatus[] = [
  'outage_requested',
  'security_assessment',
  'n1_contingency_run',
  'reliability_committee_review',
  'outage_approved',
  'outage_window_open',
  'outage_in_progress',
  'outage_completed',
  'return_to_service',
  'post_outage_review',
  'suspended',
  'extended',
];

// Pre-approval states can be withdrawn by the requester.
const PRE_APPROVAL: TxoStatus[] = [
  'outage_requested',
  'security_assessment',
  'n1_contingency_run',
  'reliability_committee_review',
];

// Pre-commencement states can be rejected by the committee.
const PRE_COMMENCEMENT: TxoStatus[] = [
  'outage_requested',
  'security_assessment',
  'n1_contingency_run',
  'reliability_committee_review',
];

export const TRANSITIONS: Record<TxoAction, { from: TxoStatus[]; to: TxoStatus }> = {
  request_outage:                  { from: ['outage_requested'],              to: 'outage_requested' },
  start_security_assessment:       { from: ['outage_requested'],              to: 'security_assessment' },
  run_n1_contingency:              { from: ['security_assessment'],           to: 'n1_contingency_run' },
  submit_to_reliability_committee: { from: ['n1_contingency_run'],            to: 'reliability_committee_review' },
  approve_outage:                  { from: ['reliability_committee_review'],  to: 'outage_approved' },
  reject_outage:                   { from: PRE_COMMENCEMENT,                  to: 'rejected' },
  open_outage_window:              { from: ['outage_approved'],               to: 'outage_window_open' },
  commence_outage:                 { from: ['outage_window_open'],            to: 'outage_in_progress' },
  suspend_outage:                  { from: ['outage_in_progress'],            to: 'suspended' },
  resume_outage:                   { from: ['suspended', 'extended'],         to: 'outage_in_progress' },
  emergency_cancel:                { from: ALL_NON_TERMINAL,                  to: 'emergency_cancelled' },
  extend_outage:                   { from: ['outage_in_progress'],            to: 'extended' },
  complete_outage:                 { from: ['outage_in_progress', 'extended'],to: 'outage_completed' },
  verify_return_to_service:        { from: ['outage_completed'],              to: 'return_to_service' },
  close_post_outage_review:        { from: ['return_to_service'],             to: 'post_outage_review' },
  archive_outage:                  { from: ['post_outage_review'],            to: 'archived' },
  withdraw:                        { from: PRE_APPROVAL,                      to: 'withdrawn' },
};

export function nextStatus(current: TxoStatus, action: TxoAction): TxoStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'request_outage' && current !== 'outage_requested') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: TxoStatus): TxoAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: TxoAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [TxoAction, typeof TRANSITIONS[TxoAction]][]) {
    if (a === 'request_outage') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// URGENT SLA polarity stored as HOURS. 0 == no SLA.
const HOUR = 1;
const DAY = 24 * HOUR;

export const SLA_HOURS: Record<TxoStatus, Record<TxoTier, number>> = {
  outage_requested:              { low_sub132kv: 14 * DAY, medium_132kv: 7 * DAY, high_275kv: 3 * DAY, critical_400kv_plus: 1 * DAY },
  security_assessment:           { low_sub132kv: 7 * DAY,  medium_132kv: 4 * DAY, high_275kv: 2 * DAY, critical_400kv_plus: 12 * HOUR },
  n1_contingency_run:            { low_sub132kv: 5 * DAY,  medium_132kv: 3 * DAY, high_275kv: 36 * HOUR, critical_400kv_plus: 8 * HOUR },
  reliability_committee_review:  { low_sub132kv: 7 * DAY,  medium_132kv: 4 * DAY, high_275kv: 2 * DAY, critical_400kv_plus: 12 * HOUR },
  outage_approved:               { low_sub132kv: 14 * DAY, medium_132kv: 7 * DAY, high_275kv: 3 * DAY, critical_400kv_plus: 1 * DAY },
  outage_window_open:            { low_sub132kv: 7 * DAY,  medium_132kv: 4 * DAY, high_275kv: 2 * DAY, critical_400kv_plus: 12 * HOUR },
  outage_in_progress:            { low_sub132kv: 30 * DAY, medium_132kv: 14 * DAY, high_275kv: 7 * DAY, critical_400kv_plus: 2 * DAY },
  outage_completed:              { low_sub132kv: 3 * DAY,  medium_132kv: 2 * DAY, high_275kv: 1 * DAY, critical_400kv_plus: 8 * HOUR },
  return_to_service:             { low_sub132kv: 2 * DAY,  medium_132kv: 1 * DAY, high_275kv: 12 * HOUR, critical_400kv_plus: 4 * HOUR },
  post_outage_review:            { low_sub132kv: 14 * DAY, medium_132kv: 7 * DAY, high_275kv: 5 * DAY, critical_400kv_plus: 3 * DAY },
  suspended:                     { low_sub132kv: 5 * DAY,  medium_132kv: 2 * DAY, high_275kv: 1 * DAY, critical_400kv_plus: 6 * HOUR },
  extended:                      { low_sub132kv: 7 * DAY,  medium_132kv: 4 * DAY, high_275kv: 2 * DAY, critical_400kv_plus: 1 * DAY },
  archived:                      { low_sub132kv: 0, medium_132kv: 0, high_275kv: 0, critical_400kv_plus: 0 },
  rejected:                      { low_sub132kv: 0, medium_132kv: 0, high_275kv: 0, critical_400kv_plus: 0 },
  withdrawn:                     { low_sub132kv: 0, medium_132kv: 0, high_275kv: 0, critical_400kv_plus: 0 },
  emergency_cancelled:           { low_sub132kv: 0, medium_132kv: 0, high_275kv: 0, critical_400kv_plus: 0 },
};

export function slaWindowHours(status: TxoStatus, tier: TxoTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: TxoStatus, tier: TxoTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from transmission_voltage_kv.
//   <132     : low_sub132kv
//   132      : medium_132kv
//   >=275 <400: high_275kv
//   >=400    : critical_400kv_plus
export function tierForVoltage(voltageKv: number | null | undefined): TxoTier {
  const v = Number(voltageKv ?? 0);
  if (!isFinite(v) || v < 0) return 'low_sub132kv';
  if (v >= 400) return 'critical_400kv_plus';
  if (v >= 275) return 'high_275kv';
  if (v >= 132) return 'medium_132kv';
  return 'low_sub132kv';
}

export interface TxoFloorFlags {
  peak_demand_period?: boolean | number | null;
  single_circuit_radial?: boolean | number | null;
  cross_border_interconnector?: boolean | number | null;
  black_start_path?: boolean | number | null;
  national_grid_backbone?: boolean | number | null;
}

export function countFloorFlags(args: TxoFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.peak_demand_period) +
    t(args.single_circuit_radial) +
    t(args.cross_border_interconnector) +
    t(args.black_start_path) +
    t(args.national_grid_backbone)
  );
}

// FLOOR-AT-HIGH on any one of the 5 contextual flags.
export function floorAtHigh(args: TxoFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-CRITICAL on:
//   - 2+ floor flags
//   - national_grid_backbone (always critical)
//   - black_start_path (always critical)
export function floorAtCritical(args: TxoFloorFlags): boolean {
  if (countFloorFlags(args) >= 2) return true;
  if (args.national_grid_backbone) return true;
  if (args.black_start_path) return true;
  return false;
}

export function effectiveTier(
  rawTier: TxoTier,
  flags: TxoFloorFlags,
): TxoTier {
  if (floorAtCritical(flags)) return 'critical_400kv_plus';
  if (floorAtHigh(flags)) {
    if (rawTier === 'low_sub132kv' || rawTier === 'medium_132kv') return 'high_275kv';
    return rawTier;
  }
  return rawTier;
}

// Heavy tiers — high + critical. Where reportability + signature
// crossings attach when not on universal hard lines.
const HEAVY_TIERS = new Set<TxoTier>(['high_275kv', 'critical_400kv_plus']);

export function isHeavyTier(tier: TxoTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: TxoTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
export function crossesIntoRegulator(
  action: TxoAction,
  tier: TxoTier,
  args: {
    national_grid_backbone?: boolean | number | null;
  },
): boolean {
  const backbone = Boolean(args.national_grid_backbone);

  // W110 SIGNATURE: emergency_cancel crosses EVERY tier (forced
  // cancellation of an approved TX outage is always a security event).
  if (action === 'emergency_cancel') return true;

  // extend_outage crosses high + critical.
  if (action === 'extend_outage') {
    return HEAVY_TIERS.has(tier);
  }

  // approve_outage crosses critical only when national-backbone.
  if (action === 'approve_outage') {
    if (tier === 'critical_400kv_plus' && backbone) return true;
    return false;
  }

  // suspend_outage crosses high + critical.
  if (action === 'suspend_outage') {
    return HEAVY_TIERS.has(tier);
  }

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: TxoTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<TxoAction, TxoParty> = {
  request_outage:                  'outage_planner',
  start_security_assessment:       'outage_planner',
  run_n1_contingency:              'system_operator',
  submit_to_reliability_committee: 'reliability_committee',
  approve_outage:                  'reliability_committee',
  reject_outage:                   'reliability_committee',
  open_outage_window:              'system_operator',
  commence_outage:                 'system_operator',
  suspend_outage:                  'system_operator',
  resume_outage:                   'system_operator',
  emergency_cancel:                'system_operator',
  extend_outage:                   'reliability_committee',
  complete_outage:                 'system_operator',
  verify_return_to_service:        'system_operator',
  close_post_outage_review:        'archive_clerk',
  archive_outage:                  'archive_clerk',
  withdraw:                        'outage_planner',
};

export function partyForAction(action: TxoAction): TxoParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: TxoAction): TxoEvent | null {
  switch (action) {
    case 'request_outage':                  return 'transmission_outage_requested';
    case 'start_security_assessment':       return 'transmission_outage_security_assessment_started';
    case 'run_n1_contingency':              return 'transmission_outage_n1_contingency_ran';
    case 'submit_to_reliability_committee': return 'transmission_outage_submitted_to_committee';
    case 'approve_outage':                  return 'transmission_outage_approved';
    case 'reject_outage':                   return 'transmission_outage_rejected';
    case 'open_outage_window':              return 'transmission_outage_window_opened';
    case 'commence_outage':                 return 'transmission_outage_commenced';
    case 'suspend_outage':                  return 'transmission_outage_suspended';
    case 'resume_outage':                   return 'transmission_outage_resumed';
    case 'emergency_cancel':                return 'transmission_outage_emergency_cancelled';
    case 'extend_outage':                   return 'transmission_outage_extended';
    case 'complete_outage':                 return 'transmission_outage_completed';
    case 'verify_return_to_service':        return 'transmission_outage_return_to_service_verified';
    case 'close_post_outage_review':        return 'transmission_outage_post_outage_review_closed';
    case 'archive_outage':                  return 'transmission_outage_archived';
    case 'withdraw':                        return 'transmission_outage_withdrawn';
  }
}

// ─── LIVE battery (16-field decoration) ─────────────────────────────────

export function slaHoursRemaining(
  status: TxoStatus,
  tier: TxoTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type TxoUrgency = 'critical' | 'high' | 'medium' | 'low';

// URGENT polarity: critical tier has the tightest urgency thresholds.
export function urgencyBand(
  tier: TxoTier,
  slaHoursLeft: number,
): TxoUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'critical_400kv_plus') {
    if (slaHoursLeft < 4)   return 'critical';
    if (slaHoursLeft < 12)  return 'high';
    if (slaHoursLeft < 24)  return 'medium';
    return 'low';
  }
  if (tier === 'high_275kv') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 36)  return 'high';
    if (slaHoursLeft < 72)  return 'medium';
    return 'low';
  }
  if (tier === 'medium_132kv') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  // low_sub132kv
  if (slaHoursLeft < 48)   return 'critical';
  if (slaHoursLeft < 168)  return 'high';
  if (slaHoursLeft < 336)  return 'medium';
  return 'low';
}

// 4-step authority ladder driven by effective tier.
export type TxoAuthority =
  | 'outage_planner'
  | 'system_operator'
  | 'reliability_committee_chair'
  | 'SO_CEO';

export function authorityRequired(tier: TxoTier): TxoAuthority {
  switch (tier) {
    case 'low_sub132kv':       return 'outage_planner';
    case 'medium_132kv':       return 'system_operator';
    case 'high_275kv':         return 'reliability_committee_chair';
    case 'critical_400kv_plus':return 'SO_CEO';
  }
}

// Regulator filing window hours — how fast a regulator-crossing event
// must be filed.
export function regulatorFilingWindowHours(tier: TxoTier): number {
  switch (tier) {
    case 'critical_400kv_plus': return 1;
    case 'high_275kv':          return 4;
    case 'medium_132kv':        return 24;
    case 'low_sub132kv':        return 72;
  }
}

// ─── 3-bridge architecture ──────────────────────────────────────────────
// W18 planned outage (generator side) / W34 load curtailment (system
// stress sibling) / W50 reserve activation (supply-side compensation)
export function bridgesToPlannedOutageChain(
  plannedOutageRef: string | null | undefined,
): boolean {
  return !!plannedOutageRef;
}

export function bridgesToCurtailmentChain(
  curtailmentRef: string | null | undefined,
): boolean {
  return !!curtailmentRef;
}

export function bridgesToReserveActivationChain(
  reserveRef: string | null | undefined,
): boolean {
  return !!reserveRef;
}

// N-1 contingency pass / fail counters — for the LIVE battery.
export function n1ContingencyPassCount(
  passList: Array<{ pass: boolean | number | null }> | null | undefined,
): number {
  if (!passList) return 0;
  let n = 0;
  for (const p of passList) if (p.pass) n++;
  return n;
}

export function n1ContingencyFailCount(
  passList: Array<{ pass: boolean | number | null }> | null | undefined,
): number {
  if (!passList) return 0;
  let n = 0;
  for (const p of passList) if (!p.pass) n++;
  return n;
}

// Security margin pct — headroom above thermal/voltage limits.
export function securityMarginPct(
  actualLoadMw: number | null | undefined,
  thermalLimitMw: number | null | undefined,
): number {
  const a = Number(actualLoadMw ?? 0);
  const t = Number(thermalLimitMw ?? 0);
  if (!isFinite(t) || t <= 0) return 0;
  const margin = ((t - a) / t) * 100;
  if (!isFinite(margin)) return 0;
  if (margin < 0) return 0;
  return Math.round(margin * 100) / 100;
}

// Hours-to-window countdown (positive = future, negative = past).
export function hoursToOutageWindow(
  scheduledStart: string | Date | null | undefined,
  now: Date,
): number | null {
  if (!scheduledStart) return null;
  const t = new Date(scheduledStart);
  if (isNaN(t.getTime())) return null;
  return Math.round((t.getTime() - now.getTime()) / (3600 * 1000));
}

// Hours-in-outage (elapsed since commence).
export function hoursInOutage(
  commencedAt: string | Date | null | undefined,
  now: Date,
): number {
  if (!commencedAt) return 0;
  const t = new Date(commencedAt);
  if (isNaN(t.getTime())) return 0;
  const ms = now.getTime() - t.getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / (3600 * 1000));
}

// Hours-to-planned-completion (positive = on time, negative = overrun).
export function hoursToPlannedCompletion(
  plannedEnd: string | Date | null | undefined,
  now: Date,
): number | null {
  if (!plannedEnd) return null;
  const t = new Date(plannedEnd);
  if (isNaN(t.getTime())) return null;
  return Math.round((t.getTime() - now.getTime()) / (3600 * 1000));
}

// Is extension imminent? Within 4h of planned end AND extension request
// submitted.
export function isExtensionImminent(
  hoursToCompletion: number | null,
  extensionRequested: boolean | number | null | undefined,
): boolean {
  if (hoursToCompletion === null) return false;
  if (!extensionRequested) return false;
  return hoursToCompletion <= 4 && hoursToCompletion >= -4;
}

// Is emergency-cancel risk? security_margin_pct < 5% during outage.
export function isEmergencyCancelRisk(
  status: TxoStatus,
  securityMargin: number,
): boolean {
  if (status !== 'outage_in_progress' && status !== 'extended') return false;
  return securityMargin < 5;
}

// Is return-to-service clean? Post-outage performance test passed.
export function isReturnedToServiceClean(
  status: TxoStatus,
  rtsTestPassed: boolean | number | null | undefined,
): boolean {
  if (status !== 'return_to_service' && status !== 'post_outage_review' && status !== 'archived') return false;
  return Boolean(rtsTestPassed);
}

// Outage completeness index 0-130 — how many key milestones are stamped.
export function outageCompletenessIndex(args: {
  security_assessment?: boolean | number | null;
  n1_contingency?: boolean | number | null;
  committee_approved?: boolean | number | null;
  window_opened?: boolean | number | null;
  commenced?: boolean | number | null;
  completed?: boolean | number | null;
  rts_verified?: boolean | number | null;
  post_review?: boolean | number | null;
  archived?: boolean | number | null;
  clean_first_pass_bonus?: boolean | number | null;
  no_suspension_bonus?: boolean | number | null;
  no_extension_bonus?: boolean | number | null;
  no_emergency_cancel_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.security_assessment) * 10;
  score += t(args.n1_contingency)      * 15;
  score += t(args.committee_approved)  * 15;
  score += t(args.window_opened)       * 10;
  score += t(args.commenced)           * 10;
  score += t(args.completed)           * 10;
  score += t(args.rts_verified)        * 15;
  score += t(args.post_review)         * 10;
  score += t(args.archived)            * 5;
  score += t(args.clean_first_pass_bonus)  * 10;
  score += t(args.no_suspension_bonus)     * 7;
  score += t(args.no_extension_bonus)      * 6;
  score += t(args.no_emergency_cancel_bonus) * 7;
  if (score > 130) score = 130;
  return score;
}
