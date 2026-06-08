// ════════════════════════════════════════════════════════════════════════
// OrderDetailPage — drill-in for /trading/orders/:id
//
// Surfaces the order + every L4 sub-resource (amendments, matches, fees,
// allocations, margin reservations, exceptions) in a single page. One
// API round-trip via the new GET /trading/orders/:id endpoint.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { Pill } from '../launch/WorkstationShell';

type OrderDetail = {
  order: any;
  amendments: any[];
  matches: any[];
  fees: any[];
  allocations: any[];
  reservations: any[];
  exceptions: any[];
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);
const num = (v: number, d = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(v || 0);

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      const res = await api.get(`/trading/orders/${id}`);
      setData(res.data?.data as OrderDetail);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={6} /></div>;
  if (err) return <div className="p-6"><ErrorBanner message={err} onRetry={() => void load()} /></div>;
  if (!data) return null;

  const { order, amendments, matches, fees, allocations, reservations, exceptions } = data;
  const totalFilled = matches.reduce((s, m) => s + Number(m.matched_volume_mwh || 0), 0);
  const feesTotal = fees.reduce((s, f) => s + Number(f.amount_zar || 0), 0);
  const allocatedTotal = allocations.reduce((s, a) => s + Number(a.allocated_volume_mwh || 0), 0);

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6b7685]">
            Order · <span className="font-mono">{order.id.slice(0, 16)}…</span>
          </div>
          <h1 className="mt-2 font-display text-[28px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>
            {order.side?.toUpperCase()} {num(order.volume_mwh, 2)} MWh {order.energy_type}
          </h1>
          <p className="text-[13px] text-[#3d4756]">
            Status <Pill tone={order.status === 'matched' ? 'good' : order.status === 'cancelled' || order.status === 'expired' ? 'neutral' : 'info'}>{order.status}</Pill>
            {' '}· delivery {order.delivery_date || '—'}
            {' '}· market {order.market_type}
            {order.time_in_force && <> · TIF {order.time_in_force}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate('/trading?tab=blotter')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Blotter
          </button>
          <button type="button" onClick={() => void load()} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi label="Side" value={order.side?.toUpperCase()} />
        <Kpi label="Volume" value={`${num(order.volume_mwh, 2)} MWh`} />
        <Kpi label="Price" value={order.price_min ? formatZAR(order.price_min) : order.price_max ? formatZAR(order.price_max) : '—'} />
        <Kpi label="Filled" value={`${num(totalFilled, 2)} MWh`} />
        <Kpi label="Allocated" value={`${num(allocatedTotal, 2)} MWh`} />
        <Kpi label="Fees total" value={formatZAR(feesTotal)} />
      </div>

      <Section title={`Fills (${matches.length})`}>
        {matches.length === 0 ? <Empty label="No fills yet." /> : (
          <Table headers={['When', 'Counterparty side', 'Volume', 'Price', 'Notional', 'Status']}>
            {matches.map(m => (
              <tr key={m.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(m.matched_at).toLocaleString()}</td>
                <td className="px-4 py-2"><span className="font-mono text-[11px]">{(m.buy_order_id === order.id ? m.sell_order_id : m.buy_order_id).slice(0, 14)}…</span></td>
                <td className="px-4 py-2">{num(m.matched_volume_mwh, 2)} MWh</td>
                <td className="px-4 py-2">{formatZAR(m.matched_price_zar)}</td>
                <td className="px-4 py-2 font-medium">{formatZAR(m.matched_volume_mwh * m.matched_price_zar)}</td>
                <td className="px-4 py-2"><Pill tone={m.status === 'settled' ? 'good' : m.status === 'cancelled' ? 'neutral' : 'info'}>{m.status}</Pill></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Amendments (${amendments.length})`}>
        {amendments.length === 0 ? <Empty label="No amendments." /> : (
          <Table headers={['When', 'Prev price → new', 'Prev volume → new', 'Lost priority?', 'Reason']}>
            {amendments.map(a => (
              <tr key={a.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(a.amended_at).toLocaleString()}</td>
                <td className="px-4 py-2">{a.prev_price != null ? formatZAR(a.prev_price) : '—'} → {a.new_price != null ? formatZAR(a.new_price) : '—'}</td>
                <td className="px-4 py-2">{num(a.prev_volume_mwh, 2)} → {num(a.new_volume_mwh, 2)} MWh</td>
                <td className="px-4 py-2">{a.lost_priority ? <Pill tone="bad">Yes</Pill> : <Pill tone="good">No</Pill>}</td>
                <td className="px-4 py-2 text-[11px]">{a.reason || '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Allocations (${allocations.length})`}>
        {allocations.length === 0 ? <Empty label="No allocations recorded for this order." /> : (
          <Table headers={['Participant', 'Volume', 'Price', 'Sub-account', 'Lot', 'Status']}>
            {allocations.map(a => (
              <tr key={a.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2"><span className="font-mono text-[11px]">{a.participant_id.slice(0, 14)}…</span></td>
                <td className="px-4 py-2">{num(a.allocated_volume_mwh, 2)} MWh</td>
                <td className="px-4 py-2">{formatZAR(a.allocated_price_zar)}</td>
                <td className="px-4 py-2">{a.sub_account || '—'}</td>
                <td className="px-4 py-2 text-[11px]">{a.lot_id || '—'}</td>
                <td className="px-4 py-2"><Pill tone={a.status === 'active' ? 'good' : 'neutral'}>{a.status}</Pill></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Fees (${fees.length})`}>
        {fees.length === 0 ? <Empty label="No fees accrued yet for this order." /> : (
          <Table headers={['When', 'Type', 'Basis', 'Amount', 'Rule']}>
            {fees.map(f => (
              <tr key={f.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(f.calculated_at).toLocaleString()}</td>
                <td className="px-4 py-2"><Pill tone="info">{f.fee_type.replace(/_/g, ' ')}</Pill></td>
                <td className="px-4 py-2 text-[11px]">{f.basis}</td>
                <td className="px-4 py-2 font-medium">{formatZAR(f.amount_zar)}</td>
                <td className="px-4 py-2 text-[10px] font-mono text-[#6b7685]">{f.calc_rule_version}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Margin reservations (${reservations.length})`}>
        {reservations.length === 0 ? <Empty label="No margin reservations." /> : (
          <Table headers={['When', 'Amount', 'Status', 'Resolved', 'Note']}>
            {reservations.map(m => (
              <tr key={m.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(m.reserved_at).toLocaleString()}</td>
                <td className="px-4 py-2 font-medium">{formatZAR(m.amount_zar)}</td>
                <td className="px-4 py-2"><Pill tone={m.status === 'released' ? 'good' : m.status === 'consumed' ? 'info' : 'warn'}>{m.status}</Pill></td>
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{m.resolved_at ? new Date(m.resolved_at).toLocaleString() : '—'}</td>
                <td className="px-4 py-2 text-[11px]">{m.resolution_note || '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Exceptions (${exceptions.length})`}>
        {exceptions.length === 0 ? <Empty label="No exceptions filed." /> : (
          <Table headers={['When', 'Type', 'Severity', 'Status', 'Reason']}>
            {exceptions.map(e => (
              <tr key={e.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(e.reported_at).toLocaleString()}</td>
                <td className="px-4 py-2 capitalize">{e.exception_type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2"><Pill tone={e.severity === 'critical' || e.severity === 'high' ? 'bad' : 'warn'}>{e.severity}</Pill></td>
                <td className="px-4 py-2"><Pill tone={e.status === 'resolved' ? 'good' : e.status === 'rejected' ? 'neutral' : 'warn'}>{e.status}</Pill></td>
                <td className="px-4 py-2 text-[11px]"><span className="block truncate max-w-md" title={e.reason}>{e.reason}</span></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="mt-1 text-[16px] font-bold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7685' }}>{title}</h2>
      {children}
    </section>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
          <tr>{headers.map(h => <th key={h} className="px-4 py-2">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#6b7685]">{label}</div>;
}
