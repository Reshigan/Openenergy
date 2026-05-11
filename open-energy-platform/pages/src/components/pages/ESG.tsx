import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { ExportBar } from '../ExportBar';
import { StitchPage, StitchCard, StitchKpi, StitchPill, StitchField } from '../StitchPage';
import { OEIcon, type IconName } from '../OEIcon';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, PolarAngleAxis,
  PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useEscapeKey } from '../../hooks/useEscapeKey';

/* ════════════════════════════════════════════════════════════════════════
 * ESG — Watershed-grade carbon accounting + disclosure suite
 *
 * Eight tabs:
 *   1. Overview      — current-year rollup, scope split, intensity, data quality
 *   2. Transactions  — per-activity ledger (Scope 1/2/3, drillable)
 *   3. Targets       — SBTi-aligned absolute + intensity targets
 *   4. Initiatives   — reduction project portfolio with MACC
 *   5. Suppliers     — Scope 3 engagement surveys
 *   6. RECs          — REC / GO certificates + retirements
 *   7. Disclosures   — CDP, TCFD, CSRD, ISSB, JSE-SRL, SEC, GHG Protocol
 *   8. Risks         — TCFD physical + transition risk register
 * ═══════════════════════════════════════════════════════════════════════ */

type Tab = 'overview' | 'transactions' | 'targets' | 'initiatives' | 'suppliers' | 'recs' | 'disclosures' | 'risks';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'overview',     label: 'Overview',      icon: 'chart-bar' },
  { id: 'transactions', label: 'Transactions',  icon: 'database' },
  { id: 'targets',      label: 'Targets',       icon: 'target' },
  { id: 'initiatives',  label: 'Initiatives',   icon: 'spark' },
  { id: 'suppliers',    label: 'Suppliers',     icon: 'team' },
  { id: 'recs',         label: 'RECs',          icon: 'badge' },
  { id: 'disclosures',  label: 'Disclosures',   icon: 'report' },
  { id: 'risks',        label: 'Risks',         icon: 'alert' },
];

const fmtZ = (v: number, d = 0) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: d }).format(v || 0);
const fmtN = (v: number, d = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(v || 0);
const yearOf = (d?: string | null) => d ? new Date(d).getFullYear() : new Date().getFullYear();

const SCOPE3_CATEGORIES: { id: number; name: string; group: 'up' | 'down' }[] = [
  { id: 1,  name: 'Purchased goods & services', group: 'up' },
  { id: 2,  name: 'Capital goods',              group: 'up' },
  { id: 3,  name: 'Fuel + energy upstream',     group: 'up' },
  { id: 4,  name: 'Upstream transport',         group: 'up' },
  { id: 5,  name: 'Waste in operations',        group: 'up' },
  { id: 6,  name: 'Business travel',            group: 'up' },
  { id: 7,  name: 'Employee commuting',         group: 'up' },
  { id: 8,  name: 'Upstream leased assets',     group: 'up' },
  { id: 9,  name: 'Downstream transport',       group: 'down' },
  { id: 10, name: 'Processing of sold products',group: 'down' },
  { id: 11, name: 'Use of sold products',       group: 'down' },
  { id: 12, name: 'End-of-life of sold products', group: 'down' },
  { id: 13, name: 'Downstream leased assets',   group: 'down' },
  { id: 14, name: 'Franchises',                 group: 'down' },
  { id: 15, name: 'Investments / financed emissions', group: 'down' },
];

const FRAMEWORKS = ['CDP', 'TCFD', 'CSRD', 'ISSB_S2', 'JSE_SRL', 'SEC_CLIMATE', 'GHG_PROTOCOL', 'SA_CARBON_TAX'] as const;

interface Rollup {
  reporting_year: number;
  scope1_tco2e: number;
  scope2_location_tco2e: number;
  scope2_market_tco2e: number;
  scope3_tco2e: number;
  scope3_by_category: string | null;
  total_tco2e_location: number;
  total_tco2e_market: number;
  energy_consumption_mwh: number;
  renewable_mwh: number;
  renewable_pct: number;
  data_quality_score: number;
  computed_at?: string;
}

interface Transaction {
  id: string;
  activity_code: string;
  scope: 1 | 2 | 3;
  scope3_category: number | null;
  region?: string;
  activity_date: string;
  quantity: number;
  unit: string;
  counterparty_name?: string;
  emissions_kg_co2e: number;
  scope2_method?: string;
  data_quality?: string;
  status: string;
  notes?: string;
}

interface Target {
  id: string;
  target_type: string; framework?: string; scopes_covered: string;
  base_year: number; base_value: number;
  target_year: number; target_value: number; target_pct?: number;
  status: string; description?: string;
}

interface Initiative {
  id: string; name: string; category?: string;
  abatement_tco2e_yr?: number; capex_zar?: number; opex_zar_yr?: number;
  lifetime_years?: number; marginal_abatement_cost_zar_tco2e?: number;
  start_date?: string; end_date?: string; status: string;
}

export function ESG() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <StitchPage
      eyebrowIcon={() => <OEIcon name="leaf" size={12} />}
      eyebrowLabel="Sustainability · GHG Protocol · CDP · TCFD · ISSB"
      title="ESG & Carbon Accounting"
      subtitle="Audit-grade Scope 1/2/3 transaction ledger with SBTi-aligned targets, supplier engagement, REC matching, and one-click disclosure exports."
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === 'overview'     && <OverviewTab />}
      {tab === 'transactions' && <TransactionsTab />}
      {tab === 'targets'      && <TargetsTab />}
      {tab === 'initiatives'  && <InitiativesTab />}
      {tab === 'suppliers'    && <SuppliersTab />}
      {tab === 'recs'         && <RecsTab />}
      {tab === 'disclosures'  && <DisclosuresTab />}
      {tab === 'risks'        && <RisksTab />}
    </StitchPage>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  1. Overview
