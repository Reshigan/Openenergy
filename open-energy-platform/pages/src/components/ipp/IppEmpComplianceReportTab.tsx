import { useState, useEffect } from 'react';

interface EmpRecord {
  id: string;
  participant_id: string;
  project_name: string | null;
  report_year: number;
  plant_mw: number | null;
  eco_name: string | null;
  incident_count: number;
  mitigation_status: string | null;
  tier: string;
  chain_status: string;
  sla_due_date: string | null;
  sla_breached: number;
  regulator_notified: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface EmpKpis {
  total: number;
  active: number;
  sla_breached: number;
  accepted: number;
  rejected: number;
  lapsed: number;
}

const STATUS_COLORS: Record<string, string> = {
  report_period_opened:            'bg-[#eef2f7] text-[#3d4756]',
  eco_data_collection:             'bg-[#eef2f7] text-[#3d4756]',
  monitoring_results_compilation:  'bg-cyan-100 text-cyan-700',
  incident_review:                 'bg-amber-100 text-amber-700',
  draft_report_preparation:        'bg-purple-100 text-purple-700',
  internal_review:                 'bg-[#e8ecf0] text-[#3d4756]',
  eco_sign_off:                    'bg-teal-100 text-teal-700',
  competent_authority_submission:  'bg-orange-100 text-orange-700',
  ca_review_in_progress:           'bg-yellow-100 text-yellow-800',
  report_accepted:                 'bg-green-100 text-green-700',
  report_rejected:                 'bg-red-100 text-red-700',
  report_lapsed:                   'bg-[#eef2f7] text-[#9aa5b4]',
};

const STATUS_LABELS: Record<string, string> = {
  report_period_opened:            'Report Period Opened',
  eco_data_collection:             'ECO Data Collection',
  monitoring_results_compilation:  'Monitoring Results Compilation',
  incident_review:                 'Incident Review',
  draft_report_preparation:        'Draft Report Preparation',
  internal_review:                 'Internal Review',
  eco_sign_off:                    'ECO Sign-off',
  competent_authority_submission:  'Competent Authority Submission',
  ca_review_in_progress:           'CA Review In Progress',
  report_accepted:                 'Report Accepted',
  report_rejected:                 'Report Rejected',
  report_lapsed:                   'Report Lapsed',
};

const MITIGATION_COLORS: Record<string, string> = {
  on_track:   'bg-green-100 text-green-700',
  delayed:    'bg-amber-100 text-amber-700',
  remediated: 'bg-[#eef2f7] text-[#3d4756]',
  escalated:  'bg-red-100 text-red-700',
};

const ACTION_LABELS: Record<string, string> = {
  commence_eco_data_collection:     'Commence ECO Data Collection',
  compile_monitoring_results:       'Compile Monitoring Results',
  conduct_incident_review:          'Conduct Incident Review',
  prepare_draft_report:             'Prepare Draft Report',
  complete_internal_review:         'Complete Internal Review',
  obtain_eco_sign_off:              'Obtain ECO Sign-off',
  submit_to_competent_authority:    'Submit to Competent Authority',
  commence_ca_review:               'Commence CA Review',
  accept_report:                    'Accept Report',
  reject_report:                    'Reject Report',
  declare_lapsed:                   'Declare Lapsed',
};

const TIER_COLORS: Record<string, string> = {
  small:    'bg-[#eef2f7] text-[#3d4756]',
  medium:   'bg-[#eef2f7] text-[#3d4756]',
  large:    'bg-[#e8ecf0] text-[#3d4756]',
  major:    'bg-purple-100 text-purple-700',
  flagship: 'bg-amber-100 text-amber-700',
};

const HARD_TERMINALS = new Set([
  'report_accepted',
  'report_rejected',
  'report_lapsed',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS = ['small', 'medium', 'large', 'major', 'flagship'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';

function fmtDate(dateStr: string | null | undefined): { text: string; isPast: boolean } {
  if (!dateStr) return { text: '—', isPast: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { text: '—', isPast: false };
  const isPast = d < new Date();
  const text = d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  return { text, isPast };
}

type KpiChipProps = { label: string; value: string | number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border =
    mode === 'danger' ? 'border-red-200 bg-red-50'       :
    mode === 'alert'  ? 'border-orange-200 bg-orange-50' :
    mode === 'good'   ? 'border-green-200 bg-green-50'   :
    'border-[#dde4ec] bg-white';
  const text =
    mode === 'danger' ? 'text-red-700'    :
    mode === 'alert'  ? 'text-orange-700' :
    mode === 'good'   ? 'text-green-700'  :
    'text-[#0f1c2e]';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-[#6b7685]">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

interface ActionDef {
  name: string;
  label: string;
  variant?: 'danger' | 'warn' | 'success';
}

function getActions(item: EmpRecord): ActionDef[] {
  if (HARD_TERMINALS.has(item.chain_status)) return [];
  const base: ActionDef[] = [];
  switch (item.chain_status) {
    case 'report_period_opened':
      base.push({ name: 'commence_eco_data_collection', label: ACTION_LABELS.commence_eco_data_collection });
      break;
    case 'eco_data_collection':
      base.push({ name: 'compile_monitoring_results', label: ACTION_LABELS.compile_monitoring_results });
      break;
    case 'monitoring_results_compilation':
      base.push({ name: 'conduct_incident_review', label: ACTION_LABELS.conduct_incident_review });
      break;
    case 'incident_review':
      base.push({ name: 'prepare_draft_report', label: ACTION_LABELS.prepare_draft_report });
      break;
    case 'draft_report_preparation':
      base.push({ name: 'complete_internal_review', label: ACTION_LABELS.complete_internal_review });
      break;
    case 'internal_review':
      base.push({ name: 'obtain_eco_sign_off', label: ACTION_LABELS.obtain_eco_sign_off });
      break;
    case 'eco_sign_off':
      base.push({ name: 'submit_to_competent_authority', label: ACTION_LABELS.submit_to_competent_authority, variant: 'success' });
      break;
    case 'competent_authority_submission':
      base.push({ name: 'commence_ca_review', label: ACTION_LABELS.commence_ca_review });
      break;
    case 'ca_review_in_progress':
      base.push({ name: 'accept_report', label: ACTION_LABELS.accept_report, variant: 'success' });
      base.push({ name: 'reject_report', label: ACTION_LABELS.reject_report, variant: 'danger' });
      break;
    default:
      break;
  }
  base.push({ name: 'declare_lapsed', label: ACTION_LABELS.declare_lapsed, variant: 'warn' });
  return base;
}

export function IppEmpComplianceReportTab() {
  const [items, setItems]                     = useState<EmpRecord[]>([]);
  const [kpis, setKpis]                       = useState<EmpKpis | null>(null);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [filterStatus, setFilterStatus]       = useState('');
  const [filterTier, setFilterTier]           = useState('');
  const [filterSlaBreached, setFilterSlaBreached] = useState(false);
  const [page, setPage]                       = useState(1);

  // Create form state
  const [showCreate, setShowCreate]           = useState(false);
  const [creating, setCreating]               = useState(false);
  const [createError, setCreateError]         = useState<string | null>(null);
  const [formProjectName, setFormProjectName] = useState('');
  const [formReportYear, setFormReportYear]   = useState(String(new Date().getFullYear()));
  const [formPlantMw, setFormPlantMw]         = useState('');
  const [formEcoName, setFormEcoName]         = useState('');
  const [formNotes, setFormNotes]             = useState('');

  // Detail drawer state
  const [detailItem, setDetailItem] = useState<EmpRecord | null>(null);

  // Action modal state
  const [actionItem, setActionItem]             = useState<EmpRecord | null>(null);
  const [selectedAction, setSelectedAction]     = useState('');
  const [actionReason, setActionReason]         = useState('');
  const [actionNotes, setActionNotes]           = useState('');
  const [actionIncidentCount, setActionIncidentCount] = useState('');
  const [actionEcoName, setActionEcoName]       = useState('');
  const [actionLoading, setActionLoading]       = useState(false);
  const [actionError, setActionError]           = useState<string | null>(null);

  async function load(
    status      = filterStatus,
    tier        = filterTier,
    slaBreached = filterSlaBreached,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status)      params.set('status', status);
      if (tier)        params.set('tier', tier);
      if (slaBreached) params.set('sla_breached', '1');
      const res = await fetch(`/api/ipp-emp-compliance-reports?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const d = json?.data ?? json;
      setItems(d?.items ?? d ?? []);
      if (d?.kpis) setKpis(d.kpis);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const total    = kpis?.total        ?? items.length;
  const active   = kpis?.active       ?? items.filter(i => !HARD_TERMINALS.has(i.chain_status)).length;
  const breached = kpis?.sla_breached ?? items.filter(i => i.sla_breached === 1).length;
  const accepted = kpis?.accepted     ?? items.filter(i => i.chain_status === 'report_accepted').length;
  const rejected = kpis?.rejected     ?? items.filter(i => i.chain_status === 'report_rejected').length;
  const lapsed   = kpis?.lapsed       ?? items.filter(i => i.chain_status === 'report_lapsed').length;

  const terminalSummary = `${accepted}A / ${rejected}R / ${lapsed}L`;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectName.trim() || !formReportYear) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_name: formProjectName.trim(),
        report_year:  parseInt(formReportYear, 10),
      };
      if (formPlantMw.trim())  body.plant_mw  = parseFloat(formPlantMw);
      if (formEcoName.trim())  body.eco_name  = formEcoName.trim();
      if (formNotes.trim())    body.notes     = formNotes.trim();

      const res = await fetch('/api/ipp-emp-compliance-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      setShowCreate(false);
      setFormProjectName('');
      setFormReportYear(String(new Date().getFullYear()));
      setFormPlantMw('');
      setFormEcoName('');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openActionPicker(item: EmpRecord) {
    const actions = getActions(item);
    if (actions.length === 0) return;
    const first = actions[0];
    setActionItem(item);
    setSelectedAction(first.name);
    setActionReason('');
    setActionNotes('');
    setActionIncidentCount('');
    setActionEcoName('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setSelectedAction('');
    setActionReason('');
    setActionNotes('');
    setActionIncidentCount('');
    setActionEcoName('');
    setActionError(null);
  }

  async function submitAction() {
    if (!actionItem || !selectedAction) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { action: selectedAction };
      if (actionReason.trim()) body.reason = actionReason.trim();
      if (actionNotes.trim())  body.notes  = actionNotes.trim();
      if (selectedAction === 'conduct_incident_review' && actionIncidentCount.trim()) {
        body.incident_count = parseInt(actionIncidentCount, 10);
      }
      if (selectedAction === 'obtain_eco_sign_off' && actionEcoName.trim()) {
        body.eco_name = actionEcoName.trim();
      }

      const res = await fetch(`/api/ipp-emp-compliance-reports/${actionItem.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      closeAction();
      if (detailItem?.id === actionItem.id) setDetailItem(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  const modalActions       = actionItem ? getActions(actionItem) : [];
  const actionLabelCurrent = modalActions.find(a => a.name === selectedAction)?.label ?? 'Confirm';

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total"        value={total} />
        <KpiChip label="Active"       value={active} />
        <KpiChip label="SLA Breached" value={breached}       mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Accepted / Rejected / Lapsed" value={terminalSummary} mode={rejected > 0 || lapsed > 0 ? 'alert' : accepted > 0 ? 'good' : 'neutral'} />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier, filterSlaBreached); }}
          className={sel}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select
          value={filterTier}
          onChange={e => { setFilterTier(e.target.value); load(filterStatus, e.target.value, filterSlaBreached); }}
          className={sel}
        >
          <option value="">All tiers</option>
          {TIERS.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[#2d3748] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterSlaBreached}
            onChange={e => { setFilterSlaBreached(e.target.checked); load(filterStatus, filterTier, e.target.checked); }}
            className="accent-red-600"
          />
          SLA Breached only
        </label>
        <button type="button"
          onClick={() => load()}
          className="px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border border-[#dde4ec] hover:bg-[#e8ecf0]"
        >
          Refresh
        </button>
        <button type="button"
          onClick={() => setShowCreate(v => !v)}
          className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]"
        >
          + New EMP Report
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'oklch(0.87 0.010 250)', background: 'oklch(0.94 0.006 250)' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>New EMP Annual Compliance Report</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Project Name *</label>
              <input
                type="text"
                value={formProjectName}
                onChange={e => setFormProjectName(e.target.value)}
                placeholder="e.g. Sere Wind Farm"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Report Year *</label>
              <input
                type="number"
                value={formReportYear}
                onChange={e => setFormReportYear(e.target.value)}
                min={2000}
                max={2100}
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Plant Capacity (MW)</label>
              <input
                type="number"
                value={formPlantMw}
                onChange={e => setFormPlantMw(e.target.value)}
                min={0}
                step={0.1}
                placeholder="e.g. 100.5"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className="block text-xs text-[#3d4756] mb-1">ECO Name</label>
              <input
                type="text"
                value={formEcoName}
                onChange={e => setFormEcoName(e.target.value)}
                placeholder="Environmental Control Officer name"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs text-[#3d4756] mb-1">Notes (optional)</label>
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
          </div>
          {createError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              {createError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-1.5 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f] disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 bg-white border rounded text-xs text-[#3d4756] hover:bg-[#eef2f7]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-sm text-[#9aa5b4] py-8 text-center">Loading&hellip;</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[#6b7685]">
                <th className="pb-2 pr-3">Project Name</th>
                <th className="pb-2 pr-3">Year</th>
                <th className="pb-2 pr-3">Plant MW</th>
                <th className="pb-2 pr-3">ECO Name</th>
                <th className="pb-2 pr-3">Incidents</th>
                <th className="pb-2 pr-3">Mitigation Status</th>
                <th className="pb-2 pr-3">Chain Status</th>
                <th className="pb-2 pr-3">Tier</th>
                <th className="pb-2 pr-3">SLA Deadline</th>
                <th className="pb-2 pr-3">Reg. Notified</th>
                <th className="pb-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions = getActions(item);
                const due     = fmtDate(item.sla_due_date);
                return (
                  <tr
                    key={item.id}
                    className="border-b hover:bg-[#eef2f7] cursor-pointer"
                    onClick={() => setDetailItem(item)}
                  >
                    <td className="py-2 pr-3 text-xs font-medium text-[#1e2a38] max-w-[160px] truncate" title={item.project_name ?? ''}>
                      {item.project_name ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[#2d3748]">{item.report_year}</td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[#2d3748]">
                      {item.plant_mw != null ? `${item.plant_mw} MW` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[#2d3748] max-w-[120px] truncate" title={item.eco_name ?? ''}>
                      {item.eco_name ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[#2d3748]">
                      {item.incident_count > 0 ? (
                        <span className="font-semibold text-amber-700">{item.incident_count}</span>
                      ) : (
                        <span className="text-[#9aa5b4]">0</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {item.mitigation_status ? (
                        <span className={`px-2 py-0.5 rounded text-xs ${MITIGATION_COLORS[item.mitigation_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                          {item.mitigation_status.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-[#9aa5b4] text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[item.tier] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {item.tier.charAt(0).toUpperCase() + item.tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums">
                      <span className={due.isPast ? 'text-red-600 font-medium' : 'text-[#3d4756]'}>
                        {due.text}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      {item.regulator_notified === 1 ? (
                        <span title="Regulator notified" className="text-orange-500 text-base leading-none">&#9873;</span>
                      ) : (
                        <span className="text-[#9aa5b4] text-base leading-none">&#9873;</span>
                      )}
                    </td>
                    <td
                      className="py-2 pr-3"
                      onClick={e => e.stopPropagation()}
                    >
                      {actions.length > 0 && (
                        <button type="button"
                          onClick={() => openActionPicker(item)}
                          className="px-2 py-0.5 text-xs rounded border"
                          style={{ background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)', borderColor: 'oklch(0.87 0.010 250)' }}
                        >
                          Actions
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No EMP compliance report records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 pt-1">
          <button type="button"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[#eef2f7]"
          >
            &larr; Prev
          </button>
          <span className="text-xs text-[#6b7685]">
            Page {page} of {totalPages}
          </span>
          <button type="button"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[#eef2f7]"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Detail drawer */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30">
          <div className="bg-white h-full w-full max-w-lg shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="text-sm font-semibold text-[#1e2a38]">
                  EMP Compliance Report — {detailItem.project_name ?? 'Unnamed Project'}
                </div>
                <div className="text-xs text-[#6b7685] mt-0.5">
                  {detailItem.report_year} &nbsp;&middot;&nbsp; ECO: {detailItem.eco_name ?? 'TBC'}
                </div>
              </div>
              <button type="button"
                onClick={() => setDetailItem(null)}
                className="text-[#9aa5b4] hover:text-[#2d3748] text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 p-5 space-y-5">
              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[detailItem.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                  {STATUS_LABELS[detailItem.chain_status] ?? detailItem.chain_status.replace(/_/g, ' ')}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[detailItem.tier] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                  {detailItem.tier.charAt(0).toUpperCase() + detailItem.tier.slice(1)}
                </span>
                {detailItem.sla_breached === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">SLA Breached</span>
                )}
                {detailItem.regulator_notified === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-semibold">Regulator Notified</span>
                )}
              </div>

              {/* Core details */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Project Name</div>
                  <div className="font-medium text-[#1e2a38]">{detailItem.project_name ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Report Year</div>
                  <div className="tabular-nums text-[#1e2a38]">{detailItem.report_year}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Plant Capacity</div>
                  <div className="tabular-nums text-[#1e2a38]">
                    {detailItem.plant_mw != null ? `${detailItem.plant_mw} MW` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">ECO Name</div>
                  <div className="text-[#1e2a38]">{detailItem.eco_name ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Incident Count</div>
                  <div className={`tabular-nums font-semibold ${detailItem.incident_count > 0 ? 'text-amber-700' : 'text-[#1e2a38]'}`}>
                    {detailItem.incident_count}
                  </div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Mitigation Status</div>
                  <div>
                    {detailItem.mitigation_status ? (
                      <span className={`px-2 py-0.5 rounded text-xs ${MITIGATION_COLORS[detailItem.mitigation_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {detailItem.mitigation_status.replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="text-[#9aa5b4]">—</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">SLA Deadline</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.sla_due_date).isPast ? 'text-red-600 font-medium' : 'text-[#1e2a38]'}`}>
                    {fmtDate(detailItem.sla_due_date).text}
                  </div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Regulator Notified</div>
                  <div className={detailItem.regulator_notified === 1 ? 'text-orange-600 font-medium' : 'text-[#9aa5b4]'}>
                    {detailItem.regulator_notified === 1 ? 'Yes' : 'No'}
                  </div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Created</div>
                  <div className="text-[#3d4756]">{fmtDate(detailItem.created_at).text}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Updated</div>
                  <div className="text-[#3d4756]">{fmtDate(detailItem.updated_at).text}</div>
                </div>
              </div>

              {/* Notes */}
              {detailItem.notes && (
                <div>
                  <div className="text-xs text-[#9aa5b4] mb-1">Notes</div>
                  <div className="text-xs text-[#2d3748] bg-[#f8fafc] rounded p-2 border whitespace-pre-wrap">
                    {detailItem.notes}
                  </div>
                </div>
              )}

              {/* Actions section */}
              {!HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs font-semibold text-[#2d3748] mb-2">Advance State Machine</div>
                  <button type="button"
                    onClick={() => {
                      setDetailItem(null);
                      openActionPicker(detailItem);
                    }}
                    className="px-4 py-1.5 text-xs rounded bg-[#c2873a] text-white hover:bg-[#a3702f]"
                  >
                    Open Action Picker
                  </button>
                </div>
              )}

              {HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs text-[#9aa5b4] italic">
                    This compliance report is in a terminal state — no further actions are available.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action modal */}
      {actionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-[#1e2a38] mb-1">EMP Compliance Report Action</div>
            <div className="text-xs text-[#6b7685] mb-4">
              {actionItem.project_name ?? 'Unnamed'} &mdash; {actionItem.report_year} &mdash;{' '}
              {STATUS_LABELS[actionItem.chain_status] ?? actionItem.chain_status}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-[#3d4756] mb-1">Action *</label>
              <select
                value={selectedAction}
                onChange={e => setSelectedAction(e.target.value)}
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {modalActions.map(a => (
                  <option key={a.name} value={a.name}>{a.label}</option>
                ))}
              </select>
            </div>

            {/* Incident count input — only for conduct_incident_review */}
            {selectedAction === 'conduct_incident_review' && (
              <div className="mb-3">
                <label className="block text-xs text-[#3d4756] mb-1">Incident Count</label>
                <input
                  type="number"
                  value={actionIncidentCount}
                  onChange={e => setActionIncidentCount(e.target.value)}
                  min={0}
                  placeholder="Number of environmental incidents"
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </div>
            )}

            {/* ECO name input — only for obtain_eco_sign_off */}
            {selectedAction === 'obtain_eco_sign_off' && (
              <div className="mb-3">
                <label className="block text-xs text-[#3d4756] mb-1">ECO Name</label>
                <input
                  type="text"
                  value={actionEcoName}
                  onChange={e => setActionEcoName(e.target.value)}
                  placeholder="Environmental Control Officer name"
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs text-[#3d4756] mb-1">Reason (optional)</label>
              <input
                type="text"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="Brief reason or reference"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs text-[#3d4756] mb-1">Notes (optional)</label>
              <textarea
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                rows={3}
                placeholder="Additional remarks"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>

            {actionError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 mb-3">
                {actionError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button type="button"
                onClick={closeAction}
                className="px-3 py-1.5 text-xs border rounded bg-white text-[#3d4756] hover:bg-[#eef2f7]"
              >
                Cancel
              </button>
              <button type="button"
                onClick={submitAction}
                disabled={actionLoading || !selectedAction}
                className="px-4 py-1.5 text-xs rounded bg-[#c2873a] text-white hover:bg-[#a3702f] disabled:opacity-50"
              >
                {actionLoading ? 'Submitting…' : actionLabelCurrent}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IppEmpComplianceReportTab;
