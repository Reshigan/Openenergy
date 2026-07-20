// ipp_method_statement — construction Method Statement / Safe Work Method
// Statement (SWMS) lifecycle as data.
//
// OHSA Construction Regulations 2014 reg.7 planning companion to W64
// permit_to_work: a method statement is drafted and approved BEFORE work
// starts (the SWMS), whereas a permit authorises a single work window against
// it. An IPP developer drafts the statement, submits it for safety review,
// completes the hazard/risk assessment, gets it approved, briefs the crew
// (toolbox talk), then executes: start → [suspend/resume]* → complete →
// close → archive.
//
// Legacy DDL (mig 364, oe_ipp_method_statements) has no counterparty column —
// this is a single-party safety-planning record, same pattern as ncr.ts;
// counterpartyDistinct never applies. The EPC contractor is carried as a live
// party (contractor_party) purely for lane visibility ('quality' lane) — v1's
// action.roles never restricted an edge to epc_contractor specifically, so
// every edge here is actor-gated on ipp_developer only.
//
// Regulator crossing: the legacy cascadeHint says critical-lift, confined-
// space and live-electrical work crosses the regulator queue at approval.
// Only two of those three bridge cleanly onto a registry guard —
// regulatorPresentIfHighHazard reads live_work/work_class, so `open` derives
// those from is_live_electrical / is_confined_space. Critical-lift has no
// matching registry guard (none of the 10 model a lift-specific crossing), so
// that leg of the crossing is left to the cascade layer, not fabricated here.
//
// settles:false — a method statement is a safety-planning/compliance record,
// never a payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippMethodStatement: ChainDecl = {
  key: 'ipp_method_statement',
  noun: 'Method statement',
  refPrefix: 'MS',
  title: (f) => `${(f.ms_number as string) ?? 'MS'} — ${(f.ms_title as string) ?? 'unnamed method statement'} (${(f.risk_tier as string) ?? 'risk TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'OHS Act 1993', provision: 'Construction Regulations 2014 reg.7 (method statement / SWMS)', effect: 'requires' },
    { instrument: 'REIPPPP', provision: 'IPP Programme Office EPC safety compliance', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'epc_contractor', 'regulator'],

  fields: {
    ms_number: { type: 'string', label: 'MS number' },
    author_party: { type: 'party', role: 'ipp_developer', label: 'Method statement author' },
    contractor_party: { type: 'party', role: 'epc_contractor', label: 'EPC contractor' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (high-hazard escalation)' },
    project_id: { type: 'string', required: true, label: 'Project' },
    project_name: { type: 'string', label: 'Project name' },
    ms_title: { type: 'string', required: true, label: 'Method statement title' },
    work_type: { type: 'string', required: true, label: 'Work type' },
    risk_tier: { type: 'string', required: true, label: 'Risk tier (high_risk/medium_risk/low_risk/routine)' },
    scope_of_work: { type: 'string', required: true, label: 'Scope of work' },
    work_area: { type: 'string', label: 'Work area' },
    scheduled_start_date: { type: 'string', label: 'Scheduled start date' },
    scheduled_duration_days: { type: 'number', min: 0, label: 'Scheduled duration (days)' },
    is_critical_lift: { type: 'boolean', label: 'Critical lift' },
    is_confined_space: { type: 'boolean', label: 'Confined space' },
    is_live_electrical: { type: 'boolean', label: 'Live electrical work' },
    // bridged from is_confined_space / is_live_electrical by `open`'s derive —
    // the field names regulatorPresentIfHighHazard actually reads.
    live_work: { type: 'boolean', label: 'Live work (derived)' },
    work_class: { type: 'string', label: 'Work class (derived)' },
    work_sequence: { type: 'string', label: 'Work sequence' },
    resources_personnel: { type: 'string', label: 'Resources / personnel' },
    plant_equipment: { type: 'string', label: 'Plant & equipment' },
    hazard_register: { type: 'string', label: 'Hazard register' },
    ppe_requirements: { type: 'string', label: 'PPE requirements' },
    emergency_procedure: { type: 'string', label: 'Emergency procedure' },
    environmental_controls: { type: 'string', label: 'Environmental controls' },
    toolbox_talk_notes: { type: 'string', label: 'Toolbox talk notes' },
    suspension_reason: { type: 'string', label: 'Suspension reason' },
    // written by derive, never by the client
    reviewed_at: { type: 'string', label: 'Submitted for review at' },
    approved_at: { type: 'string', label: 'Approved at' },
    toolbox_briefed_at: { type: 'string', label: 'Toolbox talk recorded at' },
    work_completed_at: { type: 'string', label: 'Work completed at' },
    closed_at_ms: { type: 'string', label: 'Closed at' },
  },

  initial: 'drafted',

  states: {
    drafted: { label: 'Drafted', terminal: false, holder: 'ipp_developer', sla: { hours: 4 } },
    reviewed: { label: 'In review', terminal: false, holder: 'ipp_developer', sla: { hours: 4 } },
    risk_assessed: { label: 'Risk assessed', terminal: false, holder: 'ipp_developer', sla: { hours: 4 } },
    approved: { label: 'Approved', terminal: false, holder: 'ipp_developer', sla: { hours: 8 } },
    toolbox_briefed: { label: 'Toolbox briefed', terminal: false, holder: 'ipp_developer', sla: { hours: 4 } },
    active: { label: 'Active', terminal: false, holder: 'ipp_developer' },
    work_completed: { label: 'Work completed', terminal: false, holder: 'ipp_developer', sla: { hours: 24 } },
    suspended: { label: 'Suspended', terminal: false, holder: 'ipp_developer' },
    // spec HARD_TERMINALS deliberately excludes 'closed' — it stays visible
    // pending a separate archive_ms, same as legacy chain-status.
    closed: { label: 'Closed', terminal: false, holder: 'ipp_developer' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    superseded: { label: 'Superseded', terminal: true, holder: 'none' },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'drafted',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Draft method statement',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        project_name: { type: 'string' },
        ms_number: { type: 'string' },
        ms_title: { type: 'string', required: true },
        work_type: { type: 'string', required: true },
        risk_tier: { type: 'string', required: true },
        scope_of_work: { type: 'string', required: true },
        work_area: { type: 'string' },
        scheduled_start_date: { type: 'string' },
        scheduled_duration_days: { type: 'number', min: 0 },
        is_critical_lift: { type: 'boolean' },
        is_confined_space: { type: 'boolean' },
        is_live_electrical: { type: 'boolean' },
        contractor_party: { type: 'party', role: 'epc_contractor' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({
        live_work: f.is_live_electrical === true,
        work_class: f.is_confined_space === true ? 'confined_space' : 'general',
      }),
    },
    {
      id: 'submit_for_review',
      from: 'drafted',
      to: 'reviewed',
      by: ['ipp_developer'],
      label: 'Submit for review',
      intent: 'primary',
      input: {
        work_sequence: { type: 'string', required: true },
        resources_personnel: { type: 'string', required: true },
        plant_equipment: { type: 'string', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ reviewed_at: isoUtc(at) }),
    },
    {
      id: 'complete_risk_assessment',
      from: 'reviewed',
      to: 'risk_assessed',
      by: ['ipp_developer'],
      label: 'Complete risk assessment',
      intent: 'primary',
      input: {
        hazard_register: { type: 'string', required: true },
        ppe_requirements: { type: 'string', required: true },
        emergency_procedure: { type: 'string', required: true },
        environmental_controls: { type: 'string', required: true },
      },
      guards: [],
    },
    {
      // critical-lift/confined-space/live-electrical work crosses the
      // regulator queue at approval (bridged live_work/work_class from open).
      id: 'approve_ms',
      from: 'risk_assessed',
      to: 'approved',
      by: ['ipp_developer'],
      label: 'Approve',
      intent: 'primary',
      guards: ['regulatorPresentIfHighHazard'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'conduct_toolbox_talk',
      from: 'approved',
      to: 'toolbox_briefed',
      by: ['ipp_developer'],
      label: 'Record toolbox talk',
      intent: 'primary',
      input: { toolbox_talk_notes: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ toolbox_briefed_at: isoUtc(at) }),
    },
    { id: 'start_work', from: 'toolbox_briefed', to: 'active', by: ['ipp_developer'], label: 'Start work', intent: 'primary', guards: [] },
    {
      id: 'suspend_work',
      from: ['active', 'toolbox_briefed'],
      to: 'suspended',
      by: ['ipp_developer'],
      label: 'Suspend work',
      intent: 'secondary',
      input: { suspension_reason: { type: 'string', required: true } },
      requiresReason: ['unsafe_condition', 'weather', 'resource_unavailable', 'regulatory_hold', 'incident_investigation'],
      guards: [],
    },
    { id: 'resume_work', from: 'suspended', to: 'active', by: ['ipp_developer'], label: 'Resume work', intent: 'primary', guards: [] },
    {
      id: 'complete_work',
      from: 'active',
      to: 'work_completed',
      by: ['ipp_developer'],
      label: 'Mark work complete',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ work_completed_at: isoUtc(at) }),
    },
    {
      id: 'close_ms',
      from: 'work_completed',
      to: 'closed',
      by: ['ipp_developer'],
      label: 'Close method statement',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_ms: isoUtc(at) }),
    },
    { id: 'archive_ms', from: 'closed', to: 'archived', by: ['ipp_developer'], label: 'Archive', intent: 'secondary', guards: [] },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_ms',
      from: ['drafted', 'reviewed', 'risk_assessed'],
      to: 'rejected',
      by: ['ipp_developer'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['work_sequence_inadequate', 'risk_assessment_incomplete', 'ppe_noncompliant', 'hazard_uncontrolled', 'duplicate_ms'],
      guards: [],
    },
    {
      // a revised statement supersedes this one — legacy: "a revised statement
      // must be drafted as a new revision", i.e. a fresh txn, not a re-edit.
      id: 'supersede_ms',
      from: ['approved', 'toolbox_briefed', 'active', 'suspended', 'closed'],
      to: 'superseded',
      by: ['ipp_developer'],
      label: 'Supersede',
      intent: 'destructive',
      requiresReason: ['revised_ms_issued', 'duplicate_ms', 'scope_changed'],
      guards: [],
    },
  ],
};
