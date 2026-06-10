// Wave 44 — Trader OTC Transaction / Trade-Repository Reporting & Reconciliation chain.
//
// Financial Markets Act 19 of 2012 (FMA) + the FSCA OTC Derivatives Reporting
// regulations — SA's analogue of EMIR / Dodd-Frank trade reporting. Every
// reportable transaction the desk executes must be reported to a licensed Trade
// Repository (TR) by a hard T+1 deadline, acknowledged, then RECONCILED against
// the counterparty's dual-sided submission. Post-trade complement to W2 VaR,
// W9 MM compliance, W29 position limits (quantity) and W36 best-execution
// (quality): this governs whether the trade is correctly REPORTED afterward.
//
//   report_due → report_generated → submitted_to_tr → tr_acknowledged →
//   reconciled → confirmed_complete
//   (+ tr_rejected → corrected re-report loop, break_identified / break_resolved
//      dual-sided reconciliation, exempted intragroup/de-minimis, cancelled bust)
//
// Mounted on the Trader workstation. MIXED SLA: regulatory submission windows
// uniform (T+1 hard line), reconciliation + break windows graded (otc tightest).
// SLA breach crosses to FSCA for EVERY class (a late/missing report IS the FMA
// violation); TR rejection crosses for material classes; a reconciliation break
// crosses for otc_derivative only.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'report_due' | 'report_generated' | 'submitted_to_tr' | 'tr_acknowledged'
  | 'reconciled' | 'break_identified' | 'break_resolved' | 'confirmed_complete'
  | 'tr_rejected' | 'corrected' | 'exempted' | 'cancelled';

type ReportClass = 'otc_derivative' | 'physical_forward' | 'spot_physical';

interface TradeReportRow {
  id: string;
  report_number: string;
  source_event: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  desk_party_name: string;
  trade_repository: string | null;
  uti: string | null;
  trade_ref: string | null;
  counterparty_name: string | null;
  counterparty_lei: string | null;
  energy_type: string | null;
  product: string | null;
  report_class: ReportClass;
  side: string | null;
  trade_date: string | null;
  value_date: string | null;
  reporting_deadline: string | null;
  notional_zar_m: number | null;
  volume_mwh: number | null;
  price_zar_mwh: number | null;
  collateral_zar_m: number | null;
  generation_ref: string | null;
  submission_ref: string | null;
  acknowledgement_ref: string | null;
  reconciliation_ref: string | null;
  break_ref: string | null;
  rejection_ref: string | null;
  correction_ref: string | null;
  exemption_ref: string | null;
  regulator_ref: string | null;
  generation_basis: string | null;
  submission_basis: string | null;
  reconciliation_basis: string | null;
  break_basis: string | null;
  rejection_basis: string | null;
  correction_basis: string | null;
  exemption_basis: string | null;
  reason_code: string | null;
  resolution_notes: string | null;
  chain_status: ChainStatus;
  report_due_at: string;
  resubmission_count: number;
  sla_deadline_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable_class?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
  created_by: string;
}

