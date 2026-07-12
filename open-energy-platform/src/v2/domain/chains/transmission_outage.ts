// transmission_outage — grid transmission outage lifecycle as data.
//
// An outage planner requests a window against a transmission asset; the system
// operator runs security_assessment → n1_contingency → reliability committee
// review → approval → window open → in progress → return to service → archive.
//
// The security spine is STRUCTURAL, not a guard: approve_outage leaves ONLY
// reliability_committee_review, and the ONLY path into that state runs through
// run_n1_contingency (via convene_committee). So an outage can NEVER be approved
// on plant whose N-1 contingency was never assessed — a person cannot green-light
// a switching that would leave the grid non-secure. No guard enforces this; the
// state graph does.
//
// Critical-tier work (400kV+ national backbone) also crosses to the regulator:
// approve_outage is guarded by regulatorPresentIfCritical. Tier + priority are
// derived purely from the transmission voltage at the assessment step.
//
// NO claim key. An outage is while-open exclusivity over an asset window, NOT a
// permanent consumption — the same corridor is scheduled again next cycle. A
// permanent claim would wrongly block the asset forever. Genuine concurrent-window
// exclusion needs a claim+release mechanism the domain does not yet model —
// deliberately out of scope (same call as permit_to_work).
//
// settles:false — an outage is a grid reliability control, never a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure voltage-tier bucketing off the numeric kV. No clock, no env.
const outageTier = (kv: Json | undefined): string => {
  if (typeof kv !== 'number') return 'unassessed';
  if (kv >= 400) return 'critical_400kv_plus';
  if (kv >= 275) return 'high_275kv';
  if (kv >= 132) return 'medium_132kv';
  return 'low_sub132kv';
};

