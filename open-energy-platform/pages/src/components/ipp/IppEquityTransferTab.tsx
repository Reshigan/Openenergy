import { useState, useEffect } from 'react';

interface EquityTransferRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  transfer_type: string;
  transferor_name: string | null;
  transferee_name: string | null;
  equity_quantum_zar: number;
  equity_pct: number | null;
  equity_tier: string;
  chain_status: string;
  sla_due_date: string | null;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface EquityTransferKpis {
  total: number;
  active: number;
  sla_breached: number;
  completed_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  transfer_initiated:             'bg-gray-100 text-gray-500',
  due_diligence:                  'bg-blue-100 text-blue-700',
  regulatory_notification:        'bg-blue-100 text-blue-700',
  lender_consent_requested:       'bg-yellow-100 text-yellow-800',
  offtaker_notification:          'bg-yellow-100 text-yellow-800',
  nersa_review:                   'bg-orange-100 text-orange-700',
  regulatory_clearance_issued:    'bg-orange-100 text-orange-700',
  conditions_precedent_tracking:  'bg-purple-100 text-purple-700',
  cp_documentation_submitted:     'bg-purple-100 text-purple-700',
  transfer_completed:             'bg-green-100 text-green-700',
  transfer_rejected:              'bg-red-100 text-red-700',
  transfer_lapsed:                'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  transfer_initiated:             'Transfer Initiated',
  due_diligence:                  'Due Diligence',
  regulatory_notification:        'Regulatory Notification',
  lender_consent_requested:       'Lender Consent Requested',
  offtaker_notification:          'Offtaker Notification',
  nersa_review:                   'NERSA Review',
  regulatory_clearance_issued:    'Regulatory Clearance Issued',
  conditions_precedent_tracking:  'Conditions Precedent Tracking',
  cp_documentation_submitted:     'CP Documentation Submitted',
  transfer_completed:             'Transfer Completed',
  transfer_rejected:              'Transfer Rejected',
  transfer_lapsed:                'Transfer Lapsed',
};

const TIER_COLORS: Record<string, string> = {
  micro:    'bg-gray-100 text-gray-700',
  small:    'bg-blue-100 text-blue-800',
  medium:   'bg-yellow-100 text-yellow-800',
  large:    'bg-orange-100 text-orange-800',
  flagship: 'bg-red-100 text-red-800',
};

const TRANSFER_TYPE_LABELS: Record<string, string> = {
  secondary_sale:    'Secondary Sale',
  community_equity:  'Community Equity',
  dfi_exit:          'DFI Exit',
  sponsor_reorg:     'Sponsor Reorg',
  debt_equity_swap:  'Debt-Equity Swap',
};

const TERMINAL_STATUSES = new Set([
  'transfer_completed',
  'transfer_rejected',
  'transfer_lapsed',
]);

