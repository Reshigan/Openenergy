// ipp_ppavar — IPP PPA variation (NERSA licence/PPA amendment, ERA 2006 s.35)
// as data.
//
// An IPP lodges a variation (capacity, tariff, term, offtaker substitution or
// technical-parameter change) against a live PPA. NERSA runs it through the
// same three-stage review spine as licence_application (regulatory screening →
// technical review → commercial review) then opens/closes public
// participation before an internal assessment produces a determination:
// approve (re-executes the amended PPA) or refuse.
//
// A refusal is not always final: file_appeal is the ONLY edge out of
// `rejected`, and determine_appeal is the ONLY edge out of `appeal_filed` —
// same "terminal state with one narrow way back in" shape as ipp_lta's
// certificate_refused → raise_appeal → appeal_raised → determine_appeal spine.
//
// Regulator crossing: the legacy hint says approval crosses the regulator
// inbox on EVERY tier (Gazette publication — the W155 signature act), so it's
// a required party input on approve_variation, not a guard. Refusal and the
// appeal both cross the regulator only for major/material (≥100 MW) tiers —
// modelled with regulatorPresentIfStrategic off capacity_mw.
//
// Legacy flags `sla_due_at` as an "inverted SLA" (the regulator holds the
// clock, not the applicant) — noted here, not modelled as a distinct v2
// mechanic; per-state `sla` still documents the expected review window.
//
// No timers: the legacy descriptor has a deadlineCol but no single canonical
// auto-fire edge (screening/review/participation stages each have their own
// admin-driven close), so a bundle-safe timer isn't obvious — omitted rather
// than guessed (plan: timers are always safe to skip on a first pass).
//
// settles:false — a PPA variation determination is a regulatory act; the
// money the amended PPA prices moves through the PPA/settlement chains it
// re-executes, not here (quantumCol: null in the legacy descriptor; R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippPpavar: ChainDecl = {
  key: 'ipp_ppavar',
  noun: 'PPA variation',
  refPrefix: 'PPAV',
  title: (f) => `PPA variation — ${(f.variation_type as string) ?? 'variation'} (${(f.project_id as string) ?? 'project TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's35 licence/PPA amendment', effect: 'requires' },
    { instrument: 'REIPPPP', provision: 'Implementation Agreement PPA variation', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'operator', 'regulator'],

  fields: {
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'Applicant (IPP)' },
    operator_party: { type: 'party', role: 'operator', label: 'Platform operator' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    project_id: { type: 'string', required: true, label: 'Project' },
    ppa_reference: { type: 'string', label: 'PPA reference (agreement being varied)' },
    variation_type: { type: 'string', required: true, label: 'Variation type' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    description: { type: 'string', required: true, label: 'Variation description' },
    agreement_reference: { type: 'string', label: 'Amended agreement reference' },
    appeal_grounds: { type: 'string', label: 'Appeal grounds' },
    appeal_determination: { type: 'string', label: 'Appeal determination' },
    // derive-stamped timestamps
    lodged_at: { type: 'string', label: 'Lodged at' },
    approved_at: { type: 'string', label: 'Approved at' },
    amended_at: { type: 'string', label: 'PPA amended at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    appeal_filed_at: { type: 'string', label: 'Appeal filed at' },
    appeal_determined_at: { type: 'string', label: 'Appeal determined at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'variation_lodged',

  states: {
    variation_lodged: { label: 'Variation lodged', terminal: false, holder: 'operator', sla: { days: 5 } },
    regulatory_screening: { label: 'Regulatory screening', terminal: false, holder: 'operator', sla: { days: 30 } },
    technical_review: { label: 'Technical review', terminal: false, holder: 'operator', sla: { days: 60 } },
    commercial_review: { label: 'Commercial review', terminal: false, holder: 'operator', sla: { days: 30 } },
    public_participation: { label: 'Public participation', terminal: false, holder: 'operator', sla: { days: 30 } },
    nersa_assessment: { label: 'NERSA assessment', terminal: false, holder: 'operator', sla: { days: 30 } },
    variation_approved: { label: 'Variation approved', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    ppa_amended: { label: 'PPA amended', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    appeal_filed: { label: 'Appeal filed', terminal: false, holder: 'operator', sla: { days: 30 } },
    appeal_determined: { label: 'Appeal determined', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'variation_lodged',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Request PPA variation',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        ppa_reference: { type: 'string' },
        variation_type: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        description: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ lodged_at: isoUtc(at) }),
    },
    {
      id: 'commence_screen',
      from: 'variation_lodged',
      to: 'regulatory_screening',
      by: ['ipp_developer', 'operator'],
      label: 'Commence regulatory screening',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_technical',
      from: 'regulatory_screening',
      to: 'technical_review',
      by: ['ipp_developer', 'operator'],
      label: 'Submit technical review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_commercial',
      from: 'technical_review',
      to: 'commercial_review',
      by: ['ipp_developer', 'operator'],
      label: 'Commence commercial review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'open_public_participation',
      from: 'commercial_review',
      to: 'public_participation',
      by: ['ipp_developer', 'operator'],
      label: 'Open public participation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'close_public_participation',
      from: 'public_participation',
      to: 'nersa_assessment',
      by: ['ipp_developer', 'operator'],
      label: 'Close public participation',
      intent: 'primary',
      guards: [],
    },
    {
      // Gazette publication act — crosses the regulator inbox on EVERY tier
      // per the legacy hint, so it's a required party input, not a guard.
      id: 'approve_variation',
      from: 'nersa_assessment',
      to: 'variation_approved',
      by: ['ipp_developer', 'operator'],
      label: 'Approve variation',
      intent: 'primary',
      input: { regulator_party: { type: 'party', role: 'regulator', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'amend_ppa',
      from: 'variation_approved',
      to: 'ppa_amended',
      by: ['ipp_developer', 'operator'],
      label: 'Amend PPA',
      intent: 'primary',
      input: { agreement_reference: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ amended_at: isoUtc(at) }),
    },
    {
      // major/material (>=100 MW) tiers cross the regulator inbox and open the
      // appeal window per the legacy hint — modelled off capacity_mw.
      id: 'reject_variation',
      from: 'nersa_assessment',
      to: 'rejected',
      by: ['ipp_developer', 'operator'],
      label: 'Reject variation',
      intent: 'destructive',
      requiresReason: ['grid_impact_unacceptable', 'tariff_not_cost_reflective', 'inconsistent_with_licence', 'public_objection_upheld', 'incomplete_submission'],
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      // the ONLY edge out of `rejected` — an appeal can never be filed
      // against a variation that was never rejected.
      id: 'file_appeal',
      from: 'rejected',
      to: 'appeal_filed',
      by: ['ipp_developer', 'operator'],
      label: 'File appeal',
      intent: 'secondary',
      input: { appeal_grounds: { type: 'string', required: true } },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ appeal_filed_at: isoUtc(at) }),
    },
    {
      // the ONLY edge out of `appeal_filed` — a determination can never land
      // against an appeal that was never filed.
      id: 'determine_appeal',
      from: 'appeal_filed',
      to: 'appeal_determined',
      by: ['ipp_developer', 'operator'],
      label: 'Determine appeal',
      intent: 'primary',
      input: { appeal_determination: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ appeal_determined_at: isoUtc(at) }),
    },

    // --- exit ------------------------------------------------------------
    {
      id: 'withdraw',
      from: ['variation_lodged', 'regulatory_screening', 'technical_review', 'commercial_review', 'public_participation', 'nersa_assessment'],
      to: 'withdrawn',
      by: ['ipp_developer', 'operator'],
      label: 'Withdraw variation application',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'refiling', 'superseded_by_new_ppa', 'no_longer_required'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
