// gcc_ncr — grid-code non-conformance register + CAP remediation lifecycle, as
// data. Distinct from the `grid_code_compliance` chain (a directive/verify
// workflow): this one is the corrective-action-plan (CAP) variant — table
// `oe_grid_code_compliance`, spec `src/utils/grid-code-compliance-spec.ts`.
//
// A connected facility sits under continuous SO/TSO monitoring the moment it
// registers (`open` → `monitoring`). Only when a parameter breaches a Grid
// Code / NRS 048-2/4 limit does the operator raise a formal non-conformance,
// which then runs assess → require CAP → facility submits CAP → operator
// approves/rejects it (a revise loop back to `corrective_action_required`) →
// facility remediates → operator retests → confirm compliance (closed).
//
// Structural honesty (no invented guards):
//  - `confirm_compliance` is the ONLY edge into `compliant_closed`, and it can
//    only fire from `compliance_retest` — reachable only via
//    `initiate_retest` from `remediation_in_progress`. A case can NEVER close
//    without an actual retest after remediation — the state graph enforces
//    it, no guard needed.
//  - `open` is guarded by counterpartyDistinct: the operator and the
//    connected facility must be different legal entities (no self-monitoring).
//  - `escalate_disconnection` is guarded by regulatorPresentIfStrategic: a
//    ≥100 MW facility cannot be disconnected without a regulator already on
//    the txn (mirrors the real system's `crossesIntoRegulator` reportability
//    signature for disconnection, restricted here to the strategic-capacity
//    case the registry guard actually encodes — not "every tier").
//  - `operating_restriction` is a holding state, not a dead end: it re-enters
//    the remediation spine via `begin_remediation` (matches the real
//    TRANSITIONS table exactly) or can still escalate to disconnection.
//
// Split write (matches the real route's role gate): submit_cap and
// begin_remediation are the connected FACILITY's actions; every other edge is
// the SO/TSO (operator)'s.
//
// settles:false — a compliance register entry is a regulatory control
// record, never a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// Pure severity tiering — mirrors tierForNonConformance() in
// grid-code-compliance-spec.ts (capacity band, floored by breach-class
// criticality). Domain/ can't import route utils, so it's replicated here;
// keep in sync if the real bands move.
const TIER_RANK: Record<string, number> = { minor: 0, moderate: 1, material: 2, serious: 3, critical: 4 };
const RANK_TIER = ['minor', 'moderate', 'material', 'serious', 'critical'];
const STABILITY_CRITICAL_BREACHES = new Set(['fault_ride_through', 'frequency_response', 'protection_coordination']);
const SYSTEM_BREACHES = new Set(['reactive_power', 'voltage_regulation']);

const tierForCapacityMw = (mw: number): string => {
  if (mw < 1) return 'minor';
  if (mw < 10) return 'moderate';
  if (mw < 50) return 'material';
  if (mw < 200) return 'serious';
  return 'critical';
};

const breachClassFloor = (breachClass: string): string => {
  if (STABILITY_CRITICAL_BREACHES.has(breachClass)) return 'serious';
  if (SYSTEM_BREACHES.has(breachClass)) return 'material';
  return 'minor';
};

const severityTier = (capacityMw: Json | undefined, breachClass: Json | undefined): string => {
  const mw = typeof capacityMw === 'number' ? capacityMw : 0;
  const bc = typeof breachClass === 'string' ? breachClass : '';
  const rank = Math.max(TIER_RANK[tierForCapacityMw(mw)], TIER_RANK[breachClassFloor(bc)] ?? 0);
  return RANK_TIER[rank];
};

