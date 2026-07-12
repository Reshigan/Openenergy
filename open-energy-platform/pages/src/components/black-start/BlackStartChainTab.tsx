// Wave 84 — Grid Black-Start Capability Contracting & System-Restoration Drill tab.
//
// The RESTORATION engine of the System Operator. SA Grid Code Sections OC-1 / OC-12
// + NTCSA Black-Start Annex + NERSA System Defence & Restoration Plan + IEC 60870-5
// + IEEE Std 1547 + NRS 048-2. Every contracted Black-Start Capability (BSC) unit
// demonstrates readiness annually under a witnessed drill: start on cranking power,
// energise a dead bus, hold frequency + voltage, pick up auxiliary load, backfeed
// to a System-Operator restoration path within the contracted window.
//
// 12-state P6: needs_assessed → solicitation_issued → bid_evaluation
//   → contract_awarded → contract_executed → drill_scheduled → drill_in_progress
//   → drill_completed → recertified            (clean path).
//   drill_completed → drill_failed → remediation_required → drill_scheduled (loop).
//   contract_terminated terminal from any non-terminal.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

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
  | 'needs_assessed' | 'solicitation_issued' | 'bid_evaluation' | 'contract_awarded'
  | 'contract_executed' | 'drill_scheduled' | 'drill_in_progress' | 'drill_completed'
  | 'recertified' | 'drill_failed' | 'remediation_required' | 'contract_terminated';

type Tier = 'minor' | 'standard' | 'material' | 'island_critical';
type VoltageClass = 'distribution' | 'sub_transmission' | 'transmission' | 'bulk';
type RestorationRole = 'cranking_anchor' | 'restoration_unit' | 'auxiliary_unit';
type CrankingSource = 'hydro' | 'diesel_starter' | 'battery_inverter' | 'compressed_air';

interface BscRow {
  [key: string]: unknown;
  id: string;
  capability_number: string;
  system_operator_name: string;
  bsc_provider_name: string | null;
  facility_name: string | null;
  province: string | null;
  restoration_zone: string | null;
  voltage_class: VoltageClass;
  restoration_role: RestorationRole;
  cranking_source: CrankingSource;
  black_start_capacity_mw: number;
  target_capacity_mw: number;
  cranking_time_target_minutes: number;
  backfeed_time_target_minutes: number;
  capability_tier: Tier;
  is_system_critical: number;
  contract_ref: string | null;
  contract_value_zar: number;
  contract_start_at: string | null;
  contract_end_at: string | null;
  drill_scheduled_at: string | null;
  drill_window_minutes: number;
  drill_commenced_at: string | null;
  drill_completed_at: string | null;
  last_drill_at: string | null;
  drills_passed_count: number;
  drills_total_count: number;
  consecutive_failures: number;
  zone_provinces_represented: number;
  zone_voltage_classes_covered: number;
  zone_fuel_hydro_count: number;
  zone_fuel_diesel_count: number;
  zone_fuel_battery_count: number;
  zone_fuel_compressed_air_count: number;
  cranking_source_confirmed_flag: number;
  dead_bus_energisation_flag: number;
  frequency_hold_flag: number;
  voltage_hold_flag: number;
  auxiliary_load_pickup_flag: number;
  backfeed_within_sla_flag: number;
  chain_basis: string | null;
  reason_code: string | null;
  capability_summary: string | null;
  last_action_ref: string | null;
  regulator_ref: string | null;
  chain_status: ChainStatus;
  needs_assessed_at: string;
  solicitation_issued_at: string | null;
  bid_evaluation_at: string | null;
  contract_awarded_at: string | null;
  contract_executed_at: string | null;
  drill_scheduled_status_at: string | null;
  drill_in_progress_at: string | null;
  drill_completed_status_at: string | null;
  recertified_at: string | null;
  drill_failed_at: string | null;
  remediation_required_at: string | null;
  contract_terminated_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  is_reportable: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  is_system_critical_flag?: boolean;
  breach_crosses_regulator?: boolean;
  restoration_coverage_ratio_live?: number;
  geographic_diversity_index_live?: number;
  fuel_diversity_index_live?: number;
  voltage_class_coverage_live?: number;
  drill_pass_rate_live?: number;
  restoration_path_valid_flag_live?: boolean;
  criticality_score_live?: number;
  days_since_last_drill_live?: number | null;
  days_until_next_drill_due_live?: number | null;
  predicted_lifecycle_days_live?: number;
}

