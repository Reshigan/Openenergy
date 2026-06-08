// Wave 98 — IPP Punch List / COD Snag Handover tab.
//
// The construction-completion defect lifecycle for a best-in-class IPP-PM
// stack. Beats Procore Punch List, BIM 360 Field, PlanGrid Punch List,
// Fieldwire snag, Autodesk Construction Cloud Punch List, Bluebeam Revu
// Snag, Aconex Defects via:
//   - 11-state P6 lifecycle (identified → assessed → assigned →
//     in_remediation → reinspect_requested → reinspected → accepted →
//     closed) with reject_reinspection → assigned rejoin, on_hold park,
//     and void / withdraw exception terminals
//   - tier RE-DERIVED on every transition from priority × workflow class
//     with FLOOR-AT-HIGH for blocks_commercial_operation | blocks_handover
//     | life_safety_critical | warranty_critical
//   - URGENT SLA polarity (COD-blocking is hours-money; critical 60min)
//   - ball-in-court tracking + authority tiered
//     (site_supervisor → quality_engineer → project_manager → project_director)
//   - LIVE battery decoration on every fetch: minutes_until_sla,
//     ipp_pm_quality_index (0-130 vs Procore baseline=100),
//     days_in_court, predicted_close_date_live, urgency_band
//   - SIGNATURE regulator crossings (W98 — NERSA §C-5 + REIPPPP COD):
//     close crosses EVERY tier with COD-blocking OR life-safety; accept
//     high+critical with life-safety; reject_reinspection high+critical
//     with COD-blocking; void EVERY tier with handover OR life-safety;
//     sla_breached high+critical with COD OR life-safety.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'identified' | 'assessed' | 'assigned' | 'in_remediation'
  | 'reinspect_requested' | 'reinspected' | 'accepted' | 'closed'
  | 'on_hold' | 'voided' | 'withdrawn';

type Tier = 'critical' | 'high' | 'standard' | 'low';

type WorkflowClass =
  | 'punch_safety_critical' | 'punch_functional_performance' | 'punch_cosmetic'
  | 'punch_documentation' | 'punch_commissioning' | 'punch_handover_blocker'
  | 'punch_warranty_carryover' | 'snag_post_handover';

interface PunchRow {
  id: string;
  punch_number: string;
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
  identified_location: string | null;
  identified_zone: string | null;
  identified_drawing_ref: string | null;
  identified_specification_ref: string | null;
  identified_at: string | null;
  blocks_commercial_operation: number;
  blocks_handover: number;
  life_safety_critical: number;
  warranty_critical: number;
  current_tier: Tier;
  authority_required: string | null;
  rejection_count: number;
  reinspection_count: number;
  photo_evidence_count: number;
  root_cause_documented: number;
  commissioning_evidence: number;
  remediation_cost_zar: number | null;
  recovered_from_contractor_zar: number | null;
  parent_punch_id: string | null;
  cod_blocker_ref: string | null;
  handover_blocker_ref: string | null;
  warranty_ref: string | null;
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
  assessed_at: string | null;
  assigned_at: string | null;
  in_remediation_at: string | null;
  reinspect_requested_at: string | null;
  reinspected_at: string | null;
  accepted_at: string | null;
  closed_at: string | null;
  on_hold_at: string | null;
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
}

interface PunchEvent {
  id: string;
  punch_id: string;
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
  closed_count: number;
  voided_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  cod_count: number;
  handover_count: number;
  safety_count: number;
  warranty_count: number;
  avg_quality_index: number;
  avg_days_in_court: number;
  avg_rejection_count: number;
  total_remediation_cost_zar: number;
  total_recovered_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  identified:          { bg: '#e3e7ec', fg: '#557',    label: 'Identified' },
  assessed:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'Assessed' },
  assigned:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'Assigned' },
  in_remediation:      { bg: '#fff4d6', fg: '#a06200', label: 'In remediation' },
  reinspect_requested: { bg: '#fff4d6', fg: '#a06200', label: 'Reinspect requested' },
  reinspected:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Reinspected' },
  accepted:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Accepted' },
  closed:              { bg: '#cfe9d7', fg: '#0f5132', label: 'Closed' },
  on_hold:             { bg: '#ffe4b5', fg: '#8a4a00', label: 'On hold' },
  voided:              { bg: '#fde0e0', fg: '#9b1f1f', label: 'Voided' },
  withdrawn:           { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
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
  quality_engineer: 'Quality engineer',
  project_manager:  'Project manager',
  project_director: 'Project director',
};

