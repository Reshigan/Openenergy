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

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={6} /></div>;
  if (err) return <div className="p-6"><ErrorBanner message={err} onRetry={() => void load()} /></div>;
  if (!data) return null;

  const { invoice, breaks, fees, confirmations, line_items, payments } = data;
  const feesTotal = fees.reduce((s, f) => s + Number(f.amount_zar || 0), 0);
  const paidTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6b7685]">
            Invoice · <span className="font-mono">{invoice.invoice_number}</span>
          </div>
          <h1 className="mt-2 font-display text-[28px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>
            {formatZAR(invoice.total_amount)}
          </h1>
          <p className="text-[13px] text-[#3d4756]">
            From <strong>{invoice.from_name}</strong> to <strong>{invoice.to_name}</strong>
            {' '}· status <Pill tone={invoice.status === 'paid' ? 'good' : invoice.status === 'overdue' || invoice.status === 'disputed' ? 'bad' : 'info'}>{invoice.status}</Pill>
            {' '}· confirmation <Pill tone={invoice.confirmation_status === 'payer_acknowledged' ? 'good' : invoice.confirmation_status === 'disputed' ? 'bad' : 'info'}>{(invoice.confirmation_status || 'pending').replace(/_/g, ' ')}</Pill>
            {' '}· due {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/settlement')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Settlement
          </button>
          <button onClick={() => void load()} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi label="Total" value={formatZAR(invoice.total_amount)} />
        <Kpi label="Paid" value={formatZAR(paidTotal)} />
        <Kpi label="Outstanding" value={formatZAR(Math.max(0, (invoice.total_amount || 0) - paidTotal))} />
        <Kpi label="Fees accrued" value={formatZAR(feesTotal)} />
        <Kpi label="Breaks open" value={String(breaks.filter(b => b.status === 'open' || b.status === 'investigating').length)} />
        <Kpi label="Line items" value={String(line_items.length)} />
      </div>

      <Section title={`Line items (${line_items.length})`}>
        {line_items.length === 0 ? <Empty label="No structured line items. Legacy JSON line_items column may hold the breakdown." /> : (
          <Table headers={['#', 'Type', 'Description', 'Qty', 'Unit', 'Unit price', 'Amount']}>
            {line_items.map(li => (
              <tr key={li.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{li.sequence_no}</td>
                <td className="px-4 py-2"><Pill tone="info">{li.line_type.replace(/_/g, ' ')}</Pill></td>
                <td className="px-4 py-2"><span className="block truncate max-w-md" title={li.description}>{li.description}</span></td>
                <td className="px-4 py-2">{li.quantity != null ? li.quantity : '—'}</td>
                <td className="px-4 py-2">{li.unit || '—'}</td>
                <td className="px-4 py-2">{li.unit_price_zar != null ? formatZAR(li.unit_price_zar) : '—'}</td>
                <td className="px-4 py-2 font-medium">{formatZAR(li.amount_zar)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Settlement breaks (${breaks.length})`}>
        {breaks.length === 0 ? <Empty label="No breaks filed." /> : (
          <Table headers={['When', 'Type', 'Severity', 'Status', 'Reason', 'Outcome']}>
            {breaks.map(b => (
              <tr key={b.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(b.reported_at).toLocaleString()}</td>
                <td className="px-4 py-2 capitalize">{b.break_type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2"><Pill tone={b.severity === 'critical' || b.severity === 'high' ? 'bad' : 'warn'}>{b.severity}</Pill></td>
                <td className="px-4 py-2"><Pill tone={b.status === 'resolved' ? 'good' : b.status === 'rejected' ? 'neutral' : 'warn'}>{b.status}</Pill></td>
                <td className="px-4 py-2 text-[11px]"><span className="block truncate max-w-md" title={b.reason}>{b.reason}</span></td>
                <td className="px-4 py-2 text-[11px]">{b.resolution_outcome || '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Fees accrued (${fees.length})`}>
        {fees.length === 0 ? <Empty label="No fees accrued." /> : (
          <Table headers={['When', 'Type', 'Basis', 'Reason', 'Rule', 'Amount']}>
            {fees.map(f => (
              <tr key={f.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(f.calculated_at).toLocaleString()}</td>
                <td className="px-4 py-2"><Pill tone="info">{f.fee_type.replace(/_/g, ' ')}</Pill></td>
                <td className="px-4 py-2 text-[11px]">{f.basis}</td>
                <td className="px-4 py-2 text-[11px]"><span className="block truncate max-w-md" title={f.reason || ''}>{f.reason || '—'}</span></td>
                <td className="px-4 py-2 text-[10px] font-mono text-[#6b7685]">{f.calc_rule_version}</td>
                <td className="px-4 py-2 font-medium">{formatZAR(f.amount_zar)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Confirmations (${confirmations.length})`}>
        {confirmations.length === 0 ? <Empty label="Neither side has confirmed yet." /> : (
          <Table headers={['When', 'Party', 'Status', 'By', 'Notes']}>
            {confirmations.map(c => (
              <tr key={c.party + c.confirmed_at} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{new Date(c.confirmed_at).toLocaleString()}</td>
                <td className="px-4 py-2 capitalize">{c.party}</td>
                <td className="px-4 py-2"><Pill tone={c.status === 'confirmed' ? 'good' : 'bad'}>{c.status}</Pill></td>
                <td className="px-4 py-2"><span className="font-mono text-[11px]">{(c.confirmed_by || '').slice(0, 14)}…</span></td>
                <td className="px-4 py-2 text-[11px]">{c.notes || '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={`Payments (${payments.length})`}>
        {payments.length === 0 ? <Empty label="No payments recorded yet." /> : (
          <Table headers={['When', 'Reference', 'Method', 'Bank ref', 'Amount']}>
            {payments.map(p => (
              <tr key={p.id} className="border-t border-[#e5ebf2]">
                <td className="px-4 py-2 text-[11px] text-[#6b7685]">{p.payment_date}</td>
                <td className="px-4 py-2">{p.payment_reference}</td>
                <td className="px-4 py-2 capitalize">{p.payment_method}</td>
                <td className="px-4 py-2 text-[11px]">{p.bank_reference || '—'}</td>
                <td className="px-4 py-2 font-medium">{formatZAR(p.amount)}</td>
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
