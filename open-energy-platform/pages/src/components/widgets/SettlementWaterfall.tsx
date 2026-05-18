// ════════════════════════════════════════════════════════════════════════
// SettlementWaterfall — visualises gross → fees → break adjustments →
// payments → outstanding on an invoice. Pure client-side derivation from
// the InvoiceDetail payload. No new endpoint required.
// ════════════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Break = {
  break_type: string;
  status: string;
  amount_zar?: number | null;
  proposed_adjustment_zar?: number | null;
};

type Fee = {
  fee_type?: string;
  amount_zar?: number | null;
};

type Payment = {
  amount?: number | null;
};

type Props = {
  totalAmount: number;
  breaks: Break[];
  fees: Fee[];
  payments: Payment[];
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

export function SettlementWaterfall({ totalAmount, breaks, fees, payments }: Props) {
  const steps = useMemo(() => {
    const gross = Number(totalAmount || 0);
    const feesTotal = fees.reduce((s, f) => s + Number(f.amount_zar || 0), 0);
    // Confirmed break adjustments subtract from invoice; "proposed" but not yet
    // accepted are shown as a tentative slice.
    const breaksConfirmed = breaks
      .filter((b) => b.status === 'accepted' || b.status === 'resolved_credit')
      .reduce((s, b) => s + Number(b.proposed_adjustment_zar || b.amount_zar || 0), 0);
    const breaksProposed = breaks
      .filter((b) => b.status === 'open' || b.status === 'investigating')
      .reduce((s, b) => s + Number(b.proposed_adjustment_zar || b.amount_zar || 0), 0);
    const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const netDue = Math.max(0, gross + feesTotal - breaksConfirmed - paid);

    // Waterfall bars: base + value, where the bar paints only the "value"
    // segment. Positive deltas push up, negative deltas push down.
    let running = 0;
    const rows = [
      { label: 'Gross', value: gross, kind: 'total' as const },
      { label: 'Fees', value: feesTotal, kind: 'add' as const },
      { label: 'Breaks (accepted)', value: -breaksConfirmed, kind: 'sub' as const },
      { label: 'Payments', value: -paid, kind: 'sub' as const },
      { label: 'Outstanding', value: netDue, kind: 'total' as const, override: true },
    ];

    return rows.map((r, i) => {
      let base = 0;
      let bar = 0;
      if (r.kind === 'total') {
        base = 0;
        bar = r.value;
        running = r.value;
      } else if (r.kind === 'add') {
        base = running;
        bar = r.value;
        running += r.value;
      } else {
        running += r.value; // r.value is negative
        base = running;
        bar = -r.value; // visual height (positive)
      }
      return {
        idx: i,
        label: r.label,
        base,
        bar,
        delta: r.value,
        kind: r.kind,
        breaksProposed: r.label === 'Outstanding' ? breaksProposed : 0,
      };
    });
  }, [totalAmount, breaks, fees, payments]);

  const proposedTotal = steps[steps.length - 1]?.breaksProposed || 0;

  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#eef2f7] flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-[#0f1c2e]">Settlement waterfall</div>
          <div className="text-[11px] text-[#6b7685]">Gross → fees → breaks → payments → outstanding</div>
        </div>
        {proposedTotal > 0 && (
          <div className="text-[11px] text-[#b04e0f]">
            + {formatZAR(proposedTotal)} in proposed breaks not yet confirmed
          </div>
        )}
      </header>
      <div style={{ height: 240 }} className="px-4 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={steps} margin={{ top: 12, right: 16, bottom: 16, left: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7685' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              cursor={{ fill: 'rgba(59, 130, 196, 0.08)' }}
              formatter={(v: any, _name: any, p: any) => [formatZAR(Math.abs(Number(v))), p?.payload?.label]}
              labelFormatter={() => ''}
            />
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="bar" stackId="a">
              {steps.map((s, i) => (
                <Cell
                  key={i}
                  fill={s.kind === 'total' ? '#1a3a5c' : s.kind === 'add' ? '#b04e0f' : '#1a8a5b'}
                />
              ))}
              <LabelList
                dataKey="delta"
                position="top"
                formatter={(v: number) => formatZAR(Math.abs(v))}
                style={{ fontSize: 10, fill: '#3d4756' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <footer className="px-4 py-2 border-t border-[#eef2f7] grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px]">
        {steps.map((s) => (
          <div key={s.label}>
            <div className="text-[#6b7685]">{s.label}</div>
            <div className={`font-mono font-semibold ${s.kind === 'sub' ? 'text-[#1a8a5b]' : 'text-[#0f1c2e]'}`}>
              {s.delta >= 0 ? '' : '−'}{formatZAR(Math.abs(s.delta))}
            </div>
          </div>
        ))}
      </footer>
    </section>
  );
}

export default SettlementWaterfall;
