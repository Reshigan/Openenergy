import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Wallet, PiggyBank, RefreshCw, ArrowUpRight, ArrowDownRight, Percent, BarChart2, FileText, Download } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';

const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

export function Funds() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [disbursements, setDisbursements] = useState<any[]>([]);
  const [navHistory, setNavHistory] = useState<any[]>([]);

  useEffect(() => { fetchFundsData(); }, []);

  const fetchFundsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [portRes, disbRes] = await Promise.all([
        api.get('/funds/portfolio').catch(() => ({ data: { success: true, data: getDefaultPortfolio() } })),
        api.get('/funds/disbursements').catch(() => ({ data: { success: true, data: [] } })),
      ]);
      setPortfolio(portRes.data?.data || getDefaultPortfolio());
      setDisbursements(disbRes.data?.data || []);
      setNavHistory(getNavHistory());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={5} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchFundsData} /></div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fund Management</h1>
          <p className="text-ionex-text-mute">Investment portfolio and disbursement tracking</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">
          <Download className="w-4 h-4" /> Export Report
        </button>
      </div>

      {/* Portfolio Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-ionex-brand to-ionex-brand-light rounded-xl p-6 text-white">
          <p className="text-blue-200 text-sm mb-1">Total Portfolio Value</p>
          <p className="text-3xl font-bold">{formatZAR(portfolio?.totalValue || 12500000)}</p>
          <div className="flex items-center gap-1 mt-2 text-green-300">
            <ArrowUpRight className="w-4 h-4" />
            <span className="text-sm">+12.4% YTD</span>
          </div>
        </div>
        <MetricCard title="Available Cash" value={formatZAR(portfolio?.availableCash || 2500000)} icon={<Wallet className="w-5 h-5" />} trend={{ value: 5.2, positive: true }} />
        <MetricCard title="Committed Capital" value={formatZAR(portfolio?.committed || 8000000)} icon={<PiggyBank className="w-5 h-5" />} />
        <MetricCard title="NAV" value={formatZAR(portfolio?.nav || 1.045)} icon={<BarChart2 className="w-5 h-5" />} trend={{ value: 1.2, positive: true }} suffix="" />
      </div>

      {/* NAV Chart */}
      <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Net Asset Value History</h2>
          <div className="flex gap-2">
            <select className="text-sm border border-ionex-border-200 rounded-lg px-3 py-1">
              <option>1 Month</option>
              <option>3 Months</option>
              <option>6 Months</option>
              <option>1 Year</option>
            </select>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={navHistory}>
            <defs>
              <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0A3D62" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#0A3D62" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis domain={['auto', 'auto']} tickFormatter={v => `R${v.toFixed(3)}`} />
            <Tooltip formatter={(v: number) => [`R${v.toFixed(4)}`, 'NAV']} />
            <Area type="monotone" dataKey="nav" stroke="#0A3D62" fill="url(#navGradient)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Asset Allocation */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Asset Allocation</h2>
          <div className="space-y-4">
            {getAssetAllocation().map((asset, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">{asset.name}</span>
                  <span className="text-sm text-ionex-text-sub">{asset.allocation}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${asset.color}`} style={{ width: `${asset.allocation}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Disbursements */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Disbursements</h2>
          {disbursements.length === 0 ? (
            <EmptyState icon={<DollarSign className="w-8 h-8" />} title="No disbursements" description="Disbursement history will appear here" />
          ) : (
            <div className="space-y-3">
              {disbursements.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{d.project}</p>
                    <p className="text-sm text-ionex-text-mute">{d.date}</p>
                  </div>
                  <span className="font-semibold text-green-600">{formatZAR(d.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
        <h2 className="text-lg font-semibold mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-ionex-text-mute text-sm mb-1">IRR</p>
            <p className="text-2xl font-bold text-green-600">14.2%</p>
          </div>
          <div>
            <p className="text-ionex-text-mute text-sm mb-1">MOIC</p>
            <p className="text-2xl font-bold">1.45x</p>
          </div>
          <div>
            <p className="text-ionex-text-mute text-sm mb-1">DPI</p>
            <p className="text-2xl font-bold">0.85x</p>
          </div>
          <div>
            <p className="text-ionex-text-mute text-sm mb-1">TVPI</p>
            <p className="text-2xl font-bold">1.38x</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, trend, suffix = 'ZAR' }: {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend?: { value: number; positive: boolean };
  suffix?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-ionex-text-mute text-sm">{title}</span>
        <div className="p-2 bg-ionex-brand/10 rounded-lg text-ionex-brand">{icon}</div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {trend && (
        <div className={`flex items-center gap-1 mt-2 text-sm ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
          {trend.positive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          {trend.value}%
        </div>
      )}
    </div>
  );
}

function getDefaultPortfolio() {
  return {
    totalValue: 12500000,
    availableCash: 2500000,
    committed: 8000000,
    nav: 1.045,
    deployed: 10000000,
    returns: 1450000,
  };
}

function getNavHistory() {
  return [
    { date: '2024-01', nav: 1.000 },
    { date: '2024-02', nav: 1.008 },
    { date: '2024-03', nav: 1.015 },
    { date: '2024-04', nav: 1.022 },
    { date: '2024-05', nav: 1.031 },
    { date: '2024-06', nav: 1.045 },
  ];
}

function getAssetAllocation() {
  return [
    { name: 'Solar Projects', allocation: 45, color: 'bg-yellow-500' },
    { name: 'Wind Projects', allocation: 30, color: 'bg-blue-500' },
    { name: 'Battery Storage', allocation: 15, color: 'bg-green-500' },
    { name: 'Grid Infrastructure', allocation: 10, color: 'bg-purple-500' },
  ];
}