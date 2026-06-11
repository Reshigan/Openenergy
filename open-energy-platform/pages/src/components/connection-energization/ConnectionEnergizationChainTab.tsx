// Wave 75 — Grid Connection Energization & Commissioning Hold-Point Gate.
//
// The PHYSICAL go-live gate for a new generator. Once a plant has won scarce grid
// capacity (W58) and signed its Grid Connection Agreement (W28), the SA Grid Code
// and the NTCSA / System Operator commissioning procedures require it to be
// COMMISSIONED and ENERGIZED through a sequence of witnessed HOLD-POINTS before it
// can sell a single MWh.
//
//   connection_ready → program_review → program_approved
//     → pre_energization_inspection → energization_authorized → cold_commissioning
//     → synchronized → trial_operation → compliance_testing → commercial_operation
//   suspend (failed hold-point): {pre_energization_inspection, energization_authorized,
//     cold_commissioning, synchronized, trial_operation, compliance_testing}
//       → commissioning_suspended → (resume) → program_approved
//   withdraw: any non-terminal → connection_withdrawn
//
// Split write: the connected FACILITY (IPP developer) submits the programme, performs
// cold commissioning and the trial-operation run, and may withdraw; the System
// Operator (operator desk) approves the programme, witnesses each hold-point, issues
// the COD certificate, and suspends / resumes. Beats Eskom/NTCSA's notoriously slow
// connect-to-energize backlog with auto-scheduled witnessed hold-points, captured
// evidence references, conditional energization and SLA-driven sign-off. INVERTED SLA:
// the larger the connection, the longer every window (an embedded connection is the
// fastest, a bulk transmission tie-in the slowest). Reportability — the W75 signature,
// COD-driven and POSITIVE: issue_cod crosses to the regulator for EVERY tier (bringing
// new generation to commercial operation is always notifiable); authorize_energization,
// suspend_commissioning and SLA breaches cross for the large tiers (transmission + bulk).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

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
  | 'connection_ready' | 'program_review' | 'program_approved'
  | 'pre_energization_inspection' | 'energization_authorized' | 'cold_commissioning'
  | 'synchronized' | 'trial_operation' | 'compliance_testing' | 'commercial_operation'
  | 'commissioning_suspended' | 'connection_withdrawn';

type Tier = 'embedded' | 'distribution' | 'sub_transmission' | 'transmission' | 'bulk';

interface EnergizationRow {
  [key: string]: unknown;
  id: string;
  energization_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  gca_ref: string | null;
  capacity_allocation_ref: string | null;
  facility_id: string;
  facility_name: string;
  connection_point: string | null;
  network_operator: string | null;
  technology: string | null;
  connection_capacity_mw: number;
  voltage_kv: number | null;
  connection_tier: Tier;
  cod_certificate_no: string | null;
  cod_date: string | null;
  program_ref: string | null;
  inspection_ref: string | null;
  energization_ref: string | null;
  synchronization_ref: string | null;
  compliance_test_ref: string | null;
  suspension_ref: string | null;
  withdrawal_ref: string | null;
  program_basis: string | null;
  approval_basis: string | null;
  inspection_basis: string | null;
  energization_basis: string | null;
  cold_commissioning_basis: string | null;
  synchronization_basis: string | null;
  trial_operation_basis: string | null;
  compliance_test_basis: string | null;
  cod_basis: string | null;
  suspension_basis: string | null;
  resumption_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  connection_ready_at: string;
  program_review_at: string | null;
  program_approved_at: string | null;
  pre_energization_inspection_at: string | null;
  energization_authorized_at: string | null;
  cold_commissioning_at: string | null;
  synchronized_at: string | null;
  trial_operation_at: string | null;
  compliance_testing_at: string | null;
  commercial_operation_at: string | null;
  commissioning_suspended_at: string | null;
  connection_withdrawn_at: string | null;
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
  case_number?: string;
}

