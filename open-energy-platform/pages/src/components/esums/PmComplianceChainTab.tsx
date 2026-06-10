// Wave 59 — Esums Preventive-Maintenance Schedule Compliance & Deferral chain tab.
//
// A single scheduled PM task instance on the maintenance calendar (IEC 62446 /
// 61724 + REIPPPP O&M service-agreement PM-program discipline). The PROACTIVE
// counterpart UPSTREAM of W51 availability guarantee and W24 PR underperformance:
// keeping PMs on schedule is what keeps availability and PR within guarantee. A
// skipped safety-critical PM is the leading indicator of the shortfall W51 books.
//
//   • KPI strip: total / open / in-progress / SLA breached / critical open /
//     skipped / deferred
//   • Filter pills by criticality tier + chain state + SLA breach + reportable
//   • Listing with tier pill + URGENT SLA countdown (more critical = tighter)
//   • Drill-down: timeline (owner/contractor party tags) + per-state actions
//
// Single-party write: Esums O&M operators record every party's action; the
// actor_party tag records whether the asset owner or the O&M contractor performed
// the contractual function. No create form — cases originate from WO-dispatch
// escalation / maintenance-calendar rollups and the operator field workflow.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'pm_scheduled' | 'work_assigned' | 'in_progress' | 'on_hold' | 'completed'
  | 'verification_pending' | 'rework_required' | 'deferral_requested'
  | 'closed' | 'deferred' | 'skipped' | 'cancelled';

type CriticalityTier =
  | 'routine' | 'standard' | 'significant' | 'critical' | 'safety_critical';

interface PmRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  owner_party_name: string;
  contractor_party_name: string;
  site_name: string;
  site_province: string | null;
  technology: string;
  asset_tag: string | null;
  asset_class: string | null;
  contract_ref: string | null;
  pm_code: string | null;
  pm_title: string;
  pm_frequency: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  deferred_to_date: string | null;
  criticality_score: number;
  criticality_tier: CriticalityTier;
  checklist_total_items: number | null;
  checklist_passed_items: number | null;
  labour_hours: number | null;
  estimated_cost_zar: number | null;
  actual_cost_zar: number | null;
  assignment_ref: string | null;
  completion_ref: string | null;
  verification_ref: string | null;
  rework_ref: string | null;
  deferral_ref: string | null;
  skip_ref: string | null;
  regulator_ref: string | null;
  assignment_basis: string | null;
  hold_basis: string | null;
  completion_basis: string | null;
  verification_basis: string | null;
  rework_basis: string | null;
  deferral_basis: string | null;
  skip_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  rework_round: number;
  deferral_round: number;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
  created_at: string;
}

