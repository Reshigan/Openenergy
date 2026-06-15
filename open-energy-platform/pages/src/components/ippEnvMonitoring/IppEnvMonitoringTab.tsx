// Wave 138 — IPP Environmental Monitoring Log
// NEMA s30 + DFFE EIA conditions + ISO 14001:2015 + REIPPPP environmental compliance.
// URGENT SLA: critical 24h (tightest) → baseline 720h (loosest).
// SIGNATURE: flag_exceedance EVERY tier on near_sensitive_receptor/eia_condition_breach/nema_s30_notification;
//            submit_report crosses when floor_dffe_report_required.
// Beats: Intelex / Cority generic EMS (static checklists, no P6 state machine, no regulator crossings).
// Mounted at /ipp-lifecycle/workstation?tab=env-monitoring (WRITE: ipp_developer/admin/support).
// READ all 9 personas via readOnly prop.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainStateBar } from '../ChainStateBar';
import { SlaCountdown } from '../SlaCountdown';

type EnvMonitoringStatus =
  | 'scheduled'
  | 'sampling'
  | 'sample_submitted'
  | 'results_received'
  | 'compliance_assessed'
  | 'report_drafted'
  | 'report_submitted'
  | 'closed'
  | 'exceedance_flagged'
  | 'corrective_action'
  | 'under_investigation'
  | 'cancelled';

type MonitoringTier = 'critical' | 'regular' | 'routine' | 'baseline';
type MonitoringCategory =
  | 'air_quality' | 'water_quality' | 'noise' | 'dust' | 'waste'
  | 'land' | 'biodiversity' | 'stormwater' | 'groundwater' | 'visual';

interface EnvRow {
  id: string;
  project_id: string;
  project_name: string | null;
  monitoring_ref: string | null;
  chain_status: EnvMonitoringStatus;
  monitoring_title: string;
  monitoring_category: MonitoringCategory | null;
  monitoring_tier: MonitoringTier | null;
  eia_condition_ref: string | null;
  sampling_location: string | null;
  monitoring_frequency: string | null;
  parameter_name: string | null;
  measured_value: number | null;
  measurement_unit: string | null;
  permit_limit_min: number | null;
  permit_limit_max: number | null;
  exceedance_magnitude: number | null;
  exceedance_pct: number | null;
  is_near_sensitive_receptor: number;
  lab_accredited: number;
  lab_name: string | null;
  lab_sample_ref: string | null;
  findings: string | null;
  exceedance_cause: string | null;
  corrective_actions: string | null;
  corrective_action_deadline: string | null;
  report_title: string | null;
  report_submitted_to: string | null;
  complaint_description: string | null;
  floor_nema_s30_notification: number;
  floor_dffe_report_required: number;
  floor_public_notice_required: number;
  floor_lender_report_required: number;
  floor_eia_condition_breach: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  ncr_ref: string | null;
  hse_incident_ref: string | null;
  ms_ref: string | null;
  stage_gate_ref: string | null;
  created_at: string;
  // Live fields
  time_in_state_hours_live: number | null;
  sla_remaining_hours_live: number | null;
  is_exceedance_live: boolean;
  is_signature_live: boolean;
}

interface Dashboard {
  env_monitoring: {
    total_count: number;
    active_count: number;
    exceedance_count: number;
    critical_tier_count: number;
    near_receptor_count: number;
    sla_breached_count: number;
    dffe_report_count: number;
    eia_breach_count: number;
  };
}

const SLA_HOURS_BY_TIER: Record<MonitoringTier, number> = {
  critical: 24,
  regular: 72,
  routine: 168,
  baseline: 720,
};

const MONITORING_TIER_LABEL: Record<MonitoringTier, string> = {
  critical: 'Critical',
  regular: 'Regular',
  routine: 'Routine',
  baseline: 'Baseline',
};

const MONITORING_TIER_COLOR: Record<MonitoringTier, string> = {
  critical: 'bg-red-100 text-red-800',
  regular: 'bg-orange-100 text-orange-700',
  routine: 'bg-amber-100 text-amber-700',
  baseline: 'bg-[#eef2f7] text-[#3d4756]',
};

const MONITORING_CATEGORY_LABEL: Record<MonitoringCategory, string> = {
  air_quality: 'Air quality',
  water_quality: 'Water quality',
  noise: 'Noise',
  dust: 'Dust',
  waste: 'Waste',
  land: 'Land',
  biodiversity: 'Biodiversity',
  stormwater: 'Stormwater',
  groundwater: 'Groundwater',
  visual: 'Visual',
};

