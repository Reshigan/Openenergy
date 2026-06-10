// Wave 31 — Regulator Compliance Notice Disposition chain — NERSA Act §10.
//
// 11-state lifecycle for how the Regulator disposes of every inbox notice
// crossed in by other waves (W18 critical outages, W21 senior drawdowns,
// W22 strategic PPA terminations, W23 catastrophic insurance, W25 fatal HSE,
// W26 catastrophic cyber, W27 high-scoring ED, W29 prop/MM position limits,
// W30 lender clawbacks/SLA breaches, etc).
//
// INVERTED tier SLA — critical disposed fastest (4h triage, 30d total);
// low slowest (7d triage, 180d total). Medium (90d) matches §10 statutory window.
// Council crossings: close+escalate for critical+high; SLA breach for ALL tiers.
// dismiss/refer are audit-only.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { prompt } from '../PromptDialog';

type ChainStatus =
  | 'received' | 'triaged' | 'assigned' | 'investigating'
  | 'action_required' | 'action_in_progress' | 'action_completed'
  | 'closed' | 'escalated' | 'dismissed' | 'referred';

type Tier = 'critical' | 'high' | 'medium' | 'low';

interface DispositionRow {
  id: string;
  case_number: string;
  source_inbox_id: string | null;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  source_party: string | null;
  notice_subject: string;
  severity_tier: Tier;
  assigned_officer: string | null;
  assigned_directorate: string | null;
  investigation_findings: string | null;
  required_action: string | null;
  action_evidence_ref: string | null;
  disposition_outcome: string | null;
  referred_authority: string | null;
  referred_ref: string | null;
  council_panel_ref: string | null;
  council_minute_ref: string | null;
  section10_report_ref: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  regulator_authority: string;
  regulator_ref: string | null;
  chain_status: ChainStatus;
  received_at: string;
  triaged_at: string | null;
  assigned_at: string | null;
  investigating_at: string | null;
  action_required_at: string | null;
  action_in_progress_at: string | null;
  action_completed_at: string | null;
  closed_at: string | null;
  escalated_at: string | null;
  dismissed_at: string | null;
  referred_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  breach_crosses_council?: boolean;
  sla_window_minutes?: number;
  created_by: string;
  created_at: string;
}

