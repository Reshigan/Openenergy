// Wave 64 — Esums Permit-to-Work (PTW) / LOTO Authorisation & Isolation Control tab.
//
// The PROACTIVE safe-system-of-work gate every hazardous field intervention on a
// PV / wind asset must pass BEFORE it starts (OHSA 85/1993 s8 + Construction
// Regulations 2014 + Electrical/General Machinery Regulations + REIPPPP O&M).
// Complements W25 HSE incident (REACTIVE) and gates W16 WO-dispatch + W59 PM:
// no isolation-confirmed permit, no work.
//
//   • KPI strip: total / open / in-progress / SLA breached / top-tier open /
//     live-work / revoked
//   • Filter pills by hazard tier + chain state + SLA breach + live + reportable
//   • Listing with hazard-tier pill + LIVE flag + URGENT SLA countdown
//   • Drill-down: timeline (issuing-authority / permit-holder party tags) +
//     per-state actions (assess → isolate → verify → issue → work → close)
//
// Single-party write: Esums O&M operators record every party's action; the
// actor_party tag records whether the issuing authority or the permit holder
// performed the contractual function. No create form — permits originate from the
// WO-dispatch / PM field workflow.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'permit_requested' | 'hazard_assessment' | 'isolation_pending'
  | 'isolation_confirmed' | 'permit_issued' | 'work_in_progress' | 'suspended'
  | 'work_complete' | 'permit_closed' | 'permit_rejected' | 'permit_revoked'
  | 'withdrawn';

type HazardTier = 'low' | 'moderate' | 'high' | 'critical' | 'catastrophic';

type WorkClass =
  | 'electrical_live' | 'electrical_isolated' | 'working_at_height'
  | 'confined_space' | 'hot_work' | 'lifting' | 'excavation' | 'general';

interface PermitRow {
  id: string;
  permit_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  holder_party_name: string;
  authority_party_name: string;
  isolating_authority_name: string | null;
  asset_name: string | null;
  equipment_tag: string | null;
  work_location: string | null;
  work_description: string | null;
  work_class: WorkClass;
  method_statement_ref: string | null;
  hazard_score: number;
  hazard_tier: HazardTier;
  live_work: number;
  energy_sources: string | null;
  isolation_points: number | null;
  permit_validity_hours: number | null;
  request_ref: string | null;
  assessment_ref: string | null;
  isolation_plan_ref: string | null;
  isolation_cert_ref: string | null;
  permit_ref: string | null;
  suspension_ref: string | null;
  completion_ref: string | null;
  closure_ref: string | null;
  rejection_ref: string | null;
  revocation_ref: string | null;
  withdrawal_ref: string | null;
  regulator_ref: string | null;
  request_basis: string | null;
  assessment_basis: string | null;
  isolation_basis: string | null;
  issue_basis: string | null;
  suspension_basis: string | null;
  completion_basis: string | null;
  closure_basis: string | null;
  rejection_basis: string | null;
  revocation_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  suspend_count: number;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  live_work_flag?: boolean;
  breach_crosses_regulator?: boolean;
  created_at: string;
}

