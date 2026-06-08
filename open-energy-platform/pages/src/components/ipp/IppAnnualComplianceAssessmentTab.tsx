import { useState, useEffect } from 'react';

interface AcsRecord {
  id: string;
  participant_id: string;
  plant_name: string;
  assessment_year: number;
  plant_mw: number;
  capacity_tier: string;
  grid_connection_voltage_kv: number | null;
  overall_score: number | null;
  protection_systems_score: number | null;
  metering_scada_score: number | null;
  reactive_power_score: number | null;
  frequency_response_score: number | null;
  frt_pq_score: number | null;
  deficiency_domains: string | null;
  chain_status: string;
  sla_due_date: string | null;
  sla_breached: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AcsKpis {
  total: number;
  sla_breached: number;
  accepted: number;
  deficient: number;
}

const STATUS_COLORS: Record<string, string> = {
  assessment_triggered:      'bg-gray-100 text-gray-500',
  protection_systems_audit:  'bg-blue-100 text-blue-700',
  metering_scada_audit:      'bg-cyan-100 text-cyan-700',
  reactive_power_audit:      'bg-indigo-100 text-indigo-700',
  frequency_response_audit:  'bg-violet-100 text-violet-700',
  frt_pq_audit:              'bg-purple-100 text-purple-700',
  internal_technical_review: 'bg-yellow-100 text-yellow-800',
  so_submission:             'bg-orange-100 text-orange-700',
  so_review_in_progress:     'bg-blue-100 text-blue-800',
  assessment_accepted:       'bg-green-100 text-green-700',
  assessment_deficient:      'bg-red-100 text-red-700',
  assessment_lapsed:         'bg-gray-100 text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  assessment_triggered:      'Assessment Triggered',
  protection_systems_audit:  'Protection Systems Audit',
  metering_scada_audit:      'Metering & SCADA Audit',
  reactive_power_audit:      'Reactive Power Audit',
  frequency_response_audit:  'Frequency Response Audit',
  frt_pq_audit:              'FRT & Power Quality Audit',
  internal_technical_review: 'Internal Technical Review',
  so_submission:             'SO Submission',
  so_review_in_progress:     'SO Review In Progress',
  assessment_accepted:       'Assessment Accepted',
  assessment_deficient:      'Assessment Deficient',
  assessment_lapsed:         'Assessment Lapsed',
};

const ACTION_LABELS: Record<string, string> = {
  commence_protection_audit:           'Commence Protection Audit',
  commence_metering_scada_audit:       'Commence Metering & SCADA Audit',
  commence_reactive_power_audit:       'Commence Reactive Power Audit',
  commence_frequency_response_audit:   'Commence Frequency Response Audit',
  commence_frt_pq_audit:               'Commence FRT & PQ Audit',
  conduct_internal_technical_review:   'Conduct Internal Technical Review',
  submit_to_so:                        'Submit to SO',
  commence_so_review:                  'Commence SO Review',
  accept_assessment:                   'Accept Assessment',
  issue_deficiency_notice:             'Issue Deficiency Notice',
  declare_lapsed:                      'Declare Lapsed',
};

const TIER_COLORS: Record<string, string> = {
  small:    'bg-blue-100 text-blue-800',
  medium:   'bg-yellow-100 text-yellow-800',
  large:    'bg-orange-100 text-orange-800',
  major:    'bg-red-100 text-red-800',
  flagship: 'bg-purple-100 text-purple-800',
};

const HARD_TERMINALS = new Set([
  'assessment_accepted',
  'assessment_deficient',
  'assessment_lapsed',
]);

const STATUSES = Object.keys(STATUS_LABELS);
const CAPACITY_TIERS = ['small', 'medium', 'large', 'major', 'flagship'] as const;

const PAGE_SIZE = 20;

const sel = 'border rounded px-2 py-1 text-xs text-gray-700 bg-white';

function fmtDate(dateStr: string | null | undefined): { text: string; isPast: boolean } {
  if (!dateStr) return { text: '—', isPast: false };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { text: '—', isPast: false };
  const isPast = d < new Date();
  const text = d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  return { text, isPast };
}

function fmtMw(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toLocaleString('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} MW`;
}

function fmtKv(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} kV`;
}

function fmtScore(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
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

export function IppAnnualComplianceAssessmentTab() {
  const [items, setItems]               = useState<AcsRecord[]>([]);
  const [kpis, setKpis]                 = useState<AcsKpis | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTier, setFilterTier]     = useState('');
  const [page, setPage]                 = useState(1);

  // Create form state
  const [showCreate, setShowCreate]                         = useState(false);
  const [creating, setCreating]                             = useState(false);
  const [createError, setCreateError]                       = useState<string | null>(null);
  const [formPlantName, setFormPlantName]                   = useState('');
  const [formAssessmentYear, setFormAssessmentYear]         = useState('');
  const [formPlantMw, setFormPlantMw]                       = useState('');
  const [formGridConnectionVoltageKv, setFormGridConnectionVoltageKv] = useState('');
  const [formNotes, setFormNotes]                           = useState('');

  // Detail drawer state
  const [detailItem, setDetailItem] = useState<AcsRecord | null>(null);

  // Action modal state
  const [actionItem, setActionItem]         = useState<AcsRecord | null>(null);
  const [selectedAction, setSelectedAction] = useState('');
  const [actionReason, setActionReason]     = useState('');
  const [actionNotes, setActionNotes]       = useState('');
  const [actionLoading, setActionLoading]   = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);

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
      const res = await fetch(`/api/ipp-annual-compliance-assessments?${params}`, {
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

  const total     = kpis?.total        ?? items.length;
  const breached  = kpis?.sla_breached ?? items.filter(i => i.sla_breached === 1).length;
  const accepted  = kpis?.accepted     ?? items.filter(i => i.chain_status === 'assessment_accepted').length;
  const deficient = kpis?.deficient    ?? items.filter(i => i.chain_status === 'assessment_deficient').length;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formPlantName.trim() || !formAssessmentYear || !formPlantMw) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        plant_name:      formPlantName.trim(),
        assessment_year: parseInt(formAssessmentYear, 10),
        plant_mw:        parseFloat(formPlantMw),
      };
      if (formGridConnectionVoltageKv !== '') body.grid_connection_voltage_kv = parseFloat(formGridConnectionVoltageKv);
      if (formNotes.trim())                   body.notes                      = formNotes.trim();

      const res = await fetch('/api/ipp-annual-compliance-assessments', {
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
      setFormPlantName('');
      setFormAssessmentYear('');
      setFormPlantMw('');
      setFormGridConnectionVoltageKv('');
      setFormNotes('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function getActions(item: AcsRecord): { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] {
    if (HARD_TERMINALS.has(item.chain_status)) return [];
    const base: { name: string; label: string; variant?: 'danger' | 'warn' | 'success' }[] = [];
    switch (item.chain_status) {
      case 'assessment_triggered':
        base.push({ name: 'commence_protection_audit', label: ACTION_LABELS.commence_protection_audit });
        break;
      case 'protection_systems_audit':
        base.push({ name: 'commence_metering_scada_audit', label: ACTION_LABELS.commence_metering_scada_audit });
        break;
      case 'metering_scada_audit':
        base.push({ name: 'commence_reactive_power_audit', label: ACTION_LABELS.commence_reactive_power_audit });
        break;
      case 'reactive_power_audit':
        base.push({ name: 'commence_frequency_response_audit', label: ACTION_LABELS.commence_frequency_response_audit });
        break;
      case 'frequency_response_audit':
        base.push({ name: 'commence_frt_pq_audit', label: ACTION_LABELS.commence_frt_pq_audit });
        break;
      case 'frt_pq_audit':
        base.push({ name: 'conduct_internal_technical_review', label: ACTION_LABELS.conduct_internal_technical_review });
        break;
      case 'internal_technical_review':
        base.push({ name: 'submit_to_so', label: ACTION_LABELS.submit_to_so, variant: 'success' });
        break;
      case 'so_submission':
        base.push({ name: 'commence_so_review', label: ACTION_LABELS.commence_so_review });
        break;
      case 'so_review_in_progress':
        base.push({ name: 'accept_assessment',     label: ACTION_LABELS.accept_assessment,     variant: 'success' });
        base.push({ name: 'issue_deficiency_notice', label: ACTION_LABELS.issue_deficiency_notice, variant: 'danger' });
        break;
      default:
        break;
    }
    base.push({ name: 'declare_lapsed', label: ACTION_LABELS.declare_lapsed, variant: 'warn' });
    return base;
  }

  function openActionPicker(item: AcsRecord) {
    const actions = getActions(item);
    if (actions.length === 0) return;
    const first = actions[0];
    setActionItem(item);
    setSelectedAction(first.name);
    setActionReason('');
    setActionNotes('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setSelectedAction('');
    setActionReason('');
    setActionNotes('');
    setActionError(null);
  }

  async function submitAction() {
    if (!actionItem || !selectedAction) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { action: selectedAction };
      if (actionReason.trim()) body.reason = actionReason.trim();
      if (actionNotes.trim())  body.notes  = actionNotes.trim();

      const res = await fetch(`/api/ipp-annual-compliance-assessments/${actionItem.id}/action`, {
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

  return (
    <div className="p-4 space-y-4">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Total"        value={total} />
        <KpiChip label="SLA Breached" value={breached}  mode={breached  > 0 ? 'danger' : 'neutral'} />
        <KpiChip label="Accepted"     value={accepted}  mode={accepted  > 0 ? 'good'   : 'neutral'} />
        <KpiChip label="Deficient"    value={deficient} mode={deficient > 0 ? 'alert'  : 'neutral'} />
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
          className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs border border-gray-200 hover:bg-gray-200"
        >
          Refresh
        </button>
        <button type="button"
          onClick={() => setShowCreate(v => !v)}
          className="ml-auto px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
        >
          + New Assessment
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3"
        >
          <div className="text-sm font-semibold text-blue-800">New Annual Grid Code Compliance Assessment</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Plant Name *</label>
              <input
                type="text"
                value={formPlantName}
                onChange={e => setFormPlantName(e.target.value)}
                placeholder="Saldanha Wind Farm"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Assessment Year *</label>
              <input
                type="number"
                value={formAssessmentYear}
                onChange={e => setFormAssessmentYear(e.target.value)}
                min={2000}
                max={2100}
                step={1}
                placeholder="2026"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Plant MW *</label>
              <input
                type="number"
                value={formPlantMw}
                onChange={e => setFormPlantMw(e.target.value)}
                min={0}
                step={0.01}
                placeholder="140"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Grid Connection Voltage (kV)</label>
              <input
                type="number"
                value={formGridConnectionVoltageKv}
                onChange={e => setFormGridConnectionVoltageKv(e.target.value)}
                min={0}
                step={0.1}
                placeholder="132"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="col-span-2 md:col-span-2">
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
                <th className="pb-2 pr-3">Assessment Year</th>
                <th className="pb-2 pr-3">Plant Name</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Plant MW</th>
                <th className="pb-2 pr-3">Tier</th>
                <th className="pb-2 pr-3">Overall Score</th>
                <th className="pb-2 pr-3">SLA Deadline</th>
                <th className="pb-2 pr-3">SLA Breached</th>
                <th className="pb-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(item => {
                const actions = getActions(item);
                const due     = fmtDate(item.sla_due_date);
                return (
                  <tr
                    key={item.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setDetailItem(item)}
                  >
                    <td className="py-2 pr-3 text-xs font-mono text-gray-700">{item.assessment_year}</td>
                    <td className="py-2 pr-3 text-xs text-gray-800 max-w-[160px] truncate" title={item.plant_name}>
                      {item.plant_name}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[item.chain_status] ?? item.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-gray-700">{fmtMw(item.plant_mw)}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[item.capacity_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                        {item.capacity_tier.charAt(0).toUpperCase() + item.capacity_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-gray-600">{fmtScore(item.overall_score)}</td>
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
                    <td
                      className="py-2 pr-3"
                      onClick={e => e.stopPropagation()}
                    >
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
                  <td colSpan={9} className="py-10 text-center text-gray-400 text-sm">
                    No annual compliance assessments found
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

      {/* Detail drawer */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30">
          <div className="bg-white h-full w-full max-w-lg shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="text-sm font-semibold text-gray-800">
                  Grid Code Compliance Assessment — {detailItem.assessment_year}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{detailItem.plant_name}</div>
              </div>
              <button type="button"
                onClick={() => setDetailItem(null)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 p-5 space-y-5">
              {/* Status badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[detailItem.chain_status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABELS[detailItem.chain_status] ?? detailItem.chain_status.replace(/_/g, ' ')}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[detailItem.capacity_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                  {detailItem.capacity_tier.charAt(0).toUpperCase() + detailItem.capacity_tier.slice(1)}
                </span>
                {detailItem.sla_breached === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">SLA Breached</span>
                )}
              </div>

              {/* Core grid details */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div>
                  <div className="text-gray-400 mb-0.5">Plant Name</div>
                  <div className="font-medium text-gray-800">{detailItem.plant_name}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Assessment Year</div>
                  <div className="font-mono text-gray-800">{detailItem.assessment_year}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Plant MW</div>
                  <div className="tabular-nums text-gray-800">{fmtMw(detailItem.plant_mw)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Grid Connection Voltage</div>
                  <div className="tabular-nums text-gray-800">{fmtKv(detailItem.grid_connection_voltage_kv)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Overall Score</div>
                  <div className="tabular-nums text-gray-800 font-semibold">{fmtScore(detailItem.overall_score)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">SLA Deadline</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.sla_due_date).isPast ? 'text-red-600 font-medium' : 'text-gray-800'}`}>
                    {fmtDate(detailItem.sla_due_date).text}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Created</div>
                  <div className="text-gray-600">{fmtDate(detailItem.created_at).text}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Updated</div>
                  <div className="text-gray-600">{fmtDate(detailItem.updated_at).text}</div>
                </div>
              </div>

