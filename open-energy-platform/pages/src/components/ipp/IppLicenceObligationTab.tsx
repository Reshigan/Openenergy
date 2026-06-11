import { useState, useEffect } from 'react';

interface LicenceObligation {
  id: string;
  ipp_id: string;
  licence_number: string;
  obligation_ref: string;
  obligation_class: string;
  condition_description: string;
  compliance_period: string;
  project_name: string | null;
  chain_status: string;
  sla_deadline: string | null;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface ObligationKpis {
  total: number;
  active: number;
  sla_breached: number;
  cured_count: number;
  breached_count: number;
  compliant_count: number;
}

// ─── Status meta ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  monitoring_active:      'bg-[#eef2f7] text-[#3d4756]',
  assessment_due:         'bg-amber-100 text-amber-700',
  evidence_gathered:      'bg-cyan-100 text-cyan-700',
  evidence_submitted:     'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  under_review:           'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  query_raised:           'bg-orange-100 text-orange-700',
  query_resolved:         'bg-teal-100 text-teal-700',
  assessed_compliant:     'bg-green-100 text-green-700',
  assessed_non_compliant: 'bg-red-100 text-red-700',
  notice_issued:          'bg-rose-100 text-rose-700',
  cure_active:            'bg-purple-100 text-purple-700',
  cured:                  'bg-emerald-100 text-emerald-700',
  breached:               'bg-red-200 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  monitoring_active:      'Monitoring Active',
  assessment_due:         'Assessment Due',
  evidence_gathered:      'Evidence Gathered',
  evidence_submitted:     'Evidence Submitted',
  under_review:           'Under Review',
  query_raised:           'Query Raised',
  query_resolved:         'Query Resolved',
  assessed_compliant:     'Assessed Compliant',
  assessed_non_compliant: 'Assessed Non-Compliant',
  notice_issued:          'Notice Issued',
  cure_active:            'Cure Active',
  cured:                  'Cured',
  breached:               'Breached',
};

// ─── Obligation class badges ──────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  security_of_supply: 'bg-red-100 text-red-700',
  environmental:      'bg-green-100 text-green-700',
  financial:          'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  technical:          'bg-[oklch(0.94_0.006_250)] text-[oklch(0.46_0.16_55)]',
  administrative:     'bg-[#eef2f7] text-[#3d4756]',
};

const CLASS_LABELS: Record<string, string> = {
  security_of_supply: 'Security of Supply',
  environmental:      'Environmental',
  financial:          'Financial',
  technical:          'Technical',
  administrative:     'Administrative',
};

// ─── Actions per state ────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set(['cured', 'breached']);

const STATUSES         = Object.keys(STATUS_LABELS);
const OBLIGATION_CLASSES = [
  'security_of_supply', 'environmental', 'financial', 'technical', 'administrative',
] as const;

interface ActionDef {
  name: string;
  label: string;
  variant?: 'danger' | 'warn' | 'success';
}

const ACTION_LABELS: Record<string, string> = {
  trigger_assessment: 'Trigger Assessment',
  gather_evidence:    'Gather Evidence',
  submit_evidence:    'Submit Evidence',
  commence_review:    'Commence Review',
  raise_query:        'Raise Query',
  resolve_query:      'Resolve Query',
  find_compliant:     'Find Compliant',
  find_non_compliant: 'Find Non-Compliant',
  issue_notice:       'Issue Notice',
  commence_cure:      'Commence Cure',
  confirm_cured:      'Confirm Cured',
  declare_breach:     'Declare Breach',
};

