// ═══════════════════════════════════════════════════════════════════════════════
// W222 — Trader Cross-Border Transaction & Regulatory Pre-Approval
// FMA §17 + SARB ExCon / Currency & Exchanges Act §9
// Cross-border energy trades requiring SARB/FSCA pre-approval
// Related to: W44 (trade reporting), W61 (loan transfer), W68 (margin)
// ═══════════════════════════════════════════════════════════════════════════════

export type CbtStatus =
  | 'pre_approval_required'   // cross-border trade identified; pre-approval needed
  | 'fsca_application'        // FSCA licence/approval application submitted
  | 'sarb_excon_application'  // SARB exchange control application submitted
  | 'fsca_under_review'       // FSCA reviewing application
  | 'sarb_under_review'       // SARB ExCon reviewing application
  | 'fsca_approved'           // FSCA approval received; awaiting SARB
  | 'fully_approved'          // both FSCA + SARB approved; trade may proceed
  | 'trade_executed'          // trade executed under approval; terminal +
  | 'fsca_rejected'           // FSCA rejected; terminal
  | 'sarb_rejected'           // SARB ExCon rejected; terminal
  | 'withdrawn'               // application withdrawn; terminal
  | 'expired';                // approval lapsed before execution; terminal

export type CbtAction =
  | 'submit_fsca_application'
  | 'submit_sarb_application'
  | 'fsca_review_commenced'
  | 'sarb_review_commenced'
  | 'fsca_grant_approval'
  | 'obtain_full_approval'
  | 'execute_trade'
  | 'fsca_reject'
  | 'sarb_reject'
  | 'withdraw'
  | 'expire'
  | 'sla_breach';

export type CbtTier =
  | 'small'       // <R10M notional; 14d
  | 'standard'    // R10M–R100M; 21d
  | 'large'       // R100M–R1B; 30d
  | 'systemic';   // >R1B; cross-border systemic; 45d

// INVERTED SLA: larger cross-border transactions get more regulatory time
export function deriveCbtSla(tier: CbtTier): number {
  const DAYS: Record<CbtTier, number> = {
    small:    14,
    standard: 21,
    large:    30,
    systemic: 45,
  };
  return DAYS[tier] ?? 21;
}

export const CBT_HARD_TERMINALS = new Set<CbtStatus>([
  'trade_executed', 'fsca_rejected', 'sarb_rejected', 'withdrawn', 'expired',
]);

export const CBT_VALID_TRANSITIONS: Record<CbtStatus, CbtAction[]> = {
  pre_approval_required: ['submit_fsca_application', 'submit_sarb_application', 'withdraw', 'sla_breach'],
  fsca_application:      ['fsca_review_commenced', 'fsca_grant_approval', 'fsca_reject', 'withdraw', 'sla_breach'],
  sarb_excon_application: ['sarb_review_commenced', 'obtain_full_approval', 'sarb_reject', 'withdraw', 'sla_breach'],
  fsca_under_review:     ['fsca_grant_approval', 'fsca_reject', 'sla_breach'],
  sarb_under_review:     ['obtain_full_approval', 'sarb_reject', 'sla_breach'],
  fsca_approved:         ['submit_sarb_application', 'obtain_full_approval', 'sla_breach'],
  fully_approved:        ['execute_trade', 'expire', 'sla_breach'],
  trade_executed:        [],
  fsca_rejected:         [],
  sarb_rejected:         [],
  withdrawn:             [],
  expired:               [],
};

export const CBT_STATE_TRANSITIONS: Record<CbtAction, CbtStatus> = {
  submit_fsca_application:  'fsca_application',
  submit_sarb_application:  'sarb_excon_application',
  fsca_review_commenced:    'fsca_under_review',
  sarb_review_commenced:    'sarb_under_review',
  fsca_grant_approval:      'fsca_approved',
  obtain_full_approval:     'fully_approved',
  execute_trade:            'trade_executed',
  fsca_reject:              'fsca_rejected',
  sarb_reject:              'sarb_rejected',
  withdraw:                 'withdrawn',
  expire:                   'expired',
  sla_breach:               'pre_approval_required',
};

// Regulator crossings
export function cbtCrossesIntoRegulator(action: CbtAction, tier: CbtTier): boolean {
  // SARB rejection of any cross-border trade is systemic risk reportable
  if (action === 'sarb_reject') return true;
  // FSCA rejection for large/systemic is reportable
  if (action === 'fsca_reject') return tier === 'large' || tier === 'systemic';
  // Full approval for systemic trades crosses NT/SARB monitoring
  if (action === 'obtain_full_approval') return tier === 'systemic';
  // Trade execution for large/systemic crosses SARB/FSCA post-trade reporting
  if (action === 'execute_trade') return tier === 'large' || tier === 'systemic';
  return false;
}

export function cbtSlaBreachCrossesIntoRegulator(tier: CbtTier): boolean {
  return tier === 'large' || tier === 'systemic';
}
