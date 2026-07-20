// bess_soh — battery energy storage system state-of-health monitoring and
// augmentation lifecycle, as data.
//
// An ESCO/O&M provider opens a monitoring programme for a BESS site with a
// baseline SoH reading, activates continuous monitoring, and the programme
// tracks degradation drift through to either a clean recommission or an
// augmentation cycle (assess cause → require augmentation → plan → execute
// works → complete → recommission) when SoH falls through the contracted
// floor. Either side of that can be disputed (raise_dispute / resolve_dispute
// loop back to assessment_pending) or exited early via decommission /
// cancel_programme.
//
// Structural honesty (no invented guards):
//  - recommission is reachable ONLY from augmentation_complete, so a programme
//    can never be recommissioned without the works cycle actually finishing —
//    the state graph enforces the sign-off, no guard required.
//  - open is guarded by complianceHaltClear: opening a new monitoring
//    programme is a new commitment, blocked under a platform-wide halt like
//    every other @new edge in this bundle.
//  - single-actor chain (esco owns/operates the asset; operator is platform
//    staff acting on their behalf) — no counterpartyDistinct guard, there is
//    no second commercial party to a monitoring programme.
//
// settles:false — augmentation_capex_zar and the capacity/discount-rate
// inputs are informational planning figures for the augmentation business
// case; this chain never posts a payment or moves quantum (R-S5-1).
// No legalBasis cited — BESS SoH monitoring is an O&M/warranty practice, not
// itself a defined obligation under ERA 2006 / NERSA Grid Code / REIPPPP; a
// citation would be fabricated.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const bessSoh: ChainDecl = {
  key: 'bess_soh',
  noun: 'BESS state-of-health programme',
  refPrefix: 'BESS',
  title: (f) => `BESS SoH — ${(f.site_name as string) ?? 'unnamed site'} (${(f.owner_name as string) ?? 'owner TBC'})`,
  visibility: 'owner',
  settles: false,
  roles: ['esco', 'operator'],

  fields: {
    site_name: { type: 'string', required: true, label: 'Site name' },
    owner_name: { type: 'string', label: 'Owner / O&M provider' },
    owner_party: { type: 'party', role: 'esco', label: 'Owner / O&M provider entity' },
    current_soh_pct: { type: 'number', min: 0, max: 100, label: 'Current SoH (%)' },
    total_throughput_mwh: { type: 'number', min: 0, label: 'Total throughput (MWh)' },
    cycle_fade_attribution_pct: { type: 'number', min: 0, max: 100, label: 'Cycle-fade attribution (%)' },
    augmentation_capex_zar: { type: 'number', min: 0, label: 'Augmentation capex (ZAR) — informational' },
    augmentation_capex_per_kwh: { type: 'number', min: 0, label: 'Augmentation capex / kWh (ZAR)' },
    capacity_rate_per_mw_year: { type: 'number', min: 0, label: 'Capacity rate / MW-year (ZAR)' },
    residual_warranty_years: { type: 'number', min: 0, label: 'Residual warranty (years)' },
    discount_rate_pct: { type: 'number', min: 0, max: 100, label: 'Discount rate (%)' },
    augmentation_works_ref: { type: 'string', label: 'Augmentation works reference' },
    augmentation_completed_mwh: { type: 'number', min: 0, label: 'Augmentation completed (MWh)' },
    programme_summary: { type: 'string', label: 'Programme summary' },
    programme_basis: { type: 'string', label: 'Programme basis' },
    last_action_ref: { type: 'string', label: 'Action reference' },
    dispute_ground: { type: 'string', label: 'Dispute ground' },
    dispute_resolution_ref: { type: 'string', label: 'Dispute resolution reference' },
    regulator_ref: { type: 'string', label: 'Regulator reference' },
    reason_code: { type: 'string', label: 'Reason code' },
    notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    baseline_set_at: { type: 'string', label: 'Baseline set at' },
    monitoring_activated_at: { type: 'string', label: 'Monitoring activated at' },
    drift_detected_at: { type: 'string', label: 'Drift detected at' },
    assessment_started_at: { type: 'string', label: 'Assessment started at' },
    augmentation_required_at: { type: 'string', label: 'Augmentation required at' },
    works_started_at: { type: 'string', label: 'Works started at' },
    works_completed_at: { type: 'string', label: 'Works completed at' },
    recommissioned_at: { type: 'string', label: 'Recommissioned at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    dispute_resolved_at: { type: 'string', label: 'Dispute resolved at' },
    decommissioned_at: { type: 'string', label: 'Decommissioned at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
  },

  initial: 'baseline_set',

  states: {
    baseline_set: { label: 'Baseline set', terminal: false, holder: 'esco' },
    monitoring_active: { label: 'Monitoring active', terminal: false, holder: 'esco' },
    drift_detected: { label: 'Drift detected', terminal: false, holder: 'esco' },
    assessment_pending: { label: 'Assessment pending', terminal: false, holder: 'esco' },
    augmentation_required: { label: 'Augmentation required', terminal: false, holder: 'esco' },
    augmentation_planned: { label: 'Augmentation planned', terminal: false, holder: 'esco' },
    augmentation_in_progress: { label: 'Augmentation in progress', terminal: false, holder: 'esco' },
    augmentation_complete: { label: 'Augmentation complete', terminal: false, holder: 'esco' },
    disputed: { label: 'Disputed', terminal: false, holder: 'esco' },
    recommissioned: { label: 'Recommissioned', terminal: true, holder: 'none' },
    decommissioned: { label: 'Decommissioned', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'baseline_set',
      by: ['esco', 'operator'],
      actorBecomes: 'esco',
      label: 'Open BESS SoH programme',
      intent: 'primary',
      input: {
        site_name: { type: 'string', required: true },
        owner_name: { type: 'string' },
        owner_party: { type: 'party', role: 'esco' },
        current_soh_pct: { type: 'number', min: 0, max: 100 },
        total_throughput_mwh: { type: 'number', min: 0 },
      },
      // opening a new monitoring programme is a new commitment — blocked under halt.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ baseline_set_at: isoUtc(at) }),
    },
    {
      id: 'activate_monitoring',
      from: 'baseline_set',
      to: 'monitoring_active',
      by: ['esco', 'operator'],
      label: 'Activate monitoring',
      intent: 'primary',
      input: {
        current_soh_pct: { type: 'number', min: 0, max: 100 },
        total_throughput_mwh: { type: 'number', min: 0 },
        programme_summary: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ monitoring_activated_at: isoUtc(at) }),
    },
    {
      id: 'detect_drift',
      from: 'monitoring_active',
      to: 'drift_detected',
      by: ['esco', 'operator'],
      label: 'Detect drift',
      intent: 'primary',
      input: {
        current_soh_pct: { type: 'number', min: 0, max: 100 },
        total_throughput_mwh: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ drift_detected_at: isoUtc(at) }),
    },
    {
      id: 'assess_cause',
      from: 'drift_detected',
      to: 'assessment_pending',
      by: ['esco', 'operator'],
      label: 'Assess cause',
      intent: 'primary',
      input: {
        current_soh_pct: { type: 'number', min: 0, max: 100 },
        cycle_fade_attribution_pct: { type: 'number', min: 0, max: 100 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ assessment_started_at: isoUtc(at) }),
    },
    {
      id: 'require_augmentation',
      from: 'assessment_pending',
      to: 'augmentation_required',
      by: ['esco', 'operator'],
      label: 'Require augmentation',
      intent: 'primary',
      input: {
        current_soh_pct: { type: 'number', min: 0, max: 100 },
        augmentation_capex_per_kwh: { type: 'number', min: 0 },
        capacity_rate_per_mw_year: { type: 'number', min: 0 },
        residual_warranty_years: { type: 'number', min: 0 },
        discount_rate_pct: { type: 'number', min: 0, max: 100 },
        programme_basis: { type: 'string' },
        reason_code: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ augmentation_required_at: isoUtc(at) }),
    },
    {
      id: 'plan_augmentation',
      from: 'augmentation_required',
      to: 'augmentation_planned',
      by: ['esco', 'operator'],
      label: 'Plan augmentation',
      intent: 'primary',
      input: {
        augmentation_works_ref: { type: 'string' },
        augmentation_capex_per_kwh: { type: 'number', min: 0 },
        programme_basis: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'start_works',
      from: 'augmentation_planned',
      to: 'augmentation_in_progress',
      by: ['esco', 'operator'],
      label: 'Start works',
      intent: 'primary',
      input: { augmentation_works_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ works_started_at: isoUtc(at) }),
    },
    {
      id: 'complete_works',
      from: 'augmentation_in_progress',
      to: 'augmentation_complete',
      by: ['esco', 'operator'],
      label: 'Complete works',
      intent: 'primary',
      input: {
        augmentation_completed_mwh: { type: 'number', min: 0 },
        current_soh_pct: { type: 'number', min: 0, max: 100 },
        last_action_ref: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ works_completed_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into recommissioned, and it only fires from
      // augmentation_complete — so a programme can never recommission
      // without the works cycle actually finishing.
      id: 'recommission',
      from: 'augmentation_complete',
      to: 'recommissioned',
      by: ['esco', 'operator'],
      label: 'Recommission',
      intent: 'primary',
      input: {
        current_soh_pct: { type: 'number', min: 0, max: 100 },
        programme_summary: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ recommissioned_at: isoUtc(at) }),
    },

    // --- dispute loop -----------------------------------------------------
    {
      id: 'raise_dispute',
      from: ['assessment_pending', 'augmentation_required', 'augmentation_planned', 'augmentation_in_progress', 'augmentation_complete'],
      to: 'disputed',
      by: ['esco', 'operator'],
      label: 'Raise dispute',
      intent: 'destructive',
      input: {
        dispute_ground: { type: 'string' },
        programme_basis: { type: 'string' },
        regulator_ref: { type: 'string' },
        notes: { type: 'string' },
      },
      requiresReason: ['soh_measurement_dispute', 'augmentation_scope_dispute', 'warranty_dispute', 'manufacturer_data_dispute'],
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'assessment_pending',
      by: ['esco', 'operator'],
      label: 'Resolve dispute',
      intent: 'primary',
      input: {
        dispute_resolution_ref: { type: 'string' },
        current_soh_pct: { type: 'number', min: 0, max: 100 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ dispute_resolved_at: isoUtc(at) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'decommission',
      from: [
        'baseline_set',
        'monitoring_active',
        'drift_detected',
        'assessment_pending',
        'augmentation_required',
        'augmentation_planned',
        'augmentation_in_progress',
        'augmentation_complete',
        'disputed',
      ],
      to: 'decommissioned',
      by: ['esco', 'operator'],
      label: 'Decommission',
      intent: 'destructive',
      input: {
        current_soh_pct: { type: 'number', min: 0, max: 100 },
        programme_summary: { type: 'string' },
        notes: { type: 'string' },
      },
      requiresReason: ['end_of_life', 'asset_retired', 'safety_concern', 'commercial_decision', 'regulatory_directive'],
      guards: [],
      derive: (_f, at: Instant) => ({ decommissioned_at: isoUtc(at) }),
    },
    {
      id: 'cancel_programme',
      from: [
        'baseline_set',
        'monitoring_active',
        'drift_detected',
        'assessment_pending',
        'augmentation_required',
        'augmentation_planned',
        'augmentation_in_progress',
        'disputed',
      ],
      to: 'cancelled',
      by: ['esco', 'operator'],
      label: 'Cancel programme',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
  ],
};
