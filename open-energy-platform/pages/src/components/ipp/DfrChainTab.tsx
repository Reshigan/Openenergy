// Wave 97 — IPP Daily Field Report / Progress Diary tab.
//
// The construction-day record for a best-in-class IPP-PM stack.
// Beats Procore Daily Log, Aconex Daily Site Diary, Buildertrend, Fieldwire,
// Raken, PlanGrid Daily Field Report, e-Builder daily logs via:
//   - 12-state P6 lifecycle (drafted → open → entries_open → close_entries →
//     entries_closed → submit → submitted → start_review → under_review →
//     approve → approved → distribute → distributed → archive → archived)
//     plus return_for_correction → corrected → submit (rejoin) and the
//     void / withdraw exception terminals
//   - tier RE-DERIVED on every transition from priority × workflow class
//     with FLOOR-AT-HIGH for triggers_hse_incident | triggers_change_order |
//     triggers_warranty_claim | contributes_to_evm
//   - URGENT SLA polarity (safety = tightest; construction is hours-money)
//   - ball-in-court tracking + authority tiered
//     (site_supervisor → project_engineer → project_manager → project_director)
//   - LIVE battery decoration on every fetch: minutes_until_sla,
//     ipp_pm_quality_index (0-130 with photo/weather/safety bonuses),
//     days_in_court, predicted_close_date_live, urgency_band,
//     EVM CV/SV/CPI/SPI
//   - SIGNATURE regulator crossings (W97 — OHSA + REIPPPP):
//     submit / approve / void crosses EVERY tier with HSE; approve also
//     EVERY tier when change_order with high+critical; distribute high+
//     critical with change_order; sla_breached high+critical with HSE OR
//     change_order.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'drafted' | 'entries_open' | 'entries_closed'
  | 'submitted' | 'under_review'
  | 'returned_for_correction' | 'corrected'
  | 'approved' | 'distributed' | 'archived'
  | 'voided' | 'withdrawn';

type Tier = 'critical' | 'high' | 'standard' | 'low';

type WorkflowClass =
  | 'routine_daily' | 'weather_delay' | 'safety_incident' | 'milestone_handover'
  | 'equipment_breakdown' | 'low_productivity' | 'executive_visit' | 'near_miss';

interface DfrRow {
  id: string;
  dfr_number: string;
  project_id: string;
  project_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  owner_party_id: string | null;
  owner_party_name: string | null;
  workflow_class: WorkflowClass;
  priority_class: 'critical' | 'high' | 'standard' | 'low';
  report_date: string;
  shift: string | null;
  site_location: string | null;
  weather_summary: string | null;
  temperature_low_c: number | null;
  temperature_high_c: number | null;
  precipitation_mm: number | null;
  wind_speed_mps: number | null;
  lost_time_hours: number | null;
  weather_delay_minutes: number | null;
  manpower_count: number;
  equipment_count: number;
  photo_count: number;
  entries_count: number;
  weather_log_present: number;
  safety_log_present: number;
  current_tier: Tier;
  authority_required: string | null;
  triggers_hse_incident: number;
  triggers_change_order: number;
  triggers_warranty_claim: number;
  contributes_to_evm: number;
  correction_count: number;
  rejection_count: number;
  evm_pv_zar: number | null;
  evm_ev_zar: number | null;
  evm_ac_zar: number | null;
  parent_dfr_id: string | null;
  hse_incident_ref: string | null;
  change_order_ref: string | null;
  warranty_claim_ref: string | null;
  regulator_ref: string | null;
  title: string | null;
  narrative: string | null;
  response_text: string | null;
  voided_reason: string | null;
  withdrawn_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  requester_party: string | null;
  approver_party: string | null;
  chain_status: ChainStatus;
  drafted_at: string;
  entries_open_at: string | null;
  entries_closed_at: string | null;
  submitted_at: string | null;
  under_review_at: string | null;
  returned_for_correction_at: string | null;
  corrected_at: string | null;
  approved_at: string | null;
  distributed_at: string | null;
  archived_at: string | null;
  voided_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // decorated
  is_terminal: boolean;
  minutes_until_sla: number | null;
  sla_breached: boolean;
  sla_window_minutes: number;
  urgency_band: 'red' | 'amber' | 'yellow' | 'green' | 'terminal';
  is_reportable_flag: boolean;
  high_tier_flag: boolean;
  floor_at_high_flag: boolean;
  signature_class_flag: boolean;
  authority_required_live: string;
  tier_live: Tier;
  ball_in_court_party_live: string | null;
  days_in_court_live: number;
  days_open_live: number;
  predicted_close_date_live: string | null;
  ipp_pm_quality_index_live: number;
  inbox_severity_live: string;
  reportable_per_spec: boolean;
  evm_cv_zar_live: number;
  evm_sv_zar_live: number;
  evm_cpi_live: number | null;
  evm_spi_live: number | null;
}

