// ─────────────────────────────────────────────────────────────────────────
// Wave 137 - IPP Method Statement (SWMS) Management.
//
// PHASE E WAVE 7 OF N — IPP-PM profile-completeness wave.
//
// OHSA (SA) Construction Regulations 2014 Reg.7 + Equator Principles EP4
// + REIPPPP site safety requirements.
//
// Companion planning document to the Permit-to-Work (W64), which is the
// AUTHORIZATION document. Method Statement = PLANNING document for how
// hazardous work will be performed.
//
// Beats Procore Safety (static PDF workflow) by giving Method Statements
// a full P6 lifecycle chain with risk-tier SLA.
//
// 12-state lifecycle:
//   drafted → reviewed → risk_assessed → approved → toolbox_briefed →
//   active → work_completed → closed (8-step forward, HARD terminal)
//   closed → archived (optional archival)
//   reviewed/risk_assessed → rejected (HARD terminal)
//   approved/active → superseded (HARD terminal — replaced by revised MS)
//   active → suspended ↔ active (work stoppage loop)
//
// URGENT SLA polarity (HOURS) — high-risk work must be approved FASTEST:
//   high_risk:   24h  (URGENT — tightest, life safety)
//   medium_risk: 72h
//   low_risk:   168h
//   routine:    336h  (loosest)
//
// W137 SIGNATURE crossings:
//   approve_ms → EVERY tier when is_critical_lift OR is_confined_space
//                OR is_live_electrical (hazardous work planning always reportable)
//   suspend_work → EVERY tier when floor_regulatory_notification
//   SLA breach crosses when high_risk AND (is_critical_lift OR is_confined_space
//                OR is_live_electrical)
//
// Write {admin, ipp_developer, support} (support = site supervisors).
// READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_method_statement → 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────

export type MsStatus =
  | 'drafted'
  | 'reviewed'
  | 'risk_assessed'
  | 'approved'
  | 'toolbox_briefed'
  | 'active'
  | 'work_completed'
  | 'closed'
  | 'rejected'
  | 'superseded'
  | 'suspended'
  | 'archived';

export type MsAction =
  | 'submit_for_review'        // drafted → reviewed
  | 'complete_risk_assessment' // reviewed → risk_assessed
  | 'approve_ms'               // risk_assessed → approved (SIGNATURE: critical_lift/confined_space/live_electrical)
  | 'conduct_toolbox_talk'     // approved → toolbox_briefed
  | 'commence_work'            // toolbox_briefed → active
  | 'complete_work'            // active → work_completed
  | 'close_ms'                 // work_completed → closed
  | 'archive_ms'               // closed → archived
  | 'reject_ms'                // reviewed/risk_assessed → rejected
  | 'supersede_ms'             // approved/active → superseded (replaced by revised version)
  | 'suspend_work'             // active → suspended
  | 'resume_work'              // suspended → active
  | 'flag_overdue';            // cron sweep only

export type RiskTier = 'high_risk' | 'medium_risk' | 'low_risk' | 'routine';

// URGENT SLA — high-risk work must be approved fastest (tightest window)
export const SLA_HOURS: Record<RiskTier, number> = {
  high_risk:   24,   // URGENT — tightest (life safety)
  medium_risk: 72,   // 3 days
  low_risk:   168,   // 7 days
  routine:    336,   // 14 days (loosest)
};

// 'closed' allows one further optional step (closed → archived).
// The true HARD terminals are: rejected, superseded, archived, and
// 'closed' ONLY in the sense that no work transitions can originate
// from it — but archive_ms IS allowed. So we keep closed out of
// HARD_TERMINALS; the route handler tracks it via TRANSITIONS guard.
// Actually, 'closed' blocks re-opening (no submit_for_review etc.) so
// effectively it is hard EXCEPT for archive_ms. We handle this by
// NOT including 'closed' in HARD_TERMINALS and letting TRANSITIONS do
// the work — archive_ms.from = ['closed'] means only archive_ms is
// allowed from closed.
export const HARD_TERMINALS: MsStatus[] = ['rejected', 'superseded', 'archived'];

export function isHardTerminal(status: MsStatus): boolean {
  return HARD_TERMINALS.includes(status);
}

