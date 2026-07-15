// ipp_eco — an IPP's annual Environmental Control Officer (ECO) compliance
// report against its NEMA Environmental Authorisation, as data. The developer
// appoints an ECO, runs a site inspection, drafts and lodges the report with
// DFFE, and the report either clears clean (compliant) or, on a flagged
// breach, runs the corrective-action / re-submission loop before either
// closing compliant or escalating to DFFE enforcement.
//
// certify_compliant and identify_non_compliance are the ONLY edges reachable
// from under_review / responses_submitted — a report can never be certified
// or flagged before DFFE has actually taken it under review (commence_dffe_
// review is the only path into under_review). Structural, no guard needed.
//
// submit_for_review is the crossing point where a developer's internal
// paperwork becomes a DFFE filing: a ≥100 MW project needs the regulator
// (DFFE) already on the txn to lodge (regulatorPresentIfStrategic).
//
// settles:false — an annual compliance report is a regulatory record, no
// money moves through this chain (R-S5-1). Fixed per-state SLA durations are
// used here as an approximation of v1's capacity-inverted deadline; the
// dynamic (by-MW) SLA logic v1 encoded outside ChainDecl doesn't have a v2
// equivalent (StateDecl.sla is a fixed Duration only).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippEco: ChainDecl = {
  key: 'ipp_eco',
  noun: 'IPP ECO compliance report',
  refPrefix: 'ECO',
  title: (f) => `ECO report — ${(f.project_id as string) ?? 'project'} (${(f.reporting_year as number) ?? 'n/a'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'National Environmental Management Act 107 of 1998', provision: 'EMPr / Environmental Authorisation annual compliance reporting', effect: 'requires' },
    { instrument: 'REIPPPP', provision: 'Implementation Agreement environmental-authorisation conditions', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin', 'regulator'],

  fields: {
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'DFFE (competent authority)' },
    project_id: { type: 'string', required: true, label: 'Project' },
    reporting_year: { type: 'number', required: true, label: 'Reporting year' },
    capacity_mw: { type: 'number', min: 0, label: 'Project capacity (MW)' },
    ea_reference: { type: 'string', label: 'EA reference' },
    eco_name: { type: 'string', label: 'ECO name' },
    violation_category: { type: 'string', label: 'Violation category (water/waste/vegetation/noise_dust/heritage/biodiversity/rehabilitation)' },
    inspection_notes: { type: 'string', label: 'Site inspection notes' },
    submission_notes: { type: 'string', label: 'DFFE submission notes' },
    query_notes: { type: 'string', label: 'DFFE query details' },
    response_notes: { type: 'string', label: 'Response to DFFE queries' },
    non_compliance_notes: { type: 'string', label: 'Non-compliance detail' },
    corrective_action_notes: { type: 'string', label: 'Corrective action plan' },
    // derive-stamped timestamps
    eco_appointed_at: { type: 'string', label: 'ECO appointed at' },
    inspection_completed_at: { type: 'string', label: 'Inspection completed at' },
    submitted_at: { type: 'string', label: 'Submitted to DFFE at' },
    review_commenced_at: { type: 'string', label: 'DFFE review commenced at' },
    non_compliance_identified_at: { type: 'string', label: 'Non-compliance identified at' },
    compliant_at: { type: 'string', label: 'Certified compliant at' },
    enforcement_referred_at: { type: 'string', label: 'Referred to enforcement at' },
  },

  initial: 'audit_due',

  states: {
    audit_due: { label: 'Audit due', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    eco_appointed: { label: 'ECO appointed', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    site_inspection_in_progress: { label: 'Site inspection in progress', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    report_drafting: { label: 'Report drafting', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    submitted_to_dffe: { label: 'Submitted to DFFE', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    under_review: { label: 'Under DFFE review', terminal: false, holder: 'ipp_developer', sla: { days: 60 } },
    queries_raised: { label: 'DFFE queries raised', terminal: false, holder: 'ipp_developer', sla: { days: 21 } },
    responses_submitted: { label: 'Responses submitted', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    non_compliance_identified: { label: 'Non-compliance identified', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    corrective_action_in_progress: { label: 'Corrective action in progress', terminal: false, holder: 'ipp_developer', sla: { days: 60 } },
    compliant: { label: 'Compliant', terminal: true, holder: 'none' },
    enforcement_referral: { label: 'Referred to enforcement', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'audit_due',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Open ECO report',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        reporting_year: { type: 'number', required: true },
        capacity_mw: { type: 'number', min: 0 },
        ea_reference: { type: 'string' },
        eco_name: { type: 'string' },
        violation_category: { type: 'string' },
        // the competent authority attaches at @new so it holds a live role for
        // the strategic-crossing guard on submit_for_review.
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'appoint_eco',
      from: 'audit_due',
      to: 'eco_appointed',
      by: ['ipp_developer', 'admin'],
      label: 'Appoint ECO',
      intent: 'primary',
      input: { eco_name: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ eco_appointed_at: isoUtc(at) }),
    },
    {
      id: 'commence_site_inspection',
      from: 'eco_appointed',
      to: 'site_inspection_in_progress',
      by: ['ipp_developer', 'admin'],
      label: 'Commence site inspection',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'complete_site_inspection',
      from: 'site_inspection_in_progress',
      to: 'report_drafting',
      by: ['ipp_developer', 'admin'],
      label: 'Complete site inspection',
      intent: 'primary',
      input: { inspection_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ inspection_completed_at: isoUtc(at) }),
    },
    {
      // crossing point: a developer's internal draft becomes a DFFE filing. A
      // ≥100 MW project needs the regulator already on the txn to lodge.
      id: 'submit_for_review',
      from: 'report_drafting',
      to: 'submitted_to_dffe',
      by: ['ipp_developer', 'admin'],
      label: 'Submit for review',
      intent: 'primary',
      input: { submission_notes: { type: 'string' } },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'commence_dffe_review',
      from: 'submitted_to_dffe',
      to: 'under_review',
      by: ['ipp_developer', 'admin'],
      label: 'Commence DFFE review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ review_commenced_at: isoUtc(at) }),
    },
    {
      id: 'raise_queries',
      from: 'under_review',
      to: 'queries_raised',
      by: ['ipp_developer', 'admin'],
      label: 'Raise queries',
      intent: 'secondary',
      input: { query_notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'submit_responses',
      from: 'queries_raised',
      to: 'responses_submitted',
      by: ['ipp_developer', 'admin'],
      label: 'Submit responses',
      intent: 'primary',
      input: { response_notes: { type: 'string' } },
      guards: [],
    },
    {
      // structural: reachable ONLY from under_review / responses_submitted, both
      // of which are reachable ONLY once commence_dffe_review has fired.
      id: 'certify_compliant',
      from: ['under_review', 'responses_submitted'],
      to: 'compliant',
      by: ['ipp_developer', 'admin'],
      label: 'Certify compliant',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ compliant_at: isoUtc(at) }),
    },
    {
      id: 'identify_non_compliance',
      from: ['under_review', 'responses_submitted'],
      to: 'non_compliance_identified',
      by: ['ipp_developer', 'admin'],
      label: 'Flag non-compliance',
      intent: 'destructive',
      input: { non_compliance_notes: { type: 'string', required: true } },
      requiresReason: ['water_management', 'waste_management', 'vegetation_clearing', 'noise_dust', 'heritage_resources', 'biodiversity', 'rehabilitation'],
      guards: [],
      derive: (_f, at: Instant) => ({ non_compliance_identified_at: isoUtc(at) }),
    },
    {
      id: 'commence_corrective_action',
      from: 'non_compliance_identified',
      to: 'corrective_action_in_progress',
      by: ['ipp_developer', 'admin'],
      label: 'Commence corrective action',
      intent: 'primary',
      input: { corrective_action_notes: { type: 'string' } },
      guards: [],
    },
    {
      // re-submission after remediation loops back into the DFFE review spine.
      id: 'submit_report',
      from: 'corrective_action_in_progress',
      to: 'submitted_to_dffe',
      by: ['ipp_developer', 'admin'],
      label: 'Submit to DFFE',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },

    // --- exit -------------------------------------------------------------
    {
      id: 'refer_to_enforcement',
      from: ['non_compliance_identified', 'corrective_action_in_progress'],
      to: 'enforcement_referral',
      by: ['ipp_developer', 'admin'],
      label: 'Refer to enforcement',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ enforcement_referred_at: isoUtc(at) }),
    },
  ],
};
