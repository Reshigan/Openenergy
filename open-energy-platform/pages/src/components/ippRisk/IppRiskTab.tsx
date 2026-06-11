// Wave 133 — IPP Risk Register & Treatment Chain.
// PHASE E WAVE 3 OF N — IPP-PM profile-completeness wave.
//
// PMBOK 7 + ISO 31000:2018 + IEC 31010:2019 risk register.
// INVERTED SLA polarity: catastrophic 90d (most time) → low_impact 7d.
// SIGNATURE: escalate_risk EVERY tier when safety AND (critical|catastrophic).
//
// Mounted at /ipp-lifecycle/workstation?tab=risk-register (WRITE: ipp_developer/admin).
// READ all 9 personas via readOnly prop.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainStateBar } from '../ChainStateBar';
import { SlaCountdown } from '../SlaCountdown';

type RiskStatus =
  | 'identified' | 'assessed' | 'quantified' | 'response_planned'
  | 'owner_assigned' | 'monitoring' | 'triggered' | 'responding'
  | 'outcome_recorded' | 'closed' | 'archived'
  | 'escalated' | 'deferred' | 'cancelled' | 'overdue_flagged';

type RiskTier = 'low_impact' | 'medium_impact' | 'high_impact' | 'critical_impact' | 'catastrophic';

type RiskCategory =
  | 'construction' | 'technical' | 'financial' | 'regulatory'
  | 'environmental' | 'safety' | 'geopolitical' | 'commercial'
  | 'force_majeure' | 'legal';

interface RiskRow {
  id: string;
  project_id: string;
  project_name: string | null;
  title: string;
  description: string | null;
  risk_category: RiskCategory;
  risk_tier: RiskTier;
  chain_status: RiskStatus;
  probability_score: number | null;
  impact_score: number | null;
  risk_score: number | null;
  residual_risk_score: number | null;
  response_strategy: string | null;
  response_plan: string | null;
  contingency_reserve_zar: number | null;
  risk_owner: string | null;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  is_safety: number;
  is_regulatory: number;
  is_reportable: number;
  regulator_relevant: number;
  regulator_ref: string | null;
  risk_trigger_description: string | null;
  treatment_outcome: string | null;
  floor_board_notify: number;
  floor_ep4_action_required: number;
  floor_lender_notifiable: number;
  stage_gate_ref: string | null;
  issue_ref: string | null;
  w118_block_ref: string | null;
  urgency_band_live: string;
  sla_remaining_hours_live: number | null;
  time_in_state_hours_live: number | null;
  is_safety_or_regulatory_live: boolean;
  created_at: string;
}

interface Dashboard {
  risks: {
    active_count: number;
    triggered_count: number;
    critical_count: number;
    sla_breached_count: number;
    safety_open: number;
    escalated_count: number;
    total_count: number;
    heat_map: { p5_i5: number; high_zone: number };
  };
}

const TIER_LABEL: Record<RiskTier, string> = {
  low_impact:      'Low',
  medium_impact:   'Medium',
  high_impact:     'High',
  critical_impact: 'Critical',
  catastrophic:    'Catastrophic',
};

const TIER_COLOR: Record<RiskTier, string> = {
  low_impact:      'bg-green-100 text-green-700',
  medium_impact:   'bg-yellow-100 text-yellow-700',
  high_impact:     'bg-orange-100 text-orange-800',
  critical_impact: 'bg-red-100 text-red-800',
  catastrophic:    'bg-red-200 text-red-900',
};

