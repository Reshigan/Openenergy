// ═══════════════════════════════════════════════════════════════════════════
// Wave 34 — Grid CSC-1 Load Curtailment / Emergency Load Reduction (pure spec).
//
// NERSA Grid Code System Operations Code section CSC-1 + C-3 (emergency
// directives). 11-state P6 lifecycle for every formal System Operator (SO)
// load-curtailment instruction issued during a Stage 1-8 load-shedding
// event or other system-emergency condition.
//
// Forward path:
//   instruction_issued → acknowledged → curtailment_started →
//   target_achieved → instruction_lifted → reconciled → post_mortem →
//   closed
//
// Branch terminals:
//   refused              — target party refuses to comply (Grid Code §C-3 referral)
//   partial_compliance   — target not met (proportional penalty)
//   withdrawn            — SO withdrew the instruction before customer action
//
// Stages (NERSA load-shedding stages 1-8):
//   stage_1_2 — mild (1-2 GW shed nationally)
//   stage_3_4 — moderate (3-4 GW)
//   stage_5_6 — high (5-6 GW)
//   stage_7_8 — critical national (7-8 GW + grid collapse risk)
//
// URGENT SLA matrix — higher stage gets TIGHTER deadlines (system survival).
// stage_7_8 acknowledge in 5 minutes; reconcile within 24h.
//
// Reportability (NERSA Grid Code Inbox crossings):
//   - refused crosses for ALL stages (§C-3 mandatory disclosure)
//   - partial_compliance crosses for stage_3_4+ (excludes mild)
//   - target_achieved crosses for stage_5_6+ (national reporting threshold)
//   - post_mortem closed crosses for stage_5_6+
//   - sla_breached crosses for stage_5_6+ only (mild events tracked internally)
//
// Split-write:
//   GRID_WRITE: issue_instruction / lift_instruction / withdraw / reconcile /
//               open_post_mortem / close_post_mortem / close
//   CUSTOMER_WRITE: acknowledge / start_curtailment / report_target_achieved /
//                   refuse / report_partial
//   admin/support always.
// ═══════════════════════════════════════════════════════════════════════════

export type LoadCurtailmentStatus =
  | 'instruction_issued'
  | 'acknowledged'
  | 'curtailment_started'
  | 'target_achieved'
  | 'instruction_lifted'
  | 'reconciled'
  | 'post_mortem'
  | 'closed'
  | 'refused'
  | 'partial_compliance'
  | 'withdrawn';

export type LoadCurtailmentAction =
  | 'issue_instruction'
  | 'acknowledge'
  | 'start_curtailment'
  | 'report_target_achieved'
  | 'lift_instruction'
  | 'reconcile'
  | 'open_post_mortem'
  | 'close_post_mortem'
  | 'close'
  | 'refuse'
  | 'report_partial'
  | 'withdraw';

export type LoadShedStage = 'stage_1_2' | 'stage_3_4' | 'stage_5_6' | 'stage_7_8';

type SlaWindow = 'ack' | 'start' | 'target' | 'reconcile' | 'pm_open' | 'pm_close';

interface TransitionRule {
  next: LoadCurtailmentStatus;
  setNextSla?: SlaWindow | null;
  clearNextSla?: boolean;
}

export const TRANSITIONS: Record<
  LoadCurtailmentStatus,
  Partial<Record<LoadCurtailmentAction, TransitionRule>>
> = {
  instruction_issued: {
    acknowledge: { next: 'acknowledged', setNextSla: 'start' },
    refuse:      { next: 'refused', clearNextSla: true },
    withdraw:    { next: 'withdrawn', clearNextSla: true },
  },
  acknowledged: {
    start_curtailment: { next: 'curtailment_started', setNextSla: 'target' },
    refuse:            { next: 'refused', clearNextSla: true },
    withdraw:          { next: 'withdrawn', clearNextSla: true },
  },
  curtailment_started: {
    report_target_achieved: { next: 'target_achieved', clearNextSla: true },
    report_partial:         { next: 'partial_compliance', clearNextSla: true },
    withdraw:               { next: 'withdrawn', clearNextSla: true },
  },
  target_achieved: {
    lift_instruction: { next: 'instruction_lifted', setNextSla: 'reconcile' },
  },
  partial_compliance: {
    lift_instruction: { next: 'instruction_lifted', setNextSla: 'reconcile' },
  },
  instruction_lifted: {
    reconcile: { next: 'reconciled', setNextSla: 'pm_open' },
  },
  reconciled: {
    open_post_mortem: { next: 'post_mortem', setNextSla: 'pm_close' },
    close:            { next: 'closed', clearNextSla: true },
  },
  post_mortem: {
    close_post_mortem: { next: 'closed', clearNextSla: true },
  },
  closed:    {},
  refused:   {},
  withdrawn: {},
};

