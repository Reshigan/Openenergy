// Wave 135 — IPP Lessons Learned Register.
// PHASE E WAVE 5 OF N — IPP-PM profile-completeness wave.
//
// PMBOK 7 / ISO 21502:2022 §12.6 dissemination tracking.
// INVERTED SLA: critical_impact 720h MOST time; low_impact 168h LEAST time.
// SIGNATURE: disseminate_finding EVERY tier when lesson_type='safety' OR prevents_fatality=1.
//
// Beats: Oracle Primavera Unifier (unstructured document storage) +
// MS Project (no learning registry at all).
// Mounted at /ipp-lifecycle/workstation?tab=lessons-learned (WRITE: ipp_developer/admin).
// READ all 9 personas via readOnly prop.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainStateBar } from '../ChainStateBar';
import { SlaCountdown } from '../SlaCountdown';

type LessonStatus =
  | 'captured' | 'categorized' | 'root_cause_analyzed' | 'impact_assessed'
  | 'recommendation_drafted' | 'peer_reviewed' | 'approved'
  | 'disseminated' | 'applied' | 'archived'
  | 'rejected' | 'deferred' | 'duplicate';

type ImpactTier = 'critical_impact' | 'high_impact' | 'medium_impact' | 'low_impact';

interface LessonRow {
  id: string;
  project_id: string;
  project_name: string | null;
  lesson_title: string;
  chain_status: LessonStatus;
  lesson_type: string | null;
  lesson_category: string | null;
  lesson_phase: string | null;
  impact_tier: ImpactTier | null;
  rca_method: string | null;
  description: string;
  root_cause: string | null;
  impact_summary: string | null;
  recommendation: string | null;
  review_notes: string | null;
  dissemination_audience: string | null;
  application_project_ref: string | null;
  application_notes: string | null;
  cost_impact_zar: number | null;
  schedule_impact_days: number | null;
  issue_ref: string | null;
  risk_ref: string | null;
  rfi_ref: string | null;
  hse_incident_ref: string | null;
  change_order_ref: string | null;
  floor_safety_critical: number;
  floor_regulatory_change: number;
  floor_contractual_impact: number;
  floor_design_change: number;
  floor_portfolio_impact: number;
  prevents_fatality: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  sla_remaining_hours_live: number | null;
  time_in_state_hours_live: number | null;
  is_signature_lesson_live: boolean;
  created_at: string;
}

interface Dashboard {
  lessons: {
    total_count: number;
    safety_count: number;
    applied_count: number;
    archived_count: number;
    sla_breached_count: number;
    critical_count: number;
    positive_count: number;
  };
}

const SLA_HOURS_BY_TIER: Record<ImpactTier, number> = {
  critical_impact: 720,
  high_impact:     480,
  medium_impact:   336,
  low_impact:      168,
};

const TIER_COLOR: Record<ImpactTier, string> = {
  critical_impact: 'bg-red-100 text-red-800',
  high_impact:     'bg-orange-100 text-orange-700',
  medium_impact:   'bg-amber-100 text-amber-700',
  low_impact:      'bg-gray-100 text-gray-600',
};

const TIER_LABEL: Record<ImpactTier, string> = {
  critical_impact: 'Critical impact',
  high_impact:     'High impact',
  medium_impact:   'Medium impact',
  low_impact:      'Low impact',
};

const TYPE_COLOR: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-800',
  negative: 'bg-red-100 text-red-700',
  safety:   'bg-purple-100 text-purple-800',
};

const STATUS_COLOR: Record<LessonStatus, string> = {
  captured:              'bg-slate-100 text-slate-700',
  categorized:           'bg-blue-50 text-blue-700',
  root_cause_analyzed:   'bg-blue-100 text-blue-800',
  impact_assessed:       'bg-indigo-100 text-indigo-700',
  recommendation_drafted:'bg-violet-100 text-violet-700',
  peer_reviewed:         'bg-cyan-100 text-cyan-700',
  approved:              'bg-teal-100 text-teal-700',
  disseminated:          'bg-green-100 text-green-800',
  applied:               'bg-emerald-100 text-emerald-800',
  archived:              'bg-gray-200 text-gray-400',
  rejected:              'bg-red-100 text-red-700',
  deferred:              'bg-yellow-100 text-yellow-700',
  duplicate:             'bg-gray-100 text-gray-500',
};

