import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface LenderReportingRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  report_period: string;
  lender_tier: 'sole' | 'bilateral' | 'club' | 'syndicated' | 'consortium';
  lender_count: number;
  report_type: string;
  agent_bank: string | null;
  due_date: string | null;
  chain_status: string;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface LenderReportingKpis {
  total: number;
  active: number;
  sla_breached: number;
  acknowledged: number;
  disputed_breach: number;
}

const STATUS_COLORS: Record<string, string> = {
  reporting_triggered:    'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  data_collection:        'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  financial_model_update: 'bg-sky-100 text-sky-700',
  technical_review:       'bg-cyan-100 text-cyan-700',
  document_compilation:   'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  ipp_sign_off:           'bg-violet-100 text-violet-700',
  agent_bank_submission:  'bg-purple-100 text-purple-700',
  lender_distribution:    'bg-yellow-100 text-yellow-800',
  acknowledgement_pending:'bg-orange-100 text-orange-700',
  package_acknowledged:   'bg-green-100 text-green-700',
  package_disputed:       'bg-red-100 text-red-700',
  covenant_breach:        'bg-red-200 text-red-900',
};

const STATUS_LABELS: Record<string, string> = {
  reporting_triggered:    'Reporting Triggered',
  data_collection:        'Data Collection',
  financial_model_update: 'Financial Model Update',
  technical_review:       'Technical Review',
  document_compilation:   'Document Compilation',
  ipp_sign_off:           'IPP Sign-Off',
  agent_bank_submission:  'Agent Bank Submission',
  lender_distribution:    'Lender Distribution',
  acknowledgement_pending:'Acknowledgement Pending',
  package_acknowledged:   'Package Acknowledged',
  package_disputed:       'Package Disputed',
  covenant_breach:        'Covenant Breach',
};

// URGENT SLA — more lenders = tighter deadline
const TIER_BADGE_COLORS: Record<string, string> = {
  sole:        'bg-green-100 text-green-800',
  bilateral:   'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  club:        'bg-yellow-100 text-yellow-800',
  syndicated:  'bg-orange-100 text-orange-800',
  consortium:  'bg-red-100 text-red-800',
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  quarterly_report:    'Quarterly',
  semi_annual_report:  'Semi-Annual',
  annual_report:       'Annual',
  special_purpose:     'Special Purpose',
  drawdown:            'Drawdown',
};

