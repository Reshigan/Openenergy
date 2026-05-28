// ═══════════════════════════════════════════════════════════════════════════
// Wave 51 — Esums O&M Availability Guarantee & Liquidated Damages (pure spec).
//
// IEC 61724 / IEC 62446 PV O&M practice + standard REIPPPP O&M service
// agreement availability-guarantee mechanics. 12-state P6 lifecycle for the
// per-reporting-period reconciliation of CONTRACTED plant availability against
// the O&M contractor's guaranteed availability: the contractor submits the
// metered availability, the asset owner adjusts for excused downtime (grid
// outage / force majeure / owner-caused), the adjusted figure is reconciled
// against the guarantee, and the period is settled — either it meets the
// guarantee (and may earn a bonus) or it falls short and liquidated damages
// (LDs) are assessed, cured, disputed, or waived.
//
// This is the asset-management / availability counterpart to W24 (energy
// PERFORMANCE-RATIO underperformance — yield) — availability is time-based
// uptime, PR is energy-based yield; the two are distinct contractual metrics.
//
// Forward (happy / meets-guarantee) path:
//   period_open → measurement_submitted → adjustment_review → reconciled →
//   meets_guarantee → settled
//
// Shortfall (liquidated-damages) branch:
//   flag_shortfall (from reconciled) → shortfall_flagged → assess_ld →
//   ld_assessed → settle → settled
//   ...with an optional cure de-escalation: ld_assessed → agree_cure_plan →
//   cure_period → settle → settled, and a management waiver waive_ld →
//   settled (shares the .settled event with settle).
//
// Dispute branch:
//   raise_dispute (from shortfall_flagged | ld_assessed | cure_period) →
//   disputed → resolve_dispute → dispute_resolved
//
// Early exit:
//   withdraw (from period_open | measurement_submitted | adjustment_review) →
//   withdrawn   (period voided before reconciliation — e.g. data error)
//
// Terminals: settled, dispute_resolved, withdrawn
//
// Shortfall-severity tiers (percentage points the adjusted availability falls
// BELOW the guarantee), least → most severe:
//   minor_shortfall    — < 1 pp below guarantee
//   moderate_shortfall — 1 to < 3 pp
//   material_shortfall — 3 to < 5 pp
//   severe_shortfall   — 5 to < 10 pp
//   critical_shortfall — >= 10 pp (or sustained) — security-of-supply concern
//
// URGENT SLA matrix — the LARGER the availability shortfall, the TIGHTER the
// response window (a critically unavailable grid-connected generator is a
// supply-security concern). The back-office dispute phase is flat across tiers.
//
// Reportability (NERSA / regulator inbox crossings):
//   - flag_shortfall crosses for CRITICAL tiers (severe / critical) — a
//     sustained severe availability shortfall of a grid-connected generator is
//     a reportable security-of-supply incident.
//   - resolve_dispute crosses for CRITICAL tiers (a settlement dispute on a
//     severe shortfall).
//   - sla_breached crosses for CRITICAL tiers only.
//
// Single-party write: there is no O&M-contractor login — the Esums O&M
// operators record every party's action; the contractual party is captured
// separately via actor_party (asset_owner vs om_contractor), derived from the
// action. admin/support/ipp_developer write.
// ═══════════════════════════════════════════════════════════════════════════

export type AvailabilityGuaranteeStatus =
  | 'period_open'
  | 'measurement_submitted'
  | 'adjustment_review'
  | 'reconciled'
  | 'meets_guarantee'
  | 'shortfall_flagged'
  | 'ld_assessed'
  | 'cure_period'
  | 'settled'
  | 'disputed'
  | 'dispute_resolved'
  | 'withdrawn';

export type AvailabilityGuaranteeAction =
  | 'submit_measurement'
  | 'open_adjustment_review'
  | 'reconcile'
  | 'confirm_meets_guarantee'
  | 'flag_shortfall'
  | 'assess_ld'
  | 'agree_cure_plan'
  | 'settle'
  | 'waive_ld'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'withdraw';

export type AvailabilityShortfallTier =
  | 'minor_shortfall'
  | 'moderate_shortfall'
  | 'material_shortfall'
  | 'severe_shortfall'
  | 'critical_shortfall';