// ════════════════════════════════════════════════════════════════════════
function OverviewTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get(`/esg/rollup/${year}`);
      setRollup((r.data?.data || null) as Rollup | null);
    } catch (e: unknown) { setError((e as Error).message || 'Failed'); }
    finally { setLoading(false); }
  }, [year]);
  useEffect(() => { refresh(); }, [refresh]);

  const recompute = async () => {
    await api.post('/esg/rollup/compute', { year }).catch(() => undefined);
    refresh();
  };

  if (loading) return <Skeleton variant="card" rows={4} />;
  if (error)   return <ErrorBanner message={error} onRetry={refresh} />;

  const scope3Cats = (() => {
    if (!rollup?.scope3_by_category) return [];
    try {
      const parsed = JSON.parse(rollup.scope3_by_category) as Record<string, number>;
      return Object.entries(parsed).map(([id, v]) => {
        const meta = SCOPE3_CATEGORIES.find((c) => c.id === Number(id));
        return { id: Number(id), name: meta?.name || `Cat ${id}`, value: Number(v) };
      }).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    } catch { return []; }
  })();

  const scopeData = rollup ? [
    { name: 'Scope 1',         tco2e: rollup.scope1_tco2e || 0,           color: '#1a3a5c' },
    { name: 'Scope 2 (loc)',   tco2e: rollup.scope2_location_tco2e || 0,  color: '#3b82c4' },
    { name: 'Scope 2 (mkt)',   tco2e: rollup.scope2_market_tco2e || 0,    color: '#5fa8e8' },
    { name: 'Scope 3',         tco2e: rollup.scope3_tco2e || 0,           color: '#1f9b95' },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <StitchField label="Reporting year">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            {[2026, 2025, 2024, 2023, 2022].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </StitchField>
        <button onClick={recompute} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1">
          <OEIcon name="refresh" size={14} /> Recompute rollup
        </button>
        {rollup?.computed_at && (
          <span className="text-[11px] text-[#6b7685] font-mono">last computed {new Date(rollup.computed_at).toLocaleString()}</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StitchKpi label="Scope 1 (direct)"          value={`${fmtN(rollup?.scope1_tco2e || 0, 1)} tCO₂e`} icon={() => <OEIcon name="flame" size={14} tone="navy" />} />
        <StitchKpi label="Scope 2 (location)"        value={`${fmtN(rollup?.scope2_location_tco2e || 0, 1)} tCO₂e`} icon={() => <OEIcon name="bolt" size={14} tone="blue" />} />
        <StitchKpi label="Scope 2 (market)"          value={`${fmtN(rollup?.scope2_market_tco2e || 0, 1)} tCO₂e`} icon={() => <OEIcon name="bolt" size={14} tone="sky" />} sub={`Renewable: ${fmtN(rollup?.renewable_pct || 0, 1)}%`} />
        <StitchKpi label="Scope 3 (value chain)"     value={`${fmtN(rollup?.scope3_tco2e || 0, 1)} tCO₂e`} icon={() => <OEIcon name="globe" size={14} tone="teal" />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StitchKpi label="Total (location-based)"  value={`${fmtN(rollup?.total_tco2e_location || 0, 1)} tCO₂e`} icon={() => <OEIcon name="leaf" size={14} />} />
        <StitchKpi label="Total (market-based)"    value={`${fmtN(rollup?.total_tco2e_market || 0, 1)} tCO₂e`} icon={() => <OEIcon name="leaf" size={14} tone="green" />} tone={(rollup?.total_tco2e_market || 0) < (rollup?.total_tco2e_location || 0) ? 'up' : undefined} />
        <StitchKpi label="Data quality score"      value={`${fmtN(rollup?.data_quality_score || 0, 0)} / 100`} icon={() => <OEIcon name="shield" size={14} />} tone={(rollup?.data_quality_score || 0) >= 80 ? 'up' : (rollup?.data_quality_score || 0) >= 60 ? 'warn' : 'down'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StitchCard title="Emissions by scope">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={scopeData}>
              <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} stroke="#3d4756" />
              <YAxis fontSize={11} stroke="#3d4756" tickFormatter={(v) => fmtN(v)} />
              <Tooltip formatter={(v: number) => [`${fmtN(v, 1)} tCO₂e`]} />
              <Bar dataKey="tco2e" radius={[4, 4, 0, 0]}>
                {scopeData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </StitchCard>

        <StitchCard title="Scope 3 by category (15 categories)">
          {scope3Cats.length === 0 ? <EmptyMsg>No Scope 3 transactions logged yet.</EmptyMsg> : (
            <div className="space-y-1.5">
              {scope3Cats.slice(0, 8).map((c) => {
                const max = scope3Cats[0].value || 1;
                return (
                  <div key={c.id} className="flex items-center gap-2 text-[12px]">
                    <span className="w-5 font-mono text-[#6b7685]">{c.id}</span>
                    <span className="flex-1 truncate text-[#3d4756]">{c.name}</span>
                    <div className="w-28 h-2 rounded bg-[#eef2f7] overflow-hidden">
                      <div className="h-full bg-[#1f9b95]" style={{ width: `${(c.value / max) * 100}%` }} />
                    </div>
                    <span className="w-24 text-right font-mono">{fmtN(c.value, 1)} t</span>
                  </div>
                );
              })}
            </div>
          )}
        </StitchCard>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  2. Transactions ledger
// ════════════════════════════════════════════════════════════════════════
function TransactionsTab() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<string>('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [showNew, setShowNew] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await api.get(`/esg/transactions?year=${year}${scope ? `&scope=${scope}` : ''}`).catch(() => ({ data: { success: true, data: [] } }));
    setTxs((r.data?.data || []) as Transaction[]);
    setLoading(false);
  }, [scope, year]);
  useEffect(() => { refresh(); }, [refresh]);

  const totals = useMemo(() => {
    const t = { s1: 0, s2: 0, s3: 0, count: txs.length };
    for (const x of txs) {
      const e = (x.emissions_kg_co2e || 0) / 1000;
      if (x.scope === 1) t.s1 += e;
      if (x.scope === 2) t.s2 += e;
      if (x.scope === 3) t.s3 += e;
    }
    return t;
  }, [txs]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex flex-wrap items-end gap-3">
        <StitchField label="Scope">
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            <option value="">All scopes</option>
            <option value="1">Scope 1 — direct</option>
            <option value="2">Scope 2 — electricity</option>
            <option value="3">Scope 3 — value chain</option>
          </select>
        </StitchField>
        <StitchField label="Year">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            {[2026, 2025, 2024, 2023].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </StitchField>
        <div className="ml-auto flex gap-2">
          <button onClick={refresh} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[12px] font-semibold inline-flex items-center gap-1">
            <OEIcon name="refresh" size={14} /> Refresh
          </button>
          <button onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1">
            <OEIcon name="plus" size={14} /> Log activity
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StitchKpi label="Scope 1" value={`${fmtN(totals.s1, 2)} t`} icon={() => <OEIcon name="flame" size={14} />} />
        <StitchKpi label="Scope 2" value={`${fmtN(totals.s2, 2)} t`} icon={() => <OEIcon name="bolt" size={14} />} />
        <StitchKpi label="Scope 3" value={`${fmtN(totals.s3, 2)} t`} icon={() => <OEIcon name="globe" size={14} />} />
        <StitchKpi label="Transactions" value={fmtN(totals.count)} icon={() => <OEIcon name="database" size={14} />} />
      </div>

      <StitchCard title={`Activity transactions · ${year}`}>
        {loading ? <Skeleton variant="card" rows={2} /> : txs.length === 0 ? (
          <EmptyState icon={<OEIcon name="database" size={28} />} title="No transactions yet" description="Log an activity (fuel, electricity, supplier order, business travel) to build out your inventory." />
        ) : (
          <>
            <ExportBar data={txs as unknown as Record<string, unknown>[]} filename={`esg_transactions_${year}`} />
            <div className="overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-[#fafbfd]">
                  <tr className="text-[10px] uppercase text-[#6b7685]">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Activity</th>
                    <th className="px-3 py-2 text-left">Scope</th>
                    <th className="px-3 py-2 text-right">Quantity</th>
                    <th className="px-3 py-2 text-right">Emissions</th>
                    <th className="px-3 py-2 text-left">Counterparty</th>
                    <th className="px-3 py-2 text-left">Quality</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id} className="border-t border-[#eef2f7] hover:bg-[#fafbfd]">
                      <td className="px-3 py-2 font-mono">{new Date(t.activity_date).toLocaleDateString()}</td>
                      <td className="px-3 py-2 font-medium">{t.activity_code}</td>
                      <td className="px-3 py-2"><ScopePill scope={t.scope} cat={t.scope3_category} /></td>
                      <td className="px-3 py-2 text-right font-mono">{fmtN(t.quantity, 2)} {t.unit}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtN((t.emissions_kg_co2e || 0) / 1000, 3)} t</td>
                      <td className="px-3 py-2 truncate max-w-[200px] text-[#3d4756]">{t.counterparty_name || '—'}</td>
                      <td className="px-3 py-2"><StitchPill label={t.data_quality || 'measured'} tone={t.data_quality === 'measured' ? 'good' : t.data_quality === 'calculated' ? 'info' : 'warn'} /></td>
                      <td className="px-3 py-2"><StitchPill status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </StitchCard>

      {showNew && <NewTransactionModal year={year} onClose={() => setShowNew(false)} onCreated={refresh} />}
    </div>
  );
}

function NewTransactionModal({ year, onClose, onCreated }: { year: number; onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [form, setForm] = useState({
    activity_code: 'electricity.grid.kwh',
    scope: 2,
    scope3_category: '',
    region: 'ZA',
    activity_date: `${year}-01-01`,
    quantity: 0,
    unit: 'kWh',
    counterparty_name: '',
    notes: '',
    data_quality: 'measured',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api.post('/esg/transactions', {
        ...form,
        scope: Number(form.scope),
        scope3_category: form.scope3_category ? Number(form.scope3_category) : null,
        quantity: Number(form.quantity),
      });
      onCreated(); onClose();
    } catch (e: unknown) { setError((e as Error).message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Log activity transaction" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <div className="grid grid-cols-2 gap-3">
          <StitchField label="Activity code" required>
            <select value={form.activity_code} onChange={(e) => setForm({ ...form, activity_code: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
              <optgroup label="Scope 1 — direct combustion">
                <option value="fuel.diesel.litre">Diesel (litre)</option>
                <option value="fuel.petrol.litre">Petrol (litre)</option>
                <option value="fuel.lpg.kg">LPG (kg)</option>
                <option value="fuel.natural_gas.m3">Natural gas (m³)</option>
                <option value="fuel.coal.tonne">Coal (tonne)</option>
              </optgroup>
              <optgroup label="Scope 2 — electricity">
                <option value="electricity.grid.kwh">Grid electricity (kWh)</option>
              </optgroup>
              <optgroup label="Scope 3 — value chain">
                <option value="transport.road.tkm">Road freight (tonne-km)</option>
                <option value="transport.rail.tkm">Rail freight (tonne-km)</option>
                <option value="transport.sea.tkm">Ocean freight (tonne-km)</option>
                <option value="travel.flight.short_haul">Flight (short-haul, pkm)</option>
                <option value="travel.flight.long_haul">Flight (long-haul, pkm)</option>
                <option value="travel.hotel.night">Hotel-night</option>
                <option value="spend.services.zar">Services spend (ZAR)</option>
                <option value="spend.construction.zar">Construction spend (ZAR)</option>
                <option value="use.electricity_product.kwh">Use of sold electricity (kWh)</option>
              </optgroup>
            </select>
          </StitchField>
          <StitchField label="Scope" required>
            <select value={form.scope} onChange={(e) => setForm({ ...form, scope: Number(e.target.value) as 1 | 2 | 3 })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
              <option value="1">1 — Direct</option>
              <option value="2">2 — Electricity</option>
              <option value="3">3 — Value chain</option>
            </select>
          </StitchField>
          {form.scope === 3 && (
            <StitchField label="Scope 3 category" required>
              <select value={form.scope3_category} onChange={(e) => setForm({ ...form, scope3_category: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
                <option value="">— select —</option>
                {SCOPE3_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.id}. {c.name}</option>)}
              </select>
            </StitchField>
          )}
          <StitchField label="Region">
            <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
              <option value="ZA">South Africa (ZA)</option>
              <option value="GB">United Kingdom (GB)</option>
              <option value="EU">European Union (EU)</option>
              <option value="US">United States (US)</option>
              <option value="GLB">Global average</option>
            </select>
          </StitchField>
          <StitchField label="Activity date" required>
            <input type="date" required value={form.activity_date} onChange={(e) => setForm({ ...form, activity_date: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" />
          </StitchField>
          <StitchField label="Quantity" required>
            <input type="number" step="any" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" />
          </StitchField>
          <StitchField label="Unit" required>
            <input required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kWh, litre, tkm, ZAR…" className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" />
          </StitchField>
          <StitchField label="Counterparty / supplier">
            <input value={form.counterparty_name} onChange={(e) => setForm({ ...form, counterparty_name: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" />
          </StitchField>
          <StitchField label="Data quality">
            <select value={form.data_quality} onChange={(e) => setForm({ ...form, data_quality: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
              <option value="measured">Measured (high)</option>
              <option value="calculated">Calculated</option>
              <option value="estimated">Estimated</option>
              <option value="industry_average">Industry average</option>
            </select>
          </StitchField>
        </div>
        <StitchField label="Notes">
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-md border border-[#dde4ec] text-[13px]" />
        </StitchField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Cancel</button>
          <button type="submit" disabled={busy} className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Log activity'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  3. Targets
// ════════════════════════════════════════════════════════════════════════
function TargetsTab() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await api.get('/esg/targets').catch(() => ({ data: { success: true, data: [] } }));
    setTargets((r.data?.data || []) as Target[]); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex items-center justify-between">
        <div className="text-[13px] text-[#3d4756]">SBTi-aligned absolute & intensity targets. Validate with a third-party assurance provider to qualify for SBTi.</div>
        <button onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1">
          <OEIcon name="plus" size={14} /> New target
        </button>
      </div>
      <StitchCard title="Targets">
        {loading ? <Skeleton variant="card" rows={2} /> : targets.length === 0 ? <EmptyMsg>No targets set.</EmptyMsg> : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafbfd]">
                <tr className="text-[11px] uppercase text-[#6b7685]">
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Framework</th>
                  <th className="px-4 py-2 text-right">Base year</th>
                  <th className="px-4 py-2 text-right">Base value</th>
                  <th className="px-4 py-2 text-right">Target year</th>
                  <th className="px-4 py-2 text-right">Target value</th>
                  <th className="px-4 py-2 text-right">Reduction</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => (
                  <tr key={t.id} className="border-t border-[#eef2f7]">
                    <td className="px-4 py-2 capitalize">{t.target_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2">{t.framework || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{t.base_year}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtN(t.base_value, 1)}</td>
                    <td className="px-4 py-2 text-right font-mono">{t.target_year}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtN(t.target_value, 1)}</td>
                    <td className="px-4 py-2 text-right font-mono text-[#1a8a5b]">{t.target_pct ? `${fmtN(t.target_pct, 1)}%` : '—'}</td>
                    <td className="px-4 py-2"><StitchPill status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StitchCard>
      {showNew && <NewTargetModal onClose={() => setShowNew(false)} onCreated={refresh} />}
    </div>
  );
}

function NewTargetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [form, setForm] = useState({
    target_type: 'absolute', framework: 'SBTi',
    base_year: 2023, base_value: 0,
    target_year: 2030, target_value: 0,
    scopes_covered: ['scope_1', 'scope_2'],
    description: '',
  });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/esg/targets', form).catch(() => undefined);
    onCreated(); onClose();
  };
  return (
    <Modal title="New emissions target" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <StitchField label="Type">
          <select value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            <option value="absolute">Absolute reduction</option>
            <option value="intensity">Intensity</option>
            <option value="net_zero">Net zero</option>
            <option value="renewable_mix">Renewable mix %</option>
            <option value="sbti_15c">SBTi 1.5°C aligned</option>
            <option value="sbti_2c">SBTi well-below 2°C</option>
          </select>
        </StitchField>
        <StitchField label="Framework"><input value={form.framework} onChange={(e) => setForm({ ...form, framework: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <div className="grid grid-cols-2 gap-3">
          <StitchField label="Base year"><input type="number" value={form.base_year} onChange={(e) => setForm({ ...form, base_year: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
          <StitchField label="Base value (tCO₂e)"><input type="number" value={form.base_value} onChange={(e) => setForm({ ...form, base_value: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
          <StitchField label="Target year"><input type="number" value={form.target_year} onChange={(e) => setForm({ ...form, target_year: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
          <StitchField label="Target value (tCO₂e)"><input type="number" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        </div>
        <StitchField label="Description"><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Cancel</button>
          <button type="submit" className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold">Save target</button>
        </div>
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  4. Initiatives (MACC)
// ════════════════════════════════════════════════════════════════════════
function InitiativesTab() {
  const [items, setItems] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await api.get('/esg/initiatives').catch(() => ({ data: { success: true, data: [] } }));
    setItems((r.data?.data || []) as Initiative[]); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const macc = useMemo(() => items.filter((i) => i.abatement_tco2e_yr && i.marginal_abatement_cost_zar_tco2e !== null)
    .map((i) => ({ name: i.name, mac: Number(i.marginal_abatement_cost_zar_tco2e), abate: Number(i.abatement_tco2e_yr) }))
    .sort((a, b) => a.mac - b.mac), [items]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex items-center justify-between">
        <div className="text-[13px] text-[#3d4756]">Reduction initiatives ordered by marginal abatement cost (MACC). Low cost-per-tCO₂e ranks first.</div>
        <button onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1">
          <OEIcon name="plus" size={14} /> New initiative
        </button>
      </div>

      {macc.length > 0 && (
        <StitchCard title="Marginal Abatement Cost Curve (MACC)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={macc}>
              <CartesianGrid stroke="#eef2f7" />
              <XAxis dataKey="name" fontSize={10} stroke="#3d4756" angle={-20} height={50} />
              <YAxis fontSize={11} stroke="#3d4756" tickFormatter={(v) => `R${fmtN(v)}/t`} />
              <Tooltip formatter={(v: number) => fmtZ(v)} />
              <Bar dataKey="mac">
                {macc.map((d, i) => <Cell key={i} fill={d.mac < 0 ? '#1a8a5b' : d.mac < 500 ? '#3b82c4' : '#c97a14'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </StitchCard>
      )}

      <StitchCard title="Initiative portfolio">
        {loading ? <Skeleton variant="card" rows={2} /> : items.length === 0 ? <EmptyMsg>No initiatives logged.</EmptyMsg> : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafbfd]">
                <tr className="text-[11px] uppercase text-[#6b7685]">
                  <th className="px-4 py-2 text-left">Initiative</th>
                  <th className="px-4 py-2 text-left">Category</th>
                  <th className="px-4 py-2 text-right">Abatement (tCO₂e/yr)</th>
                  <th className="px-4 py-2 text-right">Capex</th>
                  <th className="px-4 py-2 text-right">MAC</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-[#eef2f7]">
                    <td className="px-4 py-2 font-medium">{i.name}</td>
                    <td className="px-4 py-2 text-[#3d4756]">{i.category || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtN(i.abatement_tco2e_yr || 0, 1)}</td>
                    <td className="px-4 py-2 text-right font-mono">{i.capex_zar ? fmtZ(i.capex_zar) : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{i.marginal_abatement_cost_zar_tco2e ? fmtZ(i.marginal_abatement_cost_zar_tco2e) : '—'}</td>
                    <td className="px-4 py-2"><StitchPill status={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StitchCard>
      {showNew && <NewInitiativeModal onClose={() => setShowNew(false)} onCreated={refresh} />}
    </div>
  );
}

function NewInitiativeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [form, setForm] = useState({ name: '', category: 'energy_efficiency', abatement_tco2e_yr: 0, capex_zar: 0, opex_zar_yr: 0, lifetime_years: 10, start_date: '', description: '' });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/esg/initiatives', form).catch(() => undefined);
    onCreated(); onClose();
  };
  return (
    <Modal title="New reduction initiative" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <StitchField label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <StitchField label="Category">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            <option value="energy_efficiency">Energy efficiency</option>
            <option value="renewable_purchase">Renewable purchase (PPA/REC)</option>
            <option value="onsite_solar">On-site solar</option>
            <option value="fleet_electrification">Fleet electrification</option>
            <option value="process_improvement">Process improvement</option>
            <option value="supplier_engagement">Supplier engagement</option>
            <option value="offset_purchase">Carbon offset purchase</option>
          </select>
        </StitchField>
        <div className="grid grid-cols-2 gap-3">
          <StitchField label="Abatement (tCO₂e/yr)"><input type="number" value={form.abatement_tco2e_yr} onChange={(e) => setForm({ ...form, abatement_tco2e_yr: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
          <StitchField label="Capex (ZAR)"><input type="number" value={form.capex_zar} onChange={(e) => setForm({ ...form, capex_zar: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
          <StitchField label="Annual opex (ZAR)"><input type="number" value={form.opex_zar_yr} onChange={(e) => setForm({ ...form, opex_zar_yr: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
          <StitchField label="Lifetime (years)"><input type="number" value={form.lifetime_years} onChange={(e) => setForm({ ...form, lifetime_years: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        </div>
        <StitchField label="Description"><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Cancel</button>
          <button type="submit" className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold">Save initiative</button>
        </div>
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  5. Suppliers
// ════════════════════════════════════════════════════════════════════════
function SuppliersTab() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [showInv, setShowInv] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await api.get('/esg/suppliers').catch(() => ({ data: { success: true, data: [] } }));
    setItems(r.data?.data || []); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex items-center justify-between">
        <div className="text-[13px] text-[#3d4756]">Send Scope 3 surveys to suppliers (Cat 1, 4, 11) and track responses for value-chain emissions accuracy.</div>
        <button onClick={() => setShowInv(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1">
          <OEIcon name="plus" size={14} /> Invite supplier
        </button>
      </div>
      <StitchCard title="Supplier engagements">
        {loading ? <Skeleton variant="card" rows={2} /> : items.length === 0 ? <EmptyMsg>No suppliers invited.</EmptyMsg> : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafbfd]">
                <tr className="text-[11px] uppercase text-[#6b7685]">
                  <th className="px-4 py-2 text-left">Supplier</th>
                  <th className="px-4 py-2 text-left">Scope 3 cat</th>
                  <th className="px-4 py-2 text-left">Survey</th>
                  <th className="px-4 py-2 text-left">Invited</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Declared emissions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => {
                  const cat = SCOPE3_CATEGORIES.find((c) => c.id === Number(s.scope3_category));
                  return (
                    <tr key={String(s.id)} className="border-t border-[#eef2f7]">
                      <td className="px-4 py-2 font-medium">{String(s.supplier_name || '—')}</td>
                      <td className="px-4 py-2">{cat ? `${cat.id} · ${cat.name}` : String(s.scope3_category)}</td>
                      <td className="px-4 py-2">{String(s.survey_type || '—')}</td>
                      <td className="px-4 py-2 font-mono text-[11px]">{s.invited_at ? new Date(String(s.invited_at)).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-2"><StitchPill status={String(s.status || 'invited')} /></td>
                      <td className="px-4 py-2 text-right font-mono">{s.response_emissions_kg ? `${fmtN(Number(s.response_emissions_kg) / 1000, 2)} t` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </StitchCard>
      {showInv && <InviteSupplierModal onClose={() => setShowInv(false)} onSent={refresh} />}
    </div>
  );
}

function InviteSupplierModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState({ supplier_name: '', scope3_category: 1, survey_type: 'custom', notes: '' });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/esg/suppliers/invite', f).catch(() => undefined);
    onSent(); onClose();
  };
  return (
    <Modal title="Invite supplier to Scope 3 survey" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <StitchField label="Supplier name"><input required value={f.supplier_name} onChange={(e) => setF({ ...f, supplier_name: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <StitchField label="Scope 3 category">
          <select value={f.scope3_category} onChange={(e) => setF({ ...f, scope3_category: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            {SCOPE3_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.id}. {c.name}</option>)}
          </select>
        </StitchField>
        <StitchField label="Survey type">
          <select value={f.survey_type} onChange={(e) => setF({ ...f, survey_type: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            <option value="custom">Custom (Open Energy)</option>
            <option value="CDP_supply_chain">CDP Supply Chain</option>
            <option value="SBTi_PRTS">SBTi PRTS</option>
          </select>
        </StitchField>
        <StitchField label="Notes"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="w-full px-3 py-2 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Cancel</button>
          <button type="submit" className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold">Send invite</button>
        </div>
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  6. RECs
// ════════════════════════════════════════════════════════════════════════
function RecsTab() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await api.get('/esg/recs').catch(() => ({ data: { success: true, data: [] } }));
    setItems(r.data?.data || []); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const totalActive = items.filter((c) => c.status !== 'retired').reduce((s, c) => s + Number(c.mwh_remaining || 0), 0);
  const totalRetired = items.reduce((s, c) => s + (Number(c.mwh_certified || 0) - Number(c.mwh_remaining || 0)), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StitchKpi label="REC balance (active MWh)"  value={fmtN(totalActive)} icon={() => <OEIcon name="badge" size={14} />} tone="up" />
        <StitchKpi label="Retired this period (MWh)" value={fmtN(totalRetired)} icon={() => <OEIcon name="check-circle" size={14} />} />
        <StitchKpi label="Certificates"              value={fmtN(items.length)} icon={() => <OEIcon name="doc-stack" size={14} />} />
      </div>
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex items-center justify-between">
        <div className="text-[13px] text-[#3d4756]">REC / Guarantee-of-Origin certificates for Scope 2 market-based accounting. Retire against an electricity transaction to zero its market-based emissions.</div>
        <button onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1">
          <OEIcon name="plus" size={14} /> Register REC
        </button>
      </div>
      <StitchCard title="REC inventory">
        {loading ? <Skeleton variant="card" rows={2} /> : items.length === 0 ? <EmptyMsg>No RECs registered.</EmptyMsg> : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafbfd]">
                <tr className="text-[11px] uppercase text-[#6b7685]">
                  <th className="px-3 py-2 text-left">Serial</th>
                  <th className="px-3 py-2 text-left">Registry</th>
                  <th className="px-3 py-2 text-left">Technology</th>
                  <th className="px-3 py-2 text-left">Vintage</th>
                  <th className="px-3 py-2 text-right">Certified MWh</th>
                  <th className="px-3 py-2 text-right">Remaining MWh</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={String(c.id)} className="border-t border-[#eef2f7]">
                    <td className="px-3 py-2 font-mono text-[11px]">{String(c.serial_number)}</td>
                    <td className="px-3 py-2">{String(c.registry)}</td>
                    <td className="px-3 py-2 capitalize">{String(c.technology || '—').replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 font-mono">{c.vintage_year}{c.vintage_month ? `-${String(c.vintage_month).padStart(2,'0')}` : ''}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtN(Number(c.mwh_certified))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtN(Number(c.mwh_remaining))}</td>
                    <td className="px-3 py-2"><StitchPill status={String(c.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StitchCard>
      {showNew && <NewRecModal onClose={() => setShowNew(false)} onCreated={refresh} />}
    </div>
  );
}

function NewRecModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState({ serial_number: '', registry: 'I-REC', technology: 'solar_pv', vintage_year: new Date().getFullYear(), vintage_month: 1, mwh_certified: 0, acquisition_cost_zar: 0 });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/esg/recs', f).catch(() => undefined);
    onCreated(); onClose();
  };
  return (
    <Modal title="Register REC certificate" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <StitchField label="Serial number"><input required value={f.serial_number} onChange={(e) => setF({ ...f, serial_number: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <div className="grid grid-cols-2 gap-3">
          <StitchField label="Registry">
            <select value={f.registry} onChange={(e) => setF({ ...f, registry: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
              <option value="I-REC">I-REC</option>
              <option value="GO_EU">EU GO</option>
              <option value="SAREMI">SAREMI</option>
              <option value="VCS">VCS</option>
              <option value="GS">Gold Standard</option>
            </select>
          </StitchField>
          <StitchField label="Technology">
            <select value={f.technology} onChange={(e) => setF({ ...f, technology: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
              <option value="solar_pv">Solar PV</option>
              <option value="wind">Wind</option>
              <option value="hydro">Hydro</option>
              <option value="biomass">Biomass</option>
            </select>
          </StitchField>
          <StitchField label="Vintage year"><input type="number" value={f.vintage_year} onChange={(e) => setF({ ...f, vintage_year: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
          <StitchField label="Vintage month"><input type="number" min={1} max={12} value={f.vintage_month} onChange={(e) => setF({ ...f, vintage_month: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
          <StitchField label="MWh certified" required><input type="number" required value={f.mwh_certified} onChange={(e) => setF({ ...f, mwh_certified: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
          <StitchField label="Acquisition cost (ZAR)"><input type="number" value={f.acquisition_cost_zar} onChange={(e) => setF({ ...f, acquisition_cost_zar: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Cancel</button>
          <button type="submit" className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold">Register</button>
        </div>
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  7. Disclosures
// ════════════════════════════════════════════════════════════════════════
function DisclosuresTab() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [previewing, setPreviewing] = useState<{ id: string; framework: string; data: Record<string, unknown> } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await api.get('/esg/disclosures').catch(() => ({ data: { success: true, data: [] } }));
    setItems(r.data?.data || []); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const preview = async (id: string, framework: string) => {
    const r = await api.get(`/esg/disclosures/${id}/export?framework=${framework}`).catch(() => null);
    if (r?.data?.data) setPreviewing({ id, framework, data: r.data.data });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex items-center justify-between">
        <div className="text-[13px] text-[#3d4756]">Generate disclosure-ready exports for CDP, TCFD, CSRD, ISSB, JSE-SRL, SEC and the GHG Protocol from your year's emissions rollup.</div>
        <button onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1">
          <OEIcon name="plus" size={14} /> New disclosure
        </button>
      </div>
      <StitchCard title="Disclosures">
        {loading ? <Skeleton variant="card" rows={2} /> : items.length === 0 ? <EmptyMsg>No disclosures generated.</EmptyMsg> : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafbfd]">
                <tr className="text-[11px] uppercase text-[#6b7685]">
                  <th className="px-4 py-2 text-left">Framework</th>
                  <th className="px-4 py-2 text-right">Year</th>
                  <th className="px-4 py-2 text-right">Scope 1</th>
                  <th className="px-4 py-2 text-right">Scope 2 (mkt)</th>
                  <th className="px-4 py-2 text-right">Scope 3</th>
                  <th className="px-4 py-2 text-left">Assurance</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Export</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={String(d.id)} className="border-t border-[#eef2f7]">
                    <td className="px-4 py-2 font-medium">{String(d.framework)}</td>
                    <td className="px-4 py-2 text-right font-mono">{d.reporting_year}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtN(Number(d.scope1_tco2e || 0), 1)}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtN(Number(d.scope2_market_tco2e || 0), 1)}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtN(Number(d.scope3_tco2e || 0), 1)}</td>
                    <td className="px-4 py-2"><StitchPill label={String(d.assurance_level || 'none')} tone={d.assurance_level === 'reasonable' ? 'good' : d.assurance_level === 'limited' ? 'info' : 'neutral'} /></td>
                    <td className="px-4 py-2"><StitchPill status={String(d.status)} /></td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => preview(String(d.id), String(d.framework))} className="text-[12px] text-[#3b82c4] hover:underline inline-flex items-center gap-1">
                        <OEIcon name="download" size={12} /> Export
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StitchCard>
      {showNew && <NewDisclosureModal onClose={() => setShowNew(false)} onCreated={refresh} />}
      {previewing && <ExportPreviewModal framework={previewing.framework} data={previewing.data} onClose={() => setPreviewing(null)} />}
    </div>
  );
}

function NewDisclosureModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState({ framework: 'CDP', reporting_year: new Date().getFullYear() - 1, assurance_level: 'limited', notes: '' });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/esg/disclosures', f).catch(() => undefined);
    onCreated(); onClose();
  };
  return (
    <Modal title="Generate disclosure" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <StitchField label="Framework">
          <select value={f.framework} onChange={(e) => setF({ ...f, framework: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            {FRAMEWORKS.map((fw) => <option key={fw} value={fw}>{fw.replace(/_/g, ' ')}</option>)}
          </select>
        </StitchField>
        <StitchField label="Reporting year"><input type="number" value={f.reporting_year} onChange={(e) => setF({ ...f, reporting_year: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <StitchField label="Assurance level">
          <select value={f.assurance_level} onChange={(e) => setF({ ...f, assurance_level: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            <option value="none">None</option>
            <option value="limited">Limited</option>
            <option value="reasonable">Reasonable</option>
          </select>
        </StitchField>
        <StitchField label="Notes"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="w-full px-3 py-2 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Cancel</button>
          <button type="submit" className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold">Generate</button>
        </div>
      </form>
    </Modal>
  );
}

function ExportPreviewModal({ framework, data, onClose }: { framework: string; data: Record<string, unknown>; onClose: () => void }) {
  useEscapeKey(onClose);
  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${framework}_export.json`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Modal title={`${framework} export preview`} onClose={onClose} wide>
      <div className="space-y-3">
        <pre className="bg-[#0f1c2e] text-[#a3eaf0] text-[11px] font-mono p-3 rounded-md max-h-[400px] overflow-auto">{JSON.stringify(data, null, 2)}</pre>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Close</button>
          <button onClick={downloadJson} className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold inline-flex items-center gap-1">
            <OEIcon name="download" size={14} /> Download JSON
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  8. Risks (TCFD)
// ════════════════════════════════════════════════════════════════════════
function RisksTab() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await api.get('/esg/risks').catch(() => ({ data: { success: true, data: [] } }));
    setItems(r.data?.data || []); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex items-center justify-between">
        <div className="text-[13px] text-[#3d4756]">TCFD physical + transition climate risks. Plot against NGFS scenarios for stress testing.</div>
        <button onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1">
          <OEIcon name="plus" size={14} /> New risk
        </button>
      </div>
      <StitchCard title="Climate risk register">
        {loading ? <Skeleton variant="card" rows={2} /> : items.length === 0 ? <EmptyMsg>No risks logged.</EmptyMsg> : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafbfd]">
                <tr className="text-[11px] uppercase text-[#6b7685]">
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Title</th>
                  <th className="px-4 py-2 text-left">Horizon</th>
                  <th className="px-4 py-2 text-right">Likelihood</th>
                  <th className="px-4 py-2 text-right">Impact (ZAR)</th>
                  <th className="px-4 py-2 text-left">Scenario</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={String(r.id)} className="border-t border-[#eef2f7]">
                    <td className="px-4 py-2 capitalize">{String(r.risk_type).replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 font-medium">{String(r.title)}</td>
                    <td className="px-4 py-2 capitalize">{String(r.time_horizon || '—')}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.likelihood ? `${fmtN(Number(r.likelihood) * 100, 0)}%` : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{r.impact_zar ? fmtZ(Number(r.impact_zar)) : '—'}</td>
                    <td className="px-4 py-2 text-[11px]">{String(r.scenario || '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StitchCard>
      {showNew && <NewRiskModal onClose={() => setShowNew(false)} onCreated={refresh} />}
    </div>
  );
}

function NewRiskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState({ risk_type: 'physical_chronic', title: '', description: '', time_horizon: 'medium', likelihood: 0.3, impact_zar: 0, scenario: 'NGFS Disorderly' });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/esg/risks', f).catch(() => undefined);
    onCreated(); onClose();
  };
  return (
    <Modal title="Add climate risk" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <StitchField label="Risk type">
          <select value={f.risk_type} onChange={(e) => setF({ ...f, risk_type: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
            <option value="physical_acute">Physical · acute</option>
            <option value="physical_chronic">Physical · chronic</option>
            <option value="transition_policy">Transition · policy</option>
            <option value="transition_market">Transition · market</option>
            <option value="transition_technology">Transition · technology</option>
            <option value="transition_reputation">Transition · reputation</option>
          </select>
        </StitchField>
        <StitchField label="Title"><input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <StitchField label="Description"><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="w-full px-3 py-2 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <div className="grid grid-cols-2 gap-3">
          <StitchField label="Horizon">
            <select value={f.time_horizon} onChange={(e) => setF({ ...f, time_horizon: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
              <option value="short">Short (&lt; 3y)</option>
              <option value="medium">Medium (3–10y)</option>
              <option value="long">Long (&gt; 10y)</option>
            </select>
          </StitchField>
          <StitchField label="Scenario">
            <select value={f.scenario} onChange={(e) => setF({ ...f, scenario: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
              <option value="NGFS Orderly">NGFS Orderly</option>
              <option value="NGFS Disorderly">NGFS Disorderly</option>
              <option value="NGFS Hot House">NGFS Hot House World</option>
              <option value="IEA NZE">IEA Net-Zero by 2050</option>
            </select>
          </StitchField>
          <StitchField label="Likelihood (0–1)"><input type="number" min={0} max={1} step={0.05} value={f.likelihood} onChange={(e) => setF({ ...f, likelihood: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
          <StitchField label="Annual impact (ZAR)"><input type="number" value={f.impact_zar} onChange={(e) => setF({ ...f, impact_zar: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Cancel</button>
          <button type="submit" className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold">Save risk</button>
        </div>
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  Shared bits
// ════════════════════════════════════════════════════════════════════════
function ScopePill({ scope, cat }: { scope: number; cat: number | null }) {
  const tone = scope === 1 ? 'bg-[#1a3a5c] text-white' : scope === 2 ? 'bg-[#dbecfb] text-[#1a5d97]' : 'bg-[#b8eae6] text-[#0e6d68]';
  const label = scope === 3 && cat ? `S3-${cat}` : `S${scope}`;
  return <span className={`px-2 py-[2px] text-[10px] uppercase font-bold rounded ${tone}`}>{label}</span>;
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-[13px] text-[#6b7685]">{children}</div>;
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] overflow-auto`}>
        <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center justify-between sticky top-0 bg-white">
          <div className="font-display font-semibold text-[15px] text-[#0f1c2e]">{title}</div>
          <button onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]"><OEIcon name="close" size={18} /></button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default ESG;
