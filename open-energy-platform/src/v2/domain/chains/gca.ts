// gca — grid connection agreement lifecycle as data.
//
// A generator/load applicant applies to the network operator to connect at a
// point of connection; the operator reviews, runs a connection (cost) study,
// issues an offer, the applicant accepts, the agreement is executed, and the
// connection is finally energized.
//
// The commitment spine is structural, not guarded: `execute` leaves ONLY
// offer_accepted, and the only path into offer_accepted is `accept_offer`. So
// an agreement can NEVER be executed before the applicant has accepted the
// operator's offer — the state graph enforces it. Likewise `energize` leaves
// ONLY agreement_executed, so nothing energizes on an unexecuted agreement.
//
// Two genuine business gates ride edges:
//  - strategic connections (≥100 MW) cannot pass the connection study without a
//    regulator on the txn  → regulatorPresentIfStrategic (reads capacity_mw).
//  - execution needs a board approval + named legal counterparty ref
//    → executionEvidencePresent.
//
// settles:false — a connection agreement is a network commitment, not a
// payment; energy/use-of-system charges settle on their own chains (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure connection-tier bucketing off capacity (MW). No clock, no env.
const connectionTier = (mw: Json | undefined): string => {
  if (typeof mw !== 'number') return 'unsized';
  if (mw >= 100) return 'strategic';
  if (mw >= 10) return 'large';
  return 'embedded';
};