const TERMINALS = new Set<LoadCurtailmentStatus>(['closed', 'refused', 'withdrawn']);

export function isTerminal(s: LoadCurtailmentStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: LoadCurtailmentStatus,
  action: LoadCurtailmentAction,
): LoadCurtailmentStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(
  current: LoadCurtailmentStatus,
): LoadCurtailmentAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as LoadCurtailmentAction[];
}

// URGENT SLA windows in minutes — higher stage = TIGHTER (system survival).
export const SLA_MINUTES: Record<LoadCurtailmentStatus, Record<LoadShedStage, number>> = {
  instruction_issued: {
    stage_1_2: 60, stage_3_4: 30, stage_5_6: 15, stage_7_8: 5,
  },
  acknowledged: {
    stage_1_2: 90, stage_3_4: 60, stage_5_6: 30, stage_7_8: 10,
  },
  curtailment_started: {
    stage_1_2: 120, stage_3_4: 90, stage_5_6: 60, stage_7_8: 30,
  },
  target_achieved:    { stage_1_2: 0, stage_3_4: 0, stage_5_6: 0, stage_7_8: 0 },
  partial_compliance: { stage_1_2: 0, stage_3_4: 0, stage_5_6: 0, stage_7_8: 0 },
  instruction_lifted: {
    stage_1_2: 10080, stage_3_4: 7200, stage_5_6: 4320, stage_7_8: 1440,
  },
  reconciled: {
    stage_1_2: 43200, stage_3_4: 30240, stage_5_6: 20160, stage_7_8: 10080,
  },
  post_mortem: {
    stage_1_2: 0, stage_3_4: 0, stage_5_6: 0, stage_7_8: 0,
  },
  closed:    { stage_1_2: 0, stage_3_4: 0, stage_5_6: 0, stage_7_8: 0 },
  refused:   { stage_1_2: 0, stage_3_4: 0, stage_5_6: 0, stage_7_8: 0 },
  withdrawn: { stage_1_2: 0, stage_3_4: 0, stage_5_6: 0, stage_7_8: 0 },
};

export function slaDeadlineFor(
  state: LoadCurtailmentStatus,
  stage: LoadShedStage,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[stage];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// refused crosses ALL stages (§C-3 mandatory). partial_compliance crosses
// stage_3_4 and above. target_achieved + post_mortem close cross stage_5_6+.
export function crossesIntoRegulator(
  action: LoadCurtailmentAction,
  stage: LoadShedStage,
): boolean {
  if (action === 'refuse') return true;
  if (action === 'report_partial') {
    return stage === 'stage_3_4' || stage === 'stage_5_6' || stage === 'stage_7_8';
  }
  if (action === 'report_target_achieved') {
    return stage === 'stage_5_6' || stage === 'stage_7_8';
  }
  if (action === 'close_post_mortem') {
    return stage === 'stage_5_6' || stage === 'stage_7_8';
  }
  return false;
}

// sla_breached crosses for stage_5_6+ only — mild events stay internal.
export function slaBreachCrossesIntoRegulator(stage: LoadShedStage): boolean {
  return stage === 'stage_5_6' || stage === 'stage_7_8';
}

export function isReportable(stage: LoadShedStage): boolean {
  return stage === 'stage_5_6' || stage === 'stage_7_8';
}

export function stageForGwShed(gw: number): LoadShedStage {
  if (gw <= 2) return 'stage_1_2';
  if (gw <= 4) return 'stage_3_4';
  if (gw <= 6) return 'stage_5_6';
  return 'stage_7_8';
}
