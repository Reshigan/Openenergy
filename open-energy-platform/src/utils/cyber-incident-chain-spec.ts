// ─────────────────────────────────────────────────────────────────────────
// Wave 26 — Cybersecurity / POPIA Section 22 breach incident chain (P6)
//
// 10-state lifecycle for digital security incidents — covers POPIA s22
// (Information Regulator + data-subject notification) and the Cybercrimes
// Act s54 (SAPS Cybercrime Investigation Unit reporting).
//
//   detected → triaged → contained → notified_regulator →
//   notified_subjects → investigating → remediation_planned →
//   remediation_executing → verified → closed
//
// Branches:
//   escalated   — criminal referral / serious enforcement
//   false_alarm — initial classification revised down to no-incident
//
// Severity tiers:
//   catastrophic  — market-integrity / trading / settlement compromise; 24h IR
//   major         — sensitive PII (ID, banking, biometrics, health); 72h IR
//   personal_data — general PII (names + emails + non-sensitive); 72h IR
//   operational   — internal system unavailability, no exfiltration; internal
//   low           — minor anomaly, no impact; internal learning
//
// Regulator crossings: catastrophic + major + personal_data tiers only.
//
// ─────────────────────────────────────────────────────────────────────────

export type CyberStatus =
  | 'detected'
  | 'triaged'
  | 'contained'
  | 'notified_regulator'
  | 'notified_subjects'
  | 'investigating'
  | 'remediation_planned'
  | 'remediation_executing'
  | 'verified'
  | 'closed'
  | 'escalated'
  | 'false_alarm';

export type CyberAction =
  | 'triage'
  | 'contain'
  | 'notify_regulator'
  | 'notify_subjects'
  | 'skip_notify'
  | 'begin_investigation'
  | 'complete_rca'
  | 'dispatch_remediation'
  | 'verify_remediation'
  | 'close'
  | 'escalate'
  | 'close_escalated'
  | 'mark_false_alarm'
  | 'close_false_alarm';

export type CyberTier =
  | 'catastrophic'
  | 'major'
  | 'personal_data'
  | 'operational'
  | 'low';

export type CyberEvent =
  | 'cyber_incident.triaged'
  | 'cyber_incident.contained'
  | 'cyber_incident.notified_regulator'
  | 'cyber_incident.notified_subjects'
  | 'cyber_incident.investigating'
  | 'cyber_incident.remediation_planned'
  | 'cyber_incident.remediation_executing'
  | 'cyber_incident.verified'
  | 'cyber_incident.closed'
  | 'cyber_incident.escalated'
  | 'cyber_incident.false_alarm'
  | 'cyber_incident.sla_breached';

const TERMINALS = new Set<CyberStatus>(['closed']);

export function isTerminal(s: CyberStatus): boolean {
  return TERMINALS.has(s);
}

const TRANSITIONS: Record<CyberAction, { from: CyberStatus[]; to: CyberStatus }> = {
  triage:              { from: ['detected'],                                       to: 'triaged' },
  contain:             { from: ['triaged'],                                        to: 'contained' },
  notify_regulator:    { from: ['contained'],                                      to: 'notified_regulator' },
  notify_subjects:     { from: ['notified_regulator'],                             to: 'notified_subjects' },
  skip_notify:         { from: ['contained'],                                      to: 'investigating' },
  begin_investigation: { from: ['notified_subjects'],                              to: 'investigating' },
  complete_rca:        { from: ['investigating'],                                  to: 'remediation_planned' },
  dispatch_remediation:{ from: ['remediation_planned'],                            to: 'remediation_executing' },
  verify_remediation:  { from: ['remediation_executing'],                          to: 'verified' },
  close:               { from: ['verified'],                                       to: 'closed' },
  escalate:            { from: ['investigating',
                                'remediation_planned',
                                'remediation_executing'],                           to: 'escalated' },
  close_escalated:     { from: ['escalated'],                                       to: 'closed' },
  mark_false_alarm:    { from: ['detected', 'triaged'],                             to: 'false_alarm' },
  close_false_alarm:   { from: ['false_alarm'],                                     to: 'closed' },
};

export function nextStatus(current: CyberStatus, action: CyberAction): CyberStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: CyberStatus): CyberAction[] {
  const acts: CyberAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [CyberAction, typeof TRANSITIONS[CyberAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60;
const DAY = 24 * HOUR;

// URGENT matrix throughout — high-severity gets faster SLAs at every stage
// (POPIA s22 + Cybercrimes Act s54 statutory deadlines drive this).
export const SLA_MINUTES: Record<CyberStatus, Record<CyberTier, number>> = {
  detected: {
    catastrophic:  30 * MIN,    // detection-response window for market integrity
    major:          2 * HOUR,
    personal_data:  4 * HOUR,
    operational:   24 * HOUR,
    low:           72 * HOUR,
  },
  triaged: {
    catastrophic:   1 * HOUR,   // contain immediately
    major:          4 * HOUR,
    personal_data:  8 * HOUR,
    operational:   24 * HOUR,
    low:           72 * HOUR,
  },
  contained: {
    catastrophic:  24 * HOUR,   // POPIA s22 "as soon as reasonably possible" — hard 24h cap for cat
    major:         72 * HOUR,   // 72h IR notification cap
    personal_data: 72 * HOUR,
    operational:    0,          // n/a — skip_notify path
    low:            0,
  },
  notified_regulator: {
    catastrophic:  48 * HOUR,   // subjects notified within 48h of IR for cat
    major:         72 * HOUR,
    personal_data:  7 * DAY,
    operational:    0,
    low:            0,
  },
  notified_subjects: {
    catastrophic:   7 * DAY,    // begin formal investigation
    major:         14 * DAY,
    personal_data: 21 * DAY,
    operational:    0,
    low:            0,
  },
  investigating: {
    catastrophic:   7 * DAY,
    major:         14 * DAY,
    personal_data: 21 * DAY,
    operational:   30 * DAY,
    low:           60 * DAY,
  },
  remediation_planned: {
    catastrophic:  14 * DAY,
    major:         21 * DAY,
    personal_data: 30 * DAY,
    operational:   45 * DAY,
    low:           60 * DAY,
  },
  remediation_executing: {
    catastrophic:  30 * DAY,
    major:         45 * DAY,
    personal_data: 60 * DAY,
    operational:   60 * DAY,
    low:           90 * DAY,
  },
  verified: {
    catastrophic:   7 * DAY,
    major:         14 * DAY,
    personal_data: 14 * DAY,
    operational:   14 * DAY,
    low:           21 * DAY,
  },
  escalated: {
    catastrophic:  30 * DAY,
    major:         60 * DAY,
    personal_data: 60 * DAY,
    operational:   90 * DAY,
    low:           90 * DAY,
  },
  closed:      { catastrophic: 0, major: 0, personal_data: 0, operational: 0, low: 0 },
  false_alarm: { catastrophic: 0, major: 0, personal_data: 0, operational: 0, low: 0 },
};

export function slaDeadlineFor(status: CyberStatus, tier: CyberTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

const REPORTABLE_TIERS = new Set<CyberTier>(['catastrophic', 'major', 'personal_data']);

export function isReportable(tier: CyberTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

export function crossesIntoRegulator(action: CyberAction, tier: CyberTier): boolean {
  if (!REPORTABLE_TIERS.has(tier)) return false;
  return (
    action === 'notify_regulator' ||
    action === 'escalate' ||
    action === 'close' ||
    action === 'close_escalated'
  );
}

export function slaBreachCrossesIntoRegulator(tier: CyberTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}
