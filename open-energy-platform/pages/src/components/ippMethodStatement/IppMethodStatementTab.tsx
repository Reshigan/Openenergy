// Wave 137 — IPP Method Statement (SWMS) Management
// OHSA Construction Regulations 2014 Reg.7 + Equator Principles EP4 + REIPPPP site safety.
// URGENT SLA: high_risk 24h (tightest) → routine 336h (loosest).
// SIGNATURE: approve_ms EVERY tier on critical_lift/confined_space/live_electrical;
//            suspend_work crosses on floor_regulatory_notification.
// Beats: Procore Safety (static PDF workflow, no P6 state machine).
// Mounted at /ipp-lifecycle/workstation?tab=method-statements (WRITE: ipp_developer/admin/support).
// READ all 9 personas via readOnly prop.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainStateBar } from '../ChainStateBar';
import { SlaCountdown } from '../SlaCountdown';

type MsStatus =
  | 'drafted'
  | 'reviewed'
  | 'risk_assessed'
  | 'approved'
  | 'toolbox_briefed'
  | 'active'
  | 'work_completed'
  | 'closed'
  | 'rejected'
  | 'superseded'
  | 'suspended'
  | 'archived';

type RiskTier = 'high_risk' | 'medium_risk' | 'low_risk' | 'routine';
type WorkType =
  | 'civil' | 'structural' | 'electrical' | 'mechanical' | 'instrumentation'
  | 'scaffolding' | 'demolition' | 'excavation' | 'commissioning' | 'general';

interface MsRow {
  id: string;
  project_id: string;
  project_name: string | null;
  ms_number: string | null;
  chain_status: MsStatus;
  ms_title: string;
  work_type: WorkType | null;
  risk_tier: RiskTier | null;
  work_area: string | null;
  scheduled_start_date: string | null;
  scheduled_duration_days: number | null;
  is_critical_lift: number;
  is_confined_space: number;
  is_live_electrical: number;
  is_hot_work: number;
  is_working_at_height: number;
  scope_of_work: string;
  work_sequence: string | null;
  resources_personnel: string | null;
  plant_equipment: string | null;
  hazard_register: string | null;
  ppe_requirements: string | null;
  emergency_procedure: string | null;
  environmental_controls: string | null;
  toolbox_talk_notes: string | null;
  suspension_reason: string | null;
  revision_number: number;
  superseded_by_ref: string | null;
  floor_ptw_required: number;
  floor_ie_review_required: number;
  floor_regulatory_notification: number;
  floor_lender_notification: number;
  floor_third_party_inspection: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  ptw_ref: string | null;
  ncr_ref: string | null;
  hse_incident_ref: string | null;
  work_order_ref: string | null;
  risk_ref: string | null;
  time_in_state_hours_live: number | null;
  sla_remaining_hours_live: number | null;
  is_signature_live: boolean;
  is_critical_work_live: boolean;
  created_at: string;
}

interface Dashboard {
  method_statements: {
    total_count: number;
    active_count: number;
    high_risk_count: number;
    awaiting_approval_count: number;
    sla_breached_count: number;
    critical_lift_count: number;
    confined_space_count: number;
    live_electrical_count: number;
  };
}

const SLA_HOURS_BY_TIER: Record<RiskTier, number> = {
  high_risk: 24,
  medium_risk: 72,
  low_risk: 168,
  routine: 336,
};

const RISK_TIER_LABEL: Record<RiskTier, string> = {
  high_risk: 'High risk',
  medium_risk: 'Medium risk',
  low_risk: 'Low risk',
  routine: 'Routine',
};

const RISK_TIER_COLOR: Record<RiskTier, string> = {
  high_risk: 'bg-red-100 text-red-800',
  medium_risk: 'bg-orange-100 text-orange-700',
  low_risk: 'bg-amber-100 text-amber-700',
  routine: 'bg-gray-100 text-gray-600',
};

const WORK_TYPE_LABEL: Record<WorkType, string> = {
  civil: 'Civil',
  structural: 'Structural',
  electrical: 'Electrical',
  mechanical: 'Mechanical',
  instrumentation: 'Instrumentation',
  scaffolding: 'Scaffolding',
  demolition: 'Demolition',
  excavation: 'Excavation',
  commissioning: 'Commissioning',
  general: 'General',
};

