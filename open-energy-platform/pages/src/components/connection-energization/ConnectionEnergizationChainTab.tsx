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

type ChainStatus =
  | 'connection_ready' | 'program_review' | 'program_approved'
  | 'pre_energization_inspection' | 'energization_authorized' | 'cold_commissioning'
  | 'synchronized' | 'trial_operation' | 'compliance_testing' | 'commercial_operation'
  | 'commissioning_suspended' | 'connection_withdrawn';

type Tier = 'embedded' | 'distribution' | 'sub_transmission' | 'transmission' | 'bulk';

interface EnergizationRow {
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
}

interface EnergizationEvent {
  id: string;
  energization_id: string;
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

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  connection_ready:            { bg: '#e3e7ec', fg: '#557',    label: 'Connection ready' },
  program_review:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Programme review' },
  program_approved:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'Programme approved' },
  pre_energization_inspection: { bg: '#fff4d6', fg: '#a06200', label: 'Pre-energization inspection' },
  energization_authorized:     { bg: '#ffe9d6', fg: '#8a4a00', label: 'Energization authorized' },
  cold_commissioning:          { bg: '#ffe9d6', fg: '#8a4a00', label: 'Cold commissioning' },
  synchronized:                { bg: '#e4f0ff', fg: '#1a3a5c', label: 'Synchronized' },
  trial_operation:             { bg: '#e4f0ff', fg: '#1a3a5c', label: 'Trial operation' },
  compliance_testing:          { bg: '#fff4d6', fg: '#a06200', label: 'Compliance testing' },
  commercial_operation:        { bg: '#d4edda', fg: '#155724', label: 'Commercial operation' },
  commissioning_suspended:     { bg: '#fdd0d0', fg: '#7a1010', label: 'Commissioning suspended' },
  connection_withdrawn:        { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Connection withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  embedded:         { bg: '#e3e7ec', fg: '#557',    label: 'Embedded (<1 MW)' },
  distribution:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Distribution (<10 MW)' },
  sub_transmission: { bg: '#fff4d6', fg: '#a06200', label: 'Sub-transmission (<50 MW)' },
  transmission:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'Transmission (<200 MW)' },
  bulk:             { bg: '#fde0e0', fg: '#9b1f1f', label: 'Bulk (≥200 MW)' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                  label: 'Active' },
  { key: 'all',                     label: 'All' },
  { key: 'embedded',                label: 'Embedded' },
  { key: 'distribution',            label: 'Distribution' },
  { key: 'sub_transmission',        label: 'Sub-transmission' },
  { key: 'transmission',            label: 'Transmission' },
  { key: 'bulk',                    label: 'Bulk' },
  { key: 'pre_energization_inspection', label: 'Inspection' },
  { key: 'cold_commissioning',      label: 'Cold commissioning' },
  { key: 'synchronized',            label: 'Synchronized' },
  { key: 'trial_operation',         label: 'Trial operation' },
  { key: 'compliance_testing',      label: 'Compliance testing' },
  { key: 'commissioning_suspended', label: 'Suspended' },
  { key: 'breached',                label: 'SLA breached' },
  { key: 'reportable',              label: 'Reportable' },
  { key: 'commercial_operation',    label: 'Commercial operation' },
  { key: 'connection_withdrawn',    label: 'Withdrawn' },
];

type ActionKind =
  | 'submit-program' | 'approve-program' | 'conduct-inspection' | 'authorize-energization'
  | 'begin-cold-commissioning' | 'authorize-synchronization' | 'begin-trial-operation'
  | 'begin-compliance-testing' | 'issue-cod' | 'suspend-commissioning'
  | 'resume-commissioning' | 'withdraw-connection';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  connection_ready:            'submit-program',
  program_review:              'approve-program',
  program_approved:            'conduct-inspection',
  pre_energization_inspection: 'authorize-energization',
  energization_authorized:     'begin-cold-commissioning',
  cold_commissioning:          'authorize-synchronization',
  synchronized:                'begin-trial-operation',
  trial_operation:             'begin-compliance-testing',
  compliance_testing:          'issue-cod',
  commercial_operation:        null,
  commissioning_suspended:     'resume-commissioning',
  connection_withdrawn:        null,
};

