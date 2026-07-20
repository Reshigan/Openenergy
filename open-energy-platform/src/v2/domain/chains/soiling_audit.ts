// soiling_audit — PV soiling-loss audit + cleaning-intervention lifecycle as data.
//
// A plant owner opens a soiling period against a facility; a supervisor
// schedules and runs a field inspection, measures the soiling ratio (which
// tiers the loss: minor/standard/material/severe), an economic assessment sizes
// the cleaning ROI, cleaning is authorised → performed by a contractor →
// re-measured, the recovered gain is validated, and the audit settles.
//
// Two spines are structural, not guarded:
//  - measure BEFORE authorise: the ONLY path into economic_assessment_done is
//    assess_economics from soiling_measured, and the ONLY path into
//    cleaning_authorized is authorize_cleaning from there. You cannot authorise
//    a clean on an unmeasured plant.
//  - validate BEFORE settle: the ONLY edge into settled is settle from
//    gain_validated, whose only inbound edge is validate_gain from
//    post_clean_measured. You cannot settle a recovery that was never re-measured
//    — so a claimed gain is always evidenced by a post-clean reading.
//
// A ≥100 MW strategic generator crosses to the regulator to authorise the
// intervention (water-restriction / WUL context): authorize_cleaning is guarded
// by regulatorPresentIfStrategic (keys off capacity_mw).
//
// settles:false — a soiling audit is an asset-integrity control, not a payment
// (R-S5-1). The zar figures are loss/ROI estimates, not a settled cashflow.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure tier bucketing off the soiling-loss ratio (%). Higher = dirtier. No clock.
const soilingTier = (ratio: Json | undefined): string => {
  if (typeof ratio !== 'number') return 'unassessed';
  if (ratio >= 15) return 'severe';
  if (ratio >= 8) return 'material';
  if (ratio >= 3) return 'standard';
  return 'minor';
};

// pure authority escalation off the tier.
const authorityForTier = (tier: string): string => {
  if (tier === 'severe') return 'cfo';
  if (tier === 'material') return 'asset_director';
  if (tier === 'standard') return 'plant_manager';
  return 'site_supervisor';
};

const num = (v: Json | undefined): number => (typeof v === 'number' ? v : 0);

