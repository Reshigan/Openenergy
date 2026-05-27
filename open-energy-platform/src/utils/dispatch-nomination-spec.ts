// ════════════════════════════════════════════════════════════════════════
// Wave 13 — Grid operator dispatch nomination chain (pure spec).
//
// State machine for the day-ahead BRP nomination → SO acceptance →
// activation → performance → settlement → close lifecycle. Pure functions
// only; no D1, no env, no Date.now() — every time call goes through an
// explicit `now: Date` argument so tests can pin the clock.
//
// States (10):
//   nominated → accepted → activated → performance_recorded →
//   settled → closed
// Terminal branches:
//   nomination_rejected       (rejected at the accept gate)
//   disputed → dispute_resolved → closed_disputed
//
// Per-stage SLAs (NERSA System Operations Code-aligned, in minutes):
//   nominated → accepted              :     15 m
//   accepted → activated              :     30 m
//   activated → performance_recorded  :     60 m (post-delivery-end)
//   performance_recorded → settled    :   5 d = 7200 m
//   settled → closed                  :  15 d = 21600 m
//   dispute_raised → dispute_resolved :  10 d = 14400 m
// ════════════════════════════════════════════════════════════════════════

export type NominationStatus =
  | 'nominated'
  | 'accepted'
  | 'activated'
  | 'performance_recorded'
  | 'settled'
  | 'closed'
  | 'nomination_rejected'
  | 'disputed'
  | 'dispute_resolved'
  | 'closed_disputed';

export type NominationAction =
  | 'accept'
  | 'reject'
  | 'activate'
  | 'record_performance'
  | 'settle'
  | 'close'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'close_disputed';

interface TransitionRule {
  next: NominationStatus;
  setNextSla?: boolean;
  clearNextSla?: boolean;
}

// Linear happy-path transitions and side branches.
export const TRANSITIONS: Record<
  NominationStatus,
  Partial<Record<NominationAction, TransitionRule>>
> = {
  nominated: {
    accept: { next: 'accepted', setNextSla: true },
    reject: { next: 'nomination_rejected', clearNextSla: true },
  },
  accepted: {
    activate: { next: 'activated', setNextSla: true },
  },
  activated: {
    record_performance: { next: 'performance_recorded', setNextSla: true },
  },
  performance_recorded: {
    settle: { next: 'settled', setNextSla: true },
    raise_dispute: { next: 'disputed', setNextSla: true },
  },
  settled: {
    close: { next: 'closed', clearNextSla: true },
    raise_dispute: { next: 'disputed', setNextSla: true },
  },
  disputed: {
    resolve_dispute: { next: 'dispute_resolved', setNextSla: true },
  },
  dispute_resolved: {
    close_disputed: { next: 'closed_disputed', clearNextSla: true },
  },
  closed: {},
  nomination_rejected: {},
  closed_disputed: {},
};

// SLA windows in minutes, keyed by the STATE you're sitting in waiting for
// the next action. Terminal states omitted.
export const SLA_MINUTES: Partial<Record<NominationStatus, number>> = {
  nominated: 15,
  accepted: 30,
  activated: 60,
  performance_recorded: 7200, // 5d
  settled: 21600,             // 15d
  disputed: 14400,            // 10d
};

export const STATUS_LABEL: Record<NominationStatus, string> = {
  nominated: 'Nominated (awaiting SO accept)',
  accepted: 'Accepted (pre-activation)',
  activated: 'Activated (in delivery)',
  performance_recorded: 'Performance recorded',
  settled: 'Settled',
  closed: 'Closed',
  nomination_rejected: 'Rejected by SO',
  disputed: 'Disputed',
  dispute_resolved: 'Dispute resolved',
  closed_disputed: 'Closed (post-dispute)',
};

const TERMINAL: NominationStatus[] = ['closed', 'nomination_rejected', 'closed_disputed'];

export function isTerminal(s: NominationStatus): boolean {
  return TERMINAL.includes(s);
}

export function hasSlaWindow(s: NominationStatus): boolean {
  return SLA_MINUTES[s] !== undefined;
}

export function slaDueAt(state: NominationStatus, enteredAt: Date): Date | null {
  const m = SLA_MINUTES[state];
  if (m === undefined) return null;
  return new Date(enteredAt.getTime() + m * 60 * 1000);
}

export function minutesUntilDeadline(deadline: Date, now: Date): number {
  return Math.floor((deadline.getTime() - now.getTime()) / 60_000);
}

export function isSlaBreached(deadline: Date | null, now: Date): boolean {
  if (!deadline) return false;
  return deadline.getTime() < now.getTime();
}

// Returns the state that crosses an event into the regulator inbox.
// Only fires once on ENTRY into the terminal/breach state.
export function crossesIntoRegulator(action: NominationAction): boolean {
  switch (action) {
    case 'reject':
    case 'raise_dispute':
      return true;
    default:
      return false;
  }
}

export interface AdvanceResult {
  next: NominationStatus;
  setNextSla: boolean;
  clearNextSla: boolean;
}

export function advance(
  current: NominationStatus,
  action: NominationAction,
): AdvanceResult {
  const rule = TRANSITIONS[current]?.[action];
  if (!rule) {
    throw new Error(`illegal transition: ${current} --${action}--> ?`);
  }
  return {
    next: rule.next,
    setNextSla: rule.setNextSla === true,
    clearNextSla: rule.clearNextSla === true,
  };
}