const WORKFLOW_LABEL: Record<WorkflowClass, string> = {
  punch_safety_critical:       'Safety-critical',
  punch_functional_performance:'Functional / performance',
  punch_cosmetic:              'Cosmetic',
  punch_documentation:         'Documentation',
  punch_commissioning:         'Commissioning',
  punch_handover_blocker:      'Handover blocker',
  punch_warranty_carryover:    'Warranty carryover',
  snag_post_handover:          'Post-handover snag',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                label: 'Open' },
  { key: 'all',                 label: 'All' },
  { key: 'critical',            label: 'Critical' },
  { key: 'high',                label: 'High' },
  { key: 'standard',            label: 'Standard' },
  { key: 'low',                 label: 'Low' },
  { key: 'identified',          label: 'Identified' },
  { key: 'assigned',            label: 'Assigned' },
  { key: 'in_remediation',      label: 'In remediation' },
  { key: 'reinspect_requested', label: 'Reinspect req' },
  { key: 'on_hold',             label: 'On hold' },
  { key: 'closed',              label: 'Closed' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'reportable',          label: 'Reportable' },
  { key: 'signature',           label: 'Signature' },
  { key: 'cod_only',            label: 'COD-blocking' },
  { key: 'safety_only',         label: 'Life-safety' },
];

type ActionKind =
  | 'assess' | 'assign' | 'begin-remediation' | 'request-reinspection'
  | 'reinspect' | 'accept' | 'reject-reinspection' | 'close'
  | 'park' | 'resume' | 'void' | 'withdraw';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  identified:          'assess',
  assessed:            'assign',
  assigned:            'begin-remediation',
  in_remediation:      'request-reinspection',
  reinspect_requested: 'reinspect',
  reinspected:         'accept',
  accepted:            'close',
  closed:              null,
  on_hold:             'resume',
  voided:              null,
  withdrawn:           null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'assess':               'Assess (quality engineer)',
  'assign':               'Assign (project manager)',
  'begin-remediation':    'Begin remediation (contractor)',
  'request-reinspection': 'Request reinspection (contractor)',
  'reinspect':            'Reinspect (independent engineer)',
  'accept':               'Accept (independent engineer)',
  'reject-reinspection':  'Reject reinspection (independent engineer)',
  'close':                'Close (project manager)',
  'park':                 'Park (project manager)',
  'resume':               'Resume (contractor)',
  'void':                 'Void (owner)',
  'withdraw':             'Withdraw (quality engineer)',
};

const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  identified:          ['withdraw'],
  assessed:            ['withdraw', 'void'],
  assigned:            ['withdraw', 'void'],
  in_remediation:      ['park', 'void'],
  reinspect_requested: ['park', 'void'],
  reinspected:         ['reject-reinspection', 'void'],
  accepted:            ['void'],
  closed:              [],
  on_hold:             ['void'],
  voided:              [],
  withdrawn:           [],
};

const DESTRUCTIVE: ActionKind[] = ['reject-reinspection', 'void', 'withdraw', 'park'];

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

const TERMINAL_STATES: ChainStatus[] = ['closed', 'voided', 'withdrawn'];

