// imbalance_settlement — Grid wholesale MTU (market time unit) imbalance
// settlement: the financial back end of the balancing mechanism, as data.
//
// System Operator (SO/grid) opens a settlement period against a Balance
// Responsible Party (BRP), receives actual metered MWh, reconciles it
// against nominated MWh, computes the per-MTU imbalance, prices it
// (long/short imbalance price × penalty multiplier), invoices the BRP,
// runs a dispute window, and settles. A raised dispute suspends invoicing
// until resolved and re-priced; unpaid invoices age into arrears on a
// cron sweep; any non-terminal period can be cancelled with a reason.
//
// Sister of oe_dispatch_nominations (W13, the PRE side — nominated MWh per
// MTU); this chain is the POST side — actual-vs-nominated settlement.
//
// Structural honesty (no invented guards):
//  - `mark_settled` is only reachable from `payment_pending`, and the only
//    path into `payment_pending` is `record_payment` — so a period can
//    NEVER settle without a recorded payment. No guard needed.
//  - `issue_invoice` is only reachable from `priced` or `invoice_revised`,
//    both of which carry a computed charge/penalty — a period can NEVER be
//    invoiced without going through pricing first. No guard needed.
//  - `open` is guarded by counterpartyDistinct (SO ≠ BRP — no
//    self-settlement) and complianceHaltClear (no new settlement periods
//    opened under a platform-wide compliance halt) — the same pair
//    oe_dispatch_nominations uses on its opening edge.
//  - every downstream edge is unguarded: these are SO/BRP/regulator
//    operational steps the state graph already gates by position.
//
// settles:true — charge_zar/penalty_zar/total_owed_zar are the actual
// imbalance settlement amounts this chain computes and posts to the BRP
// (quantumCol total_owed_zar in the legacy descriptor); this IS the money
// movement, not a record of one happening elsewhere.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const num = (v: Json | undefined): number => (typeof v === 'number' ? v : 0);
const bool = (v: Json | undefined): boolean => v === true || v === 1;

type Tier = 'minor' | 'standard' | 'material' | 'systemic';

// pure quantum→tier bucketing (no clock, no env).
const tierForQuantum = (q: number): Tier =>
  q >= 10_000_000 ? 'systemic' : q >= 1_000_000 ? 'material' : q >= 100_000 ? 'standard' : 'minor';

const FLOOR_KEYS = [
  'imbalance_floor_flag_high_voltage_brp',
  'imbalance_floor_flag_system_critical_period',
  'imbalance_floor_flag_regulator_audit_period',
  'imbalance_floor_flag_market_suspension_active',
  'imbalance_floor_flag_repeated_breach_5plus',
] as const;

// FLOOR-AT-SYSTEMIC on HV BRP / system-critical-period; FLOOR-AT-MATERIAL
// on any single other flag; 2+ flags of any kind → systemic.
const effectiveTier = (f: Record<string, Json>): Tier => {
  const raw = tierForQuantum(num(f.imbalance_quantum_zar));
  const flagCount = FLOOR_KEYS.filter((k) => bool(f[k])).length;
  const systemicFlag = bool(f.imbalance_floor_flag_high_voltage_brp) || bool(f.imbalance_floor_flag_system_critical_period);
  if (systemicFlag || flagCount >= 2) return 'systemic';
  if (flagCount === 1) return raw === 'minor' || raw === 'standard' ? 'material' : raw;
  return raw;
};

type Direction = 'long' | 'short' | 'balanced';

const direction = (mwh: Json | undefined): Direction => {
  const v = num(mwh);
  if (v > 0.001) return 'long';
  if (v < -0.001) return 'short';
  return 'balanced';
};

const priceApplied = (dir: Direction, longP: Json | undefined, shortP: Json | undefined): number =>
  dir === 'long' ? num(longP) : dir === 'short' ? num(shortP) : 0;

const chargeZar = (mwh: Json | undefined, applied: number): number => Math.abs(num(mwh)) * applied;

const penaltyZar = (charge: number, mult: Json | undefined): number => {
  const m = num(mult) || 1;
  return m > 1 ? charge * (m - 1) : 0;
};

// pure re-pricing shared by price_imbalance and revise_invoice — same
// formula, different entry state, so one function keeps them from drifting.
const priceFields = (f: Record<string, Json>): Record<string, Json> => {
  const dir = direction(f.imbalance_mwh);
  const applied = priceApplied(dir, f.long_price_zar_per_mwh, f.short_price_zar_per_mwh);
  const charge = chargeZar(f.imbalance_mwh, applied);
  const penalty = penaltyZar(charge, f.penalty_multiplier);
  return {
    imbalance_direction: dir,
    charge_zar: charge,
    penalty_zar: penalty,
    total_owed_zar: charge + penalty,
    tier: effectiveTier(f),
  };
};

