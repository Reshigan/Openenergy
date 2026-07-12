// benchmark_transition — JIBAR→ZARONIA benchmark-transition lifecycle as data.
//
// A dealer inventories a JIBAR-referencing trade, assesses value-transfer
// impact, classifies its systemic tier, notifies the counterparty, receives a
// response, drafts and executes the fallback amendment, settles the value
// transfer, and closes the legacy benchmark out clean.
//
// The invariant is structural, not a guard: draft_amendment leaves ONLY
// `responded`, and the ONLY path into `responded` is the counterparty's
// `record_response` off `notified`. So an amendment can NEVER be drafted before
// the counterparty has actually responded to notification — you cannot paper a
// bilateral benchmark change the other side never answered. The state graph
// enforces it; no guard is needed.
//
// execute_amendment carries counterpartyDistinct: a benchmark amendment binds
// two sides, so the dealer and the counterparty must be different legal entities
// (no self-dealing the value transfer).
//
// settles:false — this is a contract-remediation record, never a payment. The
// value transfer is settled on the underlying trade's own rails (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure systemic-tier bucketing off notional + interbank exposure. No clock.
const tierOf = (notional: Json | undefined, interbank: Json | undefined): string => {
  if (typeof notional !== 'number') return 'minor';
  if (interbank === true && notional >= 1_000_000_000) return 'systemic';
  if (notional >= 500_000_000) return 'material';
  if (notional >= 50_000_000) return 'standard';
  return 'minor';
};

