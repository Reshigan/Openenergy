// ═══════════════════════════════════════════════════════════════════════════
// Wave 50 — Grid Ancillary Services Reserve Activation & Settlement (pure spec).
//
// NERSA SA Grid Code, System Operation Code (ancillary services + reserves) and
// Network Code. 12-state P6 lifecycle for every formal reserve ACTIVATION the
// System Operator (SO) dispatches during a frequency / contingency event: the
// SO instructs a contracted reserve provider, the provider responds, the SO
// measures delivered response against the instruction, and the event is settled
// (utilisation + availability payment, or a non-performance penalty).
//
// This is the third Grid real-time-operations chain — it pairs with W13
// dispatch nominations (scheduled energy) and W34 load curtailment (emergency
// demand reduction); W50 is the supply-side reserve-response counterpart.
//
// Forward (happy) path:
//   activation_issued → acknowledged → ramping → sustaining → released →
//   performance_review → verified → settled
//
// Non-performance branch:
//   flag_non_performance (from ramping | sustaining | performance_review) →
//   non_performance → settle_penalty → settled
//
// Dispute branch:
//   raise_dispute (from performance_review | verified | non_performance) →
//   disputed → resolve_dispute → dispute_resolved
//
// Early exit:
//   withdraw_instruction (from activation_issued | acknowledged | ramping) →
//   withdrawn   (SO cancelled before reserve was delivered — false start)
//
// Terminals: settled, dispute_resolved, withdrawn
//
// Reserve product tiers (NERSA ancillary-service categories, fastest → slowest):
//   instantaneous_reserve — governor / frequency response (seconds)
//   regulating_reserve    — automatic generation control / AGC (~30s)
//   ten_minute_reserve    — spinning reserve (10 min)
//   supplemental_reserve  — non-spinning / standing reserve (10-30 min)
//   emergency_reserve     — slow emergency / interruptible (30 min+)
//
// URGENT SLA matrix — the FASTER the reserve product, the TIGHTER the response
// window (system frequency survival): instantaneous must acknowledge in 1 min;
// the back-office settlement phase is flat across tiers.
//
// Reportability (NERSA Grid Code Inbox crossings):
//   - flag_non_performance crosses for SECURITY tiers (instantaneous /
//     regulating / ten_minute) — a security reserve that fails to respond
//     during a frequency event is a reportable system-security incident.
//   - resolve_dispute crosses for CRITICAL tiers (instantaneous / regulating).
//   - sla_breached crosses for CRITICAL tiers only.
//
// Split-write:
//   SO_WRITE:       release_instruction / open_review / verify_performance /
//                   settle / settle_penalty / flag_non_performance /
//                   resolve_dispute / withdraw_instruction
//   PROVIDER_WRITE: acknowledge / begin_ramp / confirm_sustaining / raise_dispute
//   admin/support always.
// ═══════════════════════════════════════════════════════════════════════════

export type ReserveActivationStatus =
  | 'activation_issued'
  | 'acknowledged'
  | 'ramping'
  | 'sustaining'
  | 'released'
  | 'performance_review'
  | 'verified'
  | 'settled'
  | 'non_performance'
  | 'disputed'
  | 'dispute_resolved'
  | 'withdrawn';

export type ReserveActivationAction =
  | 'acknowledge'
  | 'begin_ramp'
  | 'confirm_sustaining'
  | 'release_instruction'
  | 'open_review'
  | 'verify_performance'
  | 'settle'
  | 'flag_non_performance'
  | 'settle_penalty'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'withdraw_instruction';

export type ReserveTier =
  | 'instantaneous_reserve'
  | 'regulating_reserve'
  | 'ten_minute_reserve'
  | 'supplemental_reserve'
  | 'emergency_reserve';

export type ReserveActivationParty = 'system_operator' | 'reserve_provider';

interface TransitionRule {
  from: ReserveActivationStatus[];
  to: ReserveActivationStatus;
}

