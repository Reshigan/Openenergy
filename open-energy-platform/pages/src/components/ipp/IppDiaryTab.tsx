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
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
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

type DiaryStatus =
  | 'open' | 'submitted' | 'late_submission' | 'employer_noted' | 'ie_reviewed'
  | 'disputed' | 'resolution_pending' | 'correction_accepted' | 'countersigned'
  | 'archived' | 'missed' | 'voided';

type DayType = 'critical_delay' | 'daily_operational' | 'shutdown_partial' | 'no_work';

interface DiaryRow {
  [key: string]: unknown;
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

const DAY_TONE: Record<DayType, { label: string }> = {
  critical_delay:    { label: 'Critical delay (12h)' },
  daily_operational: { label: 'Daily operational (24h)' },
  shutdown_partial:  { label: 'Partial shutdown (48h)' },
  no_work:           { label: 'No work (96h)' },
};

// ── state machine ─────────────────────────────────────────────────────────
// Main forward path: open → submitted/late_submission → employer_noted → ie_reviewed
//   → countersigned → archived
// Dispute branch: employer_noted/ie_reviewed → disputed → resolution_pending
//   → correction_accepted → countersigned → archived
const ALL_STATES: readonly string[] = [
  'open',
  'submitted',
  'late_submission',
  'employer_noted',
  'ie_reviewed',
  'correction_accepted',
  'countersigned',
  'archived',
];

const BRANCH_STATES: readonly string[] = [
  'disputed',
  'resolution_pending',
  'missed',
  'voided',
];

const HARD_TERMINALS: DiaryStatus[] = ['archived', 'missed', 'voided'];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
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

// ── helpers ───────────────────────────────────────────────────────────────
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

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: DiaryRow): ChainAction[] {
  const actions: ChainAction[] = [];

  if (row.chain_status === 'open' || row.chain_status === 'late_submission') {
    // submit_diary — crosses regulator when safety_incident floor is set
    actions.push({
      key: 'submit_diary',
      label: 'Submit diary (contractor)',
      tone: 'primary',
      cascadeTo: row.floor_has_safety_incident === 1 ? ['regulator'] : [],
      fields: [
        {
          key: 'contractor_signatory',
          label: 'Contractor signatory',
          type: 'text',
          required: false,
          placeholder: row.contractor_signatory ?? '',
        },
        {
          key: 'progress_narrative',
          label: 'Progress narrative (brief)',
          type: 'textarea',
          required: false,
          placeholder: row.progress_narrative ?? '',
        },
        {
          key: 'floor_has_delay_event',
          label: 'Floor: delay event occurred today (used for dispute / regulator crossing)? Enter 1 for yes, 0 for no.',
          type: 'text',
          required: false,
          placeholder: String(row.floor_has_delay_event ?? 0),
        },
        {
          key: 'floor_has_safety_incident',
          label: 'Floor: safety incident today? Triggers OHSA 24h notification. Enter 1 for yes, 0 for no.',
          type: 'text',
          required: false,
          placeholder: String(row.floor_has_safety_incident ?? 0),
        },
      ],
    });
    actions.push({
      key: 'void_diary',
      label: 'Void (admin)',
      tone: 'danger',
      cascadeTo: [],
      fields: [
        {
          key: 'void_reason',
          label: 'Void reason (e.g. confirmed no-work day, duplicate)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  if (row.chain_status === 'submitted') {
    actions.push({
      key: 'note_receipt',
      label: 'Note receipt (employer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'employer_signatory',
          label: 'Employer signatory',
          type: 'text',
          required: false,
          placeholder: row.employer_signatory ?? '',
        },
      ],
    });
    // dispute_diary crosses regulator when delay_event or critical_delay
    actions.push({
      key: 'dispute_diary',
      label: 'Raise dispute',
      tone: 'danger',
      cascadeTo: (row.floor_has_delay_event === 1 || row.day_type === 'critical_delay') ? ['regulator'] : [],
      fields: [
        {
          key: 'dispute_reason',
          label: 'Dispute reason — specific entries being contested',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  if (row.chain_status === 'employer_noted') {
    actions.push({
      key: 'ie_review',
      label: 'IE review',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'ie_reviewer',
          label: 'IE reviewer name',
          type: 'text',
          required: false,
          placeholder: row.ie_reviewer ?? '',
        },
        {
          key: 'notes',
          label: 'Review notes (optional)',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
    });
    actions.push({
      key: 'dispute_diary',
      label: 'Raise dispute',
      tone: 'danger',
      cascadeTo: (row.floor_has_delay_event === 1 || row.day_type === 'critical_delay') ? ['regulator'] : [],
      fields: [
        {
          key: 'dispute_reason',
          label: 'Dispute reason — specific entries being contested',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  if (row.chain_status === 'ie_reviewed') {
    actions.push({
      key: 'countersign',
      label: 'Countersign (IE)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'ie_reviewer',
          label: 'IE countersignatory',
          type: 'text',
          required: true,
          placeholder: row.ie_reviewer ?? '',
        },
      ],
    });
    actions.push({
      key: 'dispute_diary',
      label: 'Raise dispute',
      tone: 'danger',
      cascadeTo: (row.floor_has_delay_event === 1 || row.day_type === 'critical_delay') ? ['regulator'] : [],
      fields: [
        {
          key: 'dispute_reason',
          label: 'Dispute reason — specific entries being contested',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  if (row.chain_status === 'disputed') {
    actions.push({
      key: 'open_resolution',
      label: 'Open resolution',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'notes',
          label: 'Resolution opening notes — proposed resolution path',
          type: 'textarea',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (row.chain_status === 'resolution_pending') {
    actions.push({
      key: 'accept_correction',
      label: 'Accept correction',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'correction_notes',
          label: 'Correction notes — agreed corrected entries',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  if (row.chain_status === 'correction_accepted') {
    actions.push({
      key: 'countersign',
      label: 'Countersign (IE)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'ie_reviewer',
          label: 'IE countersignatory',
          type: 'text',
          required: true,
          placeholder: row.ie_reviewer ?? '',
        },
      ],
    });
  }

  if (row.chain_status === 'countersigned') {
    actions.push({
      key: 'archive_diary',
      label: 'Archive',
      tone: 'ghost',
      cascadeTo: [],
      fields: [],
      description: 'Archive this diary. This is a hard terminal state.',
    });
    actions.push({
      key: 'dispute_diary',
      label: 'Raise dispute',
      tone: 'danger',
      cascadeTo: (row.floor_has_delay_event === 1 || row.day_type === 'critical_delay') ? ['regulator'] : [],
      fields: [
        {
          key: 'dispute_reason',
          label: 'Dispute reason — specific entries being contested',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: DiaryRow): React.ReactNode {
  const isTerminal = HARD_TERMINALS.includes(row.chain_status);
  const slaMin = slaMinutesRemaining(row.sla_deadline_at);

  return (
    <div style={{ fontSize: 11 }}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
        <DetailPair label="Day type"          value={DAY_TONE[row.day_type].label} />
        <DetailPair label="SLA target"        value={row.sla_target_hours != null ? `${row.sla_target_hours}h` : '—'} />
        <DetailPair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA remaining"     value={isTerminal ? '—' : row.sla_breached === 1 ? 'BREACHED' : fmtMinutes(slaMin)} />
        <DetailPair label="SLA breach count"  value={String(row.sla_breach_count)} />
        <DetailPair label="Weather AM/PM"     value={row.weather_am ? `${row.weather_am} / ${row.weather_pm ?? '—'}` : '—'} />
        <DetailPair label="Temperature"       value={row.temperature_max_c != null ? `${row.temperature_min_c}–${row.temperature_max_c}°C` : '—'} />
        <DetailPair label="Work stoppages"    value={row.work_stoppages_minutes != null ? `${row.work_stoppages_minutes}min` : '—'} />
        <DetailPair label="Workforce total"   value={row.workforce_total != null ? String(row.workforce_total) : '—'} />
        <DetailPair label="Plant / equipment" value={row.plant_equipment ?? '—'} />
        <DetailPair label="Contractor signer" value={row.contractor_signatory ?? '—'} />
        <DetailPair label="Employer signer"   value={row.employer_signatory ?? '—'} />
        <DetailPair label="IE reviewer"       value={row.ie_reviewer ?? '—'} />
        <DetailPair label="Regulator ref"     value={row.regulator_ref ?? '—'} />
        <DetailPair label="Risk ref"          value={row.risk_ref ?? '—'} />
        <DetailPair label="Incident ref"      value={row.incident_ref ?? '—'} />
      </div>

      {/* Floor flags — drive regulator crossings */}
      {(row.floor_has_delay_event === 1 || row.floor_has_safety_incident === 1 ||
        row.floor_has_instruction_issued === 1 || row.floor_has_weather_stoppage === 1) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {row.floor_has_delay_event === 1 && (
            <span className="rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: 'oklch(0.97 0.04 20)', color: BAD }}>Delay event</span>
          )}
          {row.floor_has_safety_incident === 1 && (
            <span className="rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: 'oklch(0.97 0.04 20)', color: BAD }}>Safety incident (OHSA)</span>
          )}
          {row.floor_has_instruction_issued === 1 && (
            <span className="rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: 'oklch(0.96 0.05 55)', color: WARN }}>Instruction issued</span>
          )}
          {row.floor_has_weather_stoppage === 1 && (
            <span className="rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: 'oklch(0.96 0.05 55)', color: WARN }}>Weather stoppage</span>
          )}
        </div>
      )}

      {row.materials_delivered && <NarrBlock label="Materials delivered" text={row.materials_delivered} />}
      {row.work_areas_active && <NarrBlock label="Work areas active" text={row.work_areas_active} />}
      {row.progress_narrative && <NarrBlock label="Progress narrative" text={row.progress_narrative} />}
      {row.instructions_issued && <NarrBlock label="Instructions issued" text={row.instructions_issued} tone={BAD} />}
      {row.visitors && <NarrBlock label="Site visitors" text={row.visitors} />}
      {row.safety_observations && <NarrBlock label="Safety observations" text={row.safety_observations} tone={BAD} />}
      {row.delay_description && <NarrBlock label={`Delay description (${row.delay_duration_hours ?? '?'}h)`} text={row.delay_description} tone={WARN} />}
      {row.dispute_reason && <NarrBlock label="Dispute reason" text={row.dispute_reason} tone={BAD} />}
      {row.correction_notes && <NarrBlock label="Correction notes" text={row.correction_notes} tone={WARN} />}
      {row.resolution_notes && <NarrBlock label="Resolution notes" text={row.resolution_notes} tone={GOOD} />}
      {row.void_reason && <NarrBlock label="Void reason" text={row.void_reason} tone={TX2} />}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function IppDiaryTab() {
  const [rows, setRows]       = useState<DiaryRow[]>([]);
  const [kpis, setKpis]       = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const [filter, setFilter]   = useState<string>('open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});
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
          total: d.total,
          open_count: d.open_count,
          submitted_count: d.submitted_count,
          late_count: d.late_count,
          disputed_count: d.disputed_count,
          missed_count: d.missed_count,
          archived_count: d.archived_count,
          voided_count: d.voided_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          critical_delay_count: d.critical_delay_count,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load diaries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ipp-diary/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp-diary/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed: ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { diary: DiaryRow; events: ChainEvent[] } }>(`/ipp-diary/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')            return true;
      if (filter === 'open')           return !HARD_TERMINALS.includes(r.chain_status);
      if (filter === 'breached')       return r.sla_breached === 1;
      if (filter === 'reportable')     return r.is_reportable === 1;
      if (filter === 'late')           return r.chain_status === 'late_submission';
      if (filter === 'critical_delay') return r.day_type === 'critical_delay';
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: 0, open_count: 0, submitted_count: 0, late_count: 0,
    disputed_count: 0, missed_count: 0, archived_count: 0, voided_count: 0,
    breached: 0, reportable_total: 0, critical_delay_count: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Daily Construction Diary</h2>
          <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
            12-state site diary chain — open → submitted → employer_noted → IE_reviewed → countersigned → archived.
            Dispute branch: employer_noted / ie_reviewed → disputed → resolution_pending → correction_accepted → countersigned.
            URGENT SLA: critical_delay 12h (tightest) | daily_operational 24h | shutdown_partial 48h | no_work 96h (loosest).
            JBCC 6.2 cl.8.13 + NEC4 cl.25 + OHSA Const.Regs 2014.
            Signature crossings: miss_diary EVERY tier · dispute_diary on delay+critical_delay · submit_diary on safety_incident.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="shrink-0 rounded px-3 py-1.5 text-[12px] font-medium text-white"
          style={{ background: ACC }}
        >
          + New diary entry
        </button>
      </header>

      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-5 gap-2">
        <KpiTile label="Total entries"         value={k.total} />
        <KpiTile label="Open"                  value={k.open_count}           tone={k.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Critical delay days"   value={k.critical_delay_count} tone={k.critical_delay_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Late submissions"      value={k.late_count}           tone={k.late_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Missed (SIGNATURE)"    value={k.missed_count}         tone={k.missed_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"          value={k.breached}             tone={k.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Disputed"              value={k.disputed_count}       tone={k.disputed_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Reportable"            value={k.reportable_total}     tone={k.reportable_total > 0 ? 'warn' : undefined} />
        <KpiTile label="Submitted"             value={k.submitted_count} />
        <KpiTile label="Archived"              value={k.archived_count}       tone="ok" />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]"
          style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{
                ...row,
                sla_deadline_at: row.sla_deadline_at ?? null,
                sla_breached: row.sla_breached === 1,
                is_terminal: HARD_TERMINALS.includes(row.chain_status),
              }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.diary_date}${row.diary_ref ? ` · ${row.diary_ref}` : ''}`}
              meta={
                <span>
                  {row.project_name ?? row.project_id}
                  {' · '}
                  {DAY_TONE[row.day_type].label}
                  {row.is_reportable === 1 && ' · Reportable'}
                  {row.chain_status === 'missed' && ' · MISSED (SIGNATURE)'}
                  {row.sla_breached === 1 && ' · SLA BREACHED'}
                  {row.workforce_total != null && ` · ${row.workforce_total} workers`}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No diary entries match.
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />
      )}
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────
function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

function NarrBlock({ label, text, tone = TX2 }: { label: string; text: string; tone?: string }) {
  return (
    <div className="mt-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: tone }}>{label}</div>
      <div className="whitespace-pre-wrap text-[11px]" style={{ color: TX2 }}>{text}</div>
    </div>
  );
}

// ── CreateModal ───────────────────────────────────────────────────────────
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
      <div className="w-full max-w-md rounded-lg shadow-2xl" style={{ background: BG1 }}>
        <header className="border-b px-5 py-3 flex items-center justify-between" style={{ borderColor: BORDER, background: BG2 }}>
          <span className="font-semibold text-[13px]" style={{ color: TX1 }}>New diary entry</span>
          <button type="button" onClick={onClose} style={{ color: TX3 }}>✕</button>
        </header>
        <div className="px-5 py-4 space-y-3">
          {err && (
            <div className="rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>
          )}

          <CField label="Project ID *">
            <input
              value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded border px-2 py-1 text-[13px]"
              style={{ borderColor: BORDER, color: TX1, background: BG1 }}
              placeholder="proj-kakamas-500mw"
            />
          </CField>
          <CField label="Diary date *">
            <input
              type="date" value={diaryDate} onChange={(e) => setDiaryDate(e.target.value)}
              className="w-full rounded border px-2 py-1 text-[13px]"
              style={{ borderColor: BORDER, color: TX1, background: BG1 }}
            />
          </CField>
          <CField label="Day type">
            <select
              value={dayType} onChange={(e) => setDayType(e.target.value as DayType)}
              className="w-full rounded border px-2 py-1 text-[13px]"
              style={{ borderColor: BORDER, color: TX1, background: BG1 }}
            >
              <option value="daily_operational">Daily operational (SLA 24h)</option>
              <option value="critical_delay">Critical delay (SLA 12h)</option>
              <option value="shutdown_partial">Partial shutdown (SLA 48h)</option>
              <option value="no_work">No work (SLA 96h)</option>
            </select>
          </CField>
          <CField label="Workforce on site">
            <input
              type="number" min="0" value={workforce} onChange={(e) => setWorkforce(e.target.value)}
              className="w-full rounded border px-2 py-1 text-[13px]"
              style={{ borderColor: BORDER, color: TX1, background: BG1 }}
              placeholder="0"
            />
          </CField>
          <CField label="Progress narrative">
            <textarea
              value={narrative} onChange={(e) => setNarrative(e.target.value)}
              rows={3}
              className="w-full rounded border px-2 py-1 text-[13px]"
              style={{ borderColor: BORDER, color: TX1, background: BG1 }}
              placeholder="Works performed today…"
            />
          </CField>
          <div className="flex gap-4 text-[13px]">
            <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: TX2 }}>
              <input type="checkbox" checked={hasDelay} onChange={(e) => setHasDelay(e.target.checked)} />
              <span>Delay event today</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: BAD }}>
              <input type="checkbox" checked={hasSafety} onChange={(e) => setHasSafety(e.target.checked)} />
              <span>Safety incident (OHSA)</span>
            </label>
          </div>
        </div>
        <footer className="border-t px-5 py-3 flex justify-end gap-2" style={{ borderColor: BORDER }}>
          <button
            type="button" onClick={onClose}
            className="rounded border px-3 py-1.5 text-[12px]"
            style={{ borderColor: BORDER, color: TX2, background: BG1 }}
          >
            Cancel
          </button>
          <button
            type="button" onClick={submit} disabled={saving}
            className="rounded px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            style={{ background: ACC }}
          >
            {saving ? 'Creating…' : 'Create diary entry'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function CField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium" style={{ color: TX3 }}>{label}</label>
      {children}
    </div>
  );
}

export default IppDiaryTab;
