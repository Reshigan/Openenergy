// ═══════════════════════════════════════════════════════════════════════════════
// W219 — Offtaker Wheeling Access Application & Third-Party Access Agreement
// NERSA Grid Code §10 + ERA §21 — offtaker-side network access for wheeled RE
// Distinct from: W8 (wheeling billing cycle), W28 (generator GCA)
// ═══════════════════════════════════════════════════════════════════════════════

export type WheelStatus =
  | 'access_application'      // offtaker submits wheeling access request
  | 'feasibility_study'       // grid operator assesses network capacity
  | 'impact_assessment'       // detailed technical power-flow study
  | 'terms_proposed'          // grid operator issues indicative terms
  | 'negotiation'             // commercial / technical terms negotiation
  | 'agreement_signed'        // wheeling access agreement executed
  | 'active'                  // wheeling in operation; monthly billing via W8
  | 'modification_requested'  // change to capacity / route requested
  | 'renewal_due'             // approaching agreement expiry
  | 'terminated'              // agreement ended by either party; terminal
  | 'expired'                 // lapsed without renewal; terminal
  | 'withdrawn';              // application withdrawn; terminal

export type WheelAction =
  | 'commence_feasibility'
  | 'commence_impact_assessment'
  | 'issue_terms'
  | 'commence_negotiation'
  | 'execute_agreement'
  | 'activate'
  | 'request_modification'
  | 'flag_renewal'
  | 'terminate'
  | 'expire'
  | 'withdraw'
  | 'sla_breach';

export type WheelTier =
  | 'small_embedded'       // <1 MW; typically residential/SME aggregation
  | 'medium_distributed'   // 1–10 MW; commercial / light industrial
  | 'large_industrial'     // 10–100 MW; heavy industry / municipality
  | 'bulk_transmission';   // >100 MW; bulk wheeling on transmission backbone

// INVERTED SLA: larger capacity = more complex studies = more processing time
export function deriveWheelSla(tier: WheelTier): number {
  const DAYS: Record<WheelTier, number> = {
    small_embedded:      21,
    medium_distributed:  30,
    large_industrial:    45,
    bulk_transmission:   90,
  };
  return DAYS[tier] ?? 30;
}

export const WHEEL_HARD_TERMINALS = new Set<WheelStatus>([
  'terminated', 'expired', 'withdrawn',
]);

export const WHEEL_VALID_TRANSITIONS: Record<WheelStatus, WheelAction[]> = {
  access_application:     ['commence_feasibility', 'withdraw', 'sla_breach'],
  feasibility_study:      ['commence_impact_assessment', 'issue_terms', 'withdraw', 'sla_breach'],
  impact_assessment:      ['issue_terms', 'withdraw', 'sla_breach'],
  terms_proposed:         ['commence_negotiation', 'withdraw', 'sla_breach'],
  negotiation:            ['execute_agreement', 'withdraw', 'sla_breach'],
  agreement_signed:       ['activate', 'withdraw', 'sla_breach'],
  active:                 ['request_modification', 'flag_renewal', 'terminate', 'sla_breach'],
  modification_requested: ['activate', 'terminate', 'sla_breach'],
  renewal_due:            ['execute_agreement', 'expire', 'terminate', 'sla_breach'],
  terminated:             [],
  expired:                [],
  withdrawn:              [],
};

export const WHEEL_STATE_TRANSITIONS: Record<WheelAction, WheelStatus> = {
  commence_feasibility:       'feasibility_study',
  commence_impact_assessment: 'impact_assessment',
  issue_terms:                'terms_proposed',
  commence_negotiation:       'negotiation',
  execute_agreement:          'agreement_signed',
  activate:                   'active',
  request_modification:       'modification_requested',
  flag_renewal:               'renewal_due',
  terminate:                  'terminated',
  expire:                     'expired',
  withdraw:                   'withdrawn',
  sla_breach:                 'access_application',
};

// Regulator crossings
export function wheelCrossesIntoRegulator(action: WheelAction, tier: WheelTier): boolean {
  // Termination of active large/bulk agreements is reportable to NERSA
  if (action === 'terminate') return tier === 'large_industrial' || tier === 'bulk_transmission';
  // Agreement execution for bulk transmission is a NERSA third-party access record
  if (action === 'execute_agreement') return tier === 'bulk_transmission';
  // Refusal (implied by withdraw after terms_proposed) — covered by withdraw on large/bulk
  if (action === 'withdraw') return tier === 'bulk_transmission';
  return false;
}

export function wheelSlaBreachCrossesIntoRegulator(tier: WheelTier): boolean {
  return tier === 'large_industrial' || tier === 'bulk_transmission';
}
