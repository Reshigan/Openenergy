// ipp_om_handover — the O&M handover dossier for a newly-built IPP generation
// project, as data. Before an EPC-built plant transitions to long-term
// operation, the IPP developer compiles the operating pack (H&S file, O&M
// manuals, as-builts, equipment data, warranties, commissioning records,
// training records) required under the REIPPPP Implementation Agreement,
// routes it through internal QA, then submits it to the O&M operator for
// review. The operator either accepts it, accepts it subject to conditions,
// raises deficiencies (which the developer must resolve before a decision),
// or rejects it outright.
//
// Legacy parity note (chain-registry-meridian.ts ipp_om_handover): every v1
// action's roles array is exactly ['admin', 'ipp_developer'] — the O&M
// operator is not modelled as a distinct txn party (counterpartyCol is null).
// 'admin' acts as the platform-side proxy for the operator's own steps
// (begin review, raise/accept deficiencies, decide), matching the legacy
// shape exactly — same precedent as ipp_ael / ipp_eam. No operator/regulator
// role or guard is introduced here since there is no party field to satisfy
// one.
//
// begin_om_review bridges submitted_to_om → om_review: not a distinct v1
// action, but v1's filter list carries om_review as a distinct status ahead
// of the deficiency/decision tier — same bridging pattern as ipp_ael's
// complete_technical_assessment and ipp_eam's commence_final_review.
//
// withdraw / supersede / archive fill out v1's documented terminal set
// (terminal: ['accepted','rejected','superseded','archived','withdrawn'])
// that the modelled actions array itself doesn't reach — same precedent as
// ipp_ael's catch-all lapse_ael for a status the actions array names but
// never targets.
//
// The decision spine is STRUCTURAL: accepted/conditional_acceptance/rejected
// are reachable ONLY from om_review or deficiencies_resolved — a pack can
// never be decided before the O&M operator has actually opened it.
//
// settles:false — a handover dossier is an operational-readiness record,
// never a payment (R-S5-1). capacity_mw is sized for attention ranking
// (quantumCol in v1 is null, tiered on MW not ZAR), not settlement quantum.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const num = (v: Json | undefined): number => (typeof v === 'number' ? v : 0);

