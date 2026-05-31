// ─────────────────────────────────────────────────────────────────────────────
// Wave 142 — IPP Technical Query (TQ) Log
//
// PHASE E WAVE 12 OF N — IPP-PM profile-completeness wave.
//
// ISO 9001:2015 design communication requirements
// FIDIC-aligned EPC contracts
// CIDB best practice
//
// TQ = contractor → designer (DISTINCT from RFI which is contractor → PM/client).
// A TQ asks the DESIGNER about design intent, discrepancies, or technical solutions.
//
// Beats Aconex (static document workflow) by giving TQs a full designer-response
// lifecycle with construction-blocking priority and design-change crossover.
//
// 12-state lifecycle:
//   raised → logged → allocated → under_review → response_drafted →
//   response_approved → response_issued → acknowledged → closed (HARD terminal)
//
//   Branch states:
//   rejected (HARD terminal)
//   design_change_required (← response_drafted/response_approved)
//   escalated (← under_review/response_drafted → allocated on resolve)
//
// URGENT SLA polarity (HOURS) — construction-blocking queries need fastest response:
//   safety_critical: 24h (TIGHTEST — life safety)
//   construction_blocking: 48h
//   standard: 168h
//   information_only: 336h (loosest)
//
// W142 SIGNATURE crossings:
//   flag_design_change EVERY tier when floor_structural_safety
//     (structural integrity impact = always cross — regulator notification mandatory)
//   escalate_tq when floor_ie_notification_required (IE escalation always cross)
//   issue_response when floor_nersa_impact (NERSA permit condition impact)
//
// Write {admin, ipp_developer, support}.
// READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_tq → 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────────

export type TqStatus =
  | 'raised'
  | 'logged'
  | 'allocated'
  | 'under_review'
  | 'response_drafted'
  | 'response_approved'
  | 'response_issued'
  | 'acknowledged'
  | 'closed'
  | 'rejected'
  | 'design_change_required'
  | 'escalated';

export type TqAction =
  | 'log_tq'                  // raised → logged
  | 'allocate_to_designer'    // logged → allocated
  | 'commence_review'         // allocated → under_review
  | 'draft_response'          // under_review → response_drafted
  | 'approve_response'        // response_drafted → response_approved
  | 'issue_response'          // response_approved → response_issued
  | 'acknowledge_response'    // response_issued → acknowledged
  | 'close_tq'                // acknowledged → closed
  | 'reject_tq'               // logged/allocated/under_review → rejected
  | 'flag_design_change'      // response_drafted/response_approved → design_change_required (SIGNATURE: floor_structural_safety)
  | 'escalate_tq'             // under_review/response_drafted → escalated (SIGNATURE: floor_ie_notification_required)
  | 'resolve_escalation'      // escalated → allocated (back to designer with clarification)
  | 'flag_overdue';           // cron

export type QueryUrgency = 'safety_critical' | 'construction_blocking' | 'standard' | 'information_only';

// URGENT SLA — construction-blocking queries need fastest response
export const SLA_HOURS: Record<QueryUrgency, number> = {
  safety_critical: 24,          // URGENT tightest (life safety)
  construction_blocking: 48,    // blocking active work
  standard: 168,                // standard design query
  information_only: 336,        // loosest
};

export const HARD_TERMINALS: TqStatus[] = ['closed', 'rejected'];

export function isHardTerminal(status: TqStatus): boolean {
  return HARD_TERMINALS.includes(status);
}

export const TRANSITIONS: Record<TqAction, { from: TqStatus[]; to: TqStatus }> = {
  log_tq:               { from: ['raised'], to: 'logged' },
  allocate_to_designer: { from: ['logged'], to: 'allocated' },
  commence_review:      { from: ['allocated'], to: 'under_review' },
  draft_response:       { from: ['under_review'], to: 'response_drafted' },
  approve_response:     { from: ['response_drafted'], to: 'response_approved' },
  issue_response:       { from: ['response_approved'], to: 'response_issued' },
  acknowledge_response: { from: ['response_issued'], to: 'acknowledged' },
  close_tq:             { from: ['acknowledged'], to: 'closed' },
  reject_tq:            { from: ['logged', 'allocated', 'under_review'], to: 'rejected' },
  flag_design_change:   { from: ['response_drafted', 'response_approved'], to: 'design_change_required' },
  escalate_tq:          { from: ['under_review', 'response_drafted'], to: 'escalated' },
  resolve_escalation:   { from: ['escalated'], to: 'allocated' },
  // flag_overdue is cron-only — does not change status; placeholder keeps action consistent
  flag_overdue: {
    from: [
      'raised', 'logged', 'allocated', 'under_review', 'response_drafted',
      'response_approved', 'response_issued', 'design_change_required', 'escalated',
    ],
    to: 'raised', // placeholder — nextStatus returns current for flag_overdue
  },
};

export function nextStatus(current: TqStatus, action: TqAction): TqStatus | null {
  if (isHardTerminal(current)) return null;
  if (action === 'flag_overdue') return current; // cron-only: status unchanged
  const t = TRANSITIONS[action];
  if (!t || !t.from.includes(current)) return null;
  return t.to;
}

// ─── W142 SIGNATURE crossings ─────────────────────────────────────────────────
//
// flag_design_change EVERY tier when floor_structural_safety
//   (structural integrity impact = always cross — regulator notification mandatory)
// escalate_tq when floor_ie_notification_required
//   (IE escalation = always cross)
// issue_response when floor_nersa_impact
//   (NERSA permit condition impacted = always cross)
//
export function crossesIntoRegulator(
  action: TqAction,
  args: {
    floor_structural_safety?: boolean | number;
    floor_ie_notification_required?: boolean | number;
    floor_nersa_impact?: boolean | number;
  },
): boolean {
  if (action === 'flag_design_change' && args.floor_structural_safety) return true;
  if (action === 'escalate_tq' && args.floor_ie_notification_required) return true;
  if (action === 'issue_response' && args.floor_nersa_impact) return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(
  urgency: QueryUrgency,
  args: {
    floor_structural_safety?: boolean | number;
    floor_ie_notification_required?: boolean | number;
  },
): boolean {
  if (urgency === 'safety_critical' && args.floor_structural_safety) return true;
  if (args.floor_ie_notification_required && urgency !== 'information_only') return true;
  return false;
}

// ─── Status timestamp column mapping ─────────────────────────────────────────

export function statusTsCol(status: TqStatus): string {
  return `${status}_at`;
}

// ─── Event type mapping ───────────────────────────────────────────────────────

export function eventTypeFor(action: TqAction): string {
  return `ipp_tq.${action}`;
}

// ─── Label maps ───────────────────────────────────────────────────────────────

export const QUERY_URGENCY_LABELS: Record<QueryUrgency, string> = {
  safety_critical: 'Safety critical',
  construction_blocking: 'Construction blocking',
  standard: 'Standard',
  information_only: 'Information only',
};

export const DISCIPLINE_LABELS: Record<string, string> = {
  civil: 'Civil',
  structural: 'Structural',
  electrical: 'Electrical',
  mechanical: 'Mechanical',
  instrumentation: 'Instrumentation',
  process: 'Process',
  fire_protection: 'Fire protection',
  geotechnical: 'Geotechnical',
  environmental: 'Environmental',
};

export const RESPONSE_TYPE_LABELS: Record<string, string> = {
  clarification: 'Clarification',
  accept_proposed: 'Accept proposed solution',
  reject_proposed: 'Reject proposed solution',
  design_change_required: 'Design change required',
  refer_to_client: 'Refer to client',
};
