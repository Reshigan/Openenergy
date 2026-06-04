// ═══════════════════════════════════════════════════════════════════════════
// Wave 179 — IPP REIPPPP Performance Security & Construction Guarantee Renewal
//
// REIPPPP Finance Documents (Schedule 6) require IPPs to procure and maintain
// performance securities throughout the construction phase. These include:
// contractor performance bonds, advance payment guarantees (APGs), retention
// guarantees, parent company guarantees (PCGs), and irrevocable letters of
// credit (LCs). Securities must be renewed annually or at key construction
// milestones. Failure to maintain or renew triggers a DMRE Default Notice
// under the PPA and constitutes an event of default under the Finance Docs.
//
// Mounted at /api/ipp-perf-securities.
//
// URGENT SLA: higher bond quantum = larger contractor exposure = more risk
// to the project lenders and the DMRE = TIGHTER renewal deadline.
// Major bonds (>R500M) must be renewed 14 days before expiry; micro bonds
// (<R5M) have 60 days.
//
// 12-state chain:
//   security_required → bond_application_submitted → bank_assessment
//   → terms_issued → ipp_review → terms_accepted → bond_documentation
//   → bond_issued → dmre_notification_sent
//   → security_confirmed (terminal)
//   → security_rejected  (terminal)
//   → security_lapsed    (terminal)
//
// Signature reportability:
//   reject_security  → ALL tiers (contractor failure = DMRE default notification)
//   lapse_security   → ALL tiers (lapse = immediate PPA default event)
//   confirm_security → large + major (major bonds notify DMRE security registry)
// ═══════════════════════════════════════════════════════════════════════════

export type PsecStatus =
  | 'security_required'
  | 'bond_application_submitted'
  | 'bank_assessment'
  | 'terms_issued'
  | 'ipp_review'
  | 'terms_accepted'
  | 'bond_documentation'
  | 'bond_issued'
  | 'dmre_notification_sent'
  | 'security_confirmed'  // TERMINAL
  | 'security_rejected'   // TERMINAL
  | 'security_lapsed';    // TERMINAL

export type PsecAction =
  | 'submit_application'
  | 'commence_bank_assessment'
  | 'issue_terms'
  | 'commence_ipp_review'
  | 'accept_terms'
  | 'prepare_bond_documentation'
  | 'issue_bond'
  | 'send_dmre_notification'
  | 'confirm_security'
  | 'reject_security'
  | 'lapse_security';

// URGENT SLA — bond quantum tier (higher quantum = tighter deadline)
export type PsecBondTier = 'micro' | 'small' | 'medium' | 'large' | 'major';

// Security instrument classification
export type PsecSecurityType =
  | 'performance_bond'              // contractor performance bond
  | 'advance_payment_guarantee'     // APG — secures advance payments
  | 'retention_guarantee'           // release of cash retentions
  | 'parent_company_guarantee'      // PCG from contractor parent
  | 'irrevocable_lc'                // irrevocable letter of credit
  | 'comprehensive_package';        // all instruments combined

// ─── Tier derivation (keyed on bond_quantum_zar) ─────────────────────────────

export function derivePsecBondTier(bond_quantum_zar: number): PsecBondTier {
  if (bond_quantum_zar < 5_000_000)    return 'micro';
  if (bond_quantum_zar < 20_000_000)   return 'small';
  if (bond_quantum_zar < 100_000_000)  return 'medium';
  if (bond_quantum_zar < 500_000_000)  return 'large';
  return 'major';
}

// ─── URGENT SLA (higher quantum → tighter deadline) ──────────────────────────

export const SLA_DAYS: Record<PsecBondTier, number> = {
  micro:  60,
  small:  45,
  medium: 30,
  large:  21,
  major:  14,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<PsecStatus>([
  'security_confirmed',
  'security_rejected',
  'security_lapsed',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<PsecAction, { from: PsecStatus[] }> = {
  submit_application:          { from: ['security_required'] },
  commence_bank_assessment:    { from: ['bond_application_submitted'] },
  issue_terms:                 { from: ['bank_assessment'] },
  commence_ipp_review:         { from: ['terms_issued'] },
  accept_terms:                { from: ['ipp_review'] },
  prepare_bond_documentation:  { from: ['terms_accepted'] },
  issue_bond:                  { from: ['bond_documentation'] },
  send_dmre_notification:      { from: ['bond_issued'] },
  confirm_security:            { from: ['dmre_notification_sent'] },
  reject_security:             { from: ['dmre_notification_sent'] },
  lapse_security:              {
    from: [
      'security_required', 'bond_application_submitted', 'bank_assessment',
      'terms_issued', 'ipp_review', 'terms_accepted', 'bond_documentation',
      'bond_issued', 'dmre_notification_sent',
    ],
  },
};

// ─── State machine ───────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<PsecAction, PsecStatus> = {
  submit_application:          'bond_application_submitted',
  commence_bank_assessment:    'bank_assessment',
  issue_terms:                 'terms_issued',
  commence_ipp_review:         'ipp_review',
  accept_terms:                'terms_accepted',
  prepare_bond_documentation:  'bond_documentation',
  issue_bond:                  'bond_issued',
  send_dmre_notification:      'dmre_notification_sent',
  confirm_security:            'security_confirmed',
  reject_security:             'security_rejected',
  lapse_security:              'security_lapsed',
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const ALL_TIERS: PsecBondTier[] = ['micro', 'small', 'medium', 'large', 'major'];
const LARGE_PLUS: PsecBondTier[] = ['large', 'major'];

export function crossesIntoRegulator(
  action: PsecAction,
  tier: PsecBondTier,
): boolean {
  switch (action) {
    case 'reject_security': return ALL_TIERS.includes(tier);
    case 'lapse_security':  return ALL_TIERS.includes(tier);
    case 'confirm_security': return LARGE_PLUS.includes(tier);
    default:                return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: PsecBondTier): boolean {
  return LARGE_PLUS.includes(tier);
}