interface DfrEvent {
  id: string;
  dfr_id: string;
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
  open_count: number;
  archived_count: number;
  voided_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  hse_count: number;
  change_order_count: number;
  warranty_count: number;
  avg_quality_index: number;
  avg_days_in_court: number;
  total_manpower: number;
  total_lost_time_hours: number;
  total_weather_delay_minutes: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  drafted:                  { bg: '#e3e7ec', fg: '#557',    label: 'Drafted' },
  entries_open:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Entries open' },
  entries_closed:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Entries closed' },
  submitted:                { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted' },
  under_review:             { bg: '#fff4d6', fg: '#a06200', label: 'Under review' },
  returned_for_correction:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Returned for correction' },
  corrected:                { bg: '#dbecfb', fg: '#1a3a5c', label: 'Corrected' },
  approved:                 { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  distributed:              { bg: '#d4edda', fg: '#155724', label: 'Distributed' },
  archived:                 { bg: '#cfe9d7', fg: '#0f5132', label: 'Archived' },
  voided:                   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Voided' },
  withdrawn:                { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  high:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'High' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard' },
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
};

const URGENCY_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  amber:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Amber' },
  yellow:   { bg: '#fff4d6', fg: '#a06200', label: 'Yellow' },
  green:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Green' },
  terminal: { bg: '#e3e7ec', fg: '#557',    label: 'Terminal' },
};

const AUTHORITY_LABEL: Record<string, string> = {
  site_supervisor:  'Site supervisor',
  project_engineer: 'Project engineer',
  project_manager:  'Project manager',
  project_director: 'Project director',
};

const WORKFLOW_LABEL: Record<WorkflowClass, string> = {
  routine_daily:        'Routine daily',
  weather_delay:        'Weather delay',
  safety_incident:      'Safety incident',
  milestone_handover:   'Milestone handover',
  equipment_breakdown:  'Equipment breakdown',
  low_productivity:     'Low productivity',
  executive_visit:      'Executive visit',
  near_miss:            'Near miss',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                    label: 'Open' },
  { key: 'all',                     label: 'All' },
  { key: 'critical',                label: 'Critical' },
  { key: 'high',                    label: 'High' },
  { key: 'standard',                label: 'Standard' },
  { key: 'low',                     label: 'Low' },
  { key: 'entries_open',            label: 'Entries open' },
  { key: 'under_review',            label: 'Under review' },
  { key: 'returned_for_correction', label: 'Returned' },
  { key: 'approved',                label: 'Approved' },
  { key: 'distributed',             label: 'Distributed' },
  { key: 'archived',                label: 'Archived' },
  { key: 'breached',                label: 'SLA breached' },
  { key: 'reportable',              label: 'Reportable' },
  { key: 'signature',               label: 'Signature' },
  { key: 'hse_only',                label: 'HSE' },
];

type ActionKind =
  | 'open' | 'close-entries' | 'submit' | 'start-review'
  | 'return-for-correction' | 'correct' | 'approve' | 'distribute' | 'archive'
  | 'void' | 'withdraw';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  drafted:                  'open',
  entries_open:             'close-entries',
  entries_closed:           'submit',
  submitted:                'start-review',
  under_review:             'approve',
  returned_for_correction:  'correct',
  corrected:                'submit',
  approved:                 'distribute',
  distributed:              'archive',
  archived:                 null,
  voided:                   null,
  withdrawn:                null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'open':                  'Open entries (supervisor)',
  'close-entries':         'Close entries (supervisor)',
  'submit':                'Submit (coordinator)',
  'start-review':          'Start review (reviewer)',
  'return-for-correction': 'Return for correction (reviewer)',
  'correct':               'Correct (supervisor)',
  'approve':               'Approve (reviewer)',
  'distribute':            'Distribute (coordinator)',
  'archive':               'Archive (coordinator)',
  'void':                  'Void (owner)',
  'withdraw':              'Withdraw (supervisor)',
};

