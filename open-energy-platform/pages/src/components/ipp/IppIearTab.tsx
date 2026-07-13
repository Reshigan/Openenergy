import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface IearRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  review_year: string;
  project_tier: 'small' | 'medium' | 'large' | 'utility' | 'strategic';
  project_mw: number | null;
  ie_firm: string | null;
  focus_area: string | null;
  finding_severity: string | null;
  chain_status: string;
  sla_due_date: string | null;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface IearKpis {
  total: number;
  active: number;
  sla_breached: number;
  closed: number;
  remediation_escalated: number;
}

const STATUS_COLORS: Record<string, string> = {
  review_triggered:        'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  scope_definition:        'bg-[var(--s2,oklch(0.94_0.008_250))] text-[var(--accent,oklch(0.46_0.16_55))]',
  data_submission:         'bg-cyan-100 text-cyan-700',
  ie_field_inspection:     'bg-sky-100 text-sky-700',
  ie_analysis:             'bg-[var(--s2,oklch(0.94_0.008_250))] text-[var(--accent,oklch(0.46_0.16_55))]',
  draft_report_issued:     'bg-violet-100 text-violet-700',
  ipp_response:            'bg-purple-100 text-purple-700',
  ie_final_review:         'bg-yellow-100 text-yellow-800',
  report_issued:           'bg-teal-100 text-teal-700',
  review_closed:           'bg-green-100 text-green-700',
  remediation_required:    'bg-orange-100 text-orange-700',
  escalated_to_lenders:    'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  review_triggered:        'Review Triggered',
  scope_definition:        'Scope Definition',
  data_submission:         'Data Submission',
  ie_field_inspection:     'IE Field Inspection',
  ie_analysis:             'IE Analysis',
  draft_report_issued:     'Draft Report Issued',
  ipp_response:            'IPP Response',
  ie_final_review:         'IE Final Review',
  report_issued:           'Report Issued',
  review_closed:           'Review Closed',
  remediation_required:    'Remediation Required',
  escalated_to_lenders:    'Escalated to Lenders',
};

// INVERTED SLA — larger project = more complex = deeper colour
const TIER_BADGE_COLORS: Record<string, string> = {
  small:     'bg-[var(--s2,oklch(0.94_0.008_250))] text-[var(--ink-2,oklch(0.40_0.009_250))]',
  medium:    'bg-sky-100 text-sky-800',
  large:     'bg-[var(--s2,oklch(0.94_0.008_250))] text-[var(--ink-2,oklch(0.40_0.009_250))]',
  utility:   'bg-purple-100 text-purple-800',
  strategic: 'bg-violet-100 text-violet-800',
};

const FOCUS_AREA_LABELS: Record<string, string> = {
  technical_performance: 'Technical Performance',
  financial_model:       'Financial Model',
  om_compliance:         'O&M Compliance',
  grid_code:             'Grid Code',
  insurance_bonds:       'Insurance & Bonds',
  comprehensive:         'Comprehensive',
};

