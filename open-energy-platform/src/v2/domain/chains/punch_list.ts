// punch_list — construction defect (snag) remediation lifecycle as data.
//
// The owner's quality side identifies a defect against a contractor's work,
// assesses → assigns → the contractor remediates → the OWNER reinspects and
// accepts → close. The acceptance spine is structural, not a guard: close_punch
// leaves ONLY `accepted`, and the only path into `accepted` is accept_remediation
// (owner), which can only fire from `reinspected` (the owner having physically
// re-inspected). So a contractor can NEVER self-close a defect by merely
// claiming it fixed (reinspect_requested) — the state graph forces an owner
// acceptance before closure. No guard needed; the only path to closed is edge Y.
//
// Critical (life-safety) punches cross to the regulator: assign_remediation is
// guarded by regulatorPresentIfCritical, so a critical defect cannot be put into
// remediation without a regulator on the txn.
//
// NO claim key. A punch is a while-open ball-in-court, not permanent consumption
// of the asset — the same location is snagged again next inspection.
//
// settles:false — a punch is a construction quality control, never a payment
// (R-S5-1). Cost recovery from the contractor is a separate settlement chain.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure escalation-authority bucketing off the priority class. No clock, no env.
const authorityFor = (priority: Json | undefined): string => {
  switch (priority) {
    case 'critical': return 'project_director';
    case 'high': return 'project_manager';
    case 'standard': return 'quality_engineer';
    default: return 'site_supervisor';
  }
};

const bump = (n: Json | undefined): number => (typeof n === 'number' ? n : 0) + 1;

