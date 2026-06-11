// Wave 41 — OEM-Support ITIL Problem Management lifecycle tab.
//
// Root-cause management of recurring / systemic incidents (ITIL 4 + ISO/IEC
// 20000-1 §8.6.3). The proactive, structural complement to the reactive
// per-ticket W14 incident management — and distinct from W15 RMA + W35
// vendor-escalation. The unit of work is the underlying CAUSE: take a pattern
// of recurring incidents, find and document the root cause, register a Known
// Error with a workaround, drive a permanent fix through change management,
// deploy it, and verify the incidents stop.
//
// Forward path: logged → categorized → investigating → rca_identified →
//   known_error → fix_proposed → change_raised → fix_deployed →
//   resolution_verified → closed. Workaround short-circuit: known_error →
//   closed. Escalation branch from investigating|rca_identified|known_error.
//   Early cancel from logged|categorized|investigating.
//
// URGENT SLA — the more severe the problem, the tighter every window.
//
// Write model — SINGLE-PARTY {admin, support}. No access split; actor_party
// records the ITIL functional party (problem_manager / resolver / change_mgmt)
// for audit attribution only. Reportability: MAJOR PROBLEMS ONLY cross into the
// regulator inbox (escalate + close + sla_breached for major_problem).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'problem_logged' | 'categorized' | 'investigating' | 'rca_identified'
  | 'known_error' | 'fix_proposed' | 'change_raised' | 'fix_deployed'
  | 'resolution_verified' | 'closed' | 'escalated' | 'cancelled';

type Tier = 'major_problem' | 'significant' | 'minor';

interface ProblemRow {
  [key: string]: unknown;
  id: string;
  problem_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  owner_party_id: string;
  owner_party_name: string;
  service_name: string;
  affected_tenant: string | null;
  problem_category: string | null;
  problem_priority: Tier;
  recurring_incident_count: number;
  known_error_ref: string | null;
  change_request_ref: string | null;
  major_problem_ref: string | null;
  regulator_ref: string | null;
  problem_summary: string | null;
  investigation_basis: string | null;
  rca_basis: string | null;
  known_error_basis: string | null;
  fix_basis: string | null;
  change_basis: string | null;
  verification_basis: string | null;
  workaround: string | null;
  reason_code: string | null;
  closure_notes: string | null;
  chain_status: ChainStatus;
  problem_logged_at: string;
  categorized_at: string | null;
  investigating_at: string | null;
  rca_identified_at: string | null;
  known_error_at: string | null;
  fix_proposed_at: string | null;
  change_raised_at: string | null;
  fix_deployed_at: string | null;
  resolution_verified_at: string | null;
  closed_at: string | null;
  escalated_at: string | null;
  cancelled_at: string | null;
  is_reportable: boolean;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  breach_crosses_regulator?: boolean;
}

