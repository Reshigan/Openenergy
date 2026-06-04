// ═══════════════════════════════════════════════════════════════════════════
// Wave 175 — IPP REIPPPP Milestone Certification
//
// REIPPPP Power Purchase Agreements and associated Finance Documents require
// formal milestone certifications at key project lifecycle events. The IPP
// must assemble documentation, obtain Independent Engineer sign-off, and
// submit to the DMRE IPP Office for official milestone certification. Failure
// to achieve certified milestones within PPA deadlines triggers liquidated
// damages, tariff step-downs, or termination events.
//
// Milestone types: financial_close, construction_start, test_cod, cod,
// grid_connection, commissioning_complete, performance_test_complete
//
// Mounted at /api/ipp-milestone-certs.
//
// INVERTED SLA: larger projects (higher MW capacity) face greater documentation
// complexity and regulatory scrutiny, warranting longer review windows.
// Strategic (>500MW) projects have the most complex IE/DMRE verification
// requirements and receive the longest SLA.
//
// 12-state chain:
//   milestone_triggered → documentation_preparation → ie_pre_review
//   → documentation_submitted → ipp_office_acknowledgment
//   → technical_verification → clarification_requested
//   → clarification_submitted → final_review
//   → milestone_certified (terminal)
//   → milestone_rejected (terminal)
//   → milestone_lapsed (terminal)
//
// Signature reportability:
//   reject_milestone  → ALL tiers (certification failure at any project scale
//                        triggers PPA default and lender notification)
//   certify_milestone → utility + strategic (major project COD/FC milestones
//                        go to NERSA/DMRE national energy register)
// ═══════════════════════════════════════════════════════════════════════════

export type McStatus =
  | 'milestone_triggered'
  | 'documentation_preparation'
  | 'ie_pre_review'
  | 'documentation_submitted'
  | 'ipp_office_acknowledgment'
  | 'technical_verification'
  | 'clarification_requested'
  | 'clarification_submitted'
  | 'final_review'
  | 'milestone_certified'   // TERMINAL
  | 'milestone_rejected'    // TERMINAL
  | 'milestone_lapsed';     // TERMINAL

export type McAction =
  | 'commence_documentation'
  | 'submit_for_ie_review'
  | 'submit_to_ipp_office'
  | 'acknowledge_receipt'
  | 'commence_technical_verification'
  | 'request_clarification'
  | 'submit_clarification'
  | 'commence_final_review'
  | 'certify_milestone'
  | 'reject_milestone'
  | 'lapse_milestone';

// INVERTED SLA — project capacity tier
export type McProjectTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

export type McMilestoneType =
  | 'financial_close'
  | 'construction_start'
  | 'test_cod'
  | 'cod'
  | 'grid_connection'
  | 'commissioning_complete'
  | 'performance_test_complete';

export type McEnergyType =
  | 'solar_pv'
  | 'wind_onshore'
  | 'wind_offshore'
  | 'biomass'
  | 'small_hydro'
  | 'csp'
  | 'battery_storage';

// ─── Tier derivation (keyed on project_mw capacity) ─────────────────────────

export function deriveMcProjectTier(project_mw: number): McProjectTier {
  if (project_mw < 50)   return 'small';
  if (project_mw < 100)  return 'medium';
  if (project_mw < 200)  return 'large';
  if (project_mw < 500)  return 'utility';
  return 'strategic';
}

// ─── INVERTED SLA (larger project → more documentation complexity → more time)

export const SLA_DAYS: Record<McProjectTier, number> = {
  small:     30,
  medium:    45,
  large:     60,
  utility:   90,
  strategic: 120,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<McStatus>([
  'milestone_certified',
  'milestone_rejected',
  'milestone_lapsed',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<McAction, { from: McStatus[] }> = {
  commence_documentation:           { from: ['milestone_triggered'] },
  submit_for_ie_review:             { from: ['documentation_preparation'] },
  submit_to_ipp_office:             { from: ['ie_pre_review'] },
  acknowledge_receipt:              { from: ['documentation_submitted'] },
  commence_technical_verification:  { from: ['ipp_office_acknowledgment'] },
  request_clarification:            { from: ['technical_verification'] },
  submit_clarification:             { from: ['clarification_requested'] },
  commence_final_review:            { from: ['technical_verification', 'clarification_submitted'] },
  certify_milestone:                { from: ['final_review'] },
  reject_milestone:                 { from: ['final_review'] },
  lapse_milestone:                  {
    from: [
      'milestone_triggered', 'documentation_preparation', 'ie_pre_review',
      'documentation_submitted', 'ipp_office_acknowledgment',
      'technical_verification', 'clarification_requested',
      'clarification_submitted', 'final_review',
    ],
  },
};

// ─── State machine ───────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<McAction, McStatus> = {
  commence_documentation:          'documentation_preparation',
  submit_for_ie_review:            'ie_pre_review',
  submit_to_ipp_office:            'documentation_submitted',
  acknowledge_receipt:             'ipp_office_acknowledgment',
  commence_technical_verification: 'technical_verification',
  request_clarification:           'clarification_requested',
  submit_clarification:            'clarification_submitted',
  commence_final_review:           'final_review',
  certify_milestone:               'milestone_certified',
  reject_milestone:                'milestone_rejected',
  lapse_milestone:                 'milestone_lapsed',
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: McProjectTier[] = ['small', 'medium', 'large', 'utility', 'strategic'];
const UTILITY_PLUS: McProjectTier[] = ['utility', 'strategic'];

export function crossesIntoRegulator(
  action: McAction,
  tier: McProjectTier,
): boolean {
  switch (action) {
    case 'reject_milestone':    return ALL_TIERS.includes(tier);
    case 'lapse_milestone':     return UTILITY_PLUS.includes(tier);
    case 'certify_milestone':   return UTILITY_PLUS.includes(tier);
    default:                    return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: McProjectTier): boolean {
  return UTILITY_PLUS.includes(tier);
}
