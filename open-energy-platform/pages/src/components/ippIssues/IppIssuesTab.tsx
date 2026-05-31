// Wave 132 — IPP Issues Log & Resolution Chain.
// PHASE E WAVE 2 OF N — IPP-PM profile-completeness wave.
//
// PMBOK 7 issue register + P6 state machine for IPP project issues.
// URGENT SLA polarity: P1 critical = 24h (tightest); P5 = 720h (loosest).
// SIGNATURE: escalate_to_regulator EVERY tier when safety OR regulatory.
//
// Mounted at /ipp-lifecycle/workstation?tab=issues-log (WRITE: ipp_developer/admin).
// READ all 9 personas via readOnly prop.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainStateBar } from '../ChainStateBar';
import { SlaCountdown } from '../SlaCountdown';

type IssueStatus =
  | 'raised' | 'triaged' | 'assigned' | 'acknowledged' | 'in_progress'
  | 'blocked' | 'under_review' | 'resolved' | 'verified' | 'evidence_filed'
  | 'closed' | 'archived' | 'escalated' | 'deferred' | 'cancelled' | 'overdue_flagged';

type IssuePriority = 'p1_critical' | 'p2_high' | 'p3_medium' | 'p4_low' | 'p5_informational';

type IssueCategory =
  | 'safety' | 'regulatory' | 'technical' | 'commercial'
  | 'environmental' | 'stakeholder' | 'legal' | 'financial' | 'general';

interface IssueRow {
  id: string;
  project_id: string;
  project_name: string | null;
  title: string;
  description: string | null;
  category: IssueCategory;
  priority: IssuePriority;
  chain_status: IssueStatus;
  raised_by: string | null;
  assigned_to: string | null;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  is_safety: number;
  is_regulatory: number;
  is_commercial: number;
  is_lender_notifiable: number;
  is_nersa_notifiable: number;
  rfi_ref: string | null;
  change_order_ref: string | null;
  stage_gate_ref: string | null;
  hse_incident_ref: string | null;
  w118_block_ref: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_ref: string | null;
  resolution_summary: string | null;
  root_cause: string | null;
  // live
  time_in_state_hours_live: number | null;
  sla_remaining_hours_live: number | null;
  urgency_band_live: string;
  is_safety_or_regulatory_live: boolean;
  created_at: string;
  updated_at: string;
}

interface Dashboard {
  issues: {
    open_count: number;
    p1_count: number;
    sla_breached_count: number;
    escalated_count: number;
    safety_open: number;
    total_count: number;
  };
}

const PRIORITY_LABEL: Record<IssuePriority, string> = {
  p1_critical:      'P1 Critical',
  p2_high:          'P2 High',
  p3_medium:        'P3 Medium',
  p4_low:           'P4 Low',
  p5_informational: 'P5 Info',
};

const PRIORITY_COLOR: Record<IssuePriority, string> = {
  p1_critical:      'bg-red-100 text-red-800',
  p2_high:          'bg-orange-100 text-orange-800',
  p3_medium:        'bg-yellow-100 text-yellow-700',
  p4_low:           'bg-blue-100 text-blue-700',
  p5_informational: 'bg-gray-100 text-gray-600',
};

const STATUS_COLOR: Record<IssueStatus, string> = {
  raised:         'bg-slate-100 text-slate-700',
  triaged:        'bg-blue-50 text-blue-700',
  assigned:       'bg-blue-100 text-blue-800',
  acknowledged:   'bg-indigo-100 text-indigo-700',
  in_progress:    'bg-violet-100 text-violet-700',
  blocked:        'bg-red-100 text-red-700',
  under_review:   'bg-amber-100 text-amber-700',
  resolved:       'bg-lime-100 text-lime-700',
  verified:       'bg-green-100 text-green-700',
  evidence_filed: 'bg-teal-100 text-teal-700',
  closed:         'bg-emerald-100 text-emerald-800',
  archived:       'bg-gray-100 text-gray-500',
  escalated:      'bg-red-200 text-red-900',
  deferred:       'bg-gray-100 text-gray-600',
  cancelled:      'bg-gray-200 text-gray-500',
  overdue_flagged:'bg-red-50 text-red-600',
};