interface ProblemEvent {
  id: string;
  problem_id: string;
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
  escalated_count: number;
  cancelled_count: number;
  known_error_count: number;
  in_change_count: number;
  breached: number;
  reportable_total: number;
  major_open: number;
  total_recurring: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  problem_logged:      { bg: '#e3e7ec', fg: '#557',    label: 'Logged' },
  categorized:         { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Categorized' },
  investigating:       { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Investigating' },
  rca_identified:      { bg: '#fff4d6', fg: '#a06200', label: 'RCA identified' },
  known_error:         { bg: '#fff4d6', fg: '#a06200', label: 'Known error' },
  fix_proposed:        { bg: '#ffe9d6', fg: '#8a4a00', label: 'Fix proposed' },
  change_raised:       { bg: '#ffe9d6', fg: '#8a4a00', label: 'Change raised' },
  fix_deployed:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Fix deployed' },
  resolution_verified: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Resolution verified' },
  closed:              { bg: '#d4edda', fg: '#155724', label: 'Closed' },
  escalated:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'Escalated' },
  cancelled:           { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  major_problem: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Major' },
  significant:   { bg: '#ffe4b5', fg: '#8a4a00', label: 'Significant' },
  minor:         { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active' },
  { key: 'all',                 label: 'All' },
  { key: 'major_problem',       label: 'Major' },
  { key: 'significant',         label: 'Significant' },
  { key: 'minor',               label: 'Minor' },
  { key: 'known_error',         label: 'Known errors' },
  { key: 'in_change',           label: 'In change' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'reportable',          label: 'Reportable' },
  { key: 'problem_logged',      label: 'Logged' },
  { key: 'categorized',         label: 'Categorized' },
  { key: 'investigating',       label: 'Investigating' },
  { key: 'rca_identified',      label: 'RCA identified' },
  { key: 'fix_proposed',        label: 'Fix proposed' },
  { key: 'change_raised',       label: 'Change raised' },
  { key: 'fix_deployed',        label: 'Fix deployed' },
  { key: 'resolution_verified', label: 'Verified' },
  { key: 'closed',              label: 'Closed' },
  { key: 'escalated',           label: 'Escalated' },
  { key: 'cancelled',           label: 'Cancelled' },
];

type ActionKind =
  | 'categorize' | 'begin-investigation' | 'identify-rca' | 'log-known-error'
  | 'propose-fix' | 'accept-workaround' | 'raise-change' | 'deploy-fix'
  | 'verify-resolution' | 'close' | 'escalate' | 'cancel';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  problem_logged:      'categorize',
  categorized:         'begin-investigation',
  investigating:       'identify-rca',
  rca_identified:      'log-known-error',
  known_error:         'propose-fix',
  fix_proposed:        'raise-change',
  change_raised:       'deploy-fix',
  fix_deployed:        'verify-resolution',
  resolution_verified: 'close',
  closed:              null,
  escalated:           null,
  cancelled:           null,
};

// Party annotation per action — the ITIL functional owner. Problem manager
// owns intake/triage + closure/escalation; the resolver owns the technical
// investigation; change management owns the fix rollout.
const ACTION_LABEL: Record<ActionKind, string> = {
  'categorize':          'Categorize (problem mgr)',
  'begin-investigation': 'Begin investigation (resolver)',
  'identify-rca':        'Identify root cause (resolver)',
  'log-known-error':     'Log known error (resolver)',
  'propose-fix':         'Propose permanent fix (resolver)',
  'accept-workaround':   'Accept workaround — close (problem mgr)',
  'raise-change':        'Raise change (change mgmt)',
  'deploy-fix':          'Deploy fix (change mgmt)',
  'verify-resolution':   'Verify resolution (resolver)',
  'close':               'Close problem (problem mgr)',
  'escalate':            'Escalate (problem mgr)',
  'cancel':              'Cancel (problem mgr)',
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

const TERMINAL_STATES: ChainStatus[] = ['closed', 'escalated', 'cancelled'];
const IN_CHANGE_STATES: ChainStatus[] = ['change_raised', 'fix_deployed'];

interface ActionModalConfig {
  action: ActionKind;
  row: ProblemRow;
  fields: Array<{ key: string; label: string; required?: boolean; defaultValue?: string; multiline?: boolean }>;
}

export function ProblemManagementChainTab() {
  const [rows, setRows] = useState<ProblemRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ProblemRow | null>(null);
  const [events, setEvents] = useState<ProblemEvent[]>([]);
  const [pendingAction, setPendingAction] = useState<ActionModalConfig | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ProblemRow[] } & KpiSummary }>('/problem-management/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, closed_count: d.closed_count,
          escalated_count: d.escalated_count, cancelled_count: d.cancelled_count,
          known_error_count: d.known_error_count, in_change_count: d.in_change_count,
          breached: d.breached, reportable_total: d.reportable_total,
          major_open: d.major_open, total_recurring: d.total_recurring,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load problem records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ProblemRow; events: ProblemEvent[] } }>(
        `/problem-management/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load problem history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'major_problem') return r.problem_priority === 'major_problem';
      if (filter === 'significant')   return r.problem_priority === 'significant';
      if (filter === 'minor')         return r.problem_priority === 'minor';
      if (filter === 'in_change')  return IN_CHANGE_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const ACTION_FIELDS: Record<ActionKind, ActionModalConfig['fields']> = {
    'categorize': [
      { key: 'problem_category', label: 'Problem category (e.g. capacity, change-induced, config drift)' },
      { key: 'problem_summary', label: 'Problem summary — the recurring pattern in one line', required: true, multiline: true },
    ],
    'begin-investigation': [
      { key: 'investigation_basis', label: 'Investigation basis — hypothesis + diagnostic approach', multiline: true },
    ],
    'identify-rca': [
      { key: 'rca_basis', label: 'Root-cause basis — the confirmed underlying cause', required: true, multiline: true },
    ],
    'log-known-error': [
      { key: 'known_error_ref', label: 'Known-error reference (e.g. KE-2026-0042)', required: true },
      { key: 'workaround', label: 'Workaround — interim mitigation while a permanent fix is built', multiline: true },
      { key: 'known_error_basis', label: 'Known-error basis — symptom ↔ cause linkage', multiline: true },
    ],
    'propose-fix': [
      { key: 'fix_basis', label: 'Proposed permanent fix — what change eliminates the root cause', required: true, multiline: true },
    ],
    'accept-workaround': [
      { key: 'workaround', label: 'Accepted workaround — why no permanent fix is warranted', required: true, multiline: true },
      { key: 'closure_notes', label: 'Closure notes — risk acceptance / review date', multiline: true },
    ],
    'raise-change': [
      { key: 'change_request_ref', label: 'Change request reference (e.g. CR-2026-0117)', required: true },
      { key: 'change_basis', label: 'Change basis — scope, rollback plan, change window', multiline: true },
    ],
    'deploy-fix': [
      { key: 'change_basis', label: 'Deployment basis — release / migration that shipped the fix', multiline: true },
    ],
    'verify-resolution': [
      { key: 'verification_basis', label: 'Verification basis — evidence the incidents stopped recurring', required: true, multiline: true },
    ],
    'close': [
      { key: 'closure_notes', label: 'Closure notes — outcome + permanent-fix confirmation', required: true, multiline: true },
    ],
    'escalate': [
      { key: 'major_problem_ref', label: 'Major-problem / major-incident reference (e.g. MI-2026-0007)' },
      { key: 'regulator_ref', label: 'Regulator reference, if a reportable major problem (e.g. NERSA-NOTIFY-2026-0033)' },
      { key: 'closure_notes', label: 'Escalation basis — why this needs major-problem governance', required: true, multiline: true },
    ],
    'cancel': [
      { key: 'closure_notes', label: 'Cancellation reason (e.g. duplicate, not-a-problem, working-as-designed)', required: true, multiline: true },
    ],
  };

  const act = useCallback((action: ActionKind, row: ProblemRow) => {
    setPendingAction({ action, row, fields: ACTION_FIELDS[action] });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitAction = useCallback(async (values: Record<string, string>) => {
    if (!pendingAction) return;
    const { action, row } = pendingAction;
    setPendingAction(null);
    try {
      const body: Record<string, string | number> = { ...values };
      if (action === 'accept-workaround') body.reason_code = 'workaround_accepted';
      if (action === 'close') body.reason_code = 'resolved_permanently';
      if (action === 'escalate') body.reason_code = 'escalated_major';
      if (action === 'cancel') body.reason_code = 'cancelled';
      await api.post(`/problem-management/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [pendingAction, load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Problem management</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage ITIL problem chain · logged → categorized → investigating → RCA identified → known error →
            fix proposed → change raised → fix deployed → resolution verified → closed. A known error can short-circuit
            to closed on an accepted workaround; investigations can escalate to major-problem governance; early records
            can cancel. Root-cause management of recurring incidents — the structural complement to per-ticket support.
            URGENT SLA: the more severe the problem, the tighter every window. Major problems cross to the regulator
            inbox on escalate, close, and SLA breach (ITIL 4 + ISO/IEC 20000-1 §8.6.3).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Major open" value={kpis?.major_open ?? 0} tone={(kpis?.major_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Known errors" value={kpis?.known_error_count ?? 0} tone={(kpis?.known_error_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In change" value={kpis?.in_change_count ?? 0} tone={(kpis?.in_change_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Closed" value={kpis?.closed_count ?? 0} tone="ok" />
        <Kpi label="Escalated" value={kpis?.escalated_count ?? 0} tone={(kpis?.escalated_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cancelled" value={kpis?.cancelled_count ?? 0} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Recurring incidents" value={kpis?.total_recurring ?? 0} />
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
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)]">Problem #</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)]">Service / owner</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)]">Priority</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)]">Category</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)] text-right">Recurring</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)]">State</th>
                <th className="px-3 py-2 font-semibold text-[oklch(0.46_0.16_55)] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.problem_priority];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[oklch(0.46_0.16_55)]">
                      {r.problem_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.service_name} · ${r.owner_party_name}`}>
                      {r.service_name}
                      <span className="text-[#4a5568]"> · {r.owner_party_name}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.problem_category ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[oklch(0.46_0.16_55)]">{r.recurring_incident_count || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No problem records match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
      {pendingAction && (
        <ActionModal
          title={ACTION_LABEL[pendingAction.action]}
          fields={pendingAction.fields}
          row={pendingAction.row}
          onSubmit={submitAction}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}

function ActionModal({
  title, fields, row, onSubmit, onCancel,
}: {
  title: string;
  fields: Array<{ key: string; label: string; required?: boolean; defaultValue?: string; multiline?: boolean }>;
  row: ProblemRow;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      init[f.key] = f.defaultValue ?? (typeof row[f.key] === 'string' ? (row[f.key] as string) : '') ?? '';
    }
    return init;
  });
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const handleSubmit = () => {
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        setSubmitErr(`"${f.label}" is required.`);
        return;
      }
    }
    onSubmit(values);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0c2a4d]">{title}</span>
            <button type="button" onClick={onCancel} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>
        <div className="px-5 py-4 space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-[11px] uppercase tracking-wider text-[#4a5568] mb-1">
                {f.label}{f.required && <span className="text-red-600 ml-0.5">*</span>}
              </label>
              {f.multiline ? (
                <textarea
                  rows={3}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="w-full rounded border border-[#d8dde6] px-2 py-1.5 text-[12px] text-[#0c2a4d] focus:outline-none focus:border-[#c2873a]"
                />
              ) : (
                <input
                  type="text"
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="w-full rounded border border-[#d8dde6] px-2 py-1.5 text-[12px] text-[#0c2a4d] focus:outline-none focus:border-[#c2873a]"
                />
              )}
            </div>
          ))}
          {submitErr && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{submitErr}</div>
          )}
        </div>
        <footer className="border-t border-[#d8dde6] bg-[#f3f5f9] px-5 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            Confirm
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

function Drawer({
  row, events, onClose, onAct,
}: {
  row: ProblemRow;
  events: ProblemEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ProblemRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canWorkaround = row.chain_status === 'known_error';
  const canEscalate = ['investigating', 'rca_identified', 'known_error'].includes(row.chain_status);
  const canCancel = ['problem_logged', 'categorized', 'investigating'].includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.problem_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.service_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.problem_priority].label} · owner {row.owner_party_name}
                {row.affected_tenant ? ` · tenant ${row.affected_tenant}` : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"               value={STATE_TONE[row.chain_status].label} />
            <Pair label="Priority"            value={TIER_TONE[row.problem_priority].label} />
            <Pair label="Category"            value={row.problem_category ?? '—'} />
            <Pair label="Recurring incidents" value={String(row.recurring_incident_count ?? 0)} />
            <Pair label="Known error ref"     value={row.known_error_ref ?? '—'} />
            <Pair label="Change request ref"  value={row.change_request_ref ?? '—'} />
            <Pair label="Major problem ref"   value={row.major_problem_ref ?? '—'} />
            <Pair label="Regulator ref"       value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"         value={row.reason_code ?? '—'} />
            <Pair label="Logged"              value={fmtDate(row.problem_logged_at)} />
            <Pair label="Categorized"         value={fmtDate(row.categorized_at)} />
            <Pair label="Investigating"       value={fmtDate(row.investigating_at)} />
            <Pair label="RCA identified"      value={fmtDate(row.rca_identified_at)} />
            <Pair label="Known error"         value={fmtDate(row.known_error_at)} />
            <Pair label="Fix proposed"        value={fmtDate(row.fix_proposed_at)} />
            <Pair label="Change raised"       value={fmtDate(row.change_raised_at)} />
            <Pair label="Fix deployed"        value={fmtDate(row.fix_deployed_at)} />
            <Pair label="Resolution verified" value={fmtDate(row.resolution_verified_at)} />
            <Pair label="Closed"              value={fmtDate(row.closed_at)} />
            <Pair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"      value={String(row.escalation_level)} />
            <Pair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.problem_summary && (
            <BasisBlock label="Problem summary" tone="oklch(0.46 0.16 55)" text={row.problem_summary} />
          )}
          {row.investigation_basis && (
            <BasisBlock label="Investigation basis" tone="oklch(0.46 0.16 55)" text={row.investigation_basis} />
          )}
          {row.rca_basis && (
            <BasisBlock label="Root-cause basis" tone="#a06200" text={row.rca_basis} />
          )}
          {row.known_error_basis && (
            <BasisBlock label="Known-error basis" tone="#a06200" text={row.known_error_basis} />
          )}
          {row.workaround && (
            <BasisBlock label="Workaround" tone="#8a4a00" text={row.workaround} />
          )}
          {row.fix_basis && (
            <BasisBlock label="Proposed fix" tone="#1f6b3a" text={row.fix_basis} />
          )}
          {row.change_basis && (
            <BasisBlock label="Change basis" tone="#8a4a00" text={row.change_basis} />
          )}
          {row.verification_basis && (
            <BasisBlock label="Verification basis" tone="#1f6b3a" text={row.verification_basis} />
          )}
          {row.closure_notes && (
            <BasisBlock label="Closure / escalation notes" tone="#155724" text={row.closure_notes} />
          )}
        </section>

        {(nextAction || canWorkaround || canEscalate || canCancel) && (
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
              {canWorkaround && (
                <button type="button"
                  onClick={() => onAct('accept-workaround', row)}
                  className="rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-700 hover:bg-green-50"
                >
                  {ACTION_LABEL['accept-workaround']}
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
              {canCancel && (
                <button type="button"
                  onClick={() => onAct('cancel', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
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
                  <div className="flex items-center justify-between">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-medium text-[#4a5568]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1 text-[oklch(0.46_0.16_55)]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
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
