// ─────────────────────────────────────────────────────────────────────────
// Wave 132 - IPP Issues Log & Resolution Chain.
//
// PHASE E WAVE 2 OF N - IPP-PM profile-completeness wave.
//
// PMBOK 7 Issue Register + Primavera P6 issue lifecycle. The day-to-day
// PM issue tracking chain that cross-links to RFIs (W116), Change Orders
// (W117), Stage Gates (W131), HSE incidents (W25), and the W118 audit
// spine. Covers the full resolution lifecycle from raise to archive.
//
// Standards:
//   - PMBOK 7 / PMI Practice Guide "Manage Issues" knowledge area
//   - ISO 21500:2021 project management issue management
//   - OHSA s24 (safety issues → regulator EVERY tier)
//   - ERA s35 / NERSA Grid Code (regulatory issues → regulator crossing)
//   - REIPPPP Schedule 4 project issue reporting requirements
//   - Equator Principles IV issue management (EP4 Condition 3)
//
// Beats: Procore Observations, Oracle Primavera Unifier Issue Tracking,
// Autodesk Construction Cloud RFIs-as-issues, InEight Issue Manager,
// PlanGrid Punch List / Observations, e-Builder Issue Tracking.
//
// 12-state forward path + 4 branch states (= 16 chain states):
//   raised -> triaged -> assigned -> acknowledged -> in_progress ->
//     blocked -> under_review -> resolved -> verified ->
//     evidence_filed -> closed -> archived (HARD)
//   any non-terminal -> escalate_to_regulator -> escalated (SOFT w/ crossing)
//   any non-terminal -> defer_issue -> deferred (SOFT, loops to triaged)
//   any non-terminal -> cancel_issue -> cancelled (HARD)
//   cron -> flag_overdue -> overdue_flagged (SOFT, status unchanged)
//
// URGENT SLA polarity (HOURS) — higher priority = TIGHTER:
//   p1_critical     24h
//   p2_high         72h
//   p3_medium       168h
//   p4_low          336h
//   p5_informational 720h
//
// SIGNATURE W132 regulator crossings:
//   escalate_to_regulator EVERY tier when category = 'safety' OR 'regulatory'
//     (W132 SIGNATURE — OHSA s24 + ERA s35 notifiable event always reportable)
//   close EVERY tier when is_nersa_notifiable (NERSA Section 10 closure record)
//   sla_breach p1_critical + p2_high (safety/regulatory P2 near-miss SLA)
//
// 3-step authority: project_coordinator -> project_manager -> project_director
//   (leaner than W131's 4-step; issues are operational not governance)
//
// Write {admin, ipp_developer}. READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_issue -> 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────

export type IssueStatus =
  | 'raised'
  | 'triaged'
  | 'assigned'
  | 'acknowledged'
  | 'in_progress'
  | 'blocked'
  | 'under_review'
  | 'resolved'
  | 'verified'
  | 'evidence_filed'
  | 'closed'
  | 'archived'
  | 'escalated'
  | 'deferred'
  | 'cancelled'
  | 'overdue_flagged';

export type IssueAction =
  | 'raise_issue'
  | 'triage_issue'
  | 'assign_issue'
  | 'acknowledge_issue'
  | 'start_progress'
  | 'flag_blocked'
  | 'unblock_issue'
  | 'submit_for_review'
  | 'resolve_issue'
  | 'verify_resolution'
  | 'file_evidence'
  | 'close_issue'
  | 'archive_issue'
  | 'escalate_to_regulator'
  | 'defer_issue'
  | 'cancel_issue'
  | 'flag_overdue';

export type IssuePriority =
  | 'p1_critical'
  | 'p2_high'
  | 'p3_medium'
  | 'p4_low'
  | 'p5_informational';

export type IssueCategory =
  | 'safety'
  | 'regulatory'
  | 'technical'
  | 'commercial'
  | 'environmental'
  | 'stakeholder'
  | 'legal'
  | 'financial'
  | 'general';

export type IssueParty = 'project_coordinator' | 'project_manager' | 'project_director';

export type IssueEvent =
  | 'ipp_issue.raised'
  | 'ipp_issue.triaged'
  | 'ipp_issue.assigned'
  | 'ipp_issue.acknowledged'
  | 'ipp_issue.in_progress'
  | 'ipp_issue.blocked'
  | 'ipp_issue.unblocked'
  | 'ipp_issue.under_review'
  | 'ipp_issue.resolved'
  | 'ipp_issue.verified'
  | 'ipp_issue.evidence_filed'
  | 'ipp_issue.closed'
  | 'ipp_issue.archived'
  | 'ipp_issue.escalated'
  | 'ipp_issue.deferred'
  | 'ipp_issue.cancelled'
  | 'ipp_issue.sla_breached';

