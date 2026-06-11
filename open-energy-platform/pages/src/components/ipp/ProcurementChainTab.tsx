// Wave 19 — IPP procurement / RFP chain tab.
//
// 12-state P6 chain layered on oe_procurement_rfps. Per-capex-tier SLA tiering
// (high R≥500m / medium R50-500m / low <R50m). High-tier award + dispute +
// SLA-breach cross into regulator inbox per REIPPPP transparency mandate.
//
//   • KPI strip: total / high open / in_market / awarded value / breached / escalated / disputed
//   • Filter pills by chain state + tier + breached/escalated
//   • Listing with tier pill + state pill + SLA countdown
//   • Drill-down: timeline + per-state action buttons + dispute / resolve / cancel

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'draft' | 'published' | 'bidding' | 'bid_closed' | 'evaluation'
  | 'shortlisted' | 'awarded' | 'contracted' | 'delivered'
  | 'rejected' | 'cancelled' | 'disputed';

type Tier = 'high' | 'medium' | 'low';

interface RfpRow {
  [key: string]: unknown;
  id: string;
  rfp_number: string;
  project_id: string | null;
  participant_id: string;
  title: string;
  description: string | null;
  category: string;
  capex_tier: Tier;
  capex_estimate_zar: number | null;
  currency: string;
  chain_status: ChainStatus;
  start_at: string | null;
  bid_open_at: string | null;
  bid_close_at: string | null;
  delivery_due_at: string | null;
  award_to: string | null;
  award_name: string | null;
  award_amount_zar: number | null;
  awarded_at: string | null;
  contracted_at: string | null;
  delivered_at: string | null;
  rejection_reason: string | null;
  dispute_notes: string | null;
  evaluation_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  sla_breached?: boolean;
  minutes_until_sla?: number | null;
  is_terminal?: boolean;
  created_at: string;
}

interface KpiType {
  total: number;
  high_open: number;
  breached: number;
  escalated: number;
  in_market: number;
  awarded_count: number;
  total_award_value: number;
  disputed: number;
  post_award_due: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'draft', 'published', 'bidding', 'bid_closed', 'evaluation',
  'shortlisted', 'awarded', 'contracted', 'delivered',
];
const BRANCH_STATES: readonly string[] = [
  'rejected', 'cancelled', 'disputed',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',      label: 'Active' },
  { key: 'all',         label: 'All' },
  { key: 'high',        label: 'High tier' },
  { key: 'medium',      label: 'Medium tier' },
  { key: 'low',         label: 'Low tier' },
  { key: 'breached',    label: 'SLA breached' },
  { key: 'escalated',   label: 'Escalated' },
  { key: 'draft',       label: 'Draft' },
  { key: 'published',   label: 'Published' },
  { key: 'bidding',     label: 'Bidding' },
  { key: 'bid_closed',  label: 'Bid closed' },
  { key: 'evaluation',  label: 'Evaluation' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'awarded',     label: 'Awarded' },
  { key: 'contracted',  label: 'Contracted' },
  { key: 'delivered',   label: 'Delivered' },
  { key: 'rejected',    label: 'Rejected' },
  { key: 'cancelled',   label: 'Cancelled' },
  { key: 'disputed',    label: 'Disputed' },
];