interface DispositionEvent {
  id: string;
  disposition_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  received:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Received' },
  triaged:            { bg: '#fff4d6', fg: '#a06200', label: 'Triaged' },
  assigned:           { bg: '#fbe7d0', fg: '#7a4500', label: 'Assigned' },
  investigating:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Investigating' },
  action_required:    { bg: '#fff4d6', fg: '#a06200', label: 'Action req' },
  action_in_progress: { bg: '#fbe7d0', fg: '#7a4500', label: 'Action exec' },
  action_completed:   { bg: '#daf5e2', fg: '#1f6b3a', label: 'Action done' },
  closed:             { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Closed' },
  escalated:          { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Escalated' },
  dismissed:          { bg: '#e3e7ec', fg: '#557',    label: 'Dismissed' },
  referred:           { bg: '#dbcffb', fg: '#3a1a5c', label: 'Referred' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  medium:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium' },
  low:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'Low' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active' },
  { key: 'all',                 label: 'All' },
  { key: 'reportable',          label: '§10 reportable' },
  { key: 'critical',            label: 'Critical' },
  { key: 'high',                label: 'High' },
  { key: 'medium',              label: 'Medium' },
  { key: 'low',                 label: 'Low' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'received',            label: 'Received' },
  { key: 'triaged',             label: 'Triaged' },
  { key: 'assigned',            label: 'Assigned' },
  { key: 'investigating',       label: 'Investigating' },
  { key: 'action_required',     label: 'Action req' },
  { key: 'action_in_progress',  label: 'Action exec' },
  { key: 'action_completed',    label: 'Action done' },
  { key: 'closed',              label: 'Closed' },
  { key: 'escalated',           label: 'Escalated' },
  { key: 'dismissed',           label: 'Dismissed' },
  { key: 'referred',            label: 'Referred' },
];

type ActionKind =
  | 'triage' | 'assign' | 'begin-investigation' | 'require-action'
  | 'begin-action' | 'complete-action' | 'close'
  | 'escalate' | 'dismiss' | 'refer';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  received:           'triage',
  triaged:            'assign',
  assigned:           'begin-investigation',
  investigating:      'require-action',
  action_required:    'begin-action',
  action_in_progress: 'complete-action',
  action_completed:   'close',
  closed:             null,
  escalated:          null,
  dismissed:          null,
  referred:           null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'triage':              'Triage',
  'assign':              'Assign officer + directorate',
  'begin-investigation': 'Begin investigation',
  'require-action':      'Require action',
  'begin-action':        'Begin action',
  'complete-action':     'Complete action',
  'close':               'Close (Council ratification)',
  'escalate':            'Escalate to Council panel',
  'dismiss':             'Dismiss (false alarm / no jurisdiction)',
  'refer':               'Refer to other authority',
};

const ESCALATABLE: ChainStatus[] = [
  'triaged', 'assigned', 'investigating',
  'action_required', 'action_in_progress', 'action_completed',
];

const DISMISSABLE: ChainStatus[] = ['received', 'triaged', 'investigating'];

const REFERABLE: ChainStatus[] = ['received', 'triaged', 'investigating'];

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

interface KpiSummary {
  total: number;
  investigating_open: number;
  action_open: number;
  closed_count: number;
  escalated_count: number;
  dismissed_count: number;
  referred_count: number;
  open_count: number;
  breached: number;
  reportable_total: number;
  reportable_terminal_total: number;
  critical_open: number;
  high_open: number;
}

export function DispositionChainTab() {
  const [rows, setRows] = useState<DispositionRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<DispositionRow | null>(null);
  const [events, setEvents] = useState<DispositionEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: DispositionRow[] } & KpiSummary }>('/disposition/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          investigating_open: data.investigating_open || 0,
          action_open: data.action_open || 0,
          closed_count: data.closed_count || 0,
          escalated_count: data.escalated_count || 0,
          dismissed_count: data.dismissed_count || 0,
          referred_count: data.referred_count || 0,
          open_count: data.open_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          reportable_terminal_total: data.reportable_terminal_total || 0,
          critical_open: data.critical_open || 0,
          high_open: data.high_open || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load disposition chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: DispositionRow; events: DispositionEvent[] } }>(`/disposition/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load case history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'critical' || filter === 'high' || filter === 'medium' || filter === 'low') {
        return r.severity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, investigating_open: 0, action_open: 0,
    closed_count: 0, escalated_count: 0, dismissed_count: 0, referred_count: 0,
    open_count: 0, breached: 0, reportable_total: 0, reportable_terminal_total: 0,
    critical_open: 0, high_open: 0,
  };

  const act = useCallback(async (action: ActionKind, row: DispositionRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'triage') {
        const tier = await prompt('Severity tier (critical / high / medium / low):', row.severity_tier);
        if (tier && (tier === 'critical' || tier === 'high' || tier === 'medium' || tier === 'low')) {
          body.severity_tier = tier;
        }
      } else if (action === 'assign') {
        const officer = await prompt('Assigned officer (eg "M. Mthembu"):');
        if (!officer) return;
        body.assigned_officer = officer;
        const dir = await prompt('Directorate (eg "Electricity Subcommittee — Markets"):');
        if (dir) body.assigned_directorate = dir;
      } else if (action === 'require-action') {
        const findings = await prompt('Investigation findings (RCA summary):');
        if (!findings) return;
        body.investigation_findings = findings;
        const req = await prompt('Required action (directive / order / corrective plan):');
        if (!req) return;
        body.required_action = req;
      } else if (action === 'complete-action') {
        const ref = await prompt('Action evidence reference (eg "NERSA-COA-2026-0142"):');
        if (ref) body.action_evidence_ref = ref;
      } else if (action === 'close') {
        const outcome = await prompt('Disposition outcome (rationale + Council ratification):');
        if (!outcome) return;
        body.disposition_outcome = outcome;
        const council = await prompt('Council panel reference (eg "COUNCIL-PANEL-2026-0044"):');
        if (council) body.council_panel_ref = council;
        const minute = await prompt('Council minute reference:');
        if (minute) body.council_minute_ref = minute;
        const s10 = await prompt('§10 monthly report reference:');
        if (s10) body.section10_report_ref = s10;
        const regRef = await prompt('NERSA disposition reference (eg "NERSA-DISP-2026-0042"):');
        if (regRef) body.regulator_ref = regRef;
      } else if (action === 'escalate') {
        const council = await prompt('Council senior panel reference (mandatory):');
        if (!council) return;
        body.council_panel_ref = council;
        const minute = await prompt('Council minute reference:');
        if (minute) body.council_minute_ref = minute;
        const reason = await prompt('Reason code (eg "SYSTEMIC_RISK", "FATAL_SAFETY", "S10_OVERDUE"):');
        if (reason) body.reason_code = reason;
        const rod = await prompt('ROD notes (escalation rationale):');
        if (!rod) return;
        body.rod_notes = rod;
      } else if (action === 'dismiss') {
        const reason = await prompt('Reason code (eg "NO_JURISDICTION", "FALSE_ALARM", "DUPLICATE"):');
        if (!reason) return;
        body.reason_code = reason;
        const rod = await prompt('ROD notes (dismissal rationale — audit trail):');
        if (!rod) return;
        body.rod_notes = rod;
      } else if (action === 'refer') {
        const auth = await prompt('Referred authority (eg "SAPS — Cybercrime Unit", "DMRE — IPPO", "FSCA — Market Conduct"):');
        if (!auth) return;
        body.referred_authority = auth;
        const ref = await prompt('Referred reference / case number:');
        if (ref) body.referred_ref = ref;
        const reason = await prompt('Reason code (eg "CRIMINAL_NEXUS", "DMRE_JURISDICTION"):');
        if (reason) body.reason_code = reason;
        const rod = await prompt('ROD notes (referral rationale):');
        if (!rod) return;
        body.rod_notes = rod;
      }
      await api.post(`/disposition/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Compliance Notice Disposition — NERSA Act §10</h2>
          <p className="text-xs text-[#4a5568]">
            11-state lifecycle for how the Regulator disposes of every inbox notice
            crossed in by other waves: received → triaged → assigned → investigating →
            action required → action in progress → action completed → closed
            (branches: escalated, dismissed, referred). INVERTED tier SLA — critical
            disposed fastest (4h triage, 30d total); medium matches §10 statutory 90d.
            Council crossings: close+escalate for critical+high; SLA breach for ALL
            tiers (Section 10 hard line — DG-level reporting).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"           value={kpis.total} />
        <Kpi label="Investigating"   value={kpis.investigating_open}  tone={kpis.investigating_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Action phase"    value={kpis.action_open}         tone={kpis.action_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Closed"          value={kpis.closed_count} />
        <Kpi label="Escalated"       value={kpis.escalated_count}     tone={kpis.escalated_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"    value={kpis.breached}            tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Critical open"   value={kpis.critical_open}       tone={kpis.critical_open > 0 ? 'bad' : 'ok'} />
        <Kpi label="§10 reportable"  value={kpis.reportable_total} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>High open: <span className="font-semibold text-[#a06200]">{kpis.high_open}</span></span>
        <span>Referred: <span className="font-semibold text-[#3a1a5c]">{kpis.referred_count}</span></span>
        <span>Dismissed: <span className="font-semibold text-[#557]">{kpis.dismissed_count}</span></span>
        <span>Open cases: <span className="font-semibold text-[#1a3a5c]">{kpis.open_count}</span></span>
        <span>§10 closed/escalated: <span className="font-semibold text-[#1f5b3a]">{kpis.reportable_terminal_total}</span></span>
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Source / Party</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Subject</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Officer / Directorate</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Council / §10</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.severity_tier];
                const councilRef = r.council_panel_ref ?? r.section10_report_ref ?? r.referred_authority ?? '—';
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">{r.case_number}</td>
                    <td className="px-3 py-2 text-[#1a3a5c]">
                      <div className="font-medium">{r.source_wave ?? '—'}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.source_party ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] max-w-[280px]">
                      <div className="truncate" title={r.notice_subject}>{r.notice_subject}</div>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="font-medium text-[11px]">{r.assigned_officer ?? '—'}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.assigned_directorate ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#4a5568]">{councilRef}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No disposition cases match.</td></tr>
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
  row: DispositionRow;
  events: DispositionEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: DispositionRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canEscalate = ESCALATABLE.includes(row.chain_status);
  const canDismiss = DISMISSABLE.includes(row.chain_status);
  const canRefer = REFERABLE.includes(row.chain_status);

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
              <div className="text-base font-semibold text-[#0c2a4d]">{row.notice_subject}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.severity_tier].label} · {row.source_wave ?? '—'} · {row.source_party ?? '—'}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Source wave"           value={row.source_wave ?? '—'} />
            <Pair label="Source event"          value={row.source_event ?? '—'} />
            <Pair label="Source entity"         value={`${row.source_entity_type ?? '—'} / ${row.source_entity_id ?? '—'}`} />
            <Pair label="Source inbox"          value={row.source_inbox_id ?? '—'} />
            <Pair label="Source party"          value={row.source_party ?? '—'} />
            <Pair label="Severity tier"          value={TIER_TONE[row.severity_tier].label} />
            <Pair label="Assigned officer"      value={row.assigned_officer ?? '—'} />
            <Pair label="Directorate"            value={row.assigned_directorate ?? '—'} />
            <Pair label="State"                  value={STATE_TONE[row.chain_status].label} />
            <Pair label="Regulator authority"   value={row.regulator_authority} />
            <Pair label="Regulator ref"          value={row.regulator_ref ?? '—'} />
            <Pair label="Council panel"         value={row.council_panel_ref ?? '—'} />
            <Pair label="Council minute"        value={row.council_minute_ref ?? '—'} />
            <Pair label="§10 monthly report"    value={row.section10_report_ref ?? '—'} />
            <Pair label="Referred authority"    value={row.referred_authority ?? '—'} />
            <Pair label="Referred ref"          value={row.referred_ref ?? '—'} />
            <Pair label="Action evidence"       value={row.action_evidence_ref ?? '—'} />
            <Pair label="Reason code"           value={row.reason_code ?? '—'} />
            <Pair label="Escalation level"      value={String(row.escalation_level)} />
            <Pair label="SLA deadline"          value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"            value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Received"               value={fmtDate(row.received_at)} />
            <Pair label="Triaged"                value={fmtDate(row.triaged_at)} />
            <Pair label="Closed"                 value={fmtDate(row.closed_at)} />
          </div>
          {row.investigation_findings && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Investigation findings</div>
              {row.investigation_findings}
            </div>
          )}
          {row.required_action && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Required action</div>
              {row.required_action}
            </div>
          )}
          {row.disposition_outcome && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Disposition outcome</div>
              {row.disposition_outcome}
            </div>
          )}
          {row.rod_notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">ROD notes</div>
              {row.rod_notes}
            </div>
          )}
        </section>

        {(nextAction || canEscalate || canDismiss || canRefer) && (
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
              {canEscalate && (
                <button type="button"
                  onClick={() => onAct('escalate', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['escalate']}
                </button>
              )}
              {canDismiss && (
                <button type="button"
                  onClick={() => onAct('dismiss', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['dismiss']}
                </button>
              )}
              {canRefer && (
                <button type="button"
                  onClick={() => onAct('refer', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3a1a5c] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['refer']}
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

export default DispositionChainTab;
