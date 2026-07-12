// Wave 140 — IPP Subcontractor Management
// OHSA SA Construction Regs 2014 Reg.6 + ISO 45001:2018 + REIPPPP ED + Equator Principles EP4.
// URGENT SLA: critical_trade 24h (tightest) → labor_only 168h (loosest).
// SIGNATURE: terminate_subcontractor EVERY tier on safety_violation;
//            suspend_subcontractor when floor_ohsa_notification;
//            close_subcontract when floor_lender_escrow_release.
// Beats Oracle Aconex (documents only) + Procore Subcontractors (no performance scoring or OHSA lifecycle).
// Mounted at /ipp-lifecycle/workstation?tab=subcontractors (WRITE: ipp_developer/admin/support).
// READ all 9 personas via readOnly prop.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainStateBar } from '../ChainStateBar';
import { SlaCountdown } from '../SlaCountdown';
import { statusLabel } from '../../meridian/ease/statusLabel';

type SubcontractorStatus =
  | 'registered' | 'pre_qualification' | 'inducted' | 'mobilized'
  | 'performing' | 'under_review' | 'good_standing' | 'work_complete'
  | 'demobilized' | 'closed' | 'suspended' | 'terminated';

type SubcontractorTier = 'critical_trade' | 'specialist' | 'general_trade' | 'labor_only';

interface SubcontractorRow {
  id: string;
  project_id: string;
  project_name: string | null;
  company_name: string;
  chain_status: SubcontractorStatus;
  trade_category: string | null;
  subcontractor_tier: SubcontractorTier | null;
  contract_ref: string | null;
  contract_value_zar: number | null;
  scope_description: string;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  bee_level: number | null;
  local_content_pct: number | null;
  sa_employee_count: number | null;
  insurance_expiry_date: string | null;
  cidb_grade: string | null;
  registration_number: string | null;
  performance_score: number | null;
  hse_incident_count: number;
  ncr_count: number;
  review_notes: string | null;
  termination_cause: string | null;
  suspension_reason: string | null;
  reinstatement_conditions: string | null;
  site_representative: string | null;
  site_representative_phone: string | null;
  safety_officer: string | null;
  safety_officer_phone: string | null;
  floor_ohsa_notification: number;
  floor_lender_escrow_release: number;
  floor_reipppp_ed_reporting: number;
  floor_bee_verification: number;
  floor_ie_oversight: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  ed_commitment_ref: string | null;
  hse_incident_ref: string | null;
  ncr_ref: string | null;
  ms_ref: string | null;
  created_at: string;
  // Live fields
  time_in_state_hours_live: number | null;
  sla_remaining_hours_live: number | null;
  is_active_live: boolean;
  is_suspended_live: boolean;
  is_terminated_live: boolean;
  is_signature_live: boolean;
  insurance_near_expiry_live: boolean;
}

interface Dashboard {
  subcontractors: {
    total_count: number;
    active_count: number;
    suspended_count: number;
    terminated_count: number;
    critical_trade_count: number;
    sla_breached_count: number;
    ohsa_notification_count: number;
    avg_performance_score: number | null;
  };
}

const SLA_HOURS_BY_TIER: Record<SubcontractorTier, number> = {
  critical_trade: 24,
  specialist: 48,
  general_trade: 96,
  labor_only: 168,
};

const TIER_LABEL: Record<SubcontractorTier, string> = {
  critical_trade: 'Critical trade',
  specialist: 'Specialist',
  general_trade: 'General trade',
  labor_only: 'Labour supply',
};

const TIER_COLOR: Record<SubcontractorTier, string> = {
  critical_trade: 'bg-red-100 text-red-800',
  specialist: 'bg-orange-100 text-orange-700',
  general_trade: 'bg-amber-100 text-amber-700',
  labor_only: 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
};

const TRADE_CATEGORY_LABEL: Record<string, string> = {
  structural: 'Structural',
  electrical_hv: 'Electrical (HV)',
  electrical_lv: 'Electrical (LV)',
  mechanical: 'Mechanical',
  civil: 'Civil',
  instrumentation: 'Instrumentation',
  scaffolding: 'Scaffolding',
  demolition: 'Demolition',
  commissioning_specialist: 'Commissioning specialist',
  labor_supply: 'Labour supply',
  cleaning: 'Cleaning',
  general: 'General',
};

const TERMINATION_CAUSE_LABEL: Record<string, string> = {
  safety_violation: 'Safety violation (OHSA)',
  performance: 'Performance failure',
  insolvency: 'Insolvency',
  mutual_agreement: 'Mutual agreement',
  force_majeure: 'Force majeure',
};

