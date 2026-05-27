// Wave 20 — IPP construction → COD certification chain tab.
//
// 10-state P6 chain layered on oe_cod_chain. Per-capacity-tier SLA tiering
// (large ≥100MW / medium 10-100MW / small <10MW — bigger projects get more
// time per real construction durations). Large-tier certify_cod + cancel +
// SLA-breach cross into regulator inbox per NERSA §C-5 + DMRE registry.
//
//   • KPI strip: total / large open / in_construction / certified / breached / cancelled
//   • Filter pills by chain state + tier + breached/escalated
//   • Listing with tier pill + state pill + SLA countdown + MW
//   • Drill-down: timeline + per-state action buttons + cancel + IE certify modal

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'draft' | 'epc_signed' | 'ntp_issued' | 'mobilization'
  | 'mechanical_complete' | 'cold_commissioning' | 'grid_synchronized'
  | 'reliability_run' | 'cod_certified' | 'cancelled';

type Tier = 'large' | 'medium' | 'small';

interface CodRow {
  id: string;
  cod_number: string;
  project_id: string | null;
  participant_id: string;
  project_name: string;
  epc_contract_id: string | null;
  epc_contractor_name: string | null;
  capacity_mw: number;
  capacity_tier: Tier;
  chain_status: ChainStatus;
  target_cod_date: string | null;
  actual_cod_date: string | null;
  epc_signed_at: string | null;
  ntp_issued_at: string | null;
  mobilization_at: string | null;
  mechanical_complete_at: string | null;
  cold_comm_at: string | null;
  grid_sync_at: string | null;
  reliability_run_at: string | null;
  cod_certified_at: string | null;
  ie_certifier: string | null;
  ie_cert_doc_ref: string | null;
  nersa_scada_ref: string | null;
  cancellation_reason: string | null;
  construction_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  sla_breached?: boolean;
  minutes_until_sla?: number | null;
  is_terminal?: boolean;
  created_at: string;
}

