import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface EsmrRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  reporting_period: string;
  loan_tier: 'small' | 'medium' | 'large' | 'major' | 'flagship';
  loan_size_zar: number | null;
  dfi_names: string | null;
  lender_ta_ref: string | null;
  chain_status: string;
  sla_due_date: string | null;
  sla_breached: number;
  breach_category: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface EsmrKpis {
  total: number;
  active: number;
  sla_breached: number;
  certified: number;
  withheld_breached: number;
}

const STATUS_COLORS: Record<string, string> = {
  reporting_period_open:    'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  data_collection:          'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  monitoring_compilation:   'bg-cyan-100 text-cyan-700',
  lender_ta_review:         'bg-sky-100 text-sky-700',
  ta_report_preparation:    'bg-[var(--border-subtle, #e8ecf0)] text-[var(--ink-2, #3d4756)]',
  report_submitted:         'bg-violet-100 text-violet-700',
  lender_review:            'bg-purple-100 text-purple-700',
  clarification_requested:  'bg-yellow-100 text-yellow-800',
  clarification_submitted:  'bg-teal-100 text-teal-700',
  certificate_issued:       'bg-green-100 text-green-700',
  certificate_withheld:     'bg-orange-100 text-orange-700',
  material_breach_declared: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  reporting_period_open:    'Reporting Period Open',
  data_collection:          'Data Collection',
  monitoring_compilation:   'Monitoring Compilation',
  lender_ta_review:         'Lender TA Review',
  ta_report_preparation:    'TA Report Preparation',
  report_submitted:         'Report Submitted',
  lender_review:            'Lender Review',
  clarification_requested:  'Clarification Requested',
  clarification_submitted:  'Clarification Submitted',
  certificate_issued:       'Certificate Issued',
  certificate_withheld:     'Certificate Withheld',
  material_breach_declared: 'Material Breach Declared',
};

