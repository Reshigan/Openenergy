import { useState, useEffect } from 'react';

interface ReippppReportRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  reipppp_bid_ref: string | null;
  report_period: string;
  project_mw: number;
  capacity_tier: 'small' | 'medium' | 'large' | 'major' | 'flagship';
  report_type: string;
  local_content_pct: number | null;
  ed_spend_zar: number | null;
  jobs_direct: number | null;
  chain_status: string;
  sla_due_date: string | null;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ReippppReportKpis {
  total: number;
  active: number;
  sla_breached: number;
  accepted_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  report_cycle_opened:        'bg-[#eef2f7] text-[#6b7685]',
  data_collection:            'bg-blue-100 text-blue-700',
  local_content_verification: 'bg-blue-100 text-blue-700',
  ed_spend_reconciliation:    'bg-yellow-100 text-yellow-800',
  job_creation_tabulation:    'bg-yellow-100 text-yellow-800',
  internal_review:            'bg-orange-100 text-orange-700',
  board_approval:             'bg-orange-100 text-orange-700',
  ipp_office_submission:      'bg-purple-100 text-purple-700',
  acknowledgement_pending:    'bg-purple-100 text-purple-700',
  report_accepted:            'bg-green-100 text-green-700',
  report_rejected:            'bg-red-100 text-red-700',
  report_lapsed:              'bg-[#eef2f7] text-[#6b7685]',
};

const STATUS_LABELS: Record<string, string> = {
  report_cycle_opened:        'Report Cycle Opened',
  data_collection:            'Data Collection',
  local_content_verification: 'Local Content Verification',
  ed_spend_reconciliation:    'ED Spend Reconciliation',
  job_creation_tabulation:    'Job Creation Tabulation',
  internal_review:            'Internal Review',
  board_approval:             'Board Approval',
  ipp_office_submission:      'IPP Office Submission',
  acknowledgement_pending:    'Acknowledgement Pending',
  report_accepted:            'Report Accepted',
  report_rejected:            'Report Rejected',
  report_lapsed:              'Report Lapsed',
};

const CAPACITY_TIER_COLORS: Record<string, string> = {
  small:    'bg-[#eef2f7] text-[#2d3748]',
  medium:   'bg-blue-100 text-blue-800',
  large:    'bg-yellow-100 text-yellow-800',
  major:    'bg-orange-100 text-orange-800',
  flagship: 'bg-red-100 text-red-800',
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  annual_operational:   'Annual Operational',
  annual_construction:  'Annual Construction',
  final_construction:   'Final Construction',
  remediation_report:   'Remediation Report',
};

const TERMINAL_STATUSES = new Set([
  'report_accepted',
  'report_rejected',
  'report_lapsed',
]);