interface KpiSummary {
  total: number;
  ready_count: number;
  open_count: number;
  suspended_count: number;
  energized_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  total_capacity_mw: number;
  energized_capacity_mw: number;
}

const ALL_STATES = [
  'connection_ready',
  'program_review',
  'program_approved',
  'pre_energization_inspection',
  'energization_authorized',
  'cold_commissioning',
  'synchronized',
  'trial_operation',
  'compliance_testing',
  'commercial_operation',
] as const;

const BRANCH_STATES = [
  'commissioning_suspended',
  'connection_withdrawn',
] as const;

const FILTERS = [
  { key: 'active',                      label: 'Active' },
  { key: 'all',                         label: 'All' },
  { key: 'embedded',                    label: 'Embedded' },
  { key: 'distribution',               label: 'Distribution' },
  { key: 'sub_transmission',           label: 'Sub-transmission' },
  { key: 'transmission',               label: 'Transmission' },
  { key: 'bulk',                        label: 'Bulk' },
  { key: 'pre_energization_inspection', label: 'Inspection' },
  { key: 'cold_commissioning',          label: 'Cold commissioning' },
  { key: 'synchronized',               label: 'Synchronized' },
  { key: 'trial_operation',            label: 'Trial operation' },
  { key: 'compliance_testing',         label: 'Compliance testing' },
  { key: 'commissioning_suspended',    label: 'Suspended' },
  { key: 'breached',                   label: 'SLA breached' },
  { key: 'reportable',                 label: 'Reportable' },
  { key: 'commercial_operation',       label: 'Commercial operation' },
  { key: 'connection_withdrawn',       label: 'Withdrawn' },
];

