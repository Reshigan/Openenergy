// pm_compliance — preventive-maintenance schedule compliance as data (W59).
//
// A maintenance planner assigns a scheduled PM task against a site asset per its
// IEC 62446 RCM tier. The assignee either executes it (start → complete) or, when
// site conditions block it, requests a deferral the planner rules on. The safety
// spine is structural + guarded: SKIPPING a PM outright (skip_pm) is the only
// destructive exit that abandons the task uncompleted, and for a safety-critical
// tier (priority = 'critical') it crosses to the regulator — skip_pm is guarded by
// regulatorPresentIfCritical, so a critical PM can NEVER be skipped without a
// regulator on the txn. A non-critical PM skips without one.
//
// Completion is structurally gated too: the ONLY edge into `completed` is
// complete_pm, and it can only fire from in_progress — which only start_pm
// reaches. So a PM cannot be marked complete without having been started.
//
// NO claim key. A PM task is a recurring calendar obligation, not permanent
// consumption of the asset — the same asset is maintained again next cycle. A
// permanent claim would wrongly block the asset forever (same call as
// permit_to_work / licence_application).
//
// settles:false — a maintenance-compliance record is an operational control,
// never a payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const pmCompliance: ChainDecl = {
  key: 'pm_compliance',
  noun: 'PM compliance record',
  refPrefix: 'PC',
  title: (f) =>
    `${(f.rcm_tier as string) ?? 'PM'} — ${(f.asset_name as string) ?? 'unnamed asset'} @ ${(f.site_name as string) ?? 'site'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'IEC 62446', provision: '§6 periodic inspection & RCM maintenance tiers', effect: 'requires' },
    { instrument: 'OHS Act 1993', provision: 's8 safe plant maintenance', effect: 'requires' },
  ],
  roles: ['assignee', 'planner', 'regulator', 'operator'],

  fields: {
    pm_number: { type: 'string', label: 'PM number' },
    planner_party: { type: 'party', role: 'planner', label: 'Maintenance planner' },
    assignee_party: { type: 'party', role: 'assignee', label: 'Assigned technician / O&M' },
    asset_name: { type: 'string', required: true, label: 'Asset' },
    equipment_tag: { type: 'string', label: 'Equipment tag' },
    site_name: { type: 'string', required: true, label: 'Site' },
    pm_task: { type: 'string', required: true, label: 'PM task description' },
    rcm_tier: { type: 'string', required: true, label: 'RCM tier (tier_1/tier_2/tier_3)' },
    // 'critical' ⇒ safety-critical tier; drives regulatorPresentIfCritical on skip.
    priority: { type: 'string', label: 'Priority (routine/high/critical)' },
    iec_standard_ref: { type: 'string', label: 'IEC / OEM standard ref' },
    due_date: { type: 'string', label: 'Scheduled due date' },
    rescheduled_date: { type: 'string', label: 'Rescheduled date' },
    work_order_ref: { type: 'string', label: 'Dispatched work-order ref (W16)' },
    completion_evidence_ref: { type: 'string', label: 'Completion evidence ref' },
    defer_count: { type: 'number', label: 'Times deferred' },
    // written by derive, never by the client
    assigned_at: { type: 'string', label: 'Assigned at' },
    deferred_at: { type: 'string', label: 'Deferred at' },
    started_at: { type: 'string', label: 'PM started at' },
    completed_at: { type: 'string', label: 'PM completed at' },
    skipped_at: { type: 'string', label: 'PM skipped at' },
    availability_baseline_reset: { type: 'boolean', label: 'Availability baseline reset (W51)' },
  },

  initial: 'work_assigned',

  states: {
    work_assigned: { label: 'Work assigned', terminal: false, holder: 'assignee', sla: { hours: 24 } },
    deferral_requested: { label: 'Deferral requested', terminal: false, holder: 'planner', sla: { hours: 8 } },
    deferred: { label: 'Deferred', terminal: false, holder: 'planner' },
    in_progress: { label: 'PM in progress', terminal: false, holder: 'assignee', sla: { hours: 12 } },
    completed: { label: 'PM completed', terminal: true, holder: 'none' },
    skipped: { label: 'PM skipped', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'work_assigned',
      by: ['planner', 'operator'],
      actorBecomes: 'planner',
      label: 'Assign PM',
      intent: 'primary',
      input: {
        asset_name: { type: 'string', required: true },
        equipment_tag: { type: 'string' },
        site_name: { type: 'string', required: true },
        pm_task: { type: 'string', required: true },
        rcm_tier: { type: 'string', required: true },
        priority: { type: 'string' },
        iec_standard_ref: { type: 'string' },
        due_date: { type: 'string' },
        assignee_party: { type: 'party', role: 'assignee' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ assigned_at: isoUtc(at) }),
    },
    {
      id: 'start_pm',
      from: 'work_assigned',
      to: 'in_progress',
      by: ['assignee', 'operator'],
      label: 'Start PM',
      intent: 'primary',
      input: { work_order_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ started_at: isoUtc(at) }),
    },
    {
      // structural completion gate: the ONLY edge into `completed`, and it can only
      // fire from in_progress — which only start_pm reaches. No complete-without-start.
      id: 'complete_pm',
      from: 'in_progress',
      to: 'completed',
      by: ['assignee'],
      label: 'Complete PM',
      intent: 'primary',
      input: { completion_evidence_ref: { type: 'string', required: true } },
      guards: [],
      // W51: a completed PM resets the availability baseline.
      derive: (_f, at: Instant) => ({ completed_at: isoUtc(at), availability_baseline_reset: true }),
    },
    {
      id: 'request_deferral',
      from: 'work_assigned',
      to: 'deferral_requested',
      by: ['assignee', 'operator'],
      label: 'Request deferral',
      intent: 'secondary',
      requiresReason: ['site_conditions', 'weather', 'access_blocked', 'spares_unavailable', 'resource_conflict'],
      guards: [],
    },
    {
      id: 'approve_deferral',
      from: 'deferral_requested',
      to: 'deferred',
      by: ['planner'],
      label: 'Approve deferral',
      intent: 'primary',
      input: { rescheduled_date: { type: 'string' } },
      guards: [],
      derive: (f, at: Instant) => ({
        deferred_at: isoUtc(at),
        defer_count: (typeof f.defer_count === 'number' ? f.defer_count : 0) + 1,
      }),
    },
    {
      // deferral refused (e.g. safety-critical tier cannot defer) — task returns to
      // the assignee, still owed. Not terminal.
      id: 'reject_deferral',
      from: 'deferral_requested',
      to: 'work_assigned',
      by: ['planner'],
      label: 'Reject deferral',
      intent: 'secondary',
      requiresReason: ['safety_critical_tier', 'grid_code_required', 'sla_breach_risk', 'insufficient_justification'],
      guards: [],
    },
    {
      // a deferred PM is rescheduled back into the assigned queue for its new date.
      id: 'reschedule',
      from: 'deferred',
      to: 'work_assigned',
      by: ['planner', 'operator'],
      label: 'Reschedule PM',
      intent: 'primary',
      input: { rescheduled_date: { type: 'string' } },
      guards: [],
    },

    // --- exits ----------------------------------------------------------------
    {
      // abandon a PM uncompleted. For a safety-critical tier (priority='critical')
      // this crosses to the regulator — skip_pm is guarded by
      // regulatorPresentIfCritical, so a critical PM cannot be skipped without one.
      id: 'skip_pm',
      from: ['work_assigned', 'deferral_requested', 'deferred'],
      to: 'skipped',
      by: ['planner', 'regulator', 'system'],
      label: 'Skip PM',
      intent: 'destructive',
      requiresReason: ['asset_decommissioned', 'redundant_task', 'risk_accepted', 'superseded_by_upgrade', 'due_window_expired'],
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ skipped_at: isoUtc(at) }),
    },
    {
      id: 'cancel',
      from: ['work_assigned', 'deferral_requested', 'deferred'],
      to: 'cancelled',
      by: ['planner'],
      label: 'Cancel PM record',
      intent: 'destructive',
      requiresReason: ['duplicate_record', 'scheduling_error', 'asset_transferred'],
      guards: [],
    },
  ],

  // PM-overdue time-bar: an assigned PM left unstarted 30 days past assignment
  // has missed its maintenance cycle and stales into a skip decision
  // (ppa_contract / permit_to_work pattern).
  timers: [{ onState: 'work_assigned', after: { days: 30 }, fire: 'skip_pm', kind: 'time_bar', reason: 'due_window_expired' }],
};
