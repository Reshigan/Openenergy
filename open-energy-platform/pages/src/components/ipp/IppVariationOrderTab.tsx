import { useState } from 'react';
import { api } from '../../lib/api';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface VariationOrder {
  id: string;
  title: string;
  description?: string;
  variation_type: string;
  value_tier: string;
  chain_status: string;
  instructed_value_zar?: number;
  agreed_value_zar?: number;
  issued_by?: string;
  site_ref?: string;
  sla_due_at?: string;
  sla_breached: number;
  instructed_at?: string;
  approved_at?: string;
  paid_at?: string;
  adjudicated_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  high_value_count: number;
  disputed_count: number;
  adjudicated_count: number;
  breached_count: number;
  paid_count: number;
  total_paid_zar: number;
  open_value_zar: number;
}

const STATUS_COLORS: Record<string, string> = {
  instructed:                 'bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]',
  acknowledged:               'bg-cyan-100 text-cyan-800',
  quotation_submitted:        'bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]',
  quotation_reviewed:         'bg-purple-100 text-purple-800',
  approved:                   'bg-green-100 text-green-800',
  rejected:                   'bg-red-100 text-red-800',
  in_progress:                'bg-yellow-100 text-yellow-800',
  completed_pending_payment:  'bg-orange-100 text-orange-800',
  paid:                       'bg-green-200 text-green-900',
  disputed_pricing:           'bg-red-100 text-red-800',
  adjudicated:                'bg-[var(--border-subtle, #e8ecf0)] text-[var(--ink, #1e2a38)]',
  cancelled:                  'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
};

const TIER_COLORS: Record<string, string> = {
  minor:        'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  moderate:     'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  significant:  'bg-yellow-100 text-yellow-800',
  major:        'bg-orange-100 text-orange-800',
  material:     'bg-red-100 text-red-800',
};

const TYPE_LABELS: Record<string, string> = {
  scope_change:     'Scope Change',
  time_extension:   'EOT',
  cost_adjustment:  'Cost Adjustment',
  design_change:    'Design Change',
  statutory_change: 'Statutory',
  provisional_sum:  'Provisional Sum',
};

const ACTION_MAP: Record<string, { label: string; next: string }[]> = {
  instructed:               [{ label: 'Acknowledge', next: 'acknowledge_instruction' }, { label: 'Cancel', next: 'cancel_instruction' }],
  acknowledged:             [{ label: 'Submit Quotation', next: 'submit_quotation' }, { label: 'Cancel', next: 'cancel_instruction' }],
  quotation_submitted:      [{ label: 'Review Quotation', next: 'review_quotation' }, { label: 'Dispute Pricing', next: 'dispute_pricing' }],
  quotation_reviewed:       [{ label: 'Approve', next: 'approve_variation' }, { label: 'Reject', next: 'reject_variation' }, { label: 'Dispute Pricing', next: 'dispute_pricing' }],
  approved:                 [{ label: 'Commence Work', next: 'commence_work' }, { label: 'Cancel', next: 'cancel_instruction' }],
  in_progress:              [{ label: 'Complete Work', next: 'complete_work' }, { label: 'Dispute Pricing', next: 'dispute_pricing' }],
  completed_pending_payment:[{ label: 'Certify Payment', next: 'certify_payment' }, { label: 'Dispute Pricing', next: 'dispute_pricing' }],
  disputed_pricing:         [{ label: 'Resolve Dispute', next: 'resolve_dispute' }, { label: 'Refer to Adjudicator', next: 'refer_adjudication' }, { label: 'Cancel', next: 'cancel_instruction' }],
};