// ── format helpers ────────────────────────────────────────────────────────
function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (n >= 1_000_000)     return `R${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000)         return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: RfpRow): ChainAction[] {
  const actions: ChainAction[] = [];

  // Primary forward action per state
  switch (row.chain_status) {
    case 'draft':
      actions.push({
        key: 'publish',
        label: 'Publish RFP',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'published':
      actions.push({
        key: 'open-bids',
        label: 'Open bid window',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'bidding':
      actions.push({
        key: 'close-bids',
        label: 'Close bidding',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'bid_closed':
      actions.push({
        key: 'begin-evaluation',
        label: 'Begin evaluation',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'evaluation':
      actions.push({
        key: 'shortlist',
        label: 'Move to shortlist',
        fields: [],
        cascadeTo: [],
      });
      // reject-all available in evaluation
      actions.push({
        key: 'reject-all',
        label: 'Reject all bids',
        fields: [
          {
            key: 'reason',
            label: 'Reason for rejecting all bids',
            type: 'textarea',
            required: true,
          },
        ],
        // high-tier award/dispute/SLA crosses regulator per REIPPPP; reject-all crosses for high tier
        cascadeTo: row.capex_tier === 'high' ? ['regulator'] : [],
      });
      break;
    case 'shortlisted':
      // award: crosses regulator for high tier per REIPPPP
      actions.push({
        key: 'award',
        label: 'Award contract',
        fields: [
          {
            key: 'award_name',
            label: 'Vendor / award party name',
            type: 'text',
            required: true,
          },
          {
            key: 'award_amount_zar',
            label: 'Award amount in ZAR (e.g. 1380000000)',
            type: 'number',
            required: true,
          },
        ],
        cascadeTo: row.capex_tier === 'high' ? ['regulator'] : [],
      });
      break;
    case 'awarded':
      actions.push({
        key: 'sign-contract',
        label: 'Sign contract',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'contracted':
      actions.push({
        key: 'mark-delivered',
        label: 'Mark delivered',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'disputed':
      actions.push({
        key: 'resolve',
        label: 'Resolve dispute',
        fields: [],
        // dispute resolution for high-tier crosses regulator
        cascadeTo: row.capex_tier === 'high' ? ['regulator'] : [],
      });
      break;
    default:
      break;
  }

  // dispute: available on non-terminal, non-cancelled states (except contracted/delivered/rejected/cancelled)
  const canDispute = ['published', 'bidding', 'bid_closed', 'evaluation', 'shortlisted', 'awarded', 'contracted'].includes(row.chain_status);
  if (canDispute) {
    actions.push({
      key: 'dispute',
      label: 'Open dispute',
      fields: [
        {
          key: 'dispute_notes',
          label: 'Dispute notes',
          type: 'textarea',
          required: true,
        },
      ],
      // dispute crosses regulator for high tier per REIPPPP transparency
      cascadeTo: row.capex_tier === 'high' ? ['regulator'] : [],
    });
  }

  // cancel: available unless contracted/delivered/rejected/cancelled
  const canCancel = !['contracted', 'delivered', 'rejected', 'cancelled'].includes(row.chain_status);
  if (canCancel) {
    actions.push({
      key: 'cancel',
      label: 'Cancel RFP',
      fields: [
        {
          key: 'reason',
          label: 'Reason for cancel',
          type: 'textarea',
          required: true,
        },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: RfpRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="State"        value={row.chain_status} />
      <DetailPair label="Capex tier"   value={row.capex_tier === 'high' ? 'High (≥R500m)' : row.capex_tier === 'medium' ? 'Medium (R50-500m)' : 'Low (<R50m)'} />
      <DetailPair label="Capex est."   value={fmtZar(row.capex_estimate_zar)} />
      <DetailPair label="Category"     value={row.category} />
      <DetailPair label="Bid open"     value={fmtDate(row.bid_open_at)} />
      <DetailPair label="Bid close"    value={fmtDate(row.bid_close_at)} />
      <DetailPair label="Delivery due" value={fmtDate(row.delivery_due_at)} />
      <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"   value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Escalation"   value={String(row.escalation_level)} />
      <DetailPair label="Award party"  value={row.award_name ?? '—'} />
      <DetailPair label="Award amount" value={fmtZar(row.award_amount_zar)} />
      {row.description && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Description</div>
          <div style={{ color: TX2 }}>{row.description}</div>
        </div>
      )}
      {row.rejection_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Rejection reason</div>
          <div style={{ color: BAD }}>{row.rejection_reason}</div>
        </div>
      )}
      {row.dispute_notes && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Dispute notes</div>
          <div style={{ color: BAD, whiteSpace: 'pre-wrap' }}>{row.dispute_notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function ProcurementChainTab() {
  const [rows, setRows] = useState<RfpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get<{ data: { items: RfpRow[] } }>('/ipp/procurement-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load RFPs');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      // award action needs award_to mirrored from award_name
      const body: Record<string, string | number> = { ...values };
      if (key === 'award' && values.award_name) {
        body.award_to = values.award_name;
        if (values.award_amount_zar) {
          body.award_amount_zar = Number(String(values.award_amount_zar).replace(/[^\d.]/g, ''));
        }
      }
      await api.post(`/ipp/procurement-chain/${rowId}/${key}`, body);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/procurement-chain/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/procurement-chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all')       return true;
      if (filter === 'active')    return !['delivered', 'rejected', 'cancelled'].includes(r.chain_status);
      if (filter === 'high')      return r.capex_tier === 'high';
      if (filter === 'medium')    return r.capex_tier === 'medium';
      if (filter === 'low')       return r.capex_tier === 'low';
      if (filter === 'breached')  return !!r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo((): KpiType => {
    let high_open = 0, breached = 0, escalated = 0, in_market = 0;
    let awarded_count = 0, total_award_value = 0, disputed = 0, post_award_due = 0;
    for (const r of rows) {
      if (r.capex_tier === 'high' && !['delivered', 'rejected', 'cancelled'].includes(r.chain_status)) high_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (['published', 'bidding', 'bid_closed', 'evaluation', 'shortlisted'].includes(r.chain_status)) in_market++;
      if (r.chain_status === 'awarded') { awarded_count++; post_award_due++; total_award_value += r.award_amount_zar || 0; }
      if (r.chain_status === 'contracted' || r.chain_status === 'delivered') total_award_value += r.award_amount_zar || 0;
      if (r.chain_status === 'disputed') disputed++;
    }
    return { total: rows.length, high_open, breached, escalated, in_market, awarded_count, total_award_value, disputed, post_award_due };
  }, [rows]);

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>IPP procurement / RFP chain</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage P6 chain · draft → published → bidding → bid_closed → evaluation → shortlisted →
          awarded → contracted → delivered (+ rejected / cancelled / disputed). Per-capex-tier SLA tiering
          (high R≥500m / medium R50-500m / low &lt;R50m — bigger contracts get more diligence time).
          High-tier award, dispute, and SLA breaches escalate to the regulator inbox per REIPPPP transparency.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total RFPs"    value={kpis.total} />
        <KpiTile label="High-tier open" value={kpis.high_open} tone={kpis.high_open > 0 ? 'warn' : undefined} />
        <KpiTile label="In market"     value={kpis.in_market} />
        <KpiTile label="Award value"   value={fmtZar(kpis.total_award_value)} />
        <KpiTile label="SLA breached"  value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Disputed"      value={kpis.disputed} tone={kpis.disputed > 0 ? 'bad' : undefined} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]"
          style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.title}
              meta={`${row.capex_tier.toUpperCase()} · ${row.category} · ${row.rfp_number}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No RFPs match.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default ProcurementChainTab;
