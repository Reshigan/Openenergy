// Wave 142 — IPP Technical Query (TQ) Log
// ISO 9001:2015 design communication + FIDIC EPC contracts + CIDB best practice.
// URGENT SLA: safety_critical 24h (tightest) / construction_blocking 48h / standard 168h / information_only 336h.
// SIGNATURE: flag_design_change crosses regulator EVERY tier when floor_structural_safety;
//            escalate_tq crosses when floor_ie_notification_required;
//            issue_response crosses when floor_nersa_impact.
// Beats Aconex (static document workflow) with full designer-response P6 lifecycle.
// WRITE: ipp_developer / admin / support. READ all 9 personas via readOnly prop.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainStateBar } from '../ChainStateBar';
import { SlaCountdown } from '../SlaCountdown';

type TqStatus =
  | 'raised' | 'logged' | 'allocated' | 'under_review'
  | 'response_drafted' | 'response_approved' | 'response_issued'
  | 'acknowledged' | 'closed' | 'rejected'
  | 'design_change_required' | 'escalated';

type QueryUrgency = 'safety_critical' | 'construction_blocking' | 'standard' | 'information_only';

interface TqRow {
  id: string;
  project_id: string;
  project_name: string | null;
  tq_number: string | null;
  chain_status: TqStatus;
  tq_title: string;
  discipline: string | null;
  query_urgency: QueryUrgency | null;
  contractor_ref: string | null;
  query_description: string;
  drawing_ref: string | null;
  specification_ref: string | null;
  proposed_solution: string | null;
  assigned_designer: string | null;
  design_company: string | null;
  assigned_at: string | null;
  response_description: string | null;
  response_type: string | null;
  design_change_ref: string | null;
  rejection_reason: string | null;
  escalation_reason: string | null;
  escalation_notes: string | null;
  floor_structural_safety: number;
  floor_ie_notification_required: number;
  floor_lender_notification: number;
  floor_nersa_impact: number;
  floor_specification_deviation: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  rfi_ref: string | null;
  ncr_ref: string | null;
  ms_ref: string | null;
  submittal_ref: string | null;
  created_at: string;
  sla_remaining_hours_live: number | null;
  is_open_live: boolean;
  is_signature_live: boolean;
}

interface Dashboard {
  tqs: {
    total_count: number;
    open_count: number;
    construction_blocking_count: number;
    design_change_count: number;
    escalated_count: number;
    sla_breached_count: number;
    safety_critical_count: number;
  };
}

const SLA_HOURS_BY_URGENCY: Record<QueryUrgency, number> = {
  safety_critical: 24,
  construction_blocking: 48,
  standard: 168,
  information_only: 336,
};

const URGENCY_LABEL: Record<QueryUrgency, string> = {
  safety_critical: 'Safety critical',
  construction_blocking: 'Construction blocking',
  standard: 'Standard',
  information_only: 'Information only',
};

const URGENCY_COLOR: Record<QueryUrgency, string> = {
  safety_critical: 'bg-red-100 text-red-800',
  construction_blocking: 'bg-orange-100 text-orange-700',
  standard: 'bg-[oklch(0.97_0.003_250)] text-[oklch(0.46_0.16_55)]',
  information_only: 'bg-[#eef2f7] text-[#3d4756]',
};

const DISCIPLINE_LABEL: Record<string, string> = {
  civil: 'Civil',
  structural: 'Structural',
  electrical: 'Electrical',
  mechanical: 'Mechanical',
  instrumentation: 'Instrumentation',
  process: 'Process',
  fire_protection: 'Fire protection',
  geotechnical: 'Geotechnical',
  environmental: 'Environmental',
};

const DISCIPLINE_COLOR: Record<string, string> = {
  structural: 'bg-amber-100 text-amber-800',
  electrical: 'bg-yellow-100 text-yellow-800',
  civil: 'bg-green-100 text-green-800',
  mechanical: 'bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]',
  instrumentation: 'bg-purple-100 text-purple-800',
  process: 'bg-teal-100 text-teal-700',
  fire_protection: 'bg-red-100 text-red-700',
  geotechnical: 'bg-brown-100 text-stone-700',
  environmental: 'bg-emerald-100 text-emerald-700',
};

const RESPONSE_TYPE_LABEL: Record<string, string> = {
  clarification: 'Clarification',
  accept_proposed: 'Accept proposed',
  reject_proposed: 'Reject proposed',
  design_change_required: 'Design change req.',
  refer_to_client: 'Refer to client',
};

