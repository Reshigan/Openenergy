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
//
// W84 distinctive layer (beats PJM Black Start Service / ERCOT Black Start / NGESO
// Black Start / ENTSO-E System Defence & Restoration Plan / MISO Black Start
// Resource): live restoration-readiness battery — contracted vs target MW, coverage
// ratio, geographic diversity across 9 SA provinces, fuel-type diversity across 4
// cranking sources, voltage-class coverage across 4 classes, days since last drill,
// days until next drill due, rolling drill pass rate, restoration-path validity
// gate (6 inputs), composite criticality score, predicted lifecycle days.
//
// SIGNATURE = RELIABILITY-driven reportability:
//   fail_drill          crosses EVERY tier (loss of demonstrated readiness);
//   terminate_contract  crosses EVERY tier (loss of contracted restoration unit);
//   recertify           crosses material + island_critical;
//   require_remediation crosses material + island_critical;
//   sla_breached        crosses material + island_critical.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'needs_assessed' | 'solicitation_issued' | 'bid_evaluation' | 'contract_awarded'
  | 'contract_executed' | 'drill_scheduled' | 'drill_in_progress' | 'drill_completed'
  | 'recertified' | 'drill_failed' | 'remediation_required' | 'contract_terminated';

type Tier = 'minor' | 'standard' | 'material' | 'island_critical';

type VoltageClass = 'distribution' | 'sub_transmission' | 'transmission' | 'bulk';

type RestorationRole = 'cranking_anchor' | 'restoration_unit' | 'auxiliary_unit';

type CrankingSource = 'hydro' | 'diesel_starter' | 'battery_inverter' | 'compressed_air';

interface BscRow {
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

interface BscEvent {
  id: string;
  capability_id: string;
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

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  needs_assessed:       { bg: '#e3e7ec', fg: '#557',    label: 'Needs assessed' },
  solicitation_issued:  { bg: '#dbecfb', fg: '#1a3a5c', label: 'Solicitation issued' },
  bid_evaluation:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Bid evaluation' },
  contract_awarded:     { bg: '#fff4d6', fg: '#a06200', label: 'Contract awarded' },
  contract_executed:    { bg: '#fff4d6', fg: '#a06200', label: 'Contract executed' },
  drill_scheduled:      { bg: '#ffe9d6', fg: '#8a4a00', label: 'Drill scheduled' },
  drill_in_progress:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Drill in progress' },
  drill_completed:      { bg: '#dfe9f3', fg: '#1a3a5c', label: 'Drill completed' },
  recertified:          { bg: '#d4edda', fg: '#155724', label: 'Recertified' },
  drill_failed:         { bg: '#fde0e0', fg: '#9b1f1f', label: 'Drill FAILED' },
  remediation_required: { bg: '#ffe0e0', fg: '#9b1f1f', label: 'Remediation required' },
  contract_terminated:  { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Contract terminated' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:           { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<50)' },
  standard:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard (<250)' },
  material:        { bg: '#ffe4b5', fg: '#8a4a00', label: 'Material (<500)' },
  island_critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Island-critical (≥500)' },
};

const VOLTAGE_LABEL: Record<VoltageClass, string> = {
  distribution:     'Distribution',
  sub_transmission: 'Sub-transmission',
  transmission:     'Transmission',
  bulk:             'Bulk',
};

const ROLE_LABEL: Record<RestorationRole, string> = {
  cranking_anchor:   'Cranking anchor',
  restoration_unit:  'Restoration unit',
  auxiliary_unit:    'Auxiliary unit',
};

const CRANKING_LABEL: Record<CrankingSource, string> = {
  hydro:            'Hydro',
  diesel_starter:   'Diesel starter',
  battery_inverter: 'Battery inverter',
  compressed_air:   'Compressed air',
};

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

type ActionKind =
  | 'issue-solicitation' | 'close-solicitation' | 'award-contract' | 'execute-contract'
  | 'schedule-drill' | 'commence-drill' | 'complete-drill' | 'recertify'
  | 'fail-drill' | 'require-remediation' | 'complete-remediation' | 'terminate-contract';

const PRIMARY_ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  needs_assessed:       'issue-solicitation',
  solicitation_issued:  'close-solicitation',
  bid_evaluation:       'award-contract',
  contract_awarded:     'execute-contract',
  contract_executed:    'schedule-drill',
  drill_scheduled:      'commence-drill',
  drill_in_progress:    'complete-drill',
  drill_completed:      'recertify',
  remediation_required: 'complete-remediation',
  drill_failed:         'require-remediation',
  recertified:          null,
  contract_terminated:  null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'issue-solicitation':   'Issue solicitation (SO)',
  'close-solicitation':   'Close solicitation → bid evaluation (SO)',
  'award-contract':       'Award contract (SO)',
  'execute-contract':     'Execute contract (SO + provider)',
  'schedule-drill':       'Schedule annual drill (planner)',
  'commence-drill':       'Commence drill (provider + observer)',
  'complete-drill':       'Record drill completed (observer)',
  'recertify':            'Recertify capability (planner)',
  'fail-drill':           'Mark drill FAILED (observer)',
  'require-remediation':  'Require remediation (planner)',
  'complete-remediation': 'Remediation complete → reschedule drill',
  'terminate-contract':   'Terminate contract (SO)',
};