const STATUSES       = Object.keys(STATUS_LABELS);
const TRANSFER_TYPES = Object.keys(TRANSFER_TYPE_LABELS);
const EQUITY_TIERS   = ['micro', 'small', 'medium', 'large', 'flagship'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-gray-700 bg-white';

function fmtDate(dateStr: string | null | undefined): { text: string; isPast: boolean } {
  if (!dateStr) return { text: '—', isPast: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { text: '—', isPast: false };
  const now = new Date();
  const isPast = d < now;
  const text = d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  return { text, isPast };
}

function fmtZar(value: number | null | undefined): string {
  if (value == null) return '—';
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toLocaleString('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
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

export function IppEquityTransferTab() {
  const [items, setItems]               = useState<EquityTransferRecord[]>([]);
  const [kpis, setKpis]                 = useState<EquityTransferKpis | null>(null);
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
  const [formTransferType, setFormTransferType]       = useState('secondary_sale');
  const [formTransferorName, setFormTransferorName]   = useState('');
  const [formTransfereeName, setFormTransfereeName]   = useState('');
  const [formEquityQuantum, setFormEquityQuantum]     = useState('');
  const [formEquityPct, setFormEquityPct]             = useState('');
  const [formNotes, setFormNotes]                     = useState('');

  // Action modal state
  const [actionItem, setActionItem]         = useState<EquityTransferRecord | null>(null);
  const [actionName, setActionName]         = useState('');
  const [actionLabel, setActionLabel]       = useState('');
  const [actionReason, setActionReason]     = useState('');
  const [actionNotes, setActionNotes]       = useState('');
  const [actionLoading, setActionLoading]   = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState('');

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
      const res = await fetch(`/api/ipp-equity-transfer?${params}`, {
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

  const total          = kpis?.total           ?? items.length;
  const active         = kpis?.active          ?? items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached       = kpis?.sla_breached    ?? items.filter(i => i.sla_breached === 1).length;
  const completedCount = kpis?.completed_count ?? items.filter(i => i.chain_status === 'transfer_completed').length;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formEquityQuantum) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:        formProjectRef.trim(),
        transfer_type:      formTransferType,
        equity_quantum_zar: parseFloat(formEquityQuantum),
      };
      if (formTransferorName.trim()) body.transferor_name = formTransferorName.trim();
      if (formTransfereeName.trim()) body.transferee_name = formTransfereeName.trim();
      if (formEquityPct !== '')      body.equity_pct      = parseFloat(formEquityPct);
      if (formNotes.trim())          body.notes           = formNotes.trim();

      const res = await fetch('/api/ipp-equity-transfer', {
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
      setFormTransferType('secondary_sale');
      setFormTransferorName('');
      setFormTransfereeName('');
      setFormEquityQuantum('');
      setFormEquityPct('');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function getActions(item: EquityTransferRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    if (TERMINAL_STATUSES.has(item.chain_status)) return [];
    const base: { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] = [];
    switch (item.chain_status) {
      case 'transfer_initiated':
        base.push({ name: 'commence_due_diligence', label: 'Commence Due Diligence' });
        break;
      case 'due_diligence':
        base.push({ name: 'notify_regulators', label: 'Notify Regulators' });
        break;
      case 'regulatory_notification':
        base.push({ name: 'request_lender_consent', label: 'Request Lender Consent' });
        break;
      case 'lender_consent_requested':
        base.push({ name: 'notify_offtaker', label: 'Notify Offtaker' });
        break;
      case 'offtaker_notification':
        base.push({ name: 'commence_nersa_review', label: 'Commence NERSA Review' });
        break;
      case 'nersa_review':
        base.push({ name: 'issue_regulatory_clearance', label: 'Issue Regulatory Clearance', variant: 'success' });
        base.push({ name: 'reject_transfer', label: 'Reject Transfer', variant: 'danger' });
        break;
      case 'regulatory_clearance_issued':
        base.push({ name: 'track_conditions_precedent', label: 'Track Conditions Precedent' });
        base.push({ name: 'reject_transfer', label: 'Reject Transfer', variant: 'danger' });
        break;
      case 'conditions_precedent_tracking':
        base.push({ name: 'submit_cp_documentation', label: 'Submit CP Documentation' });
        base.push({ name: 'reject_transfer', label: 'Reject Transfer', variant: 'danger' });
        break;
      case 'cp_documentation_submitted':
        base.push({ name: 'complete_transfer', label: 'Complete Transfer', variant: 'success' });
        base.push({ name: 'reject_transfer', label: 'Reject Transfer', variant: 'danger' });
        break;
      default:
        break;
    }
    base.push({ name: 'declare_lapsed', label: 'Declare Lapsed', variant: 'warn' });
    return base;
  }

  function openActionPicker(item: EquityTransferRecord) {
    const actions = getActions(item);
    if (actions.length === 0) return;
    const first = actions[0];
    setActionItem(item);
    setActionName(first.name);
    setActionLabel(first.label);
    setSelectedAction(first.name);
    setActionReason('');
    setActionNotes('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setActionName('');
    setActionLabel('');
    setSelectedAction('');
    setActionReason('');
    setActionNotes('');
    setActionError(null);
  }

  function handleActionChange(name: string) {
    setSelectedAction(name);
    setActionName(name);
    if (actionItem) {
      const actions = getActions(actionItem);
      const found = actions.find(a => a.name === name);
      if (found) setActionLabel(found.label);
    }
  }

  async function submitAction() {
    if (!actionItem || !actionName) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { action: actionName };
      if (actionReason.trim()) body.reason = actionReason.trim();
      if (actionNotes.trim())  body.notes  = actionNotes.trim();

      const res = await fetch(`/api/ipp-equity-transfer/${actionItem.id}/action`, {
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
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  const modalActions = actionItem ? getActions(actionItem) : [];

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total Transfers" value={total} />
        <KpiChip label="Active"          value={active}         mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"    value={breached}       mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Completed"       value={completedCount} mode={completedCount > 0 ? 'good' : 'neutral'} />
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
          {EQUITY_TIERS.map(t => (
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
          + New Transfer
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3"
        >
          <div className="text-sm font-semibold text-blue-800">New SPV Equity Transfer</div>
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
              <label className="block text-xs text-gray-600 mb-1">Transfer Type *</label>
              <select
                value={formTransferType}
                onChange={e => setFormTransferType(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {TRANSFER_TYPES.map(tt => (
                  <option key={tt} value={tt}>{TRANSFER_TYPE_LABELS[tt]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Equity Quantum ZAR *</label>
              <input
                type="number"
                value={formEquityQuantum}
                onChange={e => setFormEquityQuantum(e.target.value)}
                min={0}
                step={1}
                placeholder="100000000"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Transferor Name (optional)</label>
              <input
                type="text"
                value={formTransferorName}
                onChange={e => setFormTransferorName(e.target.value)}
                placeholder="Sponsor Fund A"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Transferee Name (optional)</label>
              <input
                type="text"
                value={formTransfereeName}
                onChange={e => setFormTransfereeName(e.target.value)}
                placeholder="Infrastructure Fund B"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Equity % (optional)</label>
              <input
                type="number"
                value={formEquityPct}
                onChange={e => setFormEquityPct(e.target.value)}
                min={0}
                max={100}
                step={0.01}
                placeholder="25.5"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">Notes (optional)</label>
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
                <th className="pb-2 pr-3">ID</th>
                <th className="pb-2 pr-3">Project Ref</th>
                <th className="pb-2 pr-3">Transfer Type</th>
                <th className="pb-2 pr-3">Transferor</th>
                <th className="pb-2 pr-3">Transferee</th>
                <th className="pb-2 pr-3">Equity (ZAR)</th>
                <th className="pb-2 pr-3">Equity %</th>
                <th className="pb-2 pr-3">Tier</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">SLA Due</th>
                <th className="pb-2 pr-3">SLA Breached</th>
                <th className="pb-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions = getActions(item);
                const due     = fmtDate(item.sla_due_date);
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-3 text-xs font-mono text-gray-400">{item.id.slice(0, 8)}</td>
                    <td className="py-2 pr-3 text-xs font-mono text-gray-700">{item.project_ref}</td>
                    <td className="py-2 pr-3 text-xs text-gray-600">
                      {TRANSFER_TYPE_LABELS[item.transfer_type] ?? item.transfer_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-500 max-w-[120px] truncate" title={item.transferor_name ?? ''}>
                      {item.transferor_name ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-500 max-w-[120px] truncate" title={item.transferee_name ?? ''}>
                      {item.transferee_name ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-gray-700 font-medium">
                      {fmtZar(item.equity_quantum_zar)}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-gray-600">
                      {fmtPct(item.equity_pct)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[item.equity_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                        {item.equity_tier.charAt(0).toUpperCase() + item.equity_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums">
                      <span className={due.isPast ? 'text-red-600 font-medium' : 'text-gray-600'}>
                        {due.text}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {item.sla_breached === 1 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">Yes</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400">No</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {actions.length > 0 && (
                        <button type="button"
                          onClick={() => openActionPicker(item)}
                          className="px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
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
                  <td colSpan={12} className="py-10 text-center text-gray-400 text-sm">
                    No SPV equity transfers found
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
            <div className="text-sm font-semibold text-gray-800 mb-1">SPV Equity Transfer Action</div>
            <div className="text-xs text-gray-500 mb-4">
              {actionItem.project_ref} &mdash; {STATUS_LABELS[actionItem.chain_status] ?? actionItem.chain_status}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Action *</label>
              <select
                value={selectedAction}
                onChange={e => handleActionChange(e.target.value)}
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {modalActions.map(a => (
                  <option key={a.name} value={a.name}>{a.label}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="Brief reason or reference"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Notes (optional)</label>
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
                className="px-3 py-1.5 text-xs border rounded bg-white text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button type="button"
                onClick={submitAction}
                disabled={actionLoading || !actionName}
                className="px-4 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading ? 'Submitting…' : actionLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
