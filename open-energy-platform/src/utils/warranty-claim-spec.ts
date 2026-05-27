// ════════════════════════════════════════════════════════════════════════
// Wave 15 — OEM warranty / RMA claim chain (pure spec).
//
// Deepens Esums O&M / asset operations with an end-to-end OEM warranty
// claim lifecycle. Severity-tiered SLA windows track each stage; safety
// severity claims cross into the regulator inbox on escalation or breach.
//
// State machine:
//   opened → triaged → submitted → acknowledged → under_review
//                                                  ↓        ↘
//                                                approved   denied
//                                                  ↓          ↓
//                                                fulfilled  disputed
//                                                  ↓          ↓
//                                                closed    {approved | closed (uphold)}
//
// Per-severity SLA windows (in minutes):
//   triage     (opened → triaged)         safety  240 / perf 1440 / cosm 4320
//   submit     (triaged → submitted)      safety  720 / perf 4320 / cosm 14400
//   ack        (submitted → acknowledged) safety  240 / perf 1440 / cosm 10080
//   review     (acknowledged → review)    safety 1440 / perf 10080 / cosm 43200
//   approve    (under_review → approved)  safety 4320 / perf 43200 / cosm 129600
//   fulfill    (approved → fulfilled)     safety 20160 / perf 86400 / cosm 259200
// ════════════════════════════════════════════════════════════════════════

export type ClaimStatus =
  | 'opened'
  | 'triaged'
  | 'submitted'
  | 'acknowledged'
  | 'under_review'
  | 'approved'
  | 'denied'
  | 'disputed'
  | 'fulfilled'
  | 'closed';

export type ClaimAction =
  | 'triage'
  | 'submit'
  | 'acknowledge'
  | 'begin_review'
  | 'approve'
  | 'deny'
  | 'dispute'
  | 'uphold_denial'
  | 'fulfill'
  | 'close';

export type ClaimSeverity = 'safety' | 'performance' | 'cosmetic';

type SlaWindow = 'triage' | 'submit' | 'ack' | 'review' | 'approve' | 'fulfill';

interface TransitionRule {
  next: ClaimStatus;
  setNextSla?: SlaWindow | null;
  clearNextSla?: boolean;
}

export const TRANSITIONS: Record<
  ClaimStatus,
  Partial<Record<ClaimAction, TransitionRule>>
> = {
  opened: {
    triage: { next: 'triaged', setNextSla: 'submit' },
    close:  { next: 'closed', clearNextSla: true },
  },
  triaged: {
    submit: { next: 'submitted', setNextSla: 'ack' },
    close:  { next: 'closed', clearNextSla: true },
  },
  submitted: {
    acknowledge: { next: 'acknowledged', setNextSla: 'review' },
  },
  acknowledged: {
    begin_review: { next: 'under_review', setNextSla: 'approve' },
  },
  under_review: {
    approve: { next: 'approved', setNextSla: 'fulfill' },
    deny:    { next: 'denied', clearNextSla: true },
  },
  approved: {
    fulfill: { next: 'fulfilled', clearNextSla: true },
  },
  denied: {
    dispute: { next: 'disputed', setNextSla: 'review' },
    close:   { next: 'closed', clearNextSla: true },
  },
  disputed: {
    approve:       { next: 'approved', setNextSla: 'fulfill' },
    uphold_denial: { next: 'closed', clearNextSla: true },
  },
  fulfilled: {
    close: { next: 'closed', clearNextSla: true },
  },
  closed: {},
};

// SLA windows in minutes, keyed by severity × window stage.
export const SLA_MINUTES: Record<ClaimSeverity, Record<SlaWindow, number>> = {
  safety:      { triage:  240, submit:   720, ack:   240, review:  1440, approve:   4320, fulfill:  20160 }, //  4h/12h/4h/24h/72h/14d
  performance: { triage: 1440, submit:  4320, ack:  1440, review: 10080, approve:  43200, fulfill:  86400 }, //  1d/3d/1d/7d/30d/60d
  cosmetic:    { triage: 4320, submit: 14400, ack: 10080, review: 43200, approve: 129600, fulfill: 259200 }, //  3d/10d/7d/30d/90d/180d
};

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  opened:       'Opened',
  triaged:      'Triaged',
  submitted:    'Submitted to OEM',
  acknowledged: 'OEM acknowledged',
  under_review: 'Under OEM review',
  approved:     'Approved',
  denied:       'Denied',
  disputed:     'Disputed',
  fulfilled:    'Fulfilled',
  closed:       'Closed',
};

export const SEVERITY_LABEL: Record<ClaimSeverity, string> = {
  safety:      'Safety',
  performance: 'Performance',
  cosmetic:    'Cosmetic',
};

const TERMINAL: ClaimStatus[] = ['closed'];

export function isTerminal(s: ClaimStatus): boolean {
  return TERMINAL.includes(s);
}

export function hasSlaWindow(s: ClaimStatus): boolean {
  return s === 'opened' || s === 'triaged' || s === 'submitted' ||
         s === 'acknowledged' || s === 'under_review' || s === 'approved' ||
         s === 'disputed';
}

export function slaWindowFor(s: ClaimStatus): SlaWindow | null {
  if (s === 'opened')       return 'triage';
  if (s === 'triaged')      return 'submit';
  if (s === 'submitted')    return 'ack';
  if (s === 'acknowledged') return 'review';
  if (s === 'under_review') return 'approve';
  if (s === 'approved')     return 'fulfill';
  if (s === 'disputed')     return 'review';
  return null;
}

export function slaDueAt(
  state: ClaimStatus,
  severity: ClaimSeverity,
  enteredAt: Date,
): Date | null {
  const window = slaWindowFor(state);
  if (!window) return null;
  const m = SLA_MINUTES[severity][window];
  return new Date(enteredAt.getTime() + m * 60 * 1000);
}

export function minutesUntilDeadline(deadline: Date, now: Date): number {
  return Math.floor((deadline.getTime() - now.getTime()) / 60_000);
}

export function isSlaBreached(deadline: Date | null, now: Date): boolean {
  if (!deadline) return false;
  return deadline.getTime() < now.getTime();
}

// Safety severity always crosses into regulator on dispute, denial, or breach.
// Performance/cosmetic stays internal.
export function crossesIntoRegulator(
  action: ClaimAction,
  severity: ClaimSeverity,
): boolean {
  if (severity !== 'safety') return false;
  return action === 'dispute' || action === 'deny';
}

export function slaBreachCrossesIntoRegulator(severity: ClaimSeverity): boolean {
  return severity === 'safety';
}

export interface AdvanceResult {
  next: ClaimStatus;
  setNextSla: SlaWindow | null;
  clearNextSla: boolean;
}

export function advance(current: ClaimStatus, action: ClaimAction): AdvanceResult {
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
