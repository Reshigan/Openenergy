import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { ExportBar } from '../ExportBar';
import { StitchCard, StitchKpi, StitchPill, StitchField } from '../StitchPage';
import { OEIcon, type IconName } from '../OEIcon';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, PolarAngleAxis,
  PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useEscapeKey } from '../../hooks/useEscapeKey';

// ─── Design tokens ───────────────────────────────────────────────────────────
const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

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

type Tab =
  | 'overview' | 'transactions' | 'targets' | 'initiatives' | 'suppliers' | 'recs' | 'disclosures' | 'risks'
  | 'financed' | 'removals' | 'cfe' | 'pcf' | 'assurance' | 'maturity' | 'jurisdictions' | 'anomalies'
  | 'scenarios' | 'counterparties' | 'macc' | 'pathways' | 'ai_classifier' | 'rec_market' | 'audit_chain';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'overview',     label: 'Overview',      icon: 'chart-bar' },
  { id: 'transactions', label: 'Transactions',  icon: 'database' },
  { id: 'ai_classifier',label: 'AI classify',   icon: 'brain' },
  { id: 'targets',      label: 'Targets',       icon: 'target' },
  { id: 'initiatives',  label: 'Initiatives',   icon: 'spark' },
  { id: 'macc',         label: 'MACC',          icon: 'chart-line' },
  { id: 'financed',     label: 'Financed Emissions', icon: 'piggy-bank' },
  { id: 'scenarios',    label: 'Scenarios',     icon: 'workflow' },
  { id: 'counterparties',label:'Counterparties',icon: 'people' },
  { id: 'removals',     label: 'Removals',      icon: 'eco' },
  { id: 'cfe',          label: '24/7 CFE',      icon: 'bolt' },
  { id: 'rec_market',   label: 'REC market',    icon: 'store' },
  { id: 'pcf',          label: 'Product PCF',   icon: 'tag' },
  { id: 'pathways',     label: 'Pathways',      icon: 'trending-down' },
  { id: 'suppliers',    label: 'Suppliers',     icon: 'team' },
  { id: 'recs',         label: 'RECs',          icon: 'badge' },
  { id: 'assurance',    label: 'Assurance',     icon: 'shield' },
  { id: 'audit_chain',  label: 'Audit chain',   icon: 'layers' },
  { id: 'maturity',     label: 'Maturity',      icon: 'spark' },
  { id: 'disclosures',  label: 'Disclosures',   icon: 'report' },
  { id: 'jurisdictions',label: 'Jurisdictions', icon: 'globe' },
  { id: 'anomalies',    label: 'Anomalies',     icon: 'alert' },
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

const TAB_DESCRIPTIONS: Partial<Record<Tab, string>> = {
  overview:      'Current-year GHG rollup, scope split, intensity metrics, and data quality indicators.',
  transactions:  'Per-activity emission ledger — drillable by Scope 1/2/3 category.',
  targets:       'SBTi-aligned absolute and intensity reduction targets with progress tracking.',
  initiatives:   'Emission reduction project portfolio with MACC analysis.',
  macc:          'Marginal abatement cost curve — prioritise reduction investments by cost-effectiveness.',
  financed:      'Scope 3 Category 15 financed emissions for lenders and investors.',
  scenarios:     'Net-zero pathway modelling under 1.5°C, 2°C, and BAU trajectories.',
  counterparties:'Scope 3 Category 11 downstream use-of-sold-products emissions by counterparty.',
  removals:      'Carbon dioxide removal credits and nature-based offset portfolio.',
  cfe:           '24/7 carbon-free energy hourly matching for RE100 compliance.',
  rec_market:    'REC spot marketplace — buy, retire, and track certificate positions.',
  pcf:           'Product carbon footprint per unit, batch, or SKU.',
  pathways:      'SBTi-aligned decarbonisation pathway with annual waypoints.',
  suppliers:     'Scope 3 upstream supplier engagement surveys and ratings.',
  recs:          'REC / Guarantee of Origin certificates and retirement ledger.',
  assurance:     'Third-party verification status and assurance opinion register.',
  audit_chain:   'Hash-chained immutable audit log — tamper-evident chain verification.',
  maturity:      'GHG accounting maturity model — data quality and process readiness.',
  disclosures:   'One-click CDP, TCFD, CSRD, ISSB, JSE-SRL, GHG Protocol exports.',
  jurisdictions: 'Regulatory obligations by jurisdiction (SA Carbon Tax, EU ETS, etc.).',
  anomalies:     'AI-detected emission anomalies and data quality alerts.',
  ai_classifier: 'AI-assisted activity-to-scope classification with confidence scoring.',
  risks:         'TCFD physical and transition risk register with scenario impact.',
};

