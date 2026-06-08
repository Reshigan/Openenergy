// Wave 26 — Cybersecurity incident chain (POPIA Section 22 + Cybercrimes Act Section 54).
//
// 12-state digital incident lifecycle surfaced as a P6 audit chain on
// Admin + Regulator + IPP workstations. Sister to W25 HSE chain.
//
//   • KPI strip: total / reportable open / notify-regulator pending / escalated / breached / records affected
//   • Filter pills by tier + chain state
//   • Listing with tier pill + records affected + SLA countdown
//   • Drill-down: timeline + per-state action button (13 transitions)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'detected' | 'triaged' | 'contained'
  | 'notified_regulator' | 'notified_subjects'
  | 'investigating'
  | 'remediation_planned' | 'remediation_executing'
  | 'verified' | 'closed'
  | 'escalated' | 'false_alarm';

type Tier = 'catastrophic' | 'major' | 'personal_data' | 'operational' | 'low';

interface CyberRow {
  id: string;
  case_number: string;
  asset_scope: string;
  asset_description: string | null;
  project_id: string | null;
  detected_at: string;
  reported_at: string;
  reported_by: string;
  incident_type: string;
  incident_tier: Tier;
  threat_vector: string | null;
  data_categories: string | null;
  records_affected: number;
  subjects_notified_count: number;
  containment_actions_taken: string | null;
  rca_summary: string | null;
  remediation_plan: string | null;
  linked_wo_id: string | null;
  regulator_notified: number;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  closure_notes: string | null;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  created_by: string;
  created_at: string;
}