interface TradeReportEvent {
  id: string;
  report_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  report_due:         { bg: '#e3e7ec', fg: '#445',    label: 'Report due' },
  report_generated:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Report generated' },
  submitted_to_tr:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted to TR' },
  tr_acknowledged:    { bg: '#fff4d6', fg: '#a06200', label: 'TR acknowledged' },
  reconciled:         { bg: '#daf5e2', fg: '#1f6b3a', label: 'Reconciled' },
  break_identified:   { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Break identified' },
  break_resolved:     { bg: '#fbe7d0', fg: '#7a4500', label: 'Break resolved' },
  confirmed_complete: { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Confirmed complete' },
  tr_rejected:        { bg: '#fcc3c3', fg: '#7a0e0e', label: 'TR rejected' },
  corrected:          { bg: '#fbe7d0', fg: '#7a4500', label: 'Corrected' },
  exempted:           { bg: '#e3e7ec', fg: '#557',    label: 'Exempted' },
  cancelled:          { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const CLASS_TONE: Record<ReportClass, { bg: string; fg: string; label: string }> = {
  otc_derivative:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'OTC derivative' },
  physical_forward: { bg: '#fff4d6', fg: '#a06200', label: 'Physical forward' },
  spot_physical:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Spot physical' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'reportable',         label: 'FSCA reportable' },
  { key: 'otc_derivative',     label: 'OTC derivative' },
  { key: 'physical_forward',   label: 'Physical forward' },
  { key: 'spot_physical',      label: 'Spot physical' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'report_due',         label: 'Due' },
  { key: 'report_generated',   label: 'Generated' },
  { key: 'submitted_to_tr',    label: 'Submitted' },
  { key: 'tr_acknowledged',    label: 'Acknowledged' },
  { key: 'reconciled',         label: 'Reconciled' },
  { key: 'break_identified',   label: 'Break' },
  { key: 'break_resolved',     label: 'Break resolved' },
  { key: 'tr_rejected',        label: 'Rejected' },
  { key: 'corrected',          label: 'Corrected' },
  { key: 'confirmed_complete', label: 'Complete' },
  { key: 'exempted',           label: 'Exempted' },
  { key: 'cancelled',          label: 'Cancelled' },
];

type ActionKind =
  | 'generate-report' | 'submit' | 'acknowledge' | 'reconcile' | 'flag-break'
  | 'resolve-break' | 'correct' | 'confirm-complete' | 'reject' | 'exempt' | 'cancel';

// Primary forward-path action surfaced per resting state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  report_due:         'generate-report',
  report_generated:   'submit',
  submitted_to_tr:    'acknowledge',
  tr_acknowledged:    'reconcile',
  reconciled:         'confirm-complete',
  break_identified:   'resolve-break',
  break_resolved:     'reconcile',
  tr_rejected:        'correct',
  corrected:          'submit',
  confirmed_complete: null,
  exempted:           null,
  cancelled:          null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'generate-report':  'Generate report (Reporting Ops)',
  'submit':           'Submit to TR (Reporting Ops)',
  'acknowledge':      'Acknowledge (Trade Repository)',
  'reconcile':        'Reconcile (Reporting Ops)',
  'flag-break':       'Flag break (Trade Repository)',
  'resolve-break':    'Resolve break (Reporting Ops)',
  'correct':          'Correct (Reporting Ops)',
  'confirm-complete': 'Confirm complete (Reporting Ops)',
  'reject':           'Reject (Trade Repository)',
  'exempt':           'Exempt (Desk)',
  'cancel':           'Cancel — trade busted (Desk)',
};

// Branch / secondary actions available alongside the primary forward action.
const REJECTABLE: ChainStatus[] = ['submitted_to_tr'];
const BREAKABLE: ChainStatus[] = ['tr_acknowledged', 'reconciled'];
const CORRECTABLE_FROM_BREAK: ChainStatus[] = ['break_identified'];
const EXEMPTABLE: ChainStatus[] = ['report_due', 'report_generated'];
const CANCELLABLE: ChainStatus[] = [
  'report_due', 'report_generated', 'submitted_to_tr', 'tr_acknowledged',
  'reconciled', 'break_identified', 'break_resolved', 'tr_rejected', 'corrected',
];

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

// Values are stored in millions of ZAR (notional_zar_m / collateral_zar_m).
function fmtZarM(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1000) return `R${(n / 1000).toFixed(2)}bn`;
  return `R${n.toFixed(1)}m`;
}

function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMWh(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')}MWh`;
}

interface KpiSummary {
  total: number;
  open_count: number;
  confirmed_count: number;
  reconciled_count: number;
  break_open: number;
  rejected_open: number;
  exempted_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  otc_open: number;
  total_notional_zar_m: number;
  total_collateral_zar_m: number;
}

export function TradeReportingChainTab() {
  const [rows, setRows] = useState<TradeReportRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<TradeReportRow | null>(null);
  const [events, setEvents] = useState<TradeReportEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: TradeReportRow[] } & KpiSummary }>('/trade-reporting/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          confirmed_count: data.confirmed_count || 0,
          reconciled_count: data.reconciled_count || 0,
          break_open: data.break_open || 0,
          rejected_open: data.rejected_open || 0,
          exempted_count: data.exempted_count || 0,
          cancelled_count: data.cancelled_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          otc_open: data.otc_open || 0,
          total_notional_zar_m: data.total_notional_zar_m || 0,
          total_collateral_zar_m: data.total_collateral_zar_m || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load trade-reporting chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { report: TradeReportRow; events: TradeReportEvent[] } }>(`/trade-reporting/chain/${id}`);
      if (res.data?.data?.report) setSelected(res.data.data.report);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load report history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_reportable_class;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'otc_derivative' || filter === 'physical_forward' || filter === 'spot_physical') {
        return r.report_class === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, confirmed_count: 0, reconciled_count: 0,
    break_open: 0, rejected_open: 0, exempted_count: 0, cancelled_count: 0,
    breached: 0, reportable_total: 0, otc_open: 0,
    total_notional_zar_m: 0, total_collateral_zar_m: 0,
  };

  const act = useCallback(async (action: ActionKind, row: TradeReportRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'generate-report') {
        const uti = window.prompt('Unique Trade Identifier (UTI):', row.uti ?? '');
        if (uti) body.uti = uti;
        const ref = window.prompt('Generation reference (optional):', row.generation_ref ?? '');
        if (ref) body.generation_ref = ref;
        const basis = window.prompt('Generation basis (fields assembled from the executed trade):', row.generation_basis ?? '');
        if (basis) body.generation_basis = basis;
      } else if (action === 'submit') {
        const ref = window.prompt('Submission reference (TR submission ID):', row.submission_ref ?? '');
        if (ref) body.submission_ref = ref;
        const basis = window.prompt('Submission basis (T+1 regulatory deadline):', row.submission_basis ?? '');
        if (basis) body.submission_basis = basis;
      } else if (action === 'acknowledge') {
        const ref = window.prompt('TR acknowledgement reference:', row.acknowledgement_ref ?? '');
        if (ref) body.acknowledgement_ref = ref;
      } else if (action === 'reconcile') {
        const ref = window.prompt('Reconciliation reference (dual-sided match ID):', row.reconciliation_ref ?? '');
        if (ref) body.reconciliation_ref = ref;
        const basis = window.prompt('Reconciliation basis (matched against counterparty submission):', row.reconciliation_basis ?? '');
        if (basis) body.reconciliation_basis = basis;
      } else if (action === 'flag-break') {
        const basis = window.prompt('Break basis — the dual-sided mismatch. Crosses to FSCA for OTC derivatives:');
        if (!basis) return;
        body.break_basis = basis;
        const ref = window.prompt('Break reference (optional):', row.break_ref ?? '');
        if (ref) body.break_ref = ref;
        body.reason_code = 'dual_sided_mismatch';
      } else if (action === 'resolve-break') {
        const notes = window.prompt('Resolution notes (how the break was reconciled):', row.resolution_notes ?? '');
        if (!notes) return;
        body.resolution_notes = notes;
        const ref = window.prompt('Reconciliation reference (optional):', row.reconciliation_ref ?? '');
        if (ref) body.reconciliation_ref = ref;
      } else if (action === 'correct') {
        const basis = window.prompt('Correction basis (the fields corrected before re-report):', row.correction_basis ?? '');
        if (!basis) return;
        body.correction_basis = basis;
        const ref = window.prompt('Correction reference (optional):', row.correction_ref ?? '');
        if (ref) body.correction_ref = ref;
        body.reason_code = 'tr_nack_correction';
      } else if (action === 'confirm-complete') {
        const notes = window.prompt('Completion notes (report reconciled + confirmed — required for audit):', row.resolution_notes ?? '');
        if (!notes) return;
        body.resolution_notes = notes;
        body.reason_code = 'report_reconciled';
      } else if (action === 'reject') {
        const basis = window.prompt('Rejection basis — why the TR rejected the submission. Crosses to FSCA for material classes:');
        if (!basis) return;
        body.rejection_basis = basis;
        const ref = window.prompt('Rejection reference (TR NACK ID):', row.rejection_ref ?? '');
        if (ref) body.rejection_ref = ref;
        body.reason_code = 'tr_validation_failure';
      } else if (action === 'exempt') {
        const basis = window.prompt('Exemption basis (intragroup / de-minimis — no report required):', row.exemption_basis ?? '');
        if (!basis) return;
        body.exemption_basis = basis;
        const ref = window.prompt('Exemption reference (optional):', row.exemption_ref ?? '');
        if (ref) body.exemption_ref = ref;
        body.reason_code = 'intragroup_deminimis';
      } else if (action === 'cancel') {
        const notes = window.prompt('Cancellation notes (trade busted / errored — report withdrawn):');
        if (!notes) return;
        body.resolution_notes = notes;
        body.reason_code = 'trade_busted';
      }
      await api.post(`/trade-reporting/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Trade-Repository Reporting &amp; Reconciliation — FMA 2012 + FSCA OTC Reporting</h2>
          <p className="text-xs text-[#4a5568]">
            12-state lifecycle for every reportable transaction the desk executes: report due → generated →
            submitted to TR → acknowledged → reconciled → confirmed complete (+ TR rejection / correction
            re-report loop, dual-sided reconciliation breaks, exemption, bust). MIXED SLA: uniform T+1
            submission windows, materiality-graded reconciliation (OTC tightest). A late / missing report IS
            the FMA violation — SLA breach crosses to the FSCA for EVERY class; TR rejection for material
            classes; reconciliation break for OTC derivatives only.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"           value={kpis.total} />
        <Kpi label="Open"            value={kpis.open_count}    tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Breaks open"     value={kpis.break_open}    tone={kpis.break_open > 0 ? 'bad' : 'ok'} />
        <Kpi label="Rejected open"   value={kpis.rejected_open} tone={kpis.rejected_open > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"    value={kpis.breached}      tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="FSCA reportable" value={kpis.reportable_total} />
        <Kpi label="OTC open"        value={kpis.otc_open}      tone={kpis.otc_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Notional"        value={fmtZarM(kpis.total_notional_zar_m)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Confirmed: <span className="font-semibold text-[#1f5b3a]">{kpis.confirmed_count}</span></span>
        <span>Reconciled: <span className="font-semibold text-[#1f6b3a]">{kpis.reconciled_count}</span></span>
        <span>Exempted: <span className="font-semibold text-[#557]">{kpis.exempted_count}</span></span>
        <span>Cancelled: <span className="font-semibold text-[#557]">{kpis.cancelled_count}</span></span>
        <span>Collateral: <span className="font-semibold text-[#1a3a5c]">{fmtZarM(kpis.total_collateral_zar_m)}</span></span>
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Report #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Counterparty</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Product</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Notional</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">TR</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const klass = CLASS_TONE[r.report_class];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.report_number}
                      {r.source_wave && <span className="ml-1 text-[9px] text-[#8a93a0]">{r.source_wave}</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">{r.counterparty_name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: klass.bg, color: klass.fg }}>
                        {klass.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="text-[11px]">{r.product ?? '—'}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.energy_type ?? '—'} · {r.side ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtZarM(r.notional_zar_m)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-[#6b7685]">{r.trade_repository ?? '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No reports match.</td></tr>
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
  row: TradeReportRow;
  events: TradeReportEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: TradeReportRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canReject = REJECTABLE.includes(row.chain_status);
  const canBreak = BREAKABLE.includes(row.chain_status);
  const canCorrectFromBreak = CORRECTABLE_FROM_BREAK.includes(row.chain_status);
  const canExempt = EXEMPTABLE.includes(row.chain_status);
  const canCancel = CANCELLABLE.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.report_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.counterparty_name ?? row.product ?? 'Trade report'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {CLASS_TONE[row.report_class].label} · {row.product ?? '—'} · {row.energy_type ?? '—'} · {row.side ?? '—'}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Desk"               value={row.desk_party_name} />
            <Pair label="Trade repository"   value={row.trade_repository ?? '—'} />
            <Pair label="Class"              value={CLASS_TONE[row.report_class].label} />
            <Pair label="Product"            value={row.product ?? '—'} />
            <Pair label="Energy type"        value={row.energy_type ?? '—'} />
            <Pair label="Side"               value={row.side ?? '—'} />
            <Pair label="UTI"                value={row.uti ?? '—'} />
            <Pair label="Trade ref"          value={row.trade_ref ?? '—'} />
            <Pair label="Counterparty"       value={row.counterparty_name ?? '—'} />
            <Pair label="Counterparty LEI"   value={row.counterparty_lei ?? '—'} />
            <Pair label="Trade date"         value={row.trade_date ?? '—'} />
            <Pair label="Value date"         value={row.value_date ?? '—'} />
            <Pair label="Reporting deadline" value={fmtDate(row.reporting_deadline)} />
            <Pair label="Notional"           value={fmtZarM(row.notional_zar_m)} />
            <Pair label="Volume"             value={fmtMWh(row.volume_mwh)} />
            <Pair label="Price"              value={fmtPrice(row.price_zar_mwh)} />
            <Pair label="Collateral"         value={fmtZarM(row.collateral_zar_m)} />
            <Pair label="Generation ref"     value={row.generation_ref ?? '—'} />
            <Pair label="Submission ref"     value={row.submission_ref ?? '—'} />
            <Pair label="Acknowledgement ref" value={row.acknowledgement_ref ?? '—'} />
            <Pair label="Reconciliation ref" value={row.reconciliation_ref ?? '—'} />
            <Pair label="Break ref"          value={row.break_ref ?? '—'} />
            <Pair label="Rejection ref"      value={row.rejection_ref ?? '—'} />
            <Pair label="Correction ref"     value={row.correction_ref ?? '—'} />
            <Pair label="Exemption ref"      value={row.exemption_ref ?? '—'} />
            <Pair label="Regulator ref"      value={row.regulator_ref ?? '—'} />
            <Pair label="Resubmissions"      value={String(row.resubmission_count)} />
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="Escalation"         value={String(row.escalation_level)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"         value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Report due"         value={fmtDate(row.report_due_at)} />
            <Pair label="Reason code"        value={row.reason_code ?? '—'} />
            {row.source_wave && <Pair label="Provenance" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />}
          </div>
          {row.generation_basis && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Generation basis</div>
              {row.generation_basis}
            </div>
          )}
          {row.submission_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Submission basis</div>
              {row.submission_basis}
            </div>
          )}
          {row.reconciliation_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Reconciliation basis</div>
              {row.reconciliation_basis}
            </div>
          )}
          {row.break_basis && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">Break basis</div>
              {row.break_basis}
            </div>
          )}
          {row.rejection_basis && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">Rejection basis</div>
              {row.rejection_basis}
            </div>
          )}
          {row.correction_basis && (
            <div className="mt-2 rounded border border-[#fbe7d0] bg-[#fffaf0] px-3 py-2 text-[12px] text-[#7a4500]">
              <div className="text-[10px] uppercase tracking-wider text-[#a06200] mb-1">Correction basis</div>
              {row.correction_basis}
            </div>
          )}
          {row.exemption_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Exemption basis</div>
              {row.exemption_basis}
            </div>
          )}
          {row.resolution_notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Resolution notes</div>
              {row.resolution_notes}
            </div>
          )}
        </section>

        {(nextAction || canReject || canBreak || canCorrectFromBreak || canExempt || canCancel) && (
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
              {canBreak && (
                <button type="button"
                  onClick={() => onAct('flag-break', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['flag-break']}
                </button>
              )}
              {canReject && (
                <button type="button"
                  onClick={() => onAct('reject', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject']}
                </button>
              )}
              {canCorrectFromBreak && (
                <button type="button"
                  onClick={() => onAct('correct', row)}
                  className="rounded border border-[#e0b070] bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4a00] hover:bg-[#fffaf0]"
                >
                  {ACTION_LABEL['correct']}
                </button>
              )}
              {canExempt && (
                <button type="button"
                  onClick={() => onAct('exempt', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['exempt']}
                </button>
              )}
              {canCancel && (
                <button type="button"
                  onClick={() => onAct('cancel', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['cancel']}
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
                  <div className="flex items-center gap-2">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="inline-block rounded bg-[#eef1f5] px-1.5 py-0.5 text-[10px] font-medium text-[#445]">{e.actor_party}</span>
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

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}

export default TradeReportingChainTab;