// Party annotation per action — which side of the split write performs it. The
// connected FACILITY (IPP developer) submits the programme, runs cold commissioning
// and the trial-operation period, and may withdraw; the System Operator (operator)
// approves, inspects, authorizes, witnesses, tests, issues the COD, suspends/resumes.
const ACTION_LABEL: Record<ActionKind, string> = {
  'submit-program':           'Submit commissioning programme (facility)',
  'approve-program':          'Approve programme (operator)',
  'conduct-inspection':       'Conduct pre-energization inspection (operator)',
  'authorize-energization':   'Authorize energization (operator)',
  'begin-cold-commissioning': 'Begin cold commissioning (facility)',
  'authorize-synchronization':'Authorize synchronization (operator)',
  'begin-trial-operation':    'Begin trial operation (facility)',
  'begin-compliance-testing': 'Begin compliance testing (operator)',
  'issue-cod':                'Issue COD certificate (operator)',
  'suspend-commissioning':    'Suspend commissioning (operator)',
  'resume-commissioning':     'Resume commissioning (operator)',
  'withdraw-connection':      'Withdraw connection (facility)',
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
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} GW`;
  if (Math.abs(n) >= 100) return `${Math.round(n)} MW`;
  return `${n.toFixed(n < 1 ? 2 : 1)} MW`;
}

const TERMINAL_STATES: ChainStatus[] = ['commercial_operation', 'connection_withdrawn'];
const SUSPENDABLE_STATES: ChainStatus[] = [
  'pre_energization_inspection', 'energization_authorized', 'cold_commissioning',
  'synchronized', 'trial_operation', 'compliance_testing',
];

export function ConnectionEnergizationChainTab() {
  const [rows, setRows] = useState<EnergizationRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<EnergizationRow | null>(null);
  const [events, setEvents] = useState<EnergizationEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: EnergizationRow[] } & KpiSummary }>('/connection-energization/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
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

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: EnergizationRow; events: EnergizationEvent[] } }>(
        `/connection-energization/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load energization history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'embedded' || filter === 'distribution' || filter === 'sub_transmission' || filter === 'transmission' || filter === 'bulk') {
        return r.connection_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: EnergizationRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'submit-program') {
        const basis = window.prompt('Programme basis — the commissioning & energization programme submitted by the facility:');
        if (!basis) return;
        const ref = window.prompt('Programme reference (e.g. PROG-2026-0007):', row.program_ref || '') || '';
        const mw = window.prompt('Restate connection capacity (MW) — blank to keep:', String(row.connection_capacity_mw || ''));
        body = { program_basis: basis };
        if (ref) body.program_ref = ref;
        if (mw && !Number.isNaN(Number(mw))) body.connection_capacity_mw = Number(mw);
      } else if (action === 'approve-program') {
        const basis = window.prompt('Approval basis — SO approves the commissioning programme & hold-point schedule:');
        if (!basis) return;
        body = { approval_basis: basis };
      } else if (action === 'conduct-inspection') {
        const basis = window.prompt('Inspection basis — pre-energization physical / protection inspection result:');
        if (!basis) return;
        const ref = window.prompt('Inspection reference (e.g. INSP-2026-0007):') || '';
        body = { inspection_basis: basis };
        if (ref) body.inspection_ref = ref;
      } else if (action === 'authorize-energization') {
        const basis = window.prompt('Energization basis — SO authorizes back-energization of the connection (large tiers cross to regulator):');
        if (!basis) return;
        const ref = window.prompt('Energization authorization reference (e.g. EAUTH-2026-0007):') || '';
        body = { energization_basis: basis };
        if (ref) body.energization_ref = ref;
      } else if (action === 'begin-cold-commissioning') {
        const basis = window.prompt('Cold-commissioning basis — facility begins de-energized equipment checks & cold tests:');
        if (!basis) return;
        body = { cold_commissioning_basis: basis };
      } else if (action === 'authorize-synchronization') {
        const basis = window.prompt('Synchronization basis — SO authorizes first synchronization to the grid:');
        if (!basis) return;
        const ref = window.prompt('Synchronization reference (e.g. SYNC-2026-0007):') || '';
        body = { synchronization_basis: basis };
        if (ref) body.synchronization_ref = ref;
      } else if (action === 'begin-trial-operation') {
        const basis = window.prompt('Trial-operation basis — facility begins the supervised trial-operation period:');
        if (!basis) return;
        body = { trial_operation_basis: basis };
      } else if (action === 'begin-compliance-testing') {
        const basis = window.prompt('Compliance-testing basis — Grid Code compliance / performance testing begins:');
        if (!basis) return;
        const ref = window.prompt('Compliance-test reference (e.g. GCT-2026-0007):') || '';
        body = { compliance_test_basis: basis };
        if (ref) body.compliance_test_ref = ref;
      } else if (action === 'issue-cod') {
        const basis = window.prompt('COD basis — Commercial Operation Date certified; the plant may now sell energy (crosses to regulator for every tier):');
        if (!basis) return;
        const cert = window.prompt('COD certificate number (e.g. COD-2026-0007):') || '';
        const date = window.prompt('COD date (YYYY-MM-DD):') || '';
        body = { cod_basis: basis };
        if (cert) body.cod_certificate_no = cert;
        if (date) body.cod_date = date;
      } else if (action === 'suspend-commissioning') {
        const basis = window.prompt('Suspension basis — a hold-point failed / safety concern; commissioning is suspended (large tiers cross to regulator):');
        if (!basis) return;
        const ref = window.prompt('Suspension reference (e.g. SUSP-2026-0007):') || '';
        const reason = window.prompt('Reason code (e.g. protection_failure / safety_nonconformance):', 'hold_point_failed') || '';
        body = { suspension_basis: basis };
        if (ref) body.suspension_ref = ref;
        if (reason) body.reason_code = reason;
      } else if (action === 'resume-commissioning') {
        const basis = window.prompt('Resumption basis — the suspension cause is cleared; commissioning restarts from programme-approved:');
        if (!basis) return;
        body = { resumption_basis: basis };
      } else if (action === 'withdraw-connection') {
        const basis = window.prompt('Withdrawal basis — the connection is withdrawn before commercial operation:');
        if (!basis) return;
        const ref = window.prompt('Withdrawal reference (e.g. WDR-2026-0007):') || '';
        const reason = window.prompt('Reason code (e.g. developer_cancelled / capacity_lapsed):', 'developer_cancelled') || '';
        body = { withdrawal_basis: basis };
        if (ref) body.withdrawal_ref = ref;
        if (reason) body.reason_code = reason;
      }
      await api.post(`/connection-energization/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Connection energization &amp; commissioning</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage SA Grid Code / NTCSA commissioning hold-point gate — the physical go-live for a new generator
            after it wins capacity (W58) and signs its Grid Connection Agreement (W28). connection ready → programme
            review → approved → pre-energization inspection → energization authorized → cold commissioning →
            synchronized → trial operation → compliance testing → commercial operation, with a suspend-on-failed-hold-point
            branch (→ commissioning suspended → resume) and a withdraw-before-COD exit. Split write: the facility (IPP)
            submits the programme, runs cold commissioning and trial operation, and may withdraw; the System Operator
            approves, inspects, authorizes, witnesses, tests and certifies COD. Beats Eskom/NTCSA&apos;s connect-to-energize
            backlog with auto-scheduled witnessed hold-points, captured evidence and SLA-driven sign-off. INVERTED SLA:
            the larger the connection, the longer every window. The W75 signature — issuing the COD crosses to the regulator
            for EVERY tier (new generation reaching commercial operation is always notifiable); energization authorization,
            suspension and SLA breaches cross for the large tiers (transmission + bulk).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Connection ready" value={kpis?.ready_count ?? 0} />
        <Kpi label="Suspended" value={kpis?.suspended_count ?? 0} tone={(kpis?.suspended_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Large open" value={kpis?.large_open ?? 0} tone={(kpis?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Commercial operation" value={kpis?.energized_count ?? 0} tone="ok" />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} tone={(kpis?.withdrawn_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Capacity in chain" value={fmtMw(kpis?.total_capacity_mw ?? 0)} />
        <Kpi label="Energized capacity" value={fmtMw(kpis?.energized_capacity_mw ?? 0)} tone="ok" />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Energization #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Facility</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Technology</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Capacity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.connection_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.energization_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to the regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[180px] truncate" title={r.facility_name}>
                      {r.facility_name}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.technology ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtMw(r.connection_capacity_mw)}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No energizations match.</td></tr>
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
  row: EnergizationRow;
  events: EnergizationEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: EnergizationRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canSuspend = SUSPENDABLE_STATES.includes(row.chain_status);
  const canWithdraw = !TERMINAL_STATES.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.energization_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.facility_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.connection_tier].label} · {fmtMw(row.connection_capacity_mw)}
                {row.technology ? ` · ${row.technology}` : ''}
                {row.voltage_kv != null ? ` · ${row.voltage_kv} kV` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.connection_point ? `Connection point ${row.connection_point}` : ''}
                {row.network_operator ? ` · ${row.network_operator}` : ''}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                  {row.gca_ref ? ` · GCA ${row.gca_ref}` : ''}
                  {row.capacity_allocation_ref ? ` · capacity ${row.capacity_allocation_ref}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"              value={TIER_TONE[row.connection_tier].label} />
            <Pair label="Capacity"          value={fmtMw(row.connection_capacity_mw)} />
            <Pair label="Voltage"           value={row.voltage_kv != null ? `${row.voltage_kv} kV` : '—'} />
            <Pair label="Technology"        value={row.technology ?? '—'} />
            <Pair label="Connection point"  value={row.connection_point ?? '—'} />
            <Pair label="Network operator"  value={row.network_operator ?? '—'} />
            <Pair label="GCA ref"           value={row.gca_ref ?? '—'} />
            <Pair label="Capacity alloc ref" value={row.capacity_allocation_ref ?? '—'} />
            <Pair label="COD certificate"   value={row.cod_certificate_no ?? '—'} />
            <Pair label="COD date"          value={row.cod_date ?? '—'} />
            <Pair label="Programme ref"     value={row.program_ref ?? '—'} />
            <Pair label="Inspection ref"    value={row.inspection_ref ?? '—'} />
            <Pair label="Energization ref"  value={row.energization_ref ?? '—'} />
            <Pair label="Synchronization ref" value={row.synchronization_ref ?? '—'} />
            <Pair label="Compliance-test ref" value={row.compliance_test_ref ?? '—'} />
            <Pair label="Suspension ref"    value={row.suspension_ref ?? '—'} />
            <Pair label="Withdrawal ref"    value={row.withdrawal_ref ?? '—'} />
            <Pair label="Reason code"       value={row.reason_code ?? '—'} />
            <Pair label="Ready"             value={fmtDate(row.connection_ready_at)} />
            <Pair label="Programme review"  value={fmtDate(row.program_review_at)} />
            <Pair label="Programme approved" value={fmtDate(row.program_approved_at)} />
            <Pair label="Inspection"        value={fmtDate(row.pre_energization_inspection_at)} />
            <Pair label="Energization auth" value={fmtDate(row.energization_authorized_at)} />
            <Pair label="Cold commissioning" value={fmtDate(row.cold_commissioning_at)} />
            <Pair label="Synchronized"      value={fmtDate(row.synchronized_at)} />
            <Pair label="Trial operation"   value={fmtDate(row.trial_operation_at)} />
            <Pair label="Compliance testing" value={fmtDate(row.compliance_testing_at)} />
            <Pair label="Commercial operation" value={fmtDate(row.commercial_operation_at)} />
            <Pair label="Suspended"         value={fmtDate(row.commissioning_suspended_at)} />
            <Pair label="Withdrawn"         value={fmtDate(row.connection_withdrawn_at)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Reportable"        value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.program_basis && (
            <BasisBlock label="Programme basis (facility)" tone="#1a3a5c" text={row.program_basis} />
          )}
          {row.approval_basis && (
            <BasisBlock label="Approval basis" tone="#1a3a5c" text={row.approval_basis} />
          )}
          {row.inspection_basis && (
            <BasisBlock label="Inspection basis" tone="#a06200" text={row.inspection_basis} />
          )}
          {row.energization_basis && (
            <BasisBlock label="Energization basis" tone="#8a4a00" text={row.energization_basis} />
          )}
          {row.cold_commissioning_basis && (
            <BasisBlock label="Cold-commissioning basis (facility)" tone="#8a4a00" text={row.cold_commissioning_basis} />
          )}
          {row.synchronization_basis && (
            <BasisBlock label="Synchronization basis" tone="#1a3a5c" text={row.synchronization_basis} />
          )}
          {row.trial_operation_basis && (
            <BasisBlock label="Trial-operation basis (facility)" tone="#1a3a5c" text={row.trial_operation_basis} />
          )}
          {row.compliance_test_basis && (
            <BasisBlock label="Compliance-test basis" tone="#a06200" text={row.compliance_test_basis} />
          )}
          {row.cod_basis && (
            <BasisBlock label="COD basis" tone="#155724" text={row.cod_basis} />
          )}
          {row.suspension_basis && (
            <BasisBlock label="Suspension basis" tone="#7a1010" text={row.suspension_basis} />
          )}
          {row.resumption_basis && (
            <BasisBlock label="Resumption basis" tone="#155724" text={row.resumption_basis} />
          )}
          {row.withdrawal_basis && (
            <BasisBlock label="Withdrawal basis" tone="#6b1f1f" text={row.withdrawal_basis} />
          )}
        </section>

        {(nextAction || canSuspend || canWithdraw) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canSuspend && (
                <button type="button"
                  onClick={() => onAct('suspend-commissioning', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['suspend-commissioning']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw-connection', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL['withdraw-connection']}
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
