// licence_application — NERSA generation/trading licence lifecycle as data.
//
// Pilot chain 4 (docs/architecture/REBUILD_FUNCTIONAL_FLOOR.md). Two-party:
// applicant vs regulator. An applicant lodges, the regulator runs completeness →
// public participation → technical evaluation → council decision → grant → issue.
// The completeness sign-off (accept_application) is guarded: no acceptance
// without a named completeness-evidence ref (completenessEvidencePresent).
//
// NO claim key. A NERSA licence is entry-gate exclusivity but it is WHILE-ACTIVE,
// not permanent: a licence can lapse and the facility re-applies for a fresh one.
// A permanent claim (carbon_retirement pattern) would wrongly block re-application
// forever. While-active exclusivity needs a claim+release mechanism the domain
// does not yet model — deliberately out of scope here.
//
// settles:false — a licence grant is a regulatory act, not a payment. No custody,
// no money (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const licenceApplication: ChainDecl = {
  key: 'licence_application',
  noun: 'Licence application',
  refPrefix: 'LIC',
  title: (f) => `${(f.licence_class as string) ?? 'standard'} licence — ${(f.facility_ref as string) ?? 'unnamed facility'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's8 licence to generate/trade', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'licensing rules', effect: 'authorises' },
  ],
  roles: ['applicant', 'regulator', 'operator'],

  fields: {
    applicant_name: { type: 'string', required: true, label: 'Applicant' },
    facility_ref: { type: 'string', required: true, label: 'Facility ref' },
    licence_class: { type: 'string', required: true, label: 'Class (major/standard/minor)' },
    activity: { type: 'string', required: true, label: 'Licensed activity' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    // written by derive, never by the client
    granted_at: { type: 'string', label: 'Granted at' },
    issued_at: { type: 'string', label: 'Issued at' },
  },

  initial: 'application_received',

  states: {
    application_received: { label: 'Application received', terminal: false, holder: 'regulator', sla: { days: 5 } },
    completeness_review: { label: 'Completeness review', terminal: false, holder: 'regulator', sla: { days: 30 } },
    additional_info_requested: { label: 'Additional info requested', terminal: false, holder: 'applicant', sla: { days: 60 } },
    accepted: { label: 'Accepted for processing', terminal: false, holder: 'regulator', sla: { days: 14 } },
    public_participation: { label: 'Public participation', terminal: false, holder: 'regulator', sla: { days: 30 } },
    technical_evaluation: { label: 'Technical evaluation', terminal: false, holder: 'regulator', sla: { days: 60 } },
    council_decision: { label: 'Council decision', terminal: false, holder: 'regulator', sla: { days: 30 } },
    licence_granted: { label: 'Licence granted', terminal: false, holder: 'regulator', sla: { days: 14 } },
    licence_issued: { label: 'Licence issued', terminal: true, holder: 'none' },
    refused: { label: 'Refused', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'application_received',
      by: ['applicant', 'operator'],
      actorBecomes: 'applicant',
      label: 'Lodge application',
      intent: 'primary',
      input: {
        applicant_name: { type: 'string', required: true },
        facility_ref: { type: 'string', required: true },
        licence_class: { type: 'string', required: true },
        activity: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: ['complianceHaltClear'],
    },

    { id: 'begin_review', from: 'application_received', to: 'completeness_review', by: ['regulator'], label: 'Begin completeness review', intent: 'primary', guards: [] },
    {
      id: 'request_info',
      from: 'completeness_review',
      to: 'additional_info_requested',
      by: ['regulator'],
      label: 'Request additional information',
      intent: 'secondary',
      requiresReason: ['incomplete_application', 'documents_missing', 'clarification_needed'],
      guards: [],
    },
    { id: 'submit_info', from: 'additional_info_requested', to: 'completeness_review', by: ['applicant'], label: 'Submit requested information', intent: 'primary', input: { completeness_ref: { type: 'string', required: true } }, guards: [] },
    {
      id: 'accept_application',
      from: 'completeness_review',
      to: 'accepted',
      by: ['regulator'],
      label: 'Accept for processing',
      intent: 'primary',
      input: { completeness_ref: { type: 'string', required: true } },
      guards: ['completenessEvidencePresent'],
    },
    { id: 'open_participation', from: 'accepted', to: 'public_participation', by: ['regulator'], label: 'Open public participation', intent: 'primary', guards: [] },
    { id: 'begin_evaluation', from: 'public_participation', to: 'technical_evaluation', by: ['regulator'], label: 'Begin technical evaluation', intent: 'primary', guards: [] },
    { id: 'refer_to_council', from: 'technical_evaluation', to: 'council_decision', by: ['regulator'], label: 'Refer to council', intent: 'primary', guards: [] },
    {
      id: 'grant_licence',
      from: 'council_decision',
      to: 'licence_granted',
      by: ['regulator'],
      label: 'Grant licence',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ granted_at: isoUtc(at) }),
    },
    {
      id: 'issue_licence',
      from: 'licence_granted',
      to: 'licence_issued',
      by: ['regulator'],
      label: 'Issue licence',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ issued_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'refuse_licence',
      from: ['technical_evaluation', 'council_decision'],
      to: 'refused',
      by: ['regulator'],
      label: 'Refuse licence',
      intent: 'destructive',
      requiresReason: ['grid_impact_unacceptable', 'not_in_public_interest', 'applicant_not_fit', 'technical_deficiency'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['application_received', 'completeness_review', 'additional_info_requested', 'accepted', 'public_participation', 'technical_evaluation'],
      to: 'withdrawn',
      by: ['applicant'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'refiling', 'no_longer_required'],
      guards: [],
    },
    {
      id: 'lapse',
      from: 'additional_info_requested',
      to: 'lapsed',
      by: ['regulator', 'system'],
      label: 'Lapse (no response)',
      intent: 'destructive',
      requiresReason: ['info_deadline_missed'],
      guards: [],
    },
  ],

  // additional-info requests time-bar: if the applicant does not respond within
  // the 60-day ERA 2006 information window (state sla), the application lapses
  // (same pattern as ppa_contract's auto_expire).
  timers: [{ onState: 'additional_info_requested', after: { days: 60 }, fire: 'lapse', kind: 'time_bar', reason: 'info_deadline_missed' }],
};