// ─── SLA hours (URGENT polarity: P1=24h tightest) ────────────────────────

export const SLA_HOURS: Record<IssuePriority, number> = {
  p1_critical:      24,
  p2_high:          72,
  p3_medium:        168,
  p4_low:           336,
  p5_informational: 720,
};

export function slaHoursFor(priority: IssuePriority): number {
  return SLA_HOURS[priority] ?? 168;
}

export function slaDeadlineFor(priority: IssuePriority, from: Date): Date {
  const d = new Date(from);
  d.setTime(d.getTime() + slaHoursFor(priority) * 3600 * 1000);
  return d;
}

export function slaHoursRemaining(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return Math.round(ms / 3600000);
}

// ─── State machine ────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<IssueStatus>(['archived', 'cancelled']);
const ALL_NON_TERMINAL: IssueStatus[] = [
  'raised','triaged','assigned','acknowledged','in_progress','blocked',
  'under_review','resolved','verified','evidence_filed','closed',
  'escalated','deferred','overdue_flagged',
];

export const TRANSITIONS: Record<IssueAction, { from: IssueStatus[]; to: IssueStatus }> = {
  raise_issue:            { from: ['raised'], to: 'raised' },
  triage_issue:           { from: ['raised','deferred','overdue_flagged'], to: 'triaged' },
  assign_issue:           { from: ['triaged','escalated'], to: 'assigned' },
  acknowledge_issue:      { from: ['assigned'], to: 'acknowledged' },
  start_progress:         { from: ['acknowledged','blocked','deferred'], to: 'in_progress' },
  flag_blocked:           { from: ['in_progress','acknowledged'], to: 'blocked' },
  unblock_issue:          { from: ['blocked'], to: 'in_progress' },
  submit_for_review:      { from: ['in_progress'], to: 'under_review' },
  resolve_issue:          { from: ['under_review'], to: 'resolved' },
  verify_resolution:      { from: ['resolved'], to: 'verified' },
  file_evidence:          { from: ['verified'], to: 'evidence_filed' },
  close_issue:            { from: ['evidence_filed'], to: 'closed' },
  archive_issue:          { from: ['closed'], to: 'archived' },
  escalate_to_regulator:  { from: ALL_NON_TERMINAL, to: 'escalated' },
  defer_issue:            { from: ['raised','triaged','assigned','acknowledged','in_progress','blocked'], to: 'deferred' },
  cancel_issue:           { from: ALL_NON_TERMINAL, to: 'cancelled' },
  flag_overdue:           { from: ALL_NON_TERMINAL, to: 'overdue_flagged' },
};

export function isHardTerminal(status: IssueStatus): boolean {
  return HARD_TERMINALS.has(status);
}

export function isTerminal(status: IssueStatus): boolean {
  return status === 'archived' || status === 'cancelled';
}

