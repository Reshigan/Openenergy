// slb_kpi_ratchet — sustainability-linked bond/loan coupon-ratchet event lifecycle
// as data (legacy v1: oe_slb_kpi_ratchets, W204).
//
// An offtaker opens a KPI observation period against an SLB/SLL linked to a PPA.
// They start measurement, submit the actual reading, and request independent
// verification. Only after certify_kpi does calculate_ratchet become reachable,
// so a coupon step can never be computed off an unverified number — the state
// graph enforces the integrity gate, no guard required. The parties then agree
// the ratchet (or dispute it into arbitration, which resolves back into
// ratchet_agreed for final settlement per the legacy cascade), and it is
// finally applied, waived, or the KPI is recorded outright missed.
//
// certify_kpi additionally requires named assurance evidence
// (completenessEvidencePresent) — certification can't be a bare click.
// apply_ratchet is guarded by complianceHaltClear: a platform-wide compliance
// halt blocks new financing-term commitments (waive/miss/withdraw are always
// reachable — de-risking must never be blocked).
//
// settles:false — a coupon ratchet is a financing-term adjustment recorded
// here; the actual coupon payment happens on the bond's own servicing rails,
// not this chain (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const slbKpiRatchet: ChainDecl = {
  key: 'slb_kpi_ratchet',
  noun: 'SLB KPI ratchet event',
  refPrefix: 'SKR',
  title: (f) =>
    `${(f.slb_tier as string) ?? 'voluntary'} SLB ratchet — ${(f.kpi_name as string) ?? 'unnamed KPI'} (${(f.kpi_period as string) ?? 'period'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'JSE Debt Listings Requirements', provision: 'Sustainability Segment — SLB KPI/SPT disclosure', effect: 'requires' },
    { instrument: 'ICMA Sustainability-Linked Bond Principles 2023', provision: 'independent external verification of KPI performance', effect: 'requires' },
  ],
  roles: ['offtaker', 'verifier', 'regulator', 'operator'],

  fields: {
    ppa_ref: { type: 'string', label: 'Linked PPA ref' },
    offtaker_party: { type: 'party', role: 'offtaker', label: 'Offtaker / issuer' },
    // rule 4: any role that acts on a later edge must be a party from the
    // outset — verifier certifies, regulator resolves arbitration.
    verifier_party: { type: 'party', role: 'verifier', label: 'Independent verifier' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    kpi_period: { type: 'string', required: true, label: 'KPI period (e.g. 2026-H1)' },
    period_start: { type: 'string', label: 'Period start' },
    period_end: { type: 'string', label: 'Period end' },
    slb_tier: { type: 'string', required: true, label: 'Tier (voluntary/green_finance/listed/regulatory)' },
    kpi_name: { type: 'string', required: true, label: 'KPI name' },
    kpi_target_value: { type: 'number', label: 'KPI target value' },
    kpi_unit: { type: 'string', label: 'KPI unit' },
    kpi_actual_value: { type: 'number', label: 'KPI actual value' },
    kpi_data_source: { type: 'string', label: 'Data source (solax_api/metering/manual)' },
    completeness_ref: { type: 'string', label: 'Verification completeness ref' },
    ratchet_basis_points: { type: 'number', min: 0, label: 'Ratchet (basis points)' },
    ratchet_zar: { type: 'number', label: 'Ratchet amount (ZAR)' },
    ratchet_direction: { type: 'string', label: 'Direction (up/down/flat)' },
    dispute_ref: { type: 'string', label: 'Dispute reference' },
    dispute_description: { type: 'string', label: 'Dispute basis' },
    arbitration_ref: { type: 'string', label: 'Arbitration reference' },
    notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    kpi_submitted_at: { type: 'string', label: 'KPI data submitted at' },
    certified_at: { type: 'string', label: 'KPI certified at' },
    ratchet_calculated_at: { type: 'string', label: 'Ratchet calculated at' },
    ratchet_applied_at: { type: 'string', label: 'Ratchet applied at' },
  },

  initial: 'kpi_pending',

  states: {
    kpi_pending: { label: 'KPI pending', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    measuring: { label: 'Measuring', terminal: false, holder: 'offtaker', sla: { days: 14 } },
    kpi_submitted: { label: 'KPI submitted', terminal: false, holder: 'offtaker', sla: { days: 5 } },
    verification_requested: { label: 'Verification requested', terminal: false, holder: 'verifier', sla: { days: 21 } },
    kpi_certified: { label: 'KPI certified', terminal: false, holder: 'offtaker', sla: { days: 10 } },
    ratchet_calculated: { label: 'Ratchet calculated', terminal: false, holder: 'offtaker', sla: { days: 10 } },
    ratchet_agreed: { label: 'Ratchet agreed', terminal: false, holder: 'offtaker', sla: { days: 15 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'offtaker', sla: { days: 15 } },
    in_arbitration: { label: 'In arbitration', terminal: false, holder: 'regulator', sla: { days: 60 } },
    ratchet_applied: { label: 'Ratchet applied', terminal: true, holder: 'none' },
    ratchet_waived: { label: 'Ratchet waived', terminal: true, holder: 'none' },
    kpi_missed: { label: 'KPI missed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'kpi_pending',
      by: ['offtaker', 'operator'],
      actorBecomes: 'offtaker',
      label: 'Record SLB KPI',
      intent: 'primary',
      input: {
        ppa_ref: { type: 'string' },
        kpi_period: { type: 'string', required: true },
        period_start: { type: 'string' },
        period_end: { type: 'string' },
        slb_tier: { type: 'string', required: true },
        kpi_name: { type: 'string', required: true },
        kpi_target_value: { type: 'number' },
        kpi_unit: { type: 'string' },
        verifier_party: { type: 'party', role: 'verifier' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'start_measurement',
      from: 'kpi_pending',
      to: 'measuring',
      by: ['offtaker', 'operator'],
      label: 'Start measurement',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'submit_kpi_data',
      from: 'measuring',
      to: 'kpi_submitted',
      by: ['offtaker', 'operator'],
      label: 'Submit KPI data',
      intent: 'primary',
      input: {
        kpi_actual_value: { type: 'number', required: true },
        kpi_data_source: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ kpi_submitted_at: isoUtc(at) }),
    },
    {
      id: 'request_verification',
      from: 'kpi_submitted',
      to: 'verification_requested',
      by: ['offtaker', 'operator'],
      label: 'Request verification',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
    },
    {
      // integrity gate: the ONLY edge into kpi_certified, reachable ONLY from
      // verification_requested (which only request_verification reaches). A
      // ratchet can therefore never be calculated off a self-reported number.
      id: 'certify_kpi',
      from: 'verification_requested',
      to: 'kpi_certified',
      by: ['verifier'],
      label: 'Certify KPI',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' }, notes: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ certified_at: isoUtc(at) }),
    },
    {
      id: 'calculate_ratchet',
      from: 'kpi_certified',
      to: 'ratchet_calculated',
      by: ['offtaker', 'operator'],
      label: 'Calculate ratchet',
      intent: 'primary',
      input: {
        ratchet_basis_points: { type: 'number', min: 0 },
        ratchet_zar: { type: 'number' },
        ratchet_direction: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ ratchet_calculated_at: isoUtc(at) }),
    },
    {
      id: 'agree_ratchet',
      from: 'ratchet_calculated',
      to: 'ratchet_agreed',
      by: ['offtaker', 'operator'],
      label: 'Agree ratchet',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'apply_ratchet',
      from: 'ratchet_agreed',
      to: 'ratchet_applied',
      by: ['offtaker', 'operator'],
      label: 'Apply ratchet',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      // applying a coupon step is a financing-term commitment — blocked under
      // a platform-wide compliance halt, unlike waive/miss/withdraw below.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ ratchet_applied_at: isoUtc(at) }),
    },

    // --- dispute / arbitration branch -------------------------------------
    {
      id: 'raise_dispute',
      from: ['ratchet_calculated', 'ratchet_agreed'],
      to: 'disputed',
      by: ['offtaker', 'operator'],
      label: 'Raise dispute',
      intent: 'secondary',
      input: {
        dispute_ref: { type: 'string' },
        dispute_description: { type: 'string', required: true },
        notes: { type: 'string' },
      },
      requiresReason: ['data_source_contested', 'target_ambiguous', 'quantum_disputed', 'measurement_error'],
      guards: [],
    },
    {
      id: 'refer_to_arbitration',
      from: 'disputed',
      to: 'in_arbitration',
      by: ['offtaker', 'operator', 'regulator'],
      label: 'Refer to arbitration',
      intent: 'primary',
      input: { arbitration_ref: { type: 'string' }, notes: { type: 'string' } },
      guards: [],
    },
    {
      // legacy cascade: arbitration resolves back into ratchet_agreed for
      // final settlement, not straight to applied — apply_ratchet still gates it.
      id: 'resolve_arbitration',
      from: 'in_arbitration',
      to: 'ratchet_agreed',
      by: ['regulator'],
      label: 'Resolve arbitration',
      intent: 'primary',
      input: { ratchet_basis_points: { type: 'number', min: 0 }, ratchet_zar: { type: 'number' } },
      requiresReason: ['upheld_step_up', 'upheld_step_down', 'settled', 'directed'],
      guards: [],
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'waive_ratchet',
      from: ['ratchet_calculated', 'ratchet_agreed', 'disputed'],
      to: 'ratchet_waived',
      by: ['offtaker', 'operator'],
      label: 'Waive ratchet',
      intent: 'destructive',
      input: { notes: { type: 'string' } },
      requiresReason: ['de_minimis', 'lender_waiver', 'refinanced', 'force_majeure'],
      guards: [],
    },
    {
      id: 'record_kpi_miss',
      from: ['measuring', 'kpi_submitted', 'verification_requested', 'kpi_certified'],
      to: 'kpi_missed',
      by: ['offtaker', 'operator'],
      label: 'Record KPI miss',
      intent: 'destructive',
      input: { notes: { type: 'string' } },
      requiresReason: ['target_not_met', 'data_unavailable', 'measurement_failure', 'period_lapsed'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['kpi_pending', 'measuring', 'kpi_submitted'],
      to: 'withdrawn',
      by: ['offtaker', 'operator', 'system'],
      label: 'Withdraw',
      intent: 'destructive',
      input: { notes: { type: 'string' } },
      requiresReason: ['period_superseded', 'bond_redeemed', 'kpi_reframed', 'entered_in_error', 'period_expired'],
      guards: [],
    },
  ],

  // period time-bar: a KPI period never measured within 30 days stales out and
  // withdraws as period_expired (mirrors the sibling slb_kpi chain).
  timers: [{ onState: 'kpi_pending', after: { days: 30 }, fire: 'withdraw', kind: 'time_bar', reason: 'period_expired' }],
};