const STATUS_COLOR: Record<MsStatus, string> = {
  drafted: 'bg-slate-100 text-slate-700',
  reviewed: 'bg-blue-50 text-blue-700',
  risk_assessed: 'bg-indigo-100 text-indigo-700',
  approved: 'bg-violet-100 text-violet-700',
  toolbox_briefed: 'bg-cyan-100 text-cyan-700',
  active: 'bg-green-100 text-green-800',
  work_completed: 'bg-teal-100 text-teal-700',
  closed: 'bg-gray-100 text-gray-600',
  rejected: 'bg-red-100 text-red-700',
  superseded: 'bg-amber-100 text-amber-700',
  suspended: 'bg-yellow-100 text-yellow-800',
  archived: 'bg-gray-200 text-gray-400',
};

const ACTIONS: Record<MsStatus, Array<{ action: string; label: string; danger?: boolean }>> = {
  drafted: [{ action: 'submit_for_review', label: 'Submit for review' }],
  reviewed: [
    { action: 'complete_risk_assessment', label: 'Complete risk assessment' },
    { action: 'reject_ms', label: 'Reject', danger: true },
  ],
  risk_assessed: [
    { action: 'approve_ms', label: 'Approve MS (OHSA Reg.7)' },
    { action: 'reject_ms', label: 'Reject', danger: true },
  ],
  approved: [
    { action: 'conduct_toolbox_talk', label: 'Conduct toolbox talk' },
    { action: 'supersede_ms', label: 'Supersede (revised MS issued)', danger: true },
  ],
  toolbox_briefed: [{ action: 'commence_work', label: 'Commence work' }],
  active: [
    { action: 'complete_work', label: 'Complete work' },
    { action: 'suspend_work', label: 'Suspend work', danger: true },
    { action: 'supersede_ms', label: 'Supersede (conditions changed)', danger: true },
  ],
  work_completed: [{ action: 'close_ms', label: 'Close MS' }],
  closed: [{ action: 'archive_ms', label: 'Archive MS' }],
  rejected: [],
  superseded: [],
  suspended: [{ action: 'resume_work', label: 'Resume work' }],
  archived: [],
};

const MAIN_STATES: readonly MsStatus[] = [
  'drafted', 'reviewed', 'risk_assessed', 'approved',
  'toolbox_briefed', 'active', 'work_completed', 'closed',
];
const BRANCH_STATES: readonly MsStatus[] = ['rejected', 'superseded', 'suspended', 'archived'];
const STATUSES: MsStatus[] = [...MAIN_STATES, ...BRANCH_STATES];
const RISK_TIERS: RiskTier[] = ['high_risk', 'medium_risk', 'low_risk', 'routine'];
const WORK_TYPES: WorkType[] = [
  'civil', 'structural', 'electrical', 'mechanical', 'instrumentation',
  'scaffolding', 'demolition', 'excavation', 'commissioning', 'general',
];

