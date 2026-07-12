// take_or_pay — take-or-pay minimum-offtake reconciliation as data.
//
// A PPA's take-or-pay clause obliges the buyer (offtaker) to pay for a
// contracted minimum energy volume whether or not it physically offtakes it.
// Each delivery period, the seller (IPP) measures actual offtake, and the
// reconciliation either CLOSES as met (actual ≥ contracted minimum) or computes
// a shortfall and INSTRUCTS a take-or-pay invoice for the deemed-taken volume.
//
// Settlement-honesty stance: settles:false — this chain RECORDS the shortfall
// obligation, it does NOT move money. The terminal money state is
// `invoiced_instructed` (suffix per the wave rule): an invoice instruction is
// raised, never a receipt. No custody, no payment rail, no finality here.
//
// Structural spine (no guard needed — none exists for arithmetic comparison):
//   invoiced_instructed is reachable ONLY from shortfall_computed, which is
//   reachable ONLY from volume_measured. So a take-or-pay invoice can NEVER be
//   instructed for a period whose volume was never measured and whose shortfall
//   was never computed — the state graph enforces the audit order, exactly like
//   permit_to_work's isolation gate. Whether a measured period is met vs short
//   is a recorded reconciliation judgement (two exits from volume_measured), not
//   a machine-enforced arithmetic test — the registry has no comparison guard.
//
// NO complianceHaltClear: a reconciliation is a record of what already happened;
// a platform halt must not erase the ability to record a period's shortfall (wo
// precedent — a halt never blocks an operational/record-only truth).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

/** deemed shortfall = max(0, contracted_min − actual). Pure arithmetic. */
const shortfallMwh = (contracted: Json | undefined, actual: Json | undefined): number => {
  if (typeof contracted !== 'number' || typeof actual !== 'number') return 0;
  const diff = contracted - actual;
  return diff > 0 ? diff : 0;
};

