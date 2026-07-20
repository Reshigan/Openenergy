// ppa_annual_recon — PPA annual settlement reconciliation as data.
//
// Once a year the IPP (seller) and offtaker (buyer) reconcile the metered
// energy delivered under a PPA against the contracted volume and true up the
// resulting rand figure. This chain is the RECORD of that reconciliation
// exercise: seller initiates → gathers meter data → computes the variance and
// reconciled amount → buyer agrees → a settlement instruction is RECORDED.
//
// settles:false — RECORD ONLY. This chain moves no money and holds no custody.
// `settled_instructed` is the terminal state and it names an *instruction*, not
// a finality: the actual payment leaves through the ledger/payment rail, which
// this domain does not model. The export always carries the record-only notice.
//
// Structural honesty gate: the ONLY path to `agreed` is `agree` from `computed`,
// and the ONLY path to `settled_instructed` is `instruct_settlement` from
// `agreed`. So a settlement instruction can never be recorded before the buyer
// has agreed a figure that was actually computed — the state graph enforces it,
// no guard needed. A disputed figure detours through `disputed` → recompute and
// cannot reach settlement while the dispute is open.
//
// No new guards were invented: counterpartyDistinct (an existing guard) fences
// self-reconciliation at open; everything else is structural or reason-coded.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure variance: metered minus contracted. No clock, no env — deterministic
// over the merged fields the engine hands derive.
const varianceMwh = (metered: Json | undefined, contracted: Json | undefined): Json =>
  typeof metered === 'number' && typeof contracted === 'number' ? metered - contracted : null;

export const ppaAnnualRecon: ChainDecl = {
  key: 'ppa_annual_recon',
  noun: 'PPA annual reconciliation',
  refPrefix: 'PPAR',
  title: (f) => `PPAR ${(f.reconciliation_year as number) ?? '—'} — ${(f.buyer_name as string) ?? 'unnamed'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's34 PPA settlement', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'Metering Code — settlement metering & reconciliation', effect: 'requires' },
  ],
  roles: ['seller', 'buyer', 'operator'],

  fields: {
    reconciliation_year: { type: 'number', required: true, min: 2000, max: 2100, label: 'Reconciliation year' },
    buyer_name: { type: 'string', required: true, label: 'Offtaker (buyer)' },
    buyer_party: { type: 'party', role: 'buyer', label: 'Offtaker party' },
    contracted_mwh: { type: 'number', min: 0, label: 'Contracted (MWh)' },
    metered_mwh: { type: 'number', min: 0, label: 'Metered (MWh)' },
    reconciled_amount_zar: { type: 'number', label: 'Reconciled true-up (ZAR)' },
    // written by derive, never by the client
    variance_mwh: { type: 'number', label: 'Variance (MWh)' },
    computed_at: { type: 'string', label: 'Computed at' },
    agreed_at: { type: 'string', label: 'Agreed at' },
    instructed_at: { type: 'string', label: 'Settlement instructed at' },
  },

  initial: 'initiated',

  states: {
    // NO SETTLEMENT FINALITY — RECORD ONLY (settled_instructed records an
    // instruction; the payment rail lives outside this chain).
    initiated: { label: 'Initiated', terminal: false, holder: 'seller', sla: { days: 14 } },
    data_gathering: { label: 'Gathering meter data', terminal: false, holder: 'seller', sla: { days: 30 } },
    computed: { label: 'Computed', terminal: false, holder: 'buyer', sla: { days: 21 } },
    agreed: { label: 'Agreed', terminal: false, holder: 'seller', sla: { days: 7 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'operator', sla: { days: 30 } },
    settled_instructed: { label: 'Settlement instructed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    // --- creation -----------------------------------------------------------
    {
      id: 'open',
      from: '@new',
      to: 'initiated',
      by: ['seller', 'operator'],
      actorBecomes: 'seller',
      label: 'Initiate reconciliation',
      intent: 'primary',
      input: {
        reconciliation_year: { type: 'number', required: true, min: 2000, max: 2100 },
        buyer_name: { type: 'string', required: true },
        buyer_party: { type: 'party', role: 'buyer' },
        contracted_mwh: { type: 'number', min: 0 },
      },
      // seller and buyer must be distinct legal entities — no self-reconciliation.
      guards: ['counterpartyDistinct'],
    },

    // --- happy path ---------------------------------------------------------
    { id: 'begin_gathering', from: 'initiated', to: 'data_gathering', by: ['seller', 'operator'], label: 'Begin data gathering', intent: 'primary', guards: [] },
    {
      id: 'compute',
      from: 'data_gathering',
      to: 'computed',
      by: ['seller', 'operator'],
      label: 'Compute reconciliation',
      intent: 'primary',
      input: {
        metered_mwh: { type: 'number', required: true, min: 0 },
        reconciled_amount_zar: { type: 'number', required: true },
      },
      guards: [],
      derive: (f, at: Instant) => ({ variance_mwh: varianceMwh(f.metered_mwh, f.contracted_mwh), computed_at: isoUtc(at) }),
    },
    {
      // structural gate: the ONLY edge into `agreed`, only from `computed`.
      id: 'agree',
      from: 'computed',
      to: 'agreed',
      by: ['buyer'],
      label: 'Agree reconciliation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ agreed_at: isoUtc(at) }),
    },
    {
      // structural gate: the ONLY edge into settled_instructed, only from agreed.
      // RECORD ONLY — records that a settlement was instructed, not that it settled.
      id: 'instruct_settlement',
      from: 'agreed',
      to: 'settled_instructed',
      by: ['seller', 'buyer', 'operator'],
      label: 'Record settlement instruction',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ instructed_at: isoUtc(at) }),
    },

    // --- dispute loop -------------------------------------------------------
    {
      id: 'dispute',
      from: ['computed', 'agreed'],
      to: 'disputed',
      by: ['buyer', 'seller', 'operator', 'system'],
      label: 'Dispute figure',
      intent: 'destructive',
      requiresReason: ['metering_discrepancy', 'tariff_dispute', 'volume_mismatch', 'data_incomplete', 'calculation_error', 'no_response'],
      guards: [],
    },
    // resolution sends it back to data_gathering so the figure is re-derived
    // from corrected meter data — a disputed number can never leak to settlement.
    { id: 'resolve', from: 'disputed', to: 'data_gathering', by: ['seller', 'operator'], label: 'Resolve & recompute', intent: 'primary', guards: [] },

    // --- exits --------------------------------------------------------------
    {
      id: 'cancel',
      from: ['initiated', 'data_gathering', 'disputed'],
      to: 'cancelled',
      by: ['seller', 'operator', 'system'],
      label: 'Cancel reconciliation',
      intent: 'destructive',
      requiresReason: ['ppa_terminated', 'superseded', 'duplicate', 'no_activity'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['computed'],
      to: 'withdrawn',
      by: ['seller', 'operator'],
      label: 'Withdraw computed figure',
      intent: 'destructive',
      requiresReason: ['restatement_required', 'error_found', 'buyer_request'],
      guards: [],
    },
  ],

  timers: [
    // a computed figure left un-agreed by the buyer stales into dispute for review.
    { onState: 'computed', after: { days: 21 }, fire: 'dispute', kind: 'time_bar', reason: 'no_response' },
    // a gathering exercise with no compute stales out.
    { onState: 'data_gathering', after: { days: 30 }, fire: 'cancel', kind: 'time_bar', reason: 'no_activity' },
  ],
};