function fmt(n?: number | null): string {
  if (n == null) return '—';
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function IppVariationOrderTab() {
  const [items, setItems] = useState<VariationOrder[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected] = useState<VariationOrder | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', variation_type: 'scope_change', instructed_value_zar: '', site_ref: '' });

  async function load(status?: string, tier?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);
    const res = await api.get(`/ipp-variation-order?${params}`);
    const j = res.data;
    setItems(j.data?.items ?? []);
    setKpis(j.data?.kpis ?? null);
    setLoaded(true);
    setLoading(false);
  }

  function applyFilter(status: string) {
    setFilterStatus(status);
    load(status, filterTier);
  }

  function applyTier(tier: string) {
    setFilterTier(tier);
    load(filterStatus, tier);
  }

  async function doAction(id: string, action: string, extras?: Record<string, unknown>) {
    setActionPending(true);
    await api.put(`/ipp-variation-order/${id}/action`, { action, ...extras });
    setActionPending(false);
    setSelected(null);
    load(filterStatus, filterTier);
  }

  async function createVO() {
    await api.post('/ipp-variation-order', {
      project_id: 'proj_nxt_solar_001',
      title: form.title,
      description: form.description,
      variation_type: form.variation_type,
      instructed_value_zar: form.instructed_value_zar ? parseFloat(form.instructed_value_zar) : undefined,
      site_ref: form.site_ref || undefined,
    });
    setShowCreate(false);
    setForm({ title: '', description: '', variation_type: 'scope_change', instructed_value_zar: '', site_ref: '' });
    load(filterStatus, filterTier);
  }

  if (!loaded) {
    return (
      <div className="p-6">
        <button type="button" onClick={() => load()} className="px-4 py-2 bg-[#c2873a] text-white rounded hover:bg-[#a3702f] text-sm">
          Load Variation Orders
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      {kpis && (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {[
            { label: 'Total VOs', value: kpis.total },
            { label: 'Open', value: kpis.open_count },
            { label: 'High-Value', value: kpis.high_value_count },
            { label: 'Disputed', value: kpis.disputed_count },
            { label: 'SLA Breached', value: kpis.breached_count, alert: kpis.breached_count > 0 },
          ].map(k => (
            <div key={k.label} className={`rounded-lg p-3 border ${k.alert ? 'border-red-300 bg-red-50' : 'border-[var(--border-subtle, #dde4ec)] bg-surface-v2'}`}>
              <div className="text-xs text-[var(--ink-2, #6b7685)]">{k.label}</div>
              <div className={`text-xl font-bold ${k.alert ? 'text-red-700' : 'text-[var(--ink, #0f1c2e)]'}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}
      {kpis && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg p-3 border border-[var(--border-subtle, #dde4ec)] bg-surface-v2">
            <div className="text-xs text-[var(--ink-2, #6b7685)]">Open Value (Instructed)</div>
            <div className="text-lg font-bold text-[var(--ink, #0f1c2e)]">{fmt(kpis.open_value_zar)}</div>
          </div>
          <div className="rounded-lg p-3 border border-[var(--border-subtle, #dde4ec)] bg-surface-v2">
            <div className="text-xs text-[var(--ink-2, #6b7685)]">Total Paid (Certified)</div>
            <div className="text-lg font-bold text-green-700">{fmt(kpis.total_paid_zar)}</div>
          </div>
        </div>
      )}

      {/* Filters + actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => applyFilter('')} className={`px-3 py-1 rounded text-xs border ${!filterStatus ? 'bg-[var(--ink, #1e2a38)] text-white' : 'bg-surface-v2 text-[var(--ink-2, #3d4756)] border-[var(--border-subtle, #dde4ec)]'}`}>All</button>
        {['instructed','approved','in_progress','disputed_pricing','paid'].map(s => (
          <button type="button" key={s} onClick={() => applyFilter(s)} className={`px-3 py-1 rounded text-xs border ${filterStatus === s ? 'bg-[var(--ink, #1e2a38)] text-white' : 'bg-surface-v2 text-[var(--ink-2, #3d4756)] border-[var(--border-subtle, #dde4ec)]'}`}>
            {s.replace(/_/g,' ')}
          </button>
        ))}
        <span className="ml-2 text-[var(--ink-2, #9aa5b4)]">|</span>
        {['minor','moderate','significant','major','material'].map(t => (
          <button type="button" key={t} onClick={() => applyTier(filterTier === t ? '' : t)} className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'bg-[oklch(0.40_0.15_55)] text-white' : 'bg-surface-v2 text-[var(--ink-2, #3d4756)] border-[var(--border-subtle, #dde4ec)]'}`}>{t}</button>
        ))}
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]">+ New VO</button>
        <button type="button" onClick={() => load(filterStatus, filterTier)} className="px-3 py-1 bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)] rounded text-xs border hover:bg-[var(--border-subtle, #e8ecf0)]">Refresh</button>
      </div>

      {/* Table */}
      {loading ? <div className="text-sm text-[var(--ink-2, #9aa5b4)] py-4">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--ink-2, #6b7685)]">
                <th className="pb-2 pr-4">Ref</th>
                <th className="pb-2 pr-4">Title</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Instructed</th>
                <th className="pb-2 pr-4">Agreed</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">SLA Due</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(vo => (
                <tr key={vo.id} className="border-b hover:bg-[var(--s2, #eef2f7)] cursor-pointer" onClick={() => setSelected(vo)}>
                  <td className="py-2 pr-4 font-mono text-xs text-[var(--ink-2, #6b7685)]">{vo.site_ref ?? vo.id.slice(-8)}</td>
                  <td className="py-2 pr-4 font-medium max-w-xs truncate">{vo.title}</td>
                  <td className="py-2 pr-4 text-xs text-[var(--ink-2, #3d4756)]">{TYPE_LABELS[vo.variation_type] ?? vo.variation_type}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[vo.value_tier] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]'}`}>{vo.value_tier}</span>
                  </td>
                  <td className="py-2 pr-4 text-xs">{fmt(vo.instructed_value_zar)}</td>
                  <td className="py-2 pr-4 text-xs">{fmt(vo.agreed_value_zar)}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[vo.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]'}`}>{statusLabel(vo.chain_status).text}</span>
                  </td>
                  <td className={`py-2 pr-4 text-xs ${vo.sla_breached ? 'text-red-600 font-semibold' : 'text-[var(--ink-2, #6b7685)]'}`}>
                    {vo.sla_breached ? '⚠ BREACHED' : fmtDate(vo.sla_due_at)}
                  </td>
                  <td className="py-2 text-xs text-[oklch(0.46_0.16_55)]">View →</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-[var(--ink-2, #9aa5b4)] text-sm">No variation orders found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-surface-v2 w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">{selected.title}</h2>
                <div className="text-xs text-[var(--ink-2, #6b7685)] mt-1">{selected.site_ref ?? selected.id}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-[var(--ink-2, #9aa5b4)] hover:text-[var(--ink-2, #3d4756)]">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-[var(--ink-2, #6b7685)]">Type:</span> <span className="font-medium">{TYPE_LABELS[selected.variation_type] ?? selected.variation_type}</span></div>
              <div><span className="text-[var(--ink-2, #6b7685)]">Tier:</span> <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[selected.value_tier]}`}>{selected.value_tier}</span></div>
              <div><span className="text-[var(--ink-2, #6b7685)]">Instructed:</span> <span className="font-medium">{fmt(selected.instructed_value_zar)}</span></div>
              <div><span className="text-[var(--ink-2, #6b7685)]">Agreed:</span> <span className="font-medium text-green-700">{fmt(selected.agreed_value_zar)}</span></div>
              <div><span className="text-[var(--ink-2, #6b7685)]">Status:</span> <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status]}`}>{statusLabel(selected.chain_status).text}</span></div>
              <div><span className="text-[var(--ink-2, #6b7685)]">SLA:</span> <span className={selected.sla_breached ? 'text-red-600 font-bold' : 'text-[var(--ink, #2d3748)]'}>{selected.sla_breached ? '⚠ BREACHED' : fmtDate(selected.sla_due_at)}</span></div>
              <div><span className="text-[var(--ink-2, #6b7685)]">Instructed:</span> {fmtDate(selected.instructed_at)}</div>
              {selected.approved_at && <div><span className="text-[var(--ink-2, #6b7685)]">Approved:</span> {fmtDate(selected.approved_at)}</div>}
              {selected.paid_at && <div><span className="text-[var(--ink-2, #6b7685)]">Paid:</span> {fmtDate(selected.paid_at)}</div>}
            </div>

            {selected.description && (
              <div className="text-sm text-[var(--ink-2, #3d4756)] bg-[var(--s1, #f8fafc)] rounded p-3 mb-4">{selected.description}</div>
            )}

            {/* Actions */}
            {ACTION_MAP[selected.chain_status] && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--ink-2, #6b7685)] uppercase mb-1">Actions</div>
                {ACTION_MAP[selected.chain_status].map(a => (
                  <button type="button" key={a.next} disabled={actionPending}
                    onClick={() => doAction(selected.id, a.next)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm hover:bg-[oklch(0.97_0.003_250)] hover:border-indigo-300 ${a.next === 'refer_adjudication' ? 'border-red-300 text-red-700 hover:bg-red-50' : a.next.includes('cancel') || a.next.includes('reject') ? 'border-red-200 text-red-600' : 'border-[var(--border-subtle, #dde4ec)] text-[var(--ink, #2d3748)]'}`}>
                    {a.label}
                    {a.next === 'refer_adjudication' && <span className="ml-2 text-xs bg-red-100 text-red-700 px-1 rounded">REGULATOR</span>}
                    {(a.next === 'approve_variation' && (selected.value_tier === 'major' || selected.value_tier === 'material')) && <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1 rounded">NOTIFIES FUNDERS</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-surface-v2 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">New Variation Order</h3>
            <div className="space-y-3">
              <input placeholder="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" rows={3} />
              <select value={form.variation_type} onChange={e => setForm(f => ({ ...f, variation_type: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input placeholder="Instructed Value (ZAR)" type="number" value={form.instructed_value_zar}
                onChange={e => setForm(f => ({ ...f, instructed_value_zar: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
              <input placeholder="Site Reference" value={form.site_ref} onChange={e => setForm(f => ({ ...f, site_ref: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={createVO} className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f]">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)] rounded text-sm hover:bg-[var(--border-subtle, #e8ecf0)]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
