// ═══════════════════════════════════════════════════════════════════════════
// Wave 64 — Esums Permit-to-Work (PTW) / LOTO Authorisation & Isolation Control.
//
// OHSA 85/1993 (s.8 general duties) + Construction Regulations 2014 +
// Electrical Machinery Regulations + General Machinery Regulations + standard
// REIPPPP O&M safe-system-of-work discipline. 12-state P6 lifecycle for a SINGLE
// permit-to-work instance authorising a hazardous field intervention on a PV /
// wind asset: the permit is requested, the hazard is assessed and a method
// statement reviewed, an energy-isolation (lockout/tagout) plan is approved, the
// isolation is physically applied AND a zero-energy state is verified
// (test-for-dead), the permit is issued, work proceeds (with suspend/resume for
// shift handover or changed conditions), work completes, and the permit is closed
// (equipment re-energised, locks removed, area handed back) — or it is rejected
// at assessment, withdrawn by the holder pre-issue, or REVOKED under an emergency
// / isolation-breach / unsafe condition.
//
// This is the PROACTIVE safe-system-of-work GATE that every hazardous field task
// must pass BEFORE it starts. It complements W25 HSE incident (the REACTIVE
// response when something goes wrong) and gates the field execution surfaced by
// W16 WO-dispatch and W59 PM-compliance: no isolation-confirmed permit, no work.
//
// Forward (happy / issued-and-worked) path:
//   permit_requested → hazard_assessment → isolation_pending →
//   isolation_confirmed → permit_issued → work_in_progress → work_complete →
//   permit_closed
//
// Suspend / resume loop (shift handover, weather, changed condition):
//   suspend_work (from work_in_progress) → suspended → resume_work →
//   work_in_progress
//
// Reject (authority denies the request at assessment / isolation planning):
//   reject_permit (from hazard_assessment | isolation_pending) → permit_rejected
//
// Withdraw (holder cancels their own request before the permit issues):
//   withdraw (from permit_requested | hazard_assessment | isolation_pending) →
//   withdrawn
//
// Revoke (emergency / isolation breach / unsafe condition — the safety override):
//   revoke_permit (from isolation_confirmed | permit_issued | work_in_progress |
//   suspended) → permit_revoked
//
// Terminals: permit_closed, permit_rejected, permit_revoked, withdrawn
//
// Hazard tiers (composite hazard-rating index 0..100 — energy × consequence ×
// exposure), least → most hazardous:
//   low          — < 20  (general housekeeping, de-energised low-voltage)
//   moderate     — < 40  (isolated LV electrical, basic mechanical)
//   high         — < 60  (working at height, lifting, isolated MV)
//   critical     — < 80  (live LV / MV adjacent work, hot work, excavation)
//   catastrophic — >= 80 (live HV, confined-space entry, arc-flash boundary)
//
// URGENT SLA matrix — the MORE hazardous the permit, the TIGHTER the window (a
// hazardous permit must not sit un-actioned; work_in_progress is the maximum
// authorised work duration — tighter for higher hazard so a live permit is never
// left open). Terminals carry no SLA.
//
// Reportability — the W64 SIGNATURE is LIVE-WORK / ISOLATION-INTEGRITY driven
// (distinct from W63 defect-class, W59 PM-criticality, W25 incident severity):
//   - issue_permit crosses for EVERY hazard tier when the permit authorises LIVE
//     (energised) work OR a confined-space entry — the two highest-consequence
//     authorisations always notify the regulator (DoL); a non-live, non-confined
//     permit crosses only for the top hazard tiers {critical, catastrophic}.
//   - revoke_permit ALWAYS crosses — an emergency revocation / isolation breach
//     is always a reportable safety event ("you cannot quietly revoke a permit").
//   - sla_breached crosses for the top hazard tiers {critical, catastrophic}.
//
// Single-party write: there is no field-crew login — the Esums O&M operators
// record every party's action; the contractual party is captured separately via
// actor_party (issuing_authority vs permit_holder), derived from the action.
// admin / support / ipp_developer write.
// ═══════════════════════════════════════════════════════════════════════════

