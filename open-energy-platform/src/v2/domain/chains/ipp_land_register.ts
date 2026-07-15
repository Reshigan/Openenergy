// ipp_land_register — IPP as-built survey & land register update as data
// (oe_ipp_land_register). Deeds Act 47/1937 + SPLUMA (Spatial Planning and
// Land Use Management Act 16/2013): an IPP generation project's registered
// land footprint (erven + servitudes) has to match what was actually built.
// An IPP commissions a field survey, submits the as-built diagram to the
// Surveyor-General, notarises the servitude(s), lodges the corrected title
// deed, and the deeds office confirms registration. Two failure spines: the
// survey itself can be rejected as deficient (survey_rejected), or the deeds
// office can flag a defective title after lodging (defective_title) — which
// is curable via resolve_defective_title, re-lodging with a corrected
// deeds_reference and returning to deeds_lodged.
//
// Legacy parity note (chain-registry-meridian.ts ipp_land_register): every
// v1 action's roles array is exactly ['admin', 'ipp_developer'] — neither the
// Surveyor-General nor the deeds office is modelled as a distinct txn party
// (surveyor_firm is a descriptive field, not a role), so no extra role/guard
// is introduced here (same shape as ipp_ael's licensing authority). 'admin'
// holds the state while the work sits with an external authority (SG review,
// deeds office); 'ipp_developer' holds it while the next move is theirs.
//
// abandon/supersede are reachable from every non-terminal state — v1 gives
// them no from-state restriction ("terminates the survey process" /
// "replaces this survey with a new registration"), so any open register can
// be closed out either way.
//
// settles:false — a land/title register update is a compliance record, never
// a payment (R-S5-1). quantumCol in v1 is null (area_ha, not ZAR).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

const OPEN_STATES = [
  'survey_commissioned',
  'field_survey',
  'diagram_drafted',
  'sg_approved',
  'servitude_notarised',
  'deeds_lodged',
  'defective_title',
  'survey_rejected',
];

