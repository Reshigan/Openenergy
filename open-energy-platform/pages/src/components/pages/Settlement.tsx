import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DollarSign, RefreshCw, Plus, X, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { api } from '../../lib/api';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { useAuth } from '../../lib/useAuth';
import { StitchPage } from '../StitchPage';
import { SettlementInsights } from '../widgets/SettlementInsights';
import { DisclosureTab } from '../settlement/DisclosureTab';
import { DvpPanel } from '../settlement/DvpPanel';
import { MarginGateWidget } from '../clearing/MarginGateWidget';

type Tab = 'insights' | 'invoices' | 'payments' | 'disputes' | 'breaks' | 'confirmations' | 'fees' | 'disclosure' | 'dvp' | 'margin-gate';

type SettlementFeeRow = {
  id: string;
  invoice_id: string;
  invoice_number?: string;
  fee_type: 'dunning' | 'late_payment' | 'rebooking' | 'admin' | 'wheeling_uplift' | 'imbalance_uplift';
  basis: string;
  amount_zar: number;
  reason: string | null;
  calc_rule_version: string;
  applied_after: string | null;
  calculated_at: string;
};

const FEE_TYPE_PILL: Record<string, string> = {
  dunning:         'bg-red-100 text-red-700',
  late_payment:    'bg-amber-100 text-amber-800',
  rebooking:       'bg-blue-100 text-blue-700',
  admin:           'bg-gray-100 text-gray-700',
  wheeling_uplift: 'bg-purple-100 text-purple-700',
  imbalance_uplift:'bg-rose-100 text-rose-700',
};

type Break = {
  id: string;
  invoice_id: string;
  invoice_number: string;
  break_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'rejected';
  reported_by: string;
  reported_at: string;
  reason: string;
  expected_value: number | null;
  actual_value: number | null;
  resolution_outcome: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
};

