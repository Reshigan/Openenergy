// Wave 67 — Grid Code Compliance Monitoring & Non-Conformance lifecycle tab.
//
// The System Operator / Transmission System Operator (NTCSA) monitors each
// connected facility's ongoing TECHNICAL conformance with the SA Grid Code (the
// Network Code + the Grid Connection Code for Renewable Power Plants) and NRS
// 048-2/4 power-quality limits, and manages a non-conformance through a formal
// remediation lifecycle. This is ONGOING technical conformance — distinct from
// W28 (the one-time connection agreement), W58 (scarce-capacity queue), W18
// (outage coordination), W34 (curtailment) and W13 (dispatch). It is the SO/TSO
// technical counterpart to the regulator's own-initiative W40 inspection and
// reactive W66 complaints.
//
//   monitoring → non_conformance_raised → under_assessment →
//     corrective_action_required → cap_submitted → cap_approved →
//     remediation_in_progress → compliance_retest → compliant_closed
//   CAP revise loop:  cap_submitted → (reject_cap) → corrective_action_required
//   restriction:      {under_assessment, remediation_in_progress, compliance_retest}
//                       → operating_restriction → (begin_remediation) → remediation_in_progress
//   disconnection:    {corrective_action_required, operating_restriction} → disconnection_issued
//   withdraw:         {non_conformance_raised, under_assessment} → withdrawn
//
// URGENT SLA — the MORE SEVERE the tier, the TIGHTER every window. Tier (5) by
// non-compliant capacity MW with a breach-class floor (fault-ride-through /
// frequency-response / protection-coordination floor at serious; reactive-power /
// voltage-regulation floor at material). Split write: the SO/TSO (operator) drives
// the machinery; the connected FACILITY submits the CAP and performs remediation.
// The W67 signature — a disconnection crosses to the regulator for EVERY tier
// (disconnecting a connected, licensed facility is always notifiable); a
// restriction and an SLA breach cross for the large tiers (serious + critical).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'monitoring' | 'non_conformance_raised' | 'under_assessment'
  | 'corrective_action_required' | 'cap_submitted' | 'cap_approved'
  | 'remediation_in_progress' | 'compliance_retest' | 'operating_restriction'
  | 'compliant_closed' | 'disconnection_issued' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'serious' | 'critical';

type BreachClass =
  | 'power_quality' | 'telemetry' | 'metering' | 'reactive_power'
  | 'voltage_regulation' | 'frequency_response' | 'fault_ride_through'
  | 'protection_coordination';

type NetworkArea = 'transmission' | 'distribution';

interface ComplianceRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_id: string;
  facility_name: string;
  connection_point: string | null;
  network_area: NetworkArea | null;
  licence_ref: string | null;
  technology: string | null;
  capacity_mw: number | null;
  breach_class: BreachClass;
  code_reference: string | null;
  parameter: string | null;
  measured_value: number | null;
  limit_value: number | null;
  severity_tier: Tier;
  operator_party_id: string | null;
  operator_party_name: string | null;
  facility_party_id: string | null;
  facility_party_name: string | null;
  nc_ref: string | null;
  assessment_ref: string | null;
  cap_ref: string | null;
  retest_ref: string | null;
  restriction_ref: string | null;
  disconnection_ref: string | null;
  raise_basis: string | null;
  assessment_basis: string | null;
  corrective_action_basis: string | null;
  cap_basis: string | null;
  approval_basis: string | null;
  remediation_basis: string | null;
  retest_basis: string | null;
  restriction_basis: string | null;
  disconnection_basis: string | null;
  reason_code: string | null;
  compliance_summary: string | null;
  chain_status: ChainStatus;
  monitoring_started_at: string;
  non_conformance_raised_at: string | null;
  under_assessment_at: string | null;
  corrective_action_required_at: string | null;
  cap_submitted_at: string | null;
  cap_approved_at: string | null;
  remediation_started_at: string | null;
  compliance_retest_at: string | null;
  operating_restriction_at: string | null;
  compliant_closed_at: string | null;
  disconnection_issued_at: string | null;
  withdrawn_at: string | null;
  remediation_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: boolean;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  breach_crosses_regulator?: boolean;
}

