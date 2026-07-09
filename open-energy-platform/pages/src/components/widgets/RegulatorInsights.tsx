// ════════════════════════════════════════════════════════════════════════
// RegulatorInsights — NERSA MYPD tariff revenue, cost-of-service split,
// affordability gauge.
// ════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';

// Real SA income decile thresholds, R per household per month (2024 numbers).
const INCOME_DECILES = [
  { decile: 'D1', monthly: 1_900 },
  { decile: 'D2', monthly: 3_200 },
  { decile: 'D3', monthly: 4_900 },
  { decile: 'D4', monthly: 7_400 },
  { decile: 'D5', monthly: 11_100 },
  { decile: 'D6', monthly: 16_400 },
  { decile: 'D7', monthly: 24_500 },
  { decile: 'D8', monthly: 37_500 },
  { decile: 'D9', monthly: 62_000 },
  { decile: 'D10', monthly: 145_000 },
];

// Cost-of-service typical shares for SA utility (Eskom-style):
const COS_BASE = [
  { component: 'Primary energy (coal/gas)', share: 0.32, fill: '#3d3d3d' },
  { component: 'Wages & salaries',          share: 0.15, fill: 'oklch(0.46 0.16 55)' },
  { component: 'Capital depreciation',      share: 0.12, fill: '#6b3a82' },
  { component: 'IPP purchases',             share: 0.18, fill: '#1a8a5b' },
  { component: 'Operations & maintenance',  share: 0.10, fill: '#b04e0f' },
  { component: 'Finance charges',           share: 0.08, fill: '#c0392b' },
  { component: 'Levies & regulatory',       share: 0.05, fill: '#6b7685' },
];

// ─── 1 ─── MYPD tariff revenue calculator ────────────────────────────
function MypdTariffCalc() {
  const [rab, setRab] = useState(85_000); // R85bn
  const [opex, setOpex] = useState(28_000);
  const [depreciation, setDepreciation] = useState(5_500);
  const [wacc, setWacc] = useState(0.082);
  const [salesGwh, setSalesGwh] = useState(190_000); // 190 TWh/yr

  const allowedRevenue = opex + depreciation + (rab * wacc); // R millions
  const allowedTariff = salesGwh > 0 ? (allowedRevenue * 1_000_000) / (salesGwh * 1000) : 0; // R/kWh
  const allowedTariffMwh = allowedTariff * 1000;

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">NERSA MYPD allowed-revenue</div>
        <div className="text-[11px] text-[#6b7685]">Methodology: opex + depreciation + (WACC × RAB) divided by sales volume → allowed tariff</div>
      </header>
      <div className="grid grid-cols-5 gap-3 px-4 py-3 widget-control-band">
        <Slider label="RAB (R m)"          value={rab}          min={10_000} max={500_000} step={1_000} onChange={setRab}          fmt={(v) => v.toLocaleString()} />
        <Slider label="Opex (R m)"         value={opex}         min={1_000}  max={100_000} step={500}   onChange={setOpex}         fmt={(v) => v.toLocaleString()} />
        <Slider label="Depreciation (R m)" value={depreciation} min={500}    max={30_000}  step={250}   onChange={setDepreciation} fmt={(v) => v.toLocaleString()} />
        <Slider label="WACC"               value={wacc}         min={0.02}   max={0.18}    step={0.001} onChange={setWacc}         fmt={(v) => `${(v * 100).toFixed(2)}%`} />
        <Slider label="Sales (GWh)"        value={salesGwh}     min={10_000} max={300_000} step={1_000} onChange={setSalesGwh}     fmt={(v) => v.toLocaleString()} />
      </div>
      <div className="grid grid-cols-3 gap-3 p-3">
        <Tile label="Allowed revenue"   value={`R ${allowedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} m`} tone="info" />
        <Tile label="Allowed tariff"    value={`R ${allowedTariff.toFixed(2)} / kWh`}                                            tone="warn" />
        <Tile label="Allowed tariff"    value={`R ${allowedTariffMwh.toFixed(0)} / MWh`}                                          tone="info" />
      </div>
    </section>
  );
}

