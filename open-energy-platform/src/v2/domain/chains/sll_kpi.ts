// sll_kpi — sustainability-linked loan KPI compliance lifecycle as data.
//
// A borrower opens a KPI observation period against a facility; the spine runs
// set_baseline → collect_measurement → verify (independent) → attest → compute
// ratchet → amend margin. The integrity invariant is STRUCTURAL, not a guard:
// the ONLY edge into ratchet_computed is compute_ratchet from kpi_attested, and
// the only path into kpi_attested is attest from independent_verification. So a
// margin ratchet can NEVER be applied to a KPI that was never independently
// verified and attested — the state graph forbids it, no guard needed. A cured
// breach re-enters the measurement→verify→attest spine (confirm_cure lands on
// measurement_collected), so it too must be re-verified before any ratchet.
//
// attest additionally carries completenessEvidencePresent — an ESG attestation
// cannot be signed without a named completeness-evidence ref (TCFD / disclosure
// battery). settles:false — a KPI ratchet is a covenant control, never a payment
// leg; the actual margin cashflow settles on the loan's own facility (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const num = (v: Json | undefined): number => (typeof v === 'number' ? v : 0);
const round2 = (n: number): number => Math.round(n * 100) / 100;

// severity bucket off the |variance| between measured and target KPI value.
const complianceTier = (variancePct: number): string => {
  const m = Math.abs(variancePct);
  if (m >= 25) return 'severe';
  if (m >= 10) return 'material';
  if (m >= 3) return 'standard';
  return 'minor';
};

