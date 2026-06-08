import { useState, useEffect } from 'react';

interface InsrRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  renewal_year: number;
  premium_tier: 'small' | 'medium' | 'large' | 'major' | 'flagship';
  annual_premium_zar: number;
  insured_value_zar: number | null;
  line_type: string;
  broker_name: string | null;
  policy_expiry_date: string | null;
  chain_status: string;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface InsrKpis {
  total: number;
  active: number;
  sla_breached: number;
  confirmed_adequate: number;
  inadequate_lapsed: number;
}

const STATUS_COLORS: Record<string, string> = {
  renewal_triggered:              'bg-gray-100 text-gray-500',
  coverage_gap_analysis:          'bg-blue-100 text-blue-700',
  broker_instruction:             'bg-cyan-100 text-cyan-700',
  market_placement:               'bg-sky-100 text-sky-700',
  terms_received:                 'bg-indigo-100 text-indigo-700',
  ipp_lender_review:              'bg-violet-100 text-violet-700',
  documentation_preparation:      'bg-purple-100 text-purple-700',
  documents_submitted:            'bg-yellow-100 text-yellow-800',
  lender_confirmation_requested:  'bg-teal-100 text-teal-700',
  confirmed_adequate:             'bg-green-100 text-green-700',
  confirmed_inadequate:           'bg-orange-100 text-orange-700',
  coverage_lapsed:                'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  renewal_triggered:              'Renewal Triggered',
  coverage_gap_analysis:          'Coverage Gap Analysis',
  broker_instruction:             'Broker Instruction',
  market_placement:               'Market Placement',
  terms_received:                 'Terms Received',
  ipp_lender_review:              'IPP/Lender Review',
  documentation_preparation:      'Documentation Preparation',
  documents_submitted:            'Documents Submitted',
  lender_confirmation_requested:  'Lender Confirmation Requested',
  confirmed_adequate:             'Confirmed Adequate',
  confirmed_inadequate:           'Confirmed Inadequate',
  coverage_lapsed:                'Coverage Lapsed',
};

// INVERTED SLA — higher premium = more complex = deeper colour
const TIER_BADGE_COLORS: Record<string, string> = {
  small:    'bg-blue-100 text-blue-800',
  medium:   'bg-indigo-100 text-indigo-800',
  large:    'bg-purple-100 text-purple-800',
  major:    'bg-orange-100 text-orange-800',
  flagship: 'bg-red-100 text-red-800',
};

const LINE_TYPE_LABELS: Record<string, string> = {
  car:                      'CAR',
  operational_all_risk:     'Operational All-Risk',
  third_party_liability:    'Third-Party Liability',
  business_interruption:    'Business Interruption',
  directors_officers:       'D&O',
  environmental_impairment: 'Environmental Impairment',
  comprehensive_package:    'Comprehensive Package',
};