interface ComplianceEvent {
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
  monitoring_count: number;
  open_count: number;
  restricted_count: number;
  disconnected_count: number;
  closed_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  total_capacity_mw: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  monitoring:                 { bg: '#e3e7ec', fg: '#557',    label: 'Monitoring' },
  non_conformance_raised:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Non-conformance raised' },
  under_assessment:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Under assessment' },
  corrective_action_required: { bg: '#fff4d6', fg: '#a06200', label: 'Corrective action required' },
  cap_submitted:              { bg: '#fff4d6', fg: '#a06200', label: 'CAP submitted' },
  cap_approved:               { bg: '#ffe4b5', fg: '#8a4a00', label: 'CAP approved' },
  remediation_in_progress:    { bg: '#fff4d6', fg: '#a06200', label: 'Remediation in progress' },
  compliance_retest:          { bg: '#ffe4b5', fg: '#8a4a00', label: 'Compliance retest' },
  operating_restriction:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Operating restriction' },
  compliant_closed:           { bg: '#d4edda', fg: '#155724', label: 'Compliant — closed' },
  disconnection_issued:       { bg: '#f8d0d0', fg: '#6b1f1f', label: 'Disconnection issued' },
  withdrawn:                  { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<1MW)' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (<10MW)' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material (<50MW)' },
  serious:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Serious (<200MW)' },
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical (≥200MW)' },
};

const BREACH_LABEL: Record<BreachClass, string> = {
  power_quality:           'Power quality',
  telemetry:               'Telemetry',
  metering:                'Metering',
  reactive_power:          'Reactive power',
  voltage_regulation:      'Voltage regulation',
  frequency_response:      'Frequency response',
  fault_ride_through:      'Fault ride-through',
  protection_coordination: 'Protection coordination',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                     label: 'Active' },
  { key: 'all',                        label: 'All' },
  { key: 'minor',                      label: 'Minor' },
  { key: 'moderate',                   label: 'Moderate' },
  { key: 'material',                   label: 'Material' },
  { key: 'serious',                    label: 'Serious' },
  { key: 'critical',                   label: 'Critical' },
  { key: 'monitoring',                 label: 'Monitoring' },
  { key: 'non_conformance_raised',     label: 'NC raised' },
  { key: 'under_assessment',           label: 'Assessment' },
  { key: 'corrective_action_required', label: 'CAP required' },
  { key: 'cap_submitted',              label: 'CAP submitted' },
  { key: 'remediation_in_progress',    label: 'Remediation' },
  { key: 'compliance_retest',          label: 'Retest' },
  { key: 'operating_restriction',      label: 'Restricted' },
  { key: 'breached',                   label: 'SLA breached' },
  { key: 'reportable',                 label: 'Reportable' },
  { key: 'compliant_closed',           label: 'Closed' },
  { key: 'disconnection_issued',       label: 'Disconnected' },
  { key: 'withdrawn',                  label: 'Withdrawn' },
];

type ActionKind =
  | 'raise-non-conformance' | 'begin-assessment' | 'require-corrective-action'
  | 'submit-cap' | 'approve-cap' | 'reject-cap' | 'begin-remediation'
  | 'initiate-retest' | 'confirm-compliance' | 'impose-restriction'
  | 'escalate-disconnection' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  monitoring:                 'raise-non-conformance',
  non_conformance_raised:     'begin-assessment',
  under_assessment:           'require-corrective-action',
  corrective_action_required: 'submit-cap',
  cap_submitted:              'approve-cap',
  cap_approved:               'begin-remediation',
  remediation_in_progress:    'initiate-retest',
  compliance_retest:          'confirm-compliance',
  operating_restriction:      'begin-remediation',
  compliant_closed:           null,
  disconnection_issued:       null,
  withdrawn:                  null,
};

// Party annotation per action. The SO/TSO (operator) drives the machinery; the
// connected FACILITY submits the CAP and performs the remediation.
const ACTION_LABEL: Record<ActionKind, string> = {
  'raise-non-conformance':    'Raise non-conformance (operator)',
  'begin-assessment':         'Begin assessment (operator)',
  'require-corrective-action':'Require corrective action (operator)',
  'submit-cap':               'Submit CAP (facility)',
  'approve-cap':              'Approve CAP (operator)',
  'reject-cap':               'Reject CAP (operator)',
  'begin-remediation':        'Begin remediation (facility)',
  'initiate-retest':          'Initiate retest (operator)',
  'confirm-compliance':       'Confirm compliance (operator)',
  'impose-restriction':       'Impose operating restriction (operator)',
  'escalate-disconnection':   'Escalate to disconnection (operator)',
  'withdraw':                 'Withdraw (operator)',
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

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')} MW`;
}

