// ipp_ael — an Atmospheric Emission Licence application for an IPP generation
// project, as data. NEMA:AQA (National Environmental Management: Air Quality
// Act 39 of 2004) s21/s22 makes an AEL a precondition for a listed emitting
// activity (e.g. diesel/gas peaking, biomass combustion). An IPP developer
// compiles an emissions inventory, prepares and lodges the application, the
// licensing authority runs completeness review → public participation →
// technical assessment → final review, then decides: grant, refuse, or the
// application lapses if it stalls.
//
// Legacy parity note (chain-registry-meridian.ts ipp_ael): every v1 action's
// roles array is exactly ['admin', 'ipp_developer'] — the licensing authority
// is not modelled as a distinct txn party in this chain (unlike
// environmental_authorisation, which carries a regulator_party). 'admin' acts
// as the platform-side proxy for the authority's own steps (accept, open
// participation, assess, decide), matching the legacy shape exactly — no
// regulator role/guard is introduced here, since there is no party field to
// satisfy one.
//
// The decision spine is STRUCTURAL: ael_granted is reachable ONLY from
// authority_final_review (via grant_ael), which is reachable ONLY through the
// full completeness → participation → technical-assessment sequence. An AEL
// can never be granted on an application the authority never reviewed.
//
// settles:false — a licence decision is a regulatory record, never a payment
// (R-S5-1). capacity_mw is sized for attention ranking (quantumCol in v1), not
// ZAR.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippAel: ChainDecl = {
  key: 'ipp_ael',
  noun: 'AEL application',
  refPrefix: 'AEL',
  title: (f) =>
    `AEL — ${(f.project_id as string) ?? 'project'} (${(f.ael_category as string) ?? 'uncategorised'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'National Environmental Management: Air Quality Act 39 of 2004', provision: 's22 Atmospheric Emission Licence for listed activities', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    trigger_category: { type: 'string', label: 'Trigger category' },
    ael_category: { type: 'string', label: 'AEL category' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    authority_reference: { type: 'string', label: 'Authority reference' },
    emissions_consultant: { type: 'string', label: 'Emissions consultant' },
    notes: { type: 'string', label: 'Grant notes' },
    // written by derive, never by the client
    application_submitted_at: { type: 'string', label: 'Application submitted at' },
    technical_assessment_commenced_at: { type: 'string', label: 'Technical assessment commenced at' },
    granted_at: { type: 'string', label: 'Granted at' },
  },

  initial: 'ael_triggered',

  states: {
    ael_triggered: { label: 'AEL triggered', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    emissions_inventory: { label: 'Emissions inventory', terminal: false, holder: 'ipp_developer', sla: { days: 21 } },
    application_preparation: { label: 'Application preparation', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    application_submitted: { label: 'Application submitted', terminal: false, holder: 'admin', sla: { days: 30 } },
    authority_completeness_review: { label: 'Authority completeness review', terminal: false, holder: 'admin', sla: { days: 30 } },
    public_participation_open: { label: 'Public participation open', terminal: false, holder: 'admin', sla: { days: 30 } },
    public_participation_closed: { label: 'Public participation closed', terminal: false, holder: 'admin', sla: { days: 14 } },
    technical_assessment: { label: 'Technical assessment', terminal: false, holder: 'admin', sla: { days: 60 } },
    authority_final_review: { label: 'Authority final review', terminal: false, holder: 'admin', sla: { days: 30 } },
    ael_granted: { label: 'AEL granted', terminal: true, holder: 'none' },
    ael_refused: { label: 'AEL refused', terminal: true, holder: 'none' },
    ael_lapsed: { label: 'AEL lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'ael_triggered',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Trigger AEL application',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        trigger_category: { type: 'string' },
        ael_category: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        authority_reference: { type: 'string' },
        emissions_consultant: { type: 'string' },
      },
      guards: [],
    },

    // --- happy path -------------------------------------------------------
    {
      id: 'compile_inventory',
      from: 'ael_triggered',
      to: 'emissions_inventory',
      by: ['ipp_developer', 'admin'],
      label: 'Compile emissions inventory',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'prepare_application',
      from: 'emissions_inventory',
      to: 'application_preparation',
      by: ['ipp_developer', 'admin'],
      label: 'Prepare application',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_application',
      from: 'application_preparation',
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
      to: 'authority_completeness_review',
      by: ['admin', 'ipp_developer'],
      label: 'Accept for review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'open_public_participation',
      from: 'authority_completeness_review',
      to: 'public_participation_open',
      by: ['admin', 'ipp_developer'],
      label: 'Open public participation',
      intent: 'primary',
      guards: [],
    },
    {
      // v1's action list jumps straight to commence_technical_assessment; the
      // participation window still needs its own close before assessment can
      // start (public_participation_closed is a distinct filter status).
      id: 'close_public_participation',
      from: 'public_participation_open',
      to: 'public_participation_closed',
      by: ['admin', 'ipp_developer'],
      label: 'Close public participation',
      intent: 'secondary',
      guards: [],
    },
    {
      id: 'commence_technical_assessment',
      from: 'public_participation_closed',
      to: 'technical_assessment',
      by: ['admin', 'ipp_developer'],
      label: 'Commence technical assessment',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ technical_assessment_commenced_at: isoUtc(at) }),
    },
    {
      // bridging step into the authority's final decision review — v1's filter
      // list carries authority_final_review as a distinct status ahead of the
      // decided tier.
      id: 'complete_technical_assessment',
      from: 'technical_assessment',
      to: 'authority_final_review',
      by: ['admin', 'ipp_developer'],
      label: 'Complete technical assessment',
      intent: 'secondary',
      guards: [],
    },
    {
      // structural decision gate: the ONLY edge into ael_granted, reachable
      // ONLY from authority_final_review — a full completeness → participation
      // → technical-assessment sequence.
      id: 'grant_ael',
      from: 'authority_final_review',
      to: 'ael_granted',
      by: ['admin', 'ipp_developer'],
      label: 'Grant AEL',
      intent: 'primary',
      input: {
        authority_reference: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ granted_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'refuse_ael',
      from: ['technical_assessment', 'authority_final_review'],
      to: 'ael_refused',
      by: ['admin', 'ipp_developer'],
      label: 'Refuse AEL',
      intent: 'destructive',
      requiresReason: ['unacceptable_emissions_impact', 'incomplete_application', 'public_objection_upheld', 'non_compliant_technology', 'authority_directive'],
      guards: [],
    },
    {
      // "lapses a stalled application" — reachable from any pending stage,
      // including the system time-bar sweep below.
      id: 'lapse_ael',
      from: [
        'ael_triggered',
        'emissions_inventory',
        'application_preparation',
        'application_submitted',
        'authority_completeness_review',
        'public_participation_open',
        'public_participation_closed',
        'technical_assessment',
        'authority_final_review',
      ],
      to: 'ael_lapsed',
      by: ['admin', 'ipp_developer', 'system'],
      label: 'Lapse application',
      intent: 'destructive',
      requiresReason: ['applicant_non_response', 'deadline_missed', 'superseded_application', 'project_cancelled'],
      guards: [],
    },
  ],

  // stalled-intake time-bar: an application the authority never accepted for
  // review within 60 days lapses automatically (audit_chain / ppa_contract
  // pattern).
  timers: [{ onState: 'application_submitted', after: { days: 60 }, fire: 'lapse_ael', kind: 'time_bar', reason: 'deadline_missed' }],
};
