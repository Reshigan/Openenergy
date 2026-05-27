// ═══════════════════════════════════════════════════════════════════════════
// Wave 16 — Work Order chain spec (Esums O&M dispatch lifecycle).
//
// Pure functions. 12-state machine layered on existing om_work_orders.
//   created → assigned → acknowledged → en_route → on_site →
//   diagnosing → repairing → testing → completed → verified → closed
//                                                    │
//                                                    └→ cancelled
//
// Priority-tiered SLAs (per stage). On SLA breach in critical priority, the
// row escalates and crosses into the regulator inbox.
//
// No DB, no env. Imported by:
//   - tests/wo-chain-spec.test.ts
//   - src/routes/wo-chain.ts
// ═══════════════════════════════════════════════════════════════════════════

export type WoStatus =
  | 'created'
  | 'assigned'
  | 'acknowledged'
  | 'en_route'
  | 'on_site'
  | 'diagnosing'
  | 'repairing'
  | 'testing'
  | 'completed'
  | 'verified'
  | 'closed'
  | 'cancelled';

export type WoAction =
  | 'assign'
  | 'acknowledge'
  | 'depart'        // → en_route
  | 'arrive'        // → on_site
  | 'diagnose'      // → diagnosing
  | 'repair'        // → repairing
  | 'test'          // → testing
  | 'complete'      // → completed
  | 'verify'        // → verified
  | 'close'         // → closed
  | 'cancel';       // → cancelled

export type WoPriority = 'critical' | 'high' | 'medium' | 'low';

export const ALL_STATES: readonly WoStatus[] = [
  'created', 'assigned', 'acknowledged', 'en_route', 'on_site',
  'diagnosing', 'repairing', 'testing', 'completed', 'verified',
  'closed', 'cancelled',
];

export const TERMINAL_STATES: readonly WoStatus[] = ['closed', 'cancelled'];

export function isTerminal(s: WoStatus): boolean {
  return TERMINAL_STATES.includes(s);
}

// Transition map: from-state → action → to-state.
export const TRANSITIONS: Record<WoStatus, Partial<Record<WoAction, WoStatus>>> = {
  created:       { assign: 'assigned',      cancel: 'cancelled' },
  assigned:      { acknowledge: 'acknowledged', cancel: 'cancelled' },
  acknowledged:  { depart: 'en_route',      cancel: 'cancelled' },
  en_route:      { arrive: 'on_site',       cancel: 'cancelled' },
  on_site:       { diagnose: 'diagnosing',  cancel: 'cancelled' },
  diagnosing:    { repair: 'repairing',     cancel: 'cancelled' },
  repairing:     { test: 'testing',         cancel: 'cancelled' },
  testing:       { complete: 'completed',   cancel: 'cancelled' },
  completed:     { verify: 'verified',      cancel: 'cancelled' },
  verified:      { close: 'closed' },
  closed:        {},
  cancelled:     {},
};

/**
 * Per-stage SLA minutes by priority. Tight on the response side (assigned →
 * acknowledged → on_site), looser on the diagnostic/repair side.
 *
 *               critical  high  medium  low
 * created     →  15        30    60      240
 * assigned    →  15        30    60      240
 * acknowledged→  30        60    120     360
 * en_route    →  60        90    180     480
 * on_site     →  30        60    120     360
 * diagnosing  →  60        120   240     720
 * repairing   →  120       240   480     1440
 * testing     →  30        60    120     360
 * completed   →  60        120   240     1440
 * verified    →  30        60    120     1440
 */
export const SLA_MINUTES: Record<WoStatus, Record<WoPriority, number>> = {
  created:      { critical: 15,  high: 30,  medium: 60,  low: 240 },
  assigned:     { critical: 15,  high: 30,  medium: 60,  low: 240 },
  acknowledged: { critical: 30,  high: 60,  medium: 120, low: 360 },
  en_route:     { critical: 60,  high: 90,  medium: 180, low: 480 },
  on_site:     { critical: 30,  high: 60,  medium: 120, low: 360 },
  diagnosing:   { critical: 60,  high: 120, medium: 240, low: 720 },
  repairing:    { critical: 120, high: 240, medium: 480, low: 1440 },
  testing:      { critical: 30,  high: 60,  medium: 120, low: 360 },
  completed:    { critical: 60,  high: 120, medium: 240, low: 1440 },
  verified:     { critical: 30,  high: 60,  medium: 120, low: 1440 },
  closed:       { critical: 0,   high: 0,   medium: 0,   low: 0 },
  cancelled:    { critical: 0,   high: 0,   medium: 0,   low: 0 },
};

export function nextState(curr: WoStatus, action: WoAction): WoStatus | null {
  return TRANSITIONS[curr]?.[action] ?? null;
}

export function advance(curr: WoStatus, action: WoAction): WoStatus {
  const next = nextState(curr, action);
  if (!next) {
    throw new Error(`Invalid transition: ${curr} --${action}--> ?`);
  }
  return next;
}

/**
 * Compute SLA deadline for `state` at given priority, anchored at `now`.
 * Returns ISO string. Terminal states return empty string.
 */
export function slaDueAt(
  state: WoStatus,
  priority: WoPriority,
  now: Date = new Date(),
): string {
  const mins = SLA_MINUTES[state]?.[priority] ?? 0;
  if (mins === 0) return '';
  return new Date(now.getTime() + mins * 60 * 1000).toISOString();
}

/**
 * Which transitions cross into regulator scope on a critical-priority WO?
 * Only escalation / SLA breach — normal lifecycle stays off the regulator
 * desk because faults are operational, not regulatory.
 */
export function crossesIntoRegulator(action: WoAction, priority: WoPriority): boolean {
  if (priority !== 'critical') return false;
  return action === 'cancel'; // cancelling a critical WO is regulator-visible
}

/**
 * SLA breach crossing — critical priority only.
 */
export function slaBreachCrossesIntoRegulator(priority: WoPriority): boolean {
  return priority === 'critical';
}

/**
 * Validate a priority literal.
 */
export function isPriority(s: string): s is WoPriority {
  return s === 'critical' || s === 'high' || s === 'medium' || s === 'low';
}

/**
 * Validate a status literal.
 */
export function isStatus(s: string): s is WoStatus {
  return ALL_STATES.includes(s as WoStatus);
}