const STATUSES      = Object.keys(STATUS_LABELS);
const REPORT_TYPES  = Object.keys(REPORT_TYPE_LABELS);
const CAPACITY_TIERS = ['small', 'medium', 'large', 'major', 'flagship'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';

function fmtDate(dateStr: string | null | undefined): { text: string; isPast: boolean } {
  if (!dateStr) return { text: '—', isPast: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { text: '—', isPast: false };
  const now = new Date();
  const isPast = d < now;
  const text = d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  return { text, isPast };
}

function fmtMw(mw: number): string {
  return `${mw.toLocaleString('en-ZA')} MW`;
}

function fmtZar(value: number | null | undefined): string {
  if (value == null) return '—';
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toLocaleString('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
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

export function IppReippppReportsTab() {
  const [items, setItems]               = useState<ReippppReportRecord[]>([]);
  const [kpis, setKpis]                 = useState<ReippppReportKpis | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier]     = useState('');
  const [page, setPage]                 = useState(1);

  // Create form state
  const [showCreate, setShowCreate]                         = useState(false);
  const [creating, setCreating]                             = useState(false);
  const [createError, setCreateError]                       = useState<string | null>(null);
  const [formProjectRef, setFormProjectRef]                 = useState('');
  const [formBidRef, setFormBidRef]                         = useState('');
  const [formReportPeriod, setFormReportPeriod]             = useState('');
  const [formProjectMw, setFormProjectMw]                   = useState('');
  const [formReportType, setFormReportType]                 = useState('annual_operational');
  const [formLocalContentPct, setFormLocalContentPct]       = useState('');
  const [formEdSpendZar, setFormEdSpendZar]                 = useState('');
  const [formJobsDirect, setFormJobsDirect]                 = useState('');
  const [formNotes, setFormNotes]                           = useState('');

  // Action modal state
  const [actionItem, setActionItem]       = useState<ReippppReportRecord | null>(null);
  const [actionName, setActionName]       = useState('');
  const [actionLabel, setActionLabel]     = useState('');
  const [actionReason, setActionReason]   = useState('');
  const [actionNotes, setActionNotes]     = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError]     = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState('');

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
      const res = await fetch(`/api/ipp-reipppp-reports?${params}`, {
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

  const total         = kpis?.total          ?? items.length;
  const active        = kpis?.active         ?? items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached      = kpis?.sla_breached   ?? items.filter(i => i.sla_breached === 1).length;
  const acceptedCount = kpis?.accepted_count ?? items.filter(i => i.chain_status === 'report_accepted').length;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formReportPeriod.trim() || !formProjectMw) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:    formProjectRef.trim(),
        report_period:  formReportPeriod.trim(),
        project_mw:     parseFloat(formProjectMw),
        report_type:    formReportType,
      };
      if (formBidRef.trim())          body.reipppp_bid_ref    = formBidRef.trim();
      if (formLocalContentPct !== '') body.local_content_pct  = parseFloat(formLocalContentPct);
      if (formEdSpendZar !== '')      body.ed_spend_zar       = parseFloat(formEdSpendZar);
      if (formJobsDirect !== '')      body.jobs_direct        = parseInt(formJobsDirect, 10);
      if (formNotes.trim())           body.notes              = formNotes.trim();

      const res = await fetch('/api/ipp-reipppp-reports', {
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
      setFormBidRef('');
      setFormReportPeriod('');
      setFormProjectMw('');
      setFormReportType('annual_operational');
      setFormLocalContentPct('');
      setFormEdSpendZar('');
      setFormJobsDirect('');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function getActions(item: ReippppReportRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    if (TERMINAL_STATUSES.has(item.chain_status)) return [];
    const base: { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] = [];
    switch (item.chain_status) {
      case 'report_cycle_opened':
        base.push({ name: 'commence_data_collection', label: 'Commence Data Collection' });
        break;
      case 'data_collection':
        base.push({ name: 'verify_local_content', label: 'Verify Local Content' });
        break;
      case 'local_content_verification':
        base.push({ name: 'reconcile_ed_spend', label: 'Reconcile ED Spend' });
        break;
      case 'ed_spend_reconciliation':
        base.push({ name: 'tabulate_jobs', label: 'Tabulate Jobs' });
        break;
      case 'job_creation_tabulation':
        base.push({ name: 'conduct_internal_review', label: 'Conduct Internal Review' });
        break;
      case 'internal_review':
        base.push({ name: 'obtain_board_approval', label: 'Obtain Board Approval' });
        break;
      case 'board_approval':
        base.push({ name: 'submit_to_ipp_office', label: 'Submit to IPP Office' });
        break;
      case 'ipp_office_submission':
        base.push({ name: 'confirm_acknowledgement', label: 'Confirm Acknowledgement' });
        break;
      case 'acknowledgement_pending':
        base.push({ name: 'accept_report', label: 'Accept Report',  variant: 'success' });
        base.push({ name: 'reject_report', label: 'Reject Report',  variant: 'danger'  });
        break;
      default:
        break;
    }
    base.push({ name: 'declare_lapsed', label: 'Declare Lapsed', variant: 'warn' });
    return base;
  }

  function openActionPicker(item: ReippppReportRecord) {
    const actions = getActions(item);
    if (actions.length === 0) return;
    const first = actions[0];
    setActionItem(item);
    setActionName(first.name);
    setActionLabel(first.label);
    setSelectedAction(first.name);
    setActionReason('');
    setActionNotes('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setActionName('');
    setActionLabel('');
    setSelectedAction('');
    setActionReason('');
    setActionNotes('');
    setActionError(null);
  }

  function handleActionChange(name: string) {
    setSelectedAction(name);
    setActionName(name);
    if (actionItem) {
      const actions = getActions(actionItem);
      const found = actions.find(a => a.name === name);
      if (found) setActionLabel(found.label);
    }
  }

  async function submitAction() {
    if (!actionItem || !actionName) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { action: actionName };
      if (actionReason.trim()) body.reason = actionReason.trim();
      if (actionNotes.trim())  body.notes  = actionNotes.trim();

      const res = await fetch(`/api/ipp-reipppp-reports/${actionItem.id}/action`, {
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
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  const modalActions = actionItem ? getActions(actionItem) : [];

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total Reports" value={total} />
        <KpiChip label="Active"        value={active}        mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"  value={breached}      mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Accepted"      value={acceptedCount} mode={acceptedCount > 0 ? 'good' : 'neutral'} />
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
          {CAPACITY_TIERS.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
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
          + New Report
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3"
        >
          <div className="text-sm font-semibold text-blue-800">New REIPPPP Annual Progress Report</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Project Ref *</label>
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
              <label className="block text-xs text-[#3d4756] mb-1">REIPPPP Bid Ref (optional)</label>
              <input
                type="text"
                value={formBidRef}
                onChange={e => setFormBidRef(e.target.value)}
                placeholder="REIPPPP/BW4/001"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Report Period *</label>
              <input
                type="text"
                value={formReportPeriod}
                onChange={e => setFormReportPeriod(e.target.value)}
                placeholder="2025-2026"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Project MW *</label>
              <input
                type="number"
                value={formProjectMw}
                onChange={e => setFormProjectMw(e.target.value)}
                min={0}
                step={0.001}
                placeholder="100"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Report Type *</label>
              <select
                value={formReportType}
                onChange={e => setFormReportType(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {REPORT_TYPES.map(rt => (
                  <option key={rt} value={rt}>{REPORT_TYPE_LABELS[rt]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Local Content % (optional)</label>
              <input
                type="number"
                value={formLocalContentPct}
                onChange={e => setFormLocalContentPct(e.target.value)}
                min={0}
                max={100}
                step={0.01}
                placeholder="35.5"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">ED Spend ZAR (optional)</label>
              <input
                type="number"
                value={formEdSpendZar}
                onChange={e => setFormEdSpendZar(e.target.value)}
                min={0}
                step={1}
                placeholder="5000000"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Direct Jobs (optional)</label>
              <input
                type="number"
                value={formJobsDirect}
                onChange={e => setFormJobsDirect(e.target.value)}
                min={0}
                step={1}
                placeholder="120"
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
                <th className="pb-2 pr-3">ID</th>
                <th className="pb-2 pr-3">Project Ref</th>
                <th className="pb-2 pr-3">REIPPPP Bid Ref</th>
                <th className="pb-2 pr-3">Report Period</th>
                <th className="pb-2 pr-3">Project MW</th>
                <th className="pb-2 pr-3">Tier</th>
                <th className="pb-2 pr-3">Report Type</th>
                <th className="pb-2 pr-3">Local Content %</th>
                <th className="pb-2 pr-3">ED Spend</th>
                <th className="pb-2 pr-3">Direct Jobs</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">SLA Due</th>
                <th className="pb-2 pr-3">SLA Breached</th>
                <th className="pb-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions = getActions(item);
                const due     = fmtDate(item.sla_due_date);
                return (
                  <tr key={item.id} className="border-b hover:bg-[#eef2f7]">
                    <td className="py-2 pr-3 text-xs font-mono text-[#9aa5b4]">{item.id.slice(0, 8)}</td>
                    <td className="py-2 pr-3 text-xs font-mono text-[#2d3748]">{item.project_ref}</td>
                    <td className="py-2 pr-3 text-xs text-[#6b7685] max-w-[130px] truncate" title={item.reipppp_bid_ref ?? ''}>
                      {item.reipppp_bid_ref ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[#3d4756]">{item.report_period}</td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[#2d3748] font-medium">
                      {fmtMw(item.project_mw)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CAPACITY_TIER_COLORS[item.capacity_tier] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {item.capacity_tier.charAt(0).toUpperCase() + item.capacity_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-[#3d4756]">
                      {REPORT_TYPE_LABELS[item.report_type] ?? item.report_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[#3d4756]">
                      {fmtPct(item.local_content_pct)}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[#3d4756]">
                      {fmtZar(item.ed_spend_zar)}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[#3d4756]">
                      {item.jobs_direct != null ? item.jobs_direct.toLocaleString('en-ZA') : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums">
                      <span className={due.isPast ? 'text-red-600 font-medium' : 'text-[#3d4756]'}>
                        {due.text}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {item.sla_breached === 1 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">Yes</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-[#eef2f7] text-[#9aa5b4]">No</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {actions.length > 0 && (
                        <button type="button"
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
                  <td colSpan={14} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No REIPPPP reports found
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

      {/* Action modal */}
      {actionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-[#1e2a38] mb-1">REIPPPP Annual Progress Report Action</div>
            <div className="text-xs text-[#6b7685] mb-4">
              {actionItem.project_ref} &mdash; {STATUS_LABELS[actionItem.chain_status] ?? actionItem.chain_status}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-[#3d4756] mb-1">Action *</label>
              <select
                value={selectedAction}
                onChange={e => handleActionChange(e.target.value)}
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {modalActions.map(a => (
                  <option key={a.name} value={a.name}>{a.label}</option>
                ))}
              </select>
            </div>

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
                disabled={actionLoading || !actionName}
                className="px-4 py-1.5 text-xs rounded bg-[#c2873a] text-white hover:bg-[#a3702f] disabled:opacity-50"
              >
                {actionLoading ? 'Submitting…' : actionLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
