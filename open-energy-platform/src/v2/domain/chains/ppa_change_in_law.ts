// ppa_change_in_law — PPA change-in-law claim lifecycle as data.
//
// A REIPPPP-style PPA carries a "change in law" relief clause: when a statute,
// regulation, or ministerial determination changes after signature and moves an
// IPP's cost/revenue base, the affected party notifies its counterparty and the
// parties assess, agree, and implement relief (tariff adjustment / term
// extension / lump sum). If the counterparty rejects, the claimant may escalate
// to the regulator, who directs an outcome.
//
// Roles: claimant (the affected party, an IPP), counterparty (an offtaker),
// regulator. The claimant opens; the counterparty runs the assessment; the
// regulator only acts on an escalated dispute.
//
// Structural regulator gate: the disputed state is only reachable via
// escalate_dispute, and the only edges OUT of disputed (resolve_direct / dismiss)
// are `by:['regulator']`. Since parties attach ONLY at @new, a regulator can act
// on a dispute solely if a regulator_party was supplied at open — the state graph
// plus the by:[] list, not a guard, put the regulator in the loop. A large
// (strategic, >=100 MW) claim additionally cannot be AGREED bilaterally without a
// regulator party: regulatorPresentIfStrategic gates `agree`.
//
// settles:false — a change-in-law claim RECORDS the agreed relief and the
// implementation reference; the actual tariff/settlement adjustment is booked on
// the PPA settlement chain. No money moves through this chain, so every export
// carries the record-only custody notice (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ppaChangeInLaw: ChainDecl = {
  key: 'ppa_change_in_law',
  noun: 'PPA change-in-law claim',
  refPrefix: 'PCIL',
  title: (f) => `Change-in-law — ${(f.law_reference as string) ?? 'unspecified'} (${(f.ppa_ref as string) ?? 'PPA'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's34 ministerial determination', effect: 'authorises' },
    { instrument: 'REIPPPP PPA', provision: 'Change in Law relief clause', effect: 'requires' },
    { instrument: 'Carbon Tax Act 2019', provision: 's5 rate change (relief trigger)', effect: 'restricts' },
  ],
  roles: ['claimant', 'counterparty', 'regulator', 'operator'],

  fields: {
    ppa_ref: { type: 'string', required: true, label: 'PPA reference' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Counterparty (offtaker)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    law_reference: { type: 'string', required: true, label: 'Law / regulation changed' },
    change_description: { type: 'string', required: true, label: 'Change description' },
    capacity_mw: { type: 'number', min: 0, label: 'PPA capacity (MW)' },
    cost_impact_zar: { type: 'number', label: 'Estimated cost impact (ZAR)' },
    relief_sought: { type: 'string', label: 'Relief sought (tariff/term/lump_sum)' },
    effective_date: { type: 'string', label: 'Change effective date' },
    agreed_relief_ref: { type: 'string', label: 'Agreed relief memo ref' },
    implementation_ref: { type: 'string', label: 'Implementation instruction ref' },
    // written by derive, never by the client
    notified_at: { type: 'string', label: 'Notified at' },
    agreed_at: { type: 'string', label: 'Agreed at' },
    implemented_at: { type: 'string', label: 'Implemented at' },
  },

  initial: 'notified',

  states: {
    notified: { label: 'Notified', terminal: false, holder: 'counterparty', sla: { days: 30 } },
    assessing: { label: 'Assessing', terminal: false, holder: 'counterparty', sla: { days: 60 } },
    agreed: { label: 'Agreed', terminal: false, holder: 'counterparty', sla: { days: 90 } },
    rejected: { label: 'Rejected', terminal: false, holder: 'claimant', sla: { days: 30 } },
    disputed: { label: 'In dispute', terminal: false, holder: 'regulator', sla: { days: 90 } },
    implemented: { label: 'Implemented', terminal: true, holder: 'none' },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    // --- creation -----------------------------------------------------------
    {
      id: 'open',
      from: '@new',
      to: 'notified',
      by: ['claimant', 'operator'],
      actorBecomes: 'claimant',
      label: 'Notify change in law',
      intent: 'primary',
      input: {
        ppa_ref: { type: 'string', required: true },
        law_reference: { type: 'string', required: true },
        change_description: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        cost_impact_zar: { type: 'number' },
        relief_sought: { type: 'string' },
        effective_date: { type: 'string' },
        counterparty_party: { type: 'party', role: 'counterparty' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ notified_at: isoUtc(at) }),
    },

    // --- assessment ---------------------------------------------------------
    {
      id: 'begin_assessment',
      from: 'notified',
      to: 'assessing',
      by: ['counterparty', 'operator'],
      label: 'Begin assessment',
      intent: 'primary',
      guards: [],
    },
    {
      // strategic (>=100 MW) claims cannot be agreed bilaterally: a regulator
      // party must be on the txn. regulatorPresentIfStrategic reads capacity_mw
      // off the carried fields.
      id: 'agree',
      from: 'assessing',
      to: 'agreed',
      by: ['counterparty', 'operator'],
      label: 'Agree relief',
      intent: 'primary',
      input: { agreed_relief_ref: { type: 'string', required: true } },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ agreed_at: isoUtc(at) }),
    },
    {
      id: 'reject',
      from: 'assessing',
      to: 'rejected',
      by: ['counterparty', 'operator'],
      label: 'Reject claim',
      intent: 'destructive',
      requiresReason: ['not_a_change_in_law', 'pre_dates_signature', 'no_material_impact', 'excluded_risk'],
      guards: [],
    },

    // --- implementation -----------------------------------------------------
    {
      id: 'implement',
      from: 'agreed',
      to: 'implemented',
      by: ['counterparty', 'operator'],
      label: 'Implement relief',
      intent: 'primary',
      input: { implementation_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ implemented_at: isoUtc(at) }),
    },

    // --- dispute loop (structural regulator gate) ---------------------------
    {
      id: 'escalate_dispute',
      from: 'rejected',
      to: 'disputed',
      by: ['claimant', 'operator'],
      label: 'Escalate to regulator',
      intent: 'secondary',
      requiresReason: ['dispute_quantum', 'dispute_eligibility', 'dispute_delay'],
      guards: [],
    },
    {
      id: 'resolve_direct',
      from: 'disputed',
      to: 'agreed',
      by: ['regulator'],
      label: 'Direct relief',
      intent: 'primary',
      input: { agreed_relief_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ agreed_at: isoUtc(at) }),
    },
    {
      id: 'dismiss',
      from: 'disputed',
      to: 'dismissed',
      by: ['regulator'],
      label: 'Dismiss dispute',
      intent: 'destructive',
      requiresReason: ['upheld_rejection', 'out_of_scope', 'time_barred'],
      guards: [],
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'withdraw',
      from: ['notified', 'assessing', 'agreed', 'rejected'],
      to: 'withdrawn',
      by: ['claimant', 'operator'],
      label: 'Withdraw claim',
      intent: 'destructive',
      requiresReason: ['resolved_commercially', 'claim_error', 'no_longer_pursued'],
      guards: [],
    },
    {
      // a rejected claim not escalated within the time-bar lapses. record-only
      // stub; the sweep computes the real bar off the state sla (ppa_contract
      // pattern).
      id: 'lapse',
      from: 'rejected',
      to: 'lapsed',
      by: ['system'],
      label: 'Lapse (escalation window closed)',
      intent: 'secondary',
      guards: [],
    },
  ],

  timers: [
    { onState: 'rejected', after: { days: 0 }, fire: 'lapse', kind: 'time_bar' },
    { onState: 'notified', after: { days: 0 }, fire: 'begin_assessment', kind: 'sla' },
  ],
};
