// ipp_anr — NERSA annual licence return lifecycle as data.
//
// Every licensed IPP owes NERSA an annual return under its licence conditions:
// assemble the year's compliance data, get it internally reviewed and board
// signed-off, lodge it on the NERSA portal, then sit through NERSA's own review
// (which may loop through a clarification round) to a terminal outcome —
// accepted, rejected, or lapsed if the SLA deadline is missed before either.
//
// submit_to_portal is guarded by completenessEvidencePresent: NERSA won't take a
// lodgement without a named completeness-evidence ref — the same paper-trail
// discipline licence_renewal uses for its compliance sign-off.
//
// accept_return is guarded by regulatorPresentIfStrategic: a ≥100 MW project's
// return can't be closed accepted unless the regulator (NERSA) is actually a
// party on the txn — a strategic-tier facility needs NERSA named, not implied.
//
// NO timer: the legacy descriptor's sla_due_date is a real SLA concept, but it
// spans nearly every non-terminal state (not one), which the single-onState
// TimerDecl shape can't express cleanly without guessing at the right cadence
// per state — declare_lapsed stays a manual/admin action for this first pass.
//
// settles:false — a licence return is a regulatory filing, not a payment
// (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippAnr: ChainDecl = {
  key: 'ipp_anr',
  noun: 'NERSA annual licence return',
  refPrefix: 'ANR',
  title: (f) =>
    `NERSA licence return — ${(f.project_ref as string) ?? 'unnamed project'} (FY ${(f.financial_year_end as string) ?? 'n/a'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's17 licence conditions — annual returns to NERSA', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'generation licensee reporting obligations', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator', 'admin'],

  fields: {
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP (return owner)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'NERSA' },
    project_ref: { type: 'string', required: true, label: 'Project ref' },
    financial_year_end: { type: 'string', required: true, label: 'Financial year end' },
    capacity_mw: { type: 'number', min: 0, label: 'Licensed capacity (MW)' },
    licence_number: { type: 'string', label: 'Licence number' },
    return_type: { type: 'string', label: 'Return type (annual_standard/annual_construction/annual_decommission)' },
    notes: { type: 'string', label: 'Notes' },
    completeness_ref: { type: 'string', label: 'Completeness evidence ref' },
    portal_reference: { type: 'string', label: 'NERSA portal submission ref' },
    receipt_ref: { type: 'string', label: 'Portal receipt ref' },
    clarification_reason: { type: 'string', label: 'Clarification requested' },
    clarification_response: { type: 'string', label: 'Clarification response' },
    sla_due_date: { type: 'string', label: 'SLA due date' },
    // derive-stamped timestamps
    submitted_at: { type: 'string', label: 'Submitted to portal at' },
    acknowledged_at: { type: 'string', label: 'Portal receipt confirmed at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    lapsed_at: { type: 'string', label: 'Lapsed at' },
  },

  initial: 'return_triggered',

  states: {
    return_triggered: { label: 'Return triggered', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    data_assembly: { label: 'Data assembly', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    internal_review: { label: 'Internal review', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    board_approval: { label: 'Board approval', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    portal_submission: { label: 'Portal submission', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    acknowledgement_pending: { label: 'Acknowledgement pending', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    nersa_review: { label: 'NERSA review', terminal: false, holder: 'regulator', sla: { days: 30 } },
    clarification_requested: { label: 'Clarification requested', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    clarification_submitted: { label: 'Clarification submitted', terminal: false, holder: 'regulator', sla: { days: 15 } },
    return_accepted: { label: 'Return accepted', terminal: true, holder: 'none' },
    return_rejected: { label: 'Return rejected', terminal: true, holder: 'none' },
    return_lapsed: { label: 'Return lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'return_triggered',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Trigger annual return',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        financial_year_end: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        licence_number: { type: 'string' },
        return_type: { type: 'string' },
        notes: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // opening a new regulatory commitment is blocked under a platform halt.
      guards: ['complianceHaltClear'],
    },
    {
      id: 'commence_data_assembly',
      from: 'return_triggered',
      to: 'data_assembly',
      by: ['ipp_developer', 'admin'],
      label: 'Commence data assembly',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'conduct_internal_review',
      from: 'data_assembly',
      to: 'internal_review',
      by: ['ipp_developer', 'admin'],
      label: 'Conduct internal review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'obtain_board_approval',
      from: 'internal_review',
      to: 'board_approval',
      by: ['ipp_developer', 'admin'],
      label: 'Obtain board approval',
      intent: 'primary',
      guards: [],
    },
    {
      // NERSA lodgement needs a named completeness-evidence ref — the paper
      // trail that the return was actually examined before submission.
      id: 'submit_to_portal',
      from: 'board_approval',
      to: 'portal_submission',
      by: ['ipp_developer', 'admin'],
      label: 'Submit to NERSA portal',
      intent: 'primary',
      input: {
        completeness_ref: { type: 'string', required: true },
        portal_reference: { type: 'string' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'confirm_receipt',
      from: 'portal_submission',
      to: 'acknowledgement_pending',
      by: ['ipp_developer', 'admin'],
      label: 'Confirm receipt',
      intent: 'primary',
      input: { receipt_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'begin_nersa_review',
      from: 'acknowledgement_pending',
      to: 'nersa_review',
      by: ['ipp_developer', 'admin'],
      label: 'Begin NERSA review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'request_clarification',
      from: 'nersa_review',
      to: 'clarification_requested',
      by: ['ipp_developer', 'admin'],
      label: 'Request clarification',
      intent: 'secondary',
      input: { clarification_reason: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'submit_clarification',
      from: 'clarification_requested',
      to: 'clarification_submitted',
      by: ['ipp_developer', 'admin'],
      label: 'Submit clarification',
      intent: 'primary',
      input: { clarification_response: { type: 'string', required: true } },
      guards: [],
    },
    {
      // ≥100 MW facility: NERSA must actually be a party before the return
      // can be closed accepted.
      id: 'accept_return',
      from: ['nersa_review', 'clarification_submitted'],
      to: 'return_accepted',
      by: ['ipp_developer', 'admin'],
      label: 'Accept return',
      intent: 'primary',
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_return',
      from: ['nersa_review', 'clarification_submitted'],
      to: 'return_rejected',
      by: ['ipp_developer', 'admin'],
      label: 'Reject return',
      intent: 'destructive',
      requiresReason: ['incomplete_data', 'licence_conditions_breach', 'inaccurate_return', 'non_compliance'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'declare_lapsed',
      from: [
        'return_triggered',
        'data_assembly',
        'internal_review',
        'board_approval',
        'portal_submission',
        'acknowledgement_pending',
        'nersa_review',
        'clarification_requested',
        'clarification_submitted',
      ],
      to: 'return_lapsed',
      by: ['ipp_developer', 'admin'],
      label: 'Declare lapsed',
      intent: 'destructive',
      requiresReason: ['sla_deadline_missed'],
      guards: [],
      derive: (_f, at: Instant) => ({ lapsed_at: isoUtc(at) }),
    },
  ],
};
