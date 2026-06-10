// Wave 28 — Grid Connection Agreement (UNGCA) chain — NERSA Grid Code C-1.
//
// 10-state lifecycle (+ 2 terminals) for the connection agreement every IPP
// must execute with Eskom Transmission / Distribution before COD. Mounted on
// both the IPP workstation (IPP team submits applications + accepts cost) and
// the Grid operator workstation (Grid Code C-1 reviewers issue studies / cost
// estimates / energise / reject).
//
//   • KPI strip: total / studies open / cost phase / agreement / construction
//     / transmission open / breached / cost accepted total / capacity in service
//   • Filter pills by tier + state + reportable
//   • Listing with tier pill + MW + SLA countdown
//   • Drill-down: timeline + role-aware action button (11 transitions)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'application_filed' | 'studies_required' | 'studies_executing'
  | 'cost_estimate_issued' | 'cost_accepted'
  | 'connection_agreement_drafted' | 'executed'
  | 'construction' | 'energised' | 'in_service'
  | 'rejected' | 'withdrawn';

type Tier = 'transmission' | 'distribution' | 'embedded';

interface GcaRow {
  id: string;
  case_number: string;
  project_id: string;
  project_name: string;
  ipp_party: string;
  network_party: string;
  connection_tier: Tier;
  voltage_kv: number;
  poc_substation: string;
  capacity_mw: number;
  technology: string;
  gia_ref: string | null;
  cost_estimate_zar: number | null;
  cost_accepted_zar: number | null;
  ungca_ref: string | null;
  energisation_date_planned: string | null;
  energisation_date_actual: string | null;
  rod_reason: string | null;
  withdrawal_reason: string | null;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: ChainStatus;
  application_filed_at: string;
  studies_required_at: string | null;
  studies_executing_at: string | null;
  cost_estimate_issued_at: string | null;
  cost_accepted_at: string | null;
  connection_agreement_drafted_at: string | null;
  executed_at: string | null;
  construction_at: string | null;
  energised_at: string | null;
  in_service_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  closure_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
  created_by: string;
  created_at: string;
}

interface GcaEvent {
  id: string;
  gca_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  application_filed:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'Application filed' },
  studies_required:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Studies required' },
  studies_executing:            { bg: '#fff4d6', fg: '#a06200', label: 'Studies executing' },
  cost_estimate_issued:         { bg: '#fff4d6', fg: '#a06200', label: 'Cost estimate issued' },
  cost_accepted:                { bg: '#daf5e2', fg: '#1f6b3a', label: 'Cost accepted' },
  connection_agreement_drafted: { bg: '#daf5e2', fg: '#1f6b3a', label: 'UNGCA drafted' },
  executed:                     { bg: '#daf5e2', fg: '#1f6b3a', label: 'UNGCA executed' },
  construction:                 { bg: '#ffe4b5', fg: '#8a4a00', label: 'Construction' },
  energised:                    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Energised' },
  in_service:                   { bg: '#cfe6d3', fg: '#1f5b3a', label: 'In service' },
  rejected:                     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  withdrawn:                    { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  transmission: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Transmission' },
  distribution: { bg: '#fff4d6', fg: '#a06200', label: 'Distribution' },
  embedded:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Embedded SSEG' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                       label: 'Active' },
  { key: 'all',                          label: 'All' },
  { key: 'reportable',                   label: 'Transmission (NERSA C-1)' },
  { key: 'transmission',                 label: 'Transmission' },
  { key: 'distribution',                 label: 'Distribution' },
  { key: 'embedded',                     label: 'Embedded' },
  { key: 'breached',                     label: 'SLA breached' },
  { key: 'application_filed',            label: 'Applied' },
  { key: 'studies_required',             label: 'Studies req' },
  { key: 'studies_executing',            label: 'Studies exec' },
  { key: 'cost_estimate_issued',         label: 'Cost issued' },
  { key: 'cost_accepted',                label: 'Cost accepted' },
  { key: 'connection_agreement_drafted', label: 'UNGCA drafted' },
  { key: 'executed',                     label: 'Executed' },
  { key: 'construction',                 label: 'Construction' },
  { key: 'energised',                    label: 'Energised' },
  { key: 'in_service',                   label: 'In service' },
  { key: 'rejected',                     label: 'Rejected' },
  { key: 'withdrawn',                    label: 'Withdrawn' },
];

