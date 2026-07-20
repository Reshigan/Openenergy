// settlement_fail — settlement-fail management lifecycle as data.
//
// A clearing house detects that a trade failed to settle (short delivery of
// energy/security against a matched trade), investigates it, and either closes
// it as resolved, records a buy-in instruction against the failing
// counterparty, or cancels it (data error / duplicate / recalled).
//
// SETTLEMENT-HONESTY STANCE — settles:false, RECORD ONLY. This chain never
// moves money and never achieves settlement finality. `buy_in_instructed` is a
// terminal-money-name RECORD ONLY state: it captures that a buy-in was
// *instructed*, not that cash or securities changed hands. Real buy-in
// execution, cash settlement, and finality live on the settlement rails
// (Strate/SWIFT), not here. Export always carries the record-only notice.
//
// STRUCTURAL GATE (no guard needed): a buy-in can ONLY be instructed from
// `investigating`. The only path into `investigating` is begin_investigation,
// and the only path into `buy_in_instructed` is instruct_buy_in from
// `investigating`. So a buy-in can NEVER be instructed on a raw, un-investigated
// fail — the state graph enforces the "investigate before you buy in" control,
// exactly like permit_to_work gates issue behind verified isolation.
//
// DELIBERATE ABSENCES: no complianceHaltClear — a platform compliance halt must
// NOT stop a clearing house from RECORDING a settlement fail; suppressing fail
// records during a halt is itself a regulatory failure. No claim key — a fail is
// a per-trade record, not a consumption of a finite range.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const settlementFail: ChainDecl = {
  key: 'settlement_fail',
  noun: 'Settlement fail management',
  refPrefix: 'SFAL',
  title: (f) => `Settlement fail — ${(f.instrument as string) ?? (f.trade_ref as string) ?? 'unidentified'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Markets Act 2012', provision: 's47 clearing-house rules', effect: 'authorises' },
    { instrument: 'CPMI-IOSCO PFMI', provision: 'Principle 7 — settlement-fail management', effect: 'requires' },
    { instrument: 'JSE-SRL', provision: 'buy-in on settlement failure', effect: 'authorises' },
  ],
  roles: ['clearing', 'counterparty', 'operator'],

  fields: {
    trade_ref: { type: 'string', required: true, label: 'Failing trade ref' },
    instrument: { type: 'string', required: true, label: 'Instrument / contract' },
    shortfall_quantity: { type: 'number', required: true, min: 0, label: 'Shortfall quantity' },
    value_zar: { type: 'number', min: 0, label: 'Fail value (ZAR)' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Failing counterparty' },
    buy_in_reference: { type: 'string', label: 'Buy-in instruction ref' },
    resolution_method: { type: 'string', label: 'Resolution method' },
    // written by derive, never by the client
    detected_at: { type: 'string', label: 'Detected at' },
    buy_in_instructed_at: { type: 'string', label: 'Buy-in instructed at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
  },

  initial: 'detected',

  states: {
    detected: { label: 'Fail detected', terminal: false, holder: 'clearing', sla: { days: 1 } },
    investigating: { label: 'Investigating', terminal: false, holder: 'clearing', sla: { days: 2 } },
    // NO SETTLEMENT FINALITY — RECORD ONLY. Records that a buy-in was instructed;
    // execution / cash movement / finality happen on the settlement rails.
    buy_in_instructed: { label: 'Buy-in instructed', terminal: false, holder: 'clearing', sla: { days: 4 } },
    resolved: { label: 'Resolved', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'detected',
      by: ['clearing', 'operator'],
      actorBecomes: 'clearing',
      label: 'Record settlement fail',
      intent: 'primary',
      input: {
        trade_ref: { type: 'string', required: true },
        instrument: { type: 'string', required: true },
        shortfall_quantity: { type: 'number', required: true, min: 0 },
        value_zar: { type: 'number', min: 0 },
        counterparty_party: { type: 'party', role: 'counterparty' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ detected_at: isoUtc(at) }),
    },

    // --- happy path ---------------------------------------------------------
    {
      id: 'begin_investigation',
      from: 'detected',
      to: 'investigating',
      by: ['clearing', 'operator'],
      label: 'Begin investigation',
      intent: 'primary',
      guards: [],
    },
    {
      // structural buy-in gate: the ONLY edge into buy_in_instructed, reachable
      // ONLY from investigating. A raw fail can never jump straight to a buy-in.
      id: 'instruct_buy_in',
      from: 'investigating',
      to: 'buy_in_instructed',
      by: ['clearing', 'operator', 'system'],
      label: 'Instruct buy-in',
      intent: 'primary',
      // optional: the timer sweep supplies a derived reference when absent.
      input: { buy_in_reference: { type: 'string' } },
      guards: [],
      derive: (f, at: Instant) => ({
        buy_in_instructed_at: isoUtc(at),
        buy_in_reference:
          typeof f.buy_in_reference === 'string' && f.buy_in_reference.length > 0
            ? f.buy_in_reference
            : `BUYIN-${(f.trade_ref as string) ?? 'UNREF'}-${isoUtc(at)}`,
      }),
    },
    {
      id: 'resolve',
      from: ['detected', 'investigating', 'buy_in_instructed'],
      to: 'resolved',
      by: ['clearing', 'counterparty', 'operator'],
      label: 'Resolve fail',
      intent: 'primary',
      requiresReason: ['counterparty_delivered', 'buy_in_executed', 'cash_settled', 'trade_cancelled'],
      input: { resolution_method: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },

    // --- exit ---------------------------------------------------------------
    {
      id: 'cancel',
      from: ['detected', 'investigating'],
      to: 'cancelled',
      by: ['clearing', 'operator'],
      label: 'Cancel fail record',
      intent: 'destructive',
      requiresReason: ['duplicate_fail', 'data_error', 'trade_amended', 'fail_recalled'],
      guards: [],
    },
  ],

  // T+4 mandatory-buy-in time-bar: a fail left in investigation past the bar
  // triggers the buy-in instruction; the edge derives the buy_in_reference when
  // the sweep fires it without one (JSE-SRL buy-in convention).
  timers: [{ onState: 'investigating', after: { days: 4 }, fire: 'instruct_buy_in', kind: 'time_bar' }],
};