function Flag({ label, title, cls }: { label: string; title: string; cls: string }) {
  return (
    <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${cls}`} title={title}>{label}</span>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-900 border-blue-200',
    red: 'bg-red-50 text-red-900 border-red-200',
    orange: 'bg-orange-50 text-orange-900 border-orange-200',
    green: 'bg-green-50 text-green-900 border-green-200',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
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

interface Props { readOnly?: boolean }

export default function IppMethodStatementTab({ readOnly = false }: Props) {
  const [rows, setRows] = useState<MsRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MsRow | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<MsStatus | ''>('');
  const [filterRiskTier, setFilterRiskTier] = useState<RiskTier | ''>('');
  const [filterWorkType, setFilterWorkType] = useState<WorkType | ''>('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newMsNumber, setNewMsNumber] = useState('');
  const [newWorkType, setNewWorkType] = useState<WorkType>('civil');
  const [newRiskTier, setNewRiskTier] = useState<RiskTier>('medium_risk');
  const [newWorkArea, setNewWorkArea] = useState('');
  const [newScopeOfWork, setNewScopeOfWork] = useState('');
  const [newScheduledStart, setNewScheduledStart] = useState('');
  const [newDurationDays, setNewDurationDays] = useState('');
  // Safety flags
  const [newCriticalLift, setNewCriticalLift] = useState(false);
  const [newConfinedSpace, setNewConfinedSpace] = useState(false);
  const [newLiveElectrical, setNewLiveElectrical] = useState(false);
  const [newHotWork, setNewHotWork] = useState(false);
  const [newWorkingAtHeight, setNewWorkingAtHeight] = useState(false);
  // Floor flags
  const [newFloorPtw, setNewFloorPtw] = useState(false);
  const [newFloorIe, setNewFloorIe] = useState(false);
  const [newFloorRegNotify, setNewFloorRegNotify] = useState(false);
  const [newFloorLender, setNewFloorLender] = useState(false);
  const [newFloorThirdParty, setNewFloorThirdParty] = useState(false);
  // Cross-refs
  const [newPtwRef, setNewPtwRef] = useState('');
  const [newNcrRef, setNewNcrRef] = useState('');
  const [newHseRef, setNewHseRef] = useState('');
  const [newWorkOrderRef, setNewWorkOrderRef] = useState('');
  const [newRiskRef, setNewRiskRef] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api('/api/ipp-method-statement');
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
    if (filterRiskTier && r.risk_tier !== filterRiskTier) return false;
    if (filterWorkType && r.work_type !== filterWorkType) return false;
    return true;
  }), [rows, filterStatus, filterRiskTier, filterWorkType]);

  async function handleAction(action: string) {
    if (!selected) return;
    setActionLoading(true); setActionResult(null);
    try {
      await api(`/api/ipp-method-statement/${selected.id}/${action}`, { method: 'POST', data: {} });
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
    if (!newTitle || !newProject || !newScopeOfWork) return;
    setCreateLoading(true);
    try {
      await api('/api/ipp-method-statement', {
        method: 'POST',
        data: {
          ms_title: newTitle,
          project_id: newProject,
          project_name: newProjectName || undefined,
          ms_number: newMsNumber || undefined,
          work_type: newWorkType,
          risk_tier: newRiskTier,
          work_area: newWorkArea || undefined,
          scope_of_work: newScopeOfWork,
          scheduled_start_date: newScheduledStart || undefined,
          scheduled_duration_days: newDurationDays ? Number(newDurationDays) : undefined,
          is_critical_lift: newCriticalLift ? 1 : 0,
          is_confined_space: newConfinedSpace ? 1 : 0,
          is_live_electrical: newLiveElectrical ? 1 : 0,
          is_hot_work: newHotWork ? 1 : 0,
          is_working_at_height: newWorkingAtHeight ? 1 : 0,
          floor_ptw_required: newFloorPtw ? 1 : 0,
          floor_ie_review_required: newFloorIe ? 1 : 0,
          floor_regulatory_notification: newFloorRegNotify ? 1 : 0,
          floor_lender_notification: newFloorLender ? 1 : 0,
          floor_third_party_inspection: newFloorThirdParty ? 1 : 0,
          ptw_ref: newPtwRef || undefined,
          ncr_ref: newNcrRef || undefined,
          hse_incident_ref: newHseRef || undefined,
          work_order_ref: newWorkOrderRef || undefined,
          risk_ref: newRiskRef || undefined,
        },
      });
      setShowCreate(false);
      setNewTitle(''); setNewProject(''); setNewProjectName(''); setNewMsNumber('');
      setNewWorkType('civil'); setNewRiskTier('medium_risk'); setNewWorkArea('');
      setNewScopeOfWork(''); setNewScheduledStart(''); setNewDurationDays('');
      setNewCriticalLift(false); setNewConfinedSpace(false); setNewLiveElectrical(false);
      setNewHotWork(false); setNewWorkingAtHeight(false);
      setNewFloorPtw(false); setNewFloorIe(false); setNewFloorRegNotify(false);
      setNewFloorLender(false); setNewFloorThirdParty(false);
      setNewPtwRef(''); setNewNcrRef(''); setNewHseRef(''); setNewWorkOrderRef(''); setNewRiskRef('');
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setCreateLoading(false);
    }
  }

  const db = dashboard?.method_statements;
  const isCriticalCreate = newCriticalLift || newConfinedSpace || newLiveElectrical;
  const isSignatureCreate = isCriticalCreate || (newRiskTier === 'high_risk' && isCriticalCreate);

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      {db && (
        <div className="grid grid-cols-3 sm:grid-cols-8 gap-3">
          <KpiCard label="Active MS" value={db.active_count} color="green" />
          <KpiCard label="High risk" value={db.high_risk_count} color="red" />
          <KpiCard label="Awaiting approval" value={db.awaiting_approval_count} color="orange" />
          <KpiCard label="SLA breached" value={db.sla_breached_count} color="red" />
          <KpiCard label="Critical lifts" value={db.critical_lift_count} color="amber" />
          <KpiCard label="Confined spaces" value={db.confined_space_count} color="amber" />
          <KpiCard label="Live electrical" value={db.live_electrical_count} color="orange" />
          <KpiCard label="Total" value={db.total_count} color="gray" />
        </div>
      )}

      {/* AI insight card — high-risk + critical safety flags (W137 SIGNATURE) */}
      {db && (db.critical_lift_count > 0 || db.confined_space_count > 0 || db.live_electrical_count > 0) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-red-600 text-xl mt-0.5">&#9888;</span>
          <div>
            <p className="text-sm font-semibold text-red-900">
              {db.critical_lift_count + db.confined_space_count + db.live_electrical_count} critical-work method statement{db.critical_lift_count + db.confined_space_count + db.live_electrical_count > 1 ? 's' : ''} require regulator notification when approved
            </p>
            <p className="text-xs text-red-800 mt-0.5">
              OHSA Construction Regulations 2014 Reg.7 + EP4: critical lift, confined-space entry, and live-electrical work method statements must be notified to DOL/OHSA on approval.
              W137 SIGNATURE: approve_ms crosses regulator EVERY tier when any critical safety flag is set.
            </p>
          </div>
        </div>
      )}

      {/* SLA breach alert */}
      {db && db.sla_breached_count > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-3">
          <span className="text-orange-600 text-xl mt-0.5">&#9201;</span>
          <div>
            <p className="text-sm font-semibold text-orange-900">
              {db.sla_breached_count} method statement{db.sla_breached_count > 1 ? 's' : ''} past SLA deadline
            </p>
            <p className="text-xs text-orange-800 mt-0.5">
              URGENT SLA polarity — high_risk work must be approved within 24h. Delayed method statements block work commencement and constitute a REIPPPP programme management failure.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="text-xs border rounded px-2 py-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value as MsStatus | '')}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterRiskTier} onChange={e => setFilterRiskTier(e.target.value as RiskTier | '')}>
          <option value="">All risk tiers</option>
          {RISK_TIERS.map(t => <option key={t} value={t}>{RISK_TIER_LABEL[t]}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterWorkType} onChange={e => setFilterWorkType(e.target.value as WorkType | '')}>
          <option value="">All work types</option>
          {WORK_TYPES.map(w => <option key={w} value={w}>{WORK_TYPE_LABEL[w]}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} method statements</span>
        {!readOnly && (
          <button type="button" className="text-xs bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700" onClick={() => setShowCreate(true)}>
            + New MS
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
      {loading && <div className="text-xs text-gray-400">Loading method statement register…</div>}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">MS No.</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Title</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Work type</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Risk tier</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">SLA</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Safety flags</th>
                {!readOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 7 : 8} className="px-3 py-6 text-center text-gray-400">
                    No method statements in register
                  </td>
                </tr>
              )}
              {filtered.map(row => (
                <tr
                  key={row.id}
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelected(row)}
                >
                  <td className="px-3 py-2 font-mono text-gray-400">{row.ms_number ?? row.id}</td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <span className="text-gray-800 block truncate">{row.ms_title}</span>
                    {row.project_name && <span className="text-gray-400 truncate block">{row.project_name}</span>}
                  </td>
                  <td className="px-3 py-2 capitalize text-gray-600">
                    {row.work_type ? WORK_TYPE_LABEL[row.work_type] : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {row.risk_tier && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${RISK_TIER_COLOR[row.risk_tier]}`}>
                        {RISK_TIER_LABEL[row.risk_tier]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[row.chain_status]}`}>
                      {row.chain_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.sla_remaining_hours_live != null && row.risk_tier ? (
                      <SlaCountdown
                        remainingHours={row.sla_remaining_hours_live}
                        totalHours={row.sla_target_hours ?? SLA_HOURS_BY_TIER[row.risk_tier]}
                        breached={!!row.sla_breached}
                        compact
                      />
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {!!row.is_critical_lift && <Flag label="CL" title="Critical lift (>80% SWL or >10t)" cls="bg-red-200 text-red-900" />}
                      {!!row.is_confined_space && <Flag label="CS" title="Confined space entry" cls="bg-red-100 text-red-800" />}
                      {!!row.is_live_electrical && <Flag label="LE" title="Live electrical work" cls="bg-orange-200 text-orange-900" />}
                      {!!row.is_hot_work && <Flag label="HW" title="Hot work (welding/cutting/grinding)" cls="bg-amber-100 text-amber-800" />}
                      {!!row.is_working_at_height && <Flag label="WH" title="Working at height (>1.5m)" cls="bg-yellow-100 text-yellow-800" />}
                      {!!row.floor_ptw_required && <Flag label="PTW" title="Permit to Work required (W64)" cls="bg-violet-100 text-violet-800" />}
                      {!!row.is_reportable && <Flag label="⚑" title="Regulator crossed (W137 SIGNATURE)" cls="bg-red-200 text-red-800" />}
                    </div>
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2">
                      <button type="button"
                        className="text-xs text-blue-600 hover:underline"
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
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {selected.risk_tier && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${RISK_TIER_COLOR[selected.risk_tier]}`}>
                      {RISK_TIER_LABEL[selected.risk_tier]}
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[selected.chain_status]}`}>
                    {selected.chain_status.replace(/_/g, ' ')}
                  </span>
                  {selected.work_type && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
                      {WORK_TYPE_LABEL[selected.work_type]}
                    </span>
                  )}
                  {!!selected.is_reportable && (
                    <span className="px-1 py-0.5 rounded text-[10px] bg-red-200 text-red-800">REGULATOR CROSSED</span>
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">{selected.ms_title}</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  {selected.ms_number ?? selected.id} · {selected.project_name ?? selected.project_id}
                </p>
              </div>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={() => { setSelected(null); setActionResult(null); }}>×</button>
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
            {selected.sla_remaining_hours_live != null && selected.risk_tier && (
              <div className="mb-4">
                <SlaCountdown
                  remainingHours={selected.sla_remaining_hours_live}
                  totalHours={selected.sla_target_hours ?? SLA_HOURS_BY_TIER[selected.risk_tier]}
                  breached={!!selected.sla_breached}
                />
              </div>
            )}

            {/* W137 SIGNATURE warning */}
            {selected.is_signature_live && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-900">
                  W137 SIGNATURE — Regulator notification required
                </p>
                <p className="text-xs text-red-800 mt-0.5">
                  This method statement involves critical-lift, confined-space, or live-electrical work.
                  Approval (approve_ms) will notify DOL/OHSA at every tier per OHSA Construction Regulations 2014 Reg.7.
                </p>
              </div>
            )}

            {/* Suspension warning */}
            {selected.chain_status === 'suspended' && selected.suspension_reason && (
              <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2">
                <p className="text-xs font-semibold text-yellow-900">Work suspended</p>
                <p className="text-xs text-yellow-800 mt-0.5">{selected.suspension_reason}</p>
              </div>
            )}

            {/* Safety flags */}
            {(selected.is_critical_lift || selected.is_confined_space || selected.is_live_electrical || selected.is_hot_work || selected.is_working_at_height) ? (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-900 mb-2">Safety classification</p>
                <div className="flex flex-wrap gap-2">
                  {!!selected.is_critical_lift && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-200 text-red-900">Critical lift</span>}
                  {!!selected.is_confined_space && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">Confined space</span>}
                  {!!selected.is_live_electrical && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-200 text-orange-900">Live electrical</span>}
                  {!!selected.is_hot_work && <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800">Hot work</span>}
                  {!!selected.is_working_at_height && <span className="px-2 py-0.5 rounded text-[10px] bg-yellow-100 text-yellow-800">Working at height</span>}
                </div>
              </div>
            ) : null}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
              <div>
                <span className="text-gray-500">Work area</span>
                <p className="font-medium text-gray-800">{selected.work_area ?? '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Scheduled start</span>
                <p className="font-medium text-gray-800">{selected.scheduled_start_date ?? '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Duration (days)</span>
                <p className="font-medium text-gray-800">{selected.scheduled_duration_days ?? '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Revision</span>
                <p className="font-medium text-gray-800">{selected.revision_number}</p>
              </div>
              {selected.sla_breach_count > 0 && (
                <div>
                  <span className="text-gray-500">SLA breach count</span>
                  <p className="font-medium text-red-800">{selected.sla_breach_count}</p>
                </div>
              )}
              {selected.regulator_ref && (
                <div>
                  <span className="text-gray-500">Regulator ref</span>
                  <p className="font-medium text-gray-800">{selected.regulator_ref}</p>
                </div>
              )}
            </div>

            {/* Scope of work */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">Scope of work</p>
              <p className="text-xs text-gray-800 whitespace-pre-wrap">{selected.scope_of_work}</p>
            </div>

            {/* Hazard register */}
            {selected.hazard_register && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Hazard register</p>
                <p className="text-xs text-gray-800 whitespace-pre-wrap">{selected.hazard_register}</p>
              </div>
            )}

            {/* Toolbox talk notes */}
            {selected.toolbox_talk_notes && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Toolbox talk notes</p>
                <p className="text-xs text-gray-800 whitespace-pre-wrap">{selected.toolbox_talk_notes}</p>
              </div>
            )}

            {/* Floor flags */}
            {(selected.floor_ptw_required || selected.floor_ie_review_required || selected.floor_regulatory_notification || selected.floor_lender_notification || selected.floor_third_party_inspection) ? (
              <div className="mb-4 p-3 rounded-lg bg-violet-50 border border-violet-200">
                <p className="text-xs font-semibold text-violet-900 mb-1.5">Floor flags</p>
                <div className="flex flex-wrap gap-1.5">
                  {!!selected.floor_ptw_required && <span className="px-2 py-0.5 rounded text-[10px] bg-violet-100 text-violet-800">PTW required (W64)</span>}
                  {!!selected.floor_ie_review_required && <span className="px-2 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">IE review required</span>}
                  {!!selected.floor_regulatory_notification && <span className="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-700">Regulatory notification</span>}
                  {!!selected.floor_lender_notification && <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700">Lender notification</span>}
                  {!!selected.floor_third_party_inspection && <span className="px-2 py-0.5 rounded text-[10px] bg-teal-100 text-teal-700">Third-party inspection</span>}
                </div>
              </div>
            ) : null}

            {/* Cross-references */}
            {(selected.ptw_ref || selected.ncr_ref || selected.hse_incident_ref || selected.work_order_ref || selected.risk_ref) && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Cross-references</p>
                <div className="flex flex-wrap gap-2">
                  {selected.ptw_ref && <span className="text-xs text-blue-600">PTW: {selected.ptw_ref}</span>}
                  {selected.ncr_ref && <span className="text-xs text-blue-600">NCR: {selected.ncr_ref}</span>}
                  {selected.hse_incident_ref && <span className="text-xs text-blue-600">HSE: {selected.hse_incident_ref}</span>}
                  {selected.work_order_ref && <span className="text-xs text-blue-600">WO: {selected.work_order_ref}</span>}
                  {selected.risk_ref && <span className="text-xs text-blue-600">Risk: {selected.risk_ref}</span>}
                </div>
              </div>
            )}

            {/* Superseded by */}
            {selected.superseded_by_ref && (
              <div className="mb-4 p-2 rounded bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-800">
                  Superseded by: <span className="font-medium">{selected.superseded_by_ref}</span>
                </p>
              </div>
            )}

            {/* Actions */}
            {!readOnly && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Actions</p>
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
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      } disabled:opacity-50`}
                    >
                      {label}
                    </button>
                  ))}
                  {(ACTIONS[selected.chain_status] ?? []).length === 0 && (
                    <span className="text-xs text-gray-400 italic">No actions available (terminal state)</span>
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
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">New method statement</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={() => setShowCreate(false)}>×</button>
            </div>

            {/* SIGNATURE warning on create */}
            {isSignatureCreate && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-900">
                  W137 SIGNATURE — This MS will trigger regulator notification on approval
                </p>
                <p className="text-xs text-red-800 mt-0.5">
                  Critical-lift, confined-space, or live-electrical flags are set. approve_ms will cross regulator at every tier per OHSA Const.Reg.7.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">MS title *</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Method statement title" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">MS number</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newMsNumber} onChange={e => setNewMsNumber(e.target.value)} placeholder="e.g. K500-MS-013" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Project ID *</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="project-id" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Project name</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Project display name" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Work type</label>
                  <select className="text-xs border rounded px-2 py-1.5 w-full" value={newWorkType} onChange={e => setNewWorkType(e.target.value as WorkType)}>
                    {WORK_TYPES.map(w => <option key={w} value={w}>{WORK_TYPE_LABEL[w]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Risk tier</label>
                  <select className="text-xs border rounded px-2 py-1.5 w-full" value={newRiskTier} onChange={e => setNewRiskTier(e.target.value as RiskTier)}>
                    {RISK_TIERS.map(t => <option key={t} value={t}>{RISK_TIER_LABEL[t]} ({SLA_HOURS_BY_TIER[t]}h SLA)</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Work area</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newWorkArea} onChange={e => setNewWorkArea(e.target.value)} placeholder="Site zone / block" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Scheduled start date</label>
                  <input type="date" className="text-xs border rounded px-2 py-1.5 w-full" value={newScheduledStart} onChange={e => setNewScheduledStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Duration (days)</label>
                  <input type="number" min="1" className="text-xs border rounded px-2 py-1.5 w-full" value={newDurationDays} onChange={e => setNewDurationDays(e.target.value)} placeholder="e.g. 3" />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Scope of work *</label>
                <textarea className="text-xs border rounded px-2 py-1.5 w-full" rows={4} value={newScopeOfWork} onChange={e => setNewScopeOfWork(e.target.value)} placeholder="Detailed scope of work, work sequence, controls…" />
              </div>

              {/* Safety flags */}
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-900 mb-2">Safety classification (drives SIGNATURE logic)</p>
                <div className="space-y-1.5">
                  <CheckRow label="Critical lift (crane >80% SWL or >10t)" checked={newCriticalLift} onChange={setNewCriticalLift} warningLabel="SIGNATURE" />
                  <CheckRow label="Confined space entry (OHSA Reg.5)" checked={newConfinedSpace} onChange={setNewConfinedSpace} warningLabel="SIGNATURE" />
                  <CheckRow label="Live electrical work (>50V AC)" checked={newLiveElectrical} onChange={setNewLiveElectrical} warningLabel="SIGNATURE" />
                  <CheckRow label="Hot work (welding / cutting / grinding)" checked={newHotWork} onChange={setNewHotWork} />
                  <CheckRow label="Working at height (>1.5m)" checked={newWorkingAtHeight} onChange={setNewWorkingAtHeight} />
                </div>
              </div>

              {/* Floor flags */}
              <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
                <p className="text-xs font-semibold text-violet-900 mb-2">Floor flags</p>
                <div className="space-y-1.5">
                  <CheckRow label="PTW required before work commencement (W64)" checked={newFloorPtw} onChange={setNewFloorPtw} />
                  <CheckRow label="IE review required" checked={newFloorIe} onChange={setNewFloorIe} />
                  <CheckRow label="Regulatory notification required (DOL/OHSA)" checked={newFloorRegNotify} onChange={setNewFloorRegNotify} />
                  <CheckRow label="Lender notification required" checked={newFloorLender} onChange={setNewFloorLender} />
                  <CheckRow label="Third-party inspection required" checked={newFloorThirdParty} onChange={setNewFloorThirdParty} />
                </div>
              </div>

              {/* Cross-references */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">PTW ref (W64)</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newPtwRef} onChange={e => setNewPtwRef(e.target.value)} placeholder="ptw-xxx" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">NCR ref (W136)</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newNcrRef} onChange={e => setNewNcrRef(e.target.value)} placeholder="ncr-xxx" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">HSE incident ref (W25)</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newHseRef} onChange={e => setNewHseRef(e.target.value)} placeholder="hse-xxx" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Work order ref (W16)</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newWorkOrderRef} onChange={e => setNewWorkOrderRef(e.target.value)} placeholder="wo-xxx" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Risk ref (W133)</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newRiskRef} onChange={e => setNewRiskRef(e.target.value)} placeholder="risk-xxx" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
              <button type="button"
                onClick={handleCreate}
                disabled={createLoading || !newTitle || !newProject || !newScopeOfWork}
                className="text-xs bg-blue-600 text-white rounded px-4 py-1.5 hover:bg-blue-700 disabled:opacity-50"
              >
                {createLoading ? 'Creating…' : 'Create method statement'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
