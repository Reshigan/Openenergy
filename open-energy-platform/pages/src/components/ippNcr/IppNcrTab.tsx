// Wave 136 — IPP Non-Conformance Report (NCR) Management
// ISO 9001:2015 §8.7 + Equator Principles IV QA + REIPPPP quality requirements.
// URGENT SLA: safety_critical 24h (tightest) → cosmetic 720h (loosest).
// SIGNATURE: reject_escalate EVERY tier; accept_as_is crosses when IE/NERSA flag.
// Beats: Procore NCR module (shallow workflow, no P6 state machine) +
//        Oracle Aconex Quality (generic workflow, no REIPPPP-specific disposition logic).
// Mounted at /ipp-lifecycle/workstation?tab=ncr (WRITE: ipp_developer/admin/support).
// READ all 9 personas via readOnly prop.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainStateBar } from '../ChainStateBar';
import { SlaCountdown } from '../SlaCountdown';

type NcrStatus =
  | 'raised' | 'acknowledged' | 'under_investigation' | 'disposition_proposed'
  | 'disposition_reviewed' | 'rework_in_progress' | 'reinspection'
  | 'corrective_action_planned' | 'closed'
  | 'accepted_as_is' | 'rejected_escalated' | 'voided';

type NcrSeverity = 'safety_critical' | 'structural' | 'functional' | 'minor' | 'cosmetic';

interface NcrRow {
  id: string;
  project_id: string;
  project_name: string | null;
  ncr_number: string | null;
  chain_status: NcrStatus;
  ncr_category: string | null;
  ncr_severity: NcrSeverity | null;
  discipline: string | null;
  work_area: string | null;
  specification_ref: string | null;
  description: string;
  detected_by: string | null;
  detection_method: string | null;
  disposition: string | null;
  disposition_justification: string | null;
  rework_scope: string | null;
  corrective_action: string | null;
  preventive_action: string | null;
  root_cause: string | null;
  rca_method: string | null;
  reinspection_notes: string | null;
  closure_notes: string | null;
  ie_comments: string | null;
  lender_notified: number;
  rework_cost_zar: number | null;
  schedule_impact_days: number | null;
  floor_ie_notification_required: number;
  floor_lender_consent_required: number;
  floor_nersa_reportable: number;
  floor_hold_point_triggered: number;
  floor_safety_stop_work: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  itp_ref: string | null;
  issue_ref: string | null;
  rfi_ref: string | null;
  hse_incident_ref: string | null;
  time_in_state_hours_live: number | null;
  sla_remaining_hours_live: number | null;
  is_signature_live: boolean;
  is_hold_point_active_live: boolean;
  created_at: string;
}

interface Dashboard {
  ncrs: {
    total_count: number;
    open_count: number;
    safety_critical_count: number;
    hold_point_count: number;
    sla_breached_count: number;
    closed_count: number;
    rework_cost_total: number;
  };
}

const SLA_HOURS_BY_SEVERITY: Record<NcrSeverity, number> = {
  safety_critical: 24,
  structural:      48,
  functional:     120,
  minor:          336,
  cosmetic:       720,
};

const SEVERITY_COLOR: Record<NcrSeverity, string> = {
  safety_critical: 'bg-red-100 text-red-800',
  structural:      'bg-orange-100 text-orange-700',
  functional:      'bg-amber-100 text-amber-700',
  minor:           'bg-gray-100 text-gray-600',
  cosmetic:        'bg-slate-50 text-slate-500',
};

const SEVERITY_LABEL: Record<NcrSeverity, string> = {
  safety_critical: 'Safety critical',
  structural:      'Structural',
  functional:      'Functional',
  minor:           'Minor',
  cosmetic:        'Cosmetic',
};

