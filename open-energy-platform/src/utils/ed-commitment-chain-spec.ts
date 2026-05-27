// ─────────────────────────────────────────────────────────────────────────
// Wave 27 — REIPPPP Economic Development (ED) commitment monitoring chain (P6)
//
// 9-state monitoring lifecycle for the 7 contractual ED commitments that
// every REIPPPP-awarded project carries to IPPO/DMRE/DTI:
//
//   baseline_locked → monitoring → variance_flagged → cure_plan_required →
//   cure_plan_submitted → cure_executing → verified_compliant → closed
//
// Penalty branch:   cure_executing → penalty_issued → closed
// Escalation:       cure_executing | penalty_issued → escalated → closed
// False-alarm:      variance_flagged → false_alarm → closed
//
// Commitment categories (treated as "tiers" because they drive SLA + reportability):
//   ownership          — B-BBEE black ownership %  (REIPPPP scoring weight HIGHEST)
//   local_content      — % local procurement by value
//   jobs               — FTE direct/indirect
//   skills             — skills-development spend %
//   enterprise_dev     — qualifying BEE supplier spend %
//   socio_economic     — community spend %
//   community_trust    — trust beneficiary distribution
//
// Regulator inbox crossings: ownership + local_content are HIGH-scoring REIPPPP
// commitments and any cure_required/penalty_issued/escalated/breach crosses;
// jobs + skills (mid-tier) cross only on escalate/penalty; enterprise/SED/trust
// cross only on escalate (DTI referral). closed never crosses.
// ─────────────────────────────────────────────────────────────────────────

export type EdStatus =
  | 'baseline_locked'
  | 'monitoring'
  | 'variance_flagged'
  | 'cure_plan_required'
  | 'cure_plan_submitted'
  | 'cure_executing'
  | 'verified_compliant'
  | 'penalty_issued'
  | 'closed'
  | 'escalated'
  | 'false_alarm';

export type EdAction =
  | 'activate_monitoring'
  | 'detect_variance'
  | 'require_cure_plan'
  | 'submit_cure_plan'
  | 'approve_cure_plan'
  | 'verify_compliance'
  | 'close_compliant'
  | 'issue_penalty'
  | 'close_with_penalty'
  | 'escalate'
  | 'close_escalated'
  | 'mark_false_alarm'
  | 'close_false_alarm';

export type EdTier =
  | 'ownership'
  | 'local_content'
  | 'jobs'
  | 'skills'
  | 'enterprise_dev'
  | 'socio_economic'
  | 'community_trust';

export type EdEvent =
  | 'ed_commitment.monitoring'
  | 'ed_commitment.variance_flagged'
  | 'ed_commitment.cure_plan_required'
  | 'ed_commitment.cure_plan_submitted'
  | 'ed_commitment.cure_executing'
  | 'ed_commitment.verified_compliant'
  | 'ed_commitment.penalty_issued'
  | 'ed_commitment.closed'
  | 'ed_commitment.escalated'
  | 'ed_commitment.false_alarm'
  | 'ed_commitment.sla_breached';

const TERMINALS = new Set<EdStatus>(['closed']);

export function isTerminal(s: EdStatus): boolean {
  return TERMINALS.has(s);
}

const TRANSITIONS: Record<EdAction, { from: EdStatus[]; to: EdStatus }> = {
  activate_monitoring: { from: ['baseline_locked'],                              to: 'monitoring' },
  detect_variance:     { from: ['monitoring'],                                   to: 'variance_flagged' },
  require_cure_plan:   { from: ['variance_flagged'],                             to: 'cure_plan_required' },
  submit_cure_plan:    { from: ['cure_plan_required'],                           to: 'cure_plan_submitted' },
  approve_cure_plan:   { from: ['cure_plan_submitted'],                          to: 'cure_executing' },
  verify_compliance:   { from: ['cure_executing'],                               to: 'verified_compliant' },
  close_compliant:     { from: ['verified_compliant'],                           to: 'closed' },
  issue_penalty:       { from: ['cure_executing'],                               to: 'penalty_issued' },
  close_with_penalty:  { from: ['penalty_issued'],                               to: 'closed' },
  escalate:            { from: ['cure_executing', 'penalty_issued'],             to: 'escalated' },
  close_escalated:     { from: ['escalated'],                                    to: 'closed' },
  mark_false_alarm:    { from: ['variance_flagged'],                             to: 'false_alarm' },
  close_false_alarm:   { from: ['false_alarm'],                                  to: 'closed' },
};

