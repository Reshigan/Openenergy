// Wave 143 — IPP Daily Construction Diary (Site Diary) tab.
//
// JBCC 6.2 cl.8.13 + NEC4 cl.25 + CIDB BPG#A1 + OHSA Const.Regs 2014.
// URGENT SLA: critical_delay 12h | daily_operational 24h | shutdown_partial 48h | no_work 96h.
// SIGNATURE: miss_diary EVERY tier; dispute_diary on delay+critical_delay; submit_diary on safety_incident.
//
// Beats Procore / Viewpoint / Aconex / e-Builder daily-report forms with:
//   full P6 lifecycle, dispute-resolution machine, IE countersignature workflow,
//   missed-diary NERSA/NERSA notification chain, and safety-incident OHSA linkage.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type DiaryStatus =
  | 'open' | 'submitted' | 'late_submission' | 'employer_noted' | 'ie_reviewed'
  | 'disputed' | 'resolution_pending' | 'correction_accepted' | 'countersigned'
  | 'archived' | 'missed' | 'voided';

type DayType = 'critical_delay' | 'daily_operational' | 'shutdown_partial' | 'no_work';

interface DiaryRow {
  id: string;
  project_id: string;
  project_name: string | null;
  diary_date: string;
  diary_ref: string | null;
  chain_status: DiaryStatus;
  day_type: DayType;
  weather_am: string | null;
  weather_pm: string | null;
  temperature_max_c: number | null;
  temperature_min_c: number | null;
  work_stoppages_minutes: number | null;
  workforce_total: number | null;
  plant_equipment: string | null;
  materials_delivered: string | null;
  work_areas_active: string | null;
  progress_narrative: string | null;
  instructions_issued: string | null;
  visitors: string | null;
  safety_observations: string | null;
  delay_description: string | null;
  delay_duration_hours: number | null;
  correction_notes: string | null;
  dispute_reason: string | null;
  resolution_notes: string | null;
  void_reason: string | null;
  contractor_signatory: string | null;
  employer_signatory: string | null;
  ie_reviewer: string | null;
  regulator_ref: string | null;
  risk_ref: string | null;
  incident_ref: string | null;
  floor_has_delay_event: number;
  floor_has_safety_incident: number;
  floor_has_instruction_issued: number;
  floor_has_weather_stoppage: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  submitted_at: string | null;
  late_submission_at: string | null;
  employer_noted_at: string | null;
  ie_reviewed_at: string | null;
  disputed_at: string | null;
  countersigned_at: string | null;
  archived_at: string | null;
  missed_at: string | null;
  voided_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface DiaryEvent {
  id: string;
  diary_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  created_at: string;
}

interface KpiSummary {
  total: number;
  open_count: number;
  submitted_count: number;
  late_count: number;
  disputed_count: number;
  missed_count: number;
  archived_count: number;
  voided_count: number;
  breached: number;
  reportable_total: number;
  critical_delay_count: number;
}

const STATE_TONE: Record<DiaryStatus, { bg: string; fg: string; label: string }> = {
  open:                { bg: '#e3e7ec', fg: '#557',    label: 'Open' },
  submitted:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted' },
  late_submission:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'Late submission' },
  employer_noted:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Employer noted' },
  ie_reviewed:         { bg: '#daf5e2', fg: '#1f6b3a', label: 'IE reviewed' },
  disputed:            { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
  resolution_pending:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Resolution pending' },
  correction_accepted: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Correction accepted' },
  countersigned:       { bg: '#d4edda', fg: '#155724', label: 'Countersigned' },
  archived:            { bg: '#e3e7ec', fg: '#557',    label: 'Archived' },
  missed:              { bg: '#fde0e0', fg: '#9b1f1f', label: 'MISSED' },
  voided:              { bg: '#e3e7ec', fg: '#557',    label: 'Voided' },
};

const DAY_TONE: Record<DayType, { bg: string; fg: string; label: string; hours: number }> = {
  critical_delay:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical delay (12h)', hours: 12 },
  daily_operational: { bg: '#e3e7ec', fg: '#557',    label: 'Daily operational (24h)', hours: 24 },
  shutdown_partial:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Partial shutdown (48h)', hours: 48 },
  no_work:           { bg: '#e3e7ec', fg: '#557',    label: 'No work (96h)', hours: 96 },
};

const FILTERS = [
  { key: 'open',           label: 'Open' },
  { key: 'all',            label: 'All' },
  { key: 'critical_delay', label: 'Critical delay' },
  { key: 'late',           label: 'Late' },
  { key: 'disputed',       label: 'Disputed' },
  { key: 'missed',         label: 'Missed' },
  { key: 'breached',       label: 'SLA breached' },
  { key: 'reportable',     label: 'Reportable' },
  { key: 'countersigned',  label: 'Countersigned' },
  { key: 'archived',       label: 'Archived' },
];

type ActionKind =
  | 'submit_diary' | 'note_receipt' | 'ie_review' | 'countersign' | 'archive_diary'
  | 'dispute_diary' | 'open_resolution' | 'accept_correction' | 'void_diary';

const ACTION_LABEL: Record<ActionKind, string> = {
  submit_diary:      'Submit diary (contractor)',
  note_receipt:      'Note receipt (employer)',
  ie_review:         'IE review',
  countersign:       'Countersign (IE)',
  archive_diary:     'Archive',
  dispute_diary:     'Raise dispute',
  open_resolution:   'Open resolution',
  accept_correction: 'Accept correction',
  void_diary:        'Void (admin)',
};

const DESTRUCTIVE: ActionKind[] = ['dispute_diary', 'void_diary'];

const PRIMARY_FOR_STATE: Record<DiaryStatus, ActionKind | null> = {
  open:                'submit_diary',
  submitted:           'note_receipt',
  late_submission:     'submit_diary',
  employer_noted:      'ie_review',
  ie_reviewed:         'countersign',
  disputed:            'open_resolution',
  resolution_pending:  'accept_correction',
  correction_accepted: 'countersign',
  countersigned:       'archive_diary',
  archived:            null,
  missed:              null,
  voided:              null,
};

const SECONDARY_FOR_STATE: Record<DiaryStatus, ActionKind[]> = {
  open:                ['void_diary'],
  submitted:           ['dispute_diary'],
  late_submission:     ['void_diary'],
  employer_noted:      ['dispute_diary'],
  ie_reviewed:         ['dispute_diary'],
  disputed:            [],
  resolution_pending:  [],
  correction_accepted: [],
  countersigned:       ['dispute_diary'],
  archived:            [],
  missed:              [],
  voided:              [],
};

const HARD_TERMINALS: DiaryStatus[] = ['archived', 'missed', 'voided'];

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function slaMinutesRemaining(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.round((new Date(deadline).getTime() - Date.now()) / 60_000);
}

export function IppDiaryTab() {
  const [rows, setRows]       = useState<DiaryRow[]>([]);
  const [kpis, setKpis]       = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const [filter, setFilter]   = useState<string>('open');
  const [selected, setSelected] = useState<DiaryRow | null>(null);
  const [events, setEvents]   = useState<DiaryEvent[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: DiaryRow[] } & KpiSummary }>('/ipp-diary');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, submitted_count: d.submitted_count,
          late_count: d.late_count, disputed_count: d.disputed_count, missed_count: d.missed_count,
          archived_count: d.archived_count, voided_count: d.voided_count,
          breached: d.breached, reportable_total: d.reportable_total, critical_delay_count: d.critical_delay_count,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load diaries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { diary: DiaryRow; events: DiaryEvent[] } }>(`/ipp-diary/${id}`);
      if (res.data?.data?.diary) setSelected(res.data.data.diary);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load diary detail');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')           return true;
      if (filter === 'open')          return !HARD_TERMINALS.includes(r.chain_status);
      if (filter === 'breached')      return r.sla_breached === 1;
      if (filter === 'reportable')    return r.is_reportable === 1;
      if (filter === 'late')          return r.chain_status === 'late_submission';
      if (filter === 'critical_delay') return r.day_type === 'critical_delay';
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: DiaryRow) => {
    try {
      const body: Record<string, string | number> = {};

      if (action === 'submit_diary') {
        const contractor = window.prompt('Contractor signatory:', row.contractor_signatory ?? '') || '';
        const narrative = window.prompt('Progress narrative (brief):', row.progress_narrative ?? '') || '';
        const hasDelay = window.confirm('Floor: delay event occurred today (used for dispute / regulator crossing)?');
        const hasSafety = window.confirm('Floor: safety incident today? (triggers OHSA 24h notification)');
        if (contractor) body.contractor_signatory = contractor;
        if (narrative) body.progress_narrative = narrative;
        body.floor_has_delay_event = hasDelay ? 1 : 0;
        body.floor_has_safety_incident = hasSafety ? 1 : 0;
      } else if (action === 'note_receipt') {
        const employer = window.prompt('Employer signatory:', row.employer_signatory ?? '') || '';
        if (employer) body.employer_signatory = employer;
      } else if (action === 'ie_review') {
        const ie = window.prompt('IE reviewer name:', row.ie_reviewer ?? '') || '';
        const notes = window.prompt('Review notes (optional):') || '';
        if (ie) body.ie_reviewer = ie;
        if (notes) body.notes = notes;
      } else if (action === 'countersign') {
        const ie = window.prompt('IE countersignatory:', row.ie_reviewer ?? '') || '';
        if (!ie) return;
        body.ie_reviewer = ie;
      } else if (action === 'archive_diary') {
        if (!window.confirm('Archive this diary? This is a hard terminal state.')) return;
      } else if (action === 'dispute_diary') {
        const reason = window.prompt('Dispute reason — specific entries being contested:');
        if (!reason) return;
        body.dispute_reason = reason;
        body.floor_has_delay_event = row.floor_has_delay_event;
      } else if (action === 'open_resolution') {
        const notes = window.prompt('Resolution opening notes — proposed resolution path:') || '';
        if (notes) body.notes = notes;
      } else if (action === 'accept_correction') {
        const notes = window.prompt('Correction notes — agreed corrected entries:');
        if (!notes) return;
        body.correction_notes = notes;
      } else if (action === 'void_diary') {
        const reason = window.prompt('Void reason (e.g. confirmed no-work day, duplicate):');
        if (!reason) return;
        body.void_reason = reason;
      }

      await api.post(`/ipp-diary/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadDetail(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed: ${action}`);
    }
  }, [load, loadDetail, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Daily Construction Diary</h2>
          <p className="text-xs text-[#4a5568]">
            12-state site diary chain — open → submitted → employer_noted → IE_reviewed → countersigned → archived.
            Dispute branch: employer_noted / ie_reviewed → disputed → resolution_pending → correction_accepted → countersigned.
            URGENT SLA: critical_delay 12h (tightest) | daily_operational 24h | shutdown_partial 48h | no_work 96h (loosest).
            JBCC 6.2 cl.8.13 + NEC4 cl.25 + OHSA Const.Regs 2014.
            Signature crossings: miss_diary EVERY tier · dispute_diary on delay+critical_delay · submit_diary on safety_incident.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
        >
          + New diary entry
        </button>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total entries" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Critical delay days" value={kpis?.critical_delay_count ?? 0} tone={(kpis?.critical_delay_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Late submissions" value={kpis?.late_count ?? 0} tone={(kpis?.late_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Missed (SIGNATURE)" value={kpis?.missed_count ?? 0} tone={(kpis?.missed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Submitted" value={kpis?.submitted_count ?? 0} />
        <Kpi label="Archived" value={kpis?.archived_count ?? 0} tone="ok" />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Date / ref</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Day type</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Weather</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Workforce</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const dt = DAY_TONE[r.day_type];
                const slaMin = slaMinutesRemaining(r.sla_deadline_at);
                const isTerminal = HARD_TERMINALS.includes(r.chain_status);
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadDetail(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.diary_date}
                      {r.is_reportable === 1 && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {r.chain_status === 'missed' && <span className="ml-1 text-[#9b1f1f]" title="Missed diary — SIGNATURE">★</span>}
                      {r.sla_breached === 1 && <span className="ml-1 text-[#9b1f1f]" title="SLA breached">!</span>}
                      <div className="text-[10px] text-[#4a5568]">{r.diary_ref ?? ''}</div>
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[180px] truncate">{r.project_name ?? r.project_id}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: dt.bg, color: dt.fg }}>
                        {dt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      {r.weather_am ? `${r.weather_am}/${r.weather_pm ?? '—'}` : '—'}
                      {r.temperature_max_c != null && (
                        <span className="ml-1 text-[10px]">{r.temperature_max_c}°C</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0c2a4d]">{r.workforce_total ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached === 1 ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {isTerminal ? '—' : r.sla_breached === 1 ? 'BREACHED' : fmtMinutes(slaMin)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No diary entries match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />
      )}
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: DiaryRow;
  events: DiaryEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: DiaryRow) => void;
}) {
  const primary = PRIMARY_FOR_STATE[row.chain_status];
  const secondary = SECONDARY_FOR_STATE[row.chain_status];
  const slaMin = slaMinutesRemaining(row.sla_deadline_at);
  const isTerminal = HARD_TERMINALS.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.diary_date} · {row.diary_ref ?? row.id}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? row.project_id}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {DAY_TONE[row.day_type].label}
                {row.chain_status === 'missed' && ' · MISSED DIARY (SIGNATURE)'}
                {row.sla_breached === 1 && ' · SLA BREACHED'}
                {row.is_reportable === 1 && ' · Reportable'}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[12px]">
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Day type"          value={DAY_TONE[row.day_type].label} />
            <Pair label="SLA target"        value={row.sla_target_hours != null ? `${row.sla_target_hours}h` : '—'} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA remaining"     value={isTerminal ? '—' : row.sla_breached === 1 ? 'BREACHED' : fmtMinutes(slaMin)} />
            <Pair label="SLA breach count"  value={String(row.sla_breach_count)} />
            <Pair label="Weather AM/PM"     value={row.weather_am ? `${row.weather_am} / ${row.weather_pm ?? '—'}` : '—'} />
            <Pair label="Temperature"       value={row.temperature_max_c != null ? `${row.temperature_min_c}–${row.temperature_max_c}°C` : '—'} />
            <Pair label="Work stoppages"    value={row.work_stoppages_minutes != null ? `${row.work_stoppages_minutes}min` : '—'} />
            <Pair label="Workforce total"   value={row.workforce_total != null ? String(row.workforce_total) : '—'} />
            <Pair label="Plant / equipment" value={row.plant_equipment ?? '—'} />
            <Pair label="Contractor signer" value={row.contractor_signatory ?? '—'} />
            <Pair label="Employer signer"   value={row.employer_signatory ?? '—'} />
            <Pair label="IE reviewer"       value={row.ie_reviewer ?? '—'} />
            <Pair label="Regulator ref"     value={row.regulator_ref ?? '—'} />
            <Pair label="Risk ref"          value={row.risk_ref ?? '—'} />
            <Pair label="Incident ref"      value={row.incident_ref ?? '—'} />
          </div>

          {/* Floor flags — the inputs that drive regulator crossings */}
          <div className="mt-3 flex flex-wrap gap-2">
            {row.floor_has_delay_event === 1 && (
              <span className="rounded bg-[#fde0e0] px-2 py-0.5 text-[11px] font-medium text-[#9b1f1f]">Delay event</span>
            )}
            {row.floor_has_safety_incident === 1 && (
              <span className="rounded bg-[#fde0e0] px-2 py-0.5 text-[11px] font-medium text-[#9b1f1f]">Safety incident (OHSA)</span>
            )}
            {row.floor_has_instruction_issued === 1 && (
              <span className="rounded bg-[#fff4d6] px-2 py-0.5 text-[11px] font-medium text-[#a06200]">Instruction issued</span>
            )}
            {row.floor_has_weather_stoppage === 1 && (
              <span className="rounded bg-[#ffe4b5] px-2 py-0.5 text-[11px] font-medium text-[#8a4a00]">Weather stoppage</span>
            )}
          </div>

          {row.materials_delivered && <NarrBlock label="Materials delivered" text={row.materials_delivered} />}
          {row.work_areas_active && <NarrBlock label="Work areas active" text={row.work_areas_active} />}
          {row.progress_narrative && <NarrBlock label="Progress narrative" text={row.progress_narrative} />}
          {row.instructions_issued && <NarrBlock label="Instructions issued" text={row.instructions_issued} tone="#9b1f1f" />}
          {row.visitors && <NarrBlock label="Site visitors" text={row.visitors} />}
          {row.safety_observations && <NarrBlock label="Safety observations" text={row.safety_observations} tone="#9b1f1f" />}
          {row.delay_description && <NarrBlock label={`Delay description (${row.delay_duration_hours ?? '?'}h)`} text={row.delay_description} tone="#8a4a00" />}
          {row.dispute_reason && <NarrBlock label="Dispute reason" text={row.dispute_reason} tone="#9b1f1f" />}
          {row.correction_notes && <NarrBlock label="Correction notes" text={row.correction_notes} tone="#a06200" />}
          {row.resolution_notes && <NarrBlock label="Resolution notes" text={row.resolution_notes} tone="#1f6b3a" />}
          {row.void_reason && <NarrBlock label="Void reason" text={row.void_reason} tone="#557" />}
        </section>

        {(primary || secondary.length > 0) && (
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
              {secondary.map((a) => {
                const danger = DESTRUCTIVE.includes(a);
                return (
                  <button
                    key={a}
                    onClick={() => onAct(a, row)}
                    className={
                      danger
                        ? 'rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50'
                        : 'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]'
                    }
                  >
                    {ACTION_LABEL[a]}
                  </button>
                );
              })}
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

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [projectId, setProjectId] = useState('');
  const [diaryDate, setDiaryDate] = useState(new Date().toISOString().slice(0, 10));
  const [dayType, setDayType] = useState<DayType>('daily_operational');
  const [workforce, setWorkforce] = useState('');
  const [narrative, setNarrative] = useState('');
  const [hasDelay, setHasDelay] = useState(false);
  const [hasSafety, setHasSafety] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!projectId.trim() || !diaryDate) { setErr('Project ID and diary date are required.'); return; }
    setSaving(true); setErr(null);
    try {
      await api.post('/ipp-diary', {
        project_id: projectId.trim(),
        diary_date: diaryDate,
        day_type: dayType,
        workforce_total: workforce ? Number(workforce) : undefined,
        progress_narrative: narrative || undefined,
        floor_has_delay_event: hasDelay ? 1 : 0,
        floor_has_safety_incident: hasSafety ? 1 : 0,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create diary entry');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3 flex items-center justify-between">
          <span className="font-semibold text-[#0c2a4d]">New diary entry</span>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
        </header>
        <div className="px-5 py-4 space-y-3">
          {err && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>}

          <Field label="Project ID *">
            <input
              value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[13px]"
              placeholder="proj-kakamas-500mw"
            />
          </Field>
          <Field label="Diary date *">
            <input
              type="date" value={diaryDate} onChange={(e) => setDiaryDate(e.target.value)}
              className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[13px]"
            />
          </Field>
          <Field label="Day type">
            <select value={dayType} onChange={(e) => setDayType(e.target.value as DayType)}
              className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[13px]"
            >
              <option value="daily_operational">Daily operational (SLA 24h)</option>
              <option value="critical_delay">Critical delay (SLA 12h)</option>
              <option value="shutdown_partial">Partial shutdown (SLA 48h)</option>
              <option value="no_work">No work (SLA 96h)</option>
            </select>
          </Field>
          <Field label="Workforce on site">
            <input
              type="number" min="0" value={workforce} onChange={(e) => setWorkforce(e.target.value)}
              className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[13px]"
              placeholder="0"
            />
          </Field>
          <Field label="Progress narrative">
            <textarea
              value={narrative} onChange={(e) => setNarrative(e.target.value)}
              rows={3}
              className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[13px]"
              placeholder="Works performed today…"
            />
          </Field>
          <div className="flex gap-4 text-[13px]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={hasDelay} onChange={(e) => setHasDelay(e.target.checked)} />
              <span>Delay event today</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={hasSafety} onChange={(e) => setHasSafety(e.target.checked)} />
              <span className="text-[#9b1f1f]">Safety incident (OHSA)</span>
            </label>
          </div>
        </div>
        <footer className="border-t border-[#d8dde6] px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-[#d8dde6] px-3 py-1.5 text-[12px] text-[#557] hover:bg-[#f3f5f9]">Cancel</button>
          <button
            onClick={submit} disabled={saving}
            className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c] disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create diary entry'}
          </button>
        </footer>
      </div>
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

function NarrBlock({ label, text, tone = '#1a3a5c' }: { label: string; text: string; tone?: string }) {
  return (
    <div className="mt-3 text-[12px]">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: tone }}>{label}</div>
      <div className="mt-0.5 whitespace-pre-wrap" style={{ color: tone }}>{text}</div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-[#4a5568]">{label}</label>
      {children}
    </div>
  );
}
