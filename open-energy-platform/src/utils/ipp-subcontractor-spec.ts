// ─────────────────────────────────────────────────────────────────────────
// Wave 140 - IPP Subcontractor Management.
//
// PHASE E WAVE 10 OF N — IPP-PM profile-completeness wave.
//
// OHSA SA Construction Regulations 2014 Reg.6 (principal contractor responsibilities)
// ISO 45001:2018 contractor management
// REIPPPP ED local content requirements (W27)
// Equator Principles EP4 supply chain ESG
//
// Beats Oracle Aconex (documents only) and Procore Subcontractors
// (no performance scoring or OHSA lifecycle) with a full P6 chain tracking
// performance scores, BEE levels, REIPPPP ED metrics, and safety compliance.
//
// 12-state lifecycle:
//   registered → pre_qualification → inducted → mobilized →
//   performing → under_review → good_standing → work_complete →
//   demobilized → closed (HARD terminal)
//
//   Suspension branch:
//   any non-terminal → suspended
//   suspended → mobilized (reinstate) OR terminated (HARD terminal)
//
// URGENT SLA polarity (HOURS) — critical trades fastest:
//   critical_trade:  24h  (URGENT tightest — HV electrical, structural — life safety)
//   specialist:      48h  (instrumentation, commissioning specialists)
//   general_trade:   96h  (civil, mechanical, scaffolding)
//   labor_only:     168h  (general labor, cleaning — loosest)
//
// W140 SIGNATURE crossings:
//   terminate_subcontractor EVERY tier when termination_cause='safety_violation' (OHSA mandatory)
//   suspend_subcontractor when floor_ohsa_notification (serious safety incident)
//   close_subcontract when floor_lender_escrow_release (lender must release final payment)
//   SLA breach crosses when critical_trade + floor_ie_oversight
//   SLA breach crosses when floor_ohsa_notification (any tier)
//
// Write {admin, ipp_developer, support}.
// READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_subcontractor → 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────

export type SubcontractorStatus =
  | 'registered'
  | 'pre_qualification'
  | 'inducted'
  | 'mobilized'
  | 'performing'
  | 'under_review'
  | 'good_standing'
  | 'work_complete'
  | 'demobilized'
  | 'closed'
  | 'suspended'
  | 'terminated';

export type SubcontractorAction =
  | 'start_prequalification'    // registered → pre_qualification
  | 'complete_induction'        // pre_qualification → inducted
  | 'mobilize'                  // inducted → mobilized
  | 'commence_work'             // mobilized → performing
  | 'trigger_review'            // performing → under_review
  | 'confirm_good_standing'     // under_review → good_standing
  | 'return_to_performing'      // good_standing → performing (continue work after review)
  | 'complete_work'             // performing/good_standing → work_complete
  | 'demobilize'                // work_complete → demobilized
  | 'close_subcontract'         // demobilized → closed
  | 'suspend_subcontractor'     // any non-terminal → suspended (SIGNATURE when floor_ohsa_notification)
  | 'terminate_subcontractor'   // suspended/performing/under_review/good_standing → terminated
  | 'reinstate_subcontractor'   // suspended → mobilized
  | 'flag_overdue';             // cron only — does not change status

export type SubcontractorTier = 'critical_trade' | 'specialist' | 'general_trade' | 'labor_only';

// URGENT SLA — critical trades (HV electrical, structural) need fastest HSE/performance review cycles
export const SLA_HOURS: Record<SubcontractorTier, number> = {
  critical_trade: 24,    // URGENT tightest (HV electrical, structural — life safety)
  specialist: 48,        // instrumentation, commissioning specialists
  general_trade: 96,     // civil, mechanical, scaffolding
  labor_only: 168,       // general labor, cleaning (loosest)
};

export const HARD_TERMINALS: SubcontractorStatus[] = ['closed', 'terminated'];

export function isHardTerminal(status: SubcontractorStatus): boolean {
  return HARD_TERMINALS.includes(status);
}

