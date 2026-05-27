// ═══════════════════════════════════════════════════════════════════════════
// Wave 18 — Planned outage / maintenance submission chain spec.
//
// Pure functions. 10-state machine for NERSA Grid Code planned outage
// submission workflow. Distinct from the incident-response `grid_outages`
// table — this models the *forward* submission lifecycle.
//
//   draft → submitted → under_review → approved → notified
//                            │           │
//                            │           └─→ rescheduled → submitted (loop)
//                            ▼
//                          rejected (terminal)
//
//   approved → notified → in_progress → restoring → restored → closed
//
//   cancelled — reachable from any pre-restoring state (operator pull).
//
// Per-severity SLAs (review / approval / post-mortem windows):
//   • critical (>500MW affected, emergency) —   1h /   2h /  24h
//   • high     (50-500MW)                   —   4h /  24h /  48h
//   • medium   (1-50MW)                     —  24h /  72h / 168h (7d)
//   • low      (<1MW)                       —  72h / 168h / 336h (14d)
//
// Regulator inbox crossings:
//   • in_progress for critical/high  — NERSA Grid Code §C-1.3 visibility
//   • rejected when ipp_cure_deadline reached
//   • sla_breached on critical/high
//
// Imported by:
//   - tests/planned-outage-chain-spec.test.ts
//   - src/routes/planned-outage-chain.ts
// ═══════════════════════════════════════════════════════════════════════════

export type OutageStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'rescheduled'
  | 'notified'
  | 'in_progress'
  | 'restoring'
  | 'restored'
  | 'closed'
  | 'cancelled';

export type OutageAction =
  | 'submit'          // draft → submitted
  | 'begin_review'    // submitted → under_review
  | 'approve'         // under_review → approved
  | 'reject'          // under_review → rejected
  | 'reschedule'      // under_review | approved → rescheduled → submitted
  | 'notify'          // approved → notified  (72h customer notification window)
  | 'commence'        // notified → in_progress
  | 'begin_restore'   // in_progress → restoring
  | 'mark_restored'   // restoring → restored
  | 'close'           // restored → closed   (post-mortem filed)
  | 'cancel';         // any pre-restoring non-terminal → cancelled

export type OutageSeverity = 'critical' | 'high' | 'medium' | 'low';

export const ALL_STATES: readonly OutageStatus[] = [
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'rescheduled',
  'notified', 'in_progress', 'restoring', 'restored', 'closed', 'cancelled',
];

export const TERMINAL_STATES: readonly OutageStatus[] = [
  'rejected', 'closed', 'cancelled',
];

export function isTerminal(s: OutageStatus): boolean {
  return TERMINAL_STATES.includes(s);
}

export const TRANSITIONS: Record<OutageStatus, Partial<Record<OutageAction, OutageStatus>>> = {
  draft:       { submit: 'submitted',                                                cancel: 'cancelled' },
  submitted:   { begin_review: 'under_review',                                       cancel: 'cancelled' },
  under_review:{ approve: 'approved', reject: 'rejected', reschedule: 'rescheduled', cancel: 'cancelled' },
  approved:    { notify: 'notified', reschedule: 'rescheduled',                      cancel: 'cancelled' },
  rescheduled: { submit: 'submitted',                                                cancel: 'cancelled' },
  notified:    { commence: 'in_progress',                                            cancel: 'cancelled' },
  in_progress: { begin_restore: 'restoring' },
  restoring:   { mark_restored: 'restored' },
  restored:    { close: 'closed' },
  rejected:    {},
  closed:      {},
  cancelled:   {},
};

/**
 * SLA windows (minutes) by state × severity. Stage gating for the cron
 * sweep — these are *time-in-state* deadlines, not absolute times.
 */
export const SLA_MINUTES: Record<OutageStatus, Record<OutageSeverity, number>> = {
  draft:        { critical: 1440, high: 4320, medium: 10080, low: 20160 },
  submitted:    { critical: 60,   high: 240,  medium: 1440,  low: 4320 },   // 1h / 4h / 24h / 72h
  under_review: { critical: 120,  high: 1440, medium: 4320,  low: 10080 },  // 2h / 24h / 72h / 168h
  approved:     { critical: 120,  high: 1440, medium: 4320,  low: 10080 },
  rescheduled:  { critical: 240,  high: 1440, medium: 4320,  low: 10080 },
  notified:     { critical: 60,   high: 240,  medium: 720,   low: 1440 },   // 1h / 4h / 12h / 24h
  in_progress:  { critical: 240,  high: 1440, medium: 4320,  low: 10080 },
  restoring:    { critical: 60,   high: 240,  medium: 1440,  low: 4320 },
  restored:     { critical: 1440, high: 2880, medium: 10080, low: 20160 },  // post-mortem windows
  rejected:     { critical: 0, high: 0, medium: 0, low: 0 },
  closed:       { critical: 0, high: 0, medium: 0, low: 0 },
  cancelled:    { critical: 0, high: 0, medium: 0, low: 0 },
};

export function nextState(curr: OutageStatus, action: OutageAction): OutageStatus | null {
  return TRANSITIONS[curr]?.[action] ?? null;
}

export function advance(curr: OutageStatus, action: OutageAction): OutageStatus {
  const next = nextState(curr, action);
  if (!next) throw new Error(`Invalid transition: ${curr} --${action}--> ?`);
  return next;
}

export function slaDueAt(
  state: OutageStatus,
  severity: OutageSeverity,
  now: Date = new Date(),
): string {
  const mins = SLA_MINUTES[state]?.[severity] ?? 0;
  if (mins === 0) return '';
  return new Date(now.getTime() + mins * 60 * 1000).toISOString();
}

/**
 * Severity from impact (affected_mw). Used as a fallback when the
 * submitter hasn't set severity explicitly.
 */
export function severityFromMw(mw: number): OutageSeverity {
  if (mw >= 500) return 'critical';
  if (mw >= 50)  return 'high';
  if (mw >= 1)   return 'medium';
  return 'low';
}

/**
 * Regulator visibility rules for state changes.
 *
 *   commence (notified → in_progress) crosses for critical/high outages —
 *   NERSA needs real-time visibility on emergency outages.
 *   reject crosses regardless of severity once the cure window elapses
 *   (the cron sweep handles that — this fn answers "does this action
 *   cross right now"); we therefore *do not* cross reject from the
 *   approve action — the cure-window sweep handles it.
 */
export function crossesIntoRegulator(action: OutageAction, severity: OutageSeverity): boolean {
  if (action === 'commence') {
    return severity === 'critical' || severity === 'high';
  }
  return false;
}

/**
 * SLA breaches in critical or high severity always cross to regulator.
 * Medium/low SLA breaches are operational only.
 */
export function slaBreachCrossesIntoRegulator(severity: OutageSeverity): boolean {
  return severity === 'critical' || severity === 'high';
}

export function isSeverity(s: string): s is OutageSeverity {
  return s === 'critical' || s === 'high' || s === 'medium' || s === 'low';
}

export function isStatus(s: string): s is OutageStatus {
  return ALL_STATES.includes(s as OutageStatus);
}
