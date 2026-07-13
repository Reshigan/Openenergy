// Wave 95 — Lender Sustainability-Linked Loan (SLL) KPI Compliance & Margin
// Ratchet tab.
//
// The ESG-driven margin-pricing layer of a best-in-class lender stack. W38
// covenant_certificate handles point-in-time FINANCIAL KPI (DSCR/LLCR); W77
// reserve_account handles cash-balance covenants; W86 dscr_monitoring is the
// rolling FINANCIAL coverage monitor; W45 loan_default catches what crystallises
// after cure_failed. W95 fills the gap: NON-FINANCIAL ESG KPIs (CO2 intensity,
// energy-efficiency, safety-LTIFR, B-BBEE, mandatory disclosure, taxonomy
// alignment) measured annually, INDEPENDENTLY VERIFIED, driving contractual
// margin step-up / step-down per the LMA SLL Principles and SA Green Finance
// Taxonomy 2025.
//
// Beats Sustainalytics / ISS-ESG / MSCI ESG / S&P RobecoSAM CSA / Bloomberg
// ESG / Refinitiv ESG / LMA SLL Portal / ICMA SLBP / JSE Sustainability Index.
// SIGNATURE: record_breach + fail_cure cross SARB EVERY tier.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const GOOD   = 'var(--good, oklch(0.40 0.16 155))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'kpi_period_open' | 'baseline_set' | 'measurement_collected'
  | 'independent_verification' | 'kpi_attested' | 'ratchet_computed'
  | 'margin_amended' | 'breach_recorded' | 'cure_period'
  | 'cure_failed' | 'restatement' | 'cancelled' | 'sustainability_event';

type Tier = 'minor' | 'standard' | 'material' | 'severe';
type Urgency = 'overdue' | 'urgent' | 'due_soon' | 'on_track' | 'closed';
type MaterialityClass =
  | 'general_kpi' | 'climate_kpi' | 'safety_kpi'
  | 'mandatory_disclosure_kpi' | 'governance_kpi' | 'supply_chain_kpi';
type SbtiPathway = '1_5C' | 'well_below_2C' | '2C' | 'not_aligned';
type ProvenanceBand = 'big4' | 'iso14065_accredited' | 'industry_specialist' | 'inadequate';

interface SllRow {
  [key: string]: unknown;
  id: string;
  compliance_number: string;
  borrower_party_id: string;
  borrower_party_name: string | null;
  borrower_persona: string | null;
  facility_id: string | null;
  facility_name: string | null;
  outstanding_zar: number;
  remaining_tenor_days: number;
  base_margin_bps: number;
  materiality_class: MaterialityClass;
  kpi_code: string;
  kpi_name: string | null;
  kpi_unit: string | null;
  kpi_period_label: string | null;
  kpi_period_year: number | null;
  compliance_tier: Tier;
  authority_required: string | null;
  kpi_baseline_value: number | null;
  kpi_target_value: number | null;
  kpi_measured_value: number | null;
  kpi_forecast_value: number | null;
  measured_variance_pct: number | null;
  forecast_variance_pct: number | null;
  effective_variance_pct: number | null;
  ratchet_bps_this_period: number | null;
  cumulative_ratchet_bps: number;
  effective_margin_bps: number | null;
  cumulative_ratchet_zar: number | null;
  cure_failed_penalty_bps: number | null;
  tcfd_pillars_covered: number;
  tcfd_completeness_pct: number | null;
  attestation_fields_present: number;
  attestation_fields_required: number;
  attestation_completeness_pct: number | null;
  sbti_pathway: string | null;
  emissions_reduction_pct_per_year: number | null;
  taxonomy_eligible_zar: number | null;
  total_financing_zar: number | null;
  taxonomy_alignment_pct: number | null;
  verifier_slug: string | null;
  verification_provenance_band: string | null;
  cure_target_at: string | null;
  cure_actual_at: string | null;
  cure_basis: string | null;
  restatement_basis: string | null;
  baseline_ref: string | null;
  measurement_ref: string | null;
  verification_ref: string | null;
  attestation_ref: string | null;
  ratchet_ref: string | null;
  amendment_ref: string | null;
  breach_ref: string | null;
  cure_ref: string | null;
  restatement_ref: string | null;
  regulator_ref: string | null;
  baseline_basis: string | null;
  attestation_basis: string | null;
  breach_basis: string | null;
  fail_basis: string | null;
  cancellation_basis: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  kpi_period_open_at: string;
  baseline_set_at: string | null;
  measurement_collected_at: string | null;
  independent_verification_at: string | null;
  kpi_attested_at: string | null;
  ratchet_computed_at: string | null;
  margin_amended_at: string | null;
  breach_recorded_at: string | null;
  cure_period_at: string | null;
  cure_failed_at: string | null;
  restatement_at: string | null;
  cancelled_at: string | null;
  sustainability_event_at: string | null;
  kpi_due_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_reportable_flag?: boolean;
  high_tier_flag?: boolean;
  floor_at_material_class_flag?: boolean;
  signature_class_flag?: boolean;
  effective_variance_pct_live?: number;
  tier_live?: Tier;
  effective_margin_bps_live?: number;
  cumulative_ratchet_zar_live?: number;
  tcfd_completeness_pct_live?: number;
  attestation_completeness_pct_live?: number;
  sbti_pathway_live?: SbtiPathway;
  taxonomy_alignment_pct_live?: number;
  verification_provenance_band_live?: ProvenanceBand;
  predicted_amendment_date_live?: string | null;
  days_to_kpi_due_live?: number | null;
  urgency_band?: Urgency;
}

