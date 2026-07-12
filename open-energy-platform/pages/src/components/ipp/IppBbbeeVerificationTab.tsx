import React, { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface BbbeeVerificationRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  verification_year: number;
  equity_tier: 'standard' | 'enhanced' | 'majority' | 'transformative' | 'exemplary';
  bbbee_target_pct: number | null;
  bbbee_score: number | null;
  bbbee_level: number | null;
  agency_name: string | null;
  certificate_expiry: string | null;
  chain_status: string;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface BbbeeVerificationKpis {
  total: number;
  active: number;
  sla_breached: number;
  verified: number;
  non_compliant_lapsed: number;
}

const STATUS_COLORS: Record<string, string> = {
  verification_triggered:   'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  documentation_preparation:'',
  agency_engagement:        'bg-cyan-100 text-cyan-700',
  data_submission:          'bg-sky-100 text-sky-700',
  agency_assessment:        '',
  preliminary_score_issued: 'bg-violet-100 text-violet-700',
  ipp_review:               'bg-purple-100 text-purple-700',
  final_assessment:         'bg-yellow-100 text-yellow-800',
  certificate_issued:       'bg-teal-100 text-teal-700',
  bbbee_verified:           'bg-green-100 text-green-700',
  bbbee_non_compliant:      'bg-red-100 text-red-700',
  certificate_lapsed:       'bg-orange-100 text-orange-700',
};

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  documentation_preparation: { background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)' },
  agency_assessment:         { background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)' },
};

const STATUS_LABELS: Record<string, string> = {
  verification_triggered:   'Verification Triggered',
  documentation_preparation:'Documentation Preparation',
  agency_engagement:        'Agency Engagement',
  data_submission:          'Data Submission',
  agency_assessment:        'Agency Assessment',
  preliminary_score_issued: 'Preliminary Score Issued',
  ipp_review:               'IPP Review',
  final_assessment:         'Final Assessment',
  certificate_issued:       'Certificate Issued',
  bbbee_verified:           'BBBEE Verified',
  bbbee_non_compliant:      'BBBEE Non-Compliant',
  certificate_lapsed:       'Certificate Lapsed',
};

// URGENT SLA — higher equity target = more DMRE scrutiny = tighter
const TIER_BADGE_COLORS: Record<string, string> = {
  standard:      'bg-green-100 text-green-800',
  enhanced:      '',
  majority:      'bg-yellow-100 text-yellow-800',
  transformative:'bg-orange-100 text-orange-800',
  exemplary:     'bg-red-100 text-red-800',
};

const TIER_BADGE_STYLES: Record<string, React.CSSProperties> = {
  enhanced: { background: 'oklch(0.94 0.006 250)', color: 'oklch(0.17 0.010 250)' },
};

