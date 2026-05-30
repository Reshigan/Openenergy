// ─────────────────────────────────────────────────────────────────────────
// Wave 104 — Support ITIL Service Request Fulfilment Chain (P6)
//
// 11th OEM-Support chain. The catalog + entitlement + fulfilment workflow
// distinct from the rest of the ITIL family:
//   - [[project_wave14_support_ticket_chain]]        reactive triage
//   - [[project_wave41_problem_management_chain]]    root-cause analysis
//   - [[project_wave47_change_enablement_chain]]     RFC / CAB lifecycle
//   - [[project_wave55_security_remediation_chain]]  vulnerability remediation
//
// Service requests are catalog-driven, pre-approved, low-risk requests
// like rotate API key, provision substation read access, request a spare
// meter swap, request a site-visit window, audit-evidence pull. They flow
// off the W80 service-contract entitlement gate, route through approval
// (low-risk autonomic, configuration-change CAB-mandated), assign to a
// fulfiller, run to fulfilled / verified / closed, and feed first-time-fix
// and reopened metrics back into the service desk.
//
// Beats ServiceNow ITSM Service Catalog / BMC Helix Request / Jira SM
// Request / Atlassian Assist / Freshservice Request Catalog / Ivanti
// Neurons Service Request / SolarWinds Service Desk / ManageEngine
// ServiceDesk Plus Request / Cherwell SRC / TOPdesk Self-Service — every
// one of these surfaces service requests as a queue + form. W104 makes
// it a 12-state P6 chain with live entitlement score from W80, CAB bridge
// to W47, first-time-fix telemetry, and signature regulator crossings
// when a regulator-relevant request is rejected or a grid-significant
// fulfilment lands.
//
// Forward path (clean fulfilment):
//   submitted → entitlement_checked → approval_pending → approved
//   → assigned → fulfilment_in_progress → awaiting_user → user_responded
//   → fulfilled (terminal) → verified → closed (terminal) → archived
//   (terminal)
//
// Reject / cancel branches:
//   approval_pending → rejected (terminal)
//   any non-terminal → cancelled (terminal)
//   fulfilled → reopened → fulfilment_in_progress (re-enters)
//
// Tiers (4) RE-DERIVED on every transition from severity_zar + 5 floor
// flags. FLOOR-AT-MATERIAL on any of:
//   - request_floor_flag_access_to_critical_system  (FLOOR-AT-CRITICAL)
//   - request_floor_flag_data_export_popia
//   - request_floor_flag_grid_significant
//   - request_floor_flag_oem_break_glass            (FLOOR-AT-CRITICAL)
//   - request_floor_flag_sla_premium_contract
//
// SLA polarity URGENT — the HIGHER the tier, the TIGHTER every window.
// critical 4h / material 24h / standard 5d / minor 14d.
//
// SIGNATURE regulator crossings (W104 hard line):
//   reject           → regulator EVERY tier when regulator_relevant
//   mark_fulfilled   → regulator on critical when request_floor_flag_grid_significant
//                      (security-of-supply ops change is always reportable)
//   cancel_request   → regulator EVERY tier when entitlement_status=entitled
//                      AND regulator_relevant
//   sla_breached     → regulator on material + critical
//
// Write {admin, support}. READ all 9 personas. actor_party derived per
// action (requester / approver / fulfiller / verifier / archiver).
// ─────────────────────────────────────────────────────────────────────────

export type SrStatus =
  | 'submitted'
  | 'entitlement_checked'
  | 'approval_pending'
  | 'approved'
  | 'assigned'
  | 'fulfilment_in_progress'
  | 'awaiting_user'
  | 'user_responded'
  | 'fulfilled'
  | 'verified'
  | 'closed'
  | 'archived'
  | 'rejected'
  | 'cancelled';

export type SrAction =
  | 'check_entitlement'
  | 'request_approval'
  | 'approve'
  | 'reject'
  | 'assign'
  | 'start_fulfilment'
  | 'request_user_info'
  | 'receive_user_response'
  | 'mark_fulfilled'
  | 'verify'
  | 'close'
  | 'archive_request'
  | 'cancel_request'
  | 'reopen_request';

export type SrTier = 'minor' | 'standard' | 'material' | 'critical';