export const takeOrPay: ChainDecl = {
  key: 'take_or_pay',
  noun: 'Take-or-pay reconciliation',
  refPrefix: 'TOPY',
  title: (f) => `Take-or-pay ${(f.period_label as string) ?? '—'} — ${(f.buyer_name as string) ?? 'unnamed'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's34 PPA take-or-pay term', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'metering & settlement code (measured offtake)', effect: 'requires' },
  ],
  roles: ['seller', 'buyer', 'operator'],

  fields: {
    period_label: { type: 'string', required: true, label: 'Delivery period (e.g. 2026-Q2)' },
    buyer_name: { type: 'string', required: true, label: 'Buyer / offtaker' },
    buyer_party: { type: 'party', role: 'buyer', label: 'Buyer participant' },
    contracted_mwh: { type: 'number', required: true, min: 0, label: 'Contracted minimum (MWh)' },
    take_or_pay_rate_zar_mwh: { type: 'number', min: 0, label: 'Take-or-pay rate (ZAR/MWh)' },
    actual_mwh: { type: 'number', min: 0, label: 'Metered actual offtake (MWh)' },
    // written by derive, never by the client
    measured_at: { type: 'string', label: 'Volume measured at' },
    shortfall_mwh: { type: 'number', label: 'Deemed shortfall (MWh)' },
    computed_at: { type: 'string', label: 'Shortfall computed at' },
    shortfall_charge_zar: { type: 'number', label: 'Take-or-pay charge (ZAR)' },
    invoiced_at: { type: 'string', label: 'Invoice instructed at' },
  },

  initial: 'period_open',

  states: {
    // NO SETTLEMENT FINALITY — RECORD ONLY (see invoiced_instructed below).
    period_open: { label: 'Period open', terminal: false, holder: 'seller', sla: { days: 30 } },
    volume_measured: { label: 'Volume measured', terminal: false, holder: 'seller', sla: { days: 7 } },
    shortfall_computed: { label: 'Shortfall computed', terminal: false, holder: 'seller', sla: { days: 14 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'operator', sla: { days: 30 } },
    // NO SETTLEMENT FINALITY — RECORD ONLY: an invoice instruction, not a receipt.
    invoiced_instructed: { label: 'Invoice instructed', terminal: true, holder: 'none' },
    met_closed: { label: 'Met — closed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'period_open',
      by: ['seller', 'operator'],
      actorBecomes: 'seller',
      label: 'Open period',
      intent: 'primary',
      input: {
        period_label: { type: 'string', required: true },
        buyer_name: { type: 'string', required: true },
        buyer_party: { type: 'party', role: 'buyer' },
        contracted_mwh: { type: 'number', required: true, min: 0 },
        take_or_pay_rate_zar_mwh: { type: 'number', min: 0 },
      },
      // seller and buyer must be distinct legal entities (no self-dealing).
      guards: ['counterpartyDistinct'],
    },

    // --- reconciliation path -------------------------------------------------
    {
      id: 'measure_volume',
      from: 'period_open',
      to: 'volume_measured',
      by: ['seller', 'operator'],
      label: 'Record metered offtake',
      intent: 'primary',
      input: { actual_mwh: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ measured_at: isoUtc(at) }),
    },
    {
      // structural: shortfall can only be computed AFTER a measurement exists.
      id: 'compute_shortfall',
      from: 'volume_measured',
      to: 'shortfall_computed',
      by: ['seller', 'operator'],
      label: 'Compute shortfall',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => ({
        shortfall_mwh: shortfallMwh(f.contracted_mwh, f.actual_mwh),
        computed_at: isoUtc(at),
      }),
    },
    {
      // met: measured offtake satisfied the minimum — no take-or-pay charge.
      id: 'mark_met',
      from: 'volume_measured',
      to: 'met_closed',
      by: ['buyer', 'operator'],
      label: 'Mark minimum met',
      intent: 'primary',
      guards: [],
    },
    {
      // structural money-gate: the ONLY edge into invoiced_instructed, and it can
      // only fire from shortfall_computed. No invoice without a computed shortfall.
      id: 'invoice',
      from: 'shortfall_computed',
      to: 'invoiced_instructed',
      by: ['seller', 'operator'],
      label: 'Instruct take-or-pay invoice',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant): Record<string, Json> => ({
        shortfall_charge_zar:
          (typeof f.shortfall_mwh === 'number' ? f.shortfall_mwh : 0) *
          (typeof f.take_or_pay_rate_zar_mwh === 'number' ? f.take_or_pay_rate_zar_mwh : 0),
        invoiced_at: isoUtc(at),
      }),
    },

    // --- dispute loop --------------------------------------------------------
    {
      id: 'dispute',
      from: ['shortfall_computed', 'invoiced_instructed'],
      to: 'disputed',
      by: ['buyer', 'operator'],
      label: 'Dispute reconciliation',
      intent: 'destructive',
      requiresReason: ['metering_disputed', 'contracted_minimum_disputed', 'rate_disputed', 'force_majeure'],
      guards: [],
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'shortfall_computed',
      by: ['seller', 'buyer', 'operator'],
      label: 'Resolve dispute',
      intent: 'primary',
      guards: [],
    },

    // --- exit ----------------------------------------------------------------
    {
      id: 'cancel',
      from: ['period_open', 'volume_measured'],
      to: 'cancelled',
      by: ['seller', 'operator'],
      label: 'Cancel period',
      intent: 'destructive',
      requiresReason: ['ppa_terminated', 'period_superseded', 'opened_in_error', 'no_offtake_obligation'],
      guards: [],
    },
  ],

  // record-only SLA stubs; the sweep computes the real bar off each state's sla.
  timers: [
    { onState: 'period_open', after: { days: 0 }, fire: 'cancel', kind: 'sla' },
    { onState: 'shortfall_computed', after: { days: 0 }, fire: 'invoice', kind: 'sla' },
  ],
};
