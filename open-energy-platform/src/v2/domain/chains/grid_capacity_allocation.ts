// grid_capacity_allocation — transmission/distribution capacity allocation as data.
//
// An applicant (IPP / generator / large load) applies to the grid operator for
// firm capacity at a connection point. The operator runs a network/capacity
// study, offers an allocation, the applicant accepts, and the operator activates
// it. The commitment spine is structural: activate_allocation leaves ONLY
// allocation_accepted, and the ONLY path into allocation_accepted is
// accept_allocation. So capacity can NEVER be activated before the applicant has
// accepted the offer — no guard needed, the state graph enforces it.
//
// Strategic-tier requests (≥100 MW) cross to the regulator: offer_allocation is
// guarded by regulatorPresentIfStrategic, which reads capacity_mw off the txn.
//
// settles:false — a capacity allocation is a grid-access control, never a
// payment (R-S5-1). Wheeling/connection charges settle on separate chains.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure capacity-tier bucketing off the requested MW. No clock, no env.
const capacityTier = (mw: Json | undefined): string => {
  if (typeof mw !== 'number') return 'unassessed';
  if (mw >= 100) return 'strategic';
  if (mw >= 20) return 'major';
  return 'standard';
};

export const gridCapacityAllocation: ChainDecl = {
  key: 'grid_capacity_allocation',
  noun: 'Grid capacity allocation',
  refPrefix: 'GRID',
  title: (f) => `${(f.capacity_mw as number) ?? '?'} MW allocation — ${(f.connection_point as string) ?? 'unnamed point'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'Network Code — capacity allocation & connection', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 's8 licensed network access', effect: 'authorises' },
  ],
  roles: ['applicant', 'grid_operator', 'regulator'],

  fields: {
    allocation_ref: { type: 'string', label: 'Allocation reference' },
    applicant_party: { type: 'party', role: 'applicant', label: 'Applicant' },
    grid_operator_party: { type: 'party', role: 'grid_operator', label: 'Grid operator' },
    connection_point: { type: 'string', required: true, label: 'Connection point / substation' },
    voltage_kv: { type: 'number', min: 0, label: 'Voltage (kV)' },
    capacity_mw: { type: 'number', required: true, min: 0, label: 'Requested capacity (MW)' },
    capacity_tier: { type: 'string', label: 'Capacity tier' },
    energy_type: { type: 'string', label: 'Energy type' },
    delivery_year: { type: 'number', label: 'Delivery year' },
    study_ref: { type: 'string', label: 'Network study reference' },
    network_constraint: { type: 'string', label: 'Binding network constraint' },
    offered_mw: { type: 'number', min: 0, label: 'Offered capacity (MW)' },
    offer_validity_days: { type: 'number', min: 0, label: 'Offer validity (days)' },
    // written by derive, never by the client
    study_started_at: { type: 'string', label: 'Study started at' },
    offered_at: { type: 'string', label: 'Offered at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    activated_at: { type: 'string', label: 'Activated at' },
  },

  initial: 'application_received',

  states: {
    application_received: { label: 'Application received', terminal: false, holder: 'grid_operator', sla: { hours: 48 } },
    study_in_progress: { label: 'Network study in progress', terminal: false, holder: 'grid_operator', sla: { days: 30 } },
    allocation_offered: { label: 'Allocation offered', terminal: false, holder: 'applicant', sla: { days: 14 } },
    allocation_accepted: { label: 'Allocation accepted', terminal: false, holder: 'grid_operator', sla: { days: 7 } },
    allocation_active: { label: 'Allocation active', terminal: true, holder: 'none' },
    application_rejected: { label: 'Application rejected', terminal: true, holder: 'none' },
    offer_declined: { label: 'Offer declined', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'application_received',
      by: ['applicant'],
      actorBecomes: 'applicant',
      label: 'Apply for capacity',
      intent: 'primary',
      input: {
        connection_point: { type: 'string', required: true },
        voltage_kv: { type: 'number', min: 0 },
        capacity_mw: { type: 'number', required: true, min: 0 },
        energy_type: { type: 'string' },
        delivery_year: { type: 'number' },
        grid_operator_party: { type: 'party', role: 'grid_operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ capacity_tier: capacityTier(f.capacity_mw) }),
    },
    {
      id: 'begin_study',
      from: 'application_received',
      to: 'study_in_progress',
      by: ['grid_operator'],
      label: 'Begin network study',
      intent: 'primary',
      input: { study_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ study_started_at: isoUtc(at) }),
    },
    {
      id: 'offer_allocation',
      from: 'study_in_progress',
      to: 'allocation_offered',
      by: ['grid_operator'],
      label: 'Offer allocation',
      intent: 'primary',
      input: {
        offered_mw: { type: 'number', required: true, min: 0 },
        offer_validity_days: { type: 'number', min: 0 },
        network_constraint: { type: 'string' },
      },
      // strategic-tier (≥100 MW) requests need a regulator on the txn to proceed.
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ offered_at: isoUtc(at) }),
    },
    {
      id: 'accept_allocation',
      from: 'allocation_offered',
      to: 'allocation_accepted',
      by: ['applicant'],
      label: 'Accept allocation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      // structural commitment gate: the ONLY edge into allocation_active, and it
      // can only fire from allocation_accepted — which only accept_allocation
      // reaches. Capacity therefore cannot activate before the applicant accepts.
      id: 'activate_allocation',
      from: 'allocation_accepted',
      to: 'allocation_active',
      by: ['grid_operator'],
      label: 'Activate allocation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ activated_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_application',
      from: ['application_received', 'study_in_progress'],
      to: 'application_rejected',
      by: ['grid_operator'],
      label: 'Reject application',
      intent: 'destructive',
      requiresReason: ['no_headroom', 'network_constraint', 'incomplete_application', 'connection_point_unavailable'],
      guards: [],
    },
    {
      id: 'decline_offer',
      from: 'allocation_offered',
      to: 'offer_declined',
      by: ['applicant', 'grid_operator'],
      label: 'Decline offer',
      intent: 'destructive',
      requiresReason: ['capacity_insufficient', 'terms_unacceptable', 'offer_expired', 'project_cancelled'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['application_received', 'study_in_progress'],
      to: 'withdrawn',
      by: ['applicant'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'rescheduled', 'applied_elsewhere'],
      guards: [],
    },
  ],

  // offer-expiry time-bar: an untouched offer stales out (allocated headroom
  // cannot be reserved for an applicant indefinitely). record-only stub; the
  // sweep computes the real bar off the state's sla days (ppa_contract pattern).
  timers: [{ onState: 'allocation_offered', after: { days: 0 }, fire: 'decline_offer', kind: 'time_bar' }],
};