export const benchmarkTransition: ChainDecl = {
  key: 'benchmark_transition',
  noun: 'Benchmark transition',
  refPrefix: 'BT',
  title: (f) =>
    `${(f.legacy_benchmark as string) ?? 'jibar'} → ${(f.replacement_rate as string) ?? 'zaronia'} — ${(f.trade_ref as string) ?? 'unlinked trade'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'JIBAR Cessation (SARB MPC direction)', provision: 'orderly transition to ZARONIA', effect: 'requires' },
    { instrument: 'ISDA 2020 IBOR Fallbacks Protocol', provision: 'benchmark fallback adherence', effect: 'authorises' },
  ],
  roles: ['dealer', 'counterparty', 'regulator'],

  fields: {
    transition_number: { type: 'string', label: 'Transition number' },
    dealer_party: { type: 'party', role: 'dealer', label: 'Dealer' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Counterparty' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    trade_ref: { type: 'string', required: true, label: 'Trade ref' },
    instrument_type: { type: 'string', label: 'Instrument (irs/basis_swap/fra/…)' },
    legacy_benchmark: { type: 'string', required: true, label: 'Legacy benchmark (jibar_1m/3m/6m/12m)' },
    replacement_rate: { type: 'string', label: 'Replacement rate (zaronia/…)' },
    fallback_class: { type: 'string', label: 'Fallback class (isda_protocol/bilateral/…)' },
    counterparty_name: { type: 'string', label: 'Counterparty name' },
    counterparty_interbank: { type: 'boolean', label: 'Interbank counterparty' },
    notional_zar: { type: 'number', min: 0, required: true, label: 'Notional (ZAR)' },
    remaining_years: { type: 'number', min: 0, label: 'Remaining years' },
    cessation_date: { type: 'string', label: 'Cessation date' },
    value_transfer_zar: { type: 'number', label: 'Value transfer (ZAR)' },
    amendment_ref: { type: 'string', label: 'Amendment ref' },
    regulator_ref: { type: 'string', label: 'Regulator ref' },
    // derived by the engine, never client-set
    transition_tier: { type: 'string', label: 'Transition tier' },
    dispute_count: { type: 'number', label: 'Times disputed' },
    inventoried_at: { type: 'string', label: 'Inventoried at' },
    notified_at: { type: 'string', label: 'Notified at' },
    executed_at: { type: 'string', label: 'Amendment executed at' },
    settled_at: { type: 'string', label: 'Value transfer settled at' },
    transitioned_at: { type: 'string', label: 'Transitioned clean at' },
  },

  initial: 'inventoried',

  states: {
    inventoried: { label: 'Inventoried', terminal: false, holder: 'dealer', sla: { days: 5 } },
    impact_assessed: { label: 'Impact assessed', terminal: false, holder: 'dealer', sla: { days: 5 } },
    classified: { label: 'Classified', terminal: false, holder: 'dealer', sla: { days: 3 } },
    notified: { label: 'Counterparty notified', terminal: false, holder: 'counterparty', sla: { days: 10 } },
    responded: { label: 'Counterparty responded', terminal: false, holder: 'dealer', sla: { days: 5 } },
    amendment_drafted: { label: 'Amendment drafted', terminal: false, holder: 'dealer', sla: { days: 5 } },
    amendment_executed: { label: 'Amendment executed', terminal: false, holder: 'dealer', sla: { days: 3 } },
    vt_settled: { label: 'Value transfer settled', terminal: false, holder: 'dealer', sla: { days: 2 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'dealer' },
    on_hold: { label: 'On hold', terminal: false, holder: 'dealer' },
    transitioned_clean: { label: 'Transitioned clean', terminal: true, holder: 'none' },
    terminated_legacy: { label: 'Legacy terminated', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'inventoried',
      by: ['dealer'],
      actorBecomes: 'dealer',
      label: 'Inventory trade',
      intent: 'primary',
      input: {
        trade_ref: { type: 'string', required: true },
        instrument_type: { type: 'string' },
        legacy_benchmark: { type: 'string', required: true },
        replacement_rate: { type: 'string' },
        fallback_class: { type: 'string' },
        counterparty_name: { type: 'string' },
        counterparty_interbank: { type: 'boolean' },
        notional_zar: { type: 'number', min: 0, required: true },
        remaining_years: { type: 'number', min: 0 },
        cessation_date: { type: 'string' },
        counterparty_party: { type: 'party', role: 'counterparty' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ inventoried_at: isoUtc(at) }),
    },
    { id: 'assess_impact', from: 'inventoried', to: 'impact_assessed', by: ['dealer'], label: 'Assess impact', intent: 'primary', input: { value_transfer_zar: { type: 'number' } }, guards: [] },
    {
      id: 'classify',
      from: 'impact_assessed',
      to: 'classified',
      by: ['dealer'],
      label: 'Classify tier',
      intent: 'primary',
      guards: [],
      derive: (f, _at: Instant) => ({ transition_tier: tierOf(f.notional_zar, f.counterparty_interbank) }),
    },
    {
      id: 'notify_counterparty',
      from: 'classified',
      to: 'notified',
      by: ['dealer'],
      label: 'Notify counterparty',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ notified_at: isoUtc(at) }),
    },
    {
      // counterparty answers the notification — the only path into `responded`,
      // and by ['counterparty'] so only the notified side can supply it.
      id: 'record_response',
      from: 'notified',
      to: 'responded',
      by: ['counterparty'],
      label: 'Record response',
      intent: 'primary',
      input: { fallback_class: { type: 'string' }, replacement_rate: { type: 'string' } },
      guards: [],
    },
    {
      // structural gate: the ONLY edge into amendment_drafted, from `responded`
      // ONLY. No amendment can be papered before the counterparty responds.
      id: 'draft_amendment',
      from: 'responded',
      to: 'amendment_drafted',
      by: ['dealer'],
      label: 'Draft amendment',
      intent: 'primary',
      input: { amendment_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'execute_amendment',
      from: 'amendment_drafted',
      to: 'amendment_executed',
      by: ['dealer'],
      label: 'Execute amendment',
      intent: 'primary',
      // a bilateral amendment binds two distinct legal entities.
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ executed_at: isoUtc(at) }),
    },
    {
      id: 'settle_vt',
      from: 'amendment_executed',
      to: 'vt_settled',
      by: ['dealer'],
      label: 'Settle value transfer',
      intent: 'primary',
      input: { value_transfer_zar: { type: 'number', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ settled_at: isoUtc(at) }),
    },
    {
      id: 'confirm_clean',
      from: 'vt_settled',
      to: 'transitioned_clean',
      by: ['dealer'],
      label: 'Confirm clean transition',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ transitioned_at: isoUtc(at) }),
    },

    // --- hold / dispute (non-terminal) ---------------------------------------
    {
      id: 'raise_dispute',
      from: ['responded', 'amendment_drafted', 'amendment_executed'],
      to: 'disputed',
      by: ['dealer', 'counterparty'],
      label: 'Raise dispute',
      intent: 'secondary',
      requiresReason: ['value_transfer_disputed', 'fallback_class_contested', 'spread_challenged', 'documentation_defect'],
      guards: [],
      derive: (f, _at: Instant) => ({ dispute_count: (typeof f.dispute_count === 'number' ? f.dispute_count : 0) + 1 }),
    },
    { id: 'resolve_dispute', from: 'disputed', to: 'responded', by: ['dealer'], label: 'Resolve dispute', intent: 'primary', guards: [] },
    {
      id: 'put_on_hold',
      from: ['impact_assessed', 'classified', 'notified', 'responded', 'amendment_drafted'],
      to: 'on_hold',
      by: ['dealer'],
      label: 'Put on hold',
      intent: 'secondary',
      requiresReason: ['awaiting_isda_protocol', 'counterparty_unresponsive', 'legal_review', 'pending_regulator_guidance'],
      guards: [],
    },
    { id: 'resume', from: 'on_hold', to: 'classified', by: ['dealer'], label: 'Resume', intent: 'primary', guards: [] },

    // --- terminal exits ------------------------------------------------------
    {
      // tough-legacy fallback: the legacy contract is terminated rather than
      // transitioned (no viable ZARONIA amendment reached).
      id: 'terminate_legacy',
      from: ['notified', 'responded', 'disputed', 'on_hold'],
      to: 'terminated_legacy',
      by: ['dealer', 'regulator'],
      label: 'Terminate legacy trade',
      intent: 'destructive',
      requiresReason: ['no_agreed_fallback', 'counterparty_default', 'pre_cessation_trigger', 'regulator_directed'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['inventoried', 'impact_assessed', 'classified'],
      to: 'cancelled',
      by: ['dealer'],
      label: 'Cancel transition',
      intent: 'destructive',
      requiresReason: ['trade_matured_early', 'wrongly_inventoried', 'novated_away', 'duplicate'],
      guards: [],
    },
  ],

  // counterparty-notification SLA: a notified side left unanswered stales toward
  // a hold. record-only stub; the sweep computes the real bar off state sla days.
  timers: [{ onState: 'notified', after: { days: 0 }, fire: 'put_on_hold', kind: 'sla' }],
};
