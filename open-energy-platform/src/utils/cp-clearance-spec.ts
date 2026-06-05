// ═══════════════════════════════════════════════════════════════════════════════
// W223 — Lender Financial Close: Conditions Precedent (CP) Clearance
// LMA + SARB / IFC Performance Standards / Basel III project finance
// Related to: W53 (credit origination), W21 (drawdown), W30 (disbursement UoP)
// ═══════════════════════════════════════════════════════════════════════════════

export type CpStatus =
  | 'cp_register_draft'      // CP checklist drafted by lender legal
  | 'cp_register_submitted'  // CP register sent to borrower/advisors
  | 'cp_register_agreed'     // all parties signed off CP list
  | 'satisfying_cps'         // active CP satisfaction period
  | 'cps_submitted'          // evidence package submitted to lender
  | 'under_lender_review'    // lender legal/technical team reviewing
  | 'cps_satisfied'          // all CPs cleared — ready for drawdown
  | 'cps_partially_waived'   // some CPs waived under lender discretion
  | 'drawdown_authorized'    // financial close confirmed; terminal +
  | 'cp_defaulted'           // CP failed/cannot be satisfied; terminal
  | 'withdrawn'              // deal withdrawn before close; terminal
  | 'expired';               // closing deadline lapsed; terminal

export type CpAction =
  | 'submit_register'
  | 'agree_cp_list'
  | 'commence_satisfaction'
  | 'submit_evidence'
  | 'commence_review'
  | 'clear_cps'
  | 'waive_cps'
  | 'authorize_drawdown'
  | 'declare_cp_default'
  | 'withdraw'
  | 'expire'
  | 'sla_breach';

export type CpTier =
  | 'minor'      // <R50M; 7d
  | 'standard'   // R50M–R500M; 14d
  | 'major'      // R500M–R5B; 21d
  | 'systemic';  // >R5B; 30d — SARB large-exposure monitoring

// INVERTED SLA: larger facilities get more time for CP clearance due to complexity
export function deriveCpSla(tier: CpTier): number {
  const DAYS: Record<CpTier, number> = {
    minor:    7,
    standard: 14,
    major:    21,
    systemic: 30,
  };
  return DAYS[tier] ?? 14;
}

export const CP_HARD_TERMINALS = new Set<CpStatus>([
  'drawdown_authorized', 'cp_defaulted', 'withdrawn', 'expired',
]);

export const CP_VALID_TRANSITIONS: Record<CpStatus, CpAction[]> = {
  cp_register_draft:     ['submit_register', 'withdraw', 'sla_breach'],
  cp_register_submitted: ['agree_cp_list', 'withdraw', 'sla_breach'],
  cp_register_agreed:    ['commence_satisfaction', 'withdraw', 'sla_breach'],
  satisfying_cps:        ['submit_evidence', 'declare_cp_default', 'withdraw', 'expire', 'sla_breach'],
  cps_submitted:         ['commence_review', 'declare_cp_default', 'sla_breach'],
  under_lender_review:   ['clear_cps', 'waive_cps', 'declare_cp_default', 'sla_breach'],
  cps_satisfied:         ['authorize_drawdown', 'sla_breach'],
  cps_partially_waived:  ['authorize_drawdown', 'declare_cp_default', 'sla_breach'],
  drawdown_authorized:   [],
  cp_defaulted:          [],
  withdrawn:             [],
  expired:               [],
};

export const CP_STATE_TRANSITIONS: Record<CpAction, CpStatus> = {
  submit_register:      'cp_register_submitted',
  agree_cp_list:        'cp_register_agreed',
  commence_satisfaction: 'satisfying_cps',
  submit_evidence:      'cps_submitted',
  commence_review:      'under_lender_review',
  clear_cps:            'cps_satisfied',
  waive_cps:            'cps_partially_waived',
  authorize_drawdown:   'drawdown_authorized',
  declare_cp_default:   'cp_defaulted',
  withdraw:             'withdrawn',
  expire:               'expired',
  sla_breach:           'satisfying_cps',
};

// Regulator crossings
export function cpCrossesIntoRegulator(action: CpAction, tier: CpTier): boolean {
  // CP default = event of default on project finance = SARB/FSCA reportable always
  if (action === 'declare_cp_default') return true;
  // Large-exposure drawdown notification (SARB Directive 7/2018)
  if (action === 'authorize_drawdown') return tier === 'major' || tier === 'systemic';
  return false;
}

export function cpSlaBreachCrossesIntoRegulator(tier: CpTier): boolean {
  return tier === 'major' || tier === 'systemic';
}