export const TRANSITIONS: Record<SubcontractorAction, { from: SubcontractorStatus[]; to: SubcontractorStatus }> = {
  start_prequalification: { from: ['registered'], to: 'pre_qualification' },
  complete_induction:     { from: ['pre_qualification'], to: 'inducted' },
  mobilize:               { from: ['inducted'], to: 'mobilized' },
  commence_work:          { from: ['mobilized'], to: 'performing' },
  trigger_review:         { from: ['performing'], to: 'under_review' },
  confirm_good_standing:  { from: ['under_review'], to: 'good_standing' },
  return_to_performing:   { from: ['good_standing'], to: 'performing' },
  complete_work:          { from: ['performing', 'good_standing'], to: 'work_complete' },
  demobilize:             { from: ['work_complete'], to: 'demobilized' },
  close_subcontract:      { from: ['demobilized'], to: 'closed' },
  suspend_subcontractor:  {
    from: [
      'registered', 'pre_qualification', 'inducted', 'mobilized',
      'performing', 'under_review', 'good_standing',
    ],
    to: 'suspended',
  },
  terminate_subcontractor: { from: ['suspended', 'performing', 'under_review', 'good_standing'], to: 'terminated' },
  reinstate_subcontractor: { from: ['suspended'], to: 'mobilized' },
  // flag_overdue is cron-only — does not change status; placeholder keeps action consistent
  flag_overdue: {
    from: [
      'registered', 'pre_qualification', 'inducted', 'mobilized',
      'performing', 'under_review', 'work_complete', 'demobilized',
    ],
    to: 'registered', // placeholder — nextStatus returns current for flag_overdue
  },
};

export function nextStatus(current: SubcontractorStatus, action: SubcontractorAction): SubcontractorStatus | null {
  if (isHardTerminal(current)) return null;
  if (action === 'flag_overdue') return current; // cron-only: status unchanged
  const t = TRANSITIONS[action];
  if (!t || !t.from.includes(current)) return null;
  return t.to;
}

// ─── W140 SIGNATURE crossings ────────────────────────────────────────────────
//
// terminate_subcontractor EVERY tier when termination_cause='safety_violation'
//   (OHSA mandatory notification — principal contractor liability)
// suspend_subcontractor when floor_ohsa_notification
//   (serious safety incident → OHSA Construction Regs.6 mandatory notification)
// close_subcontract when floor_lender_escrow_release
//   (lender must approve final payment release → Equator EP4 supply-chain audit)
//
export function crossesIntoRegulator(
  action: SubcontractorAction,
  args: {
    termination_cause?: string;
    floor_ohsa_notification?: boolean | number;
    floor_lender_escrow_release?: boolean | number;
  },
): boolean {
  if (action === 'terminate_subcontractor' && args.termination_cause === 'safety_violation') return true;
  if (action === 'suspend_subcontractor' && args.floor_ohsa_notification) return true;
  if (action === 'close_subcontract' && args.floor_lender_escrow_release) return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(
  tier: SubcontractorTier,
  args: {
    floor_ohsa_notification?: boolean | number;
    floor_ie_oversight?: boolean | number;
  },
): boolean {
  if (tier === 'critical_trade' && args.floor_ie_oversight) return true;
  if (args.floor_ohsa_notification) return true;
  return false;
}

// ─── Status timestamp column mapping ─────────────────────────────────────────

export function statusTsCol(status: SubcontractorStatus): string {
  return `${status}_at`;
}

// ─── Event type mapping ───────────────────────────────────────────────────────

export function eventTypeFor(action: SubcontractorAction): string {
  return `ipp_subcontractor.${action}`;
}

// ─── SLA helpers ──────────────────────────────────────────────────────────────

export function slaDeadlineFor(tier: SubcontractorTier, from: Date): Date {
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

export const SUBCONTRACTOR_TIER_LABELS: Record<SubcontractorTier, string> = {
  critical_trade: 'Critical trade',
  specialist: 'Specialist',
  general_trade: 'General trade',
  labor_only: 'Labour supply',
};

export const TRADE_CATEGORY_LABELS: Record<string, string> = {
  structural: 'Structural',
  electrical_hv: 'Electrical (HV)',
  electrical_lv: 'Electrical (LV)',
  mechanical: 'Mechanical',
  civil: 'Civil',
  instrumentation: 'Instrumentation',
  scaffolding: 'Scaffolding',
  demolition: 'Demolition',
  commissioning_specialist: 'Commissioning specialist',
  labor_supply: 'Labour supply',
  cleaning: 'Cleaning',
  general: 'General',
};

export const TERMINATION_CAUSE_LABELS: Record<string, string> = {
  safety_violation: 'Safety violation (OHSA)',
  performance: 'Performance failure',
  insolvency: 'Insolvency',
  mutual_agreement: 'Mutual agreement',
  force_majeure: 'Force majeure',
};
