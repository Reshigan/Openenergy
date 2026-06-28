import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface ProtectionRelayTest {
  id: string;
  chain_status: string;
  site_id: string;
  device_sn: string;
  relay_type: string;
  test_standard: string;
  protection_class: string;
  test_engineer_id: string | null;
  grid_witness_id: string | null;
  pass_criteria_met: number;
  certificate_number: string | null;
  next_test_due: string | null;
  sla_deadline: string | null;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface RelayKpis {
  tests_due: number;
  pass_rate_pct: number;
  failed_count: number;
  certs_expiring_soon: number;
}

// ─── Status meta ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  test_scheduled:         'bg-[#eef2f7] text-[#3d4756]',
  pre_test_inspection:    'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  site_ready:             'bg-cyan-100 text-cyan-700',
  test_executing:         'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  preliminary_results:    'bg-purple-100 text-purple-700',
  certified_pass:         'bg-green-100 text-green-700',
  minor_deficiency:       'bg-amber-100 text-amber-700',
  test_failed:            'bg-red-100 text-red-700',
  rectification_required: 'bg-orange-100 text-orange-700',
  rectification_complete: 'bg-teal-100 text-teal-700',
  retest_scheduled:       'bg-violet-100 text-violet-700',
  failed_final:           'bg-red-200 text-red-900',
};

const STATUS_LABELS: Record<string, string> = {
  test_scheduled:         'Test Scheduled',
  pre_test_inspection:    'Pre-Test Inspection',
  site_ready:             'Site Ready',
  test_executing:         'Test Executing',
  preliminary_results:    'Preliminary Results',
  certified_pass:         'Certified Pass',
  minor_deficiency:       'Minor Deficiency',
  test_failed:            'Test Failed',
  rectification_required: 'Rectification Required',
  rectification_complete: 'Rectification Complete',
  retest_scheduled:       'Retest Scheduled',
  failed_final:           'Failed Final',
};

// ─── Protection class badges ──────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  safety_critical: 'bg-red-100 text-red-800',
  transmission:    'bg-orange-100 text-orange-700',
  distribution:    'bg-amber-100 text-amber-700',
  embedded:        'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  routine:         'bg-[#eef2f7] text-[#3d4756]',
};

const CLASS_LABELS: Record<string, string> = {
  safety_critical: 'Safety Critical',
  transmission:    'Transmission',
  distribution:    'Distribution',
  embedded:        'Embedded',
  routine:         'Routine',
};

// ─── Actions per state ────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set(['certified_pass', 'failed_final']);

const PROTECTION_CLASSES = [
  'safety_critical', 'transmission', 'distribution', 'embedded', 'routine',
] as const;
const STATUSES = Object.keys(STATUS_LABELS);

interface ActionDef {
  name: string;
  label: string;
  variant?: 'danger' | 'warn' | 'success';
}

const ACTION_LABELS: Record<string, string> = {
  schedule_test:             'Start Pre-Test Inspection',
  conduct_pre_inspection:    'Conduct Pre-Test Inspection',
  confirm_site_ready:        'Confirm Site Ready',
  execute_test:              'Execute Test',
  record_preliminary_results:'Record Preliminary Results',
  certify_pass:              'Certify Pass',
  flag_minor_deficiency:     'Flag Minor Deficiency',
  record_failure:            'Record Failure',
  confirm_rectification:     'Confirm Rectification Complete',
  schedule_retest:           'Schedule Retest',
};

