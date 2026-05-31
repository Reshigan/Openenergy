// ─────────────────────────────────────────────────────────────────────────────
// Wave 141 — IPP Progress Claims & Payment Certificates
//
// PHASE E WAVE 11 OF N — IPP-PM profile-completeness wave.
//
// JBCC (Joint Building Contracts Committee) — SA standard construction contract
// NEC4 payment assessment process
// REIPPPP payment milestones
// Equator Principles EP4 disbursement certification
//
// This is the contractor-side billing chain; distinct from W21 (Lender Drawdown)
// which is the developer-to-lender side.
//
// Beats Oracle Aconex (payment as document workflow) by giving the claim a full
// P6 lifecycle with QS/PM/IE certification gates and lender notification crossings.
//
// 12-state lifecycle:
//   submitted → quantity_survey_review → pm_review → engineer_certified →
//   approved → payment_processed → closed (HARD terminal)
//
//   Branch states:
//   disputed (← pm_review / engineer_certified, → pm_review on resolve)
//   suspended (← approved / pm_review, → pm_review on reinstate)
//   rejected (HARD terminal)
//   partial_payment (← engineer_certified / pm_review, → closed)
//   final_account (← closed, HARD terminal — EVERY tier signature)
//
// INVERTED SLA polarity (HOURS) — larger claims get MORE time:
//   major (>R10m):      720h  (30 days — thorough IE/lender review)
//   significant (R1m–R10m): 336h  (14 days)
//   standard (R100k–R1m):   168h  (7 days)
//   minor (<R100k):          72h  (3 days — INVERTED tightest)
//
// W141 SIGNATURE crossings:
//   certify_by_engineer EVERY tier when floor_ie_milestone_payment
//     (IE milestone = always cross — lender notification mandatory)
//   record_final_account EVERY tier (final settlement always notified to lenders)
//   approve_payment when floor_lender_certification_required
//
// Write {admin, ipp_developer}.
// READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_progress_claim → 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────────

export type ClaimStatus =
  | 'submitted'
  | 'quantity_survey_review'
  | 'pm_review'
  | 'engineer_certified'
  | 'approved'
  | 'payment_processed'
  | 'closed'
  | 'disputed'
  | 'suspended'
  | 'rejected'
  | 'partial_payment'
  | 'final_account';

export type ClaimAction =
  | 'commence_qs_review'      // submitted → quantity_survey_review
  | 'complete_qs_review'      // quantity_survey_review → pm_review
  | 'certify_by_engineer'     // pm_review → engineer_certified (SIGNATURE: floor_ie_milestone_payment)
  | 'approve_payment'         // engineer_certified → approved
  | 'process_payment'         // approved → payment_processed
  | 'close_claim'             // payment_processed / partial_payment → closed
  | 'dispute_claim'           // pm_review / engineer_certified → disputed
  | 'resolve_dispute'         // disputed → pm_review (back for re-assessment)
  | 'suspend_payment'         // approved / pm_review → suspended
  | 'reinstate_payment'       // suspended → pm_review
  | 'reject_claim'            // quantity_survey_review / pm_review → rejected
  | 'approve_partial'         // engineer_certified / pm_review → partial_payment
  | 'record_final_account'    // closed → final_account (SIGNATURE: EVERY tier)
  | 'flag_overdue';           // cron

export type ClaimTier = 'major' | 'significant' | 'standard' | 'minor';

// INVERTED SLA — larger claims get MORE time for thorough assessment
export const SLA_HOURS: Record<ClaimTier, number> = {
  major: 720,        // >R10m — most time (30 days — thorough IE/lender review)
  significant: 336,  // R1m–R10m — 14 days
  standard: 168,     // R100k–R1m — 7 days
  minor: 72,         // <R100k — 3 days (INVERTED — least time)
};

export const HARD_TERMINALS: ClaimStatus[] = ['closed', 'rejected', 'final_account'];

export function isHardTerminal(status: ClaimStatus): boolean {
  return HARD_TERMINALS.includes(status);
}

