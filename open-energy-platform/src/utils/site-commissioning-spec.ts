// ═══════════════════════════════════════════════════════════════════════════
// Wave 12 — Esums site commissioning state machine.
//
// Pure helpers — no DB, no env, no I/O. Routes + cron sweep call into these
// to figure out:
//   • Given a current state + action, what's the next state?
//   • What's the SLA deadline for the new state?
//   • Has the SLA breached?
//   • Does this transition cross into regulator scope?
//
// State machine:
//
//   planned
//     → register_site     → site_registered       (14d to wire devices)
//   site_registered
//     → register_devices  → devices_registered    (14d to wire ingestion)
//     → mark_failed       → commissioning_failed  (escalate)
//   devices_registered
//     → wire_ingestion    → ingestion_wired       (7d to first telemetry)
//     → mark_failed       → commissioning_failed
//   ingestion_wired
//     → first_telemetry   → first_telemetry_ok    (30d to energise)
//     → mark_failed       → commissioning_failed
//   first_telemetry_ok
//     → energise          → energised             (until in_om transition)
//     → mark_failed       → commissioning_failed
//   energised
//     → handover_om       → in_om                 (terminal-operational)
//     → decommission      → decommissioned        (terminal)
//   in_om
//     → decommission      → decommissioned
//
// SLA breach raises 'sla_breached' from any non-terminal state with a
// non-null deadline. commissioning_failed crosses into regulator inbox.
// ═══════════════════════════════════════════════════════════════════════════

export type CommissioningStatus =
  | 'planned'
  | 'site_registered'
  | 'devices_registered'
  | 'ingestion_wired'
  | 'first_telemetry_ok'
  | 'energised'
  | 'in_om'
  | 'commissioning_failed'
  | 'decommissioned';

// SLA windows — pragmatic IPP onboarding cadence agreed with the rollout team.
export const REGISTER_TO_DEVICES_DAYS = 14;
export const DEVICES_TO_INGESTION_DAYS = 14;
export const INGESTION_TO_TELEMETRY_DAYS = 7;
export const TELEMETRY_TO_ENERGISED_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const TERMINAL_STATES: ReadonlySet<CommissioningStatus> = new Set<CommissioningStatus>([
  'in_om',
  'commissioning_failed',
  'decommissioned',
]);

/**
 * Whether the chain has reached a terminal state — no further auto-advance.
 */
export function isTerminal(s: CommissioningStatus): boolean {
  return TERMINAL_STATES.has(s);
}

/**
 * Whether transitioning into `next` crosses into regulator-inbox scope.
 * Currently commissioning_failed crosses (project couldn't onboard within
 * its SLA window — owner + regulator both want to see this).
 */
export function crossesIntoRegulator(prev: CommissioningStatus | null | undefined, next: CommissioningStatus): boolean {
  if (prev === next) return false;
  return next === 'commissioning_failed';
}

/**
 * Compute SLA due time for the freshly-entered state. Returns null for
 * states without an explicit SLA (e.g. planned, in_om, terminal states).
 */
export function slaDueAt(state: CommissioningStatus, now: Date = new Date()): string | null {
  const days =
    state === 'site_registered'    ? REGISTER_TO_DEVICES_DAYS    :
    state === 'devices_registered' ? DEVICES_TO_INGESTION_DAYS   :
    state === 'ingestion_wired'    ? INGESTION_TO_TELEMETRY_DAYS :
    state === 'first_telemetry_ok' ? TELEMETRY_TO_ENERGISED_DAYS :
    null;
  if (days == null) return null;
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

/**
 * Days remaining until a deadline. Negative if already breached.
 */
export function daysUntilDeadline(deadline: string | null | undefined, now: Date = new Date()): number | null {
  if (!deadline) return null;
  return Math.floor((new Date(deadline).getTime() - now.getTime()) / DAY_MS);
}

export type CommissioningAction =
  | 'register_site'
  | 'register_devices'
  | 'wire_ingestion'
  | 'first_telemetry'
  | 'energise'
  | 'handover_om'
  | 'mark_failed'
  | 'decommission';

export interface AdvanceInput {
  current: CommissioningStatus;
  action: CommissioningAction;
}

export interface AdvanceResult {
  next: CommissioningStatus;
  ok: boolean;
  error?: string;
}

const TRANSITIONS: Record<CommissioningStatus, Partial<Record<CommissioningAction, CommissioningStatus>>> = {
  planned:              { register_site: 'site_registered', mark_failed: 'commissioning_failed' },
  site_registered:      { register_devices: 'devices_registered', mark_failed: 'commissioning_failed' },
  devices_registered:   { wire_ingestion: 'ingestion_wired', mark_failed: 'commissioning_failed' },
  ingestion_wired:      { first_telemetry: 'first_telemetry_ok', mark_failed: 'commissioning_failed' },
  first_telemetry_ok:   { energise: 'energised', mark_failed: 'commissioning_failed' },
  energised:            { handover_om: 'in_om', decommission: 'decommissioned' },
  in_om:                { decommission: 'decommissioned' },
  commissioning_failed: {},
  decommissioned:       {},
};

/**
 * Apply an action to the current state, returning the next state or an
 * error if the transition is invalid. Pure — does not write to DB.
 */
export function advance(input: AdvanceInput): AdvanceResult {
  const next = TRANSITIONS[input.current]?.[input.action];
  if (next == null) {
    return { next: input.current, ok: false, error: `Cannot ${input.action} from ${input.current}` };
  }
  return { next, ok: true };
}

/**
 * Whether `deadline` has been breached at `now`. Null deadline → never breaches.
 */
export function isSlaBreached(deadline: string | null | undefined, now: Date = new Date()): boolean {
  if (!deadline) return false;
  return new Date(deadline).getTime() < now.getTime();
}

/**
 * Whether this state can still SLA-breach (non-terminal + has a real deadline).
 */
export function hasSlaWindow(state: CommissioningStatus): boolean {
  return (
    state === 'site_registered'    ||
    state === 'devices_registered' ||
    state === 'ingestion_wired'    ||
    state === 'first_telemetry_ok'
  );
}

/**
 * Human-readable label per state (used by UI + audit chain).
 */
export const STATUS_LABEL: Record<CommissioningStatus, string> = {
  planned:              'Planned',
  site_registered:      'Site registered',
  devices_registered:   'Devices registered',
  ingestion_wired:      'Ingestion wired',
  first_telemetry_ok:   'First telemetry OK',
  energised:            'Energised',
  in_om:                'In O&M',
  commissioning_failed: 'Commissioning failed',
  decommissioned:       'Decommissioned',
};
