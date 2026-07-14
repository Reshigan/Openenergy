// imbalance — balancing-settlement imbalance lifecycle as data.
//
// A settlement agent (System Operator) raises an imbalance against a market
// counterparty (Balance Responsible Party) for one settlement period: metered
// energy vs scheduled energy. calculate_imbalance derives the quantum (metered −
// scheduled), its direction (long/short), a cash-out tier and an indicative
// value; publish_statement renders the statement to the counterparty, who may
// dispute inside the window. confirm_settlement closes it.
//
// The statement spine is STRUCTURAL: confirm_settlement leaves ONLY
// statement_published or dispute_resolved, and the ONLY path into
// statement_published is publish_statement (from calculated). So a settlement can
// NEVER be confirmed before the imbalance is calculated AND the statement is
// published — no guard needed, the state graph enforces it.
//
// NO guards: none of the ten registry guards answer a business question this
// chain asks (no regulator-severity crossing, no evidence ref, no serial range).
// Distinctness/authority are enforced structurally + by requiresReason on exits.
//
// settles:false — the statement is a record-only NOTICE (R-S5-1). No custody,
// no payment rails: money movement happens in external banking, not here.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const num = (v: Json | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const round2 = (n: number): number => Math.round(n * 100) / 100;

// imbalance direction from the signed quantum (metered − scheduled).
const direction = (mwh: number): string => (mwh > 0 ? 'long' : mwh < 0 ? 'short' : 'balanced');

// cash-out quantum tier off the absolute deviation (MWh). Pure bucketing.
const tierForQuantum = (absMwh: number): string => {
  if (absMwh < 1) return 'de_minimis';
  if (absMwh < 10) return 'minor';
  if (absMwh < 100) return 'material';
  return 'major';
};

