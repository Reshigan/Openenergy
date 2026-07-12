// environmental_authorisation — a NEMA environmental authorisation (EIA) for a
// generation project, as data. A developer scopes and submits an EIA report; the
// competent authority (regulator) commences review and either issues or refuses
// the authorisation. Section 24 of NEMA makes the authorisation a precondition
// for listed activities — this chain is the record of that decision, not a
// payment.
//
// The decision spine is STRUCTURAL, not a guard: authorised is reachable ONLY
// from under_review (via issue_authorisation), and under_review is reachable ONLY
// from submitted (via commence_review). So issuing from submitted — before the
// authority has taken the application under review — is an ILLEGAL_TRANSITION the
// engine's step-4 state check refuses before any guard runs. An authorisation can
// never be issued on an application the authority never reviewed.
//
// eia_report_ref is a genuinely-mandatory payload (required input, no guard): you
// cannot submit an EIA with nothing → an absent ref is a real BAD_INPUT.
// completeness_ref rides completenessEvidencePresent (Pattern A: present-but-not-
// required so an absent ref surfaces MISSING_COMPLETENESS_EVIDENCE, not BAD_INPUT).
//
// settles:false — an authorisation is a regulatory notice/framework record. No
// money moves through THIS chain (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const environmentalAuthorisation: ChainDecl = {
  key: 'environmental_authorisation',
  noun: 'Environmental authorisation',
  refPrefix: 'ENVA',
  title: (f) =>
    `EIA — ${(f.project_name as string) ?? 'project'} / ${(f.developer_name as string) ?? 'developer'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'National Environmental Management Act 107 of 1998', provision: 's24 environmental authorisation for listed activities', effect: 'requires' },
    { instrument: 'EIA Regulations 2014 (GN R982)', provision: 'scoping + EIR competent-authority decision process', effect: 'requires' },
  ],
  roles: ['developer', 'regulator', 'operator'],

  fields: {
    project_name: { type: 'string', required: true, label: 'Project' },
    developer_name: { type: 'string', required: true, label: 'Developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Competent authority' },
    listed_activity: { type: 'string', label: 'Listed activity (Listing Notice)' },
    site_description: { type: 'string', label: 'Site description' },
    capacity_mw: { type: 'number', label: 'Capacity (MW)' },
    eia_report_ref: { type: 'string', label: 'EIA report ref' },
    completeness_ref: { type: 'string', label: 'Decision completeness evidence ref' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'EIA submitted at' },
    review_commenced_at: { type: 'string', label: 'Review commenced at' },
    authorised_at: { type: 'string', label: 'Authorised at' },
  },

  initial: 'scoping',

  states: {
    scoping: { label: 'Scoping', terminal: false, holder: 'developer', sla: { days: 44 } },
    submitted: { label: 'EIA submitted', terminal: false, holder: 'regulator', sla: { days: 10 } },
    under_review: { label: 'Under review', terminal: false, holder: 'regulator', sla: { days: 107 } },
    authorised: { label: 'Authorised', terminal: true, holder: 'none' },
    refused: { label: 'Refused', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'scoping',
      by: ['developer', 'operator'],
      actorBecomes: 'developer',
      label: 'Open scoping',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        developer_name: { type: 'string', required: true },
        // the competent authority attaches at @new so it holds a live role for the
        // regulator-only review/decision edges (an actor named after open holds none).
        regulator_party: { type: 'party', role: 'regulator' },
        listed_activity: { type: 'string' },
        site_description: { type: 'string' },
        capacity_mw: { type: 'number' },
      },
      guards: [],
    },

    // --- happy path -----------------------------------------------------------
    {
      // the EIA report ref is a genuinely-mandatory payload: you cannot submit an
      // EIA with nothing (an absent ref is a real BAD_INPUT, not a masked guard).
      id: 'submit_eia',
      from: 'scoping',
      to: 'submitted',
      by: ['developer', 'operator'],
      label: 'Submit EIA report',
      intent: 'primary',
      input: { eia_report_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'commence_review',
      from: 'submitted',
      to: 'under_review',
      by: ['regulator'],
      label: 'Commence review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ review_commenced_at: isoUtc(at) }),
    },
    {
      // structural decision gate: the ONLY edge into authorised, and it can only
      // fire from under_review — which only commence_review reaches. An
      // authorisation therefore can NEVER be issued on an unreviewed application.
      // A decision completeness ref rides completenessEvidencePresent (Pattern A).
      id: 'issue_authorisation',
      from: 'under_review',
      to: 'authorised',
      by: ['regulator'],
      label: 'Issue authorisation',
      intent: 'primary',
      input: {
        // present-but-not-required so an absent ref surfaces the guard's
        // MISSING_COMPLETENESS_EVIDENCE, not a generic BAD_INPUT (Pattern A).
        completeness_ref: { type: 'string' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ authorised_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'refuse_authorisation',
      from: 'under_review',
      to: 'refused',
      by: ['regulator'],
      label: 'Refuse authorisation',
      intent: 'destructive',
      requiresReason: ['unacceptable_impact', 'inadequate_assessment', 'no_go_alternative', 'public_objection_upheld'],
      guards: [],
    },
    {
      id: 'withdraw_application',
      from: ['scoping', 'submitted'],
      to: 'withdrawn',
      by: ['developer', 'operator'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'redesign_required', 'superseded', 'commercially_unviable'],
      guards: [],
    },
  ],

  // decision time-bar: an application left under review past the regulated window
  // stales out. Record-only stub — the sweep computes the real bar off the state
  // sla days (contract_execution / isda_agreement pattern).
  timers: [{ onState: 'under_review', after: { days: 0 }, fire: 'refuse_authorisation', kind: 'time_bar' }],
};