export const TRANSITIONS: Record<ReserveActivationAction, TransitionRule> = {
  acknowledge:         { from: ['activation_issued'], to: 'acknowledged' },
  begin_ramp:          { from: ['acknowledged'], to: 'ramping' },
  confirm_sustaining:  { from: ['ramping'], to: 'sustaining' },
  release_instruction: { from: ['sustaining'], to: 'released' },
  open_review:         { from: ['released'], to: 'performance_review' },
  verify_performance:  { from: ['performance_review'], to: 'verified' },
  settle:              { from: ['verified'], to: 'settled' },
  flag_non_performance:{ from: ['ramping', 'sustaining', 'performance_review'], to: 'non_performance' },
  settle_penalty:      { from: ['non_performance'], to: 'settled' },
  raise_dispute:       { from: ['performance_review', 'verified', 'non_performance'], to: 'disputed' },
  resolve_dispute:     { from: ['disputed'], to: 'dispute_resolved' },
  withdraw_instruction:{ from: ['activation_issued', 'acknowledged', 'ramping'], to: 'withdrawn' },
};

const TERMINALS = new Set<ReserveActivationStatus>(['settled', 'dispute_resolved', 'withdrawn']);

const WITHDRAWABLE = new Set<ReserveActivationStatus>([
  'activation_issued', 'acknowledged', 'ramping',
]);

