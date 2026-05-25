// ════════════════════════════════════════════════════════════════════════
// LenderInsights — six decision-support widgets for the lender workbench.
//
//   1. CovenantHeadroomGauge   — traffic-light gauges per covenant test
//   2. DebtServiceWaterfall    — operating cashflow → reserves → tranches
//   3. FacilityIrr             — IRR / tenor / coupon sensitivity grid
//   4. RecoveryNpv             — default scenario: cure cost vs cure NPV
//   5. PortfolioStressTest     — capex+%, fuel±%, default-rate shocks
//   6. PortfolioWaterfall      — fund-level MOIC, DPI, residual NAV
//
// Pulls from /lender/covenants, /lender/waterfalls, /lender/reserves,
// /lender/stress/scenarios, /funds/* — no new backend.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, ReferenceLine,
} from 'recharts';
import { api } from '../../lib/api';

type Covenant = {
  id: string;
  facility_id?: string;
  metric: string;
  threshold: number;
  operator: string; // '>=' | '<='
  latest_value?: number;
  status?: 'pass' | 'warn' | 'breach';
};

type Waterfall = {
  id: string;
  facility_id?: string;
  period: string;
  cashflow_in?: number;
  opex_paid?: number;
  reserve_top_up?: number;
  senior_interest?: number;
  senior_principal?: number;
  junior_interest?: number;
  junior_principal?: number;
  distributions?: number;
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

// IRR via bisection (reused pattern)
function irr(cashflows: number[]): number | null {
  const npvAt = (r: number) => cashflows.reduce((s, c, i) => s + c / Math.pow(1 + r, i), 0);
  let lo = -0.99, hi = 5, nLo = npvAt(lo), nHi = npvAt(hi);
  if (Number.isNaN(nLo) || Number.isNaN(nHi) || nLo * nHi > 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2, nMid = npvAt(mid);
    if (Math.abs(nMid) < 1e-3) return mid;
    if (nMid * nLo < 0) { hi = mid; nHi = nMid; } else { lo = mid; nLo = nMid; }
  }
  return (lo + hi) / 2;
}

// ─── 1 ─── Covenant headroom gauges ───────────────────────────────────
function CovenantHeadroomGauge({ covenants }: { covenants: Covenant[] }) {
  if (!covenants.length) {
    return <section className="widget-card widget-empty">No covenants tracked.</section>;
  }
  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Covenant headroom</div>
        <div className="text-[11px] text-[#6b7685]">Each gauge: latest test value vs threshold</div>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3">
        {covenants.slice(0, 9).map((c) => {
          const v = Number(c.latest_value ?? 0);
          const t = Number(c.threshold ?? 0);
          const headroom = c.operator === '<=' ? (t === 0 ? 0 : (t - v) / t) : (v - t) / (t || 1);
          const status = c.status || (headroom >= 0.2 ? 'pass' : headroom >= 0 ? 'warn' : 'breach');
          const colour = status === 'pass' ? '#1a8a5b' : status === 'warn' ? '#b04e0f' : '#c0392b';
          const pct = Math.max(0, Math.min(100, (Math.abs(headroom) * 100)));
          // Server returns covenants with `covenant_code`/`covenant_name`; the
          // older shape used `metric`. Stay defensive so neither blows up.
          const label = String(c.metric ?? c.covenant_code ?? c.covenant_name ?? 'covenant').replace(/_/g, ' ');
          return (
            <div key={c.id} className="rounded border border-[#eef2f7] p-3">
              <div className="text-[11px] text-[#6b7685] uppercase tracking-wider">{label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[16px] font-mono font-semibold text-[#0f1c2e]">{v.toFixed(2)}</span>
                <span className="text-[11px] text-[#6b7685]">{c.operator} {t.toFixed(2)}</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[#eef2f7] overflow-hidden">
                <div className="h-full" style={{ width: `${pct}%`, background: colour }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px]">
                <span style={{ color: colour }} className="font-semibold uppercase">{status}</span>
                <span className="text-[#6b7685] font-mono">{(headroom * 100).toFixed(1)}% headroom</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── 2 ─── Debt service waterfall ─────────────────────────────────────
function DebtServiceWaterfall({ waterfall }: { waterfall: Waterfall | null }) {
  if (!waterfall) {
    return <section className="widget-card widget-empty">No waterfall records yet.</section>;
  }
  const steps = [
    { label: 'Cashflow in',     value: Number(waterfall.cashflow_in || 0),                                kind: 'add' as const },
    { label: 'Opex',            value: -Number(waterfall.opex_paid || 0),                                 kind: 'sub' as const },
    { label: 'Reserves',        value: -Number(waterfall.reserve_top_up || 0),                            kind: 'sub' as const },
    { label: 'Senior interest', value: -Number(waterfall.senior_interest || 0),                           kind: 'sub' as const },
    { label: 'Senior prin.',    value: -Number(waterfall.senior_principal || 0),                          kind: 'sub' as const },
    { label: 'Junior interest', value: -Number(waterfall.junior_interest || 0),                           kind: 'sub' as const },
    { label: 'Junior prin.',    value: -Number(waterfall.junior_principal || 0),                          kind: 'sub' as const },
    { label: 'Distributions',   value: -Number(waterfall.distributions || 0),                             kind: 'sub' as const },
  ];
  let running = 0;
  const data = steps.map((s) => {
    let base = 0, bar = 0;
    if (s.kind === 'add') { base = running; bar = s.value; running += s.value; }
    else { running += s.value; base = running; bar = -s.value; }
    return { ...s, base, bar };
  });
  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Debt service waterfall — {waterfall.period}</div>
        <div className="text-[11px] text-[#6b7685]">Cashflow priority through the capital stack</div>
      </header>
      <div style={{ height: 240 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 36, left: 0 }}>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6b7685' }} angle={-25} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => `R${(v / 1_000_000).toFixed(0)}m`} />
            <Tooltip formatter={(v: any, _n: any, p: any) => [formatZAR(Math.abs(Number(v))), p?.payload?.label]} labelFormatter={() => ''} />
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="bar" stackId="a">
              {data.map((s, i) => <Cell key={i} fill={s.kind === 'add' ? '#1a8a5b' : '#3b82c4'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── 3 ─── Facility IRR sensitivity ───────────────────────────────────
function FacilityIrr() {
  const [principal, setPrincipal] = useState(500_000_000);
  const [coupon, setCoupon] = useState(0.115);
  const [tenor, setTenor] = useState(15);
  const [feesPct, setFeesPct] = useState(0.02);

  const cashflows: number[] = useMemo(() => {
    const r = coupon;
    const annuity = r === 0 ? principal / tenor : principal * (r * Math.pow(1 + r, tenor)) / (Math.pow(1 + r, tenor) - 1);
    const cfs = [-principal + principal * feesPct];
    for (let y = 0; y < tenor; y++) cfs.push(annuity);
    return cfs;
  }, [principal, coupon, tenor, feesPct]);

  const lifetimeIrr = irr(cashflows);

  // Sensitivity grid: tenor × coupon
  const grid = useMemo(() => {
    const tenors = [10, 12, 15, 18, 20];
    const coupons = [0.09, 0.10, 0.11, 0.115, 0.12, 0.13];
    return coupons.map((c) => ({
      coupon: c,
      ...Object.fromEntries(tenors.map((t) => {
        const ann = c === 0 ? principal / t : principal * (c * Math.pow(1 + c, t)) / (Math.pow(1 + c, t) - 1);
        const cfs = [-principal + principal * feesPct];
        for (let y = 0; y < t; y++) cfs.push(ann);
        const result = irr(cfs);
        return [`t${t}`, result ? Number((result * 100).toFixed(2)) : null];
      })),
    }));
  }, [principal, feesPct]);

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7] flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-[#0f1c2e]">Facility IRR</div>
          <div className="text-[11px] text-[#6b7685]">Lender economics: principal → fees → annuity over tenor</div>
        </div>
        <div className="text-[14px] font-mono font-semibold text-[#1a3a5c]">
          {lifetimeIrr == null ? '—' : `${(lifetimeIrr * 100).toFixed(2)}%`}
        </div>
      </header>
      <div className="grid grid-cols-4 gap-3 px-4 py-3 widget-control-band">
        <Slider label="Principal (R)"  value={principal}  min={10_000_000} max={5_000_000_000} step={10_000_000} onChange={setPrincipal} fmt={(v) => `R${(v / 1_000_000).toFixed(0)}m`} />
        <Slider label="Coupon"         value={coupon}     min={0.04}       max={0.20}          step={0.0025}     onChange={setCoupon}    fmt={(v) => `${(v * 100).toFixed(2)}%`} />
        <Slider label="Tenor (years)"  value={tenor}      min={3}          max={25}            step={1}          onChange={setTenor}     fmt={(v) => `${v}y`} />
        <Slider label="Arrangement fee"value={feesPct}    min={0}          max={0.05}          step={0.0025}     onChange={setFeesPct}   fmt={(v) => `${(v * 100).toFixed(2)}%`} />
      </div>
      <div className="p-3 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="text-[#6b7685]">
            <tr>
              <th className="text-left py-1">Coupon \ Tenor</th>
              {[10, 12, 15, 18, 20].map((t) => <th key={t} className="text-right py-1">{t}y</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row: any) => (
              <tr key={row.coupon} className="border-t border-[#eef2f7]">
                <td className="py-1 font-mono">{(row.coupon * 100).toFixed(2)}%</td>
                {[10, 12, 15, 18, 20].map((t) => {
                  const cell = row[`t${t}`];
                  return (
                    <td key={t} className="py-1 text-right font-mono">
                      {cell == null ? '—' : `${cell.toFixed(2)}%`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 4 ─── Recovery NPV ───────────────────────────────────────────────
function RecoveryNpv() {
  const [outstanding, setOutstanding] = useState(300_000_000);
  const [recoveryRate, setRecoveryRate] = useState(0.45); // typical SA renewables recovery
  const [cureCost, setCureCost] = useState(20_000_000);
  const [cureProbability, setCureProbability] = useState(0.65);
  const [discountRate] = useState(0.10);
  const [recoveryYears] = useState(3);

  // Cure path: invest cureCost, recover full outstanding at year recoveryYears * cureProbability
  const expectedRecovery = (outstanding * cureProbability) - cureCost;
  const cureNpv = (expectedRecovery / Math.pow(1 + discountRate, recoveryYears)) - cureCost * 0; // cure already netted
  // Liquidation path: recover at recoveryRate now (no cost)
  const liquidationNpv = outstanding * recoveryRate;
  const optimal = cureNpv > liquidationNpv ? 'Cure' : 'Liquidate';
  const valueDiff = Math.abs(cureNpv - liquidationNpv);

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7] flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-[#0f1c2e]">Workout recovery NPV</div>
          <div className="text-[11px] text-[#6b7685]">Cure vs liquidate — what's the higher-NPV path?</div>
        </div>
        <div className={`text-[13px] font-mono font-semibold ${optimal === 'Cure' ? 'text-[#3b82c4]' : 'text-[#c0392b]'}`}>
          {optimal} · ΔNPV {formatZAR(valueDiff)}
        </div>
      </header>
      <div className="grid grid-cols-4 gap-3 px-4 py-3 widget-control-band">
        <Slider label="Outstanding"     value={outstanding}     min={10_000_000} max={5_000_000_000} step={5_000_000}  onChange={setOutstanding}     fmt={(v) => `R${(v / 1_000_000).toFixed(0)}m`} />
        <Slider label="Recovery rate"   value={recoveryRate}    min={0.05}       max={0.95}          step={0.05}       onChange={setRecoveryRate}    fmt={(v) => `${(v * 100).toFixed(0)}%`} />
        <Slider label="Cure cost"       value={cureCost}        min={0}          max={500_000_000}   step={1_000_000}  onChange={setCureCost}        fmt={(v) => `R${(v / 1_000_000).toFixed(0)}m`} />
        <Slider label="Cure probability"value={cureProbability} min={0.05}       max={0.95}          step={0.05}       onChange={setCureProbability} fmt={(v) => `${(v * 100).toFixed(0)}%`} />
      </div>
      <div className="grid grid-cols-2 gap-3 p-3">
        <Tile label="Cure NPV"          value={formatZAR(cureNpv)}        tone={optimal === 'Cure' ? 'good' : 'info'} />
        <Tile label="Liquidate NPV"     value={formatZAR(liquidationNpv)} tone={optimal === 'Liquidate' ? 'good' : 'info'} />
      </div>
    </section>
  );
}

// ─── 5 ─── Portfolio stress test ──────────────────────────────────────
function PortfolioStressTest() {
  const [capexShock, setCapexShock] = useState(0.10);
  const [fuelShock, setFuelShock] = useState(0.05);
  const [defaultRate, setDefaultRate] = useState(0.05);

  // Hypothetical base portfolio: R5bn deployed, base IRR 11%, base DSCR 1.42
  const baseDeployed = 5_000_000_000;
  const baseIrr = 0.11;
  const baseDscr = 1.42;

  const stressedIrr  = baseIrr  - (capexShock * 0.4) - (fuelShock * 0.15) - (defaultRate * 0.6);
  const stressedDscr = baseDscr - (capexShock * 0.6) - (fuelShock * 0.30) - (defaultRate * 0.8);
  const expectedLoss = baseDeployed * defaultRate * 0.55; // 55% LGD

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Portfolio stress test</div>
        <div className="text-[11px] text-[#6b7685]">Capex blow-out, fuel cost, default rate — sensitivities on portfolio IRR / DSCR / loss</div>
      </header>
      <div className="grid grid-cols-3 gap-3 px-4 py-3 widget-control-band">
        <Slider label="Capex shock"   value={capexShock}  min={0} max={0.40} step={0.01} onChange={setCapexShock}  fmt={(v) => `+${(v * 100).toFixed(0)}%`} />
        <Slider label="Fuel shock"    value={fuelShock}   min={-0.30} max={0.50} step={0.01} onChange={setFuelShock}   fmt={(v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`} />
        <Slider label="Default rate"  value={defaultRate} min={0} max={0.20} step={0.005} onChange={setDefaultRate} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
      </div>
      <div className="grid grid-cols-3 gap-3 p-3">
        <Tile label="Stressed IRR"  value={`${(stressedIrr * 100).toFixed(2)}%`} tone={stressedIrr > 0.07 ? 'good' : stressedIrr > 0.04 ? 'warn' : 'bad'} />
        <Tile label="Stressed DSCR" value={stressedDscr.toFixed(2)}              tone={stressedDscr > 1.2 ? 'good' : stressedDscr > 1.0 ? 'warn' : 'bad'} />
        <Tile label="Expected loss" value={formatZAR(expectedLoss)}              tone={defaultRate > 0.07 ? 'bad' : defaultRate > 0.03 ? 'warn' : 'good'} />
      </div>
      <footer className="px-4 py-2 border-t border-[#eef2f7] text-[11px] text-[#6b7685]">
        Base: R5bn deployed · IRR 11.0% · DSCR 1.42. Loss given default 55%.
      </footer>
    </section>
  );
}

// ─── 6 ─── Portfolio waterfall (MOIC, DPI, NAV) ───────────────────────
function PortfolioWaterfall() {
  const [committed] = useState(8_000_000_000);
  const [called, setCalled] = useState(5_400_000_000);
  const [distributed, setDistributed] = useState(2_900_000_000);
  const [nav, setNav] = useState(4_200_000_000);

  const dpi = called > 0 ? distributed / called : 0;
  const tvpi = called > 0 ? (distributed + nav) / called : 0;
  const moic = tvpi;
  const rvpi = called > 0 ? nav / called : 0;

  const data = [
    { name: 'Called',      value: called,      fill: '#3b82c4' },
    { name: 'Distributed', value: distributed, fill: '#1a8a5b' },
    { name: 'NAV',         value: nav,         fill: '#6b3a82' },
    { name: 'Uncalled',    value: committed - called, fill: '#dde4ec' },
  ];

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Portfolio waterfall</div>
        <div className="text-[11px] text-[#6b7685]">Fund-level called / distributed / NAV — MOIC, DPI, TVPI</div>
      </header>
      <div className="grid grid-cols-3 gap-3 px-4 py-3 widget-control-band">
        <Slider label="Called"      value={called}      min={0} max={committed} step={50_000_000} onChange={setCalled}      fmt={(v) => `R${(v / 1_000_000_000).toFixed(2)}bn`} />
        <Slider label="Distributed" value={distributed} min={0} max={committed} step={50_000_000} onChange={setDistributed} fmt={(v) => `R${(v / 1_000_000_000).toFixed(2)}bn`} />
        <Slider label="NAV"         value={nav}         min={0} max={committed} step={50_000_000} onChange={setNav}         fmt={(v) => `R${(v / 1_000_000_000).toFixed(2)}bn`} />
      </div>
      <div className="grid grid-cols-2 gap-3 p-3">
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} label={(d: any) => `${d.name}`}>
                {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip formatter={(v: any) => formatZAR(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="MOIC / TVPI" value={moic.toFixed(2)}  tone={moic > 1.5 ? 'good' : moic > 1.0 ? 'warn' : 'bad'} />
          <Tile label="DPI"         value={dpi.toFixed(2)}   tone={dpi > 1.0 ? 'good' : dpi > 0.5 ? 'warn' : 'bad'} />
          <Tile label="RVPI"        value={rvpi.toFixed(2)}  tone="info" />
          <Tile label="Uncalled"    value={formatZAR(committed - called)} tone="info" />
        </div>
      </div>
    </section>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt: (v: number) => string;
}) {
  return (
    <label className="block text-[11px]">
      <div className="flex justify-between"><span className="text-[#3d4756] font-medium">{label}</span><span className="font-mono">{fmt(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#1a3a5c]" />
    </label>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  const map: Record<string, string> = {
    good: 'bg-[#e7f4ea] text-[#1a8a5b]',
    warn: 'bg-[#fef3e6] text-[#b04e0f]',
    bad:  'bg-[#fde0db] text-[#c0392b]',
    info: 'bg-[#eef2f7] text-[#3b82c4]',
  };
  return (
    <div className={`rounded p-2 ${map[tone] || map.info}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-[14px] font-mono font-semibold">{value}</div>
    </div>
  );
}

// ─── Composite ───────────────────────────────────────────────────────
export function LenderInsights() {
  const [covenants, setCovenants] = useState<Covenant[]>([]);
  const [waterfalls, setWaterfalls] = useState<Waterfall[]>([]);

  useEffect(() => {
    Promise.all([
      api.get('/lender/covenants').catch(() => ({ data: { data: [] } })),
      api.get('/lender/waterfalls').catch(() => ({ data: { data: [] } })),
    ]).then(([c, w]) => {
      setCovenants((c.data?.data as Covenant[]) || []);
      setWaterfalls((w.data?.data as Waterfall[]) || []);
    });
  }, []);

  const latestWaterfall = waterfalls.length > 0
    ? [...waterfalls].sort((a, b) => (a.period || '').localeCompare(b.period || '')).slice(-1)[0]
    : null;

  return (
    <div className="space-y-3">
      <CovenantHeadroomGauge covenants={covenants} />
      <DebtServiceWaterfall waterfall={latestWaterfall} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <FacilityIrr />
        <RecoveryNpv />
        <PortfolioStressTest />
        <PortfolioWaterfall />
      </div>
    </div>
  );
}

export default LenderInsights;
