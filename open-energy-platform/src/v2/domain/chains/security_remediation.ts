// security_remediation — OT/ICS security-advisory (CVE) remediation lifecycle as
// data. Support triages an OEM/CERT advisory against the deployed fleet, assesses
// impact, applies compensating mitigation, scopes affected CIs, gets the fleet
// operator's approval, rolls the patch out, verifies it, and resolves.
//
// The safety spine is STRUCTURAL, not a guard: `resolve` leaves ONLY `verification`,
// and the ONLY path into `verification` is `verify` from `rollout_in_progress`. So a
// CVE can NEVER be marked resolved without a rollout that was actually verified — you
// cannot close out a vulnerability on evidence you never checked. The state graph
// alone enforces it; no guard needed.
//
// Critical-severity advisories are reportable and cross to the regulator:
// approve_remediation is guarded by regulatorPresentIfCritical (reads `priority`).
//
// settles:false — a remediation is a safety/compliance control, never a payment
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure CVSS v3.1 base-score → severity tier. No clock, no env. (0..10)
const severityTier = (score: Json | undefined): string => {
  if (typeof score !== 'number') return 'unassessed';
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  if (score > 0) return 'low';
  return 'informational';
};

export const securityRemediation: ChainDecl = {
  key: 'security_remediation',
  noun: 'Security remediation',
  refPrefix: 'SECU',
  title: (f) =>
    `${(f.severity_tier as string) ?? 'unassessed'} remediation — ${(f.cve_id as string) ?? (f.advisory_ref as string) ?? 'advisory'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'network cyber-security & control-system integrity', effect: 'requires' },
    { instrument: 'ECT Act 2002', provision: 'critical-information-infrastructure protection', effect: 'requires' },
  ],
  roles: ['support', 'operator', 'regulator'],

  fields: {
    remediation_number: { type: 'string', label: 'Remediation number' },
    support_party: { type: 'party', role: 'support', label: 'Security owner' },
    operator_party: { type: 'party', role: 'operator', label: 'Fleet operator' },
    advisory_ref: { type: 'string', label: 'Advisory reference' },
    advisory_source: { type: 'string', label: 'Advisory source (oem/ics_cert/nvd)' },
    cve_id: { type: 'string', label: 'CVE id' },
    cvss_score: { type: 'number', min: 0, max: 10, label: 'CVSS v3.1 base score' },
    severity_tier: { type: 'string', label: 'Severity tier' },
    priority: { type: 'string', label: 'Priority (critical/high/medium/low)' },
    oem_vendor: { type: 'string', label: 'OEM / vendor' },
    product_family: { type: 'string', label: 'Product family' },
    ci_type: { type: 'string', label: 'CI type (inverter/scada/bms/rtu)' },
    affected_versions: { type: 'string', label: 'Affected firmware versions' },
    fixed_version: { type: 'string', label: 'Fixed firmware version' },
    patch_package_ref: { type: 'string', label: 'Patch package ref' },
    backout_plan_ref: { type: 'string', label: 'Backout plan ref' },
    compensating_control: { type: 'string', label: 'Compensating control' },
    affected_ci_count: { type: 'number', min: 0, label: 'Affected CI count' },
    patched_ci_count: { type: 'number', min: 0, label: 'Patched CI count' },
    sites_affected: { type: 'number', min: 0, label: 'Sites affected' },
    residual_risk_basis: { type: 'string', label: 'Residual-risk basis' },
    // written by derive, never by the client
    triaged_at: { type: 'string', label: 'Triaged at' },
    impact_assessment_at: { type: 'string', label: 'Impact assessed at' },
    mitigation_applied_at: { type: 'string', label: 'Mitigation applied at' },
    fleet_scoped_at: { type: 'string', label: 'Fleet scoped at' },
    remediation_approved_at: { type: 'string', label: 'Remediation approved at' },
    rollout_started_at: { type: 'string', label: 'Rollout started at' },
    verification_at: { type: 'string', label: 'Verified at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
  },

  initial: 'advisory_received',

  states: {
    advisory_received: { label: 'Advisory received', terminal: false, holder: 'support', sla: { hours: 8 } },
    triaged: { label: 'Triaged', terminal: false, holder: 'support', sla: { hours: 24 } },
    impact_assessment: { label: 'Impact assessment', terminal: false, holder: 'support', sla: { hours: 24 } },
    mitigation_applied: { label: 'Mitigation applied', terminal: false, holder: 'support', sla: { hours: 48 } },
    fleet_scoped: { label: 'Fleet scoped', terminal: false, holder: 'support', sla: { hours: 24 } },
    remediation_approved: { label: 'Remediation approved', terminal: false, holder: 'operator', sla: { hours: 72 } },
    rollout_in_progress: { label: 'Rollout in progress', terminal: false, holder: 'operator' },
    verification: { label: 'Verification', terminal: false, holder: 'support', sla: { hours: 24 } },
    resolved: { label: 'Resolved', terminal: true, holder: 'none' },
    not_affected: { label: 'Not affected', terminal: true, holder: 'none' },
    risk_accepted: { label: 'Risk accepted', terminal: true, holder: 'none' },
    rolled_back: { label: 'Rolled back', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'advisory_received',
      by: ['support', 'operator'],
      actorBecomes: 'support',
      label: 'Record advisory',
      intent: 'primary',
      input: {
        advisory_ref: { type: 'string' },
        advisory_source: { type: 'string' },
        cve_id: { type: 'string' },
        oem_vendor: { type: 'string' },
        product_family: { type: 'string' },
        ci_type: { type: 'string' },
        affected_versions: { type: 'string' },
        operator_party: { type: 'party', role: 'operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'triage',
      from: 'advisory_received',
      to: 'triaged',
      by: ['support'],
      label: 'Triage advisory',
      intent: 'primary',
      // priority carries the escalation tier the regulator gate reads later.
      input: {
        cvss_score: { type: 'number', min: 0, max: 10 },
        priority: { type: 'string' },
      },
      guards: [],
      derive: (f, at: Instant) => ({ triaged_at: isoUtc(at), severity_tier: severityTier(f.cvss_score) }),
    },
    {
      id: 'assess_impact',
      from: 'triaged',
      to: 'impact_assessment',
      by: ['support'],
      label: 'Assess fleet impact',
      intent: 'primary',
      input: {
        affected_ci_count: { type: 'number', min: 0 },
        sites_affected: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ impact_assessment_at: isoUtc(at) }),
    },
    {
      id: 'apply_mitigation',
      from: 'impact_assessment',
      to: 'mitigation_applied',
      by: ['support'],
      label: 'Apply compensating control',
      intent: 'primary',
      input: { compensating_control: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ mitigation_applied_at: isoUtc(at) }),
    },
    {
      id: 'scope_fleet',
      from: 'mitigation_applied',
      to: 'fleet_scoped',
      by: ['support'],
      label: 'Scope affected CIs',
      intent: 'primary',
      input: {
        patch_package_ref: { type: 'string', required: true },
        fixed_version: { type: 'string' },
        backout_plan_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ fleet_scoped_at: isoUtc(at) }),
    },
    {
      id: 'approve_remediation',
      from: 'fleet_scoped',
      to: 'remediation_approved',
      by: ['operator'],
      label: 'Approve remediation',
      intent: 'primary',
      // critical-severity advisories are reportable — a regulator must be a party.
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ remediation_approved_at: isoUtc(at) }),
    },
    {
      id: 'begin_rollout',
      from: 'remediation_approved',
      to: 'rollout_in_progress',
      by: ['operator'],
      label: 'Begin patch rollout',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ rollout_started_at: isoUtc(at) }),
    },
    {
      id: 'verify',
      from: 'rollout_in_progress',
      to: 'verification',
      by: ['support'],
      label: 'Verify patched fleet',
      intent: 'primary',
      input: { patched_ci_count: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ verification_at: isoUtc(at) }),
    },
    {
      // structural safety gate: the ONLY edge into `resolved`, and it can only fire
      // from `verification` — which only `verify` reaches from a real rollout. A CVE
      // therefore cannot be closed as resolved on an unverified patch. No guard.
      id: 'resolve',
      from: 'verification',
      to: 'resolved',
      by: ['support'],
      label: 'Resolve remediation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },

    // --- off-ramps -----------------------------------------------------------
    {
      id: 'mark_not_affected',
      from: ['advisory_received', 'triaged', 'impact_assessment'],
      to: 'not_affected',
      by: ['support'],
      label: 'Mark not affected',
      intent: 'destructive',
      requiresReason: ['product_not_deployed', 'version_not_vulnerable', 'config_not_exploitable', 'duplicate_advisory'],
      guards: [],
    },
    {
      id: 'accept_risk',
      from: ['impact_assessment', 'fleet_scoped', 'remediation_approved'],
      to: 'risk_accepted',
      by: ['operator', 'regulator'],
      label: 'Accept residual risk',
      intent: 'destructive',
      requiresReason: ['no_fix_available', 'patch_breaks_operations', 'end_of_life_asset', 'compensating_control_sufficient'],
      input: { residual_risk_basis: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'rollback',
      from: ['rollout_in_progress', 'verification'],
      to: 'rolled_back',
      by: ['operator', 'support'],
      label: 'Roll back patch',
      intent: 'destructive',
      requiresReason: ['patch_regression', 'firmware_bricked_ci', 'grid_stability_risk', 'verification_failed'],
      guards: [],
    },
  ],

  // triage SLA on a freshly received advisory: a critical CVE left un-triaged past
  // the window escalates. Record-only stub; the sweep computes the real bar off the
  // state's sla hours (permit_to_work / ppa_contract pattern).
  timers: [{ onState: 'advisory_received', after: { hours: 0 }, fire: 'triage', kind: 'sla' }],
};