const ACTIONS: Record<IssueStatus, Array<{ action: string; label: string }>> = {
  raised:         [{ action: 'triage_issue', label: 'Triage' }, { action: 'escalate_to_regulator', label: 'Escalate' }, { action: 'defer_issue', label: 'Defer' }, { action: 'cancel_issue', label: 'Cancel' }],
  triaged:        [{ action: 'assign_issue', label: 'Assign' }, { action: 'defer_issue', label: 'Defer' }, { action: 'cancel_issue', label: 'Cancel' }],
  assigned:       [{ action: 'acknowledge_issue', label: 'Acknowledge' }, { action: 'cancel_issue', label: 'Cancel' }],
  acknowledged:   [{ action: 'start_progress', label: 'Start work' }, { action: 'flag_blocked', label: 'Flag blocked' }, { action: 'cancel_issue', label: 'Cancel' }],
  in_progress:    [{ action: 'submit_for_review', label: 'Submit for review' }, { action: 'flag_blocked', label: 'Flag blocked' }, { action: 'defer_issue', label: 'Defer' }],
  blocked:        [{ action: 'unblock_issue', label: 'Unblock' }, { action: 'cancel_issue', label: 'Cancel' }],
  under_review:   [{ action: 'resolve_issue', label: 'Mark resolved' }],
  resolved:       [{ action: 'verify_resolution', label: 'Verify' }, { action: 'cancel_issue', label: 'Cancel' }],
  verified:       [{ action: 'file_evidence', label: 'File evidence' }],
  evidence_filed: [{ action: 'close_issue', label: 'Close issue' }],
  closed:         [{ action: 'archive_issue', label: 'Archive' }],
  archived:       [],
  escalated:      [{ action: 'assign_issue', label: 'Assign for resolution' }],
  deferred:       [{ action: 'triage_issue', label: 'Re-triage' }, { action: 'start_progress', label: 'Resume' }],
  cancelled:      [],
  overdue_flagged:[{ action: 'triage_issue', label: 'Triage' }, { action: 'escalate_to_regulator', label: 'Escalate' }],
};

const CATEGORIES: IssueCategory[] = [
  'safety','regulatory','technical','commercial',
  'environmental','stakeholder','legal','financial','general',
];
const PRIORITIES: IssuePriority[] = [
  'p1_critical','p2_high','p3_medium','p4_low','p5_informational',
];

const MAIN_STATES: readonly IssueStatus[] = [
  'raised','triaged','assigned','acknowledged','in_progress',
  'under_review','resolved','verified','evidence_filed','closed','archived',
];
const BRANCH_STATES: readonly IssueStatus[] = [
  'blocked','escalated','deferred','cancelled','overdue_flagged',
];

const SLA_HOURS: Record<IssuePriority, number> = {
  p1_critical: 24, p2_high: 72, p3_medium: 168, p4_low: 336, p5_informational: 720,
};


interface Props { readOnly?: boolean }

