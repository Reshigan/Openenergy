// sustainability_transaction — a bilateral sustainability-instrument trade as
// data. A buyer proposes a purchase of a sustainability instrument (REC, verified
// carbon credit, green attribute) against a named seller; the seller quotes a
// price; the buyer accepts; the parties execute on evidence; settlement is
// RECORDED, not moved.
//
// The commercial spine is structural: execute ONLY leaves `accepted`, and the
// ONLY path into `accepted` is buyer acceptance of a quote. So a transaction can
// NEVER be executed on an un-accepted proposal — no guard needed, the state graph
// enforces it. Two more business rules ride real guards: complianceHaltClear
// blocks opening a new commitment under a platform halt, counterpartyDistinct
// forbids self-dealing (buyer ≠ seller), and executionEvidencePresent forces a
// board-approval + legal-counterparty ref before execution.
//
// settles:false — the ledger row is a record-only custody notice; no custody or
// payment rail moves value here (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure materiality bucketing off the computed notional. No clock, no env.
const materialityTier = (notional: Json | undefined): string => {
  if (typeof notional !== 'number' || notional <= 0) return 'unpriced';
  if (notional >= 1_000_000) return 'strategic';
  if (notional >= 100_000) return 'material';
  return 'routine';
};

// pure notional: quantity × unit_price when both are numbers, else 0.
const notionalOf = (fields: Record<string, Json>): number => {
  const q = fields.quantity;
  const p = fields.unit_price;
  return typeof q === 'number' && typeof p === 'number' ? q * p : 0;
};

export const sustainabilityTransaction: ChainDecl = {
  key: 'sustainability_transaction',
  noun: 'Sustainability transaction',
  refPrefix: 'ST',
  title: (f) =>
    `${(f.instrument as string) ?? 'instrument'} × ${(f.quantity as number) ?? 0} — ${(f.registry as string) ?? 'OTC'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act 2019', provision: 's13 offset allowance & instrument transfer', effect: 'authorises' },
    { instrument: 'JSE-SRL', provision: 'sustainability instrument trading conduct', effect: 'requires' },
  ],
  roles: ['buyer', 'seller', 'regulator', 'operator'],

  fields: {
    transaction_ref: { type: 'string', label: 'Transaction ref' },
    buyer_party: { type: 'party', role: 'buyer', label: 'Buyer' },
    seller_party: { type: 'party', role: 'seller', label: 'Seller' },
    operator_party: { type: 'party', role: 'operator', label: 'Settling operator' },
    instrument: { type: 'string', required: true, label: 'Instrument (REC/carbon_credit/green_attribute)' },
    registry: { type: 'string', label: 'Registry' },
    vintage: { type: 'string', label: 'Vintage' },
    quantity: { type: 'number', required: true, min: 0, label: 'Quantity' },
    unit: { type: 'string', label: 'Unit (MWh/tCO2e)' },
    currency: { type: 'string', label: 'Currency' },
    unit_price: { type: 'number', min: 0, label: 'Unit price' },
    notional: { type: 'number', label: 'Notional' },
    materiality_tier: { type: 'string', label: 'Materiality tier' },
    // execution evidence (read by executionEvidencePresent)
    board_approval_ref: { type: 'string', label: 'Board approval ref' },
    legal_counterparty_ref: { type: 'string', label: 'Legal counterparty ref' },
    // written by derive, never by the client
    transaction_date: { type: 'string', label: 'Transaction date' },
    executed_at: { type: 'string', label: 'Executed at' },
    settled_at: { type: 'string', label: 'Settlement recorded at' },
  },

  initial: 'proposed',

  states: {
    proposed: { label: 'Proposed', terminal: false, holder: 'seller', sla: { hours: 24 } },
    quoted: { label: 'Quoted', terminal: false, holder: 'buyer', sla: { hours: 24 } },
    accepted: { label: 'Accepted', terminal: false, holder: 'seller', sla: { hours: 12 } },
    executed: { label: 'Executed', terminal: false, holder: 'operator', sla: { hours: 24 } },
    settlement_recorded: { label: 'Settlement recorded', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    voided: { label: 'Voided', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'proposed',
      by: ['buyer', 'operator'],
      actorBecomes: 'buyer',
      label: 'Propose transaction',
      intent: 'primary',
      input: {
        instrument: { type: 'string', required: true },
        registry: { type: 'string' },
        vintage: { type: 'string' },
        quantity: { type: 'number', required: true, min: 0 },
        unit: { type: 'string' },
        currency: { type: 'string' },
        seller_party: { type: 'party', role: 'seller' },
        operator_party: { type: 'party', role: 'operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // a platform-wide compliance halt blocks opening a new commitment.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ transaction_date: isoUtc(at) }),
    },
    {
      id: 'quote',
      from: 'proposed',
      to: 'quoted',
      by: ['seller'],
      label: 'Quote price',
      intent: 'primary',
      input: { unit_price: { type: 'number', required: true, min: 0 } },
      // no self-dealing: buyer and seller must be distinct entities.
      guards: ['counterpartyDistinct'],
      derive: (f, _at: Instant) => {
        const notional = notionalOf(f);
        return { notional, materiality_tier: materialityTier(notional) };
      },
    },
    {
      id: 'accept',
      from: 'quoted',
      to: 'accepted',
      by: ['buyer'],
      label: 'Accept quote',
      intent: 'primary',
      guards: [],
    },
    {
      // structural commercial gate: the ONLY edge into `executed`, and it can only
      // fire from `accepted`. A transaction therefore cannot execute on an
      // un-accepted proposal. Execution needs board + legal evidence on the edge.
      id: 'execute',
      from: 'accepted',
      to: 'executed',
      by: ['seller', 'operator'],
      label: 'Execute transaction',
      intent: 'primary',
      input: {
        // present-but-not-required so an absent ref surfaces the guard's
        // MISSING_BOARD_APPROVAL / MISSING_LEGAL_COUNTERPARTY, not BAD_INPUT (Pattern A).
        board_approval_ref: { type: 'string' },
        legal_counterparty_ref: { type: 'string' },
      },
      guards: ['executionEvidencePresent'],
      derive: (_f, at: Instant) => ({ executed_at: isoUtc(at) }),
    },
    {
      id: 'record_settlement',
      from: 'executed',
      to: 'settlement_recorded',
      by: ['operator'],
      label: 'Record settlement',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ settled_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['proposed', 'quoted'],
      to: 'rejected',
      by: ['seller'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['price_unacceptable', 'instrument_unavailable', 'counterparty_ineligible', 'terms_inadequate'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['proposed', 'quoted', 'accepted'],
      to: 'withdrawn',
      by: ['buyer', 'system'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['quote_expired', 'budget_withdrawn', 'no_longer_required', 'sourced_elsewhere'],
      guards: [],
    },
    {
      id: 'void_transaction',
      from: ['accepted', 'executed'],
      to: 'voided',
      by: ['operator', 'regulator'],
      label: 'Void transaction',
      intent: 'destructive',
      requiresReason: ['compliance_breach', 'sanctions_hit', 'double_count_detected', 'instrument_invalidated'],
      guards: [],
    },
  ],

  // quote-validity time-bar: an unaccepted quote stales out (a price cannot be
  // held indefinitely). record-only stub; the sweep computes the real bar off the
  // state sla hours (ppa_contract / permit_to_work pattern).
  timers: [{ onState: 'quoted', after: { hours: 48 }, fire: 'withdraw', kind: 'time_bar', reason: 'quote_expired' }],
};