const ACTIONS: Record<LessonStatus, Array<{ action: string; label: string; danger?: boolean }>> = {
  captured:              [{ action: 'categorize_lesson', label: 'Categorize' }, { action: 'defer_lesson', label: 'Defer' }, { action: 'mark_duplicate', label: 'Mark duplicate', danger: true }],
  categorized:           [{ action: 'analyze_root_cause', label: 'Analyze root cause' }, { action: 'defer_lesson', label: 'Defer' }, { action: 'mark_duplicate', label: 'Mark duplicate', danger: true }],
  root_cause_analyzed:   [{ action: 'assess_impact', label: 'Assess impact' }, { action: 'defer_lesson', label: 'Defer' }, { action: 'mark_duplicate', label: 'Mark duplicate', danger: true }],
  impact_assessed:       [{ action: 'draft_recommendation', label: 'Draft recommendation' }, { action: 'defer_lesson', label: 'Defer' }, { action: 'mark_duplicate', label: 'Mark duplicate', danger: true }],
  recommendation_drafted:[{ action: 'submit_for_review', label: 'Submit for review' }, { action: 'defer_lesson', label: 'Defer' }, { action: 'mark_duplicate', label: 'Mark duplicate', danger: true }],
  peer_reviewed:         [{ action: 'approve_lesson', label: 'Approve' }, { action: 'reject_lesson', label: 'Reject', danger: true }, { action: 'defer_lesson', label: 'Defer' }],
  approved:              [{ action: 'disseminate_finding', label: 'Disseminate' }, { action: 'defer_lesson', label: 'Defer' }],
  disseminated:          [{ action: 'confirm_applied', label: 'Confirm applied' }, { action: 'defer_lesson', label: 'Defer' }],
  applied:               [{ action: 'archive_lesson', label: 'Archive' }, { action: 'defer_lesson', label: 'Defer' }],
  archived:              [],
  rejected:              [],
  duplicate:             [],
  deferred:              [{ action: 'restore_lesson', label: 'Restore to captured' }],
};

const MAIN_STATES: readonly LessonStatus[] = [
  'captured', 'categorized', 'root_cause_analyzed', 'impact_assessed',
  'recommendation_drafted', 'peer_reviewed', 'approved',
  'disseminated', 'applied', 'archived',
];
const BRANCH_STATES: readonly LessonStatus[] = ['rejected', 'deferred', 'duplicate'];

const STATUSES: LessonStatus[] = [
  'captured', 'categorized', 'root_cause_analyzed', 'impact_assessed',
  'recommendation_drafted', 'peer_reviewed', 'approved',
  'disseminated', 'applied', 'archived', 'rejected', 'deferred', 'duplicate',
];
const TIERS: ImpactTier[] = ['critical_impact', 'high_impact', 'medium_impact', 'low_impact'];
const LESSON_TYPES = ['positive', 'negative', 'safety'];
const LESSON_CATEGORIES = [
  'technical', 'schedule', 'cost', 'safety', 'procurement', 'stakeholder',
  'regulatory', 'environmental', 'quality', 'risk', 'financial', 'contractual',
];
const LESSON_PHASES = [
  'development', 'permitting', 'procurement', 'construction',
  'commissioning', 'operations', 'decommissioning',
];
const RCA_METHODS = ['five_whys', 'fishbone', 'fmea', 'fault_tree', 'timeline_analysis', 'none'];

const RCA_LABEL: Record<string, string> = {
  five_whys: '5 Whys', fishbone: 'Fishbone', fmea: 'FMEA',
  fault_tree: 'Fault tree', timeline_analysis: 'Timeline', none: '—',
};

function formatZar(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return Number(val).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
}

interface Props { readOnly?: boolean }

