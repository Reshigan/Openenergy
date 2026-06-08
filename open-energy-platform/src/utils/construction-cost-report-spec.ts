// W231: Lender Construction-Period Monthly IE Cost-to-Complete Report
// LMA project finance + SARB Directive 7/2018 + Equator Principles IV
// INVERTED SLA: larger budget → longer review window (more IE scrutiny)

export type CcrStatus =
  | 'monitoring_period_open'
  | 'report_requested'
  | 'report_submitted'
  | 'ie_review'
  | 'ie_certified'
  | 'budget_compliant'
  | 'cost_overrun_risk'
  | 'equity_injection_required'
  | 'standby_drawdown'
  | 'resolved'
  | 'default_triggered'
  | 'cancelled';

export type CcrAction =
  | 'request_report'
  | 'submit_report'
  | 'commence_ie_review'
  | 'certify_report'
  | 'confirm_budget_compliance'
  | 'flag_cost_overrun_risk'
  | 'confirm_cost_overrun'
  | 'draw_standby_facility'
  | 'confirm_cure'
  | 'trigger_default'
  | 'cancel'
  | 'sla_breach';

export type BudgetTier = 'small' | 'medium' | 'large' | 'mega';

export function deriveBudgetTier(total_project_budget_zar: number): BudgetTier {
  if (total_project_budget_zar >= 20_000_000_000) return 'mega';
  if (total_project_budget_zar >= 5_000_000_000) return 'large';
  if (total_project_budget_zar >= 500_000_000) return 'medium';
  return 'small';
}

// INVERTED SLA windows (days) — larger project = longer review window
export function deriveSlaWindowDays(tier: BudgetTier): number {
  return { small: 5, medium: 7, large: 10, mega: 14 }[tier];
}

// Cure window for equity_injection_required / standby_drawdown states
export function deriveCureWindowDays(tier: BudgetTier): number {
  return { small: 30, medium: 45, large: 60, mega: 90 }[tier];
}

export function slaDeadlineFor(createdAt: string, tier: BudgetTier): string {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + deriveSlaWindowDays(tier));
  return d.toISOString();
}

export function cureDeadlineFor(triggeredAt: string, tier: BudgetTier): string {
  const d = new Date(triggeredAt);
  d.setDate(d.getDate() + deriveCureWindowDays(tier));
  return d.toISOString();
}

export const CCR_HARD_TERMINALS = new Set<CcrStatus>([
  'budget_compliant',
  'resolved',
  'default_triggered',
  'cancelled',
]);

export const CCR_VALID_TRANSITIONS: Record<CcrStatus, CcrAction[]> = {
  monitoring_period_open: ['request_report', 'cancel', 'sla_breach'],
  report_requested:       ['submit_report', 'cancel', 'sla_breach'],
  report_submitted:       ['commence_ie_review', 'cancel', 'sla_breach'],
  ie_review:              ['certify_report', 'sla_breach'],
  ie_certified:           ['confirm_budget_compliance', 'flag_cost_overrun_risk', 'sla_breach'],
  cost_overrun_risk:      ['confirm_cost_overrun', 'cancel'],
  equity_injection_required: ['draw_standby_facility', 'confirm_cure', 'trigger_default'],
  standby_drawdown:       ['confirm_cure', 'trigger_default'],
  budget_compliant:       [],
  resolved:               [],
  default_triggered:      [],
  cancelled:              [],
};

export const CCR_STATE_TRANSITIONS: Record<CcrAction, CcrStatus> = {
  request_report:             'report_requested',
  submit_report:              'report_submitted',
  commence_ie_review:         'ie_review',
  certify_report:             'ie_certified',
  confirm_budget_compliance:  'budget_compliant',
  flag_cost_overrun_risk:     'cost_overrun_risk',
  confirm_cost_overrun:       'equity_injection_required',
  draw_standby_facility:      'standby_drawdown',
  confirm_cure:               'resolved',
  trigger_default:            'default_triggered',
  cancel:                     'cancelled',
  sla_breach:                 'cost_overrun_risk',
};

// Lender/admin-only actions — IPP can only submit_report
export const CCR_LENDER_ONLY_ACTIONS = new Set<CcrAction>([
  'request_report',
  'commence_ie_review',
  'certify_report',
  'confirm_budget_compliance',
  'flag_cost_overrun_risk',
  'confirm_cost_overrun',
  'draw_standby_facility',
  'confirm_cure',
  'trigger_default',
]);

export function crossesCcrIntoRegulator(action: CcrAction, tier: BudgetTier): boolean {
  if (action === 'trigger_default') return true; // ALL tiers — SARB impairment notification
  if ((action === 'confirm_cost_overrun' || action === 'sla_breach') &&
      (tier === 'large' || tier === 'mega')) return true;
  return false;
}

export function ccrSlaBreachCrossesIntoRegulator(tier: BudgetTier): boolean {
  return tier === 'large' || tier === 'mega';
}

export type CcrEvent =
  | 'ccr_evt_opened'
  | 'ccr_evt_request_report'
  | 'ccr_evt_submit_report'
  | 'ccr_evt_commence_ie_review'
  | 'ccr_evt_certify_report'
  | 'ccr_evt_confirm_budget_compliance'
  | 'ccr_evt_flag_cost_overrun_risk'
  | 'ccr_evt_confirm_cost_overrun'
  | 'ccr_evt_draw_standby_facility'
  | 'ccr_evt_confirm_cure'
  | 'ccr_evt_trigger_default'
  | 'ccr_evt_cancel'
  | 'ccr_evt_sla_breach';
