// ipp_hra — a Heritage Impact Assessment for an IPP generation project, as
// data. National Heritage Resources Act 25 of 1999 (NHRA) s38 requires a
// heritage impact assessment ahead of any development that may affect a
// heritage resource (new sites, access roads, substations, transmission
// lines). An IPP developer runs a desktop study then a field survey, prepares
// and lodges the report with SAHRA, SAHRA opens its review, runs public
// participation, then specialist assessment and a final review before
// deciding: approve, refuse, or flag the site to the heritage watchlist.
//
// Legacy parity note (chain-registry-meridian.ts ipp_hra): every v1 action's
// roles array is exactly ['admin', 'ipp_developer'] — SAHRA is not modelled
// as a distinct txn party in this chain (same shape as ipp_ael). 'admin'
// acts as the platform-side proxy for SAHRA's own steps (open review, open
// participation, assess, decide) — no regulator role/guard is introduced
// here, since there is no party field to satisfy one.
//
// The decision spine is STRUCTURAL: hra_approved is reachable ONLY from
// final_review (via approve_hra), which is reachable ONLY through the full
// submission → SAHRA review → public participation → specialist assessment
// sequence. An HRA can never be approved on a report SAHRA never reviewed.
//
// v1 has no "lapsed" terminal (terminal: ['hra_approved','hra_refused',
// 'heritage_watchlist']) — a stalled application is swept onto the heritage
// watchlist instead of a dedicated lapse state, so the stalled-intake timer
// fires add_to_watchlist, not a lapse edge.
//
// settles:false — a heritage decision is a regulatory record, never a
// payment (R-S5-1). capacity_mw is sized for attention ranking (quantumCol
// in v1), not ZAR.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

const ACTIVE_STATES = [
  'hra_triggered',
  'desktop_study',
  'field_survey',
  'hra_report_preparation',
  'hra_submitted',
  'sahra_review',
  'public_participation',
  'specialist_assessment',
  'final_review',
];

