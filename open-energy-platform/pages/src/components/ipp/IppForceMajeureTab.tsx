import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FmChainRecord {
  id: string;
  ppa_id: string;
  fm_category: string;
  chain_status: string;
  affected_capacity_mw: number;
  relief_amount_zar: number | null;
  actor_id: string | null;
  created_at: string;
  // detail fields (GET /:id)
  notice_date?: string | null;
  fm_start_date?: string | null;
  fm_end_date?: string | null;
  quantum_basis?: string | null;
  sla_deadline?: string | null;
  sla_breached?: number;
  regulator_notified?: number;
  reason?: string | null;
  updated_at?: string;
  timeline?: AuditEvent[];
}

interface AuditEvent {
  id: string;
  event: string;
  actor_id: string | null;
  created_at: string;
  data?: string | null;
}

interface FmKpis {
  active_events: number | null;
  relief_claimed_zar: number | null;
  avg_duration_days: number | null;
  disputed_count: number | null;
}

// ─── Status meta ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  fm_submitted:          'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  notice_verified:       'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  mitigation_assessed:   'bg-cyan-100 text-cyan-700',
  period_active:         'bg-orange-100 text-orange-700',
  relief_period_running: 'bg-amber-100 text-amber-800',
  relief_claimed:        'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  quantum_assessed:      'bg-purple-100 text-purple-700',
  relief_granted:        'bg-green-100 text-green-700',
  relief_denied:         'bg-red-100 text-red-700',
  disputed:              'bg-yellow-100 text-yellow-800',
  fm_lapsed:             'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #9aa5b4)]',
  cancelled:             'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #9aa5b4)]',
};

const STATUS_LABELS: Record<string, string> = {
  fm_submitted:          'FM Submitted',
  notice_verified:       'Notice Verified',
  mitigation_assessed:   'Mitigation Assessed',
  period_active:         'Period Active',
  relief_period_running: 'Relief Period Running',
  relief_claimed:        'Relief Claimed',
  quantum_assessed:      'Quantum Assessed',
  relief_granted:        'Relief Granted',
  relief_denied:         'Relief Denied',
  disputed:              'Disputed',
  fm_lapsed:             'FM Lapsed',
  cancelled:             'Cancelled',
};

// ─── Category meta ────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  extreme_weather:   'bg-red-100 text-red-700',
  severe_storm:      'bg-orange-100 text-orange-700',
  network_fault:     'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  regulatory_action: 'bg-purple-100 text-purple-700',
  general:           'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
};

const CATEGORY_LABELS: Record<string, string> = {
  extreme_weather:   'Extreme Weather',
  severe_storm:      'Severe Storm',
  network_fault:     'Network Fault',
  regulatory_action: 'Regulatory Action',
  general:           'General',
};

// SLA days per category (URGENT — tighter for more severe)
const SLA_DAYS: Record<string, number> = {
  extreme_weather:   2,
  severe_storm:      3,
  network_fault:     7,
  regulatory_action: 14,
  general:           21,
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as string[];
const STATUSES   = Object.keys(STATUS_LABELS) as string[];

// ─── Action definitions ───────────────────────────────────────────────────────

const HARD_TERMINALS = new Set([
  'relief_granted', 'relief_denied', 'disputed', 'fm_lapsed', 'cancelled',
]);

interface ActionDef {
  name: string;
  label: string;
  variant?: 'danger' | 'warn' | 'success';
}

function getActions(status: string): ActionDef[] {
  if (HARD_TERMINALS.has(status)) return [];
  switch (status) {
    case 'fm_submitted':
      return [
        { name: 'verify_notice',   label: 'Verify Notice',  variant: 'success' },
        { name: 'deny_relief',     label: 'Deny Relief',    variant: 'danger'  },
        { name: 'raise_dispute',   label: 'Raise Dispute',  variant: 'warn'    },
        { name: 'lapse_event',     label: 'Lapse Event',    variant: 'warn'    },
      ];
    case 'notice_verified':
      return [
        { name: 'assess_mitigation', label: 'Assess Mitigation', variant: 'success' },
        { name: 'deny_relief',       label: 'Deny Relief',       variant: 'danger'  },
        { name: 'raise_dispute',     label: 'Raise Dispute',     variant: 'warn'    },
        { name: 'lapse_event',       label: 'Lapse Event',       variant: 'warn'    },
      ];
    case 'mitigation_assessed':
      return [
        { name: 'activate_period', label: 'Activate FM Period', variant: 'success' },
        { name: 'deny_relief',     label: 'Deny Relief',        variant: 'danger'  },
        { name: 'raise_dispute',   label: 'Raise Dispute',      variant: 'warn'    },
        { name: 'lapse_event',     label: 'Lapse Event',        variant: 'warn'    },
      ];
    case 'period_active':
      return [
        { name: 'run_relief_period', label: 'Run Relief Period', variant: 'success' },
        { name: 'deny_relief',       label: 'Deny Relief',       variant: 'danger'  },
        { name: 'raise_dispute',     label: 'Raise Dispute',     variant: 'warn'    },
        { name: 'lapse_event',       label: 'Lapse Event',       variant: 'warn'    },
      ];
    case 'relief_period_running':
      return [
        { name: 'submit_relief_claim', label: 'Submit Relief Claim', variant: 'success' },
        { name: 'deny_relief',         label: 'Deny Relief',         variant: 'danger'  },
        { name: 'raise_dispute',       label: 'Raise Dispute',       variant: 'warn'    },
        { name: 'lapse_event',         label: 'Lapse Event',         variant: 'warn'    },
      ];
    case 'relief_claimed':
      return [
        { name: 'assess_quantum', label: 'Assess Quantum', variant: 'success' },
        { name: 'deny_relief',    label: 'Deny Relief',    variant: 'danger'  },
        { name: 'raise_dispute',  label: 'Raise Dispute',  variant: 'warn'    },
      ];
    case 'quantum_assessed':
      return [
        { name: 'grant_relief', label: 'Grant Relief', variant: 'success' },
        { name: 'deny_relief',  label: 'Deny Relief',  variant: 'danger'  },
        { name: 'raise_dispute',label: 'Raise Dispute',variant: 'warn'    },
      ];
    default:
      return [];
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): { text: string; isPast: boolean } {
  if (!d) return { text: '—', isPast: false };
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return { text: '—', isPast: false };
  return {
    text: dt.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }),
    isPast: dt < new Date(),
  };
}