export const sllKpi: ChainDecl = {
  key: 'sll_kpi',
  noun: 'Sustainability-linked loan KPI',
  refPrefix: 'SLLK',
  title: (f) =>
    `${(f.kpi_code as string) ?? 'KPI'} SLL — ${(f.facility_name as string) ?? 'facility'} (${(f.kpi_period_label as string) ?? 'period'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'LMA Sustainability-Linked Loan Principles 2023', provision: 'KPI selection, external verification & margin ratchet', effect: 'requires' },
    { instrument: 'JSE Sustainability Segment Listing Requirements', provision: 'independent external review of KPI performance', effect: 'requires' },
  ],
  roles: ['borrower', 'lender', 'verifier', 'regulator'],

  fields: {
    compliance_number: { type: 'string', label: 'Compliance number' },
    borrower_party: { type: 'party', role: 'borrower', label: 'Borrower' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender / facility agent' },
    verifier_party: { type: 'party', role: 'verifier', label: 'Independent verifier' },
    facility_name: { type: 'string', required: true, label: 'Facility' },
    outstanding_zar: { type: 'number', min: 0, label: 'Outstanding (ZAR)' },
    materiality_class: { type: 'string', label: 'Materiality class' },
    kpi_code: { type: 'string', required: true, label: 'KPI code' },
    kpi_name: { type: 'string', label: 'KPI name' },
    kpi_unit: { type: 'string', label: 'KPI unit' },
    kpi_period_label: { type: 'string', required: true, label: 'KPI period label' },
    base_margin_bps: { type: 'number', label: 'Base margin (bps)' },
    ratchet_step_bps: { type: 'number', min: 0, label: 'Ratchet step (bps)' },
    max_ratchet_bps: { type: 'number', min: 0, label: 'Max ratchet (bps)' },
    kpi_baseline_value: { type: 'number', label: 'Baseline value' },
    kpi_target_value: { type: 'number', label: 'Target value' },
    kpi_measured_value: { type: 'number', label: 'Measured value' },
    baseline_ref: { type: 'string', label: 'Baseline ref' },
    measurement_ref: { type: 'string', label: 'Measurement ref' },
    verification_ref: { type: 'string', label: 'Verification ref' },
    completeness_ref: { type: 'string', label: 'Completeness evidence ref' },
    attestation_ref: { type: 'string', label: 'Attestation ref' },
    cure_ref: { type: 'string', label: 'Cure ref' },
    // written by derive, never by the client
    effective_variance_pct: { type: 'number', label: 'Effective variance (%)' },
    ratchet_bps: { type: 'number', label: 'Ratchet this period (bps)' },
    effective_margin_bps: { type: 'number', label: 'Effective margin (bps)' },
    compliance_tier: { type: 'string', label: 'Compliance tier' },
    baseline_set_at: { type: 'string', label: 'Baseline set at' },
    measured_at: { type: 'string', label: 'Measurement collected at' },
    verified_at: { type: 'string', label: 'Independently verified at' },
    attested_at: { type: 'string', label: 'Attested at' },
    ratchet_computed_at: { type: 'string', label: 'Ratchet computed at' },
    margin_amended_at: { type: 'string', label: 'Margin amended at' },
  },

  initial: 'kpi_period_open',

  states: {
    kpi_period_open: { label: 'KPI period open', terminal: false, holder: 'borrower', sla: { days: 30 } },
    baseline_set: { label: 'Baseline set', terminal: false, holder: 'borrower', sla: { days: 14 } },
    measurement_collected: { label: 'Measurement collected', terminal: false, holder: 'borrower', sla: { days: 7 } },
    independent_verification: { label: 'Independent verification', terminal: false, holder: 'verifier', sla: { days: 21 } },
    kpi_attested: { label: 'KPI attested', terminal: false, holder: 'lender', sla: { days: 7 } },
    ratchet_computed: { label: 'Ratchet computed', terminal: false, holder: 'lender', sla: { days: 3 } },
    margin_amended: { label: 'Margin amended', terminal: true, holder: 'none' },
    breach_recorded: { label: 'Breach recorded', terminal: false, holder: 'lender', sla: { days: 5 } },
    cure_period: { label: 'Cure period', terminal: false, holder: 'borrower', sla: { days: 30 } },
    cure_failed: { label: 'Cure failed', terminal: true, holder: 'none' },
    restatement: { label: 'Restatement', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'kpi_period_open',
      by: ['borrower', 'lender'],
      actorBecomes: 'borrower',
      label: 'Open KPI period',
      intent: 'primary',
      input: {
        facility_name: { type: 'string', required: true },
        outstanding_zar: { type: 'number', min: 0 },
        materiality_class: { type: 'string' },
        kpi_code: { type: 'string', required: true },
        kpi_name: { type: 'string' },
        kpi_unit: { type: 'string' },
        kpi_period_label: { type: 'string', required: true },
        base_margin_bps: { type: 'number' },
        ratchet_step_bps: { type: 'number', min: 0 },
        max_ratchet_bps: { type: 'number', min: 0 },
        lender_party: { type: 'party', role: 'lender' },
        verifier_party: { type: 'party', role: 'verifier' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'set_baseline',
      from: 'kpi_period_open',
      to: 'baseline_set',
      by: ['borrower', 'lender'],
      label: 'Set baseline & target',
      intent: 'primary',
      input: {
        kpi_baseline_value: { type: 'number', required: true },
        kpi_target_value: { type: 'number', required: true },
        baseline_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ baseline_set_at: isoUtc(at) }),
    },
    {
      id: 'collect_measurement',
      from: 'baseline_set',
      to: 'measurement_collected',
      by: ['borrower'],
      label: 'Collect measurement',
      intent: 'primary',
      input: {
        kpi_measured_value: { type: 'number', required: true },
        measurement_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ measured_at: isoUtc(at) }),
    },
    {
      // structural verification gate: the only path forward runs through an
      // independent verifier before anything can be attested or ratcheted.
      id: 'verify',
      from: 'measurement_collected',
      to: 'independent_verification',
      by: ['verifier'],
      label: 'Independent verification',
      intent: 'primary',
      input: { verification_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      id: 'attest',
      from: 'independent_verification',
      to: 'kpi_attested',
      by: ['lender'],
      label: 'Attest KPI',
      intent: 'primary',
      // completeness_ref is NOT a required field — the guard is the sole gate, so
      // its absence surfaces MISSING_COMPLETENESS_EVIDENCE, not a generic BAD_INPUT.
      input: {
        completeness_ref: { type: 'string' },
        attestation_ref: { type: 'string' },
      },
      // an ESG attestation needs a named completeness-evidence ref (TCFD/disclosure).
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ attested_at: isoUtc(at) }),
    },
    {
      // ONLY edge into ratchet_computed, and it can only fire from kpi_attested —
      // so a ratchet cannot be computed on an unverified/unattested KPI. No guard.
      id: 'compute_ratchet',
      from: 'kpi_attested',
      to: 'ratchet_computed',
      by: ['lender'],
      label: 'Compute margin ratchet',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => {
        const target = num(f.kpi_target_value);
        const measured = num(f.kpi_measured_value);
        const variance = target !== 0 ? ((measured - target) / target) * 100 : 0;
        // ponytail: higher measured = better (emissions-reduction %, renewable %).
        // absolute-lower-is-better KPIs invert kpi_target_value at ingest.
        const met = measured >= target;
        const step = num(f.ratchet_step_bps) || 5;
        const max = num(f.max_ratchet_bps) || 25;
        const ratchet = met ? -Math.min(step, max) : Math.min(step, max);
        return {
          effective_variance_pct: round2(variance),
          ratchet_bps: ratchet,
          effective_margin_bps: num(f.base_margin_bps) + ratchet,
          compliance_tier: complianceTier(variance),
          ratchet_computed_at: isoUtc(at),
        };
      },
    },
    {
      id: 'amend_margin',
      from: 'ratchet_computed',
      to: 'margin_amended',
      by: ['lender'],
      label: 'Amend facility margin',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ margin_amended_at: isoUtc(at) }),
    },

    // --- breach / cure --------------------------------------------------------
    {
      id: 'record_breach',
      from: ['measurement_collected', 'independent_verification', 'kpi_attested'],
      to: 'breach_recorded',
      by: ['lender'],
      label: 'Record KPI breach',
      intent: 'destructive',
      requiresReason: ['kpi_missed', 'measurement_gap', 'verification_failed', 'disclosure_incomplete'],
      guards: [],
    },
    {
      id: 'open_cure',
      from: 'breach_recorded',
      to: 'cure_period',
      by: ['lender', 'borrower'],
      label: 'Open cure period',
      intent: 'primary',
      input: { cure_ref: { type: 'string' } },
      guards: [],
    },
    {
      // a cured breach re-enters the measurement→verify→attest spine, so it must
      // be independently re-verified before any ratchet — same structural gate.
      id: 'confirm_cure',
      from: 'cure_period',
      to: 'measurement_collected',
      by: ['borrower', 'lender'],
      label: 'Confirm cure & re-measure',
      intent: 'primary',
      input: {
        kpi_measured_value: { type: 'number', required: true },
        measurement_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ measured_at: isoUtc(at) }),
    },
    {
      id: 'fail_cure',
      from: 'cure_period',
      to: 'cure_failed',
      by: ['lender'],
      label: 'Fail cure',
      intent: 'destructive',
      requiresReason: ['cure_window_elapsed', 'remediation_insufficient', 'no_response'],
      guards: [],
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'restate',
      from: ['baseline_set', 'measurement_collected', 'independent_verification', 'kpi_attested', 'ratchet_computed'],
      to: 'restatement',
      by: ['borrower', 'lender'],
      label: 'Restate KPI',
      intent: 'destructive',
      requiresReason: ['data_error', 'methodology_change', 'verifier_correction', 'scope_change'],
      guards: [],
    },
    {
      id: 'cancel',
      from: ['kpi_period_open', 'baseline_set', 'measurement_collected'],
      to: 'cancelled',
      by: ['borrower', 'lender'],
      label: 'Cancel KPI period',
      intent: 'destructive',
      requiresReason: ['loan_repaid', 'facility_terminated', 'kpi_deprecated'],
      guards: [],
    },
  ],

  // cure time-bar: an uncured breach fails out at the cure window. record-only
  // stub; the sweep computes the real bar off the cure_period state sla.
  timers: [{ onState: 'cure_period', after: { days: 0 }, fire: 'fail_cure', kind: 'time_bar' }],
};