export const ippHra: ChainDecl = {
  key: 'ipp_hra',
  noun: 'HRA application',
  refPrefix: 'HRA',
  title: (f) =>
    `HRA — ${(f.project_id as string) ?? 'project'} (${(f.hra_category as string) ?? 'uncategorised'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'National Heritage Resources Act 25 of 1999', provision: 's38 Heritage Impact Assessment for developments affecting heritage resources', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    trigger_category: { type: 'string', label: 'Trigger category' },
    hra_category: { type: 'string', label: 'HRA category' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    sahra_reference: { type: 'string', label: 'SAHRA reference' },
    heritage_consultant: { type: 'string', label: 'Heritage consultant' },
    notes: { type: 'string', label: 'Approval notes' },
    // written by derive, never by the client
    hra_submitted_at: { type: 'string', label: 'HRA submitted at' },
    specialist_assessment_commenced_at: { type: 'string', label: 'Specialist assessment commenced at' },
    approved_at: { type: 'string', label: 'Approved at' },
  },

  initial: 'hra_triggered',

  states: {
    hra_triggered: { label: 'HRA triggered', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    desktop_study: { label: 'Desktop study', terminal: false, holder: 'ipp_developer', sla: { days: 21 } },
    field_survey: { label: 'Field survey', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    hra_report_preparation: { label: 'HRA report preparation', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    hra_submitted: { label: 'HRA submitted', terminal: false, holder: 'admin', sla: { days: 30 } },
    sahra_review: { label: 'SAHRA review', terminal: false, holder: 'admin', sla: { days: 30 } },
    public_participation: { label: 'Public participation', terminal: false, holder: 'admin', sla: { days: 30 } },
    specialist_assessment: { label: 'Specialist assessment', terminal: false, holder: 'admin', sla: { days: 60 } },
    final_review: { label: 'Final review', terminal: false, holder: 'admin', sla: { days: 30 } },
    hra_approved: { label: 'HRA approved', terminal: true, holder: 'none' },
    hra_refused: { label: 'HRA refused', terminal: true, holder: 'none' },
    heritage_watchlist: { label: 'Heritage watchlist', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'hra_triggered',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Trigger heritage assessment',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        trigger_category: { type: 'string' },
        hra_category: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        sahra_reference: { type: 'string' },
        heritage_consultant: { type: 'string' },
      },
      guards: [],
    },

    // --- happy path -------------------------------------------------------
    {
      id: 'commence_desktop_study',
      from: 'hra_triggered',
      to: 'desktop_study',
      by: ['ipp_developer', 'admin'],
      label: 'Commence desktop study',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_field_survey',
      from: 'desktop_study',
      to: 'field_survey',
      by: ['ipp_developer', 'admin'],
      label: 'Commence field survey',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'prepare_hra_report',
      from: 'field_survey',
      to: 'hra_report_preparation',
      by: ['ipp_developer', 'admin'],
      label: 'Prepare HRA report',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_hra',
      from: 'hra_report_preparation',
      to: 'hra_submitted',
      by: ['admin', 'ipp_developer'],
      label: 'Submit HRA',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ hra_submitted_at: isoUtc(at) }),
    },
    {
      id: 'commence_sahra_review',
      from: 'hra_submitted',
      to: 'sahra_review',
      by: ['admin', 'ipp_developer'],
      label: 'Open SAHRA review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'open_public_participation',
      from: 'sahra_review',
      to: 'public_participation',
      by: ['admin', 'ipp_developer'],
      label: 'Open public participation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_specialist_assessment',
      from: 'public_participation',
      to: 'specialist_assessment',
      by: ['admin', 'ipp_developer'],
      label: 'Commence specialist assessment',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ specialist_assessment_commenced_at: isoUtc(at) }),
    },
    {
      // bridging step into SAHRA's final decision review — v1's filter list
      // carries final_review as a distinct status ahead of the decided tier,
      // same pattern as ipp_ael's complete_technical_assessment.
      id: 'complete_specialist_assessment',
      from: 'specialist_assessment',
      to: 'final_review',
      by: ['admin', 'ipp_developer'],
      label: 'Complete specialist assessment',
      intent: 'secondary',
      guards: [],
    },
    {
      // structural decision gate: the ONLY edge into hra_approved, reachable
      // ONLY from final_review — a full submission → review → participation →
      // specialist-assessment sequence.
      id: 'approve_hra',
      from: 'final_review',
      to: 'hra_approved',
      by: ['admin', 'ipp_developer'],
      label: 'Approve HRA',
      intent: 'primary',
      input: {
        sahra_reference: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'refuse_hra',
      from: ['specialist_assessment', 'final_review'],
      to: 'hra_refused',
      by: ['admin', 'ipp_developer'],
      label: 'Refuse HRA',
      intent: 'destructive',
      requiresReason: ['unacceptable_heritage_impact', 'incomplete_hra_report', 'public_objection_upheld', 'sahra_directive', 'mitigation_infeasible'],
      guards: [],
    },
    {
      // "flags heritage sensitivity" — reachable from any pending stage,
      // including the stalled-intake system time-bar sweep below (v1 has no
      // dedicated lapse state, so a stall lands here instead).
      id: 'add_to_watchlist',
      from: ACTIVE_STATES,
      to: 'heritage_watchlist',
      by: ['admin', 'ipp_developer', 'system'],
      label: 'Heritage watchlist',
      intent: 'destructive',
      requiresReason: ['heritage_sensitivity_confirmed', 'stalled_applicant_non_response', 'sahra_directive_watchlist', 'high_significance_find'],
      guards: [],
    },
  ],

  // stalled-intake time-bar: an HRA SAHRA never opened for review within 60
  // days is swept onto the heritage watchlist (ipp_ael's lapse-timer pattern,
  // adapted to v1's terminal set which has no lapse state).
  timers: [{ onState: 'hra_submitted', after: { days: 60 }, fire: 'add_to_watchlist', kind: 'time_bar', reason: 'stalled_applicant_non_response' }],
};
