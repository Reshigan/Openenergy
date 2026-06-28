import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface StationLink {
  id: string;
  station_id: string;
  initiating_participant_id: string;
  accepting_participant_id: string;
  link_type: string;
  reference_id: string | null;
  chain_status: string;
  sla_deadline: string | null;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface LinkKpis {
  total: number;
  active: number;
  sla_breached: number;
  rejected: number;
  expired: number;
  suspended: number;
}

// ─── Status meta ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  link_proposed:          'bg-[#eef2f7] text-[#3d4756]',
  under_review:           'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  documentation_requested:'bg-amber-100 text-amber-700',
  documentation_submitted:'bg-cyan-100 text-cyan-700',
  technical_validation:   'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  commercial_terms_review:'bg-purple-100 text-purple-700',
  compliance_check:       'bg-orange-100 text-orange-700',
  approved:               'bg-teal-100 text-teal-700',
  link_active:            'bg-green-100 text-green-700',
  link_rejected:          'bg-red-100 text-red-700',
  link_expired:           'bg-[#eef2f7] text-[#9aa5b4]',
  link_suspended:         'bg-yellow-100 text-yellow-800',
};

const STATUS_LABELS: Record<string, string> = {
  link_proposed:          'Link Proposed',
  under_review:           'Under Review',
  documentation_requested:'Documentation Requested',
  documentation_submitted:'Documentation Submitted',
  technical_validation:   'Technical Validation',
  commercial_terms_review:'Commercial Terms Review',
  compliance_check:       'Compliance Check',
  approved:               'Approved',
  link_active:            'Link Active',
  link_rejected:          'Link Rejected',
  link_expired:           'Link Expired',
  link_suspended:         'Link Suspended',
};

// ─── Link type badges ─────────────────────────────────────────────────────────

const LINK_TYPE_COLORS: Record<string, string> = {
  lender:        'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  carbon_fund:   'bg-green-100 text-green-700',
  offtaker:      'bg-amber-100 text-amber-700',
  grid_operator: 'bg-purple-100 text-purple-700',
};

const LINK_TYPE_LABELS: Record<string, string> = {
  lender:        'Lender',
  carbon_fund:   'Carbon Fund',
  offtaker:      'Offtaker',
  grid_operator: 'Grid Operator',
};

// ─── Actions per state ────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set(['link_rejected', 'link_expired', 'link_suspended']);

const STATUSES     = Object.keys(STATUS_LABELS);
const LINK_TYPES   = ['lender', 'carbon_fund', 'offtaker', 'grid_operator'] as const;

interface ActionDef {
  name: string;
  label: string;
  variant?: 'danger' | 'warn' | 'success';
}

const ACTION_LABELS: Record<string, string> = {
  submit_for_review:               'Submit for Review',
  reject_link:                     'Reject Link',
  expire_link:                     'Expire Link',
  request_documentation:           'Request Documentation',
  commence_technical_validation:   'Commence Technical Validation',
  commence_commercial_review:      'Commence Commercial Review',
  commence_compliance_check:       'Commence Compliance Check',
  approve_link:                    'Approve Link',
  submit_documentation:            'Submit Documentation',
  activate_link:                   'Activate Link',
  suspend_link:                    'Suspend Link',
};