const TERMINAL_STATUSES = new Set([
  'bbbee_verified',
  'bbbee_non_compliant',
  'certificate_lapsed',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS    = ['standard', 'enhanced', 'majority', 'transformative', 'exemplary'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[var(--ink, #2d3748)] bg-surface-v2';

function fmtPct(pct: number | null | undefined): string {
  if (pct == null) return '—';
  return `${pct.toFixed(1)}%`;
}

function fmtScore(score: number | null | undefined): string {
  if (score == null) return '—';
  return score.toFixed(1);
}

function fmtLevel(level: number | null | undefined): string {
  if (level == null) return '—';
  return `Level ${level}`;
}

function fmtDate(dateStr: string | null | undefined): { text: string; isExpired: boolean } {
  if (!dateStr) return { text: '—', isExpired: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { text: '—', isExpired: false };
  const now = new Date();
  const isExpired = d < now;
  const text = d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  return { text, isExpired };
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

export function IppBbbeeVerificationTab() {
  const [items, setItems]               = useState<BbbeeVerificationRecord[]>([]);
  const [kpis, setKpis]                 = useState<BbbeeVerificationKpis | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier]     = useState('');
  const [page, setPage]                 = useState(1);

  // Create form state
  const [showCreate, setShowCreate]                       = useState(false);
  const [creating, setCreating]                           = useState(false);
  const [createError, setCreateError]                     = useState<string | null>(null);
  const [formProjectRef, setFormProjectRef]               = useState('');
  const [formVerificationYear, setFormVerificationYear]   = useState(String(new Date().getFullYear()));
  const [formBbbeeTargetPct, setFormBbbeeTargetPct]       = useState('');
  const [formAgencyName, setFormAgencyName]               = useState('');
  const [formCertificateExpiry, setFormCertificateExpiry] = useState('');
  const [formTier, setFormTier]                           = useState<typeof TIERS[number]>('standard');
  const [formNotes, setFormNotes]                         = useState('');

  // Action modal state
  const [actionItem, setActionItem]       = useState<BbbeeVerificationRecord | null>(null);
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
      const res = await fetch(`/api/ipp-bbbee-verification?${params}`, {
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
  const total              = kpis?.total               ?? items.length;
  const active             = kpis?.active              ?? items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached           = kpis?.sla_breached        ?? items.filter(i => i.sla_breached === 1).length;
  const verified           = kpis?.verified            ?? items.filter(i => i.chain_status === 'bbbee_verified').length;
  const nonCompliantLapsed = kpis?.non_compliant_lapsed ?? items.filter(i =>
    i.chain_status === 'bbbee_non_compliant' || i.chain_status === 'certificate_lapsed'
  ).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formVerificationYear) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:       formProjectRef.trim(),
        verification_year: parseInt(formVerificationYear, 10),
        equity_tier:       formTier,
      };
      if (formBbbeeTargetPct.trim())   body.bbbee_target_pct   = parseFloat(formBbbeeTargetPct);
      if (formAgencyName.trim())       body.agency_name        = formAgencyName.trim();
      if (formCertificateExpiry)       body.certificate_expiry = formCertificateExpiry;
      if (formNotes.trim())            body.notes              = formNotes.trim();

      const res = await fetch('/api/ipp-bbbee-verification', {
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
      setFormVerificationYear(String(new Date().getFullYear()));
      setFormBbbeeTargetPct('');
      setFormAgencyName('');
      setFormCertificateExpiry('');
      setFormTier('standard');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openAction(item: BbbeeVerificationRecord, name: string, label: string) {
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
      const res = await fetch(`/api/ipp-bbbee-verification/${actionItem.id}/action`, {
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

  function getActions(item: BbbeeVerificationRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    switch (item.chain_status) {
      case 'verification_triggered':
        return [{ name: 'prepare_documentation', label: 'Prepare Documentation' }];
      case 'documentation_preparation':
        return [{ name: 'engage_agency', label: 'Engage Agency' }];
      case 'agency_engagement':
        return [{ name: 'submit_data', label: 'Submit Data' }];
      case 'data_submission':
        return [{ name: 'commence_assessment', label: 'Commence Assessment' }];
      case 'agency_assessment':
        return [{ name: 'issue_preliminary_score', label: 'Issue Preliminary Score' }];
      case 'preliminary_score_issued':
        return [{ name: 'commence_ipp_review', label: 'Commence IPP Review' }];
      case 'ipp_review':
        return [{ name: 'commence_final_assessment', label: 'Commence Final Assessment' }];
      case 'final_assessment':
        return [{ name: 'issue_certificate', label: 'Issue Certificate' }];
      case 'certificate_issued':
        return [
          { name: 'confirm_verified',     label: 'Confirm Verified',      variant: 'success' },
          { name: 'declare_non_compliant', label: 'Declare Non-Compliant', variant: 'danger'  },
          { name: 'lapse_certificate',    label: 'Lapse Certificate',     variant: 'danger'  },
        ];
      default:
        return [];
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiChip label="Total Records"           value={total} />
        <KpiChip label="Active"                  value={active}             mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"            value={breached}           mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Verified"                value={verified}           mode={verified > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Non-Compliant / Lapsed"  value={nonCompliantLapsed} mode={nonCompliantLapsed > 0 ? 'danger' : 'neutral'} />
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
          + New BBBEE Verification
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'oklch(0.87 0.010 250)', background: 'oklch(0.94 0.006 250)' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>New BBBEE Verification Record</div>
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
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Verification Year *</label>
              <input
                type="number"
                value={formVerificationYear}
                onChange={e => setFormVerificationYear(e.target.value)}
                min={2000}
                max={2100}
                step={1}
                placeholder="2026"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Equity Tier *</label>
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
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">BBBEE Target % (e.g. 26.0)</label>
              <input
                type="number"
                value={formBbbeeTargetPct}
                onChange={e => setFormBbbeeTargetPct(e.target.value)}
                min={0}
                max={100}
                step={0.01}
                placeholder="26.0"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Agency Name (optional)</label>
              <input
                type="text"
                value={formAgencyName}
                onChange={e => setFormAgencyName(e.target.value)}
                placeholder="e.g. Empowerdex / SizweNtsalubaGobodo"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Certificate Expiry (optional)</label>
              <input
                type="date"
                value={formCertificateExpiry}
                onChange={e => setFormCertificateExpiry(e.target.value)}
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
                <th className="pb-2 pr-4">Equity Tier</th>
                <th className="pb-2 pr-4">Target %</th>
                <th className="pb-2 pr-4">Score</th>
                <th className="pb-2 pr-4">Level</th>
                <th className="pb-2 pr-4">Agency</th>
                <th className="pb-2 pr-4">Cert. Expiry</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA Breached</th>
                <th className="pb-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions = getActions(item);
                const expiry  = fmtDate(item.certificate_expiry);
                return (
                  <tr key={item.id} className="border-b hover:bg-[var(--s2, #eef2f7)]">
                    <td className="py-2 pr-4 text-xs font-mono text-[var(--ink, #2d3748)]">{item.project_ref}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink-2, #3d4756)]">{item.verification_year}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_BADGE_COLORS[item.equity_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`} style={TIER_BADGE_STYLES[item.equity_tier]}>
                        {item.equity_tier.charAt(0).toUpperCase() + item.equity_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink-2, #3d4756)]">
                      {fmtPct(item.bbbee_target_pct)}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[var(--ink, #2d3748)]">
                      {fmtScore(item.bbbee_score)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #3d4756)]">
                      {fmtLevel(item.bbbee_level)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--ink-2, #6b7685)] max-w-[140px] truncate" title={item.agency_name ?? ''}>
                      {item.agency_name ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums">
                      <span className={expiry.isExpired ? 'text-red-600 font-medium' : 'text-[var(--ink-2, #3d4756)]'}>
                        {expiry.text}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`} style={STATUS_STYLES[item.chain_status]}>
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
                                : 'px-2 py-0.5 text-xs rounded border'
                            }
                            style={
                              !a.variant
                                ? { background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)', borderColor: 'oklch(0.87 0.010 250)' }
                                : undefined
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
                  <td colSpan={11} className="py-10 text-center text-[var(--ink-2, #9aa5b4)] text-sm">
                    No BBBEE verification records found
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
              BBBEE Verification &mdash; {actionItem.project_ref} / {actionItem.verification_year}
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
