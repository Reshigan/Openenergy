import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface MilestoneCert {
  id: string;
  participant_id: string;
  project_ref: string;
  milestone_type: string;
  energy_type: string;
  project_mw: number;
  project_tier: 'small' | 'medium' | 'large' | 'utility' | 'strategic';
  chain_status: string;
  scheduled_date: string | null;
  sla_due_date: string | null;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface MilestoneCertKpis {
  total: number;
  active: number;
  sla_breached: number;
  certified: number;
  rejected_lapsed: number;
}

const STATUS_COLORS: Record<string, string> = {
  milestone_triggered:          'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  documentation_preparation:    'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  ie_pre_review:                'bg-cyan-100 text-cyan-700',
  documentation_submitted:      'bg-sky-100 text-sky-700',
  ipp_office_acknowledgment:    'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  technical_verification:       'bg-purple-100 text-purple-700',
  clarification_requested:      'bg-yellow-100 text-yellow-800',
  clarification_submitted:      'bg-teal-100 text-teal-700',
  final_review:                 'bg-orange-100 text-orange-700',
  milestone_certified:          'bg-green-100 text-green-700',
  milestone_rejected:           'bg-red-100 text-red-700',
  milestone_lapsed:             'bg-rose-100 text-rose-700',
};

const STATUS_LABELS: Record<string, string> = {
  milestone_triggered:          'Milestone Triggered',
  documentation_preparation:    'Documentation Preparation',
  ie_pre_review:                'IE Pre-Review',
  documentation_submitted:      'Documentation Submitted',
  ipp_office_acknowledgment:    'IPP Office Acknowledgment',
  technical_verification:       'Technical Verification',
  clarification_requested:      'Clarification Requested',
  clarification_submitted:      'Clarification Submitted',
  final_review:                 'Final Review',
  milestone_certified:          'Milestone Certified',
  milestone_rejected:           'Milestone Rejected',
  milestone_lapsed:             'Milestone Lapsed',
};

const TIER_BADGE_COLORS: Record<string, string> = {
  small:     'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  medium:    'bg-sky-100 text-sky-800',
  large:     'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  utility:   'bg-purple-100 text-purple-800',
  strategic: 'bg-violet-100 text-violet-800',
};

const MILESTONE_TYPE_LABELS: Record<string, string> = {
  financial_close:              'Financial Close',
  construction_start:           'Construction Start',
  test_cod:                     'Test COD',
  cod:                          'COD',
  grid_connection:              'Grid Connection',
  commissioning_complete:       'Commissioning Complete',
  performance_test_complete:    'Performance Test Complete',
};

const ENERGY_TYPE_LABELS: Record<string, string> = {
  solar_pv:        'Solar PV',
  wind_onshore:    'Wind Onshore',
  wind_offshore:   'Wind Offshore',
  biomass:         'Biomass',
  small_hydro:     'Small Hydro',
  csp:             'CSP',
  battery_storage: 'Battery Storage',
};

const TERMINAL_STATUSES = new Set(['milestone_certified', 'milestone_rejected', 'milestone_lapsed']);

const STATUSES        = Object.keys(STATUS_LABELS);
const TIERS           = ['small', 'medium', 'large', 'utility', 'strategic'] as const;
const MILESTONE_TYPES = Object.keys(MILESTONE_TYPE_LABELS);
const ENERGY_TYPES    = Object.keys(ENERGY_TYPE_LABELS);

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[var(--ink, #2d3748)] bg-surface-v2';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
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

export function IppMilestoneCertTab() {
  const [items, setItems]               = useState<MilestoneCert[]>([]);
  const [kpis, setKpis]                 = useState<MilestoneCertKpis | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier]     = useState('');
  const [page, setPage]                 = useState(1);

  // Create form state
  const [showCreate, setShowCreate]                 = useState(false);
  const [creating, setCreating]                     = useState(false);
  const [createError, setCreateError]               = useState<string | null>(null);
  const [formProjectRef, setFormProjectRef]         = useState('');
  const [formMilestoneType, setFormMilestoneType]   = useState('financial_close');
  const [formProjectMw, setFormProjectMw]           = useState('');
  const [formEnergyType, setFormEnergyType]         = useState('solar_pv');
  const [formScheduledDate, setFormScheduledDate]   = useState('');
  const [formTier, setFormTier]                     = useState<typeof TIERS[number]>('medium');
  const [formNotes, setFormNotes]                   = useState('');

  // Action modal state
  const [actionItem, setActionItem]       = useState<MilestoneCert | null>(null);
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
      const res = await fetch(`/api/ipp-milestone-certs?${params}`, {
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
  const certified      = kpis?.certified      ?? items.filter(i => i.chain_status === 'milestone_certified').length;
  const rejectedLapsed = kpis?.rejected_lapsed ?? items.filter(i =>
    i.chain_status === 'milestone_rejected' || i.chain_status === 'milestone_lapsed'
  ).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formProjectMw) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:    formProjectRef.trim(),
        milestone_type: formMilestoneType,
        project_mw:     parseFloat(formProjectMw),
        energy_type:    formEnergyType,
        project_tier:   formTier,
      };
      if (formScheduledDate) body.scheduled_date = formScheduledDate;
      if (formNotes.trim())  body.notes = formNotes.trim();

      const res = await fetch('/api/ipp-milestone-certs', {
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
      setFormMilestoneType('financial_close');
      setFormProjectMw('');
      setFormEnergyType('solar_pv');
      setFormScheduledDate('');
      setFormTier('medium');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openAction(item: MilestoneCert, name: string, label: string) {
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
      const res = await fetch(`/api/ipp-milestone-certs/${actionItem.id}/action`, {
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

  function getActions(item: MilestoneCert): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    switch (item.chain_status) {
      case 'milestone_triggered':
        return [{ name: 'commence_documentation', label: 'Commence Documentation' }];
      case 'documentation_preparation':
        return [{ name: 'submit_for_ie_review', label: 'Submit for IE Review' }];
      case 'ie_pre_review':
        return [{ name: 'submit_to_ipp_office', label: 'Submit to IPP Office' }];
      case 'documentation_submitted':
        return [{ name: 'acknowledge_receipt', label: 'Acknowledge Receipt' }];
      case 'ipp_office_acknowledgment':
        return [{ name: 'commence_technical_verification', label: 'Commence Technical Verification' }];
      case 'technical_verification':
        return [
          { name: 'request_clarification',   label: 'Request Clarification',   variant: 'warn' },
          { name: 'commence_final_review',    label: 'Commence Final Review' },
        ];
      case 'clarification_requested':
        return [{ name: 'submit_clarification', label: 'Submit Clarification' }];
      case 'clarification_submitted':
        return [{ name: 'commence_final_review', label: 'Commence Final Review' }];
      case 'final_review':
        return [
          { name: 'certify_milestone', label: 'Certify Milestone', variant: 'success' },
          { name: 'reject_milestone',  label: 'Reject Milestone',  variant: 'danger' },
          { name: 'lapse_milestone',   label: 'Lapse Milestone',   variant: 'warn' },
        ];
      default:
        return [];
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiChip label="Total Certifications" value={total} />
        <KpiChip label="Active"               value={active}         mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"         value={breached}       mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Certified"            value={certified}      mode={certified > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Rejected / Lapsed"    value={rejectedLapsed} mode={rejectedLapsed > 0 ? 'danger' : 'neutral'} />
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
          + New Milestone Certification
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'oklch(0.87 0.010 250)', background: 'oklch(0.94 0.006 250)' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>New Milestone Certification</div>
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
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Milestone Type *</label>
              <select
                value={formMilestoneType}
                onChange={e => setFormMilestoneType(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {MILESTONE_TYPES.map(m => (
                  <option key={m} value={m}>{MILESTONE_TYPE_LABELS[m]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Project MW *</label>
              <input
                type="number"
                value={formProjectMw}
                onChange={e => setFormProjectMw(e.target.value)}
                min={0}
                step={0.1}
                placeholder="140.0"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Energy Type *</label>
              <select
                value={formEnergyType}
                onChange={e => setFormEnergyType(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {ENERGY_TYPES.map(et => (
                  <option key={et} value={et}>{ENERGY_TYPE_LABELS[et]}</option>
                ))}
              </select>
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
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Scheduled Date</label>
              <input
                type="date"
                value={formScheduledDate}
                onChange={e => setFormScheduledDate(e.target.value)}
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
                <th className="pb-2 pr-4">Milestone Type</th>
                <th className="pb-2 pr-4">Energy Type</th>
                <th className="pb-2 pr-4">MW</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Scheduled</th>
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
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">
                      {MILESTONE_TYPE_LABELS[item.milestone_type] ?? item.milestone_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink, #2d3748)]">
                      {ENERGY_TYPE_LABELS[item.energy_type] ?? item.energy_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink, #2d3748)]">
                      {item.project_mw != null ? `${item.project_mw} MW` : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_BADGE_COLORS[item.project_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {item.project_tier.charAt(0).toUpperCase() + item.project_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? statusLabel(item.chain_status).text}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #6b7685)]">
                      {fmtDate(item.scheduled_date)}
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
                    No milestone certification records found
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
              Milestone Certification — {actionItem.project_ref} /{' '}
              {MILESTONE_TYPE_LABELS[actionItem.milestone_type] ?? actionItem.milestone_type.replace(/_/g, ' ')}
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
