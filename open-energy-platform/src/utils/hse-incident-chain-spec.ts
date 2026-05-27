// ─────────────────────────────────────────────────────────────────────────
// Wave 25 — HSE/SHEQ incident chain (OHSA Section 24 + NEMA Section 30) (P6)
//
// 9-state lifecycle for workplace-safety + environmental incidents on
// IPP construction sites and Esums O&M sites.
//
//   reported → triaged → notified_authority → investigating →
//   corrective_actions_planned → corrective_actions_executing →
//   verified → closed
//
// Branches:
//   escalated  — DEL/DFFE inspector follow-up / enforcement action
//   false_alarm — initial classification revised down to no-incident
//
// Severity tiers:
//   fatal         — fatal injury or multiple serious; DEL 8h
//   major         — serious injury >14 days off OR offsite enviro impact; 24h
//   environmental — NEMA s30 release with no injury; DFFE 72h
//   minor         — first-aid / lost-time <14 days; internal only
//   near_miss     — no injury but potential; internal learning
//
// Regulator crossings: fatal + major + environmental tiers only.
//
// ─────────────────────────────────────────────────────────────────────────

export type HseStatus =
  | 'reported'
  | 'triaged'
  | 'notified_authority'
  | 'investigating'
  | 'corrective_actions_planned'
  | 'corrective_actions_executing'
  | 'verified'
  | 'closed'
  | 'escalated'
  | 'false_alarm';

export type HseAction =
  | 'triage'
  | 'notify_authority'
  | 'begin_investigation'
  | 'complete_rca'
  | 'dispatch_corrective'
  | 'verify_corrective'
  | 'close'
  | 'escalate'
  | 'close_escalated'
  | 'mark_false_alarm'
  | 'close_false_alarm';

export type HseTier = 'fatal' | 'major' | 'environmental' | 'minor' | 'near_miss';

export type HseEvent =
  | 'hse_incident.triaged'
  | 'hse_incident.notified_authority'
  | 'hse_incident.investigating'
  | 'hse_incident.corrective_actions_planned'
  | 'hse_incident.corrective_actions_executing'
  | 'hse_incident.verified'
  | 'hse_incident.closed'
  | 'hse_incident.escalated'
  | 'hse_incident.false_alarm'
  | 'hse_incident.sla_breached';

const TERMINALS = new Set<HseStatus>(['closed']);

export function isTerminal(s: HseStatus): boolean {
  return TERMINALS.has(s);
}

const TRANSITIONS: Record<HseAction, { from: HseStatus[]; to: HseStatus }> = {
  triage:               { from: ['reported'],                            to: 'triaged' },
  notify_authority:     { from: ['triaged'],                             to: 'notified_authority' },
  begin_investigation:  { from: ['triaged', 'notified_authority'],       to: 'investigating' },
  complete_rca:         { from: ['investigating'],                       to: 'corrective_actions_planned' },
  dispatch_corrective:  { from: ['corrective_actions_planned'],          to: 'corrective_actions_executing' },
  verify_corrective:    { from: ['corrective_actions_executing'],        to: 'verified' },
  close:                { from: ['verified'],                            to: 'closed' },
  escalate:             { from: ['investigating',
                                 'corrective_actions_planned',
                                 'corrective_actions_executing'],         to: 'escalated' },
  close_escalated:      { from: ['escalated'],                            to: 'closed' },
  mark_false_alarm:     { from: ['reported', 'triaged'],                  to: 'false_alarm' },
  close_false_alarm:    { from: ['false_alarm'],                          to: 'closed' },
};

export function nextStatus(current: HseStatus, action: HseAction): HseStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: HseStatus): HseAction[] {
  const acts: HseAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [HseAction, typeof TRANSITIONS[HseAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const HOUR = 60;
const DAY = 24 * HOUR;

// URGENT matrix throughout — high-severity gets MORE-frequent SLAs at every stage
// (DEL/DFFE statutory deadlines drive this, not investigative depth).
export const SLA_MINUTES: Record<HseStatus, Record<HseTier, number>> = {
  reported: {
    fatal:         1 * HOUR,   // must triage within 1h of report
    major:         4 * HOUR,
    environmental: 4 * HOUR,
    minor:        24 * HOUR,
    near_miss:    48 * HOUR,
  },
  triaged: {
    fatal:         8 * HOUR,   // OHSA Section 24 — 7-day investigation report; notify DEL 8h
    major:        24 * HOUR,
    environmental: 72 * HOUR,  // NEMA Section 30 — 72h notification
    minor:         7 * DAY,
    near_miss:    14 * DAY,
  },
  notified_authority: {
    fatal:         7 * DAY,    // DEL investigation window
    major:        14 * DAY,
    environmental: 30 * DAY,   // DFFE
    minor:         0,          // not applicable
    near_miss:     0,
  },
  investigating: {
    fatal:         7 * DAY,
    major:        14 * DAY,
    environmental: 30 * DAY,
    minor:        30 * DAY,
    near_miss:    60 * DAY,
  },
  corrective_actions_planned: {
    fatal:        14 * DAY,
    major:        30 * DAY,
    environmental: 30 * DAY,
    minor:        60 * DAY,
    near_miss:    90 * DAY,
  },
  corrective_actions_executing: {
    fatal:        30 * DAY,
    major:        60 * DAY,
    environmental: 60 * DAY,
    minor:        90 * DAY,
    near_miss:    90 * DAY,
  },
  verified: {
    fatal:        30 * DAY,
    major:        30 * DAY,
    environmental: 30 * DAY,
    minor:        30 * DAY,
    near_miss:    30 * DAY,
  },
  escalated: {
    fatal:        30 * DAY,
    major:        60 * DAY,
    environmental: 60 * DAY,
    minor:        90 * DAY,
    near_miss:    90 * DAY,
  },
  closed:      { fatal: 0, major: 0, environmental: 0, minor: 0, near_miss: 0 },
  false_alarm: { fatal: 0, major: 0, environmental: 0, minor: 0, near_miss: 0 },
};

export function slaDeadlineFor(status: HseStatus, tier: HseTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

const REPORTABLE_TIERS = new Set<HseTier>(['fatal', 'major', 'environmental']);

export function isReportable(tier: HseTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

export function crossesIntoRegulator(action: HseAction, tier: HseTier): boolean {
  if (!REPORTABLE_TIERS.has(tier)) return false;
  return (
    action === 'notify_authority' ||
    action === 'escalate' ||
    action === 'close' ||
    action === 'close_escalated'
  );
}

export function slaBreachCrossesIntoRegulator(tier: HseTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}