export function isTerminal(s: ReserveActivationStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: ReserveActivationStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export function nextStatus(
  current: ReserveActivationStatus,
  action: ReserveActivationAction,
): ReserveActivationStatus | null {
  const rule = TRANSITIONS[action];
  if (!rule) return null;
  if (isTerminal(current)) return null;
  return rule.from.includes(current) ? rule.to : null;
}

export function allowedActions(
  current: ReserveActivationStatus,
): ReserveActivationAction[] {
  if (isTerminal(current)) return [];
  return (Object.keys(TRANSITIONS) as ReserveActivationAction[]).filter((a) =>
    TRANSITIONS[a].from.includes(current),
  );
}

// URGENT SLA windows in minutes. Response phase (issued/acknowledged/ramping)
// is tier-graded: the faster the product, the tighter the deadline. The
// settlement phase (released → disputed) is flat across tiers (back-office).
export const SLA_MINUTES: Record<ReserveActivationStatus, Record<ReserveTier, number>> = {
  activation_issued: {
    instantaneous_reserve: 1, regulating_reserve: 2, ten_minute_reserve: 5,
    supplemental_reserve: 10, emergency_reserve: 20,
  },
  acknowledged: {
    instantaneous_reserve: 2, regulating_reserve: 3, ten_minute_reserve: 8,
    supplemental_reserve: 15, emergency_reserve: 30,
  },
  ramping: {
    instantaneous_reserve: 5, regulating_reserve: 8, ten_minute_reserve: 12,
    supplemental_reserve: 25, emergency_reserve: 45,
  },
  sustaining: {
    instantaneous_reserve: 0, regulating_reserve: 0, ten_minute_reserve: 0,
    supplemental_reserve: 0, emergency_reserve: 0,
  },
  released: {
    instantaneous_reserve: 720, regulating_reserve: 720, ten_minute_reserve: 720,
    supplemental_reserve: 720, emergency_reserve: 720,
  },
  performance_review: {
    instantaneous_reserve: 1440, regulating_reserve: 1440, ten_minute_reserve: 1440,
    supplemental_reserve: 1440, emergency_reserve: 1440,
  },
  verified: {
    instantaneous_reserve: 2880, regulating_reserve: 2880, ten_minute_reserve: 2880,
    supplemental_reserve: 2880, emergency_reserve: 2880,
  },
  non_performance: {
    instantaneous_reserve: 2880, regulating_reserve: 2880, ten_minute_reserve: 2880,
    supplemental_reserve: 2880, emergency_reserve: 2880,
  },
  disputed: {
    instantaneous_reserve: 4320, regulating_reserve: 4320, ten_minute_reserve: 4320,
    supplemental_reserve: 4320, emergency_reserve: 4320,
  },
  settled:          { instantaneous_reserve: 0, regulating_reserve: 0, ten_minute_reserve: 0, supplemental_reserve: 0, emergency_reserve: 0 },
  dispute_resolved: { instantaneous_reserve: 0, regulating_reserve: 0, ten_minute_reserve: 0, supplemental_reserve: 0, emergency_reserve: 0 },
  withdrawn:        { instantaneous_reserve: 0, regulating_reserve: 0, ten_minute_reserve: 0, supplemental_reserve: 0, emergency_reserve: 0 },
};

export function slaWindowMinutes(
  state: ReserveActivationStatus,
  tier: ReserveTier,
): number {
  return SLA_MINUTES[state]?.[tier] ?? 0;
}

export function slaDeadlineFor(
  state: ReserveActivationStatus,
  tier: ReserveTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = slaWindowMinutes(state, tier);
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// Security tiers: failure of these reserves during a frequency event is a
// reportable system-security incident.
const SECURITY_TIERS = new Set<ReserveTier>([
  'instantaneous_reserve', 'regulating_reserve', 'ten_minute_reserve',
]);

// Critical tiers: the automatic frequency-keeping reserves (tightest line).
const CRITICAL_TIERS = new Set<ReserveTier>([
  'instantaneous_reserve', 'regulating_reserve',
]);

export function isSecurityTier(tier: ReserveTier): boolean {
  return SECURITY_TIERS.has(tier);
}

export function isCriticalTier(tier: ReserveTier): boolean {
  return CRITICAL_TIERS.has(tier);
}

// flag_non_performance crosses for security tiers; resolve_dispute crosses for
// critical tiers (a settlement dispute on a frequency reserve).
export function crossesIntoRegulator(
  action: ReserveActivationAction,
  tier: ReserveTier,
): boolean {
  if (action === 'flag_non_performance') return isSecurityTier(tier);
  if (action === 'resolve_dispute') return isCriticalTier(tier);
  return false;
}

// sla_breached crosses for critical tiers only — a missed response deadline on
// a frequency-keeping reserve is itself a system-security event.
export function slaBreachCrossesIntoRegulator(tier: ReserveTier): boolean {
  return isCriticalTier(tier);
}

// Row-level "system-critical reserve" flag (drives the reportable dot).
export function isReportable(tier: ReserveTier): boolean {
  return isCriticalTier(tier);
}

export const ACTION_PARTY: Record<ReserveActivationAction, ReserveActivationParty> = {
  acknowledge:          'reserve_provider',
  begin_ramp:           'reserve_provider',
  confirm_sustaining:   'reserve_provider',
  raise_dispute:        'reserve_provider',
  release_instruction:  'system_operator',
  open_review:          'system_operator',
  verify_performance:   'system_operator',
  settle:               'system_operator',
  settle_penalty:       'system_operator',
  flag_non_performance: 'system_operator',
  resolve_dispute:      'system_operator',
  withdraw_instruction: 'system_operator',
};

export function partyForAction(action: ReserveActivationAction): ReserveActivationParty {
  return ACTION_PARTY[action];
}

export function isProviderAction(action: ReserveActivationAction): boolean {
  return ACTION_PARTY[action] === 'reserve_provider';
}

// Classify a reserve product by its required full-response time in seconds.
export function tierForResponseSeconds(seconds: number): ReserveTier {
  if (seconds <= 10) return 'instantaneous_reserve';
  if (seconds <= 30) return 'regulating_reserve';
  if (seconds <= 600) return 'ten_minute_reserve';
  if (seconds <= 1800) return 'supplemental_reserve';
  return 'emergency_reserve';
}
