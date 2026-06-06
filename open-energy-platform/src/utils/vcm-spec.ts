// ═══════════════════════════════════════════════════════════════════════════════
// W226 — VCM Project Development Specification
// Gold Standard GS4GG v3.1 + Verra VCS v4.5 + Article 6.4 ITMO
// ═══════════════════════════════════════════════════════════════════════════════

export type VcmProjectStatus =
  | 'conception'
  | 'pdd_draft'
  | 'pdd_ai_generated'
  | 'stakeholder_consultation'
  | 'preliminary_review'
  | 'validation_submitted'
  | 'validation_complete'
  | 'registration'
  | 'implementation'
  | 'monitoring'
  | 'verification_submitted'
  | 'credits_issued'
  | 'active'
  | 'cancelled';

export type VcmProjectAction =
  | 'start_pdd'
  | 'generate_ai_sections'
  | 'complete_pdd'
  | 'open_stakeholder_consultation'
  | 'submit_preliminary_review'
  | 'submit_to_vvb'
  | 'complete_validation'
  | 'register_project'
  | 'commence_implementation'
  | 'open_monitoring_period'
  | 'submit_monitoring_report'
  | 'complete_verification'
  | 'issue_credits'
  | 'cancel'
  | 'sla_breach';

export type VcmTier =
  | 'micro'    // <1,000 tCO2e/yr
  | 'small'    // 1,000–10,000 tCO2e/yr
  | 'large'    // 10,000–100,000 tCO2e/yr
  | 'mega';    // >100,000 tCO2e/yr

// INVERTED SLA — larger project = more verification time
export function deriveVcmSla(tier: VcmTier): number {
  const DAYS: Record<VcmTier, number> = {
    micro: 90, small: 150, large: 270, mega: 365,
  };
  return DAYS[tier] ?? 180;
}

export const VCM_HARD_TERMINALS = new Set<VcmProjectStatus>([
  'credits_issued', 'cancelled',
]);

export const VCM_VALID_TRANSITIONS: Record<VcmProjectStatus, VcmProjectAction[]> = {
  conception:               ['start_pdd', 'cancel', 'sla_breach'],
  pdd_draft:                ['generate_ai_sections', 'complete_pdd', 'cancel', 'sla_breach'],
  pdd_ai_generated:         ['complete_pdd', 'cancel', 'sla_breach'],
  stakeholder_consultation: ['submit_preliminary_review', 'cancel', 'sla_breach'],
  preliminary_review:       ['submit_to_vvb', 'cancel', 'sla_breach'],
  validation_submitted:     ['complete_validation', 'cancel', 'sla_breach'],
  validation_complete:      ['register_project', 'cancel', 'sla_breach'],
  registration:             ['commence_implementation', 'cancel', 'sla_breach'],
  implementation:           ['open_monitoring_period', 'cancel', 'sla_breach'],
  monitoring:               ['submit_monitoring_report', 'cancel', 'sla_breach'],
  verification_submitted:   ['complete_verification', 'cancel', 'sla_breach'],
  credits_issued:           [],
  active:                   ['open_monitoring_period', 'sla_breach'],
  cancelled:                [],
};

export const VCM_STATE_TRANSITIONS: Record<VcmProjectAction, VcmProjectStatus> = {
  start_pdd:                    'pdd_draft',
  generate_ai_sections:         'pdd_ai_generated',
  complete_pdd:                 'stakeholder_consultation',
  open_stakeholder_consultation:'stakeholder_consultation',
  submit_preliminary_review:    'preliminary_review',
  submit_to_vvb:                'validation_submitted',
  complete_validation:          'validation_complete',
  register_project:             'registration',
  commence_implementation:      'implementation',
  open_monitoring_period:       'monitoring',
  submit_monitoring_report:     'verification_submitted',
  complete_verification:        'credits_issued',
  issue_credits:                'active',
  cancel:                       'cancelled',
  sla_breach:                   'cancelled',
};

export function vcmCrossesIntoRegulator(
  action: VcmProjectAction,
  tier: VcmTier,
): boolean {
  if (action === 'cancel') return true;
  if (action === 'register_project' || action === 'issue_credits') {
    return tier === 'large' || tier === 'mega';
  }
  if (action === 'complete_verification') return tier === 'mega';
  return false;
}

export function vcmSlaBreachCrossesIntoRegulator(tier: VcmTier): boolean {
  return tier === 'large' || tier === 'mega';
}
