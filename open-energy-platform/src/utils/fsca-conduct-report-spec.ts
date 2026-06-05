// ═══════════════════════════════════════════════════════════════════════════════
// W216 — Trader FSCA Periodic Conduct Report
// FSCA Conduct Standard 1/2020 + FMA Chapter X + FAIS s18
// ═══════════════════════════════════════════════════════════════════════════════

export type FcrStatus =
  | 'draft'               // report being prepared
  | 'internal_review'     // compliance officer / risk committee review
  | 'board_approved'      // board sign-off obtained
  | 'submitted_to_fsca'   // report submitted to FSCA
  | 'fsca_queries'        // FSCA raised queries
  | 'queries_responded'   // queries answered; awaiting FSCA acknowledgement
  | 'accepted'            // FSCA accepted the report; terminal +
  | 'rejected'            // FSCA rejected; must resubmit; terminal
  | 'escalated'           // material breach identified; terminal
  | 'withdrawn';          // period closed / entity deregistered; terminal

export type FcrAction =
  | 'commence_review'
  | 'approve_board'
  | 'submit_to_fsca'
  | 'record_queries'
  | 'respond_to_queries'
  | 'accept'
  | 'reject'
  | 'escalate'
  | 'withdraw'
  | 'sla_breach';

export type FcrTier =
  | 'retail'          // retail client exposure only — lighter requirements
  | 'professional'    // professional / wholesale clients
  | 'market_maker'    // designated market-maker under best-ex standard
  | 'systemic';       // systemic importance threshold (>R1bn notional)

// INVERTED SLA: larger / systemic participants get more time (more data to aggregate)
export function deriveFcrSla(tier: FcrTier): number {
  const DAYS: Record<FcrTier, number> = {
    retail:         30,
    professional:   45,
    market_maker:   60,
    systemic:       90,
  };
  return DAYS[tier] ?? 45;
}

export const FCR_HARD_TERMINALS = new Set<FcrStatus>([
  'accepted', 'rejected', 'escalated', 'withdrawn',
]);

export const FCR_VALID_TRANSITIONS: Record<FcrStatus, FcrAction[]> = {
  draft:              ['commence_review', 'withdraw', 'sla_breach'],
  internal_review:    ['approve_board', 'sla_breach'],
  board_approved:     ['submit_to_fsca', 'sla_breach'],
  submitted_to_fsca:  ['record_queries', 'accept', 'sla_breach'],
  fsca_queries:       ['respond_to_queries', 'escalate', 'sla_breach'],
  queries_responded:  ['accept', 'reject', 'escalate', 'sla_breach'],
  accepted:           [],
  rejected:           [],
  escalated:          [],
  withdrawn:          [],
};

export const FCR_STATE_TRANSITIONS: Record<FcrAction, FcrStatus> = {
  commence_review:   'internal_review',
  approve_board:     'board_approved',
  submit_to_fsca:    'submitted_to_fsca',
  record_queries:    'fsca_queries',
  respond_to_queries:'queries_responded',
  accept:            'accepted',
  reject:            'rejected',
  escalate:          'escalated',
  withdraw:          'withdrawn',
  sla_breach:        'draft',
};

// Regulator crossings
export function fcrCrossesIntoRegulator(action: FcrAction, tier: FcrTier): boolean {
  // All submissions cross — conduct reports are regulatory filings
  if (action === 'submit_to_fsca') return true;
  // Escalation always
  if (action === 'escalate') return true;
  // Acceptance for market_maker / systemic
  if (action === 'accept') return tier === 'market_maker' || tier === 'systemic';
  return false;
}

export function fcrSlaBreachCrossesIntoRegulator(tier: FcrTier): boolean {
  return tier === 'market_maker' || tier === 'systemic';
}