interface PermitEvent {
  id: string;
  permit_id: string;
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
  issued_count: number;
  in_progress_count: number;
  suspended_count: number;
  rejected_count: number;
  revoked_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  live_work_total: number;
  confined_total: number;
  top_tier_open: number;
  total_isolation_points: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  permit_requested:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Requested' },
  hazard_assessment:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Hazard assessment' },
  isolation_pending:   { bg: '#fff4d6', fg: '#a06200', label: 'Isolation pending' },
  isolation_confirmed: { bg: '#fff4d6', fg: '#a06200', label: 'Isolation confirmed' },
  permit_issued:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Permit issued' },
  work_in_progress:    { bg: '#fff4d6', fg: '#a06200', label: 'Work in progress' },
  suspended:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'Suspended' },
  work_complete:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Work complete' },
  permit_closed:       { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
  permit_rejected:     { bg: '#fbd0d0', fg: '#7a1414', label: 'Rejected' },
  permit_revoked:      { bg: '#fbd0d0', fg: '#7a1414', label: 'Revoked' },
  withdrawn:           { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const TIER_TONE: Record<HazardTier, { bg: string; fg: string; label: string }> = {
  low:          { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  moderate:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate' },
  high:         { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  catastrophic: { bg: '#fbd0d0', fg: '#7a1414', label: 'Catastrophic' },
};

const CLASS_LABEL: Record<WorkClass, string> = {
  electrical_live:     'Electrical (live)',
  electrical_isolated: 'Electrical (isolated)',
  working_at_height:   'Working at height',
  confined_space:      'Confined space',
  hot_work:            'Hot work',
  lifting:             'Lifting',
  excavation:          'Excavation',
  general:             'General',
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  issuing_authority: { bg: '#dbecfb', fg: '#1a3a5c' },
  permit_holder:     { bg: '#fff4d6', fg: '#a06200' },
  system:            { bg: '#e3e7ec', fg: '#557' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active (pre-terminal)' },
  { key: 'all',                 label: 'All' },
  { key: 'catastrophic',        label: 'Catastrophic' },
  { key: 'critical',            label: 'Critical' },
  { key: 'high',                label: 'High' },
  { key: 'moderate',            label: 'Moderate' },
  { key: 'low',                 label: 'Low' },
  { key: 'hazard_assessment',   label: 'Hazard assessment' },
  { key: 'isolation_pending',   label: 'Isolation pending' },
  { key: 'isolation_confirmed', label: 'Isolation confirmed' },
  { key: 'permit_issued',       label: 'Issued' },
  { key: 'work_in_progress',    label: 'Work in progress' },
  { key: 'suspended',           label: 'Suspended' },
  { key: 'permit_revoked',      label: 'Revoked' },
  { key: 'permit_closed',       label: 'Closed' },
  { key: 'live',                label: 'Live work' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'reportable',          label: 'Reportable' },
];

const TIERS = new Set<string>(['low', 'moderate', 'high', 'critical', 'catastrophic']);

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

export function PermitToWorkChainTab() {
  const [rows, setRows] = useState<PermitRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<PermitRow | null>(null);
  const [events, setEvents] = useState<PermitEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: PermitRow[] } }>('/permit-to-work/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load permits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: PermitRow; events: PermitEvent[] } }>(`/permit-to-work/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load permit history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (filter === 'live')       return r.live_work_flag;
      if (TIERS.has(filter))       return r.hazard_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/permit-to-work/chain/${selected.id}/${path}`, body ?? {});
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
        <Kpi label="Top-tier open" value={kpis?.top_tier_open ?? 0} tone={(kpis?.top_tier_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Live work" value={kpis?.live_work_total ?? 0} tone={(kpis?.live_work_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Revoked" value={kpis?.revoked_count ?? 0} tone={(kpis?.revoked_count ?? 0) > 0 ? 'bad' : 'ok'} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]'
                : 'bg-white text-[#4a5568] border-[#dde4ec] hover:bg-gray-50'
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
              <th className="px-3 py-2 text-left">Permit #</th>
              <th className="px-3 py-2 text-left">Asset / work</th>
              <th className="px-3 py-2 text-left">Holder</th>
              <th className="px-3 py-2 text-left">Class</th>
              <th className="px-3 py-2 text-left">Hazard</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Δ SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">No permits match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.hazard_tier];
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.permit_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.asset_name ?? ''} · ${r.work_description ?? ''}`}>
                    {r.asset_name ?? '—'}<span className="text-[#6b7685]"> · {r.work_description ?? r.work_location ?? ''}</span>
                  </td>
                  <td className="px-3 py-2 text-[#4a5568] max-w-[12rem] truncate" title={r.holder_party_name}>{r.holder_party_name}</td>
                  <td className="px-3 py-2 text-[#4a5568] text-[12px] max-w-[10rem] truncate" title={CLASS_LABEL[r.work_class]}>
                    {CLASS_LABEL[r.work_class]}
                    {r.live_work_flag && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fbd0d0] text-[#7a1414]">LIVE</span>}
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
        <PermitDrawer
          row={selected}
          events={events}
          onClose={() => { setSelected(null); setEvents([]); }}
          doAction={doAction}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone = 'ok' }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const fg = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0f1c2e';
  return (
    <div className="bg-white border border-[#e5ebf2] rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="text-[20px] font-semibold tabular-nums mt-0.5" style={{ color: fg }}>{value}</div>
    </div>
  );
}

function PermitDrawer({
  row, events, onClose, doAction,
}: {
  row: PermitRow;
  events: PermitEvent[];
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
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Permit {row.permit_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.asset_name ?? '—'} · {row.work_description ?? CLASS_LABEL[row.work_class]}
            </h3>
            <div className="flex flex-wrap gap-2 mt-2 text-[12px]">
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: TIER_TONE[row.hazard_tier].bg, color: TIER_TONE[row.hazard_tier].fg }}>
                {TIER_TONE[row.hazard_tier].label}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: STATE_TONE[cs].bg, color: STATE_TONE[cs].fg }}>
                {STATE_TONE[cs].label}
              </span>
              {row.live_work_flag && (
                <span className="px-2 py-0.5 rounded-full bg-[#fbd0d0] text-[#7a1414] font-bold">LIVE WORK</span>
              )}
              {row.is_reportable_flag && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">✕</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="grid grid-cols-2 gap-4">
            <Pair label="Permit holder" value={row.holder_party_name} />
            <Pair label="Issuing authority" value={row.authority_party_name} />
            {row.isolating_authority_name && <Pair label="Isolating authority" value={row.isolating_authority_name} />}
            <Pair label="Work class" value={CLASS_LABEL[row.work_class]} />
            {row.equipment_tag && <Pair label="Equipment tag" value={row.equipment_tag} />}
            {row.work_location && <Pair label="Work location" value={row.work_location} />}
            <Pair label="Hazard score" value={`${row.hazard_score} / 100`} />
            {row.energy_sources && <Pair label="Energy sources" value={row.energy_sources} />}
            {row.isolation_points != null && <Pair label="Isolation points" value={String(row.isolation_points)} />}
            {row.permit_validity_hours != null && <Pair label="Permit validity" value={`${row.permit_validity_hours} h`} />}
            {row.method_statement_ref && <Pair label="Method statement" value={row.method_statement_ref} />}
            {row.suspend_count > 0 && <Pair label="Suspensions" value={String(row.suspend_count)} />}
          </div>

          {row.work_description && <Pair label="Work description" value={row.work_description} />}
          {row.assessment_basis && <Pair label="Hazard assessment" value={row.assessment_basis} />}
          {row.isolation_basis && <Pair label="Isolation basis" value={row.isolation_basis} />}
          {row.issue_basis && <Pair label="Issue basis" value={row.issue_basis} />}
          {row.suspension_basis && <Pair label="Suspension basis" value={row.suspension_basis} />}
          {row.completion_basis && <Pair label="Completion basis" value={row.completion_basis} />}
          {row.closure_basis && <Pair label="Closure basis" value={row.closure_basis} />}
          {row.rejection_basis && <Pair label="Rejection basis" value={row.rejection_basis} />}
          {row.revocation_basis && <Pair label="Revocation basis" value={row.revocation_basis} />}
          {row.withdrawal_basis && <Pair label="Withdrawal basis" value={row.withdrawal_basis} />}
          {row.reason_code && <Pair label="Reason code" value={row.reason_code} />}
          {row.notes && <Pair label="Notes" value={row.notes} />}

          <div className="grid grid-cols-2 gap-4">
            {row.permit_ref && <Pair label="Permit ref" value={row.permit_ref} />}
            {row.isolation_cert_ref && <Pair label="Isolation cert" value={row.isolation_cert_ref} />}
            {row.completion_ref && <Pair label="Completion ref" value={row.completion_ref} />}
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
                {cs === 'permit_requested' && (
                  <ActionBtn label="Begin assessment (authority)" onClick={() => {
                    const ref = window.prompt('Assessment reference (optional):') ?? undefined;
                    const basis = window.prompt('Hazard assessment basis (optional):') ?? undefined;
                    void doAction('begin-assessment', { assessment_ref: ref, assessment_basis: basis });
                  }} />
                )}
                {cs === 'hazard_assessment' && (
                  <ActionBtn label="Approve isolation plan (authority)" onClick={() => {
                    const ref = window.prompt('Isolation plan reference (optional):') ?? undefined;
                    const energy = window.prompt('Energy sources (e.g. electrical / mechanical / stored):') ?? undefined;
                    const points = window.prompt('Number of isolation points (optional):') ?? undefined;
                    void doAction('approve-isolation-plan', {
                      isolation_plan_ref: ref,
                      energy_sources: energy,
                      isolation_points: points ? Number(points) : undefined,
                    });
                  }} />
                )}
                {cs === 'isolation_pending' && (
                  <ActionBtn label="Verify isolation / test-for-dead (authority)" tone="good" onClick={() => {
                    const ref = window.prompt('Isolation certificate reference (optional):') ?? undefined;
                    const who = window.prompt('Isolating authority (competent person):') ?? undefined;
                    void doAction('verify-isolation', { isolation_cert_ref: ref, isolating_authority_name: who });
                  }} />
                )}
                {cs === 'isolation_confirmed' && (
                  <ActionBtn label="Issue permit (authority)" tone="good" onClick={() => {
                    const ref = window.prompt('Permit reference (optional):') ?? undefined;
                    const hours = window.prompt('Permit validity (hours, optional):') ?? undefined;
                    const basis = window.prompt('Issue basis (optional):') ?? undefined;
                    void doAction('issue-permit', {
                      permit_ref: ref,
                      permit_validity_hours: hours ? Number(hours) : undefined,
                      issue_basis: basis,
                    });
                  }} />
                )}
                {cs === 'permit_issued' && (
                  <ActionBtn label="Start work (holder)" onClick={() => {
                    const n = window.prompt('Notes (optional):') ?? undefined;
                    void doAction('start-work', n ? { notes: n } : {});
                  }} />
                )}
                {cs === 'work_in_progress' && (
                  <ActionBtn label="Suspend (handover / weather)" onClick={() => {
                    const basis = window.prompt('Suspension basis (e.g. shift handover):') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('suspend-work', { suspension_basis: basis, reason_code: rc });
                  }} />
                )}
                {cs === 'suspended' && (
                  <ActionBtn label="Resume work (holder)" onClick={() => {
                    const n = window.prompt('Notes (optional):') ?? undefined;
                    void doAction('resume-work', n ? { notes: n } : {});
                  }} />
                )}
                {cs === 'work_in_progress' && (
                  <ActionBtn label="Complete work (holder)" tone="good" onClick={() => {
                    const ref = window.prompt('Completion reference (optional):') ?? undefined;
                    const basis = window.prompt('Completion basis (optional):') ?? undefined;
                    void doAction('complete-work', { completion_ref: ref, completion_basis: basis });
                  }} />
                )}
                {cs === 'work_complete' && (
                  <ActionBtn label="Close permit (re-energise / hand back)" tone="good" onClick={() => {
                    const ref = window.prompt('Closure reference (optional):') ?? undefined;
                    const basis = window.prompt('Closure basis (optional):') ?? undefined;
                    void doAction('close-permit', { closure_ref: ref, closure_basis: basis });
                  }} />
                )}
                {(cs === 'hazard_assessment' || cs === 'isolation_pending') && (
                  <ActionBtn label="Reject permit (authority)" tone="bad" onClick={() => {
                    const basis = window.prompt('Rejection basis (hazard unacceptable):') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('reject-permit', { rejection_basis: basis, reason_code: rc });
                  }} />
                )}
                {(cs === 'isolation_confirmed' || cs === 'permit_issued' || cs === 'work_in_progress' || cs === 'suspended') && (
                  <ActionBtn label="REVOKE (emergency / isolation breach)" tone="bad" onClick={() => {
                    const basis = window.prompt('Revocation basis (emergency / unsafe condition):') ?? undefined;
                    const reg = window.prompt('Regulator reference (optional):') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('revoke-permit', { revocation_basis: basis, regulator_ref: reg, reason_code: rc });
                  }} />
                )}
                {(cs === 'permit_requested' || cs === 'hazard_assessment' || cs === 'isolation_pending') && (
                  <ActionBtn label="Withdraw (holder)" onClick={() => {
                    const basis = window.prompt('Withdrawal basis (no longer required):') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('withdraw', { withdrawal_basis: basis, reason_code: rc });
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
  const bg = tone === 'good' ? 'bg-emerald-700' : tone === 'bad' ? 'bg-red-700' : 'bg-[#1a3a5c]';
  return (
    <button onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
  );
}
