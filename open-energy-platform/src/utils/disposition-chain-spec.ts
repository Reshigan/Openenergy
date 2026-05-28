// ─────────────────────────────────────────────────────────────────────────
// Wave 31 — Regulator Compliance Notice Disposition chain (NERSA Act §10)
//
// 11-state lifecycle for how the Regulator disposes of every inbox notice
// crossed in by other waves (W18 critical outages, W21 senior drawdowns,
// W22 strategic PPA terminations, W23 catastrophic insurance, W25 fatal
// HSE, W26 catastrophic cyber, W27 high-scoring ED, W29 prop/MM position
// limits, W30 lender clawbacks/SLA breaches, etc).
//
// Statutory anchor:
//   NERSA Act 2004 §10(2) requires the Regulator to dispose of every
//   notice within 90 days of receipt and to escalate any breach of that
//   window to the NERSA Council for monthly §10 reporting.
//
// Forward path:
//   received → triaged → assigned → investigating → action_required →
//   action_in_progress → action_completed → closed
//
// Branch terminals:
//   escalated  — Council senior panel / NERSA DG (severity tier breach)
//   dismissed  — false alarm / no jurisdiction (audit only)
//   referred   — handed to other authority (SAPS, DMRE, FSCA, NEMA, DEL)
//
// Severity tiers (drives INVERTED SLA — critical disposed fastest, low slowest):
//   critical — triage 4h,  total disposition 30d
//   high     — triage 24h, total disposition 60d
//   medium   — triage 72h, total disposition 90d (Section 10 statutory)
//   low      — triage 7d,  total disposition 180d
//
// Reportability (NERSA Council §10 monthly report):
//   - close + escalate cross for critical + high tiers
//   - sla_breached crosses for ALL tiers (Section 10 hard line)
//   - dismiss / refer are audit-only
// ─────────────────────────────────────────────────────────────────────────

export type DispositionStatus =
  | 'received'
  | 'triaged'
  | 'assigned'
  | 'investigating'
  | 'action_required'
  | 'action_in_progress'
  | 'action_completed'
  | 'closed'
  | 'escalated'
  | 'dismissed'
  | 'referred';

export type DispositionAction =
  | 'triage'
  | 'assign'
  | 'begin_investigation'
  | 'require_action'
  | 'begin_action'
  | 'complete_action'
  | 'close'
  | 'escalate'
  | 'dismiss'
  | 'refer';

export type DispositionTier = 'critical' | 'high' | 'medium' | 'low';

export type DispositionEvent =
  | 'disposition.triaged'
  | 'disposition.assigned'
  | 'disposition.investigating'
  | 'disposition.action_required'
  | 'disposition.action_in_progress'
  | 'disposition.action_completed'
  | 'disposition.closed'
  | 'disposition.escalated'
  | 'disposition.dismissed'
  | 'disposition.referred'
  | 'disposition.sla_breached';

const TERMINALS = new Set<DispositionStatus>(['closed', 'escalated', 'dismissed', 'referred']);

export function isTerminal(s: DispositionStatus): boolean {
  return TERMINALS.has(s);
}

const TRANSITIONS: Record<DispositionAction, { from: DispositionStatus[]; to: DispositionStatus }> = {
  triage:              { from: ['received'],           to: 'triaged' },
  assign:              { from: ['triaged'],            to: 'assigned' },
  begin_investigation: { from: ['assigned'],           to: 'investigating' },
  require_action:      { from: ['investigating'],      to: 'action_required' },
  begin_action:        { from: ['action_required'],    to: 'action_in_progress' },
  complete_action:     { from: ['action_in_progress'], to: 'action_completed' },
  close:               { from: ['action_completed'],   to: 'closed' },
  escalate: {
    from: ['triaged', 'assigned', 'investigating', 'action_required', 'action_in_progress', 'action_completed'],
    to: 'escalated',
  },
  dismiss: {
    from: ['received', 'triaged', 'investigating'],
    to: 'dismissed',
  },
  refer: {
    from: ['received', 'triaged', 'investigating'],
    to: 'referred',
  },
};

export function nextStatus(current: DispositionStatus, action: DispositionAction): DispositionStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: DispositionStatus): DispositionAction[] {
  const acts: DispositionAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [DispositionAction, typeof TRANSITIONS[DispositionAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED tier SLA — critical disposed fastest, low slowest. Section 10
// statutory window is 90d (medium); critical compressed for safety/financial
// systemic risk; low extended for routine policy clarifications.
export const SLA_MINUTES: Record<DispositionStatus, Record<DispositionTier, number>> = {
  received: {
    critical:  4 * HOUR,
    high:      24 * HOUR,
    medium:    72 * HOUR,
    low:       7 * DAY,
  },
  triaged: {
    critical:  1 * DAY,    // assign within 1 day
    high:      3 * DAY,
    medium:    7 * DAY,
    low:       14 * DAY,
  },
  assigned: {
    critical:  2 * DAY,    // begin investigation
    high:      5 * DAY,
    medium:    14 * DAY,
    low:       21 * DAY,
  },
  investigating: {
    critical:  10 * DAY,   // bulk of disposition window
    high:      21 * DAY,
    medium:    45 * DAY,
    low:       90 * DAY,
  },
  action_required: {
    critical:  3 * DAY,
    high:      7 * DAY,
    medium:    14 * DAY,
    low:       21 * DAY,
  },
  action_in_progress: {
    critical:  7 * DAY,
    high:      14 * DAY,
    medium:    21 * DAY,
    low:       30 * DAY,
  },
  action_completed: {
    critical:  3 * DAY,    // close within 3 days of action
    high:      5 * DAY,
    medium:    7 * DAY,
    low:       14 * DAY,
  },
  closed:    { critical: 0, high: 0, medium: 0, low: 0 },
  escalated: { critical: 0, high: 0, medium: 0, low: 0 },
  dismissed: { critical: 0, high: 0, medium: 0, low: 0 },
  referred:  { critical: 0, high: 0, medium: 0, low: 0 },
};

export function slaDeadlineFor(status: DispositionStatus, tier: DispositionTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// NERSA Council §10 monthly report reportability.
// close + escalate cross for critical + high (systemic / safety / financial);
// sla_breached crosses for ALL tiers (Section 10 hard line — DG-level
// reporting); dismiss + refer are audit-only.
const CLOSE_REPORTABLE = new Set<DispositionTier>(['critical', 'high']);
const SLA_REPORTABLE = new Set<DispositionTier>(['critical', 'high', 'medium', 'low']);

export function isReportable(tier: DispositionTier): boolean {
  return CLOSE_REPORTABLE.has(tier);
}

export function crossesIntoCouncil(action: DispositionAction, tier: DispositionTier): boolean {
  if (action === 'close' || action === 'escalate') return CLOSE_REPORTABLE.has(tier);
  return false;
}

export function slaBreachCrossesIntoCouncil(tier: DispositionTier): boolean {
  return SLA_REPORTABLE.has(tier);
}