const TERMINAL_STATES: ChainStatus[] = ['commercial_operation', 'connection_withdrawn'];
const SUSPENDABLE_STATES: ChainStatus[] = [
  'pre_energization_inspection', 'energization_authorized', 'cold_commissioning',
  'synchronized', 'trial_operation', 'compliance_testing',
];

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} GW`;
  if (Math.abs(n) >= 100) return `${Math.round(n)} MW`;
  return `${n.toFixed(n < 1 ? 2 : 1)} MW`;
}

function getActions(row: EnergizationRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const canSuspend = SUSPENDABLE_STATES.includes(row.chain_status);
  const canWithdraw = !TERMINAL_STATES.includes(row.chain_status);

  if (row.chain_status === 'connection_ready') {
    actions.push({
      key: 'submit-program',
      label: 'Submit commissioning programme (facility)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'program_basis', label: 'Programme basis — the commissioning & energization programme submitted by the facility', type: 'textarea', required: true },
        { key: 'program_ref', label: 'Programme reference (e.g. PROG-2026-0007)', type: 'text', required: false },
        { key: 'connection_capacity_mw', label: 'Restate connection capacity (MW) — blank to keep', type: 'text', required: false },
      ],
    });
  }
  if (row.chain_status === 'program_review') {
    actions.push({
      key: 'approve-program',
      label: 'Approve programme (operator)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'approval_basis', label: 'Approval basis — SO approves the commissioning programme & hold-point schedule', type: 'textarea', required: true },
      ],
    });
  }
  if (row.chain_status === 'program_approved') {
    actions.push({
      key: 'conduct-inspection',
      label: 'Conduct pre-energization inspection (operator)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'inspection_basis', label: 'Inspection basis — pre-energization physical / protection inspection result', type: 'textarea', required: true },
        { key: 'inspection_ref', label: 'Inspection reference (e.g. INSP-2026-0007)', type: 'text', required: false },
      ],
    });
  }
  if (row.chain_status === 'pre_energization_inspection') {
    actions.push({
      key: 'authorize-energization',
      label: 'Authorize energization (operator)',
      tone: 'primary',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'energization_basis', label: 'Energization basis — SO authorizes back-energization of the connection (large tiers cross to regulator)', type: 'textarea', required: true },
        { key: 'energization_ref', label: 'Energization authorization reference (e.g. EAUTH-2026-0007)', type: 'text', required: false },
      ],
    });
  }
  if (row.chain_status === 'energization_authorized') {
    actions.push({
      key: 'begin-cold-commissioning',
      label: 'Begin cold commissioning (facility)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'cold_commissioning_basis', label: 'Cold-commissioning basis — facility begins de-energized equipment checks & cold tests', type: 'textarea', required: true },
      ],
    });
  }
  if (row.chain_status === 'cold_commissioning') {
    actions.push({
      key: 'authorize-synchronization',
      label: 'Authorize synchronization (operator)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'synchronization_basis', label: 'Synchronization basis — SO authorizes first synchronization to the grid', type: 'textarea', required: true },
        { key: 'synchronization_ref', label: 'Synchronization reference (e.g. SYNC-2026-0007)', type: 'text', required: false },
      ],
    });
  }
  if (row.chain_status === 'synchronized') {
    actions.push({
      key: 'begin-trial-operation',
      label: 'Begin trial operation (facility)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'trial_operation_basis', label: 'Trial-operation basis — facility begins the supervised trial-operation period', type: 'textarea', required: true },
      ],
    });
  }
  if (row.chain_status === 'trial_operation') {
    actions.push({
      key: 'begin-compliance-testing',
      label: 'Begin compliance testing (operator)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'compliance_test_basis', label: 'Compliance-testing basis — Grid Code compliance / performance testing begins', type: 'textarea', required: true },
        { key: 'compliance_test_ref', label: 'Compliance-test reference (e.g. GCT-2026-0007)', type: 'text', required: false },
      ],
    });
  }
  if (row.chain_status === 'compliance_testing') {
    actions.push({
      key: 'issue-cod',
      label: 'Issue COD certificate (operator)',
      tone: 'primary',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'cod_basis', label: 'COD basis — Commercial Operation Date certified; the plant may now sell energy (crosses to regulator for every tier)', type: 'textarea', required: true },
        { key: 'cod_certificate_no', label: 'COD certificate number (e.g. COD-2026-0007)', type: 'text', required: false },
        { key: 'cod_date', label: 'COD date (YYYY-MM-DD)', type: 'text', required: false },
      ],
    });
  }
  if (row.chain_status === 'commissioning_suspended') {
    actions.push({
      key: 'resume-commissioning',
      label: 'Resume commissioning (operator)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'resumption_basis', label: 'Resumption basis — the suspension cause is cleared; commissioning restarts from programme-approved', type: 'textarea', required: true },
      ],
    });
  }
  if (canSuspend) {
    actions.push({
      key: 'suspend-commissioning',
      label: 'Suspend commissioning (operator)',
      tone: 'warn',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'suspension_basis', label: 'Suspension basis — a hold-point failed / safety concern; commissioning is suspended (large tiers cross to regulator)', type: 'textarea', required: true },
        { key: 'suspension_ref', label: 'Suspension reference (e.g. SUSP-2026-0007)', type: 'text', required: false },
        { key: 'reason_code', label: 'Reason code (e.g. protection_failure / safety_nonconformance)', type: 'text', required: false },
      ],
    });
  }
  if (canWithdraw) {
    actions.push({
      key: 'withdraw-connection',
      label: 'Withdraw connection (facility)',
      tone: 'danger',
      cascadeTo: [],
      fields: [
        { key: 'withdrawal_basis', label: 'Withdrawal basis — the connection is withdrawn before commercial operation', type: 'textarea', required: true },
        { key: 'withdrawal_ref', label: 'Withdrawal reference (e.g. WDR-2026-0007)', type: 'text', required: false },
        { key: 'reason_code', label: 'Reason code (e.g. developer_cancelled / capacity_lapsed)', type: 'text', required: false },
      ],
    });
  }
  return actions;
}

function renderDetail(row: EnergizationRow): React.ReactNode {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px' }}>
      <DetailPair label="Tier"                   value={row.connection_tier.replace(/_/g, ' ')} />
      <DetailPair label="Capacity"               value={fmtMw(row.connection_capacity_mw)} />
      <DetailPair label="Voltage"                value={row.voltage_kv != null ? `${row.voltage_kv} kV` : '—'} />
      <DetailPair label="Technology"             value={row.technology ?? '—'} />
      <DetailPair label="Connection point"       value={row.connection_point ?? '—'} />
      <DetailPair label="Network operator"       value={row.network_operator ?? '—'} />
      <DetailPair label="GCA ref"                value={row.gca_ref ?? '—'} />
      <DetailPair label="Capacity alloc ref"     value={row.capacity_allocation_ref ?? '—'} />
      <DetailPair label="COD certificate"        value={row.cod_certificate_no ?? '—'} />
      <DetailPair label="COD date"               value={row.cod_date ?? '—'} />
      <DetailPair label="Programme ref"          value={row.program_ref ?? '—'} />
      <DetailPair label="Inspection ref"         value={row.inspection_ref ?? '—'} />
      <DetailPair label="Energization ref"       value={row.energization_ref ?? '—'} />
      <DetailPair label="Synchronization ref"    value={row.synchronization_ref ?? '—'} />
      <DetailPair label="Compliance-test ref"    value={row.compliance_test_ref ?? '—'} />
      <DetailPair label="Suspension ref"         value={row.suspension_ref ?? '—'} />
      <DetailPair label="Withdrawal ref"         value={row.withdrawal_ref ?? '—'} />
      <DetailPair label="Reason code"            value={row.reason_code ?? '—'} />
      <DetailPair label="Ready"                  value={fmtDate(row.connection_ready_at)} />
      <DetailPair label="Programme review"       value={fmtDate(row.program_review_at)} />
      <DetailPair label="Programme approved"     value={fmtDate(row.program_approved_at)} />
      <DetailPair label="Inspection"             value={fmtDate(row.pre_energization_inspection_at)} />
      <DetailPair label="Energization auth"      value={fmtDate(row.energization_authorized_at)} />
      <DetailPair label="Cold commissioning"     value={fmtDate(row.cold_commissioning_at)} />
      <DetailPair label="Synchronized"           value={fmtDate(row.synchronized_at)} />
      <DetailPair label="Trial operation"        value={fmtDate(row.trial_operation_at)} />
      <DetailPair label="Compliance testing"     value={fmtDate(row.compliance_testing_at)} />
      <DetailPair label="Commercial operation"   value={fmtDate(row.commercial_operation_at)} />
      <DetailPair label="Suspended"              value={fmtDate(row.commissioning_suspended_at)} />
      <DetailPair label="Withdrawn"              value={fmtDate(row.connection_withdrawn_at)} />
      <DetailPair label="SLA deadline"           value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="Reportable"             value={row.is_reportable ? 'Yes' : 'No'} />
      {row.source_wave && (
        <DetailPair label="Source wave"          value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}`} />
      )}
      {row.escalation_level > 0 && (
        <DetailPair label="Escalation level"     value={String(row.escalation_level)} />
      )}
      {row.program_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Programme basis (facility)" value={row.program_basis} />
        </div>
      )}
      {row.approval_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Approval basis" value={row.approval_basis} />
        </div>
      )}
      {row.inspection_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Inspection basis" value={row.inspection_basis} />
        </div>
      )}
      {row.energization_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Energization basis" value={row.energization_basis} />
        </div>
      )}
      {row.cold_commissioning_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Cold-commissioning basis (facility)" value={row.cold_commissioning_basis} />
        </div>
      )}
      {row.synchronization_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Synchronization basis" value={row.synchronization_basis} />
        </div>
      )}
      {row.trial_operation_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Trial-operation basis (facility)" value={row.trial_operation_basis} />
        </div>
      )}
      {row.compliance_test_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Compliance-test basis" value={row.compliance_test_basis} />
        </div>
      )}
      {row.cod_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="COD basis" value={row.cod_basis} />
        </div>
      )}
      {row.suspension_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Suspension basis" value={row.suspension_basis} />
        </div>
      )}
      {row.resumption_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Resumption basis" value={row.resumption_basis} />
        </div>
      )}
      {row.withdrawal_basis && (
        <div style={{ gridColumn: '1 / -1' }}>
          <DetailPair label="Withdrawal basis" value={row.withdrawal_basis} />
        </div>
      )}
    </div>
  );
}

