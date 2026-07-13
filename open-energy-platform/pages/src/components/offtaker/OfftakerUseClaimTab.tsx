import { useState, useEffect } from 'react';
import { statusLabel } from '../../meridian/ease/statusLabel';

interface UseClaim {
  id: string;
  offtaker_id: string;
  grid_operator_id: string;
  event_date: string;
  customer_category: string;
  unserved_mwh: number;
  claimed_amount_zar: number;
  settlement_amount_zar: number | null;
  nrs048_reference: string | null;
  load_shedding_stage: number | null;
  chain_status: string;
  sla_deadline: string | null;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface UseClaimKpis {
  active_claims: number;
  total_claimed_zar: number;
  total_settled_zar: number;
  avg_resolution_days: number | null;
}

// ─── Status meta ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  claim_submitted:       'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #3d4756)]',
  metering_data_verified:'bg-[var(--s2, oklch(0.94_0.006_250))] text-[var(--accent, oklch(0.46_0.16_55))]',
  liability_assessed:    'bg-[var(--s2, oklch(0.94_0.006_250))] text-[var(--accent, oklch(0.46_0.16_55))]',
  preliminary_quantum:   'bg-cyan-100 text-cyan-700',
  grid_operator_response:'bg-amber-100 text-amber-700',
  negotiation:           'bg-purple-100 text-purple-700',
  settlement_offer:      'bg-teal-100 text-teal-700',
  claim_settled:         'bg-green-100 text-green-700',
  claim_disputed:        'bg-orange-100 text-orange-700',
  formal_adjudication:   'bg-red-100 text-red-700',
  award_made:            'bg-green-100 text-green-800',
  claim_withdrawn:       'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #9aa5b4)]',
};

const STATUS_LABELS: Record<string, string> = {
  claim_submitted:       'Claim Submitted',
  metering_data_verified:'Metering Data Verified',
  liability_assessed:    'Liability Assessed',
  preliminary_quantum:   'Preliminary Quantum',
  grid_operator_response:'Grid Operator Response',
  negotiation:           'Negotiation',
  settlement_offer:      'Settlement Offer',
  claim_settled:         'Claim Settled',
  claim_disputed:        'Claim Disputed',
  formal_adjudication:   'Formal Adjudication',
  award_made:            'Award Made',
  claim_withdrawn:       'Claim Withdrawn',
};

// ─── Category badges ──────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  industrial:  'bg-red-100 text-red-700',
  commercial:  'bg-amber-100 text-amber-700',
  municipal:   'bg-[var(--s2, oklch(0.94_0.006_250))] text-[var(--accent, oklch(0.46_0.16_55))]',
  residential: 'bg-green-100 text-green-700',
  scheduled:   'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]',
};

const CATEGORY_LABELS: Record<string, string> = {
  industrial:  'Industrial',
  commercial:  'Commercial',
  municipal:   'Municipal',
  residential: 'Residential',
  scheduled:   'Scheduled',
};

// ─── Actions per state ────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set([
  'claim_settled',
  'award_made',
  'claim_withdrawn',
]);

const STATUSES    = Object.keys(STATUS_LABELS);
const CATEGORIES  = Object.keys(CATEGORY_LABELS);

interface ActionDef {
  name: string;
  label: string;
  variant?: 'danger' | 'warn' | 'success';
}

const ACTION_LABELS: Record<string, string> = {
  verify_metering_data:   'Verify Metering Data',
  assess_liability:       'Assess Liability',
  determine_quantum:      'Determine Quantum',
  submit_grid_response:   'Submit Grid Response',
  enter_negotiation:      'Enter Negotiation',
  make_settlement_offer:  'Make Settlement Offer',
  accept_settlement:      'Accept Settlement',
  dispute_claim:          'Dispute Claim',
  commence_adjudication:  'Commence Adjudication',
  make_award:             'Make Award',
};

