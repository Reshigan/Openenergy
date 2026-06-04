// ═══════════════════════════════════════════════════════════════════════════
// Wave 186 — IPP SPV Equity Transfer & NERSA Consent
//
// When equity in a project SPV changes hands — through secondary sale,
// development equity transfer, BEE community equity take-up, DFI partial exit,
// or PE fund roll-over — multiple consents are required under:
//   - ERA 4/2006 §13: NERSA must consent to a change in effective control
//   - REIPPPP Schedule 2: IPP Office (DMRE) must consent to equity transfers
//   - REIPPPP BEE equity lock-in: BEE community equity is locked for 20 years
//   - PPA: offtaker (typically Eskom/municipality) must be notified
//   - Senior Facility Agreement: lenders must consent (feeds W21/W61 chains)
//   - Competition Act: large transactions may require Competition Commission
//     approval (>R500M triggers merger notification under §12A)
//
// Transfer types:
//   - secondary_sale: development equity sold to infrastructure fund
//   - community_equity: BEE community trust exercises equity option (REIPPPP)
//   - dfi_exit: DFI (IDC/DBSA) partial or full exit to institutional investor
//   - sponsor_reorg: internal sponsor group restructuring (same ultimate owner)
//   - debt_equity_swap: lender takes equity on default (links W45 chain)
//
// URGENT SLA: larger equity quantum = more counterparties watching = faster
// execution required to meet transfer completion date in the sale agreement.
// Flagship transactions (>R2B equity) must complete within 45 days of trigger;
// micro transactions (<R50M) have 90 days.
//
// 12-state chain:
//   transfer_initiated → due_diligence → regulatory_notification
//   → lender_consent_requested → offtaker_notification → nersa_review
//   → regulatory_clearance_issued → conditions_precedent_tracking
//   → cp_documentation_submitted
//   → transfer_completed      (terminal — positive)
//   → transfer_rejected       (terminal — negative)
//   → transfer_lapsed         (terminal — time-lapsed)
//
// Signature reportability:
//   reject_transfer  → ALL tiers (NERSA must publish all licence-consent refusals)
//   complete_transfer → major + flagship (large equity events disclosed to public;
//                       competition commission notification required)
//   declare_lapsed   → major + flagship (deal collapse on large transactions
//                       may trigger PPA termination proceedings)
// ═══════════════════════════════════════════════════════════════════════════

export type EqtStatus =
  | 'transfer_initiated'
  | 'due_diligence'
  | 'regulatory_notification'
  | 'lender_consent_requested'
  | 'offtaker_notification'
  | 'nersa_review'
  | 'regulatory_clearance_issued'
  | 'conditions_precedent_tracking'
  | 'cp_documentation_submitted'
  | 'transfer_completed'    // TERMINAL
  | 'transfer_rejected'     // TERMINAL
  | 'transfer_lapsed';      // TERMINAL

export type EqtAction =
  | 'commence_due_diligence'
  | 'notify_regulators'
  | 'request_lender_consent'
  | 'notify_offtaker'
  | 'commence_nersa_review'
  | 'issue_regulatory_clearance'
  | 'track_conditions_precedent'
  | 'submit_cp_documentation'
  | 'complete_transfer'
  | 'reject_transfer'
  | 'declare_lapsed';

// URGENT SLA — equity quantum tier (larger quantum = TIGHTER deadline)
export type EqtEquityTier = 'micro' | 'small' | 'medium' | 'large' | 'flagship';

// Transfer type
export type EqtTransferType =
  | 'secondary_sale'       // dev equity sold to infrastructure fund
  | 'community_equity'     // BEE community trust equity option exercise
  | 'dfi_exit'             // DFI partial or full exit
  | 'sponsor_reorg'        // internal sponsor restructure (same UBO)
  | 'debt_equity_swap';    // lender takes equity on default (links W45)

// ─── Tier derivation (keyed on equity_quantum_zar) ───────────────────────────

export function deriveEqtEquityTier(equity_quantum_zar: number): EqtEquityTier {
  if (equity_quantum_zar < 50_000_000)      return 'micro';
  if (equity_quantum_zar < 250_000_000)     return 'small';
  if (equity_quantum_zar < 750_000_000)     return 'medium';
  if (equity_quantum_zar <= 2_000_000_000)  return 'large';
  return 'flagship';
}

// ─── URGENT SLA (larger equity → tighter deadline) ───────────────────────────

export const SLA_DAYS: Record<EqtEquityTier, number> = {
  micro:    90,
  small:    75,
  medium:   60,
  large:    52,
  flagship: 45,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<EqtStatus>([
  'transfer_completed',
  'transfer_rejected',
  'transfer_lapsed',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<EqtAction, { from: EqtStatus[] }> = {
  commence_due_diligence:       { from: ['transfer_initiated'] },
  notify_regulators:            { from: ['due_diligence'] },
  request_lender_consent:       { from: ['regulatory_notification'] },
  notify_offtaker:              { from: ['lender_consent_requested'] },
  commence_nersa_review:        { from: ['offtaker_notification'] },
  issue_regulatory_clearance:   { from: ['nersa_review'] },
  track_conditions_precedent:   { from: ['regulatory_clearance_issued'] },
  submit_cp_documentation:      { from: ['conditions_precedent_tracking'] },
  complete_transfer:            { from: ['cp_documentation_submitted'] },
  reject_transfer:              {
    from: [
      'nersa_review', 'lender_consent_requested', 'offtaker_notification',
      'regulatory_clearance_issued', 'conditions_precedent_tracking',
      'cp_documentation_submitted',
    ],
  },
  declare_lapsed:               {
    from: [
      'transfer_initiated', 'due_diligence', 'regulatory_notification',
      'lender_consent_requested', 'offtaker_notification', 'nersa_review',
      'regulatory_clearance_issued', 'conditions_precedent_tracking',
      'cp_documentation_submitted',
    ],
  },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<EqtAction, EqtStatus> = {
  commence_due_diligence:       'due_diligence',
  notify_regulators:            'regulatory_notification',
  request_lender_consent:       'lender_consent_requested',
  notify_offtaker:              'offtaker_notification',
  commence_nersa_review:        'nersa_review',
  issue_regulatory_clearance:   'regulatory_clearance_issued',
  track_conditions_precedent:   'conditions_precedent_tracking',
  submit_cp_documentation:      'cp_documentation_submitted',
  complete_transfer:            'transfer_completed',
  reject_transfer:              'transfer_rejected',
  declare_lapsed:               'transfer_lapsed',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_TIERS: EqtEquityTier[]   = ['micro', 'small', 'medium', 'large', 'flagship'];
const MAJOR_PLUS: EqtEquityTier[]  = ['large', 'flagship'];

export function crossesIntoRegulator(
  action: EqtAction,
  tier: EqtEquityTier,
): boolean {
  switch (action) {
    case 'reject_transfer':   return ALL_TIERS.includes(tier);
    case 'complete_transfer': return MAJOR_PLUS.includes(tier);
    case 'declare_lapsed':    return MAJOR_PLUS.includes(tier);
    default:                  return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: EqtEquityTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