type ActionKind =
  | 'request-studies' | 'begin-studies' | 'issue-cost-estimate'
  | 'accept-cost' | 'draft-agreement' | 'execute-agreement'
  | 'begin-construction' | 'energise' | 'commission'
  | 'reject' | 'withdraw';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  application_filed:            'request-studies',
  studies_required:             'begin-studies',
  studies_executing:            'issue-cost-estimate',
  cost_estimate_issued:         'accept-cost',
  cost_accepted:                'draft-agreement',
  connection_agreement_drafted: 'execute-agreement',
  executed:                     'begin-construction',
  construction:                 'energise',
  energised:                    'commission',
  in_service:                   null,
  rejected:                     null,
  withdrawn:                    null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'request-studies':     'Request studies (Grid)',
  'begin-studies':       'Begin GIA studies (Grid)',
  'issue-cost-estimate': 'Issue cost estimate (Grid)',
  'accept-cost':         'Accept cost (IPP)',
  'draft-agreement':     'Draft UNGCA (Grid)',
  'execute-agreement':   'Sign UNGCA (IPP)',
  'begin-construction':  'Mobilise construction (IPP)',
  'energise':            'Energise connection (Grid)',
  'commission':          'Commission to service (Grid)',
  'reject':              'Reject application (Grid)',
  'withdraw':            'Withdraw application (IPP)',
};

const REJECTABLE: ChainStatus[] = [
  'application_filed', 'studies_required', 'studies_executing', 'cost_estimate_issued',
];