// INVERTED SLA — larger loan = more scrutiny = deeper colour
const TIER_BADGE_COLORS: Record<string, string> = {
  small:    'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  medium:   'bg-[var(--border-subtle, #e8ecf0)] text-[var(--ink-2, #3d4756)]',
  large:    'bg-purple-100 text-purple-800',
  major:    'bg-orange-100 text-orange-800',
  flagship: 'bg-red-100 text-red-800',
};

const BREACH_CATEGORY_LABELS: Record<string, string> = {
  ps1: 'PS1: E&S Assessment',
  ps2: 'PS2: Labour',
  ps3: 'PS3: Pollution',
  ps4: 'PS4: Community Health',
  ps5: 'PS5: Land Acquisition',
  ps6: 'PS6: Biodiversity',
  ps7: 'PS7: Indigenous Peoples',
  ps8: 'PS8: Cultural Heritage',
};

const TERMINAL_STATUSES = new Set([
  'certificate_issued',
  'certificate_withheld',
  'material_breach_declared',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS    = ['small', 'medium', 'large', 'major', 'flagship'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[var(--ink, #2d3748)] bg-surface-v2';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtLoanSize(zar: number | null | undefined): string {
  if (zar == null) return '—';
  if (zar >= 1_000_000_000) {
    return `R ${(zar / 1_000_000_000).toFixed(1)}B`;
  }
  return `R ${(zar / 1_000_000).toFixed(1)}M`;
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

export function IppEsmrTab() {
  const [items, setItems]               = useState<EsmrRecord[]>([]);
  const [kpis, setKpis]                 = useState<EsmrKpis | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier]     = useState('');
  const [page, setPage]                 = useState(1);

  // Create form state
  const [showCreate, setShowCreate]             = useState(false);
  const [creating, setCreating]                 = useState(false);
  const [createError, setCreateError]           = useState<string | null>(null);
  const [formProjectRef, setFormProjectRef]     = useState('');
  const [formPeriod, setFormPeriod]             = useState('');
  const [formLoanSize, setFormLoanSize]         = useState('');
  const [formDfiNames, setFormDfiNames]         = useState('');
  const [formLenderTaRef, setFormLenderTaRef]   = useState('');
  const [formTier, setFormTier]                 = useState<typeof TIERS[number]>('medium');
  const [formNotes, setFormNotes]               = useState('');

  // Action modal state
  const [actionItem, setActionItem]       = useState<EsmrRecord | null>(null);
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
      const res = await fetch(`/api/ipp-esmr?${params}`, {
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
  const total           = kpis?.total            ?? items.length;
  const active          = kpis?.active           ?? items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached        = kpis?.sla_breached     ?? items.filter(i => i.sla_breached === 1).length;
  const certified       = kpis?.certified        ?? items.filter(i => i.chain_status === 'certificate_issued').length;
  const withheldBreached = kpis?.withheld_breached ?? items.filter(i =>
    i.chain_status === 'certificate_withheld' || i.chain_status === 'material_breach_declared'
  ).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formPeriod.trim() || !formLoanSize) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:      formProjectRef.trim(),
        reporting_period: formPeriod.trim(),
        loan_size_zar:    parseFloat(formLoanSize),
        loan_tier:        formTier,
      };
      if (formDfiNames.trim())    body.dfi_names     = formDfiNames.trim();
      if (formLenderTaRef.trim()) body.lender_ta_ref = formLenderTaRef.trim();
      if (formNotes.trim())       body.notes         = formNotes.trim();

      const res = await fetch('/api/ipp-esmr', {
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
      setFormPeriod('');
      setFormLoanSize('');
      setFormDfiNames('');
      setFormLenderTaRef('');
      setFormTier('medium');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openAction(item: EsmrRecord, name: string, label: string) {
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
      const res = await fetch(`/api/ipp-esmr/${actionItem.id}/action`, {
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

  function getActions(item: EsmrRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    switch (item.chain_status) {
      case 'reporting_period_open':
        return [{ name: 'commence_data_collection', label: 'Commence Data Collection' }];
      case 'data_collection':
        return [{ name: 'compile_monitoring_report', label: 'Compile Monitoring Report' }];
      case 'monitoring_compilation':
        return [{ name: 'commence_ta_review', label: 'Commence TA Review' }];
      case 'lender_ta_review':
        return [{ name: 'prepare_ta_report', label: 'Prepare TA Report' }];
      case 'ta_report_preparation':
        return [{ name: 'submit_report', label: 'Submit Report' }];
      case 'report_submitted':
        return [{ name: 'commence_lender_review', label: 'Commence Lender Review' }];
      case 'lender_review':
        return [
          { name: 'request_clarification', label: 'Request Clarification',   variant: 'warn'    },
          { name: 'issue_certificate',      label: 'Issue Certificate',       variant: 'success' },
          { name: 'withhold_certificate',   label: 'Withhold Certificate',    variant: 'warn'    },
        ];
      case 'clarification_requested':
        return [{ name: 'submit_clarification', label: 'Submit Clarification' }];
      case 'clarification_submitted':
        return [
          { name: 'issue_certificate',       label: 'Issue Certificate',       variant: 'success' },
          { name: 'withhold_certificate',    label: 'Withhold Certificate',    variant: 'warn'    },
          { name: 'declare_material_breach', label: 'Declare Material Breach', variant: 'danger'  },
        ];
      case 'certificate_withheld':
        return [{ name: 'declare_material_breach', label: 'Declare Material Breach', variant: 'danger' }];
      default:
        return [];
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiChip label="Total Reports"       value={total} />
        <KpiChip label="Active"              value={active}           mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"        value={breached}         mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Certified"           value={certified}        mode={certified > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Withheld / Breached" value={withheldBreached} mode={withheldBreached > 0 ? 'danger' : 'neutral'} />
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
          + New E&amp;S Monitoring Report
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'var(--border-subtle, oklch(0.87 0.010 250))', background: 'var(--s2, oklch(0.94 0.006 250))' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>New E&amp;S Monitoring Report</div>
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
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Reporting Period *</label>
              <input
                type="text"
                value={formPeriod}
                onChange={e => setFormPeriod(e.target.value)}
                placeholder="H1-2026"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Loan Size (ZAR) *</label>
              <input
                type="number"
                value={formLoanSize}
                onChange={e => setFormLoanSize(e.target.value)}
                min={0}
                step={1000000}
                placeholder="2200000000"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Loan Tier *</label>
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
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">DFI Names</label>
              <input
                type="text"
                value={formDfiNames}
                onChange={e => setFormDfiNames(e.target.value)}
                placeholder="DBSA,IFC"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Lender TA Ref</label>
              <input
                type="text"
                value={formLenderTaRef}
                onChange={e => setFormLenderTaRef(e.target.value)}
                placeholder="TA-2026-001"
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
                <th className="pb-2 pr-4">Loan Tier</th>
                <th className="pb-2 pr-4">Loan Size</th>
                <th className="pb-2 pr-4">DFIs</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Breach Category</th>
                <th className="pb-2 pr-4">SLA Due</th>
                <th className="pb-2 pr-4">SLA Breached</th>
                <th className="pb-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const overdue = !!(item.sla_breached || (item.sla_due_date && new Date(item.sla_due_date) < new Date()));
                const actions = getActions(item);
                return (
                  <tr key={item.id} className="border-b hover:bg-[var(--s2, #eef2f7)]">
                    <td className="py-2 pr-4 text-xs font-mono text-[var(--ink, #2d3748)]">{item.project_ref}</td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">{item.reporting_period}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_BADGE_COLORS[item.loan_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {item.loan_tier.charAt(0).toUpperCase() + item.loan_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink, #2d3748)]">
                      {fmtLoanSize(item.loan_size_zar)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #6b7685)] max-w-[120px] truncate" title={item.dfi_names ?? ''}>
                      {item.dfi_names ?? '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? statusLabel(item.chain_status).text}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #6b7685)]">
                      {item.breach_category
                        ? (BREACH_CATEGORY_LABELS[item.breach_category] ?? item.breach_category)
                        : '—'}
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
                                : a.variant === 'success'
                                ? 'px-2 py-0.5 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'
                                : 'px-2 py-0.5 text-xs rounded border border-[var(--border-subtle, #dde4ec)]'
                            }
                            style={!a.variant ? { background: 'var(--s2, oklch(0.94 0.006 250))', color: 'var(--accent, oklch(0.46 0.16 55))', borderColor: 'var(--border-subtle, oklch(0.87 0.010 250))' } : undefined}
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
                    No E&amp;S monitoring report records found
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
              E&amp;S Monitoring Report — {actionItem.project_ref} / {actionItem.reporting_period}
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