export const gccNcr: ChainDecl = {
  key: 'gcc_ncr',
  noun: 'Grid-code compliance case',
  refPrefix: 'GCCN',
  title: (f) =>
    `Grid-code case — ${(f.facility_name as string) ?? 'unnamed facility'}: ${(f.parameter as string) ?? 'under monitoring'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'Network Code + Grid Connection Code for Renewable Power Plants — compliance monitoring', effect: 'requires' },
    { instrument: 'NRS 048-2/4', provision: 'Power-quality limits', effect: 'restricts' },
    { instrument: 'ERA 2006', provision: 's27 licence conditions & directives (disconnection)', effect: 'authorises' },
  ],
  roles: ['operator', 'facility', 'regulator'],

  fields: {
    facility_name: { type: 'string', required: true, label: 'Facility' },
    facility_party: { type: 'party', role: 'facility', label: 'Connected facility' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    connection_point: { type: 'string', label: 'Connection point' },
    network_area: { type: 'string', label: 'Network area (transmission/distribution)' },
    licence_ref: { type: 'string', label: 'Licence ref' },
    technology: { type: 'string', label: 'Technology' },
    capacity_mw: { type: 'number', min: 0, label: 'Non-compliant capacity (MW)' },
    breach_class: { type: 'string', label: 'Breach class' },
    parameter: { type: 'string', label: 'Parameter (e.g. Voltage pu)' },
    measured_value: { type: 'number', label: 'Measured value' },
    limit_value: { type: 'number', label: 'Code limit value' },
    code_reference: { type: 'string', label: 'Code reference' },
    raise_basis: { type: 'string', label: 'Raise basis' },
    assessment_ref: { type: 'string', label: 'Assessment ref' },
    assessment_basis: { type: 'string', label: 'Assessment basis' },
    corrective_action_basis: { type: 'string', label: 'Corrective-action basis' },
    cap_basis: { type: 'string', label: 'CAP basis' },
    cap_ref: { type: 'string', label: 'CAP ref' },
    approval_basis: { type: 'string', label: 'CAP approval basis' },
    remediation_basis: { type: 'string', label: 'Remediation basis' },
    retest_basis: { type: 'string', label: 'Retest basis' },
    retest_ref: { type: 'string', label: 'Retest ref' },
    compliance_summary: { type: 'string', label: 'Compliance summary' },
    restriction_basis: { type: 'string', label: 'Restriction basis' },
    restriction_ref: { type: 'string', label: 'Restriction ref' },
    disconnection_basis: { type: 'string', label: 'Disconnection basis' },
    disconnection_ref: { type: 'string', label: 'Disconnection ref' },
    // written by derive, never by the client
    severity_tier: { type: 'string', label: 'Severity tier' },
    raised_at: { type: 'string', label: 'Non-conformance raised at' },
    restricted_at: { type: 'string', label: 'Restriction imposed at' },
    disconnected_at: { type: 'string', label: 'Disconnection issued at' },
    closed_at: { type: 'string', label: 'Compliance confirmed at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'monitoring',

  states: {
    monitoring: { label: 'Under monitoring', terminal: false, holder: 'operator', sla: { days: 90 } },
    non_conformance_raised: { label: 'Non-conformance raised', terminal: false, holder: 'operator', sla: { days: 3 } },
    under_assessment: { label: 'Under assessment', terminal: false, holder: 'operator', sla: { days: 2 } },
    corrective_action_required: { label: 'Corrective action required', terminal: false, holder: 'facility', sla: { days: 7 } },
    cap_submitted: { label: 'CAP submitted', terminal: false, holder: 'operator', sla: { days: 5 } },
    cap_approved: { label: 'CAP approved', terminal: false, holder: 'facility', sla: { days: 5 } },
    remediation_in_progress: { label: 'Remediation in progress', terminal: false, holder: 'operator', sla: { days: 14 } },
    compliance_retest: { label: 'Compliance retest', terminal: false, holder: 'operator', sla: { days: 5 } },
    operating_restriction: { label: 'Operating restriction', terminal: false, holder: 'facility', sla: { days: 7 } },
    compliant_closed: { label: 'Compliant — closed', terminal: true, holder: 'none' },
    disconnection_issued: { label: 'Disconnection issued', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'monitoring',
      by: ['operator'],
      actorBecomes: 'operator',
      label: 'Register facility for grid-code monitoring',
      intent: 'primary',
      input: {
        facility_name: { type: 'string', required: true },
        facility_party: { type: 'party', role: 'facility', required: true },
        regulator_party: { type: 'party', role: 'regulator' },
        connection_point: { type: 'string' },
        network_area: { type: 'string' },
        licence_ref: { type: 'string' },
        technology: { type: 'string' },
      },
      // SO ≠ connected facility (no self-monitoring).
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'raise_non_conformance',
      from: 'monitoring',
      to: 'non_conformance_raised',
      by: ['operator'],
      label: 'Raise non-conformance',
      intent: 'primary',
      input: {
        parameter: { type: 'string', required: true },
        measured_value: { type: 'number', required: true },
        limit_value: { type: 'number', required: true },
        code_reference: { type: 'string', required: true },
        breach_class: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        raise_basis: { type: 'string', required: true },
      },
      guards: [],
      derive: (f, at: Instant) => ({ severity_tier: severityTier(f.capacity_mw, f.breach_class), raised_at: isoUtc(at) }),
    },
    {
      id: 'begin_assessment',
      from: 'non_conformance_raised',
      to: 'under_assessment',
      by: ['operator'],
      label: 'Begin assessment',
      intent: 'primary',
      input: { assessment_ref: { type: 'string' }, assessment_basis: { type: 'string' } },
      guards: [],
    },
    {
      id: 'require_corrective_action',
      from: 'under_assessment',
      to: 'corrective_action_required',
      by: ['operator'],
      label: 'Require corrective action',
      intent: 'primary',
      input: { corrective_action_basis: { type: 'string' } },
      guards: [],
    },
    {
      id: 'submit_cap',
      from: 'corrective_action_required',
      to: 'cap_submitted',
      by: ['facility'],
      label: 'Submit corrective-action plan',
      intent: 'primary',
      input: { cap_basis: { type: 'string' }, cap_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'approve_cap',
      from: 'cap_submitted',
      to: 'cap_approved',
      by: ['operator'],
      label: 'Approve CAP',
      intent: 'primary',
      input: { approval_basis: { type: 'string', required: true } },
      guards: [],
    },
    {
      // revise loop: a rejected CAP lands right back where it started — the
      // facility never sees "approved" without the operator actually saying so.
      id: 'reject_cap',
      from: 'cap_submitted',
      to: 'corrective_action_required',
      by: ['operator'],
      label: 'Reject CAP',
      intent: 'secondary',
      input: { corrective_action_basis: { type: 'string' } },
      requiresReason: ['cap_insufficient', 'scope_incomplete', 'timeline_unrealistic', 'evidence_missing'],
      guards: [],
    },
    {
      id: 'begin_remediation',
      from: ['cap_approved', 'operating_restriction'],
      to: 'remediation_in_progress',
      by: ['facility'],
      label: 'Begin remediation',
      intent: 'primary',
      input: { remediation_basis: { type: 'string' } },
      guards: [],
    },
    {
      id: 'initiate_retest',
      from: 'remediation_in_progress',
      to: 'compliance_retest',
      by: ['operator'],
      label: 'Initiate compliance retest',
      intent: 'primary',
      input: { retest_basis: { type: 'string' }, retest_ref: { type: 'string' } },
      guards: [],
    },
    {
      // structural gate: the ONLY edge into compliant_closed, and it can only
      // fire from compliance_retest — reachable only after actual remediation
      // (see header). A case can never close without a retest on file.
      id: 'confirm_compliance',
      from: 'compliance_retest',
      to: 'compliant_closed',
      by: ['operator'],
      label: 'Confirm compliance',
      intent: 'primary',
      input: { retest_basis: { type: 'string' }, compliance_summary: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
    {
      id: 'impose_restriction',
      from: ['under_assessment', 'remediation_in_progress', 'compliance_retest'],
      to: 'operating_restriction',
      by: ['operator'],
      label: 'Impose operating restriction',
      intent: 'destructive',
      input: { restriction_basis: { type: 'string', required: true }, restriction_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ restricted_at: isoUtc(at) }),
    },
    {
      // a ≥100 MW facility can't be disconnected without a regulator already
      // on the txn — the strategic-capacity case the registry guard encodes.
      id: 'escalate_disconnection',
      from: ['corrective_action_required', 'operating_restriction'],
      to: 'disconnection_issued',
      by: ['operator'],
      label: 'Escalate to disconnection',
      intent: 'destructive',
      input: { disconnection_basis: { type: 'string', required: true }, disconnection_ref: { type: 'string' } },
      requiresReason: ['stability_risk', 'observability_loss', 'no_cap', 'persistent_noncompliance'],
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ disconnected_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['non_conformance_raised', 'under_assessment'],
      to: 'withdrawn',
      by: ['operator'],
      label: 'Withdraw non-conformance',
      intent: 'destructive',
      input: { compliance_summary: { type: 'string' } },
      requiresReason: ['raised_in_error', 'superseded', 'duplicate_case', 'condition_self_cleared'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],

  // No timers: the real system's SLA sweep (gridCodeComplianceSlaSweep) bumps
  // escalation_level and records a breach marker WITHOUT changing chain_status
  // — it isn't a state transition, so it doesn't fit the TimerDecl contract
  // (fire must be a real edge). Modelling it as a forced auto-transition would
  // misrepresent a monitoring signal as an automatic decision.
};