function getActions(item: ProtectionRelayTest): ActionDef[] {
  if (HARD_TERMINALS.has(item.chain_status)) return [];
  switch (item.chain_status) {
    case 'test_scheduled':
      return [
        { name: 'schedule_test', label: ACTION_LABELS.schedule_test, variant: 'success' },
      ];
    case 'pre_test_inspection':
      return [
        { name: 'confirm_site_ready', label: ACTION_LABELS.confirm_site_ready, variant: 'success' },
      ];
    case 'site_ready':
      return [
        { name: 'execute_test', label: ACTION_LABELS.execute_test, variant: 'success' },
      ];
    case 'test_executing':
      return [
        { name: 'record_preliminary_results', label: ACTION_LABELS.record_preliminary_results },
      ];
    case 'preliminary_results':
      return [
        { name: 'certify_pass',          label: ACTION_LABELS.certify_pass,          variant: 'success' },
        { name: 'flag_minor_deficiency', label: ACTION_LABELS.flag_minor_deficiency,  variant: 'warn'    },
        { name: 'record_failure',        label: ACTION_LABELS.record_failure,         variant: 'danger'  },
      ];
    case 'minor_deficiency':
    case 'test_failed':
    case 'rectification_required':
      return [
        { name: 'confirm_rectification', label: ACTION_LABELS.confirm_rectification, variant: 'success' },
        { name: 'record_failure',        label: ACTION_LABELS.record_failure,         variant: 'danger'  },
      ];
    case 'rectification_complete':
      return [
        { name: 'schedule_retest', label: ACTION_LABELS.schedule_retest, variant: 'success' },
        { name: 'record_failure',  label: ACTION_LABELS.record_failure,   variant: 'danger'  },
      ];
    case 'retest_scheduled':
      return [
        { name: 'execute_test',   label: ACTION_LABELS.execute_test,  variant: 'success' },
        { name: 'record_failure', label: ACTION_LABELS.record_failure, variant: 'danger'  },
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

export function ProtectionRelayTestTab() {
  const [items, setItems]                     = useState<ProtectionRelayTest[]>([]);
  const [kpis, setKpis]                       = useState<RelayKpis | null>(null);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [filterStatus, setFilterStatus]       = useState('');
  const [filterClass, setFilterClass]         = useState('');
  const [filterSlaBreached, setFilterSlaBreached] = useState(false);
  const [page, setPage]                       = useState(1);

  // Create form
  const [showCreate, setShowCreate]           = useState(false);
  const [creating, setCreating]               = useState(false);
  const [createError, setCreateError]         = useState<string | null>(null);
  const [formSiteId, setFormSiteId]           = useState('om_site_gr_malvern');
  const [formDeviceSn, setFormDeviceSn]       = useState('');
  const [formRelayType, setFormRelayType]     = useState('');
  const [formTestStandard, setFormTestStandard] = useState('NRS 097-2-3');
  const [formClass, setFormClass]             = useState<string>('distribution');
  const [formEngineerId, setFormEngineerId]   = useState('');
  const [formWitnessId, setFormWitnessId]     = useState('');

  // Detail drawer
  const [detailItem, setDetailItem]           = useState<ProtectionRelayTest | null>(null);
  const [timeline, setTimeline]               = useState<Record<string, unknown>[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Action modal
  const [actionItem, setActionItem]           = useState<ProtectionRelayTest | null>(null);
  const [selectedAction, setSelectedAction]   = useState('');
  const [actionReason, setActionReason]       = useState('');
  const [actionCertNum, setActionCertNum]     = useState('');
  const [actionNextDue, setActionNextDue]     = useState('');
  const [actionLoading, setActionLoading]     = useState(false);
  const [actionError, setActionError]         = useState<string | null>(null);

  const token = () => localStorage.getItem('token') ?? '';

  async function load(
    status      = filterStatus,
    cls         = filterClass,
    slaBreached = filterSlaBreached,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status)      params.set('status', status);
      if (cls)         params.set('protection_class', cls);
      if (slaBreached) params.set('sla_breached', '1');
      params.set('per_page', '200');
      const res = await fetch(`/api/protection-relay-chain?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as {
        success: boolean;
        data: ProtectionRelayTest[];
        kpis: RelayKpis;
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

  async function loadDetail(item: ProtectionRelayTest) {
    setDetailItem(item);
    setTimeline([]);
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/protection-relay-chain/${item.id}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) return;
      const json = await res.json() as { success: boolean; data: ProtectionRelayTest & { timeline: Record<string, unknown>[] } };
      if (json.success && json.data?.timeline) {
        setTimeline(json.data.timeline);
      }
    } catch {
      // ignore timeline errors
    } finally {
      setTimelineLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Create handler ───────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formSiteId.trim() || !formDeviceSn.trim() || !formRelayType.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        site_id:          formSiteId.trim(),
        device_sn:        formDeviceSn.trim(),
        relay_type:       formRelayType.trim(),
        test_standard:    formTestStandard.trim(),
        protection_class: formClass,
      };
      if (formEngineerId.trim()) body.test_engineer_id = formEngineerId.trim();
      if (formWitnessId.trim())  body.grid_witness_id  = formWitnessId.trim();

      const res = await fetch('/api/protection-relay-chain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      setShowCreate(false);
      setFormDeviceSn('');
      setFormRelayType('');
      setFormEngineerId('');
      setFormWitnessId('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  // ─── Action handlers ──────────────────────────────────────────────────────

  function openActionPicker(item: ProtectionRelayTest) {
    const actions = getActions(item);
    if (actions.length === 0) return;
    setActionItem(item);
    setSelectedAction(actions[0].name);
    setActionReason('');
    setActionCertNum('');
    setActionNextDue('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setSelectedAction('');
    setActionReason('');
    setActionCertNum('');
    setActionNextDue('');
    setActionError(null);
  }

  async function submitAction() {
    if (!actionItem || !selectedAction) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { action: selectedAction };
      if (actionReason.trim()) body.reason = actionReason.trim();
      if (selectedAction === 'certify_pass') {
        body.pass_criteria_met = 1;
        if (actionCertNum.trim()) body.certificate_number = actionCertNum.trim();
        if (actionNextDue.trim()) body.next_test_due      = actionNextDue.trim();
      }

      const res = await fetch(`/api/protection-relay-chain/${actionItem.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
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
        <KpiChip
          label="Tests Due"
          value={kpis?.tests_due ?? '—'}
          mode={(kpis?.tests_due ?? 0) > 0 ? 'alert' : 'neutral'}
        />
        <KpiChip
          label="Pass Rate"
          value={kpis ? `${kpis.pass_rate_pct}%` : '—'}
          mode={
            (kpis?.pass_rate_pct ?? 100) >= 90 ? 'good' :
            (kpis?.pass_rate_pct ?? 100) >= 70 ? 'alert' : 'danger'
          }
        />
        <KpiChip
          label="Failed Tests"
          value={kpis?.failed_count ?? '—'}
          mode={(kpis?.failed_count ?? 0) > 0 ? 'danger' : 'neutral'}
        />
        <KpiChip
          label="Certs Expiring (30d)"
          value={kpis?.certs_expiring_soon ?? '—'}
          mode={(kpis?.certs_expiring_soon ?? 0) > 0 ? 'alert' : 'neutral'}
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
          <option value="">All protection classes</option>
          {PROTECTION_CLASSES.map(c => (
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
          + Schedule Test
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-[oklch(0.87_0.012_250)] bg-[oklch(0.97_0.003_250)] p-4 space-y-3"
        >
          <div className="text-sm font-semibold text-[oklch(0.40_0.009_250)]">Schedule Protection Relay Test</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Site ID *</label>
              <input
                type="text"
                value={formSiteId}
                onChange={e => setFormSiteId(e.target.value)}
                placeholder="e.g. om_site_gr_malvern"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Device Serial No. *</label>
              <input
                type="text"
                value={formDeviceSn}
                onChange={e => setFormDeviceSn(e.target.value)}
                placeholder="e.g. REL-SX4G-008"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Relay Type *</label>
              <input
                type="text"
                value={formRelayType}
                onChange={e => setFormRelayType(e.target.value)}
                placeholder="e.g. SEL-751A Feeder Protection"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Test Standard *</label>
              <input
                type="text"
                value={formTestStandard}
                onChange={e => setFormTestStandard(e.target.value)}
                placeholder="e.g. NRS 097-2-3"
                required
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Protection Class *</label>
              <select
                value={formClass}
                onChange={e => setFormClass(e.target.value)}
                required
                className="w-full border rounded px-2 py-1 text-xs bg-white"
              >
                {PROTECTION_CLASSES.map(c => (
                  <option key={c} value={c}>{CLASS_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Test Engineer ID</label>
              <input
                type="text"
                value={formEngineerId}
                onChange={e => setFormEngineerId(e.target.value)}
                placeholder="Engineer user ID"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#3d4756] mb-1">Grid Witness ID</label>
              <input
                type="text"
                value={formWitnessId}
                onChange={e => setFormWitnessId(e.target.value)}
                placeholder="Grid operator witness ID"
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
              {creating ? 'Scheduling…' : 'Schedule Test'}
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
                <th className="pb-2 pr-3">Device SN</th>
                <th className="pb-2 pr-3">Relay Type</th>
                <th className="pb-2 pr-3">Protection Class</th>
                <th className="pb-2 pr-3">Site</th>
                <th className="pb-2 pr-3">Chain Status</th>
                <th className="pb-2 pr-3">SLA Deadline</th>
                <th className="pb-2 pr-3">Certificate</th>
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
                    onClick={() => loadDetail(item)}
                  >
                    <td className="py-2 pr-3 text-xs font-mono text-[#2d3748]">
                      {item.device_sn}
                    </td>
                    <td
                      className="py-2 pr-3 text-xs text-[#2d3748] max-w-[180px] truncate"
                      title={item.relay_type}
                    >
                      {truncate(item.relay_type, 28)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CLASS_COLORS[item.protection_class] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                        {CLASS_LABELS[item.protection_class] ?? item.protection_class}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-[#3d4756]">
                      {truncate(item.site_id, 22)}
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
                    <td className="py-2 pr-3 text-xs text-[#3d4756]">
                      {item.certificate_number
                        ? <span className="font-mono">{item.certificate_number}</span>
                        : <span className="text-[#9aa5b4]">—</span>}
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
                    No protection relay tests found
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
                  Protection Relay Test
                </div>
                <div className="text-xs text-[#6b7685] mt-0.5">
                  {detailItem.device_sn}
                  {detailItem.certificate_number && <> &nbsp;&middot;&nbsp; {detailItem.certificate_number}</>}
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
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${CLASS_COLORS[detailItem.protection_class] ?? 'bg-[#eef2f7] text-[#6b7685]'}`}>
                  {CLASS_LABELS[detailItem.protection_class] ?? detailItem.protection_class}
                </span>
                {detailItem.sla_breached === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">SLA Breached</span>
                )}
                {detailItem.regulator_notified === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-semibold">Regulator Notified</span>
                )}
                {detailItem.pass_criteria_met === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-semibold">Pass Criteria Met</span>
                )}
              </div>

              {/* Core fields */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Site ID</div>
                  <div className="font-mono text-[#2d3748]">{detailItem.site_id}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Device SN</div>
                  <div className="font-mono text-[#2d3748]">{detailItem.device_sn}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[#9aa5b4] mb-0.5">Relay Type</div>
                  <div className="text-[#1e2a38]">{detailItem.relay_type}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Test Standard</div>
                  <div className="text-[#1e2a38]">{detailItem.test_standard}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Protection Class</div>
                  <div className="text-[#1e2a38]">{CLASS_LABELS[detailItem.protection_class] ?? detailItem.protection_class}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Test Engineer</div>
                  <div className="text-[#2d3748]">{detailItem.test_engineer_id ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Grid Witness</div>
                  <div className="text-[#2d3748]">{detailItem.grid_witness_id ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Certificate No.</div>
                  <div className="font-mono text-[#2d3748]">{detailItem.certificate_number ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">Next Test Due</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.next_test_due).isPast ? 'text-red-600 font-medium' : 'text-[#2d3748]'}`}>
                    {fmtDate(detailItem.next_test_due).text}
                  </div>
                </div>
                <div>
                  <div className="text-[#9aa5b4] mb-0.5">SLA Deadline</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.sla_deadline).isPast ? 'text-red-600 font-medium' : 'text-[#1e2a38]'}`}>
                    {fmtDate(detailItem.sla_deadline).text}
                  </div>
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

              {/* Timeline */}
              <div>
                <div className="text-xs font-semibold text-[#2d3748] mb-2">Event Timeline</div>
                {timelineLoading ? (
                  <div className="text-xs text-[#9aa5b4]">Loading timeline&hellip;</div>
                ) : timeline.length === 0 ? (
                  <div className="text-xs text-[#9aa5b4] italic">No events recorded yet.</div>
                ) : (
                  <ol className="space-y-2">
                    {timeline.map((evt, i) => (
                      <li key={i} className="flex gap-2 text-xs">
                        <span className="text-[#9aa5b4] mt-0.5 select-none">&#9679;</span>
                        <div>
                          <div className="text-[#2d3748] font-medium">
                            {String(evt.event_type ?? evt.event ?? '').replace(/^prt_evt_/, '').replace(/_/g, ' ')}
                          </div>
                          <div className="text-[#9aa5b4]">
                            {fmtDate(String(evt.created_at ?? '')).text}
                            {evt.actor_id && <> &middot; {String(evt.actor_id)}</>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

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
                    {detailItem.chain_status === 'certified_pass'
                      ? 'This test has been certified as a PASS. No further actions available.'
                      : 'This test has reached FAILED FINAL. Mandatory safety disconnect required per NRS 097-2-3.'}
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
            <div className="text-sm font-semibold text-[#1e2a38] mb-1">Protection Relay Test Action</div>
            <div className="text-xs text-[#6b7685] mb-4">
              {actionItem.device_sn}
              {' — '}
              {CLASS_LABELS[actionItem.protection_class] ?? actionItem.protection_class}
              {' — '}
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

            {/* certify_pass extra fields */}
            {selectedAction === 'certify_pass' && (
              <>
                <div className="mb-3">
                  <label className="block text-xs text-[#3d4756] mb-1">Certificate Number</label>
                  <input
                    type="text"
                    value={actionCertNum}
                    onChange={e => setActionCertNum(e.target.value)}
                    placeholder="e.g. CERT-NRS097-2026-0442"
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-xs text-[#3d4756] mb-1">Next Test Due</label>
                  <input
                    type="date"
                    value={actionNextDue}
                    onChange={e => setActionNextDue(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                </div>
              </>
            )}

            <div className="mb-3">
              <label className="block text-xs text-[#3d4756] mb-1">Reason / Notes</label>
              <textarea
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="Brief reason, measurement results, or reference number"
                rows={3}
                className="w-full border rounded px-2 py-1 text-xs resize-none"
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

export default ProtectionRelayTestTab;
