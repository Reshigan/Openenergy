// Wave 139 — IPP Material Inspection Record (MIR)
// ISO 9001:2015 §8.6 + REIPPPP quality specs + Equator Principles EP4 + IE oversight.
// URGENT SLA: critical_structural 24h (tightest) → general 168h (loosest).
// SIGNATURE: reject_material EVERY tier when IE witnessed;
//            quarantine_material EVERY tier when floor_critical_safety.
// Beats Procore Materials (inventory-only, no P6 lifecycle, no IE witness gate).
// Mounted at /ipp-lifecycle/workstation?tab=mir (WRITE: ipp_developer/admin/support).
// READ all 9 personas via readOnly prop.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainStateBar } from '../ChainStateBar';
import { SlaCountdown } from '../SlaCountdown';

type MirStatus =
  | 'delivery_notified'
  | 'delivered'
  | 'initial_inspection'
  | 'detailed_inspection'
  | 'test_sampling'
  | 'results_pending'
  | 'approved'
  | 'conditional_approval'
  | 'incorporated'
  | 'rejected_on_site'
  | 'quarantined'
  | 'returned_to_supplier';

type MaterialTier = 'critical_structural' | 'electrical_mechanical' | 'civil' | 'general';
type MaterialCategory =
  | 'structural_steel' | 'concrete' | 'electrical_cable' | 'transformer'
  | 'inverter' | 'solar_panel' | 'civil_materials' | 'mechanical' | 'instruments' | 'general';

interface MirRow {
  id: string;
  project_id: string;
  project_name: string | null;
  mir_number: string | null;
  chain_status: MirStatus;
  material_description: string;
  material_category: MaterialCategory | null;
  material_tier: MaterialTier | null;
  supplier_name: string | null;
  manufacturer: string | null;
  batch_number: string | null;
  certificate_number: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  po_reference: string | null;
  scheduled_delivery_date: string | null;
  actual_delivery_date: string | null;
  delivery_note_ref: string | null;
  delivery_vehicle_ref: string | null;
  inspection_type: string | null;
  inspector_name: string | null;
  inspection_findings: string | null;
  dimensional_check_passed: number | null;
  quantity_check_passed: number | null;
  documentation_check_passed: number | null;
  visual_check_passed: number | null;
  test_required: number;
  lab_name: string | null;
  lab_sample_ref: string | null;
  test_results: string | null;
  test_passed: number | null;
  rejection_reason: string | null;
  quarantine_reason: string | null;
  conditional_notes: string | null;
  incorporated_to: string | null;
  incorporated_by: string | null;
  floor_ie_witnessed: number;
  floor_lender_hold_point: number;
  floor_nersa_material: number;
  floor_critical_safety: number;
  floor_manufacturer_warranty_at_risk: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  ncr_ref: string | null;
  submittal_ref: string | null;
  rfi_ref: string | null;
  change_order_ref: string | null;
  created_at: string;
  // Live fields
  time_in_state_hours_live: number | null;
  sla_remaining_hours_live: number | null;
  is_rejected_live: boolean;
  is_signature_live: boolean;
  in_inspection_live: boolean;
}

interface Dashboard {
  mirs: {
    total_count: number;
    in_inspection_count: number;
    approved_count: number;
    rejected_count: number;
    quarantined_count: number;
    sla_breached_count: number;
    critical_structural_count: number;
  };
}

const SLA_HOURS_BY_TIER: Record<MaterialTier, number> = {
  critical_structural: 24,
  electrical_mechanical: 48,
  civil: 96,
  general: 168,
};

const MATERIAL_TIER_LABEL: Record<MaterialTier, string> = {
  critical_structural: 'Critical structural',
  electrical_mechanical: 'Electrical / mechanical',
  civil: 'Civil',
  general: 'General',
};

const MATERIAL_TIER_COLOR: Record<MaterialTier, string> = {
  critical_structural: 'bg-red-100 text-red-800',
  electrical_mechanical: 'bg-orange-100 text-orange-700',
  civil: 'bg-amber-100 text-amber-700',
  general: 'bg-gray-100 text-gray-600',
};