export function ESG() {
  const [tab, setTab] = useState<Tab>('overview');
  const tabDesc = TAB_DESCRIPTIONS[tab] ?? '';
  const activeLabel = TABS.find(t => t.id === tab)?.label ?? '';

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)', background: BG, overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <OEIcon name="leaf" size={14} />
            <span style={{ fontSize: 11, fontWeight: 600, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sustainability · GHG Protocol · CDP · TCFD · ISSB</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>ESG & Carbon Accounting</h1>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>Audit-grade Scope 1/2/3 transaction ledger with SBTi-aligned targets, supplier engagement, REC matching, and one-click disclosure exports.</p>
        </div>

        {/* Tab bar — horizontal scroll for many tabs */}
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 2, borderBottom: `2px solid ${BORDER}`, minWidth: 'max-content' }}>
            {TABS.map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? ACC : TX2,
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${tab === t.id ? ACC : 'transparent'}`,
                marginBottom: -2, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                <OEIcon name={t.icon} size={13} />{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {tab === 'overview'       && <OverviewTab />}
        {tab === 'transactions'   && <TransactionsTab />}
        {tab === 'targets'        && <TargetsTab />}
        {tab === 'initiatives'    && <InitiativesTab />}
        {tab === 'financed'       && <FinancedEmissionsTab />}
        {tab === 'removals'       && <RemovalsTab />}
        {tab === 'cfe'            && <CFETab />}
        {tab === 'pcf'            && <PCFTab />}
        {tab === 'suppliers'      && <SuppliersTab />}
        {tab === 'recs'           && <RecsTab />}
        {tab === 'assurance'      && <AssuranceTab />}
        {tab === 'maturity'       && <MaturityTab />}
        {tab === 'disclosures'    && <DisclosuresTab />}
        {tab === 'jurisdictions'  && <JurisdictionsTab />}
        {tab === 'anomalies'      && <AnomaliesTab />}
        {tab === 'scenarios'      && <ScenariosTab />}
        {tab === 'counterparties' && <CounterpartiesTab />}
        {tab === 'macc'           && <MACCTab />}
        {tab === 'pathways'       && <PathwaysTab />}
        {tab === 'ai_classifier'  && <AIClassifierTab />}
        {tab === 'rec_market'     && <RecMarketTab />}
        {tab === 'audit_chain'    && <AuditChainTab />}
        {tab === 'risks'          && <RisksTab />}
      </div>

      {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`, background: BG1,
        overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Active tab context */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Current View</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: TX1, marginBottom: 6 }}>{activeLabel}</div>
          {tabDesc && <p style={{ fontSize: 12, color: TX2, margin: 0, lineHeight: 1.6 }}>{tabDesc}</p>}
        </div>

        {/* Standards reference */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Standards Alignment</div>
          {[
            { code: 'GHG Protocol', desc: 'Scope 1/2/3 methodology', color: GOOD },
            { code: 'SBTi',         desc: 'Science-based targets',     color: GOOD },
            { code: 'CDP',          desc: 'Climate disclosure',         color: ACC  },
            { code: 'TCFD',         desc: 'Climate risk framework',     color: ACC  },
            { code: 'ISSB S2',      desc: 'IFRS sustainability',        color: ACC  },
            { code: 'CSRD',         desc: 'EU reporting directive',     color: TX2  },
            { code: 'JSE-SRL',      desc: 'SA listing requirements',   color: TX2  },
            { code: 'Carbon Tax Act', desc: 'Section 13 offset claims',color: TX2  },
          ].map(s => (
            <div key={s.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: TX1, fontFamily: MONO }}>{s.code}</span>
              <span style={{ fontSize: 11, color: s.color }}>{s.desc}</span>
            </div>
          ))}
        </div>

        {/* Scope quick reference */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Scope Reference</div>
          {[
            { scope: 'Scope 1', def: 'Direct combustion, process, fugitive', color: 'oklch(0.46 0.16 55)' },
            { scope: 'Scope 2', def: 'Purchased electricity & heat',         color: 'oklch(0.46 0.16 55)' },
            { scope: 'Scope 3', def: '15 upstream + downstream categories',  color: '#1f9b95' },
          ].map(s => (
            <div key={s.scope} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: s.color, minWidth: 56, fontFamily: MONO }}>{s.scope}</span>
              <span style={{ fontSize: 11, color: TX2, lineHeight: 1.5 }}>{s.def}</span>
            </div>
          ))}
        </div>

        {/* Severity legend */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Data Quality</div>
          {[
            { label: 'Measured',   color: GOOD },
            { label: 'Calculated', color: ACC  },
            { label: 'Estimated',  color: BAD  },
          ].map(q => (
            <div key={q.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: q.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: TX2 }}>{q.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
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
    { name: 'Scope 1',         tco2e: rollup.scope1_tco2e || 0,           color: 'oklch(0.46 0.16 55)' },
    { name: 'Scope 2 (loc)',   tco2e: rollup.scope2_location_tco2e || 0,  color: 'oklch(0.46 0.16 55)' },
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
        <button type="button" onClick={recompute} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold inline-flex items-center gap-1">
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
          <button type="button" onClick={refresh} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[12px] font-semibold inline-flex items-center gap-1">
            <OEIcon name="refresh" size={14} /> Refresh
          </button>
          <button type="button" onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold inline-flex items-center gap-1">
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
          <button type="submit" disabled={busy} className="h-9 px-4 rounded-md bg-[#c2873a] text-white text-[13px] font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Log activity'}</button>
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
        <button type="button" onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold inline-flex items-center gap-1">
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
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
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
          <button type="submit" disabled={busy} className="h-9 px-4 rounded-md bg-[#c2873a] text-white text-[13px] font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save target'}</button>
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
        <button type="button" onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold inline-flex items-center gap-1">
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
                {macc.map((d, i) => <Cell key={i} fill={d.mac < 0 ? '#1a8a5b' : d.mac < 500 ? 'oklch(0.46 0.16 55)' : '#c97a14'} />)}
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
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
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
          <button type="submit" disabled={busy} className="h-9 px-4 rounded-md bg-[#c2873a] text-white text-[13px] font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save initiative'}</button>
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
        <button type="button" onClick={() => setShowInv(true)} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold inline-flex items-center gap-1">
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
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
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
            <option value="custom">Custom (CEC)</option>
            <option value="CDP_supply_chain">CDP Supply Chain</option>
            <option value="SBTi_PRTS">SBTi PRTS</option>
          </select>
        </StitchField>
        <StitchField label="Notes"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="w-full px-3 py-2 rounded-md border border-[#dde4ec] text-[13px]" /></StitchField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Cancel</button>
          <button type="submit" disabled={busy} className="h-9 px-4 rounded-md bg-[#c2873a] text-white text-[13px] font-semibold disabled:opacity-50">{busy ? 'Sending…' : 'Send invite'}</button>
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
        <button type="button" onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold inline-flex items-center gap-1">
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
                    <td className="px-3 py-2 font-mono">{String(c.vintage_year)}{c.vintage_month ? `-${String(c.vintage_month).padStart(2,'0')}` : ''}</td>
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
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
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
          <button type="submit" disabled={busy} className="h-9 px-4 rounded-md bg-[#c2873a] text-white text-[13px] font-semibold disabled:opacity-50">{busy ? 'Registering…' : 'Register'}</button>
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
        <button type="button" onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold inline-flex items-center gap-1">
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
                    <td className="px-4 py-2 text-right font-mono">{String(d.reporting_year)}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtN(Number(d.scope1_tco2e || 0), 1)}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtN(Number(d.scope2_market_tco2e || 0), 1)}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtN(Number(d.scope3_tco2e || 0), 1)}</td>
                    <td className="px-4 py-2"><StitchPill label={String(d.assurance_level || 'none')} tone={d.assurance_level === 'reasonable' ? 'good' : d.assurance_level === 'limited' ? 'info' : 'neutral'} /></td>
                    <td className="px-4 py-2"><StitchPill status={String(d.status)} /></td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" onClick={() => preview(String(d.id), String(d.framework))} className="text-[12px] text-[oklch(0.46_0.16_55)] hover:underline inline-flex items-center gap-1">
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
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
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
          <button type="submit" disabled={busy} className="h-9 px-4 rounded-md bg-[#c2873a] text-white text-[13px] font-semibold disabled:opacity-50">{busy ? 'Generating…' : 'Generate'}</button>
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
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-[#dde4ec] text-[13px] font-semibold">Close</button>
          <button type="button" onClick={downloadJson} className="h-9 px-4 rounded-md bg-[#c2873a] text-white text-[13px] font-semibold inline-flex items-center gap-1">
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
        <button type="button" onClick={() => setShowNew(true)} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold inline-flex items-center gap-1">
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
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
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
          <button type="submit" disabled={busy} className="h-9 px-4 rounded-md bg-[#c2873a] text-white text-[13px] font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save risk'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  Shared bits
// ════════════════════════════════════════════════════════════════════════
function ScopePill({ scope, cat }: { scope: number; cat: number | null }) {
  const tone = scope === 1 ? 'bg-[#c2873a] text-white' : scope === 2 ? 'bg-[oklch(0.94_0.02_250)] text-[#1a5d97]' : 'bg-[#b8eae6] text-[#0e6d68]';
  const label = scope === 3 && cat ? `S3-${cat}` : `S${scope}`;
  return <span className={`px-2 py-[2px] text-[10px] uppercase font-bold rounded ${tone}`}>{label}</span>;
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-[13px] text-[#6b7685]">{children}</div>;
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] overflow-auto`}>
        <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center justify-between sticky top-0 bg-white">
          <div className="font-display font-semibold text-[15px] text-[#0f1c2e]">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="text-[#6b7685] hover:text-[#0f1c2e]"><OEIcon name="close" size={18} /></button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Watershed-parity tabs (migration 040)
// ════════════════════════════════════════════════════════════════════════

// Compact input that fits the StitchPage visual style. Used inside the
// modals on the Watershed-parity tabs; lets us pass `value`/`onChange`
// without an explicit child input.
function Field({ label, value, onChange, type = 'text', placeholder, className }: {
  label: string;
  value: string | number | undefined;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className || ''}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6b7685]">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        className="mt-1 h-9 w-full px-3 rounded-md border border-[#dde4ec] text-[13px] focus:outline-none focus:ring-2 focus:ring-[oklch(0.46_0.16_55)]/30"
      />
    </label>
  );
}

function useWatershed<T>(path: string, initial: T): { data: T; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get(`/watershed${path}`);
      // axios: r.data is the response body { success, data }. Payload is body.data.
      const body = r?.data;
      const payload = body && typeof body === 'object' && 'data' in body ? (body as any).data : body;
      setData((payload ?? initial) as T);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally { setLoading(false); }
  }, [path, initial]);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}

// ─── 9. Financed Emissions (PCAF) ───────────────────────────────────────
function FinancedEmissionsTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const coverage = useWatershed<any[]>(`/pcaf/coverage?year=${year}`, []);
  const rows = useWatershed<any[]>(`/pcaf/financed?year=${year}`, []);
  const targets = useWatershed<any[]>(`/pcaf/targets`, []);
  const temp = useWatershed<any[]>(`/pcaf/temperature`, []);
  const [open, setOpen] = useState(false);
  const [tgtOpen, setTgtOpen] = useState(false);

  const totalFinanced = (coverage.data || []).reduce((s, c) => s + (c.financed_total_tco2e || 0), 0);
  const totalExposure = (coverage.data || []).reduce((s, c) => s + (c.total_exposure_zar || 0), 0);
  const coveredClasses = (coverage.data || []).filter(c => c.rows_recorded > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* StitchField in this section is used legacy-style with value/onChange — cast to keep tsc green while we plan a proper wrapper. */}
          <StitchField {...({ label: 'Year', value: year, onChange: (e: any) => setYear(Number(e.target.value)), type: 'number', className: 'w-28' } as any)} />
          <button type="button" onClick={() => { coverage.refresh(); rows.refresh(); }} className="text-sm text-[oklch(0.46_0.16_55)] hover:underline">Refresh</button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setTgtOpen(true)} className="px-3 py-1.5 text-sm border rounded-lg">+ NZBA/SBTi-FI target</button>
          <button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">+ Record exposure</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StitchKpi label="Financed tCO₂e" value={fmtN(totalFinanced, 1)} tone="up" />
        <StitchKpi label="Exposure" value={fmtZ(totalExposure / 1e9, 1) + 'B'}  />
        <StitchKpi label="Asset Classes Covered" value={`${coveredClasses}/10`}  />
        <StitchKpi label="Targets" value={(targets.data || []).length} tone="warn" />
      </div>

      <StitchCard title="PCAF coverage by asset class">
        {coverage.loading ? <Skeleton /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Asset class</th><th>Rows</th><th>Exposure (ZAR)</th><th>Financed tCO₂e</th><th>Avg PCAF DQ</th></tr></thead>
            <tbody>
              {(coverage.data || []).map((c: any) => (
                <tr key={c.code} className="border-t border-[#eef2f7]">
                  <td className="py-2"><div className="font-medium text-[#0f1c2e]">{c.name}</div><div className="text-[12px] text-[#6b7685]">{c.category}</div></td>
                  <td>{c.rows_recorded || 0}</td>
                  <td>{fmtZ(c.total_exposure_zar || 0)}</td>
                  <td>{fmtN(c.financed_total_tco2e || 0, 2)}</td>
                  <td>{c.avg_data_quality ? c.avg_data_quality.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>

      <StitchCard title="Recent exposures">
        {(rows.data || []).length === 0
          ? <EmptyState icon="database" title="No exposures recorded" subtitle="Add your first financed exposure to start computing PCAF financed emissions." />
          : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Counterparty</th><th>Asset class</th><th>Exposure</th><th>Attribution</th><th>Financed tCO₂e</th><th>DQ</th></tr></thead>
              <tbody>
                {(rows.data || []).map((r: any) => (
                  <tr key={r.id} className="border-t border-[#eef2f7]">
                    <td className="py-2"><div className="font-medium">{r.counterparty_name}</div><div className="text-[12px] text-[#6b7685]">{r.counterparty_sector_nace || ''}</div></td>
                    <td>{r.asset_class}</td>
                    <td>{fmtZ(r.outstanding_amount_zar)}</td>
                    <td>{r.attribution_factor ? (r.attribution_factor * 100).toFixed(2) + '%' : '—'}</td>
                    <td>{fmtN(r.financed_total_tco2e || 0, 2)}</td>
                    <td>{r.pcaf_data_quality_score ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </StitchCard>

      <StitchCard title="Portfolio temperature alignment">
        {(temp.data || []).length === 0
          ? <div className="text-sm text-[#6b7685]">No temperature alignment records yet.</div>
          : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Year</th><th>Sector</th><th>Methodology</th><th>Implied °C</th><th>Pathway</th></tr></thead>
              <tbody>
                {(temp.data || []).map((t: any) => (
                  <tr key={t.id} className="border-t border-[#eef2f7]">
                    <td className="py-2">{t.reporting_year}</td><td>{t.sector || 'portfolio'}</td><td>{t.methodology || '—'}</td>
                    <td><span className={t.temperature_c <= 1.5 ? 'text-green-600 font-semibold' : t.temperature_c <= 2 ? 'text-amber-600' : 'text-red-600 font-semibold'}>{t.temperature_c?.toFixed(2)}°C</span></td>
                    <td>{t.pathway || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </StitchCard>

      {open && <ExposureModal year={year} onClose={() => { setOpen(false); coverage.refresh(); rows.refresh(); }} />}
      {tgtOpen && <PcafTargetModal onClose={() => { setTgtOpen(false); targets.refresh(); }} />}
    </div>
  );
}

function ExposureModal({ year, onClose }: { year: number; onClose: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState<any>({ reporting_year: year, asset_class: 'business_loans', attribution_method: 'evic' });
  const [classes, setClasses] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/watershed/pcaf/asset-classes').then(r => setClasses((r?.data || r) ?? [])); }, []);
  const save = async () => {
    setBusy(true);
    try { await api.post('/watershed/pcaf/financed', f); onClose(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Record PCAF exposure" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Reporting year" type="number" value={f.reporting_year} onChange={e => setF({ ...f, reporting_year: Number(e.target.value) })} />
        <label className="block">
          <div className="text-[12px] font-medium text-[#0f1c2e] mb-1">Asset class</div>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.asset_class} onChange={e => setF({ ...f, asset_class: e.target.value })}>
            {classes.map((c: any) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        <Field label="Counterparty name" value={f.counterparty_name || ''} onChange={e => setF({ ...f, counterparty_name: e.target.value })} />
        <Field label="Country" value={f.counterparty_country || ''} onChange={e => setF({ ...f, counterparty_country: e.target.value })} />
        <Field label="NACE sector" value={f.counterparty_sector_nace || ''} onChange={e => setF({ ...f, counterparty_sector_nace: e.target.value })} />
        <Field label="Revenue (ZAR)" type="number" value={f.counterparty_revenue_zar || ''} onChange={e => setF({ ...f, counterparty_revenue_zar: Number(e.target.value) })} />
        <Field label="EVIC (ZAR)" type="number" value={f.counterparty_evic_zar || ''} onChange={e => setF({ ...f, counterparty_evic_zar: Number(e.target.value) })} />
        <Field label="Outstanding (ZAR)" type="number" value={f.outstanding_amount_zar || ''} onChange={e => setF({ ...f, outstanding_amount_zar: Number(e.target.value) })} />
        <label className="block">
          <div className="text-[12px] font-medium text-[#0f1c2e] mb-1">Attribution method</div>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.attribution_method} onChange={e => setF({ ...f, attribution_method: e.target.value })}>
            <option value="evic">EVIC</option><option value="total_equity">Total equity</option><option value="property_value">Property value</option><option value="vehicle_value">Vehicle value</option><option value="revenue">Revenue</option><option value="asset_value">Asset value</option>
          </select>
        </label>
        <Field label="Scope 1 (tCO₂e)" type="number" value={f.counterparty_scope1_tco2e || ''} onChange={e => setF({ ...f, counterparty_scope1_tco2e: Number(e.target.value) })} />
        <Field label="Scope 2 (tCO₂e)" type="number" value={f.counterparty_scope2_tco2e || ''} onChange={e => setF({ ...f, counterparty_scope2_tco2e: Number(e.target.value) })} />
        <Field label="Scope 3 (tCO₂e)" type="number" value={f.counterparty_scope3_tco2e || ''} onChange={e => setF({ ...f, counterparty_scope3_tco2e: Number(e.target.value) })} />
        <label className="block">
          <div className="text-[12px] font-medium text-[#0f1c2e] mb-1">Data source</div>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.emissions_data_source || 'reported'} onChange={e => setF({ ...f, emissions_data_source: e.target.value })}>
            <option value="reported">Counterparty reported</option><option value="CDP">CDP</option><option value="proxy">Proxy</option><option value="sector_average">Sector average</option>
          </select>
        </label>
        <Field label="PCAF data quality (1–5)" type="number" value={f.pcaf_data_quality_score || ''} onChange={e => setF({ ...f, pcaf_data_quality_score: Number(e.target.value) })} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button>
        <button type="button" onClick={save} disabled={busy} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg disabled:opacity-50">{busy ? 'Saving…' : 'Record exposure'}</button>
      </div>
    </Modal>
  );
}

function PcafTargetModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState<any>({ framework: 'NZBA', scope: 'sector', base_year: 2020, target_year: 2030 });
  const save = async () => {
    try { await api.post('/watershed/pcaf/targets', f); onClose(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <Modal title="PCAF / NZBA target" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block"><div className="text-[12px] font-medium text-[#0f1c2e] mb-1">Framework</div>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.framework} onChange={e => setF({ ...f, framework: e.target.value })}>
            <option>NZBA</option><option>SBTi_FI</option><option>GFANZ</option>
          </select>
        </label>
        <label className="block"><div className="text-[12px] font-medium text-[#0f1c2e] mb-1">Scope</div>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })}>
            <option value="portfolio_wide">Portfolio-wide</option><option value="sector">Sector</option><option value="asset_class">Asset class</option>
          </select>
        </label>
        <Field label="Sector" value={f.sector || ''} onChange={e => setF({ ...f, sector: e.target.value })} />
        <Field label="Asset class" value={f.asset_class || ''} onChange={e => setF({ ...f, asset_class: e.target.value })} />
        <Field label="Base year" type="number" value={f.base_year} onChange={e => setF({ ...f, base_year: Number(e.target.value) })} />
        <Field label="Base intensity" type="number" value={f.base_intensity || ''} onChange={e => setF({ ...f, base_intensity: Number(e.target.value) })} />
        <Field label="Target year" type="number" value={f.target_year} onChange={e => setF({ ...f, target_year: Number(e.target.value) })} />
        <Field label="Target intensity" type="number" value={f.target_intensity || ''} onChange={e => setF({ ...f, target_intensity: Number(e.target.value) })} />
        <Field label="Pathway alignment" value={f.pathway_alignment || ''} onChange={e => setF({ ...f, pathway_alignment: e.target.value })} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button>
        <button type="button" onClick={save} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">Save target</button>
      </div>
    </Modal>
  );
}

// ─── 10. Removals (CDR) ─────────────────────────────────────────────────
function RemovalsTab() {
  const projects = useWatershed<any[]>(`/removals/projects`, []);
  const offtakes = useWatershed<any[]>(`/removals/offtakes`, []);
  const portfolio = useWatershed<any>(`/removals/portfolio`, {});
  const [offtakeOpen, setOfftakeOpen] = useState<string | null>(null);
  const [retireOpen, setRetireOpen] = useState<string | null>(null);

  const summary = (portfolio.data as any)?.summary || {};
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StitchKpi label="Committed tCO₂e" value={fmtN(summary.total_committed_tco2e, 1)} tone="up" />
        <StitchKpi label="Retired" value={fmtN(summary.total_retired_tco2e, 1)}  />
        <StitchKpi label="Spend" value={fmtZ(summary.total_zar)}  />
        <StitchKpi label="Tech diversity" value={`${summary.technology_count || 0} tech / ${summary.category_count || 0} cat`} tone="warn" />
      </div>

      <StitchCard title="Marketplace — available projects">
        {projects.loading ? <Skeleton /> : (projects.data || []).length === 0 ? <EmptyState icon="leaf" title="No CDR projects listed" subtitle="No removals projects in the marketplace yet." /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(projects.data || []).map((p: any) => (
              <div key={p.id} className="border border-[#eef2f7] rounded-xl p-3 hover:border-[#0f1c2e] transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-display font-semibold text-[14px]">{p.project_name}</div>
                  <StitchPill label={p.category} tone={p.category === 'engineered' ? 'info' : p.category === 'nature' ? 'good' : 'warn'} />
                </div>
                <div className="text-[12px] text-[#6b7685] mb-2">{p.technology} · {p.host_country || 'Global'} · {p.permanence_years || 0}y</div>
                <div className="text-[13px] text-[#0f1c2e] mb-2 line-clamp-2">{p.description}</div>
                <div className="flex items-center justify-between text-[12px] mb-2">
                  <span>{fmtZ(p.price_zar_per_tco2e || 0)}/tCO₂e</span>
                  <span>{fmtN(p.expected_tco2e_yr || 0)} t/yr</span>
                </div>
                <button type="button" onClick={() => setOfftakeOpen(p.id)} disabled={p.status !== 'listed'} className="w-full px-2 py-1.5 text-[12px] bg-[#c2873a] text-white rounded-lg disabled:opacity-40">{p.status === 'listed' ? 'Sign offtake' : p.status}</button>
              </div>
            ))}
          </div>
        )}
      </StitchCard>

      <StitchCard title="My offtake agreements">
        {(offtakes.data || []).length === 0 ? <div className="text-sm text-[#6b7685]">No offtakes signed.</div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Project</th><th>Tech</th><th>Committed</th><th>Retired</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(offtakes.data || []).map((o: any) => (
                <tr key={o.id} className="border-t border-[#eef2f7]">
                  <td className="py-2 font-medium">{o.project_name}</td>
                  <td>{o.technology}</td>
                  <td>{fmtN(o.total_tco2e, 1)}</td>
                  <td>{fmtN(o.retired_tco2e, 1)}</td>
                  <td><StitchPill status={o.status} /></td>
                  <td><button type="button" onClick={() => setRetireOpen(o.id)} className="text-[oklch(0.46_0.16_55)] text-[12px] hover:underline">Retire</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>

      {offtakeOpen && <OfftakeModal projectId={offtakeOpen} onClose={() => { setOfftakeOpen(null); offtakes.refresh(); projects.refresh(); portfolio.refresh(); }} />}
      {retireOpen && <RetireModal offtakeId={retireOpen} onClose={() => { setRetireOpen(null); offtakes.refresh(); portfolio.refresh(); }} />}
    </div>
  );
}

function OfftakeModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState<any>({ project_id: projectId, total_tco2e: 1000, price_zar_per_tco2e: 1500, start_vintage_year: new Date().getFullYear() });
  const save = async () => {
    try { await api.post('/watershed/removals/offtakes', f); onClose(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <Modal title="Sign CDR offtake" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Total tCO₂e" type="number" value={f.total_tco2e} onChange={e => setF({ ...f, total_tco2e: Number(e.target.value) })} />
        <Field label="Price ZAR/tCO₂e" type="number" value={f.price_zar_per_tco2e} onChange={e => setF({ ...f, price_zar_per_tco2e: Number(e.target.value) })} />
        <Field label="Start vintage" type="number" value={f.start_vintage_year} onChange={e => setF({ ...f, start_vintage_year: Number(e.target.value) })} />
        <Field label="End vintage" type="number" value={f.end_vintage_year || ''} onChange={e => setF({ ...f, end_vintage_year: Number(e.target.value) })} />
      </div>
      <div className="mt-3 text-sm text-[#0f1c2e]">Total: <strong>{fmtZ(f.total_tco2e * f.price_zar_per_tco2e)}</strong></div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button><button type="button" onClick={save} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">Sign offtake</button></div>
    </Modal>
  );
}

function RetireModal({ offtakeId, onClose }: { offtakeId: string; onClose: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState<any>({ tco2e_retired: 100, reporting_year: new Date().getFullYear(), beneficiary: '', reason: '' });
  const save = async () => {
    try { await api.post(`/watershed/removals/offtakes/${offtakeId}/retire`, f); onClose(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <Modal title="Retire CDR units" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="tCO₂e to retire" type="number" value={f.tco2e_retired} onChange={e => setF({ ...f, tco2e_retired: Number(e.target.value) })} />
        <Field label="Reporting year" type="number" value={f.reporting_year} onChange={e => setF({ ...f, reporting_year: Number(e.target.value) })} />
        <Field label="Vintage year" type="number" value={f.vintage_year || ''} onChange={e => setF({ ...f, vintage_year: Number(e.target.value) })} />
        <Field label="Serial number" value={f.serial_number || ''} onChange={e => setF({ ...f, serial_number: e.target.value })} />
        <Field label="Beneficiary" value={f.beneficiary} onChange={e => setF({ ...f, beneficiary: e.target.value })} />
        <Field label="Reason" value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button><button type="button" onClick={save} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">Retire</button></div>
    </Modal>
  );
}

// ─── 11. CFE — 24/7 hourly matching ─────────────────────────────────────
function CFETab() {
  const summary = useWatershed<any[]>(`/cfe/summary`, []);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <p className="text-sm text-[#6b7685]">24/7 carbon-free energy hourly matching — load vs. carbon-free generation, hour by hour.</p>
        <button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">Compute CFE score</button>
      </div>
      <StitchCard title="Recent CFE periods">
        {summary.loading ? <Skeleton /> : (summary.data || []).length === 0 ? <EmptyState icon="bolt" title="No CFE scores yet" subtitle="Upload hourly load & generation data, then compute a CFE score for the period." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Period</th><th>Load MWh</th><th>Carbon-free MWh</th><th>Match %</th><th>Full-match hrs</th><th>Avoided tCO₂e</th></tr></thead>
            <tbody>
              {(summary.data || []).map((s: any, i: number) => (
                <tr key={i} className="border-t border-[#eef2f7]">
                  <td className="py-2">{s.reporting_period_start?.slice(0, 10)} → {s.reporting_period_end?.slice(0, 10)}</td>
                  <td>{fmtN((s.total_load_kwh || 0) / 1000, 1)}</td>
                  <td>{fmtN((s.total_carbon_free_kwh || 0) / 1000, 1)}</td>
                  <td><span className={s.cfe_match_pct >= 80 ? 'text-green-600 font-semibold' : s.cfe_match_pct >= 50 ? 'text-amber-600' : 'text-red-600'}>{(s.cfe_match_pct || 0).toFixed(1)}%</span></td>
                  <td>{s.hours_with_full_match || 0}</td>
                  <td>{fmtN(s.emissions_avoided_tco2e || 0, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>
      {open && <CFEScoreModal onClose={() => { setOpen(false); summary.refresh(); }} />}
    </div>
  );
}

function CFEScoreModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState<any>({ period_start: '2026-01-01', period_end: '2026-01-31', grid_intensity_kg_kwh: 0.92 });
  const [result, setResult] = useState<any>(null);
  const save = async () => {
    try {
      const r = await api.post('/watershed/cfe/score', f);
      setResult(r?.data || r);
    } catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <Modal title="Compute 24/7 CFE score" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Period start" value={f.period_start} onChange={e => setF({ ...f, period_start: e.target.value })} />
        <Field label="Period end" value={f.period_end} onChange={e => setF({ ...f, period_end: e.target.value })} />
        <Field label="Grid intensity (kg/kWh)" type="number" value={f.grid_intensity_kg_kwh} onChange={e => setF({ ...f, grid_intensity_kg_kwh: Number(e.target.value) })} />
      </div>
      {result && (
        <div className="mt-4 p-3 bg-[#f6f9fc] rounded-lg text-sm">
          <div>Load: <strong>{fmtN(result.total_load_kwh / 1000, 2)} MWh</strong></div>
          <div>Carbon-free: <strong>{fmtN(result.total_carbon_free_kwh / 1000, 2)} MWh</strong></div>
          <div>Match: <strong>{(result.cfe_match_pct || 0).toFixed(1)}%</strong></div>
          <div>Avoided emissions: <strong>{fmtN(result.emissions_avoided_tco2e, 2)} tCO₂e</strong></div>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Close</button><button type="button" onClick={save} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">Compute</button></div>
    </Modal>
  );
}

// ─── 12. Product Carbon Footprints ──────────────────────────────────────
function PCFTab() {
  const rows = useWatershed<any[]>(`/pcf`, []);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex justify-between"><p className="text-sm text-[#6b7685]">SKU-level lifecycle carbon — cradle-to-gate per ISO 14067.</p><button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">+ Add product</button></div>
      <StitchCard title="Product footprints">
        {rows.loading ? <Skeleton /> : (rows.data || []).length === 0 ? <EmptyState icon="tag" title="No PCFs yet" subtitle="Add a product to compute its lifecycle carbon footprint." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">SKU</th><th>Product</th><th>Unit</th><th>Year</th><th>tCO₂e/unit</th><th>Lifecycle tCO₂e</th><th>DQ</th></tr></thead>
            <tbody>
              {(rows.data || []).map((r: any) => (
                <tr key={r.id} className="border-t border-[#eef2f7]">
                  <td className="py-2 font-mono text-[12px]">{r.product_code}</td><td>{r.product_name}</td><td>{r.functional_unit}</td><td>{r.reporting_year}</td>
                  <td>{(r.total_tco2e_per_unit || 0).toFixed(4)}</td>
                  <td>{r.total_lifecycle_tco2e ? fmtN(r.total_lifecycle_tco2e, 2) : '—'}</td>
                  <td>{r.data_quality_score ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>
      {open && <PCFModal onClose={() => { setOpen(false); rows.refresh(); }} />}
    </div>
  );
}

function PCFModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState<any>({ reporting_year: new Date().getFullYear(), methodology: 'ISO 14067', functional_unit: '1 unit' });
  const save = async () => {
    try { await api.post('/watershed/pcf', f); onClose(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <Modal title="Add product footprint" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Product code (SKU)" value={f.product_code || ''} onChange={e => setF({ ...f, product_code: e.target.value })} />
        <Field label="Product name" value={f.product_name || ''} onChange={e => setF({ ...f, product_name: e.target.value })} />
        <Field label="Functional unit" value={f.functional_unit} onChange={e => setF({ ...f, functional_unit: e.target.value })} />
        <Field label="Reporting year" type="number" value={f.reporting_year} onChange={e => setF({ ...f, reporting_year: Number(e.target.value) })} />
        <label className="block"><div className="text-[12px] font-medium mb-1">Methodology</div><select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.methodology} onChange={e => setF({ ...f, methodology: e.target.value })}><option>ISO 14067</option><option>PEFCR</option><option>PAS 2050</option><option>custom</option></select></label>
        <Field label="Upstream tCO₂e/unit" type="number" value={f.upstream_tco2e_per_unit || ''} onChange={e => setF({ ...f, upstream_tco2e_per_unit: Number(e.target.value) })} />
        <Field label="Manufacturing tCO₂e/unit" type="number" value={f.manufacturing_tco2e_per_unit || ''} onChange={e => setF({ ...f, manufacturing_tco2e_per_unit: Number(e.target.value) })} />
        <Field label="Distribution tCO₂e/unit" type="number" value={f.distribution_tco2e_per_unit || ''} onChange={e => setF({ ...f, distribution_tco2e_per_unit: Number(e.target.value) })} />
        <Field label="Use phase tCO₂e/unit" type="number" value={f.use_phase_tco2e_per_unit || ''} onChange={e => setF({ ...f, use_phase_tco2e_per_unit: Number(e.target.value) })} />
        <Field label="End-of-life tCO₂e/unit" type="number" value={f.end_of_life_tco2e_per_unit || ''} onChange={e => setF({ ...f, end_of_life_tco2e_per_unit: Number(e.target.value) })} />
        <Field label="Units sold" type="number" value={f.units_sold || ''} onChange={e => setF({ ...f, units_sold: Number(e.target.value) })} />
        <Field label="Data quality (0–100)" type="number" value={f.data_quality_score || ''} onChange={e => setF({ ...f, data_quality_score: Number(e.target.value) })} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button><button type="button" onClick={save} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">Save PCF</button></div>
    </Modal>
  );
}

// ─── 13. Assurance ──────────────────────────────────────────────────────
function AssuranceTab() {
  const eng = useWatershed<any[]>(`/assurance/engagements`, []);
  const [open, setOpen] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex justify-between"><p className="text-sm text-[#6b7685]">Auditor engagements with finding tracking and evidence-pack assembly (ISAE 3000/3410, AA1000AS, ISO 14064-3).</p><button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">+ Open engagement</button></div>
      <StitchCard title="Engagements">
        {eng.loading ? <Skeleton /> : (eng.data || []).length === 0 ? <EmptyState icon="shield" title="No engagements" subtitle="Open your first assurance engagement to start the audit trail." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Year</th><th>Scope</th><th>Auditor</th><th>Standard</th><th>Level</th><th>Status</th><th>Opinion</th><th></th></tr></thead>
            <tbody>
              {(eng.data || []).map((e: any) => (
                <tr key={e.id} className="border-t border-[#eef2f7]">
                  <td className="py-2">{e.reporting_year}</td><td>{e.scope}</td><td>{e.auditor_name || '—'}</td><td>{e.assurance_standard}</td>
                  <td><StitchPill label={e.assurance_level} tone={e.assurance_level === 'reasonable' ? 'good' : 'info'} /></td>
                  <td>{e.engagement_status}</td>
                  <td>{e.opinion || '—'}</td>
                  <td><button type="button" onClick={() => setFindingsOpen(e.id)} className="text-[oklch(0.46_0.16_55)] text-[12px] hover:underline">Findings</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>
      {open && <EngagementModal onClose={() => { setOpen(false); eng.refresh(); }} />}
      {findingsOpen && <FindingsModal engagementId={findingsOpen} onClose={() => setFindingsOpen(null)} />}
    </div>
  );
}

function EngagementModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState<any>({ reporting_year: new Date().getFullYear(), assurance_standard: 'ISAE_3000', assurance_level: 'limited', scope: 'scope1' });
  const save = async () => {
    try { await api.post('/watershed/assurance/engagements', f); onClose(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <Modal title="Open assurance engagement" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Reporting year" type="number" value={f.reporting_year} onChange={e => setF({ ...f, reporting_year: Number(e.target.value) })} />
        <label className="block"><div className="text-[12px] font-medium mb-1">Scope</div><select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })}><option value="scope1">Scope 1</option><option value="scope2_location">Scope 2 location-based</option><option value="scope2_market">Scope 2 market-based</option><option value="scope3_all">Scope 3 (all)</option><option value="scope3_cat1">Scope 3 cat. 1</option><option value="financed_emissions">Financed emissions</option></select></label>
        <Field label="Auditor name" value={f.auditor_name || ''} onChange={e => setF({ ...f, auditor_name: e.target.value })} />
        <Field label="Auditor email" value={f.auditor_email || ''} onChange={e => setF({ ...f, auditor_email: e.target.value })} />
        <label className="block"><div className="text-[12px] font-medium mb-1">Standard</div><select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.assurance_standard} onChange={e => setF({ ...f, assurance_standard: e.target.value })}><option>ISAE_3000</option><option>ISAE_3410</option><option>AA1000AS</option><option>ISO_14064_3</option><option>custom</option></select></label>
        <label className="block"><div className="text-[12px] font-medium mb-1">Level</div><select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.assurance_level} onChange={e => setF({ ...f, assurance_level: e.target.value })}><option value="limited">Limited</option><option value="reasonable">Reasonable</option></select></label>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button><button type="button" onClick={save} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">Open engagement</button></div>
    </Modal>
  );
}

function FindingsModal({ engagementId, onClose }: { engagementId: string; onClose: () => void }) {
  useEscapeKey(onClose);
  const [findings, setFindings] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<any>({ severity: 'observation', category: 'data_quality' });
  const refresh = useCallback(async () => {
    const r = await api.get(`/watershed/assurance/engagements/${engagementId}/findings`);
    setFindings((r?.data || r) ?? []);
  }, [engagementId]);
  useEffect(() => { refresh(); }, [refresh]);
  const add = async () => {
    try { await api.post(`/watershed/assurance/engagements/${engagementId}/findings`, f); setAdding(false); refresh(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <Modal title="Audit findings" onClose={onClose}>
      <div className="space-y-2 mb-3">
        {findings.length === 0 && <div className="text-sm text-[#6b7685]">No findings yet.</div>}
        {findings.map((x: any) => (
          <div key={x.id} className="border border-[#eef2f7] rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium text-sm">{x.title}</div>
              <StitchPill label={x.severity} tone={x.severity === 'critical' || x.severity === 'material' ? 'critical' : x.severity === 'significant' ? 'warn' : 'info'} />
            </div>
            <div className="text-[12px] text-[#6b7685]">{x.category} · {x.status}</div>
            {x.description && <div className="text-[13px] mt-1">{x.description}</div>}
          </div>
        ))}
      </div>
      {adding ? (
        <div className="border-t pt-3 space-y-2">
          <Field label="Title" value={f.title || ''} onChange={e => setF({ ...f, title: e.target.value })} />
          <Field label="Description" value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <label><div className="text-[12px] mb-1">Severity</div><select className="w-full border rounded px-2 py-1 text-sm" value={f.severity} onChange={e => setF({ ...f, severity: e.target.value })}><option>observation</option><option>minor</option><option>significant</option><option>material</option><option>critical</option></select></label>
            <label><div className="text-[12px] mb-1">Category</div><select className="w-full border rounded px-2 py-1 text-sm" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}><option>data_quality</option><option>methodology</option><option>boundary</option><option>factor_age</option><option>restatement</option></select></label>
          </div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setAdding(false)} className="px-2 py-1 text-sm border rounded">Cancel</button><button type="button" onClick={add} className="px-2 py-1 text-sm bg-[#c2873a] text-white rounded">Add</button></div>
        </div>
      ) : (
        <div className="flex justify-end"><button type="button" onClick={() => setAdding(true)} className="text-sm text-[oklch(0.46_0.16_55)] hover:underline">+ Add finding</button></div>
      )}
    </Modal>
  );
}

// ─── 14. Maturity ───────────────────────────────────────────────────────
function MaturityTab() {
  const assessments = useWatershed<any[]>(`/maturity`, []);
  const benchmarks = useWatershed<any[]>(`/benchmarks`, []);
  const [busy, setBusy] = useState(false);
  const score = async () => {
    setBusy(true);
    try { await api.post('/watershed/maturity/score', { reporting_year: new Date().getFullYear() }); assessments.refresh(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };
  const latest = (assessments.data || [])[0];
  const pillarData = latest ? [
    { pillar: 'Measurement', score: latest.measurement_score },
    { pillar: 'Governance',  score: latest.governance_score },
    { pillar: 'Targets',     score: latest.target_score },
    { pillar: 'Action',      score: latest.action_score },
    { pillar: 'Disclosure',  score: latest.disclosure_score },
  ] : [];

  return (
    <div className="space-y-5">
      <div className="flex justify-between"><p className="text-sm text-[#6b7685]">Climate maturity assessment — five pillars graded against your platform activity, not self-reported.</p><button type="button" onClick={score} disabled={busy} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg disabled:opacity-50">{busy ? 'Scoring…' : 'Compute current score'}</button></div>

      {latest && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StitchCard title={`${latest.reporting_year} — ${latest.band.toUpperCase()}`}>
            <div className="flex items-center justify-center my-2">
              <div className="text-center">
                <div className="text-[44px] font-display font-bold text-[#0f1c2e]">{(latest.overall_score || 0).toFixed(0)}</div>
                <div className="text-[12px] text-[#6b7685] uppercase tracking-wide">Overall climate maturity</div>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center text-[12px]">
              <div><div className="font-semibold">{(latest.measurement_score || 0).toFixed(0)}</div><div className="text-[#6b7685]">Measure</div></div>
              <div><div className="font-semibold">{(latest.governance_score || 0).toFixed(0)}</div><div className="text-[#6b7685]">Govern</div></div>
              <div><div className="font-semibold">{(latest.target_score || 0).toFixed(0)}</div><div className="text-[#6b7685]">Target</div></div>
              <div><div className="font-semibold">{(latest.action_score || 0).toFixed(0)}</div><div className="text-[#6b7685]">Act</div></div>
              <div><div className="font-semibold">{(latest.disclosure_score || 0).toFixed(0)}</div><div className="text-[#6b7685]">Disclose</div></div>
            </div>
          </StitchCard>
          <StitchCard title="Pillar radar">
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={pillarData}>
                <PolarGrid /><PolarAngleAxis dataKey="pillar" />
                <Radar name="Score" dataKey="score" stroke="#0f1c2e" fill="#0f1c2e" fillOpacity={0.3} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </StitchCard>
        </div>
      )}

      <StitchCard title="Industry benchmarks">
        {benchmarks.loading ? <Skeleton /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Sector</th><th>Region</th><th>Year</th><th>Metric</th><th>P25</th><th>P50</th><th>P75</th><th>Unit</th></tr></thead>
            <tbody>
              {(benchmarks.data || []).map((b: any) => (
                <tr key={b.id} className="border-t border-[#eef2f7]">
                  <td className="py-2">{b.sector_name}</td><td>{b.region}</td><td>{b.reporting_year}</td><td className="text-[12px]">{b.metric}</td>
                  <td>{b.p25}</td><td className="font-semibold">{b.p50}</td><td>{b.p75}</td><td className="text-[12px]">{b.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>
    </div>
  );
}

// ─── 15. Jurisdictions ──────────────────────────────────────────────────
function JurisdictionsTab() {
  const jurs = useWatershed<any[]>(`/jurisdictions`, []);
  const subs = useWatershed<any[]>(`/jurisdictions/submissions`, []);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex justify-between">
        <p className="text-sm text-[#6b7685]">File one fiscal-year dataset to many regulators — CSRD, SEC, CA SB-253, UK SECR, SGX, Japan TCFD, JSE-SRL.</p>
        <button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">+ New submission</button>
      </div>

      <StitchCard title="My submissions">
        {subs.loading ? <Skeleton /> : (subs.data || []).length === 0 ? <EmptyState icon="globe" title="No submissions filed yet" subtitle="Create a submission against any registered jurisdiction." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Jurisdiction</th><th>Region</th><th>Year</th><th>Status</th><th>Submitted</th><th>Reference</th></tr></thead>
            <tbody>
              {(subs.data || []).map((s: any) => (
                <tr key={s.id} className="border-t border-[#eef2f7]">
                  <td className="py-2"><div className="font-medium">{s.jurisdiction_name}</div><div className="text-[12px] text-[#6b7685]">{s.jurisdiction}</div></td>
                  <td>{s.region}</td><td>{s.reporting_year}</td>
                  <td><StitchPill status={s.status} /></td>
                  <td className="text-[12px]">{s.submitted_at?.slice(0, 10) || '—'}</td>
                  <td className="font-mono text-[12px]">{s.external_reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>

      <StitchCard title="Available jurisdictions">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {(jurs.data || []).map((j: any) => (
            <div key={j.code} className="border border-[#eef2f7] rounded-lg p-3">
              <div className="flex items-start justify-between mb-1">
                <div className="font-display font-semibold text-[13px]">{j.name}</div>
                {j.mandatory ? <StitchPill label="Mandatory" tone="critical" /> : <StitchPill label="Voluntary" tone="info" />}
              </div>
              <div className="text-[12px] text-[#6b7685] mb-1">{j.region} · {j.effective_year}</div>
              <div className="text-[12px] text-[#0f1c2e]">{j.description}</div>
            </div>
          ))}
        </div>
      </StitchCard>

      {open && <SubmissionModal onClose={() => { setOpen(false); subs.refresh(); }} jurisdictions={jurs.data || []} />}
    </div>
  );
}

function SubmissionModal({ jurisdictions, onClose }: { jurisdictions: any[]; onClose: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState<any>({ reporting_year: new Date().getFullYear(), jurisdiction: jurisdictions[0]?.code || 'CDP' });
  const save = async () => {
    try { await api.post('/watershed/jurisdictions/submissions', f); onClose(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <Modal title="New disclosure submission" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block"><div className="text-[12px] mb-1">Jurisdiction</div><select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.jurisdiction} onChange={e => setF({ ...f, jurisdiction: e.target.value })}>{jurisdictions.map((j: any) => <option key={j.code} value={j.code}>{j.name}</option>)}</select></label>
        <Field label="Reporting year" type="number" value={f.reporting_year} onChange={e => setF({ ...f, reporting_year: Number(e.target.value) })} />
        <Field label="Notes" value={f.notes || ''} onChange={e => setF({ ...f, notes: e.target.value })} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button><button type="button" onClick={save} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">Create</button></div>
    </Modal>
  );
}

// ─── 16. Anomalies ──────────────────────────────────────────────────────
function AnomaliesTab() {
  const rows = useWatershed<any[]>(`/anomalies?status=open`, []);
  const [busy, setBusy] = useState(false);
  const scan = async () => {
    setBusy(true);
    try { await api.post('/watershed/anomalies/scan', {}); rows.refresh(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };
  const update = async (id: string, status: string) => {
    try { await api.patch(`/watershed/anomalies/${id}`, { status }); rows.refresh(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <div className="space-y-5">
      <div className="flex justify-between"><p className="text-sm text-[#6b7685]">Heuristic anomaly detection — spikes, duplicates, impossible values, factor mismatches.</p><button type="button" onClick={scan} disabled={busy} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg disabled:opacity-50">{busy ? 'Scanning…' : 'Run scan'}</button></div>
      <StitchCard title="Open anomalies">
        {rows.loading ? <Skeleton /> : (rows.data || []).length === 0 ? <EmptyState icon="check-circle" title="No open anomalies" subtitle="All your ESG transactions pass the anomaly heuristics." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Rule</th><th>Severity</th><th>Detail</th><th>Expected</th><th>Observed</th><th>Detected</th><th></th></tr></thead>
            <tbody>
              {(rows.data || []).map((r: any) => (
                <tr key={r.id} className="border-t border-[#eef2f7]">
                  <td className="py-2 font-mono text-[12px]">{r.rule}</td>
                  <td><StitchPill label={r.severity} tone={r.severity === 'critical' ? 'critical' : r.severity === 'high' ? 'warn' : 'info'} /></td>
                  <td className="text-[12px]">{r.detail}</td>
                  <td>{r.expected_value ? fmtN(r.expected_value, 2) : '—'}</td>
                  <td>{r.observed_value ? fmtN(r.observed_value, 2) : '—'}</td>
                  <td className="text-[12px]">{r.detected_at?.slice(0, 16) || '—'}</td>
                  <td className="space-x-2">
                    <button type="button" onClick={() => update(r.id, 'resolved')} className="text-green-700 text-[12px] hover:underline">Resolve</button>
                    <button type="button" onClick={() => update(r.id, 'dismissed')} className="text-[#6b7685] text-[12px] hover:underline">Dismiss</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Watershed advanced tabs (migration 042)
// ════════════════════════════════════════════════════════════════════════

// ─── 17. Scenarios ──────────────────────────────────────────────────────
function ScenariosTab() {
  const scenarios = useWatershed<any[]>(`/scenarios`, []);
  const runs = useWatershed<any[]>(`/scenarios/runs`, []);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  return (
    <div className="space-y-5">
      <div className="flex justify-between"><p className="text-sm text-[#6b7685]">NGFS / IEA / IPCC scenario analysis. Runs your portfolio through orderly / disorderly / hot-house pathways to compute emissions-at-risk and financial VaR.</p><button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">Run scenario</button></div>

      <StitchCard title="Reference scenarios">
        {scenarios.loading ? <Skeleton /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {(scenarios.data || []).map((s: any) => (
              <div key={s.code} className="border border-[#eef2f7] rounded-lg p-3">
                <div className="flex justify-between mb-1">
                  <div className="font-display font-semibold text-[13px]">{s.name}</div>
                  <StitchPill label={`${s.temperature_2100_c}°C`} tone={s.temperature_2100_c <= 1.5 ? 'good' : s.temperature_2100_c <= 2 ? 'info' : 'warn'} />
                </div>
                <div className="text-[12px] text-[#6b7685] mb-1">{s.family} · {s.category}</div>
                <div className="text-[12px] flex gap-3">
                  <span>Transition: {s.transition_risk}</span><span>Physical: {s.physical_risk}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </StitchCard>

      <StitchCard title="My scenario runs">
        {(runs.data || []).length === 0 ? <EmptyState icon="workflow" title="No scenario runs yet" subtitle="Run a scenario against your financed-emissions portfolio." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Scenario</th><th>Horizon</th><th>Base tCO₂e</th><th>Target tCO₂e</th><th>At risk</th><th>Financial VaR</th><th>Worst sector</th><th></th></tr></thead>
            <tbody>
              {(runs.data || []).map((r: any) => (
                <tr key={r.id} className="border-t border-[#eef2f7]">
                  <td className="py-2"><div className="font-medium">{r.scenario_name}</div><div className="text-[12px] text-[#6b7685]">{r.family}</div></td>
                  <td>{r.horizon_years}y</td>
                  <td>{fmtN(r.portfolio_emissions_base_tco2e, 1)}</td>
                  <td>{fmtN(r.portfolio_emissions_target_tco2e, 1)}</td>
                  <td className="text-amber-700">{fmtN(r.emissions_at_risk_tco2e, 1)}</td>
                  <td className="text-red-700">{fmtZ(r.financial_value_at_risk_zar, 0)}</td>
                  <td>{r.worst_sector_nace || '—'}</td>
                  <td><button type="button" onClick={() => setDetail(r)} className="text-[oklch(0.46_0.16_55)] text-[12px] hover:underline">Details</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>

      {open && <RunScenarioModal scenarios={scenarios.data || []} onClose={() => { setOpen(false); runs.refresh(); }} />}
      {detail && <ScenarioDetailModal run={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function RunScenarioModal({ scenarios, onClose }: { scenarios: any[]; onClose: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState<any>({ scenario_code: scenarios[0]?.code || 'NGFS_NET_ZERO', horizon_years: 10 });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await api.post('/watershed/scenarios/run', f); onClose(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Run climate scenario" onClose={onClose}>
      <div className="space-y-3">
        <label className="block"><div className="text-[12px] mb-1">Scenario</div>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.scenario_code} onChange={e => setF({ ...f, scenario_code: e.target.value })}>
            {scenarios.map((s: any) => <option key={s.code} value={s.code}>{s.name} ({s.temperature_2100_c}°C)</option>)}
          </select>
        </label>
        <Field label="Horizon (years)" type="number" value={f.horizon_years} onChange={e => setF({ ...f, horizon_years: Number(e.target.value) })} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button><button type="button" onClick={go} disabled={busy} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg disabled:opacity-50">{busy ? 'Running…' : 'Run'}</button></div>
    </Modal>
  );
}

function ScenarioDetailModal({ run, onClose }: { run: any; onClose: () => void }) {
  useEscapeKey(onClose);
  let impacts: any[] = [];
  try { impacts = JSON.parse(run.sector_impacts_json || '[]'); } catch { /* ignore */ }
  return (
    <Modal title={`${run.scenario_name} — ${run.horizon_years}y horizon`} onClose={onClose} wide>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <StitchKpi label="Base tCO₂e" value={fmtN(run.portfolio_emissions_base_tco2e, 1)} />
        <StitchKpi label="Target tCO₂e" value={fmtN(run.portfolio_emissions_target_tco2e, 1)} tone="up" />
        <StitchKpi label="At risk" value={fmtN(run.emissions_at_risk_tco2e, 1)} tone="warn" />
        <StitchKpi label="Financial VaR" value={fmtZ(run.financial_value_at_risk_zar, 0)} tone="down" />
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Sector</th><th>Exposure</th><th>Base tCO₂e</th><th>Target tCO₂e</th><th>At risk</th><th>Financial VaR</th></tr></thead>
        <tbody>
          {impacts.map((s: any, i: number) => (
            <tr key={i} className="border-t border-[#eef2f7]">
              <td className="py-2 font-mono text-[12px]">{s.sector}</td>
              <td>{fmtZ(s.exposure_zar, 0)}</td>
              <td>{fmtN(s.base_emissions_tco2e, 1)}</td>
              <td>{fmtN(s.target_emissions_tco2e, 1)}</td>
              <td className="text-amber-700">{fmtN(s.emissions_at_risk_tco2e, 1)}</td>
              <td className="text-red-700">{fmtZ(s.financial_var_zar, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

// ─── 18. Counterparties ─────────────────────────────────────────────────
function CounterpartiesTab() {
  const requests = useWatershed<any[]>(`/counterparties/requests`, []);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex justify-between"><p className="text-sm text-[#6b7685]">Send share-links to counterparties so they can submit their emissions (PCAF data-quality 1-2).</p><button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">+ Request data</button></div>
      <StitchCard title="Open requests">
        {requests.loading ? <Skeleton /> : (requests.data || []).length === 0 ? <EmptyState icon="people" title="No counterparty requests" subtitle="Send your first data request to a financed counterparty." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Counterparty</th><th>Email</th><th>Year</th><th>Scope</th><th>Status</th><th>Sent</th><th>Share link</th></tr></thead>
            <tbody>
              {(requests.data || []).map((r: any) => (
                <tr key={r.id} className="border-t border-[#eef2f7]">
                  <td className="py-2 font-medium">{r.counterparty_name}</td>
                  <td className="text-[12px]">{r.counterparty_email || '—'}</td>
                  <td>{r.reporting_year}</td>
                  <td className="text-[12px]">{r.scope_requested}</td>
                  <td><StitchPill status={r.status} /></td>
                  <td className="text-[12px]">{r.sent_at?.slice(0, 10) || '—'}</td>
                  <td><button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/portal/counterparty/${r.share_token}`); alert('Share link copied'); }} className="text-[oklch(0.46_0.16_55)] text-[12px] hover:underline">Copy link</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>
      {open && <RequestDataModal onClose={() => { setOpen(false); requests.refresh(); }} />}
    </div>
  );
}

function RequestDataModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState<any>({ reporting_year: new Date().getFullYear(), scope_requested: 'all_scopes' });
  const save = async () => {
    try {
      const r = await api.post('/watershed/counterparties/requests', f);
      const data = r?.data || r;
      alert(`Share link created:\n${window.location.origin}${data.share_url}`);
      onClose();
    } catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <Modal title="Request counterparty data" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Counterparty name" value={f.counterparty_name || ''} onChange={e => setF({ ...f, counterparty_name: e.target.value })} />
        <Field label="Email" value={f.counterparty_email || ''} onChange={e => setF({ ...f, counterparty_email: e.target.value })} />
        <Field label="Reporting year" type="number" value={f.reporting_year} onChange={e => setF({ ...f, reporting_year: Number(e.target.value) })} />
        <label className="block"><div className="text-[12px] mb-1">Scope requested</div><select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.scope_requested} onChange={e => setF({ ...f, scope_requested: e.target.value })}><option value="scope1_only">Scope 1 only</option><option value="scope1_and_2">Scope 1+2</option><option value="all_scopes">All scopes (1-3)</option><option value="custom">Custom</option></select></label>
        <Field label="Asset class" value={f.asset_class || ''} onChange={e => setF({ ...f, asset_class: e.target.value })} />
        <Field label="Exposure (ZAR)" type="number" value={f.exposure_zar || ''} onChange={e => setF({ ...f, exposure_zar: Number(e.target.value) })} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button><button type="button" onClick={save} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">Generate share link</button></div>
    </Modal>
  );
}

