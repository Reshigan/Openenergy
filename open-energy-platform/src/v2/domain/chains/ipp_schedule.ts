// ipp_schedule — IPP construction schedule baseline lifecycle as data.
//
// The Gantt/WBS itself is a render; what lands as a Transaction is the
// BASELINE and every re-baseline (baseline change) of it. An IPP drafts a
// schedule baseline, submits it, a reviewer approves it → a live baseline. When
// the project slips, a re-baseline is a first-class transaction: request →
// review → approve, versioning the baseline each time.
//
// The temporal spine is structural: request_rebaseline leaves ONLY
// baseline_active, and the ONLY path into baseline_active is approve_baseline /
// approve_rebaseline. So you can NEVER re-baseline a schedule that was never
// baselined — no guard needed, the state graph enforces it.
//
// A reportable (critical-tier / NERSA) schedule's re-baseline crosses to the
// regulator: approve_rebaseline is guarded by regulatorPresentIfCritical.
//
// settles:false — a schedule baseline is a construction control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure slip-tier bucketing off the numeric slip days. No clock, no env.
const healthBand = (slipDays: Json | undefined): string => {
  if (typeof slipDays !== 'number') return 'unknown';
  if (slipDays <= 0) return 'green';
  if (slipDays <= 30) return 'amber';
  return 'red';
};

const nextVersion = (v: Json | undefined): number => (typeof v === 'number' ? v : 0) + 1;

export const ippSchedule: ChainDecl = {
  key: 'ipp_schedule',
  noun: 'IPP schedule baseline',
  refPrefix: 'IPPS',
  title: (f) => `IPP schedule — ${(f.project_name as string) ?? 'unnamed project'} (baseline v${(f.baseline_version as number) ?? 0})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement construction milestones', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'connection & COD schedule reporting', effect: 'requires' },
  ],
  roles: ['ipp', 'reviewer', 'regulator', 'operator'],

  fields: {
    schedule_ref: { type: 'string', label: 'Schedule ref' },
    ipp_party: { type: 'party', role: 'ipp', label: 'IPP (schedule owner)' },
    reviewer_party: { type: 'party', role: 'reviewer', label: 'Schedule reviewer' },
    project_name: { type: 'string', required: true, label: 'Project' },
    project_id: { type: 'string', label: 'Project id' },
    wbs_summary: { type: 'string', label: 'WBS summary' },
    planned_start: { type: 'string', label: 'Planned start' },
    planned_finish: { type: 'string', required: true, label: 'Planned finish (COD)' },
    revised_planned_finish: { type: 'string', label: 'Revised planned finish' },
    slip_days: { type: 'number', label: 'Slip vs baseline (days)' },
    priority: { type: 'string', label: 'Tier (normal/critical)' },
    baseline_ref: { type: 'string', label: 'Baseline document ref' },
    rebaseline_count: { type: 'number', label: 'Times re-baselined' },
    // written by derive, never by the client
    baseline_version: { type: 'number', label: 'Baseline version' },
    schedule_health_band: { type: 'string', label: 'Schedule health' },
    baseline_set_at: { type: 'string', label: 'Baseline set at' },
    rebaselined_at: { type: 'string', label: 'Last re-baselined at' },
    completed_at_ipps: { type: 'string', label: 'Schedule completed at' },
  },

  initial: 'schedule_drafted',

  states: {
    schedule_drafted: { label: 'Schedule drafted', terminal: false, holder: 'ipp', sla: { days: 5 } },
    baseline_review: { label: 'Baseline in review', terminal: false, holder: 'reviewer', sla: { days: 3 } },
    baseline_active: { label: 'Baseline active', terminal: false, holder: 'ipp' },
    rebaseline_review: { label: 'Re-baseline in review', terminal: false, holder: 'reviewer', sla: { days: 3 } },
    schedule_completed: { label: 'Schedule completed', terminal: true, holder: 'none' },
    schedule_rejected: { label: 'Baseline rejected', terminal: true, holder: 'none' },
    schedule_cancelled: { label: 'Schedule cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'schedule_drafted',
      by: ['ipp', 'operator'],
      actorBecomes: 'ipp',
      label: 'Draft schedule',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        project_id: { type: 'string' },
        wbs_summary: { type: 'string' },
        planned_start: { type: 'string' },
        planned_finish: { type: 'string', required: true },
        priority: { type: 'string' },
        baseline_ref: { type: 'string' },
        reviewer_party: { type: 'party', role: 'reviewer' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'submit_for_review',
      from: 'schedule_drafted',
      to: 'baseline_review',
      by: ['ipp'],
      label: 'Submit baseline for review',
      intent: 'primary',
      input: { baseline_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      // the ONLY first path into baseline_active — stamps v1 baseline.
      id: 'approve_baseline',
      from: 'baseline_review',
      to: 'baseline_active',
      by: ['reviewer'],
      label: 'Approve baseline',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => ({
        baseline_version: nextVersion(f.baseline_version),
        schedule_health_band: 'green',
        baseline_set_at: isoUtc(at),
      }),
    },
    {
      // a baseline change is a first-class transaction. Only reachable from a
      // live baseline_active — you cannot re-baseline what was never baselined.
      id: 'request_rebaseline',
      from: 'baseline_active',
      to: 'rebaseline_review',
      by: ['ipp'],
      label: 'Request re-baseline',
      intent: 'secondary',
      requiresReason: ['weather_delay', 'grid_connection_delay', 'supply_chain', 'scope_change', 'force_majeure', 'contractor_default'],
      input: {
        revised_planned_finish: { type: 'string', required: true },
        slip_days: { type: 'number', required: true },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ schedule_health_band: healthBand(f.slip_days) }),
    },
    {
      // reportable/critical-tier re-baselines cross to the regulator.
      id: 'approve_rebaseline',
      from: 'rebaseline_review',
      to: 'baseline_active',
      by: ['reviewer'],
      label: 'Approve re-baseline',
      intent: 'primary',
      guards: ['regulatorPresentIfCritical'],
      derive: (f, at: Instant) => ({
        baseline_version: nextVersion(f.baseline_version),
        rebaseline_count: (typeof f.rebaseline_count === 'number' ? f.rebaseline_count : 0) + 1,
        schedule_health_band: healthBand(f.slip_days),
        rebaselined_at: isoUtc(at),
        planned_finish: (f.revised_planned_finish as string) ?? f.planned_finish,
      }),
    },
    {
      id: 'complete_schedule',
      from: 'baseline_active',
      to: 'schedule_completed',
      by: ['ipp', 'reviewer'],
      label: 'Complete schedule (COD reached)',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ completed_at_ipps: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_baseline',
      from: ['baseline_review', 'rebaseline_review'],
      to: 'schedule_rejected',
      by: ['reviewer'],
      label: 'Reject baseline',
      intent: 'destructive',
      requiresReason: ['unrealistic_durations', 'missing_dependencies', 'wbs_incomplete', 'resource_infeasible'],
      guards: [],
    },
    {
      id: 'cancel_schedule',
      from: ['schedule_drafted', 'baseline_review', 'baseline_active'],
      to: 'schedule_cancelled',
      by: ['ipp', 'operator'],
      label: 'Cancel schedule',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'superseded_baseline', 'financial_close_lapsed'],
      guards: [],
    },
  ],
};