export default function IppIssuesTab({ readOnly = false }: Props) {
  const [rows, setRows] = useState<IssueRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IssueRow | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<IssueStatus | ''>('');
  const [filterPriority, setFilterPriority] = useState<IssuePriority | ''>('');
  const [filterCategory, setFilterCategory] = useState<IssueCategory | ''>('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newCategory, setNewCategory] = useState<IssueCategory>('general');
  const [newPriority, setNewPriority] = useState<IssuePriority>('p3_medium');
  const [newDesc, setNewDesc] = useState('');
  const [newSafety, setNewSafety] = useState(false);
  const [newRegulatory, setNewRegulatory] = useState(false);
  const [newNersa, setNewNersa] = useState(false);
  const [newStageGateRef, setNewStageGateRef] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api('/api/ipp-issues');
      setRows(res.data?.data ?? []);
      setDashboard(res.data?.dashboard ?? null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter(r => {
    if (filterStatus && r.chain_status !== filterStatus) return false;
    if (filterPriority && r.priority !== filterPriority) return false;
    if (filterCategory && r.category !== filterCategory) return false;
    return true;
  }), [rows, filterStatus, filterPriority, filterCategory]);

  async function handleAction(action: string) {
    if (!selected) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      await api(`/api/ipp-issues/${selected.id}/${action}`, { method: 'POST', data: {} });
      setActionResult(`✓ ${action.replace(/_/g, ' ')} — done`);
      await load();
      setSelected(null);
    } catch (e: any) {
      setActionResult(`Error: ${e.response?.data?.error ?? e.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreate() {
    if (!newTitle || !newProject) return;
    setCreateLoading(true);
    try {
      await api('/api/ipp-issues', {
        method: 'POST',
        data: {
          title: newTitle,
          project_id: newProject,
          category: newCategory,
          priority: newPriority,
          description: newDesc || undefined,
          is_safety: newSafety ? 1 : 0,
          is_regulatory: newRegulatory ? 1 : 0,
          is_nersa_notifiable: newNersa ? 1 : 0,
          stage_gate_ref: newStageGateRef || undefined,
        },
      });
      setShowCreate(false);
      setNewTitle(''); setNewProject(''); setNewDesc('');
      setNewSafety(false); setNewRegulatory(false); setNewNersa(false);
      setNewStageGateRef('');
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setCreateLoading(false);
    }
  }

  const db = dashboard?.issues;

  return (
    <div className="space-y-5">
      {/* Dashboard KPIs */}
      {db && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <KpiCard label="Open" value={db.open_count} color="blue" />
          <KpiCard label="P1 Critical" value={db.p1_count} color="red" />
          <KpiCard label="SLA breached" value={db.sla_breached_count} color="red" />
          <KpiCard label="Escalated" value={db.escalated_count} color="orange" />
          <KpiCard label="Safety open" value={db.safety_open} color="orange" />
          <KpiCard label="Total" value={db.total_count} color="gray" />
        </div>
      )}

      {/* AI insight card — URGENT SLA pattern */}
      {db && db.p1_count > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-red-500 text-xl">⚠</span>
          <div>
            <p className="text-sm font-semibold text-red-800">
              {db.p1_count} P1 critical issue{db.p1_count > 1 ? 's' : ''} open — 24-hour SLA applies
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              OHSA s24: any safety issue must be escalated if SLA breaches without resolution. Assign now.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="text-xs border rounded px-2 py-1"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as IssueStatus | '')}
        >
          <option value="">All statuses</option>
          {(['raised','triaged','assigned','in_progress','blocked','escalated','deferred','overdue_flagged','resolved','verified','evidence_filed','closed','archived','cancelled'] as IssueStatus[]).map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          className="text-xs border rounded px-2 py-1"
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value as IssuePriority | '')}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
        <select
          className="text-xs border rounded px-2 py-1"
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value as IssueCategory | '')}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} issues</span>
        {!readOnly && (
          <button
            className="text-xs bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700"
            onClick={() => setShowCreate(true)}
          >
            + Raise issue
          </button>
        )}
        <button
          className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
          onClick={load}
        >
          Refresh
        </button>
      </div>

      {actionResult && (
        <div className={`text-xs rounded px-3 py-2 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {actionResult}
        </div>
      )}
      {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
      {loading && <div className="text-xs text-gray-400">Loading issues…</div>}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">ID</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Title</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Priority</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Category</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">SLA remaining</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Flags</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
                {!readOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={readOnly ? 8 : 9} className="px-3 py-6 text-center text-gray-400">No issues</td></tr>
              )}
              {filtered.map(row => {
                return (
                  <tr
                    key={row.id}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-3 py-2 font-mono text-gray-400">{row.id}</td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <span className="font-medium text-gray-800 truncate block">{row.title}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${PRIORITY_COLOR[row.priority]}`}>
                        {PRIORITY_LABEL[row.priority]}
                      </span>
                    </td>
                    <td className="px-3 py-2 capitalize text-gray-600">{row.category}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[row.chain_status]}`}>
                        {row.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.sla_remaining_hours_live != null ? (
                        <SlaCountdown
                          remainingHours={row.sla_remaining_hours_live}
                          totalHours={row.sla_target_hours ?? SLA_HOURS[row.priority]}
                          breached={!!row.sla_breached}
                          compact
                        />
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {!!row.is_safety && <Flag label="S" title="Safety" cls="bg-red-100 text-red-700" />}
                        {!!row.is_regulatory && <Flag label="R" title="Regulatory" cls="bg-orange-100 text-orange-700" />}
                        {!!row.is_nersa_notifiable && <Flag label="N" title="NERSA notifiable" cls="bg-purple-100 text-purple-700" />}
                        {!!row.is_reportable && <Flag label="⚑" title="Regulator crossed" cls="bg-red-200 text-red-800" />}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{row.project_name ?? row.project_id}</td>
                    {!readOnly && (
                      <td className="px-3 py-2">
                        <button
                          className="text-xs text-blue-600 hover:underline"
                          onClick={e => { e.stopPropagation(); setSelected(row); }}
                        >
                          Manage
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail / action modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setSelected(null); setActionResult(null); }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${PRIORITY_COLOR[selected.priority]}`}>
                    {PRIORITY_LABEL[selected.priority]}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[selected.chain_status]}`}>
                    {selected.chain_status.replace(/_/g, ' ')}
                  </span>
                  {!!selected.is_safety && <span className="px-1 py-0.5 rounded text-[10px] bg-red-100 text-red-700">SAFETY</span>}
                  {!!selected.is_regulatory && <span className="px-1 py-0.5 rounded text-[10px] bg-orange-100 text-orange-700">REGULATORY</span>}
                  {!!selected.is_reportable && <span className="px-1 py-0.5 rounded text-[10px] bg-red-200 text-red-800">REGULATOR CROSSED</span>}
                </div>
                <h3 className="font-semibold text-gray-900">{selected.title}</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{selected.id} · {selected.project_name ?? selected.project_id}</p>
              </div>
              <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => { setSelected(null); setActionResult(null); }}>×</button>
            </div>

            {/* Chain state progress */}
            <div className="mb-4 px-3 py-3 bg-gray-50 rounded-lg">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Workflow progress</p>
              <ChainStateBar
                allStates={MAIN_STATES}
                currentState={selected.chain_status}
                branchStates={BRANCH_STATES}
                variant="full"
              />
            </div>

            {/* SLA urgency bar */}
            {selected.sla_remaining_hours_live != null && (
              <div className="mb-4">
                <SlaCountdown
                  remainingHours={selected.sla_remaining_hours_live}
                  totalHours={selected.sla_target_hours ?? SLA_HOURS[selected.priority]}
                  breached={!!selected.sla_breached}
                  label={PRIORITY_LABEL[selected.priority]}
                />
              </div>
            )}

            {/* Description */}
            {selected.description && (
              <p className="text-sm text-gray-600 mb-4">{selected.description}</p>
            )}

            {/* Detail fields */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <DetailRow label="Category" value={selected.category} />
              <DetailRow label="Assigned to" value={selected.assigned_to ?? '—'} />
              <DetailRow label="SLA target" value={selected.sla_target_hours != null ? `${selected.sla_target_hours}h` : '—'} />
              <DetailRow label="SLA deadline" value={selected.sla_deadline_at ? new Date(selected.sla_deadline_at).toLocaleDateString() : '—'} />
              {selected.stage_gate_ref && <DetailRow label="Stage gate ref" value={selected.stage_gate_ref} />}
              {selected.rfi_ref && <DetailRow label="RFI ref" value={selected.rfi_ref} />}
              {selected.change_order_ref && <DetailRow label="Change order ref" value={selected.change_order_ref} />}
              {selected.hse_incident_ref && <DetailRow label="HSE incident ref" value={selected.hse_incident_ref} />}
              {selected.regulator_ref && <DetailRow label="Regulator ref" value={selected.regulator_ref} />}
            </div>

            {/* Resolution */}
            {(selected.resolution_summary || selected.root_cause) && (
              <div className="bg-green-50 rounded-lg p-3 mb-4 text-sm space-y-1">
                {selected.resolution_summary && <p><span className="font-medium">Resolution:</span> {selected.resolution_summary}</p>}
                {selected.root_cause && <p><span className="font-medium">Root cause:</span> {selected.root_cause}</p>}
              </div>
            )}

            {/* W132 SIGNATURE warning */}
            {(selected.chain_status === 'raised' || selected.chain_status === 'overdue_flagged') && selected.is_safety_or_regulatory_live && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-red-800">W132 SIGNATURE</p>
                <p className="text-xs text-red-700 mt-0.5">
                  Escalating this {selected.is_safety ? 'safety' : 'regulatory'} issue will file a regulator crossing (OHSA s24 / ERA s35). Confirm before proceeding.
                </p>
              </div>
            )}

            {actionResult && (
              <div className={`text-xs rounded px-3 py-2 mb-3 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {actionResult}
              </div>
            )}

            {/* Action buttons */}
            {!readOnly && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Available actions</p>
                <div className="flex flex-wrap gap-2">
                  {(ACTIONS[selected.chain_status] ?? []).map(({ action, label }) => (
                    <button
                      key={action}
                      disabled={actionLoading}
                      className={`text-xs px-3 py-1.5 rounded font-medium transition
                        ${action === 'escalate_to_regulator'
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : action.startsWith('cancel') || action === 'flag_blocked'
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-blue-600 text-white hover:bg-blue-700'}
                        disabled:opacity-50`}
                      onClick={() => handleAction(action)}
                    >
                      {actionLoading ? '…' : label}
                    </button>
                  ))}
                  {ACTIONS[selected.chain_status]?.length === 0 && (
                    <p className="text-xs text-gray-400">No actions available — terminal state.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && !readOnly && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Raise new issue</h3>
              <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => setShowCreate(false)}>×</button>
            </div>

            <div className="space-y-3">
              <FormField label="Title *">
                <input className="w-full text-sm border rounded px-2 py-1.5" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Short issue title" />
              </FormField>
              <FormField label="Project ID *">
                <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="proj-kakamas-500mw" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Priority">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newPriority} onChange={e => setNewPriority(e.target.value as IssuePriority)}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </select>
                </FormField>
                <FormField label="Category">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newCategory} onChange={e => setNewCategory(e.target.value as IssueCategory)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Description">
                <textarea className="w-full text-sm border rounded px-2 py-1.5" rows={3} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Issue description and context" />
              </FormField>
              <FormField label="Stage gate ref (W131, optional)">
                <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newStageGateRef} onChange={e => setNewStageGateRef(e.target.value)} placeholder="sg-001" />
              </FormField>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={newSafety} onChange={e => setNewSafety(e.target.checked)} />
                  <span>Safety flag (OHSA s24)</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={newRegulatory} onChange={e => setNewRegulatory(e.target.checked)} />
                  <span>Regulatory flag</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={newNersa} onChange={e => setNewNersa(e.target.checked)} />
                  <span>NERSA notifiable</span>
                </label>
              </div>
            </div>

            {error && <div className="text-xs text-red-600 mt-3">{error}</div>}

            <div className="flex justify-end gap-2 mt-4">
              <button className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50" onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                disabled={!newTitle || !newProject || createLoading}
                onClick={handleCreate}
              >
                {createLoading ? 'Raising…' : 'Raise issue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const cls = color === 'red' ? 'text-red-600' : color === 'orange' ? 'text-orange-600' : color === 'blue' ? 'text-blue-600' : 'text-gray-700';
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${cls}`}>{value}</p>
    </div>
  );
}

function Flag({ label, title, cls }: { label: string; title: string; cls: string }) {
  return (
    <span title={title} className={`px-1 py-0.5 rounded text-[10px] font-bold ${cls}`}>{label}</span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-gray-700 font-mono">{value}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
