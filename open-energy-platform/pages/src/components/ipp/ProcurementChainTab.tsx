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

type ChainStatus =
  | 'draft' | 'published' | 'bidding' | 'bid_closed' | 'evaluation'
  | 'shortlisted' | 'awarded' | 'contracted' | 'delivered'
  | 'rejected' | 'cancelled' | 'disputed';

type Tier = 'high' | 'medium' | 'low';

interface RfpRow {
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

interface RfpEvent {
  id: string;
  rfp_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  draft:       { bg: '#e3e7ec', fg: '#557',    label: 'Draft' },
  published:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Published' },
  bidding:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Bidding' },
  bid_closed:  { bg: '#fff4d6', fg: '#a06200', label: 'Bid closed' },
  evaluation:  { bg: '#fff4d6', fg: '#a06200', label: 'Evaluation' },
  shortlisted: { bg: '#fff4d6', fg: '#a06200', label: 'Shortlisted' },
  awarded:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Awarded' },
  contracted:  { bg: '#daf5e2', fg: '#1f6b3a', label: 'Contracted' },
  delivered:   { bg: '#d4edda', fg: '#155724', label: 'Delivered' },
  rejected:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  cancelled:   { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
  disputed:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  high:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'High (≥R500m)' },
  medium: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Medium (R50-500m)' },
  low:    { bg: '#e3e7ec', fg: '#557',    label: 'Low (<R50m)' },
};

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

type PrimaryAction =
  | 'publish' | 'open-bids' | 'close-bids' | 'begin-evaluation' | 'shortlist'
  | 'award' | 'sign-contract' | 'mark-delivered' | 'resolve';

const ACTION_FOR_STATE: Record<ChainStatus, PrimaryAction | null> = {
  draft:       'publish',
  published:   'open-bids',
  bidding:     'close-bids',
  bid_closed:  'begin-evaluation',
  evaluation:  'shortlist',
  shortlisted: 'award',
  awarded:     'sign-contract',
  contracted:  'mark-delivered',
  disputed:    'resolve',
  delivered:   null,
  rejected:    null,
  cancelled:   null,
};

const ACTION_LABEL: Record<PrimaryAction | 'reject-all' | 'dispute' | 'cancel', string> = {
  'publish':          'Publish RFP',
  'open-bids':        'Open bid window',
  'close-bids':       'Close bidding',
  'begin-evaluation': 'Begin evaluation',
  'shortlist':        'Move to shortlist',
  'award':            'Award contract',
  'sign-contract':    'Sign contract',
  'mark-delivered':   'Mark delivered',
  'resolve':          'Resolve dispute',
  'reject-all':       'Reject all bids',
  'dispute':          'Open dispute',
  'cancel':           'Cancel RFP',
};

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

export function ProcurementChainTab() {
  const [rows, setRows] = useState<RfpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<RfpRow | null>(null);
  const [events, setEvents] = useState<RfpEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RfpRow[] } }>('/ipp/procurement-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load RFPs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { rfp: RfpRow; events: RfpEvent[] } }>(
        `/ipp/procurement-chain/${id}`
      );
      if (res.data?.data?.rfp) setSelected(res.data.data.rfp);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load RFP history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')       return true;
      if (filter === 'active')    return !['delivered','rejected','cancelled'].includes(r.chain_status);
      if (filter === 'high')      return r.capex_tier === 'high';
      if (filter === 'medium')    return r.capex_tier === 'medium';
      if (filter === 'low')       return r.capex_tier === 'low';
      if (filter === 'breached')  return r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let high_open = 0, breached = 0, escalated = 0, in_market = 0;
    let awarded_count = 0, total_award_value = 0, disputed = 0, post_award_due = 0;
    for (const r of rows) {
      if (r.capex_tier === 'high' && !['delivered','rejected','cancelled'].includes(r.chain_status)) high_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (['published','bidding','bid_closed','evaluation','shortlisted'].includes(r.chain_status)) in_market++;
      if (r.chain_status === 'awarded') { awarded_count++; post_award_due++; total_award_value += r.award_amount_zar || 0; }
      if (r.chain_status === 'contracted' || r.chain_status === 'delivered') total_award_value += r.award_amount_zar || 0;
      if (r.chain_status === 'disputed') disputed++;
    }
    return { total: rows.length, high_open, breached, escalated, in_market, awarded_count, total_award_value, disputed, post_award_due };
  }, [rows]);

  const act = useCallback(async (action: PrimaryAction | 'reject-all' | 'dispute' | 'cancel', row: RfpRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'award') {
        const vendor = window.prompt('Vendor / award party name:');
        if (!vendor) return;
        const amountStr = window.prompt('Award amount in ZAR (e.g. 1380000000):');
        if (!amountStr) return;
        const amount = Number(amountStr.replace(/[^\d.]/g, ''));
        if (!Number.isFinite(amount) || amount <= 0) { window.alert('Invalid amount'); return; }
        body = { award_name: vendor, award_to: vendor, award_amount_zar: amount };
      } else if (action === 'reject-all' || action === 'cancel') {
        const reason = window.prompt(action === 'reject-all' ? 'Reason for rejecting all bids:' : 'Reason for cancel:');
        if (!reason) return;
        body = { reason };
      } else if (action === 'dispute') {
        const notes = window.prompt('Dispute notes:');
        if (!notes) return;
        body = { dispute_notes: notes };
      }
      await api.post(`/ipp/procurement-chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">IPP procurement / RFP chain</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage P6 chain · draft → published → bidding → bid_closed → evaluation → shortlisted →
            awarded → contracted → delivered (+ rejected / cancelled / disputed). Per-capex-tier SLA tiering
            (high R≥500m / medium R50-500m / low &lt;R50m — bigger contracts get more diligence time).
            High-tier award, dispute, and SLA breaches escalate to the regulator inbox per REIPPPP transparency.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total RFPs" value={kpis.total} />
        <Kpi label="High-tier open" value={kpis.high_open} tone={kpis.high_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="In market" value={kpis.in_market} />
        <Kpi label="Award value" value={fmtZar(kpis.total_award_value)} />
        <Kpi label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Disputed" value={kpis.disputed} tone={kpis.disputed > 0 ? 'bad' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">RFP</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Title</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Capex</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Award</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.capex_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">{r.rfp_number}</td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={r.title}>{r.title}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {r.capex_tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZar(r.capex_estimate_zar)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] max-w-[180px] truncate" title={r.award_name ?? ''}>
                      {r.award_name ? `${r.award_name} · ${fmtZar(r.award_amount_zar)}` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No RFPs match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: RfpRow;
  events: RfpEvent[];
  onClose: () => void;
  onAct: (action: PrimaryAction | 'reject-all' | 'dispute' | 'cancel', row: RfpRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRejectAll = row.chain_status === 'evaluation';
  const canDispute   = ['published','bidding','bid_closed','evaluation','shortlisted','awarded','contracted'].includes(row.chain_status);
  const canCancel    = !['contracted','delivered','rejected','cancelled'].includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[680px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.rfp_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.title}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.capex_tier].label} · {row.category} · {fmtZar(row.capex_estimate_zar)}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"        value={STATE_TONE[row.chain_status].label} />
            <Pair label="Capex tier"   value={TIER_TONE[row.capex_tier].label} />
            <Pair label="Capex est."   value={fmtZar(row.capex_estimate_zar)} />
            <Pair label="Category"     value={row.category} />
            <Pair label="Bid open"     value={fmtDate(row.bid_open_at)} />
            <Pair label="Bid close"    value={fmtDate(row.bid_close_at)} />
            <Pair label="Delivery due" value={fmtDate(row.delivery_due_at)} />
            <Pair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"   value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation"   value={String(row.escalation_level)} />
            <Pair label="Award party"  value={row.award_name ?? '—'} />
            <Pair label="Award amount" value={fmtZar(row.award_amount_zar)} />
          </div>
          {row.description && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">Description</div>
              <div className="text-[#1a3a5c]">{row.description}</div>
            </div>
          )}
          {row.rejection_reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#9b1f1f]">Rejection reason</div>
              <div className="text-[#9b1f1f]">{row.rejection_reason}</div>
            </div>
          )}
          {row.dispute_notes && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#9b1f1f]">Dispute notes</div>
              <div className="text-[#9b1f1f] whitespace-pre-wrap">{row.dispute_notes}</div>
            </div>
          )}
        </section>

        {(nextAction || canRejectAll || canDispute || canCancel) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canRejectAll && (
                <button type="button"
                  onClick={() => onAct('reject-all', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject-all']}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('dispute', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.dispute}
                </button>
              )}
              {canCancel && (
                <button type="button"
                  onClick={() => onAct('cancel', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL.cancel}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  {(e.from_status || e.to_status) && (
                    <div className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</div>
                  )}
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