const MATERIAL_CATEGORY_LABEL: Record<MaterialCategory, string> = {
  structural_steel: 'Structural steel',
  concrete: 'Concrete',
  electrical_cable: 'Electrical cable',
  transformer: 'Transformer',
  inverter: 'Inverter',
  solar_panel: 'Solar panel',
  civil_materials: 'Civil materials',
  mechanical: 'Mechanical',
  instruments: 'Instruments',
  general: 'General',
};

const STATUS_COLOR: Record<MirStatus, string> = {
  delivery_notified:    'bg-slate-100 text-slate-700',
  delivered:            'bg-blue-50 text-blue-700',
  initial_inspection:   'bg-indigo-100 text-indigo-700',
  detailed_inspection:  'bg-violet-100 text-violet-700',
  test_sampling:        'bg-purple-100 text-purple-700',
  results_pending:      'bg-cyan-100 text-cyan-700',
  approved:             'bg-green-100 text-green-800',
  conditional_approval: 'bg-teal-100 text-teal-700',
  incorporated:         'bg-gray-100 text-gray-600',
  rejected_on_site:     'bg-red-100 text-red-800',
  quarantined:          'bg-orange-100 text-orange-800',
  returned_to_supplier: 'bg-gray-200 text-gray-500',
};

const ACTIONS: Record<MirStatus, Array<{ action: string; label: string; danger?: boolean }>> = {
  delivery_notified:    [
    { action: 'record_delivery', label: 'Record delivery' },
    { action: 'reject_material', label: 'Reject on delivery', danger: true },
    { action: 'quarantine_material', label: 'Quarantine', danger: true },
  ],
  delivered:            [
    { action: 'start_initial_inspection', label: 'Start initial inspection' },
    { action: 'reject_material', label: 'Reject on delivery', danger: true },
    { action: 'quarantine_material', label: 'Quarantine', danger: true },
  ],
  initial_inspection:   [
    { action: 'proceed_to_detailed', label: 'Proceed to detailed inspection' },
    { action: 'reject_material', label: 'Reject material', danger: true },
    { action: 'quarantine_material', label: 'Quarantine', danger: true },
  ],
  detailed_inspection:  [
    { action: 'approve_material', label: 'Approve material' },
    { action: 'approve_conditional', label: 'Approve conditional' },
    { action: 'take_test_samples', label: 'Take test samples' },
    { action: 'reject_material', label: 'Reject material (IE)', danger: true },
    { action: 'quarantine_material', label: 'Quarantine', danger: true },
  ],
  test_sampling:        [{ action: 'await_results', label: 'Await lab results' }],
  results_pending:      [
    { action: 'approve_material', label: 'Approve material' },
    { action: 'approve_conditional', label: 'Approve conditional' },
    { action: 'reject_material', label: 'Reject material (IE)', danger: true },
    { action: 'quarantine_material', label: 'Quarantine', danger: true },
  ],
  approved:             [{ action: 'incorporate_material', label: 'Mark incorporated' }],
  conditional_approval: [{ action: 'incorporate_material', label: 'Mark incorporated (conditions met)' }],
  incorporated:         [],
  rejected_on_site:     [{ action: 'return_to_supplier', label: 'Return to supplier' }],
  quarantined:          [{ action: 'return_to_supplier', label: 'Return to supplier' }],
  returned_to_supplier: [],
};

const MAIN_STATES: readonly MirStatus[] = [
  'delivery_notified', 'delivered', 'initial_inspection', 'detailed_inspection',
  'test_sampling', 'results_pending', 'approved', 'conditional_approval', 'incorporated',
];
const BRANCH_STATES: readonly MirStatus[] = ['rejected_on_site', 'quarantined', 'returned_to_supplier'];
const ALL_STATUSES: MirStatus[] = [...MAIN_STATES, ...BRANCH_STATES];
const MATERIAL_TIERS: MaterialTier[] = ['critical_structural', 'electrical_mechanical', 'civil', 'general'];
const MATERIAL_CATEGORIES: MaterialCategory[] = [
  'structural_steel', 'concrete', 'electrical_cable', 'transformer',
  'inverter', 'solar_panel', 'civil_materials', 'mechanical', 'instruments', 'general',
];

