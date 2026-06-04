// ═══════════════════════════════════════════════════════════════════════════
// Wave 184 — IPP Annual NERSA Licence Compliance Return
//
// All licensees under the Electricity Regulation Act 4/2006 must submit an
// Annual Compliance Return (ACR) to NERSA within the prescribed period after
// their financial year end. The ACR covers:
//   - Energy generation statistics (actual vs licensed capacity)
//   - Compliance status against all licence conditions
//   - Environmental performance (emissions, water use, waste management)
//   - B-BBEE status and ED/SED spend (feeds W182 BBBEE + W181 SED chains)
//   - Safety incidents and OHSA compliance (references W25 HSE chain)
//   - Financial performance indicators (revenue, EBITDA, debt covenants)
//   - Grid code compliance (references W67 Grid Code Compliance chain)
//   - Insurance adequacy confirmation (references W178 insurance renewal chain)
//
// NERSA reviews the ACR and may:
//   - Accept it (issue a compliance certificate)
//   - Request clarification on specific items
//   - Issue a notice of non-compliance (feeds W40 Compliance Inspection chain)
//   - Refer to enforcement proceedings (feeds W31 Regulator Disposition)
//
// Failure to submit, or a rejected ACR, is an ERA §10 breach that can trigger:
//   (1) licence suspension proceedings (W33 renewal chain at risk)
//   (2) financial penalties per ERA §34/§35
//   (3) referral to the NERSA CEO for enforcement action
//
// Mounted at /api/ipp-licence-returns.
//
// INVERTED SLA: larger licensed capacity = more complex compliance obligations
// = NERSA grants more time to compile and review. Small plants (< 5 MW) are
// typically Schedule 2 registrations; the full-licence regime applies from 5 MW.
// Flagship plants (> 200 MW) operate under complex multi-technology licence
// conditions and get 90 days from financial year end.
//
// 12-state chain:
//   return_triggered → data_assembly → internal_review → board_approval
//   → portal_submission → acknowledgement_pending → nersa_review
//   → clarification_requested → clarification_submitted
//   → return_accepted    (terminal — positive)
//   → return_rejected    (terminal — negative)
//   → return_lapsed      (terminal — time-lapsed)
//
// Signature reportability:
//   reject_return    → ALL tiers (licence non-compliance = automatic regulatory
//                       reporting per ERA §34; feeds W40 enforcement chain)
//   declare_lapsed   → major + flagship (large plant missed filing = systemic
//                       risk; NERSA must report to DoE within 30 days)
//   request_clarification → major + flagship (NERSA flags on large plants
//                       are routinely shared with DoE energy planning desk)
// ═══════════════════════════════════════════════════════════════════════════

export type LcrStatus =
  | 'return_triggered'
  | 'data_assembly'
  | 'internal_review'
  | 'board_approval'
  | 'portal_submission'
  | 'acknowledgement_pending'
  | 'nersa_review'
  | 'clarification_requested'
  | 'clarification_submitted'
  | 'return_accepted'    // TERMINAL
  | 'return_rejected'    // TERMINAL
  | 'return_lapsed';     // TERMINAL

export type LcrAction =
  | 'commence_data_assembly'
  | 'conduct_internal_review'
  | 'obtain_board_approval'
  | 'submit_to_portal'
  | 'confirm_receipt'
  | 'begin_nersa_review'
  | 'request_clarification'
  | 'submit_clarification'
  | 'accept_return'
  | 'reject_return'
  | 'declare_lapsed';

// INVERTED SLA — licensed capacity tier (larger plant = MORE time)
export type LcrCapacityTier = 'small' | 'medium' | 'large' | 'major' | 'flagship';

// Return type (determines scope of reporting obligations)
export type LcrReturnType =
  | 'annual_standard'       // standard ERA §10(a) annual compliance return
  | 'annual_construction'   // construction-phase plant (limited operations)
  | 'annual_decommission'   // plant in decommissioning phase
  | 'restatement';          // restated return following rejected prior submission

// ─── Tier derivation (keyed on licensed_mw) ──────────────────────────────────

export function deriveLcrCapacityTier(licensed_mw: number): LcrCapacityTier {
  if (licensed_mw < 5)    return 'small';
  if (licensed_mw < 20)   return 'medium';
  if (licensed_mw < 100)  return 'large';
  if (licensed_mw <= 200) return 'major';
  return 'flagship';
}

// ─── INVERTED SLA (larger MW → more time) ────────────────────────────────────

export const SLA_DAYS: Record<LcrCapacityTier, number> = {
  small:    30,
  medium:   45,
  large:    60,
  major:    75,
  flagship: 90,
};

// ─── Hard terminals ──────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<LcrStatus>([
  'return_accepted',
  'return_rejected',
  'return_lapsed',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<LcrAction, { from: LcrStatus[] }> = {
  commence_data_assembly:  { from: ['return_triggered'] },
  conduct_internal_review: { from: ['data_assembly'] },
  obtain_board_approval:   { from: ['internal_review'] },
  submit_to_portal:        { from: ['board_approval'] },
  confirm_receipt:         { from: ['portal_submission'] },
  begin_nersa_review:      { from: ['acknowledgement_pending'] },
  request_clarification:   { from: ['nersa_review'] },
  submit_clarification:    { from: ['clarification_requested'] },
  accept_return:           { from: ['nersa_review', 'clarification_submitted'] },
  reject_return:           { from: ['nersa_review', 'clarification_submitted'] },
  declare_lapsed:          {
    from: [
      'return_triggered', 'data_assembly', 'internal_review', 'board_approval',
      'portal_submission', 'acknowledgement_pending', 'nersa_review',
      'clarification_requested', 'clarification_submitted',
    ],
  },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<LcrAction, LcrStatus> = {
  commence_data_assembly:  'data_assembly',
  conduct_internal_review: 'internal_review',
  obtain_board_approval:   'board_approval',
  submit_to_portal:        'portal_submission',
  confirm_receipt:         'acknowledgement_pending',
  begin_nersa_review:      'nersa_review',
  request_clarification:   'clarification_requested',
  submit_clarification:    'clarification_submitted',
  accept_return:           'return_accepted',
  reject_return:           'return_rejected',
  declare_lapsed:          'return_lapsed',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_TIERS: LcrCapacityTier[]     = ['small', 'medium', 'large', 'major', 'flagship'];
const MAJOR_PLUS: LcrCapacityTier[]    = ['major', 'flagship'];

export function crossesIntoRegulator(
  action: LcrAction,
  tier: LcrCapacityTier,
): boolean {
  switch (action) {
    case 'reject_return':         return ALL_TIERS.includes(tier);
    case 'declare_lapsed':        return MAJOR_PLUS.includes(tier);
    case 'request_clarification': return MAJOR_PLUS.includes(tier);
    default:                      return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: LcrCapacityTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
