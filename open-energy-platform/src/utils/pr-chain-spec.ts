// ─────────────────────────────────────────────────────────────────────────
// Wave 24 — Esums Performance-Ratio sustained-underperformance chain (P6)
//
// 9-state lifecycle for tracking a site whose Performance Ratio (PR) has
// dropped below baseline for a sustained window. Cron sweep promotes
// monitoring → warning when PR < threshold for window_days; engineer takes
// it through RCA → intervention → recovery → close. False-alarm branch
// peels off weather/grid attribution. Escalation branch routes to W15
// warranty when OEM root cause is found.
// ─────────────────────────────────────────────────────────────────────────

export type PrStatus =
  | 'monitoring'
  | 'warning'
  | 'investigating'
  | 'intervention_planned'
  | 'intervention_executing'
  | 'verified'
  | 'escalated'
  | 'closed'
  | 'false_alarm';

export type PrAction =
  | 'start_warning'
  | 'begin_investigation'
  | 'complete_rca'
  | 'dispatch_intervention'
  | 'verify_recovery'
  | 'close'
  | 'escalate'
  | 'close_escalated'
  | 'mark_false_alarm'
  | 'close_false_alarm';

export type PrTier = 'utility' | 'midscale' | 'ci' | 'microgrid';

export type PrEvent =
  | 'pr_chain.warning'
  | 'pr_chain.investigating'
  | 'pr_chain.intervention_planned'
  | 'pr_chain.intervention_executing'
  | 'pr_chain.verified'
  | 'pr_chain.closed'
  | 'pr_chain.escalated'
  | 'pr_chain.false_alarm'
  | 'pr_chain.sla_breached';

const TERMINALS = new Set<PrStatus>(['closed']);

export function isTerminal(s: PrStatus): boolean {
  return TERMINALS.has(s);
}

const TRANSITIONS: Record<PrAction, { from: PrStatus[]; to: PrStatus }> = {
  start_warning:        { from: ['monitoring'],                                        to: 'warning' },
  begin_investigation:  { from: ['warning'],                                           to: 'investigating' },
  complete_rca:         { from: ['investigating'],                                     to: 'intervention_planned' },
  dispatch_intervention:{ from: ['intervention_planned'],                              to: 'intervention_executing' },
  verify_recovery:      { from: ['intervention_executing'],                            to: 'verified' },
  close:                { from: ['verified'],                                          to: 'closed' },
  escalate:             { from: ['intervention_executing', 'investigating'],           to: 'escalated' },
  close_escalated:      { from: ['escalated'],                                         to: 'closed' },
  mark_false_alarm:     { from: ['warning', 'investigating'],                          to: 'false_alarm' },
  close_false_alarm:    { from: ['false_alarm'],                                       to: 'closed' },
};

export function nextStatus(current: PrStatus, action: PrAction): PrStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: PrStatus): PrAction[] {
  const acts: PrAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [PrAction, typeof TRANSITIONS[PrAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

export function tierFromCapacityMw(capacity_mw: number): PrTier {
  if (capacity_mw >= 50) return 'utility';
  if (capacity_mw >= 10) return 'midscale';
  if (capacity_mw >= 1) return 'ci';
  return 'microgrid';
}

const HOUR = 60;
const DAY = 24 * HOUR;

export const SLA_MINUTES: Record<PrStatus, Record<PrTier, number>> = {
  warning: {
    utility:   24 * HOUR,
    midscale:  12 * HOUR,
    ci:         6 * HOUR,
    microgrid:  2 * HOUR,
  },
  investigating: {
    utility:   7 * DAY,
    midscale:  5 * DAY,
    ci:        3 * DAY,
    microgrid: 2 * DAY,
  },
  intervention_planned: {
    utility:   14 * DAY,
    midscale:  10 * DAY,
    ci:        7 * DAY,
    microgrid: 5 * DAY,
  },
  intervention_executing: {
    utility:   30 * DAY,
    midscale:  21 * DAY,
    ci:        14 * DAY,
    microgrid: 10 * DAY,
  },
  verified: {
    utility:   14 * DAY,
    midscale:  14 * DAY,
    ci:        14 * DAY,
    microgrid: 14 * DAY,
  },
  escalated: {
    utility:   30 * DAY,
    midscale:  21 * DAY,
    ci:        14 * DAY,
    microgrid: 10 * DAY,
  },
  monitoring:  { utility: 0, midscale: 0, ci: 0, microgrid: 0 },
  closed:      { utility: 0, midscale: 0, ci: 0, microgrid: 0 },
  false_alarm: { utility: 0, midscale: 0, ci: 0, microgrid: 0 },
};

export function slaDeadlineFor(status: PrStatus, tier: PrTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

export function crossesIntoRegulator(action: PrAction, tier: PrTier): boolean {
  if (tier !== 'utility') return false;
  return action === 'escalate';
}

export function slaBreachCrossesIntoRegulator(tier: PrTier): boolean {
  return tier === 'utility';
}