const TERMINAL_STATES: ChainStatus[] = ['compliant_closed', 'disconnection_issued', 'withdrawn'];
const RESTRICTABLE_STATES: ChainStatus[] = ['under_assessment', 'remediation_in_progress', 'compliance_retest'];
const DISCONNECTABLE_STATES: ChainStatus[] = ['corrective_action_required', 'operating_restriction'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['non_conformance_raised', 'under_assessment'];

export function GridCodeComplianceChainTab() {
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ComplianceRow | null>(null);
  const [events, setEvents] = useState<ComplianceEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ComplianceRow[] } & KpiSummary }>('/grid-code-compliance/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, monitoring_count: d.monitoring_count, open_count: d.open_count,
          restricted_count: d.restricted_count, disconnected_count: d.disconnected_count,
          closed_count: d.closed_count, withdrawn_count: d.withdrawn_count,
          breached: d.breached, reportable_total: d.reportable_total,
          large_open: d.large_open, total_capacity_mw: d.total_capacity_mw,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load compliance records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ComplianceRow; events: ComplianceEvent[] } }>(
        `/grid-code-compliance/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load compliance history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'minor' || filter === 'moderate' || filter === 'material' || filter === 'serious' || filter === 'critical') {
        return r.severity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ComplianceRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'raise-non-conformance') {
        const basis = window.prompt('Raise basis — the monitored parameter that drifted out of code limit:');
        if (!basis) return;
        const ref = window.prompt('Non-conformance reference (e.g. NC-2026-0011):') || '';
        const param = window.prompt('Monitored parameter:', row.parameter || '') || '';
        const measured = window.prompt('Measured value:', String(row.measured_value ?? ''));
        const limit = window.prompt('Code limit value:', String(row.limit_value ?? ''));
        body = { raise_basis: basis };
        if (ref) body.nc_ref = ref;
        if (param) body.parameter = param;
        if (measured && !Number.isNaN(Number(measured))) body.measured_value = Number(measured);
        if (limit && !Number.isNaN(Number(limit))) body.limit_value = Number(limit);
      } else if (action === 'begin-assessment') {
        const basis = window.prompt('Assessment basis — the SO technical assessment of the deviation:');
        if (!basis) return;
        const ref = window.prompt('Assessment reference (e.g. ASMT-2026-0011):') || '';
        body = { assessment_basis: basis };
        if (ref) body.assessment_ref = ref;
      } else if (action === 'require-corrective-action') {
        const basis = window.prompt('Corrective-action basis — what the facility must remediate:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. setting_misconfig / equipment_fault):') || '';
        body = { corrective_action_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'submit-cap') {
        const basis = window.prompt('CAP basis — the corrective-action plan the facility proposes:');
        if (!basis) return;
        const ref = window.prompt('CAP reference (e.g. CAP-2026-0011):') || '';
        body = { cap_basis: basis };
        if (ref) body.cap_ref = ref;
      } else if (action === 'approve-cap') {
        const basis = window.prompt('Approval basis — SO acceptance of the corrective-action plan:');
        if (!basis) return;
        body = { approval_basis: basis };
      } else if (action === 'reject-cap') {
        const basis = window.prompt('Rejection basis — why the CAP is inadequate (facility must resubmit):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. insufficient_scope / unrealistic_timeline):') || '';
        body = { corrective_action_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'begin-remediation') {
        const basis = window.prompt('Remediation basis — the facility starts executing the approved plan:');
        if (!basis) return;
        body = { remediation_basis: basis };
      } else if (action === 'initiate-retest') {
        const basis = window.prompt('Retest basis — the conformance re-test against the code parameter:');
        if (!basis) return;
        const ref = window.prompt('Retest reference (e.g. RTST-2026-0011):') || '';
        body = { retest_basis: basis };
        if (ref) body.retest_ref = ref;
      } else if (action === 'confirm-compliance') {
        const basis = window.prompt('Confirmation basis — retest passed; conformance restored (close-out):') || '';
        const summary = window.prompt('Compliance summary (one line for the audit record):') || '';
        body = {};
        if (basis) body.retest_basis = basis;
        if (summary) body.compliance_summary = summary;
      } else if (action === 'impose-restriction') {
        const basis = window.prompt('Restriction basis — why the plant output is restricted pending remediation:');
        if (!basis) return;
        const ref = window.prompt('Restriction reference (e.g. RES-2026-0011):') || '';
        const reason = window.prompt('Reason code (e.g. protection_risk / stability_risk):') || '';
        body = { restriction_basis: basis };
        if (ref) body.restriction_ref = ref;
        if (reason) body.reason_code = reason;
      } else if (action === 'escalate-disconnection') {
        const basis = window.prompt('Disconnection basis — why the connection is being disconnected:');
        if (!basis) return;
        const ref = window.prompt('Disconnection reference (e.g. DISC-2026-0011):') || '';
        const reason = window.prompt('Reason code (e.g. stability_risk / observability_loss / no_cap):') || '';
        body = { disconnection_basis: basis };
        if (ref) body.disconnection_ref = ref;
        if (reason) body.reason_code = reason;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason — false positive / resolved on assessment:');
        if (!reason) return;
        const summary = window.prompt('Compliance summary (one line for the audit record):') || '';
        body = { reason_code: reason };
        if (summary) body.compliance_summary = summary;
      }
      await api.post(`/grid-code-compliance/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Grid Code compliance monitoring</h2>
          <p className="text-xs text-[#4a5568]">
            12-state technical-conformance chain (SA Grid Code · Grid Connection Code for RPPs · NRS 048-2/4) ·
            monitoring → non-conformance raised → under assessment → corrective action required → CAP submitted →
            CAP approved → remediation in progress → compliance retest → compliant closed. A rejected plan loops back
            for resubmission (CAP revise); a severe deviation or failed retest can impose an interim operating
            restriction; an unremediated breach escalates to disconnection. The SO/TSO technical counterpart to the
            regulator's proactive inspection (W40) and reactive complaints (W66). URGENT SLA: the more severe the
            tier, the tighter every window. Tier by non-compliant capacity with a breach-class floor (fault
            ride-through / frequency response / protection coordination → serious; reactive power / voltage
            regulation → material). Split write — the operator drives the machinery; the facility submits the CAP and
            remediates. The W67 signature — a disconnection crosses to the regulator for every tier (disconnecting a
            connected, licensed facility is always notifiable); a restriction and an SLA breach cross for the large
            tiers (serious + critical).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Monitoring" value={kpis?.monitoring_count ?? 0} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Large open" value={kpis?.large_open ?? 0} tone={(kpis?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Restricted" value={kpis?.restricted_count ?? 0} tone={(kpis?.restricted_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Disconnected" value={kpis?.disconnected_count ?? 0} tone={(kpis?.disconnected_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Closed" value={kpis?.closed_count ?? 0} tone="ok" />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} tone={(kpis?.withdrawn_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Non-compliant MW" value={fmtMw(kpis?.total_capacity_mw ?? 0)} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Facility</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Breach</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Capacity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.severity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.case_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to the regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[180px] truncate" title={r.facility_name}>
                      {r.facility_name}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{BREACH_LABEL[r.breach_class]}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {fmtMw(r.capacity_mw)}
                    </td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No compliance cases match.</td></tr>
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
  row: ComplianceRow;
  events: ComplianceEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ComplianceRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRejectCap = row.chain_status === 'cap_submitted';
  const canRestrict = RESTRICTABLE_STATES.includes(row.chain_status);
  const canDisconnect = DISCONNECTABLE_STATES.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.case_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.facility_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.severity_tier].label} · {BREACH_LABEL[row.breach_class]}
                {row.network_area ? ` · ${row.network_area}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.operator_party_name || 'System Operator'} → {row.facility_party_name || row.facility_name}
                {row.remediation_round > 0 ? ` · CAP round ${row.remediation_round}` : ''}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"              value={TIER_TONE[row.severity_tier].label} />
            <Pair label="Breach class"      value={BREACH_LABEL[row.breach_class]} />
            <Pair label="Capacity"          value={fmtMw(row.capacity_mw)} />
            <Pair label="Connection point"  value={row.connection_point ?? '—'} />
            <Pair label="Network area"      value={row.network_area ?? '—'} />
            <Pair label="Technology"        value={row.technology ?? '—'} />
            <Pair label="Licence ref"       value={row.licence_ref ?? '—'} />
            <Pair label="Code reference"    value={row.code_reference ?? '—'} />
            <Pair label="Parameter"         value={row.parameter ?? '—'} />
            <Pair label="Measured"          value={row.measured_value != null ? String(row.measured_value) : '—'} />
            <Pair label="Limit"             value={row.limit_value != null ? String(row.limit_value) : '—'} />
            <Pair label="NC ref"            value={row.nc_ref ?? '—'} />
            <Pair label="Assessment ref"    value={row.assessment_ref ?? '—'} />
            <Pair label="CAP ref"           value={row.cap_ref ?? '—'} />
            <Pair label="Retest ref"        value={row.retest_ref ?? '—'} />
            <Pair label="Restriction ref"   value={row.restriction_ref ?? '—'} />
            <Pair label="Disconnection ref" value={row.disconnection_ref ?? '—'} />
            <Pair label="Reason code"       value={row.reason_code ?? '—'} />
            <Pair label="Monitoring since"  value={fmtDate(row.monitoring_started_at)} />
            <Pair label="NC raised"         value={fmtDate(row.non_conformance_raised_at)} />
            <Pair label="Assessment"        value={fmtDate(row.under_assessment_at)} />
            <Pair label="CAP required"      value={fmtDate(row.corrective_action_required_at)} />
            <Pair label="CAP submitted"     value={fmtDate(row.cap_submitted_at)} />
            <Pair label="CAP approved"      value={fmtDate(row.cap_approved_at)} />
            <Pair label="Remediation"       value={fmtDate(row.remediation_started_at)} />
            <Pair label="Retest"            value={fmtDate(row.compliance_retest_at)} />
            <Pair label="Restriction"       value={fmtDate(row.operating_restriction_at)} />
            <Pair label="Closed"            value={fmtDate(row.compliant_closed_at)} />
            <Pair label="Disconnected"      value={fmtDate(row.disconnection_issued_at)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"    value={String(row.escalation_level)} />
            <Pair label="Reportable"        value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.compliance_summary && (
            <BasisBlock label="Compliance summary" tone="#1a3a5c" text={row.compliance_summary} />
          )}
          {row.raise_basis && (
            <BasisBlock label="Raise basis" tone="#1a3a5c" text={row.raise_basis} />
          )}
          {row.assessment_basis && (
            <BasisBlock label="Assessment basis" tone="#1a3a5c" text={row.assessment_basis} />
          )}
          {row.corrective_action_basis && (
            <BasisBlock label="Corrective-action basis" tone="#a06200" text={row.corrective_action_basis} />
          )}
          {row.cap_basis && (
            <BasisBlock label="CAP basis (facility)" tone="#a06200" text={row.cap_basis} />
          )}
          {row.approval_basis && (
            <BasisBlock label="Approval basis" tone="#8a4a00" text={row.approval_basis} />
          )}
          {row.remediation_basis && (
            <BasisBlock label="Remediation basis (facility)" tone="#a06200" text={row.remediation_basis} />
          )}
          {row.retest_basis && (
            <BasisBlock label="Retest basis" tone="#8a4a00" text={row.retest_basis} />
          )}
          {row.restriction_basis && (
            <BasisBlock label="Restriction basis" tone="#9b1f1f" text={row.restriction_basis} />
          )}
          {row.disconnection_basis && (
            <BasisBlock label="Disconnection basis" tone="#6b1f1f" text={row.disconnection_basis} />
          )}
        </section>

        {(nextAction || canRejectCap || canRestrict || canDisconnect || canWithdraw) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canRejectCap && (
                <button type="button"
                  onClick={() => onAct('reject-cap', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['reject-cap']}
                </button>
              )}
              {canRestrict && (
                <button type="button"
                  onClick={() => onAct('impose-restriction', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['impose-restriction']}
                </button>
              )}
              {canDisconnect && (
                <button type="button"
                  onClick={() => onAct('escalate-disconnection', row)}
                  className="rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-50"
                >
                  {ACTION_LABEL['escalate-disconnection']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL.withdraw}
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
