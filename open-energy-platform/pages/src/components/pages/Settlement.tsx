import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DollarSign, RefreshCw, Plus, X, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { useAuth } from '../../lib/useAuth';

type Tab = 'invoices' | 'payments' | 'disputes';
type InvoiceStatus = 'draft' | 'issued' | 'partial' | 'paid' | 'overdue' | 'disputed' | 'cancelled';

interface Invoice {
  id: string;
  invoice_number: string;
  from_participant_id: string;
  to_participant_id: string;
  from_name: string;
  to_name: string;
  status: InvoiceStatus;
  total_amount: number;
  paid_amount: number | null;
  due_date: string;
  match_id: string | null;
  created_at: string;
}

interface Payment {
  id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_total: number;
  from_participant_id: string;
  to_participant_id: string;
  from_name: string;
  to_name: string;
  payment_reference: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  bank_reference: string | null;
  reconciled: 0 | 1;
  notes: string | null;
}

interface Dispute {
  id: string;
  invoice_id: string;
  invoice_number: string;
  total_amount: number;
  from_participant_id: string;
  to_participant_id: string;
  from_name: string;
  to_name: string;
  filed_by: string;
  filed_by_name: string;
  reason: string;
  status: 'open' | 'under_review' | 'resolved' | 'rejected';
  created_at: string;
  resolved_at?: string | null;
}

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  issued: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  disputed: 'bg-red-200 text-red-800',
  cancelled: 'bg-gray-200 text-gray-700',
  open: 'bg-red-100 text-red-700',
  under_review: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-700',
  rejected: 'bg-gray-200 text-gray-700',
};

