// Wave 47 — OEM-Support ITIL Change Enablement lifecycle tab.
//
// The RFC (Request for Change) lifecycle — the third member of the ITIL service
// management family on the support profile (after W14 incident + W41 problem).
// W41 hands off here: its raise_change action raises an RFC this chain governs.
// The unit of work is a proposed CHANGE: assess its risk, authorise it through
// the Change Advisory Board (CAB) or the emergency ECAB fast-path, schedule it,
// implement it in a change window, run a post-implementation review (PIR), and
// close it — OR back it out if it fails (a change-induced incident).
//
// Forward path: change_requested → assessment → cab_review → approved →
//   scheduled → implementing → implemented → pir → closed. Emergency fast-path:
//   assessment → approved (ECAB bypass). Rejection: cab_review → rejected.
//   Backout: implementing|implemented → rolled_back. Early cancel from any
//   pre-implementation state.
//
// URGENT SLA — the more urgent the change class, the tighter every window.
//
// Write model — SINGLE-PARTY {admin, support}. No access split; actor_party
// records the ITIL functional party (change_requester / change_authority /
// implementer) for audit attribution only. Reportability: roll_back crosses for
// emergency + normal; emergency_approve + close + sla_breached cross for
// emergency_change (ITIL 4 Change Enablement + ISO/IEC 20000-1 §8.5.1).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'change_requested' | 'assessment' | 'cab_review' | 'approved' | 'scheduled'
  | 'implementing' | 'implemented' | 'pir' | 'closed' | 'rejected'
  | 'rolled_back' | 'cancelled';

type Tier = 'emergency_change' | 'normal_change' | 'standard_change';