const STATUS_COLOR: Record<NcrStatus, string> = {
  raised:                   'bg-slate-100 text-slate-700',
  acknowledged:             'bg-blue-50 text-blue-700',
  under_investigation:      'bg-blue-100 text-blue-800',
  disposition_proposed:     'bg-indigo-100 text-indigo-700',
  disposition_reviewed:     'bg-violet-100 text-violet-700',
  rework_in_progress:       'bg-amber-100 text-amber-800',
  reinspection:             'bg-cyan-100 text-cyan-700',
  corrective_action_planned:'bg-teal-100 text-teal-700',
  closed:                   'bg-green-100 text-green-800',
  accepted_as_is:           'bg-lime-100 text-lime-800',
  rejected_escalated:       'bg-red-100 text-red-700',
  voided:                   'bg-gray-200 text-gray-400',
};

const ACTIONS: Record<NcrStatus, Array<{ action: string; label: string; danger?: boolean }>> = {
  raised:                   [{ action: 'acknowledge_ncr', label: 'Acknowledge' }, { action: 'void_ncr', label: 'Void', danger: true }],
  acknowledged:             [{ action: 'start_investigation', label: 'Start investigation' }, { action: 'void_ncr', label: 'Void', danger: true }],
  under_investigation:      [{ action: 'propose_disposition', label: 'Propose disposition' }],
  disposition_proposed:     [{ action: 'review_disposition', label: 'Review disposition' }],
  disposition_reviewed:     [{ action: 'start_rework', label: 'Start rework/repair' }, { action: 'accept_as_is', label: 'Accept as-is (concession)' }, { action: 'reject_escalate', label: 'Reject & escalate', danger: true }],
  rework_in_progress:       [{ action: 'submit_reinspection', label: 'Submit for reinspection' }],
  reinspection:             [{ action: 'plan_corrective_action', label: 'Plan corrective action' }],
  corrective_action_planned:[{ action: 'close_ncr', label: 'Close NCR' }],
  closed:                   [],
  accepted_as_is:           [],
  rejected_escalated:       [],
  voided:                   [],
};

const MAIN_STATES: readonly NcrStatus[] = [
  'raised', 'acknowledged', 'under_investigation', 'disposition_proposed',
  'disposition_reviewed', 'rework_in_progress', 'reinspection',
  'corrective_action_planned', 'closed',
];
const BRANCH_STATES: readonly NcrStatus[] = ['accepted_as_is', 'rejected_escalated', 'voided'];

const STATUSES: NcrStatus[] = [
  'raised', 'acknowledged', 'under_investigation', 'disposition_proposed',
  'disposition_reviewed', 'rework_in_progress', 'reinspection',
  'corrective_action_planned', 'closed', 'accepted_as_is', 'rejected_escalated', 'voided',
];
const SEVERITIES: NcrSeverity[] = ['safety_critical', 'structural', 'functional', 'minor', 'cosmetic'];

const NCR_CATEGORIES = [
  'workmanship', 'materials', 'design', 'documentation',
  'safety', 'environmental', 'commissioning', 'testing',
];
const DISCIPLINES = ['civil', 'structural', 'electrical', 'mechanical', 'instrumentation', 'hvac', 'process'];
const DETECTION_METHODS = ['inspection', 'audit', 'testing', 'observation'];
const RCA_METHODS = ['five_whys', 'fishbone', 'fmea', 'none'];
const DISPOSITIONS = ['accept_as_is', 'rework', 'repair', 'replace', 'scrap'];

const RCA_LABEL: Record<string, string> = {
  five_whys: '5 Whys', fishbone: 'Fishbone', fmea: 'FMEA', none: '—',
};

const DISPOSITION_LABEL: Record<string, string> = {
  accept_as_is: 'Accept as-is (concession)',
  rework: 'Rework', repair: 'Repair', replace: 'Replace', scrap: 'Scrap',
};

function formatZar(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return Number(val).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
}

interface Props { readOnly?: boolean }

