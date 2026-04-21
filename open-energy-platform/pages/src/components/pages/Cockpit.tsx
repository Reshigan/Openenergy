import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Briefcase, FileText, TrendingUp, Users, AlertCircle, Calendar, DollarSign, Zap, ArrowUpRight, ArrowDownRight, ChevronRight, Bell, Settings, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { Skeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { ErrorBanner } from '../ErrorBanner';
import { EntityLink } from '../EntityLink';

const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

// Role-specific sidebar items
const roleSidebarItems: Record<string, { icon: React.ReactNode; label: string; path: string; badge?: string }[]> = {
  admin: [
    { icon: <Users className="w-4 h-4" />, label: 'KYC Queue', path: '/admin' },
    { icon: <Settings className="w-4 h-4" />, label: 'Platform Config', path: '/admin' },
    { icon: <DollarSign className="w-4 h-4" />, label: 'Fee Management', path: '/admin' },
    { icon: <Activity className="w-4 h-4" />, label: 'Analytics', path: '/admin' },
  ],
  ipp_developer: [
    { icon: <Briefcase className="w-4 h-4" />, label: 'My Projects', path: '/projects' },
    { icon: <FileText className="w-4 h-4" />, label: 'Contracts', path: '/contracts' },
    { icon: <Calendar className="w-4 h-4" />, label: 'Disbursements', path: '/projects' },
    { icon: <TrendingUp className="w-4 h-4" />, label: 'Metering', path: '/metering' },
  ],
  trader: [
    { icon: <Zap className="w-4 h-4" />, label: 'Trading', path: '/trading' },
    { icon: <DollarSign className="w-4 h-4" />, label: 'Settlement', path: '/settlement' },
    { icon: <FileText className="w-4 h-4" />, label: 'Invoices', path: '/settlement' },
    { icon: <Activity className="w-4 h-4" />, label: 'Portfolio', path: '/cockpit' },
  ],
  carbon_fund: [
    { icon: <TrendingUp className="w-4 h-4" />, label: 'Portfolio', path: '/fund-dashboard' },
    { icon: <FileText className="w-4 h-4" />, label: 'Credits', path: '/carbon' },
    { icon: <BarChart className="w-4 h-4" />, label: 'Options', path: '/carbon' },
    { icon: <Activity className="w-4 h-4" />, label: 'NAV History', path: '/fund-dashboard' },
  ],
  offtaker: [
    { icon: <Zap className="w-4 h-4" />, label: 'Energy Demand', path: '/trading' },
    { icon: <FileText className="w-4 h-4" />, label: 'Contracts', path: '/contracts' },
    { icon: <TrendingUp className="w-4 h-4" />, label: 'Procurement', path: '/procurement' },
    { icon: <Activity className="w-4 h-4" />, label: 'ESG', path: '/esg' },
  ],
  lender: [
    { icon: <Briefcase className="w-4 h-4" />, label: 'Portfolio', path: '/lender-dashboard' },
    { icon: <DollarSign className="w-4 h-4" />, label: 'Disbursements', path: '/lender-dashboard' },
    { icon: <AlertCircle className="w-4 h-4" />, label: 'Watchlist', path: '/lender-dashboard' },
    { icon: <Activity className="w-4 h-4" />, label: 'Covenant Health', path: '/lender-dashboard' },
  ],
  grid_operator: [
    { icon: <Zap className="w-4 h-4" />, label: 'Grid Status', path: '/grid' },
    { icon: <Activity className="w-4 h-4" />, label: 'Wheeling', path: '/grid' },
    { icon: <Calendar className="w-4 h-4" />, label: 'Metering', path: '/metering' },
    { icon: <AlertCircle className="w-4 h-4" />, label: 'Imbalance', path: '/grid' },
  ],
  regulator: [
    { icon: <FileText className="w-4 h-4" />, label: 'Compliance', path: '/admin' },
    { icon: <Users className="w-4 h-4" />, label: 'Participants', path: '/admin' },
    { icon: <Activity className="w-4 h-4" />, label: 'Market Data', path: '/admin' },
    { icon: <TrendingUp className="w-4 h-4" />, label: 'Reports', path: '/admin' },
  ],
};

// Sample market data
const marketData = [
  { month: 'Jan', price: 1850 },
  { month: 'Feb', price: 1920 },
  { month: 'Mar', price: 1780 },
  { month: 'Apr', price: 2100 },
  { month: 'May', price: 2050 },
  { month: 'Jun', price: 1950 },
];

const portfolioData = [
  { name: 'Active', value: 65, color: '#22c55e' },
  { name: 'Pending', value: 25, color: '#f59e0b' },
  { name: 'Closed', value: 10, color: '#94a3b8' },
];

export function Cockpit() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [intelligence, setIntelligence] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, actionsRes, intelRes] = await Promise.all([
        api.get('/cockpit/stats').catch(() => ({ data: { success: true, data: getDefaultStats() } })),
        api.get('/intelligence/my-items').catch(() => ({ data: { success: true, data: [] } })),
        api.get('/cockpit/morning-briefing').catch(() => ({ data: { success: true, data: { message: 'Configure email for daily briefings' } } })),
      ]);
      setStats(statsRes.data?.data || getDefaultStats());
      setActionItems(actionsRes.data?.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const getDefaultStats = () => ({
    activeProjects: 3,
    pendingInvoices: 2,
    openTrades: 5,
    carbonBalance: 1250,
    totalValue: 2450000,
    esgScore: 78,
  });

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={4} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchDashboardData} /></div>;

  const sidebarItems = roleSidebarItems[user?.role || 'admin'] || roleSidebarItems.admin;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p className="text-ionex-text-mute">Here's your Open Energy overview</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 hover:bg-gray-100 rounded-lg">
            <Bell className="w-5 h-5 text-ionex-text-mute" />
          </button>
          <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg">
            <Settings className="w-5 h-5 text-ionex-text-mute" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Active Projects"
          value={stats?.activeProjects || 0}
          icon={<Briefcase className="w-5 h-5" />}
          trend={{ value: 12, positive: true }}
          color="blue"
        />
        <KPICard
          title="Pending Invoices"
          value={stats?.pendingInvoices || 0}
          icon={<FileText className="w-5 h-5" />}
          trend={{ value: 3, positive: false }}
          color="orange"
        />
        <KPICard
          title="Open Trades"
          value={stats?.openTrades || 0}
          icon={<Zap className="w-5 h-5" />}
          trend={{ value: 8, positive: true }}
          color="green"
        />
        <KPICard
          title="Carbon Balance"
          value={`${stats?.carbonBalance || 0} tCO₂e`}
          icon={<TrendingUp className="w-5 h-5" />}
          color="emerald"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Market Price Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-ionex-border-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Energy Market Price</h2>
            <select className="text-sm border border-ionex-border-200 rounded-lg px-3 py-1">
              <option>Last 6 months</option>
              <option>Last 12 months</option>
              <option>YTD</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={marketData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R${v}`} />
              <Tooltip formatter={(v: number) => [`R${v}/MWh`, 'Price']} />
              <Line type="monotone" dataKey="price" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Portfolio Allocation */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-6">Portfolio Allocation</h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={portfolioData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
              >
                {portfolioData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-4">
            {portfolioData.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-ionex-text-sub">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions Sidebar */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {sidebarItems.map((item, i) => (
              <button
                key={i}
                onClick={() => navigate(item.path)}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-ionex-brand/10 rounded-lg text-ionex-brand">
                    {item.icon}
                  </div>
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            ))}
          </div>
        </div>

        {/* Action Queue */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-ionex-border-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Action Queue</h2>
            <span className="px-2 py-1 bg-ionex-accent/20 text-ionex-accent text-xs font-medium rounded-full">
              {actionItems.length} items
            </span>
          </div>
          {actionItems.length === 0 ? (
            <EmptyState
              icon={<Check className="w-8 h-8 text-green-500" />}
              title="All caught up!"
              description="No pending actions at this time"
            />
          ) : (
            <div className="space-y-3">
              {actionItems.slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className={`p-2 rounded-lg ${getPriorityColor(item.priority)}`}>
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-ionex-text-mute">{item.description}</p>
                  </div>
                  <button className="px-3 py-1 text-xs bg-white border border-ionex-border-200 rounded-lg hover:bg-gray-50">
                    View
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
        <h2 className="text-lg font-semibold mb-6">Financial Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-ionex-text-mute mb-1">Total Portfolio Value</p>
            <p className="text-2xl font-bold">{formatZAR(stats?.totalValue || 0)}</p>
          </div>
          <div>
            <p className="text-sm text-ionex-text-mute mb-1">This Month's P&L</p>
            <p className="text-2xl font-bold text-green-600 flex items-center gap-1">
              <ArrowUpRight className="w-5 h-5" />
              +{formatZAR(125000)}
            </p>
          </div>
          <div>
            <p className="text-sm text-ionex-text-mute mb-1">Pending Settlements</p>
            <p className="text-2xl font-bold">{formatZAR(stats?.pendingSettlements || 450000)}</p>
          </div>
          <div>
            <p className="text-sm text-ionex-text-mute mb-1">ESG Score</p>
            <p className="text-2xl font-bold text-ionex-accent">{stats?.esgScore || 0}/100</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon, trend, color }: { title: string; value: any; icon: React.ReactNode; trend?: { value: number; positive: boolean }; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };

  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl ${colorMap[color]}`}>{icon}</div>
        {trend && (
          <div className={`flex items-center gap-1 text-sm ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.positive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            {trend.value}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm text-ionex-text-mute">{title}</p>
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function getPriorityColor(priority: string) {
  const map: Record<string, string> = {
    high: 'bg-red-100 text-red-600',
    medium: 'bg-yellow-100 text-yellow-600',
    low: 'bg-blue-100 text-blue-600',
  };
  return map[priority] || map.medium;
}