function getActions(item: StationLink): ActionDef[] {
  if (HARD_TERMINALS.has(item.chain_status)) return [];
  switch (item.chain_status) {
    case 'link_proposed':
      return [
        { name: 'submit_for_review',  label: ACTION_LABELS.submit_for_review, variant: 'success' },
        { name: 'reject_link',        label: ACTION_LABELS.reject_link,        variant: 'danger'  },
        { name: 'expire_link',        label: ACTION_LABELS.expire_link,        variant: 'warn'    },
      ];
    case 'under_review':
      return [
        { name: 'request_documentation',         label: ACTION_LABELS.request_documentation         },
        { name: 'commence_technical_validation',  label: ACTION_LABELS.commence_technical_validation  },
        { name: 'commence_commercial_review',     label: ACTION_LABELS.commence_commercial_review     },
        { name: 'commence_compliance_check',      label: ACTION_LABELS.commence_compliance_check      },
        { name: 'approve_link',                   label: ACTION_LABELS.approve_link, variant: 'success' },
        { name: 'reject_link',                    label: ACTION_LABELS.reject_link,  variant: 'danger'  },
      ];
    case 'documentation_requested':
      return [
        { name: 'submit_documentation', label: ACTION_LABELS.submit_documentation },
        { name: 'reject_link',          label: ACTION_LABELS.reject_link, variant: 'danger' },
      ];
    case 'documentation_submitted':
      return [
        { name: 'commence_technical_validation', label: ACTION_LABELS.commence_technical_validation  },
        { name: 'commence_commercial_review',    label: ACTION_LABELS.commence_commercial_review     },
        { name: 'approve_link',                  label: ACTION_LABELS.approve_link, variant: 'success' },
        { name: 'reject_link',                   label: ACTION_LABELS.reject_link,  variant: 'danger'  },
      ];
    case 'technical_validation':
      return [
        { name: 'commence_commercial_review', label: ACTION_LABELS.commence_commercial_review    },
        { name: 'commence_compliance_check',  label: ACTION_LABELS.commence_compliance_check     },
        { name: 'approve_link',               label: ACTION_LABELS.approve_link, variant: 'success' },
        { name: 'reject_link',                label: ACTION_LABELS.reject_link,  variant: 'danger'  },
      ];
    case 'commercial_terms_review':
      return [
        { name: 'commence_compliance_check', label: ACTION_LABELS.commence_compliance_check      },
        { name: 'approve_link',              label: ACTION_LABELS.approve_link, variant: 'success' },
        { name: 'reject_link',               label: ACTION_LABELS.reject_link,  variant: 'danger'  },
      ];
    case 'compliance_check':
      return [
        { name: 'approve_link', label: ACTION_LABELS.approve_link, variant: 'success' },
        { name: 'reject_link',  label: ACTION_LABELS.reject_link,  variant: 'danger'  },
      ];
    case 'approved':
      return [
        { name: 'activate_link', label: ACTION_LABELS.activate_link, variant: 'success' },
        { name: 'reject_link',   label: ACTION_LABELS.reject_link,   variant: 'danger'  },
      ];
    case 'link_active':
      return [
        { name: 'suspend_link', label: ACTION_LABELS.suspend_link, variant: 'warn' },
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

interface ParticipantOption {
  id: string;
  name: string;
  company_name: string;
}

interface StationOption {
  id: string;
  plant_name: string;
  device_sn: string;
  manufacturer: string;
}

export function StationParticipantLinkTab() {
  const [items, setItems]           = useState<StationLink[]>([]);
  const [kpis, setKpis]             = useState<LinkKpis | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [filterStatus, setFilterStatus]       = useState('');
  const [filterType, setFilterType]           = useState('');
  const [filterSlaBreached, setFilterSlaBreached] = useState(false);
  const [page, setPage]             = useState(1);

  // Create form
  const [showCreate, setShowCreate]           = useState(false);
  const [creating, setCreating]               = useState(false);
  const [createError, setCreateError]         = useState<string | null>(null);
  const [formStationId, setFormStationId]     = useState('');
  const [formAcceptingId, setFormAcceptingId] = useState('');
  const [formLinkType, setFormLinkType]       = useState<string>(LINK_TYPES[0]);
  const [formReferenceId, setFormReferenceId] = useState('');

  // Discovery dropdowns
  const [participantOptions, setParticipantOptions] = useState<ParticipantOption[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [stationOptions, setStationOptions]         = useState<StationOption[]>([]);
  const [stationsLoading, setStationsLoading]       = useState(false);

  // Detail drawer
  const [detailItem, setDetailItem] = useState<StationLink | null>(null);

  // Action modal
  const [actionItem, setActionItem]         = useState<StationLink | null>(null);
  const [selectedAction, setSelectedAction] = useState('');
  const [actionReason, setActionReason]     = useState('');
  const [actionLoading, setActionLoading]   = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);

  async function load(
    status      = filterStatus,
    type        = filterType,
    slaBreached = filterSlaBreached,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status)      params.set('status', status);
      if (type)        params.set('link_type', type);
      if (slaBreached) params.set('sla_breached', '1');
      const res = await fetch(`/api/station-participant-links?${params}`, {
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

  // Load participant options whenever link_type changes (or form opens)
  useEffect(() => {
    if (!showCreate) return;
    setParticipantsLoading(true);
    setFormAcceptingId('');
    const role = formLinkType === 'grid_operator' ? 'grid_operator' : formLinkType;
    fetch(`/api/participants?role=${role}&pageSize=200`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then((j: unknown) => {
        const d = (j as { data?: ParticipantOption[] })?.data ?? [];
        setParticipantOptions(d);
      })
      .catch(() => setParticipantOptions([]))
      .finally(() => setParticipantsLoading(false));
  }, [formLinkType, showCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load user's own stations when form opens
  useEffect(() => {
    if (!showCreate) return;
    setStationsLoading(true);
    fetch('/api/esums/manufacturers/stations', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then((j: unknown) => {
        const stations = (j as { data?: StationOption[] })?.data ?? [];
        setStationOptions(stations);
        if (stations.length === 1) setFormStationId(stations[0].id);
      })
      .catch(() => setStationOptions([]))
      .finally(() => setStationsLoading(false));
  }, [showCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  const total     = kpis?.total       ?? items.length;
  const active    = kpis?.active      ?? items.filter(i => i.chain_status === 'link_active').length;
  const breached  = kpis?.sla_breached ?? items.filter(i => i.sla_breached === 1).length;
  const rejected  = kpis?.rejected    ?? items.filter(i => i.chain_status === 'link_rejected').length;
  const expired   = kpis?.expired     ?? items.filter(i => i.chain_status === 'link_expired').length;
  const suspended = kpis?.suspended   ?? items.filter(i => i.chain_status === 'link_suspended').length;
  const terminalSummary = `${active}A / ${rejected}R / ${expired}E / ${suspended}S`;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Create handler ───────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formStationId.trim() || !formAcceptingId.trim() || !formLinkType) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        station_id:               formStationId.trim(),
        accepting_participant_id: formAcceptingId.trim(),
        link_type:                formLinkType,
      };
      if (formReferenceId.trim()) body.reference_id = formReferenceId.trim();

      const res = await fetch('/api/station-participant-links', {
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
      setFormStationId('');
      setFormAcceptingId('');
      setFormLinkType(LINK_TYPES[0]);
      setFormReferenceId('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  // ─── Action handlers ──────────────────────────────────────────────────────

  function openActionPicker(item: StationLink) {
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

      const res = await fetch(`/api/station-participant-links/${actionItem.id}/action`, {
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
        <KpiChip label="Total Links"  value={total} />
        <KpiChip label="Active Links" value={active} mode={active > 0 ? 'good' : 'neutral'} />
        <KpiChip label="SLA Breached" value={breached} mode={breached > 0 ? 'danger' : 'neutral'} />
        <KpiChip
          label="Active / Rejected / Expired / Suspended"
          value={terminalSummary}
          mode={rejected > 0 || expired > 0 || suspended > 0 ? 'alert' : active > 0 ? 'good' : 'neutral'}
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterType, filterSlaBreached); }}
          className={sel}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={e => { setFilterType(e.target.value); load(filterStatus, e.target.value, filterSlaBreached); }}
          className={sel}
        >
          <option value="">All link types</option>
          {LINK_TYPES.map(t => (
            <option key={t} value={t}>{LINK_TYPE_LABELS[t] ?? t}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[#2d3748] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterSlaBreached}
            onChange={e => { setFilterSlaBreached(e.target.checked); load(filterStatus, filterType, e.target.checked); }}
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
          + New Link
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-[oklch(0.87_0.012_250)] bg-[oklch(0.97_0.003_250)] p-4 space-y-3"
        >
          <div className="text-sm font-semibold text-[oklch(0.40_0.009_250)]">New Station Participant Link</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">
                Station *
                {stationsLoading && <span className="ml-1 text-[#9aa5b4]">Loading…</span>}
              </label>
              {stationOptions.length > 0 ? (
                <select
                  value={formStationId}
                  onChange={e => setFormStationId(e.target.value)}
                  required
                  className="w-full border rounded px-2 py-1 text-xs bg-white"
                >
                  <option value="">— Select a station —</option>
                  {stationOptions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.plant_name || s.device_sn} ({s.manufacturer})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formStationId}
                  onChange={e => setFormStationId(e.target.value)}
                  placeholder={stationsLoading ? 'Loading stations…' : 'Station ID'}
                  required
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              )}
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Link Type *</label>
              <select
                value={formLinkType}
                onChange={e => setFormLinkType(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {LINK_TYPES.map(t => (
                  <option key={t} value={t}>{LINK_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[#3d4756] mb-1">
                {LINK_TYPE_LABELS[formLinkType] ?? 'Counterparty'} *
                {participantsLoading && <span className="ml-1 text-[#9aa5b4]">Loading…</span>}
              </label>
              {participantOptions.length > 0 ? (
                <select
                  value={formAcceptingId}
                  onChange={e => setFormAcceptingId(e.target.value)}
                  required
                  className="w-full border rounded px-2 py-1 text-xs bg-white"
                >
                  <option value="">— Select {LINK_TYPE_LABELS[formLinkType] ?? 'counterparty'} —</option>
                  {participantOptions.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.company_name || p.name} — {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-[#6b7685] italic py-1">
                  {participantsLoading
                    ? 'Loading registered counterparties…'
                    : `No registered ${LINK_TYPE_LABELS[formLinkType] ?? 'counterparty'} accounts found on the platform.`}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Reference ID (optional)</label>
              <input
                type="text"
                value={formReferenceId}
                onChange={e => setFormReferenceId(e.target.value)}
                placeholder="e.g. LF-2025-004"
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
                <th className="pb-2 pr-3">Station ID</th>
                <th className="pb-2 pr-3">Link Type</th>
                <th className="pb-2 pr-3">Initiating Party</th>
                <th className="pb-2 pr-3">Accepting Party</th>
                <th className="pb-2 pr-3">Reference ID</th>
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
                    <td
                      className="py-2 pr-3 text-xs font-mono text-[#3d4756] max-w-[140px] truncate"
                      title={item.station_id}
                    >
                      {truncate(item.station_id, 20)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${LINK_TYPE_COLORS[item.link_type] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {LINK_TYPE_LABELS[item.link_type] ?? item.link_type}
                      </span>
                    </td>
                    <td
                      className="py-2 pr-3 text-xs text-[#2d3748] max-w-[140px] truncate"
                      title={item.initiating_participant_id}
                    >
                      {truncate(item.initiating_participant_id, 22)}
                    </td>
                    <td
                      className="py-2 pr-3 text-xs text-[#2d3748] max-w-[140px] truncate"
                      title={item.accepting_participant_id}
                    >
                      {truncate(item.accepting_participant_id, 22)}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[#3d4756]">
                      {item.reference_id ?? <span className="text-[#9aa5b4]">—</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? statusLabel(item.chain_status).text}
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
                          className="px-2 py-0.5 text-xs rounded bg-[oklch(0.97_0.003_250)] text-[oklch(0.46_0.16_55)] hover:bg-[oklch(0.94_0.008_250)] border border-[oklch(0.87_0.012_250)]"
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
                  <td colSpan={9} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No station participant links found
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
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailItem(null); }} className="fixed inset-0 z-50 flex items-center justify-end bg-black/30">
          <div className="bg-white h-full w-full max-w-lg shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="text-sm font-semibold text-[#1e2a38]">
                  Station Participant Link
                </div>
                <div className="text-xs text-[#6b7685] mt-0.5">
                  {LINK_TYPE_LABELS[detailItem.link_type] ?? detailItem.link_type}
                  {detailItem.reference_id && <> &nbsp;&middot;&nbsp; {detailItem.reference_id}</>}
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
                  {STATUS_LABELS[detailItem.chain_status] ?? statusLabel(detailItem.chain_status).text}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${LINK_TYPE_COLORS[detailItem.link_type] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                  {LINK_TYPE_LABELS[detailItem.link_type] ?? detailItem.link_type}
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
                  <div className="text-[#9aa5b4] mb-0.5">Station ID</div>
                  <div className="font-mono text-[#2d3748] break-all">{detailItem.station_id}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[#9aa5b4] mb-0.5">Initiating Participant</div>
                  <div className="font-mono text-[#2d3748] break-all">{detailItem.initiating_participant_id}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[#9aa5b4] mb-0.5">Accepting Participant</div>
                  <div className="font-mono text-[#2d3748] break-all">{detailItem.accepting_participant_id}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Reference ID</div>
                  <div className="text-[#1e2a38]">{detailItem.reference_id ?? '—'}</div>
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
                  <div className="text-[#9aa5b4] mb-0.5">Created</div>
                  <div className="text-[#3d4756]">{fmtDate(detailItem.created_at).text}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Updated</div>
                  <div className="text-[#3d4756]">{fmtDate(detailItem.updated_at).text}</div>
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
              {!HARD_TERMINALS.has(detailItem.chain_status) && (
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

              {HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs text-[#9aa5b4] italic">
                    This link is in a terminal state — no further actions are available.
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
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-[#1e2a38] mb-1">Station Participant Link Action</div>
            <div className="text-xs text-[#6b7685] mb-4">
              {LINK_TYPE_LABELS[actionItem.link_type] ?? actionItem.link_type}
              {actionItem.reference_id && <> &mdash; {actionItem.reference_id}</>}
              {' '}—{' '}
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

export default StationParticipantLinkTab;
