// ═══════════════════════════════════════════════════════════════════════════
// Wave 162 — IPP Lender's Technical Advisor (LTA) Drawdown Certificate spec
//
// REIPPPP PPA Schedule 5 (Lender Requirements) + LMA construction-finance
// model (LTA/Independent Technical Monitor clause) + SARB Reg.23 project
// finance monitoring. The LTA certificate is the technical gate condition
// that unblocks each drawdown request (W21). An LTA is appointed by the
// lenders to independently certify construction progress and cost adequacy
// before each drawdown instalment is released.
//
// Mounted at /api/ipp-lta-certificate.
//
// INVERTED SLA: larger drawdown request → higher lender scrutiny → MORE time.
// WRITE: admin | ipp_developer
//
// Signature reportability:
//   refuse_certificate → significant + major + material (SARB large-exposure event)
//   approve_certificate→ major + material (large certified drawdown = SARB notification)
// ═══════════════════════════════════════════════════════════════════════════

export type LtaCertificateStatus =
  | 'certificate_requested'
  | 'site_inspection_in_progress'
  | 'progress_assessment'
  | 'draft_certificate_issued'
  | 'borrower_comments_submitted'
  | 'final_certificate_in_review'
  | 'certificate_approved'     // TERMINAL — feeds W21 drawdown
  | 'certificate_qualified'    // approved with conditions
  | 'conditions_resolved'      // TERMINAL — all qualifications cleared
  | 'certificate_refused'      // TERMINAL — drawdown blocked
  | 'appeal_raised'            // IPP disputes LTA findings
  | 'appeal_determined';       // TERMINAL

export type LtaCertificateAction =
  | 'schedule_site_inspection'
  | 'complete_site_inspection'
  | 'issue_draft_certificate'
  | 'submit_borrower_comments'
  | 'issue_final_certificate'
  | 'approve_certificate'
  | 'qualify_certificate'
  | 'resolve_conditions'
  | 'refuse_certificate'
  | 'raise_appeal'
  | 'determine_appeal';

export type DrawdownTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

export type CertificateCategory =
  | 'construction_progress'
  | 'completion_certificate'
  | 'cost_to_complete'
  | 'change_order_approval'
  | 'commissioning_readiness';

// ─── Tier derivation (keyed on drawdown amount ZAR) ──────────────────────

export function deriveDrawdownTier(drawdown_amount_zar: number): DrawdownTier {
  if (drawdown_amount_zar < 50_000_000)    return 'minor';
  if (drawdown_amount_zar < 250_000_000)   return 'moderate';
  if (drawdown_amount_zar < 1_000_000_000) return 'significant';
  if (drawdown_amount_zar < 5_000_000_000) return 'major';
  return 'material';
}

// ─── INVERTED SLA (larger drawdown → more scrutiny → more time) ──────────

export const SLA_DAYS: Record<DrawdownTier, number> = {
  minor:       14,
  moderate:    21,
  significant: 30,
  major:       45,
  material:    60,
};

// ─── Hard terminals ─────────────────────────────────────────────────────────

export const HARD_TERMINALS = new Set<LtaCertificateStatus>([
  'certificate_approved',
  'conditions_resolved',
  'certificate_refused',
  'appeal_determined',
]);

// ─── Valid transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<
  LtaCertificateAction,
  { from: LtaCertificateStatus[] }
> = {
  schedule_site_inspection:   { from: ['certificate_requested'] },
  complete_site_inspection:   { from: ['site_inspection_in_progress'] },
  issue_draft_certificate:    { from: ['progress_assessment'] },
  submit_borrower_comments:   { from: ['draft_certificate_issued'] },
  issue_final_certificate:    { from: ['draft_certificate_issued', 'borrower_comments_submitted'] },
  approve_certificate:        { from: ['final_certificate_in_review'] },
  qualify_certificate:        { from: ['final_certificate_in_review'] },
  resolve_conditions:         { from: ['certificate_qualified'] },
  refuse_certificate:         { from: ['final_certificate_in_review', 'certificate_qualified'] },
  raise_appeal:               { from: ['certificate_refused'] },
  determine_appeal:           { from: ['appeal_raised'] },
};

// ─── Regulator crossing rules ────────────────────────────────────────────────

const SIGNIFICANT_PLUS: DrawdownTier[] = ['significant', 'major', 'material'];
const MAJOR_PLUS: DrawdownTier[] = ['major', 'material'];

export function crossesIntoRegulator(
  action: LtaCertificateAction,
  tier: DrawdownTier,
): boolean {
  switch (action) {
    case 'refuse_certificate':  return SIGNIFICANT_PLUS.includes(tier);
    case 'approve_certificate': return MAJOR_PLUS.includes(tier);
    case 'determine_appeal':    return SIGNIFICANT_PLUS.includes(tier);
    default:                    return false;
  }
}

export function slaBreachCrossesIntoRegulator(tier: DrawdownTier): boolean {
  return MAJOR_PLUS.includes(tier);
}