const STATUS_COLOR: Record<TqStatus, string> = {
  raised:                  'bg-[#eef2f7] text-[#2d3748]',
  logged:                  'bg-[oklch(0.97_0.003_250)] text-[oklch(0.46_0.16_55)]',
  allocated:               'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  under_review:            'bg-violet-100 text-violet-700',
  response_drafted:        'bg-cyan-100 text-cyan-700',
  response_approved:       'bg-teal-100 text-teal-700',
  response_issued:         'bg-emerald-100 text-emerald-700',
  acknowledged:            'bg-green-100 text-green-800',
  closed:                  'bg-[#eef2f7] text-[#3d4756]',
  rejected:                'bg-red-200 text-red-900',
  design_change_required:  'bg-orange-100 text-orange-800',
  escalated:               'bg-red-100 text-red-800',
};

const ACTIONS: Record<TqStatus, Array<{ action: string; label: string; danger?: boolean }>> = {
  raised:                 [{ action: 'log_tq', label: 'Log TQ' }],
  logged:                 [
    { action: 'allocate_to_designer', label: 'Allocate to designer' },
    { action: 'reject_tq', label: 'Reject', danger: true },
  ],
  allocated:              [
    { action: 'commence_review', label: 'Commence review' },
    { action: 'reject_tq', label: 'Reject', danger: true },
  ],
  under_review:           [
    { action: 'draft_response', label: 'Draft response' },
    { action: 'escalate_tq', label: 'Escalate', danger: true },
    { action: 'reject_tq', label: 'Reject', danger: true },
  ],
  response_drafted:       [
    { action: 'approve_response', label: 'Approve response' },
    { action: 'flag_design_change', label: 'Flag design change required', danger: true },
    { action: 'escalate_tq', label: 'Escalate', danger: true },
  ],
  response_approved:      [
    { action: 'issue_response', label: 'Issue response' },
    { action: 'flag_design_change', label: 'Flag design change required', danger: true },
  ],
  response_issued:        [{ action: 'acknowledge_response', label: 'Acknowledge response' }],
  acknowledged:           [{ action: 'close_tq', label: 'Close TQ' }],
  closed:                 [],
  rejected:               [],
  design_change_required: [],
  escalated:              [{ action: 'resolve_escalation', label: 'Resolve escalation — return to designer' }],
};

const MAIN_STATES: readonly TqStatus[] = [
  'raised', 'logged', 'allocated', 'under_review',
  'response_drafted', 'response_approved', 'response_issued', 'acknowledged', 'closed',
];
const BRANCH_STATES: readonly TqStatus[] = [
  'rejected', 'design_change_required', 'escalated',
];
const ALL_STATUSES: TqStatus[] = [...MAIN_STATES, ...BRANCH_STATES];
const ALL_URGENCIES: QueryUrgency[] = ['safety_critical', 'construction_blocking', 'standard', 'information_only'];
const ALL_DISCIPLINES = Object.keys(DISCIPLINE_LABEL);

function slaRemainingHours(deadlineIso: string): number {
  return Math.round((new Date(deadlineIso).getTime() - Date.now()) / 3_600_000);
}