export default function IppNcrTab({ readOnly = false }: Props) {
  const [rows, setRows] = useState<NcrRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NcrRow | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<NcrStatus | ''>('');
  const [filterSeverity, setFilterSeverity] = useState<NcrSeverity | ''>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterDiscipline, setFilterDiscipline] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newProject, setNewProject] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newNcrNumber, setNewNcrNumber] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('workmanship');
  const [newSeverity, setNewSeverity] = useState<NcrSeverity>('functional');
  const [newDiscipline, setNewDiscipline] = useState('civil');
  const [newWorkArea, setNewWorkArea] = useState('');
  const [newSpecRef, setNewSpecRef] = useState('');
  const [newDetectedBy, setNewDetectedBy] = useState('');
  const [newDetectionMethod, setNewDetectionMethod] = useState('inspection');
  const [newRcaMethod, setNewRcaMethod] = useState('none');
  const [newDisposition, setNewDisposition] = useState('rework');
  // Floor flags
  const [newFloorIe, setNewFloorIe] = useState(false);
  const [newFloorLender, setNewFloorLender] = useState(false);
  const [newFloorNersa, setNewFloorNersa] = useState(false);
  const [newFloorHoldPoint, setNewFloorHoldPoint] = useState(false);
  const [newFloorStopWork, setNewFloorStopWork] = useState(false);
  // Cross-refs
  const [newItpRef, setNewItpRef] = useState('');
  const [newIssueRef, setNewIssueRef] = useState('');
  const [newRfiRef, setNewRfiRef] = useState('');
  const [newHseRef, setNewHseRef] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api('/api/ipp-ncr');
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
    if (filterSeverity && r.ncr_severity !== filterSeverity) return false;
    if (filterCategory && r.ncr_category !== filterCategory) return false;
    if (filterDiscipline && r.discipline !== filterDiscipline) return false;
    return true;
  }), [rows, filterStatus, filterSeverity, filterCategory, filterDiscipline]);

  async function handleAction(action: string) {
    if (!selected) return;
    setActionLoading(true); setActionResult(null);
    try {
      await api(`/api/ipp-ncr/${selected.id}/${action}`, { method: 'POST', data: {} });
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
    if (!newProject || !newDescription) return;
    setCreateLoading(true);
    try {
      await api('/api/ipp-ncr', {
        method: 'POST',
        data: {
          project_id: newProject,
          project_name: newProjectName || undefined,
          ncr_number: newNcrNumber || undefined,
          description: newDescription,
          ncr_category: newCategory,
          ncr_severity: newSeverity,
          discipline: newDiscipline || undefined,
          work_area: newWorkArea || undefined,
          specification_ref: newSpecRef || undefined,
          detected_by: newDetectedBy || undefined,
          detection_method: newDetectionMethod,
          rca_method: newRcaMethod,
          disposition: newDisposition,
          floor_ie_notification_required: newFloorIe ? 1 : 0,
          floor_lender_consent_required: newFloorLender ? 1 : 0,
          floor_nersa_reportable: newFloorNersa ? 1 : 0,
          floor_hold_point_triggered: newFloorHoldPoint ? 1 : 0,
          floor_safety_stop_work: newFloorStopWork ? 1 : 0,
          itp_ref: newItpRef || undefined,
          issue_ref: newIssueRef || undefined,
          rfi_ref: newRfiRef || undefined,
          hse_incident_ref: newHseRef || undefined,
        },
      });
      setShowCreate(false);
      setNewProject(''); setNewProjectName(''); setNewNcrNumber(''); setNewDescription('');
      setNewCategory('workmanship'); setNewSeverity('functional'); setNewDiscipline('civil');
      setNewWorkArea(''); setNewSpecRef(''); setNewDetectedBy(''); setNewDetectionMethod('inspection');
      setNewRcaMethod('none'); setNewDisposition('rework');
      setNewFloorIe(false); setNewFloorLender(false); setNewFloorNersa(false);
      setNewFloorHoldPoint(false); setNewFloorStopWork(false);
      setNewItpRef(''); setNewIssueRef(''); setNewRfiRef(''); setNewHseRef('');
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setCreateLoading(false);
    }
  }

  const db = dashboard?.ncrs;
  const isSignatureCreate = newFloorStopWork || newFloorNersa || newSeverity === 'safety_critical';

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      {db && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <KpiCard label="Open NCRs" value={db.open_count} color="blue" />
          <KpiCard label="Safety critical" value={db.safety_critical_count} color="red" />
          <KpiCard label="Hold points active" value={db.hold_point_count} color="orange" />
          <KpiCard label="SLA breached" value={db.sla_breached_count} color="red" />
          <KpiCard label="Closed NCRs" value={db.closed_count} color="green" />
          <KpiCard label="Total" value={db.total_count} color="gray" />
        </div>
      )}

      {/* Rework cost hero */}
      {db && db.rework_cost_total > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <span className="text-amber-600 text-xl mt-0.5">&#9776;</span>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Total rework cost: {formatZar(db.rework_cost_total)}
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              ISO 9001:2015 §10.2: NCR rework cost is a key quality management KPI. High rework cost signals systemic construction quality issues requiring corrective-action escalation.
            </p>
          </div>
        </div>
      )}

      {/* AI insight card — safety_critical warning (W136 SIGNATURE) */}
      {db && db.safety_critical_count > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-red-600 text-xl mt-0.5">&#9888;</span>
          <div>
            <p className="text-sm font-semibold text-red-900">
              {db.safety_critical_count} safety-critical NCR{db.safety_critical_count > 1 ? 's' : ''} require{db.safety_critical_count === 1 ? 's' : ''} immediate action
            </p>
            <p className="text-xs text-red-800 mt-0.5">
              REIPPPP QA + OHSA s24: safety-critical NCRs have a 24h SLA (URGENT — tightest). Unresolved safety NCRs may trigger NERSA enforcement and Equator Principles IV reporting.
              W136 SIGNATURE: reject_escalate crosses regulator at every tier.
            </p>
          </div>
        </div>
      )}

      {/* Hold point alert */}
      {db && db.hold_point_count > 0 && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 flex items-start gap-3">
          <span className="text-violet-600 text-xl mt-0.5">&#9646;</span>
          <div>
            <p className="text-sm font-semibold text-violet-900">
              {db.hold_point_count} hold point{db.hold_point_count > 1 ? 's' : ''} active — construction must not proceed
            </p>
            <p className="text-xs text-violet-800 mt-0.5">
              REIPPPP Appendix 5 §4: hold points require IE sign-off before work continues. Proceeding without sign-off is a contract breach and NERSA licence condition violation.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="text-xs border rounded px-2 py-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value as NcrStatus | '')}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value as NcrSeverity | '')}>
          <option value="">All severities</option>
          {SEVERITIES.map(s => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {NCR_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterDiscipline} onChange={e => setFilterDiscipline(e.target.value)}>
          <option value="">All disciplines</option>
          {DISCIPLINES.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} NCRs</span>
        {!readOnly && (
          <button className="text-xs bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700" onClick={() => setShowCreate(true)}>
            + Raise NCR
          </button>
        )}
        <button className="text-xs border rounded px-2 py-1 hover:bg-gray-50" onClick={load}>Refresh</button>
      </div>

      {actionResult && (
        <div className={`text-xs rounded px-3 py-2 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {actionResult}
        </div>
      )}
      {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
      {loading && <div className="text-xs text-gray-400">Loading NCR register…</div>}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">NCR No.</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Category</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Severity</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Discipline</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">SLA</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Flags</th>
                {!readOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={readOnly ? 8 : 9} className="px-3 py-6 text-center text-gray-400">No NCRs in register</td></tr>
              )}
              {filtered.map(row => (
                <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(row)}>
                  <td className="px-3 py-2 font-mono text-gray-400">{row.ncr_number ?? row.id}</td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <span className="text-gray-800 block truncate">{row.description}</span>
                    {row.project_name && <span className="text-gray-400 truncate block">{row.project_name}</span>}
                  </td>
                  <td className="px-3 py-2 capitalize text-gray-600">{row.ncr_category?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-3 py-2">
                    {row.ncr_severity && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${SEVERITY_COLOR[row.ncr_severity]}`}>
                        {SEVERITY_LABEL[row.ncr_severity]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 capitalize text-gray-600">{row.discipline?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[row.chain_status]}`}>
                      {row.chain_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.sla_remaining_hours_live != null && row.ncr_severity ? (
                      <SlaCountdown
                        remainingHours={row.sla_remaining_hours_live}
                        totalHours={row.sla_target_hours ?? SLA_HOURS_BY_SEVERITY[row.ncr_severity]}
                        breached={!!row.sla_breached}
                        compact
                      />
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {!!row.floor_safety_stop_work && <Flag label="STOP" title="Safety stop-work order active" cls="bg-red-200 text-red-900" />}
                      {!!row.floor_hold_point_triggered && <Flag label="HP" title="Hold point triggered — IE sign-off required" cls="bg-violet-100 text-violet-800" />}
                      {!!row.floor_ie_notification_required && <Flag label="IE" title="IE notification required" cls="bg-orange-100 text-orange-700" />}
                      {!!row.floor_lender_consent_required && <Flag label="LC" title="Lender consent required" cls="bg-blue-100 text-blue-700" />}
                      {!!row.floor_nersa_reportable && <Flag label="N" title="NERSA reportable" cls="bg-indigo-100 text-indigo-700" />}
                      {!!row.is_reportable && <Flag label="⚑" title="Regulator crossed (W136 SIGNATURE)" cls="bg-red-200 text-red-800" />}
                    </div>
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2">
                      <button className="text-xs text-blue-600 hover:underline" onClick={e => { e.stopPropagation(); setSelected(row); }}>Manage</button>
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
                  {selected.ncr_severity && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${SEVERITY_COLOR[selected.ncr_severity]}`}>
                      {SEVERITY_LABEL[selected.ncr_severity]}
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[selected.chain_status]}`}>
                    {selected.chain_status.replace(/_/g, ' ')}
                  </span>
                  {selected.ncr_category && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 capitalize">
                      {selected.ncr_category.replace(/_/g, ' ')}
                    </span>
                  )}
                  {!!selected.is_reportable && <span className="px-1 py-0.5 rounded text-[10px] bg-red-200 text-red-800">REGULATOR CROSSED</span>}
                </div>
                <h3 className="font-semibold text-gray-900">{selected.ncr_number ?? selected.id}</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{selected.id} · {selected.project_name ?? selected.project_id}</p>
              </div>
              <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => { setSelected(null); setActionResult(null); }}>×</button>
            </div>

            {/* W136 SIGNATURE warning */}
            {(selected.floor_safety_stop_work || selected.floor_nersa_reportable || selected.chain_status === 'rejected_escalated') && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-red-800">W136 SIGNATURE — Regulatory crossing required</p>
                <p className="text-xs text-red-700 mt-0.5">
                  {!!selected.floor_safety_stop_work && 'Safety stop-work: work must cease immediately — IE + NERSA notification mandatory. '}
                  {!!selected.floor_nersa_reportable && 'NERSA reportable: formal submission to regulator is required. '}
                  {selected.chain_status === 'rejected_escalated' && 'Disposition rejected and escalated — EVERY tier crosses regulator (REIPPPP QA §9.4). '}
                </p>
              </div>
            )}

            {/* Hold point warning */}
            {!!selected.floor_hold_point_triggered && selected.chain_status !== 'closed' && selected.chain_status !== 'accepted_as_is' && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-violet-800">Hold point active — construction MUST NOT proceed</p>
                <p className="text-xs text-violet-700 mt-0.5">
                  Independent Engineer sign-off is required before work continues. REIPPPP Appendix 5 §4 hold-point verification.
                  {!!selected.floor_lender_consent_required && ' Lender consent also required before sign-off.'}
                </p>
              </div>
            )}

            {/* Chain state progress */}
            <div className="mb-4 px-3 py-3 bg-gray-50 rounded-lg">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">NCR lifecycle</p>
              <ChainStateBar
                allStates={MAIN_STATES}
                currentState={selected.chain_status}
                branchStates={BRANCH_STATES}
                variant="full"
              />
            </div>

            {/* SLA */}
            {selected.sla_remaining_hours_live != null && selected.ncr_severity && (
              <div className="mb-4">
                <SlaCountdown
                  remainingHours={selected.sla_remaining_hours_live}
                  totalHours={selected.sla_target_hours ?? SLA_HOURS_BY_SEVERITY[selected.ncr_severity]}
                  breached={!!selected.sla_breached}
                  label={`${SEVERITY_LABEL[selected.ncr_severity]} SLA (URGENT — ${SLA_HOURS_BY_SEVERITY[selected.ncr_severity]}h, safety failures resolved fastest)`}
                />
              </div>
            )}

            {/* Quantified impact */}
            {(selected.rework_cost_zar !== null || selected.schedule_impact_days !== null) && (
              <div className="flex gap-3 mb-4">
                {selected.rework_cost_zar !== null && (
                  <div className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-amber-600">Rework cost</p>
                    <p className="text-lg font-bold text-amber-700">{formatZar(selected.rework_cost_zar)}</p>
                  </div>
                )}
                {selected.schedule_impact_days !== null && (
                  <div className="flex-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-orange-600">Schedule impact</p>
                    <p className="text-lg font-bold text-orange-700">{selected.schedule_impact_days > 0 ? `+${selected.schedule_impact_days}d` : `${selected.schedule_impact_days}d`}</p>
                  </div>
                )}
              </div>
            )}

            {/* Disposition + RCA */}
            {(selected.disposition || selected.rca_method) && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {selected.disposition && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400 uppercase">Disposition:</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-medium">{DISPOSITION_LABEL[selected.disposition] ?? selected.disposition}</span>
                  </div>
                )}
                {selected.rca_method && selected.rca_method !== 'none' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400 uppercase">RCA:</span>
                    <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-700 text-xs font-medium">{RCA_LABEL[selected.rca_method] ?? selected.rca_method}</span>
                  </div>
                )}
              </div>
            )}

            {/* Content */}
            <div className="space-y-3 mb-4">
              <ContentBlock label="Description" content={selected.description} />
              {selected.disposition_justification && <ContentBlock label="Disposition justification" content={selected.disposition_justification} />}
              {selected.rework_scope && <ContentBlock label="Rework scope" content={selected.rework_scope} cls="bg-amber-50" />}
              {selected.root_cause && <ContentBlock label="Root cause" content={selected.root_cause} />}
              {selected.corrective_action && <ContentBlock label="Corrective action" content={selected.corrective_action} cls="bg-emerald-50" />}
              {selected.preventive_action && <ContentBlock label="Preventive action" content={selected.preventive_action} cls="bg-emerald-50" />}
              {selected.reinspection_notes && <ContentBlock label="Reinspection notes" content={selected.reinspection_notes} cls="bg-cyan-50" />}
              {selected.closure_notes && <ContentBlock label="Closure notes" content={selected.closure_notes} />}
              {selected.ie_comments && <ContentBlock label="IE comments" content={selected.ie_comments} cls="bg-orange-50" />}
            </div>

            {/* Technical details */}
            {(selected.work_area || selected.specification_ref || selected.detected_by || selected.detection_method) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {selected.work_area && <DetailRow label="Work area" value={selected.work_area} />}
                {selected.specification_ref && <DetailRow label="Specification ref" value={selected.specification_ref} />}
                {selected.detected_by && <DetailRow label="Detected by" value={selected.detected_by} />}
                {selected.detection_method && <DetailRow label="Detection method" value={selected.detection_method.replace(/_/g, ' ')} />}
              </div>
            )}

            {/* Cross-references */}
            {(selected.itp_ref || selected.issue_ref || selected.rfi_ref || selected.hse_incident_ref || selected.regulator_ref) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {selected.itp_ref && <DetailRow label="ITP ref" value={selected.itp_ref} />}
                {selected.issue_ref && <DetailRow label="Issue ref" value={selected.issue_ref} />}
                {selected.rfi_ref && <DetailRow label="RFI ref" value={selected.rfi_ref} />}
                {selected.hse_incident_ref && <DetailRow label="HSE incident ref" value={selected.hse_incident_ref} />}
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
                    <button
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
              <h3 className="font-semibold text-gray-900">Raise NCR</h3>
              <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => setShowCreate(false)}>×</button>
            </div>

            {/* SIGNATURE warning in create form */}
            {isSignatureCreate && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                <p className="text-xs font-semibold text-red-800">W136 SIGNATURE — Immediate regulator notification required</p>
                <p className="text-xs text-red-700 mt-0.5">
                  {newFloorStopWork && 'Safety stop-work: IE + NERSA must be notified immediately. '}
                  {newFloorNersa && 'NERSA reportable: formal submission required. '}
                  {newSeverity === 'safety_critical' && 'Safety-critical NCR: 24h URGENT SLA applies. '}
                  Reject &amp; escalate action will cross regulator at every tier.
                </p>
              </div>
            )}

            {/* Hold point warning in create form */}
            {newFloorHoldPoint && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-3">
                <p className="text-xs font-semibold text-violet-800">Hold point triggered</p>
                <p className="text-xs text-violet-700 mt-0.5">
                  Construction will be halted at this NCR. IE sign-off required before proceeding. REIPPPP Appendix 5 §4.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Project ID *">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="kakamas-500mw" />
                </FormField>
                <FormField label="Project name">
                  <input className="w-full text-sm border rounded px-2 py-1.5" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Kakamas 500MW Solar" />
                </FormField>
              </div>
              <FormField label="NCR number">
                <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newNcrNumber} onChange={e => setNewNcrNumber(e.target.value)} placeholder="K500-NCR-001" />
              </FormField>
              <FormField label="Description *">
                <textarea className="w-full text-sm border rounded px-2 py-1.5 resize-none" rows={3} value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Describe the non-conformance with specific location, drawing ref, and deviation from specification." />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Category">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                    {NCR_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </FormField>
                <FormField label="Severity">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newSeverity} onChange={e => setNewSeverity(e.target.value as NcrSeverity)}>
                    {SEVERITIES.map(s => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
                  </select>
                </FormField>
              </div>
              {/* Live SLA preview (URGENT) */}
              <div className="bg-gray-50 rounded p-2 flex items-center justify-between">
                <span className="text-xs font-medium">SLA (URGENT polarity):</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${SEVERITY_COLOR[newSeverity]}`}>{SEVERITY_LABEL[newSeverity]}</span>
                <span className="text-xs text-gray-500">{SLA_HOURS_BY_SEVERITY[newSeverity]}h — {newSeverity === 'safety_critical' ? 'TIGHTEST (life safety)' : newSeverity === 'cosmetic' ? 'loosest' : `${Math.round(SLA_HOURS_BY_SEVERITY[newSeverity]/24)}d`}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Discipline">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newDiscipline} onChange={e => setNewDiscipline(e.target.value)}>
                    {DISCIPLINES.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
                  </select>
                </FormField>
                <FormField label="Detection method">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newDetectionMethod} onChange={e => setNewDetectionMethod(e.target.value)}>
                    {DETECTION_METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                  </select>
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Work area">
                  <input className="w-full text-sm border rounded px-2 py-1.5" value={newWorkArea} onChange={e => setNewWorkArea(e.target.value)} placeholder="Block A, Pile CP-042" />
                </FormField>
                <FormField label="Specification ref">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newSpecRef} onChange={e => setNewSpecRef(e.target.value)} placeholder="DWG-K500-S-001 Rev B" />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Detected by">
                  <input className="w-full text-sm border rounded px-2 py-1.5" value={newDetectedBy} onChange={e => setNewDetectedBy(e.target.value)} placeholder="Site inspector / IE" />
                </FormField>
                <FormField label="Initial disposition">
                  <select className="w-full text-sm border rounded px-2 py-1.5" value={newDisposition} onChange={e => setNewDisposition(e.target.value)}>
                    {DISPOSITIONS.map(d => <option key={d} value={d}>{DISPOSITION_LABEL[d]}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="RCA method">
                <select className="w-full text-sm border rounded px-2 py-1.5" value={newRcaMethod} onChange={e => setNewRcaMethod(e.target.value)}>
                  {RCA_METHODS.map(m => <option key={m} value={m}>{RCA_LABEL[m] ?? m}</option>)}
                </select>
              </FormField>

              {/* Floor flags */}
              <p className="text-xs font-medium text-gray-500 pt-1">Floor flags</p>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs cursor-pointer p-2 rounded border border-red-200 bg-red-50">
                  <input type="checkbox" checked={newFloorStopWork} onChange={e => setNewFloorStopWork(e.target.checked)} />
                  <span className="font-medium text-red-800">Safety stop-work order — W136 SIGNATURE: regulator crossing at every tier</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer p-2 rounded border border-violet-200 bg-violet-50">
                  <input type="checkbox" checked={newFloorHoldPoint} onChange={e => setNewFloorHoldPoint(e.target.checked)} />
                  <span className="font-medium text-violet-800">Hold point triggered (REIPPPP Appendix 5 §4 — IE sign-off required)</span>
                </label>
                {[
                  { val: newFloorIe, set: setNewFloorIe, label: 'IE notification required (accept_as_is crosses regulator)' },
                  { val: newFloorLender, set: setNewFloorLender, label: 'Lender consent required before disposition' },
                  { val: newFloorNersa, set: setNewFloorNersa, label: 'NERSA reportable (accept_as_is crosses regulator)' },
                ].map(({ val, set, label }) => (
                  <label key={label} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>

              {/* Cross-references */}
              <p className="text-xs font-medium text-gray-500 pt-1">Cross-references</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="ITP ref (W120)">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newItpRef} onChange={e => setNewItpRef(e.target.value)} placeholder="itp-001" />
                </FormField>
                <FormField label="Issue ref (W132)">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newIssueRef} onChange={e => setNewIssueRef(e.target.value)} placeholder="iss-001" />
                </FormField>
                <FormField label="RFI ref (W116)">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newRfiRef} onChange={e => setNewRfiRef(e.target.value)} placeholder="rfi-001" />
                </FormField>
                <FormField label="HSE incident ref (W25)">
                  <input className="w-full text-sm border rounded px-2 py-1.5 font-mono" value={newHseRef} onChange={e => setNewHseRef(e.target.value)} placeholder="hse-001" />
                </FormField>
              </div>
            </div>

            {error && <div className="text-xs text-red-600 mt-3">{error}</div>}

            <div className="flex justify-end gap-2 mt-4">
              <button className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50" onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                disabled={!newProject || !newDescription || createLoading}
                onClick={handleCreate}
              >
                {createLoading ? 'Raising…' : 'Raise NCR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const cls = color === 'red' ? 'text-red-600'
    : color === 'green' ? 'text-green-600'
    : color === 'blue' ? 'text-blue-600'
    : color === 'orange' ? 'text-orange-600'
    : 'text-gray-700';
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