// ─── 19. MACC ──────────────────────────────────────────────────────────
function MACCTab() {
  const rows = useWatershed<any[]>(`/macc`, []);
  return (
    <div className="space-y-5">
      <p className="text-sm text-[#6b7685]">Marginal abatement cost curve — initiatives sorted by ZAR/tCO₂e. Bars to the left of zero are net-negative (saves money while reducing).</p>
      <StitchCard title="MACC chart">
        {rows.loading ? <Skeleton /> : (rows.data || []).length === 0 ? <EmptyState icon="chart-line" title="No initiatives with abatement data" subtitle="Add initiatives with abatement_tco2e_yr and capex to populate the MACC." /> : (
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={(rows.data || []).map((r: any) => ({ name: r.name, cost: r.computed_macc_zar_per_tco2e || 0, abatement: r.abatement_tco2e_yr || 0 }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={70} />
              <YAxis label={{ value: 'ZAR / tCO₂e', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Bar dataKey="cost" name="MACC (ZAR/tCO₂e)">
                {(rows.data || []).map((r: any, i: number) => (
                  <Cell key={i} fill={(r.computed_macc_zar_per_tco2e || 0) < 0 ? '#1a8a5b' : (r.computed_macc_zar_per_tco2e || 0) < 500 ? 'oklch(0.46 0.16 55)' : '#c97a14'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </StitchCard>
      <StitchCard title="Initiatives in order of cost-effectiveness">
        {(rows.data || []).length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Initiative</th><th>Abatement t/yr</th><th>Cumulative t/yr</th><th>Capex</th><th>MACC (ZAR/tCO₂e)</th><th>Status</th></tr></thead>
            <tbody>
              {(rows.data || []).map((r: any) => (
                <tr key={r.id} className="border-t border-[#eef2f7]">
                  <td className="py-2">{r.name}</td>
                  <td>{fmtN(r.abatement_tco2e_yr, 1)}</td>
                  <td>{fmtN(r.cumulative_abatement_tco2e, 1)}</td>
                  <td>{fmtZ(r.capex_zar || 0)}</td>
                  <td className={r.computed_macc_zar_per_tco2e < 0 ? 'text-green-700 font-semibold' : ''}>{r.computed_macc_zar_per_tco2e != null ? fmtZ(r.computed_macc_zar_per_tco2e, 0) : '—'}</td>
                  <td><StitchPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>
    </div>
  );
}

// ─── 20. Pathways ──────────────────────────────────────────────────────
function PathwaysTab() {
  const [pathway, setPathway] = useState('IEA_NZE_2050');
  const [sector, setSector] = useState('power');
  const data = useWatershed<any[]>(`/pathways?pathway=${pathway}`, []);
  const sectorData = (data.data || []).filter((r: any) => r.sector === sector);
  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <label><div className="text-[12px] mb-1">Pathway</div><select className="border rounded-lg px-2 py-1 text-sm" value={pathway} onChange={e => setPathway(e.target.value)}><option value="IEA_NZE_2050">IEA NZE 2050</option><option value="NGFS_NET_ZERO">NGFS Net Zero</option></select></label>
        <label><div className="text-[12px] mb-1">Sector</div><select className="border rounded-lg px-2 py-1 text-sm" value={sector} onChange={e => setSector(e.target.value)}><option value="power">Power</option><option value="steel">Steel</option><option value="cement">Cement</option><option value="aluminum">Aluminum</option><option value="aviation">Aviation</option><option value="shipping">Shipping</option><option value="road_freight">Road freight</option><option value="oil_gas">Oil & gas</option><option value="buildings">Buildings</option></select></label>
      </div>
      <StitchCard title={`${pathway} — ${sector} intensity pathway`}>
        {data.loading ? <Skeleton /> : sectorData.length === 0 ? <EmptyState icon="trending-down" title="No data for this combination" subtitle="Try another sector or pathway." /> : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sectorData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis label={{ value: sectorData[0]?.unit || '', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Bar dataKey="intensity_value" fill="#0f1c2e" name="Intensity" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </StitchCard>
    </div>
  );
}

// ─── 21. AI Classifier ──────────────────────────────────────────────────
function AIClassifierTab() {
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const logs = useWatershed<any[]>(`/ai/classify`, []);
  const classify = async () => {
    if (!desc) return;
    setBusy(true);
    try {
      const r = await api.post('/watershed/ai/classify', { description: desc, amount: amount ? Number(amount) : undefined, unit });
      setResult(r?.data || r);
      logs.refresh();
    } catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };
  const accept = async (id: string, override?: string) => {
    try { await api.patch(`/watershed/ai/classify/${id}`, { accepted: true, override_code: override }); logs.refresh(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <div className="space-y-5">
      <p className="text-sm text-[#6b7685]">AI carbon-accountant — paste any invoice line, expense description, or activity. Returns suggested activity code, scope, and confidence.</p>
      <StitchCard title="Classify">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-3"><Field label="Description" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Sasol natural gas Q1 invoice" /></div>
          <Field label="Amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
          <Field label="Unit" value={unit} onChange={e => setUnit(e.target.value)} placeholder="kWh, litre, ZAR" />
          <div className="flex items-end"><button type="button" onClick={classify} disabled={busy || !desc} className="w-full h-9 px-3 bg-[#c2873a] text-white rounded-lg text-sm disabled:opacity-50">{busy ? 'Classifying…' : 'Classify'}</button></div>
        </div>
        {result && (
          <div className="mt-4 p-3 bg-[#f6f9fc] rounded-lg">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-[11px] text-[#6b7685] uppercase tracking-wide">Suggested activity code</div>
                <div className="font-mono text-[14px] font-semibold">{result.activity_code}</div>
                <div className="text-[12px] text-[#6b7685] mt-1">Scope {result.scope}{result.scope3_category ? ', cat ' + result.scope3_category : ''} · model: {result.model_id}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-[#6b7685]">Confidence</div>
                <div className={`text-[20px] font-bold ${result.confidence >= 0.8 ? 'text-green-700' : result.confidence >= 0.5 ? 'text-amber-700' : 'text-red-700'}`}>{((result.confidence || 0) * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div className="text-[12px] mb-2">{result.reasoning}</div>
            <div className="flex gap-2"><button type="button" onClick={() => accept(result.id)} className="px-2 py-1 text-[12px] bg-green-700 text-white rounded">Accept</button><button type="button" onClick={() => accept(result.id, prompt('Override activity code:') || '')} className="px-2 py-1 text-[12px] border rounded">Override</button></div>
          </div>
        )}
      </StitchCard>
      <StitchCard title="Recent classifications">
        {(logs.data || []).length === 0 ? <div className="text-sm text-[#6b7685]">No classifications yet.</div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Input</th><th>Suggested</th><th>Scope</th><th>Conf</th><th>Model</th><th>Accepted</th></tr></thead>
            <tbody>
              {(logs.data || []).map((l: any) => (
                <tr key={l.id} className="border-t border-[#eef2f7]">
                  <td className="py-2 text-[12px] max-w-xs truncate">{l.input_text}</td>
                  <td className="font-mono text-[12px]">{l.suggested_activity_code}</td>
                  <td>{l.suggested_scope}</td>
                  <td>{l.confidence ? ((l.confidence * 100).toFixed(0) + '%') : '—'}</td>
                  <td className="text-[10px] font-mono text-[#6b7685]">{l.model_id}</td>
                  <td>{l.user_accepted ? <StitchPill label="Accepted" tone="good" /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>
    </div>
  );
}

// ─── 22. REC Hourly Marketplace ─────────────────────────────────────────
function RecMarketTab() {
  const listings = useWatershed<any[]>(`/rec-market/listings`, []);
  const trades = useWatershed<any[]>(`/rec-market/trades`, []);
  const [open, setOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState<any>(null);
  return (
    <div className="space-y-5">
      <div className="flex justify-between"><p className="text-sm text-[#6b7685]">Hourly REC marketplace — time-matched energy attribute certificates for 24/7 CFE.</p><button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">+ List RECs</button></div>
      <StitchCard title="Active listings">
        {listings.loading ? <Skeleton /> : (listings.data || []).length === 0 ? <EmptyState icon="store" title="No listings" subtitle="Be the first to list hourly RECs." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Hour</th><th>Zone</th><th>Tech</th><th>Available kWh</th><th>Remaining</th><th>Price ZAR/kWh</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(listings.data || []).map((l: any) => (
                <tr key={l.id} className="border-t border-[#eef2f7]">
                  <td className="py-2 text-[12px] font-mono">{l.hour_utc?.slice(0, 13)}h</td>
                  <td>{l.grid_zone}</td>
                  <td>{l.technology}</td>
                  <td>{fmtN(l.available_kwh)}</td>
                  <td>{fmtN(l.remaining_kwh)}</td>
                  <td>{l.price_zar_per_kwh?.toFixed(2)}</td>
                  <td><StitchPill status={l.status} /></td>
                  <td><button type="button" onClick={() => setBuyOpen(l)} disabled={l.status === 'sold_out'} className="text-[oklch(0.46_0.16_55)] text-[12px] hover:underline disabled:opacity-40">Buy</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>
      <StitchCard title="My trades">
        {(trades.data || []).length === 0 ? <div className="text-sm text-[#6b7685]">No trades yet.</div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Hour</th><th>Zone</th><th>Tech</th><th>kWh</th><th>Total</th><th>Retired</th></tr></thead>
            <tbody>
              {(trades.data || []).map((t: any) => (
                <tr key={t.id} className="border-t border-[#eef2f7]">
                  <td className="py-2 text-[12px] font-mono">{t.hour_utc?.slice(0, 13)}h</td>
                  <td>{t.grid_zone}</td><td>{t.technology}</td>
                  <td>{fmtN(t.kwh)}</td>
                  <td>{fmtZ(t.total_zar)}</td>
                  <td>{t.retired_at ? <StitchPill label="Retired" tone="good" /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>
      {open && <ListRecModal onClose={() => { setOpen(false); listings.refresh(); }} />}
      {buyOpen && <BuyRecModal listing={buyOpen} onClose={() => { setBuyOpen(null); listings.refresh(); trades.refresh(); }} />}
    </div>
  );
}

function ListRecModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const [f, setF] = useState<any>({ technology: 'solar', grid_zone: 'ZA-NPC', hour_utc: '', available_kwh: 100, price_zar_per_kwh: 0.85 });
  const save = async () => {
    try { await api.post('/watershed/rec-market/listings', f); onClose(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <Modal title="List hourly RECs" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block"><div className="text-[12px] mb-1">Technology</div><select className="w-full border rounded-lg px-3 py-2 text-sm" value={f.technology} onChange={e => setF({ ...f, technology: e.target.value })}><option>solar</option><option>wind</option><option>hydro</option><option>nuclear</option><option>geothermal</option><option>battery</option></select></label>
        <Field label="Grid zone" value={f.grid_zone} onChange={e => setF({ ...f, grid_zone: e.target.value })} />
        <Field label="Hour (UTC ISO)" value={f.hour_utc} onChange={e => setF({ ...f, hour_utc: e.target.value })} placeholder="2026-05-01T10:00:00Z" />
        <Field label="Available kWh" type="number" value={f.available_kwh} onChange={e => setF({ ...f, available_kwh: Number(e.target.value) })} />
        <Field label="Price ZAR/kWh" type="number" value={f.price_zar_per_kwh} onChange={e => setF({ ...f, price_zar_per_kwh: Number(e.target.value) })} />
        <Field label="Certificate ref" value={f.certificate_ref || ''} onChange={e => setF({ ...f, certificate_ref: e.target.value })} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button><button type="button" onClick={save} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">List</button></div>
    </Modal>
  );
}

function BuyRecModal({ listing, onClose }: { listing: any; onClose: () => void }) {
  useEscapeKey(onClose);
  const [kwh, setKwh] = useState(Math.min(100, listing.remaining_kwh));
  const [retire, setRetire] = useState(true);
  const total = kwh * listing.price_zar_per_kwh;
  const save = async () => {
    try { await api.post('/watershed/rec-market/buy', { listing_id: listing.id, kwh, retire, retirement_purpose: '24/7 CFE matching' }); onClose(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
  };
  return (
    <Modal title={`Buy ${listing.technology} RECs · ${listing.hour_utc?.slice(0, 13)}h`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="kWh to buy" type="number" value={kwh} onChange={e => setKwh(Number(e.target.value))} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={retire} onChange={e => setRetire(e.target.checked)} /> Retire immediately for 24/7 CFE matching</label>
        <div className="text-sm text-[#0f1c2e]">Total: <strong>{fmtZ(total, 2)}</strong> ({fmtN(kwh)} kWh @ {listing.price_zar_per_kwh.toFixed(2)}/kWh)</div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button><button type="button" onClick={save} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg">Buy</button></div>
    </Modal>
  );
}

// ─── 23. Audit Chain ────────────────────────────────────────────────────
function AuditChainTab() {
  const chain = useWatershed<any[]>(`/audit-chain?limit=100`, []);
  const [verify, setVerify] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const doVerify = async () => {
    setBusy(true);
    try { const r = await api.get('/watershed/audit-chain/verify'); setVerify(r?.data || r); }
    catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-5">
      <div className="flex justify-between">
        <p className="text-sm text-[#6b7685]">Hash-chained immutable audit log. Each entry stores SHA-256(prev_hash · payload), enabling external auditors to detect tampering.</p>
        <button type="button" onClick={doVerify} disabled={busy} className="px-3 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg disabled:opacity-50">{busy ? 'Verifying…' : 'Verify chain'}</button>
      </div>
      {verify && (
        <div className={`p-3 rounded-lg ${verify.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {verify.valid
            ? <div className="text-green-800 text-sm">✓ Chain valid — {verify.chain_length} records, all hashes intact.</div>
            : <div className="text-red-800 text-sm">✗ Chain broken at sequence {verify.broken_at_sequence} (entity: {verify.entity}). Possible tampering.</div>}
        </div>
      )}
      <StitchCard title="Audit chain entries">
        {chain.loading ? <Skeleton /> : (chain.data || []).length === 0 ? <EmptyState icon="layers" title="No chain entries yet" subtitle="Audit-chain entries are created as records are appended via /audit-chain/append." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#6b7685]"><th className="py-2">Seq</th><th>Table</th><th>Entity ID</th><th>Op</th><th>Hash</th><th>Time</th></tr></thead>
            <tbody>
              {(chain.data || []).map((r: any) => (
                <tr key={r.id} className="border-t border-[#eef2f7]">
                  <td className="py-2 font-mono">{r.sequence_no}</td>
                  <td className="font-mono text-[12px]">{r.entity_table}</td>
                  <td className="font-mono text-[12px]">{r.entity_id}</td>
                  <td>{r.operation}</td>
                  <td className="font-mono text-[10px] text-[#6b7685]">{r.this_hash?.slice(0, 12)}…</td>
                  <td className="text-[12px]">{r.created_at?.slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StitchCard>
    </div>
  );
}

export default ESG;
