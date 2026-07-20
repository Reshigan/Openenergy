// ipp_ctr — IPP community trust report lifecycle, as data.
//
// Every REIPPPP Implementation Agreement carries Socio-Economic Development
// (SED) commitments funded through a community trust; the IPP reports each
// year's disbursement to DTIC, which accepts or rejects it, with a rejection
// appealable to a final determination. Ported 1:1 from the v1
// oe_ipp_community_trust_reports state machine (chain-registry-meridian.ts,
// wave 164) — 3 states + 3 terminal outcomes, 4 actions, single driving party
// (ipp_developer, per v1's counterpartyCol: null).
//
// Structural honesty (fidelity to v1, not a rewrite):
//  - v1 has no distinct DTIC/reviewer role — every action's roles array is
//    exactly ['admin', 'ipp_developer'], so DTIC's own accept/reject/appeal
//    steps are recorded BY the IPP developer (or admin, mapped to `operator`
//    per the ipp_bbbee/ipp_document_control convention). No regulator role is
//    invented here — the "crosses the regulator inbox" cascadeHints on
//    accept/reject/determine_appeal are cascade routing, not a live party.
//  - determine_appeal is reachable directly from report_rejected: v1's action
//    list has no separate "lodge appeal" step, so the appeal determination
//    itself is the only edge out of a rejected report. report_rejected stays
//    terminal (v1 lists it as such — it IS a closed outcome unless appealed);
//    a determined appeal is a distinct, later, final event on the same txn.
//  - v1's deadlineCol (sla_due_at) is armed by submit_to_dtic, matching the
//    dtic_review state's sla below ("INVERTED SLA" in v1's comment refers to
//    UI countdown direction, not a domain-layer concept).
//
// settles:false — a community trust report discloses a disbursement already
// made elsewhere; it never itself moves money (R-S5-1), despite carrying
// disbursement_amount_zar as v1's quantumCol (display/sort only).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippCtr: ChainDecl = {
  key: 'ipp_ctr',
  noun: 'IPP community trust report',
  refPrefix: 'CTR',
  title: (f) => `Community trust report — ${(f.trust_name as string) ?? (f.project_id as string) ?? 'project'} (${(f.reporting_year as number) ?? 'year TBC'})`,
  visibility: 'owner',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Implementation Agreement', provision: 'Socio-Economic Development community trust disbursement reporting', effect: 'requires' },
    { instrument: 'Broad-Based Black Economic Empowerment Act 53 of 2003', provision: 'SED scorecard element — DTIC disclosure', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'operator'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer (report owner)' },
    trust_name: { type: 'string', label: 'Trust name' },
    trust_category: { type: 'string', label: 'Trust category' },
    reporting_year: { type: 'number', required: true, label: 'Reporting year' },
    disbursement_amount_zar: { type: 'number', required: true, min: 0, label: 'Disbursement amount (ZAR)' },
    rejection_basis: { type: 'string', label: 'Rejection basis' },
    appeal_determination_basis: { type: 'string', label: 'Appeal determination basis' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted to DTIC at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    appeal_determined_at: { type: 'string', label: 'Appeal determined at' },
  },

  initial: 'report_drafted',

  states: {
    report_drafted: { label: 'Report drafted', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    dtic_review: { label: 'DTIC review', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    report_accepted: { label: 'Report accepted', terminal: true, holder: 'none' },
    report_rejected: { label: 'Report rejected', terminal: true, holder: 'none' },
    appeal_determined: { label: 'Appeal determined', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'report_drafted',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Draft community trust report',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        trust_category: { type: 'string' },
        reporting_year: { type: 'number', required: true },
        disbursement_amount_zar: { type: 'number', required: true, min: 0 },
        trust_name: { type: 'string' },
      },
      guards: [],
    },
    {
      // arms the DTIC review window (v1's sla_due_at).
      id: 'submit_to_dtic',
      from: 'report_drafted',
      to: 'dtic_review',
      by: ['ipp_developer', 'operator'],
      label: 'Submit to DTIC',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'accept_report',
      from: 'dtic_review',
      to: 'report_accepted',
      by: ['ipp_developer', 'operator'],
      label: 'Accept report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_report',
      from: 'dtic_review',
      to: 'report_rejected',
      by: ['ipp_developer', 'operator'],
      label: 'Reject report',
      intent: 'destructive',
      input: { rejection_basis: { type: 'string' } },
      requiresReason: ['incomplete_disclosure', 'disbursement_unverified', 'trust_deed_noncompliant', 'beneficiary_criteria_unmet', 'reporting_year_mismatch'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      // no separate "lodge appeal" step in v1 — this is the only edge out of a
      // rejected report, and it is the final word on it either way.
      id: 'determine_appeal',
      from: 'report_rejected',
      to: 'appeal_determined',
      by: ['ipp_developer', 'operator'],
      label: 'Determine appeal',
      intent: 'primary',
      input: { appeal_determination_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ appeal_determined_at: isoUtc(at) }),
    },
  ],
};