const STATUS_COLOR: Record<EnvMonitoringStatus, string> = {
  scheduled: 'bg-[#eef2f7] text-[#2d3748]',
  sampling: 'rounded',
  sample_submitted: 'rounded',
  results_received: 'bg-violet-100 text-violet-700',
  compliance_assessed: 'bg-cyan-100 text-cyan-700',
  report_drafted: 'bg-teal-100 text-teal-700',
  report_submitted: 'bg-green-100 text-green-800',
  closed: 'bg-[#eef2f7] text-[#3d4756]',
  exceedance_flagged: 'bg-red-100 text-red-800',
  corrective_action: 'bg-orange-100 text-orange-800',
  under_investigation: 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-[#e8ecf0] text-[#9aa5b4]',
};

const STATUS_STYLE: Partial<Record<EnvMonitoringStatus, React.CSSProperties>> = {
  sampling:         { background: 'oklch(0.96 0.006 250)', color: 'oklch(0.40 0.12 250)' },
  sample_submitted: { background: 'oklch(0.94 0.01 270)',  color: 'oklch(0.40 0.09 270)' },
};

const ACTIONS: Record<EnvMonitoringStatus, Array<{ action: string; label: string; danger?: boolean }>> = {
  scheduled: [{ action: 'start_sampling', label: 'Start sampling' }],
  sampling: [
    { action: 'submit_sample', label: 'Submit sample to lab' },
    { action: 'cancel_monitoring', label: 'Cancel monitoring', danger: true },
  ],
  sample_submitted: [{ action: 'record_results', label: 'Record results' }],
  results_received: [
    { action: 'assess_compliance', label: 'Assess compliance' },
    { action: 'flag_exceedance', label: 'Flag exceedance (NEMA s30)', danger: true },
  ],
  compliance_assessed: [
    { action: 'draft_report', label: 'Draft report' },
    { action: 'flag_exceedance', label: 'Flag exceedance', danger: true },
  ],
  report_drafted: [{ action: 'submit_report', label: 'Submit report (DFFE)' }],
  report_submitted: [{ action: 'close_monitoring', label: 'Close monitoring cycle' }],
  closed: [],
  exceedance_flagged: [
    { action: 'initiate_corrective_action', label: 'Initiate corrective action' },
    { action: 'investigate_exceedance', label: 'Investigate exceedance' },
  ],
  corrective_action: [{ action: 'resolve_corrective_action', label: 'Resolve corrective action' }],
  under_investigation: [{ action: 'resolve_corrective_action', label: 'Resolve investigation' }],
  cancelled: [],
};

const MAIN_STATES: readonly EnvMonitoringStatus[] = [
  'scheduled', 'sampling', 'sample_submitted', 'results_received',
  'compliance_assessed', 'report_drafted', 'report_submitted', 'closed',
];
const BRANCH_STATES: readonly EnvMonitoringStatus[] = [
  'exceedance_flagged', 'corrective_action', 'under_investigation', 'cancelled',
];
const STATUSES: EnvMonitoringStatus[] = [...MAIN_STATES, ...BRANCH_STATES];
const MONITORING_TIERS: MonitoringTier[] = ['critical', 'regular', 'routine', 'baseline'];
const MONITORING_CATEGORIES: MonitoringCategory[] = [
  'air_quality', 'water_quality', 'noise', 'dust', 'waste',
  'land', 'biodiversity', 'stormwater', 'groundwater', 'visual',
];

function Flag({ label, title, cls }: { label: string; title: string; cls: string }) {
  return (
    <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${cls}`} title={title}>{label}</span>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    red: 'bg-red-50 text-red-900 border-red-200',
    orange: 'bg-orange-50 text-orange-900 border-orange-200',
    green: 'bg-green-50 text-green-900 border-green-200',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
    gray: 'bg-[#f8fafc] text-[#2d3748] border-[#dde4ec]',
  };
  const blueStyle: React.CSSProperties | undefined = color === 'blue'
    ? { background: 'oklch(0.96 0.006 250)', color: 'oklch(0.17 0.010 250)', borderColor: 'oklch(0.87 0.006 250)' }
    : undefined;
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[color] ?? colors.gray}`} style={blueStyle}>
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

export default function IppEnvMonitoringTab({ readOnly = false }: Props) {
  const [rows, setRows] = useState<EnvRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EnvRow | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<EnvMonitoringStatus | ''>('');
  const [filterTier, setFilterTier] = useState<MonitoringTier | ''>('');
  const [filterCategory, setFilterCategory] = useState<MonitoringCategory | ''>('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newMonitoringRef, setNewMonitoringRef] = useState('');
  const [newCategory, setNewCategory] = useState<MonitoringCategory>('air_quality');
  const [newTier, setNewTier] = useState<MonitoringTier>('regular');
  const [newEiaCondRef, setNewEiaCondRef] = useState('');
  const [newSamplingLocation, setNewSamplingLocation] = useState('');
  const [newFrequency, setNewFrequency] = useState('');
  const [newParameterName, setNewParameterName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newPermitLimitMax, setNewPermitLimitMax] = useState('');
  const [newNearReceptor, setNewNearReceptor] = useState(false);
  const [newLabAccredited, setNewLabAccredited] = useState(false);
  const [newLabName, setNewLabName] = useState('');
  // Floor flags
  const [newFloorNema, setNewFloorNema] = useState(false);
  const [newFloorDffe, setNewFloorDffe] = useState(false);
  const [newFloorPublic, setNewFloorPublic] = useState(false);
  const [newFloorLender, setNewFloorLender] = useState(false);
  const [newFloorEia, setNewFloorEia] = useState(false);
  // Cross-refs
  const [newNcrRef, setNewNcrRef] = useState('');
  const [newHseRef, setNewHseRef] = useState('');
  const [newMsRef, setNewMsRef] = useState('');
  const [newStageGateRef, setNewStageGateRef] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api('/api/ipp-env-monitoring');
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
    if (filterTier && r.monitoring_tier !== filterTier) return false;
    if (filterCategory && r.monitoring_category !== filterCategory) return false;
    return true;
  }), [rows, filterStatus, filterTier, filterCategory]);

  async function handleAction(action: string) {
    if (!selected) return;
    setActionLoading(true); setActionResult(null);
    try {
      await api(`/api/ipp-env-monitoring/${selected.id}/${action}`, { method: 'POST', data: {} });
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
    if (!newTitle || !newProject || !newCategory || !newTier) return;
    setCreateLoading(true);
    try {
      await api('/api/ipp-env-monitoring', {
        method: 'POST',
        data: {
          monitoring_title: newTitle,
          project_id: newProject,
          project_name: newProjectName || undefined,
          monitoring_ref: newMonitoringRef || undefined,
          monitoring_category: newCategory,
          monitoring_tier: newTier,
          eia_condition_ref: newEiaCondRef || undefined,
          sampling_location: newSamplingLocation || undefined,
          monitoring_frequency: newFrequency || undefined,
          parameter_name: newParameterName || undefined,
          measurement_unit: newUnit || undefined,
          permit_limit_max: newPermitLimitMax ? Number(newPermitLimitMax) : undefined,
          is_near_sensitive_receptor: newNearReceptor ? 1 : 0,
          lab_accredited: newLabAccredited ? 1 : 0,
          lab_name: newLabName || undefined,
          floor_nema_s30_notification: newFloorNema ? 1 : 0,
          floor_dffe_report_required: newFloorDffe ? 1 : 0,
          floor_public_notice_required: newFloorPublic ? 1 : 0,
          floor_lender_report_required: newFloorLender ? 1 : 0,
          floor_eia_condition_breach: newFloorEia ? 1 : 0,
          ncr_ref: newNcrRef || undefined,
          hse_incident_ref: newHseRef || undefined,
          ms_ref: newMsRef || undefined,
          stage_gate_ref: newStageGateRef || undefined,
        },
      });
      setShowCreate(false);
      setNewTitle(''); setNewProject(''); setNewProjectName(''); setNewMonitoringRef('');
      setNewCategory('air_quality'); setNewTier('regular'); setNewEiaCondRef('');
      setNewSamplingLocation(''); setNewFrequency(''); setNewParameterName('');
      setNewUnit(''); setNewPermitLimitMax('');
      setNewNearReceptor(false); setNewLabAccredited(false); setNewLabName('');
      setNewFloorNema(false); setNewFloorDffe(false); setNewFloorPublic(false);
      setNewFloorLender(false); setNewFloorEia(false);
      setNewNcrRef(''); setNewHseRef(''); setNewMsRef(''); setNewStageGateRef('');
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setCreateLoading(false);
    }
  }

  const db = dashboard?.env_monitoring;
  const isSignatureCreate = newNearReceptor || newFloorEia || newFloorNema;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      {db && (
        <div className="grid grid-cols-3 sm:grid-cols-8 gap-3">
          <KpiCard label="Active" value={db.active_count} color="green" />
          <KpiCard label="Exceedances" value={db.exceedance_count} color="red" />
          <KpiCard label="Critical tier" value={db.critical_tier_count} color="red" />
          <KpiCard label="Near receptors" value={db.near_receptor_count} color="orange" />
          <KpiCard label="SLA breached" value={db.sla_breached_count} color="red" />
          <KpiCard label="DFFE reports due" value={db.dffe_report_count} color="amber" />
          <KpiCard label="EIA breaches" value={db.eia_breach_count} color="orange" />
          <KpiCard label="Total" value={db.total_count} color="gray" />
        </div>
      )}

      {/* W138 SIGNATURE alert — exceedances with regulatory triggers */}
      {db && (db.exceedance_count > 0 || db.near_receptor_count > 0 || db.eia_breach_count > 0) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-red-600 text-xl mt-0.5">&#9888;</span>
          <div>
            <p className="text-sm font-semibold text-red-900">
              {db.exceedance_count} environmental exceedance{db.exceedance_count !== 1 ? 's' : ''} require regulator notification
            </p>
            <p className="text-xs text-red-800 mt-0.5">
              NEMA s30 + EIA conditions: exceedances near sensitive receptors (schools, hospitals, communities) or in breach of EIA conditions
              trigger immediate DFFE/NEAS notification. flag_exceedance crosses regulator EVERY tier when
              near_sensitive_receptor, EIA condition breach, or NEMA s30 notification floor is set.
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
              {db.sla_breached_count} monitoring record{db.sla_breached_count !== 1 ? 's' : ''} past SLA deadline
            </p>
            <p className="text-xs text-orange-800 mt-0.5">
              URGENT SLA — critical-tier air quality monitoring must be actioned within 24h (NEMA s30 community notification window).
              EIA condition breaches that breach SLA also cross regulator regardless of tier.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Filter by status" className="text-xs border rounded px-2 py-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value as EnvMonitoringStatus | '')}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select aria-label="Filter by tier" className="text-xs border rounded px-2 py-1" value={filterTier} onChange={e => setFilterTier(e.target.value as MonitoringTier | '')}>
          <option value="">All tiers</option>
          {MONITORING_TIERS.map(t => <option key={t} value={t}>{MONITORING_TIER_LABEL[t]}</option>)}
        </select>
        <select aria-label="Filter by category" className="text-xs border rounded px-2 py-1" value={filterCategory} onChange={e => setFilterCategory(e.target.value as MonitoringCategory | '')}>
          <option value="">All categories</option>
          {MONITORING_CATEGORIES.map(c => <option key={c} value={c}>{MONITORING_CATEGORY_LABEL[c]}</option>)}
        </select>
        <span className="text-xs text-[#9aa5b4] ml-auto">{filtered.length} monitoring records</span>
        {!readOnly && (
          <button type="button" className="text-xs bg-green-600 text-white rounded px-3 py-1 hover:bg-green-700" onClick={() => setShowCreate(true)}>
            + Schedule monitoring
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
      {loading && <div className="text-xs text-[#9aa5b4]">Loading environmental monitoring register…</div>}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-[#dde4ec]">
          <table className="w-full text-xs">
            <thead className="bg-[#f8fafc]">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Ref</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Title</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Category</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Tier</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Measurement</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Status</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">SLA</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Flags</th>
                {!readOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 8 : 9} className="px-3 py-6 text-center text-[#9aa5b4]">
                    No environmental monitoring records
                  </td>
                </tr>
              )}
              {filtered.map(row => {
                const exceedance = row.is_exceedance_live;
                return (
                  <tr
                    key={row.id}
                    className={`border-t border-[#eef2f7] hover:bg-[#eef2f7] cursor-pointer ${exceedance ? 'bg-red-50/40' : ''}`}
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-3 py-2 font-mono text-[#9aa5b4]">{row.monitoring_ref ?? row.id}</td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <span className="text-[#1e2a38] block truncate">{row.monitoring_title}</span>
                      {row.project_name && <span className="text-[#9aa5b4] truncate block">{row.project_name}</span>}
                    </td>
                    <td className="px-3 py-2 text-[#3d4756]">
                      {row.monitoring_category ? MONITORING_CATEGORY_LABEL[row.monitoring_category] : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {row.monitoring_tier && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${MONITORING_TIER_COLOR[row.monitoring_tier]}`}>
                          {MONITORING_TIER_LABEL[row.monitoring_tier]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#3d4756]">
                      {row.measured_value != null ? (
                        <span className={exceedance ? 'text-red-700 font-semibold' : ''}>
                          {row.measured_value} {row.measurement_unit}
                          {row.permit_limit_max != null && (
                            <span className="text-[#9aa5b4]"> / {row.permit_limit_max}</span>
                          )}
                          {row.exceedance_pct != null && (
                            <span className="text-red-600 ml-1">+{row.exceedance_pct.toFixed(1)}%</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[#9aa5b4]">{row.parameter_name ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[row.chain_status]}`} style={STATUS_STYLE[row.chain_status]}>
                        {row.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.sla_remaining_hours_live != null && row.monitoring_tier ? (
                        <SlaCountdown
                          remainingHours={row.sla_remaining_hours_live}
                          totalHours={row.sla_target_hours ?? SLA_HOURS_BY_TIER[row.monitoring_tier]}
                          breached={!!row.sla_breached}
                          compact
                        />
                      ) : <span className="text-[#9aa5b4]">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {!!row.is_near_sensitive_receptor && <Flag label="SR" title="Near sensitive receptor (school/hospital/community)" cls="bg-red-200 text-red-900" />}
                        {!!row.floor_eia_condition_breach && <Flag label="EIA" title="EIA condition breach" cls="bg-red-100 text-red-800" />}
                        {!!row.floor_nema_s30_notification && <Flag label="NEMA" title="NEMA s30 notification required" cls="bg-orange-200 text-orange-900" />}
                        {!!row.floor_dffe_report_required && <Flag label="DFFE" title="DFFE report required" cls="bg-amber-100 text-amber-800" />}
                        {!!row.floor_lender_report_required && (
                          <span
                            className="px-1 py-0.5 rounded text-[9px] font-bold"
                            style={{ background: 'oklch(0.94 0.01 270)', color: 'oklch(0.35 0.09 270)' }}
                            title="Lender report required"
                          >LDR</span>
                        )}
                        {!!row.is_reportable && <Flag label="⚑" title="Regulator crossed" cls="bg-red-200 text-red-800" />}
                      </div>
                    </td>
                    {!readOnly && (
                      <td className="px-3 py-2">
                        <button type="button"
                          className="text-xs hover:underline"
                          style={{ color: 'oklch(0.46 0.16 55)' }}
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
                  {selected.monitoring_tier && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${MONITORING_TIER_COLOR[selected.monitoring_tier]}`}>
                      {MONITORING_TIER_LABEL[selected.monitoring_tier]}
                    </span>
                  )}
                  {selected.monitoring_category && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#eef2f7] text-[#3d4756]">
                      {MONITORING_CATEGORY_LABEL[selected.monitoring_category]}
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[selected.chain_status]}`} style={STATUS_STYLE[selected.chain_status]}>
                    {selected.chain_status.replace(/_/g, ' ')}
                  </span>
                  {!!selected.is_reportable && (
                    <span className="px-1 py-0.5 rounded text-[10px] bg-red-200 text-red-800">REGULATOR CROSSED</span>
                  )}
                </div>
                <h3 className="font-semibold text-[#0f1c2e] text-sm">{selected.monitoring_title}</h3>
                <p className="text-xs text-[#9aa5b4] font-mono mt-0.5">
                  {selected.monitoring_ref ?? selected.id} · {selected.project_name ?? selected.project_id}
                </p>
              </div>
              <button type="button" className="text-[#9aa5b4] hover:text-[#3d4756] text-xl leading-none" onClick={() => { setSelected(null); setActionResult(null); }}>×</button>
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
            {selected.sla_remaining_hours_live != null && selected.monitoring_tier && (
              <div className="mb-4">
                <SlaCountdown
                  remainingHours={selected.sla_remaining_hours_live}
                  totalHours={selected.sla_target_hours ?? SLA_HOURS_BY_TIER[selected.monitoring_tier]}
                  breached={!!selected.sla_breached}
                />
              </div>
            )}

            {/* W138 SIGNATURE warning */}
            {selected.is_signature_live && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-900">
                  Regulator notification required
                </p>
                <p className="text-xs text-red-800 mt-0.5">
                  This exceedance involves a sensitive receptor, EIA condition breach, or NEMA s30 notification requirement.
                  flag_exceedance will notify DFFE/NEAS at every tier per NEMA s30 + EIA approval conditions.
                </p>
              </div>
            )}

            {/* Exceedance warning */}
            {selected.is_exceedance_live && selected.measured_value != null && selected.permit_limit_max != null && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-900">Parameter exceedance</p>
                <p className="text-xs text-red-800 mt-0.5">
                  {selected.parameter_name}: {selected.measured_value} {selected.measurement_unit} measured
                  vs {selected.permit_limit_max} {selected.measurement_unit} limit
                  {selected.exceedance_pct != null && ` (+${selected.exceedance_pct.toFixed(1)}% above limit)`}
                </p>
                {selected.exceedance_cause && (
                  <p className="text-xs text-red-700 mt-1">Cause: {selected.exceedance_cause}</p>
                )}
              </div>
            )}

            {/* Measurement details */}
            {selected.measured_value != null && (
              <div className="mb-4 p-3 rounded-lg bg-[#f8fafc] border border-[#dde4ec]">
                <p className="text-xs font-semibold text-[#0f1c2e] mb-2">Measurement</p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[#6b7685]">Parameter</span>
                    <p className="font-medium">{selected.parameter_name ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-[#6b7685]">Measured</span>
                    <p className={`font-medium ${selected.is_exceedance_live ? 'text-red-700' : 'text-green-700'}`}>
                      {selected.measured_value} {selected.measurement_unit}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#6b7685]">Limit (max)</span>
                    <p className="font-medium">{selected.permit_limit_max ?? '—'} {selected.measurement_unit}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
              <div>
                <span className="text-[#6b7685]">EIA condition ref</span>
                <p className="font-medium text-[#1e2a38]">{selected.eia_condition_ref ?? '—'}</p>
              </div>
              <div>
                <span className="text-[#6b7685]">Sampling location</span>
                <p className="font-medium text-[#1e2a38]">{selected.sampling_location ?? '—'}</p>
              </div>
              <div>
                <span className="text-[#6b7685]">Frequency</span>
                <p className="font-medium text-[#1e2a38]">{selected.monitoring_frequency ?? '—'}</p>
              </div>
              <div>
                <span className="text-[#6b7685]">Lab</span>
                <p className="font-medium text-[#1e2a38]">
                  {selected.lab_name ?? '—'}
                  {!!selected.lab_accredited && <span className="ml-1 text-green-600 text-[9px] font-bold">SANAS</span>}
                </p>
              </div>
              {selected.lab_sample_ref && (
                <div>
                  <span className="text-[#6b7685]">Lab sample ref</span>
                  <p className="font-medium text-[#1e2a38]">{selected.lab_sample_ref}</p>
                </div>
              )}
              {selected.corrective_action_deadline && (
                <div>
                  <span className="text-[#6b7685]">Corrective action deadline</span>
                  <p className="font-medium text-orange-700">{selected.corrective_action_deadline}</p>
                </div>
              )}
              {selected.sla_breach_count > 0 && (
                <div>
                  <span className="text-[#6b7685]">SLA breach count</span>
                  <p className="font-medium text-red-800">{selected.sla_breach_count}</p>
                </div>
              )}
              {selected.regulator_ref && (
                <div>
                  <span className="text-[#6b7685]">Regulator ref</span>
                  <p className="font-medium text-[#1e2a38]">{selected.regulator_ref}</p>
                </div>
              )}
            </div>

            {/* Findings */}
            {selected.findings && (
              <div className="mb-4">
                <p className="text-xs text-[#6b7685] mb-1">Findings</p>
                <p className="text-xs text-[#1e2a38] whitespace-pre-wrap">{selected.findings}</p>
              </div>
            )}

            {/* Corrective actions */}
            {selected.corrective_actions && (
              <div className="mb-4">
                <p className="text-xs text-[#6b7685] mb-1">Corrective actions</p>
                <p className="text-xs text-[#1e2a38] whitespace-pre-wrap">{selected.corrective_actions}</p>
              </div>
            )}

            {/* Community complaint */}
            {selected.complaint_description && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs font-semibold text-amber-900 mb-1">Community complaint</p>
                <p className="text-xs text-amber-800">{selected.complaint_description}</p>
              </div>
            )}

            {/* Report details */}
            {selected.report_title && (
              <div className="mb-4">
                <p className="text-xs text-[#6b7685] mb-1">Report</p>
                <p className="text-xs text-[#1e2a38]">{selected.report_title}</p>
                {selected.report_submitted_to && <p className="text-xs text-[#3d4756] mt-0.5">Submitted to: {selected.report_submitted_to}</p>}
              </div>
            )}

            {/* Floor flags */}
            {(selected.floor_nema_s30_notification || selected.floor_dffe_report_required ||
              selected.floor_public_notice_required || selected.floor_lender_report_required ||
              selected.floor_eia_condition_breach) ? (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-900 mb-1.5">Regulatory floor flags</p>
                <div className="flex flex-wrap gap-1.5">
                  {!!selected.floor_nema_s30_notification && <span className="px-2 py-0.5 rounded text-[10px] bg-red-200 text-red-900">NEMA s30 notification</span>}
                  {!!selected.floor_eia_condition_breach && <span className="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-800">EIA condition breach</span>}
                  {!!selected.floor_dffe_report_required && <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800">DFFE report required</span>}
                  {!!selected.floor_public_notice_required && <span className="px-2 py-0.5 rounded text-[10px] bg-orange-100 text-orange-800">Public notice required</span>}
                  {!!selected.floor_lender_report_required && (
                    <span
                      className="px-2 py-0.5 rounded text-[10px]"
                      style={{ background: 'oklch(0.94 0.01 270)', color: 'oklch(0.40 0.09 270)' }}
                    >Lender report required</span>
                  )}
                  {!!selected.is_near_sensitive_receptor && <span className="px-2 py-0.5 rounded text-[10px] bg-red-200 text-red-900">Near sensitive receptor</span>}
                </div>
              </div>
            ) : null}

            {/* Cross-references */}
            {(selected.ncr_ref || selected.hse_incident_ref || selected.ms_ref || selected.stage_gate_ref) && (
              <div className="mb-4">
                <p className="text-xs text-[#6b7685] mb-1">Cross-references</p>
                <div className="flex flex-wrap gap-2">
                  {selected.ncr_ref && <span className="text-xs" style={{ color: 'oklch(0.46 0.16 55)' }}>NCR: {selected.ncr_ref}</span>}
                  {selected.hse_incident_ref && <span className="text-xs" style={{ color: 'oklch(0.46 0.16 55)' }}>HSE: {selected.hse_incident_ref}</span>}
                  {selected.ms_ref && <span className="text-xs" style={{ color: 'oklch(0.46 0.16 55)' }}>MS: {selected.ms_ref}</span>}
                  {selected.stage_gate_ref && <span className="text-xs" style={{ color: 'oklch(0.46 0.16 55)' }}>Stage gate: {selected.stage_gate_ref}</span>}
                </div>
              </div>
            )}

            {/* Actions */}
            {!readOnly && (
              <div className="mt-4 pt-4 border-t border-[#eef2f7]">
                <p className="text-xs text-[#6b7685] mb-2">Actions</p>
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
                    <span className="text-xs text-[#9aa5b4] italic">No actions available (terminal state)</span>
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
              <h3 className="font-semibold text-[#0f1c2e]">Schedule environmental monitoring</h3>
              <button type="button" className="text-[#9aa5b4] hover:text-[#3d4756] text-xl leading-none" onClick={() => setShowCreate(false)}>×</button>
            </div>

            {/* SIGNATURE warning on create */}
            {isSignatureCreate && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-900">
                  flag_exceedance will trigger regulator notification on this monitoring record
                </p>
                <p className="text-xs text-red-800 mt-0.5">
                  Near sensitive receptor, EIA condition breach flag, or NEMA s30 notification floor is set.
                  Any exceedance will cross regulator at EVERY tier per NEMA s30.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Monitoring title *</label>
                  <input aria-label="Monitoring title" className="text-xs border rounded px-2 py-1.5 w-full" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. PM10 monitoring — Station A" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Monitoring ref</label>
                  <input aria-label="Monitoring ref" className="text-xs border rounded px-2 py-1.5 w-full" value={newMonitoringRef} onChange={e => setNewMonitoringRef(e.target.value)} placeholder="e.g. K500-ENV-013" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Project ID *</label>
                  <input aria-label="Project ID" className="text-xs border rounded px-2 py-1.5 w-full" value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="project-id" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Project name</label>
                  <input aria-label="Project name" className="text-xs border rounded px-2 py-1.5 w-full" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Project display name" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Category *</label>
                  <select aria-label="Category" className="text-xs border rounded px-2 py-1.5 w-full" value={newCategory} onChange={e => setNewCategory(e.target.value as MonitoringCategory)}>
                    {MONITORING_CATEGORIES.map(c => <option key={c} value={c}>{MONITORING_CATEGORY_LABEL[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Monitoring tier *</label>
                  <select aria-label="Monitoring tier" className="text-xs border rounded px-2 py-1.5 w-full" value={newTier} onChange={e => setNewTier(e.target.value as MonitoringTier)}>
                    {MONITORING_TIERS.map(t => <option key={t} value={t}>{MONITORING_TIER_LABEL[t]} ({SLA_HOURS_BY_TIER[t]}h SLA)</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">EIA condition ref</label>
                  <input aria-label="EIA condition ref" className="text-xs border rounded px-2 py-1.5 w-full" value={newEiaCondRef} onChange={e => setNewEiaCondRef(e.target.value)} placeholder="e.g. EIA-2024-CON-014" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Sampling location</label>
                  <input aria-label="Sampling location" className="text-xs border rounded px-2 py-1.5 w-full" value={newSamplingLocation} onChange={e => setNewSamplingLocation(e.target.value)} placeholder="GPS or site description" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Monitoring frequency</label>
                  <input aria-label="Monitoring frequency" className="text-xs border rounded px-2 py-1.5 w-full" value={newFrequency} onChange={e => setNewFrequency(e.target.value)} placeholder="daily / weekly / monthly / quarterly" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Parameter name</label>
                  <input aria-label="Parameter name" className="text-xs border rounded px-2 py-1.5 w-full" value={newParameterName} onChange={e => setNewParameterName(e.target.value)} placeholder="e.g. PM10, pH, Laeq(1h)" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Unit</label>
                  <input aria-label="Unit" className="text-xs border rounded px-2 py-1.5 w-full" value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="µg/m³, pH units, dB(A)…" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Permit limit (max)</label>
                  <input aria-label="Permit limit (max)" type="number" className="text-xs border rounded px-2 py-1.5 w-full" value={newPermitLimitMax} onChange={e => setNewPermitLimitMax(e.target.value)} placeholder="e.g. 75" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Lab name</label>
                  <input aria-label="Lab name" className="text-xs border rounded px-2 py-1.5 w-full" value={newLabName} onChange={e => setNewLabName(e.target.value)} placeholder="e.g. Waterlab SA" />
                </div>
              </div>

              {/* Context flags */}
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-900 mb-2">Context classification (drives SIGNATURE logic)</p>
                <div className="space-y-1.5">
                  <CheckRow label="Near sensitive receptor (school/hospital/community within 500m)" checked={newNearReceptor} onChange={setNewNearReceptor} warningLabel="SIGNATURE" />
                  <CheckRow label="SANAS-accredited laboratory used" checked={newLabAccredited} onChange={setNewLabAccredited} />
                </div>
              </div>

              {/* Floor flags */}
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs font-semibold text-amber-900 mb-2">Regulatory floor flags</p>
                <div className="space-y-1.5">
                  <CheckRow label="NEMA s30 notification required (environmental incident must be reported)" checked={newFloorNema} onChange={setNewFloorNema} warningLabel="SIGNATURE" />
                  <CheckRow label="Formal DFFE report required (annual or triggered)" checked={newFloorDffe} onChange={setNewFloorDffe} />
                  <CheckRow label="Public/community notification required" checked={newFloorPublic} onChange={setNewFloorPublic} />
                  <CheckRow label="Lender environmental report required (Equator)" checked={newFloorLender} onChange={setNewFloorLender} />
                  <CheckRow label="EIA condition breach (exceedance violates EIA approval)" checked={newFloorEia} onChange={setNewFloorEia} warningLabel="SIGNATURE" />
                </div>
              </div>

              {/* Cross-references */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">NCR ref</label>
                  <input aria-label="NCR ref" className="text-xs border rounded px-2 py-1.5 w-full" value={newNcrRef} onChange={e => setNewNcrRef(e.target.value)} placeholder="ncr-xxx" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">HSE incident ref</label>
                  <input aria-label="HSE incident ref" className="text-xs border rounded px-2 py-1.5 w-full" value={newHseRef} onChange={e => setNewHseRef(e.target.value)} placeholder="hse-xxx" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Method statement ref</label>
                  <input aria-label="Method statement ref" className="text-xs border rounded px-2 py-1.5 w-full" value={newMsRef} onChange={e => setNewMsRef(e.target.value)} placeholder="ms-xxx" />
                </div>
                <div>
                  <label className="text-xs text-[#6b7685] block mb-1">Stage gate ref</label>
                  <input aria-label="Stage gate ref" className="text-xs border rounded px-2 py-1.5 w-full" value={newStageGateRef} onChange={e => setNewStageGateRef(e.target.value)} placeholder="sg-xxx" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4 pt-4 border-t border-[#eef2f7]">
              <button type="button"
                onClick={handleCreate}
                disabled={createLoading || !newTitle || !newProject}
                className="text-xs bg-green-600 text-white rounded px-4 py-1.5 hover:bg-green-700 disabled:opacity-50"
              >
                {createLoading ? 'Creating…' : 'Schedule monitoring'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="text-xs border rounded px-3 py-1.5 hover:bg-[#eef2f7]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