const BREAK_SEVERITY_PILL: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-700',
};
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
  // L4 settlement handshake state (migration 052). Pending until the
  // issuer confirms; once issuer-confirmed, the payer can acknowledge.
  // High/critical breaks auto-flip to 'disputed' server-side.
  confirmation_status?: 'pending' | 'issuer_confirmed' | 'payer_acknowledged' | 'disputed' | null;
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
  const [tab, setTab] = useState<Tab>('insights');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  // Unfiltered datasets for the summary tiles — fetched independently of
  // the active tab + filters so tiles are always accurate.
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [allDisputes, setAllDisputes] = useState<Dispute[]>([]);
  const [allBreaks, setAllBreaks] = useState<Break[]>([]);
  const [allFees, setAllFees] = useState<SettlementFeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [disputeInvoice, setDisputeInvoice] = useState<Invoice | null>(null);
  const [breakInvoice, setBreakInvoice] = useState<Invoice | null>(null);
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [fees, setFees] = useState<SettlementFeeRow[]>([]);

  const fetchSummary = useCallback(async () => {
    try {
      const [inv, pay, dsp, brk] = await Promise.all([
        api.get('/settlement/invoices'),
        api.get('/settlement/payments'),
        api.get('/settlement/disputes'),
        api.get('/settlement/breaks').catch(() => ({ data: { data: [] } })),
      ]);
      setAllInvoices(inv.data?.data || []);
      setAllPayments(pay.data?.data || []);
      setAllDisputes(dsp.data?.data || []);
      setAllBreaks((brk.data?.data as Break[]) || []);
      // Insights needs fees too — gather from first ~30 invoices.
      const feesAggregate: SettlementFeeRow[] = [];
      const sourceInvoices = ((inv.data?.data as Invoice[]) || []).slice(0, 30);
      for (const i of sourceInvoices) {
        try {
          const fr = await api.get(`/settlement/invoices/${i.id}/fees`);
          for (const f of (fr.data?.data as SettlementFeeRow[]) || []) feesAggregate.push(f);
        } catch { /* skip */ }
      }
      setAllFees(feesAggregate);
    } catch (err: any) {
      // Summary tile failures should not block the tab view; keep them silent.
      // eslint-disable-next-line no-console
      console.warn('Settlement summary fetch failed', err?.message || err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    // Wave 3 tabs manage their own data; skip the shared loader.
    if (tab === 'disclosure' || tab === 'dvp' || tab === 'margin-gate') {
      setLoading(false);
      return;
    }
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
      } else if (tab === 'disputes') {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        const res = await api.get(`/settlement/disputes?${params.toString()}`);
        setDisputes(res.data?.data || []);
      } else if (tab === 'breaks') {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        const res = await api.get(`/settlement/breaks?${params.toString()}`);
        setBreaks(res.data?.data || []);
      } else if (tab === 'confirmations') {
        // The Confirmations tab reuses the invoices endpoint — we filter
        // client-side by confirmation_status since the schema is the
        // same. Pull a generous batch.
        const res = await api.get('/settlement/invoices');
        setInvoices(res.data?.data || []);
      } else if (tab === 'fees') {
        // Aggregate fee ledger across the caller's invoices. Fetched
        // per-invoice and flattened so the SPA renders one table.
        const invRes = await api.get('/settlement/invoices');
        const list = (invRes.data?.data as Invoice[]) || [];
        const all: SettlementFeeRow[] = [];
        for (const inv of list.slice(0, 50)) {
          try {
            const fr = await api.get(`/settlement/invoices/${inv.id}/fees`);
            for (const f of (fr.data?.data as SettlementFeeRow[]) || []) {
              all.push({ ...f, invoice_number: inv.invoice_number });
            }
          } catch { /* skip invoices with no fees */ }
        }
        setFees(all);
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
    <StitchPage
      eyebrowIcon={DollarSign}
      eyebrowLabel="Settlement"
      title="Settlement"
      subtitle="Invoices, payments, reconciliation and disputes."
      actions={
        <button type="button" onClick={() => void refreshAll()} className="p-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50" aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Outstanding" value={formatZAR(summary.outstanding)} />
        <Tile label="Overdue invoices" value={String(summary.overdue)} accent={summary.overdue ? 'text-red-600' : undefined} />
        <Tile label="Open disputes" value={String(summary.openDisputes)} accent={summary.openDisputes ? 'text-amber-600' : undefined} />
        <Tile label="Unreconciled payments" value={String(summary.unreconciled)} accent={summary.unreconciled ? 'text-amber-600' : undefined} />
      </div>

      <div className="border-b border-ionex-border-100 flex gap-6 flex-wrap">
        {(([
          { k: 'insights', label: 'Insights' },
          { k: 'invoices', label: 'Invoices' },
          { k: 'payments', label: 'Payments' },
          { k: 'disputes', label: 'Disputes' },
          { k: 'breaks', label: 'Breaks' },
          { k: 'confirmations', label: 'Confirmations' },
          { k: 'fees', label: 'Fees' },
          // Wave 3 — CPMI/clearing surfaces, role-gated.
          ...(user && ['admin', 'support', 'regulator', 'lender', 'trader', 'risk'].includes(user.role)
            ? [{ k: 'disclosure' as Tab, label: 'Disclosure' }] : []),
          ...(user && ['admin', 'support'].includes(user.role)
            ? [{ k: 'dvp' as Tab, label: 'DvP' }] : []),
          ...(user && ['admin', 'support'].includes(user.role)
            ? [{ k: 'margin-gate' as Tab, label: 'Margin gate' }] : []),
        ]) as Array<{ k: Tab; label: string }>).map(t => (
          <button type="button"
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
            <button type="button" key={d} onClick={() => setDirectionFilter(d)} className={`px-3 py-1 rounded-full text-xs capitalize ${directionFilter === d ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>{d}</button>
          ))}
          <span className="text-sm text-ionex-text-mute ml-3">Status:</span>
          {(['all', 'issued', 'partial', 'paid', 'overdue', 'disputed'] as const).map(s => (
            <button type="button" key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 rounded-full text-xs capitalize ${statusFilter === s ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>{s}</button>
          ))}
        </div>
      )}

      {tab === 'disputes' && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-ionex-text-mute">Status:</span>
          {(['all', 'open', 'under_review', 'resolved', 'rejected'] as const).map(s => (
            <button type="button" key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 rounded-full text-xs capitalize ${statusFilter === s ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>{s.replace(/_/g, ' ')}</button>
          ))}
        </div>
      )}

      {tab === 'breaks' && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-ionex-text-mute">Status:</span>
          {(['all', 'open', 'investigating', 'resolved', 'rejected'] as const).map(s => (
            <button type="button" key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 rounded-full text-xs capitalize ${statusFilter === s ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>{s.replace(/_/g, ' ')}</button>
          ))}
        </div>
      )}

      {loading && <Skeleton variant="card" rows={4} />}
      {error && <ErrorBanner message={error} onRetry={() => void refreshAll()} />}

      {tab === 'insights' && (
        <SettlementInsights
          invoices={allInvoices}
          payments={allPayments}
          breaks={allBreaks}
          fees={allFees}
          userId={user?.id}
        />
      )}

      {!loading && !error && tab === 'invoices' && (
        invoices.length === 0
          ? <EmptyState icon={<DollarSign className="w-8 h-8" />} title="No invoices" description="Invoices issued to you or that you've issued will appear here." />
          : <InvoiceTable rows={invoices} userId={user?.id} onPay={setPayInvoice} onDispute={setDisputeInvoice} onBreak={setBreakInvoice} onAfterConfirm={() => void refreshAll()} />
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
      {!loading && !error && tab === 'breaks' && (
        breaks.length === 0
          ? <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="No settlement breaks" description="Exceptions filed against your invoices (quantity / price / timing / metering / tariff) will appear here." />
          : <BreaksTable rows={breaks} onTransition={async (id, to, notes, outcome) => {
              await api.post(`/settlement/breaks/${id}/transition`, { to, notes, outcome });
              void refreshAll();
            }} />
      )}
      {!loading && !error && tab === 'confirmations' && (
        <ConfirmationsQueue rows={invoices} userId={user?.id} onAfterAction={() => void refreshAll()} />
      )}
      {!loading && !error && tab === 'fees' && (
        fees.length === 0
          ? <EmptyState icon={<DollarSign className="w-8 h-8" />} title="No fees accrued" description="Late-payment / dunning / rebooking fees automatically accrue against unpaid invoices once the engine runs." />
          : <SettlementFeesTable rows={fees} />
      )}

      {tab === 'disclosure' && <DisclosureTab />}
      {tab === 'dvp' && <DvpPanel />}
      {tab === 'margin-gate' && <MarginGateWidget />}

      {payInvoice && (
        <RecordPaymentModal invoice={payInvoice} onClose={() => setPayInvoice(null)} onDone={() => { setPayInvoice(null); void refreshAll(); }} />
      )}
      {disputeInvoice && (
        <FileDisputeModal invoice={disputeInvoice} onClose={() => setDisputeInvoice(null)} onDone={() => { setDisputeInvoice(null); setTab('disputes'); setStatusFilter('all'); void fetchSummary(); }} />
      )}
      {breakInvoice && (
        <FileBreakModal invoice={breakInvoice} onClose={() => setBreakInvoice(null)} onDone={() => { setBreakInvoice(null); setTab('breaks'); setStatusFilter('all'); void refreshAll(); }} />
      )}
    </StitchPage>
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

const CONFIRMATION_PILL: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  issuer_confirmed: 'bg-blue-100 text-blue-700',
  payer_acknowledged: 'bg-green-100 text-green-700',
  disputed: 'bg-red-100 text-red-700',
};

async function postConfirm(invoiceId: string, party: 'issuer' | 'payer', status: 'confirmed' | 'rejected', notes?: string) {
  return api.post(`/settlement/invoices/${invoiceId}/confirm`, { party, status, notes });
}

function InvoiceTable({ rows, userId, onPay, onDispute, onBreak, onAfterConfirm }: { rows: Invoice[]; userId?: string; onPay: (i: Invoice) => void; onDispute: (i: Invoice) => void; onBreak?: (i: Invoice) => void; onAfterConfirm?: () => void }) {
  return (
    <div className="bg-white border border-ionex-border-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-ionex-text-mute">
          <tr>
            <Th>Invoice</Th><Th>From</Th><Th>To</Th><Th>Amount</Th><Th>Paid</Th><Th>Due</Th><Th>Status</Th><Th>Confirmation</Th><Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isPayer = r.to_participant_id === userId;
            const isIssuer = r.from_participant_id === userId;
            const canPay = isPayer && ['issued', 'partial', 'overdue'].includes(r.status);
            const canDispute = isPayer && ['issued', 'partial', 'overdue'].includes(r.status);
            const conf = r.confirmation_status || 'pending';
            // Issuer confirms first (pending → issuer_confirmed). Then payer can
            // acknowledge. Either side can reject at any non-terminal stage.
            const canIssuerConfirm = isIssuer && conf === 'pending';
            const canPayerAck = isPayer && conf === 'issuer_confirmed';
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
                  <span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${CONFIRMATION_PILL[conf] || 'bg-gray-100'}`}>
                    {conf.replace(/_/g, ' ')}
                  </span>
                </Td>
                <Td>
                  <div className="flex gap-1">
                    {canIssuerConfirm && (
                      <button type="button"
                        onClick={async () => { try { await postConfirm(r.id, 'issuer', 'confirmed'); onAfterConfirm?.(); } catch { /* surface via reload */ } }}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded"
                        title="Issuer confirms this invoice is correct as issued"
                      >Confirm</button>
                    )}
                    {canPayerAck && (
                      <button type="button"
                        onClick={async () => { try { await postConfirm(r.id, 'payer', 'confirmed'); onAfterConfirm?.(); } catch { /* surface via reload */ } }}
                        className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded"
                        title="Payer acknowledges this invoice"
                      >Acknowledge</button>
                    )}
                    {canPay && <button type="button" onClick={() => onPay(r)} className="px-2 py-1 text-xs bg-ionex-brand text-white rounded">Pay</button>}
                    {canDispute && <button type="button" onClick={() => onDispute(r)} className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded">Dispute</button>}
                    {onBreak && (isPayer || isIssuer) && r.status !== 'cancelled' && (
                      <button type="button" onClick={() => onBreak(r)} className="px-2 py-1 text-xs bg-amber-50 text-amber-800 rounded" title="File a settlement break">Break</button>
                    )}
                    {isIssuer && !canPay && !onBreak && !canIssuerConfirm && !canPayerAck && <span className="text-xs text-ionex-text-mute">—</span>}
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
                <Td>{canReconcile && <button type="button" onClick={() => onReconcile(p)} className="px-2 py-1 text-xs bg-ionex-brand text-white rounded">Reconcile</button>}</Td>
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
        <button type="button" onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light disabled:opacity-50">
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
        <button type="button" onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
          {saving ? 'Filing…' : 'File dispute'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEscapeKey(onClose);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-ionex-border-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
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


// ─── Settlement breaks ────────────────────────────────────────────────
//
// A break is filed against an invoice when issuer + payer disagree on a
// dimension that does NOT warrant a full dispute (quantity / price /
// timing / metering / tariff / fx). The state machine is
// open → investigating → resolved | rejected; terminal transitions
// require notes. High/critical breaks auto-flip the invoice to
// confirmation_status='disputed' on the backend.

function BreaksTable({
  rows,
  onTransition,
}: {
  rows: Break[];
  onTransition: (id: string, to: 'investigating' | 'resolved' | 'rejected', notes: string, outcome?: string) => Promise<void>;
}) {
  const [transitioning, setTransitioning] = useState<Break | null>(null);
  return (
    <div className="bg-white border border-ionex-border-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-ionex-text-mute">
          <tr>
            <Th>Invoice</Th><Th>Type</Th><Th>Severity</Th><Th>Status</Th><Th>Reported</Th><Th>Reason</Th><Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(b => (
            <tr key={b.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
              <Td><span className="font-medium">{b.invoice_number}</span></Td>
              <Td className="capitalize">{b.break_type.replace(/_/g, ' ')}</Td>
              <Td>
                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${BREAK_SEVERITY_PILL[b.severity] || 'bg-gray-100'}`}>{b.severity}</span>
              </Td>
              <Td><span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${STATUS_PILL[b.status] || 'bg-gray-100'}`}>{b.status.replace(/_/g, ' ')}</span></Td>
              <Td>{new Date(b.reported_at).toLocaleDateString()}</Td>
              <Td className="max-w-md"><span className="block truncate" title={b.reason}>{b.reason}</span></Td>
              <Td>
                <div className="flex gap-1">
                  {b.status === 'open' && (
                    <button type="button" onClick={() => onTransition(b.id, 'investigating', '')} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">Investigate</button>
                  )}
                  {(b.status === 'open' || b.status === 'investigating') && (
                    <>
                      <button type="button" onClick={() => setTransitioning({ ...b, status: 'resolved' as any })} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded">Resolve</button>
                      <button type="button" onClick={() => setTransitioning({ ...b, status: 'rejected' as any })} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">Reject</button>
                    </>
                  )}
                  {(b.status === 'resolved' || b.status === 'rejected') && (
                    <span className="text-xs text-ionex-text-mute">{b.resolution_outcome ? `outcome: ${b.resolution_outcome.replace(/_/g, ' ')}` : '—'}</span>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
      {transitioning && (
        <ResolveBreakModal
          breakRow={transitioning}
          onClose={() => setTransitioning(null)}
          onDone={async (notes, outcome) => {
            const to = transitioning.status as 'resolved' | 'rejected';
            setTransitioning(null);
            await onTransition(transitioning.id, to, notes, outcome);
          }}
        />
      )}
    </div>
  );
}

function ResolveBreakModal({
  breakRow,
  onClose,
  onDone,
}: {
  breakRow: Break;
  onClose: () => void;
  onDone: (notes: string, outcome: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<string>(breakRow.status === 'resolved' ? 'corrected' : 'no_action');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (notes.trim().length < 3) { setErr('Notes ≥3 chars required.'); return; }
    setSaving(true); setErr(null);
    try { await onDone(notes, outcome); } catch (e: any) { setErr(e?.message || 'Failed'); setSaving(false); }
  };
  const isResolved = breakRow.status === 'resolved';
  return (
    <Modal title={`${isResolved ? 'Resolve' : 'Reject'} break · ${breakRow.invoice_number}`} onClose={onClose}>
      {err && <ErrorBanner message={err} />}
      <div className="text-sm text-ionex-text-mute mb-3">{breakRow.reason}</div>
      <label className="block text-sm mt-3">
        <span className="text-ionex-text-mute">Outcome</span>
        <select value={outcome} onChange={e => setOutcome(e.target.value)} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg">
          {isResolved ? (
            <>
              <option value="corrected">Corrected</option>
              <option value="rebooked">Rebooked</option>
              <option value="waived">Waived</option>
              <option value="escalated">Escalated</option>
            </>
          ) : (
            <>
              <option value="no_action">No action — break not substantiated</option>
              <option value="escalated">Escalate to dispute</option>
            </>
          )}
        </select>
      </label>
      <label className="block text-sm mt-3">
        <span className="text-ionex-text-mute">Notes</span>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="What changed? Required ≥3 chars." className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg resize-none" />
      </label>
      <div className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="button" onClick={submit} disabled={saving} className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${isResolved ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'}`}>
          {saving ? 'Saving…' : (isResolved ? 'Resolve' : 'Reject')}
        </button>
      </div>
    </Modal>
  );
}

function FileBreakModal({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [breakType, setBreakType] = useState<string>('quantity');
  const [severity, setSeverity] = useState<string>('medium');
  const [reason, setReason] = useState<string>('');
  const [expected, setExpected] = useState<string>('');
  const [actual, setActual] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (reason.trim().length < 3) { setErr('Reason ≥3 chars required.'); return; }
    setSaving(true); setErr(null);
    try {
      await api.post(`/settlement/invoices/${invoice.id}/breaks`, {
        break_type: breakType,
        severity,
        reason,
        expected_value: expected ? Number(expected) : undefined,
        actual_value: actual ? Number(actual) : undefined,
      });
      onDone();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e.message || 'Failed to file break');
      setSaving(false);
    }
  };
  return (
    <Modal title={`File a settlement break · ${invoice.invoice_number}`} onClose={onClose}>
      {err && <ErrorBanner message={err} />}
      <label className="block text-sm mt-2">
        <span className="text-ionex-text-mute">Break type</span>
        <select value={breakType} onChange={e => setBreakType(e.target.value)} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg">
          <option value="quantity">Quantity (volume mismatch)</option>
          <option value="price">Price (tariff or rate disagreement)</option>
          <option value="timing">Timing (period or due date)</option>
          <option value="metering">Metering (reading or source)</option>
          <option value="tariff">Tariff (regulated band breach)</option>
          <option value="fx">FX (rate or date mismatch)</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="block text-sm mt-3">
        <span className="text-ionex-text-mute">Severity</span>
        <select value={severity} onChange={e => setSeverity(e.target.value)} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High — auto-disputes invoice</option>
          <option value="critical">Critical — auto-disputes invoice</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <LabelInput label="Expected value" type="number" value={expected} onChange={setExpected} />
        <LabelInput label="Actual value" type="number" value={actual} onChange={setActual} />
      </div>
      <label className="block text-sm mt-3">
        <span className="text-ionex-text-mute">Reason</span>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="What disagreement? At least 3 characters." className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg resize-none" />
      </label>
      <div className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
          {saving ? 'Filing…' : 'File break'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Settlement confirmations queue ──────────────────────────────────

function ConfirmationsQueue({
  rows,
  userId,
  onAfterAction,
}: {
  rows: Invoice[];
  userId?: string;
  onAfterAction: () => void;
}) {
  const buckets: Record<string, Invoice[]> = {
    pending: [], issuer_confirmed: [], payer_acknowledged: [], disputed: [],
  };
  for (const r of rows) {
    const k = (r.confirmation_status as string | undefined) || 'pending';
    if (!buckets[k]) buckets[k] = [];
    buckets[k].push(r);
  }
  return (
    <div className="space-y-4">
      {(['pending', 'issuer_confirmed', 'payer_acknowledged', 'disputed'] as const).map(state => (
        <section key={state}>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide mb-2 flex items-center gap-2" style={{ color: '#6b7685' }}>
            <span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${CONFIRMATION_PILL[state]}`}>{state.replace(/_/g, ' ')}</span>
            <span>{buckets[state].length} invoice{buckets[state].length === 1 ? '' : 's'}</span>
          </h3>
          {buckets[state].length === 0 ? (
            <div className="rounded-xl border border-ionex-border-100 bg-white p-4 text-[12px] text-ionex-text-mute">None.</div>
          ) : (
            <div className="rounded-xl border border-ionex-border-100 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-ionex-text-mute">
                  <tr>
                    <Th>Invoice</Th><Th>From</Th><Th>To</Th><Th>Amount</Th><Th>Due</Th><Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {buckets[state].map(r => {
                    const isPayer = r.to_participant_id === userId;
                    const isIssuer = r.from_participant_id === userId;
                    const canIssuerConfirm = isIssuer && state === 'pending';
                    const canPayerAck = isPayer && state === 'issuer_confirmed';
                    return (
                      <tr key={r.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
                        <Td><span className="font-medium">{r.invoice_number}</span></Td>
                        <Td>{r.from_name}</Td>
                        <Td>{r.to_name}</Td>
                        <Td>{formatZAR(r.total_amount)}</Td>
                        <Td>{r.due_date ? new Date(r.due_date).toLocaleDateString() : '—'}</Td>
                        <Td>
                          <div className="flex gap-1">
                            {canIssuerConfirm && (
                              <button type="button" onClick={async () => { try { await postConfirm(r.id, 'issuer', 'confirmed'); onAfterAction(); } catch { /* */ } }} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">Confirm</button>
                            )}
                            {canPayerAck && (
                              <button type="button" onClick={async () => { try { await postConfirm(r.id, 'payer', 'confirmed'); onAfterAction(); } catch { /* */ } }} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded">Acknowledge</button>
                            )}
                            {!canIssuerConfirm && !canPayerAck && (
                              <span className="text-xs text-ionex-text-mute">—</span>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

// ─── Settlement fees ledger ──────────────────────────────────────────

function SettlementFeesTable({ rows }: { rows: SettlementFeeRow[] }) {
  const total = rows.reduce((s, r) => s + (r.amount_zar || 0), 0);
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.fee_type] = (byType[r.fee_type] || 0) + (r.amount_zar || 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-ionex-border-100 bg-white p-3">
          <div className="text-[10px] uppercase tracking-wide text-ionex-text-mute">Total</div>
          <div className="mt-1 text-[18px] font-bold">{formatZAR(total)}</div>
        </div>
        {Object.keys(byType).sort().map(k => (
          <div key={k} className="rounded-xl border border-ionex-border-100 bg-white p-3">
            <div className="text-[10px] uppercase tracking-wide text-ionex-text-mute">{k.replace(/_/g, ' ')}</div>
            <div className="mt-1 text-[18px] font-bold">{formatZAR(byType[k])}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-ionex-border-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-ionex-text-mute">
            <tr>
              <Th>When</Th><Th>Type</Th><Th>Invoice</Th><Th>Basis</Th>
              <Th>Reason</Th><Th>Rule</Th><Th>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
                <Td>{new Date(r.calculated_at).toLocaleString()}</Td>
                <Td><span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${FEE_TYPE_PILL[r.fee_type] || 'bg-gray-100'}`}>{r.fee_type.replace(/_/g, ' ')}</span></Td>
                <Td><span className="font-medium">{r.invoice_number || r.invoice_id.slice(0, 10) + '…'}</span></Td>
                <Td>{r.basis}</Td>
                <Td className="max-w-md"><span className="block truncate" title={r.reason || ''}>{r.reason || '—'}</span></Td>
                <Td><span className="text-[10px] font-mono text-ionex-text-mute">{r.calc_rule_version}</span></Td>
                <Td className="font-medium">{formatZAR(r.amount_zar)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
