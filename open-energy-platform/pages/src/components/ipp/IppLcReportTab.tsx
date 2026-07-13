import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface LcReport {
  id: string;
  participant_id: string;
  project_ref: string;
  report_quarter: string;
  lc_tier: 'low' | 'medium' | 'high' | 'premium';
  lc_commitment_pct: number;
  lc_achieved_pct: number | null;
  sed_achieved_zar: number | null;
  sed_commitment_zar: number | null;
  lc_content_type: 'goods' | 'services' | 'labour' | 'sed' | 'enterprise_dev' | 'ownership';
  chain_status: string;
  sla_due_date: string;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface LcReportKpis {
  total: number;
  active: number;
  sla_breached: number;
  compliant: number;
  non_compliant: number;
}

const STATUS_COLORS: Record<string, string> = {
  period_open:              'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  data_collection:          'bg-[var(--s2, oklch(0.94_0.006_250))] text-[var(--accent, oklch(0.46_0.16_55))]',
  internal_verification:    'bg-[var(--s2, oklch(0.94_0.006_250))] text-[var(--accent, oklch(0.46_0.16_55))]',
  report_preparation:       'bg-cyan-100 text-cyan-700',
  report_submitted:         'bg-sky-100 text-sky-700',
  completeness_check:       'bg-purple-100 text-purple-700',
  clarification_requested:  'bg-yellow-100 text-yellow-800',
  clarification_submitted:  'bg-teal-100 text-teal-700',
  technical_assessment:     'bg-orange-100 text-orange-700',
  compliant:                'bg-green-100 text-green-700',
  non_compliant:            'bg-red-100 text-red-700',
  conditional_compliance:   'bg-amber-100 text-amber-700',
};

const STATUS_LABELS: Record<string, string> = {
  period_open:              'Period Open',
  data_collection:          'Data Collection',
  internal_verification:    'Internal Verification',
  report_preparation:       'Report Preparation',
  report_submitted:         'Report Submitted',
  completeness_check:       'Completeness Check',
  clarification_requested:  'Clarification Requested',
  clarification_submitted:  'Clarification Submitted',
  technical_assessment:     'Technical Assessment',
  compliant:                'Compliant',
  non_compliant:            'Non-Compliant',
  conditional_compliance:   'Conditional Compliance',
};

const TIER_BADGE_COLORS: Record<string, string> = {
  low:     'bg-green-100 text-green-800',
  medium:  'bg-yellow-100 text-yellow-800',
  high:    'bg-orange-100 text-orange-800',
  premium: 'bg-red-100 text-red-800',
};

const LC_CONTENT_TYPE_LABELS: Record<string, string> = {
  goods:          'Goods',
  services:       'Services',
  labour:         'Labour',
  sed:            'SED',
  enterprise_dev: 'Enterprise Dev',
  ownership:      'Ownership',
};

const TERMINAL_STATUSES = new Set(['compliant', 'non_compliant', 'conditional_compliance']);

const STATUSES     = Object.keys(STATUS_LABELS);
const TIERS        = ['low', 'medium', 'high', 'premium'] as const;
const CONTENT_TYPES = Object.keys(LC_CONTENT_TYPE_LABELS);

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[var(--ink, #2d3748)] bg-surface-v2';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

function fmtZarMillions(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000_000) return `R ${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `R ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `R ${(v / 1_000).toFixed(1)}K`;
  return `R ${v.toLocaleString('en-ZA')}`;
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

export function IppLcReportTab() {
  const [items, setItems]               = useState<LcReport[]>([]);
  const [kpis, setKpis]                 = useState<LcReportKpis | null>(null);
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
  const [formQuarter, setFormQuarter]             = useState('');
  const [formCommitPct, setFormCommitPct]         = useState('');
  const [formSedCommitZar, setFormSedCommitZar]   = useState('');
  const [formContentType, setFormContentType]     = useState('goods');
  const [formNotes, setFormNotes]                 = useState('');
  const [formTier, setFormTier]                   = useState<'low' | 'medium' | 'high' | 'premium'>('medium');

  // Action modal state
  const [actionItem, setActionItem]     = useState<LcReport | null>(null);
  const [actionName, setActionName]     = useState('');
  const [actionLabel, setActionLabel]   = useState('');
  const [actionNotes, setActionNotes]   = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError]   = useState<string | null>(null);

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
      const res = await fetch(`/api/ipp-lc-reports?${params}`, {
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
  const total        = kpis?.total        ?? items.length;
  const active       = kpis?.active       ?? items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached     = kpis?.sla_breached ?? items.filter(i => i.sla_breached === 1).length;
  const compliant    = kpis?.compliant    ?? items.filter(i => i.chain_status === 'compliant').length;
  const nonCompliant = kpis?.non_compliant ?? items.filter(i => i.chain_status === 'non_compliant').length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formQuarter.trim() || !formCommitPct) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:        formProjectRef.trim(),
        report_quarter:     formQuarter.trim(),
        lc_commitment_pct:  parseFloat(formCommitPct),
        lc_content_type:    formContentType,
        lc_tier:            formTier,
      };
      if (formSedCommitZar) body.sed_commitment_zar = parseFloat(formSedCommitZar);
      if (formNotes.trim()) body.notes = formNotes.trim();

      const res = await fetch('/api/ipp-lc-reports', {
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
      setFormQuarter('');
      setFormCommitPct('');
      setFormSedCommitZar('');
      setFormContentType('goods');
      setFormTier('medium');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openAction(item: LcReport, name: string, label: string) {
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
      const res = await fetch(`/api/ipp-lc-reports/${actionItem.id}/action`, {
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

  function getActions(item: LcReport): { name: string; label: string; variant?: 'danger' | 'warn' }[] {
    switch (item.chain_status) {
      case 'period_open':
        return [{ name: 'commence_collection', label: 'Commence Collection' }];
      case 'data_collection':
        return [{ name: 'submit_for_verification', label: 'Submit for Verification' }];
      case 'internal_verification':
        return [{ name: 'prepare_report', label: 'Prepare Report' }];
      case 'report_preparation':
        return [{ name: 'submit_report', label: 'Submit Report' }];
      case 'report_submitted':
        return [{ name: 'accept_for_review', label: 'Accept for Review' }];
      case 'completeness_check':
        return [
          { name: 'request_clarification',       label: 'Request Clarification', variant: 'warn' },
          { name: 'commence_technical_assessment', label: 'Commence Assessment' },
        ];
      case 'clarification_requested':
        return [{ name: 'submit_clarification', label: 'Submit Clarification' }];
      case 'clarification_submitted':
        return [{ name: 'commence_technical_assessment', label: 'Commence Assessment' }];
      case 'technical_assessment':
        return [
          { name: 'confirm_compliant',         label: 'Confirm Compliant',       variant: undefined },
          { name: 'confirm_non_compliance',    label: 'Confirm Non-Compliant',   variant: 'danger' },
          { name: 'grant_conditional_compliance', label: 'Conditional Compliance', variant: 'warn' },
        ];
      default:
        return [];
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiChip label="Total"          value={total} />
        <KpiChip label="Active"         value={active}       mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"   value={breached}     mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Compliant"      value={compliant}    mode={compliant > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Non-Compliant"  value={nonCompliant} mode={nonCompliant > 0 ? 'danger' : 'neutral'} />
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
          + New LC/SED Report
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'var(--border-subtle, oklch(0.87 0.010 250))', background: 'var(--s2, oklch(0.94 0.006 250))' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>New LC/SED Report</div>
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
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Report Quarter *</label>
              <input
                type="text"
                value={formQuarter}
                onChange={e => setFormQuarter(e.target.value)}
                placeholder="Q1-2026"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">LC Commitment % *</label>
              <input
                type="number"
                value={formCommitPct}
                onChange={e => setFormCommitPct(e.target.value)}
                min={0}
                max={100}
                step={0.1}
                placeholder="65.0"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">SED Commitment (ZAR)</label>
              <input
                type="number"
                value={formSedCommitZar}
                onChange={e => setFormSedCommitZar(e.target.value)}
                min={0}
                step={1}
                placeholder="Optional"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">LC Content Type *</label>
              <select
                value={formContentType}
                onChange={e => setFormContentType(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {CONTENT_TYPES.map(c => (
                  <option key={c} value={c}>{LC_CONTENT_TYPE_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">LC Tier *</label>
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
                <th className="pb-2 pr-4">Quarter</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Commit %</th>
                <th className="pb-2 pr-4">Achieved %</th>
                <th className="pb-2 pr-4">SED Achieved</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA Due</th>
                <th className="pb-2 pr-4">SLA Breached</th>
                <th className="pb-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const overdue  = !!(item.sla_breached || (item.sla_due_date && new Date(item.sla_due_date) < new Date()));
                const actions  = getActions(item);
                return (
                  <tr key={item.id} className="border-b hover:bg-[var(--s2, #eef2f7)]">
                    <td className="py-2 pr-4 text-xs font-mono text-[var(--ink, #2d3748)]">{item.project_ref}</td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">{item.report_quarter}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_BADGE_COLORS[item.lc_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {item.lc_tier.charAt(0).toUpperCase() + item.lc_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink, #2d3748)]">
                      {fmtPct(item.lc_commitment_pct)}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink, #2d3748)]">
                      {fmtPct(item.lc_achieved_pct)}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink, #2d3748)]">
                      {fmtZarMillions(item.sed_achieved_zar)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? statusLabel(item.chain_status).text}
                      </span>
                    </td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-[var(--ink-2, #6b7685)]'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.sla_due_date)}
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
                    No LC/SED report records found
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
              LC/SED Report — {actionItem.project_ref} / {actionItem.report_quarter}
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