interface ChangeRow {
  id: string;
  change_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  owner_party_id: string;
  owner_party_name: string;
  service_name: string;
  affected_tenant: string | null;
  change_category: string | null;
  change_class: Tier;
  affected_ci_count: number;
  problem_ref: string | null;
  cab_ref: string | null;
  release_ref: string | null;
  rollback_ref: string | null;
  regulator_ref: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  change_summary: string | null;
  assessment_basis: string | null;
  cab_basis: string | null;
  approval_basis: string | null;
  schedule_basis: string | null;
  implementation_basis: string | null;
  verification_basis: string | null;
  rollback_basis: string | null;
  backout_plan: string | null;
  reason_code: string | null;
  closure_notes: string | null;
  chain_status: ChainStatus;
  change_requested_at: string;
  assessment_at: string | null;
  cab_review_at: string | null;
  approved_at: string | null;
  scheduled_at: string | null;
  implementing_at: string | null;
  implemented_at: string | null;
  pir_at: string | null;
  closed_at: string | null;
  rejected_at: string | null;
  rolled_back_at: string | null;
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

interface ChangeEvent {
  id: string;
  change_id: string;
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
  rejected_count: number;
  rolled_back_count: number;
  cancelled_count: number;
  awaiting_cab_count: number;
  in_implementation_count: number;
  breached: number;
  reportable_total: number;
  emergency_open: number;
  total_affected_ci: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  change_requested: { bg: '#e3e7ec', fg: '#557',    label: 'Requested' },
  assessment:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Assessment' },
  cab_review:       { bg: '#fff4d6', fg: '#a06200', label: 'CAB review' },
  approved:         { bg: '#ffe9d6', fg: '#8a4a00', label: 'Approved' },
  scheduled:        { bg: '#ffe9d6', fg: '#8a4a00', label: 'Scheduled' },
  implementing:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Implementing' },
  implemented:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'Implemented' },
  pir:              { bg: '#daf5e2', fg: '#1f6b3a', label: 'PIR' },
  closed:           { bg: '#d4edda', fg: '#155724', label: 'Closed' },
  rejected:         { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  rolled_back:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rolled back' },
  cancelled:        { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  emergency_change: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Emergency' },
  normal_change:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Normal' },
  standard_change:  { bg: '#e3e7ec', fg: '#557',    label: 'Standard' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'Active' },
  { key: 'all',              label: 'All' },
  { key: 'emergency_change', label: 'Emergency' },
  { key: 'normal_change',    label: 'Normal' },
  { key: 'standard_change',  label: 'Standard' },
  { key: 'awaiting_cab',     label: 'Awaiting CAB' },
  { key: 'implementing',     label: 'Implementing' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'change_requested', label: 'Requested' },
  { key: 'assessment',       label: 'Assessment' },
  { key: 'approved',         label: 'Approved' },
  { key: 'scheduled',        label: 'Scheduled' },
  { key: 'closed',           label: 'Closed' },
  { key: 'rejected',         label: 'Rejected' },
  { key: 'rolled_back',      label: 'Rolled back' },
  { key: 'cancelled',        label: 'Cancelled' },
];

type ActionKind =
  | 'assess' | 'submit-to-cab' | 'approve' | 'reject' | 'emergency-approve'
  | 'schedule' | 'begin-implementation' | 'complete-implementation'
  | 'initiate-pir' | 'close' | 'roll-back' | 'cancel';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  change_requested: 'assess',
  assessment:       'submit-to-cab',
  cab_review:       'approve',
  approved:         'schedule',
  scheduled:        'begin-implementation',
  implementing:     'complete-implementation',
  implemented:      'initiate-pir',
  pir:              'close',
  closed:           null,
  rejected:         null,
  rolled_back:      null,
  cancelled:        null,
};

// Functional party annotation per action. change_requester owns intake +
// assessment + withdrawal; change_authority owns CAB/ECAB authorisation + PIR +
// closure; implementer owns scheduling + implementation + backout.
const ACTION_LABEL: Record<ActionKind, string> = {
  'assess':                  'Assess risk (requester)',
  'submit-to-cab':           'Submit to CAB (requester)',
  'approve':                 'Approve (CAB / authority)',
  'reject':                  'Reject (CAB / authority)',
  'emergency-approve':       'Emergency approve — ECAB (authority)',
  'schedule':                'Schedule change window (implementer)',
  'begin-implementation':    'Begin implementation (implementer)',
  'complete-implementation': 'Complete implementation (implementer)',
  'initiate-pir':            'Initiate PIR (authority)',
  'close':                   'Close change (authority)',
  'roll-back':               'Back out change (implementer)',
  'cancel':                  'Cancel (requester)',
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

const TERMINAL_STATES: ChainStatus[] = ['closed', 'rejected', 'rolled_back', 'cancelled'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['change_requested', 'assessment', 'cab_review', 'approved', 'scheduled'];
const BACKOUT_STATES: ChainStatus[] = ['implementing', 'implemented'];

export function ChangeEnablementChainTab() {
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ChangeRow | null>(null);
  const [events, setEvents] = useState<ChangeEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ChangeRow[] } & KpiSummary }>('/change-enablement/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, closed_count: d.closed_count,
          rejected_count: d.rejected_count, rolled_back_count: d.rolled_back_count,
          cancelled_count: d.cancelled_count, awaiting_cab_count: d.awaiting_cab_count,
          in_implementation_count: d.in_implementation_count, breached: d.breached,
          reportable_total: d.reportable_total, emergency_open: d.emergency_open,
          total_affected_ci: d.total_affected_ci,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load change requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ChangeRow; events: ChangeEvent[] } }>(
        `/change-enablement/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load change history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'emergency_change') return r.change_class === 'emergency_change';
      if (filter === 'normal_change')    return r.change_class === 'normal_change';
      if (filter === 'standard_change')  return r.change_class === 'standard_change';
      if (filter === 'awaiting_cab')     return r.chain_status === 'cab_review';
      if (filter === 'implementing')     return r.chain_status === 'implementing';
      if (filter === 'breached')         return r.sla_breached;
      if (filter === 'reportable')       return r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ChangeRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'assess') {
        const cat = window.prompt('Change category (software / infrastructure / configuration / data / security):', row.change_category || '');
        const summary = window.prompt('Change summary — what is changing and why, in one line:', row.change_summary || '') || '';
        const basis = window.prompt('Assessment basis — risk, impact, affected services:') || '';
        body = { change_summary: summary, assessment_basis: basis };
        if (cat) body.change_category = cat;
      } else if (action === 'submit-to-cab') {
        const ref = window.prompt('CAB docket reference (e.g. CAB-2026-0042):') || '';
        const basis = window.prompt('CAB submission basis — what the board must weigh:') || '';
        body = { cab_basis: basis };
        if (ref) body.cab_ref = ref;
      } else if (action === 'approve') {
        const basis = window.prompt('Approval basis — CAB decision rationale:');
        if (!basis) return;
        const ref = window.prompt('CAB decision reference (e.g. CAB-2026-0042):') || '';
        body = { approval_basis: basis };
        if (ref) body.cab_ref = ref;
      } else if (action === 'emergency-approve') {
        const basis = window.prompt('ECAB authorisation basis — why this bypasses full CAB:');
        if (!basis) return;
        const ref = window.prompt('ECAB decision reference (e.g. ECAB-2026-0007):') || '';
        const reg = window.prompt('Regulator notification reference (emergency change is reportable):') || '';
        body = { approval_basis: basis };
        if (ref) body.cab_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'reject') {
        const basis = window.prompt('Rejection basis — why CAB declined authorisation:');
        if (!basis) return;
        body = { reason_code: 'cab_declined', cab_basis: basis, closure_notes: basis };
      } else if (action === 'schedule') {
        const start = window.prompt('Scheduled start (ISO, e.g. 2026-06-01T22:00:00Z):') || '';
        const end = window.prompt('Scheduled end (ISO):') || '';
        const plan = window.prompt('Backout plan — how to reverse if it fails:') || '';
        const basis = window.prompt('Schedule basis — change window rationale:') || '';
        body = { schedule_basis: basis, backout_plan: plan };
        if (start) body.scheduled_start_at = start;
        if (end) body.scheduled_end_at = end;
      } else if (action === 'begin-implementation') {
        const ref = window.prompt('Release / deployment package id (e.g. REL-2026-0118):') || '';
        const basis = window.prompt('Implementation basis — steps being executed:') || '';
        body = { implementation_basis: basis };
        if (ref) body.release_ref = ref;
      } else if (action === 'complete-implementation') {
        const basis = window.prompt('Implementation outcome — what shipped, verification at the gate:');
        if (!basis) return;
        body = { implementation_basis: basis };
      } else if (action === 'initiate-pir') {
        const basis = window.prompt('PIR basis — post-implementation review scope:') || '';
        body = { verification_basis: basis };
      } else if (action === 'close') {
        const notes = window.prompt('Closure notes — PIR outcome, success confirmation:');
        if (!notes) return;
        const reg = window.prompt('Regulator reference, if an emergency change (post-change report):') || '';
        const basis = window.prompt('Verification basis — evidence the change succeeded:') || '';
        body = { reason_code: 'implemented_successfully', closure_notes: notes, verification_basis: basis };
        if (reg) body.regulator_ref = reg;
      } else if (action === 'roll-back') {
        const basis = window.prompt('Backout basis — why the change is being reversed:');
        if (!basis) return;
        const ref = window.prompt('Backout record reference (e.g. BACKOUT-2026-0006):') || '';
        const reg = window.prompt('Regulator reference (change-induced failure is reportable):') || '';
        body = { reason_code: 'change_induced_failure', rollback_basis: basis, closure_notes: basis };
        if (ref) body.rollback_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'cancel') {
        const reason = window.prompt('Cancellation reason (e.g. superseded, no-longer-required, duplicate):');
        if (!reason) return;
        body = { reason_code: 'cancelled', closure_notes: reason };
      }
      await api.post(`/change-enablement/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Change enablement</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage ITIL change-enablement chain · requested → assessment → CAB review → approved → scheduled →
            implementing → implemented → PIR → closed. An emergency change can fast-path through ECAB
            (assessment → approved); CAB can reject; a failed change can back out from implementing or implemented;
            pre-implementation records can cancel. The RFC lifecycle — receives W41 problem-management handoffs and
            governs every change to a service or configuration item. URGENT SLA: the more urgent the change class,
            the tighter every window. Reportable to the regulator inbox: roll-back (emergency + normal),
            emergency-approve + close + SLA breach (emergency). ITIL 4 Change Enablement + ISO/IEC 20000-1 §8.5.1.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Emergency open" value={kpis?.emergency_open ?? 0} tone={(kpis?.emergency_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Awaiting CAB" value={kpis?.awaiting_cab_count ?? 0} tone={(kpis?.awaiting_cab_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Implementing" value={kpis?.in_implementation_count ?? 0} tone={(kpis?.in_implementation_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Closed" value={kpis?.closed_count ?? 0} tone="ok" />
        <Kpi label="Rejected" value={kpis?.rejected_count ?? 0} tone={(kpis?.rejected_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Rolled back" value={kpis?.rolled_back_count ?? 0} tone={(kpis?.rolled_back_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cancelled" value={kpis?.cancelled_count ?? 0} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Affected CIs" value={kpis?.total_affected_ci ?? 0} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Change #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Service / owner</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Category</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">CIs</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.change_class];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.change_number}
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
                    <td className="px-3 py-2 text-[#4a5568]">{r.change_category ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{r.affected_ci_count || '—'}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No change requests match.</td></tr>
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
  row: ChangeRow;
  events: ChangeEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ChangeRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canEmergencyApprove = row.chain_status === 'assessment';
  const canReject = row.chain_status === 'cab_review';
  const canBackout = BACKOUT_STATES.includes(row.chain_status);
  const canCancel = WITHDRAWABLE_STATES.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.change_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.service_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.change_class].label} · owner {row.owner_party_name}
                {row.affected_tenant ? ` · tenant ${row.affected_tenant}` : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                  {row.problem_ref ? ` · problem ${row.problem_ref}` : ''}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"            value={STATE_TONE[row.chain_status].label} />
            <Pair label="Class"            value={TIER_TONE[row.change_class].label} />
            <Pair label="Category"         value={row.change_category ?? '—'} />
            <Pair label="Affected CIs"     value={String(row.affected_ci_count ?? 0)} />
            <Pair label="Problem ref"      value={row.problem_ref ?? '—'} />
            <Pair label="CAB ref"          value={row.cab_ref ?? '—'} />
            <Pair label="Release ref"      value={row.release_ref ?? '—'} />
            <Pair label="Rollback ref"     value={row.rollback_ref ?? '—'} />
            <Pair label="Regulator ref"    value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"      value={row.reason_code ?? '—'} />
            <Pair label="Window start"     value={fmtDate(row.scheduled_start_at)} />
            <Pair label="Window end"       value={fmtDate(row.scheduled_end_at)} />
            <Pair label="Requested"        value={fmtDate(row.change_requested_at)} />
            <Pair label="Assessment"       value={fmtDate(row.assessment_at)} />
            <Pair label="CAB review"       value={fmtDate(row.cab_review_at)} />
            <Pair label="Approved"         value={fmtDate(row.approved_at)} />
            <Pair label="Scheduled"        value={fmtDate(row.scheduled_at)} />
            <Pair label="Implementing"     value={fmtDate(row.implementing_at)} />
            <Pair label="Implemented"      value={fmtDate(row.implemented_at)} />
            <Pair label="PIR"              value={fmtDate(row.pir_at)} />
            <Pair label="Closed"           value={fmtDate(row.closed_at)} />
            <Pair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"       value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"   value={String(row.escalation_level)} />
            <Pair label="Reportable"       value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.change_summary && (
            <BasisBlock label="Change summary" tone="#1a3a5c" text={row.change_summary} />
          )}
          {row.assessment_basis && (
            <BasisBlock label="Assessment basis" tone="#1a3a5c" text={row.assessment_basis} />
          )}
          {row.cab_basis && (
            <BasisBlock label="CAB basis" tone="#a06200" text={row.cab_basis} />
          )}
          {row.approval_basis && (
            <BasisBlock label="Approval basis" tone="#8a4a00" text={row.approval_basis} />
          )}
          {row.backout_plan && (
            <BasisBlock label="Backout plan" tone="#8a4a00" text={row.backout_plan} />
          )}
          {row.schedule_basis && (
            <BasisBlock label="Schedule basis" tone="#8a4a00" text={row.schedule_basis} />
          )}
          {row.implementation_basis && (
            <BasisBlock label="Implementation basis" tone="#1f6b3a" text={row.implementation_basis} />
          )}
          {row.verification_basis && (
            <BasisBlock label="Verification / PIR basis" tone="#1f6b3a" text={row.verification_basis} />
          )}
          {row.rollback_basis && (
            <BasisBlock label="Backout basis" tone="#9b1f1f" text={row.rollback_basis} />
          )}
          {row.closure_notes && (
            <BasisBlock label="Closure / decision notes" tone="#155724" text={row.closure_notes} />
          )}
        </section>

        {(nextAction || canEmergencyApprove || canReject || canBackout || canCancel) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canEmergencyApprove && (
                <button
                  onClick={() => onAct('emergency-approve', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['emergency-approve']}
                </button>
              )}
              {canReject && (
                <button
                  onClick={() => onAct('reject', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.reject}
                </button>
              )}
              {canBackout && (
                <button
                  onClick={() => onAct('roll-back', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['roll-back']}
                </button>
              )}
              {canCancel && (
                <button
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
