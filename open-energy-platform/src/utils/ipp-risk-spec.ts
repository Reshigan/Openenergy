// ─────────────────────────────────────────────────────────────────────────
// Wave 133 - IPP Risk Register & Treatment Chain.
//
// PHASE E WAVE 3 OF N — IPP-PM profile-completeness wave.
//
// PMBOK 7 Risk Management (Sections 11.1-11.7) + ISO 31000:2018 +
// IEC 31010:2019 risk assessment techniques + REIPPPP Schedule 2 risk
// allocation matrix + Equator Principles IV Action Plan risk management +
// World Bank IFC Performance Standard 1 (risk assessment).
//
// Beats: Oracle Primavera Risk Analysis (P-1004), Active Risk Manager (ARM),
// Safran Risk, Accenture Risk Management, Gallagher Risk Intelligence.
//
// 11-state forward path + 4 branch states (= 15 total chain states):
//   identified -> assessed -> quantified -> response_planned ->
//     owner_assigned -> monitoring -> triggered -> responding ->
//     outcome_recorded -> closed -> archived (HARD)
//   any non-terminal -> escalate_risk -> escalated (SOFT + crossing)
//   any non-terminal -> defer_risk -> deferred (SOFT)
//   any non-terminal -> cancel_risk -> cancelled (HARD)
//   cron -> flag_overdue -> overdue_flagged (status unchanged)
//
// INVERTED SLA polarity (HOURS) — higher impact = MORE time for treatment:
//   low_impact      168h  (7d)
//   medium_impact   336h  (14d)
//   high_impact     720h  (30d)
//   critical_impact 1440h (60d)
//   catastrophic    2160h (90d)
//
// SIGNATURE W133 regulator crossings:
//   escalate_risk EVERY tier when is_safety AND risk_tier IN ('critical_impact','catastrophic')
//     (OHSA s24 + ERA s35 — critical/catastrophic safety risks are universally reportable)
//   flag_triggered catastrophic EVERY tier (universal hard line)
//   close_risk EVERY tier when is_nersa_notifiable
//
// 3-step authority: risk_owner → risk_manager → risk_director
//
// Write {admin, ipp_developer}. READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_risk -> 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────

export type RiskStatus =
  | 'identified'
  | 'assessed'
  | 'quantified'
  | 'response_planned'
  | 'owner_assigned'
  | 'monitoring'
  | 'triggered'
  | 'responding'
  | 'outcome_recorded'
  | 'closed'
  | 'archived'
  | 'escalated'
  | 'deferred'
  | 'cancelled'
  | 'overdue_flagged';

export type RiskAction =
  | 'identify_risk'
  | 'assess_risk'
  | 'quantify_risk'
  | 'plan_response'
  | 'assign_owner'
  | 'activate_monitoring'
  | 'flag_triggered'
  | 'start_response'
  | 'record_outcome'
  | 'close_risk'
  | 'archive_risk'
  | 'escalate_risk'
  | 'defer_risk'
  | 'reactivate_risk'
  | 'cancel_risk'
  | 'flag_overdue';

export type RiskTier =
  | 'low_impact'
  | 'medium_impact'
  | 'high_impact'
  | 'critical_impact'
  | 'catastrophic';

export type RiskCategory =
  | 'construction'
  | 'technical'
  | 'financial'
  | 'regulatory'
  | 'environmental'
  | 'safety'
  | 'geopolitical'
  | 'commercial'
  | 'force_majeure'
  | 'legal';

export type RiskParty = 'risk_owner' | 'risk_manager' | 'risk_director';

export type RiskEvent =
  | 'ipp_risk.identified'
  | 'ipp_risk.assessed'
  | 'ipp_risk.quantified'
  | 'ipp_risk.response_planned'
  | 'ipp_risk.owner_assigned'
  | 'ipp_risk.monitoring'
  | 'ipp_risk.triggered'
  | 'ipp_risk.responding'
  | 'ipp_risk.outcome_recorded'
  | 'ipp_risk.closed'
  | 'ipp_risk.archived'
  | 'ipp_risk.escalated'
  | 'ipp_risk.deferred'
  | 'ipp_risk.reactivated'
  | 'ipp_risk.cancelled'
  | 'ipp_risk.sla_breached';

// ─── SLA hours (INVERTED polarity: catastrophic = 2160h MOST time) ────────

export const SLA_HOURS: Record<RiskTier, number> = {
  low_impact:      168,
  medium_impact:   336,
  high_impact:     720,
  critical_impact: 1440,
  catastrophic:    2160,
};

