// ═══════════════════════════════════════════════════════════════════════════
// Wave 55 — OEM-Support Firmware / Security-Patch & Vulnerability Remediation
// chain (pure spec).
//
// The vulnerability-remediation lifecycle — the FOURTH member of the ITIL
// service-management family on the support profile, alongside:
//   - W14 support-ticket    : restore service for ONE incident (incident mgmt).
//   - W41 problem-management : root-cause of recurring incidents (problem mgmt).
//   - W47 change-enablement  : authorise/schedule/deploy a CHANGE (change mgmt).
//   - W55 security-remediation: drive an OEM/CERT vulnerability or firmware
//                               advisory through a remediation campaign across
//                               the affected deployed-asset fleet (THIS chain —
//                               information-security / vulnerability mgmt).
// Distinct from W47: change-enablement AUTHORISES a proposed change; this chain
// is the security-driven remediation of a KNOWN vulnerability — triage by CVSS,
// scope the affected fleet of OT configuration items (inverters, SCADA, BMS,
// controllers), authorise and stage the patch rollout, verify it, and close it —
// OR formally accept the residual risk if it cannot be patched, OR back the
// patch out if it induces a regression.
//
// Standards framing:
//   - IEC 62443-2-3 (patch management for IACS / OT environments) + 62443-3-3.
//   - ISO/IEC 27001:2022 A.8.8 (management of technical vulnerabilities) +
//     A.8.28; ITIL 4 Information Security Management practice.
//   - Cybercrimes Act 19/2020 + POPIA (security-compromise / safeguards) and the
//     NERSA Grid Code where firmware affects grid-connected equipment.
//
// Forward path:
//   advisory_received → triaged → impact_assessment → fleet_scoped →
//     remediation_approved → rollout_in_progress → verification → resolved
//
// Mitigation (containment) branch: impact_assessment → mitigation_applied — an
//   interim compensating control (segmentation / firewall rule / disable port)
//   when a fix is not yet available; then scope_fleet (or accept_risk).
// Emergency fast-path: triaged → remediation_approved (emergency_authorize) — a
//   critical CVE skips full impact-assessment/scoping; the security authority
//   authorises out-of-band.
// Not-affected early exit: triaged → not_affected (advisory does not affect the
//   deployed fleet).
// Risk-acceptance branch: impact_assessment | mitigation_applied | fleet_scoped →
//   risk_accepted (no patch; residual risk formally accepted with compensating
//   controls).
// Backout branch: rollout_in_progress | verification → rolled_back (the patch
//   induced a regression — execute the documented backout).
//
// CVSS severity tiers (drive SLA windows + reportability):
//   critical      (CVSS 9.0–10.0) — TIGHTEST windows.
//   high          (CVSS 7.0–8.9).
//   medium        (CVSS 4.0–6.9).
//   low           (CVSS 0.1–3.9).
//   informational (CVSS 0.0 / advisory-only) — LOOSEST windows.
//
// URGENT SLA — the higher the CVSS severity, the TIGHTER every window.
//
// Reportability (regulator inbox crossings) — vulnerability management is
// internal security ops; only the highest-impact security-posture exceptions on
// the regulated OT estate are notifiable:
//   - accept_risk  — formally accepting an UNPATCHED serious vulnerability is a
//                    reportable security-posture exception (the W55 signature):
//                    crosses for critical + high; low/medium/informational stay
//                    internal.
//   - roll_back    — a backed-out patch is a remediation-induced failure on
//                    regulated equipment: crosses for critical + high.
//   - sla_breached — crosses for critical only.
//
// Write model — SINGLE-PARTY {admin, support} (same as W41/W47). No access split.
// Each event is tagged with the security functional party that owns the action
// (security_analyst / security_authority / remediation_engineer) for audit
// attribution — functional tagging, NOT an access-control split.
// ═══════════════════════════════════════════════════════════════════════════

export type RemediationStatus =
  | 'advisory_received'
  | 'triaged'
  | 'impact_assessment'
  | 'mitigation_applied'
  | 'fleet_scoped'
  | 'remediation_approved'
  | 'rollout_in_progress'
  | 'verification'
  | 'resolved'
  | 'not_affected'
  | 'risk_accepted'
  | 'rolled_back';

export type RemediationAction =
  | 'triage'
  | 'assess_impact'
  | 'apply_mitigation'
  | 'mark_not_affected'
  | 'emergency_authorize'
  | 'scope_fleet'
  | 'approve_remediation'
  | 'begin_rollout'
  | 'complete_rollout'
  | 'verify'
  | 'accept_risk'
  | 'roll_back';

export type RemediationTier =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'informational';

// Security functional party that owns each action (recorded as actor_party —
// functional attribution for audit, NOT a write-access split).
export type RemediationParty =
  | 'security_analyst'
  | 'security_authority'
  | 'remediation_engineer';

interface TransitionRule {
  next: RemediationStatus;
}

export const TRANSITIONS: Record<
  RemediationStatus,
  Partial<Record<RemediationAction, TransitionRule>>
