// ─────────────────────────────────────────────────────────────────────────
// Wave 136 - IPP Non-Conformance Report (NCR) Management.
//
// PHASE E WAVE 6 OF N — IPP-PM profile-completeness wave.
//
// ISO 9001:2015 §8.7 + Equator Principles IV QA + REIPPPP quality requirements.
//
// Beats:
//   Procore NCR module (shallow workflow, no P6 state machine)
//   Oracle Aconex Quality (generic workflow, no REIPPPP-specific disposition logic)
// by giving NCRs a formal 12-state P6 chain with:
//   - Severity-tiered URGENT SLA (safety_critical 24h tightest)
//   - 5 floor flags (IE notification / lender consent / NERSA reportable /
//     hold point / safety stop-work)
//   - W136 SIGNATURE: reject_escalate EVERY tier
//   - accept_as_is crosses when floor_ie_notification_required OR floor_nersa_reportable
//
// 12-state lifecycle:
//   raised → acknowledged → under_investigation → disposition_proposed →
//   disposition_reviewed → rework_in_progress → reinspection →
//   corrective_action_planned → closed (HARD terminal)
//   disposition_reviewed → accepted_as_is (HARD terminal, SIGNATURE)
//   disposition_reviewed → rejected_escalated (HARD terminal, SIGNATURE EVERY tier)
//   raised/acknowledged → voided (HARD terminal)
//
// URGENT SLA polarity (HOURS) — safety failures must be resolved FASTEST:
//   safety_critical: 24h  (URGENT — tightest, life safety)
//   structural:      48h  (load-bearing integrity)
//   functional:     120h  (5 days)
//   minor:          336h  (14 days)
//   cosmetic:       720h  (30 days — loosest)
//
// W136 SIGNATURE crossings:
//   reject_escalate → EVERY tier (IE rejection always reportable)
//   accept_as_is → crosses when floor_ie_notification_required OR floor_nersa_reportable
//   SLA breach crosses when floor_safety_stop_work (always)
//   SLA breach crosses when floor_hold_point_triggered AND (safety_critical | structural)
//
// Write {admin, ipp_developer, support} (support = site supervisors raising NCRs).
// READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_ncr → 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────

export type NcrStatus =
  | 'raised'
  | 'acknowledged'
  | 'under_investigation'
  | 'disposition_proposed'
  | 'disposition_reviewed'
  | 'rework_in_progress'
  | 'reinspection'
  | 'corrective_action_planned'
  | 'closed'
  | 'accepted_as_is'
  | 'rejected_escalated'
  | 'voided';

export type NcrAction =
  | 'acknowledge_ncr'          // raised → acknowledged
  | 'start_investigation'      // acknowledged → under_investigation
  | 'propose_disposition'      // under_investigation → disposition_proposed
  | 'review_disposition'       // disposition_proposed → disposition_reviewed
  | 'start_rework'             // disposition_reviewed → rework_in_progress (when disposition=rework/repair/replace)
  | 'submit_reinspection'      // rework_in_progress → reinspection
  | 'plan_corrective_action'   // reinspection → corrective_action_planned
  | 'close_ncr'                // corrective_action_planned → closed
  | 'accept_as_is'             // disposition_reviewed → accepted_as_is (SIGNATURE: floor_ie_notification_required OR floor_nersa_reportable)
  | 'reject_escalate'          // disposition_reviewed → rejected_escalated (SIGNATURE: EVERY tier)
  | 'void_ncr'                 // raised/acknowledged → voided
  | 'flag_overdue';            // cron sweep only

export type NcrSeverity = 'safety_critical' | 'structural' | 'functional' | 'minor' | 'cosmetic';

// URGENT SLA — safety failures must be resolved fastest (tightest window)
export const SLA_HOURS: Record<NcrSeverity, number> = {
  safety_critical: 24,   // URGENT — tightest (life safety)
  structural:      48,   // 2 days (load-bearing integrity)
  functional:     120,   // 5 days
  minor:          336,   // 14 days
  cosmetic:       720,   // 30 days (loosest)
};

export const HARD_TERMINALS: NcrStatus[] = ['closed', 'accepted_as_is', 'rejected_escalated', 'voided'];

export function isHardTerminal(status: NcrStatus): boolean {
  return HARD_TERMINALS.includes(status);
}

