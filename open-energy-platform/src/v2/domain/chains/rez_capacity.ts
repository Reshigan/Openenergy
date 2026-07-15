// rez_capacity — grid connection capacity allocation & queue (NERSA Grid Code
// + NTCSA Interim Grid Capacity Allocation and Curtailment Rules 2024), as data.
//
// Transmission/distribution headroom is the binding constraint on SA's energy
// transition: more generation wants to connect than the network can host.
// Before a generator can sign a Grid Connection Agreement it must SECURE an
// allocation of scarce grid capacity. A developer applies at a chosen
// connection point; the network operator screens completeness (looping through
// an information-request round-trip if the filing is incomplete), runs a
// capacity assessment (load-flow / fault-level / stability / headroom),
// assigns a queue position, then the allocation committee ISSUES AN OFFER, the
// applicant ACCEPTS (reserving capacity pending milestones), and the operator
// finally ALLOCATES it firmly — feeding the Grid Connection Agreement chain.
//
// Structural honesty (no invented guards):
//  - `capacity_allocated` is reachable ONLY from `capacity_reserved` via
//    allocate_capacity, and `capacity_reserved` is reachable ONLY from
//    `offer_issued` via accept_offer — so firm capacity can NEVER be granted
//    without an issued offer the applicant actually accepted. The state graph
//    enforces the queue order; no guard required.
//  - `issue_offer` and `allocate_capacity` (the two edges that commit scarce
//    capacity to a specific applicant) are guarded by complianceHaltClear: a
//    platform-wide compliance halt (POPIA / NERSA directive) blocks new
//    capacity commitments, but never blocks reject/lapse/relinquish/withdraw
//    (de-risking the queue must always be possible).
//  - `allocate_capacity` additionally carries regulatorPresentIfStrategic: a
//    firm grant at/above the registry's 100 MW threshold needs a live
//    regulator party on the txn — the transmission-level connections this
//    protects are exactly the ones the legacy tiering treats as "large" /
//    "strategic" and subjects to deeper system-impact study + reportability.
//  - `open` is guarded by counterpartyDistinct: the applicant and the network
//    operator must be different legal entities (no self-allocation).
//
// SLA note: the legacy spec (grid-capacity-allocation-spec.ts) runs an
// INVERTED, tier-dependent matrix (bigger connection ⇒ more study time) that a
// single per-state Duration can't represent. The `sla` on each state below is
// the "medium" tier as a representative baseline; per-tier variation is a v1
// concern, not modelled here.
//
// settles:false — capacity allocation is a queue/rights decision. The estimated
// capex it records (R millions) is informational cost context, not a payment
// this chain moves (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const rezCapacity: ChainDecl = {
  key: 'rez_capacity',
  noun: 'Grid connection capacity allocation',
  refPrefix: 'GCAP',
  title: (f) =>
    `Grid capacity — ${(f.project_name as string) ?? 'unnamed project'} (${(f.capacity_mw as number) ?? '?'} MW)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'grid connection capacity allocation & queue management', effect: 'requires' },
    { instrument: 'NTCSA Interim Grid Capacity Allocation and Curtailment Rules (2024)', provision: 'tiered capacity queue, committee-issued offer, firm allocation', effect: 'requires' },
  ],
  roles: ['applicant', 'grid_operator', 'regulator', 'operator'],

  fields: {
    applicant_party: { type: 'party', role: 'applicant', label: 'Applicant developer' },
    grid_operator_party: { type: 'party', role: 'grid_operator', label: 'Network operator' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    project_name: { type: 'string', required: true, label: 'Project name' },
    project_location: { type: 'string', label: 'Project location' },
    connection_type: { type: 'string', label: 'Connection type' },
    technology: { type: 'string', label: 'Technology' },
    network_level: { type: 'string', label: 'Network level' },
    capacity_tier: { type: 'string', label: 'Capacity tier (minor/small/medium/large/strategic)' },
    capacity_mw: { type: 'number', min: 0, label: 'Requested capacity (MW)' },
    granted_capacity_mw: { type: 'number', min: 0, label: 'Offered/allocated capacity (MW)' },
    substation: { type: 'string', label: 'Substation' },
    supply_area: { type: 'string', label: 'Supply area' },
    estimated_capex_zar_m: { type: 'number', min: 0, label: 'Estimated connection capex (R millions) — informational' },
    queue_rank: { type: 'number', min: 0, label: 'Queue rank' },
    priority_date: { type: 'string', label: 'Priority date' },
    application_ref: { type: 'string', label: 'Application reference' },
    screening_ref: { type: 'string', label: 'Screening reference' },
    info_request_ref: { type: 'string', label: 'Information-request reference' },
    assessment_ref: { type: 'string', label: 'Capacity assessment reference' },
    queue_ref: { type: 'string', label: 'Queue-position reference' },
    offer_ref: { type: 'string', label: 'Offer reference' },
    reservation_ref: { type: 'string', label: 'Reservation reference' },
    allocation_ref: { type: 'string', label: 'Allocation reference' },
    gca_ref: { type: 'string', label: 'Grid Connection Agreement ref (W28 handoff)' },
    regulator_ref: { type: 'string', label: 'Regulator reference' },
    rejection_basis: { type: 'string', label: 'Rejection basis' },
    relinquish_basis: { type: 'string', label: 'Relinquish basis' },
    decision_notes: { type: 'string', label: 'Decision notes' },
    // written by derive, never by the client
    received_at: { type: 'string', label: 'Application received at' },
    offer_issued_at: { type: 'string', label: 'Offer issued at' },
    reserved_at: { type: 'string', label: 'Capacity reserved at' },
    allocated_at: { type: 'string', label: 'Capacity allocated at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    lapsed_at: { type: 'string', label: 'Lapsed at' },
    relinquished_at: { type: 'string', label: 'Relinquished at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'application_received',

  states: {
    application_received: { label: 'Application received', terminal: false, holder: 'grid_operator', sla: { days: 5 } },
    completeness_screening: { label: 'Completeness screening', terminal: false, holder: 'grid_operator', sla: { days: 10 } },
    information_requested: { label: 'Information requested', terminal: false, holder: 'applicant', sla: { days: 30 } },
    capacity_assessment: { label: 'Capacity assessment', terminal: false, holder: 'grid_operator', sla: { days: 30 } },
    queue_positioned: { label: 'Queue positioned', terminal: false, holder: 'grid_operator', sla: { days: 21 } },
    offer_issued: { label: 'Offer issued', terminal: false, holder: 'applicant', sla: { days: 30 } },
    capacity_reserved: { label: 'Capacity reserved', terminal: false, holder: 'grid_operator', sla: { days: 60 } },
    capacity_allocated: { label: 'Capacity allocated', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
    relinquished: { label: 'Relinquished', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'application_received',
      by: ['applicant', 'operator'],
      actorBecomes: 'applicant',
      label: 'Apply for grid connection capacity',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        project_location: { type: 'string' },
        connection_type: { type: 'string' },
        technology: { type: 'string' },
        network_level: { type: 'string' },
        capacity_tier: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        substation: { type: 'string' },
        supply_area: { type: 'string' },
        estimated_capex_zar_m: { type: 'number', min: 0 },
        application_ref: { type: 'string' },
        grid_operator_party: { type: 'party', role: 'grid_operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // applicant ≠ network operator (no self-allocation).
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ received_at: isoUtc(at) }),
    },
    {
      id: 'begin_screening',
      from: 'application_received',
      to: 'completeness_screening',
      by: ['grid_operator', 'operator'],
      label: 'Begin completeness screening',
      intent: 'primary',
      input: { screening_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'request_info',
      from: 'completeness_screening',
      to: 'information_requested',
      by: ['grid_operator', 'operator'],
      label: 'Request additional information',
      intent: 'secondary',
      input: { info_request_ref: { type: 'string' } },
      guards: [],
    },
    // information-gap loop: back to completeness_screening once the applicant responds.
    {
      id: 'submit_info',
      from: 'information_requested',
      to: 'completeness_screening',
      by: ['applicant', 'operator'],
      label: 'Submit requested information',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'begin_assessment',
      from: 'completeness_screening',
      to: 'capacity_assessment',
      by: ['grid_operator', 'operator'],
      label: 'Begin capacity assessment',
      intent: 'primary',
      input: { assessment_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'assign_queue_position',
      from: 'capacity_assessment',
      to: 'queue_positioned',
      by: ['grid_operator', 'operator'],
      label: 'Assign queue position',
      intent: 'primary',
      input: {
        queue_ref: { type: 'string' },
        queue_rank: { type: 'number', min: 0 },
        priority_date: { type: 'string' },
      },
      guards: [],
    },
    {
      // commits scarce capacity to this applicant: no new offers under a halt.
      id: 'issue_offer',
      from: 'queue_positioned',
      to: 'offer_issued',
      by: ['grid_operator', 'operator'],
      label: 'Issue capacity offer',
      intent: 'primary',
      input: {
        offer_ref: { type: 'string' },
        granted_capacity_mw: { type: 'number', min: 0 },
      },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ offer_issued_at: isoUtc(at) }),
    },
    {
      id: 'accept_offer',
      from: 'offer_issued',
      to: 'capacity_reserved',
      by: ['applicant', 'operator'],
      label: 'Accept capacity offer',
      intent: 'primary',
      input: { reservation_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ reserved_at: isoUtc(at) }),
    },
    {
      // structural queue gate: the ONLY edge into capacity_allocated, and it can
      // only fire from capacity_reserved — so capacity can never be firmly
      // granted without an accepted offer. regulatorPresentIfStrategic forces
      // regulator visibility on the transmission-level (≥100 MW) grants.
      id: 'allocate_capacity',
      from: 'capacity_reserved',
      to: 'capacity_allocated',
      by: ['grid_operator', 'operator'],
      label: 'Allocate capacity (firm)',
      intent: 'primary',
      input: {
        allocation_ref: { type: 'string' },
        granted_capacity_mw: { type: 'number', min: 0 },
        gca_ref: { type: 'string' },
        decision_notes: { type: 'string' },
      },
      guards: ['complianceHaltClear', 'regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ allocated_at: isoUtc(at) }),
    },

    // --- exits (de-risking the queue is never blocked by a compliance halt) ---
    {
      id: 'reject_application',
      from: ['capacity_assessment', 'queue_positioned'],
      to: 'rejected',
      by: ['grid_operator', 'operator'],
      label: 'Reject application',
      intent: 'destructive',
      input: {
        rejection_basis: { type: 'string', required: true },
        regulator_ref: { type: 'string' },
      },
      requiresReason: ['no_headroom', 'failed_system_impact_study', 'displaced_in_queue', 'incomplete_application', 'nersa_directive'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'lapse',
      from: ['offer_issued', 'capacity_reserved'],
      to: 'lapsed',
      by: ['grid_operator', 'operator', 'system'],
      label: 'Lapse (deadline missed)',
      intent: 'destructive',
      requiresReason: ['offer_not_accepted', 'reservation_milestone_missed'],
      guards: [],
      derive: (_f, at: Instant) => ({ lapsed_at: isoUtc(at) }),
    },
    {
      id: 'relinquish',
      from: 'capacity_reserved',
      to: 'relinquished',
      by: ['applicant', 'operator'],
      label: 'Relinquish reserved capacity',
      intent: 'destructive',
      input: {
        relinquish_basis: { type: 'string' },
        regulator_ref: { type: 'string' },
      },
      requiresReason: ['no_longer_required', 'project_cancelled', 'financing_failed', 'site_change'],
      guards: [],
      derive: (_f, at: Instant) => ({ relinquished_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['application_received', 'completeness_screening', 'information_requested', 'capacity_assessment', 'queue_positioned', 'offer_issued'],
      to: 'withdrawn',
      by: ['applicant', 'operator'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['no_longer_seeking_connection', 'alternative_connection_point', 'project_cancelled'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