export const TRANSITIONS: Record<MsAction, { from: MsStatus[]; to: MsStatus }> = {
  submit_for_review:        { from: ['drafted'],                    to: 'reviewed' },
  complete_risk_assessment: { from: ['reviewed'],                   to: 'risk_assessed' },
  approve_ms:               { from: ['risk_assessed'],              to: 'approved' },
  conduct_toolbox_talk:     { from: ['approved'],                   to: 'toolbox_briefed' },
  commence_work:            { from: ['toolbox_briefed'],            to: 'active' },
  complete_work:            { from: ['active'],                     to: 'work_completed' },
  close_ms:                 { from: ['work_completed'],             to: 'closed' },
  archive_ms:               { from: ['closed'],                     to: 'archived' },
  reject_ms:                { from: ['reviewed', 'risk_assessed'],  to: 'rejected' },
  supersede_ms:             { from: ['approved', 'active'],         to: 'superseded' },
  suspend_work:             { from: ['active'],                     to: 'suspended' },
  resume_work:              { from: ['suspended'],                  to: 'active' },
  // flag_overdue is cron-only — does not change status, placeholder keeps action consistent
  flag_overdue: {
    from: [
      'drafted', 'reviewed', 'risk_assessed', 'approved',
      'toolbox_briefed', 'active', 'work_completed',
    ],
    to: 'drafted', // placeholder — nextStatus handles cron by returning current
  },
};

export function nextStatus(current: MsStatus, action: MsAction): MsStatus | null {
  if (isHardTerminal(current)) return null;
  if (action === 'flag_overdue') return current; // cron-only: status unchanged
  const t = TRANSITIONS[action];
  if (!t || !t.from.includes(current)) return null;
  return t.to;
}

// W137 SIGNATURE crossings:
// - approve_ms → EVERY tier when is_critical_lift OR is_confined_space OR is_live_electrical
//   (hazardous work planning is always reportable to DOL/OHSA when these flags are set)
// - suspend_work → EVERY tier when floor_regulatory_notification
//   (unexpected work stoppage with regulatory notification flag always crosses)
export function crossesIntoRegulator(
  action: MsAction,
  args: {
    is_critical_lift?: boolean | number;
    is_confined_space?: boolean | number;
    is_live_electrical?: boolean | number;
    floor_regulatory_notification?: boolean | number;
  },
): boolean {
  if (action === 'approve_ms' && (args.is_critical_lift || args.is_confined_space || args.is_live_electrical)) return true;
  if (action === 'suspend_work' && args.floor_regulatory_notification) return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(
  tier: RiskTier,
  args: {
    is_critical_lift?: boolean | number;
    is_confined_space?: boolean | number;
    is_live_electrical?: boolean | number;
  },
): boolean {
  if (tier === 'high_risk' && (args.is_critical_lift || args.is_confined_space || args.is_live_electrical)) return true;
  return false;
}

// ─── Status timestamp column mapping ────────────────────────────────────────

export function statusTsCol(status: MsStatus): string {
  return `${status}_at`;
}

// ─── Event type mapping ────────────────────────────────────────────────────

export function eventTypeFor(action: MsAction): string {
  return `ipp_method_statement.${action}`;
}

// ─── SLA helpers ──────────────────────────────────────────────────────────

export function slaDeadlineFor(tier: RiskTier, from: Date): Date {
  const d = new Date(from);
  d.setTime(d.getTime() + SLA_HOURS[tier] * 3600 * 1000);
  return d;
}

export function slaHoursRemaining(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return Math.round(ms / 3600000);
}

// ─── Label maps ───────────────────────────────────────────────────────────

export const RISK_TIER_LABELS: Record<RiskTier, string> = {
  high_risk:   'High risk',
  medium_risk: 'Medium risk',
  low_risk:    'Low risk',
  routine:     'Routine',
};

export const WORK_TYPE_LABELS: Record<string, string> = {
  civil:           'Civil',
  structural:      'Structural',
  electrical:      'Electrical',
  mechanical:      'Mechanical',
  instrumentation: 'Instrumentation',
  scaffolding:     'Scaffolding',
  demolition:      'Demolition',
  excavation:      'Excavation',
  commissioning:   'Commissioning',
  general:         'General',
};