export const TRANSITIONS: Record<NcrAction, { from: NcrStatus[]; to: NcrStatus }> = {
  acknowledge_ncr:        { from: ['raised'], to: 'acknowledged' },
  start_investigation:    { from: ['acknowledged'], to: 'under_investigation' },
  propose_disposition:    { from: ['under_investigation'], to: 'disposition_proposed' },
  review_disposition:     { from: ['disposition_proposed'], to: 'disposition_reviewed' },
  start_rework:           { from: ['disposition_reviewed'], to: 'rework_in_progress' },
  submit_reinspection:    { from: ['rework_in_progress'], to: 'reinspection' },
  plan_corrective_action: { from: ['reinspection'], to: 'corrective_action_planned' },
  close_ncr:              { from: ['corrective_action_planned'], to: 'closed' },
  accept_as_is:           { from: ['disposition_reviewed'], to: 'accepted_as_is' },
  reject_escalate:        { from: ['disposition_reviewed'], to: 'rejected_escalated' },
  void_ncr:               { from: ['raised', 'acknowledged'], to: 'voided' },
  // flag_overdue is cron-only — does not change status, placeholder keeps action consistent
  flag_overdue: {
    from: [
      'raised', 'acknowledged', 'under_investigation', 'disposition_proposed',
      'disposition_reviewed', 'rework_in_progress', 'reinspection', 'corrective_action_planned',
    ],
    to: 'raised', // placeholder — nextStatus handles cron by returning current
  },
};

export function nextStatus(current: NcrStatus, action: NcrAction): NcrStatus | null {
  if (isHardTerminal(current)) return null;
  if (action === 'flag_overdue') return current; // cron-only: status unchanged
  const t = TRANSITIONS[action];
  if (!t || !t.from.includes(current)) return null;
  return t.to;
}

// W136 SIGNATURE crossings:
// - reject_escalate → EVERY tier (IE rejection is always reportable)
// - accept_as_is → crosses when floor_ie_notification_required OR floor_nersa_reportable
export function crossesIntoRegulator(
  action: NcrAction,
  args: {
    floor_ie_notification_required?: boolean | number;
    floor_nersa_reportable?: boolean | number;
    ncr_severity?: NcrSeverity;
  },
): boolean {
  if (action === 'reject_escalate') return true; // EVERY tier
  if (action === 'accept_as_is' && (args.floor_ie_notification_required || args.floor_nersa_reportable)) return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(
  severity: NcrSeverity,
  args: { floor_hold_point_triggered?: boolean | number; floor_safety_stop_work?: boolean | number },
): boolean {
  if (args.floor_safety_stop_work) return true; // safety stop-work always crosses
  if (args.floor_hold_point_triggered && (severity === 'safety_critical' || severity === 'structural')) return true;
  return false;
}

// ─── Status timestamp column mapping ────────────────────────────────────────

export function statusTsCol(status: NcrStatus): string {
  return `${status}_at`;
}

// ─── Event type mapping ────────────────────────────────────────────────────

export function eventTypeFor(action: NcrAction): string {
  return `ipp_ncr.${action}`;
}

// ─── SLA helpers ──────────────────────────────────────────────────────────

export function slaDeadlineFor(severity: NcrSeverity, from: Date): Date {
  const d = new Date(from);
  d.setTime(d.getTime() + SLA_HOURS[severity] * 3600 * 1000);
  return d;
}

export function slaHoursRemaining(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return Math.round(ms / 3600000);
}

// ─── Label maps ───────────────────────────────────────────────────────────

export const SEVERITY_LABELS: Record<NcrSeverity, string> = {
  safety_critical: 'Safety critical',
  structural:      'Structural',
  functional:      'Functional',
  minor:           'Minor',
  cosmetic:        'Cosmetic',
};

export const NCR_CATEGORY_LABELS: Record<string, string> = {
  workmanship:    'Workmanship',
  materials:      'Materials',
  design:         'Design',
  documentation:  'Documentation',
  safety:         'Safety',
  environmental:  'Environmental',
  commissioning:  'Commissioning',
  testing:        'Testing',
};

export const DISPOSITION_LABELS: Record<string, string> = {
  accept_as_is: 'Accept as-is (concession)',
  rework:       'Rework',
  repair:       'Repair',
  replace:      'Replace',
  scrap:        'Scrap',
};

export const DISCIPLINE_LABELS: Record<string, string> = {
  civil:            'Civil',
  structural:       'Structural',
  electrical:       'Electrical',
  mechanical:       'Mechanical',
  instrumentation:  'Instrumentation',
  hvac:             'HVAC',
  process:          'Process',
};

export const DETECTION_METHOD_LABELS: Record<string, string> = {
  inspection:  'Inspection',
  audit:       'Audit',
  testing:     'Testing',
  observation: 'Observation',
};

export const RCA_METHOD_LABELS: Record<string, string> = {
  five_whys: '5 Whys',
  fishbone:  'Fishbone diagram',
  fmea:      'FMEA',
  none:      'Not yet performed',
};
