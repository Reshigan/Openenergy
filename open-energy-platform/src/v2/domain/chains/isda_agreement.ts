// isda_agreement — ISDA master agreement lifecycle as data.
//
// A trader (party_a) drafts a master agreement against a counterparty
// (party_b); party_b negotiates the schedule; both sides execute; the executed
// agreement can be amended in place (self-loop) or terminated with a Section 6
// reason. Legal review is performed by the operator role (legal == operator).
//
// Structural notes:
//  - Parties attach ONLY at @new. party_a is the opener (actorBecomes). party_b
//    MUST be supplied as party_b_party in the open input, otherwise it could
//    never fire the negotiate/execute edges (an actor named after open holds no
//    live role).
//  - execute reuses executionEvidencePresent: an ISDA is not "executed" without
//    a board approval ref and a named legal counterparty ref. No invented guard.
//  - amend is a genuine executed→executed self-loop (Section 1 single-agreement:
//    an amendment revises the SAME agreement, it does not spawn a new one).
//
// settles:false — a master agreement is a netting/framework contract. No money
// moves through THIS chain; individual confirmations settle elsewhere. Export
// always carries the record-only notice (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const isdaAgreement: ChainDecl = {
  key: 'isda_agreement',
  noun: 'ISDA master agreement',
  refPrefix: 'ISDA',
  title: (f) =>
    `ISDA — ${(f.party_a_name as string) ?? 'party A'} / ${(f.counterparty_name as string) ?? 'counterparty'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ISDA 2002 Master Agreement', provision: 's1 single agreement + s6 early termination', effect: 'authorises' },
    { instrument: 'Financial Markets Act 19 of 2012', provision: 'OTC derivative provider conduct standards', effect: 'requires' },
  ],
  roles: ['party_a', 'party_b', 'operator'],

  fields: {
    party_a_name: { type: 'string', required: true, label: 'Party A (trader)' },
    counterparty_name: { type: 'string', required: true, label: 'Counterparty' },
    party_b_party: { type: 'party', role: 'party_b', label: 'Counterparty participant' },
    agreement_type: { type: 'string', label: 'Form (2002 / 1992)' },
    governing_law: { type: 'string', label: 'Governing law' },
    base_currency: { type: 'string', label: 'Base currency' },
    schedule_ref: { type: 'string', label: 'Schedule ref' },
    board_approval_ref: { type: 'string', label: 'Board approval ref' },
    legal_counterparty_ref: { type: 'string', label: 'Legal counterparty ref' },
    amendment_ref: { type: 'string', label: 'Latest amendment ref' },
    // written by derive, never by the client
    executed_at: { type: 'string', label: 'Executed at' },
    amended_at: { type: 'string', label: 'Last amended at' },
    amend_count: { type: 'number', label: 'Amendments made' },
    terminated_at: { type: 'string', label: 'Terminated at' },
  },

  initial: 'drafted',

  states: {
    drafted: { label: 'Drafted', terminal: false, holder: 'party_a', sla: { days: 30 } },
    negotiating: { label: 'In negotiation', terminal: false, holder: 'party_b', sla: { days: 60 } },
    executed: { label: 'Executed', terminal: false, holder: 'none' },
    terminated: { label: 'Terminated', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'drafted',
      by: ['party_a', 'operator'],
      actorBecomes: 'party_a',
      label: 'Draft master agreement',
      intent: 'primary',
      input: {
        party_a_name: { type: 'string', required: true },
        counterparty_name: { type: 'string', required: true },
        party_b_party: { type: 'party', role: 'party_b' },
        agreement_type: { type: 'string' },
        governing_law: { type: 'string' },
        base_currency: { type: 'string' },
        schedule_ref: { type: 'string' },
      },
      guards: ['counterpartyDistinct'],
    },

    // --- happy path -----------------------------------------------------------
    {
      id: 'submit_for_negotiation',
      from: 'drafted',
      to: 'negotiating',
      by: ['party_a', 'operator'],
      label: 'Submit for negotiation',
      intent: 'primary',
      guards: ['complianceHaltClear'],
    },
    {
      id: 'return_to_draft',
      from: 'negotiating',
      to: 'drafted',
      by: ['party_b', 'operator'],
      label: 'Return for redraft',
      intent: 'secondary',
      requiresReason: ['schedule_changes', 'cp_conditions', 'credit_terms'],
      guards: [],
    },
    {
      id: 'execute',
      from: 'negotiating',
      to: 'executed',
      by: ['party_a', 'party_b', 'operator'],
      label: 'Execute agreement',
      intent: 'primary',
      input: {
        board_approval_ref: { type: 'string', required: true },
        legal_counterparty_ref: { type: 'string', required: true },
      },
      guards: ['executionEvidencePresent', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ executed_at: isoUtc(at) }),
    },
    {
      // Section 1 single-agreement self-loop: an amendment revises the same
      // executed master agreement, it does not create a new one.
      id: 'amend',
      from: 'executed',
      to: 'executed',
      by: ['party_a', 'party_b', 'operator'],
      label: 'Amend agreement',
      intent: 'secondary',
      input: { amendment_ref: { type: 'string', required: true } },
      requiresReason: ['schedule_update', 'csa_change', 'legal_entity_change', 'regulatory_repapering'],
      guards: [],
      derive: (f, at: Instant) => ({
        amended_at: isoUtc(at),
        amend_count: (typeof f.amend_count === 'number' ? f.amend_count : 0) + 1,
      }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'terminate',
      from: 'executed',
      to: 'terminated',
      by: ['party_a', 'party_b', 'operator'],
      label: 'Terminate agreement',
      intent: 'destructive',
      requiresReason: ['event_of_default', 'termination_event', 'mutual_agreement', 'force_majeure'],
      guards: [],
      derive: (_f, at: Instant) => ({ terminated_at: isoUtc(at) }),
    },
    {
      id: 'reject',
      from: 'negotiating',
      to: 'rejected',
      by: ['party_b', 'operator'],
      label: 'Reject agreement',
      intent: 'destructive',
      requiresReason: ['terms_unacceptable', 'credit_declined', 'kyc_failed'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['drafted', 'negotiating'],
      to: 'cancelled',
      by: ['party_a', 'operator', 'system'],
      label: 'Cancel',
      intent: 'destructive',
      requiresReason: ['withdrawn', 'relationship_not_pursued', 'superseded', 'negotiation_lapsed'],
      guards: [],
    },
  ],

  // negotiation time-bar: a schedule left un-negotiated for 90 days (well past
  // the 60-day negotiating sla) stales out (ppa_contract pattern).
  timers: [{ onState: 'negotiating', after: { days: 90 }, fire: 'cancel', kind: 'time_bar', reason: 'negotiation_lapsed' }],
};