const formatZAR = (v: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

export function Settlement() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  // Unfiltered datasets for the summary tiles — fetched independently of
  // the active tab + filters so tiles are always accurate.
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [allDisputes, setAllDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [disputeInvoice, setDisputeInvoice] = useState<Invoice | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const [inv, pay, dsp] = await Promise.all([
        api.get('/settlement/invoices'),
        api.get('/settlement/payments'),
        api.get('/settlement/disputes'),
      ]);
      setAllInvoices(inv.data?.data || []);
      setAllPayments(pay.data?.data || []);
      setAllDisputes(dsp.data?.data || []);
    } catch (err: any) {
      // Summary tile failures should not block the tab view; keep them silent.
      // eslint-disable-next-line no-console
      console.warn('Settlement summary fetch failed', err?.message || err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'invoices') {
        const params = new URLSearchParams();
        if (directionFilter !== 'all') params.set('direction', directionFilter);
        if (statusFilter !== 'all') params.set('status', statusFilter);
        const res = await api.get(`/settlement/invoices?${params.toString()}`);
        setInvoices(res.data?.data || []);
      } else if (tab === 'payments') {
        const res = await api.get('/settlement/payments');
        setPayments(res.data?.data || []);
      } else {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        const res = await api.get(`/settlement/disputes?${params.toString()}`);
        setDisputes(res.data?.data || []);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load settlement data');
    } finally {
      setLoading(false);
    }
  }, [tab, directionFilter, statusFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  // Summary loads once on mount; mutations refresh it explicitly.
  useEffect(() => { void fetchSummary(); }, [fetchSummary]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchData(), fetchSummary()]);
  }, [fetchData, fetchSummary]);

  const reconcilePayment = useCallback(async (p: Payment) => {
    const bankRef = prompt('Bank statement reference (optional):', p.bank_reference || '');
    if (bankRef === null) return; // user cancelled — do NOT reconcile
    try {
      await api.post(`/settlement/payments/${p.id}/reconcile`, { bank_reference: bankRef || undefined });
      await refreshAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to reconcile');
    }
  }, [refreshAll]);

  const summary = useMemo(() => {
    const outstanding = allInvoices.filter(i => ['issued', 'partial', 'overdue'].includes(i.status))
      .reduce((sum, i) => sum + (i.total_amount - Number(i.paid_amount || 0)), 0);
    const overdue = allInvoices.filter(i => i.status === 'overdue').length;
    const openDisputes = allDisputes.filter(d => ['open', 'under_review'].includes(d.status)).length;
    const unreconciled = allPayments.filter(p => p.reconciled === 0 && p.from_participant_id === user?.id).length;
    return { outstanding, overdue, openDisputes, unreconciled };
  }, [allInvoices, allDisputes, allPayments, user?.id]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settlement</h1>
          <p className="text-ionex-text-mute">Invoices, payments, reconciliation and disputes.</p>
        </div>
        <button onClick={() => void refreshAll()} className="p-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50" aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Outstanding" value={formatZAR(summary.outstanding)} />
        <Tile label="Overdue invoices" value={String(summary.overdue)} accent={summary.overdue ? 'text-red-600' : undefined} />
        <Tile label="Open disputes" value={String(summary.openDisputes)} accent={summary.openDisputes ? 'text-amber-600' : undefined} />
        <Tile label="Unreconciled payments" value={String(summary.unreconciled)} accent={summary.unreconciled ? 'text-amber-600' : undefined} />
      </div>

      <div className="border-b border-ionex-border-100 flex gap-6">
        {([
          { k: 'invoices', label: 'Invoices' },
          { k: 'payments', label: 'Payments' },
          { k: 'disputes', label: 'Disputes' },
        ] as Array<{ k: Tab; label: string }>).map(t => (
          <button
            key={t.k}
            onClick={() => { setTab(t.k); setStatusFilter('all'); }}
            className={`pb-3 border-b-2 transition-colors ${tab === t.k ? 'border-ionex-brand text-ionex-brand font-semibold' : 'border-transparent text-ionex-text-mute hover:text-gray-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'invoices' && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-ionex-text-mute">Direction:</span>
          {(['all', 'incoming', 'outgoing'] as const).map(d => (
            <button key={d} onClick={() => setDirectionFilter(d)} className={`px-3 py-1 rounded-full text-xs capitalize ${directionFilter === d ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>{d}</button>
          ))}
          <span className="text-sm text-ionex-text-mute ml-3">Status:</span>
          {(['all', 'issued', 'partial', 'paid', 'overdue', 'disputed'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 rounded-full text-xs capitalize ${statusFilter === s ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>{s}</button>
          ))}
        </div>
      )}

      {tab === 'disputes' && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-ionex-text-mute">Status:</span>
          {(['all', 'open', 'under_review', 'resolved', 'rejected'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 rounded-full text-xs capitalize ${statusFilter === s ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>{s.replace(/_/g, ' ')}</button>
          ))}
        </div>
      )}

      {loading && <Skeleton variant="card" rows={4} />}
      {error && <ErrorBanner message={error} onRetry={() => void refreshAll()} />}

      {!loading && !error && tab === 'invoices' && (
        invoices.length === 0
          ? <EmptyState icon={<DollarSign className="w-8 h-8" />} title="No invoices" description="Invoices issued to you or that you've issued will appear here." />
          : <InvoiceTable rows={invoices} userId={user?.id} onPay={setPayInvoice} onDispute={setDisputeInvoice} />
      )}
      {!loading && !error && tab === 'payments' && (
        payments.length === 0
          ? <EmptyState icon={<DollarSign className="w-8 h-8" />} title="No payments" description="Recorded payments will appear here." />
          : <PaymentTable rows={payments} userId={user?.id} onReconcile={reconcilePayment} />
      )}
      {!loading && !error && tab === 'disputes' && (
        disputes.length === 0
          ? <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="No disputes" description="Invoice disputes filed by either party will appear here." />
          : <DisputeTable rows={disputes} />
      )}

      {payInvoice && (
        <RecordPaymentModal invoice={payInvoice} onClose={() => setPayInvoice(null)} onDone={() => { setPayInvoice(null); void refreshAll(); }} />
      )}
      {disputeInvoice && (
        <FileDisputeModal invoice={disputeInvoice} onClose={() => setDisputeInvoice(null)} onDone={() => { setDisputeInvoice(null); setTab('disputes'); void fetchSummary(); }} />
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="p-4 bg-white border border-ionex-border-100 rounded-xl">
      <p className="text-xs uppercase tracking-wide text-ionex-text-mute">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent || 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function InvoiceTable({ rows, userId, onPay, onDispute }: { rows: Invoice[]; userId?: string; onPay: (i: Invoice) => void; onDispute: (i: Invoice) => void }) {
  return (
    <div className="bg-white border border-ionex-border-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-ionex-text-mute">
          <tr>
            <Th>Invoice</Th><Th>From</Th><Th>To</Th><Th>Amount</Th><Th>Paid</Th><Th>Due</Th><Th>Status</Th><Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isPayer = r.to_participant_id === userId;
            const isIssuer = r.from_participant_id === userId;
            const canPay = isPayer && ['issued', 'partial', 'overdue'].includes(r.status);
            const canDispute = isPayer && ['issued', 'partial', 'overdue'].includes(r.status);
            return (
              <tr key={r.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
                <Td><span className="font-medium">{r.invoice_number}</span></Td>
                <Td>{r.from_name}</Td>
                <Td>{r.to_name}</Td>
                <Td>{formatZAR(r.total_amount)}</Td>
                <Td>{formatZAR(Number(r.paid_amount || 0))}</Td>
                <Td>{r.due_date ? new Date(r.due_date).toLocaleDateString() : '—'}</Td>
                <Td><span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${STATUS_PILL[r.status] || 'bg-gray-100'}`}>{r.status}</span></Td>
                <Td>
                  <div className="flex gap-1">
                    {canPay && <button onClick={() => onPay(r)} className="px-2 py-1 text-xs bg-ionex-brand text-white rounded">Pay</button>}
                    {canDispute && <button onClick={() => onDispute(r)} className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded">Dispute</button>}
                    {isIssuer && !canPay && <span className="text-xs text-ionex-text-mute">—</span>}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaymentTable({ rows, userId, onReconcile }: { rows: Payment[]; userId?: string; onReconcile: (p: Payment) => void }) {
  return (
    <div className="bg-white border border-ionex-border-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-ionex-text-mute">
          <tr>
            <Th>Reference</Th><Th>Invoice</Th><Th>Amount</Th><Th>Method</Th><Th>Date</Th><Th>Bank ref</Th><Th>Reconciled</Th><Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => {
            const canReconcile = p.reconciled === 0 && p.from_participant_id === userId;
            return (
              <tr key={p.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
                <Td><span className="font-medium">{p.payment_reference}</span></Td>
                <Td>{p.invoice_number}</Td>
                <Td>{formatZAR(p.amount)}</Td>
                <Td><span className="uppercase text-xs">{p.payment_method}</span></Td>
                <Td>{new Date(p.payment_date).toLocaleDateString()}</Td>
                <Td className="font-mono text-xs">{p.bank_reference || '—'}</Td>
                <Td>{p.reconciled ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Clock className="w-4 h-4 text-amber-500" />}</Td>
                <Td>{canReconcile && <button onClick={() => onReconcile(p)} className="px-2 py-1 text-xs bg-ionex-brand text-white rounded">Reconcile</button>}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DisputeTable({ rows }: { rows: Dispute[] }) {
  return (
    <div className="bg-white border border-ionex-border-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-ionex-text-mute">
          <tr>
            <Th>Invoice</Th><Th>Filed by</Th><Th>Reason</Th><Th>Status</Th><Th>Filed</Th><Th>Resolved</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
              <Td><span className="font-medium">{d.invoice_number}</span><div className="text-xs text-ionex-text-mute">{formatZAR(d.total_amount)}</div></Td>
              <Td>{d.filed_by_name}</Td>
              <Td className="max-w-md"><div className="truncate" title={d.reason}>{d.reason}</div></Td>
              <Td><span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${STATUS_PILL[d.status] || 'bg-gray-100'}`}>{d.status.replace(/_/g, ' ')}</span></Td>
              <Td>{new Date(d.created_at).toLocaleDateString()}</Td>
              <Td>{d.resolved_at ? new Date(d.resolved_at).toLocaleDateString() : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-4 py-2">{children}</th>; }
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <td className={`px-4 py-2 ${className}`}>{children}</td>; }

function RecordPaymentModal({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const balance = invoice.total_amount - Number(invoice.paid_amount || 0);
  const [amount, setAmount] = useState<number>(balance);
  const [method, setMethod] = useState('eft');
  const [bankRef, setBankRef] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!amount || amount <= 0) { setErr('Enter a positive amount.'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.post('/settlement/payments', {
        invoice_id: invoice.id,
        amount,
        payment_method: method,
        bank_reference: bankRef || undefined,
        notes: notes || undefined,
      });
      onDone();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Record payment · ${invoice.invoice_number}`} onClose={onClose}>
      <p className="text-sm text-ionex-text-mute mb-3">
        Balance due: <span className="font-semibold text-gray-900">{formatZAR(balance)}</span>
      </p>
      {err && <ErrorBanner message={err} />}
      <LabelInput label="Amount (ZAR)" type="number" value={amount} onChange={v => setAmount(Number(v) || 0)} />
      <label className="block text-sm mt-3">
        <span className="text-ionex-text-mute">Payment method</span>
        <select value={method} onChange={e => setMethod(e.target.value)} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg">
          <option value="eft">EFT</option>
          <option value="swift">SWIFT</option>
          <option value="rtgs">RTGS</option>
          <option value="internal">Internal transfer</option>
        </select>
      </label>
      <LabelInput label="Bank reference (optional)" value={bankRef} onChange={setBankRef} />
      <LabelInput label="Notes (optional)" value={notes} onChange={setNotes} />
      <div className="flex justify-end gap-2 pt-4">
        <button onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light disabled:opacity-50">
          {saving ? 'Recording…' : 'Record payment'}
        </button>
      </div>
    </Modal>
  );
}

function FileDisputeModal({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 3) { setErr('Reason must be at least 3 characters.'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.post('/settlement/disputes', { invoice_id: invoice.id, reason });
      onDone();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to file dispute');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`File dispute · ${invoice.invoice_number}`} onClose={onClose}>
      {err && <ErrorBanner message={err} />}
      <label className="block text-sm">
        <span className="text-ionex-text-mute">Reason</span>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={5}
          placeholder="Describe the dispute reason (e.g. incorrect tariff, meter read error, duplicate invoice…)"
          className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg resize-none"
        />
      </label>
      <div className="flex justify-end gap-2 pt-4">
        <button onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
          {saving ? 'Filing…' : 'File dispute'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-ionex-border-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function LabelInput({ label, value, onChange, type = 'text' }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block text-sm mt-3">
      <span className="text-ionex-text-mute">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
    </label>
  );
}