              {/* Domain scores */}
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">Domain Audit Scores</div>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { label: 'Protection Systems',       value: detailItem.protection_systems_score },
                    { label: 'Metering & SCADA',         value: detailItem.metering_scada_score },
                    { label: 'Reactive Power',           value: detailItem.reactive_power_score },
                    { label: 'Frequency Response',       value: detailItem.frequency_response_score },
                    { label: 'FRT & Power Quality',      value: detailItem.frt_pq_score },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between text-xs bg-gray-50 rounded px-3 py-1.5 border">
                      <span className="text-gray-600">{label}</span>
                      <span className="tabular-nums font-medium text-gray-800">{fmtScore(value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Deficiency domains */}
              {detailItem.deficiency_domains && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Deficiency Domains</div>
                  <div className="flex flex-wrap gap-1">
                    {detailItem.deficiency_domains.split(',').map(d => d.trim()).filter(Boolean).map(domain => (
                      <span
                        key={domain}
                        className="px-2 py-0.5 rounded text-xs bg-red-50 border border-red-200 text-red-700"
                      >
                        {domain.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {detailItem.notes && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Notes</div>
                  <div className="text-xs text-gray-700 bg-gray-50 rounded p-2 border whitespace-pre-wrap">
                    {detailItem.notes}
                  </div>
                </div>
              )}

              {/* Actions section */}
              {!HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Advance State Machine</div>
                  <button type="button"
                    onClick={() => {
                      setDetailItem(null);
                      openActionPicker(detailItem);
                    }}
                    className="px-4 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Open Action Picker
                  </button>
                </div>
              )}

              {HARD_TERMINALS.has(detailItem.chain_status) && (
                <div className="border-t pt-4">
                  <div className="text-xs text-gray-400 italic">
                    This assessment is in a terminal state — no further actions are available.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action modal */}
      {actionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-sm font-semibold text-gray-800 mb-1">Annual Compliance Assessment Action</div>
            <div className="text-xs text-gray-500 mb-4">
              {actionItem.plant_name} &mdash; {actionItem.assessment_year} &mdash;{' '}
              {STATUS_LABELS[actionItem.chain_status] ?? actionItem.chain_status}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">Action *</label>
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
                disabled={actionLoading || !selectedAction}
                className="px-4 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
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

export default IppAnnualComplianceAssessmentTab;
