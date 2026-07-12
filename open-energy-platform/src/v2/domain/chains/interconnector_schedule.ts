// interconnector_schedule — a cross-border / inter-control-area transmission
// schedule nomination as data.
//
// A scheduling coordinator nominates an energy transfer over an interconnector
// (a tie-line between two control areas) for a delivery window. The transmission
// operator reviews it against allocated capacity → confirms it firm → dispatches
// it onto the line → closes it out against metered delivery.
//
// The firm-flow spine is STRUCTURAL, not a guard: dispatch_schedule leaves ONLY
// `confirmed`, and the only path into `confirmed` is confirm_schedule from
// `capacity_review`. So a schedule can NEVER be dispatched onto the
// interconnector before the operator has reviewed capacity and confirmed it firm
// — no guard needed, the state graph forbids an unallocated cross-border flow.
//
// confirm_schedule is guarded by complianceHaltClear: a platform-wide compliance
// halt (NERSA directive / POPIA) blocks new firm cross-border commitments.
//
// NO claim key. A schedule is a while-active reservation of interconnector
// headroom for one delivery window, NOT permanent consumption — the same
// capacity is nominated again next window. Firm concurrent-capacity exclusion
// needs a claim+release headroom ledger the domain does not yet model
// (same call as permit_to_work). Deliberately out of scope.
//
// settles:false — a schedule is an operational grid instruction, never a payment
// (R-S5-1). Energy settlement rides a separate financial chain.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure scheduled-energy: MW across the delivery-window hours. No clock, no env.
const scheduledMwh = (mw: Json | undefined, hStart: Json | undefined, hEnd: Json | undefined): number => {
  if (typeof mw !== 'number' || typeof hStart !== 'number' || typeof hEnd !== 'number') return 0;
  const hours = hEnd - hStart;
  return hours > 0 ? mw * hours : 0;
};