interface SllEvent {
  id: string;
  compliance_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiSummary {
  total: number;
  open_count: number;
  margin_amended_count: number;
  breach_recorded_count: number;
  cure_period_count: number;
  cure_failed_count: number;
  restatement_count: number;
  cancelled_count: number;
  sustainability_event_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  floor_applied_count: number;
  total_outstanding_zar: number;
  total_cumulative_ratchet_bps: number;
  total_cumulative_ratchet_zar: number;
  total_taxonomy_eligible_zar: number;
  total_total_financing_zar: number;
  portfolio_taxonomy_alignment_pct: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'kpi_period_open',
  'baseline_set',
  'measurement_collected',
  'independent_verification',
  'kpi_attested',
  'ratchet_computed',
  'margin_amended',
  'breach_recorded',
  'cure_period',
  'restatement',
];
const BRANCH_STATES: readonly string[] = [
  'cure_failed',
  'cancelled',
  'sustainability_event',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                       label: 'Open' },
  { key: 'all',                        label: 'All' },
  { key: 'minor',                      label: 'Minor' },
  { key: 'standard',                   label: 'Standard' },
  { key: 'material',                   label: 'Material' },
  { key: 'severe',                     label: 'Severe' },
  { key: 'climate_kpi',                label: 'Climate' },
  { key: 'safety_kpi',                 label: 'Safety' },
  { key: 'mandatory_disclosure_kpi',   label: 'Mandatory disclosure' },
  { key: 'kpi_period_open',            label: 'Period open' },
  { key: 'baseline_set',               label: 'Baseline set' },
  { key: 'measurement_collected',      label: 'Measured' },
  { key: 'independent_verification',   label: 'Verifying' },
  { key: 'kpi_attested',               label: 'Attested' },
  { key: 'ratchet_computed',           label: 'Ratchet computed' },
  { key: 'margin_amended',             label: 'Margin amended' },
  { key: 'breach_recorded',            label: 'Breach' },
  { key: 'cure_period',                label: 'Cure period' },
  { key: 'cure_failed',                label: 'Cure failed' },
  { key: 'restatement',                label: 'Restatement' },
  { key: 'breached',                   label: 'SLA breached' },
  { key: 'reportable',                 label: 'Reportable' },
  { key: 'floor_only',                 label: 'Floor-at-material' },
];

const TERMINAL_STATES: ChainStatus[] = ['margin_amended', 'cure_failed', 'cancelled', 'sustainability_event'];