function fmtZar(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000_000) return `R ${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `R ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)         return `R ${(v / 1_000).toFixed(1)}K`;
  return `R ${v.toLocaleString('en-ZA')}`;
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

export function IppForceMajeureTab() {
  const [items, setItems]             = useState<FmChainRecord[]>([]);
  const [kpis, setKpis]               = useState<FmKpis | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [page, setPage]               = useState(1);

  // Create form
  const [showCreate, setShowCreate]           = useState(false);
  const [creating, setCreating]               = useState(false);
  const [createError, setCreateError]         = useState<string | null>(null);
  const [formPpaId, setFormPpaId]             = useState('');
  const [formCategory, setFormCategory]       = useState(CATEGORIES[0]);
  const [formCapacity, setFormCapacity]       = useState('');
  const [formNoticeDate, setFormNoticeDate]   = useState('');
  const [formReason, setFormReason]           = useState('');

  // Detail drawer
  const [detailItem, setDetailItem]         = useState<FmChainRecord | null>(null);
  const [detailLoading, setDetailLoading]   = useState(false);

  // Action modal
  const [actionItem, setActionItem]         = useState<FmChainRecord | null>(null);
  const [selectedAction, setSelectedAction] = useState('');
  const [actionReason, setActionReason]     = useState('');
  const [actionRelief, setActionRelief]     = useState('');
  const [actionLoading, setActionLoading]   = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);

  const token = () => localStorage.getItem('token');

  async function load(
    status   = filterStatus,
    category = filterCategory,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status)   params.set('status', status);
      if (category) params.set('fm_category', category);
      const res = await fetch(`/api/ipp-force-majeure-chain?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as {
        success: boolean;
        data: FmChainRecord[];
        kpis: FmKpis;
      };
      setItems(json.data ?? []);
      if (json.kpis) setKpis(json.kpis);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function openDetail(item: FmChainRecord) {
    setDetailItem(item);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/ipp-force-majeure-chain/${item.id}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { success: boolean; data: FmChainRecord };
      setDetailItem(json.data);
    } catch {
      // keep the list-level data
    } finally {
      setDetailLoading(false);
    }
  }

  // KPI helpers
  const activeEvents     = kpis?.active_events ?? items.filter(i => !HARD_TERMINALS.has(i.chain_status)).length;
  const reliefClaimedZar = kpis?.relief_claimed_zar ?? null;
  const avgDuration      = kpis?.avg_duration_days != null ? `${kpis.avg_duration_days.toFixed(1)} days` : '—';
  const disputedCount    = kpis?.disputed_count ?? items.filter(i => i.chain_status === 'disputed').length;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Create handler ─────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formPpaId.trim() || !formCategory || !formCapacity || !formNoticeDate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        ppa_id:               formPpaId.trim(),
        fm_category:          formCategory,
        affected_capacity_mw: parseFloat(formCapacity),
        notice_date:          formNoticeDate,
      };
      if (formReason.trim()) body.reason = formReason.trim();

      const res = await fetch('/api/ipp-force-majeure-chain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setShowCreate(false);
      setFormPpaId('');
      setFormCategory(CATEGORIES[0]);
      setFormCapacity('');
      setFormNoticeDate('');
      setFormReason('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  // ─── Action handlers ────────────────────────────────────────────────────────

  function openActionPicker(item: FmChainRecord) {
    const actions = getActions(item.chain_status);
    if (actions.length === 0) return;
    setActionItem(item);
    setSelectedAction(actions[0].name);
    setActionReason('');
    setActionRelief('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setSelectedAction('');
    setActionReason('');
    setActionRelief('');
    setActionError(null);
  }

  async function submitAction() {
    if (!actionItem || !selectedAction) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { action: selectedAction };
      if (actionReason.trim()) body.reason = actionReason.trim();
      if (actionRelief.trim()) body.relief_amount_zar = parseFloat(actionRelief);

      const res = await fetch(`/api/ipp-force-majeure-chain/${actionItem.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
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

  const modalActions       = actionItem ? getActions(actionItem.chain_status) : [];
  const actionLabelCurrent = modalActions.find(a => a.name === selectedAction)?.label ?? 'Confirm';

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip
          label="Active Events"
          value={activeEvents}
          mode={activeEvents > 0 ? 'alert' : 'neutral'}
        />
        <KpiChip
          label="Relief Claimed"
          value={reliefClaimedZar != null ? fmtZar(reliefClaimedZar) : '—'}
          mode={reliefClaimedZar && reliefClaimedZar > 0 ? 'alert' : 'neutral'}
        />
        <KpiChip
          label="Avg Duration"
          value={avgDuration}
        />
        <KpiChip
          label="Disputed"
          value={disputedCount}
          mode={disputedCount > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterCategory); }}
          className={sel}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={e => { setFilterCategory(e.target.value); load(filterStatus, e.target.value); }}
          className={sel}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
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
          + Submit FM Notice
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'oklch(0.87 0.010 250)', background: 'oklch(0.94 0.006 250)' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>New Force Majeure Notification</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">PPA ID *</label>
              <input
                type="text"
                value={formPpaId}
                onChange={e => setFormPpaId(e.target.value)}
                placeholder="e.g. ppa-001"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">FM Category *</label>
              <select
                value={formCategory}
                onChange={e => setFormCategory(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]} (SLA: {SLA_DAYS[c]}d)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Affected Capacity (MW) *</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={formCapacity}
                onChange={e => setFormCapacity(e.target.value)}
                placeholder="e.g. 50.0"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Notice Date *</label>
              <input
                type="date"
                value={formNoticeDate}
                onChange={e => setFormNoticeDate(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Description (optional)</label>
              <textarea
                value={formReason}
                onChange={e => setFormReason(e.target.value)}
                placeholder="Brief description of the force majeure event"
                rows={2}
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
              {creating ? 'Submitting…' : 'Submit Notice'}
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
                <th className="pb-2 pr-3">PPA ID</th>
                <th className="pb-2 pr-3">Category</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3 text-right">Capacity (MW)</th>
                <th className="pb-2 pr-3 text-right">Relief Claimed</th>
                <th className="pb-2 pr-3">Actor</th>
                <th className="pb-2 pr-3">Created</th>
                <th className="pb-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions = getActions(item.chain_status);
                return (
                  <tr
                    key={item.id}
                    className="border-b hover:bg-[var(--s2, #eef2f7)] cursor-pointer"
                    onClick={() => openDetail(item)}
                  >
                    <td className="py-2 pr-3 text-xs font-mono text-[var(--ink, #2d3748)]">
                      {item.ppa_id}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[item.fm_category] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {CATEGORY_LABELS[item.fm_category] ?? item.fm_category}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? statusLabel(item.chain_status).text}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums text-[var(--ink, #2d3748)]">
                      {item.affected_capacity_mw != null ? `${item.affected_capacity_mw} MW` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums text-[var(--ink, #2d3748)]">
                      {fmtZar(item.relief_amount_zar)}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--ink-2, #6b7685)] max-w-[120px] truncate" title={item.actor_id ?? ''}>
                      {item.actor_id ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--ink-2, #6b7685)]">
                      {fmtDate(item.created_at).text}
                    </td>
                    <td
                      className="py-2 pr-3"
                      onClick={e => e.stopPropagation()}
                    >
                      {actions.length > 0 && (
                        <button type="button"
                          onClick={() => openActionPicker(item)}
                          className="px-2 py-0.5 text-xs rounded border"
                          style={{ background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)', borderColor: 'oklch(0.87 0.010 250)' }}
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
                    No force majeure records found
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

      {/* ─── Detail drawer ──────────────────────────────────────────────────── */}
      {detailItem && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailItem(null); }} className="fixed inset-0 z-50 flex items-center justify-end bg-black/30">
          <div className="bg-surface-v2 h-full w-full max-w-lg shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="text-sm font-semibold text-[var(--ink, #1e2a38)]">Force Majeure Event</div>
                <div className="text-xs text-[var(--ink-2, #6b7685)] mt-0.5">
                  {CATEGORY_LABELS[detailItem.fm_category] ?? detailItem.fm_category}
                  {detailItem.ppa_id && <> &nbsp;&middot;&nbsp; PPA {detailItem.ppa_id}</>}
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
              {detailLoading && (
                <div className="text-xs text-[var(--ink-2, #9aa5b4)] text-center py-4">Loading details&hellip;</div>
              )}

              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[detailItem.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                  {STATUS_LABELS[detailItem.chain_status] ?? statusLabel(detailItem.chain_status).text}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[detailItem.fm_category] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                  {CATEGORY_LABELS[detailItem.fm_category] ?? detailItem.fm_category}
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
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">PPA ID</div>
                  <div className="font-mono text-[var(--ink, #2d3748)]">{detailItem.ppa_id}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Affected Capacity</div>
                  <div className="text-[var(--ink, #1e2a38)] tabular-nums">
                    {detailItem.affected_capacity_mw != null ? `${detailItem.affected_capacity_mw} MW` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Notice Date</div>
                  <div className="text-[var(--ink, #1e2a38)]">{fmtDate(detailItem.notice_date).text}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">FM Start Date</div>
                  <div className="text-[var(--ink, #1e2a38)]">{fmtDate(detailItem.fm_start_date).text}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">FM End Date</div>
                  <div className="text-[var(--ink, #1e2a38)]">{fmtDate(detailItem.fm_end_date).text}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Relief Amount</div>
                  <div className="text-[var(--ink, #1e2a38)] tabular-nums">{fmtZar(detailItem.relief_amount_zar)}</div>
                </div>
                {detailItem.quantum_basis && (
                  <div className="col-span-2">
                    <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Quantum Basis</div>
                    <div className="text-[var(--ink, #2d3748)]">{detailItem.quantum_basis}</div>
                  </div>
                )}
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">SLA Deadline</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.sla_deadline).isPast ? 'text-red-600 font-medium' : 'text-[var(--ink, #1e2a38)]'}`}>
                    {fmtDate(detailItem.sla_deadline).text}
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

              {/* Reason / notes */}
              {detailItem.reason && (
                <div>
                  <div className="text-xs text-[var(--ink-2, #9aa5b4)] mb-1">Reason / Notes</div>
                  <div className="text-xs text-[var(--ink, #2d3748)] bg-[var(--s1, #f8fafc)] rounded p-2 border whitespace-pre-wrap">
                    {detailItem.reason}
                  </div>
                </div>
              )}

              {/* Timeline */}
              {detailItem.timeline && detailItem.timeline.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-[var(--ink, #2d3748)] mb-2">Timeline</div>
                  <ol className="relative border-l border-[var(--border-subtle, #dde4ec)] space-y-3 pl-4">
                    {detailItem.timeline.map(ev => (
                      <li key={ev.id} className="text-xs">
                        <div className="absolute -left-1 mt-1 w-2 h-2 rounded-full border border-white" style={{ background: 'oklch(0.46 0.16 55)' }} />
                        <span className="font-medium text-[var(--ink, #2d3748)]">
                          {ev.event.replace('fm_evt_', '').replace(/_/g, ' ')}
                        </span>
                        <span className="text-[var(--ink-2, #9aa5b4)] ml-2">{fmtDate(ev.created_at).text}</span>
                        {ev.actor_id && (
                          <span className="text-[var(--ink-2, #9aa5b4)] ml-2">by {ev.actor_id}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Advance state machine */}
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
                    This event is in a terminal state — no further actions are available.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Action modal ────────────────────────────────────────────────────── */}
      {actionItem && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setActionItem(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface-v2 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-[var(--ink, #1e2a38)] mb-1">Force Majeure Action</div>
            <div className="text-xs text-[var(--ink-2, #6b7685)] mb-4">
              {CATEGORY_LABELS[actionItem.fm_category] ?? actionItem.fm_category}
              {' '}&mdash;{' '}
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

            {(selectedAction === 'grant_relief' || selectedAction === 'assess_quantum') && (
              <div className="mb-3">
                <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Relief Amount (ZAR)</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={actionRelief}
                  onChange={e => setActionRelief(e.target.value)}
                  placeholder="e.g. 5000000"
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Reason (optional)</label>
              <textarea
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="Brief justification or reference"
                rows={2}
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

export default IppForceMajeureTab;