export const imbalanceSettlement: ChainDecl = {
  key: 'imbalance_settlement',
  noun: 'Imbalance settlement period',
  refPrefix: 'IMST',
  title: (f) =>
    `Imbalance settlement — ${(f.brp_label as string) ?? 'unnamed BRP'} (${(f.market_zone as string) ?? 'zone TBC'})`,
  visibility: 'party',
  settles: true,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'System Operations Code §11 — imbalance settlement', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 's35 — pricing and tariff determinations', effect: 'requires' },
  ],
  roles: ['brp', 'grid', 'regulator', 'operator'],

  fields: {
    brp_party: { type: 'party', role: 'brp', label: 'BRP (counterparty)' },
    brp_label: { type: 'string', label: 'BRP label' },
    brp_voltage_class: { type: 'string', label: 'BRP voltage class' },
    market_zone: { type: 'string', label: 'Market zone' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    settlement_period_start_at: { type: 'string', required: true, label: 'Period start' },
    settlement_period_end_at: { type: 'string', required: true, label: 'Period end' },
    nominated_mwh: { type: 'number', min: 0, label: 'Nominated (MWh)' },
    metered_mwh: { type: 'number', min: 0, label: 'Metered (MWh)' },
    imbalance_mwh: { type: 'number', label: 'Imbalance (metered − nominated MWh)' },
    imbalance_direction: { type: 'string', label: 'Imbalance direction (long/short/balanced)' },
    imbalance_quantum_zar: { type: 'number', label: 'Imbalance quantum (ZAR)' },
    imbalance_floor_flag_high_voltage_brp: { type: 'boolean', label: 'High-voltage BRP' },
    imbalance_floor_flag_system_critical_period: { type: 'boolean', label: 'System-critical period' },
    imbalance_floor_flag_regulator_audit_period: { type: 'boolean', label: 'Regulator audit period' },
    imbalance_floor_flag_market_suspension_active: { type: 'boolean', label: 'Market suspension active' },
    imbalance_floor_flag_repeated_breach_5plus: { type: 'boolean', label: 'Repeated breach (5+)' },
    tier: { type: 'string', label: 'Effective tier (minor/standard/material/systemic)' },
    long_price_zar_per_mwh: { type: 'number', min: 0, label: 'Long imbalance price (ZAR/MWh)' },
    short_price_zar_per_mwh: { type: 'number', min: 0, label: 'Short imbalance price (ZAR/MWh)' },
    penalty_multiplier: { type: 'number', min: 0, label: 'Penalty multiplier' },
    charge_zar: { type: 'number', min: 0, label: 'Imbalance charge (ZAR)' },
    penalty_zar: { type: 'number', min: 0, label: 'Penalty (ZAR)' },
    total_owed_zar: { type: 'number', min: 0, label: 'Total owed (ZAR)' },
    invoice_number: { type: 'string', label: 'Invoice number' },
    invoice_due_at: { type: 'string', label: 'Invoice due at' },
    dispute_window_close_at: { type: 'string', label: 'Dispute window closes at' },
    dispute_narrative: { type: 'string', label: 'Dispute narrative' },
    dispute_resolution_text: { type: 'string', label: 'Dispute resolution' },
    payment_method: { type: 'string', label: 'Payment method' },
    payment_reference: { type: 'string', label: 'Payment reference' },
    amount_paid_zar: { type: 'number', min: 0, label: 'Amount paid (ZAR)' },
    notes: { type: 'string', label: 'Notes' },
    narrative: { type: 'string', label: 'Settlement note' },
    // written by derive, never by the client
    period_opened_at: { type: 'string', label: 'Period opened at' },
    meter_data_received_at: { type: 'string', label: 'Meter data received at' },
    nominations_reconciled_at: { type: 'string', label: 'Nominations reconciled at' },
    imbalance_computed_at: { type: 'string', label: 'Imbalance computed at' },
    priced_at: { type: 'string', label: 'Priced at' },
    invoice_issued_at: { type: 'string', label: 'Invoice issued at' },
    invoice_acknowledged_at: { type: 'string', label: 'Invoice acknowledged at' },
    dispute_window_opened_at: { type: 'string', label: 'Dispute window opened at' },
    dispute_raised_at: { type: 'string', label: 'Dispute raised at' },
    dispute_resolved_at: { type: 'string', label: 'Dispute resolved at' },
    invoice_revised_at: { type: 'string', label: 'Invoice revised at' },
    payment_recorded_at: { type: 'string', label: 'Payment recorded at' },
    settled_at: { type: 'string', label: 'Settled at' },
    archived_at: { type: 'string', label: 'Archived at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
    aged_arrears_at: { type: 'string', label: 'Aged into arrears at' },
  },

  initial: 'period_open',

  states: {
    period_open: { label: 'Period open', terminal: false, holder: 'grid', sla: { days: 7 } },
    meter_data_received: { label: 'Meter data received', terminal: false, holder: 'grid', sla: { days: 5 } },
    nominations_reconciled: { label: 'Nominations reconciled', terminal: false, holder: 'grid', sla: { days: 5 } },
    imbalance_computed: { label: 'Imbalance computed', terminal: false, holder: 'grid', sla: { days: 3 } },
    priced: { label: 'Priced', terminal: false, holder: 'grid', sla: { days: 3 } },
    invoice_issued: { label: 'Invoice issued', terminal: false, holder: 'brp', sla: { days: 14 } },
    invoice_acknowledged: { label: 'Invoice acknowledged', terminal: false, holder: 'grid', sla: { days: 14 } },
    dispute_window_open: { label: 'Dispute window open', terminal: false, holder: 'brp', sla: { days: 7 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'regulator', sla: { days: 14 } },
    resolved_dispute: { label: 'Dispute resolved', terminal: false, holder: 'grid', sla: { days: 3 } },
    invoice_revised: { label: 'Invoice revised', terminal: false, holder: 'grid', sla: { days: 3 } },
    payment_pending: { label: 'Payment pending', terminal: false, holder: 'brp', sla: { days: 21 } },
    aged_arrears: { label: 'Aged arrears', terminal: false, holder: 'brp', sla: { days: 5 } },
    // soft terminal: settled still accepts archive_period (matches the legacy
    // registry's own `terminal: ['settled','archived','cancelled']` list).
    settled: { label: 'Settled', terminal: true, holder: 'none' },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'period_open',
      by: ['grid', 'operator'],
      actorBecomes: 'grid',
      label: 'Open settlement period',
      intent: 'primary',
      input: {
        brp_party: { type: 'party', role: 'brp', required: true },
        brp_label: { type: 'string' },
        brp_voltage_class: { type: 'string' },
        market_zone: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
        settlement_period_start_at: { type: 'string', required: true },
        settlement_period_end_at: { type: 'string', required: true },
        nominated_mwh: { type: 'number', min: 0 },
        imbalance_quantum_zar: { type: 'number' },
        imbalance_floor_flag_high_voltage_brp: { type: 'boolean' },
        imbalance_floor_flag_system_critical_period: { type: 'boolean' },
        imbalance_floor_flag_regulator_audit_period: { type: 'boolean' },
        imbalance_floor_flag_market_suspension_active: { type: 'boolean' },
        imbalance_floor_flag_repeated_breach_5plus: { type: 'boolean' },
      },
      // SO ≠ BRP (no self-settlement) + no new periods under a compliance halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
      derive: (f, at: Instant) => ({ period_opened_at: isoUtc(at), tier: effectiveTier(f) }),
    },

    {
      id: 'receive_meter_data',
      from: 'period_open',
      to: 'meter_data_received',
      by: ['grid', 'operator'],
      label: 'Receive meter data',
      intent: 'primary',
      input: { metered_mwh: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ meter_data_received_at: isoUtc(at) }),
    },
    {
      id: 'reconcile_nominations',
      from: 'meter_data_received',
      to: 'nominations_reconciled',
      by: ['grid', 'operator'],
      label: 'Reconcile nominations',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ nominations_reconciled_at: isoUtc(at) }),
    },
    {
      id: 'compute_imbalance',
      from: 'nominations_reconciled',
      to: 'imbalance_computed',
      by: ['grid', 'operator'],
      label: 'Compute imbalance',
      intent: 'primary',
      input: {
        imbalance_mwh: { type: 'number' },
        imbalance_quantum_zar: { type: 'number' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (f, at: Instant) => ({
        imbalance_computed_at: isoUtc(at),
        imbalance_direction: direction(f.imbalance_mwh),
        tier: effectiveTier(f),
      }),
    },

    // --- pricing gate (structural): priced is the ONLY door to invoicing ---
    {
      id: 'price_imbalance',
      from: 'imbalance_computed',
      to: 'priced',
      by: ['grid', 'operator'],
      label: 'Price imbalance',
      intent: 'primary',
      input: {
        long_price_zar_per_mwh: { type: 'number', min: 0 },
        short_price_zar_per_mwh: { type: 'number', min: 0 },
        penalty_multiplier: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f, at: Instant) => ({ priced_at: isoUtc(at), ...priceFields(f) }),
    },
    {
      // the only edges into invoice_issued are from priced or invoice_revised —
      // a period can NEVER be invoiced without a computed charge behind it.
      id: 'issue_invoice',
      from: ['priced', 'invoice_revised'],
      to: 'invoice_issued',
      by: ['grid', 'operator'],
      label: 'Issue invoice',
      intent: 'primary',
      input: {
        invoice_number: { type: 'string', required: true },
        invoice_due_at: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ invoice_issued_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge_invoice',
      from: 'invoice_issued',
      to: 'invoice_acknowledged',
      by: ['brp', 'operator'],
      label: 'Acknowledge invoice',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ invoice_acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'open_dispute_window',
      from: 'invoice_acknowledged',
      to: 'dispute_window_open',
      by: ['grid', 'operator'],
      label: 'Open dispute window',
      intent: 'primary',
      input: { dispute_window_close_at: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ dispute_window_opened_at: isoUtc(at) }),
    },

    // --- dispute branch --------------------------------------------------
    {
      id: 'raise_dispute',
      from: 'dispute_window_open',
      to: 'disputed',
      by: ['brp', 'operator'],
      label: 'Raise dispute',
      intent: 'destructive',
      input: { dispute_narrative: { type: 'string' } },
      // same vocabulary as oe_dispatch_nominations.raise_dispute — one
      // dispute-reason taxonomy across the settlement family.
      requiresReason: ['imbalance_calc_error', 'metering_discrepancy', 'charge_disputed', 'schedule_misrecorded'],
      guards: [],
      derive: (_f, at: Instant) => ({ dispute_raised_at: isoUtc(at) }),
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'resolved_dispute',
      by: ['regulator', 'operator'],
      label: 'Resolve dispute',
      intent: 'primary',
      input: { dispute_resolution_text: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ dispute_resolved_at: isoUtc(at) }),
    },
    {
      id: 'revise_invoice',
      from: 'resolved_dispute',
      to: 'invoice_revised',
      by: ['grid', 'operator'],
      label: 'Revise invoice',
      intent: 'primary',
      input: {
        long_price_zar_per_mwh: { type: 'number', min: 0 },
        short_price_zar_per_mwh: { type: 'number', min: 0 },
        imbalance_quantum_zar: { type: 'number' },
      },
      guards: [],
      derive: (f, at: Instant) => ({ invoice_revised_at: isoUtc(at), ...priceFields(f) }),
    },

    // --- payment + settlement (structural: settle only via record_payment) ---
    {
      id: 'record_payment',
      from: ['dispute_window_open', 'invoice_issued', 'invoice_acknowledged', 'invoice_revised', 'payment_pending', 'aged_arrears'],
      to: 'payment_pending',
      by: ['brp', 'operator'],
      label: 'Record payment',
      intent: 'primary',
      input: {
        payment_method: { type: 'string' },
        payment_reference: { type: 'string' },
        amount_paid_zar: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ payment_recorded_at: isoUtc(at) }),
    },
    {
      id: 'mark_settled',
      from: 'payment_pending',
      to: 'settled',
      by: ['grid', 'operator'],
      label: 'Mark settled',
      intent: 'primary',
      input: { narrative: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ settled_at: isoUtc(at) }),
    },
    {
      id: 'archive_period',
      from: 'settled',
      to: 'archived',
      by: ['grid', 'operator'],
      label: 'Archive period',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ archived_at: isoUtc(at) }),
    },

    // --- arrears aging (cron-driven; by:system so the sweep can fire it) ---
    {
      id: 'age_into_arrears',
      from: ['invoice_issued', 'invoice_acknowledged', 'payment_pending'],
      to: 'aged_arrears',
      by: ['grid', 'operator', 'system'],
      label: 'Age into arrears',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ aged_arrears_at: isoUtc(at) }),
    },

    // --- exit: cancellable from any non-terminal state --------------------
    {
      id: 'cancel_period',
      from: [
        'period_open', 'meter_data_received', 'nominations_reconciled', 'imbalance_computed', 'priced',
        'invoice_issued', 'invoice_acknowledged', 'dispute_window_open', 'disputed', 'resolved_dispute',
        'invoice_revised', 'payment_pending', 'aged_arrears',
      ],
      to: 'cancelled',
      by: ['grid', 'operator'],
      label: 'Cancel period',
      intent: 'destructive',
      requiresReason: ['data_error', 'duplicate_period', 'superseded_by_correction', 'market_suspension_active', 'regulatory_direction'],
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
  ],

  // 30-day arrears sweep from the three payable states — mirrors the
  // legacy cron ("invoice_issued / payment_pending → aged_arrears,
  // cron-driven, 30/60/90d"); one timer per source state since a TimerDecl
  // takes a single onState.
  timers: [
    { onState: 'invoice_issued', after: { days: 30 }, fire: 'age_into_arrears', kind: 'sla' },
    { onState: 'invoice_acknowledged', after: { days: 30 }, fire: 'age_into_arrears', kind: 'sla' },
    { onState: 'payment_pending', after: { days: 30 }, fire: 'age_into_arrears', kind: 'sla' },
  ],
};