const WITHDRAWABLE: ChainStatus[] = [
  'application_filed', 'studies_required', 'studies_executing',
  'cost_estimate_issued', 'cost_accepted', 'connection_agreement_drafted',
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

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(0)}m`;
  if (Math.abs(n) >= 1_000)     return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtMW(n: number): string {
  if (n < 1) return `${(n * 1000).toFixed(0)}kW`;
  return `${n}MW`;
}

export function GcaChainTab() {
  const [rows, setRows] = useState<GcaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<GcaRow | null>(null);
  const [events, setEvents] = useState<GcaEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: GcaRow[] } }>('/gca/connection-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load GCA chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: GcaRow; events: GcaEvent[] } }>(`/gca/connection-chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load GCA case history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'transmission' || filter === 'distribution' || filter === 'embedded') {
        return r.connection_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let studies = 0, cost_phase = 0, agreement = 0, construction_ph = 0;
    let transmission = 0, breached = 0;
    let cost_total = 0, mw_service = 0;
    for (const r of rows) {
      if (r.chain_status === 'studies_required' || r.chain_status === 'studies_executing') studies++;
      if (r.chain_status === 'cost_estimate_issued' || r.chain_status === 'cost_accepted') cost_phase++;
      if (r.chain_status === 'connection_agreement_drafted') agreement++;
      if (r.chain_status === 'construction' || r.chain_status === 'energised') construction_ph++;
      if (r.connection_tier === 'transmission' && !r.is_terminal) transmission++;
      if (r.sla_breached && !r.is_terminal) breached++;
      cost_total += r.cost_accepted_zar || 0;
      if (r.chain_status === 'in_service') mw_service += r.capacity_mw || 0;
    }
    return {
      total: rows.length, studies, cost_phase, agreement, construction_ph,
      transmission, breached, cost_total, mw_service,
    };
  }, [rows]);

  const act = useCallback(async (action: ActionKind, row: GcaRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'begin-studies') {
        const ref = window.prompt('GIA / load-flow study reference (e.g. GIA-ESK-2026-0142):', row.gia_ref ?? '');
        if (ref) body.gia_ref = ref;
      } else if (action === 'issue-cost-estimate') {
        const amt = window.prompt('Cost estimate (ZAR):');
        if (!amt) return;
        body.cost_estimate_zar = Number(amt);
        const ref = window.prompt('GIA reference (optional):', row.gia_ref ?? '');
        if (ref) body.gia_ref = ref;
      } else if (action === 'accept-cost') {
        const amt = window.prompt('Accepted cost (ZAR — typically matches estimate):', String(row.cost_estimate_zar ?? ''));
        if (!amt) return;
        body.cost_accepted_zar = Number(amt);
      } else if (action === 'execute-agreement') {
        const ref = window.prompt('UNGCA reference (e.g. UNGCA-ESK-2026-0017):');
        if (!ref) return;
        body.ungca_ref = ref;
        if (row.connection_tier === 'transmission') {
          const auth = window.prompt('Regulator (NERSA for transmission):', 'NERSA');
          if (auth) body.regulator_authority = auth;
          const regRef = window.prompt('NERSA C-1 acknowledgement reference (e.g. NERSA-C1-2026-0142):');
          if (regRef) body.regulator_ref = regRef;
        }
      } else if (action === 'energise') {
        const dt = window.prompt('Actual energisation date (ISO, optional — defaults to now):');
        if (dt) body.energisation_date_actual = dt;
      } else if (action === 'reject') {
        const reason = window.prompt('Reason for rejection (grid stability / load / phasing):');
        if (!reason) return;
        body.rod_reason = reason;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Reason for withdrawal:');
        if (!reason) return;
        body.withdrawal_reason = reason;
      }
      await api.post(`/gca/connection-chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Grid Connection Agreement (UNGCA) chain — NERSA Grid Code C-1</h2>
          <p className="text-xs text-[#4a5568]">
            10-state lifecycle every IPP executes with Eskom Transmission/Distribution before COD: application →
            studies → cost estimate → cost accepted → UNGCA drafted → executed → construction → energised → in service.
            Inverted SLA tiers (transmission gets 730d construction window vs 90d embedded); transmission +
            distribution rejections + SLA breaches cross to NERSA inbox.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"            value={kpis.total} />
        <Kpi label="Studies open"     value={kpis.studies} />
        <Kpi label="Cost phase"       value={kpis.cost_phase} />
        <Kpi label="UNGCA drafted"    value={kpis.agreement} />
        <Kpi label="Construction"     value={kpis.construction_ph}        tone={kpis.construction_ph > 0 ? 'warn' : 'ok'} />
        <Kpi label="Transmission act" value={kpis.transmission}           tone={kpis.transmission > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached"     value={kpis.breached}               tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cost accepted"    value={fmtZar(kpis.cost_total)} />
      </div>

      <div className="mb-3 text-[11px] text-[#4a5568]">
        Capacity in service: <span className="font-semibold text-[#1f6b3a]">{kpis.mw_service.toLocaleString('en-ZA')} MW</span>
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">MW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">kV</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">PoC</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Reg ref</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Cost</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.connection_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">{r.case_number}</td>
                    <td className="px-3 py-2 text-[#1a3a5c]">{r.project_name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtMW(r.capacity_mw)}</td>
                    <td className="px-3 py-2 tabular-nums text-[#4a5568]">{r.voltage_kv}</td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.poc_substation}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#4a5568]">{r.regulator_ref ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZar(r.cost_accepted_zar ?? r.cost_estimate_zar)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No GCA cases match.</td></tr>
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
  row: GcaRow;
  events: GcaEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: GcaRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canReject = REJECTABLE.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE.includes(row.chain_status);

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
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.connection_tier].label} · {fmtMW(row.capacity_mw)} {row.technology} · {row.voltage_kv}kV @ {row.poc_substation}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Project"            value={row.project_id} />
            <Pair label="IPP party"          value={row.ipp_party} />
            <Pair label="Network party"      value={row.network_party} />
            <Pair label="Connection tier"    value={TIER_TONE[row.connection_tier].label} />
            <Pair label="Voltage"            value={`${row.voltage_kv} kV`} />
            <Pair label="Substation"         value={row.poc_substation} />
            <Pair label="Capacity"           value={fmtMW(row.capacity_mw)} />
            <Pair label="Technology"         value={row.technology} />
            <Pair label="GIA ref"            value={row.gia_ref ?? '—'} />
            <Pair label="Cost estimate"      value={fmtZar(row.cost_estimate_zar)} />
            <Pair label="Cost accepted"      value={fmtZar(row.cost_accepted_zar)} />
            <Pair label="UNGCA ref"          value={row.ungca_ref ?? '—'} />
            <Pair label="Energisation planned" value={fmtDate(row.energisation_date_planned)} />
            <Pair label="Energisation actual"  value={fmtDate(row.energisation_date_actual)} />
            <Pair label="Regulator"          value={row.regulator_authority ?? '—'} />
            <Pair label="Regulator ref"      value={row.regulator_ref ?? '—'} />
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="Escalation"         value={String(row.escalation_level)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"         value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
          </div>
          {row.rod_reason && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="text-[10px] uppercase tracking-wider mb-1">Rejection reason</div>
              {row.rod_reason}
            </div>
          )}
          {row.withdrawal_reason && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Withdrawal reason</div>
              {row.withdrawal_reason}
            </div>
          )}
          {row.closure_notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Closure notes</div>
              {row.closure_notes}
            </div>
          )}
        </section>

        {(nextAction || canReject || canWithdraw) && (
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
              {canReject && (
                <button type="button"
                  onClick={() => onAct('reject', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.reject}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
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

export default GcaChainTab;