interface CyberEvent {
  id: string;
  incident_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  detected:              { bg: '#fff4d6', fg: '#a06200', label: 'Detected' },
  triaged:               { bg: '#dbecfb', fg: '#1a3a5c', label: 'Triaged' },
  contained:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Contained' },
  notified_regulator:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'IR notified' },
  notified_subjects:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'Subjects notified' },
  investigating:         { bg: '#ffe4b5', fg: '#8a4a00', label: 'Investigating' },
  remediation_planned:   { bg: '#ffe4b5', fg: '#8a4a00', label: 'Remediation planned' },
  remediation_executing: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Remediation executing' },
  verified:              { bg: '#daf5e2', fg: '#1f6b3a', label: 'Verified' },
  escalated:             { bg: '#fde0e0', fg: '#9b1f1f', label: 'Escalated' },
  closed:                { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
  false_alarm:           { bg: '#e3e7ec', fg: '#557',    label: 'False alarm' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  catastrophic:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Catastrophic' },
  major:         { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major' },
  personal_data: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Personal data' },
  operational:   { bg: '#fff4d6', fg: '#a06200', label: 'Operational' },
  low:           { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                 label: 'Active' },
  { key: 'all',                    label: 'All' },
  { key: 'reportable',             label: 'Reportable' },
  { key: 'catastrophic',           label: 'Catastrophic' },
  { key: 'major',                  label: 'Major' },
  { key: 'personal_data',          label: 'Personal data' },
  { key: 'operational',            label: 'Operational' },
  { key: 'low',                    label: 'Low' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'escalated',              label: 'Escalated' },
  { key: 'detected',               label: 'Detected' },
  { key: 'triaged',                label: 'Triaged' },
  { key: 'contained',              label: 'Contained' },
  { key: 'notified_regulator',     label: 'IR notified' },
  { key: 'notified_subjects',      label: 'Subjects notified' },
  { key: 'investigating',          label: 'Investigating' },
  { key: 'remediation_planned',    label: 'Remediation planned' },
  { key: 'remediation_executing',  label: 'Remediation executing' },
  { key: 'verified',               label: 'Verified' },
  { key: 'closed',                 label: 'Closed' },
];

type ActionKind =
  | 'triage' | 'contain' | 'notify-regulator' | 'notify-subjects' | 'skip-notify'
  | 'begin-investigation' | 'complete-rca'
  | 'dispatch-remediation' | 'verify-remediation' | 'close'
  | 'escalate' | 'close-escalated'
  | 'mark-false-alarm' | 'close-false-alarm';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  detected:              'triage',
  triaged:               'contain',
  contained:             'notify-regulator',
  notified_regulator:    'notify-subjects',
  notified_subjects:     'begin-investigation',
  investigating:         'complete-rca',
  remediation_planned:   'dispatch-remediation',
  remediation_executing: 'verify-remediation',
  verified:              'close',
  escalated:             'close-escalated',
  false_alarm:           'close-false-alarm',
  closed:                null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'triage':              'Triage',
  'contain':             'Contain',
  'notify-regulator':    'Notify IR / SAPS',
  'notify-subjects':     'Notify data subjects',
  'skip-notify':         'Skip notify (internal)',
  'begin-investigation': 'Begin investigation',
  'complete-rca':        'Complete RCA',
  'dispatch-remediation':'Dispatch remediation',
  'verify-remediation':  'Verify remediation',
  'close':               'Close + archive',
  'escalate':            'Escalate',
  'close-escalated':     'Close escalated',
  'mark-false-alarm':    'Mark false alarm',
  'close-false-alarm':   'Close false alarm',
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

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-ZA');
}

export function CyberIncidentChainTab() {
  const [rows, setRows] = useState<CyberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<CyberRow | null>(null);
  const [events, setEvents] = useState<CyberEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CyberRow[] } }>('/cyber/incident-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load cyber incidents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: CyberRow; events: CyberEvent[] } }>(`/cyber/incident-chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load cyber incident history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'catastrophic' || filter === 'major' || filter === 'personal_data' || filter === 'operational' || filter === 'low') {
        return r.incident_tier === filter;
      }
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'escalated')  return r.chain_status === 'escalated' || r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let reportable_open = 0, notify_pending = 0, escalated = 0, breached = 0;
    let records_affected = 0;
    for (const r of rows) {
      if (r.is_reportable && !r.is_terminal) reportable_open++;
      if (r.is_reportable && r.chain_status === 'contained') notify_pending++;
      if (r.chain_status === 'escalated' || r.escalation_level > 0) escalated++;
      if (r.sla_breached) breached++;
      records_affected += r.records_affected || 0;
    }
    return { total: rows.length, reportable_open, notify_pending, escalated, breached, records_affected };
  }, [rows]);

  const act = useCallback(async (action: ActionKind, row: CyberRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'contain') {
        const actions = window.prompt('Containment actions taken:');
        if (actions) body.containment_actions_taken = actions;
      } else if (action === 'notify-regulator') {
        const defaultAuth = row.incident_tier === 'catastrophic' ? 'IR;SAPS_CYBERCRIME' : 'IR';
        const auth = window.prompt('Regulator authority (IR / SAPS_CYBERCRIME / IR;SAPS_CYBERCRIME):', defaultAuth);
        if (auth) body.regulator_authority = auth;
        const ref = window.prompt('Regulator reference (e.g. IR-POPIA22-2026-0067 or SAPS-CYB-2026-0028):');
        if (ref) body.regulator_ref = ref;
      } else if (action === 'notify-subjects') {
        const count = window.prompt('Number of data subjects notified:', String(row.records_affected || 0));
        if (count) body.subjects_notified_count = Number(count);
      } else if (action === 'complete-rca') {
        const rca = window.prompt('RCA summary:');
        if (!rca) return;
        body.rca_summary = rca;
        const plan = window.prompt('Remediation plan:');
        if (plan) body.remediation_plan = plan;
      } else if (action === 'dispatch-remediation') {
        const wo = window.prompt('Linked work order ID (optional):');
        if (wo) body.linked_wo_id = wo;
      } else if (action === 'mark-false-alarm') {
        const reason = window.prompt('False-alarm reason:');
        if (!reason) return;
        body.closure_notes = reason;
      } else if (action === 'close' || action === 'close-escalated' || action === 'close-false-alarm') {
        const notes = window.prompt('Closure notes:');
        if (notes) body.closure_notes = notes;
      }
      await api.post(`/cyber/incident-chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Cybersecurity incident chain</h2>
          <p className="text-xs text-[#4a5568]">
            POPIA Section 22 (Information Regulator) + Cybercrimes Act Section 54 (SAPS Cybercrime) lifecycle ·
            detected → triaged → contained → IR notified → subjects notified → investigating → remediation → verified → closed.
            Catastrophic 30m triage; major/personal-data 72h IR notification. Reportable-tier escalations and breaches cross into the regulator inbox.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total incidents"     value={kpis.total} />
        <Kpi label="Reportable open"     value={kpis.reportable_open} tone={kpis.reportable_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="IR notify pending"   value={kpis.notify_pending}  tone={kpis.notify_pending > 0 ? 'warn' : 'ok'} />
        <Kpi label="Escalated"           value={kpis.escalated}       tone={kpis.escalated > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached"        value={kpis.breached}        tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Records affected"    value={fmtNumber(kpis.records_affected)} tone={kpis.records_affected > 0 ? 'warn' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Case #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Asset scope</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Type</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Records</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Detected</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Reg ref</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.incident_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">{r.case_number}</td>
                    <td className="px-3 py-2 text-[#1a3a5c]">{r.asset_scope}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.incident_type}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtNumber(r.records_affected)}</td>
                    <td className="px-3 py-2 tabular-nums text-[#4a5568]">{fmtDate(r.detected_at)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#4a5568]">{r.regulator_ref ?? '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No cyber incidents match.</td></tr>
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
  row: CyberRow;
  events: CyberEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: CyberRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canEscalate =
    row.chain_status === 'investigating' ||
    row.chain_status === 'remediation_planned' ||
    row.chain_status === 'remediation_executing';
  const canFalseAlarm = row.chain_status === 'detected' || row.chain_status === 'triaged';
  // From contained you can skip IR notification if the incident is NOT reportable (operational / low)
  const canSkipNotify = row.chain_status === 'contained' && !row.is_reportable;

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
              <div className="text-base font-semibold text-[#0c2a4d]">{row.asset_scope}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {row.incident_type} · {TIER_TONE[row.incident_tier].label} ·
                {fmtNumber(row.records_affected)} record{row.records_affected === 1 ? '' : 's'} affected
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Detected"           value={fmtDate(row.detected_at)} />
            <Pair label="Reported"           value={fmtDate(row.reported_at)} />
            <Pair label="Reported by"        value={row.reported_by} />
            <Pair label="Asset"              value={row.asset_description ?? '—'} />
            <Pair label="Threat vector"      value={row.threat_vector ?? '—'} />
            <Pair label="Data categories"    value={row.data_categories ?? '—'} />
            <Pair label="Project"            value={row.project_id ?? '—'} />
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="Regulator"          value={row.regulator_authority ?? '—'} />
            <Pair label="Regulator ref"      value={row.regulator_ref ?? '—'} />
            <Pair label="Subjects notified"  value={fmtNumber(row.subjects_notified_count)} />
            <Pair label="Linked WO"          value={row.linked_wo_id ?? '—'} />
            <Pair label="Escalation"         value={String(row.escalation_level)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"         value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
          </div>
          {row.containment_actions_taken && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Containment actions</div>
              {row.containment_actions_taken}
            </div>
          )}
          {row.rca_summary && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">RCA summary</div>
              {row.rca_summary}
            </div>
          )}
          {row.remediation_plan && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Remediation plan</div>
              {row.remediation_plan}
            </div>
          )}
          {row.closure_notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Closure notes</div>
              {row.closure_notes}
            </div>
          )}
        </section>

        {(nextAction || canEscalate || canFalseAlarm || canSkipNotify) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canSkipNotify && (
                <button type="button"
                  onClick={() => onAct('skip-notify', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  Skip notify (internal)
                </button>
              )}
              {canEscalate && (
                <button type="button"
                  onClick={() => onAct('escalate', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.escalate}
                </button>
              )}
              {canFalseAlarm && (
                <button type="button"
                  onClick={() => onAct('mark-false-alarm', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['mark-false-alarm']}
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

export default CyberIncidentChainTab;