export function slaHoursFor(tier: RiskTier): number {
  return SLA_HOURS[tier] ?? 720;
}

export function slaDeadlineFor(tier: RiskTier, from: Date): Date {
  const d = new Date(from);
  d.setTime(d.getTime() + slaHoursFor(tier) * 3600 * 1000);
  return d;
}

export function slaHoursRemaining(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return Math.round(ms / 3600000);
}

// ─── Risk score tier derivation (probability × impact 1-25) ─────────────

export function deriveTierFromScore(score: number): RiskTier {
  if (score >= 20) return 'catastrophic';
  if (score >= 15) return 'critical_impact';
  if (score >= 9) return 'high_impact';
  if (score >= 4) return 'medium_impact';
  return 'low_impact';
}

// ─── State machine ────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<RiskStatus>(['archived', 'cancelled']);
const ALL_NON_TERMINAL: RiskStatus[] = [
  'identified','assessed','quantified','response_planned','owner_assigned',
  'monitoring','triggered','responding','outcome_recorded','closed',
  'escalated','deferred','overdue_flagged',
];

export const TRANSITIONS: Record<RiskAction, { from: RiskStatus[]; to: RiskStatus }> = {
  identify_risk:        { from: ['identified'], to: 'identified' },
  assess_risk:          { from: ['identified','overdue_flagged'], to: 'assessed' },
  quantify_risk:        { from: ['assessed'], to: 'quantified' },
  plan_response:        { from: ['quantified'], to: 'response_planned' },
  assign_owner:         { from: ['response_planned','escalated'], to: 'owner_assigned' },
  activate_monitoring:  { from: ['owner_assigned'], to: 'monitoring' },
  flag_triggered:       { from: ['monitoring','owner_assigned'], to: 'triggered' },
  start_response:       { from: ['triggered'], to: 'responding' },
  record_outcome:       { from: ['responding'], to: 'outcome_recorded' },
  close_risk:           { from: ['outcome_recorded'], to: 'closed' },
  archive_risk:         { from: ['closed'], to: 'archived' },
  escalate_risk:        { from: ALL_NON_TERMINAL, to: 'escalated' },
  defer_risk:           { from: ['identified','assessed','quantified','response_planned','owner_assigned'], to: 'deferred' },
  reactivate_risk:      { from: ['deferred'], to: 'monitoring' },
  cancel_risk:          { from: ALL_NON_TERMINAL, to: 'cancelled' },
  flag_overdue:         { from: ALL_NON_TERMINAL, to: 'overdue_flagged' },
};

export function isHardTerminal(status: RiskStatus): boolean {
  return HARD_TERMINALS.has(status);
}

export function isTerminal(status: RiskStatus): boolean {
  return status === 'archived' || status === 'cancelled';
}

