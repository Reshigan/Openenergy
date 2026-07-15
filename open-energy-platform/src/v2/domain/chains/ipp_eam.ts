// ipp_eam — an Environmental Authorisation amendment for an IPP generation
// project, as data. NEMA (National Environmental Management Act 107 of 1998)
// s24G / the EIA Regulations require a material change to an already-
// authorised project (scope, technology, capacity, access route, footprint,
// or component substitution) to run its own amendment process before it is
// built. An IPP developer defines the scope of change, prepares and submits
// the amendment application, DFFE runs completeness review → public
// participation → specialist review → final review, then decides: grant,
// refuse, or refer to s24G rectification (an unauthorised-activity pathway).
//
// Legacy parity note (chain-registry-meridian.ts ipp_eam): every v1 action's
// roles array is exactly ['admin', 'ipp_developer'] — DFFE is not modelled as
// a distinct txn party in this chain (counterpartyCol is null, no regulator
// role in the v1 lanes). 'admin' acts as the platform-side proxy for DFFE's
// own steps (accept, open/close participation, review, decide), matching the
// legacy shape exactly — same precedent as ipp_ael. No regulator role/guard
// is introduced here since there is no party field to satisfy one.
//
// The decision spine is STRUCTURAL: amendment_granted is reachable ONLY from
// dffe_final_review (via grant_amendment), which is reachable ONLY through the
// full completeness → participation → specialist-review sequence. An
// amendment can never be granted on an application DFFE never reviewed.
//
// settles:false — an EA amendment decision is a regulatory record, never a
// payment (R-S5-1). capacity_mw is sized for attention ranking (quantumCol in
// v1 is null), not ZAR.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippEam: ChainDecl = {
  key: 'ipp_eam',
  noun: 'EA amendment',
  refPrefix: 'EAM',
  title: (f) =>
    `EA amendment — ${(f.project_id as string) ?? 'project'} (${(f.amendment_category as string) ?? 'uncategorised'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'National Environmental Management Act 107 of 1998', provision: 's24G / EIA Regulations amendment of an existing environmental authorisation', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    trigger_category: { type: 'string', label: 'Trigger category' },
    amendment_category: { type: 'string', label: 'Amendment category' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    dffe_reference: { type: 'string', label: 'DFFE reference' },
    scope_description: { type: 'string', label: 'Scope of change' },
    specialist_review_summary: { type: 'string', label: 'Specialist review summary' },
    decision_notes: { type: 'string', label: 'Decision notes' },
    // written by derive, never by the client
    application_submitted_at: { type: 'string', label: 'Application submitted at' },
    final_review_commenced_at: { type: 'string', label: 'Final review commenced at' },
    granted_at: { type: 'string', label: 'Granted at' },
  },

  initial: 'ea_amendment_triggered',

  states: {
    ea_amendment_triggered: { label: 'EA amendment triggered', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    scope_defined: { label: 'Scope defined', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    application_in_preparation: { label: 'Application in preparation', terminal: false, holder: 'ipp_developer', sla: { days: 21 } },
    application_submitted: { label: 'Application submitted', terminal: false, holder: 'admin', sla: { days: 30 } },
    dffe_completeness_review: { label: 'DFFE completeness review', terminal: false, holder: 'admin', sla: { days: 30 } },
    public_participation_open: { label: 'Public participation open', terminal: false, holder: 'admin', sla: { days: 30 } },
    public_participation_closed: { label: 'Public participation closed', terminal: false, holder: 'admin', sla: { days: 14 } },
    specialist_review: { label: 'Specialist review', terminal: false, holder: 'admin', sla: { days: 45 } },
    dffe_final_review: { label: 'DFFE final review', terminal: false, holder: 'admin', sla: { days: 30 } },
    amendment_granted: { label: 'Amendment granted', terminal: true, holder: 'none' },
    amendment_refused: { label: 'Amendment refused', terminal: true, holder: 'none' },
    s24g_referral: { label: 'Referred to s24G rectification', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'ea_amendment_triggered',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Trigger EA amendment',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        trigger_category: { type: 'string' },
        amendment_category: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        dffe_reference: { type: 'string' },
      },
      guards: [],
    },

    // --- happy path -------------------------------------------------------
    {
      id: 'define_scope',
      from: 'ea_amendment_triggered',
      to: 'scope_defined',
      by: ['admin', 'ipp_developer'],
      label: 'Define scope',
      intent: 'primary',
      input: { scope_description: { type: 'string' } },
      guards: [],
    },
    {
      id: 'prepare_application',
      from: 'scope_defined',
      to: 'application_in_preparation',
      by: ['admin', 'ipp_developer'],
      label: 'Prepare application',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_application',
      from: 'application_in_preparation',
      to: 'application_submitted',
      by: ['admin', 'ipp_developer'],
      label: 'Submit application',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ application_submitted_at: isoUtc(at) }),
    },
    {
      id: 'accept_for_review',
      from: 'application_submitted',
      to: 'dffe_completeness_review',
      by: ['admin', 'ipp_developer'],
      label: 'Accept for review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'open_public_participation',
      from: 'dffe_completeness_review',
      to: 'public_participation_open',
      by: ['admin', 'ipp_developer'],
      label: 'Open public participation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'close_public_participation',
      from: 'public_participation_open',
      to: 'public_participation_closed',
      by: ['admin', 'ipp_developer'],
      label: 'Close public participation',
      intent: 'secondary',
      guards: [],
    },
    {
      id: 'submit_specialist_review',
      from: 'public_participation_closed',
      to: 'specialist_review',
      by: ['admin', 'ipp_developer'],
      label: 'Submit specialist review',
      intent: 'primary',
      input: { specialist_review_summary: { type: 'string' } },
      guards: [],
    },
    {
      // bridging step into DFFE's final decision review — v1's filter list
      // carries dffe_final_review as a distinct status ahead of the decided
      // tier (same pattern as ipp_ael's complete_technical_assessment).
      id: 'commence_final_review',
      from: 'specialist_review',
      to: 'dffe_final_review',
      by: ['admin', 'ipp_developer'],
      label: 'Commence final review',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ final_review_commenced_at: isoUtc(at) }),
    },
    {
      // structural decision gate: the ONLY edge into amendment_granted,
      // reachable ONLY from dffe_final_review — a full completeness →
      // participation → specialist-review sequence.
      id: 'grant_amendment',
      from: 'dffe_final_review',
      to: 'amendment_granted',
      by: ['admin', 'ipp_developer'],
      label: 'Grant amendment',
      intent: 'primary',
      input: {
        dffe_reference: { type: 'string' },
        decision_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ granted_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'refuse_amendment',
      from: ['specialist_review', 'dffe_final_review'],
      to: 'amendment_refused',
      by: ['admin', 'ipp_developer'],
      label: 'Refuse amendment',
      intent: 'destructive',
      requiresReason: ['unacceptable_environmental_impact', 'incomplete_application', 'public_objection_upheld', 'non_compliant_amendment', 'authority_directive'],
      guards: [],
    },
    {
      // s24G rectification referral — the amendment is treated as an
      // unauthorised activity requiring the separate NEMA s24G rectification
      // pathway rather than an ordinary grant/refuse decision.
      id: 'refer_s24g',
      from: ['specialist_review', 'dffe_final_review'],
      to: 's24g_referral',
      by: ['admin', 'ipp_developer'],
      label: 'Refer s24G',
      intent: 'destructive',
      requiresReason: ['unauthorised_activity_commenced', 'non_compliant_amendment', 'rectification_required', 'authority_directive'],
      guards: [],
    },
  ],
};
