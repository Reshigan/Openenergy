import { useState, useEffect } from 'react';

interface PerfSecurityRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  bond_reference: string | null;
  bond_tier: 'micro' | 'small' | 'medium' | 'large' | 'major';
  bond_quantum_zar: number;
  security_type: string;
  issuing_bank: string | null;
  beneficiary: string | null;
  chain_status: string;
  sla_breached: number;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PerfSecurityKpis {
  total: number;
  active: number;
  sla_breached: number;
  confirmed: number;
  rejected_lapsed: number;
}

const STATUS_COLORS: Record<string, string> = {
  security_required:           'bg-[#eef2f7] text-[#6b7685]',
  bond_application_submitted:  'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  bank_assessment:             'bg-cyan-100 text-cyan-700',
  terms_issued:                'bg-sky-100 text-sky-700',
  ipp_review:                  'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  terms_accepted:              'bg-violet-100 text-violet-700',
  bond_documentation:          'bg-purple-100 text-purple-700',
  bond_issued:                 'bg-yellow-100 text-yellow-800',
  dmre_notification_sent:      'bg-teal-100 text-teal-700',
  security_confirmed:          'bg-green-100 text-green-700',
  security_rejected:           'bg-red-100 text-red-700',
  security_lapsed:             'bg-orange-100 text-orange-700',
};

const STATUS_LABELS: Record<string, string> = {
  security_required:           'Security Required',
  bond_application_submitted:  'Application Submitted',
  bank_assessment:             'Bank Assessment',
  terms_issued:                'Terms Issued',
  ipp_review:                  'IPP Review',
  terms_accepted:              'Terms Accepted',
  bond_documentation:          'Bond Documentation',
  bond_issued:                 'Bond Issued',
  dmre_notification_sent:      'DMRE Notification Sent',
  security_confirmed:          'Security Confirmed',
  security_rejected:           'Security Rejected',
  security_lapsed:             'Security Lapsed',
};

// URGENT SLA — higher bond quantum = tighter deadline = more dangerous colour
const TIER_BADGE_COLORS: Record<string, string> = {
  micro:  'bg-green-100 text-green-800',
  small:  'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  medium: 'bg-yellow-100 text-yellow-800',
  large:  'bg-orange-100 text-orange-800',
  major:  'bg-red-100 text-red-800',
};

const SECURITY_TYPE_LABELS: Record<string, string> = {
  performance_bond:           'Performance Bond',
  advance_payment_guarantee:  'Advance Payment Guarantee',
  retention_guarantee:        'Retention Guarantee',
  parent_company_guarantee:   'Parent Company Guarantee',
  irrevocable_lc:             'Irrevocable LC',
  comprehensive_package:      'Comprehensive Package',
};