function getActions(item: UseClaim): ActionDef[] {
  if (HARD_TERMINALS.has(item.chain_status)) return [];
  switch (item.chain_status) {
    case 'claim_submitted':
      return [
        { name: 'verify_metering_data', label: ACTION_LABELS.verify_metering_data, variant: 'success' },
      ];
    case 'metering_data_verified':
      return [
        { name: 'assess_liability', label: ACTION_LABELS.assess_liability, variant: 'success' },
      ];
    case 'liability_assessed':
      return [
        { name: 'determine_quantum', label: ACTION_LABELS.determine_quantum, variant: 'success' },
      ];
    case 'preliminary_quantum':
      return [
        { name: 'submit_grid_response',  label: ACTION_LABELS.submit_grid_response                    },
        { name: 'dispute_claim',         label: ACTION_LABELS.dispute_claim,        variant: 'warn'   },
      ];
    case 'grid_operator_response':
      return [
        { name: 'enter_negotiation',    label: ACTION_LABELS.enter_negotiation,   variant: 'success' },
        { name: 'make_settlement_offer',label: ACTION_LABELS.make_settlement_offer                   },
        { name: 'dispute_claim',        label: ACTION_LABELS.dispute_claim,       variant: 'warn'    },
      ];
    case 'negotiation':
      return [
        { name: 'make_settlement_offer',  label: ACTION_LABELS.make_settlement_offer, variant: 'success' },
        { name: 'commence_adjudication',  label: ACTION_LABELS.commence_adjudication, variant: 'warn'    },
      ];
    case 'settlement_offer':
      return [
        { name: 'accept_settlement',     label: ACTION_LABELS.accept_settlement,    variant: 'success' },
        { name: 'dispute_claim',         label: ACTION_LABELS.dispute_claim,        variant: 'warn'    },
      ];
    case 'claim_disputed':
      return [
        { name: 'enter_negotiation',    label: ACTION_LABELS.enter_negotiation,   variant: 'success' },
        { name: 'commence_adjudication',label: ACTION_LABELS.commence_adjudication, variant: 'warn'  },
      ];
    case 'formal_adjudication':
      return [
        { name: 'make_award',           label: ACTION_LABELS.make_award,          variant: 'success' },
        { name: 'commence_adjudication',label: ACTION_LABELS.commence_adjudication                   },
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

function fmtZar(val: number | null | undefined): string {
  if (val == null) return '—';
  return `R ${val.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMwh(val: number | null | undefined): string {
  if (val == null) return '—';
  return `${val.toLocaleString('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MWh`;
}

function truncate(s: string, n = 24): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
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

export function OfftakerUseClaimTab() {
  const [items, setItems]               = useState<UseClaim[]>([]);
  const [kpis, setKpis]                 = useState<UseClaimKpis | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [page, setPage]                 = useState(1);

  // Detail drawer
  const [detailItem, setDetailItem] = useState<UseClaim | null>(null);

  // Action modal
  const [actionItem, setActionItem]         = useState<UseClaim | null>(null);
  const [selectedAction, setSelectedAction] = useState('');
  const [actionReason, setActionReason]     = useState('');
  const [actionSettlement, setActionSettlement] = useState('');
  const [actionLoading, setActionLoading]   = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);

  async function load(
    status   = filterStatus,
    category = filterCategory,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status)   params.set('status', status);
      if (category) params.set('customer_category', category);
      const res = await fetch(`/api/unserved-energy-claims?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as {
        success: boolean;
        data?: UseClaim[];
        kpis?: UseClaimKpis;
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

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeClaims      = kpis?.active_claims ?? items.filter(i => !HARD_TERMINALS.has(i.chain_status)).length;
  const totalClaimedZar   = kpis?.total_claimed_zar  ?? 0;
  const totalSettledZar   = kpis?.total_settled_zar  ?? 0;
  const avgResolutionDays = kpis?.avg_resolution_days;

  // ─── Action handlers ────────────────────────────────────────────────────────

  function openActionPicker(item: UseClaim) {
    const actions = getActions(item);
    if (actions.length === 0) return;
    setActionItem(item);
    setSelectedAction(actions[0].name);
    setActionReason('');
    setActionSettlement('');
    setActionError(null);
  }

  function closeAction() {
    setActionItem(null);
    setSelectedAction('');
    setActionReason('');
    setActionSettlement('');
    setActionError(null);
  }

  async function submitAction() {
    if (!actionItem || !selectedAction) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { action: selectedAction };
      if (actionReason.trim()) body.reason = actionReason.trim();
      if (
        (selectedAction === 'accept_settlement' || selectedAction === 'make_award') &&
        actionSettlement.trim()
      ) {
        body.settlement_amount_zar = parseFloat(actionSettlement.trim());
      }

      const res = await fetch(`/api/unserved-energy-claims/${actionItem.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j?.error ?? `HTTP ${res.status}`);
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
  const needsSettlementAmt = selectedAction === 'accept_settlement' || selectedAction === 'make_award';

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip
          label="Active Claims"
          value={activeClaims}
          mode={activeClaims > 0 ? 'alert' : 'neutral'}
        />
        <KpiChip
          label="Total Claimed"
          value={fmtZar(totalClaimedZar)}
          mode={totalClaimedZar > 0 ? 'alert' : 'neutral'}
        />
        <KpiChip
          label="Total Settled"
          value={fmtZar(totalSettledZar)}
          mode={totalSettledZar > 0 ? 'good' : 'neutral'}
        />
        <KpiChip
          label="Avg Resolution"
          value={avgResolutionDays != null ? `${avgResolutionDays.toFixed(1)}d` : '—'}
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
      </div>

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
                <th className="pb-2 pr-3">Event Date</th>
                <th className="pb-2 pr-3">Category</th>
                <th className="pb-2 pr-3">MWh</th>
                <th className="pb-2 pr-3">Claimed</th>
                <th className="pb-2 pr-3">Settled</th>
                <th className="pb-2 pr-3">Stage</th>
                <th className="pb-2 pr-3">Status</th>
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
                    className="border-b hover:bg-[var(--s2, #eef2f7)] cursor-pointer"
                    onClick={() => setDetailItem(item)}
                  >
                    <td className="py-2 pr-3 text-xs tabular-nums text-[var(--ink, #2d3748)]">
                      {fmtDate(item.event_date).text}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[item.customer_category] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {CATEGORY_LABELS[item.customer_category] ?? item.customer_category}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[var(--ink, #2d3748)]">
                      {fmtMwh(item.unserved_mwh)}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[var(--ink, #2d3748)]">
                      {fmtZar(item.claimed_amount_zar)}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[var(--ink, #2d3748)]">
                      {item.settlement_amount_zar != null
                        ? <span className="text-green-700 font-medium">{fmtZar(item.settlement_amount_zar)}</span>
                        : <span className="text-[var(--ink-2, #9aa5b4)]">—</span>
                      }
                    </td>
                    <td className="py-2 pr-3 text-xs text-center tabular-nums text-[var(--ink-2, #3d4756)]">
                      {item.load_shedding_stage != null
                        ? <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-semibold">S{item.load_shedding_stage}</span>
                        : <span className="text-[var(--ink-2, #9aa5b4)]">—</span>
                      }
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[item.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                        {STATUS_LABELS[item.chain_status] ?? statusLabel(item.chain_status).text}
                      </span>
                      {item.sla_breached === 1 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600 font-semibold">SLA</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums">
                      <span className={due.isPast ? 'text-red-600 font-medium' : 'text-[var(--ink-2, #3d4756)]'}>
                        {due.text}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      {item.regulator_notified === 1 ? (
                        <span title="Regulator notified" className="text-orange-500 text-base leading-none">&#9873;</span>
                      ) : (
                        <span className="text-[var(--border-subtle, #e8ecf0)] text-base leading-none">&#9873;</span>
                      )}
                    </td>
                    <td
                      className="py-2 pr-3"
                      onClick={e => e.stopPropagation()}
                    >
                      {actions.length > 0 && (
                        <button type="button"
                          onClick={() => openActionPicker(item)}
                          className="px-2 py-0.5 text-xs rounded border" style={{ background: 'var(--s2, oklch(0.94 0.006 250))', color: 'var(--accent, oklch(0.46 0.16 55))', borderColor: 'var(--border-subtle, oklch(0.87 0.010 250))' }}
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
                  <td colSpan={10} className="py-10 text-center text-[var(--ink-2, #9aa5b4)] text-sm">
                    No unserved energy claims found
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
                <div className="text-sm font-semibold text-[var(--ink, #1e2a38)]">
                  Unserved Energy Claim
                </div>
                <div className="text-xs text-[var(--ink-2, #6b7685)] mt-0.5">
                  {CATEGORY_LABELS[detailItem.customer_category] ?? detailItem.customer_category}
                  {detailItem.nrs048_reference && <> &nbsp;&middot;&nbsp; {detailItem.nrs048_reference}</>}
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
              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[detailItem.chain_status] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                  {STATUS_LABELS[detailItem.chain_status] ?? statusLabel(detailItem.chain_status).text}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[detailItem.customer_category] ?? 'bg-[var(--s2, #eef2f7)] text-[var(--ink-2, #6b7685)]'}`}>
                  {CATEGORY_LABELS[detailItem.customer_category] ?? detailItem.customer_category}
                </span>
                {detailItem.sla_breached === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">SLA Breached</span>
                )}
                {detailItem.regulator_notified === 1 && (
                  <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-semibold">Regulator Notified</span>
                )}
                {detailItem.load_shedding_stage != null && (
                  <span className="px-2 py-0.5 rounded text-xs bg-orange-50 text-orange-700 font-semibold">
                    Stage {detailItem.load_shedding_stage}
                  </span>
                )}
              </div>

              {/* Financial summary */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg border border-[var(--border-subtle, #dde4ec)] p-2">
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Unserved</div>
                  <div className="font-semibold text-[var(--ink, #1e2a38)]">{fmtMwh(detailItem.unserved_mwh)}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle, #dde4ec)] p-2">
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Claimed</div>
                  <div className="font-semibold text-[var(--ink, #1e2a38)]">{fmtZar(detailItem.claimed_amount_zar)}</div>
                </div>
                <div className={`rounded-lg border p-2 ${detailItem.settlement_amount_zar != null ? 'border-green-200 bg-green-50' : 'border-[var(--border-subtle, #dde4ec)]'}`}>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Settled</div>
                  <div className={`font-semibold ${detailItem.settlement_amount_zar != null ? 'text-green-700' : 'text-[var(--ink-2, #9aa5b4)]'}`}>
                    {fmtZar(detailItem.settlement_amount_zar)}
                  </div>
                </div>
              </div>

              {/* Core fields */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Event Date</div>
                  <div className="text-[var(--ink, #1e2a38)]">{fmtDate(detailItem.event_date).text}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">SLA Deadline</div>
                  <div className={`tabular-nums ${fmtDate(detailItem.sla_deadline).isPast ? 'text-red-600 font-medium' : 'text-[var(--ink, #1e2a38)]'}`}>
                    {fmtDate(detailItem.sla_deadline).text}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">NRS 048-2 Ref</div>
                  <div className="text-[var(--ink, #2d3748)] font-mono text-[11px]">{detailItem.nrs048_reference ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Regulator Notified</div>
                  <div className={detailItem.regulator_notified === 1 ? 'text-orange-600 font-medium' : 'text-[var(--ink-2, #9aa5b4)]'}>
                    {detailItem.regulator_notified === 1 ? 'Yes' : 'No'}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Offtaker ID</div>
                  <div className="font-mono text-[var(--ink-2, #3d4756)] break-all">{detailItem.offtaker_id}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[var(--ink-2, #9aa5b4)] mb-0.5">Grid Operator ID</div>
                  <div className="font-mono text-[var(--ink-2, #3d4756)] break-all">{detailItem.grid_operator_id}</div>
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

              {/* Reason */}
              {detailItem.reason && (
                <div>
                  <div className="text-xs text-[var(--ink-2, #9aa5b4)] mb-1">Reason / Notes</div>
                  <div className="text-xs text-[var(--ink, #2d3748)] bg-[var(--s1, #f8fafc)] rounded p-2 border whitespace-pre-wrap">
                    {detailItem.reason}
                  </div>
                </div>
              )}

              {/* Actions section */}
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
                    This claim is in a terminal state — no further actions are available.
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
            <div className="text-sm font-semibold text-[var(--ink, #1e2a38)] mb-1">USE Claim Action</div>
            <div className="text-xs text-[var(--ink-2, #6b7685)] mb-4">
              {CATEGORY_LABELS[actionItem.customer_category] ?? actionItem.customer_category}
              {' '}—{' '}
              {fmtZar(actionItem.claimed_amount_zar)}
              {' '}—{' '}
              {STATUS_LABELS[actionItem.chain_status] ?? actionItem.chain_status}
            </div>

            <div className="mb-3">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Action *</label>
              <select
                value={selectedAction}
                onChange={e => { setSelectedAction(e.target.value); setActionSettlement(''); }}
                className="w-full border rounded px-2 py-1 text-xs bg-surface-v2"
              >
                {modalActions.map(a => (
                  <option key={a.name} value={a.name}>{a.label}</option>
                ))}
              </select>
            </div>

            {needsSettlementAmt && (
              <div className="mb-3">
                <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Settlement Amount (ZAR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={actionSettlement}
                  onChange={e => setActionSettlement(e.target.value)}
                  placeholder="e.g. 297000"
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs text-[var(--ink-2, #3d4756)] mb-1">Reason (optional)</label>
              <textarea
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="Brief reason or reference"
                rows={2}
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

export default OfftakerUseClaimTab;