const TERMINAL_STATUSES = new Set([
  'confirmed_adequate',
  'confirmed_inadequate',
  'coverage_lapsed',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS    = ['small', 'medium', 'large', 'major', 'flagship'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-gray-700 bg-white';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtZar(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `R ${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  return `R ${(amount / 1_000_000).toFixed(1)}M`;
}

function isExpired(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
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

export function IppInsrTab() {
  const [items, setItems]               = useState<InsrRecord[]>([]);
  const [kpis, setKpis]                 = useState<InsrKpis | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier]     = useState('');
  const [page, setPage]                 = useState(1);

  // Create form state
  const [showCreate, setShowCreate]                   = useState(false);
  const [creating, setCreating]                       = useState(false);
  const [createError, setCreateError]                 = useState<string | null>(null);
  const [formProjectRef, setFormProjectRef]           = useState('');
  const [formRenewalYear, setFormRenewalYear]         = useState('');
  const [formAnnualPremium, setFormAnnualPremium]     = useState('');
  const [formInsuredValue, setFormInsuredValue]       = useState('');
  const [formLineType, setFormLineType]               = useState('comprehensive_package');
  const [formPolicyExpiry, setFormPolicyExpiry]       = useState('');
  const [formBrokerName, setFormBrokerName]           = useState('');
  const [formTier, setFormTier]                       = useState<typeof TIERS[number]>('medium');
  const [formNotes, setFormNotes]                     = useState('');

  // Action modal state
  const [actionItem, setActionItem]       = useState<InsrRecord | null>(null);
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
      const res = await fetch(`/api/ipp-insurance-renewals?${params}`, {
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
  const total             = kpis?.total              ?? items.length;
  const active            = kpis?.active             ?? items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached          = kpis?.sla_breached       ?? items.filter(i => i.sla_breached === 1).length;
  const confirmedAdequate = kpis?.confirmed_adequate ?? items.filter(i => i.chain_status === 'confirmed_adequate').length;
  const inadequateLapsed  = kpis?.inadequate_lapsed  ?? items.filter(i =>
    i.chain_status === 'confirmed_inadequate' || i.chain_status === 'coverage_lapsed'
  ).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formRenewalYear || !formAnnualPremium) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:        formProjectRef.trim(),
        renewal_year:       parseInt(formRenewalYear, 10),
        annual_premium_zar: parseFloat(formAnnualPremium),
        line_type:          formLineType,
        premium_tier:       formTier,
      };
      if (formInsuredValue.trim())  body.insured_value_zar   = parseFloat(formInsuredValue);
      if (formPolicyExpiry.trim())  body.policy_expiry_date  = formPolicyExpiry;
      if (formBrokerName.trim())    body.broker_name         = formBrokerName.trim();
      if (formNotes.trim())         body.notes               = formNotes.trim();

      const res = await fetch('/api/ipp-insurance-renewals', {
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
      setFormRenewalYear('');
      setFormAnnualPremium('');
      setFormInsuredValue('');
      setFormLineType('comprehensive_package');
      setFormPolicyExpiry('');
      setFormBrokerName('');
      setFormTier('medium');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openAction(item: InsrRecord, name: string, label: string) {
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
      const res = await fetch(`/api/ipp-insurance-renewals/${actionItem.id}/action`, {
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

  function getActions(item: InsrRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    switch (item.chain_status) {
      case 'renewal_triggered':
        return [{ name: 'commence_gap_analysis', label: 'Commence Gap Analysis' }];
      case 'coverage_gap_analysis':
        return [{ name: 'instruct_broker', label: 'Instruct Broker' }];
      case 'broker_instruction':
        return [{ name: 'place_in_market', label: 'Place in Market' }];
      case 'market_placement':
        return [{ name: 'receive_terms', label: 'Receive Terms' }];
      case 'terms_received':
        return [{ name: 'commence_lender_review', label: 'Commence Lender Review' }];
      case 'ipp_lender_review':
        return [{ name: 'prepare_documentation', label: 'Prepare Documentation' }];
      case 'documentation_preparation':
        return [{ name: 'submit_documents', label: 'Submit Documents' }];
      case 'documents_submitted':
        return [{ name: 'request_lender_confirmation', label: 'Request Lender Confirmation' }];
      case 'lender_confirmation_requested':
        return [
          { name: 'confirm_adequate',   label: 'Confirm Adequate',   variant: 'success' },
          { name: 'confirm_inadequate', label: 'Confirm Inadequate', variant: 'danger'  },
          { name: 'lapse_coverage',     label: 'Lapse Coverage',     variant: 'danger'  },
        ];
      default:
        return [];
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiChip label="Total Renewals"        value={total} />
        <KpiChip label="Active"                value={active}            mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"          value={breached}          mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Confirmed Adequate"    value={confirmedAdequate} mode={confirmedAdequate > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Inadequate / Lapsed"   value={inadequateLapsed}  mode={inadequateLapsed > 0 ? 'danger' : 'neutral'} />
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
          className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs border border-gray-200 hover:bg-gray-200"
        >
          Refresh
        </button>
        <button type="button"
          onClick={() => setShowCreate(v => !v)}
          className="ml-auto px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
        >
          + New Insurance Renewal
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3"
        >
          <div className="text-sm font-semibold text-blue-800">New Insurance Renewal</div>
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
              <label className="block text-xs text-gray-600 mb-1">Renewal Year *</label>
              <input
                type="number"
                value={formRenewalYear}
                onChange={e => setFormRenewalYear(e.target.value)}
                placeholder="2026"
                min={2000}
                max={2100}
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Annual Premium (ZAR) *</label>
              <input
                type="number"
                value={formAnnualPremium}
                onChange={e => setFormAnnualPremium(e.target.value)}
                min={0}
                step={1}
                placeholder="18000000"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Insured Value (ZAR)</label>
              <input
                type="number"
                value={formInsuredValue}
                onChange={e => setFormInsuredValue(e.target.value)}
                min={0}
                step={1}
                placeholder="2100000000"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Line Type *</label>
              <select
                value={formLineType}
                onChange={e => setFormLineType(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {Object.entries(LINE_TYPE_LABELS).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Premium Tier *</label>
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
              <label className="block text-xs text-gray-600 mb-1">Policy Expiry Date *</label>
              <input
                type="date"
                value={formPolicyExpiry}
                onChange={e => setFormPolicyExpiry(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Broker Name</label>
              <input
                type="text"
                value={formBrokerName}
                onChange={e => setFormBrokerName(e.target.value)}
                placeholder="e.g. Marsh"
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
                <th className="pb-2 pr-4">Annual Premium</th>
                <th className="pb-2 pr-4">Insured Value</th>
                <th className="pb-2 pr-4">Line Type</th>
                <th className="pb-2 pr-4">Broker</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Policy Expiry</th>
                <th className="pb-2 pr-4">SLA Breached</th>
                <th className="pb-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const expired = isExpired(item.policy_expiry_date);
                const actions = getActions(item);
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 text-xs font-mono text-gray-700">{item.project_ref}</td>
                    <td className="py-2 pr-4 text-xs text-gray-700">{item.renewal_year}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_BADGE_COLORS[item.premium_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                        {item.premium_tier.charAt(0).toUpperCase() + item.premium_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-700">
                      {fmtZar(item.annual_premium_zar)}
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-gray-500">
                      {item.insured_value_zar != null ? fmtZar(item.insured_value_zar) : '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-600">
                      {LINE_TYPE_LABELS[item.line_type] ?? item.line_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-500 max-w-[120px] truncate" title={item.broker_name ?? ''}>
                      {item.broker_name ?? '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={`py-2 pr-4 text-xs ${expired ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {expired ? '⚠ ' : ''}{fmtDate(item.policy_expiry_date)}
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
                    No insurance renewal records found
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
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-50"
          >
            &larr; Prev
          </button>
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button type="button"
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
              Insurance Renewal &mdash; {actionItem.project_ref} / {actionItem.renewal_year}
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
              <button type="button"
                onClick={closeAction}
                className="px-3 py-1.5 text-xs border rounded bg-white text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button type="button"
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
