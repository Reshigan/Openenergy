// Wave 134 — IPP Stakeholder Register & Engagement Tracking.
// PHASE E WAVE 4 OF N — IPP-PM profile-completeness wave.
//
// PMBOK 7 Section 13 + ISO 21500:2021 + REIPPPP S4 + IFC PS1 + EP4.
// URGENT SLA polarity: strategic_ally 24h TIGHTEST (daily contact required).
// SIGNATURE: escalate_engagement EVERY tier; flag_resistant crosses when power_score >= 4.
//
// Beats: Engage, Darzin, Boora, Synergi, Quorum, Stakeholder Map Pro, Borealis CSR.
// Mounted at /ipp-lifecycle/workstation?tab=stakeholder-register (WRITE: ipp_developer/admin).
// READ all 9 personas via readOnly prop.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { statusLabel } from '../../meridian/ease/statusLabel';
import { ChainStateBar } from '../ChainStateBar';
import { SlaCountdown } from '../SlaCountdown';

type StakeholderStatus =
  | 'identified' | 'analyzed' | 'classified' | 'engagement_planned'
  | 'active_engagement' | 'responsive' | 'supportive' | 'champion'
  | 'resistant' | 'disengaged' | 'escalated' | 'archived';

type StakeholderTier =
  | 'strategic_ally' | 'key_player' | 'keep_satisfied' | 'keep_informed' | 'monitor';

type StakeholderType =
  | 'community_leader' | 'municipality' | 'traditional_authority'
  | 'regulator' | 'funder' | 'offtaker' | 'contractor' | 'consultant'
  | 'ngo' | 'government_dept' | 'media' | 'internal';

interface StakeholderRow {
  id: string;
  project_id: string;
  project_name: string | null;
  stakeholder_name: string;
  organization: string | null;
  stakeholder_type: StakeholderType;
  chain_status: StakeholderStatus;
  power_score: number | null;
  interest_score: number | null;
  urgency_score: number | null;
  engagement_score: number | null;
  stakeholder_tier: StakeholderTier | null;
  current_engagement_level: string | null;
  desired_engagement_level: string | null;
  communication_frequency: string | null;
  communication_channel: string | null;
  communication_plan: string | null;
  last_engagement_at: string | null;
  next_engagement_due_at: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  floor_ep4_required: number;
  floor_board_notify: number;
  floor_legal_risk: number;
  floor_nersa_required: number;
  floor_lender_required: number;
  is_reportable: number;
  regulator_relevant: number;
  regulator_ref: string | null;
  stage_gate_ref: string | null;
  issue_ref: string | null;
  risk_ref: string | null;
  urgency_band_live: string;
  sla_remaining_hours_live: number | null;
  time_in_state_hours_live: number | null;
  is_high_power_resistant_live: boolean;
  created_at: string;
}

interface Dashboard {
  stakeholders: {
    total_count: number;
    active_count: number;
    champion_count: number;
    resistant_count: number;
    sla_breached_count: number;
    high_power_resistant: number;
    key_player_count: number;
  };
}

const TIER_LABEL: Record<StakeholderTier, string> = {
  strategic_ally: 'Strategic ally',
  key_player:     'Key player',
  keep_satisfied: 'Keep satisfied',
  keep_informed:  'Keep informed',
  monitor:        'Monitor',
};

const TIER_COLOR: Record<StakeholderTier, string> = {
  strategic_ally: 'bg-purple-100 text-purple-800',
  key_player:     'bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]',
  keep_satisfied: 'bg-amber-100 text-amber-700',
  keep_informed:  'bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)]',
  monitor:        'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
};

const STATUS_COLOR: Record<StakeholderStatus, string> = {
  identified:        'bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)]',
  analyzed:          'bg-[oklch(0.97_0.003_250)] text-[oklch(0.46_0.16_55)]',
  classified:        'bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]',
  engagement_planned:'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  active_engagement: 'bg-violet-100 text-violet-700',
  responsive:        'bg-cyan-100 text-cyan-700',
  supportive:        'bg-emerald-100 text-emerald-800',
  champion:          'bg-green-100 text-green-800',
  resistant:         'bg-red-100 text-red-800',
  disengaged:        'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  escalated:         'bg-red-200 text-red-900',
  archived:          'bg-[var(--border-subtle, #e8ecf0)] text-[var(--ink-2, #9aa5b4)]',
};

