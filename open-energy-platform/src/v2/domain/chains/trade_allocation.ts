// trade_allocation — block-trade allocation lifecycle as data.
//
// A block trade is executed on-exchange as one large fill; it must then be
// ALLOCATED to the executing counterparty's account and CONFIRMED by that
// counterparty before it is booked. The executing trader proposes an
// allocation, allocates a quantity, and the counterparty (or the operator on
// their behalf) confirms it. A counterparty who disputes the split rejects it,
// which loops the txn back to `proposed` for the trader to re-allocate.
//
// Settlement honesty (R-S5-1): settles:false. An allocation records WHO the
// block belongs to and HOW MUCH — it does not move cash or transfer custody.
// The clearing/settlement of the allocated quantity happens on a separate rail;
// no state here is a money-terminal, so no *_instructed suffix is warranted.
//
// Structural note: `confirm` and `reject` ONLY leave `allocated`, and the only
// path into `allocated` is `allocate`. So a block can never be confirmed before
// a quantity has actually been allocated — the state graph enforces it, no
// guard needed. `reject` returns to `proposed` (not a terminal) so the trader
// can re-split; a rejection is a correction, not a kill.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

export const tradeAllocation: ChainDecl = {
  key: 'trade_allocation',
  noun: 'Block trade allocation',
  refPrefix: 'TALO',
  title: (f) => `Allocation — ${(f.block_ref as string) ?? 'unref'} (${(f.total_quantity_mwh as number) ?? 0} MWh)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Markets Act 2012', provision: 's35 conduct of business — post-trade allocation', effect: 'requires' },
    { instrument: 'JSE-SRL', provision: 'block trade allocation & reporting', effect: 'requires' },
  ],
  roles: ['executing', 'counterparty', 'operator'],

  fields: {
    block_ref: { type: 'string', required: true, label: 'Block trade ref' },
    energy_type: { type: 'string', label: 'Energy type' },
    total_quantity_mwh: { type: 'number', required: true, min: 0, label: 'Block quantity (MWh)' },
    price_zar_mwh: { type: 'number', min: 0, label: 'Price (ZAR/MWh)' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Allocated counterparty' },
    allocation_account: { type: 'string', label: 'Allocation account' },
    allocated_quantity_mwh: { type: 'number', min: 0, label: 'Allocated quantity (MWh)' },
    reject_count: { type: 'number', label: 'Times rejected' },
    // written by derive, never by the client
    proposed_at: { type: 'string', label: 'Proposed at' },
    allocated_at: { type: 'string', label: 'Allocated at' },
    confirmed_at: { type: 'string', label: 'Confirmed at' },
  },

  initial: 'proposed',

  states: {
    proposed: { label: 'Proposed', terminal: false, holder: 'executing', sla: { hours: 24 } },
    allocated: { label: 'Allocated', terminal: false, holder: 'counterparty', sla: { hours: 24 } },
    confirmed: { label: 'Confirmed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'proposed',
      by: ['executing', 'operator'],
      actorBecomes: 'executing',
      label: 'Propose allocation',
      intent: 'primary',
      input: {
        block_ref: { type: 'string', required: true },
        energy_type: { type: 'string' },
        total_quantity_mwh: { type: 'number', required: true, min: 0 },
        price_zar_mwh: { type: 'number', min: 0 },
        allocation_account: { type: 'string' },
        // the counterparty must be pinned at @new so they can act on later edges
        counterparty_party: { type: 'party', role: 'counterparty' },
      },
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ proposed_at: isoUtc(at) }),
    },

    // --- happy path ---------------------------------------------------------
    {
      id: 'allocate',
      from: 'proposed',
      to: 'allocated',
      by: ['executing', 'operator'],
      label: 'Allocate quantity',
      intent: 'primary',
      input: { allocated_quantity_mwh: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ allocated_at: isoUtc(at) }),
    },
    {
      // structural gate: only leaves `allocated`, which only `allocate` reaches —
      // a block cannot be confirmed before a quantity is allocated. No guard.
      id: 'confirm',
      from: 'allocated',
      to: 'confirmed',
      by: ['counterparty', 'operator'],
      label: 'Confirm allocation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ confirmed_at: isoUtc(at) }),
    },
    {
      // a disputed split is a correction, not a kill: loop back to `proposed`.
      id: 'reject',
      from: 'allocated',
      to: 'proposed',
      by: ['counterparty', 'operator'],
      label: 'Reject allocation',
      intent: 'destructive',
      requiresReason: ['wrong_account', 'quantity_mismatch', 'price_mismatch', 'unrecognised_block'],
      guards: [],
      derive: (f): Record<string, Json> => ({ reject_count: (typeof f.reject_count === 'number' ? f.reject_count : 0) + 1 }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'withdraw',
      from: ['proposed', 'allocated'],
      to: 'cancelled',
      by: ['executing', 'operator'],
      label: 'Withdraw allocation',
      intent: 'destructive',
      requiresReason: ['trade_busted', 'reallocated_elsewhere', 'block_error'],
      guards: [],
    },
    {
      // SLA time-bar counterpart to the withdraw exit: a proposal/allocation left
      // to stale out past its confirmation window is auto-cancelled by the sweep.
      id: 'auto_cancel',
      from: ['proposed', 'allocated'],
      to: 'cancelled',
      by: ['system'],
      label: 'Auto-cancel (stale)',
      intent: 'secondary',
      guards: [],
    },
  ],

  // record-only stub; the SLA sweep computes the real bar off each state's sla
  // hours and fires auto_cancel (ppa_contract / permit_to_work timer pattern).
  timers: [{ onState: 'allocated', after: { hours: 24 }, fire: 'auto_cancel', kind: 'time_bar' }],
};