export const imbalance: ChainDecl = {
  key: 'imbalance',
  noun: 'Imbalance settlement',
  refPrefix: 'IMBA',
  title: (f) =>
    `Imbalance ${(f.settlement_period as string) ?? 'period'} — ${(f.imbalance_direction as string) ?? 'pending'}` +
    (typeof f.imbalance_mwh === 'number' ? ` ${f.imbalance_mwh} MWh` : ''),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'Metering Code + System Operator balancing settlement', effect: 'requires' },
    { instrument: 'Electricity Regulation Act 2006', provision: 's4 tariff & settlement oversight', effect: 'authorises' },
  ],
  roles: ['settlement_agent', 'counterparty', 'regulator'],

  fields: {
    statement_ref: { type: 'string', label: 'External statement ref' },
    settlement_agent_party: { type: 'party', role: 'settlement_agent', label: 'Settlement agent' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Counterparty (BRP)' },
    settlement_period: { type: 'string', required: true, label: 'Settlement period' },
    metering_point: { type: 'string', label: 'Metering point' },
    metered_mwh: { type: 'number', required: true, label: 'Metered energy (MWh)' },
    scheduled_mwh: { type: 'number', required: true, label: 'Scheduled energy (MWh)' },
    imbalance_price_zar_per_mwh: { type: 'number', min: 0, required: true, label: 'Imbalance price (ZAR/MWh)' },
    dispute_note: { type: 'string', label: 'Dispute note' },
    // written by derive, never by the client
    imbalance_mwh: { type: 'number', label: 'Imbalance quantum (MWh)' },
    imbalance_direction: { type: 'string', label: 'Direction (long/short/balanced)' },
    imbalance_value_zar: { type: 'number', label: 'Indicative value (ZAR)' },
    imbalance_tier: { type: 'string', label: 'Quantum tier' },
    calculated_at: { type: 'string', label: 'Calculated at' },
    published_at: { type: 'string', label: 'Statement published at' },
    resolved_at: { type: 'string', label: 'Dispute resolved at' },
    confirmed_at: { type: 'string', label: 'Settlement confirmed at' },
  },

  initial: 'raised',

  states: {
    raised: { label: 'Raised', terminal: false, holder: 'settlement_agent', sla: { hours: 24 } },
    calculated: { label: 'Calculated', terminal: false, holder: 'settlement_agent', sla: { hours: 12 } },
    statement_published: { label: 'Statement published', terminal: false, holder: 'counterparty', sla: { days: 5 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'settlement_agent', sla: { days: 5 } },
    dispute_resolved: { label: 'Dispute resolved', terminal: false, holder: 'settlement_agent', sla: { hours: 24 } },
    settlement_confirmed: { label: 'Settlement confirmed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
    written_off: { label: 'Written off', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'raised',
      by: ['settlement_agent'],
      actorBecomes: 'settlement_agent',
      label: 'Raise imbalance',
      intent: 'primary',
      input: {
        settlement_period: { type: 'string', required: true },
        metering_point: { type: 'string' },
        metered_mwh: { type: 'number', required: true },
        scheduled_mwh: { type: 'number', required: true },
        imbalance_price_zar_per_mwh: { type: 'number', min: 0, required: true },
        statement_ref: { type: 'string' },
        counterparty_party: { type: 'party', role: 'counterparty', required: true },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'calculate_imbalance',
      from: 'raised',
      to: 'calculated',
      by: ['settlement_agent'],
      label: 'Calculate imbalance',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => {
        const quantum = round2(num(f.metered_mwh) - num(f.scheduled_mwh));
        const abs = Math.abs(quantum);
        return {
          imbalance_mwh: quantum,
          imbalance_direction: direction(quantum),
          imbalance_value_zar: round2(abs * num(f.imbalance_price_zar_per_mwh)),
          imbalance_tier: tierForQuantum(abs),
          calculated_at: isoUtc(at),
        };
      },
    },
    {
      // structural statement gate: the ONLY edge into statement_published, and it
      // can only fire from calculated. confirm_settlement (below) leaves ONLY
      // statement_published / dispute_resolved — so a settlement cannot confirm
      // before its statement is published. No guard.
      id: 'publish_statement',
      from: 'calculated',
      to: 'statement_published',
      by: ['settlement_agent'],
      label: 'Publish statement',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ published_at: isoUtc(at) }),
    },
    {
      id: 'dispute',
      from: 'statement_published',
      to: 'disputed',
      by: ['counterparty'],
      label: 'Dispute statement',
      intent: 'secondary',
      input: { dispute_note: { type: 'string', required: true } },
      requiresReason: ['metering_error', 'schedule_error', 'price_error', 'period_error'],
      guards: [],
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'dispute_resolved',
      by: ['settlement_agent'],
      label: 'Resolve dispute',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
    {
      id: 'confirm_settlement',
      from: ['statement_published', 'dispute_resolved'],
      to: 'settlement_confirmed',
      by: ['settlement_agent', 'system'],
      label: 'Confirm settlement',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ confirmed_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'cancel',
      from: ['raised', 'calculated', 'statement_published', 'disputed', 'dispute_resolved'],
      to: 'cancelled',
      by: ['settlement_agent'],
      label: 'Cancel imbalance',
      intent: 'destructive',
      requiresReason: ['raised_in_error', 'duplicate', 'superseded_run'],
      guards: [],
    },
    {
      id: 'write_off',
      from: ['statement_published', 'dispute_resolved'],
      to: 'written_off',
      by: ['settlement_agent', 'regulator'],
      label: 'Write off',
      intent: 'destructive',
      requiresReason: ['de_minimis', 'uncollectable', 'regulatory_waiver'],
      guards: [],
    },
  ],

  // dispute-window time-bar: an unchallenged published statement is deemed
  // accepted once the window closes (SA balancing settlement). record-only stub;
  // the sweep computes the real bar off the state sla days (ppa_contract pattern).
  timers: [{ onState: 'statement_published', after: { days: 14 }, fire: 'confirm_settlement', kind: 'time_bar' }],
};
