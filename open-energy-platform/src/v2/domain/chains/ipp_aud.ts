// ipp_aud — an IPP SPV's annual statutory audit cycle as data.
//
// The developer opens the cycle at year-end, runs the internal close (trial
// balance → year-end journals), then external fieldwork (audit fieldwork →
// management accounts review → query resolution → draft opinion review),
// then finalisation (board approval → CIPC filing) to a clean close. A
// qualified opinion is a first-class alternate exit off the draft opinion
// review — an auditor can qualify instead of clearing to board approval.
//
// The engagement is bilateral (developer's SPV vs the external audit firm):
// counterpartyDistinct on open stops an SPV "auditing" itself. Sign-off
// needs a named completeness evidence ref (completenessEvidencePresent) —
// you cannot file an AFS with CIPC on nothing.
//
// settles:false — an annual audit is an assurance/compliance record, never a
// payment (R-S5-1). annual_revenue_zar sizes the engagement, it does not move.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippAud: ChainDecl = {
  key: 'ipp_aud',
  noun: 'IPP annual audit',
  refPrefix: 'IPPA',
  title: (f) => `Annual audit ${(f.financial_year as string) ?? ''} — ${(f.project_id as string) ?? 'project'}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement annual financial reporting', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'licensee annual financial disclosure', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'auditor', 'admin'],

  fields: {
    audit_ref: { type: 'string', label: 'Audit reference' },
    project_id: { type: 'string', label: 'Project' },
    ipp_developer_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer (SPV)' },
    auditor_party: { type: 'party', role: 'auditor', label: 'External auditor' },
    financial_year: { type: 'string', required: true, label: 'Financial year' },
    year_end_date: { type: 'string', required: true, label: 'Year end date' },
    annual_revenue_zar: { type: 'number', min: 0, label: 'Annual revenue (ZAR)' },
    query_notes: { type: 'string', label: 'Audit query notes' },
    completeness_ref: { type: 'string', label: 'Completeness evidence ref' },
    // written by derive, never by the client
    fieldwork_started_at: { type: 'string', label: 'Fieldwork started at' },
    opinion_reviewed_at: { type: 'string', label: 'Draft opinion reviewed at' },
    board_approved_at: { type: 'string', label: 'Board approved at' },
    filed_at_cipc: { type: 'string', label: 'Filed with CIPC at' },
    closed_at_aud: { type: 'string', label: 'Audit cycle closed at' },
  },

  initial: 'audit_cycle_opened',

  states: {
    audit_cycle_opened: { label: 'Audit cycle opened', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    trial_balance_preparation: { label: 'Trial balance preparation', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    year_end_journals: { label: 'Year-end journals', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    audit_fieldwork: { label: 'Audit fieldwork', terminal: false, holder: 'auditor', sla: { days: 15 } },
    management_accounts_review: { label: 'Management accounts review', terminal: false, holder: 'auditor', sla: { days: 5 } },
    audit_queries_resolution: { label: 'Audit queries resolution', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    draft_opinion_review: { label: 'Draft opinion review', terminal: false, holder: 'auditor', sla: { days: 5 } },
    board_approval: { label: 'Board approval', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    cipc_submission: { label: 'CIPC submission', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    audit_completed: { label: 'Audit completed', terminal: true, holder: 'none' },
    audit_qualified: { label: 'Audit qualified', terminal: true, holder: 'none' },
    audit_lapsed: { label: 'Audit lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'audit_cycle_opened',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Open audit cycle',
      intent: 'primary',
      input: {
        project_id: { type: 'string' },
        financial_year: { type: 'string', required: true },
        year_end_date: { type: 'string', required: true },
        annual_revenue_zar: { type: 'number', required: true, min: 0 },
        auditor_party: { type: 'party', role: 'auditor' },
      },
      // an SPV cannot audit itself — the engaged firm must be a distinct entity.
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'commence_trial_balance',
      from: 'audit_cycle_opened',
      to: 'trial_balance_preparation',
      by: ['ipp_developer', 'admin'],
      label: 'Commence trial balance',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'process_year_end_journals',
      from: 'trial_balance_preparation',
      to: 'year_end_journals',
      by: ['ipp_developer', 'admin'],
      label: 'Process year-end journals',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_audit_fieldwork',
      from: 'year_end_journals',
      to: 'audit_fieldwork',
      by: ['ipp_developer', 'admin', 'auditor'],
      label: 'Commence audit fieldwork',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ fieldwork_started_at: isoUtc(at) }),
    },
    {
      id: 'present_management_accounts',
      from: 'audit_fieldwork',
      to: 'management_accounts_review',
      by: ['ipp_developer', 'admin'],
      label: 'Present management accounts',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'resolve_audit_queries',
      from: 'management_accounts_review',
      to: 'audit_queries_resolution',
      by: ['ipp_developer', 'admin'],
      label: 'Resolve audit queries',
      intent: 'primary',
      input: { query_notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'review_draft_opinion',
      from: 'audit_queries_resolution',
      to: 'draft_opinion_review',
      by: ['ipp_developer', 'admin', 'auditor'],
      label: 'Review draft opinion',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ opinion_reviewed_at: isoUtc(at) }),
    },
    {
      id: 'obtain_board_approval',
      from: 'draft_opinion_review',
      to: 'board_approval',
      by: ['ipp_developer', 'admin'],
      label: 'Obtain board approval',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ board_approved_at: isoUtc(at) }),
    },
    {
      id: 'submit_to_cipc',
      from: 'board_approval',
      to: 'cipc_submission',
      by: ['ipp_developer', 'admin'],
      label: 'Submit to CIPC',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ filed_at_cipc: isoUtc(at) }),
    },
    {
      // structural clean-pass gate: the ONLY edge into audit_completed, reachable
      // only from cipc_submission — the tail of the finalisation spine. Signing
      // off the cycle needs a named completeness evidence ref.
      id: 'complete_audit',
      from: 'cipc_submission',
      to: 'audit_completed',
      by: ['ipp_developer', 'admin'],
      label: 'Complete audit',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ closed_at_aud: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    {
      // an auditor can qualify off the draft opinion instead of clearing it
      // to board approval — the alternate finalisation exit.
      id: 'issue_qualified_opinion',
      from: 'draft_opinion_review',
      to: 'audit_qualified',
      by: ['ipp_developer', 'admin', 'auditor'],
      label: 'Issue qualified opinion',
      intent: 'destructive',
      requiresReason: ['scope_limitation', 'going_concern', 'material_misstatement', 'inadequate_disclosure'],
      guards: [],
    },
    {
      id: 'declare_lapsed',
      from: [
        'audit_cycle_opened',
        'trial_balance_preparation',
        'year_end_journals',
        'audit_fieldwork',
        'management_accounts_review',
        'audit_queries_resolution',
        'draft_opinion_review',
        'board_approval',
        'cipc_submission',
      ],
      to: 'audit_lapsed',
      by: ['ipp_developer', 'admin'],
      label: 'Declare lapsed',
      intent: 'destructive',
      requiresReason: ['sla_deadline_missed', 'auditor_withdrew', 'spv_dissolved', 'engagement_terminated'],
      guards: [],
    },
  ],
};