export const TRANSITIONS: Record<ClaimAction, { from: ClaimStatus[]; to: ClaimStatus }> = {
  commence_qs_review:   { from: ['submitted'], to: 'quantity_survey_review' },
  complete_qs_review:   { from: ['quantity_survey_review'], to: 'pm_review' },
  certify_by_engineer:  { from: ['pm_review'], to: 'engineer_certified' },
  approve_payment:      { from: ['engineer_certified'], to: 'approved' },
  process_payment:      { from: ['approved'], to: 'payment_processed' },
  close_claim:          { from: ['payment_processed', 'partial_payment'], to: 'closed' },
  dispute_claim:        { from: ['pm_review', 'engineer_certified'], to: 'disputed' },
  resolve_dispute:      { from: ['disputed'], to: 'pm_review' },
  suspend_payment:      { from: ['approved', 'pm_review'], to: 'suspended' },
  reinstate_payment:    { from: ['suspended'], to: 'pm_review' },
  reject_claim:         { from: ['quantity_survey_review', 'pm_review'], to: 'rejected' },
  approve_partial:      { from: ['engineer_certified', 'pm_review'], to: 'partial_payment' },
  record_final_account: { from: ['closed'], to: 'final_account' },
  // flag_overdue is cron-only — does not change status; placeholder keeps action consistent
  flag_overdue: {
    from: [
      'submitted', 'quantity_survey_review', 'pm_review', 'engineer_certified',
      'approved', 'disputed', 'suspended',
    ],
    to: 'submitted', // placeholder — nextStatus returns current for flag_overdue
  },
};

export function nextStatus(current: ClaimStatus, action: ClaimAction): ClaimStatus | null {
  // Special case: record_final_account is allowed FROM closed (closed is a soft terminal
  // for this action only — the final account is the conclusive settlement record).
  if (current === 'closed' && action === 'record_final_account') return 'final_account';
  if (isHardTerminal(current)) return null;
  if (action === 'flag_overdue') return current; // cron-only: status unchanged
  const t = TRANSITIONS[action];
  if (!t || !t.from.includes(current)) return null;
  return t.to;
}

// ─── W141 SIGNATURE crossings ─────────────────────────────────────────────────
//
// certify_by_engineer EVERY tier when floor_ie_milestone_payment
//   (IE milestone completion = always cross — lender notification mandatory)
// record_final_account EVERY tier
//   (final account = every lender always notified)
// approve_payment when floor_lender_certification_required
//   (lender must be notified before release of lender-cert-required payment)
//
export function crossesIntoRegulator(
  action: ClaimAction,
  args: {
    floor_ie_milestone_payment?: boolean | number;
    floor_lender_certification_required?: boolean | number;
  },
): boolean {
  if (action === 'certify_by_engineer' && args.floor_ie_milestone_payment) return true;
  if (action === 'record_final_account') return true; // EVERY tier
  if (action === 'approve_payment' && args.floor_lender_certification_required) return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(
  tier: ClaimTier,
  args: {
    floor_ie_milestone_payment?: boolean | number;
    floor_lender_certification_required?: boolean | number;
  },
): boolean {
  if (args.floor_ie_milestone_payment && (tier === 'major' || tier === 'significant')) return true;
  return false;
}

// ─── Status timestamp column mapping ─────────────────────────────────────────

export function statusTsCol(status: ClaimStatus): string {
  return `${status}_at`;
}

// ─── Event type mapping ───────────────────────────────────────────────────────

export function eventTypeFor(action: ClaimAction): string {
  return `ipp_progress_claim.${action}`;
}

// ─── SLA helpers ──────────────────────────────────────────────────────────────

export function slaDeadlineFor(tier: ClaimTier, from: Date): Date {
  const d = new Date(from);
  d.setTime(d.getTime() + SLA_HOURS[tier] * 3600 * 1000);
  return d;
}

export function slaHoursRemaining(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return Math.round(ms / 3600000);
}

// ─── Label maps ───────────────────────────────────────────────────────────────

export const CLAIM_TIER_LABELS: Record<ClaimTier, string> = {
  major: 'Major (>R10m)',
  significant: 'Significant (R1m–R10m)',
  standard: 'Standard (R100k–R1m)',
  minor: 'Minor (<R100k)',
};

export const CLAIM_TYPE_LABELS: Record<string, string> = {
  interim: 'Interim payment',
  milestone: 'Milestone payment',
  final: 'Final account',
  variation: 'Variation order',
  daywork: 'Daywork',
};

export function formatZar(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `R ${amount.toLocaleString('en-ZA')}`;
}
