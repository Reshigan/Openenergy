// ═══════════════════════════════════════════════════════════════════════════
// Wave 41 — OEM-Support ITIL Problem Management chain (pure spec).
//
// ROOT-CAUSE management of recurring / systemic incidents — the proactive,
// structural complement to the reactive per-ticket W14 incident management.
//   - W14 support-ticket    : restore service for ONE incident as fast as
//                             possible (incident management).
//   - W15 warranty/RMA      : single-claim return-merchandise authorisation.
//   - W35 vendor-escalation : supplier-defect escalation up to the OEM.
// This chain is PROBLEM management (ITIL v4): you take a pattern of recurring
// incidents, find and document the root cause, register a Known Error with a
// workaround, drive a permanent fix through change management, deploy it, and
// verify the incidents stop recurring. The unit of work is the underlying
// CAUSE, not any one ticket.
//
// Standards framing:
//   - ITIL 4 Problem Management practice (investigate → known error → resolve).
//   - ISO/IEC 20000-1 §8.6.3 (problem management) — record, classify, root-cause,
//     resolve, and review problems.
//
// Forward path:
//   problem_logged → categorized → investigating → rca_identified →
//     known_error → fix_proposed → change_raised → fix_deployed →
//     resolution_verified → closed
//
// Short-circuit: known_error → closed (accept_workaround — a low-impact problem
//   whose documented workaround is accepted as the permanent disposition; no
//   change is raised).
// Escalation branch: investigating | rca_identified | known_error → escalated
//   (a major problem whose blast radius warrants major-problem governance).
// Early cancel: problem_logged | categorized | investigating → cancelled
//   (duplicate / not-a-problem / superseded).
//
// Priority tiers (ITIL impact × urgency):
//   major_problem — widespread or service-critical; market-availability /
//                   integrity risk — TIGHTEST windows.
//   significant   — notable recurring impact on a service or customer set.
//   minor         — low-impact recurring nuisance — LOOSEST windows.
//
// URGENT SLA — more severe priority gets TIGHTER deadlines at every stage.
//
// Reportability (regulator inbox crossings) — MAJOR PROBLEMS ONLY. Problem
// management is internal IT/OT operations; only a major problem touching a
// regulated platform service is notifiable:
//   - escalate     crosses for major_problem only (major-problem governance).
//   - close        crosses for major_problem only (post-major-problem report).
//   - sla_breached crosses for major_problem only.
//
// Write model — SINGLE-PARTY {admin, support}. Unlike the W37–W40 two-party
// chains, there is no access split: the support / problem-management function
// owns the whole record. We still tag each event with the ITIL functional party
// that owns the action (problem_manager / resolver / change_mgmt) for audit
// attribution — this is functional tagging, NOT an access-control split.
// ═══════════════════════════════════════════════════════════════════════════

export type ProblemStatus =
  | 'problem_logged'
  | 'categorized'
  | 'investigating'
  | 'rca_identified'
  | 'known_error'
  | 'fix_proposed'
  | 'change_raised'
  | 'fix_deployed'
  | 'resolution_verified'
  | 'closed'
  | 'escalated'
  | 'cancelled';

export type ProblemAction =
  | 'categorize'
  | 'begin_investigation'
  | 'identify_rca'
  | 'log_known_error'
  | 'propose_fix'
  | 'accept_workaround'
  | 'raise_change'
  | 'deploy_fix'
  | 'verify_resolution'
  | 'close'
  | 'escalate'
  | 'cancel';

export type ProblemTier =
  | 'major_problem'
  | 'significant'
  | 'minor';

// ITIL functional party that owns each action (recorded as actor_party — this is
// functional attribution for audit, NOT a write-access split).
export type ProblemParty = 'problem_manager' | 'resolver' | 'change_mgmt';

interface TransitionRule {
  next: ProblemStatus;
}

export const TRANSITIONS: Record<
  ProblemStatus,
  Partial<Record<ProblemAction, TransitionRule>>