interface KpiSummary {
  total: number;
  open_count: number;
  recertified_count: number;
  drill_failed_count: number;
  remediation_count: number;
  terminated_count: number;
  breached: number;
  reportable_total: number;
  system_critical_count: number;
  total_contracted_mw: number;
  total_target_mw: number;
  total_drill_failures: number;
  high_criticality_count: number;
  path_invalid_count: number;
  overdue_drill_count: number;
}

const ALL_STATES = [
  'needs_assessed', 'solicitation_issued', 'bid_evaluation', 'contract_awarded',
  'contract_executed', 'drill_scheduled', 'drill_in_progress', 'drill_completed',
  'recertified',
] as const;

const BRANCH_STATES = [
  'drill_failed', 'remediation_required', 'contract_terminated',
] as const;

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',               label: 'Active' },
  { key: 'all',                  label: 'All' },
  { key: 'minor',                label: 'Minor' },
  { key: 'standard',             label: 'Standard' },
  { key: 'material',             label: 'Material' },
  { key: 'island_critical',      label: 'Island-critical' },
  { key: 'drill_scheduled',      label: 'Drill scheduled' },
  { key: 'drill_in_progress',    label: 'Drill in progress' },
  { key: 'drill_completed',      label: 'Drill completed' },
  { key: 'drill_failed',         label: 'Drill failed' },
  { key: 'remediation_required', label: 'Remediation' },
  { key: 'recertified',          label: 'Recertified' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'reportable',           label: 'Reportable' },
  { key: 'system_critical',      label: 'System-critical' },
  { key: 'contract_terminated',  label: 'Terminated' },
];

const TERMINAL_STATES: ChainStatus[] = ['recertified', 'contract_terminated'];

const VOLTAGE_LABEL: Record<VoltageClass, string> = {
  distribution:     'Distribution',
  sub_transmission: 'Sub-transmission',
  transmission:     'Transmission',
  bulk:             'Bulk',
};

const ROLE_LABEL: Record<RestorationRole, string> = {
  cranking_anchor:  'Cranking anchor',
  restoration_unit: 'Restoration unit',
  auxiliary_unit:   'Auxiliary unit',
};