export type AvailabilityGuaranteeParty = 'asset_owner' | 'om_contractor';

interface TransitionRule {
  from: AvailabilityGuaranteeStatus[];
  to: AvailabilityGuaranteeStatus;
}

export const TRANSITIONS: Record<AvailabilityGuaranteeAction, TransitionRule> = {
  submit_measurement:     { from: ['period_open'], to: 'measurement_submitted' },
  open_adjustment_review: { from: ['measurement_submitted'], to: 'adjustment_review' },
  reconcile:              { from: ['adjustment_review'], to: 'reconciled' },
  confirm_meets_guarantee:{ from: ['reconciled'], to: 'meets_guarantee' },
  flag_shortfall:         { from: ['reconciled'], to: 'shortfall_flagged' },
  assess_ld:              { from: ['shortfall_flagged'], to: 'ld_assessed' },
  agree_cure_plan:        { from: ['ld_assessed'], to: 'cure_period' },
  settle:                 { from: ['meets_guarantee', 'ld_assessed', 'cure_period'], to: 'settled' },
  waive_ld:               { from: ['ld_assessed', 'cure_period'], to: 'settled' },
  raise_dispute:          { from: ['shortfall_flagged', 'ld_assessed', 'cure_period'], to: 'disputed' },
  resolve_dispute:        { from: ['disputed'], to: 'dispute_resolved' },
  withdraw:               { from: ['period_open', 'measurement_submitted', 'adjustment_review'], to: 'withdrawn' },
};

const TERMINALS = new Set<AvailabilityGuaranteeStatus>(['settled', 'dispute_resolved', 'withdrawn']);

const WITHDRAWABLE = new Set<AvailabilityGuaranteeStatus>([
  'period_open', 'measurement_submitted', 'adjustment_review',
]);