const STATUS_COLOR: Record<RiskStatus, string> = {
  identified:       'bg-[#eef2f7] text-[#2d3748]',
  assessed:         'bg-[oklch(0.97_0.003_250)] text-[oklch(0.46_0.16_55)]',
  quantified:       'bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]',
  response_planned: 'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  owner_assigned:   'bg-violet-100 text-violet-700',
  monitoring:       'bg-amber-100 text-amber-700',
  triggered:        'bg-red-100 text-red-800',
  responding:       'bg-orange-100 text-orange-800',
  outcome_recorded: 'bg-lime-100 text-lime-700',
  closed:           'bg-emerald-100 text-emerald-800',
  archived:         'bg-[#eef2f7] text-[#6b7685]',
  escalated:        'bg-red-200 text-red-900',
  deferred:         'bg-[#eef2f7] text-[#3d4756]',
  cancelled:        'bg-[#e8ecf0] text-[#6b7685]',
  overdue_flagged:  'bg-red-50 text-red-600',
};

const ACTIONS: Record<RiskStatus, Array<{ action: string; label: string; danger?: boolean }>> = {
  identified:       [{ action: 'assess_risk', label: 'Assess' }, { action: 'defer_risk', label: 'Defer' }, { action: 'escalate_risk', label: 'Escalate', danger: true }],
  assessed:         [{ action: 'quantify_risk', label: 'Quantify (EMV)' }, { action: 'defer_risk', label: 'Defer' }],
  quantified:       [{ action: 'plan_response', label: 'Plan response' }, { action: 'defer_risk', label: 'Defer' }],
  response_planned: [{ action: 'assign_owner', label: 'Assign owner' }, { action: 'defer_risk', label: 'Defer' }],
  owner_assigned:   [{ action: 'activate_monitoring', label: 'Activate monitoring' }, { action: 'flag_triggered', label: 'Risk triggered!', danger: true }],
  monitoring:       [{ action: 'flag_triggered', label: 'Risk triggered!', danger: true }, { action: 'cancel_risk', label: 'Cancel (non-event)' }],
  triggered:        [{ action: 'start_response', label: 'Start response' }, { action: 'escalate_risk', label: 'Escalate', danger: true }],
  responding:       [{ action: 'record_outcome', label: 'Record outcome' }],
  outcome_recorded: [{ action: 'close_risk', label: 'Close' }],
  closed:           [{ action: 'archive_risk', label: 'Archive' }],
  archived:         [],
  escalated:        [{ action: 'assign_owner', label: 'Assign for response' }],
  deferred:         [{ action: 'reactivate_risk', label: 'Reactivate' }, { action: 'cancel_risk', label: 'Cancel' }],
  cancelled:        [],
  overdue_flagged:  [{ action: 'assess_risk', label: 'Assess now' }, { action: 'escalate_risk', label: 'Escalate', danger: true }],
};

const CATEGORIES: RiskCategory[] = [
  'construction','technical','financial','regulatory',
  'environmental','safety','geopolitical','commercial','force_majeure','legal',
];
const TIERS: RiskTier[] = [
  'low_impact','medium_impact','high_impact','critical_impact','catastrophic',
];

const MAIN_RISK_STATES: readonly RiskStatus[] = [
  'identified','assessed','quantified','response_planned',
  'owner_assigned','monitoring','triggered','responding',
  'outcome_recorded','closed','archived',
];
const BRANCH_RISK_STATES: readonly RiskStatus[] = [
  'escalated','deferred','cancelled','overdue_flagged',
];

const SLA_HOURS_BY_TIER: Record<RiskTier, number> = {
  low_impact: 168, medium_impact: 336, high_impact: 720,
  critical_impact: 1440, catastrophic: 2160,
};

function scoreColor(score: number | null): string {
  if (!score) return 'text-[#9aa5b4]';
  if (score >= 20) return 'text-red-700 font-bold';
  if (score >= 15) return 'text-red-500 font-semibold';
  if (score >= 9) return 'text-orange-600 font-medium';
  if (score >= 4) return 'text-yellow-600';
  return 'text-green-600';
}

interface Props { readOnly?: boolean }

