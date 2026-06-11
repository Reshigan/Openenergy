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
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ─── Design tokens ────────────────────────────────────────────────────
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

// ─── Types ────────────────────────────────────────────────────────────
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
  [key: string]: unknown;
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

// ─── State arrays ─────────────────────────────────────────────────────
const ALL_STATES = [
  'monitoring',
  'non_conformance_raised',
  'under_assessment',
  'corrective_action_required',
  'cap_submitted',
  'cap_approved',
  'remediation_in_progress',
  'compliance_retest',
  'compliant_closed',
] as const;

const BRANCH_STATES = [
  'operating_restriction',
  'disconnection_issued',
  'withdrawn',
] as const;

// ─── Filters ──────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────
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

const TERMINAL_STATES: ChainStatus[] = ['compliant_closed', 'disconnection_issued', 'withdrawn'];
const RESTRICTABLE_STATES: ChainStatus[] = ['under_assessment', 'remediation_in_progress', 'compliance_retest'];
const DISCONNECTABLE_STATES: ChainStatus[] = ['corrective_action_required', 'operating_restriction'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['non_conformance_raised', 'under_assessment'];

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')} MW`;
}

// ─── Actions builder ──────────────────────────────────────────────────
function getActions(row: ComplianceRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'monitoring') {
    actions.push({
      key: 'raise-non-conformance',
      label: 'Raise non-conformance (operator)',
      tone: 'primary',
      fields: [
        { key: 'raise_basis',     label: 'Raise basis — the monitored parameter that drifted out of code limit', type: 'textarea', required: true },
        { key: 'nc_ref',          label: 'Non-conformance reference (e.g. NC-2026-0011)',                        type: 'text',     required: false },
        { key: 'parameter',       label: 'Monitored parameter',                                                  type: 'text',     required: false },
        { key: 'measured_value',  label: 'Measured value',                                                       type: 'text',     required: false },
        { key: 'limit_value',     label: 'Code limit value',                                                     type: 'text',     required: false },
      ],
    });
  }

  if (s === 'non_conformance_raised') {
    actions.push({
      key: 'begin-assessment',
      label: 'Begin assessment (operator)',
      tone: 'primary',
      fields: [
        { key: 'assessment_basis', label: 'Assessment basis — the SO technical assessment of the deviation', type: 'textarea', required: true },
        { key: 'assessment_ref',   label: 'Assessment reference (e.g. ASMT-2026-0011)',                     type: 'text',     required: false },
      ],
    });
  }

  if (s === 'under_assessment') {
    actions.push({
      key: 'require-corrective-action',
      label: 'Require corrective action (operator)',
      tone: 'primary',
      fields: [
        { key: 'corrective_action_basis', label: 'Corrective-action basis — what the facility must remediate', type: 'textarea', required: true },
        { key: 'reason_code',             label: 'Reason code (e.g. setting_misconfig / equipment_fault)',     type: 'text',     required: false },
      ],
    });
  }

  if (s === 'corrective_action_required') {
    actions.push({
      key: 'submit-cap',
      label: 'Submit CAP (facility)',
      tone: 'primary',
      fields: [
        { key: 'cap_basis', label: 'CAP basis — the corrective-action plan the facility proposes', type: 'textarea', required: true },
        { key: 'cap_ref',   label: 'CAP reference (e.g. CAP-2026-0011)',                          type: 'text',     required: false },
      ],
    });
  }

  if (s === 'cap_submitted') {
    actions.push({
      key: 'approve-cap',
      label: 'Approve CAP (operator)',
      tone: 'primary',
      fields: [
        { key: 'approval_basis', label: 'Approval basis — SO acceptance of the corrective-action plan', type: 'textarea', required: true },
      ],
    });
    actions.push({
      key: 'reject-cap',
      label: 'Reject CAP (operator)',
      tone: 'warn',
      fields: [
        { key: 'corrective_action_basis', label: 'Rejection basis — why the CAP is inadequate (facility must resubmit)', type: 'textarea', required: true },
        { key: 'reason_code',             label: 'Reason code (e.g. insufficient_scope / unrealistic_timeline)',         type: 'text',     required: false },
      ],
    });
  }

  if (s === 'cap_approved' || s === 'operating_restriction') {
    actions.push({
      key: 'begin-remediation',
      label: 'Begin remediation (facility)',
      tone: 'primary',
      fields: [
        { key: 'remediation_basis', label: 'Remediation basis — the facility starts executing the approved plan', type: 'textarea', required: true },
      ],
    });
  }

  if (s === 'remediation_in_progress') {
    actions.push({
      key: 'initiate-retest',
      label: 'Initiate retest (operator)',
      tone: 'primary',
      fields: [
        { key: 'retest_basis', label: 'Retest basis — the conformance re-test against the code parameter', type: 'textarea', required: true },
        { key: 'retest_ref',   label: 'Retest reference (e.g. RTST-2026-0011)',                           type: 'text',     required: false },
      ],
    });
  }

  if (s === 'compliance_retest') {
    actions.push({
      key: 'confirm-compliance',
      label: 'Confirm compliance (operator)',
      tone: 'primary',
      fields: [
        { key: 'retest_basis',       label: 'Confirmation basis — retest passed; conformance restored (close-out)', type: 'textarea', required: false },
        { key: 'compliance_summary', label: 'Compliance summary (one line for the audit record)',                   type: 'text',     required: false },
      ],
    });
  }

  // Branch actions — available from specific states
  if (RESTRICTABLE_STATES.includes(s)) {
    actions.push({
      key: 'impose-restriction',
      label: 'Impose operating restriction (operator)',
      tone: 'warn',
      fields: [
        { key: 'restriction_basis', label: 'Restriction basis — why the plant output is restricted pending remediation', type: 'textarea', required: true },
        { key: 'restriction_ref',   label: 'Restriction reference (e.g. RES-2026-0011)',                                type: 'text',     required: false },
        { key: 'reason_code',       label: 'Reason code (e.g. protection_risk / stability_risk)',                       type: 'text',     required: false },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (DISCONNECTABLE_STATES.includes(s)) {
    actions.push({
      key: 'escalate-disconnection',
      label: 'Escalate to disconnection (operator)',
      tone: 'danger',
      fields: [
        { key: 'disconnection_basis', label: 'Disconnection basis — why the connection is being disconnected',        type: 'textarea', required: true },
        { key: 'disconnection_ref',   label: 'Disconnection reference (e.g. DISC-2026-0011)',                        type: 'text',     required: false },
        { key: 'reason_code',         label: 'Reason code (e.g. stability_risk / observability_loss / no_cap)',      type: 'text',     required: false },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (WITHDRAWABLE_STATES.includes(s)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (operator)',
      tone: 'ghost',
      fields: [
        { key: 'reason_code',        label: 'Withdrawal reason — false positive / resolved on assessment', type: 'textarea', required: true },
        { key: 'compliance_summary', label: 'Compliance summary (one line for the audit record)',          type: 'text',     required: false },
      ],
    });
  }

  return actions;
}

// ─── Detail renderer ──────────────────────────────────────────────────
function renderDetail(row: ComplianceRow): React.ReactNode {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <DetailPair label="Breach class"      value={BREACH_LABEL[row.breach_class]} />
        <DetailPair label="Severity tier"     value={row.severity_tier} />
        <DetailPair label="Capacity"          value={fmtMw(row.capacity_mw)} />
        <DetailPair label="Connection point"  value={row.connection_point ?? '—'} />
        <DetailPair label="Network area"      value={row.network_area ?? '—'} />
        <DetailPair label="Technology"        value={row.technology ?? '—'} />
        <DetailPair label="Licence ref"       value={row.licence_ref ?? '—'} />
        <DetailPair label="Code reference"    value={row.code_reference ?? '—'} />
        <DetailPair label="Parameter"         value={row.parameter ?? '—'} />
        <DetailPair label="Measured"          value={row.measured_value != null ? String(row.measured_value) : '—'} />
        <DetailPair label="Limit"             value={row.limit_value != null ? String(row.limit_value) : '—'} />
        <DetailPair label="NC ref"            value={row.nc_ref ?? '—'} />
        <DetailPair label="Assessment ref"    value={row.assessment_ref ?? '—'} />
        <DetailPair label="CAP ref"           value={row.cap_ref ?? '—'} />
        <DetailPair label="Retest ref"        value={row.retest_ref ?? '—'} />
        <DetailPair label="Restriction ref"   value={row.restriction_ref ?? '—'} />
        <DetailPair label="Disconnection ref" value={row.disconnection_ref ?? '—'} />
        <DetailPair label="Reason code"       value={row.reason_code ?? '—'} />
        <DetailPair label="Operator"          value={row.operator_party_name ?? 'System Operator'} />
        <DetailPair label="Facility party"    value={row.facility_party_name ?? row.facility_name} />
        <DetailPair label="CAP round"         value={String(row.remediation_round)} />
        <DetailPair label="Escalation lvl"    value={String(row.escalation_level)} />
        <DetailPair label="Reportable"        value={row.is_reportable ? 'Yes' : 'No'} />
        <DetailPair label="Monitoring since"  value={fmtDate(row.monitoring_started_at)} />
        <DetailPair label="NC raised"         value={fmtDate(row.non_conformance_raised_at)} />
        <DetailPair label="Assessment"        value={fmtDate(row.under_assessment_at)} />
        <DetailPair label="CAP required"      value={fmtDate(row.corrective_action_required_at)} />
        <DetailPair label="CAP submitted"     value={fmtDate(row.cap_submitted_at)} />
        <DetailPair label="CAP approved"      value={fmtDate(row.cap_approved_at)} />
        <DetailPair label="Remediation"       value={fmtDate(row.remediation_started_at)} />
        <DetailPair label="Retest"            value={fmtDate(row.compliance_retest_at)} />
        <DetailPair label="Restriction"       value={fmtDate(row.operating_restriction_at)} />
        <DetailPair label="Closed"            value={fmtDate(row.compliant_closed_at)} />
        <DetailPair label="Disconnected"      value={fmtDate(row.disconnection_issued_at)} />
        <DetailPair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
        {row.source_wave && (
          <DetailPair label="Source wave" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
        )}
      </div>
      {row.compliance_summary && (
        <div style={{ marginTop: 10 }}>
          <DetailPair label="Compliance summary" value={row.compliance_summary} />
        </div>
      )}
      {row.raise_basis && (
        <div style={{ marginTop: 10 }}>
          <DetailPair label="Raise basis" value={row.raise_basis} />
        </div>
      )}
      {row.assessment_basis && (
        <div style={{ marginTop: 10 }}>
          <DetailPair label="Assessment basis" value={row.assessment_basis} />
        </div>
      )}
      {row.corrective_action_basis && (
        <div style={{ marginTop: 10 }}>
          <DetailPair label="Corrective-action basis" value={row.corrective_action_basis} />
        </div>
      )}
      {row.cap_basis && (
        <div style={{ marginTop: 10 }}>
          <DetailPair label="CAP basis (facility)" value={row.cap_basis} />
        </div>
      )}
      {row.approval_basis && (
        <div style={{ marginTop: 10 }}>
          <DetailPair label="Approval basis" value={row.approval_basis} />
        </div>
      )}
      {row.remediation_basis && (
        <div style={{ marginTop: 10 }}>
          <DetailPair label="Remediation basis (facility)" value={row.remediation_basis} />
        </div>
      )}
      {row.retest_basis && (
        <div style={{ marginTop: 10 }}>
          <DetailPair label="Retest basis" value={row.retest_basis} />
        </div>
      )}
      {row.restriction_basis && (
        <div style={{ marginTop: 10 }}>
          <DetailPair label="Restriction basis" value={row.restriction_basis} />
        </div>
      )}
      {row.disconnection_basis && (
        <div style={{ marginTop: 10 }}>
          <DetailPair label="Disconnection basis" value={row.disconnection_basis} />
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────
export function GridCodeComplianceChainTab() {
  const [rows, setRows]     = useState<ComplianceRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ComplianceRow[] } & KpiSummary }>('/grid-code-compliance/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setSummary({
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

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    await api.post(`/grid-code-compliance/chain/${rowId}/${key}`, values);
    await load();
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: ComplianceRow; events: ChainEvent[] } }>(
        `/grid-code-compliance/chain/${id}`
      );
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch {
      // non-fatal — card still expands, timeline stays empty
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (['minor', 'moderate', 'material', 'serious', 'critical'].includes(filter)) {
        return r.severity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ padding: '20px', background: BG, minHeight: '100%' }}>
      {/* Header */}
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: TX1, margin: 0 }}>
          Grid Code compliance monitoring
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 4, maxWidth: 900, lineHeight: 1.5 }}>
          12-state technical-conformance chain (SA Grid Code · Grid Connection Code for RPPs · NRS 048-2/4) ·
          monitoring → non-conformance raised → under assessment → corrective action required → CAP submitted →
          CAP approved → remediation in progress → compliance retest → compliant closed. A rejected plan loops back
          for resubmission (CAP revise); a severe deviation or failed retest can impose an interim operating
          restriction; an unremediated breach escalates to disconnection. URGENT SLA: the more severe the tier,
          the tighter every window. Split write — the operator drives the machinery; the facility submits the CAP
          and remediates. W67 signature — a disconnection crosses to the regulator for every tier; restriction and
          SLA breach cross for large tiers (serious + critical).
        </p>
      </header>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 16 }}>
        <KpiTile label="Total"         value={summary?.total ?? rows.length} />
        <KpiTile label="Monitoring"    value={summary?.monitoring_count ?? 0} />
        <KpiTile label="Open"          value={summary?.open_count ?? 0}        tone={(summary?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Large open"    value={summary?.large_open ?? 0}        tone={(summary?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Restricted"    value={summary?.restricted_count ?? 0}  tone={(summary?.restricted_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Disconnected"  value={summary?.disconnected_count ?? 0} tone={(summary?.disconnected_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="SLA breached"  value={summary?.breached ?? 0}          tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Reportable"    value={summary?.reportable_total ?? 0}  tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Closed"        value={summary?.closed_count ?? 0}      tone="ok" />
        <KpiTile label="Withdrawn"     value={summary?.withdrawn_count ?? 0}   tone={(summary?.withdrawn_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Non-compliant MW" value={fmtMw(summary?.total_capacity_mw ?? 0)} />
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 4,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {err && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, border: `1px solid ${BAD}40`, background: `${BAD}10`, color: BAD, fontSize: 12 }}>
          {err}
        </div>
      )}

      {/* Card list */}
      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 8, border: `1px solid ${BORDER}` }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 8, border: `1px solid ${BORDER}` }}>
          No compliance cases match.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => (
            <ChainCard
              key={row.id}
              item={row}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.facility_name}
              meta={
                <span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: TX3 }}>{row.case_number}</span>
                  {' · '}
                  {BREACH_LABEL[row.breach_class]}
                  {' · '}
                  <span style={{ textTransform: 'capitalize' }}>{row.severity_tier}</span>
                  {row.capacity_mw != null ? ` · ${fmtMw(row.capacity_mw)}` : ''}
                  {row.is_reportable ? (
                    <span style={{ marginLeft: 6, color: BAD, fontWeight: 700 }} title="Reportable to the regulator">● Reportable</span>
                  ) : null}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={['regulator']}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────
function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, marginTop: 1 }}>{value}</div>
    </div>
  );
}

export default GridCodeComplianceChainTab;
