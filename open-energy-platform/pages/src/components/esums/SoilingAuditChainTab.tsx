// Wave 102 — Esums Plant Soiling, Cleaning Authorisation & Recovery-Gain Audit
// tab. PV soiling is one of the single biggest controllable production losses
// on a SA solar plant. W102 audits a soiling period from baseline measurement
// (reference-cell + dirty/clean pair), through inspection (visual + IR + drone),
// economic assessment (lost MWh tariff vs cleaning ZAR + water m3), cleaning
// authorisation gate (water-restriction + neighbour notice + DFFE WUL), field
// cleaning execution, post-clean PR-delta validation, and settled audit ledger
// feeding W79 generation revenue assurance.
//
//   • KPI strip: total / open / cleaning live / authorised / measured /
//     disputed / SLA breached / total ZAR loss
//   • Filter pills by soiling tier + chain state + urgency + floor + SLA breach
//   • Listing: tier pill + floor flag + URGENT SLA countdown + soiling ratio +
//     mwh loss + ZAR loss/day
//   • Drill-down: soiling ratio + PR + ZAR ledger + cleaning ROI + recovered
//     gain + 4-step authority ladder + per-state actions + timeline
//
// Single-party write: the Esums O&M desk operates the chain; actor_party tag
// records site_supervisor / cleaning_contractor / plant_owner / regulator_observer.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'soiling_period_open' | 'inspection_scheduled' | 'field_inspected'
  | 'soiling_measured' | 'economic_assessment_done' | 'cleaning_authorized'
  | 'cleaning_in_progress' | 'post_clean_measured' | 'gain_validated'
  | 'settled' | 'disputed' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'severe';

type UrgencyBand = 'low' | 'medium' | 'high' | 'critical';

type Authority = 'site_supervisor' | 'plant_manager' | 'asset_director' | 'cfo';

interface SoilRow {
  [key: string]: unknown;
  id: string;
  audit_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_id: string;
  facility_name: string | null;
  plant_owner_party_id: string | null;
  plant_owner_party_name: string | null;
  installed_capacity_mw: number | null;
  technology: string | null;
  site_region: string | null;
  period_opened_at: string | null;
  period_label: string | null;
  inspection_method: string | null;
  evidence_photo_uploaded: number;
  soiling_ratio_pct: number;
  baseline_ratio_pct: number | null;
  days_since_baseline: number | null;
  soiling_velocity_pct_per_day: number | null;
  expected_pr_clean_pct: number | null;
  current_pr_dirty_pct: number | null;
  pr_loss_pct: number | null;
  peak_sun_hours_per_day: number | null;
  mwh_loss_per_day: number | null;
  tariff_zar_per_mwh: number | null;
  zar_loss_per_day: number | null;
  zar_loss_to_date: number | null;
  cleaning_method: string | null;
  cleaning_cost_zar: number | null;
  water_consumption_m3: number | null;
  recovery_horizon_days: number | null;
  cleaning_roi_ratio: number | null;
  days_to_breakeven: number | null;
  post_clean_pr_pct: number | null;
  recovered_zar: number | null;
  recovery_documented: number;
  rainy_season_window_strict: number;
  post_dust_storm_event: number;
  neighbour_complaint_filed: number;
  water_restriction_active: number;
  current_tier: Tier;
  authority_required: Authority | null;
  dispute_count: number;
  cancel_count: number;
  parent_audit_id: string | null;
  prior_audit_id: string | null;
  regulator_ref: string | null;
  cleaning_contractor_id: string | null;
  cleaning_contractor_name: string | null;
  wul_licence_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  disputed_reason: string | null;
  cancelled_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  supervisor_party: string | null;
  contractor_party: string | null;
  owner_party: string | null;
  chain_status: ChainStatus;
  soiling_period_opened_at: string | null;
  inspection_scheduled_at: string | null;
  field_inspected_at: string | null;
  soiling_measured_at: string | null;
  economic_assessment_done_at: string | null;
  cleaning_authorized_at: string | null;
  cleaning_in_progress_at: string | null;
  post_clean_measured_at: string | null;
  gain_validated_at: string | null;
  settled_at: string | null;
  disputed_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated by route
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  floor_at_material_flag?: boolean;
  pr_loss_pct_live?: number | null;
  mwh_loss_per_day_live?: number | null;
  zar_loss_per_day_live?: number | null;
  zar_loss_to_date_live?: number | null;
  cleaning_roi_ratio_live?: number | null;
  days_to_breakeven_live?: number | null;
  soiling_velocity_pct_per_day_live?: number | null;
  predicted_next_clean_date_live?: string | null;
  recovered_zar_live?: number | null;
  soiling_compliance_index_live?: number | null;
  sla_days_remaining_live?: number | null;
  urgency_band_live?: UrgencyBand;
  authority_required_live?: Authority;
  days_in_court_live?: number;
}