const STATUS_COLOR: Record<SubcontractorStatus, string> = {
  registered:       'bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)]',
  pre_qualification:'bg-[oklch(0.97_0.003_250)] text-[oklch(0.46_0.16_55)]',
  inducted:         'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  mobilized:        'bg-violet-100 text-violet-700',
  performing:       'bg-green-100 text-green-800',
  under_review:     'bg-amber-100 text-amber-700',
  good_standing:    'bg-emerald-100 text-emerald-800',
  work_complete:    'bg-teal-100 text-teal-700',
  demobilized:      'bg-cyan-100 text-cyan-700',
  closed:           'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  suspended:        'bg-orange-100 text-orange-800',
  terminated:       'bg-red-200 text-red-900',
};

const ACTIONS: Record<SubcontractorStatus, Array<{ action: string; label: string; danger?: boolean }>> = {
  registered:       [{ action: 'start_prequalification', label: 'Start pre-qualification' }, { action: 'suspend_subcontractor', label: 'Suspend', danger: true }],
  pre_qualification:[{ action: 'complete_induction', label: 'Complete induction' }, { action: 'suspend_subcontractor', label: 'Suspend', danger: true }],
  inducted:         [{ action: 'mobilize', label: 'Mobilize to site' }, { action: 'suspend_subcontractor', label: 'Suspend', danger: true }],
  mobilized:        [{ action: 'commence_work', label: 'Commence work' }, { action: 'suspend_subcontractor', label: 'Suspend', danger: true }],
  performing:       [
    { action: 'trigger_review', label: 'Trigger performance review' },
    { action: 'complete_work', label: 'Mark work complete' },
    { action: 'suspend_subcontractor', label: 'Suspend', danger: true },
    { action: 'terminate_subcontractor', label: 'Terminate', danger: true },
  ],
  under_review:     [
    { action: 'confirm_good_standing', label: 'Confirm good standing' },
    { action: 'suspend_subcontractor', label: 'Suspend', danger: true },
    { action: 'terminate_subcontractor', label: 'Terminate', danger: true },
  ],
  good_standing:    [
    { action: 'return_to_performing', label: 'Return to active work' },
    { action: 'complete_work', label: 'Mark work complete' },
    { action: 'suspend_subcontractor', label: 'Suspend', danger: true },
    { action: 'terminate_subcontractor', label: 'Terminate', danger: true },
  ],
  work_complete:    [{ action: 'demobilize', label: 'Demobilize from site' }],
  demobilized:      [{ action: 'close_subcontract', label: 'Close subcontract' }],
  closed:           [],
  suspended:        [
    { action: 'reinstate_subcontractor', label: 'Reinstate' },
    { action: 'terminate_subcontractor', label: 'Terminate (permanent)', danger: true },
  ],
  terminated:       [],
};

const MAIN_STATES: readonly SubcontractorStatus[] = [
  'registered', 'pre_qualification', 'inducted', 'mobilized',
  'performing', 'under_review', 'good_standing', 'work_complete',
  'demobilized', 'closed',
];
const BRANCH_STATES: readonly SubcontractorStatus[] = ['suspended', 'terminated'];
const ALL_STATUSES: SubcontractorStatus[] = [...MAIN_STATES, ...BRANCH_STATES];
const SUBCONTRACTOR_TIERS: SubcontractorTier[] = ['critical_trade', 'specialist', 'general_trade', 'labor_only'];
const TRADE_CATEGORIES = Object.keys(TRADE_CATEGORY_LABEL);

function Flag({ label, title, cls }: { label: string; title: string; cls: string }) {
  return (
    <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${cls}`} title={title}>{label}</span>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-[oklch(0.97_0.003_250)] text-[oklch(0.17_0.010_250)] border-[oklch(0.87_0.012_250)]',
    red: 'bg-red-50 text-red-900 border-red-200',
    orange: 'bg-orange-50 text-orange-900 border-orange-200',
    green: 'bg-green-50 text-green-900 border-green-200',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
    gray: 'bg-[var(--s1, #f8fafc)] text-[var(--ink, #2d3748)] border-[var(--border-subtle, #dde4ec)]',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[color] ?? colors.gray}`}>
      <div className="text-xs text-current opacity-70">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function CheckRow({ label, checked, onChange, warningLabel }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; warningLabel?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded" />
      <span>{label}</span>
      {checked && warningLabel && (
        <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-800">{warningLabel}</span>
      )}
    </label>
  );
}

function PerformanceBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[var(--ink-2, #9aa5b4)] text-xs">—</span>;
  const cls = score < 60
    ? 'bg-red-100 text-red-800'
    : score < 80
      ? 'bg-amber-100 text-amber-700'
      : 'bg-green-100 text-green-800';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`}>
      {score.toFixed(1)}
    </span>
  );
}

interface Props { readOnly?: boolean }

export default function IppSubcontractorTab({ readOnly = false }: Props) {
  const [rows, setRows] = useState<SubcontractorRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubcontractorRow | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<SubcontractorStatus | ''>('');
  const [filterTier, setFilterTier] = useState<SubcontractorTier | ''>('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newCompany, setNewCompany] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newTradeCategory, setNewTradeCategory] = useState('electrical_hv');
  const [newTier, setNewTier] = useState<SubcontractorTier>('specialist');
  const [newScope, setNewScope] = useState('');
  const [newContractRef, setNewContractRef] = useState('');
  const [newContractValue, setNewContractValue] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newBeeLevel, setNewBeeLevel] = useState('');
  const [newCidbGrade, setNewCidbGrade] = useState('');
  const [newRegistrationNumber, setNewRegistrationNumber] = useState('');
  const [newInsuranceExpiry, setNewInsuranceExpiry] = useState('');
  const [newLocalContentPct, setNewLocalContentPct] = useState('');
  const [newSaEmployeeCount, setNewSaEmployeeCount] = useState('');
  const [newFloorOhsa, setNewFloorOhsa] = useState(false);
  const [newFloorLender, setNewFloorLender] = useState(false);
  const [newFloorReipppp, setNewFloorReipppp] = useState(false);
  const [newFloorBee, setNewFloorBee] = useState(false);
  const [newFloorIe, setNewFloorIe] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api('/api/ipp-subcontractor');
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
    if (filterTier && r.subcontractor_tier !== filterTier) return false;
    if (filterCategory && r.trade_category !== filterCategory) return false;
    return true;
  }), [rows, filterStatus, filterTier, filterCategory]);

  async function handleAction(action: string, extraBody: Record<string, unknown> = {}) {
    if (!selected) return;
    setActionLoading(true); setActionResult(null);
    try {
      await api(`/api/ipp-subcontractor/${selected.id}/${action}`, { method: 'POST', data: extraBody });
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
    if (!newCompany || !newProject || !newTier || !newScope) return;
    setCreateLoading(true);
    try {
      await api('/api/ipp-subcontractor', {
        method: 'POST',
        data: {
          company_name: newCompany,
          project_id: newProject,
          project_name: newProjectName || undefined,
          trade_category: newTradeCategory,
          subcontractor_tier: newTier,
          scope_description: newScope,
          contract_ref: newContractRef || undefined,
          contract_value_zar: newContractValue ? Number(newContractValue) : undefined,
          scheduled_start_date: newStartDate || undefined,
          scheduled_end_date: newEndDate || undefined,
          bee_level: newBeeLevel ? Number(newBeeLevel) : undefined,
          cidb_grade: newCidbGrade || undefined,
          registration_number: newRegistrationNumber || undefined,
          insurance_expiry_date: newInsuranceExpiry || undefined,
          local_content_pct: newLocalContentPct ? Number(newLocalContentPct) : undefined,
          sa_employee_count: newSaEmployeeCount ? Number(newSaEmployeeCount) : undefined,
          floor_ohsa_notification: newFloorOhsa ? 1 : 0,
          floor_lender_escrow_release: newFloorLender ? 1 : 0,
          floor_reipppp_ed_reporting: newFloorReipppp ? 1 : 0,
          floor_bee_verification: newFloorBee ? 1 : 0,
          floor_ie_oversight: newFloorIe ? 1 : 0,
        },
      });
      setShowCreate(false);
      setNewCompany(''); setNewProject(''); setNewProjectName('');
      setNewTradeCategory('electrical_hv'); setNewTier('specialist');
      setNewScope(''); setNewContractRef(''); setNewContractValue('');
      setNewStartDate(''); setNewEndDate('');
      setNewBeeLevel(''); setNewCidbGrade(''); setNewRegistrationNumber('');
      setNewInsuranceExpiry(''); setNewLocalContentPct(''); setNewSaEmployeeCount('');
      setNewFloorOhsa(false); setNewFloorLender(false); setNewFloorReipppp(false);
      setNewFloorBee(false); setNewFloorIe(false);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setCreateLoading(false);
    }
  }

  const db = dashboard?.subcontractors;
  const isSignatureCreate = newFloorOhsa || newFloorIe;
  const avgScore = db?.avg_performance_score;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      {db && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <KpiCard label="Active" value={db.active_count} color="green" />
          <KpiCard label="Critical trades" value={db.critical_trade_count} color="amber" />
          <KpiCard label="Suspended" value={db.suspended_count} color="orange" />
          <KpiCard label="Performance avg" value={avgScore != null ? `${avgScore.toFixed(1)} / 100` : '—'} color={avgScore != null && avgScore < 70 ? 'red' : 'blue'} />
          <KpiCard label="SLA breached" value={db.sla_breached_count} color="red" />
          <KpiCard label="OHSA notifications" value={db.ohsa_notification_count} color={db.ohsa_notification_count > 0 ? 'red' : 'gray'} />
        </div>
      )}

      {/* W140 AI insight — OHSA notifications or suspensions present */}
      {db && (db.suspended_count > 0 || db.ohsa_notification_count > 0) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-red-600 text-xl mt-0.5">&#9888;</span>
          <div>
            <p className="text-sm font-semibold text-red-900">
              {db.ohsa_notification_count} subcontractor{db.ohsa_notification_count !== 1 ? 's' : ''} with OHSA notification events
            </p>
            <p className="text-xs text-red-800 mt-0.5">
              SA Construction Regs.6: principal contractor is liable for subcontractor safety compliance.
              terminate_subcontractor crosses regulator EVERY tier on safety_violation — immediate OHSA notification mandatory.
              Review suspension reasons and confirm reinstatement conditions are met before reactivating.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="text-xs border rounded px-2 py-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value as SubcontractorStatus | '')}>
          <option value="">All statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterTier} onChange={e => setFilterTier(e.target.value as SubcontractorTier | '')}>
          <option value="">All tiers</option>
          {SUBCONTRACTOR_TIERS.map(t => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">All trades</option>
          {TRADE_CATEGORIES.map(c => <option key={c} value={c}>{TRADE_CATEGORY_LABEL[c]}</option>)}
        </select>
        <span className="text-xs text-[var(--ink-2, #9aa5b4)] ml-auto">{filtered.length} subcontractors</span>
        {!readOnly && (
          <button type="button" className="text-xs bg-green-600 text-white rounded px-3 py-1 hover:bg-green-700" onClick={() => setShowCreate(true)}>
            + Register subcontractor
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
      {loading && <div className="text-xs text-[var(--ink-2, #9aa5b4)]">Loading subcontractor register…</div>}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle, #dde4ec)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--s1, #f8fafc)]">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">ID</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Company</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Trade</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Tier</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Contract value</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Performance</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">BEE</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Status</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">SLA</th>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink-2, #6b7685)]">Flags</th>
                {!readOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 10 : 11} className="px-3 py-6 text-center text-[var(--ink-2, #9aa5b4)]">
                    No subcontractors registered
                  </td>
                </tr>
              )}
              {filtered.map(row => (
                <tr
                  key={row.id}
                  className={`border-t border-[var(--s2, #eef2f7)] hover:bg-[var(--s2, #eef2f7)] cursor-pointer ${row.chain_status === 'suspended' ? 'bg-orange-50/40' : row.chain_status === 'terminated' ? 'bg-red-50/40' : ''}`}
                  onClick={() => setSelected(row)}
                >
                  <td className="px-3 py-2 font-mono text-[var(--ink-2, #9aa5b4)]">{row.id}</td>
                  <td className="px-3 py-2 max-w-[160px]">
                    <span className="text-[var(--ink, #1e2a38)] block truncate font-medium">{row.company_name}</span>
                    {row.project_name && <span className="text-[var(--ink-2, #9aa5b4)] truncate block">{row.project_name}</span>}
                  </td>
                  <td className="px-3 py-2 text-[var(--ink-2, #3d4756)]">
                    {row.trade_category ? (TRADE_CATEGORY_LABEL[row.trade_category] ?? row.trade_category) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {row.subcontractor_tier && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLOR[row.subcontractor_tier]}`}>
                        {TIER_LABEL[row.subcontractor_tier]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--ink-2, #3d4756)] whitespace-nowrap">
                    {row.contract_value_zar != null
                      ? `R ${Number(row.contract_value_zar).toLocaleString('en-ZA')}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <PerformanceBadge score={row.performance_score} />
                  </td>
                  <td className="px-3 py-2 text-[var(--ink-2, #3d4756)]">
                    {row.bee_level != null ? `L${row.bee_level}` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[row.chain_status]}`}>
                      {statusLabel(row.chain_status).text}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.sla_remaining_hours_live != null && row.subcontractor_tier ? (
                      <SlaCountdown
                        remainingHours={row.sla_remaining_hours_live}
                        totalHours={row.sla_target_hours ?? SLA_HOURS_BY_TIER[row.subcontractor_tier]}
                        breached={!!row.sla_breached}
                        compact
                      />
                    ) : <span className="text-[var(--ink-2, #9aa5b4)]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {!!row.floor_ohsa_notification && <Flag label="OHSA" title="OHSA notification event — principal contractor liability" cls="bg-red-200 text-red-900" />}
                      {!!row.floor_lender_escrow_release && <Flag label="ESC" title="Lender escrow release required for final payment" cls="bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]" />}
                      {!!row.floor_reipppp_ed_reporting && <Flag label="ED" title="REIPPPP ED commitment included in this subcontract" cls="bg-green-100 text-green-800" />}
                      {!!row.floor_bee_verification && <Flag label="BEE" title="BEE level requires third-party verification" cls="bg-amber-100 text-amber-800" />}
                      {!!row.floor_ie_oversight && <Flag label="IE" title="IE oversight required — critical trade" cls="bg-[oklch(0.90_0.015_250)] text-[oklch(0.17_0.010_250)]" />}
                      {!!row.is_reportable && <Flag label="⚑" title="Regulator crossed" cls="bg-red-200 text-red-800" />}
                      {row.insurance_near_expiry_live && <Flag label="INS!" title="Insurance expiry within 60 days or already expired" cls="bg-orange-100 text-orange-800" />}
                    </div>
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2">
                      <button type="button"
                        className="text-xs text-[oklch(0.46_0.16_55)] hover:underline"
                        onClick={e => { e.stopPropagation(); setSelected(row); }}
                      >
                        Manage
                      </button>
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
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => { setSelected(null); setActionResult(null); }}
        >
          <div
            className="bg-surface-v2 rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {selected.subcontractor_tier && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLOR[selected.subcontractor_tier]}`}>
                      {TIER_LABEL[selected.subcontractor_tier]}
                    </span>
                  )}
                  {selected.trade_category && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]">
                      {TRADE_CATEGORY_LABEL[selected.trade_category] ?? selected.trade_category}
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[selected.chain_status]}`}>
                    {statusLabel(selected.chain_status).text}
                  </span>
                  {!!selected.is_reportable && (
                    <span className="px-1 py-0.5 rounded text-[10px] bg-red-200 text-red-800">REGULATOR CROSSED</span>
                  )}
                </div>
                <h3 className="font-semibold text-[var(--ink, #0f1c2e)] text-sm">{selected.company_name}</h3>
                <p className="text-xs text-[var(--ink-2, #9aa5b4)] font-mono mt-0.5">
                  {selected.id} · {selected.project_name ?? selected.project_id}
                </p>
              </div>
              <button type="button" className="text-[var(--ink-2, #9aa5b4)] hover:text-[var(--ink-2, #3d4756)] text-xl leading-none" onClick={() => { setSelected(null); setActionResult(null); }}>×</button>
            </div>

            {/* Chain state bar */}
            <div className="mb-4">
              <ChainStateBar
                allStates={MAIN_STATES as unknown as string[]}
                currentState={selected.chain_status}
                branchStates={BRANCH_STATES as unknown as string[]}
              />
            </div>

            {/* SLA countdown */}
            {selected.sla_remaining_hours_live != null && selected.subcontractor_tier && (
              <div className="mb-4">
                <SlaCountdown
                  remainingHours={selected.sla_remaining_hours_live}
                  totalHours={selected.sla_target_hours ?? SLA_HOURS_BY_TIER[selected.subcontractor_tier]}
                  breached={!!selected.sla_breached}
                />
              </div>
            )}

            {/* W140 SIGNATURE warning */}
            {selected.is_signature_live && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-900">
                  Regulator notification required
                </p>
                <p className="text-xs text-red-800 mt-0.5">
                  OHSA Construction Regs.6: this termination for safety_violation or OHSA safety incident requires mandatory
                  principal contractor notification to the Department of Labour. IE and lender must be notified immediately.
                </p>
              </div>
            )}

            {/* Suspension / termination info */}
            {selected.suspension_reason && selected.chain_status === 'suspended' && (
              <div className="mb-4 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2">
                <p className="text-xs font-semibold text-orange-900">Suspension reason</p>
                <p className="text-xs text-orange-800 mt-0.5">{selected.suspension_reason}</p>
                {selected.reinstatement_conditions && (
                  <p className="text-xs text-orange-700 mt-1">
                    <span className="font-medium">Reinstatement conditions:</span> {selected.reinstatement_conditions}
                  </p>
                )}
              </div>
            )}
            {selected.termination_cause && selected.chain_status === 'terminated' && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-900">Termination cause</p>
                <p className="text-xs text-red-800 mt-0.5">
                  {TERMINATION_CAUSE_LABEL[selected.termination_cause] ?? selected.termination_cause}
                </p>
              </div>
            )}

            {/* Contract details */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
              <div>
                <span className="text-[var(--ink-2, #6b7685)]">Contract ref</span>
                <p className="font-medium text-[var(--ink, #1e2a38)]">{selected.contract_ref ?? '—'}</p>
              </div>
              <div>
                <span className="text-[var(--ink-2, #6b7685)]">Contract value</span>
                <p className="font-medium text-[var(--ink, #1e2a38)]">
                  {selected.contract_value_zar != null
                    ? `R ${Number(selected.contract_value_zar).toLocaleString('en-ZA')}`
                    : '—'}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-[var(--ink-2, #6b7685)]">Scope description</span>
                <p className="font-medium text-[var(--ink, #1e2a38)] text-xs mt-0.5">{selected.scope_description}</p>
              </div>
            </div>

            {/* Schedule */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
              <div>
                <span className="text-[var(--ink-2, #6b7685)]">Planned start</span>
                <p className="font-medium text-[var(--ink, #1e2a38)]">{selected.scheduled_start_date ?? '—'}</p>
              </div>
              <div>
                <span className="text-[var(--ink-2, #6b7685)]">Planned end</span>
                <p className="font-medium text-[var(--ink, #1e2a38)]">{selected.scheduled_end_date ?? '—'}</p>
              </div>
              <div>
                <span className="text-[var(--ink-2, #6b7685)]">Actual start</span>
                <p className="font-medium text-[var(--ink, #1e2a38)]">{selected.actual_start_date ?? '—'}</p>
              </div>
              <div>
                <span className="text-[var(--ink-2, #6b7685)]">Actual end</span>
                <p className="font-medium text-[var(--ink, #1e2a38)]">{selected.actual_end_date ?? '—'}</p>
              </div>
            </div>

            {/* Compliance grid */}
            <div className="p-3 rounded-lg bg-[var(--s1, #f8fafc)] border border-[var(--border-subtle, #dde4ec)] mb-4">
              <p className="text-xs font-semibold text-[var(--ink, #0f1c2e)] mb-2">Compliance</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <span className="text-[var(--ink-2, #6b7685)]">BEE level</span>
                  <p className="font-medium text-[var(--ink, #1e2a38)]">
                    {selected.bee_level != null ? `Level ${selected.bee_level}` : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--ink-2, #6b7685)]">CIDB grade</span>
                  <p className="font-medium text-[var(--ink, #1e2a38)]">{selected.cidb_grade ?? '—'}</p>
                </div>
                <div>
                  <span className="text-[var(--ink-2, #6b7685)]">Local content %</span>
                  <p className="font-medium text-[var(--ink, #1e2a38)]">
                    {selected.local_content_pct != null ? `${selected.local_content_pct.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--ink-2, #6b7685)]">SA employees on site</span>
                  <p className="font-medium text-[var(--ink, #1e2a38)]">{selected.sa_employee_count ?? '—'}</p>
                </div>
                <div>
                  <span className="text-[var(--ink-2, #6b7685)]">Insurance expiry</span>
                  <p className={`font-medium ${selected.insurance_near_expiry_live ? 'text-red-700' : 'text-[var(--ink, #1e2a38)]'}`}>
                    {selected.insurance_expiry_date ?? '—'}
                    {selected.insurance_near_expiry_live && <span className="ml-1 text-[9px] bg-red-100 text-red-800 px-1 rounded">NEAR EXPIRY</span>}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--ink-2, #6b7685)]">Registration number</span>
                  <p className="font-medium text-[var(--ink, #1e2a38)] font-mono text-[10px]">{selected.registration_number ?? '—'}</p>
                </div>
              </div>
            </div>

            {/* Performance + incidents */}
            <div className="grid grid-cols-3 gap-3 text-xs mb-4">
              <div className="p-3 rounded-lg bg-surface-v2 border border-[var(--border-subtle, #dde4ec)] text-center">
                <p className="text-[var(--ink-2, #6b7685)] mb-1">Performance score</p>
                <div className="flex justify-center">
                  <PerformanceBadge score={selected.performance_score} />
                </div>
                {selected.performance_score != null && (
                  <p className="text-[10px] text-[var(--ink-2, #9aa5b4)] mt-1">/ 100</p>
                )}
              </div>
              <div className="p-3 rounded-lg bg-surface-v2 border border-[var(--border-subtle, #dde4ec)] text-center">
                <p className="text-[var(--ink-2, #6b7685)] mb-1">HSE incidents</p>
                <p className={`text-lg font-bold ${selected.hse_incident_count > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {selected.hse_incident_count}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-surface-v2 border border-[var(--border-subtle, #dde4ec)] text-center">
                <p className="text-[var(--ink-2, #6b7685)] mb-1">NCRs raised</p>
                <p className={`text-lg font-bold ${selected.ncr_count > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                  {selected.ncr_count}
                </p>
              </div>
            </div>

            {/* Key contacts */}
            {(selected.site_representative || selected.safety_officer) && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
                {selected.site_representative && (
                  <div>
                    <span className="text-[var(--ink-2, #6b7685)]">Site representative</span>
                    <p className="font-medium text-[var(--ink, #1e2a38)]">{selected.site_representative}</p>
                    {selected.site_representative_phone && (
                      <p className="text-[var(--ink-2, #6b7685)]">{selected.site_representative_phone}</p>
                    )}
                  </div>
                )}
                {selected.safety_officer && (
                  <div>
                    <span className="text-[var(--ink-2, #6b7685)]">Safety officer</span>
                    <p className="font-medium text-[var(--ink, #1e2a38)]">{selected.safety_officer}</p>
                    {selected.safety_officer_phone && (
                      <p className="text-[var(--ink-2, #6b7685)]">{selected.safety_officer_phone}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Floor flags */}
            {(selected.floor_ohsa_notification || selected.floor_lender_escrow_release ||
              selected.floor_reipppp_ed_reporting || selected.floor_bee_verification ||
              selected.floor_ie_oversight) ? (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-900 mb-1.5">Floor flags</p>
                <div className="flex flex-wrap gap-1.5">
                  {!!selected.floor_ohsa_notification && <span className="px-2 py-0.5 rounded text-[10px] bg-red-200 text-red-900">OHSA notification</span>}
                  {!!selected.floor_lender_escrow_release && <span className="px-2 py-0.5 rounded text-[10px] bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]">Lender escrow release</span>}
                  {!!selected.floor_reipppp_ed_reporting && <span className="px-2 py-0.5 rounded text-[10px] bg-green-100 text-green-800">REIPPPP ED reporting</span>}
                  {!!selected.floor_bee_verification && <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800">BEE verification required</span>}
                  {!!selected.floor_ie_oversight && <span className="px-2 py-0.5 rounded text-[10px] bg-[oklch(0.90_0.015_250)] text-[oklch(0.17_0.010_250)]">IE oversight</span>}
                </div>
              </div>
            ) : null}

            {/* Cross-references */}
            {(selected.ed_commitment_ref || selected.hse_incident_ref || selected.ncr_ref || selected.ms_ref) && (
              <div className="mb-4">
                <p className="text-xs text-[var(--ink-2, #6b7685)] mb-1">Cross-references</p>
                <div className="flex flex-wrap gap-2">
                  {selected.ed_commitment_ref && <span className="text-xs text-[oklch(0.46_0.16_55)]">ED commitment: {selected.ed_commitment_ref}</span>}
                  {selected.hse_incident_ref && <span className="text-xs text-red-600">HSE incident: {selected.hse_incident_ref}</span>}
                  {selected.ncr_ref && <span className="text-xs text-amber-600">NCR: {selected.ncr_ref}</span>}
                  {selected.ms_ref && <span className="text-xs text-[oklch(0.46_0.16_55)]">Method statement: {selected.ms_ref}</span>}
                </div>
              </div>
            )}

            {/* SLA breach info */}
            {selected.sla_breach_count > 0 && (
              <div className="mb-4 text-xs text-[var(--ink-2, #3d4756)]">
                SLA breach count: <span className="font-medium text-red-700">{selected.sla_breach_count}</span>
                {selected.regulator_ref && <span className="ml-3">Regulator ref: <span className="font-mono">{selected.regulator_ref}</span></span>}
              </div>
            )}

            {/* SIGNATURE warning for terminate action when safety risk */}
            {!readOnly && selected.chain_status !== 'closed' && selected.chain_status !== 'terminated' && (
              (ACTIONS[selected.chain_status] ?? []).some(a => a.action === 'terminate_subcontractor') && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-900">
                    Terminate for safety_violation crosses regulator EVERY tier
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    If termination_cause = safety_violation, mandatory OHSA notification to Department of Labour
                    under OHSA Construction Regulations 2014 Reg.6 (principal contractor responsibility).
                  </p>
                </div>
              )
            )}

            {/* Actions */}
            {!readOnly && (
              <div className="mt-4 pt-4 border-t border-[var(--s2, #eef2f7)]">
                <p className="text-xs text-[var(--ink-2, #6b7685)] mb-2">Actions</p>
                {actionResult && (
                  <div className={`text-xs rounded px-2 py-1 mb-2 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {actionResult}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {(ACTIONS[selected.chain_status] ?? []).map(({ action, label, danger }) => (
                    <button type="button"
                      key={action}
                      disabled={actionLoading}
                      onClick={() => handleAction(action)}
                      className={`text-xs rounded px-3 py-1 ${
                        danger
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      } disabled:opacity-50`}
                    >
                      {label}
                    </button>
                  ))}
                  {(ACTIONS[selected.chain_status] ?? []).length === 0 && (
                    <span className="text-xs text-[var(--ink-2, #9aa5b4)] italic">No actions available (terminal state)</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && !readOnly && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-surface-v2 rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[var(--ink, #0f1c2e)]">Register Subcontractor</h3>
              <button type="button" className="text-[var(--ink-2, #9aa5b4)] hover:text-[var(--ink-2, #3d4756)] text-xl leading-none" onClick={() => setShowCreate(false)}>×</button>
            </div>

            {/* SIGNATURE warning */}
            {isSignatureCreate && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-900">
                  Suspend/terminate may trigger regulator notification
                </p>
                <p className="text-xs text-red-800 mt-0.5">
                  OHSA notification or IE oversight flag is set. Any safety suspension or termination for
                  safety_violation will cross regulator at EVERY tier per OHSA Construction Regs.6.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Company name *</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="e.g. PowerTech Electrical SA" />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Project ID *</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="project-id" />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Project name</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Display name" />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Trade category *</label>
                  <select className="text-xs border rounded px-2 py-1.5 w-full" value={newTradeCategory} onChange={e => setNewTradeCategory(e.target.value)}>
                    {TRADE_CATEGORIES.map(c => <option key={c} value={c}>{TRADE_CATEGORY_LABEL[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Tier *</label>
                  <select className="text-xs border rounded px-2 py-1.5 w-full" value={newTier} onChange={e => setNewTier(e.target.value as SubcontractorTier)}>
                    {SUBCONTRACTOR_TIERS.map(t => <option key={t} value={t}>{TIER_LABEL[t]} ({SLA_HOURS_BY_TIER[t]}h SLA)</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Scope description *</label>
                  <textarea className="text-xs border rounded px-2 py-1.5 w-full" rows={3} value={newScope} onChange={e => setNewScope(e.target.value)} placeholder="Describe the work scope…" />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Contract ref</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newContractRef} onChange={e => setNewContractRef(e.target.value)} placeholder="CT-XXX-2026-001" />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Contract value (ZAR)</label>
                  <input type="number" className="text-xs border rounded px-2 py-1.5 w-full" value={newContractValue} onChange={e => setNewContractValue(e.target.value)} placeholder="e.g. 5000000" />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Scheduled start date</label>
                  <input type="date" className="text-xs border rounded px-2 py-1.5 w-full" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Scheduled end date</label>
                  <input type="date" className="text-xs border rounded px-2 py-1.5 w-full" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">BEE level (1–8)</label>
                  <select className="text-xs border rounded px-2 py-1.5 w-full" value={newBeeLevel} onChange={e => setNewBeeLevel(e.target.value)}>
                    <option value="">Select…</option>
                    {[1,2,3,4,5,6,7,8].map(l => <option key={l} value={l}>Level {l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">CIDB grade</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newCidbGrade} onChange={e => setNewCidbGrade(e.target.value)} placeholder="e.g. 7EP" />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Registration number</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newRegistrationNumber} onChange={e => setNewRegistrationNumber(e.target.value)} placeholder="CIPC reg no." />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Insurance expiry</label>
                  <input type="date" className="text-xs border rounded px-2 py-1.5 w-full" value={newInsuranceExpiry} onChange={e => setNewInsuranceExpiry(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">Local content %</label>
                  <input type="number" className="text-xs border rounded px-2 py-1.5 w-full" value={newLocalContentPct} onChange={e => setNewLocalContentPct(e.target.value)} placeholder="0–100" min={0} max={100} />
                </div>
                <div>
                  <label className="text-xs text-[var(--ink-2, #6b7685)] block mb-1">SA employees on site</label>
                  <input type="number" className="text-xs border rounded px-2 py-1.5 w-full" value={newSaEmployeeCount} onChange={e => setNewSaEmployeeCount(e.target.value)} placeholder="e.g. 25" />
                </div>
              </div>

              {/* Floor flags */}
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-900 mb-2">Floor flags (drive SIGNATURE logic)</p>
                <div className="space-y-1.5">
                  <CheckRow label="OHSA notification event (serious safety incident potential)" checked={newFloorOhsa} onChange={setNewFloorOhsa} warningLabel="SIGNATURE" />
                  <CheckRow label="Lender escrow release required for final payment" checked={newFloorLender} onChange={setNewFloorLender} />
                  <CheckRow label="REIPPPP ED commitment included in this subcontract" checked={newFloorReipppp} onChange={setNewFloorReipppp} />
                  <CheckRow label="BEE level requires third-party verification" checked={newFloorBee} onChange={setNewFloorBee} />
                  <CheckRow label="IE oversight required (critical trade — HV electrical, structural)" checked={newFloorIe} onChange={setNewFloorIe} warningLabel="SIGNATURE" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4 pt-4 border-t border-[var(--s2, #eef2f7)]">
              <button type="button"
                onClick={handleCreate}
                disabled={createLoading || !newCompany || !newProject || !newScope}
                className="text-xs bg-green-600 text-white rounded px-4 py-1.5 hover:bg-green-700 disabled:opacity-50"
              >
                {createLoading ? 'Registering…' : 'Register subcontractor'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="text-xs border rounded px-3 py-1.5 hover:bg-[var(--s2, #eef2f7)]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
