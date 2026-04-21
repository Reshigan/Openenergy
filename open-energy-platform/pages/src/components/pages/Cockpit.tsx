import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend,
} from 'recharts';
import {
  Briefcase, FileText, TrendingUp, Zap, Leaf, ShoppingCart, Store,
  Building2, BarChart3, Sparkles, ArrowRight, CircleDollarSign, Activity,
  ShieldCheck, GitBranch, Gauge, Wind, Sun, Flame, Coins, Scale,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { FioriTile, FioriTileGroup } from '../FioriTile';

const formatZAR = (val: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(val);

const formatCompact = (val: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(val);

// Sample chart data
const marketData = [
  { month: 'Jan', solar: 1620, wind: 1510, hybrid: 1580, thermal: 1820 },
  { month: 'Feb', solar: 1720, wind: 1580, hybrid: 1640, thermal: 1850 },
  { month: 'Mar', solar: 1590, wind: 1490, hybrid: 1530, thermal: 1780 },
  { month: 'Apr', solar: 1880, wind: 1740, hybrid: 1820, thermal: 1940 },
  { month: 'May', solar: 1950, wind: 1810, hybrid: 1900, thermal: 2010 },
  { month: 'Jun', solar: 1820, wind: 1720, hybrid: 1760, thermal: 1940 },
  { month: 'Jul', solar: 1920, wind: 1830, hybrid: 1870, thermal: 2050 },
  { month: 'Aug', solar: 2080, wind: 1940, hybrid: 2000, thermal: 2120 },
];

const portfolioData = [
  { name: 'Solar',   value: 42, color: '#0a6ed1' },
  { name: 'Wind',    value: 28, color: '#5d36ff' },
  { name: 'Hybrid',  value: 18, color: '#0d7b84' },
  { name: 'Storage', value: 8,  color: '#e9730c' },
  { name: 'Carbon',  value: 4,  color: '#ab218e' },
];

const volumeData = [
  { hour: '00', mw: 420 }, { hour: '02', mw: 380 }, { hour: '04', mw: 360 },
  { hour: '06', mw: 520 }, { hour: '08', mw: 780 }, { hour: '10', mw: 920 },
  { hour: '12', mw: 1040 }, { hour: '14', mw: 1150 }, { hour: '16', mw: 1120 },
  { hour: '18', mw: 980 }, { hour: '20', mw: 780 }, { hour: '22', mw: 560 },
];

// Greeting by time
const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export function Cockpit() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [statsRes] = await Promise.all([
          api
            .get('/cockpit/stats')
            .catch(() => ({ data: { success: true, data: defaultStats() } })),
        ]);
        if (!alive) return;
        setStats(statsRes.data?.data || defaultStats());
      } catch (e: any) {
        if (alive) setError(e.message || 'Failed to load dashboard');
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, []);

  const role = user?.role ?? 'admin';
  const today = useMemo(
    () =>
      new Date().toLocaleDateString('en-ZA', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [],
  );

  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton variant="card" rows={2} />
        <Skeleton variant="card" rows={4} />
      </div>
    );
  if (error) return <ErrorBanner message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="fiori-hero">
        <div className="flex flex-col lg:flex-row lg:items-end gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[12px] tracking-widest uppercase text-white/70 font-semibold">
              <Sparkles size={12} />
              <span>Open Energy Exchange · {today}</span>
            </div>
            <h1 className="mt-2 text-[28px] sm:text-[32px] font-bold tracking-tight">
              {greeting()}, {user?.name?.split(' ')[0] ?? 'there'}
            </h1>
            <p className="mt-1 text-white/75 text-[14px] max-w-2xl">
              {heroSubtitleFor(role)}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={() => navigate(primaryActionFor(role).path)}
                className="h-9 px-4 rounded-lg text-[13px] font-semibold text-[#0a2540] bg-white hover:bg-white/90 transition-colors inline-flex items-center gap-2 shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
              >
                {primaryActionFor(role).label}
                <ArrowRight size={14} />
              </button>
              <button
                onClick={() => navigate('/marketplace')}
                className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white border border-white/30 hover:bg-white/10 transition-colors inline-flex items-center gap-2"
              >
                Explore Marketplace
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3 min-w-0 lg:min-w-[560px]">
            <HeroKPI label="Active Projects" value={stats?.activeProjects ?? 12} tint="#9cecb4" />
            <HeroKPI label="Open Trades" value={stats?.openTrades ?? 38} tint="#ffd27a" />
            <HeroKPI label="Pending Invoices" value={stats?.pendingInvoices ?? 6} tint="#ffb4b4" />
            <HeroKPI
              label="Portfolio Value"
              value={formatCompact(stats?.totalValue ?? 2_450_000)}
              suffix="ZAR"
              tint="#c6b8ff"
            />
          </div>
        </div>
      </div>

      {/* Market Pulse */}
      <FioriTileGroup
        title="Market Pulse"
        description="Live snapshot of today's Open Energy market"
      >
        <FioriTile
          title="Market Price"
          subtitle="Avg. cleared price"
          value={`R${(stats?.avgPrice ?? 1920).toLocaleString()}`}
          unit="/MWh"
          trend="up"
          trendValue="+4.2%"
          footer="vs. last week"
          accent="blue"
          icon={TrendingUp}
          onClick={() => navigate('/trading')}
        />
        <FioriTile
          title="Volume Traded"
          subtitle="Last 24h"
          value={`${formatCompact(stats?.volume24h ?? 18_400)}`}
          unit="MWh"
          trend="up"
          trendValue="+12.8%"
          footer="peak @ 14:00"
          accent="indigo"
          icon={Activity}
          onClick={() => navigate('/trading')}
        />
        <FioriTile
          title="Renewable Share"
          subtitle="Of total dispatched"
          value={`${stats?.renewablePct ?? 74}`}
          unit="%"
          trend="up"
          trendValue="+1.4pp"
          footer="solar dominant"
          accent="green"
          icon={Sun}
          onClick={() => navigate('/grid')}
        />
        <FioriTile
          title="Grid Frequency"
          subtitle="National average"
          value={`${stats?.frequency ?? 49.97}`}
          unit="Hz"
          trend="flat"
          trendValue="stable"
          footer="within tolerance"
          accent="teal"
          icon={Gauge}
          onClick={() => navigate('/grid')}
        />
        <FioriTile
          title="Carbon Saved"
          subtitle="This month"
          value={`${formatCompact(stats?.carbonSaved ?? 42_800)}`}
          unit="tCO₂e"
          trend="up"
          trendValue="+8.1%"
          footer="vs. grid baseline"
          accent="plum"
          icon={Leaf}
          onClick={() => navigate('/carbon')}
        />
        <FioriTile
          title="ESG Score"
          subtitle="Portfolio composite"
          value={`${stats?.esgScore ?? 86}`}
          unit="/ 100"
          trend="up"
          trendValue="+3 pts"
          footer="leader quartile"
          accent="pink"
          icon={ShieldCheck}
          onClick={() => navigate('/esg')}
        />
      </FioriTileGroup>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="fiori-glass lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: '#32363a' }}>
                Energy Market Price
              </h2>
              <p className="text-[12px]" style={{ color: '#6a6d70' }}>
                R / MWh · by source · last 8 months
              </p>
            </div>
            <div className="flex gap-1 rounded-lg p-0.5" style={{ background: '#eff1f2' }}>
              {['6M', '1Y', 'YTD'].map((r, i) => (
                <button
                  key={r}
                  className="h-7 px-3 rounded-md text-[12px] font-semibold transition-colors"
                  style={{
                    background: i === 0 ? '#ffffff' : 'transparent',
                    color: i === 0 ? '#0a6ed1' : '#6a6d70',
                    boxShadow: i === 0 ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={marketData}>
              <defs>
                <linearGradient id="gradSolar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0a6ed1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0a6ed1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradWind" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5d36ff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#5d36ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradHybrid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d7b84" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0d7b84" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7ea" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6a6d70' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6a6d70' }}
                tickFormatter={(v) => `R${v}`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,255,255,0.95)',
                  border: '1px solid #e5e5e5',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(53,74,95,0.12)',
                  fontSize: 12,
                }}
                formatter={(v: number) => [`R${v}/MWh`]}
              />
              <Area
                type="monotone"
                dataKey="solar"
                stroke="#0a6ed1"
                strokeWidth={2}
                fill="url(#gradSolar)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="wind"
                stroke="#5d36ff"
                strokeWidth={2}
                fill="url(#gradWind)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="hybrid"
                stroke="#0d7b84"
                strokeWidth={2}
                fill="url(#gradHybrid)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 pt-2 text-[12px]" style={{ color: '#6a6d70' }}>
            <LegendDot color="#0a6ed1" label="Solar" />
            <LegendDot color="#5d36ff" label="Wind" />
            <LegendDot color="#0d7b84" label="Hybrid" />
          </div>
        </div>

        <div className="fiori-glass p-5">
          <h2 className="text-[16px] font-bold" style={{ color: '#32363a' }}>
            Portfolio Allocation
          </h2>
          <p className="text-[12px] mb-2" style={{ color: '#6a6d70' }}>
            Share of dispatched MWh
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={portfolioData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                stroke="#ffffff"
                strokeWidth={2}
              >
                {portfolioData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,255,255,0.95)',
                  border: '1px solid #e5e5e5',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, n: string) => [`${v}%`, n]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
            {portfolioData.map((p) => (
              <div key={p.name} className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ background: p.color }}
                  />
                  <span style={{ color: '#32363a' }}>{p.name}</span>
                </div>
                <span className="font-semibold" style={{ color: '#32363a' }}>
                  {p.value}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Daily dispatch */}
      <div className="fiori-glass p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[16px] font-bold" style={{ color: '#32363a' }}>
              Dispatch Profile (24h)
            </h2>
            <p className="text-[12px]" style={{ color: '#6a6d70' }}>
              Aggregate generation in MW, last 24 hours
            </p>
          </div>
          <span className="fiori-chip info">
            Peak 1.15 GW @ 14:00
          </span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={volumeData} barSize={24}>
            <defs>
              <linearGradient id="gradBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5d36ff" stopOpacity={1} />
                <stop offset="100%" stopColor="#0a6ed1" stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7ea" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#6a6d70' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#6a6d70' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}`} />
            <Tooltip
              cursor={{ fill: '#f5f6f7' }}
              contentStyle={{
                background: 'rgba(255,255,255,0.95)',
                border: '1px solid #e5e5e5',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => [`${v} MW`]}
            />
            <Bar dataKey="mw" fill="url(#gradBar)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Quick actions */}
      <FioriTileGroup title="Jump to" description="Your most-used workspaces">
        <FioriTile
          variant="feature"
          featureBg="ocean"
          title="Trading Desk"
          subtitle="Place orders & manage positions"
          icon={TrendingUp}
          badge="LIVE"
          footer="Go to Trading"
          onClick={() => navigate('/trading')}
        />
        <FioriTile
          variant="feature"
          featureBg="indigo"
          title="Procurement Hub"
          subtitle="RFPs, bid evaluation, contracts"
          icon={ShoppingCart}
          footer="Open Procurement"
          onClick={() => navigate('/procurement')}
        />
        <FioriTile
          variant="feature"
          featureBg="teal"
          title="IPP Projects"
          subtitle="Pipeline, assets, generation"
          icon={Building2}
          footer="Manage Projects"
          onClick={() => navigate('/projects')}
        />
        <FioriTile
          variant="feature"
          featureBg="sunset"
          title="Carbon & ESG"
          subtitle="Offsets, retirements, scores"
          icon={Leaf}
          footer="View Sustainability"
          onClick={() => navigate('/carbon')}
        />
      </FioriTileGroup>

      {/* Operations */}
      <FioriTileGroup
        title="Operations"
        description="Key assets and processes you own"
      >
        <FioriTile
          title="Active Contracts"
          value={stats?.activeContracts ?? 24}
          subtitle="4 awaiting signature"
          icon={FileText}
          accent="blue"
          footer="View contracts →"
          onClick={() => navigate('/contracts')}
        />
        <FioriTile
          title="Pipeline Stage"
          value={stats?.pipelineProjects ?? 9}
          subtitle="Projects in origination"
          icon={GitBranch}
          accent="indigo"
          footer="View pipeline →"
          onClick={() => navigate('/pipeline')}
        />
        <FioriTile
          title="Settlements"
          value={formatZAR(stats?.settled ?? 18_450_000)}
          subtitle="Cleared last 30 days"
          icon={CircleDollarSign}
          accent="green"
          footer="Settlement log →"
          onClick={() => navigate('/settlement')}
        />
        <FioriTile
          title="Funds AUM"
          value={formatCompact(stats?.aum ?? 1_240_000_000)}
          unit="ZAR"
          subtitle="Open Energy Fund I"
          icon={Coins}
          accent="plum"
          footer="View funds →"
          onClick={() => navigate('/funds')}
        />
        <FioriTile
          title="Grid Congestion"
          value={`${stats?.congestion ?? 3}`}
          subtitle="Active constraint zones"
          icon={Wind}
          accent="amber"
          trend="down"
          trendValue="-2"
          footer="Monitor grid →"
          onClick={() => navigate('/grid')}
        />
        <FioriTile
          title="Compliance"
          value={`${stats?.complianceRate ?? 98}`}
          unit="%"
          subtitle="POPIA + NERSA filings"
          icon={Scale}
          accent="teal"
          trend="up"
          trendValue="+1.2pp"
          footer="Open compliance →"
          onClick={() => navigate('/admin')}
        />
      </FioriTileGroup>
    </div>
  );
}

function HeroKPI({
  label,
  value,
  suffix,
  tint,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  tint: string;
}) {
  return (
    <div className="fiori-hero-kpi">
      <div className="text-[11px] uppercase tracking-widest text-white/70 font-semibold">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className="text-[26px] font-bold tracking-tight"
          style={{ color: tint, textShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
        >
          {value}
        </span>
        {suffix && <span className="text-[12px] text-white/75">{suffix}</span>}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}

function defaultStats() {
  return {
    activeProjects: 12,
    openTrades: 38,
    pendingInvoices: 6,
    totalValue: 2_450_000,
    avgPrice: 1920,
    volume24h: 18_400,
    renewablePct: 74,
    frequency: 49.97,
    carbonSaved: 42_800,
    esgScore: 86,
    activeContracts: 24,
    pipelineProjects: 9,
    settled: 18_450_000,
    aum: 1_240_000_000,
    congestion: 3,
    complianceRate: 98,
  };
}

function heroSubtitleFor(role: string): string {
  switch (role) {
    case 'admin':
      return 'Platform overview across all tenants and markets. Keep an eye on uptime, KYC queue, and trade volume.';
    case 'trader':
      return 'Your trading desk is active. Live order book, positions, and real-time market intel at a glance.';
    case 'ipp_developer':
      return 'Your IPP assets and pipeline projects are operational. Track generation, contracts, and settlements here.';
    case 'carbon_fund':
      return 'Carbon portfolio performance, origination pipeline, and retirement activity in one view.';
    case 'offtaker':
      return 'Your procurement workspace — RFPs, active contracts, consumption and ESG reporting ready to go.';
    case 'lender':
      return 'Credit portfolio at a glance — disbursements, covenants, watchlist and NAV trajectory.';
    case 'grid_operator':
      return 'Live grid status — frequency, congestion, wheeling and imbalance in one dashboard.';
    case 'regulator':
      return 'Market oversight — licensed entities, submissions queue, investigations and audit trail.';
    default:
      return "Here's today's snapshot of your Open Energy workspace.";
  }
}

function primaryActionFor(role: string): { label: string; path: string } {
  switch (role) {
    case 'admin':           return { label: 'Open Admin Console',      path: '/admin' };
    case 'trader':          return { label: 'Open Trading Desk',       path: '/trading' };
    case 'ipp_developer':   return { label: 'Open IPP Projects',       path: '/projects' };
    case 'carbon_fund':     return { label: 'Open Carbon Portfolio',   path: '/carbon' };
    case 'offtaker':        return { label: 'Open Procurement Hub',    path: '/procurement' };
    case 'lender':          return { label: 'Open Credit Portfolio',   path: '/funds' };
    case 'grid_operator':   return { label: 'Open Grid Monitor',       path: '/grid' };
    case 'regulator':       return { label: 'Open Oversight Console',  path: '/admin' };
    default:                return { label: 'Open Contracts',          path: '/contracts' };
  }
}
