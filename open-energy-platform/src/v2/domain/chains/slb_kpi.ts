// slb_kpi — sustainability-linked bond/loan KPI ratchet lifecycle as data.
//
// An issuer opens a KPI observation period against an SLB. They measure the
// actual (RE %, carbon intensity, …), an INDEPENDENT verifier certifies it, and
// only then does the arranger compute the coupon ratchet (step-up if the KPI was
// missed, step-down if beaten) and apply it — or the parties dispute it into
// arbitration.
//
// The integrity spine is structural, not a guard: certify_kpi leaves ONLY
// kpi_verification, and the ONLY path into kpi_verification is
// submit_for_verification. So a KPI can NEVER be certified — and therefore a
// coupon ratchet can never be applied — on an unverified self-reported number.
// certify_kpi additionally requires named assurance evidence
// (completenessEvidencePresent) so certification can't be a bare click.
//
// settles:false — a coupon ratchet is a financing-term adjustment recorded here;
// the actual custody/payment happens on the servicing rails, not this chain
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure: coupon direction off the certified met/missed flag. No clock, no env.
const ratchetDirection = (met: Json | undefined): string => {
  if (met === true) return 'step_down'; // KPI beaten → borrower rewarded
  if (met === false) return 'step_up'; // KPI missed → coupon penalty
  return 'neutral';
};