function Flag({ label, title, cls }: { label: string; title: string; cls: string }) {
  return (
    <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${cls}`} title={title}>{label}</span>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-900 border-blue-200',
    red: 'bg-red-50 text-red-900 border-red-200',
    orange: 'bg-orange-50 text-orange-900 border-orange-200',
    green: 'bg-green-50 text-green-900 border-green-200',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[color] ?? colors.gray}`}>
      <div className="text-xs text-current opacity-70">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function CheckIndicator({ passed }: { passed: number | null }) {
  if (passed === null) return <span className="text-gray-300 text-xs">—</span>;
  return passed
    ? <span className="text-green-600 text-xs font-bold">✓</span>
    : <span className="text-red-600 text-xs font-bold">✗</span>;
}

function CheckRow({ label, checked, onChange, warningLabel }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; warningLabel?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded" />
      <span>{label}</span>
      {checked && warningLabel && (
        <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-800">{warningLabel}</span>
      )}
    </label>
  );
}

interface Props { readOnly?: boolean }

export default function IppMirTab({ readOnly = false }: Props) {
  const [rows, setRows] = useState<MirRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MirRow | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<MirStatus | ''>('');
  const [filterTier, setFilterTier] = useState<MaterialTier | ''>('');
  const [filterCategory, setFilterCategory] = useState<MaterialCategory | ''>('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newDesc, setNewDesc] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newMirNumber, setNewMirNumber] = useState('');
  const [newCategory, setNewCategory] = useState<MaterialCategory>('structural_steel');
  const [newTier, setNewTier] = useState<MaterialTier>('electrical_mechanical');
  const [newSupplier, setNewSupplier] = useState('');
  const [newManufacturer, setNewManufacturer] = useState('');
  const [newBatch, setNewBatch] = useState('');
  const [newCertNumber, setNewCertNumber] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newQtyUnit, setNewQtyUnit] = useState('');
  const [newPoRef, setNewPoRef] = useState('');
  const [newFloorIe, setNewFloorIe] = useState(false);
  const [newFloorLender, setNewFloorLender] = useState(false);
  const [newFloorNersa, setNewFloorNersa] = useState(false);
  const [newFloorSafety, setNewFloorSafety] = useState(false);
  const [newFloorWarranty, setNewFloorWarranty] = useState(false);
  const [newNcrRef, setNewNcrRef] = useState('');
  const [newSubmittalRef, setNewSubmittalRef] = useState('');
  const [newRfiRef, setNewRfiRef] = useState('');
  const [newChangeOrderRef, setNewChangeOrderRef] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api('/api/ipp-mir');
      setRows(res.data?.data ?? []);
      setDashboard(res.data?.dashboard ?? null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter(r => {
    if (filterStatus && r.chain_status !== filterStatus) return false;
    if (filterTier && r.material_tier !== filterTier) return false;
    if (filterCategory && r.material_category !== filterCategory) return false;
    return true;
  }), [rows, filterStatus, filterTier, filterCategory]);

  async function handleAction(action: string) {
    if (!selected) return;
    setActionLoading(true); setActionResult(null);
    try {
      await api(`/api/ipp-mir/${selected.id}/${action}`, { method: 'POST', data: {} });
      setActionResult(`${action.replace(/_/g, ' ')} — done`);
      await load();
      setSelected(null);
    } catch (e: any) {
      setActionResult(`Error: ${e.response?.data?.error ?? e.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreate() {
    if (!newDesc || !newProject || !newCategory || !newTier) return;
    setCreateLoading(true);
    try {
      await api('/api/ipp-mir', {
        method: 'POST',
        data: {
          material_description: newDesc,
          project_id: newProject,
          project_name: newProjectName || undefined,
          mir_number: newMirNumber || undefined,
          material_category: newCategory,
          material_tier: newTier,
          supplier_name: newSupplier || undefined,
          manufacturer: newManufacturer || undefined,
          batch_number: newBatch || undefined,
          certificate_number: newCertNumber || undefined,
          quantity: newQty ? Number(newQty) : undefined,
          quantity_unit: newQtyUnit || undefined,
          po_reference: newPoRef || undefined,
          floor_ie_witnessed: newFloorIe ? 1 : 0,
          floor_lender_hold_point: newFloorLender ? 1 : 0,
          floor_nersa_material: newFloorNersa ? 1 : 0,
          floor_critical_safety: newFloorSafety ? 1 : 0,
          floor_manufacturer_warranty_at_risk: newFloorWarranty ? 1 : 0,
          ncr_ref: newNcrRef || undefined,
          submittal_ref: newSubmittalRef || undefined,
          rfi_ref: newRfiRef || undefined,
          change_order_ref: newChangeOrderRef || undefined,
        },
      });
      setShowCreate(false);
      setNewDesc(''); setNewProject(''); setNewProjectName(''); setNewMirNumber('');
      setNewCategory('structural_steel'); setNewTier('electrical_mechanical');
      setNewSupplier(''); setNewManufacturer(''); setNewBatch(''); setNewCertNumber('');
      setNewQty(''); setNewQtyUnit(''); setNewPoRef('');
      setNewFloorIe(false); setNewFloorLender(false); setNewFloorNersa(false);
      setNewFloorSafety(false); setNewFloorWarranty(false);
      setNewNcrRef(''); setNewSubmittalRef(''); setNewRfiRef(''); setNewChangeOrderRef('');
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setCreateLoading(false);
    }
  }

  const db = dashboard?.mirs;
  const isSignatureCreate = newFloorIe || newFloorSafety;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      {db && (
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
          <KpiCard label="In inspection" value={db.in_inspection_count} color="blue" />
          <KpiCard label="Approved" value={db.approved_count} color="green" />
          <KpiCard label="Rejected on site" value={db.rejected_count} color="red" />
          <KpiCard label="Quarantined" value={db.quarantined_count} color="orange" />
          <KpiCard label="SLA breached" value={db.sla_breached_count} color="red" />
          <KpiCard label="Critical structural" value={db.critical_structural_count} color="amber" />
          <KpiCard label="Total" value={db.total_count} color="gray" />
        </div>
      )}

      {/* W139 AI insight — rejections present */}
      {db && db.rejected_count > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-red-600 text-xl mt-0.5">&#9888;</span>
          <div>
            <p className="text-sm font-semibold text-red-900">
              {db.rejected_count} material{db.rejected_count !== 1 ? 's' : ''} rejected on site
            </p>
            <p className="text-xs text-red-800 mt-0.5">
              ISO 9001 §8.6: non-conforming materials must be segregated, clearly marked, and prevented from unintended use.
              W139 SIGNATURE: reject_material crosses regulator EVERY tier when IE witnessed — lender notification required.
              Raise NCR (W136) and initiate return-to-supplier process.
            </p>
          </div>
        </div>
      )}

      {/* SLA breach alert */}
      {db && db.sla_breached_count > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-3">
          <span className="text-orange-600 text-xl mt-0.5">&#9201;</span>
          <div>
            <p className="text-sm font-semibold text-orange-900">
              {db.sla_breached_count} MIR{db.sla_breached_count !== 1 ? 's' : ''} past SLA deadline
            </p>
            <p className="text-xs text-orange-800 mt-0.5">
              URGENT SLA — critical structural materials (steel, concrete, foundations) must be inspected within 24h.
              SLA breach with IE witness or NERSA-regulated equipment crosses regulator notification.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="text-xs border rounded px-2 py-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value as MirStatus | '')}>
          <option value="">All statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterTier} onChange={e => setFilterTier(e.target.value as MaterialTier | '')}>
          <option value="">All tiers</option>
          {MATERIAL_TIERS.map(t => <option key={t} value={t}>{MATERIAL_TIER_LABEL[t]}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterCategory} onChange={e => setFilterCategory(e.target.value as MaterialCategory | '')}>
          <option value="">All categories</option>
          {MATERIAL_CATEGORIES.map(c => <option key={c} value={c}>{MATERIAL_CATEGORY_LABEL[c]}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} MIRs</span>
        {!readOnly && (
          <button type="button" className="text-xs bg-green-600 text-white rounded px-3 py-1 hover:bg-green-700" onClick={() => setShowCreate(true)}>
            + Create MIR
          </button>
        )}
        <button type="button" className="text-xs border rounded px-2 py-1 hover:bg-gray-50" onClick={load}>Refresh</button>
      </div>

      {actionResult && (
        <div className={`text-xs rounded px-3 py-2 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {actionResult}
        </div>
      )}
      {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
      {loading && <div className="text-xs text-gray-400">Loading material inspection register…</div>}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">MIR No.</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Category</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Tier</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Supplier</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Qty</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">SLA</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Flags</th>
                {!readOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 9 : 10} className="px-3 py-6 text-center text-gray-400">
                    No material inspection records
                  </td>
                </tr>
              )}
              {filtered.map(row => (
                <tr
                  key={row.id}
                  className={`border-t border-gray-100 hover:bg-gray-50 cursor-pointer ${row.is_rejected_live ? 'bg-red-50/40' : ''}`}
                  onClick={() => setSelected(row)}
                >
                  <td className="px-3 py-2 font-mono text-gray-400">{row.mir_number ?? row.id}</td>
                  <td className="px-3 py-2 max-w-[180px]">
                    <span className="text-gray-800 block truncate">{row.material_description}</span>
                    {row.project_name && <span className="text-gray-400 truncate block">{row.project_name}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {row.material_category ? MATERIAL_CATEGORY_LABEL[row.material_category] : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {row.material_tier && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${MATERIAL_TIER_COLOR[row.material_tier]}`}>
                        {MATERIAL_TIER_LABEL[row.material_tier]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">{row.supplier_name ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {row.quantity != null ? `${row.quantity} ${row.quantity_unit ?? ''}`.trim() : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[row.chain_status]}`}>
                      {row.chain_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.sla_remaining_hours_live != null && row.material_tier ? (
                      <SlaCountdown
                        remainingHours={row.sla_remaining_hours_live}
                        totalHours={row.sla_target_hours ?? SLA_HOURS_BY_TIER[row.material_tier]}
                        breached={!!row.sla_breached}
                        compact
                      />
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {!!row.floor_ie_witnessed && <Flag label="IE" title="IE physically witnessed inspection" cls="bg-indigo-200 text-indigo-900" />}
                      {!!row.floor_lender_hold_point && <Flag label="LHP" title="Lender hold point — lender must release before use" cls="bg-blue-100 text-blue-800" />}
                      {!!row.floor_nersa_material && <Flag label="NERSA" title="NERSA-regulated equipment (transformer, switchgear)" cls="bg-orange-100 text-orange-800" />}
                      {!!row.floor_critical_safety && <Flag label="SAFE" title="Safety-critical material (fire suppression, structural)" cls="bg-red-200 text-red-900" />}
                      {!!row.floor_manufacturer_warranty_at_risk && <Flag label="WRY" title="Rejection voids manufacturer warranty" cls="bg-amber-100 text-amber-800" />}
                      {!!row.is_reportable && <Flag label="⚑" title="Regulator crossed (W139 SIGNATURE)" cls="bg-red-200 text-red-800" />}
                    </div>
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2">
                      <button type="button"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={e => { e.stopPropagation(); setSelected(row); }}
                      >
                        Manage
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => { setSelected(null); setActionResult(null); }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {selected.material_tier && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${MATERIAL_TIER_COLOR[selected.material_tier]}`}>
                      {MATERIAL_TIER_LABEL[selected.material_tier]}
                    </span>
                  )}
                  {selected.material_category && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
                      {MATERIAL_CATEGORY_LABEL[selected.material_category]}
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[selected.chain_status]}`}>
                    {selected.chain_status.replace(/_/g, ' ')}
                  </span>
                  {!!selected.is_reportable && (
                    <span className="px-1 py-0.5 rounded text-[10px] bg-red-200 text-red-800">REGULATOR CROSSED</span>
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">{selected.material_description}</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  {selected.mir_number ?? selected.id} · {selected.project_name ?? selected.project_id}
                </p>
              </div>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={() => { setSelected(null); setActionResult(null); }}>×</button>
            </div>

            {/* Chain state bar */}
            <div className="mb-4">
              <ChainStateBar
                allStates={MAIN_STATES as unknown as string[]}
                currentState={selected.chain_status}
                branchStates={BRANCH_STATES as unknown as string[]}
              />
            </div>

            {/* SLA countdown */}
            {selected.sla_remaining_hours_live != null && selected.material_tier && (
              <div className="mb-4">
                <SlaCountdown
                  remainingHours={selected.sla_remaining_hours_live}
                  totalHours={selected.sla_target_hours ?? SLA_HOURS_BY_TIER[selected.material_tier]}
                  breached={!!selected.sla_breached}
                />
              </div>
            )}

            {/* W139 SIGNATURE warning */}
            {selected.is_signature_live && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-900">
                  W139 SIGNATURE — Regulator notification required
                </p>
                <p className="text-xs text-red-800 mt-0.5">
                  IE witnessed this rejection/quarantine — regulator notification is mandatory at every tier per ISO 9001 §8.6 + REIPPPP quality specifications.
                  Lender Independent Engineer must be notified.
                </p>
              </div>
            )}

            {/* Rejection/quarantine reason */}
            {selected.rejection_reason && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-900">Rejection reason</p>
                <p className="text-xs text-red-800 mt-0.5">{selected.rejection_reason}</p>
              </div>
            )}
            {selected.quarantine_reason && (
              <div className="mb-4 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2">
                <p className="text-xs font-semibold text-orange-900">Quarantine reason</p>
                <p className="text-xs text-orange-800 mt-0.5">{selected.quarantine_reason}</p>
              </div>
            )}

            {/* Conditional notes */}
            {selected.conditional_notes && selected.chain_status === 'conditional_approval' && (
              <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
                <p className="text-xs font-semibold text-teal-900">Conditional approval notes</p>
                <p className="text-xs text-teal-800 mt-0.5">{selected.conditional_notes}</p>
              </div>
            )}

            {/* Material details */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
              <div>
                <span className="text-gray-500">Supplier</span>
                <p className="font-medium text-gray-800">{selected.supplier_name ?? '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Manufacturer</span>
                <p className="font-medium text-gray-800">{selected.manufacturer ?? '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Batch / heat number</span>
                <p className="font-medium text-gray-800">{selected.batch_number ?? '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Certificate number</span>
                <p className="font-medium text-gray-800">{selected.certificate_number ?? '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Quantity</span>
                <p className="font-medium text-gray-800">
                  {selected.quantity != null ? `${selected.quantity} ${selected.quantity_unit ?? ''}`.trim() : '—'}
                </p>
              </div>
              <div>
                <span className="text-gray-500">PO reference</span>
                <p className="font-medium text-gray-800">{selected.po_reference ?? '—'}</p>
              </div>
            </div>

            {/* Delivery details */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
              <div>
                <span className="text-gray-500">Scheduled delivery</span>
                <p className="font-medium text-gray-800">{selected.scheduled_delivery_date ?? '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Actual delivery</span>
                <p className="font-medium text-gray-800">{selected.actual_delivery_date ?? '—'}</p>
              </div>
              {selected.delivery_note_ref && (
                <div>
                  <span className="text-gray-500">Delivery note ref</span>
                  <p className="font-medium text-gray-800">{selected.delivery_note_ref}</p>
                </div>
              )}
              {selected.delivery_vehicle_ref && (
                <div>
                  <span className="text-gray-500">Vehicle ref</span>
                  <p className="font-medium text-gray-800">{selected.delivery_vehicle_ref}</p>
                </div>
              )}
            </div>

            {/* Inspection checklist */}
            {selected.inspector_name && (
              <div className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-xs font-semibold text-slate-900 mb-2">
                  Inspection checklist · {selected.inspector_name}
                  {selected.inspection_type && <span className="ml-2 text-gray-500 font-normal">({selected.inspection_type})</span>}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckIndicator passed={selected.dimensional_check_passed} />
                    <span className="text-gray-700">Dimensional check</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIndicator passed={selected.quantity_check_passed} />
                    <span className="text-gray-700">Quantity check</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIndicator passed={selected.documentation_check_passed} />
                    <span className="text-gray-700">Documentation / certs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIndicator passed={selected.visual_check_passed} />
                    <span className="text-gray-700">Visual check</span>
                  </div>
                </div>
                {selected.inspection_findings && (
                  <p className="text-xs text-gray-700 mt-2 whitespace-pre-wrap">{selected.inspection_findings}</p>
                )}
              </div>
            )}

            {/* Lab testing */}
            {!!selected.test_required && (
              <div className="mb-4 p-3 rounded-lg bg-purple-50 border border-purple-200">
                <p className="text-xs font-semibold text-purple-900 mb-1">Lab testing required</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {selected.lab_name && (
                    <div>
                      <span className="text-gray-500">Lab</span>
                      <p className="font-medium text-gray-800">{selected.lab_name}</p>
                    </div>
                  )}
                  {selected.lab_sample_ref && (
                    <div>
                      <span className="text-gray-500">Sample ref</span>
                      <p className="font-medium text-gray-800">{selected.lab_sample_ref}</p>
                    </div>
                  )}
                  {selected.test_results && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Results</span>
                      <p className="font-medium text-gray-800">{selected.test_results}</p>
                    </div>
                  )}
                  {selected.test_passed !== null && (
                    <div className="flex items-center gap-2">
                      <CheckIndicator passed={selected.test_passed} />
                      <span className="font-medium text-gray-800">
                        {selected.test_passed ? 'Tests passed' : 'Tests FAILED'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Incorporation details */}
            {selected.chain_status === 'incorporated' && (
              <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-xs font-semibold text-green-900 mb-1">Incorporated into works</p>
                <p className="text-xs text-green-800">{selected.incorporated_to ?? '—'}</p>
                {selected.incorporated_by && (
                  <p className="text-xs text-green-700 mt-0.5">By: {selected.incorporated_by}</p>
                )}
              </div>
            )}

            {/* Floor flags */}
            {(selected.floor_ie_witnessed || selected.floor_lender_hold_point ||
              selected.floor_nersa_material || selected.floor_critical_safety ||
              selected.floor_manufacturer_warranty_at_risk) ? (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-900 mb-1.5">Floor flags</p>
                <div className="flex flex-wrap gap-1.5">
                  {!!selected.floor_ie_witnessed && <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-200 text-indigo-900">IE witnessed</span>}
                  {!!selected.floor_lender_hold_point && <span className="px-2 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800">Lender hold point</span>}
                  {!!selected.floor_nersa_material && <span className="px-2 py-0.5 rounded text-[10px] bg-orange-100 text-orange-800">NERSA-regulated</span>}
                  {!!selected.floor_critical_safety && <span className="px-2 py-0.5 rounded text-[10px] bg-red-200 text-red-900">Critical safety</span>}
                  {!!selected.floor_manufacturer_warranty_at_risk && <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800">Warranty at risk</span>}
                </div>
              </div>
            ) : null}

            {/* Cross-references */}
            {(selected.ncr_ref || selected.submittal_ref || selected.rfi_ref || selected.change_order_ref) && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Cross-references</p>
                <div className="flex flex-wrap gap-2">
                  {selected.ncr_ref && <span className="text-xs text-blue-600">NCR: {selected.ncr_ref}</span>}
                  {selected.submittal_ref && <span className="text-xs text-blue-600">Submittal: {selected.submittal_ref}</span>}
                  {selected.rfi_ref && <span className="text-xs text-blue-600">RFI: {selected.rfi_ref}</span>}
                  {selected.change_order_ref && <span className="text-xs text-blue-600">CO: {selected.change_order_ref}</span>}
                </div>
              </div>
            )}

            {/* SLA details */}
            {selected.sla_breach_count > 0 && (
              <div className="mb-4 text-xs text-gray-600">
                SLA breach count: <span className="font-medium text-red-700">{selected.sla_breach_count}</span>
                {selected.regulator_ref && <span className="ml-3">Regulator ref: <span className="font-mono">{selected.regulator_ref}</span></span>}
              </div>
            )}

            {/* Actions */}
            {!readOnly && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Actions</p>
                {actionResult && (
                  <div className={`text-xs rounded px-2 py-1 mb-2 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {actionResult}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {(ACTIONS[selected.chain_status] ?? []).map(({ action, label, danger }) => (
                    <button type="button"
                      key={action}
                      disabled={actionLoading}
                      onClick={() => handleAction(action)}
                      className={`text-xs rounded px-3 py-1 ${
                        danger
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      } disabled:opacity-50`}
                    >
                      {label}
                    </button>
                  ))}
                  {(ACTIONS[selected.chain_status] ?? []).length === 0 && (
                    <span className="text-xs text-gray-400 italic">No actions available (terminal state)</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && !readOnly && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Create Material Inspection Record</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={() => setShowCreate(false)}>×</button>
            </div>

            {/* SIGNATURE warning */}
            {isSignatureCreate && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-900">
                  W139 SIGNATURE — reject_material / quarantine_material will trigger regulator notification
                </p>
                <p className="text-xs text-red-800 mt-0.5">
                  IE witnessed or critical safety flag is set. Any rejection or quarantine will cross regulator at EVERY tier per ISO 9001 §8.6.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">Material description *</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="e.g. 33kV Power Transformer 40MVA" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">MIR number</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newMirNumber} onChange={e => setNewMirNumber(e.target.value)} placeholder="e.g. K500-MIR-013" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Project ID *</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="project-id" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Project name</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Display name" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Category *</label>
                  <select className="text-xs border rounded px-2 py-1.5 w-full" value={newCategory} onChange={e => setNewCategory(e.target.value as MaterialCategory)}>
                    {MATERIAL_CATEGORIES.map(c => <option key={c} value={c}>{MATERIAL_CATEGORY_LABEL[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Material tier *</label>
                  <select className="text-xs border rounded px-2 py-1.5 w-full" value={newTier} onChange={e => setNewTier(e.target.value as MaterialTier)}>
                    {MATERIAL_TIERS.map(t => <option key={t} value={t}>{MATERIAL_TIER_LABEL[t]} ({SLA_HOURS_BY_TIER[t]}h SLA)</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Supplier</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newSupplier} onChange={e => setNewSupplier(e.target.value)} placeholder="e.g. Actom" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Manufacturer</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newManufacturer} onChange={e => setNewManufacturer(e.target.value)} placeholder="e.g. ABB" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Batch / heat number</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newBatch} onChange={e => setNewBatch(e.target.value)} placeholder="e.g. HN-2026-001" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Certificate number</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newCertNumber} onChange={e => setNewCertNumber(e.target.value)} placeholder="Mill cert / type test cert" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Quantity</label>
                  <input type="number" className="text-xs border rounded px-2 py-1.5 w-full" value={newQty} onChange={e => setNewQty(e.target.value)} placeholder="e.g. 45.2" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Unit</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newQtyUnit} onChange={e => setNewQtyUnit(e.target.value)} placeholder="tons / m / m³ / units…" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">PO reference</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newPoRef} onChange={e => setNewPoRef(e.target.value)} placeholder="e.g. PO-K500-2026-041" />
                </div>
              </div>

              {/* Floor flags */}
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-900 mb-2">Floor flags (drive SIGNATURE logic)</p>
                <div className="space-y-1.5">
                  <CheckRow label="IE physically witnessed the inspection" checked={newFloorIe} onChange={setNewFloorIe} warningLabel="SIGNATURE" />
                  <CheckRow label="Lender hold point — lender must release before material used" checked={newFloorLender} onChange={setNewFloorLender} />
                  <CheckRow label="NERSA-regulated equipment (transformers, switchgear)" checked={newFloorNersa} onChange={setNewFloorNersa} />
                  <CheckRow label="Safety-critical material (fire suppression, structural)" checked={newFloorSafety} onChange={setNewFloorSafety} warningLabel="SIGNATURE" />
                  <CheckRow label="Rejection voids manufacturer warranty" checked={newFloorWarranty} onChange={setNewFloorWarranty} />
                </div>
              </div>

              {/* Cross-references */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">NCR ref (W136)</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newNcrRef} onChange={e => setNewNcrRef(e.target.value)} placeholder="ncr-xxx" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Submittal ref (W116)</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newSubmittalRef} onChange={e => setNewSubmittalRef(e.target.value)} placeholder="sub-xxx" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">RFI ref</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newRfiRef} onChange={e => setNewRfiRef(e.target.value)} placeholder="rfi-xxx" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Change order ref</label>
                  <input className="text-xs border rounded px-2 py-1.5 w-full" value={newChangeOrderRef} onChange={e => setNewChangeOrderRef(e.target.value)} placeholder="co-xxx" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
              <button type="button"
                onClick={handleCreate}
                disabled={createLoading || !newDesc || !newProject}
                className="text-xs bg-green-600 text-white rounded px-4 py-1.5 hover:bg-green-700 disabled:opacity-50"
              >
                {createLoading ? 'Creating…' : 'Create MIR'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
