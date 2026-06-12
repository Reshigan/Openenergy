import React, { useState, useEffect } from 'react';

interface AudRecord {
  id: string;
  participant_id: string;
  financial_year: string;
  year_end_date: string | null;
  auditor_firm: string | null;
  revenue_tier: string;
  annual_revenue_zar: number | null;
  total_assets_zar: number | null;
  net_profit_zar: number | null;
  opinion_type: string | null;
  qualification_basis: string | null;
  chain_status: string;
  sla_due_date: string | null;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AudKpis {
  total: number;
  sla_breached: number;
  completed: number;
  qualified: number;
}

const STATUS_COLORS: Record<string, string> = {
  audit_cycle_opened:          'bg-[#eef2f7] text-[#6b7685]',
  trial_balance_preparation:   'bg-[#e8edf5]',
  year_end_journals:           'bg-cyan-100 text-cyan-700',
  audit_fieldwork:             'bg-[#e8edf5]',
  management_accounts_review:  'bg-violet-100 text-violet-700',
  audit_queries_resolution:    'bg-yellow-100 text-yellow-800',
  draft_opinion_review:        'bg-orange-100 text-orange-700',
  board_approval:              'bg-[#e8edf5]',
  cipc_submission:             'bg-teal-100 text-teal-700',
  audit_completed:             'bg-green-100 text-green-700',
  audit_qualified:             'bg-red-100 text-red-700',
  audit_lapsed:                'bg-[#eef2f7] text-[#9aa5b4]',
};

const STATUS_COLOR_STYLES: Record<string, React.CSSProperties> = {
  trial_balance_preparation:   { color: 'oklch(0.46 0.16 55)' },
  audit_fieldwork:             { color: 'oklch(0.46 0.16 55)' },
  board_approval:              { color: 'oklch(0.17 0.010 250)' },
};

const STATUS_LABELS: Record<string, string> = {
  audit_cycle_opened:          'Audit Cycle Opened',
  trial_balance_preparation:   'Trial Balance Preparation',
  year_end_journals:           'Year-End Journals',
  audit_fieldwork:             'Audit Fieldwork',
  management_accounts_review:  'Management Accounts Review',
  audit_queries_resolution:    'Audit Queries Resolution',
  draft_opinion_review:        'Draft Opinion Review',
  board_approval:              'Board Approval',
  cipc_submission:             'CIPC Submission',
  audit_completed:             'Audit Completed',
  audit_qualified:             'Audit Qualified',
  audit_lapsed:                'Audit Lapsed',
};

const ACTION_LABELS: Record<string, string> = {
  commence_trial_balance:       'Commence Trial Balance',
  process_year_end_journals:    'Process Year-End Journals',
  commence_audit_fieldwork:     'Commence Audit Fieldwork',
  present_management_accounts:  'Present Management Accounts',
  resolve_audit_queries:        'Resolve Audit Queries',
  review_draft_opinion:         'Review Draft Opinion',
  obtain_board_approval:        'Obtain Board Approval',
  submit_to_cipc:               'Submit to CIPC',
  complete_audit:               'Complete Audit',
  issue_qualified_opinion:      'Issue Qualified Opinion',
  declare_lapsed:               'Declare Lapsed',
};

const TIER_COLORS: Record<string, string> = {
  small:    'bg-[#e8edf5]',
  medium:   'bg-yellow-100 text-yellow-800',
  large:    'bg-orange-100 text-orange-800',
  major:    'bg-red-100 text-red-800',
  flagship: 'bg-purple-100 text-purple-800',
};

const TIER_COLOR_STYLES: Record<string, React.CSSProperties> = {
  small: { color: 'oklch(0.17 0.010 250)' },
};

const HARD_TERMINALS = new Set([
  'audit_completed',
  'audit_qualified',
  'audit_lapsed',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const REVENUE_TIERS = ['small', 'medium', 'large', 'major', 'flagship'] as const;

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

function fmtZar(value: number | null | undefined): string {
  if (value == null) return '—';
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

export function IppAnnualAuditTab() {
  const [items, setItems]               = useState<AudRecord[]>([]);
  const [kpis, setKpis]                 = useState<AudKpis | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier]     = useState('');
  const [page, setPage]                 = useState(1);

  // Create form state
  const [showCreate, setShowCreate]                   = useState(false);
  const [creating, setCreating]                       = useState(false);
  const [createError, setCreateError]                 = useState<string | null>(null);
  const [formFinancialYear, setFormFinancialYear]     = useState('');
  const [formYearEndDate, setFormYearEndDate]         = useState('');
  const [formAuditorFirm, setFormAuditorFirm]         = useState('');
  const [formAnnualRevenueZar, setFormAnnualRevenueZar] = useState('');
  const [formNotes, setFormNotes]                     = useState('');

  // Detail drawer state
  const [detailItem, setDetailItem] = useState<AudRecord | null>(null);

  // Action modal state
  const [actionItem, setActionItem]         = useState<AudRecord | null>(null);
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
      const res = await fetch(`/api/ipp-annual-audits?${params}`, {
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

  const total     = kpis?.total        ?? items.length;
  const breached  = kpis?.sla_breached ?? items.filter(i => i.sla_breached === 1).length;
  const completed = kpis?.completed    ?? items.filter(i => i.chain_status === 'audit_completed').length;
  const qualified = kpis?.qualified    ?? items.filter(i => i.chain_status === 'audit_qualified').length;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formFinancialYear.trim() || !formAnnualRevenueZar) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        financial_year:     formFinancialYear.trim(),
        annual_revenue_zar: parseFloat(formAnnualRevenueZar),
      };
      if (formYearEndDate.trim())   body.year_end_date  = formYearEndDate.trim();
      if (formAuditorFirm.trim())   body.auditor_firm   = formAuditorFirm.trim();
      if (formNotes.trim())         body.notes          = formNotes.trim();

      const res = await fetch('/api/ipp-annual-audits', {
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
      setFormFinancialYear('');
      setFormYearEndDate('');
      setFormAuditorFirm('');
      setFormAnnualRevenueZar('');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function getActions(item: AudRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    if (HARD_TERMINALS.has(item.chain_status)) return [];
    const base: { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] = [];
    switch (item.chain_status) {
      case 'audit_cycle_opened':
        base.push({ name: 'commence_trial_balance', label: ACTION_LABELS.commence_trial_balance });
        break;
      case 'trial_balance_preparation':
        base.push({ name: 'process_year_end_journals', label: ACTION_LABELS.process_year_end_journals });
        break;
      case 'year_end_journals':
        base.push({ name: 'commence_audit_fieldwork', label: ACTION_LABELS.commence_audit_fieldwork });
        break;
      case 'audit_fieldwork':
        base.push({ name: 'present_management_accounts', label: ACTION_LABELS.present_management_accounts });
        break;
      case 'management_accounts_review':
        base.push({ name: 'resolve_audit_queries', label: ACTION_LABELS.resolve_audit_queries });
        break;
      case 'audit_queries_resolution':
        base.push({ name: 'review_draft_opinion', label: ACTION_LABELS.review_draft_opinion });
        break;
      case 'draft_opinion_review':
        base.push({ name: 'obtain_board_approval', label: ACTION_LABELS.obtain_board_approval, variant: 'success' });
        base.push({ name: 'issue_qualified_opinion', label: ACTION_LABELS.issue_qualified_opinion, variant: 'danger' });
        break;
      case 'board_approval':
        base.push({ name: 'submit_to_cipc', label: ACTION_LABELS.submit_to_cipc, variant: 'success' });
        break;
      case 'cipc_submission':
        base.push({ name: 'complete_audit', label: ACTION_LABELS.complete_audit, variant: 'success' });
        break;
      default:
        break;
    }
    base.push({ name: 'declare_lapsed', label: ACTION_LABELS.declare_lapsed, variant: 'warn' });
    return base;
  }

  function openActionPicker(item: AudRecord) {
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

      const res = await fetch(`/api/ipp-annual-audits/${actionItem.id}/action`, {
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
        <KpiChip label="SLA Breached" value={breached}  mode={breached  > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Completed"    value={completed} mode={completed > 0 ? 'good'   : 'neutral'} />
        <KpiChip label="Qualified"    value={qualified} mode={qualified > 0 ? 'alert'  : 'neutral'} />
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
          {REVENUE_TIERS.map(t => (
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
          + New Audit Cycle
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'oklch(0.87 0.010 250)', background: 'oklch(0.94 0.006 250)' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>New Annual Financial Statements & Independent Audit</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Financial Year *</label>
              <input
                type="text"
                value={formFinancialYear}
                onChange={e => setFormFinancialYear(e.target.value)}
                placeholder="2025/2026"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Annual Revenue (ZAR) *</label>
              <input
                type="number"
                value={formAnnualRevenueZar}
                onChange={e => setFormAnnualRevenueZar(e.target.value)}
                min={0}
                step={1}
                placeholder="50000000"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Year End Date</label>
              <input
                type="date"
                value={formYearEndDate}
                onChange={e => setFormYearEndDate(e.target.value)}
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className="block text-xs text-[#3d4756] mb-1">Auditor Firm</label>
              <input
                type="text"
                value={formAuditorFirm}
                onChange={e => setFormAuditorFirm(e.target.value)}
                placeholder="e.g. Deloitte & Touche"
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
                <th className="pb-2 pr-3">Financial Year</th>
                <th className="pb-2 pr-3">Year End</th>
                <th className="pb-2 pr-3">Auditor Firm</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Revenue Tier</th>
                <th className="pb-2 pr-3">Annual Revenue (ZAR)</th>
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
                    className="border-b hover:bg-[#eef2f7] cursor-pointer"
                    onClick={() => setDetailItem(item)}
                  >
                    <td className="py-2 pr-3 text-xs font-mono text-[#2d3748]">{item.financial_year}</td>
                    <td className="py-2 pr-3 text-xs text-[#2d3748]">{fmtDate(item.year_end_date).text}</td>
                    <td className="py-2 pr-3 text-xs text-[#1e2a38] max-w-[160px] truncate" title={item.auditor_firm ?? ''}>
                      {item.auditor_firm ?? '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`} style={STATUS_COLOR_STYLES[item.chain_status] ?? {}}>
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[item.revenue_tier] ?? 'bg-[#eef2f7] text-[#6b7685]'}`} style={TIER_COLOR_STYLES[item.revenue_tier] ?? {}}>
                        {item.revenue_tier.charAt(0).toUpperCase() + item.revenue_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[#2d3748]">{fmtZar(item.annual_revenue_zar)}</td>
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
                  <td colSpan={9} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No annual audit records found
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
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailItem(null); }} className="fixed inset-0 z-50 flex items-center justify-end bg-black/30">
          <div className="bg-white h-full w-full max-w-lg shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="text-sm font-semibold text-[#1e2a38]">
                  Annual Financial Audit — {detailItem.financial_year}
                </div>
                <div className="text-xs text-[#6b7685] mt-0.5">
                  {detailItem.auditor_firm ?? 'Auditor TBC'}
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
              {/* Status badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[detailItem.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`} style={STATUS_COLOR_STYLES[detailItem.chain_status] ?? {}}>
                  {STATUS_LABELS[detailItem.chain_status] ?? detailItem.chain_status.replace(/_/g, ' ')}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[detailItem.revenue_tier] ?? 'bg-[#eef2f7] text-[#6b7685]'}`} style={TIER_COLOR_STYLES[detailItem.revenue_tier] ?? {}}>
                  {detailItem.revenue_tier.charAt(0).toUpperCase() + detailItem.revenue_tier.slice(1)}
                </span>
                {detailItem.sla_breached === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">SLA Breached</span>
                )}
              </div>

              {/* Core audit details */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Financial Year</div>
                  <div className="font-mono text-[#1e2a38]">{detailItem.financial_year}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Year End Date</div>
                  <div className="text-[#1e2a38]">{fmtDate(detailItem.year_end_date).text}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Auditor Firm</div>
                  <div className="font-medium text-[#1e2a38]">{detailItem.auditor_firm ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">SLA Deadline</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.sla_due_date).isPast ? 'text-red-600 font-medium' : 'text-[#1e2a38]'}`}>
                    {fmtDate(detailItem.sla_due_date).text}
                  </div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Annual Revenue (ZAR)</div>
                  <div className="tabular-nums font-semibold text-[#1e2a38]">{fmtZar(detailItem.annual_revenue_zar)}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Total Assets (ZAR)</div>
                  <div className="tabular-nums text-[#1e2a38]">{fmtZar(detailItem.total_assets_zar)}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Net Profit (ZAR)</div>
                  <div className="tabular-nums text-[#1e2a38]">{fmtZar(detailItem.net_profit_zar)}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Opinion Type</div>
                  <div className="text-[#1e2a38] capitalize">{detailItem.opinion_type?.replace(/_/g, ' ') ?? '—'}</div>
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

              {/* Qualification basis */}
              {detailItem.qualification_basis && (
                <div>
                  <div className="text-xs text-[#9aa5b4] mb-1">Qualification Basis</div>
                  <div className="text-xs text-[#2d3748] bg-red-50 rounded p-2 border border-red-200 whitespace-pre-wrap">
                    {detailItem.qualification_basis}
                  </div>
                </div>
              )}

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
                    This audit record is in a terminal state — no further actions are available.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action modal */}
      {actionItem && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setActionItem(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-[#1e2a38] mb-1">Annual Audit Action</div>
            <div className="text-xs text-[#6b7685] mb-4">
              {actionItem.financial_year} &mdash; {actionItem.auditor_firm ?? 'Auditor TBC'} &mdash;{' '}
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

export default IppAnnualAuditTab;
