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

// ── Design tokens ──────────────────────────────────────────────────────
const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const WARN    = 'oklch(0.50 0.18 55)';
const WARN_BG = 'oklch(0.96 0.05 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const INFO    = 'oklch(0.42 0.14 260)';
const INFO_BG = 'oklch(0.95 0.04 260)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

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

function statusTone(s: string): { bg: string; color: string } {
  if (s === 'matched' || s === 'settled' || s === 'active' || s === 'released' || s === 'resolved') return { bg: GOOD_BG, color: GOOD };
  if (s === 'cancelled' || s === 'expired' || s === 'neutral' || s === 'rejected') return { bg: BG2, color: TX2 };
  if (s === 'critical' || s === 'high' || s === 'bad') return { bg: BAD_BG, color: BAD };
  if (s === 'warn' || s === 'warning' || s === 'pending' || s === 'consumed') return { bg: WARN_BG, color: WARN };
  return { bg: INFO_BG, color: INFO };
}

function Badge({ label }: { label: string }) {
  const { bg, color } = statusTone(label);
  return (
    <span style={{
      background: bg, color, padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, fontFamily: MONO,
    }}>
      {label}
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '12px 16px', flex: 1, minWidth: 100,
    }}>
      <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase',
        letterSpacing: '0.07em', padding: '12px 16px',
        borderBottom: `1px solid ${BORDER}`, background: BG2,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
          {headers.map(h => (
            <th key={h} style={{
              textAlign: 'left', padding: '8px 12px', color: TX2,
              fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div style={{ padding: '16px 16px', fontSize: 12, color: TX3 }}>{label}</div>
  );
}

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

  if (loading) return <div style={{ padding: 24 }}><Skeleton variant="card" rows={6} /></div>;
  if (err) return <div style={{ padding: 24 }}><ErrorBanner message={err} onRetry={() => void load()} /></div>;
  if (!data) return null;

  const { order, amendments, matches, fees, allocations, reservations, exceptions } = data;
  const totalFilled   = matches.reduce((s, m) => s + Number(m.matched_volume_mwh || 0), 0);
  const feesTotal     = fees.reduce((s, f) => s + Number(f.amount_zar || 0), 0);
  const allocatedTotal = allocations.reduce((s, a) => s + Number(a.allocated_volume_mwh || 0), 0);

  const sideTone = order.side === 'buy'
    ? { bg: GOOD_BG, color: GOOD }
    : { bg: BAD_BG, color: BAD };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* ── LEFT COLUMN ─────────────────────────────────────────── */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: TX3, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: MONO, marginBottom: 6 }}>
            Order · <span>{order.id.slice(0, 16)}…</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>
            <span style={{ ...sideTone, padding: '2px 10px', borderRadius: 6, fontSize: 14, fontWeight: 700, marginRight: 10 }}>
              {order.side?.toUpperCase()}
            </span>
            {num(order.volume_mwh, 2)} MWh · {order.energy_type}
          </h1>
          <p style={{ fontSize: 13, color: TX2, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Badge label={order.status} />
            <span style={{ color: TX3 }}>·</span>
            <span>Delivery {order.delivery_date || '—'}</span>
            <span style={{ color: TX3 }}>·</span>
            <span>Market {order.market_type}</span>
            {order.time_in_force && <><span style={{ color: TX3 }}>·</span><span>TIF {order.time_in_force}</span></>}
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <Kpi label="Volume" value={`${num(order.volume_mwh, 2)} MWh`} />
          <Kpi label="Price" value={order.price_min ? formatZAR(order.price_min) : order.price_max ? formatZAR(order.price_max) : '—'} />
          <Kpi label="Filled" value={`${num(totalFilled, 2)} MWh`} />
          <Kpi label="Allocated" value={`${num(allocatedTotal, 2)} MWh`} />
          <Kpi label="Fees Total" value={formatZAR(feesTotal)} />
        </div>

        {/* Fills */}
        <SectionCard title={`Fills (${matches.length})`}>
          {matches.length === 0 ? <EmptyRow label="No fills yet." /> : (
            <DataTable headers={['When', 'Counterparty', 'Volume', 'Price', 'Notional', 'Status']}>
              {matches.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                  <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>{new Date(m.matched_at).toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX2 }}>
                    {(m.buy_order_id === order.id ? m.sell_order_id : m.buy_order_id).slice(0, 14)}…
                  </td>
                  <td style={{ padding: '10px 12px', color: TX1 }}>{num(m.matched_volume_mwh, 2)} MWh</td>
                  <td style={{ padding: '10px 12px', color: TX1, fontFamily: MONO }}>{formatZAR(m.matched_price_zar)}</td>
                  <td style={{ padding: '10px 12px', color: TX1, fontWeight: 600, fontFamily: MONO }}>{formatZAR(m.matched_volume_mwh * m.matched_price_zar)}</td>
                  <td style={{ padding: '10px 12px' }}><Badge label={m.status} /></td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>

        {/* Amendments */}
        <SectionCard title={`Amendments (${amendments.length})`}>
          {amendments.length === 0 ? <EmptyRow label="No amendments." /> : (
            <DataTable headers={['When', 'Prev price → New', 'Prev vol → New', 'Lost priority?', 'Reason']}>
              {amendments.map((a, i) => (
                <tr key={a.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                  <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>{new Date(a.amended_at).toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', color: TX1, fontFamily: MONO, fontSize: 12 }}>
                    {a.prev_price != null ? formatZAR(a.prev_price) : '—'} → {a.new_price != null ? formatZAR(a.new_price) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: TX1, fontFamily: MONO, fontSize: 12 }}>
                    {num(a.prev_volume_mwh, 2)} → {num(a.new_volume_mwh, 2)} MWh
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge label={a.lost_priority ? 'Yes' : 'No'} />
                  </td>
                  <td style={{ padding: '10px 12px', color: TX2, fontSize: 11 }}>{a.reason || '—'}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>

        {/* Allocations */}
        <SectionCard title={`Allocations (${allocations.length})`}>
          {allocations.length === 0 ? <EmptyRow label="No allocations recorded for this order." /> : (
            <DataTable headers={['Participant', 'Volume', 'Price', 'Sub-account', 'Lot', 'Status']}>
              {allocations.map((a, i) => (
                <tr key={a.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                  <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX2 }}>{a.participant_id.slice(0, 14)}…</td>
                  <td style={{ padding: '10px 12px', color: TX1 }}>{num(a.allocated_volume_mwh, 2)} MWh</td>
                  <td style={{ padding: '10px 12px', color: TX1, fontFamily: MONO }}>{formatZAR(a.allocated_price_zar)}</td>
                  <td style={{ padding: '10px 12px', color: TX2, fontSize: 12 }}>{a.sub_account || '—'}</td>
                  <td style={{ padding: '10px 12px', color: TX2, fontSize: 11, fontFamily: MONO }}>{a.lot_id || '—'}</td>
                  <td style={{ padding: '10px 12px' }}><Badge label={a.status} /></td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>

        {/* Fees */}
        <SectionCard title={`Fees (${fees.length})`}>
          {fees.length === 0 ? <EmptyRow label="No fees accrued yet for this order." /> : (
            <DataTable headers={['When', 'Type', 'Basis', 'Amount', 'Rule']}>
              {fees.map((f, i) => (
                <tr key={f.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                  <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>{new Date(f.calculated_at).toLocaleString()}</td>
                  <td style={{ padding: '10px 12px' }}><Badge label={f.fee_type.replace(/_/g, ' ')} /></td>
                  <td style={{ padding: '10px 12px', color: TX2, fontSize: 11 }}>{f.basis}</td>
                  <td style={{ padding: '10px 12px', color: TX1, fontWeight: 600, fontFamily: MONO }}>{formatZAR(f.amount_zar)}</td>
                  <td style={{ padding: '10px 12px', color: TX3, fontSize: 10, fontFamily: MONO }}>{f.calc_rule_version}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>

        {/* Margin reservations */}
        <SectionCard title={`Margin Reservations (${reservations.length})`}>
          {reservations.length === 0 ? <EmptyRow label="No margin reservations." /> : (
            <DataTable headers={['When', 'Amount', 'Status', 'Resolved', 'Note']}>
              {reservations.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                  <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>{new Date(m.reserved_at).toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', color: TX1, fontWeight: 600, fontFamily: MONO }}>{formatZAR(m.amount_zar)}</td>
                  <td style={{ padding: '10px 12px' }}><Badge label={m.status} /></td>
                  <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>{m.resolved_at ? new Date(m.resolved_at).toLocaleString() : '—'}</td>
                  <td style={{ padding: '10px 12px', color: TX2, fontSize: 11 }}>{m.resolution_note || '—'}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>

        {/* Exceptions */}
        <SectionCard title={`Exceptions (${exceptions.length})`}>
          {exceptions.length === 0 ? <EmptyRow label="No exceptions filed." /> : (
            <DataTable headers={['When', 'Type', 'Severity', 'Status', 'Reason']}>
              {exceptions.map((e, i) => (
                <tr key={e.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                  <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>{new Date(e.reported_at).toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', color: TX1, fontSize: 12, textTransform: 'capitalize' }}>{e.exception_type.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '10px 12px' }}><Badge label={e.severity} /></td>
                  <td style={{ padding: '10px 12px' }}><Badge label={e.status} /></td>
                  <td style={{ padding: '10px 12px', color: TX2, fontSize: 11 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }} title={e.reason}>
                      {e.reason}
                    </span>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>
      </div>

      {/* ── RIGHT COLUMN ────────────────────────────────────────── */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Nav actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={() => navigate('/trading?tab=blotter')}
            style={{
              background: 'transparent', color: ACC, border: `1px solid ${ACC}`,
              padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer',
              fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <ArrowLeft size={13} /> Back to Blotter
          </button>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              background: 'transparent', color: TX2, border: `1px solid ${BORDER}`,
              padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer',
              fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Order identity card */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Order Identity
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <InfoRow label="ID" value={<span style={{ fontFamily: MONO, fontSize: 11 }}>{order.id.slice(0, 20)}…</span>} />
            <InfoRow label="Side" value={<span style={{ ...sideTone, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{order.side?.toUpperCase()}</span>} />
            <InfoRow label="Energy Type" value={order.energy_type} />
            <InfoRow label="Market" value={order.market_type} />
            <InfoRow label="Delivery" value={order.delivery_date || '—'} />
            {order.time_in_force && <InfoRow label="TIF" value={order.time_in_force} />}
          </div>
        </div>

        {/* Pricing card */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Pricing
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <InfoRow label="Price min" value={<span style={{ fontFamily: MONO }}>{order.price_min != null ? formatZAR(order.price_min) : '—'}</span>} />
            <InfoRow label="Price max" value={<span style={{ fontFamily: MONO }}>{order.price_max != null ? formatZAR(order.price_max) : '—'}</span>} />
            <InfoRow label="Volume" value={<span style={{ fontFamily: MONO }}>{num(order.volume_mwh, 2)} MWh</span>} />
          </div>
        </div>

        {/* Fill summary */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Fill Summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <InfoRow label="Total filled" value={<span style={{ fontFamily: MONO }}>{num(totalFilled, 2)} MWh</span>} />
            <InfoRow label="Allocated" value={<span style={{ fontFamily: MONO }}>{num(allocatedTotal, 2)} MWh</span>} />
            <InfoRow label="Fills count" value={String(matches.length)} />
            <InfoRow label="Allocations" value={String(allocations.length)} />
          </div>
        </div>

        {/* Fee / margin summary */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Fees & Margin
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <InfoRow label="Fees total" value={<span style={{ fontFamily: MONO, fontWeight: 700, color: TX1 }}>{formatZAR(feesTotal)}</span>} />
            <InfoRow label="Fee lines" value={String(fees.length)} />
            <InfoRow label="Reservations" value={String(reservations.length)} />
          </div>
        </div>

        {/* Exceptions summary (only if any) */}
        {exceptions.length > 0 && (
          <div style={{ background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: BAD, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              {exceptions.length} Exception{exceptions.length > 1 ? 's' : ''} Filed
            </div>
            <div style={{ fontSize: 12, color: BAD }}>
              {exceptions.filter(e => e.severity === 'critical' || e.severity === 'high').length > 0 && (
                <span>{exceptions.filter(e => e.severity === 'critical' || e.severity === 'high').length} critical/high severity</span>
              )}
            </div>
          </div>
        )}

        {/* Amendments summary (only if any) */}
        {amendments.length > 0 && (
          <div style={{ background: WARN_BG, border: `1px solid ${WARN}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: WARN, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
              {amendments.length} Amendment{amendments.length > 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 12, color: WARN }}>
              {amendments.filter(a => a.lost_priority).length > 0 && (
                <span>{amendments.filter(a => a.lost_priority).length} lost priority</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: TX3 }}>{label}</span>
      <span style={{ fontSize: 12, color: TX1 }}>{value}</span>
    </div>
  );
}

export default OrderDetailPage;
