// ipp_ccc — IPP Connection Cost Contribution (CCC) negotiation as data.
//
// The network operator (Eskom Transmission / municipal utility) prices the
// grid-strengthening work a new IPP connection requires; the IPP and the
// operator negotiate a cost split. A heads-of-terms provisional agreement
// precedes final sign-off — agree_ccc is reachable ONLY from
// provisional_agreement, so the CCC can NEVER be finalised without first
// clearing a provisional round (structural, no guard needed). A disagreement
// forks into a formal dispute; from there it either resolves back to
// agreement/rejection or escalates to NERSA for a regulatory determination —
// ccc_rejected and regulatory_determination are therefore reachable ONLY out
// of dispute_filed, never directly off a live negotiation.
//
// Strategic crossing: a ≥100 MW project's final CCC sign-off needs the
// regulator on the txn (regulatorPresentIfStrategic reads capacity_mw) —
// mirrors the legacy "major/material tiers cross into the regulator inbox"
// cascade hint.
//
// settles:false — this chain records the negotiated CONNECTION COST AMOUNT,
// it does not move money. The connection charge itself is billed and settled
// on the connection agreement/energisation chain it authorises (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippCcc: ChainDecl = {
  key: 'ipp_ccc',
  noun: 'IPP connection cost contribution negotiation',
  refPrefix: 'CCC',
  title: (f) =>
    `CCC — ${(f.project_id as string) ?? 'project'} / ${(f.network_operator as string) ?? 'network operator'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Electricity Regulation Act 4 of 2006', provision: 's21 connection charges', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'grid connection cost allocation', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'network_operator', 'regulator', 'operator'],

  fields: {
    ccc_ref: { type: 'string', label: 'CCC ref' },
    project_id: { type: 'string', required: true, label: 'Project' },
    ccc_category: { type: 'string', label: 'CCC category' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    network_operator: { type: 'string', required: true, label: 'Network operator' },
    network_operator_party: { type: 'party', role: 'network_operator', label: 'Network operator participant' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    grid_connection_ref: { type: 'string', label: 'Grid connection agreement ref' },
    capacity_mw: { type: 'number', min: 0, label: 'Project capacity (MW)' },
    ccc_amount_zar: { type: 'number', required: true, min: 0, label: 'CCC amount (ZAR)' },
    provisional_terms_ref: { type: 'string', label: 'Provisional heads-of-terms ref' },
    dispute_reason: { type: 'string', label: 'Dispute basis' },
    nersa_referral_ref: { type: 'string', label: 'NERSA referral ref' },
    // written by derive, never by the client
    provisional_agreement_at: { type: 'string', label: 'Provisional agreement reached at' },
    agreed_at: { type: 'string', label: 'CCC agreed at' },
    dispute_filed_at: { type: 'string', label: 'Dispute filed at' },
    rejected_at: { type: 'string', label: 'CCC rejected at' },
    regulatory_referral_at: { type: 'string', label: 'Referred to NERSA at' },
  },

  initial: 'ccc_initiated',

  states: {
    ccc_initiated: { label: 'CCC initiated', terminal: false, holder: 'network_operator', sla: { days: 30 } },
    provisional_agreement: { label: 'Provisional agreement', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    dispute_filed: { label: 'Dispute filed', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    ccc_agreed: { label: 'CCC agreed', terminal: true, holder: 'none' },
    ccc_rejected: { label: 'CCC rejected', terminal: true, holder: 'none' },
    regulatory_determination: { label: 'Regulatory determination (NERSA)', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'ccc_initiated',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Initiate CCC negotiation',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        ccc_category: { type: 'string' },
        network_operator: { type: 'string', required: true },
        network_operator_party: { type: 'party', role: 'network_operator' },
        grid_connection_ref: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        ccc_amount_zar: { type: 'number', required: true, min: 0 },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // no self-dealing: the IPP cannot be its own network operator.
      guards: ['counterpartyDistinct'],
    },

    // --- happy path -------------------------------------------------------
    {
      id: 'reach_provisional_agreement',
      from: 'ccc_initiated',
      to: 'provisional_agreement',
      by: ['ipp_developer', 'network_operator', 'operator'],
      label: 'Reach provisional agreement',
      intent: 'secondary',
      input: { provisional_terms_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ provisional_agreement_at: isoUtc(at) }),
    },
    {
      // structural sign-off gate: the ONLY edge into ccc_agreed, reachable ONLY
      // from provisional_agreement. A ≥100 MW project needs the regulator on
      // the txn to finalise (regulatorPresentIfStrategic reads capacity_mw).
      id: 'agree_ccc',
      from: 'provisional_agreement',
      to: 'ccc_agreed',
      by: ['ipp_developer', 'network_operator', 'operator'],
      label: 'Agree CCC',
      intent: 'primary',
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ agreed_at: isoUtc(at) }),
    },

    // --- dispute fork -------------------------------------------------------
    {
      id: 'file_dispute',
      from: ['ccc_initiated', 'provisional_agreement'],
      to: 'dispute_filed',
      by: ['ipp_developer', 'network_operator', 'operator'],
      label: 'File dispute',
      intent: 'secondary',
      input: { dispute_reason: { type: 'string', required: true } },
      requiresReason: ['cost_excessive', 'methodology_disputed', 'scope_disputed', 'alternative_solution_proposed', 'timeline_dispute'],
      guards: [],
      derive: (_f, at: Instant) => ({ dispute_filed_at: isoUtc(at) }),
    },
    {
      id: 'refer_to_nersa',
      from: 'dispute_filed',
      to: 'regulatory_determination',
      by: ['ipp_developer', 'network_operator', 'operator'],
      label: 'Refer to NERSA',
      intent: 'primary',
      input: { nersa_referral_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ regulatory_referral_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      // a dispute that resolves against the IPP without a NERSA referral —
      // reachable ONLY from dispute_filed, never directly off a live negotiation.
      id: 'reject_ccc',
      from: 'dispute_filed',
      to: 'ccc_rejected',
      by: ['ipp_developer', 'network_operator', 'operator'],
      label: 'Reject CCC',
      intent: 'destructive',
      requiresReason: ['cost_unjustified', 'alternative_connection_point', 'budget_exceeded', 'ipp_withdrew'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
  ],
};
