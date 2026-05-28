// ─────────────────────────────────────────────────────────────────────────
// Wave 42 — Carbon Reversal / Buffer-Pool & Permanence Management chain (P6)
//
// Verra VCS AFOLU Non-Permanence Risk Tool + buffer pool + reversal events;
// Gold Standard; Paris Agreement Article 6.4 permanence + reversal rules.
//
// The BACK-END integrity safeguard of the carbon credit lifecycle. Where W37
// registers a project, W11 verifies its reductions (MRV) and W17 retires the
// resulting credits, THIS chain handles what happens when previously-issued
// credits are REVERSED — the sequestered carbon is released back to atmosphere
// (wildfire, illegal logging, drought / pest mortality, project failure, or
// intentional non-compliance). A reversal is a loss event against credits that
// have already entered the market, so the registry must make the market whole.
//
// Two resolution paths diverge at loss_quantified:
//   UNINTENTIONAL (fire, natural disturbance): the shared buffer pool absorbs
//     the loss — cancel buffer credits equal to the reversed tCO₂e, verify the
//     site has stabilised, close. No penalty; this is what the buffer is for.
//   INTENTIONAL / proponent-at-fault (negligence, fraud, illegal harvest): the
//     buffer is NOT spent — the proponent must REPLACE the credits (and the
//     buffer may be replenished), with verification before close.
//
//   reversal_reported → under_assessment → loss_quantified →
//     [buffer] buffer_cancellation_proposed → buffer_cancelled →
//              remediation_verified → closed
//     [replace] replacement_required → replacement_submitted →
//               replacement_verified → closed
//
// Branches:
//   escalated   — catastrophic / total reversal, fraud, or project termination
//                 (from under_assessment | loss_quantified | replacement_required)
//   false_alarm — the reported reversal was not a real loss
//                 (from reversal_reported | under_assessment)
//
// Tiers (reversal magnitude — drive urgency + reportability):
//   catastrophic — total / large permanent loss, project-termination risk
//   significant  — material partial loss
//   minor        — small, recoverable loss
//
// SLA matrix is URGENT — the larger the reversal, the TIGHTER every window (a
// reversal is an active integrity event; same flavour as W25/W26/W34/W40/W41).
// Reportability: escalate AND require_replacement (an intentional reversal is
// always a market-integrity event) cross for EVERY tier; close + SLA breaches
// cross for catastrophic + significant. Minor unintentional reversals are
// routine buffer accounting and stay internal.
// ─────────────────────────────────────────────────────────────────────────

export type ReversalStatus =
  | 'reversal_reported'
  | 'under_assessment'
  | 'loss_quantified'
  | 'buffer_cancellation_proposed'
  | 'buffer_cancelled'
  | 'remediation_verified'
  | 'replacement_required'
  | 'replacement_submitted'
  | 'replacement_verified'
  | 'closed'
  | 'escalated'
  | 'false_alarm';

export type ReversalAction =
  | 'begin_assessment'
  | 'quantify_loss'
  | 'propose_buffer_cancellation'
  | 'cancel_buffer'
  | 'verify_remediation'
  | 'require_replacement'
  | 'submit_replacement'
  | 'verify_replacement'
  | 'close'
  | 'escalate'
  | 'dismiss_false_alarm';

export type ReversalTier = 'catastrophic' | 'significant' | 'minor';

export type ReversalEvent =
  | 'carbon_reversal.under_assessment'
  | 'carbon_reversal.loss_quantified'
  | 'carbon_reversal.buffer_cancellation_proposed'
  | 'carbon_reversal.buffer_cancelled'
  | 'carbon_reversal.remediation_verified'
  | 'carbon_reversal.replacement_required'
  | 'carbon_reversal.replacement_submitted'
  | 'carbon_reversal.replacement_verified'
  | 'carbon_reversal.closed'
  | 'carbon_reversal.escalated'
  | 'carbon_reversal.false_alarm'
  | 'carbon_reversal.sla_breached';

const TERMINALS = new Set<ReversalStatus>(['closed', 'escalated', 'false_alarm']);

