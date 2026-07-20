// carbon_tax_return — quarterly Carbon Tax Act return & SARS eFiling lifecycle
// as data (Wave 200; legacy table oe_carbon_tax_returns).
//
// carbon_fund prepares the return (data collection → emissions calc →
// allowances → draft → internal sign-off), files it with SARS, and then
// records whatever SARS does externally (ack, review, assessment) up to
// payment or a formal dispute. There is no in-app "regulator" actor: SARS's
// actions arrive as facts carbon_fund/operator key in (sars_submission_ref,
// sars_assessment_ref, assessment_amount) — this mirrors the legacy route,
// which only ever admits admin/carbon_fund as writers.
//
// Structural honesty (no invented guards):
//  - issue_assessment and record_payment both accept 'acknowledged' and
//    'under_sars_review' as well as their "proper" predecessor, because SARS
//    can assess or demand payment at any point after acknowledging receipt —
//    the legacy state machine (CTR_VALID_TRANSITIONS) allows this and this
//    decl mirrors it rather than tightening it unasked.
//  - raise_dispute only fires from assessment_issued — a taxpayer disputes an
//    assessment, not an unassessed return. No guard needed, the graph enforces it.
//  - None of the 10 registry guards fit this chain's real constraints (no
//    counterparty pair, no CP/credit evidence, no capacity/hazard threshold)
//    so every edge carries guards: [] rather than a bent-to-fit guard name.
//
// Per-class SLA (micro 14d / standard 30d / large 60d / major 90d, INVERTED —
// bigger emitter gets more prep time) is a per-instance deadline computed at
// open time, not a fixed per-state duration — so it lives only in the
// sla_deadline-equivalent tracked by the legacy route, and this decl omits a
// misleading static StateDecl.sla and omits timers (no fixed `after` fits all
// four tax classes at once).
//
// settles:false — this chain is the statutory record of the return, its SARS
// assessment, and the payment fact; it does not move money through this
// platform's own custody/settlement rails (R-S5-1), matching the sibling
// carbon_tax chain.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const num = (v: Json | undefined, fallback: number): number => (typeof v === 'number' ? v : fallback);

// pure emissions/liability roll-up — no clock, no env.
const totalEmissions = (f: Record<string, Json>): number =>
  num(f.scope1_tco2e, 0) + num(f.scope2_tco2e, 0) + num(f.process_emissions_tco2e, 0);

const liability = (f: Record<string, Json>): { totalAllowancePct: number; gross: number; allowances: number; net: number } => {
  const tonnes = totalEmissions(f);
  const rate = num(f.tax_rate_per_tco2, 0);
  const totalAllowancePct = Math.min(Math.max(num(f.basic_allowance_pct, 0) + num(f.offset_allowance_pct, 0), 0), 100);
  const gross = tonnes * rate;
  const allowances = gross * (totalAllowancePct / 100);
  return { totalAllowancePct, gross, allowances, net: gross - allowances };
};