export const ippLandRegister: ChainDecl = {
  key: 'ipp_land_register',
  noun: 'IPP land register update',
  refPrefix: 'IPLR',
  title: (f) =>
    `Land register — ${(f.project_id as string) ?? 'project'} (${(f.deeds_reference as string) ?? 'unregistered'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Deeds Registries Act 47 of 1937', provision: 'title deed lodging & registration', effect: 'requires' },
    { instrument: 'Spatial Planning and Land Use Management Act 16 of 2013', provision: 'as-built survey diagram conformance', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin'],

  fields: {
    deeds_reference: { type: 'string', label: 'Deeds reference' },
    project_id: { type: 'string', required: true, label: 'Project' },
    area_ha: { type: 'number', required: true, min: 0, label: 'Survey area (ha)' },
    erf_count: { type: 'number', min: 0, label: 'Erf count' },
    servitude_count: { type: 'number', min: 0, label: 'Servitude count' },
    surveyor_firm: { type: 'string', label: 'Surveyor firm' },
    description: { type: 'string', label: 'Description' },
    // written by derive, never by the client
    field_survey_started_at: { type: 'string', label: 'Field survey started at' },
    diagram_submitted_at: { type: 'string', label: 'Diagram submitted at' },
    sg_approved_at: { type: 'string', label: 'SG approved at' },
    servitude_notarised_at: { type: 'string', label: 'Servitude notarised at' },
    deeds_lodged_at: { type: 'string', label: 'Deeds lodged at' },
    registered_at: { type: 'string', label: 'Deeds registered at' },
    abandoned_at: { type: 'string', label: 'Abandoned at' },
    superseded_at: { type: 'string', label: 'Superseded at' },
  },

  initial: 'survey_commissioned',

  states: {
    survey_commissioned: { label: 'Survey commissioned', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    field_survey: { label: 'Field survey underway', terminal: false, holder: 'ipp_developer', sla: { days: 21 } },
    diagram_drafted: { label: 'Diagram drafted — SG review', terminal: false, holder: 'admin', sla: { days: 30 } },
    sg_approved: { label: 'SG approved diagram', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    servitude_notarised: { label: 'Servitude notarised', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    deeds_lodged: { label: 'Deeds lodged', terminal: false, holder: 'admin', sla: { days: 60 } },
    defective_title: { label: 'Defective title', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    survey_rejected: { label: 'Survey rejected', terminal: false, holder: 'ipp_developer' },
    deeds_registered: { label: 'Deeds registered', terminal: true, holder: 'none' },
    abandoned: { label: 'Abandoned', terminal: true, holder: 'none' },
    superseded: { label: 'Superseded', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'survey_commissioned',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Commission survey',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        area_ha: { type: 'number', required: true, min: 0 },
        erf_count: { type: 'number', min: 0 },
        servitude_count: { type: 'number', min: 0 },
        surveyor_firm: { type: 'string' },
        description: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'commence_field_survey',
      from: 'survey_commissioned',
      to: 'field_survey',
      by: ['admin', 'ipp_developer'],
      label: 'Commence field survey',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ field_survey_started_at: isoUtc(at) }),
    },
    {
      id: 'submit_diagram',
      from: 'field_survey',
      to: 'diagram_drafted',
      by: ['admin', 'ipp_developer'],
      label: 'Submit diagram',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ diagram_submitted_at: isoUtc(at) }),
    },
    {
      id: 'sg_approve',
      from: 'diagram_drafted',
      to: 'sg_approved',
      by: ['admin', 'ipp_developer'],
      label: 'SG approve diagram',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ sg_approved_at: isoUtc(at) }),
    },
    {
      id: 'notarise_servitude',
      from: 'sg_approved',
      to: 'servitude_notarised',
      by: ['admin', 'ipp_developer'],
      label: 'Notarise servitude',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ servitude_notarised_at: isoUtc(at) }),
    },
    {
      id: 'lodge_deeds',
      from: 'servitude_notarised',
      to: 'deeds_lodged',
      by: ['admin', 'ipp_developer'],
      label: 'Lodge deeds',
      intent: 'primary',
      input: { deeds_reference: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ deeds_lodged_at: isoUtc(at) }),
    },
    {
      id: 'confirm_registration',
      from: 'deeds_lodged',
      to: 'deeds_registered',
      by: ['admin', 'ipp_developer'],
      label: 'Confirm registration',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ registered_at: isoUtc(at) }),
    },
    {
      // curable defect: re-lodging with the corrected deeds_reference returns
      // to deeds_lodged pending registration — same edge target as lodge_deeds.
      id: 'resolve_defective_title',
      from: 'defective_title',
      to: 'deeds_lodged',
      by: ['admin', 'ipp_developer'],
      label: 'Resolve defective title',
      intent: 'primary',
      input: { deeds_reference: { type: 'string', required: true } },
      guards: [],
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'raise_defective_title',
      from: 'deeds_lodged',
      to: 'defective_title',
      by: ['admin', 'ipp_developer'],
      label: 'Raise defective title',
      intent: 'destructive',
      requiresReason: ['title_defect_boundary', 'title_defect_encumbrance', 'title_defect_documentation', 'title_defect_ownership'],
      guards: [],
    },
    {
      id: 'reject_survey',
      from: ['survey_commissioned', 'field_survey', 'diagram_drafted', 'sg_approved', 'servitude_notarised'],
      to: 'survey_rejected',
      by: ['admin', 'ipp_developer'],
      label: 'Reject survey',
      intent: 'destructive',
      requiresReason: ['survey_incomplete', 'diagram_non_compliant', 'servitude_dispute', 'boundary_discrepancy'],
      guards: [],
    },
    {
      id: 'abandon',
      from: OPEN_STATES,
      to: 'abandoned',
      by: ['admin', 'ipp_developer'],
      label: 'Abandon',
      intent: 'destructive',
      requiresReason: ['project_decommissioned', 'project_withdrawn', 'land_unavailable', 'funding_lapsed'],
      guards: [],
      derive: (_f, at: Instant) => ({ abandoned_at: isoUtc(at) }),
    },
    {
      id: 'supersede',
      from: OPEN_STATES,
      to: 'superseded',
      by: ['admin', 'ipp_developer'],
      label: 'Supersede',
      intent: 'destructive',
      requiresReason: ['new_survey_commissioned', 'deeds_re_lodged', 'erf_subdivision_revised', 'boundary_correction'],
      guards: [],
      derive: (_f, at: Instant) => ({ superseded_at: isoUtc(at) }),
    },
  ],
};