export const interconnectorSchedule: ChainDecl = {
  key: 'interconnector_schedule',
  noun: 'Interconnector schedule',
  refPrefix: 'IS',
  title: (f) =>
    `${(f.direction as string) ?? 'transfer'} schedule — ${(f.interconnector as string) ?? 'interconnector'} ${(f.delivery_date as string) ?? ''}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'System Operator scheduling & dispatch code', effect: 'requires' },
    { instrument: 'SAPP Agreement', provision: 'inter-utility interconnector nomination & confirmation', effect: 'requires' },
  ],
  roles: ['scheduler', 'operator', 'counterparty', 'regulator'],

  fields: {
    interconnector: { type: 'string', required: true, label: 'Interconnector / tie-line' },
    direction: { type: 'string', required: true, label: 'Direction (import/export)' },
    delivery_date: { type: 'string', required: true, label: 'Delivery date' },
    delivery_hour_start: { type: 'number', min: 0, max: 24, label: 'Window start hour' },
    delivery_hour_end: { type: 'number', min: 0, max: 24, label: 'Window end hour' },
    schedule_mw: { type: 'number', required: true, min: 0, label: 'Scheduled MW' },
    allocated_capacity_mw: { type: 'number', min: 0, label: 'Allocated capacity (MW)' },
    delivered_mwh: { type: 'number', min: 0, label: 'Metered delivered (MWh)' },
    // party fields
    scheduler_party: { type: 'party', role: 'scheduler', label: 'Scheduling coordinator' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Counterparty control area' },
    operator_party: { type: 'party', role: 'operator', label: 'Transmission operator' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    // written by derive, never by the client
    scheduled_mwh: { type: 'number', label: 'Scheduled energy (MWh)' },
    confirmed_at: { type: 'string', label: 'Confirmed at' },
    dispatched_at: { type: 'string', label: 'Dispatched at' },
    completed_at: { type: 'string', label: 'Completed at' },
  },

  initial: 'nominated',

  states: {
    nominated: { label: 'Nominated', terminal: false, holder: 'operator', sla: { hours: 4 } },
    capacity_review: { label: 'Capacity review', terminal: false, holder: 'operator', sla: { hours: 4 } },
    confirmed: { label: 'Confirmed (firm)', terminal: false, holder: 'operator', sla: { hours: 12 } },
    dispatched: { label: 'Dispatched', terminal: false, holder: 'operator' },
    completed: { label: 'Completed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    curtailed: { label: 'Curtailed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'nominated',
      by: ['scheduler', 'operator'],
      actorBecomes: 'scheduler',
      label: 'Nominate schedule',
      intent: 'primary',
      input: {
        interconnector: { type: 'string', required: true },
        direction: { type: 'string', required: true },
        delivery_date: { type: 'string', required: true },
        delivery_hour_start: { type: 'number', min: 0, max: 24 },
        delivery_hour_end: { type: 'number', min: 0, max: 24 },
        schedule_mw: { type: 'number', required: true, min: 0 },
        counterparty_party: { type: 'party', role: 'counterparty' },
        operator_party: { type: 'party', role: 'operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({
        scheduled_mwh: scheduledMwh(f.schedule_mw, f.delivery_hour_start, f.delivery_hour_end),
      }),
    },
    {
      id: 'begin_review',
      from: 'nominated',
      to: 'capacity_review',
      by: ['operator'],
      label: 'Begin capacity review',
      intent: 'primary',
      guards: [],
    },
    {
      // firm commitment: a platform compliance halt blocks new firm cross-border
      // schedules. The only edge that makes a schedule dispatchable.
      id: 'confirm_schedule',
      from: 'capacity_review',
      to: 'confirmed',
      by: ['operator'],
      label: 'Confirm schedule (firm)',
      intent: 'primary',
      input: { allocated_capacity_mw: { type: 'number', min: 0 } },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ confirmed_at: isoUtc(at) }),
    },
    {
      // structural firm-flow gate: the ONLY edge into `dispatched`, and it can
      // only fire from `confirmed` — which only confirm_schedule reaches. A
      // schedule therefore cannot dispatch before capacity is confirmed. No guard.
      id: 'dispatch_schedule',
      from: 'confirmed',
      to: 'dispatched',
      by: ['operator'],
      label: 'Dispatch onto line',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ dispatched_at: isoUtc(at) }),
    },
    {
      id: 'complete_schedule',
      from: 'dispatched',
      to: 'completed',
      by: ['operator'],
      label: 'Complete & meter',
      intent: 'primary',
      input: { delivered_mwh: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ completed_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_schedule',
      from: ['nominated', 'capacity_review'],
      to: 'rejected',
      by: ['operator'],
      label: 'Reject nomination',
      intent: 'destructive',
      requiresReason: ['capacity_unavailable', 'counterparty_unconfirmed', 'grid_constraint', 'invalid_nomination'],
      guards: [],
    },
    {
      id: 'curtail_schedule',
      from: ['confirmed', 'dispatched'],
      to: 'curtailed',
      by: ['operator', 'regulator'],
      label: 'Curtail schedule',
      intent: 'destructive',
      requiresReason: ['grid_emergency', 'transmission_constraint', 'security_of_supply', 'interconnector_trip'],
      guards: [],
    },
    {
      id: 'withdraw_schedule',
      from: ['nominated', 'capacity_review', 'confirmed'],
      to: 'withdrawn',
      by: ['scheduler'],
      label: 'Withdraw nomination',
      intent: 'destructive',
      requiresReason: ['schedule_cancelled', 'rescheduled', 'counterparty_withdrew'],
      guards: [],
    },
  ],

  // confirmed-window time-bar: a firm schedule not dispatched by its delivery
  // window stales out (the reserved headroom cannot be held indefinitely).
  // record-only stub; the sweep computes the real bar off the state sla hours.
  timers: [{ onState: 'confirmed', after: { hours: 0 }, fire: 'curtail_schedule', kind: 'time_bar' }],
};