export function ConnectionEnergizationChainTab() {
  const [rows, setRows] = useState<EnergizationRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: EnergizationRow[] } & KpiSummary }>('/connection-energization/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setSummary({
          total: d.total, ready_count: d.ready_count, open_count: d.open_count,
          suspended_count: d.suspended_count, energized_count: d.energized_count,
          withdrawn_count: d.withdrawn_count, breached: d.breached,
          reportable_total: d.reportable_total, large_open: d.large_open,
          total_capacity_mw: d.total_capacity_mw, energized_capacity_mw: d.energized_capacity_mw,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load energization records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/connection-energization/chain/${rowId}/${key}`, values);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: EnergizationRow; events: ChainEvent[] } }>(
        `/connection-energization/chain/${id}`
      );
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch {
      // silently ignore; events just won't show
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (['embedded', 'distribution', 'sub_transmission', 'transmission', 'bulk'].includes(filter)) {
        return r.connection_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ padding: '20px', background: BG, minHeight: '100%' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: TX1, margin: 0 }}>
          Connection energization &amp; commissioning
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 4, maxWidth: 720 }}>
          12-stage SA Grid Code / NTCSA commissioning hold-point gate — the physical go-live for a new generator
          after it wins capacity (W58) and signs its Grid Connection Agreement (W28). Split write: facility (IPP)
          submits programme, runs cold commissioning and trial operation, may withdraw; System Operator approves,
          inspects, authorizes, witnesses, tests and certifies COD. INVERTED SLA: larger connection = longer window.
          W75 signature: issue_cod crosses to regulator every tier; authorize_energization, suspend and SLA breaches
          cross for large tiers (transmission + bulk).
        </p>
      </header>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
        <KpiTile label="Total"               value={summary?.total ?? rows.length} />
        <KpiTile label="Open"                value={summary?.open_count ?? 0} />
        <KpiTile label="Connection ready"    value={summary?.ready_count ?? 0} />
        <KpiTile label="Suspended"           value={summary?.suspended_count ?? 0}     tone={(summary?.suspended_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="SLA breached"        value={summary?.breached ?? 0}             tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Large open"          value={summary?.large_open ?? 0}           tone={(summary?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Commercial op."      value={summary?.energized_count ?? 0}      tone="ok" />
        <KpiTile label="Withdrawn"           value={summary?.withdrawn_count ?? 0}      tone={(summary?.withdrawn_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Reportable"          value={summary?.reportable_total ?? 0}     tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Capacity in chain"   value={fmtMw(summary?.total_capacity_mw ?? 0)} />
        <KpiTile label="Energized capacity"  value={fmtMw(summary?.energized_capacity_mw ?? 0)} tone="ok" />
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
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
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

      {err && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 4, border: `1px solid ${BAD}40`, background: `${BAD}10`, color: BAD, fontSize: 12 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: TX3, fontSize: 13, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: TX3, fontSize: 13, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
          No energizations match.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => (
            <ChainCard
              key={row.id}
              item={{ ...row, case_number: row.energization_number }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.facility_name}
              meta={`${row.connection_tier.replace(/_/g, ' ')} · ${fmtMw(row.connection_capacity_mw)}${row.technology ? ` · ${row.technology}` : ''}${row.voltage_kv != null ? ` · ${row.voltage_kv} kV` : ''}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
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

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1 }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

export default ConnectionEnergizationChainTab;
