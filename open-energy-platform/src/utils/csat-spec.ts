// ═══════════════════════════════════════════════════════════════════════════════
// W208 — Support SLA Escalation & Customer Satisfaction (CSAT) Lifecycle
// ITIL 4 CSM + ISO 20000-1 CSI (Continual Service Improvement)
// ═══════════════════════════════════════════════════════════════════════════════

export type CsatStatus =
  | 'survey_pending'      // ticket resolved; CSAT survey not yet sent
  | 'survey_sent'         // survey dispatched to customer
  | 'survey_completed'    // customer responded
  | 'score_analysis'      // team reviewing low scores
  | 'follow_up_sent'      // follow-up dispatched for low scores
  | 'follow_up_received'  // customer responded to follow-up
  | 'escalated'           // escalated to management (very low CSAT)
  | 'closed_satisfied'    // good CSAT; terminal +
  | 'closed_escalated'    // escalation resolved; terminal
  | 'no_response';        // survey expired; no response; terminal

export type CsatAction =
  | 'send_survey'
  | 'record_response'
  | 'analyse_score'
  | 'send_follow_up'
  | 'record_follow_up_response'
  | 'escalate_to_management'
  | 'close_satisfied'
  | 'close_escalated'
  | 'expire_no_response'
  | 'sla_breach';

export type SupportTier = 'p1_critical' | 'p2_high' | 'p3_medium' | 'p4_low';

// URGENT SLA: higher priority tickets get SHORTER survey windows
export function deriveCsatSla(tier: SupportTier): number {
  const HOURS: Record<SupportTier, number> = {
    p1_critical: 24,
    p2_high:     48,
    p3_medium:   72,
    p4_low:     120,
  };
  return HOURS[tier] ?? 48;
}

export const CSAT_HARD_TERMINALS = new Set<CsatStatus>([
  'closed_satisfied', 'closed_escalated', 'no_response',
]);

export const CSAT_VALID_TRANSITIONS: Record<CsatStatus, CsatAction[]> = {
  survey_pending:        ['send_survey', 'expire_no_response', 'sla_breach'],
  survey_sent:           ['record_response', 'expire_no_response', 'sla_breach'],
  survey_completed:      ['analyse_score', 'close_satisfied', 'sla_breach'],
  score_analysis:        ['send_follow_up', 'escalate_to_management', 'close_satisfied', 'sla_breach'],
  follow_up_sent:        ['record_follow_up_response', 'escalate_to_management', 'expire_no_response', 'sla_breach'],
  follow_up_received:    ['close_satisfied', 'escalate_to_management', 'sla_breach'],
  escalated:             ['close_escalated', 'sla_breach'],
  closed_satisfied:      [],
  closed_escalated:      [],
  no_response:           [],
};

export const CSAT_STATE_TRANSITIONS: Record<CsatAction, CsatStatus> = {
  send_survey:               'survey_sent',
  record_response:           'survey_completed',
  analyse_score:             'score_analysis',
  send_follow_up:            'follow_up_sent',
  record_follow_up_response: 'follow_up_received',
  escalate_to_management:    'escalated',
  close_satisfied:           'closed_satisfied',
  close_escalated:           'closed_escalated',
  expire_no_response:        'no_response',
  sla_breach:                'survey_pending',
};

// Regulator / management inbox crossings
export function csatCrossesIntoRegulator(action: CsatAction, tier: SupportTier, score?: number): boolean {
  // escalate_to_management always crosses
  if (action === 'escalate_to_management') return true;
  // very low CSAT score (≤2 out of 5) on P1/P2: record_response crosses
  if (action === 'record_response' && score != null && score <= 2) {
    return tier === 'p1_critical' || tier === 'p2_high';
  }
  return false;
}

export function csatSlaBreachCrossesIntoRegulator(tier: SupportTier): boolean {
  return tier === 'p1_critical'; // P1 SLA breach always escalates
}
