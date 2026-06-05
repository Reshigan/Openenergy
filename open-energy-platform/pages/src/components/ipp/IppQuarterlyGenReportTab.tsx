import { useState, useEffect } from 'react';

interface QgrRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  report_quarter: string;
  project_mw: number;
  project_tier: string;
  mwh_contracted: number | null;
  mwh_actual: number | null;
  availability_pct: number | null;
  capacity_factor_pct: number | null;
  ed_spend_qtd_zar: number | null;
  sed_spend_qtd_zar: number | null;
  chain_status: string;
  sla_due_date: string | null;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface QgrKpis {
  total: number;
  sla_breached: number;
  accepted: number;
  rejected: number;
}

const STATUS_COLORS: Record<string, string> = {
  report_quarter_opened:           'bg-gray-100 text-gray-500',
  operations_data_collection:      'bg-blue-100 text-blue-700',
  environmental_data_compilation:  'bg-cyan-100 text-cyan-700',
  financial_data_compilation:      'bg-indigo-100 text-indigo-700',
  social_indicators_tabulation:    'bg-purple-100 text-purple-700',
  internal_review:                 'bg-yellow-100 text-yellow-800',
  board_approval:                  'bg-orange-100 text-orange-700',
  ipp_office_submission:           'bg-blue-100 text-blue-800',
  acknowledgement_pending:         'bg-yellow-100 text-yellow-700',
  report_accepted:                 'bg-green-100 text-green-700',
  report_rejected:                 'bg-red-100 text-red-700',
  report_lapsed:                   'bg-gray-100 text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  report_quarter_opened:           'Quarter Opened',
  operations_data_collection:      'Operations Data Collection',
  environmental_data_compilation:  'Environmental Data Compilation',
  financial_data_compilation:      'Financial Data Compilation',
  social_indicators_tabulation:    'Social Indicators Tabulation',
  internal_review:                 'Internal Review',
  board_approval:                  'Board Approval',
  ipp_office_submission:           'IPP Office Submission',
  acknowledgement_pending:         'Acknowledgement Pending',
  report_accepted:                 'Report Accepted',
  report_rejected:                 'Report Rejected',
  report_lapsed:                   'Report Lapsed',
};

const ACTION_LABELS: Record<string, string> = {
  commence_operations_collection: 'Commence Operations Collection',
  compile_environmental_data:     'Compile Environmental Data',
  compile_financial_data:         'Compile Financial Data',
  tabulate_social_indicators:     'Tabulate Social Indicators',
  conduct_internal_review:        'Conduct Internal Review',
  obtain_board_approval:          'Obtain Board Approval',
  submit_to_ipp_office:           'Submit to IPP Office',
  confirm_acknowledgement:        'Confirm Acknowledgement',
  accept_report:                  'Accept Report',
  reject_report:                  'Reject Report',
  declare_lapsed:                 'Declare Lapsed',
};

const TIER_COLORS: Record<string, string> = {
  small:    'bg-blue-100 text-blue-800',
  medium:   'bg-yellow-100 text-yellow-800',
  large:    'bg-orange-100 text-orange-800',
  major:    'bg-red-100 text-red-800',
  flagship: 'bg-purple-100 text-purple-800',
};