export const slbKpi: ChainDecl = {
  key: 'slb_kpi',
  noun: 'SLB KPI ratchet',
  refPrefix: 'SK',
  title: (f) =>
    `${(f.slb_tier as string) ?? 'voluntary'} SLB KPI — ${(f.kpi_name as string) ?? 'unnamed KPI'} (${(f.kpi_period as string) ?? 'period'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'JSE Debt Listings Requirements', provision: 'Sustainability Segment — SLB KPI/SPT disclosure', effect: 'requires' },
    { instrument: 'ICMA Sustainability-Linked Bond Principles 2023', provision: 'independent external verification of KPI performance', effect: 'requires' },
  ],
  roles: ['issuer', 'verifier', 'arranger', 'regulator'],

  fields: {
    slb_ref: { type: 'string', label: 'SLB / facility ref' },
    ppa_ref: { type: 'string', label: 'Linked PPA ref' },
    issuer_party: { type: 'party', role: 'issuer', label: 'Issuer / borrower' },
    verifier_party: { type: 'party', role: 'verifier', label: 'External verifier' },
    arranger_party: { type: 'party', role: 'arranger', label: 'Arranger / agent' },
    slb_tier: { type: 'string', required: true, label: 'Tier (voluntary/green_finance/listed/regulatory)' },
    kpi_period: { type: 'string', required: true, label: 'KPI period (e.g. 2026-Q2)' },
    kpi_name: { type: 'string', required: true, label: 'KPI name' },
    kpi_unit: { type: 'string', label: 'KPI unit (%, gCO2/kWh, MWh)' },
    kpi_target_value: { type: 'number', label: 'KPI target (SPT)' },
    kpi_actual_value: { type: 'number', label: 'KPI actual' },
    kpi_data_source: { type: 'string', label: 'Data source (solax_api/metering/manual)' },
    kpi_met: { type: 'boolean', label: 'KPI met at target' },
    verifier_name: { type: 'string', label: 'Verifier name' },
    verifier_report_ref: { type: 'string', label: 'Verifier assurance report ref' },
    ratchet_basis_points: { type: 'number', min: 0, label: 'Coupon step (bps)' },
    ratchet_zar: { type: 'number', label: 'Ratchet ZAR equivalent' },
    ratchet_direction: { type: 'string', label: 'Ratchet direction' },
    dispute_description: { type: 'string', label: 'Dispute description' },
    // written by derive, never by the client
    kpi_measured_at: { type: 'string', label: 'KPI measured at' },
    certified_at: { type: 'string', label: 'KPI certified at' },
    ratchet_applied_at: { type: 'string', label: 'Ratchet applied at' },
  },

  initial: 'kpi_pending',

  states: {
    kpi_pending: { label: 'KPI pending', terminal: false, holder: 'issuer', sla: { days: 30 } },
    kpi_measurement: { label: 'KPI measurement', terminal: false, holder: 'issuer', sla: { days: 14 } },
    kpi_verification: { label: 'KPI verification', terminal: false, holder: 'verifier', sla: { days: 30 } },
    kpi_certified: { label: 'KPI certified', terminal: false, holder: 'arranger', sla: { days: 10 } },
    ratchet_calculation: { label: 'Ratchet calculation', terminal: false, holder: 'arranger', sla: { days: 10 } },
    ratchet_agreed: { label: 'Ratchet agreed', terminal: false, holder: 'arranger', sla: { days: 5 } },
    ratchet_disputed: { label: 'Ratchet disputed', terminal: false, holder: 'issuer' },
    arbitration: { label: 'Arbitration', terminal: false, holder: 'regulator', sla: { days: 60 } },
    ratchet_applied: { label: 'Ratchet applied', terminal: true, holder: 'none' },
    ratchet_waived: { label: 'Ratchet waived', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'kpi_pending',
      by: ['issuer', 'arranger'],
      actorBecomes: 'issuer',
      label: 'Open KPI period',
      intent: 'primary',
      input: {
        slb_ref: { type: 'string' },
        ppa_ref: { type: 'string' },
        slb_tier: { type: 'string', required: true },
        kpi_period: { type: 'string', required: true },
        kpi_name: { type: 'string', required: true },
        kpi_unit: { type: 'string' },
        kpi_target_value: { type: 'number' },
        kpi_data_source: { type: 'string' },
        // later-edge actors must be parties from the outset (rule 4)
        verifier_party: { type: 'party', role: 'verifier' },
        arranger_party: { type: 'party', role: 'arranger' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_measurement',
      from: 'kpi_pending',
      to: 'kpi_measurement',
      by: ['issuer'],
      label: 'Record KPI actual',
      intent: 'primary',
      input: {
        kpi_actual_value: { type: 'number', required: true },
        kpi_data_source: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ kpi_measured_at: isoUtc(at) }),
    },
    {
      id: 'submit_for_verification',
      from: 'kpi_measurement',
      to: 'kpi_verification',
      by: ['issuer', 'arranger'],
      label: 'Submit for verification',
      intent: 'primary',
      input: { verifier_name: { type: 'string' } },
      guards: [],
    },
    {
      // integrity gate: the ONLY edge into kpi_certified, reachable ONLY from
      // kpi_verification (which only submit_for_verification reaches). A KPI can
      // therefore never be certified on an unverified number. Assurance evidence
      // (completeness_ref) is mandatory via completenessEvidencePresent.
      id: 'certify_kpi',
      from: 'kpi_verification',
      to: 'kpi_certified',
      by: ['verifier'],
      label: 'Certify KPI',
      intent: 'primary',
      input: {
        kpi_met: { type: 'boolean', required: true },
        verifier_report_ref: { type: 'string' },
        completeness_ref: { type: 'string' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ certified_at: isoUtc(at) }),
    },
    {
      id: 'calculate_ratchet',
      from: 'kpi_certified',
      to: 'ratchet_calculation',
      by: ['arranger'],
      label: 'Calculate ratchet',
      intent: 'primary',
      input: {
        ratchet_basis_points: { type: 'number', min: 0 },
        ratchet_zar: { type: 'number' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ ratchet_direction: ratchetDirection(f.kpi_met) }),
    },
    {
      id: 'agree_ratchet',
      from: 'ratchet_calculation',
      to: 'ratchet_agreed',
      by: ['issuer', 'arranger'],
      label: 'Agree ratchet',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'apply_ratchet',
      from: 'ratchet_agreed',
      to: 'ratchet_applied',
      by: ['arranger'],
      label: 'Apply ratchet',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ ratchet_applied_at: isoUtc(at) }),
    },

    // --- dispute / arbitration branch -----------------------------------------
    {
      id: 'dispute_ratchet',
      from: ['ratchet_calculation', 'ratchet_agreed'],
      to: 'ratchet_disputed',
      by: ['issuer', 'arranger'],
      label: 'Dispute ratchet',
      intent: 'secondary',
      input: { dispute_description: { type: 'string', required: true } },
      requiresReason: ['data_source_contested', 'target_ambiguous', 'quantum_disputed', 'measurement_error'],
      guards: [],
    },
    {
      id: 'refer_arbitration',
      from: 'ratchet_disputed',
      to: 'arbitration',
      by: ['issuer', 'arranger', 'regulator'],
      label: 'Refer to arbitration',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'resolve_arbitration',
      from: 'arbitration',
      to: 'ratchet_applied',
      by: ['regulator'],
      label: 'Resolve arbitration (apply)',
      intent: 'primary',
      requiresReason: ['upheld_step_up', 'upheld_step_down', 'settled', 'directed'],
      guards: [],
      derive: (_f, at: Instant) => ({ ratchet_applied_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'waive_ratchet',
      from: ['ratchet_calculation', 'ratchet_agreed', 'ratchet_disputed'],
      to: 'ratchet_waived',
      by: ['arranger'],
      label: 'Waive ratchet',
      intent: 'destructive',
      requiresReason: ['de_minimis', 'lender_waiver', 'refinanced', 'force_majeure'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['kpi_pending', 'kpi_measurement'],
      to: 'withdrawn',
      by: ['issuer'],
      label: 'Withdraw KPI period',
      intent: 'destructive',
      requiresReason: ['period_superseded', 'bond_redeemed', 'kpi_reframed', 'entered_in_error'],
      guards: [],
    },
  ],

  // period time-bar: a KPI period that never gets measured stales out. record-only
  // stub; the sweep computes the real bar off the state sla days (ppa_contract
  // pattern). The sweep supplies withdraw's reason_code on fire.
  timers: [{ onState: 'kpi_pending', after: { days: 0 }, fire: 'withdraw', kind: 'time_bar' }],
};