> = {
  advisory_received: {
    triage: { next: 'triaged' },
  },
  triaged: {
    assess_impact:       { next: 'impact_assessment' },
    emergency_authorize: { next: 'remediation_approved' },
    mark_not_affected:   { next: 'not_affected' },
  },
  impact_assessment: {
    scope_fleet:     { next: 'fleet_scoped' },
    apply_mitigation:{ next: 'mitigation_applied' },
    accept_risk:     { next: 'risk_accepted' },
  },
  mitigation_applied: {
    scope_fleet: { next: 'fleet_scoped' },
    accept_risk: { next: 'risk_accepted' },
  },
  fleet_scoped: {
    approve_remediation: { next: 'remediation_approved' },
    accept_risk:         { next: 'risk_accepted' },
  },
  remediation_approved: {
    begin_rollout: { next: 'rollout_in_progress' },
  },
  rollout_in_progress: {
    complete_rollout: { next: 'verification' },
    roll_back:        { next: 'rolled_back' },
  },
  verification: {
    verify:    { next: 'resolved' },
    roll_back: { next: 'rolled_back' },
  },
  resolved:      {},
  not_affected:  {},
  risk_accepted: {},
  rolled_back:   {},
};

const TERMINALS = new Set<RemediationStatus>([
  'resolved', 'not_affected', 'risk_accepted', 'rolled_back',
]);

export function isTerminal(s: RemediationStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: RemediationStatus,
  action: RemediationAction,
): RemediationStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: RemediationStatus): RemediationAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as RemediationAction[];
}

// URGENT SLA windows in minutes — the higher the CVSS severity, the TIGHTER.
// Keyed by the deadline to take the NEXT action out of each state. Strictly
// increasing across tiers (critical smallest → informational largest).
export const SLA_MINUTES: Record<RemediationStatus, Record<RemediationTier, number>> = {
  // advisory_received → triage
  advisory_received: {
    critical: 60, high: 240, medium: 720, low: 2880, informational: 10080,
  },
  // triaged → assess_impact / emergency_authorize / mark_not_affected
  triaged: {
    critical: 120, high: 480, medium: 1440, low: 4320, informational: 14400,
  },
  // impact_assessment → scope_fleet / apply_mitigation / accept_risk
  impact_assessment: {
    critical: 240, high: 720, medium: 2880, low: 7200, informational: 20160,
  },
  // mitigation_applied → scope_fleet / accept_risk
  mitigation_applied: {
    critical: 480, high: 1440, medium: 4320, low: 10080, informational: 30240,
  },
  // fleet_scoped → approve_remediation / accept_risk
  fleet_scoped: {
    critical: 480, high: 1440, medium: 4320, low: 10080, informational: 30240,
  },
  // remediation_approved → begin_rollout
  remediation_approved: {
    critical: 720, high: 2880, medium: 7200, low: 14400, informational: 43200,
  },
  // rollout_in_progress → complete_rollout
  rollout_in_progress: {
    critical: 1440, high: 4320, medium: 10080, low: 20160, informational: 60480,
  },
  // verification → verify / roll_back
  verification: {
    critical: 720, high: 2880, medium: 7200, low: 14400, informational: 43200,
  },
  resolved:      { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
  not_affected:  { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
  risk_accepted: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
  rolled_back:   { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
};

export function slaDeadlineFor(
  state: RemediationStatus,
  tier: RemediationTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// CVSS v3.1 base-score severity buckets.
export function tierForCvss(score: number): RemediationTier {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >= 0.1) return 'low';
  return 'informational';
}

// Severity tiers that surface to the regulator on a risk-acceptance or a
// backed-out patch — critical + high are serious vulnerabilities on the
// regulated OT estate; medium/low/informational stay internal.
const REPORTABLE_TIERS = new Set<RemediationTier>(['critical', 'high']);

export function isReportableTier(tier: RemediationTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// Regulator inbox crossings.
//   accept_risk crosses for critical + high (the W55 signature — formally
//               accepting an unpatched serious vulnerability is a reportable
//               security-posture exception).
//   roll_back   crosses for critical + high (remediation-induced failure on
//               regulated equipment).
export function crossesIntoRegulator(
  action: RemediationAction,
  tier: RemediationTier,
): boolean {
  if (action === 'accept_risk') return REPORTABLE_TIERS.has(tier);
  if (action === 'roll_back')   return REPORTABLE_TIERS.has(tier);
  return false;
}

// sla_breached crosses for critical only.
export function slaBreachCrossesIntoRegulator(tier: RemediationTier): boolean {
  return tier === 'critical';
}

// Security functional party that owns each action.
const ACTION_PARTY: Record<RemediationAction, RemediationParty> = {
  triage:              'security_analyst',
  assess_impact:       'security_analyst',
  apply_mitigation:    'remediation_engineer',
  mark_not_affected:   'security_authority',
  emergency_authorize: 'security_authority',
  scope_fleet:         'remediation_engineer',
  approve_remediation: 'security_authority',
  begin_rollout:       'remediation_engineer',
  complete_rollout:    'remediation_engineer',
  verify:              'security_authority',
  accept_risk:         'security_authority',
  roll_back:           'remediation_engineer',
};

export function partyForAction(action: RemediationAction): RemediationParty {
  return ACTION_PARTY[action];
}