interface KpiData {
  total: number;
  open_count: number;
  settled_count: number;
  cleaning_live_count: number;
  authorised_count: number;
  measured_count: number;
  disputed_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  total_mwh_loss_per_day: number;
  total_zar_loss_per_day: number;
  total_zar_loss_to_date: number;
  total_recovered_zar: number;
  avg_soiling_ratio_pct: number;
  avg_compliance_index: number;
  critical_urgency_count: number;
  severe_tier_count: number;
  material_tier_count: number;
  floor_at_material_count: number;
  water_restricted_count: number;
  post_dust_storm_count: number;
}

const AUTH_LABEL: Record<Authority, string> = {
  site_supervisor: 'Site supervisor',
  plant_manager:   'Plant manager',
  asset_director:  'Asset director',
  cfo:             'CFO',
};

const TIER_LABEL: Record<Tier, string> = {
  minor:    'Minor',
  standard: 'Standard',
  material: 'Material',
  severe:   'Severe',
};

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'soiling_period_open',
  'inspection_scheduled',
  'field_inspected',
  'soiling_measured',
  'economic_assessment_done',
  'cleaning_authorized',
  'cleaning_in_progress',
  'post_clean_measured',
  'gain_validated',
  'settled',
];
const BRANCH_STATES: readonly string[] = [
  'disputed',
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                   label: 'Active (pre-terminal)' },
  { key: 'all',                      label: 'All' },
  { key: 'severe',                   label: 'Severe' },
  { key: 'material',                 label: 'Material' },
  { key: 'standard',                 label: 'Standard' },
  { key: 'minor',                    label: 'Minor' },
  { key: 'critical_urgency',         label: 'Critical urgency' },
  { key: 'floored',                  label: 'Floor-at-material' },
  { key: 'soiling_period_open',      label: 'Period open' },
  { key: 'inspection_scheduled',     label: 'Inspection scheduled' },
  { key: 'field_inspected',          label: 'Field inspected' },
  { key: 'soiling_measured',         label: 'Measured' },
  { key: 'economic_assessment_done', label: 'Economics done' },
  { key: 'cleaning_authorized',      label: 'Authorized' },
  { key: 'cleaning_in_progress',     label: 'Cleaning live' },
  { key: 'post_clean_measured',      label: 'Post-clean' },
  { key: 'gain_validated',           label: 'Gain validated' },
  { key: 'settled',                  label: 'Settled' },
  { key: 'disputed',                 label: 'Disputed' },
  { key: 'breached',                 label: 'SLA breached' },
  { key: 'reportable',               label: 'Reportable' },
];

const TIERS = new Set<string>(['minor', 'standard', 'material', 'severe']);

// ── format helpers ────────────────────────────────────────────────────────
function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R${(v / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000)     return `R${(v / 1_000).toFixed(0)}k`;
  return `R${v.toFixed(0)}`;
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return '—';
  return `${v.toFixed(digits)}%`;
}

