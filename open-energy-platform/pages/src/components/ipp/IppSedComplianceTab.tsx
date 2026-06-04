import { useState, useEffect } from 'react';

interface SedComplianceRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  compliance_year: number;
  revenue_tier: 'micro' | 'small' | 'medium' | 'large' | 'major';
  annual_revenue_zar: number;
  sed_spend_zar: number | null;
  sed_spend_pct: number | null;
  focus_area: string;
  auditor_name: string | null;
  chain_status: string;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SedComplianceKpis {
  total: number;
  active: number;
  sla_breached: number;
  compliant: number;
  non_compliant_lapsed: number;
}

const STATUS_COLORS: Record<string, string> = {
  sed_triggered:             'bg-gray-100 text-gray-500',
  beneficiary_identification:'bg-blue-100 text-blue-700',
  programme_planning:        'bg-cyan-100 text-cyan-700',
  board_approval:            'bg-sky-100 text-sky-700',
  spend_execution:           'bg-indigo-100 text-indigo-700',
  expenditure_verification:  'bg-violet-100 text-violet-700',
  independent_audit:         'bg-purple-100 text-purple-700',
  audit_complete:            'bg-yellow-100 text-yellow-800',
  dmre_submission:           'bg-teal-100 text-teal-700',
  sed_compliant:             'bg-green-100 text-green-700',
  sed_non_compliant:         'bg-red-100 text-red-700',
  sed_lapsed:                'bg-orange-100 text-orange-700',
};

const STATUS_LABELS: Record<string, string> = {
  sed_triggered:             'SED Triggered',
  beneficiary_identification:'Beneficiary Identification',
  programme_planning:        'Programme Planning',
  board_approval:            'Board Approval',
  spend_execution:           'Spend Execution',
  expenditure_verification:  'Expenditure Verification',
  independent_audit:         'Independent Audit',
  audit_complete:            'Audit Complete',
  dmre_submission:           'DMRE Submission',
  sed_compliant:             'SED Compliant',
  sed_non_compliant:         'SED Non-Compliant',
  sed_lapsed:                'SED Lapsed',
};

// INVERTED SLA — higher revenue = more SED obligation = more dangerous colour
const TIER_BADGE_COLORS: Record<string, string> = {
  micro:  'bg-green-100 text-green-800',
  small:  'bg-blue-100 text-blue-800',
  medium: 'bg-indigo-100 text-indigo-800',
  large:  'bg-orange-100 text-orange-800',
  major:  'bg-red-100 text-red-800',
};

const FOCUS_AREA_LABELS: Record<string, string> = {
  education:       'Education',
  healthcare:      'Healthcare',
  infrastructure:  'Infrastructure',
  skills_dev:      'Skills Dev',
  enterprise_dev:  'Enterprise Dev',
  environmental:   'Environmental',
  comprehensive:   'Comprehensive',
};

