// virtual_ppa_settlement — Virtual PPA (contract-for-difference) settlement
// lifecycle as data.
//
// A VPPA is a financial CfD: no electrons move between generator and offtaker.
// Each settlement period the calculation agent computes the strike, reads the
// market reference price, and nets the difference — (strike − reference) ×
// volume — payable one way. Positive ⇒ generator_receives (market below
// strike), negative ⇒ generator_pays.
//
// SETTLEMENT-HONESTY STANCE: settles:false. This chain RECORDS the CfD
// difference and INSTRUCTS a settlement — it never moves money and holds no
// custody. The terminal money state is `settled_instructed` (the *_instructed
// suffix is deliberate) — an instruction handed to a payment rail this platform
// does not own. NO SETTLEMENT FINALITY here.
//
// Structural note: the only path to settled_instructed runs
// period_open → strike_computed → difference_computed → instruct_settlement,
// so a settlement can NEVER be instructed before both the strike AND the
// reference-priced difference are on the record. The state graph enforces the
// compute-before-instruct ordering; no guard is needed for it.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// Pure CfD net: no clock, no env. Given the period strike, market reference and
// volume, returns the ZAR difference and its direction. Missing/!number inputs
// yield {} so derive never stamps a partial number.
function cfdSettlement(
  strike: Json | undefined,
  reference: Json | undefined,
  volume: Json | undefined,
): Record<string, Json> {
  if (typeof strike !== 'number' || typeof reference !== 'number' || typeof volume !== 'number') return {};
  const difference_zar = (strike - reference) * volume;
  const settlement_direction =
    difference_zar > 0 ? 'generator_receives' : difference_zar < 0 ? 'generator_pays' : 'net_zero';
  return { difference_zar, settlement_direction };
}

export const virtualPpaSettlement: ChainDecl = {
  key: 'virtual_ppa_settlement',
  noun: 'Virtual PPA CfD settlement',
  refPrefix: 'VPPA',
  title: (f) =>
    `VPPA CfD — ${(f.contract_ref as string) ?? 'unref'} ${(f.period_start as string) ?? ''}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Markets Act 19 of 2012', provision: 'OTC derivative — CfD reporting to a trade repository', effect: 'requires' },
    { instrument: 'ISDA Master Agreement', provision: 'CfD confirmation — net cash settlement, no physical delivery', effect: 'authorises' },
  ],
  roles: ['generator', 'offtaker', 'operator'],

  fields: {
    contract_ref: { type: 'string', required: true, label: 'VPPA contract ref' },
    period_start: { type: 'string', required: true, label: 'Settlement period start' },
    period_end: { type: 'string', required: true, label: 'Settlement period end' },
    offtaker_party: { type: 'party', role: 'offtaker', label: 'Offtaker (CfD counterparty)' },
    strike_zar_mwh: { type: 'number', min: 0, label: 'Strike price (ZAR/MWh)' },
    reference_zar_mwh: { type: 'number', min: 0, label: 'Market reference price (ZAR/MWh)' },
    volume_mwh: { type: 'number', min: 0, label: 'Settled volume (MWh)' },
    // written by derive, never by the client
    strike_computed_at: { type: 'string', label: 'Strike computed at' },
    difference_zar: { type: 'number', label: 'CfD difference (ZAR)' },
    settlement_direction: { type: 'string', label: 'Direction (generator_receives/generator_pays/net_zero)' },
    difference_computed_at: { type: 'string', label: 'Difference computed at' },
    settled_at: { type: 'string', label: 'Settlement instructed at' },
  },

  initial: 'period_open',

  states: {
    // NO SETTLEMENT FINALITY — RECORD ONLY (see settled_instructed below).
    period_open: { label: 'Period open', terminal: false, holder: 'generator', sla: { days: 5 } },
    strike_computed: { label: 'Strike computed', terminal: false, holder: 'offtaker', sla: { days: 3 } },
    difference_computed: { label: 'Difference computed', terminal: false, holder: 'offtaker', sla: { days: 5 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'operator', sla: { days: 30 } },
    // NO SETTLEMENT FINALITY — RECORD ONLY: an instruction to an external
    // payment rail, not custody of funds and not a completed transfer.
    settled_instructed: { label: 'Settlement instructed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'period_open',
      by: ['generator', 'operator'],
      actorBecomes: 'generator',
      label: 'Open settlement period',
      intent: 'primary',
      input: {
        contract_ref: { type: 'string', required: true },
        period_start: { type: 'string', required: true },
        period_end: { type: 'string', required: true },
        offtaker_party: { type: 'party', role: 'offtaker' },
      },
      guards: ['counterpartyDistinct'],
    },

    // --- compute chain (strike → difference) --------------------------------
    {
      id: 'compute_strike',
      from: 'period_open',
      to: 'strike_computed',
      by: ['generator', 'offtaker', 'operator'],
      label: 'Compute strike',
      intent: 'primary',
      input: { strike_zar_mwh: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ strike_computed_at: isoUtc(at) }),
    },
    {
      id: 'compute_difference',
      from: 'strike_computed',
      to: 'difference_computed',
      by: ['generator', 'offtaker', 'operator'],
      label: 'Compute CfD difference',
      intent: 'primary',
      input: {
        reference_zar_mwh: { type: 'number', required: true, min: 0 },
        volume_mwh: { type: 'number', required: true, min: 0 },
      },
      guards: [],
      derive: (f, at: Instant) => ({
        ...cfdSettlement(f.strike_zar_mwh, f.reference_zar_mwh, f.volume_mwh),
        difference_computed_at: isoUtc(at),
      }),
    },

    // --- terminal money instruction (RECORD ONLY) ---------------------------
    {
      id: 'instruct_settlement',
      from: 'difference_computed',
      to: 'settled_instructed',
      by: ['offtaker', 'operator', 'system'],
      label: 'Instruct settlement',
      intent: 'primary',
      // a platform-wide compliance halt blocks NEW money instructions.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ settled_at: isoUtc(at) }),
    },

    // --- dispute loop -------------------------------------------------------
    {
      id: 'dispute',
      from: 'difference_computed',
      to: 'disputed',
      by: ['generator', 'offtaker'],
      label: 'Dispute difference',
      intent: 'destructive',
      requiresReason: ['reference_price_error', 'volume_mismatch', 'strike_indexation_error', 'metering_discrepancy'],
      guards: [],
    },
    {
      id: 'resolve',
      from: 'disputed',
      to: 'difference_computed',
      by: ['generator', 'offtaker', 'operator'],
      label: 'Resolve dispute',
      intent: 'primary',
      guards: [],
    },

    // --- exit ---------------------------------------------------------------
    {
      id: 'cancel',
      from: ['period_open', 'strike_computed', 'difference_computed', 'disputed'],
      to: 'cancelled',
      by: ['generator', 'offtaker', 'operator', 'system'],
      label: 'Cancel period',
      intent: 'destructive',
      requiresReason: ['contract_terminated', 'period_superseded', 'duplicate_period', 'mutual_agreement'],
      guards: [],
    },
  ],

  // SLA time-bars. Record-only stubs (ppa_contract/permit_to_work pattern): the
  // sweep computes the real bar off each state's sla; the fired edge id is the
  // one a sweep would run, subject to normal authz.
  timers: [
    { onState: 'period_open', after: { days: 30 }, fire: 'cancel', kind: 'time_bar', reason: 'period_superseded' },
    { onState: 'difference_computed', after: { days: 5 }, fire: 'instruct_settlement', kind: 'sla' },
  ],
};