export const gca: ChainDecl = {
  key: 'gca',
  noun: 'Grid connection agreement',
  refPrefix: 'GCA',
  title: (f) =>
    `${(f.connection_type as string) ?? 'connection'} @ ${(f.connection_point as string) ?? 'unnamed POC'} — ${(f.capacity_mw as number) ?? '?'} MW`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's8 network connection & use-of-system', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'Network Code — connection conditions', effect: 'requires' },
  ],
  roles: ['applicant', 'operator', 'regulator'],

  fields: {
    agreement_number: { type: 'string', label: 'Agreement number' },
    applicant_party: { type: 'party', role: 'applicant', label: 'Applicant' },
    operator_party: { type: 'party', role: 'operator', label: 'Network operator' },
    connection_point: { type: 'string', required: true, label: 'Point of connection' },
    connection_type: { type: 'string', required: true, label: 'Type (generation/load/storage)' },
    voltage_kv: { type: 'number', min: 0, label: 'Voltage (kV)' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    connection_tier: { type: 'string', label: 'Connection tier' },
    study_ref: { type: 'string', label: 'Connection study ref' },
    estimated_cost_zar: { type: 'number', min: 0, label: 'Estimated connection cost (ZAR)' },
    offer_terms_ref: { type: 'string', label: 'Offer terms ref' },
    offer_validity_days: { type: 'number', min: 0, label: 'Offer validity (days)' },
    board_approval_ref: { type: 'string', label: 'Board approval ref' },
    legal_counterparty_ref: { type: 'string', label: 'Legal counterparty ref' },
    // written by derive, never by the client
    studied_at: { type: 'string', label: 'Study completed at' },
    offered_at: { type: 'string', label: 'Offer issued at' },
    accepted_at: { type: 'string', label: 'Offer accepted at' },
    executed_at: { type: 'string', label: 'Agreement executed at' },
    energized_at: { type: 'string', label: 'Energized at' },
  },

  initial: 'application_submitted',

  states: {
    application_submitted: { label: 'Application submitted', terminal: false, holder: 'operator', sla: { days: 5 } },
    under_review: { label: 'Under review', terminal: false, holder: 'operator', sla: { days: 20 } },
    study_complete: { label: 'Connection study complete', terminal: false, holder: 'operator', sla: { days: 10 } },
    offer_issued: { label: 'Offer issued', terminal: false, holder: 'applicant', sla: { days: 30 } },
    offer_accepted: { label: 'Offer accepted', terminal: false, holder: 'operator', sla: { days: 15 } },
    agreement_executed: { label: 'Agreement executed', terminal: false, holder: 'operator' },
    connected: { label: 'Connected & energized', terminal: true, holder: 'none' },
    application_rejected: { label: 'Application rejected', terminal: true, holder: 'none' },
    offer_declined: { label: 'Offer declined', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'application_submitted',
      by: ['applicant', 'operator'],
      actorBecomes: 'applicant',
      label: 'Submit connection application',
      intent: 'primary',
      input: {
        connection_point: { type: 'string', required: true },
        connection_type: { type: 'string', required: true },
        voltage_kv: { type: 'number', min: 0 },
        capacity_mw: { type: 'number', min: 0 },
        operator_party: { type: 'party', role: 'operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ connection_tier: connectionTier(f.capacity_mw) }),
    },
    {
      id: 'begin_review',
      from: 'application_submitted',
      to: 'under_review',
      by: ['operator'],
      label: 'Begin review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'complete_study',
      from: 'under_review',
      to: 'study_complete',
      by: ['operator'],
      label: 'Complete connection study',
      intent: 'primary',
      input: {
        study_ref: { type: 'string', required: true },
        estimated_cost_zar: { type: 'number', min: 0 },
      },
      // strategic (≥100 MW) connections need a regulator on the txn to proceed.
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ studied_at: isoUtc(at) }),
    },
    {
      id: 'issue_offer',
      from: 'study_complete',
      to: 'offer_issued',
      by: ['operator'],
      label: 'Issue connection offer',
      intent: 'primary',
      input: {
        offer_terms_ref: { type: 'string', required: true },
        offer_validity_days: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ offered_at: isoUtc(at) }),
    },
    {
      id: 'accept_offer',
      from: 'offer_issued',
      to: 'offer_accepted',
      by: ['applicant'],
      label: 'Accept offer',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      // structural commitment gate: the ONLY edge into agreement_executed, and it
      // can only fire from offer_accepted — which only accept_offer reaches. An
      // agreement therefore cannot execute before the applicant accepts. No guard
      // for that; executionEvidencePresent adds the board/legal ref requirement.
      id: 'execute',
      from: 'offer_accepted',
      to: 'agreement_executed',
      by: ['operator'],
      label: 'Execute agreement',
      intent: 'primary',
      input: {
        board_approval_ref: { type: 'string', required: true },
        legal_counterparty_ref: { type: 'string', required: true },
      },
      guards: ['executionEvidencePresent'],
      derive: (_f, at: Instant) => ({ executed_at: isoUtc(at) }),
    },
    {
      id: 'energize',
      from: 'agreement_executed',
      to: 'connected',
      by: ['operator'],
      label: 'Energize connection',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ energized_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_application',
      from: ['application_submitted', 'under_review', 'study_complete'],
      to: 'application_rejected',
      by: ['operator'],
      label: 'Reject application',
      intent: 'destructive',
      requiresReason: ['no_network_capacity', 'incomplete_application', 'grid_code_noncompliant', 'reinforcement_infeasible'],
      guards: [],
    },
    {
      id: 'decline_offer',
      from: 'offer_issued',
      to: 'offer_declined',
      by: ['applicant', 'operator'],
      label: 'Decline / lapse offer',
      intent: 'destructive',
      requiresReason: ['terms_unacceptable', 'cost_prohibitive', 'offer_expired', 'project_cancelled'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['application_submitted', 'under_review', 'study_complete', 'offer_issued', 'offer_accepted'],
      to: 'withdrawn',
      by: ['applicant'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'rescheduled', 'alternative_poc'],
      guards: [],
    },
  ],

  // offer-validity time-bar: an issued offer left unaccepted lapses (offers carry
  // a fixed validity window). record-only stub; the sweep computes the real bar
  // off offer_validity_days / state sla (ppa_contract / permit_to_work pattern).
  timers: [{ onState: 'offer_issued', after: { days: 0 }, fire: 'decline_offer', kind: 'time_bar' }],
};
