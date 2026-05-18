// ════════════════════════════════════════════════════════════════════════
// PpaRevenueModel — 10-year (or horizon-year) revenue ladder built off
// the LOI's annual_mwh, blended_price and horizon. Users can tweak
// price escalator, opex ratio and discount rate to see NPV / IRR /
// DSCR collapse onto the LOI economics. Pure client-side math — no
// new backend required.
// ════════════════════════════════════════════════════════════════════════

import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = {
  annualMwh: number;
  blendedPriceZarPerMwh: number;
  horizonYears: number;
  capacityMw?: number;
  capexZar?: number;
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// IRR via bisection over [-99%, +1000%]. Returns null if signs never flip.
function irr(cashflows: number[]): number | null {
  const npvAt = (r: number) => cashflows.reduce((s, c, i) => s + c / Math.pow(1 + r, i), 0);
  let lo = -0.99, hi = 10;
  let nLo = npvAt(lo), nHi = npvAt(hi);
  if (Number.isNaN(nLo) || Number.isNaN(nHi)) return null;
  if (nLo * nHi > 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const nMid = npvAt(mid);
    if (Math.abs(nMid) < 1e-3) return mid;
    if (nMid * nLo < 0) { hi = mid; nHi = nMid; } else { lo = mid; nLo = nMid; }
  }
  return (lo + hi) / 2;
}

export function PpaRevenueModel({
  annualMwh,
  blendedPriceZarPerMwh,
  horizonYears,
  capacityMw,
  capexZar,
}: Props) {
  const [escalator, setEscalator] = useState(0.05); // CPI ~ 5%
  const [opexRatio, setOpexRatio] = useState(0.18); // typical for solar PPA
  const [discount, setDiscount] = useState(0.10); // WACC proxy
  const [debtRatio, setDebtRatio] = useState(0.70);
  const [coupon, setCoupon] = useState(0.115); // SA project finance ZAR

  const model = useMemo(() => {
    const years = Math.max(1, Math.min(30, horizonYears || 15));
    const vol = Math.max(0, annualMwh || 0);
    const price0 = Math.max(0, blendedPriceZarPerMwh || 0);
    const capex = Math.max(0, capexZar || (capacityMw ? capacityMw * 18_000_000 : 0)); // R18m/MW solar default
    const debt = capex * debtRatio;
    const equity = capex - debt;
    // Level annuity P&I over horizon at coupon
    const r = coupon;
    const debtServicePerYear = r === 0
      ? debt / years
      : debt * (r * Math.pow(1 + r, years)) / (Math.pow(1 + r, years) - 1);

    const rows: any[] = [];
    let runningCashEquity = -equity;
    let cumNpv = -equity;
    const equityCashflows: number[] = [-equity];
    let dscrMin = Infinity;
    let dscrSum = 0;

    for (let y = 1; y <= years; y++) {
      const price = price0 * Math.pow(1 + escalator, y - 1);
      const revenue = vol * price;
      const opex = revenue * opexRatio;
      const ebitda = revenue - opex;
      const debtSvc = debtServicePerYear;
      const cashEquity = ebitda - debtSvc;
      const dscr = debtSvc > 0 ? ebitda / debtSvc : 0;
      dscrMin = Math.min(dscrMin, dscr);
      dscrSum += dscr;
      runningCashEquity += cashEquity;
      cumNpv += cashEquity / Math.pow(1 + discount, y);
      equityCashflows.push(cashEquity);
      rows.push({
        year: y,
        revenue,
        opex: -opex,
        debtSvc: -debtSvc,
        ebitda,
        cashEquity,
        dscr,
      });
    }

    const equityNpv = cumNpv;
    const equityIrr = irr(equityCashflows);
    const dscrAvg = years > 0 ? dscrSum / years : 0;
    const paybackYear = (() => {
      let cum = -equity;
      for (let i = 0; i < rows.length; i++) {
        cum += rows[i].cashEquity;
        if (cum >= 0) return rows[i].year;
      }
      return null;
    })();

    return { rows, capex, debt, equity, equityNpv, equityIrr, dscrMin, dscrAvg, paybackYear };
  }, [annualMwh, blendedPriceZarPerMwh, horizonYears, capacityMw, capexZar,
      escalator, opexRatio, discount, debtRatio, coupon]);

  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#eef2f7] flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-[#0f1c2e]">PPA economics — {horizonYears || 15}-year model</div>
          <div className="text-[11px] text-[#6b7685]">
            Volume {annualMwh ? `${annualMwh.toLocaleString()} MWh/yr` : '—'} · base price {formatZAR(blendedPriceZarPerMwh)}/MWh
          </div>
        </div>
        <div className="flex gap-3 text-[11px]">
          <Kpi label="Equity NPV" value={formatZAR(model.equityNpv)} tone={model.equityNpv >= 0 ? 'good' : 'bad'} />
          <Kpi label="Equity IRR" value={model.equityIrr == null ? '—' : pct(model.equityIrr)} tone={(model.equityIrr || 0) > discount ? 'good' : 'bad'} />
          <Kpi label="DSCR avg" value={model.dscrAvg.toFixed(2)} tone={model.dscrAvg >= 1.3 ? 'good' : model.dscrAvg >= 1.1 ? 'warn' : 'bad'} />
          <Kpi label="DSCR min" value={model.dscrMin === Infinity ? '—' : model.dscrMin.toFixed(2)} tone={model.dscrMin >= 1.2 ? 'good' : model.dscrMin >= 1.0 ? 'warn' : 'bad'} />
          <Kpi label="Payback" value={model.paybackYear ? `Y${model.paybackYear}` : '>horizon'} tone="info" />
        </div>
      </header>

      {/* Sliders */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 px-4 py-3 border-b border-[#eef2f7] bg-[#fafbfd]">
        <Slider label="Price escalator" value={escalator} min={0} max={0.15} step={0.005} onChange={setEscalator} format={pct} />
        <Slider label="Opex ratio" value={opexRatio} min={0.05} max={0.50} step={0.01} onChange={setOpexRatio} format={pct} />
        <Slider label="Discount rate" value={discount} min={0.04} max={0.22} step={0.005} onChange={setDiscount} format={pct} />
        <Slider label="Debt ratio" value={debtRatio} min={0} max={0.85} step={0.01} onChange={setDebtRatio} format={pct} />
        <Slider label="Debt coupon" value={coupon} min={0.06} max={0.20} step={0.0025} onChange={setCoupon} format={pct} />
      </div>

      <div style={{ height: 260 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={model.rows} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#6b7685' }} tickFormatter={(v) => `Y${v}`} />
            <YAxis yAxisId="zar" tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => `R${(v / 1_000_000).toFixed(0)}m`} />
            <YAxis yAxisId="dscr" orientation="right" domain={[0, 'auto']} tick={{ fontSize: 10, fill: '#6b7685' }} />
            <Tooltip formatter={(v: any, name: string) => name === 'DSCR' ? Number(v).toFixed(2) : formatZAR(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="zar" dataKey="revenue"  name="Revenue"      stackId="x" fill="#3b82c4" />
            <Bar yAxisId="zar" dataKey="opex"     name="Opex"         stackId="x" fill="#b04e0f" />
            <Bar yAxisId="zar" dataKey="debtSvc"  name="Debt service" stackId="x" fill="#6b3a82" />
            <Line yAxisId="dscr" type="monotone" dataKey="dscr" name="DSCR" stroke="#1a8a5b" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <footer className="px-4 py-2 border-t border-[#eef2f7] text-[11px] text-[#6b7685]">
        Implied capex {formatZAR(model.capex)} = equity {formatZAR(model.equity)} + debt {formatZAR(model.debt)} ·
        annuity debt service {formatZAR(model.rows[0]?.debtSvc ? -model.rows[0].debtSvc : 0)}/yr.
        Model is indicative — change capex assumptions on the project record to refine.
      </footer>
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' | 'info' }) {
  const map = {
    good: 'text-[#1a8a5b]',
    warn: 'text-[#b04e0f]',
    bad:  'text-[#c0392b]',
    info: 'text-[#3b82c4]',
  } as const;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className={`text-[13px] font-mono font-semibold ${map[tone]}`}>{value}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <label className="block text-[11px]">
      <div className="flex justify-between text-[#3d4756]">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-[#0f1c2e]">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1 accent-[#1a3a5c]"
      />
    </label>
  );
}

export default PpaRevenueModel;
