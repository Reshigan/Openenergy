// ═══════════════════════════════════════════════════════════════════════════════
// W230 — REIPPPP Community Benefit Trust (CBT) & Socio-Economic Development
// (SED) Annual Compliance Reporting Specification
//
// Legal: REIPPPP RfP Schedule 2 (socio-economic development obligations),
// DMRE CBT/SED Reporting Guidelines, Trust Property Control Act 57/1988,
// BBBEE Act 53/2003 + Codes of Good Practice
// SLA: INVERTED — larger CBT disbursement = longer DMRE review window
// (micro=14d, small=21d, medium=30d, major=45d)
// ═══════════════════════════════════════════════════════════════════════════════

export type CbtStatus =
  | 'reporting_period_open'  // DMRE reporting window opened
  | 'data_collection'        // IPP gathering disbursement/SED data
  | 'report_drafted'         // draft complete; awaiting IPP sign-off
  | 'submitted'              // submitted to DMRE; SLA clock starts
  | 'under_review'           // DMRE initial review
  | 'queries_issued'         // DMRE issued information requests
  | 'response_submitted'     // IPP submitted responses to queries
  | 'approved'               // DMRE approved; terminal
  | 'non_compliant'          // DMRE found non-compliance
  | 'remediation_submitted'  // IPP submitted remediation plan
  | 'cancelled'              // report voided; terminal
  | 'escalated';             // escalated to DMRE enforcement / BBBEE Commission; terminal

export type CbtAction =
  | 'begin_data_collection'  // IPP opens data collection phase
  | 'submit_draft'           // IPP completes draft
  | 'submit_report'          // IPP formally submits to DMRE → SLA clock
  | 'commence_review'        // admin/regulator starts DMRE review
  | 'issue_queries'          // admin/regulator raises information requests
  | 'submit_responses'       // IPP responds to queries
  | 'approve_report'         // admin/regulator approves
  | 'issue_non_compliance'   // admin/regulator issues non-compliance finding
  | 'submit_remediation'     // IPP submits remediation plan
  | 'accept_remediation'     // admin/regulator accepts plan → back under_review
  | 'escalate'               // admin/regulator escalates to enforcement
  | 'cancel'                 // IPP voids report before submission
  | 'sla_breach';            // cron: SLA deadline exceeded → non_compliant

export type CbtTier = 'micro' | 'small' | 'medium' | 'major';

// Tier is derived from the annual CBT disbursement amount
export function deriveCbtTier(annual_cbt_disbursement_zar: number): CbtTier {
  const abs = Math.abs(annual_cbt_disbursement_zar);
  if (abs >= 50_000_000) return 'major';
  if (abs >= 5_000_000)  return 'medium';
  if (abs >= 500_000)    return 'small';
  return 'micro';
}

// INVERTED SLA: larger CBT = more DMRE scrutiny = longer window for determination
export function deriveCbtSlaWindowDays(tier: CbtTier): number {
  const DAYS: Record<CbtTier, number> = {
    micro: 14, small: 21, medium: 30, major: 45,
  };
  return DAYS[tier];
}

export function cbtSlaDeadlineFor(tier: CbtTier, fromIso: string): string {
  const days = deriveCbtSlaWindowDays(tier);
  const d = new Date(fromIso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const CBT_HARD_TERMINALS = new Set<CbtStatus>([
  'approved', 'cancelled', 'escalated',
]);

export const CBT_VALID_TRANSITIONS: Record<CbtStatus, CbtAction[]> = {
  reporting_period_open: ['begin_data_collection', 'cancel', 'sla_breach'],
  data_collection:       ['submit_draft', 'cancel', 'sla_breach'],
  report_drafted:        ['submit_report', 'cancel', 'sla_breach'],
  submitted:             ['commence_review', 'sla_breach'],
  under_review:          ['approve_report', 'issue_queries', 'issue_non_compliance', 'sla_breach'],
  queries_issued:        ['submit_responses', 'sla_breach'],
  response_submitted:    ['commence_review', 'sla_breach'],
  approved:              [],
  non_compliant:         ['submit_remediation', 'escalate', 'sla_breach'],
  remediation_submitted: ['accept_remediation', 'issue_non_compliance', 'escalate', 'sla_breach'],
  cancelled:             [],
  escalated:             [],
};

export const CBT_STATE_TRANSITIONS: Record<CbtAction, CbtStatus> = {
  begin_data_collection: 'data_collection',
  submit_draft:          'report_drafted',
  submit_report:         'submitted',
  commence_review:       'under_review',
  issue_queries:         'queries_issued',
  submit_responses:      'response_submitted',
  approve_report:        'approved',
  issue_non_compliance:  'non_compliant',
  submit_remediation:    'remediation_submitted',
  accept_remediation:    'under_review',
  escalate:              'escalated',
  cancel:                'cancelled',
  sla_breach:            'non_compliant',
};

// Admin-only: DMRE-side actions — the IPP cannot self-approve or issue findings
export const CBT_ADMIN_ONLY_ACTIONS = new Set<CbtAction>([
  'commence_review', 'issue_queries', 'approve_report',
  'issue_non_compliance', 'accept_remediation', 'escalate',
]);

export function crossesCbtIntoRegulator(action: CbtAction, tier: CbtTier): boolean {
  // Escalation to DMRE enforcement / BBBEE Commission is always reportable
  if (action === 'escalate') return true;
  // DMRE non-compliance findings are always reportable (compliance audit trail)
  if (action === 'issue_non_compliance') return true;
  // Major/medium CBT approvals are themselves reportable (transparency obligations)
  if (action === 'approve_report') return tier === 'medium' || tier === 'major';
  return false;
}

export function cbtSlaBreachCrossesIntoRegulator(tier: CbtTier): boolean {
  return tier === 'medium' || tier === 'major';
}

export type CbtEvent =
  | 'cbt_evt_opened'
  | 'cbt_evt_begin_data_collection'
  | 'cbt_evt_submit_draft'
  | 'cbt_evt_submit_report'
  | 'cbt_evt_commence_review'
  | 'cbt_evt_issue_queries'
  | 'cbt_evt_submit_responses'
  | 'cbt_evt_approve_report'
  | 'cbt_evt_issue_non_compliance'
  | 'cbt_evt_submit_remediation'
  | 'cbt_evt_accept_remediation'
  | 'cbt_evt_escalate'
  | 'cbt_evt_cancel'
  | 'cbt_evt_sla_breach';