export function nextStatus(current: IssueStatus, action: IssueAction): IssueStatus | null {
  if (isHardTerminal(current)) return null;
  if (action === 'raise_issue' && current !== 'raised') return null;
  if (action === 'flag_overdue') return current; // cron-only: status unchanged
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

// ─── Regulator crossings (SIGNATURE + secondary) ─────────────────────────

export interface IssueCrossArgs {
  category?: string | null;
  is_safety?: number | boolean | null;
  is_regulatory?: number | boolean | null;
  is_nersa_notifiable?: number | boolean | null;
  priority?: IssuePriority | null;
}

export function crossesIntoRegulator(action: IssueAction, args: IssueCrossArgs): boolean {
  const safety = !!(args.is_safety || args.category === 'safety');
  const regulatory = !!(args.is_regulatory || args.category === 'regulatory');
  const nersa = !!(args.is_nersa_notifiable);

  // W132 SIGNATURE: escalate_to_regulator EVERY tier when safety OR regulatory
  if (action === 'escalate_to_regulator' && (safety || regulatory)) return true;

  // close EVERY tier when nersa_notifiable (Section 10 closure record)
  if (action === 'close_issue' && nersa) return true;

  return false;
}

export function slaBreachCrossesIntoRegulator(priority: IssuePriority, args: IssueCrossArgs): boolean {
  const safety = !!(args.is_safety || args.category === 'safety');
  const regulatory = !!(args.is_regulatory || args.category === 'regulatory');
  // P1 safety/regulatory and P2 safety/regulatory breaches are regulator crossings
  if (priority === 'p1_critical' && (safety || regulatory)) return true;
  if (priority === 'p2_high' && (safety || regulatory)) return true;
  return false;
}

export function isReportable(action: IssueAction, args: IssueCrossArgs): boolean {
  return crossesIntoRegulator(action, args);
}

// ─── Party / authority ────────────────────────────────────────────────────

export function partyForAction(action: IssueAction): IssueParty {
  switch (action) {
    case 'raise_issue':
    case 'acknowledge_issue':
    case 'start_progress':
    case 'flag_blocked':
    case 'unblock_issue':
    case 'submit_for_review':
      return 'project_coordinator';
    case 'triage_issue':
    case 'assign_issue':
    case 'resolve_issue':
    case 'verify_resolution':
    case 'defer_issue':
    case 'cancel_issue':
      return 'project_manager';
    case 'file_evidence':
    case 'close_issue':
    case 'archive_issue':
    case 'escalate_to_regulator':
      return 'project_director';
    default:
      return 'project_manager';
  }
}

// ─── Event type mapping ───────────────────────────────────────────────────

export function eventTypeFor(action: IssueAction): IssueEvent {
  const map: Record<IssueAction, IssueEvent> = {
    raise_issue:           'ipp_issue.raised',
    triage_issue:          'ipp_issue.triaged',
    assign_issue:          'ipp_issue.assigned',
    acknowledge_issue:     'ipp_issue.acknowledged',
    start_progress:        'ipp_issue.in_progress',
    flag_blocked:          'ipp_issue.blocked',
    unblock_issue:         'ipp_issue.unblocked',
    submit_for_review:     'ipp_issue.under_review',
    resolve_issue:         'ipp_issue.resolved',
    verify_resolution:     'ipp_issue.verified',
    file_evidence:         'ipp_issue.evidence_filed',
    close_issue:           'ipp_issue.closed',
    archive_issue:         'ipp_issue.archived',
    escalate_to_regulator: 'ipp_issue.escalated',
    defer_issue:           'ipp_issue.deferred',
    cancel_issue:          'ipp_issue.cancelled',
    flag_overdue:          'ipp_issue.sla_breached',
  };
  return map[action];
}

// ─── Status timestamp column mapping ─────────────────────────────────────

export function statusTsCol(status: IssueStatus): string {
  const map: Record<IssueStatus, string> = {
    raised:         'raised_at',
    triaged:        'triaged_at',
    assigned:       'assigned_at',
    acknowledged:   'acknowledged_at',
    in_progress:    'in_progress_at',
    blocked:        'blocked_at',
    under_review:   'under_review_at',
    resolved:       'resolved_at',
    verified:       'verified_at',
    evidence_filed: 'evidence_filed_at',
    closed:         'closed_at',
    archived:       'archived_at',
    escalated:      'escalated_at',
    deferred:       'deferred_at',
    cancelled:      'cancelled_at',
    overdue_flagged:'overdue_flagged_at',
  };
  return map[status] ?? 'updated_at';
}

// ─── Helpers ─────────────────────────────────────────────────────────────

export function urgencyBand(priority: IssuePriority): string {
  switch (priority) {
    case 'p1_critical':      return 'critical';
    case 'p2_high':          return 'high';
    case 'p3_medium':        return 'medium';
    case 'p4_low':           return 'low';
    case 'p5_informational': return 'informational';
  }
}

export function timeInStateHours(stateAt: string | null, now: Date): number | null {
  if (!stateAt) return null;
  return Math.round((now.getTime() - new Date(stateAt).getTime()) / 3600000);
}

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  safety:       'Safety',
  regulatory:   'Regulatory',
  technical:    'Technical',
  commercial:   'Commercial',
  environmental:'Environmental',
  stakeholder:  'Stakeholder',
  legal:        'Legal',
  financial:    'Financial',
  general:      'General',
};

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  p1_critical:      'P1 Critical',
  p2_high:          'P2 High',
  p3_medium:        'P3 Medium',
  p4_low:           'P4 Low',
  p5_informational: 'P5 Info',
};

export const PRIORITY_SLA_LABEL: Record<IssuePriority, string> = {
  p1_critical:      '24h',
  p2_high:          '72h',
  p3_medium:        '7d',
  p4_low:           '14d',
  p5_informational: '30d',
};