export type SrParty =
  | 'requester'
  | 'approver'
  | 'fulfiller'
  | 'verifier'
  | 'archiver';

export type SrEvent =
  | 'service_request.entitlement_checked'
  | 'service_request.approval_requested'
  | 'service_request.approved'
  | 'service_request.rejected'
  | 'service_request.assigned'
  | 'service_request.fulfilment_started'
  | 'service_request.user_info_requested'
  | 'service_request.user_response_received'
  | 'service_request.fulfilled'
  | 'service_request.verified'
  | 'service_request.closed'
  | 'service_request.archived'
  | 'service_request.cancelled'
  | 'service_request.reopened'
  | 'service_request.sla_breached';

// "Hard" terminals reject every action. archived/rejected/cancelled are
// hard terminals. `fulfilled` and `closed` are SOFT milestones — they
// accept exactly one forward transition (verify / archive_request) plus
// reopen_request from fulfilled — but are otherwise terminal-like for UI
// filtering purposes.
const HARD_TERMINALS = new Set<SrStatus>([
  'archived',
  'rejected',
  'cancelled',
]);

// `is_terminal` for UI purposes — anything the user cannot escalate from
// without an explicit "verify"/"close"/"archive" path. UI filters like
// "Active" hide rows where isTerminal=true.
const UI_TERMINALS = new Set<SrStatus>([
  'fulfilled', // soft-fulfilment milestone
  'closed',    // soft-closure milestone
  'archived',
  'rejected',
  'cancelled',
]);

