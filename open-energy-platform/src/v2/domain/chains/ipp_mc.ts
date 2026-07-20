// ipp_mc — REIPPPP IPP-Office milestone certification gate, as data.
//
// An IPP developer schedules a milestone (financial close, construction
// start, test COD, COD, grid connection, commissioning complete, performance
// test complete), commences the IPP-Office's final review, and the review
// resolves to certified, rejected, or lapsed (the scheduled window closed
// without a certification). This is a self-attested gate — the v1 descriptor
// names no separate reviewer role, only the developer (and admin override) —
// so the developer drives every edge; what changes the stakes is capacity.
//
// Structural honesty (no invented guards):
//  - open is guarded by complianceHaltClear: scheduling a new milestone
//    certification is a new commitment, blocked under a platform-wide halt
//    like every other @new edge in this bundle.
//  - certify_milestone is guarded by regulatorPresentIfStrategic: a ≥100 MW
//    (utility/strategic-tier) project needs the regulator on the txn before
//    the milestone can be certified — matches the v1 cascadeHint ("for
//    utility/strategic projects crosses the NERSA/DMRE inbox").
//  - no counterpartyDistinct guard — counterpartyCol is null in the v1
//    descriptor; a milestone certification has no second commercial party,
//    only the developer being checked against the IPP-Office bar.
//  - no timer: the v1 descriptor marks sla_due_date as an "INVERTED SLA"
//    (the deadline sits on the developer reaching the milestone, not on a
//    reviewer turnaround), which the Duration-since-state-entry timer model
//    here can't represent per-txn without fabricating a fixed window — so
//    lapse_milestone stays a manual/cascade-driven edge, not a fired timer.
//
// settles:false — quantumCol is null in the v1 descriptor; a milestone
// certification is a compliance record, it never moves quantum or payment
// (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippMc: ChainDecl = {
  key: 'ipp_mc',
  noun: 'IPP milestone certification',
  refPrefix: 'IMC',
  title: (f) => `Milestone — ${(f.milestone_type as string) ?? 'milestone'} (${(f.project_ref as string) ?? 'project TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'IPP-Office milestone certification gate', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'grid connection / COD milestone reporting', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator'],

  fields: {
    project_ref: { type: 'string', required: true, label: 'Project reference' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    milestone_type: { type: 'string', required: true, label: 'Milestone type' },
    capacity_mw: { type: 'number', required: true, min: 0, label: 'Project capacity (MW)' },
    energy_type: { type: 'string', label: 'Energy type' },
    scheduled_date: { type: 'string', label: 'Scheduled date' },
    ie_report_ref: { type: 'string', label: 'Independent Engineer report ref' },
    notes: { type: 'string', label: 'Notes' },
    rejection_reason: { type: 'string', label: 'Rejection basis' },
    lapse_notes: { type: 'string', label: 'Lapse notes' },
    // written by derive, never by the client
    final_review_started_at: { type: 'string', label: 'Final review started at' },
    certified_at: { type: 'string', label: 'Certified at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    lapsed_at: { type: 'string', label: 'Lapsed at' },
  },

  initial: 'milestone_scheduled',

  states: {
    milestone_scheduled: { label: 'Milestone scheduled', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    final_review: { label: 'Final review', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    milestone_certified: { label: 'Milestone certified', terminal: true, holder: 'none' },
    milestone_rejected: { label: 'Milestone rejected', terminal: true, holder: 'none' },
    milestone_lapsed: { label: 'Milestone lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'milestone_scheduled',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Schedule milestone',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        milestone_type: { type: 'string', required: true },
        capacity_mw: { type: 'number', required: true, min: 0 },
        energy_type: { type: 'string' },
        scheduled_date: { type: 'string' },
        ie_report_ref: { type: 'string' },
        notes: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // scheduling a new milestone certification is a new commitment — blocked under halt.
      guards: ['complianceHaltClear'],
    },
    {
      id: 'commence_final_review',
      from: 'milestone_scheduled',
      to: 'final_review',
      by: ['ipp_developer'],
      label: 'Commence final review',
      intent: 'primary',
      input: { ie_report_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ final_review_started_at: isoUtc(at) }),
    },
    {
      // strategic-tier (≥100 MW) certification needs the regulator on the txn —
      // mirrors the v1 cascadeHint ("crosses the NERSA/DMRE inbox").
      id: 'certify_milestone',
      from: 'final_review',
      to: 'milestone_certified',
      by: ['ipp_developer'],
      label: 'Certify milestone',
      intent: 'primary',
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ certified_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_milestone',
      from: 'final_review',
      to: 'milestone_rejected',
      by: ['ipp_developer'],
      label: 'Reject milestone',
      intent: 'destructive',
      input: { rejection_reason: { type: 'string' } },
      requiresReason: ['ie_report_deficient', 'construction_incomplete', 'commissioning_test_failed', 'documentation_incomplete', 'grid_code_noncompliance'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'lapse_milestone',
      from: ['milestone_scheduled', 'final_review'],
      to: 'milestone_lapsed',
      by: ['ipp_developer'],
      label: 'Lapse milestone',
      intent: 'destructive',
      input: { lapse_notes: { type: 'string' } },
      requiresReason: ['window_expired', 'ie_report_overdue', 'project_abandoned', 'developer_non_response'],
      guards: [],
      derive: (_f, at: Instant) => ({ lapsed_at: isoUtc(at) }),
    },
  ],
};