export type PermitStatus =
  | 'permit_requested'
  | 'hazard_assessment'
  | 'isolation_pending'
  | 'isolation_confirmed'
  | 'permit_issued'
  | 'work_in_progress'
  | 'suspended'
  | 'work_complete'
  | 'permit_closed'
  | 'permit_rejected'
  | 'permit_revoked'
  | 'withdrawn';

export type PermitAction =
  | 'begin_assessment'
  | 'approve_isolation_plan'
  | 'verify_isolation'
  | 'issue_permit'
  | 'start_work'
  | 'suspend_work'
  | 'resume_work'
  | 'complete_work'
  | 'close_permit'
  | 'reject_permit'
  | 'revoke_permit'
  | 'withdraw';

export type HazardTier =
  | 'low'
  | 'moderate'
  | 'high'
  | 'critical'
  | 'catastrophic';

// The eight recognised hazardous-work classes governed by the permit system.
export type WorkClass =
  | 'electrical_live'
  | 'electrical_isolated'
  | 'working_at_height'
  | 'confined_space'
  | 'hot_work'
  | 'lifting'
  | 'excavation'
  | 'general';

export type PermitParty = 'issuing_authority' | 'permit_holder';

interface TransitionRule {
  from: PermitStatus[];
  to: PermitStatus;
}

export const TRANSITIONS: Record<PermitAction, TransitionRule> = {
  begin_assessment:       { from: ['permit_requested'], to: 'hazard_assessment' },
  approve_isolation_plan: { from: ['hazard_assessment'], to: 'isolation_pending' },
  verify_isolation:       { from: ['isolation_pending'], to: 'isolation_confirmed' },
  issue_permit:           { from: ['isolation_confirmed'], to: 'permit_issued' },
  start_work:             { from: ['permit_issued'], to: 'work_in_progress' },
  suspend_work:           { from: ['work_in_progress'], to: 'suspended' },
  resume_work:            { from: ['suspended'], to: 'work_in_progress' },
  complete_work:          { from: ['work_in_progress'], to: 'work_complete' },
  close_permit:           { from: ['work_complete'], to: 'permit_closed' },
  reject_permit:          { from: ['hazard_assessment', 'isolation_pending'], to: 'permit_rejected' },
  revoke_permit:          { from: ['isolation_confirmed', 'permit_issued', 'work_in_progress', 'suspended'], to: 'permit_revoked' },
  withdraw:               { from: ['permit_requested', 'hazard_assessment', 'isolation_pending'], to: 'withdrawn' },
};

const TERMINALS = new Set<PermitStatus>([
  'permit_closed', 'permit_rejected', 'permit_revoked', 'withdrawn',
]);

// States from which the holder can still withdraw (no permit issued yet).
const WITHDRAWABLE = new Set<PermitStatus>([
  'permit_requested', 'hazard_assessment', 'isolation_pending',
]);

