// ════════════════════════════════════════════════════════════════════════
// OutageImpact — quick decision-support card on a grid outage.
//
// Inputs (operator can override every default):
//   • affected_load_mw — pulled from latest grid_outage_update if present
//   • duration_hours   — derived from response timeline or operator entry
//   • spot_price       — fetched from latest VWAP mark via /trader-risk/mark-prices
//                        (falls back to 1500 R/MWh)
//
// Outputs: lost MWh, revenue at risk (R), CO₂-tonne avoided if it's a
// renewable outage (use 0.95 t/MWh South African grid factor).
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { Zap, Banknote, Leaf, Clock } from 'lucide-react';
import { api } from '../../lib/api';

type Props = {
  affectedLoadMw?: number;
  durationHours?: number;
  techType?: string; // 'solar' | 'wind' | 'coal' | 'gas' — drives grid CO₂ effect sign
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

const GRID_CO2_T_PER_MWH = 0.95; // Eskom system average; renewable outage means this much extra emitted

export function OutageImpact({ affectedLoadMw, durationHours, techType }: Props) {
  const [mw, setMw] = useState<number>(affectedLoadMw && affectedLoadMw > 0 ? affectedLoadMw : 50);
  const [hours, setHours] = useState<number>(durationHours && durationHours > 0 ? durationHours : 4);
  const [price, setPrice] = useState<number>(1500);
  const [priceFetched, setPriceFetched] = useState(false);

  useEffect(() => {
    if (priceFetched) return;
    setPriceFetched(true);
    api.get('/trader-risk/mark-prices')
      .then((r) => {
        const marks = (r.data?.data?.marks || r.data?.data || []) as Array<{ mark_price_zar_mwh?: number; energy_type?: string }>;
        const power = marks.find((m) => (m.energy_type || '').includes('power'));
        if (power?.mark_price_zar_mwh && power.mark_price_zar_mwh > 0) setPrice(Math.round(power.mark_price_zar_mwh));
      })
      .catch(() => { /* keep default */ });
  }, [priceFetched]);

  const out = useMemo(() => {
    const mwhLost = mw * hours;
    const revenueAtRisk = mwhLost * price;
    const isRenewable = (techType || '').toLowerCase().match(/solar|wind|pv|renewable/);
    const co2Impact = isRenewable ? mwhLost * GRID_CO2_T_PER_MWH : -mwhLost * GRID_CO2_T_PER_MWH;
    return { mwhLost, revenueAtRisk, co2Impact, isRenewable: !!isRenewable };
  }, [mw, hours, price, techType]);

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[var(--s2, #eef2f7)]">
        <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">Outage impact calculator</div>
        <div className="text-[11px] text-[var(--ink-2, #6b7685)]">Lost generation × spot price — adjust inputs to model recovery scenarios</div>
      </header>

      <div className="grid grid-cols-3 gap-3 px-4 py-3 widget-control-band">
        <Field label="Affected load (MW)" value={mw} onChange={setMw} step={1} min={0} max={2000} />
        <Field label="Duration (hours)"   value={hours} onChange={setHours} step={0.5} min={0} max={168} />
        <Field label="Spot (R/MWh)"       value={price} onChange={setPrice} step={50} min={0} max={20000} hint="Pulled from latest power mark" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
        <Tile icon={<Clock size={14} />}    label="MTTR"            value={`${hours.toFixed(1)} h`}                 tone="info" />
        <Tile icon={<Zap size={14} />}      label="Lost generation" value={`${out.mwhLost.toLocaleString()} MWh`}    tone="warn" />
        <Tile icon={<Banknote size={14} />} label="Revenue at risk" value={formatZAR(out.revenueAtRisk)}             tone="bad" />
        <Tile icon={<Leaf size={14} />}     label={out.isRenewable ? 'Extra CO₂ emitted' : 'CO₂ displaced'}
              value={`${Math.abs(out.co2Impact).toFixed(0)} tCO₂e`}
              tone={out.isRenewable ? 'bad' : 'good'} />
      </div>

      <footer className="px-4 py-2 border-t border-[var(--s2, #eef2f7)] text-[11px] text-[var(--ink-2, #6b7685)]">
        Grid emissions factor: {GRID_CO2_T_PER_MWH} tCO₂e/MWh (Eskom system average).
        {' '}{out.isRenewable
          ? 'Renewable outage means dispatchable thermal backfills the gap, so emissions rise.'
          : 'Thermal outage means more renewable / hydro headroom uses the slot — net displacement.'}
      </footer>
    </section>
  );
}

function Field({ label, value, onChange, step, min, max, hint }: {
  label: string; value: number; onChange: (v: number) => void;
  step: number; min: number; max: number; hint?: string;
}) {
  return (
    <label className="block text-[11px]" title={hint}>
      <span className="font-medium text-[var(--ink-2, #3d4756)]">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min} max={max} step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full h-8 px-2 rounded border border-[var(--border-subtle, #dde4ec)] text-[12px] font-mono"
      />
    </label>
  );
}

function Tile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  const map: Record<string, string> = {
    good: 'bg-[#e7f4ea] text-[var(--good, #1a8a5b)]',
    warn: 'bg-[#fef3e6] text-[#b04e0f]',
    bad:  'bg-[color-mix(in oklab, var(--bad) 15%, var(--s1))] text-[var(--bad, #c0392b)]',
    info: 'bg-[var(--s2, #eef2f7)] text-[oklch(0.46_0.16_55)]',
  };
  return (
    <div className={`rounded-lg p-3 ${map[tone] || map.info}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-80">{icon}{label}</div>
      <div className="mt-1 text-[16px] font-mono font-semibold">{value}</div>
    </div>
  );
}

export default OutageImpact;