const SEVERITY_BADGE_COLORS: Record<string, string> = {
  none:     'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  minor:    'bg-[var(--s2,oklch(0.94_0.008_250))] text-[var(--accent,oklch(0.46_0.16_55))]',
  moderate: 'bg-yellow-100 text-yellow-800',
  material: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const TERMINAL_STATUSES = new Set([
  'review_closed',
  'remediation_required',
  'escalated_to_lenders',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS    = ['small', 'medium', 'large', 'utility', 'strategic'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[var(--ink, #2d3748)] bg-surface-v2';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMw(mw: number | null | undefined): string {
  if (mw == null) return '—';
  return `${mw} MW`;
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

export function IppIearTab() {
  const [items, setItems]               = useState<IearRecord[]>([]);
  const [kpis, setKpis]                 = useState<IearKpis | null>(null);
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
  const [formReviewYear, setFormReviewYear]       = useState('');
  const [formProjectMw, setFormProjectMw]         = useState('');
  const [formIeFirm, setFormIeFirm]               = useState('');
  const [formFocusArea, setFormFocusArea]         = useState('comprehensive');
  const [formTier, setFormTier]                   = useState<typeof TIERS[number]>('medium');
  const [formNotes, setFormNotes]                 = useState('');

  // Action modal state
  const [actionItem, setActionItem]       = useState<IearRecord | null>(null);
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
      const res = await fetch(`/api/ipp-ie-annual-reviews?${params}`, {
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
  const total               = kpis?.total                ?? items.length;
  const active              = kpis?.active               ?? items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached            = kpis?.sla_breached         ?? items.filter(i => i.sla_breached === 1).length;
  const closed              = kpis?.closed               ?? items.filter(i => i.chain_status === 'review_closed').length;
  const remediationEscalated = kpis?.remediation_escalated ?? items.filter(i =>
    i.chain_status === 'remediation_required' || i.chain_status === 'escalated_to_lenders'
  ).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formReviewYear || !formProjectMw) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:  formProjectRef.trim(),
        review_year:  parseInt(formReviewYear, 10),
        project_mw:   parseFloat(formProjectMw),
        project_tier: formTier,
        focus_area:   formFocusArea,
      };
      if (formIeFirm.trim()) body.ie_firm = formIeFirm.trim();
      if (formNotes.trim())  body.notes   = formNotes.trim();

      const res = await fetch('/api/ipp-ie-annual-reviews', {
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
      setFormReviewYear('');
      setFormProjectMw('');
      setFormIeFirm('');
      setFormFocusArea('comprehensive');
      setFormTier('medium');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openAction(item: IearRecord, name: string, label: string) {
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
      const res = await fetch(`/api/ipp-ie-annual-reviews/${actionItem.id}/action`, {
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

  function getActions(item: IearRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    switch (item.chain_status) {
      case 'review_triggered':
        return [{ name: 'define_scope', label: 'Define Scope' }];
      case 'scope_definition':
        return [{ name: 'submit_data', label: 'Submit Data' }];
      case 'data_submission':
        return [{ name: 'commence_field_inspection', label: 'Commence Field Inspection' }];
      case 'ie_field_inspection':
        return [{ name: 'commence_analysis', label: 'Commence Analysis' }];
      case 'ie_analysis':
        return [{ name: 'issue_draft_report', label: 'Issue Draft Report' }];
      case 'draft_report_issued':
        return [{ name: 'submit_ipp_response', label: 'Submit IPP Response' }];
      case 'ipp_response':
        return [{ name: 'commence_final_review', label: 'Commence Final Review' }];
      case 'ie_final_review':
        return [{ name: 'issue_report', label: 'Issue Report' }];
      case 'report_issued':
        return [
          { name: 'close_review',         label: 'Close Review',        variant: 'success' },
          { name: 'require_remediation',  label: 'Require Remediation', variant: 'warn'    },
          { name: 'escalate_to_lenders',  label: 'Escalate to Lenders', variant: 'danger'  },
        ];
      case 'remediation_required':
        return [{ name: 'escalate_to_lenders', label: 'Escalate to Lenders', variant: 'danger' }];
      default:
        return [];
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiChip label="Total Reviews"          value={total} />
        <KpiChip label="Active"                 value={active}               mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"           value={breached}             mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Closed (Clean)"         value={closed}               mode={closed > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Remediation / Escalated" value={remediationEscalated} mode={remediationEscalated > 0 ? 'danger' : 'neutral'} />
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
          + New IE Annual Review
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'var(--border-subtle, oklch(0.87 0.010 250))', background: 'var(--s2, oklch(0.94 0.006 250))' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>New IE Annual Review</div>
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
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Review Year *</label>
              <input
                type="number"
                value={formReviewYear}
                onChange={e => setFormReviewYear(e.target.value)}
                placeholder="2026"
                min={2000}
                max={2100}
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Project MW *</label>
              <input
                type="number"
                value={formProjectMw}
                onChange={e => setFormProjectMw(e.target.value)}
                min={0}
                step={0.1}
                placeholder="140"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Project Tier *</label>
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
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Focus Area *</label>
              <select
                value={formFocusArea}
                onChange={e => setFormFocusArea(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {Object.entries(FOCUS_AREA_LABELS).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">IE Firm</label>
              <input
                type="text"
                value={formIeFirm}
                onChange={e => setFormIeFirm(e.target.value)}
                placeholder="e.g. Aurecon"
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
                <th className="pb-2 pr-4">Year</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Capacity</th>
                <th className="pb-2 pr-4">IE Firm</th>
                <th className="pb-2 pr-4">Focus Area</th>
                <th className="pb-2 pr-4">Finding Severity</th>
                <th className="pb-2 pr-4">Status</th>
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
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">{item.review_year}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_BADGE_COLORS[item.project_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {item.project_tier.charAt(0).toUpperCase() + item.project_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink, #2d3748)]">
                      {fmtMw(item.project_mw)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #6b7685)] max-w-[120px] truncate" title={item.ie_firm ?? ''}>
                      {item.ie_firm ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #3d4756)]">
                      {item.focus_area ? (FOCUS_AREA_LABELS[item.focus_area] ?? item.focus_area.replace(/_/g, ' ')) : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      {item.finding_severity ? (
                        <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_BADGE_COLORS[item.finding_severity] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                          {item.finding_severity.charAt(0).toUpperCase() + item.finding_severity.slice(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--ink-2, #9aa5b4)]">—</span>
                      )}
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
                                : a.variant === 'success'
                                ? 'px-2 py-0.5 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'
                                : 'px-2 py-0.5 text-xs rounded border'
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
                  <td colSpan={11} className="py-10 text-center text-[var(--ink-2, #9aa5b4)] text-sm">
                    No IE annual review records found
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
              IE Annual Review &mdash; {actionItem.project_ref} / {actionItem.review_year}
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