export function PunchListChainTab() {
  const [rows, setRows] = useState<PunchRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<PunchRow | null>(null);
  const [events, setEvents] = useState<PunchEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PunchRow[] } & KpiSummary }>('/ipp/punch-list/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count,
          closed_count: d.closed_count, voided_count: d.voided_count,
          withdrawn_count: d.withdrawn_count,
          breached: d.breached, reportable_total: d.reportable_total,
          signature_count: d.signature_count,
          cod_count: d.cod_count, handover_count: d.handover_count,
          safety_count: d.safety_count, warranty_count: d.warranty_count,
          avg_quality_index: d.avg_quality_index,
          avg_days_in_court: d.avg_days_in_court,
          avg_rejection_count: d.avg_rejection_count,
          total_remediation_cost_zar: d.total_remediation_cost_zar,
          total_recovered_zar: d.total_recovered_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load punch list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { punch_list: PunchRow; events: PunchEvent[] } }>(`/ipp/punch-list/chain/${id}`);
      if (res.data?.data?.punch_list) setSelected(res.data.data.punch_list);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load punch history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'open')        return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')    return r.sla_breached;
      if (filter === 'reportable')  return r.is_reportable_flag;
      if (filter === 'signature')   return r.signature_class_flag;
      if (filter === 'cod_only')    return r.blocks_commercial_operation === 1;
      if (filter === 'safety_only') return r.life_safety_critical === 1;
      if (['critical', 'high', 'standard', 'low'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: PunchRow) => {
    try {
      let body: Record<string, unknown> = {};
      if (action === 'assess') {
        const note = window.prompt('Assessment finding — tier and authority are re-derived after this step:') || '';
        body = note ? { narrative: note } : {};
      } else if (action === 'assign') {
        const contractor = window.prompt('Assign to which contractor / subcontractor party:') || '';
        body = contractor ? { contractor_name: contractor } : {};
      } else if (action === 'begin-remediation') {
        const note = window.prompt('Remediation plan / start note:') || '';
        body = note ? { narrative: note } : {};
      } else if (action === 'request-reinspection') {
        const note = window.prompt('Evidence summary (photos / root-cause / commissioning) for reinspection:') || '';
        body = note ? { response_text: note } : {};
      } else if (action === 'reinspect') {
        const note = window.prompt('Reinspection finding (independent engineer):');
        if (!note) return;
        body = { last_responder_party: 'independent_engineer', narrative: note };
      } else if (action === 'accept') {
        const reg = window.prompt('Regulator reference (life-safety high+critical crosses NERSA inbox) — leave blank if not applicable:') || '';
        body = reg ? { approver_party: 'independent_engineer', regulator_ref: reg } : { approver_party: 'independent_engineer' };
      } else if (action === 'reject-reinspection') {
        const reason = window.prompt('Reason for reinspection rejection (COD-blocking high+critical crosses regulator):');
        if (!reason) return;
        body = { reason_code: 'REINSPECTION_REJECTED', narrative: reason };
      } else if (action === 'close') {
        const reg = window.prompt('Regulator reference (COD-blocking or life-safety crosses EVERY tier) — leave blank if not applicable:') || '';
        body = reg ? { regulator_ref: reg } : {};
      } else if (action === 'park') {
        const reason = window.prompt('Park reason (e.g. spare unavailable, weather, dependency):');
        if (!reason) return;
        body = { reason_code: 'PARKED', narrative: reason };
      } else if (action === 'resume') {
        const note = window.prompt('Resume note:') || '';
        body = note ? { narrative: note } : {};
      } else if (action === 'void') {
        const reason = window.prompt('Void reason — voiding with handover OR life-safety crosses regulator EVERY tier:');
        if (!reason) return;
        body = { voided_reason: reason };
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason:');
        if (!reason) return;
        body = { withdrawn_reason: reason };
      }
      await api.post(`/ipp/punch-list/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Punch list &middot; COD snag handover</h2>
          <p className="text-xs text-[#4a5568]">
            11-state P6 lifecycle for the construction-completion defect side of an IPP project — identified →
            assessed → assigned → in_remediation → reinspect_requested → reinspected → accepted → closed, with
            the reject_reinspection → assigned rejoin, on_hold park and void / withdraw exception terminals.
            Beats Procore Punch List, BIM 360 Field, PlanGrid Punch List, Fieldwire snag, Autodesk Construction
            Cloud Punch List, Bluebeam Revu Snag and Aconex Defects via: tier RE-DERIVED on every transition
            from priority × workflow class with FLOOR-AT-HIGH for blocks_commercial_operation / blocks_handover
            / life_safety_critical / warranty_critical; URGENT SLA polarity (COD-blocking = tightest; critical
            60min); ball-in-court tracking; authority tiered site_supervisor → quality_engineer →
            project_manager → project_director; LIVE battery decoration (minutes_until_sla, ipp_pm_quality_index
            0-130 vs Procore baseline=100, days_in_court, predicted_close_date_live, urgency_band). SIGNATURE
            regulator crossings (NERSA §C-5 + REIPPPP COD): close crosses EVERY tier with COD-blocking OR
            life-safety; accept high+critical with life-safety; reject_reinspection high+critical with
            COD-blocking; void EVERY tier with handover OR life-safety; sla_breached high+critical with COD
            OR life-safety.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total"        value={kpis?.total ?? rows.length} />
        <Kpi label="Open"         value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Closed"       value={kpis?.closed_count ?? 0} tone="ok" />
        <Kpi label="Voided"       value={kpis?.voided_count ?? 0} tone={(kpis?.voided_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Signature"    value={kpis?.signature_count ?? 0} tone={(kpis?.signature_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="COD-blocking" value={kpis?.cod_count ?? 0} tone={(kpis?.cod_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Handover blk" value={kpis?.handover_count ?? 0} tone={(kpis?.handover_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Life-safety"  value={kpis?.safety_count ?? 0} tone={(kpis?.safety_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable"   value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="IPP-PM qual"  value={fmtNum(kpis?.avg_quality_index)} />
        <Kpi label="Avg rejects"  value={fmtNum(kpis?.avg_rejection_count, 2)} tone={(kpis?.avg_rejection_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Remediation"  value={fmtZar(kpis?.total_remediation_cost_zar)} />
        <Kpi label="Recovered"    value={fmtZar(kpis?.total_recovered_zar)} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">No.</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / location</th>
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
                      {r.punch_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {r.signature_class_flag && <span className="ml-1 text-[#a06200]" title="Signature class (COD / handover / life-safety)">▲</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={`${r.project_name ?? ''} · ${r.identified_location ?? ''}`}>
                      {r.project_name ?? '—'}
                      {r.identified_location && <span className="text-[#4a5568]"> · {r.identified_location}</span>}
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
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No punch list items match.</td></tr>
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
  row: PunchRow;
  events: PunchEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: PunchRow) => void;
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
              <div className="font-mono text-[12px] text-[#4a5568]">{row.punch_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? '—'}{row.identified_at ? ` · ${row.identified_at.slice(0, 10)}` : ''}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {WORKFLOW_LABEL[row.workflow_class]}
                {row.contractor_name ? ` · ${row.contractor_name}` : ''}
                {row.identified_location ? ` · ${row.identified_location}` : ''}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Live IPP-PM battery</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Quality index" value={fmtNum(row.ipp_pm_quality_index_live, 0)} bad={(row.ipp_pm_quality_index_live ?? 0) < 100} hint="0-130 (Procore baseline=100; photo/root-cause/commissioning bonuses applied)" />
              <Metric label="Days open" value={String(row.days_open_live ?? 0)} />
              <Metric label="Days in court" value={String(row.days_in_court_live ?? 0)} bad={(row.days_in_court_live ?? 0) > 2} hint="Aging in current state" />
              <Metric label="Ball in court" value={row.ball_in_court_party_live ?? '—'} hint="Auto-derived from current state" />
              <Metric label="Tier (live)" value={TIER_TONE[row.tier_live].label} bad={row.tier_live === 'critical' || row.tier_live === 'high'} hint="Re-derived every transition" />
              <Metric label="Urgency band" value={URGENCY_TONE[row.urgency_band]?.label ?? row.urgency_band} bad={row.urgency_band === 'red' || row.urgency_band === 'amber'} />
              <Metric label="Predicted close" value={fmtDate(row.predicted_close_date_live)} hint="Tier-derived ETA" />
              <Metric label="Authority" value={authority} hint="Site supervisor → quality engineer → project manager → project director" />
            </div>
          </div>

          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Coverage flags (FLOOR-AT-HIGH)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Blocks COD" value={row.blocks_commercial_operation ? 'Yes' : 'No'} bad={!!row.blocks_commercial_operation} hint="NERSA §C-5 — blocks commercial operation" />
              <Metric label="Blocks handover" value={row.blocks_handover ? 'Yes' : 'No'} bad={!!row.blocks_handover} hint="REIPPPP COD prerequisite" />
              <Metric label="Life-safety" value={row.life_safety_critical ? 'Yes' : 'No'} bad={!!row.life_safety_critical} hint="OHSA s24 life-safety critical" />
              <Metric label="Warranty critical" value={row.warranty_critical ? 'Yes' : 'No'} bad={!!row.warranty_critical} hint="Triggers warranty cost-recovery on close" />
              <Metric label="Rejections" value={String(row.rejection_count ?? 0)} bad={(row.rejection_count ?? 0) > 0} />
              <Metric label="Reinspections" value={String(row.reinspection_count ?? 0)} bad={(row.reinspection_count ?? 0) > 1} />
              <Metric label="Photos" value={String(row.photo_evidence_count ?? 0)} hint="3+ photos = +10 quality" />
              <Metric label="Root cause" value={row.root_cause_documented ? 'Yes' : 'No'} hint="+5 quality" />
              <Metric label="Commissioning" value={row.commissioning_evidence ? 'Yes' : 'No'} hint="+5 quality" />
              <Metric label="Drawing ref" value={row.identified_drawing_ref ?? '—'} />
              <Metric label="Spec ref" value={row.identified_specification_ref ?? '—'} />
              <Metric label="Zone" value={row.identified_zone ?? '—'} />
            </div>
          </div>

          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Remediation economics</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Remediation cost" value={fmtZar(row.remediation_cost_zar)} bad={(row.remediation_cost_zar ?? 0) > 0} hint="Total cost expended on this punch" />
              <Metric label="Recovered" value={fmtZar(row.recovered_from_contractor_zar)} hint="Recovered from contractor (back-charge)" />
              <Metric label="Net to owner" value={fmtZar(((row.remediation_cost_zar ?? 0) - (row.recovered_from_contractor_zar ?? 0)))} bad={((row.remediation_cost_zar ?? 0) - (row.recovered_from_contractor_zar ?? 0)) > 0} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="Workflow class"     value={WORKFLOW_LABEL[row.workflow_class]} />
            <Pair label="Priority"           value={row.priority_class} />
            <Pair label="Identified at"      value={fmtDate(row.identified_at)} />
            <Pair label="Identified location" value={row.identified_location ?? '—'} />
            <Pair label="Zone"               value={row.identified_zone ?? '—'} />
            <Pair label="Drawing ref"        value={row.identified_drawing_ref ?? '—'} />
            <Pair label="Spec ref"           value={row.identified_specification_ref ?? '—'} />
            <Pair label="Contractor"         value={row.contractor_name ?? '—'} />
            <Pair label="Facility"           value={row.facility_name ?? '—'} />
            <Pair label="Owner"              value={row.owner_party_name ?? '—'} />
            <Pair label="Last responder"     value={row.last_responder_party ?? '—'} />
            <Pair label="Requester"          value={row.requester_party ?? '—'} />
            <Pair label="Approver"           value={row.approver_party ?? '—'} />
            <Pair label="COD blocker ref"    value={row.cod_blocker_ref ?? '—'} />
            <Pair label="Handover blocker"   value={row.handover_blocker_ref ?? '—'} />
            <Pair label="Warranty ref"       value={row.warranty_ref ?? '—'} />
            <Pair label="Regulator ref"      value={row.regulator_ref ?? '—'} />
            <Pair label="Assessed"           value={fmtDate(row.assessed_at)} />
            <Pair label="Assigned"           value={fmtDate(row.assigned_at)} />
            <Pair label="In remediation"     value={fmtDate(row.in_remediation_at)} />
            <Pair label="Reinspect req"      value={fmtDate(row.reinspect_requested_at)} />
            <Pair label="Reinspected"        value={fmtDate(row.reinspected_at)} />
            <Pair label="Accepted"           value={fmtDate(row.accepted_at)} />
            <Pair label="Closed"             value={fmtDate(row.closed_at)} />
            <Pair label="On hold"            value={fmtDate(row.on_hold_at)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA"                value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"     value={String(row.escalation_level)} />
            <Pair label="Reportable"         value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.title && <BasisBlock label="Title" tone="#1a3a5c" text={row.title} />}
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
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
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