const HARD_TERMINALS = new Set([
  'report_accepted',
  'report_rejected',
  'report_lapsed',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const PROJECT_TIERS = ['small', 'medium', 'large', 'major', 'flagship'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-gray-700 bg-white';

function fmtDate(dateStr: string | null | undefined): { text: string; isPast: boolean } {
  if (!dateStr) return { text: '—', isPast: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { text: '—', isPast: false };
  const isPast = d < new Date();
  const text = d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  return { text, isPast };
}

function fmtZar(value: number | null | undefined): string {
  if (value == null) return '—';
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMwh(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MWh`;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toLocaleString('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

function fmtMw(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toLocaleString('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} MW`;
}

type KpiChipProps = { label: string; value: string | number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border =
    mode === 'danger' ? 'border-red-200 bg-red-50'       :
    mode === 'alert'  ? 'border-orange-200 bg-orange-50' :
    mode === 'good'   ? 'border-green-200 bg-green-50'   :
    'border-gray-200 bg-white';
  const text =
    mode === 'danger' ? 'text-red-700'    :
    mode === 'alert'  ? 'text-orange-700' :
    mode === 'good'   ? 'text-green-700'  :
    'text-gray-900';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

export function IppQuarterlyGenReportTab() {
  const [items, setItems]               = useState<QgrRecord[]>([]);
  const [kpis, setKpis]                 = useState<QgrKpis | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier]     = useState('');
  const [page, setPage]                 = useState(1);

  // Create form state
  const [showCreate, setShowCreate]               = useState(false);
  const [creating, setCreating]                   = useState(false);
  const [createError, setCreateError]             = useState<string | null>(null);
  const [formProjectRef, setFormProjectRef]       = useState('');
  const [formReportQuarter, setFormReportQuarter] = useState('');
  const [formProjectMw, setFormProjectMw]         = useState('');
  const [formMwhContracted, setFormMwhContracted] = useState('');
  const [formMwhActual, setFormMwhActual]         = useState('');
  const [formAvailabilityPct, setFormAvailabilityPct] = useState('');
  const [formNotes, setFormNotes]                 = useState('');

  // Detail drawer state
  const [detailItem, setDetailItem] = useState<QgrRecord | null>(null);

  // Action modal state
  const [actionItem, setActionItem]         = useState<QgrRecord | null>(null);
  const [selectedAction, setSelectedAction] = useState('');
  const [actionReason, setActionReason]     = useState('');
  const [actionNotes, setActionNotes]       = useState('');
  const [actionLoading, setActionLoading]   = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);

  async function load(
    status = filterStatus,
    tier   = filterTier,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (tier)   params.set('tier', tier);
      const res = await fetch(`/api/ipp-quarterly-gen-reports?${params}`, {
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
  const breached = kpis?.sla_breached ?? items.filter(i => i.sla_breached === 1).length;
  const accepted = kpis?.accepted     ?? items.filter(i => i.chain_status === 'report_accepted').length;
  const rejected = kpis?.rejected     ?? items.filter(i => i.chain_status === 'report_rejected').length;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formReportQuarter.trim() || !formProjectMw) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:    formProjectRef.trim(),
        report_quarter: formReportQuarter.trim(),
        project_mw:     parseFloat(formProjectMw),
      };
      if (formMwhContracted !== '')  body.mwh_contracted  = parseFloat(formMwhContracted);
      if (formMwhActual !== '')      body.mwh_actual       = parseFloat(formMwhActual);
      if (formAvailabilityPct !== '') body.availability_pct = parseFloat(formAvailabilityPct);
      if (formNotes.trim())          body.notes            = formNotes.trim();

      const res = await fetch('/api/ipp-quarterly-gen-reports', {
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
      setFormProjectRef('');
      setFormReportQuarter('');
      setFormProjectMw('');
      setFormMwhContracted('');
      setFormMwhActual('');
      setFormAvailabilityPct('');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function getActions(item: QgrRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    if (HARD_TERMINALS.has(item.chain_status)) return [];
    const base: { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] = [];
    switch (item.chain_status) {
      case 'report_quarter_opened':
        base.push({ name: 'commence_operations_collection', label: ACTION_LABELS.commence_operations_collection });
        break;
      case 'operations_data_collection':
        base.push({ name: 'compile_environmental_data', label: ACTION_LABELS.compile_environmental_data });
        break;
      case 'environmental_data_compilation':
        base.push({ name: 'compile_financial_data', label: ACTION_LABELS.compile_financial_data });
        break;
      case 'financial_data_compilation':
        base.push({ name: 'tabulate_social_indicators', label: ACTION_LABELS.tabulate_social_indicators });
        break;
      case 'social_indicators_tabulation':
        base.push({ name: 'conduct_internal_review', label: ACTION_LABELS.conduct_internal_review });
        break;
      case 'internal_review':
        base.push({ name: 'obtain_board_approval', label: ACTION_LABELS.obtain_board_approval });
        break;
      case 'board_approval':
        base.push({ name: 'submit_to_ipp_office', label: ACTION_LABELS.submit_to_ipp_office, variant: 'success' });
        break;
      case 'ipp_office_submission':
        base.push({ name: 'confirm_acknowledgement', label: ACTION_LABELS.confirm_acknowledgement });
        break;
      case 'acknowledgement_pending':
        base.push({ name: 'accept_report',  label: ACTION_LABELS.accept_report,  variant: 'success' });
        base.push({ name: 'reject_report',  label: ACTION_LABELS.reject_report,  variant: 'danger' });
        break;
      default:
        break;
    }
    base.push({ name: 'declare_lapsed', label: ACTION_LABELS.declare_lapsed, variant: 'warn' });
    return base;
  }

  function openActionPicker(item: QgrRecord) {
    const actions = getActions(item);
    if (actions.length === 0) return;
    const first = actions[0];
    setActionItem(item);
    setSelectedAction(first.name);
    setActionReason('');
    setActionNotes('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setSelectedAction('');
    setActionReason('');
    setActionNotes('');
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

      const res = await fetch(`/api/ipp-quarterly-gen-reports/${actionItem.id}/action`, {
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

  const modalActions      = actionItem ? getActions(actionItem) : [];
  const actionLabelCurrent = modalActions.find(a => a.name === selectedAction)?.label ?? 'Confirm';

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total Reports"  value={total} />
        <KpiChip label="SLA Breached"   value={breached} mode={breached > 0 ? 'danger'  : 'neutral'} />
        <KpiChip label="Accepted"       value={accepted} mode={accepted > 0 ? 'good'    : 'neutral'} />
        <KpiChip label="Rejected"       value={rejected} mode={rejected > 0 ? 'alert'   : 'neutral'} />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier); }}
          className={sel}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select
          value={filterTier}
          onChange={e => { setFilterTier(e.target.value); load(filterStatus, e.target.value); }}
          className={sel}
        >
          <option value="">All tiers</option>
          {PROJECT_TIERS.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <button
          onClick={() => load()}
          className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs border border-gray-200 hover:bg-gray-200"
        >
          Refresh
        </button>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="ml-auto px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
        >
          + New Report
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3"
        >
          <div className="text-sm font-semibold text-blue-800">New DMRE Quarterly Generation Report</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Project Ref *</label>
              <input
                type="text"
                value={formProjectRef}
                onChange={e => setFormProjectRef(e.target.value)}
                placeholder="PROJ-001"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Report Quarter *</label>
              <input
                type="text"
                value={formReportQuarter}
                onChange={e => setFormReportQuarter(e.target.value)}
                placeholder="2026-Q1"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Project MW *</label>
              <input
                type="number"
                value={formProjectMw}
                onChange={e => setFormProjectMw(e.target.value)}
                min={0}
                step={0.01}
                placeholder="100"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">MWh Contracted (optional)</label>
              <input
                type="number"
                value={formMwhContracted}
                onChange={e => setFormMwhContracted(e.target.value)}
                min={0}
                step={1}
                placeholder="250000"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">MWh Actual (optional)</label>
              <input
                type="number"
                value={formMwhActual}
                onChange={e => setFormMwhActual(e.target.value)}
                min={0}
                step={1}
                placeholder="241000"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Availability % (optional)</label>
              <input
                type="number"
                value={formAvailabilityPct}
                onChange={e => setFormAvailabilityPct(e.target.value)}
                min={0}
                max={100}
                step={0.01}
                placeholder="96.5"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">Notes (optional)</label>
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
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 bg-white border rounded text-xs text-gray-600 hover:bg-gray-50"
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
        <div className="text-sm text-gray-400 py-8 text-center">Loading&hellip;</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-2 pr-3">Quarter</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Project MW</th>
                <th className="pb-2 pr-3">Tier</th>
                <th className="pb-2 pr-3">MWh Contracted</th>
                <th className="pb-2 pr-3">MWh Actual</th>
                <th className="pb-2 pr-3">Availability %</th>
                <th className="pb-2 pr-3">SLA Deadline</th>
                <th className="pb-2 pr-3">SLA Breached</th>
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
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setDetailItem(item)}
                  >
                    <td className="py-2 pr-3 text-xs font-mono text-gray-700">{item.report_quarter}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-gray-700">{fmtMw(item.project_mw)}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[item.project_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                        {item.project_tier.charAt(0).toUpperCase() + item.project_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-gray-600">{fmtMwh(item.mwh_contracted)}</td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-gray-600">{fmtMwh(item.mwh_actual)}</td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-gray-600">{fmtPct(item.availability_pct)}</td>
                    <td className="py-2 pr-3 text-xs tabular-nums">
                      <span className={due.isPast ? 'text-red-600 font-medium' : 'text-gray-600'}>
                        {due.text}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {item.sla_breached === 1 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">Yes</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400">No</span>
                      )}
                    </td>
                    <td
                      className="py-2 pr-3"
                      onClick={e => e.stopPropagation()}
                    >
                      {actions.length > 0 && (
                        <button
                          onClick={() => openActionPicker(item)}
                          className="px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
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
                  <td colSpan={10} className="py-10 text-center text-gray-400 text-sm">
                    No quarterly generation reports found
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
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-50"
          >
            &larr; Prev
          </button>
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-50"
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
                <div className="text-sm font-semibold text-gray-800">
                  DMRE Quarterly Report — {detailItem.report_quarter}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{detailItem.project_ref}</div>
              </div>
              <button
                onClick={() => setDetailItem(null)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 p-5 space-y-5">
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[detailItem.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABELS[detailItem.chain_status] ?? detailItem.chain_status.replace(/_/g, ' ')}
                </span>
                {detailItem.sla_breached === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">SLA Breached</span>
                )}
              </div>

              {/* Grid details */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div>
                  <div className="text-gray-400 mb-0.5">Project Ref</div>
                  <div className="font-mono text-gray-800">{detailItem.project_ref}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Report Quarter</div>
                  <div className="text-gray-800">{detailItem.report_quarter}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Project MW</div>
                  <div className="text-gray-800">{fmtMw(detailItem.project_mw)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Tier</div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[detailItem.project_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                    {detailItem.project_tier.charAt(0).toUpperCase() + detailItem.project_tier.slice(1)}
                  </span>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">MWh Contracted</div>
                  <div className="tabular-nums text-gray-800">{fmtMwh(detailItem.mwh_contracted)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">MWh Actual</div>
                  <div className="tabular-nums text-gray-800">{fmtMwh(detailItem.mwh_actual)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Availability %</div>
                  <div className="tabular-nums text-gray-800">{fmtPct(detailItem.availability_pct)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Capacity Factor %</div>
                  <div className="tabular-nums text-gray-800">{fmtPct(detailItem.capacity_factor_pct)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">ED Spend QTD (ZAR)</div>
                  <div className="tabular-nums text-gray-800">{fmtZar(detailItem.ed_spend_qtd_zar)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">SED Spend QTD (ZAR)</div>
                  <div className="tabular-nums text-gray-800">{fmtZar(detailItem.sed_spend_qtd_zar)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">SLA Deadline</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.sla_due_date).isPast ? 'text-red-600 font-medium' : 'text-gray-800'}`}>
                    {fmtDate(detailItem.sla_due_date).text}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Created</div>
                  <div className="text-gray-600">{fmtDate(detailItem.created_at).text}</div>
                </div>
              </div>

              {/* Notes */}
              {detailItem.notes && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Notes</div>
                  <div className="text-xs text-gray-700 bg-gray-50 rounded p-2 border whitespace-pre-wrap">
                    {detailItem.notes}
                  </div>
                </div>
              )}

              {/* Actions section */}
              {!HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Advance State Machine</div>
                  <button
                    onClick={() => {
                      setDetailItem(null);
                      openActionPicker(detailItem);
                    }}
                    className="px-4 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Open Action Picker
                  </button>
                </div>
              )}

              {HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs text-gray-400 italic">
                    This report is in a terminal state — no further actions are available.
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
            <div className="text-sm font-semibold text-gray-800 mb-1">DMRE Quarterly Report Action</div>
            <div className="text-xs text-gray-500 mb-4">
              {actionItem.project_ref} &mdash; {actionItem.report_quarter} &mdash;{' '}
              {STATUS_LABELS[actionItem.chain_status] ?? actionItem.chain_status}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Action *</label>
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

            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="Brief reason or reference"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Notes (optional)</label>
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
              <button
                onClick={closeAction}
                className="px-3 py-1.5 text-xs border rounded bg-white text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitAction}
                disabled={actionLoading || !selectedAction}
                className="px-4 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
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

export default IppQuarterlyGenReportTab;