const TERMINAL_STATUSES = new Set([
  'security_confirmed',
  'security_rejected',
  'security_lapsed',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const TIERS    = ['micro', 'small', 'medium', 'large', 'major'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';

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

export function IppPerfSecurityTab() {
  const [items, setItems]               = useState<PerfSecurityRecord[]>([]);
  const [kpis, setKpis]                 = useState<PerfSecurityKpis | null>(null);
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
  const [formBondQuantum, setFormBondQuantum]       = useState('');
  const [formSecurityType, setFormSecurityType]     = useState('performance_bond');
  const [formExpiryDate, setFormExpiryDate]         = useState('');
  const [formIssuingBank, setFormIssuingBank]       = useState('');
  const [formBeneficiary, setFormBeneficiary]       = useState('');
  const [formBondReference, setFormBondReference]   = useState('');
  const [formTier, setFormTier]                     = useState<typeof TIERS[number]>('medium');
  const [formNotes, setFormNotes]                   = useState('');

  // Action modal state
  const [actionItem, setActionItem]       = useState<PerfSecurityRecord | null>(null);
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
      const res = await fetch(`/api/ipp-perf-securities?${params}`, {
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
  const total          = kpis?.total           ?? items.length;
  const active         = kpis?.active          ?? items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached       = kpis?.sla_breached    ?? items.filter(i => i.sla_breached === 1).length;
  const confirmed      = kpis?.confirmed       ?? items.filter(i => i.chain_status === 'security_confirmed').length;
  const rejectedLapsed = kpis?.rejected_lapsed ?? items.filter(i =>
    i.chain_status === 'security_rejected' || i.chain_status === 'security_lapsed'
  ).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formBondQuantum || !formExpiryDate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:      formProjectRef.trim(),
        bond_quantum_zar: parseFloat(formBondQuantum),
        security_type:    formSecurityType,
        expiry_date:      formExpiryDate,
        bond_tier:        formTier,
      };
      if (formIssuingBank.trim())    body.issuing_bank   = formIssuingBank.trim();
      if (formBeneficiary.trim())    body.beneficiary    = formBeneficiary.trim();
      if (formBondReference.trim())  body.bond_reference = formBondReference.trim();
      if (formNotes.trim())          body.notes          = formNotes.trim();

      const res = await fetch('/api/ipp-perf-securities', {
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
      setFormBondQuantum('');
      setFormSecurityType('performance_bond');
      setFormExpiryDate('');
      setFormIssuingBank('');
      setFormBeneficiary('');
      setFormBondReference('');
      setFormTier('medium');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function openAction(item: PerfSecurityRecord, name: string, label: string) {
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
      const res = await fetch(`/api/ipp-perf-securities/${actionItem.id}/action`, {
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

  function getActions(item: PerfSecurityRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    switch (item.chain_status) {
      case 'security_required':
        return [{ name: 'submit_application', label: 'Submit Application' }];
      case 'bond_application_submitted':
        return [{ name: 'commence_bank_assessment', label: 'Commence Bank Assessment' }];
      case 'bank_assessment':
        return [{ name: 'issue_terms', label: 'Issue Terms' }];
      case 'terms_issued':
        return [{ name: 'commence_ipp_review', label: 'Commence IPP Review' }];
      case 'ipp_review':
        return [{ name: 'accept_terms', label: 'Accept Terms' }];
      case 'terms_accepted':
        return [{ name: 'prepare_bond_documentation', label: 'Prepare Bond Documentation' }];
      case 'bond_documentation':
        return [{ name: 'issue_bond', label: 'Issue Bond' }];
      case 'bond_issued':
        return [{ name: 'send_dmre_notification', label: 'Send DMRE Notification' }];
      case 'dmre_notification_sent':
        return [
          { name: 'confirm_security', label: 'Confirm Security', variant: 'success' },
          { name: 'reject_security',  label: 'Reject Security',  variant: 'danger'  },
          { name: 'lapse_security',   label: 'Lapse Security',   variant: 'danger'  },
        ];
      default:
        return [];
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiChip label="Total Securities"   value={total} />
        <KpiChip label="Active"             value={active}         mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"       value={breached}       mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Confirmed"          value={confirmed}      mode={confirmed > 0 ? 'good' : 'neutral'} />
        <KpiChip label="Rejected / Lapsed"  value={rejectedLapsed} mode={rejectedLapsed > 0 ? 'danger' : 'neutral'} />
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
          className="px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border border-[#dde4ec] hover:bg-[#e8ecf0]"
        >
          Refresh
        </button>
        <button type="button"
          onClick={() => setShowCreate(v => !v)}
          className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]"
        >
          + New Performance Security
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'oklch(0.87 0.010 250)', background: 'oklch(0.94 0.006 250)' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>New Performance Security</div>
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
              <label className="block text-xs text-[#3d4756] mb-1">Bond Quantum (ZAR) *</label>
              <input
                type="number"
                value={formBondQuantum}
                onChange={e => setFormBondQuantum(e.target.value)}
                min={0}
                step={1}
                placeholder="45000000"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Security Type *</label>
              <select
                value={formSecurityType}
                onChange={e => setFormSecurityType(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {Object.entries(SECURITY_TYPE_LABELS).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Bond Tier *</label>
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
              <label className="block text-xs text-[#3d4756] mb-1">Expiry Date *</label>
              <input
                type="date"
                value={formExpiryDate}
                onChange={e => setFormExpiryDate(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Issuing Bank</label>
              <input
                type="text"
                value={formIssuingBank}
                onChange={e => setFormIssuingBank(e.target.value)}
                placeholder="e.g. Standard Bank"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Beneficiary</label>
              <input
                type="text"
                value={formBeneficiary}
                onChange={e => setFormBeneficiary(e.target.value)}
                placeholder="e.g. DMRE"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Bond Reference</label>
              <input
                type="text"
                value={formBondReference}
                onChange={e => setFormBondReference(e.target.value)}
                placeholder="e.g. BND-2026-001"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs text-[#3d4756] mb-1">Notes</label>
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
                <th className="pb-2 pr-4">Project Ref</th>
                <th className="pb-2 pr-4">Bond Ref</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Bond Quantum</th>
                <th className="pb-2 pr-4">Security Type</th>
                <th className="pb-2 pr-4">Issuing Bank</th>
                <th className="pb-2 pr-4">Beneficiary</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Expiry Date</th>
                <th className="pb-2 pr-4">SLA Breached</th>
                <th className="pb-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const expired = isExpired(item.expiry_date);
                const actions = getActions(item);
                return (
                  <tr key={item.id} className="border-b hover:bg-[#eef2f7]">
                    <td className="py-2 pr-4 text-xs font-mono text-[#2d3748]">{item.project_ref}</td>
                    <td className="py-2 pr-4 text-xs text-[#6b7685]">{item.bond_reference ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_BADGE_COLORS[item.bond_tier] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {item.bond_tier.charAt(0).toUpperCase() + item.bond_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs tabular-nums text-[#2d3748]">
                      {fmtZar(item.bond_quantum_zar)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#3d4756]">
                      {SECURITY_TYPE_LABELS[item.security_type] ?? item.security_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#6b7685] max-w-[120px] truncate" title={item.issuing_bank ?? ''}>
                      {item.issuing_bank ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#6b7685] max-w-[120px] truncate" title={item.beneficiary ?? ''}>
                      {item.beneficiary ?? '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={`py-2 pr-4 text-xs ${expired ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
                      {expired ? '⚠ ' : ''}{fmtDate(item.expiry_date)}
                    </td>
                    <td className="py-2 pr-4">
                      {item.sla_breached === 1 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">Yes</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-[#eef2f7] text-[#9aa5b4]">No</span>
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
                  <td colSpan={11} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No performance security records found
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
            <div className="text-sm font-semibold text-[#1e2a38] mb-1">{actionLabel}</div>
            <div className="text-xs text-[#6b7685] mb-4">
              Performance Security &mdash; {actionItem.project_ref}
              {actionItem.bond_reference ? ` / ${actionItem.bond_reference}` : ''}
            </div>
            <div className="mb-3">
              <label className="block text-xs text-[#3d4756] mb-1">Notes (optional)</label>
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
                className="px-3 py-1.5 text-xs border rounded bg-white text-[#3d4756] hover:bg-[#eef2f7]"
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
