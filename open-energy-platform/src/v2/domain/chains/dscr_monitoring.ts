// dscr_monitoring — lender-side DSCR/LLCR/PLCR covenant testing for a project
// finance facility, as data.
//
// Each period the lender collects the period's cash-flow data, computes the
// debt-service coverage ratio (+ forward DSCR, LLCR, PLCR), and either
// certifies the period clean or records a breach. A recorded breach opens a
// cure runway (propose → execute → validate) or escalates to distribution
// lock-up and — if unresolved — acceleration (IFRS 9 Stage 3). The lender may
// instead waive a breach (forbearance).
//
// Structural honesty (no invented guards):
//  - certify_clean, record_breach and place_on_watch are ONLY reachable after
//    compute_ratios (or, for certify_clean, after a validated cure) — a period
//    can never be certified or breached before its ratios are actually
//    computed. The state graph enforces the testing gate, no guard needed.
//  - open is guarded by counterpartyDistinct: lender and borrower must be
//    different legal entities (no self-lending).
//  - none of the other 9 registry guards model a DSCR-specific business rule
//    (they gate strategic capacity_mw, hazard class, credit/CP refs, carbon
//    serials — none of which this chain carries), so every other edge is
//    guards: []. The "crosses into the regulator inbox for material/severe
//    tiers" behaviour the v1 descriptor documents is a cascade fan-out
//    concern, not an admission gate, and belongs in the cascade, not here.
//
// settles:false — a covenant test records a compliance state, not a payment;
// outstanding_debt_zar is an informational exposure figure (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const dscrMonitoring: ChainDecl = {
  key: 'dscr_monitoring',
  noun: 'DSCR monitoring period',
  refPrefix: 'DSCR',
  title: (f) => `DSCR monitoring — ${(f.project_name as string) ?? 'unnamed project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Common Terms Agreement', provision: 'financial covenants — DSCR/LLCR/PLCR periodic testing', effect: 'requires' },
    { instrument: 'Facility Agreement', provision: 'events of default on sustained covenant breach', effect: 'restricts' },
  ],
  roles: ['lender', 'ipp_developer', 'regulator', 'operator'],

  fields: {
    monitoring_number: { type: 'string', label: 'Monitoring number' },
    project_name: { type: 'string', required: true, label: 'Project' },
    borrower_name: { type: 'string', label: 'Borrower name' },
    ipp_developer_party: { type: 'party', role: 'ipp_developer', label: 'Borrower / IPP entity' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    outstanding_debt_zar: { type: 'number', min: 0, label: 'Outstanding debt (ZAR)' },
    current_dscr: { type: 'number', label: 'Current DSCR' },
    forward_dscr_p12m: { type: 'number', label: 'Forward DSCR (12m)' },
    llcr_value: { type: 'number', label: 'LLCR' },
    plcr_value: { type: 'number', label: 'PLCR' },
    monitoring_summary: { type: 'string', label: 'Monitoring summary' },
    chain_basis: { type: 'string', label: 'Basis / evidence ref' },
    regulator_ref: { type: 'string', label: 'Regulator reference' },
    cfads_period_zar: { type: 'number', label: 'CFADS this period (ZAR)' },
    debt_service_period_zar: { type: 'number', label: 'Debt service this period (ZAR)' },
    shortfall_zar: { type: 'number', label: 'Shortfall (ZAR)' },
    proposed_cure_amount_zar: { type: 'number', min: 0, label: 'Proposed cure amount (ZAR)' },
    equity_cure_available_zar: { type: 'number', min: 0, label: 'Equity cure available (ZAR)' },
    dsra_balance_zar: { type: 'number', min: 0, label: 'DSRA balance (ZAR)' },
    executed_cure_amount_zar: { type: 'number', min: 0, label: 'Executed cure amount (ZAR)' },
    // written by derive, never by the client
    opened_at: { type: 'string', label: 'Period opened at' },
    breach_recorded_at: { type: 'string', label: 'Breach recorded at' },
    lock_up_at: { type: 'string', label: 'Lock-up entered at' },
    accelerated_at: { type: 'string', label: 'Accelerated at' },
    waived_at: { type: 'string', label: 'Waived at' },
    certified_clean_at: { type: 'string', label: 'Certified clean at' },
    cure_validated_at: { type: 'string', label: 'Cure validated at' },
  },

  initial: 'period_open',

  states: {
    period_open: { label: 'Period open', terminal: false, holder: 'lender' },
    data_collected: { label: 'Data collected', terminal: false, holder: 'lender' },
    computed: { label: 'Ratios computed', terminal: false, holder: 'lender' },
    watch: { label: 'On watch', terminal: false, holder: 'lender' },
    breach_recorded: { label: 'Breach recorded', terminal: false, holder: 'lender', sla: { days: 10 } },
    lock_up: { label: 'Distribution lock-up', terminal: false, holder: 'lender' },
    cure_proposed: { label: 'Cure proposed', terminal: false, holder: 'lender', sla: { days: 30 } },
    cure_in_progress: { label: 'Cure in progress', terminal: false, holder: 'lender' },
    cure_validated: { label: 'Cure validated', terminal: false, holder: 'lender' },
    certified_clean: { label: 'Certified clean', terminal: true, holder: 'none' },
    accelerated: { label: 'Accelerated', terminal: true, holder: 'none' },
    waived: { label: 'Waived', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'period_open',
      by: ['lender', 'operator'],
      actorBecomes: 'lender',
      label: 'Open DSCR monitoring period',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        monitoring_number: { type: 'string' },
        borrower_name: { type: 'string' },
        ipp_developer_party: { type: 'party', role: 'ipp_developer' },
        regulator_party: { type: 'party', role: 'regulator' },
        outstanding_debt_zar: { type: 'number', min: 0 },
      },
      // lender ≠ borrower (no self-lending on the covenant test).
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ opened_at: isoUtc(at) }),
    },
    {
      id: 'collect_data',
      from: 'period_open',
      to: 'data_collected',
      by: ['lender', 'operator'],
      label: 'Collect data',
      intent: 'primary',
      input: {
        cfads_period_zar: { type: 'number' },
        debt_service_period_zar: { type: 'number' },
        shortfall_zar: { type: 'number' },
        outstanding_debt_zar: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      // the only door from data_collected — and, for a recurring test cycle,
      // also reachable from a validated cure so the next period can re-test
      // without a separate "reopen" action.
      id: 'compute_ratios',
      from: ['data_collected', 'cure_validated'],
      to: 'computed',
      by: ['lender', 'operator'],
      label: 'Compute ratios',
      intent: 'primary',
      input: {
        current_dscr: { type: 'number' },
        forward_dscr_p12m: { type: 'number' },
        llcr_value: { type: 'number' },
        plcr_value: { type: 'number' },
        monitoring_summary: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'place_on_watch',
      from: 'computed',
      to: 'watch',
      by: ['lender', 'operator'],
      label: 'Place on watch',
      intent: 'secondary',
      guards: [],
    },
    {
      // structural gate: certification can only follow a computed test (fresh
      // or post-cure) — never a period that was never measured.
      id: 'certify_clean',
      from: ['computed', 'watch', 'cure_validated'],
      to: 'certified_clean',
      by: ['lender', 'operator'],
      label: 'Certify clean',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ certified_clean_at: isoUtc(at) }),
    },
    {
      id: 'record_breach',
      from: ['computed', 'watch'],
      to: 'breach_recorded',
      by: ['lender', 'operator'],
      label: 'Record breach',
      intent: 'destructive',
      input: { chain_basis: { type: 'string' } },
      requiresReason: ['dscr_breach', 'llcr_breach', 'plcr_breach', 'reporting_failure'],
      guards: [],
      derive: (_f, at: Instant) => ({ breach_recorded_at: isoUtc(at) }),
    },
    {
      id: 'enter_lock_up',
      from: 'breach_recorded',
      to: 'lock_up',
      // 'system' so the breach SLA timer below can auto-escalate an unresolved
      // breach into lock-up — this edge has no required input, so a bare
      // timer fire is always valid.
      by: ['lender', 'operator', 'system'],
      label: 'Enter lock-up',
      intent: 'destructive',
      input: { chain_basis: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ lock_up_at: isoUtc(at) }),
    },
    {
      id: 'declare_acceleration',
      from: ['breach_recorded', 'lock_up'],
      to: 'accelerated',
      by: ['lender', 'operator'],
      label: 'Declare acceleration',
      intent: 'destructive',
      input: {
        regulator_ref: { type: 'string' },
        monitoring_summary: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ accelerated_at: isoUtc(at) }),
    },
    {
      id: 'waive_breach',
      from: ['breach_recorded', 'lock_up'],
      to: 'waived',
      by: ['lender', 'operator'],
      label: 'Waive breach',
      intent: 'secondary',
      input: { chain_basis: { type: 'string' } },
      // v1 carried a free-text reason on this edge; a fixed forbearance
      // vocabulary keeps waivers auditable/comparable across lenders.
      requiresReason: ['sponsor_support', 'temporary_market_conditions', 'one_off_capex', 'strong_recovery_forecast', 'equity_cure_pending'],
      guards: [],
      derive: (_f, at: Instant) => ({ waived_at: isoUtc(at) }),
    },
    {
      id: 'propose_cure',
      from: 'breach_recorded',
      to: 'cure_proposed',
      by: ['lender', 'operator'],
      label: 'Propose cure',
      intent: 'primary',
      input: {
        proposed_cure_amount_zar: { type: 'number', min: 0 },
        equity_cure_available_zar: { type: 'number', min: 0 },
        dsra_balance_zar: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      // no reason field on this edge in v1 — kept reasonless here too rather
      // than inventing a code the source data never asked for.
      id: 'reject_cure',
      from: 'cure_proposed',
      to: 'breach_recorded',
      // 'system' so the cure-proposal SLA timer below can auto-reject a
      // proposal nobody executed in time — edge has no required input.
      by: ['lender', 'operator', 'system'],
      label: 'Reject cure',
      intent: 'destructive',
      guards: [],
    },
    {
      id: 'execute_cure',
      from: 'cure_proposed',
      to: 'cure_in_progress',
      by: ['lender', 'operator'],
      label: 'Execute cure',
      intent: 'primary',
      input: { executed_cure_amount_zar: { type: 'number', min: 0 } },
      guards: [],
    },
    {
      id: 'validate_cure',
      from: 'cure_in_progress',
      to: 'cure_validated',
      by: ['lender', 'operator'],
      label: 'Validate cure',
      intent: 'primary',
      input: { current_dscr: { type: 'number' } },
      guards: [],
      derive: (_f, at: Instant) => ({ cure_validated_at: isoUtc(at) }),
    },
    {
      id: 'fail_cure',
      from: ['cure_in_progress', 'cure_validated'],
      to: 'accelerated',
      by: ['lender', 'operator'],
      label: 'Fail cure',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ accelerated_at: isoUtc(at) }),
    },
  ],

  // deadlineCol in the v1 descriptor documents exactly these two SLA points:
  // a breach left unresolved lapses into lock-up, and a cure nobody executes
  // lapses back to an open breach. Both fire edges are system-armed above,
  // reference `from` states matching onState, carry no required input, and
  // have no requiresReason (so no `reason` here either).
  timers: [
    { onState: 'breach_recorded', after: { days: 10 }, fire: 'enter_lock_up', kind: 'sla' },
    { onState: 'cure_proposed', after: { days: 30 }, fire: 'reject_cure', kind: 'sla' },
  ],
};
