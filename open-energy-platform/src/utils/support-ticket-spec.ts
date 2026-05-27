// ════════════════════════════════════════════════════════════════════════
// Wave 14 — Support ticket P6 chain (pure spec).
//
// Deepens the L2 support_tickets schema (mig 056) into a regulator-grade
// state machine: priority-tiered SLA windows for first response and
// resolution, fire-once SLA breach cascades, POPIA-flagged cross-tenant
// access auditing, audit chain table.
//
// State machine:
//   open → triaged → in_progress → awaiting_user → resolved → closed
//                  ↑          ↓
//                  reopened (from resolved/closed)
//                  escalated (from in_progress/awaiting_user → terminal-ish)
//
// Per-priority SLA tiers (NIST-/CSAT-aligned):
//   triage (open → triaged)          : 1 / 2 / 4 / 8 h    (P1/P2/P3/P4)
//   first_response (triaged → in_p)  : 2 / 4 / 8 / 24 h
//   resolution (in_progress → res)   : 4 / 24 / 5d / 15d
//
// "next_sla_due_at" = whichever SLA window is currently armed.
// On reopen, resolution SLA re-arms from now.
// ════════════════════════════════════════════════════════════════════════

export type TicketStatus =
  | 'open'
  | 'triaged'
  | 'in_progress'
  | 'awaiting_user'
  | 'resolved'
  | 'closed'
  | 'escalated';

export type TicketAction =
  | 'triage'
  | 'pick_up'
  | 'wait_for_user'
  | 'user_responded'
  | 'resolve'
  | 'close'
  | 'reopen'
  | 'escalate';

export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';
//                              P1        P2       P3        P4

interface TransitionRule {
  next: TicketStatus;
  setNextSla?: 'first_response' | 'resolution' | null;
  clearNextSla?: boolean;
}

export const TRANSITIONS: Record<
  TicketStatus,
  Partial<Record<TicketAction, TransitionRule>>
> = {
  open: {
    triage:   { next: 'triaged', setNextSla: 'first_response' },
    escalate: { next: 'escalated', clearNextSla: true },
  },
  triaged: {
    pick_up:  { next: 'in_progress', setNextSla: 'resolution' },
    escalate: { next: 'escalated', clearNextSla: true },
  },
  in_progress: {
    wait_for_user: { next: 'awaiting_user', clearNextSla: true },
    resolve:       { next: 'resolved', clearNextSla: true },
    escalate:      { next: 'escalated', clearNextSla: true },
  },
  awaiting_user: {
    user_responded: { next: 'in_progress', setNextSla: 'resolution' },
    resolve:        { next: 'resolved', clearNextSla: true },
    escalate:       { next: 'escalated', clearNextSla: true },
  },
  resolved: {
    close:  { next: 'closed', clearNextSla: true },
    reopen: { next: 'in_progress', setNextSla: 'resolution' },
  },
  closed: {
    reopen: { next: 'in_progress', setNextSla: 'resolution' },
  },
  escalated: {},
};

// SLA windows in minutes, keyed by priority tier × window kind.
export const SLA_MINUTES: Record<
  TicketPriority,
  { first_response: number; resolution: number; triage: number }
> = {
  urgent: { triage:  60, first_response: 120,    resolution: 240    }, //  1h / 2h / 4h
  high:   { triage: 120, first_response: 240,    resolution: 1440   }, //  2h / 4h / 24h
  normal: { triage: 240, first_response: 480,    resolution: 7200   }, //  4h / 8h / 5d
  low:    { triage: 480, first_response: 1440,   resolution: 21600  }, //  8h / 24h / 15d
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open (untriaged)',
  triaged: 'Triaged',
  in_progress: 'In progress',
  awaiting_user: 'Awaiting user',
  resolved: 'Resolved',
  closed: 'Closed',
  escalated: 'Escalated',
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  urgent: 'P1 — urgent',
  high:   'P2 — high',
  normal: 'P3 — normal',
  low:    'P4 — low',
};

const TERMINAL: TicketStatus[] = ['closed', 'escalated'];

export function isTerminal(s: TicketStatus): boolean {
  return TERMINAL.includes(s);
}

export function hasSlaWindow(s: TicketStatus): boolean {
  // open ticks against triage SLA; triaged → first_response; in_progress → resolution
  return s === 'open' || s === 'triaged' || s === 'in_progress';
}

export function slaWindowFor(s: TicketStatus): 'triage' | 'first_response' | 'resolution' | null {
  if (s === 'open')        return 'triage';
  if (s === 'triaged')     return 'first_response';
  if (s === 'in_progress') return 'resolution';
  return null;
}

export function slaDueAt(
  state: TicketStatus,
  priority: TicketPriority,
  enteredAt: Date,
): Date | null {
  const window = slaWindowFor(state);
  if (!window) return null;
  const m = SLA_MINUTES[priority][window];
  return new Date(enteredAt.getTime() + m * 60 * 1000);
}

export function minutesUntilDeadline(deadline: Date, now: Date): number {
  return Math.floor((deadline.getTime() - now.getTime()) / 60_000);
}

export function isSlaBreached(deadline: Date | null, now: Date): boolean {
  if (!deadline) return false;
  return deadline.getTime() < now.getTime();
}

// POPIA-grade: cross-tenant access from support always emits an audit row.
// Escalations into regulator inbox: any P1 SLA breach + any compliance-flagged
// ticket SLA breach.
export function crossesIntoRegulator(
  action: TicketAction,
  priority: TicketPriority,
  category: string,
): boolean {
  if (action === 'escalate' && priority === 'urgent') return true;
  if (action === 'escalate' && category === 'compliance') return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(
  priority: TicketPriority,
  category: string,
): boolean {
  return priority === 'urgent' || category === 'compliance';
}

export interface AdvanceResult {
  next: TicketStatus;
  setNextSla: 'first_response' | 'resolution' | null;
  clearNextSla: boolean;
}

export function advance(
  current: TicketStatus,
  action: TicketAction,
): AdvanceResult {
  const rule = TRANSITIONS[current]?.[action];
  if (!rule) {
    throw new Error(`illegal transition: ${current} --${action}--> ?`);
  }
  return {
    next: rule.next,
    setNextSla: rule.setNextSla ?? null,
    clearNextSla: rule.clearNextSla === true,
  };
}