const TERMINAL_STATUSES = new Set([
  'package_acknowledged',
  'package_disputed',
  'covenant_breach',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS    = ['sole', 'bilateral', 'club', 'syndicated', 'consortium'] as const;
const REPORT_TYPES = Object.keys(REPORT_TYPE_LABELS);

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[var(--ink, #2d3748)] bg-surface-v2';

function fmtLenderCount(count: number): string {
  return count === 1 ? '1 lender' : `${count} lenders`;
}

function fmtDate(dateStr: string | null | undefined): { text: string; isPast: boolean } {
  if (!dateStr) return { text: '—', isPast: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { text: '—', isPast: false };
  const now = new Date();
  const isPast = d < now;
  const text = d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  return { text, isPast };
}

type KpiChipProps = { label: string; value: string | number; mode?: 'alert' | 'good' | 'danger' | 'neutral' };
function KpiChip({ label, value, mode = 'neutral' }: KpiChipProps) {
  const border =
    mode === 'danger' ? 'border-red-200 bg-red-50'       :
    mode === 'alert'  ? 'border-orange-200 bg-orange-50' :
    mode === 'good'   ? 'border-green-200 bg-green-50'   :
    'border-[var(--border-subtle, #dde4ec)] bg-surface-v2';
  const text =
    mode === 'danger' ? 'text-red-700'    :
    mode === 'alert'  ? 'text-orange-700' :
    mode === 'good'   ? 'text-green-700'  :
    'text-[var(--ink, #0f1c2e)]';
  return (
    <div className={`rounded-lg p-3 border ${border}`}>
      <div className="text-xs text-[var(--ink-2, #6b7685)]">{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
    </div>
  );
}

export function IppLenderReportingTab() {
  const [items, setItems]               = useState<LenderReportingRecord[]>([]);
  const [kpis, setKpis]                 = useState<LenderReportingKpis | null>(null);
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
  const [formReportPeriod, setFormReportPeriod]   = useState('');
  const [formLenderCount, setFormLenderCount]     = useState('1');
  const [formReportType, setFormReportType]       = useState('quarterly_report');
  const [formAgentBank, setFormAgentBank]         = useState('');
  const [formDueDate, setFormDueDate]             = useState('');
  const [formTier, setFormTier]                   = useState<typeof TIERS[number]>('sole');
  const [formNotes, setFormNotes]                 = useState('');

  // Action modal state
  const [actionItem, setActionItem]       = useState<LenderReportingRecord | null>(null);
  const [actionName, setActionName]       = useState('');
  const [actionLabel, setActionLabel]     = useState('');
  const [actionNotes, setActionNotes]     = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError]     = useState<string | null>(null);

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
      const res = await fetch(`/api/ipp-lender-reporting?${params}`, {
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

  // Derived KPIs (fallback to client-side if server doesn't return kpis)
  const total          = kpis?.total          ?? items.length;
  const active         = kpis?.active         ?? items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached       = kpis?.sla_breached   ?? items.filter(i => i.sla_breached === 1).length;
  const acknowledged   = kpis?.acknowledged   ?? items.filter(i => i.chain_status === 'package_acknowledged').length;
  const disputedBreach = kpis?.disputed_breach ?? items.filter(i =>
    i.chain_status === 'package_disputed' || i.chain_status === 'covenant_breach'
  ).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formReportPeriod.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:   formProjectRef.trim(),
        report_period: formReportPeriod.trim(),
        lender_count:  parseInt(formLenderCount, 10),
        report_type:   formReportType,
        lender_tier:   formTier,
      };
      if (formAgentBank.trim()) body.agent_bank = formAgentBank.trim();
      if (formDueDate)          body.due_date   = formDueDate;
      if (formNotes.trim())     body.notes      = formNotes.trim();

      const res = await fetch('/api/ipp-lender-reporting', {
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
      setFormReportPeriod('');
      setFormLenderCount('1');
      setFormReportType('quarterly_report');
      setFormAgentBank('');
      setFormDueDate('');
      setFormTier('sole');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openAction(item: LenderReportingRecord, name: string, label: string) {
    setActionItem(item);
    setActionName(name);
    setActionLabel(label);
    setActionNotes('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setActionName('');
    setActionLabel('');
    setActionNotes('');
    setActionError(null);
  }

  async function submitAction() {
    if (!actionItem) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/ipp-lender-reporting/${actionItem.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          action: actionName,
          notes:  actionNotes.trim() || undefined,
        }),
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

  function getActions(item: LenderReportingRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    switch (item.chain_status) {
      case 'reporting_triggered':
        return [{ name: 'commence_data_collection', label: 'Commence Data Collection' }];
      case 'data_collection':
        return [{ name: 'update_financial_model', label: 'Update Financial Model' }];
      case 'financial_model_update':
        return [{ name: 'conduct_technical_review', label: 'Conduct Technical Review' }];
      case 'technical_review':
        return [{ name: 'compile_documents', label: 'Compile Documents' }];
      case 'document_compilation':
        return [{ name: 'obtain_ipp_sign_off', label: 'Obtain IPP Sign-Off' }];
      case 'ipp_sign_off':
        return [{ name: 'submit_to_agent_bank', label: 'Submit to Agent Bank' }];
      case 'agent_bank_submission':
        return [{ name: 'distribute_to_lenders', label: 'Distribute to Lenders' }];
      case 'lender_distribution':
        return [{ name: 'request_acknowledgement', label: 'Request Acknowledgement' }];
      case 'acknowledgement_pending':
        return [
          { name: 'confirm_acknowledged',    label: 'Confirm Acknowledged',    variant: 'success' },
          { name: 'raise_dispute',           label: 'Raise Dispute',           variant: 'warn'    },
          { name: 'declare_covenant_breach', label: 'Declare Covenant Breach', variant: 'danger'  },
        ];
      default:
        return [];
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiChip label="Total Reports"      value={total} />
        <KpiChip label="Active"             value={active}         mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"       value={breached}       mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Acknowledged"       value={acknowledged}   mode={acknowledged > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Disputed / Breach"  value={disputedBreach} mode={disputedBreach > 0 ? 'danger' : 'neutral'} />
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
          {TIERS.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <button type="button"
          onClick={() => load()}
          className="px-3 py-1 bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)] rounded text-xs border border-[var(--border-subtle, #dde4ec)] hover:bg-[var(--border-subtle, #e8ecf0)]"
        >
          Refresh
        </button>
        <button type="button"
          onClick={() => setShowCreate(v => !v)}
          className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]"
        >
          + New Lender Report
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'oklch(0.87 0.010 250)', background: 'oklch(0.94 0.006 250)' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>New Lender Report</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Project Ref *</label>
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
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Report Period *</label>
              <input
                type="text"
                value={formReportPeriod}
                onChange={e => setFormReportPeriod(e.target.value)}
                placeholder="Q1 2026"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Lender Tier *</label>
              <select
                value={formTier}
                onChange={e => setFormTier(e.target.value as typeof formTier)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {TIERS.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Lender Count *</label>
              <input
                type="number"
                value={formLenderCount}
                onChange={e => setFormLenderCount(e.target.value)}
                min={1}
                step={1}
                placeholder="1"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Report Type *</label>
              <select
                value={formReportType}
                onChange={e => setFormReportType(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {REPORT_TYPES.map(rt => (
                  <option key={rt} value={rt}>{REPORT_TYPE_LABELS[rt]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Agent Bank (optional)</label>
              <input
                type="text"
                value={formAgentBank}
                onChange={e => setFormAgentBank(e.target.value)}
                placeholder="e.g. Nedbank CIB"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Due Date (optional)</label>
              <input
                type="date"
                value={formDueDate}
                onChange={e => setFormDueDate(e.target.value)}
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Notes</label>
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
              className="px-3 py-1.5 bg-surface-v2 border rounded text-xs text-[var(--ink-2, #3d4756)] hover:bg-[var(--s2, #eef2f7)]"
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
        <div className="text-sm text-[var(--ink-2, #9aa5b4)] py-8 text-center">Loading&hellip;</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--ink-2, #6b7685)]">
                <th className="pb-2 pr-4">Project Ref</th>
                <th className="pb-2 pr-4">Period</th>
                <th className="pb-2 pr-4">Lender Tier</th>
                <th className="pb-2 pr-4">Lenders</th>
                <th className="pb-2 pr-4">Report Type</th>
                <th className="pb-2 pr-4">Agent Bank</th>
                <th className="pb-2 pr-4">Due Date</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA Breached</th>
                <th className="pb-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions = getActions(item);
                const due     = fmtDate(item.due_date);
                return (
                  <tr key={item.id} className="border-b hover:bg-[var(--s2, #eef2f7)]">
                    <td className="py-2 pr-4 text-xs font-mono text-[var(--ink, #2d3748)]">{item.project_ref}</td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #3d4756)]">{item.report_period}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_BADGE_COLORS[item.lender_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {item.lender_tier.charAt(0).toUpperCase() + item.lender_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink-2, #3d4756)]">
                      {fmtLenderCount(item.lender_count)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #3d4756)]">
                      {REPORT_TYPE_LABELS[item.report_type] ?? item.report_type}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #6b7685)] max-w-[140px] truncate" title={item.agent_bank ?? ''}>
                      {item.agent_bank ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums">
                      <span className={due.isPast ? 'text-red-600 font-medium' : 'text-[var(--ink-2, #3d4756)]'}>
                        {due.text}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? statusLabel(item.chain_status).text}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {item.sla_breached === 1 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">Yes</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #9aa5b4)]">No</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {actions.map(a => (
                          <button type="button"
                            key={a.name}
                            onClick={() => openAction(item, a.name, a.label)}
                            className={
                              a.variant === 'danger'
                                ? 'px-2 py-0.5 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
                                : a.variant === 'warn'
                                ? 'px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border border-yellow-200'
                                : a.variant === 'success'
                                ? 'px-2 py-0.5 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'
                                : 'px-2 py-0.5 text-xs rounded border hover:opacity-80'
                            }
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-[var(--ink-2, #9aa5b4)] text-sm">
                    No lender reports found
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
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[var(--s2, #eef2f7)]"
          >
            &larr; Prev
          </button>
          <span className="text-xs text-[var(--ink-2, #6b7685)]">
            Page {page} of {totalPages}
          </span>
          <button type="button"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[var(--s2, #eef2f7)]"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Action modal */}
      {actionItem && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setActionItem(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface-v2 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-[var(--ink, #1e2a38)] mb-1">{actionLabel}</div>
            <div className="text-xs text-[var(--ink-2, #6b7685)] mb-4">
              Lender Report &mdash; {actionItem.project_ref} / {actionItem.report_period}
            </div>
            <div className="mb-3">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Notes (optional)</label>
              <textarea
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                rows={3}
                placeholder="Reason or remarks…"
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
                className="px-3 py-1.5 text-xs border rounded bg-surface-v2 text-[var(--ink-2, #3d4756)] hover:bg-[var(--s2, #eef2f7)]"
              >
                Cancel
              </button>
              <button type="button"
                onClick={submitAction}
                disabled={actionLoading}
                className="px-4 py-1.5 text-xs rounded bg-[#c2873a] text-white hover:bg-[#a3702f] disabled:opacity-50"
              >
                {actionLoading ? 'Submitting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
