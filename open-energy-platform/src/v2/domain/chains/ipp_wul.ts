// ipp_wul — IPP Water-Use Licence (National Water Act s21) application, as data.
//
// A REIPPPP generation project that diverts, stores, impedes, or discharges
// water needs a DWS Water-Use Licence before construction can proceed. The
// developer drafts and submits; DWS runs a completeness review, opens public
// participation, then a technical assessment; DWS then grants, refuses, or
// (if the applicant/DWS stalls) the application lapses.
//
// The temporal spine is structural: grant_wul/refuse_wul are the ONLY edges
// out of technical_assessment (refuse_wul also reachable from the earlier
// review states), so a licence can never be "granted" without having passed
// through completeness review and public participation — no guard needed for
// that ordering.
//
// DWS accepting an application for review needs a completeness-evidence ref
// (completenessEvidencePresent). Granting the licence on a strategic-tier
// (≥100 MW) project needs the regulator (DWS) present as a live party on the
// txn (regulatorPresentIfStrategic).
//
// settles:false — a water-use licence is a regulatory permit record, never a
// payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippWul: ChainDecl = {
  key: 'ipp_wul',
  noun: 'IPP water-use licence application',
  refPrefix: 'WUL',
  title: (f) =>
    `WUL ${(f.dws_reference as string) ?? (f.project_id as string) ?? 'application'} — ${(f.section21_category as string) ?? 'water use'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'environmental & water-use conditions precedent', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'generation-licence environmental compliance', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator', 'admin'],

  fields: {
    dws_reference: { type: 'string', label: 'DWS reference' },
    project_id: { type: 'string', required: true, label: 'Project' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'DWS regulator' },
    trigger_category: { type: 'string', label: 'Trigger category' },
    section21_category: { type: 'string', label: 'Section 21 water-use category' },
    capacity_mw: { type: 'number', min: 0, label: 'Generation capacity (MW)' },
    water_consultant: { type: 'string', label: 'Water consultant' },
    completeness_ref: { type: 'string', label: 'Completeness-review evidence ref' },
    notes: { type: 'string', label: 'Notes' },
    reason: { type: 'string', label: 'Refusal / lapse reason' },
    // derive-stamped timestamps
    submitted_at: { type: 'string', label: 'Submitted at' },
    granted_at: { type: 'string', label: 'Granted at' },
    refused_at: { type: 'string', label: 'Refused at' },
    lapsed_at: { type: 'string', label: 'Lapsed at' },
  },

  initial: 'wul_application_triggered',

  states: {
    wul_application_triggered: { label: 'Application drafting', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    application_submitted: { label: 'Application submitted', terminal: false, holder: 'regulator', sla: { days: 90 } },
    dws_completeness_review: { label: 'DWS completeness review', terminal: false, holder: 'regulator', sla: { days: 30 } },
    public_participation_open: { label: 'Public participation open', terminal: false, holder: 'regulator', sla: { days: 30 } },
    technical_assessment: { label: 'Technical assessment', terminal: false, holder: 'regulator', sla: { days: 60 } },
    wul_granted: { label: 'WUL granted', terminal: true, holder: 'none' },
    wul_refused: { label: 'WUL refused', terminal: true, holder: 'none' },
    wul_lapsed: { label: 'WUL lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'wul_application_triggered',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Draft WUL application',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        trigger_category: { type: 'string', required: true },
        section21_category: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        dws_reference: { type: 'string' },
        water_consultant: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'submit_application',
      from: 'wul_application_triggered',
      to: 'application_submitted',
      by: ['ipp_developer', 'admin'],
      label: 'Submit application',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      // DWS accepting the application for review needs a named
      // completeness-evidence ref — the statutory completeness check.
      id: 'accept_for_review',
      from: 'application_submitted',
      to: 'dws_completeness_review',
      by: ['regulator', 'admin'],
      label: 'Accept for review',
      intent: 'primary',
      input: { completeness_ref: { type: 'string', required: true } },
      guards: ['completenessEvidencePresent'],
    },
    {
      id: 'open_public_participation',
      from: 'dws_completeness_review',
      to: 'public_participation_open',
      by: ['regulator', 'admin'],
      label: 'Open public participation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_technical_assessment',
      from: 'public_participation_open',
      to: 'technical_assessment',
      by: ['regulator', 'admin'],
      label: 'Commence technical assessment',
      intent: 'primary',
      guards: [],
    },
    {
      // strategic-tier (≥100 MW) grants need DWS/regulator as a live party.
      id: 'grant_wul',
      from: 'technical_assessment',
      to: 'wul_granted',
      by: ['regulator', 'admin'],
      label: 'Grant WUL',
      intent: 'primary',
      input: {
        dws_reference: { type: 'string', required: true },
        notes: { type: 'string' },
      },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ granted_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'refuse_wul',
      from: ['application_submitted', 'dws_completeness_review', 'public_participation_open', 'technical_assessment'],
      to: 'wul_refused',
      by: ['regulator', 'admin'],
      label: 'Refuse WUL',
      intent: 'destructive',
      requiresReason: [
        'environmental_impact_unacceptable',
        'insufficient_water_availability',
        'downstream_user_objection',
        'non_compliance_with_norms',
        'incomplete_technical_case',
      ],
      input: { reason: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ refused_at: isoUtc(at) }),
    },
    {
      id: 'lapse_wul',
      from: [
        'wul_application_triggered',
        'application_submitted',
        'dws_completeness_review',
        'public_participation_open',
        'technical_assessment',
      ],
      to: 'wul_lapsed',
      by: ['ipp_developer', 'regulator', 'admin', 'system'],
      label: 'Lapse application',
      intent: 'destructive',
      requiresReason: [
        'applicant_withdrew',
        'information_not_furnished',
        'sla_deadline_missed',
        'duplicate_application',
        'project_cancelled',
      ],
      guards: [],
      derive: (_f, at: Instant) => ({ lapsed_at: isoUtc(at) }),
    },
  ],

  // a submitted application DWS never accepts for review within 90 days
  // stales out (permit_to_work / ipp_evm cancel-book pattern).
  timers: [
    { onState: 'application_submitted', after: { days: 90 }, fire: 'lapse_wul', kind: 'time_bar', reason: 'sla_deadline_missed' },
  ],
};
