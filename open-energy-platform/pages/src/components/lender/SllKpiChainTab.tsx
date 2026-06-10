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

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  kpi_period_open:          { bg: '#e3e7ec', fg: '#557',    label: 'Period open' },
  baseline_set:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Baseline set' },
  measurement_collected:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Measurement collected' },
  independent_verification: { bg: '#fff4d6', fg: '#a06200', label: 'In verification' },
  kpi_attested:             { bg: '#d4edda', fg: '#155724', label: 'KPI attested' },
  ratchet_computed:         { bg: '#d4edda', fg: '#155724', label: 'Ratchet computed' },
  margin_amended:           { bg: '#d4edda', fg: '#155724', label: 'Margin amended' },
  breach_recorded:          { bg: '#ffe4b5', fg: '#8a4a00', label: 'Breach recorded' },
  cure_period:              { bg: '#ffd9b3', fg: '#8a4a00', label: 'Cure period' },
  cure_failed:              { bg: '#f3c0c0', fg: '#5a1818', label: 'Cure failed' },
  restatement:              { bg: '#fff4d6', fg: '#a06200', label: 'Restatement' },
  cancelled:                { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
  sustainability_event:     { bg: '#e3e7ec', fg: '#557',    label: 'Sustainability event' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#d4edda', fg: '#155724', label: 'Minor (<5pp)' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard (5-15pp)' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material (15-30pp)' },
  severe:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Severe (≥30pp)' },
};

const URGENCY_TONE: Record<Urgency, { bg: string; fg: string; label: string }> = {
  overdue:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Overdue' },
  urgent:   { bg: '#ffe4b5', fg: '#8a4a00', label: 'Urgent' },
  due_soon: { bg: '#fff4d6', fg: '#a06200', label: 'Due soon' },
  on_track: { bg: '#d4edda', fg: '#155724', label: 'On track' },
  closed:   { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
};

const CLASS_TONE: Record<MaterialityClass, { bg: string; fg: string; label: string }> = {
  general_kpi:              { bg: '#e3e7ec', fg: '#1a3a5c', label: 'General' },
  climate_kpi:              { bg: '#d4edda', fg: '#155724', label: 'Climate (floor)' },
  safety_kpi:               { bg: '#fde0e0', fg: '#9b1f1f', label: 'Safety (floor)' },
  mandatory_disclosure_kpi: { bg: '#fff4d6', fg: '#a06200', label: 'Mandatory disclosure (floor)' },
  governance_kpi:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Governance' },
  supply_chain_kpi:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Supply chain' },
};

const SBTI_TONE: Record<SbtiPathway, { bg: string; fg: string; label: string }> = {
  '1_5C':          { bg: '#d4edda', fg: '#155724', label: '1.5°C' },
  'well_below_2C': { bg: '#dbecfb', fg: '#1a3a5c', label: '<2°C' },
  '2C':            { bg: '#fff4d6', fg: '#a06200', label: '2°C' },
  'not_aligned':   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Not aligned' },
};

const PROV_TONE: Record<ProvenanceBand, { bg: string; fg: string; label: string }> = {
  big4:               { bg: '#d4edda', fg: '#155724', label: 'Big-4' },
  iso14065_accredited:{ bg: '#dbecfb', fg: '#1a3a5c', label: 'ISO 14065' },
  industry_specialist:{ bg: '#fff4d6', fg: '#a06200', label: 'Industry' },
  inadequate:         { bg: '#fde0e0', fg: '#9b1f1f', label: 'Inadequate' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',             label: 'Open' },
  { key: 'all',              label: 'All' },
  { key: 'minor',            label: 'Minor' },
  { key: 'standard',         label: 'Standard' },
  { key: 'material',         label: 'Material' },
  { key: 'severe',           label: 'Severe' },
  { key: 'climate_kpi',      label: 'Climate' },
  { key: 'safety_kpi',       label: 'Safety' },
  { key: 'mandatory_disclosure_kpi', label: 'Mandatory disclosure' },
  { key: 'kpi_period_open',  label: 'Period open' },
  { key: 'baseline_set',     label: 'Baseline set' },
  { key: 'measurement_collected', label: 'Measured' },
  { key: 'independent_verification', label: 'Verifying' },
  { key: 'kpi_attested',     label: 'Attested' },
  { key: 'ratchet_computed', label: 'Ratchet computed' },
  { key: 'margin_amended',   label: 'Margin amended' },
  { key: 'breach_recorded',  label: 'Breach' },
  { key: 'cure_period',      label: 'Cure period' },
  { key: 'cure_failed',      label: 'Cure failed' },
  { key: 'restatement',      label: 'Restatement' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'floor_only',       label: 'Floor-at-material' },
];

type ActionKind =
  | 'set-baseline' | 'collect-measurement' | 'start-verification' | 'attest-kpi'
  | 'record-breach' | 'compute-ratchet' | 'amend-margin' | 'open-cure-period'
  | 'validate-cure' | 'fail-cure' | 'raise-restatement' | 're-verify'
  | 'trigger-sustainability-event' | 'cancel';

const ALLOWED_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  kpi_period_open:          ['set-baseline', 'trigger-sustainability-event', 'cancel'],
  baseline_set:             ['collect-measurement', 'trigger-sustainability-event', 'cancel'],
  measurement_collected:    ['start-verification', 'trigger-sustainability-event', 'cancel'],
  independent_verification: ['attest-kpi', 'record-breach', 'trigger-sustainability-event', 'cancel'],
  kpi_attested:             ['compute-ratchet', 'raise-restatement', 'trigger-sustainability-event', 'cancel'],
  ratchet_computed:         ['amend-margin', 'raise-restatement', 'trigger-sustainability-event', 'cancel'],
  margin_amended:           ['raise-restatement'],
  breach_recorded:          ['open-cure-period', 'trigger-sustainability-event', 'cancel'],
  cure_period:              ['validate-cure', 'fail-cure', 'trigger-sustainability-event', 'cancel'],
  cure_failed:              [],
  restatement:              ['re-verify', 'trigger-sustainability-event', 'cancel'],
  cancelled:                [],
  sustainability_event:     [],
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'set-baseline':                 'Set baseline (sustainability officer)',
  'collect-measurement':          'Collect measurement (borrower)',
  'start-verification':           'Start independent verification',
  'attest-kpi':                   'Attest KPI (verifier)',
  'record-breach':                'Record breach (verifier) — SARB EVERY tier',
  'compute-ratchet':              'Compute margin ratchet',
  'amend-margin':                 'Amend margin (credit committee)',
  'open-cure-period':             'Open cure period',
  'validate-cure':                'Validate cure (verifier)',
  'fail-cure':                    'Fail cure — SARB EVERY tier',
  'raise-restatement':            'Raise restatement',
  're-verify':                    'Re-verify',
  'trigger-sustainability-event': 'Sustainability event (M&A / refinance)',
  'cancel':                       'Cancel',
};

const ACTION_TONE: Record<ActionKind, 'primary' | 'danger' | 'warn' | 'good' | 'muted'> = {
  'set-baseline':                 'primary',
  'collect-measurement':          'primary',
  'start-verification':           'primary',
  'attest-kpi':                   'good',
  'record-breach':                'danger',
  'compute-ratchet':              'primary',
  'amend-margin':                 'good',
  'open-cure-period':             'warn',
  'validate-cure':                'good',
  'fail-cure':                    'danger',
  'raise-restatement':            'warn',
  're-verify':                    'primary',
  'trigger-sustainability-event': 'muted',
  'cancel':                       'muted',
};

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

const TERMINAL_STATES: ChainStatus[] = ['margin_amended', 'cure_failed', 'cancelled', 'sustainability_event'];

export function SllKpiChainTab() {
  const [rows, setRows] = useState<SllRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<SllRow | null>(null);
  const [events, setEvents] = useState<SllEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: SllRow[] } & KpiSummary }>('/lender/sll-kpi/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
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

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { compliance: SllRow; events: SllEvent[] } }>(
        `/lender/sll-kpi/chain/${id}`,
      );
      if (res.data?.data?.compliance) setSelected(res.data.data.compliance);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load SLL KPI history');
    }
  }, []);

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

  const act = useCallback(async (action: ActionKind, row: SllRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'set-baseline') {
        const basis = window.prompt('Basis — fixing the KPI baseline & target for this period:');
        if (!basis) return;
        const baseline = window.prompt(`Baseline value (${row.kpi_unit ?? 'value'}):`, String(row.kpi_baseline_value ?? ''));
        const target = window.prompt(`Target value (${row.kpi_unit ?? 'value'}):`, String(row.kpi_target_value ?? ''));
        const due = window.prompt('KPI due date (ISO 8601, e.g. 2026-12-31):', row.kpi_due_at ?? '');
        body = { baseline_basis: basis };
        if (baseline && !Number.isNaN(Number(baseline))) body.kpi_baseline_value = Number(baseline);
        if (target && !Number.isNaN(Number(target))) body.kpi_target_value = Number(target);
        if (due) body.kpi_due_at = due;
      } else if (action === 'collect-measurement') {
        const measured = window.prompt(`Measured value (${row.kpi_unit ?? 'value'}):`, String(row.kpi_measured_value ?? ''));
        if (!measured) return;
        const variance = window.prompt('Variance vs target (%, positive = miss, negative = beat):', String(row.measured_variance_pct ?? ''));
        body = {};
        if (measured && !Number.isNaN(Number(measured))) body.kpi_measured_value = Number(measured);
        if (variance && !Number.isNaN(Number(variance))) body.measured_variance_pct = Number(variance);
      } else if (action === 'start-verification') {
        const slug = window.prompt('Verifier slug (kpmg / pwc / ey / deloitte / sgs / dnv / tuv_sud / bureau_veritas):');
        if (!slug) return;
        const tcfd = window.prompt('TCFD pillars covered (0-4):', String(row.tcfd_pillars_covered ?? 0));
        body = { verifier_slug: slug };
        if (tcfd && !Number.isNaN(Number(tcfd))) body.tcfd_pillars_covered = Number(tcfd);
      } else if (action === 'attest-kpi') {
        const basis = window.prompt('Attestation basis — verifier attesting the KPI result:');
        if (!basis) return;
        const reduction = window.prompt('Emissions reduction trajectory (%/yr, SBTi):', String(row.emissions_reduction_pct_per_year ?? ''));
        const eligible = window.prompt('Taxonomy-eligible (ZAR):', String(row.taxonomy_eligible_zar ?? ''));
        const total = window.prompt('Total financing (ZAR):', String(row.total_financing_zar ?? ''));
        body = { attestation_basis: basis };
        if (reduction && !Number.isNaN(Number(reduction))) body.emissions_reduction_pct_per_year = Number(reduction);
        if (eligible && !Number.isNaN(Number(eligible))) body.taxonomy_eligible_zar = Number(eligible);
        if (total && !Number.isNaN(Number(total))) body.total_financing_zar = Number(total);
      } else if (action === 'record-breach') {
        const basis = window.prompt('Basis — record SLL KPI breach (SARB CPS 2024 EVERY tier):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. kpi_miss / target_undershoot / external_event):') || '';
        body = { breach_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'compute-ratchet') {
        const basis = window.prompt('Basis — compute margin ratchet from variance × tier:');
        if (!basis) return;
        const bps = window.prompt('Override ratchet bps (leave blank to auto-compute):');
        body = {};
        if (bps && !Number.isNaN(Number(bps))) body.ratchet_bps_this_period = Number(bps);
        if (basis) body.reason_code = basis;
      } else if (action === 'amend-margin') {
        const amend = window.prompt('Amendment reference (LMA amendment letter no.):');
        if (!amend) return;
        body = { amendment_ref: amend };
      } else if (action === 'open-cure-period') {
        const basis = window.prompt('Basis — open cure period for the breach:');
        if (!basis) return;
        const target = window.prompt('Cure target date (ISO 8601):');
        body = { cure_basis: basis };
        if (target) body.cure_target_at = target;
      } else if (action === 'validate-cure') {
        const ref = window.prompt('Cure validation reference (verifier letter):');
        if (!ref) return;
        body = { cure_ref: ref };
      } else if (action === 'fail-cure') {
        const basis = window.prompt('Basis — cure period lapsed without remediation (SARB CPS 2024 mandatory disclosure):');
        if (!basis) return;
        body = { fail_basis: basis };
      } else if (action === 'raise-restatement') {
        const basis = window.prompt('Basis — restate prior KPI attestation:');
        if (!basis) return;
        body = { restatement_basis: basis };
      } else if (action === 're-verify') {
        const slug = window.prompt('Verifier slug for re-verification:', row.verifier_slug ?? '');
        body = {};
        if (slug) body.verifier_slug = slug;
      } else if (action === 'trigger-sustainability-event') {
        const ref = window.prompt('Sustainability event reference (M&A / refinance / prepay deal id):');
        if (!ref) return;
        body = { sustainability_event_ref: ref };
      } else if (action === 'cancel') {
        const basis = window.prompt('Cancellation basis:');
        if (!basis) return;
        body = { cancellation_basis: basis };
      }
      await api.post(`/lender/sll-kpi/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">SLL KPI compliance & margin ratchet — the ESG-driven pricing layer</h2>
          <p className="text-xs text-[#4a5568]">
            13-state P6 Sustainability-Linked Loan KPI compliance lifecycle · LMA Sustainability-Linked Loan Principles +
            ICMA SLBP + SA Green Finance Taxonomy 2025 + SARB Climate Prudential Standards 2024. Beats Sustainalytics /
            ISS-ESG / MSCI ESG / S&P RobecoSAM CSA / Bloomberg ESG / Refinitiv ESG / LMA SLL Portal / ICMA SLBP / JSE
            Sustainability Index by live-wiring contractual margin step-ups / step-downs to independently-verified ESG
            KPIs (CO2 intensity, energy efficiency, safety-LTIFR, B-BBEE, mandatory disclosure, taxonomy alignment).
            INVERTED SLA: severe ESG-material breaches get the longest cure window because LMA SLL governance requires
            structural remediation (training, capex, supply-chain redesign), not a 30-day patch. Tier is RE-DERIVED on
            every transition from |variance_pp| × materiality_class with FLOOR-AT-MATERIAL for climate / safety /
            mandatory-disclosure KPIs. Live ESG battery (effective margin bps, cumulative ratchet ZAR, TCFD completeness,
            SBTi pathway, SA Green Taxonomy alignment, verifier provenance band, predicted amendment date) re-computes on
            every fetch. The W95 SIGNATURE: record_breach + fail_cure cross SARB CPS 2024 EVERY tier; raise_restatement
            + sla_breached cross material+severe; amend_margin crosses severe-only (material price change). Single write
            {'{admin, lender}'}; actor_party records sustainability_officer / verifier / credit_committee / borrower.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Margin amended" value={kpis?.margin_amended_count ?? 0} tone="ok" />
        <Kpi label="Breach" value={kpis?.breach_recorded_count ?? 0} tone={(kpis?.breach_recorded_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cure period" value={kpis?.cure_period_count ?? 0} tone={(kpis?.cure_period_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Cure failed" value={kpis?.cure_failed_count ?? 0} tone={(kpis?.cure_failed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Restatement" value={kpis?.restatement_count ?? 0} tone={(kpis?.restatement_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Floor-at-material" value={kpis?.floor_applied_count ?? 0} tone={(kpis?.floor_applied_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Outstanding" value={fmtZar(kpis?.total_outstanding_zar ?? 0)} />
        <Kpi label="Cum. ratchet" value={fmtBps(kpis?.total_cumulative_ratchet_bps ?? 0)} tone={(kpis?.total_cumulative_ratchet_bps ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Ratchet ZAR" value={fmtZar(kpis?.total_cumulative_ratchet_zar ?? 0)} />
        <Kpi label="Portfolio taxonomy" value={fmtPct(kpis?.portfolio_taxonomy_alignment_pct ?? 0)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Case #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Borrower / Facility</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">KPI</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Variance</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Cum. ratchet</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urgency</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.compliance_tier];
                const cls = CLASS_TONE[r.materiality_class];
                const ub = r.urgency_band ? URGENCY_TONE[r.urgency_band] : null;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.compliance_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable">●</span>}
                      {r.floor_at_material_class_flag && <span className="ml-1 text-[#9b1f1f]" title="Floor-at-material">▲</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[200px] truncate" title={`${r.borrower_party_name ?? ''} · ${r.facility_name ?? ''}`}>
                      <div className="font-medium">{r.borrower_party_name ?? '—'}</div>
                      <div className="text-[10px] text-[#4a5568] truncate">{r.facility_name ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="font-mono text-[10px]">{r.kpi_code}</div>
                      <div className="text-[10px] truncate max-w-[180px]" title={r.kpi_name ?? ''}>{r.kpi_name ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: cls.bg, color: cls.fg }}>
                        {cls.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {r.effective_variance_pct_live != null ? `${r.effective_variance_pct_live.toFixed(1)}pp` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${(r.cumulative_ratchet_bps ?? 0) > 0 ? 'text-[#9b1f1f] font-semibold' : (r.cumulative_ratchet_bps ?? 0) < 0 ? 'text-[#155724]' : 'text-[#4a5568]'}`}>
                      {fmtBps(r.cumulative_ratchet_bps)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {ub ? (
                        <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ub.bg, color: ub.fg }}>
                          {ub.label}
                        </span>
                      ) : <span className="text-[#4a5568]">—</span>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No SLL KPI compliance records match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

const BTN_CLASS: Record<'primary' | 'danger' | 'warn' | 'good' | 'muted', string> = {
  primary: 'rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]',
  danger:  'rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-50',
  warn:    'rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50',
  good:    'rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-800 hover:bg-green-50',
  muted:   'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]',
};

function Drawer({
  row, events, onClose, onAct,
}: {
  row: SllRow;
  events: SllEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: SllRow) => void;
}) {
  const actions = ALLOWED_ACTIONS[row.chain_status] || [];
  const sbtiBand = row.sbti_pathway_live ? SBTI_TONE[row.sbti_pathway_live] : null;
  const provBand = row.verification_provenance_band_live ? PROV_TONE[row.verification_provenance_band_live] : null;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[760px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.compliance_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.borrower_party_name ?? '—'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {row.facility_name ?? '—'}
                {row.kpi_period_label ? ` · ${row.kpi_period_label}` : ''}
                {row.kpi_period_year ? ` (${row.kpi_period_year})` : ''}
              </div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.compliance_tier].label}
                {' · '}
                {CLASS_TONE[row.materiality_class].label}
                {row.urgency_band ? ` · ${URGENCY_TONE[row.urgency_band].label.toLowerCase()}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                KPI {row.kpi_code} · {row.kpi_name ?? '—'} ({row.kpi_unit ?? '—'})
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Live ESG margin-pricing battery</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Effective margin (live)" value={fmtNum(row.effective_margin_bps_live, 1) + ' bps'} />
            <Pair label="Cumulative ratchet (bps)" value={fmtBps(row.cumulative_ratchet_bps)} />
            <Pair label="Cumulative ratchet (ZAR)" value={fmtZar(row.cumulative_ratchet_zar_live)} />
            <Pair label="Effective variance (live)" value={row.effective_variance_pct_live != null ? `${row.effective_variance_pct_live.toFixed(2)}pp` : '—'} />
            <Pair label="Tier (re-derived)" value={row.tier_live ? TIER_TONE[row.tier_live].label : '—'} />
            <Pair label="TCFD completeness" value={fmtPct(row.tcfd_completeness_pct_live)} />
            <Pair label="Attestation completeness" value={fmtPct(row.attestation_completeness_pct_live)} />
            <Pair label="SBTi pathway" value={sbtiBand ? sbtiBand.label : '—'} />
            <Pair label="Taxonomy alignment" value={fmtPct(row.taxonomy_alignment_pct_live)} />
            <Pair label="Verifier provenance" value={provBand ? provBand.label : '—'} />
            <Pair label="Days to KPI due" value={row.days_to_kpi_due_live != null ? String(row.days_to_kpi_due_live) : '—'} />
            <Pair label="Predicted amendment" value={fmtDate(row.predicted_amendment_date_live ?? null)} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">KPI measurement & loan terms</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State" value={STATE_TONE[row.chain_status].label} />
            <Pair label="Authority required" value={row.authority_required ?? '—'} />
            <Pair label="Outstanding" value={fmtZar(row.outstanding_zar)} />
            <Pair label="Base margin (bps)" value={fmtNum(row.base_margin_bps, 1)} />
            <Pair label="Remaining tenor (days)" value={String(row.remaining_tenor_days)} />
            <Pair label="Baseline" value={fmtNum(row.kpi_baseline_value)} />
            <Pair label="Target" value={fmtNum(row.kpi_target_value)} />
            <Pair label="Measured" value={fmtNum(row.kpi_measured_value)} />
            <Pair label="Forecast" value={fmtNum(row.kpi_forecast_value)} />
            <Pair label="Measured variance" value={row.measured_variance_pct != null ? `${row.measured_variance_pct.toFixed(2)}pp` : '—'} />
            <Pair label="Forecast variance" value={row.forecast_variance_pct != null ? `${row.forecast_variance_pct.toFixed(2)}pp` : '—'} />
            <Pair label="Ratchet this period (bps)" value={fmtBps(row.ratchet_bps_this_period)} />
            <Pair label="Cure-failed penalty (bps)" value={fmtBps(row.cure_failed_penalty_bps)} />
            <Pair label="Emissions reduction (%/yr)" value={fmtNum(row.emissions_reduction_pct_per_year, 2)} />
            <Pair label="Taxonomy eligible (ZAR)" value={fmtZar(row.taxonomy_eligible_zar)} />
            <Pair label="Total financing (ZAR)" value={fmtZar(row.total_financing_zar)} />
            <Pair label="TCFD pillars covered" value={`${row.tcfd_pillars_covered} / 4`} />
            <Pair label="Attestation fields" value={`${row.attestation_fields_present} / ${row.attestation_fields_required}`} />
            <Pair label="Verifier" value={row.verifier_slug ?? '—'} />
            <Pair label="Cure target" value={fmtDate(row.cure_target_at)} />
            <Pair label="Cure actual" value={fmtDate(row.cure_actual_at)} />
            <Pair label="KPI due" value={fmtDate(row.kpi_due_at)} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Lifecycle timestamps</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Period open"           value={fmtDate(row.kpi_period_open_at)} />
            <Pair label="Baseline set"          value={fmtDate(row.baseline_set_at)} />
            <Pair label="Measurement collected" value={fmtDate(row.measurement_collected_at)} />
            <Pair label="Verification started"  value={fmtDate(row.independent_verification_at)} />
            <Pair label="KPI attested"          value={fmtDate(row.kpi_attested_at)} />
            <Pair label="Ratchet computed"      value={fmtDate(row.ratchet_computed_at)} />
            <Pair label="Margin amended"        value={fmtDate(row.margin_amended_at)} />
            <Pair label="Breach recorded"       value={fmtDate(row.breach_recorded_at)} />
            <Pair label="Cure period opened"    value={fmtDate(row.cure_period_at)} />
            <Pair label="Cure failed"           value={fmtDate(row.cure_failed_at)} />
            <Pair label="Restatement"           value={fmtDate(row.restatement_at)} />
            <Pair label="Sustainability event"  value={fmtDate(row.sustainability_event_at)} />
            <Pair label="Cancelled"             value={fmtDate(row.cancelled_at)} />
            <Pair label="SLA deadline"          value={fmtDate(row.sla_deadline_at)} />
            <Pair label="Last SLA breach"       value={fmtDate(row.last_sla_breach_at)} />
            <Pair label="SLA status"            value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Reportable"            value={row.is_reportable_flag ? 'Yes' : 'No'} />
            <Pair label="Reason code"           value={row.reason_code ?? '—'} />
            <Pair label="Regulator ref"         value={row.regulator_ref ?? '—'} />
            <Pair label="Amendment ref"         value={row.amendment_ref ?? '—'} />
          </div>
          {row.baseline_basis && (
            <BasisBlock label="Baseline basis" tone="#1a3a5c" text={row.baseline_basis} />
          )}
          {row.attestation_basis && (
            <BasisBlock label="Attestation basis" tone="#155724" text={row.attestation_basis} />
          )}
          {row.breach_basis && (
            <BasisBlock label="Breach basis" tone="#9b1f1f" text={row.breach_basis} />
          )}
          {row.fail_basis && (
            <BasisBlock label="Cure-fail basis" tone="#9b1f1f" text={row.fail_basis} />
          )}
          {row.cure_basis && (
            <BasisBlock label="Cure basis" tone="#a06200" text={row.cure_basis} />
          )}
          {row.restatement_basis && (
            <BasisBlock label="Restatement basis" tone="#a06200" text={row.restatement_basis} />
          )}
          {row.cancellation_basis && (
            <BasisBlock label="Cancellation basis" tone="#557" text={row.cancellation_basis} />
          )}
        </section>

        {actions.length > 0 && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {actions.map((a, idx) => (
                <button type="button"
                  key={a}
                  onClick={() => onAct(a, row)}
                  className={idx === 0 ? BTN_CLASS.primary : BTN_CLASS[ACTION_TONE[a]]}
                >
                  {ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-medium text-[#4a5568]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function BasisBlock({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="mt-3 text-[12px]">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: tone }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: tone }}>{text}</div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