> = {
  problem_logged: {
    categorize: { next: 'categorized' },
    cancel:     { next: 'cancelled' },
  },
  categorized: {
    begin_investigation: { next: 'investigating' },
    cancel:              { next: 'cancelled' },
  },
  investigating: {
    identify_rca: { next: 'rca_identified' },
    escalate:     { next: 'escalated' },
    cancel:       { next: 'cancelled' },
  },
  rca_identified: {
    log_known_error: { next: 'known_error' },
    escalate:        { next: 'escalated' },
  },
  known_error: {
    propose_fix:       { next: 'fix_proposed' },
    accept_workaround: { next: 'closed' },
    escalate:          { next: 'escalated' },
  },
  fix_proposed: {
    raise_change: { next: 'change_raised' },
  },
  change_raised: {
    deploy_fix: { next: 'fix_deployed' },
  },
  fix_deployed: {
    verify_resolution: { next: 'resolution_verified' },
  },
  resolution_verified: {
    close: { next: 'closed' },
  },
  closed:    {},
  escalated: {},
  cancelled: {},
};

const TERMINALS = new Set<ProblemStatus>(['closed', 'escalated', 'cancelled']);

export function isTerminal(s: ProblemStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: ProblemStatus,
  action: ProblemAction,
): ProblemStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: ProblemStatus): ProblemAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as ProblemAction[];
}

// URGENT SLA windows in minutes — more severe priority = TIGHTER.
// Keyed by the deadline to take the NEXT action out of each state.
export const SLA_MINUTES: Record<ProblemStatus, Record<ProblemTier, number>> = {
  // problem_logged → categorize
  problem_logged: {
    major_problem: 120, significant: 480, minor: 1440,
  },
  // categorized → begin_investigation
  categorized: {
    major_problem: 240, significant: 1440, minor: 4320,
  },
  // investigating → identify_rca
  investigating: {
    major_problem: 1440, significant: 7200, minor: 20160,
  },
  // rca_identified → log_known_error
  rca_identified: {
    major_problem: 480, significant: 2880, minor: 7200,
  },
  // known_error → propose_fix / accept_workaround
  known_error: {
    major_problem: 1440, significant: 7200, minor: 20160,
  },
  // fix_proposed → raise_change
  fix_proposed: {
    major_problem: 1440, significant: 4320, minor: 10080,
  },
  // change_raised → deploy_fix
  change_raised: {
    major_problem: 2880, significant: 10080, minor: 20160,
  },
  // fix_deployed → verify_resolution
  fix_deployed: {
    major_problem: 1440, significant: 4320, minor: 10080,
  },
  // resolution_verified → close
  resolution_verified: {
    major_problem: 1440, significant: 2880, minor: 7200,
  },
  closed:    { major_problem: 0, significant: 0, minor: 0 },
  escalated: { major_problem: 0, significant: 0, minor: 0 },
  cancelled: { major_problem: 0, significant: 0, minor: 0 },
};

export function slaDeadlineFor(
  state: ProblemStatus,
  tier: ProblemTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// MAJOR PROBLEMS ONLY cross into the regulator inbox.
//   escalate + close cross for major_problem; everything else internal.
export function crossesIntoRegulator(
  action: ProblemAction,
  tier: ProblemTier,
): boolean {
  if (action === 'escalate' || action === 'close') {
    return tier === 'major_problem';
  }
  return false;
}

// sla_breached crosses for major_problem only.
export function slaBreachCrossesIntoRegulator(tier: ProblemTier): boolean {
  return tier === 'major_problem';
}

export function isReportable(tier: ProblemTier): boolean {
  return tier === 'major_problem';
}

// ITIL functional party that owns each action.
const ACTION_PARTY: Record<ProblemAction, ProblemParty> = {
  categorize:          'problem_manager',
  begin_investigation: 'resolver',
  identify_rca:        'resolver',
  log_known_error:     'resolver',
  propose_fix:         'resolver',
  accept_workaround:   'problem_manager',
  raise_change:        'change_mgmt',
  deploy_fix:          'change_mgmt',
  verify_resolution:   'resolver',
  close:               'problem_manager',
  escalate:            'problem_manager',
  cancel:              'problem_manager',
};

export function partyForAction(action: ProblemAction): ProblemParty {
  return ACTION_PARTY[action];
}