export function isTerminal(s: PermitStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: PermitStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export function nextStatus(
  current: PermitStatus,
  action: PermitAction,
): PermitStatus | null {
  const rule = TRANSITIONS[action];
  if (!rule) return null;
  if (isTerminal(current)) return null;
  return rule.from.includes(current) ? rule.to : null;
}

export function allowedActions(current: PermitStatus): PermitAction[] {
  if (isTerminal(current)) return [];
  return (Object.keys(TRANSITIONS) as PermitAction[]).filter((a) =>
    TRANSITIONS[a].from.includes(current),
  );
}

// URGENT SLA windows in minutes. The more hazardous the permit, the tighter the
// window. work_in_progress is the maximum authorised work duration.
export const SLA_MINUTES: Record<PermitStatus, Record<HazardTier, number>> = {
  permit_requested: {
    low: 5760, moderate: 2880, high: 1440, critical: 720, catastrophic: 360,
  },
  hazard_assessment: {
    low: 4320, moderate: 2880, high: 1440, critical: 720, catastrophic: 360,
  },
  isolation_pending: {
    low: 2880, moderate: 1440, high: 720, critical: 480, catastrophic: 240,
  },
  isolation_confirmed: {
    low: 1440, moderate: 720, high: 480, critical: 240, catastrophic: 120,
  },
  permit_issued: {
    low: 1440, moderate: 720, high: 480, critical: 240, catastrophic: 120,
  },
  work_in_progress: {
    low: 2880, moderate: 1440, high: 720, critical: 480, catastrophic: 240,
  },
  suspended: {
    low: 1440, moderate: 720, high: 480, critical: 240, catastrophic: 120,
  },
  work_complete: {
    low: 1440, moderate: 720, high: 480, critical: 240, catastrophic: 120,
  },
  permit_closed:   { low: 0, moderate: 0, high: 0, critical: 0, catastrophic: 0 },
  permit_rejected: { low: 0, moderate: 0, high: 0, critical: 0, catastrophic: 0 },
  permit_revoked:  { low: 0, moderate: 0, high: 0, critical: 0, catastrophic: 0 },
  withdrawn:       { low: 0, moderate: 0, high: 0, critical: 0, catastrophic: 0 },
};

export function slaWindowMinutes(state: PermitStatus, tier: HazardTier): number {
  return SLA_MINUTES[state]?.[tier] ?? 0;
}

export function slaDeadlineFor(
  state: PermitStatus,
  tier: HazardTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = slaWindowMinutes(state, tier);
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// Top hazard tiers — a critical / catastrophic permit attracts regulator
// attention on its own.
const HIGH_TIERS = new Set<HazardTier>(['critical', 'catastrophic']);

export function isHighTier(tier: HazardTier): boolean {
  return HIGH_TIERS.has(tier);
}

// Live (energised) work and confined-space entry are the two highest-consequence
// authorisations — they always notify regardless of the composite hazard tier.
export function isLiveOrConfined(liveWork: boolean, workClass: WorkClass): boolean {
  return liveWork || workClass === 'confined_space';
}

// W64 SIGNATURE — LIVE-WORK / ISOLATION-INTEGRITY driven crossing.
//   issue_permit crosses for EVERY tier when live/confined; otherwise only for
//   the top hazard tiers. revoke_permit ALWAYS crosses (emergency revocation /
//   isolation breach is always reportable).
export function crossesIntoRegulator(
  action: PermitAction,
  tier: HazardTier,
  liveWork: boolean,
  workClass: WorkClass,
): boolean {
  if (action === 'issue_permit') {
    return isLiveOrConfined(liveWork, workClass) || isHighTier(tier);
  }
  if (action === 'revoke_permit') return true;
  return false;
}

// sla_breached crosses for the top hazard tiers — a missed deadline on a
// critical / catastrophic permit is itself reportable.
export function slaBreachCrossesIntoRegulator(tier: HazardTier): boolean {
  return isHighTier(tier);
}

// Row-level "reportable" flag (drives the reportable dot): a permit is reportable
// if it authorises live/confined work, or sits in a top hazard tier.
export function isReportable(
  tier: HazardTier,
  liveWork: boolean,
  workClass: WorkClass,
): boolean {
  return isLiveOrConfined(liveWork, workClass) || isHighTier(tier);
}

export const ACTION_PARTY: Record<PermitAction, PermitParty> = {
  start_work:             'permit_holder',
  suspend_work:           'permit_holder',
  resume_work:            'permit_holder',
  complete_work:          'permit_holder',
  withdraw:               'permit_holder',
  begin_assessment:       'issuing_authority',
  approve_isolation_plan: 'issuing_authority',
  verify_isolation:       'issuing_authority',
  issue_permit:           'issuing_authority',
  close_permit:           'issuing_authority',
  reject_permit:          'issuing_authority',
  revoke_permit:          'issuing_authority',
};

export function partyForAction(action: PermitAction): PermitParty {
  return ACTION_PARTY[action];
}

export function isHolderAction(action: PermitAction): boolean {
  return ACTION_PARTY[action] === 'permit_holder';
}

// Classify a permit by its composite hazard-rating index (0..100).
export function tierForHazardScore(score: number): HazardTier {
  if (score < 20) return 'low';
  if (score < 40) return 'moderate';
  if (score < 60) return 'high';
  if (score < 80) return 'critical';
  return 'catastrophic';
}