export function isTerminal(s: AvailabilityGuaranteeStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: AvailabilityGuaranteeStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export function nextStatus(
  current: AvailabilityGuaranteeStatus,
  action: AvailabilityGuaranteeAction,
): AvailabilityGuaranteeStatus | null {
  const rule = TRANSITIONS[action];
  if (!rule) return null;
  if (isTerminal(current)) return null;
  return rule.from.includes(current) ? rule.to : null;
}

export function allowedActions(
  current: AvailabilityGuaranteeStatus,
): AvailabilityGuaranteeAction[] {
  if (isTerminal(current)) return [];
  return (Object.keys(TRANSITIONS) as AvailabilityGuaranteeAction[]).filter((a) =>
    TRANSITIONS[a].from.includes(current),
  );
}

// URGENT SLA windows in minutes. The larger the shortfall band, the tighter the
// window. The dispute phase is flat across tiers (back-office arbitration).
export const SLA_MINUTES: Record<AvailabilityGuaranteeStatus, Record<AvailabilityShortfallTier, number>> = {
  period_open: {
    minor_shortfall: 10080, moderate_shortfall: 7200, material_shortfall: 5760,
    severe_shortfall: 4320, critical_shortfall: 2880,
  },
  measurement_submitted: {
    minor_shortfall: 5760, moderate_shortfall: 4320, material_shortfall: 2880,
    severe_shortfall: 1440, critical_shortfall: 720,
  },
  adjustment_review: {
    minor_shortfall: 5760, moderate_shortfall: 4320, material_shortfall: 2880,
    severe_shortfall: 1440, critical_shortfall: 720,
  },
  reconciled: {
    minor_shortfall: 2880, moderate_shortfall: 2160, material_shortfall: 1440,
    severe_shortfall: 720, critical_shortfall: 360,
  },
  meets_guarantee: {
    minor_shortfall: 2880, moderate_shortfall: 2880, material_shortfall: 2880,
    severe_shortfall: 2880, critical_shortfall: 2880,
  },
  shortfall_flagged: {
    minor_shortfall: 2880, moderate_shortfall: 2160, material_shortfall: 1440,
    severe_shortfall: 720, critical_shortfall: 360,
  },
  ld_assessed: {
    minor_shortfall: 4320, moderate_shortfall: 2880, material_shortfall: 1440,
    severe_shortfall: 720, critical_shortfall: 360,
  },
  cure_period: {
    minor_shortfall: 20160, moderate_shortfall: 14400, material_shortfall: 10080,
    severe_shortfall: 7200, critical_shortfall: 4320,
  },
  disputed: {
    minor_shortfall: 4320, moderate_shortfall: 4320, material_shortfall: 4320,
    severe_shortfall: 4320, critical_shortfall: 4320,
  },
  settled:          { minor_shortfall: 0, moderate_shortfall: 0, material_shortfall: 0, severe_shortfall: 0, critical_shortfall: 0 },
  dispute_resolved: { minor_shortfall: 0, moderate_shortfall: 0, material_shortfall: 0, severe_shortfall: 0, critical_shortfall: 0 },
  withdrawn:        { minor_shortfall: 0, moderate_shortfall: 0, material_shortfall: 0, severe_shortfall: 0, critical_shortfall: 0 },
};

export function slaWindowMinutes(
  state: AvailabilityGuaranteeStatus,
  tier: AvailabilityShortfallTier,
): number {
  return SLA_MINUTES[state]?.[tier] ?? 0;
}

export function slaDeadlineFor(
  state: AvailabilityGuaranteeStatus,
  tier: AvailabilityShortfallTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = slaWindowMinutes(state, tier);
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// Critical tiers: a severe / critical sustained availability shortfall of a
// grid-connected generator is a security-of-supply concern.
const CRITICAL_TIERS = new Set<AvailabilityShortfallTier>([
  'severe_shortfall', 'critical_shortfall',
]);

export function isCriticalTier(tier: AvailabilityShortfallTier): boolean {
  return CRITICAL_TIERS.has(tier);
}

// flag_shortfall crosses for critical tiers; resolve_dispute crosses for
// critical tiers (a settlement dispute on a severe shortfall).
export function crossesIntoRegulator(
  action: AvailabilityGuaranteeAction,
  tier: AvailabilityShortfallTier,
): boolean {
  if (action === 'flag_shortfall') return isCriticalTier(tier);
  if (action === 'resolve_dispute') return isCriticalTier(tier);
  return false;
}

// sla_breached crosses for critical tiers only — a missed response deadline on
// a critically unavailable generator is itself a reportable event.
export function slaBreachCrossesIntoRegulator(tier: AvailabilityShortfallTier): boolean {
  return isCriticalTier(tier);
}

// Row-level "reportable shortfall" flag (drives the reportable dot).
export function isReportable(tier: AvailabilityShortfallTier): boolean {
  return isCriticalTier(tier);
}

export const ACTION_PARTY: Record<AvailabilityGuaranteeAction, AvailabilityGuaranteeParty> = {
  submit_measurement:      'om_contractor',
  agree_cure_plan:         'om_contractor',
  raise_dispute:           'om_contractor',
  open_adjustment_review:  'asset_owner',
  reconcile:               'asset_owner',
  confirm_meets_guarantee: 'asset_owner',
  flag_shortfall:          'asset_owner',
  assess_ld:               'asset_owner',
  settle:                  'asset_owner',
  waive_ld:                'asset_owner',
  resolve_dispute:         'asset_owner',
  withdraw:                'asset_owner',
};

export function partyForAction(action: AvailabilityGuaranteeAction): AvailabilityGuaranteeParty {
  return ACTION_PARTY[action];
}

export function isContractorAction(action: AvailabilityGuaranteeAction): boolean {
  return ACTION_PARTY[action] === 'om_contractor';
}

// Classify a period by how many percentage points the adjusted availability
// falls below the guarantee. Non-positive shortfall (meets / exceeds) maps to
// the lightest band.
export function tierForShortfallPp(shortfallPp: number): AvailabilityShortfallTier {
  if (shortfallPp < 1) return 'minor_shortfall';
  if (shortfallPp < 3) return 'moderate_shortfall';
  if (shortfallPp < 5) return 'material_shortfall';
  if (shortfallPp < 10) return 'severe_shortfall';
  return 'critical_shortfall';
}