// ── format helpers ────────────────────────────────────────────────────────
function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtBps(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)} bps`;
}

function fmtPct(n: number | null | undefined, dp = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return `${n.toFixed(dp)}%`;
}

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return n.toFixed(dp);
}

const TIER_LABEL: Record<Tier, string> = {
  minor:    'Minor (<5pp)',
  standard: 'Standard (5-15pp)',
  material: 'Material (15-30pp)',
  severe:   'Severe (≥30pp)',
};

const CLASS_LABEL: Record<MaterialityClass, string> = {
  general_kpi:              'General',
  climate_kpi:              'Climate (floor)',
  safety_kpi:               'Safety (floor)',
  mandatory_disclosure_kpi: 'Mandatory disclosure (floor)',
  governance_kpi:           'Governance',
  supply_chain_kpi:         'Supply chain',
};

const URGENCY_LABEL: Record<Urgency, string> = {
  overdue:  'Overdue',
  urgent:   'Urgent',
  due_soon: 'Due soon',
  on_track: 'On track',
  closed:   'Closed',
};

const SBTI_LABEL: Record<SbtiPathway, string> = {
  '1_5C':          '1.5°C',
  'well_below_2C': '<2°C',
  '2C':            '2°C',
  'not_aligned':   'Not aligned',
};

const PROV_LABEL: Record<ProvenanceBand, string> = {
  big4:                'Big-4',
  iso14065_accredited: 'ISO 14065',
  industry_specialist: 'Industry',
  inadequate:          'Inadequate',
};

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: SllRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'kpi_period_open') {
    actions.push({
      key: 'set-baseline',
      label: 'Set baseline (sustainability officer)',
      tone: 'primary',
      fields: [
        { key: 'baseline_basis', label: 'Basis — fixing the KPI baseline & target for this period', type: 'textarea', required: true },
        { key: 'kpi_baseline_value', label: `Baseline value (${row.kpi_unit ?? 'value'})`, type: 'number', required: false, placeholder: String(row.kpi_baseline_value ?? '') },
        { key: 'kpi_target_value', label: `Target value (${row.kpi_unit ?? 'value'})`, type: 'number', required: false, placeholder: String(row.kpi_target_value ?? '') },
        { key: 'kpi_due_at', label: 'KPI due date (ISO 8601, e.g. 2026-12-31)', type: 'date', required: false, placeholder: row.kpi_due_at ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'trigger-sustainability-event',
      label: 'Sustainability event (M&A / refinance)',
      tone: 'ghost',
      fields: [
        { key: 'sustainability_event_ref', label: 'Sustainability event reference (M&A / refinance / prepay deal id)', type: 'text', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel',
      label: 'Cancel',
      tone: 'ghost',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'baseline_set') {
    actions.push({
      key: 'collect-measurement',
      label: 'Collect measurement (borrower)',
      tone: 'primary',
      fields: [
        { key: 'kpi_measured_value', label: `Measured value (${row.kpi_unit ?? 'value'})`, type: 'number', required: true, placeholder: String(row.kpi_measured_value ?? '') },
        { key: 'measured_variance_pct', label: 'Variance vs target (%, positive = miss, negative = beat)', type: 'number', required: false, placeholder: String(row.measured_variance_pct ?? '') },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'trigger-sustainability-event',
      label: 'Sustainability event (M&A / refinance)',
      tone: 'ghost',
      fields: [
        { key: 'sustainability_event_ref', label: 'Sustainability event reference (M&A / refinance / prepay deal id)', type: 'text', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel',
      label: 'Cancel',
      tone: 'ghost',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'measurement_collected') {
    actions.push({
      key: 'start-verification',
      label: 'Start independent verification',
      tone: 'primary',
      fields: [
        { key: 'verifier_slug', label: 'Verifier slug (kpmg / pwc / ey / deloitte / sgs / dnv / tuv_sud / bureau_veritas)', type: 'text', required: true },
        { key: 'tcfd_pillars_covered', label: 'TCFD pillars covered (0-4)', type: 'number', required: false, placeholder: String(row.tcfd_pillars_covered ?? 0) },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'trigger-sustainability-event',
      label: 'Sustainability event (M&A / refinance)',
      tone: 'ghost',
      fields: [
        { key: 'sustainability_event_ref', label: 'Sustainability event reference (M&A / refinance / prepay deal id)', type: 'text', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel',
      label: 'Cancel',
      tone: 'ghost',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'independent_verification') {
    actions.push({
      key: 'attest-kpi',
      label: 'Attest KPI (verifier)',
      tone: 'primary',
      fields: [
        { key: 'attestation_basis', label: 'Attestation basis — verifier attesting the KPI result', type: 'textarea', required: true },
        { key: 'emissions_reduction_pct_per_year', label: 'Emissions reduction trajectory (%/yr, SBTi)', type: 'number', required: false, placeholder: String(row.emissions_reduction_pct_per_year ?? '') },
        { key: 'taxonomy_eligible_zar', label: 'Taxonomy-eligible (ZAR)', type: 'number', required: false, placeholder: String(row.taxonomy_eligible_zar ?? '') },
        { key: 'total_financing_zar', label: 'Total financing (ZAR)', type: 'number', required: false, placeholder: String(row.total_financing_zar ?? '') },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'record-breach',
      label: 'Record breach (verifier) — SARB EVERY tier',
      tone: 'danger',
      fields: [
        { key: 'breach_basis', label: 'Basis — record SLL KPI breach (SARB CPS 2024 EVERY tier)', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. kpi_miss / target_undershoot / external_event)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'trigger-sustainability-event',
      label: 'Sustainability event (M&A / refinance)',
      tone: 'ghost',
      fields: [
        { key: 'sustainability_event_ref', label: 'Sustainability event reference (M&A / refinance / prepay deal id)', type: 'text', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel',
      label: 'Cancel',
      tone: 'ghost',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'kpi_attested') {
    actions.push({
      key: 'compute-ratchet',
      label: 'Compute margin ratchet',
      tone: 'primary',
      fields: [
        { key: 'reason_code', label: 'Basis — compute margin ratchet from variance × tier', type: 'textarea', required: true },
        { key: 'ratchet_bps_this_period', label: 'Override ratchet bps (leave blank to auto-compute)', type: 'number', required: false },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'raise-restatement',
      label: 'Raise restatement',
      tone: 'warn',
      fields: [
        { key: 'restatement_basis', label: 'Basis — restate prior KPI attestation', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'trigger-sustainability-event',
      label: 'Sustainability event (M&A / refinance)',
      tone: 'ghost',
      fields: [
        { key: 'sustainability_event_ref', label: 'Sustainability event reference (M&A / refinance / prepay deal id)', type: 'text', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel',
      label: 'Cancel',
      tone: 'ghost',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'ratchet_computed') {
    actions.push({
      key: 'amend-margin',
      label: 'Amend margin (credit committee)',
      tone: 'primary',
      fields: [
        { key: 'amendment_ref', label: 'Amendment reference (LMA amendment letter no.)', type: 'text', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'raise-restatement',
      label: 'Raise restatement',
      tone: 'warn',
      fields: [
        { key: 'restatement_basis', label: 'Basis — restate prior KPI attestation', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'trigger-sustainability-event',
      label: 'Sustainability event (M&A / refinance)',
      tone: 'ghost',
      fields: [
        { key: 'sustainability_event_ref', label: 'Sustainability event reference (M&A / refinance / prepay deal id)', type: 'text', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel',
      label: 'Cancel',
      tone: 'ghost',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'margin_amended') {
    actions.push({
      key: 'raise-restatement',
      label: 'Raise restatement',
      tone: 'warn',
      fields: [
        { key: 'restatement_basis', label: 'Basis — restate prior KPI attestation', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'breach_recorded') {
    actions.push({
      key: 'open-cure-period',
      label: 'Open cure period',
      tone: 'warn',
      fields: [
        { key: 'cure_basis', label: 'Basis — open cure period for the breach', type: 'textarea', required: true },
        { key: 'cure_target_at', label: 'Cure target date (ISO 8601)', type: 'date', required: false },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'trigger-sustainability-event',
      label: 'Sustainability event (M&A / refinance)',
      tone: 'ghost',
      fields: [
        { key: 'sustainability_event_ref', label: 'Sustainability event reference (M&A / refinance / prepay deal id)', type: 'text', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel',
      label: 'Cancel',
      tone: 'ghost',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'cure_period') {
    actions.push({
      key: 'validate-cure',
      label: 'Validate cure (verifier)',
      tone: 'primary',
      fields: [
        { key: 'cure_ref', label: 'Cure validation reference (verifier letter)', type: 'text', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'fail-cure',
      label: 'Fail cure — SARB EVERY tier',
      tone: 'danger',
      fields: [
        { key: 'fail_basis', label: 'Basis — cure period lapsed without remediation (SARB CPS 2024 mandatory disclosure)', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'trigger-sustainability-event',
      label: 'Sustainability event (M&A / refinance)',
      tone: 'ghost',
      fields: [
        { key: 'sustainability_event_ref', label: 'Sustainability event reference (M&A / refinance / prepay deal id)', type: 'text', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel',
      label: 'Cancel',
      tone: 'ghost',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'restatement') {
    actions.push({
      key: 're-verify',
      label: 'Re-verify',
      tone: 'primary',
      fields: [
        { key: 'verifier_slug', label: 'Verifier slug for re-verification', type: 'text', required: false, placeholder: row.verifier_slug ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'trigger-sustainability-event',
      label: 'Sustainability event (M&A / refinance)',
      tone: 'ghost',
      fields: [
        { key: 'sustainability_event_ref', label: 'Sustainability event reference (M&A / refinance / prepay deal id)', type: 'text', required: true },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'cancel',
      label: 'Cancel',
      tone: 'ghost',
      fields: [
        { key: 'cancellation_basis', label: 'Cancellation basis', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: SllRow): React.ReactNode {
  const sbtiBand = row.sbti_pathway_live ? SBTI_LABEL[row.sbti_pathway_live] : null;
  const provBand = row.verification_provenance_band_live ? PROV_LABEL[row.verification_provenance_band_live] : null;

  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      {/* Live ESG margin-pricing battery */}
      <div className="mb-2" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>
        Live ESG margin-pricing battery
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
        <DetailPair label="Effective margin (live)" value={fmtNum(row.effective_margin_bps_live, 1) + ' bps'} />
        <DetailPair label="Cumulative ratchet (bps)" value={fmtBps(row.cumulative_ratchet_bps)} />
        <DetailPair label="Cumulative ratchet (ZAR)" value={fmtZar(row.cumulative_ratchet_zar_live)} />
        <DetailPair label="Effective variance (live)" value={row.effective_variance_pct_live != null ? `${row.effective_variance_pct_live.toFixed(2)}pp` : '—'} />
        <DetailPair label="Tier (re-derived)" value={row.tier_live ? TIER_LABEL[row.tier_live] : '—'} />
        <DetailPair label="TCFD completeness" value={fmtPct(row.tcfd_completeness_pct_live)} />
        <DetailPair label="Attestation completeness" value={fmtPct(row.attestation_completeness_pct_live)} />
        <DetailPair label="SBTi pathway" value={sbtiBand ?? '—'} />
        <DetailPair label="Taxonomy alignment" value={fmtPct(row.taxonomy_alignment_pct_live)} />
        <DetailPair label="Verifier provenance" value={provBand ?? '—'} />
        <DetailPair label="Days to KPI due" value={row.days_to_kpi_due_live != null ? String(row.days_to_kpi_due_live) : '—'} />
        <DetailPair label="Predicted amendment" value={fmtDate(row.predicted_amendment_date_live ?? null)} />
      </div>

      {/* KPI measurement & loan terms */}
      <div className="mb-2" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>
        KPI measurement &amp; loan terms
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
        <DetailPair label="Authority required" value={row.authority_required ?? '—'} />
        <DetailPair label="Outstanding" value={fmtZar(row.outstanding_zar)} />
        <DetailPair label="Base margin (bps)" value={fmtNum(row.base_margin_bps, 1)} />
        <DetailPair label="Remaining tenor (days)" value={String(row.remaining_tenor_days)} />
        <DetailPair label="Baseline" value={fmtNum(row.kpi_baseline_value)} />
        <DetailPair label="Target" value={fmtNum(row.kpi_target_value)} />
        <DetailPair label="Measured" value={fmtNum(row.kpi_measured_value)} />
        <DetailPair label="Forecast" value={fmtNum(row.kpi_forecast_value)} />
        <DetailPair label="Measured variance" value={row.measured_variance_pct != null ? `${row.measured_variance_pct.toFixed(2)}pp` : '—'} />
        <DetailPair label="Forecast variance" value={row.forecast_variance_pct != null ? `${row.forecast_variance_pct.toFixed(2)}pp` : '—'} />
        <DetailPair label="Ratchet this period (bps)" value={fmtBps(row.ratchet_bps_this_period)} />
        <DetailPair label="Cure-failed penalty (bps)" value={fmtBps(row.cure_failed_penalty_bps)} />
        <DetailPair label="Emissions reduction (%/yr)" value={fmtNum(row.emissions_reduction_pct_per_year, 2)} />
        <DetailPair label="Taxonomy eligible (ZAR)" value={fmtZar(row.taxonomy_eligible_zar)} />
        <DetailPair label="Total financing (ZAR)" value={fmtZar(row.total_financing_zar)} />
        <DetailPair label="TCFD pillars covered" value={`${row.tcfd_pillars_covered} / 4`} />
        <DetailPair label="Attestation fields" value={`${row.attestation_fields_present} / ${row.attestation_fields_required}`} />
        <DetailPair label="Verifier" value={row.verifier_slug ?? '—'} />
        <DetailPair label="Cure target" value={fmtDate(row.cure_target_at)} />
        <DetailPair label="Cure actual" value={fmtDate(row.cure_actual_at)} />
        <DetailPair label="KPI due" value={fmtDate(row.kpi_due_at)} />
        <DetailPair label="Urgency" value={row.urgency_band ? URGENCY_LABEL[row.urgency_band] : '—'} />
      </div>

      {/* Lifecycle timestamps */}
      <div className="mb-2" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>
        Lifecycle timestamps
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
        <DetailPair label="Period open"           value={fmtDate(row.kpi_period_open_at)} />
        <DetailPair label="Baseline set"          value={fmtDate(row.baseline_set_at)} />
        <DetailPair label="Measurement collected" value={fmtDate(row.measurement_collected_at)} />
        <DetailPair label="Verification started"  value={fmtDate(row.independent_verification_at)} />
        <DetailPair label="KPI attested"          value={fmtDate(row.kpi_attested_at)} />
        <DetailPair label="Ratchet computed"      value={fmtDate(row.ratchet_computed_at)} />
        <DetailPair label="Margin amended"        value={fmtDate(row.margin_amended_at)} />
        <DetailPair label="Breach recorded"       value={fmtDate(row.breach_recorded_at)} />
        <DetailPair label="Cure period opened"    value={fmtDate(row.cure_period_at)} />
        <DetailPair label="Cure failed"           value={fmtDate(row.cure_failed_at)} />
        <DetailPair label="Restatement"           value={fmtDate(row.restatement_at)} />
        <DetailPair label="Sustainability event"  value={fmtDate(row.sustainability_event_at)} />
        <DetailPair label="Cancelled"             value={fmtDate(row.cancelled_at)} />
        <DetailPair label="SLA deadline"          value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="Last SLA breach"       value={fmtDate(row.last_sla_breach_at)} />
        <DetailPair label="SLA status"            value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Reportable"            value={row.is_reportable_flag ? 'Yes' : 'No'} />
        <DetailPair label="Reason code"           value={row.reason_code ?? '—'} />
        <DetailPair label="Regulator ref"         value={row.regulator_ref ?? '—'} />
        <DetailPair label="Amendment ref"         value={row.amendment_ref ?? '—'} />
        <DetailPair label="Escalation level"      value={String(row.escalation_level)} />
      </div>

      {/* Basis blocks */}
      {row.baseline_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="mb-0.5" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>Baseline basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.baseline_basis}</div>
        </div>
      )}
      {row.attestation_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="mb-0.5" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>Attestation basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.attestation_basis}</div>
        </div>
      )}
      {row.breach_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD }}>
          <div className="mb-0.5" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: BAD }}>Breach basis</div>
          <div style={{ color: BAD, whiteSpace: 'pre-wrap' }}>{row.breach_basis}</div>
        </div>
      )}
      {row.fail_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD }}>
          <div className="mb-0.5" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: BAD }}>Cure-fail basis</div>
          <div style={{ color: BAD, whiteSpace: 'pre-wrap' }}>{row.fail_basis}</div>
        </div>
      )}
      {row.cure_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: 'color-mix(in oklch, var(--warn, oklch(0.65 0.18 75)) 14%, var(--s1, oklch(0.98 0.04 55)))', borderColor: WARN }}>
          <div className="mb-0.5" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: WARN }}>Cure basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.cure_basis}</div>
        </div>
      )}
      {row.restatement_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: 'color-mix(in oklch, var(--warn, oklch(0.65 0.18 75)) 14%, var(--s1, oklch(0.98 0.04 55)))', borderColor: WARN }}>
          <div className="mb-0.5" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: WARN }}>Restatement basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.restatement_basis}</div>
        </div>
      )}
      {row.cancellation_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mb-2" style={{ background: BG2, borderColor: BORDER }}>
          <div className="mb-0.5" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>Cancellation basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.cancellation_basis}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function SllKpiChainTab() {
  const [rows, setRows] = useState<SllRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: SllRow[] } & KpiSummary }>('/lender/sll-kpi/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setSummary({
          total: d.total,
          open_count: d.open_count,
          margin_amended_count: d.margin_amended_count,
          breach_recorded_count: d.breach_recorded_count,
          cure_period_count: d.cure_period_count,
          cure_failed_count: d.cure_failed_count,
          restatement_count: d.restatement_count,
          cancelled_count: d.cancelled_count,
          sustainability_event_count: d.sustainability_event_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          signature_count: d.signature_count,
          floor_applied_count: d.floor_applied_count,
          total_outstanding_zar: d.total_outstanding_zar,
          total_cumulative_ratchet_bps: d.total_cumulative_ratchet_bps,
          total_cumulative_ratchet_zar: d.total_cumulative_ratchet_zar,
          total_taxonomy_eligible_zar: d.total_taxonomy_eligible_zar,
          total_total_financing_zar: d.total_total_financing_zar,
          portfolio_taxonomy_alignment_pct: d.portfolio_taxonomy_alignment_pct,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load SLL KPI compliance records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/lender/sll-kpi/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/lender/sll-kpi/chain/${rowId}`);
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
      const res = await api.get<{ data: { compliance: SllRow; events: SllEvent[] } }>(`/lender/sll-kpi/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: (res.data?.data?.events ?? []) as ChainEvent[] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'reportable') return !!r.is_reportable_flag;
      if (filter === 'floor_only') return !!r.floor_at_material_class_flag;
      if (['minor', 'standard', 'material', 'severe'].includes(filter)) {
        return r.compliance_tier === filter;
      }
      if (['climate_kpi', 'safety_kpi', 'mandatory_disclosure_kpi', 'general_kpi', 'governance_kpi', 'supply_chain_kpi'].includes(filter)) {
        return r.materiality_class === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary;

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>SLL KPI compliance &amp; margin ratchet — the ESG-driven pricing layer</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          13-state P6 Sustainability-Linked Loan KPI compliance lifecycle · LMA SLL Principles + ICMA SLBP + SA Green Finance
          Taxonomy 2025 + SARB Climate Prudential Standards 2024. Beats Sustainalytics / ISS-ESG / MSCI ESG / S&amp;P
          RobecoSAM CSA / Bloomberg ESG / Refinitiv ESG / LMA SLL Portal. INVERTED SLA: severe ESG-material breaches get
          the longest cure window. SIGNATURE: record_breach + fail_cure cross SARB EVERY tier.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"            value={kpis?.total ?? rows.length} />
        <KpiTile label="Open"             value={kpis?.open_count ?? 0}             tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Margin amended"   value={kpis?.margin_amended_count ?? 0}   tone="ok" />
        <KpiTile label="Breach"           value={kpis?.breach_recorded_count ?? 0}  tone={(kpis?.breach_recorded_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Cure period"      value={kpis?.cure_period_count ?? 0}      tone={(kpis?.cure_period_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Cure failed"      value={kpis?.cure_failed_count ?? 0}      tone={(kpis?.cure_failed_count ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Restatement"      value={kpis?.restatement_count ?? 0}      tone={(kpis?.restatement_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached"     value={kpis?.breached ?? 0}               tone={(kpis?.breached ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"       value={kpis?.reportable_total ?? 0}       tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Floor-at-material" value={kpis?.floor_applied_count ?? 0}  tone={(kpis?.floor_applied_count ?? 0) > 0 ? 'warn' : undefined} />
        <KpiTile label="Outstanding"      value={fmtZar(kpis?.total_outstanding_zar ?? 0)} />
        <KpiTile label="Cum. ratchet"     value={fmtBps(kpis?.total_cumulative_ratchet_bps ?? 0)} tone={(kpis?.total_cumulative_ratchet_bps ?? 0) > 0 ? 'bad' : undefined} />
        <KpiTile label="Ratchet ZAR"      value={fmtZar(kpis?.total_cumulative_ratchet_zar ?? 0)} />
        <KpiTile label="Portfolio taxonomy" value={fmtPct(kpis?.portfolio_taxonomy_alignment_pct ?? 0)} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>{err}</div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.compliance_number}${row.is_reportable_flag ? ' ●' : ''}${row.floor_at_material_class_flag ? ' ▲' : ''}`}
              meta={[
                `${TIER_LABEL[row.compliance_tier]} · ${CLASS_LABEL[row.materiality_class]}`,
                row.borrower_party_name ?? '—',
                `${row.kpi_code}${row.facility_name ? ` · ${row.facility_name}` : ''}`,
              ].join(' | ')}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No SLL KPI compliance records match.</div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
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
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default SllKpiChainTab;
