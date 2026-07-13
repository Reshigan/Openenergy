import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface CpTrackerItem {
  id: string;
  cp_title: string;
  cp_tier: string;
  project_ref: string | null;
  lender_ref: string | null;
  gate_ref: string | null;
  description: string | null;
  chain_status: string;
  sla_deadline: string | null;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface CpKpis {
  total: number;
  active: number;
  sla_breached: number;
  satisfied_count: number;
  waived_count: number;
  lapsed_count: number;
  rejected_count: number;
}

// ─── Status meta ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  identified:          'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  documented:          'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  submitted:           'bg-cyan-100 text-cyan-700',
  under_verification:  'bg-[var(--border-subtle, #e8ecf0)] text-[var(--ink-2, #3d4756)]',
  conditional_pass:    'bg-teal-100 text-teal-700',
  outstanding:         'bg-amber-100 text-amber-700',
  notice_served:       'bg-orange-100 text-orange-700',
  cure_underway:       'bg-purple-100 text-purple-700',
  satisfied:           'bg-green-100 text-green-700',
  waived:              'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  lapsed:              'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #9aa5b4)]',
  rejected:            'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  identified:          'Identified',
  documented:          'Documented',
  submitted:           'Submitted',
  under_verification:  'Under Verification',
  conditional_pass:    'Conditional Pass',
  outstanding:         'Outstanding',
  notice_served:       'Notice Served',
  cure_underway:       'Cure Underway',
  satisfied:           'Satisfied',
  waived:              'Waived',
  lapsed:              'Lapsed',
  rejected:            'Rejected',
};

// ─── Tier badges ─────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  operational: 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  commercial:  'bg-amber-100 text-amber-700',
  financial:   'bg-purple-100 text-purple-700',
  regulatory:  'bg-orange-100 text-orange-700',
  strategic:   'bg-red-100 text-red-700',
};

const TIER_LABELS: Record<string, string> = {
  operational: 'Operational',
  commercial:  'Commercial',
  financial:   'Financial',
  regulatory:  'Regulatory',
  strategic:   'Strategic',
};

const TIER_SLA: Record<string, string> = {
  operational: '14d SLA',
  commercial:  '21d SLA',
  financial:   '30d SLA',
  regulatory:  '45d SLA',
  strategic:   '60d SLA',
};

// ─── Actions per state ────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set(['satisfied', 'waived', 'lapsed', 'rejected']);

const STATUSES = Object.keys(STATUS_LABELS);
const CP_TIERS = ['operational', 'commercial', 'financial', 'regulatory', 'strategic'] as const;

interface ActionDef {
  name: string;
  label: string;
  variant?: 'danger' | 'warn' | 'success';
}

const ACTION_LABELS: Record<string, string> = {
  document_cp:             'Document CP',
  submit_for_verification: 'Submit for Verification',
  conditional_pass:        'Mark Conditional Pass',
  flag_outstanding:        'Flag Outstanding',
  serve_notice:            'Serve Notice',
  commence_cure:           'Commence Cure',
  satisfy_cp:              'Mark Satisfied',
  waive_cp:                'Waive CP',
  expire_cp:               'Expire CP',
  reject_cp:               'Reject CP',
};