// ─── 2 ─── Cost-of-service breakout ───────────────────────────────────
function CostOfServiceBreakout() {
  const totalCost = 38_500; // R m
  const data = COS_BASE.map((c) => ({ ...c, amount: totalCost * c.share }));
  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Cost of service breakout</div>
        <div className="text-[11px] text-[#6b7685]">Typical SA utility cost split at R{totalCost.toLocaleString()}m base</div>
      </header>
      <div className="grid grid-cols-2 gap-3 p-3">
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie isAnimationActive={false} data={data} dataKey="amount" nameKey="component" innerRadius={35} outerRadius={75} label={(d: any) => `${Number(d.share * 100 || 0).toFixed(0)}%`}>
                {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip formatter={(v: any) => `R${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}m`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="text-[12px] space-y-1">
          {data.map((d) => (
            <div key={d.component} className="flex justify-between items-center border-b border-[#eef2f7] py-1">
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ background: d.fill }} />
                {d.component}
              </span>
              <span className="font-mono">R{d.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}m</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 3 ─── Affordability gauge ────────────────────────────────────────
function AffordabilityGauge() {
  const [tariffKwh, setTariffKwh] = useState(2.15);
  const [householdKwh, setHouseholdKwh] = useState(450); // typical urban household

  const data = INCOME_DECILES.map((d) => {
    const monthlyBill = tariffKwh * householdKwh;
    const share = (monthlyBill / d.monthly) * 100;
    const tone = share > 10 ? 'bad' : share > 5 ? 'warn' : 'good';
    return { ...d, bill: monthlyBill, share, tone };
  });

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Affordability gauge</div>
        <div className="text-[11px] text-[#6b7685]">Electricity bill as % of monthly income, by household decile</div>
      </header>
      <div className="grid grid-cols-2 gap-3 px-4 py-3 widget-control-band">
        <Slider label="Tariff (R/kWh)" value={tariffKwh}   min={0.5} max={5}    step={0.05} onChange={setTariffKwh}   fmt={(v) => `R${v.toFixed(2)}`} />
        <Slider label="Use (kWh/month)"value={householdKwh} min={50}  max={1000} step={25}   onChange={setHouseholdKwh} fmt={(v) => `${v}`} />
      </div>
      <div style={{ height: 220 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis dataKey="decile" tick={{ fontSize: 10, fill: '#6b7685' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => `${v}%`} unit="" />
            <Tooltip formatter={(v: any) => `${Number(v).toFixed(2)}%`} labelFormatter={(l: any) => `Decile ${l}`} />
            <ReferenceLine y={10} stroke="#c0392b" strokeDasharray="4 4" label={{ value: 'Energy poverty (>10%)', fontSize: 10, fill: '#c0392b' }} />
            <ReferenceLine y={5}  stroke="#b04e0f" strokeDasharray="4 4" label={{ value: 'Affordability concern (>5%)', fontSize: 10, fill: '#b04e0f' }} />
            <Bar isAnimationActive={false} dataKey="share">
              {data.map((d, i) => <Cell key={i} fill={d.tone === 'bad' ? '#c0392b' : d.tone === 'warn' ? '#b04e0f' : '#1a8a5b'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt: (v: number) => string;
}) {
  return (
    <label className="block text-[11px]">
      <div className="flex justify-between"><span className="text-[#3d4756] font-medium">{label}</span><span className="font-mono">{fmt(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[oklch(0.46_0.16_55)]" />
    </label>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  const map: Record<string, string> = {
    good: 'bg-[#e7f4ea] text-[#1a8a5b]',
    warn: 'bg-[#fef3e6] text-[#b04e0f]',
    bad:  'bg-[#fde0db] text-[#c0392b]',
    info: 'bg-[#eef2f7] text-[oklch(0.46_0.16_55)]',
  };
  return (
    <div className={`rounded p-2 ${map[tone] || map.info}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-[14px] font-mono font-semibold">{value}</div>
    </div>
  );
}

export function RegulatorInsights() {
  return (
    <div className="space-y-3">
      <MypdTariffCalc />
      <CostOfServiceBreakout />
      <AffordabilityGauge />
    </div>
  );
}

export default RegulatorInsights;