export function isTerminal(s: ReversalStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<ReversalAction, { from: ReversalStatus[]; to: ReversalStatus }> = {
  begin_assessment:            { from: ['reversal_reported'],                 to: 'under_assessment' },
  quantify_loss:               { from: ['under_assessment'],                  to: 'loss_quantified' },
  propose_buffer_cancellation: { from: ['loss_quantified'],                   to: 'buffer_cancellation_proposed' },
  cancel_buffer:               { from: ['buffer_cancellation_proposed'],      to: 'buffer_cancelled' },
  verify_remediation:          { from: ['buffer_cancelled'],                  to: 'remediation_verified' },
  require_replacement:         { from: ['loss_quantified'],                   to: 'replacement_required' },
  submit_replacement:          { from: ['replacement_required'],              to: 'replacement_submitted' },
  verify_replacement:          { from: ['replacement_submitted'],             to: 'replacement_verified' },
  close:                       { from: ['remediation_verified', 'replacement_verified'], to: 'closed' },
  escalate:                    { from: ['under_assessment', 'loss_quantified', 'replacement_required'], to: 'escalated' },
  dismiss_false_alarm:         { from: ['reversal_reported', 'under_assessment'], to: 'false_alarm' },
};

export function nextStatus(current: ReversalStatus, action: ReversalAction): ReversalStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: ReversalStatus): ReversalAction[] {
  const acts: ReversalAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [ReversalAction, typeof TRANSITIONS[ReversalAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const DAY = 24 * 60 * MIN;

// URGENT matrix — the larger the reversal, the TIGHTER every window.
export const SLA_MINUTES: Record<ReversalStatus, Record<ReversalTier, number>> = {
  reversal_reported: {
    catastrophic: 1 * DAY,
    significant:  3 * DAY,
    minor:        7 * DAY,
  },
  under_assessment: {
    catastrophic: 3 * DAY,
    significant:  7 * DAY,
    minor:        14 * DAY,
  },
  loss_quantified: {
    catastrophic: 7 * DAY,
    significant:  14 * DAY,
    minor:        30 * DAY,
  },
  buffer_cancellation_proposed: {
    catastrophic: 5 * DAY,
    significant:  10 * DAY,
    minor:        21 * DAY,
  },
  buffer_cancelled: {
    catastrophic: 7 * DAY,
    significant:  14 * DAY,
    minor:        30 * DAY,
  },
  remediation_verified: {
    catastrophic: 14 * DAY,
    significant:  30 * DAY,
    minor:        60 * DAY,
  },
  replacement_required: {
    catastrophic: 14 * DAY,
    significant:  30 * DAY,
    minor:        60 * DAY,
  },
  replacement_submitted: {
    catastrophic: 7 * DAY,
    significant:  14 * DAY,
    minor:        30 * DAY,
  },
  replacement_verified: {
    catastrophic: 7 * DAY,
    significant:  14 * DAY,
    minor:        30 * DAY,
  },
  closed:      { catastrophic: 0, significant: 0, minor: 0 },
  escalated:   { catastrophic: 0, significant: 0, minor: 0 },
  false_alarm: { catastrophic: 0, significant: 0, minor: 0 },
};

export function slaDeadlineFor(status: ReversalStatus, tier: ReversalTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Material reversals (catastrophic + significant) get registry-board scrutiny;
// minor unintentional reversals are routine buffer accounting.
const MATERIAL_TIERS = new Set<ReversalTier>(['catastrophic', 'significant']);

export function isMaterial(tier: ReversalTier): boolean {
  return MATERIAL_TIERS.has(tier);
}

export function isReportable(tier: ReversalTier): boolean {
  return MATERIAL_TIERS.has(tier);
}

// Reportability matrix:
//   - escalate crosses for EVERY tier — escalation means total reversal, fraud,
//     or project termination, which is always a market-integrity event.
//   - require_replacement crosses for EVERY tier — an intentional / proponent-
//     at-fault reversal is a notifiable integrity breach regardless of size.
//   - close crosses for material tiers (catastrophic + significant) — resolving
//     a material reversal is notifiable; minor reversals close internally.
export function crossesIntoRegulator(action: ReversalAction, tier: ReversalTier): boolean {
  if (action === 'escalate')            return true;
  if (action === 'require_replacement') return true;
  if (action === 'close')               return MATERIAL_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: ReversalTier): boolean {
  return MATERIAL_TIERS.has(tier);
}

// Party that each action represents (proponent vs VVB vs registry vs host-
// country authority). One carbon-fund desk records the workflow; this tags the
// contractual function performing each step (same model as W37).
const ACTION_PARTY: Record<ReversalAction, 'proponent' | 'vvb' | 'registry' | 'authority'> = {
  begin_assessment:            'registry',
  quantify_loss:               'vvb',
  propose_buffer_cancellation: 'registry',
  cancel_buffer:               'registry',
  verify_remediation:          'vvb',
  require_replacement:         'registry',
  submit_replacement:          'proponent',
  verify_replacement:          'vvb',
  close:                       'registry',
  escalate:                    'authority',
  dismiss_false_alarm:         'registry',
};

export function partyForAction(action: ReversalAction): 'proponent' | 'vvb' | 'registry' | 'authority' {
  return ACTION_PARTY[action];
}
