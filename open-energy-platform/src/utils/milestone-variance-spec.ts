// ═══════════════════════════════════════════════════════════════════════════════
// W207 — IPP Milestone & Schedule Variance Report
// REIPPPP Schedule of Compliance + NERSA Construction Permit + DBSA/DFI milestones
// ═══════════════════════════════════════════════════════════════════════════════

export type MvsStatus =
  | 'draft'               // report being compiled
  | 'ie_review'           // Independent Engineer reviewing
  | 'ie_certified'        // IE sign-off complete
  | 'dfi_submitted'       // submitted to DFI / lender panel
  | 'dfi_queries'         // DFI raised queries
  | 'dfi_queries_responded' // queries answered
  | 'dfi_accepted'        // DFI accepted report; terminal +
  | 'remediation_plan'    // variance exceeds threshold — remediation plan required
  | 'remediation_submitted' // remediation plan submitted
  | 'remediation_accepted' // DFI accepts remediation; terminal +
  | 'critical_delay'       // critical-path delay — regulator notification required; terminal flag
  | 'withdrawn';           // withdrawn; terminal

export type MvsAction =
  | 'submit_for_ie_review'
  | 'certify_ie'
  | 'submit_to_dfi'
  | 'dfi_raises_queries'
  | 'respond_to_dfi_queries'
  | 'dfi_accept'
  | 'flag_remediation_required'
  | 'submit_remediation_plan'
  | 'dfi_accept_remediation'
  | 'declare_critical_delay'
  | 'withdraw'
  | 'sla_breach';

export type MvsRiskTier = 'minor' | 'moderate' | 'significant' | 'critical';

// INVERTED SLA: more critical projects get more time (greater complexity + escalation)
export function deriveMvsSla(riskTier: MvsRiskTier): number {
  const DAYS: Record<MvsRiskTier, number> = {
    minor:        14,
    moderate:     21,
    significant:  30,
    critical:     45,
  };
  return DAYS[riskTier] ?? 21;
}

export const MVS_HARD_TERMINALS = new Set<MvsStatus>([
  'dfi_accepted', 'remediation_accepted', 'critical_delay', 'withdrawn',
]);

export const MVS_VALID_TRANSITIONS: Record<MvsStatus, MvsAction[]> = {
  draft:                   ['submit_for_ie_review', 'withdraw', 'sla_breach'],
  ie_review:               ['certify_ie', 'sla_breach'],
  ie_certified:            ['submit_to_dfi', 'sla_breach'],
  dfi_submitted:           ['dfi_raises_queries', 'dfi_accept', 'flag_remediation_required', 'sla_breach'],
  dfi_queries:             ['respond_to_dfi_queries', 'sla_breach'],
  dfi_queries_responded:   ['dfi_accept', 'flag_remediation_required', 'sla_breach'],
  remediation_plan:        ['submit_remediation_plan', 'declare_critical_delay', 'sla_breach'],
  remediation_submitted:   ['dfi_accept_remediation', 'declare_critical_delay', 'sla_breach'],
  dfi_accepted:            [],
  remediation_accepted:    [],
  critical_delay:          [],
  withdrawn:               [],
};

export const MVS_STATE_TRANSITIONS: Record<MvsAction, MvsStatus> = {
  submit_for_ie_review:     'ie_review',
  certify_ie:               'ie_certified',
  submit_to_dfi:            'dfi_submitted',
  dfi_raises_queries:       'dfi_queries',
  respond_to_dfi_queries:   'dfi_queries_responded',
  dfi_accept:               'dfi_accepted',
  flag_remediation_required: 'remediation_plan',
  submit_remediation_plan:  'remediation_submitted',
  dfi_accept_remediation:   'remediation_accepted',
  declare_critical_delay:   'critical_delay',
  withdraw:                 'withdrawn',
  sla_breach:               'draft',
};

// Regulator / DFI inbox crossings (NERSA + DBSA)
export function mvsCrossesIntoRegulator(action: MvsAction, riskTier: MvsRiskTier): boolean {
  // critical_delay always (all tiers — REIPPPP obligation)
  if (action === 'declare_critical_delay') return true;
  // flag_remediation_required → significant + critical only
  if (action === 'flag_remediation_required') {
    return riskTier === 'significant' || riskTier === 'critical';
  }
  // dfi_accept, dfi_accept_remediation → critical only
  if (['dfi_accept', 'dfi_accept_remediation'].includes(action)) {
    return riskTier === 'critical';
  }
  return false;
}

export function mvsSlaBreachCrossesIntoRegulator(riskTier: MvsRiskTier): boolean {
  return riskTier === 'significant' || riskTier === 'critical';
}
