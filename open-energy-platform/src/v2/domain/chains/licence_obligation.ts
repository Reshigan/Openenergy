// licence_obligation — NERSA licence-condition compliance lifecycle as data.
//
// An IPP's generation/trading licence carries ongoing conditions (security of
// supply, environmental, financial, technical, administrative). This chain
// tracks one condition end to end: periodic monitoring, an assessment cycle
// (evidence gathered → submitted → reviewed, with an optional query
// round-trip), a compliant/non-compliant finding, and — on a non-compliant
// finding — a notice + cure window that resolves to cured or breached.
//
// Structural honesty (no invented guards):
//  - `find_compliant` / `find_non_compliant` are reachable only from
//    `under_review` or `query_resolved` — a finding can NEVER be recorded
//    without a review having been commenced (and any query closed out). No
//    guard needed, the state graph enforces the review gate.
//  - `cured` and `breached` are reachable only from the notice/cure states —
//    an obligation can NEVER close without a non-compliant finding and a
//    notice having been issued first.
//  - `submit_evidence` is guarded by completenessEvidencePresent: NERSA
//    expects a complete evidence pack, not a partial one, before a formal
//    review clock starts — this is literally the "licence-completeness"
//    guard the registry describes.
//  - `open` is guarded by counterpartyDistinct: the IPP and the regulator
//    named on the obligation must be different legal entities (an IPP cannot
//    self-certify as its own regulator).
//
// settles:false — a compliance record; no money or quantum moves on this
// chain (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const licenceObligation: ChainDecl = {
  key: 'licence_obligation',
  noun: 'Licence obligation',
  refPrefix: 'LOBL',
  title: (f) => `Licence obligation — ${(f.obligation_ref as string) ?? 'unref'} (${(f.condition_description as string) ?? 'condition TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Electricity Regulation Act 2006', provision: 's16 licence conditions', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'licence compliance monitoring & enforcement', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator', 'operator'],

  fields: {
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP (obligation holder)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    licence_number: { type: 'string', required: true, label: 'Licence number' },
    obligation_ref: { type: 'string', required: true, label: 'Obligation ref' },
    obligation_class: { type: 'string', required: true, label: 'Obligation class (security_of_supply/environmental/financial/technical/administrative)' },
    condition_description: { type: 'string', required: true, label: 'Condition description' },
    compliance_period: { type: 'string', required: true, label: 'Compliance period' },
    evidence_ref: { type: 'string', label: 'Evidence ref' },
    completeness_ref: { type: 'string', label: 'Completeness-evidence ref' },
    query_text: { type: 'string', label: 'Query' },
    query_response: { type: 'string', label: 'Query response' },
    compliance_outcome: { type: 'string', label: 'Compliance outcome' },
    notice_ref: { type: 'string', label: 'Compliance notice ref' },
    cure_plan_ref: { type: 'string', label: 'Cure plan ref' },
    // written by derive, never by the client
    registered_at: { type: 'string', label: 'Registered at' },
    evidence_submitted_at: { type: 'string', label: 'Evidence submitted at' },
    review_commenced_at: { type: 'string', label: 'Review commenced at' },
    assessed_at: { type: 'string', label: 'Assessed at' },
    notice_issued_at: { type: 'string', label: 'Notice issued at' },
    cured_at: { type: 'string', label: 'Cured at' },
    breached_at: { type: 'string', label: 'Breached at' },
  },

  initial: 'monitoring_active',

  states: {
    monitoring_active: { label: 'Monitoring active', terminal: false, holder: 'ipp_developer', sla: { days: 90 } },
    assessment_due: { label: 'Assessment due', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    evidence_gathered: { label: 'Evidence gathered', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    evidence_submitted: { label: 'Evidence submitted', terminal: false, holder: 'regulator', sla: { days: 14 } },
    under_review: { label: 'Under review', terminal: false, holder: 'regulator', sla: { days: 21 } },
    query_raised: { label: 'Query raised', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    query_resolved: { label: 'Query resolved', terminal: false, holder: 'regulator', sla: { days: 7 } },
    assessed_compliant: { label: 'Assessed compliant', terminal: false, holder: 'none' },
    assessed_non_compliant: { label: 'Assessed non-compliant', terminal: false, holder: 'regulator', sla: { days: 14 } },
    notice_issued: { label: 'Notice issued', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    cure_active: { label: 'Cure in progress', terminal: false, holder: 'ipp_developer', sla: { days: 60 } },
    cured: { label: 'Cured', terminal: true, holder: 'none' },
    breached: { label: 'Breached', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'monitoring_active',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Register licence obligation',
      intent: 'primary',
      input: {
        ipp_party: { type: 'party', role: 'ipp_developer' },
        regulator_party: { type: 'party', role: 'regulator' },
        licence_number: { type: 'string', required: true },
        obligation_ref: { type: 'string', required: true },
        obligation_class: { type: 'string', required: true },
        condition_description: { type: 'string', required: true },
        compliance_period: { type: 'string', required: true },
      },
      // IPP cannot be its own regulator on the obligation.
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ registered_at: isoUtc(at) }),
    },

    // --- assessment cycle -------------------------------------------------
    {
      // also the timer target: an unreviewed obligation self-triggers after
      // the monitoring SLA, and a compliant finding re-opens the next cycle.
      id: 'trigger_assessment',
      from: ['monitoring_active', 'assessed_compliant'],
      to: 'assessment_due',
      by: ['ipp_developer', 'regulator', 'operator', 'system'],
      label: 'Trigger assessment',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'gather_evidence',
      from: 'assessment_due',
      to: 'evidence_gathered',
      by: ['ipp_developer', 'operator'],
      label: 'Gather evidence',
      intent: 'secondary',
      input: { evidence_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'submit_evidence',
      from: 'evidence_gathered',
      to: 'evidence_submitted',
      by: ['ipp_developer', 'operator'],
      label: 'Submit evidence',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      // NERSA reviews complete packs only — forces a named completeness ref.
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ evidence_submitted_at: isoUtc(at) }),
    },
    {
      id: 'commence_review',
      from: 'evidence_submitted',
      to: 'under_review',
      by: ['regulator', 'operator'],
      label: 'Commence review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ review_commenced_at: isoUtc(at) }),
    },
    {
      id: 'raise_query',
      from: 'under_review',
      to: 'query_raised',
      by: ['regulator'],
      label: 'Raise query',
      intent: 'secondary',
      input: { query_text: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'resolve_query',
      from: 'query_raised',
      to: 'query_resolved',
      by: ['ipp_developer'],
      label: 'Resolve query',
      intent: 'primary',
      input: { query_response: { type: 'string', required: true } },
      guards: [],
    },

    // --- finding (structural gate: only from a commenced, query-clear review) ---
    {
      id: 'find_compliant',
      from: ['under_review', 'query_resolved'],
      to: 'assessed_compliant',
      by: ['regulator'],
      label: 'Find compliant',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ assessed_at: isoUtc(at), compliance_outcome: 'compliant' }),
    },
    {
      id: 'find_non_compliant',
      from: ['under_review', 'query_resolved'],
      to: 'assessed_non_compliant',
      by: ['regulator'],
      label: 'Find non-compliant',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ assessed_at: isoUtc(at), compliance_outcome: 'non_compliant' }),
    },

    // --- notice + cure (structural gate: cured/breached only reachable from here) ---
    {
      id: 'issue_notice',
      from: 'assessed_non_compliant',
      to: 'notice_issued',
      by: ['regulator'],
      label: 'Issue compliance notice',
      intent: 'destructive',
      input: { notice_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ notice_issued_at: isoUtc(at) }),
    },
    {
      id: 'commence_cure',
      from: 'notice_issued',
      to: 'cure_active',
      by: ['ipp_developer', 'operator'],
      label: 'Commence cure',
      intent: 'primary',
      input: { cure_plan_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'confirm_cured',
      from: 'cure_active',
      to: 'cured',
      by: ['regulator', 'operator'],
      label: 'Confirm cured',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ cured_at: isoUtc(at) }),
    },
    {
      id: 'declare_breach',
      from: ['cure_active', 'notice_issued'],
      to: 'breached',
      by: ['regulator', 'operator'],
      label: 'Declare breach',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ breached_at: isoUtc(at) }),
    },
  ],

  // monitoring SLA: an obligation left unreviewed for 90 days self-triggers
  // the next assessment cycle rather than sitting silently non-compliant.
  timers: [{ onState: 'monitoring_active', after: { days: 90 }, fire: 'trigger_assessment', kind: 'sla' }],
};