export default function IppRiskTab({ readOnly = false }: Props) {
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RiskRow | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterTier, setFilterTier] = useState<RiskTier | ''>('');
  const [filterCat, setFilterCat] = useState<RiskCategory | ''>('');
  const [filterStatus, setFilterStatus] = useState<RiskStatus | ''>('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newCategory, setNewCategory] = useState<RiskCategory>('technical');
  const [newTier, setNewTier] = useState<RiskTier>('medium_impact');
  const [newProb, setNewProb] = useState<number>(3);
  const [newImpact, setNewImpact] = useState<number>(3);
  const [newStrategy, setNewStrategy] = useState<string>('mitigate');
  const [newSafety, setNewSafety] = useState(false);
  const [newRegulatory, setNewRegulatory] = useState(false);
  const [newStageGateRef, setNewStageGateRef] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api('/api/ipp-risk');
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
    if (filterTier && r.risk_tier !== filterTier) return false;
    if (filterCat && r.risk_category !== filterCat) return false;
    if (filterStatus && r.chain_status !== filterStatus) return false;
    return true;
  }), [rows, filterTier, filterCat, filterStatus]);

  async function handleAction(action: string) {
    if (!selected) return;
    setActionLoading(true); setActionResult(null);
    try {
      await api(`/api/ipp-risk/${selected.id}/${action}`, { method: 'POST', data: {} });
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
      const score = newProb * newImpact;
      await api('/api/ipp-risk', {
        method: 'POST',
        data: {
          title: newTitle, project_id: newProject,
          risk_category: newCategory, risk_tier: newTier,
          probability_score: newProb, impact_score: newImpact,
          response_strategy: newStrategy,
          is_safety: newSafety ? 1 : 0,
          is_regulatory: newRegulatory ? 1 : 0,
          stage_gate_ref: newStageGateRef || undefined,
        },
      });
      setShowCreate(false);
      setNewTitle(''); setNewProject(''); setNewStageGateRef('');
      setNewSafety(false); setNewRegulatory(false);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setCreateLoading(false);
    }
  }

  const db = dashboard?.risks;

  return (
    <div className="space-y-5">
      {/* Dashboard KPIs */}
      {db && (
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
          <KpiCard label="Active" value={db.active_count} color="blue" />
          <KpiCard label="Triggered" value={db.triggered_count} color="red" />
          <KpiCard label="Critical+" value={db.critical_count} color="red" />
          <KpiCard label="SLA breached" value={db.sla_breached_count} color="red" />
          <KpiCard label="Safety open" value={db.safety_open} color="orange" />
          <KpiCard label="Escalated" value={db.escalated_count} color="orange" />
          <KpiCard label="Total" value={db.total_count} color="gray" />
        </div>
      )}

      {/* Risk heat map summary */}
      {db && db.heat_map.high_zone > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-3">
          <span className="text-orange-500 text-xl">◼</span>
          <div>
            <p className="text-sm font-semibold text-orange-800">
              {db.heat_map.high_zone} risk{db.heat_map.high_zone > 1 ? 's' : ''} in the high-to-catastrophic zone (score ≥ 9)
            </p>
            <p className="text-xs text-orange-700 mt-0.5">
              ISO 31000: risks with score ≥ 9 require documented treatment plans and owner assignment before next reporting period.
              {db.heat_map.p5_i5 > 0 && ` ${db.heat_map.p5_i5} P5×I5 catastrophic scenario present.`}
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="text-xs border rounded px-2 py-1" value={filterTier} onChange={e => setFilterTier(e.target.value as RiskTier | '')}>
          <option value="">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterCat} onChange={e => setFilterCat(e.target.value as RiskCategory | '')}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' ')}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value as RiskStatus | '')}>
          <option value="">All statuses</option>
          {(['identified','assessed','quantified','response_planned','owner_assigned','monitoring','triggered','responding','outcome_recorded','escalated','deferred','closed','archived','cancelled','overdue_flagged'] as RiskStatus[]).map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <span className="text-xs text-[#9aa5b4] ml-auto">{filtered.length} risks</span>
        {!readOnly && (
          <button type="button" className="text-xs bg-[#c2873a] text-white rounded px-3 py-1 hover:bg-[#a3702f]" onClick={() => setShowCreate(true)}>
            + Identify risk
          </button>
        )}
        <button type="button" className="text-xs border rounded px-2 py-1 hover:bg-[#eef2f7]" onClick={load}>Refresh</button>
      </div>

      {actionResult && (
        <div className={`text-xs rounded px-3 py-2 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {actionResult}
        </div>
      )}
      {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
      {loading && <div className="text-xs text-[#9aa5b4]">Loading risk register…</div>}

      {/* Risk table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-[#dde4ec]">
          <table className="w-full text-xs">
            <thead className="bg-[#f8fafc]">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">ID</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Title</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Tier</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">P×I</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Category</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Status</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Strategy</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">SLA</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Flags</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Project</th>
                {!readOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={readOnly ? 10 : 11} className="px-3 py-6 text-center text-[#9aa5b4]">No risks in register</td></tr>
              )}
              {filtered.map(row => (
                <tr key={row.id} className="border-t border-[#eef2f7] hover:bg-[#eef2f7] cursor-pointer" onClick={() => setSelected(row)}>
                  <td className="px-3 py-2 font-mono text-[#9aa5b4]">{row.id}</td>
                  <td className="px-3 py-2 max-w-[180px]">
                    <span className="font-medium text-[#1e2a38] truncate block">{row.title}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLOR[row.risk_tier]}`}>
                      {TIER_LABEL[row.risk_tier]}
                    </span>
                  </td>
                  <td className={`px-3 py-2 font-mono font-bold ${scoreColor(row.risk_score)}`}>
                    {row.probability_score && row.impact_score
                      ? `${row.probability_score}×${row.impact_score}=${row.risk_score}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 capitalize text-[#3d4756]">{row.risk_category.replace('_', ' ')}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[row.chain_status]}`}>
                      {row.chain_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 capitalize text-[#3d4756]">{row.response_strategy ?? '—'}</td>
                  <td className="px-3 py-2">
                    {row.sla_remaining_hours_live != null ? (
                      <SlaCountdown
                        remainingHours={row.sla_remaining_hours_live}
                        totalHours={row.sla_target_hours ?? SLA_HOURS_BY_TIER[row.risk_tier]}
                        breached={!!row.sla_breached}
                        compact
                      />
                    ) : <span className="text-[#9aa5b4]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {!!row.is_safety && <Flag label="S" title="Safety" cls="bg-red-100 text-red-700" />}
                      {!!row.is_regulatory && <Flag label="R" title="Regulatory" cls="bg-orange-100 text-orange-700" />}
                      {!!row.floor_board_notify && <Flag label="B" title="Board notify" cls="bg-purple-100 text-purple-700" />}
                      {!!row.is_reportable && <Flag label="⚑" title="Regulator crossed" cls="bg-red-200 text-red-800" />}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#6b7685] max-w-[100px] truncate">{row.project_name ?? row.project_id}</td>
                  {!readOnly && (
                    <td className="px-3 py-2">
                      <button type="button" className="text-xs text-[oklch(0.46_0.16_55)] hover:underline" onClick={e => { e.stopPropagation(); setSelected(row); }}>Manage</button>
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
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLOR[selected.risk_tier]}`}>
                    {TIER_LABEL[selected.risk_tier]}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[selected.chain_status]}`}>
                    {selected.chain_status.replace(/_/g, ' ')}
                  </span>
                  {!!selected.is_safety && <span className="px-1 py-0.5 rounded text-[10px] bg-red-100 text-red-700">SAFETY</span>}
                  {!!selected.is_reportable && <span className="px-1 py-0.5 rounded text-[10px] bg-red-200 text-red-800">REGULATOR CROSSED</span>}
                </div>
                <h3 className="font-semibold text-[#0f1c2e]">{selected.title}</h3>
                <p className="text-xs text-[#9aa5b4] font-mono mt-0.5">{selected.id} · {selected.project_name ?? selected.project_id}</p>
              </div>
              <button type="button" className="text-[#9aa5b4] hover:text-[#3d4756] text-xl" onClick={() => { setSelected(null); setActionResult(null); }}>×</button>
            </div>

            {/* Chain state progress */}
            <div className="mb-4 px-3 py-3 bg-[#f8fafc] rounded-lg">
              <p className="text-[10px] text-[#9aa5b4] uppercase tracking-wide mb-2">Treatment progress</p>
              <ChainStateBar
                allStates={MAIN_RISK_STATES}
                currentState={selected.chain_status}
                branchStates={BRANCH_RISK_STATES}
                variant="full"
              />
            </div>

            {/* SLA urgency bar */}
            {selected.sla_remaining_hours_live != null && (
              <div className="mb-4">
                <SlaCountdown
                  remainingHours={selected.sla_remaining_hours_live}
                  totalHours={selected.sla_target_hours ?? SLA_HOURS_BY_TIER[selected.risk_tier]}
                  breached={!!selected.sla_breached}
                  label={`${TIER_LABEL[selected.risk_tier]} treatment SLA`}
                />
              </div>
            )}

            {selected.description && <p className="text-sm text-[#3d4756] mb-4">{selected.description}</p>}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <DetailRow label="Category" value={selected.risk_category.replace('_', ' ')} />
              <DetailRow label="Risk score" value={selected.risk_score != null ? `P${selected.probability_score}×I${selected.impact_score}=${selected.risk_score}` : '—'} />
              <DetailRow label="Residual score" value={selected.residual_risk_score != null ? String(selected.residual_risk_score) : 'Not yet assessed'} />
              <DetailRow label="Response strategy" value={selected.response_strategy ?? '—'} />
              {selected.contingency_reserve_zar && <DetailRow label="Contingency reserve" value={`R${Number(selected.contingency_reserve_zar).toLocaleString()}`} />}
              {selected.stage_gate_ref && <DetailRow label="Stage gate ref" value={selected.stage_gate_ref} />}
              {selected.issue_ref && <DetailRow label="Issue ref" value={selected.issue_ref} />}
              {selected.regulator_ref && <DetailRow label="Regulator ref" value={selected.regulator_ref} />}
            </div>

            {selected.response_plan && (
              <div className="bg-[oklch(0.97_0.003_250)] rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-[oklch(0.40_0.009_250)] mb-1">Response plan</p>
                <p className="text-xs text-[oklch(0.46_0.16_55)]">{selected.response_plan}</p>
              </div>
            )}

            {selected.risk_trigger_description && (
              <div className="bg-red-50 rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-red-800 mb-1">Risk trigger</p>
                <p className="text-xs text-red-700">{selected.risk_trigger_description}</p>
              </div>
            )}

            {/* W133 SIGNATURE warning */}
            {selected.is_safety && (selected.risk_tier === 'critical_impact' || selected.risk_tier === 'catastrophic') && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-red-800">W133 SIGNATURE</p>
                <p className="text-xs text-red-700 mt-0.5">
                  Escalating this safety {selected.risk_tier} risk will file a regulator crossing (OHSA s24 critical risk materialisation). Confirm before proceeding.
                </p>
              </div>
            )}

            {actionResult && (
              <div className={`text-xs rounded px-3 py-2 mb-3 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {actionResult}
              </div>
            )}

            {!readOnly && (
              <div>
                <p className="text-xs font-medium text-[#6b7685] mb-2">Available actions</p>
                <div className="flex flex-wrap gap-2">
                  {(ACTIONS[selected.chain_status] ?? []).map(({ action, label, danger }) => (
                    <button type="button"
                      key={action}
                      disabled={actionLoading}
                      className={`text-xs px-3 py-1.5 rounded font-medium transition
                        ${danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-[#c2873a] text-white hover:bg-[#a3702f]'}
                        disabled:opacity-50`}
                      onClick={() => handleAction(action)}
                    >
                      {actionLoading ? '…' : label}
                    </button>
                  ))}
                  {ACTIONS[selected.chain_status]?.length === 0 && (
                    <p className="text-xs text-[#9aa5b4]">No actions — terminal state.</p>
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
              <h3 className="font-semibold text-[#0f1c2e]">Identify new risk</h3>
              <button type="button" className="text-[#9aa5b4] hover:text-[#3d4756] text-xl" onClick={() => setShowCreate(false)}>×</button>
            </div>

            <div className="space-y-3">
              <FormField label="Title *">
                <input className="w-full text-sm border rounded px-2 py-1.5" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Risk title" />
              </FormField>
              <FormField label="Project ID *">
                <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="proj-kakamas-500mw" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Category">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newCategory} onChange={e => setNewCategory(e.target.value as RiskCategory)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' ')}</option>)}
                  </select>
                </FormField>
                <FormField label="Response strategy">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newStrategy} onChange={e => setNewStrategy(e.target.value)}>
                    {['avoid','mitigate','transfer','accept','escalate'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={`Probability (P${newProb})`}>
                  <input type="range" min={1} max={5} value={newProb} onChange={e => setNewProb(Number(e.target.value))} className="w-full" />
                  <p className="text-[10px] text-[#9aa5b4] mt-0.5">{['Rare','Unlikely','Possible','Likely','Almost certain'][newProb-1]}</p>
                </FormField>
                <FormField label={`Impact (I${newImpact})`}>
                  <input type="range" min={1} max={5} value={newImpact} onChange={e => setNewImpact(Number(e.target.value))} className="w-full" />
                  <p className="text-[10px] text-[#9aa5b4] mt-0.5">{['Negligible','Minor','Moderate','Major','Catastrophic'][newImpact-1]}</p>
                </FormField>
              </div>
              <div className="bg-[#f8fafc] rounded p-2 text-center">
                <span className="text-xs font-medium">Risk score: </span>
                <span className={`text-sm font-bold ${scoreColor(newProb * newImpact)}`}>{newProb}×{newImpact}={newProb * newImpact}</span>
                <span className="text-xs text-[#6b7685] ml-2">({TIER_LABEL[
                  newProb * newImpact >= 20 ? 'catastrophic' :
                  newProb * newImpact >= 15 ? 'critical_impact' :
                  newProb * newImpact >= 9 ? 'high_impact' :
                  newProb * newImpact >= 4 ? 'medium_impact' : 'low_impact'
                ]})</span>
              </div>
              <FormField label="Stage gate ref (W131, optional)">
                <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newStageGateRef} onChange={e => setNewStageGateRef(e.target.value)} placeholder="sg-001" />
              </FormField>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={newSafety} onChange={e => setNewSafety(e.target.checked)} />
                  Safety risk (OHSA s24)
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={newRegulatory} onChange={e => setNewRegulatory(e.target.checked)} />
                  Regulatory risk
                </label>
              </div>
            </div>

            {error && <div className="text-xs text-red-600 mt-3">{error}</div>}

            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="text-xs border rounded px-3 py-1.5 hover:bg-[#eef2f7]" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="button"
                className="text-xs bg-[#c2873a] text-white rounded px-3 py-1.5 hover:bg-[#a3702f] disabled:opacity-50"
                disabled={!newTitle || !newProject || createLoading}
                onClick={handleCreate}
              >
                {createLoading ? 'Identifying…' : 'Identify risk'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const cls = color === 'red' ? 'text-red-600' : color === 'orange' ? 'text-orange-600' : color === 'blue' ? 'text-[oklch(0.46_0.16_55)]' : 'text-[#2d3748]';
  return (
    <div className="bg-white rounded-lg border border-[#dde4ec] p-3">
      <p className="text-[10px] text-[#6b7685] uppercase tracking-wide">{label}</p>
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
      <p className="text-[10px] text-[#9aa5b4] uppercase tracking-wide">{label}</p>
      <p className="text-xs text-[#2d3748] font-mono">{value}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#3d4756] mb-1">{label}</label>
      {children}
    </div>
  );
}
