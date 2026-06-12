// Wave 141 — IPP Progress Claims & Payment Certificates
// JBCC + NEC4 + REIPPPP payment milestones + Equator Principles EP4 disbursement certification.
// INVERTED SLA: major 720h (most time) → minor 72h (least time).
// SIGNATURE: certify_by_engineer EVERY tier on floor_ie_milestone_payment;
//            record_final_account EVERY tier;
//            approve_payment when floor_lender_certification_required.
// Beats Oracle Aconex (payment as document workflow) with a full P6 lifecycle.
// Mounted at /ipp-lifecycle/workstation?tab=progress-claims (WRITE: ipp_developer/admin).
// READ all 9 personas via readOnly prop.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainStateBar } from '../ChainStateBar';
import { SlaCountdown } from '../SlaCountdown';

type ClaimStatus =
  | 'submitted' | 'quantity_survey_review' | 'pm_review' | 'engineer_certified'
  | 'approved' | 'payment_processed' | 'closed'
  | 'disputed' | 'suspended' | 'rejected' | 'partial_payment' | 'final_account';

type ClaimTier = 'major' | 'significant' | 'standard' | 'minor';

interface ClaimRow {
  id: string;
  project_id: string;
  project_name: string | null;
  claim_number: string | null;
  chain_status: ClaimStatus;
  claim_type: string | null;
  claim_tier: ClaimTier | null;
  contractor_name: string | null;
  subcontractor_ref: string | null;
  claim_period_from: string | null;
  claim_period_to: string | null;
  contractor_invoice_ref: string | null;
  claim_amount_zar: number;
  qs_assessed_zar: number | null;
  certified_amount_zar: number | null;
  approved_amount_zar: number | null;
  retention_amount_zar: number | null;
  vat_amount_zar: number | null;
  net_payable_zar: number | null;
  previous_certified_total_zar: number | null;
  this_period_zar: number | null;
  contract_completion_pct: number | null;
  qs_notes: string | null;
  pm_notes: string | null;
  engineer_certification_notes: string | null;
  dispute_reason: string | null;
  rejection_reason: string | null;
  suspension_reason: string | null;
  floor_ie_milestone_payment: number;
  floor_lender_certification_required: number;
  floor_retention_release: number;
  floor_variation_included: number;
  floor_defects_outstanding: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  change_order_ref: string | null;
  milestone_ref: string | null;
  drawdown_ref: string | null;
  created_at: string;
  // Live fields
  sla_remaining_hours_live: number | null;
  is_open_live: boolean;
  is_signature_live: boolean;
}

interface Dashboard {
  progress_claims: {
    total_count: number;
    pending_payment_count: number;
    disputed_count: number;
    total_certified_zar: number;
    total_approved_zar: number;
    total_paid_zar: number;
    sla_breached_count: number;
  };
}

const SLA_HOURS_BY_TIER: Record<ClaimTier, number> = {
  major: 720,
  significant: 336,
  standard: 168,
  minor: 72,
};

const TIER_LABEL: Record<ClaimTier, string> = {
  major: 'Major (>R10m)',
  significant: 'Significant (R1m–R10m)',
  standard: 'Standard (R100k–R1m)',
  minor: 'Minor (<R100k)',
};

const TIER_COLOR: Record<ClaimTier, string> = {
  major: 'bg-red-100 text-red-800',
  significant: 'bg-orange-100 text-orange-700',
  standard: 'bg-amber-100 text-amber-700',
  minor: 'bg-[#eef2f7] text-[#3d4756]',
};

const TYPE_LABEL: Record<string, string> = {
  interim: 'Interim',
  milestone: 'Milestone',
  final: 'Final account',
  variation: 'Variation',
  daywork: 'Daywork',
};

const TYPE_COLOR: Record<string, string> = {
  interim: 'bg-[oklch(0.97_0.003_250)] text-[oklch(0.46_0.16_55)]',
  milestone: 'bg-purple-100 text-purple-700',
  final: 'bg-green-100 text-green-700',
  variation: 'bg-amber-100 text-amber-700',
  daywork: 'bg-[#eef2f7] text-[#3d4756]',
};