function Flag({ label, title, cls }: { label: string; title: string; cls: string }) {
  return (
    <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${cls}`} title={title}>{label}</span>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue:   'bg-[oklch(0.97_0.003_250)] text-[oklch(0.17_0.010_250)] border-[oklch(0.87_0.012_250)]',
    red:    'bg-red-50 text-red-900 border-red-200',
    orange: 'bg-orange-50 text-orange-900 border-orange-200',
    green:  'bg-green-50 text-green-900 border-green-200',
    amber:  'bg-amber-50 text-amber-900 border-amber-200',
    gray:   'bg-[#f8fafc] text-[#2d3748] border-[#dde4ec]',
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

export default function IppTqTab({ readOnly = false }: Props) {
  const [rows, setRows] = useState<TqRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TqRow | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<TqStatus | ''>('');
  const [filterUrgency, setFilterUrgency] = useState<QueryUrgency | ''>('');
  const [filterDiscipline, setFilterDiscipline] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newTqNumber, setNewTqNumber] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newDiscipline, setNewDiscipline] = useState('structural');
  const [newUrgency, setNewUrgency] = useState<QueryUrgency>('standard');
  const [newDescription, setNewDescription] = useState('');
  const [newDrawingRef, setNewDrawingRef] = useState('');
  const [newSpecRef, setNewSpecRef] = useState('');
  const [newProposedSolution, setNewProposedSolution] = useState('');
  const [newContractorRef, setNewContractorRef] = useState('');
  const [newFloorStructural, setNewFloorStructural] = useState(false);
  const [newFloorIe, setNewFloorIe] = useState(false);
  const [newFloorLender, setNewFloorLender] = useState(false);
  const [newFloorNersa, setNewFloorNersa] = useState(false);
  const [newFloorSpecDev, setNewFloorSpecDev] = useState(false);
  const [newRfiRef, setNewRfiRef] = useState('');
  const [newNcrRef, setNewNcrRef] = useState('');
  const [newMsRef, setNewMsRef] = useState('');
  const [newSubmittalRef, setNewSubmittalRef] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api('/api/ipp-tq');
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
    if (filterUrgency && r.query_urgency !== filterUrgency) return false;
    if (filterDiscipline && r.discipline !== filterDiscipline) return false;
    return true;
  }), [rows, filterStatus, filterUrgency, filterDiscipline]);

  async function handleAction(action: string, extraBody: Record<string, unknown> = {}) {
    if (!selected) return;
    setActionLoading(true); setActionResult(null);
    try {
      await api(`/api/ipp-tq/${selected.id}/${action}`, { method: 'POST', data: extraBody });
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
    if (!newTitle || !newProjectId || !newDescription || !newDiscipline || !newUrgency) return;
    setCreateLoading(true);
    try {
      await api('/api/ipp-tq', {
        method: 'POST',
        data: {
          tq_title: newTitle,
          tq_number: newTqNumber || undefined,
          project_id: newProjectId,
          project_name: newProjectName || undefined,
          discipline: newDiscipline,
          query_urgency: newUrgency,
          query_description: newDescription,
          drawing_ref: newDrawingRef || undefined,
          specification_ref: newSpecRef || undefined,
          proposed_solution: newProposedSolution || undefined,
          contractor_ref: newContractorRef || undefined,
          floor_structural_safety: newFloorStructural ? 1 : 0,
          floor_ie_notification_required: newFloorIe ? 1 : 0,
          floor_lender_notification: newFloorLender ? 1 : 0,
          floor_nersa_impact: newFloorNersa ? 1 : 0,
          floor_specification_deviation: newFloorSpecDev ? 1 : 0,
          rfi_ref: newRfiRef || undefined,
          ncr_ref: newNcrRef || undefined,
          ms_ref: newMsRef || undefined,
          submittal_ref: newSubmittalRef || undefined,
        },
      });
      setShowCreate(false);
      setNewTitle(''); setNewTqNumber(''); setNewProjectId(''); setNewProjectName('');
      setNewDiscipline('structural'); setNewUrgency('standard');
      setNewDescription(''); setNewDrawingRef(''); setNewSpecRef('');
      setNewProposedSolution(''); setNewContractorRef('');
      setNewFloorStructural(false); setNewFloorIe(false); setNewFloorLender(false);
      setNewFloorNersa(false); setNewFloorSpecDev(false);
      setNewRfiRef(''); setNewNcrRef(''); setNewMsRef(''); setNewSubmittalRef('');
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setCreateLoading(false);
    }
  }

  const db = dashboard?.tqs;
  const selectedActions = selected ? (ACTIONS[selected.chain_status] ?? []) : [];
  const isSignatureCreate = newFloorStructural;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      {db && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <KpiCard label="Open TQs" value={db.open_count} color="blue" />
          <KpiCard label="Construction blocking" value={db.construction_blocking_count} color={db.construction_blocking_count > 0 ? 'orange' : 'gray'} />
          <KpiCard label="Design changes req." value={db.design_change_count} color={db.design_change_count > 0 ? 'amber' : 'gray'} />
          <KpiCard label="Escalated" value={db.escalated_count} color={db.escalated_count > 0 ? 'red' : 'gray'} />
          <KpiCard label="SLA breached" value={db.sla_breached_count} color={db.sla_breached_count > 0 ? 'red' : 'gray'} />
          <KpiCard label="Safety critical" value={db.safety_critical_count} color={db.safety_critical_count > 0 ? 'red' : 'gray'} />
        </div>
      )}

      {/* AI insight card */}
      {db && db.construction_blocking_count > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-3">
          <span className="text-orange-600 text-xl mt-0.5">&#9888;</span>
          <div>
            <p className="text-sm font-semibold text-orange-900">
              {db.construction_blocking_count} construction-blocking TQ{db.construction_blocking_count !== 1 ? 's' : ''} pending response
            </p>
            <p className="text-xs text-orange-800 mt-0.5">
              FIDIC: designer responses to construction-blocking queries are contractually due within 48 hours.
              W142 SIGNATURE: flag_design_change crosses regulator when structural safety flag set — IE notification mandatory.
              Review and allocate to the responsible designer immediately.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="text-xs border rounded px-2 py-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value as TqStatus | '')}>
          <option value="">All statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterUrgency} onChange={e => setFilterUrgency(e.target.value as QueryUrgency | '')}>
          <option value="">All urgencies</option>
          {ALL_URGENCIES.map(u => <option key={u} value={u}>{URGENCY_LABEL[u]}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterDiscipline} onChange={e => setFilterDiscipline(e.target.value)}>
          <option value="">All disciplines</option>
          {ALL_DISCIPLINES.map(d => <option key={d} value={d}>{DISCIPLINE_LABEL[d]}</option>)}
        </select>
        <span className="text-xs text-[#9aa5b4] ml-auto">{filtered.length} TQs</span>
        {!readOnly && (
          <button type="button" className="text-xs bg-green-600 text-white rounded px-3 py-1 hover:bg-green-700" onClick={() => setShowCreate(true)}>
            + New TQ
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
      {loading && <div className="text-xs text-[#9aa5b4]">Loading technical queries…</div>}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-[#dde4ec]">
          <table className="w-full text-xs">
            <thead className="bg-[#f8fafc]">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">TQ No.</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Title</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Discipline</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Urgency</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Designer</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Response type</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Status</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">SLA</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Flags</th>
                {!readOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 9 : 10} className="px-3 py-6 text-center text-[#9aa5b4]">
                    No technical queries recorded
                  </td>
                </tr>
              )}
              {filtered.map(row => (
                <tr
                  key={row.id}
                  className={`border-t border-[#eef2f7] hover:bg-[#eef2f7] cursor-pointer ${
                    row.chain_status === 'escalated' ? 'bg-red-50/30' :
                    row.chain_status === 'design_change_required' ? 'bg-orange-50/30' : ''
                  }`}
                  onClick={() => setSelected(row)}
                >
                  <td className="px-3 py-2 font-mono text-[#6b7685]">
                    {row.tq_number ?? row.id}
                  </td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <span className="text-[#1e2a38] block truncate font-medium">{row.tq_title}</span>
                    {row.project_name && <span className="text-[#9aa5b4] truncate block">{row.project_name}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {row.discipline && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${DISCIPLINE_COLOR[row.discipline] ?? 'bg-[#eef2f7] text-[#3d4756]'}`}>
                        {DISCIPLINE_LABEL[row.discipline] ?? row.discipline}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.query_urgency && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${URGENCY_COLOR[row.query_urgency]}`}>
                        {URGENCY_LABEL[row.query_urgency]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[#2d3748] block truncate">{row.assigned_designer ?? '—'}</span>
                    {row.design_company && <span className="text-[#9aa5b4] text-[10px] block truncate">{row.design_company}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {row.response_type ? (
                      <span className="text-[#3d4756]">{RESPONSE_TYPE_LABEL[row.response_type] ?? row.response_type}</span>
                    ) : <span className="text-[#9aa5b4]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[row.chain_status]}`}>
                      {row.chain_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.sla_deadline_at && row.is_open_live ? (
                      <SlaCountdown
                        remainingHours={slaRemainingHours(row.sla_deadline_at)}
                        totalHours={row.sla_target_hours ?? SLA_HOURS_BY_URGENCY[row.query_urgency ?? 'standard']}
                        breached={!!row.sla_breached}
                        compact
                      />
                    ) : (
                      <span className="text-[#9aa5b4] text-[10px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {!!row.floor_structural_safety && (
                        <Flag label="STR" title="Structural safety impact (SIGNATURE: crosses regulator)" cls="bg-red-100 text-red-800" />
                      )}
                      {!!row.floor_ie_notification_required && (
                        <Flag label="IE" title="IE notification required" cls="bg-orange-100 text-orange-700" />
                      )}
                      {!!row.floor_lender_notification && (
                        <Flag label="LDR" title="Lender notification required" cls="bg-purple-100 text-purple-800" />
                      )}
                      {!!row.floor_nersa_impact && (
                        <Flag label="NERSA" title="NERSA permit condition impacted" cls="bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]" />
                      )}
                      {!!row.floor_specification_deviation && (
                        <Flag label="SPEC" title="Response allows specification deviation" cls="bg-amber-100 text-amber-700" />
                      )}
                      {!!row.sla_breached && (
                        <Flag label="SLA!" title="SLA breached" cls="bg-red-200 text-red-900" />
                      )}
                      {!!row.is_reportable && (
                        <Flag label="RPT" title="Regulator notified" cls="bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]" />
                      )}
                    </div>
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2">
                      <button type="button" className="text-[10px] text-[oklch(0.46_0.16_55)] hover:underline" onClick={e => { e.stopPropagation(); setSelected(row); }}>
                        Open
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }} className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#0f1c2e]">
                  {selected.tq_number ?? selected.id}
                  {selected.query_urgency && (
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${URGENCY_COLOR[selected.query_urgency]}`}>
                      {URGENCY_LABEL[selected.query_urgency]}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-[#2d3748] mt-0.5">{selected.tq_title}</p>
                {selected.project_name && <p className="text-xs text-[#9aa5b4]">{selected.project_name}</p>}
              </div>
              <button type="button" className="text-[#9aa5b4] hover:text-[#3d4756] text-xl" onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* Chain state bar */}
            <ChainStateBar
              allStates={MAIN_STATES as string[]}
              currentState={selected.chain_status}
              branchStates={BRANCH_STATES as string[]}
            />

            {/* SLA */}
            {selected.sla_deadline_at && selected.is_open_live && (
              <SlaCountdown
                remainingHours={slaRemainingHours(selected.sla_deadline_at)}
                totalHours={selected.sla_target_hours ?? SLA_HOURS_BY_URGENCY[selected.query_urgency ?? 'standard']}
                breached={!!selected.sla_breached}
              />
            )}

            {/* SIGNATURE alert */}
            {(selected.chain_status === 'response_drafted' || selected.chain_status === 'response_approved') && !!selected.floor_structural_safety && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
                <p className="text-xs font-bold text-red-900">W142 SIGNATURE: Structural safety flag set</p>
                <p className="text-xs text-red-800 mt-0.5">
                  flag_design_change on this TQ will cross regulator on ALL tiers (structural integrity always reportable — IE notification mandatory).
                </p>
              </div>
            )}

            {/* Query content */}
            <div className="rounded-lg border border-[#dde4ec] p-4 space-y-3">
              <h3 className="text-xs font-semibold text-[#2d3748]">Query</h3>
              <p className="text-xs text-[#1e2a38] leading-relaxed">{selected.query_description}</p>
              {selected.drawing_ref && (
                <div className="text-xs"><span className="font-medium text-[#6b7685]">Drawing ref:</span> <span className="text-[#2d3748]">{selected.drawing_ref}</span></div>
              )}
              {selected.specification_ref && (
                <div className="text-xs"><span className="font-medium text-[#6b7685]">Specification ref:</span> <span className="text-[#2d3748]">{selected.specification_ref}</span></div>
              )}
              {selected.proposed_solution && (
                <div className="text-xs bg-[oklch(0.97_0.003_250)] rounded p-2">
                  <span className="font-semibold text-[oklch(0.40_0.009_250)]">Contractor's proposed solution:</span>
                  <p className="mt-0.5 text-[oklch(0.46_0.16_55)]">{selected.proposed_solution}</p>
                </div>
              )}
            </div>

            {/* Designer assignment */}
            {(selected.assigned_designer || selected.design_company) && (
              <div className="text-xs text-[#3d4756] flex gap-4">
                {selected.assigned_designer && <span><span className="font-medium">Designer:</span> {selected.assigned_designer}</span>}
                {selected.design_company && <span><span className="font-medium">Firm:</span> {selected.design_company}</span>}
              </div>
            )}

            {/* Response section */}
            {selected.response_description && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-green-800">Designer response</h3>
                  {selected.response_type && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                      {RESPONSE_TYPE_LABEL[selected.response_type] ?? selected.response_type}
                    </span>
                  )}
                </div>
                <p className="text-xs text-green-800 leading-relaxed">{selected.response_description}</p>
                {selected.design_change_ref && (
                  <div className="text-xs bg-orange-50 border border-orange-200 rounded p-2">
                    <span className="font-semibold text-orange-800">Design change ref:</span>
                    <span className="ml-1 text-orange-700">{selected.design_change_ref}</span>
                  </div>
                )}
              </div>
            )}

            {/* Escalation section */}
            {selected.escalation_reason && (
              <div className="text-xs bg-red-50 border border-red-200 rounded p-2 space-y-1">
                <div><span className="font-semibold text-red-800">Escalation reason:</span> <span className="text-red-700">{selected.escalation_reason}</span></div>
                {selected.escalation_notes && <div><span className="font-semibold text-red-800">Notes:</span> <span className="text-red-700">{selected.escalation_notes}</span></div>}
              </div>
            )}

            {/* Rejection */}
            {selected.rejection_reason && (
              <div className="text-xs bg-red-100 border border-red-300 rounded p-2">
                <span className="font-semibold text-red-900">Rejection reason:</span>
                <span className="ml-1 text-red-800">{selected.rejection_reason}</span>
              </div>
            )}

            {/* Floor flags */}
            <div className="flex flex-wrap gap-2">
              {!!selected.floor_structural_safety && <Flag label="Structural safety impact" title="Structural integrity — SIGNATURE: crosses regulator" cls="bg-red-100 text-red-800" />}
              {!!selected.floor_ie_notification_required && <Flag label="IE notification required" title="IE must be informed" cls="bg-orange-100 text-orange-700" />}
              {!!selected.floor_lender_notification && <Flag label="Lender notification required" title="Lender must be informed" cls="bg-purple-100 text-purple-800" />}
              {!!selected.floor_nersa_impact && <Flag label="NERSA permit condition" title="NERSA permit condition impacted" cls="bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]" />}
              {!!selected.floor_specification_deviation && <Flag label="Specification deviation" title="Response allows deviation from spec" cls="bg-amber-100 text-amber-700" />}
            </div>

            {/* Cross-refs */}
            {(selected.rfi_ref || selected.ncr_ref || selected.ms_ref || selected.submittal_ref) && (
              <div className="flex flex-wrap gap-2 text-xs text-[#6b7685]">
                {selected.rfi_ref && <span className="rounded bg-[#eef2f7] px-2 py-0.5">RFI: {selected.rfi_ref}</span>}
                {selected.ncr_ref && <span className="rounded bg-[#eef2f7] px-2 py-0.5">NCR: {selected.ncr_ref}</span>}
                {selected.ms_ref && <span className="rounded bg-[#eef2f7] px-2 py-0.5">MS: {selected.ms_ref}</span>}
                {selected.submittal_ref && <span className="rounded bg-[#eef2f7] px-2 py-0.5">Submittal: {selected.submittal_ref}</span>}
              </div>
            )}

            {/* Actions */}
            {!readOnly && selectedActions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#3d4756]">Actions</p>
                <div className="flex flex-wrap gap-2">
                  {selectedActions.map(({ action, label, danger }) => (
                    <button type="button"
                      key={action}
                      disabled={actionLoading}
                      onClick={() => handleAction(action)}
                      className={`text-xs rounded px-3 py-1.5 font-medium disabled:opacity-50 ${
                        danger
                          ? 'bg-red-100 text-red-800 hover:bg-red-200'
                          : 'bg-[#c2873a] text-white hover:bg-[#a3702f]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {actionResult && (
                  <p className={`text-xs ${actionResult.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
                    {actionResult}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }} className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#0f1c2e]">New technical query (TQ)</h2>
              <button type="button" className="text-[#9aa5b4] hover:text-[#3d4756] text-xl" onClick={() => setShowCreate(false)}>✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">TQ title *</span>
                <input className="border rounded px-2 py-1.5" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Foundation depth variation at column C4" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">TQ number</span>
                <input className="border rounded px-2 py-1.5" value={newTqNumber} onChange={e => setNewTqNumber(e.target.value)} placeholder="K500-TQ-013 (auto-generated if blank)" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Project ID *</span>
                <input className="border rounded px-2 py-1.5" value={newProjectId} onChange={e => setNewProjectId(e.target.value)} placeholder="kakamas-500mw" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Project name</span>
                <input className="border rounded px-2 py-1.5" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Discipline *</span>
                <select className="border rounded px-2 py-1.5" value={newDiscipline} onChange={e => setNewDiscipline(e.target.value)}>
                  {ALL_DISCIPLINES.map(d => <option key={d} value={d}>{DISCIPLINE_LABEL[d]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Query urgency *</span>
                <select className="border rounded px-2 py-1.5" value={newUrgency} onChange={e => setNewUrgency(e.target.value as QueryUrgency)}>
                  {ALL_URGENCIES.map(u => (
                    <option key={u} value={u}>{URGENCY_LABEL[u]} — {SLA_HOURS_BY_URGENCY[u]}h SLA</option>
                  ))}
                </select>
                <span className="text-[10px] text-[#9aa5b4] italic">Higher urgency = tighter SLA (URGENT polarity)</span>
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Query description *</span>
                <textarea className="border rounded px-2 py-1.5 h-24 resize-y" value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Describe the technical query, discrepancy, or design question…" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Drawing ref</span>
                <input className="border rounded px-2 py-1.5" value={newDrawingRef} onChange={e => setNewDrawingRef(e.target.value)} placeholder="S-101 Rev B" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Specification ref</span>
                <input className="border rounded px-2 py-1.5" value={newSpecRef} onChange={e => setNewSpecRef(e.target.value)} placeholder="Spec Section 03300 Clause 4.2" />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Contractor's proposed solution (optional)</span>
                <textarea className="border rounded px-2 py-1.5 h-16 resize-y" value={newProposedSolution} onChange={e => setNewProposedSolution(e.target.value)} placeholder="If contractor has a proposed solution, describe it here…" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Contractor ref</span>
                <input className="border rounded px-2 py-1.5" value={newContractorRef} onChange={e => setNewContractorRef(e.target.value)} placeholder="K500-CONT-TQ-013" />
              </label>
            </div>

            {/* Floor flags */}
            <div className="space-y-2 pt-2 border-t border-[#eef2f7]">
              <p className="text-xs font-medium text-[#3d4756]">Technical flags</p>
              <div className="grid grid-cols-2 gap-2">
                <CheckRow
                  label="Structural safety impact"
                  checked={newFloorStructural}
                  onChange={setNewFloorStructural}
                  warningLabel="SIGNATURE: crosses regulator on flag_design_change"
                />
                <CheckRow
                  label="IE notification required"
                  checked={newFloorIe}
                  onChange={setNewFloorIe}
                  warningLabel="Crosses on escalation"
                />
                <CheckRow label="Lender notification required" checked={newFloorLender} onChange={setNewFloorLender} />
                <CheckRow
                  label="NERSA permit condition impacted"
                  checked={newFloorNersa}
                  onChange={setNewFloorNersa}
                  warningLabel="Crosses on issue_response"
                />
                <CheckRow label="Response allows specification deviation" checked={newFloorSpecDev} onChange={setNewFloorSpecDev} />
              </div>
            </div>

            {isSignatureCreate && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                W142 SIGNATURE flag set — flag_design_change will notify regulator on ALL tiers (structural integrity always reportable).
              </div>
            )}

            {/* Cross-refs */}
            <div className="space-y-2 pt-2 border-t border-[#eef2f7]">
              <p className="text-xs font-medium text-[#3d4756]">Cross-references</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[#6b7685]">RFI ref (W116)</span>
                  <input className="border rounded px-2 py-1" value={newRfiRef} onChange={e => setNewRfiRef(e.target.value)} placeholder="RFI-042" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#6b7685]">NCR ref (W136)</span>
                  <input className="border rounded px-2 py-1" value={newNcrRef} onChange={e => setNewNcrRef(e.target.value)} placeholder="NCR-018" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#6b7685]">Method statement ref (W137)</span>
                  <input className="border rounded px-2 py-1" value={newMsRef} onChange={e => setNewMsRef(e.target.value)} placeholder="MS-007" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[#6b7685]">Submittal ref (W115)</span>
                  <input className="border rounded px-2 py-1" value={newSubmittalRef} onChange={e => setNewSubmittalRef(e.target.value)} placeholder="SUB-031" />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-[#eef2f7]">
              <button type="button" className="text-xs border rounded px-3 py-1.5" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="button"
                className="text-xs bg-green-600 text-white rounded px-4 py-1.5 hover:bg-green-700 disabled:opacity-50"
                disabled={createLoading || !newTitle || !newProjectId || !newDescription || !newDiscipline || !newUrgency}
                onClick={handleCreate}
              >
                {createLoading ? 'Creating…' : 'Create technical query'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