function fmtMwh(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} MWh`;
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: SoilRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const cs = row.chain_status;
  const transitionable = !row.is_terminal;
  const disputable = ['soiling_measured', 'economic_assessment_done', 'gain_validated'].includes(cs);
  const cancellable = !row.is_terminal;

  if (cs === 'soiling_period_open') {
    actions.push({
      key: 'schedule-inspection',
      label: 'Schedule inspection (supervisor)',
      fields: [
        {
          key: 'inspection_method',
          label: 'Inspection method (visual / drone_ir / both)',
          type: 'text',
          required: false,
          placeholder: row.inspection_method ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'inspection_scheduled') {
    actions.push({
      key: 'record-inspection',
      label: 'Record inspection (supervisor)',
      fields: [
        {
          key: 'inspection_method',
          label: 'Inspection method actually used',
          type: 'text',
          required: false,
          placeholder: row.inspection_method ?? '',
        },
        {
          key: 'evidence_photo_uploaded',
          label: 'Evidence photo uploaded? (true/false)',
          type: 'text',
          required: false,
          placeholder: String(!!row.evidence_photo_uploaded),
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'field_inspected') {
    actions.push({
      key: 'measure-soiling',
      label: 'Measure soiling ratio (supervisor)',
      fields: [
        {
          key: 'soiling_ratio_pct',
          label: 'Soiling ratio % (e.g. 5.4)',
          type: 'number',
          required: false,
          placeholder: String(row.soiling_ratio_pct ?? ''),
        },
        {
          key: 'baseline_ratio_pct',
          label: 'Baseline ratio % (optional)',
          type: 'number',
          required: false,
          placeholder: String(row.baseline_ratio_pct ?? ''),
        },
        {
          key: 'days_since_baseline',
          label: 'Days since baseline (optional)',
          type: 'number',
          required: false,
          placeholder: String(row.days_since_baseline ?? ''),
        },
        {
          key: 'expected_pr_clean_pct',
          label: 'Expected PR clean % (optional)',
          type: 'number',
          required: false,
          placeholder: String(row.expected_pr_clean_pct ?? ''),
        },
        {
          key: 'current_pr_dirty_pct',
          label: 'Current PR dirty % (optional)',
          type: 'number',
          required: false,
          placeholder: String(row.current_pr_dirty_pct ?? ''),
        },
        {
          key: 'peak_sun_hours_per_day',
          label: 'Peak sun hours/day (optional)',
          type: 'number',
          required: false,
          placeholder: String(row.peak_sun_hours_per_day ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'soiling_measured') {
    actions.push({
      key: 'assess-economics',
      label: 'Assess economics (plant owner)',
      fields: [
        {
          key: 'cleaning_method',
          label: 'Cleaning method (manual_wet / robotic_dry / drone_water)',
          type: 'text',
          required: false,
          placeholder: row.cleaning_method ?? '',
        },
        {
          key: 'cleaning_cost_zar',
          label: 'Cleaning cost (ZAR)',
          type: 'number',
          required: false,
          placeholder: String(row.cleaning_cost_zar ?? ''),
        },
        {
          key: 'water_consumption_m3',
          label: 'Water consumption (m³)',
          type: 'number',
          required: false,
          placeholder: String(row.water_consumption_m3 ?? ''),
        },
        {
          key: 'recovery_horizon_days',
          label: 'Recovery horizon (days)',
          type: 'number',
          required: false,
          placeholder: String(row.recovery_horizon_days ?? ''),
        },
        {
          key: 'tariff_zar_per_mwh',
          label: 'Tariff (ZAR/MWh, optional)',
          type: 'number',
          required: false,
          placeholder: String(row.tariff_zar_per_mwh ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'economic_assessment_done') {
    actions.push({
      key: 'authorize-cleaning',
      label: 'Authorize cleaning',
      fields: [
        {
          key: 'cleaning_contractor_id',
          label: 'Contractor ID (optional)',
          type: 'text',
          required: false,
          placeholder: row.cleaning_contractor_id ?? '',
        },
        {
          key: 'cleaning_contractor_name',
          label: 'Contractor name',
          type: 'text',
          required: false,
          placeholder: row.cleaning_contractor_name ?? '',
        },
        {
          key: 'wul_licence_ref',
          label: 'DFFE WUL licence ref (optional)',
          type: 'text',
          required: false,
          placeholder: row.wul_licence_ref ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'cleaning_authorized') {
    actions.push({
      key: 'start-cleaning',
      label: 'Start cleaning (contractor)',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'cleaning_in_progress') {
    actions.push({
      key: 'complete-cleaning',
      label: 'Complete cleaning (contractor)',
      fields: [
        {
          key: 'water_consumption_m3',
          label: 'Actual water consumption (m³)',
          type: 'number',
          required: false,
          placeholder: String(row.water_consumption_m3 ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'post_clean_measured') {
    actions.push({
      key: 'measure-post-clean',
      label: 'Measure post-clean PR (supervisor)',
      fields: [
        {
          key: 'post_clean_pr_pct',
          label: 'Post-clean PR % (e.g. 84.5)',
          type: 'number',
          required: false,
          placeholder: String(row.post_clean_pr_pct ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'gain_validated') {
    actions.push({
      key: 'validate-gain',
      label: 'Validate gain (plant owner)',
      fields: [
        {
          key: 'recovery_documented',
          label: 'Recovery documented in generation revenue ledger? (true/false)',
          type: 'text',
          required: false,
          placeholder: String(!!row.recovery_documented),
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'settle-audit',
      label: 'Settle audit',
      fields: [],
      cascadeTo: [],
    });
  }

  if (disputable && transitionable) {
    actions.push({
      key: 'raise-dispute',
      label: 'Raise dispute (regulator reportable)',
      fields: [
        {
          key: 'disputed_reason',
          label: 'Dispute reason',
          type: 'textarea',
          required: false,
          placeholder: row.disputed_reason ?? '',
        },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (cs === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cancellable) {
    actions.push({
      key: 'cancel-audit',
      label: 'Cancel audit',
      fields: [
        {
          key: 'cancelled_reason',
          label: 'Cancellation reason',
          type: 'textarea',
          required: false,
          placeholder: row.cancelled_reason ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: SoilRow): React.ReactNode {
  const authorityNow = row.authority_required_live ?? row.authority_required ?? null;

  return (
    <div className="space-y-3 text-[11px]">
      {/* Flags */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { on: !!row.rainy_season_window_strict, label: 'Rainy season strict' },
          { on: !!row.post_dust_storm_event,      label: 'Post dust-storm event' },
          { on: !!row.neighbour_complaint_filed,  label: 'Neighbour complaint' },
          { on: !!row.water_restriction_active,   label: 'Water restriction active' },
        ].map(({ on, label }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
            borderRadius: 6, border: `1px solid ${on ? 'oklch(0.80 0.12 55)' : BORDER}`,
            background: on ? 'oklch(0.97 0.06 55)' : BG1,
            color: on ? WARN : TX3,
          }}>
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: on ? WARN : TX3,
            }} />
            {label}
          </div>
        ))}
      </div>

      {/* Soiling measurement */}
      <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 8 }}>
          Soiling measurement
        </div>
        <div className="grid grid-cols-4 gap-3">
          <DetailPair label="Current ratio"       value={fmtPct(row.soiling_ratio_pct, 2)} />
          <DetailPair label="Baseline"            value={fmtPct(row.baseline_ratio_pct, 2)} />
          <DetailPair label="Days since baseline" value={row.days_since_baseline != null ? `${row.days_since_baseline}d` : '—'} />
          <DetailPair label="Velocity"            value={row.soiling_velocity_pct_per_day_live != null ? `${row.soiling_velocity_pct_per_day_live.toFixed(3)}%/d` : '—'} />
        </div>
        <div className="grid grid-cols-3 gap-3" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          <DetailPair label="Expected PR (clean)" value={fmtPct(row.expected_pr_clean_pct, 1)} />
          <DetailPair label="Current PR (dirty)"  value={fmtPct(row.current_pr_dirty_pct, 1)} />
          <DetailPair label="PR loss"             value={fmtPct(row.pr_loss_pct_live, 2)} />
        </div>
      </div>

      {/* Economic impact */}
      <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 8 }}>
          Economic impact ledger
        </div>
        <div className="grid grid-cols-4 gap-3">
          <DetailPair label="Installed capacity" value={row.installed_capacity_mw != null ? `${row.installed_capacity_mw} MW` : '—'} />
          <DetailPair label="Peak sun"           value={row.peak_sun_hours_per_day != null ? `${row.peak_sun_hours_per_day}h/d` : '—'} />
          <DetailPair label="Tariff"             value={row.tariff_zar_per_mwh != null ? `R${row.tariff_zar_per_mwh.toFixed(0)}/MWh` : '—'} />
          <DetailPair label="MWh loss / day"     value={fmtMwh(row.mwh_loss_per_day_live)} />
        </div>
        <div className="grid grid-cols-3 gap-3" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          <DetailPair label="ZAR loss / day"         value={fmtZar(row.zar_loss_per_day_live)} />
          <DetailPair label="ZAR loss to date"       value={fmtZar(row.zar_loss_to_date_live)} />
          <DetailPair label="Next clean (predicted)" value={row.predicted_next_clean_date_live ? new Date(row.predicted_next_clean_date_live).toLocaleDateString() : '—'} />
        </div>
      </div>

      {/* Cleaning & recovery */}
      <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 8 }}>
          Cleaning &amp; recovery
        </div>
        <div className="grid grid-cols-4 gap-3">
          <DetailPair label="Method"  value={row.cleaning_method ?? '—'} />
          <DetailPair label="Cost"    value={fmtZar(row.cleaning_cost_zar)} />
          <DetailPair label="Water"   value={row.water_consumption_m3 != null ? `${row.water_consumption_m3} m³` : '—'} />
          <DetailPair label="Horizon" value={row.recovery_horizon_days != null ? `${row.recovery_horizon_days}d` : '—'} />
        </div>
        <div className="grid grid-cols-4 gap-3" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          <DetailPair label="ROI ratio"         value={row.cleaning_roi_ratio_live != null ? `${row.cleaning_roi_ratio_live.toFixed(2)}×` : '—'} />
          <DetailPair label="Days to breakeven" value={row.days_to_breakeven_live != null ? `${row.days_to_breakeven_live.toFixed(1)}d` : '—'} />
          <DetailPair label="Post-clean PR"     value={fmtPct(row.post_clean_pr_pct, 1)} />
          <DetailPair label="Recovered"         value={fmtZar(row.recovered_zar_live)} />
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {row.plant_owner_party_name  && <DetailPair label="Plant owner"       value={row.plant_owner_party_name} />}
        {row.cleaning_contractor_name && <DetailPair label="Contractor"       value={row.cleaning_contractor_name} />}
        {row.wul_licence_ref         && <DetailPair label="DFFE WUL ref"      value={row.wul_licence_ref} />}
        {row.regulator_inbox_ref     && <DetailPair label="Regulator inbox"   value={row.regulator_inbox_ref} />}
        {row.inspection_method       && <DetailPair label="Inspection method" value={row.inspection_method} />}
        {row.technology              && <DetailPair label="Technology"        value={row.technology} />}
        {row.site_region             && <DetailPair label="Region"            value={row.site_region} />}
        {authorityNow                && <DetailPair label="Authority req."    value={AUTH_LABEL[authorityNow]} />}
        {row.soiling_compliance_index_live != null && (
          <DetailPair label="Compliance index" value={`${row.soiling_compliance_index_live.toFixed(1)} / 130`} />
        )}
        {row.source_wave && (
          <DetailPair
            label="Provenance"
            value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`}
          />
        )}
        {row.sla_deadline_at && !row.is_terminal && (
          <DetailPair
            label="Next SLA"
            value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`}
          />
        )}
      </div>

      {row.disputed_reason && (
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>Disputed reason</div>
          <div style={{ color: TX2 }}>{row.disputed_reason}</div>
        </div>
      )}
      {row.cancelled_reason && (
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>Cancelled reason</div>
          <div style={{ color: TX2 }}>{row.cancelled_reason}</div>
        </div>
      )}
      {row.reason_code && (
        <DetailPair label="Reason code" value={row.reason_code} />
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function SoilingAuditChainTab() {
  const [rows, setRows]           = useState<SoilRow[]>([]);
  const [kpis, setKpis]           = useState<KpiData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState<string | null>(null);
  const [filter, setFilter]       = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: SoilRow[] } }>('/esums/soiling-audit/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load soiling audits');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/esums/soiling-audit/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/esums/soiling-audit/chain/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: SoilRow; events: ChainEvent[] } }>(`/esums/soiling-audit/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !r.is_terminal;
      if (filter === 'breached')         return r.sla_breached;
      if (filter === 'reportable')       return r.is_reportable_flag;
      if (filter === 'critical_urgency') return r.urgency_band_live === 'critical';
      if (filter === 'floored')          return r.floor_at_material_flag;
      if (TIERS.has(filter))             return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis;

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Soiling Audit</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          PV plant soiling periods — baseline measurement through cleaning authorisation, field execution, and gain validation.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"          value={k?.total ?? 0} />
        <KpiTile label="Open"           value={k?.open_count ?? 0} />
        <KpiTile label="Cleaning live"  value={k?.cleaning_live_count ?? 0} tone={(k?.cleaning_live_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Authorised"     value={k?.authorised_count ?? 0} />
        <KpiTile label="Severe tier"    value={k?.severe_tier_count ?? 0} tone={(k?.severe_tier_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Disputed"       value={k?.disputed_count ?? 0} tone={(k?.disputed_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"   value={k?.breached ?? 0} tone={(k?.breached ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="ZAR loss / day" value={fmtZar(k?.total_zar_loss_per_day ?? 0)} tone={(k?.total_zar_loss_per_day ?? 0) > 0 ? 'warn' : undefined} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color:      filter === f.key ? '#fff' : TX2,
              border:     `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]"
          style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.facility_name ?? row.facility_id} · ${row.period_label ?? '—'}`}
              meta={[
                TIER_LABEL[row.current_tier],
                row.audit_number,
                row.urgency_band_live ? `${row.urgency_band_live} urgency` : null,
                row.floor_at_material_flag ? 'FLOOR @ material' : null,
                row.soiling_ratio_pct != null ? `${fmtPct(row.soiling_ratio_pct, 1)} soiling` : null,
                fmtMwh(row.mwh_loss_per_day_live) !== '—' ? `${fmtMwh(row.mwh_loss_per_day_live)}/d loss` : null,
                fmtZar(row.zar_loss_per_day_live) !== '—' ? `${fmtZar(row.zar_loss_per_day_live)}/d` : null,
              ].filter(Boolean).join(' · ')}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No soiling audits match the current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default SoilingAuditChainTab;