const STATUS_COLOR: Record<ClaimStatus, string> = {
  submitted:              'bg-[#eef2f7] text-[#2d3748]',
  quantity_survey_review: 'bg-[oklch(0.97_0.003_250)] text-[oklch(0.46_0.16_55)]',
  pm_review:              'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]',
  engineer_certified:     'bg-violet-100 text-violet-700',
  approved:               'bg-emerald-100 text-emerald-700',
  payment_processed:      'bg-green-100 text-green-800',
  closed:                 'bg-[#eef2f7] text-[#3d4756]',
  disputed:               'bg-red-100 text-red-800',
  suspended:              'bg-orange-100 text-orange-800',
  rejected:               'bg-red-200 text-red-900',
  partial_payment:        'bg-teal-100 text-teal-700',
  final_account:          'bg-purple-200 text-purple-900',
};

const ACTIONS: Record<ClaimStatus, Array<{ action: string; label: string; danger?: boolean }>> = {
  submitted:              [{ action: 'commence_qs_review', label: 'Start QS review' }],
  quantity_survey_review: [
    { action: 'complete_qs_review', label: 'Complete QS review' },
    { action: 'reject_claim', label: 'Reject claim', danger: true },
  ],
  pm_review: [
    { action: 'certify_by_engineer', label: 'Certify by engineer' },
    { action: 'approve_partial', label: 'Approve partial payment' },
    { action: 'dispute_claim', label: 'Raise dispute', danger: true },
    { action: 'suspend_payment', label: 'Suspend', danger: true },
    { action: 'reject_claim', label: 'Reject', danger: true },
  ],
  engineer_certified: [
    { action: 'approve_payment', label: 'Approve payment' },
    { action: 'approve_partial', label: 'Approve partial' },
    { action: 'dispute_claim', label: 'Dispute', danger: true },
  ],
  approved: [
    { action: 'process_payment', label: 'Process payment' },
    { action: 'suspend_payment', label: 'Suspend', danger: true },
  ],
  payment_processed: [{ action: 'close_claim', label: 'Close claim' }],
  partial_payment:   [{ action: 'close_claim', label: 'Close claim' }],
  closed:            [{ action: 'record_final_account', label: 'Record final account' }],
  disputed:          [{ action: 'resolve_dispute', label: 'Resolve dispute — return to PM review' }],
  suspended:         [{ action: 'reinstate_payment', label: 'Reinstate — return to PM review' }],
  rejected:          [],
  final_account:     [],
};

const MAIN_STATES: readonly ClaimStatus[] = [
  'submitted', 'quantity_survey_review', 'pm_review', 'engineer_certified',
  'approved', 'payment_processed', 'closed',
];
const BRANCH_STATES: readonly ClaimStatus[] = [
  'disputed', 'suspended', 'rejected', 'partial_payment', 'final_account',
];
const ALL_STATUSES: ClaimStatus[] = [...MAIN_STATES, ...BRANCH_STATES];
const CLAIM_TIERS: ClaimTier[] = ['major', 'significant', 'standard', 'minor'];
const CLAIM_TYPES = Object.keys(TYPE_LABEL);

function slaRemainingHours(deadlineIso: string): number {
  return Math.round((new Date(deadlineIso).getTime() - Date.now()) / 3_600_000);
}

function formatZar(v: number | null | undefined): string {
  if (v == null) return '—';
  return `R ${v.toLocaleString('en-ZA')}`;
}

