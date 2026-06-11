import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface DlpDefect {
  [key: string]: unknown;
  id: string;
  defect_ref: string | null;
  project_id: string;
  project_name: string | null;
  status: string;
  severity_class: string;
  defect_type: string | null;
  description: string;
  location_description: string | null;
  work_package: string | null;
  responsible_contractor: string | null;
  is_safety_related: number;
  is_structural: number;
  is_hold_point: number;
  identified_at: string;
  notified_at: string | null;
  sla_hours: number;
  sla_deadline: string;
  is_sla_breached: number;
  is_reportable: number;
  ncr_ref: string | null;
  ei_ref: string | null;
  si_ref: string | null;
  dlp_end_date: string | null;
  extension_days: number;
  notes: string | null;
}

interface SummaryData {
  items: DlpDefect[];
  total: number;
  open_count: number;
  critical_count: number;
  escalated_count: number;
  disputed_count: number;
  late_count: number;
  reportable_total: number;
  closed_count: number;
  safety_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  identified:                  'bg-[#eef2f7] text-[#2d3748]',
  notified:                    'bg-[#eef2f7] text-[#3d4756]',
  acknowledged:                'bg-cyan-100 text-cyan-700',
  in_rectification:            'bg-yellow-100 text-yellow-800',
  rectified_pending_inspection:'bg-orange-100 text-orange-700',
  ie_accepted:                 'bg-teal-100 text-teal-700',
  closed:                      'bg-green-100 text-green-700',
  disputed:                    'bg-red-100 text-red-700',
  escalated_to_ncr:            'bg-red-200 text-red-800',
  waived:                      'bg-[#eef2f7] text-[#6b7685]',
  cancelled:                   'bg-[#eef2f7] text-[#9aa5b4]',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  major:    'bg-orange-100 text-orange-800',
  minor:    'bg-yellow-100 text-yellow-800',
  cosmetic: 'bg-[#eef2f7] text-[#3d4756]',
};

const ACTION_MAP: Record<string, { label: string; next_states: string[] }> = {
  notify_defect:           { label: 'Notify',               next_states: ['identified'] },
  acknowledge_receipt:     { label: 'Acknowledge',           next_states: ['notified'] },
  start_rectification:     { label: 'Start Rectification',  next_states: ['acknowledged', 'disputed'] },
  submit_rectified:        { label: 'Submit Rectified',     next_states: ['in_rectification'] },
  ie_accept:               { label: 'IE Accept',            next_states: ['rectified_pending_inspection'] },
  ie_reject:               { label: 'IE Reject (→ NCR)',    next_states: ['rectified_pending_inspection'] },
  close_defect:            { label: 'Close',                next_states: ['ie_accepted'] },
  dispute_rectification:   { label: 'Dispute',              next_states: ['in_rectification', 'rectified_pending_inspection'] },
  resolve_dispute:         { label: 'Resolve Dispute',      next_states: ['disputed'] },
  waive_defect:            { label: 'Waive',                next_states: ['identified', 'notified', 'acknowledged'] },
  cancel_defect:           { label: 'Cancel',               next_states: ['identified', 'notified'] },
  grant_extension:         { label: 'Grant Extension',      next_states: ['in_rectification'] },
};

const FILTER_OPTIONS = [
  { key: 'all',           label: 'All' },
  { key: 'open',          label: 'Open' },
  { key: 'critical',      label: 'Critical' },
  { key: 'in_rectification', label: 'In rectification' },
  { key: 'disputed',      label: 'Disputed' },
  { key: 'escalated_to_ncr', label: 'Escalated (NCR)' },
  { key: 'breached',      label: 'SLA breached' },
  { key: 'reportable',    label: 'Reportable' },
  { key: 'closed',        label: 'Closed' },
];

const HARD_TERMINALS = ['closed', 'escalated_to_ncr', 'waived', 'cancelled'];

