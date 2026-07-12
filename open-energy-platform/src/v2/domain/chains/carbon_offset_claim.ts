// carbon_offset_claim — Carbon Tax Act s.13 offset-allowance claim lifecycle as
// data (W48). A taxpayer earmarks retired carbon credits against their carbon-tax
// liability; SARS reviews (with an optional query round), grants the allowance,
// the taxpayer applies it to the carbon-tax return, and SARS reconciles.
//
// The revenue-integrity spine is STRUCTURAL, not a guard: apply_to_return leaves
// ONLY allowance_granted, and the only path into allowance_granted is
// grant_allowance from sars_review. So an offset can NEVER reach a taxpayer's
// return before SARS has actually granted it — no self-serve allowance. Likewise
// credits can only be earmarked (credits_earmarked) from eligibility_screening,
// so an unscreened claim can't be submitted. earmark_credits is the one guarded
// edge: cpEvidencePresent forces a named retirement-evidence ref (the W17
// retirement / COAS lock the credits came from) before they attach to a claim.
//
// settles:false — a tax-offset claim is a fiscal record + regulatory workflow,
// never a payment rail (R-S5-1). Any real ZAR movement is SARS's own system.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const num = (v: Json | undefined): number => (typeof v === 'number' ? v : 0);

// pure claim-size bucketing off eligible retired credits (tCO2e). No clock, no env.
const offsetTier = (credits: Json | undefined): string => {
  if (typeof credits !== 'number') return 'minor_claim';
  if (credits >= 100_000) return 'major_claim';
  if (credits >= 10_000) return 'standard_claim';
  return 'minor_claim';
};

