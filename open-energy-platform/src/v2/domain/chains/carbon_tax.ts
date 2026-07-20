// carbon_tax — Carbon Tax Act annual return lifecycle as data.
//
// A taxpayer (emitter) declares its verified emissions for a tax period, files
// the return with SARS (the regulator), SARS assesses the liability, the
// taxpayer records payment, and SARS finalises. The liability is a pure
// function of the declared tonnage and the statutory per-tonne rate net of the
// allowance percentage — no clock, no env (see gross/net below).
//
// Structural gate: record_payment leaves ONLY 'assessed', and the ONLY path
// into 'assessed' is the assess edge. So a taxpayer can NEVER record payment
// against a return SARS has not assessed — no guard, the state graph enforces
// it. Likewise finalise leaves only 'paid'.
//
// settles:false — this chain is the statutory *record* of the return and its
// assessment, not the money movement itself. Custody/payment rails are out of
// scope (R-S5-1); the paid_amount is a declared figure, not a settlement.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// statutory carbon-tax rate, ZAR per tCO2e (REBUILD_FUNCTIONAL_FLOOR CB_TAX_RATE_ZAR).
const CB_TAX_RATE_ZAR = 236;

const num = (v: Json | undefined, fallback: number): number =>
  typeof v === 'number' ? v : fallback;

// pure liability calc: gross = tonnes × rate; net = gross × (1 - allowance%).
const liability = (f: Record<string, Json>): { gross: number; net: number } => {
  const tonnes = num(f.emissions_tco2e, 0);
  const rate = num(f.tax_rate_zar, CB_TAX_RATE_ZAR);
  const allowancePct = Math.min(Math.max(num(f.allowance_pct, 0), 0), 100);
  const gross = tonnes * rate;
  const net = gross * (1 - allowancePct / 100);
  return { gross, net };
};

export const carbonTax: ChainDecl = {
  key: 'carbon_tax',
  noun: 'Carbon tax return',
  refPrefix: 'CT',
  title: (f) =>
    `Carbon tax ${(f.tax_period as string) ?? 'period'} — ${(f.taxpayer_name as string) ?? 'taxpayer'} (${num(f.emissions_tco2e, 0)} tCO2e)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act 15 of 2019', provision: 's3 imposition + s6 rate', effect: 'creates_offence' },
    { instrument: 'Tax Administration Act 28 of 2011', provision: 'return, assessment & payment', effect: 'requires' },
  ],
  roles: ['taxpayer', 'regulator', 'operator'],

  fields: {
    return_number: { type: 'string', label: 'Return number' },
    taxpayer_party: { type: 'party', role: 'taxpayer', label: 'Taxpayer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'SARS' },
    taxpayer_name: { type: 'string', label: 'Taxpayer name' },
    tax_period: { type: 'string', required: true, label: 'Tax period (year)' },
    facility_ref: { type: 'string', label: 'Facility / activity ref' },
    emissions_tco2e: { type: 'number', required: true, min: 0, label: 'Declared emissions (tCO2e)' },
    tax_rate_zar: { type: 'number', min: 0, label: 'Rate (ZAR / tCO2e)' },
    allowance_pct: { type: 'number', min: 0, max: 100, label: 'Total allowance (%)' },
    mrv_evidence_ref: { type: 'string', label: 'MRV / verification evidence ref' },
    // derived / regulator-set — never trusted from the client
    gross_liability_zar: { type: 'number', label: 'Gross liability (ZAR)' },
    net_liability_zar: { type: 'number', label: 'Net liability (ZAR)' },
    assessed_liability_zar: { type: 'number', min: 0, label: 'SARS-assessed liability (ZAR)' },
    paid_amount_zar: { type: 'number', min: 0, label: 'Amount paid (ZAR)' },
    filed_at: { type: 'string', label: 'Filed at' },
    assessed_at: { type: 'string', label: 'Assessed at' },
    paid_at: { type: 'string', label: 'Paid at' },
    finalized_at: { type: 'string', label: 'Finalised at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft return', terminal: false, holder: 'taxpayer', sla: { days: 30 } },
    submitted: { label: 'Filed with SARS', terminal: false, holder: 'regulator', sla: { days: 21 } },
    assessed: { label: 'Assessed', terminal: false, holder: 'taxpayer', sla: { days: 30 } },
    paid: { label: 'Payment recorded', terminal: false, holder: 'regulator', sla: { days: 7 } },
    finalized: { label: 'Finalised', terminal: true, holder: 'none' },
    rejected: { label: 'Return rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['taxpayer', 'operator'],
      actorBecomes: 'taxpayer',
      label: 'Start carbon tax return',
      intent: 'primary',
      input: {
        taxpayer_name: { type: 'string' },
        tax_period: { type: 'string', required: true },
        facility_ref: { type: 'string' },
        emissions_tco2e: { type: 'number', required: true, min: 0 },
        tax_rate_zar: { type: 'number', min: 0 },
        allowance_pct: { type: 'number', min: 0, max: 100 },
        mrv_evidence_ref: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => {
        const { gross, net } = liability(f);
        return { gross_liability_zar: gross, net_liability_zar: net };
      },
    },
    {
      // recompute liability off any edited tonnage/allowance, then file.
      id: 'submit_return',
      from: 'draft',
      to: 'submitted',
      by: ['taxpayer', 'operator'],
      label: 'File return with SARS',
      intent: 'primary',
      input: {
        emissions_tco2e: { type: 'number', min: 0 },
        allowance_pct: { type: 'number', min: 0, max: 100 },
        mrv_evidence_ref: { type: 'string' },
      },
      guards: [],
      derive: (f, at: Instant) => {
        const { gross, net } = liability(f);
        return { gross_liability_zar: gross, net_liability_zar: net, filed_at: isoUtc(at) };
      },
    },
    {
      id: 'assess',
      from: 'submitted',
      to: 'assessed',
      by: ['regulator'],
      label: 'Assess liability',
      intent: 'primary',
      input: { assessed_liability_zar: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ assessed_at: isoUtc(at) }),
    },
    {
      // structural gate: the ONLY edge into 'paid', and it can only fire from
      // 'assessed' — which only `assess` reaches. Payment therefore cannot be
      // recorded against an unassessed return. No guard needed.
      id: 'record_payment',
      from: 'assessed',
      to: 'paid',
      by: ['taxpayer', 'operator'],
      label: 'Record payment',
      intent: 'primary',
      input: { paid_amount_zar: { type: 'number', required: true, min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ paid_at: isoUtc(at) }),
    },
    {
      id: 'finalize',
      from: 'paid',
      to: 'finalized',
      by: ['regulator'],
      label: 'Finalise return',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ finalized_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_return',
      from: ['submitted', 'assessed'],
      to: 'rejected',
      by: ['regulator'],
      label: 'Reject return',
      intent: 'destructive',
      requiresReason: ['emissions_understated', 'allowance_ineligible', 'mrv_unverified', 'period_mismatch'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['draft', 'submitted'],
      to: 'withdrawn',
      by: ['taxpayer'],
      label: 'Withdraw return',
      intent: 'destructive',
      requiresReason: ['filed_in_error', 'restatement_pending', 'entity_deregistered'],
      guards: [],
    },
  ],
};
