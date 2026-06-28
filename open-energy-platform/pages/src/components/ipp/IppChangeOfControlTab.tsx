import React, { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface ChangeOfControl {
  id: string;
  project_id: string;
  acquirer_name: string;
  transaction_type: string;
  capacity_mw?: number;
  ownership_tier: string;
  foreign_ownership_flag: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  approval_granted_at?: string;
  description?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  transferred_count: number;
  rejected_count: number;
  breached_count: number;
  foreign_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  notification_submitted:   'bg-[#eef2f7] text-[#6b7685]',
  completeness_check:       'bg-[#eef2f7]',
  foreign_ownership_screen: 'bg-purple-100 text-purple-700',
  competition_screen:       'bg-[#eef2f7]',
  technical_assessment:     'bg-cyan-100 text-cyan-700',
  public_participation:     'bg-orange-100 text-orange-800',
  nersa_evaluation:         'bg-yellow-100 text-yellow-800',
  conditional_approval:     'bg-teal-100 text-teal-700',
  control_transferred:      'bg-green-100 text-green-800',
  withdrawn:                'bg-[#eef2f7] text-[#9aa5b4]',
  rejected:                 'bg-red-100 text-red-700',
  appeal_filed:             'bg-orange-200 text-orange-800',
  appeal_determined:        'bg-[#e8ecf0] text-[#3d4756]',
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  completeness_check: { color: 'oklch(0.46 0.16 55)' },
  competition_screen: { color: 'oklch(0.46 0.16 55)' },
};

const TIER_COLORS: Record<string, string> = {
  minor:       'bg-[#eef2f7] text-[#3d4756]',
  moderate:    'bg-[#eef2f7]',
  significant: 'bg-[#eef2f7]',
  major:       'bg-orange-100 text-orange-800',
  material:    'bg-red-100 text-red-700',
};

const TIER_STYLE: Record<string, React.CSSProperties> = {
  moderate:    { color: 'oklch(0.46 0.16 55)', background: 'oklch(0.94 0.006 250)' },
  significant: { color: 'oklch(0.46 0.16 55)', background: 'oklch(0.94 0.006 250)' },
};

const TX_TYPE_LABELS: Record<string, string> = {
  share_transfer:                  'Share transfer',
  asset_acquisition:               'Asset acquisition',
  merger_scheme_of_arrangement:    'Merger/scheme',
  management_buyout:               'MBO',
  fund_recycling:                  'Fund recycling',
  change_of_lender_step_in:        'Lender step-in',
};

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isOverdue(sla_due_at?: string, sla_breached?: number): boolean {
  if (sla_breached) return true;
  if (!sla_due_at) return false;
  return new Date(sla_due_at) < new Date();
}

const TIERS = ['minor', 'moderate', 'significant', 'major', 'material'] as const;

export function IppChangeOfControlTab() {
  const [items, setItems] = useState<ChangeOfControl[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterForeign, setFilterForeign] = useState<'all' | 'domestic' | 'foreign'>('all');
  const [selected, setSelected] = useState<ChangeOfControl | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    capacity_mw: '',
    transaction_type: 'share_transfer',
    acquirer_name: '',
    foreign_ownership_flag: 'domestic',
    description: '',
  });

  async function load(status?: string, tier?: string, foreign?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (tier) params.set('tier', tier);
      if (foreign && foreign !== 'all') params.set('foreign', foreign);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/ipp-change-of-control?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const data = json?.data ?? json;
      setItems(data?.items ?? []);
      setKpis(data?.kpis ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createNotification() {
    if (!form.project_id || !form.acquirer_name) return;
    setCreatePending(true);
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/ipp-change-of-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          project_id: form.project_id,
          transaction_type: form.transaction_type,
          acquirer_name: form.acquirer_name,
          capacity_mw: form.capacity_mw ? parseFloat(form.capacity_mw) : undefined,
          foreign_ownership_flag: form.foreign_ownership_flag,
          description: form.description || undefined,
        }),
      });
      setShowCreate(false);
      setForm({ project_id: '', capacity_mw: '', transaction_type: 'share_transfer', acquirer_name: '', foreign_ownership_flag: 'domestic', description: '' });
      load(filterStatus, filterTier, filterForeign);
    } finally {
      setCreatePending(false);
    }
  }

  const kpiCards = kpis
    ? [
        { label: 'Total', value: kpis.total },
        { label: 'Open / In-progress', value: kpis.open_count, alert: kpis.open_count > 0 },
        { label: 'Control transferred', value: kpis.transferred_count, good: kpis.transferred_count > 0 },
        { label: 'Rejected', value: kpis.rejected_count, danger: kpis.rejected_count > 0 },
        { label: 'SLA breached', value: kpis.breached_count, danger: kpis.breached_count > 0 },
        { label: 'Foreign', value: kpis.foreign_count, alert: kpis.foreign_count > 0 },
      ]
    : [];

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      {kpiCards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {kpiCards.map(k => (
            <div
              key={k.label}
              className={`rounded-lg p-3 border ${
                (k as any).danger
                  ? 'border-red-200 bg-red-50'
                  : (k as any).alert
                  ? 'border-orange-300 bg-orange-50'
                  : (k as any).good
                  ? 'border-green-200 bg-green-50'
                  : 'border-[#dde4ec] bg-white'
              }`}
            >
              <div className="text-xs text-[#6b7685]">{k.label}</div>
              <div
                className={`text-xl font-bold ${
                  (k as any).danger ? 'text-red-700' : (k as any).alert ? 'text-orange-700' : (k as any).good ? 'text-green-700' : 'text-[#0f1c2e]'
                }`}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); load(e.target.value, filterTier, filterForeign); }}
          className="border rounded px-2 py-1 text-xs text-[#2d3748] bg-white"
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS).map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <span className="text-[#9aa5b4]">|</span>
        {TIERS.map(t => (
          <button type="button"
            key={t}
            onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt, filterForeign); }}
            className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'text-white border-transparent' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}
            style={filterTier === t ? { background: 'oklch(0.46 0.16 55)', borderColor: 'oklch(0.46 0.16 55)' } : {}}
          >
            {t}
          </button>
        ))}
        <span className="text-[#9aa5b4]">|</span>
        {(['all', 'domestic', 'foreign'] as const).map(f => (
          <button type="button"
            key={f}
            onClick={() => { setFilterForeign(f); load(filterStatus, filterTier, f); }}
            className={`px-2 py-1 rounded text-xs border ${filterForeign === f ? 'bg-[#c2873a] text-white border-[#c2873a]' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}
          >
            {f === 'all' ? 'All ownership' : f === 'foreign' ? '🌍 Foreign' : 'Domestic'}
          </button>
        ))}
        <button type="button"
          onClick={() => setShowCreate(true)}
          className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]"
        >
          + New notification
        </button>
        <button type="button"
          onClick={() => load(filterStatus, filterTier, filterForeign)}
          className="px-3 py-1 bg-[#eef2f7] text-[#2d3748] rounded text-xs border border-[#dde4ec] hover:bg-[#e8ecf0]"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-[#9aa5b4] py-8 text-center">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[#6b7685]">
                <th className="pb-2 pr-4">Acquirer / Project</th>
                <th className="pb-2 pr-4">Transaction type</th>
                <th className="pb-2 pr-4">Cap (MW)</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Foreign</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA due</th>
                <th className="pb-2 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const overdue = isOverdue(item.sla_due_at, item.sla_breached);
                const isForeign = item.foreign_ownership_flag !== 'domestic';
                const hasRegulator = !!item.approval_granted_at;
                return (
                  <tr
                    key={item.id}
                    className="border-b hover:bg-[#eef2f7] cursor-pointer"
                    onClick={() => setSelected(item)}
                  >
                    <td className="py-2 pr-4 text-xs max-w-[200px]">
                      <div className="truncate font-medium text-[#1e2a38]">{item.acquirer_name}</div>
                      <div className="text-[#9aa5b4] truncate font-mono">{item.project_id}</div>
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#3d4756]">
                      {TX_TYPE_LABELS[item.transaction_type] ?? item.transaction_type}
                    </td>
                    <td className="py-2 pr-4 text-xs font-medium">{item.capacity_mw ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[item.ownership_tier] ?? 'bg-[#eef2f7] text-[#6b7685]'}`} style={TIER_STYLE[item.ownership_tier] ?? {}}>
                        {item.ownership_tier}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {isForeign ? <span title={item.foreign_ownership_flag}>🌍</span> : <span className="text-[#9aa5b4]">—</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[#eef2f7] text-[#6b7685]'}`} style={STATUS_STYLE[item.chain_status] ?? {}}>
                        {statusLabel(item.chain_status).text}
                      </span>
                      {hasRegulator && (
                        <span className="ml-1 px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">REGULATOR</span>
                      )}
                    </td>
                    <td className={`py-2 pr-4 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-[#6b7685]'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.sla_due_at)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[#9aa5b4]">{fmtDate(item.created_at)}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#9aa5b4] text-sm">
                    No change-of-control notifications found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail slide-over */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">Change of Control</h2>
                <div className="text-xs text-[#6b7685] mt-1">
                  {TX_TYPE_LABELS[selected.transaction_type] ?? selected.transaction_type}
                  {' · '}
                  <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[selected.ownership_tier] ?? ''}`} style={TIER_STYLE[selected.ownership_tier] ?? {}}>{selected.ownership_tier}</span>
                  {selected.foreign_ownership_flag !== 'domestic' && <span className="ml-1">🌍 {selected.foreign_ownership_flag}</span>}
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-[#9aa5b4] hover:text-[#2d3748] text-lg leading-none">✕</button>
            </div>
            {selected.description && (
              <div className="text-sm text-[#3d4756] bg-[#f8fafc] rounded p-3 mb-4">{selected.description}</div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <span className="text-[#6b7685] text-xs">Status</span>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status] ?? ''}`} style={STATUS_STYLE[selected.chain_status] ?? {}}>
                    {statusLabel(selected.chain_status).text}
                  </span>
                  {selected.approval_granted_at && (
                    <span className="px-1 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">REGULATOR</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-[#6b7685] text-xs">Acquirer</span>
                <div className="text-xs font-medium">{selected.acquirer_name}</div>
              </div>
              <div>
                <span className="text-[#6b7685] text-xs">Project</span>
                <div className="text-xs font-mono">{selected.project_id}</div>
              </div>
              {selected.capacity_mw != null && (
                <div>
                  <span className="text-[#6b7685] text-xs">Capacity</span>
                  <div className="font-medium">{selected.capacity_mw} MW</div>
                </div>
              )}
              <div>
                <span className="text-[#6b7685] text-xs">Ownership</span>
                <div className="text-xs">{selected.foreign_ownership_flag}</div>
              </div>
              <div>
                <span className="text-[#6b7685] text-xs">SLA due</span>
                <div className={isOverdue(selected.sla_due_at, selected.sla_breached) ? 'text-red-600 font-semibold' : ''}>
                  {isOverdue(selected.sla_due_at, selected.sla_breached) ? '⚠ ' : ''}{fmtDate(selected.sla_due_at)}
                </div>
              </div>
              {selected.approval_granted_at && (
                <div>
                  <span className="text-[#6b7685] text-xs">Approval granted</span>
                  <div className="text-green-700">{fmtDate(selected.approval_granted_at)}</div>
                </div>
              )}
              <div>
                <span className="text-[#6b7685] text-xs">Created</span>
                <div>{fmtDate(selected.created_at)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New notification modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">New Change-of-Control Notification</h3>
            <div className="space-y-3">
              <input
                placeholder="Project ID *"
                value={form.project_id}
                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <input
                placeholder="Acquirer name *"
                value={form.acquirer_name}
                onChange={e => setForm(f => ({ ...f, acquirer_name: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <select
                value={form.transaction_type}
                onChange={e => setForm(f => ({ ...f, transaction_type: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm text-[#2d3748]"
              >
                {Object.entries(TX_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <input
                placeholder="Capacity (MW) — if applicable"
                type="number"
                value={form.capacity_mw}
                onChange={e => setForm(f => ({ ...f, capacity_mw: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <select
                value={form.foreign_ownership_flag}
                onChange={e => setForm(f => ({ ...f, foreign_ownership_flag: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm text-[#2d3748]"
              >
                <option value="domestic">Domestic</option>
                <option value="sadc_resident">SADC resident</option>
                <option value="non_sadc_foreign">Non-SADC foreign</option>
              </select>
              <textarea
                placeholder="Description (optional)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
                rows={3}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button"
                onClick={createNotification}
                disabled={createPending || !form.project_id || !form.acquirer_name}
                className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f] disabled:opacity-50"
              >
                {createPending ? 'Submitting…' : 'Submit notification'}
              </button>
              <button type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-[#eef2f7] text-[#2d3748] rounded text-sm hover:bg-[#e8ecf0]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
