// ════════════════════════════════════════════════════════════════════════
// InvoiceDetailPage — drill-in for /settlement/invoices/:id
//
// Single page with the invoice header + every L4 sub-resource:
// breaks, fees, confirmations history, structured line items, payments.
// One API call via GET /settlement/invoices/:id/detail.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { Pill } from '../launch/WorkstationShell';
import { SettlementWaterfall } from '../widgets/SettlementWaterfall';

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
const INFO_BG = 'oklch(0.95 0.03 250)';
const INFO    = 'oklch(0.40 0.10 250)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

type InvoiceDetail = {
  invoice: any;
  breaks: any[];
  fees: any[];
  confirmations: any[];
  line_items: any[];
  payments: any[];
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      const res = await api.get(`/settlement/invoices/${id}/detail`);
      setData(res.data?.data as InvoiceDetail);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <div style={{ padding: 24, background: BG, minHeight: '100vh' }}>
      <Skeleton variant="card" rows={6} />
    </div>
  );
  if (err) return (
    <div style={{ padding: 24, background: BG, minHeight: '100vh' }}>
      <ErrorBanner message={err} onRetry={() => void load()} />
    </div>
  );
  if (!data) return null;

  const { invoice, breaks, fees, confirmations, line_items, payments } = data;
  const feesTotal   = fees.reduce((s, f) => s + Number(f.amount_zar || 0), 0);
  const paidTotal   = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const outstanding = Math.max(0, (invoice.total_amount || 0) - paidTotal);
  const openBreaks  = breaks.filter(b => b.status === 'open' || b.status === 'investigating').length;

  const invoiceStatusTone = invoice.status === 'paid'
    ? { bg: GOOD_BG, fg: GOOD }
    : invoice.status === 'overdue' || invoice.status === 'disputed'
      ? { bg: BAD_BG, fg: BAD }
      : { bg: INFO_BG, fg: INFO };

  const confirmTone = invoice.confirmation_status === 'payer_acknowledged'
    ? { bg: GOOD_BG, fg: GOOD }
    : invoice.confirmation_status === 'disputed'
      ? { bg: BAD_BG, fg: BAD }
      : { bg: WARN_BG, fg: WARN };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* LEFT COLUMN */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, fontFamily: MONO }}>
            Invoice · {invoice.invoice_number}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: TX1, margin: 0, fontFamily: MONO }}>
            {formatZAR(invoice.total_amount)}
          </h1>
          <p style={{ fontSize: 13, color: TX2, margin: '6px 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            From <strong style={{ color: TX1 }}>{invoice.from_name}</strong>
            <span style={{ color: TX3 }}>to</span>
            <strong style={{ color: TX1 }}>{invoice.to_name}</strong>
            <span style={{ color: TX3 }}>·</span>
            <span style={{
              background: invoiceStatusTone.bg, color: invoiceStatusTone.fg,
              padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
            }}>{invoice.status}</span>
            <span style={{ color: TX3 }}>·</span>
            <span style={{
              background: confirmTone.bg, color: confirmTone.fg,
              padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
            }}>{(invoice.confirmation_status || 'pending').replace(/_/g, ' ')}</span>
            <span style={{ color: TX3 }}>· due</span>
            <span style={{ fontFamily: MONO, fontSize: 12 }}>
              {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'}
            </span>
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <KpiCard label="Total" value={formatZAR(invoice.total_amount)} />
          <KpiCard label="Paid" value={formatZAR(paidTotal)} highlight={paidTotal >= invoice.total_amount ? GOOD : undefined} />
          <KpiCard label="Outstanding" value={formatZAR(outstanding)} highlight={outstanding > 0 ? BAD : GOOD} />
          <KpiCard label="Fees accrued" value={formatZAR(feesTotal)} highlight={feesTotal > 0 ? WARN : undefined} />
          <KpiCard label="Open breaks" value={String(openBreaks)} highlight={openBreaks > 0 ? BAD : undefined} />
          <KpiCard label="Line items" value={String(line_items.length)} />
        </div>

        {/* Waterfall */}
        <div style={{ marginBottom: 24 }}>
          <SettlementWaterfall
            totalAmount={Number(invoice.total_amount || 0)}
            breaks={breaks}
            fees={fees}
            payments={payments}
          />
        </div>

        {/* Line items */}
        <SectionCard title={`Line items (${line_items.length})`}>
          {line_items.length === 0
            ? <EmptyState label="No structured line items. Legacy JSON line_items column may hold the breakdown." />
            : (
              <MbTable headers={['#', 'Type', 'Description', 'Qty', 'Unit', 'Unit price', 'Amount']}>
                {line_items.map((li, i) => (
                  <tr key={li.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                    <td style={{ padding: '10px 12px', color: TX3, fontFamily: MONO, fontSize: 11 }}>{li.sequence_no}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: INFO_BG, color: INFO, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                        {li.line_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: TX1, maxWidth: 260 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={li.description}>
                        {li.description}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO }}>{li.quantity != null ? li.quantity : '—'}</td>
                    <td style={{ padding: '10px 12px', color: TX2 }}>{li.unit || '—'}</td>
                    <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO }}>{li.unit_price_zar != null ? formatZAR(li.unit_price_zar) : '—'}</td>
                    <td style={{ padding: '10px 12px', color: TX1, fontWeight: 600, fontFamily: MONO }}>{formatZAR(li.amount_zar)}</td>
                  </tr>
                ))}
              </MbTable>
            )}
        </SectionCard>

        {/* Settlement breaks */}
        <SectionCard title={`Settlement breaks (${breaks.length})`}>
          {breaks.length === 0
            ? <EmptyState label="No breaks filed." />
            : (
              <MbTable headers={['When', 'Type', 'Severity', 'Status', 'Reason', 'Outcome']}>
                {breaks.map((b, i) => {
                  const sevTone = b.severity === 'critical' || b.severity === 'high'
                    ? { bg: BAD_BG, fg: BAD } : { bg: WARN_BG, fg: WARN };
                  const stTone = b.status === 'resolved'
                    ? { bg: GOOD_BG, fg: GOOD }
                    : b.status === 'rejected'
                      ? { bg: BG2, fg: TX2 }
                      : { bg: WARN_BG, fg: WARN };
                  return (
                    <tr key={b.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                      <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>{new Date(b.reported_at).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', color: TX2, textTransform: 'capitalize' }}>{b.break_type.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: sevTone.bg, color: sevTone.fg, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{b.severity}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: stTone.bg, color: stTone.fg, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{b.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: TX2, fontSize: 11, maxWidth: 220 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.reason}>{b.reason}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: TX3, fontSize: 11 }}>{b.resolution_outcome || '—'}</td>
                    </tr>
                  );
                })}
              </MbTable>
            )}
        </SectionCard>

        {/* Fees */}
        <SectionCard title={`Fees accrued (${fees.length})`}>
          {fees.length === 0
            ? <EmptyState label="No fees accrued." />
            : (
              <MbTable headers={['When', 'Type', 'Basis', 'Reason', 'Rule', 'Amount']}>
                {fees.map((f, i) => (
                  <tr key={f.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                    <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>{new Date(f.calculated_at).toLocaleString()}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: INFO_BG, color: INFO, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                        {f.fee_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: TX2, fontSize: 11 }}>{f.basis}</td>
                    <td style={{ padding: '10px 12px', color: TX2, fontSize: 11, maxWidth: 200 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.reason || ''}>{f.reason || '—'}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: TX3, fontSize: 10, fontFamily: MONO }}>{f.calc_rule_version}</td>
                    <td style={{ padding: '10px 12px', color: TX1, fontWeight: 600, fontFamily: MONO }}>{formatZAR(f.amount_zar)}</td>
                  </tr>
                ))}
              </MbTable>
            )}
        </SectionCard>

        {/* Confirmations */}
        <SectionCard title={`Confirmations (${confirmations.length})`}>
          {confirmations.length === 0
            ? <EmptyState label="Neither side has confirmed yet." />
            : (
              <MbTable headers={['When', 'Party', 'Status', 'By', 'Notes']}>
                {confirmations.map((c, i) => {
                  const cTone = c.status === 'confirmed' ? { bg: GOOD_BG, fg: GOOD } : { bg: BAD_BG, fg: BAD };
                  return (
                    <tr key={c.party + c.confirmed_at} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                      <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>{new Date(c.confirmed_at).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', color: TX2, textTransform: 'capitalize' }}>{c.party}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: cTone.bg, color: cTone.fg, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{c.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX2 }}>{(c.confirmed_by || '').slice(0, 14)}…</td>
                      <td style={{ padding: '10px 12px', color: TX3, fontSize: 11 }}>{c.notes || '—'}</td>
                    </tr>
                  );
                })}
              </MbTable>
            )}
        </SectionCard>

        {/* Payments */}
        <SectionCard title={`Payments (${payments.length})`}>
          {payments.length === 0
            ? <EmptyState label="No payments recorded yet." />
            : (
              <MbTable headers={['When', 'Reference', 'Method', 'Bank ref', 'Amount']}>
                {payments.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                    <td style={{ padding: '10px 12px', color: TX3, fontSize: 11, fontFamily: MONO }}>{p.payment_date}</td>
                    <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO, fontSize: 12 }}>{p.payment_reference}</td>
                    <td style={{ padding: '10px 12px', color: TX2, textTransform: 'capitalize' }}>{p.payment_method}</td>
                    <td style={{ padding: '10px 12px', color: TX3, fontSize: 11 }}>{p.bank_reference || '—'}</td>
                    <td style={{ padding: '10px 12px', color: TX1, fontWeight: 600, fontFamily: MONO }}>{formatZAR(p.amount)}</td>
                  </tr>
                ))}
              </MbTable>
            )}
        </SectionCard>
      </div>

      {/* RIGHT COLUMN */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Navigation actions */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => navigate('/settlement')}
              style={{
                background: 'transparent', color: ACC, border: `1px solid ${ACC}`,
                padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer',
                fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
              }}
            >
              <ArrowLeft size={13} /> Back to Settlement
            </button>
            <button
              type="button"
              onClick={() => void load()}
              style={{
                background: 'transparent', color: TX2, border: `1px solid ${BORDER}`,
                padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer',
                fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
              }}
            >
              <RefreshCw size={13} /> Refresh data
            </button>
          </div>
        </div>

        {/* Invoice summary */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Invoice summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SummaryRow label="Invoice #" value={invoice.invoice_number} mono />
            <SummaryRow label="From" value={invoice.from_name} />
            <SummaryRow label="To" value={invoice.to_name} />
            <SummaryRow label="Period start" value={invoice.period_start ? new Date(invoice.period_start).toLocaleDateString() : '—'} mono />
            <SummaryRow label="Period end" value={invoice.period_end ? new Date(invoice.period_end).toLocaleDateString() : '—'} mono />
            <SummaryRow label="Due date" value={invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'} mono />
            <SummaryRow label="Settlement run" value={invoice.settlement_run_id || '—'} mono />
          </div>
        </div>

        {/* Financial summary */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Financial summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SummaryRow label="Total amount" value={formatZAR(invoice.total_amount)} mono highlight={TX1} />
            <SummaryRow label="Paid" value={formatZAR(paidTotal)} mono highlight={paidTotal > 0 ? GOOD : TX2} />
            <SummaryRow
              label="Outstanding"
              value={formatZAR(outstanding)}
              mono
              highlight={outstanding > 0 ? BAD : GOOD}
            />
            <SummaryRow label="Fees accrued" value={formatZAR(feesTotal)} mono highlight={feesTotal > 0 ? WARN : TX2} />
          </div>
        </div>

        {/* Status summary */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Status
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: TX3 }}>Invoice status</span>
              <span style={{
                background: invoiceStatusTone.bg, color: invoiceStatusTone.fg,
                padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
              }}>{invoice.status}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: TX3 }}>Confirmation</span>
              <span style={{
                background: confirmTone.bg, color: confirmTone.fg,
                padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
              }}>{(invoice.confirmation_status || 'pending').replace(/_/g, ' ')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: TX3 }}>Open breaks</span>
              <span style={{
                background: openBreaks > 0 ? BAD_BG : GOOD_BG,
                color: openBreaks > 0 ? BAD : GOOD,
                padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, fontFamily: MONO,
              }}>{openBreaks}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: TX3 }}>Payments received</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: TX1, fontFamily: MONO }}>{payments.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: TX3 }}>Confirmations</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: TX1, fontFamily: MONO }}>{confirmations.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  const BG1_  = 'oklch(0.99 0.002 80)';
  const BORDER_ = 'oklch(0.87 0.006 250)';
  const TX1_  = 'oklch(0.17 0.010 250)';
  const TX3_  = 'oklch(0.60 0.007 250)';
  const MONO_ = '"IBM Plex Mono","Fira Code",monospace';
  return (
    <div style={{
      background: BG1_, border: `1px solid ${BORDER_}`, borderRadius: 8,
      padding: '12px 16px', flex: 1, minWidth: 110,
    }}>
      <div style={{ fontSize: 11, color: TX3_, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: highlight || TX1_, fontFamily: MONO_, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const BG1_   = 'oklch(0.99 0.002 80)';
  const BORDER_ = 'oklch(0.87 0.006 250)';
  const TX2_   = 'oklch(0.40 0.009 250)';
  return (
    <div style={{ background: BG1_, border: `1px solid ${BORDER_}`, borderRadius: 8, padding: '16px 20px', marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: TX2_, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function MbTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  const BORDER_ = 'oklch(0.87 0.006 250)';
  const TX2_    = 'oklch(0.40 0.009 250)';
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${BORDER_}` }}>
            {headers.map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '8px 12px', color: TX2_, fontWeight: 600,
                fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  const TX3_ = 'oklch(0.60 0.007 250)';
  return (
    <div style={{ padding: '16px 0', fontSize: 12, color: TX3_, fontStyle: 'italic' }}>{label}</div>
  );
}

function SummaryRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: string }) {
  const TX2_ = 'oklch(0.40 0.009 250)';
  const TX3_ = 'oklch(0.60 0.007 250)';
  const MONO_ = '"IBM Plex Mono","Fira Code",monospace';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: TX3_, flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 12, color: highlight || TX2_, fontWeight: highlight ? 600 : 400,
        fontFamily: mono ? MONO_ : undefined,
        textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</span>
    </div>
  );
}

export default InvoiceDetailPage;