export const transmissionOutage: ChainDecl = {
  key: 'transmission_outage',
  noun: 'Transmission outage',
  refPrefix: 'TO',
  title: (f) =>
    `${(f.tier as string) ?? 'unassessed'} outage — ${(f.corridor_name as string) ?? (f.asset_label as string) ?? 'unnamed asset'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'Network Code — outage planning & N-1 security', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'System Operations Code — switching authorisation', effect: 'requires' },
  ],
  roles: ['planner', 'operator', 'regulator'],

  fields: {
    outage_number: { type: 'string', label: 'Outage number' },
    planner_party: { type: 'party', role: 'planner', label: 'Outage planner' },
    operator_party: { type: 'party', role: 'operator', label: 'System operator' },
    asset_id: { type: 'string', required: true, label: 'Asset id' },
    asset_label: { type: 'string', label: 'Asset' },
    transmission_voltage_kv: { type: 'number', min: 0, required: true, label: 'Voltage (kV)' },
    corridor_name: { type: 'string', label: 'Corridor' },
    substation_a: { type: 'string', label: 'Substation A' },
    substation_b: { type: 'string', label: 'Substation B' },
    affected_circuits_count: { type: 'number', min: 0, label: 'Affected circuits' },
    outage_type: { type: 'string', label: 'Outage type (planned/forced/emergency)' },
    outage_reason: { type: 'string', label: 'Outage reason' },
    scheduled_start_at: { type: 'string', label: 'Scheduled start' },
    scheduled_end_at: { type: 'string', label: 'Scheduled end' },
    security_margin_pct: { type: 'number', min: 0, max: 100, label: 'Security margin %' },
    n1_pass_count: { type: 'number', min: 0, label: 'N-1 pass count' },
    n1_fail_count: { type: 'number', min: 0, label: 'N-1 fail count' },
    suspend_count: { type: 'number', label: 'Times suspended' },
    // written by derive, never by the client
    tier: { type: 'string', label: 'Voltage tier' },
    priority: { type: 'string', label: 'Priority' },
    security_assessment_at: { type: 'string', label: 'Security assessed at' },
    approved_at: { type: 'string', label: 'Approved at' },
    window_opened_at: { type: 'string', label: 'Window opened at' },
    returned_to_service_at: { type: 'string', label: 'Returned to service at' },
    archived_at: { type: 'string', label: 'Archived at' },
  },

  initial: 'outage_requested',

  states: {
    outage_requested: { label: 'Outage requested', terminal: false, holder: 'operator', sla: { hours: 24 } },
    security_assessment: { label: 'Security assessment', terminal: false, holder: 'operator', sla: { hours: 12 } },
    n1_contingency_run: { label: 'N-1 contingency run', terminal: false, holder: 'operator', sla: { hours: 12 } },
    reliability_committee_review: { label: 'Reliability committee review', terminal: false, holder: 'operator', sla: { hours: 24 } },
    outage_approved: { label: 'Outage approved', terminal: false, holder: 'planner', sla: { hours: 8 } },
    outage_window_open: { label: 'Outage window open', terminal: false, holder: 'planner' },
    outage_in_progress: { label: 'Outage in progress', terminal: false, holder: 'planner' },
    suspended: { label: 'Suspended', terminal: false, holder: 'operator' },
    outage_completed: { label: 'Outage completed', terminal: false, holder: 'operator', sla: { hours: 4 } },
    return_to_service: { label: 'Return to service', terminal: false, holder: 'operator', sla: { hours: 4 } },
    post_outage_review: { label: 'Post-outage review', terminal: false, holder: 'operator', sla: { hours: 48 } },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    emergency_cancelled: { label: 'Emergency cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'outage_requested',
      by: ['planner', 'operator'],
      actorBecomes: 'planner',
      label: 'Request outage',
      intent: 'primary',
      input: {
        asset_id: { type: 'string', required: true },
        asset_label: { type: 'string' },
        transmission_voltage_kv: { type: 'number', min: 0, required: true },
        corridor_name: { type: 'string' },
        substation_a: { type: 'string' },
        substation_b: { type: 'string' },
        affected_circuits_count: { type: 'number', min: 0 },
        outage_type: { type: 'string' },
        outage_reason: { type: 'string' },
        scheduled_start_at: { type: 'string' },
        scheduled_end_at: { type: 'string' },
        operator_party: { type: 'party', role: 'operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      // derives the voltage tier + priority — this is what the critical-tier
      // regulator gate on approve_outage reads back off txn.fields.
      id: 'run_security_assessment',
      from: 'outage_requested',
      to: 'security_assessment',
      by: ['operator'],
      label: 'Run security assessment',
      intent: 'primary',
      input: { security_margin_pct: { type: 'number', min: 0, max: 100 } },
      guards: [],
      derive: (f, at: Instant) => ({
        tier: outageTier(f.transmission_voltage_kv),
        priority: typeof f.transmission_voltage_kv === 'number' && f.transmission_voltage_kv >= 400 ? 'critical' : 'normal',
        security_assessment_at: isoUtc(at),
      }),
    },
    {
      id: 'run_n1_contingency',
      from: 'security_assessment',
      to: 'n1_contingency_run',
      by: ['operator'],
      label: 'Run N-1 contingency',
      intent: 'primary',
      input: {
        n1_pass_count: { type: 'number', min: 0, required: true },
        n1_fail_count: { type: 'number', min: 0, required: true },
      },
      guards: [],
    },
    {
      id: 'convene_committee',
      from: 'n1_contingency_run',
      to: 'reliability_committee_review',
      by: ['operator'],
      label: 'Convene reliability committee',
      intent: 'primary',
      guards: [],
    },
    {
      // structural security gate: the ONLY edge into outage_approved, and it can
      // only fire from reliability_committee_review — reachable ONLY through
      // run_n1_contingency. An outage therefore cannot be approved on plant whose
      // N-1 contingency was never assessed. Critical-tier (400kV+) additionally
      // needs a regulator on the txn.
      id: 'approve_outage',
      from: 'reliability_committee_review',
      to: 'outage_approved',
      by: ['operator'],
      label: 'Approve outage',
      intent: 'primary',
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'open_window',
      from: 'outage_approved',
      to: 'outage_window_open',
      by: ['planner'],
      label: 'Open outage window',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ window_opened_at: isoUtc(at) }),
    },
    { id: 'begin_outage', from: 'outage_window_open', to: 'outage_in_progress', by: ['planner'], label: 'Begin outage', intent: 'primary', guards: [] },
    {
      id: 'suspend_outage',
      from: 'outage_in_progress',
      to: 'suspended',
      by: ['operator', 'planner'],
      label: 'Suspend outage',
      intent: 'secondary',
      requiresReason: ['grid_stress', 'weather', 'unplanned_demand', 'safety_hold', 'contingency_triggered'],
      guards: [],
      derive: (f, _at: Instant) => ({ suspend_count: (typeof f.suspend_count === 'number' ? f.suspend_count : 0) + 1 }),
    },
    { id: 'resume_outage', from: 'suspended', to: 'outage_in_progress', by: ['operator'], label: 'Resume outage', intent: 'primary', guards: [] },
    { id: 'complete_outage', from: 'outage_in_progress', to: 'outage_completed', by: ['planner'], label: 'Complete outage', intent: 'primary', guards: [] },
    {
      id: 'return_to_service',
      from: 'outage_completed',
      to: 'return_to_service',
      by: ['operator'],
      label: 'Return to service',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ returned_to_service_at: isoUtc(at) }),
    },
    { id: 'post_review', from: 'return_to_service', to: 'post_outage_review', by: ['operator'], label: 'Post-outage review', intent: 'primary', guards: [] },
    {
      id: 'archive',
      from: 'post_outage_review',
      to: 'archived',
      by: ['operator'],
      label: 'Archive outage',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ archived_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_outage',
      from: ['outage_requested', 'security_assessment', 'n1_contingency_run', 'reliability_committee_review'],
      to: 'rejected',
      by: ['operator'],
      label: 'Reject outage',
      intent: 'destructive',
      requiresReason: ['n1_failure', 'insufficient_security_margin', 'window_conflict', 'incomplete_submission'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['outage_requested', 'security_assessment'],
      to: 'withdrawn',
      by: ['planner'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['work_cancelled', 'rescheduled', 'no_longer_required'],
      guards: [],
    },
    {
      id: 'emergency_cancel',
      from: ['outage_approved', 'outage_window_open', 'outage_in_progress', 'suspended'],
      to: 'emergency_cancelled',
      by: ['operator', 'regulator'],
      label: 'Emergency cancel',
      intent: 'destructive',
      requiresReason: ['grid_emergency', 'security_breach', 'load_shedding_stage_escalation', 'regulator_directive'],
      guards: [],
    },
  ],

  // approved-window time-bar: an approved outage whose window is never opened by
  // its scheduled start stales out — an authorised switching cannot sit valid
  // indefinitely. record-only stub; the sweep computes the real bar off state sla
  // hours (permit_to_work pattern).
  timers: [{ onState: 'outage_approved', after: { hours: 0 }, fire: 'emergency_cancel', kind: 'time_bar' }],
};