const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  drafted:                  ['withdraw'],
  entries_open:             ['withdraw', 'void'],
  entries_closed:           ['withdraw', 'void'],
  submitted:                ['void'],
  under_review:             ['return-for-correction', 'void'],
  returned_for_correction:  ['withdraw', 'void'],
  corrected:                ['void'],
  approved:                 ['void'],
  distributed:              ['void'],
  archived:                 [],
  voided:                   [],
  withdrawn:                [],
};

const DESTRUCTIVE: ActionKind[] = ['return-for-correction', 'void', 'withdraw'];

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  const abs = Math.abs(m);
  const sign = m < 0 ? '-' : '';
  if (abs >= 1440) return `${sign}${Math.round(abs / 1440)}d`;
  if (abs >= 60)   return `${sign}${Math.round(abs / 60)}h`;
  return `${sign}${abs}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}R${(a / 1_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
  if (a >= 1000)      return `${sign}R${(a / 1000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}k`;
  return `${sign}R${a.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

const TERMINAL_STATES: ChainStatus[] = ['archived', 'voided', 'withdrawn'];

export function DfrChainTab() {
  const [rows, setRows] = useState<DfrRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<DfrRow | null>(null);
  const [events, setEvents] = useState<DfrEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: DfrRow[] } & KpiSummary }>('/ipp/dfr/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count,
          archived_count: d.archived_count, voided_count: d.voided_count,
          withdrawn_count: d.withdrawn_count,
          breached: d.breached, reportable_total: d.reportable_total,
          signature_count: d.signature_count,
          hse_count: d.hse_count, change_order_count: d.change_order_count,
          warranty_count: d.warranty_count,
          avg_quality_index: d.avg_quality_index,
          avg_days_in_court: d.avg_days_in_court,
          total_manpower: d.total_manpower,
          total_lost_time_hours: d.total_lost_time_hours,
          total_weather_delay_minutes: d.total_weather_delay_minutes,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load daily field reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { dfr: DfrRow; events: DfrEvent[] } }>(`/ipp/dfr/chain/${id}`);
      if (res.data?.data?.dfr) setSelected(res.data.data.dfr);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load DFR history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (filter === 'signature')  return r.signature_class_flag;
      if (filter === 'hse_only')   return r.triggers_hse_incident === 1;
      if (['critical', 'high', 'standard', 'low'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: DfrRow) => {
    try {
      let body: Record<string, unknown> = {};
      if (action === 'open') {
        const title = window.prompt('DFR title:', row.title ?? '') || '';
        body = title ? { title } : {};
      } else if (action === 'close-entries') {
        const note = window.prompt('Closing note — what was done today (manpower / equipment / progress):') || '';
        body = note ? { notes: note } : {};
      } else if (action === 'submit') {
        const narrative = window.prompt('Narrative — describe the construction day (HSE + work fronts + delays):');
        if (!narrative) return;
        body = { narrative };
      } else if (action === 'start-review') {
        const reviewer = window.prompt('Reviewer party — defaults to reviewer:', 'reviewer') || 'reviewer';
        body = { last_responder_party: reviewer };
      } else if (action === 'return-for-correction') {
        const reason = window.prompt('Reason for correction:');
        if (!reason) return;
        body = { reason_code: 'returned', narrative: reason };
      } else if (action === 'correct') {
        const note = window.prompt('What was corrected:');
        if (!note) return;
        body = { narrative: note };
      } else if (action === 'approve') {
        const reg = window.prompt('Regulator reference (OHSA/REIPPPP) — leave blank if not reportable:') || '';
        body = reg ? { approver_party: 'reviewer', regulator_ref: reg } : { approver_party: 'reviewer' };
      } else if (action === 'distribute') {
        const ref = window.prompt('Distribution reference (high+critical with change_order crosses regulator):') || '';
        body = ref ? { regulator_ref: ref } : {};
      } else if (action === 'archive') {
        const note = window.prompt('Archive note (optional):') || '';
        body = note ? { notes: note } : {};
      } else if (action === 'void') {
        const reason = window.prompt('Void reason — voiding with HSE OR change_order crosses regulator EVERY tier:');
        if (!reason) return;
        body = { voided_reason: reason };
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason:');
        if (!reason) return;
        body = { withdrawn_reason: reason };
      }
      await api.post(`/ipp/dfr/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Daily field report &middot; construction-day record</h2>
          <p className="text-xs text-[#4a5568]">
            12-state P6 lifecycle for the construction-day side of an IPP project — drafted → entries open →
            entries closed → submitted → under review → approved → distributed → archived, with the
            return-for-correction loop and void / withdraw exception terminals. Beats Procore Daily Log,
            Aconex Daily Site Diary, Buildertrend, Fieldwire, Raken, PlanGrid Daily Field Report and e-Builder
            via: tier RE-DERIVED on every transition from priority × workflow class with FLOOR-AT-HIGH for
            triggers_hse_incident / triggers_change_order / triggers_warranty_claim / contributes_to_evm;
            URGENT SLA polarity (safety = tightest; construction is hours-money); ball-in-court tracking;
            authority tiered site_supervisor → project_engineer → project_manager → project_director; LIVE
            battery decoration (minutes_until_sla, ipp_pm_quality_index 0-130 with photo / weather / safety
            bonuses, days_in_court, predicted_close_date_live, urgency_band, EVM CV/SV/CPI/SPI). SIGNATURE
            regulator crossings (OHSA s24 + REIPPPP): submit crosses EVERY tier with HSE; approve EVERY tier
            with HSE or high+critical change_order; void EVERY tier with HSE OR change_order; distribute
            high+critical with change_order; sla_breached high+critical with HSE OR change_order.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Archived" value={kpis?.archived_count ?? 0} tone="ok" />
        <Kpi label="Voided" value={kpis?.voided_count ?? 0} tone={(kpis?.voided_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Signature" value={kpis?.signature_count ?? 0} tone={(kpis?.signature_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="HSE-bearing" value={kpis?.hse_count ?? 0} tone={(kpis?.hse_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Change-order" value={kpis?.change_order_count ?? 0} tone={(kpis?.change_order_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="IPP-PM quality" value={fmtNum(kpis?.avg_quality_index)} />
        <Kpi label="Manpower (day)" value={kpis?.total_manpower ?? 0} />
        <Kpi label="Lost-time hrs" value={fmtNum(kpis?.total_lost_time_hours)} tone={(kpis?.total_lost_time_hours ?? 0) > 0 ? 'bad' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">No.</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / report date</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Ball in court</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urg</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Quality</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.current_tier];
                const ut = URGENCY_TONE[r.urgency_band] ?? URGENCY_TONE.green;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.dfr_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {r.signature_class_flag && <span className="ml-1 text-[#a06200]" title="Signature class (HSE or change-order)">▲</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={`${r.project_name ?? ''} · ${r.report_date}`}>
                      {r.project_name ?? '—'}
                      <span className="text-[#4a5568]"> · {r.report_date}</span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{WORKFLOW_LABEL[r.workflow_class]}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.ball_in_court_party_live ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: ut.bg, color: ut.fg }}>
                        {ut.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={(r.ipp_pm_quality_index_live ?? 0) >= 100 ? 'text-[#1f6b3a]' : 'text-[#9b1f1f]'}>
                        {fmtNum(r.ipp_pm_quality_index_live, 0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No daily field reports match.</td></tr>
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
  row: DfrRow;
  events: DfrEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: DfrRow) => void;
}) {
  const primary = ACTION_FOR_STATE[row.chain_status];
  const secondary = SECONDARY_ACTIONS[row.chain_status];
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[820px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.dfr_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? '—'} · {row.report_date}{row.shift ? ` · ${row.shift}` : ''}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {WORKFLOW_LABEL[row.workflow_class]}
                {row.contractor_name ? ` · ${row.contractor_name}` : ''}
                {row.site_location ? ` · ${row.site_location}` : ''}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Live IPP-PM battery</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Quality index" value={fmtNum(row.ipp_pm_quality_index_live, 0)} bad={(row.ipp_pm_quality_index_live ?? 0) < 100} hint="0-130 (photo/weather/safety bonuses applied)" />
              <Metric label="Days open" value={String(row.days_open_live ?? 0)} />
              <Metric label="Days in court" value={String(row.days_in_court_live ?? 0)} bad={(row.days_in_court_live ?? 0) > 2} hint="Aging in current state" />
              <Metric label="Ball in court" value={row.ball_in_court_party_live ?? '—'} hint="Auto-derived from current state" />
              <Metric label="Tier (live)" value={TIER_TONE[row.tier_live].label} bad={row.tier_live === 'critical' || row.tier_live === 'high'} hint="Re-derived every transition" />
              <Metric label="Urgency band" value={URGENCY_TONE[row.urgency_band]?.label ?? row.urgency_band} bad={row.urgency_band === 'red' || row.urgency_band === 'amber'} />
              <Metric label="Predicted close" value={fmtDate(row.predicted_close_date_live)} hint="Tier-derived ETA" />
              <Metric label="Authority" value={authority} hint="Site supervisor → project engineer → project manager → project director" />
            </div>
          </div>

          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Coverage flags (FLOOR-AT-HIGH)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="HSE incident" value={row.triggers_hse_incident ? 'Yes' : 'No'} bad={!!row.triggers_hse_incident} hint="OHSA s24 reportable" />
              <Metric label="Change order" value={row.triggers_change_order ? 'Yes' : 'No'} bad={!!row.triggers_change_order} hint="REIPPPP baseline" />
              <Metric label="Warranty claim" value={row.triggers_warranty_claim ? 'Yes' : 'No'} bad={!!row.triggers_warranty_claim} />
              <Metric label="Contributes EVM" value={row.contributes_to_evm ? 'Yes' : 'No'} bad={!!row.contributes_to_evm} />
              <Metric label="Manpower" value={String(row.manpower_count ?? 0)} />
              <Metric label="Equipment" value={String(row.equipment_count ?? 0)} />
              <Metric label="Photos" value={String(row.photo_count ?? 0)} hint="5+ photos = +10 quality" />
              <Metric label="Entries" value={String(row.entries_count ?? 0)} />
              <Metric label="Weather log" value={row.weather_log_present ? 'Yes' : 'No'} hint="+5 quality" />
              <Metric label="Safety log" value={row.safety_log_present ? 'Yes' : 'No'} hint="+5 quality" />
              <Metric label="Lost time" value={row.lost_time_hours != null ? `${fmtNum(row.lost_time_hours)}h` : '—'} bad={(row.lost_time_hours ?? 0) > 0} />
              <Metric label="Weather delay" value={row.weather_delay_minutes != null ? `${row.weather_delay_minutes}m` : '—'} bad={(row.weather_delay_minutes ?? 0) > 0} />
            </div>
          </div>

          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">EVM (PMI convention)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="PV (planned)" value={fmtZar(row.evm_pv_zar)} />
              <Metric label="EV (earned)"  value={fmtZar(row.evm_ev_zar)} />
              <Metric label="AC (actual)"  value={fmtZar(row.evm_ac_zar)} />
              <Metric label="CV (EV-AC)"   value={fmtZar(row.evm_cv_zar_live)} bad={(row.evm_cv_zar_live ?? 0) < 0} hint="Cost variance" />
              <Metric label="SV (EV-PV)"   value={fmtZar(row.evm_sv_zar_live)} bad={(row.evm_sv_zar_live ?? 0) < 0} hint="Schedule variance" />
              <Metric label="CPI"          value={fmtNum(row.evm_cpi_live, 2)} bad={(row.evm_cpi_live ?? 1) < 1} hint="Cost performance index (>1 good)" />
              <Metric label="SPI"          value={fmtNum(row.evm_spi_live, 2)} bad={(row.evm_spi_live ?? 1) < 1} hint="Schedule performance index (>1 good)" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"            value={STATE_TONE[row.chain_status].label} />
            <Pair label="Workflow class"   value={WORKFLOW_LABEL[row.workflow_class]} />
            <Pair label="Priority"         value={row.priority_class} />
            <Pair label="Report date"      value={row.report_date} />
            <Pair label="Shift"            value={row.shift ?? '—'} />
            <Pair label="Site location"    value={row.site_location ?? '—'} />
            <Pair label="Weather"          value={row.weather_summary ?? '—'} />
            <Pair label="Temp range (°C)"  value={(row.temperature_low_c != null || row.temperature_high_c != null) ? `${row.temperature_low_c ?? '—'} / ${row.temperature_high_c ?? '—'}` : '—'} />
            <Pair label="Precip (mm)"      value={row.precipitation_mm != null ? fmtNum(row.precipitation_mm) : '—'} />
            <Pair label="Wind (m/s)"       value={row.wind_speed_mps != null ? fmtNum(row.wind_speed_mps) : '—'} />
            <Pair label="Contractor"       value={row.contractor_name ?? '—'} />
            <Pair label="Facility"         value={row.facility_name ?? '—'} />
            <Pair label="Owner"            value={row.owner_party_name ?? '—'} />
            <Pair label="Last responder"   value={row.last_responder_party ?? '—'} />
            <Pair label="Requester"        value={row.requester_party ?? '—'} />
            <Pair label="Approver"         value={row.approver_party ?? '—'} />
            <Pair label="HSE incident ref" value={row.hse_incident_ref ?? '—'} />
            <Pair label="Change-order ref" value={row.change_order_ref ?? '—'} />
            <Pair label="Warranty ref"     value={row.warranty_claim_ref ?? '—'} />
            <Pair label="Regulator ref"    value={row.regulator_ref ?? '—'} />
            <Pair label="Corrections"      value={String(row.correction_count ?? 0)} />
            <Pair label="Rejections"       value={String(row.rejection_count ?? 0)} />
            <Pair label="Drafted"          value={fmtDate(row.drafted_at)} />
            <Pair label="Entries open"     value={fmtDate(row.entries_open_at)} />
            <Pair label="Entries closed"   value={fmtDate(row.entries_closed_at)} />
            <Pair label="Submitted"        value={fmtDate(row.submitted_at)} />
            <Pair label="Under review"     value={fmtDate(row.under_review_at)} />
            <Pair label="Approved"         value={fmtDate(row.approved_at)} />
            <Pair label="Distributed"      value={fmtDate(row.distributed_at)} />
            <Pair label="Archived"         value={fmtDate(row.archived_at)} />
            <Pair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA"              value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"   value={String(row.escalation_level)} />
            <Pair label="Reportable"       value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.narrative && <BasisBlock label="Narrative" tone="#1a3a5c" text={row.narrative} />}
          {row.response_text && <BasisBlock label="Response" tone="#1f6b3a" text={row.response_text} />}
          {row.voided_reason && <BasisBlock label="Voided reason" tone="#9b1f1f" text={row.voided_reason} />}
          {row.withdrawn_reason && <BasisBlock label="Withdrawn reason" tone="#8a4a00" text={row.withdrawn_reason} />}
        </section>

        {(primary || secondary.length > 0) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {primary && (
                <button type="button"
                  onClick={() => onAct(primary, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[primary]}
                </button>
              )}
              {secondary.map((a) => {
                const danger = DESTRUCTIVE.includes(a);
                return (
                  <button type="button"
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

function Metric({ label, value, bad, hint }: { label: string; value: string; bad?: boolean; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className={`text-[13px] font-semibold tabular-nums ${bad ? 'text-[#9b1f1f]' : 'text-[#0c2a4d]'}`}>{value}</div>
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
