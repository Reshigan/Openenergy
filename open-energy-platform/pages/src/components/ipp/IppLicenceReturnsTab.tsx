import { useState, useEffect } from 'react';

interface LicenceReturnRecord {
  id: string;
  participant_id: string;
  project_ref: string;
  licence_number: string | null;
  financial_year_end: string;
  licensed_mw: number;
  capacity_tier: 'small' | 'medium' | 'large' | 'major' | 'flagship';
  return_type: string;
  chain_status: string;
  sla_due_date: string | null;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface LicenceReturnKpis {
  total: number;
  active: number;
  sla_breached: number;
  accepted_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  return_triggered:         'bg-[#eef2f7] text-[#6b7685]',
  data_assembly:            'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  internal_review:          'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  board_approval:           'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  portal_submission:        'bg-yellow-100 text-yellow-800',
  acknowledgement_pending:  'bg-yellow-100 text-yellow-800',
  nersa_review:             'bg-orange-100 text-orange-700',
  clarification_requested:  'bg-orange-100 text-orange-700',
  clarification_submitted:  'bg-orange-100 text-orange-700',
  return_accepted:          'bg-green-100 text-green-700',
  return_rejected:          'bg-red-100 text-red-700',
  return_lapsed:            'bg-[#eef2f7] text-[#6b7685]',
};

const STATUS_LABELS: Record<string, string> = {
  return_triggered:         'Return Triggered',
  data_assembly:            'Data Assembly',
  internal_review:          'Internal Review',
  board_approval:           'Board Approval',
  portal_submission:        'Portal Submission',
  acknowledgement_pending:  'Acknowledgement Pending',
  nersa_review:             'NERSA Review',
  clarification_requested:  'Clarification Requested',
  clarification_submitted:  'Clarification Submitted',
  return_accepted:          'Return Accepted',
  return_rejected:          'Return Rejected',
  return_lapsed:            'Return Lapsed',
};

const CAPACITY_TIER_COLORS: Record<string, string> = {
  small:    'bg-[#eef2f7] text-[#2d3748]',
  medium:   'bg-[oklch(0.94_0.006_250)] text-[oklch(0.17_0.010_250)]',
  large:    'bg-yellow-100 text-yellow-800',
  major:    'bg-orange-100 text-orange-800',
  flagship: 'bg-red-100 text-red-800',
};

const RETURN_TYPE_LABELS: Record<string, string> = {
  annual_standard:      'Annual Standard',
  annual_construction:  'Annual Construction',
  annual_decommission:  'Annual Decommission',
  restatement:          'Restatement',
};

const TERMINAL_STATUSES = new Set([
  'return_accepted',
  'return_rejected',
  'return_lapsed',
]);

const STATUSES     = Object.keys(STATUS_LABELS);
const RETURN_TYPES = Object.keys(RETURN_TYPE_LABELS);
const CAPACITY_TIERS = ['small', 'medium', 'large', 'major', 'flagship'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';

function fmtDate(dateStr: string | null | undefined): { text: string; isPast: boolean } {
  if (!dateStr) return { text: '—', isPast: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { text: '—', isPast: false };
  const now = new Date();
  const isPast = d < now;
  const text = d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  return { text, isPast };
}

function fmtMw(mw: number): string {
  return `${mw.toLocaleString('en-ZA')} MW`;
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

export function IppLicenceReturnsTab() {
  const [items, setItems]               = useState<LicenceReturnRecord[]>([]);
  const [kpis, setKpis]                 = useState<LicenceReturnKpis | null>(null);
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
  const [formLicenceNumber, setFormLicenceNumber]       = useState('');
  const [formFinancialYearEnd, setFormFinancialYearEnd] = useState('');
  const [formLicensedMw, setFormLicensedMw]             = useState('');
  const [formReturnType, setFormReturnType]             = useState('annual_standard');
  const [formNotes, setFormNotes]                       = useState('');

  // Action modal state
  const [actionItem, setActionItem]           = useState<LicenceReturnRecord | null>(null);
  const [actionName, setActionName]           = useState('');
  const [actionLabel, setActionLabel]         = useState('');
  const [actionReason, setActionReason]       = useState('');
  const [actionNotes, setActionNotes]         = useState('');
  const [actionLoading, setActionLoading]     = useState(false);
  const [actionError, setActionError]         = useState<string | null>(null);

  // Action picker state (for statuses with multiple options)
  const [selectedAction, setSelectedAction]   = useState('');

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
      const res = await fetch(`/api/ipp-licence-returns?${params}`, {
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

  // Derived KPIs (fallback to client-side if server does not return kpis)
  const total         = kpis?.total          ?? items.length;
  const active        = kpis?.active         ?? items.filter(i => !TERMINAL_STATUSES.has(i.chain_status)).length;
  const breached      = kpis?.sla_breached   ?? items.filter(i => i.sla_breached === 1).length;
  const acceptedCount = kpis?.accepted_count ?? items.filter(i => i.chain_status === 'return_accepted').length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formProjectRef.trim() || !formFinancialYearEnd || !formLicensedMw) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        project_ref:        formProjectRef.trim(),
        financial_year_end: formFinancialYearEnd,
        licensed_mw:        parseFloat(formLicensedMw),
        return_type:        formReturnType,
      };
      if (formLicenceNumber.trim()) body.licence_number = formLicenceNumber.trim();
      if (formNotes.trim())         body.notes          = formNotes.trim();

      const res = await fetch('/api/ipp-licence-returns', {
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
      setFormLicenceNumber('');
      setFormFinancialYearEnd('');
      setFormLicensedMw('');
      setFormReturnType('annual_standard');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function getActions(item: LicenceReturnRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    if (TERMINAL_STATUSES.has(item.chain_status)) return [];
    const base: { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] = [];
    switch (item.chain_status) {
      case 'return_triggered':
        base.push({ name: 'commence_data_assembly', label: 'Commence Data Assembly' });
        break;
      case 'data_assembly':
        base.push({ name: 'conduct_internal_review', label: 'Conduct Internal Review' });
        break;
      case 'internal_review':
        base.push({ name: 'obtain_board_approval', label: 'Obtain Board Approval' });
        break;
      case 'board_approval':
        base.push({ name: 'submit_to_portal', label: 'Submit to Portal' });
        break;
      case 'portal_submission':
        base.push({ name: 'confirm_receipt', label: 'Confirm Receipt' });
        break;
      case 'acknowledgement_pending':
        base.push({ name: 'begin_nersa_review', label: 'Begin NERSA Review' });
        break;
      case 'nersa_review':
        base.push({ name: 'accept_return',          label: 'Accept Return',         variant: 'success' });
        base.push({ name: 'request_clarification',  label: 'Request Clarification', variant: 'warn'    });
        base.push({ name: 'reject_return',          label: 'Reject Return',         variant: 'danger'  });
        break;
      case 'clarification_requested':
        base.push({ name: 'submit_clarification', label: 'Submit Clarification' });
        break;
      case 'clarification_submitted':
        base.push({ name: 'accept_return', label: 'Accept Return', variant: 'success' });
        base.push({ name: 'reject_return', label: 'Reject Return', variant: 'danger'  });
        break;
      default:
        break;
    }
    // Any non-terminal status can be declared lapsed
    base.push({ name: 'declare_lapsed', label: 'Declare Lapsed', variant: 'warn' });
    return base;
  }

  function openAction(item: LicenceReturnRecord, name: string, label: string) {
    setActionItem(item);
    setActionName(name);
    setActionLabel(label);
    setSelectedAction(name);
    setActionReason('');
    setActionNotes('');
    setActionError(null);
  }

  function openActionPicker(item: LicenceReturnRecord) {
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

      const res = await fetch(`/api/ipp-licence-returns/${actionItem.id}/action`, {
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
        <KpiChip label="Total Returns"  value={total} />
        <KpiChip label="Active"         value={active}        mode={active > 0 ? 'alert' : 'neutral'} />
        <KpiChip label="SLA Breached"   value={breached}      mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Accepted"       value={acceptedCount} mode={acceptedCount > 0 ? 'good' : 'neutral'} />
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
          {CAPACITY_TIERS.map(t => (
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
          + New Licence Return
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'oklch(0.87 0.010 250)', background: 'oklch(0.94 0.006 250)' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>New Annual NERSA Licence Return</div>
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
              <label className="block text-xs text-[#3d4756] mb-1">Licence Number (optional)</label>
              <input
                type="text"
                value={formLicenceNumber}
                onChange={e => setFormLicenceNumber(e.target.value)}
                placeholder="NERSA/GEN/001/2020"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Financial Year End *</label>
              <input
                type="date"
                value={formFinancialYearEnd}
                onChange={e => setFormFinancialYearEnd(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Licensed MW *</label>
              <input
                type="number"
                value={formLicensedMw}
                onChange={e => setFormLicensedMw(e.target.value)}
                min={0}
                step={0.001}
                placeholder="100"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Return Type *</label>
              <select
                value={formReturnType}
                onChange={e => setFormReturnType(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {RETURN_TYPES.map(rt => (
                  <option key={rt} value={rt}>{RETURN_TYPE_LABELS[rt]}</option>
                ))}
              </select>
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
                <th className="pb-2 pr-3">ID</th>
                <th className="pb-2 pr-3">Project Ref</th>
                <th className="pb-2 pr-3">Licence No.</th>
                <th className="pb-2 pr-3">FY End</th>
                <th className="pb-2 pr-3">Licensed MW</th>
                <th className="pb-2 pr-3">Tier</th>
                <th className="pb-2 pr-3">Return Type</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">SLA Due</th>
                <th className="pb-2 pr-3">SLA Breached</th>
                <th className="pb-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions  = getActions(item);
                const due      = fmtDate(item.sla_due_date);
                const fye      = fmtDate(item.financial_year_end);
                return (
                  <tr key={item.id} className="border-b hover:bg-[#eef2f7]">
                    <td className="py-2 pr-3 text-xs font-mono text-[#9aa5b4]">{item.id.slice(0, 8)}</td>
                    <td className="py-2 pr-3 text-xs font-mono text-[#2d3748]">{item.project_ref}</td>
                    <td className="py-2 pr-3 text-xs text-[#6b7685] max-w-[130px] truncate" title={item.licence_number ?? ''}>
                      {item.licence_number ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[#3d4756]">{fye.text}</td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[#2d3748] font-medium">
                      {fmtMw(item.licensed_mw)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CAPACITY_TIER_COLORS[item.capacity_tier] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {item.capacity_tier.charAt(0).toUpperCase() + item.capacity_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-[#3d4756]">
                      {RETURN_TYPE_LABELS[item.return_type] ?? item.return_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
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
                    <td className="py-2 pr-3">
                      {actions.length > 0 && (
                        <button type="button"
                          onClick={() => openActionPicker(item)}
                          className="px-2 py-0.5 text-xs rounded border hover:opacity-80"
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
                  <td colSpan={11} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No licence returns found
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
            <div className="text-sm font-semibold text-[#1e2a38] mb-1">Annual NERSA Licence Return Action</div>
            <div className="text-xs text-[#6b7685] mb-4">
              {actionItem.project_ref} &mdash; {STATUS_LABELS[actionItem.chain_status] ?? actionItem.chain_status}
            </div>

            {/* Action selector */}
            <div className="mb-3">
              <label className="block text-xs text-[#3d4756] mb-1">Action *</label>
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
                placeholder="Additional remarks…"
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
                disabled={actionLoading || !actionName}
                className="px-4 py-1.5 text-xs rounded bg-[#c2873a] text-white hover:bg-[#a3702f] disabled:opacity-50"
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
