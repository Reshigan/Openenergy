// ═══════════════════════════════════════════════════════════════════════════════
// W217 — Support SLA Performance Report & Root Cause Analysis
// ITIL 4 Service Level Management + ISO 20000-1 + NCC SIEM reporting
// ═══════════════════════════════════════════════════════════════════════════════

export type SprStatus =
  | 'data_collection'     // gathering metrics from incidents/changes/problems
  | 'metrics_calculated'  // SLA adherence calculated
  | 'rca_in_progress'     // root cause analysis for misses underway
  | 'rca_complete'        // RCA findings documented
  | 'management_review'   // reviewed by service manager / head
  | 'approved'            // signed off; terminal +
  | 'disputed'            // business disputes SLA measurements; terminal
  | 'remediation_plan'    // material miss; remediation plan required; terminal
  | 'withdrawn';          // period closed without report; terminal

export type SprAction =
  | 'calculate_metrics'
  | 'initiate_rca'
  | 'complete_rca'
  | 'submit_for_review'
  | 'approve'
  | 'dispute'
  | 'escalate_remediation'
  | 'withdraw'
  | 'sla_breach';

export type SprTier =
  | 'standard'      // standard service level — monthly report
  | 'enhanced'      // enhanced SLA — bi-weekly triggers; board visibility
  | 'critical'      // mission-critical; weekly cadence
  | 'enterprise';   // enterprise-grade; real-time dashboard + weekly deep-dive

// INVERTED SLA: higher service tier = more time for thorough analysis
export function deriveSprSla(tier: SprTier): number {
  const DAYS: Record<SprTier, number> = {
    standard:   14,
    enhanced:   21,
    critical:   30,
    enterprise: 45,
  };
  return DAYS[tier] ?? 14;
}

export const SPR_HARD_TERMINALS = new Set<SprStatus>([
  'approved', 'disputed', 'remediation_plan', 'withdrawn',
]);

export const SPR_VALID_TRANSITIONS: Record<SprStatus, SprAction[]> = {
  data_collection:   ['calculate_metrics', 'withdraw', 'sla_breach'],
  metrics_calculated:['initiate_rca', 'submit_for_review', 'sla_breach'],
  rca_in_progress:   ['complete_rca', 'sla_breach'],
  rca_complete:      ['submit_for_review', 'sla_breach'],
  management_review: ['approve', 'dispute', 'escalate_remediation', 'sla_breach'],
  approved:          [],
  disputed:          [],
  remediation_plan:  [],
  withdrawn:         [],
};

export const SPR_STATE_TRANSITIONS: Record<SprAction, SprStatus> = {
  calculate_metrics:    'metrics_calculated',
  initiate_rca:         'rca_in_progress',
  complete_rca:         'rca_complete',
  submit_for_review:    'management_review',
  approve:              'approved',
  dispute:              'disputed',
  escalate_remediation: 'remediation_plan',
  withdraw:             'withdrawn',
  sla_breach:           'data_collection',
};

// Regulator crossings
export function sprCrossesIntoRegulator(action: SprAction, tier: SprTier): boolean {
  // Material miss remediation plans cross for critical/enterprise
  if (action === 'escalate_remediation') return tier === 'critical' || tier === 'enterprise';
  // Dispute at enterprise tier is reportable
  if (action === 'dispute') return tier === 'enterprise';
  return false;
}

export function sprSlaBreachCrossesIntoRegulator(tier: SprTier): boolean {
  return tier === 'critical' || tier === 'enterprise';
}