const TERMINAL_STATUSES = new Set([
  'sed_compliant',
  'sed_non_compliant',
  'sed_lapsed',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS    = ['micro', 'small', 'medium', 'large', 'major'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-gray-700 bg-white';

function fmtZar(amount: number | null | undefined): string {
  if (amount == null) return '—';
  if (amount >= 1_000_000_000) return `R ${(amount / 1_000_000_000).toFixed(1)}B`;
  return `R ${(amount / 1_000_000).toFixed(1)}M`;
}

function fmtPct(pct: number | null | undefined): string {
  if (pct == null) return '—';
  return `${pct.toFixed(1)}%`;
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

export function IppSedComplianceTab() {
  const [items, setItems]               = useState<SedComplianceRecord[]>([]);
  const [kpis, setKpis]                 = useState<SedComplianceKpis | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier]     = useState('');
  const [page, setPage]                 = useState(1);

  // Create form state
  const [showCreate, setShowCreate]                     = useState(false);
  const [creating, setCreating]                         = useState(false);
  const [createError, setCreateError]                   = useState<string | null>(null);
  const [formProjectRef, setFormProjectRef]             = useState('');
  const [formComplianceYear, setFormComplianceYear]     = useState(String(new Date().getFullYear()));
  const [formAnnualRevenue, setFormAnnualRevenue]       = useState('');
  const [formSedSpendZar, setFormSedSpendZar]           = useState('');
  const [formSedSpendPct, setFormSedSpendPct]           = useState('');
  const [formFocusArea, setFormFocusArea]               = useState('comprehensive');
  const [formAuditorName, setFormAuditorName]           = useState('');
  const [formTier, setFormTier]                         = useState<typeof TIERS[number]>('medium');
  const [formNotes, setFormNotes]                       = useState('');

  // Action modal state
  const [actionItem, setActionItem]       = useState<SedComplianceRecord | null>(null);
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
      const res = await fetch(`/api/ipp-sed-compliance?${params}`, {
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
  const compliant          = kpis?.compliant           ?? items.filter(i => i.chain_status === 'sed_compliant').length;
  const nonCompliantLapsed = kpis?.non_compliant_lapsed ?? items.filter(i =>
    i.chain_status === 'sed_non_compliant' || i.chain_status === 'sed_lapsed'
  ).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formComplianceYear || !formAnnualRevenue) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:        formProjectRef.trim(),
        compliance_year:    parseInt(formComplianceYear, 10),
        annual_revenue_zar: parseFloat(formAnnualRevenue),
        focus_area:         formFocusArea,
        revenue_tier:       formTier,
      };
      if (formSedSpendZar.trim())  body.sed_spend_zar  = parseFloat(formSedSpendZar);
      if (formSedSpendPct.trim())  body.sed_spend_pct  = parseFloat(formSedSpendPct);
      if (formAuditorName.trim())  body.auditor_name   = formAuditorName.trim();
      if (formNotes.trim())        body.notes          = formNotes.trim();

      const res = await fetch('/api/ipp-sed-compliance', {
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
      setFormComplianceYear(String(new Date().getFullYear()));
      setFormAnnualRevenue('');
      setFormSedSpendZar('');
      setFormSedSpendPct('');
      setFormFocusArea('comprehensive');
      setFormAuditorName('');
      setFormTier('medium');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openAction(item: SedComplianceRecord, name: string, label: string) {
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
      const res = await fetch(`/api/ipp-sed-compliance/${actionItem.id}/action`, {
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

  function getActions(item: SedComplianceRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    switch (item.chain_status) {
      case 'sed_triggered':
        return [{ name: 'identify_beneficiaries', label: 'Identify Beneficiaries' }];
      case 'beneficiary_identification':
        return [{ name: 'plan_programme', label: 'Plan Programme' }];
      case 'programme_planning':
        return [{ name: 'obtain_board_approval', label: 'Obtain Board Approval' }];
      case 'board_approval':
        return [{ name: 'execute_spend', label: 'Execute Spend' }];
      case 'spend_execution':
        return [{ name: 'verify_expenditure', label: 'Verify Expenditure' }];
      case 'expenditure_verification':
        return [{ name: 'commence_audit', label: 'Commence Audit' }];
      case 'independent_audit':
        return [{ name: 'complete_audit', label: 'Complete Audit' }];
      case 'audit_complete':
        return [{ name: 'submit_to_dmre', label: 'Submit to DMRE' }];
      case 'dmre_submission':
        return [
          { name: 'confirm_compliant',    label: 'Confirm Compliant',    variant: 'success' },
          { name: 'declare_non_compliant', label: 'Declare Non-Compliant', variant: 'danger'  },
          { name: 'lapse_sed',            label: 'Lapse SED',            variant: 'danger'  },
        ];
      default:
        return [];
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiChip label="Total Records"          value={total} />
        <KpiChip label="Active"                 value={active}             mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"           value={breached}           mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Compliant"              value={compliant}          mode={compliant > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Non-Compliant / Lapsed" value={nonCompliantLapsed} mode={nonCompliantLapsed > 0 ? 'danger' : 'neutral'} />
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
          + New SED Compliance
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3"
        >
          <div className="text-sm font-semibold text-blue-800">New SED Compliance Record</div>
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
              <label className="block text-xs text-gray-600 mb-1">Compliance Year *</label>
              <input
                type="number"
                value={formComplianceYear}
                onChange={e => setFormComplianceYear(e.target.value)}
                min={2000}
                max={2100}
                step={1}
                placeholder="2026"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Annual Revenue (ZAR) *</label>
              <input
                type="number"
                value={formAnnualRevenue}
                onChange={e => setFormAnnualRevenue(e.target.value)}
                min={0}
                step={1}
                placeholder="85000000"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Revenue Tier *</label>
              <select
                value={formTier}
                onChange={e => setFormTier(e.target.value as typeof formTier)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {TIERS.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">SED Spend (ZAR, optional)</label>
              <input
                type="number"
                value={formSedSpendZar}
                onChange={e => setFormSedSpendZar(e.target.value)}
                min={0}
                step={1}
                placeholder="1300000"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">SED Spend % (optional, e.g. 1.5)</label>
              <input
                type="number"
                value={formSedSpendPct}
                onChange={e => setFormSedSpendPct(e.target.value)}
                min={0}
                max={100}
                step={0.01}
                placeholder="1.5"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Focus Area *</label>
              <select
                value={formFocusArea}
                onChange={e => setFormFocusArea(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {Object.entries(FOCUS_AREA_LABELS).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Auditor Name (optional)</label>
              <input
                type="text"
                value={formAuditorName}
                onChange={e => setFormAuditorName(e.target.value)}
                placeholder="e.g. PwC / Deloitte"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">Notes</label>
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
                <th className="pb-2 pr-4">Project Ref</th>
                <th className="pb-2 pr-4">Year</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Annual Revenue</th>
                <th className="pb-2 pr-4">SED Spend</th>
                <th className="pb-2 pr-4">SED %</th>
                <th className="pb-2 pr-4">Focus Area</th>
                <th className="pb-2 pr-4">Auditor</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA Breached</th>
                <th className="pb-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions = getActions(item);
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 text-xs font-mono text-gray-700">{item.project_ref}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-600">{item.compliance_year}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_BADGE_COLORS[item.revenue_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                        {item.revenue_tier.charAt(0).toUpperCase() + item.revenue_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-700">
                      {fmtZar(item.annual_revenue_zar)}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-700">
                      {fmtZar(item.sed_spend_zar)}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-600">
                      {fmtPct(item.sed_spend_pct)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-600">
                      {FOCUS_AREA_LABELS[item.focus_area] ?? item.focus_area.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-500 max-w-[120px] truncate" title={item.auditor_name ?? ''}>
                      {item.auditor_name ?? '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {item.sla_breached === 1 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">Yes</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400">No</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {actions.map(a => (
                          <button
                            key={a.name}
                            onClick={() => openAction(item, a.name, a.label)}
                            className={
                              a.variant === 'danger'
                                ? 'px-2 py-0.5 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
                                : a.variant === 'warn'
                                ? 'px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border border-yellow-200'
                                : a.variant === 'success'
                                ? 'px-2 py-0.5 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'
                                : 'px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
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
                  <td colSpan={11} className="py-10 text-center text-gray-400 text-sm">
                    No SED compliance records found
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

      {/* Action modal */}
      {actionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-gray-800 mb-1">{actionLabel}</div>
            <div className="text-xs text-gray-500 mb-4">
              SED Compliance &mdash; {actionItem.project_ref} / {actionItem.compliance_year}
            </div>
            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Notes (optional)</label>
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
              <button
                onClick={closeAction}
                className="px-3 py-1.5 text-xs border rounded bg-white text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitAction}
                disabled={actionLoading}
                className="px-4 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
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
