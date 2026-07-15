// ipp_subcontractor — IPP construction subcontractor lifecycle as data.
//
// An IPP developer registers a subcontractor against a project, takes it
// through pre-qualification and safety induction, mobilizes it to site, and
// runs it through performing work with periodic performance/safety reviews
// (trigger_review → confirm_good_standing loops back to performing). Once
// scope is done the subcontract closes out: complete_work → demobilize →
// close_subcontract (terminal). A subcontractor in any active state can be
// suspended (site/safety/commercial hold) and later reinstated, or
// terminated outright (also terminal) from any pre-terminal state.
//
// Every action in the legacy descriptor is performed by the same actor set
// (ipp_developer, plus admin/support ops staff mapped to the generic
// `operator` role per the ipp_mir / ipp_schedule convention) — there is no
// second human role on this record (the subcontractor company itself has no
// login persona in this platform; company_name is descriptive text, not a
// modelled party). That makes this an owner-administered record, not a
// bilateral one — visibility:'owner', no counterpartyDistinct guard.
//
// settles:false — a subcontractor record tracks scope/status, not payment;
// actual money moves through the payment-certificate / progress-claim chains
// this subcontract bridges to (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippSubcontractor: ChainDecl = {
  key: 'ipp_subcontractor',
  noun: 'IPP subcontractor',
  refPrefix: 'SUBC',
  title: (f) => `Subcontractor — ${(f.company_name as string) ?? 'unnamed'} (${(f.trade_category as string) ?? 'trade TBC'})`,
  visibility: 'owner',
  settles: false,
  legalBasis: [{ instrument: 'REIPPPP', provision: 'EPC contract subcontractor management & site safety induction', effect: 'requires' }],
  roles: ['ipp_developer', 'operator'],

  fields: {
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    company_name: { type: 'string', required: true, label: 'Company' },
    project_id: { type: 'string', required: true, label: 'Project' },
    trade_category: { type: 'string', required: true, label: 'Trade' },
    subcontractor_tier: { type: 'string', required: true, label: 'Tier (critical_trade/specialist/general_trade/labor_only)' },
    scope_description: { type: 'string', required: true, label: 'Scope' },
    contract_value_zar: { type: 'number', min: 0, label: 'Contract value (ZAR)' },
    performance_score: { type: 'number', min: 0, max: 100, label: 'Performance score (0-100)' },
    review_notes: { type: 'string', label: 'Review notes' },
    suspension_reason: { type: 'string', label: 'Suspension reason' },
    termination_cause: { type: 'string', label: 'Termination cause' },
    reinstatement_conditions: { type: 'string', label: 'Reinstatement conditions met' },
    actual_end_date: { type: 'string', label: 'Site exit date' },
    notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    prequalification_started_at: { type: 'string', label: 'Pre-qualification started at' },
    inducted_at: { type: 'string', label: 'Induction completed at' },
    mobilized_at: { type: 'string', label: 'Mobilized at' },
    work_commenced_at: { type: 'string', label: 'Work commenced at' },
    review_triggered_at: { type: 'string', label: 'Review triggered at' },
    good_standing_at: { type: 'string', label: 'Good standing confirmed at' },
    returned_to_performing_at: { type: 'string', label: 'Returned to performing at' },
    work_completed_at: { type: 'string', label: 'Work completed at' },
    demobilized_at: { type: 'string', label: 'Demobilized at' },
    closed_at_subc: { type: 'string', label: 'Subcontract closed at' },
    suspended_at: { type: 'string', label: 'Suspended at' },
    reinstated_at: { type: 'string', label: 'Reinstated at' },
    terminated_at: { type: 'string', label: 'Terminated at' },
  },

  initial: 'registered',

  states: {
    registered: { label: 'Registered', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    pre_qualification: { label: 'Pre-qualification', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    inducted: { label: 'Inducted', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    mobilized: { label: 'Mobilized', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    performing: { label: 'Performing', terminal: false, holder: 'ipp_developer' },
    under_review: { label: 'Under review', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    good_standing: { label: 'Good standing', terminal: false, holder: 'ipp_developer', sla: { hours: 24 } },
    work_complete: { label: 'Work complete', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    demobilized: { label: 'Demobilized', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    suspended: { label: 'Suspended', terminal: false, holder: 'ipp_developer' },
    terminated: { label: 'Terminated', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'registered',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Register subcontractor',
      intent: 'primary',
      input: {
        company_name: { type: 'string', required: true },
        project_id: { type: 'string', required: true },
        trade_category: { type: 'string', required: true },
        subcontractor_tier: { type: 'string', required: true },
        scope_description: { type: 'string', required: true },
        contract_value_zar: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'start_prequalification',
      from: 'registered',
      to: 'pre_qualification',
      by: ['ipp_developer', 'operator'],
      label: 'Pre-qualify',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ prequalification_started_at: isoUtc(at) }),
    },
    {
      id: 'complete_induction',
      from: 'pre_qualification',
      to: 'inducted',
      by: ['ipp_developer', 'operator'],
      label: 'Complete induction',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ inducted_at: isoUtc(at) }),
    },
    {
      id: 'mobilize',
      from: 'inducted',
      to: 'mobilized',
      by: ['ipp_developer', 'operator'],
      label: 'Mobilize',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ mobilized_at: isoUtc(at) }),
    },
    {
      id: 'commence_work',
      from: 'mobilized',
      to: 'performing',
      by: ['ipp_developer', 'operator'],
      label: 'Commence work',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ work_commenced_at: isoUtc(at) }),
    },
    {
      id: 'trigger_review',
      from: 'performing',
      to: 'under_review',
      by: ['ipp_developer', 'operator'],
      label: 'Trigger performance review',
      intent: 'primary',
      input: { review_notes: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ review_triggered_at: isoUtc(at) }),
    },
    {
      id: 'confirm_good_standing',
      from: 'under_review',
      to: 'good_standing',
      by: ['ipp_developer', 'operator'],
      label: 'Confirm good standing',
      intent: 'primary',
      input: {
        performance_score: { type: 'number', min: 0, max: 100 },
        review_notes: { type: 'string', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ good_standing_at: isoUtc(at) }),
    },
    {
      id: 'return_to_performing',
      from: 'good_standing',
      to: 'performing',
      by: ['ipp_developer', 'operator'],
      label: 'Return to performing',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ returned_to_performing_at: isoUtc(at) }),
    },
    {
      id: 'complete_work',
      from: 'performing',
      to: 'work_complete',
      by: ['ipp_developer', 'operator'],
      label: 'Complete work',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ work_completed_at: isoUtc(at) }),
    },
    {
      id: 'demobilize',
      from: 'work_complete',
      to: 'demobilized',
      by: ['ipp_developer', 'operator'],
      label: 'Demobilize subcontractor',
      intent: 'primary',
      input: {
        actual_end_date: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ demobilized_at: isoUtc(at) }),
    },
    {
      id: 'close_subcontract',
      from: 'demobilized',
      to: 'closed',
      by: ['ipp_developer', 'operator'],
      label: 'Close subcontract',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_subc: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      // suspend applies to any actively-mobilized state — mirrors the v1
      // "active" filter bucket (mobilized/performing/under_review/good_standing).
      id: 'suspend_subcontractor',
      from: ['mobilized', 'performing', 'under_review', 'good_standing'],
      to: 'suspended',
      by: ['ipp_developer', 'operator'],
      label: 'Suspend',
      intent: 'destructive',
      input: { suspension_reason: { type: 'string', required: true } },
      // v1 carries free-text suspension_reason, not a reason_code — no requiresReason.
      guards: [],
      derive: (_f, at: Instant) => ({ suspended_at: isoUtc(at) }),
    },
    {
      id: 'reinstate_subcontractor',
      from: 'suspended',
      to: 'mobilized',
      by: ['ipp_developer', 'operator'],
      label: 'Reinstate subcontractor',
      intent: 'primary',
      input: { reinstatement_conditions: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ reinstated_at: isoUtc(at) }),
    },
    {
      id: 'terminate_subcontractor',
      from: ['registered', 'pre_qualification', 'inducted', 'mobilized', 'performing', 'under_review', 'good_standing', 'suspended'],
      to: 'terminated',
      by: ['ipp_developer', 'operator'],
      label: 'Terminate',
      intent: 'destructive',
      input: { termination_cause: { type: 'string', required: true } },
      // v1 carries free-text termination_cause, not a reason_code — no requiresReason.
      guards: [],
      derive: (_f, at: Instant) => ({ terminated_at: isoUtc(at) }),
    },
  ],
};
