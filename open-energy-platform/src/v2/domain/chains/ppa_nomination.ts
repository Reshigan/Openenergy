// ppa_nomination — PPA day-ahead nomination lifecycle as data.
//
// A seller (IPP) nominates energy for a delivery day under an existing PPA; the
// grid operator validates it against network constraints; the buyer (offtaker)
// accepts. The commercial spine is STRUCTURAL: the only edge into `accepted` is
// `accept`, and `accept` can ONLY fire from `validated` — which only the grid's
// `validate` edge reaches. So a buyer can NEVER accept a nomination the grid has
// not validated first. No guard enforces this; the state graph does (the same
// technique as permit_to_work's isolation gate).
//
// Amendments loop on `submitted` only — once the grid has validated, the seller
// must withdraw and re-nominate rather than silently mutate a validated schedule.
//
// settles:false — a nomination is a physical-delivery schedule commitment, not a
// payment. No money moves through this chain; imbalance settlement is a separate
// downstream chain. Export always carries the record-only custody notice
// (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ppaNomination: ChainDecl = {
  key: 'ppa_nomination',
  noun: 'PPA day-ahead nomination',
  refPrefix: 'PNOM',
  title: (f) =>
    `Nomination ${(f.delivery_date as string) ?? '?'} — ${(f.energy_mwh as number) ?? '?'} MWh`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'System Operation Code — day-ahead nomination & scheduling', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 's34 PPA dispatch obligation', effect: 'authorises' },
  ],
  roles: ['seller', 'buyer', 'grid', 'operator'],

  fields: {
    delivery_date: { type: 'string', required: true, label: 'Delivery day (ISO date)' },
    energy_mwh: { type: 'number', required: true, min: 0, label: 'Nominated energy (MWh)' },
    price_zar_mwh: { type: 'number', min: 0, label: 'Price (ZAR/MWh)' },
    point_of_delivery: { type: 'string', label: 'Point of delivery' },
    buyer_party: { type: 'party', role: 'buyer', label: 'Buyer / offtaker' },
    grid_party: { type: 'party', role: 'grid', label: 'Grid operator' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    validated_at: { type: 'string', label: 'Grid-validated at' },
    accepted_at: { type: 'string', label: 'Buyer-accepted at' },
    expired_at: { type: 'string', label: 'Expired at' },
  },

  initial: 'submitted',

  states: {
    // gate closure is tight for day-ahead: grid then buyer both act within hours.
    submitted: { label: 'Submitted', terminal: false, holder: 'grid', sla: { hours: 4 } },
    validated: { label: 'Grid validated', terminal: false, holder: 'buyer', sla: { hours: 2 } },
    accepted: { label: 'Accepted', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    expired: { label: 'Expired at gate closure', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'submitted',
      by: ['seller', 'operator'],
      actorBecomes: 'seller',
      label: 'Submit nomination',
      intent: 'primary',
      input: {
        delivery_date: { type: 'string', required: true },
        energy_mwh: { type: 'number', required: true, min: 0 },
        price_zar_mwh: { type: 'number', min: 0 },
        point_of_delivery: { type: 'string' },
        // buyer & grid fire later edges — they must be live parties from @new.
        buyer_party: { type: 'party', role: 'buyer' },
        grid_party: { type: 'party', role: 'grid' },
      },
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },

    // amend loops on submitted ONLY — a validated schedule is immutable; the
    // seller must withdraw and re-nominate. Re-stamps submitted_at.
    {
      id: 'amend',
      from: 'submitted',
      to: 'submitted',
      by: ['seller', 'operator'],
      label: 'Amend nomination',
      intent: 'secondary',
      input: {
        energy_mwh: { type: 'number', min: 0 },
        price_zar_mwh: { type: 'number', min: 0 },
        point_of_delivery: { type: 'string' },
      },
      requiresReason: ['volume_correction', 'price_correction', 'data_error'],
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },

    // --- happy path (structural gate: accept only reachable via validate) -----
    {
      id: 'validate',
      from: 'submitted',
      to: 'validated',
      by: ['grid'],
      label: 'Validate against network',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ validated_at: isoUtc(at) }),
    },
    {
      id: 'accept',
      from: 'validated',
      to: 'accepted',
      by: ['buyer'],
      label: 'Accept nomination',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },

    // --- exits ---------------------------------------------------------------
    {
      id: 'reject',
      from: ['submitted', 'validated'],
      to: 'rejected',
      by: ['grid', 'buyer'],
      label: 'Reject nomination',
      intent: 'destructive',
      requiresReason: ['grid_constraint', 'insufficient_capacity', 'price_unacceptable', 'data_error', 'counterparty_default'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['submitted', 'validated'],
      to: 'withdrawn',
      by: ['seller', 'operator'],
      label: 'Withdraw nomination',
      intent: 'destructive',
      requiresReason: ['plant_outage', 'forecast_change', 'commercial_withdrawal'],
      guards: [],
    },
    // gate-closure time-bar: an un-progressed nomination expires. by:system so a
    // timer sweep can dispatch it (ppa_contract auto_expire pattern).
    {
      id: 'auto_expire',
      from: ['submitted', 'validated'],
      to: 'expired',
      by: ['system'],
      label: 'Expire at gate closure',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ expired_at: isoUtc(at) }),
    },
  ],

  timers: [
    { onState: 'submitted', after: { hours: 4 }, fire: 'auto_expire', kind: 'time_bar' },
    { onState: 'validated', after: { hours: 2 }, fire: 'auto_expire', kind: 'time_bar' },
  ],
};
