// unserved_energy_claim — NRS 048-2 quality-of-supply compensation lifecycle.
//
// An offtaker lodges a claim against a grid operator for energy not supplied
// (load shedding beyond schedule, outage, etc). The grid operator alone
// verifies the meter data, assesses which party bears liability, and
// determines a quantum — the offtaker only re-enters once the grid operator
// has filed its response (submit_grid_response), matching the v1 action
// roles exactly (verify/assess/determine are grid_operator-only; everything
// from submit_grid_response onward is bilateral).
//
// Structural honesty (no invented guards):
//  - open is guarded by counterpartyDistinct (offtaker and grid_operator must
//    be different legal entities — no self-claiming) and complianceHaltClear
//    (no new claims admitted under a platform-wide compliance halt).
//  - accept_settlement and make_award both CREATE a new payment obligation
//    (the platform commits to paying out compensation), so both are guarded
//    by complianceHaltClear, mirroring the "admits new commitment" rule from
//    ccp_assessment. dispute_claim and withdraw are exits — never blocked.
//  - adjudication has no named "adjudicator" role in the v1 descriptor (its
//    action.roles are admin/offtaker/grid_operator only), so `operator`
//    stands in as the neutral holder rather than inventing a regulator role
//    the source data never granted permissions to.
//
// settles:true — claimed_amount_zar / settlement_amount_zar are real quantum
// figures and accept_settlement / make_award are the actual settlement
// decision, not a record of intent to settle elsewhere (unlike disposition).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const unservedEnergyClaim: ChainDecl = {
  key: 'unserved_energy_claim',
  noun: 'Unserved-energy claim',
  refPrefix: 'UEC',
  title: (f) =>
    `Unserved-energy claim — ${(f.customer_category as string) ?? 'customer'} (${(f.unserved_mwh as number) ?? '?'} MWh)`,
  visibility: 'party',
  settles: true,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'NRS 048-2 quality-of-supply — unserved energy compensation', effect: 'requires' },
  ],
  roles: ['offtaker', 'grid_operator', 'operator'],

  fields: {
    grid_operator_party: { type: 'party', role: 'grid_operator', required: true, label: 'Grid operator' },
    event_date: { type: 'string', required: true, label: 'Event date' },
    customer_category: { type: 'string', required: true, label: 'Customer category' },
    unserved_mwh: { type: 'number', required: true, min: 0, label: 'Unserved energy (MWh)' },
    claimed_amount_zar: { type: 'number', required: true, min: 0, label: 'Claimed amount (ZAR)' },
    load_shedding_stage: { type: 'number', label: 'Load-shedding stage' },
    nrs048_reference: { type: 'string', label: 'NRS 048 reference' },
    metering_verification_notes: { type: 'string', label: 'Verification notes' },
    liability_basis: { type: 'string', required: true, label: 'Liability assessment basis' },
    settlement_amount_zar: { type: 'number', min: 0, label: 'Settlement / award amount (ZAR)' },
    quantum_rationale: { type: 'string', label: 'Quantum calculation rationale' },
    grid_response_notes: { type: 'string', label: 'Grid response notes' },
    negotiation_basis: { type: 'string', label: 'Negotiation basis' },
    settlement_offer_notes: { type: 'string', label: 'Settlement offer notes' },
    adjudication_reason: { type: 'string', required: true, label: 'Adjudication initiation reason' },
    // written by derive, never by the client
    lodged_at: { type: 'string', label: 'Lodged at' },
    verified_at: { type: 'string', label: 'Metering verified at' },
    quantum_determined_at: { type: 'string', label: 'Quantum determined at' },
    settled_at: { type: 'string', label: 'Settled at' },
    awarded_at: { type: 'string', label: 'Award made at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'lodged',

  states: {
    lodged: { label: 'Lodged', terminal: false, holder: 'grid_operator', sla: { days: 5 } },
    metering_verified: { label: 'Metering verified', terminal: false, holder: 'grid_operator', sla: { days: 10 } },
    liability_assessed: { label: 'Liability assessed', terminal: false, holder: 'grid_operator', sla: { days: 10 } },
    quantum_determined: { label: 'Quantum determined', terminal: false, holder: 'grid_operator', sla: { days: 5 } },
    grid_response_filed: { label: 'Grid response filed', terminal: false, holder: 'offtaker', sla: { days: 15 } },
    negotiating: { label: 'Negotiating', terminal: false, holder: 'grid_operator', sla: { days: 15 } },
    settlement_offered: { label: 'Settlement offered', terminal: false, holder: 'offtaker', sla: { days: 10 } },
    adjudication: { label: 'In adjudication', terminal: false, holder: 'operator', sla: { days: 30 } },
    claim_settled: { label: 'Claim settled', terminal: true, holder: 'none' },
    award_made: { label: 'Award made', terminal: true, holder: 'none' },
    claim_withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'lodged',
      by: ['offtaker', 'operator'],
      actorBecomes: 'offtaker',
      label: 'Lodge unserved-energy claim',
      intent: 'primary',
      input: {
        grid_operator_party: { type: 'party', role: 'grid_operator', required: true },
        event_date: { type: 'string', required: true },
        customer_category: { type: 'string', required: true },
        unserved_mwh: { type: 'number', required: true, min: 0 },
        claimed_amount_zar: { type: 'number', required: true, min: 0 },
        load_shedding_stage: { type: 'number' },
        nrs048_reference: { type: 'string' },
      },
      // offtaker ≠ grid operator (no self-claiming) + no new claims under a compliance halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ lodged_at: isoUtc(at) }),
    },
    {
      id: 'verify_metering_data',
      from: 'lodged',
      to: 'metering_verified',
      by: ['grid_operator', 'operator'],
      label: 'Verify metering data',
      intent: 'primary',
      input: { metering_verification_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      id: 'assess_liability',
      from: 'metering_verified',
      to: 'liability_assessed',
      by: ['grid_operator', 'operator'],
      label: 'Assess liability',
      intent: 'primary',
      input: { liability_basis: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'determine_quantum',
      from: 'liability_assessed',
      to: 'quantum_determined',
      by: ['grid_operator', 'operator'],
      label: 'Determine quantum',
      intent: 'primary',
      input: {
        settlement_amount_zar: { type: 'number', min: 0 },
        quantum_rationale: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ quantum_determined_at: isoUtc(at) }),
    },
    {
      id: 'submit_grid_response',
      from: 'quantum_determined',
      to: 'grid_response_filed',
      by: ['offtaker', 'grid_operator', 'operator'],
      label: 'Submit grid response',
      intent: 'primary',
      input: { grid_response_notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'enter_negotiation',
      from: 'grid_response_filed',
      to: 'negotiating',
      by: ['offtaker', 'grid_operator', 'operator'],
      label: 'Enter negotiation',
      intent: 'primary',
      input: { negotiation_basis: { type: 'string' } },
      guards: [],
    },
    {
      id: 'make_settlement_offer',
      from: 'negotiating',
      to: 'settlement_offered',
      by: ['offtaker', 'grid_operator', 'operator'],
      label: 'Make settlement offer',
      intent: 'primary',
      input: {
        settlement_amount_zar: { type: 'number', min: 0 },
        settlement_offer_notes: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'accept_settlement',
      from: 'settlement_offered',
      to: 'claim_settled',
      by: ['offtaker', 'grid_operator', 'operator'],
      label: 'Accept settlement',
      intent: 'primary',
      input: { settlement_amount_zar: { type: 'number', min: 0 } },
      // accepting creates a new payment obligation — same admission gate as ccp_assessment.approve.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ settled_at: isoUtc(at) }),
    },
    {
      id: 'commence_adjudication',
      from: ['grid_response_filed', 'negotiating'],
      to: 'adjudication',
      by: ['offtaker', 'grid_operator', 'operator'],
      label: 'Commence adjudication',
      intent: 'primary',
      input: { adjudication_reason: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'dispute_claim',
      from: ['grid_response_filed', 'negotiating', 'settlement_offered'],
      to: 'adjudication',
      by: ['offtaker', 'grid_operator', 'operator'],
      label: 'Dispute claim',
      intent: 'destructive',
      requiresReason: ['quantum_disputed', 'liability_disputed', 'metering_disputed', 'procedural_defect'],
      guards: [],
    },
    {
      id: 'make_award',
      from: 'adjudication',
      to: 'award_made',
      by: ['offtaker', 'grid_operator', 'operator'],
      label: 'Make award',
      intent: 'primary',
      input: { settlement_amount_zar: { type: 'number', min: 0 } },
      // an award is a new payment obligation too — same admission gate as accept_settlement.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ awarded_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['lodged', 'metering_verified', 'liability_assessed', 'quantum_determined', 'grid_response_filed', 'negotiating'],
      to: 'claim_withdrawn',
      by: ['offtaker', 'operator'],
      label: 'Withdraw claim',
      intent: 'destructive',
      requiresReason: ['claim_no_longer_pursued', 'error_in_claim', 'resolved_outside_process'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
    {
      // SLA time-bar: a claim the grid operator never even verifies within the
      // NRS 048 response window escalates to adjudication rather than stalling
      // forever in `lodged`. system-fireable, no input, no reason — safe timer edge.
      id: 'lapse_unassessed',
      from: 'lodged',
      to: 'adjudication',
      by: ['grid_operator', 'operator', 'system'],
      label: 'Escalate unassessed claim to adjudication',
      intent: 'secondary',
      guards: [],
    },
  ],

  timers: [{ onState: 'lodged', after: { days: 30 }, fire: 'lapse_unassessed', kind: 'sla' }],
};