const ENGAGEMENT_LEVEL_COLOR: Record<string, string> = {
  unaware:    'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  resistant:  'bg-red-100 text-red-700',
  neutral:    'bg-yellow-50 text-yellow-700',
  supportive: 'bg-emerald-50 text-emerald-700',
  leading:    'bg-green-100 text-green-800',
};

const ACTIONS: Record<StakeholderStatus, Array<{ action: string; label: string; danger?: boolean }>> = {
  identified:        [{ action: 'analyze_stakeholder', label: 'Analyze' }, { action: 'flag_resistant', label: 'Flag resistant', danger: true }],
  analyzed:          [{ action: 'classify_stakeholder', label: 'Classify' }, { action: 'flag_resistant', label: 'Flag resistant', danger: true }],
  classified:        [{ action: 'plan_engagement', label: 'Plan engagement' }, { action: 'flag_resistant', label: 'Flag resistant', danger: true }],
  engagement_planned:[{ action: 'activate_engagement', label: 'Activate engagement' }, { action: 'flag_resistant', label: 'Flag resistant', danger: true }],
  active_engagement: [{ action: 'record_response', label: 'Record response' }, { action: 'flag_disengaged', label: 'Flag disengaged' }, { action: 'flag_resistant', label: 'Flag resistant', danger: true }],
  responsive:        [{ action: 'confirm_supportive', label: 'Confirm supportive' }, { action: 'flag_disengaged', label: 'Flag disengaged' }, { action: 'flag_resistant', label: 'Flag resistant', danger: true }],
  supportive:        [{ action: 'elevate_to_champion', label: 'Elevate to champion' }, { action: 'archive_stakeholder', label: 'Archive' }, { action: 'flag_disengaged', label: 'Flag disengaged' }, { action: 'flag_resistant', label: 'Flag resistant', danger: true }],
  champion:          [{ action: 'archive_stakeholder', label: 'Archive' }, { action: 'flag_resistant', label: 'Flag resistant (regression)', danger: true }],
  resistant:         [{ action: 'escalate_engagement', label: 'Escalate', danger: true }, { action: 're_engage', label: 'Re-engage' }],
  disengaged:        [{ action: 'escalate_engagement', label: 'Escalate', danger: true }, { action: 're_engage', label: 'Re-engage' }],
  escalated:         [{ action: 're_engage', label: 'Re-engage' }],
  archived:          [],
};

const TYPES: StakeholderType[] = [
  'community_leader','municipality','traditional_authority','regulator',
  'funder','offtaker','contractor','consultant','ngo','government_dept','media','internal',
];
const TIERS: StakeholderTier[] = ['strategic_ally','key_player','keep_satisfied','keep_informed','monitor'];
const STATUSES: StakeholderStatus[] = [
  'identified','analyzed','classified','engagement_planned',
  'active_engagement','responsive','supportive','champion',
  'resistant','disengaged','escalated','archived',
];

const MAIN_STATES: readonly StakeholderStatus[] = [
  'identified','analyzed','classified','engagement_planned',
  'active_engagement','responsive','supportive','champion',
];
const BRANCH_STATES: readonly StakeholderStatus[] = [
  'resistant','disengaged','escalated','archived',
];

const SLA_HOURS_BY_TIER: Record<StakeholderTier, number> = {
  strategic_ally: 24, key_player: 48, keep_satisfied: 168, keep_informed: 336, monitor: 720,
};

function deriveTierFromScores(p: number, i: number): StakeholderTier {
  if (p >= 5 && i >= 5) return 'strategic_ally';
  if (p >= 4 && i >= 4) return 'key_player';
  if (p >= 4) return 'keep_satisfied';
  if (i >= 4) return 'keep_informed';
  return 'monitor';
}

interface Props { readOnly?: boolean }