interface PmEvent {
  id: string;
  pm_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiData {
  total: number;
  open_count: number;
  closed_count: number;
  in_progress_count: number;
  on_hold_count: number;
  verification_count: number;
  rework_count: number;
  deferral_open_count: number;
  deferred_count: number;
  skipped_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  critical_open: number;
  total_estimated_cost_zar: number;
  total_actual_cost_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  pm_scheduled:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Scheduled' },
  work_assigned:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Work assigned' },
  in_progress:          { bg: '#fff4d6', fg: '#a06200', label: 'In progress' },
  on_hold:              { bg: '#fff4d6', fg: '#a06200', label: 'On hold' },
  completed:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Completed' },
  verification_pending: { bg: '#fff4d6', fg: '#a06200', label: 'Verification pending' },
  rework_required:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rework required' },
  deferral_requested:   { bg: '#fff4d6', fg: '#a06200', label: 'Deferral requested' },
  closed:               { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
  deferred:             { bg: '#e3e7ec', fg: '#557',    label: 'Deferred' },
  skipped:              { bg: '#fbd0d0', fg: '#7a1414', label: 'Skipped' },
  cancelled:            { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<CriticalityTier, { bg: string; fg: string; label: string }> = {
  routine:         { bg: '#e3e7ec', fg: '#557',    label: 'Routine' },
  standard:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard' },
  significant:     { bg: '#fff4d6', fg: '#a06200', label: 'Significant' },
  critical:        { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  safety_critical: { bg: '#fbd0d0', fg: '#7a1414', label: 'Safety-critical' },
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  asset_owner:   { bg: '#dbecfb', fg: '#1a3a5c' },
  om_contractor: { bg: '#fff4d6', fg: '#a06200' },
  system:        { bg: '#e3e7ec', fg: '#557' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',               label: 'Active (pre-terminal)' },
  { key: 'all',                  label: 'All' },
  { key: 'safety_critical',      label: 'Safety-critical' },
  { key: 'critical',             label: 'Critical' },
  { key: 'significant',          label: 'Significant' },
  { key: 'standard',             label: 'Standard' },
  { key: 'routine',              label: 'Routine' },
  { key: 'work_assigned',        label: 'Work assigned' },
  { key: 'in_progress',          label: 'In progress' },
  { key: 'on_hold',              label: 'On hold' },
  { key: 'verification_pending', label: 'Verification' },
  { key: 'rework_required',      label: 'Rework' },
  { key: 'deferral_requested',   label: 'Deferral requested' },
  { key: 'deferred',             label: 'Deferred' },
  { key: 'skipped',              label: 'Skipped' },
  { key: 'closed',               label: 'Closed' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'reportable',           label: 'Reportable' },
];

const TIERS = new Set<string>(['routine', 'standard', 'significant', 'critical', 'safety_critical']);

function fmtZar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

export function PmComplianceChainTab() {
  const [rows, setRows] = useState<PmRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<PmRow | null>(null);
  const [events, setEvents] = useState<PmEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: PmRow[] } }>('/pm-compliance/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PM compliance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: PmRow; events: PmEvent[] } }>(`/pm-compliance/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PM history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (TIERS.has(filter))       return r.criticality_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/pm-compliance/chain/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-3">
        <Kpi label="Total" value={kpis?.total ?? 0} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="In progress" value={kpis?.in_progress_count ?? 0} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Critical open" value={kpis?.critical_open ?? 0} tone={(kpis?.critical_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Skipped" value={kpis?.skipped_count ?? 0} tone={(kpis?.skipped_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Deferred" value={kpis?.deferred_count ?? 0} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#c2873a] text-white border-[#1a3a5c]'
                : 'bg-white text-[#4a5568] border-[#dde4ec] hover:bg-[#eef2f7]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="px-3 py-2 bg-red-50 text-red-700 text-[12px] rounded-md">{err}</div>}

      <div className="bg-white border border-[#e5ebf2] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f7f9fb] text-[11px] uppercase tracking-wide text-[#6b7685]">
            <tr>
              <th className="px-3 py-2 text-left">Case #</th>
              <th className="px-3 py-2 text-left">Site / PM task</th>
              <th className="px-3 py-2 text-left">Contractor</th>
              <th className="px-3 py-2 text-left">Asset</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Δ SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">No PM tasks match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.criticality_tier];
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.case_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.site_name} · ${r.pm_title}`}>
                    {r.site_name}<span className="text-[#6b7685]"> · {r.pm_title}</span>
                  </td>
                  <td className="px-3 py-2 text-[#4a5568] max-w-[12rem] truncate" title={r.contractor_party_name}>{r.contractor_party_name}</td>
                  <td className="px-3 py-2 text-[#4a5568] text-[12px] max-w-[10rem] truncate" title={`${r.asset_class ?? ''} ${r.asset_tag ?? ''}`.trim()}>
                    {r.asset_class ?? '—'}{r.asset_tag ? ` · ${r.asset_tag}` : ''}
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: tierTone.bg, color: tierTone.fg }}>
                      {tierTone.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: stateTone.bg, color: stateTone.fg }}>
                      {stateTone.label}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                    {r.is_terminal ? '—' : fmtMin(r.minutes_until_sla)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <PmDrawer
          row={selected}
          events={events}
          onClose={() => { setSelected(null); setEvents([]); }}
          doAction={doAction}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone = 'ok', small = false }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad'; small?: boolean }) {
  const fg = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0f1c2e';
  return (
    <div className="bg-white border border-[#e5ebf2] rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className={small ? 'text-[15px] font-semibold tabular-nums mt-0.5' : 'text-[20px] font-semibold tabular-nums mt-0.5'} style={{ color: fg }}>{value}</div>
    </div>
  );
}

function PmDrawer({
  row, events, onClose, doAction,
}: {
  row: PmRow;
  events: PmEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_terminal;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-stretch justify-end oe-overlay-in" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl shadow-xl overflow-y-auto oe-drawer-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">PM task {row.case_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.site_name} · {row.pm_title}
            </h3>
            <div className="flex flex-wrap gap-2 mt-2 text-[12px]">
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: TIER_TONE[row.criticality_tier].bg, color: TIER_TONE[row.criticality_tier].fg }}>
                {TIER_TONE[row.criticality_tier].label}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: STATE_TONE[cs].bg, color: STATE_TONE[cs].fg }}>
                {STATE_TONE[cs].label}
              </span>
              {row.is_reportable && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">✕</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="grid grid-cols-2 gap-4">
            <Pair label="Asset owner" value={row.owner_party_name} />
            <Pair label="O&M contractor" value={row.contractor_party_name} />
            <Pair label="Technology" value={row.technology} />
            {row.site_province && <Pair label="Province" value={row.site_province} />}
            {row.asset_class && <Pair label="Asset class" value={row.asset_class} />}
            {row.asset_tag && <Pair label="Asset tag" value={row.asset_tag} />}
            {row.pm_code && <Pair label="PM code" value={row.pm_code} />}
            {row.pm_frequency && <Pair label="Frequency" value={row.pm_frequency} />}
            <Pair label="Criticality" value={`${row.criticality_score} / 100`} />
            {row.contract_ref && <Pair label="O&M contract" value={row.contract_ref} />}
            {row.scheduled_date && <Pair label="Scheduled" value={row.scheduled_date} />}
            {row.window_end && <Pair label="Window closes" value={row.window_end} />}
            {row.deferred_to_date && <Pair label="Deferred to" value={row.deferred_to_date} />}
            {row.checklist_total_items != null && (
              <Pair label="Checklist" value={`${row.checklist_passed_items ?? 0} / ${row.checklist_total_items} passed`} />
            )}
            {row.labour_hours != null && <Pair label="Labour" value={`${row.labour_hours} h`} />}
          </div>

          {row.assignment_basis && <Pair label="Assignment basis" value={row.assignment_basis} />}
          {row.hold_basis && <Pair label="Hold basis" value={row.hold_basis} />}
          {row.completion_basis && <Pair label="Completion basis" value={row.completion_basis} />}
          {row.verification_basis && <Pair label="Verification basis" value={row.verification_basis} />}
          {row.rework_basis && <Pair label="Rework basis" value={row.rework_basis} />}
          {row.deferral_basis && <Pair label="Deferral basis" value={row.deferral_basis} />}
          {row.skip_basis && <Pair label="Skip basis" value={row.skip_basis} />}
          {row.reason_code && <Pair label="Reason code" value={row.reason_code} />}
          {row.notes && <Pair label="Notes" value={row.notes} />}

          <div className="grid grid-cols-2 gap-4">
            {row.estimated_cost_zar != null && <Pair label="Estimated cost" value={fmtZar(row.estimated_cost_zar)} />}
            {row.actual_cost_zar != null && <Pair label="Actual cost" value={fmtZar(row.actual_cost_zar)} />}
            {row.rework_round > 0 && <Pair label="Rework round" value={String(row.rework_round)} />}
            {row.deferral_round > 0 && <Pair label="Deferral round" value={String(row.deferral_round)} />}
            {row.regulator_ref && <Pair label="Regulator ref" value={row.regulator_ref} />}
          </div>

          {row.source_wave && (
            <Pair label="Provenance" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`} />
          )}

          {row.sla_deadline_at && !row.is_terminal && (
            <Pair label="Next SLA" value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`} />
          )}

          {transitionable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {cs === 'pm_scheduled' && (
                  <ActionBtn label="Assign work (owner)" onClick={() => {
                    const ref = window.prompt('Assignment reference (optional):') ?? undefined;
                    const basis = window.prompt('Assignment basis (optional):') ?? undefined;
                    void doAction('assign-work', { assignment_ref: ref, assignment_basis: basis });
                  }} />
                )}
                {(cs === 'work_assigned' || cs === 'on_hold' || cs === 'rework_required') && (
                  <ActionBtn label="Start work (contractor)" onClick={() => {
                    const h = window.prompt('Labour hours so far (optional):') ?? undefined;
                    void doAction('start-work', h ? { labour_hours: Number(h) } : {});
                  }} />
                )}
                {cs === 'in_progress' && (
                  <ActionBtn label="Place on hold (contractor)" onClick={() => {
                    const basis = window.prompt('Hold basis (e.g. awaiting spares / access):') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('place-on-hold', { hold_basis: basis, reason_code: rc });
                  }} />
                )}
                {cs === 'in_progress' && (
                  <ActionBtn label="Complete work (contractor)" tone="good" onClick={() => {
                    const total = window.prompt('Checklist total items (optional):') ?? undefined;
                    const passed = window.prompt('Checklist passed items (optional):') ?? undefined;
                    const cost = window.prompt('Actual cost (ZAR, optional):') ?? undefined;
                    const basis = window.prompt('Completion basis (optional):') ?? undefined;
                    void doAction('complete-work', {
                      checklist_total_items: total ? Number(total) : undefined,
                      checklist_passed_items: passed ? Number(passed) : undefined,
                      actual_cost_zar: cost ? Number(cost) : undefined,
                      completion_basis: basis,
                    });
                  }} />
                )}
                {cs === 'completed' && (
                  <ActionBtn label="Open verification (owner)" onClick={() => {
                    const ref = window.prompt('Verification reference (optional):') ?? undefined;
                    const basis = window.prompt('Verification basis (optional):') ?? undefined;
                    void doAction('open-verification', { verification_ref: ref, verification_basis: basis });
                  }} />
                )}
                {cs === 'verification_pending' && (
                  <ActionBtn label="Close PM (owner)" tone="good" onClick={() => {
                    const ref = window.prompt('Verification reference (optional):') ?? undefined;
                    const basis = window.prompt('Verification basis (optional):') ?? undefined;
                    void doAction('close-pm', { verification_ref: ref, verification_basis: basis });
                  }} />
                )}
                {cs === 'verification_pending' && (
                  <ActionBtn label="Require rework (owner)" tone="bad" onClick={() => {
                    const basis = window.prompt('Rework basis (deficiencies found):') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('require-rework', { rework_basis: basis, reason_code: rc });
                  }} />
                )}
                {(cs === 'pm_scheduled' || cs === 'work_assigned' || cs === 'on_hold') && (
                  <ActionBtn label="Request deferral (contractor)" onClick={() => {
                    const to = window.prompt('Deferred-to date (YYYY-MM-DD):') ?? undefined;
                    const basis = window.prompt('Deferral basis:') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('request-deferral', { deferred_to_date: to, deferral_basis: basis, reason_code: rc });
                  }} />
                )}
                {cs === 'deferral_requested' && (
                  <ActionBtn label="Approve deferral (owner)" onClick={() => {
                    const to = window.prompt('Deferred-to date (YYYY-MM-DD):') ?? undefined;
                    const basis = window.prompt('Deferral basis (optional):') ?? undefined;
                    const reg = window.prompt('Regulator reference (safety-critical only, optional):') ?? undefined;
                    void doAction('approve-deferral', { deferred_to_date: to, deferral_basis: basis, regulator_ref: reg });
                  }} />
                )}
                {cs === 'deferral_requested' && (
                  <ActionBtn label="Reject deferral (owner)" tone="bad" onClick={() => {
                    const basis = window.prompt('Rejection basis:') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('reject-deferral', { deferral_basis: basis, reason_code: rc });
                  }} />
                )}
                {(cs === 'pm_scheduled' || cs === 'work_assigned' || cs === 'on_hold' || cs === 'deferral_requested') && (
                  <ActionBtn label="Skip PM (owner)" tone="bad" onClick={() => {
                    const basis = window.prompt('Skip basis (window lapsed unexecuted):') ?? undefined;
                    const reg = window.prompt('Regulator reference (critical / safety only, optional):') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('skip-pm', { skip_basis: basis, regulator_ref: reg, reason_code: rc });
                  }} />
                )}
                {(cs === 'pm_scheduled' || cs === 'work_assigned') && (
                  <ActionBtn label="Cancel PM (owner)" onClick={() => {
                    const rc = window.prompt('Reason code (no longer applicable):') ?? undefined;
                    void doAction('cancel-pm', rc ? { reason_code: rc } : {});
                  }} />
                )}
              </div>
            </div>
          )}

          <div className="border-t border-[#eef2f6] pt-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Timeline</div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-[12px] text-[#6b7685]">No events yet.</div>
              ) : events.map((e) => {
                const partyTone = PARTY_TONE[e.actor_party ?? 'system'] ?? PARTY_TONE.system;
                return (
                  <div key={e.id} className="flex gap-3 text-[12px] border-l-2 border-[#e5ebf2] pl-3 py-1">
                    <span className="font-mono text-[11px] text-[#6b7685] whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</span>
                    <div>
                      <span className="font-semibold text-[#0f1c2e]">{e.event_type}</span>
                      {e.actor_party && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase" style={{ background: partyTone.bg, color: partyTone.fg }}>
                          {e.actor_party}
                        </span>
                      )}
                      {e.from_status && e.to_status && e.from_status !== e.to_status && (
                        <span className="text-[#6b7685]"> · {e.from_status} → {e.to_status}</span>
                      )}
                      {e.notes && <div className="text-[#4a5568] mt-0.5">{e.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="text-[#0f1c2e] mt-0.5">{value}</div>
    </div>
  );
}

function ActionBtn({ label, onClick, tone = 'neutral' }: { label: string; onClick: () => void; tone?: 'neutral' | 'good' | 'bad' }) {
  const bg = tone === 'good' ? 'bg-emerald-700' : tone === 'bad' ? 'bg-red-700' : 'bg-[#c2873a]';
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
  );
}