export const soilingAudit: ChainDecl = {
  key: 'soiling_audit',
  noun: 'Soiling audit',
  refPrefix: 'SA',
  title: (f) =>
    `Soiling audit — ${(f.facility_name as string) ?? (f.facility_id as string) ?? 'facility'} (${(f.current_tier as string) ?? 'unassessed'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'generator performance & availability reporting', effect: 'requires' },
    { instrument: 'National Water Act 1998', provision: 's39 WUL — panel-wash water use', effect: 'restricts' },
  ],
  roles: ['owner', 'supervisor', 'contractor', 'regulator', 'operator'],

  fields: {
    audit_number: { type: 'string', label: 'Audit number' },
    owner_party: { type: 'party', role: 'owner', label: 'Plant owner' },
    supervisor_party: { type: 'party', role: 'supervisor', label: 'Plant supervisor' },
    contractor_party: { type: 'party', role: 'contractor', label: 'Cleaning contractor' },

    facility_id: { type: 'string', required: true, label: 'Facility' },
    facility_name: { type: 'string', label: 'Facility name' },
    capacity_mw: { type: 'number', min: 0, label: 'Installed capacity (MW)' },
    technology: { type: 'string', label: 'Technology' },
    site_region: { type: 'string', label: 'Site region' },
    period_label: { type: 'string', label: 'Soiling period label' },

    inspection_method: { type: 'string', label: 'Inspection method' },
    evidence_photo_uploaded: { type: 'boolean', label: 'Evidence photo uploaded' },

    soiling_ratio_pct: { type: 'number', min: 0, max: 100, label: 'Soiling loss ratio (%)' },
    baseline_ratio_pct: { type: 'number', min: 0, max: 100, label: 'Baseline ratio (%)' },
    current_tier: { type: 'string', label: 'Soiling tier' },
    authority_required: { type: 'string', label: 'Authority required' },

    cleaning_method: { type: 'string', label: 'Cleaning method' },
    cleaning_cost_zar: { type: 'number', min: 0, label: 'Cleaning cost (ZAR)' },
    zar_loss_per_day: { type: 'number', min: 0, label: 'ZAR loss per day' },
    recovery_horizon_days: { type: 'number', min: 0, label: 'Recovery horizon (days)' },
    cleaning_roi_ratio: { type: 'number', label: 'Cleaning ROI ratio' },
    days_to_breakeven: { type: 'number', label: 'Days to breakeven' },

    post_clean_pr_pct: { type: 'number', min: 0, max: 100, label: 'Post-clean PR (%)' },
    recovered_zar: { type: 'number', min: 0, label: 'Recovered value (ZAR)' },

    dispute_count: { type: 'number', label: 'Times disputed' },
    // written by derive, never by the client
    period_opened_at: { type: 'string', label: 'Period opened at' },
    soiling_measured_at: { type: 'string', label: 'Soiling measured at' },
    settled_at_sa: { type: 'string', label: 'Audit settled at' },
  },

  initial: 'soiling_period_open',

  states: {
    soiling_period_open: { label: 'Soiling period open', terminal: false, holder: 'supervisor', sla: { hours: 48 } },
    inspection_scheduled: { label: 'Inspection scheduled', terminal: false, holder: 'supervisor', sla: { hours: 72 } },
    field_inspected: { label: 'Field inspected', terminal: false, holder: 'supervisor', sla: { hours: 24 } },
    soiling_measured: { label: 'Soiling measured', terminal: false, holder: 'owner', sla: { hours: 24 } },
    economic_assessment_done: { label: 'Economic assessment done', terminal: false, holder: 'owner', sla: { hours: 48 } },
    cleaning_authorized: { label: 'Cleaning authorised', terminal: false, holder: 'contractor', sla: { hours: 72 } },
    cleaning_in_progress: { label: 'Cleaning in progress', terminal: false, holder: 'contractor' },
    post_clean_measured: { label: 'Post-clean measured', terminal: false, holder: 'supervisor', sla: { hours: 24 } },
    gain_validated: { label: 'Gain validated', terminal: false, holder: 'owner', sla: { hours: 24 } },
    settled: { label: 'Settled', terminal: true, holder: 'none' },
    disputed: { label: 'Disputed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'soiling_period_open',
      by: ['owner', 'operator'],
      actorBecomes: 'owner',
      label: 'Open soiling period',
      intent: 'primary',
      input: {
        facility_id: { type: 'string', required: true },
        facility_name: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        technology: { type: 'string' },
        site_region: { type: 'string' },
        period_label: { type: 'string' },
        supervisor_party: { type: 'party', role: 'supervisor' },
        contractor_party: { type: 'party', role: 'contractor' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ period_opened_at: isoUtc(at) }),
    },
    {
      id: 'schedule_inspection',
      from: 'soiling_period_open',
      to: 'inspection_scheduled',
      by: ['supervisor', 'operator'],
      label: 'Schedule inspection',
      intent: 'primary',
      input: { inspection_method: { type: 'string' } },
      guards: [],
    },
    {
      id: 'record_inspection',
      from: 'inspection_scheduled',
      to: 'field_inspected',
      by: ['supervisor', 'contractor'],
      label: 'Record field inspection',
      intent: 'primary',
      input: { evidence_photo_uploaded: { type: 'boolean' } },
      guards: [],
    },
    {
      // measurement gate: tiers the loss and sets the required authority. The
      // only inbound edge to soiling_measured — nothing downstream can proceed
      // on an unmeasured plant.
      id: 'measure_soiling',
      from: 'field_inspected',
      to: 'soiling_measured',
      by: ['supervisor'],
      label: 'Measure soiling',
      intent: 'primary',
      input: {
        soiling_ratio_pct: { type: 'number', required: true, min: 0, max: 100 },
        baseline_ratio_pct: { type: 'number', min: 0, max: 100 },
      },
      guards: [],
      derive: (f, at: Instant) => {
        const tier = soilingTier(f.soiling_ratio_pct);
        return { soiling_measured_at: isoUtc(at), current_tier: tier, authority_required: authorityForTier(tier) };
      },
    },
    {
      id: 'assess_economics',
      from: 'soiling_measured',
      to: 'economic_assessment_done',
      by: ['supervisor', 'owner'],
      label: 'Assess cleaning economics',
      intent: 'primary',
      input: {
        cleaning_method: { type: 'string' },
        cleaning_cost_zar: { type: 'number', required: true, min: 0 },
        zar_loss_per_day: { type: 'number', min: 0 },
        recovery_horizon_days: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f) => {
        const cost = num(f.cleaning_cost_zar);
        const lossPerDay = num(f.zar_loss_per_day);
        const horizon = num(f.recovery_horizon_days);
        return {
          cleaning_roi_ratio: cost > 0 ? (lossPerDay * horizon) / cost : 0,
          days_to_breakeven: lossPerDay > 0 ? cost / lossPerDay : 0,
        };
      },
    },
    {
      // strategic crossing: authorising an intervention on a ≥100 MW generator
      // needs a regulator on the txn (water-restriction / WUL context).
      id: 'authorize_cleaning',
      from: 'economic_assessment_done',
      to: 'cleaning_authorized',
      by: ['owner', 'supervisor'],
      label: 'Authorise cleaning',
      intent: 'primary',
      guards: ['regulatorPresentIfStrategic'],
    },
    { id: 'start_cleaning', from: 'cleaning_authorized', to: 'cleaning_in_progress', by: ['contractor'], label: 'Start cleaning', intent: 'primary', guards: [] },
    {
      id: 'record_post_clean',
      from: 'cleaning_in_progress',
      to: 'post_clean_measured',
      by: ['supervisor', 'contractor'],
      label: 'Record post-clean measurement',
      intent: 'primary',
      input: { post_clean_pr_pct: { type: 'number', required: true, min: 0, max: 100 } },
      guards: [],
    },
    {
      // validation gate: the only inbound edge to gain_validated, whose only
      // outbound-to-terminal edge is settle. A settled gain is always evidenced
      // by a post-clean reading.
      id: 'validate_gain',
      from: 'post_clean_measured',
      to: 'gain_validated',
      by: ['owner', 'supervisor'],
      label: 'Validate recovered gain',
      intent: 'primary',
      input: { recovered_zar: { type: 'number', min: 0 } },
      guards: [],
    },
    {
      id: 'settle',
      from: 'gain_validated',
      to: 'settled',
      by: ['owner', 'operator'],
      label: 'Settle audit',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ settled_at_sa: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'dispute',
      from: ['soiling_measured', 'economic_assessment_done', 'post_clean_measured', 'gain_validated'],
      to: 'disputed',
      by: ['owner', 'supervisor', 'contractor'],
      label: 'Dispute audit',
      intent: 'destructive',
      requiresReason: ['measurement_contested', 'baseline_disputed', 'cost_disputed', 'gain_not_recovered'],
      guards: [],
      derive: (f) => ({ dispute_count: num(f.dispute_count) + 1 }),
    },
    {
      id: 'cancel',
      from: ['soiling_period_open', 'inspection_scheduled', 'field_inspected', 'cleaning_authorized'],
      to: 'cancelled',
      by: ['owner', 'operator'],
      label: 'Cancel audit',
      intent: 'destructive',
      requiresReason: ['rain_cleared_soiling', 'facility_decommissioned', 'duplicate_period', 'no_longer_economic'],
      guards: [],
    },
  ],
};