interface CodEvent {
  id: string;
  cod_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  draft:                { bg: '#e3e7ec', fg: '#557',    label: 'Draft' },
  epc_signed:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'EPC signed' },
  ntp_issued:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'NTP issued' },
  mobilization:         { bg: '#fff4d6', fg: '#a06200', label: 'Mobilisation' },
  mechanical_complete:  { bg: '#fff4d6', fg: '#a06200', label: 'Mechanical complete' },
  cold_commissioning:   { bg: '#fff4d6', fg: '#a06200', label: 'Cold commissioning' },
  grid_synchronized:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Grid synchronised' },
  reliability_run:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'Reliability run' },
  cod_certified:        { bg: '#d4edda', fg: '#155724', label: 'COD certified' },
  cancelled:            { bg: '#fde0e0', fg: '#9b1f1f', label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  large:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Large (≥100MW)' },
  medium: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Medium (10-100MW)' },
  small:  { bg: '#e3e7ec', fg: '#557',    label: 'Small (<10MW)' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',               label: 'Active' },
  { key: 'all',                  label: 'All' },
  { key: 'large',                label: 'Large' },
  { key: 'medium',               label: 'Medium' },
  { key: 'small',                label: 'Small' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'escalated',            label: 'Escalated' },
  { key: 'draft',                label: 'Draft' },
  { key: 'epc_signed',           label: 'EPC signed' },
  { key: 'ntp_issued',           label: 'NTP issued' },
  { key: 'mobilization',         label: 'Mobilisation' },
  { key: 'mechanical_complete',  label: 'Mech complete' },
  { key: 'cold_commissioning',   label: 'Cold comm' },
  { key: 'grid_synchronized',    label: 'Grid sync' },
  { key: 'reliability_run',      label: 'Reliability run' },
  { key: 'cod_certified',        label: 'COD certified' },
  { key: 'cancelled',            label: 'Cancelled' },
];

type PrimaryAction =
  | 'sign-epc' | 'issue-ntp' | 'mobilize' | 'mechanical-complete'
  | 'cold-commission' | 'grid-synchronize' | 'begin-reliability-run' | 'certify-cod';

const ACTION_FOR_STATE: Record<ChainStatus, PrimaryAction | null> = {
  draft:                'sign-epc',
  epc_signed:           'issue-ntp',
  ntp_issued:           'mobilize',
  mobilization:         'mechanical-complete',
  mechanical_complete:  'cold-commission',
  cold_commissioning:   'grid-synchronize',
  grid_synchronized:    'begin-reliability-run',
  reliability_run:      'certify-cod',
  cod_certified:        null,
  cancelled:            null,
};

const ACTION_LABEL: Record<PrimaryAction | 'cancel', string> = {
  'sign-epc':              'Sign EPC contract',
  'issue-ntp':             'Issue Notice to Proceed',
  'mobilize':              'Mobilise site',
  'mechanical-complete':   'Mechanical complete',
  'cold-commission':       'Cold commissioning',
  'grid-synchronize':      'Synchronise to grid',
  'begin-reliability-run': 'Begin reliability run',
  'certify-cod':           'Certify COD (IE sign-off)',
  'cancel':                'Cancel project',
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
  if (n >= 1000) return `${(n / 1000).toFixed(2)}GW`;
  return `${n}MW`;
}

export function CodChainTab() {
  const [rows, setRows] = useState<CodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<CodRow | null>(null);
  const [events, setEvents] = useState<CodEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CodRow[] } }>('/ipp/cod-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load COD chains');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { cod: CodRow; events: CodEvent[] } }>(
        `/ipp/cod-chain/${id}`
      );
      if (res.data?.data?.cod) setSelected(res.data.data.cod);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load COD history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')       return true;
      if (filter === 'active')    return !['cod_certified','cancelled'].includes(r.chain_status);
      if (filter === 'large')     return r.capacity_tier === 'large';
      if (filter === 'medium')    return r.capacity_tier === 'medium';
      if (filter === 'small')     return r.capacity_tier === 'small';
      if (filter === 'breached')  return r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let large_open = 0, breached = 0, escalated = 0, in_construction = 0, in_commissioning = 0;
    let cod_certified_count = 0, cancelled_count = 0, total_capacity_certified = 0;
    for (const r of rows) {
      if (r.capacity_tier === 'large' && !['cod_certified','cancelled'].includes(r.chain_status)) large_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (['ntp_issued','mobilization','mechanical_complete'].includes(r.chain_status)) in_construction++;
      if (['cold_commissioning','grid_synchronized','reliability_run'].includes(r.chain_status)) in_commissioning++;
      if (r.chain_status === 'cod_certified') {
        cod_certified_count++;
        total_capacity_certified += r.capacity_mw || 0;
      }
      if (r.chain_status === 'cancelled') cancelled_count++;
    }
    return { total: rows.length, large_open, breached, escalated, in_construction, in_commissioning, cod_certified_count, cancelled_count, total_capacity_certified };
  }, [rows]);

  const act = useCallback(async (action: PrimaryAction | 'cancel', row: CodRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'certify-cod') {
        const ie = window.prompt('Independent Engineer firm (e.g. Mott MacDonald):');
        if (!ie) return;
        const cert = window.prompt('IE certificate document reference (e.g. IE-CERT-2026-NAME-0001):');
        if (!cert) return;
        const actualCod = window.prompt('Actual COD date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
        if (!actualCod) return;
        const scada = row.capacity_tier === 'large'
          ? window.prompt('NERSA SCADA registration reference (large-tier only):') || ''
          : '';
        body = { ie_certifier: ie, ie_cert_doc_ref: cert, actual_cod_date: actualCod };
        if (scada) body.nersa_scada_ref = scada;
      } else if (action === 'cancel') {
        const reason = window.prompt('Reason for cancelling the project:');
        if (!reason) return;
        body = { reason };
      }
      await api.post(`/ipp/cod-chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">IPP construction → COD certification chain</h2>
          <p className="text-xs text-[#4a5568]">
            10-stage P6 chain · draft → EPC signed → NTP issued → mobilisation → mechanical complete →
            cold commissioning → grid synchronised → reliability run → COD certified. Per-capacity-tier SLA tiering
            (large ≥100MW / medium 10-100MW / small &lt;10MW — bigger projects get more time per real construction durations).
            Large-tier COD certification, cancellation, and SLA breaches escalate to the regulator inbox per NERSA Grid Code §C-5 + DMRE registry.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total projects" value={kpis.total} />
        <Kpi label="Large-tier open" value={kpis.large_open} tone={kpis.large_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="In construction" value={kpis.in_construction} />
        <Kpi label="COD certified" value={`${kpis.cod_certified_count} · ${fmtMw(kpis.total_capacity_certified)}`} />
        <Kpi label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cancelled" value={kpis.cancelled_count} tone={kpis.cancelled_count > 0 ? 'bad' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">COD #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Capacity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">EPC</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.capacity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">{r.cod_number}</td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={r.project_name}>{r.project_name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {r.capacity_tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtMw(r.capacity_mw)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] max-w-[180px] truncate" title={r.epc_contractor_name ?? ''}>
                      {r.epc_contractor_name ?? '—'}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No projects match.</td></tr>
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
  row: CodRow;
  events: CodEvent[];
  onClose: () => void;
  onAct: (action: PrimaryAction | 'cancel', row: CodRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canCancel  = !['cod_certified','cancelled'].includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[680px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.cod_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.capacity_tier].label} · {fmtMw(row.capacity_mw)} · EPC: {row.epc_contractor_name ?? '—'}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"            value={STATE_TONE[row.chain_status].label} />
            <Pair label="Capacity tier"    value={TIER_TONE[row.capacity_tier].label} />
            <Pair label="Capacity"         value={fmtMw(row.capacity_mw)} />
            <Pair label="EPC contractor"   value={row.epc_contractor_name ?? '—'} />
            <Pair label="Target COD"       value={fmtDate(row.target_cod_date)} />
            <Pair label="Actual COD"       value={fmtDate(row.actual_cod_date)} />
            <Pair label="EPC signed"       value={fmtDate(row.epc_signed_at)} />
            <Pair label="NTP issued"       value={fmtDate(row.ntp_issued_at)} />
            <Pair label="Mobilisation"     value={fmtDate(row.mobilization_at)} />
            <Pair label="Mechanical comp." value={fmtDate(row.mechanical_complete_at)} />
            <Pair label="Cold comm."       value={fmtDate(row.cold_comm_at)} />
            <Pair label="Grid sync"        value={fmtDate(row.grid_sync_at)} />
            <Pair label="Reliability run"  value={fmtDate(row.reliability_run_at)} />
            <Pair label="COD certified"    value={fmtDate(row.cod_certified_at)} />
            <Pair label="IE certifier"     value={row.ie_certifier ?? '—'} />
            <Pair label="IE cert ref"      value={row.ie_cert_doc_ref ?? '—'} />
            <Pair label="NERSA SCADA"      value={row.nersa_scada_ref ?? '—'} />
            <Pair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"       value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation"       value={String(row.escalation_level)} />
          </div>
          {row.cancellation_reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#9b1f1f]">Cancellation reason</div>
              <div className="text-[#9b1f1f]">{row.cancellation_reason}</div>
            </div>
          )}
          {row.construction_notes && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">Construction notes</div>
              <div className="text-[#1a3a5c] whitespace-pre-wrap">{row.construction_notes}</div>
            </div>
          )}
        </section>

        {(nextAction || canCancel) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canCancel && (
                <button
                  onClick={() => onAct('cancel', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.cancel}
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
                  {(e.from_status || e.to_status) && (
                    <div className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</div>
                  )}
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