export function nextStatus(current: RiskStatus, action: RiskAction): RiskStatus | null {
  if (isHardTerminal(current)) return null;
  if (action === 'identify_risk' && current !== 'identified') return null;
  if (action === 'flag_overdue') return current; // cron-only: status unchanged
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

// ─── Regulator crossings (SIGNATURE + secondary) ─────────────────────────

export interface RiskCrossArgs {
  risk_tier?: RiskTier | null;
  risk_category?: string | null;
  is_safety?: number | boolean | null;
  is_regulatory?: number | boolean | null;
  is_nersa_notifiable?: number | boolean | null;
}

export function crossesIntoRegulator(action: RiskAction, args: RiskCrossArgs): boolean {
  const safety = !!(args.is_safety || args.risk_category === 'safety');
  const isCriticalOrCatastrophic = args.risk_tier === 'critical_impact' || args.risk_tier === 'catastrophic';
  const nersa = !!(args.is_nersa_notifiable);

  // W133 SIGNATURE: escalate_risk EVERY tier when safety AND (critical|catastrophic)
  if (action === 'escalate_risk' && safety && isCriticalOrCatastrophic) return true;

  // flag_triggered catastrophic EVERY tier (catastrophic materialisation = universal hard line)
  if (action === 'flag_triggered' && args.risk_tier === 'catastrophic') return true;

  // close_risk EVERY tier when nersa_notifiable
  if (action === 'close_risk' && nersa) return true;

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: RiskTier, args: RiskCrossArgs): boolean {
  const safety = !!(args.is_safety || args.risk_category === 'safety');
  const regulatory = !!(args.is_regulatory || args.risk_category === 'regulatory');
  // Critical/catastrophic safety or regulatory SLA breaches cross
  if ((tier === 'critical_impact' || tier === 'catastrophic') && (safety || regulatory)) return true;
  return false;
}

export function isReportable(action: RiskAction, args: RiskCrossArgs): boolean {
  return crossesIntoRegulator(action, args);
}

// ─── Party / authority ────────────────────────────────────────────────────

export function partyForAction(action: RiskAction): RiskParty {
  switch (action) {
    case 'identify_risk':
    case 'assess_risk':
    case 'quantify_risk':
    case 'flag_triggered':
    case 'start_response':
    case 'reactivate_risk':
      return 'risk_owner';
    case 'plan_response':
    case 'assign_owner':
    case 'activate_monitoring':
    case 'record_outcome':
    case 'defer_risk':
    case 'cancel_risk':
      return 'risk_manager';
    case 'close_risk':
    case 'archive_risk':
    case 'escalate_risk':
      return 'risk_director';
    default:
      return 'risk_manager';
  }
}

// ─── Event type mapping ───────────────────────────────────────────────────

export function eventTypeFor(action: RiskAction): RiskEvent {
  const map: Record<RiskAction, RiskEvent> = {
    identify_risk:       'ipp_risk.identified',
    assess_risk:         'ipp_risk.assessed',
    quantify_risk:       'ipp_risk.quantified',
    plan_response:       'ipp_risk.response_planned',
    assign_owner:        'ipp_risk.owner_assigned',
    activate_monitoring: 'ipp_risk.monitoring',
    flag_triggered:      'ipp_risk.triggered',
    start_response:      'ipp_risk.responding',
    record_outcome:      'ipp_risk.outcome_recorded',
    close_risk:          'ipp_risk.closed',
    archive_risk:        'ipp_risk.archived',
    escalate_risk:       'ipp_risk.escalated',
    defer_risk:          'ipp_risk.deferred',
    reactivate_risk:     'ipp_risk.reactivated',
    cancel_risk:         'ipp_risk.cancelled',
    flag_overdue:        'ipp_risk.sla_breached',
  };
  return map[action];
}

// ─── Status timestamp column mapping ─────────────────────────────────────

export function statusTsCol(status: RiskStatus): string {
  const map: Record<RiskStatus, string> = {
    identified:       'identified_at',
    assessed:         'assessed_at',
    quantified:       'quantified_at',
    response_planned: 'response_planned_at',
    owner_assigned:   'owner_assigned_at',
    monitoring:       'monitoring_at',
    triggered:        'triggered_at',
    responding:       'responding_at',
    outcome_recorded: 'outcome_recorded_at',
    closed:           'closed_at',
    archived:         'archived_at',
    escalated:        'escalated_at',
    deferred:         'deferred_at',
    cancelled:        'cancelled_at',
    overdue_flagged:  'overdue_flagged_at',
  };
  return map[status] ?? 'updated_at';
}

// ─── Helpers ─────────────────────────────────────────────────────────────

export function urgencyBand(tier: RiskTier): string {
  switch (tier) {
    case 'catastrophic':    return 'catastrophic';
    case 'critical_impact': return 'critical';
    case 'high_impact':     return 'high';
    case 'medium_impact':   return 'medium';
    case 'low_impact':      return 'low';
  }
}

export function timeInStateHours(stateAt: string | null, now: Date): number | null {
  if (!stateAt) return null;
  return Math.round((now.getTime() - new Date(stateAt).getTime()) / 3600000);
}

export const TIER_LABELS: Record<RiskTier, string> = {
  low_impact:      'Low',
  medium_impact:   'Medium',
  high_impact:     'High',
  critical_impact: 'Critical',
  catastrophic:    'Catastrophic',
};

export const TIER_SLA_LABEL: Record<RiskTier, string> = {
  low_impact:      '7d',
  medium_impact:   '14d',
  high_impact:     '30d',
  critical_impact: '60d',
  catastrophic:    '90d',
};

export const CATEGORY_LABELS: Record<RiskCategory, string> = {
  construction:  'Construction',
  technical:     'Technical',
  financial:     'Financial',
  regulatory:    'Regulatory',
  environmental: 'Environmental',
  safety:        'Safety',
  geopolitical:  'Geopolitical',
  commercial:    'Commercial',
  force_majeure: 'Force Majeure',
  legal:         'Legal',
};

export const RESPONSE_STRATEGY_LABELS = {
  avoid:    'Avoid',
  mitigate: 'Mitigate',
  transfer: 'Transfer',
  accept:   'Accept',
  escalate: 'Escalate',
} as const;
