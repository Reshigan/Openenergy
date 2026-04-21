import React, { useEffect, useState } from 'react';
import { Sparkles, Leaf, Loader2, Coins, Flame, Target } from 'lucide-react';
import { api } from '../lib/api';

type Summary = {
  fund_id: string;
  total_credits: number;
  total_cost_zar: number;
  avg_cost_zar_per_tco2e: number;
  retired_tco2e: number;
  latest_nav: { nav_per_unit?: number; assets_under_management?: number; nav_date?: string } | null;
  holdings_breakdown: Array<{ credit_type: string; vintage_year: number; qty: number; cost: number }>;
};

const zar = (n: number, decimals = 0) =>
  Number.isFinite(n) ? n.toLocaleString('en-ZA', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) : '—';

export function CarbonFundAiHub() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [navResult, setNavResult] = useState<{ text: string; fallback: boolean } | null>(null);
  const [navBusy, setNavBusy] = useState(false);

  const [retireTarget, setRetireTarget] = useState(10000);
  const [retireBeneficiary, setRetireBeneficiary] = useState('Fund investor');
  const [retireResult, setRetireResult] = useState<{ text: string; fallback: boolean } | null>(null);
  const [retireBusy, setRetireBusy] = useState(false);

  const [insights, setInsights] = useState<{ text: string; fallback: boolean } | null>(null);
  const [insBusy, setInsBusy] = useState(false);

  const [methodology, setMethodology] = useState('VCS-ACM0002');
  const [vintage, setVintage] = useState(2023);
  const [volume, setVolume] = useState(25000);
  const [pricing, setPricing] = useState<{ text: string; fallback: boolean } | null>(null);
  const [priceBusy, setPriceBusy] = useState(false);

  useEffect(() => {
    api.get('/carbon/fund/summary').then((r) => setSummary(r.data?.data || null)).catch(() => undefined);
  }, []);

  const runNav = async () => {
    setNavBusy(true);
    try {
      const r = await api.post('/carbon/fund/nav/compute', {});
      setNavResult({ text: r.data?.data?.text || '', fallback: !!r.data?.data?.fallback });
      const s = await api.get('/carbon/fund/summary');
      setSummary(s.data?.data || summary);
    } finally { setNavBusy(false); }
  };
  const runRetire = async () => {
    setRetireBusy(true);
    try {
      const r = await api.post('/carbon/fund/retire/optimise', { target_tco2e: retireTarget, beneficiary: retireBeneficiary });
      setRetireResult({ text: r.data?.data?.text || '', fallback: !!r.data?.data?.fallback });
    } finally { setRetireBusy(false); }
  };
  const runInsights = async () => {
    setInsBusy(true);
    try {
      const r = await api.get('/carbon/fund/insights');
      setInsights({ text: r.data?.data?.text || '', fallback: !!r.data?.data?.fallback });
    } finally { setInsBusy(false); }
  };
  const runPricing = async () => {
    setPriceBusy(true);
    try {
      const r = await api.post('/carbon/vcu/price', { methodology, vintage, volume_tco2: volume, project_type: 'solar_pv', host_country: 'ZA' });
      setPricing({ text: r.data?.data?.text || '', fallback: !!r.data?.data?.fallback });
    } finally { setPriceBusy(false); }
  };

  const tiles = [
    { label: 'Total credits', value: `${zar(summary?.total_credits || 0, 0)} tCO₂e`, icon: Leaf, tone: 'emerald' as const },
    { label: 'AUM (NAV)', value: summary?.latest_nav?.assets_under_management ? `R${zar(summary.latest_nav.assets_under_management)}` : '—', icon: Coins, tone: 'amber' as const },
    { label: 'NAV/unit', value: summary?.latest_nav?.nav_per_unit ? `R${zar(summary.latest_nav.nav_per_unit, 2)}` : '—', icon: Target, tone: 'indigo' as const },
    { label: 'Retired tCO₂e', value: zar(summary?.retired_tco2e || 0), icon: Flame, tone: 'pink' as const },
  ];

  return (
    <section className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden shadow-[0_8px_32px_rgba(16,126,62,0.06)]">
      <header className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-[#107e3e] via-[#179f52] to-[#31c46f] text-white">
        <Sparkles size={18} />
        <div>
          <div className="text-[12px] uppercase tracking-[0.2em] text-emerald-50/80">Carbon Fund Copilot</div>
          <div className="text-[16px] font-semibold">NAV · retirement optimiser · VCU pricing · insights</div>
        </div>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5 bg-[#f5fbf7]">
        {tiles.map((t, i) => (
          <div key={i} className="rounded-xl border border-[#d5ead9] bg-white p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : t.tone === 'amber' ? 'bg-amber-50 text-amber-700' : t.tone === 'indigo' ? 'bg-indigo-50 text-indigo-700' : 'bg-pink-50 text-pink-700'}`}>
              <t.icon size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-[#6a6d70]">{t.label}</div>
              <div className="text-[15px] font-semibold text-[#32363a] truncate">{t.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-[#e5e5e5]">
        <div className="p-5 border-b md:border-b-0 md:border-r border-[#e5e5e5]">
          <div className="flex items-center gap-2 mb-2"><Coins size={15} className="text-emerald-700" /><h4 className="text-[14px] font-semibold text-[#32363a]">AI NAV computation</h4></div>
          <p className="text-[12px] text-[#6a6d70] mb-3">Computes per-methodology/vintage spot + applies vintage discount. Persists latest snapshot.</p>
          <button onClick={runNav} disabled={navBusy} className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {navBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Recompute NAV
          </button>
          {navResult?.text && (
            <div className="mt-3 rounded-lg border border-emerald-100 bg-[#f5fbf7] p-3">
              {navResult.fallback && <span className="text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px] mr-2">Fallback</span>}
              <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#32363a] font-sans">{navResult.text}</pre>
            </div>
          )}
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-2"><Flame size={15} className="text-pink-700" /><h4 className="text-[14px] font-semibold text-[#32363a]">Retirement optimiser</h4></div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-[#6a6d70]">Target tCO₂e
              <input type="number" value={retireTarget} onChange={(e) => setRetireTarget(Number(e.target.value))} className="mt-1 w-full h-9 px-2 rounded-md border border-[#d0d5dd] text-[13px]" />
            </label>
            <label className="text-[12px] text-[#6a6d70]">Beneficiary
              <input value={retireBeneficiary} onChange={(e) => setRetireBeneficiary(e.target.value)} className="mt-1 w-full h-9 px-2 rounded-md border border-[#d0d5dd] text-[13px]" />
            </label>
          </div>
          <button onClick={runRetire} disabled={retireBusy} className="mt-3 h-9 px-4 rounded-lg bg-pink-700 text-white text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {retireBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Optimise retirements
          </button>
          {retireResult?.text && (
            <div className="mt-3 rounded-lg border border-pink-100 bg-[#fef5f8] p-3">
              {retireResult.fallback && <span className="text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px] mr-2">Fallback</span>}
              <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#32363a] font-sans">{retireResult.text}</pre>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-[#e5e5e5]">
        <div className="p-5 border-b md:border-b-0 md:border-r border-[#e5e5e5]">
          <div className="flex items-center gap-2 mb-2"><Target size={15} className="text-indigo-700" /><h4 className="text-[14px] font-semibold text-[#32363a]">VCU tranche pricing</h4></div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[12px] text-[#6a6d70]">Methodology
              <select value={methodology} onChange={(e) => setMethodology(e.target.value)} className="mt-1 w-full h-9 px-2 rounded-md border border-[#d0d5dd] text-[13px]">
                <option value="VCS-ACM0002">VCS-ACM0002</option>
                <option value="VCS-VM0042">VCS-VM0042</option>
                <option value="Gold Standard">Gold Standard</option>
                <option value="CDM-AMS">CDM-AMS</option>
              </select>
            </label>
            <label className="text-[12px] text-[#6a6d70]">Vintage
              <input type="number" value={vintage} onChange={(e) => setVintage(Number(e.target.value))} className="mt-1 w-full h-9 px-2 rounded-md border border-[#d0d5dd] text-[13px]" />
            </label>
            <label className="text-[12px] text-[#6a6d70]">Volume (t)
              <input type="number" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="mt-1 w-full h-9 px-2 rounded-md border border-[#d0d5dd] text-[13px]" />
            </label>
          </div>
          <button onClick={runPricing} disabled={priceBusy} className="mt-3 h-9 px-4 rounded-lg bg-indigo-600 text-white text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {priceBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Price tranche
          </button>
          {pricing?.text && (
            <div className="mt-3 rounded-lg border border-indigo-100 bg-[#f3f6ff] p-3">
              {pricing.fallback && <span className="text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px] mr-2">Fallback</span>}
              <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#32363a] font-sans">{pricing.text}</pre>
            </div>
          )}
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-2"><Sparkles size={15} className="text-amber-700" /><h4 className="text-[14px] font-semibold text-[#32363a]">Control-room insights</h4></div>
          <button onClick={runInsights} disabled={insBusy} className="h-9 px-4 rounded-lg bg-amber-600 text-white text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {insBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate brief
          </button>
          {insights?.text && (
            <div className="mt-3 rounded-lg border border-amber-100 bg-[#fff9ec] p-3">
              {insights.fallback && <span className="text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px] mr-2">Fallback</span>}
              <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#32363a] font-sans">{insights.text}</pre>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