function fmt(dt: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function slaLabel(d: DlpDefect) {
  if (d.is_sla_breached) return <span className="text-red-600 font-semibold text-xs">BREACHED</span>;
  const hrs = Math.round((new Date(d.sla_deadline).getTime() - Date.now()) / 3_600_000);
  if (hrs < 0) return <span className="text-red-600 text-xs">Overdue</span>;
  if (hrs < 24) return <span className="text-orange-600 text-xs">{hrs}h left</span>;
  return <span className="text-[#6b7685] text-xs">{Math.round(hrs / 24)}d left</span>;
}

export function IppDlpDefectTab() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [filter, setFilter] = useState('all');
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DlpDefect | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    project_id: '', project_name: '', severity_class: 'minor', defect_type: 'other',
    description: '', location_description: '', work_package: '', responsible_contractor: '',
    is_safety_related: false, is_structural: false, is_hold_point: false,
    identified_by: '', dlp_end_date: '',
  });

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: SummaryData }>(`/ipp-dlp-defect?period=${period}`);
      setSummary(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [period]);

  const items = summary?.items ?? [];
  const filtered = items.filter(d => {
    if (filter === 'all') return true;
    if (filter === 'open') return !HARD_TERMINALS.includes(d.status);
    if (filter === 'critical') return d.severity_class === 'critical';
    if (filter === 'breached') return d.is_sla_breached === 1;
    if (filter === 'reportable') return d.is_reportable === 1;
    return d.status === filter;
  });

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    if (!selected) return;
    setActionLoading(true);
    try {
      const { data } = await api.put<{ data: { status: string; crosses: boolean } }>(
        `/ipp-dlp-defect/${selected.id}/action`, { action, ...extra }
      );
      setSelected(prev => prev ? { ...prev, status: data.data.status } : prev);
      await load();
    } finally {
      setActionLoading(false);
    }
  }

  async function createDefect() {
    await api.post('/ipp-dlp-defect', {
      ...form,
      is_safety_related: form.is_safety_related ? 1 : 0,
      is_structural: form.is_structural ? 1 : 0,
      is_hold_point: form.is_hold_point ? 1 : 0,
    });
    setShowCreate(false);
    setForm({ project_id: '', project_name: '', severity_class: 'minor', defect_type: 'other',
      description: '', location_description: '', work_package: '', responsible_contractor: '',
      is_safety_related: false, is_structural: false, is_hold_point: false,
      identified_by: '', dlp_end_date: '' });
    await load();
  }

  const availableActions = selected
    ? Object.entries(ACTION_MAP).filter(([, v]) => v.next_states.includes(selected.status)).map(([k]) => k)
    : [];

  if (loading) return <div className="p-6 text-[#9aa5b4]">Loading DLP defects…</div>;

  return (
    <div className="space-y-4">
      {/* KPI Bar */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
        {[
          { label: 'Total', value: summary?.total ?? 0, color: 'text-[#1e2a38]' },
          { label: 'Open', value: summary?.open_count ?? 0, color: 'text-[oklch(0.46_0.16_55)]' },
          { label: 'Critical', value: summary?.critical_count ?? 0, color: 'text-red-700' },
          { label: 'Escalated', value: summary?.escalated_count ?? 0, color: 'text-red-800' },
          { label: 'Disputed', value: summary?.disputed_count ?? 0, color: 'text-orange-700' },
          { label: 'SLA Late', value: summary?.late_count ?? 0, color: 'text-red-600' },
          { label: 'Reportable', value: summary?.reportable_total ?? 0, color: 'text-purple-700' },
          { label: 'Closed', value: summary?.closed_count ?? 0, color: 'text-green-700' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#dde4ec] rounded-lg p-3 text-center">
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-[#6b7685] mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map(f => (
            <button type="button" key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                filter === f.key ? 'bg-[#c2873a] text-white border-[#c2873a]' : 'bg-white text-[#2d3748] border-[#dde4ec] hover:border-[#c2873a]'
              }`}
            >{f.label}</button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="text-xs border border-[#dde4ec] rounded px-2 py-1">
            <option value="month">This month</option>
            <option value="ytd">YTD</option>
            <option value="1y">12 months</option>
            <option value="all">All time</option>
          </select>
          <button type="button" onClick={() => setShowCreate(true)}
            className="px-3 py-1 bg-[#c2873a] text-white rounded text-xs font-medium hover:bg-[#a3702f]">
            + Log Defect
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#dde4ec] text-left text-xs text-[#6b7685] uppercase tracking-wide">
              <th className="pb-2 pr-4">Ref / Date</th>
              <th className="pb-2 pr-4">Project</th>
              <th className="pb-2 pr-4">Severity</th>
              <th className="pb-2 pr-4">Description</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">SLA</th>
              <th className="pb-2">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef2f7]">
            {filtered.map(d => (
              <tr key={d.id} onClick={() => setSelected(d)}
                className="cursor-pointer hover:bg-[#eef2f7] transition-colors">
                <td className="py-2 pr-4">
                  <div className="font-medium text-[#0f1c2e]">{d.defect_ref ?? d.id.slice(-6)}</div>
                  <div className="text-xs text-[#9aa5b4]">{fmt(d.identified_at)}</div>
                </td>
                <td className="py-2 pr-4 text-[#3d4756] text-xs max-w-[120px] truncate">{d.project_name ?? d.project_id}</td>
                <td className="py-2 pr-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[d.severity_class] ?? 'bg-[#eef2f7] text-[#2d3748]'}`}>
                    {d.severity_class}
                  </span>
                </td>
                <td className="py-2 pr-4 text-[#2d3748] max-w-[200px] truncate">{d.description}</td>
                <td className="py-2 pr-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[d.status] ?? 'bg-[#eef2f7] text-[#2d3748]'}`}>
                    {d.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="py-2 pr-4">{slaLabel(d)}</td>
                <td className="py-2">
                  <div className="flex gap-1">
                    {d.is_safety_related === 1 && <span title="Safety related" className="text-red-500 text-xs font-bold">⚠</span>}
                    {d.is_structural === 1 && <span title="Structural" className="text-orange-500 text-xs font-bold">S</span>}
                    {d.is_hold_point === 1 && <span title="Hold point" className="text-purple-500 text-xs font-bold">H</span>}
                    {d.is_reportable === 1 && <span title="Reportable" className="text-xs font-bold" style={{ color: 'oklch(0.46 0.16 55)' }}>R</span>}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-[#9aa5b4]">No defects match this filter</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelected(null)}>
          <div className="ml-auto w-full max-w-lg bg-white shadow-xl border-l border-[#dde4ec] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-[#0f1c2e]">{selected.defect_ref ?? 'DFR'}</h3>
                  <p className="text-sm text-[#6b7685]">{selected.project_name ?? selected.project_id}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="text-[#9aa5b4] hover:text-[#3d4756]">✕</button>
              </div>

              <div className="flex gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[selected.status] ?? ''}`}>
                  {selected.status.replace(/_/g, ' ')}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[selected.severity_class] ?? ''}`}>
                  {selected.severity_class}
                </span>
                {selected.is_safety_related === 1 && <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">Safety related</span>}
                {selected.is_structural === 1 && <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">Structural</span>}
                {selected.is_hold_point === 1 && <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">Hold point</span>}
                {selected.is_reportable === 1 && <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)' }}>Reportable</span>}
              </div>

              <div>
                <div className="text-xs text-[#6b7685] mb-1">Description</div>
                <p className="text-sm text-[#1e2a38]">{selected.description}</p>
              </div>

              {selected.location_description && (
                <div>
                  <div className="text-xs text-[#6b7685] mb-1">Location</div>
                  <p className="text-sm text-[#2d3748]">{selected.location_description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-[#6b7685]">Type</span><br />{selected.defect_type ?? '—'}</div>
                <div><span className="text-xs text-[#6b7685]">Contractor</span><br />{selected.responsible_contractor ?? '—'}</div>
                <div><span className="text-xs text-[#6b7685]">SLA ({selected.sla_hours}h)</span><br />{slaLabel(selected)}</div>
                <div><span className="text-xs text-[#6b7685]">DLP Expires</span><br />{fmt(selected.dlp_end_date)}</div>
                {selected.ncr_ref && <div><span className="text-xs text-[#6b7685]">NCR Ref</span><br />{selected.ncr_ref}</div>}
                {selected.ei_ref && <div><span className="text-xs text-[#6b7685]">EI Ref</span><br />{selected.ei_ref}</div>}
                {selected.si_ref && <div><span className="text-xs text-[#6b7685]">SI Ref</span><br />{selected.si_ref}</div>}
              </div>

              {!HARD_TERMINALS.includes(selected.status) && availableActions.length > 0 && (
                <div>
                  <div className="text-xs text-[#6b7685] mb-2">Actions</div>
                  <div className="flex flex-wrap gap-2">
                    {availableActions.map(action => (
                      <button type="button" key={action}
                        disabled={actionLoading}
                        onClick={() => {
                          if (action === 'grant_extension') {
                            const days = prompt('Extension days?');
                            if (days) runAction(action, { extension_days: Number(days) });
                          } else if (action === 'ie_reject') {
                            const ncr = prompt('NCR reference (optional):') ?? undefined;
                            runAction(action, ncr ? { ncr_ref: ncr } : {});
                          } else {
                            runAction(action);
                          }
                        }}
                        className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                          action === 'ie_reject' || action === 'cancel_defect'
                            ? 'border-red-300 text-red-700 hover:bg-red-50'
                            : 'border-[#dde4ec] hover:bg-[#eef2f7]'
                        } disabled:opacity-50`}
                      >
                        {ACTION_MAP[action]?.label ?? action}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[#0f1c2e]">Log Defect</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-[#3d4756] block mb-1">Description *</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-[#dde4ec] rounded px-3 py-1.5 text-sm" rows={2} />
              </div>
              <div>
                <label className="text-xs text-[#3d4756] block mb-1">Project ID *</label>
                <input value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                  className="w-full border border-[#dde4ec] rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-[#3d4756] block mb-1">Project name</label>
                <input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
                  className="w-full border border-[#dde4ec] rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-[#3d4756] block mb-1">Severity *</label>
                <select value={form.severity_class} onChange={e => setForm(f => ({ ...f, severity_class: e.target.value }))}
                  className="w-full border border-[#dde4ec] rounded px-3 py-1.5 text-sm">
                  <option value="critical">Critical (24h)</option>
                  <option value="major">Major (72h)</option>
                  <option value="minor">Minor (168h)</option>
                  <option value="cosmetic">Cosmetic (720h)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[#3d4756] block mb-1">Type</label>
                <select value={form.defect_type} onChange={e => setForm(f => ({ ...f, defect_type: e.target.value }))}
                  className="w-full border border-[#dde4ec] rounded px-3 py-1.5 text-sm">
                  {['structural','mechanical','electrical','civil','architectural','other'].map(t =>
                    <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#3d4756] block mb-1">Location</label>
                <input value={form.location_description} onChange={e => setForm(f => ({ ...f, location_description: e.target.value }))}
                  className="w-full border border-[#dde4ec] rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-[#3d4756] block mb-1">Responsible contractor</label>
                <input value={form.responsible_contractor} onChange={e => setForm(f => ({ ...f, responsible_contractor: e.target.value }))}
                  className="w-full border border-[#dde4ec] rounded px-3 py-1.5 text-sm" />
              </div>
            </div>

            <div className="flex gap-4 text-sm">
              {[
                { key: 'is_safety_related', label: 'Safety related' },
                { key: 'is_structural', label: 'Structural' },
                { key: 'is_hold_point', label: 'Hold point' },
              ].map(f => (
                <label key={f.key} className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={form[f.key as keyof typeof form] as boolean}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.checked }))} />
                  {f.label}
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-1.5 text-sm text-[#3d4756] hover:text-[#0f1c2e]">Cancel</button>
              <button type="button" onClick={createDefect} disabled={!form.project_id || !form.description}
                className="px-4 py-1.5 text-sm bg-[#c2873a] text-white rounded hover:bg-[#a3702f] disabled:opacity-50">
                Log Defect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