export function nextStatus(current: EdStatus, action: EdAction): EdStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: EdStatus): EdAction[] {
  const acts: EdAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [EdAction, typeof TRANSITIONS[EdAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const HOUR = 60;
const DAY = 24 * HOUR;

// SLA matrix — ownership + local_content (REIPPPP-scoring) get tighter
// cure windows; community/SED tiers are quarterly-cadence so longer.
export const SLA_MINUTES: Record<EdStatus, Record<EdTier, number>> = {
  baseline_locked: {
    ownership:        7 * DAY,
    local_content:    7 * DAY,
    jobs:             7 * DAY,
    skills:           7 * DAY,
    enterprise_dev:   7 * DAY,
    socio_economic:   7 * DAY,
    community_trust:  7 * DAY,
  },
  monitoring: {
    ownership:       90 * DAY,    // quarterly report cadence
    local_content:   90 * DAY,
    jobs:            90 * DAY,
    skills:          90 * DAY,
    enterprise_dev:  90 * DAY,
    socio_economic:  90 * DAY,
    community_trust: 90 * DAY,
  },
  variance_flagged: {
    ownership:       14 * DAY,    // tight — REIPPPP scoring
    local_content:   14 * DAY,
    jobs:            21 * DAY,
    skills:          21 * DAY,
    enterprise_dev:  30 * DAY,
    socio_economic:  30 * DAY,
    community_trust: 30 * DAY,
  },
  cure_plan_required: {
    ownership:       30 * DAY,    // IPPO 30d cure plan window
    local_content:   30 * DAY,
    jobs:            30 * DAY,
    skills:          30 * DAY,
    enterprise_dev:  45 * DAY,
    socio_economic:  60 * DAY,
    community_trust: 60 * DAY,
  },
  cure_plan_submitted: {
    ownership:       14 * DAY,    // IPPO review window
    local_content:   14 * DAY,
    jobs:            14 * DAY,
    skills:          14 * DAY,
    enterprise_dev:  21 * DAY,
    socio_economic:  21 * DAY,
    community_trust: 21 * DAY,
  },
  cure_executing: {
    ownership:       90 * DAY,    // 1 quarter to remediate
    local_content:  180 * DAY,    // 2 quarters (supply-chain dependent)
    jobs:           180 * DAY,
    skills:          90 * DAY,
    enterprise_dev: 180 * DAY,
    socio_economic: 270 * DAY,
    community_trust: 270 * DAY,
  },
  verified_compliant: {
    ownership:       14 * DAY,
    local_content:   14 * DAY,
    jobs:            14 * DAY,
    skills:          14 * DAY,
    enterprise_dev:  14 * DAY,
    socio_economic:  14 * DAY,
    community_trust: 14 * DAY,
  },
  penalty_issued: {
    ownership:       60 * DAY,    // payment + appeal window
    local_content:   60 * DAY,
    jobs:            60 * DAY,
    skills:          60 * DAY,
    enterprise_dev:  60 * DAY,
    socio_economic:  60 * DAY,
    community_trust: 60 * DAY,
  },
  escalated: {
    ownership:      180 * DAY,
    local_content:  180 * DAY,
    jobs:           180 * DAY,
    skills:         180 * DAY,
    enterprise_dev: 180 * DAY,
    socio_economic: 180 * DAY,
    community_trust:180 * DAY,
  },
  closed:      { ownership: 0, local_content: 0, jobs: 0, skills: 0, enterprise_dev: 0, socio_economic: 0, community_trust: 0 },
  false_alarm: { ownership: 0, local_content: 0, jobs: 0, skills: 0, enterprise_dev: 0, socio_economic: 0, community_trust: 0 },
};

export function slaDeadlineFor(status: EdStatus, tier: EdTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// High-scoring REIPPPP commitments — penalty + escalation + breach always
// cross to the regulator inbox; mid tiers (jobs/skills) cross on penalty/
// escalate only; community/SED/enterprise cross on escalate only.
const HIGH_SCORING = new Set<EdTier>(['ownership', 'local_content']);
const MID_SCORING  = new Set<EdTier>(['jobs', 'skills']);

export function isHighScoring(tier: EdTier): boolean {
  return HIGH_SCORING.has(tier);
}

export function crossesIntoRegulator(action: EdAction, tier: EdTier): boolean {
  if (action === 'escalate') return true;
  if (action === 'issue_penalty') return HIGH_SCORING.has(tier) || MID_SCORING.has(tier);
  if (action === 'require_cure_plan') return HIGH_SCORING.has(tier);
  if (action === 'close_escalated' || action === 'close_with_penalty') return HIGH_SCORING.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: EdTier): boolean {
  return HIGH_SCORING.has(tier) || MID_SCORING.has(tier);
}
