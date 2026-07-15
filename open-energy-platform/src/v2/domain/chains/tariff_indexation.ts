// tariff_indexation — annual PPA tariff escalation/repricing cycle, as data.
//
// Once a year the seller (IPP) publishes the reference index, calculates the
// CPI-linked escalation, and issues a formal notice; the offtaker reviews and
// either agrees (seller then applies the new rate to billing) or disputes the
// calculation, opening a recalculate → reissue-notice loop that can itself be
// referred to NERSA / arbitration if it stays unresolved.
//
// Structural honesty (no invented guards):
//  - `applied` is reachable ONLY from `tariff_agreed`, and `tariff_agreed` is
//    reachable ONLY from `under_review` via agree-tariff — so a tariff can
//    NEVER be applied to billing without an explicit offtaker agreement, no
//    guard required.
//  - `open` is guarded by counterpartyDistinct: seller and offtaker must be
//    different legal entities (no self-dealing on a bilateral PPA), and by
//    complianceHaltClear (opening a new annual repricing commitment is
//    blocked under a platform-wide compliance halt).
//  - `apply-tariff` (the edge that actually moves the billed rate) is also
//    guarded by complianceHaltClear — same reasoning as ccp_assessment's
//    `approve`: the halt blocks the commitment, never the de-risking exits
//    (dispute / arbitration / withdraw stay open).
//
// settles:false — this chain fixes the tariff figure that later billing runs
// off; it does not itself move money (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const tariffIndexation: ChainDecl = {
  key: 'tariff_indexation',
  noun: 'Tariff indexation cycle',
  refPrefix: 'TIDX',
  title: (f) => `Tariff indexation — ${(f.project_name as string) ?? 'unnamed project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'PPA (REIPPPP-form) Schedule', provision: 'Annual CPI-linked tariff escalation clause', effect: 'authorises' },
    { instrument: 'Electricity Regulation Act 2006', provision: 's4 — NERSA referral of unresolved tariff disputes', effect: 'requires' },
  ],
  roles: ['seller', 'offtaker', 'operator'],

  fields: {
    project_name: { type: 'string', required: true, label: 'Project' },
    seller_party: { type: 'party', role: 'seller', label: 'Seller (IPP)' },
    offtaker_party: { type: 'party', role: 'offtaker', label: 'Offtaker' },
    annual_contract_value_zar: { type: 'number', min: 0, label: 'Annual contract value (ZAR)' },
    index_ref: { type: 'string', label: 'Index ref' },
    index_value: { type: 'number', label: 'Index value' },
    index_type: { type: 'string', label: 'Index type' },
    index_reference_period: { type: 'string', label: 'Reference period' },
    escalation_factor: { type: 'number', label: 'Escalation factor' },
    proposed_tariff_zar_mwh: { type: 'number', min: 0, label: 'Proposed tariff (ZAR/MWh)' },
    calculation_basis: { type: 'string', label: 'Calculation basis' },
    notice_ref: { type: 'string', label: 'Notice ref' },
    notice_basis: { type: 'string', label: 'Notice basis' },
    review_basis: { type: 'string', label: 'Review basis' },
    agreed_tariff_zar_mwh: { type: 'number', min: 0, label: 'Agreed tariff (ZAR/MWh)' },
    dispute_basis: { type: 'string', label: 'Dispute basis' },
    dispute_ref: { type: 'string', label: 'Dispute ref' },
    disputed_amount_zar: { type: 'number', min: 0, label: 'Disputed amount (ZAR)' },
    recalc_ref: { type: 'string', label: 'Recalc ref' },
    recalc_basis: { type: 'string', label: 'Recalc basis' },
    arbitration_ref: { type: 'string', label: 'Arbitration ref' },
    arbitration_basis: { type: 'string', label: 'Arbitration basis' },
    rod_notes: { type: 'string', label: 'Record-of-decision notes' },
    // written by derive, never by the client
    index_published_at: { type: 'string', label: 'Index published at' },
    notice_issued_at: { type: 'string', label: 'Notice issued at' },
    tariff_agreed_at: { type: 'string', label: 'Tariff agreed at' },
    applied_at: { type: 'string', label: 'Tariff applied at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    recalculated_at: { type: 'string', label: 'Recalculated at' },
    arbitrated_at: { type: 'string', label: 'Referred to arbitration at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'indexation_due',

  states: {
    indexation_due: { label: 'Indexation due', terminal: false, holder: 'seller', sla: { days: 30 } },
    index_published: { label: 'Index published', terminal: false, holder: 'seller', sla: { days: 14 } },
    escalation_calculated: { label: 'Escalation calculated', terminal: false, holder: 'seller', sla: { days: 7 } },
    notice_issued: { label: 'Notice issued', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    under_review: { label: 'Under review', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    tariff_agreed: { label: 'Tariff agreed', terminal: false, holder: 'seller', sla: { days: 14 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'seller', sla: { days: 30 } },
    recalculated: { label: 'Recalculated', terminal: false, holder: 'seller', sla: { days: 14 } },
    applied: { label: 'Applied', terminal: true, holder: 'none' },
    arbitrated: { label: 'Arbitrated', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'indexation_due',
      by: ['seller', 'operator'],
      actorBecomes: 'seller',
      label: 'Open indexation cycle',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        seller_party: { type: 'party', role: 'seller' },
        offtaker_party: { type: 'party', role: 'offtaker' },
        annual_contract_value_zar: { type: 'number', min: 0 },
      },
      // seller ≠ offtaker (no self-dealing) + no new repricing commitments under a halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
    },
    {
      id: 'publish-index',
      from: 'indexation_due',
      to: 'index_published',
      by: ['seller', 'operator'],
      label: 'Publish index',
      intent: 'primary',
      input: {
        index_ref: { type: 'string' },
        index_value: { type: 'number' },
        index_type: { type: 'string' },
        index_reference_period: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ index_published_at: isoUtc(at) }),
    },
    {
      id: 'calculate-escalation',
      from: 'index_published',
      to: 'escalation_calculated',
      by: ['seller', 'operator'],
      label: 'Calculate escalation',
      intent: 'primary',
      input: {
        escalation_factor: { type: 'number' },
        proposed_tariff_zar_mwh: { type: 'number', min: 0 },
        calculation_basis: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'issue-notice',
      from: 'escalation_calculated',
      to: 'notice_issued',
      by: ['seller', 'operator'],
      label: 'Issue notice',
      intent: 'primary',
      input: {
        notice_ref: { type: 'string' },
        notice_basis: { type: 'string' },
        annual_contract_value_zar: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ notice_issued_at: isoUtc(at) }),
    },
    {
      id: 'begin-review',
      from: 'notice_issued',
      to: 'under_review',
      by: ['offtaker', 'operator'],
      label: 'Begin review',
      intent: 'primary',
      input: { review_basis: { type: 'string' } },
      guards: [],
    },
    {
      id: 'agree-tariff',
      from: 'under_review',
      to: 'tariff_agreed',
      by: ['offtaker', 'operator'],
      label: 'Agree tariff',
      intent: 'primary',
      input: {
        agreed_tariff_zar_mwh: { type: 'number', min: 0 },
        review_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ tariff_agreed_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into raise-dispute's target — offtaker contests the
      // escalation calculation rather than agreeing it.
      id: 'raise-dispute',
      from: 'under_review',
      to: 'disputed',
      by: ['offtaker', 'operator'],
      label: 'Raise dispute',
      intent: 'destructive',
      input: {
        dispute_basis: { type: 'string' },
        dispute_ref: { type: 'string' },
        disputed_amount_zar: { type: 'number', min: 0 },
      },
      requiresReason: ['index_miscalculation', 'wrong_reference_period', 'escalation_factor_error', 'unauthorized_component_change', 'other'],
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      id: 'recalculate',
      from: 'disputed',
      to: 'recalculated',
      by: ['seller', 'operator'],
      label: 'Recalculate',
      intent: 'primary',
      input: {
        recalc_ref: { type: 'string' },
        recalc_basis: { type: 'string' },
        escalation_factor: { type: 'number' },
        proposed_tariff_zar_mwh: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ recalculated_at: isoUtc(at) }),
    },
    {
      // loops back into the review window with the corrected basis — same
      // target state as the original issue-notice.
      id: 'reissue-notice',
      from: 'recalculated',
      to: 'notice_issued',
      by: ['seller', 'operator'],
      label: 'Reissue notice',
      intent: 'primary',
      input: {
        notice_ref: { type: 'string' },
        notice_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ notice_issued_at: isoUtc(at) }),
    },
    {
      // structural completion gate: the ONLY edge into `applied`, and it can
      // only fire from tariff_agreed — so billing can never re-price without
      // an explicit offtaker agreement first.
      id: 'apply-tariff',
      from: 'tariff_agreed',
      to: 'applied',
      by: ['seller', 'operator'],
      label: 'Apply tariff',
      intent: 'primary',
      input: {
        agreed_tariff_zar_mwh: { type: 'number', min: 0 },
        rod_notes: { type: 'string' },
      },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ applied_at: isoUtc(at) }),
    },
    {
      id: 'refer-arbitration',
      from: 'disputed',
      to: 'arbitrated',
      by: ['offtaker', 'operator'],
      label: 'Refer to arbitration',
      intent: 'destructive',
      input: {
        arbitration_ref: { type: 'string' },
        arbitration_basis: { type: 'string' },
        rod_notes: { type: 'string' },
      },
      requiresReason: ['unresolved_dispute', 'recalculation_rejected', 'nersa_referral_required'],
      guards: [],
      derive: (_f, at: Instant) => ({ arbitrated_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['indexation_due', 'index_published', 'escalation_calculated', 'notice_issued', 'under_review', 'tariff_agreed', 'disputed', 'recalculated'],
      to: 'withdrawn',
      by: ['seller', 'operator'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['cycle_superseded', 'contract_terminated', 'administrative_error', 'mutual_agreement'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
