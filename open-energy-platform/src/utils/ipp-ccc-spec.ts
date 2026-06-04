// ═══════════════════════════════════════════════════════════════════════════
// Wave 166 — IPP Connection Cost Contribution (CCC) Negotiation spec
//
// NERSA Grid Code Appendix C-2 (Connection Cost Sharing) + NTCSA 2024 Cost
// Sharing Rules + ERA 2006 §§34-35 (network access conditions). When a new
// IPP applies to connect to the national grid, the network operator (Eskom
// Transmission or municipal DSO) performs a load flow study identifying
// required network upgrades. The IPP must negotiate its share (the CCC) of
// those upgrade costs before the Grid Connection Agreement (W28) can be
// finalised. The CCC may cover: line extensions, substation upgrades,
// protection relay additions, and reactive power compensation equipment.
//
// Mounted at /api/ipp-ccc.
//
// INVERTED SLA: larger CCC quantum → more complex cost-sharing negotiation
// with more network operator stakeholders → MORE time.
//
// 12-state chain:
//   ccc_initiated → load_flow_study → cost_assessment → ipp_review
//   → negotiation_in_progress → expert_determination (optional path)
//   → provisional_agreement → dispute_filed → arbitration_in_progress
//   → ccc_agreed (terminal) → ccc_rejected (terminal)
//   → regulatory_determination (terminal — NERSA decides if parties can't)
//
// Signature reportability:
//   ccc_rejected         → EVERY tier (blocked connection = notifiable)
//   regulatory_determination → EVERY tier (NERSA intervention always notifiable)
//   ccc_agreed           → major + material (large network investments NERSA)
// ═══════════════════════════════════════════════════════════════════════════

export type CccStatus =
  | 'ccc_initiated'
  | 'load_flow_study'
  | 'cost_assessment'
  | 'ipp_review'
  | 'negotiation_in_progress'
  | 'expert_determination'
  | 'provisional_agreement'
  | 'dispute_filed'
  | 'arbitration_in_progress'
  | 'ccc_agreed'               // TERMINAL
  | 'ccc_rejected'             // TERMINAL
  | 'regulatory_determination'; // TERMINAL

export type CccAction =
  | 'commission_load_flow_study'
  | 'complete_cost_assessment'
  | 'submit_for_ipp_review'
  | 'commence_negotiation'
  | 'refer_to_expert'
  | 'accept_expert_determination'
  | 'reach_provisional_agreement'
  | 'file_dispute'
  | 'commence_arbitration'
  | 'agree_ccc'
  | 'reject_ccc'
  | 'refer_to_nersa';

export type CccTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

export type CccCategory =
  | 'line_extension'
  | 'substation_upgrade'
  | 'protection_relay'
  | 'reactive_compensation'
  | 'metering_telecoms'
  | 'combined';

// ─── Tier derivation (keyed on ccc_amount_zar) ──────────────────────────────

export function deriveCccTier(ccc_amount_zar: number): CccTier {
  if (ccc_amount_zar < 5_000_000)    return 'minor';
  if (ccc_amount_zar < 25_000_000)   return 'moderate';
  if (ccc_amount_zar < 100_000_000)  return 'significant';
  if (ccc_amount_zar < 500_000_000)  return 'major';
  return 'material';
}

// ─── INVERTED SLA (larger CCC → more complex negotiation → more time) ────────

export const SLA_DAYS: Record<CccTier, number> = {
  minor:       30,
  moderate:    45,
  significant: 60,
  major:       90,
  material:    120,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<CccStatus>([
  'ccc_agreed',
  'ccc_rejected',
  'regulatory_determination',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  CccAction,
  { from: CccStatus[] }
> = {
  commission_load_flow_study:   { from: ['ccc_initiated'] },
  complete_cost_assessment:     { from: ['load_flow_study'] },
  submit_for_ipp_review:        { from: ['cost_assessment'] },
  commence_negotiation:         { from: ['ipp_review'] },
  refer_to_expert:              { from: ['negotiation_in_progress'] },
  accept_expert_determination:  { from: ['expert_determination'] },
  reach_provisional_agreement:  { from: ['negotiation_in_progress', 'expert_determination'] },
  file_dispute:                 { from: ['provisional_agreement', 'ipp_review'] },
  commence_arbitration:         { from: ['dispute_filed'] },
  agree_ccc:                    { from: ['provisional_agreement', 'arbitration_in_progress'] },
  reject_ccc:                   { from: ['arbitration_in_progress', 'provisional_agreement'] },
  refer_to_nersa:               { from: ['dispute_filed', 'arbitration_in_progress'] },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: CccTier[] = ['minor', 'moderate', 'significant', 'major', 'material'];
const MAJOR_PLUS: CccTier[] = ['major', 'material'];

export function crossesIntoRegulator(
  action: CccAction,
  tier: CccTier,
): boolean {
  switch (action) {
    case 'reject_ccc':               return ALL_TIERS.includes(tier);
    case 'refer_to_nersa':           return ALL_TIERS.includes(tier);
    case 'agree_ccc':                return MAJOR_PLUS.includes(tier);
    default:                         return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: CccTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