function getActions(item: LicenceObligation): ActionDef[] {
  if (HARD_TERMINALS.has(item.chain_status)) return [];
  switch (item.chain_status) {
    case 'monitoring_active':
      return [
        { name: 'trigger_assessment', label: ACTION_LABELS.trigger_assessment, variant: 'success' },
      ];
    case 'assessment_due':
      return [
        { name: 'gather_evidence', label: ACTION_LABELS.gather_evidence, variant: 'success' },
      ];
    case 'evidence_gathered':
      return [
        { name: 'submit_evidence', label: ACTION_LABELS.submit_evidence, variant: 'success' },
      ];
    case 'evidence_submitted':
      return [
        { name: 'commence_review', label: ACTION_LABELS.commence_review, variant: 'success' },
      ];
    case 'under_review':
      return [
        { name: 'raise_query',         label: ACTION_LABELS.raise_query                          },
        { name: 'find_compliant',      label: ACTION_LABELS.find_compliant,      variant: 'success' },
        { name: 'find_non_compliant',  label: ACTION_LABELS.find_non_compliant,  variant: 'danger'  },
      ];
    case 'query_raised':
      return [
        { name: 'resolve_query', label: ACTION_LABELS.resolve_query, variant: 'success' },
      ];
    case 'query_resolved':
      return [
        { name: 'find_compliant',     label: ACTION_LABELS.find_compliant,     variant: 'success' },
        { name: 'find_non_compliant', label: ACTION_LABELS.find_non_compliant, variant: 'danger'  },
      ];
    case 'assessed_compliant':
      return [];
    case 'assessed_non_compliant':
      return [
        { name: 'issue_notice',   label: ACTION_LABELS.issue_notice,   variant: 'warn'   },
        { name: 'declare_breach', label: ACTION_LABELS.declare_breach, variant: 'danger' },
      ];
    case 'notice_issued':
      return [
        { name: 'commence_cure',  label: ACTION_LABELS.commence_cure,  variant: 'warn'   },
        { name: 'declare_breach', label: ACTION_LABELS.declare_breach, variant: 'danger' },
      ];
    case 'cure_active':
      return [
        { name: 'confirm_cured',  label: ACTION_LABELS.confirm_cured,  variant: 'success' },
        { name: 'declare_breach', label: ACTION_LABELS.declare_breach, variant: 'danger'  },
      ];
    default:
      return [];
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string | null | undefined): { text: string; isPast: boolean } {
  if (!dateStr) return { text: '—', isPast: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { text: '—', isPast: false };
  const isPast = d < new Date();
  const text = d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  return { text, isPast };
}

function truncate(s: string, n = 24): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const sel = 'border rounded px-2 py-1 text-xs text-[#2d3748] bg-white';

const PAGE_SIZE = 20;

// ─── KPI chip ─────────────────────────────────────────────────────────────────

type KpiMode = 'neutral' | 'good' | 'alert' | 'danger';
function KpiChip({ label, value, mode = 'neutral' }: { label: string; value: string | number; mode?: KpiMode }) {
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

// ─── Component ────────────────────────────────────────────────────────────────

export function IppLicenceObligationTab() {
  const [items, setItems]       = useState<LicenceObligation[]>([]);
  const [kpis, setKpis]         = useState<ObligationKpis | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [filterStatus, setFilterStatus]             = useState('');
  const [filterClass, setFilterClass]               = useState('');
  const [filterSlaBreached, setFilterSlaBreached]   = useState(false);
  const [page, setPage]         = useState(1);

  // Create form
  const [showCreate, setShowCreate]                   = useState(false);
  const [creating, setCreating]                       = useState(false);
  const [createError, setCreateError]                 = useState<string | null>(null);
  const [formIppId, setFormIppId]                     = useState('');
  const [formLicenceNumber, setFormLicenceNumber]     = useState('');
  const [formObligationRef, setFormObligationRef]     = useState('');
  const [formObligationClass, setFormObligationClass] = useState<string>(OBLIGATION_CLASSES[0]);
  const [formCondDesc, setFormCondDesc]               = useState('');
  const [formPeriod, setFormPeriod]                   = useState('');
  const [formProjectName, setFormProjectName]         = useState('');

  // Detail drawer
  const [detailItem, setDetailItem] = useState<LicenceObligation | null>(null);

  // Action modal
  const [actionItem, setActionItem]         = useState<LicenceObligation | null>(null);
  const [selectedAction, setSelectedAction] = useState('');
  const [actionReason, setActionReason]     = useState('');
  const [actionLoading, setActionLoading]   = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);

  async function load(
    status      = filterStatus,
    oblClass    = filterClass,
    slaBreached = filterSlaBreached,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status)     params.set('status', status);
      if (oblClass)   params.set('obligation_class', oblClass);
      if (slaBreached) params.set('sla_breached', '1');
      const res = await fetch(`/api/ipp-licence-obligations?${params}`, {
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

  const total    = kpis?.total         ?? items.length;
  const active   = kpis?.active        ?? items.filter(i => !HARD_TERMINALS.has(i.chain_status) && i.chain_status !== 'assessed_compliant').length;
  const breached = kpis?.sla_breached  ?? items.filter(i => i.sla_breached === 1).length;
  const cured    = kpis?.cured_count   ?? items.filter(i => i.chain_status === 'cured').length;
  const enforced = kpis?.breached_count ?? items.filter(i => i.chain_status === 'breached').length;
  const terminalSummary = `${cured}C / ${enforced}B`;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Create handler ───────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formIppId.trim() || !formLicenceNumber.trim() || !formObligationRef.trim() ||
        !formObligationClass || !formCondDesc.trim() || !formPeriod.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        ipp_id:                formIppId.trim(),
        licence_number:        formLicenceNumber.trim(),
        obligation_ref:        formObligationRef.trim(),
        obligation_class:      formObligationClass,
        condition_description: formCondDesc.trim(),
        compliance_period:     formPeriod.trim(),
      };
      if (formProjectName.trim()) body.project_name = formProjectName.trim();

      const res = await fetch('/api/ipp-licence-obligations', {
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
      setFormIppId('');
      setFormLicenceNumber('');
      setFormObligationRef('');
      setFormObligationClass(OBLIGATION_CLASSES[0]);
      setFormCondDesc('');
      setFormPeriod('');
      setFormProjectName('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  // ─── Action handlers ──────────────────────────────────────────────────────

  function openActionPicker(item: LicenceObligation) {
    const actions = getActions(item);
    if (actions.length === 0) return;
    setActionItem(item);
    setSelectedAction(actions[0].name);
    setActionReason('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setSelectedAction('');
    setActionReason('');
    setActionError(null);
  }

  async function submitAction() {
    if (!actionItem || !selectedAction) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { action: selectedAction };
      if (actionReason.trim()) body.reason = actionReason.trim();

      const res = await fetch(`/api/ipp-licence-obligations/${actionItem.id}/action`, {
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
      if (detailItem?.id === actionItem.id) setDetailItem(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  const modalActions       = actionItem ? getActions(actionItem) : [];
  const actionLabelCurrent = modalActions.find(a => a.name === selectedAction)?.label ?? 'Confirm';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total Obligations" value={total} />
        <KpiChip label="Active"            value={active} mode={active > 0 ? 'good' : 'neutral'} />
        <KpiChip label="SLA Breached"      value={breached} mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip
          label="Cured / Breached"
          value={terminalSummary}
          mode={enforced > 0 ? 'danger' : cured > 0 ? 'good' : 'neutral'}
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterClass, filterSlaBreached); }}
          className={sel}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select
          value={filterClass}
          onChange={e => { setFilterClass(e.target.value); load(filterStatus, e.target.value, filterSlaBreached); }}
          className={sel}
        >
          <option value="">All classes</option>
          {OBLIGATION_CLASSES.map(c => (
            <option key={c} value={c}>{CLASS_LABELS[c] ?? c}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[#2d3748] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterSlaBreached}
            onChange={e => { setFilterSlaBreached(e.target.checked); load(filterStatus, filterClass, e.target.checked); }}
            className="accent-red-600"
          />
          SLA Breached only
        </label>
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
          + New Obligation
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'oklch(0.87 0.010 250)', background: 'oklch(0.94 0.006 250)' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>New Licence Obligation</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">IPP ID *</label>
              <input
                type="text"
                value={formIppId}
                onChange={e => setFormIppId(e.target.value)}
                placeholder="Participant ID"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Licence Number *</label>
              <input
                type="text"
                value={formLicenceNumber}
                onChange={e => setFormLicenceNumber(e.target.value)}
                placeholder="e.g. GEN-NERSA-2025-001"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Obligation Ref *</label>
              <input
                type="text"
                value={formObligationRef}
                onChange={e => setFormObligationRef(e.target.value)}
                placeholder="e.g. OBL-ADM-001"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Obligation Class *</label>
              <select
                value={formObligationClass}
                onChange={e => setFormObligationClass(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {OBLIGATION_CLASSES.map(c => (
                  <option key={c} value={c}>{CLASS_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Compliance Period *</label>
              <input
                type="text"
                value={formPeriod}
                onChange={e => setFormPeriod(e.target.value)}
                placeholder="e.g. 2025-Q4 or 2025-FY"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Project Name (optional)</label>
              <input
                type="text"
                value={formProjectName}
                onChange={e => setFormProjectName(e.target.value)}
                placeholder="Plant or project name"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[#3d4756] mb-1">Condition Description *</label>
              <textarea
                value={formCondDesc}
                onChange={e => setFormCondDesc(e.target.value)}
                placeholder="Brief description of the licence condition obligation"
                required
                rows={2}
                className="w-full border rounded px-2 py-1 text-xs resize-none"
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
                <th className="pb-2 pr-3">Obligation Ref</th>
                <th className="pb-2 pr-3">Class</th>
                <th className="pb-2 pr-3">Licence No.</th>
                <th className="pb-2 pr-3">Period</th>
                <th className="pb-2 pr-3">Chain Status</th>
                <th className="pb-2 pr-3">SLA Deadline</th>
                <th className="pb-2 pr-3 text-center">Reg.</th>
                <th className="pb-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions = getActions(item);
                const due     = fmtDate(item.sla_deadline);
                return (
                  <tr
                    key={item.id}
                    className="border-b hover:bg-[#eef2f7] cursor-pointer"
                    onClick={() => setDetailItem(item)}
                  >
                    <td className="py-2 pr-3 text-xs font-mono text-[#2d3748]">
                      {item.obligation_ref}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CLASS_COLORS[item.obligation_class] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {CLASS_LABELS[item.obligation_class] ?? item.obligation_class}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-[#3d4756]">
                      {item.licence_number}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[#3d4756]">
                      {item.compliance_period}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                      {item.sla_breached === 1 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600 font-semibold">SLA</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums">
                      <span className={due.isPast ? 'text-red-600 font-medium' : 'text-[#3d4756]'}>
                        {due.text}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      {item.regulator_notified === 1 ? (
                        <span title="Regulator notified" className="text-orange-500 text-base leading-none">&#9873;</span>
                      ) : (
                        <span className="text-[#e8ecf0] text-base leading-none">&#9873;</span>
                      )}
                    </td>
                    <td
                      className="py-2 pr-3"
                      onClick={e => e.stopPropagation()}
                    >
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
                  <td colSpan={8} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No licence obligation records found
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
          <span className="text-xs text-[#6b7685]">Page {page} of {totalPages}</span>
          <button type="button"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[#eef2f7]"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* ─── Detail drawer ─────────────────────────────────────────────────── */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30">
          <div className="bg-white h-full w-full max-w-lg shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="text-sm font-semibold text-[#1e2a38]">
                  Licence Obligation
                </div>
                <div className="text-xs text-[#6b7685] mt-0.5">
                  {detailItem.obligation_ref}
                  {detailItem.project_name && <> &nbsp;&middot;&nbsp; {detailItem.project_name}</>}
                </div>
              </div>
              <button type="button"
                onClick={() => setDetailItem(null)}
                className="text-[#9aa5b4] hover:text-[#2d3748] text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 p-5 space-y-5">
              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[detailItem.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                  {STATUS_LABELS[detailItem.chain_status] ?? detailItem.chain_status.replace(/_/g, ' ')}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${CLASS_COLORS[detailItem.obligation_class] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                  {CLASS_LABELS[detailItem.obligation_class] ?? detailItem.obligation_class}
                </span>
                {detailItem.sla_breached === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">SLA Breached</span>
                )}
                {detailItem.regulator_notified === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-semibold">Regulator Notified</span>
                )}
              </div>

              {/* Core fields */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Licence Number</div>
                  <div className="text-[#2d3748] font-mono">{detailItem.licence_number}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Obligation Ref</div>
                  <div className="text-[#2d3748] font-mono">{detailItem.obligation_ref}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Compliance Period</div>
                  <div className="text-[#1e2a38]">{detailItem.compliance_period}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Project Name</div>
                  <div className="text-[#1e2a38]">{detailItem.project_name ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">SLA Deadline</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.sla_deadline).isPast ? 'text-red-600 font-medium' : 'text-[#1e2a38]'}`}>
                    {fmtDate(detailItem.sla_deadline).text}
                  </div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Regulator Notified</div>
                  <div className={detailItem.regulator_notified === 1 ? 'text-orange-600 font-medium' : 'text-[#9aa5b4]'}>
                    {detailItem.regulator_notified === 1 ? 'Yes' : 'No'}
                  </div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Actor</div>
                  <div className="text-[#2d3748] break-all">{detailItem.actor_id ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">IPP ID</div>
                  <div className="font-mono text-[#3d4756] break-all">{truncate(detailItem.ipp_id, 30)}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Created</div>
                  <div className="text-[#3d4756]">{fmtDate(detailItem.created_at).text}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Updated</div>
                  <div className="text-[#3d4756]">{fmtDate(detailItem.updated_at).text}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[#9aa5b4] mb-0.5">Condition Description</div>
                  <div className="text-[#2d3748] bg-[#f8fafc] rounded p-2 border whitespace-pre-wrap">
                    {detailItem.condition_description}
                  </div>
                </div>
              </div>

              {/* Reason */}
              {detailItem.reason && (
                <div>
                  <div className="text-xs text-[#9aa5b4] mb-1">Reason / Notes</div>
                  <div className="text-xs text-[#2d3748] bg-[#f8fafc] rounded p-2 border whitespace-pre-wrap">
                    {detailItem.reason}
                  </div>
                </div>
              )}

              {/* Actions section */}
              {!HARD_TERMINALS.has(detailItem.chain_status) && getActions(detailItem).length > 0 && (
                <div className="border-t pt-4">
                  <div className="text-xs font-semibold text-[#2d3748] mb-2">Advance State Machine</div>
                  <button type="button"
                    onClick={() => {
                      setDetailItem(null);
                      openActionPicker(detailItem);
                    }}
                    className="px-4 py-1.5 text-xs rounded bg-[#c2873a] text-white hover:bg-[#a3702f]"
                  >
                    Open Action Picker
                  </button>
                </div>
              )}

              {(HARD_TERMINALS.has(detailItem.chain_status) || detailItem.chain_status === 'assessed_compliant') && (
                <div className="border-t pt-4">
                  <div className="text-xs text-[#9aa5b4] italic">
                    {HARD_TERMINALS.has(detailItem.chain_status)
                      ? 'This obligation is in a terminal state — no further actions are available.'
                      : 'This obligation period is closed as compliant. A new record will be created for the next period.'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Action modal ──────────────────────────────────────────────────── */}
      {actionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-[#1e2a38] mb-1">Licence Obligation Action</div>
            <div className="text-xs text-[#6b7685] mb-4">
              {CLASS_LABELS[actionItem.obligation_class] ?? actionItem.obligation_class}
              {' '}&mdash;{' '}
              {actionItem.obligation_ref}
              {' '}&mdash;{' '}
              {STATUS_LABELS[actionItem.chain_status] ?? actionItem.chain_status}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-[#3d4756] mb-1">Action *</label>
              <select
                value={selectedAction}
                onChange={e => setSelectedAction(e.target.value)}
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
                disabled={actionLoading || !selectedAction}
                className={`px-4 py-1.5 text-xs rounded text-white disabled:opacity-50 ${
                  modalActions.find(a => a.name === selectedAction)?.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : modalActions.find(a => a.name === selectedAction)?.variant === 'warn'
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-[#c2873a] hover:bg-[#a3702f]'
                }`}
              >
                {actionLoading ? 'Submitting…' : actionLabelCurrent}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IppLicenceObligationTab;