export function isTerminal(s: SrStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: SrStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// Soft milestones — terminal-looking but accept narrow forward/back paths.
export function isSoftTerminal(s: SrStatus): boolean {
  return s === 'fulfilled' || s === 'closed';
}

// Cancellable from every non-terminal pre-fulfilment state. Note "fulfilled"
// itself is a terminal but we permit re-open from it back into in_progress.
const CANCELLABLE_FROM: SrStatus[] = [
  'submitted',
  'entitlement_checked',
  'approval_pending',
  'approved',
  'assigned',
  'fulfilment_in_progress',
  'awaiting_user',
  'user_responded',
];

export const TRANSITIONS: Record<SrAction, { from: SrStatus[]; to: SrStatus }> = {
  check_entitlement:     { from: ['submitted'],                                          to: 'entitlement_checked' },
  request_approval:      { from: ['entitlement_checked'],                                to: 'approval_pending' },
  approve:               { from: ['approval_pending'],                                   to: 'approved' },
  reject:                { from: ['approval_pending'],                                   to: 'rejected' },
  assign:                { from: ['approved'],                                           to: 'assigned' },
  start_fulfilment:      { from: ['assigned'],                                           to: 'fulfilment_in_progress' },
  request_user_info:     { from: ['fulfilment_in_progress'],                             to: 'awaiting_user' },
  receive_user_response: { from: ['awaiting_user'],                                      to: 'user_responded' },
  mark_fulfilled:        { from: ['fulfilment_in_progress', 'user_responded'],           to: 'fulfilled' },
  verify:                { from: ['fulfilled'],                                          to: 'verified' },
  close:                 { from: ['verified'],                                           to: 'closed' },
  archive_request:       { from: ['closed'],                                             to: 'archived' },
  cancel_request:        { from: CANCELLABLE_FROM,                                       to: 'cancelled' },
  reopen_request:        { from: ['fulfilled'],                                          to: 'fulfilment_in_progress' },
};

export function nextStatus(current: SrStatus, action: SrAction): SrStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: SrStatus): SrAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: SrAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [SrAction, typeof TRANSITIONS[SrAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT SLA polarity. critical 4h on submitted → 14d for minor.
// Strictly decreasing minor → standard → material → critical per state.
export const SLA_MINUTES: Record<SrStatus, Record<SrTier, number>> = {
  submitted:              { minor: 14 * DAY, standard: 5 * DAY,  material: 24 * HOUR, critical: 4 * HOUR },
  entitlement_checked:    { minor: 10 * DAY, standard: 3 * DAY,  material: 16 * HOUR, critical: 2 * HOUR },
  approval_pending:       { minor: 10 * DAY, standard: 3 * DAY,  material: 12 * HOUR, critical: 2 * HOUR },
  approved:               { minor: 7 * DAY,  standard: 2 * DAY,  material: 8 * HOUR,  critical: 1 * HOUR },
  assigned:               { minor: 7 * DAY,  standard: 2 * DAY,  material: 8 * HOUR,  critical: 1 * HOUR },
  fulfilment_in_progress: { minor: 14 * DAY, standard: 5 * DAY,  material: 24 * HOUR, critical: 4 * HOUR },
  awaiting_user:          { minor: 21 * DAY, standard: 14 * DAY, material: 7 * DAY,   critical: 2 * DAY },
  user_responded:         { minor: 5 * DAY,  standard: 2 * DAY,  material: 12 * HOUR, critical: 2 * HOUR },
  fulfilled:              { minor: 5 * DAY,  standard: 2 * DAY,  material: 12 * HOUR, critical: 4 * HOUR },
  verified:               { minor: 7 * DAY,  standard: 3 * DAY,  material: 24 * HOUR, critical: 12 * HOUR },
  closed:                 { minor: 0,        standard: 0,        material: 0,         critical: 0 },
  archived:               { minor: 0,        standard: 0,        material: 0,         critical: 0 },
  rejected:               { minor: 0,        standard: 0,        material: 0,         critical: 0 },
  cancelled:              { minor: 0,        standard: 0,        material: 0,         critical: 0 },
};

export function slaWindowMinutes(status: SrStatus, tier: SrTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: SrStatus, tier: SrTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Tier RE-DERIVED from severity_zar.
export function tierForSeverity(severityZar: number | null | undefined): SrTier {
  const v = Number(severityZar ?? 0);
  if (!isFinite(v) || v < 0) return 'minor';
  if (v >= 5_000_000) return 'critical';
  if (v >= 500_000)   return 'material';
  if (v >= 50_000)    return 'standard';
  return 'minor';
}

export interface SrFloorFlags {
  request_floor_flag_access_to_critical_system?: boolean | number | null;
  request_floor_flag_data_export_popia?: boolean | number | null;
  request_floor_flag_grid_significant?: boolean | number | null;
  request_floor_flag_oem_break_glass?: boolean | number | null;
  request_floor_flag_sla_premium_contract?: boolean | number | null;
}

// Count how many floor flags are set.
export function countFloorFlags(args: SrFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.request_floor_flag_access_to_critical_system) +
    t(args.request_floor_flag_data_export_popia) +
    t(args.request_floor_flag_grid_significant) +
    t(args.request_floor_flag_oem_break_glass) +
    t(args.request_floor_flag_sla_premium_contract)
  );
}

// FLOOR-AT-MATERIAL on any flag. Two specific flags also FLOOR-AT-CRITICAL:
// access_to_critical_system and oem_break_glass. These promote the row all
// the way to critical regardless of severity_zar.
export function floorAtMaterial(args: SrFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

export function floorAtCritical(args: SrFloorFlags): boolean {
  return Boolean(
    args.request_floor_flag_access_to_critical_system ||
    args.request_floor_flag_oem_break_glass,
  );
}

// Compose raw severity-tier + floors + multi-floor escalation into the
// effective tier used by every downstream decision.
export function effectiveTier(rawTier: SrTier, flags: SrFloorFlags): SrTier {
  if (floorAtCritical(flags)) return 'critical';
  const count = countFloorFlags(flags);
  // 2+ floor flags → critical regardless of raw tier.
  if (count >= 2) return 'critical';
  // 1 floor flag → floor at material.
  if (count === 1) {
    if (rawTier === 'minor' || rawTier === 'standard') return 'material';
    return rawTier; // material/critical unchanged
  }
  return rawTier;
}

// Heavy tiers — where reportability and signature crossings attach.
const HEAVY_TIERS = new Set<SrTier>(['material', 'critical']);

export function isHeavyTier(tier: SrTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// SIGNATURE regulator crossings:
//   reject           → EVERY tier when regulator_relevant
//   mark_fulfilled   → critical when request_floor_flag_grid_significant
//                      (signature — security-of-supply ops change always
//                      reportable on fulfilment)
//   cancel_request   → EVERY tier when entitled AND regulator_relevant
//   sla_breached     → material + critical
export function crossesIntoRegulator(
  action: SrAction,
  tier: SrTier,
  args: {
    regulator_relevant?: boolean | number | null;
    entitlement_status?: string | null;
    request_floor_flag_grid_significant?: boolean | number | null;
  },
): boolean {
  const reg = Boolean(args.regulator_relevant);
  if (action === 'reject') return reg;
  if (action === 'cancel_request') return reg && args.entitlement_status === 'entitled';
  if (action === 'mark_fulfilled') {
    return tier === 'critical' && Boolean(args.request_floor_flag_grid_significant);
  }
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: SrTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: SrTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// Party each action represents in the chain ledger.
const ACTION_PARTY: Record<SrAction, SrParty> = {
  check_entitlement:     'fulfiller',
  request_approval:      'requester',
  approve:               'approver',
  reject:                'approver',
  assign:                'approver',
  start_fulfilment:      'fulfiller',
  request_user_info:     'fulfiller',
  receive_user_response: 'requester',
  mark_fulfilled:        'fulfiller',
  verify:                'verifier',
  close:                 'verifier',
  archive_request:       'archiver',
  cancel_request:        'requester',
  reopen_request:        'requester',
};

export function partyForAction(action: SrAction): SrParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: SrAction): SrEvent | null {
  switch (action) {
    case 'check_entitlement':     return 'service_request.entitlement_checked';
    case 'request_approval':      return 'service_request.approval_requested';
    case 'approve':               return 'service_request.approved';
    case 'reject':                return 'service_request.rejected';
    case 'assign':                return 'service_request.assigned';
    case 'start_fulfilment':      return 'service_request.fulfilment_started';
    case 'request_user_info':     return 'service_request.user_info_requested';
    case 'receive_user_response': return 'service_request.user_response_received';
    case 'mark_fulfilled':        return 'service_request.fulfilled';
    case 'verify':                return 'service_request.verified';
    case 'close':                 return 'service_request.closed';
    case 'archive_request':       return 'service_request.archived';
    case 'cancel_request':        return 'service_request.cancelled';
    case 'reopen_request':        return 'service_request.reopened';
  }
}

// ─── Catalog categories. Drives entitlement, CAB-gating, regulator-relevance.
export const CATALOG_CATEGORIES = [
  'access_request',
  'data_export',
  'asset_swap',
  'site_visit',
  'credential_rotation',
  'configuration_change',
  'information_request',
  'training_request',
  'environment_provision',
  'audit_evidence_pull',
] as const;
export type CatalogCategory = typeof CATALOG_CATEGORIES[number];

// CAB review required when catalog category is asset_swap or
// configuration_change, OR urgency_requested = critical.
export function requiresCabReview(
  category: string | null | undefined,
  urgencyRequested: string | null | undefined,
): boolean {
  if (urgencyRequested === 'critical') return true;
  return category === 'asset_swap' || category === 'configuration_change';
}

// ─── LIVE battery — beats ServiceNow / BMC / Jira / Freshservice etc by
// putting every dimension live on the row, not on a dashboard.

// Entitlement match score 0-100 — composes contract presence + status +
// overage signal. Used by the UI ribbon and the route LIVE decoration.
export function entitlementMatchScore(args: {
  entitlement_status?: string | null;
  entitlement_contract_id?: string | null;
  entitlement_overage_units?: number | null;
}): number {
  const status = args.entitlement_status;
  if (!status) return 0;
  let score = 0;
  if (args.entitlement_contract_id) score += 30;
  if (status === 'entitled') score += 70;
  else if (status === 'requires_overage_approval') score += 35;
  else if (status === 'not_entitled') score += 10;
  else if (status === 'contract_expired') score += 5;
  const overage = Number(args.entitlement_overage_units ?? 0);
  if (overage > 0) score -= Math.min(20, overage);
  if (score > 100) score = 100;
  if (score < 0) score = 0;
  return Math.round(score);
}

// First-time-fix rate (rolling 30-day) over a sample. Pure function; route
// passes in same-catalog category aggregates from D1.
export function firstTimeFixRate30d(
  fulfilledFirstTime: number,
  fulfilledTotal: number,
): number {
  if (fulfilledTotal <= 0) return 0;
  const pct = (fulfilledFirstTime / fulfilledTotal) * 100;
  return Math.round(pct * 10) / 10;
}

// Average fulfilment time (hours) across same catalog category.
export function avgFulfilmentTimeHours(samples: number[]): number {
  if (!samples.length) return 0;
  const sum = samples.reduce((s, v) => s + (Number(v) || 0), 0);
  return Math.round((sum / samples.length) * 10) / 10;
}

// SLA days remaining. Negative if breached.
export function slaDaysRemaining(
  status: SrStatus,
  tier: SrTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round((remainingMs / (1000 * 60 * 60 * 24)) * 10) / 10;
}

// Urgency band — composes effective tier + SLA days remaining into a single
// signal. critical/high/medium/low.
export type SrUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(
  tier: SrTier,
  slaDaysLeft: number,
): SrUrgency {
  // Anything past SLA is critical regardless of tier.
  if (slaDaysLeft < 0) return 'critical';
  if (tier === 'critical' || slaDaysLeft < 0.25) return 'critical';
  if (tier === 'material' || slaDaysLeft < 1) return 'high';
  if (tier === 'standard' || slaDaysLeft < 3) return 'medium';
  return 'low';
}

export function breachImminentFlag(slaDaysLeft: number): boolean {
  return slaDaysLeft >= 0 && slaDaysLeft < 0.5;
}

// Catalog completeness index 0-130 — composes coverage flags into a single
// score. Components (each contributes up to its weight when present):
//   entitlement_checked          15
//   approval_resolved            15
//   assigned                     10
//   fulfilment_started           15
//   fulfilled                    20
//   verified                     15
//   closed                       10
//   archived                      5
//   first_time_fix_bonus         15
//   csat_collected               10
// Capped at 130.
export function catalogCompletenessIndex(args: {
  entitlement_checked?: boolean | number | null;
  approval_resolved?: boolean | number | null;
  assigned?: boolean | number | null;
  fulfilment_started?: boolean | number | null;
  fulfilled?: boolean | number | null;
  verified?: boolean | number | null;
  closed?: boolean | number | null;
  archived?: boolean | number | null;
  first_time_fix_bonus?: boolean | number | null;
  csat_collected?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.entitlement_checked)    * 15;
  score += t(args.approval_resolved)      * 15;
  score += t(args.assigned)               * 10;
  score += t(args.fulfilment_started)     * 15;
  score += t(args.fulfilled)              * 20;
  score += t(args.verified)               * 15;
  score += t(args.closed)                 * 10;
  score += t(args.archived)               * 5;
  score += t(args.first_time_fix_bonus)   * 15;
  score += t(args.csat_collected)         * 10;
  if (score > 130) score = 130;
  return score;
}

// Regulator filing window hours — how long the support desk has to file
// the regulator notice once a crossing fires. Tier-aware.
export function regulatorFilingWindowHours(tier: SrTier): number {
  switch (tier) {
    case 'critical': return 4;
    case 'material': return 24;
    case 'standard': return 72;
    case 'minor':    return 168;
  }
}

// Authority required — 4-step ladder driven by effective tier.
export type SrAuthority =
  | 'end_user'
  | 'service_desk_lead'
  | 'asset_owner'
  | 'support_director';

export function authorityRequired(tier: SrTier): SrAuthority {
  switch (tier) {
    case 'minor':    return 'end_user';
    case 'standard': return 'service_desk_lead';
    case 'material': return 'asset_owner';
    case 'critical': return 'support_director';
  }
}

// Bridge flag: this row spawned a W47 change request.
export function bridgesToChangeChain(cabChangeId: string | null | undefined): boolean {
  return !!cabChangeId;
}

// Bridge flag: this row has tripped into problem territory (chronic
// reopens). W41 problem management should pick it up.
export function bridgesToProblemChain(reopenedCount: number | null | undefined): boolean {
  return Number(reopenedCount ?? 0) >= 2;
}

// First-time-fix predicate: fulfilled with zero reopens.
export function isFirstTimeFix(
  reopenedCount: number | null | undefined,
  fulfilledAt: string | null | undefined,
): boolean {
  if (!fulfilledAt) return false;
  return Number(reopenedCount ?? 0) === 0;
}