export const carbonOffsetClaim: ChainDecl = {
  key: 'carbon_offset_claim',
  noun: 'Carbon offset claim',
  refPrefix: 'COC',
  title: (f) =>
    `${(f.credits_claimed_tco2e as number) ?? '—'} tCO2e offset claim — TY${(f.tax_year as number) ?? '????'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act 2019', provision: 's13 offset allowance (capped 5%/10% of liability)', effect: 'authorises' },
    { instrument: 'Carbon Tax Act 2019', provision: 's6 gross liability + Carbon Offset Regs', effect: 'requires' },
  ],
  roles: ['taxpayer', 'sars', 'registry'],

  fields: {
    claim_number: { type: 'string', label: 'Claim number' },
    taxpayer_party: { type: 'party', role: 'taxpayer', label: 'Taxpayer' },
    sars_party: { type: 'party', role: 'sars', label: 'SARS' },
    taxpayer_name: { type: 'string', label: 'Taxpayer name' },
    tax_year: { type: 'number', required: true, label: 'Tax year' },
    industry_group: { type: 'string', required: true, label: 'Industry group (general/annex_2)' },
    offset_tier: { type: 'string', label: 'Offset tier' },
    gross_tax_liability_zar: { type: 'number', min: 0, label: 'Gross carbon-tax liability (ZAR)' },
    ct_rate_zar_per_tco2e: { type: 'number', min: 0, label: 'Carbon-tax rate (ZAR/tCO2e)' },
    credits_claimed_tco2e: { type: 'number', min: 0, label: 'Eligible credits claimed (tCO2e)' },
    cp_evidence_ref: { type: 'string', label: 'Retirement / COAS evidence ref' },
    // written by derive, never by the client
    offset_limit_pct: { type: 'number', label: 'Offset limit (%)' },
    offset_limit_zar: { type: 'number', label: 'Offset limit (ZAR)' },
    offset_value_zar: { type: 'number', label: 'Offset value applied (ZAR)' },
    net_tax_liability_zar: { type: 'number', label: 'Net liability after offset (ZAR)' },
    credits_unused_tco2e: { type: 'number', label: 'Credits over the s.13 cap (tCO2e)' },
    sars_reference: { type: 'string', label: 'SARS eFiling case ref' },
    query_round: { type: 'number', label: 'SARS query rounds' },
    // derive-written lifecycle stamps
    credits_earmarked_at: { type: 'string', label: 'Credits earmarked at' },
    submitted_at: { type: 'string', label: 'Submitted at' },
    allowance_granted_at: { type: 'string', label: 'Allowance granted at' },
    reconciled_at_coc: { type: 'string', label: 'Reconciled at' },
  },

  initial: 'claim_drafted',

  states: {
    claim_drafted: { label: 'Claim drafted', terminal: false, holder: 'taxpayer', sla: { days: 5 } },
    eligibility_screening: { label: 'Eligibility screening', terminal: false, holder: 'taxpayer', sla: { days: 5 } },
    credits_earmarked: { label: 'Credits earmarked', terminal: false, holder: 'taxpayer', sla: { days: 3 } },
    claim_submitted: { label: 'Claim submitted', terminal: false, holder: 'sars', sla: { days: 30 } },
    sars_review: { label: 'SARS review', terminal: false, holder: 'sars', sla: { days: 21 } },
    sars_query: { label: 'SARS query', terminal: false, holder: 'taxpayer', sla: { days: 14 } },
    allowance_granted: { label: 'Allowance granted', terminal: false, holder: 'taxpayer', sla: { days: 30 } },
    applied_to_return: { label: 'Applied to return', terminal: false, holder: 'sars', sla: { days: 30 } },
    reconciled: { label: 'Reconciled', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    clawed_back: { label: 'Clawed back', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'claim_drafted',
      by: ['taxpayer'],
      actorBecomes: 'taxpayer',
      label: 'Draft offset claim',
      intent: 'primary',
      input: {
        claim_number: { type: 'string' },
        taxpayer_name: { type: 'string' },
        tax_year: { type: 'number', required: true },
        industry_group: { type: 'string', required: true },
        gross_tax_liability_zar: { type: 'number', min: 0 },
        sars_party: { type: 'party', role: 'sars' },
      },
      guards: [],
    },
    {
      id: 'screen_eligibility',
      from: 'claim_drafted',
      to: 'eligibility_screening',
      by: ['taxpayer'],
      label: 'Screen eligibility',
      intent: 'primary',
      guards: [],
    },
    {
      // credits can only attach after screening, and only with a named retirement
      // evidence ref — cpEvidencePresent rejects an earmark with no cp_evidence_ref.
      id: 'earmark_credits',
      from: 'eligibility_screening',
      to: 'credits_earmarked',
      by: ['taxpayer'],
      label: 'Earmark retired credits',
      intent: 'primary',
      input: {
        credits_claimed_tco2e: { type: 'number', required: true, min: 0 },
        ct_rate_zar_per_tco2e: { type: 'number', required: true, min: 0 },
        cp_evidence_ref: { type: 'string' }, // not required here — cpEvidencePresent is the gate
      },
      guards: ['cpEvidencePresent'],
      derive: (f, at: Instant) => {
        const gross = num(f.gross_tax_liability_zar);
        const pct = f.industry_group === 'annex_2' ? 5 : 10; // s.13 cap
        const limitZar = (gross * pct) / 100;
        const rate = num(f.ct_rate_zar_per_tco2e);
        const raw = num(f.credits_claimed_tco2e) * rate;
        const value = Math.min(raw, limitZar);
        return {
          offset_tier: offsetTier(f.credits_claimed_tco2e),
          offset_limit_pct: pct,
          offset_limit_zar: limitZar,
          offset_value_zar: value,
          net_tax_liability_zar: gross - value,
          credits_unused_tco2e: rate > 0 ? (raw - value) / rate : 0,
          credits_earmarked_at: isoUtc(at),
        };
      },
    },
    {
      id: 'submit_claim',
      from: 'credits_earmarked',
      to: 'claim_submitted',
      by: ['taxpayer'],
      label: 'Submit to SARS',
      intent: 'primary',
      input: { sars_reference: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    { id: 'begin_review', from: 'claim_submitted', to: 'sars_review', by: ['sars'], label: 'Begin review', intent: 'primary', guards: [] },
    {
      id: 'raise_query',
      from: 'sars_review',
      to: 'sars_query',
      by: ['sars'],
      label: 'Raise query',
      intent: 'secondary',
      requiresReason: ['evidence_gap', 'valuation_dispute', 'eligibility_doubt', 'double_count_risk'],
      guards: [],
    },
    {
      id: 'respond_query',
      from: 'sars_query',
      to: 'sars_review',
      by: ['taxpayer'],
      label: 'Respond to query',
      intent: 'primary',
      guards: [],
      derive: (f, _at: Instant) => ({ query_round: (typeof f.query_round === 'number' ? f.query_round : 0) + 1 }),
    },
    {
      // revenue gate: the ONLY edge into allowance_granted, and it fires only from
      // sars_review. No self-granted allowance.
      id: 'grant_allowance',
      from: 'sars_review',
      to: 'allowance_granted',
      by: ['sars'],
      label: 'Grant offset allowance',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ allowance_granted_at: isoUtc(at) }),
    },
    {
      // structural: applying to the return can ONLY follow a granted allowance.
      id: 'apply_to_return',
      from: 'allowance_granted',
      to: 'applied_to_return',
      by: ['taxpayer'],
      label: 'Apply to carbon-tax return',
      intent: 'primary',
      input: { sars_reference: { type: 'string' } },
      guards: [],
    },
    {
      id: 'reconcile',
      from: 'applied_to_return',
      to: 'reconciled',
      by: ['sars'],
      label: 'Reconcile',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ reconciled_at_coc: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_claim',
      from: ['claim_submitted', 'sars_review', 'sars_query'],
      to: 'rejected',
      by: ['sars'],
      label: 'Reject claim',
      intent: 'destructive',
      requiresReason: ['credits_ineligible', 'cap_exceeded', 'evidence_insufficient', 'double_counted'],
      guards: [],
    },
    {
      id: 'claw_back',
      from: ['allowance_granted', 'applied_to_return'],
      to: 'clawed_back',
      by: ['sars'],
      label: 'Claw back allowance',
      intent: 'destructive',
      requiresReason: ['credit_reversal', 'fraud', 'reassessment', 'registry_correction'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['claim_drafted', 'eligibility_screening', 'credits_earmarked', 'claim_submitted'],
      to: 'withdrawn',
      by: ['taxpayer'],
      label: 'Withdraw claim',
      intent: 'destructive',
      requiresReason: ['filed_separately', 'no_longer_claiming', 'error_in_draft'],
      guards: [],
    },
  ],

  // submitted claims sit on a SARS statutory clock; record-only stub — the sweep
  // computes the real bar off the state sla days (ppa_contract pattern).
  timers: [{ onState: 'claim_submitted', after: { days: 0 }, fire: 'reject_claim', kind: 'time_bar' }],
};