export const punchList: ChainDecl = {
  key: 'punch_list',
  noun: 'Punch list item',
  refPrefix: 'PL',
  title: (f) => `${(f.priority as string) ?? 'standard'} punch — ${(f.location as string) ?? (f.project_name as string) ?? 'site'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'FIDIC Silver Book', provision: 'cl.10 taking-over / defects notification', effect: 'requires' },
    { instrument: 'OHS Act 1993', provision: 's8 safe plant handover', effect: 'requires' },
  ],
  roles: ['owner', 'contractor', 'regulator', 'operator'],

  fields: {
    punch_number: { type: 'string', label: 'Punch number' },
    contractor_party: { type: 'party', role: 'contractor', label: 'Responsible contractor' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    project_name: { type: 'string', required: true, label: 'Project' },
    facility_name: { type: 'string', label: 'Facility' },
    location: { type: 'string', required: true, label: 'Location / zone' },
    defect_description: { type: 'string', required: true, label: 'Defect description' },
    workflow_class: { type: 'string', required: true, label: 'Class (safety_critical/functional/cosmetic/handover_blocker/...)' },
    priority: { type: 'string', required: true, label: 'Priority (critical/high/standard/low)' },
    authority_required: { type: 'string', label: 'Escalation authority' },
    blocks_handover: { type: 'boolean', label: 'Blocks handover' },
    life_safety_critical: { type: 'boolean', label: 'Life-safety critical' },
    drawing_ref: { type: 'string', label: 'Drawing ref' },
    specification_ref: { type: 'string', label: 'Specification ref' },
    remediation_cost_zar: { type: 'number', min: 0, label: 'Remediation cost (ZAR)' },
    photo_evidence_count: { type: 'number', min: 0, label: 'Photo evidence count' },
    response_text: { type: 'string', label: 'Contractor response' },
    rejection_count: { type: 'number', label: 'Times remediation rejected' },
    reinspection_count: { type: 'number', label: 'Times reinspection requested' },
    // written by derive, never by the client
    assessed_at: { type: 'string', label: 'Assessed at' },
    assigned_at: { type: 'string', label: 'Assigned at' },
    remediation_started_at: { type: 'string', label: 'Remediation started at' },
    reinspection_requested_at: { type: 'string', label: 'Reinspection requested at' },
    reinspected_at: { type: 'string', label: 'Reinspected at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    closed_at_punch: { type: 'string', label: 'Punch closed at' },
  },

  initial: 'identified',

  states: {
    identified: { label: 'Identified', terminal: false, holder: 'owner', sla: { hours: 8 } },
    assessed: { label: 'Assessed', terminal: false, holder: 'owner', sla: { hours: 8 } },
    assigned: { label: 'Assigned', terminal: false, holder: 'contractor', sla: { days: 2 } },
    in_remediation: { label: 'In remediation', terminal: false, holder: 'contractor', sla: { days: 5 } },
    reinspect_requested: { label: 'Reinspection requested', terminal: false, holder: 'owner', sla: { days: 2 } },
    reinspected: { label: 'Reinspected', terminal: false, holder: 'owner', sla: { hours: 8 } },
    accepted: { label: 'Accepted', terminal: false, holder: 'owner', sla: { hours: 24 } },
    on_hold: { label: 'On hold', terminal: false, holder: 'owner' },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    voided: { label: 'Voided', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'identified',
      by: ['owner', 'operator'],
      actorBecomes: 'owner',
      label: 'Raise punch',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        facility_name: { type: 'string' },
        location: { type: 'string', required: true },
        defect_description: { type: 'string', required: true },
        workflow_class: { type: 'string', required: true },
        priority: { type: 'string', required: true },
        blocks_handover: { type: 'boolean' },
        life_safety_critical: { type: 'boolean' },
        contractor_party: { type: 'party', role: 'contractor' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'assess',
      from: 'identified',
      to: 'assessed',
      by: ['owner', 'operator'],
      label: 'Assess defect',
      intent: 'primary',
      input: {
        drawing_ref: { type: 'string' },
        specification_ref: { type: 'string' },
        remediation_cost_zar: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f, at: Instant) => ({ authority_required: authorityFor(f.priority), assessed_at: isoUtc(at) }),
    },
    {
      // critical (life-safety) defects cross to the regulator: one must be a
      // party before the punch can go into remediation.
      id: 'assign_remediation',
      from: 'assessed',
      to: 'assigned',
      by: ['owner'],
      label: 'Assign to contractor',
      intent: 'primary',
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ assigned_at: isoUtc(at) }),
    },
    {
      id: 'start_remediation',
      from: 'assigned',
      to: 'in_remediation',
      by: ['contractor'],
      label: 'Start remediation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ remediation_started_at: isoUtc(at) }),
    },
    {
      id: 'request_reinspection',
      from: 'in_remediation',
      to: 'reinspect_requested',
      by: ['contractor'],
      label: 'Request reinspection',
      intent: 'primary',
      input: { response_text: { type: 'string' }, photo_evidence_count: { type: 'number', min: 0 } },
      guards: [],
      derive: (f, at: Instant) => ({ reinspection_requested_at: isoUtc(at), reinspection_count: bump(f.reinspection_count) }),
    },
    {
      id: 'perform_reinspection',
      from: 'reinspect_requested',
      to: 'reinspected',
      by: ['owner'],
      label: 'Perform reinspection',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ reinspected_at: isoUtc(at) }),
    },
    {
      // structural acceptance gate: the ONLY edge into `accepted`, owner-only,
      // and it can only fire from `reinspected`. close_punch below leaves ONLY
      // `accepted`, so a defect can never close without owner acceptance.
      id: 'accept_remediation',
      from: 'reinspected',
      to: 'accepted',
      by: ['owner'],
      label: 'Accept remediation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      id: 'reject_remediation',
      from: 'reinspected',
      to: 'in_remediation',
      by: ['owner'],
      label: 'Reject remediation',
      intent: 'secondary',
      requiresReason: ['defect_not_cleared', 'workmanship_inadequate', 'evidence_insufficient', 'new_defect_introduced'],
      guards: [],
      derive: (f, _at: Instant) => ({ rejection_count: bump(f.rejection_count) }),
    },
    {
      id: 'close_punch',
      from: 'accepted',
      to: 'closed',
      by: ['owner', 'system'],
      label: 'Close punch',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_punch: isoUtc(at) }),
    },

    // --- hold / resume --------------------------------------------------------
    {
      id: 'put_on_hold',
      from: ['assigned', 'in_remediation'],
      to: 'on_hold',
      by: ['owner', 'contractor'],
      label: 'Put on hold',
      intent: 'secondary',
      requiresReason: ['access_blocked', 'materials_awaited', 'design_query_open', 'weather'],
      guards: [],
    },
    { id: 'resume', from: 'on_hold', to: 'in_remediation', by: ['owner'], label: 'Resume remediation', intent: 'primary', guards: [] },

    // --- exits ----------------------------------------------------------------
    {
      id: 'void_punch',
      from: ['identified', 'assessed', 'assigned', 'in_remediation', 'reinspect_requested', 'reinspected', 'on_hold'],
      to: 'voided',
      by: ['owner', 'operator'],
      label: 'Void punch',
      intent: 'destructive',
      requiresReason: ['duplicate', 'raised_in_error', 'out_of_scope', 'superseded'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['identified', 'assessed'],
      to: 'withdrawn',
      by: ['owner'],
      label: 'Withdraw punch',
      intent: 'destructive',
      requiresReason: ['not_a_defect', 'accepted_as_built', 'no_longer_required'],
      guards: [],
    },
  ],

  // accepted-not-closed time-bar: an accepted defect left unclosed auto-closes at
  // the bar (the remediation is signed off; closure is administrative).
  timers: [{ onState: 'accepted', after: { hours: 24 }, fire: 'close_punch', kind: 'time_bar' }],
};