export default function IppStakeholderTab({ readOnly = false }: Props) {
  const [rows, setRows] = useState<StakeholderRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StakeholderRow | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<StakeholderStatus | ''>('');
  const [filterTier, setFilterTier] = useState<StakeholderTier | ''>('');
  const [filterType, setFilterType] = useState<StakeholderType | ''>('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [newType, setNewType] = useState<StakeholderType>('community_leader');
  const [newContact, setNewContact] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPower, setNewPower] = useState(3);
  const [newInterest, setNewInterest] = useState(3);
  const [newUrgency, setNewUrgency] = useState(3);
  const [newPlan, setNewPlan] = useState('');
  const [newEp4, setNewEp4] = useState(false);
  const [newNersa, setNewNersa] = useState(false);
  const [newLender, setNewLender] = useState(false);
  const [newLegal, setNewLegal] = useState(false);
  const [newBoard, setNewBoard] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api('/api/ipp-stakeholder');
      setRows(res.data?.data ?? []);
      setDashboard(res.data?.dashboard ?? null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = (s: StakeholderStatus) => s === 'archived' ? 1 : 0;
    // primary view: active first, then high-power-resistant, then breached, then most overdue engagement first
    return rows.filter(r => {
      if (filterStatus && r.chain_status !== filterStatus) return false;
      if (filterTier && r.stakeholder_tier !== filterTier) return false;
      if (filterType && r.stakeholder_type !== filterType) return false;
      return true;
    }).sort((a, b) => {
      if (term(a.chain_status) !== term(b.chain_status)) return term(a.chain_status) - term(b.chain_status);
      if (a.is_high_power_resistant_live !== b.is_high_power_resistant_live) return a.is_high_power_resistant_live ? -1 : 1;
      if (!!a.sla_breached !== !!b.sla_breached) return (b.sla_breached ? 1 : 0) - (a.sla_breached ? 1 : 0);
      return (a.sla_remaining_hours_live ?? Infinity) - (b.sla_remaining_hours_live ?? Infinity);
    });
  }, [rows, filterStatus, filterTier, filterType]);

  async function handleAction(action: string) {
    if (!selected) return;
    setActionLoading(true); setActionResult(null);
    try {
      await api(`/api/ipp-stakeholder/${selected.id}/${action}`, { method: 'POST', data: {} });
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
    if (!newName || !newProject) return;
    setCreateLoading(true);
    try {
      await api('/api/ipp-stakeholder', {
        method: 'POST',
        data: {
          stakeholder_name: newName,
          project_id: newProject,
          organization: newOrg || undefined,
          stakeholder_type: newType,
          contact_person: newContact || undefined,
          contact_email: newEmail || undefined,
          contact_phone: newPhone || undefined,
          power_score: newPower,
          interest_score: newInterest,
          urgency_score: newUrgency,
          communication_plan: newPlan || undefined,
          floor_ep4_required: newEp4 ? 1 : 0,
          floor_nersa_required: newNersa ? 1 : 0,
          floor_lender_required: newLender ? 1 : 0,
          floor_legal_risk: newLegal ? 1 : 0,
          floor_board_notify: newBoard ? 1 : 0,
        },
      });
      setShowCreate(false);
      setNewName(''); setNewProject(''); setNewOrg(''); setNewContact(''); setNewEmail(''); setNewPhone(''); setNewPlan('');
      setNewEp4(false); setNewNersa(false); setNewLender(false); setNewLegal(false); setNewBoard(false);
      setNewPower(3); setNewInterest(3); setNewUrgency(3);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setCreateLoading(false);
    }
  }

  const db = dashboard?.stakeholders;
  const previewTier = deriveTierFromScores(newPower, newInterest);

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      {db && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <KpiCard label="Total" value={db.total_count} color="gray" />
          <KpiCard label="Active" value={db.active_count} color="blue" />
          <KpiCard label="Champions" value={db.champion_count} color="green" />
          <KpiCard label="Resistant" value={db.resistant_count} color="red" />
          <KpiCard label="SLA breached" value={db.sla_breached_count} color="red" />
          <KpiCard label="High-power resistant" value={db.high_power_resistant} color="red" />
        </div>
      )}

      {/* AI insight card (W134 SIGNATURE warning) */}
      {db && db.resistant_count > 0 && db.high_power_resistant > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-red-500 text-xl mt-0.5">⚑</span>
          <div>
            <p className="text-sm font-semibold text-red-800">
              {db.high_power_resistant} high-power stakeholder{db.high_power_resistant > 1 ? 's' : ''} in resistant state
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              PMBOK 7: resistant key stakeholders require immediate escalation to project director.
              Power ≥ 4 resistance triggers mandatory regulator crossing (REIPPPP S4 + IFC PS1).
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="text-xs border rounded px-2 py-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value as StakeholderStatus | '')}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterTier} onChange={e => setFilterTier(e.target.value as StakeholderTier | '')}>
          <option value="">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterType} onChange={e => setFilterType(e.target.value as StakeholderType | '')}>
          <option value="">All types</option>
          {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <span className="text-xs text-[var(--ink-2, #9aa5b4)] ml-auto">{filtered.length} stakeholders</span>
        {!readOnly && (
          <button type="button" className="text-xs bg-[#c2873a] text-white rounded px-3 py-1 hover:bg-[#a3702f]" onClick={() => setShowCreate(true)}>
            + Add stakeholder
          </button>
        )}
        <button type="button" className="text-xs border rounded px-2 py-1 hover:bg-[var(--s2, #eef2f7)]" onClick={load}>Refresh</button>
      </div>

      {actionResult && (
        <div className={`text-xs rounded px-3 py-2 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {actionResult}
        </div>
      )}
      {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
      {loading && <div className="text-xs text-[var(--ink-2, #9aa5b4)]">Loading stakeholder register…</div>}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle, #dde4ec)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--s1, #f8fafc)]">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">ID</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Name / Org</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Type</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Tier</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">P×I×U</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Engagement</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Status</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">SLA</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Flags</th>
                {!readOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={readOnly ? 9 : 10} className="px-3 py-6 text-center text-[var(--ink-2, #9aa5b4)]">No stakeholders in register</td></tr>
              )}
              {filtered.map(row => (
                <tr key={row.id} className="border-t border-[var(--s2, #eef2f7)] hover:bg-[var(--s2, #eef2f7)] cursor-pointer" onClick={() => setSelected(row)}>
                  <td className="px-3 py-2 font-mono text-[var(--ink-2, #9aa5b4)]">{row.id}</td>
                  <td className="px-3 py-2 max-w-[160px]">
                    <span className="font-medium text-[var(--ink, #1e2a38)] block truncate">{row.stakeholder_name}</span>
                    {row.organization && <span className="text-[var(--ink-2, #9aa5b4)] truncate block">{row.organization}</span>}
                  </td>
                  <td className="px-3 py-2 capitalize text-[var(--ink-2, #3d4756)]">{row.stakeholder_type.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2">
                    {row.stakeholder_tier && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLOR[row.stakeholder_tier]}`}>
                        {TIER_LABEL[row.stakeholder_tier]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--ink, #2d3748)]">
                    {row.power_score && row.interest_score && row.urgency_score
                      ? <span className="font-bold">{row.power_score}×{row.interest_score}×{row.urgency_score}={row.engagement_score}</span>
                      : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {row.current_engagement_level && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ENGAGEMENT_LEVEL_COLOR[row.current_engagement_level] ?? ''}`}>
                        {row.current_engagement_level}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[row.chain_status]}`}>
                      {statusLabel(row.chain_status).text}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.sla_remaining_hours_live != null && row.stakeholder_tier ? (
                      <SlaCountdown
                        remainingHours={row.sla_remaining_hours_live}
                        totalHours={row.sla_target_hours ?? SLA_HOURS_BY_TIER[row.stakeholder_tier]}
                        breached={!!row.sla_breached}
                        compact
                      />
                    ) : <span className="text-[var(--ink-2, #9aa5b4)]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {!!row.floor_ep4_required && <Flag label="EP4" title="REIPPPP S4 required" cls="bg-orange-100 text-orange-700" />}
                      {!!row.floor_nersa_required && <Flag label="NERSA" title="NERSA required" cls="bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]" />}
                      {!!row.floor_lender_required && <Flag label="L" title="Lender required" cls="bg-purple-100 text-purple-700" />}
                      {!!row.floor_legal_risk && <Flag label="⚖" title="Legal risk" cls="bg-red-100 text-red-700" />}
                      {!!row.floor_board_notify && <Flag label="B" title="Board notify" cls="bg-violet-100 text-violet-700" />}
                      {!!row.is_reportable && <Flag label="⚑" title="Regulator crossed" cls="bg-red-200 text-red-800" />}
                    </div>
                  </td>
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
          <div className="bg-surface-v2 rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {selected.stakeholder_tier && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLOR[selected.stakeholder_tier]}`}>
                      {TIER_LABEL[selected.stakeholder_tier]}
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[selected.chain_status]}`}>
                    {statusLabel(selected.chain_status).text}
                  </span>
                  {!!selected.floor_ep4_required && <span className="px-1 py-0.5 rounded text-[10px] bg-orange-100 text-orange-700">EP4</span>}
                  {!!selected.is_reportable && <span className="px-1 py-0.5 rounded text-[10px] bg-red-200 text-red-800">REGULATOR CROSSED</span>}
                </div>
                <h3 className="font-semibold text-[var(--ink, #0f1c2e)]">{selected.stakeholder_name}</h3>
                {selected.organization && <p className="text-xs text-[var(--ink-2, #6b7685)]">{selected.organization}</p>}
                <p className="text-xs text-[var(--ink-2, #9aa5b4)] font-mono mt-0.5">{selected.id} · {selected.project_name ?? selected.project_id}</p>
              </div>
              <button type="button" className="text-[var(--ink-2, #9aa5b4)] hover:text-[var(--ink-2, #3d4756)] text-xl" onClick={() => { setSelected(null); setActionResult(null); }}>×</button>
            </div>

            {/* Chain state progress */}
            <div className="mb-4 px-3 py-3 bg-[var(--s1, #f8fafc)] rounded-lg">
              <p className="text-[10px] text-[var(--ink-2, #9aa5b4)] uppercase tracking-wide mb-2">Engagement progress</p>
              <ChainStateBar
                allStates={MAIN_STATES}
                currentState={selected.chain_status}
                branchStates={BRANCH_STATES}
                variant="full"
              />
            </div>

            {/* SLA */}
            {selected.sla_remaining_hours_live != null && selected.stakeholder_tier && (
              <div className="mb-4">
                <SlaCountdown
                  remainingHours={selected.sla_remaining_hours_live}
                  totalHours={selected.sla_target_hours ?? SLA_HOURS_BY_TIER[selected.stakeholder_tier]}
                  breached={!!selected.sla_breached}
                  label={`${TIER_LABEL[selected.stakeholder_tier]} engagement SLA`}
                />
              </div>
            )}

            {/* P×I×U score display */}
            <div className="flex gap-3 mb-4">
              <ScoreBadge label="Power" value={selected.power_score} color="purple" />
              <ScoreBadge label="Interest" value={selected.interest_score} color="blue" />
              <ScoreBadge label="Urgency" value={selected.urgency_score} color="amber" />
              {selected.engagement_score && (
                <div className="flex-1 bg-[var(--s1, #f8fafc)] rounded-lg px-3 py-2 text-center">
                  <p className="text-[10px] text-[var(--ink-2, #9aa5b4)] uppercase">P×I×U score</p>
                  <p className="text-xl font-bold text-[var(--ink, #1e2a38)]">{selected.engagement_score}</p>
                </div>
              )}
            </div>

            {/* Engagement level: current → desired */}
            <div className="flex items-center gap-3 mb-4 bg-[oklch(0.97_0.003_250)] rounded-lg px-3 py-2">
              <div className="text-center">
                <p className="text-[10px] text-[oklch(0.60_0.08_250)] uppercase mb-0.5">Current</p>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ENGAGEMENT_LEVEL_COLOR[selected.current_engagement_level ?? 'neutral'] ?? ''}`}>
                  {selected.current_engagement_level ?? '—'}
                </span>
              </div>
              <span className="text-[oklch(0.60_0.08_250)] text-sm">→</span>
              <div className="text-center">
                <p className="text-[10px] text-[oklch(0.60_0.08_250)] uppercase mb-0.5">Target</p>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ENGAGEMENT_LEVEL_COLOR[selected.desired_engagement_level ?? 'supportive'] ?? ''}`}>
                  {selected.desired_engagement_level ?? '—'}
                </span>
              </div>
              {selected.communication_frequency && (
                <div className="ml-auto text-right">
                  <p className="text-[10px] text-[oklch(0.60_0.08_250)] uppercase mb-0.5">Frequency</p>
                  <p className="text-xs text-[oklch(0.46_0.16_55)] font-medium capitalize">{selected.communication_frequency}</p>
                </div>
              )}
            </div>

            {/* Communication plan */}
            {selected.communication_plan && (
              <div className="bg-[oklch(0.97_0.003_250)] rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-[oklch(0.40_0.009_250)] mb-1">Communication plan</p>
                <p className="text-xs text-[oklch(0.46_0.16_55)]">{selected.communication_plan}</p>
              </div>
            )}

            {/* Contact info */}
            {(selected.contact_person || selected.contact_email || selected.contact_phone) && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {selected.contact_person && <DetailRow label="Contact" value={selected.contact_person} />}
                {selected.contact_email && <DetailRow label="Email" value={selected.contact_email} />}
                {selected.contact_phone && <DetailRow label="Phone" value={selected.contact_phone} />}
              </div>
            )}

            {/* Bridge refs */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {selected.stage_gate_ref && <DetailRow label="Stage gate ref" value={selected.stage_gate_ref} />}
              {selected.issue_ref && <DetailRow label="Issue ref" value={selected.issue_ref} />}
              {selected.risk_ref && <DetailRow label="Risk ref" value={selected.risk_ref} />}
              {selected.regulator_ref && <DetailRow label="Regulator ref" value={selected.regulator_ref} />}
              {selected.last_engagement_at && <DetailRow label="Last engagement" value={new Date(selected.last_engagement_at).toLocaleDateString()} />}
            </div>

            {/* W134 SIGNATURE warning */}
            {selected.chain_status === 'resistant' && (selected.power_score ?? 0) >= 4 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-red-800">High-power resistant stakeholder</p>
                <p className="text-xs text-red-700 mt-0.5">
                  Power score {selected.power_score} ≥ 4. Escalating will trigger a mandatory regulator crossing
                  (REIPPPP S4 + IFC PS1 community-participation risk). Confirm before proceeding.
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
                <p className="text-xs font-medium text-[var(--ink-2, #6b7685)] mb-2">Available actions</p>
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
                    <p className="text-xs text-[var(--ink-2, #9aa5b4)]">No actions — terminal state.</p>
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
          <div className="bg-surface-v2 rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[var(--ink, #0f1c2e)]">Add stakeholder</h3>
              <button type="button" className="text-[var(--ink-2, #9aa5b4)] hover:text-[var(--ink-2, #3d4756)] text-xl" onClick={() => setShowCreate(false)}>×</button>
            </div>

            <div className="space-y-3">
              <FormField label="Stakeholder name *">
                <input className="w-full text-sm border rounded px-2 py-1.5" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" />
              </FormField>
              <FormField label="Project ID *">
                <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="proj-kakamas-500mw" />
              </FormField>
              <FormField label="Organization">
                <input className="w-full text-sm border rounded px-2 py-1.5" value={newOrg} onChange={e => setNewOrg(e.target.value)} placeholder="Company / institution" />
              </FormField>
              <FormField label="Type">
                <select className="w-full text-sm border rounded px-2 py-1.5" value={newType} onChange={e => setNewType(e.target.value as StakeholderType)}>
                  {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </FormField>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Contact person">
                  <input className="w-full text-sm border rounded px-2 py-1.5" value={newContact} onChange={e => setNewContact(e.target.value)} placeholder="Name" />
                </FormField>
                <FormField label="Email">
                  <input type="email" className="w-full text-sm border rounded px-2 py-1.5" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="name@org.co.za" />
                </FormField>
                <FormField label="Phone">
                  <input className="w-full text-sm border rounded px-2 py-1.5" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+27..." />
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField label={`Power (P${newPower})`}>
                  <input type="range" min={1} max={5} value={newPower} onChange={e => setNewPower(Number(e.target.value))} className="w-full" />
                  <p className="text-[10px] text-[var(--ink-2, #9aa5b4)] mt-0.5">{['Minimal','Low','Medium','High','Very high'][newPower-1]}</p>
                </FormField>
                <FormField label={`Interest (I${newInterest})`}>
                  <input type="range" min={1} max={5} value={newInterest} onChange={e => setNewInterest(Number(e.target.value))} className="w-full" />
                  <p className="text-[10px] text-[var(--ink-2, #9aa5b4)] mt-0.5">{['Minimal','Low','Medium','High','Very high'][newInterest-1]}</p>
                </FormField>
                <FormField label={`Urgency (U${newUrgency})`}>
                  <input type="range" min={1} max={5} value={newUrgency} onChange={e => setNewUrgency(Number(e.target.value))} className="w-full" />
                  <p className="text-[10px] text-[var(--ink-2, #9aa5b4)] mt-0.5">{['Minimal','Low','Medium','High','Very high'][newUrgency-1]}</p>
                </FormField>
              </div>
              {/* Live tier preview */}
              <div className="bg-[var(--s1, #f8fafc)] rounded p-2 flex items-center justify-between">
                <span className="text-xs font-medium">Tier preview:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${TIER_COLOR[previewTier]}`}>
                  {TIER_LABEL[previewTier]}
                </span>
                <span className="text-xs text-[var(--ink-2, #6b7685)]">P×I×U = {newPower * newInterest * newUrgency}</span>
                <span className="text-xs text-[var(--ink-2, #6b7685)]">SLA: {SLA_HOURS_BY_TIER[previewTier]}h</span>
              </div>
              <FormField label="Communication plan">
                <textarea className="w-full text-sm border rounded px-2 py-1.5 resize-none" rows={3} value={newPlan} onChange={e => setNewPlan(e.target.value)} placeholder="Describe engagement strategy..." />
              </FormField>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { val: newEp4, set: setNewEp4, label: 'REIPPPP S4 required (EP4)' },
                  { val: newNersa, set: setNewNersa, label: 'NERSA process required' },
                  { val: newLender, set: setNewLender, label: 'Lender / DFI required' },
                  { val: newLegal, set: setNewLegal, label: 'Legal risk flag' },
                  { val: newBoard, set: setNewBoard, label: 'Board-level notify' },
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
              <button type="button" className="text-xs border rounded px-3 py-1.5 hover:bg-[var(--s2, #eef2f7)]" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="button"
                className="text-xs bg-[#c2873a] text-white rounded px-3 py-1.5 hover:bg-[#a3702f] disabled:opacity-50"
                disabled={!newName || !newProject || createLoading}
                onClick={handleCreate}
              >
                {createLoading ? 'Adding…' : 'Add stakeholder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const cls = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-green-600' : color === 'blue' ? 'text-[oklch(0.46_0.16_55)]' : 'text-[var(--ink, #2d3748)]';
  return (
    <div className="bg-surface-v2 rounded-lg border border-[var(--border-subtle, #dde4ec)] p-3">
      <p className="text-[10px] text-[var(--ink-2, #6b7685)] uppercase tracking-wide">{label}</p>
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
      <p className="text-[10px] text-[var(--ink-2, #9aa5b4)] uppercase tracking-wide">{label}</p>
      <p className="text-xs text-[var(--ink, #2d3748)]">{value}</p>
    </div>
  );
}

function ScoreBadge({ label, value, color }: { label: string; value: number | null; color: string }) {
  const bg = color === 'purple' ? 'bg-purple-50 border-purple-200' : color === 'blue' ? 'bg-[oklch(0.97_0.003_250)] border-[oklch(0.87_0.012_250)]' : 'bg-amber-50 border-amber-200';
  const text = color === 'purple' ? 'text-purple-700' : color === 'blue' ? 'text-[oklch(0.46_0.16_55)]' : 'text-amber-700';
  return (
    <div className={`flex-1 rounded-lg border px-3 py-2 text-center ${bg}`}>
      <p className={`text-[10px] uppercase tracking-wide ${text}`}>{label}</p>
      <p className={`text-xl font-bold ${text}`}>{value ?? '—'}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--ink-2, #3d4756)] mb-1">{label}</label>
      {children}
    </div>
  );
}