export default function IppLessonsLearnedTab({ readOnly = false }: Props) {
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LessonRow | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<LessonStatus | ''>('');
  const [filterTier, setFilterTier] = useState<ImpactTier | ''>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('negative');
  const [newCategory, setNewCategory] = useState('technical');
  const [newPhase, setNewPhase] = useState('construction');
  const [newTier, setNewTier] = useState<ImpactTier>('medium_impact');
  const [newRcaMethod, setNewRcaMethod] = useState('none');
  const [newPreventsFatality, setNewPreventsFatality] = useState(false);
  const [newIssueRef, setNewIssueRef] = useState('');
  const [newRiskRef, setNewRiskRef] = useState('');
  const [newRfiRef, setNewRfiRef] = useState('');
  const [newHseRef, setNewHseRef] = useState('');
  const [newChangeOrderRef, setNewChangeOrderRef] = useState('');
  const [newFloorSafety, setNewFloorSafety] = useState(false);
  const [newFloorRegulatory, setNewFloorRegulatory] = useState(false);
  const [newFloorContractual, setNewFloorContractual] = useState(false);
  const [newFloorDesign, setNewFloorDesign] = useState(false);
  const [newFloorPortfolio, setNewFloorPortfolio] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api('/api/ipp-lessons-learned');
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
    if (filterTier && r.impact_tier !== filterTier) return false;
    if (filterType && r.lesson_type !== filterType) return false;
    if (filterCategory && r.lesson_category !== filterCategory) return false;
    return true;
  }), [rows, filterStatus, filterTier, filterType, filterCategory]);

  async function handleAction(action: string) {
    if (!selected) return;
    setActionLoading(true); setActionResult(null);
    try {
      await api(`/api/ipp-lessons-learned/${selected.id}/${action}`, { method: 'POST', data: {} });
      setActionResult(`${action.replace(/_/g, ' ')} — done`);
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
      await api('/api/ipp-lessons-learned', {
        method: 'POST',
        data: {
          lesson_title: newTitle,
          project_id: newProject,
          project_name: newProjectName || undefined,
          description: newDescription,
          lesson_type: newType,
          lesson_category: newCategory,
          lesson_phase: newPhase,
          impact_tier: newTier,
          rca_method: newRcaMethod,
          prevents_fatality: newPreventsFatality ? 1 : 0,
          issue_ref: newIssueRef || undefined,
          risk_ref: newRiskRef || undefined,
          rfi_ref: newRfiRef || undefined,
          hse_incident_ref: newHseRef || undefined,
          change_order_ref: newChangeOrderRef || undefined,
          floor_safety_critical: newFloorSafety ? 1 : 0,
          floor_regulatory_change: newFloorRegulatory ? 1 : 0,
          floor_contractual_impact: newFloorContractual ? 1 : 0,
          floor_design_change: newFloorDesign ? 1 : 0,
          floor_portfolio_impact: newFloorPortfolio ? 1 : 0,
        },
      });
      setShowCreate(false);
      setNewTitle(''); setNewProject(''); setNewProjectName(''); setNewDescription('');
      setNewType('negative'); setNewCategory('technical'); setNewPhase('construction');
      setNewTier('medium_impact'); setNewRcaMethod('none'); setNewPreventsFatality(false);
      setNewIssueRef(''); setNewRiskRef(''); setNewRfiRef(''); setNewHseRef(''); setNewChangeOrderRef('');
      setNewFloorSafety(false); setNewFloorRegulatory(false); setNewFloorContractual(false);
      setNewFloorDesign(false); setNewFloorPortfolio(false);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setCreateLoading(false);
    }
  }

  const db = dashboard?.lessons;
  const isSignatureCreate = newType === 'safety' || newPreventsFatality;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      {db && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <KpiCard label="Total" value={db.total_count} color="gray" />
          <KpiCard label="Safety observations" value={db.safety_count} color="purple" />
          <KpiCard label="Applied" value={db.applied_count} color="green" />
          <KpiCard label="Archived" value={db.archived_count} color="gray" />
          <KpiCard label="SLA breached" value={db.sla_breached_count} color="red" />
          <KpiCard label="Critical impact" value={db.critical_count} color="red" />
        </div>
      )}

      {/* AI insight card (W135 SIGNATURE warning) */}
      {db && db.safety_count > 0 && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 flex items-start gap-3">
          <span className="text-purple-600 text-xl mt-0.5">&#9888;</span>
          <div>
            <p className="text-sm font-semibold text-purple-900">
              {db.safety_count} safety observation{db.safety_count > 1 ? 's' : ''} require dissemination to all project teams
            </p>
            <p className="text-xs text-purple-800 mt-0.5">
              PMBOK 7: safety lessons must be disseminated immediately — failure to apply a known safety lesson creates OHSA liability.
              W135 SIGNATURE: disseminate_finding crosses regulator on all safety lessons regardless of tier.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="text-xs border rounded px-2 py-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value as LessonStatus | '')}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterTier} onChange={e => setFilterTier(e.target.value as ImpactTier | '')}>
          <option value="">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All types</option>
          {LESSON_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {LESSON_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} lessons</span>
        {!readOnly && (
          <button type="button" className="text-xs bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700" onClick={() => setShowCreate(true)}>
            + Add lesson
          </button>
        )}
        <button type="button" className="text-xs border rounded px-2 py-1 hover:bg-gray-50" onClick={load}>Refresh</button>
      </div>

      {actionResult && (
        <div className={`text-xs rounded px-3 py-2 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {actionResult}
        </div>
      )}
      {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
      {loading && <div className="text-xs text-gray-400">Loading lessons learned register…</div>}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">ID</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Title</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Category</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Phase</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Tier</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">RCA</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">SLA</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Flags</th>
                {!readOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={readOnly ? 10 : 11} className="px-3 py-6 text-center text-gray-400">No lessons in register</td></tr>
              )}
              {filtered.map(row => (
                <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(row)}>
                  <td className="px-3 py-2 font-mono text-gray-400">{row.id}</td>
                  <td className="px-3 py-2 max-w-[180px]">
                    <span className="font-medium text-gray-800 block truncate">{row.lesson_title}</span>
                    {row.project_name && <span className="text-gray-400 truncate block">{row.project_name}</span>}
                  </td>
                  <td className="px-3 py-2 capitalize text-gray-600">{row.lesson_category?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-3 py-2 capitalize text-gray-600">{row.lesson_phase?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-3 py-2">
                    {row.lesson_type && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TYPE_COLOR[row.lesson_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {row.lesson_type}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.impact_tier && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLOR[row.impact_tier]}`}>
                        {TIER_LABEL[row.impact_tier]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{row.rca_method ? (RCA_LABEL[row.rca_method] ?? row.rca_method) : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[row.chain_status]}`}>
                      {row.chain_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.sla_remaining_hours_live != null && row.impact_tier ? (
                      <SlaCountdown
                        remainingHours={row.sla_remaining_hours_live}
                        totalHours={row.sla_target_hours ?? SLA_HOURS_BY_TIER[row.impact_tier]}
                        breached={!!row.sla_breached}
                        compact
                      />
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {!!row.floor_safety_critical && <Flag label="S" title="Safety critical" cls="bg-red-100 text-red-700" />}
                      {!!row.floor_regulatory_change && <Flag label="R" title="Regulatory change required" cls="bg-blue-100 text-blue-700" />}
                      {!!row.floor_contractual_impact && <Flag label="C" title="Contractual impact" cls="bg-orange-100 text-orange-700" />}
                      {!!row.floor_design_change && <Flag label="D" title="Design change required" cls="bg-indigo-100 text-indigo-700" />}
                      {!!row.floor_portfolio_impact && <Flag label="P" title="Portfolio impact" cls="bg-purple-100 text-purple-700" />}
                      {!!row.prevents_fatality && <Flag label="F" title="Prevents fatality (SIGNATURE)" cls="bg-red-200 text-red-900" />}
                      {!!row.is_reportable && <Flag label="⚑" title="Regulator crossed" cls="bg-red-200 text-red-800" />}
                    </div>
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2">
                      <button type="button" className="text-xs text-blue-600 hover:underline" onClick={e => { e.stopPropagation(); setSelected(row); }}>Manage</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setSelected(null); setActionResult(null); }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {selected.impact_tier && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLOR[selected.impact_tier]}`}>
                      {TIER_LABEL[selected.impact_tier]}
                    </span>
                  )}
                  {selected.lesson_type && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TYPE_COLOR[selected.lesson_type] ?? ''}`}>
                      {selected.lesson_type}
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[selected.chain_status]}`}>
                    {selected.chain_status.replace(/_/g, ' ')}
                  </span>
                  {!!selected.is_reportable && <span className="px-1 py-0.5 rounded text-[10px] bg-red-200 text-red-800">REGULATOR CROSSED</span>}
                </div>
                <h3 className="font-semibold text-gray-900">{selected.lesson_title}</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{selected.id} · {selected.project_name ?? selected.project_id}</p>
              </div>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => { setSelected(null); setActionResult(null); }}>×</button>
            </div>

            {/* W135 SIGNATURE warning */}
            {(selected.lesson_type === 'safety' || !!selected.prevents_fatality) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-red-800">W135 SIGNATURE — Safety / Prevents fatality</p>
                <p className="text-xs text-red-700 mt-0.5">
                  {selected.prevents_fatality ? 'This lesson involves a prevents-fatality scenario. ' : ''}
                  Disseminating this finding will trigger a mandatory regulator crossing (OHSA §24 — safety lesson dissemination is always reportable).
                </p>
              </div>
            )}

            {/* Chain state progress */}
            <div className="mb-4 px-3 py-3 bg-gray-50 rounded-lg">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Lessons lifecycle</p>
              <ChainStateBar
                allStates={MAIN_STATES}
                currentState={selected.chain_status}
                branchStates={BRANCH_STATES}
                variant="full"
              />
            </div>

            {/* SLA */}
            {selected.sla_remaining_hours_live != null && selected.impact_tier && (
              <div className="mb-4">
                <SlaCountdown
                  remainingHours={selected.sla_remaining_hours_live}
                  totalHours={selected.sla_target_hours ?? SLA_HOURS_BY_TIER[selected.impact_tier]}
                  breached={!!selected.sla_breached}
                  label={`${TIER_LABEL[selected.impact_tier]} SLA (INVERTED — more impact = more time)`}
                />
              </div>
            )}

            {/* Quantified impact */}
            {(selected.cost_impact_zar !== null || selected.schedule_impact_days !== null) && (
              <div className="flex gap-3 mb-4">
                {selected.cost_impact_zar !== null && (
                  <div className={`flex-1 rounded-lg border px-3 py-2 text-center ${selected.cost_impact_zar >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <p className={`text-[10px] uppercase tracking-wide ${selected.cost_impact_zar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Cost impact</p>
                    <p className={`text-lg font-bold ${selected.cost_impact_zar >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatZar(selected.cost_impact_zar)}</p>
                  </div>
                )}
                {selected.schedule_impact_days !== null && (
                  <div className={`flex-1 rounded-lg border px-3 py-2 text-center ${selected.schedule_impact_days >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                    <p className={`text-[10px] uppercase tracking-wide ${selected.schedule_impact_days >= 0 ? 'text-blue-600' : 'text-red-600'}`}>Schedule impact</p>
                    <p className={`text-lg font-bold ${selected.schedule_impact_days >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{selected.schedule_impact_days > 0 ? `+${selected.schedule_impact_days}d` : `${selected.schedule_impact_days}d`}</p>
                  </div>
                )}
              </div>
            )}

            {/* RCA method badge */}
            {selected.rca_method && selected.rca_method !== 'none' && (
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[10px] text-gray-400 uppercase">RCA method:</span>
                <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-medium">{RCA_LABEL[selected.rca_method] ?? selected.rca_method}</span>
              </div>
            )}

            {/* Content */}
            <div className="space-y-3 mb-4">
              <ContentBlock label="Description" content={selected.description} />
              {selected.root_cause && <ContentBlock label="Root cause" content={selected.root_cause} />}
              {selected.impact_summary && <ContentBlock label="Impact summary" content={selected.impact_summary} />}
              {selected.recommendation && <ContentBlock label="Recommendation" content={selected.recommendation} cls="bg-emerald-50" />}
              {selected.review_notes && <ContentBlock label="Review notes" content={selected.review_notes} />}
              {selected.dissemination_audience && <ContentBlock label="Disseminated to" content={selected.dissemination_audience} />}
              {selected.application_project_ref && <ContentBlock label="Applied in project" content={selected.application_project_ref} />}
              {selected.application_notes && <ContentBlock label="Application notes" content={selected.application_notes} />}
            </div>

            {/* Cross-references */}
            {(selected.issue_ref || selected.risk_ref || selected.rfi_ref || selected.hse_incident_ref || selected.change_order_ref || selected.regulator_ref) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {selected.issue_ref && <DetailRow label="Issue ref" value={selected.issue_ref} />}
                {selected.risk_ref && <DetailRow label="Risk ref" value={selected.risk_ref} />}
                {selected.rfi_ref && <DetailRow label="RFI ref" value={selected.rfi_ref} />}
                {selected.hse_incident_ref && <DetailRow label="HSE incident ref" value={selected.hse_incident_ref} />}
                {selected.change_order_ref && <DetailRow label="Change order ref" value={selected.change_order_ref} />}
                {selected.regulator_ref && <DetailRow label="Regulator ref" value={selected.regulator_ref} />}
              </div>
            )}

            {actionResult && (
              <div className={`text-xs rounded px-3 py-2 mb-3 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {actionResult}
              </div>
            )}

            {!readOnly && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Available actions</p>
                <div className="flex flex-wrap gap-2">
                  {(ACTIONS[selected.chain_status] ?? []).map(({ action, label, danger }) => (
                    <button type="button"
                      key={action}
                      disabled={actionLoading}
                      className={`text-xs px-3 py-1.5 rounded font-medium transition
                        ${danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'}
                        disabled:opacity-50`}
                      onClick={() => handleAction(action)}
                    >
                      {actionLoading ? '…' : label}
                    </button>
                  ))}
                  {ACTIONS[selected.chain_status]?.length === 0 && (
                    <p className="text-xs text-gray-400">No actions — terminal state.</p>
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
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Add lesson learned</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => setShowCreate(false)}>×</button>
            </div>

            {/* SIGNATURE warning in create form */}
            {isSignatureCreate && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                <p className="text-xs font-semibold text-red-800">W135 SIGNATURE — Safety / Prevents fatality</p>
                <p className="text-xs text-red-700 mt-0.5">
                  Disseminating this lesson will trigger a mandatory regulator crossing across all tiers.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <FormField label="Lesson title *">
                <input className="w-full text-sm border rounded px-2 py-1.5" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="What was the lesson?" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Project ID *">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="kakamas-500mw" />
                </FormField>
                <FormField label="Project name">
                  <input className="w-full text-sm border rounded px-2 py-1.5" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Kakamas 500MW Solar" />
                </FormField>
              </div>
              <FormField label="Description *">
                <textarea className="w-full text-sm border rounded px-2 py-1.5 resize-none" rows={3} value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="What happened? Include context and timeline." />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Lesson type">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newType} onChange={e => setNewType(e.target.value)}>
                    {LESSON_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </FormField>
                <FormField label="Category">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                    {LESSON_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Phase">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newPhase} onChange={e => setNewPhase(e.target.value)}>
                    {LESSON_PHASES.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
                  </select>
                </FormField>
                <FormField label="Impact tier">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newTier} onChange={e => setNewTier(e.target.value as ImpactTier)}>
                    {TIERS.map(t => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
                  </select>
                </FormField>
              </div>
              {/* Live SLA preview */}
              <div className="bg-gray-50 rounded p-2 flex items-center justify-between">
                <span className="text-xs font-medium">SLA preview (INVERTED):</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${TIER_COLOR[newTier]}`}>
                  {TIER_LABEL[newTier]}
                </span>
                <span className="text-xs text-gray-500">{SLA_HOURS_BY_TIER[newTier]}h ({Math.round(SLA_HOURS_BY_TIER[newTier]/24)}d)</span>
              </div>
              <FormField label="RCA method">
                <select className="w-full text-sm border rounded px-2 py-1.5" value={newRcaMethod} onChange={e => setNewRcaMethod(e.target.value)}>
                  {RCA_METHODS.map(m => <option key={m} value={m}>{RCA_LABEL[m] ?? m}</option>)}
                </select>
              </FormField>

              {/* SIGNATURE checkbox */}
              <label className="flex items-center gap-2 text-xs cursor-pointer p-2 rounded border border-red-200 bg-red-50">
                <input type="checkbox" checked={newPreventsFatality} onChange={e => setNewPreventsFatality(e.target.checked)} />
                <span className="font-medium text-red-800">Prevents fatality (W135 SIGNATURE — triggers regulator crossing on dissemination)</span>
              </label>

              {/* Cross-references */}
              <p className="text-xs font-medium text-gray-500 pt-1">Cross-references</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Issue ref">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newIssueRef} onChange={e => setNewIssueRef(e.target.value)} placeholder="iss-001" />
                </FormField>
                <FormField label="Risk ref">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newRiskRef} onChange={e => setNewRiskRef(e.target.value)} placeholder="rsk-001" />
                </FormField>
                <FormField label="RFI ref">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newRfiRef} onChange={e => setNewRfiRef(e.target.value)} placeholder="rfi-001" />
                </FormField>
                <FormField label="HSE incident ref">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newHseRef} onChange={e => setNewHseRef(e.target.value)} placeholder="hse-001" />
                </FormField>
                <FormField label="Change order ref">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newChangeOrderRef} onChange={e => setNewChangeOrderRef(e.target.value)} placeholder="co-001" />
                </FormField>
              </div>

              {/* Floor flags */}
              <p className="text-xs font-medium text-gray-500 pt-1">Floor flags</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { val: newFloorSafety, set: setNewFloorSafety, label: 'Safety critical (requires safety team review)' },
                  { val: newFloorRegulatory, set: setNewFloorRegulatory, label: 'Regulatory change process required' },
                  { val: newFloorContractual, set: setNewFloorContractual, label: 'Contractual impact (requires legal review)' },
                  { val: newFloorDesign, set: setNewFloorDesign, label: 'Design document update required' },
                  { val: newFloorPortfolio, set: setNewFloorPortfolio, label: 'Portfolio impact (multiple projects)' },
                ].map(({ val, set, label }) => (
                  <label key={label} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {error && <div className="text-xs text-red-600 mt-3">{error}</div>}

            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="button"
                className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                disabled={!newTitle || !newProject || !newDescription || createLoading}
                onClick={handleCreate}
              >
                {createLoading ? 'Adding…' : 'Add lesson'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const cls = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-green-600' : color === 'blue' ? 'text-blue-600' : color === 'purple' ? 'text-purple-700' : 'text-gray-700';
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${cls}`}>{value}</p>
    </div>
  );
}

function Flag({ label, title, cls }: { label: string; title: string; cls: string }) {
  return <span title={title} className={`px-1 py-0.5 rounded text-[10px] font-bold ${cls}`}>{label}</span>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-gray-700 font-mono">{value}</p>
    </div>
  );
}

function ContentBlock({ label, content, cls = 'bg-gray-50' }: { label: string; content: string; cls?: string }) {
  return (
    <div className={`rounded-lg p-3 ${cls}`}>
      <p className="text-xs font-medium text-gray-600 mb-1">{label}</p>
      <p className="text-xs text-gray-700 whitespace-pre-wrap">{content}</p>
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
