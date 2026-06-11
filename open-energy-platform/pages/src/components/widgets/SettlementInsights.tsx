// ════════════════════════════════════════════════════════════════════════
// SettlementInsights — bundles four decision-support widgets for the
// Settlement workstation Insights tab. All derive from the existing
// invoices / payments / breaks / fees datasets — no new endpoints.
//
//   1. ReceivablesAgingChart  — buckets outstanding by overdue days
//   2. CashflowLadder         — forward 13-week receipts vs payables
//   3. BreakSeverityHeatmap   — break type × severity grid
//   4. FeeAccrualTrend        — fees accrued by week × fee type
//
// Plus DSO / break-rate / fee-take KPIs.
// ════════════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

type Invoice = {
  id: string;
  total_amount: number;
  paid_amount: number | null;
  status: string;
  due_date: string;
  from_participant_id?: string;
  to_participant_id?: string;
};

type Payment = {
  amount: number;
  payment_date: string;
  invoice_total?: number;
};

type Break = {
  id: string;
  break_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  reported_at: string;
};

type Fee = {
  fee_type: string;
  amount_zar: number;
  calculated_at: string;
};

type Props = {
  invoices: Invoice[];
  payments: Payment[];
  breaks: Break[];
  fees: Fee[];
  userId?: string;
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

const SEVERITIES: Array<Break['severity']> = ['low', 'medium', 'high', 'critical'];
const SEV_COLOUR: Record<string, string> = {
  low: '#eef2f7', medium: '#d4e7f6', high: '#fef3e6', critical: '#fde0db',
};

// ─── 1 ─── Receivables aging ──────────────────────────────────────────
function ReceivablesAgingChart({ invoices }: { invoices: Invoice[] }) {
  const buckets = useMemo(() => {
    const today = Date.now();
    const out: Record<string, number> = { 'Current': 0, '1-30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
    for (const inv of invoices) {
      if (!['issued', 'partial', 'overdue'].includes(inv.status)) continue;
      const outstanding = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
      if (outstanding <= 0) continue;
      const due = new Date(inv.due_date).getTime();
      const daysOverdue = Math.max(0, Math.floor((today - due) / 86_400_000));
      const key = daysOverdue === 0 ? 'Current'
        : daysOverdue <= 30 ? '1-30'
        : daysOverdue <= 60 ? '31-60'
        : daysOverdue <= 90 ? '61-90' : '>90';
      out[key] += outstanding;
    }
    return Object.entries(out).map(([bucket, value]) => ({ bucket, value }));
  }, [invoices]);

  const total = buckets.reduce((s, b) => s + b.value, 0);
  const overdueValue = buckets.filter((b) => b.bucket !== 'Current').reduce((s, b) => s + b.value, 0);

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7] flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-[#0f1c2e]">Receivables aging</div>
          <div className="text-[11px] text-[#6b7685]">Outstanding receivables by overdue bucket</div>
        </div>
        <div className="text-[11px] text-right">
          <div className="text-[#6b7685]">Total outstanding</div>
          <div className="font-mono font-semibold text-[#0f1c2e]">{formatZAR(total)}</div>
          <div className="text-[#c0392b]">{formatZAR(overdueValue)} overdue</div>
        </div>
      </header>
      <div style={{ height: 180 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#6b7685' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => `R${(v / 1_000_000).toFixed(1)}m`} />
            <Tooltip formatter={(v: any) => formatZAR(Number(v))} />
            <Bar dataKey="value">
              {buckets.map((b, i) => (
                <Cell key={i} fill={b.bucket === 'Current' ? '#1a8a5b' : b.bucket === '>90' ? '#c0392b' : '#b04e0f'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── 2 ─── Forward cashflow ladder ────────────────────────────────────
function CashflowLadder({ invoices, userId }: { invoices: Invoice[]; userId?: string }) {
  const series = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weeks: Array<{ week: string; inflow: number; outflow: number; net: number }> = [];
    for (let w = 0; w < 13; w++) {
      const start = new Date(today.getTime() + w * 7 * 86_400_000);
      const end = new Date(start.getTime() + 7 * 86_400_000);
      let inflow = 0, outflow = 0;
      for (const inv of invoices) {
        if (!['issued', 'partial', 'overdue'].includes(inv.status)) continue;
        const due = new Date(inv.due_date).getTime();
        if (due < start.getTime() || due >= end.getTime()) continue;
        const outstanding = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
        if (outstanding <= 0) continue;
        if (userId && inv.to_participant_id === userId) outflow += outstanding;
        else inflow += outstanding;
      }
      weeks.push({
        week: `W+${w}`,
        inflow,
        outflow: -outflow,
        net: inflow - outflow,
      });
    }
    return weeks;
  }, [invoices, userId]);

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Forward cashflow ladder (13 weeks)</div>
        <div className="text-[11px] text-[#6b7685]">Inflow (receivables due) vs outflow (payables due)</div>
      </header>
      <div style={{ height: 200 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 8, right: 12, bottom: 12, left: 0 }} stackOffset="sign">
            <CartesianGrid stroke="#eef2f7" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6b7685' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => `R${(v / 1_000_000).toFixed(1)}m`} />
            <Tooltip formatter={(v: any) => formatZAR(Math.abs(Number(v)))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="inflow"  name="Inflow"  stackId="x" fill="#1a8a5b" />
            <Bar dataKey="outflow" name="Outflow" stackId="x" fill="#c0392b" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── 3 ─── Break severity heatmap ─────────────────────────────────────
function BreakSeverityHeatmap({ breaks }: { breaks: Break[] }) {
  const grid = useMemo(() => {
    const byType = new Map<string, Record<Break['severity'], number>>();
    for (const b of breaks) {
      const row = byType.get(b.break_type) || { low: 0, medium: 0, high: 0, critical: 0 };
      row[b.severity] = (row[b.severity] || 0) + 1;
      byType.set(b.break_type, row);
    }
    return Array.from(byType.entries()).map(([t, counts]) => ({ type: t, ...counts }));
  }, [breaks]);

  if (!grid.length) {
    return (
      <section className="widget-card widget-empty">
        No settlement breaks to plot.
      </section>
    );
  }

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Break severity heatmap</div>
        <div className="text-[11px] text-[#6b7685]">Where the problems live — break type × severity</div>
      </header>
      <div className="p-3 overflow-x-auto">
        <table className="text-[11px] w-full">
          <thead>
            <tr className="text-[#6b7685]">
              <th className="text-left py-1">Type</th>
              {SEVERITIES.map((s) => <th key={s} className="text-center py-1 capitalize">{s}</th>)}
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => {
              const total = SEVERITIES.reduce((s, sev) => s + ((row as any)[sev] || 0), 0);
              return (
                <tr key={row.type} className="border-t border-[#eef2f7]">
                  <td className="py-1 capitalize text-[#0f1c2e]">{row.type.replace(/_/g, ' ')}</td>
                  {SEVERITIES.map((sev) => {
                    const v = (row as any)[sev] || 0;
                    const opacity = total > 0 ? Math.min(1, 0.2 + (v / total) * 0.8) : 0;
                    return (
                      <td key={sev} className="text-center py-1">
                        <span
                          className="inline-block w-12 h-6 rounded text-[#0f1c2e] font-mono font-semibold leading-6"
                          style={{ background: SEV_COLOUR[sev], opacity: v === 0 ? 0.3 : opacity }}
                        >{v}</span>
                      </td>
                    );
                  })}
                  <td className="text-right font-mono py-1">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 4 ─── Fee accrual trend ──────────────────────────────────────────
function FeeAccrualTrend({ fees }: { fees: Fee[] }) {
  const series = useMemo(() => {
    const byWeek = new Map<string, Record<string, number>>();
    for (const f of fees) {
      const d = new Date(f.calculated_at);
      const monday = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86_400_000);
      monday.setHours(0, 0, 0, 0);
      const key = monday.toISOString().slice(0, 10);
      const row = byWeek.get(key) || {};
      row[f.fee_type] = (row[f.fee_type] || 0) + Number(f.amount_zar || 0);
      byWeek.set(key, row);
    }
    return Array.from(byWeek.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, row]) => ({ week, ...row }));
  }, [fees]);

  const types = useMemo(() => {
    const s = new Set<string>();
    fees.forEach((f) => s.add(f.fee_type));
    return Array.from(s);
  }, [fees]);

  if (!series.length) {
    return (
      <section className="widget-card widget-empty">
        No fees accrued yet.
      </section>
    );
  }

  const TYPE_COLOUR: Record<string, string> = {
    dunning: '#c0392b', late_payment: '#b04e0f', rebooking: 'oklch(0.46 0.16 55)',
    admin: '#6b7685', wheeling_uplift: '#6b3a82', imbalance_uplift: '#e63946',
  };

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Fee accrual trend</div>
        <div className="text-[11px] text-[#6b7685]">Weekly fees by type — leading indicator of breakdown</div>
      </header>
      <div style={{ height: 200 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6b7685' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => `R${(v / 1_000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => formatZAR(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {types.map((t) => (
              <Area key={t} type="monotone" dataKey={t} stackId="x" name={t.replace(/_/g, ' ')}
                    stroke={TYPE_COLOUR[t] || '#6b7685'} fill={TYPE_COLOUR[t] || '#6b7685'} fillOpacity={0.4} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── Composite KPIs ────────────────────────────────────────────────────
function InsightKpis({ invoices, payments, fees, breaks }: {
  invoices: Invoice[]; payments: Payment[]; fees: Fee[]; breaks: Break[];
}) {
  const stats = useMemo(() => {
    // Days Sales Outstanding (last 90 days): (AR / paid revenue) × 90
    const today = Date.now();
    const ninetyAgo = today - 90 * 86_400_000;
    const ar = invoices
      .filter((i) => ['issued', 'partial', 'overdue'].includes(i.status))
      .reduce((s, i) => s + Number(i.total_amount || 0) - Number(i.paid_amount || 0), 0);
    const recentPayments = payments
      .filter((p) => new Date(p.payment_date).getTime() >= ninetyAgo)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const dso = recentPayments > 0 ? Math.round((ar / recentPayments) * 90) : null;

    // Break rate = breaks / invoices touched
    const breakRate = invoices.length > 0 ? breaks.length / invoices.length : 0;

    // Fee take last 30d
    const thirtyAgo = today - 30 * 86_400_000;
    const feeTake30d = fees
      .filter((f) => new Date(f.calculated_at).getTime() >= thirtyAgo)
      .reduce((s, f) => s + Number(f.amount_zar || 0), 0);

    // Mean break severity (1=low … 4=critical)
    const sevScore = (s: string) => ({ low: 1, medium: 2, high: 3, critical: 4 } as any)[s] || 0;
    const meanSev = breaks.length > 0
      ? (breaks.reduce((s, b) => s + sevScore(b.severity), 0) / breaks.length).toFixed(2)
      : '—';

    return { dso, breakRate, feeTake30d, meanSev };
  }, [invoices, payments, fees, breaks]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Tile label="DSO (90d)"        value={stats.dso == null ? '—' : `${stats.dso} d`}
            tone={stats.dso == null || stats.dso <= 30 ? 'good' : stats.dso <= 60 ? 'warn' : 'bad'}
            hint="Days sales outstanding — lower is healthier" />
      <Tile label="Break rate"       value={`${(stats.breakRate * 100).toFixed(1)}%`}
            tone={stats.breakRate <= 0.05 ? 'good' : stats.breakRate <= 0.15 ? 'warn' : 'bad'}
            hint="Breaks per invoice" />
      <Tile label="Fee take (30d)"   value={formatZAR(stats.feeTake30d)} tone="info"
            hint="Late-payment + dunning + rebooking fees" />
      <Tile label="Mean break sev"   value={String(stats.meanSev)}
            tone={stats.meanSev === '—' ? 'info' : Number(stats.meanSev) < 2 ? 'good' : Number(stats.meanSev) < 3 ? 'warn' : 'bad'}
            hint="1=low, 4=critical" />
    </div>
  );
}

function Tile({ label, value, tone, hint }: { label: string; value: string; tone: string; hint?: string }) {
  const map: Record<string, string> = {
    good: 'border-[#e7f4ea] bg-[#f4faf6]',
    warn: 'border-[#fef3e6] bg-[#fefaf2]',
    bad:  'border-[#fde0db] bg-[#fdf3f1]',
    info: 'border-[#eef2f7] bg-white',
  };
  return (
    <div className={`rounded-xl border p-3 ${map[tone] || map.info}`} title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className="mt-1 text-[18px] font-mono font-semibold text-[#0f1c2e]">{value}</div>
    </div>
  );
}

export function SettlementInsights(props: Props) {
  return (
    <div className="space-y-3">
      <InsightKpis invoices={props.invoices} payments={props.payments} fees={props.fees} breaks={props.breaks} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ReceivablesAgingChart invoices={props.invoices} />
        <CashflowLadder invoices={props.invoices} userId={props.userId} />
        <BreakSeverityHeatmap breaks={props.breaks} />
        <FeeAccrualTrend fees={props.fees} />
      </div>
    </div>
  );
}

export default SettlementInsights;