export const ippOmHandover: ChainDecl = {
  key: 'ipp_om_handover',
  noun: 'O&M handover pack',
  refPrefix: 'OMH',
  title: (f) =>
    `O&M handover — ${(f.title as string) ?? (f.project_id as string) ?? 'project'} (${(f.category as string) ?? 'pack'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement O&M handover dossier (H&S file, O&M manuals, as-builts, equipment data, warranties, commissioning, training)', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    capacity_mw: { type: 'number', min: 0, label: 'Plant capacity (MW)' },
    category: { type: 'string', label: 'Handover category' },
    title: { type: 'string', required: true, label: 'Pack title' },
    document_count: { type: 'number', min: 0, label: 'Document count' },
    description: { type: 'string', label: 'Description' },
    author_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    // review narrative
    deficiency_notes: { type: 'string', label: 'Deficiency notes' },
    deficiency_count: { type: 'number', label: 'Times deficiencies raised' },
    resolution_notes: { type: 'string', label: 'Resolution notes' },
    conditions_notes: { type: 'string', label: 'Conditions of acceptance' },
    decision_notes: { type: 'string', label: 'Decision notes' },
    // derive-stamped timestamps
    submitted_to_om_at: { type: 'string', label: 'Submitted to O&M at' },
    om_review_started_at: { type: 'string', label: 'O&M review started at' },
    deficiencies_raised_at: { type: 'string', label: 'Deficiencies raised at' },
    deficiencies_resolved_at: { type: 'string', label: 'Deficiencies resolved at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    conditional_accepted_at: { type: 'string', label: 'Conditionally accepted at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
    superseded_at: { type: 'string', label: 'Superseded at' },
    archived_at: { type: 'string', label: 'Archived at' },
  },

  initial: 'compilation',

  states: {
    compilation: { label: 'Compiling dossier', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    internal_review: { label: 'Internal review', terminal: false, holder: 'admin', sla: { days: 5 } },
    submitted_to_om: { label: 'Submitted to O&M', terminal: false, holder: 'admin', sla: { days: 3 } },
    om_review: { label: 'O&M review', terminal: false, holder: 'admin', sla: { days: 10 } },
    deficiencies_raised: { label: 'Deficiencies raised', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    deficiencies_resolved: { label: 'Deficiencies resolved', terminal: false, holder: 'admin', sla: { days: 5 } },
    // v1 does not list conditional_acceptance in its terminal set, and models
    // no further action off it — the developer remains nominally responsible
    // for satisfying the stated conditions.
    conditional_acceptance: { label: 'Conditionally accepted', terminal: false, holder: 'ipp_developer' },
    accepted: { label: 'Accepted', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    superseded: { label: 'Superseded', terminal: true, holder: 'none' },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'compilation',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Compile handover pack',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        category: { type: 'string' },
        title: { type: 'string', required: true },
        document_count: { type: 'number', min: 0 },
        description: { type: 'string' },
      },
      guards: [],
    },

    // --- happy path -------------------------------------------------------
    {
      id: 'submit_for_internal_review',
      from: 'compilation',
      to: 'internal_review',
      by: ['ipp_developer', 'admin'],
      label: 'Submit for internal review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_to_om',
      from: 'internal_review',
      to: 'submitted_to_om',
      by: ['ipp_developer', 'admin'],
      label: 'Submit to O&M',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_to_om_at: isoUtc(at) }),
    },
    {
      // bridging step — v1's filter list carries om_review as a distinct
      // status ahead of the deficiency/decision tier.
      id: 'begin_om_review',
      from: 'submitted_to_om',
      to: 'om_review',
      by: ['admin', 'ipp_developer'],
      label: 'Begin O&M review',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ om_review_started_at: isoUtc(at) }),
    },
    {
      id: 'raise_deficiencies',
      from: 'om_review',
      to: 'deficiencies_raised',
      by: ['admin', 'ipp_developer'],
      label: 'Raise deficiencies',
      intent: 'secondary',
      input: { deficiency_notes: { type: 'string' } },
      guards: [],
      derive: (f, at: Instant) => ({
        deficiencies_raised_at: isoUtc(at),
        deficiency_count: num(f.deficiency_count) + 1,
      }),
    },
    {
      id: 'resolve_deficiencies',
      from: 'deficiencies_raised',
      to: 'deficiencies_resolved',
      by: ['ipp_developer', 'admin'],
      label: 'Resolve deficiencies',
      intent: 'primary',
      input: { resolution_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ deficiencies_resolved_at: isoUtc(at) }),
    },
    {
      // structural decision gate: only reachable once the O&M operator has
      // actually opened the pack (om_review) or worked a deficiency cycle.
      id: 'accept_handover',
      from: ['om_review', 'deficiencies_resolved'],
      to: 'accepted',
      by: ['admin', 'ipp_developer'],
      label: 'Accept handover',
      intent: 'primary',
      input: { decision_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      id: 'conditionally_accept',
      from: ['om_review', 'deficiencies_resolved'],
      to: 'conditional_acceptance',
      by: ['admin', 'ipp_developer'],
      label: 'Conditionally accept',
      intent: 'primary',
      input: { conditions_notes: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ conditional_accepted_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'reject_handover',
      from: ['om_review', 'deficiencies_resolved'],
      to: 'rejected',
      by: ['admin', 'ipp_developer'],
      label: 'Reject handover',
      intent: 'destructive',
      requiresReason: ['incomplete_documentation', 'missing_hs_file', 'missing_warranties', 'non_compliant_as_built', 'quality_deficiency', 'commissioning_records_missing'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'withdraw_handover',
      from: ['compilation', 'internal_review', 'submitted_to_om', 'om_review', 'deficiencies_raised', 'deficiencies_resolved'],
      to: 'withdrawn',
      by: ['ipp_developer', 'admin'],
      label: 'Withdraw handover pack',
      intent: 'destructive',
      requiresReason: ['duplicate_submission', 'pack_withdrawn_for_rework', 'project_cancelled', 'data_error'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
    {
      id: 'supersede_handover',
      from: ['compilation', 'internal_review', 'submitted_to_om', 'om_review', 'deficiencies_raised', 'deficiencies_resolved', 'conditional_acceptance'],
      to: 'superseded',
      by: ['admin'],
      label: 'Supersede handover pack',
      intent: 'destructive',
      requiresReason: ['superseded_by_newer_pack', 'project_restructured', 'category_resubmission'],
      guards: [],
      derive: (_f, at: Instant) => ({ superseded_at: isoUtc(at) }),
    },
    {
      id: 'archive_handover',
      from: ['compilation', 'internal_review', 'submitted_to_om', 'om_review', 'deficiencies_raised', 'deficiencies_resolved', 'conditional_acceptance'],
      to: 'archived',
      by: ['admin'],
      label: 'Archive handover pack',
      intent: 'destructive',
      requiresReason: ['stale_no_activity', 'retention_period_lapsed', 'project_cancelled'],
      guards: [],
      derive: (_f, at: Instant) => ({ archived_at: isoUtc(at) }),
    },
  ],
};