const CRANKING_LABEL: Record<CrankingSource, string> = {
  hydro:            'Hydro',
  diesel_starter:   'Diesel starter',
  battery_inverter: 'Battery inverter',
  compressed_air:   'Compressed air',
};

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)} GW`;
  return `${n.toFixed(0)} MW`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return '—';
  if (n >= 1_000_000_000) return `R ${(n / 1_000_000_000).toFixed(2)} bn`;
  if (n >= 1_000_000) return `R ${(n / 1_000_000).toFixed(1)} m`;
  if (n >= 1_000) return `R ${(n / 1_000).toFixed(0)} k`;
  return `R ${n.toFixed(0)}`;
}

function getActions(row: BscRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;
  const notTerminal = !TERMINAL_STATES.includes(s);

  if (s === 'needs_assessed') {
    actions.push({
      key: 'issue-solicitation',
      label: 'Issue solicitation (SO)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Solicitation basis — published RFP for black-start capability', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'solicitation_issued') {
    actions.push({
      key: 'close-solicitation',
      label: 'Close solicitation → bid evaluation (SO)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Close-solicitation basis — bid evaluation begins', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'bid_evaluation') {
    actions.push({
      key: 'award-contract',
      label: 'Award contract (SO)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Award basis — provider selected', type: 'textarea', required: true },
        { key: 'contract_ref', label: 'Contract reference (e.g. BSC-2026-007)', type: 'text', required: false },
        { key: 'contract_value_zar', label: 'Contract value (ZAR)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'contract_awarded') {
    actions.push({
      key: 'execute-contract',
      label: 'Execute contract (SO + provider)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Execute-contract basis — counter-signed contract effective', type: 'textarea', required: true },
        { key: 'contract_start_at', label: 'Contract start (ISO datetime, blank = now)', type: 'text', required: false },
        { key: 'contract_end_at', label: 'Contract end (ISO datetime)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'contract_executed') {
    actions.push({
      key: 'schedule-drill',
      label: 'Schedule annual drill (planner)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Schedule-drill basis — annual restoration drill scheduled', type: 'textarea', required: true },
        { key: 'drill_scheduled_at', label: 'Drill scheduled at (ISO datetime)', type: 'text', required: false },
        { key: 'drill_window_minutes', label: 'Drill window (minutes)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'drill_scheduled') {
    actions.push({
      key: 'commence-drill',
      label: 'Commence drill (provider + observer)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Commence-drill basis — drill commenced on cranking power', type: 'textarea', required: true },
        { key: 'drill_commenced_at', label: 'Drill commenced at (ISO datetime, blank = now)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'drill_in_progress') {
    actions.push({
      key: 'complete-drill',
      label: 'Record drill completed (observer)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Complete-drill basis — drill completed (record gate flags below)', type: 'textarea', required: true },
        { key: 'cranking_source_confirmed_flag', label: 'Cranking source confirmed? (1 = yes, 0 = no)', type: 'text', required: false },
        { key: 'dead_bus_energisation_flag', label: 'Dead-bus energisation? (1 = yes, 0 = no)', type: 'text', required: false },
        { key: 'frequency_hold_flag', label: 'Frequency hold within band? (1 = yes, 0 = no)', type: 'text', required: false },
        { key: 'voltage_hold_flag', label: 'Voltage hold within band? (1 = yes, 0 = no)', type: 'text', required: false },
        { key: 'auxiliary_load_pickup_flag', label: 'Auxiliary load pickup? (1 = yes, 0 = no)', type: 'text', required: false },
        { key: 'backfeed_within_sla_flag', label: 'Backfeed within SLA window? (1 = yes, 0 = no)', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'fail-drill',
      label: 'Mark drill FAILED (observer)',
      tone: 'danger',
      fields: [
        { key: 'chain_basis', label: 'Fail-drill basis — drill FAILED (RELIABILITY — always crosses regulator)', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. cranking_failure / dead_bus_collapse / freq_excursion / backfeed_overrun)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator', 'admin'],
    });
  }

  if (s === 'drill_completed') {
    actions.push({
      key: 'recertify',
      label: 'Recertify capability (planner)',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Recertification basis — restoration planner recertifies the capability (RELIABILITY — large tiers cross regulator)', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'fail-drill',
      label: 'Mark drill FAILED (observer)',
      tone: 'danger',
      fields: [
        { key: 'chain_basis', label: 'Fail-drill basis — drill FAILED (RELIABILITY — always crosses regulator)', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. cranking_failure / dead_bus_collapse / freq_excursion / backfeed_overrun)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator', 'admin'],
    });
  }

  if (s === 'drill_failed') {
    actions.push({
      key: 'require-remediation',
      label: 'Require remediation (planner)',
      tone: 'warn',
      fields: [
        { key: 'chain_basis', label: 'Remediation basis — provider must remediate (large tiers cross regulator)', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. retraining / equipment_repair / procedural_fix)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'remediation_required') {
    actions.push({
      key: 'complete-remediation',
      label: 'Remediation complete → reschedule drill',
      tone: 'primary',
      fields: [
        { key: 'chain_basis', label: 'Complete-remediation basis — remediation accepted, reschedule next drill', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (notTerminal) {
    actions.push({
      key: 'terminate-contract',
      label: 'Terminate contract (SO)',
      tone: 'danger',
      fields: [
        { key: 'chain_basis', label: 'Termination basis — terminate the BSC contract (RELIABILITY — always crosses regulator)', type: 'textarea', required: true },
        { key: 'reason_code', label: 'Reason code (e.g. repeated_failure / commercial_default / provider_exit)', type: 'text', required: false },
      ],
      cascadeTo: ['regulator', 'admin'],
    });
  }

  return actions;
}

function renderDetail(row: BscRow): React.ReactNode {
  const passPct = Math.round((row.drill_pass_rate_live ?? 0) * 100);
  const coverPct = Math.round((row.restoration_coverage_ratio_live ?? 0) * 100);
  const geoPct = Math.round((row.geographic_diversity_index_live ?? 0) * 100);
  const fuelPct = Math.round((row.fuel_diversity_index_live ?? 0) * 100);
  const voltagePct = Math.round((row.voltage_class_coverage_live ?? 0) * 100);
  const crit = row.criticality_score_live ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Live restoration-readiness battery */}
      <section>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 8 }}>
          Live restoration-readiness battery
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          <DetailPair label="Contracted MW" value={`${row.black_start_capacity_mw.toFixed(0)} MW`} />
          <DetailPair label="Target MW" value={`${row.target_capacity_mw.toFixed(0)} MW`} />
          <DetailPair label="Coverage" value={`${coverPct}%`} />
          <DetailPair label="Criticality" value={`${crit} / 100`} />
          <DetailPair label="Geo diversity" value={`${geoPct}%`} />
          <DetailPair label="Fuel diversity" value={`${fuelPct}%`} />
          <DetailPair label="Voltage coverage" value={`${voltagePct}%`} />
          <DetailPair label="Pass rate" value={row.drills_total_count > 0 ? `${passPct}% (${row.drills_passed_count}/${row.drills_total_count})` : '—'} />
          <DetailPair label="Days since last drill" value={row.days_since_last_drill_live != null ? `${row.days_since_last_drill_live}d` : '—'} />
          <DetailPair label="Days until next" value={row.days_until_next_drill_due_live != null ? `${row.days_until_next_drill_due_live}d` : '—'} />
          <DetailPair label="Restoration path" value={row.restoration_path_valid_flag_live ? 'VALID' : 'INVALID'} />
          <DetailPair label="Predicted lifecycle" value={`${row.predicted_lifecycle_days_live ?? 0}d`} />
        </div>
      </section>

      {/* Drill gate flags */}
      <section>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 8 }}>
          Drill gate flags
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          <DetailPair label="Cranking source" value={row.cranking_source_confirmed_flag ? '✓' : '—'} />
          <DetailPair label="Dead-bus energisation" value={row.dead_bus_energisation_flag ? '✓' : '—'} />
          <DetailPair label="Frequency hold" value={row.frequency_hold_flag ? '✓' : '—'} />
          <DetailPair label="Voltage hold" value={row.voltage_hold_flag ? '✓' : '—'} />
          <DetailPair label="Aux load pickup" value={row.auxiliary_load_pickup_flag ? '✓' : '—'} />
          <DetailPair label="Backfeed in SLA" value={row.backfeed_within_sla_flag ? '✓' : '—'} />
          <DetailPair label="Cranking target" value={row.cranking_time_target_minutes > 0 ? `${row.cranking_time_target_minutes}m` : '—'} />
          <DetailPair label="Backfeed target" value={row.backfeed_time_target_minutes > 0 ? `${row.backfeed_time_target_minutes}m` : '—'} />
          <DetailPair label="Consec. failures" value={String(row.consecutive_failures)} />
        </div>
      </section>

      {/* Zone diversity */}
      <section>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 8 }}>
          Zone diversity
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          <DetailPair label="Provinces" value={`${row.zone_provinces_represented} / 9`} />
          <DetailPair label="Voltage classes" value={`${row.zone_voltage_classes_covered} / 4`} />
          <DetailPair label="Hydro" value={String(row.zone_fuel_hydro_count)} />
          <DetailPair label="Diesel" value={String(row.zone_fuel_diesel_count)} />
          <DetailPair label="Battery" value={String(row.zone_fuel_battery_count)} />
          <DetailPair label="Compressed air" value={String(row.zone_fuel_compressed_air_count)} />
        </div>
      </section>

      {/* Lifecycle */}
      <section>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 8 }}>
          Lifecycle
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          <DetailPair label="Contract ref" value={row.contract_ref ?? '—'} />
          <DetailPair label="Contract value" value={fmtZar(row.contract_value_zar)} />
          <DetailPair label="Contract start" value={fmtDate(row.contract_start_at)} />
          <DetailPair label="Contract end" value={fmtDate(row.contract_end_at)} />
          <DetailPair label="Drill window" value={row.drill_window_minutes > 0 ? `${row.drill_window_minutes}m` : '—'} />
          <DetailPair label="Drill scheduled" value={fmtDate(row.drill_scheduled_at)} />
          <DetailPair label="Drill commenced" value={fmtDate(row.drill_commenced_at)} />
          <DetailPair label="Drill completed" value={fmtDate(row.drill_completed_at)} />
          <DetailPair label="Last drill" value={fmtDate(row.last_drill_at)} />
          <DetailPair label="Needs assessed" value={fmtDate(row.needs_assessed_at)} />
          <DetailPair label="Solicitation issued" value={fmtDate(row.solicitation_issued_at)} />
          <DetailPair label="Bid evaluation" value={fmtDate(row.bid_evaluation_at)} />
          <DetailPair label="Contract awarded" value={fmtDate(row.contract_awarded_at)} />
          <DetailPair label="Contract executed" value={fmtDate(row.contract_executed_at)} />
          <DetailPair label="Drill in progress" value={fmtDate(row.drill_in_progress_at)} />
          <DetailPair label="Recertified at" value={fmtDate(row.recertified_at)} />
          <DetailPair label="Drill failed at" value={fmtDate(row.drill_failed_at)} />
          <DetailPair label="Remediation at" value={fmtDate(row.remediation_required_at)} />
          <DetailPair label="Terminated at" value={fmtDate(row.contract_terminated_at)} />
          <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
          <DetailPair label="SLA status" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
          <DetailPair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
          <DetailPair label="Reason code" value={row.reason_code ?? '—'} />
          <DetailPair label="Last action ref" value={row.last_action_ref ?? '—'} />
          <DetailPair label="Regulator ref" value={row.regulator_ref ?? '—'} />
        </div>
        {row.capability_summary && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX2, marginBottom: 4 }}>
              Capability summary
            </div>
            <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.capability_summary}</div>
          </div>
        )}
        {row.chain_basis && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX2, marginBottom: 4 }}>
              Chain basis
            </div>
            <div style={{ fontSize: 12, color: TX1, whiteSpace: 'pre-wrap' }}>{row.chain_basis}</div>
          </div>
        )}
      </section>
    </div>
  );
}

export function BlackStartChainTab() {
  const [rows, setRows] = useState<BscRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: BscRow[] } & KpiSummary }>('/black-start/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setSummary({
          total: d.total, open_count: d.open_count, recertified_count: d.recertified_count,
          drill_failed_count: d.drill_failed_count, remediation_count: d.remediation_count,
          terminated_count: d.terminated_count, breached: d.breached,
          reportable_total: d.reportable_total, system_critical_count: d.system_critical_count,
          total_contracted_mw: d.total_contracted_mw, total_target_mw: d.total_target_mw,
          total_drill_failures: d.total_drill_failures,
          high_criticality_count: d.high_criticality_count,
          path_invalid_count: d.path_invalid_count, overdue_drill_count: d.overdue_drill_count,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load black-start capabilities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      const body: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '') continue;
        const numericKeys = ['contract_value_zar', 'drill_window_minutes', 'cranking_source_confirmed_flag',
          'dead_bus_energisation_flag', 'frequency_hold_flag', 'voltage_hold_flag',
          'auxiliary_load_pickup_flag', 'backfeed_within_sla_flag'];
        if (numericKeys.includes(k) && !Number.isNaN(Number(v))) {
          body[k] = Number(v);
        } else {
          body[k] = v;
        }
      }
      await api.post(`/black-start/chain/${rowId}/${key}`, body);
      await load();
      // Refresh events if expanded
      if (expandedEvents[rowId]) {
        await handleExpand(rowId);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: BscRow; events: ChainEvent[] } }>(
        `/black-start/chain/${id}`,
      );
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load BSC history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')        return !!r.sla_breached;
      if (filter === 'reportable')      return !!r.is_reportable_flag;
      if (filter === 'system_critical') return !!r.is_system_critical_flag;
      if (filter === 'minor' || filter === 'standard' || filter === 'material' || filter === 'island_critical') {
        return r.capability_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ padding: 20, background: BG, minHeight: '100%' }}>
      {/* Header */}
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: TX1, margin: 0 }}>
          Black-start capability &amp; restoration drill
        </h2>
        <p style={{ fontSize: 11, color: TX2, margin: '4px 0 0' }}>
          12-stage SA Grid Code OC-1 / OC-12 + NTCSA Black-Start Annex + NERSA System Defence &amp; Restoration Plan.
          SIGNATURE: fail_drill + terminate_contract cross regulator for every tier; recertify + require_remediation + sla_breached cross material + island_critical.
        </p>
      </header>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 16 }}>
        <KpiTile label="Total" value={summary?.total ?? rows.length} />
        <KpiTile label="Open" value={summary?.open_count ?? 0} />
        <KpiTile label="Recertified" value={summary?.recertified_count ?? 0} tone="ok" />
        <KpiTile label="Drill failed" value={summary?.drill_failed_count ?? 0} tone={(summary?.drill_failed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Remediation" value={summary?.remediation_count ?? 0} tone={(summary?.remediation_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Terminated" value={summary?.terminated_count ?? 0} tone={(summary?.terminated_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="SLA breached" value={summary?.breached ?? 0} tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Reportable" value={summary?.reportable_total ?? 0} tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="System-critical" value={summary?.system_critical_count ?? 0} />
        <KpiTile label="Contracted" value={fmtMw(summary?.total_contracted_mw ?? 0)} />
        <KpiTile label="Target" value={fmtMw(summary?.total_target_mw ?? 0)} />
        <KpiTile label="Crit ≥60" value={summary?.high_criticality_count ?? 0} tone={(summary?.high_criticality_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Path invalid" value={summary?.path_invalid_count ?? 0} tone={(summary?.path_invalid_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Overdue drill" value={summary?.overdue_drill_count ?? 0} tone={(summary?.overdue_drill_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Cum. failures" value={summary?.total_drill_failures ?? 0} />
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              transition: 'all 120ms',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, border: `1px solid ${BAD}40`, background: `${BAD}10`, fontSize: 12, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: TX3 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: TX3 }}>No black-start capabilities match.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => {
            const passPct = Math.round((row.drill_pass_rate_live ?? 0) * 100);
            const crit = row.criticality_score_live ?? 0;
            const meta = (
              <span>
                {ROLE_LABEL[row.restoration_role]} · {CRANKING_LABEL[row.cranking_source]} · {VOLTAGE_LABEL[row.voltage_class]}
                {' · '}{row.black_start_capacity_mw.toFixed(0)} MW
                {row.drills_total_count > 0 ? ` · pass ${passPct}%` : ''}
                {crit >= 60 ? ` · crit ${crit}` : ''}
                {row.province ? ` · ${row.province}` : ''}
                {row.is_reportable_flag ? ' · reportable' : ''}
                {row.is_system_critical_flag ? ' · system-critical' : ''}
              </span>
            );

            return (
              <ChainCard
                key={row.id}
                item={{
                  ...row,
                  case_number: row.capability_number,
                }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.facility_name || row.bsc_provider_name || row.capability_number}
                meta={meta}
                actions={getActions(row)}
                onAction={(key, values) => handleAction(row.id, key, values)}
                onExpand={handleExpand}
                events={expandedEvents[row.id]}
                detail={renderDetail(row)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1 }}>{value}</div>
    </div>
  );
}

export default BlackStartChainTab;