function Flag({ label, title, cls }: { label: string; title: string; cls: string }) {
  return (
    <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${cls}`} title={title}>{label}</span>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue:   'bg-[oklch(0.97_0.003_250)] text-[oklch(0.17_0.010_250)] border-[oklch(0.87_0.012_250)]',
    red:    'bg-red-50 text-red-900 border-red-200',
    orange: 'bg-orange-50 text-orange-900 border-orange-200',
    green:  'bg-green-50 text-green-900 border-green-200',
    amber:  'bg-amber-50 text-amber-900 border-amber-200',
    purple: 'bg-purple-50 text-purple-900 border-purple-200',
    gray:   'bg-[#f8fafc] text-[#2d3748] border-[#dde4ec]',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[color] ?? colors.gray}`}>
      <div className="text-xs text-current opacity-70">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
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

function FinancialRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <tr className={highlight ? 'font-bold' : ''}>
      <td className="pr-3 text-[#6b7685] py-1">{label}</td>
      <td className={`text-right py-1 ${highlight ? 'text-green-800' : 'text-[#1e2a38]'}`}>{value}</td>
    </tr>
  );
}

interface Props { readOnly?: boolean }

export default function IppProgressClaimTab({ readOnly = false }: Props) {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ClaimRow | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ClaimStatus | ''>('');
  const [filterTier, setFilterTier] = useState<ClaimTier | ''>('');
  const [filterType, setFilterType] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newProjectId, setNewProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newClaimNumber, setNewClaimNumber] = useState('');
  const [newContractorName, setNewContractorName] = useState('');
  const [newClaimType, setNewClaimType] = useState('interim');
  const [newTier, setNewTier] = useState<ClaimTier>('standard');
  const [newClaimAmount, setNewClaimAmount] = useState('');
  const [newPeriodFrom, setNewPeriodFrom] = useState('');
  const [newPeriodTo, setNewPeriodTo] = useState('');
  const [newInvoiceRef, setNewInvoiceRef] = useState('');
  const [newSubcontractorRef, setNewSubcontractorRef] = useState('');
  const [newChangeOrderRef, setNewChangeOrderRef] = useState('');
  const [newMilestoneRef, setNewMilestoneRef] = useState('');
  const [newFloorIeMilestone, setNewFloorIeMilestone] = useState(false);
  const [newFloorLenderCert, setNewFloorLenderCert] = useState(false);
  const [newFloorRetention, setNewFloorRetention] = useState(false);
  const [newFloorVariation, setNewFloorVariation] = useState(false);
  const [newFloorDefects, setNewFloorDefects] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api('/api/ipp-progress-claim');
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
    if (filterTier && r.claim_tier !== filterTier) return false;
    if (filterType && r.claim_type !== filterType) return false;
    return true;
  }), [rows, filterStatus, filterTier, filterType]);

  async function handleAction(action: string, extraBody: Record<string, unknown> = {}) {
    if (!selected) return;
    setActionLoading(true); setActionResult(null);
    try {
      await api(`/api/ipp-progress-claim/${selected.id}/${action}`, { method: 'POST', data: extraBody });
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
    if (!newProjectId || !newClaimAmount || !newClaimType || !newTier) return;
    setCreateLoading(true);
    try {
      await api('/api/ipp-progress-claim', {
        method: 'POST',
        data: {
          project_id: newProjectId,
          project_name: newProjectName || undefined,
          claim_number: newClaimNumber || undefined,
          contractor_name: newContractorName || undefined,
          claim_type: newClaimType,
          claim_tier: newTier,
          claim_amount_zar: Number(newClaimAmount),
          claim_period_from: newPeriodFrom || undefined,
          claim_period_to: newPeriodTo || undefined,
          contractor_invoice_ref: newInvoiceRef || undefined,
          subcontractor_ref: newSubcontractorRef || undefined,
          change_order_ref: newChangeOrderRef || undefined,
          milestone_ref: newMilestoneRef || undefined,
          floor_ie_milestone_payment: newFloorIeMilestone ? 1 : 0,
          floor_lender_certification_required: newFloorLenderCert ? 1 : 0,
          floor_retention_release: newFloorRetention ? 1 : 0,
          floor_variation_included: newFloorVariation ? 1 : 0,
          floor_defects_outstanding: newFloorDefects ? 1 : 0,
        },
      });
      setShowCreate(false);
      setNewProjectId(''); setNewProjectName(''); setNewClaimNumber('');
      setNewContractorName(''); setNewClaimType('interim'); setNewTier('standard');
      setNewClaimAmount(''); setNewPeriodFrom(''); setNewPeriodTo('');
      setNewInvoiceRef(''); setNewSubcontractorRef('');
      setNewChangeOrderRef(''); setNewMilestoneRef('');
      setNewFloorIeMilestone(false); setNewFloorLenderCert(false);
      setNewFloorRetention(false); setNewFloorVariation(false); setNewFloorDefects(false);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setCreateLoading(false);
    }
  }

  const db = dashboard?.progress_claims;
  const selectedActions = selected ? (ACTIONS[selected.chain_status] ?? []) : [];
  const isSignatureCreate = newFloorIeMilestone || newFloorLenderCert;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      {db && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <KpiCard label="Pending payment" value={formatZar(db.pending_payment_count > 0 ? db.total_approved_zar : 0)} color="blue" />
          <KpiCard label="Certified this cycle" value={formatZar(db.total_certified_zar)} color="purple" />
          <KpiCard label="Disputed" value={db.disputed_count} color={db.disputed_count > 0 ? 'orange' : 'gray'} />
          <KpiCard label="Total paid to date" value={formatZar(db.total_paid_zar)} color="green" />
          <KpiCard label="SLA breached" value={db.sla_breached_count} color={db.sla_breached_count > 0 ? 'red' : 'gray'} />
          <KpiCard label="IE milestone claims" value={rows.filter(r => r.floor_ie_milestone_payment).length} color="amber" />
        </div>
      )}

      {/* W141 AI insight — disputes present */}
      {db && db.disputed_count > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-3">
          <span className="text-orange-600 text-xl mt-0.5">&#9888;</span>
          <div>
            <p className="text-sm font-semibold text-orange-900">
              {db.disputed_count} disputed payment claim{db.disputed_count !== 1 ? 's' : ''} — JBCC dispute resolution required
            </p>
            <p className="text-xs text-orange-800 mt-0.5">
              JBCC: contractor disputes must be resolved within 10 working days. W141 SIGNATURE: certify_by_engineer crosses regulator
              when IE milestone flag set — lender notification mandatory. Final account crosses regulator on ALL tiers.
              Review dispute reasons and resolve before the SLA deadline.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="text-xs border rounded px-2 py-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value as ClaimStatus | '')}>
          <option value="">All statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterTier} onChange={e => setFilterTier(e.target.value as ClaimTier | '')}>
          <option value="">All tiers</option>
          {CLAIM_TIERS.map(t => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All types</option>
          {CLAIM_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <span className="text-xs text-[#9aa5b4] ml-auto">{filtered.length} claims</span>
        {!readOnly && (
          <button type="button" className="text-xs bg-green-600 text-white rounded px-3 py-1 hover:bg-green-700" onClick={() => setShowCreate(true)}>
            + New progress claim
          </button>
        )}
        <button type="button" className="text-xs border rounded px-2 py-1 hover:bg-[#eef2f7]" onClick={load}>Refresh</button>
      </div>

      {actionResult && (
        <div className={`text-xs rounded px-3 py-2 ${actionResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {actionResult}
        </div>
      )}
      {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
      {loading && <div className="text-xs text-[#9aa5b4]">Loading progress claims…</div>}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-[#dde4ec]">
          <table className="w-full text-xs">
            <thead className="bg-[#f8fafc]">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">PCN No.</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Contractor</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Type</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Tier</th>
                <th className="text-right px-3 py-2 font-medium text-[#6b7685]">Claim ZAR</th>
                <th className="text-right px-3 py-2 font-medium text-[#6b7685]">Certified ZAR</th>
                <th className="text-right px-3 py-2 font-medium text-[#6b7685]">Approved ZAR</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Status</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">SLA</th>
                <th className="text-left px-3 py-2 font-medium text-[#6b7685]">Flags</th>
                {!readOnly && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 10 : 11} className="px-3 py-6 text-center text-[#9aa5b4]">
                    No progress claims recorded
                  </td>
                </tr>
              )}
              {filtered.map(row => {
                const delta = row.certified_amount_zar != null
                  ? row.claim_amount_zar - row.certified_amount_zar
                  : null;
                return (
                  <tr
                    key={row.id}
                    className={`border-t border-[#eef2f7] hover:bg-[#eef2f7] cursor-pointer ${row.chain_status === 'disputed' ? 'bg-red-50/30' : row.chain_status === 'suspended' ? 'bg-orange-50/30' : ''}`}
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-3 py-2 font-mono text-[#6b7685]">
                      {row.claim_number ?? row.id}
                    </td>
                    <td className="px-3 py-2 max-w-[140px]">
                      <span className="text-[#1e2a38] block truncate font-medium">{row.contractor_name ?? '—'}</span>
                      {row.project_name && <span className="text-[#9aa5b4] truncate block">{row.project_name}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {row.claim_type && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLOR[row.claim_type] ?? 'bg-[#eef2f7] text-[#3d4756]'}`}>
                          {TYPE_LABEL[row.claim_type] ?? row.claim_type}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.claim_tier && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLOR[row.claim_tier]}`}>
                          {row.claim_tier}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-[#2d3748] whitespace-nowrap">
                      {formatZar(row.claim_amount_zar)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {row.certified_amount_zar != null ? (
                        <span>
                          {formatZar(row.certified_amount_zar)}
                          {delta != null && delta > 0 && (
                            <span className="ml-1 text-amber-600 text-[9px]">-{formatZar(delta)}</span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-[#2d3748] whitespace-nowrap">
                      {formatZar(row.approved_amount_zar)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[row.chain_status]}`}>
                        {row.chain_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.sla_deadline_at && row.is_open_live ? (
                        <SlaCountdown
                          remainingHours={slaRemainingHours(row.sla_deadline_at)}
                          totalHours={row.sla_target_hours ?? SLA_HOURS_BY_TIER[row.claim_tier ?? 'standard']}
                          breached={!!row.sla_breached}
                          compact
                        />
                      ) : (
                        <span className="text-[#9aa5b4] text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {!!row.floor_ie_milestone_payment && (
                          <Flag label="IE" title="IE milestone payment required" cls="bg-red-100 text-red-800" />
                        )}
                        {!!row.floor_lender_certification_required && (
                          <Flag label="LDR" title="Lender certification required" cls="bg-purple-100 text-purple-800" />
                        )}
                        {!!row.floor_retention_release && (
                          <Flag label="RET" title="Retention being released" cls="bg-teal-100 text-teal-700" />
                        )}
                        {!!row.floor_variation_included && (
                          <Flag label="VAR" title="Variation amounts included" cls="bg-amber-100 text-amber-700" />
                        )}
                        {!!row.floor_defects_outstanding && (
                          <Flag label="DEF" title="Outstanding defects may reduce payment" cls="bg-orange-100 text-orange-700" />
                        )}
                        {!!row.sla_breached && (
                          <Flag label="SLA!" title="SLA breached" cls="bg-red-200 text-red-900" />
                        )}
                        {!!row.is_reportable && (
                          <Flag label="RPT" title="Regulator notified" cls="bg-[oklch(0.94_0.008_250)] text-[oklch(0.40_0.009_250)]" />
                        )}
                      </div>
                    </td>
                    {!readOnly && (
                      <td className="px-3 py-2">
                        <button type="button" className="text-[10px] text-[oklch(0.46_0.16_55)] hover:underline" onClick={e => { e.stopPropagation(); setSelected(row); }}>
                          Open
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }} className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#0f1c2e]">
                  {selected.claim_number ?? selected.id}
                  {selected.contractor_name && (
                    <span className="ml-2 text-sm text-[#6b7685] font-normal">· {selected.contractor_name}</span>
                  )}
                </h2>
                {selected.project_name && (
                  <p className="text-xs text-[#9aa5b4]">{selected.project_name}</p>
                )}
              </div>
              <button type="button" className="text-[#9aa5b4] hover:text-[#3d4756] text-xl" onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* Chain state bar */}
            <ChainStateBar
              allStates={MAIN_STATES as string[]}
              currentState={selected.chain_status}
              branchStates={BRANCH_STATES as string[]}
            />

            {/* SLA */}
            {selected.sla_deadline_at && selected.is_open_live && (
              <SlaCountdown
                remainingHours={slaRemainingHours(selected.sla_deadline_at)}
                totalHours={selected.sla_target_hours ?? SLA_HOURS_BY_TIER[selected.claim_tier ?? 'standard']}
                breached={!!selected.sla_breached}
              />
            )}

            {/* SIGNATURE alert */}
            {selected.chain_status === 'pm_review' && !!selected.floor_ie_milestone_payment && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
                <p className="text-xs font-bold text-red-900">W141 SIGNATURE: IE milestone payment</p>
                <p className="text-xs text-red-800 mt-0.5">
                  certify_by_engineer on this claim will cross regulator on ALL tiers (REIPPPP + Equator EP4 mandatory lender notification).
                </p>
              </div>
            )}

            {/* Financial summary */}
            <div className="rounded-lg border border-[#dde4ec] p-4">
              <h3 className="text-xs font-semibold text-[#2d3748] mb-3">Financial summary</h3>
              <table className="w-full text-xs">
                <tbody>
                  <FinancialRow label="Claim submitted" value={formatZar(selected.claim_amount_zar)} />
                  <FinancialRow label="QS assessed" value={formatZar(selected.qs_assessed_zar)} />
                  <FinancialRow label="IE/Engineer certified" value={formatZar(selected.certified_amount_zar)} />
                  <FinancialRow label="Approved amount" value={formatZar(selected.approved_amount_zar)} />
                  <FinancialRow label="Retention held" value={formatZar(selected.retention_amount_zar)} />
                  <FinancialRow label="VAT" value={formatZar(selected.vat_amount_zar)} />
                  <FinancialRow label="Net payable" value={formatZar(selected.net_payable_zar)} highlight />
                  {selected.previous_certified_total_zar != null && (
                    <FinancialRow label="Previous certified total" value={formatZar(selected.previous_certified_total_zar)} />
                  )}
                  {selected.this_period_zar != null && (
                    <FinancialRow label="This period certified" value={formatZar(selected.this_period_zar)} highlight />
                  )}
                </tbody>
              </table>
              {selected.contract_completion_pct != null && (
                <div className="mt-3">
                  <div className="text-xs text-[#6b7685] mb-1">Contract completion: {selected.contract_completion_pct.toFixed(1)}%</div>
                  <div className="w-full bg-[#eef2f7] rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${Math.min(100, selected.contract_completion_pct)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            {(selected.qs_notes || selected.pm_notes || selected.engineer_certification_notes) && (
              <div className="space-y-2">
                {selected.qs_notes && (
                  <div className="text-xs bg-[oklch(0.97_0.003_250)] rounded p-2">
                    <span className="font-semibold text-[oklch(0.40_0.009_250)]">QS notes:</span>
                    <span className="ml-1 text-[oklch(0.46_0.16_55)]">{selected.qs_notes}</span>
                  </div>
                )}
                {selected.pm_notes && (
                  <div className="text-xs bg-[oklch(0.97_0.003_250)] rounded p-2">
                    <span className="font-semibold text-[oklch(0.40_0.009_250)]">PM notes:</span>
                    <span className="ml-1 text-[oklch(0.46_0.16_55)]">{selected.pm_notes}</span>
                  </div>
                )}
                {selected.engineer_certification_notes && (
                  <div className="text-xs bg-violet-50 rounded p-2">
                    <span className="font-semibold text-violet-800">Engineer cert notes:</span>
                    <span className="ml-1 text-violet-700">{selected.engineer_certification_notes}</span>
                  </div>
                )}
              </div>
            )}

            {/* Reasons */}
            {selected.dispute_reason && (
              <div className="text-xs bg-red-50 border border-red-200 rounded p-2">
                <span className="font-semibold text-red-800">Dispute reason:</span>
                <span className="ml-1 text-red-700">{selected.dispute_reason}</span>
              </div>
            )}
            {selected.rejection_reason && (
              <div className="text-xs bg-red-100 border border-red-300 rounded p-2">
                <span className="font-semibold text-red-900">Rejection reason:</span>
                <span className="ml-1 text-red-800">{selected.rejection_reason}</span>
              </div>
            )}
            {selected.suspension_reason && (
              <div className="text-xs bg-orange-50 border border-orange-200 rounded p-2">
                <span className="font-semibold text-orange-800">Suspension reason:</span>
                <span className="ml-1 text-orange-700">{selected.suspension_reason}</span>
              </div>
            )}

            {/* Cross-refs */}
            {(selected.change_order_ref || selected.milestone_ref || selected.drawdown_ref || selected.subcontractor_ref) && (
              <div className="flex flex-wrap gap-2 text-xs text-[#6b7685]">
                {selected.change_order_ref && <span className="rounded bg-[#eef2f7] px-2 py-0.5">CO: {selected.change_order_ref}</span>}
                {selected.milestone_ref && <span className="rounded bg-[#eef2f7] px-2 py-0.5">Milestone: {selected.milestone_ref}</span>}
                {selected.drawdown_ref && <span className="rounded bg-[#eef2f7] px-2 py-0.5">Drawdown: {selected.drawdown_ref}</span>}
                {selected.subcontractor_ref && <span className="rounded bg-[#eef2f7] px-2 py-0.5">Subcontractor: {selected.subcontractor_ref}</span>}
              </div>
            )}

            {/* Floor flags summary */}
            <div className="flex flex-wrap gap-2">
              {!!selected.floor_ie_milestone_payment && <Flag label="IE milestone" title="IE must certify milestone completion" cls="bg-red-100 text-red-800" />}
              {!!selected.floor_lender_certification_required && <Flag label="Lender certification required" title="Lender/IE milestone cert required" cls="bg-purple-100 text-purple-800" />}
              {!!selected.floor_retention_release && <Flag label="Retention release" title="Retention being released (partial or full)" cls="bg-teal-100 text-teal-700" />}
              {!!selected.floor_variation_included && <Flag label="Variation included" title="Variation amounts — QS verification required" cls="bg-amber-100 text-amber-700" />}
              {!!selected.floor_defects_outstanding && <Flag label="Defects outstanding" title="Outstanding defects may reduce payment" cls="bg-orange-100 text-orange-700" />}
            </div>

            {/* Actions */}
            {!readOnly && selectedActions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#3d4756]">Actions</p>
                <div className="flex flex-wrap gap-2">
                  {selectedActions.map(({ action, label, danger }) => (
                    <button type="button"
                      key={action}
                      disabled={actionLoading}
                      onClick={() => handleAction(action)}
                      className={`text-xs rounded px-3 py-1.5 font-medium disabled:opacity-50 ${
                        danger
                          ? 'bg-red-100 text-red-800 hover:bg-red-200'
                          : 'bg-[#c2873a] text-white hover:bg-[#a3702f]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {actionResult && (
                  <p className={`text-xs ${actionResult.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
                    {actionResult}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }} className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#0f1c2e]">New progress claim (PCN)</h2>
              <button type="button" className="text-[#9aa5b4] hover:text-[#3d4756] text-xl" onClick={() => setShowCreate(false)}>✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Project ID *</span>
                <input className="border rounded px-2 py-1.5" value={newProjectId} onChange={e => setNewProjectId(e.target.value)} placeholder="kakamas-500mw" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Project name</span>
                <input className="border rounded px-2 py-1.5" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Claim number</span>
                <input className="border rounded px-2 py-1.5" value={newClaimNumber} onChange={e => setNewClaimNumber(e.target.value)} placeholder="K500-PCN-013 (auto-generated if blank)" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Contractor name</span>
                <input className="border rounded px-2 py-1.5" value={newContractorName} onChange={e => setNewContractorName(e.target.value)} placeholder="Powercon SA" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Claim type *</span>
                <select className="border rounded px-2 py-1.5" value={newClaimType} onChange={e => setNewClaimType(e.target.value)}>
                  {CLAIM_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Tier *</span>
                <select className="border rounded px-2 py-1.5" value={newTier} onChange={e => setNewTier(e.target.value as ClaimTier)}>
                  {CLAIM_TIERS.map(t => (
                    <option key={t} value={t}>{TIER_LABEL[t]} — {SLA_HOURS_BY_TIER[t]}h SLA</option>
                  ))}
                </select>
                <span className="text-[10px] text-[#9aa5b4] italic">Larger claims get more review time (INVERTED SLA)</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Claim amount ZAR *</span>
                <input type="number" className="border rounded px-2 py-1.5" value={newClaimAmount} onChange={e => setNewClaimAmount(e.target.value)} placeholder="4500000" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Invoice reference</span>
                <input className="border rounded px-2 py-1.5" value={newInvoiceRef} onChange={e => setNewInvoiceRef(e.target.value)} placeholder="INV-2026-0042" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Claim period from</span>
                <input type="date" className="border rounded px-2 py-1.5" value={newPeriodFrom} onChange={e => setNewPeriodFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Claim period to</span>
                <input type="date" className="border rounded px-2 py-1.5" value={newPeriodTo} onChange={e => setNewPeriodTo(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Subcontractor ref</span>
                <input className="border rounded px-2 py-1.5" value={newSubcontractorRef} onChange={e => setNewSubcontractorRef(e.target.value)} placeholder="sub-001" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Change order ref</span>
                <input className="border rounded px-2 py-1.5" value={newChangeOrderRef} onChange={e => setNewChangeOrderRef(e.target.value)} placeholder="CO-017" />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-[#3d4756] font-medium">Milestone ref</span>
                <input className="border rounded px-2 py-1.5" value={newMilestoneRef} onChange={e => setNewMilestoneRef(e.target.value)} placeholder="MS-04 Mechanical complete" />
              </label>
            </div>

            {/* Floor flags */}
            <div className="space-y-2 pt-2 border-t border-[#eef2f7]">
              <p className="text-xs font-medium text-[#3d4756]">Payment flags</p>
              <div className="grid grid-cols-2 gap-2">
                <CheckRow
                  label="IE milestone payment required"
                  checked={newFloorIeMilestone}
                  onChange={setNewFloorIeMilestone}
                  warningLabel="Crosses regulator on certification"
                />
                <CheckRow
                  label="Lender certification required"
                  checked={newFloorLenderCert}
                  onChange={setNewFloorLenderCert}
                  warningLabel="Crosses on approval"
                />
                <CheckRow label="Retention release" checked={newFloorRetention} onChange={setNewFloorRetention} />
                <CheckRow
                  label="Variation amounts included"
                  checked={newFloorVariation}
                  onChange={setNewFloorVariation}
                  warningLabel="QS verification required"
                />
                <CheckRow
                  label="Outstanding defects"
                  checked={newFloorDefects}
                  onChange={setNewFloorDefects}
                  warningLabel="May reduce net payable"
                />
              </div>
            </div>

            {isSignatureCreate && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                W141 SIGNATURE flag set — certify_by_engineer (IE milestone) and/or approve_payment (lender cert) will notify regulator on ALL tiers.
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-[#eef2f7]">
              <button type="button" className="text-xs border rounded px-3 py-1.5" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="button"
                className="text-xs bg-green-600 text-white rounded px-4 py-1.5 hover:bg-green-700 disabled:opacity-50"
                disabled={createLoading || !newProjectId || !newClaimAmount || !newClaimType || !newTier}
                onClick={handleCreate}
              >
                {createLoading ? 'Creating…' : 'Create progress claim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