function getActions(item: CpTrackerItem): ActionDef[] {
  if (HARD_TERMINALS.has(item.chain_status)) return [];
  switch (item.chain_status) {
    case 'identified':
      return [
        { name: 'document_cp', label: ACTION_LABELS.document_cp, variant: 'success' },
        { name: 'expire_cp',   label: ACTION_LABELS.expire_cp,   variant: 'warn'    },
      ];
    case 'documented':
      return [
        { name: 'submit_for_verification', label: ACTION_LABELS.submit_for_verification, variant: 'success' },
        { name: 'expire_cp',               label: ACTION_LABELS.expire_cp,               variant: 'warn'    },
      ];
    case 'submitted':
      return [
        { name: 'expire_cp',  label: ACTION_LABELS.expire_cp,  variant: 'warn'    },
        { name: 'reject_cp',  label: ACTION_LABELS.reject_cp,  variant: 'danger'  },
      ];
    case 'under_verification':
      return [
        { name: 'conditional_pass',        label: ACTION_LABELS.conditional_pass,        variant: 'success' },
        { name: 'flag_outstanding',        label: ACTION_LABELS.flag_outstanding,        variant: 'warn'    },
        { name: 'satisfy_cp',              label: ACTION_LABELS.satisfy_cp,              variant: 'success' },
        { name: 'waive_cp',                label: ACTION_LABELS.waive_cp                                    },
        { name: 'expire_cp',               label: ACTION_LABELS.expire_cp,               variant: 'warn'    },
        { name: 'reject_cp',               label: ACTION_LABELS.reject_cp,               variant: 'danger'  },
      ];
    case 'conditional_pass':
      return [
        { name: 'flag_outstanding', label: ACTION_LABELS.flag_outstanding, variant: 'warn'    },
        { name: 'satisfy_cp',       label: ACTION_LABELS.satisfy_cp,       variant: 'success' },
        { name: 'expire_cp',        label: ACTION_LABELS.expire_cp,        variant: 'warn'    },
      ];
    case 'outstanding':
      return [
        { name: 'serve_notice', label: ACTION_LABELS.serve_notice,                     },
        { name: 'waive_cp',     label: ACTION_LABELS.waive_cp                          },
        { name: 'expire_cp',    label: ACTION_LABELS.expire_cp,    variant: 'warn'     },
      ];
    case 'notice_served':
      return [
        { name: 'commence_cure', label: ACTION_LABELS.commence_cure, variant: 'success' },
        { name: 'waive_cp',      label: ACTION_LABELS.waive_cp                          },
        { name: 'expire_cp',     label: ACTION_LABELS.expire_cp,     variant: 'warn'    },
      ];
    case 'cure_underway':
      return [
        { name: 'satisfy_cp', label: ACTION_LABELS.satisfy_cp, variant: 'success' },
        { name: 'waive_cp',   label: ACTION_LABELS.waive_cp                       },
        { name: 'expire_cp',  label: ACTION_LABELS.expire_cp,  variant: 'warn'    },
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

const sel = 'border rounded px-2 py-1 text-xs text-[var(--ink, #2d3748)] bg-surface-v2';

const PAGE_SIZE = 20;

// ─── KPI chip ─────────────────────────────────────────────────────────────────

type KpiMode = 'neutral' | 'good' | 'alert' | 'danger';
function KpiChip({ label, value, mode = 'neutral' }: { label: string; value: string | number; mode?: KpiMode }) {
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

// ─── Component ────────────────────────────────────────────────────────────────

export function IppCpTrackerTab() {
  const [items, setItems]         = useState<CpTrackerItem[]>([]);
  const [kpis, setKpis]           = useState<CpKpis | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [filterStatus, setFilterStatus]       = useState('');
  const [filterTier, setFilterTier]           = useState('');
  const [filterSlaBreached, setFilterSlaBreached] = useState(false);
  const [page, setPage]           = useState(1);

  // Create form
  const [showCreate, setShowCreate]       = useState(false);
  const [creating, setCreating]           = useState(false);
  const [createError, setCreateError]     = useState<string | null>(null);
  const [formTitle, setFormTitle]         = useState('');
  const [formTier, setFormTier]           = useState<string>(CP_TIERS[0]);
  const [formProjectRef, setFormProjectRef] = useState('');
  const [formLenderRef, setFormLenderRef] = useState('');
  const [formGateRef, setFormGateRef]     = useState('');
  const [formDescription, setFormDescription] = useState('');

  // Detail drawer
  const [detailItem, setDetailItem] = useState<CpTrackerItem | null>(null);

  // Action modal
  const [actionItem, setActionItem]         = useState<CpTrackerItem | null>(null);
  const [selectedAction, setSelectedAction] = useState('');
  const [actionReason, setActionReason]     = useState('');
  const [actionLoading, setActionLoading]   = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);

  async function load(
    status      = filterStatus,
    tier        = filterTier,
    slaBreached = filterSlaBreached,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status)      params.set('status', status);
      if (tier)        params.set('cp_tier', tier);
      if (slaBreached) params.set('sla_breached', '1');
      const res = await fetch(`/api/ipp-cp-tracker?${params}`, {
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

  const total     = kpis?.total         ?? items.length;
  const active    = kpis?.active        ?? items.filter(i => !HARD_TERMINALS.has(i.chain_status)).length;
  const breached  = kpis?.sla_breached  ?? items.filter(i => i.sla_breached === 1).length;
  const satisfied = kpis?.satisfied_count ?? items.filter(i => i.chain_status === 'satisfied').length;
  const lapsed    = kpis?.lapsed_count  ?? items.filter(i => i.chain_status === 'lapsed').length;
  const rejected  = kpis?.rejected_count ?? items.filter(i => i.chain_status === 'rejected').length;
  const terminalSummary = `${satisfied}S / ${lapsed}L / ${rejected}R`;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Create handler ───────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || !formTier) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        cp_title: formTitle.trim(),
        cp_tier:  formTier,
      };
      if (formProjectRef.trim())  body.project_ref  = formProjectRef.trim();
      if (formLenderRef.trim())   body.lender_ref   = formLenderRef.trim();
      if (formGateRef.trim())     body.gate_ref     = formGateRef.trim();
      if (formDescription.trim()) body.description  = formDescription.trim();

      const res = await fetch('/api/ipp-cp-tracker', {
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
      setFormTitle('');
      setFormTier(CP_TIERS[0]);
      setFormProjectRef('');
      setFormLenderRef('');
      setFormGateRef('');
      setFormDescription('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  // ─── Action handlers ──────────────────────────────────────────────────────

  function openActionPicker(item: CpTrackerItem) {
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

      const res = await fetch(`/api/ipp-cp-tracker/${actionItem.id}/action`, {
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
        <KpiChip label="Total CPs"     value={total} />
        <KpiChip label="Active CPs"    value={active}   mode={active > 0 ? 'good' : 'neutral'} />
        <KpiChip label="SLA Breached"  value={breached} mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip
          label="Satisfied / Lapsed / Rejected"
          value={terminalSummary}
          mode={lapsed > 0 || rejected > 0 ? 'alert' : satisfied > 0 ? 'good' : 'neutral'}
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier, filterSlaBreached); }}
          className={sel}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select
          value={filterTier}
          onChange={e => { setFilterTier(e.target.value); load(filterStatus, e.target.value, filterSlaBreached); }}
          className={sel}
        >
          <option value="">All tiers</option>
          {CP_TIERS.map(t => (
            <option key={t} value={t}>{TIER_LABELS[t]} — {TIER_SLA[t]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[var(--ink, #2d3748)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterSlaBreached}
            onChange={e => { setFilterSlaBreached(e.target.checked); load(filterStatus, filterTier, e.target.checked); }}
            className="accent-red-600"
          />
          SLA Breached only
        </label>
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
          + New CP
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'var(--border-subtle, oklch(0.87 0.010 250))', background: 'var(--s2, oklch(0.94 0.006 250))' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>New Condition Precedent</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">CP Title *</label>
              <input
                type="text"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="e.g. NERSA Generation Licence Issue"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">CP Tier *</label>
              <select
                value={formTier}
                onChange={e => setFormTier(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {CP_TIERS.map(t => (
                  <option key={t} value={t}>{TIER_LABELS[t]} — {TIER_SLA[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Project Reference</label>
              <input
                type="text"
                value={formProjectRef}
                onChange={e => setFormProjectRef(e.target.value)}
                placeholder="e.g. REIPPPP-BW4-GR-001"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Lender Reference</label>
              <input
                type="text"
                value={formLenderRef}
                onChange={e => setFormLenderRef(e.target.value)}
                placeholder="e.g. LF-2025-001"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Gate Reference</label>
              <input
                type="text"
                value={formGateRef}
                onChange={e => setFormGateRef(e.target.value)}
                placeholder="e.g. FC-GATE-B"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Description</label>
              <textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                rows={2}
                placeholder="Brief description of the condition precedent and satisfaction criteria"
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
                <th className="pb-2 pr-3">CP Title</th>
                <th className="pb-2 pr-3">Tier</th>
                <th className="pb-2 pr-3">Project Ref</th>
                <th className="pb-2 pr-3">Gate Ref</th>
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
                    className="border-b hover:bg-[var(--s2, #eef2f7)] cursor-pointer"
                    onClick={() => setDetailItem(item)}
                  >
                    <td
                      className="py-2 pr-3 text-xs text-[var(--ink, #1e2a38)] max-w-[200px] truncate font-medium"
                      title={item.cp_title}
                    >
                      {truncate(item.cp_title, 32)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[item.cp_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {TIER_LABELS[item.cp_tier] ?? item.cp_tier}
                      </span>
                    </td>
                    <td
                      className="py-2 pr-3 text-xs text-[var(--ink-2, #3d4756)] max-w-[140px] truncate"
                      title={item.project_ref ?? undefined}
                    >
                      {item.project_ref ?? <span className="text-[var(--ink-2, #9aa5b4)]">—</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--ink-2, #3d4756)]">
                      {item.gate_ref ?? <span className="text-[var(--ink-2, #9aa5b4)]">—</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? statusLabel(item.chain_status).text}
                      </span>
                      {item.sla_breached === 1 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600 font-semibold">SLA</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums">
                      <span className={due.isPast ? 'text-red-600 font-medium' : 'text-[var(--ink-2, #3d4756)]'}>
                        {due.text}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      {item.regulator_notified === 1 ? (
                        <span title="Regulator notified" className="text-orange-500 text-base leading-none">&#9873;</span>
                      ) : (
                        <span className="text-[var(--border-subtle, #e8ecf0)] text-base leading-none">&#9873;</span>
                      )}
                    </td>
                    <td
                      className="py-2 pr-3"
                      onClick={e => e.stopPropagation()}
                    >
                      {actions.length > 0 && (
                        <button type="button"
                          onClick={() => openActionPicker(item)}
                          className="px-2 py-0.5 text-xs rounded border"
                          style={{ background: 'var(--s2, oklch(0.94 0.006 250))', color: 'var(--accent, oklch(0.46 0.16 55))', borderColor: 'var(--border-subtle, oklch(0.87 0.010 250))' }}
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
                  <td colSpan={8} className="py-10 text-center text-[var(--ink-2, #9aa5b4)] text-sm">
                    No conditions precedent found
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
          <span className="text-xs text-[var(--ink-2, #6b7685)]">Page {page} of {totalPages}</span>
          <button type="button"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-[var(--s2, #eef2f7)]"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* ─── Detail drawer ─────────────────────────────────────────────────── */}
      {detailItem && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailItem(null); }} className="fixed inset-0 z-50 flex items-center justify-end bg-black/30">
          <div className="bg-surface-v2 h-full w-full max-w-lg shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="text-sm font-semibold text-[var(--ink, #1e2a38)]">
                  Condition Precedent
                </div>
                <div className="text-xs text-[var(--ink-2, #6b7685)] mt-0.5">
                  {TIER_LABELS[detailItem.cp_tier] ?? detailItem.cp_tier}
                  {detailItem.gate_ref && <> &nbsp;&middot;&nbsp; {detailItem.gate_ref}</>}
                </div>
              </div>
              <button type="button"
                onClick={() => setDetailItem(null)}
                className="text-[var(--ink-2, #9aa5b4)] hover:text-[var(--ink, #2d3748)] text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 p-5 space-y-5">
              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[detailItem.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                  {STATUS_LABELS[detailItem.chain_status] ?? statusLabel(detailItem.chain_status).text}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[detailItem.cp_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                  {TIER_LABELS[detailItem.cp_tier] ?? detailItem.cp_tier} — {TIER_SLA[detailItem.cp_tier] ?? ''}
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
                <div className="col-span-2">
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">CP Title</div>
                  <div className="font-medium text-[var(--ink, #1e2a38)]">{detailItem.cp_title}</div>
                </div>
                {detailItem.description && (
                  <div className="col-span-2">
                    <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Description</div>
                    <div className="text-[var(--ink, #2d3748)] text-xs leading-relaxed">{detailItem.description}</div>
                  </div>
                )}
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Project Reference</div>
                  <div className="text-[var(--ink, #1e2a38)]">{detailItem.project_ref ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Lender Reference</div>
                  <div className="text-[var(--ink, #1e2a38)]">{detailItem.lender_ref ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Gate Reference</div>
                  <div className="text-[var(--ink, #1e2a38)]">{detailItem.gate_ref ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">SLA Deadline</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.sla_deadline).isPast ? 'text-red-600 font-medium' : 'text-[var(--ink, #1e2a38)]'}`}>
                    {fmtDate(detailItem.sla_deadline).text}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Regulator Notified</div>
                  <div className={detailItem.regulator_notified === 1 ? 'text-orange-600 font-medium' : 'text-[var(--ink-2, #9aa5b4)]'}>
                    {detailItem.regulator_notified === 1 ? 'Yes' : 'No'}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Actor</div>
                  <div className="text-[var(--ink, #2d3748)] break-all">{detailItem.actor_id ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Created</div>
                  <div className="text-[var(--ink-2, #3d4756)]">{fmtDate(detailItem.created_at).text}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Updated</div>
                  <div className="text-[var(--ink-2, #3d4756)]">{fmtDate(detailItem.updated_at).text}</div>
                </div>
              </div>

              {/* Reason */}
              {detailItem.reason && (
                <div>
                  <div className="text-xs text-[var(--ink-2, #9aa5b4)] mb-1">Reason / Notes</div>
                  <div className="text-xs text-[var(--ink, #2d3748)] bg-[var(--s1, #f8fafc)] rounded p-2 border whitespace-pre-wrap">
                    {detailItem.reason}
                  </div>
                </div>
              )}

              {/* Actions section */}
              {!HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs font-semibold text-[var(--ink, #2d3748)] mb-2">Advance State Machine</div>
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

              {HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs text-[var(--ink-2, #9aa5b4)] italic">
                    This CP is in a terminal state — no further actions are available.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Action modal ──────────────────────────────────────────────────── */}
      {actionItem && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setActionItem(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface-v2 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-[var(--ink, #1e2a38)] mb-1">CP Tracker Action</div>
            <div className="text-xs text-[var(--ink-2, #6b7685)] mb-4">
              {TIER_LABELS[actionItem.cp_tier] ?? actionItem.cp_tier}
              {actionItem.gate_ref && <> &mdash; {actionItem.gate_ref}</>}
              {' '}—{' '}
              {STATUS_LABELS[actionItem.chain_status] ?? actionItem.chain_status}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Action *</label>
              <select
                value={selectedAction}
                onChange={e => setSelectedAction(e.target.value)}
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {modalActions.map(a => (
                  <option key={a.name} value={a.name}>{a.label}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Reason (optional)</label>
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
                className="px-3 py-1.5 text-xs border rounded bg-surface-v2 text-[var(--ink-2, #3d4756)] hover:bg-[var(--s2, #eef2f7)]"
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

export default IppCpTrackerTab;
