export type InsuranceClaimStatus =
  | 'notified'
  | 'assessing'
  | 'adjuster_assigned'
  | 'quantum_proposed'
  | 'quantum_agreed'
  | 'disputed'
  | 'settled'
  | 'declined'
  | 'closed'
  | 'withdrawn';

export type InsuranceClaimAction =
  | 'begin_assessment'
  | 'assign_adjuster'
  | 'propose_quantum'
  | 'agree_quantum'
  | 'dispute'
  | 'resolve_dispute'
  | 'settle'
  | 'decline'
  | 'close'
  | 'withdraw';

export type InsuranceClaimTier = 'catastrophic' | 'major' | 'minor' | 'small';

export type InsuranceClaimEvent =
  | 'insurance_claim.notified'
  | 'insurance_claim.assessing'
  | 'insurance_claim.adjuster_assigned'
  | 'insurance_claim.quantum_proposed'
  | 'insurance_claim.quantum_agreed'
  | 'insurance_claim.disputed'
  | 'insurance_claim.dispute_resolved'
  | 'insurance_claim.settled'
  | 'insurance_claim.declined'
  | 'insurance_claim.closed'
  | 'insurance_claim.withdrawn'
  | 'insurance_claim.sla_breached';

const TERMINALS = new Set<InsuranceClaimStatus>(['settled', 'declined', 'closed', 'withdrawn']);

export function isTerminal(s: InsuranceClaimStatus): boolean {
  return TERMINALS.has(s);
}

const TRANSITIONS: Record<InsuranceClaimAction, { from: InsuranceClaimStatus[]; to: InsuranceClaimStatus }> = {
  begin_assessment:  { from: ['notified'],                                    to: 'assessing' },
  assign_adjuster:   { from: ['assessing'],                                   to: 'adjuster_assigned' },
  propose_quantum:   { from: ['adjuster_assigned'],                           to: 'quantum_proposed' },
  agree_quantum:     { from: ['quantum_proposed', 'disputed'],                to: 'quantum_agreed' },
  dispute:           { from: ['quantum_proposed', 'quantum_agreed'],          to: 'disputed' },
  resolve_dispute:   { from: ['disputed'],                                    to: 'quantum_agreed' },
  settle:            { from: ['quantum_agreed'],                              to: 'settled' },
  decline:           { from: ['assessing', 'adjuster_assigned', 'quantum_proposed', 'disputed'], to: 'declined' },
  close:             { from: ['settled', 'declined'],                         to: 'closed' },
  withdraw:          { from: ['notified', 'assessing', 'adjuster_assigned', 'quantum_proposed', 'disputed'], to: 'withdrawn' },
};

export function nextStatus(
  current: InsuranceClaimStatus,
  action: InsuranceClaimAction,
): InsuranceClaimStatus | null {
  if (TERMINALS.has(current) && current !== 'settled' && current !== 'declined') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: InsuranceClaimStatus): InsuranceClaimAction[] {
  const actions: InsuranceClaimAction[] = [];
  for (const [act, t] of Object.entries(TRANSITIONS) as [InsuranceClaimAction, typeof TRANSITIONS[InsuranceClaimAction]][]) {
    if (t.from.includes(current)) actions.push(act);
  }
  return actions;
}

export function tierFromZar(claim_value_zar: number): InsuranceClaimTier {
  if (claim_value_zar >= 50_000_000) return 'catastrophic';
  if (claim_value_zar >= 10_000_000) return 'major';
  if (claim_value_zar >= 500_000) return 'minor';
  return 'small';
}

const MIN = 1;
const HOUR = 60;
const DAY = 24 * HOUR;

export const SLA_MINUTES: Record<InsuranceClaimStatus, Record<InsuranceClaimTier, number>> = {
  notified: {
    catastrophic: 1 * DAY,
    major:        2 * DAY,
    minor:        5 * DAY,
    small:        7 * DAY,
  },
  assessing: {
    catastrophic: 45 * DAY,
    major:        30 * DAY,
    minor:        21 * DAY,
    small:        14 * DAY,
  },
  adjuster_assigned: {
    catastrophic: 90 * DAY,
    major:        60 * DAY,
    minor:        45 * DAY,
    small:        30 * DAY,
  },
  quantum_proposed: {
    catastrophic: 45 * DAY,
    major:        30 * DAY,
    minor:        21 * DAY,
    small:        14 * DAY,
  },
  quantum_agreed: {
    catastrophic: 14 * DAY,
    major:        21 * DAY,
    minor:        30 * DAY,
    small:        30 * DAY,
  },
  disputed: {
    catastrophic: 120 * DAY,
    major:        90 * DAY,
    minor:        60 * DAY,
    small:        30 * DAY,
  },
  settled:   { catastrophic: 0, major: 0, minor: 0, small: 0 },
  declined:  { catastrophic: 0, major: 0, minor: 0, small: 0 },
  closed:    { catastrophic: 0, major: 0, minor: 0, small: 0 },
  withdrawn: { catastrophic: 0, major: 0, minor: 0, small: 0 },
};

export function slaDeadlineFor(
  status: InsuranceClaimStatus,
  tier: InsuranceClaimTier,
  enteredAt: Date,
): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes * MIN);
  return t;
}

export function crossesIntoRegulator(action: InsuranceClaimAction, tier: InsuranceClaimTier): boolean {
  if (tier !== 'catastrophic') return false;
  return action === 'settle' || action === 'decline';
}

export function slaBreachCrossesIntoRegulator(tier: InsuranceClaimTier): boolean {
  return tier === 'catastrophic';
}
