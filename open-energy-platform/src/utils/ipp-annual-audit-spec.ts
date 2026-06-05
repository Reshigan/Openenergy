// ═══════════════════════════════════════════════════════════════════════════
// Wave 189 — IPP Annual Financial Statements & Independent Audit
//
// Every IPP project company (typically structured as an SPV under a project
// finance arrangement) must produce audited Annual Financial Statements (AFS)
// under:
//   - Companies Act 71/2008 §30: AFS within 6 months of financial year-end
//   - Public Finance Management Act §55: public-entity subsidiaries
//   - REIPPPP Schedule 4 §3.1: lenders require audited AFS as a condition
//     of the Senior Facility Agreement (draws from W21 drawdown + W53 credit)
//   - International Standards on Auditing (ISA) / IRBA as applicable
//   - IFRS (IAS 16 for PPE, IFRS 9 ECL, IFRS 16 lease, IFRS 15 revenue)
//
// The audit cycle covers:
//   1. Trial balance & year-end accounting close-out
//   2. Year-end journals: depreciation, accruals, prepayments, impairments
//   3. Audit fieldwork: external auditors conduct substantive testing
//   4. Management accounts review: AFS draft reviewed by management
//   5. Audit queries resolution: responses to auditor exceptions
//   6. Draft opinion review: management reviews draft auditor report
//   7. Board approval: AFS approved by board under Companies Act §30(3)
//   8. CIPC filing: Annual Return (AR) + AFS lodged via CoSec
//
// If the auditor identifies material misstatements or scope limitations,
// a qualified or adverse opinion is issued (feeds W31 Regulator Disposition;
// DFI lenders may trigger covenant default under W38 covenant certificate).
//
// Mounted at /api/ipp-annual-audits.
//
// INVERTED SLA: larger revenue base = more complex AFS (more subsidiaries,
// more tax calculations, more related-party disclosures) = more time granted
// by auditors and lenders. Flagship projects (>= R1B annual revenue) receive
// 180 days from financial year-end trigger date.
//
// 12-state chain:
//   audit_cycle_opened → trial_balance_preparation → year_end_journals
//   → audit_fieldwork → management_accounts_review → audit_queries_resolution
//   → draft_opinion_review → board_approval → cipc_submission
//   → audit_completed      (terminal — positive)
//   → audit_qualified      (terminal — qualified/adverse opinion)
//   → audit_lapsed         (terminal — time-lapsed / statutory breach)
//
// Signature reportability:
//   issue_qualified_opinion → ALL tiers (Companies Act + NERSA + DFI lenders
//                              must be notified; feeds W31 Regulator + W38/W45)
//   declare_lapsed          → major + flagship (large-plant statutory audit
//                              breach is a DFI default trigger; CIPC penalty)
//   complete_audit          → major + flagship (flagship AFS feed DFI
//                              covenant compliance under W38 + SARB exposure)
// ═══════════════════════════════════════════════════════════════════════════

export type AudStatus =
  | 'audit_cycle_opened'
  | 'trial_balance_preparation'
  | 'year_end_journals'
  | 'audit_fieldwork'
  | 'management_accounts_review'
  | 'audit_queries_resolution'
  | 'draft_opinion_review'
  | 'board_approval'
  | 'cipc_submission'
  | 'audit_completed'    // TERMINAL
  | 'audit_qualified'    // TERMINAL
  | 'audit_lapsed';      // TERMINAL

export type AudAction =
  | 'commence_trial_balance'
  | 'process_year_end_journals'
  | 'commence_audit_fieldwork'
  | 'present_management_accounts'
  | 'resolve_audit_queries'
  | 'review_draft_opinion'
  | 'obtain_board_approval'
  | 'submit_to_cipc'
  | 'complete_audit'
  | 'issue_qualified_opinion'
  | 'declare_lapsed';

// INVERTED SLA — annual revenue tier (larger revenue = MORE time)
export type AudRevenueTier = 'small' | 'medium' | 'large' | 'major' | 'flagship';

// Audit opinion type
export type AudOpinionType =
  | 'unqualified'        // clean opinion — TERMINAL positive
  | 'qualified'          // material misstatement with limitation
  | 'adverse'            // so material the AFS are misleading
  | 'disclaimer';        // auditor could not obtain sufficient evidence

// ─── Tier derivation (keyed on annual_revenue_zar) ───────────────────────────

export function deriveAudRevenueTier(annual_revenue_zar: number): AudRevenueTier {
  if (annual_revenue_zar < 10_000_000)    return 'small';
  if (annual_revenue_zar < 100_000_000)   return 'medium';
  if (annual_revenue_zar < 500_000_000)   return 'large';
  if (annual_revenue_zar < 1_000_000_000) return 'major';
  return 'flagship';
}

// ─── INVERTED SLA (larger revenue → more time; days from year-end) ────────────

export const SLA_DAYS: Record<AudRevenueTier, number> = {
  small:    60,
  medium:   90,
  large:    120,
  major:    150,
  flagship: 180,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<AudStatus>([
  'audit_completed',
  'audit_qualified',
  'audit_lapsed',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<AudAction, { from: AudStatus[] }> = {
  commence_trial_balance:       { from: ['audit_cycle_opened'] },
  process_year_end_journals:    { from: ['trial_balance_preparation'] },
  commence_audit_fieldwork:     { from: ['year_end_journals'] },
  present_management_accounts:  { from: ['audit_fieldwork'] },
  resolve_audit_queries:        { from: ['management_accounts_review'] },
  review_draft_opinion:         { from: ['audit_queries_resolution'] },
  obtain_board_approval:        { from: ['draft_opinion_review'] },
  submit_to_cipc:               { from: ['board_approval'] },
  complete_audit:               { from: ['cipc_submission'] },
  issue_qualified_opinion:      {
    from: [
      'audit_fieldwork', 'management_accounts_review',
      'audit_queries_resolution', 'draft_opinion_review',
      'board_approval', 'cipc_submission',
    ],
  },
  declare_lapsed:               {
    from: [
      'audit_cycle_opened', 'trial_balance_preparation', 'year_end_journals',
      'audit_fieldwork', 'management_accounts_review', 'audit_queries_resolution',
      'draft_opinion_review', 'board_approval', 'cipc_submission',
    ],
  },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<AudAction, AudStatus> = {
  commence_trial_balance:       'trial_balance_preparation',
  process_year_end_journals:    'year_end_journals',
  commence_audit_fieldwork:     'audit_fieldwork',
  present_management_accounts:  'management_accounts_review',
  resolve_audit_queries:        'audit_queries_resolution',
  review_draft_opinion:         'draft_opinion_review',
  obtain_board_approval:        'board_approval',
  submit_to_cipc:               'cipc_submission',
  complete_audit:               'audit_completed',
  issue_qualified_opinion:      'audit_qualified',
  declare_lapsed:               'audit_lapsed',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_TIERS: AudRevenueTier[]   = ['small', 'medium', 'large', 'major', 'flagship'];
const MAJOR_PLUS: AudRevenueTier[]  = ['major', 'flagship'];

export function crossesIntoRegulator(
  action: AudAction,
  tier: AudRevenueTier,
): boolean {
  switch (action) {
    case 'issue_qualified_opinion': return ALL_TIERS.includes(tier);
    case 'declare_lapsed':          return MAJOR_PLUS.includes(tier);
    case 'complete_audit':          return MAJOR_PLUS.includes(tier);
    default:                        return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: AudRevenueTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
