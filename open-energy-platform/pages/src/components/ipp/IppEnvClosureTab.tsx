import { useState } from 'react';
import { api } from '../../lib/api';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface EnvClosure {
  id: string;
  project_id: string;
  disturbed_area_ha: number;
  area_tier: string;
  eia_category?: string;
  ea_reference?: string;
  emp_reference?: string;
  auditor_firm?: string;
  closure_cert_reference?: string;
  description?: string;
  chain_status: string;
  sla_due_at?: string;
  sla_breached: number;
  closure_issued_at?: string;
  created_at: string;
}

interface Kpis {
  total: number;
  open_count: number;
  issued_count: number;
  remediation_count: number;
  nema_review_count: number;
  rejected_count: number;
  breached_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  emp_audit_initiated:   'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
  site_inspection:       'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  audit_report_drafted:  'bg-[var(--border-subtle, #e8ecf0)] text-[var(--ink-2, #3d4756)]',
  stakeholder_review:    'bg-purple-100 text-purple-700',
  remediation_required:  'bg-orange-100 text-orange-800',
  remediation_complete:  'bg-yellow-100 text-yellow-800',
  closure_recommended:   'bg-lime-100 text-lime-800',
  nema_submission:       'bg-cyan-100 text-cyan-700',
  nema_review:           'bg-cyan-200 text-cyan-900',
  closure_issued:        'bg-green-200 text-green-900',
  rejected:              'bg-red-100 text-red-800',
  withdrawn:             'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #9aa5b4)]',
};

const TIER_COLORS: Record<string, string> = {
  minor:        'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  moderate:     'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  significant:  'bg-yellow-100 text-yellow-800',
  major:        'bg-orange-100 text-orange-800',
  material:     'bg-red-100 text-red-800',
};

const EIA_LABELS: Record<string, string> = {
  basic_assessment: 'Basic Assessment',
  scoping_eir:      'Scoping + EIR',
  amendments:       'EA Amendment',
  exemption:        'Exemption',
};

const ACTION_MAP: Record<string, { label: string; action: string; danger?: boolean; tag?: string }[]> = {
  emp_audit_initiated:   [{ label: 'Commence Site Inspection', action: 'commence_inspection' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  site_inspection:       [{ label: 'Draft Audit Report', action: 'draft_report' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  audit_report_drafted:  [{ label: 'Commence Stakeholder Review', action: 'commence_stakeholder_review' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  stakeholder_review:    [{ label: 'Raise Remediation Required', action: 'raise_remediation', danger: true }, { label: 'Recommend Closure (no issues)', action: 'recommend_closure' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  remediation_required:  [{ label: 'Confirm Remediation Complete', action: 'confirm_remediation' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  remediation_complete:  [{ label: 'Recommend Closure', action: 'recommend_closure' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  closure_recommended:   [{ label: 'Submit to NEMA/DFFE', action: 'submit_to_nema' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  nema_submission:       [{ label: 'NEMA Commence Review', action: 'nema_commence_review' }, { label: 'Withdraw', action: 'withdraw', danger: true }],
  nema_review:           [{ label: 'Issue Closure Certificate', action: 'issue_closure_cert', tag: 'REGULATOR EVERY TIER' }, { label: 'Reject Application', action: 'reject_application', danger: true, tag: 'REGULATOR if major+' }],
};

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function IppEnvClosureTab() {
  const [items, setItems] = useState<EnvClosure[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected] = useState<EnvClosure | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ disturbed_area_ha: '', eia_category: '', ea_reference: '', emp_reference: '', auditor_firm: '', description: '' });

  async function load(status?: string, tier?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);
    const res = await api.get(`/ipp-env-closure?${params}`);
    setItems(res.data?.data?.items ?? []);
    setKpis(res.data?.data?.kpis ?? null);
    setLoaded(true);
    setLoading(false);
  }

  async function doAction(id: string, action: string) {
    setActionPending(true);
    await api.put(`/ipp-env-closure/${id}/action`, { action });
    setActionPending(false);
    setSelected(null);
    load(filterStatus, filterTier);
  }

  async function createRecord() {
    await api.post('/ipp-env-closure', {
      project_id: 'proj_nxt_solar_001',
      disturbed_area_ha: parseFloat(form.disturbed_area_ha),
      eia_category: form.eia_category || undefined,
      ea_reference: form.ea_reference || undefined,
      emp_reference: form.emp_reference || undefined,
      auditor_firm: form.auditor_firm || undefined,
      description: form.description || undefined,
    });
    setShowCreate(false);
    setForm({ disturbed_area_ha: '', eia_category: '', ea_reference: '', emp_reference: '', auditor_firm: '', description: '' });
    load(filterStatus, filterTier);
  }

  if (!loaded) return (
    <div className="p-6">
      <button type="button" onClick={() => load()} className="px-4 py-2 bg-[#c2873a] text-white rounded hover:bg-[#a3702f] text-sm">Load Env Closure</button>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Cases', value: kpis.total },
            { label: 'Remediation Open', value: kpis.remediation_count, alert: kpis.remediation_count > 0 },
            { label: 'NEMA Review', value: kpis.nema_review_count },
            { label: 'Certs Issued', value: kpis.issued_count, good: kpis.issued_count > 0 },
          ].map(k => (
            <div key={k.label} className={`rounded-lg p-3 border ${k.alert ? 'border-orange-300 bg-orange-50' : k.good ? 'border-green-200 bg-green-50' : 'border-[var(--border-subtle, #dde4ec)] bg-surface-v2'}`}>
              <div className="text-xs text-[var(--ink-2, #6b7685)]">{k.label}</div>
              <div className={`text-xl font-bold ${k.alert ? 'text-orange-700' : k.good ? 'text-green-700' : 'text-[var(--ink, #0f1c2e)]'}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => { setFilterStatus(''); load('', filterTier); }} className={`px-3 py-1 rounded text-xs border ${!filterStatus ? 'bg-[var(--ink, #1e2a38)] text-white' : 'bg-surface-v2 text-[var(--ink-2, #3d4756)] border-[var(--border-subtle, #dde4ec)]'}`}>All</button>
        {['emp_audit_initiated','site_inspection','stakeholder_review','remediation_required','nema_review','closure_issued'].map(s => (
          <button type="button" key={s} onClick={() => { setFilterStatus(s); load(s, filterTier); }} className={`px-3 py-1 rounded text-xs border ${filterStatus === s ? 'bg-[var(--ink, #1e2a38)] text-white' : 'bg-surface-v2 text-[var(--ink-2, #3d4756)] border-[var(--border-subtle, #dde4ec)]'}`}>{s.replace(/_/g, ' ')}</button>
        ))}
        <span className="ml-1 text-[var(--ink-2, #9aa5b4)]">|</span>
        {['minor','moderate','significant','major','material'].map(t => (
          <button type="button" key={t} onClick={() => { const nt = filterTier === t ? '' : t; setFilterTier(nt); load(filterStatus, nt); }} className={`px-2 py-1 rounded text-xs border ${filterTier === t ? 'bg-[var(--ink, #1e2a38)] text-white' : 'bg-surface-v2 text-[var(--ink-2, #3d4756)] border-[var(--border-subtle, #dde4ec)]'}`}>{t}</button>
        ))}
        <button type="button" onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1 bg-[#c2873a] text-white rounded text-xs hover:bg-[#a3702f]">+ New Audit</button>
        <button type="button" onClick={() => load(filterStatus, filterTier)} className="px-3 py-1 bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)] rounded text-xs border">Refresh</button>
      </div>

      {loading ? <div className="text-sm text-[var(--ink-2, #9aa5b4)] py-4">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--ink-2, #6b7685)]">
                <th className="pb-2 pr-4">Description</th>
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Area (ha)</th>
                <th className="pb-2 pr-4">EIA Type</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Cert Ref</th>
                <th className="pb-2 pr-4">SLA</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(ec => (
                <tr key={ec.id} className="border-b hover:bg-[var(--s2, #eef2f7)] cursor-pointer" onClick={() => setSelected(ec)}>
                  <td className="py-2 pr-4 text-xs max-w-[180px] truncate">{ec.description?.slice(0, 60) ?? ec.project_id}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${TIER_COLORS[ec.area_tier]}`}>{ec.area_tier}</span></td>
                  <td className="py-2 pr-4 text-xs font-medium">{ec.disturbed_area_ha.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-xs text-[var(--ink-2, #6b7685)]">{ec.eia_category ? EIA_LABELS[ec.eia_category] ?? ec.eia_category : '—'}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[ec.chain_status]}`}>{statusLabel(ec.chain_status).text}</span></td>
                  <td className="py-2 pr-4 text-xs font-mono text-green-700">{ec.closure_cert_reference ?? '—'}</td>
                  <td className={`py-2 pr-4 text-xs ${ec.sla_breached ? 'text-red-600 font-semibold' : 'text-[var(--ink-2, #6b7685)]'}`}>
                    {ec.sla_breached ? '⚠ BREACHED' : fmtDate(ec.sla_due_at)}
                  </td>
                  <td className="py-2 text-xs" style={{ color: 'oklch(0.46 0.16 55)' }}>View →</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-[var(--ink-2, #9aa5b4)] text-sm">No environmental closure records found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-surface-v2 w-full max-w-xl h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold">Environmental Closure</h2>
                <div className="text-xs text-[var(--ink-2, #6b7685)] mt-1">{selected.area_tier} · {selected.disturbed_area_ha} ha disturbed</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-[var(--ink-2, #9aa5b4)] hover:text-[var(--ink-2, #3d4756)]">✕</button>
            </div>
            {selected.description && <div className="text-sm text-[var(--ink-2, #3d4756)] bg-[var(--s1, #f8fafc)] rounded p-3 mb-4">{selected.description}</div>}
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-[var(--ink-2, #6b7685)]">Status:</span> <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selected.chain_status]}`}>{statusLabel(selected.chain_status).text}</span></div>
              <div><span className="text-[var(--ink-2, #6b7685)]">EIA Type:</span> {selected.eia_category ? EIA_LABELS[selected.eia_category] ?? selected.eia_category : '—'}</div>
              <div><span className="text-[var(--ink-2, #6b7685)]">EA Ref:</span> <span className="font-mono text-xs">{selected.ea_reference ?? '—'}</span></div>
              <div><span className="text-[var(--ink-2, #6b7685)]">EMP Ref:</span> <span className="font-mono text-xs">{selected.emp_reference ?? '—'}</span></div>
              {selected.auditor_firm && <div className="col-span-2"><span className="text-[var(--ink-2, #6b7685)]">Auditor:</span> {selected.auditor_firm}</div>}
              {selected.closure_cert_reference && <div className="col-span-2"><span className="text-[var(--ink-2, #6b7685)]">Cert Reference:</span> <span className="font-mono text-green-700">{selected.closure_cert_reference}</span></div>}
              {selected.closure_issued_at && <div><span className="text-[var(--ink-2, #6b7685)]">Cert Issued:</span> <span className="text-green-700">{fmtDate(selected.closure_issued_at)}</span></div>}
            </div>
            {ACTION_MAP[selected.chain_status] && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--ink-2, #6b7685)] uppercase mb-1">Actions</div>
                {ACTION_MAP[selected.chain_status].map(a => (
                  <button type="button" key={a.action} disabled={actionPending}
                    onClick={() => doAction(selected.id, a.action)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm ${a.danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-[var(--border-subtle, #dde4ec)] text-[var(--ink, #2d3748)] hover:bg-[var(--s2, #eef2f7)] hover:border-[#c2873a]'}`}>
                    {a.label}
                    {a.tag && <span className={`ml-2 text-xs px-1 rounded ${a.tag.includes('REGULATOR') ? 'bg-red-100 text-red-700' : ''}`} style={a.tag.includes('REGULATOR') ? {} : { background: 'oklch(0.94 0.006 250)', color: 'oklch(0.46 0.16 55)' }}>{a.tag}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-surface-v2 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">New EMP Compliance Audit</h3>
            <div className="space-y-3">
              <input placeholder="Disturbed area (ha) *" type="number" value={form.disturbed_area_ha} onChange={e => setForm(f => ({ ...f, disturbed_area_ha: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <select value={form.eia_category} onChange={e => setForm(f => ({ ...f, eia_category: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm text-[var(--ink, #2d3748)]">
                <option value="">EIA Category (optional)</option>
                <option value="basic_assessment">Basic Assessment</option>
                <option value="scoping_eir">Scoping + EIR</option>
                <option value="amendments">EA Amendment</option>
                <option value="exemption">Exemption</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="EA Reference" value={form.ea_reference} onChange={e => setForm(f => ({ ...f, ea_reference: e.target.value }))} className="border rounded px-3 py-2 text-sm" />
                <input placeholder="EMP Reference" value={form.emp_reference} onChange={e => setForm(f => ({ ...f, emp_reference: e.target.value }))} className="border rounded px-3 py-2 text-sm" />
              </div>
              <input placeholder="Auditor firm" value={form.auditor_firm} onChange={e => setForm(f => ({ ...f, auditor_firm: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
              <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={createRecord} disabled={!form.disturbed_area_ha} className="px-4 py-2 bg-[#c2873a] text-white rounded text-sm hover:bg-[#a3702f] disabled:opacity-50">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-[var(--s2, #eef2f7)] text-[var(--ink, #2d3748)] rounded text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
