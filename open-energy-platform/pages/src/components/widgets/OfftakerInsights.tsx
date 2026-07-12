// ════════════════════════════════════════════════════════════════════════
// OfftakerInsights — decision-support for the offtaker workbench.
//
//   1. TariffOptimizer  — annual cost across Eskom Megaflex / Ruraflex /
//      flat / PPA, with what-if PV offset slider
//   2. LoadShapeClassifier — peak / off-peak / standard split from
//      consumption profile data (or a default urban-commercial shape)
//   3. CarbonOffsetROI — capex × offset MWh × spot REC price → IRR
//   4. RevenueRequirement — NERSA-style allowed revenue (Σ opex + dep +
//      WACC × RAB)
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';
import { api } from '../../lib/api';

type ConsumptionProfile = {
  delivery_point_id?: string;
  hour_of_day?: number;
  avg_kwh?: number;
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

// ─── Eskom tariff schedule (approx 2025 Megaflex / Ruraflex blocks).
// Hard-coded — these change at NERSA approval each year.
type Tariff = { name: string; ratePeak: number; rateStd: number; rateOffPeak: number; demandPerKva: number };
const TARIFFS: Tariff[] = [
  { name: 'Megaflex',    ratePeak: 4_650, rateStd: 1_350, rateOffPeak:  640, demandPerKva: 250 },
  { name: 'Ruraflex',    ratePeak: 4_310, rateStd: 1_245, rateOffPeak:  590, demandPerKva:  85 },
  { name: 'Homeflex',    ratePeak: 3_270, rateStd: 1_100, rateOffPeak:  730, demandPerKva:   0 },
  { name: 'Flat (1.85)', ratePeak: 1_850, rateStd: 1_850, rateOffPeak: 1_850, demandPerKva: 0 },
];

// ─── 1 ─── Tariff optimizer ───────────────────────────────────────────
function TariffOptimizer({ annualMwh, peakPct, stdPct, offPeakPct }:
  { annualMwh: number; peakPct: number; stdPct: number; offPeakPct: number; }) {
  const [pvOffsetPct, setPvOffsetPct] = useState(0);
  const [demandKva, setDemandKva] = useState(500);
  const [ppaRate, setPpaRate] = useState(1_300);

  const offset = pvOffsetPct / 100;
  const netMwh = annualMwh * (1 - offset);

  const rows = useMemo(() => TARIFFS.map((t) => {
    const energy = netMwh * (
      (peakPct / 100) * t.ratePeak +
      (stdPct / 100) * t.rateStd +
      (offPeakPct / 100) * t.rateOffPeak
    );
    const demand = demandKva * t.demandPerKva * 12; // months
    const total = energy + demand;
    return { name: t.name, energy, demand, total };
  }), [netMwh, peakPct, stdPct, offPeakPct, demandKva]);

  const ppaTotal = netMwh * ppaRate;
  const allRows = [...rows, { name: 'PPA', energy: ppaTotal, demand: 0, total: ppaTotal }];
  const cheapest = allRows.reduce((a, b) => a.total < b.total ? a : b);

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[var(--s2, #eef2f7)] flex items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">Tariff optimiser</div>
          <div className="text-[11px] text-[var(--ink-2, #6b7685)]">Annual cost across Eskom tariffs vs PPA — current load shape applied</div>
        </div>
        <div className="text-[11px] text-right">
          <div className="text-[var(--ink-2, #6b7685)]">Cheapest</div>
          <div className="font-mono font-semibold text-[var(--good, #1a8a5b)]">{cheapest.name} · {formatZAR(cheapest.total)}</div>
        </div>
      </header>
      <div className="grid grid-cols-3 gap-3 px-4 py-3 widget-control-band">
        <Slider label="PV offset %"     value={pvOffsetPct} min={0}    max={100}  step={5}   onChange={setPvOffsetPct} fmt={(v) => `${v}%`} />
        <Slider label="Notified kVA"    value={demandKva}   min={0}    max={5_000} step={50}  onChange={setDemandKva}   fmt={(v) => `${v}`} />
        <Slider label="PPA rate (R/MWh)"value={ppaRate}     min={500}  max={3_000} step={50}  onChange={setPpaRate}     fmt={(v) => `R${v}`} />
      </div>
      <div style={{ height: 220 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={allRows} margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
            <CartesianGrid stroke="var(--s2, #eef2f7)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--ink-2, #6b7685)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--ink-2, #6b7685)' }} tickFormatter={(v) => `R${(v / 1_000_000).toFixed(1)}m`} />
            <Tooltip formatter={(v: any) => formatZAR(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar isAnimationActive={false} dataKey="energy" name="Energy" stackId="x" fill="oklch(0.46 0.16 55)" />
            <Bar isAnimationActive={false} dataKey="demand" name="Demand" stackId="x" fill="#b04e0f" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── 2 ─── Load shape classifier ──────────────────────────────────────
const PEAK_HOURS = [6, 7, 8, 17, 18, 19, 20];
const OFF_HOURS = [0, 1, 2, 3, 4, 5, 22, 23];

function LoadShapeClassifier({ profile }: { profile: ConsumptionProfile[] }) {
  const buckets = useMemo(() => {
    if (!profile.length) {
      // Default urban-commercial shape: 35% peak / 50% std / 15% offpeak
      return { peak: 35, std: 50, offPeak: 15, hours: [] as Array<{ hour: number; kwh: number }> };
    }
    const byHour = new Map<number, number>();
    for (const p of profile) {
      const h = Number(p.hour_of_day ?? 0);
      byHour.set(h, (byHour.get(h) || 0) + Number(p.avg_kwh || 0));
    }
    const total = Array.from(byHour.values()).reduce((s, v) => s + v, 0) || 1;
    let peak = 0, off = 0, std = 0;
    for (const [h, kwh] of byHour) {
      if (PEAK_HOURS.includes(h)) peak += kwh;
      else if (OFF_HOURS.includes(h)) off += kwh;
      else std += kwh;
    }
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i, kwh: (byHour.get(i) || 0),
    }));
    return {
      peak: (peak / total) * 100,
      std: (std / total) * 100,
      offPeak: (off / total) * 100,
      hours,
    };
  }, [profile]);

  const data = [
    { tier: 'Peak',    pct: buckets.peak,    fill: 'var(--bad, #c0392b)' },
    { tier: 'Std',     pct: buckets.std,     fill: 'oklch(0.46 0.16 55)' },
    { tier: 'Off-pk',  pct: buckets.offPeak, fill: 'var(--good, #1a8a5b)' },
  ];
  const dominantTier = data.reduce((a, b) => a.pct > b.pct ? a : b);
  const classification =
    buckets.peak > 45 ? 'Peaky industrial — Megaflex penalises you here'
    : buckets.offPeak > 35 ? 'Night-heavy — Ruraflex looks attractive'
    : 'Balanced commercial — Megaflex or PPA both viable';

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[var(--s2, #eef2f7)]">
        <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">Load shape classifier</div>
        <div className="text-[11px] text-[var(--ink-2, #6b7685)]">{classification}</div>
      </header>
      <div className="grid grid-cols-2 gap-3 p-3">
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie isAnimationActive={false} data={data} dataKey="pct" nameKey="tier" outerRadius={60} innerRadius={32} label={(d: any) => `${d.tier} ${Number(d.pct || 0).toFixed(0)}%`}>
                {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ height: 160 }}>
          {buckets.hours.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={buckets.hours} margin={{ top: 8, right: 8, bottom: 12, left: 0 }}>
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'var(--ink-2, #6b7685)' }} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--ink-2, #6b7685)' }} />
                <Tooltip />
                <Area isAnimationActive={false} type="monotone" dataKey="kwh" stroke="oklch(0.46 0.16 55)" fill="#d4e7f6" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full grid place-items-center text-[11px] text-[var(--ink-2, #6b7685)]">
              No hourly profile — default shape shown.<br />Upload consumption profile to refine.
            </div>
          )}
        </div>
      </div>
      <footer className="px-4 py-2 border-t border-[var(--s2, #eef2f7)] text-[11px] text-[var(--ink-2, #6b7685)]">
        Dominant tier: <strong>{dominantTier.tier} ({dominantTier.pct.toFixed(1)}%)</strong>
      </footer>
    </section>
  );
}

// ─── 3 ─── Carbon-offset ROI ─────────────────────────────────────────
function CarbonOffsetRoi({ annualMwh }: { annualMwh: number }) {
  const [capex, setCapex] = useState(45_000_000); // R45m / 5 MWp solar
  const [generationMwh, setGenerationMwh] = useState(Math.round(annualMwh * 0.5));
  const [recPriceZar, setRecPriceZar] = useState(120); // R/MWh
  const [grid] = useState(0.95); // tCO2e/MWh
  const [horizon] = useState(25);
  const annualRevenue = generationMwh * recPriceZar;
  const tCo2 = generationMwh * grid;
  const lifetimeRevenue = annualRevenue * horizon;
  const npv25 = annualRevenue * ((1 - Math.pow(1.1, -horizon)) / 0.1) - capex;
  const simplePayback = annualRevenue > 0 ? capex / annualRevenue : null;

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[var(--s2, #eef2f7)]">
        <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">Carbon offset ROI</div>
        <div className="text-[11px] text-[var(--ink-2, #6b7685)]">Rooftop PV / wheeled REC programme — simple payback + NPV @ 10%</div>
      </header>
      <div className="grid grid-cols-3 gap-3 px-4 py-3 widget-control-band">
        <Slider label="Capex (R)"          value={capex}        min={1_000_000} max={500_000_000} step={1_000_000} onChange={setCapex}        fmt={(v) => `R${(v / 1_000_000).toFixed(0)}m`} />
        <Slider label="Annual gen (MWh)"   value={generationMwh} min={0}         max={100_000}     step={100}        onChange={setGenerationMwh} fmt={(v) => `${v}`} />
        <Slider label="REC price (R/MWh)"  value={recPriceZar}   min={50}        max={500}         step={10}         onChange={setRecPriceZar}   fmt={(v) => `R${v}`} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3">
        <Tile label="Annual revenue"   value={formatZAR(annualRevenue)}   tone="info" />
        <Tile label="Simple payback"   value={simplePayback ? `${simplePayback.toFixed(1)} yr` : '—'} tone={simplePayback && simplePayback < 8 ? 'good' : 'warn'} />
        <Tile label="NPV (25y, 10%)"   value={formatZAR(npv25)}            tone={npv25 > 0 ? 'good' : 'bad'} />
        <Tile label="CO₂ avoided"      value={`${(tCo2 / 1000).toFixed(0)} kt/yr`} tone="good" />
      </div>
      <footer className="px-4 py-2 border-t border-[var(--s2, #eef2f7)] text-[11px] text-[var(--ink-2, #6b7685)]">
        Lifetime gross revenue {formatZAR(lifetimeRevenue)} · grid emissions factor 0.95 tCO₂e/MWh
      </footer>
    </section>
  );
}

// ─── 4 ─── Revenue requirement calculator ─────────────────────────────
function RevenueRequirementCalc() {
  const [rab, setRab] = useState(85_000); // R85bn rate-base (utility scale)
  const [opex, setOpex] = useState(28_000); // R28bn
  const [depreciation, setDepreciation] = useState(5_500);
  const [wacc, setWacc] = useState(0.082); // 8.2% real

  const wacc_part = rab * wacc;
  const requirement = opex + depreciation + wacc_part;

  const data = [
    { component: 'Opex',         value: opex,         fill: 'oklch(0.46 0.16 55)' },
    { component: 'Depreciation', value: depreciation, fill: '#6b3a82' },
    { component: 'WACC × RAB',   value: wacc_part,    fill: '#b04e0f' },
  ];

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[var(--s2, #eef2f7)]">
        <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">NERSA revenue requirement</div>
        <div className="text-[11px] text-[var(--ink-2, #6b7685)]">Opex + depreciation + (WACC × regulatory asset base) — values in R millions</div>
      </header>
      <div className="grid grid-cols-4 gap-3 px-4 py-3 widget-control-band">
        <Slider label="RAB (R m)"         value={rab}          min={10_000} max={500_000} step={5_000} onChange={setRab}          fmt={(v) => `R${v.toLocaleString()}m`} />
        <Slider label="Opex (R m)"        value={opex}         min={1_000}  max={100_000} step={500}   onChange={setOpex}         fmt={(v) => `R${v.toLocaleString()}m`} />
        <Slider label="Depreciation (R m)"value={depreciation} min={500}    max={30_000}  step={250}   onChange={setDepreciation} fmt={(v) => `R${v.toLocaleString()}m`} />
        <Slider label="WACC (real %)"     value={wacc}         min={0.02}   max={0.18}    step={0.001} onChange={setWacc}         fmt={(v) => `${(v * 100).toFixed(2)}%`} />
      </div>
      <div className="grid grid-cols-2 gap-3 p-3">
        <Tile label="Allowed revenue" value={`R ${requirement.toLocaleString(undefined, { maximumFractionDigits: 0 })} m`} tone="info" />
        <Tile label="WACC contribution" value={`R ${wacc_part.toLocaleString(undefined, { maximumFractionDigits: 0 })} m`} tone="warn" />
      </div>
      <div style={{ height: 160 }} className="px-2 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 8, left: 60 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--ink-2, #6b7685)' }} tickFormatter={(v) => `R${v.toLocaleString()}m`} />
            <YAxis type="category" dataKey="component" tick={{ fontSize: 10, fill: 'var(--ink-2, #6b7685)' }} />
            <Tooltip formatter={(v: any) => `R${Number(v).toLocaleString()}m`} />
            <Bar isAnimationActive={false} dataKey="value">
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
      <div className="flex justify-between"><span className="text-[var(--ink-2, #3d4756)] font-medium">{label}</span><span className="font-mono">{fmt(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[oklch(0.46_0.16_55)]" />
    </label>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  const map: Record<string, string> = {
    good: 'bg-[#e7f4ea] text-[var(--good, #1a8a5b)]',
    warn: 'bg-[#fef3e6] text-[#b04e0f]',
    bad:  'bg-[color-mix(in oklab, var(--bad) 15%, var(--s1))] text-[var(--bad, #c0392b)]',
    info: 'bg-[var(--s2, #eef2f7)] text-[oklch(0.46_0.16_55)]',
  };
  return (
    <div className={`rounded p-2 ${map[tone] || map.info}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-[13px] font-mono font-semibold">{value}</div>
    </div>
  );
}

// ─── Composite ───────────────────────────────────────────────────────
export function OfftakerInsights() {
  const [profile, setProfile] = useState<ConsumptionProfile[]>([]);
  const [annualMwh, setAnnualMwh] = useState(12_000); // default 12 GWh/yr commercial

  useEffect(() => {
    let cancelled = false;
    api.get('/offtaker-suite/consumption').then((r) => {
      if (cancelled) return;
      const rows = (r.data?.data || []) as ConsumptionProfile[];
      setProfile(rows);
      // Roll up to annual MWh if profile has hourly kWh
      if (rows.length) {
        const sum = rows.reduce((s, p) => s + Number(p.avg_kwh || 0), 0);
        const annual = sum * 365 / 1000; // hourly kWh × 365 / 1000 = MWh
        if (annual > 0) setAnnualMwh(Math.round(annual));
      }
    }).catch(() => { /* fall back to defaults */ });
    return () => { cancelled = true; };
  }, []);

  // Derive peak/std/offpeak split from profile (or defaults)
  const split = useMemo(() => {
    if (!profile.length) return { peak: 35, std: 50, offPeak: 15 };
    const byHour = new Map<number, number>();
    for (const p of profile) {
      const h = Number(p.hour_of_day ?? 0);
      byHour.set(h, (byHour.get(h) || 0) + Number(p.avg_kwh || 0));
    }
    const total = Array.from(byHour.values()).reduce((s, v) => s + v, 0) || 1;
    let peak = 0, off = 0, std = 0;
    for (const [h, kwh] of byHour) {
      if (PEAK_HOURS.includes(h)) peak += kwh;
      else if (OFF_HOURS.includes(h)) off += kwh;
      else std += kwh;
    }
    return { peak: (peak / total) * 100, std: (std / total) * 100, offPeak: (off / total) * 100 };
  }, [profile]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TariffOptimizer
          annualMwh={annualMwh}
          peakPct={split.peak}
          stdPct={split.std}
          offPeakPct={split.offPeak}
        />
        <LoadShapeClassifier profile={profile} />
        <CarbonOffsetRoi annualMwh={annualMwh} />
        <RevenueRequirementCalc />
      </div>
    </div>
  );
}

export default OfftakerInsights;