const TERMINAL_STATES: ChainStatus[] = ['recertified', 'contract_terminated'];

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

export function BlackStartChainTab() {
  const [rows, setRows] = useState<BscRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<BscRow | null>(null);
  const [events, setEvents] = useState<BscEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: BscRow[] } & KpiSummary }>('/black-start/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
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

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: BscRow; events: BscEvent[] } }>(
        `/black-start/chain/${id}`,
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load BSC history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')        return r.sla_breached;
      if (filter === 'reportable')      return r.is_reportable_flag;
      if (filter === 'system_critical') return r.is_system_critical_flag;
      if (filter === 'minor' || filter === 'standard' || filter === 'material' || filter === 'island_critical') {
        return r.capability_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: BscRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'issue-solicitation') {
        const basis = window.prompt('Solicitation basis — published RFP for black-start capability:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'close-solicitation') {
        const basis = window.prompt('Close-solicitation basis — bid evaluation begins:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'award-contract') {
        const basis = window.prompt('Award basis — provider selected:');
        if (!basis) return;
        const ref = window.prompt('Contract reference (e.g. BSC-2026-007):', row.contract_ref || '') || '';
        const value = window.prompt('Contract value (ZAR):', String(row.contract_value_zar || 0));
        body = { chain_basis: basis };
        if (ref) body.contract_ref = ref;
        if (value && !Number.isNaN(Number(value))) body.contract_value_zar = Number(value);
      } else if (action === 'execute-contract') {
        const basis = window.prompt('Execute-contract basis — counter-signed contract effective:');
        if (!basis) return;
        const start = window.prompt('Contract start (ISO datetime, blank = now):') || '';
        const end = window.prompt('Contract end (ISO datetime):') || '';
        body = { chain_basis: basis };
        if (start) body.contract_start_at = start;
        if (end) body.contract_end_at = end;
      } else if (action === 'schedule-drill') {
        const basis = window.prompt('Schedule-drill basis — annual restoration drill scheduled:');
        if (!basis) return;
        const at = window.prompt('Drill scheduled at (ISO datetime):') || '';
        const window_min = window.prompt('Drill window (minutes):', String(row.drill_window_minutes || 240));
        body = { chain_basis: basis };
        if (at) body.drill_scheduled_at = at;
        if (window_min && !Number.isNaN(Number(window_min))) body.drill_window_minutes = Number(window_min);
      } else if (action === 'commence-drill') {
        const basis = window.prompt('Commence-drill basis — drill commenced on cranking power:');
        if (!basis) return;
        const at = window.prompt('Drill commenced at (ISO datetime, blank = now):') || '';
        body = { chain_basis: basis };
        if (at) body.drill_commenced_at = at;
      } else if (action === 'complete-drill') {
        const basis = window.prompt('Complete-drill basis — drill completed (record gate flags below):');
        if (!basis) return;
        const cs = window.confirm('Cranking source confirmed? (cancel = no)');
        const db = window.confirm('Dead-bus energisation? (cancel = no)');
        const fr = window.confirm('Frequency hold within band? (cancel = no)');
        const vl = window.confirm('Voltage hold within band? (cancel = no)');
        const al = window.confirm('Auxiliary load pickup? (cancel = no)');
        const bf = window.confirm('Backfeed within SLA window? (cancel = no)');
        body = {
          chain_basis: basis,
          cranking_source_confirmed_flag: cs ? 1 : 0,
          dead_bus_energisation_flag: db ? 1 : 0,
          frequency_hold_flag: fr ? 1 : 0,
          voltage_hold_flag: vl ? 1 : 0,
          auxiliary_load_pickup_flag: al ? 1 : 0,
          backfeed_within_sla_flag: bf ? 1 : 0,
        };
      } else if (action === 'recertify') {
        const basis = window.prompt('Recertification basis — restoration planner recertifies the capability (RELIABILITY — large tiers cross regulator):');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'fail-drill') {
        const basis = window.prompt('Fail-drill basis — drill FAILED (RELIABILITY — always crosses regulator):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. cranking_failure / dead_bus_collapse / freq_excursion / backfeed_overrun):', 'cranking_failure') || '';
        body = { chain_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'require-remediation') {
        const basis = window.prompt('Remediation basis — provider must remediate (large tiers cross regulator):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. retraining / equipment_repair / procedural_fix):', 'equipment_repair') || '';
        body = { chain_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'complete-remediation') {
        const basis = window.prompt('Complete-remediation basis — remediation accepted, reschedule next drill:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'terminate-contract') {
        const basis = window.prompt('Termination basis — terminate the BSC contract (RELIABILITY — always crosses regulator):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. repeated_failure / commercial_default / provider_exit):', 'repeated_failure') || '';
        body = { chain_basis: basis };
        if (reason) body.reason_code = reason;
      }
      await api.post(`/black-start/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Black-start capability &amp; restoration drill</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage SA Grid Code OC-1 / OC-12 + NTCSA Black-Start Annex + NERSA System Defence &amp; Restoration Plan
            black-start contracting chain · needs assessed → solicitation → bid evaluation → award → execute → schedule
            drill → drill in progress → drill completed → recertified. Failure branch: drill_completed → drill_failed →
            remediation_required → drill_scheduled (loops to re-prove readiness). Terminate-contract is a terminal exit.
            URGENT SLA — the larger the BSC unit (island_critical ≥500 MW), the TIGHTER every window. Live restoration-
            readiness battery on every record (contracted vs target MW, coverage ratio, geographic diversity across 9 SA
            provinces, fuel-type diversity across 4 cranking sources, voltage-class coverage across 4 classes, days
            since last drill, days until next drill due, rolling drill pass rate, restoration-path validity gate, composite
            criticality score) — beats PJM Black Start / ERCOT Black Start / NGESO Black Start / ENTSO-E SDRP / MISO BSR
            spreadsheet-driven registers. The W84 SIGNATURE is RELIABILITY: fail_drill + terminate_contract cross
            regulator for EVERY tier (loss of demonstrated readiness or contracted restoration unit is always notifiable
            under NRS 048-2); recertify + require_remediation + sla_breached cross material + island_critical only.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Recertified" value={kpis?.recertified_count ?? 0} tone="ok" />
        <Kpi label="Drill failed" value={kpis?.drill_failed_count ?? 0} tone={(kpis?.drill_failed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Remediation" value={kpis?.remediation_count ?? 0} tone={(kpis?.remediation_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Terminated" value={kpis?.terminated_count ?? 0} tone={(kpis?.terminated_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="System-critical" value={kpis?.system_critical_count ?? 0} />
        <Kpi label="Contracted" value={fmtMw(kpis?.total_contracted_mw ?? 0)} />
        <Kpi label="Target" value={fmtMw(kpis?.total_target_mw ?? 0)} />
        <Kpi label="Crit ≥60" value={kpis?.high_criticality_count ?? 0} tone={(kpis?.high_criticality_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Path invalid" value={kpis?.path_invalid_count ?? 0} tone={(kpis?.path_invalid_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Overdue drill" value={kpis?.overdue_drill_count ?? 0} tone={(kpis?.overdue_drill_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Cum. failures" value={kpis?.total_drill_failures ?? 0} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">BSC #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Facility</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Role</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Cranking</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Voltage</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">MW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Pass</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Crit</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.capability_tier];
                const passPct = Math.round((r.drill_pass_rate_live ?? 0) * 100);
                const crit = r.criticality_score_live ?? 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.capability_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to NERSA">●</span>}
                      {r.is_system_critical_flag && <span className="ml-1 text-[#8a4a00]" title="System-critical">★</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[200px] truncate" title={r.facility_name || ''}>
                      {r.facility_name || '—'}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{ROLE_LABEL[r.restoration_role]}</td>
                    <td className="px-3 py-2 text-[#4a5568]">{CRANKING_LABEL[r.cranking_source]}</td>
                    <td className="px-3 py-2 text-[#4a5568]">{VOLTAGE_LABEL[r.voltage_class]}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{r.black_start_capacity_mw.toFixed(0)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${passPct < 70 ? 'text-[#a06200]' : 'text-[#155724]'}`}>
                      {r.drills_total_count > 0 ? `${passPct}%` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${crit >= 60 ? 'text-[#9b1f1f] font-medium' : 'text-[#4a5568]'}`}>{crit}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No black-start capabilities match.</td></tr>
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

function Drawer({
  row, events, onClose, onAct,
}: {
  row: BscRow;
  events: BscEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: BscRow) => void;
}) {
  const primary = PRIMARY_ACTION_FOR_STATE[row.chain_status];
  const canFail = row.chain_status === 'drill_in_progress' || row.chain_status === 'drill_completed';
  const canTerminate = !TERMINAL_STATES.includes(row.chain_status);
  const passPct = Math.round((row.drill_pass_rate_live ?? 0) * 100);
  const coverPct = Math.round((row.restoration_coverage_ratio_live ?? 0) * 100);
  const geoPct = Math.round((row.geographic_diversity_index_live ?? 0) * 100);
  const fuelPct = Math.round((row.fuel_diversity_index_live ?? 0) * 100);
  const voltagePct = Math.round((row.voltage_class_coverage_live ?? 0) * 100);
  const crit = row.criticality_score_live ?? 0;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[780px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.capability_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.facility_name || row.bsc_provider_name || '—'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.capability_tier].label} · {ROLE_LABEL[row.restoration_role]} · {CRANKING_LABEL[row.cranking_source]} · {VOLTAGE_LABEL[row.voltage_class]}
                {row.is_system_critical_flag ? ' · system-critical' : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.bsc_provider_name ? `Provider: ${row.bsc_provider_name} · ` : ''}
                SO: {row.system_operator_name}
                {row.province ? ` · ${row.province}` : ''}
                {row.restoration_zone ? ` · ${row.restoration_zone}` : ''}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Live restoration-readiness battery</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <Pair label="Contracted MW" value={`${row.black_start_capacity_mw.toFixed(0)} MW`} />
            <Pair label="Target MW" value={`${row.target_capacity_mw.toFixed(0)} MW`} />
            <Pair label="Coverage" value={`${coverPct}%`} />
            <Pair label="Criticality" value={`${crit} / 100`} />
            <Pair label="Geo diversity" value={`${geoPct}%`} />
            <Pair label="Fuel diversity" value={`${fuelPct}%`} />
            <Pair label="Voltage coverage" value={`${voltagePct}%`} />
            <Pair label="Pass rate" value={row.drills_total_count > 0 ? `${passPct}% (${row.drills_passed_count}/${row.drills_total_count})` : '—'} />
            <Pair label="Days since last drill" value={row.days_since_last_drill_live != null ? `${row.days_since_last_drill_live}d` : '—'} />
            <Pair label="Days until next" value={row.days_until_next_drill_due_live != null ? `${row.days_until_next_drill_due_live}d` : '—'} />
            <Pair label="Restoration path" value={row.restoration_path_valid_flag_live ? 'VALID' : 'INVALID'} />
            <Pair label="Predicted lifecycle" value={`${row.predicted_lifecycle_days_live ?? 0}d`} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Drill gate flags</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[12px]">
            <Pair label="Cranking source" value={row.cranking_source_confirmed_flag ? '✓' : '—'} />
            <Pair label="Dead-bus energisation" value={row.dead_bus_energisation_flag ? '✓' : '—'} />
            <Pair label="Frequency hold" value={row.frequency_hold_flag ? '✓' : '—'} />
            <Pair label="Voltage hold" value={row.voltage_hold_flag ? '✓' : '—'} />
            <Pair label="Aux load pickup" value={row.auxiliary_load_pickup_flag ? '✓' : '—'} />
            <Pair label="Backfeed in SLA" value={row.backfeed_within_sla_flag ? '✓' : '—'} />
            <Pair label="Cranking target" value={row.cranking_time_target_minutes > 0 ? `${row.cranking_time_target_minutes}m` : '—'} />
            <Pair label="Backfeed target" value={row.backfeed_time_target_minutes > 0 ? `${row.backfeed_time_target_minutes}m` : '—'} />
            <Pair label="Consec. failures" value={String(row.consecutive_failures)} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Zone diversity</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <Pair label="Provinces" value={`${row.zone_provinces_represented} / 9`} />
            <Pair label="Voltage classes" value={`${row.zone_voltage_classes_covered} / 4`} />
            <Pair label="Hydro" value={String(row.zone_fuel_hydro_count)} />
            <Pair label="Diesel" value={String(row.zone_fuel_diesel_count)} />
            <Pair label="Battery" value={String(row.zone_fuel_battery_count)} />
            <Pair label="Compressed air" value={String(row.zone_fuel_compressed_air_count)} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Lifecycle</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State" value={STATE_TONE[row.chain_status].label} />
            <Pair label="Contract ref" value={row.contract_ref ?? '—'} />
            <Pair label="Contract value" value={fmtZar(row.contract_value_zar)} />
            <Pair label="Contract start" value={fmtDate(row.contract_start_at)} />
            <Pair label="Contract end" value={fmtDate(row.contract_end_at)} />
            <Pair label="Drill window" value={row.drill_window_minutes > 0 ? `${row.drill_window_minutes}m` : '—'} />
            <Pair label="Drill scheduled" value={fmtDate(row.drill_scheduled_at)} />
            <Pair label="Drill commenced" value={fmtDate(row.drill_commenced_at)} />
            <Pair label="Drill completed" value={fmtDate(row.drill_completed_at)} />
            <Pair label="Last drill" value={fmtDate(row.last_drill_at)} />
            <Pair label="Needs assessed" value={fmtDate(row.needs_assessed_at)} />
            <Pair label="Solicitation issued" value={fmtDate(row.solicitation_issued_at)} />
            <Pair label="Bid evaluation" value={fmtDate(row.bid_evaluation_at)} />
            <Pair label="Contract awarded" value={fmtDate(row.contract_awarded_at)} />
            <Pair label="Contract executed" value={fmtDate(row.contract_executed_at)} />
            <Pair label="Drill in progress" value={fmtDate(row.drill_in_progress_at)} />
            <Pair label="Recertified at" value={fmtDate(row.recertified_at)} />
            <Pair label="Drill failed at" value={fmtDate(row.drill_failed_at)} />
            <Pair label="Remediation at" value={fmtDate(row.remediation_required_at)} />
            <Pair label="Terminated at" value={fmtDate(row.contract_terminated_at)} />
            <Pair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status" value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Reportable" value={row.is_reportable_flag ? 'Yes' : 'No'} />
            <Pair label="Reason code" value={row.reason_code ?? '—'} />
            <Pair label="Last action ref" value={row.last_action_ref ?? '—'} />
            <Pair label="Regulator ref" value={row.regulator_ref ?? '—'} />
          </div>
          {row.capability_summary && (
            <BasisBlock label="Capability summary" tone="#1a3a5c" text={row.capability_summary} />
          )}
          {row.chain_basis && <BasisBlock label="Chain basis" tone="#1a3a5c" text={row.chain_basis} />}
        </section>

        {(primary || canFail || canTerminate) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {primary && (
                <button
                  onClick={() => onAct(primary, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[primary]}
                </button>
              )}
              {canFail && (
                <button
                  onClick={() => onAct('fail-drill', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['fail-drill']}
                </button>
              )}
              {canTerminate && (
                <button
                  onClick={() => onAct('terminate-contract', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['terminate-contract']}
                </button>
              )}
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