export const carbonTaxReturn: ChainDecl = {
  key: 'carbon_tax_return',
  noun: 'Carbon tax return',
  refPrefix: 'CTR',
  title: (f) =>
    `Carbon tax return — ${(f.tax_period as string) ?? 'period'} FY${(f.fiscal_year as number) ?? ''} (${(f.tax_class as string) ?? 'standard'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act 15 of 2019', provision: 's16 quarterly returns & payment schedule', effect: 'requires' },
    { instrument: 'Tax Administration Act 28 of 2011', provision: 'return, assessment & payment', effect: 'requires' },
  ],
  roles: ['taxpayer', 'carbon_fund', 'operator'],

  fields: {
    taxpayer_party: { type: 'party', role: 'taxpayer', label: 'Taxpayer' },
    tax_period: { type: 'string', required: true, label: 'Tax period' },
    fiscal_year: { type: 'number', required: true, label: 'Fiscal year' },
    tax_class: { type: 'string', label: 'Tax class (micro/standard/large/major)' },
    scope1_tco2e: { type: 'number', min: 0, label: 'Scope 1 emissions (tCO2e)' },
    scope2_tco2e: { type: 'number', min: 0, label: 'Scope 2 emissions (tCO2e)' },
    process_emissions_tco2e: { type: 'number', min: 0, label: 'Process emissions (tCO2e)' },
    basic_allowance_pct: { type: 'number', min: 0, max: 100, label: 'Basic allowance (%)' },
    offset_allowance_pct: { type: 'number', min: 0, max: 100, label: 'Offset allowance (%)' },
    tax_rate_per_tco2: { type: 'number', min: 0, label: 'Rate (ZAR / tCO2e)' },
    sars_submission_ref: { type: 'string', label: 'SARS submission / receipt reference' },
    sars_assessment_ref: { type: 'string', label: 'SARS assessment reference' },
    assessment_amount: { type: 'number', min: 0, label: 'SARS-assessed amount (ZAR)' },
    payment_reference: { type: 'string', label: 'Payment reference' },
    paid_amount: { type: 'number', min: 0, label: 'Amount paid (ZAR)' },
    dispute_reason: { type: 'string', label: 'Dispute evidence / narrative' },
    // written by derive, never by the client
    total_emissions_tco2e: { type: 'number', label: 'Total emissions (tCO2e)' },
    total_allowance_pct: { type: 'number', label: 'Total allowance (%)' },
    gross_tax_liability: { type: 'number', label: 'Gross tax liability (ZAR)' },
    allowances_value: { type: 'number', label: 'Allowances value (ZAR)' },
    net_tax_payable: { type: 'number', label: 'Net tax payable (ZAR)' },
    filed_at: { type: 'string', label: 'Filed with SARS at' },
    assessed_at: { type: 'string', label: 'Assessed at' },
    paid_at: { type: 'string', label: 'Paid at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
  },

  initial: 'period_open',

  states: {
    period_open: { label: 'Period open', terminal: false, holder: 'carbon_fund' },
    data_collection: { label: 'Data collection', terminal: false, holder: 'carbon_fund' },
    emissions_calc: { label: 'Emissions calculated', terminal: false, holder: 'carbon_fund' },
    allowances_applied: { label: 'Allowances applied', terminal: false, holder: 'carbon_fund' },
    return_prepared: { label: 'Return prepared', terminal: false, holder: 'carbon_fund' },
    internal_approved: { label: 'Internally approved', terminal: false, holder: 'carbon_fund' },
    submitted: { label: 'Filed with SARS', terminal: false, holder: 'carbon_fund' },
    acknowledged: { label: 'SARS acknowledged', terminal: false, holder: 'carbon_fund' },
    under_sars_review: { label: 'Under SARS review', terminal: false, holder: 'carbon_fund' },
    assessment_issued: { label: 'Assessment issued', terminal: false, holder: 'carbon_fund' },
    payment_made: { label: 'Payment made', terminal: true, holder: 'none' },
    disputed: { label: 'Disputed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'period_open',
      by: ['carbon_fund', 'operator'],
      actorBecomes: 'carbon_fund',
      label: 'Open carbon tax return',
      intent: 'primary',
      input: {
        taxpayer_party: { type: 'party', role: 'taxpayer' },
        tax_period: { type: 'string', required: true },
        fiscal_year: { type: 'number', required: true },
        tax_class: { type: 'string' },
        scope1_tco2e: { type: 'number', min: 0 },
        scope2_tco2e: { type: 'number', min: 0 },
        process_emissions_tco2e: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f) => ({ total_emissions_tco2e: totalEmissions(f) }),
    },
    {
      id: 'open_data_collection',
      from: 'period_open',
      to: 'data_collection',
      by: ['carbon_fund', 'operator'],
      label: 'Open data collection',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'calculate_emissions',
      from: 'data_collection',
      to: 'emissions_calc',
      by: ['carbon_fund', 'operator'],
      label: 'Calculate emissions',
      intent: 'primary',
      input: {
        scope1_tco2e: { type: 'number', min: 0 },
        scope2_tco2e: { type: 'number', min: 0 },
        process_emissions_tco2e: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f) => ({ total_emissions_tco2e: totalEmissions(f) }),
    },
    {
      id: 'apply_allowances',
      from: 'emissions_calc',
      to: 'allowances_applied',
      by: ['carbon_fund', 'operator'],
      label: 'Apply allowances',
      intent: 'primary',
      input: {
        basic_allowance_pct: { type: 'number', min: 0, max: 100 },
        offset_allowance_pct: { type: 'number', min: 0, max: 100 },
        tax_rate_per_tco2: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f) => {
        const { totalAllowancePct, gross, allowances, net } = liability(f);
        return { total_allowance_pct: totalAllowancePct, gross_tax_liability: gross, allowances_value: allowances, net_tax_payable: net };
      },
    },
    {
      id: 'prepare_return',
      from: 'allowances_applied',
      to: 'return_prepared',
      by: ['carbon_fund', 'operator'],
      label: 'Prepare return',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'approve_internally',
      from: 'return_prepared',
      to: 'internal_approved',
      by: ['carbon_fund', 'operator'],
      label: 'Approve internally',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_to_sars',
      from: 'internal_approved',
      to: 'submitted',
      by: ['carbon_fund', 'operator'],
      label: 'Submit to SARS',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ filed_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge_receipt',
      from: 'submitted',
      to: 'acknowledged',
      by: ['carbon_fund', 'operator'],
      label: 'Acknowledge receipt',
      intent: 'primary',
      input: { sars_submission_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'commence_review',
      from: 'acknowledged',
      to: 'under_sars_review',
      by: ['carbon_fund', 'operator'],
      label: 'Commence review',
      intent: 'primary',
      guards: [],
    },
    {
      // SARS may assess straight off the acknowledgement too, not only after a
      // formal review — mirrors CTR_VALID_TRANSITIONS.issue_assessment.
      id: 'issue_assessment',
      from: ['under_sars_review', 'acknowledged'],
      to: 'assessment_issued',
      by: ['carbon_fund', 'operator'],
      label: 'Issue assessment',
      intent: 'primary',
      input: {
        sars_assessment_ref: { type: 'string' },
        assessment_amount: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ assessed_at: isoUtc(at) }),
    },
    {
      // reachable from acknowledged/under_sars_review too — SARS can demand
      // payment without a separately-recorded assessment step (legacy parity).
      id: 'record_payment',
      from: ['assessment_issued', 'acknowledged', 'under_sars_review'],
      to: 'payment_made',
      by: ['carbon_fund', 'operator'],
      label: 'Record payment',
      intent: 'primary',
      input: {
        payment_reference: { type: 'string' },
        paid_amount: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ paid_at: isoUtc(at) }),
    },
    {
      id: 'raise_dispute',
      from: 'assessment_issued',
      to: 'disputed',
      by: ['carbon_fund', 'operator'],
      label: 'Raise dispute',
      intent: 'destructive',
      input: { dispute_reason: { type: 'string' } },
      requiresReason: ['assessment_overstated', 'allowance_disallowed', 'calculation_error', 'double_taxation', 'regulatory_error'],
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
  ],
};
