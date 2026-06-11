import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { ErrorBanner } from '../ErrorBanner';
import { useAuth } from '../../lib/useAuth';
import { SettlementInsights } from '../widgets/SettlementInsights';
import { DisclosureTab } from '../settlement/DisclosureTab';
import { DvpPanel } from '../settlement/DvpPanel';
import { MarginGateWidget } from '../clearing/MarginGateWidget';

// ─── Design tokens ────────────────────────────────────────────────────
const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const ACC_BG  = 'oklch(0.96 0.05 55)';
const ACC_BDR = 'oklch(0.80 0.12 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const WARN    = 'oklch(0.50 0.18 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

// ─── Types ────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────
const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

function KpiTile({ label, value, tone, sub }: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'bad'; sub?: string }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px', minWidth: 100 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: TX3, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const bg = s === 'paid' || s === 'resolved' || s === 'payer_acknowledged'
    ? 'oklch(0.95 0.04 155)'
    : s === 'pending' || s === 'issuer_confirmed' || s === 'issued' || s === 'open' || s === 'partial'
    ? ACC_BG
    : s === 'failed' || s === 'rejected' || s === 'expired' || s === 'overdue' || s === 'disputed'
    ? 'oklch(0.97 0.04 20)'
    : BG2;
  const color = s === 'paid' || s === 'resolved' || s === 'payer_acknowledged'
    ? GOOD
    : s === 'pending' || s === 'issuer_confirmed' || s === 'issued' || s === 'open' || s === 'partial'
    ? ACC
    : s === 'failed' || s === 'rejected' || s === 'expired' || s === 'overdue' || s === 'disputed'
    ? BAD
    : TX2;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, background: bg, color, padding: '1px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

async function postConfirm(invoiceId: string, party: 'issuer' | 'payer', status: 'confirmed' | 'rejected', notes?: string) {
  return api.post(`/settlement/invoices/${invoiceId}/confirm`, { party, status, notes });
}

// ─── Main component ───────────────────────────────────────────────────
export function Settlement() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('insights');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
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
      const feesAggregate: SettlementFeeRow[] = [];
      const sourceInvoices = ((inv.data?.data as Invoice[]) || []).slice(0, 30);
      for (const i of sourceInvoices) {
        try {
          const fr = await api.get(`/settlement/invoices/${i.id}/fees`);
          for (const f of (fr.data?.data as SettlementFeeRow[]) || []) feesAggregate.push(f);
        } catch { /* skip */ }
      }
      setAllFees(feesAggregate);
    } catch { /* non-blocking */ }
  }, []);

  const fetchData = useCallback(async () => {
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
        const res = await api.get('/settlement/invoices');
        setInvoices(res.data?.data || []);
      } else if (tab === 'fees') {
        const invRes = await api.get('/settlement/invoices');
        const list = (invRes.data?.data as Invoice[]) || [];
        const all: SettlementFeeRow[] = [];
        for (const inv of list.slice(0, 50)) {
          try {
            const fr = await api.get(`/settlement/invoices/${inv.id}/fees`);
            for (const f of (fr.data?.data as SettlementFeeRow[]) || []) {
              all.push({ ...f, invoice_number: inv.invoice_number });
            }
          } catch { /* skip */ }
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
  useEffect(() => { void fetchSummary(); }, [fetchSummary]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchData(), fetchSummary()]);
  }, [fetchData, fetchSummary]);

  const reconcilePayment = useCallback(async (p: Payment) => {
    const bankRef = prompt('Bank statement reference (optional):', p.bank_reference || '');
    if (bankRef === null) return;
    try {
      await api.post(`/settlement/payments/${p.id}/reconcile`, { bank_reference: bankRef || undefined });
      await refreshAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to reconcile');
    }
  }, [refreshAll]);

  const summary = useMemo(() => {
    const outstanding = allInvoices
      .filter(i => ['issued', 'partial', 'overdue'].includes(i.status))
      .reduce((sum, i) => sum + (i.total_amount - Number(i.paid_amount || 0)), 0);
    const overdue = allInvoices.filter(i => i.status === 'overdue').length;
    const openDisputes = allDisputes.filter(d => ['open', 'under_review'].includes(d.status)).length;
    const unreconciled = allPayments.filter(p => p.reconciled === 0 && p.from_participant_id === user?.id).length;
    const totalPaid = allInvoices
      .filter(i => i.status === 'paid')
      .reduce((s, i) => s + i.total_amount, 0);
    const totalInvoiced = allInvoices.reduce((s, i) => s + i.total_amount, 0);
    const settleRate = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0;
    const openBreaks = allBreaks.filter(b => b.status === 'open' || b.status === 'investigating').length;
    return { outstanding, overdue, openDisputes, unreconciled, totalPaid, settleRate, openBreaks };
  }, [allInvoices, allDisputes, allPayments, allBreaks, user?.id]);

  // Activity feed: derive recent events from allInvoices + allPayments + allDisputes
  const recentActivity = useMemo(() => {
    type Event = { id: string; label: string; sub: string; time: string; tone?: 'bad' | 'warn' | 'ok' };
    const events: Event[] = [];
    for (const inv of allInvoices.slice(0, 8)) {
      events.push({
        id: `inv-${inv.id}`,
        label: `Invoice ${inv.invoice_number}`,
        sub: `${inv.from_name} → ${inv.to_name} · ${formatZAR(inv.total_amount)}`,
        time: inv.created_at,
        tone: inv.status === 'overdue' || inv.status === 'disputed' ? 'bad' : inv.status === 'paid' ? 'ok' : undefined,
      });
    }
    for (const pay of allPayments.slice(0, 5)) {
      events.push({
        id: `pay-${pay.id}`,
        label: `Payment ${pay.payment_reference}`,
        sub: `${pay.from_name} · ${formatZAR(pay.amount)}`,
        time: pay.payment_date,
        tone: pay.reconciled ? 'ok' : 'warn',
      });
    }
    for (const dsp of allDisputes.slice(0, 4)) {
      events.push({
        id: `dsp-${dsp.id}`,
        label: `Dispute · ${dsp.invoice_number}`,
        sub: dsp.reason.slice(0, 60),
        time: dsp.created_at,
        tone: dsp.status === 'resolved' ? 'ok' : 'bad',
      });
    }
    return events
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 20);
  }, [allInvoices, allPayments, allDisputes]);

  const TABS: Array<{ k: Tab; label: string }> = [
    { k: 'insights', label: 'Insights' },
    { k: 'invoices', label: 'Invoices' },
    { k: 'payments', label: 'Payments' },
    { k: 'disputes', label: 'Disputes' },
    { k: 'breaks', label: 'Breaks' },
    { k: 'confirmations', label: 'Confirmations' },
    { k: 'fees', label: 'Fees' },
    ...(user && ['admin', 'support', 'regulator', 'lender', 'trader', 'risk'].includes(user.role)
      ? [{ k: 'disclosure' as Tab, label: 'Disclosure' }] : []),
    ...(user && ['admin', 'support'].includes(user.role)
      ? [{ k: 'dvp' as Tab, label: 'DvP' }] : []),
    ...(user && ['admin', 'support'].includes(user.role)
      ? [{ k: 'margin-gate' as Tab, label: 'Margin Gate' }] : []),
  ];

  const isWave3Tab = tab === 'disclosure' || tab === 'dvp' || tab === 'margin-gate';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, height: 'calc(100vh - 50px)', overflow: 'hidden', background: BG, padding: '16px 20px' }}>
      {/* LEFT column */}
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header */}
        <header style={{ background: BG1, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: TX1 }}>Settlement</h1>
              <p style={{ fontSize: 11, color: TX2, marginTop: 3 }}>Invoices, payments, reconciliation and disputes.</p>
            </div>
            <button
              type="button"
              onClick={() => void refreshAll()}
              style={{ padding: '6px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, background: BG1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TX2 }}
              aria-label="Refresh"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </header>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <KpiTile label="Outstanding" value={formatZAR(summary.outstanding)} tone={summary.outstanding > 0 ? 'warn' : 'ok'} />
          <KpiTile label="Total Settled" value={formatZAR(summary.totalPaid)} tone="ok" />
          <KpiTile label="Settle Rate" value={`${summary.settleRate}%`} tone={summary.settleRate >= 80 ? 'ok' : summary.settleRate >= 50 ? 'warn' : 'bad'} />
          <KpiTile label="Overdue" value={summary.overdue} tone={summary.overdue > 0 ? 'bad' : 'ok'} />
          <KpiTile label="Open Disputes" value={summary.openDisputes} tone={summary.openDisputes > 0 ? 'bad' : 'ok'} />
          <KpiTile label="Open Breaks" value={summary.openBreaks} tone={summary.openBreaks > 0 ? 'warn' : 'ok'} />
          <KpiTile label="Unreconciled" value={summary.unreconciled} tone={summary.unreconciled > 0 ? 'warn' : 'ok'} />
        </div>

        {/* Tab bar */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 8px', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button
              key={t.k}
              type="button"
              onClick={() => { setTab(t.k); setStatusFilter('all'); }}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                background: tab === t.k ? ACC_BG : 'transparent',
                color: tab === t.k ? ACC : TX2,
                fontWeight: tab === t.k ? 700 : 400,
                fontSize: 12,
                cursor: 'pointer',
                letterSpacing: '0.01em',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filter pills */}
        {tab === 'invoices' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: TX3 }}>Direction:</span>
            {(['all', 'incoming', 'outgoing'] as const).map(d => (
              <FilterPill key={d} label={d} active={directionFilter === d} onClick={() => setDirectionFilter(d)} />
            ))}
            <span style={{ fontSize: 11, color: TX3, marginLeft: 8 }}>Status:</span>
            {(['all', 'issued', 'partial', 'paid', 'overdue', 'disputed'] as const).map(s => (
              <FilterPill key={s} label={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
            ))}
          </div>
        )}
        {tab === 'disputes' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: TX3 }}>Status:</span>
            {(['all', 'open', 'under_review', 'resolved', 'rejected'] as const).map(s => (
              <FilterPill key={s} label={s.replace(/_/g, ' ')} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
            ))}
          </div>
        )}
        {tab === 'breaks' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: TX3 }}>Status:</span>
            {(['all', 'open', 'investigating', 'resolved', 'rejected'] as const).map(s => (
              <FilterPill key={s} label={s.replace(/_/g, ' ')} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
            ))}
          </div>
        )}

        {/* Error */}
        {error && <ErrorBanner message={error} onRetry={() => void refreshAll()} />}

        {/* Loading skeleton */}
        {loading && !isWave3Tab && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: 52, background: BG2, borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        )}

        {/* Tab content */}
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
            ? <EmptyCard icon="$" title="No invoices" desc="Invoices issued to you or that you've issued will appear here." />
            : <InvoiceList rows={invoices} userId={user?.id} onPay={setPayInvoice} onDispute={setDisputeInvoice} onBreak={setBreakInvoice} onAfterConfirm={() => void refreshAll()} />
        )}

        {!loading && !error && tab === 'payments' && (
          payments.length === 0
            ? <EmptyCard icon="$" title="No payments" desc="Recorded payments will appear here." />
            : <PaymentList rows={payments} userId={user?.id} onReconcile={reconcilePayment} />
        )}

        {!loading && !error && tab === 'disputes' && (
          disputes.length === 0
            ? <EmptyCard icon="!" title="No disputes" desc="Invoice disputes filed by either party will appear here." />
            : <DisputeList rows={disputes} />
        )}

        {!loading && !error && tab === 'breaks' && (
          breaks.length === 0
            ? <EmptyCard icon="!" title="No settlement breaks" desc="Exceptions filed against your invoices will appear here." />
            : <BreaksList rows={breaks} onTransition={async (id, to, notes, outcome) => {
                await api.post(`/settlement/breaks/${id}/transition`, { to, notes, outcome });
                void refreshAll();
              }} />
        )}

        {!loading && !error && tab === 'confirmations' && (
          <ConfirmationsQueue rows={invoices} userId={user?.id} onAfterAction={() => void refreshAll()} />
        )}

        {!loading && !error && tab === 'fees' && (
          fees.length === 0
            ? <EmptyCard icon="$" title="No fees accrued" desc="Late-payment / dunning / rebooking fees automatically accrue against unpaid invoices once the engine runs." />
            : <FeesLedger rows={fees} />
        )}

        {tab === 'disclosure' && <DisclosureTab />}
        {tab === 'dvp' && <DvpPanel />}
        {tab === 'margin-gate' && <MarginGateWidget />}
      </div>

      {/* RIGHT column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        {/* AI assist */}
        <div style={{ background: ACC_BG, borderRadius: 10, border: `1px solid ${ACC_BDR}`, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: ACC, marginBottom: 6, letterSpacing: '0.06em' }}>AI ASSIST</div>
          <div style={{ fontSize: 12, color: TX1, lineHeight: 1.55 }}>
            {summary.overdue > 0
              ? `${summary.overdue} overdue invoice${summary.overdue > 1 ? 's' : ''} detected. Initiate dunning or file a break before the 30-day SLA window closes.`
              : summary.openDisputes > 0
              ? `${summary.openDisputes} open dispute${summary.openDisputes > 1 ? 's' : ''} pending review. Resolve early to avoid credit-hold escalation.`
              : summary.unreconciled > 0
              ? `${summary.unreconciled} payment${summary.unreconciled > 1 ? 's' : ''} unreconciled. Attach bank references to close the clearing gap.`
              : 'Settlement is current. No urgent actions detected.'}
          </div>
          {(summary.overdue > 0 || summary.openDisputes > 0 || summary.unreconciled > 0) && (
            <div style={{ marginTop: 8, fontSize: 11, color: TX3 }}>
              Settlement rate: <span style={{ fontFamily: MONO, color: summary.settleRate >= 80 ? GOOD : WARN }}>{summary.settleRate}%</span>
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div style={{ flex: 1, background: BG1, borderRadius: 10, border: `1px solid ${BORDER}`, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 700, color: TX3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Recent Activity
          </div>
          {recentActivity.length === 0 ? (
            <div style={{ padding: 20, fontSize: 12, color: TX3, textAlign: 'center' }}>No activity yet.</div>
          ) : (
            recentActivity.map(ev => (
              <ActivityRow key={ev.id} label={ev.label} sub={ev.sub} time={ev.time} tone={ev.tone} />
            ))
          )}
        </div>

        {/* Summary panel */}
        <div style={{ background: BG1, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Portfolio</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { k: 'Total invoiced', v: formatZAR(allInvoices.reduce((s, i) => s + i.total_amount, 0)) },
              { k: 'Total paid', v: formatZAR(summary.totalPaid) },
              { k: 'Outstanding', v: formatZAR(summary.outstanding) },
              { k: 'Invoices', v: String(allInvoices.length) },
              { k: 'Payments', v: String(allPayments.length) },
              { k: 'Disputes', v: String(allDisputes.length) },
            ].map(row => (
              <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: TX3 }}>{row.k}</span>
                <span style={{ fontFamily: MONO, color: TX1, fontWeight: 600 }}>{row.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      {payInvoice && (
        <RecordPaymentModal invoice={payInvoice} onClose={() => setPayInvoice(null)} onDone={() => { setPayInvoice(null); void refreshAll(); }} />
      )}
      {disputeInvoice && (
        <FileDisputeModal invoice={disputeInvoice} onClose={() => setDisputeInvoice(null)} onDone={() => { setDisputeInvoice(null); setTab('disputes'); setStatusFilter('all'); void fetchSummary(); }} />
      )}
      {breakInvoice && (
        <FileBreakModal invoice={breakInvoice} onClose={() => setBreakInvoice(null)} onDone={() => { setBreakInvoice(null); setTab('breaks'); setStatusFilter('all'); void refreshAll(); }} />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: 20,
        border: `1px solid ${active ? ACC_BDR : BORDER}`,
        background: active ? ACC_BG : BG1,
        color: active ? ACC : TX2,
        fontSize: 11,
        fontWeight: active ? 700 : 400,
        cursor: 'pointer',
        textTransform: 'capitalize',
      }}
    >
      {label}
    </button>
  );
}

function EmptyCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '32px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 8, color: TX3 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: TX1, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: TX3 }}>{desc}</div>
    </div>
  );
}

function ActivityRow({ label, sub, time, tone }: { label: string; sub: string; time: string; tone?: 'bad' | 'warn' | 'ok' }) {
  const dot = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX3;
  return (
    <div style={{ display: 'flex', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${BORDER}`, alignItems: 'flex-start' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: TX1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 10, color: TX3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      </div>
      <div style={{ fontSize: 10, color: TX3, fontFamily: MONO, flexShrink: 0, marginTop: 1 }}>
        {new Date(time).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}
      </div>
    </div>
  );
}

function RowItem({ children, hover, onClick }: { children: React.ReactNode; hover?: boolean; onClick?: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: `1px solid ${BORDER}`,
        cursor: onClick ? 'pointer' : 'default',
        background: hov && hover ? BG2 : BG1,
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

// ─── Invoice list ─────────────────────────────────────────────────────
function InvoiceList({ rows, userId, onPay, onDispute, onBreak, onAfterConfirm }: {
  rows: Invoice[];
  userId?: string;
  onPay: (i: Invoice) => void;
  onDispute: (i: Invoice) => void;
  onBreak?: (i: Invoice) => void;
  onAfterConfirm?: () => void;
}) {
  return (
    <div style={{ background: BG1, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 120px 120px 100px', padding: '7px 16px', borderBottom: `1px solid ${BORDER}`, background: BG2 }}>
        {['Invoice', 'From', 'To', 'Amount', 'Due', 'Status'].map(h => (
          <div key={h} style={{ fontSize: 9, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
        ))}
      </div>
      {rows.map(r => {
        const isPayer = r.to_participant_id === userId;
        const isIssuer = r.from_participant_id === userId;
        const canPay = isPayer && ['issued', 'partial', 'overdue'].includes(r.status);
        const canDispute = isPayer && ['issued', 'partial', 'overdue'].includes(r.status);
        const conf = r.confirmation_status || 'pending';
        const canIssuerConfirm = isIssuer && conf === 'pending';
        const canPayerAck = isPayer && conf === 'issuer_confirmed';
        return (
          <div key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 120px 120px 100px', padding: '10px 16px', alignItems: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TX1, fontFamily: MONO }}>{r.invoice_number}</div>
              <div style={{ fontSize: 12, color: TX2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{r.from_name}</div>
              <div style={{ fontSize: 12, color: TX2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{r.to_name}</div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: TX1 }}>{formatZAR(r.total_amount)}</div>
              <div style={{ fontSize: 11, color: TX3, fontFamily: MONO }}>{r.due_date ? new Date(r.due_date).toLocaleDateString('en-ZA') : '—'}</div>
              <StatusPill status={r.status} />
            </div>
            <div style={{ display: 'flex', gap: 6, padding: '4px 16px 8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: TX3 }}>Confirmation:</span>
              <StatusPill status={conf.replace(/_/g, ' ')} />
              <div style={{ flex: 1 }} />
              {canIssuerConfirm && (
                <ActionBtn color="blue" onClick={async () => { try { await postConfirm(r.id, 'issuer', 'confirmed'); onAfterConfirm?.(); } catch { /* */ } }}>Confirm</ActionBtn>
              )}
              {canPayerAck && (
                <ActionBtn color="green" onClick={async () => { try { await postConfirm(r.id, 'payer', 'confirmed'); onAfterConfirm?.(); } catch { /* */ } }}>Acknowledge</ActionBtn>
              )}
              {canPay && <ActionBtn color="accent" onClick={() => onPay(r)}>Pay</ActionBtn>}
              {canDispute && <ActionBtn color="red" onClick={() => onDispute(r)}>Dispute</ActionBtn>}
              {onBreak && (isPayer || isIssuer) && r.status !== 'cancelled' && (
                <ActionBtn color="warn" onClick={() => onBreak(r)}>Break</ActionBtn>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Payment list ─────────────────────────────────────────────────────
function PaymentList({ rows, userId, onReconcile }: { rows: Payment[]; userId?: string; onReconcile: (p: Payment) => void }) {
  return (
    <div style={{ background: BG1, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 110px 110px 90px 100px 60px auto', padding: '7px 16px', borderBottom: `1px solid ${BORDER}`, background: BG2 }}>
        {['Reference', 'Invoice', 'Amount', 'Method', 'Date', 'Rec', ''].map((h, i) => (
          <div key={i} style={{ fontSize: 9, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
        ))}
      </div>
      {rows.map(p => {
        const canReconcile = p.reconciled === 0 && p.from_participant_id === userId;
        return (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '150px 110px 110px 90px 100px 60px auto', padding: '10px 16px', alignItems: 'center', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX1, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.payment_reference}</div>
            <div style={{ fontSize: 12, color: TX2, fontFamily: MONO }}>{p.invoice_number}</div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: TX1 }}>{formatZAR(p.amount)}</div>
            <div style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.payment_method}</div>
            <div style={{ fontSize: 11, color: TX3, fontFamily: MONO }}>{new Date(p.payment_date).toLocaleDateString('en-ZA')}</div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: p.reconciled ? GOOD : WARN }}>{p.reconciled ? 'YES' : 'NO'}</span>
            </div>
            <div>
              {canReconcile && <ActionBtn color="accent" onClick={() => onReconcile(p)}>Reconcile</ActionBtn>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Dispute list ─────────────────────────────────────────────────────
function DisputeList({ rows }: { rows: Dispute[] }) {
  return (
    <div style={{ background: BG1, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      {rows.map(d => (
        <RowItem key={d.id} hover>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: TX1, fontFamily: MONO }}>{d.invoice_number}</span>
              <StatusPill status={d.status} />
            </div>
            <div style={{ fontSize: 11, color: TX2, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.reason}</div>
            <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>Filed by {d.filed_by_name} · {formatZAR(d.total_amount)}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontFamily: MONO, color: TX3 }}>{new Date(d.created_at).toLocaleDateString('en-ZA')}</div>
            {d.resolved_at && <div style={{ fontSize: 10, color: GOOD, marginTop: 2 }}>Resolved {new Date(d.resolved_at).toLocaleDateString('en-ZA')}</div>}
          </div>
        </RowItem>
      ))}
    </div>
  );
}

// ─── Breaks list ──────────────────────────────────────────────────────
function BreaksList({ rows, onTransition }: {
  rows: Break[];
  onTransition: (id: string, to: 'investigating' | 'resolved' | 'rejected', notes: string, outcome?: string) => Promise<void>;
}) {
  const [transitioning, setTransitioning] = useState<Break | null>(null);
  const severityColor = (s: string) =>
    s === 'critical' ? BAD : s === 'high' ? WARN : s === 'medium' ? ACC : TX3;
  return (
    <div style={{ background: BG1, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      {rows.map(b => (
        <div key={b.id} style={{ borderBottom: `1px solid ${BORDER}`, padding: '10px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TX1, fontFamily: MONO }}>{b.invoice_number}</span>
            <span style={{ fontSize: 10, color: severityColor(b.severity), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{b.severity}</span>
            <StatusPill status={b.status} />
            <span style={{ fontSize: 10, color: TX3, marginLeft: 4 }}>{b.break_type.replace(/_/g, ' ')}</span>
          </div>
          <div style={{ fontSize: 11, color: TX2, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.reason}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: TX3, fontFamily: MONO }}>{new Date(b.reported_at).toLocaleDateString('en-ZA')}</span>
            <div style={{ flex: 1 }} />
            {b.status === 'open' && (
              <ActionBtn color="blue" onClick={() => onTransition(b.id, 'investigating', '')}>Investigate</ActionBtn>
            )}
            {(b.status === 'open' || b.status === 'investigating') && (
              <>
                <ActionBtn color="green" onClick={() => setTransitioning({ ...b, status: 'resolved' as any })}>Resolve</ActionBtn>
                <ActionBtn color="neutral" onClick={() => setTransitioning({ ...b, status: 'rejected' as any })}>Reject</ActionBtn>
              </>
            )}
            {(b.status === 'resolved' || b.status === 'rejected') && b.resolution_outcome && (
              <span style={{ fontSize: 10, color: TX3 }}>outcome: {b.resolution_outcome.replace(/_/g, ' ')}</span>
            )}
          </div>
        </div>
      ))}
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

// ─── Confirmations queue ──────────────────────────────────────────────
function ConfirmationsQueue({ rows, userId, onAfterAction }: { rows: Invoice[]; userId?: string; onAfterAction: () => void }) {
  const buckets: Record<string, Invoice[]> = {
    pending: [], issuer_confirmed: [], payer_acknowledged: [], disputed: [],
  };
  for (const r of rows) {
    const k = (r.confirmation_status as string | undefined) || 'pending';
    if (!buckets[k]) buckets[k] = [];
    buckets[k].push(r);
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(['pending', 'issuer_confirmed', 'payer_acknowledged', 'disputed'] as const).map(state => (
        <div key={state} style={{ background: BG1, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ padding: '8px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8, background: BG2 }}>
            <StatusPill status={state.replace(/_/g, ' ')} />
            <span style={{ fontSize: 11, color: TX3 }}>{buckets[state].length} invoice{buckets[state].length === 1 ? '' : 's'}</span>
          </div>
          {buckets[state].length === 0 ? (
            <div style={{ padding: '12px 16px', fontSize: 12, color: TX3 }}>None.</div>
          ) : buckets[state].map(r => {
            const isPayer = r.to_participant_id === userId;
            const isIssuer = r.from_participant_id === userId;
            const canIssuerConfirm = isIssuer && state === 'pending';
            const canPayerAck = isPayer && state === 'issuer_confirmed';
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TX1, fontFamily: MONO }}>{r.invoice_number}</div>
                  <div style={{ fontSize: 11, color: TX2, marginTop: 2 }}>{r.from_name} → {r.to_name} · {formatZAR(r.total_amount)}</div>
                </div>
                <div style={{ fontSize: 11, color: TX3, fontFamily: MONO }}>{r.due_date ? new Date(r.due_date).toLocaleDateString('en-ZA') : '—'}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {canIssuerConfirm && (
                    <ActionBtn color="blue" onClick={async () => { try { await postConfirm(r.id, 'issuer', 'confirmed'); onAfterAction(); } catch { /* */ } }}>Confirm</ActionBtn>
                  )}
                  {canPayerAck && (
                    <ActionBtn color="green" onClick={async () => { try { await postConfirm(r.id, 'payer', 'confirmed'); onAfterAction(); } catch { /* */ } }}>Acknowledge</ActionBtn>
                  )}
                  {!canIssuerConfirm && !canPayerAck && (
                    <span style={{ fontSize: 11, color: TX3 }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Fees ledger ──────────────────────────────────────────────────────
function FeesLedger({ rows }: { rows: SettlementFeeRow[] }) {
  const total = rows.reduce((s, r) => s + (r.amount_zar || 0), 0);
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.fee_type] = (byType[r.fee_type] || 0) + (r.amount_zar || 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <KpiTile label="Total fees" value={formatZAR(total)} tone="warn" />
        {Object.keys(byType).sort().map(k => (
          <KpiTile key={k} label={k.replace(/_/g, ' ')} value={formatZAR(byType[k])} />
        ))}
      </div>
      <div style={{ background: BG1, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 110px 120px 1fr 80px', padding: '7px 16px', borderBottom: `1px solid ${BORDER}`, background: BG2 }}>
          {['When', 'Type', 'Invoice', 'Reason', 'Amount'].map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
          ))}
        </div>
        {rows.map(r => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '130px 110px 120px 1fr 80px', padding: '10px 16px', alignItems: 'center', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 11, color: TX3, fontFamily: MONO }}>{new Date(r.calculated_at).toLocaleDateString('en-ZA')}</div>
            <StatusPill status={r.fee_type.replace(/_/g, ' ')} />
            <div style={{ fontSize: 12, fontWeight: 700, color: TX1, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.invoice_number || r.invoice_id.slice(0, 10) + '…'}</div>
            <div style={{ fontSize: 11, color: TX2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }} title={r.reason || ''}>{r.reason || '—'}</div>
            <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: WARN }}>{formatZAR(r.amount_zar)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Action button helper ─────────────────────────────────────────────
function ActionBtn({ children, onClick, color = 'accent' }: { children: React.ReactNode; onClick: () => void; color?: 'accent' | 'red' | 'green' | 'blue' | 'warn' | 'neutral' }) {
  const bg = color === 'accent' ? ACC_BG : color === 'red' ? 'oklch(0.97 0.04 20)' : color === 'green' ? 'oklch(0.95 0.04 155)' : color === 'blue' ? 'oklch(0.95 0.04 240)' : color === 'warn' ? 'oklch(0.97 0.04 55)' : BG2;
  const c = color === 'accent' ? ACC : color === 'red' ? BAD : color === 'green' ? GOOD : color === 'blue' ? 'oklch(0.40 0.16 240)' : color === 'warn' ? WARN : TX2;
  const bdr = color === 'accent' ? ACC_BDR : color === 'red' ? 'oklch(0.85 0.12 20)' : color === 'green' ? 'oklch(0.80 0.12 155)' : color === 'blue' ? 'oklch(0.80 0.12 240)' : color === 'warn' ? 'oklch(0.80 0.12 55)' : BORDER;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ padding: '3px 10px', borderRadius: 5, border: `1px solid ${bdr}`, background: bg, color: c, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEscapeKey(onClose);
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{ background: BG1, borderRadius: 12, border: `1px solid ${BORDER}`, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: TX1 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TX3 }} aria-label="Close"><X size={16} /></button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

function LabelInput({ label, value, onChange, type = 'text' }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={{ display: 'block', marginTop: 12 }}>
      <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG, boxSizing: 'border-box', fontFamily: type === 'number' ? MONO : 'inherit' }}
      />
    </label>
  );
}

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
      await api.post('/settlement/payments', { invoice_id: invoice.id, amount, payment_method: method, bank_reference: bankRef || undefined, notes: notes || undefined });
      onDone();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Record payment · ${invoice.invoice_number}`} onClose={onClose}>
      <p style={{ fontSize: 12, color: TX2, marginBottom: 12 }}>
        Balance due: <span style={{ fontWeight: 700, color: TX1, fontFamily: MONO }}>{formatZAR(balance)}</span>
      </p>
      {err && <ErrorBanner message={err} />}
      <LabelInput label="Amount (ZAR)" type="number" value={amount} onChange={v => setAmount(Number(v) || 0)} />
      <label style={{ display: 'block', marginTop: 12 }}>
        <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Payment method</div>
        <select value={method} onChange={e => setMethod(e.target.value)} style={{ width: '100%', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, background: BG, color: TX1 }}>
          <option value="eft">EFT</option>
          <option value="swift">SWIFT</option>
          <option value="rtgs">RTGS</option>
          <option value="internal">Internal transfer</option>
        </select>
      </label>
      <LabelInput label="Bank reference (optional)" value={bankRef} onChange={setBankRef} />
      <LabelInput label="Notes (optional)" value={notes} onChange={setNotes} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16 }}>
        <button type="button" onClick={onClose} style={{ padding: '7px 16px', border: `1px solid ${BORDER}`, borderRadius: 6, background: BG1, color: TX2, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        <button type="button" onClick={submit} disabled={saving} style={{ padding: '7px 16px', border: `1px solid ${ACC_BDR}`, borderRadius: 6, background: ACC_BG, color: ACC, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
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
      <label style={{ display: 'block' }}>
        <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Reason</div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={5}
          placeholder="Describe the dispute reason (e.g. incorrect tariff, meter read error, duplicate invoice…)"
          style={{ width: '100%', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG, resize: 'none', boxSizing: 'border-box' }}
        />
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16 }}>
        <button type="button" onClick={onClose} style={{ padding: '7px 16px', border: `1px solid ${BORDER}`, borderRadius: 6, background: BG1, color: TX2, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        <button type="button" onClick={submit} disabled={saving} style={{ padding: '7px 16px', border: `1px solid oklch(0.85 0.12 20)`, borderRadius: 6, background: 'oklch(0.97 0.04 20)', color: BAD, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Filing…' : 'File dispute'}
        </button>
      </div>
    </Modal>
  );
}

function ResolveBreakModal({ breakRow, onClose, onDone }: { breakRow: Break; onClose: () => void; onDone: (notes: string, outcome: string) => Promise<void> }) {
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
      <div style={{ fontSize: 12, color: TX2, marginBottom: 8 }}>{breakRow.reason}</div>
      <label style={{ display: 'block', marginTop: 12 }}>
        <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Outcome</div>
        <select value={outcome} onChange={e => setOutcome(e.target.value)} style={{ width: '100%', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, background: BG, color: TX1 }}>
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
      <label style={{ display: 'block', marginTop: 12 }}>
        <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Notes</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="What changed? Required ≥3 chars." style={{ width: '100%', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG, resize: 'none', boxSizing: 'border-box' }} />
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16 }}>
        <button type="button" onClick={onClose} style={{ padding: '7px 16px', border: `1px solid ${BORDER}`, borderRadius: 6, background: BG1, color: TX2, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        <button type="button" onClick={submit} disabled={saving} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: isResolved ? 'oklch(0.40 0.16 155)' : TX2, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
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
      await api.post(`/settlement/invoices/${invoice.id}/breaks`, { break_type: breakType, severity, reason, expected_value: expected ? Number(expected) : undefined, actual_value: actual ? Number(actual) : undefined });
      onDone();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e.message || 'Failed to file break');
      setSaving(false);
    }
  };

  return (
    <Modal title={`File a settlement break · ${invoice.invoice_number}`} onClose={onClose}>
      {err && <ErrorBanner message={err} />}
      <label style={{ display: 'block', marginTop: 8 }}>
        <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Break type</div>
        <select value={breakType} onChange={e => setBreakType(e.target.value)} style={{ width: '100%', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, background: BG, color: TX1 }}>
          <option value="quantity">Quantity (volume mismatch)</option>
          <option value="price">Price (tariff or rate disagreement)</option>
          <option value="timing">Timing (period or due date)</option>
          <option value="metering">Metering (reading or source)</option>
          <option value="tariff">Tariff (regulated band breach)</option>
          <option value="fx">FX (rate or date mismatch)</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label style={{ display: 'block', marginTop: 12 }}>
        <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Severity</div>
        <select value={severity} onChange={e => setSeverity(e.target.value)} style={{ width: '100%', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, background: BG, color: TX1 }}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High — auto-disputes invoice</option>
          <option value="critical">Critical — auto-disputes invoice</option>
        </select>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <LabelInput label="Expected value" type="number" value={expected} onChange={setExpected} />
        <LabelInput label="Actual value" type="number" value={actual} onChange={setActual} />
      </div>
      <label style={{ display: 'block', marginTop: 12 }}>
        <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Reason</div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="What disagreement? At least 3 characters." style={{ width: '100%', padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1, background: BG, resize: 'none', boxSizing: 'border-box' }} />
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16 }}>
        <button type="button" onClick={onClose} style={{ padding: '7px 16px', border: `1px solid ${BORDER}`, borderRadius: 6, background: BG1, color: TX2, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        <button type="button" onClick={submit} disabled={saving} style={{ padding: '7px 16px', border: `1px solid ${ACC_BDR}`, borderRadius: 6, background: ACC_BG, color: ACC, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Filing…' : 'File break'}
        </button>
      </div>
    </Modal>
  );
}
